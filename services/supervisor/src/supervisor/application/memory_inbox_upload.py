"""Bounded document receipt into the private Memory Inbox quarantine plane."""

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.application.memory_inbox_format_inspection import ALLOWED_MEDIA_TYPES
from supervisor.infrastructure.db.models import MemoryInboxManifest
from supervisor.infrastructure.db.memory_inbox_repository import MemoryInboxLifecycleRepository
from supervisor.infrastructure.private_content_store import PrivateContentStore

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


async def receive_quarantined_upload(session: AsyncSession, *, settings: Settings, chunks, actor_ref: str, declared_media_type: str) -> str:
    gate = settings.memory_inbox_upload_configuration_error()
    if gate:
        raise ValueError(gate)
    if declared_media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError("upload_declared_type_not_allowed")
    store = PrivateContentStore(settings.memory_inbox_content_store_root or "")
    if not store.can_reserve(MAX_UPLOAD_BYTES, settings.memory_inbox_upload_storage_quota_bytes):
        raise ValueError("upload_storage_quota_unavailable")
    nonce = uuid.uuid4().hex
    source_id = f"inbox-source:{nonce}"
    revision_id = f"inbox-source-revision:{nonce}"
    store_ref = f"inbox-store:{nonce}"
    deadline = datetime.now(timezone.utc) + timedelta(hours=settings.memory_inbox_retention_hours or 0)
    repository = MemoryInboxLifecycleRepository()
    await repository.create_inert_source(session, source_id=source_id, revision_id=revision_id, retention_deadline_at=deadline, actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref="memory-inbox-retention-v1", lifecycle_state=MemoryInboxSourceState.SCANNING)
    manifest = MemoryInboxManifest(id=f"inbox-manifest:{uuid.uuid4().hex}", owner_revision_id=revision_id, copy_class="quarantine", store_ref=store_ref, declared_media_type=declared_media_type, creation_state="Planned", retention_class="source_retention", deletion_state="None")
    session.add(manifest)
    await session.flush()
    written = False
    try:
        await store.write_stream(store_ref, chunks, maximum_bytes=MAX_UPLOAD_BYTES)
        written = True
        manifest.creation_state = "Created"
        await session.commit()
    except Exception:
        await session.rollback()
        if written:
            store.delete_text(store_ref)
        raise
    return source_id
