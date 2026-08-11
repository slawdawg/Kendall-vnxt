"""Acknowledged text capture into the private Memory Inbox source plane."""

from datetime import datetime, timedelta, timezone
import hashlib
import re
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.models import MemoryInboxCommandResult, MemoryInboxManifest
from supervisor.infrastructure.db.memory_inbox_repository import MemoryInboxLifecycleRepository
from supervisor.infrastructure.private_content_store import PrivateContentStore

_SENSITIVE = re.compile(r"\b(password|secret|api[_ -]?key|access[_ -]?token|private[_ -]?key)\b", re.IGNORECASE)


async def _recorded_capture_source(session: AsyncSession, *, source_id: str, idempotency_key: str) -> str | None:
    recorded = (await session.execute(
        select(MemoryInboxCommandResult).where(
            MemoryInboxCommandResult.aggregate_id == source_id,
            MemoryInboxCommandResult.idempotency_key == idempotency_key,
        )
    )).scalar_one_or_none()
    if recorded is None:
        return None
    if recorded.command_kind != "text_capture":
        raise ValueError("idempotency_key_reused")
    return recorded.aggregate_id


async def capture_acknowledged_text(
    session: AsyncSession,
    *,
    settings: Settings,
    text_value: str,
    acknowledged_non_sensitive: bool,
    actor_ref: str,
    idempotency_key: str,
) -> str:
    if not acknowledged_non_sensitive:
        raise ValueError("non_sensitive_acknowledgement_required")
    if not text_value.strip() or len(text_value) > 32_000 or _SENSITIVE.search(text_value):
        raise ValueError("text_capture_validation_failed")
    if not re.fullmatch(r"[A-Za-z0-9:_-]{16,160}", idempotency_key):
        raise ValueError("idempotency_key_invalid")
    gate = settings.memory_inbox_capture_configuration_error()
    if gate:
        raise ValueError(gate)
    command_digest = hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest()
    source_id = f"inbox-source:{command_digest[:32]}"
    replayed_source_id = await _recorded_capture_source(session, source_id=source_id, idempotency_key=idempotency_key)
    if replayed_source_id:
        return replayed_source_id
    revision_id = f"inbox-source-revision:{command_digest[:32]}"
    manifest_id = f"inbox-manifest:{uuid.uuid4().hex}"
    store_ref = f"inbox-store:{command_digest[:32]}"
    deadline = datetime.now(timezone.utc) + timedelta(hours=settings.memory_inbox_retention_hours or 0)
    repository = MemoryInboxLifecycleRepository()
    try:
        await repository.create_inert_source(
            session, source_id=source_id, revision_id=revision_id, retention_deadline_at=deadline,
            actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref="memory-inbox-retention-v1",
            lifecycle_state=MemoryInboxSourceState.UNPROCESSED,
        )
    except IntegrityError:
        await session.rollback()
        replayed_source_id = await _recorded_capture_source(session, source_id=source_id, idempotency_key=idempotency_key)
        if replayed_source_id:
            return replayed_source_id
        raise ValueError("text_capture_conflict")
    manifest = MemoryInboxManifest(
        id=manifest_id, legacy_owner_revision_id=revision_id, source_revision_id=revision_id, copy_class="text_source", store_ref=store_ref,
        creation_state="Planned", retention_class="source_retention", deletion_state="None",
    )
    session.add(manifest)
    session.add(MemoryInboxCommandResult(
        id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=source_id, expected_revision=1,
        idempotency_key=idempotency_key, command_kind="text_capture", request_digest=command_digest,
        outcome="accepted", reason_code="text_capture_accepted", resulting_revision=1, actor_ref=actor_ref,
    ))
    await session.flush()
    store = PrivateContentStore(settings.memory_inbox_content_store_root or "")
    written = False
    try:
        store.write_text(store_ref, text_value)
        written = True
        manifest.creation_state = "Created"
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if written:
            try:
                store.delete_text(store_ref)
            except Exception:
                # Do not claim capture succeeded if rollback cleanup could not be
                # completed. A later deletion workflow must reconcile this case.
                pass
        replayed_source_id = await _recorded_capture_source(session, source_id=source_id, idempotency_key=idempotency_key)
        if replayed_source_id:
            return replayed_source_id
        raise ValueError("text_capture_conflict")
    except Exception:
        await session.rollback()
        if written:
            try:
                store.delete_text(store_ref)
            except Exception:
                pass
        raise
    return source_id
