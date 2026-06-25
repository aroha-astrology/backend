"""Vimshottari Dasha calculation — 5-level period tree.

Port of jyotish-backend/packages/astro-engine/src/dashas/vimshottari.ts.
Pure deterministic math: Moon longitude + birth datetime → full 120-year dasha
timeline with sub-periods computed lazily (only the active branch is expanded
to 5 levels).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Constants (match the TS shared package exactly)
# ---------------------------------------------------------------------------

VIMSHOTTARI_ORDER = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
]

VIMSHOTTARI_YEARS: dict[str, int] = {
    "Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7,
    "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17,
}

VIMSHOTTARI_TOTAL_YEARS = 120

NAKSHATRA_SPAN = 360.0 / 27  # 13.3333...°

NAKSHATRA_LORDS = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
]

LEVEL_NAMES = ["mahadasha", "antardasha", "pratyantardasha", "sookshma", "prana"]

# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

_MS_PER_DAY = 86_400_000
_DAYS_PER_YEAR = 365.25
_MS_PER_YEAR = _DAYS_PER_YEAR * _MS_PER_DAY


def _add_years(dt: datetime, years: float) -> datetime:
    ms = dt.timestamp() * 1000 + years * _MS_PER_YEAR
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def _is_in_range(date: datetime, start: datetime, end: datetime) -> bool:
    t = date.timestamp()
    return start.timestamp() <= t < end.timestamp()


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class DashaPeriod:
    planet: str
    start_date: datetime
    end_date: datetime
    is_active: bool
    level: str
    sub_periods: list[DashaPeriod] = field(default_factory=list)

    def as_dict(self, include_sub: bool = True) -> dict:
        d = {
            "planet": self.planet,
            "startDate": self.start_date.isoformat(),
            "endDate": self.end_date.isoformat(),
            "isActive": self.is_active,
            "level": self.level,
        }
        if include_sub and self.sub_periods:
            d["subPeriods"] = [sp.as_dict(include_sub=True) for sp in self.sub_periods]
        return d


@dataclass
class VimshottariDasha:
    mahadashas: list[DashaPeriod]
    current_mahadasha: DashaPeriod | None
    current_antardasha: DashaPeriod | None
    current_pratyantardasha: DashaPeriod | None

    def as_dict(self) -> dict:
        return {
            "mahadashas": [m.as_dict() for m in self.mahadashas],
            "currentMahadasha": self.current_mahadasha.as_dict(include_sub=False) if self.current_mahadasha else None,
            "currentAntardasha": self.current_antardasha.as_dict(include_sub=False) if self.current_antardasha else None,
            "currentPratyantardasha": self.current_pratyantardasha.as_dict(include_sub=False) if self.current_pratyantardasha else None,
        }


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def _get_nakshatra_index(moon_longitude: float) -> int:
    normalized = ((moon_longitude % 360) + 360) % 360
    return int(normalized // NAKSHATRA_SPAN)


def _get_traversed_fraction(moon_longitude: float) -> float:
    normalized = ((moon_longitude % 360) + 360) % 360
    pos_in_nak = normalized % NAKSHATRA_SPAN
    return pos_in_nak / NAKSHATRA_SPAN


def _build_sub_periods(
    start_planet: str,
    start_date: datetime,
    parent_years: float,
    depth: int,
    current_date: datetime,
    max_depth: int = 4,
) -> list[DashaPeriod]:
    if depth > max_depth:
        return []

    level = LEVEL_NAMES[depth]
    start_idx = VIMSHOTTARI_ORDER.index(start_planet)
    periods: list[DashaPeriod] = []
    cursor = start_date

    for i in range(9):
        planet = VIMSHOTTARI_ORDER[(start_idx + i) % 9]
        duration_years = parent_years * (VIMSHOTTARI_YEARS[planet] / VIMSHOTTARI_TOTAL_YEARS)
        end_date = _add_years(cursor, duration_years)
        is_active = _is_in_range(current_date, cursor, end_date)

        period = DashaPeriod(
            planet=planet,
            start_date=cursor,
            end_date=end_date,
            is_active=is_active,
            level=level,
            sub_periods=(
                _build_sub_periods(planet, cursor, duration_years, depth + 1, current_date, max_depth)
                if is_active
                else []
            ),
        )
        periods.append(period)
        cursor = end_date

    return periods


def calculate_vimshottari_dasha(
    moon_longitude: float,
    birth_date: datetime,
    as_of: datetime | None = None,
) -> VimshottariDasha:
    """Calculate the full Vimshottari Dasha tree.

    Args:
        moon_longitude: Sidereal longitude of the Moon (0–360°).
        birth_date: Date/time of birth (tz-aware or naive-UTC).
        as_of: The "now" date for marking active periods. Defaults to utcnow.
    """
    now = as_of or datetime.now(tz=timezone.utc)
    if birth_date.tzinfo is None:
        birth_date = birth_date.replace(tzinfo=timezone.utc)

    nak_idx = _get_nakshatra_index(moon_longitude)
    starting_lord = NAKSHATRA_LORDS[nak_idx]

    traversed = _get_traversed_fraction(moon_longitude)
    balance_fraction = 1 - traversed
    first_dasha_full_years = VIMSHOTTARI_YEARS[starting_lord]
    first_dasha_balance_years = first_dasha_full_years * balance_fraction

    start_idx = VIMSHOTTARI_ORDER.index(starting_lord)
    mahadashas: list[DashaPeriod] = []
    cursor = birth_date
    accumulated = 0.0
    period_count = 0

    while accumulated < VIMSHOTTARI_TOTAL_YEARS:
        planet = VIMSHOTTARI_ORDER[(start_idx + period_count) % 9]

        if period_count == 0:
            duration_years = first_dasha_balance_years
        else:
            duration_years = float(VIMSHOTTARI_YEARS[planet])

        if accumulated + duration_years > VIMSHOTTARI_TOTAL_YEARS:
            duration_years = VIMSHOTTARI_TOTAL_YEARS - accumulated

        end_date = _add_years(cursor, duration_years)
        is_active = _is_in_range(now, cursor, end_date)

        period = DashaPeriod(
            planet=planet,
            start_date=cursor,
            end_date=end_date,
            is_active=is_active,
            level="mahadasha",
            sub_periods=(
                _build_sub_periods(planet, cursor, duration_years, 1, now, 4)
                if is_active
                else []
            ),
        )
        mahadashas.append(period)
        accumulated += duration_years
        cursor = end_date
        period_count += 1

    current_md = next((p for p in mahadashas if p.is_active), mahadashas[0] if mahadashas else None)
    current_ad = None
    current_pad = None
    if current_md and current_md.sub_periods:
        current_ad = next((p for p in current_md.sub_periods if p.is_active), current_md.sub_periods[0])
        if current_ad and current_ad.sub_periods:
            current_pad = next((p for p in current_ad.sub_periods if p.is_active), current_ad.sub_periods[0])

    return VimshottariDasha(
        mahadashas=mahadashas,
        current_mahadasha=current_md,
        current_antardasha=current_ad,
        current_pratyantardasha=current_pad,
    )
