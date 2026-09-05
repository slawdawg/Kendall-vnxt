import copy

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.hermes_outcomes import (
    _update_if_current,
    _require_current_cited_sources,
    ingest_hermes_ledger,
    ingest_hermes_review_handoff,
    list_hermes_cited_sources,
    provision_hermes_role_capability,
    record_hermes_cited_source,
    read_hermes_lane_run,
    read_hermes_outcome,
    read_hermes_cited_source,
    revoke_hermes_cited_source,
)
from supervisor.api.schemas import HermesCitedSourceRecordRequestV1, HermesCitedSourceRevocationRequestV1, HermesLedgerIngestRequest, HermesReviewHandoffRequest, HermesRoleCapabilityProvisionRequestV1
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.migrations import MIGRATIONS, SCHEMA_MIGRATIONS_TABLE, upgrade_database
from supervisor.infrastructure.db.models import HermesCitedSourceConfirmationReceipt, HermesLaneRun, HermesOutcome
from test_hermes_control_plane import payload


def cited_source(source_id: str = "source:one") -> HermesCitedSourceRecordRequestV1:
    return HermesCitedSourceRecordRequestV1.model_validate({
        "sourceRecordId": source_id, "outcomeId": "outcome:1", "laneRunId": "lane:1",
        "schemaVersion": "hermes_cited_source_record.v1", "sourceKind": "source_owned_document",
        "locator": "docs/workflows/hermes-autonomous-delivery.md", "fingerprint": "sha256:cited-source",
        "citationRefs": ["evidence:hermes-ledger-1"], "accessScope": "verification_and_review", "confidence": "high",
        "observedAt": "2026-09-02T12:01:00Z", "reviewAt": "2099-01-01T00:00:00Z", "expiresAt": "2099-01-02T00:00:00Z",
        "supersedesSourceRecordId": None, "idempotencyKey": source_id, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
        "metadataOnly": True, "rawPayloadRetained": False,
    })


