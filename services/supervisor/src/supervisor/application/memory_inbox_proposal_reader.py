"""Exact-revision, fail-closed reader for private Memory Inbox proposals."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox_time import retention_expired
from supervisor.infrastructure.db.models import (
    MemoryInboxManifest,
    MemoryInboxProposalAggregate,
    MemoryInboxProposalReaderGrant,
    MemoryInboxProposalRevision,
    MemoryInboxSource,
)
from supervisor.infrastructure.private_content_store import PrivateContentStore


@dataclass(frozen=True)
class AuthorizedProposalReader:
    proposal_id: str
    revision: int
    body: str


async def read_authorized_proposal(
    session: AsyncSession, *, settings: Settings, proposal_id: str, revision: int,
) -> AuthorizedProposalReader:
    """Return a body only for one Ready revision with a live private grant."""
    if settings.memory_inbox_proposal_reader_configuration_error():
        raise ValueError("proposal_reader_unavailable")
    proposal = (await session.execute(select(MemoryInboxProposalAggregate).where(
        MemoryInboxProposalAggregate.id == proposal_id
    ))).scalar_one_or_none()
    if proposal is None or proposal.lifecycle_state != "Ready" or proposal.current_revision != revision:
        raise ValueError("proposal_reader_revision_unavailable")
    proposal_revision = (await session.execute(select(MemoryInboxProposalRevision).where(
        MemoryInboxProposalRevision.proposal_id == proposal_id,
        MemoryInboxProposalRevision.revision == revision,
        MemoryInboxProposalRevision.lifecycle_state == "Ready",
    ))).scalar_one_or_none()
    source = await session.get(MemoryInboxSource, proposal.source_id)
    if proposal_revision is None or source is None or source.lifecycle_state != "Review" or source.deletion_state != "None" or retention_expired(source.retention_deadline_at):
        raise ValueError("proposal_reader_revision_unavailable")
    grant = (await session.execute(select(MemoryInboxProposalReaderGrant).where(
        MemoryInboxProposalReaderGrant.proposal_revision_id == proposal_revision.id,
        MemoryInboxProposalReaderGrant.capability_ref == settings.memory_inbox_proposal_reader_capability_ref,
        MemoryInboxProposalReaderGrant.lifecycle_state == "Approved",
        MemoryInboxProposalReaderGrant.revoked_at.is_(None),
    ))).scalar_one_or_none()
    if grant is None or (grant.expires_at is not None and grant.expires_at <= datetime.now(timezone.utc)):
        raise ValueError("proposal_reader_unavailable")
    manifest = (await session.execute(select(MemoryInboxManifest).where(
        MemoryInboxManifest.owner_revision_id == proposal_revision.id,
        MemoryInboxManifest.copy_class == "proposal_body",
        MemoryInboxManifest.creation_state == "Created",
        MemoryInboxManifest.deletion_state == "None",
    ))).scalar_one_or_none()
    if manifest is None:
        raise ValueError("proposal_reader_revision_unavailable")
    try:
        body = PrivateContentStore(settings.memory_inbox_content_store_root or "").read_for_proposal_reader(
            manifest.store_ref, maximum_bytes=settings.memory_inbox_proposal_reader_max_bytes,
        )
    except Exception as exc:
        raise ValueError("proposal_reader_unavailable") from exc
    return AuthorizedProposalReader(proposal_id=proposal.id, revision=proposal_revision.revision, body=body)
