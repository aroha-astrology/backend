"""Divisional chart (varga) calculations — Shodashvarga + extended divisions.

Port of jyotish-backend/packages/astro-engine/src/charts/divisionalCharts.ts.
Each function takes a planet's sidereal longitude (0–360) and returns the sign
index (0–11) in the respective divisional chart. All math is fully deterministic.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.tools.swe_engine import SIGNS


def _mod12(n: int) -> int:
    return ((n % 12) + 12) % 12


def _sign_index(longitude: float) -> int:
    return int(math.floor(((longitude % 360) + 360) % 360 / 30))


def _sign_degree(longitude: float) -> float:
    n = longitude % 360
    if n < 0:
        n += 360
    return n % 30


def _is_odd_sign(idx: int) -> bool:
    return idx % 2 == 0


def _sign_element(idx: int) -> int:
    return idx % 4


def _sign_modality(idx: int) -> int:
    return idx % 3


# ---------------------------------------------------------------------------
# Individual varga calculators
# ---------------------------------------------------------------------------

def calc_d1(longitude: float) -> int:
    return _sign_index(longitude)


def calc_d2(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    first_half = deg < 15
    if _is_odd_sign(si):
        return 4 if first_half else 3
    else:
        return 3 if first_half else 4


def calc_d3(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 10)
    offsets = [0, 4, 8]
    return _mod12(si + offsets[part])


def calc_d4(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 7.5)
    offsets = [0, 3, 6, 9]
    return _mod12(si + offsets[part])


def calc_d5(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 6)
    return _mod12(si + part)


def calc_d6(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 5)
    return _mod12(si + part)


def calc_d7(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 7
    part = int(deg // part_size)
    start_sign = si if _is_odd_sign(si) else _mod12(si + 6)
    return _mod12(start_sign + part)


def calc_d8(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 3.75)
    return _mod12(si + part)


def calc_d9(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 9
    part = int(deg // part_size)
    element = _sign_element(si)
    start_signs = [0, 9, 6, 3]
    return _mod12(start_signs[element] + part)


def calc_d10(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 3)
    start_sign = si if _is_odd_sign(si) else _mod12(si + 8)
    return _mod12(start_sign + part)


def calc_d11(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 11
    part = int(deg // part_size)
    return _mod12(si + part)


def calc_d12(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part = int(deg // 2.5)
    return _mod12(si + part)


def calc_d14(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 14
    part = int(deg // part_size)
    return _mod12(si + part)


def calc_d16(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 16
    part = int(deg // part_size)
    modality = _sign_modality(si)
    start_signs = [0, 4, 8]
    return _mod12(start_signs[modality] + part)


def calc_d20(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 20
    part = int(deg // part_size)
    modality = _sign_modality(si)
    start_signs = [0, 8, 4]
    return _mod12(start_signs[modality] + part)


def calc_d21(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 21
    part = int(deg // part_size)
    return _mod12(si + part)


def calc_d24(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 24
    part = int(deg // part_size)
    start_sign = 4 if _is_odd_sign(si) else 3
    return _mod12(start_sign + part)


def calc_d27(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 27
    part = int(deg // part_size)
    element = _sign_element(si)
    start_signs = [0, 3, 6, 9]
    return _mod12(start_signs[element] + part)


def calc_d30(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    planet_to_sign = {
        "Mars": 0, "Saturn": 10, "Jupiter": 8, "Mercury": 2, "Venus": 6,
    }
    if _is_odd_sign(si):
        if deg < 5:
            ruler = "Mars"
        elif deg < 10:
            ruler = "Saturn"
        elif deg < 18:
            ruler = "Jupiter"
        elif deg < 25:
            ruler = "Mercury"
        else:
            ruler = "Venus"
    else:
        if deg < 5:
            ruler = "Venus"
        elif deg < 12:
            ruler = "Mercury"
        elif deg < 20:
            ruler = "Jupiter"
        elif deg < 25:
            ruler = "Saturn"
        else:
            ruler = "Mars"
    return planet_to_sign[ruler]


def calc_d40(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 40
    part = int(deg // part_size)
    start_sign = 0 if _is_odd_sign(si) else 6
    return _mod12(start_sign + part)


def calc_d45(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 45
    part = int(deg // part_size)
    modality = _sign_modality(si)
    start_signs = [0, 4, 8]
    return _mod12(start_signs[modality] + part)


def calc_d60(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 60
    part = int(deg // part_size)
    return _mod12(si + part)


def calc_d81(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 81
    part = int(deg // part_size)
    return _mod12(si + part)


def calc_d108(longitude: float) -> int:
    si = _sign_index(longitude)
    deg = _sign_degree(longitude)
    part_size = 30 / 108
    part = int(deg // part_size)
    return _mod12(si + part)


# ---------------------------------------------------------------------------
# Lookup and entry point
# ---------------------------------------------------------------------------

DIVISIONAL_CALCULATORS: dict[str, callable] = {
    "D1": calc_d1, "D2": calc_d2, "D3": calc_d3, "D4": calc_d4,
    "D5": calc_d5, "D6": calc_d6, "D7": calc_d7, "D8": calc_d8,
    "D9": calc_d9, "D10": calc_d10, "D11": calc_d11, "D12": calc_d12,
    "D14": calc_d14, "D16": calc_d16, "D20": calc_d20, "D21": calc_d21,
    "D24": calc_d24, "D27": calc_d27, "D30": calc_d30,
    "D40": calc_d40, "D45": calc_d45, "D60": calc_d60,
    "D81": calc_d81, "D108": calc_d108,
}

CHART_TYPES = list(DIVISIONAL_CALCULATORS.keys())


@dataclass(frozen=True)
class VargaEntry:
    planet: str
    sign: str
    sign_index: int

    def as_dict(self) -> dict:
        return {"planet": self.planet, "sign": self.sign, "signIndex": self.sign_index}


def calculate_all_vargas(
    planets: dict[str, "PlanetPosition"],
    ascendant_longitude: float,
) -> dict[str, dict]:
    """Compute all 24 divisional charts for the given planet positions.

    Returns a dict keyed by chart type ("D1" .. "D108"), each value containing:
      - "planets": list of VargaEntry dicts
      - "ascendantSignIndex": the varga lagna sign index
    """
    from app.tools.swe_engine import PlanetPosition

    result: dict[str, dict] = {}
    for chart_type, calc in DIVISIONAL_CALCULATORS.items():
        entries = []
        for name, pos in planets.items():
            si = calc(pos.longitude)
            entries.append(VargaEntry(planet=name, sign=SIGNS[si], sign_index=si).as_dict())
        asc_si = calc(ascendant_longitude)
        result[chart_type] = {
            "planets": entries,
            "ascendantSignIndex": asc_si,
            "_lagna": {chart_type: asc_si},
        }
    return result
