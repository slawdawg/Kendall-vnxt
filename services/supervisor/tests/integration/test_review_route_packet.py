import hashlib

from supervisor.domain.review_route import (
    DISCLOSURE_PACKET_MAX_UTF8_BYTES,
    SIMULATED_REVIEW_ADAPTER_ID,
    disclosure_packet_canonical_digest,
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


def _policy() -> dict:
    return {
        "routeAllowlist": ["report_only", "simulated"],
        "adapterAllowlist": ["none"],
        "toolAllowlist": ["none"],
        "policyState": "ready",
        "capabilityState": "supported",
        "resourceState": "ready",
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


def _decision(packet: dict) -> dict:
    identity = packet["immutableReview"]
    decision_key = f"simulated:simulated_prepared:{identity['exactHead']}:{identity['digest']}:{packet['disclosurePacketId']}"
    return {
        "schemaVersion": "review-route-decision/v2", "decisionId": f"review-route-decision:sha256:{hashlib.sha256(decision_key.encode()).hexdigest()}", "state": "simulated",
        "controllingReason": {"code": "simulated_prepared", "summary": "Simulation preparation is recorded without an adapter action."},
        "safeFallback": {"action": "retain_report_only", "summary": "Retain the report-only decision and use separate governance for any later promotion."},
        "immutableReview": identity, "authorityEvidence": {"issuerId": packet["authority"]["issuerId"], "authorityRef": packet["authority"]["authorityRef"], "status": "valid"},
        "disclosurePacketId": packet["disclosurePacketId"], "disclosurePacketDigest": disclosure_packet_canonical_digest(packet), "metadataOnly": True, "rawPayloadRetained": False, "execution": "none",
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
    fixture_key = f"{EXACT_HEAD}:{DIGEST}:metadata:review-route:1:simulated-metadata-boundary/v1"
    fixture = {"schemaVersion": "normalized-finding/v1", "findingId": f"normalized-finding:sha256:{hashlib.sha256(fixture_key.encode()).hexdigest()}", "rule": "simulated-metadata-boundary/v1", "severity": "info", "pathOrRef": "metadata:review-route", "lineOrRange": "1", "summary": "Simulated metadata review is complete without an external adapter action.", "remediation": "Reissue and re-evaluate after the exact review identity changes.", "reviewedHead": EXACT_HEAD, "digest": DIGEST}
    policy = {**_policy(), "adapterAllowlist": ["none", SIMULATED_REVIEW_ADAPTER_ID]}
    packet = {**_packet(), "routeAllowlist": ["simulated"], "adapterAllowlist": [SIMULATED_REVIEW_ADAPTER_ID]}
    packet_digest = disclosure_packet_canonical_digest(packet)
    assert packet_digest is not None
    context = {"canonical_packet": packet, "now": NOW, "route_policy": policy, "prior_findings": [], "current_immutable_review": packet["immutableReview"], "canonical_decision": _decision(packet), "consumed_disclosure_packet_ids": [], "fallback": "none"}
    decision_key = f"simulated:simulated_prepared:{EXACT_HEAD}:{DIGEST}:disclosure-packet:review-35-1"
    result = {"schemaVersion": "simulated-review-result/v2", "adapterId": SIMULATED_REVIEW_ADAPTER_ID, "state": "completed", "code": "simulated_completed", "findings": [fixture], "disclosurePacketId": "disclosure-packet:review-35-1", "disclosurePacketDigest": packet_digest, "decisionId": f"review-route-decision:sha256:{hashlib.sha256(decision_key.encode()).hexdigest()}", "reviewedHead": EXACT_HEAD, "digest": DIGEST, "deliveryEvidenceEligible": False, "safeFallback": {"action": "retain_report_only", "summary": "bounded"}, "execution": "none"}
    assert validate_simulated_review_result(result, **context)["ok"] is True
    assert validate_simulated_review_result(result, canonical_packet=None, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    assert validate_simulated_review_result({**result, "state": "stale", "findings": [finding]}, **context)["ok"] is False
    assert validate_simulated_review_result({**result, "deliveryEvidenceEligible": True}, **context)["ok"] is False
    assert validate_simulated_review_result({**result, "disclosurePacketDigest": None}, **context)["ok"] is False
    assert validate_simulated_review_result({**result, "disclosurePacketDigest": f"sha256:{'e' * 64}"}, **context)["ok"] is False
    assert validate_simulated_review_result({**result, "decisionId": "review-route-decision:forged"}, **context)["ok"] is False
    forged_fixture = {**fixture, "severity": "high"}
    assert validate_simulated_review_result({**result, "findings": [forged_fixture]}, **context)["ok"] is False
    assert validate_simulated_review_result({**result, "code": "simulated_deduplicated", "findings": [finding]}, **context)["ok"] is False
    forged_scope_packet = {**packet, "scope": {**packet["scope"], "evidenceRefs": [f"evidence:sha256:{'e' * 64}"]}}
    assert validate_simulated_review_result(result, canonical_packet=forged_scope_packet, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    forged_authority_packet = {**packet, "authority": {**packet["authority"], "authorityRef": "authority:forged"}}
    assert validate_simulated_review_result(result, canonical_packet=forged_authority_packet, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    forged_identity_packet = {**packet, "immutableReview": {**packet["immutableReview"], "exactHead": "f" * 40}}
    assert validate_simulated_review_result(result, canonical_packet=forged_identity_packet, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    forged_issuance_packet = {**packet, "issuance": {**packet["issuance"], "issuedAt": "2026-07-22T11:56:00.000Z"}}
    assert validate_simulated_review_result(result, canonical_packet=forged_issuance_packet, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    report_only_packet = _packet()
    report_only_result = {**result, "disclosurePacketDigest": disclosure_packet_canonical_digest(report_only_packet)}
    assert validate_simulated_review_result(report_only_result, canonical_packet=report_only_packet, now=NOW, route_policy=_policy(), prior_findings=[])["ok"] is False
    blocked_policy = {**policy, "policyState": "vetoed"}
    assert validate_simulated_review_result(result, canonical_packet=packet, now=NOW, route_policy=blocked_policy, prior_findings=[])["ok"] is False
    unsupported_policy = {**policy, "capabilityState": "unsupported"}
    assert validate_simulated_review_result(result, canonical_packet=packet, now=NOW, route_policy=unsupported_policy, prior_findings=[])["ok"] is False
    blocked_resource_policy = {**policy, "resourceState": "blocked"}
    assert validate_simulated_review_result(result, canonical_packet=packet, now=NOW, route_policy=blocked_resource_policy, prior_findings=[])["ok"] is False
    unknown_policy = {**policy, "policyState": "unknown"}
    deduplicated = {**result, "code": "simulated_deduplicated", "findings": []}
    assert validate_simulated_review_result(deduplicated, **context)["ok"] is False
    assert validate_simulated_review_result(deduplicated, **{**context, "prior_findings": [fixture]})["ok"] is True
    assert validate_simulated_review_result(result, canonical_packet=packet, now=NOW, route_policy=policy, prior_findings=[fixture])["ok"] is False
    assert validate_simulated_review_result(result, canonical_packet=packet, now=NOW, route_policy=policy, prior_findings=[fixture] * 32)["ok"] is False
    altered_fixture = {**fixture, "summary": "Simulated metadata review has been altered without an external adapter action."}
    assert validate_normalized_finding(altered_fixture)["ok"] is True
    assert validate_simulated_review_result(result, canonical_packet=packet, now=NOW, route_policy=policy, prior_findings=[altered_fixture], current_immutable_review=packet["immutableReview"])["ok"] is False
    stale_identity = {**packet["immutableReview"], "exactHead": "f" * 40}
    stale = {**result, "state": "stale", "code": "immutable_identity_stale", "findings": [], "disclosurePacketId": None, "disclosurePacketDigest": None, "decisionId": None, "reviewedHead": stale_identity["exactHead"], "safeFallback": {"action": "reissue_disclosure_packet", "summary": "bounded"}}
    stale_context = {**context, "current_immutable_review": stale_identity}
    assert validate_simulated_review_result(stale, **stale_context)["ok"] is True
    assert validate_simulated_review_result(stale, **context)["ok"] is False
    blocked = {**stale, "state": "blocked", "code": "decision_invalid", "reviewedHead": None, "digest": None, "safeFallback": {"action": "re_evaluate", "summary": "bounded"}}
    assert validate_simulated_review_result(blocked, **context)["ok"] is False
    assert validate_simulated_review_result({**blocked, "reviewedHead": EXACT_HEAD}, **context)["ok"] is False
    invalid_packet = {**packet, "authority": {**packet["authority"], "valid": False}}
    packet_invalid = {**blocked, "code": "packet_invalid", "reviewedHead": EXACT_HEAD, "digest": DIGEST, "safeFallback": {"action": "reissue_disclosure_packet", "summary": "bounded"}}
    assert validate_simulated_review_result(packet_invalid, canonical_packet=invalid_packet, now=NOW, route_policy=policy, prior_findings=[], current_immutable_review=packet["immutableReview"])["ok"] is True
    assert validate_simulated_review_result(packet_invalid, **context)["ok"] is False
    assert validate_simulated_review_result(stale, canonical_packet=invalid_packet, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    assert validate_simulated_review_result({**packet_invalid, "code": "decision_invalid", "safeFallback": {"action": "re_evaluate", "summary": "bounded"}}, canonical_packet=invalid_packet, now=NOW, route_policy=policy, prior_findings=[])["ok"] is False
    policy_vetoed = {**blocked, "code": "policy_vetoed", "reviewedHead": EXACT_HEAD, "digest": DIGEST, "safeFallback": {"action": "resolve_policy_block", "summary": "bounded"}}
    assert validate_simulated_review_result(policy_vetoed, canonical_packet=packet, now=NOW, route_policy=blocked_policy, prior_findings=[], current_immutable_review=packet["immutableReview"])["ok"] is False
    assert validate_simulated_review_result({**policy_vetoed, "reviewedHead": None, "digest": None}, canonical_packet=packet, now=NOW, route_policy=blocked_policy, prior_findings=[])["ok"] is False
    assert validate_simulated_review_result(policy_vetoed, **context)["ok"] is False
    assert validate_simulated_review_result(policy_vetoed, canonical_packet=packet, now=NOW, route_policy=unknown_policy, prior_findings=[])["ok"] is False
    assert validate_simulated_review_result({**policy_vetoed, "reviewedHead": "f" * 40}, canonical_packet=packet, now=NOW, route_policy=blocked_policy, prior_findings=[])["ok"] is False
    assert validate_simulated_review_result(policy_vetoed, **{**context, "route_policy": blocked_policy})["ok"] is True
    capability_blocked = {**policy_vetoed, "code": "capability_unsupported", "safeFallback": {"action": "re_evaluate", "summary": "bounded"}}
    assert validate_simulated_review_result(capability_blocked, **{**context, "route_policy": unsupported_policy})["ok"] is True
    resource_blocked = {**policy_vetoed, "code": "resource_blocked", "safeFallback": {"action": "re_evaluate", "summary": "bounded"}}
    assert validate_simulated_review_result(resource_blocked, **{**context, "route_policy": blocked_resource_policy})["ok"] is True
    packet_used = {**packet_invalid, "code": "packet_already_used"}
    assert validate_simulated_review_result(packet_used, **{**context, "consumed_disclosure_packet_ids": [packet["disclosurePacketId"]]})["ok"] is True
    timed_out = {**packet_invalid, "code": "simulation_timeout", "safeFallback": {"action": "re_evaluate", "summary": "bounded"}}
    assert validate_simulated_review_result(timed_out, **{**context, "fallback": "timeout"})["ok"] is True
    decision_invalid = {**timed_out, "code": "decision_invalid"}
    assert validate_simulated_review_result(decision_invalid, **{**context, "canonical_decision": None})["ok"] is True


def test_simulated_result_python_contract_matches_js_early_copy_and_stale_ordering() -> None:
    policy = {**_policy(), "adapterAllowlist": ["none", SIMULATED_REVIEW_ADAPTER_ID]}
    packet = {**_packet(), "routeAllowlist": ["simulated"], "adapterAllowlist": [SIMULATED_REVIEW_ADAPTER_ID]}
    fixture_key = f"{EXACT_HEAD}:{DIGEST}:metadata:review-route:1:simulated-metadata-boundary/v1"
    fixture = {
        "schemaVersion": "normalized-finding/v1", "findingId": f"normalized-finding:sha256:{hashlib.sha256(fixture_key.encode()).hexdigest()}",
        "rule": "simulated-metadata-boundary/v1", "severity": "info", "pathOrRef": "metadata:review-route", "lineOrRange": "1",
        "summary": "Simulated metadata review is complete without an external adapter action.",
        "remediation": "Reissue and re-evaluate after the exact review identity changes.", "reviewedHead": EXACT_HEAD, "digest": DIGEST,
    }
    packet_digest = disclosure_packet_canonical_digest(packet)
    assert packet_digest is not None
    decision_key = f"simulated:simulated_prepared:{EXACT_HEAD}:{DIGEST}:{packet['disclosurePacketId']}"
    completed = {
        "schemaVersion": "simulated-review-result/v2", "adapterId": SIMULATED_REVIEW_ADAPTER_ID, "state": "completed", "code": "simulated_completed", "findings": [fixture],
        "disclosurePacketId": packet["disclosurePacketId"], "disclosurePacketDigest": packet_digest, "decisionId": f"review-route-decision:sha256:{hashlib.sha256(decision_key.encode()).hexdigest()}",
        "reviewedHead": EXACT_HEAD, "digest": DIGEST, "deliveryEvidenceEligible": False, "safeFallback": {"action": "retain_report_only", "summary": "bounded"}, "execution": "none",
    }
    early_decision_invalid = {
        **completed,
        "state": "blocked",
        "code": "decision_invalid",
        "findings": [],
        "disclosurePacketId": None,
        "disclosurePacketDigest": None,
        "decisionId": None,
        "reviewedHead": None,
        "digest": None,
        "safeFallback": {"action": "re_evaluate", "summary": "bounded"},
    }
    context = {"now": NOW, "prior_findings": [], "current_immutable_review": packet["immutableReview"]}

    # JS rejects extra packet/policy fields before it can trust their identity.
    assert validate_simulated_review_result(early_decision_invalid, canonical_packet={**packet, "extra": True}, route_policy=policy, **context)["ok"] is True
    assert validate_simulated_review_result(early_decision_invalid, canonical_packet=packet, route_policy={**policy, "extra": True}, **context)["ok"] is True
    assert validate_simulated_review_result(early_decision_invalid, canonical_packet={**packet, "scope": {**packet["scope"], "extra": True}}, route_policy=policy, **context)["ok"] is True
    assert validate_simulated_review_result(early_decision_invalid, canonical_packet=packet, route_policy=policy, now=NOW, prior_findings=[], current_immutable_review=None)["ok"] is True
    assert validate_simulated_review_result(early_decision_invalid, canonical_packet={**packet, "extra": True}, route_policy=policy, fallback=[], **context)["ok"] is True

    # Once packet structure is trusted, decision_invalid is identity-bound.
    identity_bound = {**early_decision_invalid, "reviewedHead": EXACT_HEAD, "digest": DIGEST}
    assert validate_simulated_review_result(identity_bound, canonical_packet=packet, route_policy=policy, **context)["ok"] is True
    assert validate_simulated_review_result(identity_bound, canonical_packet=packet, route_policy=policy, now=NOW, prior_findings=[], current_immutable_review={**packet["immutableReview"], "exactHead": "f" * 40})["ok"] is False
    assert validate_simulated_review_result(identity_bound, canonical_packet=packet, route_policy=policy, now=NOW, prior_findings=[], current_immutable_review=None)["ok"] is False

    # Omitted consumption metadata means the same empty list as the JS default.
    assert validate_simulated_review_result(
        completed,
        canonical_packet=packet,
        now=NOW,
        route_policy=policy,
        current_immutable_review=packet["immutableReview"],
        canonical_decision=_decision(packet),
    )["ok"] is True

    class NestedDecisionDict(dict):
        pass

    forged_decision = {**_decision(packet), "immutableReview": NestedDecisionDict(packet["immutableReview"])}
    assert validate_simulated_review_result(identity_bound, canonical_packet=packet, route_policy=policy, canonical_decision=forged_decision, **context)["ok"] is True
    report_only_packet = _packet()
    assert validate_simulated_review_result(
        identity_bound,
        canonical_packet=report_only_packet,
        now=NOW,
        route_policy=_policy(),
        current_immutable_review=report_only_packet["immutableReview"],
        canonical_decision=_decision(report_only_packet),
    )["ok"] is True

    # Staleness is determined before decision, consumption, policy, or prior findings.
    stale_identity = {**packet["immutableReview"], "exactHead": "f" * 40}
    stale = {
        **early_decision_invalid,
        "state": "stale",
        "code": "immutable_identity_stale",
        "reviewedHead": stale_identity["exactHead"],
        "digest": stale_identity["digest"],
        "safeFallback": {"action": "reissue_disclosure_packet", "summary": "bounded"},
    }
    assert validate_simulated_review_result(
        stale,
        canonical_packet=packet,
        now=NOW,
        route_policy={**policy, "policyState": "vetoed"},
        prior_findings={"malformed": "prior findings"},
        current_immutable_review=stale_identity,
        canonical_decision=None,
        consumed_disclosure_packet_ids="malformed",
    )["ok"] is True

    old_head = "d" * 40
    old_key = f"{old_head}:{DIGEST}:metadata:review-route:1:simulated-metadata-boundary/v1"
    old_finding = {**fixture, "reviewedHead": old_head, "findingId": f"normalized-finding:sha256:{hashlib.sha256(old_key.encode()).hexdigest()}"}
    stale_from_prior = {**stale, "reviewedHead": EXACT_HEAD, "digest": DIGEST}
    assert validate_simulated_review_result(
        stale_from_prior,
        canonical_packet=packet,
        now=NOW,
        route_policy=policy,
        prior_findings=[old_finding],
        current_immutable_review=packet["immutableReview"],
        canonical_decision=_decision(packet),
    )["ok"] is True
    assert validate_simulated_review_result(
        identity_bound,
        canonical_packet=packet,
        now=NOW,
        route_policy=policy,
        prior_findings=[{"malformed": "finding"}],
        current_immutable_review=packet["immutableReview"],
        canonical_decision=_decision(packet),
    )["ok"] is True


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
