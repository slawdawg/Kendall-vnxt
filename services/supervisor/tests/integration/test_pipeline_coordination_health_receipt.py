import json
import socket
import sys
import threading
import time
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from starlette.requests import Request
import uvicorn


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


@contextmanager
def _running_private_uds_supervisor(tmp_path, monkeypatch):
    private = tmp_path / "supervisor-private"
    private.mkdir(mode=0o700)
    socket_path = private / "supervisor.sock"
    password_path = private / "bootstrap-password"
    password_path.write_text("private test bootstrap password\n", encoding="utf8")
    password_path.chmod(0o600)
    db_path = tmp_path / "coordination-health-uds.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(socket_path))
    monkeypatch.setenv("KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE", str(password_path))
    _reset_supervisor_modules()
    from supervisor.api import main

    server = uvicorn.Server(uvicorn.Config(main.app, uds=str(socket_path), log_level="error", access_log=False, lifespan="on"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert server.started, "private UDS supervisor failed to start within 10 seconds"
    try:
        yield socket_path
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive(), "private UDS supervisor failed to stop within 10 seconds"
        socket_path.unlink(missing_ok=True)


def _uds_request(socket_path: Path, path: str, *, method: str = "POST", payload: dict[str, object] | None = None) -> tuple[int, dict[str, object], str]:
    body = json.dumps(payload).encode("utf8") if payload is not None else b""
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(10)
        client.connect(str(socket_path))
        client.sendall(
            f"{method} {path} HTTP/1.1\r\nHost: supervisor\r\nAccept: application/json\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode("ascii") + body
        )
        chunks = []
        while chunk := client.recv(65536):
            chunks.append(chunk)
    raw = b"".join(chunks).decode("utf8")
    header, text = raw.split("\r\n\r\n", 1)
    return int(header.split()[1]), json.loads(text), text


def _operational_request(client: tuple[str | None, int] | None) -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/manager-control-plane/coordination-health-handoffs",
            "raw_path": b"/manager-control-plane/coordination-health-handoffs",
            "query_string": b"",
            "headers": [],
            "client": client,
            "server": None,
        }
    )


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


def test_private_uds_coordination_health_handoff_persists_and_projects(tmp_path, monkeypatch) -> None:
    observed_at = datetime.now(UTC)
    payload = _payload(observed_at=observed_at)
    with _running_private_uds_supervisor(tmp_path, monkeypatch) as socket_path:
        created_status, created, created_text = _uds_request(socket_path, "/manager-control-plane/coordination-health-handoffs", payload=payload)
        assert created_status == 200, created_text
        assert created["data"]["handoffId"] == payload["handoffId"]

        read_status, readback, read_text = _uds_request(
            socket_path,
            f"/manager-control-plane/coordination-health-handoffs/{payload['handoffId']}",
            method="GET",
        )
        assert read_status == 200, read_text
        assert readback["data"]["coordinationHealth"]["freshness"] == "fresh"

        projection_status, projection, projection_text = _uds_request(socket_path, "/pipeline-control-plane/projection", method="GET")
        assert projection_status == 200, projection_text
        assert projection["data"]["coordinationHealth"]["freshness"] == "fresh"
        assert projection["data"]["coordinationHealth"]["dirtyPreserveCount"] == 3


def test_coordination_health_handoff_rejects_remote_tcp_client(tmp_path, monkeypatch) -> None:
    observed_at = datetime.now(UTC)
    db_path = (tmp_path / "coordination-health-remote.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.api.main import app

    with TestClient(app, client=("192.0.2.10", 50000)) as client:
        rejected = client.post("/manager-control-plane/coordination-health-handoffs", json=_payload(observed_at=observed_at))
        assert rejected.status_code == 403
        assert rejected.json()["detail"]["error"]["code"] == "local_operational_boundary_required"
        assert client.get("/pipeline-control-plane/projection").json()["data"]["coordinationHealth"] is None


def test_clientless_operational_transport_requires_lan_private_uds(monkeypatch) -> None:
    for lan_auth_enabled, supervisor_transport in (("false", "loopback"), ("true", "loopback"), ("false", "private_uds")):
        monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", lan_auth_enabled)
        monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", supervisor_transport)
        _reset_supervisor_modules()
        from supervisor.api.main import request_has_local_operational_transport

        assert request_has_local_operational_transport(_operational_request(None)) is False

    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    _reset_supervisor_modules()
    from supervisor.api.main import request_has_local_operational_transport

    assert request_has_local_operational_transport(_operational_request((None, 50000))) is False


def test_coordination_health_projection_fails_closed_when_receipt_is_stale(tmp_path, monkeypatch) -> None:
    observed_at = datetime.now(UTC) - timedelta(hours=1)
    with _client(tmp_path, monkeypatch) as client:
        created = client.post("/manager-control-plane/coordination-health-handoffs", json=_payload(observed_at=observed_at))
        assert created.status_code == 200, created.text
        projection = client.get("/pipeline-control-plane/projection")
        assert projection.status_code == 200, projection.text
        assert projection.json()["data"]["coordinationHealth"] is None
