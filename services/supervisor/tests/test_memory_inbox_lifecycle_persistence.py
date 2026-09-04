import importlib
import os
import sys
import uuid
from pathlib import Path

import pytest
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import Column, Integer, Table, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from supervisor.domain.memory_inbox import (
    LIFECYCLE_SCHEMA_VERSION,
    MemoryInboxAttemptState,
    MemoryInboxDeletionState,
    MemoryInboxProposalState,
    MemoryInboxSourceState,
    can_advance_lifecycle,
    is_positive_revision,
)
from supervisor.infrastructure.db import database
from supervisor.infrastructure.db.database import Base, _ensure_sqlite_memory_inbox_manifest_ownership, _ensure_sqlite_memory_inbox_revision_states
from supervisor.infrastructure.db.migrations import SCHEMA_MIGRATIONS_TABLE
from supervisor.infrastructure.db import models  # noqa: F401
from supervisor.infrastructure.db.models import MemoryInboxCommandResult
from supervisor.infrastructure.db.models import MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxProposalRevision, MemoryInboxSource, MemoryInboxSourceRevision
from supervisor.infrastructure.db.memory_inbox_repository import MemoryInboxLifecycleRepository
from supervisor.application.memory_inbox_projection import read_memory_inbox_projection, read_review_ready_count
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _active_migrations_module():
    """Resolve the module used by init_db after cross-suite module resets."""

    return importlib.import_module("supervisor.infrastructure.db.migrations")


def test_lifecycle_vocabulary_is_closed_and_inert() -> None:
    assert LIFECYCLE_SCHEMA_VERSION == "kendall-memory-inbox-lifecycle/v1"
    assert MemoryInboxSourceState.REVIEW.value == "Review"
    assert MemoryInboxProposalState.ABSENT.value == "Absent"
    assert MemoryInboxAttemptState.COMPLETION_UNKNOWN.value == "CompletionUnknown"
    assert MemoryInboxDeletionState.PROVEN.value == "Proven"
    assert is_positive_revision(1) is True
    assert is_positive_revision(0) is False
    assert is_positive_revision(True) is False
    assert can_advance_lifecycle(current=MemoryInboxSourceState.UNPROCESSED, target=MemoryInboxSourceState.DRAFT) is True
    assert can_advance_lifecycle(current=MemoryInboxSourceState.DELETED, target=MemoryInboxSourceState.REVIEW) is False


def test_new_lifecycle_schema_is_segregated_and_constraint_backed() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    names = set(inspector.get_table_names())
    expected = {
        "memory_inbox_sources",
        "memory_inbox_source_revisions",
        "memory_inbox_proposals",
        "memory_inbox_proposal_revisions",
        "memory_inbox_command_results",
        "memory_inbox_manifests",
        "memory_inbox_processing_attempts",
        "memory_inbox_jobs",
        "memory_inbox_deletion_operations",
        "memory_inbox_deletion_proofs",
        "memory_inbox_projection_snapshots",
    }
    assert expected <= names

    forbidden = ("body", "content", "payload", "filename", "path", "prompt", "summary", "context", "providerresponse")
    for table in expected:
        columns = {column["name"].lower() for column in inspector.get_columns(table)}
        assert not {column for column in columns if any(token in column for token in forbidden)}

    assert any(constraint["name"] == "uq_memory_inbox_source_revision" for constraint in inspector.get_unique_constraints("memory_inbox_source_revisions"))
    assert any(constraint["name"] == "uq_memory_inbox_proposal_revision" for constraint in inspector.get_unique_constraints("memory_inbox_proposal_revisions"))
    assert any(constraint["name"] == "uq_memory_inbox_command_replay" for constraint in inspector.get_unique_constraints("memory_inbox_command_results"))
    assert any(constraint["name"] == "uq_memory_inbox_attempt_fence" for constraint in inspector.get_unique_constraints("memory_inbox_processing_attempts"))
    source_revision_checks = {constraint["name"] for constraint in inspector.get_check_constraints("memory_inbox_source_revisions")}
    proposal_revision_checks = {constraint["name"] for constraint in inspector.get_check_constraints("memory_inbox_proposal_revisions")}
    manifest_checks = {constraint["name"] for constraint in inspector.get_check_constraints("memory_inbox_manifests")}
    assert "ck_memory_inbox_source_revision_state" in source_revision_checks
    assert "ck_memory_inbox_proposal_revision_state" in proposal_revision_checks
    assert "ck_memory_inbox_manifest_single_owner" in manifest_checks
    manifest_foreign_keys = {foreign_key["referred_table"] for foreign_key in inspector.get_foreign_keys("memory_inbox_manifests")}
    assert manifest_foreign_keys == {"memory_inbox_source_revisions", "memory_inbox_proposal_revisions"}


