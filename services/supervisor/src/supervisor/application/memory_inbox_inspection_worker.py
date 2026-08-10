"""Database-backed claim and completion fence for quarantine inspection jobs."""

from dataclasses import dataclass
from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.memory_inbox_inspection_result import fence_inspection_result
from supervisor.application.memory_inbox_scanner import ScannerOutcome
from supervisor.application.memory_inbox_scanner import extract_private_quarantine
from supervisor.application.memory_inbox_scanner import scan_private_quarantine
from supervisor.application.memory_inbox_format_inspection import validate_quarantined_format
from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.models import MemoryInboxJob, MemoryInboxManifest, MemoryInboxSource, MemoryInboxSourceRevision
from supervisor.infrastructure.private_content_store import PrivateContentStore, PrivateContentStoreError


@dataclass(frozen=True)
class InspectionClaim:
    job_id: str
    source_id: str
    source_revision_id: str
    source_revision: int
    store_ref: str
    declared_media_type: str


async def execute_inspection_job(session: AsyncSession, *, settings: Settings, job_id: str, actor_ref: str) -> str:
    """Run one configured private inspection through the durable result fence."""
    if error := settings.memory_inbox_inspection_configuration_error():
        raise ValueError(error)
    claim = await claim_inspection_job(session, job_id=job_id)
    store = PrivateContentStore(settings.memory_inbox_content_store_root or "")
    inspection_available = True
    try:
        content = store.read_for_inspection(claim.store_ref, maximum_bytes=25 * 1024 * 1024)
        format_result = validate_quarantined_format(
            declared_media_type=claim.declared_media_type, content=content,
        )
    except (OSError, PrivateContentStoreError):
        inspection_available = False
        format_result = None
    scanner_outcome = ScannerOutcome.UNAVAILABLE
    extraction_succeeded = False
    if format_result and format_result.valid:
        try:
            object_path = store.inspection_path(claim.store_ref, maximum_bytes=25 * 1024 * 1024)
            scanner_result = await scan_private_quarantine(
                scanner_path=settings.memory_inbox_scanner_path or "",
                object_path=object_path,
                timeout_seconds=settings.memory_inbox_scanner_timeout_seconds,
            )
            scanner_outcome = scanner_result.outcome
            if scanner_outcome is ScannerOutcome.SAFE:
                extractor_result = await extract_private_quarantine(
                    extractor_path=settings.memory_inbox_extractor_path or "",
                    object_path=object_path,
                    timeout_seconds=settings.memory_inbox_scanner_timeout_seconds,
                )
                extraction_succeeded = extractor_result.outcome is ScannerOutcome.SAFE
        except OSError:
            scanner_outcome = ScannerOutcome.UNAVAILABLE
    return await complete_inspection_job(
        session, claim=claim, actor_ref=actor_ref, inspection_available=inspection_available,
        format_valid=format_result.valid if format_result else False,
        inspected_media_type=format_result.inspected_media_type if format_result else None,
        scanner_outcome=scanner_outcome,
        extraction_succeeded=extraction_succeeded,
    )


