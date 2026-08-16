"""Versioned supervisor schema migration boundary.

The first two revisions deliberately preserve the existing bootstrap and
legacy-compatibility behavior.  Their purpose is to make the applied schema
state durable and to ensure later schema changes are added as explicit,
ordered revisions rather than to application startup.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection


Migration = Callable[[AsyncConnection], Awaitable[None]]
SCHEMA_MIGRATIONS_TABLE = "supervisor_schema_migrations"
MODEL_BASELINE_REVISION = "0001_model_baseline"


@dataclass(frozen=True)
class SchemaMigration:
    """One ordered upgrade with an optional clean-install companion.

    The model-baseline revision materializes frozen historical metadata. Later
    revisions are recorded without replaying their upgrade body on a clean
    install unless they declare ``clean_install``. A clean-install hook is
    therefore required for future schema work, data initialization, triggers,
    indexes, compatibility objects, or any other state absent from the frozen
    baseline.
    """

    revision: str
    upgrade: Migration
    clean_install: Migration | None = None


async def _create_model_baseline(connection: AsyncConnection) -> None:
    # This import deliberately targets the source snapshot captured when
    # revision 0001 was introduced. Do not replace it with current models:
    # later model changes belong to their own ordered revisions.
    from supervisor.infrastructure.db import models_baseline

    await connection.run_sync(models_baseline.Base.metadata.create_all)


async def _apply_legacy_compatibility(connection: AsyncConnection) -> None:
    # The compatibility work is retained unchanged while old databases exist.
    # It is now an explicit, once-recorded revision instead of unconditional
    # application startup behavior.
    from supervisor.infrastructure.db.database import _apply_legacy_schema_compatibility

    await _apply_legacy_schema_compatibility(connection)


MIGRATIONS: tuple[SchemaMigration, ...] = (
    SchemaMigration(MODEL_BASELINE_REVISION, _create_model_baseline),
    # The compatibility revision creates durable SQLite triggers and seeds
    # state outside ORM metadata, so a clean install must explicitly run it.
    SchemaMigration(
        "0002_legacy_compatibility",
        _apply_legacy_compatibility,
        clean_install=_apply_legacy_compatibility,
    ),
)


async def _existing_table_names(connection: AsyncConnection) -> set[str]:
    """Read the current schema before migration bookkeeping is created."""

    table_names = await connection.run_sync(lambda sync_connection: inspect(sync_connection).get_table_names())
    return set(table_names)


async def upgrade_database(connection: AsyncConnection) -> None:
    """Apply every unapplied schema revision in the caller's transaction."""

    # Decide before creating the migration table so clean installs can use
    # declared clean hooks while existing schemas follow ordered upgrades.
    existing_tables = await _existing_table_names(connection)
    is_clean_install = not existing_tables
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
    for migration in MIGRATIONS:
        if migration.revision in applied:
            continue
        if is_clean_install and migration.revision != MODEL_BASELINE_REVISION:
            if migration.clean_install is not None:
                await migration.clean_install(connection)
        else:
            await migration.upgrade(connection)
        await connection.execute(
            text(f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES (:revision)"),
            {"revision": migration.revision},
        )