@pytest.mark.asyncio
async def test_repository_rejects_ids_that_exceed_their_80_character_columns_and_normalizes_deadlines_to_utc(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'persistence-utc.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    repository = MemoryInboxLifecycleRepository()
    deadline = datetime(2026, 8, 10, 9, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    async with session_factory() as session:
        with pytest.raises(ValueError, match="opaque identifiers"):
            await repository.create_inert_source(
                session, source_id="s" * 81, revision_id="revision:valid", retention_deadline_at=deadline,
                actor_ref="operator:test", audit_ref="audit:test", policy_ref="policy:test",
            )
        with pytest.raises(ValueError, match="opaque identifiers"):
            await repository.create_inert_source(
                session, source_id="source:valid", revision_id="r" * 81, retention_deadline_at=deadline,
                actor_ref="operator:test", audit_ref="audit:test", policy_ref="policy:test",
            )
        await repository.create_inert_source(
            session, source_id="source:utc", revision_id="source-revision:utc", retention_deadline_at=deadline,
            actor_ref="operator:test", audit_ref="audit:test", policy_ref="policy:test",
        )
        await session.commit()
    async with session_factory() as session:
        reloaded = await session.get(MemoryInboxSource, "source:utc")
        assert reloaded is not None
        assert reloaded.retention_deadline_at == deadline.astimezone(UTC)
        assert reloaded.retention_deadline_at.tzinfo == UTC
    await engine.dispose()


def test_revision_states_and_manifest_owners_are_database_enforced() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys = ON"))
        Base.metadata.create_all(connection)
    with Session(engine) as session:
        session.add(MemoryInboxSourceRevision(
            id="source-revision:bad-state", source_id="source:missing", revision=1,
            lifecycle_state="unsafe", actor_ref="operator:test", audit_ref="audit:test", policy_ref="policy:test",
        ))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add(MemoryInboxProposalRevision(
            id="proposal-revision:bad-state", proposal_id="proposal:missing", revision=1,
            lifecycle_state="unsafe", actor_ref="operator:test", audit_ref="audit:test",
        ))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add(MemoryInboxManifest(
            id="manifest:missing-owner", copy_class="quarantine", store_ref="store:missing-owner",
            creation_state="Planned", retention_class="source_retention", deletion_state="None",
        ))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add(MemoryInboxManifest(
            id="manifest:ambiguous-owner", source_revision_id="source-revision:missing",
            proposal_revision_id="proposal-revision:missing", copy_class="quarantine", store_ref="store:ambiguous-owner",
            creation_state="Planned", retention_class="source_retention", deletion_state="None",
        ))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add(MemoryInboxManifest(
            id="manifest:orphan-owner", source_revision_id="source-revision:missing", copy_class="quarantine",
            store_ref="store:orphan-owner", creation_state="Planned", retention_class="source_retention", deletion_state="None",
        ))
        with pytest.raises(IntegrityError):
            session.commit()


@pytest.mark.asyncio
async def test_sqlite_default_startup_restricts_manifest_parent_delete_and_id_update(tmp_path, monkeypatch) -> None:
    """The normal SQLite startup path enforces parent protection without FK PRAGMA setup."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'default-startup.db'}")
    monkeypatch.setattr(database, "engine", engine)
    try:
        await database.init_db()

        async with engine.begin() as connection:
            applied_revisions = tuple(
                (await connection.execute(text(
                    f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE} ORDER BY revision"
                ))).scalars()
            )
        active_migrations = _active_migrations_module()
        assert applied_revisions == tuple(migration.revision for migration in active_migrations.MIGRATIONS)

        async with engine.begin() as connection:
            trigger_names = set((await connection.execute(text(
                "SELECT name FROM sqlite_master WHERE type = 'trigger' "
                "AND tbl_name IN ('memory_inbox_source_revisions', 'memory_inbox_proposal_revisions')"
            ))).scalars())
            assert trigger_names >= {
                "trg_memory_inbox_source_revisions_manifest_restrict_delete",
                "trg_memory_inbox_source_revisions_manifest_restrict_update",
                "trg_memory_inbox_proposal_revisions_manifest_restrict_delete",
                "trg_memory_inbox_proposal_revisions_manifest_restrict_update",
            }
            await connection.execute(text("""
                INSERT INTO memory_inbox_sources
                  (id, current_revision, lifecycle_state, retention_deadline_at, deletion_state, policy_ref, created_at, updated_at)
                VALUES ('source:default', 1, 'Scanning', '2026-08-10 00:00:00', 'None', 'policy:test', '2026-08-10 00:00:00', '2026-08-10 00:00:00')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_source_revisions
                  (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref, created_at)
                VALUES ('source-revision:default', 'source:default', 1, 'Scanning', 'operator:test', 'audit:test', 'policy:test', '2026-08-10 00:00:00')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_proposals
                  (id, source_id, current_revision, lifecycle_state, created_at, updated_at)
                VALUES ('proposal:default', 'source:default', 1, 'Draft', '2026-08-10 00:00:00', '2026-08-10 00:00:00')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_proposal_revisions
                  (id, proposal_id, revision, lifecycle_state, actor_ref, audit_ref, created_at)
                VALUES ('proposal-revision:default', 'proposal:default', 1, 'Draft', 'operator:test', 'audit:test', '2026-08-10 00:00:00')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_manifests
                  (id, owner_revision_id, source_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state, created_at)
                VALUES ('manifest:default', 'source-revision:default', 'source-revision:default', 'quarantine', 'store:default', 'Created', 'source_retention', 'None', '2026-08-10 00:00:00')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_manifests
                  (id, owner_revision_id, proposal_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state, created_at)
                VALUES ('manifest:proposal-default', 'proposal-revision:default', 'proposal-revision:default', 'preview', 'store:proposal-default', 'Created', 'proposal_retention', 'None', '2026-08-10 00:00:00')
            """))

        with pytest.raises(IntegrityError, match="memory_inbox_manifest_source_reference_in_use"):
            async with engine.begin() as connection:
                await connection.execute(text(
                    "DELETE FROM memory_inbox_source_revisions WHERE id = 'source-revision:default'"
                ))
        with pytest.raises(IntegrityError, match="memory_inbox_manifest_source_reference_in_use"):
            async with engine.begin() as connection:
                await connection.execute(text(
                    "UPDATE memory_inbox_source_revisions SET id = 'source-revision:renamed' "
                    "WHERE id = 'source-revision:default'"
                ))
        with pytest.raises(IntegrityError, match="memory_inbox_manifest_proposal_reference_in_use"):
            async with engine.begin() as connection:
                await connection.execute(text(
                    "DELETE FROM memory_inbox_proposal_revisions WHERE id = 'proposal-revision:default'"
                ))
        with pytest.raises(IntegrityError, match="memory_inbox_manifest_proposal_reference_in_use"):
            async with engine.begin() as connection:
                await connection.execute(text(
                    "UPDATE memory_inbox_proposal_revisions SET id = 'proposal-revision:renamed' "
                    "WHERE id = 'proposal-revision:default'"
                ))

        # A second startup must read the applied revisions, not replay the
        # compatibility DDL or lose the data written after the upgrade.
        await database.init_db()
        async with engine.begin() as connection:
            assert (await connection.scalar(text(
                "SELECT COUNT(*) FROM memory_inbox_manifests WHERE id = 'manifest:default'"
            ))) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_clean_install_stamps_later_metadata_backed_non_idempotent_migration(tmp_path, monkeypatch) -> None:
    """A later non-idempotent migration uses its clean hook, not upgrade DDL."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'clean-install-stamping.db'}")
    invoked: list[str] = []
    future_table = Table("future_orm_owned", Base.metadata, Column("id", Integer, primary_key=True))

    async def non_idempotent_later_upgrade(connection) -> None:
        invoked.append("upgrade")
        await connection.execute(text("CREATE TABLE future_orm_owned (id INTEGER PRIMARY KEY)"))

    async def clean_install_future_table(connection) -> None:
        invoked.append("clean_install")
        await connection.execute(text("CREATE TABLE future_orm_owned (id INTEGER PRIMARY KEY)"))

    active_migrations = _active_migrations_module()
    later_migration = active_migrations.SchemaMigration(
        "0012_non_idempotent_model_table",
        non_idempotent_later_upgrade,
        clean_install=clean_install_future_table,
    )
    monkeypatch.setattr(
        active_migrations,
        "MIGRATIONS",
        (*active_migrations.MIGRATIONS, later_migration),
    )
    monkeypatch.setattr(database, "engine", engine)
    try:
        await database.init_db()
        assert invoked == ["clean_install"]
        async with engine.begin() as connection:
            applied_revisions = tuple(
                (await connection.execute(text(
                    f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE} ORDER BY revision"
                ))).scalars()
            )
        assert applied_revisions == tuple(migration.revision for migration in active_migrations.MIGRATIONS)
    finally:
        Base.metadata.remove(future_table)
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("has_partial_bookkeeping", [False, True])
async def test_existing_database_does_not_materialize_current_baseline_before_later_upgrade(
    tmp_path,
    monkeypatch,
    has_partial_bookkeeping,
) -> None:
    """A later ORM-owned table must not be created before its legacy upgrade."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy-upgrade.db'}")
    invoked: list[str] = []

    async def later_orm_owned_table_upgrade(connection) -> None:
        invoked.append("upgrade")
        await connection.execute(text("CREATE TABLE future_orm_owned (id INTEGER PRIMARY KEY)"))

    future_table = Table("future_orm_owned", Base.metadata, Column("id", Integer, primary_key=True))
    active_migrations = _active_migrations_module()
    monkeypatch.setattr(
        active_migrations,
        "MIGRATIONS",
        (
            *active_migrations.MIGRATIONS,
            active_migrations.SchemaMigration("0003_orm_owned_table", later_orm_owned_table_upgrade),
        ),
    )
    monkeypatch.setattr(database, "engine", engine)
    try:
        # This marker represents a schema created before migration bookkeeping.
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE pre_boundary_marker (id INTEGER PRIMARY KEY)"))
            if has_partial_bookkeeping:
                await connection.execute(text(
                    f"CREATE TABLE {SCHEMA_MIGRATIONS_TABLE} (revision VARCHAR(80) PRIMARY KEY)"
                ))

        await database.init_db()
        assert invoked == ["upgrade"]
        async with engine.begin() as connection:
            assert await connection.scalar(text(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'future_orm_owned'"
            )) == 1
    finally:
        Base.metadata.remove(future_table)
        await engine.dispose()


@pytest.mark.asyncio
async def test_migration_bookkeeping_rejects_non_prefix_history(tmp_path, monkeypatch) -> None:
    """A recorded descendant without its predecessor must fail closed."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'non-prefix-history.db'}")
    monkeypatch.setattr(database, "engine", engine)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE pre_boundary_marker (id INTEGER PRIMARY KEY)"))
            await connection.execute(text(
                f"CREATE TABLE {SCHEMA_MIGRATIONS_TABLE} (revision VARCHAR(80) PRIMARY KEY)"
            ))
            await connection.execute(text(
                f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES ('0002_legacy_compatibility')"
            ))

        with pytest.raises(RuntimeError, match="contiguous revision prefix"):
            await database.init_db()
        async with engine.begin() as connection:
            recorded = tuple((await connection.execute(text(
                f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE} ORDER BY revision"
            ))).scalars())
        assert recorded == ("0002_legacy_compatibility",)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_memory_proposal_revision_is_forward_migrated_after_recorded_legacy_compatibility(tmp_path, monkeypatch) -> None:
    """Recorded 0002 databases receive the later review-plane fence exactly once."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'recorded-0002-memory-proposals.db'}")
    monkeypatch.setattr(database, "engine", engine)
    try:
        async with engine.begin() as connection:
            await connection.execute(text(
                "CREATE TABLE memory_proposals (id VARCHAR(36) PRIMARY KEY, work_item_id VARCHAR(36), proposal_id VARCHAR(120))"
            ))
            await connection.execute(text(
                "INSERT INTO memory_proposals (id, work_item_id, proposal_id) VALUES ('legacy', 'work-item', 'proposal')"
            ))
            await connection.execute(text("CREATE TABLE admission_locks (scope VARCHAR(80) PRIMARY KEY, generation INTEGER)"))
            await connection.execute(text(
                f"CREATE TABLE {SCHEMA_MIGRATIONS_TABLE} (revision VARCHAR(80) PRIMARY KEY)"
            ))
            for revision in ("0001_model_baseline", "0002_legacy_compatibility"):
                await connection.execute(
                    text(f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES (:revision)"),
                    {"revision": revision},
                )

        await database.init_db()

        async with engine.begin() as connection:
            columns = {
                column[1]
                for column in (await connection.execute(text("PRAGMA table_info(memory_proposals)"))).all()
            }
            assert "revision" in columns
            assert await connection.scalar(text("SELECT revision FROM memory_proposals WHERE id = 'legacy'")) == 1
            recorded = set((await connection.execute(
                text(f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE}")
            )).scalars())
            assert recorded == {
                "0001_model_baseline",
                    "0002_legacy_compatibility",
                    "0003_memory_proposal_revision",
                    "0004_memory_proposal_write_reservation",
                    "0005_memory_proposal_write_intent",
                "0006_hermes_outcome_ledger",
                "0007_hermes_board_bridge",
                "0008_hermes_review_handoff",
                "0009_hermes_delivery_capability_role",
                "0010_hermes_task_binding",
                "0011_hermes_review_thread_adjudication",
            }
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "revision",
    [
        "0003_future_schema",
        "0004_future_schema",
        "future_schema",
    ],
)
async def test_migration_bookkeeping_rejects_unknown_future_revision_history(tmp_path, monkeypatch, revision) -> None:
    """A prior binary cannot infer compatibility from an unknown revision ID."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / f'invalid-future-{revision}.db'}")
    monkeypatch.setattr(database, "engine", engine)
    try:
        await database.init_db()
        async with engine.begin() as connection:
            await connection.execute(text(
                f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES (:revision)"
            ), {"revision": revision})

        with pytest.raises(RuntimeError, match="unknown revisions"):
            await database.init_db()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_migration_bookkeeping_rejects_interleaved_unknown_revision_history(tmp_path, monkeypatch) -> None:
    """A later record cannot appear between this binary's known revisions."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'interleaved-history.db'}")
    monkeypatch.setattr(database, "engine", engine)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE pre_boundary_marker (id INTEGER PRIMARY KEY)"))
            await connection.execute(text(
                f"CREATE TABLE {SCHEMA_MIGRATIONS_TABLE} (revision VARCHAR(80) PRIMARY KEY)"
            ))
            await connection.execute(text(
                f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES ('0001_model_baseline')"
            ))
            await connection.execute(text(
                f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES ('0003_future_schema')"
            ))

        with pytest.raises(RuntimeError, match="unknown revisions"):
            await database.init_db()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_startup_repairs_execute_admission_lock_after_recorded_compatibility(tmp_path, monkeypatch) -> None:
    """A restore may retain migration rows while omitting this runtime singleton."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'admission-lock-repair.db'}")
    monkeypatch.setattr(database, "engine", engine)
    try:
        await database.init_db()
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM admission_locks WHERE scope = 'execute'"))

        await database.init_db()
        async with engine.begin() as connection:
            assert await connection.scalar(text(
                "SELECT generation FROM admission_locks WHERE scope = 'execute'"
            )) == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_postgres_migration_bookkeeping_uses_a_transaction_scoped_lock() -> None:
    """Replicas serialize before they observe and record applied revisions."""

    active_migrations = _active_migrations_module()

    class RecordingConnection:
        def __init__(self, dialect_name: str) -> None:
            self.dialect = type("Dialect", (), {"name": dialect_name})()
            self.calls: list[tuple[str, dict[str, int]]] = []

        async def execute(self, statement, parameters=None) -> None:
            self.calls.append((str(statement), parameters or {}))

    postgres = RecordingConnection("postgresql")
    await active_migrations._lock_postgres_migration_bookkeeping(postgres)
    assert postgres.calls == [
        ("SELECT pg_advisory_xact_lock(:lock_key)", {"lock_key": active_migrations.POSTGRES_MIGRATION_LOCK_KEY})
    ]

    sqlite = RecordingConnection("sqlite")
    await active_migrations._lock_postgres_migration_bookkeeping(sqlite)
    assert sqlite.calls == []


