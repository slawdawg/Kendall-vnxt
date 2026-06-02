#!/usr/bin/env python3
"""Validate KNX source/evidence synthetic fixtures with stdlib-only checks."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUIRED_FIXTURE_TYPES = {
    "valid-source-packet",
    "valid-work-trace",
    "valid-validation-evidence",
    "valid-user-input-required",
    "missing-source-negative",
    "external-action-negative",
    "unsupported-inference-negative",
    "forbidden-destination-negative",
    "source-mutation-without-approval-negative",
    "source-inventory-outside-approved-storage-negative",
}

VALID_RESULTS = {"PASS", "CONCERNS", "FAIL", "WAIVED"}
VALID_FORBIDDEN_CONTENT_CHECKS = {"pass", "concerns", "fail", "not-run"}
VALID_SOURCE_PACKET_CLASSES = {
    "user-authored-planning-document",
    "public-or-synthetic-sample-data",
    "generated-report",
}
VALID_FIXTURE_SOURCE_PACKET_CLASSES = VALID_SOURCE_PACKET_CLASSES | {"synthetic-fixture"}
VALID_SOURCE_OWNERS = {"user", "project", "public", "synthetic", "unresolved"}
VALID_APPROVAL_BASES = {
    "user-specified",
    "profile-derived",
    "data-boundary-derived",
    "decision-record",
    "public",
    "synthetic",
    "unresolved",
}
VALID_SOURCE_SUPPORT_LEVELS = {
    "direct",
    "indirect",
    "user-asserted",
    "synthetic",
    "inferred",
    "unsupported",
    "unresolved",
}
VALID_PROCESSING_BOUNDARIES = {
    "deterministic-local",
    "mature-local-tool",
    "approved-local-model",
    "approved-custom-glue",
    "approved-external-provider",
    "unresolved",
}
VALID_STORAGE_BOUNDARIES = {
    "_bmad/memory/knx",
    "approved-storage-root",
    "synthetic-fixture-folder",
    "unresolved",
}
VALID_SOURCE_OPERATIONS = {
    "read-planning",
    "mutation-requested",
    "mutation-approved",
    "external-send-requested",
    "blocked",
}
VALID_UNCERTAINTY = {"none", "low", "medium", "high", "blocking"}
VALID_WORK_TRACE_TRIGGERS = {"user request", "workflow", "scheduled review", "manual update"}
VALID_WORK_TRACE_NEXT_ACTIONS = {
    "proceed",
    "validate",
    "request-user-input",
    "create-decision",
    "defer",
    "block",
}
VALID_RESIDUAL_RISK = {"none", "low", "medium", "high", "blocking"}
VALID_ARTIFACT_UNDER_VALIDATION = {
    "source packet",
    "output",
    "work trace",
    "decision",
    "fixture",
    "policy file",
}
VALID_VALIDATION_TYPES = {
    "boundary-check",
    "source-support-check",
    "contract-check",
    "fixture-check",
    "policy-check",
    "manual-review",
    "other",
}
VALID_BLOCKING_STATUS = {"nonblocking", "blocking", "waived-blocking", "not-applicable"}
VALID_USER_INPUT_REASONS = {"safety", "boundary", "missing approval", "ambiguity", "missing source", "risk"}
VALID_USER_INPUT_STATUS = {"open", "answered", "deferred", "closed"}
VALID_OUTPUT_TYPES = {"draft", "review-package", "report", "plan", "decision-support", "fixture-output", "other"}
VALID_GENERATION_BOUNDARIES = {
    "deterministic-local",
    "mature-local-tool",
    "approved-local-model",
    "approved-custom-glue",
    "approved-external-provider",
    "unresolved",
}
VALID_SOURCE_SUPPORT_SUMMARIES = {
    "direct",
    "indirect",
    "user-asserted",
    "synthetic",
    "inferred",
    "unsupported",
    "mixed",
}
VALID_OUTPUT_STATUSES = {"draft", "ready-for-review", "validated", "blocked", "superseded"}
VALID_STORAGE_BOUNDARY_BASES = {
    "_bmad/memory/knx",
    "approved-storage-root",
    "synthetic-fixture-folder",
    "decision-record",
    "unresolved",
}
REQUIRED_OUTPUT_TEXT_FIELDS = {
    "output_artifact_id",
    "work_trace_id",
    "storage_location",
    "created_at",
}
VALID_SOURCE_ROOT_APPROVAL_BASES = {"user-specified", "data-boundary-derived", "decision-record", "unresolved"}
VALID_SOURCE_INVENTORY_SCOPES = {
    "tracked-files",
    "visible-files",
    "extension-summary",
    "source-class-summary",
    "mixed",
}
VALID_SOURCE_INVENTORY_OPERATIONS = {"read-planning only", "metadata-only read-planning"}
VALID_SOURCE_INVENTORY_TOOLS = {"git", "ripgrep", "PowerShell", "approved-custom-glue"}
VALID_BOUNDARY_RESULTS = {"PASS", "CONCERNS", "FAIL", "WAIVED"}
REQUIRED_SOURCE_PACKET_FIELDS = {
    "source_packet_id",
    "title",
    "source_class",
    "source_location_or_description",
    "source_owner_or_provider",
    "approval_basis",
    "source_support_level",
    "permitted_processing_boundary",
    "permitted_storage_boundary",
    "downstream_allowed_use",
    "source_operation",
    "uncertainty",
    "forbidden_content_check",
    "created_at",
    "created_by",
}
REQUIRED_SOURCE_PACKET_TEXT_FIELDS = {
    "source_packet_id",
    "title",
    "source_location_or_description",
    "created_at",
    "created_by",
}
VALID_DOWNSTREAM_ALLOWED_USES = {
    "planning",
    "draft-generation",
    "validation",
    "fixture-test",
    "decision-support",
    "blocked",
}
BOUNDARY_FALSE_FLAGS = {
    "source_contents_copied",
    "source_mutation_performed",
    "external_send_performed",
    "github_or_remote_operation_performed",
    "customer_or_production_data_included",
    "credential_or_account_security_material_included",
}
DEFAULT_APPROVED_STORAGE_ROOT = Path("_bmad/memory/knx/runtime").resolve()

SECRET_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"api[_-]?key\s*[:=]",
        r"secret\s*[:=]",
        r"token\s*[:=]",
        r"password\s*[:=]",
        r"BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY",
        r"AKIA[0-9A-Z]{16}",
    )
]


@dataclass
class Finding:
    severity: str
    code: str
    message: str
    fixture_type: str | None = None
    artifact_id: str | None = None


def is_negative_fixture(fixture_type: str) -> bool:
    return fixture_type.endswith("-negative")


def simple_yaml_value(text: str, key: str) -> str | None:
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*:\s*(.*?)\s*$", re.MULTILINE)
    match = pattern.search(text)
    if not match:
        return None
    value = match.group(1).strip()
    if not value:
        return None
    if (value.startswith("'") and value.endswith("'")) or (value.startswith('"') and value.endswith('"')):
        value = value[1:-1]
    return value or None


def load_approved_storage_root(
    explicit_storage_root: str | None = None,
    config_user_path: Path = Path("_bmad/config.user.yaml"),
    config_path: Path = Path("_bmad/config.yaml"),
) -> Path:
    if explicit_storage_root:
        return Path(explicit_storage_root).resolve()

    for path in (config_user_path, config_path):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        value = simple_yaml_value(text, "knx_storage_root")
        if value:
            return Path(value).resolve()

    return DEFAULT_APPROVED_STORAGE_ROOT


def is_under_path(path_value: str, root: Path) -> bool:
    try:
        candidate = Path(path_value).resolve()
    except OSError:
        return False
    return candidate == root or root in candidate.parents


def add_finding(
    findings: list[Finding],
    severity: str,
    code: str,
    message: str,
    fixture: dict[str, Any] | None = None,
) -> None:
    fixture_type = None
    artifact_id = None
    if fixture:
        fixture_type = fixture.get("fixture_type")
        artifact_ids = fixture.get("artifact_ids")
        if isinstance(artifact_ids, list) and artifact_ids:
            artifact_id = str(artifact_ids[0])
    findings.append(Finding(severity, code, message, fixture_type, artifact_id))


def load_fixture_pack(path: Path) -> tuple[dict[str, Any] | None, list[Finding]]:
    findings: list[Finding] = []
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        add_finding(findings, "error", "input-unreadable", f"Cannot read input: {exc}")
        return None, findings

    for pattern in SECRET_PATTERNS:
        if pattern.search(raw):
            add_finding(
                findings,
                "error",
                "secret-pattern-match",
                f"Input text matched forbidden content pattern: {pattern.pattern}",
            )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        add_finding(findings, "error", "json-parse-failed", f"Invalid JSON: {exc}")
        return None, findings

    if not isinstance(data, dict):
        add_finding(findings, "error", "top-level-not-object", "Fixture pack must be a JSON object")
        return None, findings

    return data, findings


def load_json_object(path: Path) -> tuple[dict[str, Any] | None, list[Finding]]:
    findings: list[Finding] = []
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        add_finding(findings, "error", "input-unreadable", f"Cannot read input: {exc}")
        return None, findings

    for pattern in SECRET_PATTERNS:
        if pattern.search(raw):
            add_finding(
                findings,
                "error",
                "secret-pattern-match",
                f"Input text matched forbidden content pattern: {pattern.pattern}",
            )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        add_finding(findings, "error", "json-parse-failed", f"Invalid JSON: {exc}")
        return None, findings

    if not isinstance(data, dict):
        add_finding(findings, "error", "top-level-not-object", "Input must be a JSON object")
        return None, findings

    return data, findings


def validate_pack_shape(pack: dict[str, Any], findings: list[Finding]) -> list[dict[str, Any]]:
    for field in ("fixture_pack_id", "title", "synthetic_only_statement", "created_at", "fixtures"):
        if field not in pack:
            add_finding(findings, "error", "missing-pack-field", f"Missing top-level field: {field}")

    synthetic_statement = pack.get("synthetic_only_statement")
    if isinstance(synthetic_statement, str) and "synthetic" not in synthetic_statement.lower():
        add_finding(findings, "error", "pack-synthetic-statement-invalid", "Fixture pack must state it is synthetic")

    fixtures = pack.get("fixtures")
    if not isinstance(fixtures, list):
        add_finding(findings, "error", "fixtures-not-list", "Top-level fixtures field must be a list")
        return []

    fixture_types = {
        fixture.get("fixture_type")
        for fixture in fixtures
        if isinstance(fixture, dict) and isinstance(fixture.get("fixture_type"), str)
    }
    missing_types = sorted(REQUIRED_FIXTURE_TYPES - fixture_types)
    for fixture_type in missing_types:
        add_finding(
            findings,
            "error",
            "missing-required-fixture-type",
            f"Missing required fixture type: {fixture_type}",
        )

    extra_types = sorted(fixture_types - REQUIRED_FIXTURE_TYPES)
    for fixture_type in extra_types:
        add_finding(
            findings,
            "warning",
            "unknown-fixture-type",
            f"Fixture type is not in the current required set: {fixture_type}",
        )

    return [fixture for fixture in fixtures if isinstance(fixture, dict)]


def validate_common_fixture_fields(fixture: dict[str, Any], findings: list[Finding]) -> None:
    for field in (
        "fixture_type",
        "synthetic_only_statement",
        "artifact_ids",
        "expected_validation_result",
        "expected_failed_rules",
        "forbidden_content_check",
        "created_at",
        "artifact",
    ):
        if field not in fixture:
            add_finding(findings, "error", "missing-fixture-field", f"Missing fixture field: {field}", fixture)

    fixture_type = fixture.get("fixture_type")
    if not isinstance(fixture_type, str):
        add_finding(findings, "error", "fixture-type-invalid", "fixture_type must be a string", fixture)
        return

    synthetic_statement = fixture.get("synthetic_only_statement")
    if not synthetic_statement:
        add_finding(findings, "error", "synthetic-statement-missing", "Fixture must state it is synthetic", fixture)
    elif "synthetic" not in str(synthetic_statement).lower():
        add_finding(findings, "error", "synthetic-statement-invalid", "Fixture synthetic statement must mention synthetic", fixture)

    artifact_ids = fixture.get("artifact_ids")
    if not isinstance(artifact_ids, list) or not artifact_ids:
        add_finding(findings, "error", "artifact-ids-invalid", "artifact_ids must be a non-empty list", fixture)

    result = fixture.get("expected_validation_result")
    if result not in VALID_RESULTS:
        add_finding(findings, "error", "expected-result-invalid", "Invalid expected_validation_result", fixture)

    failed_rules = fixture.get("expected_failed_rules")
    if not isinstance(failed_rules, list):
        add_finding(findings, "error", "expected-failed-rules-invalid", "expected_failed_rules must be a list", fixture)
    elif is_negative_fixture(fixture_type) and not failed_rules:
        add_finding(findings, "error", "negative-missing-failed-rules", "Negative fixtures need expected failed rules", fixture)

    forbidden_check = fixture.get("forbidden_content_check")
    if forbidden_check not in VALID_FORBIDDEN_CONTENT_CHECKS:
        add_finding(findings, "error", "forbidden-content-check-invalid", "Invalid forbidden_content_check", fixture)
    elif forbidden_check != "pass":
        add_finding(findings, "warning", "forbidden-content-check-not-pass", "Fixture forbidden content check is not pass", fixture)

    if not isinstance(fixture.get("artifact"), dict):
        add_finding(findings, "error", "artifact-not-object", "artifact must be a JSON object", fixture)


def validate_source_packet(fixture: dict[str, Any], findings: list[Finding]) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict):
        return

    fixture_type = fixture.get("fixture_type")
    if "source_packet_id" not in artifact and fixture_type not in {
        "valid-source-packet",
        "source-mutation-without-approval-negative",
    }:
        return

    for field in (
        "source_packet_id",
        "title",
        "source_class",
        "source_location_or_description",
        "source_owner_or_provider",
        "approval_basis",
        "source_support_level",
        "permitted_processing_boundary",
        "permitted_storage_boundary",
        "downstream_allowed_use",
        "source_operation",
        "uncertainty",
        "forbidden_content_check",
        "created_at",
        "created_by",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-source-packet-field", f"Missing source packet field: {field}", fixture)

    source_operation = artifact.get("source_operation")
    expected_result = fixture.get("expected_validation_result")

    for field in sorted(REQUIRED_SOURCE_PACKET_TEXT_FIELDS):
        if field in artifact and not str(artifact.get(field, "")).strip():
            add_finding(findings, "error", "fixture-source-packet-text-field-empty", f"Source packet text field must be non-empty: {field}", fixture)

    if artifact.get("source_class") not in VALID_FIXTURE_SOURCE_PACKET_CLASSES:
        add_finding(findings, "error", "fixture-source-packet-class-invalid", "Invalid source packet source_class", fixture)
    if artifact.get("source_owner_or_provider") not in VALID_SOURCE_OWNERS:
        add_finding(findings, "error", "fixture-source-packet-owner-invalid", "Invalid source packet owner/provider", fixture)
    if artifact.get("approval_basis") not in VALID_APPROVAL_BASES:
        add_finding(findings, "error", "fixture-source-packet-approval-basis-invalid", "Invalid source packet approval_basis", fixture)
    if artifact.get("source_support_level") not in VALID_SOURCE_SUPPORT_LEVELS:
        add_finding(findings, "error", "fixture-source-packet-support-level-invalid", "Invalid source packet source_support_level", fixture)
    if artifact.get("permitted_processing_boundary") not in VALID_PROCESSING_BOUNDARIES:
        add_finding(findings, "error", "fixture-source-packet-processing-boundary-invalid", "Invalid permitted_processing_boundary", fixture)
    if artifact.get("permitted_storage_boundary") not in VALID_STORAGE_BOUNDARIES:
        add_finding(findings, "error", "fixture-source-packet-storage-boundary-invalid", "Invalid permitted_storage_boundary", fixture)
    if artifact.get("downstream_allowed_use") not in VALID_DOWNSTREAM_ALLOWED_USES:
        add_finding(findings, "error", "fixture-source-packet-downstream-use-invalid", "Invalid downstream_allowed_use", fixture)
    if source_operation not in VALID_SOURCE_OPERATIONS:
        add_finding(findings, "error", "fixture-source-packet-operation-invalid", "Invalid source_operation", fixture)
    if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
        add_finding(findings, "error", "fixture-source-packet-uncertainty-invalid", "Invalid source packet uncertainty", fixture)
    if artifact.get("forbidden_content_check") not in VALID_FORBIDDEN_CONTENT_CHECKS:
        add_finding(findings, "error", "fixture-source-packet-forbidden-content-invalid", "Invalid forbidden_content_check", fixture)

    if fixture_type == "valid-source-packet" and source_operation != "read-planning":
        add_finding(findings, "error", "valid-source-operation-not-read-planning", "Valid source packet must use read-planning", fixture)

    if fixture_type == "source-mutation-without-approval-negative":
        if source_operation != "mutation-requested":
            add_finding(findings, "error", "mutation-negative-operation-invalid", "Mutation negative must request mutation", fixture)
        if expected_result != "FAIL":
            add_finding(findings, "error", "mutation-negative-result-invalid", "Mutation negative must expect FAIL", fixture)


def validate_output_metadata(fixture: dict[str, Any], findings: list[Finding], approved_storage_root: Path) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict):
        return

    if "output_artifact_id" in artifact:
        for field in (
            "output_type",
            "source_packet_ids",
            "work_trace_id",
            "validation_evidence_ids",
            "decision_record_ids",
            "generation_boundary",
            "storage_location",
            "storage_boundary_basis",
            "source_support_summary",
            "uncertainty",
            "result_status",
            "created_at",
        ):
            if field not in artifact:
                add_finding(findings, "error", "missing-output-field", f"Missing output metadata field: {field}", fixture)

        if artifact.get("output_type") not in VALID_OUTPUT_TYPES:
            add_finding(findings, "error", "output-type-invalid", "Invalid output_type", fixture)
        for field in sorted(REQUIRED_OUTPUT_TEXT_FIELDS):
            if field in artifact and not str(artifact.get(field, "")).strip():
                add_finding(findings, "error", "output-text-field-empty", f"Output metadata text field must be non-empty: {field}", fixture)
        if not isinstance(artifact.get("source_packet_ids"), list):
            add_finding(findings, "error", "output-source-packet-ids-invalid", "source_packet_ids must be a list", fixture)
        if not artifact.get("work_trace_id"):
            add_finding(findings, "error", "output-work-trace-missing", "Output metadata must link to a work trace", fixture)
        if not isinstance(artifact.get("validation_evidence_ids"), list) or not artifact.get("validation_evidence_ids"):
            add_finding(
                findings,
                "error",
                "output-validation-evidence-ids-invalid",
                "validation_evidence_ids must be a non-empty list",
                fixture,
            )
        if not isinstance(artifact.get("decision_record_ids"), list):
            add_finding(findings, "error", "output-decision-record-ids-invalid", "decision_record_ids must be a list", fixture)
        if artifact.get("generation_boundary") not in VALID_GENERATION_BOUNDARIES:
            add_finding(findings, "error", "output-generation-boundary-invalid", "Invalid generation_boundary", fixture)
        if artifact.get("storage_boundary_basis") not in VALID_STORAGE_BOUNDARY_BASES:
            add_finding(findings, "error", "output-storage-boundary-basis-invalid", "Invalid storage_boundary_basis", fixture)
        if artifact.get("source_support_summary") not in VALID_SOURCE_SUPPORT_SUMMARIES:
            add_finding(findings, "error", "output-source-support-summary-invalid", "Invalid source_support_summary", fixture)
        if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
            add_finding(findings, "error", "output-uncertainty-invalid", "Invalid output uncertainty", fixture)
        if artifact.get("result_status") not in VALID_OUTPUT_STATUSES:
            add_finding(findings, "error", "output-result-status-invalid", "Invalid result_status", fixture)

    fixture_type = fixture.get("fixture_type")
    source_packet_ids = artifact.get("source_packet_ids")
    if fixture_type == "missing-source-negative":
        if source_packet_ids != []:
            add_finding(findings, "error", "missing-source-negative-has-source", "Missing-source negative must have no source packets", fixture)
        if fixture.get("expected_validation_result") != "FAIL":
            add_finding(findings, "error", "missing-source-negative-result-invalid", "Missing-source negative must expect FAIL", fixture)

    if fixture_type == "forbidden-destination-negative":
        storage_location = artifact.get("storage_location")
        if not isinstance(storage_location, str) or is_under_path(storage_location, approved_storage_root):
            add_finding(findings, "error", "forbidden-destination-not-outside-root", "Forbidden destination negative must point outside approved storage", fixture)

    if fixture_type == "unsupported-inference-negative":
        if artifact.get("source_support_summary") not in {"inferred", "unsupported"}:
            add_finding(findings, "error", "unsupported-inference-summary-invalid", "Unsupported inference negative must be inferred or unsupported", fixture)


def validate_work_trace(fixture: dict[str, Any], findings: list[Finding]) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict):
        return

    if "work_trace_id" in artifact and "output_artifact_id" not in artifact:
        for field in (
            "trigger",
            "source_packet_ids",
            "generated_artifact_ids",
            "validation_evidence_ids",
            "decision_record_ids",
            "steps_taken",
            "tools_used",
            "execution_layer",
            "assumptions",
            "uncertainty",
            "residual_risk",
            "next_action",
            "created_at",
        ):
            if field not in artifact:
                add_finding(findings, "error", "missing-work-trace-field", f"Missing work trace field: {field}", fixture)

        if artifact.get("trigger") not in VALID_WORK_TRACE_TRIGGERS:
            add_finding(findings, "error", "work-trace-trigger-invalid", "Invalid work trace trigger", fixture)
        for field in ("source_packet_ids", "generated_artifact_ids", "validation_evidence_ids", "decision_record_ids"):
            if not isinstance(artifact.get(field), list):
                add_finding(findings, "error", "work-trace-list-field-invalid", f"{field} must be a list", fixture)
        for field in ("steps_taken", "tools_used", "assumptions"):
            if not isinstance(artifact.get(field), list):
                add_finding(findings, "error", "work-trace-list-field-invalid", f"{field} must be a list", fixture)
        execution_layer = artifact.get("execution_layer")
        if not isinstance(execution_layer, int) or not 1 <= execution_layer <= 5:
            add_finding(findings, "error", "work-trace-layer-invalid", "execution_layer must be an integer from 1 through 5", fixture)
        if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
            add_finding(findings, "error", "work-trace-uncertainty-invalid", "Invalid work trace uncertainty", fixture)
        if artifact.get("residual_risk") not in VALID_RESIDUAL_RISK:
            add_finding(findings, "error", "work-trace-residual-risk-invalid", "Invalid work trace residual_risk", fixture)
        if artifact.get("next_action") not in VALID_WORK_TRACE_NEXT_ACTIONS:
            add_finding(findings, "error", "work-trace-next-action-invalid", "Invalid work trace next_action", fixture)

    if fixture.get("fixture_type") != "external-action-negative":
        return

    if artifact.get("execution_layer") != 5:
        add_finding(findings, "error", "external-action-layer-invalid", "External action negative must use execution layer 5", fixture)
    if artifact.get("next_action") != "block":
        add_finding(findings, "error", "external-action-next-action-invalid", "External action negative must block", fixture)
    if fixture.get("expected_validation_result") != "FAIL":
        add_finding(findings, "error", "external-action-result-invalid", "External action negative must expect FAIL", fixture)


def validate_validation_evidence(fixture: dict[str, Any], findings: list[Finding]) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict):
        return

    if "validation_evidence_id" in artifact:
        for field in (
            "artifact_under_validation",
            "validation_type",
            "result",
            "failed_rules",
            "risk_score",
            "blocking_status",
            "evidence_references",
            "command_or_check_run",
            "waiver_id",
            "waiver_reason",
            "reviewer",
            "created_at",
        ):
            if field not in artifact:
                add_finding(findings, "error", "missing-validation-evidence-field", f"Missing validation evidence field: {field}", fixture)

        if artifact.get("artifact_under_validation") not in VALID_ARTIFACT_UNDER_VALIDATION:
            add_finding(findings, "error", "artifact-under-validation-invalid", "Invalid artifact_under_validation", fixture)
        if artifact.get("validation_type") not in VALID_VALIDATION_TYPES:
            add_finding(findings, "error", "validation-type-invalid", "Invalid validation_type", fixture)
        if artifact.get("result") not in VALID_RESULTS:
            add_finding(findings, "error", "validation-result-invalid", "Invalid validation result", fixture)
        if not isinstance(artifact.get("failed_rules"), list):
            add_finding(findings, "error", "validation-failed-rules-invalid", "failed_rules must be a list", fixture)
        if artifact.get("blocking_status") not in VALID_BLOCKING_STATUS:
            add_finding(findings, "error", "blocking-status-invalid", "Invalid blocking_status", fixture)
        if not isinstance(artifact.get("evidence_references"), list) or not artifact.get("evidence_references"):
            add_finding(
                findings,
                "error",
                "validation-evidence-references-invalid",
                "evidence_references must be a non-empty list",
                fixture,
            )
        if artifact.get("result") == "WAIVED" and not artifact.get("waiver_reason"):
            add_finding(findings, "error", "waiver-reason-missing", "WAIVED validation needs waiver_reason", fixture)

    if "risk_score" in artifact:
        risk_score = artifact.get("risk_score")
        if not isinstance(risk_score, int) or not 0 <= risk_score <= 9:
            add_finding(findings, "error", "risk-score-invalid", "risk_score must be an integer from 0 through 9", fixture)
        elif risk_score == 9 and artifact.get("blocking_status") not in {"blocking", "waived-blocking"}:
            add_finding(findings, "error", "risk-nine-not-blocking", "risk_score 9 must be blocking or waived-blocking", fixture)
        elif risk_score == 9 and artifact.get("blocking_status") == "waived-blocking" and artifact.get("waiver_id") in {None, "", "none"}:
            add_finding(findings, "error", "risk-nine-waiver-missing", "waived risk_score 9 needs a waiver_id", fixture)


def validate_user_input_required(fixture: dict[str, Any], findings: list[Finding]) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict) or "user_input_required_id" not in artifact:
        return

    for field in (
        "decision_needed",
        "why_automation_cannot_proceed",
        "source_references",
        "blocked_downstream_work",
        "risk_if_guessed",
        "status",
        "created_at",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-user-input-field", f"Missing user-input-required field: {field}", fixture)

    if not artifact.get("decision_needed"):
        add_finding(findings, "error", "user-input-decision-missing", "decision_needed is required", fixture)
    if artifact.get("why_automation_cannot_proceed") not in VALID_USER_INPUT_REASONS:
        add_finding(findings, "error", "user-input-reason-invalid", "Invalid why_automation_cannot_proceed", fixture)
    if not isinstance(artifact.get("source_references"), list):
        add_finding(findings, "error", "user-input-source-references-invalid", "source_references must be a list", fixture)
    if not isinstance(artifact.get("blocked_downstream_work"), list) or not artifact.get("blocked_downstream_work"):
        add_finding(
            findings,
            "error",
            "user-input-blocked-work-invalid",
            "blocked_downstream_work must be a non-empty list",
            fixture,
        )
    if artifact.get("risk_if_guessed") not in {"low", "medium", "high", "blocking"}:
        add_finding(findings, "error", "user-input-risk-invalid", "Invalid risk_if_guessed", fixture)
    if artifact.get("status") not in VALID_USER_INPUT_STATUS:
        add_finding(findings, "error", "user-input-status-invalid", "Invalid user-input status", fixture)


def validate_source_inventory(fixture: dict[str, Any], findings: list[Finding], approved_storage_root: Path) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict):
        return

    if "source_inventory_id" not in artifact:
        return

    for field in (
        "source_root",
        "source_root_approval_basis",
        "inventory_scope",
        "allowed_operation",
        "inventory_tool",
        "generated_artifact_path",
        "boundary_check_result",
        "source_mutation_performed",
        "external_send_performed",
        "uncertainty",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-source-inventory-field", f"Missing source inventory field: {field}", fixture)

    if artifact.get("source_mutation_performed") is not False:
        add_finding(findings, "error", "source-inventory-mutated-source", "Source inventory must not mutate source", fixture)
    if artifact.get("external_send_performed") is not False:
        add_finding(findings, "error", "source-inventory-external-send", "Source inventory must not send externally", fixture)
    if artifact.get("source_root_approval_basis") not in VALID_SOURCE_ROOT_APPROVAL_BASES:
        add_finding(findings, "error", "source-inventory-approval-basis-invalid", "Invalid source_root_approval_basis", fixture)
    if artifact.get("inventory_scope") not in VALID_SOURCE_INVENTORY_SCOPES:
        add_finding(findings, "error", "source-inventory-scope-invalid", "Invalid inventory_scope", fixture)
    if artifact.get("allowed_operation") not in VALID_SOURCE_INVENTORY_OPERATIONS:
        add_finding(findings, "error", "source-inventory-operation-invalid", "Invalid allowed_operation", fixture)
    if artifact.get("inventory_tool") not in VALID_SOURCE_INVENTORY_TOOLS:
        add_finding(findings, "error", "source-inventory-tool-invalid", "Invalid inventory_tool", fixture)
    if artifact.get("boundary_check_result") not in VALID_BOUNDARY_RESULTS:
        add_finding(findings, "error", "source-inventory-boundary-result-invalid", "Invalid boundary_check_result", fixture)
    if artifact.get("forbidden_content_check") not in VALID_FORBIDDEN_CONTENT_CHECKS:
        add_finding(findings, "error", "source-inventory-forbidden-content-invalid", "Invalid forbidden_content_check", fixture)
    if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
        add_finding(findings, "error", "source-inventory-uncertainty-invalid", "Invalid source inventory uncertainty", fixture)
    if "file_count" in artifact and (not isinstance(artifact.get("file_count"), int) or artifact.get("file_count") < 0):
        add_finding(findings, "error", "source-inventory-file-count-invalid", "file_count must be a nonnegative integer", fixture)

    generated_path = artifact.get("generated_artifact_path")
    fixture_type = fixture.get("fixture_type")
    if isinstance(generated_path, str):
        under_root = is_under_path(generated_path, approved_storage_root)
        if fixture_type == "source-inventory-outside-approved-storage-negative":
            if under_root:
                add_finding(findings, "error", "inventory-negative-inside-approved-root", "Storage-boundary negative must point outside approved root", fixture)
            if artifact.get("boundary_check_result") != "FAIL":
                add_finding(findings, "error", "inventory-negative-boundary-result-invalid", "Storage-boundary negative must have boundary_check_result FAIL", fixture)
            if fixture.get("expected_validation_result") != "FAIL":
                add_finding(findings, "error", "inventory-negative-result-invalid", "Storage-boundary negative must expect FAIL", fixture)
        elif generated_path != "not-materialized" and not under_root:
            add_finding(findings, "error", "inventory-output-outside-approved-root", "Materialized source inventory must write under approved storage root", fixture)


def validate_expected_evidence_ids(fixtures: list[dict[str, Any]], findings: list[Finding]) -> None:
    materialized_validation_ids = set()
    referenced_negative_ids = set()

    for fixture in fixtures:
        artifact = fixture.get("artifact", {})
        if not isinstance(artifact, dict):
            continue
        validation_id = artifact.get("validation_evidence_id")
        if isinstance(validation_id, str):
            materialized_validation_ids.add(validation_id)
        for value in artifact.get("validation_evidence_ids", []) if isinstance(artifact.get("validation_evidence_ids"), list) else []:
            if isinstance(value, str) and "neg" in value:
                referenced_negative_ids.add(value)

    for evidence_id in sorted(referenced_negative_ids - materialized_validation_ids):
        add_finding(
            findings,
            "warning",
            "negative-validation-evidence-expected-output",
            f"Negative validation evidence ID is an expected-output reference, not a standalone record: {evidence_id}",
        )


def validate_fixture_pack(path: Path, approved_storage_root: Path | None = None) -> dict[str, Any]:
    if approved_storage_root is None:
        approved_storage_root = load_approved_storage_root()

    pack, findings = load_fixture_pack(path)
    if pack is None:
        return build_result(path, findings, 0, approved_storage_root)

    fixtures = validate_pack_shape(pack, findings)
    for fixture in fixtures:
        validate_common_fixture_fields(fixture, findings)
        validate_source_packet(fixture, findings)
        validate_output_metadata(fixture, findings, approved_storage_root)
        validate_work_trace(fixture, findings)
        validate_validation_evidence(fixture, findings)
        validate_user_input_required(fixture, findings)
        validate_source_inventory(fixture, findings, approved_storage_root)
    validate_expected_evidence_ids(fixtures, findings)

    return build_result(path, findings, len(fixtures), approved_storage_root)


def validate_source_packet_examples(path: Path, approved_storage_root: Path | None = None) -> dict[str, Any]:
    if approved_storage_root is None:
        approved_storage_root = load_approved_storage_root()

    examples, findings = load_json_object(path)
    if examples is None:
        return build_source_packet_examples_result(path, findings, 0, approved_storage_root)

    for field in ("source_packet_example_set_id", "title", "created_at", "packets"):
        if field not in examples:
            add_finding(findings, "error", "missing-example-set-field", f"Missing top-level field: {field}")

    for flag in BOUNDARY_FALSE_FLAGS:
        if examples.get(flag) is not False:
            add_finding(findings, "error", "boundary-flag-not-false", f"Boundary flag must be false: {flag}")

    packets = examples.get("packets")
    if not isinstance(packets, list):
        add_finding(findings, "error", "packets-not-list", "Top-level packets field must be a list")
        packets = []

    for packet in packets:
        if not isinstance(packet, dict):
            add_finding(findings, "error", "source-packet-not-object", "Each source packet example must be an object")
            continue
        validate_source_packet_example(packet, findings)

    return build_source_packet_examples_result(path, findings, len(packets), approved_storage_root)


def validate_source_packet_example(packet: dict[str, Any], findings: list[Finding]) -> None:
    packet_id = packet.get("source_packet_id")
    for field in sorted(REQUIRED_SOURCE_PACKET_FIELDS):
        if field not in packet:
            findings.append(
                Finding(
                    "error",
                    "missing-source-packet-field",
                    f"Missing source packet field: {field}",
                    artifact_id=str(packet_id) if packet_id else None,
                )
            )

    for field in sorted(REQUIRED_SOURCE_PACKET_TEXT_FIELDS):
        if field in packet and not str(packet.get(field, "")).strip():
            findings.append(
                Finding(
                    "error",
                    "source-packet-text-field-empty",
                    f"Source packet text field must be non-empty: {field}",
                    artifact_id=str(packet_id) if packet_id else None,
                )
            )

    if packet.get("source_class") not in VALID_SOURCE_PACKET_CLASSES:
        findings.append(
            Finding(
                "error",
                "source-packet-class-not-approved",
                "Source packet class is not one of the approved first classes",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("source_owner_or_provider") not in VALID_SOURCE_OWNERS:
        findings.append(
            Finding(
                "error",
                "source-packet-owner-invalid",
                "Source packet owner/provider is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("approval_basis") not in VALID_APPROVAL_BASES:
        findings.append(
            Finding(
                "error",
                "source-packet-approval-basis-invalid",
                "Source packet approval_basis is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("source_support_level") not in VALID_SOURCE_SUPPORT_LEVELS:
        findings.append(
            Finding(
                "error",
                "source-packet-support-level-invalid",
                "Source packet source_support_level is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("permitted_processing_boundary") not in VALID_PROCESSING_BOUNDARIES:
        findings.append(
            Finding(
                "error",
                "source-packet-processing-boundary-invalid",
                "Source packet permitted_processing_boundary is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("permitted_storage_boundary") not in VALID_STORAGE_BOUNDARIES:
        findings.append(
            Finding(
                "error",
                "source-packet-storage-boundary-invalid",
                "Source packet permitted_storage_boundary is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("source_operation") not in VALID_SOURCE_OPERATIONS:
        findings.append(
            Finding(
                "error",
                "source-packet-operation-invalid",
                "Source packet source_operation is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )
    elif packet.get("source_operation") != "read-planning":
        findings.append(
            Finding(
                "error",
                "source-packet-operation-not-read-planning",
                "Source packet examples must remain read-planning only",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("uncertainty") not in VALID_UNCERTAINTY:
        findings.append(
            Finding(
                "error",
                "source-packet-uncertainty-invalid",
                "Source packet uncertainty is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("forbidden_content_check") != "pass":
        findings.append(
            Finding(
                "error",
                "source-packet-forbidden-content-not-pass",
                "Source packet examples must pass forbidden content checks",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    if packet.get("downstream_allowed_use") not in VALID_DOWNSTREAM_ALLOWED_USES:
        findings.append(
            Finding(
                "error",
                "source-packet-downstream-use-invalid",
                "Source packet downstream_allowed_use is invalid",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    for content_field in ("source_content", "source_contents", "content", "excerpt"):
        if content_field in packet:
            findings.append(
                Finding(
                    "error",
                    "source-packet-copies-content",
                    f"Metadata-only source packet examples must not include {content_field}",
                    artifact_id=str(packet_id) if packet_id else None,
                )
            )


def build_result(path: Path, findings: list[Finding], fixture_count: int, approved_storage_root: Path) -> dict[str, Any]:
    error_count = sum(1 for finding in findings if finding.severity == "error")
    warning_count = sum(1 for finding in findings if finding.severity == "warning")
    if error_count:
        status = "FAIL"
    elif warning_count:
        status = "CONCERNS"
    else:
        status = "PASS"

    return {
        "validator": "knx-source-evidence-stdlib",
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "input_path": str(path),
        "approved_storage_root": str(approved_storage_root),
        "status": status,
        "summary": {
            "fixture_count": fixture_count,
            "errors": error_count,
            "warnings": warning_count,
            "findings": len(findings),
        },
        "findings": [asdict(finding) for finding in findings],
    }


def build_source_packet_examples_result(
    path: Path,
    findings: list[Finding],
    packet_count: int,
    approved_storage_root: Path,
) -> dict[str, Any]:
    error_count = sum(1 for finding in findings if finding.severity == "error")
    warning_count = sum(1 for finding in findings if finding.severity == "warning")
    if error_count:
        status = "FAIL"
    elif warning_count:
        status = "CONCERNS"
    else:
        status = "PASS"

    return {
        "validator": "knx-source-evidence-stdlib",
        "validation_target": "source-packet-examples",
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "input_path": str(path),
        "approved_storage_root": str(approved_storage_root),
        "status": status,
        "summary": {
            "source_packet_count": packet_count,
            "errors": error_count,
            "warnings": warning_count,
            "findings": len(findings),
        },
        "findings": [asdict(finding) for finding in findings],
    }


def write_reports(result: dict[str, Any], output_dir: Path, approved_storage_root: Path) -> tuple[Path, Path]:
    output_dir = output_dir.resolve()
    if not is_under_path(str(output_dir), approved_storage_root):
        raise ValueError(f"Output directory is outside approved storage root: {output_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = "source-evidence-validation"
    json_path = output_dir / f"{stem}.json"
    md_path = output_dir / f"{stem}.md"

    json_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(result), encoding="utf-8")
    return json_path, md_path


def render_markdown(result: dict[str, Any]) -> str:
    summary = result["summary"]
    count_label = "Source packets" if "source_packet_count" in summary else "Fixtures"
    count_value = summary.get("source_packet_count", summary.get("fixture_count", 0))
    lines = [
        "# KNX Source Evidence Validation",
        "",
        f"Created: {result['created_at']}",
        f"Input: `{result['input_path']}`",
        f"Status: {result['status']}",
        "",
        "## Summary",
        "",
        f"- {count_label}: {count_value}",
        f"- Errors: {summary['errors']}",
        f"- Warnings: {summary['warnings']}",
        f"- Findings: {summary['findings']}",
        "",
        "## Findings",
        "",
    ]
    findings = result.get("findings", [])
    if not findings:
        lines.append("No findings.")
    else:
        for finding in findings:
            location = finding.get("fixture_type") or "pack"
            artifact = finding.get("artifact_id")
            suffix = f" / `{artifact}`" if artifact else ""
            lines.append(
                f"- **{finding['severity'].upper()}** `{finding['code']}` ({location}{suffix}): {finding['message']}"
            )
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate KNX source/evidence fixture packs.")
    parser.add_argument(
        "--fixture-pack",
        default="_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json",
        help="Path to the fixture pack JSON.",
    )
    parser.add_argument(
        "--output-dir",
        default="_bmad/memory/knx/runtime/optional-source-evidence-validator/reports",
        help="Directory for JSON and Markdown reports. Must be under approved KNX runtime storage.",
    )
    parser.add_argument(
        "--storage-root",
        default=None,
        help="Approved KNX runtime storage root. Defaults to knx_storage_root from _bmad/config.user.yaml.",
    )
    parser.add_argument("--no-write", action="store_true", help="Validate without writing reports.")
    parser.add_argument(
        "--source-packet-examples",
        default=None,
        help="Validate metadata-only source packet examples JSON instead of the synthetic fixture pack.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    approved_storage_root = load_approved_storage_root(args.storage_root)
    if args.source_packet_examples:
        result = validate_source_packet_examples(Path(args.source_packet_examples), approved_storage_root)
    else:
        result = validate_fixture_pack(Path(args.fixture_pack), approved_storage_root)

    if not args.no_write:
        write_reports(result, Path(args.output_dir), approved_storage_root)

    print(json.dumps(result, indent=2))
    return 1 if result["status"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
