"""Tests for Vimshottari Dasha calculations.

Golden values match the TS astro-engine vimshottari.test.ts test suite.
"""

import pytest
from datetime import datetime, timezone

from app.tools.vimshottari import (
    VIMSHOTTARI_ORDER,
    VIMSHOTTARI_YEARS,
    VIMSHOTTARI_TOTAL_YEARS,
    NAKSHATRA_SPAN,
    calculate_vimshottari_dasha,
)

BIRTH_DATE = datetime(1990, 1, 15, 6, 0, 0, tzinfo=timezone.utc)
MS_PER_YEAR = 365.25 * 86_400_000


def _duration_years(period) -> float:
    ms = (period.end_date.timestamp() - period.start_date.timestamp()) * 1000
    return ms / MS_PER_YEAR


class TestTotalDuration:
    def test_mahadashas_span_120_years(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        total = sum(_duration_years(md) for md in result.mahadashas)
        assert abs(total - 120) < 1

    def test_vimshottari_years_sum_to_120(self):
        assert sum(VIMSHOTTARI_YEARS.values()) == 120


class TestDashaOrder:
    def test_follows_standard_order_from_birth_nakshatra(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        planets = [md.planet for md in result.mahadashas]
        assert planets[0] == "Ketu"
        for i in range(1, len(planets)):
            expected_idx = (VIMSHOTTARI_ORDER.index(planets[0]) + i) % 9
            assert planets[i] == VIMSHOTTARI_ORDER[expected_idx]


class TestKnownChart:
    def test_moon_at_0_first_dasha_is_ketu(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        assert result.mahadashas[0].planet == "Ketu"

    def test_moon_at_0_full_7_year_ketu_balance(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        years = _duration_years(result.mahadashas[0])
        assert abs(years - 7) < 0.5

    def test_moon_near_end_of_ashwini_near_zero_balance(self):
        moon_long = NAKSHATRA_SPAN - 0.01
        result = calculate_vimshottari_dasha(moon_long, BIRTH_DATE)
        years = _duration_years(result.mahadashas[0])
        assert years < 0.1

    def test_moon_at_bharani_midpoint_venus_half_balance(self):
        result = calculate_vimshottari_dasha(20, BIRTH_DATE)
        assert result.mahadashas[0].planet == "Venus"
        years = _duration_years(result.mahadashas[0])
        assert abs(years - 10) < 1


class TestNoGaps:
    def test_consecutive_mahadashas_are_contiguous(self):
        result = calculate_vimshottari_dasha(45, BIRTH_DATE)
        for i in range(len(result.mahadashas) - 1):
            current_end = result.mahadashas[i].end_date.timestamp()
            next_start = result.mahadashas[i + 1].start_date.timestamp()
            assert abs(current_end - next_start) < 0.001

    def test_first_dasha_starts_at_birth(self):
        result = calculate_vimshottari_dasha(45, BIRTH_DATE)
        assert abs(
            result.mahadashas[0].start_date.timestamp() - BIRTH_DATE.timestamp()
        ) < 0.001


class TestSubPeriods:
    def test_active_mahadasha_has_9_subperiods(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        active = next((m for m in result.mahadashas if m.is_active), None)
        if active and active.sub_periods:
            assert len(active.sub_periods) == 9

    def test_subperiods_proportionally_divided(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        active = next((m for m in result.mahadashas if m.is_active), None)
        if active and len(active.sub_periods) == 9:
            parent_ms = (active.end_date.timestamp() - active.start_date.timestamp()) * 1000
            for sub in active.sub_periods:
                sub_ms = (sub.end_date.timestamp() - sub.start_date.timestamp()) * 1000
                expected_ratio = VIMSHOTTARI_YEARS[sub.planet] / 120
                actual_ratio = sub_ms / parent_ms
                assert abs(actual_ratio - expected_ratio) < 0.01

    def test_antardasha_starts_with_parent_planet(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        active = next((m for m in result.mahadashas if m.is_active), None)
        if active and active.sub_periods:
            assert active.sub_periods[0].planet == active.planet


class TestFiveLevels:
    def test_active_branch_has_5_levels(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        active_md = next((m for m in result.mahadashas if m.is_active), None)
        if not active_md:
            return
        assert active_md.level == "mahadasha"

        active_ad = next((s for s in active_md.sub_periods if s.is_active), None)
        if not active_ad:
            return
        assert active_ad.level == "antardasha"

        active_pad = next((s for s in active_ad.sub_periods if s.is_active), None)
        if not active_pad:
            return
        assert active_pad.level == "pratyantardasha"

        active_sookshma = next((s for s in active_pad.sub_periods if s.is_active), None)
        if not active_sookshma:
            return
        assert active_sookshma.level == "sookshma"

        active_prana = next((s for s in active_sookshma.sub_periods if s.is_active), None)
        if not active_prana:
            return
        assert active_prana.level == "prana"


class TestEdgeCases:
    def test_moon_at_360_wraps_to_0(self):
        result = calculate_vimshottari_dasha(360, BIRTH_DATE)
        assert result.mahadashas[0].planet == "Ketu"

    def test_moon_negative_wraps(self):
        result = calculate_vimshottari_dasha(-10, BIRTH_DATE)
        assert len(result.mahadashas) > 0

    def test_current_periods_present(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        assert result.current_mahadasha is not None
        assert result.current_antardasha is not None
        assert result.current_pratyantardasha is not None

    def test_as_dict_serializable(self):
        result = calculate_vimshottari_dasha(0, BIRTH_DATE)
        d = result.as_dict()
        import json
        json.dumps(d)  # must not raise
