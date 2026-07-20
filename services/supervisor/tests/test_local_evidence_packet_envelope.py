from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import LocalEvidencePacketApiEnvelope, LocalEvidencePacketView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_local_evidence_packet_envelope_is_strict_and_typed() -> None:
    assert LocalEvidencePacketApiEnvelope.model_fields["data"].annotation is LocalEvidencePacketView
    assert LocalEvidencePacketApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        LocalEvidencePacketApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_local_evidence_packet_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}/local-evidence-packet").response_model is LocalEvidencePacketApiEnvelope


def test_shared_typescript_local_evidence_packet_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface LocalEvidencePacketApiEnvelope" in contract_source
    assert "data: LocalEvidencePacketView;" in contract_source
