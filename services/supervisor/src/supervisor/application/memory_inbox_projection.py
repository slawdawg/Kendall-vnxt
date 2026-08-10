"""Authoritative, content-free Memory Inbox read projection."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import MemoryInboxProposalAggregate, MemoryInboxSource


@dataclass(frozen=True)
class MemoryInboxProjectionRow:
    source_id: str
    lifecycle_state: str
    revision: int
    retention_deadline_at: datetime
    deletion_state: str
    next_action_code: str
    proposal_id: str | None = None
    proposal_revision: int | None = None


def next_action_for(state: str) -> str:
    return {
        "Scanning": "await_inspection_gate",
        "Quarantined": "await_inspection_gate",
        "Unprocessed": "create_draft",
        "Draft": "review_draft",
        "AwaitingAuthorization": "review_disclosure",
        "Processing": "await_processing_result",
        "Review": "review_proposal",
        "Returned": "revise_draft",
        "DeniedRetained": "review_retention",
        "DeletePending": "await_deletion_proof",
        "Deleted": "none",
        "RejectedUnsafe": "review_rejection",
    }.get(state, "refresh_memory_inbox")


async def read_memory_inbox_projection(session: AsyncSession) -> list[MemoryInboxProjectionRow]:
    """Read lifecycle facts only; content stores and legacy tables are excluded.

    A source's legacy ``Review`` state is not enough to place it in the Review
    inventory.  That inventory is only truthful while its current proposal is
    durably ``Ready``.
    """

    sources = (await session.execute(select(MemoryInboxSource).order_by(MemoryInboxSource.updated_at.desc(), MemoryInboxSource.id.asc()))).scalars()
    ready_proposals = (await session.execute(select(MemoryInboxProposalAggregate).where(
        MemoryInboxProposalAggregate.lifecycle_state == "Ready"
    ))).scalars().all()
    ready_by_source = {proposal.source_id: proposal for proposal in ready_proposals}
    return [
        MemoryInboxProjectionRow(
            source_id=source.id,
            lifecycle_state=source.lifecycle_state,
            revision=source.current_revision,
            retention_deadline_at=source.retention_deadline_at,
            deletion_state=source.deletion_state,
            next_action_code=next_action_for(source.lifecycle_state),
            proposal_id=ready_by_source[source.id].id if source.lifecycle_state == "Review" else None,
            proposal_revision=ready_by_source[source.id].current_revision if source.lifecycle_state == "Review" else None,
        )
        for source in sources
        if source.lifecycle_state != "Review" or source.id in ready_by_source
    ]


async def read_review_ready_count(session: AsyncSession) -> int:
    """Count only currently reviewable Ready proposals, never stale source truth."""
    return int((await session.scalar(select(func.count()).select_from(MemoryInboxProposalAggregate).join(
        MemoryInboxSource, MemoryInboxSource.id == MemoryInboxProposalAggregate.source_id,
    ).where(
        MemoryInboxProposalAggregate.lifecycle_state == "Ready",
        MemoryInboxSource.lifecycle_state == "Review",
        MemoryInboxSource.deletion_state == "None",
        MemoryInboxSource.retention_deadline_at > datetime.now(timezone.utc),
    ))) or 0)
