import asyncio
import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _run_git(repo_root: Path, *args: str) -> None:
    subprocess.run(["git", *args], capture_output=True, text=True, check=True, cwd=repo_root)


def _create_remote_delivery_repo(tmp_path: Path, branch_name: str) -> tuple[Path, Path, Path]:
    repo_root = tmp_path / "remote-delivery-repo"
    remote_root = tmp_path / "remote-delivery-remote.git"
    shim_dir = tmp_path / "shim-bin"
    repo_root.mkdir()
    shim_dir.mkdir()

    _run_git(tmp_path, "init", "--bare", remote_root.as_posix())
    _run_git(repo_root, "init", "-b", "main")
    _run_git(repo_root, "config", "user.email", "codex@example.com")
    _run_git(repo_root, "config", "user.name", "Codex")
    (repo_root / "README.md").write_text("# remote delivery smoke test\n", encoding="utf-8")
    _run_git(repo_root, "add", "README.md")
    _run_git(repo_root, "commit", "-m", "Initial commit")
    _run_git(repo_root, "remote", "add", "origin", remote_root.as_posix())
    _run_git(repo_root, "checkout", "-b", branch_name)
    (repo_root / "README.md").write_text("# remote delivery smoke test\n\nbranch ready for push\n", encoding="utf-8")
    _run_git(repo_root, "add", "README.md")
    _run_git(repo_root, "commit", "-m", "Prepare remote delivery branch")

    gh_cmd_shim = shim_dir / "gh.cmd"
    gh_cmd_shim.write_text(
        "\n".join(
            [
                "@echo off",
                "setlocal enabledelayedexpansion",
                "set \"GH_LOG=%GH_SHIM_LOG_PATH%\"",
                "if /I \"%1\"==\"pr\" if /I \"%2\"==\"create\" (",
                "  echo https://github.com/example/repo/pull/789",
                "  if not \"!GH_LOG!\"==\"\" echo create>>\"!GH_LOG!\"",
                "  exit /b 0",
                ")",
                "if /I \"%1\"==\"auth\" if /I \"%2\"==\"status\" (",
                "  echo github.com",
                "  echo   ✓ Logged in to github.com account slawdawg (keyring)",
                "  if not \"!GH_LOG!\"==\"\" echo auth>>\"!GH_LOG!\"",
                "  exit /b 0",
                ")",
                "if /I \"%1\"==\"pr\" if /I \"%2\"==\"view\" (",
                "  echo https://github.com/example/repo/pull/789",
                "  if not \"!GH_LOG!\"==\"\" echo view>>\"!GH_LOG!\"",
                "  exit /b 0",
                ")",
                "if /I \"%1\"==\"pr\" if /I \"%2\"==\"checks\" (",
                "  echo checks passed",
                "  if not \"!GH_LOG!\"==\"\" echo checks>>\"!GH_LOG!\"",
                "  exit /b 0",
                ")",
                "if /I \"%1\"==\"pr\" if /I \"%2\"==\"merge\" (",
                "  echo merged",
                "  if not \"!GH_LOG!\"==\"\" echo merge>>\"!GH_LOG!\"",
                "  exit /b 0",
                ")",
                "echo unexpected gh command",
                "if not \"!GH_LOG!\"==\"\" echo unexpected>>\"!GH_LOG!\"",
                "exit /b 1",
            ]
        ),
        encoding="utf-8",
    )

    gh_shim = shim_dir / "gh"
    gh_shim.write_text(
        "\n".join(
            [
                "#!/usr/bin/env sh",
                'GH_LOG="${GH_SHIM_LOG_PATH:-}"',
                'if [ "$1" = "pr" ] && [ "$2" = "create" ]; then',
                "  echo https://github.com/example/repo/pull/789",
                '  [ -n "$GH_LOG" ] && echo create >> "$GH_LOG"',
                "  exit 0",
                "fi",
                'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
                "  echo github.com",
                "  echo '  Logged in to github.com account slawdawg (keyring)'",
                '  [ -n "$GH_LOG" ] && echo auth >> "$GH_LOG"',
                "  exit 0",
                "fi",
                'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then',
                "  echo https://github.com/example/repo/pull/789",
                '  [ -n "$GH_LOG" ] && echo view >> "$GH_LOG"',
                "  exit 0",
                "fi",
                'if [ "$1" = "pr" ] && [ "$2" = "checks" ]; then',
                "  echo checks passed",
                '  [ -n "$GH_LOG" ] && echo checks >> "$GH_LOG"',
                "  exit 0",
                "fi",
                'if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then',
                "  echo merged",
                '  [ -n "$GH_LOG" ] && echo merge >> "$GH_LOG"',
                "  exit 0",
                "fi",
                "echo unexpected gh command",
                '  [ -n "$GH_LOG" ] && echo unexpected >> "$GH_LOG"',
                "exit 1",
            ]
        ),
        encoding="utf-8",
    )
    gh_shim.chmod(0o755)

    if os.name == "nt":
        gh_shim = gh_cmd_shim

    return repo_root, remote_root, gh_shim


