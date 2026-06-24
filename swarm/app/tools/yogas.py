"""Yoga detectors — classical Vedic planetary combinations.

Port of jyotish-backend/packages/astro-engine/src/yogas/index.ts.
Each detector takes planet positions + houses and returns a Finding dict
for the verified findings pipeline.
"""

from __future__ import annotations

from app.tools.swe_engine import SIGNS

SIGN_LORDS = {
    "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury", "Cancer": "Moon",
    "Leo": "Sun", "Virgo": "Mercury", "Libra": "Venus", "Scorpio": "Mars",
    "Sagittarius": "Jupiter", "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
}

EXALT = {"Sun": "Aries", "Moon": "Taurus", "Mars": "Capricorn", "Mercury": "Virgo",
         "Jupiter": "Cancer", "Venus": "Pisces", "Saturn": "Libra"}

DEBIL = {"Sun": "Libra", "Moon": "Scorpio", "Mars": "Cancer", "Mercury": "Pisces",
         "Jupiter": "Capricorn", "Venus": "Virgo", "Saturn": "Aries"}

OWN = {"Sun": ["Leo"], "Moon": ["Cancer"], "Mars": ["Aries", "Scorpio"],
       "Mercury": ["Gemini", "Virgo"], "Jupiter": ["Sagittarius", "Pisces"],
       "Venus": ["Taurus", "Libra"], "Saturn": ["Capricorn", "Aquarius"]}

KENDRA = {1, 4, 7, 10}
TRIKONA = {1, 5, 9}
DUSTHANA = {6, 8, 12}
BENEFICS = {"Jupiter", "Venus", "Moon", "Mercury"}


def _house(planet_sign_idx: int, asc_sign_idx: int) -> int:
    return ((planet_sign_idx - asc_sign_idx) % 12) + 1


def detect_all_yogas(planets: list[dict], asc_sign_idx: int) -> list[dict]:
    """Detect all yogas from planet positions. Returns list of Finding dicts."""
    findings: list[dict] = []
    planet_map = {p["planet"]: p for p in planets}

    # Gajakesari Yoga: Jupiter in kendra from Moon
    moon = planet_map.get("Moon")
    jupiter = planet_map.get("Jupiter")
    if moon and jupiter:
        dist = ((jupiter["signIndex"] - moon["signIndex"]) % 12) + 1
        if dist in KENDRA:
            findings.append({
                "id": "f_yoga_gajakesari",
                "kind": "yoga",
                "claim": "Gajakesari Yoga — Jupiter in kendra from Moon grants wisdom, wealth, and fame",
                "evidence": {"jupiter_house_from_moon": dist},
            })

    # Pancha Mahapurusha Yogas
    for planet, yoga_name, desc in [
        ("Mars", "Ruchaka", "courage, leadership, authority"),
        ("Mercury", "Bhadra", "intellect, eloquence, business acumen"),
        ("Jupiter", "Hamsa", "wisdom, spirituality, high status"),
        ("Venus", "Malavya", "beauty, wealth, artistic talents"),
        ("Saturn", "Shasha", "discipline, authority, organizational power"),
    ]:
        p = planet_map.get(planet)
        if p:
            h = p.get("house", _house(p["signIndex"], asc_sign_idx))
            sign = p["sign"]
            if h in KENDRA and (sign == EXALT.get(planet) or sign in OWN.get(planet, [])):
                findings.append({
                    "id": f"f_yoga_{yoga_name.lower()}",
                    "kind": "yoga",
                    "claim": f"{yoga_name} Yoga — {planet} in own/exalted sign in kendra grants {desc}",
                    "evidence": {"planet": planet, "house": h, "sign": sign},
                })

    # Raj Yoga: lord of trikona + lord of kendra in conjunction or mutual aspect
    for tk_house in [5, 9]:
        tk_sign_idx = (asc_sign_idx + tk_house - 1) % 12
        tk_lord = SIGN_LORDS[SIGNS[tk_sign_idx]]
        for kd_house in [1, 4, 7, 10]:
            kd_sign_idx = (asc_sign_idx + kd_house - 1) % 12
            kd_lord = SIGN_LORDS[SIGNS[kd_sign_idx]]
            if tk_lord == kd_lord:
                continue
            tk_p = planet_map.get(tk_lord)
            kd_p = planet_map.get(kd_lord)
            if tk_p and kd_p and tk_p["signIndex"] == kd_p["signIndex"]:
                findings.append({
                    "id": f"f_yoga_raj_{tk_lord}_{kd_lord}".lower(),
                    "kind": "yoga",
                    "claim": f"Raj Yoga — {tk_lord} (lord of {tk_house}th) conjunct {kd_lord} (lord of {kd_house}th)",
                    "evidence": {"trikona_lord": tk_lord, "kendra_lord": kd_lord},
                })

    # Dhana Yoga: lord of 2nd and 11th in kendra/trikona
    for dh_house in [2, 11]:
        dh_sign_idx = (asc_sign_idx + dh_house - 1) % 12
        dh_lord = SIGN_LORDS[SIGNS[dh_sign_idx]]
        dh_p = planet_map.get(dh_lord)
        if dh_p:
            h = dh_p.get("house", _house(dh_p["signIndex"], asc_sign_idx))
            if h in (KENDRA | TRIKONA):
                findings.append({
                    "id": f"f_yoga_dhana_{dh_lord}_{dh_house}".lower(),
                    "kind": "yoga",
                    "claim": f"Dhana Yoga — {dh_lord} (lord of {dh_house}th) placed in house {h} (kendra/trikona)",
                    "evidence": {"planet": dh_lord, "house": h},
                })

    # Neech Bhang Raj Yoga: debilitated planet with cancellation
    for planet, debil_sign in DEBIL.items():
        p = planet_map.get(planet)
        if p and p["sign"] == debil_sign:
            debil_lord = SIGN_LORDS[debil_sign]
            dl_p = planet_map.get(debil_lord)
            if dl_p:
                dl_h = dl_p.get("house", _house(dl_p["signIndex"], asc_sign_idx))
                if dl_h in KENDRA:
                    findings.append({
                        "id": f"f_yoga_neechbhang_{planet}".lower(),
                        "kind": "yoga",
                        "claim": f"Neech Bhang Raj Yoga — {planet} debilitated but lord {debil_lord} in kendra cancels it",
                        "evidence": {"planet": planet, "cancellation_lord": debil_lord},
                    })

    # Kemadrama Yoga: no planet in 2nd or 12th from Moon (except Sun, Rahu, Ketu)
    if moon:
        moon_h = moon.get("house", _house(moon["signIndex"], asc_sign_idx))
        h2_sign = (moon["signIndex"] + 1) % 12
        h12_sign = (moon["signIndex"] - 1) % 12
        adjacent_planets = [
            p for p in planets
            if p["planet"] not in ("Moon", "Sun", "Rahu", "Ketu")
            and p["signIndex"] in (h2_sign, h12_sign)
        ]
        if not adjacent_planets:
            findings.append({
                "id": "f_yoga_kemadruma",
                "kind": "yoga",
                "claim": "Kemadruma Yoga — Moon isolated (no planets in 2nd/12th from Moon)",
                "evidence": {"moon_sign": moon["sign"]},
            })

    return findings
