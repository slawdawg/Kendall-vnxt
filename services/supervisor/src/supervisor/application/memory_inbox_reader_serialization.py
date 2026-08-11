"""SQLite-compatible serialization for proposal readers and deletion barriers."""

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession


_sqlite_source_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


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
    async with _sqlite_source_locks[source_id]:
        yield
