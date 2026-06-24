"""Transit analysis tools — Double Transit detection + Dasha-lord transit quality.

Double Transit: Jupiter + Saturn simultaneously aspecting the same house from
the natal Moon triggers major life events.

Dasha-lord transit quality: checks if the active MD/AD lord is in
friendly/enemy/exalted/debilitated sign in the current sky.
"""

from __future__ import annotations

from app.tools.swe_engine import SIGNS

EXALTATION: dict[str, str] = {
    "Sun": "Aries", "Moon": "Taurus", "Mars": "Capricorn", "Mercury": "Virgo",
    "Jupiter": "Cancer", "Venus": "Pisces", "Saturn": "Libra",
    "Rahu": "Taurus", "Ketu": "Scorpio",
}

DEBILITATION: dict[str, str] = {
    "Sun": "Libra", "Moon": "Scorpio", "Mars": "Cancer", "Mercury": "Pisces",
    "Jupiter": "Capricorn", "Venus": "Virgo", "Saturn": "Aries",
    "Rahu": "Scorpio", "Ketu": "Taurus",
}

OWN_SIGNS: dict[str, list[str]] = {
    "Sun": ["Leo"], "Moon": ["Cancer"],
    "Mars": ["Aries", "Scorpio"], "Mercury": ["Gemini", "Virgo"],
    "Jupiter": ["Sagittarius", "Pisces"], "Venus": ["Taurus", "Libra"],
    "Saturn": ["Capricorn", "Aquarius"],
    "Rahu": ["Aquarius"], "Ketu": ["Scorpio"],
}

FRIENDS: dict[str, list[str]] = {
    "Sun": ["Moon", "Mars", "Jupiter"], "Moon": ["Sun", "Mercury"],
    "Mars": ["Sun", "Moon", "Jupiter"], "Mercury": ["Sun", "Venus"],
    "Jupiter": ["Sun", "Moon", "Mars"], "Venus": ["Mercury", "Saturn"],
    "Saturn": ["Mercury", "Venus"],
}

ENEMIES: dict[str, list[str]] = {
    "Sun": ["Venus", "Saturn"], "Moon": [],
    "Mars": ["Mercury"], "Mercury": ["Moon"],
    "Jupiter": ["Mercury", "Venus"], "Venus": ["Sun", "Moon"],
    "Saturn": ["Sun", "Moon", "Mars"],
}

# Vedic aspects: each planet aspects the 7th house from itself.
# Jupiter additionally aspects 5th and 9th. Mars aspects 4th and 8th. Saturn aspects 3rd and 10th.
SPECIAL_ASPECTS: dict[str, list[int]] = {
    "Jupiter": [5, 7, 9],
    "Mars": [4, 7, 8],
    "Saturn": [3, 7, 10],
}


def _houses_aspected(planet: str, planet_sign: int) -> set[int]:
    """Return set of sign indices (0-11) aspected by a planet."""
    aspect_houses = SPECIAL_ASPECTS.get(planet, [7])
    return {(planet_sign + h - 1) % 12 for h in aspect_houses}


def detect_double_transit(
    jupiter_sign: int,
    saturn_sign: int,
    natal_moon_sign: int,
) -> list[dict]:
    """Find houses receiving both Jupiter and Saturn aspect simultaneously.

    Returns list of {house, sign, sign_index} where double transit is active.
    """
    jup_aspects = _houses_aspected("Jupiter", jupiter_sign)
    sat_aspects = _houses_aspected("Saturn", saturn_sign)

    common = jup_aspects & sat_aspects
    results = []
    for sign_idx in sorted(common):
        house = ((sign_idx - natal_moon_sign) % 12) + 1
        results.append({
            "house": house,
            "sign": SIGNS[sign_idx],
            "sign_index": sign_idx,
        })
    return results


def dasha_lord_transit_quality(
    planet: str,
    transit_sign_index: int,
) -> dict:
    """Assess the transit quality of a dasha lord.

    Returns:
        {planet, transit_sign, dignity, quality_score (1-5), description}
    """
    transit_sign = SIGNS[transit_sign_index]

    if transit_sign == EXALTATION.get(planet):
        dignity = "exalted"
        score = 5
        desc = f"{planet} is exalted in {transit_sign} — maximum potency"
    elif transit_sign == DEBILITATION.get(planet):
        dignity = "debilitated"
        score = 1
        desc = f"{planet} is debilitated in {transit_sign} — severely weakened"
    elif transit_sign in OWN_SIGNS.get(planet, []):
        dignity = "own_sign"
        score = 4
        desc = f"{planet} is in own sign {transit_sign} — strong and comfortable"
    else:
        sign_lord = _sign_lord(transit_sign)
        if sign_lord in FRIENDS.get(planet, []):
            dignity = "friendly"
            score = 3
            desc = f"{planet} in friendly sign {transit_sign} (lord {sign_lord}) — supportive"
        elif sign_lord in ENEMIES.get(planet, []):
            dignity = "enemy"
            score = 2
            desc = f"{planet} in enemy sign {transit_sign} (lord {sign_lord}) — compromised"
        else:
            dignity = "neutral"
            score = 3
            desc = f"{planet} in neutral sign {transit_sign} — moderate capacity"

    return {
        "planet": planet,
        "transit_sign": transit_sign,
        "dignity": dignity,
        "quality_score": score,
        "description": desc,
    }


def _sign_lord(sign: str) -> str:
    lords = {
        "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury", "Cancer": "Moon",
        "Leo": "Sun", "Virgo": "Mercury", "Libra": "Venus", "Scorpio": "Mars",
        "Sagittarius": "Jupiter", "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
    }
    return lords.get(sign, "Sun")
