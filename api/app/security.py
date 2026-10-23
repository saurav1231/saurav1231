"""Passwords, login tokens (JWT), "who is calling" dependencies and a simple rate limit."""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .errors import HttpError, forbidden, unauthorized
from .models import ADMIN, User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    s = get_settings()
    payload = {"sub": user.id, "role": user.role, "exp": datetime.now(timezone.utc) + timedelta(days=s.jwt_expires_days)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    """Requires 'Authorization: Bearer <token>'. Returns the logged-in user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized()
    try:
        payload = jwt.decode(authorization[7:], get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise unauthorized("Session expired, please log in again")
    user = db.get(User, payload.get("sub"))
    if not user:
        raise unauthorized()
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != ADMIN:
        raise forbidden("Admins only")
    return user


# 50 login/register attempts per IP per 15 minutes (in memory; enough for one server)
_hits: dict[str, deque] = defaultdict(deque)


def auth_rate_limit(request: Request, limit: int = 50, window: int = 15 * 60):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HttpError(429, "Too many attempts. Please wait a few minutes.")
    q.append(now)
