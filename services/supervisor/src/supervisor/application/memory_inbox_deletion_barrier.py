"""Shared, fail-closed barrier before any Memory Inbox source deletion."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import (
    MemoryInboxDeletionOperation, MemoryInboxJob, MemoryInboxManifest,
    MemoryInboxProcessingAttempt, MemoryInboxProcessingDisclosure,
    MemoryInboxProposalAggregate, MemoryInboxProposalReaderGrant,
    MemoryInboxProposalRevision, MemoryInboxSource, MemoryInboxSourceRevision,
)


async def establish_deletion_barrier(
    session: AsyncSession, *, source: MemoryInboxSource, actor_ref: str, now: datetime | None = None,
) -> int:
    """Irreversibly close source use, then plan proven-copy deletion when safe.

    The caller must hold the Source lock and own command idempotency.  This is
    deliberately shared by approval, operator deletion, and retention expiry:
    none of those entry points may bypass cancellation, disclosure invalidation,
    reader-grant revocation, or the bounded active-job lease fence.
    """
    now = now or datetime.now(timezone.utc)
    revisions = list((await session.scalars(select(MemoryInboxSourceRevision).where(
        MemoryInboxSourceRevision.source_id == source.id,
    ).with_for_update())).all())
    revision_ids = [revision.id for revision in revisions]
    jobs = list((await session.scalars(select(MemoryInboxJob).where(
        MemoryInboxJob.source_revision_id.in_(revision_ids),
    ).with_for_update())).all()) if revision_ids else []
    attempts = list((await session.scalars(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.source_revision_id.in_(revision_ids),
    ).with_for_update())).all()) if revision_ids else []
    if any(attempt.lifecycle_state == "CompletionUnknown" for attempt in attempts):
        raise ValueError("deletion_attempt_completion_unknown")
    for job in jobs:
        if job.lifecycle_state in {"Planned", "Claimed"}:
            job.cancelled_at = now
    for attempt in attempts:
        if attempt.lifecycle_state in {"Planned", "Claimed", "Dispatched"}:
            attempt.lifecycle_state = "Cancelled"
    if revision_ids:
        disclosures = list((await session.scalars(select(MemoryInboxProcessingDisclosure).where(
            MemoryInboxProcessingDisclosure.source_revision_id.in_(revision_ids),
            MemoryInboxProcessingDisclosure.lifecycle_state == "Accepted",
        ).with_for_update())).all())
        for disclosure in disclosures:
            disclosure.lifecycle_state = "Invalidated"
    proposal_revisions = list((await session.scalars(select(MemoryInboxProposalRevision).join(
        MemoryInboxProposalAggregate,
        MemoryInboxProposalAggregate.id == MemoryInboxProposalRevision.proposal_id,
    ).where(MemoryInboxProposalAggregate.source_id == source.id).with_for_update())).all())
    proposal_revision_ids = [revision.id for revision in proposal_revisions]
    if proposal_revision_ids:
        grants = list((await session.scalars(select(MemoryInboxProposalReaderGrant).where(
            MemoryInboxProposalReaderGrant.proposal_revision_id.in_(proposal_revision_ids),
            MemoryInboxProposalReaderGrant.revoked_at.is_(None),
        ).with_for_update())).all())
        for grant in grants:
            grant.lifecycle_state = "Revoked"
            grant.revoked_at = now
    source.current_revision += 1
    source.lifecycle_state = "DeletePending"
    source.deletion_state = "Pending"
    session.add(MemoryInboxSourceRevision(
        id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id,
        revision=source.current_revision, lifecycle_state="DeletePending",
        actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref,
    ))
    active_claims = any(
        job.lifecycle_state == "Claimed" and job.lease_expires_at and job.lease_expires_at > now
        for job in jobs
    )
    return 0 if active_claims else await plan_pending_deletion_operations(session, source=source, now=now)


async def plan_pending_deletion_operations(
    session: AsyncSession, *, source: MemoryInboxSource, now: datetime | None = None,
) -> int:
    """Plan each unproved registered copy after the approved-use barrier clears."""
    if source.lifecycle_state != "DeletePending" or source.deletion_state not in {"Pending", "RetryNeeded"}:
        return 0
    now = now or datetime.now(timezone.utc)
    revision_ids = list((await session.scalars(select(MemoryInboxSourceRevision.id).where(
        MemoryInboxSourceRevision.source_id == source.id,
    ))).all())
    if not revision_ids:
        return 0
    active_claim = await session.scalar(select(MemoryInboxJob.id).where(
        MemoryInboxJob.source_revision_id.in_(revision_ids),
        MemoryInboxJob.lifecycle_state == "Claimed",
        MemoryInboxJob.lease_expires_at.is_not(None),
        MemoryInboxJob.lease_expires_at > now,
    ))
    if active_claim is not None:
        return 0
    manifests = list((await session.scalars(select(MemoryInboxManifest).where(
        MemoryInboxManifest.owner_revision_id.in_(revision_ids),
        MemoryInboxManifest.deletion_state != "Proven",
    ).with_for_update())).all())
    if not manifests:
        # Missing/unknown copy truth is never permission to declare deletion.
        source.deletion_state = "RetryNeeded"
        return 0
    created = 0
    for manifest in manifests:
        existing = await session.scalar(select(MemoryInboxDeletionOperation).where(
            MemoryInboxDeletionOperation.manifest_id == manifest.id,
        ))
        if existing is None:
            session.add(MemoryInboxDeletionOperation(
                id=f"inbox-deletion:{uuid.uuid4().hex}", manifest_id=manifest.id,
                lifecycle_state="Planned", requested_at=now,
            ))
            created += 1
    return created
