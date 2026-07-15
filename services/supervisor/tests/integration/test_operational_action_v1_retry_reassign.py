import asyncio
import inspect
import json
import os
import sqlite3
import subprocess
import sys
import textwrap
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path, monkeypatch, db_name: str) -> TestClient:
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.api.main import app

    return TestClient(app, client=("127.0.0.1", 50000))


def _seed_target(
    client: TestClient,
    db_path: str,
    *,
    suffix: str,
    owner: str | None = "owner-old",
    state: str = "ready",
    attempt_status: str | None = None,
    lease_active: bool = False,
    attempt_purpose: str = "verification",
    attempt_fencing_token: int = 7,
) -> dict[str, object]:
    packet_id = f"packet-{suffix}"
    create_packet = client.post(
        "/pipeline-control-plane/work-packets",
        json={
            "packetId": packet_id,
            "title": f"P2.1 target {suffix}",
            "initialStage": "execute",
            "status": "failed",
            "sourceRef": {
                "refId": f"story:{suffix}",
                "sourceType": "bmad_story",
                "pathOrUrl": f"_bmad-output/implementation-artifacts/{suffix}.md",
                "title": f"P2.1 target {suffix}",
            },
            "actor": {"actorType": "manager", "actorId": "p2-1-test-manager"},
            "idempotencyKey": f"create-{suffix}",
            "correlationId": f"corr-create-{suffix}",
            "evidenceRefs": [f"test:{suffix}"],
        },
    )
    assert create_packet.status_code == 200, create_packet.text
    packet = create_packet.json()["data"]
    create_item = client.post(
        "/work-items",
        json={
            "title": f"P2.1 linked item {suffix}",
            "requestedOutcome": "Exercise exact retry and reassign fencing.",
            "source": "pytest",
            "riskLevel": "low",
            "metadata": {"fixture": suffix},
        },
    )
    assert create_item.status_code == 200, create_item.text
    item = create_item.json()["data"]
    metadata = {
        "authoritativePacketId": packet_id,
        "authoritativePacketStage": packet["currentStage"],
        "authoritativePacketStatus": packet["status"],
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }
    attempt_id = f"attempt-{suffix}"
    lease_id = f"lease-{suffix}"
    route_decision_id = f"route-{suffix}"
    attempt_updated_at = "2026-07-14T20:00:00+00:00"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "update work_items set authoritative_packet_id = ?, metadata_json = ?, state = ?, assignee_id = ?, assignee_label = ? where id = ?",
            (packet_id, json.dumps(metadata), state, owner, owner, item["id"]),
        )
        if attempt_status is not None:
            conn.execute(
                "insert into queue_leases (id, work_item_id, attempt_count, heartbeat_at, lease_expires_at, fencing_token, active) values (?, ?, ?, ?, ?, ?, ?)",
                (lease_id, item["id"], 1, "2026-07-14T19:59:00+00:00", "2026-07-14T19:59:30+00:00", 7, int(lease_active)),
            )
            conn.execute(
                "insert into execution_attempts (id, work_item_id, queue_lease_id, queue_fencing_token, route_decision_id, worker_id, lane, authority_mode, status, workspace_isolation_plan_json, artifact_refs_json, event_refs_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    attempt_id,
                    item["id"],
                    lease_id,
                    attempt_fencing_token,
                    route_decision_id,
                    "metadata-only-verifier",
                    "validation",
                    "metadata_only",
                    attempt_status,
                    json.dumps({}),
                    json.dumps(
                        [
                            {
                                "artifactType": "task_packet_v0",
                                "packetId": f"task-packet-{route_decision_id}",
                                "workItemId": item["id"],
                                "routeDecisionId": route_decision_id,
                                "taskKind": "validation_execution" if attempt_purpose == "verification" else "code_execution",
                                "approvalMode": "metadata_only",
                            }
                        ]
                    ),
                    json.dumps([]),
                    attempt_updated_at,
                    attempt_updated_at,
                ),
            )
        conn.commit()
    return {
        "packetId": packet_id,
        "packetEventId": packet["currentEventId"],
        "workItemId": item["id"],
        "workItemState": state,
        "workItemUpdatedAt": item["updatedAt"],
        "attemptId": attempt_id,
        "attemptUpdatedAt": attempt_updated_at,
        "leaseId": lease_id,
    }


