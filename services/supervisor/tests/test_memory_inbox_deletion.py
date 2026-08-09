from datetime import datetime, timedelta, timezone
import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_approval import plan_pending_deletion_operations
from supervisor.application.memory_inbox_deletion import execute_deletion_operation
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxDeletionOperation, MemoryInboxJob, MemoryInboxManifest, MemoryInboxSource, MemoryInboxSourceRevision
from supervisor.infrastructure.private_content_store import PrivateContentStore


@pytest.mark.asyncio
async def test_only_all_proven_registered_copies_terminally_delete_an_approved_source(tmp_path) -> None:
    root = tmp_path / "private"; root.mkdir(mode=0o700); os.chmod(root, 0o700)
    store = PrivateContentStore(str(root)); store.write_text("inbox-store:delete-one", "one"); store.write_text("inbox-store:delete-two", "two")
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'deletion.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source = MemoryInboxSource(id="source:delete", current_revision=4, lifecycle_state="DeletePending", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="Pending", policy_ref="policy:test")
        revision = MemoryInboxSourceRevision(id="source-revision:delete", source_id=source.id, revision=4, lifecycle_state="DeletePending", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifests = [MemoryInboxManifest(id="manifest:delete-one", owner_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:delete-one", creation_state="Created", retention_class="source_retention", deletion_state="None"), MemoryInboxManifest(id="manifest:delete-two", owner_revision_id=revision.id, copy_class="preview", store_ref="inbox-store:delete-two", creation_state="Created", retention_class="source_retention", deletion_state="None")]
        operations = [MemoryInboxDeletionOperation(id="operation:delete-one", manifest_id=manifests[0].id, lifecycle_state="Planned"), MemoryInboxDeletionOperation(id="operation:delete-two", manifest_id=manifests[1].id, lifecycle_state="Planned")]
        session.add_all((source, revision, *manifests, *operations)); await session.commit()
        settings = Settings(SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root), SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24)
        assert await execute_deletion_operation(session, settings=settings, operation_id=operations[0].id, actor_ref="worker:test") == "deletion_proven"
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "DeletePending"
        assert await execute_deletion_operation(session, settings=settings, operation_id=operations[1].id, actor_ref="worker:test") == "deleted_after_approval"
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "Deleted"
        assert len((await session.scalars(select(MemoryInboxDeletionOperation).where(MemoryInboxDeletionOperation.lifecycle_state == "Proven"))).all()) == 2
    await engine.dispose()


@pytest.mark.asyncio
async def test_deletion_planning_waits_for_cancelled_live_claim_then_reconciles_once(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'planning.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        now = datetime.now(timezone.utc)
        source = MemoryInboxSource(id="source:planning", current_revision=2, lifecycle_state="DeletePending", retention_deadline_at=now + timedelta(hours=1), deletion_state="Pending", policy_ref="policy:test")
        revision = MemoryInboxSourceRevision(id="source-revision:planning", source_id=source.id, revision=2, lifecycle_state="DeletePending", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifest = MemoryInboxManifest(id="manifest:planning", owner_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:planning", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="job:planning", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Claimed", cancelled_at=now, lease_expires_at=now + timedelta(minutes=1))
        session.add_all((source, revision, manifest, job)); await session.commit()
        assert await plan_pending_deletion_operations(session, source=source, now=now) == 0
        job.lease_expires_at = now - timedelta(seconds=1)
        assert await plan_pending_deletion_operations(session, source=source, now=now) == 1
        await session.commit()
        assert await plan_pending_deletion_operations(session, source=source, now=now) == 0
        assert len((await session.scalars(select(MemoryInboxDeletionOperation))).all()) == 1
    await engine.dispose()
