"""Panchaka remainder — aggregate daily danger classification.

Formula: (Tithi + Vara + Nakshatra + Lagna) mod 9
Maps remainder to Mrithyu/Agni/Raja/Chora/Roga Panchaka or auspicious.
"""

from __future__ import annotations

PANCHAKA_RESULTS: dict[int, dict] = {
    0: {"name": "Auspicious", "danger": None, "safe": True},
    1: {"name": "Mrithyu Panchaka", "danger": "Severe danger of death / extreme peril", "safe": False},
    2: {"name": "Agni Panchaka", "danger": "Danger from fire or explosive forces", "safe": False},
    3: {"name": "Auspicious", "danger": None, "safe": True},
    4: {"name": "Raja Panchaka", "danger": "Evil from authority / legal disputes", "safe": False},
    5: {"name": "Auspicious", "danger": None, "safe": True},
    6: {"name": "Chora Panchaka", "danger": "Danger of theft / deception / fraud", "safe": False},
    7: {"name": "Auspicious", "danger": None, "safe": True},
    8: {"name": "Roga Panchaka", "danger": "Severe health deterioration / disease", "safe": False},
}


def compute_panchaka(
    tithi_index: int,
    vara_index: int,
    nakshatra_index: int,
    lagna_index: int = 0,
) -> dict:
    """Compute Panchaka remainder for daily auspiciousness.

    Args:
        tithi_index: 1-30 (Pratipada=1 to Amavasya=30).
        vara_index: 1-7 (Sunday=1 to Saturday=7).
        nakshatra_index: 1-27 (Ashwini=1 to Revati=27).
        lagna_index: 1-12 (Aries=1 to Pisces=12), the rising sign at the moment.

    Returns:
        {remainder, name, danger, safe, formula_sum}
    """
    total = tithi_index + vara_index + nakshatra_index + lagna_index
    remainder = total % 9

    result = PANCHAKA_RESULTS.get(remainder, PANCHAKA_RESULTS[0])
    return {
        "remainder": remainder,
        "name": result["name"],
        "danger": result["danger"],
        "safe": result["safe"],
        "formula_sum": total,
    }
