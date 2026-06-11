from pathlib import Path

import pytest

from supervisor.domain.bmad_import import BmadImportError, parse_bmad_import_package
from supervisor.domain.types import CandidateWorkArtifactType, CandidateWorkPriority, RiskLevel


def _write_artifact(repo_root: Path, relative_path: str, content: str) -> None:
    artifact_path = repo_root / relative_path
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(content, encoding="utf-8")


def test_bmad_import_parser_extracts_story_metadata_without_copying_full_artifact(tmp_path) -> None:
    _write_artifact(
        tmp_path,
        "docs/stories/6-4-bmad-import-package-parser.md",
        """---
title: Story 6.4 Custom Frontmatter Title
status: Ready
---
# Story 6.4: BMAD Import Package Parser

Status: Draft

## Story

As Bob,
I want local BMAD artifacts converted into import packages,
so that structured planning output can enter the Dev Console pipeline.

## Acceptance Criteria

1. Parser accepts supported paths.
2. Parser rejects unsupported paths.

## Authority

Allowed:

- local file reads from supported repo artifact paths
- metadata extraction

Blocked:

- provider calls
- command execution

## Verification

- parser tests
- docs check
""",
    )

    package = parse_bmad_import_package(tmp_path, "docs/stories/6-4-bmad-import-package-parser.md")

    assert package.title == "Review Story 6.4 Custom Frontmatter Title"
    assert package.requested_outcome.startswith("As Bob,")
    assert package.source_artifact_path == "docs/stories/6-4-bmad-import-package-parser.md"
    assert package.source_artifact_type == CandidateWorkArtifactType.BMAD_STORY
    assert package.artifact_title == "Story 6.4 Custom Frontmatter Title"
    assert package.story_id == "6-4"
    assert package.epic_id == "6"
    assert "Parser accepts supported paths." in package.acceptance_criteria
    assert package.risk_level == RiskLevel.LOW
    assert package.recommended_priority == CandidateWorkPriority.HIGH
    assert "parser tests" in package.verification_summary
    assert package.allowed_scope is not None
    assert "local file reads" in package.allowed_scope
    assert all("provider calls" not in note for note in package.notes)
    assert "Raw artifact content was not copied into the import package." in package.notes


def test_bmad_import_parser_supports_prd_product_and_planning_roots(tmp_path) -> None:
    artifacts = {
        "docs/prds/orchestrator.md": CandidateWorkArtifactType.BMAD_WORKFLOW_OUTPUT,
        "docs/product/orchestrator-brief.md": CandidateWorkArtifactType.BMAD_RESEARCH,
        "_bmad-output/planning-artifacts/research/orchestrator.md": CandidateWorkArtifactType.BMAD_WORKFLOW_OUTPUT,
    }
    for relative_path in artifacts:
        _write_artifact(
            tmp_path,
            relative_path,
            f"""# {relative_path}

## Verification

Use focused checks.
""",
        )

    for relative_path, expected_type in artifacts.items():
        package = parse_bmad_import_package(tmp_path, relative_path)
        assert package.source_artifact_path == relative_path
        assert package.source_artifact_type == expected_type
        assert package.acceptance_criteria == "No acceptance criteria section found."
        assert package.verification_summary == "Use focused checks."


def test_bmad_import_parser_rejects_unsupported_paths_traversal_and_non_markdown(tmp_path) -> None:
    _write_artifact(tmp_path, "README.md", "# Root readme")
    _write_artifact(tmp_path, "docs/stories/story.json", "{}")

    with pytest.raises(BmadImportError, match="outside supported artifact roots"):
        parse_bmad_import_package(tmp_path, "README.md")

    with pytest.raises(BmadImportError, match="repo-relative"):
        parse_bmad_import_package(tmp_path, "../docs/stories/6-4-bmad-import-package-parser.md")

    with pytest.raises(BmadImportError, match="markdown"):
        parse_bmad_import_package(tmp_path, "docs/stories/story.json")


def test_bmad_import_parser_uses_safe_fallbacks_for_sparse_artifacts(tmp_path) -> None:
    _write_artifact(tmp_path, "docs/stories/sparse-story.md", "Sparse artifact body without headings.")

    package = parse_bmad_import_package(tmp_path, "docs/stories/sparse-story.md")

    assert package.artifact_title == "Sparse Story"
    assert package.story_id is None
    assert package.epic_id is None
    assert package.requested_outcome == "Review Sparse Story and decide whether it should become Candidate Work."
    assert package.acceptance_criteria == "No acceptance criteria section found."
    assert package.verification_summary == "No verification section found."
    assert package.allowed_scope is None
    assert package.recommended_priority == CandidateWorkPriority.NORMAL
    assert any("Fallback summaries used" in note for note in package.notes)
