"""Subscription + token wallet entitlement middleware.

Checks the user's plan + token balance before allowing actions that cost
tokens. Mirrors the existing TS deductCredits/credit_transactions pattern.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger("aroha.entitlement")

# In-memory stub (replaced by Supabase queries in production)
_balances: dict[str, int] = {}
_plans: dict[str, str] = {}
_ledger: list[dict] = []

ACTION_COSTS: dict[str, int] = {
    "chat": 1,
    "forecast": 2,
    "matchmaking": 3,
    "interpretation": 2,
}


@dataclass
class EntitlementError(Exception):
    message: str
    required: int = 0
    balance: int = 0


def get_plan(user_id: str) -> str:
    return _plans.get(user_id, "free")


def get_balance(user_id: str) -> int:
    return _balances.get(user_id, 0)


async def check_and_debit(user_id: str, action: str) -> int:
    """Check balance and debit tokens. Returns new balance. Raises EntitlementError."""
    cost = ACTION_COSTS.get(action, 0)
    if cost == 0:
        return get_balance(user_id)

    plan = get_plan(user_id)
    if plan in ("premium", "pro"):
        return get_balance(user_id)

    balance = get_balance(user_id)
    if balance < cost:
        raise EntitlementError(
            message=f"Insufficient tokens: need {cost}, have {balance}",
            required=cost,
            balance=balance,
        )

    new_balance = balance - cost
    _balances[user_id] = new_balance
    _ledger.append({
        "user_id": user_id,
        "delta": -cost,
        "reason": action,
        "balance_after": new_balance,
    })
    return new_balance


async def add_tokens(user_id: str, amount: int, reason: str = "admin_grant") -> int:
    balance = get_balance(user_id)
    new_balance = balance + amount
    _balances[user_id] = new_balance
    _ledger.append({
        "user_id": user_id,
        "delta": amount,
        "reason": reason,
        "balance_after": new_balance,
    })
    return new_balance


def set_plan(user_id: str, plan: str) -> None:
    _plans[user_id] = plan


def get_ledger(user_id: str) -> list[dict]:
    return [e for e in _ledger if e["user_id"] == user_id]
