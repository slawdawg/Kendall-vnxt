from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import LlmWikiArtifactApiEnvelope, LlmWikiArtifactSearchResultView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_result() -> dict[str, object]:
    return {
        "targetVaultPath": "wiki/work-item-1.md",
        "query": "contract",
        "matched": True,
        "excerpts": ["contract evidence"],
        "metadata": {"source": "local"},
        "retentionClass": "metadata_only",
        "rawPayloadRetained": False,
        "sourceContentCopied": False,
        "canonicalMutationAllowed": False,
        "sourceMutationAllowed": False,
    }


def test_llm_wiki_artifact_envelope_is_strict_and_typed() -> None:
    assert LlmWikiArtifactApiEnvelope.model_fields["data"].annotation is LlmWikiArtifactSearchResultView
    assert LlmWikiArtifactApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        LlmWikiArtifactApiEnvelope.model_validate({"data": _valid_result(), "unexpected": True})

    with pytest.raises(ValidationError):
        LlmWikiArtifactApiEnvelope.model_validate({"data": _valid_result(), "meta": {"nested": {"blocked": True}}})


def test_llm_wiki_artifact_route_uses_typed_envelope() -> None:
    assert (
        _route("/work-items/{work_item_id}/memory-proposals/{proposal_id}/llm-wiki-artifact").response_model
        is LlmWikiArtifactApiEnvelope
    )


def test_shared_typescript_llm_wiki_artifact_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface LlmWikiArtifactSearchResultView" in contract_source
    assert "export interface LlmWikiArtifactApiEnvelope" in contract_source
    assert "data: LlmWikiArtifactSearchResultView;" in contract_source