def _approval_request(action_id: str, target: dict[str, object], **context_overrides) -> dict[str, object]:
    from supervisor.api.schemas import (
        ReassignActionContextV1,
        RetryVerificationActionContextV1,
        operational_action_context_digest_sha256_v1,
    )

    if action_id == "retry_verification":
        context = {
            "kind": action_id,
            "executionAttemptId": target["attemptId"],
            "linkedWorkItemId": target["workItemId"],
            "linkedPacketId": target["packetId"],
            "expectedWorkItemState": target["workItemState"],
            "expectedWorkItemUpdatedAt": target["workItemUpdatedAt"],
            "expectedAttemptStatus": "failed",
            "expectedAttemptUpdatedAt": target["attemptUpdatedAt"],
            "expectedPacketCurrentEventId": target["packetEventId"],
            "expectedLeaseId": target["leaseId"],
            "expectedLeaseFencingToken": 7,
            "expectedLeaseActive": False,
            **context_overrides,
        }
        context_model = RetryVerificationActionContextV1.model_validate(context)
        target_type = "execution_attempt"
        target_id = str(target["attemptId"])
    else:
        context = {
            "kind": action_id,
            "linkedWorkItemId": target["workItemId"],
            "expectedPacketCurrentEventId": target["packetEventId"],
            "expectedCurrentOwnerId": "owner-old",
            "newOwnerId": "owner-new",
            "expectedWorkItemState": "ready",
            "expectedWorkItemUpdatedAt": target["workItemUpdatedAt"],
            "expectedActiveLeaseId": None,
            "expectedRunningAttemptId": None,
            **context_overrides,
        }
        context_model = ReassignActionContextV1.model_validate(context)
        target_type = "work_packet"
        target_id = str(target["packetId"])
    return {
        "schemaVersion": "pipeline-operational-action/v1",
        "actionId": action_id,
        "targetType": target_type,
        "targetId": target_id,
        "actionContext": context_model.model_dump(mode="json"),
        "actionContextDigestSha256": operational_action_context_digest_sha256_v1(
            action_id,
            target_type,
            target_id,
            context_model,
        ),
        "requestedBy": {
            "actorType": "operator",
            "actorId": "pipeline-operator",
            "actorLabel": "Pipeline operator",
        },
        "requestedAuthorityState": "needs_authority_approval",
        "requestedRiskTier": "medium",
        "serverBound": True,
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def _apply_request(approval_request: dict[str, object], approval: dict[str, object], *, suffix: str) -> dict[str, object]:
    return {
        **approval_request,
        "idempotencyKey": f"idem-{suffix}",
        "correlationId": f"corr-{suffix}",
        "approvalId": approval["approvalId"],
        "evidenceRefs": [f"verification:{suffix}", f"evidence:{suffix}"],
    }


def _typescript_result_validation_issues(result: dict[str, object]) -> list[dict[str, object]]:
    repo_root = Path(__file__).resolve().parents[4]
    script = r"""
const fs = require("node:fs");
const path = require("node:path");
const ts = require(require.resolve("typescript", { paths: [path.join(process.argv[1], "apps/dashboard")] }));
const sourcePath = path.join(process.argv[1], "packages/contracts/src/pipeline-control-plane/index.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const contractModule = { exports: {} };
Function("module", "exports", output)(contractModule, contractModule.exports);
const backendResult = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(contractModule.exports.validatePipelineOperationalActionResultV1(backendResult)));
"""
    completed = subprocess.run(
        ["node", "-e", script, str(repo_root)],
        input=json.dumps(result),
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


def test_retry_verification_preserves_attempt_and_queues_one_idempotent_metadata_only_intent(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="retry", attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        capability = client.post("/pipeline-control-plane/actions/v1/capability", json=approval_request)
        assert capability.status_code == 200, capability.text
        assert capability.json()["data"]["capabilityState"] == "available"
        approval_response = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval_response.status_code == 200, approval_response.text
        action_request = _apply_request(approval_request, approval_response.json()["data"], suffix="retry")
        applied = client.post("/pipeline-control-plane/actions/v1", json=action_request)
        assert applied.status_code == 200, applied.text
        result = applied.json()["data"]
        assert result["successEvidence"]["originalAttemptId"] == target["attemptId"]
        assert result["successEvidence"]["retryIntentId"].startswith("verification-retry-")
        assert len(result["successEvidence"]["retryIntentId"]) <= 80
        assert result["successEvidence"]["providerOrWorkerLaunched"] is False
        assert _typescript_result_validation_issues(result) == []
        assert result["replayed"] is False
        projection = client.get("/pipeline-control-plane/projection")
        assert projection.status_code == 200
        admission = projection.json()["data"]["executeAdmission"]
        assert admission["observed"]["verification"] == 1
        assert admission["capacityAvailable"] is False

        replay = client.post("/pipeline-control-plane/actions/v1", json=action_request)
        assert replay.status_code == 200, replay.text
        assert replay.json()["data"]["actionRecordId"] == result["actionRecordId"]
        assert replay.json()["data"]["replayed"] is True
        conflict = client.post(
            "/pipeline-control-plane/actions/v1",
            json={**action_request, "correlationId": "corr-retry-conflict"},
        )
        assert conflict.status_code == 400
        assert "idempotency key already belongs to different action metadata" in conflict.text

        with sqlite3.connect(db_path) as conn:
            original = conn.execute(
                "select status, updated_at from execution_attempts where id = ?", (target["attemptId"],)
            ).fetchone()
            assert original == ("failed", target["attemptUpdatedAt"])
            intents = conn.execute(
                "select status, provider_or_worker_launched from verification_retry_intents where original_attempt_id = ?",
                (target["attemptId"],),
            ).fetchall()
            assert intents == [("pending", 0)]
            packet_events = conn.execute(
                "select count(*) from authoritative_work_packet_lifecycle_events where packet_id = ? and event_type = 'packet.operational_action_applied'",
                (target["packetId"],),
            ).fetchone()[0]
            work_events = conn.execute(
                "select correlation_id, payload from workflow_events where work_item_id = ? and event_type = 'work_item.verification_retry_queued'",
                (target["workItemId"],),
            ).fetchall()
            assert packet_events == 1
            assert len(work_events) == 1
            assert work_events[0][0] == action_request["correlationId"]
            event_payload = json.loads(work_events[0][1])
            assert event_payload["approvalId"] == action_request["approvalId"]
            assert event_payload["evidenceRefs"] == action_request["evidenceRefs"]
            packet_event_key = conn.execute(
                "select idempotency_key from authoritative_work_packet_lifecycle_events "
                "where packet_id = ? and event_type = 'packet.operational_action_applied'",
                (target["packetId"],),
            ).fetchone()[0]
            assert packet_event_key.startswith("p2-1:")
            assert len(packet_event_key) == 69


@pytest.mark.parametrize("terminal_status", ["timed_out", "rejected"])
def test_retry_verification_accepts_other_explicit_terminal_verification_attempts(
    tmp_path,
    monkeypatch,
    terminal_status: str,
) -> None:
    db_name = f"p2-1-retry-{terminal_status}.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix=terminal_status, attempt_status=terminal_status)
        approval_request = _approval_request(
            "retry_verification",
            target,
            expectedAttemptStatus=terminal_status,
        )
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval.status_code == 200, approval.text
        applied = client.post(
            "/pipeline-control-plane/actions/v1",
            json=_apply_request(approval_request, approval.json()["data"], suffix=terminal_status),
        )
        assert applied.status_code == 200, applied.text
        with sqlite3.connect(db_path) as conn:
            assert conn.execute(
                "select count(*) from verification_retry_intents where original_attempt_id = ?",
                (target["attemptId"],),
            ).fetchone()[0] == 1


def test_reassign_updates_only_quiescent_exact_owner_and_appends_correlated_events(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-reassign.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="reassign")
        approval_request = _approval_request("reassign", target)
        approval_response = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval_response.status_code == 200, approval_response.text
        action_request = _apply_request(approval_request, approval_response.json()["data"], suffix="reassign")
        applied = client.post("/pipeline-control-plane/actions/v1", json=action_request)
        assert applied.status_code == 200, applied.text
        result = applied.json()["data"]
        assert result["successEvidence"]["previousOwnerId"] == "owner-old"
        assert result["successEvidence"]["newOwnerId"] == "owner-new"
        assert result["successEvidence"]["activeLeaseTransferred"] is False
        assert result["successEvidence"]["workerLaunched"] is False
        with sqlite3.connect(db_path) as conn:
            owner = conn.execute("select assignee_id from work_items where id = ?", (target["workItemId"],)).fetchone()[0]
            event = conn.execute(
                "select correlation_id, payload from workflow_events where work_item_id = ? and event_type = 'work_item.reassigned'",
                (target["workItemId"],),
            ).fetchone()
            assert owner == "owner-new"
            assert event[0] == action_request["correlationId"]
            assert json.loads(event[1])["sourceRef"]["refId"] == "story:reassign"


def test_retry_rejects_stale_fence_active_attempt_mismatched_target_and_missing_wip(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-adversarial.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        stale = _seed_target(client, db_path, suffix="stale", attempt_status="failed")
        stale_request = _approval_request("retry_verification", stale, expectedLeaseFencingToken=6)
        stale_capability = client.post("/pipeline-control-plane/actions/v1/capability", json=stale_request)
        assert stale_capability.status_code == 200
        assert stale_capability.json()["data"]["typedReason"] == "projection_stale"
        assert client.post("/pipeline-control-plane/approvals/v1", json=stale_request).status_code == 400

        active = _seed_target(client, db_path, suffix="active", attempt_status="failed")
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "insert into execution_attempts (id, work_item_id, route_decision_id, worker_id, lane, authority_mode, status, workspace_isolation_plan_json, artifact_refs_json, event_refs_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "attempt-active-running",
                    active["workItemId"],
                    "route-active-running",
                    "worker-active",
                    "validation",
                    "metadata_only",
                    "running",
                    json.dumps({}),
                    json.dumps([]),
                    json.dumps([]),
                    "2026-07-14T20:01:00+00:00",
                    "2026-07-14T20:01:00+00:00",
                ),
            )
            conn.commit()
        active_capability = client.post(
            "/pipeline-control-plane/actions/v1/capability",
            json=_approval_request("retry_verification", active),
        )
        assert active_capability.status_code == 200
        assert active_capability.json()["data"]["typedReason"] == "invalid_transition"

        mismatch = _seed_target(client, db_path, suffix="mismatch", attempt_status="failed")
        other = _seed_target(client, db_path, suffix="other")
        mismatch_request = _approval_request(
            "retry_verification",
            mismatch,
            linkedPacketId=other["packetId"],
            expectedPacketCurrentEventId=other["packetEventId"],
        )
        mismatch_capability = client.post("/pipeline-control-plane/actions/v1/capability", json=mismatch_request)
        assert mismatch_capability.status_code == 200
        assert mismatch_capability.json()["data"]["typedReason"] == "evidence_invalid"

        no_capacity = _seed_target(client, db_path, suffix="no-capacity", attempt_status="failed")
        with sqlite3.connect(db_path) as conn:
            conn.execute("update work_items set state = 'validating' where id = ?", (other["workItemId"],))
            conn.commit()
        capacity_capability = client.post(
            "/pipeline-control-plane/actions/v1/capability",
            json=_approval_request("retry_verification", no_capacity),
        )
        assert capacity_capability.status_code == 200
        assert capacity_capability.json()["data"]["typedReason"] == "blocked_by_resources"


def test_retry_rejects_non_verification_provenance_and_stale_persisted_attempt_fence(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-provenance-fence.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        execution = _seed_target(
            client,
            db_path,
            suffix="ordinary-execution",
            attempt_status="failed",
            attempt_purpose="execution",
        )
        execution_capability = client.post(
            "/pipeline-control-plane/actions/v1/capability",
            json=_approval_request("retry_verification", execution),
        )
        assert execution_capability.status_code == 200
        assert execution_capability.json()["data"]["typedReason"] == "evidence_invalid"

        stale_fence = _seed_target(
            client,
            db_path,
            suffix="persisted-stale-fence",
            attempt_status="failed",
            attempt_fencing_token=6,
        )
        stale_capability = client.post(
            "/pipeline-control-plane/actions/v1/capability",
            json=_approval_request("retry_verification", stale_fence),
        )
        assert stale_capability.status_code == 200
        assert stale_capability.json()["data"]["typedReason"] == "projection_stale"


@pytest.mark.parametrize(
    ("case", "field", "missing"),
    [
        ("missing-work-item", "workItemId", True),
        ("wrong-work-item", "workItemId", False),
        ("missing-route", "routeDecisionId", True),
        ("wrong-route", "routeDecisionId", False),
        ("missing-packet", "packetId", True),
        ("wrong-packet", "packetId", False),
        ("missing-authority", "approvalMode", True),
        ("wrong-authority", "approvalMode", False),
    ],
)
def test_retry_rejects_wrong_or_missing_persisted_attempt_provenance_binding(
    tmp_path,
    monkeypatch,
    case: str,
    field: str,
    missing: bool,
) -> None:
    db_name = f"p2-1-retry-provenance-{case}.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix=case, attempt_status="failed")
        with sqlite3.connect(db_path) as conn:
            artifact_refs = json.loads(
                conn.execute(
                    "select artifact_refs_json from execution_attempts where id = ?",
                    (target["attemptId"],),
                ).fetchone()[0]
            )
            if missing:
                artifact_refs[0].pop(field)
            else:
                artifact_refs[0][field] = f"wrong-{field.lower()}"
            conn.execute(
                "update execution_attempts set artifact_refs_json = ? where id = ?",
                (json.dumps(artifact_refs), target["attemptId"]),
            )
            conn.commit()

        approval_request = _approval_request("retry_verification", target)
        capability = client.post("/pipeline-control-plane/actions/v1/capability", json=approval_request)
        assert capability.status_code == 200
        assert capability.json()["data"]["typedReason"] == "evidence_invalid"
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval.status_code == 400
        assert "explicitly marked verification attempt" in approval.text


@pytest.mark.parametrize("changed_state", ["done", "operator_owned"])
def test_retry_revalidates_expected_work_item_state_without_side_effects(
    tmp_path,
    monkeypatch,
    changed_state: str,
) -> None:
    db_name = f"p2-1-retry-state-{changed_state}.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix=f"state-{changed_state}", attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval.status_code == 200, approval.text

        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update work_items set state = ? where id = ?",
                (changed_state, target["workItemId"]),
            )
            conn.commit()

        capability = client.post("/pipeline-control-plane/actions/v1/capability", json=approval_request)
        assert capability.status_code == 200
        assert capability.json()["data"]["typedReason"] == "projection_stale"
        second_approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert second_approval.status_code == 400
        assert "WorkItem state fence is stale" in second_approval.text

        applied = client.post(
            "/pipeline-control-plane/actions/v1",
            json=_apply_request(approval_request, approval.json()["data"], suffix=f"state-{changed_state}"),
        )
        assert applied.status_code == 400
        assert "WorkItem state fence is stale" in applied.text
        with sqlite3.connect(db_path) as conn:
            assert conn.execute(
                "select count(*) from verification_retry_intents where original_attempt_id = ?",
                (target["attemptId"],),
            ).fetchone()[0] == 0
            assert conn.execute(
                "select count(*) from pipeline_operational_action_records where target_id = ?",
                (target["attemptId"],),
            ).fetchone()[0] == 0
            assert conn.execute(
                "select consumed_at from pipeline_operational_approvals where approval_id = ?",
                (approval.json()["data"]["approvalId"],),
            ).fetchone()[0] is None


def test_retry_rejects_orphan_persisted_fencing_token_across_validation_paths(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-orphan-fence.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        orphan = _seed_target(client, db_path, suffix="orphan-fence", attempt_status="failed")
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update execution_attempts set queue_lease_id = null where id = ?",
                (orphan["attemptId"],),
            )
            conn.commit()
        orphan_request = _approval_request(
            "retry_verification",
            orphan,
            expectedLeaseId=None,
            expectedLeaseFencingToken=None,
        )
        capability = client.post("/pipeline-control-plane/actions/v1/capability", json=orphan_request)
        assert capability.status_code == 200
        assert capability.json()["data"]["typedReason"] == "projection_stale"
        approval_rejected = client.post("/pipeline-control-plane/approvals/v1", json=orphan_request)
        assert approval_rejected.status_code == 400
        assert "lease/fencing context is stale or ambiguous" in approval_rejected.text

        apply_target = _seed_target(client, db_path, suffix="orphan-fence-apply", attempt_status="failed")
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update execution_attempts set queue_lease_id = null, queue_fencing_token = null where id = ?",
                (apply_target["attemptId"],),
            )
            conn.commit()
        apply_approval_request = _approval_request(
            "retry_verification",
            apply_target,
            expectedLeaseId=None,
            expectedLeaseFencingToken=None,
        )
        approval = client.post("/pipeline-control-plane/approvals/v1", json=apply_approval_request)
        assert approval.status_code == 200, approval.text
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update execution_attempts set queue_fencing_token = 7 where id = ?",
                (apply_target["attemptId"],),
            )
            conn.commit()
        applied = client.post(
            "/pipeline-control-plane/actions/v1",
            json=_apply_request(
                apply_approval_request,
                approval.json()["data"],
                suffix="orphan-fence-apply",
            ),
        )
        assert applied.status_code == 400
        assert "lease/fencing context is stale or ambiguous" in applied.text
        with sqlite3.connect(db_path) as conn:
            assert conn.execute("select count(*) from verification_retry_intents").fetchone()[0] == 0


