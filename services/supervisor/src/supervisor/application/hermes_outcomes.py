"""Transactional, metadata-only Hermes outcome ledger application service."""
from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import json

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import HermesLaneRunProjectionV1, HermesLedgerIngestRequest, HermesOutcomeProjectionV1
from supervisor.domain.hermes_control_plane import can_replace_current_result
from supervisor.infrastructure.db.models import (
    HermesDeliveryEvidence,
    HermesLaneRun,
    HermesLedgerEvent,
    HermesOutcome,
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


async def ingest_hermes_ledger(session: AsyncSession, payload: HermesLedgerIngestRequest) -> HermesOutcomeProjectionV1:
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

    # Locks protect supported production databases; revision predicates retain
    # the same fail-closed behavior for SQLite and stale ORM snapshots.
    outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == request.outcome.outcomeId).with_for_update())
    lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == request.laneRun.laneRunId).with_for_update())
    evidence = await session.scalar(select(HermesDeliveryEvidence).where(HermesDeliveryEvidence.delivery_evidence_id == request.deliveryEvidence.deliveryEvidenceId).with_for_update())
    if evidence is not None and not _same_evidence(evidence, request.deliveryEvidence):
        raise ValueError("Hermes delivery evidence conflicts with persisted metadata.")
    if outcome is not None and (outcome.title != request.outcome.title or outcome.summary != request.outcome.summary or outcome.created_at != request.outcome.createdAt or outcome.idempotency_key != request.outcome.idempotencyKey or request.outcome.observedAt < outcome.observed_at or request.outcome.updatedAt <= outcome.updated_at or not can_replace_current_result(previous=outcome.result, next_result=request.outcome.result)):
        raise ValueError("Hermes outcome transition conflicts with immutable or terminal metadata.")
    if lane is not None and (lane.outcome_id != request.outcome.outcomeId or lane.created_at != request.laneRun.createdAt or lane.idempotency_key != request.laneRun.idempotencyKey or request.laneRun.observedAt < lane.observed_at or request.laneRun.updatedAt <= lane.updated_at or not can_replace_current_result(previous=lane.result, next_result=request.laneRun.result) or request.laneRun.retryBudget > lane.retry_budget):
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
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
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
        "stage": lane.lane_type, "result": lane.result,
        "retryBudget": lane.retry_budget, "reworkBudget": lane.rework_budget,
        "freshness": "stale" if lane.stale_deadline_at <= datetime.now(UTC) else "fresh",
        "nextAction": lane.next_action, "metadataOnly": True,
        "rawPayloadRetained": False,
    })
