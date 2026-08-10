from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_lifecycle import MemoryInboxLifecycleCommand, apply_lifecycle_command
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxSource, MemoryInboxSourceRevision


async def _seed_source(session, *, source_id: str, state: MemoryInboxSourceState, deadline: datetime) -> MemoryInboxSource:
    source = MemoryInboxSource(
        id=source_id, current_revision=2, lifecycle_state=state.value,
        retention_deadline_at=deadline, deletion_state="None", policy_ref="memory-inbox-retention-v1",
    )
    session.add_all((
        source,
        MemoryInboxSourceRevision(
            id=f"inbox-source-revision:{source_id}", source_id=source_id, revision=2,
            lifecycle_state=state.value, actor_ref="operator:seed", audit_ref="audit:seed",
            policy_ref=source.policy_ref,
        ),
    ))
    await session.commit()
    return source


async def _save_draft(session, *, source_id: str, expected_revision: int, key: str):
    return await apply_lifecycle_command(
        session,
        MemoryInboxLifecycleCommand(
            source_id=source_id, expected_revision=expected_revision, idempotency_key=key,
            target_state=MemoryInboxSourceState.DRAFT,
        ),
        verified_actor_ref="operator:verified", audit_ref="audit:draft",
    )


@pytest.mark.asyncio
async def test_safe_source_draft_is_versioned_and_idempotent_without_dispatch(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'draft.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        source = await _seed_source(
            session, source_id="inbox-source:draft", state=MemoryInboxSourceState.UNPROCESSED,
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        result = await _save_draft(session, source_id=source.id, expected_revision=2, key="draft-key")
        replay = await _save_draft(session, source_id=source.id, expected_revision=2, key="draft-key")
        updated = await session.get(MemoryInboxSource, source.id)
        assert (result.outcome, result.resulting_revision, result.lifecycle_state) == ("accepted", 3, MemoryInboxSourceState.DRAFT)
        assert (replay.outcome, replay.resulting_revision, replay.lifecycle_state) == ("replayed", 3, MemoryInboxSourceState.DRAFT)
        assert updated.current_revision == 3 and updated.lifecycle_state == "Draft"
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("state", [MemoryInboxSourceState.QUARANTINED, MemoryInboxSourceState.REJECTED_UNSAFE, MemoryInboxSourceState.DELETE_PENDING])
async def test_stale_or_unsafe_source_draft_request_records_its_current_state(tmp_path, state) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / f'{state.value}.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        source = await _seed_source(
            session, source_id=f"inbox-source:{state.value}", state=state,
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        result = await _save_draft(session, source_id=source.id, expected_revision=2, key=f"draft-{state.value}")
        assert (result.outcome, result.reason_code, result.lifecycle_state) == ("rejected", "transition_not_allowed", state)
    await engine.dispose()


@pytest.mark.asyncio
async def test_expired_source_cannot_be_saved_as_draft(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'expired.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        source = await _seed_source(
            session, source_id="inbox-source:expired", state=MemoryInboxSourceState.UNPROCESSED,
            deadline=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
        result = await _save_draft(session, source_id=source.id, expected_revision=2, key="draft-expired")
        assert (result.outcome, result.reason_code, result.lifecycle_state) == ("rejected", "source_retention_expired", MemoryInboxSourceState.UNPROCESSED)
    await engine.dispose()
