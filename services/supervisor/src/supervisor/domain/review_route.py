"""Strict, metadata-only Disclosure Packet validation.

This module intentionally validates report preparation only. It does not select
or invoke an adapter, access credentials, or perform a network operation.
"""

from __future__ import annotations

import json
import hashlib
import re
from datetime import datetime, timezone
from typing import Any


DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1"
DISCLOSURE_PACKET_MAX_UTF8_BYTES = 16 * 1024
SIMULATED_REVIEW_ADAPTER_ID = "simulated-review-fixture/v1"
NORMALIZED_FINDING_SCHEMA_VERSION = "normalized-finding/v1"
SIMULATED_REVIEW_RESULT_SCHEMA_VERSION = "simulated-review-result/v2"
_MISSING = object()


def disclosure_packet_utf8_bytes(value: object) -> int | None:
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError, UnicodeEncodeError):
        return None


def is_disclosure_packet_size_allowed(value: object) -> bool:
    encoded_size = disclosure_packet_utf8_bytes(value)
    return encoded_size is not None and encoded_size <= DISCLOSURE_PACKET_MAX_UTF8_BYTES


def disclosure_packet_canonical_digest(value: object) -> str | None:
    try:
        if type(value) is not dict:
            return None
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")
        return f"sha256:{hashlib.sha256(encoded).hexdigest()}"
    except (TypeError, ValueError, UnicodeEncodeError):
        return None


def _line_or_range(value: object) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]{0,6}(?:-[1-9][0-9]{0,6})?", value):
        return False
    start, _, end = value.partition("-")
    return not end or int(start) <= int(end)


def validate_normalized_finding(value: object) -> dict[str, object]:
    fields = {"schemaVersion", "findingId", "rule", "severity", "pathOrRef", "lineOrRange", "summary", "remediation", "reviewedHead", "digest"}
    if type(value) is not dict or set(value) != fields:
        return _invalid("finding_malformed")
    if value.get("schemaVersion") != NORMALIZED_FINDING_SCHEMA_VERSION or not _safe_id(value.get("findingId")) or not _safe_id(value.get("rule")) or not _safe_id(value.get("pathOrRef")):
        return _invalid("finding_malformed")
    if value.get("severity") not in {"info", "low", "medium", "high"} or not _line_or_range(value.get("lineOrRange")):
        return _invalid("finding_malformed")
    if any(not isinstance(value.get(key), str) or not value[key] or len(value[key]) > 280 or _FORBIDDEN_TEXT.search(value[key]) for key in {"summary", "remediation"}):
        return _invalid("finding_malformed")
    if not _exact_head(value.get("reviewedHead")) or not _digest(value.get("digest")):
        return _invalid("finding_malformed")
    key = f"{value['reviewedHead']}:{value['digest']}:{value['pathOrRef']}:{value['lineOrRange']}:{value['rule']}"
    if value["findingId"] != f"normalized-finding:sha256:{hashlib.sha256(key.encode()).hexdigest()}":
        return _invalid("finding_malformed")
    return {"ok": True, "reasons": []}


def _fixture_finding(reviewed_head: str, digest: str) -> dict[str, str]:
    rule = "simulated-metadata-boundary/v1"
    path_or_ref = "metadata:review-route"
    line_or_range = "1"
    key = f"{reviewed_head}:{digest}:{path_or_ref}:{line_or_range}:{rule}"
    return {
        "schemaVersion": NORMALIZED_FINDING_SCHEMA_VERSION,
        "findingId": f"normalized-finding:sha256:{hashlib.sha256(key.encode()).hexdigest()}",
        "rule": rule,
        "severity": "info",
        "pathOrRef": path_or_ref,
        "lineOrRange": line_or_range,
        "summary": "Simulated metadata review is complete without an external adapter action.",
        "remediation": "Reissue and re-evaluate after the exact review identity changes.",
        "reviewedHead": reviewed_head,
        "digest": digest,
    }


def _simulated_decision_id(disclosure_packet_id: str, reviewed_head: str, digest: str) -> str:
    key = f"simulated:simulated_prepared:{reviewed_head}:{digest}:{disclosure_packet_id}"
    return f"review-route-decision:sha256:{hashlib.sha256(key.encode()).hexdigest()}"


