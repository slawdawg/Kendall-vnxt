from datetime import UTC, datetime, timedelta

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import HermesDeliveryAuditRequestV1, HermesLedgerIngestRequest, HermesRoleCapabilityProvisionRequestV1, HermesRoleCapabilityRevocationRequestV1


def payload() -> dict[str, object]:
    now = datetime(2026, 9, 2, 12, tzinfo=UTC)
    later = now + timedelta(minutes=1)
    iso = lambda value: value.isoformat().replace("+00:00", "Z")
    refs = ["evidence:hermes-ledger-1"]
    return {
        "outcome": {"outcomeId": "outcome:1", "taskId": "task:hermes-one", "schemaVersion": "hermes_outcome.v1", "title": "Persist Hermes outcome", "summary": "Metadata-only ledger proof.", "status": "active", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "observedAt": iso(later), "idempotencyKey": "outcome:1", "createdAt": iso(now), "updatedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "laneRun": {"laneRunId": "lane:1", "outcomeId": "outcome:1", "taskId": "task:hermes-one", "schemaVersion": "hermes_lane_run.v1", "laneType": "implementation", "status": "running", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "heartbeatAt": iso(now), "staleDeadlineAt": iso(later), "timeoutAt": iso(later + timedelta(minutes=1)), "retryBudget": 1, "reworkBudget": 1, "evidenceFingerprint": "sha256:ledger-proof", "observedAt": iso(later), "idempotencyKey": "lane:1", "createdAt": iso(now), "updatedAt": iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "deliveryEvidence": {"deliveryEvidenceId": "evidence:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "taskId": "task:hermes-one", "schemaVersion": "delivery_evidence.v1", "evidenceType": "verification", "summary": "Focused check passed.", "sourceRef": "test:hermes-ledger", "observedAt": iso(later), "evidenceRefs": refs, "idempotencyKey": "evidence:1", "createdAt": iso(now), "metadataOnly": True, "rawPayloadRetained": False},
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
    assert route("/hermes-control-plane/role-capabilities").methods == {"POST"}
    assert route("/hermes-control-plane/role-capabilities/{capability_binding_id}/revoke").methods == {"POST"}
    assert route("/hermes-control-plane/review-handoffs").response_model.__name__ == "HermesOutcomeProjectionApiEnvelope"
    assert route("/hermes-control-plane/delivery-audits").response_model.__name__ == "HermesDeliveryActionResultV1"


def test_role_capability_requests_keep_only_a_transient_secret_and_bound_metadata():
    provision = HermesRoleCapabilityProvisionRequestV1.model_validate({
        "capabilityBindingId": "capability:developer-one", "taskId": "task:hermes-one", "outcomeId": "outcome:one", "laneRunId": "lane:one",
        "role": "developer", "identity": "developer:one", "home": "home:developer", "workspace": "workspace:developer",
        "capabilitySecret": "d" * 32,
        "createdAt": "2026-09-04T00:00:00Z", "expiresAt": "2099-01-01T00:00:00Z",
        "metadataOnly": True, "rawPayloadRetained": False,
    })
    assert provision.role == "developer"
    assert HermesRoleCapabilityProvisionRequestV1.model_validate({**provision.model_dump(mode="json"), "taskId": "task:delivery parity"}).taskId == "task:delivery parity"
    with pytest.raises(ValidationError):
        HermesRoleCapabilityProvisionRequestV1.model_validate({**provision.model_dump(mode="json"), "expiresAt": "2026-09-04T00:00:00Z"})
    with pytest.raises(ValidationError):
        HermesRoleCapabilityProvisionRequestV1.model_validate({**provision.model_dump(mode="json"), "createdAt": "2099-01-01T00:00:00Z", "expiresAt": "2099-01-02T00:00:00Z"})
    revoked = HermesRoleCapabilityRevocationRequestV1.model_validate({"capabilityBindingId": provision.capabilityBindingId, "revokedBy": "operator:one", "revokedAt": "2026-09-04T00:30:00Z", "metadataOnly": True, "rawPayloadRetained": False})
    assert revoked.revokedBy == "operator:one"


def test_role_capability_requests_admit_existing_delivery_profile_and_keep_roles_closed():
    delivery = HermesRoleCapabilityProvisionRequestV1.model_validate({
        "capabilityBindingId": "capability:delivery-one", "taskId": "task:hermes-one", "outcomeId": "outcome:one", "laneRunId": "lane:one",
        "role": "delivery", "identity": "delivery:one", "home": "home:delivery", "workspace": "workspace:delivery",
        "capabilitySecret": "d" * 32,
        "createdAt": "2026-09-04T00:00:00Z", "expiresAt": "2099-01-01T00:00:00Z",
        "metadataOnly": True, "rawPayloadRetained": False,
    })
    assert delivery.role == "delivery"
    with pytest.raises(ValidationError):
        HermesRoleCapabilityProvisionRequestV1.model_validate({**delivery.model_dump(mode="json"), "role": "operator"})


def test_delivery_audit_request_is_exact_head_bound_and_has_a_closed_action_matrix():
    request = HermesDeliveryAuditRequestV1.model_validate({
        "taskId": "task:delivery-one", "outcomeId": "outcome:one", "laneRunId": "lane:one", "deliveryStewardIdentity": "delivery:one", "deliveryHome": "home:delivery", "deliveryWorkspace": "workspace:delivery",
        "deliveryCapabilityBindingId": "capability:delivery-one", "deliveryCapabilityProof": "d" * 32,
        "schemaVersion": "hermes_delivery_audit_action.v1", "repository": "slawdawg/Kendall-vnxt", "baseBranch": "dev",
        "expectedHeadSha": "a" * 40, "pullRequestNumber": 915, "requestedAction": "merge",
        "policyEvidenceRef": "evidence:policy-one", "localVerificationRef": "evidence:verification-one", "rollbackRef": "evidence:rollback-one",
        "evidenceRefs": ["evidence:policy-one", "evidence:verification-one", "evidence:rollback-one"],
        "observedAt": "2026-09-04T00:00:01Z", "idempotencyKey": "delivery-audit:one", "createdAt": "2026-09-04T00:00:00Z",
        "expectedOutcomeRevision": 2, "expectedLaneRevision": 2, "metadataOnly": True, "rawPayloadRetained": False,
    })
    assert request.requestedAction == "merge"
    with pytest.raises(ValidationError):
        HermesDeliveryAuditRequestV1.model_validate({**request.model_dump(mode="json"), "baseBranch": "main"})
    with pytest.raises(ValidationError):
        HermesDeliveryAuditRequestV1.model_validate({**request.model_dump(mode="json"), "requestedAction": "force_push"})
