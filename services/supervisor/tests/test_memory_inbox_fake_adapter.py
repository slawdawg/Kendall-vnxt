from datetime import datetime, timedelta, timezone
import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_fake_adapter import materialize_fake_local_proposal
from supervisor.config.settings import Settings
from supervisor.domain.memory_inbox_fake_adapter import decide_fake_local_adapter
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import (
    MemoryInboxManifest, MemoryInboxProcessingAttempt, MemoryInboxProposalAggregate,
    MemoryInboxProposalReaderGrant, MemoryInboxProposalRevision, MemoryInboxSource,
    MemoryInboxSourceRevision,
)
from supervisor.infrastructure.private_content_store import PrivateContentStore


@pytest.mark.asyncio
async def test_fake_local_success_materializes_only_through_registered_manifest(tmp_path) -> None:
    root = tmp_path / "private"; root.mkdir(mode=0o700); os.chmod(root, 0o700)
    settings = Settings(SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root), SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24, SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True, SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader")
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'fake-adapter.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        now = datetime.now(timezone.utc)
        source = MemoryInboxSource(id="source:fake", current_revision=2, lifecycle_state="Processing", retention_deadline_at=now + timedelta(hours=1), deletion_state="None", policy_ref="policy:test")
        source_revision = MemoryInboxSourceRevision(id="source-revision:fake", source_id=source.id, revision=1, lifecycle_state="Unprocessed", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        proposal = MemoryInboxProposalAggregate(id="proposal:fake", source_id=source.id, current_revision=1, lifecycle_state="Draft")
        proposal_revision = MemoryInboxProposalRevision(id="proposal-revision:fake", proposal_id=proposal.id, revision=1, lifecycle_state="Draft", actor_ref="operator:seed", audit_ref="audit:seed")
        manifest = MemoryInboxManifest(id="manifest:fake", owner_revision_id=proposal_revision.id, copy_class="proposal_body", store_ref="inbox-store:fake", creation_state="Planned", retention_class="proposal_retention", deletion_state="None")
        attempt = MemoryInboxProcessingAttempt(id="attempt:fake", source_revision_id=source_revision.id, proposal_revision_id=proposal_revision.id, consent_ref="receipt:fake", provider_code="local.fake", attempt_sequence=1, lifecycle_state="Claimed")
        session.add_all((source, source_revision, proposal, proposal_revision, manifest, attempt)); await session.commit()
        assert await materialize_fake_local_proposal(session, settings=settings, attempt_id=attempt.id, proposal_body="Generated proposal", actor_ref="fake:local") == proposal.id
        assert (await session.get(MemoryInboxSource, source.id)).lifecycle_state == "Review"
        assert (await session.get(MemoryInboxProposalAggregate, proposal.id)).lifecycle_state == "Ready"
        assert (await session.get(MemoryInboxProcessingAttempt, attempt.id)).lifecycle_state == "Closed"
        assert (await session.get(MemoryInboxManifest, manifest.id)).creation_state == "Created"
        assert PrivateContentStore(str(root)).read_for_proposal_reader(manifest.store_ref, maximum_bytes=1024) == "Generated proposal"
        assert len((await session.scalars(select(MemoryInboxProposalReaderGrant))).all()) == 1
    await engine.dispose()


def test_fake_adapter_fallback_contract_never_activates_cloud() -> None:
    assert decide_fake_local_adapter(outcome="local_success", fresh_authorization_and_cost=True).route == "materialize_local"
    fallback = decide_fake_local_adapter(outcome="unavailable", fresh_authorization_and_cost=True)
    assert fallback.route == "consider_openai" and fallback.provider == "openai" and not fallback.execution_enabled
    assert decide_fake_local_adapter(provider="openai", outcome="capacity_timeout", fresh_authorization_and_cost=True).route == "consider_anthropic"
    assert decide_fake_local_adapter(provider="anthropic", outcome="unsupported_capability", fresh_authorization_and_cost=True).route == "blocked"
    assert decide_fake_local_adapter(outcome="blocked", fresh_authorization_and_cost=True).route == "blocked"
    assert decide_fake_local_adapter(outcome="unavailable", fresh_authorization_and_cost=False).route == "blocked"
