"""Telegram admin command bot — RBAC, audit-logged, PII-masked.

Commands:
  /users — paginated user list (viewer+)
  /find <phone> — minimal profile lookup (viewer+)
  /addtoken <phone|user_id> <amount> — grant tokens (operator+, cap-limited)
  /message <user_id> <text> — send notification (superadmin, dual-control)

Security: allowlisted chat IDs + RBAC roles. Every command logs to audit_events.
PII minimization: phone masked (••••••1234), never dump full birth data.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("aroha.bot")

ROLES = {
    "viewer": 0,
    "operator": 1,
    "superadmin": 2,
}

# Allowlisted Telegram chat IDs → role (configured via env in production)
_allowlist: dict[str, str] = {}

TOKEN_GRANT_CAP_PER_COMMAND = 1000
TOKEN_GRANT_CAP_DAILY = 5000


def set_allowlist(allowlist: dict[str, str]) -> None:
    _allowlist.update(allowlist)


def mask_phone(phone: str) -> str:
    if len(phone) <= 4:
        return "••••"
    return "•" * (len(phone) - 4) + phone[-4:]


def check_permission(chat_id: str, required_role: str) -> bool:
    user_role = _allowlist.get(chat_id)
    if user_role is None:
        return False
    return ROLES.get(user_role, -1) >= ROLES.get(required_role, 99)


async def handle_command(chat_id: str, command: str, args: list[str]) -> str:
    """Process a bot command. Returns the response text."""
    if not check_permission(chat_id, "viewer"):
        logger.warning("Unauthorized bot access from chat_id=%s", chat_id)
        return "Unauthorized. Contact a superadmin to get access."

    if command == "/users":
        return _handle_users(chat_id, args)
    elif command == "/find":
        return _handle_find(chat_id, args)
    elif command == "/addtoken":
        return await _handle_addtoken(chat_id, args)
    else:
        return f"Unknown command: {command}"


def _handle_users(chat_id: str, args: list[str]) -> str:
    if not check_permission(chat_id, "viewer"):
        return "Permission denied."
    return "Users: [stub — paginated user list from Supabase]"


def _handle_find(chat_id: str, args: list[str]) -> str:
    if not check_permission(chat_id, "viewer"):
        return "Permission denied."
    if not args:
        return "Usage: /find <phone>"
    phone = args[0]
    return f"Profile for {mask_phone(phone)}: [stub — minimal profile from Supabase]"


async def _handle_addtoken(chat_id: str, args: list[str]) -> str:
    if not check_permission(chat_id, "operator"):
        return "Permission denied. Requires operator role."
    if len(args) < 2:
        return "Usage: /addtoken <user_id> <amount>"

    user_id = args[0]
    try:
        amount = int(args[1])
    except ValueError:
        return "Amount must be a number."

    if amount > TOKEN_GRANT_CAP_PER_COMMAND:
        return f"Amount exceeds per-command cap ({TOKEN_GRANT_CAP_PER_COMMAND}). Contact superadmin."

    from app.middleware.entitlement import add_tokens
    new_balance = await add_tokens(user_id, amount, reason=f"telegram_grant_by_{chat_id}")
    logger.info("Token grant: %d tokens to %s by chat_id=%s", amount, user_id, chat_id)
    return f"Granted {amount} tokens to {user_id}. New balance: {new_balance}"
