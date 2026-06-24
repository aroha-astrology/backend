"""Kakshya micro-compartments — daily precision via Ashtakavarga bindus.

Each 30° sign is divided into 8 Kakshyas of 3°45' each, ruled by planets
in order: Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon, Ascendant.

A transiting planet yields good results on days when it traverses a Kakshya
whose lord contributed a bindu in that planet's BAV for that sign.
"""

from __future__ import annotations

KAKSHYA_LORDS = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon", "Asc"]
KAKSHYA_SPAN = 30.0 / 8  # 3.75°


def get_kakshya(longitude: float) -> dict:
    """Determine which Kakshya a planet occupies within its sign.

    Args:
        longitude: Sidereal longitude (0-360°).

    Returns:
        {kakshya_index (0-7), kakshya_lord, degree_in_sign, sign_index}
    """
    sign_index = int(longitude // 30) % 12
    degree_in_sign = longitude % 30
    kakshya_index = min(int(degree_in_sign / KAKSHYA_SPAN), 7)
    return {
        "kakshya_index": kakshya_index,
        "kakshya_lord": KAKSHYA_LORDS[kakshya_index],
        "degree_in_sign": round(degree_in_sign, 4),
        "sign_index": sign_index,
    }


def check_kakshya_bindu(
    transiting_planet: str,
    transit_longitude: float,
    bhinna_av: list[dict],
) -> dict:
    """Check if the Kakshya lord contributed a bindu for this transit.

    Args:
        transiting_planet: Name of the transiting planet.
        transit_longitude: Current sidereal longitude of the planet.
        bhinna_av: List of BAV entries [{planet, bindus[12], total}].

    Returns:
        {planet, sign_index, kakshya_lord, kakshya_index, has_bindu, bindu_count}
    """
    kak = get_kakshya(transit_longitude)
    sign_idx = kak["sign_index"]
    kakshya_lord = kak["kakshya_lord"]

    planet_bav = next((b for b in bhinna_av if b["planet"] == transiting_planet), None)
    if not planet_bav:
        return {
            "planet": transiting_planet,
            "sign_index": sign_idx,
            "kakshya_lord": kakshya_lord,
            "kakshya_index": kak["kakshya_index"],
            "has_bindu": False,
            "bindu_count": 0,
        }

    bindu_count = planet_bav["bindus"][sign_idx]

    has_bindu = bindu_count > 0

    return {
        "planet": transiting_planet,
        "sign_index": sign_idx,
        "kakshya_lord": kakshya_lord,
        "kakshya_index": kak["kakshya_index"],
        "has_bindu": has_bindu,
        "bindu_count": bindu_count,
    }


def daily_kakshya_score(
    transit_longitudes: dict[str, float],
    bhinna_av: list[dict],
) -> dict:
    """Compute the daily Kakshya score across all transiting planets.

    A score of 4+ active bindus = highly successful day.
    A score of 0-2 = day of struggle.
    """
    results = []
    active_count = 0
    for planet, lon in transit_longitudes.items():
        check = check_kakshya_bindu(planet, lon, bhinna_av)
        results.append(check)
        if check["has_bindu"]:
            active_count += 1

    if active_count >= 5:
        quality = "excellent"
    elif active_count >= 4:
        quality = "good"
    elif active_count >= 3:
        quality = "average"
    else:
        quality = "challenging"

    return {
        "active_bindus": active_count,
        "quality": quality,
        "details": results,
    }
