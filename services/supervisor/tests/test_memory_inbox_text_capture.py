from pathlib import Path

import pytest

from supervisor.application.memory_inbox_capture import capture_acknowledged_text
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.models import MemoryInboxCommandResult, MemoryInboxManifest, MemoryInboxSource, MemoryInboxSourceRevision


class RecordingSession:
    def __init__(self, *, fail_commit: bool = False) -> None:
        self.items: list[object] = []
        self.fail_commit = fail_commit
        self.committed = False
        self.rolled_back = False

    def add(self, item: object) -> None:
        self.items.append(item)

    def add_all(self, items: tuple[object, ...]) -> None:
        self.items.extend(items)

    async def flush(self) -> None:
        return None

    async def execute(self, _statement):
        recorded = next((item for item in self.items if isinstance(item, MemoryInboxCommandResult)), None)
        return type("Result", (), {"scalar_one_or_none": lambda _self: recorded})()

    async def commit(self) -> None:
        if self.fail_commit:
            raise RuntimeError("database unavailable")
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True


def configured_settings(root: Path) -> Settings:
    root.mkdir(mode=0o700)
    return Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
    )


@pytest.mark.asyncio
async def test_acknowledged_text_capture_records_only_private_reference_and_unprocessed_revision(tmp_path) -> None:
    root = tmp_path / "private-store"
    session = RecordingSession()
    source_id = await capture_acknowledged_text(
        session, settings=configured_settings(root), text_value="A non-sensitive project note.",
        acknowledged_non_sensitive=True, actor_ref="operator:verified-operator", idempotency_key="capture-test-key-0001",
    )
    assert session.committed
    source = next(item for item in session.items if isinstance(item, MemoryInboxSource))
    revision = next(item for item in session.items if isinstance(item, MemoryInboxSourceRevision))
    manifest = next(item for item in session.items if isinstance(item, MemoryInboxManifest))
    assert source.id == source_id and source.lifecycle_state == "Unprocessed"
    assert revision.lifecycle_state == "Unprocessed"
    assert revision.actor_ref == "operator:verified-operator"
    assert manifest.creation_state == "Created"
    assert "non-sensitive project note" not in repr(source).lower()
    assert "non-sensitive project note" not in repr(revision).lower()
    assert "non-sensitive project note" not in repr(manifest).lower()
    assert (root / manifest.store_ref.removeprefix("inbox-store:")).read_text(encoding="utf-8") == "A non-sensitive project note."


@pytest.mark.asyncio
async def test_capture_replays_a_lost_response_without_a_second_source_or_copy(tmp_path) -> None:
    root = tmp_path / "private-store"
    session = RecordingSession()
    settings = configured_settings(root)
    first_source_id = await capture_acknowledged_text(
        session, settings=settings, text_value="First non-sensitive note.",
        acknowledged_non_sensitive=True, actor_ref="operator:verified-operator", idempotency_key="capture-replay-key-0001",
    )
    replay_source_id = await capture_acknowledged_text(
        session, settings=settings, text_value="A changed client retry must not create a new copy.",
        acknowledged_non_sensitive=True, actor_ref="operator:verified-operator", idempotency_key="capture-replay-key-0001",
    )
    assert replay_source_id == first_source_id
    assert len([item for item in session.items if isinstance(item, MemoryInboxSource)]) == 1
    assert len([item for item in session.items if isinstance(item, MemoryInboxManifest)]) == 1
    assert len(list(root.iterdir())) == 1


@pytest.mark.asyncio
async def test_capture_rejects_missing_acknowledgement_without_writing(tmp_path) -> None:
    root = tmp_path / "private-store"
    session = RecordingSession()
    with pytest.raises(ValueError, match="acknowledgement_required"):
        await capture_acknowledged_text(
            session, settings=configured_settings(root), text_value="A non-sensitive project note.",
            acknowledged_non_sensitive=False, actor_ref="operator:verified-operator", idempotency_key="capture-test-key-0002",
        )
    assert not session.items
    assert not list(root.iterdir())


@pytest.mark.asyncio
async def test_capture_cleans_private_copy_when_transaction_fails(tmp_path) -> None:
    root = tmp_path / "private-store"
    session = RecordingSession(fail_commit=True)
    with pytest.raises(RuntimeError, match="database unavailable"):
        await capture_acknowledged_text(
            session, settings=configured_settings(root), text_value="A non-sensitive project note.",
            acknowledged_non_sensitive=True, actor_ref="operator:verified-operator", idempotency_key="capture-test-key-0003",
        )
    assert session.rolled_back
    assert not list(root.iterdir())