@pytest.mark.asyncio
async def test_hermes_ledger_is_idempotent_conflict_fenced_and_metadata_only(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'ledger.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    request = HermesLedgerIngestRequest.model_validate(payload())
    async with sessions() as session:
        first = await ingest_hermes_ledger(session, request)
        replay = await ingest_hermes_ledger(session, request)
        assert first == replay and first.currentLaneRunId == "lane:1" and first.recoveryState == "recovering"
    conflict = copy.deepcopy(payload()); conflict["event"]["reasonCode"] = "changed"  # type: ignore[index]
    async with sessions() as session:
        with pytest.raises(ValueError, match="idempotency"): await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(conflict))
        coupled_conflict = copy.deepcopy(payload()); coupled_conflict["outcome"]["title"] = "Changed title"  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"): await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(coupled_conflict))
        projection = await read_hermes_outcome(session, "outcome:1")
        assert projection is not None and projection.reasonCode == "verification_pending"
    async with engine.begin() as connection:
        assert await connection.scalar(text("SELECT COUNT(*) FROM hermes_ledger_events")) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_ledger_binds_evidence_current_lane_and_revision(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'ledger-binding.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    initial = payload(); initial["deliveryEvidence"]["observedAt"] = "2026-09-02T12:02:00Z"  # type: ignore[index]
    first = HermesLedgerIngestRequest.model_validate(initial)
    async with sessions() as session:
        await ingest_hermes_ledger(session, first)
    second = copy.deepcopy(payload())
    second["laneRun"]["laneRunId"] = "lane:2"  # type: ignore[index]
    second["deliveryEvidence"]["laneRunId"] = "lane:2"  # type: ignore[index]
    second["event"]["laneRunId"] = "lane:2"  # type: ignore[index]
    for section, value in (("laneRun", "lane:2"), ("deliveryEvidence", "evidence:2"), ("event", "event:2")):
        second[section]["deliveryEvidenceId" if section == "deliveryEvidence" else ("eventId" if section == "event" else "idempotencyKey")] = value  # type: ignore[index]
        second[section]["idempotencyKey"] = value  # type: ignore[index]
    second["event"]["eventName"] = "hermes.lane.recovered"  # type: ignore[index]
    second["laneRun"]["staleDeadlineAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["laneRun"]["timeoutAt"] = "2099-09-02T12:02:00Z"  # type: ignore[index]
    second["laneRun"]["heartbeatAt"] = "2099-09-02T12:00:00Z"  # type: ignore[index]
    second["laneRun"]["observedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["laneRun"]["updatedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["outcome"]["observedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["outcome"]["updatedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["deliveryEvidence"]["observedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["event"]["observedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    second["event"]["emittedAt"] = "2099-09-02T12:01:00Z"  # type: ignore[index]
    async with sessions() as session:
        projection = await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(second))
        assert projection.currentLaneRunId == "lane:2" and projection.freshness == "fresh"
        lane_projection = await read_hermes_lane_run(session, "lane:2")
        assert lane_projection is not None and lane_projection.stage == "implementation" and lane_projection.retryBudget == 1
        replay = await ingest_hermes_ledger(session, first)
        assert replay.currentLaneRunId == "lane:2" and replay.freshness == "fresh"
        with pytest.raises(ValueError, match="concurrently"):
            await _update_if_current(session, HermesOutcome, "outcome:1", 1, {})
        await session.rollback()
    changed_evidence = copy.deepcopy(second); changed_evidence["deliveryEvidence"]["sourceRef"] = "test:changed"  # type: ignore[index]
    changed_evidence["event"]["eventId"] = "event:3"  # type: ignore[index]
    changed_evidence["event"]["idempotencyKey"] = "event:3"  # type: ignore[index]
    async with sessions() as session:
        with pytest.raises(ValueError, match="delivery evidence"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(changed_evidence))
    retry_reset = copy.deepcopy(second); retry_reset["laneRun"]["retryBudget"] = 2  # type: ignore[index]
    retry_reset["laneRun"]["evidenceFingerprint"] = "sha256:replacement"  # type: ignore[index]
    retry_reset["event"]["eventId"] = "event:4"  # type: ignore[index]
    retry_reset["event"]["idempotencyKey"] = "event:4"  # type: ignore[index]
    async with sessions() as session:
        with pytest.raises(ValueError, match="transition"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(retry_reset))
    delayed = copy.deepcopy(second); delayed["event"]["eventId"] = "event:5"  # type: ignore[index]
    delayed["event"]["idempotencyKey"] = "event:5"  # type: ignore[index]
    delayed["deliveryEvidence"]["deliveryEvidenceId"] = "evidence:5"  # type: ignore[index]
    delayed["deliveryEvidence"]["idempotencyKey"] = "evidence:5"  # type: ignore[index]
    delayed["outcome"]["observedAt"] = "2028-09-02T12:01:00Z"  # type: ignore[index]
    delayed["outcome"]["updatedAt"] = "2100-09-02T12:01:00Z"  # type: ignore[index]
    delayed["laneRun"]["heartbeatAt"] = "2028-09-02T12:00:00Z"  # type: ignore[index]
    delayed["laneRun"]["staleDeadlineAt"] = "2028-09-02T12:01:00Z"  # type: ignore[index]
    delayed["laneRun"]["timeoutAt"] = "2028-09-02T12:02:00Z"  # type: ignore[index]
    delayed["laneRun"]["observedAt"] = "2028-09-02T12:01:00Z"  # type: ignore[index]
    delayed["laneRun"]["updatedAt"] = "2100-09-02T12:01:00Z"  # type: ignore[index]
    delayed["deliveryEvidence"]["observedAt"] = "2028-09-02T12:01:00Z"  # type: ignore[index]
    delayed["event"]["observedAt"] = "2028-09-02T12:01:00Z"  # type: ignore[index]
    delayed["event"]["emittedAt"] = "2028-09-02T12:01:00Z"  # type: ignore[index]
    async with sessions() as session:
        with pytest.raises(ValueError, match="outcome transition"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(delayed))
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_ledger_migration_is_ordered_and_clean_install_aware(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'ledger-migration.db'}")
    async with engine.begin() as connection:
        await upgrade_database(connection)
        revisions = tuple((await connection.execute(text(f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE} ORDER BY revision"))).scalars())
        tables = set((await connection.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))).scalars())
        verification_columns = {row[1] for row in (await connection.execute(text("PRAGMA table_info(hermes_verification_records)"))).all()}
        review_columns = {row[1] for row in (await connection.execute(text("PRAGMA table_info(hermes_review_dispositions)"))).all()}
    assert revisions == tuple(migration.revision for migration in MIGRATIONS)
    assert {"hermes_outcomes", "hermes_lane_runs", "hermes_delivery_evidence", "hermes_ledger_events", "hermes_cited_source_records"} <= tables
    assert "cited_source_record_ids_json" in verification_columns
    assert "cited_source_record_ids_json" in review_columns
    await engine.dispose()


@pytest.mark.asyncio
async def test_cited_sources_are_metadata_only_idempotent_correctable_and_fail_closed_at_consumption(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'cited-sources.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        first = await record_hermes_cited_source(session, cited_source())
        assert first.state == "current" and first.rawPayloadRetained is False
        assert await record_hermes_cited_source(session, cited_source()) == first
        evidence_source = cited_source("source:delivery").model_copy(update={
            "sourceKind": "validated_delivery_evidence", "locator": "delivery-evidence:evidence:1",
            "citationRefs": ["evidence:1"],
        })
        assert (await record_hermes_cited_source(session, evidence_source)).state == "current"
        fabricated = cited_source("source:fabricated").model_copy(update={
            "sourceKind": "validated_delivery_evidence", "locator": "delivery-evidence:evidence:missing",
            "citationRefs": ["evidence:missing"],
        })
        with pytest.raises(ValueError, match="persisted evidence"):
            await record_hermes_cited_source(session, fabricated)
        conflicting = cited_source().model_copy(update={"fingerprint": "sha256:changed"})
        with pytest.raises(ValueError, match="idempotency"):
            await record_hermes_cited_source(session, conflicting)
        outcome, lane = await session.get(HermesOutcome, "outcome:1"), await session.get(HermesLaneRun, "lane:1")
        assert outcome is not None and lane is not None
        await _require_current_cited_sources(session, source_record_ids=["source:one"], outcome=outcome, lane=lane, scope="implementation_verification")
        replacement = cited_source("source:replacement").model_copy(update={"supersedesSourceRecordId": "source:one"})
        assert (await record_hermes_cited_source(session, replacement)).state == "current"
        original = await read_hermes_cited_source(session, "source:one", outcome_id="outcome:1", lane_run_id="lane:1")
        assert original is not None and original.state == "superseded"
        with pytest.raises(ValueError, match="stale, revoked, superseded"):
            await _require_current_cited_sources(session, source_record_ids=["source:one"], outcome=outcome, lane=lane, scope="implementation_verification")
        revoked = await record_hermes_cited_source(session, cited_source("source:revoked"))
        assert revoked.state == "current"
        revoke = HermesCitedSourceRevocationRequestV1.model_validate({"sourceRecordId": "source:revoked", "revokedAt": "2026-09-02T12:02:00Z", "reasonCode": "source_retracted", "idempotencyKey": "revoke:source-revoked", "metadataOnly": True, "rawPayloadRetained": False})
        assert (await revoke_hermes_cited_source(session, revoke)).state == "revoked"
        assert (await revoke_hermes_cited_source(session, revoke)).state == "revoked"
        another = await record_hermes_cited_source(session, cited_source("source:another"))
        assert another.state == "current"
        conflict_revoke = revoke.model_copy(update={"sourceRecordId": "source:another"})
        with pytest.raises(ValueError, match="idempotency"):
            await revoke_hermes_cited_source(session, conflict_revoke)
        with pytest.raises(ValueError, match="revisions"):
            await record_hermes_cited_source(session, cited_source("source:wrong-revision").model_copy(update={"expectedOutcomeRevision": 2}))
        listed = await list_hermes_cited_sources(session, outcome_id="outcome:1", lane_run_id="lane:1", limit=2)
        assert len(listed) == 2 and all(item.metadataOnly and item.rawPayloadRetained is False for item in listed)
    await engine.dispose()


@pytest.mark.asyncio
async def test_review_handoff_persists_verified_independent_disposition_and_exact_replay(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-handoff.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    initial = payload()
    initial["laneRun"]["status"] = "review"  # type: ignore[index]
    verification = {
        "verificationRecordId": "verification:one", "outcomeId": "outcome:1", "laneRunId": "lane:1",
        "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes",
        "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:one",
        "developerHome": "home:developer", "developerWorkspace": "workspace:developer",
        "evidenceRefs": ["evidence:1"], "citedSourceRecordIds": ["source:one"], "observedAt": "2026-09-02T12:01:00Z",
        "idempotencyKey": "verification:one", "createdAt": "2026-09-02T12:01:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    disposition = {
        "reviewDispositionId": "review:approve", "verificationRecordId": "verification:one", "outcomeId": "outcome:1",
        "developerLaneRunId": "lane:1", "schemaVersion": "hermes_review_disposition.v1", "disposition": "approve",
        "reviewerIdentity": "reviewer:one", "reviewerHome": "home:reviewer", "reviewerWorkspace": "workspace:reviewer",
        "reasonCode": "reviewed", "nextAction": "Hold for the later delivery adapter.", "evidenceRefs": ["evidence:1"], "citedSourceRecordIds": ["source:one"],
        "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "review:approve", "createdAt": "2026-09-02T12:01:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    developer_home, developer_workspace = tmp_path / "developer-home", tmp_path / "developer-workspace"
    reviewer_home, reviewer_workspace = tmp_path / "reviewer-home", tmp_path / "reviewer-workspace"
    for directory in (developer_home, developer_workspace, reviewer_home, reviewer_workspace): directory.mkdir()
    verification["developerHome"], verification["developerWorkspace"] = str(developer_home), str(developer_workspace)
    disposition["reviewerHome"], disposition["reviewerWorkspace"] = str(reviewer_home), str(reviewer_workspace)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        await record_hermes_cited_source(session, cited_source())
        for role, binding_id, secret, identity, home, workspace in (
            ("developer", "capability:developer", "d" * 32, verification["developerIdentity"], verification["developerHome"], verification["developerWorkspace"]),
            ("reviewer", "capability:reviewer", "r" * 32, disposition["reviewerIdentity"], disposition["reviewerHome"], disposition["reviewerWorkspace"]),
        ):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
                "capabilityBindingId": binding_id, "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": role,
                "identity": identity, "home": home, "workspace": workspace, "capabilitySecret": secret,
                "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            }))
        verification_request = HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:developer", "developerCapabilityProof": "d" * 32})
        assert (await ingest_hermes_review_handoff(session, verification_request)).currentResult == "retryable"
        review_request = HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32})
        approved = await ingest_hermes_review_handoff(session, review_request)
        assert approved.currentLaneRunId == "lane:1" and approved.currentResult == "completed"
        assert await ingest_hermes_review_handoff(session, review_request) == approved
        receipt = await session.scalar(select(HermesCitedSourceConfirmationReceipt).where(
            HermesCitedSourceConfirmationReceipt.consumer_type == "review",
            HermesCitedSourceConfirmationReceipt.consumer_id == "review:approve",
        ))
        assert receipt is not None and receipt.raw_payload_retained is False
        await session.delete(receipt)
        await session.flush()
        with pytest.raises(ValueError, match="confirmation receipt"):
            await ingest_hermes_review_handoff(session, review_request)
        overlapping = copy.deepcopy(disposition)
        overlapping["reviewDispositionId"] = "review:overlap"
        overlapping["idempotencyKey"] = "review:overlap"
        overlapping["reviewerWorkspace"] = f"{developer_workspace}/../developer-workspace"
        HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": overlapping, "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32})
        alias = tmp_path / "reviewer-alias"; alias.symlink_to(developer_workspace, target_is_directory=True)
        overlapping["reviewerWorkspace"] = str(alias)
        with pytest.raises(ValueError, match="review state"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": overlapping, "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32}))
    await engine.dispose()


@pytest.mark.asyncio
async def test_valid_self_review_is_persisted_as_denied_policy_but_unbound_input_cannot_transition(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-denied.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    initial = payload(); initial["laneRun"]["status"] = "review"  # type: ignore[index]
    developer_home, developer_workspace, reviewer_home = tmp_path / "developer-home", tmp_path / "developer-workspace", tmp_path / "reviewer-home"
    for directory in (developer_home, developer_workspace, reviewer_home): directory.mkdir()
    verification = {"verificationRecordId": "verification:denied", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:denied", "developerHome": str(developer_home), "developerWorkspace": str(developer_workspace), "evidenceRefs": ["evidence:hermes-ledger-1"], "citedSourceRecordIds": ["source:denied"], "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:denied", "createdAt": "2026-09-02T12:01:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}
    disposition = {"reviewDispositionId": "review:denied", "verificationRecordId": "verification:denied", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "hermes_review_disposition.v1", "disposition": "approve", "reviewerIdentity": "reviewer:denied", "reviewerHome": str(reviewer_home), "reviewerWorkspace": str(developer_workspace), "reasonCode": "reviewed", "nextAction": "Hold for delivery.", "evidenceRefs": ["evidence:hermes-ledger-1"], "citedSourceRecordIds": ["source:denied"], "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "review:denied", "createdAt": "2026-09-02T12:02:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        await record_hermes_cited_source(session, cited_source("source:denied"))
        with pytest.raises(ValueError, match="Reviewer capability"):
            HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition})
        assert (await read_hermes_outcome(session, "outcome:1")).currentResult == "retryable"  # type: ignore[union-attr]
        for role, binding_id, secret, identity, home, workspace in (("developer", "capability:developer-denied", "d" * 32, verification["developerIdentity"], verification["developerHome"], verification["developerWorkspace"]), ("reviewer", "capability:reviewer-denied", "r" * 32, disposition["reviewerIdentity"], disposition["reviewerHome"], disposition["reviewerWorkspace"])):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({"capabilityBindingId": binding_id, "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": role, "identity": identity, "home": home, "workspace": workspace, "capabilitySecret": secret, "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}))
        await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:developer-denied", "developerCapabilityProof": "d" * 32}))
        denied = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "reviewerCapabilityBindingId": "capability:reviewer-denied", "reviewerCapabilityProof": "r" * 32}))
        assert denied.currentResult == "deniedPolicy" and denied.reasonCode == "independent_reviewer_required"
    await engine.dispose()


@pytest.mark.asyncio
async def test_review_handoff_operator_unavailable_exception_is_audited_without_reviewer_proof(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-unavailable.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    initial = payload(); initial["laneRun"]["status"] = "review"  # type: ignore[index]
    verification = {
        "verificationRecordId": "verification:exception", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:exception", "developerHome": "home:developer-exception", "developerWorkspace": "workspace:developer-exception", "evidenceRefs": ["evidence:hermes-ledger-1"], "citedSourceRecordIds": ["source:exception"], "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:exception", "createdAt": "2026-09-02T12:01:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    disposition = {
        "reviewDispositionId": "review:exception", "verificationRecordId": "verification:exception", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "hermes_review_disposition.v1", "disposition": "technical_block", "reviewerIdentity": "reviewer:unavailable", "reviewerHome": "home:reviewer-unavailable", "reviewerWorkspace": "workspace:reviewer-unavailable", "reasonCode": "reviewer_unavailable", "nextAction": "Return the original Developer lane after an Operator-recorded technical block.", "evidenceRefs": ["evidence:hermes-ledger-1"], "citedSourceRecordIds": ["source:exception"], "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "review:exception", "createdAt": "2026-09-02T12:02:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    exception = {"exceptionId": "exception:reviewer-unavailable", "outcomeId": "outcome:1", "laneRunId": "lane:1", "reason": "reviewer_unavailable", "riskClass": "technical_block", "compensatingReviewRef": "review:later", "recordedBy": "operator:local", "recordedAt": "2026-09-02T12:01:30Z", "reviewOrExpiryAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}
    developer_home, developer_workspace = tmp_path / "developer-home", tmp_path / "developer-workspace"
    reviewer_home, reviewer_workspace = tmp_path / "reviewer-home", tmp_path / "reviewer-workspace"
    for directory in (developer_home, developer_workspace, reviewer_home, reviewer_workspace): directory.mkdir()
    verification["developerHome"], verification["developerWorkspace"] = str(developer_home), str(developer_workspace)
    disposition["reviewerHome"], disposition["reviewerWorkspace"] = str(reviewer_home), str(reviewer_workspace)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        await record_hermes_cited_source(session, cited_source("source:exception"))
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({"capabilityBindingId": "capability:developer-exception", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "developer", "identity": verification["developerIdentity"], "home": verification["developerHome"], "workspace": verification["developerWorkspace"], "capabilitySecret": "d" * 32, "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}))
        await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:developer-exception", "developerCapabilityProof": "d" * 32}))
        overlap = copy.deepcopy(disposition); overlap["reviewDispositionId"] = "review:exception-overlap"; overlap["idempotencyKey"] = "review:exception-overlap"; overlap["reviewerWorkspace"] = verification["developerWorkspace"]
        denied = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": overlap, "unavailableReviewerException": exception}), operator_identity="operator:local", commit=False)
        assert denied.currentResult == "deniedPolicy"
        await session.rollback()
        request = HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "unavailableReviewerException": exception})
        blocked = await ingest_hermes_review_handoff(session, request, operator_identity="operator:local")
        assert blocked.currentResult == "blockedTechnical"
        with pytest.raises(ValueError, match="authenticated Operator"):
            await ingest_hermes_review_handoff(session, request, operator_identity="operator:other")
    await engine.dispose()
