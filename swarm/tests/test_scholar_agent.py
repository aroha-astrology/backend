"""Tests for persona-specific system prompts in the AI Jyotish Scholar.

Each of the 4 personas the frontend picker sends (general/career/love/health)
must get a distinct system prompt covering its domain pillars from the
astrologer-persona design spec, plus a shared response-discipline directive
capping follow-up deflection at one clarifying question before a definitive
answer is required.
"""

from app.swarm.agents.scholar_agent import SCHOLAR_SYSTEM_BY_PERSONA, _build_chat_messages


def _system_content(state: dict) -> str:
    messages = _build_chat_messages(state, "hello")
    assert messages[0]["role"] == "system"
    return messages[0]["content"]


class TestPersonaSelection:
    def test_defaults_to_general_when_persona_missing(self):
        content = _system_content({"chat_context": {}})
        assert content == _system_content({"persona": "general", "chat_context": {}})

    def test_unknown_persona_falls_back_to_general(self):
        content = _system_content({"persona": "not-a-real-persona", "chat_context": {}})
        assert content == _system_content({"persona": "general", "chat_context": {}})

    def test_persona_prompts_are_distinct(self):
        contents = {
            persona: _system_content({"persona": persona, "chat_context": {}})
            for persona in SCHOLAR_SYSTEM_BY_PERSONA
        }
        assert len(set(contents.values())) == len(contents)


class TestDomainDirectives:
    def test_career_persona_has_finance_trading_caution(self):
        content = _system_content({"persona": "career", "chat_context": {}}).lower()
        assert "stock" in content or "ticker" in content
        assert "never recommend" in content

    def test_love_persona_has_marriage_specific_directive(self):
        content = _system_content({"persona": "love", "chat_context": {}}).lower()
        assert "marriage" in content
        assert "manglik" in content

    def test_general_persona_covers_missing_pillars(self):
        content = _system_content({"persona": "general", "chat_context": {}}).lower()
        assert "education" in content
        assert "legal" in content
        assert "parents" in content
        assert "remed" in content  # remedy / remedies

    def test_health_persona_reframes_as_wellness_not_diagnosis(self):
        content = _system_content({"persona": "health", "chat_context": {}}).lower()
        assert "wellness" in content or "vitality" in content
        assert "never diagnose" in content


class TestResponseDiscipline:
    def test_all_personas_cap_deflection_at_one_followup(self):
        for persona in SCHOLAR_SYSTEM_BY_PERSONA:
            content = _system_content({"persona": persona, "chat_context": {}}).lower()
            assert "one clarifying" in content
            assert "definitive answer" in content
