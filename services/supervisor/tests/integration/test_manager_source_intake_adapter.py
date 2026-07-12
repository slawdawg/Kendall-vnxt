import copy
import hashlib
import json
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import pytest
import uvicorn


REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_PATH = REPO_ROOT / "docs" / "workflows" / "current-session-runbook.md"


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _free_loopback_port() -> int:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])
    except PermissionError as exc:
        pytest.skip(
            "Codex sandbox denies loopback sockets; run the exact "
            "`pnpm run test:manager-source-intake` command outside the sandbox."
        )
        raise AssertionError("unreachable") from exc


def _json_get(url: str) -> dict[str, object]:
    with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - fixed loopback URL
        return json.loads(response.read().decode("utf8"))


def _table_count(db_path: Path, table_name: str) -> int:
    with sqlite3.connect(db_path) as connection:
        return int(connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])


def _run_node(
    args: list[str], *, input_text: str | None = None, expected_returncode: int = 0
) -> dict[str, object]:
    result = subprocess.run(
        ["node", *args],
        cwd=REPO_ROOT,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )
    assert result.returncode == expected_returncode, result.stderr or result.stdout
    return json.loads(result.stdout)


def test_source_backed_manager_candidate_persists_as_authoritative_supervisor_projection(
    tmp_path, monkeypatch
) -> None:
    db_path = tmp_path / "manager-source-intake.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    from supervisor.api.main import app

    port = _free_loopback_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="error",
            access_log=False,
            lifespan="on",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    source_digest_before = hashlib.sha256(SOURCE_PATH.read_bytes()).hexdigest()
    raw_bmad_marker = "RAW_BMAD_STORY_BODY_MUST_NOT_BE_RETAINED_7f9c"

    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert server.started, "loopback supervisor failed to start"

    try:
        manager_packet = _run_node(
            [
                "./scripts/manager-source-packet-seed.mjs",
                "--summary-json",
                "--run-id",
                "gate-4-manager-source-intake-proof",
                "--candidate-id",
                "gate-4-source-backed-candidate",
                "--title",
                "Gate 4 source-backed manager candidate",
                "--source-ref",
                "doc:docs/workflows/current-session-runbook.md",
                "--acceptance-criterion",
                "Supervisor owns the persisted WorkPacket lifecycle truth.",
                "--verification-target",
                "pnpm run test:manager-source-intake",
                "--touched-surface",
                "scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs",
                "--risk-class",
                "low",
                "--authority-class",
                "allowed_unattended",
            ]
        )
        assert manager_packet["summary"]["packetState"] == "eligible"  # type: ignore[index]
        assert manager_packet["summary"]["mutationMode"] == "none; read-only source-backed packet seed"  # type: ignore[index]
        unsafe_packet = copy.deepcopy(manager_packet)
        unsafe_packet["rawBmadPayload"] = raw_bmad_marker
        rejected = _run_node(
            [
                "./scripts/manager-supervisor-source-intake.mjs",
                "--input",
                "-",
                "--supervisor-url",
                f"http://127.0.0.1:{port}",
            ],
            input_text=json.dumps(unsafe_packet),
            expected_returncode=1,
        )
        assert rejected["status"] == "blocked"
        assert rejected["blockers"][-1]["code"] == "manager_supervisor_source_intake_input_invalid"  # type: ignore[index]
        assert _table_count(db_path, "authoritative_work_packets") == 0

        integrated = _run_node(
            [
                "./scripts/manager-supervisor-source-intake.mjs",
                "--input",
                "-",
                "--supervisor-url",
                f"http://127.0.0.1:{port}",
            ],
            input_text=json.dumps(manager_packet),
        )
        intake = integrated["summary"]["seedPacket"]["supervisorIntake"]  # type: ignore[index]
        packet_id = str(intake["packetId"])
        assert intake["status"] == "persisted"
        assert intake["metadataOnly"] is True
        assert intake["rawPayloadRetained"] is False

        lifecycle = _json_get(
            f"http://127.0.0.1:{port}/pipeline-control-plane/work-packets/{packet_id}"
        )["data"]
        assert lifecycle["packetId"] == packet_id  # type: ignore[index]
        assert lifecycle["currentStage"] == "capture"  # type: ignore[index]
        assert lifecycle["status"] == "waiting"  # type: ignore[index]
        assert lifecycle["truthLabel"] == "source_owned"  # type: ignore[index]
        assert lifecycle["metadataOnly"] is True  # type: ignore[index]
        assert lifecycle["sourceRef"] == {  # type: ignore[index]
            "refId": "doc:docs/workflows/current-session-runbook.md",
            "sourceType": "repo_doc",
            "pathOrUrl": "docs/workflows/current-session-runbook.md",
            "title": None,
        }
        assert len(lifecycle["history"]) == 1  # type: ignore[arg-type,index]
        assert lifecycle["history"][0]["eventType"] == "packet.created"  # type: ignore[index]
        assert lifecycle["history"][0]["metadataOnly"] is True  # type: ignore[index]

        projection = _json_get(
            f"http://127.0.0.1:{port}/pipeline-control-plane/projection"
        )["data"]
        projected = next(
            packet for packet in projection["workPackets"] if packet["packetId"] == packet_id  # type: ignore[index,union-attr]
        )
        assert projected["currentStage"] == "capture"
        assert projected["status"] == "waiting"
        assert projected["truthLabel"] == "live"
        assert projected["metadataOnly"] is True

        assert _table_count(db_path, "authoritative_work_packets") == 1
        assert _table_count(db_path, "authoritative_work_packet_lifecycle_events") == 1
        for forbidden_table in (
            "candidate_work",
            "work_items",
            "workflow_events",
            "execution_attempts",
            "queue_leases",
            "queue_lease_actions",
        ):
            assert _table_count(db_path, forbidden_table) == 0
        assert raw_bmad_marker.encode() not in db_path.read_bytes()
        assert hashlib.sha256(SOURCE_PATH.read_bytes()).hexdigest() == source_digest_before
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive(), "loopback supervisor failed to stop"
