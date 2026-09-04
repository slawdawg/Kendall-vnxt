"""Transactional, metadata-only Hermes outcome ledger application service."""
from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import hmac
import json
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import HermesLaneRunProjectionV1, HermesLedgerIngestRequest, HermesOutcomeProjectionV1, HermesReviewHandoffRequest, HermesRoleCapabilityProvisionRequestV1, HermesRoleCapabilityRevocationRequestV1
from supervisor.domain.hermes_control_plane import can_replace_current_result
from supervisor.infrastructure.db.models import (
    HermesDeliveryEvidence,
    HermesLaneRun,
    HermesLedgerEvent,
    HermesOutcome,
    HermesReviewDisposition,
    HermesRoleCapabilityBinding,
    HermesVerificationRecord,
)


async def provision_hermes_role_capability(session: AsyncSession, payload: HermesRoleCapabilityProvisionRequestV1) -> HermesRoleCapabilityBinding:
    """Persist only a digest after the referenced current outcome/lane are proven."""
    payload = payload.model_copy(update={"home": _canonical_profile_path(payload.home), "workspace": _canonical_profile_path(payload.workspace)})
    if payload.home == payload.workspace:
        raise ValueError("Role capability home and workspace must remain distinct after canonicalization.")
    outcome = await session.get(HermesOutcome, payload.outcomeId)
    lane = await session.get(HermesLaneRun, payload.laneRunId)
    if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id or outcome.current_event_id != lane.current_event_id:
        raise ValueError("Role capability must bind the current outcome and lane.")
    existing = await session.get(HermesRoleCapabilityBinding, payload.capabilityBindingId)
    if existing is not None:
        digest = sha256(payload.capabilitySecret.encode("utf-8")).hexdigest()
        if (existing.outcome_id, existing.lane_run_id, existing.role, existing.identity, existing.home, existing.workspace, existing.capability_digest_sha256, existing.created_at, existing.expires_at) != (payload.outcomeId, payload.laneRunId, payload.role, payload.identity, payload.home, payload.workspace, digest, payload.createdAt, payload.expiresAt):
            raise ValueError("Role capability binding conflicts with persisted metadata.")
        return existing
    binding = HermesRoleCapabilityBinding(capability_binding_id=payload.capabilityBindingId, outcome_id=payload.outcomeId, lane_run_id=payload.laneRunId, role=payload.role, identity=payload.identity, home=payload.home, workspace=payload.workspace, capability_digest_sha256=sha256(payload.capabilitySecret.encode("utf-8")).hexdigest(), created_at=payload.createdAt, expires_at=payload.expiresAt, metadata_only=True, raw_payload_retained=False)
    session.add(binding)
    try:
        await session.commit()
        await session.refresh(binding)
    except IntegrityError as exc:
        await session.rollback()
        replay = await session.get(HermesRoleCapabilityBinding, payload.capabilityBindingId)
        if replay is not None:
            return await provision_hermes_role_capability(session, payload)
        raise ValueError("Role capability binding persistence conflict.") from exc
    return binding


async def revoke_hermes_role_capability(session: AsyncSession, payload: HermesRoleCapabilityRevocationRequestV1) -> HermesRoleCapabilityBinding:
    binding = await session.scalar(select(HermesRoleCapabilityBinding).where(HermesRoleCapabilityBinding.capability_binding_id == payload.capabilityBindingId).with_for_update())
    if binding is None:
        raise ValueError("Role capability binding not found.")
    if payload.revokedAt < binding.created_at:
        raise ValueError("Role capability revocation cannot precede creation.")
    if binding.revoked_at is not None and (binding.revoked_at != payload.revokedAt or binding.revoked_by != payload.revokedBy):
        raise ValueError("Role capability revocation conflicts with persisted metadata.")
    if binding.revoked_at is None:
        binding.revoked_at, binding.revoked_by = payload.revokedAt, payload.revokedBy
        await session.commit()
        await session.refresh(binding)
    return binding


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
        "stage": lane.lane_type, "result": lane.result,
        "retryBudget": lane.retry_budget, "reworkBudget": lane.rework_budget,
        "freshness": "stale" if lane.stale_deadline_at <= datetime.now(UTC) else "fresh",
        "nextAction": lane.next_action, "metadataOnly": True,
        "rawPayloadRetained": False,
    })


