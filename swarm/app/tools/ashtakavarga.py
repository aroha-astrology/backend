"""Ashtakavarga (BAV/SAV) — benefic point calculation.

Port of jyotish-backend/packages/astro-engine/src/calculations/ashtakavarga.ts.
Classical Parashari rules: 7 planets + Ascendant as contributors, producing
Bhinna (individual) and Sarva (cumulative) Ashtakavarga tables.
"""

from __future__ import annotations

from dataclasses import dataclass

AV_PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]

BENEFIC_POINTS: dict[str, dict[str, list[int]]] = {
    "Sun": {
        "Sun": [1, 2, 4, 7, 8, 9, 10, 11], "Moon": [3, 6, 10, 11],
        "Mars": [1, 2, 4, 7, 8, 9, 10, 11], "Mercury": [3, 5, 6, 9, 10, 11, 12],
        "Jupiter": [5, 6, 9, 11], "Venus": [6, 7, 12],
        "Saturn": [1, 2, 4, 7, 8, 9, 10, 11], "Asc": [3, 4, 6, 10, 11, 12],
    },
    "Moon": {
        "Sun": [3, 6, 7, 8, 10, 11], "Moon": [1, 3, 6, 7, 10, 11],
        "Mars": [2, 3, 5, 6, 9, 10, 11], "Mercury": [1, 3, 4, 5, 7, 8, 10, 11],
        "Jupiter": [1, 4, 7, 8, 10, 11, 12], "Venus": [3, 4, 5, 7, 9, 10, 11],
        "Saturn": [3, 5, 6, 11], "Asc": [3, 6, 10, 11],
    },
    "Mars": {
        "Sun": [3, 5, 6, 10, 11], "Moon": [3, 6, 11],
        "Mars": [1, 2, 4, 7, 8, 10, 11], "Mercury": [3, 5, 6, 11],
        "Jupiter": [6, 10, 11, 12], "Venus": [6, 8, 11, 12],
        "Saturn": [1, 4, 7, 8, 9, 10, 11], "Asc": [1, 3, 6, 10, 11],
    },
    "Mercury": {
        "Sun": [5, 6, 9, 11, 12], "Moon": [2, 4, 6, 8, 10, 11],
        "Mars": [1, 2, 4, 7, 8, 9, 10, 11], "Mercury": [1, 3, 5, 6, 9, 10, 11, 12],
        "Jupiter": [6, 8, 11, 12], "Venus": [1, 2, 3, 4, 5, 8, 9, 11],
        "Saturn": [1, 2, 4, 7, 8, 9, 10, 11], "Asc": [1, 2, 4, 6, 8, 10, 11],
    },
    "Jupiter": {
        "Sun": [1, 2, 3, 4, 7, 8, 9, 10, 11], "Moon": [2, 5, 7, 9, 11],
        "Mars": [1, 2, 4, 7, 8, 10, 11], "Mercury": [1, 2, 4, 5, 6, 9, 10, 11],
        "Jupiter": [1, 2, 3, 4, 7, 8, 10, 11], "Venus": [2, 5, 6, 9, 10, 11],
        "Saturn": [3, 5, 6, 12], "Asc": [1, 2, 4, 5, 6, 7, 9, 10, 11],
    },
    "Venus": {
        "Sun": [8, 11, 12], "Moon": [1, 2, 3, 4, 5, 8, 9, 11, 12],
        "Mars": [3, 5, 6, 9, 11, 12], "Mercury": [3, 5, 6, 9, 11],
        "Jupiter": [5, 8, 9, 10, 11], "Venus": [1, 2, 3, 4, 5, 8, 9, 10, 11],
        "Saturn": [3, 4, 5, 8, 9, 10, 11], "Asc": [1, 2, 3, 4, 5, 8, 9, 11],
    },
    "Saturn": {
        "Sun": [1, 2, 4, 7, 8, 9, 10, 11], "Moon": [3, 6, 11],
        "Mars": [3, 5, 6, 10, 11, 12], "Mercury": [6, 8, 9, 10, 11, 12],
        "Jupiter": [5, 6, 11, 12], "Venus": [6, 11, 12],
        "Saturn": [3, 5, 6, 11], "Asc": [1, 3, 4, 6, 10, 11],
    },
}


def _house_to_sign(start_sign: int, house_offset: int) -> int:
    return (start_sign + house_offset - 1) % 12


@dataclass
class BhinnaEntry:
    planet: str
    bindus: list[int]
    total: int

    def as_dict(self) -> dict:
        return {"planet": self.planet, "bindus": self.bindus, "total": self.total}


@dataclass
class SarvaEntry:
    bindus: list[int]
    total: int

    def as_dict(self) -> dict:
        return {"bindus": self.bindus, "total": self.total}


def calculate_bhinna(planet_signs: dict[str, int], asc_sign: int) -> list[BhinnaEntry]:
    """Bhinna (individual) Ashtakavarga for 7 planets.

    Args:
        planet_signs: {planet_name: sign_index_0_11}
        asc_sign: ascendant sign index (0-11)
    """
    results: list[BhinnaEntry] = []
    for target in AV_PLANETS:
        bindus = [0] * 12
        rules = BENEFIC_POINTS.get(target, {})
        contributors = [*AV_PLANETS, "Asc"]
        for contrib in contributors:
            houses = rules.get(contrib, [])
            if contrib == "Asc":
                contrib_sign = asc_sign
            else:
                contrib_sign = planet_signs.get(contrib, 0)
            for h in houses:
                bindus[_house_to_sign(contrib_sign, h)] += 1
        results.append(BhinnaEntry(planet=target, bindus=bindus, total=sum(bindus)))
    return results


def calculate_sarva(bhinna: list[BhinnaEntry]) -> SarvaEntry:
    """Sarva (cumulative) Ashtakavarga — classical total should be 337."""
    sarva = [0] * 12
    for b in bhinna:
        for i in range(12):
            sarva[i] += b.bindus[i]
    return SarvaEntry(bindus=sarva, total=sum(sarva))


def calculate_ashtakavarga(planet_signs: dict[str, int], asc_sign: int) -> dict:
    """Complete Ashtakavarga (bhinna + sarva)."""
    bhinna = calculate_bhinna(planet_signs, asc_sign)
    sarva = calculate_sarva(bhinna)
    return {
        "bhinna": [b.as_dict() for b in bhinna],
        "sarva": sarva.as_dict(),
    }


def evaluate_sign_strength(sarva: SarvaEntry, sign_index: int) -> str:
    avg = sarva.total / 12
    val = sarva.bindus[sign_index]
    if val > avg + 1:
        return "strong"
    if val < avg - 1:
        return "weak"
    return "average"
