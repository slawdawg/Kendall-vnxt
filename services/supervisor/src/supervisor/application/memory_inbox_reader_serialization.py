"""SQLite-compatible serialization for proposal readers and deletion barriers."""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class _SQLiteSourceLock:
    lock: asyncio.Lock
    users: int = 0


_sqlite_source_locks: dict[str, _SQLiteSourceLock] = {}
_sqlite_source_locks_guard = asyncio.Lock()


def sqlite_source_lock_registry_size() -> int:
    """Return the current SQLite-only registry size for regression coverage."""
    return len(_sqlite_source_locks)


@asynccontextmanager
async def serialize_memory_inbox_source_use(
    session: AsyncSession, source_id: str,
) -> AsyncIterator[None]:
    """Serialize local SQLite readers with every deletion-barrier caller.

    PostgreSQL keeps the database-native ``FOR UPDATE`` interlock. SQLite
    ignores that clause, so all in-process source use shares this keyed lock.
    """
    bind = getattr(session, "bind", None)
    if bind is None or bind.dialect.name != "sqlite":
        yield
        return
    async with _sqlite_source_locks_guard:
        entry = _sqlite_source_locks.get(source_id)
        if entry is None:
            entry = _SQLiteSourceLock(lock=asyncio.Lock())
            _sqlite_source_locks[source_id] = entry
        entry.users += 1
    try:
        async with entry.lock:
            yield
    finally:
        async with _sqlite_source_locks_guard:
            entry.users -= 1
            if entry.users == 0 and not entry.lock.locked():
                if _sqlite_source_locks.get(source_id) is entry:
                    del _sqlite_source_locks[source_id]
