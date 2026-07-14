import json
import sqlite3
import sys

from fastapi.testclient import TestClient


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
                    7,
                    f"route-{suffix}",
                    "metadata-only-verifier",
                    "validation",
                    "metadata_only",
                    attempt_status,
                    json.dumps({}),
                    json.dumps([]),
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
        assert result["successEvidence"]["providerOrWorkerLaunched"] is False
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
