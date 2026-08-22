import asyncio
import copy
import json
import socket
import sys
import threading
import time
import urllib.request
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError

import uvicorn
from httpx2 import ASGITransport, AsyncClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


@contextmanager
def _running_supervisor(tmp_path: Path, monkeypatch):
    db_path = tmp_path / "lane-clarity-handoffs.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.api import main

    port = _free_loopback_port()
    server = uvicorn.Server(
        uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="error", access_log=False, lifespan="on")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert server.started, "loopback supervisor failed to start within 10 seconds"
    try:
        yield main, f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive(), "loopback supervisor failed to stop within 10 seconds"


def _request(base_url: str, path: str, *, method: str, payload: dict[str, object] | None = None):
    data = json.dumps(payload).encode("utf8") if payload is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"accept": "application/json", **({"content-type": "application/json"} if data else {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed loopback URL
            text = response.read().decode("utf8")
            return response.status, json.loads(text), text
    except HTTPError as exc:
        text = exc.read().decode("utf8")
        return exc.code, json.loads(text), text


def _payload(*, sequence: int = 1, observed_at: datetime | None = None) -> dict[str, object]:
    observed_at = observed_at or datetime.now(UTC)
    suffix = f"{sequence:040x}"
    return {
        "schemaVersion": "manager-lane-clarity-handoff/v0",
        "handoffId": f"manager-lane-clarity-handoff:{suffix}",
        "selectedLaneId": "lane:current",
        "runId": "run:current",
        "eventWatermark": "event:current",
        "sourceCursor": "cursor:1",
        "sourceSequence": sequence,
        "observedAt": observed_at.isoformat().replace("+00:00", "Z"),
        "laneClarity": {
            "schemaVersion": "manager-lane-clarity/v0",
            "runId": "run:current",
            "eventWatermark": "event:current",
            "sourceCursor": "cursor:1",
            "goal": {"summary": "Keep the transport bounded.", "sourceRef": "requirement:handoff"},
            "criteria": [{"criterionId": "criterion:binding", "summary": "Binding stays coherent.", "disposition": "met", "evidenceRefs": ["evidence:binding"]}],
            "canonicalState": {"phase": "running", "freshness": "fresh", "evidenceFreshness": "fresh"},
            "nextGate": {"summary": "Verify receipt.", "nextSafeAction": "verify_handoff"},
            "posture": {"state": "on_scope", "reason": "Current metadata is coherent.", "nextSafeAction": "continue", "decisionRef": None, "qualification": None},
            "metadataOnly": True,
            "rawPayloadRetained": False,
        },
        "idempotencyKey": f"handoff:lane:current:{sequence}",
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def test_loopback_handoff_replays_exactly_and_rejects_conflicts(tmp_path, monkeypatch) -> None:
    with _running_supervisor(tmp_path, monkeypatch) as (_, base_url):
        payload = _payload()
        status, posted, text = _request(base_url, "/manager-control-plane/lane-clarity-handoffs", method="POST", payload=payload)
        assert status == 200, text
        assert posted["data"]["owner"] == "supervisor"
        assert {key: posted["data"][key] for key in payload} == payload

        replay_status, replayed, replay_text = _request(base_url, "/manager-control-plane/lane-clarity-handoffs", method="POST", payload=payload)
        assert replay_status == 200, replay_text
        assert replayed["data"]["createdAt"] == posted["data"]["createdAt"]

        read_status, readback, read_text = _request(base_url, f"/manager-control-plane/lane-clarity-handoffs/{payload['handoffId']}", method="GET")
        assert read_status == 200, read_text
        assert readback == replayed

        conflict = copy.deepcopy(payload)
        conflict["eventWatermark"] = "event:conflict"
        conflict["laneClarity"]["eventWatermark"] = "event:conflict"
        conflict_status, _, _ = _request(base_url, "/manager-control-plane/lane-clarity-handoffs", method="POST", payload=conflict)
        assert conflict_status == 409

        stale_sequence = _payload(sequence=1)
        stale_sequence["idempotencyKey"] = "handoff:lane:current:conflicting-sequence"
        stale_sequence["handoffId"] = f"manager-lane-clarity-handoff:{'b' * 40}"
        stale_status, _, _ = _request(base_url, "/manager-control-plane/lane-clarity-handoffs", method="POST", payload=stale_sequence)
        assert stale_status == 409


def test_projection_exposes_only_fresh_coherent_handoff(tmp_path, monkeypatch) -> None:
    with _running_supervisor(tmp_path, monkeypatch) as (_, base_url):
        stale = _payload(observed_at=datetime.now(UTC) - timedelta(days=1))
        status, _, text = _request(base_url, "/manager-control-plane/lane-clarity-handoffs", method="POST", payload=stale)
        assert status == 200, text
        projection_status, projection, projection_text = _request(base_url, "/pipeline-control-plane/projection", method="GET")
        assert projection_status == 200, projection_text
        assert projection["data"]["activeManagerLaneClarity"] is None

        fresh = _payload(sequence=2)
        status, _, text = _request(base_url, "/manager-control-plane/lane-clarity-handoffs", method="POST", payload=fresh)
        assert status == 200, text
        projection_status, projection, projection_text = _request(base_url, "/pipeline-control-plane/projection", method="GET")
        assert projection_status == 200, projection_text
        assert projection["data"]["activeManagerLaneClarity"] == fresh["laneClarity"]

        canonical_status, canonical, canonical_text = _request(base_url, "/pipeline-control-plane/canonical-operational-projection", method="GET")
        assert canonical_status == 200, canonical_text
        canonical_clarity = canonical["data"]["activeManagerLaneClarity"]
        assert canonical_clarity == {
            "goal": fresh["laneClarity"]["goal"],
            "criteria": fresh["laneClarity"]["criteria"],
            "canonicalState": fresh["laneClarity"]["canonicalState"],
            "nextGate": fresh["laneClarity"]["nextGate"],
            "posture": fresh["laneClarity"]["posture"],
        }
        assert "schemaVersion" not in canonical_clarity
        assert "runId" not in canonical_clarity
        assert "rawPayloadRetained" not in canonical_clarity


def test_handoff_rejects_non_loopback_transport(tmp_path, monkeypatch) -> None:
    with _running_supervisor(tmp_path, monkeypatch) as (main, _):
        async def remote_post():
            transport = ASGITransport(app=main.app, client=("192.0.2.10", 50001))
            async with AsyncClient(transport=transport, base_url="http://supervisor.test", timeout=10) as client:
                return await client.post("/manager-control-plane/lane-clarity-handoffs", json=_payload())

        response = asyncio.run(remote_post())
        assert response.status_code == 403
        assert "loopback" in response.text
