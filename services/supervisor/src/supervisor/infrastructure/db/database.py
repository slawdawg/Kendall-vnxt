from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase

from supervisor.config.settings import get_settings


class Base(DeclarativeBase):
    pass


MEMORY_PROPOSAL_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("work_item_id", "VARCHAR(36)"),
    ("proposal_id", "VARCHAR(120)"),
    ("label", "VARCHAR(255)"),
    ("status", "VARCHAR(32) DEFAULT 'pending_human_approval'"),
    ("summary", "TEXT"),
    ("source_refs_json", "JSON DEFAULT '[]'"),
    ("evidence_refs_json", "JSON DEFAULT '[]'"),
    ("target_ref_json", "JSON"),
    ("target_vault_path", "TEXT"),
    ("target_vault_folder", "TEXT DEFAULT ''"),
    ("proposal_type", "VARCHAR(32) DEFAULT 'new_note'"),
    ("suggested_content_summary", "TEXT DEFAULT ''"),
    ("patch_summary", "TEXT"),
    ("sensitivity", "VARCHAR(16) DEFAULT 'medium'"),
    ("freshness", "VARCHAR(16) DEFAULT 'fresh'"),
    ("contradiction_status", "VARCHAR(16) DEFAULT 'none'"),
    ("confidence", "VARCHAR(16) DEFAULT 'medium'"),
    ("operator_action", "VARCHAR(16) DEFAULT 'defer'"),
    ("decision_needed_context", "TEXT"),
    ("backup_recovery_path", "TEXT DEFAULT 'No mutation performed.'"),
    ("write_back_status", "VARCHAR(32) DEFAULT 'review_gated'"),
    ("write_back_allowed", "BOOLEAN DEFAULT FALSE"),
    ("created_at", "TIMESTAMPTZ"),
    ("updated_at", "TIMESTAMPTZ"),
)

MEMORY_PROPOSAL_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("work_item_id", "VARCHAR(36)"),
    ("proposal_id", "VARCHAR(120)"),
    ("label", "VARCHAR(255)"),
    ("status", "VARCHAR(32) DEFAULT 'pending_human_approval'"),
    ("summary", "TEXT"),
    ("source_refs_json", "JSON DEFAULT '[]'"),
    ("evidence_refs_json", "JSON DEFAULT '[]'"),
    ("target_ref_json", "JSON"),
    ("target_vault_path", "TEXT"),
    ("target_vault_folder", "TEXT DEFAULT ''"),
    ("proposal_type", "VARCHAR(32) DEFAULT 'new_note'"),
    ("suggested_content_summary", "TEXT DEFAULT ''"),
    ("patch_summary", "TEXT"),
    ("sensitivity", "VARCHAR(16) DEFAULT 'medium'"),
    ("freshness", "VARCHAR(16) DEFAULT 'fresh'"),
    ("contradiction_status", "VARCHAR(16) DEFAULT 'none'"),
    ("confidence", "VARCHAR(16) DEFAULT 'medium'"),
    ("operator_action", "VARCHAR(16) DEFAULT 'defer'"),
    ("decision_needed_context", "TEXT"),
    ("backup_recovery_path", "TEXT DEFAULT 'No mutation performed.'"),
    ("write_back_status", "VARCHAR(32) DEFAULT 'review_gated'"),
    ("write_back_allowed", "BOOLEAN DEFAULT 0"),
    ("created_at", "DATETIME"),
    ("updated_at", "DATETIME"),
)

settings = get_settings()
engine: AsyncEngine = create_async_engine(settings.database_url, future=True, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

POSTGRES_OPERATIONAL_ACTION_MIGRATION_COLUMNS: tuple[tuple[str, str], ...] = (
    ("child_packet_id", "VARCHAR(80)"),
    ("expected_current_event_id", "VARCHAR(80)"),
    ("approval_id", "VARCHAR(120)"),
    ("schema_version", "VARCHAR(64) DEFAULT 'pipeline-operational-action/v0'"),
    ("action_context_json", "JSON"),
    ("action_context_digest_sha256", "VARCHAR(80)"),
    ("success_evidence_json", "JSON"),
)

POSTGRES_OPERATIONAL_APPROVAL_MIGRATION_COLUMNS: tuple[tuple[str, str], ...] = (
    ("schema_version", "VARCHAR(64) DEFAULT 'pipeline-operational-action/v0'"),
    ("action_context_json", "JSON"),
    ("action_context_digest_sha256", "VARCHAR(80)"),
)

EXECUTION_ATTEMPT_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("revision", "INTEGER NOT NULL DEFAULT 1"),
    ("launch_fence_token", "VARCHAR(64)"),
    ("launch_claimed_at", "TIMESTAMPTZ"),
)

