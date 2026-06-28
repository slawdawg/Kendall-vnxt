from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
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
    ("decision_actor_id", "VARCHAR(120)"),
    ("decision_actor_label", "VARCHAR(120)"),
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
    ("decision_actor_id", "VARCHAR(120)"),
    ("decision_actor_label", "VARCHAR(120)"),
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


async def _sqlite_table_columns(connection, table_name: str) -> set[str]:
    result = await connection.execute(text(f"PRAGMA table_info({table_name})"))
    return {row[1] for row in result.fetchall()}


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
    columns = await _sqlite_table_columns(connection, "memory_proposals")
    for column_name, column_type in MEMORY_PROPOSAL_SQLITE_COLUMNS:
        if column_name not in columns:
            await connection.execute(text(f"ALTER TABLE memory_proposals ADD COLUMN {column_name} {column_type}"))
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
        await connection.run_sync(Base.metadata.create_all)
        dialect = connection.dialect.name
        if dialect == "postgresql":
            await connection.execute(text("ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS actor_label VARCHAR(120)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS assignee_id VARCHAR(100)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS assignee_label VARCHAR(120)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalation_reason TEXT"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalated_by_id VARCHAR(100)"))
            await connection.execute(text("ALTER TABLE work_items ADD COLUMN IF NOT EXISTS escalated_by_label VARCHAR(120)"))
            await connection.execute(text("ALTER TABLE execution_attempts ADD COLUMN IF NOT EXISTS workspace_isolation_plan_json JSON"))
            await connection.execute(text("ALTER TABLE candidate_work ADD COLUMN IF NOT EXISTS sort_order INTEGER"))
            await connection.execute(text("ALTER TABLE candidate_work ADD COLUMN IF NOT EXISTS import_metadata_json JSON"))
            await _ensure_postgres_memory_proposals_schema(connection)
        elif dialect == "sqlite":
            result = await connection.execute(text("PRAGMA table_info(workflow_events)"))
            column_names = {row[1] for row in result.fetchall()}
            if "actor_label" not in column_names:
                await connection.execute(text("ALTER TABLE workflow_events ADD COLUMN actor_label VARCHAR(120)"))
            result = await connection.execute(text("PRAGMA table_info(work_items)"))
            item_columns = {row[1] for row in result.fetchall()}
            if "assignee_id" not in item_columns:
                await connection.execute(text("ALTER TABLE work_items ADD COLUMN assignee_id VARCHAR(100)"))
            if "assignee_label" not in item_columns:
                await connection.execute(text("ALTER TABLE work_items ADD COLUMN assignee_label VARCHAR(120)"))
            if "escalated_at" not in item_columns:
                await connection.execute(text("ALTER TABLE work_items ADD COLUMN escalated_at DATETIME"))
            if "escalation_reason" not in item_columns:
                await connection.execute(text("ALTER TABLE work_items ADD COLUMN escalation_reason TEXT"))
            if "escalated_by_id" not in item_columns:
                await connection.execute(text("ALTER TABLE work_items ADD COLUMN escalated_by_id VARCHAR(100)"))
            if "escalated_by_label" not in item_columns:
                await connection.execute(text("ALTER TABLE work_items ADD COLUMN escalated_by_label VARCHAR(120)"))
            result = await connection.execute(text("PRAGMA table_info(execution_attempts)"))
            attempt_columns = {row[1] for row in result.fetchall()}
            if "workspace_isolation_plan_json" not in attempt_columns:
                await connection.execute(text("ALTER TABLE execution_attempts ADD COLUMN workspace_isolation_plan_json JSON"))
            result = await connection.execute(text("PRAGMA table_info(candidate_work)"))
            candidate_columns = {row[1] for row in result.fetchall()}
            if "sort_order" not in candidate_columns:
                await connection.execute(text("ALTER TABLE candidate_work ADD COLUMN sort_order INTEGER DEFAULT 0"))
            if "import_metadata_json" not in candidate_columns:
                await connection.execute(text("ALTER TABLE candidate_work ADD COLUMN import_metadata_json JSON DEFAULT '{}'"))
            await _ensure_sqlite_memory_proposals_schema(connection)


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
