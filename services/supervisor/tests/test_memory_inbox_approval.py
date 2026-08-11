from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_approval import approve_proposal_for_deletion
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxProposalRevision, MemoryInboxSource, MemoryInboxSourceRevision


@pytest.mark.asyncio
async def test_approval_locks_exact_ready_revision_and_enqueues_each_source_copy_once(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'approval.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        deadline = datetime.now(timezone.utc) + timedelta(hours=1)
        source = MemoryInboxSource(id="source:approval", current_revision=2, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test")
        source_revision = MemoryInboxSourceRevision(id="source-revision:approval", source_id=source.id, revision=2, lifecycle_state="Review", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        proposal = MemoryInboxProposalAggregate(id="proposal:approval", source_id=source.id, current_revision=1, lifecycle_state="Ready")
        proposal_revision = MemoryInboxProposalRevision(id="proposal-revision:approval", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:seed", audit_ref="audit:seed")
        session.add_all((source, source_revision, proposal, proposal_revision, MemoryInboxManifest(id="manifest:one", source_revision_id=source_revision.id, copy_class="quarantine", store_ref="inbox-store:approval-one", creation_state="Created", retention_class="source_retention", deletion_state="None"), MemoryInboxManifest(id="manifest:two", source_revision_id=source_revision.id, copy_class="preview", store_ref="inbox-store:approval-two", creation_state="Created", retention_class="source_retention", deletion_state="None"), MemoryInboxManifest(id="manifest:proposal", proposal_revision_id=proposal_revision.id, copy_class="proposal_body", store_ref="inbox-store:approval-proposal", creation_state="Created", retention_class="proposal_retention", deletion_state="None")))
        await session.commit()
        approved = await approve_proposal_for_deletion(session, proposal_id=proposal.id, expected_revision=1, idempotency_key="approval-key-0001", actor_ref="operator:verified")
        replay = await approve_proposal_for_deletion(session, proposal_id=proposal.id, expected_revision=1, idempotency_key="approval-key-0001", actor_ref="operator:verified")
        assert approved.deletion_operations == 3 and replay.replayed
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "DeletePending"
        assert (await session.get(MemoryInboxSource, source.id)).deletion_state == "Pending"
        assert (await session.get(MemoryInboxProposalAggregate, proposal.id)).lifecycle_state == "Approved"
    await engine.dispose()
