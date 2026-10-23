"""Database connection. One engine for the whole app; one session per request."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,  # reconnect if MySQL closed an idle connection
    pool_recycle=3600,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: gives each request its own session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
