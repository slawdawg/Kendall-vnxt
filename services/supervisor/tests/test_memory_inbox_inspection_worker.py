from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_inspection_worker import claim_inspection_job, complete_inspection_job, execute_inspection_job
from supervisor.application.memory_inbox_scanner import ScannerOutcome
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxJob, MemoryInboxManifest, MemoryInboxSource, MemoryInboxSourceRevision
from supervisor.infrastructure.private_content_store import PrivateContentStore
from supervisor.worker.memory_inbox_inspection_poller import recover_claimed_inspection_jobs


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
        manifest = MemoryInboxManifest(id="inbox-manifest:worker", source_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:worker", declared_media_type="application/pdf", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="inbox-job:worker", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, manifest, job))
        await session.commit()
        claim = await claim_inspection_job(session, job_id=job.id)
        result = await complete_inspection_job(session, claim=claim, actor_ref="operator:verified", inspection_available=True, format_valid=True, inspected_media_type="application/pdf", scanner_outcome=ScannerOutcome.SAFE, extraction_succeeded=True)
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
        manifest = MemoryInboxManifest(id="inbox-manifest:unsafe", source_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:unsafe", declared_media_type="application/pdf", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="inbox-job:unsafe", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, manifest, job))
        await session.commit()
        claim = await claim_inspection_job(session, job_id=job.id)
        await complete_inspection_job(session, claim=claim, actor_ref="operator:verified", inspection_available=True, format_valid=True, inspected_media_type="application/pdf", scanner_outcome=ScannerOutcome.UNSAFE, extraction_succeeded=False)
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


@pytest.mark.asyncio
async def test_missing_quarantine_manifest_is_closed_without_retrying_or_reading(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'missing-manifest.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:missing-manifest", current_revision=2, lifecycle_state="Quarantined", retention_deadline_at=now + timedelta(hours=24), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        revision = MemoryInboxSourceRevision(id="inbox-source-revision:missing-manifest", source_id=source.id, revision=2, lifecycle_state="Quarantined", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        job = MemoryInboxJob(id="inbox-job:missing-manifest", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, job))
        await session.commit()
        with pytest.raises(ValueError, match="inspection_manifest_unavailable"):
            await claim_inspection_job(session, job_id=job.id)
        closed_job = await session.get(MemoryInboxJob, job.id)
        assert closed_job.lifecycle_state == "Closed"
        assert closed_job.result_ref.startswith("inspection:manifest_unavailable:")
    await engine.dispose()


@pytest.mark.asyncio
async def test_cancelled_job_is_closed_before_inspection_content_can_be_read(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'cancelled.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        job = MemoryInboxJob(id="inbox-job:cancelled", source_revision_id="inbox-source-revision:cancelled", capability_ref="inspection-v1", lifecycle_state="Planned", cancelled_at=now, lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add(job)
        await session.commit()
        with pytest.raises(ValueError, match="inspection_job_cancelled"):
            await claim_inspection_job(session, job_id=job.id)
        cancelled_job = await session.get(MemoryInboxJob, job.id)
        assert cancelled_job.lifecycle_state == "Closed"
        assert cancelled_job.result_ref.startswith("inspection:cancelled:")
    await engine.dispose()


@pytest.mark.asyncio
async def test_cancellation_after_claim_fences_the_result_without_transitioning_source(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'cancel-after-claim.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:cancel-after", current_revision=2, lifecycle_state="Quarantined", retention_deadline_at=now + timedelta(hours=24), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        revision = MemoryInboxSourceRevision(id="inbox-source-revision:cancel-after", source_id=source.id, revision=2, lifecycle_state="Quarantined", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifest = MemoryInboxManifest(id="inbox-manifest:cancel-after", source_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:cancel-after", declared_media_type="application/pdf", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="inbox-job:cancel-after", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, manifest, job))
        await session.commit()
        claim = await claim_inspection_job(session, job_id=job.id)
        job.cancelled_at = datetime.now(timezone.utc)
        await session.commit()
        with pytest.raises(ValueError, match="inspection_job_cancelled"):
            await complete_inspection_job(session, claim=claim, actor_ref="worker:test", inspection_available=True, format_valid=True, inspected_media_type="application/pdf", scanner_outcome=ScannerOutcome.SAFE, extraction_succeeded=True)
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "Quarantined"
        assert (await session.get(MemoryInboxJob, job.id)).lifecycle_state == "Closed"
    await engine.dispose()


@pytest.mark.asyncio
async def test_execute_runs_private_scanner_and_extractor_before_safe_transition(tmp_path) -> None:
    private_store = tmp_path / "private-store"
    private_store.mkdir(mode=0o700)
    scanner = tmp_path / "scanner"
    extractor = tmp_path / "extractor"
    scanner.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    extractor.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    scanner.chmod(0o700)
    extractor.chmod(0o700)
    settings = Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(private_store),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_INSPECTION_ENABLED=True,
        SUPERVISOR_MEMORY_INBOX_SCANNER_PATH=str(scanner),
        SUPERVISOR_MEMORY_INBOX_EXTRACTOR_PATH=str(extractor),
    )
    store = PrivateContentStore(str(private_store))
    store.write_text("inbox-store:executed", "%PDF-1.7\nprivate")
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'executed.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:executed", current_revision=2, lifecycle_state="Quarantined", retention_deadline_at=now + timedelta(hours=24), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        revision = MemoryInboxSourceRevision(id="inbox-source-revision:executed", source_id=source.id, revision=2, lifecycle_state="Quarantined", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifest = MemoryInboxManifest(id="inbox-manifest:executed", source_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:executed", declared_media_type="application/pdf", creation_state="Created", retention_class="source_retention", deletion_state="None")
        job = MemoryInboxJob(id="inbox-job:executed", source_revision_id=revision.id, capability_ref="inspection-v1", lifecycle_state="Planned", lease_expires_at=now + timedelta(seconds=60), timeout_at=now + timedelta(seconds=60))
        session.add_all((source, revision, manifest, job))
        await session.commit()
        assert await execute_inspection_job(session, settings=settings, job_id=job.id, actor_ref="worker:test") == "safe_to_act"
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "Unprocessed"
    await engine.dispose()


@pytest.mark.asyncio
async def test_restart_recovery_closes_orphaned_claim_without_rereading_private_content(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'recovery.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        job = MemoryInboxJob(id="inbox-job:recovery", source_revision_id="inbox-source-revision:recovery", capability_ref="inspection-v1", lifecycle_state="Claimed")
        session.add(job)
        await session.commit()
        assert await recover_claimed_inspection_jobs(session) == 1
        recovered_job = await session.get(MemoryInboxJob, job.id)
        assert recovered_job.lifecycle_state == "Closed"
        assert recovered_job.result_ref.startswith("inspection:cancelled_or_restarted:")
    await engine.dispose()
