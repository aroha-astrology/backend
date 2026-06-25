"""Ashtakoota (8-Koota) marriage compatibility — 36-point matching.

Port of jyotish-backend/packages/astro-engine/src/matching/ashtakoota.ts.
All 8 kootas computed from Moon nakshatra index + Moon sign. Deterministic.
"""

from __future__ import annotations

from app.tools.swe_engine import SIGNS

# ---------------------------------------------------------------------------
# Constants (ported verbatim from the TS shared package)
# ---------------------------------------------------------------------------

KOOTA_MAX = {
    "Varna": 1, "Vashya": 2, "Tara": 3, "Yoni": 4,
    "GrahaMaitri": 5, "Gana": 6, "Bhakoot": 7, "Nadi": 8,
}

NAKSHATRA_GANA = {
    0: "Deva", 1: "Manushya", 2: "Deva", 3: "Manushya", 4: "Deva", 5: "Manushya",
    6: "Deva", 7: "Deva", 8: "Rakshasa", 9: "Rakshasa", 10: "Manushya", 11: "Manushya",
    12: "Deva", 13: "Rakshasa", 14: "Deva", 15: "Rakshasa", 16: "Deva", 17: "Rakshasa",
    18: "Rakshasa", 19: "Manushya", 20: "Manushya", 21: "Deva", 22: "Rakshasa", 23: "Rakshasa",
    24: "Manushya", 25: "Manushya", 26: "Deva",
}

NAKSHATRA_YONI = {
    0: ("Horse", "male"), 1: ("Elephant", "male"), 2: ("Goat", "female"),
    3: ("Serpent", "male"), 4: ("Serpent", "female"), 5: ("Dog", "female"),
    6: ("Cat", "female"), 7: ("Goat", "male"), 8: ("Cat", "male"),
    9: ("Rat", "male"), 10: ("Rat", "female"), 11: ("Cow", "male"),
    12: ("Buffalo", "female"), 13: ("Tiger", "female"), 14: ("Buffalo", "male"),
    15: ("Tiger", "male"), 16: ("Deer", "female"), 17: ("Deer", "male"),
    18: ("Dog", "male"), 19: ("Monkey", "male"), 20: ("Mongoose", "male"),
    21: ("Monkey", "female"), 22: ("Lion", "female"), 23: ("Horse", "female"),
    24: ("Lion", "male"), 25: ("Cow", "female"), 26: ("Elephant", "female"),
}

NAKSHATRA_NADI = {
    0: "Aadi", 1: "Madhya", 2: "Antya", 3: "Antya", 4: "Madhya", 5: "Aadi",
    6: "Aadi", 7: "Madhya", 8: "Antya", 9: "Aadi", 10: "Madhya", 11: "Antya",
    12: "Antya", 13: "Madhya", 14: "Aadi", 15: "Aadi", 16: "Madhya", 17: "Antya",
    18: "Aadi", 19: "Madhya", 20: "Antya", 21: "Antya", 22: "Madhya", 23: "Aadi",
    24: "Aadi", 25: "Madhya", 26: "Antya",
}

SIGN_LORDS = {
    "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury", "Cancer": "Moon",
    "Leo": "Sun", "Virgo": "Mercury", "Libra": "Venus", "Scorpio": "Mars",
    "Sagittarius": "Jupiter", "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
}

PLANET_FRIENDS = {
    "Sun": ["Moon", "Mars", "Jupiter"], "Moon": ["Sun", "Mercury"],
    "Mars": ["Sun", "Moon", "Jupiter"], "Mercury": ["Sun", "Venus"],
    "Jupiter": ["Sun", "Moon", "Mars"], "Venus": ["Mercury", "Saturn"],
    "Saturn": ["Mercury", "Venus"], "Rahu": ["Mercury", "Venus", "Saturn"],
    "Ketu": ["Mars", "Venus", "Saturn"],
}

PLANET_ENEMIES = {
    "Sun": ["Venus", "Saturn"], "Moon": [],
    "Mars": ["Mercury"], "Mercury": ["Moon"],
    "Jupiter": ["Mercury", "Venus"], "Venus": ["Sun", "Moon"],
    "Saturn": ["Sun", "Moon", "Mars"], "Rahu": ["Sun", "Moon", "Mars"],
    "Ketu": ["Sun", "Moon"],
}

