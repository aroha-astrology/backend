"""Shared graph state passed between agents.

`ArohaSwarmState` is a TypedDict (LangGraph's state container). Agents read the
keys they need and write the keys they own. Agents 3 (Synthesizer) and 4
(Profiler) write disjoint keys (`synthesis` vs `atmosphere`) so the parallel
join needs no reducer except `warnings`, which both may append to.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Literal, Optional, TypedDict

Intent = Literal["onboarding", "daily_forecast", "matchmaking", "panchang", "chat"]


class BirthRecord(TypedDict, total=False):
    date: str            # ISO date
    time: str            # HH:MM[:SS], local civil time at birth place
    latitude: float
    longitude: float
    timezone: str        # IANA tz, e.g. "Asia/Kolkata"


class ArohaSwarmState(TypedDict, total=False):
    # request / identity / compliance
    request_id: str
    user_id: str
    intent: Intent
    consent: bool
    locale: str
    region: str
    current_location: Optional[dict]          # {lat, lon} — GPS, consent-gated
    raw_input: dict

    # birth data (consent-gated)
    birth_record: Optional[BirthRecord]
    partner_record: Optional[BirthRecord]
    as_of: Optional[str]                      # ISO datetime for transit "now"

    # Agent 2 — deterministic single source of math truth
    metrology: Optional[dict]
    # verified astrological claim set — the ONLY assertions agents may use
    findings: Annotated[list[dict], operator.add]

    # Agents 3 & 4 (disjoint keys → safe parallel join)
    synthesis: Optional[dict]                 # Carousel 1
    atmosphere: Optional[dict]                # Carousels 2/3
    compatibility: Optional[dict]             # 8 kootas / 36

    chat_context: Optional[dict]

    response: Optional[dict]
    errors: Annotated[list[str], operator.add]
    warnings: Annotated[list[str], operator.add]


def new_state(**kwargs: Any) -> ArohaSwarmState:
    """Build a state dict with the list fields initialised (avoids None checks)."""
    base: ArohaSwarmState = {
        "findings": [],
        "errors": [],
        "warnings": [],
    }
    base.update(kwargs)  # type: ignore[typeddict-item]
    return base
