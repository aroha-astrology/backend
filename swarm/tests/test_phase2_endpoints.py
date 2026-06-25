"""Tests for Phase 2 endpoints: /v1/forecast/daily and /v1/matchmaking."""

import pytest

from app.main import create_app

try:
    from fastapi.testclient import TestClient
except ImportError:
    pytest.skip("TestClient not available", allow_module_level=True)

SAMPLE_BIRTH = {
    "date": "1990-08-15", "time": "07:30",
    "latitude": 28.6139, "longitude": 77.2090, "timezone": "Asia/Kolkata",
}

SAMPLE_BIRTH_2 = {
    "date": "1992-03-22", "time": "14:15",
    "latitude": 19.076, "longitude": 72.8777, "timezone": "Asia/Kolkata",
}


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


class TestDailyForecast:
    def test_returns_200(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": True})
        assert r.status_code == 200

    def test_has_metrology_synthesis_atmosphere(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": True})
        data = r.json()
        assert data["metrology"] is not None
        assert data["synthesis"] is not None
        assert data["atmosphere"] is not None

    def test_has_findings(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": True})
        data = r.json()
        assert len(data["findings"]) > 0

    def test_ashtakavarga_in_atmosphere(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": True})
        atmo = r.json()["atmosphere"]
        assert "ashtakavarga" in atmo
        assert 250 <= atmo["ashtakavarga"]["sarva"]["total"] <= 400

    def test_dasha_in_synthesis(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": True})
        synth = r.json()["synthesis"]
        assert synth["currentDasha"]["mahadasha"] is not None

    def test_consent_denied_403(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": False})
        assert r.status_code == 403


class TestMatchmaking:
    def test_returns_200(self, client):
        r = client.post("/v1/matchmaking", json={
            "person1": SAMPLE_BIRTH, "person2": SAMPLE_BIRTH_2, "consent": True,
        })
        assert r.status_code == 200

    def test_has_8_kootas(self, client):
        r = client.post("/v1/matchmaking", json={
            "person1": SAMPLE_BIRTH, "person2": SAMPLE_BIRTH_2, "consent": True,
        })
        data = r.json()
        assert len(data["compatibility"]["scores"]) == 8

    def test_total_not_exceeds_36(self, client):
        r = client.post("/v1/matchmaking", json={
            "person1": SAMPLE_BIRTH, "person2": SAMPLE_BIRTH_2, "consent": True,
        })
        data = r.json()
        assert 0 <= data["compatibility"]["totalScore"] <= 36

    def test_has_overall_compatibility(self, client):
        r = client.post("/v1/matchmaking", json={
            "person1": SAMPLE_BIRTH, "person2": SAMPLE_BIRTH_2, "consent": True,
        })
        data = r.json()
        assert data["compatibility"]["overallCompatibility"] in (
            "excellent", "good", "average", "below_average", "poor",
        )

    def test_consent_denied_403(self, client):
        r = client.post("/v1/matchmaking", json={
            "person1": SAMPLE_BIRTH, "person2": SAMPLE_BIRTH_2, "consent": False,
        })
        assert r.status_code == 403