EXECUTION_ATTEMPT_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("revision", "INTEGER NOT NULL DEFAULT 1"),
    ("launch_fence_token", "VARCHAR(64)"),
    ("launch_claimed_at", "DATETIME"),
)

DASHBOARD_SESSION_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("token_hash", "VARCHAR(64)"),
    ("csrf_token_hash", "VARCHAR(64)"),
    ("last_seen_at", "TIMESTAMPTZ"),
    ("expires_at", "TIMESTAMPTZ"),
    ("revoked_at", "TIMESTAMPTZ"),
)

DASHBOARD_SESSION_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("token_hash", "VARCHAR(64)"),
    ("csrf_token_hash", "VARCHAR(64)"),
    ("last_seen_at", "DATETIME"),
    ("expires_at", "DATETIME"),
    ("revoked_at", "DATETIME"),
)

# Existing bootstrap operators predate this field and must remain usable after
# the additive migration. A viewer is never inserted by migration/startup.
DASHBOARD_OPERATOR_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("enabled", "BOOLEAN NOT NULL DEFAULT TRUE"),
)

DASHBOARD_OPERATOR_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("enabled", "BOOLEAN NOT NULL DEFAULT 1"),
)

SUPERVISOR_CONTROL_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("revision", "INTEGER NOT NULL DEFAULT 1"),
)

SUPERVISOR_CONTROL_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("revision", "INTEGER NOT NULL DEFAULT 1"),
)

MEMORY_INBOX_MANIFEST_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("declared_media_type", "VARCHAR(128)"),
    ("inspected_media_type", "VARCHAR(128)"),
)

MEMORY_INBOX_MANIFEST_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("declared_media_type", "VARCHAR(128)"),
    ("inspected_media_type", "VARCHAR(128)"),
)

LOCAL_DOGFOOD_AUTHORIZATION_POSTGRES_COLUMNS: tuple[tuple[str, str], ...] = (
    ("issuer_id", "VARCHAR(120) DEFAULT 'legacy-untrusted'"),
    ("key_id", "VARCHAR(120) DEFAULT 'legacy-untrusted'"),
    ("public_key_b64", "VARCHAR(120) DEFAULT ''"),
    ("packet_schema", "VARCHAR(160) DEFAULT 'legacy-untrusted'"),
    ("target_ref", "VARCHAR(200) DEFAULT 'legacy-untrusted'"),
    ("source_revision", "VARCHAR(80) DEFAULT 'legacy-untrusted'"),
    ("source_refs", "VARCHAR(512) DEFAULT '[]'"),
    ("evidence_digest", "VARCHAR(80) DEFAULT 'legacy-untrusted'"),
    ("evidence_refs", "VARCHAR(512) DEFAULT '[]'"),
    ("run_id", "VARCHAR(80) DEFAULT 'legacy-untrusted'"),
    ("attempt_id", "VARCHAR(80) DEFAULT 'legacy-untrusted'"),
    ("policy_version", "VARCHAR(64) DEFAULT 'local-dogfood/v1'"),
    ("retention_policy", "VARCHAR(64) DEFAULT 'metadata_only'"),
    ("observer_id", "VARCHAR(120) DEFAULT 'local_unix_observer/v1'"),
    ("environment", "VARCHAR(32) DEFAULT 'local_dogfood'"),
    ("expires_at", "TIMESTAMPTZ DEFAULT '1970-01-01'"),
    ("revoked", "BOOLEAN DEFAULT TRUE"),
    ("observation_requested", "BOOLEAN DEFAULT TRUE"),
    ("observation_state", "VARCHAR(24) DEFAULT 'ready'"),
    ("observation_receipt_id", "VARCHAR(200)"),
    ("accepted_receipt_id", "VARCHAR(200)"),
    ("observation_lease_expires_at", "TIMESTAMPTZ"),
    ("created_at", "TIMESTAMPTZ DEFAULT NOW()"),
)

