"""Tests for divisional chart (varga) calculations.

Golden values derived from the TS astro-engine's divisionalCharts.ts tests and
the standard Parashara rules. All math is deterministic.
"""

import pytest

from app.tools.varga import (
    DIVISIONAL_CALCULATORS,
    calc_d1, calc_d2, calc_d3, calc_d4, calc_d9,
    calc_d10, calc_d12, calc_d16, calc_d27, calc_d30,
    calc_d60,
)
from app.tools.swe_engine import SIGNS


class TestD1Rashi:
    def test_aries_range(self):
        assert calc_d1(0) == 0
        assert calc_d1(29.99) == 0

    def test_taurus(self):
        assert calc_d1(30) == 1
        assert calc_d1(59.99) == 1

    def test_wrap_360(self):
        assert calc_d1(360) == 0

    def test_all_twelve_signs(self):
        for i in range(12):
            assert calc_d1(i * 30 + 15) == i


class TestD2Hora:
    def test_odd_sign_first_half_is_leo(self):
        assert calc_d2(10) == 4  # Aries (odd), 0-15 → Leo

    def test_odd_sign_second_half_is_cancer(self):
        assert calc_d2(20) == 3  # Aries (odd), 15-30 → Cancer

    def test_even_sign_first_half_is_cancer(self):
        assert calc_d2(40) == 3  # Taurus (even), 0-15 → Cancer

    def test_even_sign_second_half_is_leo(self):
        assert calc_d2(50) == 4  # Taurus (even), 15-30 → Leo


class TestD3Drekkana:
    def test_first_third_same_sign(self):
        assert calc_d3(5) == 0  # Aries 0-10 → Aries

    def test_second_third_fifth_from(self):
        assert calc_d3(15) == 4  # Aries 10-20 → Leo (5th)

    def test_third_third_ninth_from(self):
        assert calc_d3(25) == 8  # Aries 20-30 → Sagittarius (9th)


class TestD9Navamsa:
    def test_aries_first_navamsa(self):
        assert calc_d9(0) == 0  # Fire sign → start from Aries

    def test_taurus_first_navamsa(self):
        assert calc_d9(30) == 9  # Earth sign → start from Capricorn

    def test_gemini_first_navamsa(self):
        assert calc_d9(60) == 6  # Air sign → start from Libra

    def test_cancer_first_navamsa(self):
        assert calc_d9(90) == 3  # Water sign → start from Cancer


class TestD30Trimshamsha:
    def test_odd_sign_mars_0_to_5(self):
        assert calc_d30(2) == 0  # Aries → Mars → Aries

    def test_odd_sign_saturn_5_to_10(self):
        assert calc_d30(7) == 10  # Aries → Saturn → Aquarius

    def test_even_sign_venus_0_to_5(self):
        assert calc_d30(32) == 6  # Taurus → Venus → Libra


class TestAllDivisions:
    def test_all_24_calculators_present(self):
        expected = [
            "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8",
            "D9", "D10", "D11", "D12", "D14", "D16", "D20", "D21",
            "D24", "D27", "D30", "D40", "D45", "D60", "D81", "D108",
        ]
        assert sorted(DIVISIONAL_CALCULATORS.keys()) == sorted(expected)

    def test_all_return_valid_sign_index(self):
        for name, calc in DIVISIONAL_CALCULATORS.items():
            for lon in [0, 15, 45, 90, 135, 180, 225, 270, 315, 359.9]:
                result = calc(lon)
                assert 0 <= result <= 11, f"{name} returned {result} for {lon}"

    def test_determinism(self):
        for name, calc in DIVISIONAL_CALCULATORS.items():
            assert calc(123.456) == calc(123.456), f"{name} is non-deterministic"
