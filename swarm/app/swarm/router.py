"""Deterministic intent router.

Pure function — no LLM in the routing decision. Maps the request intent to the
first downstream node.
  - onboarding/daily_forecast: Metrologist -> fan-out (Synthesizer || Profiler) -> Aggregator
  - matchmaking: Metrologist (both charts computed upstream)
  - panchang: direct to Profiler
  - chat: Scholar (handled separately in the chat endpoint, not the main graph)
"""

from __future__ import annotations

from app.swarm.state import ArohaSwarmState

_ROUTES: dict[str, str] = {
    "onboarding": "metrologist",
    "daily_forecast": "metrologist",
    "matchmaking": "metrologist",
    "panchang": "metrologist",
    "chat": "metrologist",
}


def intent_router(state: ArohaSwarmState) -> str:
    return _ROUTES.get(state.get("intent", "onboarding"), "metrologist")


def post_metrologist_router(state: ArohaSwarmState) -> list[str]:
    """After metrologist, fan out to synthesizer + profiler for forecast intents."""
    intent = state.get("intent", "onboarding")
    if intent in ("onboarding", "daily_forecast"):
        return ["synthesizer", "profiler"]
    if intent == "matchmaking":
        return ["aggregator"]
    return ["aggregator"]
