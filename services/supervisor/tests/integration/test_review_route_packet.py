import hashlib

from supervisor.domain.review_route import (
    DISCLOSURE_PACKET_MAX_UTF8_BYTES,
    SIMULATED_REVIEW_ADAPTER_ID,
    disclosure_packet_utf8_bytes,
    is_disclosure_packet_size_allowed,
    validate_disclosure_packet,
    validate_normalized_finding,
    validate_simulated_review_result,
)


NOW = "2026-07-22T12:00:00.000Z"
EXACT_HEAD = "a" * 40
DIGEST = f"sha256:{'b' * 64}"
EVIDENCE_REF = f"evidence:sha256:{'c' * 64}"
DISCLOSURE_PACKET_DIGEST = f"sha256:{'d' * 64}"


def _policy() -> dict:
    return {
        "routeAllowlist": ["report_only", "simulated"],
        "adapterAllowlist": ["none"],
        "toolAllowlist": ["none"],
    }


def _packet() -> dict:
    return {
        "schemaVersion": "disclosure-packet/v1",
        "disclosurePacketId": "disclosure-packet:review-35-1",
        "immutableReview": {
            "executionJobId": "execution-job:review-35-1",
            "exactHead": EXACT_HEAD,
            "digest": DIGEST,
        },
        "routeAllowlist": ["report_only"],
        "adapterAllowlist": ["none"],
        "toolAllowlist": ["none"],
        "authority": {
            "issuerId": "operator",
            "authorityRef": "authority:review-route-35-1",
            "valid": True,
        },
        "issuance": {
            "issuedAt": "2026-07-22T11:55:00.000Z",
            "expiresAt": "2026-07-22T12:30:00.000Z",
            "revocationState": "active",
            "cancellationState": "active",
            "singleUse": True,
        },
        "scope": {"dataClass": "metadata_only", "evidenceRefs": [EVIDENCE_REF]},
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def test_disclosure_packet_python_contract_matches_report_only_shape() -> None:
    assert validate_disclosure_packet(
        _packet(), now=NOW, route_policy=_policy(), immutable_review={"executionJobId": "execution-job:review-35-1", "exactHead": EXACT_HEAD, "digest": DIGEST}
    ) == {"ok": True, "reasons": []}


def test_disclosure_packet_python_contract_matches_simulated_adapter_pair() -> None:
    policy = {**_policy(), "adapterAllowlist": ["none", SIMULATED_REVIEW_ADAPTER_ID]}
    packet = {**_packet(), "routeAllowlist": ["simulated"], "adapterAllowlist": [SIMULATED_REVIEW_ADAPTER_ID]}
    assert validate_disclosure_packet(packet, now=NOW, route_policy=policy) == {"ok": True, "reasons": []}

    mismatch = validate_disclosure_packet({**packet, "adapterAllowlist": ["none"]}, now=NOW, route_policy=policy)
    assert mismatch["ok"] is False
    assert "route_adapter_pair_invalid" in mismatch["reasons"]

    multi = {**_packet(), "routeAllowlist": ["report_only", "simulated"], "adapterAllowlist": ["none", SIMULATED_REVIEW_ADAPTER_ID]}
    assert validate_disclosure_packet(multi, now=NOW, route_policy=policy)["ok"] is True
    asymmetric = validate_disclosure_packet({**multi, "adapterAllowlist": ["none"]}, now=NOW, route_policy=policy)
    assert "route_adapter_pair_invalid" in asymmetric["reasons"]


def test_python_validates_normalized_simulation_shapes_fail_closed() -> None:
    key = f"{EXACT_HEAD}:{DIGEST}:metadata:review-route:1:simulated-metadata-boundary/v1"
    finding = {"schemaVersion": "normalized-finding/v1", "findingId": f"normalized-finding:sha256:{hashlib.sha256(key.encode()).hexdigest()}", "rule": "simulated-metadata-boundary/v1", "severity": "info", "pathOrRef": "metadata:review-route", "lineOrRange": "1", "summary": "Bounded fixture finding.", "remediation": "Re-evaluate the bounded fixture.", "reviewedHead": EXACT_HEAD, "digest": DIGEST}
    assert validate_normalized_finding(finding)["ok"] is True
    assert validate_normalized_finding({**finding, "prompt": "no"})["ok"] is False
    reversed_range = {**finding, "lineOrRange": "10-2"}
    reversed_key = f"{EXACT_HEAD}:{DIGEST}:metadata:review-route:10-2:simulated-metadata-boundary/v1"
    reversed_range["findingId"] = f"normalized-finding:sha256:{hashlib.sha256(reversed_key.encode()).hexdigest()}"
    assert validate_normalized_finding(reversed_range)["ok"] is False
    result = {"schemaVersion": "simulated-review-result/v2", "adapterId": SIMULATED_REVIEW_ADAPTER_ID, "state": "completed", "code": "simulated_completed", "findings": [finding], "disclosurePacketId": "disclosure-packet:review-35-1", "disclosurePacketDigest": DISCLOSURE_PACKET_DIGEST, "decisionId": "review-route-decision:fixture", "reviewedHead": EXACT_HEAD, "digest": DIGEST, "deliveryEvidenceEligible": False, "safeFallback": {"action": "retain_report_only", "summary": "bounded"}, "execution": "none"}
    assert validate_simulated_review_result(result)["ok"] is True
    assert validate_simulated_review_result({**result, "state": "stale", "findings": [finding]})["ok"] is False
    assert validate_simulated_review_result({**result, "deliveryEvidenceEligible": True})["ok"] is False
    assert validate_simulated_review_result({**result, "disclosurePacketDigest": None})["ok"] is False
    assert validate_simulated_review_result({**result, "code": "simulated_deduplicated", "findings": [finding]})["ok"] is False


def test_disclosure_packet_python_contract_fails_closed_for_unsafe_or_stale_inputs() -> None:
    cases = [
        ({**_packet(), "unknown": True}, "unknown_field"),
        ({**_packet(), "scope": {**_packet()["scope"], "prompt": "no"}}, "forbidden_field"),
        ({**_packet(), "routeAllowlist": ["unapproved-route"]}, "route_not_allowed"),
        ({**_packet(), "authority": {**_packet()["authority"], "valid": False}}, "authority_invalid"),
        ({**_packet(), "immutableReview": {**_packet()["immutableReview"], "executionJobId": "execution-job:other"}}, "immutable_identity_mismatch"),
        ({**_packet(), "issuance": {**_packet()["issuance"], "revocationState": "revoked"}}, "packet_revoked"),
        ({**_packet(), "issuance": {**_packet()["issuance"], "expiresAt": "2026-07-22T11:59:59.000Z"}}, "packet_expired"),
        ({**_packet(), "issuance": {**_packet()["issuance"], "issuedAt": "2026-07-22T11:55:00"}}, "issuance_invalid"),
        ({**_packet(), "scope": {**_packet()["scope"], "evidenceRefs": [{}]}}, "evidence_ref_allowlist_invalid"),
        ({**_packet(), "scope": {**_packet()["scope"], "evidenceRefs": ["evidence:sk-proj-abcdefghijklmnop"]}}, "evidence_ref_allowlist_invalid"),
        ({**_packet(), "scope": {**_packet()["scope"], "evidenceRefs": ["evidence:\ud800"]}}, "packet_malformed"),
        ({**_packet(), "routeAllowlist": [["report_only"]]}, "route_allowlist_invalid"),
        ({**_packet(), "adapterAllowlist": ["live-adapter"]}, "adapter_allowlist_invalid"),
        ({**_packet(), "toolAllowlist": ["live-tool"]}, "tool_allowlist_invalid"),
        ({**_packet(), "scope": {1: "malformed-key"}}, "packet_malformed"),
        ({**_packet(), "scope": {**_packet()["scope"], "evidenceRefs": ["evidence:é" * 9000]}}, "packet_oversize"),
    ]
    for packet, expected_reason in cases:
        result = validate_disclosure_packet(packet, now=NOW, route_policy=_policy(), immutable_review={"executionJobId": "execution-job:review-35-1", "exactHead": EXACT_HEAD, "digest": DIGEST})
        assert result["ok"] is False
        assert expected_reason in result["reasons"]


def test_disclosure_packet_rejects_live_capable_policy_extras_and_list_subclasses() -> None:
    policy_with_live_route = {**_policy(), "routeAllowlist": ["report_only", "simulated", "live-route"]}
    policy_result = validate_disclosure_packet(_packet(), now=NOW, route_policy=policy_with_live_route)
    assert policy_result["ok"] is False
    assert "route_not_allowed" in policy_result["reasons"]

    class HookedList(list):
        pass

    packet_result = validate_disclosure_packet({**_packet(), "routeAllowlist": HookedList(["report_only"])}, now=NOW, route_policy=_policy())
    assert packet_result["ok"] is False
    assert "route_allowlist_invalid" in packet_result["reasons"]


def test_disclosure_packet_serialized_ceiling_accepts_exact_16kib_and_rejects_one_more_byte() -> None:
    base = {"padding": ""}
    exact = {"padding": "x" * (DISCLOSURE_PACKET_MAX_UTF8_BYTES - disclosure_packet_utf8_bytes(base))}
    over = {"padding": f"{exact['padding']}x"}
    assert disclosure_packet_utf8_bytes(exact) == DISCLOSURE_PACKET_MAX_UTF8_BYTES
    assert is_disclosure_packet_size_allowed(exact) is True
    assert disclosure_packet_utf8_bytes(over) == DISCLOSURE_PACKET_MAX_UTF8_BYTES + 1
    assert is_disclosure_packet_size_allowed(over) is False
