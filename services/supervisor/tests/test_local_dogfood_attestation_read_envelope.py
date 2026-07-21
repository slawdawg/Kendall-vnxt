from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    LocalDogfoodAttestationDecisionApiEnvelope,
    LocalDogfoodAttestationRevocationApiEnvelope,
    LocalDogfoodAuthorizationApiEnvelope,
    LocalDogfoodAttestationReadbackApiEnvelope,
)


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _readback() -> dict[str, object]:
    return {
        "authorizationId": "authorization-1",
        "issuerId": "local-issuer",
        "keyId": "key-1",
        "receiptId": None,
        "receiptState": "pending",
        "rejectionReason": None,
        "expiresAt": "2026-07-21T06:00:00Z",
        "replayState": "unknown",
        "evidenceClass": "integrated_local",
        "liveEvidenceAccepted": False,
    }


def test_local_dogfood_readback_envelope_is_strict_and_metadata_only() -> None:
    envelope = LocalDogfoodAttestationReadbackApiEnvelope.model_validate({"data": _readback()})
    assert envelope.data.evidenceClass == "integrated_local"
    with pytest.raises(ValidationError):
        LocalDogfoodAttestationReadbackApiEnvelope.model_validate({"data": _readback(), "unexpected": True})
    with pytest.raises(ValidationError):
        invalid = _readback()
        invalid["liveEvidenceAccepted"] = True
        LocalDogfoodAttestationReadbackApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = _readback()
        invalid["rawReceipt"] = "forbidden"
        LocalDogfoodAttestationReadbackApiEnvelope.model_validate({"data": invalid})


def test_local_dogfood_read_routes_use_typed_envelope() -> None:
    envelope = LocalDogfoodAttestationReadbackApiEnvelope
    assert _route("/local-dogfood/attestations/authorizations/{authorization_id}").response_model is envelope
    assert _route("/local-dogfood/attestations/targets/{target_ref}").response_model is envelope


def test_local_dogfood_mutation_routes_use_bounded_typed_envelopes() -> None:
    assert _route("/local-dogfood/attestations/packets/{packet_id}/authorizations").response_model is LocalDogfoodAuthorizationApiEnvelope
    assert _route("/local-dogfood/attestations/receipts").response_model is LocalDogfoodAttestationDecisionApiEnvelope
    assert _route("/local-dogfood/attestations/authorizations/{authorization_id}/observe").response_model is LocalDogfoodAttestationDecisionApiEnvelope
    assert _route("/local-dogfood/attestations/authorizations/{authorization_id}/revoke").response_model is LocalDogfoodAttestationRevocationApiEnvelope


def test_local_dogfood_mutation_envelopes_reject_authority_inflation() -> None:
    authorization = {
        "authorizationId": "local-auth-1",
        "runId": "local-run-1",
        "attemptId": "local-attempt-1",
        "expiresAt": "2026-07-21T06:00:00Z",
        "evidenceClass": "integrated_local",
        "receiptBindings": {
            "issuerId": "issuer-1",
            "keyId": "key-1",
            "environment": "local_dogfood",
            "packetSchema": "pipeline-authoritative-work-packet/v1",
            "targetRef": "packet-1",
            "sourceRevision": "a" * 40,
            "sourceRefs": '["source:1"]',
            "evidenceDigest": "sha256:" + "a" * 64,
            "evidenceRefs": '["evidence:1"]',
            "runId": "local-run-1",
            "attemptId": "local-attempt-1",
            "policyVersion": "local-dogfood/v1",
            "retentionPolicy": "metadata_only",
            "observerId": "local_unix_observer/v1",
        },
    }
    envelope = LocalDogfoodAuthorizationApiEnvelope.model_validate({"data": authorization})
    assert envelope.data.metadataOnly is True
    assert envelope.data.rawPayloadRetained is False
    with pytest.raises(ValidationError):
        LocalDogfoodAuthorizationApiEnvelope.model_validate({"data": {**authorization, "provider": "forbidden"}})
    with pytest.raises(ValidationError):
        LocalDogfoodAuthorizationApiEnvelope.model_validate({"data": {**authorization, "evidenceClass": "live_observed"}})

    decision = LocalDogfoodAttestationDecisionApiEnvelope.model_validate({
        "data": {
            "evidenceClass": "integrated_local",
            "accepted": True,
            "rejectionReason": None,
            "issuerId": "issuer-1",
            "keyId": "key-1",
            "receiptId": "receipt-1",
        }
    })
    assert decision.data.liveEvidenceAccepted is False
    with pytest.raises(ValidationError):
        LocalDogfoodAttestationDecisionApiEnvelope.model_validate({
            "data": {
                "evidenceClass": "integrated_local",
                "accepted": True,
                "liveEvidenceAccepted": True,
            }
        })


def test_local_dogfood_readback_typescript_contract_matches_python() -> None:
    contract = (Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts").read_text()
    assert "export interface LocalDogfoodAttestationReadbackApiEnvelope" in contract
    assert "data: LocalDogfoodAttestationReadbackView;" in contract
    assert 'evidenceClass: "integrated_local";' in contract
    assert "liveEvidenceAccepted: false;" in contract
    assert "export interface LocalDogfoodAuthorizationApiEnvelope" in contract
    assert "export interface LocalDogfoodAttestationDecisionApiEnvelope" in contract
    assert "export interface LocalDogfoodAttestationRevocationApiEnvelope" in contract
    assert 'metadataOnly: true;' in contract
    assert 'rawPayloadRetained: false;' in contract
