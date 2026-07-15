from __future__ import annotations

import json
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path: Path, monkeypatch, db_name: str) -> TestClient:
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.api.main import app

    return TestClient(app, client=("127.0.0.1", 50000))


def _seed_active_work(client: TestClient, db_path: str) -> str:
    response = client.post(
        "/work-items",
        json={
            "title": "P2.2 active work",
            "requestedOutcome": "Preserve active work during runtime control transitions.",
            "source": "pytest",
            "metadata": {},
        },
    )
    assert response.status_code == 200, response.text
    work_item_id = response.json()["data"]["id"]
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "update work_items set state = 'implementing', updated_at = ?, last_event_at = ? where id = ?",
            ("2026-07-15 00:00:00.000000", "2026-07-15 00:00:00.000000", work_item_id),
        )
        connection.execute(
            "insert into queue_leases (id, work_item_id, attempt_count, heartbeat_at, lease_expires_at, fencing_token, active) values (?, ?, ?, ?, ?, ?, ?)",
            (
                "lease-p2-2",
                work_item_id,
                1,
                "2026-07-15 00:00:00.000000",
                "2026-07-15 01:00:00.000000",
                7,
                1,
            ),
        )
        connection.execute(
            "insert into execution_attempts (id, work_item_id, queue_lease_id, queue_fencing_token, route_decision_id, worker_id, lane, authority_mode, status, workspace_isolation_plan_json, artifact_refs_json, event_refs_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "attempt-p2-2",
                work_item_id,
                "lease-p2-2",
                7,
                "route-p2-2",
                "worker-p2-2",
                "implementation",
                "metadata_only",
                "running",
                json.dumps({}),
                json.dumps([]),
                json.dumps([]),
                "2026-07-15 00:00:00.000000",
                "2026-07-15 00:00:00.000000",
            ),
        )
        connection.commit()
    return work_item_id


def _runtime_request(action_id: str, *, mode: str, revision: int, counts: dict[str, int], key: str, correlation: str) -> dict:
    from supervisor.api.schemas import (
        DrainActionContextV1,
        PauseActionContextV1,
        ResumeActionContextV1,
        operational_action_context_digest_sha256_v1,
    )

    context_values = {
        "kind": action_id,
        "expectedRuntimeMode": mode,
        "expectedRuntimeRevision": revision,
        **(
            {
                "expectedActiveWorkCount": counts["activeWorkCount"],
                "expectedActiveLeaseCount": counts["activeLeaseCount"],
                "expectedRunningAttemptCount": counts["runningAttemptCount"],
            }
            if action_id == "drain"
            else {}
        ),
    }
    context_model = {
        "pause": PauseActionContextV1,
        "drain": DrainActionContextV1,
        "resume": ResumeActionContextV1,
    }[action_id].model_validate(context_values)
    target_type = "runtime"
    target_id = "supervisor-runtime"
    return {
        "schemaVersion": "pipeline-operational-action/v1",
        "actionId": action_id,
        "targetType": target_type,
        "targetId": target_id,
        "actionContext": context_model.model_dump(mode="json"),
        "actionContextDigestSha256": operational_action_context_digest_sha256_v1(
            action_id, target_type, target_id, context_model
        ),
        "requestedBy": {
            "actorType": "operator",
            "actorId": "pipeline-operator",
            "actorLabel": "Pipeline operator",
        },
        "requestedAuthorityState": "needs_authority_approval",
        "requestedRiskTier": "low" if action_id in {"pause", "resume"} else "medium",
        "serverBound": True,
        "metadataOnly": True,
        "rawPayloadRetained": False,
        "idempotencyKey": key,
        "correlationId": correlation,
        "approvalId": "pending",
        "evidenceRefs": [f"test:{action_id}:p2-2"],
    }


def _issue_and_bind_approval(client: TestClient, request: dict) -> dict:
    approval_request = {key: value for key, value in request.items() if key not in {"idempotencyKey", "correlationId", "approvalId", "evidenceRefs"}}
    response = client.post("/pipeline-control-plane/approvals/v1", json=approval_request)
    assert response.status_code == 200, response.text
    approval = response.json()["data"]
    return {**request, "approvalId": approval["approvalId"]}


