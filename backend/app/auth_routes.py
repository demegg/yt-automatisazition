from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field

from app.auth import (
    COOKIE_NAME,
    TOKEN_DAYS,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
    CurrentUser,
)
from app.db import create_user, get_user_by_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=TOKEN_DAYS * 86400,
        samesite="lax",
        path="/",
    )


@router.post("/register")
def register(body: RegisterRequest, response: Response) -> dict:
    if get_user_by_email(body.email):
        raise HTTPException(400, "An account with this email already exists")

    user_id = create_user(body.email, hash_password(body.password))
    token = create_access_token(user_id, body.email)
    _set_auth_cookie(response, token)
    return {"access_token": token, "user": {"id": user_id, "email": body.email}}


@router.post("/login")
def login(body: LoginRequest, response: Response) -> dict:
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token(user["id"], user["email"])
    _set_auth_cookie(response, token)
    return {"access_token": token, "user": {"id": user["id"], "email": user["email"]}}


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {"id": user.id, "email": user.email}
