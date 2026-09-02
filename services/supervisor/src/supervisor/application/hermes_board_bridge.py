"""Fail-closed authenticated intake for Hermes board lifecycle observations.

The bridge consumes a signed metadata envelope and can only derive a ledger
projection for a pre-bound Supervisor outcome/lane.  It has no board client,
GitHub capability, or authority-release behavior.
"""
from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from hashlib import sha256
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import HermesBoardLifecycleEventInputV1, HermesLedgerIngestRequest, HermesOutcomeProjectionV1
from supervisor.application.hermes_outcomes import ingest_hermes_ledger, read_hermes_outcome
from supervisor.infrastructure.db.models import HermesBoardBinding, HermesBoardEventReceipt, HermesLaneRun, HermesOutcome


MAX_REQUEST_BYTES = 4096
SKEW_SECONDS = 30
MAX_TTL_SECONDS = 300
REGISTRY_FIELDS = frozenset({"issuerId", "keyId", "publicKeyB64", "active"})

# The signed board event never supplies a free-form state transition.  Existing
# lifecycle names retain their established result vocabulary and map to one
# derived Supervisor projection shape.
_MAPPINGS = {
    "hermes.outcome.created": ("active", "running", frozenset({"retryable"})),
    "hermes.lane.recovered": ("active", "running", frozenset({"retryable"})),
    "hermes.delivery.denied": ("blocked", "blocked", frozenset({"deniedPolicy", "blockedTechnical"})),
    "hermes.external-impact.requested": ("blocked", "blocked", frozenset({"deniedExternalImpact"})),
}


class BoardBridgeRejected(ValueError):
    """A closed rejection reason suitable for the narrow transport boundary."""


def _utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


def _iso(value: datetime) -> str:
    return _utc(value).isoformat().replace("+00:00", "Z")


def _reject_duplicate(pairs: list[tuple[str, object]]) -> dict[str, object]:
    decoded: dict[str, object] = {}
    for key, value in pairs:
        if key in decoded:
            raise BoardBridgeRejected("duplicate_board_event_field")
        decoded[key] = value
    return decoded


def canonical_board_event_bytes(event: dict[str, object]) -> bytes:
    """Return deterministic bytes for the exact metadata-only signed event."""

    try:
        parsed = HermesBoardLifecycleEventInputV1.model_validate(event)
    except Exception as exc:
        raise BoardBridgeRejected("invalid_board_event") from exc
    return json.dumps(
        parsed.model_dump(mode="json", exclude={"signatureB64"}), sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    ).encode("utf-8")


def parse_board_event_submission(raw: bytes) -> tuple[HermesBoardLifecycleEventInputV1, str, bytes]:
    """Reject malformed/duplicate/oversized raw JSON before verification."""

    if not raw or len(raw) > MAX_REQUEST_BYTES:
        raise BoardBridgeRejected("invalid_board_event_request")
    try:
        body = json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate)
    except (UnicodeDecodeError, json.JSONDecodeError, BoardBridgeRejected) as exc:
        raise BoardBridgeRejected("invalid_board_event_request") from exc
    try:
        event = HermesBoardLifecycleEventInputV1.model_validate(body)
    except Exception as exc:
        raise BoardBridgeRejected("invalid_board_event") from exc
    canonical = canonical_board_event_bytes(event.model_dump(mode="json"))
    return event, event.signatureB64, canonical


def _trusted_key(registry_json: str, issuer_id: str, key_id: str) -> Ed25519PublicKey:
    try:
        entries = json.loads(registry_json, object_pairs_hook=_reject_duplicate)
    except (json.JSONDecodeError, BoardBridgeRejected) as exc:
        raise BoardBridgeRejected("board_trust_registry_unavailable") from exc
    if not isinstance(entries, list) or len(entries) > 64:
        raise BoardBridgeRejected("board_trust_registry_unavailable")
    selected: dict[str, object] | None = None
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != REGISTRY_FIELDS:
            raise BoardBridgeRejected("board_trust_registry_unavailable")
        if not all(isinstance(entry[field], str) and entry[field] and entry[field].isascii() and entry[field].isprintable() for field in ("issuerId", "keyId", "publicKeyB64")) or not isinstance(entry["active"], bool):
            raise BoardBridgeRejected("board_trust_registry_unavailable")
        if entry["issuerId"] == issuer_id and entry["keyId"] == key_id:
            if selected is not None or not entry["active"]:
                raise BoardBridgeRejected("unknown_or_revoked_board_key")
            selected = entry
    if selected is None:
        raise BoardBridgeRejected("unknown_or_revoked_board_key")
    try:
        return Ed25519PublicKey.from_public_bytes(base64.b64decode(selected["publicKeyB64"], validate=True))
    except (ValueError, TypeError) as exc:
        raise BoardBridgeRejected("board_trust_registry_unavailable") from exc