def test_work_item_progresses_to_done_and_triggers_audit(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervisor.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service
    import supervisor.application.service as service_module

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


def test_execution_recipe_catalog_is_exposed_by_supervisor(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-catalog.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/execution-recipes")
        assert response.status_code == 200

        recipes = response.json()["data"]
        recipe_by_id = {recipe["id"]: recipe for recipe in recipes}
        assert set(recipe_by_id) == {"dashboard-test-coverage", "dashboard-mobile-coverage"}
        assert recipe_by_id["dashboard-test-coverage"]["implementationCommands"] == [
            "node scripts/dashboard-test-coverage-recipe.mjs",
            "pnpm run lint:dashboard",
        ]
        assert recipe_by_id["dashboard-mobile-coverage"]["branchPrefix"] == "mobile-e2e-"
        assert "delivery-readiness" in [
            gate["id"] for gate in recipe_by_id["dashboard-mobile-coverage"]["policyGates"]
        ]
        assert recipe_by_id["dashboard-test-coverage"]["remoteAutomationPolicy"]["status"] == "blocked"


def test_execution_recipe_is_exposed_and_selected_event_is_recorded(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-view.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cover the assignment flow",
                "requestedOutcome": "Add focused browser coverage for assignment updates and keep the repo green.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "medium",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "intakeTemplateId": "operator-test-coverage",
                },
            },
        )
        assert created.status_code == 200

        item = created.json()["data"]
        assert item["executionRecipe"]["id"] == "dashboard-test-coverage"
        assert item["executionRecipe"]["policyGates"][0]["id"] == "scope"
        assert "path-scope" in [gate["id"] for gate in item["executionRecipe"]["policyGates"]]
        assert "delivery-readiness" in [gate["id"] for gate in item["executionRecipe"]["policyGates"]]
        assert "Review the generated scope before implementation begins." in item["executionRecipe"]["operatorCheckpoints"]
        assert "Confirm PR, CI, and merge readiness before final approval." in item["executionRecipe"]["operatorCheckpoints"]
        assert item["executionRecipe"]["implementationCommands"] == [
            "node scripts/dashboard-test-coverage-recipe.mjs",
            "pnpm run lint:dashboard",
        ]
        assert item["executionRecipe"]["remoteAutomationPolicy"]["status"] == "blocked"
        assert "pull request creation" in item["executionRecipe"]["remoteAutomationPolicy"]["blockedOperations"]
        assert "KNX data boundary accepts the remote destination" in item["executionRecipe"]["remoteAutomationPolicy"]["approvalRequirements"]
        assert "pnpm run test:e2e:dashboard" in item["executionRecipe"]["verificationCommands"]

        work_item_id = item["id"]
        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200
        event_types = [event["eventType"] for event in events_response.json()["data"]]
        assert "recipe.selected" in event_types


def test_mobile_execution_recipe_is_exposed_and_selected_event_is_recorded(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "mobile-recipe-view.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cover mobile intake",
                "requestedOutcome": "Add focused mobile browser coverage for the dashboard intake flow.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "medium",
                "metadata": {
                    "executionRecipeId": "dashboard-mobile-coverage",
                    "intakeTemplateId": "operator-mobile-coverage",
                },
            },
        )
        assert created.status_code == 200

        item = created.json()["data"]
        assert item["executionRecipe"]["id"] == "dashboard-mobile-coverage"
        assert item["executionRecipe"]["label"] == "Dashboard mobile coverage"
        assert item["executionRecipe"]["branchPrefix"] == "mobile-e2e-"
        assert item["executionRecipe"]["implementationCommands"] == [
            "node scripts/dashboard-mobile-coverage-recipe.mjs",
            "pnpm run lint:dashboard",
        ]
        assert item["executionRecipe"]["remoteAutomationPolicy"]["status"] == "blocked"
        assert "record explicit local-only waiver" in item["executionRecipe"]["remoteAutomationPolicy"]["allowedOperations"]
        assert "path-scope" in [gate["id"] for gate in item["executionRecipe"]["policyGates"]]
        assert "pnpm run test:e2e:dashboard" in item["executionRecipe"]["verificationCommands"]

        work_item_id = item["id"]
        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200
        selected_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.selected")
        assert selected_event["payload"]["recipeId"] == "dashboard-mobile-coverage"
        assert selected_event["payload"]["branchPrefix"] == "mobile-e2e-"


