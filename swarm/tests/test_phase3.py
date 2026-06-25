"""Tests for Phase 2.5 + 3 modules and endpoints."""

import pytest
from datetime import date, datetime, timezone

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


# ---------------------------------------------------------------------------
# Cache + Locks + DLQ + Usage
# ---------------------------------------------------------------------------

class TestCache:
    @pytest.mark.asyncio
    async def test_set_and_get_chart(self):
        from app.tools.cache import set_cached_chart, get_cached_chart
        await set_cached_chart("u1", "p1", "kundli", {"test": True}, {"date": "2000-01-01"}, {"swe": "test"})
        result = await get_cached_chart("u1", "p1", "kundli")
        assert result is not None
        assert result["payload"]["test"] is True

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(self):
        from app.tools.cache import get_cached_chart
        result = await get_cached_chart("nonexistent", "p1", "kundli")
        assert result is None

    @pytest.mark.asyncio
    async def test_invalidate(self):
        from app.tools.cache import set_cached_chart, invalidate_user_charts, get_cached_chart
        await set_cached_chart("u2", "p1", "D9", {"d9": True}, {}, {})
        count = await invalidate_user_charts("u2")
        assert count >= 1
        assert await get_cached_chart("u2", "p1", "D9") is None


class TestLocks:
    @pytest.mark.asyncio
    async def test_acquire_and_release(self):
        from app.tools.locks import acquire, release, is_locked
        owner = await acquire("test", "key1")
        assert owner is not None
        assert await is_locked("test", "key1")
        await release("test", "key1", owner=owner)
        assert not await is_locked("test", "key1")

    @pytest.mark.asyncio
    async def test_double_acquire_fails(self):
        from app.tools.locks import acquire, release
        owner = await acquire("test", "key2")
        assert owner is not None
        second = await acquire("test", "key2")
        assert second is None
        await release("test", "key2", owner=owner)


class TestDLQ:
    @pytest.mark.asyncio
    async def test_record_failure(self):
        from app.workers.dlq import record_failure, get_failed_jobs, clear_dlq
        clear_dlq()
        await record_failure("test_job", {"key": "val"}, ValueError("bad input"))
        jobs = get_failed_jobs()
        assert len(jobs) == 1
        assert jobs[0]["is_terminal"] is True
        clear_dlq()


class TestUsage:
    @pytest.mark.asyncio
    async def test_log_and_retrieve(self):
        from app.tools.usage import log_usage, get_usage_log, clear_usage_log, UsageRecord
        clear_usage_log()
        await log_usage(UsageRecord(user_id="u1", agent="scholar", model="llama-3.1-70b", tokens_in=100, tokens_out=50))
        log = get_usage_log()
        assert len(log) == 1
        assert log[0]["tokens_in"] == 100
        clear_usage_log()


# ---------------------------------------------------------------------------
# PresentationBlock
# ---------------------------------------------------------------------------

class TestPresentationBlock:
    def test_inject_chips_from_metrology(self):
        from app.api.presentation import inject_chips_from_metrology
        metrology = {
            "ascendant": {"ascendantSign": "Leo"},
            "planets": [
                {"planet": "Saturn", "sign": "Sagittarius", "isRetrograde": True},
                {"planet": "Sun", "sign": "Cancer", "isRetrograde": False},
            ],
            "vimshottariDasha": {
                "currentMahadasha": {"planet": "Jupiter"},
                "currentAntardasha": {"planet": "Mercury"},
            },
        }
        chips = inject_chips_from_metrology(metrology)
        labels = [c.label for c in chips]
        assert "Asc: Leo" in labels
        assert "Saturn (R)" in labels
        assert "MD: Jupiter" in labels
        assert "AD: Mercury" in labels


# ---------------------------------------------------------------------------
# Panchang
# ---------------------------------------------------------------------------

class TestPanchang:
    def test_compute_panchang(self):
        from app.tools.panchang import compute_panchang
        dt = datetime(2024, 1, 15, 6, 0, 0, tzinfo=timezone.utc)
        result = compute_panchang(dt)
        assert "tithi" in result
        assert "nakshatra" in result
        assert "yoga" in result
        assert "karana" in result
        assert "vara" in result

    def test_regional_panchang(self):
        from app.tools.panchang import compute_regional_panchang
        dt = datetime(2024, 1, 15, 6, 0, 0, tzinfo=timezone.utc)
        result = compute_regional_panchang(dt, "North_Indian")
        assert result["referenceCity"] == "Ujjain"

    def test_panchang_endpoint(self, client):
        r = client.get("/v1/panchang?region=North_Indian")
        assert r.status_code == 200
        data = r.json()
        assert "by_region" in data
        assert data["by_region"]["referenceCity"] == "Ujjain"