def _verify(event: HermesBoardLifecycleEventInputV1, signature_b64: str, canonical: bytes, registry_json: str, now: datetime) -> None:
    if event.emittedAt > now + timedelta(seconds=SKEW_SECONDS) or event.expiresAt <= now:
        raise BoardBridgeRejected("expired_or_future_board_event")
    if event.expiresAt - event.emittedAt > timedelta(seconds=MAX_TTL_SECONDS):
        raise BoardBridgeRejected("expired_or_future_board_event")
    try:
        signature = base64.b64decode(signature_b64, validate=True)
        _trusted_key(registry_json, event.issuerId, event.keyId).verify(signature, canonical)
    except (InvalidSignature, ValueError) as exc:
        raise BoardBridgeRejected("invalid_board_signature") from exc


def _binding_id(issuer_id: str, board_id: str, card_id: str) -> str:
    """Bound the stored binding key without retaining a concatenated card tuple."""

    encoded = json.dumps([issuer_id, board_id, card_id], separators=(",", ":")).encode("utf-8")
    return f"board-binding:{sha256(encoded).hexdigest()}"


def _derived_id(prefix: str, *parts: str) -> str:
    """Produce a fixed-size opaque derived reference from validated metadata."""

    encoded = json.dumps(parts, separators=(",", ":")).encode("utf-8")
    digest = sha256(encoded).hexdigest()
    segmented = "-".join(digest[index:index + 8] for index in range(0, len(digest), 8))
    return f"{prefix}:{segmented}"


async def register_board_binding(
    session: AsyncSession,
    *,
    issuer_id: str,
    board_id: str,
    card_id: str,
    outcome_id: str,
    lane_run_id: str,
) -> HermesBoardBinding:
    """Internal-only provisioning seam; never exposed as a Hermes route."""

    existing = await session.scalar(select(HermesBoardBinding).where(
        HermesBoardBinding.issuer_id == issuer_id,
        HermesBoardBinding.board_id == board_id,
        HermesBoardBinding.card_id == card_id,
    ))
    if existing is not None:
        if (existing.outcome_id, existing.lane_run_id) != (outcome_id, lane_run_id):
            raise BoardBridgeRejected("board_binding_conflict")
        return existing
    outcome = await session.get(HermesOutcome, outcome_id)
    lane = await session.get(HermesLaneRun, lane_run_id)
    if outcome is None or lane is None or lane.outcome_id != outcome_id:
        raise BoardBridgeRejected("board_binding_target_not_found")
    binding = HermesBoardBinding(
        binding_id=_binding_id(issuer_id, board_id, card_id), issuer_id=issuer_id,
        board_id=board_id, card_id=card_id, outcome_id=outcome_id, lane_run_id=lane_run_id,
        metadata_only=True, raw_payload_retained=False,
    )
    session.add(binding)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise BoardBridgeRejected("board_binding_conflict") from exc
    return binding


def _mapped_states(event: HermesBoardLifecycleEventInputV1) -> tuple[str, str]:
    mapping = _MAPPINGS.get(event.eventName)
    if mapping is None or event.result not in mapping[2]:
        raise BoardBridgeRejected("unsupported_board_event")
    return mapping[0], mapping[1]


def _derived_ledger_request(event: HermesBoardLifecycleEventInputV1, outcome: HermesOutcome, lane: HermesLaneRun) -> HermesLedgerIngestRequest:
    outcome_status, lane_status = _mapped_states(event)
    evidence_id = _derived_id("evidence:board", event.eventId)
    source_ref = _derived_id("hermes-board", event.issuerId, event.boardId, event.cardId)
    created = _iso(outcome.created_at)
    lane_created = _iso(lane.created_at)
    emitted = _iso(event.emittedAt)
    return HermesLedgerIngestRequest.model_validate({
        "outcome": {
            "outcomeId": outcome.outcome_id, "schemaVersion": outcome.schema_version,
            "title": outcome.title, "summary": outcome.summary, "status": outcome_status,
            "result": event.result, "reasonCode": event.reasonCode, "evidenceRefs": event.evidenceRefs,
            "nextAction": event.nextAction, "observedAt": _iso(event.observedAt),
            "idempotencyKey": outcome.idempotency_key, "createdAt": created, "updatedAt": emitted,
            "metadataOnly": True, "rawPayloadRetained": False,
        },
        "laneRun": {
            "laneRunId": lane.lane_run_id, "outcomeId": lane.outcome_id, "schemaVersion": lane.schema_version,
            "laneType": lane.lane_type, "status": lane_status, "result": event.result,
            "reasonCode": event.reasonCode, "evidenceRefs": event.evidenceRefs, "nextAction": event.nextAction,
            "heartbeatAt": _iso(lane.heartbeat_at), "staleDeadlineAt": _iso(lane.stale_deadline_at),
            "timeoutAt": _iso(lane.timeout_at), "retryBudget": lane.retry_budget,
            "reworkBudget": lane.rework_budget, "evidenceFingerprint": lane.evidence_fingerprint,
            "observedAt": _iso(event.observedAt), "idempotencyKey": lane.idempotency_key,
            "createdAt": lane_created, "updatedAt": emitted, "metadataOnly": True,
            "rawPayloadRetained": False,
        },
        "deliveryEvidence": {
            "deliveryEvidenceId": evidence_id, "outcomeId": outcome.outcome_id, "laneRunId": lane.lane_run_id,
            "schemaVersion": "delivery_evidence.v1", "evidenceType": "board_lifecycle",
            "summary": "Authenticated Hermes board lifecycle observation.", "sourceRef": source_ref,
            "observedAt": _iso(event.observedAt), "evidenceRefs": event.evidenceRefs,
            "idempotencyKey": evidence_id, "createdAt": _iso(event.observedAt),
            "metadataOnly": True, "rawPayloadRetained": False,
        },
        "event": {
            "eventId": event.eventId, "outcomeId": outcome.outcome_id, "laneRunId": lane.lane_run_id,
            "schemaVersion": "hermes_lifecycle_event.v1", "eventName": event.eventName,
            "result": event.result, "reasonCode": event.reasonCode, "evidenceRefs": event.evidenceRefs,
            "nextAction": event.nextAction, "correlationId": event.correlationId, "causationId": event.causationId,
            "observedAt": _iso(event.observedAt), "idempotencyKey": event.idempotencyKey,
            "emittedAt": _iso(event.emittedAt), "metadataOnly": True, "rawPayloadRetained": False,
            "authoritative": False,
        },
    })


