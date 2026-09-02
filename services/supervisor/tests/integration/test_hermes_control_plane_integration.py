import copy
from hashlib import sha256
import json

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.hermes_outcomes import (
    _update_if_current,
    ingest_hermes_ledger,
    ingest_hermes_review_handoff,
    read_hermes_lane_run,
    read_hermes_outcome,
)
from supervisor.api.schemas import HermesLedgerIngestRequest, HermesReviewHandoffRequest
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.migrations import MIGRATIONS, SCHEMA_MIGRATIONS_TABLE, upgrade_database
from supervisor.infrastructure.db.models import HermesLaneRun, HermesLedgerEvent, HermesOutcome, HermesReviewDisposition, HermesVerificationRecord
from supervisor.domain.hermes_control_plane import can_replace_current_result
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
        bypass = copy.deepcopy(payload()); bypass["event"]["eventName"] = "hermes.review.disposition.recorded"; bypass["event"]["eventId"] = "event:review-bypass"; bypass["event"]["idempotencyKey"] = "event:review-bypass"; bypass["event"]["result"] = "completed"; bypass["outcome"]["status"] = "completed"; bypass["outcome"]["result"] = "completed"; bypass["laneRun"]["status"] = "completed"; bypass["laneRun"]["result"] = "completed"  # type: ignore[index]
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(bypass))
        projection = await read_hermes_outcome(session, "outcome:1")
        assert projection is not None and projection.reasonCode == "verification_pending"
    async with engine.begin() as connection:
        assert await connection.scalar(text("SELECT COUNT(*) FROM hermes_ledger_events")) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_ledger_replays_exact_pre_handoff_restricted_event(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy-restricted-replay.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    legacy = payload(); legacy["event"]["eventName"] = "hermes.review.disposition.recorded"  # type: ignore[index]
    request = HermesLedgerIngestRequest.model_validate(legacy)
    digest = sha256(json.dumps(request.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(payload()))
        event = await session.get(HermesLedgerEvent, "event:1")
        assert event is not None
        event.event_name = request.event.eventName
        event.request_digest_sha256 = digest
        await session.commit()
        assert (await ingest_hermes_ledger(session, request)).currentLaneRunId == "lane:1"
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
        await upgrade_database(connection)
        columns = {row[1] for row in (await connection.execute(text("PRAGMA table_info(hermes_verification_records)"))).all()}
    assert {"schema_version", "expected_outcome_revision", "expected_lane_revision"} <= columns
    await engine.dispose()


def review_handoff(disposition="approve"):
    now = "2026-09-02T12:02:00Z"
    return {"verification": {"verificationRecordId": "verification:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "verification_record.v1", "result": "passed", "target": "test:hermes", "sourceFingerprint": "sha256:ledger-proof", "developerIdentity": "developer:one", "developerHome": "home:developer", "developerWorkspace": "workspace:developer", "evidenceRefs": ["evidence:1"], "observedAt": now, "idempotencyKey": "verification:1", "createdAt": now, "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}, "disposition": {"reviewDispositionId": f"review:{disposition}", "verificationRecordId": "verification:1", "outcomeId": "outcome:1", "developerLaneRunId": "lane:1", "schemaVersion": "review_disposition.v1", "disposition": disposition, "reviewerIdentity": "reviewer:one", "reviewerHome": "home:reviewer", "reviewerWorkspace": "workspace:reviewer", "reasonCode": "reviewed", "nextAction": "Hold for later delivery adapter.", "evidenceRefs": ["evidence:1"], "observedAt": now, "idempotencyKey": f"review:{disposition}", "createdAt": now, "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1}}


@pytest.mark.asyncio
async def test_hermes_review_handoff_requires_passed_independent_verification_and_reworks_original_lane(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-handoff.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        initial = payload(); initial["outcome"]["status"] = "review"; initial["laneRun"]["status"] = "review"  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        bypass = copy.deepcopy(initial); bypass["event"]["eventName"] = "hermes.lane.recovered"; bypass["event"]["eventId"] = "event:review-lane-bypass"; bypass["event"]["idempotencyKey"] = "event:review-lane-bypass"; bypass["event"]["result"] = "completed"; bypass["outcome"]["status"] = "completed"; bypass["outcome"]["result"] = "completed"; bypass["laneRun"]["laneRunId"] = "lane:review-bypass"; bypass["laneRun"]["idempotencyKey"] = "lane:review-bypass"; bypass["laneRun"]["status"] = "completed"; bypass["laneRun"]["result"] = "completed"; bypass["deliveryEvidence"]["laneRunId"] = "lane:review-bypass"; bypass["deliveryEvidence"]["deliveryEvidenceId"] = "evidence:review-bypass"; bypass["deliveryEvidence"]["idempotencyKey"] = "evidence:review-bypass"; bypass["event"]["laneRunId"] = "lane:review-bypass"  # type: ignore[index]
        with pytest.raises(ValueError, match="independent review handoff"):
            await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(bypass))
        approved = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(review_handoff()))
        assert approved.currentResult == "completed" and approved.currentLaneRunId == "lane:1"
        assert await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(review_handoff())) == approved
    async with sessions() as session:
        invalid = review_handoff(); invalid["disposition"]["reviewerWorkspace"] = "workspace:developer"  # type: ignore[index]
        with pytest.raises(ValueError, match="Independent review"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(invalid))
    await engine.dispose()


@pytest.mark.asyncio
async def test_hermes_review_handoff_rework_and_replay_conflicts_are_fenced(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'review-rework.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        initial = payload(); initial["outcome"]["status"] = "review"; initial["laneRun"]["status"] = "review"  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        expired = review_handoff("technical_block")
        expired["unavailableReviewerException"] = {"exceptionId": "exception:reviewer", "outcomeId": "outcome:1", "laneRunId": "lane:1", "reason": "reviewer_unavailable", "riskClass": "technical_block", "compensatingReviewRef": "evidence:compensating", "recordedBy": "coordinator:one", "recordedAt": "2020-01-01T00:00:00Z", "reviewOrExpiryAt": "2020-01-01T01:00:00Z", "metadataOnly": True, "rawPayloadRetained": False}
        expired_request = HermesReviewHandoffRequest.model_validate(expired)
        with pytest.raises(ValueError, match="expired"):
            await ingest_hermes_review_handoff(session, expired_request)
        with pytest.raises(ValueError, match="atomic committed"):
            await ingest_hermes_review_handoff(session, expired_request, commit=False)
        internal_exception = copy.deepcopy(expired); internal_exception["unavailableReviewerException"]["reasonCode"] = internal_exception["unavailableReviewerException"].pop("reason")  # type: ignore[index]
        with pytest.raises(ValueError, match="reason"):
            HermesReviewHandoffRequest.model_validate(internal_exception)
        request = review_handoff("rework")
        projection = await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(request))
        assert projection.currentLaneRunId == "lane:1" and projection.currentResult == "rework"
        conflicting = copy.deepcopy(request); conflicting["disposition"]["nextAction"] = "Different action"  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(conflicting))
        revision_conflict = copy.deepcopy(request); revision_conflict["verification"]["expectedOutcomeRevision"] = 2; revision_conflict["disposition"]["expectedOutcomeRevision"] = 2  # type: ignore[index]
        with pytest.raises(ValueError, match="idempotency"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(revision_conflict))
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
    parsed = HermesReviewHandoffRequest.model_validate(request)
    legacy_digest = sha256(json.dumps(parsed.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    async with sessions() as session:
        initial = payload(); initial["outcome"]["status"] = "review"; initial["laneRun"]["status"] = "review"  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        first = await ingest_hermes_review_handoff(session, parsed)
        stored = await session.get(HermesReviewDisposition, "review:technical_block")
        assert stored is not None
        stored.request_digest_sha256 = legacy_digest
        await session.commit()
        assert await ingest_hermes_review_handoff(session, parsed) == first
    await engine.dispose()


@pytest.mark.asyncio
async def test_failed_verification_persists_closed_rework_without_a_review_disposition(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'verification-failure.db'}")
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        initial = payload(); initial["outcome"]["status"] = "review"; initial["laneRun"]["status"] = "review"  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        request = review_handoff(); request["verification"]["result"] = "failed"; request["verification"]["verificationRecordId"] = "verification:failed"; request["verification"]["idempotencyKey"] = "verification:failed"; request.pop("disposition")
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
    async with sessions() as session:
        initial = payload(); initial["outcome"]["status"] = "review"; initial["laneRun"]["status"] = "review"; initial["laneRun"]["reworkBudget"] = 1  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        assert (await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(request))).currentResult == "rework"
        lane = await session.get(HermesLaneRun, "lane:1")
        assert lane is not None and lane.rework_budget == 0
    exhausted = copy.deepcopy(request); exhausted["verification"]["verificationRecordId"] = "verification:exhausted"; exhausted["verification"]["idempotencyKey"] = "verification:exhausted"
    async with sessions() as session:
        initial = payload(); initial["outcome"]["outcomeId"] = "outcome:2"; initial["outcome"]["idempotencyKey"] = "outcome:2"; initial["laneRun"]["outcomeId"] = "outcome:2"; initial["deliveryEvidence"]["outcomeId"] = "outcome:2"; initial["event"]["outcomeId"] = "outcome:2"; initial["outcome"]["status"] = "review"; initial["laneRun"]["status"] = "review"; initial["laneRun"]["reworkBudget"] = 0; initial["laneRun"]["laneRunId"] = "lane:2"; initial["laneRun"]["idempotencyKey"] = "lane:2"; initial["deliveryEvidence"]["laneRunId"] = "lane:2"; initial["event"]["laneRunId"] = "lane:2"; initial["deliveryEvidence"]["deliveryEvidenceId"] = "evidence:2"; initial["deliveryEvidence"]["idempotencyKey"] = "evidence:2"; initial["event"]["eventId"] = "event:2"; initial["event"]["idempotencyKey"] = "event:2"  # type: ignore[index]
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(initial))
        exhausted["verification"]["outcomeId"] = "outcome:2"; exhausted["verification"]["laneRunId"] = "lane:2"; exhausted["verification"]["sourceFingerprint"] = "sha256:ledger-proof"; exhausted["verification"]["evidenceRefs"] = ["evidence:2"]
        with pytest.raises(ValueError, match="budget is exhausted"):
            await ingest_hermes_review_handoff(session, HermesReviewHandoffRequest.model_validate(exhausted))
    await engine.dispose()
