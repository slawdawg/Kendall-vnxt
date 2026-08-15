"""Versioned supervisor schema migration boundary.

The first two revisions deliberately preserve the existing bootstrap and
legacy-compatibility behavior.  Their purpose is to make the applied schema
state durable and to ensure later schema changes are added as explicit,
ordered revisions rather than to application startup.
"""

from collections.abc import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


Migration = Callable[[AsyncConnection], Awaitable[None]]
SCHEMA_MIGRATIONS_TABLE = "supervisor_schema_migrations"


async def _create_model_baseline(connection: AsyncConnection) -> None:
    # Import here to avoid a database <-> migration module cycle at service
    # import time.  The metadata remains the source for the one initial
    # baseline only; subsequent changes must have their own revision.
    from supervisor.infrastructure.db import models  # noqa: F401
    from supervisor.infrastructure.db.database import Base

    await connection.run_sync(Base.metadata.create_all)


async def _apply_legacy_compatibility(connection: AsyncConnection) -> None:
    # The compatibility work is retained unchanged while old databases exist.
    # It is now an explicit, once-recorded revision instead of unconditional
    # application startup behavior.
    from supervisor.infrastructure.db.database import _apply_legacy_schema_compatibility

    await _apply_legacy_schema_compatibility(connection)


MIGRATIONS: tuple[tuple[str, Migration], ...] = (
    ("0001_model_baseline", _create_model_baseline),
    ("0002_legacy_compatibility", _apply_legacy_compatibility),
)


async def upgrade_database(connection: AsyncConnection) -> None:
    """Apply every unapplied schema revision in the caller's transaction."""

    await connection.execute(
        text(
            f"CREATE TABLE IF NOT EXISTS {SCHEMA_MIGRATIONS_TABLE} ("
            "revision VARCHAR(80) PRIMARY KEY, "
            "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
    )
    applied = set(
        (await connection.execute(text(f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE}"))).scalars()
    )
    for revision, migration in MIGRATIONS:
        if revision in applied:
            continue
        await migration(connection)
        await connection.execute(
            text(f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES (:revision)"),
            {"revision": revision},
        )
