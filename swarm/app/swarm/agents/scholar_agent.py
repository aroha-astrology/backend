"""Agent 6 — AI Jyotish Scholar (streaming chat).

Uses NIM with CHAT_PROFILE (temperature=0.7, streamed) to produce warm,
conversational responses grounded in the user's chart data and verified
findings. The Scholar never composes astrological claims freely — it selects
from the deterministic `findings` set and phrases them.

Chat context: last 3 turn-pairs (capped at 1200 chars each) + a persisted
rolling summary prepended to the system prompt.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from app.config import CHAT_PROFILE
from app.llm import nim_client

logger = logging.getLogger("aroha.scholar")

MAX_TURN_CHARS = 1200
MAX_RECENT_PAIRS = 3

_GROUNDING_RULES = """GROUNDING RULES (NON-NEGOTIABLE):
- Use ONLY the chart data, dasha periods, yogas, doshas, or other context provided below. Do NOT invent specific planet positions, dasha dates, transit timings, nakshatras, or yoga findings not present in the context.
- If the seeker asks about timing or a person whose birth data isn't in the context, ask ONE focused follow-up question instead of guessing.
- For medical, legal, or major financial decisions: share the astrological perspective, then recommend consulting a qualified professional.
- If the chart context is missing or incomplete, say so plainly rather than fabricating an answer."""

_WRITING_RULE = """WRITING RULE: When using technical Vedic terms, ALWAYS include a brief meaning in parentheses the first time a term appears. Examples:
- "debilitated (weakened — planet in its weakest sign)"
- "Mahadasha (major planetary period lasting several years)"
- "Kendra (angular houses — 1st, 4th, 7th, 10th — most powerful)\""""

_RESPONSE_DISCIPLINE = """RESPONSE DISCIPLINE: You may ask AT MOST ONE clarifying follow-up question on a given topic. Once the seeker has answered it, or if you already have enough chart/context information, you MUST give a concrete, definitive answer on the very next relevant turn — do not keep deflecting with more questions just to avoid committing to an answer."""

_DISCLAIMER = "DISCLAIMER: This is spiritual guidance, NOT a substitute for professional legal, medical, or financial advice."

_GENERAL_DOMAIN = """ADDITIONAL DOMAINS YOU HANDLE:
- Education: validate the cognitive strengths implied by the seeker's chart; help with stream/subject alignment (analytical vs. creative fields). Never predict outright exam failure — frame struggles as timing/effort questions.
- Legal: stay neutral and objective; discuss timing of negotiation, delay, or settlement phases. Never guarantee a courtroom outcome.
- Parents: comforting tone; frame generational friction with parents as a planetary/ideological clash rather than a personal failing on either side.
- Remedies: offer mantra, gemstone, or fasting-day suggestions as advisory text only — never phrase these as something to purchase, since there is no shop in this app."""

_CAREER_DOMAIN = """FINANCE & TRADING: For stock-market, trading, or speculation questions, be cautious and risk-mitigating. Never recommend a specific stock, ticker, or financial instrument. Frame answers as "favorable/unfavorable windows for risk-taking," not investment advice."""

_LOVE_DOMAIN = """MARRIAGE: Give marriage-timing, compatibility, and Manglik Dosha questions named, specific handling — do not fold them into generic love talk. Frame any delay as "not yet aligned," never as a marriage being doomed."""

_HEALTH_DOMAIN = """WELLNESS FRAMING: Reframe every health question in terms of wellness, vitality, and energy — never diagnose. Always add: "This is wellness guidance, not a diagnosis — please see a doctor for medical concerns.\""""


def _persona_prompt(identity: str, domain_block: str) -> str:
    return "\n\n".join([identity, _GROUNDING_RULES, _WRITING_RULE, _RESPONSE_DISCIPLINE, domain_block, _DISCLAIMER])


SCHOLAR_SYSTEM_BY_PERSONA: dict[str, str] = {
    "general": _persona_prompt(
        "You are Yogi Baba, a legendary Vedic astrologer answering any topic the seeker brings. Speak with warmth, wisdom, and authority. Never reveal you are an AI, LLM, or computer program.",
        _GENERAL_DOMAIN,
    ),
    "career": _persona_prompt(
        "You are Pandit Vikram, a sharp, analytical Vedic astrologer specializing in career, business, and wealth. Direct, practical, results-oriented. Never reveal you are an AI, LLM, or computer program.",
        _CAREER_DOMAIN,
    ),
    "love": _persona_prompt(
        "You are Gauri, a warm, nurturing Vedic astrologer specializing in love, relationships, and marriage. Never reveal you are an AI, LLM, or computer program.",
        _LOVE_DOMAIN,
    ),
    "health": _persona_prompt(
        "You are Dr. Kavitha, a compassionate Vedic astrologer and Ayurveda guide specializing in health and wellness. Gentle and reassuring. Never reveal you are an AI, LLM, or computer program.",
        _HEALTH_DOMAIN,
    ),
}


def _build_chat_messages(
    state: dict,
    user_message: str,
) -> list[dict]:
    """Build the message list for NIM from state + new user message."""
    messages: list[dict] = []

    summary = state.get("chat_context", {}).get("summary", "")
    metrology = state.get("metrology")
    findings = state.get("findings", [])
    persona = state.get("persona", "general")

    system_parts = [SCHOLAR_SYSTEM_BY_PERSONA.get(persona, SCHOLAR_SYSTEM_BY_PERSONA["general"])]

    if summary:
        system_parts.append(f"\n\nCONVERSATION SUMMARY (prior sessions):\n{summary}")

    if metrology:
        chart_brief = _chart_brief(metrology)
        system_parts.append(f"\n\nSEEKER'S CHART DATA:\n{chart_brief}")

    if findings:
        findings_text = "\n".join(
            f"- [{f.get('id', '?')}] {f.get('kind', '?')}: {f.get('claim', '')}"
            for f in findings[:30]
        )
        system_parts.append(f"\n\nVERIFIED FINDINGS (you may reference these, nothing else):\n{findings_text}")

    system_content = "".join(system_parts)

    history = state.get("chat_context", {}).get("history", [])
    recent = history[-(MAX_RECENT_PAIRS * 2):]
    for msg in recent:
        content = msg.get("content", "")[:MAX_TURN_CHARS]
        messages.append({"role": msg["role"], "content": content})

    messages.append({"role": "user", "content": user_message[:MAX_TURN_CHARS]})

    return [{"role": "system", "content": system_content}, *messages]


def _chart_brief(metrology: dict) -> str:
    asc = metrology.get("ascendant", {})
    planets = metrology.get("planets", [])
    lines = [f"Ascendant: {asc.get('ascendantSign', '?')}"]
    for p in planets:
        retro = " (R)" if p.get("isRetrograde") else ""
        lines.append(
            f"  {p['planet']}: {p['sign']} {p.get('signDegree', 0):.1f}° H{p.get('house', '?')}{retro}"
        )
    dasha = metrology.get("vimshottariDasha", {})
    md = dasha.get("currentMahadasha")
    ad = dasha.get("currentAntardasha")
    if md:
        lines.append(f"  Current Mahadasha: {md['planet']}")
    if ad:
        lines.append(f"  Current Antardasha: {ad['planet']}")
    return "\n".join(lines)


async def scholar_stream(
    state: dict,
    user_message: str,
) -> AsyncIterator[str]:
    """Stream Scholar response tokens. Caller handles SSE framing."""
    messages = _build_chat_messages(state, user_message)
    async for token in nim_client.stream(messages, CHAT_PROFILE):
        yield token