def validate_simulated_review_result(
    value: object,
    *,
    canonical_packet: object,
    now: str,
    route_policy: dict[str, object] | None,
    prior_findings: object = _MISSING,
    current_immutable_review: object | None = None,
    canonical_decision: object | None = None,
    consumed_disclosure_packet_ids: object = _MISSING,
    fallback: object = "none",
) -> dict[str, object]:
    fields = {"schemaVersion", "adapterId", "state", "code", "findings", "disclosurePacketId", "disclosurePacketDigest", "decisionId", "reviewedHead", "digest", "deliveryEvidenceEligible", "safeFallback", "execution"}
    if type(value) is not dict or set(value) != fields or value.get("schemaVersion") != SIMULATED_REVIEW_RESULT_SCHEMA_VERSION or value.get("adapterId") != SIMULATED_REVIEW_ADAPTER_ID or value.get("execution") != "none":
        return _invalid("result_malformed")
    if value.get("state") not in {"completed", "stale", "blocked"} or type(value.get("findings")) is not list or len(value["findings"]) > 32 or value.get("deliveryEvidenceEligible") is not False:
        return _invalid("result_malformed")
    if value["state"] != "completed" and (value["findings"] or value["deliveryEvidenceEligible"]):
        return _invalid("result_malformed")
    allowed_codes = {"completed": {"simulated_completed", "simulated_deduplicated"}, "stale": {"immutable_identity_stale"}, "blocked": {"packet_invalid", "packet_already_used", "decision_invalid", "simulation_timeout", "policy_vetoed", "capability_unsupported", "resource_blocked"}}
    if value.get("code") not in allowed_codes[value["state"]] or type(value.get("safeFallback")) is not dict or set(value["safeFallback"]) != {"action", "summary"} or value["safeFallback"].get("action") not in {"retain_report_only", "re_evaluate", "reissue_disclosure_packet", "resolve_policy_block"} or not isinstance(value["safeFallback"].get("summary"), str) or not value["safeFallback"]["summary"] or len(value["safeFallback"]["summary"]) > 280 or _FORBIDDEN_TEXT.search(value["safeFallback"]["summary"]):
        return _invalid("result_malformed")
    expected_actions = {"completed": "retain_report_only", "stale": "reissue_disclosure_packet", "blocked": "resolve_policy_block" if value["code"] == "policy_vetoed" else "reissue_disclosure_packet" if value["code"] in {"packet_invalid", "packet_already_used"} else "re_evaluate"}
    if value["safeFallback"]["action"] != expected_actions[value["state"]]:
        return _invalid("result_malformed")
    if value["state"] == "completed" and (not _safe_id(value.get("disclosurePacketId")) or not _digest(value.get("disclosurePacketDigest")) or not _exact_head(value.get("reviewedHead")) or not _digest(value.get("digest"))):
        return _invalid("result_malformed")
    packet = _copy_disclosure_packet(canonical_packet)
    policy = _copy_route_policy(route_policy)
    current_identity = _review_identity(current_immutable_review)
    if current_identity is None or packet is None or policy is None:
        return _valid_early_decision_invalid(value)
    fallback_invalid = not isinstance(fallback, str) or fallback not in {"none", "timeout"}
    if fallback_invalid:
        if value.get("state") != "blocked" or value.get("code") != "decision_invalid" or value.get("reviewedHead") != current_identity["exactHead"] or value.get("digest") != current_identity["digest"]:
            return _invalid("result_malformed")
    canonical_identity = packet["immutableReview"]
    canonical_review_identity = _review_identity(canonical_identity)
    packet_validation = validate_disclosure_packet(packet, now=now, route_policy=policy, immutable_review=canonical_identity)
    canonical_packet_digest = disclosure_packet_canonical_digest(packet)
    stale_from_prior = False
    prior_fixture_seen = False
    if not fallback_invalid and not packet_validation["ok"] and (
        value.get("state") != "blocked"
        or value.get("code") != "packet_invalid"
        or value.get("reviewedHead") is None
        or value.get("digest") is None
        or value.get("reviewedHead") != current_identity["exactHead"]
        or value.get("digest") != current_identity["digest"]
    ):
        return _invalid("result_malformed")
    if not fallback_invalid and packet_validation["ok"] and value.get("state") == "blocked" and value.get("code") == "packet_invalid":
        return _invalid("result_malformed")
    identity_bound_block_codes = {"packet_invalid", "packet_already_used", "policy_vetoed", "capability_unsupported", "resource_blocked", "simulation_timeout", "decision_invalid"}
    if value.get("state") == "blocked" and value.get("code") in identity_bound_block_codes and (
        value.get("reviewedHead") != current_identity["exactHead"]
        or value.get("digest") != current_identity["digest"]
    ):
        return _invalid("result_malformed")
    if (
        value.get("state") == "blocked"
        and value.get("reviewedHead") is not None
        and (
            value.get("reviewedHead") != current_identity["exactHead"]
            or value.get("digest") != current_identity["digest"]
        )
    ):
        return _invalid("result_malformed")
    if not fallback_invalid and packet_validation["ok"]:
        if current_identity != canonical_review_identity:
            if value.get("state") != "stale":
                return _invalid("result_malformed")
        if not _simulated_decision_valid(canonical_decision, packet, current_identity):
            if current_identity == canonical_review_identity and (value.get("state") != "blocked" or value.get("code") != "decision_invalid"):
                return _invalid("result_malformed")
        elif current_identity == canonical_review_identity:
            consumed = set() if consumed_disclosure_packet_ids is _MISSING else _consumed_packet_ids(consumed_disclosure_packet_ids)
            if consumed is None:
                if value.get("state") != "blocked" or value.get("code") != "decision_invalid":
                    return _invalid("result_malformed")
            elif packet["disclosurePacketId"] in consumed:
                if value.get("state") != "blocked" or value.get("code") != "packet_already_used":
                    return _invalid("result_malformed")
            else:
                policy_block = _simulated_review_policy_block(policy)
                expected_block = policy_block or ("simulation_timeout" if fallback == "timeout" else None)
                if expected_block is not None:
                    if value.get("state") != "blocked" or value.get("code") != expected_block:
                        return _invalid("result_malformed")
                else:
                    prior = [] if prior_findings is _MISSING else prior_findings
                    prior_status, prior_fixture_seen = _prior_findings_status(prior, current_identity)
                    if prior_status == "invalid":
                        if value.get("state") != "blocked" or value.get("code") != "decision_invalid":
                            return _invalid("result_malformed")
                    elif prior_status == "stale":
                        stale_from_prior = True
                        if value.get("state") != "stale":
                            return _invalid("result_malformed")
                    elif value.get("state") == "blocked":
                        return _invalid("result_malformed")
    if value["state"] == "completed" and (
        not packet_validation["ok"]
        or not _digest(canonical_packet_digest)
        or value.get("disclosurePacketDigest") != canonical_packet_digest
        or value.get("disclosurePacketId") != packet["disclosurePacketId"]
        or value.get("reviewedHead") != canonical_identity.get("exactHead")
        or value.get("digest") != canonical_identity.get("digest")
        or current_identity != _review_identity(canonical_identity)
        or "simulated" not in packet["routeAllowlist"]
        or SIMULATED_REVIEW_ADAPTER_ID not in packet["adapterAllowlist"]
        or not _simulated_review_policy_ready(policy)
    ):
        return _invalid("result_malformed")
    if value["state"] == "completed" and value.get("decisionId") != _simulated_decision_id(value["disclosurePacketId"], value["reviewedHead"], value["digest"]):
        return _invalid("result_malformed")
    if value["state"] == "completed" and ((value["code"] == "simulated_completed") != bool(value["findings"])):
        return _invalid("result_malformed")
    if value["code"] == "simulated_completed" and len(value["findings"]) != 1:
        return _invalid("result_malformed")
    if value["code"] == "simulated_deduplicated" and value["findings"]:
        return _invalid("result_malformed")
    if value["code"] == "simulated_deduplicated" and prior_fixture_seen is not True:
        return _invalid("result_malformed")
    if value["code"] == "simulated_completed" and prior_fixture_seen is not False:
        return _invalid("result_malformed")
    if value["state"] == "stale" and (
        current_identity is None
        or value.get("reviewedHead") != current_identity["exactHead"]
        or value.get("digest") != current_identity["digest"]
        or (current_identity == canonical_review_identity and not stale_from_prior)
    ):
        return _invalid("result_malformed")
    if value["state"] == "blocked" and ((value.get("reviewedHead") is None) != (value.get("digest") is None)):
        return _invalid("result_malformed")
    if value["state"] != "completed" and (value.get("disclosurePacketId") is not None or value.get("disclosurePacketDigest") is not None or value.get("decisionId") is not None):
        return _invalid("result_malformed")
    if value.get("reviewedHead") is not None and not _exact_head(value.get("reviewedHead")):
        return _invalid("result_malformed")
    if value.get("digest") is not None and not _digest(value.get("digest")):
        return _invalid("result_malformed")
    if any(not validate_normalized_finding(item)["ok"] for item in value["findings"]):
        return _invalid("result_malformed")
    if any(item["reviewedHead"] != value.get("reviewedHead") or item["digest"] != value.get("digest") for item in value["findings"]):
        return _invalid("result_malformed")
    if value["code"] == "simulated_completed" and value["findings"] != [_fixture_finding(value["reviewedHead"], value["digest"])]:
        return _invalid("result_malformed")
    return {"ok": True, "reasons": []}


