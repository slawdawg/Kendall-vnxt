"""Bounded no-egress Memory Inbox protocol using only the fake local adapter."""

import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_approval import approve_proposal_for_deletion
from supervisor.application.memory_inbox_capture import capture_acknowledged_text
from supervisor.application.memory_inbox_deletion import execute_deletion_operation
from supervisor.application.memory_inbox_deletion_receipt import read_deletion_receipt
from supervisor.application.memory_inbox_dispatch_claim import claim_processing_dispatch
from supervisor.application.memory_inbox_fake_adapter import materialize_fake_local_proposal
from supervisor.application.memory_inbox_lifecycle import MemoryInboxLifecycleCommand, apply_lifecycle_command
from supervisor.application.memory_inbox_processing_disclosure import accept_processing_disclosure, present_processing_disclosure
from supervisor.application.memory_inbox_proposal_reader import read_authorized_proposal
from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxDeletionOperation


@pytest.mark.asyncio
async def test_no_egress_memory_inbox_smoke_protocol_reaches_proven_deletion(tmp_path) -> None:
    root = tmp_path / "private"; root.mkdir(mode=0o700); os.chmod(root, 0o700)
    settings = Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True,
        SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader",
    )
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'no-egress-smoke.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        actor = "operator:smoke"
        source_id = await capture_acknowledged_text(
            session, settings=settings, text_value="Non-sensitive smoke protocol note.",
            acknowledged_non_sensitive=True, actor_ref=actor, idempotency_key="smoke-capture-key-0001",
        )
        draft = await apply_lifecycle_command(
            session,
            MemoryInboxLifecycleCommand(
                source_id=source_id, expected_revision=1, idempotency_key="smoke-draft-key-0001",
                target_state=MemoryInboxSourceState.DRAFT,
            ),
            verified_actor_ref=actor, audit_ref="audit:smoke-draft",
        )
        assert draft.lifecycle_state == MemoryInboxSourceState.DRAFT
        disclosure = await present_processing_disclosure(
            session, source_id=source_id, expected_revision=2,
            idempotency_key="smoke-disclosure-key-0001", actor_ref=actor,
        )
        await accept_processing_disclosure(session, disclosure_id=disclosure["disclosureId"], actor_ref=actor)
        claim = await claim_processing_dispatch(session, disclosure_id=disclosure["disclosureId"], actor_ref=actor)
        proposal_id = await materialize_fake_local_proposal(
            session, settings=settings, attempt_id=claim["attemptId"],
            proposal_body="Smoke proposal body.", actor_ref="fake:local",
        )
        reader = await read_authorized_proposal(session, settings=settings, proposal_id=proposal_id, revision=1)
        assert reader.body == "Smoke proposal body."
        approval = await approve_proposal_for_deletion(
            session, proposal_id=proposal_id, expected_revision=1,
            idempotency_key="smoke-approval-key-0001", actor_ref=actor,
        )
        assert approval.deletion_operations == 2
        operations = list((await session.scalars(select(MemoryInboxDeletionOperation))).all())
        assert len(operations) == 2
        for operation in operations:
            await execute_deletion_operation(session, settings=settings, operation_id=operation.id, actor_ref="worker:smoke")
        receipt = await read_deletion_receipt(session, source_id=source_id)
        assert receipt.outcome == "deleted_after_approval"
        assert receipt.summary == "Kendall copies deleted"
        assert "smoke protocol note" not in repr(receipt).lower()
        assert "smoke proposal body" not in repr(receipt).lower()
    await engine.dispose()
