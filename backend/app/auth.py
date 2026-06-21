import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Cookie, Depends, HTTPException, Request

from app.db import get_user_by_id

ALGORITHM = "HS256"
COOKIE_NAME = "sf_token"
TOKEN_DAYS = 30


def _secret() -> str:
    key = os.getenv("JWT_SECRET", "").strip()
    if not key:
        key = "dev-only-change-me-in-production"
    return key


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


class CurrentUser:
    def __init__(self, id: int, email: str):
        self.id = id
        self.email = email


def _user_from_payload(payload: dict) -> CurrentUser | None:
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        return None
    user = get_user_by_id(int(user_id))
    if not user or user["email"] != email:
        return None
    return CurrentUser(id=user["id"], email=user["email"])


def get_current_user(
    request: Request,
    sf_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> CurrentUser:
    token = sf_token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip()

    if not token:
        raise HTTPException(401, "Not authenticated. Please sign in.")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Session expired. Please sign in again.")

    user = _user_from_payload(payload)
    if not user:
        raise HTTPException(401, "Invalid session. Please sign in again.")
    return user
