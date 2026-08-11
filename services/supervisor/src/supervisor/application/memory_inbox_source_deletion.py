"""Version-locked operator and retention-expiry entry points for source deletion."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.memory_inbox_deletion_barrier import establish_deletion_barrier, plan_pending_deletion_operations, source_copy_owner_revision_ids
from supervisor.application.memory_inbox_reader_serialization import serialize_memory_inbox_source_use
from supervisor.domain.memory_inbox_time import as_utc
from supervisor.infrastructure.db.models import MemoryInboxCommandResult, MemoryInboxDeletionOperation, MemoryInboxManifest, MemoryInboxSource

DeletionInitiator = Literal["operator", "retention_expiry", "retry"]


@dataclass(frozen=True)
class SourceDeletionResult:
    source_id: str
    source_revision: int
    deletion_operations: int
    initiator: DeletionInitiator
    replayed: bool


def _digest(source_id: str, expected_revision: int, initiator: DeletionInitiator) -> str:
    return hashlib.sha256(f"{source_id}\x1f{expected_revision}\x1f{initiator}".encode("utf-8")).hexdigest()


async def delete_source_by_operator(
    session: AsyncSession, *, source_id: str, expected_revision: int, idempotency_key: str, actor_ref: str,
) -> SourceDeletionResult:
    if expected_revision < 1 or not idempotency_key:
        raise ValueError("source_deletion_invalid")
    return await _start_source_deletion(
        session, source_id=source_id, expected_revision=expected_revision,
        idempotency_key=idempotency_key, actor_ref=actor_ref, initiator="operator",
        require_expired=False,
    )


async def expire_source_for_retention(
    session: AsyncSession, *, source_id: str, expected_revision: int, actor_ref: str,
) -> SourceDeletionResult:
    return await _start_source_deletion(
        session, source_id=source_id, expected_revision=expected_revision,
        idempotency_key=f"retention-expiry:{source_id}:{expected_revision}", actor_ref=actor_ref,
        initiator="retention_expiry", require_expired=True,
    )


async def retry_source_deletion(
    session: AsyncSession, *, source_id: str, expected_revision: int, idempotency_key: str, actor_ref: str,
) -> SourceDeletionResult:
    """Requeue only existing deletion work; Source use remains irrevocably closed."""
    if expected_revision < 1 or not idempotency_key:
        raise ValueError("source_deletion_retry_invalid")
    digest = _digest(source_id, expected_revision, "retry")
    recorded = (await session.execute(select(MemoryInboxCommandResult).where(
        MemoryInboxCommandResult.aggregate_id == source_id,
        MemoryInboxCommandResult.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if recorded is not None:
        if recorded.command_kind != "source_deletion_retry" or recorded.request_digest != digest:
            raise ValueError("source_deletion_retry_idempotency_conflict")
        source = await session.get(MemoryInboxSource, source_id)
        if source is None:
            raise ValueError("source_deletion_retry_unavailable")
        return SourceDeletionResult(source.id, source.current_revision, await _operation_count(session, source.id), "retry", True)
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == source_id,
    ).with_for_update())).scalar_one_or_none()
    if source is None or source.current_revision != expected_revision or source.lifecycle_state != "DeletePending" or source.deletion_state != "RetryNeeded":
        raise ValueError("source_deletion_retry_unavailable")
    now = datetime.now(timezone.utc)
    owner_revision_ids = await source_copy_owner_revision_ids(session, source_id=source.id)
    operations = list((await session.scalars(select(MemoryInboxDeletionOperation).join(
        MemoryInboxManifest, MemoryInboxManifest.id == MemoryInboxDeletionOperation.manifest_id,
    ).where(
        MemoryInboxManifest.owner_revision_id.in_(owner_revision_ids),
        MemoryInboxDeletionOperation.lifecycle_state == "RetryNeeded",
    ).with_for_update())).all())
    for operation in operations:
        operation.lifecycle_state = "Planned"
        operation.requested_at = now
    source.deletion_state = "Pending"
    await plan_pending_deletion_operations(session, source=source, now=now)
    session.add(MemoryInboxCommandResult(
        id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=source.id,
        expected_revision=expected_revision, idempotency_key=idempotency_key,
        command_kind="source_deletion_retry", request_digest=digest, outcome="accepted",
        reason_code="deletion_retry_requested", resulting_revision=source.current_revision,
        actor_ref=actor_ref,
    ))
    await session.commit()
    return SourceDeletionResult(source.id, source.current_revision, len(operations), "retry", False)


async def _start_source_deletion(
    session: AsyncSession, *, source_id: str, expected_revision: int, idempotency_key: str,
    actor_ref: str, initiator: DeletionInitiator, require_expired: bool,
) -> SourceDeletionResult:
    digest = _digest(source_id, expected_revision, initiator)
    # API authentication and retention scans may have opened a SQLite read
    # transaction before this command. End it before waiting on the per-source
    # gate so it cannot block the current gate holder's barrier commit.
    if session.in_transaction():
        await session.rollback()
    async with serialize_memory_inbox_source_use(session, source_id):
        recorded = (await session.execute(select(MemoryInboxCommandResult).where(
            MemoryInboxCommandResult.aggregate_id == source_id,
            MemoryInboxCommandResult.idempotency_key == idempotency_key,
        ))).scalar_one_or_none()
        if recorded is not None:
            if recorded.command_kind != "source_deletion" or recorded.request_digest != digest:
                raise ValueError("source_deletion_idempotency_conflict")
            source = await session.get(MemoryInboxSource, source_id)
            if source is None:
                raise ValueError("source_deletion_unavailable")
            return SourceDeletionResult(source.id, source.current_revision, await _operation_count(session, source.id), initiator, True)
        source = (await session.execute(select(MemoryInboxSource).where(
            MemoryInboxSource.id == source_id,
        ).with_for_update())).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if (
            source is None or source.current_revision != expected_revision
            or source.lifecycle_state in {"DeletePending", "Deleted"}
            or (require_expired and as_utc(source.retention_deadline_at) > now)
        ):
            raise ValueError("source_deletion_revision_unavailable")
        operation_count = await establish_deletion_barrier(session, source=source, actor_ref=actor_ref, now=now)
        session.add(MemoryInboxCommandResult(
            id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=source.id,
            expected_revision=expected_revision, idempotency_key=idempotency_key,
            command_kind="source_deletion", request_digest=digest, outcome="accepted",
            reason_code=f"{initiator}_deletion_pending", resulting_revision=source.current_revision,
            actor_ref=actor_ref,
        ))
        await session.commit()
    return SourceDeletionResult(source.id, source.current_revision, operation_count, initiator, False)


async def _operation_count(session: AsyncSession, source_id: str) -> int:
    owner_revision_ids = await source_copy_owner_revision_ids(session, source_id=source_id)
    manifest_ids = select(MemoryInboxManifest.id).where(MemoryInboxManifest.owner_revision_id.in_(owner_revision_ids))
    return len((await session.scalars(select(MemoryInboxDeletionOperation.id).where(
        MemoryInboxDeletionOperation.manifest_id.in_(manifest_ids),
    ))).all())
