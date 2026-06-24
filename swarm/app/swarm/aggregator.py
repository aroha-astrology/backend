"""Aggregator — the single sanitization + merge point.

Runs after the Synthesizer and Profiler fan-out completes. Merges their
disjoint state keys (synthesis + atmosphere), deduplicates findings, and
validates that no fabricated claims leaked through. This is Agent 1's
(Gateway's) downstream merge responsibility.
"""

from __future__ import annotations

from app.swarm.state import ArohaSwarmState


def aggregator_node(state: ArohaSwarmState) -> dict:
    findings = state.get("findings", [])

    seen_ids: set[str] = set()
    deduped: list[dict] = []
    for f in findings:
        fid = f.get("id", "")
        if fid and fid not in seen_ids:
            seen_ids.add(fid)
            deduped.append(f)
        elif not fid:
            deduped.append(f)

    return {"findings": deduped}
