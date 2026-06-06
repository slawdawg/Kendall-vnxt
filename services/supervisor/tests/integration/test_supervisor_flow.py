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

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        in_progress_response = client.get(f"/work-items/{work_item_id}")
        assert in_progress_response.status_code == 200
        assert in_progress_response.json()["data"]["state"] == "implementing"

        validate = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation"},
        )
        review = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed"},
        )
        complete = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Ready to enter risk review."},
        )
        audit_complete = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "complete_audit_review", "note": "Audit completed with no additional concerns."},
        )

        item_response = client.get(f"/work-items/{work_item_id}")
        audits_response = client.get("/audit-events")
        status_response = client.get("/supervisor/status")

        assert validate.status_code == 200
        assert review.status_code == 200
        assert complete.status_code == 200
        assert audit_complete.status_code == 200
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


def test_validation_failure_routes_work_to_rework(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "rework.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Validation catches a regression",
                "requestedOutcome": "Ensure the workflow can route back into rework.",
                "source": "pytest",
                "riskLevel": "medium",
            },
        )
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        validate = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation"},
        )
        rework = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_failed", "note": "Validation found a regression in the last attempt."},
        )
        item_response = client.get(f"/work-items/{work_item_id}")

        assert validate.status_code == 200
        assert rework.status_code == 200
        assert item_response.status_code == 200
        assert item_response.json()["data"]["state"] == "needs_rework"
        assert item_response.json()["data"]["lane"] == "corrective_loop"


def test_retry_endpoint_returns_work_to_ready_and_records_retry_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "retry-endpoint.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Retry endpoint loopback",
                "requestedOutcome": "Move a blocked item back into the ready queue and retain history.",
                "source": "pytest",
                "riskLevel": "medium",
            },
        )
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation"},
        )
        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_failed", "note": "Need another pass before release."},
        )
        blocked = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "restart_implementation", "note": "Restart blocked by local repo state."},
        )
        retried = client.post(f"/work-items/{work_item_id}/retry")
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert blocked.status_code == 200
        assert retried.status_code == 200
        assert item_response.status_code == 200
        assert events_response.status_code == 200
        assert item_response.json()["data"]["state"] == "ready"

        event_types = [event["eventType"] for event in events_response.json()["data"]]
        assert "work_item.retry_requested" in event_types


def test_work_item_events_endpoint_returns_timeline(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "events.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Timeline visibility",
                "requestedOutcome": "Expose workflow events to the dashboard detail view.",
                "source": "pytest",
                "riskLevel": "high",
            },
        )
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation"},
        )
        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed"},
        )
        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Handing off to audit gate."},
        )
        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "complete_audit_review", "note": "Audit finalized."},
        )

        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert events_response.status_code == 200

        events = events_response.json()["data"]
        event_types = [event["eventType"] for event in events]
        validating_event = next(event for event in events if event["eventType"] == "workflow.validating")
        reviewing_event = next(event for event in events if event["eventType"] == "workflow.reviewing")

        assert "work_item.queued" in event_types
        assert "work_item.implementing" in event_types
        assert "workflow.validating" in event_types
        assert "workflow.reviewing" in event_types
        assert "audit.requested" in event_types
        assert "workflow.done" in event_types
        assert validating_event["payload"]["lane"] == "validation"
        assert reviewing_event["payload"]["lane"] == "review"


def test_operator_action_note_is_recorded_in_event_history(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "notes.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Record operator rationale",
                "requestedOutcome": "Persist note-bearing action history for later review.",
                "source": "pytest",
                "riskLevel": "medium",
            },
        )
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        client.post(
            f"/work-items/{work_item_id}/actions",
            json={
                "action": "submit_for_validation",
                "note": "Smoke checks passed locally before validation handoff.",
                "actorId": "integration-test",
                "actorLabel": "Integration Tester",
            },
        )

        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200

        validating_event = next(
            event for event in events_response.json()["data"] if event["eventType"] == "workflow.validating"
        )

        assert validating_event["actorType"] == "operator"
        assert validating_event["actorId"] == "integration-test"
        assert validating_event["actorLabel"] == "Integration Tester"
        assert validating_event["payload"]["note"] == "Smoke checks passed locally before validation handoff."


