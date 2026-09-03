import copy
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
from tempfile import mkdtemp

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application import hermes_outcomes
from supervisor.application.hermes_outcomes import (
    _update_if_current,
    ingest_hermes_ledger,
    ingest_hermes_review_handoff,
    provision_hermes_role_capability,
    revoke_hermes_role_capability,
    recover_hermes_technical_block,
    read_hermes_lane_run,
    read_hermes_outcome,
)
from supervisor.api.schemas import HermesBoardLifecycleEventInputV1, HermesLedgerIngestRequest, HermesReviewHandoffRequest, HermesRoleCapabilityProvisionRequest, HermesTechnicalBlockRecoveryRequest, HermesUnavailableReviewerBlockInputV1
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.migrations import MIGRATIONS, SCHEMA_MIGRATIONS_TABLE, upgrade_database
from supervisor.infrastructure.db.models import HermesDeliveryEvidence, HermesLaneRun, HermesLedgerEvent, HermesOutcome, HermesReviewDisposition, HermesRoleCapabilityBinding, HermesUnavailableReviewerRequirement, HermesVerificationRecord
from supervisor.domain.hermes_control_plane import can_replace_current_result
from test_hermes_control_plane import payload


ROLE_PROFILE_ROOT = Path(mkdtemp(prefix="hermes-role-profile-"))
for _profile_name in ("developer-home", "developer-workspace", "reviewer-home", "reviewer-workspace", "operator-home", "operator-workspace"):
    profile_root = ROLE_PROFILE_ROOT / _profile_name
    profile_root.mkdir(mode=0o700)
    profile_root.chmod(0o700)


@pytest.mark.asyncio
async def test_hermes_ledger_is_idempotent_conflict_fenced_and_metadata_only(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'ledger.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    request = HermesLedgerIngestRequest.model_validate(payload())
    initial_review = payload(); initial_review["outcome"]["status"] = "review"; initial_review["laneRun"]["status"] = "review"  # type: ignore[index]
    async with sessions() as session:
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial_review))
    async with sessions() as session:
        first = await ingest_hermes_ledger(session, request)
        replay = await ingest_hermes_ledger(session, request)
        assert first == replay and first.currentLaneRunId == "lane:1" and first.recoveryState == "recovering"
    conflict = copy.deepcopy(payload()); conflict["event"]["reasonCode"] = "changed"  # type: ignore[index]
    async with sessions() as session:
        with pytest.raises(ValueError, match="idempotency"): await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(conflict))
        coupled_conflict = copy.deepcopy(payload()); coupled_conflict["outcome"]["title"] = "Changed title"  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"): await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(coupled_conflict))
        bypass = copy.deepcopy(payload()); bypass["event"]["eventName"] = "hermes.review.disposition.recorded"; bypass["event"]["eventId"] = "event:review-bypass"; bypass["event"]["idempotencyKey"] = "event:review-bypass"; bypass["event"]["result"] = "completed"; bypass["outcome"]["status"] = "completed"; bypass["outcome"]["result"] = "completed"; bypass["laneRun"]["status"] = "completed"; bypass["laneRun"]["result"] = "completed"  # type: ignore[index]
        with pytest.raises(ValueError, match="invalid closed state|independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(bypass))
        bypass = copy.deepcopy(payload()); bypass["event"]["eventName"] = "hermes.lane.recovered"; bypass["event"]["eventId"] = "event:completion-bypass"; bypass["event"]["idempotencyKey"] = "event:completion-bypass"; bypass["event"]["result"] = "completed"; bypass["outcome"]["status"] = "completed"; bypass["outcome"]["result"] = "completed"; bypass["laneRun"]["status"] = "completed"; bypass["laneRun"]["result"] = "completed"  # type: ignore[index]
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(bypass))
        initial_completion = payload(); initial_completion["event"]["eventId"] = "event:initial-completion"; initial_completion["event"]["idempotencyKey"] = "event:initial-completion"; initial_completion["event"]["result"] = "completed"; initial_completion["outcome"]["status"] = "completed"; initial_completion["outcome"]["result"] = "completed"; initial_completion["laneRun"]["status"] = "completed"; initial_completion["laneRun"]["result"] = "completed"  # type: ignore[index]
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial_completion))
        status_only_completion = payload(); status_only_completion["event"]["eventId"] = "event:status-only-completion"; status_only_completion["event"]["idempotencyKey"] = "event:status-only-completion"; status_only_completion["outcome"]["status"] = "completed"; status_only_completion["laneRun"]["status"] = "completed"  # type: ignore[index]
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(status_only_completion))
        projection = await read_hermes_outcome(session, "outcome:1")
        assert projection is not None and projection.reasonCode == "verification_pending"
    async with engine.begin() as connection:
        assert await connection.scalar(text("SELECT COUNT(*) FROM hermes_ledger_events")) == 1
    await engine.dispose()


