"""Dosha detectors — afflictions in the natal chart.

Port of jyotish-backend/packages/astro-engine/src/doshas/*.ts.
Each detector returns a Finding dict for the verified findings pipeline.
"""

from __future__ import annotations

from app.tools.swe_engine import SIGNS

KAAL_SARP_TYPES = {
    "1-7": "Anant", "2-8": "Kulik", "3-9": "Vasuki",
    "4-10": "Shankhpal", "5-11": "Padma", "6-12": "MahaPadma",
    "7-1": "Takshak", "8-2": "Karkotak", "9-3": "Shankhnaad",
    "10-4": "Ghatak", "11-5": "Vishdhar", "12-6": "Sheshnaag",
}


def _house(planet_sign_idx: int, asc_sign_idx: int) -> int:
    return ((planet_sign_idx - asc_sign_idx) % 12) + 1


def detect_all_doshas(
    planets: list[dict],
    asc_sign_idx: int,
    transit_saturn_sign_idx: int | None = None,
) -> list[dict]:
    """Detect all doshas. Returns list of Finding dicts."""
    findings: list[dict] = []
    planet_map = {p["planet"]: p for p in planets}

    # Mangal Dosha: Mars in 1, 2, 4, 7, 8, or 12th house
    mars = planet_map.get("Mars")
    if mars:
        mars_h = mars.get("house", _house(mars["signIndex"], asc_sign_idx))
        if mars_h in (1, 2, 4, 7, 8, 12):
            findings.append({
                "id": "f_dosha_mangal",
                "kind": "dosha",
                "claim": f"Mangal Dosha — Mars in {mars_h}th house affects marriage and partnerships",
                "evidence": {"mars_house": mars_h, "mars_sign": mars["sign"]},
            })

    # Kaal Sarp Dosha: all 7 planets between Rahu-Ketu axis
    rahu = planet_map.get("Rahu")
    ketu = planet_map.get("Ketu")
    if rahu and ketu:
        rahu_h = rahu.get("house", _house(rahu["signIndex"], asc_sign_idx))
        ketu_h = ketu.get("house", _house(ketu["signIndex"], asc_sign_idx))
        others = [p for p in planets if p["planet"] not in ("Rahu", "Ketu")]
        rahu_to_ketu = set()
        h = rahu_h
        while h != ketu_h:
            rahu_to_ketu.add(h)
            h = (h % 12) + 1
        rahu_to_ketu.add(ketu_h)

        all_between = all(
            p.get("house", _house(p["signIndex"], asc_sign_idx)) in rahu_to_ketu
            for p in others
        )
        if all_between:
            key = f"{rahu_h}-{ketu_h}"
            ks_type = KAAL_SARP_TYPES.get(key, "Unknown")
            findings.append({
                "id": "f_dosha_kaalsarp",
                "kind": "dosha",
                "claim": f"Kaal Sarp Dosha ({ks_type}) — all planets hemmed between Rahu-Ketu axis",
                "evidence": {"type": ks_type, "rahu_house": rahu_h, "ketu_house": ketu_h},
            })

    # Sade Sati: transit Saturn within 1 sign of natal Moon
    moon = planet_map.get("Moon")
    if moon and transit_saturn_sign_idx is not None:
        moon_sign_idx = moon["signIndex"]
        saturn_from_moon = ((transit_saturn_sign_idx - moon_sign_idx) % 12) + 1
        if saturn_from_moon in (12, 1, 2):
            phase_map = {12: "Rising (approaching)", 1: "Peak (over Moon)", 2: "Setting (departing)"}
            phase = phase_map.get(saturn_from_moon, "Active")
            findings.append({
                "id": "f_dosha_sadesati",
                "kind": "dosha",
                "claim": f"Sade Sati active — {phase} phase of Saturn's 7.5-year transit over natal Moon",
                "evidence": {"phase": phase, "saturn_house_from_moon": saturn_from_moon},
            })

    # Guru Chandal Dosha: Jupiter conjunct Rahu
    jupiter = planet_map.get("Jupiter")
    if jupiter and rahu and jupiter["signIndex"] == rahu["signIndex"]:
        findings.append({
            "id": "f_dosha_guruchandal",
            "kind": "dosha",
            "claim": "Guru Chandal Yoga — Jupiter conjunct Rahu corrupts wisdom and judgment",
            "evidence": {"sign": jupiter["sign"]},
        })

    # Grahan Dosha: Sun or Moon conjunct Rahu or Ketu
    sun = planet_map.get("Sun")
    for luminary_name, luminary in [("Sun", sun), ("Moon", moon)]:
        if not luminary:
            continue
        for node_name, node in [("Rahu", rahu), ("Ketu", ketu)]:
            if not node:
                continue
            if luminary["signIndex"] == node["signIndex"]:
                findings.append({
                    "id": f"f_dosha_grahan_{luminary_name}_{node_name}".lower(),
                    "kind": "dosha",
                    "claim": f"Grahan Dosha — {luminary_name} eclipsed by {node_name} in {luminary['sign']}",
                    "evidence": {"luminary": luminary_name, "node": node_name, "sign": luminary["sign"]},
                })

    # Pitra Dosha: Sun conjunct Rahu or Saturn in 9th house
    if sun and rahu and sun["signIndex"] == rahu["signIndex"]:
        findings.append({
            "id": "f_dosha_pitra_sun_rahu",
            "kind": "dosha",
            "claim": "Pitra Dosha — Sun conjunct Rahu indicates ancestral karmic debt",
            "evidence": {"sign": sun["sign"]},
        })

    return findings