def test_audit_gate_and_note_policy_are_enforced(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "audit-policy.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Enforce audit gate",
                "requestedOutcome": "High-risk work should pause for audit before completion.",
                "source": "pytest",
                "riskLevel": "high",
            },
        )
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation"},
        )
        client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed"},
        )

        missing_note = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review"},
        )
        enter_audit = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Ready for audit checkpoint."},
        )
        after_audit_gate = client.get(f"/work-items/{work_item_id}")
        premature_done = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "complete_audit_review"},
        )
        done = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "complete_audit_review", "note": "Audit completed and accepted."},
        )
        finished = client.get(f"/work-items/{work_item_id}")

        assert missing_note.status_code == 409
        assert enter_audit.status_code == 200
        assert after_audit_gate.json()["data"]["state"] == "awaiting_audit"
        assert premature_done.status_code == 409
        assert done.status_code == 200
        assert finished.json()["data"]["state"] == "done"


def test_operator_views_are_persisted_and_scoped(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "operator-views.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        queue_view = client.post(
            "/operator-views",
            json={
                "name": "High risk queue",
                "scope": "queue",
                "filters": {"query": "", "risk": "high", "audit": "required", "source": "all", "origin": "all", "issues": "all"},
            },
        )
        audit_view = client.post(
            "/operator-views",
            json={
                "name": "Audit backlog",
                "scope": "audit",
                "filters": {"query": "smoke", "risk": "all", "audit": "required", "source": "all", "origin": "all", "issues": "all"},
            },
        )

        assert queue_view.status_code == 200
        assert audit_view.status_code == 200

        queue_view_id = queue_view.json()["data"]["id"]
        set_default = client.post(f"/operator-views/{queue_view_id}/default", json={"isDefault": True})
        queue_only = client.get("/operator-views?scope=queue")
        audit_only = client.get("/operator-views?scope=audit")
        delete_queue = client.delete(f"/operator-views/{queue_view_id}")
        queue_after_delete = client.get("/operator-views?scope=queue")

        assert set_default.status_code == 200
        assert queue_only.status_code == 200
        assert audit_only.status_code == 200
        assert delete_queue.status_code == 200
        assert queue_after_delete.status_code == 200

        assert queue_only.json()["data"][0]["isDefault"] is True
        assert queue_only.json()["data"][0]["scope"] == "queue"
        assert audit_only.json()["data"][0]["scope"] == "audit"
        assert audit_only.json()["data"][0]["filters"]["query"] == "smoke"
        assert audit_only.json()["data"][0]["filters"]["origin"] == "all"
        assert queue_after_delete.json()["data"] == []


def test_supervisor_generated_self_detected_issue_is_exposed_in_work_item_view(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "self-detected.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Repository drift detected",
                "requestedOutcome": "Surface a real self-detected issue in the operator dashboard.",
                "source": "supervisor-monitor",
                "riskLevel": "medium",
                "metadata": {
                    "generatedBy": "supervisor",
                    "selfDetectedIssue": True,
                    "issueCategory": "workspace-health",
                },
            },
        )
        assert created.status_code == 200

        work_item_id = created.json()["data"]["id"]
        item_response = client.get(f"/work-items/{work_item_id}")
        assert item_response.status_code == 200

        item = item_response.json()["data"]
        assert item["origin"] == "supervisor"
        assert item["selfDetectedIssue"] is True
        assert item["selfDetectedIssueCategory"] == "workspace-health"


