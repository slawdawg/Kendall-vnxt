from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    DisabledProviderProofListApiEnvelope,
    ThreatBoundaryApiEnvelope,
    ThreatBoundaryView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _disabled_provider_proof() -> dict[str, object]:
    return {
        "workerId": "local.ollama.disabled",
        "providerLabel": "Ollama",
        "disabledReason": "provider gate disabled",
        "registryState": "disabled",
        "broadGateEnabled": False,
        "providerSpecificGateEnabled": False,
        "modelIdConfigured": False,
        "adapterReady": False,
        "endpointFamily": "local_openai_compatible",
        "endpointPolicy": "deny_until_approved",
        "httpCallsAttempted": False,
        "modelCallsAttempted": False,
        "networkAccessAttempted": False,
        "credentialAccessAttempted": False,
        "redactionChecks": ["metadata only"],
        "promptConstructionSources": [],
        "rejectedPromptSources": ["raw provider payload"],
        "retainedEvidenceClasses": ["disabled proof"],
        "rawPromptRetentionAllowed": False,
        "rawCompletionRetentionAllowed": False,
        "connectTimeoutSeconds": None,
        "totalTimeoutSeconds": None,
        "attemptStateMapping": ["disabled"],
        "retryPolicy": "no retry",
        "timeoutPolicy": "bounded",
        "cancellationPolicy": "operator controlled",
        "retentionPolicy": "summaries only",
    }


def _threat_boundary() -> dict[str, object]:
    return {
        "boundaryId": "supervisor-worker-threat-boundary-v1",
        "status": "blocked_by_default",
        "generatedAt": datetime(2026, 7, 21, 4, 55, tzinfo=timezone.utc),
        "summary": "Worker and provider execution remains denied.",
        "redactionBoundary": ["metadata and approved summaries only"],
        "promptConstructionSources": ["work_item_metadata"],
        "allowedCommandClasses": ["supervisor_internal_utility_functions"],
        "blockedCommandClasses": ["arbitrary_shell_commands"],
        "providerEndpointPolicy": "deny all",
        "credentialPolicy": "forbid access",
        "artifactPolicy": "references and summaries only",
        "rules": [
            {
                "ruleId": "credential-deny",
                "label": "Credential deny",
                "status": "blocked_by_default",
                "summary": "Credentials remain forbidden.",
                "blockedReason": "credential_access_forbidden",
                "evidence": ["policy"],
            }
        ],
        "processLaunchAllowed": False,
        "providerCallsAllowed": False,
        "modelCallsAllowed": False,
        "premiumExecutionAllowed": False,
        "commandExecutionAllowed": False,
        "sourceMutationAllowed": False,
        "networkAllowed": False,
        "credentialAccessAllowed": False,
    }


def test_disabled_provider_proof_envelope_is_typed_and_strict() -> None:
    envelope = DisabledProviderProofListApiEnvelope.model_validate(
        {"data": [_disabled_provider_proof()]}
    )

    assert envelope.data[0].workerId == "local.ollama.disabled"
    with pytest.raises(ValidationError):
        DisabledProviderProofListApiEnvelope.model_validate(
            {"data": [_disabled_provider_proof()], "unexpected": True}
        )
    with pytest.raises(ValidationError):
        invalid = _disabled_provider_proof()
        invalid["httpCallsAttempted"] = 0
        DisabledProviderProofListApiEnvelope.model_validate({"data": [invalid]})


def test_threat_boundary_envelope_preserves_blocked_safety_literals() -> None:
    envelope = ThreatBoundaryApiEnvelope.model_validate({"data": _threat_boundary()})

    assert isinstance(envelope.data, ThreatBoundaryView)
    with pytest.raises(ValidationError):
        invalid = _threat_boundary()
        invalid["providerCallsAllowed"] = True
        ThreatBoundaryApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = _threat_boundary()
        invalid["rules"] = [{**invalid["rules"][0], "unexpected": True}]  # type: ignore[index]
        ThreatBoundaryApiEnvelope.model_validate({"data": invalid})


def test_supervisor_report_routes_use_typed_envelopes() -> None:
    assert _route("/supervisor/disabled-provider-proofs").response_model is DisabledProviderProofListApiEnvelope
    assert _route("/supervisor/threat-boundary").response_model is ThreatBoundaryApiEnvelope


def test_supervisor_report_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface DisabledProviderProofListApiEnvelope" in contract
    assert "data: DisabledProviderProofView[];" in contract
    assert "export interface ThreatBoundaryApiEnvelope" in contract
    assert "data: ThreatBoundaryView;" in contract
    assert "providerCallsAllowed: false;" in contract
    assert "credentialAccessAllowed: false;" in contract
