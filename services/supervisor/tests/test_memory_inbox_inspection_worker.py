from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_inspection_worker import claim_inspection_job, complete_inspection_job
from supervisor.application.memory_inbox_scanner import ScannerOutcome
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxJob, MemoryInboxManifest, MemoryInboxSource, MemoryInboxSourceRevision


@pytest.mark.asyncio
async def test_claimed_clean_result_advances_only_its_current_quarantine_revision(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'inspection.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:worker", current_revision=2, lifecycle_state="Quarantined", retention_deadline_at=now + timedelta(hours=24), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        revision = MemoryInboxSourceRevision(id="inbox-source-revision:worker", source_id=source.id, revision=2, lifecycle_state="Quarantined", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifest = MemoryInboxManifest(id="inbox-manifest:worker", owner_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:worker", declared_media_type="application/pdf", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="inbox-job:worker", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, manifest, job))
        await session.commit()
        claim = await claim_inspection_job(session, job_id=job.id)
        result = await complete_inspection_job(session, claim=claim, actor_ref="operator:verified", format_valid=True, inspected_media_type="application/pdf", scanner_outcome=ScannerOutcome.SAFE)
        updated_source = await session.get(MemoryInboxSource, source.id)
        updated_job = await session.get(MemoryInboxJob, job.id)
        updated_manifest = (await session.execute(select(MemoryInboxManifest).where(MemoryInboxManifest.id == manifest.id))).scalar_one()
        assert result == "safe_to_act"
        assert updated_source.lifecycle_state == "Unprocessed" and updated_source.current_revision == 3
        assert updated_job.lifecycle_state == "Closed"
        assert updated_manifest.inspected_media_type == "application/pdf"
    await engine.dispose()


@pytest.mark.asyncio
async def test_unsafe_result_rejects_the_exact_quarantined_source(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'unsafe.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:unsafe", current_revision=2, lifecycle_state="Quarantined", retention_deadline_at=now + timedelta(hours=24), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        revision = MemoryInboxSourceRevision(id="inbox-source-revision:unsafe", source_id=source.id, revision=2, lifecycle_state="Quarantined", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifest = MemoryInboxManifest(id="inbox-manifest:unsafe", owner_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:unsafe", declared_media_type="application/pdf", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="inbox-job:unsafe", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, manifest, job))
        await session.commit()
        claim = await claim_inspection_job(session, job_id=job.id)
        await complete_inspection_job(session, claim=claim, actor_ref="operator:verified", format_valid=True, inspected_media_type="application/pdf", scanner_outcome=ScannerOutcome.UNSAFE)
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "RejectedUnsafe"
    await engine.dispose()


@pytest.mark.asyncio
async def test_stale_source_is_closed_before_inspection_content_can_be_read(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'stale.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:stale", current_revision=3, lifecycle_state="Unprocessed", retention_deadline_at=now + timedelta(hours=24), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        old_revision = MemoryInboxSourceRevision(id="inbox-source-revision:stale", source_id=source.id, revision=2, lifecycle_state="Quarantined", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        job = MemoryInboxJob(id="inbox-job:stale", source_revision_id=old_revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, old_revision, job))
        await session.commit()
        with pytest.raises(ValueError, match="inspection_source_unavailable"):
            await claim_inspection_job(session, job_id=job.id)
        updated_job = await session.get(MemoryInboxJob, job.id)
        assert updated_job.lifecycle_state == "Closed"
        assert updated_job.result_ref.startswith("inspection:source_state_mismatch:")
    await engine.dispose()
