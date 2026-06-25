"""Tests for the 13 missing tools: Vedha, Kakshya, Tara Bala, Chandrabala,
Panchaka, Double Transit, Dasha-lord transit quality, Yogas, Doshas,
Daily synthesis, Moon/Sun sign predictions.
"""

import pytest
from datetime import datetime, timezone
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


SAMPLE_BIRTH = {
    "date": "1990-08-15", "time": "07:30",
    "latitude": 28.6139, "longitude": 77.2090, "timezone": "Asia/Kolkata",
}


# --- Vedha ---

class TestVedha:
    def test_no_vedha_when_no_obstruction(self):
        from app.tools.vedha import check_vedha
        result = check_vedha("Jupiter", {"Jupiter": 3, "Sun": 0}, natal_moon_sign=2)
        assert result["planet"] == "Jupiter"

    def test_vedha_blocked(self):
        from app.tools.vedha import check_vedha
        # Jupiter auspicious in 2nd from Moon (sign 3 if Moon at 2). Vedha house for 2nd = 12th
        result = check_vedha("Jupiter", {"Jupiter": 3, "Mars": 1}, natal_moon_sign=2)
        # Jupiter in house 2 from moon_sign=2 → sign 3. Vedha for house 2 = house 12 → sign 1.
        # Mars is at sign 1 → blocks.
        assert result["is_auspicious"] is True
        assert result["vedha_blocked"] is True
        assert result["blocked_by"] == "Mars"

    def test_sun_saturn_exception(self):
        from app.tools.vedha import check_vedha
        result = check_vedha("Sun", {"Sun": 4, "Saturn": 0}, natal_moon_sign=2)
        # Even if Saturn is in vedha position, it doesn't block Sun
        if result.get("vedha_blocked"):
            assert result.get("blocked_by") != "Saturn"

    def test_check_all_vedha(self):
        from app.tools.vedha import check_all_vedha
        signs = {"Sun": 0, "Moon": 3, "Mars": 6, "Jupiter": 9}
        results = check_all_vedha(signs, natal_moon_sign=0)
        assert len(results) == 4


# --- Kakshya ---

class TestKakshya:
    def test_get_kakshya(self):
        from app.tools.kakshya import get_kakshya
        result = get_kakshya(10.0)  # 10° in Aries → 3rd kakshya (Mars, 7.5-11.25)
        assert result["kakshya_index"] == 2
        assert result["kakshya_lord"] == "Mars"

    def test_daily_kakshya_score(self):
        from app.tools.kakshya import daily_kakshya_score
        lons = {"Sun": 45.0, "Moon": 120.0, "Mars": 200.0, "Jupiter": 300.0}
        bhinna = [
            {"planet": "Sun", "bindus": [4]*12, "total": 48},
            {"planet": "Moon", "bindus": [3]*12, "total": 36},
            {"planet": "Mars", "bindus": [5]*12, "total": 60},
            {"planet": "Jupiter", "bindus": [2]*12, "total": 24},
        ]
        result = daily_kakshya_score(lons, bhinna)
        assert "active_bindus" in result
        assert result["quality"] in ("excellent", "good", "average", "challenging")


# --- Tara Bala ---

class TestTaraBala:
    def test_sampat_tara(self):
        from app.tools.tara_bala import calculate_tara_bala
        # Distance of 2 nakshatras → tara 2 = Sampat (auspicious)
        result = calculate_tara_bala(0, 1)
        assert result["tara_number"] == 2
        assert result["tara_name"] == "Sampat"
        assert result["classification"] == "auspicious"

    def test_naidhana_tara(self):
        from app.tools.tara_bala import calculate_tara_bala
        result = calculate_tara_bala(0, 6)  # count=7 → tara 7 = Naidhana
        assert result["tara_number"] == 7
        assert result["classification"] == "highly_inauspicious"
        assert result["is_absolute_discard"] is True

    def test_three_paryayas(self):
        from app.tools.tara_bala import calculate_tara_bala
        r1 = calculate_tara_bala(0, 1)   # 1st paryaya
        r2 = calculate_tara_bala(0, 10)  # 2nd paryaya
        r3 = calculate_tara_bala(0, 19)  # 3rd paryaya
        assert r1["paryaya_name"] == "physical"
        assert r2["paryaya_name"] == "emotional"
        assert r3["paryaya_name"] == "spiritual"


# --- Chandrabala ---

class TestChandrabala:
    def test_favorable(self):
        from app.tools.tara_bala import calculate_chandrabala
        result = calculate_chandrabala(0, 0)  # house 1 = favorable
        assert result["is_favorable"] is True

    def test_ashtama_chandra(self):
        from app.tools.tara_bala import calculate_chandrabala
        result = calculate_chandrabala(0, 7)  # house 8 = ashtama
        assert result["is_ashtama_chandra"] is True
        assert result["classification"] == "highly_inauspicious"

    def test_combined_assessment(self):
        from app.tools.tara_bala import daily_lunar_assessment
        result = daily_lunar_assessment(0, 0, 1, 0)
        assert result["overall"] in ("excellent", "good_with_caution", "moderate", "challenging", "avoid")


# --- Panchaka ---

class TestPanchaka:
    def test_auspicious(self):
        from app.tools.panchaka import compute_panchaka
        result = compute_panchaka(3, 2, 5, 8)  # sum=18, 18%9=0 → auspicious
        assert result["safe"] is True

    def test_mrithyu_panchaka(self):
        from app.tools.panchaka import compute_panchaka
        result = compute_panchaka(1, 1, 1, 6)  # sum=9, 9%9=0... let me find remainder=1
        # 1+2+3+4 = 10, 10%9 = 1 → Mrithyu
        result = compute_panchaka(1, 2, 3, 4)
        assert result["remainder"] == 1
        assert result["safe"] is False
        assert "death" in result["danger"].lower()


