import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient
import pytest
from app.main import create_app
from app.core.db import Base, engine


@pytest.fixture(scope="session")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app = create_app()
    with TestClient(app) as c:
        # default to admin so existing module tests exercise the happy path
        r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200, r.text
        c.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
        yield c


def _login(client, username: str, password: str) -> str:
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def viewer_headers(client):
    return {"Authorization": f"Bearer {_login(client, 'viewer', 'view123')}"}


@pytest.fixture(scope="session")
def manager_headers(client):
    return {"Authorization": f"Bearer {_login(client, 'manager', 'mgr123')}"}


@pytest.fixture(scope="session")
def operator_headers(client):
    return {"Authorization": f"Bearer {_login(client, 'operator', 'op123')}"}