def test_legacy_sqlite_manifest_rebuild_uses_frozen_baseline_metadata() -> None:
    """Compatibility revision 0002 must not materialize future live ORM columns."""

    source = Path(database.__file__).read_text(encoding="utf-8")
    helper = source[source.index("async def _sqlite_drop_legacy_manifest_owner_uniqueness"):source.index("async def _ensure_sqlite_memory_inbox_manifest_ownership")]
    assert "models_baseline import MemoryInboxManifest as BaselineMemoryInboxManifest" in helper
    assert "supervisor.infrastructure.db.models import MemoryInboxManifest" not in helper
    assert "BaselineMemoryInboxManifest.__table__.create" in helper


def test_supervisor_readme_links_schema_migration_runbook() -> None:
    readme = Path(__file__).resolve().parents[1] / "README.md"
    assert "supervisor-schema-migrations.md" in readme.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_sqlite_startup_migrates_legacy_manifest_owner_to_an_explicit_reference(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy-manifest.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("DROP TABLE memory_inbox_manifests"))
        await connection.execute(text("""
            CREATE TABLE memory_inbox_manifests (
                id VARCHAR(80) PRIMARY KEY,
                owner_revision_id VARCHAR(80) NOT NULL,
                copy_class VARCHAR(32) NOT NULL,
                store_ref VARCHAR(200) NOT NULL UNIQUE,
                creation_state VARCHAR(16) NOT NULL,
                retention_class VARCHAR(32) NOT NULL,
                deletion_state VARCHAR(16) NOT NULL,
                created_at DATETIME,
                deleted_at DATETIME
            )
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_sources
              (id, current_revision, lifecycle_state, retention_deadline_at, deletion_state, policy_ref, created_at, updated_at)
            VALUES ('source:legacy', 1, 'Scanning', '2026-08-10 00:00:00', 'None', 'policy:test', '2026-08-10 00:00:00', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_source_revisions
              (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref, created_at)
            VALUES ('source-revision:legacy', 'source:legacy', 1, 'Scanning', 'operator:test', 'audit:test', 'policy:test', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_proposals
              (id, source_id, current_revision, lifecycle_state, created_at, updated_at)
            VALUES ('proposal:legacy', 'source:legacy', 1, 'Draft', '2026-08-10 00:00:00', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_source_revisions
              (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref, created_at)
            VALUES ('revision:collision', 'source:legacy', 2, 'Scanning', 'operator:test', 'audit:test', 'policy:test', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_proposal_revisions
              (id, proposal_id, revision, lifecycle_state, actor_ref, audit_ref, created_at)
            VALUES ('revision:collision', 'proposal:legacy', 1, 'Draft', 'operator:test', 'audit:test', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_manifests
              (id, owner_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
            VALUES ('manifest:legacy', 'source-revision:legacy', 'quarantine', 'store:legacy', 'Created', 'source_retention', 'None')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_manifests
              (id, owner_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
            VALUES ('manifest:collision', 'revision:collision', 'preview', 'store:collision', 'Created', 'source_retention', 'None')
        """))
        with pytest.raises(RuntimeError, match="manifest ownership migration found unresolved references"):
            await _ensure_sqlite_memory_inbox_manifest_ownership(connection)
        await connection.execute(text("DELETE FROM memory_inbox_manifests WHERE id = 'manifest:collision'"))
        await _ensure_sqlite_memory_inbox_manifest_ownership(connection)
        await _ensure_sqlite_memory_inbox_revision_states(connection)
        owner = await connection.scalar(text(
            "SELECT source_revision_id FROM memory_inbox_manifests WHERE id = 'manifest:legacy'"
        ))
        assert owner == "source-revision:legacy"
        # The old `(owner_revision_id, copy_class)` key must be gone: the
        # same legacy identifier may now safely name one source and one
        # proposal manifest when the explicit FKs disambiguate them.
        await connection.execute(text("""
            INSERT INTO memory_inbox_manifests
              (id, owner_revision_id, source_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
            VALUES ('manifest:collision-source', 'revision:collision', 'revision:collision', 'preview', 'store:collision-source', 'Created', 'source_retention', 'None')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_manifests
              (id, owner_revision_id, proposal_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
            VALUES ('manifest:collision-proposal', 'revision:collision', 'revision:collision', 'preview', 'store:collision-proposal', 'Created', 'proposal_retention', 'None')
        """))
        with pytest.raises(IntegrityError, match="memory_inbox_manifest_source_reference"):
            await connection.execute(text("""
                INSERT INTO memory_inbox_manifests
                  (id, owner_revision_id, source_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
                VALUES ('manifest:orphan', '', 'source-revision:missing', 'preview', 'store:orphan', 'Planned', 'source_retention', 'None')
            """))
        with pytest.raises(IntegrityError, match="memory_inbox_source_revisions_state"):
            await connection.execute(text("""
                INSERT INTO memory_inbox_source_revisions
                  (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref, created_at)
                VALUES ('source-revision:invalid', 'source:legacy', 2, 'invalid', 'operator:test', 'audit:test', 'policy:test', '2026-08-10 00:00:00')
            """))
        with pytest.raises(IntegrityError, match="memory_inbox_manifest_source_reference_in_use"):
            await connection.execute(text(
                "DELETE FROM memory_inbox_source_revisions WHERE id = 'source-revision:legacy'"
            ))
    await engine.dispose()


