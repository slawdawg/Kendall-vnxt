"""Run the bounded integrated-local Operational Pipeline lifecycle proof.

The smoke uses a disposable SQLite database and the real FastAPI routes. It
does not contact providers, launch workers, or retain raw payloads. Its
evidence level is limited to the supervisor/API/local SQLite behavior covered
by this script. It does not claim live or production-observed evidence.
"""

from __future__ import annotations

import json
import asyncio
import hashlib
import importlib
import os
import sqlite3
import sys
import subprocess
import tempfile
from pathlib import Path


def fail(message: str) -> None:
    raise RuntimeError(message)


SERVER_OWNED_LOCAL_OPERATOR = {
    "actorType": "operator",
    "actorId": "pipeline-operator",
    "actorLabel": "Pipeline operator",
}
LOOPBACK_CLIENT = ("127.0.0.1", 50000)


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


def require_approval_rejected(response, label: str, message_fragment: str) -> None:
    if response.status_code != 400:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    error = payload.get("detail", {}).get("error", {}) if isinstance(payload, dict) else {}
    if error.get("code") != "invalid_pipeline_operational_approval":
        fail(f"{label} did not return the typed approval rejection: {response.text[:240]}")
    if message_fragment not in error.get("message", ""):
        fail(f"{label} did not explain the typed approval rejection: {response.text[:240]}")


def require_local_rejected(response, label: str, message_fragment: str) -> None:
    if response.status_code != 409:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    error = payload.get("detail", {}).get("error", {}) if isinstance(payload, dict) else {}
    if not error.get("code", "").startswith("invalid_local_proof"):
        fail(f"{label} did not return the typed local-proof rejection: {response.text[:240]}")
    if message_fragment not in error.get("message", ""):
        fail(f"{label} did not explain the typed rejection: {response.text[:240]}")


def require_typed_422(response, label: str) -> None:
    if response.status_code != 422:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    detail = payload.get("detail") if isinstance(payload, dict) else None
    if not isinstance(detail, list) or not any(isinstance(error, dict) and error.get("type") for error in detail):
        fail(f"{label} did not return typed request-validation errors: {response.text[:240]}")


def require_typed_4xx(response, label: str, code_prefix: str) -> None:
    if not 400 <= response.status_code < 500:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    error = payload.get("detail", {}).get("error", {}) if isinstance(payload, dict) else {}
    if not error.get("code", "").startswith(code_prefix):
        fail(f"{label} did not return the typed rejection {code_prefix}: {response.text[:240]}")


def issue_approval(
    client,
    packet: dict,
    *,
    action_id: str,
    actor_id: str,
    key: str,
    requested_authority_state: str = "needs_product_approval",
    requested_risk_tier: str = "medium",
) -> dict:
    approval = require(
        client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": action_id,
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "requestedBy": {**SERVER_OWNED_LOCAL_OPERATOR, "actorId": actor_id},
                "requestedAuthorityState": requested_authority_state,
                "requestedRiskTier": requested_risk_tier,
                "metadataOnly": True,
                "rawPayloadRetained": False,
            },
        ),
        200,
        f"{key} approval",
    )
    if approval["requestedBy"] != SERVER_OWNED_LOCAL_OPERATOR:
        fail(f"{key} approval did not retain the canonical server-owned local operator identity")
    return approval


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
    requested_authority_state: str = "needs_product_approval",
    requested_risk_tier: str = "medium",
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
                "requestedBy": {**SERVER_OWNED_LOCAL_OPERATOR, "actorId": actor_id},
                "requestedAuthorityState": requested_authority_state,
                "requestedRiskTier": requested_risk_tier,
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


def assert_canonical_trace(proof: dict, packet_id: str, label: str) -> None:
    trace = proof.get("lifecycleTrace")
    if not isinstance(trace, list) or not trace:
        fail(f"{label} did not return a canonical packet/WorkItem lifecycle trace")
    expected_states = {
        ("capture", "waiting"): "queued",
        ("classify", "active"): "triaged",
        ("route", "active"): "ready",
        ("shape", "waiting"): "ready",
        ("needs_approval", "waiting"): "ready",
        ("execute", "active"): "implementing",
        ("review", "waiting"): "reviewing",
        ("execute", "failed"): "needs_rework",
    }
    work_item_id = proof["workItem"]["id"]
    for entry in trace:
        if entry["packetId"] != packet_id or entry["workItemId"] != work_item_id:
            fail(f"{label} trace diverged to another packet or WorkItem: {entry}")
        if entry["packetStage"] != entry["authoritativePacketStage"] or entry["packetStatus"] != entry["authoritativePacketStatus"]:
            fail(f"{label} packet and WorkItem authoritative metadata diverged: {entry}")
        expected_state = expected_states.get((entry["packetStage"], entry["packetStatus"]))
        if expected_state and entry["workItemState"] != expected_state:
            fail(f"{label} packet stage {entry['packetStage']} disagreed with WorkItem state {entry['workItemState']}")
        if not entry["metadataOnly"] or entry["rawPayloadRetained"]:
            fail(f"{label} lifecycle trace crossed the metadata-only boundary")


def assert_authoritative_packet_column_and_uniqueness(db_path: Path, item_id: str, packet_id: str, label: str) -> None:
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT authoritative_packet_id FROM work_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row or row[0] != packet_id:
            fail(f"{label} did not persist authoritative_packet_id={packet_id!r}: {row!r}")
        for index_row in connection.execute("PRAGMA index_list(work_items)").fetchall():
            if not bool(index_row[2]):
                continue
            index_name = index_row[1]
            index_columns = tuple(
                column_row[2]
                for column_row in connection.execute(f"PRAGMA index_info({index_name})").fetchall()
            )
            if index_columns == ("authoritative_packet_id",):
                return
    fail(f"{label} lost the unique authoritative_packet_id database constraint")


