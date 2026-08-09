from datetime import datetime, timedelta, timezone
import os

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_proposal_reader import read_authorized_proposal
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import (
    MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxProposalReaderGrant,
    MemoryInboxProposalRevision, MemoryInboxSource,
)
from supervisor.infrastructure.private_content_store import PrivateContentStore


@pytest.mark.asyncio
async def test_reader_requires_an_enabled_exact_revision_grant_and_proposal_manifest(tmp_path) -> None:
    root = tmp_path / "private"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:proposal-reader", "# Private proposal\n\nOnly this article may render this body.")
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'reader.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        deadline = datetime.now(timezone.utc) + timedelta(hours=1)
        source = MemoryInboxSource(id="source:reader", current_revision=2, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test")
        proposal = MemoryInboxProposalAggregate(id="proposal:reader", source_id=source.id, current_revision=1, lifecycle_state="Ready")
        revision = MemoryInboxProposalRevision(id="proposal-revision:reader", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:test", audit_ref="audit:test")
        grant = MemoryInboxProposalReaderGrant(id="reader-grant:reader", proposal_revision_id=revision.id, capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:test")
        manifest = MemoryInboxManifest(id="manifest:proposal-reader", owner_revision_id=revision.id, copy_class="proposal_body", store_ref="inbox-store:proposal-reader", creation_state="Created", retention_class="proposal_retention", deletion_state="None")
        session.add_all((source, proposal, revision, grant, manifest))
        await session.commit()
        disabled = Settings(SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root), SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24)
        with pytest.raises(ValueError, match="proposal_reader_unavailable"):
            await read_authorized_proposal(session, settings=disabled, proposal_id=proposal.id, revision=1)
        enabled = Settings(SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root), SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24, SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True, SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader")
        result = await read_authorized_proposal(session, settings=enabled, proposal_id=proposal.id, revision=1)
        assert result.proposal_id == proposal.id
        assert result.revision == 1
        assert result.body == "# Private proposal\n\nOnly this article may render this body."
    await engine.dispose()
