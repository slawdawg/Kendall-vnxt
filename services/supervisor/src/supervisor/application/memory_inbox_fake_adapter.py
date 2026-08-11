"""Materialize a fake local result through its pre-registered private manifest."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox_fake_adapter import decide_fake_local_adapter
from supervisor.infrastructure.db.models import (
    MemoryInboxManifest, MemoryInboxProcessingAttempt, MemoryInboxProposalAggregate,
    MemoryInboxProposalReaderGrant, MemoryInboxProposalRevision, MemoryInboxSource,
    MemoryInboxSourceRevision,
)
from supervisor.infrastructure.private_content_store import PrivateContentStore, PrivateContentStoreError


async def materialize_fake_local_proposal(
    session: AsyncSession, *, settings: Settings, attempt_id: str, proposal_body: str, actor_ref: str,
) -> str:
    """Write one local fake result only; this deliberately cannot select cloud."""
    if decide_fake_local_adapter(outcome="local_success", fresh_authorization_and_cost=True).route != "materialize_local":
        raise ValueError("fake_adapter_unavailable")
    if not proposal_body or len(proposal_body.encode("utf-8")) > settings.memory_inbox_proposal_reader_max_bytes:
        raise ValueError("fake_adapter_result_invalid")
    if settings.memory_inbox_capture_configuration_error():
        raise ValueError("fake_adapter_unavailable")
    attempt = (await session.execute(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.id == attempt_id,
    ).with_for_update())).scalar_one_or_none()
    if attempt is None or attempt.lifecycle_state != "Claimed":
        raise ValueError("fake_adapter_attempt_unavailable")
    proposal_revision = await session.get(MemoryInboxProposalRevision, attempt.proposal_revision_id)
    source_revision = await session.get(MemoryInboxSourceRevision, attempt.source_revision_id)
    if proposal_revision is None or source_revision is None:
        raise ValueError("fake_adapter_attempt_stale")
    proposal = (await session.execute(select(MemoryInboxProposalAggregate).where(
        MemoryInboxProposalAggregate.id == proposal_revision.proposal_id,
    ).with_for_update())).scalar_one_or_none()
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == source_revision.source_id,
    ).with_for_update())).scalar_one_or_none()
    if (
        proposal is None or source is None
        or proposal.lifecycle_state != "Draft" or proposal_revision.lifecycle_state != "Draft"
        or source.lifecycle_state != "Processing" or source.deletion_state != "None"
    ):
        raise ValueError("fake_adapter_attempt_stale")
    manifest = (await session.execute(select(MemoryInboxManifest).where(
        MemoryInboxManifest.proposal_revision_id == proposal_revision.id,
        MemoryInboxManifest.copy_class == "proposal_body",
        MemoryInboxManifest.creation_state == "Planned",
        MemoryInboxManifest.deletion_state == "None",
    ).with_for_update())).scalar_one_or_none()
    if manifest is None:
        raise ValueError("fake_adapter_manifest_unavailable")
    store_ref = manifest.store_ref
    try:
        PrivateContentStore(settings.memory_inbox_content_store_root or "").write_text(store_ref, proposal_body)
    except (OSError, PrivateContentStoreError) as exc:
        raise ValueError("fake_adapter_materialization_failed") from exc
    now = datetime.now(timezone.utc)
    manifest.creation_state = "Created"
    attempt.lifecycle_state = "Closed"
    proposal.lifecycle_state = "Ready"
    proposal_revision.lifecycle_state = "Ready"
    source.current_revision += 1
    source.lifecycle_state = "Review"
    session.add(MemoryInboxSourceRevision(
        id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id,
        revision=source.current_revision, lifecycle_state="Review", actor_ref=actor_ref,
        audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref,
    ))
    if settings.memory_inbox_proposal_reader_enabled and settings.memory_inbox_proposal_reader_capability_ref:
        session.add(MemoryInboxProposalReaderGrant(
            id=f"inbox-reader-grant:{uuid.uuid4().hex}", proposal_revision_id=proposal_revision.id,
            capability_ref=settings.memory_inbox_proposal_reader_capability_ref,
            lifecycle_state="Approved", actor_ref=actor_ref,
        ))
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        try:
            PrivateContentStore(settings.memory_inbox_content_store_root or "").delete_text(store_ref)
        except Exception:
            pass
        raise
    return proposal.id
