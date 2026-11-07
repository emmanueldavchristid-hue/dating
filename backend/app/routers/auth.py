import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.adapters import mail
from app.config import get_settings
from app.deps import DB
from app.errors import ApiError
from app.models import PasswordReset, User, UserPreferences
from app.ratelimit import limit
from app.schemas import ForgotIn, ForgotOut, LoginIn, RegisterIn, ResetIn, TokenOut
from app.security import create_token, hash_password, verify_password
from app.services.users import user_out

router = APIRouter(prefix="/auth", tags=["auth"])
auth_limit = Depends(limit("auth", get_settings().auth_rate_limit_per_minute))


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[auth_limit])
def register(body: RegisterIn, db: DB):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise ApiError(409, "conflict", "Un compte existe déjà avec cet e-mail")
    user = User(
        email=email, password_hash=hash_password(body.password), display_name=body.display_name, plan_code="free"
    )
    user.preferences = UserPreferences()
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user.id), user=user_out(user))


@router.post("/login", response_model=TokenOut, dependencies=[auth_limit])
def login(body: LoginIn, db: DB):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise ApiError(401, "invalid_credentials", "E-mail ou mot de passe incorrect")
    return TokenOut(access_token=create_token(user.id), user=user_out(user))


RESET_TTL = timedelta(minutes=15)
RESET_MAX_ATTEMPTS = 5


def _code_hash(code: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), code.encode(), hashlib.sha256).hexdigest()


@router.post("/password/forgot", response_model=ForgotOut, status_code=202, dependencies=[auth_limit])
def forgot_password(body: ForgotIn, db: DB):
    """Envoie un code à 6 chiffres. Même réponse que le compte existe ou non (pas de fuite d'information)."""
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if user and user.is_active:
        code = f"{secrets.randbelow(1_000_000):06d}"
        db.add(PasswordReset(user_id=user.id, code_hash=_code_hash(code), expires_at=datetime.now(UTC) + RESET_TTL))
        db.commit()
        name = get_settings().app_name
        mail.send(
            user.email,
            f"{name} : ton code pour changer de mot de passe",
            f"Bonjour {user.display_name},\n\nTon code : {code}\nIl est valable 15 minutes.\n\n"
            "Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.",
        )
    return ForgotOut(delivery=mail.delivery_mode())


@router.post("/password/reset", response_model=TokenOut, dependencies=[auth_limit])
def reset_password(body: ResetIn, db: DB):
    invalid = ApiError(400, "invalid_code", "Code incorrect ou expiré. Demande un nouveau code.")
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not user.is_active:
        raise invalid
    reset = db.scalar(
        select(PasswordReset)
        .where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
        .order_by(PasswordReset.created_at.desc())
    )
    if not reset or reset.expires_at < datetime.now(UTC) or reset.attempts >= RESET_MAX_ATTEMPTS:
        raise invalid
    if not hmac.compare_digest(reset.code_hash, _code_hash(body.code)):
        reset.attempts += 1
        db.commit()
        raise invalid
    reset.used_at = datetime.now(UTC)
    user.password_hash = hash_password(body.password)
    db.commit()
    return TokenOut(access_token=create_token(user.id), user=user_out(user))
