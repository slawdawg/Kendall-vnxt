import copy
from datetime import UTC, datetime
from hashlib import sha256
import json

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.hermes_outcomes import (
    _update_if_current,
    claim_hermes_delivery_admission,
    ingest_hermes_ledger,
    ingest_hermes_review_handoff,
    provision_hermes_role_capability,
    record_hermes_delivery_audit,
    record_hermes_review_thread_adjudication,
    read_hermes_lane_run,
    read_hermes_outcome,
)
from supervisor.api.schemas import HermesDeliveryAdmissionClaimRequestV1 as LegacyHermesDeliveryAdmissionClaimRequestV1, HermesDeliveryAdmissionClaimRequestV2 as HermesDeliveryAdmissionClaimRequestV1, HermesDeliveryAuditRequestV1 as LegacyHermesDeliveryAuditRequestV1, HermesDeliveryAuditRequestV2 as HermesDeliveryAuditRequestV1, HermesLedgerIngestRequest, HermesReviewDispositionInputV1, HermesReviewHandoffRequest, HermesReviewThreadAdjudicationRequestV1, HermesRoleCapabilityProvisionRequestV1
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.migrations import MIGRATIONS, SCHEMA_MIGRATIONS_TABLE, upgrade_database
from supervisor.infrastructure.db.models import HermesDeliveryAdmission, HermesDeliveryEvidence, HermesLaneRun, HermesOutcome, HermesRoleCapabilityBinding
from test_hermes_control_plane import payload


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
    assert revisions == tuple(migration.revision for migration in MIGRATIONS)
    assert {"hermes_outcomes", "hermes_lane_runs", "hermes_delivery_evidence", "hermes_ledger_events"} <= tables
    assert "verified_head_sha" in verification_columns
    await engine.dispose()