def _review_identity(value: object) -> dict[str, str] | None:
    identity = _copy_strict_object(value, _IDENTITY_FIELDS)
    if identity is None:
        return None
    execution_job_id = identity["executionJobId"]
    exact_head = identity["exactHead"]
    digest = identity["digest"]
    if not _safe_id(execution_job_id) or not _exact_head(exact_head) or not _digest(digest):
        return None
    return {"executionJobId": execution_job_id, "exactHead": exact_head, "digest": digest}


def _valid_early_decision_invalid(value: dict[str, object]) -> dict[str, object]:
    """Match JS adapter's pre-validation structural fail-closed result.

    The adapter only emits this form after receiving a trusted current identity,
    but before it can trust packet or policy structure.  It intentionally does
    not bind the result to an untrusted packet identity.
    """
    if (
        value.get("state") == "blocked"
        and value.get("code") == "decision_invalid"
        and value.get("findings") == []
        and value.get("disclosurePacketId") is None
        and value.get("disclosurePacketDigest") is None
        and value.get("decisionId") is None
        and value.get("reviewedHead") is None
        and value.get("digest") is None
    ):
        return {"ok": True, "reasons": []}
    return _invalid("result_malformed")


def _copy_strict_object(value: object, fields: frozenset[str]) -> dict[str, object] | None:
    if type(value) is not dict or set(value) != fields:
        return None
    return {field: value[field] for field in fields}


