from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import CandidateWorkListApiEnvelope, CandidateWorkView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_candidate_work_list_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = CandidateWorkListApiEnvelope.model_validate({"data": [], "meta": {"requestId": "req-1"}})

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(CandidateWorkListApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(CandidateWorkListApiEnvelope.model_fields["data"].annotation) == (CandidateWorkView,)

    with pytest.raises(ValidationError):
        CandidateWorkListApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_candidate_work_list_route_uses_typed_envelope() -> None:
    assert _route("/candidate-work").response_model is CandidateWorkListApiEnvelope


def test_shared_typescript_candidate_work_list_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface CandidateWorkListApiEnvelope" in contract_source
    assert "data: CandidateWorkView[];" in contract_source
