from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB
from app.errors import ApiError
from app.models import User, UserPreferences
from app.ratelimit import limit
from app.schemas import LoginIn, RegisterIn, TokenOut
from app.security import create_token, hash_password, verify_password
from app.services.users import user_out

router = APIRouter(prefix="/auth", tags=["auth"])
auth_limit = Depends(limit("auth", get_settings().auth_rate_limit_per_minute))


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[auth_limit])
def register(body: RegisterIn, db: DB):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise ApiError(409, "conflict", "Un compte existe déjà avec cet e-mail")
    user = User(email=email, password_hash=hash_password(body.password), display_name=body.display_name, plan_code="free")
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
