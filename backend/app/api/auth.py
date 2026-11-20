from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import (User, create_user, verify_password, create_token,
                               get_current_user, ADMIN_ONLY, _locked, record_failure,
                               record_success, ROLES)

router = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=4, max_length=128)
    role: str = "viewer"


class RolePatch(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)


def _out(u: User):
    return {"id": u.id, "username": u.username, "role": u.role,
            "is_active": u.is_active, "created_at": str(u.created_at)}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    wait = _locked(username)
    if wait:
        raise HTTPException(429, f"Too many failed attempts — try again in {wait}s.")
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(body.password, user):
        record_failure(username)
        raise HTTPException(401, "Wrong username or password.")
    if not user.is_active:
        raise HTTPException(403, "Account is disabled — contact an admin.")
    record_success(username)
    return {"access_token": create_token(user), "token_type": "bearer",
            "username": user.username, "role": user.role}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return _out(user)


@router.get("/users")
def list_users(_: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)):
    return {"users": [_out(u) for u in db.query(User).order_by(User.id).all()],
            "roles": list(ROLES)}


@router.post("/users")
def add_user(body: UserIn, _: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username.strip().lower()).first():
        raise HTTPException(409, "Username already exists.")
    return _out(create_user(db, body.username, body.password, body.role))


@router.patch("/users/{uid}")
def edit_user(uid: int, body: RolePatch, me_: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == uid).first()
    if not u:
        raise HTTPException(404, "User not found.")
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(400, f"Unknown role: {body.role}")
        if u.username == "admin" and body.role != "admin":
            raise HTTPException(400, "The built-in admin cannot be demoted.")
        u.role = body.role
    if body.is_active is not None:
        if u.username == "admin" and body.is_active is False:
            raise HTTPException(400, "The built-in admin cannot be disabled.")
        u.is_active = body.is_active
    if body.password:
        from app.core.security import hash_password
        import secrets
        salt = secrets.token_bytes(16)
        u.salt_hex, u.hash_hex = salt.hex(), hash_password(body.password, salt)
    if u.id == me_.id and (body.is_active is False or (body.role and body.role != "admin")):
        raise HTTPException(400, "You cannot remove your own admin access.")
    db.commit()
    db.refresh(u)
    return _out(u)


@router.delete("/users/{uid}")
def del_user(uid: int, me_: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == uid).first()
    if not u:
        raise HTTPException(404, "User not found.")
    if u.username == "admin" or u.id == me_.id:
        raise HTTPException(400, "This account cannot be deleted.")
    db.delete(u)
    db.commit()
    return {"ok": True}
