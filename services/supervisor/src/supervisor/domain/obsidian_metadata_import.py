from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePosixPath

from supervisor.domain.types import CandidateWorkPriority, RiskLevel


class ObsidianMetadataImportError(ValueError):
    pass


@dataclass(frozen=True)
class ObsidianMetadataImportPackage:
    title: str
    requested_outcome: str
    source_artifact_path: str
    risk_level: RiskLevel
    recommended_priority: CandidateWorkPriority
    import_metadata: dict


def build_obsidian_metadata_import_package(
    *,
    title: str,
    requested_outcome: str,
    source_artifact_path: str,
    source_ref: str,
    evidence_refs: list[str],
    approval_status: str,
    approved_by: str | None,
    approved_at: datetime | None,
    freshness: str,
    risk_level: RiskLevel,
    priority: CandidateWorkPriority,
) -> ObsidianMetadataImportPackage:
    safe_title = _required_text(title, "Obsidian metadata import title is required.")
    safe_outcome = _required_text(requested_outcome, "Obsidian metadata import requested outcome is required.")
    safe_path = _safe_vault_metadata_path(source_artifact_path)
    safe_source_ref = _safe_source_ref(source_ref)
    safe_evidence_refs = _safe_evidence_refs(evidence_refs)
    safe_freshness = _safe_freshness(freshness)

    if approval_status != "approved":
        raise ObsidianMetadataImportError("Obsidian metadata import requires approvalStatus=approved.")
    safe_approved_by = _required_text(approved_by or "", "Obsidian metadata import requires approvedBy provenance.")
    if approved_at is None:
        raise ObsidianMetadataImportError("Obsidian metadata import requires approvedAt provenance.")
    if safe_source_ref != f"obsidian:{safe_path}":
        raise ObsidianMetadataImportError("Obsidian metadata sourceRef must match sourceArtifactPath.")

    approved_at_iso = approved_at.isoformat()
    source_summary = {
        "label": f"Approved Obsidian metadata: {safe_title}",
        "summary": f"{safe_title} is represented by approved Obsidian metadata only; raw note content was not copied.",
        "sourceType": "obsidian",
        "sourceRef": safe_source_ref,
        "sourceArtifactPath": safe_path,
        "freshness": safe_freshness,
        "accessState": "allowed",
        "retentionPolicy": "metadata_only_no_raw_obsidian_content",
        "boundarySummary": "Canonical Obsidian memory remains human-owned and unchanged.",
        "evidenceRefs": safe_evidence_refs,
        "approvalStatus": approval_status,
        "approvedBy": safe_approved_by,
        "approvedAt": approved_at_iso,
    }
    source_refs = [
        {
            "refId": safe_source_ref,
            "sourceType": "obsidian",
            "label": source_summary["label"],
            "pathOrUrl": safe_path,
            "freshness": safe_freshness,
            "accessState": "allowed",
        }
    ]
    metadata = {
        "sourceRef": safe_source_ref,
        "evidenceRefs": safe_evidence_refs,
        "approvalStatus": approval_status,
        "approvedBy": safe_approved_by,
        "approvedAt": approved_at_iso,
        "freshness": safe_freshness,
        "userFacingSourceSummary": source_summary,
        "workPacketSourceRefs": source_refs,
        "retentionPolicy": "metadata_only_no_raw_obsidian_content",
        "canonicalMutationAllowed": False,
        "sourceMutationAllowed": False,
        "providerCallsAllowed": False,
        "workerLaunchAllowed": False,
        "notes": [
            "Imported from approved Obsidian metadata only.",
            "Raw Obsidian note content was not copied into Candidate Work.",
            "Canonical Obsidian memory remains human-owned and unchanged.",
        ],
    }
    return ObsidianMetadataImportPackage(
        title=safe_title,
        requested_outcome=safe_outcome,
        source_artifact_path=safe_path,
        risk_level=risk_level,
        recommended_priority=priority,
        import_metadata=metadata,
    )


def _required_text(value: str, message: str) -> str:
    safe_value = value.strip() if isinstance(value, str) else ""
    if not safe_value:
        raise ObsidianMetadataImportError(message)
    return safe_value


def _safe_vault_metadata_path(value: str) -> str:
    safe_value = _required_text(value, "Obsidian metadata sourceArtifactPath is required.").replace("\\", "/")
    path = PurePosixPath(safe_value)
    if path.is_absolute() or ".." in path.parts:
        raise ObsidianMetadataImportError("Obsidian metadata path must be vault-relative without parent traversal.")
    return path.as_posix()


def _safe_source_ref(value: str) -> str:
    safe_value = _required_text(value, "Obsidian metadata sourceRef is required.")
    if not safe_value.startswith("obsidian:") or len(safe_value) <= len("obsidian:"):
        raise ObsidianMetadataImportError("Obsidian metadata sourceRef must start with obsidian:.")
    return safe_value


def _safe_evidence_refs(values: list[str]) -> list[str]:
    safe_values = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    if not safe_values:
        raise ObsidianMetadataImportError("Obsidian metadata import requires at least one evidence ref.")
    return list(dict.fromkeys(safe_values))


def _safe_freshness(value: str) -> str:
    allowed = {"fresh", "stale", "unknown", "not_applicable"}
    if value not in allowed:
        raise ObsidianMetadataImportError("Obsidian metadata freshness is invalid.")
    return value
