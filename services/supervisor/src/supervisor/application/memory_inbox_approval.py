"""Version-locked approval and deletion-barrier planning for Memory Inbox."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import (
    MemoryInboxCommandResult, MemoryInboxDeletionOperation, MemoryInboxJob,
    MemoryInboxManifest, MemoryInboxProcessingAttempt, MemoryInboxProcessingDisclosure,
    MemoryInboxProposalAggregate, MemoryInboxProposalReaderGrant, MemoryInboxProposalRevision,
    MemoryInboxSource, MemoryInboxSourceRevision,
)


@dataclass(frozen=True)
class ApprovalResult:
    proposal_id: str
    proposal_revision: int
    source_id: str
    source_revision: int
    deletion_operations: int
    replayed: bool


async def approve_proposal_for_deletion(
    session: AsyncSession, *, proposal_id: str, expected_revision: int, idempotency_key: str, actor_ref: str,
) -> ApprovalResult:
    """Lock one Ready proposal and start, but never claim completion of, deletion."""
    if expected_revision < 1 or not idempotency_key:
        raise ValueError("approval_invalid")
    digest = hashlib.sha256(f"{proposal_id}\x1f{expected_revision}\x1fapprove".encode("utf-8")).hexdigest()
    recorded = (await session.execute(select(MemoryInboxCommandResult).where(
        MemoryInboxCommandResult.aggregate_id == proposal_id,
        MemoryInboxCommandResult.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if recorded is not None:
        if recorded.command_kind != "proposal_approval" or recorded.request_digest != digest:
            raise ValueError("approval_idempotency_conflict")
        proposal = await session.get(MemoryInboxProposalAggregate, proposal_id)
        source = await session.get(MemoryInboxSource, proposal.source_id) if proposal else None
        if proposal is None or source is None:
            raise ValueError("approval_unavailable")
        return ApprovalResult(proposal.id, proposal.current_revision, source.id, source.current_revision, await _operation_count(session, source.id), True)
    proposal = (await session.execute(select(MemoryInboxProposalAggregate).where(
        MemoryInboxProposalAggregate.id == proposal_id
    ).with_for_update())).scalar_one_or_none()
    if proposal is None or proposal.lifecycle_state != "Ready" or proposal.current_revision != expected_revision:
        raise ValueError("approval_revision_unavailable")
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == proposal.source_id
    ).with_for_update())).scalar_one_or_none()
    if source is None or source.lifecycle_state != "Review" or source.deletion_state != "None" or source.retention_deadline_at <= datetime.now(timezone.utc):
        raise ValueError("approval_revision_unavailable")
    proposal_revision = (await session.execute(select(MemoryInboxProposalRevision).where(
        MemoryInboxProposalRevision.proposal_id == proposal.id,
        MemoryInboxProposalRevision.revision == expected_revision,
        MemoryInboxProposalRevision.lifecycle_state == "Ready",
    ).with_for_update())).scalar_one_or_none()
    if proposal_revision is None:
        raise ValueError("approval_revision_unavailable")
    revisions = (await session.scalars(select(MemoryInboxSourceRevision).where(MemoryInboxSourceRevision.source_id == source.id))).all()
    revision_ids = [revision.id for revision in revisions]
    jobs = (await session.scalars(select(MemoryInboxJob).where(MemoryInboxJob.source_revision_id.in_(revision_ids)).with_for_update())).all()
    attempts = (await session.scalars(select(MemoryInboxProcessingAttempt).where(MemoryInboxProcessingAttempt.source_revision_id.in_(revision_ids)).with_for_update())).all()
    if any(attempt.lifecycle_state == "CompletionUnknown" for attempt in attempts):
        raise ValueError("approval_attempt_completion_unknown")
    now = datetime.now(timezone.utc)
    for job in jobs:
        if job.lifecycle_state in {"Planned", "Claimed"}:
            job.cancelled_at = now
    for attempt in attempts:
        if attempt.lifecycle_state in {"Planned", "Claimed", "Dispatched"}:
            attempt.lifecycle_state = "Cancelled"
    disclosures = (await session.scalars(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.source_revision_id.in_(revision_ids),
        MemoryInboxProcessingDisclosure.lifecycle_state == "Accepted",
    ).with_for_update())).all()
    for disclosure in disclosures:
        disclosure.lifecycle_state = "Invalidated"
    proposal_revisions = (await session.scalars(select(MemoryInboxProposalRevision).where(
        MemoryInboxProposalRevision.proposal_id == proposal.id
    ))).all()
    proposal_revision_ids = [revision.id for revision in proposal_revisions]
    for grant in (await session.scalars(select(MemoryInboxProposalReaderGrant).where(
        MemoryInboxProposalReaderGrant.proposal_revision_id.in_(proposal_revision_ids),
        MemoryInboxProposalReaderGrant.revoked_at.is_(None),
    ).with_for_update())).all():
        grant.lifecycle_state = "Revoked"
        grant.revoked_at = now
    proposal.current_revision += 1
    proposal.lifecycle_state = "Approved"
    source.current_revision += 1
    source.lifecycle_state = "DeletePending"
    source.deletion_state = "Pending"
    session.add_all((
        MemoryInboxProposalRevision(id=f"inbox-proposal-revision:{uuid.uuid4().hex}", proposal_id=proposal.id, revision=proposal.current_revision, lifecycle_state="Approved", actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}"),
        MemoryInboxSourceRevision(id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id, revision=source.current_revision, lifecycle_state="DeletePending", actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref),
        MemoryInboxCommandResult(id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=proposal.id, expected_revision=expected_revision, idempotency_key=idempotency_key, command_kind="proposal_approval", request_digest=digest, outcome="accepted", reason_code="approved_deletion_pending", resulting_revision=proposal.current_revision, actor_ref=actor_ref),
    ))
    active_claims = any(job.lifecycle_state == "Claimed" and job.lease_expires_at and job.lease_expires_at > now for job in jobs)
    operation_count = 0
    if not active_claims:
        manifests = (await session.scalars(select(MemoryInboxManifest).where(MemoryInboxManifest.owner_revision_id.in_(revision_ids), MemoryInboxManifest.deletion_state != "Proven").with_for_update())).all()
        for manifest in manifests:
            existing = await session.scalar(select(MemoryInboxDeletionOperation).where(MemoryInboxDeletionOperation.manifest_id == manifest.id))
            if existing is None:
                session.add(MemoryInboxDeletionOperation(id=f"inbox-deletion:{uuid.uuid4().hex}", manifest_id=manifest.id, lifecycle_state="Planned", requested_at=now))
                operation_count += 1
    await session.commit()
    return ApprovalResult(proposal.id, proposal.current_revision, source.id, source.current_revision, operation_count, False)


async def _operation_count(session: AsyncSession, source_id: str) -> int:
    revision_ids = select(MemoryInboxSourceRevision.id).where(MemoryInboxSourceRevision.source_id == source_id)
    manifest_ids = select(MemoryInboxManifest.id).where(MemoryInboxManifest.owner_revision_id.in_(revision_ids))
    return len((await session.scalars(select(MemoryInboxDeletionOperation.id).where(MemoryInboxDeletionOperation.manifest_id.in_(manifest_ids)))).all())