def main() -> int:
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 10000))
    designated_temp_root = Path(tempfile.gettempdir()) / "kendall-local-proof-attestations"
    designated_temp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gate4b-", dir=designated_temp_root) as temp_dir:
        db_path = Path(temp_dir) / "smoke.db"
        os.environ["SUPERVISOR_DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
        os.environ["SUPERVISOR_ENABLE_BACKGROUND"] = "false"
        os.environ["SUPERVISOR_ALLOW_DIRTY_REPO"] = "true"
        source_path = "docs/workflows/latest-prd-autonomous-bmad-loop-goal.md"
        source_file = Path(__file__).resolve().parents[3] / source_path
        if not source_file.is_file() or source_file.is_symlink():
            fail(f"tracked source authority is missing or not a regular file: {source_path}")
        tracked_source = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", source_path],
            cwd=source_file.parents[2],
            capture_output=True,
            text=True,
            check=False,
        )
        if tracked_source.returncode != 0 or tracked_source.stdout.strip() != source_path:
            fail(f"source authority is not Git-tracked in the fresh worktree: {source_path}")
        index_source = subprocess.run(
            ["git", "show", f":{source_path}"],
            cwd=source_file.parents[2],
            capture_output=True,
            check=False,
        )
        working_source_bytes = source_file.read_bytes()
        if index_source.returncode != 0 or working_source_bytes != index_source.stdout:
            fail("tracked source authority working-tree bytes did not match the Git index blob")
        source_digest = hashlib.sha256(index_source.stdout).hexdigest()
        source_ref = {
            "refId": f"repo_doc:{source_path}",
            "sourceType": "repo_doc",
            "pathOrUrl": source_path,
            "title": "Latest PRD autonomous BMAD loop goal",
            "contentSha256": source_digest,
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
        from supervisor.api.main import app, service
        from supervisor.application.service import LOCAL_PROOF_TEST_CAPABILITY

        client = TestClient(app, client=LOOPBACK_CLIENT)
        client.__enter__()
        client_closed = False
        try:
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
                fail("packet seed did not preserve the tracked source-owned authority ref")

            initial_projection = require(client.get("/pipeline-control-plane/projection"), 200, "initial projection")
            if initial_projection["runtimeReadiness"]["operationalMode"] not in {"unavailable", "read_only"}:
                fail("capability-off projection incorrectly reported an operational runtime mode")
            if initial_projection["runtimeReadiness"]["capabilityState"] != "unavailable" or initial_projection["runtimeReadiness"]["readinessState"] != "unavailable":
                fail("projection did not report the server local-proof capability as unavailable before enablement")
            if initial_projection["runtimeReadiness"]["operationalMode"] == "unavailable" and initial_projection["runtimeReadiness"]["capabilityState"] != "unavailable":
                fail("unavailable projection mode did not agree with its capability state")
            if initial_projection["fixtureMode"]["enabled"] or initial_projection["truthSummary"]["fixtureBacked"]:
                fail("projection unexpectedly used fixture state")
            initial_detail = packet_detail(initial_projection, packet["packetId"])
            if initial_detail["readyToTest"]["readyId"] != ready_to_test["readyId"]:
                fail("ready-to-test metadata did not survive projection")

            actor_id = SERVER_OWNED_LOCAL_OPERATOR["actorId"]
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
                "requestedBy": {**SERVER_OWNED_LOCAL_OPERATOR},
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
            post_action_packet = require(
                client.get(f"/pipeline-control-plane/work-packets/{packet['packetId']}"),
                200,
                "post-action authoritative packet",
            )
            if post_action_packet["history"][-1]["actor"] != SERVER_OWNED_LOCAL_OPERATOR:
                fail("approved mark_tested did not persist the canonical server-owned local operator identity")

            stale_response = client.post(
                "/pipeline-control-plane/actions",
                json={
                    "actionId": "mark_tested",
                    "targetType": "work_packet",
                    "targetId": packet["packetId"],
                    "idempotencyKey": "smoke-mark-tested-stale-second-approval",
                    "correlationId": "corr:smoke-mark-tested-stale-second-approval",
                    "requestedBy": {**SERVER_OWNED_LOCAL_OPERATOR},
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
            requeue_nonblocked_before = require(
                client.get(f"/pipeline-control-plane/work-packets/{rework_packet['packetId']}"),
                200,
                "non-blocked requeue packet before approval",
            )
            requeue_nonblocked_approval = client.post(
                "/pipeline-control-plane/approvals",
                json={
                    "actionId": "requeue",
                    "targetType": "work_packet",
                    "targetId": rework_packet["packetId"],
                    "requestedBy": {**SERVER_OWNED_LOCAL_OPERATOR},
                    "requestedAuthorityState": "needs_authority_approval",
                    "requestedRiskTier": "medium",
                    "metadataOnly": True,
                    "rawPayloadRetained": False,
                },
            )
            require_approval_rejected(requeue_nonblocked_approval, "non-blocked requeue approval", "currently blocked")
            requeue_nonblocked_after = require(
                client.get(f"/pipeline-control-plane/work-packets/{rework_packet['packetId']}"),
                200,
                "non-blocked requeue packet after rejected approval",
            )
            if (
                requeue_nonblocked_after["status"] != requeue_nonblocked_before["status"]
                or requeue_nonblocked_after["currentEventId"] != requeue_nonblocked_before["currentEventId"]
            ):
                fail("non-blocked requeue approval mutated its authoritative packet")

            def seed_blocked_requeue_packet(packet_id: str) -> dict:
                return require(
                    client.post(
                        "/pipeline-control-plane/work-packets",
                        json={
                            "packetId": packet_id,
                            "title": "Pipeline operational requeue guard packet",
                            "initialStage": "needs_approval",
                            "status": "blocked",
                            "truthLabel": "source_owned",
                            "sourceRef": source_ref,
                            "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                            "idempotencyKey": f"create-{packet_id}",
                            "correlationId": f"corr:create-{packet_id}",
                            "metadataOnly": True,
                            "rawPayloadRetained": False,
                        },
                    ),
                    200,
                    f"{packet_id} blocked requeue packet seed",
                )

            requeue_packet = seed_blocked_requeue_packet("packet-pipeline-operational-requeue-smoke")
            requeue_approval = issue_approval(
                client,
                requeue_packet,
                action_id="requeue",
                actor_id=actor_id,
                key="blocked-requeue",
                requested_authority_state="needs_authority_approval",
            )
            requeue_action = apply_gated_action(
                client,
                requeue_packet,
                requeue_approval,
                action_id="requeue",
                actor_id=actor_id,
                idempotency_key="blocked-requeue",
                evidence_ref="evidence:blocked-requeue",
                requested_authority_state="needs_authority_approval",
            )
            if requeue_action["outcome"] != "succeeded" or requeue_action["resultingStatus"] != "waiting":
                fail("blocked requeue did not return the packet to waiting")

            requeue_apply_guard_packet = seed_blocked_requeue_packet("packet-pipeline-operational-requeue-apply-guard")
            requeue_apply_guard_approval = issue_approval(
                client,
                requeue_apply_guard_packet,
                action_id="requeue",
                actor_id=actor_id,
                key="non-blocked-requeue-apply",
                requested_authority_state="needs_authority_approval",
            )
            requeue_apply_guard_transition = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{requeue_apply_guard_packet['packetId']}/transitions",
                    json={
                        "targetStage": "execute",
                        "expectedCurrentEventId": requeue_apply_guard_packet["currentEventId"],
                        "status": "waiting",
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": "transition-non-blocked-requeue-apply",
                        "correlationId": "corr:transition-non-blocked-requeue-apply",
                    },
                ),
                200,
                "non-blocked requeue apply transition",
            )
            requeue_apply_guard_response = client.post(
                "/pipeline-control-plane/actions",
                json={
                    "actionId": "requeue",
                    "targetType": "work_packet",
                    "targetId": requeue_apply_guard_packet["packetId"],
                    "idempotencyKey": "non-blocked-requeue-apply",
                    "correlationId": "corr:non-blocked-requeue-apply",
                    "requestedBy": {**SERVER_OWNED_LOCAL_OPERATOR},
                    "requestedAuthorityState": "needs_authority_approval",
                    "requestedRiskTier": "medium",
                    "approvalId": requeue_apply_guard_approval["approvalId"],
                    "expectedCurrentEventId": requeue_apply_guard_approval["expectedCurrentEventId"],
                    "operatorIntentSummary": "Attempt requeue after packet leaves blocked state.",
                    "evidenceRefs": ["evidence:non-blocked-requeue-apply"],
                    "metadataOnly": True,
                    "rawPayloadRetained": False,
                },
            )
            require_rejected(requeue_apply_guard_response, "non-blocked requeue apply", "currently blocked")
            requeue_apply_guard_after = require(
                client.get(f"/pipeline-control-plane/work-packets/{requeue_apply_guard_packet['packetId']}"),
                200,
                "non-blocked requeue apply packet after rejection",
            )
            if (
                requeue_apply_guard_after["status"] != "waiting"
                or requeue_apply_guard_after["currentEventId"] != requeue_apply_guard_transition["currentEventId"]
            ):
                fail("non-blocked requeue apply mutated the packet after its guard transition")

            def seed_local_packet(item_id: str) -> dict:
                return require(
                    client.post(
                        "/pipeline-control-plane/work-packets",
                        json={
                            "packetId": f"packet-gate-4b-{item_id}",
                            "title": f"Gate 4B canonical local proof {item_id}",
                            "initialStage": "capture",
                            "status": "waiting",
                            "truthLabel": "source_owned",
                            "sourceRef": source_ref,
                            "actor": {"actorType": "manager", "actorId": "gate-4b-proof", "actorLabel": "Gate 4B proof"},
                            "idempotencyKey": f"create-gate-4b-{item_id}",
                            "correlationId": f"corr:create-gate-4b-{item_id}",
                            "evidenceRefs": ["test:pipeline-operational-smoke"],
                        },
                    ),
                    200,
                    f"{item_id} authoritative source-backed packet seed",
                )

            happy_packet = seed_local_packet("happy")
            disabled_proof = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-capability-disabled",
                    "correlationId": "corr:gate-4b-capability-disabled",
                    "scenario": "happy",
                },
            )
            require_local_rejected(disabled_proof, "local proof without server capability", "disabled by the server")
            service.enable_local_proof_for_test(LOCAL_PROOF_TEST_CAPABILITY, db_path)
            service.settings.database_url = f"sqlite+aiosqlite:///{Path(temp_dir) / 'arbitrary.db'}"
            arbitrary_database_proof = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-arbitrary-db",
                    "correlationId": "corr:gate-4b-arbitrary-db",
                    "scenario": "happy",
                },
            )
            require_local_rejected(arbitrary_database_proof, "arbitrary SQLite database", "does not match the server-created disposable attestation")
            service.settings.database_url = f"sqlite+aiosqlite:///{db_path}"
            service.settings.allow_worker_network = True
            unsafe_settings_readiness = require(
                client.get("/pipeline-control-plane/projection"),
                200,
                "unsafe local-proof settings readiness",
            )["runtimeReadiness"]
            if (
                unsafe_settings_readiness["operationalMode"] != "unavailable"
                or unsafe_settings_readiness["readinessState"] != "unavailable"
                or unsafe_settings_readiness["capabilityState"] != "unavailable"
                or unsafe_settings_readiness["typedReason"] != "runtime_unavailable"
            ):
                fail("runtime readiness advertised local proof despite externally-authorized supervisor settings")
            service.settings.allow_worker_network = False
            ready_settings_readiness = require(
                client.get("/pipeline-control-plane/projection"),
                200,
                "safe local-proof settings readiness",
            )["runtimeReadiness"]
            if (
                ready_settings_readiness["operationalMode"] != "local_proof"
                or ready_settings_readiness["readinessState"] != "ready"
                or ready_settings_readiness["capabilityState"] != "available"
            ):
                fail("runtime readiness did not restore the safe attested local-proof path")
            uppercase_digest_packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-gate-4b-uppercase-source-digest",
                        "title": "Gate 4B uppercase source digest proof",
                        "initialStage": "capture",
                        "status": "waiting",
                        "truthLabel": "source_owned",
                        "sourceRef": {**source_ref, "contentSha256": source_digest.upper()},
                        "actor": {"actorType": "manager", "actorId": "gate-4b-proof", "actorLabel": "Gate 4B proof"},
                        "idempotencyKey": "create-gate-4b-uppercase-source-digest",
                        "correlationId": "corr:create-gate-4b-uppercase-source-digest",
                    },
                ),
                200,
                "uppercase source digest packet seed",
            )
            if uppercase_digest_packet["sourceRef"]["contentSha256"] != source_digest:
                fail("uppercase source digest was not normalized before packet persistence")
            uppercase_digest_proof = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{uppercase_digest_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-uppercase-source-digest-proof",
                        "correlationId": "corr:gate-4b-uppercase-source-digest-proof",
                        "scenario": "happy",
                    },
                ),
                200,
                "uppercase source digest local proof",
            )
            if uppercase_digest_proof["attempt"]["status"] != "completed":
                fail("uppercase source digest did not complete the local proof")
            public_forgery_work_item = require(
                client.post(
                    "/work-items",
                    json={
                        "title": "Public local-proof forgery WorkItem",
                        "requestedOutcome": "Must not mint a server local-proof attempt.",
                        "source": source_path,
                        "metadata": {"sourceArtifactPath": source_path},
                    },
                ),
                200,
                "public local-proof forgery WorkItem",
            )
            public_forgery_attempt = client.post(
                f"/work-items/{public_forgery_work_item['id']}/execution-attempts",
                json={"stepId": "local-proof", "taskKind": "path_scope_check"},
            )
            require_typed_4xx(public_forgery_attempt, "public local-proof forgery attempt", "invalid_execution_attempt")
            public_forgery_attempts_response = client.get(f"/work-items/{public_forgery_work_item['id']}/execution-attempts")
            if public_forgery_attempts_response.status_code != 200 or public_forgery_attempts_response.json().get("data"):
                fail("public local-proof forgery created an execution attempt despite missing server attestation")
            public_forgery_events_response = client.get(f"/work-items/{public_forgery_work_item['id']}/events")
            if public_forgery_events_response.status_code != 200:
                fail(f"public local-proof forgery event list returned HTTP {public_forgery_events_response.status_code}")
            public_forgery_events = public_forgery_events_response.json().get("data", [])
            if any(event.get("eventType") == "execution_attempt.verification_recorded" for event in public_forgery_events):
                fail("public local-proof forgery created verification evidence")
            public_forgery_readiness = require(
                client.get(f"/work-items/{public_forgery_work_item['id']}/trusted-delivery-eligibility-report"),
                200,
                "public local-proof forgery trusted-delivery readiness",
            )
            if public_forgery_readiness.get("pushPrAutoEligible") is True:
                fail("public local-proof forgery reached trusted-delivery readiness")
            forged_work_item = client.post(
                "/work-items",
                json={
                    "title": "Forged canonical WorkItem",
                    "requestedOutcome": "Must be rejected.",
                    "source": source_path,
                    "metadata": {
                        "authoritativePacketId": happy_packet["packetId"],
                        "localProofAuthority": "integrated_local",
                        "tokenLikeValue": "ghp_1234567890abcdef",
                    },
                },
            )
            if forged_work_item.status_code != 422:
                fail(f"generic WorkItem accepted forged canonical linkage metadata: {forged_work_item.text[:240]}")
            listed_work_items = client.get("/work-items")
            if listed_work_items.status_code != 200 or any(
                item.get("title") == "Forged canonical WorkItem" for item in listed_work_items.json().get("data", [])
            ):
                fail("forged generic WorkItem metadata was persisted")
            unsafe_work_item = client.post(
                "/work-items",
                json={
                    "title": "Unsafe metadata WorkItem",
                    "requestedOutcome": "Must be rejected.",
                    "source": source_path,
                    "metadata": {"opaque": "ghp_1234567890abcdef"},
                },
            )
            if unsafe_work_item.status_code != 422:
                fail(f"generic WorkItem accepted token-like metadata: {unsafe_work_item.text[:240]}")
            safe_prose_work_item = require(
                client.post(
                    "/work-items",
                    json={
                        "title": "Rotate refresh tokens",
                        "requestedOutcome": "Fix response id mapping",
                        "source": source_path,
                        "metadata": {},
                    },
                ),
                200,
                "safe WorkItem security and API prose",
            )
            if safe_prose_work_item["title"] != "Rotate refresh tokens" or safe_prose_work_item["requestedOutcome"] != "Fix response id mapping":
                fail("safe WorkItem security and API prose was not preserved")
            generic_signature_work_item = client.post(
                "/work-items",
                json={
                    "title": "Generic signature WorkItem",
                    "requestedOutcome": "Must reject generic opaque credential-like metadata.",
                    "source": source_path,
                    "metadata": {"opaque": "aB3" * 20},
                },
            )
            if generic_signature_work_item.status_code != 422:
                fail(f"generic WorkItem accepted a long mixed alphanumeric signature: {generic_signature_work_item.text[:240]}")
            node_limit_metadata = {f"node{index:04d}": "safe" for index in range(1001)}
            node_limit_metadata_response = client.post(
                "/work-items",
                json={
                    "title": "Node-limit metadata WorkItem",
                    "requestedOutcome": "Must be rejected at the metadata node limit.",
                    "source": source_path,
                    "metadata": node_limit_metadata,
                },
            )
            require_typed_422(node_limit_metadata_response, "shallow metadata node-limit WorkItem")
            aggregate_metadata = {
                "chunks": [f"safe-metadata-chunk-{index:04d}-{'x' * 130}" for index in range(500)]
            }
            aggregate_size_metadata_response = client.post(
                "/work-items",
                json={
                    "title": "Aggregate-size metadata WorkItem",
                    "requestedOutcome": "Must be rejected at the metadata aggregate-size limit.",
                    "source": source_path,
                    "metadata": aggregate_metadata,
                },
            )
            require_typed_422(aggregate_size_metadata_response, "safe-chunk metadata aggregate-size WorkItem")
            listed_work_items_after_metadata = client.get("/work-items")
            if listed_work_items_after_metadata.status_code != 200 or any(
                item.get("title") in {"Node-limit metadata WorkItem", "Aggregate-size metadata WorkItem"}
                for item in listed_work_items_after_metadata.json().get("data", [])
            ):
                fail("rejected node-limit or aggregate-size metadata created a WorkItem projection")
            with sqlite3.connect(db_path) as metadata_db:
                persisted_metadata_events = metadata_db.execute(
                    "SELECT COUNT(*) FROM workflow_events WHERE payload LIKE ? OR payload LIKE ?",
                    ("%Node-limit metadata WorkItem%", "%Aggregate-size metadata WorkItem%"),
                ).fetchone()[0]
                persisted_metadata_items = metadata_db.execute(
                    "SELECT COUNT(*) FROM work_items WHERE title IN (?, ?)",
                    ("Node-limit metadata WorkItem", "Aggregate-size metadata WorkItem"),
                ).fetchone()[0]
            if persisted_metadata_events or persisted_metadata_items:
                fail("rejected node-limit or aggregate-size metadata persisted a workflow event or WorkItem")
            adversarial_scalar_work_items = [
                (
                    "Unsafe requestedOutcome WorkItem",
                    {"requestedOutcome": "provider=openai response_id=resp-work-item"},
                ),
                (
                    "Unsafe details WorkItem",
                    {"details": "OPENAI_API_KEY=sk-work-item-secret"},
                ),
                (
                    "Prefixed title credential WorkItem",
                    {"title": "prefix ghp_1234567890abcdef"},
                ),
                (
                    "Prefixed requestedOutcome credential WorkItem",
                    {"requestedOutcome": "prefix sk-proj-1234567890abcdef"},
                ),
                (
                    "Prefixed source credential WorkItem",
                    {"source": "prefix AKIA1234567890ABCDEF"},
                ),
                (
                    "Prefixed details credential WorkItem",
                    {"details": "prefix xoxb-1234567890abcdef"},
                ),
                (
                    "Prefixed nested metadata credential WorkItem",
                    {"metadata": {"nested": {"opaque": "prefix github_pat_1234567890abcdef"}}},
                ),
            ]
            for work_item_title, scalar_override in adversarial_scalar_work_items:
                adversarial_scalar_response = client.post(
                    "/work-items",
                    json={
                        "title": work_item_title,
                        "requestedOutcome": "Must be rejected before queued event persistence.",
                        "source": source_path,
                        "metadata": {},
                        **scalar_override,
                    },
                )
                require_typed_422(adversarial_scalar_response, work_item_title)
            with sqlite3.connect(db_path) as adversarial_scalar_db:
                for work_item_title, scalar_override in adversarial_scalar_work_items:
                    unsafe_title = scalar_override.get("title", work_item_title)
                    persisted_item_count = adversarial_scalar_db.execute(
                        "SELECT COUNT(*) FROM work_items WHERE title IN (?, ?)",
                        (work_item_title, unsafe_title),
                    ).fetchone()[0]
                    persisted_event_count = adversarial_scalar_db.execute(
                        "SELECT COUNT(*) FROM workflow_events WHERE payload LIKE ?",
                        (f"%{work_item_title}%",),
                    ).fetchone()[0]
                    if persisted_item_count or persisted_event_count:
                        fail(f"rejected scalar WorkItem {work_item_title} persisted a WorkItem or workflow event")
            adversarial_packet_seeds = [
                (
                    "packet-adversarial-title-safety",
                    "OPENAI_API_KEY=sk-adversarial-secret",
                    source_ref,
                ),
                (
                    "packet-adversarial-source-title-safety",
                    "Safe packet title",
                    {**source_ref, "title": "provider=openai response_id=resp_adversarial"},
                ),
                (
                    "packet-adversarial-prefixed-title-credential",
                    "prefix AKIA1234567890ABCDEF",
                    source_ref,
                ),
                (
                    "packet-adversarial-prefixed-source-title-credential",
                    "Safe packet title",
                    {**source_ref, "title": "prefix sk-proj-1234567890abcdef"},
                ),
            ]
            for packet_id, packet_title, packet_source_ref in adversarial_packet_seeds:
                adversarial_packet_response = client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": packet_id,
                        "title": packet_title,
                        "sourceRef": packet_source_ref,
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": f"create-{packet_id}",
                        "correlationId": f"corr:create-{packet_id}",
                    },
                )
                require_typed_422(adversarial_packet_response, f"adversarial authoritative packet seed {packet_id}")
            with sqlite3.connect(db_path) as adversarial_db:
                for packet_id, _, _ in adversarial_packet_seeds:
                    packet_count = adversarial_db.execute(
                        "SELECT COUNT(*) FROM authoritative_work_packets WHERE id = ?",
                        (packet_id,),
                    ).fetchone()[0]
                    event_count = adversarial_db.execute(
                        "SELECT COUNT(*) FROM authoritative_work_packet_lifecycle_events WHERE packet_id = ?",
                        (packet_id,),
                    ).fetchone()[0]
                    if packet_count or event_count:
                        fail(f"rejected adversarial packet seed {packet_id} persisted a packet or lifecycle event")
            prefixed_credential_families = {
                "glpat": "glpat-1234567890abcdef",
                "npm": "npm_1234567890abcdef",
                "ASIA": "ASIA1234567890ABCDEF",
            }
            for family, signature in prefixed_credential_families.items():
                scalar_title = f"Prefixed {family} scalar credential WorkItem"
                scalar_response = client.post(
                    "/work-items",
                    json={
                        "title": scalar_title,
                        "requestedOutcome": f"prefix {signature}",
                        "source": source_path,
                        "metadata": {},
                    },
                )
                require_typed_422(scalar_response, f"prefixed {family} scalar WorkItem")
                nested_title = f"Prefixed {family} nested credential WorkItem"
                nested_response = client.post(
                    "/work-items",
                    json={
                        "title": nested_title,
                        "requestedOutcome": "Must be rejected before nested metadata persistence.",
                        "source": source_path,
                        "metadata": {"nested": {"opaque": f"prefix {signature}"}},
                    },
                )
                require_typed_422(nested_response, f"prefixed {family} nested metadata WorkItem")
                with sqlite3.connect(db_path) as prefixed_work_item_db:
                    for work_item_title in (scalar_title, nested_title):
                        persisted_item_count = prefixed_work_item_db.execute(
                            "SELECT COUNT(*) FROM work_items WHERE title = ?",
                            (work_item_title,),
                        ).fetchone()[0]
                        persisted_event_count = prefixed_work_item_db.execute(
                            "SELECT COUNT(*) FROM workflow_events WHERE payload LIKE ?",
                            (f"%{work_item_title}%",),
                        ).fetchone()[0]
                        if persisted_item_count or persisted_event_count:
                            fail(f"prefixed {family} WorkItem rejection persisted a WorkItem or workflow event")
                packet_title_id = f"packet-adversarial-prefixed-{family.lower()}-title"
                packet_title_response = client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": packet_title_id,
                        "title": f"prefix {signature}",
                        "sourceRef": source_ref,
                        "idempotencyKey": f"create-{packet_title_id}",
                        "correlationId": f"corr:create-{packet_title_id}",
                    },
                )
                require_typed_422(packet_title_response, f"prefixed {family} packet title")
                source_title_id = f"packet-adversarial-prefixed-{family.lower()}-source-title"
                source_title_response = client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": source_title_id,
                        "title": "Safe packet title",
                        "sourceRef": {**source_ref, "title": f"prefix {signature}"},
                        "idempotencyKey": f"create-{source_title_id}",
                        "correlationId": f"corr:create-{source_title_id}",
                    },
                )
                require_typed_422(source_title_response, f"prefixed {family} source title")
                with sqlite3.connect(db_path) as prefixed_packet_db:
                    for packet_id in (packet_title_id, source_title_id):
                        packet_count = prefixed_packet_db.execute(
                            "SELECT COUNT(*) FROM authoritative_work_packets WHERE id = ?",
                            (packet_id,),
                        ).fetchone()[0]
                        event_count = prefixed_packet_db.execute(
                            "SELECT COUNT(*) FROM authoritative_work_packet_lifecycle_events WHERE packet_id = ?",
                            (packet_id,),
                        ).fetchone()[0]
                        if packet_count or event_count:
                            fail(f"prefixed {family} packet-title rejection persisted a packet or lifecycle event")
            repo_root = Path(__file__).resolve().parents[3]
            untracked_source_dir = repo_root / "docs/workflows"
            untracked_fd, untracked_source_name = tempfile.mkstemp(
                prefix=".gate4b-untracked-source-",
                suffix=".md",
                dir=untracked_source_dir,
            )
            os.close(untracked_fd)
            untracked_source_file = Path(untracked_source_name)
            untracked_source_path = untracked_source_file.relative_to(repo_root).as_posix()
            untracked_source_created = True
            untracked_source_file.write_text("temporary untracked source authority probe\n", encoding="utf-8")
            try:
                untracked_digest = hashlib.sha256(untracked_source_file.read_bytes()).hexdigest()
                untracked_packet = require(
                    client.post(
                        "/pipeline-control-plane/work-packets",
                        json={
                            "packetId": "packet-gate-4b-untracked-source",
                            "title": "Gate 4B untracked source rejection",
                            "initialStage": "capture",
                            "status": "waiting",
                            "truthLabel": "source_owned",
                            "sourceRef": {**source_ref, "pathOrUrl": untracked_source_path, "contentSha256": untracked_digest},
                            "actor": {"actorType": "manager", "actorId": "gate-4b-proof", "actorLabel": "Gate 4B proof"},
                            "idempotencyKey": "create-gate-4b-untracked-source",
                            "correlationId": "corr:create-gate-4b-untracked-source",
                        },
                    ),
                    200,
                    "untracked source packet seed",
                )
                untracked_proof = client.post(
                    f"/pipeline-control-plane/work-packets/{untracked_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-untracked-source-proof",
                        "correlationId": "corr:gate-4b-untracked-source-proof",
                        "scenario": "happy",
                    },
                )
                require_local_rejected(untracked_proof, "untracked source authority", "Git-tracked file")
            finally:
                if untracked_source_created and untracked_source_file.exists():
                    untracked_source_file.unlink()
                if untracked_source_created and untracked_source_file.exists():
                    fail("untracked source fixture was not cleaned up")
            traversal_packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-gate-4b-traversal-source",
                        "title": "Gate 4B traversal source rejection",
                        "initialStage": "capture",
                        "status": "waiting",
                        "truthLabel": "source_owned",
                        "sourceRef": {**source_ref, "pathOrUrl": "../docs/workflows/latest-prd-autonomous-bmad-loop-goal.md"},
                        "actor": {"actorType": "manager", "actorId": "gate-4b-proof", "actorLabel": "Gate 4B proof"},
                        "idempotencyKey": "create-gate-4b-traversal-source",
                        "correlationId": "corr:create-gate-4b-traversal-source",
                    },
                ),
                200,
                "traversal source packet seed",
            )
            traversal_proof = client.post(
                f"/pipeline-control-plane/work-packets/{traversal_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-traversal-source-proof",
                    "correlationId": "corr:gate-4b-traversal-source-proof",
                    "scenario": "happy",
                },
            )
            require_local_rejected(traversal_proof, "outside-root source authority", "repository-relative path")
            digest_mismatch_packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-gate-4b-index-digest-mismatch",
                        "title": "Gate 4B index digest mismatch rejection",
                        "initialStage": "capture",
                        "status": "waiting",
                        "truthLabel": "source_owned",
                        "sourceRef": {**source_ref, "contentSha256": "0" * 64},
                        "actor": {"actorType": "manager", "actorId": "gate-4b-proof", "actorLabel": "Gate 4B proof"},
                        "idempotencyKey": "create-gate-4b-index-digest-mismatch",
                        "correlationId": "corr:create-gate-4b-index-digest-mismatch",
                    },
                ),
                200,
                "Git index digest mismatch packet seed",
            )
            digest_mismatch_proof = client.post(
                f"/pipeline-control-plane/work-packets/{digest_mismatch_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-index-digest-mismatch-proof",
                    "correlationId": "corr:gate-4b-index-digest-mismatch-proof",
                    "scenario": "happy",
                },
            )
            require_local_rejected(digest_mismatch_proof, "Git index digest mismatch", "digest does not match the Git index blob")
            unsafe_actor = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-unsafe-actor",
                    "correlationId": "corr:gate-4b-unsafe-actor",
                    "scenario": "happy",
                    "actorId": "provider-secret-token",
                },
            )
            if unsafe_actor.status_code != 422:
                fail(f"unsafe local-proof actor metadata was not rejected before persistence: {unsafe_actor.text[:240]}")
            oversized_correlation = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-oversized-correlation",
                    "correlationId": "c" * 81,
                    "scenario": "happy",
                },
            )
            require_typed_422(oversized_correlation, "oversized local-proof correlation id")
            long_idempotency_packet = seed_local_packet("long-idempotency")
            long_idempotency_key = "i" * 160
            long_idempotency_proof = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{long_idempotency_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": long_idempotency_key,
                        "correlationId": "c" * 80,
                        "scenario": "happy",
                    },
                ),
                200,
                "maximum-length local-proof idempotency key",
            )
            if long_idempotency_proof["attempt"]["status"] != "completed":
                fail("maximum-length local-proof idempotency key did not complete the proof")
            transition_keys = [
                event["idempotencyKey"]
                for event in long_idempotency_proof["authoritativePacket"]["history"]
                if event["eventType"] == "packet.stage_transitioned"
            ]
            if not transition_keys or any(len(key) > 120 for key in transition_keys):
                fail("local-proof lifecycle transition keys exceeded their downstream idempotency limit")
            legacy_packet = seed_local_packet("legacy-metadata-link")
            legacy_work_item = require(
                client.post(
                    "/work-items",
                    json={
                        "title": "Legacy packet-linked WorkItem",
                        "requestedOutcome": "Must reject before a local-proof transition.",
                        "source": source_path,
                        "metadata": {"sourceArtifactPath": source_path},
                    },
                ),
                200,
                "legacy packet-linked WorkItem",
            )
            with sqlite3.connect(db_path) as legacy_db:
                packet_event_count = legacy_db.execute(
                    "SELECT COUNT(*) FROM authoritative_work_packet_lifecycle_events WHERE packet_id = ?",
                    (legacy_packet["packetId"],),
                ).fetchone()[0]
                work_item_event_count = legacy_db.execute(
                    "SELECT COUNT(*) FROM workflow_events WHERE work_item_id = ?",
                    (legacy_work_item["id"],),
                ).fetchone()[0]
                attempt_count = legacy_db.execute(
                    "SELECT COUNT(*) FROM execution_attempts WHERE work_item_id = ?",
                    (legacy_work_item["id"],),
                ).fetchone()[0]
                legacy_db.execute(
                    "UPDATE work_items SET metadata_json = ? WHERE id = ?",
                    (json.dumps({"authoritativePacketId": legacy_packet["packetId"]}), legacy_work_item["id"]),
                )
                legacy_db.commit()
            legacy_proof = client.post(
                f"/pipeline-control-plane/work-packets/{legacy_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-legacy-metadata-link",
                    "correlationId": "corr:gate-4b-legacy-metadata-link",
                    "scenario": "happy",
                },
            )
            require_local_rejected(legacy_proof, "legacy packet-linked WorkItem", "server-owned local-proof attestation")
            with sqlite3.connect(db_path) as legacy_db:
                after_packet_event_count = legacy_db.execute(
                    "SELECT COUNT(*) FROM authoritative_work_packet_lifecycle_events WHERE packet_id = ?",
                    (legacy_packet["packetId"],),
                ).fetchone()[0]
                after_work_item_event_count = legacy_db.execute(
                    "SELECT COUNT(*) FROM workflow_events WHERE work_item_id = ?",
                    (legacy_work_item["id"],),
                ).fetchone()[0]
                after_attempt_count = legacy_db.execute(
                    "SELECT COUNT(*) FROM execution_attempts WHERE work_item_id = ?",
                    (legacy_work_item["id"],),
                ).fetchone()[0]
                authoritative_packet_id = legacy_db.execute(
                    "SELECT authoritative_packet_id FROM work_items WHERE id = ?",
                    (legacy_work_item["id"],),
                ).fetchone()[0]
            if (
                after_packet_event_count != packet_event_count
                or after_work_item_event_count != work_item_event_count
                or after_attempt_count != attempt_count
                or authoritative_packet_id is not None
            ):
                fail("legacy packet-linked WorkItem was mutated before its server-owned attestation was rejected")
            happy_proof = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-happy-local-proof",
                        "correlationId": "corr:gate-4b-happy-local-proof",
                        "scenario": "happy",
                    },
                ),
                200,
                "happy integrated local proof",
            )
            if happy_proof["evidenceLevel"] != "integrated_local" or not happy_proof["metadataOnly"] or happy_proof["rawPayloadRetained"]:
                fail("happy local proof did not retain its honest metadata-only evidence boundary")
            if happy_proof["attempt"]["status"] != "completed":
                fail("happy local proof did not persist a completed supervisor execution attempt")
            happy_item = happy_proof["workItem"]
            legacy_work_item_route = client.post(
                f"/work-items/{happy_item['id']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-legacy-work-item-route",
                    "correlationId": "corr:gate-4b-legacy-work-item-route",
                    "scenario": "happy",
                },
            )
            if legacy_work_item_route.status_code != 404:
                fail("the independent WorkItem local-proof route remains public")
            assert_canonical_trace(happy_proof, happy_packet["packetId"], "happy local proof")
            if happy_proof["authoritativePacket"]["sourceRef"]["contentSha256"] != source_digest:
                fail("happy local proof did not retain the verified tracked source digest")
            if happy_proof["authoritativePacket"]["currentStage"] != "review" or not happy_proof["authoritativePacket"]["readyToTest"]:
                fail("happy local proof did not drive the authoritative packet to review/ReadyToTest")
            local_approval = issue_approval(client, happy_proof["authoritativePacket"], action_id="mark_tested", actor_id=actor_id, key="gate-4b-local-pass")
            local_action = apply_gated_action(
                client,
                happy_proof["authoritativePacket"],
                local_approval,
                action_id="mark_tested",
                actor_id=actor_id,
                idempotency_key="gate-4b-local-pass",
                evidence_ref="evidence:local-proof:gate-4b-happy-local-proof",
                test_result="pass",
            )
            if local_action["resultingStage"] != "promote" or local_action["outcome"] != "succeeded":
                fail("approved local proof packet did not advance through the server-bound pass action")
            post_pass_packet = require(
                client.get(f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}"),
                200,
                "post-pass authoritative packet",
            )
            post_pass_item = require(client.get(f"/work-items/{happy_item['id']}"), 200, "post-pass canonical WorkItem")
            if post_pass_packet["currentStage"] != post_pass_item["metadata"]["authoritativePacketStage"] or post_pass_packet["status"] != post_pass_item["metadata"]["authoritativePacketStatus"]:
                fail("approved pass left the canonical packet and WorkItem states divergent")
            happy_lease = happy_proof["queueLease"]
            if not happy_lease["active"] or happy_lease["fencingToken"] < 2 or happy_lease["attemptCount"] < 1:
                fail("happy local proof did not persist an active fenced queue lease")

            omitted_heartbeat = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-omitted-heartbeat-token",
                    "correlationId": "corr:gate-4b-omitted-heartbeat-token",
                    "operation": "heartbeat",
                },
            )
            require_local_rejected(omitted_heartbeat, "omitted heartbeat fencing token", "requires an explicit fencing token")
            omitted_heartbeat_replay = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-omitted-heartbeat-token",
                    "correlationId": "corr:gate-4b-omitted-heartbeat-token-replay",
                    "operation": "heartbeat",
                    "fencingToken": happy_lease["fencingToken"],
                },
            )
            require_local_rejected(omitted_heartbeat_replay, "replayed omitted heartbeat token", "requires an explicit fencing token")
            omitted_expire = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-omitted-expire-token",
                    "correlationId": "corr:gate-4b-omitted-expire-token",
                    "operation": "expire",
                },
            )
            require_local_rejected(omitted_expire, "omitted expire fencing token", "requires an explicit fencing token")

            duplicate_local = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-happy-local-proof",
                    "correlationId": "corr:gate-4b-happy-local-proof-replay",
                    "scenario": "happy",
                },
            )
            require_local_rejected(duplicate_local, "duplicate local proof", "idempotency key")
            stale_heartbeat = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-stale-heartbeat",
                    "correlationId": "corr:gate-4b-stale-heartbeat",
                    "operation": "stale_heartbeat",
                    "fencingToken": happy_lease["fencingToken"] - 1,
                },
            )
            require_local_rejected(stale_heartbeat, "stale lease heartbeat", "fencing token is stale")
            stale_heartbeat_replay = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-stale-heartbeat",
                    "correlationId": "corr:gate-4b-stale-heartbeat-replay",
                    "operation": "heartbeat",
                    "fencingToken": happy_lease["fencingToken"],
                },
            )
            require_local_rejected(stale_heartbeat_replay, "replayed rejected lease heartbeat", "fencing token is stale")
            heartbeat = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-valid-heartbeat",
                        "correlationId": "corr:gate-4b-valid-heartbeat",
                        "operation": "heartbeat",
                        "fencingToken": happy_lease["fencingToken"],
                    },
                ),
                200,
                "valid lease heartbeat",
            )
            if heartbeat["fencingToken"] <= happy_lease["fencingToken"] or not heartbeat["active"]:
                fail("valid lease heartbeat did not advance fencing metadata")
            same_token_mutation = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-distinct-same-token-heartbeat",
                    "correlationId": "corr:gate-4b-distinct-same-token-heartbeat",
                    "operation": "heartbeat",
                    "fencingToken": happy_lease["fencingToken"],
                },
            )
            require_local_rejected(same_token_mutation, "distinct same-token lease mutation", "fencing token is stale")
            duplicate_heartbeat = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-valid-heartbeat",
                    "correlationId": "corr:gate-4b-valid-heartbeat-replay",
                    "operation": "heartbeat",
                    "fencingToken": happy_lease["fencingToken"],
                },
            )
            require_local_rejected(duplicate_heartbeat, "duplicate successful heartbeat", "already succeeded")
            expired_lease = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-expire-lease",
                        "correlationId": "corr:gate-4b-expire-lease",
                        "operation": "expire",
                        "fencingToken": heartbeat["fencingToken"],
                    },
                ),
                200,
                "expire local proof lease",
            )
            if expired_lease["active"] or expired_lease["state"] != "expired":
                fail("expired local proof lease did not persist an expired state")
            duplicate_expire = client.post(
                f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-expire-lease",
                        "correlationId": "corr:gate-4b-expire-lease-replay",
                        "operation": "expire",
                        "fencingToken": heartbeat["fencingToken"],
                },
            )
            require_local_rejected(duplicate_expire, "duplicate successful expiry", "already succeeded")
            expired_heartbeat = client.post(
                    f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/lease",
                json={
                    "proofMode": "integrated_local",
                    "idempotencyKey": "gate-4b-expired-heartbeat",
                    "correlationId": "corr:gate-4b-expired-heartbeat",
                    "operation": "heartbeat",
                    "fencingToken": expired_lease["fencingToken"],
                },
            )
            require_local_rejected(expired_heartbeat, "expired lease heartbeat", "expired or inactive")

            worker_failure_packet = seed_local_packet("worker-failure")
            worker_failure = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{worker_failure_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-worker-failure",
                        "correlationId": "corr:gate-4b-worker-failure",
                        "scenario": "worker_failure",
                    },
                ),
                200,
                "typed worker failure local proof",
            )
            worker_failure_item = worker_failure["workItem"]
            assert_canonical_trace(worker_failure, worker_failure_packet["packetId"], "worker failure local proof")
            if worker_failure["attempt"]["status"] != "failed" or worker_failure["workItem"]["state"] != "needs_rework":
                fail("worker failure did not become a supervisor-owned held/recovery state")

            verification_failure_packet = seed_local_packet("verification-failure")
            verification_failure = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{verification_failure_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-verification-failure",
                        "correlationId": "corr:gate-4b-verification-failure",
                        "scenario": "verification_failure",
                    },
                ),
                200,
                "typed verification failure local proof",
            )
            verification_failure_item = verification_failure["workItem"]
            assert_canonical_trace(verification_failure, verification_failure_packet["packetId"], "verification failure local proof")
            if verification_failure["workItem"]["state"] != "needs_rework" or not verification_failure["attempt"]["failureReason"]:
                fail("verification failure did not persist a truthful held/recovery state")

            completion_fencing_packet = seed_local_packet("completion-fencing")
            completion_fencing = require(
                client.post(
                    f"/pipeline-control-plane/work-packets/{completion_fencing_packet['packetId']}/local-proof",
                    json={
                        "proofMode": "integrated_local",
                        "idempotencyKey": "gate-4b-completion-fencing",
                        "correlationId": "corr:gate-4b-completion-fencing",
                        "scenario": "completion_fencing_failure",
                    },
                ),
                200,
                "completion fencing local proof",
            )
            completion_fencing_item = completion_fencing["workItem"]
            assert_canonical_trace(completion_fencing, completion_fencing_packet["packetId"], "completion fencing local proof")
            if completion_fencing["attempt"]["status"] != "running" or not completion_fencing["attempt"]["failureReason"]:
                fail("completion fencing did not reject completion and preserve a held attempt")

            def prepare_action_replay_fixture(item_id: str, action_id: str, authority_state: str) -> dict:
                replay_packet_seed = seed_local_packet(item_id)
                replay_proof = require(
                    client.post(
                        f"/pipeline-control-plane/work-packets/{replay_packet_seed['packetId']}/local-proof",
                        json={
                            "proofMode": "integrated_local",
                            "idempotencyKey": f"gate-4b-{item_id}-proof",
                            "correlationId": f"corr:gate-4b-{item_id}-proof",
                            "scenario": "happy",
                        },
                    ),
                    200,
                    f"{action_id} replay fixture local proof",
                )
                pass_approval = issue_approval(
                    client,
                    replay_proof["authoritativePacket"],
                    action_id="mark_tested",
                    actor_id=actor_id,
                    key=f"gate-4b-{item_id}-pass-approval",
                )
                pass_action = apply_gated_action(
                    client,
                    replay_proof["authoritativePacket"],
                    pass_approval,
                    action_id="mark_tested",
                    actor_id=actor_id,
                    idempotency_key=f"gate-4b-{item_id}-pass",
                    evidence_ref=f"evidence:{item_id}:pass",
                    test_result="pass",
                )
                if pass_action["outcome"] != "succeeded" or pass_action["resultingStage"] != "promote":
                    fail(f"{action_id} replay fixture did not reach the approved promote state")
                post_pass_replay_packet = require(
                    client.get(f"/pipeline-control-plane/work-packets/{replay_packet_seed['packetId']}"),
                    200,
                    f"{action_id} replay fixture post-pass packet",
                )
                action_approval = issue_approval(
                    client,
                    post_pass_replay_packet,
                    action_id=action_id,
                    actor_id=actor_id,
                    key=f"gate-4b-{item_id}-action-approval",
                    requested_authority_state=authority_state,
                )
                accepted_action = apply_gated_action(
                    client,
                    post_pass_replay_packet,
                    action_approval,
                    action_id=action_id,
                    actor_id=actor_id,
                    idempotency_key=f"gate-4b-{item_id}-action",
                    evidence_ref=f"evidence:{item_id}:action",
                    requested_authority_state=authority_state,
                )
                if accepted_action["outcome"] != "succeeded":
                    fail(f"accepted {action_id} action was not recorded as succeeded")
                return {
                    "packet": replay_packet_seed,
                    "proof": replay_proof,
                    "action": accepted_action,
                }

            reject_replay_fixture = prepare_action_replay_fixture(
                "reject-replay",
                "reject",
                "needs_product_approval",
            )

            client.__exit__(None, None, None)
            client_closed = True
            import supervisor.infrastructure.db.database as database

            asyncio.run(database.engine.dispose())
            importlib.reload(database)
            with TestClient(app, client=LOOPBACK_CLIENT) as reloaded_client:
                reload_attempt_response = reloaded_client.get(f"/work-items/{happy_item['id']}/execution-attempts")
                if reload_attempt_response.status_code != 200:
                    fail(f"reloaded happy attempts returned HTTP {reload_attempt_response.status_code}: {reload_attempt_response.text[:500]}")
                reload_payload = reload_attempt_response.json()
                reloaded_attempts = reload_payload.get("data") if isinstance(reload_payload, dict) else None
                if not isinstance(reloaded_attempts, list):
                    fail(f"reloaded happy attempts did not return a data list: {reload_attempt_response.text[:500]}")
                if len(reloaded_attempts) != 1 or reloaded_attempts[0]["attemptId"] != happy_proof["attempt"]["attemptId"]:
                    fail("engine/session reload created a duplicate success or lost execution lineage")
                reloaded_projection = require(
                    reloaded_client.get("/pipeline-control-plane/projection"),
                    200,
                    "reloaded pipeline projection",
                )

                def replay_accepted_action_fixture(fixture: dict, expected_status: str, expected_operator_test_state: str) -> None:
                    fixture_packet = fixture["packet"]
                    fixture_proof = fixture["proof"]
                    fixture_action = fixture["action"]
                    if fixture_action["resultingStage"] != "promote" or fixture_action["resultingStatus"] != expected_status:
                        fail(f"accepted {fixture_action['actionId']} action did not expose its resulting packet decision")
                    replay_result = require(
                        reloaded_client.post(
                            f"/pipeline-control-plane/work-packets/{fixture_packet['packetId']}/local-proof/replay"
                        ),
                        200,
                        f"{fixture_action['actionId']} event reconstruction replay",
                    )
                    if (
                        replay_result["replayMode"] != "event_reconstruction"
                        or not replay_result["materializedRowsAbsentBeforeRebuild"]
                        or replay_result["materializedPacketCountBeforeRebuild"] != 0
                        or replay_result["materializedWorkItemCountBeforeRebuild"] != 0
                    ):
                        fail(f"{fixture_action['actionId']} replay did not delete materialized rows before rebuild")
                    replayed_action_packet = require(
                        reloaded_client.get(f"/pipeline-control-plane/work-packets/{fixture_packet['packetId']}"),
                        200,
                        f"replayed {fixture_action['actionId']} authoritative packet",
                    )
                    if (
                        replayed_action_packet["currentStage"] != "promote"
                        or replayed_action_packet["status"] != expected_status
                        or replayed_action_packet["operatorTestState"] != expected_operator_test_state
                        or replayed_action_packet["parentPacketId"] is not None
                        or replayed_action_packet["lineageKind"] != "root"
                    ):
                        fail(f"replayed {fixture_action['actionId']} packet lost its resulting status, decision, stage, or lineage")
                    replayed_action_item = require(
                        reloaded_client.get(f"/work-items/{fixture_proof['workItem']['id']}"),
                        200,
                        f"replayed {fixture_action['actionId']} canonical WorkItem",
                    )
                    if replayed_action_item["metadata"].get("authoritativePacketStatus") != expected_status:
                        fail(f"replayed {fixture_action['actionId']} WorkItem metadata lost the resulting packet status")
                    replayed_attempts = reloaded_client.get(f"/work-items/{fixture_proof['workItem']['id']}/execution-attempts")
                    if replayed_attempts.status_code != 200 or len(replayed_attempts.json().get("data", [])) != 1:
                        fail(f"{fixture_action['actionId']} replay duplicated or lost the successful execution attempt")
                    assert_authoritative_packet_column_and_uniqueness(
                        db_path,
                        fixture_proof["workItem"]["id"],
                        fixture_packet["packetId"],
                        f"{fixture_action['actionId']} event reconstruction",
                    )

                replay_accepted_action_fixture(reject_replay_fixture, "deferred", "passed")
                captured_packet_history = require(
                    reloaded_client.get(f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}"),
                    200,
                    "captured authoritative lifecycle history",
                )["history"]
                captured_work_item_history_response = reloaded_client.get(f"/work-items/{happy_item['id']}/events")
                if captured_work_item_history_response.status_code != 200:
                    fail(f"captured WorkItem workflow history returned HTTP {captured_work_item_history_response.status_code}")
                captured_work_item_history = captured_work_item_history_response.json().get("data", [])
                if len(captured_packet_history) < 7 or len(captured_work_item_history) < 6:
                    fail("event reconstruction proof did not capture a complete packet and WorkItem history")
                pre_replay_packet = require(
                    reloaded_client.get(f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}"),
                    200,
                    "pre-delete authoritative packet",
                )
                pre_replay_item = require(
                    reloaded_client.get(f"/work-items/{happy_item['id']}"),
                    200,
                    "pre-delete canonical WorkItem",
                )
                pre_replay_item_snapshot = {
                    key: pre_replay_item[key]
                    for key in ("state", "lane", "blockedReason", "nextStep", "statusSummary")
                }
                pre_replay_item_snapshot["authoritativePacketId"] = pre_replay_item["metadata"].get("authoritativePacketId")
                pre_replay_item_snapshot["authoritativePacketStage"] = pre_replay_item["metadata"].get("authoritativePacketStage")
                pre_replay_item_snapshot["authoritativePacketStatus"] = pre_replay_item["metadata"].get("authoritativePacketStatus")
                replay = require(
                    reloaded_client.post(f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}/local-proof/replay"),
                    200,
                    "event reconstruction replay",
                )
                if (
                    replay["replayMode"] != "event_reconstruction"
                    or replay["replayedLifecycleEventCount"] != len(captured_packet_history)
                    or not replay["materializedRowsAbsentBeforeRebuild"]
                    or replay["materializedPacketCountBeforeRebuild"] != 0
                    or replay["materializedWorkItemCountBeforeRebuild"] != 0
                ):
                    fail("replay was not reconstructed from the captured authoritative lifecycle events")
                assert_authoritative_packet_column_and_uniqueness(
                    db_path,
                    happy_item["id"],
                    happy_packet["packetId"],
                    "happy event reconstruction",
                )
                replayed_projection = require(
                    reloaded_client.get("/pipeline-control-plane/projection"),
                    200,
                    "replayed pipeline projection",
                )
                replayed_packet = require(
                    reloaded_client.get(f"/pipeline-control-plane/work-packets/{happy_packet['packetId']}"),
                    200,
                    "replayed authoritative packet",
                )
                replayed_attempts_response = reloaded_client.get(f"/work-items/{happy_item['id']}/execution-attempts")
                if replayed_attempts_response.status_code != 200 or len(replayed_attempts_response.json().get("data", [])) != 1:
                    fail("event reconstruction replay produced a duplicate success or lost attempt lineage")
                if replayed_packet["currentStage"] != "promote" or replayed_packet["operatorTestState"] != "passed":
                    fail("event reconstruction replay did not rebuild the approved packet state")
                if replayed_packet["sourceRef"] != source_ref or replayed_packet["parentPacketId"] is not None or replayed_packet["lineageKind"] != "root":
                    fail("event reconstruction replay did not rebuild packet authority and lineage solely from events")
                replayed_item = require(reloaded_client.get(f"/work-items/{happy_item['id']}"), 200, "replayed canonical WorkItem")
                replayed_item_snapshot = {
                    key: replayed_item[key]
                    for key in ("state", "lane", "blockedReason", "nextStep", "statusSummary")
                }
                replayed_item_snapshot["authoritativePacketId"] = replayed_item["metadata"].get("authoritativePacketId")
                replayed_item_snapshot["authoritativePacketStage"] = replayed_item["metadata"].get("authoritativePacketStage")
                replayed_item_snapshot["authoritativePacketStatus"] = replayed_item["metadata"].get("authoritativePacketStatus")
                if replayed_item_snapshot != pre_replay_item_snapshot:
                    fail(f"event reconstruction changed the canonical WorkItem state snapshot: before={pre_replay_item_snapshot}, after={replayed_item_snapshot}")
                if (
                    replayed_packet["currentStage"] != pre_replay_packet["currentStage"]
                    or replayed_packet["status"] != pre_replay_packet["status"]
                    or replayed_item["metadata"].get("authoritativePacketStage") != replayed_packet["currentStage"]
                    or replayed_item["metadata"].get("authoritativePacketStatus") != replayed_packet["status"]
                    or replayed_item["state"] != "reviewing"
                ):
                    fail("replayed packet and WorkItem did not retain canonical state agreement")

                pre_replay_held_packet = require(
                    reloaded_client.get(f"/pipeline-control-plane/work-packets/{worker_failure_packet['packetId']}"),
                    200,
                    "pre-delete held authoritative packet",
                )
                pre_replay_held_item = require(
                    reloaded_client.get(f"/work-items/{worker_failure_item['id']}"),
                    200,
                    "pre-delete held canonical WorkItem",
                )
                held_blocker = pre_replay_held_item["blockedReason"]
                if (
                    pre_replay_held_item["state"] != "needs_rework"
                    or not held_blocker
                    or pre_replay_held_item["lane"] != "corrective_loop"
                    or pre_replay_held_item["metadata"].get("authoritativePacketId") != worker_failure_packet["packetId"]
                ):
                    fail("held replay fixture did not have the required non-null blocker and canonical state")
                held_replay = require(
                    reloaded_client.post(
                        f"/pipeline-control-plane/work-packets/{worker_failure_packet['packetId']}/local-proof/replay"
                    ),
                    200,
                    "held event reconstruction replay",
                )
                if (
                    held_replay["replayMode"] != "event_reconstruction"
                    or not held_replay["materializedRowsAbsentBeforeRebuild"]
                    or held_replay["materializedPacketCountBeforeRebuild"] != 0
                    or held_replay["materializedWorkItemCountBeforeRebuild"] != 0
                ):
                    fail("held event reconstruction did not delete materialized rows before rebuild")
                held_replayed_packet = require(
                    reloaded_client.get(f"/pipeline-control-plane/work-packets/{worker_failure_packet['packetId']}"),
                    200,
                    "replayed held authoritative packet",
                )
                held_replayed_item = require(
                    reloaded_client.get(f"/work-items/{worker_failure_item['id']}"),
                    200,
                    "replayed held canonical WorkItem",
                )
                if (
                    held_replayed_item["state"] != pre_replay_held_item["state"]
                    or held_replayed_item["lane"] != pre_replay_held_item["lane"]
                    or held_replayed_item["blockedReason"] != held_blocker
                    or held_replayed_item["metadata"].get("authoritativePacketId") != worker_failure_packet["packetId"]
                    or held_replayed_item["metadata"].get("authoritativePacketStage") != held_replayed_packet["currentStage"]
                    or held_replayed_item["metadata"].get("authoritativePacketStatus") != held_replayed_packet["status"]
                    or held_replayed_packet["currentStage"] != pre_replay_held_packet["currentStage"]
                    or held_replayed_packet["status"] != pre_replay_held_packet["status"]
                    or held_replayed_item["state"] != "needs_rework"
                    or not held_replayed_item["blockedReason"]
                ):
                    fail("held event reconstruction changed blocker, state, lane, or packet linkage")
                assert_authoritative_packet_column_and_uniqueness(
                    db_path,
                    worker_failure_item["id"],
                    worker_failure_packet["packetId"],
                    "held event reconstruction",
                )
                reloaded_projection = require(
                    reloaded_client.get("/pipeline-control-plane/projection"),
                    200,
                    "projection after held event reconstruction",
                )

            with sqlite3.connect(db_path) as persisted_db:
                counts = {
                    key: persisted_db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    for table, key in (
                        ("queue_leases", "leases"),
                        ("queue_lease_actions", "leaseActions"),
                        ("execution_attempts", "attempts"),
                        ("authoritative_work_packets", "authoritativePackets"),
                        ("work_items", "workItems"),
                        ("workflow_events", "events"),
                    )
                }
                local_events = persisted_db.execute(
                    "SELECT event_type, payload FROM workflow_events WHERE work_item_id = ?",
                    (happy_item["id"],),
                ).fetchall()
            persisted = {"counts": counts, "localEvents": local_events}
            if persisted["counts"]["leases"] < 4 or persisted["counts"]["leaseActions"] < 8 or persisted["counts"]["attempts"] < 4 or persisted["counts"]["authoritativePackets"] < 4 or persisted["counts"]["workItems"] < 4 or persisted["counts"]["events"] < 10:
                fail("disposable SQLite did not persist queue, attempt, and event records")
            if not any(event_type == "queue_lease.heartbeat_rejected" for event_type, _ in persisted["localEvents"]):
                fail("stale fencing rejection was not persisted as a workflow event")
            if any(
                json.loads(event_payload).get("rawPayloadRetained") is True
                for _, event_payload in persisted["localEvents"]
                if isinstance(event_payload, str)
            ):
                fail("local proof retained raw payload metadata")
            if not any(json.loads(event_payload).get("idempotencyKey") for _, event_payload in persisted["localEvents"] if isinstance(event_payload, str)):
                fail("local proof lease and lifecycle events did not retain idempotency metadata")

            local_projection_detail = packet_detail(reloaded_projection, happy_packet["packetId"])
            if local_projection_detail["currentStage"] != local_action["resultingStage"] or local_projection_detail["status"] != local_action["resultingStatus"]:
                fail(f"pipeline projection did not preserve the approved happy local proof result: {local_projection_detail}")
            if local_projection_detail["workItemId"] != happy_item["id"] or not local_projection_detail["queueLease"]:
                fail("pipeline projection omitted WorkItem and queue lease lineage")
            if (
                not local_projection_detail["executionAttempts"]
                or local_projection_detail["executionAttempts"][0]["attemptId"] != happy_proof["attempt"]["attemptId"]
            ):
                fail("pipeline projection omitted execution attempt lineage")
            if "corr:gate-4b-happy-local-proof" not in local_projection_detail["correlationIds"]:
                fail("pipeline projection omitted the local proof correlation id")
            worker_failure_detail = packet_detail(reloaded_projection, worker_failure_packet["packetId"])
            verification_failure_detail = packet_detail(reloaded_projection, verification_failure_packet["packetId"])
            if worker_failure_detail["status"] != "failed" or verification_failure_detail["status"] != "failed":
                fail("pipeline projection did not expose both held failure paths")
            completion_fencing_detail = packet_detail(reloaded_projection, completion_fencing_packet["packetId"])
            if completion_fencing_detail["status"] != "failed" or not completion_fencing_detail["executionAttempts"][0]["leaseId"]:
                fail("pipeline projection did not expose completion fencing lineage")

            projection = reloaded_projection
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
            if projection["runtimeReadiness"]["capabilityState"] != "available":
                fail("final projection did not report the attested local-proof capability as available")

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
                        "broaderQueueLeaseWorkerRestartProof": "integrated_local",
                        "happyLocalProofVerified": True,
                        "workerFailureHeldVerified": True,
                        "verificationFailureHeldVerified": True,
                        "leaseHeartbeatFencingExpiryVerified": True,
                        "engineReloadLineageVerified": True,
                        "persistedDatabaseStateVerified": True,
                        "projectionLifecycleLineageVerified": True,
                        "sourceAuthorityPath": source_ref["pathOrUrl"],
                        "canonicalSourcePacketLifecycleVerified": True,
                        "authoritativePacketApprovalPassVerified": True,
                        "serverBoundLocalProofAuthorityVerified": True,
                        "localProofVerificationAttestationEnforced": True,
                        "publicLocalProofForgeryRejected": True,
                        "trustedDeliveryReadinessBlockedForPublicForgery": True,
                        "disabledLocalProofProjectionVerified": True,
                        "untrackedSourceFixtureIsolationVerified": True,
                        "leaseAttemptFencingVerified": True,
                        "leaseActionIdempotencyVerified": True,
                        "completionFencingRejected": True,
                        "serverCapabilityBoundaryVerified": True,
                        "sourceAuthorityDigestVerified": True,
                        "forgedCanonicalWorkItemRejected": True,
                        "untrackedSourceRejectedAndRemoved": True,
                        "leaseAdversarialFencingVerified": True,
                        "metadataSafetyBoundaryVerified": True,
                        "metadataDepthAndSizeBoundsVerified": True,
                        "metadataNodeLimit": 1000,
                        "metadataAggregateSizeBytesLimit": 64 * 1024,
                        "metadataNodeLimitVerified": True,
                        "metadataAggregateSizeLimitVerified": True,
                        "sourceIndexDigestBoundaryVerified": True,
                        "replayedWorkItemSnapshotVerified": True,
                        "heldWorkItemReplaySnapshotVerified": True,
                        "metadataRejectionPersistenceVerified": True,
                        "workItemScalarMetadataSafetyVerified": True,
                        "workItemScalarRejectionPersistenceVerified": True,
                        "prefixedCredentialSignatureRejectionVerified": True,
                        "authoritativePacketTitleSafetyVerified": True,
                        "authoritativePacketSourceTitleSafetyVerified": True,
                        "authoritativePacketRejectionPersistenceVerified": True,
                        "sourceTraversalRejected": True,
                        "canonicalPacketWorkItemStateAgreementVerified": True,
                        "eventReconstructionReplayVerified": True,
                        "eventReconstructionRowsAbsentBeforeRebuildVerified": True,
                        "eventReconstructionDatabaseLinkageVerified": True,
                        "authoritativePacketLinkUniquenessVerified": True,
                        "blockedRequeueVerified": True,
                        "acceptedRejectReplayVerified": True,
                        "engineSessionReloadVerified": True,
                    },
                    sort_keys=True,
                )
            )
        finally:
            if not client_closed:
                client.__exit__(None, None, None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
