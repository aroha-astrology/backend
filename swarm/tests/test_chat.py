"""Tests for the /v1/chat SSE endpoint.

NIM is never called — we mock the scholar_stream to yield fixed tokens and
verify the SSE framing.
"""

import json
from unittest.mock import patch

import pytest

from app.main import create_app

try:
    from fastapi.testclient import TestClient
except ImportError:
    pytest.skip("TestClient not available", allow_module_level=True)


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


CHAT_PAYLOAD = {"message": "Tell me about my career"}


class TestChatEndpoint:
    def test_chat_returns_sse_content_type(self, client):
        with patch(
            "app.swarm.agents.scholar_agent.scholar_stream",
            return_value=_fake_stream(["Hello", " seeker"]),
        ):
            resp = client.post("/v1/chat", json=CHAT_PAYLOAD)
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

    def test_chat_emits_token_events(self, client):
        with patch(
            "app.swarm.agents.scholar_agent.scholar_stream",
            return_value=_fake_stream(["Hello", " seeker"]),
        ):
            resp = client.post("/v1/chat", json=CHAT_PAYLOAD)
            lines = resp.text.strip().split("\n")
            token_events = [l for l in lines if l.startswith("event: token")]
            assert len(token_events) == 2

    def test_chat_emits_done_event(self, client):
        with patch(
            "app.swarm.agents.scholar_agent.scholar_stream",
            return_value=_fake_stream(["Hello"]),
        ):
            resp = client.post("/v1/chat", json=CHAT_PAYLOAD)
            assert "event: done" in resp.text

    def test_chat_token_data_is_valid_json(self, client):
        with patch(
            "app.swarm.agents.scholar_agent.scholar_stream",
            return_value=_fake_stream(["Test"]),
        ):
            resp = client.post("/v1/chat", json=CHAT_PAYLOAD)
            for line in resp.text.strip().split("\n"):
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    assert isinstance(data, dict)

    def test_chat_passes_persona_to_scholar_state(self, client):
        with patch(
            "app.swarm.agents.scholar_agent.scholar_stream",
            return_value=_fake_stream(["Hi"]),
        ) as mock_stream:
            resp = client.post("/v1/chat", json={"message": "Should I invest?", "persona": "career"})
            assert resp.status_code == 200
            called_state = mock_stream.call_args.args[0]
            assert called_state["persona"] == "career"

    def test_chat_defaults_persona_to_general(self, client):
        with patch(
            "app.swarm.agents.scholar_agent.scholar_stream",
            return_value=_fake_stream(["Hi"]),
        ) as mock_stream:
            resp = client.post("/v1/chat", json=CHAT_PAYLOAD)
            assert resp.status_code == 200
            called_state = mock_stream.call_args.args[0]
            assert called_state["persona"] == "general"

    def test_chat_401_without_auth(self, client):
        # Clear the dev bypass to test auth
        import os
        old = os.environ.get("AROHA_DEV_AUTH_BYPASS")
        os.environ["AROHA_DEV_AUTH_BYPASS"] = "false"
        from app.config import get_settings
        get_settings.cache_clear()
        try:
            resp = client.post(
                "/v1/chat",
                json=CHAT_PAYLOAD,
                headers={"Authorization": "Bearer invalid-token"},
            )
            assert resp.status_code == 401
        finally:
            if old is not None:
                os.environ["AROHA_DEV_AUTH_BYPASS"] = old
            else:
                os.environ.pop("AROHA_DEV_AUTH_BYPASS", None)
            get_settings.cache_clear()


async def _fake_stream(tokens):
    for t in tokens:
        yield t
