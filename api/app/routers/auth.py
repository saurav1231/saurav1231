"""POST /api/auth/register, POST /api/auth/login, GET /api/auth/me"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import conflict, unauthorized
from ..models import User
from ..schemas import LoginIn, RegisterIn
from ..security import auth_rate_limit, check_password, create_token, current_user, hash_password
from ..serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(auth_rate_limit)])


@router.post("/register", status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise conflict("An account with this email already exists")
    user = User(name=data.name, email=email, phone=data.phone, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not check_password(data.password, user.password_hash):
        raise unauthorized("Wrong email or password")
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"user": user_out(user)}
