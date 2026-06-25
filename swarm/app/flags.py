"""Feature flags — simple in-memory store for safe rollout.

Flags: vedha_enabled, kakshya_enabled, new_scholar_prompt, experimental_matchmaking.
Phase 3: in-memory. Later: backed by the feature_flags DB table.
"""

from __future__ import annotations

_flags: dict[str, bool] = {
    "vedha_enabled": False,
    "kakshya_enabled": False,
    "new_scholar_prompt": False,
    "experimental_matchmaking": False,
    "sse_progressive_delivery": True,
    "precompute_enabled": True,
}


def is_enabled(flag: str) -> bool:
    return _flags.get(flag, False)


def set_flag(flag: str, enabled: bool) -> None:
    _flags[flag] = enabled


def get_all_flags() -> dict[str, bool]:
    return dict(_flags)
