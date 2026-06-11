from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from supervisor.domain.types import CandidateWorkArtifactType, CandidateWorkPriority, RiskLevel


SUPPORTED_ARTIFACT_ROOTS = (
    PurePosixPath("docs/stories"),
    PurePosixPath("docs/prds"),
    PurePosixPath("docs/product"),
    PurePosixPath("_bmad-output/planning-artifacts"),
)


class BmadImportError(ValueError):
    pass


@dataclass(frozen=True)
class BmadImportPackage:
    title: str
    requested_outcome: str
    source_artifact_path: str
    source_artifact_type: CandidateWorkArtifactType
    artifact_title: str
    story_id: str | None
    epic_id: str | None
    acceptance_criteria: str
    risk_level: RiskLevel
    recommended_priority: CandidateWorkPriority
    verification_summary: str
    allowed_scope: str | None
    notes: list[str]


def parse_bmad_import_package(repo_root: Path, artifact_path: str) -> BmadImportPackage:
    relative_path = _normalize_repo_relative_path(artifact_path)
    if relative_path.suffix.lower() != ".md":
        raise BmadImportError("BMAD import supports markdown artifacts only.")
    if not _is_supported_path(relative_path):
        raise BmadImportError("BMAD import path is outside supported artifact roots.")

    resolved_root = repo_root.resolve()
    resolved_artifact = (resolved_root / relative_path.as_posix()).resolve()
    if not resolved_artifact.is_relative_to(resolved_root):
        raise BmadImportError("BMAD import path resolves outside the repository root.")
    if not resolved_artifact.exists() or not resolved_artifact.is_file():
        raise BmadImportError("BMAD import artifact was not found.")

    content = resolved_artifact.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(content)
    headings = _extract_heading_sections(body)
    artifact_title = _artifact_title(frontmatter, body, relative_path)
    story_id, epic_id = _story_and_epic_ids(relative_path, artifact_title)
    acceptance = _bounded_section_summary(headings.get("acceptance criteria"), "No acceptance criteria section found.")
    verification = _bounded_section_summary(headings.get("verification"), "No verification section found.")
    allowed_scope = _allowed_scope_summary(headings.get("authority"))
    status = _status(frontmatter, body)

    risk_level = _infer_risk_level(body)
    priority = _infer_priority(relative_path, risk_level, status)
    notes = _notes(relative_path, status, headings)

    return BmadImportPackage(
        title=f"Review {artifact_title}",
        requested_outcome=_requested_outcome(headings, artifact_title),
        source_artifact_path=relative_path.as_posix(),
        source_artifact_type=_artifact_type(relative_path),
        artifact_title=artifact_title,
        story_id=story_id,
        epic_id=epic_id,
        acceptance_criteria=acceptance,
        risk_level=risk_level,
        recommended_priority=priority,
        verification_summary=verification,
        allowed_scope=allowed_scope,
        notes=notes,
    )


def _normalize_repo_relative_path(artifact_path: str) -> PurePosixPath:
    if not artifact_path or not artifact_path.strip():
        raise BmadImportError("BMAD import path is required.")

    normalized = artifact_path.replace("\\", "/").strip()
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise BmadImportError("BMAD import path must be repo-relative without parent traversal.")
    return path


def _is_supported_path(path: PurePosixPath) -> bool:
    return any(path.is_relative_to(root) for root in SUPPORTED_ARTIFACT_ROOTS)


