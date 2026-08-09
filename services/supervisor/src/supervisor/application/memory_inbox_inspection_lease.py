"""Durable, revision-bound planning for a future quarantined-source inspector."""

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.models import MemoryInboxJob, MemoryInboxSource, MemoryInboxSourceRevision


async def plan_inspection_lease(session: AsyncSession, *, source_id: str, actor_ref: str, lease_seconds: int = 60) -> MemoryInboxJob:
    source = (await session.execute(select(MemoryInboxSource).where(MemoryInboxSource.id == source_id).with_for_update())).scalar_one_or_none()
    if source is None:
        raise ValueError("inspection_source_not_found")
    if source.lifecycle_state not in {MemoryInboxSourceState.SCANNING.value, MemoryInboxSourceState.QUARANTINED.value}:
        raise ValueError("inspection_source_not_quarantined")
    revision = source.current_revision
    existing = (await session.execute(select(MemoryInboxJob).where(MemoryInboxJob.source_revision_id.in_(
        select(MemoryInboxSourceRevision.id).where(MemoryInboxSourceRevision.source_id == source_id, MemoryInboxSourceRevision.revision == revision)
    ), MemoryInboxJob.lifecycle_state.in_(("Planned", "Claimed"))))).scalar_one_or_none()
    if existing is not None:
        return existing
    now = datetime.now(timezone.utc)
    revision_row = (await session.execute(select(MemoryInboxSourceRevision).where(MemoryInboxSourceRevision.source_id == source_id, MemoryInboxSourceRevision.revision == revision))).scalar_one()
    job = MemoryInboxJob(id=f"inbox-job:{uuid.uuid4().hex}", source_revision_id=revision_row.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=lease_seconds), timeout_at=now + timedelta(seconds=lease_seconds))
    session.add(job)
    if source.lifecycle_state == MemoryInboxSourceState.SCANNING.value:
        source.lifecycle_state = MemoryInboxSourceState.QUARANTINED.value
        source.current_revision += 1
        session.add(MemoryInboxSourceRevision(id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id, revision=source.current_revision, lifecycle_state=MemoryInboxSourceState.QUARANTINED.value, actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref))
    await session.commit()
    return job
