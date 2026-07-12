import hashlib
import json
import os
import shlex
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from urllib.error import HTTPError
from urllib.parse import quote
from pathlib import Path

import pytest
import uvicorn


REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_PATH = REPO_ROOT / "docs" / "workflows" / "current-session-runbook.md"
DEFAULT_STORY_KEY = "91-1-gate-4-real-dashboard-process-proof"
DEFAULT_SOURCE_KEY = "2099-01-01-gate-4-real-dashboard-process-proof"
DEFAULT_ARTIFACT_DIR = REPO_ROOT / "_bmad-output" / "implementation-artifacts"
DEFAULT_PLANNING_DIR = REPO_ROOT / "_bmad-output" / "planning-artifacts"


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


def _json_post(url: str, payload: dict[str, object], *, expected_status: int = 200) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf8"),
        headers={"content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed loopback URL
            assert response.status == expected_status
            return json.loads(response.read().decode("utf8"))
    except HTTPError as exc:
        assert exc.code == expected_status
        return json.loads(exc.read().decode("utf8"))


def _text_get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=15) as response:  # noqa: S310 - fixed loopback URL
        return response.read().decode("utf8")


def _start_dashboard(supervisor_url: str, port: int, log_file) -> subprocess.Popen[str]:
    dashboard_binary = REPO_ROOT / "apps" / "dashboard" / "node_modules" / ".bin" / "next"
    if not dashboard_binary.is_file():
        raise AssertionError(
            "Joined dashboard proof requires apps/dashboard/node_modules/.bin/next; "
            "install dashboard JavaScript dependencies before running this required proof."
        )
    env = os.environ.copy()
    env.update(
        {
            "NEXT_TELEMETRY_DISABLED": "1",
            "SUPERVISOR_INTERNAL_URL": supervisor_url,
            "NEXT_PUBLIC_SUPERVISOR_URL": supervisor_url,
        }
    )
    process = subprocess.Popen(
        [
            str(dashboard_binary),
            "dev",
            "apps/dashboard",
            "--hostname",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=REPO_ROOT,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    deadline = time.monotonic() + 45
    while process.poll() is None and time.monotonic() < deadline:
        try:
            _text_get(f"http://127.0.0.1:{port}/pipeline")
            return process
        except Exception:  # noqa: BLE001 - readiness retries retain the final dashboard log
            time.sleep(0.1)
    _stop_process(process)
    log_file.flush()
    log_file.seek(0)
    raise AssertionError(f"dashboard failed to become ready:\n{log_file.read()}")


def _stop_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _start_supervisor(port: int):
    _reset_supervisor_modules()

    from supervisor.api.main import app

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
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert server.started, "loopback supervisor failed to start"
    return server, thread


def _enable_attested_local_proof(db_path: Path) -> None:
    from supervisor.api.main import service
    from supervisor.application.service import LOCAL_PROOF_TEST_CAPABILITY

    service.enable_local_proof_for_test(LOCAL_PROOF_TEST_CAPABILITY, db_path)


def _stop_supervisor(server: uvicorn.Server | None, thread: threading.Thread | None) -> None:
    if server is None or thread is None:
        return
    server.should_exit = True
    thread.join(timeout=10)
    assert not thread.is_alive(), "loopback supervisor failed to stop"


def _table_count(db_path: Path, table_name: str) -> int:
    with sqlite3.connect(db_path) as connection:
        return int(connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])


def _run_node(args: list[str], *, expected_returncode: int = 0) -> dict[str, object]:
    result = subprocess.run(
        ["node", *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )
    assert result.returncode == expected_returncode, f"{result.stderr}\n{result.stdout}"
    return json.loads(result.stdout)


def _write_default_bmad_hierarchy() -> dict[Path, bytes | None]:
    bundle = DEFAULT_PLANNING_DIR / "prds" / f"prd-Kendall_Nxt-{DEFAULT_SOURCE_KEY}"
    paths = (
        DEFAULT_ARTIFACT_DIR / "sprint-status.yaml",
        DEFAULT_ARTIFACT_DIR / f"{DEFAULT_STORY_KEY}.md",
        bundle / "prd.md",
        DEFAULT_PLANNING_DIR / f"architecture-{DEFAULT_SOURCE_KEY}.md",
        DEFAULT_PLANNING_DIR / f"epics-{DEFAULT_SOURCE_KEY}.md",
        DEFAULT_PLANNING_DIR / f"implementation-readiness-report-{DEFAULT_SOURCE_KEY}.md",
    )
    originals = {path: path.read_bytes() if path.exists() else None for path in paths}
    DEFAULT_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    bundle.mkdir(parents=True, exist_ok=True)
    (DEFAULT_ARTIFACT_DIR / "sprint-status.yaml").write_text(
        f"source_key: {DEFAULT_SOURCE_KEY}\ndevelopment_status:\n  {DEFAULT_STORY_KEY}: ready-for-dev\n",
        encoding="utf8",
    )
    (DEFAULT_ARTIFACT_DIR / f"{DEFAULT_STORY_KEY}.md").write_text(
        f"# Story 91.1: Gate 4 real dashboard process proof\n\nStatus: ready-for-dev\n",
        encoding="utf8",
    )
    (bundle / "prd.md").write_text("---\nstatus: final\nauthoritative: true\n---\n", encoding="utf8")
    prd_ref = f"_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-{DEFAULT_SOURCE_KEY}/prd.md"
    architecture_ref = f"_bmad-output/planning-artifacts/architecture-{DEFAULT_SOURCE_KEY}.md"
    epics_ref = f"_bmad-output/planning-artifacts/epics-{DEFAULT_SOURCE_KEY}.md"
    (DEFAULT_PLANNING_DIR / f"architecture-{DEFAULT_SOURCE_KEY}.md").write_text(
        f"---\nworkflowType: architecture\nstatus: complete\nauthoritative_prd: {prd_ref}\n---\n", encoding="utf8"
    )
    (DEFAULT_PLANNING_DIR / f"epics-{DEFAULT_SOURCE_KEY}.md").write_text(
        f"---\nworkflowType: epics-and-stories\nstatus: complete\nauthoritative_prd: {prd_ref}\nauthoritative_architecture: {architecture_ref}\n---\n", encoding="utf8"
    )
    (DEFAULT_PLANNING_DIR / f"implementation-readiness-report-{DEFAULT_SOURCE_KEY}.md").write_text(
        f"---\nworkflowType: implementation-readiness\nstatus: complete\nauthoritative_prd: {prd_ref}\nauthoritative_architecture: {architecture_ref}\nauthoritative_epics: {epics_ref}\n---\n",
        encoding="utf8",
    )
    return originals


def _remove_default_bmad_hierarchy(originals: dict[Path, bytes | None]) -> None:
    for path, original in originals.items():
        if original is None:
            path.unlink(missing_ok=True)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(original)
    bundle = DEFAULT_PLANNING_DIR / "prds" / f"prd-Kendall_Nxt-{DEFAULT_SOURCE_KEY}"
    bundle_had_original_content = any(
        original is not None and path.is_relative_to(bundle)
        for path, original in originals.items()
    )
    if bundle.exists() and not bundle_had_original_content:
        bundle.rmdir()


def _default_manager_intake_command(supervisor_url: str, script_path: Path) -> list[str]:
    script_path.write_text(
        """
import { buildRefillPlan } from '__CORE_MODULE__';
const plan = buildRefillPlan(
  { runId: 'gate-4-real-dashboard-process-proof', desiredWorkers: 1, supervisorUrl: process.argv[2] },
  { assignmentSummary: { summary: { backlogStatusCounts: { assignable: 0, closed: 0 }, laneAssignmentStatusCounts: { claimed: 0 }, workspaceAssignmentStatusCounts: { active: 0 } } }, dispatchPreview: { counts: { dispatchable: 0, active: 0, blocked: 0 }, dispatch: { allowed: false } } },
);
const action = plan.nextActions.find((candidate) => candidate.code === 'manager-source-intake-ready');
if (!action) throw new Error(JSON.stringify(plan));
console.log(action.applyCommand);
""".replace("__CORE_MODULE__", (REPO_ROOT / "scripts" / "lib" / "manager-control-plane" / "core.mjs").as_uri()).strip(),
        encoding="utf8",
    )
    result = subprocess.run(
        ["node", str(script_path), supervisor_url], cwd=REPO_ROOT, text=True, capture_output=True, check=False, timeout=20
    )
    assert result.returncode == 0, result.stderr or result.stdout
    command = shlex.split(result.stdout.strip())
    assert command[:2] == ["node", "./scripts/manager-source-intake-cycle.mjs"]
    return command[1:]


def test_source_backed_manager_candidate_persists_as_authoritative_supervisor_projection(
    tmp_path, monkeypatch
) -> None:
    db_path = tmp_path / "manager-source-intake.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    port = _free_loopback_port()
    source_digest_before = hashlib.sha256(SOURCE_PATH.read_bytes()).hexdigest()
    raw_bmad_marker = "RAW_BMAD_STORY_BODY_MUST_NOT_BE_RETAINED_7f9c"
    dashboard_process = None
    server = None
    thread = None
    dashboard_log = (tmp_path / "dashboard.log").open("w+", encoding="utf8")
    original_bmad_hierarchy = _write_default_bmad_hierarchy()

    server, thread = _start_supervisor(port)

    try:
        cycle_args = _default_manager_intake_command(
            f"http://127.0.0.1:{port}", tmp_path / "default-manager-intake.mjs"
        )
        assert "--source-story-key" in cycle_args
        assert "--source-bundle-ref" in cycle_args
        dry_run = _run_node([*cycle_args[:-1], "--dry-run"])
        assert dry_run["summary"]["sourceIntakePlan"]["fetchPerformed"] is False  # type: ignore[index]
        assert dry_run["summary"]["continuousSelection"]["status"] == "ready"  # type: ignore[index]
        assert _table_count(db_path, "authoritative_work_packets") == 0

        integrated = _run_node(cycle_args)
        assert integrated["summary"]["sourceIntakePlan"]["fetchPerformed"] is True  # type: ignore[index]
        assert integrated["summary"]["continuousSelection"] == dry_run["summary"]["continuousSelection"]  # type: ignore[index]
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
            "refId": f"story:_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md",
            "sourceType": "bmad_story",
            "pathOrUrl": f"_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md",
            "title": "gate 4 real dashboard process proof",
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

        work_packet_list = _json_get(f"http://127.0.0.1:{port}/work-packets")["data"]
        listed_work_packet = next(
            packet for packet in work_packet_list if packet["packetId"] == packet_id  # type: ignore[union-attr]
        )
        detail_work_packet = _json_get(
            f"http://127.0.0.1:{port}/work-packets/{packet_id}"
        )["data"]
        assert detail_work_packet == listed_work_packet
        assert detail_work_packet["packetId"] == packet_id  # type: ignore[index]
        assert detail_work_packet["currentStage"] == "capture"  # type: ignore[index]
        assert detail_work_packet["currentOwner"] == "kendall"  # type: ignore[index]
        assert detail_work_packet["status"] == "waiting"  # type: ignore[index]
        assert detail_work_packet["riskLevel"] == "medium"  # type: ignore[index]
        assert detail_work_packet["candidateWork"] is None  # type: ignore[index]
        assert detail_work_packet["workItem"] is None  # type: ignore[index]
        assert detail_work_packet["lifecycleState"]["authoritativeRef"] == f"authoritative_work_packet:{packet_id}"  # type: ignore[index]
        assert detail_work_packet["lifecycleState"]["metadataOnly"] is True  # type: ignore[index]
        assert detail_work_packet["sourceRefs"] == [  # type: ignore[index]
            {
                "refId": f"story:_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md",
                "sourceType": "bmad_artifact",
                "label": "gate 4 real dashboard process proof",
                "pathOrUrl": f"_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md",
                "freshness": "unknown",
                "accessState": "allowed",
                "canonical": True,
                "summaryOnly": True,
                "blockedReason": None,
            }
        ]
        authoritative_evidence_refs = [entry["refId"] for entry in detail_work_packet["evidenceRefs"]]  # type: ignore[index]
        assert authoritative_evidence_refs

        dashboard_port = _free_loopback_port()
        dashboard_process = _start_dashboard(
            f"http://127.0.0.1:{port}",
            dashboard_port,
            dashboard_log,
        )
        dashboard_base_url = f"http://127.0.0.1:{dashboard_port}"
        pipeline_html = _text_get(f"{dashboard_base_url}/pipeline")
        assert "gate 4 real dashboard process proof" in pipeline_html
        assert "Supervisor packets" in pipeline_html
        assert quote(packet_id, safe="") in pipeline_html

        detail_html = _text_get(
            f"{dashboard_base_url}/pipeline/packets/{quote(packet_id, safe='')}"
        )
        assert "gate 4 real dashboard process proof" in detail_html
        assert "capture" in pipeline_html and "waiting" in pipeline_html
        assert "capture" in detail_html and "waiting" in detail_html
        assert f"story:_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md" in detail_html
        assert f"story:_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md" in pipeline_html
        assert packet_id in detail_html
        for evidence_ref in authoritative_evidence_refs:
            assert evidence_ref in pipeline_html
            assert evidence_ref in detail_html
        assert "supervisor WorkPacketV0 projection" in detail_html
        assert "Fixture/non-live packet" not in detail_html

        _stop_process(dashboard_process)
        dashboard_process = None
        _stop_supervisor(server, thread)
        server = None
        thread = None

        server, thread = _start_supervisor(port)
        restarted_lifecycle = _json_get(
            f"http://127.0.0.1:{port}/pipeline-control-plane/work-packets/{packet_id}"
        )["data"]
        assert restarted_lifecycle == lifecycle
        assert len(restarted_lifecycle["history"]) == 1  # type: ignore[arg-type,index]
        assert restarted_lifecycle["history"][0]["eventType"] == "packet.created"  # type: ignore[index]

        restarted_projection = _json_get(
            f"http://127.0.0.1:{port}/pipeline-control-plane/projection"
        )["data"]
        restarted_projected = next(
            packet
            for packet in restarted_projection["workPackets"]  # type: ignore[index,union-attr]
            if packet["packetId"] == packet_id
        )
        assert restarted_projected == projected

        restarted_work_packet_list = _json_get(f"http://127.0.0.1:{port}/work-packets")["data"]
        restarted_listed_work_packet = next(
            packet
            for packet in restarted_work_packet_list  # type: ignore[union-attr]
            if packet["packetId"] == packet_id
        )
        restarted_detail_work_packet = _json_get(
            f"http://127.0.0.1:{port}/work-packets/{packet_id}"
        )["data"]
        assert restarted_detail_work_packet == detail_work_packet
        assert restarted_listed_work_packet == restarted_detail_work_packet

        dashboard_process = _start_dashboard(
            f"http://127.0.0.1:{port}",
            dashboard_port,
            dashboard_log,
        )
        restarted_pipeline_html = _text_get(f"{dashboard_base_url}/pipeline")
        restarted_detail_html = _text_get(
            f"{dashboard_base_url}/pipeline/packets/{quote(packet_id, safe='')}"
        )
        assert "Supervisor packets" in restarted_pipeline_html
        assert quote(packet_id, safe="") in restarted_pipeline_html
        for html in (restarted_pipeline_html, restarted_detail_html):
            assert "gate 4 real dashboard process proof" in html
            assert "capture" in html and "waiting" in html
            assert packet_id in html
            assert f"story:_bmad-output/implementation-artifacts/{DEFAULT_STORY_KEY}.md" in html
            assert "supervisor WorkPacketV0 projection" in html
            assert "Fixture/non-live packet" not in html
            for evidence_ref in authoritative_evidence_refs:
                assert evidence_ref in html

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
        _stop_process(dashboard_process)
        dashboard_log.close()
        _remove_default_bmad_hierarchy(original_bmad_hierarchy)
        _stop_supervisor(server, thread)


def test_worker_result_loop_continues_reconciled_manager_intake_through_supervisor_and_dashboard(
    tmp_path, monkeypatch
) -> None:
    local_proof_root = Path(tempfile.gettempdir()) / "kendall-local-proof-attestations"
    local_proof_root.mkdir(parents=True, exist_ok=True)
    db_path = local_proof_root / f"gate4-manager-worker-result-{os.getpid()}-{time.time_ns()}.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    port = _free_loopback_port()
    dashboard_port = _free_loopback_port()
    source_digest_before = hashlib.sha256(SOURCE_PATH.read_bytes()).hexdigest()
    raw_bmad_marker = "RAW_BMAD_STORY_BODY_MUST_NOT_BE_RETAINED_7f9c"
    server = None
    thread = None
    dashboard_process = None
    dashboard_log = (tmp_path / "worker-result-dashboard.log").open("w+", encoding="utf8")
    original_bmad_hierarchy = _write_default_bmad_hierarchy()

    try:
        server, thread = _start_supervisor(port)
        _enable_attested_local_proof(db_path)
        cycle_args = _default_manager_intake_command(
            f"http://127.0.0.1:{port}", tmp_path / "worker-result-manager-intake.mjs"
        )
        command = [
            "./scripts/manager-source-intake-local-proof.mjs",
            *cycle_args[1:],
            "--local-proof-idempotency-key", "gate4-manager-worker-result-1",
            "--local-proof-correlation-id", "gate4-manager-worker-result-correlation-1",
        ]
        integrated = _run_node(command)
        proof = integrated["summary"]["workerResultLocalProof"]  # type: ignore[index]
        packet_id = str(proof["packetId"])
        assert proof["status"] == "persisted"
        assert proof["attemptStatus"] == "completed"
        assert proof["metadataOnly"] is True
        assert proof["rawPayloadRetained"] is False

        lifecycle = _json_get(f"http://127.0.0.1:{port}/pipeline-control-plane/work-packets/{packet_id}")["data"]
        assert lifecycle["currentStage"] == "review"  # type: ignore[index]
        assert lifecycle["status"] == "waiting"  # type: ignore[index]
        assert lifecycle["readyToTest"]["verificationRefs"] == [f"attempt:{proof['attemptId']}"]  # type: ignore[index]
        assert f"evidence:local-proof:gate4-manager-worker-result-1" in lifecycle["readyToTest"]["evidenceRefs"]  # type: ignore[index]

        projection = _json_get(f"http://127.0.0.1:{port}/pipeline-control-plane/projection")["data"]
        projected = next(packet for packet in projection["workPackets"] if packet["packetId"] == packet_id)  # type: ignore[index,union-attr]
        assert projected["workItemId"] == proof["workItemId"]
        assert projected["executionAttempts"] == [  # type: ignore[index]
            {
                "attemptId": proof["attemptId"], "workItemId": proof["workItemId"], "leaseId": proof["leaseId"],
                "fencingToken": proof["fencingToken"], "routeDecisionId": projected["executionAttempts"][0]["routeDecisionId"],
                "workerId": projected["executionAttempts"][0]["workerId"], "lane": projected["executionAttempts"][0]["lane"],
                "status": "completed", "eventRefs": projected["executionAttempts"][0]["eventRefs"],
                "evidenceRefs": projected["executionAttempts"][0]["evidenceRefs"], "metadataOnly": True,
            }
        ]

        stale = _json_post(
            f"http://127.0.0.1:{port}/pipeline-control-plane/work-packets/{packet_id}/local-proof/lease",
            {
                "proofMode": "integrated_local", "idempotencyKey": "gate4-manager-stale-fence-1",
                "correlationId": "gate4-manager-stale-fence-correlation", "operation": "stale_heartbeat",
                "fencingToken": int(proof["fencingToken"]) - 1,
            },
            expected_status=409,
        )
        assert stale["detail"]["error"]["code"] == "invalid_local_proof_lease"  # type: ignore[index]
        duplicate = _run_node(command, expected_returncode=1)
        assert duplicate["blockers"][-1]["code"] == "manager_supervisor_local_proof_http_error"  # type: ignore[index]
        assert _table_count(db_path, "execution_attempts") == 1

        dashboard_process = _start_dashboard(f"http://127.0.0.1:{port}", dashboard_port, dashboard_log)
        dashboard_base_url = f"http://127.0.0.1:{dashboard_port}"
        for html in (_text_get(f"{dashboard_base_url}/pipeline"), _text_get(f"{dashboard_base_url}/pipeline/packets/{quote(packet_id, safe='')}")):
            assert packet_id in html
            assert "review" in html and "waiting" in html
            assert "Fixture/non-live packet" not in html

        _stop_process(dashboard_process)
        dashboard_process = None
        _stop_supervisor(server, thread)
        server = None
        thread = None
        server, thread = _start_supervisor(port)
        _enable_attested_local_proof(db_path)
        restarted = _json_get(f"http://127.0.0.1:{port}/pipeline-control-plane/projection")["data"]
        restarted_packet = next(packet for packet in restarted["workPackets"] if packet["packetId"] == packet_id)  # type: ignore[index,union-attr]
        for field in ("packetId", "currentStage", "status", "workItemId", "queueLease", "executionAttempts", "evidenceRefs"):
            assert restarted_packet[field] == projected[field]
        assert "gate4-manager-stale-fence-correlation" in restarted_packet["correlationIds"]
        dashboard_process = _start_dashboard(f"http://127.0.0.1:{port}", dashboard_port, dashboard_log)

        assert _table_count(db_path, "candidate_work") == 0
        assert _table_count(db_path, "work_items") == 1
        assert _table_count(db_path, "execution_attempts") == 1
        assert _table_count(db_path, "queue_leases") == 1
        assert _table_count(db_path, "queue_lease_actions") >= 1
        assert raw_bmad_marker.encode() not in db_path.read_bytes()
        assert hashlib.sha256(SOURCE_PATH.read_bytes()).hexdigest() == source_digest_before
    finally:
        _stop_process(dashboard_process)
        dashboard_log.close()
        _remove_default_bmad_hierarchy(original_bmad_hierarchy)
        _stop_supervisor(server, thread)
        db_path.unlink(missing_ok=True)
