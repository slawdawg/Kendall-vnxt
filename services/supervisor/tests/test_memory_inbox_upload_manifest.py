from pathlib import Path

import pytest

from supervisor.application.memory_inbox_upload import receive_quarantined_upload
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.models import MemoryInboxManifest


class RecordingSession:
    def __init__(self) -> None:
        self.items: list[object] = []
        self.committed = False

    def add(self, item: object) -> None:
        self.items.append(item)

    def add_all(self, items: tuple[object, ...]) -> None:
        self.items.extend(items)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        return None


async def chunks(value: bytes):
    yield value


def upload_settings(root: Path) -> Settings:
    root.mkdir(mode=0o700)
    return Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_UPLOAD_ENABLED=True,
    )


@pytest.mark.asyncio
async def test_quarantine_manifest_binds_the_declared_content_type_before_writing_bytes(tmp_path) -> None:
    session = RecordingSession()
    await receive_quarantined_upload(
        session, settings=upload_settings(tmp_path / "private-store"), chunks=chunks(b"%PDF-1.7\n"),
        actor_ref="operator:verified-operator", declared_media_type="application/pdf",
    )

    manifest = next(item for item in session.items if isinstance(item, MemoryInboxManifest))
    assert session.committed
    assert manifest.declared_media_type == "application/pdf"
    assert manifest.inspected_media_type is None
    assert manifest.creation_state == "Created"


@pytest.mark.asyncio
async def test_upload_rejects_an_unallowlisted_declared_type_before_writing(tmp_path) -> None:
    session = RecordingSession()
    with pytest.raises(ValueError, match="upload_declared_type_not_allowed"):
        await receive_quarantined_upload(
            session, settings=upload_settings(tmp_path / "private-store"), chunks=chunks(b"binary"),
            actor_ref="operator:verified-operator", declared_media_type="application/octet-stream",
        )
    assert not session.items
