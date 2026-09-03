from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app, redact_hermes_capability_validation_error, require_authenticated_hermes_capability_provisioner, require_authenticated_hermes_role_handoff
from supervisor.api.schemas import HermesLedgerIngestRequest
from supervisor.domain.hermes_control_plane import HERMES_LIFECYCLE_EVENT_NAMES


def payload() -> dict[str, object]:
    now = datetime(2026, 9, 2, 12, tzinfo=UTC)
    later = now + timedelta(minutes=1)
    live_heartbeat = datetime.now(UTC).replace(microsecond=0)
    live_stale_deadline = live_heartbeat + timedelta(days=1)
    live_timeout = live_stale_deadline + timedelta(days=1)
    iso = lambda value: value.isoformat().replace("+00:00", "Z")
    refs = ["evidence:hermes-ledger-1"]
    return {
        "outcome": {"outcomeId": "outcome:1", "schemaVersion": "hermes_outcome.v1", "title": "Persist Hermes outcome", "summary": "Metadata-only ledger proof.", "status": "active", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "observedAt": iso(later), "idempotencyKey": "outcome:1", "createdAt": iso(now), "updatedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "laneRun": {"laneRunId": "lane:1", "outcomeId": "outcome:1", "schemaVersion": "hermes_lane_run.v1", "laneType": "implementation", "status": "running", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "heartbeatAt": iso(live_heartbeat), "staleDeadlineAt": iso(live_stale_deadline), "timeoutAt": iso(live_timeout), "retryBudget": 1, "reworkBudget": 1, "evidenceFingerprint": "sha256:ledger-proof", "observedAt": iso(later), "idempotencyKey": "lane:1", "createdAt": iso(now), "updatedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "deliveryEvidence": {"deliveryEvidenceId": "evidence:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "delivery_evidence.v1", "evidenceType": "verification", "summary": "Focused check passed.", "sourceRef": "test:hermes-ledger", "observedAt": iso(later), "evidenceRefs": refs, "idempotencyKey": "evidence:1", "createdAt": iso(now), "metadataOnly": True, "rawPayloadRetained": False},
        "event": {"eventId": "event:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_lifecycle_event.v1", "eventName": "hermes.outcome.created", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "correlationId": "correlation:1", "causationId": "causation:1", "observedAt": iso(later), "idempotencyKey": "event:1", "emittedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False, "authoritative": False},
    }


def test_hermes_ledger_boundary_is_strict_and_metadata_only():
    assert {"hermes.verification.recorded", "hermes.review.unavailable_reviewer.blocked"} <= HERMES_LIFECYCLE_EVENT_NAMES
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
    recovery_route = route("/hermes-control-plane/technical-block-recoveries")
    assert recovery_route.response_model.__name__ == "HermesOutcomeProjectionApiEnvelope"
    assert require_authenticated_hermes_capability_provisioner in {
        dependency.call for dependency in recovery_route.dependant.dependencies
    }
    handoff_route = route("/hermes-control-plane/review-handoffs")
    assert require_authenticated_hermes_role_handoff in {
        dependency.call for dependency in handoff_route.dependant.dependencies
    }
    revocation_route = route("/hermes-control-plane/role-capability-revocations")
    assert revocation_route.status_code == 204
    assert require_authenticated_hermes_capability_provisioner in {
        dependency.call for dependency in revocation_route.dependant.dependencies
    }


@pytest.mark.asyncio
async def test_hermes_validation_errors_redact_capability_and_proof_input():
    secret = "capability-secret-must-never-appear"
    request = Request({"type": "http", "method": "POST", "path": "/hermes-control-plane/review-handoffs", "headers": []})
    response = await redact_hermes_capability_validation_error(
        request,
        RequestValidationError([{"type": "string_too_short", "loc": ("body", "operatorCapabilityProof"), "msg": "String should have at least 24 characters", "input": secret}]),
    )
    body = response.body.decode("utf-8")
    assert response.status_code == 422
    assert secret not in body and '"input"' not in body and '"ctx"' not in body