def test_recipe_branch_preparation_creates_recorded_branch(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-branch-prep.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    current_branch = {"value": "main"}
    git_commands = []
    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    def fake_git_output(args):  # type: ignore[no-untyped-def]
        if args == ["git", "branch", "--show-current"]:
            return True, current_branch["value"]
        if args == ["git", "rev-parse", "--verify", "main"]:
            return True, "base-revision"
        return True, "base-revision"

    def fake_git_success(args):  # type: ignore[no-untyped-def]
        if args == ["git", "show-ref", "--verify", "--quiet", "refs/heads/e2e-branch-prep"]:
            return False
        if args == ["git", "merge-base", "--is-ancestor", "base-revision", "HEAD"]:
            return True
        return True

    def fake_run_git_command(args):  # type: ignore[no-untyped-def]
        git_commands.append(args)
        current_branch["value"] = "e2e-branch-prep"
        return {"command": " ".join(args), "exitCode": 0, "stdout": "created", "stderr": ""}

    service._git_output = fake_git_output  # type: ignore[method-assign]
    service._git_success = fake_git_success  # type: ignore[method-assign]
    service._run_git_command = fake_run_git_command  # type: ignore[method-assign]
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Branch prep",
                "requestedOutcome": "Prepare a recipe branch before implementation starts.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "medium",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-branch-prep",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        work_item_id = created.json()["data"]["id"]
        asyncio.run(process_once_for_tests())
        asyncio.run(process_once_for_tests())

        audit_before_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")
        response = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={
                "expectedActionId": "prepare_recipe_branch",
                "note": "Prepare the supervised recipe branch.",
                "actorId": "operator-1",
                "actorLabel": "Primary operator",
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        audit_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")

        assert audit_before_response.status_code == 200
        before_action = audit_before_response.json()["data"]["nextManagedAction"]
        assert before_action["actionId"] == "prepare_recipe_branch"
        assert before_action["requiredGate"] == "branch-ownership"
        assert before_action["operatorCheckpoint"] == "branch-preparation"
        assert before_action["allowedActor"] == "operator"
        assert before_action["remoteOperation"] is False
        assert response.status_code == 200
        assert response.json()["data"]["state"] == "ready"
        assert git_commands == [["git", "switch", "-c", "e2e-branch-prep", "base-revision"]]
        branch_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.branch_prepared")
        assert branch_event["actorLabel"] == "Primary operator"
        assert branch_event["payload"]["policyGate"] == "branch-ownership"
        assert branch_event["payload"]["operatorCheckpoint"] == "branch-preparation"
        assert branch_event["payload"]["expectedBranch"] == "e2e-branch-prep"
        assert branch_event["payload"]["command"]["exitCode"] == 0
        audit_after = audit_response.json()["data"]
        gate_statuses = {gate["gateId"]: gate["status"] for gate in audit_after["gates"]}
        assert gate_statuses["branch-ownership"] == "passed"
        assert audit_after["nextManagedAction"]["actionId"] == "run_recipe_implementation"
        assert audit_after["nextManagedAction"]["allowedActor"] == "supervisor"

        run_response = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={
                "expectedActionId": "run_recipe_implementation",
                "actorId": "operator-1",
                "actorLabel": "Primary operator",
            },
        )
        run_events_response = client.get(f"/work-items/{work_item_id}/events")

        assert run_response.status_code == 200
        assert run_response.json()["data"]["state"] == "implementing"
        run_event_types = [event["eventType"] for event in run_events_response.json()["data"]]
        assert "recipe.implementation_passed" in run_event_types
        assert "recipe.implementing" in run_event_types


def test_recipe_branch_preparation_blocks_when_repo_is_dirty(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-branch-prep-dirty.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: True  # type: ignore[method-assign]
    service._git_output = lambda args: (  # type: ignore[method-assign]
        (True, "main")
        if args == ["git", "branch", "--show-current"]
        else (True, "base-revision")
    )

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Dirty branch prep",
                "requestedOutcome": "Dirty worktrees must block branch preparation.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "medium",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-dirty-branch-prep",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        work_item_id = created.json()["data"]["id"]
        asyncio.run(process_once_for_tests())
        asyncio.run(process_once_for_tests())

        response = client.post(f"/work-items/{work_item_id}/prepare-branch", json={})
        events_response = client.get(f"/work-items/{work_item_id}/events")
        audit_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")

        assert response.status_code == 200
        assert audit_response.status_code == 200
        item = response.json()["data"]
        assert item["state"] == "blocked"
        assert item["blockedReason"] == "Repository is dirty. Clean the working tree before preparing a recipe branch."
        branch_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.branch_preparation_failed")
        assert branch_event["payload"]["policyGate"] == "branch-ownership"
        assert branch_event["payload"]["reason"] == item["blockedReason"]
        next_action = audit_response.json()["data"]["nextManagedAction"]
        assert next_action["actionId"] == "resolve_blocked_gate"
        assert next_action["recovery"] == {
            "mode": "human-only",
            "label": "Clean the working tree manually",
            "detail": "Inspect the local changes and commit, stash, or remove them before allowing the supervisor to continue.",
        }


def test_managed_next_action_executes_only_current_recipe_step(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-managed-next-action.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._prepare_recipe_branch = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-managed-next-action",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBranch": "e2e-managed-next-action",
            "currentBaseRevision": "base-revision",
            "alreadyPrepared": True,
        },
    )
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-managed-next-action",
            "currentBranch": "e2e-managed-next-action",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Managed next action",
                "requestedOutcome": "Prove the supervisor executes only the current approved recipe step.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-managed-next-action",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        triaged = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={
                "expectedActionId": "supervisor_triage",
                "note": "Supervisor may validate scope.",
                "actorId": "operator:managed-action-test",
                "actorLabel": "Primary operator",
            },
        )
        stale = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={"expectedActionId": "supervisor_triage"},
        )
        prepared = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={
                "expectedActionId": "prepare_recipe_branch",
                "note": "Branch checkpoint approved.",
                "actorId": "operator:managed-action-test",
                "actorLabel": "Primary operator",
            },
        )
        implemented = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={"expectedActionId": "run_recipe_implementation"},
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        audit_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")

        assert triaged.status_code == 200
        assert triaged.json()["data"]["state"] == "ready"
        assert stale.status_code == 409
        assert "Managed action changed from supervisor_triage to prepare_recipe_branch" in stale.json()["detail"]["error"]["message"]
        assert prepared.status_code == 200
        assert prepared.json()["data"]["state"] == "ready"
        assert implemented.status_code == 200
        assert implemented.json()["data"]["state"] == "implementing"
        assert events_response.status_code == 200
        assert audit_response.status_code == 200

        events = events_response.json()["data"]
        routing_event = next(event for event in events if event["eventType"] == "routing.utility_execution_authorized")
        utility_event = next(event for event in events if event["eventType"] == "worker.utility_attempt_recorded")
        branch_event = next(event for event in events if event["eventType"] == "recipe.branch_prepared")
        implementation_event = next(event for event in events if event["eventType"] == "recipe.implementation_passed")
        audit = audit_response.json()["data"]

        assert routing_event["actorType"] == "supervisor"
        assert routing_event["actorLabel"] == "Primary operator"
        assert routing_event["payload"]["actionId"] == "supervisor_triage"
        assert routing_event["payload"]["taskKind"] == "path_scope_check"
        assert routing_event["payload"]["selectedLane"] == "utility"
        assert routing_event["payload"]["authorityMode"] == "guarded"
        assert routing_event["payload"]["routeAffectsExecution"] is True
        assert "authority.guarded_utility_allowed" in routing_event["payload"]["reasonCodes"]
        assert routing_event["payload"]["rejectedLanes"]
        assert routing_event["payload"]["escalationPath"]
        assert routing_event["payload"]["permissionSummary"].startswith("Guarded utility execution allowed")
        assert utility_event["actorType"] == "supervisor"
        assert utility_event["actorLabel"] == "Primary operator"
        assert utility_event["payload"]["workerId"] == "utility.internal"
        assert utility_event["payload"]["functionId"] == "supervisor_triage"
        assert utility_event["payload"]["stepId"] == "scope"
        assert utility_event["payload"]["taskKind"] == "path_scope_check"
        assert "tests/e2e" in utility_event["payload"]["allowedPaths"]
        assert "apps/dashboard" in utility_event["payload"]["allowedPaths"]
        assert utility_event["payload"]["timeoutSeconds"] == 30
        assert utility_event["payload"]["status"] == "succeeded"
        assert utility_event["payload"]["failureReason"] is None
        assert branch_event["actorLabel"] == "Primary operator"
        assert branch_event["payload"]["operatorCheckpoint"] == "branch-preparation"
        assert implementation_event["payload"]["operatorCheckpoint"] == "implementation-command-run"
        assert audit["nextManagedAction"]["actionId"] == "submit_for_validation"



