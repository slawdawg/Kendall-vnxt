"""Authoritative, content-free Memory Inbox read projection."""

from dataclasses import dataclass
from datetime import datetime

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
    """Read lifecycle facts only; content stores and legacy tables are excluded."""

    sources = (await session.execute(select(MemoryInboxSource).order_by(MemoryInboxSource.updated_at.desc(), MemoryInboxSource.id.asc()))).scalars()
    return [
        MemoryInboxProjectionRow(
            source_id=source.id,
            lifecycle_state=source.lifecycle_state,
            revision=source.current_revision,
            retention_deadline_at=source.retention_deadline_at,
            deletion_state=source.deletion_state,
            next_action_code=next_action_for(source.lifecycle_state),
        )
        for source in sources
    ]


async def read_review_ready_count(session: AsyncSession) -> int:
    """Count only durable Ready proposals; source state never stands in for it."""
    return int((await session.scalar(select(func.count()).select_from(MemoryInboxProposalAggregate).where(
        MemoryInboxProposalAggregate.lifecycle_state == "Ready"
    ))) or 0)
