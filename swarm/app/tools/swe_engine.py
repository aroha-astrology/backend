"""Ephemeris facade — the deterministic core of the Metrologist.

Pure CPU, no LLM, no network at call time. Computes sidereal (Lahiri) planetary
longitudes, the ascendant, and whole-sign house placement.

It selects a backend at import:
  * `pyswisseph` (high precision) when the native module is importable — this is
    the production path (Linux/CI/any machine with the wheel or a C toolchain).
  * a pure-Python `skyfield` fallback otherwise (e.g. Windows dev without MSVC),
    so the full service + tests run anywhere. The fallback is good to ~arcminute
    and is clearly NOT for production-grade chart delivery.

All natal math uses the birth-place latitude/longitude + the birth-time-in-UT
(the caller converts local civil time → UT first; intra-India longitude spans
~2h of local time, which shifts the ascendant, so birth coordinates matter).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
    "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
    "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta",
    "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
]

# Vedic order; Ketu is derived as Rahu + 180°.
PLANET_ORDER = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu"]


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PlanetPosition:
    planet: str
    longitude: float        # sidereal ecliptic longitude, 0–360
    sign: str
    sign_index: int         # 0–11
    sign_degree: float      # 0–30 within the sign
    nakshatra: str
    nakshatra_index: int    # 0–26
    retrograde: bool
    speed: float

    def as_dict(self) -> dict:
        return {
            "planet": self.planet,
            "longitude": round(self.longitude, 6),
            "sign": self.sign,
            "signIndex": self.sign_index,
            "signDegree": round(self.sign_degree, 6),
            "nakshatra": self.nakshatra,
            "nakshatraIndex": self.nakshatra_index,
            "isRetrograde": self.retrograde,
            "speed": round(self.speed, 6),
        }


@dataclass(frozen=True)
class Houses:
    ascendant: float
    ascendant_sign: str
    ascendant_sign_index: int
    cusps: list[float]

    def as_dict(self) -> dict:
        return {
            "ascendant": round(self.ascendant, 6),
            "ascendantSign": self.ascendant_sign,
            "ascendantSignIndex": self.ascendant_sign_index,
            "cusps": [round(c, 6) for c in self.cusps],
        }


# ---------------------------------------------------------------------------
# Shared astronomy helpers (backend-independent)
# ---------------------------------------------------------------------------
def to_julian_day(dt_utc: datetime) -> float:
    """Julian Day (UT) for a tz-aware or naive-UTC datetime (Gregorian calendar)."""
    if dt_utc.tzinfo is not None:
        dt_utc = dt_utc.astimezone(timezone.utc)
    y, m = dt_utc.year, dt_utc.month
    day_frac = dt_utc.day + (dt_utc.hour + dt_utc.minute / 60 + dt_utc.second / 3600) / 24
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + day_frac + b - 1524.5


def lahiri_ayanamsa(jd: float) -> float:
    """Lahiri (Chitrapaksha) ayanamsa in degrees.

    Linear approximation anchored at J2000 (≈23.85°, +50.2719"/yr). Accurate to a
    few arcminutes over the supported range — fine for the dev fallback. The
    pyswisseph backend uses Swiss Ephemeris' exact Lahiri model instead.
    """
    years_from_j2000 = (jd - 2451545.0) / 365.25
    return 23.853 + (50.2719 / 3600.0) * years_from_j2000


def _obliquity(jd: float) -> float:
    t = (jd - 2451545.0) / 36525.0
    return 23.439291 - 0.0130042 * t - 1.64e-7 * t * t


def _gmst_deg(jd: float) -> float:
    t = (jd - 2451545.0) / 36525.0
    gmst = (
        280.46061837
        + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * t * t
        - (t ** 3) / 38710000.0
    )
    return gmst % 360.0


def ascendant_sidereal(jd: float, latitude: float, longitude_east: float) -> float:
    """Sidereal ecliptic longitude of the lagna (ascendant).

    Standard RAMC-based ascendant formula, then de-precessed by the Lahiri
    ayanamsa. Used by the fallback backend (and as a cross-check).
    """
    eps = math.radians(_obliquity(jd))
    lst = math.radians((_gmst_deg(jd) + longitude_east) % 360.0)
    phi = math.radians(latitude)
    y = math.cos(lst)
    x = -(math.sin(lst) * math.cos(eps) + math.tan(phi) * math.sin(eps))
    asc_trop = math.degrees(math.atan2(y, x)) % 360.0
    return (asc_trop - lahiri_ayanamsa(jd)) % 360.0


def _decompose(longitude: float) -> tuple[int, float, int]:
    lon = longitude % 360.0
    sign_index = int(lon // 30)
    sign_degree = lon - sign_index * 30
    nak_index = int(lon // (360.0 / 27))
    return sign_index, sign_degree, nak_index


def _position(name: str, longitude: float, speed: float) -> PlanetPosition:
    # Coerce to native Python types — backends (e.g. skyfield) may hand us
    # numpy scalars, which pydantic/orjson cannot serialize.
    longitude = float(longitude)
    speed = float(speed)
    sign_index, sign_degree, nak_index = _decompose(longitude)
    return PlanetPosition(
        planet=name,
        longitude=longitude % 360.0,
        sign=SIGNS[sign_index],
        sign_index=int(sign_index),
        sign_degree=float(sign_degree),
        nakshatra=NAKSHATRAS[nak_index],
        nakshatra_index=int(nak_index),
        retrograde=bool(speed < 0),
        speed=speed,
    )


def house_of(planet_sign_index: int, ascendant_sign_index: int) -> int:
    """Whole-sign house number (1–12) of a planet given the ascendant sign."""
    return ((planet_sign_index - ascendant_sign_index) % 12) + 1


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------
def _load_backend():
    try:
        from app.tools import _eph_swiss as backend  # noqa: F401

        return backend, "pyswisseph"
    except Exception:  # noqa: BLE001 - swisseph not importable → fall back
        from app.tools import _eph_skyfield as backend

        return backend, "skyfield"


_BACKEND, BACKEND_NAME = _load_backend()


def get_sidereal_longitudes(jd_ut: float) -> dict[str, PlanetPosition]:
    """Sidereal (Lahiri) longitudes for the 9 grahas at the given Julian Day (UT)."""
    raw = _BACKEND.raw_longitudes(jd_ut)  # dict[name -> (lon_sidereal, speed)]
    out: dict[str, PlanetPosition] = {}
    for name in PLANET_ORDER:
        lon, speed = raw[name]
        out[name] = _position(name, lon, speed)
    rahu = out["Rahu"]
    out["Ketu"] = _position("Ketu", rahu.longitude + 180.0, rahu.speed)
    return out


def calculate_houses(jd_ut: float, latitude: float, longitude: float) -> Houses:
    """Sidereal ascendant + whole-sign house cusps for the birth coordinates."""
    asc = _BACKEND.ascendant(jd_ut, latitude, longitude)
    asc_sign_index = int(asc // 30)
    cusps = [((asc_sign_index + i) % 12) * 30.0 for i in range(12)]
    return Houses(
        ascendant=asc,
        ascendant_sign=SIGNS[asc_sign_index],
        ascendant_sign_index=asc_sign_index,
        cusps=cusps,
    )
