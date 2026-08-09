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

    def _object_path(self, object_ref: str) -> Path:
        if not object_ref.startswith("inbox-store:") or any(token in object_ref for token in ("/", "\\", "..")):
            raise PrivateContentStoreError("Private Memory Inbox object reference is invalid.")
        root = self._validated_root()
        object_name = object_ref.removeprefix("inbox-store:")
        if not object_name or not object_name.replace("-", "").isalnum():
            raise PrivateContentStoreError("Private Memory Inbox object reference is invalid.")
        return root / object_name

    def write_text(self, object_ref: str, value: str) -> None:
        """Atomically persist text under a server-owned opaque reference only."""
        target = self._object_path(object_ref)
        if target.exists():
            raise PrivateContentStoreError("Private Memory Inbox object already exists.")
        descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=target.parent)
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

    def delete_text(self, object_ref: str) -> None:
        """Remove a just-written object when its owning transaction cannot commit."""
        target = self._object_path(object_ref)
        try:
            target.unlink()
        except FileNotFoundError:
            return

    async def write_stream(self, object_ref: str, chunks, *, maximum_bytes: int) -> int:
        """Atomically promote a bounded ingress stream without retaining it in memory."""
        target = self._object_path(object_ref)
        if target.exists():
            raise PrivateContentStoreError("Private Memory Inbox object already exists.")
        descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=target.parent)
        total = 0
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "wb") as stream:
                async for chunk in chunks:
                    total += len(chunk)
                    if total > maximum_bytes:
                        raise PrivateContentStoreError("Private Memory Inbox upload exceeds its limit.")
                    stream.write(chunk)
                if total < 1:
                    raise PrivateContentStoreError("Private Memory Inbox upload is empty.")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            return total
        except Exception:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise

    def can_reserve(self, required_bytes: int, quota_bytes: int) -> bool:
        root = self._validated_root()
        used = sum(entry.stat().st_size for entry in root.iterdir() if entry.is_file() and not entry.name.startswith(".pending-"))
        return used + required_bytes <= quota_bytes

    def read_for_inspection(self, object_ref: str, *, maximum_bytes: int) -> bytes:
        """A bounded, supervisor-only reader; never expose this through a web route."""
        target = self.inspection_path(object_ref, maximum_bytes=maximum_bytes)
        with target.open("rb") as stream:
            content = stream.read(maximum_bytes + 1)
        if len(content) > maximum_bytes:
            raise PrivateContentStoreError("Private Memory Inbox object is unavailable.")
        return content

    def read_for_proposal_reader(self, object_ref: str, *, maximum_bytes: int) -> str:
        """Read a bounded proposal body only after the reader fence succeeds.

        Callers must not use this for source or quarantine manifests; that
        invariant belongs to the reader application boundary.
        """
        content = self.read_for_inspection(object_ref, maximum_bytes=maximum_bytes)
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise PrivateContentStoreError("Private Memory Inbox proposal is unavailable.") from exc

    def inspection_path(self, object_ref: str, *, maximum_bytes: int) -> Path:
        """Return a validated private path for a configured scanner process only."""
        target = self._object_path(object_ref)
        try:
            details = target.lstat()
        except OSError as exc:
            raise PrivateContentStoreError("Private Memory Inbox object is unavailable.") from exc
        if target.is_symlink() or not stat.S_ISREG(details.st_mode) or details.st_mode & 0o077 or details.st_size > maximum_bytes:
            raise PrivateContentStoreError("Private Memory Inbox object is unavailable.")
        return target
