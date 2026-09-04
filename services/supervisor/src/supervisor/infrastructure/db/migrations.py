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
POSTGRES_MIGRATION_LOCK_KEY = 1_633_671_841


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


async def _apply_memory_proposal_revision(connection: AsyncConnection) -> None:
    """Install the persisted WorkItem-review revision fence after 0002."""

    from supervisor.infrastructure.db.database import ensure_memory_proposal_revision_schema

    await ensure_memory_proposal_revision_schema(connection)


async def _apply_memory_proposal_write_reservation(connection: AsyncConnection) -> None:
    from supervisor.infrastructure.db.database import ensure_memory_proposal_write_reservation_schema

    await ensure_memory_proposal_write_reservation_schema(connection)


async def _apply_memory_proposal_write_intent(connection: AsyncConnection) -> None:
    from supervisor.infrastructure.db.database import ensure_memory_proposal_write_intent_schema

    await ensure_memory_proposal_write_intent_schema(connection)


async def _apply_hermes_outcome_ledger(connection: AsyncConnection) -> None:
    """Create only the additive Hermes-ledger tables for clean and upgraded DBs."""

    from supervisor.infrastructure.db.models import (
        HermesDeliveryEvidence,
        HermesLaneRun,
        HermesLedgerEvent,
        HermesOutcome,
    )

    await connection.run_sync(
        lambda sync_connection: HermesOutcome.metadata.create_all(
            sync_connection,
            tables=[
                HermesOutcome.__table__,
                HermesLaneRun.__table__,
                HermesDeliveryEvidence.__table__,
                HermesLedgerEvent.__table__,
            ],
        )
    )


async def _apply_hermes_board_bridge(connection: AsyncConnection) -> None:
    """Create only additive Supervisor-owned board binding/receipt tables."""

    from supervisor.infrastructure.db.models import HermesBoardBinding, HermesBoardEventReceipt

    await connection.run_sync(
        lambda sync_connection: HermesBoardBinding.metadata.create_all(
            sync_connection,
            tables=[HermesBoardBinding.__table__, HermesBoardEventReceipt.__table__],
        )
    )


async def _apply_hermes_review_handoff(connection: AsyncConnection) -> None:
    from supervisor.infrastructure.db.models import HermesReviewDisposition, HermesRoleCapabilityBinding, HermesVerificationRecord
    await connection.run_sync(
        lambda sync_connection: HermesRoleCapabilityBinding.metadata.create_all(
            sync_connection,
            tables=[
                HermesRoleCapabilityBinding.__table__,
                HermesVerificationRecord.__table__,
                HermesReviewDisposition.__table__,
            ],
        )
    )


async def _apply_hermes_delivery_capability_role(connection: AsyncConnection) -> None:
    """Add the already-approved Delivery role without altering capability data."""

    if connection.dialect.name == "postgresql":
        await connection.execute(text("ALTER TABLE hermes_role_capability_bindings DROP CONSTRAINT ck_hermes_role_capability_role"))
        await connection.execute(
            text(
                "ALTER TABLE hermes_role_capability_bindings "
                "ADD CONSTRAINT ck_hermes_role_capability_role "
                "CHECK (role IN ('developer', 'reviewer', 'delivery'))"
            )
        )
        return
    if connection.dialect.name != "sqlite":
        raise RuntimeError("Hermes Delivery capability migration supports PostgreSQL and SQLite only.")

    await connection.execute(
        text(
            "CREATE TABLE hermes_role_capability_bindings_delivery_role ("
            "capability_binding_id VARCHAR(120) NOT NULL, "
            "outcome_id VARCHAR(120) NOT NULL, "
            "lane_run_id VARCHAR(120) NOT NULL, "
            "role VARCHAR(16) NOT NULL, "
            "identity VARCHAR(120) NOT NULL, "
            "home VARCHAR(240) NOT NULL, "
            "workspace VARCHAR(240) NOT NULL, "
            "capability_digest_sha256 VARCHAR(64) NOT NULL, "
            "created_at DATETIME NOT NULL, "
            "expires_at DATETIME NOT NULL, "
            "revoked_at DATETIME, "
            "revoked_by VARCHAR(120), "
            "metadata_only BOOLEAN NOT NULL, "
            "raw_payload_retained BOOLEAN NOT NULL, "
            "PRIMARY KEY (capability_binding_id), "
            "FOREIGN KEY(outcome_id) REFERENCES hermes_outcomes (outcome_id), "
            "FOREIGN KEY(lane_run_id) REFERENCES hermes_lane_runs (lane_run_id), "
            "CONSTRAINT ck_hermes_role_capability_role CHECK (role IN ('developer', 'reviewer', 'delivery')), "
            "CONSTRAINT ck_hermes_role_capability_expiry CHECK (expires_at > created_at), "
            "CONSTRAINT ck_hermes_role_capability_revocation_pair CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)), "
            "CONSTRAINT ck_hermes_role_capability_metadata_only CHECK (metadata_only IS TRUE), "
            "CONSTRAINT ck_hermes_role_capability_no_raw_payload CHECK (raw_payload_retained IS FALSE)"
            ")"
        )
    )
    columns = (
        "capability_binding_id, outcome_id, lane_run_id, role, identity, home, workspace, "
        "capability_digest_sha256, created_at, expires_at, revoked_at, revoked_by, metadata_only, raw_payload_retained"
    )
    await connection.execute(text(
        "INSERT INTO hermes_role_capability_bindings_delivery_role (" + columns + ") "
        "SELECT " + columns + " FROM hermes_role_capability_bindings"
    ))
    await connection.execute(text("DROP TABLE hermes_role_capability_bindings"))
    await connection.execute(text("ALTER TABLE hermes_role_capability_bindings_delivery_role RENAME TO hermes_role_capability_bindings"))
    await connection.execute(text("CREATE INDEX ix_hermes_role_capability_bindings_outcome_id ON hermes_role_capability_bindings (outcome_id)"))
    await connection.execute(text("CREATE INDEX ix_hermes_role_capability_bindings_lane_run_id ON hermes_role_capability_bindings (lane_run_id)"))


