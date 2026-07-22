from supervisor.domain.review_route import (
    DISCLOSURE_PACKET_MAX_UTF8_BYTES,
    disclosure_packet_utf8_bytes,
    is_disclosure_packet_size_allowed,
    validate_disclosure_packet,
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


def test_disclosure_packet_serialized_ceiling_accepts_exact_16kib_and_rejects_one_more_byte() -> None:
    base = {"padding": ""}
    exact = {"padding": "x" * (DISCLOSURE_PACKET_MAX_UTF8_BYTES - disclosure_packet_utf8_bytes(base))}
    over = {"padding": f"{exact['padding']}x"}
    assert disclosure_packet_utf8_bytes(exact) == DISCLOSURE_PACKET_MAX_UTF8_BYTES
    assert is_disclosure_packet_size_allowed(exact) is True
    assert disclosure_packet_utf8_bytes(over) == DISCLOSURE_PACKET_MAX_UTF8_BYTES + 1
    assert is_disclosure_packet_size_allowed(over) is False
