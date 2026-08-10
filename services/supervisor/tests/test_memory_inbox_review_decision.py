from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_review_decision import deny_proposal_retaining_source, return_proposal_for_revision
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import (
    MemoryInboxProcessingAttempt, MemoryInboxProcessingDisclosure, MemoryInboxProposalAggregate,
    MemoryInboxProposalRevision, MemoryInboxSource, MemoryInboxSourceRevision,
)


async def _seed(session):
    source = MemoryInboxSource(id="source:decision", current_revision=3, lifecycle_state="Review", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None", policy_ref="policy:test")
    source_revision = MemoryInboxSourceRevision(id="source-revision:decision", source_id=source.id, revision=3, lifecycle_state="Review", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
    proposal = MemoryInboxProposalAggregate(id="proposal:decision", source_id=source.id, current_revision=1, lifecycle_state="Ready")
    proposal_revision = MemoryInboxProposalRevision(id="proposal-revision:decision", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:seed", audit_ref="audit:seed")
    disclosure = MemoryInboxProcessingDisclosure(id="disclosure:decision", source_revision_id=source_revision.id, source_revision=3, policy_id="policy:decision", policy_revision=1, retention_deadline_at=source.retention_deadline_at, lifecycle_state="Accepted", idempotency_key="disclosure-key", actor_ref="operator:seed", receipt_ref="receipt:decision")
    attempt = MemoryInboxProcessingAttempt(id="attempt:decision", source_revision_id=source_revision.id, proposal_revision_id=proposal_revision.id, consent_ref="receipt:decision", provider_code="unselected", attempt_sequence=1, lifecycle_state="Claimed")
    session.add_all((source, source_revision, proposal, proposal_revision, disclosure, attempt))
    await session.commit()
    return source, proposal, attempt, disclosure


@pytest.mark.asyncio
async def test_return_records_one_immutable_pair_and_invalidates_prior_runnable_consent(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'return.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source, proposal, attempt, disclosure = await _seed(session)
        result = await return_proposal_for_revision(session, proposal_id=proposal.id, expected_revision=1, idempotency_key="return-key-0001", actor_ref="operator:verified")
        replay = await return_proposal_for_revision(session, proposal_id=proposal.id, expected_revision=1, idempotency_key="return-key-0001", actor_ref="operator:verified")
        assert result.lifecycle_state == "Returned" and result.next_safe_action == "create_draft"
        assert replay.replayed is True
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "Returned"
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "Cancelled"
        assert (await session.get(MemoryInboxProcessingDisclosure, disclosure.id)).lifecycle_state == "Invalidated"
        revisions = (await session.scalars(select(MemoryInboxProposalRevision).where(MemoryInboxProposalRevision.proposal_id == proposal.id))).all()
        assert len(revisions) == 2
    await engine.dispose()


@pytest.mark.asyncio
async def test_deny_retains_the_source_and_blocks_any_downstream_processing(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'deny.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source, proposal, attempt, _ = await _seed(session)
        result = await deny_proposal_retaining_source(session, proposal_id=proposal.id, expected_revision=1, idempotency_key="deny-key-0000001", actor_ref="operator:verified")
        assert result.lifecycle_state == "Denied" and result.next_safe_action == "review_retention"
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "DeniedRetained"
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "Cancelled"
    await engine.dispose()
