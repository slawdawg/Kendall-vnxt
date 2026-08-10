"""Content-free Inbox provider and cost-policy vocabulary; adapters start disabled."""

from dataclasses import dataclass
from decimal import Decimal
import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import MemoryInboxCostPolicy, MemoryInboxCostPolicyReceipt


def _request_digest(*, finite_limit: Decimal | None, unlimited_acknowledged: bool) -> str:
    value = "unlimited" if finite_limit is None else f"finite:{finite_limit.normalize()}"
    return hashlib.sha256(f"{value}\x1f{unlimited_acknowledged}".encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class InboxCostPolicy:
    revision: int
    currency: str
    finite_limit: Decimal | None
    measured_spend: Decimal
    reserved_spend: Decimal
    reset_timezone: str
    high_cost_acknowledged: bool = False

    @property
    def remaining(self) -> Decimal | None:
        return None if self.finite_limit is None else max(Decimal("0"), self.finite_limit - self.measured_spend - self.reserved_spend)


def disabled_provider_projection(policy: InboxCostPolicy) -> dict:
    """Never consult generic provider configuration, credentials, or egress state."""
    return {
        "schemaVersion": "kendall-memory-inbox-provider-policy/v1",
        "policyRevision": policy.revision,
        "currency": policy.currency,
        "measuredSpend": str(policy.measured_spend),
        "reservedSpend": str(policy.reserved_spend),
        "finiteLimit": str(policy.finite_limit) if policy.finite_limit is not None else None,
        "remaining": str(policy.remaining) if policy.remaining is not None else None,
        "resetTimezone": policy.reset_timezone,
        "mode": "unlimited" if policy.finite_limit is None else "finite",
        "providerOrder": [
            {"provider": "local", "availability": "disabled"},
            {"provider": "openai", "availability": "disabled"},
            {"provider": "anthropic", "availability": "disabled"},
        ],
    }


def validate_policy_change(*, finite_limit: Decimal | None, unlimited_acknowledged: bool) -> None:
    if finite_limit is not None and finite_limit < Decimal("0"):
        raise ValueError("finite_limit_invalid")
    if finite_limit is None and not unlimited_acknowledged:
        raise ValueError("unlimited_acknowledgement_required")


def _view(policy: MemoryInboxCostPolicy) -> dict:
    projection = disabled_provider_projection(InboxCostPolicy(
        revision=policy.revision, currency=policy.currency,
        finite_limit=Decimal(str(policy.finite_limit)) if policy.finite_limit is not None else None,
        measured_spend=Decimal(str(policy.measured_spend)), reserved_spend=Decimal(str(policy.reserved_spend)),
        reset_timezone=policy.reset_timezone, high_cost_acknowledged=policy.high_cost_acknowledged,
    ))
    projection.update({
        "updatedAt": policy.updated_at.isoformat(),
        "actorRef": policy.actor_ref,
        "providerActivation": "disabled_by_default",
    })
    return projection


async def read_inbox_cost_policy(session: AsyncSession) -> dict:
    """Read the only Inbox policy record; generic provider settings are excluded."""
    policy = await session.get(MemoryInboxCostPolicy, "inbox-cost-policy:current")
    if policy is None:
        policy = MemoryInboxCostPolicy(
            id="inbox-cost-policy:current", revision=1, currency="USD", finite_limit=Decimal("0"),
            measured_spend=Decimal("0"), reserved_spend=Decimal("0"), reset_timezone="UTC",
            high_cost_acknowledged=False, actor_ref="system:memory-inbox-policy-bootstrap",
        )
        session.add(policy)
        session.add(MemoryInboxCostPolicyReceipt(
            id=f"inbox-cost-policy-receipt:{uuid.uuid4().hex}", policy_id=policy.id,
            revision=1, mode="finite", idempotency_key="system:policy-bootstrap",
            request_digest=_request_digest(finite_limit=Decimal("0"), unlimited_acknowledged=False), actor_ref=policy.actor_ref,
        ))
        await session.commit()
    return _view(policy)


async def set_inbox_cost_policy(
    session: AsyncSession, *, finite_limit: Decimal | None, unlimited_acknowledged: bool,
    actor_ref: str, idempotency_key: str,
) -> dict:
    """Version one finite/unlimited policy change with an immutable receipt."""
    validate_policy_change(finite_limit=finite_limit, unlimited_acknowledged=unlimited_acknowledged)
    request_digest = _request_digest(finite_limit=finite_limit, unlimited_acknowledged=unlimited_acknowledged)
    policy = (await session.execute(
        select(MemoryInboxCostPolicy)
        .where(MemoryInboxCostPolicy.id == "inbox-cost-policy:current")
        .with_for_update()
    )).scalar_one_or_none()
    if policy is None:
        await read_inbox_cost_policy(session)
        policy = (await session.execute(
            select(MemoryInboxCostPolicy)
            .where(MemoryInboxCostPolicy.id == "inbox-cost-policy:current")
            .with_for_update()
        )).scalar_one()
    prior = (await session.execute(select(MemoryInboxCostPolicyReceipt).where(
        MemoryInboxCostPolicyReceipt.policy_id == policy.id,
        MemoryInboxCostPolicyReceipt.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if prior is not None:
        if prior.request_digest != request_digest:
            raise ValueError("policy_idempotency_conflict")
        return _view(policy)
    policy.revision += 1
    policy.finite_limit = finite_limit
    policy.high_cost_acknowledged = finite_limit is None
    policy.actor_ref = actor_ref
    mode = "unlimited" if finite_limit is None else "finite"
    session.add(MemoryInboxCostPolicyReceipt(
        id=f"inbox-cost-policy-receipt:{uuid.uuid4().hex}", policy_id=policy.id,
        revision=policy.revision, mode=mode, idempotency_key=idempotency_key,
        request_digest=request_digest, actor_ref=actor_ref,
    ))
    await session.commit()
    return _view(policy)
