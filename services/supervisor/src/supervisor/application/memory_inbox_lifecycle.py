"""Version-locked, content-safe Memory Inbox lifecycle commands."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.domain.memory_inbox import MemoryInboxSourceState, can_advance_lifecycle, is_positive_revision
from supervisor.infrastructure.db.models import MemoryInboxCommandResult, MemoryInboxSource, MemoryInboxSourceRevision


@dataclass(frozen=True)
class MemoryInboxLifecycleCommand:
    source_id: str
    expected_revision: int
    idempotency_key: str
    target_state: MemoryInboxSourceState


@dataclass(frozen=True)
class MemoryInboxLifecycleCommandResult:
    source_id: str
    expected_revision: int
    resulting_revision: int
    outcome: str
    reason_code: str
    lifecycle_state: MemoryInboxSourceState | None


def _command_digest(command: MemoryInboxLifecycleCommand) -> str:
    value = f"{command.source_id}\x1f{command.expected_revision}\x1f{command.target_state.value}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


async def apply_lifecycle_command(
    session: AsyncSession,
    command: MemoryInboxLifecycleCommand,
    *,
    verified_actor_ref: str,
    audit_ref: str,
) -> MemoryInboxLifecycleCommandResult:
    """Atomically record one revision change or the prior content-safe result."""

    if not is_positive_revision(command.expected_revision):
        raise ValueError("Memory Inbox expected revision must be a positive integer.")
    digest = _command_digest(command)
    existing = (await session.execute(select(MemoryInboxCommandResult).where(
        MemoryInboxCommandResult.aggregate_id == command.source_id,
        MemoryInboxCommandResult.idempotency_key == command.idempotency_key,
    ))).scalar_one_or_none()
    if existing is not None:
        if existing.expected_revision != command.expected_revision or existing.request_digest != digest:
            raise ValueError("Memory Inbox idempotency key is bound to a different command.")
        source = await session.get(MemoryInboxSource, command.source_id)
        return MemoryInboxLifecycleCommandResult(command.source_id, command.expected_revision, existing.resulting_revision, "replayed", existing.reason_code, MemoryInboxSourceState(source.lifecycle_state) if source else None)

    source = (await session.execute(select(MemoryInboxSource).where(MemoryInboxSource.id == command.source_id).with_for_update())).scalar_one_or_none()
    if source is None:
        raise ValueError("Memory Inbox source was not found.")
    if source.current_revision != command.expected_revision:
        return await _record_terminal_result(session, command, digest, verified_actor_ref, outcome="conflict", reason_code="stale_revision", resulting_revision=source.current_revision)
    current = MemoryInboxSourceState(source.lifecycle_state)
    if (
        source.retention_deadline_at <= datetime.now(timezone.utc)
        and command.target_state is not MemoryInboxSourceState.DELETE_PENDING
    ):
        return await _record_terminal_result(
            session, command, digest, verified_actor_ref, outcome="rejected",
            reason_code="source_retention_expired", resulting_revision=source.current_revision,
        )
    if not can_advance_lifecycle(current=current, target=command.target_state):
        return await _record_terminal_result(session, command, digest, verified_actor_ref, outcome="rejected", reason_code="transition_not_allowed", resulting_revision=source.current_revision)

    next_revision = source.current_revision + 1
    command_result = MemoryInboxCommandResult(
        id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=command.source_id, expected_revision=command.expected_revision,
        idempotency_key=command.idempotency_key, command_kind="lifecycle_transition", request_digest=digest,
        outcome="accepted", reason_code="accepted", resulting_revision=next_revision, actor_ref=verified_actor_ref,
    )
    session.add(command_result)
    updated = await session.execute(update(MemoryInboxSource).where(
        MemoryInboxSource.id == command.source_id, MemoryInboxSource.current_revision == command.expected_revision,
    ).values(current_revision=next_revision, lifecycle_state=command.target_state.value))
    if updated.rowcount != 1:
        raise ValueError("Memory Inbox revision changed before this command could be applied.")
    session.add(MemoryInboxSourceRevision(
        id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=command.source_id, revision=next_revision,
        lifecycle_state=command.target_state.value, actor_ref=verified_actor_ref, audit_ref=audit_ref, policy_ref=source.policy_ref,
    ))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return await apply_lifecycle_command(session, command, verified_actor_ref=verified_actor_ref, audit_ref=audit_ref)
    return MemoryInboxLifecycleCommandResult(command.source_id, command.expected_revision, next_revision, "accepted", "accepted", command.target_state)


async def _record_terminal_result(session: AsyncSession, command: MemoryInboxLifecycleCommand, digest: str, actor_ref: str, *, outcome: str, reason_code: str, resulting_revision: int) -> MemoryInboxLifecycleCommandResult:
    session.add(MemoryInboxCommandResult(
        id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=command.source_id, expected_revision=command.expected_revision,
        idempotency_key=command.idempotency_key, command_kind="lifecycle_transition", request_digest=digest,
        outcome=outcome, reason_code=reason_code, resulting_revision=resulting_revision, actor_ref=actor_ref,
    ))
    await session.commit()
    source = await session.get(MemoryInboxSource, command.source_id)
    return MemoryInboxLifecycleCommandResult(
        command.source_id, command.expected_revision, resulting_revision, outcome,
        reason_code, MemoryInboxSourceState(source.lifecycle_state) if source else None,
    )
