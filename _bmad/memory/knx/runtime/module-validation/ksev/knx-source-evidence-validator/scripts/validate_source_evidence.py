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
    "valid-output-metadata",
    "valid-user-input-required",
    "valid-decision-record",
    "valid-validator-run-evidence",
    "valid-runtime-evidence-inventory",
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
REQUIRED_WORK_TRACE_TEXT_FIELDS = {"work_trace_id", "created_at"}
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
REQUIRED_VALIDATION_TEXT_FIELDS = {
    "validation_evidence_id",
    "command_or_check_run",
    "reviewer",
    "created_at",
}
VALID_BLOCKING_STATUS = {"nonblocking", "blocking", "waived-blocking", "not-applicable"}
VALID_USER_INPUT_REASONS = {"safety", "boundary", "missing approval", "ambiguity", "missing source", "risk"}
VALID_USER_INPUT_STATUS = {"open", "answered", "deferred", "closed"}
REQUIRED_USER_INPUT_TEXT_FIELDS = {"user_input_required_id", "decision_needed", "created_at"}
VALID_DECISION_TYPES = {
    "profile",
    "execution-policy",
    "data-boundary",
    "mature-tool",
    "custom-code",
    "source-evidence-contract",
    "safety-validation",
    "exception",
}
VALID_DECISION_STATUSES = {"accepted", "rejected", "deferred", "blocked", "waived", "superseded"}
VALID_DECISION_APPROVAL_BASES = {
    "user-specified",
    "profile-derived",
    "execution-policy-derived",
    "data-boundary-derived",
    "tool-review-derived",
    "defaulted",
    "unresolved",
}
REQUIRED_DECISION_TEXT_FIELDS = {"decision_record_id", "decision", "rationale", "scope", "created_at"}
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
VALID_RUNTIME_INVENTORY_APPROVAL_BASES = {
    "user-specified",
    "profile-derived",
    "data-boundary-derived",
    "decision-record",
    "unresolved",
}
VALID_RUNTIME_INVENTORY_SCOPES = {
    "runtime-evidence-paths",
    "extension-summary",
    "runtime-evidence-category-summary",
    "mixed",
}
VALID_RUNTIME_INVENTORY_OPERATIONS = {"metadata-only read-planning"}
VALID_RUNTIME_INVENTORY_TOOLS = {"ripgrep", "PowerShell", "approved-custom-glue"}
REQUIRED_SOURCE_INVENTORY_TEXT_FIELDS = {
    "source_inventory_id",
    "source_root",
    "inventory_command_or_check",
    "generated_artifact_path",
    "created_at",
    "created_by",
}
REQUIRED_RUNTIME_INVENTORY_TEXT_FIELDS = {
    "runtime_inventory_id",
    "storage_root",
    "inventory_command_or_check",
    "generated_artifact_path",
    "created_at",
    "created_by",
}
REQUIRED_VALIDATOR_RUN_TEXT_FIELDS = {
    "evidence_bundle_id",
    "title",
    "created_at",
    "created_by",
}
VALIDATOR_RUN_BOUNDARY_FLAGS = {
    "source_mutation_performed",
    "external_send_performed",
    "source_inventory_materialization_performed",
    "package_install_performed",
    "runtime_assistant_behavior_added",
}
REQUIRED_PACK_TEXT_FIELDS = {
    "fixture_pack_id",
    "title",
    "synthetic_only_statement",
    "created_at",
    "created_by",
    "contract_reference",
}
REQUIRED_EXAMPLE_SET_TEXT_FIELDS = {"source_packet_example_set_id", "title", "created_at", "created_by", "status"}
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
VALID_EXAMPLE_SET_STATUSES = {"local-metadata-only-examples"}
BOUNDARY_FALSE_FLAGS = {
    "source_contents_copied",
    "source_mutation_performed",
    "external_send_performed",
    "github_or_remote_operation_performed",
    "package_install_performed",
    "runtime_assistant_behavior_added",
    "customer_or_production_data_included",
    "credential_or_account_security_material_included",
}
REQUIRED_EXCLUDED_SOURCE_CLASSES = {
    "runtime-evidence-inventory-as-source-packet",
    "exported-files-or-attachments",
    "customer-project-data",
    "production-systems",
    "credentials-tokens-mfa-account-security-material",
    "github-remotes",
    "external-providers",
    "local-model-gpu-derived-outputs",
    "source-mutation-records",
    "operational-source-intake",
}
DEFAULT_APPROVED_STORAGE_ROOT = Path("_bmad/memory/knx/runtime").resolve()
KNX_MEMORY_ROOT = Path("_bmad/memory/knx").resolve()

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
ISO_CREATED_AT_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2}|Z)?)?$")


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


def is_iso_created_at(value: Any) -> bool:
    if not isinstance(value, str) or not ISO_CREATED_AT_PATTERN.match(value):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def is_non_empty_string_list(value: Any, require_non_empty: bool = False) -> bool:
    if not isinstance(value, list):
        return False
    if require_non_empty and not value:
        return False
    return all(isinstance(item, str) and bool(item.strip()) for item in value)


def is_source_packet_id_reference(value: str) -> bool:
    return value.startswith(("sp-", "knx-source-packet-"))


def evidence_reference_resolves(
    value: str,
    source_packet_ids: set[str],
    validation_evidence_ids: set[str],
    work_trace_ids: set[str],
    output_artifact_ids: set[str],
    decision_record_ids: set[str],
) -> bool:
    if is_source_packet_id_reference(value):
        return value in source_packet_ids
    if value.startswith("ve-"):
        return value in validation_evidence_ids
    if value.startswith("wt-"):
        return value in work_trace_ids
    if value.startswith("out-"):
        return value in output_artifact_ids
    if value.startswith("dec-"):
        return value in decision_record_ids
    return True


