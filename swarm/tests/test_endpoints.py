"""Endpoint + compliance tests (Phase 0)."""

from __future__ import annotations

from tests.conftest import SAMPLE_BIRTH


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_ready_engine_ok(client):
    r = client.get("/health/ready")
    body = r.json()
    assert body["checks"]["engine"] == "ok"
    assert r.status_code == 200


def test_onboarding_returns_chart(client):
    r = client.post("/v1/onboarding", json={"birth": SAMPLE_BIRTH, "consent": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "onboarding"
    assert body["requestId"]
    metro = body["metrology"]
    assert metro is not None
    # 9 grahas, each with a whole-sign house 1..12
    planets = metro["planets"]
    assert len(planets) == 9
    names = {p["planet"] for p in planets}
    assert "Ketu" in names and "Rahu" in names
    for p in planets:
        assert 1 <= p["house"] <= 12
    assert "ascendant" in metro
    assert metro["engineVersion"]["ayanamsa"] == "lahiri"


def test_onboarding_consent_denied_blocks_processing(client):
    # explicit consent=False must 403 before any computation
    r = client.post("/v1/onboarding", json={"birth": SAMPLE_BIRTH, "consent": False})
    assert r.status_code == 403
    assert "consent" in r.text.lower()