@pytest.mark.parametrize("stale_fence", ["attempt_updated_at", "packet_current_event"])
def test_retry_revalidates_revision_fences_between_approval_and_apply(
    tmp_path,
    monkeypatch,
    stale_fence: str,
) -> None:
    db_name = f"p2-1-retry-stale-after-approval-{stale_fence}.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix=stale_fence, attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval.status_code == 200, approval.text

        with sqlite3.connect(db_path) as conn:
            if stale_fence == "attempt_updated_at":
                conn.execute(
                    "update execution_attempts set updated_at = ? where id = ?",
                    ("2026-07-14T20:00:01+00:00", target["attemptId"]),
                )
                expected_error = "attempt revision fence is stale"
            else:
                conn.execute(
                    "update authoritative_work_packets set current_event_id = ? where id = ?",
                    (f"event-after-approval-{stale_fence}", target["packetId"]),
                )
                expected_error = "packet event fence is stale"
            conn.commit()

        applied = client.post(
            "/pipeline-control-plane/actions/v1",
            json=_apply_request(approval_request, approval.json()["data"], suffix=stale_fence),
        )
        assert applied.status_code == 400
        assert expected_error in applied.text
        with sqlite3.connect(db_path) as conn:
            assert conn.execute("select count(*) from verification_retry_intents").fetchone()[0] == 0