async def claim_inspection_job(session: AsyncSession, *, job_id: str) -> InspectionClaim:
    """Claim a planned inspection job and return only private opaque references."""
    now = datetime.now(timezone.utc)
    job = (await session.execute(select(MemoryInboxJob).where(MemoryInboxJob.id == job_id).with_for_update())).scalar_one_or_none()
    if job is None or job.lifecycle_state != "Planned":
        raise ValueError("inspection_job_unavailable")
    if job.cancelled_at is not None:
        job.lifecycle_state = "Closed"
        job.result_ref = f"inspection:cancelled:{uuid.uuid4().hex}"
        await session.commit()
        raise ValueError("inspection_job_cancelled")
    if job.lease_expires_at is None or job.timeout_at is None or now >= job.lease_expires_at or now >= job.timeout_at:
        job.lifecycle_state = "Closed"
        job.result_ref = f"inspection:expired:{uuid.uuid4().hex}"
        await session.commit()
        raise ValueError("inspection_job_expired")
    revision = await session.get(MemoryInboxSourceRevision, job.source_revision_id)
    if revision is None:
        job.lifecycle_state = "Closed"
        job.result_ref = f"inspection:revision_unavailable:{uuid.uuid4().hex}"
        await session.commit()
        raise ValueError("inspection_revision_unavailable")
    source = (await session.execute(
        select(MemoryInboxSource)
        .where(MemoryInboxSource.id == revision.source_id)
        .with_for_update()
    )).scalar_one_or_none()
    if (
        source is None
        or source.lifecycle_state != MemoryInboxSourceState.QUARANTINED.value
        or source.deletion_state != "None"
        or source.current_revision != revision.revision
    ):
        job.lifecycle_state = "Closed"
        job.result_ref = f"inspection:source_state_mismatch:{uuid.uuid4().hex}"
        await session.commit()
        raise ValueError("inspection_source_unavailable")
    manifest = (await session.execute(select(MemoryInboxManifest).where(
        MemoryInboxManifest.owner_revision_id == revision.id,
        MemoryInboxManifest.copy_class == "quarantine",
        MemoryInboxManifest.creation_state == "Created",
        MemoryInboxManifest.deletion_state == "None",
    ))).scalar_one_or_none()
    if manifest is None or not manifest.declared_media_type:
        job.lifecycle_state = "Closed"
        job.result_ref = f"inspection:manifest_unavailable:{uuid.uuid4().hex}"
        await session.commit()
        raise ValueError("inspection_manifest_unavailable")
    job.lifecycle_state = "Claimed"
    job.heartbeat_at = now
    await session.commit()
    return InspectionClaim(job.id, revision.source_id, revision.id, revision.revision, manifest.store_ref, manifest.declared_media_type)


async def complete_inspection_job(
    session: AsyncSession,
    *,
    claim: InspectionClaim,
    actor_ref: str,
    inspection_available: bool,
    format_valid: bool,
    inspected_media_type: str | None,
    scanner_outcome: ScannerOutcome,
    extraction_succeeded: bool,
) -> str:
    """Apply one result only if the original job and revision remain current."""
    now = datetime.now(timezone.utc)
    job = (await session.execute(select(MemoryInboxJob).where(MemoryInboxJob.id == claim.job_id).with_for_update())).scalar_one_or_none()
    source = (await session.execute(select(MemoryInboxSource).where(MemoryInboxSource.id == claim.source_id).with_for_update())).scalar_one_or_none()
    if job is None or source is None:
        raise ValueError("inspection_result_unavailable")
    decision = fence_inspection_result(
        source_state=source.lifecycle_state, source_current_revision=source.current_revision,
        job_source_revision=claim.source_revision, job_state=job.lifecycle_state,
        cancelled_at=job.cancelled_at,
        lease_expires_at=job.lease_expires_at, timeout_at=job.timeout_at, now=now,
        inspection_available=inspection_available, format_valid=format_valid,
        scanner_outcome=scanner_outcome,
        extraction_succeeded=extraction_succeeded,
    )
    job.lifecycle_state = "Closed"
    job.result_ref = f"inspection:{decision.reason_code}:{uuid.uuid4().hex}"
    if not decision.accepted:
        await session.commit()
        raise ValueError(decision.reason_code)
    manifest = (await session.execute(select(MemoryInboxManifest).where(
        MemoryInboxManifest.owner_revision_id == claim.source_revision_id,
        MemoryInboxManifest.copy_class == "quarantine",
    ).with_for_update())).scalar_one_or_none()
    if manifest is None or manifest.store_ref != claim.store_ref or manifest.declared_media_type != claim.declared_media_type:
        await session.commit()
        raise ValueError("inspection_manifest_mismatch")
    if format_valid and inspected_media_type:
        manifest.inspected_media_type = inspected_media_type
    if decision.target_state is not None:
        source.current_revision += 1
        source.lifecycle_state = decision.target_state.value
        session.add(MemoryInboxSourceRevision(
            id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id,
            revision=source.current_revision, lifecycle_state=source.lifecycle_state,
            actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref,
        ))
    await session.commit()
    return decision.reason_code
