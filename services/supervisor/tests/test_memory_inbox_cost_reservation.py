from decimal import Decimal
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_cost_reservation import record_attempt_completion_unknown, reserve_attempt_cost, resolve_attempt_completion_unknown
from supervisor.application.memory_inbox_provider_policy import read_inbox_cost_policy, set_inbox_cost_policy
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxCostReservation, MemoryInboxProcessingAttempt, MemoryInboxProcessingDisclosure


@pytest.mark.asyncio
async def test_reservation_is_conservative_and_unknown_completion_blocks_repeat_spend(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'reserve.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        await read_inbox_cost_policy(session)
        await set_inbox_cost_policy(session, finite_limit=Decimal("5.00"), unlimited_acknowledged=False, actor_ref="operator:verified", idempotency_key="policy-reserve-key")
        attempt = MemoryInboxProcessingAttempt(id="inbox-attempt:reserve", source_revision_id="source-revision:reserve", proposal_revision_id="proposal-revision:reserve", consent_ref="receipt:reserve", provider_code="unselected", attempt_sequence=1, lifecycle_state="Claimed")
        session.add(attempt)
        await session.commit()
        reservation_id = await reserve_attempt_cost(session, attempt_id=attempt.id, amount=Decimal("3.00"))
        assert await reserve_attempt_cost(session, attempt_id=attempt.id, amount=Decimal("3.00")) == reservation_id
        await record_attempt_completion_unknown(session, attempt_id=attempt.id)
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "CompletionUnknown"
        assert (await session.get(MemoryInboxCostReservation, reservation_id)).lifecycle_state == "CompletionUnknown"
        with pytest.raises(ValueError, match="reservation_attempt_unavailable"):
            await reserve_attempt_cost(session, attempt_id=attempt.id, amount=Decimal("1.00"))
        await resolve_attempt_completion_unknown(session, attempt_id=attempt.id, resolution="released")
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "Cancelled"
        assert (await session.get(MemoryInboxCostReservation, reservation_id)).lifecycle_state == "Released"
    await engine.dispose()


@pytest.mark.asyncio
async def test_reservation_failure_invalidates_consent_and_cancels_the_claim(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'reserve-failure.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        await read_inbox_cost_policy(session)
        await set_inbox_cost_policy(session, finite_limit=Decimal("1.00"), unlimited_acknowledged=False, actor_ref="operator:verified", idempotency_key="policy-reserve-failure-key")
        attempt = MemoryInboxProcessingAttempt(id="inbox-attempt:reserve-failure", source_revision_id="source-revision:reserve-failure", proposal_revision_id="proposal-revision:reserve-failure", consent_ref="receipt:reserve-failure", provider_code="unselected", attempt_sequence=1, lifecycle_state="Claimed")
        disclosure = MemoryInboxProcessingDisclosure(id="inbox-disclosure:reserve-failure", source_revision_id="source-revision:reserve-failure", source_revision=1, policy_id="inbox-cost-policy:current", policy_revision=2, retention_deadline_at=datetime.now(timezone.utc), lifecycle_state="Accepted", idempotency_key="reserve-failure-disclosure", actor_ref="operator:verified", receipt_ref=attempt.consent_ref)
        session.add_all((attempt, disclosure)); await session.commit()
        with pytest.raises(ValueError, match="reservation_budget_blocked"):
            await reserve_attempt_cost(session, attempt_id=attempt.id, amount=Decimal("2.00"))
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "Cancelled"
        assert (await session.get(MemoryInboxProcessingDisclosure, disclosure.id)).lifecycle_state == "Invalidated"
        mismatch_attempt = MemoryInboxProcessingAttempt(id="inbox-attempt:reserve-mismatch", source_revision_id="source-revision:reserve-mismatch", proposal_revision_id="proposal-revision:reserve-mismatch", consent_ref="receipt:reserve-mismatch", provider_code="unselected", attempt_sequence=1, lifecycle_state="Claimed")
        mismatch_disclosure = MemoryInboxProcessingDisclosure(id="inbox-disclosure:reserve-mismatch", source_revision_id="source-revision:reserve-mismatch", source_revision=1, policy_id="inbox-cost-policy:current", policy_revision=2, retention_deadline_at=datetime.now(timezone.utc), lifecycle_state="Accepted", idempotency_key="reserve-mismatch-disclosure", actor_ref="operator:verified", receipt_ref=mismatch_attempt.consent_ref)
        session.add_all((mismatch_attempt, mismatch_disclosure)); await session.commit()
        await reserve_attempt_cost(session, attempt_id=mismatch_attempt.id, amount=Decimal("0.50"))
        with pytest.raises(ValueError, match="reservation_amount_conflict"):
            await reserve_attempt_cost(session, attempt_id=mismatch_attempt.id, amount=Decimal("0.25"))
        assert (await session.get(MemoryInboxProcessingAttempt, mismatch_attempt.id)).lifecycle_state == "Cancelled"
        assert (await session.get(MemoryInboxProcessingDisclosure, mismatch_disclosure.id)).lifecycle_state == "Invalidated"
    await engine.dispose()