YONI_ENEMIES = {
    "Horse": "Buffalo", "Buffalo": "Horse", "Elephant": "Lion", "Lion": "Elephant",
    "Dog": "Deer", "Deer": "Dog", "Cat": "Rat", "Rat": "Cat",
    "Serpent": "Mongoose", "Mongoose": "Serpent", "Monkey": "Goat", "Goat": "Monkey",
    "Tiger": "Cow", "Cow": "Tiger",
}

FRIENDLY_YONI_PAIRS = [
    ("Cow", "Buffalo"), ("Horse", "Deer"), ("Cat", "Lion"),
    ("Serpent", "Dog"), ("Monkey", "Elephant"),
]

VASHYA_GROUP = {
    "Aries": "Chatushpada", "Taurus": "Chatushpada", "Gemini": "Manava",
    "Cancer": "Jalachara", "Leo": "Vanachara", "Virgo": "Manava",
    "Libra": "Manava", "Scorpio": "Keeta", "Sagittarius": "Manava",
    "Capricorn": "Chatushpada", "Aquarius": "Manava", "Pisces": "Jalachara",
}

VASHYA_COMPAT = {
    "Chatushpada": {"Chatushpada": 2, "Manava": 0.5, "Jalachara": 0, "Vanachara": 0, "Keeta": 0},
    "Manava": {"Chatushpada": 1, "Manava": 2, "Jalachara": 0, "Vanachara": 1, "Keeta": 0},
    "Jalachara": {"Chatushpada": 0, "Manava": 0, "Jalachara": 2, "Vanachara": 0, "Keeta": 0},
    "Vanachara": {"Chatushpada": 1, "Manava": 0.5, "Jalachara": 0, "Vanachara": 2, "Keeta": 0},
    "Keeta": {"Chatushpada": 0, "Manava": 0, "Jalachara": 0, "Vanachara": 0, "Keeta": 2},
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sign_element(sign: str) -> int:
    return SIGNS.index(sign) % 4


def _sign_distance(s1: str, s2: str) -> int:
    i1, i2 = SIGNS.index(s1), SIGNS.index(s2)
    return ((i2 - i1 + 12) % 12) + 1


def _compat_label(score: float, max_score: float) -> str:
    ratio = score / max_score
    if ratio >= 0.75:
        return "excellent"
    if ratio >= 0.5:
        return "good"
    if ratio >= 0.25:
        return "average"
    return "poor"


def _planet_relation(p1: str, p2: str) -> str:
    if p1 == p2:
        return "friend"
    if p2 in PLANET_FRIENDS.get(p1, []):
        return "friend"
    if p2 in PLANET_ENEMIES.get(p1, []):
        return "enemy"
    return "neutral"


# ---------------------------------------------------------------------------
# Individual kootas
# ---------------------------------------------------------------------------

def _varna(sign1: str, sign2: str) -> dict:
    ranks = [2, 1, 0, 3]  # Fire=Kshatriya, Earth=Vaishya, Air=Shudra, Water=Brahmin
    r1, r2 = ranks[_sign_element(sign1)], ranks[_sign_element(sign2)]
    score = 1 if r1 >= r2 else 0
    return {"koota": "Varna", "maxScore": 1, "score": score, "compatibility": _compat_label(score, 1)}


def _vashya(sign1: str, sign2: str) -> dict:
    g1, g2 = VASHYA_GROUP[sign1], VASHYA_GROUP[sign2]
    s1 = VASHYA_COMPAT.get(g1, {}).get(g2, 0)
    s2 = VASHYA_COMPAT.get(g2, {}).get(g1, 0)
    score = max(s1, s2)
    return {"koota": "Vashya", "maxScore": 2, "score": score, "compatibility": _compat_label(score, 2)}


def _tara(nak1: int, nak2: int) -> dict:
    fav = {1, 2, 4, 6, 8, 0}
    cnt_btg = ((nak2 - nak1 + 27) % 27) + 1
    cnt_gtb = ((nak1 - nak2 + 27) % 27) + 1
    score = 0.0
    if cnt_btg % 9 in fav:
        score += 1.5
    if cnt_gtb % 9 in fav:
        score += 1.5
    return {"koota": "Tara", "maxScore": 3, "score": score, "compatibility": _compat_label(score, 3)}


def _yoni(nak1: int, nak2: int) -> dict:
    y1 = NAKSHATRA_YONI.get(nak1)
    y2 = NAKSHATRA_YONI.get(nak2)
    if not y1 or not y2:
        return {"koota": "Yoni", "maxScore": 4, "score": 0, "compatibility": "poor"}
    a1, t1 = y1
    a2, t2 = y2
    if a1 == a2:
        score = 4
    elif YONI_ENEMIES.get(a1) == a2:
        score = 0
    else:
        score = 2 if t1 != t2 else 1
        for pa, pb in FRIENDLY_YONI_PAIRS:
            if (a1 == pa and a2 == pb) or (a1 == pb and a2 == pa):
                score = 3
                break
    return {"koota": "Yoni", "maxScore": 4, "score": score, "compatibility": _compat_label(score, 4)}


def _graha_maitri(sign1: str, sign2: str) -> dict:
    l1, l2 = SIGN_LORDS[sign1], SIGN_LORDS[sign2]
    r12, r21 = _planet_relation(l1, l2), _planet_relation(l2, l1)
    pair = frozenset([r12, r21])
    if pair == {"friend"}:
        score = 5.0
    elif pair == {"friend", "neutral"}:
        score = 4.0
    elif pair == {"neutral"}:
        score = 3.0
    elif pair == {"friend", "enemy"}:
        score = 1.0
    elif pair == {"neutral", "enemy"}:
        score = 0.5
    else:
        score = 0.0
    return {"koota": "GrahaMaitri", "maxScore": 5, "score": score, "compatibility": _compat_label(score, 5)}


def _gana(nak1: int, nak2: int) -> dict:
    g1, g2 = NAKSHATRA_GANA.get(nak1, "Manushya"), NAKSHATRA_GANA.get(nak2, "Manushya")
    if g1 == g2:
        score = 6
    elif {g1, g2} == {"Deva", "Manushya"}:
        score = 5
    else:
        score = 0
    return {"koota": "Gana", "maxScore": 6, "score": score, "compatibility": _compat_label(score, 6)}


def _bhakoot(sign1: str, sign2: str) -> dict:
    d = _sign_distance(sign1, sign2)
    rd = _sign_distance(sign2, sign1)
    bad_pairs = [{2, 12}, {6, 8}, {5, 9}]
    is_bad = {d, rd} in bad_pairs
    score = 0 if is_bad else 7
    return {"koota": "Bhakoot", "maxScore": 7, "score": score, "compatibility": _compat_label(score, 7)}


def _nadi(nak1: int, nak2: int) -> dict:
    n1, n2 = NAKSHATRA_NADI.get(nak1, "Aadi"), NAKSHATRA_NADI.get(nak2, "Aadi")
    same = n1 == n2
    score = 0 if same else 8
    return {"koota": "Nadi", "maxScore": 8, "score": score, "compatibility": "poor" if same else "excellent"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _overall_compat(total: float) -> str:
    if total >= 28:
        return "excellent"
    if total >= 21:
        return "good"
    if total >= 18:
        return "average"
    if total >= 14:
        return "below_average"
    return "poor"


def calculate_ashtakoota(
    nak_index_1: int,
    nak_index_2: int,
    moon_sign_1: str,
    moon_sign_2: str,
) -> dict:
    """Compute all 8 kootas. Returns {scores, totalScore, maxTotal, overallCompatibility}."""
    scores = [
        _varna(moon_sign_1, moon_sign_2),
        _vashya(moon_sign_1, moon_sign_2),
        _tara(nak_index_1, nak_index_2),
        _yoni(nak_index_1, nak_index_2),
        _graha_maitri(moon_sign_1, moon_sign_2),
        _gana(nak_index_1, nak_index_2),
        _bhakoot(moon_sign_1, moon_sign_2),
        _nadi(nak_index_1, nak_index_2),
    ]
    total = sum(s["score"] for s in scores)
    return {
        "scores": scores,
        "totalScore": total,
        "maxTotal": 36,
        "overallCompatibility": _overall_compat(total),
    }
