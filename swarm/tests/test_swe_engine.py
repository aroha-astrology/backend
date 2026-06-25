"""Deterministic-tool tests for the Swiss Ephemeris engine.

These assert internal consistency + known structural facts (sign/nakshatra
decomposition, Ketu = Rahu + 180, whole-sign house math). Exact golden longitudes
cross-checked against the TS astro-engine are added when that port lands; here we
pin the invariants that must always hold.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.tools import swe_engine
from tests.conftest import SAMPLE_BIRTH


def _jd_for_sample() -> float:
    # 1990-08-15 07:30 IST == 02:00 UTC
    dt = datetime(1990, 8, 15, 2, 0, tzinfo=timezone.utc)
    return swe_engine.to_julian_day(dt)


def test_to_julian_day_is_finite():
    jd = _jd_for_sample()
    assert isinstance(jd, float)
    assert 2_440_000 < jd < 2_500_000  # sane 20th/21st-century range


def test_nine_grahas_present():
    positions = swe_engine.get_sidereal_longitudes(_jd_for_sample())
    assert set(positions) == {
        "Sun", "Moon", "Mars", "Mercury", "Jupiter",
        "Venus", "Saturn", "Rahu", "Ketu",
    }


def test_longitudes_in_range_and_decomposition_consistent():
    positions = swe_engine.get_sidereal_longitudes(_jd_for_sample())
    for pos in positions.values():
        assert 0.0 <= pos.longitude < 360.0
        assert 0 <= pos.sign_index < 12
        assert 0.0 <= pos.sign_degree < 30.0
        assert 0 <= pos.nakshatra_index < 27
        # longitude must reconstruct from sign_index * 30 + sign_degree
        assert abs((pos.sign_index * 30 + pos.sign_degree) - pos.longitude) < 1e-6


def test_ketu_is_180_from_rahu():
    positions = swe_engine.get_sidereal_longitudes(_jd_for_sample())
    diff = (positions["Ketu"].longitude - positions["Rahu"].longitude) % 360.0
    assert abs(diff - 180.0) < 1e-6


def test_houses_and_whole_sign_placement():
    jd = _jd_for_sample()
    houses = swe_engine.calculate_houses(jd, SAMPLE_BIRTH["latitude"], SAMPLE_BIRTH["longitude"])
    assert 0.0 <= houses.ascendant < 360.0
    assert 0 <= houses.ascendant_sign_index < 12
    # Whole-sign: ascendant sign is house 1.
    assert swe_engine.house_of(houses.ascendant_sign_index, houses.ascendant_sign_index) == 1
    # The sign before the ascendant is house 12.
    prev = (houses.ascendant_sign_index - 1) % 12
    assert swe_engine.house_of(prev, houses.ascendant_sign_index) == 12


def test_determinism():
    a = swe_engine.get_sidereal_longitudes(_jd_for_sample())
    b = swe_engine.get_sidereal_longitudes(_jd_for_sample())
    assert a["Sun"].longitude == b["Sun"].longitude
