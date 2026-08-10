from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app, service
from supervisor.api.schemas import MemoryInboxShellApiEnvelope, MemoryInboxShellStatusV1


def _route(path: str, method: str = "GET"):
    return next(route for route in app.routes if getattr(route, "path", None) == path and method in getattr(route, "methods", set()))


def test_memory_inbox_shell_is_exactly_the_current_content_free_unavailable_status() -> None:
    status = service.get_memory_inbox_shell_status()
    assert status.model_dump() == {"schemaVersion": "kendall-memory-inbox-shell/v1", "state": "unavailable", "freshness": "current", "nextSafeAction": "refresh_memory_inbox"}
    assert MemoryInboxShellApiEnvelope(data=status).model_dump()["data"] == status.model_dump()
    with pytest.raises(ValidationError):
        MemoryInboxShellStatusV1.model_validate({**status.model_dump(), "count": 0})


def test_memory_inbox_shell_route_uses_the_typed_read_envelope() -> None:
    assert _route("/memory-inbox/shell").response_model is MemoryInboxShellApiEnvelope


def test_typescript_shell_contract_has_no_content_or_lifecycle_fields() -> None:
    source = (Path(__file__).parents[3] / "packages/contracts/src/memory-inbox.ts").read_text(encoding="utf-8")
    for field in ("schemaVersion", "state", "freshness", "nextSafeAction"):
        assert field in source
    for forbidden in ("count", "title", "filename", "proposal", "source", "retention", "provider"):
        assert forbidden not in source.lower()
