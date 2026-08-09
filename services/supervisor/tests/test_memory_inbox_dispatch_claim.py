from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_dispatch_claim import claim_processing_dispatch
from supervisor.application.memory_inbox_processing_disclosure import accept_processing_disclosure, present_processing_disclosure
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxSource, MemoryInboxSourceRevision


@pytest.mark.asyncio
async def test_dispatch_claim_is_exact_and_replays_without_a_second_attempt(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'claim.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        source = MemoryInboxSource(id="inbox-source:claim", current_revision=2, lifecycle_state="Draft", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None", policy_ref="memory-inbox-retention-v1")
        revision = MemoryInboxSourceRevision(id="inbox-source-revision:claim", source_id=source.id, revision=2, lifecycle_state="Draft", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        session.add_all((source, revision))
        await session.commit()
        disclosure = await present_processing_disclosure(session, source_id=source.id, expected_revision=2, idempotency_key="disclosure-key-claim", actor_ref="operator:verified")
        await accept_processing_disclosure(session, disclosure_id=disclosure["disclosureId"], actor_ref="operator:verified")
        claim = await claim_processing_dispatch(session, disclosure_id=disclosure["disclosureId"], actor_ref="operator:verified")
        replay = await claim_processing_dispatch(session, disclosure_id=disclosure["disclosureId"], actor_ref="operator:verified")
        assert claim["lifecycleState"] == "Claimed"
        assert replay == {**claim, "replayed": True}
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "Processing"
    await engine.dispose()
