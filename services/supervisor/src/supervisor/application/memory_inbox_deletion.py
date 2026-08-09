"""Proof-bearing deletion of registered Memory Inbox copies."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.config.settings import Settings
from supervisor.infrastructure.db.models import (
    MemoryInboxDeletionOperation, MemoryInboxDeletionProof, MemoryInboxManifest,
    MemoryInboxSource, MemoryInboxSourceRevision,
)
from supervisor.infrastructure.private_content_store import PrivateContentStore, PrivateContentStoreError


async def execute_deletion_operation(session: AsyncSession, *, settings: Settings, operation_id: str, actor_ref: str) -> str:
    """Delete one registered copy; only all proven copies can terminally delete Source."""
    operation = (await session.execute(select(MemoryInboxDeletionOperation).where(
        MemoryInboxDeletionOperation.id == operation_id
    ).with_for_update())).scalar_one_or_none()
    if operation is None:
        raise ValueError("deletion_operation_unavailable")
    if operation.lifecycle_state == "Proven":
        return "deletion_proven"
    manifest = (await session.execute(select(MemoryInboxManifest).where(
        MemoryInboxManifest.id == operation.manifest_id
    ).with_for_update())).scalar_one_or_none()
    if manifest is None:
        raise ValueError("deletion_manifest_unavailable")
    source_revision = await session.get(MemoryInboxSourceRevision, manifest.owner_revision_id)
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == source_revision.source_id if source_revision else False
    ).with_for_update())).scalar_one_or_none()
    if source is None or source_revision is None or source.lifecycle_state != "DeletePending" or source.deletion_state not in {"Pending", "RetryNeeded"}:
        raise ValueError("deletion_source_unavailable")
    try:
        PrivateContentStore(settings.memory_inbox_content_store_root or "").delete_and_prove_absent(manifest.store_ref)
    except (OSError, PrivateContentStoreError):
        operation.lifecycle_state = "RetryNeeded"
        source.deletion_state = "RetryNeeded"
        await session.commit()
        return "deletion_retry_needed"
    now = datetime.now(timezone.utc)
    operation.lifecycle_state = "Proven"
    operation.completed_at = now
    manifest.deletion_state = "Proven"
    manifest.deleted_at = now
    proof = await session.scalar(select(MemoryInboxDeletionProof).where(MemoryInboxDeletionProof.deletion_operation_id == operation.id))
    if proof is None:
        session.add(MemoryInboxDeletionProof(id=f"inbox-deletion-proof:{uuid.uuid4().hex}", deletion_operation_id=operation.id, proof_ref=f"receipt:inbox-deletion:{uuid.uuid4().hex}", lifecycle_state="Proven"))
    remaining = (await session.scalars(select(MemoryInboxManifest).where(
        MemoryInboxManifest.owner_revision_id.in_(
            select(MemoryInboxSourceRevision.id).where(MemoryInboxSourceRevision.source_id == source.id)
        ),
        MemoryInboxManifest.deletion_state != "Proven",
    ))).all()
    if not remaining:
        source.current_revision += 1
        source.lifecycle_state = "Deleted"
        source.deletion_state = "Proven"
        session.add(MemoryInboxSourceRevision(id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id, revision=source.current_revision, lifecycle_state="Deleted", actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref))
    await session.commit()
    return "deleted_after_approval" if source.lifecycle_state == "Deleted" else "deletion_proven"
