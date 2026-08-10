"""Version-locked, metadata-only Memory Inbox retention extensions."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.domain.memory_inbox_time import retention_expired
from supervisor.infrastructure.db.models import MemoryInboxCommandResult, MemoryInboxProcessingDisclosure, MemoryInboxSource, MemoryInboxSourceRevision


@dataclass(frozen=True)
class RetentionExtensionResult:
    source_id: str
    source_revision: int
    retention_deadline_at: datetime
    replayed: bool


async def extend_source_retention(
    session: AsyncSession, *, source_id: str, expected_revision: int, extension_hours: int,
    idempotency_key: str, actor_ref: str,
) -> RetentionExtensionResult:
    """Extend one still-live source and invalidate its stale disclosure truth."""
    if expected_revision < 1 or not idempotency_key or not 1 <= extension_hours <= 8760:
        raise ValueError("retention_extension_invalid")
    digest = hashlib.sha256(
        f"{source_id}\x1f{expected_revision}\x1f{extension_hours}".encode("utf-8")
    ).hexdigest()
    recorded = (await session.execute(select(MemoryInboxCommandResult).where(
        MemoryInboxCommandResult.aggregate_id == source_id,
        MemoryInboxCommandResult.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if recorded is not None:
        if recorded.command_kind != "retention_extension" or recorded.request_digest != digest:
            raise ValueError("retention_extension_idempotency_conflict")
        source = await session.get(MemoryInboxSource, source_id)
        if source is None:
            raise ValueError("retention_extension_unavailable")
        return RetentionExtensionResult(source.id, source.current_revision, source.retention_deadline_at, True)
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == source_id,
    ).with_for_update())).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if (
        source is None or source.current_revision != expected_revision
        or retention_expired(source.retention_deadline_at, now=now)
        or source.lifecycle_state in {"DeletePending", "Deleted"}
    ):
        raise ValueError("retention_extension_unavailable")
    revision_ids = select(MemoryInboxSourceRevision.id).where(MemoryInboxSourceRevision.source_id == source.id)
    disclosures = list((await session.scalars(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.source_revision_id.in_(revision_ids),
        MemoryInboxProcessingDisclosure.lifecycle_state == "Accepted",
    ).with_for_update())).all())
    for disclosure in disclosures:
        disclosure.lifecycle_state = "Invalidated"
    source.current_revision += 1
    source.retention_deadline_at = source.retention_deadline_at + timedelta(hours=extension_hours)
    session.add_all((
        MemoryInboxSourceRevision(
            id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id,
            revision=source.current_revision, lifecycle_state=source.lifecycle_state,
            actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref,
        ),
        MemoryInboxCommandResult(
            id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=source.id,
            expected_revision=expected_revision, idempotency_key=idempotency_key,
            command_kind="retention_extension", request_digest=digest, outcome="accepted",
            reason_code="retention_extended", resulting_revision=source.current_revision,
            actor_ref=actor_ref,
        ),
    ))
    await session.commit()
    return RetentionExtensionResult(source.id, source.current_revision, source.retention_deadline_at, False)
