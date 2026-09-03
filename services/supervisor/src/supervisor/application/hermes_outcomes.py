"""Transactional, metadata-only Hermes outcome ledger application service."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
import fcntl
from hashlib import sha256
import hmac
import json
import os
from os import geteuid
from os.path import commonpath
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import HermesLaneRunProjectionV1, HermesLedgerIngestRequest, HermesOutcomeProjectionV1, HermesReviewHandoffRequest, HermesTechnicalBlockRecoveryRequest
from supervisor.domain.hermes_control_plane import can_replace_current_result
from supervisor.infrastructure.db.models import (
    HermesDeliveryEvidence,
    HermesLaneRun,
    HermesLedgerEvent,
    HermesOutcome,
    HermesReviewDisposition,
    HermesRoleCapabilityBinding,
    HermesUnavailableReviewerRequirement,
    HermesVerificationRecord,
)


def _request_digest(request: HermesLedgerIngestRequest) -> str:
    """Bind an idempotent event to every coupled ledger input, not just itself."""
    canonical = json.dumps(
        request.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


def _same_evidence(record: HermesDeliveryEvidence, value) -> bool:
    return (
        record.delivery_evidence_id,
        record.outcome_id,
        record.lane_run_id,
        record.schema_version,
        record.evidence_type,
        record.summary,
        record.source_ref,
        record.observed_at,
        record.evidence_refs_json,
        record.idempotency_key,
        record.created_at,
        record.metadata_only,
        record.raw_payload_retained,
    ) == (
        value.deliveryEvidenceId,
        value.outcomeId,
        value.laneRunId,
        value.schemaVersion,
        value.evidenceType,
        value.summary,
        value.sourceRef,
        value.observedAt,
        value.evidenceRefs,
        value.idempotencyKey,
        value.createdAt,
        value.metadataOnly,
        value.rawPayloadRetained,
    )


def _projection(outcome: HermesOutcome, lane: HermesLaneRun | None, evidence: HermesDeliveryEvidence | None = None) -> HermesOutcomeProjectionV1:
    freshness = "unknown"
    if lane is not None:
        freshness = "stale" if lane.stale_deadline_at <= datetime.now(UTC) else "fresh"
    return HermesOutcomeProjectionV1.model_validate(
        {
            "outcomeId": outcome.outcome_id,
            "revision": outcome.revision,
            "title": outcome.title,
            "lifecycle": outcome.status,
            "currentLaneRunId": lane.lane_run_id if lane else None,
            "currentResult": outcome.result,
            "reasonCode": outcome.reason_code,
            "evidenceRefs": outcome.evidence_refs_json,
            "latestEvidenceAt": max(outcome.observed_at, evidence.observed_at) if evidence else outcome.observed_at,
            "nextAction": outcome.next_action,
            "recoveryState": "recovering" if outcome.result in {"retryable", "rework"} else outcome.result,
            "freshness": freshness,
            "observedAt": outcome.observed_at,
            "metadataOnly": True,
            "rawPayloadRetained": False,
        }
    )


async def _existing_event(session: AsyncSession, request: HermesLedgerIngestRequest, digest: str) -> HermesLedgerEvent | None:
    value = request.event
    by_key = await session.scalar(select(HermesLedgerEvent).where(HermesLedgerEvent.idempotency_key == value.idempotencyKey))
    if by_key is not None:
        if by_key.request_digest_sha256 != digest:
            raise ValueError("Hermes event idempotency key conflicts with persisted metadata.")
        return by_key
    by_id = await session.get(HermesLedgerEvent, value.eventId)
    if by_id is not None:
        if by_id.request_digest_sha256 != digest:
            raise ValueError("Hermes eventId conflicts with persisted metadata.")
        return by_id
    return None


async def _latest_evidence(session: AsyncSession, lane: HermesLaneRun | None) -> HermesDeliveryEvidence | None:
    if lane is None:
        return None
    return await session.scalar(
        select(HermesDeliveryEvidence)
        .where(HermesDeliveryEvidence.lane_run_id == lane.lane_run_id)
        .order_by(HermesDeliveryEvidence.observed_at.desc())
        .limit(1)
    )


async def _require_bound_evidence(session: AsyncSession, *, evidence_refs: list[str], outcome: HermesOutcome, lane: HermesLaneRun, decision_at: datetime, require_current_projection: bool = True) -> None:
    evidence = (await session.scalars(select(HermesDeliveryEvidence).where(
        HermesDeliveryEvidence.delivery_evidence_id.in_(evidence_refs),
        HermesDeliveryEvidence.outcome_id == outcome.outcome_id,
        HermesDeliveryEvidence.lane_run_id == lane.lane_run_id,
    ))).all()
    if len(evidence) != len(set(evidence_refs)) or any(
        item.observed_at > decision_at
        or (require_current_projection and item.observed_at < max(outcome.updated_at, lane.updated_at))
        for item in evidence
    ):
        raise ValueError("Review evidence must resolve to the current bound outcome and Developer lane revision.")


def _decision_now(decision_at: datetime | None = None) -> datetime:
    """Never let a caller backdate a decision around a live-state fence."""
    now = datetime.now(UTC)
    return max(now, decision_at) if decision_at is not None else now


def _require_live_handoff_lane(lane: HermesLaneRun, *, decision_at: datetime | None = None) -> None:
    if lane.stale_deadline_at <= _decision_now(decision_at) or lane.timeout_at <= _decision_now(decision_at):
        raise ValueError("Review handoff cannot mutate a stale or timed-out Developer lane.")


def _outcome_values(request: HermesLedgerIngestRequest) -> dict[str, object]:
    value = request.outcome
    return {"status": value.status, "result": value.result, "reason_code": value.reasonCode, "evidence_refs_json": value.evidenceRefs, "next_action": value.nextAction, "observed_at": value.observedAt, "current_event_id": request.event.eventId, "updated_at": value.updatedAt}


def _lane_values(request: HermesLedgerIngestRequest) -> dict[str, object]:
    value = request.laneRun
    return {"status": value.status, "result": value.result, "reason_code": value.reasonCode, "evidence_refs_json": value.evidenceRefs, "next_action": value.nextAction, "heartbeat_at": value.heartbeatAt, "stale_deadline_at": value.staleDeadlineAt, "timeout_at": value.timeoutAt, "retry_budget": value.retryBudget, "rework_budget": value.reworkBudget, "evidence_fingerprint": value.evidenceFingerprint, "observed_at": value.observedAt, "current_event_id": request.event.eventId, "updated_at": value.updatedAt}


async def _update_if_current(session: AsyncSession, model, identifier: str, expected_revision: int, values: dict[str, object]) -> None:
    primary_key = next(iter(model.__table__.primary_key.columns))
    result = await session.execute(
        update(model).where(primary_key == identifier, model.revision == expected_revision).values(**values, revision=expected_revision + 1)
    )
    if result.rowcount != 1:
        await session.rollback()
        raise ValueError("Hermes projection changed concurrently; retry with fresh ledger metadata.")


async def ingest_hermes_ledger(
    session: AsyncSession,
    payload: HermesLedgerIngestRequest,
    *,
    commit: bool = True,
) -> HermesOutcomeProjectionV1:
    """Append an event and atomically publish its current Supervisor projection."""
    request = HermesLedgerIngestRequest.model_validate(payload.model_dump())
    digest = _request_digest(request)
    replay = await _existing_event(session, request, digest)
    if replay is not None:
        outcome = await session.get(HermesOutcome, request.outcome.outcomeId)
        lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.current_event_id == outcome.current_event_id)) if outcome else None
        if outcome is None:
            raise ValueError("Persisted Hermes event lacks its outcome projection.")
        return _projection(outcome, lane, await _latest_evidence(session, lane))
    if request.event.eventName in {"hermes.review.disposition.recorded", "hermes.verification.recorded"}:
        raise ValueError("Review and verification lifecycle events require the independent review handoff boundary.")

    # Locks protect supported production databases; revision predicates retain
    # the same fail-closed behavior for SQLite and stale ORM snapshots.
    outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == request.outcome.outcomeId).with_for_update())
    lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == request.laneRun.laneRunId).with_for_update())
    evidence = await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.delivery_evidence_id == request.deliveryEvidence.deliveryEvidenceId).with_for_update())
    if (
        request.outcome.status == "review"
        or request.laneRun.status == "review"
        or (outcome is not None and outcome.status == "review")
        or (lane is not None and lane.status == "review")
    ):
        raise ValueError("Review lanes may transition only through the independent review handoff boundary.")
    if "completed" in {request.outcome.status, request.laneRun.status, request.outcome.result, request.laneRun.result, request.event.result}:
        raise ValueError("Generic ledger ingestion may not complete outcomes or lanes outside the independent review handoff boundary.")
    if evidence is not None and not _same_evidence(evidence, request.deliveryEvidence):
        raise ValueError("Hermes delivery evidence conflicts with persisted metadata.")
    if outcome is not None and (outcome.title != request.outcome.title or outcome.summary != request.outcome.summary or outcome.created_at != request.outcome.createdAt or outcome.idempotency_key != request.outcome.idempotencyKey or request.outcome.observedAt < outcome.observed_at or request.outcome.updatedAt <= outcome.updated_at or not can_replace_current_result(previous=outcome.result, next_result=request.outcome.result)):
        raise ValueError("Hermes outcome transition conflicts with immutable or terminal metadata.")
    if lane is not None and (lane.outcome_id != request.outcome.outcomeId or lane.created_at != request.laneRun.createdAt or lane.idempotency_key != request.laneRun.idempotencyKey or request.laneRun.observedAt < lane.observed_at or request.laneRun.updatedAt <= lane.updated_at or not can_replace_current_result(previous=lane.result, next_result=request.laneRun.result) or request.laneRun.retryBudget > lane.retry_budget or request.laneRun.reworkBudget > lane.rework_budget):
        raise ValueError("Hermes lane-run transition conflicts with terminal or stale evidence metadata.")

    if outcome is None:
        value = request.outcome
        outcome = HermesOutcome(outcome_id=value.outcomeId, schema_version=value.schemaVersion, title=value.title, summary=value.summary, status=value.status, result=value.result, reason_code=value.reasonCode, evidence_refs_json=value.evidenceRefs, next_action=value.nextAction, observed_at=value.observedAt, current_event_id=request.event.eventId, idempotency_key=value.idempotencyKey, created_at=value.createdAt, updated_at=value.updatedAt, revision=1, metadata_only=True, raw_payload_retained=False)
        session.add(outcome)
    else:
        await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, _outcome_values(request))
    if lane is None:
        value = request.laneRun
        lane = HermesLaneRun(lane_run_id=value.laneRunId, outcome_id=value.outcomeId, schema_version=value.schemaVersion, lane_type=value.laneType, status=value.status, result=value.result, reason_code=value.reasonCode, evidence_refs_json=value.evidenceRefs, next_action=value.nextAction, heartbeat_at=value.heartbeatAt, stale_deadline_at=value.staleDeadlineAt, timeout_at=value.timeoutAt, retry_budget=value.retryBudget, rework_budget=value.reworkBudget, evidence_fingerprint=value.evidenceFingerprint, observed_at=value.observedAt, current_event_id=request.event.eventId, idempotency_key=value.idempotencyKey, created_at=value.createdAt, updated_at=value.updatedAt, revision=1, metadata_only=True, raw_payload_retained=False)
        session.add(lane)
    else:
        await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, _lane_values(request))
    if evidence is None:
        value = request.deliveryEvidence
        session.add(HermesDeliveryEvidence(delivery_evidence_id=value.deliveryEvidenceId, outcome_id=value.outcomeId, lane_run_id=value.laneRunId, schema_version=value.schemaVersion, evidence_type=value.evidenceType, summary=value.summary, source_ref=value.sourceRef, observed_at=value.observedAt, evidence_refs_json=value.evidenceRefs, idempotency_key=value.idempotencyKey, created_at=value.createdAt, metadata_only=True, raw_payload_retained=False))
    value = request.event
    lane_value = request.laneRun
    session.add(HermesLedgerEvent(event_id=value.eventId, outcome_id=value.outcomeId, lane_run_id=value.laneRunId, schema_version=value.schemaVersion, event_name=value.eventName, outcome_status=request.outcome.status, lane_status=lane_value.status, lane_type=lane_value.laneType, result=value.result, reason_code=value.reasonCode, evidence_refs_json=value.evidenceRefs, next_action=value.nextAction, correlation_id=value.correlationId, causation_id=value.causationId, observed_at=value.observedAt, emitted_at=value.emittedAt, heartbeat_at=lane_value.heartbeatAt, stale_deadline_at=lane_value.staleDeadlineAt, timeout_at=lane_value.timeoutAt, retry_budget=lane_value.retryBudget, rework_budget=lane_value.reworkBudget, evidence_fingerprint=lane_value.evidenceFingerprint, idempotency_key=value.idempotencyKey, request_digest_sha256=digest, metadata_only=True, raw_payload_retained=False, authoritative=False))
    try:
        if commit:
            await session.commit()
        else:
            await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        if not commit:
            raise
        replay = await _existing_event(session, request, digest)
        if replay is not None:
            restored = await session.get(HermesOutcome, request.outcome.outcomeId)
            restored_lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.current_event_id == restored.current_event_id)) if restored else None
            if restored is not None:
                return _projection(restored, restored_lane, await _latest_evidence(session, restored_lane))
        raise ValueError("Hermes ledger persistence conflict.") from exc
    await session.refresh(outcome)
    await session.refresh(lane)
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def read_hermes_outcome(session: AsyncSession, outcome_id: str) -> HermesOutcomeProjectionV1 | None:
    outcome = await session.get(HermesOutcome, outcome_id)
    if outcome is None:
        return None
    lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.current_event_id == outcome.current_event_id))
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def read_hermes_lane_run(session: AsyncSession, lane_run_id: str) -> HermesLaneRunProjectionV1 | None:
    lane = await session.get(HermesLaneRun, lane_run_id)
    if lane is None:
        return None
    return HermesLaneRunProjectionV1.model_validate({
        "laneRunId": lane.lane_run_id, "outcomeId": lane.outcome_id,
        "revision": lane.revision,
        "stage": lane.lane_type, "result": lane.result,
        "retryBudget": lane.retry_budget, "reworkBudget": lane.rework_budget,
        "freshness": "stale" if lane.stale_deadline_at <= datetime.now(UTC) else "fresh",
        "nextAction": lane.next_action, "metadataOnly": True,
        "rawPayloadRetained": False,
    })


def _technical_block_recovery_digest(request: HermesTechnicalBlockRecoveryRequest) -> str:
    return sha256(json.dumps(request.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


async def _replay_technical_block_recovery(
    session: AsyncSession,
    request: HermesTechnicalBlockRecoveryRequest,
    digest: str,
    *,
    recovered_by_operator_id: str,
) -> HermesOutcomeProjectionV1 | None:
    existing = await session.scalar(select(HermesLedgerEvent).where(HermesLedgerEvent.idempotency_key == request.idempotencyKey))
    if existing is None:
        return None
    if existing.request_digest_sha256 != digest or existing.event_name != "hermes.lane.recovered":
        raise ValueError("Technical-block recovery idempotency key conflicts with persisted metadata.")
    if existing.recovered_by_operator_id != recovered_by_operator_id:
        raise ValueError("Technical-block recovery replay conflicts with the authenticated Operator.")
    outcome = await session.get(HermesOutcome, request.outcomeId)
    lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.current_event_id == outcome.current_event_id)) if outcome else None
    if outcome is None or lane is None:
        raise ValueError("Persisted technical-block recovery lacks its current projection.")
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def recover_hermes_technical_block(
    session: AsyncSession, payload: HermesTechnicalBlockRecoveryRequest, *, recovered_by_operator_id: str, commit: bool = True,
) -> HermesOutcomeProjectionV1:
    """Replace one current technical block with a separately fenced review lane."""
    if not recovered_by_operator_id.strip():
        raise ValueError("Technical-block recovery requires an authenticated Operator.")
    request = HermesTechnicalBlockRecoveryRequest.model_validate(payload.model_dump())
    digest = _technical_block_recovery_digest(request)
    replay = await _replay_technical_block_recovery(
        session,
        request,
        digest,
        recovered_by_operator_id=recovered_by_operator_id,
    )
    if replay is not None:
        return replay
    outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == request.outcomeId).with_for_update())
    blocked_lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == request.blockedLaneRunId).with_for_update())
    replay = await _replay_technical_block_recovery(
        session,
        request,
        digest,
        recovered_by_operator_id=recovered_by_operator_id,
    )
    if replay is not None:
        return replay
    if outcome is None or blocked_lane is None or blocked_lane.outcome_id != outcome.outcome_id:
        raise ValueError("Technical-block recovery requires an existing bound outcome and blocked lane.")
    if outcome.current_event_id != blocked_lane.current_event_id or outcome.status != "blocked" or blocked_lane.status != "blocked" or outcome.result != "blockedTechnical" or blocked_lane.result != "blockedTechnical":
        raise ValueError("Technical-block recovery requires the current blockedTechnical projection.")
    if (outcome.revision, blocked_lane.revision) != (request.expectedOutcomeRevision, request.expectedBlockedLaneRevision):
        raise ValueError("Technical-block recovery revision is stale.")
    if request.observedAt < max(outcome.updated_at, blocked_lane.updated_at):
        raise ValueError("Technical-block recovery predates the blocked projection.")
    replacement, evidence = request.replacementLaneRun, request.deliveryEvidence
    blocked_updated_at = max(outcome.updated_at, blocked_lane.updated_at)
    if evidence.observedAt < blocked_updated_at:
        raise ValueError("Technical-block recovery evidence predates the blocked projection.")
    if any(timestamp < blocked_updated_at for timestamp in (replacement.createdAt, replacement.observedAt, replacement.updatedAt)):
        raise ValueError("Technical-block recovery replacement lane predates the blocked projection.")
    if replacement.reworkBudget != blocked_lane.rework_budget:
        raise ValueError("Technical-block recovery cannot replenish the blocked lane budget.")
    if blocked_lane.retry_budget <= 0:
        raise ValueError("Technical-block recovery retry budget is exhausted.")
    if replacement.retryBudget != blocked_lane.retry_budget - 1:
        raise ValueError("Technical-block recovery must consume exactly one retry budget.")
    if await session.get(HermesLaneRun, replacement.laneRunId) is not None or await session.get(HermesDeliveryEvidence, evidence.deliveryEvidenceId) is not None:
        raise ValueError("Technical-block recovery replacement identity already exists.")
    event_id = f"event:technical-recovery:{sha256(request.idempotencyKey.encode('utf-8')).hexdigest()}"
    if await session.get(HermesLedgerEvent, event_id) is not None:
        raise ValueError("Technical-block recovery event identity already exists.")
    if replacement.staleDeadlineAt <= max(datetime.now(UTC), request.observedAt) or replacement.timeoutAt <= max(datetime.now(UTC), request.observedAt):
        raise ValueError("Technical-block recovery replacement lane is stale or timed out.")
    session.add(HermesLaneRun(
        lane_run_id=replacement.laneRunId, outcome_id=outcome.outcome_id, schema_version=replacement.schemaVersion,
        lane_type=replacement.laneType, status=replacement.status, result=replacement.result, reason_code=request.reasonCode,
        evidence_refs_json=replacement.evidenceRefs, next_action=request.nextAction, heartbeat_at=replacement.heartbeatAt,
        stale_deadline_at=replacement.staleDeadlineAt, timeout_at=replacement.timeoutAt, retry_budget=replacement.retryBudget,
        rework_budget=replacement.reworkBudget, evidence_fingerprint=replacement.evidenceFingerprint, observed_at=replacement.observedAt,
        current_event_id=event_id, idempotency_key=replacement.idempotencyKey, created_at=replacement.createdAt,
        updated_at=replacement.updatedAt, revision=1, metadata_only=True, raw_payload_retained=False,
    ))
    session.add(HermesDeliveryEvidence(
        delivery_evidence_id=evidence.deliveryEvidenceId, outcome_id=outcome.outcome_id, lane_run_id=replacement.laneRunId,
        schema_version=evidence.schemaVersion, evidence_type=evidence.evidenceType, summary=evidence.summary,
        source_ref=evidence.sourceRef, observed_at=evidence.observedAt, evidence_refs_json=evidence.evidenceRefs,
        idempotency_key=evidence.idempotencyKey, created_at=evidence.createdAt, metadata_only=True, raw_payload_retained=False,
    ))
    session.add(HermesLedgerEvent(
        event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=replacement.laneRunId,
        schema_version="hermes_lifecycle_event.v1", event_name="hermes.lane.recovered", outcome_status="review",
        lane_status="review", lane_type=replacement.laneType, result="retryable", reason_code=request.reasonCode,
        evidence_refs_json=replacement.evidenceRefs, next_action=request.nextAction, correlation_id=request.idempotencyKey,
        causation_id=blocked_lane.current_event_id, observed_at=request.observedAt, emitted_at=_emitted_at(request.observedAt),
        heartbeat_at=replacement.heartbeatAt, stale_deadline_at=replacement.staleDeadlineAt, timeout_at=replacement.timeoutAt,
        retry_budget=replacement.retryBudget, rework_budget=replacement.reworkBudget, evidence_fingerprint=replacement.evidenceFingerprint,
        idempotency_key=request.idempotencyKey, request_digest_sha256=digest, recovered_by_operator_id=recovered_by_operator_id,
        metadata_only=True, raw_payload_retained=False, authoritative=False,
    ))
    await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {
        "status": "review", "result": "retryable", "reason_code": request.reasonCode,
        "evidence_refs_json": replacement.evidenceRefs, "next_action": request.nextAction,
        "observed_at": request.observedAt, "updated_at": request.observedAt, "current_event_id": event_id,
    })
    try:
        if commit:
            await session.commit()
        else:
            await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        replay = await _replay_technical_block_recovery(
            session,
            request,
            digest,
            recovered_by_operator_id=recovered_by_operator_id,
        )
        if replay is not None:
            return replay
        raise ValueError("Technical-block recovery persistence conflict.") from exc
    outcome = await session.get(HermesOutcome, request.outcomeId)
    lane = await session.get(HermesLaneRun, replacement.laneRunId)
    assert outcome is not None and lane is not None
    return _projection(outcome, lane, await _latest_evidence(session, lane))


def _handoff_digest(request: HermesReviewHandoffRequest) -> str:
    return sha256(json.dumps(request.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _handoff_replay_digests(request: HermesReviewHandoffRequest) -> set[str]:
    """Accept the pre-alias digest only for exact persisted handoff replay."""
    return {
        _handoff_digest(request),
        sha256(json.dumps(request.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
    }


def _emitted_at(observed_at: datetime) -> datetime:
    """Events cannot claim emission before the metadata they persist."""
    return max(datetime.now(UTC), observed_at)


def _same_verification(record: HermesVerificationRecord, value) -> bool:
    if not record.revision_binding_known:
        return False
    return (
        record.verification_record_id, record.outcome_id, record.lane_run_id,
        record.schema_version, record.result, record.target, record.source_fingerprint,
        record.developer_identity, record.developer_home, record.developer_workspace,
        record.evidence_refs_json, record.expected_outcome_revision,
        record.expected_lane_revision, record.observed_at, record.created_at,
    ) == (
        value.verificationRecordId, value.outcomeId, value.laneRunId,
        value.schemaVersion, value.result, value.target, value.sourceFingerprint,
        value.developerIdentity, value.developerHome, value.developerWorkspace,
        value.evidenceRefs, value.expectedOutcomeRevision,
        value.expectedLaneRevision, value.observedAt, value.createdAt,
    )


def _canonical_role_profile(home: str, workspace: str) -> tuple[str, str]:
    """Resolve trusted existing profile locations before binding or proof checks."""
    try:
        canonical_home, canonical_workspace = Path(home).resolve(strict=True), Path(workspace).resolve(strict=True)
        if not canonical_home.is_dir() or not canonical_workspace.is_dir():
            raise ValueError("Role capability home and workspace must be existing directories.")
        return str(canonical_home), str(canonical_workspace)
    except (OSError, RuntimeError, ValueError) as exc:
        raise ValueError("Role capability home and workspace must be existing canonical filesystem paths.") from exc


def _owner_private_directory(path: Path, *, label: str) -> None:
    try:
        info = path.stat()
    except OSError as exc:
        raise ValueError(f"Role capability {label} must be an existing canonical directory.") from exc
    if not path.is_dir() or info.st_uid != geteuid() or info.st_mode & 0o077:
        raise ValueError(f"Role capability {label} must be owner-private.")


def _planned_role_profile(home: str, workspace: str, *, runtime_root: str | None = None) -> tuple[Path, Path]:
    """Validate the two explicit profile roots without creating either one."""
    def requested_leaf(value: str, *, allow_create: bool) -> Path:
        candidate = Path(value)
        if not candidate.is_absolute() or candidate == Path("/"):
            raise ValueError("Role capability home and workspace must be bounded absolute profile roots.")
        if candidate.exists() or candidate.is_symlink():
            try:
                resolved = candidate.resolve(strict=True)
            except (OSError, RuntimeError, ValueError) as exc:
                raise ValueError("Role capability profile roots must be existing canonical directories.") from exc
            if not resolved.is_dir():
                raise ValueError("Role capability profile roots must be existing canonical directories.")
            if resolved == Path("/"):
                raise ValueError("Role capability roots cannot resolve to filesystem root.")
            return resolved
        if not allow_create:
            raise ValueError("Role capability workspace must be an existing canonical directory.")
        try:
            parent = candidate.parent.resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as exc:
            raise ValueError("Role capability profile parent must already exist and be canonical.") from exc
        if not parent.is_dir():
            raise ValueError("Role capability profile parent must be a directory.")
        return parent / candidate.name

    requested_home = requested_leaf(home, allow_create=True)
    requested_workspace = requested_leaf(workspace, allow_create=runtime_root is None)
    if _profiles_overlap(str(requested_home), str(requested_workspace)):
        raise ValueError("Role capability home and workspace must be disjoint canonical roots.")
    if runtime_root is not None:
        try:
            configured_root = Path(runtime_root).resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as exc:
            raise ValueError("Role capability runtime root must be an existing canonical directory.") from exc
        if configured_root == Path("/"):
            raise ValueError("Role capability runtime root cannot be filesystem root.")
        _owner_private_directory(configured_root, label="runtime root")
        try:
            requested_home.relative_to(configured_root)
        except ValueError as exc:
            raise ValueError("Role capability home must be inside the configured runtime root.") from exc
        _owner_private_directory(requested_home.parent, label="profile parent")
        if requested_home.exists():
            _owner_private_directory(requested_home, label="home")
        _owner_private_directory(requested_workspace, label="workspace")
    return requested_home, requested_workspace


def _remove_bootstrapped_role_profile_roots(roots: list[Path]) -> None:
    for root in reversed(roots):
        try:
            root.rmdir()
        except OSError:
            pass


async def _remove_unbound_bootstrapped_role_profile_roots(session: AsyncSession, roots: list[Path]) -> None:
    """Remove attempt-owned roots only when no concurrent binding adopted them."""
    for root in roots:
        root_text = str(root)
        adopted = await session.scalar(
            select(HermesRoleCapabilityBinding.capability_binding_id).where(
                (HermesRoleCapabilityBinding.home == root_text)
                | (HermesRoleCapabilityBinding.workspace == root_text)
            )
        )
        if adopted is None:
            _remove_bootstrapped_role_profile_roots([root])


_ROLE_PROFILE_PARENT_LOCKS: dict[str, asyncio.Lock] = {}


@asynccontextmanager
async def _lock_role_profile_parents(*roots: Path):
    """Serialize profile root adoption and rollback across local workers."""
    parent_paths = sorted({str(root.parent) for root in roots})
    locks = [_ROLE_PROFILE_PARENT_LOCKS.setdefault(parent, asyncio.Lock()) for parent in parent_paths]
    acquired_locks: list[asyncio.Lock] = []
    descriptors: list[int] = []
    try:
        for lock in locks:
            await lock.acquire()
            acquired_locks.append(lock)
        for parent in parent_paths:
            descriptor = os.open(parent, os.O_RDONLY)
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            descriptors.append(descriptor)
        yield
    finally:
        for descriptor in reversed(descriptors):
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)
        for lock in reversed(acquired_locks):
            lock.release()


def _bootstrap_role_profile(home: str, workspace: str, *, runtime_root: str | None = None) -> tuple[str, str, list[Path]]:
    """Create only already-validated explicit leaf roots, then retain canonical bindings."""
    requested_home, requested_workspace = _planned_role_profile(home, workspace, runtime_root=runtime_root)
    created_roots: list[Path] = []
    try:
        for root in (requested_home, requested_workspace):
            if not root.exists():
                try:
                    root.mkdir(mode=0o700)
                except FileExistsError:
                    pass
                else:
                    created_roots.append(root)
        canonical_home, canonical_workspace = _canonical_role_profile(str(requested_home), str(requested_workspace))
        # A same-UID process can win the absent-leaf mkdir race with a symlink.
        # Reapply runtime containment, privacy, and disjoint-root validation to
        # the final canonical paths before they can be persisted in a binding.
        final_home, final_workspace = _planned_role_profile(
            canonical_home,
            canonical_workspace,
            runtime_root=runtime_root,
        )
        return str(final_home), str(final_workspace), created_roots
    except Exception:
        _remove_bootstrapped_role_profile_roots(created_roots)
        raise


def _same_role_capability(existing: HermesRoleCapabilityBinding, request, digest: str, provisioned_by_operator_id: str, *, home: str, workspace: str) -> bool:
    return (existing.role, existing.outcome_id, existing.lane_run_id, existing.identity, existing.home, existing.workspace, existing.capability_digest_sha256, existing.expires_at, existing.created_at, existing.provisioned_by_operator_id) == (request.role, request.outcomeId, request.laneRunId, request.identity, home, workspace, digest, request.expiresAt, request.createdAt, provisioned_by_operator_id)


def _profiles_overlap(left: str, right: str) -> bool:
    shared = commonpath((left, right))
    return shared == left or shared == right


async def provision_hermes_role_capability(
    session: AsyncSession,
    request,
    *,
    provisioned_by_operator_id: str,
    runtime_root: str | None = None,
) -> HermesRoleCapabilityBinding:
    """Persist only a Coordinator-provisioned local capability digest."""
    digest = sha256(request.capabilitySecret.encode("utf-8")).hexdigest()
    outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == request.outcomeId).with_for_update())
    lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == request.laneRunId).with_for_update())
    if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id or outcome.current_event_id != lane.current_event_id:
        raise ValueError("Role capability must bind an existing current outcome and lane.")
    if request.expiresAt <= datetime.now(UTC):
        raise ValueError("Role capability expiry must be in the future.")
    planned_home, planned_workspace = _planned_role_profile(request.home, request.workspace, runtime_root=runtime_root)
    async with _lock_role_profile_parents(planned_home, planned_workspace):
        existing = await session.get(HermesRoleCapabilityBinding, request.capabilityBindingId)
        if existing is not None:
            if existing.revoked_at is not None:
                raise ValueError("Role capability binding is revoked; provision a distinct binding.")
            if not _same_role_capability(existing, request, digest, provisioned_by_operator_id, home=str(planned_home), workspace=str(planned_workspace)):
                raise ValueError("Role capability binding conflicts with persisted metadata.")
            canonical_home, canonical_workspace = _canonical_role_profile(str(planned_home), str(planned_workspace))
            _owner_private_directory(Path(canonical_home), label="home")
            _owner_private_directory(Path(canonical_workspace), label="workspace")
            return existing
        home, workspace, created_roots = _bootstrap_role_profile(str(planned_home), str(planned_workspace), runtime_root=runtime_root)
        binding = HermesRoleCapabilityBinding(
            capability_binding_id=request.capabilityBindingId, outcome_id=request.outcomeId, lane_run_id=request.laneRunId,
            role=request.role, identity=request.identity, home=home, workspace=workspace,
            capability_digest_sha256=digest, expires_at=request.expiresAt, created_at=request.createdAt, revoked_at=None,
            provisioned_by_operator_id=provisioned_by_operator_id, metadata_only=True, raw_payload_retained=False,
        )
        session.add(binding)
        try:
            await session.commit()
        except Exception as exc:
            await session.rollback()
            if isinstance(exc, IntegrityError):
                existing = await session.get(HermesRoleCapabilityBinding, request.capabilityBindingId)
                if existing is not None and existing.revoked_at is None and _same_role_capability(existing, request, digest, provisioned_by_operator_id, home=home, workspace=workspace):
                    return existing
            await _remove_unbound_bootstrapped_role_profile_roots(session, created_roots)
            if isinstance(exc, IntegrityError):
                raise ValueError("Role capability binding persistence conflict.") from exc
            raise
        return binding


async def revoke_hermes_role_capability(session: AsyncSession, *, capability_binding_id: str, revoked_by_operator_id: str) -> HermesRoleCapabilityBinding:
    """Revoke one Coordinator-provisioned capability without retaining its proof."""
    binding = await session.get(HermesRoleCapabilityBinding, capability_binding_id)
    if binding is None:
        raise ValueError("Role capability binding does not exist.")
    fenced = await session.execute(
        update(HermesRoleCapabilityBinding)
        .where(
            HermesRoleCapabilityBinding.capability_binding_id == capability_binding_id,
            HermesRoleCapabilityBinding.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC), revoked_by_operator_id=revoked_by_operator_id)
    )
    if fenced.rowcount == 1:
        await session.commit()
        await session.refresh(binding)
        return binding
    await session.rollback()
    settled = await session.get(HermesRoleCapabilityBinding, capability_binding_id, populate_existing=True)
    if settled is None:
        raise ValueError("Role capability binding does not exist.")
    if settled.revoked_by_operator_id == revoked_by_operator_id:
        return settled
    raise ValueError("Role capability binding was already revoked by another Operator.")


async def _require_role_capability(session: AsyncSession, *, binding_id: str, secret: str, role: str, outcome_id: str, lane_run_id: str, identity: str, home: str, workspace: str, lock: bool = False, decision_at: datetime | None = None) -> HermesRoleCapabilityBinding:
    statement = select(HermesRoleCapabilityBinding).where(HermesRoleCapabilityBinding.capability_binding_id == binding_id)
    if lock:
        statement = statement.with_for_update()
    binding = await session.scalar(statement)
    if binding is None or binding.role != role or binding.outcome_id != outcome_id or binding.lane_run_id != lane_run_id:
        raise ValueError("Role capability is not bound to this outcome and Developer lane.")
    if binding.revoked_at is not None or binding.expires_at <= _decision_now(decision_at):
        raise ValueError("Role capability is revoked or expired.")
    digest = sha256(secret.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(binding.capability_digest_sha256, digest):
        raise ValueError("Role capability proof is invalid.")
    canonical_home, canonical_workspace = _canonical_role_profile(home, workspace)
    if (binding.identity, binding.home, binding.workspace) != (identity, canonical_home, canonical_workspace):
        raise ValueError("Caller-supplied role profile does not match the Coordinator binding.")
    _owner_private_directory(Path(canonical_home), label="home")
    _owner_private_directory(Path(canonical_workspace), label="workspace")
    return binding


async def _fence_unrevoked_role_capability(session: AsyncSession, binding: HermesRoleCapabilityBinding, *, decision_at: datetime | None = None) -> None:
    """Serialize a write-capable handoff against revocation on every supported database."""
    result = await session.execute(
        update(HermesRoleCapabilityBinding)
        .where(
            HermesRoleCapabilityBinding.capability_binding_id == binding.capability_binding_id,
            HermesRoleCapabilityBinding.revoked_at.is_(None),
            HermesRoleCapabilityBinding.expires_at > _decision_now(decision_at),
        )
        .values(revoked_at=None)
    )
    if result.rowcount != 1:
        raise ValueError("Role capability is revoked or expired.")


async def _fence_role_capability_before_commit(session: AsyncSession, binding: HermesRoleCapabilityBinding, *, decision_at: datetime | None = None) -> None:
    """Fail closed without retaining staged handoff writes when a final fence loses."""
    try:
        await _fence_unrevoked_role_capability(session, binding, decision_at=decision_at)
    except ValueError:
        await session.rollback()
        raise


async def _require_operator_role_capability(
    session: AsyncSession,
    *,
    binding_id: str,
    secret: str,
    outcome_id: str,
    lane_run_id: str,
    authenticated_operator_id: str,
    lock: bool = False,
    decision_at: datetime | None = None,
) -> HermesRoleCapabilityBinding:
    """Require the task-scoped Operator capability without accepting caller profile claims."""
    statement = select(HermesRoleCapabilityBinding).where(
        HermesRoleCapabilityBinding.capability_binding_id == binding_id
    )
    if lock:
        statement = statement.with_for_update()
    binding = await session.scalar(statement)
    if (
        binding is None
        or binding.role != "operator"
        or binding.outcome_id != outcome_id
        or binding.lane_run_id != lane_run_id
        or binding.identity != authenticated_operator_id
    ):
        raise ValueError("Operator capability is not bound to this authenticated outcome and Developer lane.")
    if binding.revoked_at is not None or binding.expires_at <= _decision_now(decision_at):
        raise ValueError("Role capability is revoked or expired.")
    digest = sha256(secret.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(binding.capability_digest_sha256, digest):
        raise ValueError("Role capability proof is invalid.")
    canonical_home, canonical_workspace = _canonical_role_profile(binding.home, binding.workspace)
    _owner_private_directory(Path(canonical_home), label="home")
    _owner_private_directory(Path(canonical_workspace), label="workspace")
    return binding


async def _replay_unavailable_reviewer_block(
    session: AsyncSession,
    block,
    *,
    digest: str,
    recorded_by_operator_id: str,
) -> HermesOutcomeProjectionV1 | None:
    prior = await session.scalar(
        select(HermesUnavailableReviewerRequirement)
        .where(HermesUnavailableReviewerRequirement.idempotency_key == block.idempotencyKey)
        .with_for_update()
    )
    if prior is None:
        return None
    if (
        prior.unavailable_reviewer_block_id != block.unavailableReviewerBlockId
        or prior.request_digest_sha256 != digest
        or prior.recorded_by_operator_id != recorded_by_operator_id
    ):
        raise ValueError("Unavailable-reviewer block idempotency key conflicts with persisted metadata.")
    outcome = await session.get(HermesOutcome, prior.outcome_id)
    if outcome is None:
        raise ValueError("Persisted unavailable-reviewer block lacks its ledger projection.")
    lane = await _current_lane(session, outcome)
    if lane is None:
        raise ValueError("Persisted unavailable-reviewer block lacks its current ledger lane.")
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def _current_lane(session: AsyncSession, outcome: HermesOutcome) -> HermesLaneRun | None:
    return await session.scalar(select(HermesLaneRun).where(HermesLaneRun.current_event_id == outcome.current_event_id))


async def _replay_verification(
    session: AsyncSession,
    value,
    *,
    developer_capability_binding_id: str | None = None,
) -> HermesOutcomeProjectionV1 | None:
    existing = await session.scalar(
        select(HermesVerificationRecord)
        .where(HermesVerificationRecord.idempotency_key == value.idempotencyKey)
        .with_for_update()
    )
    if existing is None:
        return None
    if not _same_verification(existing, value):
        raise ValueError("Verification idempotency key conflicts with persisted metadata.")
    if developer_capability_binding_id is not None and existing.developer_capability_binding_id != developer_capability_binding_id:
        raise ValueError("Verification capability binding conflicts with persisted metadata.")
    outcome = await session.get(HermesOutcome, existing.outcome_id)
    if outcome is None:
        raise ValueError("Persisted verification record lacks its ledger projection.")
    lane = await _current_lane(session, outcome)
    if lane is None:
        raise ValueError("Persisted verification record lacks its current ledger lane.")
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def _replay_disposition(
    session: AsyncSession, disposition, digests: set[str], *, authenticated_recorder_id: str | None = None,
) -> HermesOutcomeProjectionV1 | None:
    prior = await session.scalar(
        select(HermesReviewDisposition)
        .where(HermesReviewDisposition.idempotency_key == disposition.idempotencyKey)
        .with_for_update()
    )
    if prior is None:
        return None
    if prior.review_disposition_id != disposition.reviewDispositionId or prior.request_digest_sha256 not in digests:
        raise ValueError("Review disposition idempotency key conflicts with persisted metadata.")
    if not prior.revision_binding_known:
        raise ValueError("Review disposition replay lacks a trusted revision binding.")
    if authenticated_recorder_id is not None and prior.exception_requirement_json is not None and prior.exception_requirement_json.get("recordedBy") != authenticated_recorder_id:
        raise ValueError("Review disposition exception recorder conflicts with persisted metadata.")
    outcome = await session.get(HermesOutcome, prior.outcome_id)
    if outcome is None:
        raise ValueError("Persisted review disposition lacks its ledger projection.")
    lane = await _current_lane(session, outcome)
    if lane is None:
        raise ValueError("Persisted review disposition lacks its current ledger lane.")
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def ingest_hermes_review_handoff(
    session: AsyncSession, payload: HermesReviewHandoffRequest, *, commit: bool = True,
    authenticated_recorder_id: str | None = None,
) -> HermesOutcomeProjectionV1:
    """Persist a verification-gated independent review and its ledger projection atomically."""
    raw_request = HermesReviewHandoffRequest.model_validate(payload.model_dump(by_alias=True))
    request = raw_request
    if request.unavailableReviewerException is not None:
        if authenticated_recorder_id is None:
            raise ValueError("Unavailable-reviewer exceptions require an authenticated recorder.")
        request = request.model_copy(update={
            "unavailableReviewerException": request.unavailableReviewerException.model_copy(
                update={"recordedBy": authenticated_recorder_id},
            ),
        })
    verification, disposition = request.verification, request.disposition
    if verification.observedAt > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("Verification evidence cannot be materially future-dated.")
    if disposition is not None and disposition.observedAt > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("Review disposition cannot be materially future-dated.")
    if request.unavailableReviewerBlock is not None and request.unavailableReviewerBlock.observedAt > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("Unavailable-reviewer block cannot be materially future-dated.")
    if not commit and request.unavailableReviewerException is not None:
        raise ValueError("Unavailable-reviewer exceptions require an atomic committed handoff.")
    if request.unavailableReviewerBlock is not None:
        block, exception = request.unavailableReviewerBlock, request.unavailableReviewerException
        assert exception is not None and authenticated_recorder_id is not None
        assert request.operatorCapabilityBindingId is not None and request.operatorCapabilityProof is not None
        operator_capability = await _require_operator_role_capability(
            session,
            binding_id=request.operatorCapabilityBindingId,
            secret=request.operatorCapabilityProof,
            outcome_id=verification.outcomeId,
            lane_run_id=verification.laneRunId,
            authenticated_operator_id=authenticated_recorder_id,
            lock=True,
            decision_at=block.observedAt,
        )
        digest = _handoff_digest(request)
        replay = await _replay_unavailable_reviewer_block(
            session,
            block,
            digest=digest,
            recorded_by_operator_id=authenticated_recorder_id,
        )
        if replay is not None:
            return replay
        outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == verification.outcomeId).with_for_update())
        lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == verification.laneRunId).with_for_update())
        operator_capability = await _require_operator_role_capability(
            session,
            binding_id=request.operatorCapabilityBindingId,
            secret=request.operatorCapabilityProof,
            outcome_id=verification.outcomeId,
            lane_run_id=verification.laneRunId,
            authenticated_operator_id=authenticated_recorder_id,
            decision_at=block.observedAt,
        )
        await _fence_unrevoked_role_capability(session, operator_capability, decision_at=block.observedAt)
        replay = await _replay_unavailable_reviewer_block(
            session,
            block,
            digest=digest,
            recorded_by_operator_id=authenticated_recorder_id,
        )
        if replay is not None:
            return replay
        if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id or outcome.current_event_id != lane.current_event_id:
            raise ValueError("Unavailable-reviewer block requires the current bound outcome and Developer lane.")
        _require_live_handoff_lane(lane, decision_at=block.observedAt)
        if exception.reviewBy <= _decision_now(block.observedAt):
            raise ValueError("Unavailable-reviewer exception expired before persistence.")
        record = await session.scalar(select(HermesVerificationRecord).where(HermesVerificationRecord.idempotency_key == verification.idempotencyKey).with_for_update())
        if record is None or record.verification_record_id != verification.verificationRecordId or not _same_verification(record, verification) or record.result != "passed":
            raise ValueError("Unavailable-reviewer block requires a previously recorded passed Developer verification.")
        verification_event_id = f"event:verification:{sha256(verification.verificationRecordId.encode('utf-8')).hexdigest()}"
        typed_review_entry = (
            outcome.current_event_id == lane.current_event_id == verification_event_id
            and (outcome.revision, lane.revision) == (block.expectedOutcomeRevision + 1, block.expectedLaneRevision + 1)
        )
        current_event = await session.get(HermesLedgerEvent, outcome.current_event_id)
        recovered_review_entry = (
            current_event is not None
            and current_event.event_name == "hermes.lane.recovered"
            and (outcome.revision, lane.revision) == (block.expectedOutcomeRevision, block.expectedLaneRevision)
        )
        if (outcome.revision, lane.revision) != (block.expectedOutcomeRevision, block.expectedLaneRevision) and not (typed_review_entry or recovered_review_entry):
            raise ValueError("Unavailable-reviewer block revision is stale.")
        if block.observedAt < outcome.observed_at or block.observedAt < lane.observed_at or block.observedAt < outcome.updated_at or block.observedAt < lane.updated_at:
            raise ValueError("Unavailable-reviewer block evidence predates the current ledger projection.")
        if block.observedAt > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("Unavailable-reviewer block cannot be materially future-dated.")
        if lane.evidence_fingerprint != verification.sourceFingerprint:
            raise ValueError("Verification source fingerprint is stale for the Developer lane.")
        carry_forward_recovered_evidence = (
            (typed_review_entry or recovered_review_entry)
            and block.evidenceRefs == record.evidence_refs_json == lane.evidence_refs_json
        )
        await _require_bound_evidence(
            session,
            evidence_refs=block.evidenceRefs,
            outcome=outcome,
            lane=lane,
            decision_at=block.observedAt,
            require_current_projection=not carry_forward_recovered_evidence,
        )
        if not can_replace_current_result(previous=outcome.result, next_result="blockedTechnical") or not can_replace_current_result(previous=lane.result, next_result="blockedTechnical"):
            raise ValueError("Unavailable-reviewer block cannot overwrite a terminal ledger transition.")
        # The validation above can span awaits; fence the live deadline again
        # directly before admitting the new blocked transition.
        _require_live_handoff_lane(lane, decision_at=block.observedAt)
        event_id = f"event:unavailable-reviewer:{sha256(block.unavailableReviewerBlockId.encode('utf-8')).hexdigest()}"
        session.add(HermesLedgerEvent(
            event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id,
            schema_version="hermes_lifecycle_event.v1", event_name="hermes.review.unavailable_reviewer.blocked",
            outcome_status="blocked", lane_status="blocked", lane_type=lane.lane_type, result="blockedTechnical",
            reason_code=block.reasonCode, evidence_refs_json=block.evidenceRefs, next_action=block.nextAction,
            correlation_id=block.unavailableReviewerBlockId, causation_id=verification.verificationRecordId,
            observed_at=block.observedAt, emitted_at=_emitted_at(block.observedAt), heartbeat_at=lane.heartbeat_at,
            stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at, retry_budget=lane.retry_budget,
            rework_budget=lane.rework_budget, evidence_fingerprint=lane.evidence_fingerprint,
            idempotency_key=f"event:unavailable-reviewer:{sha256(block.idempotencyKey.encode('utf-8')).hexdigest()}",
            request_digest_sha256=digest, metadata_only=True, raw_payload_retained=False, authoritative=False,
        ))
        await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {
            "status": "blocked", "result": "blockedTechnical", "reason_code": block.reasonCode,
            "evidence_refs_json": block.evidenceRefs, "next_action": block.nextAction,
            "observed_at": block.observedAt, "updated_at": block.observedAt, "current_event_id": event_id,
        })
        await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {
            "status": "blocked", "result": "blockedTechnical", "reason_code": block.reasonCode,
            "evidence_refs_json": block.evidenceRefs, "next_action": block.nextAction,
            "observed_at": block.observedAt, "updated_at": block.observedAt, "current_event_id": event_id,
        })
        session.add(HermesUnavailableReviewerRequirement(
            unavailable_reviewer_block_id=block.unavailableReviewerBlockId, exception_id=exception.exceptionId,
            verification_record_id=verification.verificationRecordId, outcome_id=block.outcomeId,
            developer_lane_run_id=block.developerLaneRunId, schema_version=block.schemaVersion,
            expected_outcome_revision=block.expectedOutcomeRevision, expected_lane_revision=block.expectedLaneRevision,
            reason_code=block.reasonCode, next_action=block.nextAction, evidence_refs_json=block.evidenceRefs,
            idempotency_key=block.idempotencyKey, request_digest_sha256=digest,
            recorded_by_operator_id=authenticated_recorder_id,
            exception_requirement_json=exception.model_dump(mode="json", by_alias=True),
            observed_at=block.observedAt, created_at=block.createdAt, metadata_only=True, raw_payload_retained=False,
        ))
        try:
            await _fence_role_capability_before_commit(session, operator_capability, decision_at=block.observedAt)
            _require_live_handoff_lane(lane, decision_at=block.observedAt)
            if exception.reviewBy <= _decision_now(block.observedAt):
                await session.rollback()
                raise ValueError("Unavailable-reviewer exception expired before persistence.")
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            replay = await _replay_unavailable_reviewer_block(
                session,
                block,
                digest=digest,
                recorded_by_operator_id=authenticated_recorder_id,
            )
            if replay is not None:
                return replay
            raise ValueError("Unavailable-reviewer block persistence conflict.") from exc
        await session.refresh(outcome); await session.refresh(lane)
        return _projection(outcome, lane, await _latest_evidence(session, lane))
    if disposition is None:
        assert request.developerCapabilityBindingId is not None and request.developerCapabilityProof is not None
        developer_capability = await _require_role_capability(session, binding_id=request.developerCapabilityBindingId, secret=request.developerCapabilityProof, role="developer", outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId, identity=verification.developerIdentity, home=verification.developerHome, workspace=verification.developerWorkspace, lock=True, decision_at=verification.observedAt)
        replay = await _replay_verification(
            session,
            verification,
            developer_capability_binding_id=developer_capability.capability_binding_id,
        )
        if replay is not None:
            return replay
        outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == verification.outcomeId).with_for_update())
        lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == verification.laneRunId).with_for_update())
        developer_capability = await _require_role_capability(session, binding_id=request.developerCapabilityBindingId, secret=request.developerCapabilityProof, role="developer", outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId, identity=verification.developerIdentity, home=verification.developerHome, workspace=verification.developerWorkspace, decision_at=verification.observedAt)
        await _fence_unrevoked_role_capability(session, developer_capability, decision_at=verification.observedAt)
        if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id or outcome.current_event_id != lane.current_event_id:
            raise ValueError("Verification result requires the current bound outcome and Developer lane.")
        # A concurrent exact request may have committed while this request was
        # waiting for the outcome/lane locks. Recheck before stale fencing.
        replay = await _replay_verification(
            session,
            verification,
            developer_capability_binding_id=developer_capability.capability_binding_id,
        )
        if replay is not None:
            return replay
        _require_live_handoff_lane(lane, decision_at=verification.observedAt)
        if (outcome.revision, lane.revision) != (verification.expectedOutcomeRevision, verification.expectedLaneRevision):
            raise ValueError("Verification result revision is stale.")
        current_event = await session.get(HermesLedgerEvent, outcome.current_event_id)
        initial_verification = outcome.status == "active" and lane.status == "running"
        recovered_review_lane = current_event is not None and current_event.event_name == "hermes.lane.recovered" and outcome.status == lane.status == "review"
        eligible_verification = initial_verification or recovered_review_lane
        enter_review = verification.result == "passed" and initial_verification
        if verification.result == "passed" and not eligible_verification:
            prior_passed = await session.scalar(
                select(HermesVerificationRecord.verification_record_id).where(
                    HermesVerificationRecord.outcome_id == verification.outcomeId,
                    HermesVerificationRecord.lane_run_id == verification.laneRunId,
                    HermesVerificationRecord.result == "passed",
                )
            )
            if prior_passed is not None:
                raise ValueError("Passed verification cannot replace the existing ordinary review-lane verification.")
        if verification.result != "passed" and not eligible_verification:
            raise ValueError("Failed or inconclusive verification requires the initial active Developer lane.")
        if (not eligible_verification and (outcome.status != "review" or lane.status != "review")) or lane.evidence_fingerprint != verification.sourceFingerprint:
            raise ValueError("Verification result is stale for the current review lane.")
        if verification.observedAt < outcome.observed_at or verification.observedAt < lane.observed_at or verification.observedAt < outcome.updated_at or verification.observedAt < lane.updated_at:
            raise ValueError("Verification evidence predates the current ledger projection.")
        if verification.observedAt > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("Verification evidence cannot be materially future-dated.")
        carry_forward_recovery_evidence = recovered_review_lane and verification.evidenceRefs == lane.evidence_refs_json
        await _require_bound_evidence(session, evidence_refs=verification.evidenceRefs, outcome=outcome, lane=lane, decision_at=verification.observedAt, require_current_projection=not carry_forward_recovery_evidence)
        if verification.result == "passed":
            if not can_replace_current_result(previous=outcome.result, next_result="retryable") or not can_replace_current_result(previous=lane.result, next_result="retryable"):
                raise ValueError("Verification result cannot overwrite a terminal ledger transition.")
            session.add(HermesVerificationRecord(verification_record_id=verification.verificationRecordId, outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId, schema_version=verification.schemaVersion, developer_identity=verification.developerIdentity, developer_home=verification.developerHome, developer_workspace=verification.developerWorkspace, developer_capability_binding_id=developer_capability.capability_binding_id, result=verification.result, target=verification.target, source_fingerprint=verification.sourceFingerprint, evidence_refs_json=verification.evidenceRefs, idempotency_key=verification.idempotencyKey, expected_outcome_revision=verification.expectedOutcomeRevision, expected_lane_revision=verification.expectedLaneRevision, revision_binding_known=True, observed_at=verification.observedAt, created_at=verification.createdAt, metadata_only=True, raw_payload_retained=False))
            if enter_review:
                event_id = f"event:verification:{sha256(verification.verificationRecordId.encode('utf-8')).hexdigest()}"
                session.add(HermesLedgerEvent(event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id, schema_version="hermes_lifecycle_event.v1", event_name="hermes.verification.recorded", outcome_status="review", lane_status="review", lane_type=lane.lane_type, result="retryable", reason_code="verification_passed", evidence_refs_json=verification.evidenceRefs, next_action="Await independent Reviewer disposition.", correlation_id=verification.verificationRecordId, causation_id=verification.verificationRecordId, observed_at=verification.observedAt, emitted_at=_emitted_at(verification.observedAt), heartbeat_at=lane.heartbeat_at, stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at, retry_budget=lane.retry_budget, rework_budget=lane.rework_budget, evidence_fingerprint=lane.evidence_fingerprint, idempotency_key=f"event:verification:{sha256(verification.idempotencyKey.encode('utf-8')).hexdigest()}", request_digest_sha256=_handoff_digest(request), metadata_only=True, raw_payload_retained=False, authoritative=False))
                await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {"status": "review", "result": "retryable", "reason_code": "verification_passed", "evidence_refs_json": verification.evidenceRefs, "next_action": "Await independent Reviewer disposition.", "observed_at": verification.observedAt, "updated_at": verification.observedAt, "current_event_id": event_id})
                await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {"status": "review", "result": "retryable", "reason_code": "verification_passed", "evidence_refs_json": verification.evidenceRefs, "next_action": "Await independent Reviewer disposition.", "observed_at": verification.observedAt, "updated_at": verification.observedAt, "current_event_id": event_id})
            try:
                await _fence_role_capability_before_commit(session, developer_capability, decision_at=verification.observedAt)
                if commit: await session.commit()
                else: await session.flush()
            except IntegrityError as exc:
                await session.rollback()
                replay = await _replay_verification(
                    session,
                    verification,
                    developer_capability_binding_id=developer_capability.capability_binding_id,
                )
                if replay is not None: return replay
                raise ValueError("Verification result persistence conflict.") from exc
            return _projection(outcome, lane, await _latest_evidence(session, lane))
        result, status, reason, action = ("rework", "rework", "verification_failed", "Return to the original Developer lane for bounded rework.") if verification.result == "failed" else ("blockedTechnical", "blocked", "verification_inconclusive", "Resolve the bounded verification technical block.")
        if not can_replace_current_result(previous=outcome.result, next_result=result) or not can_replace_current_result(previous=lane.result, next_result=result):
            raise ValueError("Verification result cannot overwrite a terminal ledger transition.")
        if result == "rework" and lane.rework_budget <= 0:
            raise ValueError("Verification result rework budget is exhausted.")
        event_id = f"event:verification:{sha256(verification.verificationRecordId.encode('utf-8')).hexdigest()}"
        session.add(HermesVerificationRecord(verification_record_id=verification.verificationRecordId, outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId, schema_version=verification.schemaVersion, developer_identity=verification.developerIdentity, developer_home=verification.developerHome, developer_workspace=verification.developerWorkspace, developer_capability_binding_id=developer_capability.capability_binding_id, result=verification.result, target=verification.target, source_fingerprint=verification.sourceFingerprint, evidence_refs_json=verification.evidenceRefs, idempotency_key=verification.idempotencyKey, expected_outcome_revision=verification.expectedOutcomeRevision, expected_lane_revision=verification.expectedLaneRevision, revision_binding_known=True, observed_at=verification.observedAt, created_at=verification.createdAt, metadata_only=True, raw_payload_retained=False))
        session.add(HermesLedgerEvent(event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id, schema_version="hermes_lifecycle_event.v1", event_name="hermes.verification.recorded", outcome_status=status, lane_status=status, lane_type=lane.lane_type, result=result, reason_code=reason, evidence_refs_json=verification.evidenceRefs, next_action=action, correlation_id=verification.verificationRecordId, causation_id=verification.verificationRecordId, observed_at=verification.observedAt, emitted_at=_emitted_at(verification.observedAt), heartbeat_at=lane.heartbeat_at, stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at, retry_budget=lane.retry_budget, rework_budget=lane.rework_budget - (1 if result == "rework" else 0), evidence_fingerprint=lane.evidence_fingerprint, idempotency_key=f"event:verification:{sha256(verification.idempotencyKey.encode('utf-8')).hexdigest()}", request_digest_sha256=_handoff_digest(request), metadata_only=True, raw_payload_retained=False, authoritative=False))
        await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {"status": status, "result": result, "reason_code": reason, "evidence_refs_json": verification.evidenceRefs, "next_action": action, "observed_at": verification.observedAt, "updated_at": verification.observedAt, "current_event_id": event_id})
        await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {"status": status, "result": result, "reason_code": reason, "evidence_refs_json": verification.evidenceRefs, "next_action": action, "observed_at": verification.observedAt, "updated_at": verification.observedAt, "current_event_id": event_id, "rework_budget": lane.rework_budget - (1 if result == "rework" else 0)})
        try:
            await _fence_role_capability_before_commit(session, developer_capability, decision_at=verification.observedAt)
            if commit: await session.commit()
            else: await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            replay = await _replay_verification(
                session,
                verification,
                developer_capability_binding_id=developer_capability.capability_binding_id,
            )
            if replay is not None:
                return replay
            raise ValueError("Verification result persistence conflict.") from exc
        await session.refresh(outcome); await session.refresh(lane)
        return _projection(outcome, lane, await _latest_evidence(session, lane))
    assert disposition is not None
    assert request.reviewerCapabilityBindingId is not None and request.reviewerCapabilityProof is not None
    reviewer_capability = await _require_role_capability(session, binding_id=request.reviewerCapabilityBindingId, secret=request.reviewerCapabilityProof, role="reviewer", outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId, identity=disposition.reviewerIdentity, home=disposition.reviewerHome, workspace=disposition.reviewerWorkspace, lock=True, decision_at=disposition.observedAt)
    digest = _handoff_digest(request)
    replay_digests = _handoff_replay_digests(request) | _handoff_replay_digests(raw_request)
    replay = await _replay_disposition(session, disposition, replay_digests, authenticated_recorder_id=authenticated_recorder_id)
    if replay is not None:
        return replay
    outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == verification.outcomeId).with_for_update())
    lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == verification.laneRunId).with_for_update())
    reviewer_capability = await _require_role_capability(session, binding_id=request.reviewerCapabilityBindingId, secret=request.reviewerCapabilityProof, role="reviewer", outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId, identity=disposition.reviewerIdentity, home=disposition.reviewerHome, workspace=disposition.reviewerWorkspace, decision_at=disposition.observedAt)
    await _fence_unrevoked_role_capability(session, reviewer_capability, decision_at=disposition.observedAt)
    if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id:
        raise ValueError("Review handoff requires an existing bound outcome and Developer lane.")
    # A concurrent exact handoff can commit while this request waits for the
    # projection locks. Recheck under those locks before examining state.
    replay = await _replay_disposition(session, disposition, replay_digests, authenticated_recorder_id=authenticated_recorder_id)
    if replay is not None:
        return replay
    _require_live_handoff_lane(lane, decision_at=disposition.observedAt)
    if outcome.current_event_id != lane.current_event_id:
        raise ValueError("Review handoff lane is no longer current for its outcome.")
    if outcome.status != "review" or lane.status != "review":
        raise ValueError("Review handoff requires the current outcome and lane in review state.")
    if request.unavailableReviewerException is not None and request.unavailableReviewerException.reviewBy <= _decision_now(disposition.observedAt):
        raise ValueError("Unavailable-reviewer exception expired before persistence.")
    record = await session.scalar(select(HermesVerificationRecord).where(HermesVerificationRecord.idempotency_key == verification.idempotencyKey).with_for_update())
    if record is None:
        raise ValueError("Reviewer disposition requires a previously recorded Developer verification.")
    if record.verification_record_id != verification.verificationRecordId or not _same_verification(record, verification):
        raise ValueError("Verification idempotency key conflicts with persisted metadata.")
    if record.developer_capability_binding_id is None or record.developer_capability_binding_id == reviewer_capability.capability_binding_id:
        raise ValueError("Independent review requires a distinct Coordinator-provisioned Reviewer capability.")
    developer_capability = await session.get(HermesRoleCapabilityBinding, record.developer_capability_binding_id)
    if developer_capability is None:
        raise ValueError("Independent review requires a current canonical Developer capability binding.")
    developer_home, developer_workspace = _canonical_role_profile(
        developer_capability.home,
        developer_capability.workspace,
    )
    if any(
        _profiles_overlap(developer_path, reviewer_path)
        for developer_path in (developer_home, developer_workspace)
        for reviewer_path in (reviewer_capability.home, reviewer_capability.workspace)
    ):
        raise ValueError("Independent review requires disjoint canonical Developer and Reviewer profiles.")
    verification_event_id = f"event:verification:{sha256(verification.verificationRecordId.encode('utf-8')).hexdigest()}"
    typed_review_entry = (
        outcome.current_event_id == lane.current_event_id == verification_event_id
        and (outcome.revision, lane.revision)
        == (disposition.expectedOutcomeRevision + 1, disposition.expectedLaneRevision + 1)
    )
    if (outcome.revision, lane.revision) != (disposition.expectedOutcomeRevision, disposition.expectedLaneRevision) and not typed_review_entry:
        raise ValueError("Review handoff revision is stale.")
    if disposition.observedAt < outcome.observed_at or disposition.observedAt < lane.observed_at or disposition.observedAt < outcome.updated_at or disposition.observedAt < lane.updated_at:
        raise ValueError("Review handoff evidence predates the current ledger projection.")
    if disposition.observedAt > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("Review disposition cannot be materially future-dated.")
    if lane.evidence_fingerprint != verification.sourceFingerprint:
        raise ValueError("Verification source fingerprint is stale for the Developer lane.")
    current_event = await session.get(HermesLedgerEvent, outcome.current_event_id)
    carry_forward_verification_evidence = (
        (typed_review_entry or (current_event is not None and current_event.event_name == "hermes.lane.recovered"))
        and disposition.evidenceRefs == record.evidence_refs_json == lane.evidence_refs_json
    )
    await _require_bound_evidence(
        session,
        evidence_refs=disposition.evidenceRefs,
        outcome=outcome,
        lane=lane,
        decision_at=disposition.observedAt,
        require_current_projection=not carry_forward_verification_evidence,
    )
    result, status = {"approve": ("completed", "completed"), "rework": ("rework", "rework"), "technical_block": ("blockedTechnical", "blocked")}[disposition.disposition]
    if not can_replace_current_result(previous=outcome.result, next_result=result) or not can_replace_current_result(previous=lane.result, next_result=result):
        raise ValueError("Review disposition cannot overwrite a terminal ledger transition.")
    if disposition.disposition == "rework" and lane.rework_budget <= 0:
        raise ValueError("Review handoff rework budget is exhausted.")
    event_suffix = sha256(disposition.reviewDispositionId.encode("utf-8")).hexdigest()
    event_id = f"event:review:{event_suffix}"
    session.add(HermesLedgerEvent(
        event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id,
        schema_version="hermes_lifecycle_event.v1", event_name="hermes.review.disposition.recorded",
        outcome_status=status, lane_status=status, lane_type=lane.lane_type, result=result,
        reason_code=disposition.reasonCode, evidence_refs_json=disposition.evidenceRefs,
        next_action=disposition.nextAction, correlation_id=disposition.reviewDispositionId,
        causation_id=verification.verificationRecordId, observed_at=disposition.observedAt,
        emitted_at=_emitted_at(disposition.observedAt), heartbeat_at=lane.heartbeat_at,
        stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at,
        retry_budget=lane.retry_budget,
        rework_budget=lane.rework_budget - (1 if disposition.disposition == "rework" else 0),
        evidence_fingerprint=lane.evidence_fingerprint, idempotency_key=f"event:review:{sha256(disposition.idempotencyKey.encode('utf-8')).hexdigest()}",
        request_digest_sha256=digest, metadata_only=True, raw_payload_retained=False, authoritative=False,
    ))
    await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {"status": status, "result": result, "reason_code": disposition.reasonCode, "evidence_refs_json": disposition.evidenceRefs, "next_action": disposition.nextAction, "observed_at": disposition.observedAt, "updated_at": disposition.observedAt, "current_event_id": event_id})
    await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {"status": status, "result": result, "reason_code": disposition.reasonCode, "evidence_refs_json": disposition.evidenceRefs, "next_action": disposition.nextAction, "observed_at": disposition.observedAt, "updated_at": disposition.observedAt, "current_event_id": event_id, "rework_budget": lane.rework_budget - (1 if disposition.disposition == "rework" else 0)})
    session.add(HermesReviewDisposition(
        review_disposition_id=disposition.reviewDispositionId, verification_record_id=verification.verificationRecordId, outcome_id=disposition.outcomeId, developer_lane_run_id=disposition.developerLaneRunId,
        schema_version=disposition.schemaVersion, expected_outcome_revision=disposition.expectedOutcomeRevision, expected_lane_revision=disposition.expectedLaneRevision,
        disposition=disposition.disposition, reviewer_identity=disposition.reviewerIdentity, reviewer_home=disposition.reviewerHome, reviewer_workspace=disposition.reviewerWorkspace, reviewer_capability_binding_id=reviewer_capability.capability_binding_id,
        reason_code=disposition.reasonCode, next_action=disposition.nextAction, evidence_refs_json=disposition.evidenceRefs, idempotency_key=disposition.idempotencyKey,
        observed_at=disposition.observedAt, created_at=disposition.createdAt, metadata_only=True, raw_payload_retained=False,
        request_digest_sha256=digest,
        exception_requirement_json=request.unavailableReviewerException.model_dump(mode="json", by_alias=True) if request.unavailableReviewerException else None,
    ))
    try:
        await _fence_role_capability_before_commit(session, reviewer_capability, decision_at=disposition.observedAt)
        _require_live_handoff_lane(lane, decision_at=disposition.observedAt)
        if request.unavailableReviewerException is not None and request.unavailableReviewerException.reviewBy <= _decision_now(disposition.observedAt):
            await session.rollback()
            raise ValueError("Unavailable-reviewer exception expired before persistence.")
        if commit: await session.commit()
        else: await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        replay = await _replay_disposition(session, disposition, replay_digests, authenticated_recorder_id=authenticated_recorder_id)
        if replay is not None:
            return replay
        raise ValueError("Review handoff persistence conflict.") from exc
    await session.refresh(outcome); await session.refresh(lane)
    return _projection(outcome, lane, await _latest_evidence(session, lane))