@pytest.mark.asyncio
async def test_sqlite_manifest_owner_migration_preserves_a_valid_partial_proposal_owner(tmp_path) -> None:
    """A pre-existing proposal owner must not be backfilled as a source owner."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'partial-proposal-owner.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("DROP TABLE memory_inbox_manifests"))
        await connection.execute(text("""
            CREATE TABLE memory_inbox_manifests (
                id VARCHAR(80) PRIMARY KEY,
                owner_revision_id VARCHAR(80) NOT NULL,
                proposal_revision_id VARCHAR(80),
                copy_class VARCHAR(32) NOT NULL,
                store_ref VARCHAR(200) NOT NULL UNIQUE,
                creation_state VARCHAR(16) NOT NULL,
                retention_class VARCHAR(32) NOT NULL,
                deletion_state VARCHAR(16) NOT NULL,
                created_at DATETIME,
                deleted_at DATETIME
            )
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_sources
              (id, current_revision, lifecycle_state, retention_deadline_at, deletion_state, policy_ref, created_at, updated_at)
            VALUES ('source:partial-proposal', 1, 'Scanning', '2026-08-10 00:00:00', 'None', 'policy:test', '2026-08-10 00:00:00', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_proposals
              (id, source_id, current_revision, lifecycle_state, created_at, updated_at)
            VALUES ('proposal:partial-proposal', 'source:partial-proposal', 1, 'Draft', '2026-08-10 00:00:00', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_source_revisions
              (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref, created_at)
            VALUES ('revision:partial-proposal', 'source:partial-proposal', 1, 'Scanning', 'operator:test', 'audit:test', 'policy:test', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_proposal_revisions
              (id, proposal_id, revision, lifecycle_state, actor_ref, audit_ref, created_at)
            VALUES ('revision:partial-proposal', 'proposal:partial-proposal', 1, 'Draft', 'operator:test', 'audit:test', '2026-08-10 00:00:00')
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_manifests
              (id, owner_revision_id, proposal_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
            VALUES ('manifest:partial-proposal', 'revision:partial-proposal', 'revision:partial-proposal', 'preview', 'store:partial-proposal', 'Planned', 'source_retention', 'None')
        """))

        await _ensure_sqlite_memory_inbox_manifest_ownership(connection)
        owner = (await connection.execute(text("""
            SELECT source_revision_id, proposal_revision_id
            FROM memory_inbox_manifests WHERE id = 'manifest:partial-proposal'
        """))).mappings().one()
        assert dict(owner) == {
            "source_revision_id": None,
            "proposal_revision_id": "revision:partial-proposal",
        }
    await engine.dispose()


@pytest.mark.asyncio
async def test_sqlite_manifest_owner_migration_rejects_an_existing_invalid_explicit_owner(tmp_path) -> None:
    """Startup must validate old explicit values before installing SQLite triggers."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'invalid-explicit-owner.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("DROP TABLE memory_inbox_manifests"))
        await connection.execute(text("""
            CREATE TABLE memory_inbox_manifests (
                id VARCHAR(80) PRIMARY KEY,
                owner_revision_id VARCHAR(80) NOT NULL,
                proposal_revision_id VARCHAR(80),
                copy_class VARCHAR(32) NOT NULL,
                store_ref VARCHAR(200) NOT NULL UNIQUE,
                creation_state VARCHAR(16) NOT NULL,
                retention_class VARCHAR(32) NOT NULL,
                deletion_state VARCHAR(16) NOT NULL,
                created_at DATETIME,
                deleted_at DATETIME
            )
        """))
        await connection.execute(text("""
            INSERT INTO memory_inbox_manifests
              (id, owner_revision_id, proposal_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
            VALUES ('manifest:invalid-explicit', 'proposal-revision:missing', 'proposal-revision:missing', 'preview', 'store:invalid-explicit', 'Planned', 'source_retention', 'None')
        """))

        with pytest.raises(RuntimeError, match="manifest ownership migration found unresolved references"):
            await _ensure_sqlite_memory_inbox_manifest_ownership(connection)
    await engine.dispose()


@pytest.mark.asyncio
async def test_postgres_startup_migrates_pre_patch_memory_inbox_owners_and_revision_states(monkeypatch) -> None:
    """Exercise only the Inbox legacy tables against an explicitly isolated PostgreSQL database."""

    database_url = os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_URL")
    if not database_url or os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_ISOLATED") != "1":
        pytest.skip("An explicitly isolated PostgreSQL database is required for the Inbox legacy-schema migration proof.")

    schema_name = f"memory_inbox_migration_{uuid.uuid4().hex}"
    schema_engine = create_async_engine(database_url, future=True)
    isolated_engine = create_async_engine(
        database_url,
        future=True,
        connect_args={"server_settings": {"search_path": schema_name}},
    )

    async def prepare_pre_patch_schema() -> None:
        async with schema_engine.begin() as connection:
            await connection.execute(text(f"CREATE SCHEMA {schema_name}"))
        async with isolated_engine.begin() as connection:
            await connection.execute(text("CREATE TABLE memory_inbox_sources (id VARCHAR(80) PRIMARY KEY)"))
            await connection.execute(text("CREATE TABLE memory_inbox_proposals (id VARCHAR(80) PRIMARY KEY)"))
            await connection.execute(text("""
                CREATE TABLE memory_inbox_source_revisions (
                    id VARCHAR(80) PRIMARY KEY,
                    source_id VARCHAR(80) NOT NULL,
                    revision INTEGER NOT NULL,
                    lifecycle_state VARCHAR(32) NOT NULL,
                    actor_ref VARCHAR(160) NOT NULL,
                    audit_ref VARCHAR(160) NOT NULL,
                    policy_ref VARCHAR(160) NOT NULL,
                    created_at TIMESTAMPTZ
                )
            """))
            await connection.execute(text("""
                CREATE TABLE memory_inbox_proposal_revisions (
                    id VARCHAR(80) PRIMARY KEY,
                    proposal_id VARCHAR(80) NOT NULL,
                    revision INTEGER NOT NULL,
                    lifecycle_state VARCHAR(16) NOT NULL,
                    actor_ref VARCHAR(160) NOT NULL,
                    audit_ref VARCHAR(160) NOT NULL,
                    created_at TIMESTAMPTZ
                )
            """))
            await connection.execute(text("""
                CREATE TABLE memory_inbox_manifests (
                    id VARCHAR(80) PRIMARY KEY,
                    owner_revision_id VARCHAR(80) NOT NULL,
                    copy_class VARCHAR(32) NOT NULL,
                    store_ref VARCHAR(200) NOT NULL UNIQUE,
                    creation_state VARCHAR(16) NOT NULL,
                    retention_class VARCHAR(32) NOT NULL,
                    deletion_state VARCHAR(16) NOT NULL,
                    created_at TIMESTAMPTZ,
                    deleted_at TIMESTAMPTZ
                )
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_manifests
                  (id, owner_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
                VALUES ('manifest:legacy', 'revision:missing', 'quarantine', 'store:legacy', 'Created', 'source_retention', 'None')
            """))
            await connection.execute(text("""
                CREATE TABLE memory_inbox_constraint_decoys (
                    id INTEGER PRIMARY KEY,
                    source_revision_id VARCHAR(80),
                    proposal_revision_id VARCHAR(80),
                    lifecycle_state VARCHAR(32),
                    CONSTRAINT ck_memory_inbox_manifest_single_owner CHECK (id >= 0),
                    CONSTRAINT fk_memory_inbox_manifest_source_revision CHECK (id >= 0),
                    CONSTRAINT fk_memory_inbox_manifest_proposal_revision CHECK (id >= 0),
                    CONSTRAINT ck_memory_inbox_source_revision_state CHECK (id >= 0),
                    CONSTRAINT ck_memory_inbox_proposal_revision_state CHECK (id >= 0)
                )
            """))

    async def repair_legacy_owner_and_assert_migrated() -> None:
        async with isolated_engine.begin() as connection:
            await connection.execute(text("INSERT INTO memory_inbox_sources (id) VALUES ('source:legacy')"))
            await connection.execute(text("INSERT INTO memory_inbox_proposals (id) VALUES ('proposal:legacy')"))
            await connection.execute(text("""
                INSERT INTO memory_inbox_source_revisions
                  (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref)
                VALUES ('source-revision:legacy', 'source:legacy', 1, 'Scanning', 'operator:test', 'audit:test', 'policy:test')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_source_revisions
                  (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref)
                VALUES ('revision:collision', 'source:legacy', 2, 'Scanning', 'operator:test', 'audit:test', 'policy:test')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_proposal_revisions
                  (id, proposal_id, revision, lifecycle_state, actor_ref, audit_ref)
                VALUES ('proposal-revision:legacy', 'proposal:legacy', 1, 'Draft', 'operator:test', 'audit:test')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_proposal_revisions
                  (id, proposal_id, revision, lifecycle_state, actor_ref, audit_ref)
                VALUES ('revision:collision', 'proposal:legacy', 2, 'Draft', 'operator:test', 'audit:test')
            """))
            await connection.execute(text("""
                UPDATE memory_inbox_manifests
                SET owner_revision_id = 'revision:collision'
                WHERE id = 'manifest:legacy'
            """))

        from supervisor.infrastructure.db.database import init_db

        async with isolated_engine.begin() as connection:
            before_columns = set((await connection.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'memory_inbox_manifests'
                  AND column_name IN ('source_revision_id', 'proposal_revision_id')
            """))).scalars())
            assert before_columns == set()
        with pytest.raises(RuntimeError, match="manifest ownership migration found unresolved references"):
            await init_db()
        async with isolated_engine.begin() as connection:
            after_columns = set((await connection.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'memory_inbox_manifests'
                  AND column_name IN ('source_revision_id', 'proposal_revision_id')
            """))).scalars())
            assert after_columns == before_columns
        async with isolated_engine.begin() as connection:
            await connection.execute(text("""
                UPDATE memory_inbox_manifests
                SET owner_revision_id = 'source-revision:legacy'
                WHERE id = 'manifest:legacy'
            """))
        await init_db()
        async with isolated_engine.begin() as connection:
            owner = (await connection.execute(text("""
                SELECT source_revision_id, proposal_revision_id
                FROM memory_inbox_manifests WHERE id = 'manifest:legacy'
            """))).one()
            assert owner == ("source-revision:legacy", None)
            constraints = set((await connection.execute(text("""
                SELECT conname FROM pg_constraint
                WHERE conrelid IN (
                  'memory_inbox_manifests'::regclass,
                  'memory_inbox_source_revisions'::regclass,
                  'memory_inbox_proposal_revisions'::regclass
                ) AND conname IN (
                  'ck_memory_inbox_manifest_single_owner',
                  'fk_memory_inbox_manifest_source_revision',
                  'fk_memory_inbox_manifest_proposal_revision',
                  'ck_memory_inbox_source_revision_state',
                  'ck_memory_inbox_proposal_revision_state'
                )
            """))).scalars())
            assert constraints == {
                "ck_memory_inbox_manifest_single_owner",
                "fk_memory_inbox_manifest_source_revision",
                "fk_memory_inbox_manifest_proposal_revision",
                "ck_memory_inbox_source_revision_state",
                "ck_memory_inbox_proposal_revision_state",
            }
            with pytest.raises(IntegrityError):
                async with connection.begin_nested():
                    await connection.execute(text("""
                        INSERT INTO memory_inbox_manifests
                          (id, owner_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
                        VALUES ('manifest:unowned', '', 'preview', 'store:unowned', 'Planned', 'source_retention', 'None')
                    """))
            with pytest.raises(IntegrityError):
                async with connection.begin_nested():
                    await connection.execute(text("""
                        INSERT INTO memory_inbox_source_revisions
                          (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref)
                        VALUES ('source-revision:unsafe', 'source:legacy', 2, 'unsafe', 'operator:test', 'audit:test', 'policy:test')
                    """))

    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", database_url)
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.infrastructure.db import database

    database.engine = isolated_engine

    try:
        await prepare_pre_patch_schema()
        with pytest.raises(RuntimeError, match="manifest ownership migration found unresolved references"):
            await database.init_db()
        await repair_legacy_owner_and_assert_migrated()
    finally:
        await isolated_engine.dispose()
        async with schema_engine.begin() as connection:
            await connection.execute(text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE"))
        await schema_engine.dispose()
        _reset_supervisor_modules()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("existing_owner_column", "explicit_owner_id", "backfill_owner_id", "expected_owners"),
    (
        (
            "source_revision_id",
            "source-revision:partial",
            "proposal-revision:partial",
            {
                "manifest:explicit": ("source-revision:partial", None),
                "manifest:backfill": (None, "proposal-revision:partial"),
            },
        ),
        (
            "proposal_revision_id",
            "proposal-revision:partial",
            "source-revision:partial",
            {
                "manifest:explicit": (None, "proposal-revision:partial"),
                "manifest:backfill": ("source-revision:partial", None),
            },
        ),
    ),
)
async def test_postgres_startup_completes_valid_partial_manifest_owner_columns(
    monkeypatch,
    existing_owner_column: str,
    explicit_owner_id: str,
    backfill_owner_id: str,
    expected_owners: dict[str, tuple[str | None, str | None]],
) -> None:
    """A valid one-column owner upgrade retains and completes legacy manifest ownership."""

    database_url = os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_URL")
    if not database_url or os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_ISOLATED") != "1":
        pytest.skip("An explicitly isolated PostgreSQL database is required for the Inbox legacy-schema migration proof.")

    schema_name = f"memory_inbox_partial_owner_{uuid.uuid4().hex}"
    schema_engine = create_async_engine(database_url, future=True)
    isolated_engine = create_async_engine(
        database_url,
        future=True,
        connect_args={"server_settings": {"search_path": schema_name}},
    )
    other_owner_column = "proposal_revision_id" if existing_owner_column == "source_revision_id" else "source_revision_id"

    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", database_url)
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.infrastructure.db import database

    database.engine = isolated_engine

    try:
        async with schema_engine.begin() as connection:
            await connection.execute(text(f"CREATE SCHEMA {schema_name}"))
        async with isolated_engine.begin() as connection:
            await connection.execute(text("CREATE TABLE memory_inbox_sources (id VARCHAR(80) PRIMARY KEY)"))
            await connection.execute(text("CREATE TABLE memory_inbox_proposals (id VARCHAR(80) PRIMARY KEY)"))
            await connection.execute(text("""
                CREATE TABLE memory_inbox_source_revisions (
                    id VARCHAR(80) PRIMARY KEY,
                    source_id VARCHAR(80) NOT NULL,
                    revision INTEGER NOT NULL,
                    lifecycle_state VARCHAR(32) NOT NULL,
                    actor_ref VARCHAR(160) NOT NULL,
                    audit_ref VARCHAR(160) NOT NULL,
                    policy_ref VARCHAR(160) NOT NULL,
                    created_at TIMESTAMPTZ
                )
            """))
            await connection.execute(text("""
                CREATE TABLE memory_inbox_proposal_revisions (
                    id VARCHAR(80) PRIMARY KEY,
                    proposal_id VARCHAR(80) NOT NULL,
                    revision INTEGER NOT NULL,
                    lifecycle_state VARCHAR(16) NOT NULL,
                    actor_ref VARCHAR(160) NOT NULL,
                    audit_ref VARCHAR(160) NOT NULL,
                    created_at TIMESTAMPTZ
                )
            """))
            await connection.execute(text(f"""
                CREATE TABLE memory_inbox_manifests (
                    id VARCHAR(80) PRIMARY KEY,
                    owner_revision_id VARCHAR(80) NOT NULL,
                    {existing_owner_column} VARCHAR(80),
                    copy_class VARCHAR(32) NOT NULL,
                    store_ref VARCHAR(200) NOT NULL UNIQUE,
                    creation_state VARCHAR(16) NOT NULL,
                    retention_class VARCHAR(32) NOT NULL,
                    deletion_state VARCHAR(16) NOT NULL,
                    created_at TIMESTAMPTZ,
                    deleted_at TIMESTAMPTZ
                )
            """))
            await connection.execute(text("INSERT INTO memory_inbox_sources (id) VALUES ('source:partial')"))
            await connection.execute(text("INSERT INTO memory_inbox_proposals (id) VALUES ('proposal:partial')"))
            await connection.execute(text("""
                INSERT INTO memory_inbox_source_revisions
                  (id, source_id, revision, lifecycle_state, actor_ref, audit_ref, policy_ref)
                VALUES ('source-revision:partial', 'source:partial', 1, 'Scanning', 'operator:test', 'audit:test', 'policy:test')
            """))
            await connection.execute(text("""
                INSERT INTO memory_inbox_proposal_revisions
                  (id, proposal_id, revision, lifecycle_state, actor_ref, audit_ref)
                VALUES ('proposal-revision:partial', 'proposal:partial', 1, 'Draft', 'operator:test', 'audit:test')
            """))
            await connection.execute(
                text(
                    f"INSERT INTO memory_inbox_manifests "
                    f"(id, owner_revision_id, {existing_owner_column}, copy_class, store_ref, creation_state, retention_class, deletion_state) "
                    f"VALUES ('manifest:explicit', :owner_id, :owner_id, 'quarantine', 'store:explicit', 'Created', 'source_retention', 'None')"
                ),
                {"owner_id": explicit_owner_id},
            )
            await connection.execute(
                text(
                    f"INSERT INTO memory_inbox_manifests "
                    f"(id, owner_revision_id, {existing_owner_column}, copy_class, store_ref, creation_state, retention_class, deletion_state) "
                    f"VALUES ('manifest:backfill', :owner_id, NULL, 'preview', 'store:backfill', 'Planned', 'source_retention', 'None')"
                ),
                {"owner_id": backfill_owner_id},
            )

        await database.init_db()
        # A completed partial-column migration is idempotent and does not
        # rewrite a valid explicit owner on a subsequent supervisor start.
        await database.init_db()

        async with isolated_engine.begin() as connection:
            columns = set((await connection.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'memory_inbox_manifests'
                  AND column_name IN ('source_revision_id', 'proposal_revision_id')
            """))).scalars())
            assert columns == {"source_revision_id", "proposal_revision_id"}
            assert other_owner_column in columns
            owners = {
                row.id: (row.source_revision_id, row.proposal_revision_id)
                for row in (await connection.execute(text("""
                    SELECT id, source_revision_id, proposal_revision_id
                    FROM memory_inbox_manifests
                    WHERE id IN ('manifest:explicit', 'manifest:backfill')
                """))).mappings()
            }
            assert owners == expected_owners
            constraints = set((await connection.execute(text("""
                SELECT conname FROM pg_constraint
                WHERE conrelid = 'memory_inbox_manifests'::regclass
                  AND conname IN (
                    'ck_memory_inbox_manifest_single_owner',
                    'fk_memory_inbox_manifest_source_revision',
                    'fk_memory_inbox_manifest_proposal_revision'
                  )
            """))).scalars())
            assert constraints == {
                "ck_memory_inbox_manifest_single_owner",
                "fk_memory_inbox_manifest_source_revision",
                "fk_memory_inbox_manifest_proposal_revision",
            }
            with pytest.raises(IntegrityError):
                async with connection.begin_nested():
                    await connection.execute(text("""
                        INSERT INTO memory_inbox_manifests
                          (id, owner_revision_id, source_revision_id, proposal_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
                        VALUES ('manifest:two-owners', 'source-revision:partial', 'source-revision:partial', 'proposal-revision:partial', 'preview', 'store:two-owners', 'Planned', 'source_retention', 'None')
                    """))
            with pytest.raises(IntegrityError):
                async with connection.begin_nested():
                    await connection.execute(text("""
                        INSERT INTO memory_inbox_manifests
                          (id, owner_revision_id, source_revision_id, proposal_revision_id, copy_class, store_ref, creation_state, retention_class, deletion_state)
                        VALUES ('manifest:orphan-owner', 'source-revision:missing', 'source-revision:missing', NULL, 'preview', 'store:orphan-owner', 'Planned', 'source_retention', 'None')
                    """))
    finally:
        await isolated_engine.dispose()
        async with schema_engine.begin() as connection:
            await connection.execute(text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE"))
        await schema_engine.dispose()
        _reset_supervisor_modules()


def test_migration_runbook_requires_capability_rollback_not_table_drop() -> None:
    runbook = Path(__file__).resolve().parents[3] / "docs" / "workflows" / "memory-inbox-lifecycle-migration.md"
    text = runbook.read_text(encoding="utf-8").lower()
    assert "capability rollback" in text
    assert "do not\ndrop tables" in text
    assert "legacy" in text and "segregated" in text
    assert "explicit owner backfill" in text
    assert "fail closed" in text
    assert "before adding either explicit-owner target column" in text
    assert "current_schema()" in text
    assert "both revision tables" in text


def test_command_replay_fence_rejects_duplicate_aggregate_idempotency_pair() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(MemoryInboxCommandResult(
            id="command:one",
            aggregate_id="source:alpha",
            expected_revision=1,
            idempotency_key="idempotency:alpha",
            command_kind="future_transition",
            request_digest="digest:alpha",
            outcome="accepted",
            reason_code="accepted",
            resulting_revision=1,
            actor_ref="operator:alpha",
        ))
        session.commit()
        session.add(MemoryInboxCommandResult(
            id="command:two",
            aggregate_id="source:alpha",
            expected_revision=1,
            idempotency_key="idempotency:alpha",
            command_kind="future_transition",
            request_digest="digest:alpha",
            outcome="replayed",
            reason_code="replayed",
            resulting_revision=1,
            actor_ref="operator:alpha",
        ))
        with pytest.raises(IntegrityError):
            session.commit()


@pytest.mark.asyncio
async def test_review_badge_count_uses_only_ready_proposal_aggregates(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-ready.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        from datetime import UTC, datetime, timedelta

        deadline = datetime.now(UTC) + timedelta(days=1)
        session.add_all((
            MemoryInboxSource(id="source:one", current_revision=1, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test"),
            MemoryInboxSource(id="source:two", current_revision=1, lifecycle_state="DeletePending", retention_deadline_at=deadline, deletion_state="Pending", policy_ref="policy:test"),
            MemoryInboxProposalAggregate(id="proposal:ready", source_id="source:one", current_revision=1, lifecycle_state="Ready"),
            MemoryInboxProposalAggregate(id="proposal:stale", source_id="source:two", current_revision=1, lifecycle_state="Ready"),
        ))
        await session.commit()
        assert await read_review_ready_count(session) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_review_inventory_excludes_review_sources_without_a_ready_proposal(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-inventory.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        from datetime import UTC, datetime, timedelta

        deadline = datetime.now(UTC) + timedelta(days=1)
        session.add_all((
            MemoryInboxSource(id="source:ready", current_revision=1, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test"),
            MemoryInboxSource(id="source:denied", current_revision=1, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test"),
            MemoryInboxProposalAggregate(id="proposal:ready", source_id="source:ready", current_revision=1, lifecycle_state="Ready"),
            MemoryInboxProposalAggregate(id="proposal:denied", source_id="source:denied", current_revision=1, lifecycle_state="Denied"),
        ))
        await session.commit()
        assert [row.source_id for row in await read_memory_inbox_projection(session)] == ["source:ready"]
    await engine.dispose()