@pytest.mark.parametrize("action_id", ["retry_verification", "reassign"])
@pytest.mark.parametrize("work_item_mutation", ["updated_at", "authoritative_packet_id"])
def test_retry_and_reassign_reject_work_item_revision_or_packet_linkage_mutation_without_side_effects(
    tmp_path,
    monkeypatch,
    action_id: str,
    work_item_mutation: str,
) -> None:
    suffix = f"{action_id}-{work_item_mutation}"
    db_name = f"p2-1-{suffix}.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(
            client,
            db_path,
            suffix=suffix,
            attempt_status="failed" if action_id == "retry_verification" else None,
        )
        approval_request = _approval_request(action_id, target)
        approval_response = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
        assert approval_response.status_code == 200, approval_response.text
        replacement = (
            _seed_target(client, db_path, suffix=f"{suffix}-replacement")
            if work_item_mutation == "authoritative_packet_id"
            else None
        )

        with sqlite3.connect(db_path) as conn:
            if work_item_mutation == "updated_at":
                conn.execute(
                    "update work_items set updated_at = ? where id = ?",
                    ("2026-07-14T20:00:01+00:00", target["workItemId"]),
                )
            else:
                assert replacement is not None
                conn.execute(
                    "update work_items set authoritative_packet_id = ? where id = ?",
                    (replacement["packetId"], target["workItemId"]),
                )
            conn.commit()

        applied = client.post(
            "/pipeline-control-plane/actions/v1",
            json=_apply_request(
                approval_request,
                approval_response.json()["data"],
                suffix=suffix,
            ),
        )
        assert applied.status_code == 400
        assert (
            "WorkItem revision fence is stale" in applied.text
            or "Canonical packet and WorkItem projections disagree" in applied.text
        )
        with sqlite3.connect(db_path) as conn:
            assert conn.execute(
                "select assignee_id, state from work_items where id = ?",
                (target["workItemId"],),
            ).fetchone() == ("owner-old", "ready")
            assert conn.execute(
                "select count(*) from verification_retry_intents where work_item_id = ?",
                (target["workItemId"],),
            ).fetchone()[0] == 0
            assert conn.execute(
                "select count(*) from pipeline_operational_action_records where packet_id = ?",
                (target["packetId"],),
            ).fetchone()[0] == 0
            assert conn.execute(
                "select count(*) from workflow_events where work_item_id = ? and event_type in "
                "('work_item.verification_retry_queued', 'work_item.reassigned')",
                (target["workItemId"],),
            ).fetchone()[0] == 0
            assert conn.execute(
                "select consumed_at from pipeline_operational_approvals where approval_id = ?",
                (approval_response.json()["data"]["approvalId"],),
            ).fetchone()[0] is None


def test_concurrent_retry_admission_serializes_packet_and_wip_capacity(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-concurrent.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="concurrent-retry", attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        approvals = [
            client.post("/pipeline-control-plane/approvals/v1", json=approval_request).json()["data"]
            for _ in range(2)
        ]
        requests = [
            _apply_request(approval_request, approval, suffix=f"concurrent-retry-{index}")
            for index, approval in enumerate(approvals)
        ]
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda request: client.post("/pipeline-control-plane/actions/v1", json=request), requests))
        assert sorted(response.status_code for response in responses) == [200, 400]
        with sqlite3.connect(db_path) as conn:
            assert conn.execute("select count(*) from verification_retry_intents").fetchone()[0] == 1
            assert conn.execute(
                "select count(*) from workflow_events where event_type = 'work_item.verification_retry_queued'"
            ).fetchone()[0] == 1