async def _exact_replay_projection(
    session: AsyncSession, event: HermesBoardLifecycleEventInputV1, digest: str,
) -> HermesOutcomeProjectionV1 | None:
    existing = await session.scalar(select(HermesBoardEventReceipt).where(
        HermesBoardEventReceipt.idempotency_key == event.idempotencyKey,
    ))
    if existing is None:
        existing = await session.get(HermesBoardEventReceipt, event.eventId)
    if existing is None:
        return None
    if existing.canonical_digest_sha256 != digest:
        raise BoardBridgeRejected("board_event_replay_conflict")
    projection = await read_hermes_outcome(session, existing.outcome_id)
    if projection is None:
        raise BoardBridgeRejected("board_projection_unavailable")
    return projection


async def ingest_board_lifecycle_event(
    session: AsyncSession, raw: bytes, registry_json: str, *, now: datetime | None = None,
) -> HermesOutcomeProjectionV1:
    """Verify a board event and atomically publish its derived ledger projection."""

    event, signature, canonical = parse_board_event_submission(raw)
    now = _utc(now or datetime.now(UTC))
    _verify(event, signature, canonical, registry_json, now)
    digest = sha256(canonical).hexdigest()
    projection = await _exact_replay_projection(session, event, digest)
    if projection is not None:
        return projection

    binding = await session.scalar(select(HermesBoardBinding).where(
        HermesBoardBinding.issuer_id == event.issuerId,
        HermesBoardBinding.board_id == event.boardId,
        HermesBoardBinding.card_id == event.cardId,
    ).with_for_update())
    if binding is None or (binding.outcome_id, binding.lane_run_id) != (event.outcomeId, event.laneRunId):
        raise BoardBridgeRejected("board_binding_mismatch")
    projection = await _exact_replay_projection(session, event, digest)
    if projection is not None:
        return projection
    latest = await session.scalar(select(HermesBoardEventReceipt).where(
        HermesBoardEventReceipt.binding_id == binding.binding_id,
    ).order_by(HermesBoardEventReceipt.observed_at.desc()).limit(1))
    if latest is not None and event.observedAt <= latest.observed_at:
        raise BoardBridgeRejected("stale_board_event")
    outcome = await session.get(HermesOutcome, event.outcomeId, with_for_update=True)
    lane = await session.get(HermesLaneRun, event.laneRunId, with_for_update=True)
    if outcome is None or lane is None or lane.outcome_id != outcome.outcome_id:
        raise BoardBridgeRejected("board_binding_target_not_found")
    if event.observedAt <= outcome.observed_at or event.observedAt <= lane.observed_at:
        raise BoardBridgeRejected("stale_board_event")
    if event.emittedAt <= max(outcome.updated_at, lane.updated_at):
        raise BoardBridgeRejected("stale_board_event")
    request = _derived_ledger_request(event, outcome, lane)
    try:
        projection = await ingest_hermes_ledger(session, request, commit=False)
        session.add(HermesBoardEventReceipt(
            event_id=event.eventId, binding_id=binding.binding_id, issuer_id=event.issuerId,
            key_id=event.keyId, outcome_id=event.outcomeId, lane_run_id=event.laneRunId,
            event_name=event.eventName, result=event.result, observed_at=event.observedAt,
            emitted_at=event.emittedAt, expires_at=event.expiresAt,
            idempotency_key=event.idempotencyKey, canonical_digest_sha256=digest,
            metadata_only=True, raw_payload_retained=False,
        ))
        await session.commit()
        return projection
    except BoardBridgeRejected:
        await session.rollback()
        raise
    except IntegrityError as exc:
        await session.rollback()
        replay = await _exact_replay_projection(session, event, digest)
        if replay is not None:
            return replay
        raise BoardBridgeRejected("board_projection_persistence_conflict") from exc
    except Exception as exc:
        await session.rollback()
        raise BoardBridgeRejected("board_projection_persistence_conflict") from exc
