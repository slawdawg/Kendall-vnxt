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
