"""Conservative, one-way cost reservation and unknown-completion handling."""

from decimal import Decimal
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import MemoryInboxCostPolicy, MemoryInboxCostReservation, MemoryInboxProcessingAttempt


async def reserve_attempt_cost(session: AsyncSession, *, attempt_id: str, amount: Decimal) -> str:
    if amount <= 0:
        raise ValueError("reservation_amount_invalid")
    attempt = (await session.execute(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.id == attempt_id
    ).with_for_update())).scalar_one_or_none()
    if attempt is None or attempt.lifecycle_state != "Claimed":
        raise ValueError("reservation_attempt_unavailable")
    existing = await session.scalar(select(MemoryInboxCostReservation).where(MemoryInboxCostReservation.attempt_id == attempt_id))
    if existing is not None:
        return existing.id
    policy = (await session.execute(select(MemoryInboxCostPolicy).where(
        MemoryInboxCostPolicy.id == "inbox-cost-policy:current"
    ).with_for_update())).scalar_one_or_none()
    if policy is None or policy.finite_limit is None:
        raise ValueError("reservation_finite_policy_required")
    remaining = Decimal(str(policy.finite_limit)) - Decimal(str(policy.measured_spend)) - Decimal(str(policy.reserved_spend))
    if remaining < amount:
        raise ValueError("reservation_budget_blocked")
    reservation = MemoryInboxCostReservation(
        id=f"inbox-cost-reservation:{uuid.uuid4().hex}", attempt_id=attempt.id,
        policy_id=policy.id, amount=amount, lifecycle_state="Reserved",
    )
    policy.reserved_spend = Decimal(str(policy.reserved_spend)) + amount
    session.add(reservation)
    await session.commit()
    return reservation.id


async def record_attempt_completion_unknown(session: AsyncSession, *, attempt_id: str) -> None:
    """Retain the reservation conservatively; retry/fallback cannot spend again."""
    attempt = (await session.execute(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.id == attempt_id
    ).with_for_update())).scalar_one_or_none()
    reservation = await session.scalar(select(MemoryInboxCostReservation).where(MemoryInboxCostReservation.attempt_id == attempt_id))
    if attempt is None or reservation is None or attempt.lifecycle_state not in {"Claimed", "Dispatched"}:
        raise ValueError("completion_unknown_unavailable")
    attempt.lifecycle_state = "CompletionUnknown"
    reservation.lifecycle_state = "CompletionUnknown"
    await session.commit()
