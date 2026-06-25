"""Agent 3 — Transit & Dasha Synthesizer (Carousel 1).

Reads the deterministic metrology (planets, dashas, ashtakavarga) and produces
the synthesis state key. Phase 2 stub: deterministic summary from chart data.
Full NIM generation lands in Phase 2.5 with PresentationBlock output.
"""

from __future__ import annotations

from app.swarm.state import ArohaSwarmState


def synthesizer_node(state: ArohaSwarmState) -> dict:
    metrology = state.get("metrology")
    if not metrology:
        return {"warnings": ["synthesizer_skipped: no metrology"]}

    dasha = metrology.get("vimshottariDasha", {})
    md = dasha.get("currentMahadasha")
    ad = dasha.get("currentAntardasha")

    findings: list[dict] = []

    if md:
        findings.append({
            "id": f"f_md_{md['planet'].lower()}",
            "kind": "dasha",
            "claim": f"Currently running {md['planet']} Mahadasha",
            "evidence": {"startDate": md.get("startDate"), "endDate": md.get("endDate")},
        })
    if ad:
        findings.append({
            "id": f"f_ad_{ad['planet'].lower()}",
            "kind": "dasha",
            "claim": f"Currently running {ad['planet']} Antardasha within {md['planet'] if md else '?'} Mahadasha",
            "evidence": {"startDate": ad.get("startDate"), "endDate": ad.get("endDate")},
        })

    synthesis = {
        "currentDasha": {
            "mahadasha": md["planet"] if md else None,
            "antardasha": ad["planet"] if ad else None,
        },
        "status": "deterministic_stub",
    }

    return {"synthesis": synthesis, "findings": findings}
