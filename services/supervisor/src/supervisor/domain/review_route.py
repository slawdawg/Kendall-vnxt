"""Strict, metadata-only Disclosure Packet validation.

This module intentionally validates report preparation only. It does not select
or invoke an adapter, access credentials, or perform a network operation.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any


DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1"
DISCLOSURE_PACKET_MAX_UTF8_BYTES = 16 * 1024


def disclosure_packet_utf8_bytes(value: object) -> int | None:
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError, UnicodeEncodeError):
        return None


def is_disclosure_packet_size_allowed(value: object) -> bool:
    encoded_size = disclosure_packet_utf8_bytes(value)
    return encoded_size is not None and encoded_size <= DISCLOSURE_PACKET_MAX_UTF8_BYTES

_PACKET_FIELDS = frozenset(
    {
        "schemaVersion",
        "disclosurePacketId",
        "immutableReview",
        "routeAllowlist",
        "adapterAllowlist",
        "toolAllowlist",
        "authority",
        "issuance",
        "scope",
        "metadataOnly",
        "rawPayloadRetained",
    }
)
_IDENTITY_FIELDS = frozenset({"executionJobId", "exactHead", "digest"})
_AUTHORITY_FIELDS = frozenset({"issuerId", "authorityRef", "valid"})
_ISSUANCE_FIELDS = frozenset({"issuedAt", "expiresAt", "revocationState", "cancellationState", "singleUse"})
_SCOPE_FIELDS = frozenset({"dataClass", "evidenceRefs"})
_SAFE_ID = re.compile(r"^[A-Za-z][A-Za-z0-9._:/-]{1,180}$")
_SAFE_EVIDENCE_REF = re.compile(r"^evidence:sha256:[0-9a-f]{64}$")
_EXACT_HEAD = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_FORBIDDEN_NAME = re.compile(r"(?:source|diff|prompt|completion|reasoning|secret|credential|token|vault|customer|production|dump|path|url|payload|transcript)", re.IGNORECASE)
_FORBIDDEN_TEXT = re.compile(r"(?:\b(?:source|diff|prompt|completion|reasoning|secret|credential|token|vault|customer|production|dump|path|url|payload|transcript)\b|(?:sk(?:[-_](?:proj|ant(?:[-_]api)?))?|ghp|github_pat)[-_][A-Za-z0-9_-]{8,}|BEGIN [A-Z ]+PRIVATE KEY)", re.IGNORECASE)


def validate_disclosure_packet(
    packet: object,
    *,
    now: str,
    route_policy: dict[str, object] | None,
    immutable_review: dict[str, str] | None = None,
) -> dict[str, object]:
    """Validate the canonical packet and return only compact failure codes."""
    if not isinstance(packet, dict):
        return _invalid("packet_malformed")
    reasons: list[str] = []
    _inspect_fields(packet, _PACKET_FIELDS, reasons)
    if packet.get("schemaVersion") != DISCLOSURE_PACKET_SCHEMA_VERSION:
        reasons.append("schema_version_invalid")
    if not _safe_id(packet.get("disclosurePacketId")):
        reasons.append("packet_id_invalid")
    _validate_identity(packet.get("immutableReview"), reasons, immutable_review)
    _validate_string_list(packet.get("routeAllowlist"), "route", reasons, {"report_only", "simulated"})
    _validate_string_list(packet.get("adapterAllowlist"), "adapter", reasons, {"none"})
    _validate_string_list(packet.get("toolAllowlist"), "tool", reasons, {"none"})
    _validate_subset(packet.get("routeAllowlist"), _policy_list(route_policy, "routeAllowlist"), "route", reasons)
    _validate_subset(packet.get("adapterAllowlist"), _policy_list(route_policy, "adapterAllowlist"), "adapter", reasons)
    _validate_subset(packet.get("toolAllowlist"), _policy_list(route_policy, "toolAllowlist"), "tool", reasons)
    _validate_authority(packet.get("authority"), reasons)
    _validate_issuance(packet.get("issuance"), now, reasons)
    _validate_scope(packet.get("scope"), reasons)
    if packet.get("metadataOnly") is not True or packet.get("rawPayloadRetained") is not False:
        reasons.append("metadata_boundary_invalid")
    encoded_size = disclosure_packet_utf8_bytes(packet)
    if encoded_size is None:
        reasons.append("packet_malformed")
    elif encoded_size > DISCLOSURE_PACKET_MAX_UTF8_BYTES:
        reasons.append("packet_oversize")
    return {"ok": True, "reasons": []} if not reasons else _invalid(reasons)


def _validate_identity(value: object, reasons: list[str], expected: dict[str, str] | None) -> None:
    if not isinstance(value, dict):
        reasons.append("immutable_identity_invalid")
        return
    _inspect_fields(value, _IDENTITY_FIELDS, reasons)
    exact_head = value.get("exactHead")
    digest = value.get("digest")
    if not _safe_id(value.get("executionJobId")) or not _exact_head(exact_head) or not _digest(digest):
        reasons.append("immutable_identity_invalid")
    if expected and (
        exact_head != expected.get("exactHead")
        or digest != expected.get("digest")
        or ("executionJobId" in expected and value.get("executionJobId") != expected.get("executionJobId"))
    ):
        reasons.append("immutable_identity_mismatch")


def _validate_authority(value: object, reasons: list[str]) -> None:
    if not isinstance(value, dict):
        reasons.append("authority_invalid")
        return
    _inspect_fields(value, _AUTHORITY_FIELDS, reasons)
    if not _safe_id(value.get("issuerId")) or not _safe_id(value.get("authorityRef")) or value.get("valid") is not True:
        reasons.append("authority_invalid")


def _validate_issuance(value: object, now_value: str, reasons: list[str]) -> None:
    if not isinstance(value, dict):
        reasons.append("issuance_invalid")
        return
    _inspect_fields(value, _ISSUANCE_FIELDS, reasons)
    now = _canonical_time(now_value)
    issued_at = _canonical_time(value.get("issuedAt"))
    expires_at = _canonical_time(value.get("expiresAt"))
    if now is None or issued_at is None or expires_at is None or expires_at <= issued_at:
        reasons.append("issuance_invalid")
    elif issued_at > now:
        reasons.append("packet_future")
    elif expires_at <= now:
        reasons.append("packet_expired")
    if value.get("revocationState") == "revoked":
        reasons.append("packet_revoked")
    elif value.get("revocationState") != "active":
        reasons.append("issuance_invalid")
    if value.get("cancellationState") == "cancelled":
        reasons.append("packet_cancelled")
    elif value.get("cancellationState") != "active":
        reasons.append("issuance_invalid")
    if value.get("singleUse") is not True:
        reasons.append("single_use_required")


def _validate_scope(value: object, reasons: list[str]) -> None:
    if not isinstance(value, dict):
        reasons.append("scope_invalid")
        return
    _inspect_fields(value, _SCOPE_FIELDS, reasons)
    if value.get("dataClass") != "metadata_only":
        reasons.append("data_class_invalid")
    _validate_evidence_refs(value.get("evidenceRefs"), reasons)


def _validate_string_list(value: object, label: str, reasons: list[str], fixed_values: set[str]) -> None:
    unique_values: set[object] | None
    try:
        unique_values = set(value) if isinstance(value, list) else None
    except TypeError:
        unique_values = None
    if (
        not isinstance(value, list)
        or not value
        or len(value) > 32
        or unique_values is None
        or len(unique_values) != len(value)
        or any(not _safe_id(entry) or entry not in fixed_values for entry in value)
    ):
        reasons.append(f"{label}_allowlist_invalid")


def _validate_evidence_refs(value: object, reasons: list[str]) -> None:
    if (
        not isinstance(value, list)
        or not value
        or len(value) > 32
        or any(not isinstance(entry, str) or not _SAFE_EVIDENCE_REF.fullmatch(entry) for entry in value)
        or len(set(value)) != len(value)
    ):
        reasons.append("evidence_ref_allowlist_invalid")


def _validate_subset(values: object, allowed: object, label: str, reasons: list[str]) -> None:
    if not isinstance(values, list) or not isinstance(allowed, list) or any(value not in allowed for value in values):
        reasons.append(f"{label}_not_allowed")


def _inspect_fields(value: dict[str, object], allowed: frozenset[str], reasons: list[str]) -> None:
    for key in value:
        if not isinstance(key, str):
            reasons.append("packet_malformed")
            continue
        if key not in allowed:
            reasons.append("forbidden_field" if _FORBIDDEN_NAME.search(key) else "unknown_field")
    for key, nested in value.items():
        if isinstance(key, str) and key in allowed and _contains_forbidden_text(nested):
            reasons.append("forbidden_content")


def _contains_forbidden_text(value: object, seen: set[int] | None = None) -> bool:
    seen = seen if seen is not None else set()
    if isinstance(value, str):
        return bool(_FORBIDDEN_TEXT.search(value))
    if isinstance(value, list):
        if id(value) in seen:
            return True
        seen.add(id(value))
        return any(_contains_forbidden_text(item, seen) for item in value)
    if isinstance(value, dict):
        if id(value) in seen:
            return True
        seen.add(id(value))
        return any(not isinstance(key, str) or (key != "rawPayloadRetained" and (_FORBIDDEN_NAME.search(key) or _contains_forbidden_text(item, seen))) for key, item in value.items())
    return False


def _policy_list(policy: dict[str, object] | None, field: str) -> object:
    return policy.get(field) if isinstance(policy, dict) else None


def _safe_id(value: object) -> bool:
    return isinstance(value, str) and bool(_SAFE_ID.fullmatch(value)) and not _FORBIDDEN_TEXT.search(value)


def _exact_head(value: object) -> bool:
    return isinstance(value, str) and bool(_EXACT_HEAD.fullmatch(value))


def _digest(value: object) -> bool:
    return isinstance(value, str) and bool(_DIGEST.fullmatch(value))


def _canonical_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    normalized = parsed.astimezone(timezone.utc)
    canonical = normalized.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return normalized if canonical == value else None


def _invalid(reasons: str | list[str]) -> dict[str, object]:
    values = [reasons] if isinstance(reasons, str) else reasons
    return {"ok": False, "reasons": list(dict.fromkeys(values))}
