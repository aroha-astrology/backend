"""Tests for backward-compatible TS backend endpoints."""

import pytest
from app.main import create_app

try:
    from fastapi.testclient import TestClient
except ImportError:
    pytest.skip("TestClient not available", allow_module_level=True)


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


class TestAuthSession:
    def test_create_session_returns_user(self, client):
        r = client.post("/v1/auth/session")
        assert r.status_code == 200
        data = r.json()
        assert "user" in data
        assert "created" in data
        assert data["user"]["firebaseUid"] is not None

    def test_create_session_idempotent(self, client):
        r1 = client.post("/v1/auth/session")
        r2 = client.post("/v1/auth/session")
        assert r1.json()["user"]["id"] == r2.json()["user"]["id"]
        assert r2.json()["created"] is False


class TestMe:
    def test_get_me(self, client):
        client.post("/v1/auth/session")
        r = client.get("/v1/me")
        assert r.status_code == 200
        assert r.json()["firebaseUid"] is not None

    def test_patch_me(self, client):
        client.post("/v1/auth/session")
        r = client.patch("/v1/me", json={
            "displayName": "Test User",
            "gender": "male",
            "dateOfBirth": "1990-08-15",
            "timeOfBirth": "07:30",
            "placeOfBirth": {"name": "Delhi", "lat": 28.6139, "lon": 77.209, "tz": "Asia/Kolkata"},
        })
        assert r.status_code == 200
        data = r.json()
        assert data["displayName"] == "Test User"
        assert data["profileCompletedAt"] is not None

    def test_delete_me(self, client):
        client.post("/v1/auth/session")
        r = client.delete("/v1/me")
        assert r.status_code == 204


class TestHealthCompat:
    def test_healthz(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_readyz(self, client):
        r = client.get("/readyz")
        assert r.status_code == 200
        assert r.json()["checks"]["db"] == "ok"
