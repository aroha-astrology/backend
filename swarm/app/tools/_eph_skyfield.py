"""skyfield backend (pure-Python fallback for no-compiler environments).

Geometric positions via the DE421 ephemeris (downloaded once to .skyfield_data),
converted tropical→sidereal with the Lahiri ayanamsa. Rahu is the *mean* lunar
node (Meeus polynomial), Ketu is derived by the facade. Accuracy ~arcminute —
suitable for dev/CI, not production chart delivery (use the pyswisseph backend).
"""

from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path

from skyfield.api import Loader

_DATA_DIR = Path(__file__).resolve().parents[2] / ".skyfield_data"
_DATA_DIR.mkdir(exist_ok=True)
_loader = Loader(str(_DATA_DIR), verbose=False)

# Skyfield ephemeris body keys for the seven visible grahas.
_BODIES = {
    "Sun": "sun",
    "Moon": "moon",
    "Mars": "mars",
    "Mercury": "mercury",
    "Venus": "venus",
    "Jupiter": "jupiter barycenter",
    "Saturn": "saturn barycenter",
}


@lru_cache(maxsize=1)
def _eph():
    return _loader("de421.bsp")


@lru_cache(maxsize=1)
def _ts():
    return _loader.timescale()


def _ecliptic_lon_of_date(jd_ut: float, body_key: str) -> float:
    """Apparent geocentric tropical ecliptic longitude (of date), degrees."""
    eph = _eph()
    t = _ts().ut1_jd(jd_ut)
    astrometric = eph["earth"].at(t).observe(eph[body_key]).apparent()
    _lat, lon, _dist = astrometric.ecliptic_latlon(epoch="date")
    return lon.degrees % 360.0


def _mean_node_tropical(jd_ut: float) -> float:
    """Mean lunar ascending node Ω (Rahu), tropical, degrees (Meeus 47.7)."""
    t = (jd_ut - 2451545.0) / 36525.0
    omega = (
        125.0445479
        - 1934.1362891 * t
        + 0.0020754 * t * t
        + (t ** 3) / 467441.0
        - (t ** 4) / 60616000.0
    )
    return omega % 360.0


def raw_longitudes(jd_ut: float) -> dict[str, tuple[float, float]]:
    from app.tools.swe_engine import lahiri_ayanamsa

    ay = lahiri_ayanamsa(jd_ut)
    dt = 0.5  # half-day step for a finite-difference speed (retrograde detection)
    out: dict[str, tuple[float, float]] = {}
    for name, key in _BODIES.items():
        lon0 = _ecliptic_lon_of_date(jd_ut, key)
        lon1 = _ecliptic_lon_of_date(jd_ut + dt, key)
        speed = (((lon1 - lon0 + 180) % 360) - 180) / dt  # deg/day, signed
        out[name] = ((lon0 - ay) % 360.0, speed)

    rahu = (_mean_node_tropical(jd_ut) - ay) % 360.0
    out["Rahu"] = (rahu, -0.0529539)  # mean node is always retrograde
    return out


def ascendant(jd_ut: float, latitude: float, longitude: float) -> float:
    from app.tools.swe_engine import ascendant_sidereal

    return ascendant_sidereal(jd_ut, latitude, longitude)
