from __future__ import annotations

from pathlib import Path

from supervisor.api.main import app
from supervisor.api.schemas import AuthoritativeWorkPacketApiEnvelope


def _route(path: str, method: str = "POST"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_authoritative_work_packet_mutation_routes_use_typed_envelopes() -> None:
    envelope = AuthoritativeWorkPacketApiEnvelope
    assert _route("/pipeline-control-plane/work-packets").response_model is envelope
    assert _route("/pipeline-control-plane/work-packets/{packet_id}/transitions").response_model is envelope


def test_mutation_routes_return_the_shared_authoritative_packet_contract() -> None:
    source = (Path(__file__).parents[3] / "services/supervisor/src/supervisor/api/main.py").read_text(encoding="utf-8")
    create_start = source.index('@app.post("/pipeline-control-plane/work-packets"')
    transition_start = source.index('    "/pipeline-control-plane/work-packets/{packet_id}/transitions"')
    assert "return AuthoritativeWorkPacketApiEnvelope(data=packet)" in source[create_start:transition_start]
    assert "return AuthoritativeWorkPacketApiEnvelope(data=packet)" in source[transition_start:]


def test_shared_typescript_authoritative_packet_envelope_is_reused_for_mutations() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/pipeline-control-plane/index.ts"
    ).read_text(encoding="utf-8")
    assert "export interface AuthoritativeWorkPacketApiEnvelope" in contract_source
    assert "data: AuthoritativeWorkPacketLifecycleView;" in contract_source
