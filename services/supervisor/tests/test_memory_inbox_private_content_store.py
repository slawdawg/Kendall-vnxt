import os

import pytest

from supervisor.infrastructure.private_content_store import PrivateContentStore, PrivateContentStoreError


def test_private_store_requires_owner_private_root_and_opaque_reference(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:opaque-object-1", "non-sensitive test")
    assert (root / "opaque-object-1").read_text(encoding="utf-8") == "non-sensitive test"
    assert (root / "opaque-object-1").stat().st_mode & 0o077 == 0
    with pytest.raises(PrivateContentStoreError):
        store.write_text("inbox-store:../unsafe", "test")


def test_private_store_rejects_group_readable_root(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o755)
    os.chmod(root, 0o755)
    with pytest.raises(PrivateContentStoreError, match="owner-private"):
        PrivateContentStore(str(root)).write_text("inbox-store:opaque-object-2", "test")


def test_private_store_removes_only_its_opaque_object(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:opaque-object-3", "non-sensitive test")
    store.delete_text("inbox-store:opaque-object-3")
    assert not (root / "opaque-object-3").exists()


@pytest.mark.asyncio
async def test_private_store_streams_a_bounded_upload_without_a_memory_copy(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)

    async def chunks():
        yield b"first-"
        yield b"second"

    store = PrivateContentStore(str(root))
    written = await store.write_stream("inbox-store:opaque-upload-1", chunks(), maximum_bytes=32)
    assert written == 12
    assert (root / "opaque-upload-1").read_bytes() == b"first-second"


@pytest.mark.asyncio
async def test_private_store_removes_partial_upload_when_its_byte_cap_is_exceeded(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)

    async def chunks():
        yield b"first"
        yield b"second"

    with pytest.raises(PrivateContentStoreError, match="exceeds"):
        await PrivateContentStore(str(root)).write_stream("inbox-store:opaque-upload-2", chunks(), maximum_bytes=8)
    assert not list(root.iterdir())


def test_private_store_reserves_upload_quota_conservatively(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:opaque-existing", "123456")
    assert store.can_reserve(4, 10)
    assert not store.can_reserve(5, 10)


def test_private_store_inspection_reader_is_bounded_and_non_web_only(tmp_path) -> None:
    root = tmp_path / "inbox-store"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:opaque-inspection", "non-sensitive test")
    assert store.read_for_inspection("inbox-store:opaque-inspection", maximum_bytes=64) == b"non-sensitive test"
    with pytest.raises(PrivateContentStoreError, match="unavailable"):
        store.read_for_inspection("inbox-store:opaque-inspection", maximum_bytes=4)
