"""LangGraph assembly.

Phase 2 graph:
  Gateway → (intent router) → Metrologist → (fan-out router)
    → [Synthesizer ∥ Profiler] → Aggregator → END

The fan-out uses LangGraph's conditional edges returning a list of node names
so the Synthesizer and Profiler run in parallel. Both write disjoint state keys
(synthesis vs atmosphere), so no reducer conflict except warnings (operator.add).
"""

from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, StateGraph

from app.swarm.agents.gateway_agent import gateway_node
from app.swarm.agents.metrologist_agent import metrologist_node
from app.swarm.agents.profiler_agent import profiler_node
from app.swarm.agents.synthesizer_agent import synthesizer_node
from app.swarm.aggregator import aggregator_node
from app.swarm.router import intent_router, post_metrologist_router
from app.swarm.state import ArohaSwarmState


def build_graph():
    g = StateGraph(ArohaSwarmState)

    g.add_node("gateway", gateway_node)
    g.add_node("metrologist", metrologist_node)
    g.add_node("synthesizer", synthesizer_node)
    g.add_node("profiler", profiler_node)
    g.add_node("aggregator", aggregator_node)

    g.set_entry_point("gateway")
    g.add_conditional_edges("gateway", intent_router, {"metrologist": "metrologist"})
    g.add_conditional_edges(
        "metrologist",
        post_metrologist_router,
        {"synthesizer": "synthesizer", "profiler": "profiler", "aggregator": "aggregator"},
    )
    g.add_edge("synthesizer", "aggregator")
    g.add_edge("profiler", "aggregator")
    g.add_edge("aggregator", END)

    return g.compile()


@lru_cache
def get_graph():
    """Compiled graph singleton."""
    return build_graph()