def test_distinct_key_retry_is_exclusive_per_work_item_even_with_spare_global_wip(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-distinct-key-exclusive.db"
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_VERIFICATION_WIP_LIMIT", "5")
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="distinct-key", attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        first_approval = client.post(
            "/pipeline-control-plane/approvals/v1", json=approval_request
        ).json()["data"]
        first = client.post(
            "/pipeline-control-plane/actions/v1",
            json=_apply_request(approval_request, first_approval, suffix="distinct-key-first"),
        )
        assert first.status_code == 200, first.text

        rebound_target = {
            **target,
            "packetEventId": first.json()["data"]["successEvidence"]["resultingPacketCurrentEventId"],
        }
        rebound_approval_request = _approval_request("retry_verification", rebound_target)
        capability = client.post(
            "/pipeline-control-plane/actions/v1/capability", json=rebound_approval_request
        )
        second_approval = client.post(
            "/pipeline-control-plane/approvals/v1", json=rebound_approval_request
        )

        assert capability.status_code == 200
        assert capability.json()["data"]["capabilityState"] == "unavailable"
        assert capability.json()["data"]["authorityState"] == "blocked"
        assert capability.json()["data"]["typedReason"] == "invalid_transition"
        assert second_approval.status_code == 400
        assert "already pending" in second_approval.text
        with sqlite3.connect(db_path) as conn:
            assert conn.execute(
                "select count(*) from verification_retry_intents where work_item_id = ? and status = 'pending'",
                (target["workItemId"],),
            ).fetchone()[0] == 1


def test_active_external_launch_reservation_fences_workflow_and_packet_mutations(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-active-launch-mutation-fence.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="active-launch-fence", attempt_status="failed")
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "insert into execution_attempts "
                "(id, work_item_id, route_decision_id, worker_id, lane, authority_mode, status, "
                "workspace_isolation_plan_json, artifact_refs_json, event_refs_json, created_at, updated_at) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "attempt-active-launch-fence",
                    target["workItemId"],
                    "route-active-launch-fence",
                    "recipe.branch.command",
                    "utility",
                    "guarded",
                    "starting",
                    "{}",
                    "[]",
                    "[]",
                    now,
                    now,
                ),
            )
            conn.commit()

        workflow_response = client.post(f"/work-items/{target['workItemId']}/retry")
        packet_response = client.post(
            f"/pipeline-control-plane/work-packets/{target['packetId']}/transitions",
            json={
                "targetStage": "execute",
                "expectedCurrentEventId": target["packetEventId"],
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "No-op packet transition must still honor the active launch fence.",
                "evidenceRefs": ["evidence:active-launch-fence"],
            },
        )

        assert workflow_response.status_code == 409
        assert "active-launch-fence" in workflow_response.text
        assert packet_response.status_code == 400
        assert "active-launch-fence" in packet_response.text
        with sqlite3.connect(db_path) as conn:
            state = conn.execute(
                "select state from work_items where id = ?", (target["workItemId"],)
            ).fetchone()[0]
            current_event_id = conn.execute(
                "select current_event_id from authoritative_work_packets where id = ?", (target["packetId"],)
            ).fetchone()[0]
        assert state == target["workItemState"]
        assert current_event_id == target["packetEventId"]


def test_retry_and_reassign_are_mutually_exclusive_under_durable_admission(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-reassign-exclusive.db"
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_VERIFICATION_WIP_LIMIT", "5")
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="retry-reassign", attempt_status="failed")
        retry_approval_request = _approval_request("retry_verification", target)
        reassign_approval_request = _approval_request("reassign", target)
        retry_approval = client.post(
            "/pipeline-control-plane/approvals/v1", json=retry_approval_request
        ).json()["data"]
        reassign_approval = client.post(
            "/pipeline-control-plane/approvals/v1", json=reassign_approval_request
        ).json()["data"]
        retry_request = _apply_request(retry_approval_request, retry_approval, suffix="retry-reassign-retry")
        reassign_request = _apply_request(
            reassign_approval_request,
            reassign_approval,
            suffix="retry-reassign-reassign",
        )

        with ThreadPoolExecutor(max_workers=2) as executor:
            retry_future = executor.submit(
                client.post,
                "/pipeline-control-plane/actions/v1",
                json=retry_request,
            )
            reassign_future = executor.submit(
                client.post,
                "/pipeline-control-plane/actions/v1",
                json=reassign_request,
            )
            responses = [retry_future.result(), reassign_future.result()]

        assert sorted(response.status_code for response in responses) == [200, 400]
        with sqlite3.connect(db_path) as conn:
            pending_retry_count = conn.execute(
                "select count(*) from verification_retry_intents where work_item_id = ? and status = 'pending'",
                (target["workItemId"],),
            ).fetchone()[0]
            owner = conn.execute(
                "select assignee_id from work_items where id = ?",
                (target["workItemId"],),
            ).fetchone()[0]
            assert (pending_retry_count, owner) in {(1, "owner-old"), (0, "owner-new")}
            assert conn.execute(
                "select count(*) from workflow_events where work_item_id = ? "
                "and event_type in ('work_item.verification_retry_queued', 'work_item.reassigned')",
                (target["workItemId"],),
            ).fetchone()[0] == 1


def test_concurrent_retry_and_active_attempt_admission_are_mutually_exclusive(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-attempt-cross-path.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="attempt-cross-path", attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request).json()["data"]
        retry_request = _apply_request(approval_request, approval, suffix="attempt-cross-path")

        with ThreadPoolExecutor(max_workers=2) as executor:
            retry_future = executor.submit(client.post, "/pipeline-control-plane/actions/v1", json=retry_request)
            attempt_future = executor.submit(
                client.post,
                f"/work-items/{target['workItemId']}/execution-attempts",
                json={"taskKind": "path_scope_check"},
            )
            retry_response = retry_future.result()
            attempt_response = attempt_future.result()

        assert sorted((retry_response.status_code, attempt_response.status_code)) in ([200, 400], [200, 409])
        with sqlite3.connect(db_path) as conn:
            pending_retry_count = conn.execute(
                "select count(*) from verification_retry_intents where work_item_id = ? and status = 'pending'",
                (target["workItemId"],),
            ).fetchone()[0]
            active_attempt_count = conn.execute(
                "select count(*) from execution_attempts where work_item_id = ? "
                "and status in ('planned', 'approved', 'starting', 'running', 'cancel_requested')",
                (target["workItemId"],),
            ).fetchone()[0]
            assert (pending_retry_count, active_attempt_count) in {(1, 0), (0, 1)}