def test_managed_next_action_records_rejected_utility_worker_attempt(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-managed-utility-rejection.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service.utility_worker.allowed_function_ids = set()

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Rejected utility worker attempt",
                "requestedOutcome": "Prove non-allowlisted utility work records structured rejection evidence.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-managed-utility-rejection",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        rejected = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={
                "expectedActionId": "supervisor_triage",
                "actorId": "operator:managed-action-test",
                "actorLabel": "Primary operator",
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        item_response = client.get(f"/work-items/{work_item_id}")

        assert rejected.status_code == 409
        assert "Guarded utility worker rejected supervisor_triage" in rejected.json()["detail"]["error"]["message"]
        assert events_response.status_code == 200
        assert item_response.status_code == 200
        assert item_response.json()["data"]["state"] == "queued"

        events = events_response.json()["data"]
        utility_event = next(event for event in events if event["eventType"] == "worker.utility_attempt_recorded")

        assert utility_event["actorType"] == "supervisor"
        assert utility_event["actorLabel"] == "Primary operator"
        assert utility_event["payload"]["workerId"] == "utility.internal"
        assert utility_event["payload"]["functionId"] == "supervisor_triage"
        assert utility_event["payload"]["stepId"] == "scope"
        assert utility_event["payload"]["taskKind"] == "path_scope_check"
        assert "tests/e2e" in utility_event["payload"]["allowedPaths"]
        assert "apps/dashboard" in utility_event["payload"]["allowedPaths"]
        assert utility_event["payload"]["timeoutSeconds"] == 30
        assert utility_event["payload"]["status"] == "rejected"
        assert utility_event["payload"]["failureReason"] == "utility.function_not_allowlisted"
def test_recipe_work_requires_operator_checkpoint_notes(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-checkpoints.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-recipe-checkpoints",
            "currentBranch": "e2e-recipe-checkpoints",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    original_git_output = service._git_output
    service._recipe_changed_paths = lambda item: ["tests/e2e/dashboard.spec.ts"]  # type: ignore[method-assign]
    service._git_output = lambda args: (  # type: ignore[method-assign]
        (True, " tests/e2e/dashboard.spec.ts | 12 ++++++++++++")
        if args[:3] == ["git", "diff", "--stat"]
        else original_git_output(args)
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._run_recipe_verification_commands = lambda recipe: [  # type: ignore[method-assign]
        {"command": "pnpm run test:e2e:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
        {"command": "pnpm run check", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe checkpoint evidence",
                "requestedOutcome": "Prove recipe work cannot skip operator checkpoint evidence.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-recipe-checkpoints",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        missing_validation_note = client.post(f"/work-items/{work_item_id}/actions", json={"action": "submit_for_validation"})
        validation_note = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Dashboard recipe checks are ready for validation."},
        )
        missing_review_note = client.post(f"/work-items/{work_item_id}/actions", json={"action": "validation_passed"})
        review_note = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed", "note": "Required recipe verification passed."},
        )
        missing_approval_note = client.post(f"/work-items/{work_item_id}/actions", json={"action": "approve_review"})
        approval_without_delivery = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Operator approves before delivery evidence."},
        )
        delivery_ready = client.post(
            f"/work-items/{work_item_id}/delivery-readiness",
            json={
                "pullRequestStatus": "recorded",
                "pullRequestUrl": "https://github.com/example/repo/pull/456",
                "ciStatus": "passed",
                "mergeStatus": "ready",
                "note": "Delivery evidence is recorded.",
            },
        )
        approval_note = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Operator approves the recipe output."},
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        audit_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")

        assert missing_validation_note.status_code == 409
        assert validation_note.status_code == 200
        assert missing_review_note.status_code == 409
        assert review_note.status_code == 200
        assert missing_approval_note.status_code == 409
        assert approval_without_delivery.status_code == 409
        assert delivery_ready.status_code == 200
        assert approval_note.status_code == 200
        assert events_response.status_code == 200
        assert audit_response.status_code == 200

        events = events_response.json()["data"]
        audit = audit_response.json()["data"]
        selected_event = next(event for event in events if event["eventType"] == "recipe.selected")
        ready_event = next(event for event in events if event["eventType"] == "recipe.ready")
        implementation_path_scope_event = next(event for event in events if event["eventType"] == "recipe.implementation_path_scope_passed")
        implementation_event = next(event for event in events if event["eventType"] == "recipe.implementation_passed")
        implementing_event = next(event for event in events if event["eventType"] == "recipe.implementing")
        path_scope_event = next(event for event in events if event["eventType"] == "recipe.path_scope_passed")
        delivery_event = next(event for event in events if event["eventType"] == "recipe.delivery_gate_recorded")
        reviewing_event = next(event for event in events if event["eventType"] == "workflow.reviewing")
        done_event = next(event for event in events if event["eventType"] == "workflow.done")

        assert selected_event["payload"]["policyGates"] == [
            "scope",
            "clean-worktree",
            "branch-ownership",
            "implementation-automation",
            "path-scope",
            "verification",
            "delivery-readiness",
            "review",
        ]
        assert ready_event["payload"]["policyGate"] == "scope"
        assert ready_event["payload"]["operatorCheckpoint"] == "scope-reviewed"
        assert implementation_path_scope_event["payload"]["policyGate"] == "path-scope"
        assert implementation_path_scope_event["payload"]["operatorCheckpoint"] == "implementation-path-scope"
        assert implementation_path_scope_event["payload"]["outOfScopePaths"] == []
        assert implementation_event["payload"]["policyGate"] == "implementation-automation"
        assert implementation_event["payload"]["operatorCheckpoint"] == "implementation-command-run"
        assert implementation_event["payload"]["commands"][0]["command"] == "node scripts/dashboard-test-coverage-recipe.mjs"
        assert implementing_event["payload"]["policyGate"] == "branch-ownership"
        assert implementing_event["payload"]["operatorCheckpoint"] == "implementation-start"
        assert implementing_event["payload"]["passedPolicyGates"] == ["clean-worktree", "branch-ownership", "implementation-automation"]
        assert implementing_event["payload"]["expectedBranch"] == "e2e-recipe-checkpoints"
        assert path_scope_event["payload"]["policyGate"] == "path-scope"
        assert path_scope_event["payload"]["operatorCheckpoint"] == "path-scope-check"
        assert path_scope_event["payload"]["changedPaths"] == ["tests/e2e/dashboard.spec.ts"]
        assert path_scope_event["payload"]["outOfScopePaths"] == []
        verification_event = next(event for event in events if event["eventType"] == "recipe.verification_passed")
        assert verification_event["payload"]["operatorCheckpoint"] == "verification-command-run"
        assert [result["command"] for result in verification_event["payload"]["commands"]] == [
            "pnpm run test:e2e:dashboard",
            "pnpm run check",
        ]
        assert delivery_event["payload"]["policyGate"] == "delivery-readiness"
        assert delivery_event["payload"]["operatorCheckpoint"] == "delivery-gate"
        assert delivery_event["payload"]["localDeliveryPackageStatus"] == "ready"
        assert delivery_event["payload"]["localDeliveryPackageKind"] == "git-diff-summary"
        assert delivery_event["payload"]["changedPaths"] == ["tests/e2e/dashboard.spec.ts"]
        assert delivery_event["payload"]["outOfScopePaths"] == []
        assert delivery_event["payload"]["diffStatAvailable"] is True
        assert "tests/e2e/dashboard.spec.ts" in delivery_event["payload"]["diffStat"]
        assert delivery_event["payload"]["readyForApproval"] is False
        assert delivery_event["payload"]["pullRequestStatus"] == "not_recorded"
        assert delivery_event["payload"]["ciStatus"] == "not_recorded"
        assert delivery_event["payload"]["mergeStatus"] == "not_recorded"
        assert delivery_event["payload"]["remoteOperationsPerformed"] is False
        assert reviewing_event["payload"]["policyGate"] == "verification"
        assert reviewing_event["payload"]["operatorCheckpoint"] == "review-entry"
        assert done_event["payload"]["policyGate"] == "review"
        assert done_event["payload"]["operatorCheckpoint"] == "operator-review"
        assert audit["recipeId"] == "dashboard-test-coverage"
        assert audit["status"] == "passed"
        assert audit["passedCount"] == 8
        assert audit["blockedCount"] == 0
        assert audit["nextManagedAction"]["actionId"] == "complete"
        assert audit["nextManagedAction"]["status"] == "complete"
        assert audit["nextManagedAction"]["remoteOperation"] is False
        gate_status = {entry["gateId"]: entry["status"] for entry in audit["gates"]}
        assert gate_status == {
            "scope": "passed",
            "clean-worktree": "passed",
            "branch-ownership": "passed",
            "implementation-automation": "passed",
            "path-scope": "passed",
            "verification": "passed",
            "delivery-readiness": "passed",
            "review": "passed",
        }


def test_recipe_review_can_record_remote_delivery_evidence_before_approval(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-delivery-ready.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-delivery-ready",
            "currentBranch": "e2e-delivery-ready",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service._recipe_changed_paths = lambda item: ["tests/e2e/dashboard.spec.ts"]  # type: ignore[method-assign]
    service._git_output = lambda args: (True, " tests/e2e/dashboard.spec.ts | 12 ++++++++++++")  # type: ignore[method-assign]
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._run_recipe_verification_commands = lambda recipe: [  # type: ignore[method-assign]
        {"command": "pnpm run test:e2e:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
        {"command": "pnpm run check", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe delivery evidence",
                "requestedOutcome": "Prove delivery evidence can unlock recipe review approval.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-delivery-ready",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Recipe checks are ready."},
        ).status_code == 200
        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed", "note": "Verification evidence is recorded."},
        ).status_code == 200
        audit_before_delivery = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")
        blocked_approval = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Operator approves before delivery evidence."},
        )
        delivery_ready = client.post(
            f"/work-items/{work_item_id}/delivery-readiness",
            json={
                "pullRequestStatus": "recorded",
                "pullRequestUrl": "https://github.com/example/repo/pull/123",
                "ciStatus": "passed",
                "mergeStatus": "ready",
                "note": "PR, CI, and merge readiness are recorded.",
            },
        )
        approved = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Operator approves after delivery evidence."},
        )
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")
        audit_after_delivery = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")

        assert audit_before_delivery.status_code == 200
        assert blocked_approval.status_code == 409
        assert delivery_ready.status_code == 200
        assert approved.status_code == 200
        assert item_response.status_code == 200
        assert events_response.status_code == 200
        assert audit_after_delivery.status_code == 200

        item = item_response.json()["data"]
        delivery = item["deliveryReadiness"]
        update_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.delivery_readiness_updated")
        before_action = audit_before_delivery.json()["data"]["nextManagedAction"]
        after_action = audit_after_delivery.json()["data"]["nextManagedAction"]

        assert item["state"] == "done"
        assert before_action["actionId"] == "record_delivery_readiness"
        assert before_action["status"] == "available"
        assert before_action["requiredGate"] == "delivery-readiness"
        assert before_action["allowedActor"] == "operator"
        assert before_action["remoteOperation"] is False
        assert after_action["actionId"] == "complete"
        assert delivery["readyForApproval"] is True
        assert delivery["pullRequestStatus"] == "recorded"
        assert delivery["ciStatus"] == "passed"
        assert delivery["mergeStatus"] == "ready"
        assert delivery["remoteOperationsPerformed"] is False
        assert update_event["payload"]["pullRequestUrl"] == "https://github.com/example/repo/pull/123"


def test_recipe_review_can_execute_remote_delivery_when_enabled(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-remote-delivery-enabled.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_REMOTE_DELIVERY", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service
    import supervisor.application.service as service_module

    repo_root, remote_root, gh_shim = _create_remote_delivery_repo(tmp_path, "e2e-remote-delivery-enabled")
    gh_log_path = tmp_path / "gh-shim.log"
    monkeypatch.setenv("GH_SHIM_LOG_PATH", gh_log_path.as_posix())

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._repo_root = lambda: repo_root.as_posix()  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-remote-delivery-enabled",
            "currentBranch": "e2e-remote-delivery-enabled",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service._recipe_changed_paths = lambda item: ["tests/e2e/dashboard.spec.ts"]  # type: ignore[method-assign]
    service._git_output = lambda args: (True, " tests/e2e/dashboard.spec.ts | 12 ++++++++++++")  # type: ignore[method-assign]
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._run_recipe_verification_commands = lambda recipe: [  # type: ignore[method-assign]
        {"command": "pnpm run test:e2e:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
        {"command": "pnpm run check", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    original_which = service_module.shutil.which

    def fake_which(executable):  # type: ignore[no-untyped-def]
        if executable == "gh":
            return gh_shim.as_posix()
        return original_which(executable)

    monkeypatch.setattr(service_module.shutil, "which", fake_which)

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Remote delivery enabled",
                "requestedOutcome": "Prove the supervisor can execute remote delivery when policy allows it.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-remote-delivery-enabled",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Recipe checks are ready."},
        ).status_code == 200
        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed", "note": "Verification evidence is recorded."},
        ).status_code == 200

        audit_before_remote = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")
        remote_action = audit_before_remote.json()["data"]["nextManagedAction"]
        assert remote_action["actionId"] == "execute_remote_delivery"
        assert remote_action["status"] == "available"
        assert remote_action["remoteOperation"] is True
        assert remote_action["allowedActor"] == "supervisor"

        executed = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={
                "expectedActionId": "execute_remote_delivery",
                "note": "Execute the approved remote delivery.",
                "actorId": "supervisor-1",
                "actorLabel": "Supervisor",
            },
        )
        audit_after_remote = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")
        approved = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Operator approves after remote delivery."},
        )
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert executed.status_code == 200
        assert approved.status_code == 200
        assert item_response.status_code == 200
        assert audit_after_remote.status_code == 200
        assert events_response.status_code == 200

        item = item_response.json()["data"]
        delivery = item["deliveryReadiness"]
        event_types = [event["eventType"] for event in events_response.json()["data"]]
        after_action = audit_after_remote.json()["data"]["nextManagedAction"]

        assert item["state"] == "done"
        assert (
            subprocess.run(
                ["git", "--git-dir", remote_root.as_posix(), "rev-parse", "--verify", "refs/heads/e2e-remote-delivery-enabled"],
                capture_output=True,
                text=True,
                check=False,
            ).returncode
            == 0
        )
        gh_log_entries = gh_log_path.read_text(encoding="utf-8").splitlines()
        assert "auth" in gh_log_entries

        remote_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.remote_delivery_executed")
        remote_commands = remote_event["payload"]["commands"]
        assert [command["command"] for command in remote_commands[:4]] == [
            "git push -u origin e2e-remote-delivery-enabled",
            "gh pr create --base main --head e2e-remote-delivery-enabled --title Remote delivery enabled --body Prove the supervisor can execute remote delivery when policy allows it.",
            "gh pr checks --watch --fail-fast",
            "gh pr merge --squash --delete-branch",
        ]
        assert delivery["remoteOperationsPerformed"] is True
        assert delivery["pullRequestStatus"] == "recorded"
        assert delivery["ciStatus"] == "passed"
        assert delivery["mergeStatus"] == "merged"
        assert delivery["readyForApproval"] is True
        assert "recipe.remote_delivery_executed" in event_types
        assert after_action["actionId"] == "approve_review"
        assert after_action["remoteOperation"] is False


def test_recipe_review_blocks_remote_delivery_until_live_target_is_ready(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-remote-delivery-preflight.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_REMOTE_DELIVERY", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-remote-delivery-preflight",
            "currentBranch": "e2e-remote-delivery-preflight",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service._recipe_changed_paths = lambda item: ["tests/e2e/dashboard.spec.ts"]  # type: ignore[method-assign]
    service._git_output = lambda args: (True, " tests/e2e/dashboard.spec.ts | 12 ++++++++++++")  # type: ignore[method-assign]
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._run_recipe_verification_commands = lambda recipe: [  # type: ignore[method-assign]
        {"command": "pnpm run test:e2e:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
        {"command": "pnpm run check", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    def fake_run_remote_command(args, timeout=600):  # type: ignore[no-untyped-def]
        if args == ["git", "remote", "get-url", "origin"]:
            return {"command": "git remote get-url origin", "exitCode": 0, "stdout": "https://github.com/example/repo.git", "stderr": ""}
        if args == ["gh", "auth", "status"]:
            return {"command": "gh auth status", "exitCode": 1, "stdout": "", "stderr": "not logged in"}
        raise AssertionError(f"unexpected remote command: {args}")

    service._run_remote_command = fake_run_remote_command  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Remote delivery preflight",
                "requestedOutcome": "Prove the supervisor blocks remote delivery until the live target is ready.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-remote-delivery-preflight",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Recipe checks are ready."},
        ).status_code == 200
        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed", "note": "Verification evidence is recorded."},
        ).status_code == 200

        audit_before_remote = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")
        remote_action = audit_before_remote.json()["data"]["nextManagedAction"]

        assert remote_action["actionId"] == "execute_remote_delivery"
        assert remote_action["status"] == "blocked"
        assert remote_action["remoteOperation"] is True
        assert "GitHub CLI authentication is not available" in remote_action["reason"]
        assert remote_action["recovery"] == {
            "mode": "operator-checkpoint",
            "label": "Restore live target readiness",
            "detail": "Resolve the remote-delivery preflight issue, then refresh the policy ledger before retrying remote delivery.",
        }


def test_recipe_gate_audit_reports_recovery_metadata_for_branch_block(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-branch-recovery.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        "Current branch does not match the recorded recipe execution branch.",
        {
            "expectedBranch": "e2e-branch-recovery",
            "currentBranch": "feature/manual-branch",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe branch recovery",
                "requestedOutcome": "Prove branch-policy blocks expose recovery metadata.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-branch-recovery",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        audit_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")
        blocked_action = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={"expectedActionId": "resolve_blocked_gate", "note": "Try to resolve automatically."},
        )

        assert audit_response.status_code == 200
        assert blocked_action.status_code == 409

        next_action = audit_response.json()["data"]["nextManagedAction"]
        assert next_action["actionId"] == "resolve_blocked_gate"
        assert next_action["status"] == "blocked"
        assert next_action["requiredGate"] == "branch-ownership"
        assert next_action["recovery"] == {
            "mode": "operator-checkpoint",
            "label": "Review branch ownership",
            "detail": "Confirm the recorded execution branch, prepare the branch again if safe, or hand the work item back for manual branch repair.",
        }


def test_recipe_gate_audit_reports_human_only_recovery_for_path_scope_block(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-path-scope-recovery.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-path-scope-recovery",
            "currentBranch": "e2e-path-scope-recovery",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
    ]
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        "Changes escaped the allowed recipe paths: temp/unplanned-change.md",
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["temp/unplanned-change.md"],
            "outOfScopePaths": ["temp/unplanned-change.md"],
        },
    )

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe path scope recovery",
                "requestedOutcome": "Prove path-scope blocks expose human-only recovery metadata.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-path-scope-recovery",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        audit_response = client.get(f"/work-items/{work_item_id}/recipe-gate-audit")

        assert audit_response.status_code == 200

        next_action = audit_response.json()["data"]["nextManagedAction"]
        assert next_action["actionId"] == "resolve_blocked_gate"
        assert next_action["status"] == "blocked"
        assert next_action["requiredGate"] == "path-scope"
        assert next_action["recovery"] == {
            "mode": "human-only",
            "label": "Repair out-of-scope changes manually",
            "detail": "Review and remove or intentionally re-scope the out-of-bound changes before the supervisor can continue.",
        }


def test_recipe_review_blocks_when_local_delivery_package_has_out_of_scope_paths(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-delivery-out-of-scope.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-delivery-out-of-scope",
            "currentBranch": "e2e-delivery-out-of-scope",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": [],
        },
    )
    service._recipe_changed_paths = lambda item: ["temp/unplanned-change.md", "tests/e2e/dashboard.spec.ts"]  # type: ignore[method-assign]
    service._git_output = lambda args: (True, " temp/unplanned-change.md | 1 +\n tests/e2e/dashboard.spec.ts | 12 ++++++++++++")  # type: ignore[method-assign]
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._run_recipe_verification_commands = lambda recipe: [  # type: ignore[method-assign]
        {"command": "pnpm run test:e2e:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
        {"command": "pnpm run check", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe delivery out of scope",
                "requestedOutcome": "Prove local delivery packages cannot approve review when files leave recipe scope.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-delivery-out-of-scope",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Recipe checks are ready."},
        ).status_code == 200
        assert client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "validation_passed", "note": "Verification evidence is recorded."},
        ).status_code == 200
        blocked_approval = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "approve_review", "note": "Operator approves after local package review."},
        )
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert blocked_approval.status_code == 409
        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        delivery = item["deliveryReadiness"]
        delivery_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.delivery_gate_recorded")

        assert item["state"] == "reviewing"
        assert delivery["readyForApproval"] is False
        assert delivery_event["payload"]["readyForApproval"] is False
        assert delivery_event["payload"]["outOfScopePaths"] == ["temp/unplanned-change.md"]


def test_invalid_high_risk_dashboard_recipe_blocks_during_triage(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-policy.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "High-risk browser coverage recipe",
                "requestedOutcome": "Attempt to use the constrained dashboard recipe outside its allowed risk posture.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "high",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(2):
            asyncio.run(process_once_for_tests())

        item_response = client.get(f"/work-items/{work_item_id}")
        assert item_response.status_code == 200
        item = item_response.json()["data"]
        assert item["state"] == "blocked"
        assert item["blockedReason"] == "Dashboard test coverage recipe only supports low or medium risk work."


def test_recipe_implementation_command_failure_routes_to_rework_before_start(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-implementation-failure.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-implementation-failure",
            "currentBranch": "e2e-implementation-failure",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "pnpm run lint:dashboard", "exitCode": 1, "stdout": "", "stderr": "lint failed"},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe implementation command failure",
                "requestedOutcome": "Prove failed recipe implementation automation cannot start implementation.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-implementation-failure",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        events = events_response.json()["data"]
        implementation_event = next(event for event in events if event["eventType"] == "recipe.implementation_failed")

        assert item["state"] == "needs_rework"
        assert item["lane"] == "corrective_loop"
        assert implementation_event["payload"]["policyGate"] == "implementation-automation"
        assert implementation_event["payload"]["operatorCheckpoint"] == "implementation-command-run"
        assert implementation_event["payload"]["commands"][0]["exitCode"] == 1
        assert "recipe.implementing" not in [event["eventType"] for event in events]


def test_recipe_implementation_path_scope_failure_blocks_before_start(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-implementation-path-scope.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-implementation-path-scope",
            "currentBranch": "e2e-implementation-path-scope",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "node scripts/dashboard-test-coverage-recipe.mjs", "exitCode": 0, "stdout": "updated", "stderr": ""},
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        "Recipe changed files are outside allowedPaths.",
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["docs/unplanned-change.md", "tests/e2e/dashboard.spec.ts"],
            "outOfScopePaths": ["docs/unplanned-change.md"],
        },
    )

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe implementation path scope failure",
                "requestedOutcome": "Prove implementation automation cannot start managed work after writing outside scope.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-implementation-path-scope",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        events = events_response.json()["data"]
        path_event = next(event for event in events if event["eventType"] == "recipe.implementation_path_scope_failed")

        assert item["state"] == "needs_rework"
        assert item["lane"] == "corrective_loop"
        assert path_event["payload"]["policyGate"] == "path-scope"
        assert path_event["payload"]["operatorCheckpoint"] == "implementation-path-scope"
        assert path_event["payload"]["outOfScopePaths"] == ["docs/unplanned-change.md"]
        assert "recipe.implementation_passed" not in [event["eventType"] for event in events]
        assert "recipe.implementing" not in [event["eventType"] for event in events]


def test_recipe_path_scope_failure_routes_to_rework_before_verification(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-path-scope.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-path-scope",
            "currentBranch": "e2e-path-scope",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    path_scope_calls = 0

    def fake_path_scope_policy(item, recipe):  # noqa: ANN001
        nonlocal path_scope_calls
        path_scope_calls += 1
        if path_scope_calls == 1:
            return (
                None,
                {
                    "allowedPaths": ["tests/e2e", "apps/dashboard"],
                    "changedPaths": ["tests/e2e/dashboard.spec.ts"],
                    "outOfScopePaths": [],
                },
            )
        return (
            "Recipe changed files are outside allowedPaths.",
            {
                "allowedPaths": ["tests/e2e", "apps/dashboard"],
                "changedPaths": ["docs/unplanned-change.md", "tests/e2e/dashboard.spec.ts"],
                "outOfScopePaths": ["docs/unplanned-change.md"],
            },
        )

    service._recipe_path_scope_policy = fake_path_scope_policy  # type: ignore[method-assign]
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    def fail_if_verification_runs(recipe):  # noqa: ANN001
        raise AssertionError("verification commands must not run after path scope failure")

    service._run_recipe_verification_commands = fail_if_verification_runs  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe path scope failure",
                "requestedOutcome": "Prove recipe changes cannot escape the allowed path boundary.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-path-scope",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        submitted = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Run recipe handoff checks."},
        )
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert submitted.status_code == 200
        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        events = events_response.json()["data"]
        path_event = next(event for event in events if event["eventType"] == "recipe.path_scope_failed")

        assert item["state"] == "needs_rework"
        assert item["lane"] == "corrective_loop"
        assert path_event["payload"]["policyGate"] == "path-scope"
        assert path_event["payload"]["operatorCheckpoint"] == "path-scope-check"
        assert path_event["payload"]["outOfScopePaths"] == ["docs/unplanned-change.md"]
        assert "recipe.verification_passed" not in [event["eventType"] for event in events]
        assert "recipe.verification_failed" not in [event["eventType"] for event in events]
        assert "workflow.validating" not in [event["eventType"] for event in events]


def test_recipe_verification_command_failure_routes_to_rework(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-command-failure.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
    service._recipe_branch_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "expectedBranch": "e2e-command-failure",
            "currentBranch": "e2e-command-failure",
            "baseBranch": "main",
            "baseRevision": "base-revision",
            "currentBaseRevision": "base-revision",
        },
    )
    service._recipe_path_scope_policy = lambda item, recipe: (  # type: ignore[method-assign]
        None,
        {
            "allowedPaths": ["tests/e2e", "apps/dashboard"],
            "changedPaths": ["apps/dashboard/src/app/page.tsx"],
            "outOfScopePaths": [],
        },
    )
    service._run_recipe_implementation_commands = lambda recipe, item: [  # type: ignore[method-assign]
        {"command": "pnpm run lint:dashboard", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]
    service._run_recipe_verification_commands = lambda recipe: [  # type: ignore[method-assign]
        {"command": "pnpm run test:e2e:dashboard", "exitCode": 1, "stdout": "", "stderr": "failed"},
        {"command": "pnpm run check", "exitCode": 0, "stdout": "ok", "stderr": ""},
    ]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Recipe command failure",
                "requestedOutcome": "Prove failed recipe commands cannot enter validation.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-command-failure",
                    "baseBranch": "main",
                    "baseRevision": "base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        submitted = client.post(
            f"/work-items/{work_item_id}/actions",
            json={"action": "submit_for_validation", "note": "Run recipe verification."},
        )
        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert submitted.status_code == 200
        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        events = events_response.json()["data"]
        failure_event = next(event for event in events if event["eventType"] == "recipe.verification_failed")

        assert item["state"] == "needs_rework"
        assert item["lane"] == "corrective_loop"
        assert failure_event["payload"]["operatorCheckpoint"] == "verification-command-run"
        assert failure_event["payload"]["commands"][0]["exitCode"] == 1
        assert "workflow.validating" not in [event["eventType"] for event in events]


