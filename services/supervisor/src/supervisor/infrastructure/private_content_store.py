"""Private, non-web Memory Inbox content store with opaque object references."""

import os
from pathlib import Path
import stat
import tempfile


class PrivateContentStoreError(ValueError):
    pass


class PrivateContentStore:
    def __init__(self, root: str) -> None:
        self._root = Path(root)

    def _validated_root(self) -> Path:
        try:
            details = self._root.lstat()
        except OSError as exc:
            raise PrivateContentStoreError("Private Memory Inbox store is unavailable.") from exc
        if (
            self._root.is_symlink()
            or not stat.S_ISDIR(details.st_mode)
            or details.st_uid != os.geteuid()
            or details.st_mode & 0o077
        ):
            raise PrivateContentStoreError("Private Memory Inbox store is not owner-private.")
        return self._root

    def write_text(self, object_ref: str, value: str) -> None:
        """Atomically persist text under a server-owned opaque reference only."""
        if not object_ref.startswith("inbox-store:") or any(token in object_ref for token in ("/", "\\", "..")):
            raise PrivateContentStoreError("Private Memory Inbox object reference is invalid.")
        root = self._validated_root()
        target = root / object_ref.removeprefix("inbox-store:")
        if target.exists():
            raise PrivateContentStoreError("Private Memory Inbox object already exists.")
        descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=root)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
                stream.write(value)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
        except Exception:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise
