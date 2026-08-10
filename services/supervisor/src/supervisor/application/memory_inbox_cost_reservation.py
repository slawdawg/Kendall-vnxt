"""Conservative, one-way cost reservation and unknown-completion handling."""

from decimal import Decimal
from typing import Literal
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import MemoryInboxCostPolicy, MemoryInboxCostReservation, MemoryInboxProcessingAttempt, MemoryInboxProcessingDisclosure


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
        if Decimal(str(existing.amount)) != amount:
            policy = (await session.execute(select(MemoryInboxCostPolicy).where(
                MemoryInboxCostPolicy.id == existing.policy_id
            ).with_for_update())).scalar_one_or_none()
            if policy is None or Decimal(str(policy.reserved_spend)) < Decimal(str(existing.amount)):
                raise ValueError("reservation_policy_unavailable")
            policy.reserved_spend = Decimal(str(policy.reserved_spend)) - Decimal(str(existing.amount))
            existing.lifecycle_state = "Released"
            await _invalidate_consent_and_cancel_attempt(session, attempt=attempt)
            await session.commit()
            raise ValueError("reservation_amount_conflict")
        return existing.id
    policy = (await session.execute(select(MemoryInboxCostPolicy).where(
        MemoryInboxCostPolicy.id == "inbox-cost-policy:current"
    ).with_for_update())).scalar_one_or_none()
    if policy is None or policy.finite_limit is None:
        raise ValueError("reservation_finite_policy_required")
    remaining = Decimal(str(policy.finite_limit)) - Decimal(str(policy.measured_spend)) - Decimal(str(policy.reserved_spend))
    if remaining < amount:
        await _invalidate_consent_and_cancel_attempt(session, attempt=attempt)
        await session.commit()
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
    if attempt is None or reservation is None or attempt.lifecycle_state not in {"Claimed", "Dispatched"} or reservation.lifecycle_state != "Reserved":
        raise ValueError("completion_unknown_unavailable")
    attempt.lifecycle_state = "CompletionUnknown"
    reservation.lifecycle_state = "CompletionUnknown"
    await session.commit()


async def resolve_attempt_completion_unknown(
    session: AsyncSession, *, attempt_id: str, resolution: Literal["reconciled", "released"],
) -> None:
    """Close one uncertain attempt only through a deliberate accounting result."""
    attempt = (await session.execute(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.id == attempt_id
    ).with_for_update())).scalar_one_or_none()
    reservation = await session.scalar(select(MemoryInboxCostReservation).where(
        MemoryInboxCostReservation.attempt_id == attempt_id
    ))
    if (
        attempt is None or reservation is None
        or attempt.lifecycle_state != "CompletionUnknown"
        or reservation.lifecycle_state != "CompletionUnknown"
    ):
        raise ValueError("completion_unknown_resolution_unavailable")
    policy = (await session.execute(select(MemoryInboxCostPolicy).where(
        MemoryInboxCostPolicy.id == reservation.policy_id
    ).with_for_update())).scalar_one_or_none()
    amount = Decimal(str(reservation.amount))
    if policy is None or Decimal(str(policy.reserved_spend)) < amount:
        raise ValueError("completion_unknown_resolution_unavailable")
    policy.reserved_spend = Decimal(str(policy.reserved_spend)) - amount
    if resolution == "reconciled":
        policy.measured_spend = Decimal(str(policy.measured_spend)) + amount
        reservation.lifecycle_state = "Reconciled"
        attempt.lifecycle_state = "Reconciled"
    else:
        reservation.lifecycle_state = "Released"
        attempt.lifecycle_state = "Cancelled"
    await session.commit()


async def _invalidate_consent_and_cancel_attempt(
    session: AsyncSession, *, attempt: MemoryInboxProcessingAttempt,
) -> None:
    disclosure = (await session.execute(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.receipt_ref == attempt.consent_ref
    ).with_for_update())).scalar_one_or_none()
    if disclosure is not None and disclosure.lifecycle_state == "Accepted":
        disclosure.lifecycle_state = "Invalidated"
    attempt.lifecycle_state = "Cancelled"