def test_unknown_execution_recipe_blocks_during_triage(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "unknown-recipe.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Unsupported recipe",
                "requestedOutcome": "Prove unmanaged recipe requests cannot silently continue.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "does-not-exist",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(2):
            asyncio.run(process_once_for_tests())

        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        event_types = [event["eventType"] for event in events_response.json()["data"]]
        assert item["state"] == "blocked"
        assert item["blockedReason"] == "Unknown execution recipe requested: does-not-exist."
        assert "recipe.blocked" in event_types


def test_recipe_work_blocks_when_recorded_base_revision_is_stale(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "recipe-stale-branch.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, process_once_for_tests, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        if args == ["git", "branch", "--show-current"]:
            return True, "e2e-stale-branch"
        if args == ["git", "rev-parse", "--verify", "main"]:
            return True, "new-base-revision"
        return False, "unexpected git command"

    service._git_output = fake_git_output  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Stale recipe branch",
                "requestedOutcome": "Prove stale recipe branches stop before implementation.",
                "source": "operator-dashboard:improvement",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "e2e-stale-branch",
                    "baseBranch": "main",
                    "baseRevision": "old-base-revision",
                },
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        for _ in range(3):
            asyncio.run(process_once_for_tests())

        item_response = client.get(f"/work-items/{work_item_id}")
        events_response = client.get(f"/work-items/{work_item_id}/events")

        assert item_response.status_code == 200
        assert events_response.status_code == 200
        item = item_response.json()["data"]
        branch_event = next(event for event in events_response.json()["data"] if event["eventType"] == "recipe.branch_blocked")
        assert item["state"] == "blocked"
        assert item["blockedReason"] == "Recipe branch is stale: main moved since baseRevision was recorded."
        assert branch_event["payload"]["expectedBranch"] == "e2e-stale-branch"
        assert branch_event["payload"]["currentBranch"] == "e2e-stale-branch"
        assert branch_event["payload"]["baseRevision"] == "old-base-revision"
        assert branch_event["payload"]["currentBaseRevision"] == "new-base-revision"


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
