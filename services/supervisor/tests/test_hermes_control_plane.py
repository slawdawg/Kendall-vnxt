from datetime import UTC, datetime, timedelta

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app, require_authenticated_hermes_capability_provisioner
from supervisor.api.schemas import HermesLedgerIngestRequest


def payload() -> dict[str, object]:
    now = datetime(2026, 9, 2, 12, tzinfo=UTC)
    later = now + timedelta(minutes=1)
    iso = lambda value: value.isoformat().replace("+00:00", "Z")
    refs = ["evidence:hermes-ledger-1"]
    return {
        "outcome": {"outcomeId": "outcome:1", "schemaVersion": "hermes_outcome.v1", "title": "Persist Hermes outcome", "summary": "Metadata-only ledger proof.", "status": "active", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "observedAt": iso(later), "idempotencyKey": "outcome:1", "createdAt": iso(now), "updatedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "laneRun": {"laneRunId": "lane:1", "outcomeId": "outcome:1", "schemaVersion": "hermes_lane_run.v1", "laneType": "implementation", "status": "running", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "heartbeatAt": iso(now), "staleDeadlineAt": iso(later), "timeoutAt": iso(later + timedelta(minutes=1)), "retryBudget": 1, "reworkBudget": 1, "evidenceFingerprint": "sha256:ledger-proof", "observedAt": iso(later), "idempotencyKey": "lane:1", "createdAt": iso(now), "updatedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "deliveryEvidence": {"deliveryEvidenceId": "evidence:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "delivery_evidence.v1", "evidenceType": "verification", "summary": "Focused check passed.", "sourceRef": "test:hermes-ledger", "observedAt": iso(later), "evidenceRefs": refs, "idempotencyKey": "evidence:1", "createdAt": iso(now), "metadataOnly": True, "rawPayloadRetained": False},
        "event": {"eventId": "event:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_lifecycle_event.v1", "eventName": "hermes.outcome.created", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "correlationId": "correlation:1", "causationId": "causation:1", "observedAt": iso(later), "idempotencyKey": "event:1", "emittedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False, "authoritative": False},
    }


def test_hermes_ledger_boundary_is_strict_and_metadata_only():
    value = HermesLedgerIngestRequest.model_validate(payload())
    assert value.event.authoritative is False
    unsafe = payload(); unsafe["deliveryEvidence"]["summary"] = "raw transcript content"  # type: ignore[index]
    with pytest.raises(ValidationError): HermesLedgerIngestRequest.model_validate(unsafe)
    mismatch = payload(); mismatch["event"]["laneRunId"] = "lane:2"  # type: ignore[index]
    with pytest.raises(ValidationError): HermesLedgerIngestRequest.model_validate(mismatch)
    secret = payload(); secret["deliveryEvidence"]["summary"] = "-----BEGIN PRIVATE KEY-----"  # type: ignore[index]
    with pytest.raises(ValidationError): HermesLedgerIngestRequest.model_validate(secret)
    armored = payload(); armored["deliveryEvidence"]["summary"] = "-----BEGIN PGP PRIVATE KEY BLOCK-----"  # type: ignore[index]
    with pytest.raises(ValidationError): HermesLedgerIngestRequest.model_validate(armored)
    password = payload(); password["deliveryEvidence"]["summary"] = "password: secret"  # type: ignore[index]
    with pytest.raises(ValidationError): HermesLedgerIngestRequest.model_validate(password)
    mismatched_result = payload(); mismatched_result["event"]["result"] = "completed"  # type: ignore[index]
    with pytest.raises(ValidationError): HermesLedgerIngestRequest.model_validate(mismatched_result)


def test_hermes_routes_are_local_typed_projection_boundaries():
    route = lambda path: next(item for item in app.routes if isinstance(item, APIRoute) and item.path == path)
    assert route("/hermes-control-plane/ledger").response_model.__name__ == "HermesOutcomeProjectionApiEnvelope"
    assert route("/hermes-control-plane/board-events").response_model.__name__ == "HermesOutcomeProjectionApiEnvelope"
    assert route("/hermes-control-plane/outcomes/{outcome_id}").response_model.__name__ == "HermesOutcomeProjectionApiEnvelope"
    assert route("/hermes-control-plane/lane-runs/{lane_run_id}").response_model.__name__ == "HermesLaneRunProjectionApiEnvelope"
    capability_route = route("/hermes-control-plane/role-capabilities")
    assert capability_route.status_code == 204
    assert require_authenticated_hermes_capability_provisioner in {
        dependency.call for dependency in capability_route.dependant.dependencies
    }
