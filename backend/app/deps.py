from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError, forbidden
from app.models import User
from app.security import decode_token

DB = Annotated[Session, Depends(get_db)]


def _user_from_header(db: Session, authorization: str | None) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    user_id = decode_token(authorization.split(" ", 1)[1].strip())
    if not user_id:
        raise ApiError(401, "invalid_token", "Session invalide ou expirée")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise ApiError(401, "invalid_token", "Session invalide ou expirée")
    return user


def optional_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> User | None:
    return _user_from_header(db, authorization)


def current_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> User:
    user = _user_from_header(db, authorization)
    if not user:
        raise ApiError(401, "not_authenticated", "Connexion requise")
    return user


def require_role(*roles: str):
    def dependency(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise forbidden("Droits insuffisants")
        return user

    return dependency


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(require_role("admin"))]
StaffUser = Annotated[User, Depends(require_role("admin", "curator"))]
