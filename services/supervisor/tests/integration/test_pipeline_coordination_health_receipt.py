from datetime import UTC, datetime, timedelta
import sys

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path, monkeypatch) -> TestClient:
    db_path = (tmp_path / "coordination-health.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.api.main import app

    return TestClient(app, client=("127.0.0.1", 50000))


def _payload(*, observed_at: datetime) -> dict[str, object]:
    return {
        "schemaVersion": "manager-coordination-health-handoff/v0",
        "handoffId": f"manager-coordination-health-handoff:{'c' * 40}",
        "sourceSequence": int(observed_at.timestamp() * 1000),
        "coordinationHealth": {
            "schemaVersion": "manager-coordination-health/v0",
            "runId": "run:coordination",
            "observedAt": observed_at.isoformat().replace("+00:00", "Z"),
            "source": "manager_workspace_inventory",
            "freshness": "fresh",
            "availability": "incomplete",
            "activeWorkCount": 2,
            "staleOwnerTargetCount": 17,
            "staleOwnerProjectedCount": 12,
            "dirtyPreserveCount": 3,
            "missingWorktreeJournalHold": True,
            "nextSafeAction": "Preserve dirty worktrees and refresh canonical stale-owner evidence.",
            "evidenceRefs": ["manager:assignment-report", "manager:stale-owner-inspection"],
            "metadataOnly": True,
            "rawPayloadRetained": False,
        },
        "idempotencyKey": f"manager-coordination-health:run:coordination:{int(observed_at.timestamp() * 1000)}",
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def test_coordination_health_receipt_readback_projects_only_fresh_canonical_evidence(tmp_path, monkeypatch) -> None:
    observed_at = datetime.now(UTC)
    with _client(tmp_path, monkeypatch) as client:
        payload = _payload(observed_at=observed_at)
        created = client.post("/manager-control-plane/coordination-health-handoffs", json=payload)
        assert created.status_code == 200, created.text
        assert created.json()["data"]["coordinationHealth"]["staleOwnerProjectedCount"] == 12
        readback = client.get(f"/manager-control-plane/coordination-health-handoffs/{payload['handoffId']}")
        assert readback.status_code == 200, readback.text
        assert readback.json()["data"]["handoffId"] == payload["handoffId"]
        projection = client.get("/pipeline-control-plane/projection")
        assert projection.status_code == 200, projection.text
        assert projection.json()["data"]["coordinationHealth"]["dirtyPreserveCount"] == 3


def test_coordination_health_projection_fails_closed_when_receipt_is_stale(tmp_path, monkeypatch) -> None:
    observed_at = datetime.now(UTC) - timedelta(hours=1)
    with _client(tmp_path, monkeypatch) as client:
        created = client.post("/manager-control-plane/coordination-health-handoffs", json=_payload(observed_at=observed_at))
        assert created.status_code == 200, created.text
        projection = client.get("/pipeline-control-plane/projection")
        assert projection.status_code == 200, projection.text
        assert projection.json()["data"]["coordinationHealth"] is None