def test_hermes_ledger_rejects_pre_handoff_restricted_event_at_public_ingress():
    legacy = payload(); legacy["event"]["eventName"] = "hermes.review.disposition.recorded"  # type: ignore[index]
    with pytest.raises(ValueError, match="invalid closed state"):
        HermesLedgerIngestRequest.model_validate(legacy)


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
    assert {"hermes_outcomes", "hermes_lane_runs", "hermes_delivery_evidence", "hermes_ledger_events", "hermes_verification_records", "hermes_review_dispositions"} <= tables
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_verification_revision_migration_upgrades_an_existing_0008_table(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-upgrade.db'}")
    async with engine.begin() as connection:
        await connection.execute(text(f"CREATE TABLE {SCHEMA_MIGRATIONS_TABLE} (revision VARCHAR(80) PRIMARY KEY)"))
        applied_prefix = tuple(migration for migration in MIGRATIONS if migration.revision <= "0008_hermes_review_handoff")
        assert applied_prefix[-1].revision == "0008_hermes_review_handoff"
        for migration in applied_prefix:
            await connection.execute(text(f"INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (revision) VALUES (:revision)"), {"revision": migration.revision})
        await connection.execute(text("CREATE TABLE admission_locks (scope VARCHAR(32) PRIMARY KEY, generation INTEGER NOT NULL)"))
        await connection.run_sync(lambda sync_connection: HermesVerificationRecord.metadata.create_all(sync_connection, tables=[HermesVerificationRecord.__table__]))
        await connection.execute(text("ALTER TABLE hermes_verification_records DROP COLUMN expected_outcome_revision"))
        await connection.execute(text("ALTER TABLE hermes_verification_records DROP COLUMN expected_lane_revision"))
        await connection.execute(text("ALTER TABLE hermes_verification_records DROP COLUMN schema_version"))
        await connection.execute(text("ALTER TABLE hermes_verification_records DROP COLUMN revision_binding_known"))
        await connection.execute(text("DROP INDEX IF EXISTS ix_hermes_verification_records_developer_capability_binding_id"))
        await connection.execute(text("ALTER TABLE hermes_verification_records DROP COLUMN developer_capability_binding_id"))
        await upgrade_database(connection)
        columns = {row[1]: row for row in (await connection.execute(text("PRAGMA table_info(hermes_verification_records)"))).all()}
    assert {"schema_version", "expected_outcome_revision", "expected_lane_revision", "revision_binding_known", "developer_capability_binding_id"} <= set(columns)
    assert str(columns["revision_binding_known"][4]).lower() in {"0", "false"}
    await engine.dispose()


def review_handoff(disposition="approve"):
    now = "2026-09-02T12:02:00Z"
    return {"verification": {"verificationRecordId": "verification:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:one", "developerHome": str(ROLE_PROFILE_ROOT / "developer-home"), "developerWorkspace": str(ROLE_PROFILE_ROOT / "developer-workspace"), "evidenceRefs": ["evidence:1"], "observedAt": now, "idempotencyKey": "verification:1", "createdAt": now, "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}, "disposition": {"reviewDispositionId": f"review:{disposition}", "verificationRecordId": "verification:1", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "review_disposition.v1", "disposition": disposition, "reviewerIdentity": "reviewer:one", "reviewerHome": str(ROLE_PROFILE_ROOT / "reviewer-home"), "reviewerWorkspace": str(ROLE_PROFILE_ROOT / "reviewer-workspace"), "reasonCode": "reviewed", "nextAction": "Hold for later delivery adapter.", "evidenceRefs": ["evidence:1"], "observedAt": now, "idempotencyKey": f"review:{disposition}", "createdAt": now, "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}}


async def _provision_two_roles(session, handoff):
    verification, disposition = handoff["verification"], handoff["disposition"]
    for role, binding_id, secret, identity, home, workspace in (
        ("developer", "capability:developer", "d" * 32, verification["developerIdentity"], verification["developerHome"], verification["developerWorkspace"]),
        ("reviewer", "capability:reviewer", "r" * 32, disposition["reviewerIdentity"], disposition["reviewerHome"], disposition["reviewerWorkspace"]),
    ):
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate({"capabilityBindingId": binding_id, "role": role, "outcomeId": verification["outcomeId"], "laneRunId": verification["laneRunId"], "identity": identity, "home": home, "workspace": workspace, "capabilitySecret": secret, "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}), provisioned_by_operator_id="operator:fixture")


@pytest.mark.asyncio
async def test_role_capability_revocation_is_idempotent_and_prevents_handoff(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-revocation.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        revoked = await revoke_hermes_role_capability(session, capability_binding_id="capability:developer", revoked_by_operator_id="operator:fixture")
        assert revoked.revoked_at is not None and revoked.revoked_by_operator_id == "operator:fixture"
        assert await revoke_hermes_role_capability(session, capability_binding_id="capability:developer", revoked_by_operator_id="operator:fixture") == revoked
        with pytest.raises(ValueError, match="already revoked by another Operator"):
            await revoke_hermes_role_capability(session, capability_binding_id="capability:developer", revoked_by_operator_id="operator:other")
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_revocation_rereads_a_sqlite_race_for_exact_replay(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-revocation-race.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as seed:
        await ingest_hermes_ledger(seed, HermesLedgerIngestRequest.model_validate(payload()))
        await _provision_two_roles(seed, review_handoff())
    async with sessions() as stale, sessions() as winner:
        assert await stale.get(HermesRoleCapabilityBinding, "capability:developer") is not None
        revoked = await revoke_hermes_role_capability(winner, capability_binding_id="capability:developer", revoked_by_operator_id="operator:fixture")
        replay = await revoke_hermes_role_capability(stale, capability_binding_id="capability:developer", revoked_by_operator_id="operator:fixture")
        assert replay.revoked_at == revoked.revoked_at and replay.revoked_by_operator_id == "operator:fixture"
    async with sessions() as conflict:
        with pytest.raises(ValueError, match="already revoked by another Operator"):
            await revoke_hermes_role_capability(conflict, capability_binding_id="capability:developer", revoked_by_operator_id="operator:other")
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_canonicalizes_existing_profile_paths(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'canonical-capability-paths.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    developer_home, developer_workspace = tmp_path / "developer-home", tmp_path / "developer-workspace"
    reviewer_workspace_alias = tmp_path / "reviewer-alias"
    developer_home.mkdir(); developer_workspace.mkdir(); reviewer_workspace_alias.symlink_to(developer_workspace, target_is_directory=True)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:canonical", "role": "developer", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "developer:one", "home": str(developer_home), "workspace": str(reviewer_workspace_alias), "capabilitySecret": "d" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        binding = await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
        assert binding.workspace == str(developer_workspace.resolve())
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_bootstraps_explicit_operator_profile_roots(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bootstrapped-capability-paths.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    operator_home, operator_workspace = tmp_path / "operator-home", tmp_path / "operator-workspace"
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:operator-bootstrap", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "018f7f40-5f4d-7b8c-9d5e-6f7a8b9c0d1e", "home": str(operator_home), "workspace": str(operator_workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        assert not operator_home.exists() and not operator_workspace.exists()
        binding = await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
        assert operator_home.is_dir() and operator_workspace.is_dir()
        assert (binding.identity, binding.home, binding.workspace) == (request.identity, str(operator_home.resolve()), str(operator_workspace.resolve()))
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_requires_one_owner_private_runtime_parent(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-runtime-parent.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    runtime_root, profiles_root, workspace_root, other_root = tmp_path / "runtime", tmp_path / "runtime" / "profiles", tmp_path / "workspace", tmp_path / "other-runtime"
    runtime_root.mkdir(mode=0o700); profiles_root.mkdir(mode=0o700); workspace_root.mkdir(mode=0o700); other_root.mkdir(mode=0o700)
    workspace = workspace_root / "operator-workspace"; workspace.mkdir(mode=0o700)
    request_data = {
        "capabilityBindingId": "capability:runtime-parent", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
        "identity": "operator:one", "home": str(other_root / "operator-home"), "workspace": str(workspace), "capabilitySecret": "o" * 32,
        "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
    }
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        with pytest.raises(ValueError, match="inside the configured runtime root"):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate(request_data), provisioned_by_operator_id="operator:fixture", runtime_root=str(runtime_root))
        request_data["home"] = str(profiles_root / "operator-home")
        binding = await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate(request_data), provisioned_by_operator_id="operator:fixture", runtime_root=str(runtime_root))
        assert binding.home == str((profiles_root / "operator-home").resolve()) and binding.workspace == str(workspace.resolve())
        runtime_root.chmod(0o700)
        profiles_root.chmod(0o755)
        request_data.update({"capabilityBindingId": "capability:runtime-parent-private", "home": str(profiles_root / "operator-home-private")})
        with pytest.raises(ValueError, match="owner-private"):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate(request_data), provisioned_by_operator_id="operator:fixture", runtime_root=str(runtime_root))
        assert not (profiles_root / "operator-home-private").exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_removes_bootstrapped_roots_after_commit_conflict(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-bootstrap-commit-conflict.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    runtime_root = tmp_path / "runtime"; profiles_root = runtime_root / "profiles"; workspace_root = tmp_path / "workspace"
    runtime_root.mkdir(mode=0o700); profiles_root.mkdir(mode=0o700); workspace_root.mkdir(mode=0o700)
    home, workspace = profiles_root / "operator-home", workspace_root / "operator-workspace"; workspace.mkdir(mode=0o700)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:commit-conflict", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "operator:one", "home": str(home), "workspace": str(workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        async def conflict_commit():
            raise IntegrityError("INSERT", {}, RuntimeError("forced conflict"))
        monkeypatch.setattr(session, "commit", conflict_commit)
        with pytest.raises(ValueError, match="persistence conflict"):
            await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture", runtime_root=str(runtime_root))
        assert not home.exists() and workspace.exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_removes_bootstrapped_roots_after_non_integrity_commit_failure(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-bootstrap-commit-error.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    runtime_root = tmp_path / "runtime"; profiles_root = runtime_root / "profiles"; workspace_root = tmp_path / "workspace"
    runtime_root.mkdir(mode=0o700); profiles_root.mkdir(mode=0o700); workspace_root.mkdir(mode=0o700)
    home, workspace = profiles_root / "operator-home", workspace_root / "operator-workspace"; workspace.mkdir(mode=0o700)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:commit-error", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "operator:one", "home": str(home), "workspace": str(workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        async def failed_commit():
            raise RuntimeError("forced database failure")
        cleanup_lock_held = False

        @asynccontextmanager
        async def profile_parent_lock(*roots):
            nonlocal cleanup_lock_held
            cleanup_lock_held = True
            try:
                yield
            finally:
                cleanup_lock_held = False

        original_cleanup = hermes_outcomes._remove_unbound_bootstrapped_role_profile_roots

        async def cleanup_while_profile_parent_lock_is_held(*args):
            assert cleanup_lock_held
            await original_cleanup(*args)

        monkeypatch.setattr(hermes_outcomes, "_lock_role_profile_parents", profile_parent_lock)
        monkeypatch.setattr(hermes_outcomes, "_remove_unbound_bootstrapped_role_profile_roots", cleanup_while_profile_parent_lock_is_held)
        monkeypatch.setattr(session, "commit", failed_commit)
        with pytest.raises(RuntimeError, match="forced database failure"):
            await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture", runtime_root=str(runtime_root))
        assert not home.exists() and workspace.exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_cleanup_preserves_a_root_adopted_by_a_concurrent_binding(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-bootstrap-adopted-root.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    home, workspace = tmp_path / "adopted-home", tmp_path / "adopted-workspace"
    home.mkdir(); workspace.mkdir()
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        session.add(HermesRoleCapabilityBinding(
            capability_binding_id="capability:adopted-root", outcome_id="outcome:1", lane_run_id="lane:1", role="operator",
            identity="operator:one", home=str(home), workspace=str(workspace), capability_digest_sha256="a" * 64,
            expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc), revoked_at=None, revoked_by_operator_id=None,
            provisioned_by_operator_id="operator:fixture", created_at=datetime(2026, 9, 2, 12, tzinfo=timezone.utc), metadata_only=True, raw_payload_retained=False,
        ))
        await session.commit()
    async with sessions() as session:
        await hermes_outcomes._remove_unbound_bootstrapped_role_profile_roots(session, [home])
    assert home.exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_profile_parent_lock_releases_prior_lock_when_cancelled(monkeypatch):
    first, second = asyncio.Lock(), asyncio.Lock()
    monkeypatch.setattr(hermes_outcomes, "_ROLE_PROFILE_PARENT_LOCKS", {"first": first, "second": second})
    await second.acquire()

    async def wait_for_profile_locks():
        async with hermes_outcomes._lock_role_profile_parents(Path("first/home"), Path("second/workspace")):
            pass

    task = asyncio.create_task(wait_for_profile_locks())
    await asyncio.sleep(0)
    assert first.locked()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not first.locked()
    second.release()


@pytest.mark.asyncio
async def test_role_capability_provisioning_rejects_symlinked_home_overlap_before_bootstrap(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bootstrapped-capability-overlap.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    canonical_home, home_alias = tmp_path / "canonical-home", tmp_path / "home-alias"
    canonical_home.mkdir(); home_alias.symlink_to(canonical_home, target_is_directory=True)
    nested_workspace = canonical_home / "workspace"
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:operator-symlink-overlap", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "operator:one", "home": str(home_alias), "workspace": str(nested_workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        with pytest.raises(ValueError, match="disjoint"):
            await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
        assert not nested_workspace.exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_rejects_root_resolving_profile_symlink(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bootstrapped-capability-root-symlink.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    root_alias, operator_workspace = tmp_path / "root-alias", tmp_path / "operator-workspace"
    root_alias.symlink_to("/", target_is_directory=True)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:operator-root-symlink", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "operator:one", "home": str(root_alias), "workspace": str(operator_workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        with pytest.raises(ValueError, match="cannot resolve to filesystem root"):
            await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
        assert not operator_workspace.exists()
    await engine.dispose()


def test_role_capability_bootstrap_revalidates_a_home_replaced_by_symlink_after_mkdir_race(tmp_path, monkeypatch):
    runtime_root, profiles_root, workspace_root = tmp_path / "runtime", tmp_path / "runtime" / "profiles", tmp_path / "workspace"
    runtime_root.mkdir(mode=0o700); profiles_root.mkdir(mode=0o700); workspace_root.mkdir(mode=0o700)
    home, workspace, outside_home = profiles_root / "operator-home", workspace_root / "operator-workspace", tmp_path / "outside-home"
    workspace.mkdir(mode=0o700); outside_home.mkdir(mode=0o700)
    original_mkdir = Path.mkdir

    def replace_home_with_symlink(self, *args, **kwargs):
        if self == home:
            home.symlink_to(outside_home, target_is_directory=True)
            raise FileExistsError
        return original_mkdir(self, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", replace_home_with_symlink)
    with pytest.raises(ValueError, match="inside the configured runtime root"):
        hermes_outcomes._bootstrap_role_profile(str(home), str(workspace), runtime_root=str(runtime_root))


@pytest.mark.asyncio
async def test_role_capability_provisioning_does_not_bootstrap_conflicting_replay_roots(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-conflict-no-bootstrap.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    existing_home, existing_workspace = tmp_path / "existing-home", tmp_path / "existing-workspace"
    rejected_home, rejected_workspace = tmp_path / "rejected-home", tmp_path / "rejected-workspace"
    existing_home.mkdir(); existing_workspace.mkdir()
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        initial_data = {
            "capabilityBindingId": "capability:conflicting-replay", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "operator:one", "home": str(existing_home), "workspace": str(existing_workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate(initial_data), provisioned_by_operator_id="operator:fixture")
        conflict = HermesRoleCapabilityProvisionRequest.model_validate({**initial_data, "home": str(rejected_home), "workspace": str(rejected_workspace)})
        with pytest.raises(ValueError, match="conflicts with persisted metadata"):
            await provision_hermes_role_capability(session, conflict, provisioned_by_operator_id="operator:fixture")
        assert not rejected_home.exists() and not rejected_workspace.exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_rolls_back_partial_bootstrap_failure(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-bootstrap-rollback.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    operator_home, operator_workspace = tmp_path / "operator-home", tmp_path / "operator-workspace"
    original_mkdir = Path.mkdir

    def fail_workspace_mkdir(path, *args, **kwargs):
        if path == operator_workspace:
            raise OSError("forced workspace bootstrap failure")
        return original_mkdir(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", fail_workspace_mkdir)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:operator-bootstrap-rollback", "role": "operator", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "operator:one", "home": str(operator_home), "workspace": str(operator_workspace), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        with pytest.raises(OSError, match="forced workspace bootstrap failure"):
            await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
        assert not operator_home.exists() and not operator_workspace.exists()
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_persists_created_at_and_fences_changed_replay(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-created-at.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request_data = {
            "capabilityBindingId": "capability:created-at", "role": "developer", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "developer:one", "home": str(ROLE_PROFILE_ROOT / "developer-home"), "workspace": str(ROLE_PROFILE_ROOT / "developer-workspace"), "capabilitySecret": "d" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }
        request = HermesRoleCapabilityProvisionRequest.model_validate(request_data)
        binding = await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
        assert binding.created_at.replace(tzinfo=timezone.utc) == request.createdAt
        assert await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture") == binding
        changed = HermesRoleCapabilityProvisionRequest.model_validate({**request_data, "createdAt": "2026-09-02T12:01:00Z"})
        with pytest.raises(ValueError, match="conflicts with persisted metadata"):
            await provision_hermes_role_capability(session, changed, provisioned_by_operator_id="operator:fixture")
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_rejects_canonical_overlap_and_expiry(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-profile-fences.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    profile_home, nested_workspace = tmp_path / "profile-home", tmp_path / "profile-home" / "workspace"
    profile_home.mkdir(); nested_workspace.mkdir()
    independent_home, independent_workspace = tmp_path / "independent-home", tmp_path / "independent-workspace"
    independent_home.mkdir(); independent_workspace.mkdir()
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        overlapping = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:overlap", "role": "developer", "outcomeId": "outcome:1", "laneRunId": "lane:1",
            "identity": "developer:overlap", "home": str(profile_home), "workspace": str(nested_workspace), "capabilitySecret": "d" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        })
        with pytest.raises(ValueError, match="disjoint"):
            await provision_hermes_role_capability(session, overlapping, provisioned_by_operator_id="operator:fixture")
        with pytest.raises(ValueError, match="future"):
            HermesRoleCapabilityProvisionRequest.model_validate({
                "capabilityBindingId": "capability:expired", "role": "developer", "outcomeId": "outcome:1", "laneRunId": "lane:1",
                "identity": "developer:expired", "home": str(independent_home), "workspace": str(independent_workspace), "capabilitySecret": "e" * 32,
                "expiresAt": "2020-01-01T00:00:00Z", "createdAt": "2019-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            })
        future_created = (datetime.now(timezone.utc) + timedelta(minutes=6)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with pytest.raises(ValueError, match="creation cannot be materially future-dated"):
            HermesRoleCapabilityProvisionRequest.model_validate({
                "capabilityBindingId": "capability:future-created", "role": "developer", "outcomeId": "outcome:1", "laneRunId": "lane:1",
                "identity": "developer:future", "home": str(independent_home), "workspace": str(independent_workspace), "capabilitySecret": "f" * 32,
                "expiresAt": "2099-01-01T00:00:00Z", "createdAt": future_created, "metadataOnly": True, "rawPayloadRetained": False,
            })
        with pytest.raises(ValueError, match="identity must be opaque"):
            HermesRoleCapabilityProvisionRequest.model_validate({
                "capabilityBindingId": "capability:opaque-identity", "role": "developer", "outcomeId": "outcome:1", "laneRunId": "lane:1",
                "identity": "Developer One", "home": str(independent_home), "workspace": str(independent_workspace), "capabilitySecret": "g" * 32,
                "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            })
        with pytest.raises(ValueError, match="Legacy non-opaque Hermes outcome and lane IDs fail closed"):
            HermesRoleCapabilityProvisionRequest.model_validate({
                "capabilityBindingId": "capability:legacy-ledger-id", "role": "developer", "outcomeId": "Outcome One", "laneRunId": "lane:1",
                "identity": "developer:legacy", "home": str(independent_home), "workspace": str(independent_workspace), "capabilitySecret": "h" * 32,
                "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            })
    await engine.dispose()


def _developer_request(handoff):
    request = copy.deepcopy(handoff)
    request.pop("disposition", None)
    request.pop("unavailableReviewerException", None)
    request["developerCapabilityBindingId"] = "capability:developer"
    request["developerCapabilityProof"] = "d" * 32
    return request


def _reviewer_request(handoff):
    request = copy.deepcopy(handoff)
    request["reviewerCapabilityBindingId"] = "capability:reviewer"
    request["reviewerCapabilityProof"] = "r" * 32
    return request


async def _record_verification(session, handoff):
    await _provision_two_roles(session, handoff)
    return await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))


async def _record_then_dispose(session, handoff):
    await _record_verification(session, handoff)
    return await ingest_hermes_review_handoff(
        session,
        HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)),
        authenticated_recorder_id="operator:fixture" if handoff.get("unavailableReviewerException") else None,
    )


@pytest.mark.asyncio
async def test_operator_capability_records_unavailable_reviewer_block_without_reviewer_proof(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'operator-unavailable-reviewer.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _record_verification(session, handoff)
        verification = handoff["verification"]
        recovery_event = await session.get(HermesLedgerEvent, "event:verification:" + sha256(verification["verificationRecordId"].encode("utf-8")).hexdigest())
        assert recovery_event is not None
        recovery_event.event_name = "hermes.lane.recovered"
        await session.commit()
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:operator", "role": "operator", "outcomeId": verification["outcomeId"], "laneRunId": verification["laneRunId"],
            "identity": "operator:fixture", "home": str(ROLE_PROFILE_ROOT / "operator-home"), "workspace": str(ROLE_PROFILE_ROOT / "operator-workspace"), "capabilitySecret": "o" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
        }), provisioned_by_operator_id="operator:fixture")
        request = {
            "verification": verification,
            "unavailableReviewerException": {"exceptionId": "exception:operator-block", "outcomeId": "outcome:1", "laneRunId": "lane:1", "reason": "reviewer_unavailable", "riskClass": "technical_block", "compensatingReviewRef": "evidence:compensating", "recordedBy": "untrusted:caller", "recordedAt": "2026-09-02T12:02:00Z", "reviewOrExpiryAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False},
            "unavailableReviewerBlock": {"unavailableReviewerBlockId": "block:operator-unavailable", "verificationRecordId": "verification:1", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "unavailable_reviewer_block.v1", "expectedOutcomeRevision": 1, "expectedLaneRevision": 1, "reasonCode": "reviewer_unavailable", "nextAction": "Await a replacement independent review.", "evidenceRefs": ["evidence:1"], "observedAt": "2026-09-02T12:02:00Z", "idempotencyKey": "block:operator-unavailable", "createdAt": "2026-09-02T12:02:00Z", "metadataOnly": True, "rawPayloadRetained": False},
            "operatorCapabilityBindingId": "capability:operator", "operatorCapabilityProof": "o" * 32,
        }
        parsed = HermesReviewHandoffRequest.model_validate(request)
        lane = await session.get(HermesLaneRun, "lane:1")
        assert lane is not None
        lane.stale_deadline_at = datetime.now(timezone.utc)
        await session.commit()
        with pytest.raises(ValueError, match="stale or timed-out"):
            await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture")
        lane.stale_deadline_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
        await session.commit()
        original_can_replace = hermes_outcomes.can_replace_current_result
        replacement_checks = 0

        def expire_lane_during_final_validation(*, previous, next_result):
            nonlocal replacement_checks
            replacement_checks += 1
            if replacement_checks == 1:
                lane.stale_deadline_at = datetime.now(timezone.utc)
            return original_can_replace(previous=previous, next_result=next_result)

        monkeypatch.setattr(hermes_outcomes, "can_replace_current_result", expire_lane_during_final_validation)
        with pytest.raises(ValueError, match="stale or timed-out"):
            await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture")
        monkeypatch.setattr(hermes_outcomes, "can_replace_current_result", original_can_replace)
        lane.stale_deadline_at = datetime(2200, 1, 1, tzinfo=timezone.utc)
        lane.timeout_at = datetime(2200, 1, 1, tzinfo=timezone.utc)
        assert parsed.unavailableReviewerException is not None
        real_datetime = hermes_outcomes.datetime
        expire_exception = False

        def expire_exception_during_final_validation(*, previous, next_result):
            nonlocal expire_exception
            expire_exception = True
            return original_can_replace(previous=previous, next_result=next_result)

        class FinalExpiryClock:
            @staticmethod
            def now(tz=None):
                if expire_exception:
                    return real_datetime(2100, 1, 1, tzinfo=tz or timezone.utc)
                return real_datetime.now(tz)

        monkeypatch.setattr(hermes_outcomes, "can_replace_current_result", expire_exception_during_final_validation)
        monkeypatch.setattr(hermes_outcomes, "datetime", FinalExpiryClock)
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture")
        monkeypatch.setattr(hermes_outcomes, "can_replace_current_result", original_can_replace)
        monkeypatch.setattr(hermes_outcomes, "datetime", real_datetime)
        lane.stale_deadline_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
        lane.timeout_at = datetime(2099, 1, 2, tzinfo=timezone.utc)
        original_fence = hermes_outcomes._fence_unrevoked_role_capability
        fence_calls = 0

        async def expire_operator_at_precommit(*args, **kwargs):
            nonlocal fence_calls
            fence_calls += 1
            if fence_calls == 2:
                raise ValueError("Role capability is revoked or expired.")
            await original_fence(*args, **kwargs)

        monkeypatch.setattr(hermes_outcomes, "_fence_unrevoked_role_capability", expire_operator_at_precommit)
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture")
        await session.rollback()
        assert fence_calls == 2 and await session.get(HermesUnavailableReviewerRequirement, "block:operator-unavailable") is None
        monkeypatch.setattr(hermes_outcomes, "_fence_unrevoked_role_capability", original_fence)
        projection = await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture")
        assert projection.currentResult == "blockedTechnical"
        requirement = await session.get(HermesUnavailableReviewerRequirement, "block:operator-unavailable")
        assert requirement is not None and requirement.recorded_by_operator_id == "operator:fixture"
        assert requirement.exception_requirement_json["recordedBy"] == "operator:fixture"
        assert await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture") == projection
        forbidden = copy.deepcopy(request); forbidden["reviewerCapabilityBindingId"] = "capability:reviewer"; forbidden["reviewerCapabilityProof"] = "r" * 32
        with pytest.raises(ValueError, match="only a typed Operator capability"):
            HermesReviewHandoffRequest.model_validate(forbidden)
        pre_verification_exception = copy.deepcopy(request); pre_verification_exception["unavailableReviewerException"]["recordedAt"] = "2026-09-02T12:01:59Z"
        with pytest.raises(ValueError, match="preserve verification revisions and timestamps"):
            HermesReviewHandoffRequest.model_validate(pre_verification_exception)
        review_by_before_block = copy.deepcopy(request)
        review_by_before_block["unavailableReviewerException"]["reviewOrExpiryAt"] = "2098-01-01T00:00:00Z"
        review_by_before_block["unavailableReviewerBlock"].update({"observedAt": "2099-01-01T00:00:00Z", "createdAt": "2099-01-01T00:00:00Z"})
        with pytest.raises(ValueError, match="preserve verification revisions and timestamps"):
            HermesReviewHandoffRequest.model_validate(review_by_before_block)
        secret_block = copy.deepcopy(request["unavailableReviewerBlock"])
        secret_block["idempotencyKey"] = "block:sk_live_abcdefghijklmnop"
        with pytest.raises(ValueError, match="bounded safe metadata"):
            HermesUnavailableReviewerBlockInputV1.model_validate(secret_block)
        bypass = _developer_request(handoff); bypass["unavailableReviewerException"] = request["unavailableReviewerException"]
        with pytest.raises(ValueError, match="cannot carry a Reviewer capability or exception"):
            HermesReviewHandoffRequest.model_validate(bypass)
    await engine.dispose()


async def _seed_review_lane(session, initial=None):
    """Set up an existing review projection without granting generic ingress that transition."""
    initial = copy.deepcopy(initial or payload())
    initial["outcome"]["status"] = "active"
    initial["laneRun"]["status"] = "running"
    await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
    outcome = await session.get(HermesOutcome, initial["outcome"]["outcomeId"])
    lane = await session.get(HermesLaneRun, initial["laneRun"]["laneRunId"])
    assert outcome is not None and lane is not None
    outcome.status = lane.status = "review"
    await session.commit()
    return initial


@pytest.mark.asyncio
async def test_hermes_review_handoff_requires_passed_independent_verification_and_reworks_original_lane(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-handoff.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        initial = await _seed_review_lane(session)
        bypass = copy.deepcopy(initial); bypass["event"]["eventName"] = "hermes.lane.recovered"; bypass["event"]["eventId"] = "event:review-lane-bypass"; bypass["event"]["idempotencyKey"] = "event:review-lane-bypass"; bypass["event"]["result"] = "completed"; bypass["outcome"]["status"] = "completed"; bypass["outcome"]["result"] = "completed"; bypass["laneRun"]["laneRunId"] = "lane:review-bypass"; bypass["laneRun"]["idempotencyKey"] = "lane:review-bypass"; bypass["laneRun"]["status"] = "completed"; bypass["laneRun"]["result"] = "completed"; bypass["deliveryEvidence"]["laneRunId"] = "lane:review-bypass"; bypass["deliveryEvidence"]["deliveryEvidenceId"] = "evidence:review-bypass"; bypass["deliveryEvidence"]["idempotencyKey"] = "evidence:review-bypass"; bypass["event"]["laneRunId"] = "lane:review-bypass"  # type: ignore[index]
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(bypass))
        approved = await _record_then_dispose(session, review_handoff())
        assert approved.currentResult == "completed" and approved.currentLaneRunId == "lane:1"
        assert await _record_then_dispose(session, review_handoff()) == approved
    async with sessions() as session:
        invalid = review_handoff(); invalid["disposition"]["reviewerWorkspace"] = invalid["verification"]["developerWorkspace"]  # type: ignore[index]
        with pytest.raises(ValueError, match="Independent review"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(invalid)))
    await engine.dispose()


def test_review_handoff_normalizes_identity_but_preserves_filesystem_path_case():
    case_distinct = review_handoff()
    case_distinct["verification"]["developerHome"] = "/Profiles/Developer"
    case_distinct["verification"]["developerWorkspace"] = "/Work/Developer"
    case_distinct["disposition"]["reviewerHome"] = "/profiles/developer"
    case_distinct["disposition"]["reviewerWorkspace"] = "/Work/Reviewer"
    HermesReviewHandoffRequest.model_validate(_reviewer_request(case_distinct))
    identity_overlap = copy.deepcopy(case_distinct)
    identity_overlap["disposition"]["reviewerIdentity"] = "DEVELOPER:ONE"
    with pytest.raises(ValueError, match="Review disposition identity must be opaque"):
        HermesReviewHandoffRequest.model_validate(_reviewer_request(identity_overlap))
    path_overlap = copy.deepcopy(case_distinct)
    path_overlap["disposition"]["reviewerHome"] = "/Profiles/Developer/nested"
    with pytest.raises(ValueError, match="Independent review"):
        HermesReviewHandoffRequest.model_validate(_reviewer_request(path_overlap))


@pytest.mark.asyncio
async def test_passed_verification_enters_review_only_through_the_typed_handoff(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'typed-review-entry.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        projection = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
        outcome = await session.get(HermesOutcome, "outcome:1")
        lane = await session.get(HermesLaneRun, "lane:1")
        assert projection.lifecycle == "review" and outcome is not None and lane is not None
        assert (outcome.status, lane.status, outcome.revision, lane.revision) == ("review", "review", 2, 2)
        assert (await session.get(HermesLedgerEvent, outcome.current_event_id)).event_name == "hermes.verification.recorded"
        session.add(HermesDeliveryEvidence(
            delivery_evidence_id="evidence:review", outcome_id="outcome:1", lane_run_id="lane:1",
            schema_version="delivery_evidence.v1", evidence_type="verification", summary="Independent review evidence.",
            source_ref="test:typed-review-entry", observed_at=datetime(2026, 9, 2, 12, 2, tzinfo=timezone.utc),
            evidence_refs_json=["evidence:review"], idempotency_key="evidence:review", created_at=datetime(2026, 9, 2, 12, 2, tzinfo=timezone.utc),
            metadata_only=True, raw_payload_retained=False,
        ))
        await session.commit()
        handoff["disposition"]["evidenceRefs"] = ["evidence:review"]
        completed = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)))
        assert completed.currentResult == "completed"
    await engine.dispose()


@pytest.mark.asyncio
async def test_passed_verification_rejects_a_second_ordinary_review_lane_record(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'typed-review-reverification.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
        session.add(HermesDeliveryEvidence(
            delivery_evidence_id="evidence:second-verification", outcome_id="outcome:1", lane_run_id="lane:1",
            schema_version="delivery_evidence.v1", evidence_type="verification", summary="Fresh duplicate verification evidence.",
            source_ref="test:typed-review-reverification", observed_at=datetime(2026, 9, 2, 12, 3, tzinfo=timezone.utc),
            evidence_refs_json=["evidence:second-verification"], idempotency_key="evidence:second-verification", created_at=datetime(2026, 9, 2, 12, 3, tzinfo=timezone.utc),
            metadata_only=True, raw_payload_retained=False,
        ))
        await session.commit()
        second = review_handoff()
        second["verification"].update({"verificationRecordId": "verification:second", "evidenceRefs": ["evidence:second-verification"], "observedAt": "2026-09-02T12:03:00Z", "createdAt": "2026-09-02T12:03:00Z", "idempotencyKey": "verification:second", "expectedOutcomeRevision": 2, "expectedLaneRevision": 2})
        with pytest.raises(ValueError, match="Passed verification cannot replace"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(second)))
    await engine.dispose()


@pytest.mark.asyncio
async def test_typed_review_entry_carries_forward_exact_verification_evidence(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'typed-review-evidence.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
        completed = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)))
        assert completed.currentResult == "completed"
    await engine.dispose()


@pytest.mark.asyncio
async def test_verification_rechecks_developer_capability_after_projection_lock(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'developer-capability-lock.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        original = hermes_outcomes._require_role_capability
        calls = 0

        async def expires_after_lock(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise ValueError("Role capability is revoked or expired.")
            return await original(*args, **kwargs)

        monkeypatch.setattr(hermes_outcomes, "_require_role_capability", expires_after_lock)
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
        assert calls == 2
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("handoff_kind", ("developer", "reviewer"))
async def test_review_handoff_rechecks_capability_immediately_before_persistence(tmp_path, monkeypatch, handoff_kind):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / f'{handoff_kind}-capability-precommit.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        if handoff_kind == "reviewer":
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
            request = HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff))
            persisted_model, persisted_id = HermesReviewDisposition, "review:approve"
        else:
            request = HermesReviewHandoffRequest.model_validate(_developer_request(handoff))
            persisted_model, persisted_id = HermesVerificationRecord, "verification:1"
        original = hermes_outcomes._fence_unrevoked_role_capability
        calls = 0

        async def expire_at_precommit(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise ValueError("Role capability is revoked or expired.")
            await original(*args, **kwargs)

        monkeypatch.setattr(hermes_outcomes, "_fence_unrevoked_role_capability", expire_at_precommit)
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, request)
        await session.rollback()
        assert calls == 2 and await session.get(persisted_model, persisted_id) is None
    await engine.dispose()


@pytest.mark.asyncio
async def test_role_capability_provisioning_rejects_historical_lane_binding(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'historical-capability-lane.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        outcome = await session.get(HermesOutcome, "outcome:1")
        assert outcome is not None
        outcome.current_event_id = "event:replacement"
        await session.commit()
        request = HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:historical", "role": "developer",
            "outcomeId": "outcome:1", "laneRunId": "lane:1", "identity": "developer:one",
            "home": "home:developer", "workspace": "workspace:developer", "capabilitySecret": "d" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z",
            "metadataOnly": True, "rawPayloadRetained": False,
        })
        with pytest.raises(ValueError, match="current outcome and lane"):
            await provision_hermes_role_capability(session, request, provisioned_by_operator_id="operator:fixture")
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(("verification_result", "expected_result"), (("failed", "rework"), ("inconclusive", "blockedTechnical")))
async def test_initial_nonpassing_verification_records_its_closed_result(tmp_path, verification_result, expected_result):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / f'{verification_result}-first-verification.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        request = _developer_request(handoff)
        request["verification"]["result"] = verification_result
        request["verification"]["verificationRecordId"] = f"verification:{verification_result}"
        request["verification"]["idempotencyKey"] = f"verification:{verification_result}"
        await _provision_two_roles(session, handoff)
        projection = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(request))
        assert projection.currentResult == expected_result
    await engine.dispose()


@pytest.mark.asyncio
async def test_nonpassing_verification_cannot_replace_an_existing_review_projection(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'nonpassing-review-fence.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        handoff = review_handoff()
        await _record_verification(session, handoff)
        failed = _developer_request(handoff)
        failed["verification"].update({
            "result": "failed", "verificationRecordId": "verification:late-failed", "idempotencyKey": "verification:late-failed",
            "expectedOutcomeRevision": 2, "expectedLaneRevision": 2,
            "createdAt": "2026-09-02T12:03:00Z", "observedAt": "2026-09-02T12:03:00Z",
        })
        with pytest.raises(ValueError, match="initial active Developer lane"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(failed))
        outcome = await session.get(HermesOutcome, "outcome:1")
        lane = await session.get(HermesLaneRun, "lane:1")
        assert outcome is not None and lane is not None and (outcome.status, lane.status) == ("review", "review")
    await engine.dispose()


@pytest.mark.asyncio
async def test_review_handoff_rejects_evidence_recorded_after_its_decision(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'future-review-evidence.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        evidence = await session.get(HermesDeliveryEvidence, "evidence:1")
        assert evidence is not None
        evidence.observed_at = datetime(2026, 9, 2, 12, 3, tzinfo=timezone.utc)
        await session.commit()
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        with pytest.raises(ValueError, match="current bound"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_review_handoff_fences_evidence_and_handoff_times_to_current_lane_revision(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-current-revision.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        lane = await session.get(HermesLaneRun, "lane:1")
        assert lane is not None
        lane.evidence_fingerprint = "sha256:current"
        lane.observed_at = datetime(2026, 9, 2, 12, 2, tzinfo=timezone.utc)
        lane.updated_at = lane.observed_at
        lane.revision += 1
        await session.commit()
        stale_evidence = review_handoff(); stale_evidence["verification"]["sourceFingerprint"] = "sha256:current"; stale_evidence["verification"]["expectedLaneRevision"] = 2; stale_evidence["disposition"]["expectedLaneRevision"] = 2  # type: ignore[index]
        with pytest.raises(ValueError, match="current bound"):
            await _record_verification(session, stale_evidence)
        await session.rollback()
        lane = await session.get(HermesLaneRun, "lane:1")
        outcome = await session.get(HermesOutcome, "outcome:1")
        evidence = await session.get(HermesDeliveryEvidence, "evidence:1")
        assert lane is not None and outcome is not None and evidence is not None
        later = datetime(2026, 9, 2, 12, 3, tzinfo=timezone.utc)
        evidence.observed_at = later; lane.updated_at = later; outcome.updated_at = later
        await session.commit()
        stale_time = review_handoff(); stale_time["verification"]["sourceFingerprint"] = "sha256:current"; stale_time["verification"]["expectedLaneRevision"] = 2; stale_time["disposition"]["expectedLaneRevision"] = 2  # type: ignore[index]
        with pytest.raises(ValueError, match="predates"):
            await _record_verification(session, stale_time)
    await engine.dispose()


def test_hermes_board_input_excludes_review_dispositions():
    event = {"schemaVersion": "hermes_board_lifecycle_event.v1", "issuerId": "issuer:one", "keyId": "key:one", "eventId": "event:board-one", "idempotencyKey": "idempotency:board-one", "boardId": "board:one", "cardId": "card:one", "outcomeId": "outcome:one", "laneRunId": "lane:one", "eventName": "hermes.review.disposition.recorded", "result": "retryable", "reasonCode": "observed", "evidenceRefs": ["evidence:one"], "nextAction": "continue", "correlationId": "correlation:one", "causationId": "causation:one", "observedAt": "2026-09-02T12:00:00Z", "emittedAt": "2026-09-02T12:01:00Z", "expiresAt": "2026-09-02T12:02:00Z", "signatureB64": "AA==", "metadataOnly": True, "rawPayloadRetained": False, "authoritative": False}
    with pytest.raises(ValueError, match="invalid closed state"):
        HermesBoardLifecycleEventInputV1.model_validate(event)


@pytest.mark.asyncio
async def test_hermes_review_handoff_rework_and_replay_conflicts_are_fenced(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-rework.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        expired = review_handoff("technical_block")
        expired["unavailableReviewerException"] = {"exceptionId": "exception:reviewer", "outcomeId": "outcome:1", "laneRunId": "lane:1", "reason": "reviewer_unavailable", "riskClass": "technical_block", "compensatingReviewRef": "evidence:compensating", "recordedBy": "coordinator:one", "recordedAt": "2026-09-02T12:02:00Z", "reviewOrExpiryAt": "2026-09-03T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}
        await _record_verification(session, expired)
        expired_request = HermesReviewHandoffRequest.model_validate(_reviewer_request(expired))
        with pytest.raises(ValueError, match="expired"):
            await ingest_hermes_review_handoff(session, expired_request, authenticated_recorder_id="operator:fixture")
        with pytest.raises(ValueError, match="atomic committed"):
            await ingest_hermes_review_handoff(session, expired_request, commit=False, authenticated_recorder_id="operator:fixture")
        internal_exception = _reviewer_request(expired); internal_exception["unavailableReviewerException"]["reasonCode"] = internal_exception["unavailableReviewerException"].pop("reason")  # type: ignore[index]
        with pytest.raises(ValueError, match="reason"):
            HermesReviewHandoffRequest.model_validate(internal_exception)
        request = review_handoff("rework")
        projection = await _record_then_dispose(session, request)
        assert projection.currentLaneRunId == "lane:1" and projection.currentResult == "rework"
        conflicting = copy.deepcopy(request); conflicting["disposition"]["nextAction"] = "Different action"  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(conflicting)))
        revision_conflict = copy.deepcopy(request); revision_conflict["verification"]["expectedOutcomeRevision"] = 2; revision_conflict["disposition"]["expectedOutcomeRevision"] = 2  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(revision_conflict)))
        before = copy.deepcopy(request); before["disposition"]["observedAt"] = "2026-09-02T12:01:00Z"  # type: ignore[index]
        with pytest.raises(ValueError, match="timestamp"):
            HermesReviewHandoffRequest.model_validate(before)
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_review_handoff_replays_legacy_unavailable_exception_digest(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy-exception-replay.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    request = review_handoff("technical_block")
    request["unavailableReviewerException"] = {"exceptionId": "exception:legacy", "outcomeId": "outcome:1", "laneRunId": "lane:1", "reason": "reviewer_unavailable", "riskClass": "technical_block", "compensatingReviewRef": "evidence:compensating", "recordedBy": "coordinator:one", "recordedAt": "2026-09-02T12:02:00Z", "reviewOrExpiryAt": "2099-01-01T00:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}
    parsed = HermesReviewHandoffRequest.model_validate(_reviewer_request(request))
    legacy_digest = sha256(json.dumps(parsed.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    async with sessions() as session:
        await _seed_review_lane(session)
        await _record_verification(session, request)
        with pytest.raises(ValueError, match="authenticated recorder"):
            await ingest_hermes_review_handoff(session, parsed)
        first = await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture")
        stored = await session.get(HermesReviewDisposition, "review:technical_block")
        assert stored is not None
        assert stored.exception_requirement_json["recordedBy"] == "operator:fixture"
        stored.request_digest_sha256 = legacy_digest
        await session.commit()
        assert await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:fixture") == first
        with pytest.raises(ValueError, match="exception recorder conflicts"):
            await ingest_hermes_review_handoff(session, parsed, authenticated_recorder_id="operator:other")
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_review_handoff_rejects_unproven_historic_verification_and_expired_or_revoked_capabilities(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'capability-fences.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        handoff = review_handoff()
        await _record_verification(session, handoff)
        record = await session.get(HermesVerificationRecord, "verification:1")
        assert record is not None
        verification = handoff["verification"]
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate({
            "capabilityBindingId": "capability:developer-replacement", "role": "developer",
            "outcomeId": verification["outcomeId"], "laneRunId": verification["laneRunId"],
            "identity": verification["developerIdentity"], "home": verification["developerHome"],
            "workspace": verification["developerWorkspace"], "capabilitySecret": "x" * 32,
            "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z",
            "metadataOnly": True, "rawPayloadRetained": False,
        }), provisioned_by_operator_id="operator:fixture")
        replacement_replay = _developer_request(handoff)
        replacement_replay["developerCapabilityBindingId"] = "capability:developer-replacement"
        replacement_replay["developerCapabilityProof"] = "x" * 32
        with pytest.raises(ValueError, match="capability binding conflicts"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(replacement_replay))
        record.revision_binding_known = False
        await session.commit()
        with pytest.raises(ValueError, match="idempotency"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)))
        record.revision_binding_known = True
        developer = await session.get(HermesRoleCapabilityBinding, "capability:developer")
        assert developer is not None
        developer.expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        await session.commit()
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
        developer.expires_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
        reviewer = await session.get(HermesRoleCapabilityBinding, "capability:reviewer")
        assert reviewer is not None
        reviewer.expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        await session.commit()
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)))
        reviewer.expires_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
        reviewer.revoked_at = datetime(2026, 9, 2, 12, 3, tzinfo=timezone.utc)
        await session.commit()
        with pytest.raises(ValueError, match="revoked or expired"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)))
        reviewer.revoked_at = None
        await session.commit()
        assert (await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_reviewer_request(handoff)))).currentResult == "completed"
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_technical_block_recovery_replaces_not_reopens_the_blocked_lane(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'technical-recovery.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        blocked = await _record_then_dispose(session, review_handoff("technical_block"))
        assert blocked.currentResult == "blockedTechnical"
        recovery = {
            "outcomeId": "outcome:1", "blockedLaneRunId": "lane:1", "expectedOutcomeRevision": 2,
            "expectedBlockedLaneRevision": 2, "reasonCode": "technical_block_remediated",
            "nextAction": "Run a fresh independent review on the replacement lane.",
            "observedAt": "2026-09-02T12:03:00Z", "createdAt": "2026-09-02T12:03:00Z",
            "idempotencyKey": "recovery:technical-block:1", "metadataOnly": True, "rawPayloadRetained": False,
            "replacementLaneRun": {
                "laneRunId": "lane:replacement-1", "outcomeId": "outcome:1", "schemaVersion": "hermes_lane_run.v1",
                "laneType": "implementation", "status": "review", "result": "retryable", "reasonCode": "technical_block_remediated",
                "evidenceRefs": ["evidence:replacement-1"], "nextAction": "Run a fresh independent review on the replacement lane.",
                "heartbeatAt": "2026-09-02T12:03:00Z", "staleDeadlineAt": "2099-09-02T12:03:00Z", "timeoutAt": "2099-09-02T12:04:00Z",
                "retryBudget": 0, "reworkBudget": 1, "evidenceFingerprint": "sha256:replacement-proof",
                "observedAt": "2026-09-02T12:03:00Z", "idempotencyKey": "lane:replacement-1",
                "createdAt": "2026-09-02T12:03:00Z", "updatedAt": "2026-09-02T12:03:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            },
            "deliveryEvidence": {
                "deliveryEvidenceId": "evidence:replacement-1", "outcomeId": "outcome:1", "laneRunId": "lane:replacement-1",
                "schemaVersion": "delivery_evidence.v1", "evidenceType": "verification", "summary": "Technical block remediation was verified.",
                "sourceRef": "test:technical-block-recovery", "observedAt": "2026-09-02T12:03:00Z",
                "evidenceRefs": ["evidence:replacement-1"], "idempotencyKey": "evidence:replacement-1",
                "createdAt": "2026-09-02T12:03:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            },
        }
        stale_evidence = copy.deepcopy(recovery)
        stale_evidence["replacementLaneRun"]["updatedAt"] = "2026-09-02T12:04:00Z"  # type: ignore[index]
        with pytest.raises(ValueError, match="cannot postdate its decision"):
            HermesTechnicalBlockRecoveryRequest.model_validate(stale_evidence)
        stale_heartbeat = copy.deepcopy(recovery)
        stale_heartbeat["replacementLaneRun"]["heartbeatAt"] = "2026-09-02T12:04:00Z"  # type: ignore[index]
        with pytest.raises(ValueError, match="cannot postdate its decision"):
            HermesTechnicalBlockRecoveryRequest.model_validate(stale_heartbeat)
        ordered = copy.deepcopy(recovery)
        ordered["observedAt"] = ordered["createdAt"] = "2026-09-02T12:05:00Z"
        ordered["replacementLaneRun"]["heartbeatAt"] = ordered["replacementLaneRun"]["observedAt"] = ordered["replacementLaneRun"]["updatedAt"] = "2026-09-02T12:03:30Z"  # type: ignore[index]
        ordered["deliveryEvidence"]["observedAt"] = ordered["deliveryEvidence"]["createdAt"] = "2026-09-02T12:04:00Z"  # type: ignore[index]
        assert HermesTechnicalBlockRecoveryRequest.model_validate(ordered).observedAt.isoformat() == "2026-09-02T12:05:00+00:00"
        pre_update_evidence = copy.deepcopy(ordered)
        pre_update_evidence["deliveryEvidence"]["observedAt"] = pre_update_evidence["deliveryEvidence"]["createdAt"] = "2026-09-02T12:03:00Z"  # type: ignore[index]
        with pytest.raises(ValueError, match="predates its replacement lane update"):
            HermesTechnicalBlockRecoveryRequest.model_validate(pre_update_evidence)
        unbound_evidence = copy.deepcopy(recovery)
        unbound_evidence["replacementLaneRun"]["evidenceRefs"] = ["evidence:other"]  # type: ignore[index]
        with pytest.raises(ValueError, match="exactly its delivery evidence"):
            HermesTechnicalBlockRecoveryRequest.model_validate(unbound_evidence)
        unresolved_evidence = copy.deepcopy(recovery)
        unresolved_evidence["replacementLaneRun"]["evidenceRefs"] = ["evidence:replacement-1", "evidence:unresolved"]  # type: ignore[index]
        with pytest.raises(ValueError, match="exactly its delivery evidence"):
            HermesTechnicalBlockRecoveryRequest.model_validate(unresolved_evidence)
        oversized_correlation = copy.deepcopy(recovery)
        oversized_correlation["idempotencyKey"] = f"recovery:{'a' * 112}"  # type: ignore[index]
        with pytest.raises(ValueError):
            HermesTechnicalBlockRecoveryRequest.model_validate(oversized_correlation)
        request = HermesTechnicalBlockRecoveryRequest.model_validate(ordered)
        mismatched_metadata = copy.deepcopy(recovery); mismatched_metadata["replacementLaneRun"]["reasonCode"] = "different_reason"  # type: ignore[index]
        with pytest.raises(ValueError, match="reason and next action"):
            HermesTechnicalBlockRecoveryRequest.model_validate(mismatched_metadata)
        outcome = await session.get(HermesOutcome, "outcome:1")
        old_lane = await session.get(HermesLaneRun, "lane:1")
        assert outcome is not None and old_lane is not None
        outcome.status = old_lane.status = "review"
        await session.commit()
        with pytest.raises(ValueError, match="current blockedTechnical"):
            await recover_hermes_technical_block(session, request, recovered_by_operator_id="operator:fixture")
        outcome.status = old_lane.status = "blocked"
        await session.commit()
        mismatched_retry_budget = copy.deepcopy(recovery)
        mismatched_retry_budget["replacementLaneRun"]["retryBudget"] = 1  # type: ignore[index]
        with pytest.raises(ValueError, match="consume exactly one retry budget"):
            await recover_hermes_technical_block(
                session,
                HermesTechnicalBlockRecoveryRequest.model_validate(mismatched_retry_budget),
                recovered_by_operator_id="operator:fixture",
            )
        old_lane.retry_budget = 0
        await session.commit()
        with pytest.raises(ValueError, match="retry budget is exhausted"):
            await recover_hermes_technical_block(session, request, recovered_by_operator_id="operator:fixture")
        old_lane.retry_budget = 1
        await session.commit()
        outcome.updated_at = old_lane.updated_at = datetime(2026, 9, 2, 12, 4, tzinfo=timezone.utc)
        await session.commit()
        with pytest.raises(ValueError, match="predates the blocked projection"):
            await recover_hermes_technical_block(
                session,
                HermesTechnicalBlockRecoveryRequest.model_validate(recovery),
                recovered_by_operator_id="operator:fixture",
            )
        outcome.updated_at = old_lane.updated_at = datetime(2026, 9, 2, 12, 2, tzinfo=timezone.utc)
        await session.commit()
        expired_replacement = copy.deepcopy(recovery)
        expired_at = datetime.now(timezone.utc).replace(microsecond=0)
        expired_replacement["replacementLaneRun"]["staleDeadlineAt"] = expired_at.isoformat().replace("+00:00", "Z")  # type: ignore[index]
        expired_replacement["replacementLaneRun"]["timeoutAt"] = (expired_at + timedelta(days=1)).isoformat().replace("+00:00", "Z")  # type: ignore[index]
        with pytest.raises(ValueError, match="replacement lane is stale or timed out"):
            await recover_hermes_technical_block(session, HermesTechnicalBlockRecoveryRequest.model_validate(expired_replacement), recovered_by_operator_id="operator:fixture")
        blocked_stale_evidence = copy.deepcopy(recovery)
        blocked_stale_evidence["replacementLaneRun"].update({"heartbeatAt": "2026-09-02T12:01:00Z", "observedAt": "2026-09-02T12:01:00Z", "createdAt": "2026-09-02T12:01:00Z", "updatedAt": "2026-09-02T12:01:00Z"})  # type: ignore[index]
        blocked_stale_evidence["deliveryEvidence"].update({"observedAt": "2026-09-02T12:01:00Z", "createdAt": "2026-09-02T12:01:00Z"})  # type: ignore[index]
        with pytest.raises(ValueError, match="predates the blocked projection"):
            await recover_hermes_technical_block(session, HermesTechnicalBlockRecoveryRequest.model_validate(blocked_stale_evidence), recovered_by_operator_id="operator:fixture")
        preblocked_replacement = copy.deepcopy(recovery)
        preblocked_replacement["replacementLaneRun"].update({  # type: ignore[index]
            "heartbeatAt": "2026-09-02T12:01:00Z", "observedAt": "2026-09-02T12:01:00Z",
            "createdAt": "2026-09-02T12:01:00Z", "updatedAt": "2026-09-02T12:01:00Z",
        })
        preblocked_replacement["deliveryEvidence"].update({"observedAt": "2026-09-02T12:03:00Z", "createdAt": "2026-09-02T12:03:00Z"})  # type: ignore[index]
        with pytest.raises(ValueError, match="replacement lane predates the blocked projection"):
            await recover_hermes_technical_block(
                session,
                HermesTechnicalBlockRecoveryRequest.model_validate(preblocked_replacement),
                recovered_by_operator_id="operator:fixture",
            )
        projection = await recover_hermes_technical_block(session, request, recovered_by_operator_id="operator:fixture")
        assert projection.currentLaneRunId == "lane:replacement-1" and projection.currentResult == "retryable"
        old_lane = await session.get(HermesLaneRun, "lane:1")
        assert old_lane is not None and old_lane.result == "blockedTechnical" and old_lane.status == "blocked"
        replacement_lane = await session.get(HermesLaneRun, "lane:replacement-1")
        assert replacement_lane is not None and replacement_lane.retry_budget == 0
        recovery_event = await session.scalar(select(HermesLedgerEvent).where(HermesLedgerEvent.event_name == "hermes.lane.recovered"))
        assert recovery_event is not None and recovery_event.recovered_by_operator_id == "operator:fixture" and len(recovery_event.correlation_id) <= 120
        assert await recover_hermes_technical_block(session, request, recovered_by_operator_id="operator:fixture") == projection
        outcome = await session.get(HermesOutcome, "outcome:1")
        replacement_lane = await session.get(HermesLaneRun, "lane:replacement-1")
        assert outcome is not None and replacement_lane is not None
        recovered_handoff = review_handoff()
        verification, disposition = recovered_handoff["verification"], recovered_handoff["disposition"]
        verification.update({
            "verificationRecordId": "verification:recovery-carry", "laneRunId": replacement_lane.lane_run_id,
            "sourceFingerprint": replacement_lane.evidence_fingerprint, "evidenceRefs": ["evidence:replacement-1"],
            "observedAt": "2026-09-02T12:06:00Z", "createdAt": "2026-09-02T12:06:00Z",
            "idempotencyKey": "verification:recovery-carry", "expectedOutcomeRevision": outcome.revision,
            "expectedLaneRevision": replacement_lane.revision,
        })
        disposition.update({
            "reviewDispositionId": "review:recovery-carry", "verificationRecordId": verification["verificationRecordId"],
            "developerLaneRunId": replacement_lane.lane_run_id, "evidenceRefs": verification["evidenceRefs"],
            "observedAt": "2026-09-02T12:07:00Z", "createdAt": "2026-09-02T12:07:00Z",
            "idempotencyKey": "review:recovery-carry", "expectedOutcomeRevision": outcome.revision,
            "expectedLaneRevision": replacement_lane.revision,
        })
        for role, binding_id, secret, identity, home, workspace in (
            ("developer", "capability:recovery-developer", "x" * 32, verification["developerIdentity"], verification["developerHome"], verification["developerWorkspace"]),
            ("reviewer", "capability:recovery-reviewer", "y" * 32, disposition["reviewerIdentity"], disposition["reviewerHome"], disposition["reviewerWorkspace"]),
        ):
            await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate({
                "capabilityBindingId": binding_id, "role": role, "outcomeId": "outcome:1", "laneRunId": replacement_lane.lane_run_id,
                "identity": identity, "home": home, "workspace": workspace, "capabilitySecret": secret,
                "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
            }), provisioned_by_operator_id="operator:fixture")
        developer_request = _developer_request(recovered_handoff)
        developer_request.update({"developerCapabilityBindingId": "capability:recovery-developer", "developerCapabilityProof": "x" * 32})
        assert (await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(developer_request))).currentLaneRunId == replacement_lane.lane_run_id
        second_passed = copy.deepcopy(developer_request)
        second_passed["verification"].update({"verificationRecordId": "verification:recovery-second", "idempotencyKey": "verification:recovery-second"})
        with pytest.raises(ValueError, match="cannot replace an existing lane verification"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(second_passed))
        reviewer_request = _reviewer_request(recovered_handoff)
        reviewer_request.update({"reviewerCapabilityBindingId": "capability:recovery-reviewer", "reviewerCapabilityProof": "y" * 32})
        assert (await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(reviewer_request))).currentResult == "completed"
        with pytest.raises(ValueError, match="authenticated Operator"):
            await recover_hermes_technical_block(session, request, recovered_by_operator_id="operator:other")
        with pytest.raises(ValueError, match="authenticated Operator"):
            await recover_hermes_technical_block(session, request, recovered_by_operator_id=" ")
        stale = copy.deepcopy(recovery); stale["idempotencyKey"] = "recovery:technical-block:stale"; stale["expectedOutcomeRevision"] = 2
        with pytest.raises(ValueError, match="current blockedTechnical|stale"):
            await recover_hermes_technical_block(session, HermesTechnicalBlockRecoveryRequest.model_validate(stale), recovered_by_operator_id="operator:fixture")
    await engine.dispose()


@pytest.mark.asyncio
async def test_passed_verification_cannot_replace_terminal_result_or_future_date(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'verification-terminal-time.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        outcome = await session.get(HermesOutcome, "outcome:1"); lane = await session.get(HermesLaneRun, "lane:1")
        assert outcome is not None and lane is not None
        outcome.result = lane.result = "deniedPolicy"
        await session.commit()
        with pytest.raises(ValueError, match="terminal ledger transition"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(_developer_request(handoff)))
    await engine.dispose()

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'verification-expired-deadline.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        request = HermesReviewHandoffRequest.model_validate(_developer_request(handoff))
        first = await ingest_hermes_review_handoff(session, request)
        lane = await session.get(HermesLaneRun, "lane:1")
        assert lane is not None
        lane.stale_deadline_at = datetime.now(timezone.utc)
        await session.commit()
        original_replay = hermes_outcomes._replay_verification
        replay_calls = 0

        async def replay_after_lock(*args, **kwargs):
            nonlocal replay_calls
            replay_calls += 1
            if replay_calls == 1:
                return None
            return await original_replay(*args, **kwargs)

        monkeypatch.setattr(hermes_outcomes, "_replay_verification", replay_after_lock)
        replayed = await ingest_hermes_review_handoff(session, request)
        assert (replayed.currentLaneRunId, replayed.currentResult, replayed.lifecycle) == (first.currentLaneRunId, first.currentResult, first.lifecycle)
        stale_new = _developer_request(handoff)
        stale_new["verification"]["verificationRecordId"] = "verification:stale-new"  # type: ignore[index]
        stale_new["verification"]["idempotencyKey"] = "verification:stale-new"  # type: ignore[index]
        with pytest.raises(ValueError, match="stale or timed-out"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(stale_new))
    await engine.dispose()

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'verification-future-time.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await _seed_review_lane(session)
        handoff = review_handoff()
        await _provision_two_roles(session, handoff)
        future = _developer_request(handoff)
        future["verification"]["observedAt"] = "2099-01-01T00:00:00Z"  # type: ignore[index]
        future["verification"]["createdAt"] = "2099-01-01T00:00:00Z"  # type: ignore[index]
        with pytest.raises(ValueError, match="future"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(future))
    await engine.dispose()


@pytest.mark.asyncio
async def test_failed_verification_persists_closed_rework_without_a_review_disposition(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'verification-failure.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        request = review_handoff(); request["verification"]["result"] = "failed"; request["verification"]["verificationRecordId"] = "verification:failed"; request["verification"]["idempotencyKey"] = "verification:failed"; request.pop("disposition")
        request["developerCapabilityBindingId"] = "capability:developer"; request["developerCapabilityProof"] = "d" * 32
        await _provision_two_roles(session, review_handoff())
        projection = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(request))
        assert projection.currentLaneRunId == "lane:1" and projection.currentResult == "rework" and projection.reasonCode == "verification_failed"
        assert await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(request)) == projection
        verification = await session.get(HermesVerificationRecord, "verification:failed")
        event = await session.scalar(select(HermesLedgerEvent).where(HermesLedgerEvent.event_name == "hermes.verification.recorded"))
        outcome = await session.get(HermesOutcome, "outcome:1")
        assert verification is not None and verification.schema_version == "verification_record.v1"
        assert event is not None and event.emitted_at >= event.observed_at and outcome is not None and outcome.current_event_id == event.event_id
        conflicting = copy.deepcopy(request); conflicting["verification"]["target"] = "test:other"  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(conflicting))
        assert can_replace_current_result(previous="completed", next_result="rework") is False
    await engine.dispose()


@pytest.mark.asyncio
async def test_failed_verification_consumes_rework_budget_and_fences_exhaustion(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'verification-budget.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    request = review_handoff(); request["verification"]["result"] = "failed"; request["verification"]["verificationRecordId"] = "verification:budget"; request["verification"]["idempotencyKey"] = "verification:budget"; request.pop("disposition")
    request["developerCapabilityBindingId"] = "capability:developer"; request["developerCapabilityProof"] = "d" * 32
    async with sessions() as session:
        initial = payload(); initial["laneRun"]["reworkBudget"] = 1  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        await _provision_two_roles(session, review_handoff())
        assert (await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(request))).currentResult == "rework"
        lane = await session.get(HermesLaneRun, "lane:1")
        assert lane is not None and lane.rework_budget == 0
    exhausted = copy.deepcopy(request); exhausted["verification"]["verificationRecordId"] = "verification:exhausted"; exhausted["verification"]["idempotencyKey"] = "verification:exhausted"
    async with sessions() as session:
        initial = payload(); initial["outcome"]["outcomeId"] = "outcome:2"; initial["outcome"]["idempotencyKey"] = "outcome:2"; initial["laneRun"]["outcomeId"] = "outcome:2"; initial["deliveryEvidence"]["outcomeId"] = "outcome:2"; initial["event"]["outcomeId"] = "outcome:2"; initial["laneRun"]["reworkBudget"] = 0; initial["laneRun"]["laneRunId"] = "lane:2"; initial["laneRun"]["idempotencyKey"] = "lane:2"; initial["deliveryEvidence"]["laneRunId"] = "lane:2"; initial["event"]["laneRunId"] = "lane:2"; initial["deliveryEvidence"]["deliveryEvidenceId"] = "evidence:2"; initial["deliveryEvidence"]["idempotencyKey"] = "evidence:2"; initial["event"]["eventId"] = "event:2"; initial["event"]["idempotencyKey"] = "event:2"  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        exhausted["verification"]["outcomeId"] = "outcome:2"; exhausted["verification"]["laneRunId"] = "lane:2"; exhausted["verification"]["sourceFingerprint"] = "sha256:ledger-proof"; exhausted["verification"]["evidenceRefs"] = ["evidence:2"]
        exhausted["developerCapabilityBindingId"] = "capability:developer-2"; exhausted["developerCapabilityProof"] = "2" * 32
        await provision_hermes_role_capability(session, HermesRoleCapabilityProvisionRequest.model_validate({"capabilityBindingId": "capability:developer-2", "role": "developer", "outcomeId": "outcome:2", "laneRunId": "lane:2", "identity": exhausted["verification"]["developerIdentity"], "home": exhausted["verification"]["developerHome"], "workspace": exhausted["verification"]["developerWorkspace"], "capabilitySecret": "2" * 32, "expiresAt": "2099-01-01T00:00:00Z", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}), provisioned_by_operator_id="operator:fixture")
        with pytest.raises(ValueError, match="budget is exhausted"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(exhausted))
    await engine.dispose()