# ---------------------------------------------------------------------------
# Legal endpoints
# ---------------------------------------------------------------------------

class TestLegal:
    def test_get_current_docs(self, client):
        r = client.get("/v1/legal/current")
        assert r.status_code == 200
        assert "terms" in r.json()["documents"]

    def test_accept_and_check_status(self, client):
        r = client.post("/v1/legal/accept", json={"doc_type": "terms", "doc_version": "1.0"})
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"

        r2 = client.get("/v1/legal/status")
        assert r2.status_code == 200


# ---------------------------------------------------------------------------
# Account / data-rights
# ---------------------------------------------------------------------------

class TestAccount:
    def test_delete_account(self, client):
        r = client.delete("/v1/account")
        assert r.status_code == 200
        assert r.json()["status"] == "deleted"

    def test_data_export(self, client):
        r = client.post("/v1/data-export")
        assert r.status_code == 200
        assert r.json()["status"] == "exported"

    def test_withdraw_consent(self, client):
        r = client.post("/v1/consent/withdraw")
        assert r.status_code == 200
        assert r.json()["status"] == "withdrawn"


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

class TestBilling:
    def test_get_plan(self, client):
        r = client.get("/v1/billing/plan")
        assert r.status_code == 200
        assert r.json()["plan"] == "free"

    def test_purchase_tokens(self, client):
        r = client.post("/v1/billing/tokens", json={"amount": 50})
        assert r.status_code == 200
        assert r.json()["new_balance"] == 50

    def test_get_balance(self, client):
        r = client.get("/v1/billing/balance")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Internal cron
# ---------------------------------------------------------------------------

class TestInternal:
    def test_precompute_daily(self, client):
        r = client.post("/internal/cron/precompute-daily?tz_bucket=Asia/Kolkata")
        assert r.status_code == 200
        assert r.json()["status"] == "triggered"

    def test_retry_job(self, client):
        r = client.post("/internal/jobs/retry?job_id=1")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------

class TestFeatureFlags:
    def test_get_and_set(self):
        from app.flags import is_enabled, set_flag, get_all_flags
        assert is_enabled("vedha_enabled") is False
        set_flag("vedha_enabled", True)
        assert is_enabled("vedha_enabled") is True
        set_flag("vedha_enabled", False)


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------

class TestPrecompute:
    def test_next_period_key_daily(self):
        from app.scheduling.precompute import get_next_period_key
        key = get_next_period_key("daily", date(2024, 6, 15))
        assert key == "2024-06-16"

    def test_should_precompute_daily_always_true(self):
        from app.scheduling.precompute import should_precompute
        assert should_precompute("daily") is True


# ---------------------------------------------------------------------------
# Entitlement
# ---------------------------------------------------------------------------

class TestEntitlement:
    @pytest.mark.asyncio
    async def test_add_and_debit_tokens(self):
        from app.middleware.entitlement import add_tokens, check_and_debit, get_balance, EntitlementError
        await add_tokens("test_user", 10, "test")
        assert get_balance("test_user") == 10
        await check_and_debit("test_user", "chat")
        assert get_balance("test_user") == 9

    @pytest.mark.asyncio
    async def test_insufficient_tokens(self):
        from app.middleware.entitlement import check_and_debit, EntitlementError, add_tokens
        await add_tokens("broke_user", 0, "test")
        with pytest.raises(EntitlementError):
            await check_and_debit("broke_user", "matchmaking")


# ---------------------------------------------------------------------------
# Telegram bot
# ---------------------------------------------------------------------------

class TestTelegramBot:
    @pytest.mark.asyncio
    async def test_unauthorized_access(self):
        from app.bot.admin import handle_command
        result = await handle_command("unknown_chat", "/users", [])
        assert "Unauthorized" in result

    @pytest.mark.asyncio
    async def test_authorized_users_command(self):
        from app.bot.admin import handle_command, set_allowlist
        set_allowlist({"admin1": "viewer"})
        result = await handle_command("admin1", "/users", [])
        assert "stub" in result.lower() or "Users" in result

    def test_mask_phone(self):
        from app.bot.admin import mask_phone
        assert mask_phone("9876543210") == "••••••3210"
        assert mask_phone("1234") == "••••"
