from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_cost_reservation import record_attempt_completion_unknown, reserve_attempt_cost
from supervisor.application.memory_inbox_provider_policy import read_inbox_cost_policy, set_inbox_cost_policy
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxCostReservation, MemoryInboxProcessingAttempt


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
        with pytest.raises(ValueError, match="reservation_amount_conflict"):
            await reserve_attempt_cost(session, attempt_id=attempt.id, amount=Decimal("2.00"))
        await record_attempt_completion_unknown(session, attempt_id=attempt.id)
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "CompletionUnknown"
        assert (await session.get(MemoryInboxCostReservation, reservation_id)).lifecycle_state == "CompletionUnknown"
        with pytest.raises(ValueError, match="reservation_attempt_unavailable"):
            await reserve_attempt_cost(session, attempt_id=attempt.id, amount=Decimal("1.00"))
    await engine.dispose()