def _handoff_digest(request: HermesReviewHandoffRequest) -> str:
    return sha256(json.dumps(request.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _emitted_at(observed_at: datetime) -> datetime:
    return max(datetime.now(UTC), observed_at)


async def _require_bound_evidence(session: AsyncSession, *, evidence_refs: list[str], outcome: HermesOutcome, lane: HermesLaneRun) -> None:
    evidence = (await session.scalars(select(HermesDeliveryEvidence).where(
        HermesDeliveryEvidence.outcome_id == outcome.outcome_id,
        HermesDeliveryEvidence.lane_run_id == lane.lane_run_id,
    ))).all()
    selected = [item for item in evidence if item.delivery_evidence_id in evidence_refs or set(item.evidence_refs_json) & set(evidence_refs)]
    resolved = {item.delivery_evidence_id for item in selected}
    resolved.update(reference for item in selected for reference in item.evidence_refs_json)
    if not set(evidence_refs) <= resolved or any(item.observed_at < max(outcome.updated_at, lane.updated_at) for item in selected):
        raise ValueError("Review evidence must resolve to the current bound outcome and Developer lane revision.")


def _canonical_profile_path(value: str) -> str:
    path = Path(value)
    if not path.is_absolute():
        raise ValueError("Role capability profile paths must be absolute and provisioned.")
    try:
        canonical = path.resolve(strict=True)
    except OSError as exc:
        raise ValueError("Role capability profile paths must resolve to provisioned directories.") from exc
    if not canonical.is_dir():
        raise ValueError("Role capability profile paths must be directories.")
    return str(canonical)


def _profile_paths_overlap(left: str, right: str) -> bool:
    left_path, right_path = Path(left), Path(right)
    return left_path == right_path or left_path.is_relative_to(right_path) or right_path.is_relative_to(left_path)


async def _require_role_capability(session: AsyncSession, *, binding_id: str, proof: str, role: str, outcome: HermesOutcome, lane: HermesLaneRun, identity: str, home: str, workspace: str) -> HermesRoleCapabilityBinding:
    binding = await session.scalar(select(HermesRoleCapabilityBinding).where(HermesRoleCapabilityBinding.capability_binding_id == binding_id).with_for_update())
    if binding is None or (binding.role, binding.outcome_id, binding.lane_run_id) != (role, outcome.outcome_id, lane.lane_run_id):
        raise ValueError("Role capability is not bound to this outcome and Developer lane.")
    if binding.revoked_at is not None or binding.expires_at <= datetime.now(UTC):
        raise ValueError("Role capability is revoked or expired.")
    if not hmac.compare_digest(binding.capability_digest_sha256, sha256(proof.encode("utf-8")).hexdigest()):
        raise ValueError("Role capability proof is invalid.")
    if (binding.identity, binding.home, binding.workspace) != (identity, _canonical_profile_path(home), _canonical_profile_path(workspace)):
        raise ValueError("Role capability does not match the submitted profile binding.")
    return binding


async def _require_persisted_capability(session: AsyncSession, *, binding_id: str, proof: str, role: str) -> HermesRoleCapabilityBinding:
    """Revalidate the exact persisted capability before accepting an idempotent replay."""
    binding = await session.get(HermesRoleCapabilityBinding, binding_id)
    if binding is None or binding.role != role or binding.revoked_at is not None or binding.expires_at <= datetime.now(UTC):
        raise ValueError("Persisted role capability is revoked or expired.")
    if not hmac.compare_digest(binding.capability_digest_sha256, sha256(proof.encode("utf-8")).hexdigest()):
        raise ValueError("Persisted role capability proof is invalid.")
    return binding


def _same_verification(record: HermesVerificationRecord, value) -> bool:
    return (
        record.verification_record_id, record.outcome_id, record.lane_run_id, record.schema_version,
        record.result, record.target, record.source_fingerprint, record.developer_identity,
        record.developer_home, record.developer_workspace, record.evidence_refs_json,
        record.idempotency_key, record.expected_outcome_revision, record.expected_lane_revision, record.observed_at, record.created_at,
    ) == (
        value.verificationRecordId, value.outcomeId, value.laneRunId, value.schemaVersion,
        value.result, value.target, value.sourceFingerprint, value.developerIdentity,
        value.developerHome, value.developerWorkspace, value.evidenceRefs,
        value.idempotencyKey, value.expectedOutcomeRevision, value.expectedLaneRevision, value.observedAt, value.createdAt,
    )


async def _current_lane(session: AsyncSession, outcome: HermesOutcome) -> HermesLaneRun | None:
    return await session.scalar(select(HermesLaneRun).where(HermesLaneRun.current_event_id == outcome.current_event_id))


async def _replay_verification(session: AsyncSession, value) -> HermesOutcomeProjectionV1 | None:
    existing = await session.scalar(select(HermesVerificationRecord).where(HermesVerificationRecord.idempotency_key == value.idempotencyKey))
    if existing is None:
        return None
    if not _same_verification(existing, value):
        raise ValueError("Verification idempotency key conflicts with persisted metadata.")
    outcome = await session.get(HermesOutcome, existing.outcome_id)
    if outcome is None:
        raise ValueError("Persisted verification record lacks its ledger projection.")
    lane = await _current_lane(session, outcome)
    if lane is None:
        raise ValueError("Persisted verification record lacks its current ledger lane.")
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def _replay_disposition(session: AsyncSession, disposition, digest: str) -> HermesOutcomeProjectionV1 | None:
    prior = await session.scalar(select(HermesReviewDisposition).where(HermesReviewDisposition.idempotency_key == disposition.idempotencyKey))
    if prior is None:
        return None
    if prior.review_disposition_id != disposition.reviewDispositionId or prior.request_digest_sha256 != digest:
        raise ValueError("Review disposition idempotency key conflicts with persisted metadata.")
    outcome = await session.get(HermesOutcome, prior.outcome_id)
    if outcome is None:
        raise ValueError("Persisted review disposition lacks its ledger projection.")
    lane = await _current_lane(session, outcome)
    if lane is None:
        raise ValueError("Persisted review disposition lacks its current ledger lane.")
    return _projection(outcome, lane, await _latest_evidence(session, lane))


async def _persist_self_review_denial(session: AsyncSession, *, outcome: HermesOutcome, lane: HermesLaneRun, disposition, request: HermesReviewHandoffRequest) -> None:
    """Record the one valid-but-policy-denied review attempt without accepting it."""
    event_id = f"event:review-denied:{sha256(disposition.reviewDispositionId.encode('utf-8')).hexdigest()}"
    session.add(HermesLedgerEvent(
        event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id,
        schema_version="hermes_lifecycle_event.v1", event_name="hermes.delivery.denied",
        outcome_status="blocked", lane_status="blocked", lane_type=lane.lane_type,
        result="deniedPolicy", reason_code="independent_reviewer_required",
        evidence_refs_json=disposition.evidenceRefs,
        next_action="Create a fresh Developer lane with a distinct independent Reviewer binding.",
        correlation_id=disposition.reviewDispositionId, causation_id=disposition.verificationRecordId,
        observed_at=disposition.observedAt, emitted_at=_emitted_at(disposition.observedAt),
        heartbeat_at=lane.heartbeat_at, stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at,
        retry_budget=lane.retry_budget, rework_budget=lane.rework_budget,
        evidence_fingerprint=lane.evidence_fingerprint,
        idempotency_key=f"event:review-denied:{sha256(disposition.idempotencyKey.encode('utf-8')).hexdigest()}",
        request_digest_sha256=_handoff_digest(request), metadata_only=True, raw_payload_retained=False,
        authoritative=False,
    ))
    await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {"status": "blocked", "result": "deniedPolicy", "reason_code": "independent_reviewer_required", "evidence_refs_json": disposition.evidenceRefs, "next_action": "Create a fresh Developer lane with a distinct independent Reviewer binding.", "observed_at": disposition.observedAt, "updated_at": disposition.observedAt, "current_event_id": event_id})
    await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {"status": "blocked", "result": "deniedPolicy", "reason_code": "independent_reviewer_required", "evidence_refs_json": disposition.evidenceRefs, "next_action": "Create a fresh Developer lane with a distinct independent Reviewer binding.", "observed_at": disposition.observedAt, "updated_at": disposition.observedAt, "current_event_id": event_id})


