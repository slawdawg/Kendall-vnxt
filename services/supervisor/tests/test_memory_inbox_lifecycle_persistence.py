from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from supervisor.domain.memory_inbox import (
    LIFECYCLE_SCHEMA_VERSION,
    MemoryInboxAttemptState,
    MemoryInboxDeletionState,
    MemoryInboxProposalState,
    MemoryInboxSourceState,
    can_advance_lifecycle,
    is_positive_revision,
)
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db import models  # noqa: F401
from supervisor.infrastructure.db.models import MemoryInboxCommandResult
from supervisor.infrastructure.db.models import MemoryInboxProposalAggregate, MemoryInboxSource
from supervisor.application.memory_inbox_projection import read_memory_inbox_projection, read_review_ready_count
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def test_lifecycle_vocabulary_is_closed_and_inert() -> None:
    assert LIFECYCLE_SCHEMA_VERSION == "kendall-memory-inbox-lifecycle/v1"
    assert MemoryInboxSourceState.REVIEW.value == "Review"
    assert MemoryInboxProposalState.ABSENT.value == "Absent"
    assert MemoryInboxAttemptState.COMPLETION_UNKNOWN.value == "CompletionUnknown"
    assert MemoryInboxDeletionState.PROVEN.value == "Proven"
    assert is_positive_revision(1) is True
    assert is_positive_revision(0) is False
    assert is_positive_revision(True) is False
    assert can_advance_lifecycle(current=MemoryInboxSourceState.UNPROCESSED, target=MemoryInboxSourceState.DRAFT) is True
    assert can_advance_lifecycle(current=MemoryInboxSourceState.DELETED, target=MemoryInboxSourceState.REVIEW) is False


def test_new_lifecycle_schema_is_segregated_and_constraint_backed() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    names = set(inspector.get_table_names())
    expected = {
        "memory_inbox_sources",
        "memory_inbox_source_revisions",
        "memory_inbox_proposals",
        "memory_inbox_proposal_revisions",
        "memory_inbox_command_results",
        "memory_inbox_manifests",
        "memory_inbox_processing_attempts",
        "memory_inbox_jobs",
        "memory_inbox_deletion_operations",
        "memory_inbox_deletion_proofs",
        "memory_inbox_projection_snapshots",
    }
    assert expected <= names

    forbidden = ("body", "content", "payload", "filename", "path", "prompt", "summary", "context", "providerresponse")
    for table in expected:
        columns = {column["name"].lower() for column in inspector.get_columns(table)}
        assert not {column for column in columns if any(token in column for token in forbidden)}

    assert any(constraint["name"] == "uq_memory_inbox_source_revision" for constraint in inspector.get_unique_constraints("memory_inbox_source_revisions"))
    assert any(constraint["name"] == "uq_memory_inbox_proposal_revision" for constraint in inspector.get_unique_constraints("memory_inbox_proposal_revisions"))
    assert any(constraint["name"] == "uq_memory_inbox_command_replay" for constraint in inspector.get_unique_constraints("memory_inbox_command_results"))
    assert any(constraint["name"] == "uq_memory_inbox_attempt_fence" for constraint in inspector.get_unique_constraints("memory_inbox_processing_attempts"))


def test_migration_runbook_requires_capability_rollback_not_table_drop() -> None:
    runbook = Path(__file__).resolve().parents[3] / "docs" / "workflows" / "memory-inbox-lifecycle-migration.md"
    text = runbook.read_text(encoding="utf-8").lower()
    assert "capability rollback" in text
    assert "do not\ndrop tables" in text
    assert "legacy" in text and "segregated" in text


def test_command_replay_fence_rejects_duplicate_aggregate_idempotency_pair() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(MemoryInboxCommandResult(
            id="command:one",
            aggregate_id="source:alpha",
            expected_revision=1,
            idempotency_key="idempotency:alpha",
            command_kind="future_transition",
            request_digest="digest:alpha",
            outcome="accepted",
            reason_code="accepted",
            resulting_revision=1,
            actor_ref="operator:alpha",
        ))
        session.commit()
        session.add(MemoryInboxCommandResult(
            id="command:two",
            aggregate_id="source:alpha",
            expected_revision=1,
            idempotency_key="idempotency:alpha",
            command_kind="future_transition",
            request_digest="digest:alpha",
            outcome="replayed",
            reason_code="replayed",
            resulting_revision=1,
            actor_ref="operator:alpha",
        ))
        with pytest.raises(IntegrityError):
            session.commit()


@pytest.mark.asyncio
async def test_review_badge_count_uses_only_ready_proposal_aggregates(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-ready.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        from datetime import UTC, datetime, timedelta

        deadline = datetime.now(UTC) + timedelta(days=1)
        session.add_all((
            MemoryInboxSource(id="source:one", current_revision=1, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test"),
            MemoryInboxSource(id="source:two", current_revision=1, lifecycle_state="DeletePending", retention_deadline_at=deadline, deletion_state="Pending", policy_ref="policy:test"),
            MemoryInboxProposalAggregate(id="proposal:ready", source_id="source:one", current_revision=1, lifecycle_state="Ready"),
            MemoryInboxProposalAggregate(id="proposal:stale", source_id="source:two", current_revision=1, lifecycle_state="Ready"),
        ))
        await session.commit()
        assert await read_review_ready_count(session) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_review_inventory_excludes_review_sources_without_a_ready_proposal(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-inventory.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        from datetime import UTC, datetime, timedelta

        deadline = datetime.now(UTC) + timedelta(days=1)
        session.add_all((
            MemoryInboxSource(id="source:ready", current_revision=1, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test"),
            MemoryInboxSource(id="source:denied", current_revision=1, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test"),
            MemoryInboxProposalAggregate(id="proposal:ready", source_id="source:ready", current_revision=1, lifecycle_state="Ready"),
            MemoryInboxProposalAggregate(id="proposal:denied", source_id="source:denied", current_revision=1, lifecycle_state="Denied"),
        ))
        await session.commit()
        assert [row.source_id for row in await read_memory_inbox_projection(session)] == ["source:ready"]
    await engine.dispose()