LOCAL_DOGFOOD_AUTHORIZATION_SQLITE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("issuer_id", "VARCHAR(120) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("key_id", "VARCHAR(120) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("public_key_b64", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("packet_schema", "VARCHAR(160) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("target_ref", "VARCHAR(200) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("source_revision", "VARCHAR(80) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("source_refs", "VARCHAR(512) NOT NULL DEFAULT '[]'"),
    ("evidence_digest", "VARCHAR(80) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("evidence_refs", "VARCHAR(512) NOT NULL DEFAULT '[]'"),
    ("run_id", "VARCHAR(80) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("attempt_id", "VARCHAR(80) NOT NULL DEFAULT 'legacy-untrusted'"),
    ("policy_version", "VARCHAR(64) DEFAULT 'local-dogfood/v1'"),
    ("retention_policy", "VARCHAR(64) DEFAULT 'metadata_only'"),
    ("observer_id", "VARCHAR(120) DEFAULT 'local_unix_observer/v1'"),
    ("environment", "VARCHAR(32) NOT NULL DEFAULT 'local_dogfood'"),
    ("expires_at", "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'"),
    ("revoked", "BOOLEAN NOT NULL DEFAULT 1"),
    ("observation_requested", "BOOLEAN NOT NULL DEFAULT 1"),
    ("observation_state", "VARCHAR(24) NOT NULL DEFAULT 'ready'"),
    ("observation_receipt_id", "VARCHAR(200)"),
    ("accepted_receipt_id", "VARCHAR(200)"),
    ("observation_lease_expires_at", "DATETIME"),
    ("created_at", "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'"),
)


async def _sqlite_table_columns(connection, table_name: str) -> set[str]:
    result = await connection.execute(text(f"PRAGMA table_info({table_name})"))
    return {row[1] for row in result.fetchall()}


async def _begin_sqlite_schema_migration(connection) -> None:
    """Serialize startup DDL and wait briefly for another initializer to finish."""

    await connection.execute(text("PRAGMA busy_timeout = 30000"))
    await connection.exec_driver_sql("BEGIN IMMEDIATE")


async def _sqlite_add_columns(
    connection,
    table_name: str,
    columns_to_add: tuple[tuple[str, str], ...],
) -> None:
    """Add legacy columns under the init lock, rechecking duplicate races."""

    columns = await _sqlite_table_columns(connection, table_name)
    for column_name, column_type in columns_to_add:
        if column_name in columns:
            continue
        try:
            await connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
        except OperationalError as exc:
            columns = await _sqlite_table_columns(connection, table_name)
            if column_name not in columns or "duplicate column name" not in str(exc).lower():
                raise
            continue
        columns.add(column_name)


async def _sqlite_unique_index_exists(connection, table_name: str, columns: tuple[str, ...]) -> bool:
    result = await connection.execute(text(f"PRAGMA index_list({table_name})"))
    for row in result.fetchall():
        index_name = row[1]
        is_unique = bool(row[2])
        if not is_unique:
            continue
        column_result = await connection.execute(text(f"PRAGMA index_info({index_name})"))
        index_columns = tuple(column_row[2] for column_row in column_result.fetchall())
        if index_columns == columns:
            return True
    return False


async def _ensure_postgres_memory_proposals_schema(connection) -> None:
    for column_name, column_type in MEMORY_PROPOSAL_POSTGRES_COLUMNS:
        await connection.execute(text(f"ALTER TABLE memory_proposals ADD COLUMN IF NOT EXISTS {column_name} {column_type}"))
    await connection.execute(
        text(
            """
            UPDATE memory_proposals
            SET
              status = COALESCE(status, 'pending_human_approval'),
              summary = COALESCE(summary, ''),
              source_refs_json = COALESCE(source_refs_json, '[]'::json),
              evidence_refs_json = COALESCE(evidence_refs_json, '[]'::json),
              target_vault_folder = COALESCE(target_vault_folder, ''),
              proposal_type = COALESCE(proposal_type, 'new_note'),
              suggested_content_summary = COALESCE(suggested_content_summary, ''),
              sensitivity = COALESCE(sensitivity, 'medium'),
              freshness = COALESCE(freshness, 'fresh'),
              contradiction_status = COALESCE(contradiction_status, 'none'),
              confidence = COALESCE(confidence, 'medium'),
              operator_action = COALESCE(operator_action, 'defer'),
              backup_recovery_path = COALESCE(backup_recovery_path, 'No mutation performed.'),
              write_back_status = COALESCE(write_back_status, 'review_gated'),
              write_back_allowed = COALESCE(write_back_allowed, FALSE),
              created_at = COALESCE(created_at, NOW()),
              updated_at = COALESCE(updated_at, NOW())
            """
        )
    )
    await connection.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_memory_proposals_work_item_proposal "
            "ON memory_proposals (work_item_id, proposal_id)"
        )
    )


async def _ensure_sqlite_memory_proposals_schema(connection) -> None:
    await _sqlite_add_columns(connection, "memory_proposals", MEMORY_PROPOSAL_SQLITE_COLUMNS)
    await connection.execute(
        text(
            """
            UPDATE memory_proposals
            SET
              status = COALESCE(status, 'pending_human_approval'),
              summary = COALESCE(summary, ''),
              source_refs_json = COALESCE(source_refs_json, '[]'),
              evidence_refs_json = COALESCE(evidence_refs_json, '[]'),
              target_vault_folder = COALESCE(target_vault_folder, ''),
              proposal_type = COALESCE(proposal_type, 'new_note'),
              suggested_content_summary = COALESCE(suggested_content_summary, ''),
              sensitivity = COALESCE(sensitivity, 'medium'),
              freshness = COALESCE(freshness, 'fresh'),
              contradiction_status = COALESCE(contradiction_status, 'none'),
              confidence = COALESCE(confidence, 'medium'),
              operator_action = COALESCE(operator_action, 'defer'),
              backup_recovery_path = COALESCE(backup_recovery_path, 'No mutation performed.'),
              write_back_status = COALESCE(write_back_status, 'review_gated'),
              write_back_allowed = COALESCE(write_back_allowed, 0),
              created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
              updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
            """
        )
    )
    if not await _sqlite_unique_index_exists(connection, "memory_proposals", ("work_item_id", "proposal_id")):
        await connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_memory_proposals_work_item_proposal "
                "ON memory_proposals (work_item_id, proposal_id)"
            )
        )


async def init_db() -> None:
    from supervisor.infrastructure.db import models  # noqa: F401

    async with engine.begin() as connection:
        dialect = connection.dialect.name
        if dialect == "sqlite":
            await _begin_sqlite_schema_migration(connection)
        await connection.run_sync(Base.metadata.create_all)
        if dialect == "sqlite":
            await _sqlite_add_columns(connection, "memory_inbox_manifests", MEMORY_INBOX_MANIFEST_SQLITE_COLUMNS)
        elif dialect == "postgresql":
            for column_name, column_type in MEMORY_INBOX_MANIFEST_POSTGRES_COLUMNS:
                await connection.execute(
                    text(f"ALTER TABLE memory_inbox_manifests ADD COLUMN IF NOT EXISTS {column_name} {column_type}")
                )
        await connection.execute(
            text(
                "INSERT INTO admission_locks (scope, generation) VALUES ('execute', 0) "
                "ON CONFLICT (scope) DO NOTHING"
            )
        )
        await connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_retry_intents_pending_work_item "
                "ON verification_retry_intents(work_item_id) WHERE status = 'pending'"
            )
        )
        if dialect == "postgresql":
            for column_name, column_type in DASHBOARD_OPERATOR_POSTGRES_COLUMNS:
                await connection.execute(text(f"ALTER TABLE dashboard_operators ADD COLUMN IF NOT EXISTS {column_name} {column_type}"))
            for column_name, column_type in DASHBOARD_SESSION_POSTGRES_COLUMNS:
                await connection.execute(text(f"ALTER TABLE dashboard_sessions ADD COLUMN IF NOT EXISTS {column_name} {column_type}"))
            await connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_sessions_token_hash "
                    "ON dashboard_sessions(token_hash)"
                )
            )
            for column_name, column_type in SUPERVISOR_CONTROL_POSTGRES_COLUMNS:
                await connection.execute(
                    text(f"ALTER TABLE supervisor_control ADD COLUMN IF NOT EXISTS {column_name} {column_type}")
                )
            await connection.execute(text("ALTER TABLE supervisor_control ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ"))
            await connection.execute(
                text("UPDATE supervisor_control SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL")
            )
            await connection.execute(text("ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS actor_label VARCHAR(120)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS assignee_id VARCHAR(100)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS assignee_label VARCHAR(120)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS authoritative_packet_id VARCHAR(80)"))
            await connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_work_items_authoritative_packet "
                    "ON work_items(authoritative_packet_id) WHERE authoritative_packet_id IS NOT NULL"
                )
            )
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalation_reason TEXT"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalated_by_id VARCHAR(100)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalated_by_label VARCHAR(120)"))
            await connection.execute(text("ALTER TABLE execution_attempts ADD COLUMN IF NOT EXISTS workspace_isolation_plan_json JSON"))
            await connection.execute(text("ALTER TABLE execution_attempts ADD COLUMN IF NOT EXISTS queue_lease_id VARCHAR(36)"))
            await connection.execute(text("ALTER TABLE execution_attempts ADD COLUMN IF NOT EXISTS queue_fencing_token INTEGER"))
            for column_name, column_type in EXECUTION_ATTEMPT_POSTGRES_COLUMNS:
                await connection.execute(
                    text(f"ALTER TABLE execution_attempts ADD COLUMN IF NOT EXISTS {column_name} {column_type}")
                )
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS packet_title VARCHAR(255)"))
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS parent_packet_id VARCHAR(80)"))
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS lineage_kind VARCHAR(32)"))
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS ready_to_test_json JSON"))
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS operator_test_state VARCHAR(24)"))
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS operator_test_note TEXT"))
            await connection.execute(text("ALTER TABLE authoritative_work_packet_lifecycle_events ADD COLUMN IF NOT EXISTS parallel_work_graph_json JSON"))
            await connection.execute(text("ALTER TABLE queue_lease_actions ADD COLUMN IF NOT EXISTS provided_fencing_token INTEGER"))
            await connection.execute(text("ALTER TABLE queue_lease_actions ADD COLUMN IF NOT EXISTS outcome VARCHAR(16) DEFAULT 'accepted'"))
            await connection.execute(text("ALTER TABLE queue_lease_actions ADD COLUMN IF NOT EXISTS rejection_reason TEXT"))
            await connection.execute(text("ALTER TABLE candidate_work ADD COLUMN IF NOT EXISTS sort_order INTEGER"))
            await connection.execute(text("ALTER TABLE candidate_work ADD COLUMN IF NOT EXISTS import_metadata_json JSON"))
            await connection.execute(text("ALTER TABLE authoritative_work_packets ADD COLUMN IF NOT EXISTS parent_packet_id VARCHAR(80)"))
            await connection.execute(text("ALTER TABLE authoritative_work_packets ADD COLUMN IF NOT EXISTS lineage_kind VARCHAR(32) DEFAULT 'root'"))
            await connection.execute(text("ALTER TABLE authoritative_work_packets ADD COLUMN IF NOT EXISTS ready_to_test_json JSON"))
            await connection.execute(text("ALTER TABLE authoritative_work_packets ADD COLUMN IF NOT EXISTS operator_test_state VARCHAR(24) DEFAULT 'not_ready'"))
            await connection.execute(text("ALTER TABLE authoritative_work_packets ADD COLUMN IF NOT EXISTS operator_test_note TEXT"))
            for column_name, column_type in POSTGRES_OPERATIONAL_ACTION_MIGRATION_COLUMNS:
                await connection.execute(
                    text(
                        "ALTER TABLE pipeline_operational_action_records "
                        f"ADD COLUMN IF NOT EXISTS {column_name} {column_type}"
                    )
                )
            for column_name, column_type in POSTGRES_OPERATIONAL_APPROVAL_MIGRATION_COLUMNS:
                await connection.execute(
                    text(
                        "ALTER TABLE pipeline_operational_approvals "
                        f"ADD COLUMN IF NOT EXISTS {column_name} {column_type}"
                    )
                )
            for column_name, column_type in LOCAL_DOGFOOD_AUTHORIZATION_POSTGRES_COLUMNS:
                await connection.execute(text(
                    "ALTER TABLE local_dogfood_attestation_authorizations "
                    f"ADD COLUMN IF NOT EXISTS {column_name} {column_type}"
                ))
            await connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_local_dogfood_authorizations_target_created "
                "ON local_dogfood_attestation_authorizations(target_ref, created_at)"
            ))
            await connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_local_dogfood_accepted_receipt_per_authorization "
                "ON local_dogfood_attestation_receipt_decisions(authorization_id) WHERE accepted"
            ))
            await _ensure_postgres_memory_proposals_schema(connection)
        elif dialect == "sqlite":
            await _sqlite_add_columns(connection, "dashboard_operators", DASHBOARD_OPERATOR_SQLITE_COLUMNS)
            await _sqlite_add_columns(connection, "dashboard_sessions", DASHBOARD_SESSION_SQLITE_COLUMNS)
            await connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_sessions_token_hash "
                    "ON dashboard_sessions(token_hash)"
                )
            )
            await _sqlite_add_columns(
                connection,
                "supervisor_control",
                SUPERVISOR_CONTROL_SQLITE_COLUMNS + (("updated_at", "DATETIME"),),
            )
            await connection.execute(
                text("UPDATE supervisor_control SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
            )
            await _sqlite_add_columns(connection, "workflow_events", (("actor_label", "VARCHAR(120)"),))
            await _sqlite_add_columns(
                connection,
                "work_items",
                (
                    ("authoritative_packet_id", "VARCHAR(80)"),
                    ("assignee_id", "VARCHAR(100)"),
                    ("assignee_label", "VARCHAR(120)"),
                    ("escalated_at", "DATETIME"),
                    ("escalation_reason", "TEXT"),
                    ("escalated_by_id", "VARCHAR(100)"),
                    ("escalated_by_label", "VARCHAR(120)"),
                ),
            )
            await connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_work_items_authoritative_packet "
                    "ON work_items(authoritative_packet_id) WHERE authoritative_packet_id IS NOT NULL"
                )
            )
            await _sqlite_add_columns(
                connection,
                "execution_attempts",
                (
                    ("workspace_isolation_plan_json", "JSON"),
                    ("queue_lease_id", "VARCHAR(36)"),
                    ("queue_fencing_token", "INTEGER"),
                ) + EXECUTION_ATTEMPT_SQLITE_COLUMNS,
            )
            await _sqlite_add_columns(
                connection,
                "authoritative_work_packet_lifecycle_events",
                (
                    ("packet_title", "VARCHAR(255)"),
                    ("parent_packet_id", "VARCHAR(80)"),
                    ("lineage_kind", "VARCHAR(32)"),
                    ("ready_to_test_json", "JSON"),
                    ("operator_test_state", "VARCHAR(24)"),
                    ("operator_test_note", "VARCHAR(255)"),
                    ("parallel_work_graph_json", "JSON"),
                ),
            )
            await _sqlite_add_columns(
                connection,
                "queue_lease_actions",
                (
                    ("provided_fencing_token", "INTEGER"),
                    ("outcome", "VARCHAR(16) DEFAULT 'accepted'"),
                    ("rejection_reason", "TEXT"),
                ),
            )
            await _sqlite_add_columns(
                connection,
                "candidate_work",
                (("sort_order", "INTEGER DEFAULT 0"), ("import_metadata_json", "JSON DEFAULT '{}'")),
            )
            await _sqlite_add_columns(
                connection,
                "authoritative_work_packets",
                (
                    ("parent_packet_id", "VARCHAR(80)"),
                    ("lineage_kind", "VARCHAR(32) DEFAULT 'root'"),
                    ("ready_to_test_json", "JSON"),
                    ("operator_test_state", "VARCHAR(24) DEFAULT 'not_ready'"),
                    ("operator_test_note", "TEXT"),
                ),
            )
            await _sqlite_add_columns(
                connection,
                "pipeline_operational_action_records",
                (
                    ("child_packet_id", "VARCHAR(80)"),
                    ("expected_current_event_id", "VARCHAR(80)"),
                    ("approval_id", "VARCHAR(120)"),
                    ("schema_version", "VARCHAR(64) DEFAULT 'pipeline-operational-action/v0'"),
                    ("action_context_json", "JSON"),
                    ("action_context_digest_sha256", "VARCHAR(80)"),
                    ("success_evidence_json", "JSON"),
                ),
            )
            await _sqlite_add_columns(
                connection,
                "pipeline_operational_approvals",
                (
                    ("schema_version", "VARCHAR(64) DEFAULT 'pipeline-operational-action/v0'"),
                    ("action_context_json", "JSON"),
                    ("action_context_digest_sha256", "VARCHAR(80)"),
                ),
            )
            await _ensure_sqlite_memory_proposals_schema(connection)
            await _sqlite_add_columns(
                connection,
                "local_dogfood_attestation_authorizations",
                LOCAL_DOGFOOD_AUTHORIZATION_SQLITE_COLUMNS,
            )
            await connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_local_dogfood_authorizations_target_created "
                "ON local_dogfood_attestation_authorizations(target_ref, created_at)"
            ))
            await connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_local_dogfood_accepted_receipt_per_authorization "
                "ON local_dogfood_attestation_receipt_decisions(authorization_id) WHERE accepted = 1"
            ))
        # Seed the singleton after dialect-specific migrations so this is also
        # safe for an older database that needs the revision column added first.
        # The conflict clause makes repeated startup and concurrent first
        # initialization idempotent on both supported dialects.
        await connection.execute(
            text(
                "INSERT INTO supervisor_control (id, mode, revision, updated_at) "
                "VALUES (1, 'running', 1, CURRENT_TIMESTAMP) "
                "ON CONFLICT (id) DO NOTHING"
            )
        )


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