@pytest.mark.asyncio
async def test_delivery_capability_role_upgrade_preserves_legacy_bindings_and_closes_other_roles(tmp_path):
    """Upgrade an actual 0008 SQLite binding table without changing its retained rows."""

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'delivery-role-upgrade.db'}")
    async with engine.begin() as connection:
        await connection.execute(text(f"CREATE TABLE {SCHEMA_MIGRATIONS_TABLE} (revision VARCHAR(80) PRIMARY KEY)"))
        for migration in MIGRATIONS[:8]:
            await connection.execute(text(f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES (:revision)"), {"revision": migration.revision})
        await connection.execute(text("CREATE TABLE hermes_outcomes (outcome_id VARCHAR(120) PRIMARY KEY)"))
        await connection.execute(text("CREATE TABLE hermes_lane_runs (lane_run_id VARCHAR(120) PRIMARY KEY)"))
        await connection.execute(text("CREATE TABLE hermes_delivery_evidence (delivery_evidence_id VARCHAR(120) PRIMARY KEY)"))
        await connection.execute(text("CREATE TABLE admission_locks (scope VARCHAR(80) PRIMARY KEY, generation INTEGER NOT NULL)"))
        await connection.execute(text("INSERT INTO hermes_outcomes (outcome_id) VALUES ('outcome:legacy')"))
        await connection.execute(text("INSERT INTO hermes_lane_runs (lane_run_id) VALUES ('lane:legacy')"))
        await connection.execute(text(
            "CREATE TABLE hermes_role_capability_bindings ("
            "capability_binding_id VARCHAR(120) NOT NULL PRIMARY KEY, outcome_id VARCHAR(120) NOT NULL REFERENCES hermes_outcomes(outcome_id), "
            "lane_run_id VARCHAR(120) NOT NULL REFERENCES hermes_lane_runs(lane_run_id), role VARCHAR(16) NOT NULL, identity VARCHAR(120) NOT NULL, "
            "home VARCHAR(240) NOT NULL, workspace VARCHAR(240) NOT NULL, capability_digest_sha256 VARCHAR(64) NOT NULL, "
            "created_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, revoked_at DATETIME, revoked_by VARCHAR(120), "
            "metadata_only BOOLEAN NOT NULL, raw_payload_retained BOOLEAN NOT NULL, "
            "CONSTRAINT ck_hermes_role_capability_role CHECK (role IN ('developer', 'reviewer')), "
            "CONSTRAINT ck_hermes_role_capability_expiry CHECK (expires_at > created_at), "
            "CONSTRAINT ck_hermes_role_capability_revocation_pair CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)), "
            "CONSTRAINT ck_hermes_role_capability_metadata_only CHECK (metadata_only IS TRUE), "
            "CONSTRAINT ck_hermes_role_capability_no_raw_payload CHECK (raw_payload_retained IS FALSE)"
            ")"
        ))
        legacy = {
            "binding": "capability:legacy-developer", "outcome": "outcome:legacy", "lane": "lane:legacy", "role": "developer",
            "identity": "developer:legacy", "home": "home:legacy", "workspace": "workspace:legacy", "digest": "a" * 64,
            "created": "2026-09-04 00:00:00", "expires": "2099-01-01 00:00:00", "revoked": "2026-09-04 01:00:00", "revoked_by": "operator:legacy",
        }
        await connection.execute(text(
            "INSERT INTO hermes_role_capability_bindings (capability_binding_id, outcome_id, lane_run_id, role, identity, home, workspace, capability_digest_sha256, created_at, expires_at, revoked_at, revoked_by, metadata_only, raw_payload_retained) "
            "VALUES (:binding, :outcome, :lane, :role, :identity, :home, :workspace, :digest, :created, :expires, :revoked, :revoked_by, 1, 0)"
        ), legacy)

        await upgrade_database(connection)
        preserved = (await connection.execute(text(
            "SELECT task_id, role, capability_digest_sha256, expires_at, revoked_at, revoked_by, metadata_only, raw_payload_retained "
            "FROM hermes_role_capability_bindings WHERE capability_binding_id = :binding"
        ), legacy)).one()
        assert preserved == (None, "developer", legacy["digest"], legacy["expires"], legacy["revoked"], legacy["revoked_by"], 1, 0)
        await connection.execute(text(
            "INSERT INTO hermes_role_capability_bindings (capability_binding_id, outcome_id, lane_run_id, role, identity, home, workspace, capability_digest_sha256, created_at, expires_at, revoked_at, revoked_by, metadata_only, raw_payload_retained) "
            "VALUES ('capability:delivery', 'outcome:legacy', 'lane:legacy', 'delivery', 'delivery:one', 'home:delivery', 'workspace:delivery', :digest, '2026-09-04 00:00:00', '2099-01-01 00:00:00', NULL, NULL, 1, 0)"
        ), {"digest": "d" * 64})
        with pytest.raises(IntegrityError):
            await connection.execute(text(
                "INSERT INTO hermes_role_capability_bindings (capability_binding_id, outcome_id, lane_run_id, role, identity, home, workspace, capability_digest_sha256, created_at, expires_at, revoked_at, revoked_by, metadata_only, raw_payload_retained) "
                "VALUES ('capability:operator', 'outcome:legacy', 'lane:legacy', 'operator', 'operator:one', 'home:operator', 'workspace:operator', :digest, '2026-09-04 00:00:00', '2099-01-01 00:00:00', NULL, NULL, 1, 0)"
            ), {"digest": "o" * 64})
        revisions = tuple((await connection.execute(text(f"SELECT revision FROM {SCHEMA_MIGRATIONS_TABLE} ORDER BY revision"))).scalars())
        assert revisions == tuple(migration.revision for migration in MIGRATIONS)
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
        "sourceFingerprint": "sha256:ledger-proof", "verifiedHeadSha": "a" * 40, "developerIdentity": "developer:one",
        "developerHome": "home:developer", "developerWorkspace": "workspace:developer",
        "evidenceRefs": ["evidence:1"], "observedAt": "2026-09-02T12:01:00Z",
        "idempotencyKey": "verification:one", "createdAt": "2026-09-02T12:01:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    disposition = {
        "reviewDispositionId": "review:approve", "verificationRecordId": "verification:one", "outcomeId": "outcome:1",
        "developerLaneRunId": "lane:1", "schemaVersion": "hermes_review_disposition.v1", "disposition": "approve",
        "reviewerIdentity": "reviewer:one", "reviewerHome": "home:reviewer", "reviewerWorkspace": "workspace:reviewer",
        "reasonCode": "reviewed", "nextAction": "Hold for the later delivery adapter.", "reviewedHeadSha": "a" * 40, "evidenceRefs": ["evidence:1"],
        "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "review:approve", "createdAt": "2026-09-02T12:01:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    developer_home, developer_workspace = tmp_path / "developer-home", tmp_path / "developer-workspace"
    reviewer_home, reviewer_workspace = tmp_path / "reviewer-home", tmp_path / "reviewer-workspace"
    delivery_home, delivery_workspace = tmp_path / "delivery-home", tmp_path / "delivery-workspace"
    for directory in (developer_home, developer_workspace, reviewer_home, reviewer_workspace, delivery_home, delivery_workspace): directory.mkdir()
    verification["developerHome"], verification["developerWorkspace"] = str(developer_home), str(developer_workspace)
    disposition["reviewerHome"], disposition["reviewerWorkspace"] = str(reviewer_home), str(reviewer_workspace)
    missing_reviewed_head = copy.deepcopy(disposition)
    missing_reviewed_head.update({"disposition": "rework", "reviewDispositionId": "review:missing-head", "idempotencyKey": "review:missing-head"})
    missing_reviewed_head.pop("reviewedHeadSha")
    with pytest.raises(ValueError, match="Field required"):
        HermesReviewDispositionInputV1.model_validate(missing_reviewed_head)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        for role, binding_id, secret, identity, home, workspace in (
            ("developer", "capability:developer", "d" * 32, verification["developerIdentity"], verification["developerHome"], verification["developerWorkspace"]),
            ("reviewer", "capability:reviewer", "r" * 32, disposition["reviewerIdentity"], disposition["reviewerHome"], disposition["reviewerWorkspace"]),
        ):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
                "capabilityBindingId": binding_id, "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": role,
                "identity": identity, "home": home, "workspace": workspace, "capabilitySecret": secret,
                "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            }))
        verification_request = HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:developer", "developerCapabilityProof": "d" * 32})
        assert (await ingest_hermes_review_handoff(session, verification_request)).currentResult == "retryable"
        assert await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.evidence_type == "approved_review_handoff")) is None
        mismatched_disposition = copy.deepcopy(disposition)
        mismatched_disposition.update({"reviewDispositionId": "review:mismatched-head", "idempotencyKey": "review:mismatched-head", "reviewedHeadSha": "b" * 40})
        with pytest.raises(ValueError, match="must exactly match the persisted passed verification head"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": mismatched_disposition, "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32}))
        review_request = HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32})
        approved = await ingest_hermes_review_handoff(session, review_request)
        assert approved.currentLaneRunId == "lane:1" and approved.currentResult == "completed"
        assert await ingest_hermes_review_handoff(session, review_request) == approved
        snapshot = await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.evidence_type == "approved_review_handoff"))
        assert snapshot is not None and snapshot.task_id == "task:hermes-one" and snapshot.evidence_refs_json == ["evidence:1"]
        outcome, lane = await session.get(HermesOutcome, "outcome:1"), await session.get(HermesLaneRun, "lane:1")
        assert outcome is not None and lane is not None
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
            "capabilityBindingId": "capability:delivery", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "delivery",
            "identity": "delivery:one", "home": str(delivery_home), "workspace": str(delivery_workspace), "capabilitySecret": "x" * 32,
            "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }))
        with pytest.raises(ValueError, match="profile must remain isolated"):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
                "capabilityBindingId": "capability:reviewer-after-delivery", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "reviewer",
                "identity": "reviewer:after-delivery", "home": str(delivery_home), "workspace": str(reviewer_workspace), "capabilitySecret": "q" * 32,
                "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            }))
        audit = {
            "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "deliveryStewardIdentity": "delivery:one",
            "deliveryHome": str(delivery_home), "deliveryWorkspace": str(delivery_workspace), "deliveryCapabilityBindingId": "capability:delivery", "deliveryCapabilityProof": "x" * 32,
            "schemaVersion": "hermes_delivery_audit_action.v2", "repository": "slawdawg/Kendall-vnxt", "baseBranch": "dev", "expectedHeadSha": "a" * 40,
            "pullRequestNumber": 1, "requestedAction": "request_review", "requestedReviewer": "reviewer-one", "policyEvidenceRef": snapshot.delivery_evidence_id,
            "localVerificationRef": snapshot.delivery_evidence_id, "rollbackRef": snapshot.delivery_evidence_id, "evidenceRefs": [snapshot.delivery_evidence_id],
            "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "delivery-audit:one", "createdAt": "2026-09-02T12:02:00Z",
            "expectedOutcomeRevision": outcome.revision, "expectedLaneRevision": lane.revision, "metadataOnly": True, "rawPayloadRetained": False,
        }
        bound_refs = (
            ("evidence:policy-current", "policy"),
            ("evidence:verification-current", "verification"),
            ("evidence:rollback-current", "rollback"),
        )
        for reference, evidence_type in bound_refs:
            session.add(HermesDeliveryEvidence(
                delivery_evidence_id=reference, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id,
                task_id=outcome.task_id, schema_version="delivery_evidence.v1", evidence_type=evidence_type,
                summary="Current bounded delivery evidence.", source_ref=f"test:{reference}", observed_at=snapshot.observed_at,
                evidence_refs_json=[reference], idempotency_key=reference, created_at=snapshot.created_at,
                metadata_only=True, raw_payload_retained=False,
            ))
        await session.commit()
        distinct_bound = copy.deepcopy(audit)
        distinct_bound.update({
            "policyEvidenceRef": bound_refs[0][0], "localVerificationRef": bound_refs[1][0], "rollbackRef": bound_refs[2][0],
            "evidenceRefs": [snapshot.delivery_evidence_id, *(reference for reference, _ in bound_refs)], "idempotencyKey": "delivery-audit:distinct-bound",
        })
        assert (await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(distinct_bound))).decision == "allowed"
        wrong_role = copy.deepcopy(distinct_bound)
        wrong_role.update({"policyEvidenceRef": bound_refs[1][0], "idempotencyKey": "delivery-audit:wrong-policy-role"})
        with pytest.raises(ValueError, match="policy evidence has the wrong persisted role"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(wrong_role))
        repeated_denial = copy.deepcopy(wrong_role)
        repeated_denial["idempotencyKey"] = "delivery-audit:repeated-denial-one"
        with pytest.raises(ValueError, match="policy evidence has the wrong persisted role"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(repeated_denial))
        repeated_denial["idempotencyKey"] = "delivery-audit:repeated-denial-two"
        with pytest.raises(ValueError, match="policy evidence has the wrong persisted role"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(repeated_denial))
        denial_records = (await session.scalars(select(HermesDeliveryEvidence).where(
            HermesDeliveryEvidence.evidence_type == "governed_delivery_action_denied",
        ))).all()
        assert len({record.delivery_evidence_id for record in denial_records}) >= 2
        missing_role = copy.deepcopy(distinct_bound)
        missing_role.update({"rollbackRef": "evidence:rollback-missing", "evidenceRefs": [snapshot.delivery_evidence_id, bound_refs[0][0], bound_refs[1][0], "evidence:rollback-missing"], "idempotencyKey": "delivery-audit:missing-rollback"})
        with pytest.raises(ValueError, match="rollback evidence is missing"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(missing_role))
        without_snapshot = copy.deepcopy(distinct_bound)
        without_snapshot.update({"evidenceRefs": [reference for reference, _ in bound_refs], "idempotencyKey": "delivery-audit:without-snapshot"})
        with pytest.raises(ValueError, match="approved-review evidence"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(without_snapshot))
        unresolved_bound = copy.deepcopy(distinct_bound)
        unresolved_bound.update({"evidenceRefs": [snapshot.delivery_evidence_id, *(reference for reference, _ in bound_refs), "evidence:unresolved"], "idempotencyKey": "delivery-audit:unresolved-bound"})
        with pytest.raises(ValueError, match="Review evidence"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(unresolved_bound))
        stale = copy.deepcopy(audit); stale["idempotencyKey"] = "delivery-audit:stale"; stale["policyEvidenceRef"] = stale["localVerificationRef"] = stale["rollbackRef"] = "evidence:1"; stale["evidenceRefs"] = ["evidence:1"]
        with pytest.raises(ValueError, match="approved-review evidence"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(stale))
        cross_task = copy.deepcopy(audit); cross_task["taskId"] = "task:other-one"; cross_task["idempotencyKey"] = "delivery-audit:other-task"
        with pytest.raises(ValueError, match="current bound outcome"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(cross_task))
        predated = copy.deepcopy(distinct_bound); predated["idempotencyKey"] = "delivery-audit:predated"; predated["createdAt"] = predated["observedAt"] = "2026-09-02T12:00:00Z"
        with pytest.raises(ValueError, match="cannot predate"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(predated))
        admitted = await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(distinct_bound))
        assert admitted.decision == "allowed" and admitted.requestedAction == "request_review"
        assert await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(distinct_bound)) == admitted
        legacy_replay = copy.deepcopy(audit)
        legacy_replay.pop("requestedReviewer")
        legacy_replay.update({"schemaVersion": "hermes_delivery_audit_action.v1", "idempotencyKey": "delivery-audit:legacy-replay"})
        legacy_request = LegacyHermesDeliveryAuditRequestV1.model_validate(legacy_replay)
        legacy_fingerprint = sha256(json.dumps(legacy_request.model_dump(mode="json", exclude={"deliveryCapabilityProof"}), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        legacy_id = f"delivery-audit:{sha256(legacy_replay['idempotencyKey'].encode('utf-8')).hexdigest()}"
        session.add(HermesDeliveryEvidence(
            delivery_evidence_id=legacy_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id, task_id=outcome.task_id,
            schema_version="hermes_delivery_audit_action.v1", evidence_type="governed_delivery_action", summary="Hermes delivery action admitted: request_review.", source_ref=f"hermes:delivery-adapter:{legacy_fingerprint}", observed_at=datetime.fromisoformat(legacy_replay["observedAt"].replace("Z", "+00:00")), evidence_refs_json=legacy_replay["evidenceRefs"], idempotency_key=legacy_replay["idempotencyKey"], created_at=datetime.fromisoformat(legacy_replay["createdAt"].replace("Z", "+00:00")), metadata_only=True, raw_payload_retained=False,
        ))
        await session.commit()
        replayed_legacy = await record_hermes_delivery_audit(session, legacy_request)
        assert replayed_legacy.reasonCode == "legacy_replay_only" and replayed_legacy.schemaVersion == "hermes_delivery_action_result.v1"
        with pytest.raises(ValueError, match="replay-only"):
            await record_hermes_delivery_audit(session, LegacyHermesDeliveryAuditRequestV1.model_validate({**legacy_replay, "idempotencyKey": "delivery-audit:legacy-missing"}))
        altered_replay = copy.deepcopy(distinct_bound); altered_replay["pullRequestNumber"] = 2
        with pytest.raises(ValueError, match="idempotency conflicts"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(altered_replay))
        persisted_audit = await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.idempotency_key == "delivery-audit:distinct-bound"))
        assert persisted_audit is not None and persisted_audit.task_id == "task:hermes-one"
        persisted_admission = await session.scalar(select(HermesDeliveryAdmission).where(HermesDeliveryAdmission.delivery_action_result_id == admitted.deliveryActionResultId))
        assert persisted_admission is not None and persisted_admission.claim_id is None and persisted_admission.audit_fingerprint == persisted_audit.source_ref.rsplit(":", 1)[-1]
        assert (persisted_admission.delivery_steward_identity, persisted_admission.delivery_capability_binding_id, persisted_admission.requested_reviewer) == ("delivery:one", "capability:delivery", "reviewer-one")
        claim_payload = HermesDeliveryAdmissionClaimRequestV1.model_validate({
            "claimId": "delivery-claim:one", "schemaVersion": "hermes_delivery_admission_claim.v2", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "deliveryStewardIdentity": "delivery:one", "deliveryHome": str(delivery_home), "deliveryWorkspace": str(delivery_workspace), "deliveryCapabilityBindingId": "capability:delivery", "deliveryCapabilityProof": "x" * 32, "requestedAction": "request_review", "requestedReviewer": "reviewer-one",
            "pullRequestNumber": 1, "exactHeadSha": "a" * 40, "metadataOnly": True, "rawPayloadRetained": False,
        })
        with pytest.raises(ValueError, match="audited Delivery capability, profile, and reviewer"):
            await claim_hermes_delivery_admission(session, claim_payload.model_copy(update={"claimId": "delivery-claim:other", "deliveryStewardIdentity": "delivery:other"}))
        receipt = await claim_hermes_delivery_admission(session, claim_payload)
        assert receipt.admissionId == persisted_admission.admission_id and receipt.claimId == claim_payload.claimId
        consumption = await session.get(HermesDeliveryEvidence, receipt.consumptionResultId)
        assert receipt.expiresAt > receipt.claimedAt and receipt.rawPayloadRetained is False
        assert consumption is not None and consumption.evidence_type == "governed_delivery_admission_consumed"
        assert consumption.evidence_refs_json == [admitted.deliveryActionResultId] and consumption.metadata_only is True and consumption.raw_payload_retained is False
        assert await claim_hermes_delivery_admission(session, claim_payload) == receipt
        legacy_v1_claim = LegacyHermesDeliveryAdmissionClaimRequestV1.model_validate({key: value for key, value in claim_payload.model_dump(mode="json").items() if key not in {"schemaVersion", "requestedReviewer"}})
        with pytest.raises(ValueError, match="cannot replay a reviewer-bound"):
            await claim_hermes_delivery_admission(session, legacy_v1_claim)
        with pytest.raises(ValueError, match="exactly one current unclaimed exact action binding"):
            await claim_hermes_delivery_admission(session, claim_payload.model_copy(update={"claimId": "delivery-claim:reviewer", "requestedReviewer": "reviewer-two"}))
        conflicting_claim = claim_payload.model_copy(update={"exactHeadSha": "b" * 40})
        with pytest.raises(ValueError, match="conflicts"):
            await claim_hermes_delivery_admission(session, conflicting_claim)
        second_claim = claim_payload.model_copy(update={"claimId": "delivery-claim:two"})
        with pytest.raises(ValueError, match="exactly one current unclaimed exact action binding"):
            await claim_hermes_delivery_admission(session, second_claim)
        with pytest.raises(ValueError, match="profile must remain isolated"):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
                "capabilityBindingId": "capability:delivery-overlap", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "delivery",
                "identity": "delivery:overlap", "home": str(developer_workspace), "workspace": str(delivery_workspace), "capabilitySecret": "y" * 32,
                "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            }))
        with pytest.raises(ValueError, match="profile must remain isolated"):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
                "capabilityBindingId": "capability:delivery-identity", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "delivery",
                "identity": verification["developerIdentity"], "home": str(delivery_home), "workspace": str(delivery_workspace), "capabilitySecret": "z" * 32,
                "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            }))
        other = copy.deepcopy(payload())
        for section in ("outcome", "laneRun", "deliveryEvidence"):
            other[section]["taskId"] = "task:hermes-two"  # type: ignore[index]
        other["outcome"].update({"outcomeId": "outcome:2", "idempotencyKey": "outcome:2"})  # type: ignore[index]
        other["laneRun"].update({"laneRunId": "lane:2", "outcomeId": "outcome:2", "idempotencyKey": "lane:2"})  # type: ignore[index]
        other["deliveryEvidence"].update({"deliveryEvidenceId": "evidence:2", "outcomeId": "outcome:2", "laneRunId": "lane:2", "evidenceRefs": ["evidence:2"], "idempotencyKey": "evidence:2"})  # type: ignore[index]
        other["event"].update({"eventId": "event:2", "outcomeId": "outcome:2", "laneRunId": "lane:2", "evidenceRefs": ["evidence:2"], "idempotencyKey": "event:2", "correlationId": "correlation:2", "causationId": "causation:2"})  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(other))
        other_developer_home, other_developer_workspace = tmp_path / "other-developer-home", tmp_path / "other-developer-workspace"
        other_workspace_child = other_developer_workspace / "child"
        for directory in (other_developer_home, other_developer_workspace, other_workspace_child): directory.mkdir()
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
            "capabilityBindingId": "capability:developer-other", "taskId": "task:hermes-two", "outcomeId": "outcome:2", "laneRunId": "lane:2", "role": "developer",
            "identity": "developer:other", "home": str(other_developer_home), "workspace": str(other_developer_workspace), "capabilitySecret": "o" * 32,
            "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }))
        for binding_id, identity, home, workspace in (
            ("capability:delivery-cross-identity", "developer:other", delivery_home, delivery_workspace),
            ("capability:delivery-cross-home", "delivery:cross-home", other_developer_home, delivery_workspace),
            ("capability:delivery-cross-workspace", "delivery:cross-workspace", delivery_home, other_workspace_child),
        ):
            with pytest.raises(ValueError, match="profile must remain isolated"):
                await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
                    "capabilityBindingId": binding_id, "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "delivery",
                    "identity": identity, "home": str(home), "workspace": str(workspace), "capabilitySecret": "c" * 32,
                    "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
                }))
        expired = await session.get(HermesRoleCapabilityBinding, "capability:developer-other")
        assert expired is not None
        expired.expires_at = datetime.now(UTC)
        await session.commit()
        accepted_after_expiry = await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
            "capabilityBindingId": "capability:delivery-expired-predecessor", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "delivery",
            "identity": "developer:other", "home": str(other_developer_home), "workspace": str(other_developer_workspace), "capabilitySecret": "e" * 32,
            "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }))
        assert accepted_after_expiry.capability_binding_id == "capability:delivery-expired-predecessor"
        adjudication_payload = {
            "reviewThreadAdjudicationId": "adjudication:one", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "reviewerIdentity": disposition["reviewerIdentity"], "reviewerHome": disposition["reviewerHome"], "reviewerWorkspace": disposition["reviewerWorkspace"],
            "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32, "reviewThreadId": "PRRT_hermes_one",
            "exactHeadSha": "a" * 40, "reviewAuditFingerprint": "b" * 64, "approvedReviewEvidenceId": snapshot.delivery_evidence_id,
            "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "adjudication:one", "createdAt": "2026-09-02T12:02:00Z",
            "expectedOutcomeRevision": outcome.revision, "expectedLaneRevision": lane.revision, "metadataOnly": True, "rawPayloadRetained": False,
        }
        malformed_adjudication = copy.deepcopy(adjudication_payload)
        malformed_adjudication["reviewThreadAdjudicationId"] = "Adjudication_1"
        with pytest.raises(ValueError, match="opaque"):
            HermesReviewThreadAdjudicationRequestV1.model_validate(malformed_adjudication)
        malformed_delivery = copy.deepcopy(audit)
        malformed_delivery.update({"requestedAction": "resolve_current_thread", "requestedReviewer": None, "reviewThreadId": "PRRT_hermes_one", "reviewThreadAdjudicationId": "Adjudication_1", "idempotencyKey": "delivery-audit:malformed-adjudication"})
        with pytest.raises(ValueError, match="opaque"):
            HermesDeliveryAuditRequestV1.model_validate(malformed_delivery)
        adjudication = await record_hermes_review_thread_adjudication(session, HermesReviewThreadAdjudicationRequestV1.model_validate(adjudication_payload))
        assert (await record_hermes_review_thread_adjudication(session, HermesReviewThreadAdjudicationRequestV1.model_validate(adjudication_payload))) == adjudication
        equal_time_refresh = copy.deepcopy(adjudication_payload)
        equal_time_refresh.update({"reviewThreadAdjudicationId": "adjudication:equal-time", "reviewAuditFingerprint": "c" * 64, "idempotencyKey": "adjudication:equal-time"})
        with pytest.raises(ValueError, match="strictly advance"):
            await record_hermes_review_thread_adjudication(session, HermesReviewThreadAdjudicationRequestV1.model_validate(equal_time_refresh))
        refreshed_adjudication = copy.deepcopy(adjudication_payload)
        refreshed_adjudication.update({"reviewThreadAdjudicationId": "adjudication:refreshed", "reviewAuditFingerprint": "c" * 64, "observedAt": "2026-09-02T12:03:00Z", "createdAt": "2026-09-02T12:03:00Z", "idempotencyKey": "adjudication:refreshed"})
        current_adjudication = await record_hermes_review_thread_adjudication(session, HermesReviewThreadAdjudicationRequestV1.model_validate(refreshed_adjudication))
        assert current_adjudication.review_audit_fingerprint == "c" * 64
        resolve = copy.deepcopy(distinct_bound)
        resolve.update({"requestedAction": "resolve_current_thread", "requestedReviewer": None, "reviewThreadId": adjudication.review_thread_id, "reviewThreadAdjudicationId": adjudication.review_thread_adjudication_id, "idempotencyKey": "delivery-audit:resolve"})
        with pytest.raises(ValueError, match="latest matching audit fingerprint"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(resolve))
        resolve.update({"reviewThreadAdjudicationId": current_adjudication.review_thread_adjudication_id, "idempotencyKey": "delivery-audit:resolve-current"})
        resolved = await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(resolve))
        assert (resolved.taskId, resolved.outcomeId, resolved.laneRunId, resolved.exactHeadSha, resolved.reviewThreadId, resolved.reviewThreadAdjudicationId) == (
            "task:hermes-one", "outcome:1", "lane:1", "a" * 40, "PRRT_hermes_one", "adjudication:refreshed",
        )
        assert resolved.reasonCode == "fresh_workspace_adjudication_required"
        mismatched_thread = copy.deepcopy(resolve); mismatched_thread.update({"reviewThreadId": "PRRT_other", "idempotencyKey": "delivery-audit:resolve-other"})
        with pytest.raises(ValueError, match="exact persisted Reviewer adjudication"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(mismatched_thread))
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
    verification = {"verificationRecordId": "verification:denied", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "verifiedHeadSha": "a" * 40, "developerIdentity": "developer:denied", "developerHome": str(developer_home), "developerWorkspace": str(developer_workspace), "evidenceRefs": ["evidence:hermes-ledger-1"], "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:denied", "createdAt": "2026-09-02T12:01:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}
    disposition = {"reviewDispositionId": "review:denied", "verificationRecordId": "verification:denied", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "hermes_review_disposition.v1", "disposition": "approve", "reviewerIdentity": "reviewer:denied", "reviewerHome": str(reviewer_home), "reviewerWorkspace": str(developer_workspace), "reasonCode": "reviewed", "nextAction": "Hold for delivery.", "reviewedHeadSha": "a" * 40, "evidenceRefs": ["evidence:hermes-ledger-1"], "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "review:denied", "createdAt": "2026-09-02T12:02:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        with pytest.raises(ValueError, match="Reviewer capability"):
            HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition})
        assert (await read_hermes_outcome(session, "outcome:1")).currentResult == "retryable"  # type: ignore[union-attr]
        for role, binding_id, secret, identity, home, workspace in (("developer", "capability:developer-denied", "d" * 32, verification["developerIdentity"], verification["developerHome"], verification["developerWorkspace"]), ("reviewer", "capability:reviewer-denied", "r" * 32, disposition["reviewerIdentity"], disposition["reviewerHome"], disposition["reviewerWorkspace"])):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({"capabilityBindingId": binding_id, "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": role, "identity": identity, "home": home, "workspace": workspace, "capabilitySecret": secret, "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}))
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
        "verificationRecordId": "verification:exception", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "verifiedHeadSha": "a" * 40, "developerIdentity": "developer:exception", "developerHome": "home:developer-exception", "developerWorkspace": "workspace:developer-exception", "evidenceRefs": ["evidence:hermes-ledger-1"], "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:exception", "createdAt": "2026-09-02T12:01:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    disposition = {
        "reviewDispositionId": "review:exception", "verificationRecordId": "verification:exception", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "hermes_review_disposition.v1", "disposition": "technical_block", "reviewerIdentity": "reviewer:unavailable", "reviewerHome": "home:reviewer-unavailable", "reviewerWorkspace": "workspace:reviewer-unavailable", "reasonCode": "reviewer_unavailable", "nextAction": "Return the original Developer lane after an Operator-recorded technical block.", "reviewedHeadSha": None, "evidenceRefs": ["evidence:hermes-ledger-1"], "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "review:exception", "createdAt": "2026-09-02T12:02:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    exception = {"exceptionId": "exception:reviewer-unavailable", "outcomeId": "outcome:1", "laneRunId": "lane:1", "reason": "reviewer_unavailable", "riskClass": "technical_block", "compensatingReviewRef": "review:later", "recordedBy": "operator:local", "recordedAt": "2026-09-02T12:01:30Z", "reviewOrExpiryAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}
    developer_home, developer_workspace = tmp_path / "developer-home", tmp_path / "developer-workspace"
    reviewer_home, reviewer_workspace = tmp_path / "reviewer-home", tmp_path / "reviewer-workspace"
    for directory in (developer_home, developer_workspace, reviewer_home, reviewer_workspace): directory.mkdir()
    verification["developerHome"], verification["developerWorkspace"] = str(developer_home), str(developer_workspace)
    disposition["reviewerHome"], disposition["reviewerWorkspace"] = str(reviewer_home), str(reviewer_workspace)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({"capabilityBindingId": "capability:developer-exception", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "developer", "identity": verification["developerIdentity"], "home": verification["developerHome"], "workspace": verification["developerWorkspace"], "capabilitySecret": "d" * 32, "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}))
        await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:developer-exception", "developerCapabilityProof": "d" * 32}))
        overlap = copy.deepcopy(disposition); overlap["reviewDispositionId"] = "review:exception-overlap"; overlap["idempotencyKey"] = "review:exception-overlap"; overlap["reviewerWorkspace"] = verification["developerWorkspace"]
        denied = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": overlap, "unavailableReviewerException": exception}), operator_identity="operator:local", commit=False)
        assert denied.currentResult == "deniedPolicy"
        await session.rollback()
        request = HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "unavailableReviewerException": exception})
        blocked = await ingest_hermes_review_handoff(session, request, operator_identity="operator:local")
        assert blocked.currentResult == "blockedTechnical"
        assert await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.evidence_type == "approved_review_handoff")) is None
        with pytest.raises(ValueError, match="authenticated Operator"):
            await ingest_hermes_review_handoff(session, request, operator_identity="operator:other")
    await engine.dispose()


@pytest.mark.asyncio
async def test_failed_verification_does_not_mint_delivery_admissible_review_evidence(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'failed-delivery-snapshot.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    initial = payload(); initial["laneRun"]["status"] = "review"  # type: ignore[index]
    developer_home, developer_workspace = tmp_path / "developer-home", tmp_path / "developer-workspace"
    developer_home.mkdir(); developer_workspace.mkdir()
    verification = {
        "verificationRecordId": "verification:failed", "outcomeId": "outcome:1", "laneRunId": "lane:1",
        "schemaVersion": "hermes_verification_record.v1", "result": "failed", "target": "test:hermes",
        "sourceFingerprint": "sha256:ledger-proof", "verifiedHeadSha": None, "developerIdentity": "developer:failed",
        "developerHome": str(developer_home), "developerWorkspace": str(developer_workspace), "evidenceRefs": ["evidence:1"],
        "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:failed", "createdAt": "2026-09-02T12:01:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequestV1.model_validate({
            "capabilityBindingId": "capability:developer-failed", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1", "role": "developer",
            "identity": verification["developerIdentity"], "home": verification["developerHome"], "workspace": verification["developerWorkspace"], "capabilitySecret": "d" * 32,
            "createdAt": "2026-09-02T12:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }))
        projection = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:developer-failed", "developerCapabilityProof": "d" * 32}))
        assert projection.currentResult == "rework"
        assert await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.evidence_type == "approved_review_handoff")) is None
    await engine.dispose()
