"""Agent 2 — Computational Metrologist.

Deterministic, NO LLM. Turns the birth record into pure-JSON astronomical
structures by calling the swisseph tools. Emits sidereal longitudes + houses +
per-planet whole-sign house placement + all 24 divisional charts (D1–D108) +
the full Vimshottari dasha timeline. Later phases add ashtakavarga and
write-through to the cache.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.swarm.state import ArohaSwarmState
from app.tools import swe_engine


def _to_utc(record: dict) -> datetime:
    """Combine the local birth date/time at the birth place into a UTC datetime."""
    date_str = record["date"]
    time_str = record.get("time", "12:00")
    parts = [int(p) for p in time_str.split(":")]
    hh, mm = parts[0], parts[1]
    ss = parts[2] if len(parts) > 2 else 0
    y, mo, d = (int(p) for p in date_str.split("-"))
    tz_name = record.get("timezone", "Asia/Kolkata")
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        # Fallback: treat as a fixed IST offset if the tz database lookup fails.
        tz = timezone(timedelta(hours=5, minutes=30))
    local = datetime(y, mo, d, hh, mm, ss, tzinfo=tz)
    return local.astimezone(timezone.utc)


def compute_metrology(record: dict) -> dict:
    """Pure function: birth record -> deterministic chart JSON (no LLM, no IO)."""
    dt_utc = _to_utc(record)
    jd = swe_engine.to_julian_day(dt_utc)

    positions = swe_engine.get_sidereal_longitudes(jd)
    houses = swe_engine.calculate_houses(jd, record["latitude"], record["longitude"])
    asc_idx = houses.ascendant_sign_index

    planets = []
    for pos in positions.values():
        d = pos.as_dict()
        d["house"] = swe_engine.house_of(pos.sign_index, asc_idx)
        planets.append(d)

    from app.tools.varga import calculate_all_vargas
    from app.tools.vimshottari import calculate_vimshottari_dasha

    vargas = calculate_all_vargas(positions, houses.ascendant)

    moon = positions.get("Moon")
    vimshottari = None
    if moon:
        vimshottari = calculate_vimshottari_dasha(
            moon.longitude, dt_utc,
        ).as_dict()

    sign_lords = {
        "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury", "Cancer": "Moon",
        "Leo": "Sun", "Virgo": "Mercury", "Libra": "Venus", "Scorpio": "Mars",
        "Sagittarius": "Jupiter", "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
    }
    houses_array = []
    for h_num in range(1, 13):
        sign_idx = (asc_idx + h_num - 1) % 12
        sign = swe_engine.SIGNS[sign_idx]
        house_planets = [p["planet"] for p in planets if p.get("house") == h_num]
        houses_array.append({
            "house": h_num,
            "cusp": sign_idx * 30.0,
            "sign": sign,
            "signIndex": sign_idx,
            "lord": sign_lords[sign],
            "planets": house_planets,
        })

    return {
        "julianDay": jd,
        "ascendant": houses.as_dict(),
        "planets": planets,
        "houses": houses_array,
        "divisionalCharts": vargas,
        "vimshottariDasha": vimshottari,
        "engineVersion": _engine_version(),
    }


def _engine_version() -> dict:
    from app.config import get_settings

    s = get_settings()
    return {
        "swe": "pyswisseph",
        "ayanamsa": s.ayanamsa,
        "ephemeris": "swieph" if s.se_ephe_path else "moseph",
        "ruleVersion": s.engine_rule_version,
    }


def metrologist_node(state: ArohaSwarmState) -> ArohaSwarmState:
    record = state.get("birth_record")
    if not record:
        return {"errors": ["birth_record_required"]}
    try:
        metrology = compute_metrology(record)
    except Exception as exc:  # noqa: BLE001 - surface as a structured error
        return {"errors": [f"metrology_failed: {exc}"]}
    return {"metrology": metrology}
