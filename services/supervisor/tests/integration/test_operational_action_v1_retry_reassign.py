import json
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor

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
                    f"route-{suffix}",
                    "metadata-only-verifier",
                    "validation",
                    "metadata_only",
                    attempt_status,
                    json.dumps({}),
                    json.dumps(
                        [
                            {
                                "artifactType": "task_packet_v0",
                                "taskKind": "validation_execution" if attempt_purpose == "verification" else "code_execution",
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
