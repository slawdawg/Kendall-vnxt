from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_processing_disclosure import accept_processing_disclosure, present_processing_disclosure
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxSource, MemoryInboxSourceRevision


@pytest.mark.asyncio
async def test_disclosure_binds_one_safe_source_revision_and_disabled_policy(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'disclosure.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        source = MemoryInboxSource(
            id="inbox-source:disclosure", current_revision=2, lifecycle_state="Draft",
            retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None",
            policy_ref="memory-inbox-retention-v1",
        )
        revision = MemoryInboxSourceRevision(
            id="inbox-source-revision:disclosure", source_id=source.id, revision=2,
            lifecycle_state="Draft", actor_ref="operator:seed", audit_ref="audit:seed",
            policy_ref=source.policy_ref,
        )
        session.add_all((source, revision))
        await session.commit()
        disclosure = await present_processing_disclosure(
            session, source_id=source.id, expected_revision=2, idempotency_key="disclosure-key-0001",
            actor_ref="operator:verified",
        )
        replay = await present_processing_disclosure(
            session, source_id=source.id, expected_revision=2, idempotency_key="disclosure-key-0001",
            actor_ref="operator:verified",
        )
        accepted = await accept_processing_disclosure(session, disclosure_id=disclosure["disclosureId"], actor_ref="operator:verified")
        replayed_acceptance = await accept_processing_disclosure(session, disclosure_id=disclosure["disclosureId"], actor_ref="operator:verified")
        assert disclosure["providerOrder"] == ["local", "openai", "anthropic"]
        assert disclosure["providerActivation"] == "disabled_by_default"
        assert disclosure["noWriteGuarantee"] is True
        assert replay["replayed"] is True
        assert accepted["lifecycleState"] == "Accepted"
        assert replayed_acceptance["replayed"] is True
        assert accepted["nextSafeAction"] == "dispatch_unavailable"
    await engine.dispose()


@pytest.mark.asyncio
async def test_disclosure_rejects_stale_and_quarantined_sources(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'blocked.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        source = MemoryInboxSource(
            id="inbox-source:blocked", current_revision=2, lifecycle_state="Quarantined",
            retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None",
            policy_ref="memory-inbox-retention-v1",
        )
        session.add(source)
        await session.commit()
        with pytest.raises(ValueError, match="disclosure_source_not_safe"):
            await present_processing_disclosure(
                session, source_id=source.id, expected_revision=2, idempotency_key="disclosure-key-0002",
                actor_ref="operator:verified",
            )
        with pytest.raises(ValueError, match="disclosure_source_revision_mismatch"):
            await present_processing_disclosure(
                session, source_id=source.id, expected_revision=3, idempotency_key="disclosure-key-0003",
                actor_ref="operator:verified",
            )
    await engine.dispose()