def _copy_strict_array(value: object) -> list[object] | None:
    return list(value) if type(value) is list else None


def _copy_disclosure_packet(value: object) -> dict[str, object] | None:
    packet = _copy_strict_object(value, _PACKET_FIELDS)
    if packet is None:
        return None
    immutable_review = _copy_strict_object(packet["immutableReview"], _IDENTITY_FIELDS)
    authority = _copy_strict_object(packet["authority"], _AUTHORITY_FIELDS)
    issuance = _copy_strict_object(packet["issuance"], _ISSUANCE_FIELDS)
    scope = _copy_strict_object(packet["scope"], _SCOPE_FIELDS)
    route_allowlist = _copy_strict_array(packet["routeAllowlist"])
    adapter_allowlist = _copy_strict_array(packet["adapterAllowlist"])
    tool_allowlist = _copy_strict_array(packet["toolAllowlist"])
    evidence_refs = _copy_strict_array(scope["evidenceRefs"]) if scope is not None else None
    if any(item is None for item in (immutable_review, authority, issuance, scope, route_allowlist, adapter_allowlist, tool_allowlist, evidence_refs)):
        return None
    return {
        **packet,
        "immutableReview": immutable_review,
        "authority": authority,
        "issuance": issuance,
        "scope": {**scope, "evidenceRefs": evidence_refs},
        "routeAllowlist": route_allowlist,
        "adapterAllowlist": adapter_allowlist,
        "toolAllowlist": tool_allowlist,
    }


def _copy_route_policy(value: object) -> dict[str, object] | None:
    fields = frozenset({"routeAllowlist", "adapterAllowlist", "toolAllowlist", "policyState", "capabilityState", "resourceState"})
    policy = _copy_strict_object(value, fields)
    if policy is None:
        return None
    route_allowlist = _copy_strict_array(policy["routeAllowlist"])
    adapter_allowlist = _copy_strict_array(policy["adapterAllowlist"])
    tool_allowlist = _copy_strict_array(policy["toolAllowlist"])
    if route_allowlist is None or adapter_allowlist is None or tool_allowlist is None:
        return None
    return {**policy, "routeAllowlist": route_allowlist, "adapterAllowlist": adapter_allowlist, "toolAllowlist": tool_allowlist}


