from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import LocalWorktreePlanApiEnvelope, LocalWorktreePlanView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_plan() -> dict[str, object]:
    return {
        "planId": "plan-1",
        "workItemId": "work-item-1",
        "title": "Local worktree plan",
        "executionBranch": "codex/example",
        "baseBranch": "dev",
        "baseRevision": "a" * 40,
        "worktreePath": "/tmp/worktree",
        "status": "ready",
        "createCommand": ["git", "worktree", "add"],
        "cleanupCommand": ["git", "worktree", "remove"],
        "safetyChecks": [],
        "blockedBy": [],
        "evidence": [],
    }


def test_local_worktree_plan_envelope_is_strict_and_typed() -> None:
    assert LocalWorktreePlanApiEnvelope.model_fields["data"].annotation is LocalWorktreePlanView
    assert LocalWorktreePlanApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        LocalWorktreePlanApiEnvelope.model_validate({"data": {}, "unexpected": True})

    with pytest.raises(ValidationError):
        LocalWorktreePlanApiEnvelope.model_validate({"data": _valid_plan(), "meta": {"nested": {"blocked": True}}})


def test_local_worktree_plan_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}/local-worktree-plan").response_model is LocalWorktreePlanApiEnvelope


def test_shared_typescript_local_worktree_plan_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface LocalWorktreePlanApiEnvelope" in contract_source
    assert "data: LocalWorktreePlanView;" in contract_source