async def _apply_hermes_task_binding(connection: AsyncConnection) -> None:
    """Add nullable task scope without inventing identity for pre-existing Hermes rows."""
    if connection.dialect.name not in {"postgresql", "sqlite"}:
        raise RuntimeError("Hermes task-binding migration supports PostgreSQL and SQLite only.")
    for table in (
        "hermes_outcomes",
        "hermes_lane_runs",
        "hermes_delivery_evidence",
        "hermes_role_capability_bindings",
    ):
        await connection.execute(text(f"ALTER TABLE {table} ADD COLUMN task_id VARCHAR(160)"))
        await connection.execute(text(f"CREATE INDEX ix_{table}_task_id ON {table} (task_id)"))


async def _apply_hermes_review_thread_adjudication(connection: AsyncConnection) -> None:
    """Create the additive Reviewer-authenticated current-thread proof table."""
    from supervisor.infrastructure.db.models import HermesReviewThreadAdjudication
    await connection.run_sync(
        lambda sync_connection: HermesReviewThreadAdjudication.metadata.create_all(
            sync_connection, tables=[HermesReviewThreadAdjudication.__table__]
        )
    )

MIGRATIONS: tuple[SchemaMigration, ...] = (
    SchemaMigration(MODEL_BASELINE_REVISION, _create_model_baseline),
    # The compatibility revision creates durable SQLite triggers and seeds
    # state outside ORM metadata, so a clean install must explicitly run it.
    SchemaMigration(
        "0002_legacy_compatibility",
        _apply_legacy_compatibility,
        clean_install=_apply_legacy_compatibility,
    ),
    SchemaMigration(
        "0003_memory_proposal_revision",
        _apply_memory_proposal_revision,
        clean_install=_apply_memory_proposal_revision,
    ),
    SchemaMigration(
        "0004_memory_proposal_write_reservation",
        _apply_memory_proposal_write_reservation,
        clean_install=_apply_memory_proposal_write_reservation,
    ),
    SchemaMigration(
        "0005_memory_proposal_write_intent",
        _apply_memory_proposal_write_intent,
        clean_install=_apply_memory_proposal_write_intent,
    ),
    SchemaMigration(
        "0006_hermes_outcome_ledger",
        _apply_hermes_outcome_ledger,
        clean_install=_apply_hermes_outcome_ledger,
    ),
    SchemaMigration(
        "0007_hermes_board_bridge",
        _apply_hermes_board_bridge,
        clean_install=_apply_hermes_board_bridge,
    ),
    SchemaMigration("0008_hermes_review_handoff", _apply_hermes_review_handoff, clean_install=_apply_hermes_review_handoff),
    SchemaMigration("0009_hermes_delivery_capability_role", _apply_hermes_delivery_capability_role),
    SchemaMigration("0010_hermes_task_binding", _apply_hermes_task_binding),
    SchemaMigration("0011_hermes_review_thread_adjudication", _apply_hermes_review_thread_adjudication, clean_install=_apply_hermes_review_thread_adjudication),
)


async def _existing_table_names(connection: AsyncConnection) -> set[str]:
    """Read the current schema before migration bookkeeping is created."""

    table_names = await connection.run_sync(lambda sync_connection: inspect(sync_connection).get_table_names())
    return set(table_names)


async def _lock_postgres_migration_bookkeeping(connection: AsyncConnection) -> None:
    """Serialize revision discovery and recording for PostgreSQL replicas."""

    if connection.dialect.name == "postgresql":
        # This transaction-scoped advisory lock is available before the
        # bookkeeping table exists and is released with init_db's transaction.
        await connection.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": POSTGRES_MIGRATION_LOCK_KEY},
        )


def _validate_applied_revision_prefix(applied: set[str]) -> None:
    """Reject bookkeeping outside this binary's complete ordered history."""

    revisions = tuple(migration.revision for migration in MIGRATIONS)
    expected_prefix: list[str] = []
    for revision in revisions:
        if revision not in applied:
            break
        expected_prefix.append(revision)
    known_applied = applied.intersection(revisions)
    if known_applied != set(expected_prefix):
        raise RuntimeError("Supervisor schema migration bookkeeping must contain a contiguous revision prefix.")
    future_revisions = applied.difference(revisions)
    if future_revisions:
        raise RuntimeError(f"Supervisor schema migration bookkeeping has unknown revisions: {sorted(future_revisions)}")


async def _ensure_execute_admission_lock(connection: AsyncConnection) -> None:
    """Repair the durable execute-admission singleton on every startup."""

    await connection.execute(
        text(
            "INSERT INTO admission_locks (scope, generation) VALUES ('execute', 0) "
            "ON CONFLICT (scope) DO NOTHING"
        )
    )


async def upgrade_database(connection: AsyncConnection) -> None:
    """Apply every unapplied schema revision in the caller's transaction."""

    await _lock_postgres_migration_bookkeeping(connection)
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
    _validate_applied_revision_prefix(applied)
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
    # This runtime invariant is intentionally separate from once-only 0002:
    # restores can retain bookkeeping while omitting the singleton row.
    await _ensure_execute_admission_lock(connection)
