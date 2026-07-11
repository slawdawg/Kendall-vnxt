"""Run the bounded local-proof Operational Pipeline Action Loop smoke.

The smoke uses a disposable SQLite database and the real FastAPI routes. It
does not contact providers, launch workers, or retain raw payloads. Its
evidence level is limited to the supervisor/API/local SQLite behavior covered
by this script; broader queue, lease, worker, and restart proof remains out of
scope.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


def fail(message: str) -> None:
    raise RuntimeError(message)


def require(response, expected_status: int, label: str) -> dict:
    if response.status_code != expected_status:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        fail(f"{label} did not return a data envelope")
    return payload["data"]


def require_rejected(response, label: str, message_fragment: str) -> None:
    if response.status_code != 400:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    error = payload.get("detail", {}).get("error", {}) if isinstance(payload, dict) else {}
    if error.get("code") != "invalid_pipeline_operational_action":
        fail(f"{label} did not return the typed action rejection: {response.text[:240]}")
    if message_fragment not in error.get("message", ""):
        fail(f"{label} did not explain the typed rejection: {response.text[:240]}")


def issue_approval(client, packet: dict, *, action_id: str, actor_id: str, key: str) -> dict:
    return require(
        client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": action_id,
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "requestedBy": {"actorType": "operator", "actorId": actor_id, "actorLabel": "Smoke operator"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "metadataOnly": True,
                "rawPayloadRetained": False,
            },
        ),
        200,
        f"{key} approval",
    )


def apply_gated_action(
    client,
    packet: dict,
    approval: dict,
    *,
    action_id: str,
    actor_id: str,
    idempotency_key: str,
    evidence_ref: str,
    test_result: str | None = None,
) -> dict:
    return require(
        client.post(
            "/pipeline-control-plane/actions",
            json={
                "actionId": action_id,
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "idempotencyKey": idempotency_key,
                "correlationId": f"corr:{idempotency_key}",
                "requestedBy": {"actorType": "operator", "actorId": actor_id, "actorLabel": "Smoke operator"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "approvalId": approval["approvalId"],
                "expectedCurrentEventId": approval["expectedCurrentEventId"],
                "operatorIntentSummary": "Record a bounded metadata-only operator decision.",
                "evidenceRefs": [evidence_ref],
                "testResult": test_result,
                "metadataOnly": True,
                "rawPayloadRetained": False,
            },
        ),
        200,
        f"{action_id} action",
    )


def packet_detail(projection: dict, packet_id: str) -> dict:
    try:
        return next(item for item in projection["selectedPacketDetails"] if item["packetId"] == packet_id)
    except StopIteration as exc:
        fail(f"projection did not include packet {packet_id}")
        raise AssertionError from exc


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="kendall-pipeline-smoke-") as temp_dir:
        db_path = Path(temp_dir) / "smoke.db"
        os.environ["SUPERVISOR_DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
        os.environ["SUPERVISOR_ENABLE_BACKGROUND"] = "false"
        source_ref = {
            "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md",
            "sourceType": "prd",
            "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md",
            "title": "Operational pipeline action loop",
        }
        ready_to_test = {
            "readyId": "ready:operational-pipeline-smoke",
            "userFacingSummary": "The bounded operational action loop is ready to test.",
            "testableSurface": "/pipeline packet detail actions",
            "verificationRefs": ["test:pipeline-operational-smoke"],
            "evidenceRefs": ["evidence:pipeline-operational-smoke"],
        }

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
        from fastapi.testclient import TestClient
        from supervisor.api.main import app

        with TestClient(app) as client:
            packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-pipeline-operational-smoke",
                        "title": "Pipeline operational smoke packet",
                        "initialStage": "review",
                        "status": "waiting",
                        "truthLabel": "source_owned",
                        "sourceRef": source_ref,
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": "create-pipeline-operational-smoke",
                        "correlationId": "corr:create-pipeline-operational-smoke",
                        "evidenceRefs": ["test:pipeline-operational-smoke"],
                        "readyToTest": ready_to_test,
                        "metadataOnly": True,
                        "rawPayloadRetained": False,
                    },
                ),
                200,
                "packet seed",
            )
            if packet["sourceRef"] != source_ref or packet["truthLabel"] != "source_owned":
                fail("packet seed did not preserve the current source-owned PRD ref")

            initial_projection = require(client.get("/pipeline-control-plane/projection"), 200, "initial projection")
            if initial_projection["runtimeReadiness"]["operationalMode"] != "local_proof":
                fail("projection did not report local_proof runtime readiness")
            if initial_projection["fixtureMode"]["enabled"] or initial_projection["truthSummary"]["fixtureBacked"]:
                fail("projection unexpectedly used fixture state")
            initial_detail = packet_detail(initial_projection, packet["packetId"])
            if initial_detail["readyToTest"]["readyId"] != ready_to_test["readyId"]:
                fail("ready-to-test metadata did not survive projection")

            actor_id = "smoke-operator"
            first_approval = issue_approval(
                client,
                packet,
                action_id="mark_tested",
                actor_id=actor_id,
                key="smoke-mark-tested-first",
            )
            second_approval = issue_approval(
                client,
                packet,
                action_id="mark_tested",
                actor_id=actor_id,
                key="smoke-mark-tested-second",
            )
            if first_approval["expectedCurrentEventId"] != packet["currentEventId"]:
                fail("server-issued approval was not bound to the packet event returned by the seed route")
            if second_approval["expectedCurrentEventId"] != packet["currentEventId"]:
                fail("second server-issued approval was not bound to the same old packet event")

            missing_approval_payload = {
                "actionId": "mark_tested",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "idempotencyKey": "smoke-mark-tested-without-approval",
                "correlationId": "corr:smoke-mark-tested-without-approval",
                "requestedBy": {"actorType": "operator", "actorId": actor_id, "actorLabel": "Smoke operator"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "expectedCurrentEventId": packet["currentEventId"],
                "operatorIntentSummary": "Attempt a gated action without a supervisor-issued approval.",
                "evidenceRefs": ["evidence:missing-approval-request"],
                "testResult": "pass",
                "metadataOnly": True,
                "rawPayloadRetained": False,
            }
            missing_approval_response = client.post("/pipeline-control-plane/actions", json=missing_approval_payload)
            require_rejected(missing_approval_response, "gated action without approval", "server-issued approval id")

            action = apply_gated_action(
                client,
                packet,
                first_approval,
                action_id="mark_tested",
                actor_id=actor_id,
                idempotency_key="smoke-mark-tested-pass",
                evidence_ref="evidence:operator-test-decision",
                test_result="pass",
            )
            duplicate = apply_gated_action(
                client,
                packet,
                first_approval,
                action_id="mark_tested",
                actor_id=actor_id,
                idempotency_key="smoke-mark-tested-pass",
                evidence_ref="evidence:operator-test-decision",
                test_result="pass",
            )
            if action["outcome"] != "succeeded" or action["resultingStage"] != "promote":
                fail("approved mark_tested did not advance the packet to promote")
            if action["approvalId"] != first_approval["approvalId"]:
                fail("mark_tested result did not retain the server-issued approval id")
            if duplicate["actionRecordId"] != action["actionRecordId"]:
                fail("idempotent action replay returned a different action record")

            stale_response = client.post(
                "/pipeline-control-plane/actions",
                json={
                    "actionId": "mark_tested",
                    "targetType": "work_packet",
                    "targetId": packet["packetId"],
                    "idempotencyKey": "smoke-mark-tested-stale-second-approval",
                    "correlationId": "corr:smoke-mark-tested-stale-second-approval",
                    "requestedBy": {"actorType": "operator", "actorId": actor_id, "actorLabel": "Smoke operator"},
                    "requestedAuthorityState": "needs_product_approval",
                    "requestedRiskTier": "medium",
                    "approvalId": second_approval["approvalId"],
                    "expectedCurrentEventId": second_approval["expectedCurrentEventId"],
                    "operatorIntentSummary": "Attempt to apply an approval bound to the old packet event.",
                    "evidenceRefs": ["evidence:stale-approval-attempt"],
                    "testResult": "notes",
                    "metadataOnly": True,
                    "rawPayloadRetained": False,
                },
            )
            require_rejected(stale_response, "stale second approval", "stale")

            rework_packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-pipeline-operational-rework-smoke",
                        "title": "Pipeline operational rework smoke packet",
                        "initialStage": "review",
                        "status": "waiting",
                        "truthLabel": "source_owned",
                        "sourceRef": source_ref,
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": "create-pipeline-operational-rework-smoke",
                        "correlationId": "corr:create-pipeline-operational-rework-smoke",
                        "evidenceRefs": ["test:pipeline-operational-smoke"],
                        "readyToTest": {**ready_to_test, "readyId": "ready:operational-rework-smoke"},
                        "metadataOnly": True,
                        "rawPayloadRetained": False,
                    },
                ),
                200,
                "rework packet seed",
            )
            rework_approval = issue_approval(
                client,
                rework_packet,
                action_id="request_rework",
                actor_id=actor_id,
                key="smoke-request-rework",
            )
            rework_action = apply_gated_action(
                client,
                rework_packet,
                rework_approval,
                action_id="request_rework",
                actor_id=actor_id,
                idempotency_key="smoke-request-rework",
                evidence_ref="evidence:operator-rework-decision",
            )
            child_id = rework_action.get("childPacketId")
            if rework_action["outcome"] != "succeeded" or not child_id:
                fail("approved request_rework did not create a child packet")

            blocked_packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-pipeline-operational-blocked-smoke",
                        "title": "Pipeline operational blocked approval packet",
                        "initialStage": "needs_approval",
                        "status": "blocked",
                        "truthLabel": "source_owned",
                        "sourceRef": source_ref,
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": "create-pipeline-operational-blocked-smoke",
                        "correlationId": "corr:create-pipeline-operational-blocked-smoke",
                        "evidenceRefs": ["test:pipeline-operational-smoke", "evidence:blocked-approval-packet"],
                        "metadataOnly": True,
                        "rawPayloadRetained": False,
                    },
                ),
                200,
                "blocked packet seed",
            )
            non_approval_blocked_packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-pipeline-operational-worker-blocked-smoke",
                        "title": "Pipeline operational worker-blocked smoke packet",
                        "initialStage": "execute",
                        "status": "blocked",
                        "truthLabel": "source_owned",
                        "sourceRef": source_ref,
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": "create-pipeline-operational-worker-blocked-smoke",
                        "correlationId": "corr:create-pipeline-operational-worker-blocked-smoke",
                        "evidenceRefs": ["test:pipeline-operational-smoke", "evidence:worker-blocked-packet"],
                        "metadataOnly": True,
                        "rawPayloadRetained": False,
                    },
                ),
                200,
                "non-approval blocked packet seed",
            )

            projection = require(client.get("/pipeline-control-plane/projection"), 200, "final projection")
            if projection["fixtureMode"]["enabled"] or projection["truthSummary"]["fixtureBacked"]:
                fail("final projection unexpectedly used fixture state")
            main_detail = packet_detail(projection, packet["packetId"])
            rework_detail = packet_detail(projection, rework_packet["packetId"])
            child_detail = packet_detail(projection, child_id)
            blocked_detail = packet_detail(projection, blocked_packet["packetId"])
            non_approval_blocked_detail = packet_detail(projection, non_approval_blocked_packet["packetId"])
            if main_detail["currentStage"] != action["resultingStage"] or main_detail["status"] != action["resultingStatus"]:
                fail("projection packet state did not match the approved mark_tested result")
            if main_detail["truthLabel"] != projection["sourceLabel"]:
                fail("projection packet truth label did not match the backend projection source label")
            if main_detail["sourceRefs"] != [source_ref]:
                fail("projection replaced the authoritative source ref")
            mark_tested_result = next(
                result for result in main_detail["actionResults"] if result["actionRecordId"] == action["actionRecordId"]
            )
            if mark_tested_result["evidenceRefs"] != action["evidenceRefs"]:
                fail("projection action result did not preserve the real action evidence refs")
            if rework_detail["parentPacketId"] is not None or rework_detail["lineageKind"] != "root":
                fail("rework parent packet lineage was changed unexpectedly")
            if child_detail["parentPacketId"] != rework_packet["packetId"] or child_detail["lineageKind"] != "rework":
                fail("projection did not expose the parent-linked rework child")
            if "evidence:operator-rework-decision" not in child_detail["evidenceRefs"]:
                fail("projection did not expose the child creation evidence ref")
            if blocked_detail["currentStage"] != "needs_approval" or blocked_detail["status"] != "blocked":
                fail("projection did not expose the source-backed blocked approval packet")
            if blocked_detail["blocker"] != "Operator approval is required before this packet can advance.":
                fail("blocked approval packet did not expose its typed blocker")
            if blocked_detail["nextAction"] != "Request explicit operator approval before advancing this packet.":
                fail("blocked approval packet did not expose an operator next action")
            if blocked_detail["unblocker"] != "operator":
                fail("blocked approval packet did not expose the computed operator unblocker")
            if "evidence:blocked-approval-packet" not in blocked_detail["evidenceRefs"]:
                fail("blocked approval packet did not expose its evidence ref")
            blocked_capabilities = {capability["actionId"]: capability for capability in blocked_detail["actionCapabilities"]}
            mark_tested_capability = blocked_capabilities.get("mark_tested")
            if not mark_tested_capability or mark_tested_capability["capabilityState"] != "gated":
                fail("blocked approval packet did not expose a gated mark_tested capability")
            if mark_tested_capability["typedReason"] != "test_not_ready":
                fail("blocked approval packet did not expose the typed gated capability reason")
            if blocked_detail["truthLabel"] != projection["sourceLabel"]:
                fail("blocked approval packet truth label did not match the backend projection label")
            if projection["queueSummary"]["blockedCount"] < 1:
                fail("final projection did not count the blocked approval packet")
            if non_approval_blocked_detail["currentStage"] != "execute" or non_approval_blocked_detail["status"] != "blocked":
                fail("projection did not expose the non-approval blocked packet")
            if non_approval_blocked_detail["unblocker"] == "operator":
                fail("non-approval blocked packet was incorrectly attributed to the operator")
            if non_approval_blocked_detail["unblocker"] != "unknown":
                fail("non-approval blocked packet did not retain the unknown unblocker representation")
            if non_approval_blocked_detail["nextAction"] != "Clear the packet blocker before advancing.":
                fail("non-approval blocked packet did not retain its generic blocker next action")
            if projection["runtimeReadiness"]["operationalMode"] != "local_proof":
                fail("final projection changed runtime mode unexpectedly")

            print(
                json.dumps(
                    {
                        "schemaVersion": "pipeline-operational-action-loop-proof/v1",
                        "status": "passed",
                        "evidenceLevel": "integrated_local",
                        "runtimeMode": projection["runtimeReadiness"]["operationalMode"],
                        "packetId": packet["packetId"],
                        "reworkPacketId": rework_packet["packetId"],
                        "reworkChildPacketId": child_id,
                        "resultingStage": action["resultingStage"],
                        "idempotentActionRecordId": action["actionRecordId"],
                        "staleApprovalRejected": True,
                        "missingApprovalRejected": True,
                        "projectionTruthAndLineageVerified": True,
                        "blockedPacketProjectionVerified": True,
                        "blockedPacketUnblocker": blocked_detail["unblocker"],
                        "nonApprovalBlockedPacketProjectionVerified": True,
                        "nonApprovalBlockedPacketUnblocker": non_approval_blocked_detail["unblocker"],
                        "evidenceRefs": [
                            "test:pipeline-operational-smoke",
                            "evidence:pipeline-operational-smoke",
                            "evidence:operator-test-decision",
                            "evidence:operator-rework-decision",
                        ],
                        "metadataOnly": True,
                        "rawPayloadRetained": False,
                        "broaderQueueLeaseWorkerRestartProof": "pending",
                    },
                    sort_keys=True,
                )
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
