from __future__ import annotations

import hashlib
import json
import re
import subprocess
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.schemas import (
    OPERATIONAL_ACTION_V1_CONTEXT_FIELDS,
    OPERATIONAL_ACTION_V1_ID_LENGTHS,
    OPERATIONAL_ACTION_V1_POLICY,
    DrainActionContextV1,
    OperationalActionApprovalV1,
    OperationalActionAuthorizationEnvelopeV1,
    OperationalActionRequest,
    OperationalActionRequestV1,
    OperationalActionResultV1,
    PauseActionContextV1,
    ReassignActionContextV1,
    RetryVerificationSuccessEvidenceV1,
    RetryVerificationActionContextV1,
    operational_action_context_digest_payload_v1,
    operational_action_context_digest_sha256_v1,
)
from supervisor.application.service import (
    SERVER_APPLICABLE_OPERATIONAL_ACTIONS,
    SERVER_APPROVABLE_OPERATIONAL_ACTIONS,
    SERVER_UNAVAILABLE_OPERATIONAL_ACTIONS,
    SupervisorService,
)


EXPECTED_POLICY = {
    "retry_verification": {"targetType": "execution_attempt", "authorityState": "needs_authority_approval", "riskTier": "medium"},
    "pause": {"targetType": "runtime", "authorityState": "needs_authority_approval", "riskTier": "low"},
    "drain": {"targetType": "runtime", "authorityState": "needs_authority_approval", "riskTier": "medium"},
    "reassign": {"targetType": "work_packet", "authorityState": "needs_authority_approval", "riskTier": "medium"},
}


def _actor(actor_id: str = "operator-1") -> dict[str, str]:
    return {"actorType": "operator", "actorId": actor_id, "actorLabel": "Operator one"}


def _contexts() -> dict[str, dict[str, object]]:
    return {
        "retry_verification": {
            "kind": "retry_verification",
            "executionAttemptId": "attempt-1",
            "linkedWorkItemId": "work-1",
            "linkedPacketId": "packet-1",
            "expectedWorkItemState": "ready",
            "expectedWorkItemUpdatedAt": "2026-07-14T19:59:59.000Z",
            "expectedAttemptStatus": "failed",
            "expectedAttemptUpdatedAt": "2026-07-14T20:00:00.000Z",
            "expectedPacketCurrentEventId": "event-1",
            "expectedLeaseId": "lease-1",
            "expectedLeaseFencingToken": 7,
            "expectedLeaseActive": False,
        },
        "pause": {"kind": "pause", "expectedRuntimeMode": "running", "expectedRuntimeRevision": 3},
        "drain": {
            "kind": "drain",
            "expectedRuntimeMode": "running",
            "expectedRuntimeRevision": 3,
            "expectedActiveWorkCount": 2,
            "expectedActiveLeaseCount": 1,
            "expectedRunningAttemptCount": 1,
        },
        "reassign": {
            "kind": "reassign",
            "linkedWorkItemId": "work-1",
            "expectedPacketCurrentEventId": "event-1",
            "expectedCurrentOwnerId": "owner-old",
            "newOwnerId": "owner-new",
            "expectedWorkItemState": "ready",
            "expectedWorkItemUpdatedAt": "2026-07-14T19:59:59.000Z",
            "expectedActiveLeaseId": None,
            "expectedRunningAttemptId": None,
        },
    }


