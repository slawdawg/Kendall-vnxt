import copy
import sqlite3
import sys
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _app(tmp_path: Path, monkeypatch, db_name: str = "manager-terminal-events.db"):
    db_path = tmp_path / db_name
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    from supervisor.api.main import app

    return app, db_path


def _payload() -> dict[str, object]:
    return {
        "eventId": "manager-event-run-17",
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
    app, db_path = _app(tmp_path, monkeypatch)

    from supervisor.api import main

    main.service.create_work_item = AsyncMock(side_effect=AssertionError("work creation is forbidden"))
    main.service.process_once = AsyncMock(side_effect=AssertionError("dispatch is forbidden"))

    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        response = client.post("/manager-control-plane/terminal-events", json=_payload())

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
    app, db_path = _app(tmp_path, monkeypatch)
    payload = _payload()

    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        first = client.post("/manager-control-plane/terminal-events", json=payload)
        replay = client.post("/manager-control-plane/terminal-events", json=payload)

        conflicting_key = copy.deepcopy(payload)
        conflicting_key["eventId"] = "manager-event-run-18"
        conflicting_key["sourceRevision"] = "git:def5678"
        key_conflict = client.post(
            "/manager-control-plane/terminal-events", json=conflicting_key
        )

        conflicting_event = copy.deepcopy(payload)
        conflicting_event["idempotencyKey"] = "authoritative-backlog-exhausted:run-18"
        event_conflict = client.post(
            "/manager-control-plane/terminal-events", json=conflicting_event
        )

    assert first.status_code == 200, first.text
    assert replay.status_code == 200, replay.text
    assert replay.json() == first.json()
    assert key_conflict.status_code == 409
    assert "idempotency key" in key_conflict.text
    assert event_conflict.status_code == 409
    assert "eventId" in event_conflict.text
    assert _table_count(db_path, "manager_terminal_events") == 1


def test_terminal_event_rejects_non_exact_unsafe_or_non_exhausted_metadata(
    tmp_path, monkeypatch
) -> None:
    app, db_path = _app(tmp_path, monkeypatch)
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

    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        for payload in invalid_payloads:
            response = client.post("/manager-control-plane/terminal-events", json=payload)
            assert response.status_code == 422, response.text

    assert _table_count(db_path, "manager_terminal_events") == 0


def test_terminal_event_requires_direct_loopback_and_rejects_forwarded_spoofing(
    tmp_path, monkeypatch
) -> None:
    app, db_path = _app(tmp_path, monkeypatch)

    with TestClient(app, client=("192.0.2.10", 50001)) as client:
        x_forwarded = client.post(
            "/manager-control-plane/terminal-events",
            json=_payload(),
            headers={"x-forwarded-for": "127.0.0.1"},
        )
        forwarded = client.post(
            "/manager-control-plane/terminal-events",
            json=_payload(),
            headers={"forwarded": "for=127.0.0.1"},
        )

    assert x_forwarded.status_code == 403
    assert "loopback" in x_forwarded.text
    assert forwarded.status_code == 403
    assert "loopback" in forwarded.text
    assert _table_count(db_path, "manager_terminal_events") == 0
