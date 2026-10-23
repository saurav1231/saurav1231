"""Tests run against a separate database (ayana_test) that is rebuilt for every test run.
Set TEST_DATABASE_URL to point somewhere else."""
import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "mysql+pymysql://ayana:ayana_pass@localhost:3306/ayana_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ["PAYMENT_MODE"] = "mock"
os.environ["UPLOAD_DIR"] = "/tmp/ayana-test-uploads"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.db import Base, engine  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    url = make_url(os.environ["DATABASE_URL"])
    server = create_engine(url.set(database=""))
    with server.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS `{url.database}`"))
        c.execute(text(f"CREATE DATABASE `{url.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
    Base.metadata.create_all(engine)
    from scripts import seed

    seed.main()
    yield


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_token(client):
    r = client.post("/api/auth/login", json={"email": "admin@ayana.travel", "password": "Admin@12345"})
    return r.json()["token"]


@pytest.fixture
def user_token(client):
    import secrets

    r = client.post("/api/auth/register", json={"name": "Test Pilgrim", "email": f"t{secrets.token_hex(4)}@ayana.test.in",
                                                "password": "password123"})
    assert r.status_code == 201, r.text
    return r.json()["token"]