def _simulated_review_policy_ready(value: object) -> bool:
    fields = {"routeAllowlist", "adapterAllowlist", "toolAllowlist", "policyState", "capabilityState", "resourceState"}
    return (
        type(value) is dict
        and set(value) == fields
        and _valid_string_list(value.get("routeAllowlist"), {"report_only", "simulated"})
        and _valid_string_list(value.get("adapterAllowlist"), {"none", SIMULATED_REVIEW_ADAPTER_ID})
        and _valid_string_list(value.get("toolAllowlist"), {"none"})
        and "report_only" in value["routeAllowlist"]
        and "none" in value["adapterAllowlist"]
        and value.get("policyState") == "ready"
        and value.get("capabilityState") == "supported"
        and value.get("resourceState") == "ready"
    )


def _simulated_review_policy_block(value: object) -> str | None:
    if type(value) is not dict or set(value) != {"routeAllowlist", "adapterAllowlist", "toolAllowlist", "policyState", "capabilityState", "resourceState"}:
        return "policy_vetoed"
    if not _valid_string_list(value.get("routeAllowlist"), {"report_only", "simulated"}) or not _valid_string_list(value.get("adapterAllowlist"), {"none", SIMULATED_REVIEW_ADAPTER_ID}) or not _valid_string_list(value.get("toolAllowlist"), {"none"}) or "report_only" not in value["routeAllowlist"] or "none" not in value["adapterAllowlist"] or value.get("policyState") != "ready":
        return "policy_vetoed"
    if value.get("capabilityState") != "supported":
        return "capability_unsupported"
    if value.get("resourceState") != "ready":
        return "resource_blocked"
    return None


def _consumed_packet_ids(value: object) -> set[str] | None:
    if type(value) is not list or len(value) > 256 or any(not _safe_id(item) for item in value) or len(set(value)) != len(value):
        return None
    return set(value)


def _simulated_decision_valid(value: object, packet: dict[str, object], identity: dict[str, str]) -> bool:
    fields = frozenset({"schemaVersion", "decisionId", "state", "controllingReason", "safeFallback", "immutableReview", "authorityEvidence", "disclosurePacketId", "disclosurePacketDigest", "metadataOnly", "rawPayloadRetained", "execution"})
    decision = _copy_strict_object(value, fields)
    if decision is None:
        return False
    decision_identity = _review_identity(decision["immutableReview"])
    authority_evidence = _copy_strict_object(decision["authorityEvidence"], frozenset({"issuerId", "authorityRef", "status"}))
    controlling_reason = _copy_strict_object(decision["controllingReason"], frozenset({"code", "summary"}))
    safe_fallback = _copy_strict_object(decision["safeFallback"], frozenset({"action", "summary"}))
    authority = packet["authority"]
    if decision_identity is None or authority_evidence is None or controlling_reason is None or safe_fallback is None or type(authority) is not dict:
        return False
    digest = disclosure_packet_canonical_digest(packet)
    expected_id = _simulated_decision_id(str(packet["disclosurePacketId"]), identity["exactHead"], identity["digest"])
    return (
        decision["schemaVersion"] == "review-route-decision/v2"
        and decision["decisionId"] == expected_id
        and decision["state"] == "simulated"
        and decision["execution"] == "none"
        and decision["metadataOnly"] is True
        and decision["rawPayloadRetained"] is False
        and decision["disclosurePacketId"] == packet["disclosurePacketId"]
        and decision["disclosurePacketDigest"] == digest
        and "simulated" in packet["routeAllowlist"]
        and SIMULATED_REVIEW_ADAPTER_ID in packet["adapterAllowlist"]
        and decision_identity == identity
        and authority_evidence == {"issuerId": authority.get("issuerId"), "authorityRef": authority.get("authorityRef"), "status": "valid"}
        and controlling_reason == {"code": "simulated_prepared", "summary": "Simulation preparation is recorded without an adapter action."}
        and safe_fallback == {"action": "retain_report_only", "summary": "Retain the report-only decision and use separate governance for any later promotion."}
    )


