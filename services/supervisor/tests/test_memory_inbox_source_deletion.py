from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_source_deletion import delete_source_by_operator, expire_source_for_retention, retry_source_deletion
from supervisor.application.memory_inbox_deletion_receipt import read_deletion_receipt
from supervisor.application.memory_inbox_retention import extend_source_retention
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import (
    MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxProposalReaderGrant,
    MemoryInboxProposalRevision, MemoryInboxSource, MemoryInboxSourceRevision,
    MemoryInboxDeletionOperation, MemoryInboxDeletionProof,
    MemoryInboxProcessingDisclosure,
)


async def _seed_source(session, *, source_id: str, deadline: datetime) -> tuple[MemoryInboxSource, MemoryInboxProposalReaderGrant]:
    source = MemoryInboxSource(id=source_id, current_revision=2, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test")
    source_revision = MemoryInboxSourceRevision(id=f"revision:{source_id}", source_id=source.id, revision=2, lifecycle_state="Review", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
    proposal = MemoryInboxProposalAggregate(id=f"proposal:{source_id}", source_id=source.id, current_revision=1, lifecycle_state="Ready")
    proposal_revision = MemoryInboxProposalRevision(id=f"proposal-revision:{source_id}", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:seed", audit_ref="audit:seed")
    grant = MemoryInboxProposalReaderGrant(id=f"grant:{source_id}", proposal_revision_id=proposal_revision.id, capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:seed")
    manifest = MemoryInboxManifest(id=f"manifest:{source_id}", source_revision_id=source_revision.id, copy_class="quarantine", store_ref=f"inbox-store:{source_id}", creation_state="Created", retention_class="source_retention", deletion_state="None")
    session.add_all((source, source_revision, proposal, proposal_revision, grant, manifest))
    await session.commit()
    return source, grant


@pytest.mark.asyncio
async def test_operator_source_delete_uses_the_shared_barrier_and_replays_once(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'operator-delete.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source, grant = await _seed_source(session, source_id="source:operator-delete", deadline=datetime.now(timezone.utc) + timedelta(hours=1))
        accepted = await delete_source_by_operator(session, source_id=source.id, expected_revision=2, idempotency_key="operator-delete-key-0001", actor_ref="operator:test")
        replay = await delete_source_by_operator(session, source_id=source.id, expected_revision=2, idempotency_key="operator-delete-key-0001", actor_ref="operator:test")
        updated_source = await session.get(MemoryInboxSource, source.id)
        updated_grant = await session.get(MemoryInboxProposalReaderGrant, grant.id)
        assert accepted.deletion_operations == 1 and not accepted.replayed
        assert replay.replayed and replay.deletion_operations == 1
        assert updated_source.lifecycle_state == "DeletePending" and updated_source.deletion_state == "Pending"
        assert updated_grant.lifecycle_state == "Revoked" and updated_grant.revoked_at is not None
    await engine.dispose()


@pytest.mark.asyncio
async def test_retention_extension_is_version_locked_and_invalidates_old_disclosures(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'retention-extension.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        deadline = datetime.now(timezone.utc) + timedelta(hours=2)
        source, _ = await _seed_source(session, source_id="source:extension", deadline=deadline)
        disclosure = MemoryInboxProcessingDisclosure(id="disclosure:extension", source_revision_id=f"revision:{source.id}", source_revision=2, policy_id="policy:extension", policy_revision=1, retention_deadline_at=deadline, lifecycle_state="Accepted", idempotency_key="disclosure-extension-0001", actor_ref="operator:seed", receipt_ref="receipt:extension")
        session.add(disclosure); await session.commit()
        extended = await extend_source_retention(session, source_id=source.id, expected_revision=2, extension_hours=3, idempotency_key="retention-extension-0001", actor_ref="operator:test")
        replay = await extend_source_retention(session, source_id=source.id, expected_revision=2, extension_hours=3, idempotency_key="retention-extension-0001", actor_ref="operator:test")
        assert extended.source_revision == 3 and replay.replayed
        assert extended.retention_deadline_at == deadline + timedelta(hours=3)
        assert (await session.get(MemoryInboxProcessingDisclosure, disclosure.id)).lifecycle_state == "Invalidated"
    await engine.dispose()


@pytest.mark.asyncio
async def test_deletion_retry_requeues_only_existing_retry_needed_operations(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'retry-delete.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source = MemoryInboxSource(id="source:retry", current_revision=3, lifecycle_state="DeletePending", retention_deadline_at=datetime.now(timezone.utc), deletion_state="RetryNeeded", policy_ref="policy:test")
        revision = MemoryInboxSourceRevision(id="revision:retry", source_id=source.id, revision=3, lifecycle_state="DeletePending", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=source.policy_ref)
        manifest = MemoryInboxManifest(id="manifest:retry", source_revision_id=revision.id, copy_class="quarantine", store_ref="inbox-store:retry", creation_state="Created", retention_class="source_retention", deletion_state="None")
        operation = MemoryInboxDeletionOperation(id="operation:retry", manifest_id=manifest.id, lifecycle_state="RetryNeeded")
        session.add_all((source, revision, manifest, operation)); await session.commit()
        accepted = await retry_source_deletion(session, source_id=source.id, expected_revision=3, idempotency_key="deletion-retry-key-0001", actor_ref="operator:test")
        replay = await retry_source_deletion(session, source_id=source.id, expected_revision=3, idempotency_key="deletion-retry-key-0001", actor_ref="operator:test")
        assert accepted.initiator == "retry" and accepted.deletion_operations == 1
        assert replay.replayed
        assert (await session.get(MemoryInboxSource, source.id)).deletion_state == "Pending"
        assert (await session.get(MemoryInboxDeletionOperation, operation.id)).lifecycle_state == "Planned"
    await engine.dispose()


@pytest.mark.asyncio
async def test_deletion_receipt_exposes_only_proven_terminal_outcome_metadata(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'receipt.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source = MemoryInboxSource(id="source:receipt", current_revision=3, lifecycle_state="Deleted", retention_deadline_at=datetime.now(timezone.utc), deletion_state="Proven", policy_ref="policy:test")
        source_revision = MemoryInboxSourceRevision(id="revision:receipt", source_id=source.id, revision=3, lifecycle_state="Deleted", actor_ref="worker:test", audit_ref="audit:test", policy_ref=source.policy_ref)
        proposal = MemoryInboxProposalAggregate(id="proposal:receipt", source_id=source.id, current_revision=2, lifecycle_state="Approved")
        manifest = MemoryInboxManifest(id="manifest:receipt", source_revision_id=source_revision.id, copy_class="quarantine", store_ref="inbox-store:receipt", creation_state="Created", retention_class="source_retention", deletion_state="Proven")
        operation = MemoryInboxDeletionOperation(id="operation:receipt", manifest_id=manifest.id, lifecycle_state="Proven")
        proof = MemoryInboxDeletionProof(id="proof:receipt", deletion_operation_id=operation.id, proof_ref="receipt:opaque", lifecycle_state="Proven")
        session.add_all((source, source_revision, proposal, manifest, operation, proof)); await session.commit()
        receipt = await read_deletion_receipt(session, source_id=source.id)
        assert receipt.outcome == "deleted_after_approval"
        assert receipt.summary == "Kendall copies deleted" and receipt.proof_count == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_retention_expiry_enters_same_barrier_and_missing_manifest_fails_closed(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'retention-expiry.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        source, _ = await _seed_source(session, source_id="source:expiry", deadline=datetime.now(timezone.utc) - timedelta(seconds=1))
        expired = await expire_source_for_retention(session, source_id=source.id, expected_revision=2, actor_ref="worker:test")
        assert expired.initiator == "retention_expiry" and expired.deletion_operations == 1
        unknown = MemoryInboxSource(id="source:unknown-copy", current_revision=1, lifecycle_state="Draft", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None", policy_ref="policy:test")
        unknown_revision = MemoryInboxSourceRevision(id="revision:unknown-copy", source_id=unknown.id, revision=1, lifecycle_state="Draft", actor_ref="operator:seed", audit_ref="audit:seed", policy_ref=unknown.policy_ref)
        session.add_all((unknown, unknown_revision)); await session.commit()
        await delete_source_by_operator(session, source_id=unknown.id, expected_revision=1, idempotency_key="unknown-copy-delete-0001", actor_ref="operator:test")
        assert (await session.get(MemoryInboxSource, unknown.id)).deletion_state == "RetryNeeded"
    await engine.dispose()
