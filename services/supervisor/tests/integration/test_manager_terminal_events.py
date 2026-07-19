import asyncio
import copy
import json
import socket
import sqlite3
import sys
import threading
import time
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import AsyncMock
from urllib.error import HTTPError

import uvicorn
from httpx2 import ASGITransport, AsyncClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


@dataclass(frozen=True)
class _Response:
    status_code: int
    payload: dict[str, object]
    text: str

    def json(self) -> dict[str, object]:
        return self.payload


def _free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


@contextmanager
def _running_supervisor(
    tmp_path: Path, monkeypatch, db_name: str = "manager-terminal-events.db"
):
    db_path = tmp_path / db_name
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    from supervisor.api import main

    port = _free_loopback_port()
    server = uvicorn.Server(
        uvicorn.Config(
            main.app,
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
    assert server.started, "loopback supervisor failed to start within 10 seconds"
    try:
        yield main, f"http://127.0.0.1:{port}", db_path
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive(), "loopback supervisor failed to stop within 10 seconds"


def _request(
    base_url: str,
    path: str,
    *,
    method: str,
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> _Response:
    data = json.dumps(payload).encode("utf8") if payload is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={
            "accept": "application/json",
            **({"content-type": "application/json"} if payload is not None else {}),
            **(headers or {}),
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed loopback URL
            text = response.read().decode("utf8")
            return _Response(response.status, json.loads(text), text)
    except HTTPError as exc:
        text = exc.read().decode("utf8")
        return _Response(exc.code, json.loads(text), text)


def _post(base_url: str, path: str, payload: dict[str, object]) -> _Response:
    return _request(base_url, path, method="POST", payload=payload)


def _get(base_url: str, path: str) -> _Response:
    return _request(base_url, path, method="GET")


def _remote_asgi_request(app, path: str, *, method: str, headers: dict[str, str]):
    async def request():
        transport = ASGITransport(app=app, client=("192.0.2.10", 50001))
        async with AsyncClient(
            transport=transport, base_url="http://supervisor.test", timeout=10
        ) as client:
            return await client.request(method, path, headers=headers, json=_payload())

    return asyncio.run(request())


def _payload() -> dict[str, object]:
    return {
        "eventId": f"manager-terminal-event:{'a' * 40}",
        "eventType": "authoritative_backlog_exhausted",
        "runId": "manager-run-17",
        "sourceIdentity": "source-bundle:accepted-product-backlog",
        "sourceRevision": "git:abc1234",
        "reconciliationCounts": {
            "totalItems": 3,
            "reconciledItems": 3,
            "eligible": 0,
            "queued": 0,
            "leased": 0,
            "running": 0,
            "reviewFix": 0,
            "requiredRetrospective": 0,
            "otherwiseRequired": 0,
            "completed": 1,
            "closed": 1,
            "approvalGated": 1,
        },
        "unresolvedApprovalGatedWork": [
            {
                "workId": "approval-work-1",
                "title": "Operator-selected planning bundle",
                "reason": "Explicit product acceptance is still required",
                "sourceRefs": ["source:planning-bundle-1"],
                "evidenceRefs": ["evidence:approval-gate-1"],
            }
        ],
        "evidenceRefs": ["evidence:reconciliation-17", "source:revision-abc1234"],
        "resumeRequirement": "Start a new run bound to newly accepted source-owned backlog.",
        "nextManagerAction": "Wait for newly accepted source-owned backlog.",
        "idempotencyKey": "authoritative-backlog-exhausted:run-17",
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def _table_count(db_path: Path, table_name: str) -> int:
    with sqlite3.connect(db_path) as connection:
        return int(connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])


def test_terminal_event_persists_exact_metadata_without_work_creation_or_dispatch(
    tmp_path, monkeypatch
) -> None:
    with _running_supervisor(tmp_path, monkeypatch) as (main, base_url, db_path):
        main.service.create_work_item = AsyncMock(side_effect=AssertionError("work creation is forbidden"))
        main.service.process_once = AsyncMock(side_effect=AssertionError("dispatch is forbidden"))
        response = _post(base_url, "/manager-control-plane/terminal-events", _payload())

        assert response.status_code == 200, response.text
        event = response.json()["data"]
        expected = _payload()
        assert {key: event[key] for key in expected} == expected
        assert event["createdAt"]
        assert _table_count(db_path, "manager_terminal_events") == 1
        assert _table_count(db_path, "work_items") == 0
        assert _table_count(db_path, "workflow_events") == 0
        assert _table_count(db_path, "queue_leases") == 0
        main.service.create_work_item.assert_not_awaited()
        main.service.process_once.assert_not_awaited()


def test_terminal_event_is_idempotent_and_rejects_conflicting_reuse(tmp_path, monkeypatch) -> None:
    payload = _payload()
    with _running_supervisor(tmp_path, monkeypatch) as (_, base_url, db_path):
        first = _post(base_url, "/manager-control-plane/terminal-events", payload)
        replay = _post(base_url, "/manager-control-plane/terminal-events", payload)

        conflicting_key = copy.deepcopy(payload)
        conflicting_key["eventId"] = f"manager-terminal-event:{'b' * 40}"
        conflicting_key["sourceRevision"] = "git:def5678"
        key_conflict = _post(
            base_url, "/manager-control-plane/terminal-events", conflicting_key
        )

        conflicting_event = copy.deepcopy(payload)
        conflicting_event["idempotencyKey"] = "authoritative-backlog-exhausted:run-18"
        event_conflict = _post(
            base_url, "/manager-control-plane/terminal-events", conflicting_event
        )

        assert first.status_code == 200, first.text
        assert replay.status_code == 200, replay.text
        assert replay.json() == first.json()
        assert key_conflict.status_code == 409
        assert "idempotency key" in key_conflict.text
        assert event_conflict.status_code == 409
        assert "eventId" in event_conflict.text
        assert _table_count(db_path, "manager_terminal_events") == 1


def test_terminal_event_exact_readback_returns_current_bounded_metadata(
    tmp_path, monkeypatch
) -> None:
    payload = _payload()
    with _running_supervisor(tmp_path, monkeypatch) as (_, base_url, db_path):
        posted = _post(base_url, "/manager-control-plane/terminal-events", payload)
        readback = _get(
            base_url, f"/manager-control-plane/terminal-events/{payload['eventId']}"
        )

        assert posted.status_code == 200, posted.text
        assert readback.status_code == 200, readback.text
        event = readback.json()["data"]
        assert set(event) == {*payload, "createdAt"}
        assert {key: event[key] for key in payload} == payload
        assert event["createdAt"] == posted.json()["data"]["createdAt"]
        assert "rawPayload" not in event
        assert _table_count(db_path, "manager_terminal_events") == 1


def test_terminal_event_exact_readback_is_404_and_loopback_authorized(
    tmp_path, monkeypatch
) -> None:
    missing_event_id = f"manager-terminal-event:{'f' * 40}"
    with _running_supervisor(tmp_path, monkeypatch) as (main, base_url, db_path):
        missing = _get(
            base_url, f"/manager-control-plane/terminal-events/{missing_event_id}"
        )
        rejected = _remote_asgi_request(
            main.app,
            f"/manager-control-plane/terminal-events/{missing_event_id}",
            method="GET",
            headers={"x-forwarded-for": "127.0.0.1"},
        )

        assert missing.status_code == 404
        assert "not found" in missing.text.lower()
        assert rejected.status_code == 403
        assert "loopback" in rejected.text
        assert _table_count(db_path, "manager_terminal_events") == 0


def test_terminal_event_rejects_non_exact_unsafe_or_non_exhausted_metadata(
    tmp_path, monkeypatch
) -> None:
    invalid_payloads: list[dict[str, object]] = []

    extra_field = _payload()
    extra_field["rawPayload"] = {"provider": "forbidden"}
    invalid_payloads.append(extra_field)

    missing_count = _payload()
    del missing_count["reconciliationCounts"]["otherwiseRequired"]  # type: ignore[index]
    invalid_payloads.append(missing_count)

    wrong_event = _payload()
    wrong_event["eventType"] = "no_safe_work"
    invalid_payloads.append(wrong_event)

    noncanonical_event_id = _payload()
    noncanonical_event_id["eventId"] = f"manager-terminal-event-{'a' * 40}"
    invalid_payloads.append(noncanonical_event_id)

    uppercase_event_id = _payload()
    uppercase_event_id["eventId"] = f"manager-terminal-event:{'A' * 40}"
    invalid_payloads.append(uppercase_event_id)

    non_metadata = _payload()
    non_metadata["metadataOnly"] = False
    invalid_payloads.append(non_metadata)

    retained_payload = _payload()
    retained_payload["rawPayloadRetained"] = True
    invalid_payloads.append(retained_payload)

    executable_work = _payload()
    executable_work["reconciliationCounts"]["queued"] = 1  # type: ignore[index]
    executable_work["reconciliationCounts"]["closed"] = 0  # type: ignore[index]
    invalid_payloads.append(executable_work)

    mismatched_gate = _payload()
    mismatched_gate["reconciliationCounts"]["approvalGated"] = 0  # type: ignore[index]
    mismatched_gate["reconciliationCounts"]["closed"] = 2  # type: ignore[index]
    invalid_payloads.append(mismatched_gate)

    unsafe_identity = _payload()
    unsafe_identity["sourceIdentity"] = "api_token=sk-proj-forbidden123456789"
    invalid_payloads.append(unsafe_identity)

    unsafe_evidence = _payload()
    unsafe_evidence["evidenceRefs"] = ["raw-provider-payload:request-1"]
    invalid_payloads.append(unsafe_evidence)

    executable_action = _payload()
    executable_action["nextManagerAction"] = "bash -c refill-the-backlog"
    invalid_payloads.append(executable_action)

    padded_identity = _payload()
    padded_identity["sourceIdentity"] = " source:accepted-product-backlog "
    invalid_payloads.append(padded_identity)

    padded_evidence = _payload()
    padded_evidence["evidenceRefs"] = [" evidence:reconciliation-17"]
    invalid_payloads.append(padded_evidence)

    with _running_supervisor(tmp_path, monkeypatch) as (_, base_url, db_path):
        for payload in invalid_payloads:
            response = _post(base_url, "/manager-control-plane/terminal-events", payload)
            assert response.status_code == 422, response.text
        assert _table_count(db_path, "manager_terminal_events") == 0


def test_terminal_event_requires_direct_loopback_and_rejects_forwarded_spoofing(
    tmp_path, monkeypatch
) -> None:
    with _running_supervisor(tmp_path, monkeypatch) as (main, _, db_path):
        for header_name, header_value in (
            ("x-forwarded-for", "127.0.0.1"),
            ("forwarded", "for=127.0.0.1"),
        ):
            rejected = _remote_asgi_request(
                main.app,
                "/manager-control-plane/terminal-events",
                method="POST",
                headers={header_name: header_value},
            )
            assert rejected.status_code == 403
            assert "loopback" in rejected.text
        assert _table_count(db_path, "manager_terminal_events") == 0
