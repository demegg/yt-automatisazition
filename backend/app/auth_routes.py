import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.auth import (
    COOKIE_NAME,
    TOKEN_DAYS,
    CurrentUser,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db import GUEST_EMAIL, create_user, get_user_by_email, update_password_hash

router = APIRouter(prefix="/api/auth", tags=["auth"])

_attempts: dict[str, list[float]] = defaultdict(list)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate_limit(request: Request, bucket: str, limit: int = 20) -> None:
    now = time.time()
    key = f"{bucket}:{_client_key(request)}"
    recent = [stamp for stamp in _attempts[key] if now - stamp < 60]
    if len(recent) >= limit:
        _attempts[key] = recent
        raise HTTPException(429, "Too many attempts. Wait a minute and try again.")
    recent.append(now)
    _attempts[key] = recent


def _cookie_secure() -> bool:
    if os.getenv("COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}:
        return True
    return os.getenv("BACKEND_URL", "").strip().lower().startswith("https://")


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=TOKEN_DAYS * 86400,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )


@router.post("/register")
def register(body: RegisterRequest, request: Request, response: Response) -> dict:
    _rate_limit(request, "register")
    email = body.email.lower().strip()
    if email == GUEST_EMAIL:
        raise HTTPException(400, "Choose a different email")
    if get_user_by_email(email):
        raise HTTPException(400, "An account with this email already exists")

    user_id = create_user(email, hash_password(body.password))
    token = create_access_token(user_id, email)
    _set_auth_cookie(response, token)
    return {"access_token": token, "user": {"id": user_id, "email": email}}


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response) -> dict:
    _rate_limit(request, "login", limit=10)
    email = body.email.lower().strip()
    user = get_user_by_email(email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token(user["id"], user["email"])
    _set_auth_cookie(response, token)
    return {
        "access_token": token,
        "user": {"id": user["id"], "email": user["email"]},
    }


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "guest": user.email == GUEST_EMAIL,
    }


@router.post("/password")
def change_password(
    body: PasswordChangeRequest,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    _rate_limit(request, "password", limit=5)
    if user.email == GUEST_EMAIL:
        raise HTTPException(400, "Guest sessions have no password. Create an account.")
    record = get_user_by_email(user.email)
    if not record or not verify_password(body.current_password, record["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    update_password_hash(user.id, hash_password(body.new_password))
    return {"ok": True}
