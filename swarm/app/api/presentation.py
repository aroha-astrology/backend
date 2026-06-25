"""PresentationBlock — the structured output contract for all predictive agents.

Agents 3/4/5 and chart interpretations return this shape via NIM jsonMode.
Chips are injected by the backend from deterministic state, never trusted
from the LLM. The aggregator rejects any highlight whose finding_id is
unknown.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Highlight(BaseModel):
    finding_id: str
    text: str


class Chip(BaseModel):
    kind: str       # nakshatra | house | sav | planet | dasha
    label: str
    value: int | float | None = None
    sentiment: str = "neutral"  # high | neutral | low


class GlossaryEntry(BaseModel):
    term: str
    plain: str


class PresentationBlock(BaseModel):
    hook: str = Field(..., description="Layer 1 — one-line summary always visible")
    highlights: list[Highlight] = Field(default_factory=list, description="Layer 2 — finding-id-keyed")
    analysis_md: str = Field(default="", description="Layer 3 — full narrative in markdown")
    chips: list[Chip] = Field(default_factory=list, description="Deterministic data chips")
    glossary: list[GlossaryEntry] = Field(default_factory=list, description="Inline term definitions")
    score: int | None = Field(default=None, ge=1, le=5, description="1-5 day quality score")


def inject_chips_from_metrology(metrology: dict) -> list[Chip]:
    """Build chips from deterministic metrology state (never from LLM)."""
    chips: list[Chip] = []
    asc = metrology.get("ascendant", {})
    if asc.get("ascendantSign"):
        chips.append(Chip(kind="house", label=f"Asc: {asc['ascendantSign']}", sentiment="neutral"))

    for p in metrology.get("planets", []):
        if p.get("isRetrograde"):
            chips.append(Chip(
                kind="planet",
                label=f"{p['planet']} (R)",
                sentiment="low",
            ))

    dasha = metrology.get("vimshottariDasha", {})
    md = dasha.get("currentMahadasha")
    if md:
        chips.append(Chip(kind="dasha", label=f"MD: {md['planet']}", sentiment="neutral"))
    ad = dasha.get("currentAntardasha")
    if ad:
        chips.append(Chip(kind="dasha", label=f"AD: {ad['planet']}", sentiment="neutral"))

    return chips