def test_work_item_creation_records_operator_identity_from_metadata(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "submitted-by.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Manual submission identity",
                "requestedOutcome": "Keep submitter attribution on the queued event.",
                "source": "pytest",
                "riskLevel": "medium",
                "metadata": {
                    "submittedByActorId": "ops-jane",
                    "submittedByActorLabel": "Jane Operator",
                },
            },
        )
        assert created.status_code == 200

        work_item_id = created.json()["data"]["id"]
        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200

        queued_event = next(
            event for event in events_response.json()["data"] if event["eventType"] == "work_item.queued"
        )

        assert queued_event["actorType"] == "operator"
        assert queued_event["actorId"] == "ops-jane"
        assert queued_event["actorLabel"] == "Jane Operator"


def test_work_item_assignment_is_persisted_and_recorded(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "assignment.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Assignment smoke test",
                "requestedOutcome": "Persist ownership and expose it in event history.",
                "source": "pytest",
                "riskLevel": "low",
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        assigned = client.post(
            f"/work-items/{work_item_id}/assignment",
            json={
                "assigneeId": "ops-jane",
                "assigneeLabel": "Jane Operator",
                "actorId": "ops-jane",
                "actorLabel": "Jane Operator",
            },
        )
        released = client.post(
            f"/work-items/{work_item_id}/assignment",
            json={
                "assigneeId": None,
                "assigneeLabel": None,
                "actorId": "ops-jane",
                "actorLabel": "Jane Operator",
            },
        )
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert assigned.status_code == 200
        assert released.status_code == 200
        assert item_response.status_code == 200
        assert events_response.status_code == 200
        assert item_response.json()["data"]["assigneeId"] is None

        events = events_response.json()["data"]
        assigned_event = next(event for event in events if event["eventType"] == "work_item.assigned")
        released_event = next(event for event in events if event["eventType"] == "work_item.unassigned")

        assert assigned_event["actorLabel"] == "Jane Operator"
        assert assigned_event["payload"]["assigneeLabel"] == "Jane Operator"
        assert released_event["payload"]["assigneeId"] is None


def test_work_item_escalation_is_persisted_and_can_be_cleared(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "escalation.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Escalation smoke test",
                "requestedOutcome": "Persist and clear operator escalation state.",
                "source": "pytest",
                "riskLevel": "low",
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        escalated = client.post(
            f"/work-items/{work_item_id}/escalation",
            json={
                "reason": "Waiting on product input before continuing.",
                "actorId": "ops-jane",
                "actorLabel": "Jane Operator",
            },
        )
        escalated_item = client.get(f"/work-items/{work_item_id}")
        cleared = client.post(
            f"/work-items/{work_item_id}/escalation",
            json={
                "clear": True,
                "actorId": "ops-jane",
                "actorLabel": "Jane Operator",
            },
        )
        cleared_item = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert escalated.status_code == 200
        assert escalated_item.status_code == 200
        assert cleared.status_code == 200
        assert cleared_item.status_code == 200
        assert events_response.status_code == 200

        escalated_data = escalated_item.json()["data"]
        cleared_data = cleared_item.json()["data"]
        events = events_response.json()["data"]

        escalated_event = next(event for event in events if event["eventType"] == "work_item.escalated")
        cleared_event = next(event for event in events if event["eventType"] == "work_item.escalation_cleared")

        assert escalated_data["escalatedByLabel"] == "Jane Operator"
        assert escalated_data["escalationReason"] == "Waiting on product input before continuing."
        assert escalated_data["needsAttention"] is True
        assert "Waiting on product input" in escalated_data["attentionReason"]

        assert cleared_data["escalatedAt"] is None
        assert cleared_data["escalationReason"] is None
        assert cleared_data["escalatedByLabel"] is None

        assert escalated_event["actorLabel"] == "Jane Operator"
        assert escalated_event["payload"]["escalationReason"] == "Waiting on product input before continuing."
        assert cleared_event["actorLabel"] == "Jane Operator"
