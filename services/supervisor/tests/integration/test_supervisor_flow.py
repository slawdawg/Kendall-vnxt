import asyncio
import sys

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def test_work_item_progresses_to_done_and_triggers_audit(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervisor.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Smoke test flow",
                "requestedOutcome": "Verify the supervisor can orchestrate the v1 loop.",
                "source": "pytest",
                "details": "Integration coverage",
                "riskLevel": "high",
                "metadata": {"suite": "integration"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(6):
            asyncio.run(process_once_for_tests())

        item_response = client.get(f"/work-items/{work_item_id}")
        audits_response = client.get("/audit-events")
        status_response = client.get("/supervisor/status")

        assert item_response.status_code == 200
        assert audits_response.status_code == 200
        assert status_response.status_code == 200

        item = item_response.json()["data"]
        audits = audits_response.json()["data"]
        status = status_response.json()["data"]

        assert item["state"] == "done"
        assert item["auditMode"] == "required"
        assert any(audit["workItemId"] == work_item_id for audit in audits)
        assert status["doneCount"] == 1


def test_supervisor_control_endpoints_change_mode(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "control.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        cors = client.options(
            "/work-items",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        pause = client.post("/supervisor/pause")
        drain = client.post("/supervisor/drain")
        disable = client.post("/supervisor/disable")
        enable = client.post("/supervisor/enable")
        status = client.get("/supervisor/status")

        assert cors.status_code == 200
        assert cors.headers["access-control-allow-origin"] == "http://localhost:3000"
        assert pause.status_code == 200
        assert drain.status_code == 200
        assert disable.status_code == 200
        assert enable.status_code == 200
        assert status.status_code == 200
        assert status.json()["data"]["mode"] == "running"