def test_pause_and_drain_are_fenced_atomic_preserving_and_legacy_closed(tmp_path, monkeypatch) -> None:
    db_name = "p2-2-runtime-actions.db"
    db_path = (tmp_path / db_name).as_posix()
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item_id = _seed_active_work(client, db_path)
        initial = client.get("/supervisor/status")
        assert initial.status_code == 200, initial.text
        assert initial.json()["data"]["mode"] == "running"
        assert initial.json()["data"]["revision"] == 1

        counts = {"activeWorkCount": 1, "activeLeaseCount": 1, "runningAttemptCount": 1}
        stale_drain = _runtime_request("drain", mode="running", revision=1, counts=counts, key="stale-drain", correlation="corr-stale-drain")
        stale_drain = _issue_and_bind_approval(client, stale_drain)
        pause = _runtime_request("pause", mode="running", revision=1, counts=counts, key="pause-p2-2", correlation="corr-pause-p2-2")
        pause = _issue_and_bind_approval(client, pause)
        paused_response = client.post("/pipeline-control-plane/actions/v1", json=pause)
        assert paused_response.status_code == 200, paused_response.text
        paused_result = paused_response.json()["data"]
        assert paused_result["successEvidence"] == {
            "kind": "pause",
            "resultingRuntimeMode": "paused",
            "resultingRuntimeRevision": 2,
            **counts,
            "intakeStopped": True,
            "activeWorkPreserved": True,
        }

        status = client.get("/supervisor/status").json()["data"]
        assert (status["mode"], status["revision"]) == ("paused", 2)
        blocked_admission = client.post(
            f"/work-items/{work_item_id}/execution-attempts",
            json={"stepId": "local-proof", "taskKind": "implementation"},
        )
        assert blocked_admission.status_code == 409
        assert "New work and launch admission is blocked" in blocked_admission.text
        blocked_intake = client.post(
            "/work-items",
            json={
                "title": "blocked paused intake",
                "requestedOutcome": "must not be admitted",
                "source": "pytest",
                "metadata": {},
            },
        )
        assert blocked_intake.status_code == 409
        assert "New work and launch admission is blocked" in blocked_intake.text

        stale_response = client.post("/pipeline-control-plane/actions/v1", json=stale_drain)
        assert stale_response.status_code == 400
        assert "mode or revision fence is stale" in stale_response.text

        drain = _runtime_request("drain", mode="paused", revision=2, counts=counts, key="drain-p2-2", correlation="corr-drain-p2-2")
        drain = _issue_and_bind_approval(client, drain)
        drained_response = client.post("/pipeline-control-plane/actions/v1", json=drain)
        assert drained_response.status_code == 200, drained_response.text
        drained_result = drained_response.json()["data"]
        assert drained_result["successEvidence"]["resultingRuntimeMode"] == "draining"
        assert drained_result["successEvidence"]["resultingRuntimeRevision"] == 3
        assert drained_result["successEvidence"]["activeWorkCount"] == 1
        assert drained_result["successEvidence"]["activeLeaseCount"] == 1
        assert drained_result["successEvidence"]["runningAttemptCount"] == 1
        assert drained_result["successEvidence"]["workersKilled"] is False

        resume = _runtime_request("resume", mode="draining", revision=3, counts=counts, key="resume-p2-2", correlation="corr-resume-p2-2")
        resume = _issue_and_bind_approval(client, resume)
        resumed_response = client.post("/pipeline-control-plane/actions/v1", json=resume)
        assert resumed_response.status_code == 200, resumed_response.text
        resumed_result = resumed_response.json()["data"]
        assert resumed_result["successEvidence"] == {
            "kind": "resume",
            "resultingRuntimeMode": "running",
            "resultingRuntimeRevision": 4,
            **counts,
            "intakeResumed": True,
            "activeWorkPreserved": True,
        }
        status = client.get("/supervisor/status").json()["data"]
        assert (status["mode"], status["revision"]) == ("running", 4)
        assert (status["activeWorkCount"], status["activeLeaseCount"], status["runningAttemptCount"]) == (1, 1, 1)
        assert status["drainConverged"] is True
        resumed_intake = client.post(
            "/work-items",
            json={
                "title": "resumed intake",
                "requestedOutcome": "may be admitted after fresh resume",
                "source": "pytest",
                "metadata": {},
            },
        )
        assert resumed_intake.status_code == 200, resumed_intake.text

        replay = client.post("/pipeline-control-plane/actions/v1", json=drain)
        assert replay.status_code == 200, replay.text
        assert replay.json()["data"]["replayed"] is True
        assert replay.json()["data"]["actionRecordId"] == drained_result["actionRecordId"]

        conflict = {**drain, "correlationId": "corr-different-request"}
        conflict_response = client.post("/pipeline-control-plane/actions/v1", json=conflict)
        assert conflict_response.status_code == 400
        assert "different action metadata" in conflict_response.text

        with sqlite3.connect(db_path) as connection:
            control = connection.execute("select mode, revision from supervisor_control where id = 1").fetchone()
            assert control == ("running", 4)
            assert connection.execute("select state from work_items where id = ?", (work_item_id,)).fetchone()[0] == "implementing"
            assert connection.execute("select active from queue_leases where id = 'lease-p2-2'").fetchone()[0] == 1
            assert connection.execute("select status from execution_attempts where id = 'attempt-p2-2'").fetchone()[0] == "running"

        for legacy_path in ("/supervisor/pause", "/supervisor/drain"):
            legacy = client.post(legacy_path)
            assert legacy.status_code == 410
            assert "pipeline operational-action v1" in legacy.text


def test_concurrent_runtime_transitions_allow_one_revision_winner(tmp_path, monkeypatch) -> None:
    db_name = "p2-2-runtime-concurrency.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        counts = {"activeWorkCount": 0, "activeLeaseCount": 0, "runningAttemptCount": 0}
        requests = []
        for suffix in ("one", "two"):
            request = _runtime_request(
                "pause",
                mode="running",
                revision=1,
                counts=counts,
                key=f"concurrent-pause-{suffix}",
                correlation=f"corr-concurrent-{suffix}",
            )
            requests.append(_issue_and_bind_approval(client, request))

        def apply(request: dict) -> tuple[int, str]:
            response = client.post("/pipeline-control-plane/actions/v1", json=request)
            return response.status_code, response.text

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(apply, requests))

        assert sorted(status for status, _ in results) == [200, 400]
        assert any("mode or revision fence is stale" in body for status, body in results if status == 400)
