"""Subscription + token wallet endpoints.

GET /v1/billing/plan — current plan
POST /v1/billing/tokens — purchase tokens (stub)
GET /v1/billing/balance — token balance
GET /v1/billing/ledger — transaction history
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.deps import CurrentUser
from app.middleware.entitlement import get_plan, get_balance, get_ledger, add_tokens

router = APIRouter(prefix="/v1/billing", tags=["billing"])


class PlanResponse(BaseModel):
    user_id: str
    plan: str
    balance: int


class TokenPurchaseRequest(BaseModel):
    amount: int = Field(..., gt=0, le=10000)


class TokenPurchaseResponse(BaseModel):
    status: str
    amount: int
    new_balance: int


@router.get("/plan", response_model=PlanResponse, summary="Current subscription plan")
async def current_plan(user_id: CurrentUser):
    return PlanResponse(user_id=user_id, plan=get_plan(user_id), balance=get_balance(user_id))


@router.get("/balance", summary="Token balance")
async def token_balance(user_id: CurrentUser) -> dict:
    return {"user_id": user_id, "balance": get_balance(user_id)}


@router.post("/tokens", response_model=TokenPurchaseResponse, summary="Purchase tokens (stub)")
async def purchase_tokens(req: TokenPurchaseRequest, user_id: CurrentUser):
    new_balance = await add_tokens(user_id, req.amount, reason="purchase")
    return TokenPurchaseResponse(status="success", amount=req.amount, new_balance=new_balance)


@router.get("/ledger", summary="Token transaction history")
async def ledger(user_id: CurrentUser) -> dict:
    return {"user_id": user_id, "transactions": get_ledger(user_id)}