def _prior_findings_status(value: object, identity: dict[str, str]) -> tuple[str, bool]:
    if type(value) is not list or len(value) > 32:
        return "invalid", False
    expected = _fixture_finding(identity["exactHead"], identity["digest"])
    finding_keys: set[str] = set()
    for finding in value:
        if not validate_normalized_finding(finding)["ok"]:
            return "invalid", False
        if finding["reviewedHead"] != identity["exactHead"] or finding["digest"] != identity["digest"]:
            return "stale", False
        key = f"{finding['reviewedHead']}:{finding['digest']}:{finding['pathOrRef']}:{finding['lineOrRange']}:{finding['rule']}"
        if key in finding_keys or (key == f"{expected['reviewedHead']}:{expected['digest']}:{expected['pathOrRef']}:{expected['lineOrRange']}:{expected['rule']}" and finding != expected):
            return "invalid", False
        finding_keys.add(key)
    try:
        if len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 12 * 1024:
            return "invalid", False
    except (TypeError, ValueError, UnicodeEncodeError):
        return "invalid", False
    return "valid", expected in value

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
    if type(packet) is not dict:
        return _invalid("packet_malformed")
    reasons: list[str] = []
    _inspect_fields(packet, _PACKET_FIELDS, reasons)
    if packet.get("schemaVersion") != DISCLOSURE_PACKET_SCHEMA_VERSION:
        reasons.append("schema_version_invalid")
    if not _safe_id(packet.get("disclosurePacketId")):
        reasons.append("packet_id_invalid")
    _validate_identity(packet.get("immutableReview"), reasons, immutable_review)
    _validate_string_list(packet.get("routeAllowlist"), "route", reasons, {"report_only", "simulated"})
    _validate_string_list(packet.get("adapterAllowlist"), "adapter", reasons, {"none", SIMULATED_REVIEW_ADAPTER_ID})
    _validate_string_list(packet.get("toolAllowlist"), "tool", reasons, {"none"})
    _validate_subset(packet.get("routeAllowlist"), _policy_list(route_policy, "routeAllowlist"), "route", reasons)
    _validate_subset(packet.get("adapterAllowlist"), _policy_list(route_policy, "adapterAllowlist"), "adapter", reasons)
    _validate_subset(packet.get("toolAllowlist"), _policy_list(route_policy, "toolAllowlist"), "tool", reasons)
    _validate_authority(packet.get("authority"), reasons)
    _validate_issuance(packet.get("issuance"), now, reasons)
    _validate_scope(packet.get("scope"), reasons)
    _validate_route_adapter_pair(packet.get("routeAllowlist"), packet.get("adapterAllowlist"), reasons)
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


def _valid_string_list(value: object, fixed_values: set[str]) -> bool:
    unique_values: set[object] | None
    try:
        unique_values = set(value) if type(value) is list else None
    except TypeError:
        unique_values = None
    return bool(
        type(value) is list
        and value
        and len(value) <= 32
        and unique_values is not None
        and len(unique_values) == len(value)
        and all(_safe_id(entry) and entry in fixed_values for entry in value)
    )


def _validate_string_list(value: object, label: str, reasons: list[str], fixed_values: set[str]) -> None:
    if not _valid_string_list(value, fixed_values):
        reasons.append(f"{label}_allowlist_invalid")


def _validate_evidence_refs(value: object, reasons: list[str]) -> None:
    if (
        type(value) is not list
        or not value
        or len(value) > 32
        or any(not isinstance(entry, str) or not _SAFE_EVIDENCE_REF.fullmatch(entry) for entry in value)
        or len(set(value)) != len(value)
    ):
        reasons.append("evidence_ref_allowlist_invalid")


def _validate_subset(values: object, allowed: object, label: str, reasons: list[str]) -> None:
    fixed_values = {"report_only", "simulated"} if label == "route" else ({"none", SIMULATED_REVIEW_ADAPTER_ID} if label == "adapter" else {"none"})
    if type(values) is not list or not _valid_string_list(allowed, fixed_values) or any(value not in allowed for value in values):
        reasons.append(f"{label}_not_allowed")


def _validate_route_adapter_pair(route_allowlist: object, adapter_allowlist: object, reasons: list[str]) -> None:
    if type(route_allowlist) is not list or type(adapter_allowlist) is not list:
        reasons.append("route_adapter_pair_invalid")
        return
    if "report_only" in route_allowlist and "none" not in adapter_allowlist:
        reasons.append("route_adapter_pair_invalid")
    if "simulated" in route_allowlist and SIMULATED_REVIEW_ADAPTER_ID not in adapter_allowlist:
        reasons.append("route_adapter_pair_invalid")
    if "none" in adapter_allowlist and "report_only" not in route_allowlist:
        reasons.append("route_adapter_pair_invalid")
    if SIMULATED_REVIEW_ADAPTER_ID in adapter_allowlist and "simulated" not in route_allowlist:
        reasons.append("route_adapter_pair_invalid")


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
    return policy.get(field) if type(policy) is dict else None


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