def test_concurrent_retry_and_queue_lease_admission_are_mutually_exclusive(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-lease-cross-path.db"
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_ALLOW_DIRTY_REPO", "true")
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(
            client,
            db_path,
            suffix="lease-cross-path",
            state="needs_rework",
            attempt_status="failed",
        )
        approval_request = _approval_request("retry_verification", target)
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request).json()["data"]
        retry_request = _apply_request(approval_request, approval, suffix="lease-cross-path")
        from supervisor.api.main import service

        monkeypatch.setattr(service, "_repo_is_dirty", lambda: False)
        with ThreadPoolExecutor(max_workers=2) as executor:
            retry_future = executor.submit(client.post, "/pipeline-control-plane/actions/v1", json=retry_request)
            lease_future = executor.submit(
                client.post,
                f"/work-items/{target['workItemId']}/actions",
                json={"action": "restart_implementation", "note": "Cross-path admission proof."},
            )
            retry_response = retry_future.result()
            lease_response = lease_future.result()

        assert sorted((retry_response.status_code, lease_response.status_code)) in ([200, 400], [200, 409])
        with sqlite3.connect(db_path) as conn:
            pending_retry_count = conn.execute(
                "select count(*) from verification_retry_intents where work_item_id = ? and status = 'pending'",
                (target["workItemId"],),
            ).fetchone()[0]
            active_lease_count = conn.execute(
                "select count(*) from queue_leases where work_item_id = ? and active = 1",
                (target["workItemId"],),
            ).fetchone()[0]
            assert (pending_retry_count, active_lease_count) in {(1, 0), (0, 1)}


def test_concurrent_retry_idempotency_replays_canonically(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-idempotency-concurrent.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        replay_target = _seed_target(client, db_path, suffix="concurrent-replay", attempt_status="failed")
        replay_approval_request = _approval_request("retry_verification", replay_target)
        replay_approval = client.post(
            "/pipeline-control-plane/approvals/v1", json=replay_approval_request
        ).json()["data"]
        replay_request = _apply_request(replay_approval_request, replay_approval, suffix="same-key")
        with ThreadPoolExecutor(max_workers=2) as executor:
            replay_responses = list(
                executor.map(
                    lambda _: client.post("/pipeline-control-plane/actions/v1", json=replay_request),
                    range(2),
                )
            )
        assert [response.status_code for response in replay_responses] == [200, 200]
        assert len({response.json()["data"]["actionRecordId"] for response in replay_responses}) == 1
        assert sorted(response.json()["data"]["replayed"] for response in replay_responses) == [False, True]


def test_concurrent_retry_idempotency_conflicts_canonically_without_ghost_event(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-retry-idempotency-conflict.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        conflict_target = _seed_target(client, db_path, suffix="concurrent-conflict", attempt_status="failed")
        conflict_approval_request = _approval_request("retry_verification", conflict_target)
        conflict_approvals = [
            client.post("/pipeline-control-plane/approvals/v1", json=conflict_approval_request).json()["data"]
            for _ in range(2)
        ]
        conflict_requests = [
            _apply_request(conflict_approval_request, approval, suffix="conflicting-key")
            for approval in conflict_approvals
        ]
        conflict_requests[1]["correlationId"] = "corr-conflicting-metadata"
        with ThreadPoolExecutor(max_workers=2) as executor:
            conflict_responses = list(
                executor.map(
                    lambda request: client.post("/pipeline-control-plane/actions/v1", json=request),
                    conflict_requests,
                )
            )
        assert sorted(response.status_code for response in conflict_responses) == [200, 400]
        rejected = next(response for response in conflict_responses if response.status_code == 400)
        assert "idempotency key already belongs to different action metadata" in rejected.text
        with sqlite3.connect(db_path) as conn:
            assert conn.execute(
                "select count(*) from workflow_events where event_type = 'work_item.verification_retry_queued'"
            ).fetchone()[0] == 1


def test_reassign_rejects_unknown_or_same_owner_active_lease_and_packet_disagreement(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-reassign-adversarial.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        unknown = _seed_target(client, db_path, suffix="unknown-owner", owner=None)
        unknown_request = _approval_request("reassign", unknown, expectedCurrentOwnerId=None)
        unknown_capability = client.post("/pipeline-control-plane/actions/v1/capability", json=unknown_request)
        assert unknown_capability.status_code == 200
        assert unknown_capability.json()["data"]["typedReason"] == "evidence_invalid"

        same = _seed_target(client, db_path, suffix="same-owner")
        same_request = _approval_request("reassign", same)
        same_request["actionContext"]["newOwnerId"] = "owner-old"
        same_owner = client.post("/pipeline-control-plane/actions/v1/capability", json=same_request)
        assert same_owner.status_code == 422

        leased = _seed_target(client, db_path, suffix="leased", attempt_status="failed", lease_active=True)
        leased_request = _approval_request("reassign", leased)
        leased_capability = client.post("/pipeline-control-plane/actions/v1/capability", json=leased_request)
        assert leased_capability.status_code == 200
        assert leased_capability.json()["data"]["typedReason"] == "invalid_transition"

        disagreement = _seed_target(client, db_path, suffix="disagreement")
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update work_items set metadata_json = ? where id = ?",
                (json.dumps({"authoritativePacketId": "packet-wrong"}), disagreement["workItemId"]),
            )
            conn.commit()
        disagreement_capability = client.post(
            "/pipeline-control-plane/actions/v1/capability",
            json=_approval_request("reassign", disagreement),
        )
        assert disagreement_capability.status_code == 200
        assert disagreement_capability.json()["data"]["typedReason"] == "evidence_invalid"

        unambiguous = _approval_request("reassign", same)
        unambiguous["executeNow"] = True
        assert client.post("/pipeline-control-plane/approvals/v1", json=unambiguous).status_code == 422


def test_concurrent_reassign_admission_allows_only_one_owner_transition(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-reassign-concurrent.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="concurrent-reassign")
        approval_request = _approval_request("reassign", target)
        approvals = [
            client.post("/pipeline-control-plane/approvals/v1", json=approval_request).json()["data"]
            for _ in range(2)
        ]
        requests = [
            _apply_request(approval_request, approval, suffix=f"concurrent-reassign-{index}")
            for index, approval in enumerate(approvals)
        ]
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda request: client.post("/pipeline-control-plane/actions/v1", json=request), requests))
        assert sorted(response.status_code for response in responses) == [200, 400]
        with sqlite3.connect(db_path) as conn:
            assert conn.execute(
                "select assignee_id from work_items where id = ?", (target["workItemId"],)
            ).fetchone()[0] == "owner-new"
            assert conn.execute(
                "select count(*) from workflow_events where event_type = 'work_item.reassigned'"
            ).fetchone()[0] == 1


