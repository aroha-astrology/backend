"""Daily forecast synthesis — stacks all predictive layers into one assessment.

Layers (per the metrology document):
  1. Dasha (active MD/AD lord identity)
  2. Dasha-lord transit quality (dignity in current sky)
  3. SAV filter (bindu count of sign the dasha lord transits)
  4. Vedha check (is the auspicious transit obstructed?)
  5. Kakshya daily score (how many planets in bindu-yielding compartments)
  6. Tara Bala + Chandrabala (lunar day quality)
  7. Panchang constraints (Vishti karana, bad yoga, Panchaka)

Also produces Moon-sign and Sun-sign daily predictions.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.tools.swe_engine import get_sidereal_longitudes, to_julian_day, SIGNS
from app.tools.ashtakavarga import calculate_bhinna, calculate_sarva
from app.tools.vedha import check_all_vedha
from app.tools.kakshya import daily_kakshya_score
from app.tools.tara_bala import daily_lunar_assessment
from app.tools.transit import detect_double_transit, dasha_lord_transit_quality
from app.tools.panchang import compute_panchang
from app.tools.panchaka import compute_panchaka


def synthesize_daily_forecast(
    natal_planets: list[dict],
    natal_asc_sign_idx: int,
    natal_moon_sign_idx: int,
    natal_moon_nak_idx: int,
    current_md_planet: str | None,
    current_ad_planet: str | None,
    as_of: datetime | None = None,
) -> dict:
    """Full daily synthesis — all predictive layers stacked.

    Args:
        natal_planets: list of planet dicts from metrology.
        natal_asc_sign_idx: ascendant sign index (0-11).
        natal_moon_sign_idx: natal Moon sign index.
        natal_moon_nak_idx: natal Moon nakshatra index (0-26).
        current_md_planet: active Mahadasha lord name.
        current_ad_planet: active Antardasha lord name.
        as_of: UTC datetime for transit computation (defaults to now).
    """
    now = as_of or datetime.now(tz=timezone.utc)
    jd = to_julian_day(now)

    # Current sky positions
    transit_positions = get_sidereal_longitudes(jd)
    transit_signs = {name: pos.sign_index for name, pos in transit_positions.items()}
    transit_lons = {name: pos.longitude for name, pos in transit_positions.items()}

    # Natal planet signs for BAV
    natal_signs = {p["planet"]: p["signIndex"] for p in natal_planets}

    # 1. Panchang
    panchang = compute_panchang(now)

    # 2. Dasha-lord transit quality
    md_quality = None
    ad_quality = None
    if current_md_planet and current_md_planet in transit_signs:
        md_quality = dasha_lord_transit_quality(current_md_planet, transit_signs[current_md_planet])
    if current_ad_planet and current_ad_planet in transit_signs:
        ad_quality = dasha_lord_transit_quality(current_ad_planet, transit_signs[current_ad_planet])

    # 3. Ashtakavarga — BAV for Kakshya, SAV for overall sign strength
    bhinna = calculate_bhinna(natal_signs, natal_asc_sign_idx)
    bhinna_dicts = [b.as_dict() for b in bhinna]
    sarva = calculate_sarva(bhinna)

    # 4. Vedha check
    vedha_results = check_all_vedha(transit_signs, natal_moon_sign_idx)
    vedha_blocked_count = sum(1 for v in vedha_results if v.get("vedha_blocked"))

    # 5. Kakshya daily score
    kakshya = daily_kakshya_score(transit_lons, bhinna_dicts)

    # 6. Tara Bala + Chandrabala
    transit_moon = transit_positions.get("Moon")
    lunar = None
    if transit_moon:
        lunar = daily_lunar_assessment(
            natal_moon_nak_idx, natal_moon_sign_idx,
            transit_moon.nakshatra_index, transit_moon.sign_index,
        )

    # 7. Double Transit
    jup_sign = transit_signs.get("Jupiter", 0)
    sat_sign = transit_signs.get("Saturn", 0)
    double_transit = detect_double_transit(jup_sign, sat_sign, natal_moon_sign_idx)

    # 8. Panchaka
    panchaka = compute_panchaka(
        tithi_index=panchang["tithi"]["index"] + 1,
        vara_index=panchang["vara"]["index"] + 1,
        nakshatra_index=panchang["nakshatra"]["index"] + 1,
        lagna_index=natal_asc_sign_idx + 1,
    )

    # Aggregate score (1-5)
    score = _compute_aggregate_score(
        md_quality, ad_quality, kakshya, lunar, vedha_blocked_count, panchaka,
    )

    return {
        "date": now.date().isoformat(),
        "score": score,
        "panchang": panchang,
        "dasha_transit": {
            "mahadasha": md_quality,
            "antardasha": ad_quality,
        },
        "ashtakavarga_sarva_transit": {
            sign: sarva.bindus[i] for i, sign in enumerate(SIGNS)
        },
        "vedha": {
            "blocked_count": vedha_blocked_count,
            "details": vedha_results,
        },
        "kakshya": kakshya,
        "lunar": lunar,
        "double_transit": double_transit,
        "panchaka": panchaka,
    }


def _compute_aggregate_score(md_quality, ad_quality, kakshya, lunar, vedha_blocked, panchaka) -> int:
    score = 3.0  # neutral baseline

    if md_quality:
        score += (md_quality["quality_score"] - 3) * 0.3
    if ad_quality:
        score += (ad_quality["quality_score"] - 3) * 0.2

    kakshya_map = {"excellent": 1, "good": 0.5, "average": 0, "challenging": -0.5}
    score += kakshya_map.get(kakshya.get("quality", "average"), 0)

    if lunar:
        lunar_map = {"excellent": 1, "good_with_caution": 0.5, "moderate": 0, "challenging": -0.5, "avoid": -1.5}
        score += lunar_map.get(lunar.get("overall", "moderate"), 0)

    score -= vedha_blocked * 0.2

    if not panchaka.get("safe", True):
        score -= 0.5

    return max(1, min(5, round(score)))


def moon_sign_prediction(moon_sign_index: int, as_of: datetime | None = None) -> dict:
    """Generic Moon-sign daily prediction (not personalized to natal chart)."""
    now = as_of or datetime.now(tz=timezone.utc)
    jd = to_julian_day(now)
    transit = get_sidereal_longitudes(jd)
    transit_moon = transit["Moon"]

    house_from_sign = ((transit_moon.sign_index - moon_sign_index) % 12) + 1
    favorable = house_from_sign in {1, 3, 6, 7, 10, 11}
    is_ashtama = house_from_sign == 8

    return {
        "sign": SIGNS[moon_sign_index],
        "transit_moon_sign": transit_moon.sign,
        "transit_moon_nakshatra": transit_moon.nakshatra,
        "house_from_sign": house_from_sign,
        "favorable": favorable,
        "is_ashtama_chandra": is_ashtama,
        "quality": "avoid" if is_ashtama else ("good" if favorable else "challenging"),
    }


def sun_sign_prediction(sun_sign_index: int, as_of: datetime | None = None) -> dict:
    """Generic Sun-sign daily prediction."""
    now = as_of or datetime.now(tz=timezone.utc)
    jd = to_julian_day(now)
    transit = get_sidereal_longitudes(jd)

    transit_sun = transit["Sun"]
    house_from_sign = ((transit_sun.sign_index - sun_sign_index) % 12) + 1

    transit_jup = transit["Jupiter"]
    jup_house = ((transit_jup.sign_index - sun_sign_index) % 12) + 1
    jup_favorable = jup_house in {2, 5, 7, 9, 11}

    transit_sat = transit["Saturn"]
    sat_house = ((transit_sat.sign_index - sun_sign_index) % 12) + 1
    sat_challenging = sat_house in {4, 8, 12}

    if jup_favorable and not sat_challenging:
        quality = "good"
    elif sat_challenging and not jup_favorable:
        quality = "challenging"
    else:
        quality = "moderate"

    return {
        "sign": SIGNS[sun_sign_index],
        "transit_sun_sign": transit_sun.sign,
        "sun_house_from_sign": house_from_sign,
        "jupiter_house_from_sign": jup_house,
        "jupiter_favorable": jup_favorable,
        "saturn_house_from_sign": sat_house,
        "saturn_challenging": sat_challenging,
        "quality": quality,
    }