async def ingest_hermes_review_handoff(session: AsyncSession, payload: HermesReviewHandoffRequest, *, operator_identity: str | None = None, commit: bool = True) -> HermesOutcomeProjectionV1:
    """Persist the verification gate and one independent disposition atomically."""
    request = HermesReviewHandoffRequest.model_validate(payload.model_dump(by_alias=True))
    verification, disposition = request.verification, request.disposition
    self_review_overlap = False
    verification.developerHome = _canonical_profile_path(verification.developerHome)
    verification.developerWorkspace = _canonical_profile_path(verification.developerWorkspace)
    if disposition is not None:
        disposition.reviewerHome = _canonical_profile_path(disposition.reviewerHome)
        disposition.reviewerWorkspace = _canonical_profile_path(disposition.reviewerWorkspace)
        self_review_overlap = verification.developerIdentity == disposition.reviewerIdentity or any(_profile_paths_overlap(developer_path, reviewer_path) for developer_path in (verification.developerHome, verification.developerWorkspace) for reviewer_path in (disposition.reviewerHome, disposition.reviewerWorkspace))
    if disposition is None:
        assert request.developerCapabilityBindingId is not None and request.developerCapabilityProof is not None
        existing = await session.scalar(select(HermesVerificationRecord).where(HermesVerificationRecord.idempotency_key == verification.idempotencyKey))
        if existing is not None:
            binding = await _require_persisted_capability(session, binding_id=existing.developer_capability_binding_id, proof=request.developerCapabilityProof, role="developer")
            if binding.capability_binding_id != request.developerCapabilityBindingId:
                raise ValueError("Verification replay must use its original Developer capability.")
        replay = await _replay_verification(session, verification)
        if replay is not None:
            return replay
        outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == verification.outcomeId).with_for_update())
        lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == verification.laneRunId).with_for_update())
        if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id or outcome.current_event_id != lane.current_event_id:
            raise ValueError("Verification requires the current bound outcome and Developer lane.")
        await _require_role_capability(session, binding_id=request.developerCapabilityBindingId, proof=request.developerCapabilityProof, role="developer", outcome=outcome, lane=lane, identity=verification.developerIdentity, home=verification.developerHome, workspace=verification.developerWorkspace)
        if (outcome.revision, lane.revision) != (verification.expectedOutcomeRevision, verification.expectedLaneRevision):
            raise ValueError("Verification result revision is stale.")
        if outcome.status != "active" or lane.status != "review" or lane.evidence_fingerprint != verification.sourceFingerprint:
            raise ValueError("Verification result is stale for the current review lane.")
        if verification.observedAt < max(outcome.updated_at, lane.updated_at):
            raise ValueError("Verification evidence predates the current ledger projection.")
        await _require_bound_evidence(session, evidence_refs=verification.evidenceRefs, outcome=outcome, lane=lane)
        session.add(HermesVerificationRecord(
            verification_record_id=verification.verificationRecordId, outcome_id=verification.outcomeId, lane_run_id=verification.laneRunId,
            schema_version=verification.schemaVersion, developer_identity=verification.developerIdentity, developer_home=verification.developerHome,
            developer_workspace=verification.developerWorkspace, developer_capability_binding_id=request.developerCapabilityBindingId,
            result=verification.result, target=verification.target, source_fingerprint=verification.sourceFingerprint,
            evidence_refs_json=verification.evidenceRefs, idempotency_key=verification.idempotencyKey,
            expected_outcome_revision=verification.expectedOutcomeRevision, expected_lane_revision=verification.expectedLaneRevision,
            observed_at=verification.observedAt, created_at=verification.createdAt, metadata_only=True, raw_payload_retained=False,
        ))
        if verification.result == "passed":
            try:
                if commit: await session.commit()
                else: await session.flush()
            except IntegrityError as exc:
                await session.rollback()
                replay = await _replay_verification(session, verification)
                if replay is not None: return replay
                raise ValueError("Verification result persistence conflict.") from exc
            return _projection(outcome, lane, await _latest_evidence(session, lane))
        result, status, reason, action = ("rework", "rework", "verification_failed", "Return to the original Developer lane for bounded rework.") if verification.result == "failed" else ("blockedTechnical", "blocked", "verification_inconclusive", "Resolve the bounded verification technical block.")
        if not can_replace_current_result(previous=outcome.result, next_result=result) or not can_replace_current_result(previous=lane.result, next_result=result):
            raise ValueError("Verification result cannot overwrite a terminal ledger transition.")
        if result == "rework" and lane.rework_budget <= 0:
            raise ValueError("Verification result rework budget is exhausted.")
        event_id = f"event:verification:{sha256(verification.verificationRecordId.encode('utf-8')).hexdigest()}"
        session.add(HermesLedgerEvent(event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id, schema_version="hermes_lifecycle_event.v1", event_name="hermes.verification.recorded", outcome_status=status, lane_status=status, lane_type=lane.lane_type, result=result, reason_code=reason, evidence_refs_json=verification.evidenceRefs, next_action=action, correlation_id=verification.verificationRecordId, causation_id=verification.verificationRecordId, observed_at=verification.observedAt, emitted_at=_emitted_at(verification.observedAt), heartbeat_at=lane.heartbeat_at, stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at, retry_budget=lane.retry_budget, rework_budget=lane.rework_budget - (1 if result == "rework" else 0), evidence_fingerprint=lane.evidence_fingerprint, idempotency_key=f"event:verification:{sha256(verification.idempotencyKey.encode('utf-8')).hexdigest()}", request_digest_sha256=_handoff_digest(request), metadata_only=True, raw_payload_retained=False, authoritative=False))
        await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {"status": status, "result": result, "reason_code": reason, "evidence_refs_json": verification.evidenceRefs, "next_action": action, "observed_at": verification.observedAt, "updated_at": verification.observedAt, "current_event_id": event_id})
        await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {"status": status, "result": result, "reason_code": reason, "evidence_refs_json": verification.evidenceRefs, "next_action": action, "observed_at": verification.observedAt, "updated_at": verification.observedAt, "current_event_id": event_id, "rework_budget": lane.rework_budget - 1 if result == "rework" else lane.rework_budget})
    else:
        if request.unavailableReviewerException is not None and (operator_identity is None or request.unavailableReviewerException.recordedBy != operator_identity):
            raise ValueError("Unavailable-reviewer exception must record the authenticated Operator identity.")
        digest = _handoff_digest(request)
        prior = await session.scalar(select(HermesReviewDisposition).where(HermesReviewDisposition.idempotency_key == disposition.idempotencyKey))
        if prior is not None and prior.reviewer_capability_binding_id is not None:
            if request.reviewerCapabilityBindingId is None or request.reviewerCapabilityProof is None:
                raise ValueError("Review replay must use its original Reviewer capability.")
            binding = await _require_persisted_capability(session, binding_id=prior.reviewer_capability_binding_id, proof=request.reviewerCapabilityProof, role="reviewer")
            if binding.capability_binding_id != request.reviewerCapabilityBindingId:
                raise ValueError("Review replay must use its original Reviewer capability.")
        replay = await _replay_disposition(session, disposition, digest)
        if replay is not None:
            return replay
        outcome = await session.scalar(select(HermesOutcome).where(HermesOutcome.outcome_id == verification.outcomeId).with_for_update())
        lane = await session.scalar(select(HermesLaneRun).where(HermesLaneRun.lane_run_id == verification.laneRunId).with_for_update())
        if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id or outcome.current_event_id != lane.current_event_id or outcome.status != "active" or lane.status != "review":
            raise ValueError("Review handoff requires the current outcome and Developer lane in review state.")
        reviewer_binding_id: str | None = None
        if request.unavailableReviewerException is None:
            assert request.reviewerCapabilityBindingId is not None and request.reviewerCapabilityProof is not None
            reviewer_binding = await _require_role_capability(session, binding_id=request.reviewerCapabilityBindingId, proof=request.reviewerCapabilityProof, role="reviewer", outcome=outcome, lane=lane, identity=disposition.reviewerIdentity, home=disposition.reviewerHome, workspace=disposition.reviewerWorkspace)
            reviewer_binding_id = reviewer_binding.capability_binding_id
        else:
            pass
        if (outcome.revision, lane.revision) != (disposition.expectedOutcomeRevision, disposition.expectedLaneRevision):
            raise ValueError("Review handoff revision is stale.")
        if request.unavailableReviewerException is not None and request.unavailableReviewerException.reviewBy <= max(datetime.now(UTC), disposition.observedAt):
            raise ValueError("Unavailable-reviewer exception expired before persistence.")
        record = await session.get(HermesVerificationRecord, verification.verificationRecordId)
        if record is None or not _same_verification(record, verification) or record.result != "passed":
            raise ValueError("Reviewer disposition requires a previously recorded passed verification.")
        if record.developer_capability_binding_id == reviewer_binding_id or lane.evidence_fingerprint != verification.sourceFingerprint:
            raise ValueError("Independent review binding or verification fingerprint is stale.")
        await _require_bound_evidence(session, evidence_refs=verification.evidenceRefs, outcome=outcome, lane=lane)
        await _require_bound_evidence(session, evidence_refs=disposition.evidenceRefs, outcome=outcome, lane=lane)
        if self_review_overlap:
            await _persist_self_review_denial(session, outcome=outcome, lane=lane, disposition=disposition, request=request)
            try:
                if commit: await session.commit()
                else: await session.flush()
            except IntegrityError as exc:
                await session.rollback()
                raise ValueError("Review denial persistence conflict.") from exc
            await session.refresh(outcome)
            await session.refresh(lane)
            return _projection(outcome, lane, await _latest_evidence(session, lane))
        result, status = {"approve": ("completed", "completed"), "rework": ("rework", "rework"), "technical_block": ("blockedTechnical", "blocked")}[disposition.disposition]
        if not can_replace_current_result(previous=outcome.result, next_result=result) or not can_replace_current_result(previous=lane.result, next_result=result):
            raise ValueError("Review disposition cannot overwrite a terminal ledger transition.")
        if disposition.disposition == "rework" and lane.rework_budget <= 0:
            raise ValueError("Review handoff rework budget is exhausted.")
        event_id = f"event:review:{sha256(disposition.reviewDispositionId.encode('utf-8')).hexdigest()}"
        session.add(HermesLedgerEvent(event_id=event_id, outcome_id=outcome.outcome_id, lane_run_id=lane.lane_run_id, schema_version="hermes_lifecycle_event.v1", event_name="hermes.review.disposition.recorded", outcome_status=status, lane_status=status, lane_type=lane.lane_type, result=result, reason_code=disposition.reasonCode, evidence_refs_json=disposition.evidenceRefs, next_action=disposition.nextAction, correlation_id=disposition.reviewDispositionId, causation_id=verification.verificationRecordId, observed_at=disposition.observedAt, emitted_at=_emitted_at(disposition.observedAt), heartbeat_at=lane.heartbeat_at, stale_deadline_at=lane.stale_deadline_at, timeout_at=lane.timeout_at, retry_budget=lane.retry_budget, rework_budget=lane.rework_budget - (1 if disposition.disposition == "rework" else 0), evidence_fingerprint=lane.evidence_fingerprint, idempotency_key=f"event:review:{sha256(disposition.idempotencyKey.encode('utf-8')).hexdigest()}", request_digest_sha256=digest, metadata_only=True, raw_payload_retained=False, authoritative=False))
        session.add(HermesReviewDisposition(review_disposition_id=disposition.reviewDispositionId, verification_record_id=verification.verificationRecordId, outcome_id=disposition.outcomeId, developer_lane_run_id=disposition.developerLaneRunId, schema_version=disposition.schemaVersion, disposition=disposition.disposition, reviewer_identity=disposition.reviewerIdentity, reviewer_home=disposition.reviewerHome, reviewer_workspace=disposition.reviewerWorkspace, reviewer_capability_binding_id=reviewer_binding_id, reason_code=disposition.reasonCode, next_action=disposition.nextAction, evidence_refs_json=disposition.evidenceRefs, idempotency_key=disposition.idempotencyKey, expected_outcome_revision=disposition.expectedOutcomeRevision, expected_lane_revision=disposition.expectedLaneRevision, request_digest_sha256=digest, exception_requirement_json=request.unavailableReviewerException.model_dump(mode="json", by_alias=True) if request.unavailableReviewerException else None, observed_at=disposition.observedAt, created_at=disposition.createdAt, metadata_only=True, raw_payload_retained=False))
        await _update_if_current(session, HermesOutcome, outcome.outcome_id, outcome.revision, {"status": status, "result": result, "reason_code": disposition.reasonCode, "evidence_refs_json": disposition.evidenceRefs, "next_action": disposition.nextAction, "observed_at": disposition.observedAt, "updated_at": disposition.observedAt, "current_event_id": event_id})
        await _update_if_current(session, HermesLaneRun, lane.lane_run_id, lane.revision, {"status": status, "result": result, "reason_code": disposition.reasonCode, "evidence_refs_json": disposition.evidenceRefs, "next_action": disposition.nextAction, "observed_at": disposition.observedAt, "updated_at": disposition.observedAt, "current_event_id": event_id, "rework_budget": lane.rework_budget - 1 if disposition.disposition == "rework" else lane.rework_budget})
    try:
        if commit: await session.commit()
        else: await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise ValueError("Review handoff persistence conflict.") from exc
    await session.refresh(outcome)
    await session.refresh(lane)
    return _projection(outcome, lane, await _latest_evidence(session, lane))
