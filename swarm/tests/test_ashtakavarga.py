"""Tests for Ashtakavarga (BAV/SAV) calculations."""

from app.tools.ashtakavarga import (
    AV_PLANETS,
    calculate_bhinna,
    calculate_sarva,
    calculate_ashtakavarga,
    evaluate_sign_strength,
)


SAMPLE_SIGNS = {
    "Sun": 3, "Moon": 1, "Mars": 8, "Mercury": 2,
    "Jupiter": 3, "Venus": 4, "Saturn": 8,
}
ASC_SIGN = 4  # Leo


class TestBhinna:
    def test_returns_7_planets(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        assert len(bhinna) == 7
        planets = [b.planet for b in bhinna]
        assert planets == AV_PLANETS

    def test_bindus_are_12_per_planet(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        for b in bhinna:
            assert len(b.bindus) == 12

    def test_bindus_range_0_to_8(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        for b in bhinna:
            for val in b.bindus:
                assert 0 <= val <= 8

    def test_total_equals_sum_of_bindus(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        for b in bhinna:
            assert b.total == sum(b.bindus)


class TestSarva:
    def test_sarva_total_in_valid_range(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        sarva = calculate_sarva(bhinna)
        assert 250 <= sarva.total <= 400

    def test_sarva_has_12_entries(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        sarva = calculate_sarva(bhinna)
        assert len(sarva.bindus) == 12


class TestComplete:
    def test_calculate_ashtakavarga_returns_both(self):
        result = calculate_ashtakavarga(SAMPLE_SIGNS, ASC_SIGN)
        assert "bhinna" in result
        assert "sarva" in result
        assert len(result["bhinna"]) == 7
        assert 250 <= result["sarva"]["total"] <= 400

    def test_deterministic(self):
        r1 = calculate_ashtakavarga(SAMPLE_SIGNS, ASC_SIGN)
        r2 = calculate_ashtakavarga(SAMPLE_SIGNS, ASC_SIGN)
        assert r1 == r2


class TestSignStrength:
    def test_strong_weak_average(self):
        bhinna = calculate_bhinna(SAMPLE_SIGNS, ASC_SIGN)
        sarva = calculate_sarva(bhinna)
        results = [evaluate_sign_strength(sarva, i) for i in range(12)]
        assert all(r in ("strong", "weak", "average") for r in results)
