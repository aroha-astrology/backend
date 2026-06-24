"""Agent 1 — Gateway Broker.

Compliance guard + payload compiler. In Phase 0 it re-asserts consent (defence in
depth; the HTTP layer already gated it) and normalises the final response. The
output sanitiser (strip raw math rows, validate numeric + qualitative claims
against `findings`) is layered in here in later phases.
"""

from __future__ import annotations

from app.swarm.state import ArohaSwarmState


def gateway_node(state: ArohaSwarmState) -> ArohaSwarmState:
    if not state.get("consent"):
        # Should never reach here (HTTP consent gate runs first), but the broker
        # is the last line of defence before any downstream work.
        return {
            "errors": [*state.get("errors", []), "consent_required"],
            "response": {"error": "consent_required"},
        }
    return {}


def compile_response(state: ArohaSwarmState) -> dict:
    """Assemble the sanitised, client-facing payload from whatever agents produced."""
    payload: dict = {
        "requestId": state.get("request_id"),
        "intent": state.get("intent"),
    }
    for key in ("metrology", "synthesis", "atmosphere", "compatibility"):
        if state.get(key) is not None:
            payload[key] = state[key]
    if state.get("findings"):
        payload["findings"] = state["findings"]
    if state.get("warnings"):
        payload["warnings"] = state["warnings"]
    return payload
