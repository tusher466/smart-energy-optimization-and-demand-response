"""Authentication + role-based access control.

Security design (demo-grade but real):
- Passwords: PBKDF2-HMAC-SHA256, 200k iterations, unique 16-byte salt per user.
  Only salt+hash are stored — never plaintext, never reversible.
- Sessions: HS256 JWT, 12 h expiry (configurable), signed with SECRET_KEY from
  env. Role is embedded in the token AND re-checked against the DB on each
  request, so demoting a user takes effect immediately.
- Brute force: in-memory lockout — 5 failed logins lock the account for 5 min.
- Every mutating endpoint declares the roles it accepts via require_roles();
  viewers are read-only by construction. The Admin role alone manages users and
  destructive actions (seed/reset).
"""
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import Session

from app.core.db import Base, SessionLocal, get_db
from app.core.config import get_settings

ROLES = ("viewer", "manager", "operator", "admin")
# higher number = more power; used by the frontend to gate buttons
RANK = {"viewer": 1, "manager": 2, "operator": 3, "admin": 4}

bearer = HTTPBearer(auto_error=False)

# username -> [fail_count, locked_until_ts]
_login_attempts: dict = {}


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, index=True)
    salt_hex = Column(String(64))
    hash_hex = Column(String(128))
    role = Column(String(16), default="viewer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


DEFAULT_USERS = [
    ("admin", "admin123", "admin"),
    ("operator", "op123", "operator"),
    ("manager", "mgr123", "manager"),
    ("viewer", "view123", "viewer"),
]


def hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000).hex()


def create_user(db: Session, username: str, password: str, role: str) -> User:
    if role not in ROLES:
        raise ValueError(f"Unknown role: {role}")
    salt = secrets.token_bytes(16)
    u = User(username=username.strip().lower(), salt_hex=salt.hex(),
             hash_hex=hash_password(password, salt), role=role, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def verify_password(password: str, user: User) -> bool:
    expect = hash_password(password, bytes.fromhex(user.salt_hex))
    return hmac.compare_digest(expect, user.hash_hex)


def ensure_default_users():
    db = SessionLocal()
    try:
        for username, password, role in DEFAULT_USERS:
            if not db.query(User).filter(User.username == username).first():
                create_user(db, username, password, role)
    finally:
        db.close()


def _locked(username: str) -> Optional[int]:
    fails, until = _login_attempts.get(username, (0, 0))
    if until and time.time() < until:
        return int(until - time.time())
    return None


def record_failure(username: str):
    fails, _ = _login_attempts.get(username, (0, 0))
    fails += 1
    until = time.time() + 300 if fails >= 5 else 0
    _login_attempts[username] = (fails, until)


def record_success(username: str):
    _login_attempts.pop(username, None)


def create_token(user: User) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(hours=s.token_hours)
    return jwt.encode({"sub": user.username, "role": user.role, "exp": exp},
                      s.secret_key, algorithm="HS256")


def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
                     db: Session = Depends(get_db)) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required.")
    try:
        payload = jwt.decode(creds.credentials, get_settings().secret_key, algorithms=["HS256"])
        username = payload.get("sub", "")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired — please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session — please log in again.")
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is disabled.")
    return user


def require_roles(*roles: str):
    """Endpoint dependency: only these roles may call it (viewers read-only by default)."""
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"Requires role: {' or '.join(roles)} (you are '{user.role}').")
        return user
    return dep


def verify_query_token(token: Optional[str]) -> User:
    """Auth for SSE streams (EventSource cannot send headers) via ?token=."""
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required (?token=).")
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        username = payload.get("sub", "")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is disabled.")
        return user
    finally:
        db.close()


ADMIN_ONLY = require_roles("admin")
OPERATE = require_roles("operator", "admin")
COMPUTE = require_roles("manager", "operator", "admin")
ANY_AUTH = require_roles("viewer", "manager", "operator", "admin")