def _request(action_id: str) -> dict[str, object]:
    policy = EXPECTED_POLICY[action_id]
    target_id = "attempt-1" if action_id == "retry_verification" else "packet-1" if action_id == "reassign" else "supervisor-runtime"
    context_model = {
        "retry_verification": RetryVerificationActionContextV1,
        "pause": PauseActionContextV1,
        "drain": DrainActionContextV1,
        "reassign": ReassignActionContextV1,
    }[action_id].model_validate(_contexts()[action_id])
    return {
        "schemaVersion": "pipeline-operational-action/v1",
        "actionId": action_id,
        "targetType": policy["targetType"],
        "targetId": target_id,
        "actionContext": context_model.model_dump(mode="json"),
        "actionContextDigestSha256": operational_action_context_digest_sha256_v1(
            action_id,
            policy["targetType"],
            target_id,
            context_model,
        ),
        "idempotencyKey": f"idem-{action_id.replace('_', '-')}",
        "correlationId": "corr-1",
        "requestedBy": _actor(),
        "requestedAuthorityState": policy["authorityState"],
        "requestedRiskTier": policy["riskTier"],
        "approvalId": f"approval-{action_id.replace('_', '-')}",
        "serverBound": True,
        "evidenceRefs": ["verification:operational-action-v1"],
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def _approval(request: dict[str, object]) -> dict[str, object]:
    approval = deepcopy(request)
    approval.pop("idempotencyKey")
    approval.pop("correlationId")
    approval.pop("evidenceRefs")
    approval.update(
        {
            "issuedBy": "supervisor_server",
            "issuedAt": "2026-07-14T20:00:00Z",
            "expiresAt": "2026-07-14T20:05:00Z",
            "consumed": False,
            "consumedAt": None,
            "consumedActionIdempotencyKey": None,
            "consumedActionRecordId": None,
        }
    )
    return approval


def _rebind_context(request: dict[str, object], **overrides: object) -> dict[str, object]:
    rebound = deepcopy(request)
    context = rebound["actionContext"]
    assert isinstance(context, dict)
    context.update(overrides)
    ordered_context = {
        field: context.get(field)
        for field in OPERATIONAL_ACTION_V1_CONTEXT_FIELDS[str(rebound["actionId"])]
    }
    payload = json.dumps(
        {
            "schemaVersion": rebound["schemaVersion"],
            "actionId": rebound["actionId"],
            "targetType": rebound["targetType"],
            "targetId": rebound["targetId"],
            "actionContext": ordered_context,
        },
        separators=(",", ":"),
    )
    rebound["actionContextDigestSha256"] = f"sha256:{hashlib.sha256(payload.encode()).hexdigest()}"
    return rebound


def _typescript_request_issues(request: dict[str, object]) -> list[dict[str, object]]:
    repo_root = Path(__file__).resolve().parents[3]
    script = r'''
const fs = require("node:fs");
const path = require("node:path");
const ts = require(require.resolve("typescript", { paths: [path.join(process.argv[1], "apps/dashboard")] }));
const source = fs.readFileSync(path.join(process.argv[1], "packages/contracts/src/pipeline-control-plane/index.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const contractModule = { exports: {} };
Function("module", "exports", output)(contractModule, contractModule.exports);
process.stdout.write(JSON.stringify(contractModule.exports.validatePipelineOperationalActionRequestV1(JSON.parse(fs.readFileSync(0, "utf8")))));
'''
    completed = subprocess.run(
        ["node", "-e", script, str(repo_root)],
        input=json.dumps(request),
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


def test_typescript_and_python_v1_policy_matrix_are_exactly_aligned() -> None:
    assert OPERATIONAL_ACTION_V1_POLICY == EXPECTED_POLICY
    typescript = (
        Path(__file__).resolve().parents[3]
        / "packages/contracts/src/pipeline-control-plane/index.ts"
    ).read_text(encoding="utf-8")
    for action_id, policy in EXPECTED_POLICY.items():
        pattern = (
            rf'{action_id}: \{{ targetType: "{policy["targetType"]}", '
            rf'authorityState: "{policy["authorityState"]}", riskTier: "{policy["riskTier"]}" \}}'
        )
        assert re.search(pattern, typescript), f"TypeScript policy drift for {action_id}"

    assert OPERATIONAL_ACTION_V1_CONTEXT_FIELDS["retry_verification"] == (
        "kind", "executionAttemptId", "linkedWorkItemId", "linkedPacketId", "expectedWorkItemState",
        "expectedWorkItemUpdatedAt", "expectedAttemptStatus", "expectedAttemptUpdatedAt",
        "expectedPacketCurrentEventId", "expectedLeaseId", "expectedLeaseFencingToken", "expectedLeaseActive",
    )
    assert OPERATIONAL_ACTION_V1_CONTEXT_FIELDS["pause"] == ("kind", "expectedRuntimeMode", "expectedRuntimeRevision")
    assert OPERATIONAL_ACTION_V1_CONTEXT_FIELDS["drain"][-3:] == (
        "expectedActiveWorkCount", "expectedActiveLeaseCount", "expectedRunningAttemptCount"
    )
    assert OPERATIONAL_ACTION_V1_CONTEXT_FIELDS["reassign"][-2:] == (
        "expectedActiveLeaseId", "expectedRunningAttemptId"
    )


@pytest.mark.parametrize("action_id", EXPECTED_POLICY)
def test_v1_requests_accept_only_the_exact_action_binding(action_id: str) -> None:
    assert OperationalActionRequestV1.model_validate(_request(action_id)).actionId == action_id


def test_v1_requests_fail_closed_for_context_fence_target_authority_and_risk_drift() -> None:
    retry = _request("retry_verification")
    del retry["actionContext"]["expectedAttemptUpdatedAt"]  # type: ignore[index]
    with pytest.raises(ValidationError):
        OperationalActionRequestV1.model_validate(retry)

    retry = _request("retry_verification")
    del retry["actionContext"]["expectedWorkItemState"]  # type: ignore[index]
    with pytest.raises(ValidationError):
        OperationalActionRequestV1.model_validate(retry)

    retry = _request("retry_verification")
    del retry["actionContext"]["expectedWorkItemUpdatedAt"]  # type: ignore[index]
    with pytest.raises(ValidationError):
        OperationalActionRequestV1.model_validate(retry)

    retry = _request("retry_verification")
    retry["targetType"] = "work_packet"
    with pytest.raises(ValidationError, match="target/context"):
        OperationalActionRequestV1.model_validate(retry)

    pause = _request("pause")
    pause["requestedAuthorityState"] = "not_required"
    with pytest.raises(ValidationError):
        OperationalActionRequestV1.model_validate(pause)

    pause = _request("pause")
    pause["requestedRiskTier"] = "medium"
    with pytest.raises(ValidationError, match="risk tier"):
        OperationalActionRequestV1.model_validate(pause)

    drain = _request("drain")
    drain["actionContext"]["expectedRuntimeRevision"] = 0  # type: ignore[index]
    with pytest.raises(ValidationError):
        OperationalActionRequestV1.model_validate(drain)

    reassign = _request("reassign")
    reassign["actionContext"]["expectedActiveLeaseId"] = "lease-1"  # type: ignore[index]
    with pytest.raises(ValidationError):
        OperationalActionRequestV1.model_validate(reassign)


def test_v1_identifier_boundaries_match_persistence_without_truncation() -> None:
    retry_context = deepcopy(_contexts()["retry_verification"])
    retry_context.update(
        executionAttemptId="a" * OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"],
        linkedWorkItemId="w" * OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"],
        linkedPacketId="p" * OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet"],
        expectedPacketCurrentEventId="e" * OPERATIONAL_ACTION_V1_ID_LENGTHS["packet_event"],
        expectedLeaseId="l" * OPERATIONAL_ACTION_V1_ID_LENGTHS["queue_lease"],
    )
    assert RetryVerificationActionContextV1.model_validate(retry_context).linkedPacketId == "p" * 80

    reassign_context = deepcopy(_contexts()["reassign"])
    reassign_context.update(
        linkedWorkItemId="w" * OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"],
        expectedPacketCurrentEventId="e" * OPERATIONAL_ACTION_V1_ID_LENGTHS["packet_event"],
        expectedCurrentOwnerId="o" * OPERATIONAL_ACTION_V1_ID_LENGTHS["owner"],
        newOwnerId="n" * OPERATIONAL_ACTION_V1_ID_LENGTHS["owner"],
    )
    assert ReassignActionContextV1.model_validate(reassign_context).newOwnerId == "n" * 100

    retry_intent_at_max = "verification-retry-" + "a" * (
        OPERATIONAL_ACTION_V1_ID_LENGTHS["retry_intent"] - len("verification-retry-")
    )
    retry_evidence = RetryVerificationSuccessEvidenceV1.model_validate(
        {
            "kind": "retry_verification",
            "originalAttemptId": "a" * OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"],
            "retryIntentId": retry_intent_at_max,
            "linkedWorkItemId": "w" * OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"],
            "linkedPacketId": "p" * OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet"],
            "resultingPacketCurrentEventId": "e" * OPERATIONAL_ACTION_V1_ID_LENGTHS["packet_event"],
            "originalAttemptPreserved": True,
            "providerOrWorkerLaunched": False,
        }
    )
    assert retry_evidence.retryIntentId == retry_intent_at_max
    with pytest.raises(ValidationError):
        RetryVerificationSuccessEvidenceV1.model_validate(
            {**retry_evidence.model_dump(), "retryIntentId": f"{retry_intent_at_max}a"}
        )

    request = _request("retry_verification")
    request.update(
        idempotencyKey="i" * OPERATIONAL_ACTION_V1_ID_LENGTHS["idempotency"],
        correlationId="c" * OPERATIONAL_ACTION_V1_ID_LENGTHS["correlation"],
        approvalId="v" * OPERATIONAL_ACTION_V1_ID_LENGTHS["approval"],
    )
    accepted = OperationalActionRequestV1.model_validate(request)
    assert len(accepted.idempotencyKey) == 160
    assert len(accepted.correlationId) == 36
    assert len(accepted.approvalId) == 120

    for field, limit in (
        ("idempotencyKey", OPERATIONAL_ACTION_V1_ID_LENGTHS["idempotency"]),
        ("correlationId", OPERATIONAL_ACTION_V1_ID_LENGTHS["correlation"]),
        ("approvalId", OPERATIONAL_ACTION_V1_ID_LENGTHS["approval"]),
    ):
        oversized = deepcopy(request)
        oversized[field] = "x" * (limit + 1)
        with pytest.raises(ValidationError, match="exact safe identifier"):
            OperationalActionRequestV1.model_validate(oversized)

    oversized_attempt = deepcopy(retry_context)
    oversized_attempt["executionAttemptId"] = "a" * (OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"] + 1)
    with pytest.raises(ValidationError, match="exact safe identifier"):
        RetryVerificationActionContextV1.model_validate(oversized_attempt)

    first_key = SupervisorService._p2_1_packet_event_idempotency_key("i" * 160)
    second_key = SupervisorService._p2_1_packet_event_idempotency_key(("i" * 159) + "j")
    assert len(first_key) == 69
    assert first_key != second_key


@pytest.mark.parametrize(
    ("payload", "accepted"),
    [
        (_rebind_context(_request("reassign"), newOwnerId="owner-new"), True),
        (_rebind_context(_request("reassign"), newOwnerId="owner--new"), False),
        ({**_request("retry_verification"), "evidenceRefs": [f"evidence:{'A' * 160}"]}, True),
        ({**_request("retry_verification"), "evidenceRefs": [f"evidence:{'A' * 161}"]}, False),
        ({**_request("retry_verification"), "evidenceRefs": ["capability:retry-verification"]}, False),
        ({**_request("retry_verification"), "evidenceRefs": ["evidence:../retry-verification"]}, False),
    ],
)
def test_python_and_typescript_v1_grammars_match_at_identifier_and_evidence_boundaries(
    payload: dict[str, object],
    accepted: bool,
) -> None:
    try:
        OperationalActionRequestV1.model_validate(payload)
        python_accepted = True
    except ValidationError:
        python_accepted = False
    typescript_accepted = not _typescript_request_issues(payload)
    assert python_accepted is accepted
    assert typescript_accepted is accepted


def test_context_digest_payload_is_canonical_and_field_ordered() -> None:
    context = RetryVerificationActionContextV1.model_validate(_contexts()["retry_verification"])
    payload = operational_action_context_digest_payload_v1("retry_verification", "execution_attempt", "attempt-1", context)
    assert payload.startswith('{"schemaVersion":"pipeline-operational-action/v1","actionId":"retry_verification"')
    assert list(context.model_dump()) == list(OPERATIONAL_ACTION_V1_CONTEXT_FIELDS["retry_verification"])
    assert PauseActionContextV1.model_validate(_contexts()["pause"]).expectedRuntimeRevision == 3
    assert DrainActionContextV1.model_validate(_contexts()["drain"]).expectedActiveWorkCount == 2
    assert ReassignActionContextV1.model_validate(_contexts()["reassign"]).newOwnerId == "owner-new"


def test_valid_shaped_wrong_digest_is_rejected_for_request_and_approval() -> None:
    request = _request("retry_verification")
    request["actionContextDigestSha256"] = f"sha256:{'a' * 64}"
    with pytest.raises(ValidationError, match="does not match the canonical"):
        OperationalActionRequestV1.model_validate(request)

    valid_request = _request("pause")
    approval = _approval(valid_request)
    approval["actionContextDigestSha256"] = f"sha256:{'a' * 64}"
    with pytest.raises(ValidationError, match="does not match the canonical"):
        OperationalActionApprovalV1.model_validate(approval)


def test_authorization_rejects_digest_context_actor_expiry_and_replay_drift() -> None:
    request = _request("retry_verification")
    approval = _approval(request)
    envelope = {"request": request, "approval": approval, "evaluatedAt": "2026-07-14T20:01:00Z"}
    assert OperationalActionAuthorizationEnvelopeV1.model_validate(envelope).request.targetId == "attempt-1"

    stale = deepcopy(envelope)
    stale["approval"]["actionContext"]["expectedAttemptStatus"] = "timed_out"  # type: ignore[index]
    with pytest.raises(ValidationError, match="does not match the canonical"):
        OperationalActionAuthorizationEnvelopeV1.model_validate(stale)

    digest_mismatch = deepcopy(envelope)
    digest_mismatch["approval"]["actionContextDigestSha256"] = f"sha256:{'0' * 64}"  # type: ignore[index]
    with pytest.raises(ValidationError, match="does not match the canonical"):
        OperationalActionAuthorizationEnvelopeV1.model_validate(digest_mismatch)

    wrong_actor = deepcopy(envelope)
    wrong_actor["approval"]["requestedBy"] = _actor("operator-2")  # type: ignore[index]
    with pytest.raises(ValidationError, match="apply actor"):
        OperationalActionAuthorizationEnvelopeV1.model_validate(wrong_actor)

    expired = deepcopy(envelope)
    expired["evaluatedAt"] = "2026-07-14T20:05:00Z"
    with pytest.raises(ValidationError, match="expired"):
        OperationalActionAuthorizationEnvelopeV1.model_validate(expired)

    consumed = deepcopy(envelope)
    consumed["approval"].update(  # type: ignore[union-attr]
        consumed=True,
        consumedAt="2026-07-14T20:01:00Z",
        consumedActionIdempotencyKey=request["idempotencyKey"],
        consumedActionRecordId="record-1",
    )
    with pytest.raises(ValidationError, match="already consumed"):
        OperationalActionAuthorizationEnvelopeV1.model_validate(consumed)

    replay_conflict = deepcopy(consumed)
    replay_conflict["request"]["idempotencyKey"] = "idem-conflict"  # type: ignore[index]
    with pytest.raises(ValidationError, match="different idempotency key"):
        OperationalActionAuthorizationEnvelopeV1.model_validate(replay_conflict)


def test_runtime_keeps_v1_actions_unsupported_and_preserves_v0_actions() -> None:
    v1_actions = set(EXPECTED_POLICY)
    assert v1_actions == SERVER_UNAVAILABLE_OPERATIONAL_ACTIONS
    assert not v1_actions.intersection(SERVER_APPROVABLE_OPERATIONAL_ACTIONS)
    assert not v1_actions.intersection(SERVER_APPLICABLE_OPERATIONAL_ACTIONS)
    assert {"mark_tested", "request_rework", "requeue", "reject"} == SERVER_APPROVABLE_OPERATIONAL_ACTIONS
    assert {"inspect", "refresh_projection", "mark_tested", "request_rework", "requeue", "reject"} == SERVER_APPLICABLE_OPERATIONAL_ACTIONS

    v0 = OperationalActionRequest.model_validate(
        {
            "schemaVersion": "pipeline-operational-action/v0",
            "actionId": "inspect",
            "targetType": "work_packet",
            "targetId": "packet-1",
            "idempotencyKey": "idem-v0",
            "correlationId": "corr-v0",
            "requestedBy": {"actorType": "manager", "actorId": "manager-1"},
            "requestedAuthorityState": "not_required",
            "requestedRiskTier": "low",
            "evidenceRefs": ["verification:v0-preserved"],
            "metadataOnly": True,
            "rawPayloadRetained": False,
        }
    )
    assert v0.schemaVersion == "pipeline-operational-action/v0"


def test_approval_schema_rejects_non_server_issuer_and_incomplete_consumption() -> None:
    approval = _approval(_request("pause"))
    approval["issuedBy"] = "remote_client"
    with pytest.raises(ValidationError):
        OperationalActionApprovalV1.model_validate(approval)

    approval = _approval(_request("pause"))
    approval["consumed"] = True
    with pytest.raises(ValidationError, match="complete consumption"):
        OperationalActionApprovalV1.model_validate(approval)


def test_runtime_result_requires_explicit_mode_revision_and_preservation_evidence() -> None:
    request = _request("pause")
    result = {
        key: deepcopy(request[key])
        for key in (
            "schemaVersion", "actionId", "targetType", "targetId", "actionContext",
            "actionContextDigestSha256", "serverBound", "metadataOnly", "rawPayloadRetained",
        )
    }
    result.update(
        {
            "outcome": "succeeded",
            "capabilityState": "available",
            "authorityState": "allowed",
            "riskTier": "low",
            "typedReason": None,
            "successEvidence": {
                "kind": "pause",
                "resultingRuntimeMode": "paused",
                "resultingRuntimeRevision": 4,
                "activeWorkCount": 2,
                "intakeStopped": True,
                "activeWorkPreserved": True,
            },
            "evidenceRefs": ["operational-action:pause-result"],
            "correlationId": request["correlationId"],
            "idempotencyKey": request["idempotencyKey"],
            "actionRecordId": "record-1",
            "approvalId": request["approvalId"],
            "replayed": False,
        }
    )
    assert OperationalActionResultV1.model_validate(result).successEvidence.resultingRuntimeRevision == 4
    result["successEvidence"]["resultingRuntimeRevision"] = 3  # type: ignore[index]
    with pytest.raises(ValidationError, match="advance the monotonic runtime revision"):
        OperationalActionResultV1.model_validate(result)


def test_operational_action_v1_timestamp_parity_fixture() -> None:
    fixture_path = Path(__file__).parents[3] / "tests" / "fixtures" / "pipeline-operational-action-v1-timestamps.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    context = deepcopy(_contexts()["reassign"])
    for timestamp in fixture["accepted"]:
        candidate = deepcopy(context)
        candidate["expectedWorkItemUpdatedAt"] = timestamp
        ReassignActionContextV1.model_validate(candidate)
    for timestamp in fixture["rejected"]:
        candidate = deepcopy(context)
        candidate["expectedWorkItemUpdatedAt"] = timestamp
        with pytest.raises(ValidationError, match="canonical RFC3339 timestamp"):
            ReassignActionContextV1.model_validate(candidate)
