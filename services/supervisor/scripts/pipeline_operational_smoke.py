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


def require_local_rejected(response, label: str, message_fragment: str) -> None:
    if response.status_code != 409:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    error = payload.get("detail", {}).get("error", {}) if isinstance(payload, dict) else {}
    if not error.get("code", "").startswith("invalid_local_proof"):
        fail(f"{label} did not return the typed local-proof rejection: {response.text[:240]}")
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

        client = TestClient(app)
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
            if initial_projection["runtimeReadiness"]["operationalMode"] != "local_proof":
                fail("projection did not report local_proof runtime readiness")
            if initial_projection["runtimeReadiness"]["capabilityState"] != "unavailable" or initial_projection["runtimeReadiness"]["readinessState"] != "unavailable":
                fail("projection did not report the server local-proof capability as unavailable before enablement")
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
            deep_metadata: dict[str, object] = {}
            deep_cursor = deep_metadata
            for index in range(1500):
                child: dict[str, object] = {}
                deep_cursor[f"level{index}"] = child
                deep_cursor = child
            deep_metadata_response = client.post(
                "/work-items",
                json={
                    "title": "Deep metadata WorkItem",
                    "requestedOutcome": "Must be rejected without recursion failure.",
                    "source": source_path,
                    "metadata": deep_metadata,
                },
            )
            if deep_metadata_response.status_code != 422:
                fail(f"deep metadata was not rejected as typed 422: {deep_metadata_response.status_code} {deep_metadata_response.text[:240]}")
            oversized_metadata_response = client.post(
                "/work-items",
                json={
                    "title": "Oversized metadata WorkItem",
                    "requestedOutcome": "Must be rejected before event persistence.",
                    "source": source_path,
                    "metadata": {"oversized": "x" * (64 * 1024 + 1)},
                },
            )
            if oversized_metadata_response.status_code != 422:
                fail(f"oversized metadata was not rejected as typed 422: {oversized_metadata_response.status_code} {oversized_metadata_response.text[:240]}")
            listed_work_items_after_metadata = client.get("/work-items")
            if listed_work_items_after_metadata.status_code != 200 or any(
                item.get("title") in {"Deep metadata WorkItem", "Oversized metadata WorkItem"}
                for item in listed_work_items_after_metadata.json().get("data", [])
            ):
                fail("rejected deep or oversized metadata created a WorkItem projection")
            with sqlite3.connect(db_path) as metadata_db:
                persisted_metadata_events = metadata_db.execute(
                    "SELECT COUNT(*) FROM workflow_events WHERE payload LIKE ? OR payload LIKE ?",
                    ("%Deep metadata WorkItem%", "%Oversized metadata WorkItem%"),
                ).fetchone()[0]
            if persisted_metadata_events:
                fail("rejected deep or oversized metadata persisted a workflow event")
            repo_root = Path(__file__).resolve().parents[3]
            untracked_source_path = "docs/workflows/.gate4b-untracked-source.md"
            untracked_source_file = repo_root / untracked_source_path
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
                untracked_source_file.unlink(missing_ok=True)
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
            local_approval = issue_approval(client, happy_proof["authoritativePacket"], action_id="mark_tested", actor_id="smoke-operator", key="gate-4b-local-pass")
            local_action = apply_gated_action(
                client,
                happy_proof["authoritativePacket"],
                local_approval,
                action_id="mark_tested",
                actor_id="smoke-operator",
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

            client.__exit__(None, None, None)
            client_closed = True
            import supervisor.infrastructure.db.database as database

            asyncio.run(database.engine.dispose())
            importlib.reload(database)
            with TestClient(app) as reloaded_client:
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
                reloaded_projection = replayed_projection

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
                        "sourceIndexDigestBoundaryVerified": True,
                        "replayedWorkItemSnapshotVerified": True,
                        "sourceTraversalRejected": True,
                        "canonicalPacketWorkItemStateAgreementVerified": True,
                        "eventReconstructionReplayVerified": True,
                        "eventReconstructionRowsAbsentBeforeRebuildVerified": True,
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
