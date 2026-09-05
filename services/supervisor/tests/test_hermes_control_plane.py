from datetime import UTC, datetime, timedelta

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import HermesFollowUpWorkInputV1, HermesLedgerIngestRequest, HermesReviewHandoffRequest, HermesRoleCapabilityProvisionRequestV1, HermesRoleCapabilityRevocationRequestV1


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


def follow_up_payload() -> dict[str, object]:
    return {
        "followUpWorkId": "follow-up:one", "parentOutcomeId": "outcome:1", "parentLaneRunId": "lane:1",
        "schemaVersion": "follow_up_work.v1", "title": "Reduce verification friction", "summary": "Record a bounded improvement proposal.",
        "dedupeKey": "dedupe:verification-friction", "owner": "hermes-coordinator", "priorityRationale": "Recurring delivery friction blocks outcomes.",
        "capacityState": "available", "reviewAt": "2099-09-03T12:00:00Z", "expiresAt": "2099-09-04T12:00:00Z",
        "status": "proposed", "result": "allowed", "reasonCode": "ordinary_friction", "evidenceRefs": ["evidence:1"],
        "nextAction": "Review the proposal before creating a bounded outcome.", "observedAt": "2026-09-02T12:00:00Z",
        "idempotencyKey": "follow-up:one", "createdAt": "2026-09-02T12:00:00Z", "metadataOnly": True, "rawPayloadRetained": False,
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
    assert route("/hermes-control-plane/follow-ups").methods == {"POST"}
    assert route("/hermes-control-plane/follow-ups").response_model.__name__ == "HermesFollowUpWorkProjectionApiEnvelope"


def test_follow_up_admission_is_strict_proposal_only_metadata():
    value = HermesFollowUpWorkInputV1.model_validate(follow_up_payload())
    assert value.parentLaneRunId == "lane:1" and value.status == "proposed"
    rework = follow_up_payload(); rework["result"] = "rework"
    assert HermesFollowUpWorkInputV1.model_validate(rework).result == "rework"
    missing_lane = follow_up_payload(); missing_lane.pop("parentLaneRunId")
    with pytest.raises(ValidationError): HermesFollowUpWorkInputV1.model_validate(missing_lane)
    active = follow_up_payload(); active["status"] = "active"
    with pytest.raises(ValidationError): HermesFollowUpWorkInputV1.model_validate(active)
    mismatched_capacity = follow_up_payload(); mismatched_capacity["capacityState"] = "atCapacity"
    with pytest.raises(ValidationError): HermesFollowUpWorkInputV1.model_validate(mismatched_capacity)
    expired = follow_up_payload(); expired["expiresAt"] = "2099-09-03T12:00:00Z"
    with pytest.raises(ValidationError): HermesFollowUpWorkInputV1.model_validate(expired)


def test_role_capability_requests_keep_only_a_transient_secret_and_bound_metadata():
    provision = HermesRoleCapabilityProvisionRequestV1.model_validate({
        "capabilityBindingId": "capability:developer-one", "outcomeId": "outcome:one", "laneRunId": "lane:one",
        "role": "developer", "identity": "developer:one", "home": "home:developer", "workspace": "workspace:developer",
        "capabilitySecret": "d" * 32,
        "createdAt": "2026-09-04T00:00:00Z", "expiresAt": "2099-01-01T00:00:00Z",
        "metadataOnly": True, "rawPayloadRetained": False,
    })
    assert provision.role == "developer"
    with pytest.raises(ValidationError):
        HermesRoleCapabilityProvisionRequestV1.model_validate({**provision.model_dump(mode="json"), "expiresAt": "2026-09-04T00:00:00Z"})
    with pytest.raises(ValidationError):
        HermesRoleCapabilityProvisionRequestV1.model_validate({**provision.model_dump(mode="json"), "createdAt": "2099-01-01T00:00:00Z", "expiresAt": "2099-01-02T00:00:00Z"})
    revoked = HermesRoleCapabilityRevocationRequestV1.model_validate({"capabilityBindingId": provision.capabilityBindingId, "revokedBy": "operator:one", "revokedAt": "2026-09-04T00:30:00Z", "metadataOnly": True, "rawPayloadRetained": False})
    assert revoked.revokedBy == "operator:one"


def test_review_handoff_rejects_secret_shaped_capability_binding_references():
    verification = {
        "verificationRecordId": "verification:one", "outcomeId": "outcome:one", "laneRunId": "lane:one",
        "schemaVersion": "hermes_verification_record.v1", "result": "passed", "target": "test:hermes",
        "sourceFingerprint": "sha256:proof", "developerIdentity": "developer:one",
        "developerHome": "home:developer", "developerWorkspace": "workspace:developer",
        "evidenceRefs": ["evidence:one"], "observedAt": "2026-09-04T00:01:00Z",
        "idempotencyKey": "verification:one", "createdAt": "2026-09-04T00:01:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    disposition = {
        "reviewDispositionId": "review:one", "verificationRecordId": "verification:one", "outcomeId": "outcome:one",
        "developerLaneRunId": "lane:one", "schemaVersion": "hermes_review_disposition.v1", "disposition": "approve",
        "reviewerIdentity": "reviewer:one", "reviewerHome": "home:reviewer", "reviewerWorkspace": "workspace:reviewer",
        "reasonCode": "reviewed", "nextAction": "Hold for delivery.", "evidenceRefs": ["evidence:one"],
        "observedAt": "2026-09-04T00:02:00Z", "idempotencyKey": "review:one", "createdAt": "2026-09-04T00:02:00Z",
        "metadataOnly": True, "rawPayloadRetained": False, "expectedOutcomeRevision": 1, "expectedLaneRevision": 1,
    }
    with pytest.raises(ValidationError, match="Role capability identity"):
        HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:sk_live_abcdefghijklmnop", "developerCapabilityProof": "d" * 32})
    with pytest.raises(ValidationError, match="Role capability identity"):
        HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "reviewerCapabilityBindingId": "capability:sk_live_abcdefghijklmnop", "reviewerCapabilityProof": "r" * 32})
    with pytest.raises(ValidationError, match="Role capability identity"):
        HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:sk_live", "developerCapabilityProof": "d" * 32})
    with pytest.raises(ValidationError, match="Role capability identity"):
        HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "reviewerCapabilityBindingId": "capability:pk_test", "reviewerCapabilityProof": "r" * 32})
    with pytest.raises(ValidationError, match="Role capability identity"):
        HermesReviewHandoffRequest.model_validate({"verification": verification, "developerCapabilityBindingId": "capability:sk_live-abc", "developerCapabilityProof": "d" * 32})
    with pytest.raises(ValidationError, match="Role capability identity"):
        HermesReviewHandoffRequest.model_validate({"verification": verification, "disposition": disposition, "reviewerCapabilityBindingId": "capability:pk_test-abc", "reviewerCapabilityProof": "r" * 32})
