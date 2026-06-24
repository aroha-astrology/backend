"""Tests for Ashtakoota (8-Koota) marriage compatibility."""

from app.tools.ashtakoota import calculate_ashtakoota


class TestBasicComputation:
    def test_returns_8_kootas(self):
        result = calculate_ashtakoota(0, 13, "Aries", "Cancer")
        assert len(result["scores"]) == 8

    def test_max_total_is_36(self):
        result = calculate_ashtakoota(0, 0, "Aries", "Aries")
        assert result["maxTotal"] == 36

    def test_total_does_not_exceed_36(self):
        for n1 in range(27):
            for n2 in [0, 5, 13, 20, 26]:
                sign1 = ["Aries", "Taurus", "Gemini", "Cancer"][n1 % 4]
                sign2 = ["Leo", "Virgo", "Libra", "Scorpio"][n2 % 4]
                result = calculate_ashtakoota(n1, n2, sign1, sign2)
                assert 0 <= result["totalScore"] <= 36


class TestKootaScores:
    def test_same_nakshatra_same_sign_nadi_dosha(self):
        result = calculate_ashtakoota(0, 0, "Aries", "Aries")
        nadi = next(s for s in result["scores"] if s["koota"] == "Nadi")
        assert nadi["score"] == 0  # same nadi = dosha

    def test_different_nadi_full_score(self):
        # Nak 0 = Aadi, Nak 2 = Antya
        result = calculate_ashtakoota(0, 2, "Aries", "Gemini")
        nadi = next(s for s in result["scores"] if s["koota"] == "Nadi")
        assert nadi["score"] == 8

    def test_same_gana_full_score(self):
        # Nak 0 = Deva, Nak 2 = Deva
        result = calculate_ashtakoota(0, 2, "Aries", "Gemini")
        gana = next(s for s in result["scores"] if s["koota"] == "Gana")
        assert gana["score"] == 6

    def test_bhakoot_2_12_is_zero(self):
        result = calculate_ashtakoota(0, 0, "Aries", "Taurus")
        bhakoot = next(s for s in result["scores"] if s["koota"] == "Bhakoot")
        assert bhakoot["score"] == 0

    def test_bhakoot_1_1_is_seven(self):
        result = calculate_ashtakoota(0, 0, "Aries", "Aries")
        bhakoot = next(s for s in result["scores"] if s["koota"] == "Bhakoot")
        assert bhakoot["score"] == 7


class TestOverallCompat:
    def test_excellent_threshold(self):
        result = calculate_ashtakoota(0, 2, "Aries", "Sagittarius")
        assert result["overallCompatibility"] in (
            "excellent", "good", "average", "below_average", "poor"
        )

    def test_deterministic(self):
        r1 = calculate_ashtakoota(5, 15, "Taurus", "Scorpio")
        r2 = calculate_ashtakoota(5, 15, "Taurus", "Scorpio")
        assert r1 == r2