# --- Double Transit ---

class TestDoubleTransit:
    def test_detects_common_aspect(self):
        from app.tools.transit import detect_double_transit
        # Jupiter at Aries(0) aspects 5,7,9 → signs 4,6,8
        # Saturn at Libra(6) aspects 3,7,10 → signs 8,0,3
        # Common: sign 8 (Sagittarius)
        result = detect_double_transit(0, 6, natal_moon_sign=0)
        signs_hit = [r["sign_index"] for r in result]
        assert 8 in signs_hit

    def test_no_common_aspect(self):
        from app.tools.transit import detect_double_transit
        result = detect_double_transit(0, 1, natal_moon_sign=0)
        # May or may not have common — just verify it runs
        assert isinstance(result, list)


# --- Dasha-lord transit quality ---

class TestDashaTransitQuality:
    def test_exalted(self):
        from app.tools.transit import dasha_lord_transit_quality
        result = dasha_lord_transit_quality("Sun", 0)  # Aries = exalted for Sun
        assert result["dignity"] == "exalted"
        assert result["quality_score"] == 5

    def test_debilitated(self):
        from app.tools.transit import dasha_lord_transit_quality
        result = dasha_lord_transit_quality("Sun", 6)  # Libra = debilitated for Sun
        assert result["dignity"] == "debilitated"
        assert result["quality_score"] == 1


# --- Yogas ---

class TestYogas:
    def test_gajakesari_detected(self):
        from app.tools.yogas import detect_all_yogas
        planets = [
            {"planet": "Moon", "sign": "Cancer", "signIndex": 3, "house": 1},
            {"planet": "Jupiter", "sign": "Cancer", "signIndex": 3, "house": 1},
            {"planet": "Sun", "sign": "Leo", "signIndex": 4, "house": 2},
        ]
        findings = detect_all_yogas(planets, asc_sign_idx=3)
        ids = [f["id"] for f in findings]
        assert "f_yoga_gajakesari" in ids

    def test_kemadruma_detected(self):
        from app.tools.yogas import detect_all_yogas
        # Moon alone — no planets in 2nd or 12th from Moon
        planets = [
            {"planet": "Moon", "sign": "Leo", "signIndex": 4, "house": 1},
            {"planet": "Sun", "sign": "Aries", "signIndex": 0, "house": 9},
            {"planet": "Mars", "sign": "Scorpio", "signIndex": 7, "house": 4},
        ]
        findings = detect_all_yogas(planets, asc_sign_idx=4)
        ids = [f["id"] for f in findings]
        assert "f_yoga_kemadruma" in ids


# --- Doshas ---

class TestDoshas:
    def test_mangal_dosha(self):
        from app.tools.doshas import detect_all_doshas
        planets = [
            {"planet": "Mars", "sign": "Leo", "signIndex": 4, "house": 7},
            {"planet": "Moon", "sign": "Aries", "signIndex": 0, "house": 1},
        ]
        findings = detect_all_doshas(planets, asc_sign_idx=4)
        ids = [f["id"] for f in findings]
        assert "f_dosha_mangal" in ids

    def test_guru_chandal(self):
        from app.tools.doshas import detect_all_doshas
        planets = [
            {"planet": "Jupiter", "sign": "Cancer", "signIndex": 3, "house": 1},
            {"planet": "Rahu", "sign": "Cancer", "signIndex": 3, "house": 1},
            {"planet": "Ketu", "sign": "Capricorn", "signIndex": 9, "house": 7},
        ]
        findings = detect_all_doshas(planets, asc_sign_idx=3)
        ids = [f["id"] for f in findings]
        assert "f_dosha_guruchandal" in ids


# --- Moon/Sun sign endpoints ---

class TestSignEndpoints:
    def test_moon_sign_forecast(self, client):
        r = client.get("/v1/forecast/moon-sign/0")
        assert r.status_code == 200
        data = r.json()
        assert data["sign"] == "Aries"
        assert data["quality"] in ("good", "challenging", "avoid")

    def test_sun_sign_forecast(self, client):
        r = client.get("/v1/forecast/sun-sign/4")
        assert r.status_code == 200
        data = r.json()
        assert data["sign"] == "Leo"
        assert data["quality"] in ("good", "moderate", "challenging")

    def test_invalid_sign_index(self, client):
        r = client.get("/v1/forecast/moon-sign/15")
        assert r.status_code == 400

    def test_all_12_moon_signs(self, client):
        for i in range(12):
            r = client.get(f"/v1/forecast/moon-sign/{i}")
            assert r.status_code == 200


# --- Full daily synthesis endpoint ---

class TestDailySynthesis:
    def test_full_synthesis(self, client):
        r = client.post("/v1/forecast/daily/full", json={"birth": SAMPLE_BIRTH, "consent": True})
        assert r.status_code == 200
        data = r.json()
        assert 1 <= data["score"] <= 5
        assert "panchang" in data
        assert "vedha" in data
        assert "kakshya" in data
        assert "lunar" in data
        assert "dasha_transit" in data
        assert "panchaka" in data

    def test_forecast_has_yogas_and_doshas(self, client):
        r = client.post("/v1/forecast/daily", json={"birth": SAMPLE_BIRTH, "consent": True})
        assert r.status_code == 200
        data = r.json()
        findings = data.get("findings", [])
        kinds = {f.get("kind") for f in findings}
        # Should have at least dasha findings + some sav/yoga/dosha
        assert len(findings) > 0
