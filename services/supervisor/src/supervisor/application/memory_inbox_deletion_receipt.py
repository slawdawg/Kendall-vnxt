"""Content-safe deletion outcome projection for one Memory Inbox source."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.memory_inbox_deletion_barrier import manifest_owner_clause, source_copy_owner_revision_ids
from supervisor.infrastructure.db.models import (
    MemoryInboxCommandResult, MemoryInboxDeletionOperation, MemoryInboxDeletionProof,
    MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxSource,
)


@dataclass(frozen=True)
class DeletionReceipt:
    source_id: str
    outcome: str
    proof_count: int
    summary: str
    next_safe_action: str


async def read_deletion_receipt(session: AsyncSession, *, source_id: str) -> DeletionReceipt:
    """Return durable deletion truth without paths, filenames, or source content."""
    source = await session.get(MemoryInboxSource, source_id)
    if source is None:
        raise ValueError("deletion_receipt_unavailable")
    if source.lifecycle_state == "DeletePending":
        retry = source.deletion_state == "RetryNeeded"
        return DeletionReceipt(
            source.id, "deletion_retry_needed" if retry else "deletion_pending", 0,
            "Kendall copy deletion needs a recorded proof." if retry else "Kendall copy deletion is pending proof.",
            "retry_deletion" if retry else "await_deletion_proof",
        )
    if source.lifecycle_state != "Deleted" or source.deletion_state != "Proven":
        raise ValueError("deletion_receipt_unavailable")
    source_revision_ids, proposal_revision_ids = await source_copy_owner_revision_ids(session, source_id=source.id)
    operation_ids = select(MemoryInboxDeletionOperation.id).join(
        MemoryInboxManifest, MemoryInboxManifest.id == MemoryInboxDeletionOperation.manifest_id,
    ).where(manifest_owner_clause(source_revision_ids, proposal_revision_ids))
    proof_count = len((await session.scalars(select(MemoryInboxDeletionProof.id).where(
        MemoryInboxDeletionProof.deletion_operation_id.in_(operation_ids),
        MemoryInboxDeletionProof.lifecycle_state == "Proven",
    ))).all())
    outcome = await _terminal_outcome(session, source.id)
    return DeletionReceipt(source.id, outcome, proof_count, "Kendall copies deleted", "none")


async def _terminal_outcome(session: AsyncSession, source_id: str) -> str:
    command = (await session.execute(select(MemoryInboxCommandResult).where(
        MemoryInboxCommandResult.aggregate_id == source_id,
        MemoryInboxCommandResult.command_kind == "source_deletion",
    ).order_by(MemoryInboxCommandResult.created_at.desc()))).scalars().first()
    if command is not None:
        if command.reason_code == "retention_expiry_deletion_pending":
            return "deleted_on_retention_expiry"
        if command.reason_code == "operator_deletion_pending":
            return "deleted_by_operator"
    approved = await session.scalar(select(MemoryInboxProposalAggregate.id).where(
        MemoryInboxProposalAggregate.source_id == source_id,
        MemoryInboxProposalAggregate.lifecycle_state == "Approved",
    ))
    if approved is not None:
        return "deleted_after_approval"
    # A terminal Source without a known deletion initiator must not claim a
    # stronger outcome than the durable proof supports.
    raise ValueError("deletion_receipt_initiator_unknown")
