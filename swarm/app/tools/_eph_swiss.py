"""pyswisseph backend (production / high precision).

Imported only when the native `swisseph` module is available. Exposes the two
functions the facade needs: `raw_longitudes(jd)` and `ascendant(jd, lat, lon)`.
"""

from __future__ import annotations

import swisseph as swe

from app.config import get_settings

_SWE_IDS = {
    "Sun": swe.SUN,
    "Moon": swe.MOON,
    "Mars": swe.MARS,
    "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER,
    "Venus": swe.VENUS,
    "Saturn": swe.SATURN,
    "Rahu": swe.MEAN_NODE,
}

_AYANAMSA_MODES = {"lahiri": swe.SIDM_LAHIRI}
_initialized = False


def _ensure_init() -> int:
    global _initialized
    settings = get_settings()
    if not _initialized:
        swe.set_sid_mode(_AYANAMSA_MODES.get(settings.ayanamsa.lower(), swe.SIDM_LAHIRI), 0, 0)
        if settings.se_ephe_path:
            swe.set_ephe_path(settings.se_ephe_path)
        _initialized = True
    eph_flag = swe.FLG_SWIEPH if settings.se_ephe_path else swe.FLG_MOSEPH
    return swe.FLG_SIDEREAL | swe.FLG_SPEED | eph_flag


def raw_longitudes(jd_ut: float) -> dict[str, tuple[float, float]]:
    flags = _ensure_init()
    out: dict[str, tuple[float, float]] = {}
    for name, swe_id in _SWE_IDS.items():
        xx, _ = swe.calc_ut(jd_ut, swe_id, flags)
        out[name] = (xx[0] % 360.0, xx[3])
    return out


def ascendant(jd_ut: float, latitude: float, longitude: float) -> float:
    flags = _ensure_init()
    _cusps, ascmc = swe.houses_ex(jd_ut, latitude, longitude, b"W", flags)
    return ascmc[0] % 360.0
