import copy

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.hermes_outcomes import (
    _update_if_current,
    ingest_hermes_ledger,
    ingest_hermes_review_handoff,
    provision_hermes_role_capability,
    record_hermes_delivery_audit,
    record_hermes_review_thread_adjudication,
    read_hermes_lane_run,
    read_hermes_outcome,
)
from supervisor.api.schemas import HermesDeliveryAuditRequestV1, HermesLedgerIngestRequest, HermesReviewDispositionInputV1, HermesReviewHandoffRequest, HermesReviewThreadAdjudicationRequestV1, HermesRoleCapabilityProvisionRequestV1
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.migrations import MIGRATIONS, SCHEMA_MIGRATIONS_TABLE, upgrade_database
from supervisor.infrastructure.db.models import HermesDeliveryEvidence, HermesLaneRun, HermesOutcome
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
    assert revisions == tuple(migration.revision for migration in MIGRATIONS)
    assert {"hermes_outcomes", "hermes_lane_runs", "hermes_delivery_evidence", "hermes_ledger_events"} <= tables
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
        "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:one",
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
            "schemaVersion": "hermes_delivery_audit_action.v1", "repository": "slawdawg/Kendall-vnxt", "baseBranch": "dev", "expectedHeadSha": "a" * 40,
            "pullRequestNumber": 1, "requestedAction": "request_review", "policyEvidenceRef": snapshot.delivery_evidence_id,
            "localVerificationRef": snapshot.delivery_evidence_id, "rollbackRef": snapshot.delivery_evidence_id, "evidenceRefs": [snapshot.delivery_evidence_id],
            "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "delivery-audit:one", "createdAt": "2026-09-02T12:02:00Z",
            "expectedOutcomeRevision": outcome.revision, "expectedLaneRevision": lane.revision, "metadataOnly": True, "rawPayloadRetained": False,
        }
        stale = copy.deepcopy(audit); stale["idempotencyKey"] = "delivery-audit:stale"; stale["policyEvidenceRef"] = stale["localVerificationRef"] = stale["rollbackRef"] = "evidence:1"; stale["evidenceRefs"] = ["evidence:1"]
        with pytest.raises(ValueError, match="approved-review evidence"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(stale))
        cross_task = copy.deepcopy(audit); cross_task["taskId"] = "task:other-one"; cross_task["idempotencyKey"] = "delivery-audit:other-task"
        with pytest.raises(ValueError, match="current bound outcome"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(cross_task))
        predated = copy.deepcopy(audit); predated["idempotencyKey"] = "delivery-audit:predated"; predated["createdAt"] = predated["observedAt"] = "2026-09-02T12:00:00Z"
        with pytest.raises(ValueError, match="cannot predate"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(predated))
        admitted = await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(audit))
        assert admitted.decision == "allowed" and admitted.requestedAction == "request_review"
        assert await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(audit)) == admitted
        altered_replay = copy.deepcopy(audit); altered_replay["pullRequestNumber"] = 2
        with pytest.raises(ValueError, match="idempotency conflicts"):
            await record_hermes_delivery_audit(session, HermesDeliveryAuditRequestV1.model_validate(altered_replay))
        persisted_audit = await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.idempotency_key == "delivery-audit:one"))
        assert persisted_audit is not None and persisted_audit.task_id == "task:hermes-one"
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
        adjudication_payload = {
            "reviewThreadAdjudicationId": "adjudication:one", "taskId": "task:hermes-one", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "reviewerIdentity": disposition["reviewerIdentity"], "reviewerHome": disposition["reviewerHome"], "reviewerWorkspace": disposition["reviewerWorkspace"],
            "reviewerCapabilityBindingId": "capability:reviewer", "reviewerCapabilityProof": "r" * 32, "reviewThreadId": "PRRT_hermes_one",
            "exactHeadSha": "a" * 40, "reviewAuditFingerprint": "b" * 64, "approvedReviewEvidenceId": snapshot.delivery_evidence_id,
            "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "adjudication:one", "createdAt": "2026-09-02T12:02:00Z",
            "expectedOutcomeRevision": outcome.revision, "expectedLaneRevision": lane.revision, "metadataOnly": True, "rawPayloadRetained": False,
        }
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
        resolve = copy.deepcopy(audit)
        resolve.update({"requestedAction": "resolve_current_thread", "reviewThreadId": adjudication.review_thread_id, "reviewThreadAdjudicationId": adjudication.review_thread_adjudication_id, "idempotencyKey": "delivery-audit:resolve"})
        with pytest.raises(ValueError, match="freshest exact adjudication"):
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
    verification = {"verificationRecordId": "verification:denied", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:denied", "developerHome": str(developer_home), "developerWorkspace": str(developer_workspace), "evidenceRefs": ["evidence:hermes-ledger-1"], "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:denied", "createdAt": "2026-09-02T12:01:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}
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
        "verificationRecordId": "verification:exception", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:exception", "developerHome": "home:developer-exception", "developerWorkspace": "workspace:developer-exception", "evidenceRefs": ["evidence:hermes-ledger-1"], "observedAt": "2026-09-02T12:01:00Z", "idempotencyKey": "verification:exception", "createdAt": "2026-09-02T12:01:00Z", "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
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
        "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:failed",
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
