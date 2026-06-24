"""Agent 4 — Atmospheric Profiler (Carousels 2/3).

Reads metrology and produces the atmosphere state key with:
  - Ashtakavarga strength analysis (BAV/SAV)
  - Yoga detections (Gajakesari, Raj Yoga, Dhana Yoga, etc.)
  - Dosha detections (Mangal, Kaal Sarp, Sade Sati, Guru Chandal, etc.)
"""

from __future__ import annotations

from app.swarm.state import ArohaSwarmState
from app.tools.ashtakavarga import calculate_ashtakavarga
from app.tools.yogas import detect_all_yogas
from app.tools.doshas import detect_all_doshas


def profiler_node(state: ArohaSwarmState) -> dict:
    metrology = state.get("metrology")
    if not metrology:
        return {"warnings": ["profiler_skipped: no metrology"]}

    planets = metrology.get("planets", [])
    asc = metrology.get("ascendant", {})
    asc_sign_idx = asc.get("ascendantSignIndex", 0)

    planet_signs = {}
    for p in planets:
        planet_signs[p["planet"]] = p.get("signIndex", 0)

    av = calculate_ashtakavarga(planet_signs, asc_sign_idx)

    findings: list[dict] = []

    # Ashtakavarga findings
    for bhinna in av["bhinna"]:
        planet_name = bhinna["planet"]
        sign_idx = planet_signs.get(planet_name, 0)
        bindus = bhinna["bindus"][sign_idx]
        if bindus >= 5:
            findings.append({
                "id": f"f_sav_{planet_name.lower()}_strong",
                "kind": "sav",
                "claim": f"{planet_name} in a high-support sign ({bindus} bindus)",
                "evidence": {"planet": planet_name, "bindus": bindus, "signIndex": sign_idx},
            })
        elif bindus <= 2:
            findings.append({
                "id": f"f_sav_{planet_name.lower()}_weak",
                "kind": "sav",
                "claim": f"{planet_name} in a low-support sign ({bindus} bindus)",
                "evidence": {"planet": planet_name, "bindus": bindus, "signIndex": sign_idx},
            })

    # Yoga detections
    yoga_findings = detect_all_yogas(planets, asc_sign_idx)
    findings.extend(yoga_findings)

    # Dosha detections
    dosha_findings = detect_all_doshas(planets, asc_sign_idx)
    findings.extend(dosha_findings)

    atmosphere = {
        "ashtakavarga": av,
        "yogas": [f for f in yoga_findings],
        "doshas": [f for f in dosha_findings],
    }

    return {"atmosphere": atmosphere, "findings": findings}
