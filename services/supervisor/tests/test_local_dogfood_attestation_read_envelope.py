from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import LocalDogfoodAttestationReadbackApiEnvelope


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


def test_local_dogfood_readback_typescript_contract_matches_python() -> None:
    contract = (Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts").read_text()
    assert "export interface LocalDogfoodAttestationReadbackApiEnvelope" in contract
    assert "data: LocalDogfoodAttestationReadbackView;" in contract
    assert 'evidenceClass: "integrated_local";' in contract
    assert "liveEvidenceAccepted: false;" in contract
