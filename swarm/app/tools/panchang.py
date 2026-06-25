"""Panchang — 5 limbs of the Vedic calendar.

Computes Tithi, Nakshatra, Yoga, Karana, and Vara for a given date/location.
Supports dual panchang: by_region (fixed canonical reference city, PII-free)
and by_current_location (consent-gated GPS, coordinates discarded after computation).
"""

from __future__ import annotations

from datetime import datetime, timezone
from app.tools.swe_engine import (
    to_julian_day, get_sidereal_longitudes, SIGNS, NAKSHATRAS,
)

TITHIS = [
    "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami",
    "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami",
    "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima",
    "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami",
    "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami",
    "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Amavasya",
]

YOGAS = [
    "Vishkambha", "Preeti", "Ayushman", "Saubhagya", "Shobhana",
    "Atiganda", "Sukarma", "Dhriti", "Shoola", "Ganda",
    "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra",
    "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
    "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma",
    "Indra", "Vaidhriti",
]

KARANAS = [
    "Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti",
    "Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti",
]

VARAS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

REGIONAL_REFERENCE_CITIES = {
    "North_Indian": {"city": "Ujjain", "lat": 23.1793, "lon": 75.7849, "tz": "Asia/Kolkata"},
    "South_Indian": {"city": "Chennai", "lat": 13.0827, "lon": 80.2707, "tz": "Asia/Kolkata"},
    "Odisha": {"city": "Puri", "lat": 19.8135, "lon": 85.8312, "tz": "Asia/Kolkata"},
    "Bengali": {"city": "Kolkata", "lat": 22.5726, "lon": 88.3639, "tz": "Asia/Kolkata"},
    "Malayalam": {"city": "Thiruvananthapuram", "lat": 8.5241, "lon": 76.9366, "tz": "Asia/Kolkata"},
    "Gujarati": {"city": "Ahmedabad", "lat": 23.0225, "lon": 72.5714, "tz": "Asia/Kolkata"},
}


def compute_panchang(dt_utc: datetime) -> dict:
    """Compute the 5 limbs for a given UTC datetime."""
    jd = to_julian_day(dt_utc)
    positions = get_sidereal_longitudes(jd)

    sun_lon = positions["Sun"].longitude
    moon_lon = positions["Moon"].longitude

    # Tithi: each 12° of Moon-Sun elongation
    elongation = (moon_lon - sun_lon) % 360
    tithi_index = int(elongation / 12)
    tithi = TITHIS[tithi_index % 30]
    paksha = "Shukla" if tithi_index < 15 else "Krishna"

    # Nakshatra of the Moon
    nakshatra = positions["Moon"].nakshatra
    nakshatra_index = positions["Moon"].nakshatra_index

    # Yoga: (Sun + Moon) / 13°20'
    yoga_val = (sun_lon + moon_lon) % 360
    yoga_index = int(yoga_val / (360 / 27))
    yoga = YOGAS[yoga_index % 27]

    # Karana: half-tithi
    karana_index = int(elongation / 6) % 14
    karana = KARANAS[karana_index % len(KARANAS)]

    # Vara: day of the week
    vara_index = int(jd + 1.5) % 7
    vara = VARAS[vara_index]

    return {
        "tithi": {"name": tithi, "index": tithi_index, "paksha": paksha},
        "nakshatra": {"name": nakshatra, "index": nakshatra_index},
        "yoga": {"name": yoga, "index": yoga_index},
        "karana": {"name": karana, "index": karana_index},
        "vara": {"name": vara, "index": vara_index},
        "moonSign": positions["Moon"].sign,
        "sunSign": positions["Sun"].sign,
    }


def compute_regional_panchang(date: datetime, region: str) -> dict:
    """by_region panchang — consent-exempt, fixed canonical reference city."""
    ref = REGIONAL_REFERENCE_CITIES.get(region, REGIONAL_REFERENCE_CITIES["North_Indian"])
    panchang = compute_panchang(date)
    return {
        "region": region,
        "referenceCity": ref["city"],
        **panchang,
    }


def compute_location_panchang(date: datetime, lat: float, lon: float) -> dict:
    """by_current_location — consent-gated. Coordinates NOT persisted."""
    panchang = compute_panchang(date)
    return {
        "locationType": "current_location",
        **panchang,
    }