def test_late_transaction_conflict_publishes_no_ghost_event(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-no-ghost-event.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        target = _seed_target(client, db_path, suffix="no-ghost", attempt_status="failed")
        approval_request = _approval_request("retry_verification", target)
        approval = client.post("/pipeline-control-plane/approvals/v1", json=approval_request).json()["data"]
        action_request = _apply_request(approval_request, approval, suffix="no-ghost")
        from sqlalchemy.ext.asyncio import AsyncSession
        from supervisor.api import main

        published: list[str] = []

        async def capture_publish(message: str) -> None:
            published.append(message)

        async def reject_commit(_session: AsyncSession) -> None:
            raise IntegrityError("forced late conflict", {}, RuntimeError("forced late conflict"))

        monkeypatch.setattr(main.service.bus, "publish", capture_publish)
        monkeypatch.setattr(AsyncSession, "commit", reject_commit)
        response = client.post("/pipeline-control-plane/actions/v1", json=action_request)
        assert response.status_code == 400
        assert "concurrent persisted state" in response.text
        assert published == []
        with sqlite3.connect(db_path) as conn:
            assert conn.execute("select count(*) from verification_retry_intents").fetchone()[0] == 0
            assert conn.execute(
                "select count(*) from workflow_events where event_type = 'work_item.verification_retry_queued'"
            ).fetchone()[0] == 0


def test_p2_1_identifier_column_lengths_match_sqlite_and_cross_dialect_model_schema(tmp_path, monkeypatch) -> None:
    db_name = "p2-1-identifier-schema.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name):
        with sqlite3.connect(db_path) as conn:
            sqlite_types = {
                table: {row[1]: row[2].upper() for row in conn.execute(f"pragma table_info({table})").fetchall()}
                for table in (
                    "pipeline_operational_action_records",
                    "pipeline_operational_approvals",
                    "verification_retry_intents",
                    "authoritative_work_packet_lifecycle_events",
                    "workflow_events",
                    "work_items",
                )
            }
        assert sqlite_types["pipeline_operational_action_records"]["idempotency_key"] == "VARCHAR(160)"
        assert sqlite_types["pipeline_operational_action_records"]["correlation_id"] == "VARCHAR(120)"
        assert sqlite_types["pipeline_operational_approvals"]["approval_id"] == "VARCHAR(120)"
        assert sqlite_types["verification_retry_intents"]["correlation_id"] == "VARCHAR(120)"
        assert sqlite_types["authoritative_work_packet_lifecycle_events"]["idempotency_key"] == "VARCHAR(120)"
        assert sqlite_types["workflow_events"]["correlation_id"] == "VARCHAR(36)"
        assert sqlite_types["work_items"]["assignee_id"] == "VARCHAR(100)"

        from supervisor.infrastructure.db.models import (
            AuthoritativeWorkPacketLifecycleEvent,
            OperationalActionApprovalRecord,
            OperationalActionRecord,
            VerificationRetryIntent,
            WorkflowEvent,
            WorkItem,
        )

        # These SQLAlchemy lengths generate the same bounded VARCHAR columns on
        # PostgreSQL; the SQLite assertions above prove startup schema parity.
        assert OperationalActionRecord.__table__.c.idempotency_key.type.length == 160
        assert OperationalActionRecord.__table__.c.target_id.type.length == 120
        assert OperationalActionApprovalRecord.__table__.c.approval_id.type.length == 120
        assert VerificationRetryIntent.__table__.c.idempotency_key.type.length == 160
        assert AuthoritativeWorkPacketLifecycleEvent.__table__.c.idempotency_key.type.length == 120
        assert WorkflowEvent.__table__.c.correlation_id.type.length == 36
        assert WorkItem.__table__.c.assignee_id.type.length == 100


def test_postgres_cross_path_admission_uses_one_durable_row_lock_contract() -> None:
    from sqlalchemy.dialects import postgresql
    from supervisor.application.service import SupervisorService
    from supervisor.infrastructure.db.models import AdmissionLock

    statement = SupervisorService._execute_admission_lock_statement()
    postgres_sql = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "UPDATE admission_locks" in postgres_sql
    assert "generation=(admission_locks.generation + 1)" in postgres_sql
    assert "admission_locks.scope = 'execute'" in postgres_sql
    assert AdmissionLock.__table__.primary_key.columns.keys() == ["scope"]

    admission_reads = {
        SupervisorService.pipeline_operational_action_capability_v1: "_validate_p2_1_operational_target",
        SupervisorService.issue_pipeline_operational_approval_v1: "_validate_p2_1_operational_target",
        SupervisorService.apply_pipeline_operational_action_v1: "_operational_action_by_idempotency",
        SupervisorService._validate_p2_1_operational_target: "session.get(ExecutionAttempt",
        SupervisorService.evaluate_subscription_agent_launch_request: "existing_attempt = await session.get(ExecutionAttempt",
        SupervisorService.create_execution_attempt: "session.get(WorkItem",
        SupervisorService.launch_supervised_codex_worker: "session.get(WorkItem",
        SupervisorService._reserve_subscription_agent_launch_runtime_attempt: "session.get(ExecutionAttempt",
        SupervisorService._create_or_refresh_lease: "select(QueueLease)",
        SupervisorService._run_guarded_utility_worker: "_refresh_external_launch_target_for_admission",
        SupervisorService._run_admitted_recipe_verification_commands: "_refresh_external_launch_target_for_admission",
        SupervisorService._run_admitted_remote_delivery: "_refresh_external_launch_target_for_admission",
    }
    for method, first_admission_read in admission_reads.items():
        source = textwrap.dedent(inspect.getsource(method))
        assert source.index("await self._acquire_execute_admission_lock(session)") < source.index(first_admission_read)
    launch_source = textwrap.dedent(inspect.getsource(SupervisorService.launch_supervised_codex_worker))
    assert launch_source.index("await session.commit()") < launch_source.index("self._run_supervised_codex_worker")
    p2_1_apply_source = textwrap.dedent(inspect.getsource(SupervisorService.apply_pipeline_operational_action_v1))
    for work_item_cas_fence in (
        "WorkItem.updated_at == expected_work_item_updated_at",
        "WorkItem.authoritative_packet_id == packet.id",
        "WorkItem.state == context.expectedWorkItemState",
    ):
        assert work_item_cas_fence in p2_1_apply_source
    service_source = inspect.getsource(SupervisorService)
    assert "LOCK TABLE" not in service_source
    assert "BEGIN IMMEDIATE" not in service_source


def test_recipe_branch_switch_rejects_without_durable_launch_reservation() -> None:
    from supervisor.application.service import SupervisorService

    service = object.__new__(SupervisorService)
    item = SimpleNamespace(
        metadata_json={
            "executionBranch": "recipe-admitted-branch",
            "baseBranch": "main",
            "baseRevision": "base-revision",
        }
    )
    recipe = SimpleNamespace(branch_prefix="recipe-")
    launched_commands: list[list[str]] = []

    def git_output(args: list[str]) -> tuple[bool, str]:
        if args == ["git", "branch", "--show-current"]:
            return True, "main"
        if args == ["git", "rev-parse", "--verify", "main"]:
            return True, "base-revision"
        raise AssertionError(f"unexpected metadata command: {args}")

    service._git_output = git_output
    service._run_git_command = lambda args: launched_commands.append(args)

    error, payload = service._prepare_recipe_branch(item, recipe, allow_branch_switch=False)

    assert error == "Recipe branch changed after metadata-only inspection; refresh and retry under launch admission."
    assert payload["branchSwitchAdmitted"] is False
    assert launched_commands == []


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("state", "reviewing"),
        ("updated_at", datetime(2026, 7, 14, 20, 0, tzinfo=timezone.utc) + timedelta(seconds=1)),
        ("assignee_id", "owner-concurrent"),
        ("assignee_label", "Concurrent owner"),
        ("authoritative_packet_id", "packet-concurrent"),
        ("metadata_json", {"executionRecipeId": "recipe-concurrent"}),
    ],
)
def test_external_launch_admission_cas_rejects_concurrent_routing_input_mutation(field, replacement) -> None:
    from supervisor.application.service import SupervisorService
    from supervisor.infrastructure.db.models import WorkItem

    service = object.__new__(SupervisorService)
    item = WorkItem(
        id="work-item-cas",
        title="CAS target",
        requested_outcome="Reject stale launch routing inputs.",
        source="pytest",
        state="implementing",
        assignee_id="owner-original",
        assignee_label="Original owner",
        authoritative_packet_id="packet-original",
        metadata_json={
            "authoritativePacketId": "packet-original",
            "authoritativePacketStage": "execute",
            "authoritativePacketStatus": "failed",
        },
        updated_at=datetime(2026, 7, 14, 20, 0, tzinfo=timezone.utc),
    )
    expected = service._external_launch_admission_snapshot(item)

    class ConcurrentMutationSession:
        async def refresh(self, target, *, with_for_update=False) -> None:
            assert with_for_update is True
            setattr(target, field, replacement)
            if field == "authoritative_packet_id":
                target.metadata_json = {**target.metadata_json, "authoritativePacketId": replacement}

        async def get(self, *args, **kwargs):
            raise AssertionError("stale CAS must fail before authoritative packet routing is read")

    with pytest.raises(ValueError, match="state, revision, ownership, or packet linkage changed concurrently"):
        asyncio.run(service._refresh_external_launch_target_for_admission(ConcurrentMutationSession(), item, expected))