def _split_frontmatter(content: str) -> tuple[dict[str, str], str]:
    if not content.startswith("---\n"):
        return {}, content

    end = content.find("\n---\n", 4)
    if end == -1:
        return {}, content

    frontmatter: dict[str, str] = {}
    for line in content[4:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        frontmatter[key.strip().lower()] = value.strip().strip('"')
    return frontmatter, content[end + 5 :]


def _extract_heading_sections(content: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current_heading: str | None = None
    for line in content.splitlines():
        heading_match = re.match(r"^(#{2,4})\s+(.+?)\s*$", line)
        if heading_match:
            current_heading = _heading_key(heading_match.group(2))
            sections.setdefault(current_heading, [])
            continue
        if current_heading:
            sections[current_heading].append(line)
    return {key: "\n".join(lines).strip() for key, lines in sections.items()}


def _heading_key(heading: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", heading.lower()).strip()


def _artifact_title(frontmatter: dict[str, str], body: str, path: PurePosixPath) -> str:
    if frontmatter.get("title"):
        return frontmatter["title"]

    for line in body.splitlines():
        match = re.match(r"^#\s+(.+?)\s*$", line)
        if match:
            return match.group(1).strip()

    return path.stem.replace("-", " ").replace("_", " ").title()


def _story_and_epic_ids(path: PurePosixPath, artifact_title: str) -> tuple[str | None, str | None]:
    candidates = (path.stem, artifact_title)
    for candidate in candidates:
        match = re.search(r"\b(\d+)-(\d+)\b", candidate)
        if match:
            return match.group(0), match.group(1)
    return None, None


def _bounded_section_summary(section: str | None, fallback: str, max_chars: int = 1200) -> str:
    if not section:
        return fallback

    lines = [line.strip() for line in section.splitlines() if line.strip()]
    summary = "\n".join(lines[:12])
    if len(summary) > max_chars:
        return summary[: max_chars - 3].rstrip() + "..."
    return summary or fallback


def _allowed_scope_summary(authority_section: str | None) -> str | None:
    if not authority_section:
        return None

    allowed_lines: list[str] = []
    in_allowed = False
    for raw_line in authority_section.splitlines():
        line = raw_line.strip()
        if line.lower().startswith("allowed"):
            in_allowed = True
            continue
        if line.lower().startswith("blocked"):
            break
        if in_allowed and line:
            allowed_lines.append(line)
    if not allowed_lines:
        return None
    return _bounded_section_summary("\n".join(allowed_lines), "", max_chars=800)


def _status(frontmatter: dict[str, str], body: str) -> str | None:
    if frontmatter.get("status"):
        return frontmatter["status"]
    match = re.search(r"^Status:\s*(.+?)\s*$", body, re.MULTILINE)
    return match.group(1).strip() if match else None


def _infer_risk_level(body: str) -> RiskLevel:
    lowered = body.lower()
    if "high risk" in lowered or "risklevel: high" in lowered:
        return RiskLevel.HIGH
    if "medium risk" in lowered or "risklevel: medium" in lowered:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def _infer_priority(path: PurePosixPath, risk_level: RiskLevel, status: str | None) -> CandidateWorkPriority:
    if risk_level == RiskLevel.HIGH:
        return CandidateWorkPriority.HIGH
    if status and status.lower() in {"approved", "review", "ready"}:
        return CandidateWorkPriority.HIGH
    if path.is_relative_to(PurePosixPath("docs/stories")):
        return CandidateWorkPriority.NORMAL
    return CandidateWorkPriority.LOW


def _artifact_type(path: PurePosixPath) -> CandidateWorkArtifactType:
    if path.is_relative_to(PurePosixPath("docs/stories")):
        return CandidateWorkArtifactType.BMAD_STORY
    if path.is_relative_to(PurePosixPath("docs/prds")) or path.is_relative_to(PurePosixPath("_bmad-output/planning-artifacts")):
        return CandidateWorkArtifactType.BMAD_WORKFLOW_OUTPUT
    return CandidateWorkArtifactType.BMAD_RESEARCH


def _requested_outcome(headings: dict[str, str], artifact_title: str) -> str:
    story_section = headings.get("story")
    if story_section:
        summary = _bounded_section_summary(story_section, "", max_chars=500)
        if summary:
            return summary
    return f"Review {artifact_title} and decide whether it should become Candidate Work."


def _notes(path: PurePosixPath, status: str | None, headings: dict[str, str]) -> list[str]:
    notes = [f"Imported from {path.as_posix()} as metadata only."]
    if status:
        notes.append(f"Artifact status: {status}.")
    missing = [name for name in ("acceptance criteria", "verification") if not headings.get(name)]
    if missing:
        notes.append(f"Fallback summaries used for missing sections: {', '.join(missing)}.")
    notes.append("Raw artifact content was not copied into the import package.")
    return notes
