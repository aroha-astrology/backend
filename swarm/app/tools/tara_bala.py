"""Tara Bala (stellar strength) + Chandrabala (lunar strength).

Tara Bala: personalized daily quality based on the distance from the natal
nakshatra to the transit Moon's nakshatra. 9 Taras across 3 Paryayas.

Chandrabala: coarser check — transit Moon house from natal Moon.
Ashtama Chandra (8th house) is universally dreaded.
"""

from __future__ import annotations

TARA_NAMES = [
    "Janma", "Sampat", "Vipat", "Kshema", "Pratyari",
    "Sadhaka", "Naidhana", "Mitra", "Parama Mitra",
]

TARA_AUSPICIOUS = {
    "Janma": "neutral",
    "Sampat": "auspicious",
    "Vipat": "inauspicious",
    "Kshema": "auspicious",
    "Pratyari": "inauspicious",
    "Sadhaka": "auspicious",
    "Naidhana": "highly_inauspicious",
    "Mitra": "auspicious",
    "Parama Mitra": "highly_auspicious",
}

PARYAYA_NAMES = ["physical", "emotional", "spiritual"]

# Absolute discard zones (no remedy possible)
ABSOLUTE_DISCARDS = [
    (1, 1),  # Janma in 1st Paryaya
    (3, 2),  # Vipat in 2nd Paryaya
    (5, 3),  # Pratyari in 3rd Paryaya
    (7, 1),  # Naidhana in any Paryaya
    (7, 2),
    (7, 3),
]

# Remedies for non-absolute malefic taras
TARA_REMEDIES = {
    1: "Donate yellow pumpkins or leafy vegetables",
    3: "Donate jaggery",
    5: "Donate salt",
    7: "No remedy — avoid the day entirely",
}

CHANDRABALA_FAVORABLE = {1, 3, 6, 7, 10, 11}


def calculate_tara_bala(
    natal_nakshatra_index: int,
    transit_nakshatra_index: int,
) -> dict:
    """Calculate Tara Bala from natal to transit nakshatra.

    Args:
        natal_nakshatra_index: 0-26 (Ashwini=0 to Revati=26).
        transit_nakshatra_index: 0-26.

    Returns:
        {tara_number, tara_name, classification, paryaya, paryaya_name,
         is_absolute_discard, remedy}
    """
    count = ((transit_nakshatra_index - natal_nakshatra_index + 27) % 27) + 1
    tara_number = count % 9
    if tara_number == 0:
        tara_number = 9

    paryaya = ((count - 1) // 9) + 1  # 1, 2, or 3

    tara_name = TARA_NAMES[tara_number - 1]
    classification = TARA_AUSPICIOUS[tara_name]
    paryaya_name = PARYAYA_NAMES[paryaya - 1] if paryaya <= 3 else "spiritual"

    is_discard = (tara_number, paryaya) in ABSOLUTE_DISCARDS
    remedy = TARA_REMEDIES.get(tara_number) if classification in ("inauspicious", "highly_inauspicious", "neutral") else None

    return {
        "tara_number": tara_number,
        "tara_name": tara_name,
        "classification": classification,
        "paryaya": paryaya,
        "paryaya_name": paryaya_name,
        "is_absolute_discard": is_discard,
        "remedy": remedy,
    }


def calculate_chandrabala(
    natal_moon_sign: int,
    transit_moon_sign: int,
) -> dict:
    """Calculate Chandrabala — lunar strength from natal to transit Moon sign.

    Returns:
        {house, is_favorable, is_ashtama_chandra, classification}
    """
    house = ((transit_moon_sign - natal_moon_sign) % 12) + 1
    is_ashtama = house == 8
    is_favorable = house in CHANDRABALA_FAVORABLE

    if is_ashtama:
        classification = "highly_inauspicious"
    elif is_favorable:
        classification = "favorable"
    else:
        classification = "unfavorable"

    return {
        "house": house,
        "is_favorable": is_favorable,
        "is_ashtama_chandra": is_ashtama,
        "classification": classification,
    }


def daily_lunar_assessment(
    natal_nakshatra_index: int,
    natal_moon_sign: int,
    transit_nakshatra_index: int,
    transit_moon_sign: int,
) -> dict:
    """Combined Tara Bala + Chandrabala for daily assessment."""
    tara = calculate_tara_bala(natal_nakshatra_index, transit_nakshatra_index)
    chandra = calculate_chandrabala(natal_moon_sign, transit_moon_sign)

    if tara["is_absolute_discard"] or chandra["is_ashtama_chandra"]:
        overall = "avoid"
    elif tara["classification"] in ("auspicious", "highly_auspicious") and chandra["is_favorable"]:
        overall = "excellent"
    elif tara["classification"] in ("auspicious", "highly_auspicious"):
        overall = "good_with_caution"
    elif chandra["is_favorable"]:
        overall = "moderate"
    else:
        overall = "challenging"

    return {
        "tara_bala": tara,
        "chandrabala": chandra,
        "overall": overall,
    }
