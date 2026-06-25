"""Vedha (transit obstruction) — geometric check on Gochara results.

When a transiting planet is in an auspicious house from the natal Moon, but
another planet occupies the corresponding Vedha house, the good result is
nullified. Vipareetha Vedha works in reverse (shields malefic transits).

Exception pairs: Sun/Saturn do not cause Vedha to each other.
Moon/Mercury do not cause Vedha to each other.
"""

from __future__ import annotations

AUSPICIOUS_HOUSES: dict[str, list[int]] = {
    "Sun":     [3, 6, 10, 11],
    "Moon":    [1, 3, 6, 7, 10, 11],
    "Mars":    [3, 6, 11],
    "Mercury": [2, 4, 6, 8, 10, 11],
    "Jupiter": [2, 5, 7, 9, 11],
    "Venus":   [1, 2, 3, 4, 5, 8, 9, 11, 12],
    "Saturn":  [3, 6, 11],
    "Rahu":    [3, 6, 11],
    "Ketu":    [3, 6, 11],
}

VEDHA_PAIRS: dict[str, dict[int, int]] = {
    "Sun":     {3: 9, 6: 12, 10: 4, 11: 5},
    "Moon":    {1: 5, 3: 9, 6: 12, 7: 2, 10: 4, 11: 8},
    "Mars":    {3: 12, 6: 9, 11: 5},
    "Mercury": {2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12},
    "Jupiter": {2: 12, 5: 4, 7: 3, 9: 10, 11: 8},
    "Venus":   {1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 6, 12: 3},
    "Saturn":  {3: 12, 6: 9, 11: 5},
    "Rahu":    {3: 12, 6: 9, 11: 5},
    "Ketu":    {3: 12, 6: 9, 11: 5},
}

EXCEPTION_PAIRS = frozenset([
    frozenset(["Sun", "Saturn"]),
    frozenset(["Moon", "Mercury"]),
])


def _house_from_moon(planet_sign: int, moon_sign: int) -> int:
    return ((planet_sign - moon_sign) % 12) + 1


def check_vedha(
    transiting_planet: str,
    transit_signs: dict[str, int],
    natal_moon_sign: int,
) -> dict:
    """Check if a transiting planet's auspicious result is obstructed by Vedha.

    Args:
        transiting_planet: Name of the planet to check.
        transit_signs: {planet_name: current_sign_index_0_11} for all transiting planets.
        natal_moon_sign: The natal Moon's sign index (0-11).

    Returns:
        {planet, house, is_auspicious, vedha_blocked, blocked_by, vedha_house}
    """
    planet_sign = transit_signs.get(transiting_planet)
    if planet_sign is None:
        return {"planet": transiting_planet, "is_auspicious": False, "vedha_blocked": False}

    house = _house_from_moon(planet_sign, natal_moon_sign)
    is_auspicious = house in AUSPICIOUS_HOUSES.get(transiting_planet, [])

    if not is_auspicious:
        return {
            "planet": transiting_planet,
            "house": house,
            "is_auspicious": False,
            "vedha_blocked": False,
        }

    vedha_map = VEDHA_PAIRS.get(transiting_planet, {})
    vedha_house = vedha_map.get(house)
    if vedha_house is None:
        return {
            "planet": transiting_planet,
            "house": house,
            "is_auspicious": True,
            "vedha_blocked": False,
        }

    vedha_sign = (natal_moon_sign + vedha_house - 1) % 12

    blocked_by = None
    for other_planet, other_sign in transit_signs.items():
        if other_planet == transiting_planet:
            continue
        if other_sign != vedha_sign:
            continue
        if frozenset([transiting_planet, other_planet]) in EXCEPTION_PAIRS:
            continue
        blocked_by = other_planet
        break

    return {
        "planet": transiting_planet,
        "house": house,
        "is_auspicious": True,
        "vedha_blocked": blocked_by is not None,
        "blocked_by": blocked_by,
        "vedha_house": vedha_house,
    }


def check_all_vedha(
    transit_signs: dict[str, int],
    natal_moon_sign: int,
) -> list[dict]:
    """Check Vedha for all transiting planets."""
    results = []
    for planet in transit_signs:
        results.append(check_vedha(planet, transit_signs, natal_moon_sign))
    return results
