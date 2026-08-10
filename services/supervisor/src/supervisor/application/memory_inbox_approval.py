"""Version-locked approval and deletion-barrier planning for Memory Inbox."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.memory_inbox_deletion_barrier import establish_deletion_barrier, source_copy_owner_revision_ids
from supervisor.domain.memory_inbox_time import retention_expired
from supervisor.infrastructure.db.models import (
    MemoryInboxCommandResult, MemoryInboxDeletionOperation, MemoryInboxManifest,
    MemoryInboxProposalAggregate, MemoryInboxProposalRevision, MemoryInboxSource,
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
    if source is None or source.lifecycle_state != "Review" or source.deletion_state != "None" or retention_expired(source.retention_deadline_at):
        raise ValueError("approval_revision_unavailable")
    proposal_revision = (await session.execute(select(MemoryInboxProposalRevision).where(
        MemoryInboxProposalRevision.proposal_id == proposal.id,
        MemoryInboxProposalRevision.revision == expected_revision,
        MemoryInboxProposalRevision.lifecycle_state == "Ready",
    ).with_for_update())).scalar_one_or_none()
    if proposal_revision is None:
        raise ValueError("approval_revision_unavailable")
    now = datetime.now(timezone.utc)
    proposal.current_revision += 1
    proposal.lifecycle_state = "Approved"
    session.add_all((
        MemoryInboxProposalRevision(id=f"inbox-proposal-revision:{uuid.uuid4().hex}", proposal_id=proposal.id, revision=proposal.current_revision, lifecycle_state="Approved", actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}"),
    ))
    try:
        operation_count = await establish_deletion_barrier(session, source=source, actor_ref=actor_ref, now=now)
    except ValueError as exc:
        raise ValueError("approval_attempt_completion_unknown") from exc
    session.add(MemoryInboxCommandResult(id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=proposal.id, expected_revision=expected_revision, idempotency_key=idempotency_key, command_kind="proposal_approval", request_digest=digest, outcome="accepted", reason_code="approved_deletion_pending", resulting_revision=proposal.current_revision, actor_ref=actor_ref))
    await session.commit()
    return ApprovalResult(proposal.id, proposal.current_revision, source.id, source.current_revision, operation_count, False)


async def _operation_count(session: AsyncSession, source_id: str) -> int:
    owner_revision_ids = await source_copy_owner_revision_ids(session, source_id=source_id)
    manifest_ids = select(MemoryInboxManifest.id).where(MemoryInboxManifest.owner_revision_id.in_(owner_revision_ids))
    return len((await session.scalars(select(MemoryInboxDeletionOperation.id).where(MemoryInboxDeletionOperation.manifest_id.in_(manifest_ids)))).all())