def test_external_launch_admission_reloads_canonical_packet_projection_under_lock() -> None:
    from supervisor.application.service import SupervisorService
    from supervisor.infrastructure.db.models import AuthoritativeWorkPacket, WorkItem

    service = object.__new__(SupervisorService)
    item = WorkItem(
        id="work-item-packet-cas",
        title="Packet CAS target",
        requested_outcome="Reject stale authoritative packet routing.",
        source="pytest",
        state="implementing",
        authoritative_packet_id="packet-original",
        metadata_json={
            "authoritativePacketId": "packet-original",
            "authoritativePacketStage": "execute",
            "authoritativePacketStatus": "failed",
        },
        updated_at=datetime(2026, 7, 14, 20, 0, tzinfo=timezone.utc),
    )
    expected = service._external_launch_admission_snapshot(item)
    packet = AuthoritativeWorkPacket(
        id="packet-original",
        title="Canonical packet",
        current_stage="review",
        status="waiting",
        current_event_id="event-concurrent",
    )

    class ConcurrentPacketMutationSession:
        async def refresh(self, target, *, with_for_update=False) -> None:
            assert with_for_update is True
            return None

        async def get(self, model, packet_id, *, with_for_update=False):
            assert model is AuthoritativeWorkPacket
            assert packet_id == "packet-original"
            assert with_for_update is True
            return packet

    with pytest.raises(ValueError, match="authoritative packet projection is stale"):
        asyncio.run(
            service._refresh_external_launch_target_for_admission(
                ConcurrentPacketMutationSession(), item, expected
            )
        )


def test_active_recipe_verification_reservation_consumes_verification_wip() -> None:
    from supervisor.application.service import SupervisorService
    from supervisor.infrastructure.db.models import ExecutionAttempt, WorkItem

    service = object.__new__(SupervisorService)
    service.settings = SimpleNamespace(
        review_wip_limit=5,
        deliver_wip_limit=5,
        verification_wip_limit=1,
        operator_testing_wip_limit=5,
    )
    item = WorkItem(id="work-item-active-verification", state="implementing")
    attempt = ExecutionAttempt(
        id="attempt-active-verification",
        work_item_id=item.id,
        route_decision_id="route-active-verification",
        worker_id="recipe.verification.command",
        lane="utility",
        authority_mode="guarded_recipe_verification",
        status="starting",
        artifact_refs_json=[
            {
                "artifactType": "task_packet_v0",
                "packetId": "task-packet-route-active-verification",
                "workItemId": item.id,
                "routeDecisionId": "route-active-verification",
                "taskKind": "validation_execution",
                "approvalMode": "guarded_recipe_verification",
            }
        ],
    )

    class Rows:
        def __init__(self, values) -> None:
            self.values = values

        def scalars(self):
            return iter(self.values)

    class AdmissionSession:
        def __init__(self) -> None:
            self.results = iter((Rows([]), Rows([item]), Rows([]), Rows([attempt])))

        async def execute(self, statement):
            return next(self.results)

    admission = asyncio.run(service._evaluate_execute_admission(AdmissionSession()))
    assert admission.capacityAvailable is False
    assert admission.typedReason == "verification_wip_limit_reached"
    assert admission.observed is not None
    assert admission.observed.verification == 1


def test_postgres_admission_row_lock_serializes_concurrent_sessions_when_available() -> None:
    database_url = os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_URL")
    if not database_url or os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_ISOLATED") != "1":
        pytest.skip("No explicitly isolated PostgreSQL test database; source-owned cross-path row-lock contract was verified.")

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from supervisor.application.service import SupervisorService

    async def run_probe() -> None:
        test_engine = create_async_engine(database_url, future=True)
        try:
            async with test_engine.begin() as connection:
                await connection.execute(
                    text(
                        "CREATE TABLE IF NOT EXISTS admission_locks "
                        "(scope VARCHAR(32) PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0)"
                    )
                )
                await connection.execute(
                    text(
                        "INSERT INTO admission_locks (scope, generation) VALUES ('execute', 0) "
                        "ON CONFLICT (scope) DO NOTHING"
                    )
                )
            sessions = async_sessionmaker(test_engine, expire_on_commit=False)
            async with sessions() as first, sessions() as second:
                await first.execute(SupervisorService._execute_admission_lock_statement())
                second_acquired = asyncio.Event()

                async def acquire_second() -> None:
                    await second.execute(SupervisorService._execute_admission_lock_statement())
                    second_acquired.set()
                    await second.rollback()

                waiter = asyncio.create_task(acquire_second())
                await asyncio.sleep(0.1)
                assert not second_acquired.is_set()
                await first.commit()
                await asyncio.wait_for(waiter, timeout=2)
                assert second_acquired.is_set()
        finally:
            await test_engine.dispose()

    asyncio.run(run_probe())
