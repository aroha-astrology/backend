"""Shared pytest fixtures."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(create_app())


# A stable reference birth: 1990-08-15 07:30 IST, New Delhi.
SAMPLE_BIRTH = {
    "date": "1990-08-15",
    "time": "07:30",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timezone": "Asia/Kolkata",
}
