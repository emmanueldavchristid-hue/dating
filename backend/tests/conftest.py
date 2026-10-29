"""Tests d'intégration sur une vraie base PostgreSQL/PostGIS (TEST_DATABASE_URL), migrée puis peuplée avec la démo."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://sortie:sortie@localhost:5432/sortie_test")
os.environ["DATABASE_URL"] = TEST_DB
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ["LLM_PROVIDER"] = "none"
os.environ["ROUTING_PROVIDER"] = "none"
os.environ["PAYMENTS_PROVIDER"] = "none"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

PASSWORD = "Demo-2026!"


@pytest.fixture(scope="session", autouse=True)
def database():
    env = {**os.environ, "DATABASE_URL": TEST_DB}
    run = lambda *a: subprocess.run([sys.executable, *a], cwd=ROOT, env=env, check=True, capture_output=True)  # noqa: E731
    run("-m", "alembic", "downgrade", "base")
    run("-m", "alembic", "upgrade", "head")
    run("-m", "app.seed", "--demo")
    yield


@pytest.fixture(autouse=True)
def _reset_limits():
    limiter.reset()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def login(client, email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def free_h(client):
    return login(client, "user@sortie.demo")


@pytest.fixture
def insider_h(client):
    return login(client, "insider@sortie.demo")


@pytest.fixture
def admin_h(client):
    return login(client, "admin@sortie.demo")


@pytest.fixture
def new_user(client):
    import uuid

    email = f"t{uuid.uuid4().hex[:10]}@example.com"
    r = client.post(
        "/api/v1/auth/register", json={"email": email, "password": "motdepasse-solide", "display_name": "Testeur"}
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, email
