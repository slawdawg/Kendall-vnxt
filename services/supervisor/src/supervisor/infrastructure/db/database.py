from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from supervisor.config.settings import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine: AsyncEngine = create_async_engine(settings.database_url, future=True, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


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


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