def is_int_not_bool(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def duplicate_strings(values: list[str]) -> list[str]:
    seen = set()
    duplicates = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


def is_count_group_list(value: Any, name_field: str) -> bool:
    if not isinstance(value, list):
        return False
    for item in value:
        if not isinstance(item, dict):
            return False
        if not isinstance(item.get(name_field), str) or not item.get(name_field, "").strip():
            return False
        if not is_int_not_bool(item.get("count")) or item.get("count") < 0:
            return False
    return True


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
    for field in ("fixture_pack_id", "title", "synthetic_only_statement", "created_at", "created_by", "contract_reference", "fixtures"):
        if field not in pack:
            add_finding(findings, "error", "missing-pack-field", f"Missing top-level field: {field}")

    for field in sorted(REQUIRED_PACK_TEXT_FIELDS):
        if field in pack and (
            not isinstance(pack.get(field), str) or not pack.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "pack-text-field-invalid",
                f"Fixture pack text field must be a non-empty string: {field}",
            )
    if "created_at" in pack and not is_iso_created_at(pack.get("created_at")):
        add_finding(findings, "error", "pack-created-at-invalid", "Fixture pack created_at must be an ISO date or datetime")

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

    for index, fixture in enumerate(fixtures):
        if not isinstance(fixture, dict):
            add_finding(findings, "error", "fixture-not-object", f"Fixture entry must be a JSON object at index {index}")

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
    if "created_at" in fixture and not is_iso_created_at(fixture.get("created_at")):
        add_finding(findings, "error", "fixture-created-at-invalid", "Fixture created_at must be an ISO date or datetime", fixture)

    synthetic_statement = fixture.get("synthetic_only_statement")
    if not synthetic_statement:
        add_finding(findings, "error", "synthetic-statement-missing", "Fixture must state it is synthetic", fixture)
    elif not isinstance(synthetic_statement, str) or "synthetic" not in synthetic_statement.lower():
        add_finding(findings, "error", "synthetic-statement-invalid", "Fixture synthetic statement must mention synthetic", fixture)

    artifact_ids = fixture.get("artifact_ids")
    if not is_non_empty_string_list(artifact_ids, require_non_empty=True):
        add_finding(findings, "error", "artifact-ids-invalid", "artifact_ids must be a non-empty string list", fixture)
    else:
        artifact = fixture.get("artifact", {})
        if isinstance(artifact, dict):
            for field in (
                "source_packet_id",
                "output_artifact_id",
                "work_trace_id",
                "validation_evidence_id",
                "user_input_required_id",
                "source_inventory_id",
                "decision_record_id",
                "evidence_bundle_id",
                "runtime_inventory_id",
            ):
                primary_id = artifact.get(field)
                if isinstance(primary_id, str) and primary_id.strip():
                    if primary_id.strip() not in artifact_ids:
                        add_finding(
                            findings,
                            "error",
                            "artifact-id-mismatch",
                            f"artifact_ids must include primary artifact field {field}",
                            fixture,
                        )
                    break

    result = fixture.get("expected_validation_result")
    if result not in VALID_RESULTS:
        add_finding(findings, "error", "expected-result-invalid", "Invalid expected_validation_result", fixture)

    failed_rules = fixture.get("expected_failed_rules")
    if not is_non_empty_string_list(failed_rules):
        add_finding(findings, "error", "expected-failed-rules-invalid", "expected_failed_rules must be a string list", fixture)
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
        if field in artifact and (
            not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "fixture-source-packet-text-field-invalid",
                f"Source packet text field must be a non-empty string: {field}",
                fixture,
            )
    if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
        add_finding(findings, "error", "fixture-source-packet-created-at-invalid", "Source packet created_at must be an ISO date or datetime", fixture)
    if "source_references" in artifact and not is_non_empty_string_list(artifact.get("source_references")):
        add_finding(findings, "error", "fixture-source-packet-source-references-invalid", "source_references must be a string list", fixture)
    if "open_questions" in artifact and not is_non_empty_string_list(artifact.get("open_questions")):
        add_finding(findings, "error", "fixture-source-packet-open-questions-invalid", "open_questions must be a string list", fixture)
    for content_field in ("source_content", "source_contents", "content", "excerpt"):
        if content_field in artifact:
            add_finding(
                findings,
                "error",
                "fixture-source-packet-copies-content",
                f"Metadata-only fixture source packets must not include {content_field}",
                fixture,
            )

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

    fixture_type = fixture.get("fixture_type")
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
            if field in artifact and (
                not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
            ):
                add_finding(
                    findings,
                    "error",
                    "output-text-field-invalid",
                    f"Output metadata text field must be a non-empty string: {field}",
                    fixture,
                )
        if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
            add_finding(findings, "error", "output-created-at-invalid", "Output metadata created_at must be an ISO date or datetime", fixture)
        if not is_non_empty_string_list(artifact.get("source_packet_ids")):
            add_finding(findings, "error", "output-source-packet-ids-invalid", "source_packet_ids must be a string list", fixture)
        elif fixture_type != "missing-source-negative" and not artifact.get("source_packet_ids"):
            add_finding(findings, "error", "output-source-packet-ids-invalid", "source_packet_ids must be non-empty", fixture)
        if not artifact.get("work_trace_id"):
            add_finding(findings, "error", "output-work-trace-missing", "Output metadata must link to a work trace", fixture)
        if not is_non_empty_string_list(artifact.get("validation_evidence_ids"), require_non_empty=True):
            add_finding(
                findings,
                "error",
                "output-validation-evidence-ids-invalid",
                "validation_evidence_ids must be a non-empty string list",
                fixture,
            )
        if not is_non_empty_string_list(artifact.get("decision_record_ids")):
            add_finding(findings, "error", "output-decision-record-ids-invalid", "decision_record_ids must be a string list", fixture)
        if artifact.get("generation_boundary") not in VALID_GENERATION_BOUNDARIES:
            add_finding(findings, "error", "output-generation-boundary-invalid", "Invalid generation_boundary", fixture)
        if artifact.get("storage_boundary_basis") not in VALID_STORAGE_BOUNDARY_BASES:
            add_finding(findings, "error", "output-storage-boundary-basis-invalid", "Invalid storage_boundary_basis", fixture)
        storage_location = artifact.get("storage_location")
        if (
            fixture_type != "forbidden-destination-negative"
            and isinstance(storage_location, str)
            and storage_location.strip()
            and storage_location != "unresolved"
            and not is_under_path(storage_location, approved_storage_root)
            and not is_under_path(storage_location, KNX_MEMORY_ROOT)
        ):
            add_finding(
                findings,
                "error",
                "output-storage-location-outside-approved-root",
                "Output storage_location must stay under approved KNX storage",
                fixture,
            )
        if artifact.get("source_support_summary") not in VALID_SOURCE_SUPPORT_SUMMARIES:
            add_finding(findings, "error", "output-source-support-summary-invalid", "Invalid source_support_summary", fixture)
        if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
            add_finding(findings, "error", "output-uncertainty-invalid", "Invalid output uncertainty", fixture)
        if artifact.get("result_status") not in VALID_OUTPUT_STATUSES:
            add_finding(findings, "error", "output-result-status-invalid", "Invalid result_status", fixture)
        if artifact.get("source_support_summary") in {"inferred", "unsupported"} and artifact.get("result_status") == "validated":
            add_finding(findings, "error", "output-unsupported-result-validated", "Unsupported or inferred output metadata must not be marked validated", fixture)

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
        for field in sorted(REQUIRED_WORK_TRACE_TEXT_FIELDS):
            if field in artifact and (
                not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
            ):
                add_finding(
                    findings,
                    "error",
                    "work-trace-text-field-invalid",
                    f"Work trace text field must be a non-empty string: {field}",
                    fixture,
                )
        if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
            add_finding(findings, "error", "work-trace-created-at-invalid", "Work trace created_at must be an ISO date or datetime", fixture)
        for field in ("source_packet_ids", "generated_artifact_ids", "validation_evidence_ids", "decision_record_ids"):
            if not is_non_empty_string_list(artifact.get(field)):
                add_finding(findings, "error", "work-trace-list-field-invalid", f"{field} must be a string list", fixture)
        for field in ("steps_taken", "tools_used", "assumptions"):
            if not is_non_empty_string_list(artifact.get(field)):
                add_finding(findings, "error", "work-trace-list-field-invalid", f"{field} must be a string list", fixture)
            elif field in {"steps_taken", "tools_used"} and not artifact.get(field):
                add_finding(findings, "error", "work-trace-required-list-empty", f"{field} must be non-empty", fixture)
        execution_layer = artifact.get("execution_layer")
        if not is_int_not_bool(execution_layer) or not 1 <= execution_layer <= 5:
            add_finding(findings, "error", "work-trace-layer-invalid", "execution_layer must be an integer from 1 through 5", fixture)
        if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
            add_finding(findings, "error", "work-trace-uncertainty-invalid", "Invalid work trace uncertainty", fixture)
        if artifact.get("residual_risk") not in VALID_RESIDUAL_RISK:
            add_finding(findings, "error", "work-trace-residual-risk-invalid", "Invalid work trace residual_risk", fixture)
        if artifact.get("next_action") not in VALID_WORK_TRACE_NEXT_ACTIONS:
            add_finding(findings, "error", "work-trace-next-action-invalid", "Invalid work trace next_action", fixture)
        if artifact.get("residual_risk") == "blocking" and artifact.get("next_action") not in {"block", "request-user-input"}:
            add_finding(findings, "error", "work-trace-blocking-risk-next-action-invalid", "Blocking residual_risk must block or request user input", fixture)

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
        if artifact.get("validation_type") == "source-support-check" and artifact.get("artifact_under_validation") not in {"output", "source packet"}:
            add_finding(findings, "error", "source-support-validation-target-invalid", "source-support-check must validate output or source packet artifacts", fixture)
        if artifact.get("validation_type") == "boundary-check" and artifact.get("artifact_under_validation") not in {"output", "source packet", "policy file"}:
            add_finding(findings, "error", "boundary-validation-target-invalid", "boundary-check must validate output, source packet, or policy file artifacts", fixture)
        for field in sorted(REQUIRED_VALIDATION_TEXT_FIELDS):
            if field in artifact and (
                not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
            ):
                add_finding(
                    findings,
                    "error",
                    "validation-text-field-invalid",
                    f"Validation evidence text field must be a non-empty string: {field}",
                    fixture,
                )
        if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
            add_finding(findings, "error", "validation-created-at-invalid", "Validation evidence created_at must be an ISO date or datetime", fixture)
        if artifact.get("result") not in VALID_RESULTS:
            add_finding(findings, "error", "validation-result-invalid", "Invalid validation result", fixture)
        if not is_non_empty_string_list(artifact.get("failed_rules")):
            add_finding(findings, "error", "validation-failed-rules-invalid", "failed_rules must be a string list", fixture)
        if artifact.get("blocking_status") not in VALID_BLOCKING_STATUS:
            add_finding(findings, "error", "blocking-status-invalid", "Invalid blocking_status", fixture)
        if artifact.get("result") == "PASS":
            if isinstance(artifact.get("failed_rules"), list) and artifact.get("failed_rules"):
                add_finding(findings, "error", "validation-pass-has-failed-rules", "PASS validation evidence must not list failed_rules", fixture)
            if artifact.get("blocking_status") not in {"nonblocking", "not-applicable"}:
                add_finding(findings, "error", "validation-pass-blocking-status-invalid", "PASS validation evidence must be nonblocking or not-applicable", fixture)
        if not is_non_empty_string_list(artifact.get("evidence_references"), require_non_empty=True):
            add_finding(
                findings,
                "error",
                "validation-evidence-references-invalid",
                "evidence_references must be a non-empty string list",
                fixture,
            )
        if "waiver_id" in artifact and (
            not isinstance(artifact.get("waiver_id"), str) or not artifact.get("waiver_id", "").strip()
        ):
            add_finding(findings, "error", "waiver-id-invalid", "waiver_id must be a non-empty string", fixture)
        if "waiver_reason" in artifact and not isinstance(artifact.get("waiver_reason"), str):
            add_finding(findings, "error", "waiver-reason-invalid", "waiver_reason must be a string", fixture)
        if artifact.get("result") == "WAIVED" and (
            not isinstance(artifact.get("waiver_reason"), str) or not artifact.get("waiver_reason", "").strip()
        ):
            add_finding(findings, "error", "waiver-reason-missing", "WAIVED validation needs waiver_reason", fixture)

    if "risk_score" in artifact:
        risk_score = artifact.get("risk_score")
        if not is_int_not_bool(risk_score) or not 0 <= risk_score <= 9:
            add_finding(findings, "error", "risk-score-invalid", "risk_score must be an integer from 0 through 9", fixture)
        elif risk_score == 9 and artifact.get("blocking_status") not in {"blocking", "waived-blocking"}:
            add_finding(findings, "error", "risk-nine-not-blocking", "risk_score 9 must be blocking or waived-blocking", fixture)
        elif risk_score == 9 and artifact.get("blocking_status") == "waived-blocking" and (
            not isinstance(artifact.get("waiver_id"), str) or artifact.get("waiver_id", "").strip() in {"", "none"}
        ):
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
    for field in sorted(REQUIRED_USER_INPUT_TEXT_FIELDS):
        if field in artifact and (
            not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "user-input-text-field-invalid",
                f"User-input text field must be a non-empty string: {field}",
                fixture,
            )
    if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
        add_finding(findings, "error", "user-input-created-at-invalid", "User-input created_at must be an ISO date or datetime", fixture)
    if artifact.get("why_automation_cannot_proceed") not in VALID_USER_INPUT_REASONS:
        add_finding(findings, "error", "user-input-reason-invalid", "Invalid why_automation_cannot_proceed", fixture)
    if not is_non_empty_string_list(artifact.get("source_references")):
        add_finding(findings, "error", "user-input-source-references-invalid", "source_references must be a string list", fixture)
    if "allowed_choices" in artifact and not is_non_empty_string_list(artifact.get("allowed_choices")):
        add_finding(findings, "error", "user-input-allowed-choices-invalid", "allowed_choices must be a string list when present", fixture)
    if "due_or_review_condition" in artifact and (
        not isinstance(artifact.get("due_or_review_condition"), str) or not artifact.get("due_or_review_condition", "").strip()
    ):
        add_finding(findings, "error", "user-input-due-condition-invalid", "due_or_review_condition must be a non-empty string when present", fixture)
    if not is_non_empty_string_list(artifact.get("blocked_downstream_work"), require_non_empty=True):
        add_finding(
            findings,
            "error",
            "user-input-blocked-work-invalid",
            "blocked_downstream_work must be a non-empty string list",
            fixture,
        )
    if artifact.get("risk_if_guessed") not in {"low", "medium", "high", "blocking"}:
        add_finding(findings, "error", "user-input-risk-invalid", "Invalid risk_if_guessed", fixture)
    if artifact.get("status") not in VALID_USER_INPUT_STATUS:
        add_finding(findings, "error", "user-input-status-invalid", "Invalid user-input status", fixture)


def validate_decision_record(fixture: dict[str, Any], findings: list[Finding]) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict) or "decision_record_id" not in artifact:
        return

    for field in (
        "decision_type",
        "status",
        "decision",
        "rationale",
        "scope",
        "approval_basis",
        "source_references",
        "risk_score",
        "created_at",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-decision-field", f"Missing decision record field: {field}", fixture)

    for field in sorted(REQUIRED_DECISION_TEXT_FIELDS):
        if field in artifact and (
            not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
        ):
            add_finding(findings, "error", "decision-text-field-invalid", f"Decision text field must be a non-empty string: {field}", fixture)
    if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
        add_finding(findings, "error", "decision-created-at-invalid", "Decision created_at must be an ISO date or datetime", fixture)
    if artifact.get("decision_type") not in VALID_DECISION_TYPES:
        add_finding(findings, "error", "decision-type-invalid", "Invalid decision_type", fixture)
    if artifact.get("status") not in VALID_DECISION_STATUSES:
        add_finding(findings, "error", "decision-status-invalid", "Invalid decision status", fixture)
    if artifact.get("approval_basis") not in VALID_DECISION_APPROVAL_BASES:
        add_finding(findings, "error", "decision-approval-basis-invalid", "Invalid decision approval_basis", fixture)
    if not is_non_empty_string_list(artifact.get("source_references")):
        add_finding(findings, "error", "decision-source-references-invalid", "source_references must be a string list", fixture)
    elif not artifact.get("source_references") and artifact.get("approval_basis") not in {"defaulted", "unresolved"}:
        add_finding(findings, "error", "decision-source-references-missing", "Explicit decision approval needs source references", fixture)
    if "supersedes" in artifact and not is_non_empty_string_list(artifact.get("supersedes")):
        add_finding(findings, "error", "decision-supersedes-invalid", "supersedes must be a string list when present", fixture)
    risk_score = artifact.get("risk_score")
    if not is_int_not_bool(risk_score) or not 0 <= risk_score <= 9:
        add_finding(findings, "error", "decision-risk-score-invalid", "risk_score must be an integer from 0 through 9", fixture)
    elif artifact.get("status") == "accepted" and risk_score >= 7 and artifact.get("approval_basis") in {"defaulted", "unresolved"}:
        add_finding(findings, "error", "decision-high-risk-approval-basis-invalid", "High-risk accepted decisions need an explicit approval basis", fixture)


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
        "inventory_command_or_check",
        "generated_artifact_path",
        "forbidden_content_check",
        "boundary_check_result",
        "source_mutation_performed",
        "external_send_performed",
        "package_install_performed",
        "runtime_assistant_behavior_added",
        "uncertainty",
        "created_at",
        "created_by",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-source-inventory-field", f"Missing source inventory field: {field}", fixture)

    if artifact.get("source_mutation_performed") is not False:
        add_finding(findings, "error", "source-inventory-mutated-source", "Source inventory must not mutate source", fixture)
    if artifact.get("external_send_performed") is not False:
        add_finding(findings, "error", "source-inventory-external-send", "Source inventory must not send externally", fixture)
    if artifact.get("package_install_performed") is not False:
        add_finding(findings, "error", "source-inventory-package-install", "Source inventory must not perform package installs", fixture)
    if artifact.get("runtime_assistant_behavior_added") is not False:
        add_finding(findings, "error", "source-inventory-runtime-behavior", "Source inventory must not add runtime assistant behavior", fixture)
    for field in sorted(REQUIRED_SOURCE_INVENTORY_TEXT_FIELDS):
        if field in artifact and (
            not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "source-inventory-text-field-invalid",
                f"Source inventory text field must be a non-empty string: {field}",
                fixture,
            )
    if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
        add_finding(findings, "error", "source-inventory-created-at-invalid", "Source inventory created_at must be an ISO date or datetime", fixture)
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
    file_count = artifact.get("file_count")
    if "file_count" in artifact and (
        not (is_int_not_bool(file_count) and file_count >= 0) and file_count != "unresolved"
    ):
        add_finding(findings, "error", "source-inventory-file-count-invalid", "file_count must be a nonnegative integer or unresolved", fixture)
    if "excluded_paths_or_patterns" in artifact and not is_non_empty_string_list(artifact.get("excluded_paths_or_patterns")):
        add_finding(findings, "error", "source-inventory-excluded-paths-invalid", "excluded_paths_or_patterns must be a string list", fixture)
    if "top_file_groups" in artifact and not is_count_group_list(artifact.get("top_file_groups"), "extension"):
        add_finding(findings, "error", "source-inventory-top-file-groups-invalid", "top_file_groups must be extension/count objects", fixture)
    if "source_class_groups" in artifact and not is_count_group_list(artifact.get("source_class_groups"), "source_class"):
        add_finding(findings, "error", "source-inventory-source-class-groups-invalid", "source_class_groups must be source_class/count objects", fixture)

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
        elif generated_path != "not-materialized":
            if not under_root:
                add_finding(findings, "error", "inventory-output-outside-approved-root", "Materialized source inventory must write under approved storage root", fixture)
            if not is_non_empty_string_list(artifact.get("validation_evidence_ids"), require_non_empty=True):
                add_finding(findings, "error", "source-inventory-validation-links-invalid", "Materialized source inventory must link validation evidence", fixture)
            if not is_non_empty_string_list(artifact.get("decision_record_ids"), require_non_empty=True):
                add_finding(findings, "error", "source-inventory-decision-links-invalid", "Materialized source inventory must link the approving mature-tool decision", fixture)


def validate_runtime_inventory(fixture: dict[str, Any], findings: list[Finding], approved_storage_root: Path) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict) or "runtime_inventory_id" not in artifact:
        return

    for field in (
        "storage_root",
        "storage_root_approval_basis",
        "inventory_scope",
        "allowed_operation",
        "inventory_tool",
        "inventory_command_or_check",
        "excluded_paths_or_patterns",
        "file_count",
        "generated_artifact_path",
        "forbidden_content_check",
        "boundary_check_result",
        "source_mutation_performed",
        "external_send_performed",
        "package_install_performed",
        "runtime_assistant_behavior_added",
        "uncertainty",
        "created_at",
        "created_by",
        "source_references",
        "open_questions",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-runtime-inventory-field", f"Missing runtime inventory field: {field}", fixture)

    for flag in (
        "source_mutation_performed",
        "external_send_performed",
        "package_install_performed",
        "runtime_assistant_behavior_added",
    ):
        if artifact.get(flag) is not False:
            add_finding(findings, "error", "runtime-inventory-boundary-flag-not-false", f"Runtime inventory boundary flag must be false: {flag}", fixture)

    for field in sorted(REQUIRED_RUNTIME_INVENTORY_TEXT_FIELDS):
        if field in artifact and (
            not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "runtime-inventory-text-field-invalid",
                f"Runtime inventory text field must be a non-empty string: {field}",
                fixture,
            )
    if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
        add_finding(findings, "error", "runtime-inventory-created-at-invalid", "Runtime inventory created_at must be an ISO date or datetime", fixture)
    if artifact.get("storage_root_approval_basis") not in VALID_RUNTIME_INVENTORY_APPROVAL_BASES:
        add_finding(findings, "error", "runtime-inventory-approval-basis-invalid", "Invalid storage_root_approval_basis", fixture)
    if artifact.get("inventory_scope") not in VALID_RUNTIME_INVENTORY_SCOPES:
        add_finding(findings, "error", "runtime-inventory-scope-invalid", "Invalid inventory_scope", fixture)
    if artifact.get("allowed_operation") not in VALID_RUNTIME_INVENTORY_OPERATIONS:
        add_finding(findings, "error", "runtime-inventory-operation-invalid", "Invalid allowed_operation", fixture)
    if artifact.get("inventory_tool") not in VALID_RUNTIME_INVENTORY_TOOLS:
        add_finding(findings, "error", "runtime-inventory-tool-invalid", "Invalid inventory_tool", fixture)
    if artifact.get("boundary_check_result") not in VALID_BOUNDARY_RESULTS:
        add_finding(findings, "error", "runtime-inventory-boundary-result-invalid", "Invalid boundary_check_result", fixture)
    if artifact.get("forbidden_content_check") not in VALID_FORBIDDEN_CONTENT_CHECKS:
        add_finding(findings, "error", "runtime-inventory-forbidden-content-invalid", "Invalid forbidden_content_check", fixture)
    if artifact.get("uncertainty") not in VALID_UNCERTAINTY:
        add_finding(findings, "error", "runtime-inventory-uncertainty-invalid", "Invalid runtime inventory uncertainty", fixture)

    file_count = artifact.get("file_count")
    if not (is_int_not_bool(file_count) and file_count >= 0) and file_count != "unresolved":
        add_finding(findings, "error", "runtime-inventory-file-count-invalid", "file_count must be a nonnegative integer or unresolved", fixture)
    if not is_non_empty_string_list(artifact.get("excluded_paths_or_patterns")):
        add_finding(findings, "error", "runtime-inventory-excluded-paths-invalid", "excluded_paths_or_patterns must be a string list", fixture)
    if "top_file_groups" in artifact and not is_count_group_list(artifact.get("top_file_groups"), "extension"):
        add_finding(findings, "error", "runtime-inventory-top-file-groups-invalid", "top_file_groups must be extension/count objects", fixture)
    if "runtime_evidence_groups" in artifact and not is_count_group_list(artifact.get("runtime_evidence_groups"), "evidence_type"):
        add_finding(findings, "error", "runtime-inventory-evidence-groups-invalid", "runtime_evidence_groups must be evidence_type/count objects", fixture)
    if "checksums" in artifact:
        add_finding(findings, "error", "runtime-inventory-checksums-present", "Runtime inventory checksums remain deferred by default", fixture)
    if not is_non_empty_string_list(artifact.get("source_references")):
        add_finding(findings, "error", "runtime-inventory-source-references-invalid", "source_references must be a string list", fixture)
    if not is_non_empty_string_list(artifact.get("open_questions")):
        add_finding(findings, "error", "runtime-inventory-open-questions-invalid", "open_questions must be a string list", fixture)

    storage_root = artifact.get("storage_root")
    if isinstance(storage_root, str) and storage_root.strip() and not is_under_path(storage_root, approved_storage_root):
        add_finding(findings, "error", "runtime-inventory-storage-root-outside-approved-root", "Runtime inventory storage_root must stay under approved storage root", fixture)
    generated_path = artifact.get("generated_artifact_path")
    if isinstance(generated_path, str) and generated_path != "not-materialized" and not is_under_path(generated_path, approved_storage_root):
        add_finding(findings, "error", "runtime-inventory-output-outside-approved-root", "Materialized runtime inventory must write under approved storage root", fixture)


def validate_validator_run_evidence(fixture: dict[str, Any], findings: list[Finding]) -> None:
    artifact = fixture.get("artifact", {})
    if not isinstance(artifact, dict) or "evidence_bundle_id" not in artifact:
        return

    for field in (
        "title",
        "created_at",
        "created_by",
        "synthetic_only_statement",
        "work_trace",
        "validation_evidence",
        "output_metadata",
        "boundaries",
    ):
        if field not in artifact:
            add_finding(findings, "error", "missing-validator-run-field", f"Missing validator run evidence field: {field}", fixture)

    for field in sorted(REQUIRED_VALIDATOR_RUN_TEXT_FIELDS):
        if field in artifact and (
            not isinstance(artifact.get(field), str) or not artifact.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "validator-run-text-field-invalid",
                f"Validator run evidence text field must be a non-empty string: {field}",
                fixture,
            )
    if "created_at" in artifact and not is_iso_created_at(artifact.get("created_at")):
        add_finding(findings, "error", "validator-run-created-at-invalid", "Validator run evidence created_at must be an ISO date or datetime", fixture)

    synthetic_statement = artifact.get("synthetic_only_statement")
    if (
        not isinstance(synthetic_statement, str)
        or not synthetic_statement.strip()
        or "synthetic" not in synthetic_statement.lower()
    ):
        add_finding(findings, "error", "validator-run-synthetic-statement-invalid", "Validator run evidence must state synthetic fixture scope", fixture)

    for link_field in ("work_trace", "validation_evidence"):
        value = artifact.get(link_field)
        if not (
            isinstance(value, dict)
            or (isinstance(value, str) and bool(value.strip()))
        ):
            add_finding(findings, "error", "validator-run-link-invalid", f"{link_field} must be an embedded object or non-empty local reference", fixture)

    output_metadata = artifact.get("output_metadata")
    if not isinstance(output_metadata, list) or not output_metadata:
        add_finding(findings, "error", "validator-run-output-metadata-invalid", "output_metadata must be a non-empty list", fixture)
    elif not all(isinstance(item, dict) or (isinstance(item, str) and item.strip()) for item in output_metadata):
        add_finding(findings, "error", "validator-run-output-metadata-invalid", "output_metadata entries must be objects or non-empty local references", fixture)

    boundaries = artifact.get("boundaries")
    if not isinstance(boundaries, dict):
        add_finding(findings, "error", "validator-run-boundaries-invalid", "boundaries must be an object", fixture)
        return
    for flag in sorted(VALIDATOR_RUN_BOUNDARY_FLAGS):
        if flag not in boundaries:
            add_finding(findings, "error", "validator-run-boundary-flag-missing", f"Missing validator run boundary flag: {flag}", fixture)
        elif boundaries.get(flag) is not False:
            add_finding(findings, "error", "validator-run-boundary-flag-not-false", f"Validator run boundary flag must be false: {flag}", fixture)


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


def validate_unique_fixture_artifact_ids(fixtures: list[dict[str, Any]], findings: list[Finding]) -> None:
    artifact_ids = []
    for fixture in fixtures:
        fixture_artifact_ids = fixture.get("artifact_ids")
        if isinstance(fixture_artifact_ids, list):
            artifact_ids.extend(item.strip() for item in fixture_artifact_ids if isinstance(item, str) and item.strip())

    for artifact_id in duplicate_strings(artifact_ids):
        add_finding(findings, "error", "duplicate-artifact-id", f"Fixture artifact_id is duplicated: {artifact_id}")


def validate_fixture_references(fixtures: list[dict[str, Any]], findings: list[Finding]) -> None:
    source_packet_ids = set()
    validation_evidence_ids = set()
    work_trace_ids = set()
    output_artifact_ids = set()
    decision_record_ids = set()

    for fixture in fixtures:
        artifact = fixture.get("artifact", {})
        if not isinstance(artifact, dict):
            continue
        source_packet_id = artifact.get("source_packet_id")
        if isinstance(source_packet_id, str) and source_packet_id.strip():
            source_packet_ids.add(source_packet_id.strip())
        validation_evidence_id = artifact.get("validation_evidence_id")
        if isinstance(validation_evidence_id, str) and validation_evidence_id.strip():
            validation_evidence_ids.add(validation_evidence_id.strip())
        work_trace_id = artifact.get("work_trace_id")
        if "output_artifact_id" not in artifact and isinstance(work_trace_id, str) and work_trace_id.strip():
            work_trace_ids.add(work_trace_id.strip())
        output_artifact_id = artifact.get("output_artifact_id")
        if isinstance(output_artifact_id, str) and output_artifact_id.strip():
            output_artifact_ids.add(output_artifact_id.strip())
        decision_record_id = artifact.get("decision_record_id")
        if isinstance(decision_record_id, str) and decision_record_id.strip():
            decision_record_ids.add(decision_record_id.strip())

    for fixture in fixtures:
        artifact = fixture.get("artifact", {})
        if not isinstance(artifact, dict):
            continue
        for source_packet_id in artifact.get("source_packet_ids", []) if isinstance(artifact.get("source_packet_ids"), list) else []:
            if isinstance(source_packet_id, str) and source_packet_id.strip() and source_packet_id.strip() not in source_packet_ids:
                add_finding(findings, "error", "unknown-source-packet-id", f"Unknown source_packet_id reference: {source_packet_id}", fixture)
        for source_reference in artifact.get("source_references", []) if isinstance(artifact.get("source_references"), list) else []:
            if (
                isinstance(source_reference, str)
                and source_reference.strip()
                and is_source_packet_id_reference(source_reference.strip())
                and source_reference.strip() not in source_packet_ids
            ):
                add_finding(findings, "error", "unknown-source-reference-id", f"Unknown source_references source packet ID: {source_reference}", fixture)
        for evidence_id in artifact.get("validation_evidence_ids", []) if isinstance(artifact.get("validation_evidence_ids"), list) else []:
            if isinstance(evidence_id, str) and evidence_id.strip() and evidence_id.strip() not in validation_evidence_ids:
                add_finding(findings, "error", "unknown-validation-evidence-id", f"Unknown validation_evidence_id reference: {evidence_id}", fixture)
        for evidence_reference in artifact.get("evidence_references", []) if isinstance(artifact.get("evidence_references"), list) else []:
            if isinstance(evidence_reference, str) and evidence_reference.strip() and not evidence_reference_resolves(
                evidence_reference.strip(),
                source_packet_ids,
                validation_evidence_ids,
                work_trace_ids,
                output_artifact_ids,
                decision_record_ids,
            ):
                add_finding(findings, "error", "unknown-evidence-reference-id", f"Unknown evidence_references ID: {evidence_reference}", fixture)
        for decision_record_id in artifact.get("decision_record_ids", []) if isinstance(artifact.get("decision_record_ids"), list) else []:
            if isinstance(decision_record_id, str) and decision_record_id.strip() and decision_record_id.strip() not in decision_record_ids:
                add_finding(findings, "error", "unknown-decision-record-id", f"Unknown decision_record_id reference: {decision_record_id}", fixture)
        for superseded_id in artifact.get("supersedes", []) if isinstance(artifact.get("supersedes"), list) else []:
            if isinstance(superseded_id, str) and superseded_id.strip() and superseded_id.strip() not in decision_record_ids:
                add_finding(findings, "error", "unknown-superseded-decision-record-id", f"Unknown superseded decision_record_id reference: {superseded_id}", fixture)
        if fixture.get("expected_validation_result") == "PASS":
            for generated_artifact_id in artifact.get("generated_artifact_ids", []) if isinstance(artifact.get("generated_artifact_ids"), list) else []:
                if isinstance(generated_artifact_id, str) and generated_artifact_id.strip() and generated_artifact_id.strip() not in output_artifact_ids:
                    add_finding(findings, "error", "unknown-generated-artifact-id", f"Unknown generated_artifact_id reference: {generated_artifact_id}", fixture)
        work_trace_id = artifact.get("work_trace_id")
        if "output_artifact_id" in artifact and isinstance(work_trace_id, str) and work_trace_id.strip() and work_trace_id.strip() not in work_trace_ids:
            add_finding(findings, "error", "unknown-work-trace-id", f"Unknown work_trace_id reference: {work_trace_id}", fixture)
        validator_run_work_trace = artifact.get("work_trace")
        if "evidence_bundle_id" in artifact and isinstance(validator_run_work_trace, str) and validator_run_work_trace.strip() and validator_run_work_trace.strip() not in work_trace_ids:
            add_finding(findings, "error", "unknown-validator-run-work-trace-id", f"Unknown validator run work_trace reference: {validator_run_work_trace}", fixture)
        validator_run_evidence = artifact.get("validation_evidence")
        if "evidence_bundle_id" in artifact and isinstance(validator_run_evidence, str) and validator_run_evidence.strip() and validator_run_evidence.strip() not in validation_evidence_ids:
            add_finding(findings, "error", "unknown-validator-run-validation-evidence-id", f"Unknown validator run validation_evidence reference: {validator_run_evidence}", fixture)
        if "evidence_bundle_id" in artifact and isinstance(artifact.get("output_metadata"), list):
            for output_metadata_id in artifact.get("output_metadata", []):
                if isinstance(output_metadata_id, str) and output_metadata_id.strip() and output_metadata_id.strip() not in output_artifact_ids:
                    add_finding(findings, "error", "unknown-validator-run-output-metadata-id", f"Unknown validator run output_metadata reference: {output_metadata_id}", fixture)


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
        validate_decision_record(fixture, findings)
        validate_source_inventory(fixture, findings, approved_storage_root)
        validate_runtime_inventory(fixture, findings, approved_storage_root)
        validate_validator_run_evidence(fixture, findings)
    validate_expected_evidence_ids(fixtures, findings)
    validate_unique_fixture_artifact_ids(fixtures, findings)
    validate_fixture_references(fixtures, findings)

    return build_result(path, findings, len(fixtures), approved_storage_root)


def validate_source_packet_examples(path: Path, approved_storage_root: Path | None = None) -> dict[str, Any]:
    if approved_storage_root is None:
        approved_storage_root = load_approved_storage_root()

    examples, findings = load_json_object(path)
    if examples is None:
        return build_source_packet_examples_result(path, findings, 0, approved_storage_root)

    for field in ("source_packet_example_set_id", "title", "created_at", "created_by", "status", "packets", "excluded_classes"):
        if field not in examples:
            add_finding(findings, "error", "missing-example-set-field", f"Missing top-level field: {field}")

    for field in sorted(REQUIRED_EXAMPLE_SET_TEXT_FIELDS):
        if field in examples and (
            not isinstance(examples.get(field), str) or not examples.get(field, "").strip()
        ):
            add_finding(
                findings,
                "error",
                "example-set-text-field-invalid",
                f"Source packet example set text field must be a non-empty string: {field}",
            )
    if "created_at" in examples and not is_iso_created_at(examples.get("created_at")):
        add_finding(findings, "error", "example-set-created-at-invalid", "Source packet example set created_at must be an ISO date or datetime")
    if examples.get("status") not in VALID_EXAMPLE_SET_STATUSES:
        add_finding(findings, "error", "example-set-status-invalid", "Source packet example set status is invalid")

    for content_field in ("source_content", "source_contents", "content", "excerpt"):
        if content_field in examples:
            add_finding(
                findings,
                "error",
                "example-set-copies-content",
                f"Metadata-only source packet example set must not include {content_field}",
            )

    for flag in BOUNDARY_FALSE_FLAGS:
        if examples.get(flag) is not False:
            add_finding(findings, "error", "boundary-flag-not-false", f"Boundary flag must be false: {flag}")

    excluded_classes = examples.get("excluded_classes")
    if not is_non_empty_string_list(excluded_classes, require_non_empty=True):
        add_finding(findings, "error", "example-excluded-classes-invalid", "excluded_classes must be a non-empty string list")
        excluded_classes = []
    missing_excluded_classes = REQUIRED_EXCLUDED_SOURCE_CLASSES - set(excluded_classes)
    for source_class in sorted(missing_excluded_classes):
        add_finding(findings, "error", "example-excluded-class-missing", f"Missing excluded source class: {source_class}")

    packets = examples.get("packets")
    if not isinstance(packets, list):
        add_finding(findings, "error", "packets-not-list", "Top-level packets field must be a list")
        packets = []

    for packet in packets:
        if not isinstance(packet, dict):
            add_finding(findings, "error", "source-packet-not-object", "Each source packet example must be an object")
            continue
        validate_source_packet_example(packet, findings)

    packet_ids = [
        packet.get("source_packet_id").strip()
        for packet in packets
        if isinstance(packet, dict)
        and isinstance(packet.get("source_packet_id"), str)
        and packet.get("source_packet_id").strip()
    ]
    for packet_id in duplicate_strings(packet_ids):
        findings.append(
            Finding(
                "error",
                "duplicate-source-packet-id",
                f"Source packet example ID is duplicated: {packet_id}",
                artifact_id=packet_id,
            )
        )

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
        if field in packet and (
            not isinstance(packet.get(field), str) or not packet.get(field, "").strip()
        ):
            findings.append(
                Finding(
                    "error",
                    "source-packet-text-field-invalid",
                    f"Source packet text field must be a non-empty string: {field}",
                    artifact_id=str(packet_id) if packet_id else None,
                )
            )
    if "created_at" in packet and not is_iso_created_at(packet.get("created_at")):
        findings.append(
            Finding(
                "error",
                "source-packet-created-at-invalid",
                "Source packet created_at must be an ISO date or datetime",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )
    if "source_references" in packet and not is_non_empty_string_list(packet.get("source_references")):
        findings.append(
            Finding(
                "error",
                "source-packet-source-references-invalid",
                "source_references must be a string list",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )
    if "open_questions" in packet and not is_non_empty_string_list(packet.get("open_questions")):
        findings.append(
            Finding(
                "error",
                "source-packet-open-questions-invalid",
                "open_questions must be a string list",
                artifact_id=str(packet_id) if packet_id else None,
            )
        )

    for flag in BOUNDARY_FALSE_FLAGS:
        if flag in packet and packet.get(flag) is not False:
            findings.append(
                Finding(
                    "error",
                    "source-packet-boundary-flag-not-false",
                    f"Source packet boundary flag must be false when present: {flag}",
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
