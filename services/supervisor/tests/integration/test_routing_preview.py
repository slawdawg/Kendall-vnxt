import asyncio
import json
import os
import sqlite3
import socket
import sys
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest


STORY_8_5_APPROVAL_TIMESTAMP = datetime.fromisoformat("2026-06-12T16:20:33.2776334-05:00").astimezone(timezone.utc)
STORY_8_5_APPROVAL_EXPIRY = datetime.fromisoformat("2026-06-12T16:50:33.2776334-05:00").astimezone(timezone.utc)
STORY_8_5_APPROVAL_VALID_NOW = datetime.fromisoformat("2026-06-12T16:30:00-05:00").astimezone(timezone.utc)


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path, monkeypatch, db_name: str) -> TestClient:
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    from supervisor.api.main import app

    return TestClient(app)


def _freeze_subscription_launch_now(monkeypatch, value: datetime = STORY_8_5_APPROVAL_VALID_NOW) -> None:
    from supervisor.application.service import SupervisorService

    monkeypatch.setattr(SupervisorService, "_subscription_launch_now", lambda self: value)


def _delivery_approval_entry(
    *,
    approval_id: str,
    work_item_id: str,
    action_id: str,
    plan: dict,
    pull_request_url: str,
    ci_status: str = "passed",
    review_state: str = "approved",
    merge_status: str | None = None,
    artifact_refs: list[str] | None = None,
    approved_by: str = "Operator",
    approved_at: str = "2000-01-01T00:00:00+00:00",
    expires_at: str | None = "2099-01-01T00:00:00+00:00",
    rollback_plan: list[str] | None = None,
    stop_lines: list[str] | None = None,
) -> dict:
    return {
        "approvalId": approval_id,
        "authorityFamily": "github_delivery",
        "policyId": "low-risk-delivery-policy-v1",
        "actionId": action_id,
        "workItemId": work_item_id,
        "targetBranch": plan["currentBranch"],
        "baseBranch": plan["baseBranch"],
        "headRevision": plan["headRevision"],
        "pullRequestUrl": pull_request_url,
        "pullRequestHeadRevision": plan["headRevision"],
        "ciStatus": ci_status,
        "reviewState": review_state,
        "mergeStatus": merge_status,
        "retainedEvidence": artifact_refs or [],
        "approvedBy": approved_by,
        "approvedAt": approved_at,
        "expiresAt": expires_at,
        "reviewPoint": None,
        "rollbackPlan": rollback_plan
        if rollback_plan is not None
        else ["preserve retained delivery evidence and inspect before retry"],
        "stopLines": stop_lines
        if stop_lines is not None
        else ["no provider expansion", "no issue sync", "no failed-check bypass", "no broad autonomy"],
    }


def _write_delivery_approval_ledger(db_path: str, work_item_id: str, entries: list[dict]) -> None:
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("select metadata_json from work_items where id = ?", (work_item_id,)).fetchone()
        metadata = json.loads(row[0]) if row and isinstance(row[0], str) and row[0] else {}
        metadata["deliveryApprovalLedger"] = entries
        conn.execute("update work_items set metadata_json = ? where id = ?", (json.dumps(metadata), work_item_id))
        conn.commit()


def _append_delivery_execution_metadata(db_path: str, work_item_id: str, entry: dict) -> None:
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("select metadata_json from work_items where id = ?", (work_item_id,)).fetchone()
        metadata = json.loads(row[0]) if row and isinstance(row[0], str) and row[0] else {}
        entries = [item for item in metadata.get("deliveryExecutionEvidence", []) if isinstance(item, dict)]
        entries.append(entry)
        metadata["deliveryExecutionEvidence"] = entries
        conn.execute("update work_items set metadata_json = ? where id = ?", (json.dumps(metadata), work_item_id))
        conn.commit()


def test_routing_preview_selects_utility_for_deterministic_checks() -> None:
    from supervisor.domain.routing import RoutingPreviewService, RoutingProfile, TaskKind

    profile = RoutingProfile(
        work_item_id="work-item-1",
        step_id="path-scope",
        task_kind=TaskKind.PATH_SCOPE_CHECK,
    )

    first = RoutingPreviewService().preview(profile)
    second = RoutingPreviewService().preview(profile)

    assert first == second
    assert first.selected_lane == "utility"
    assert first.authority_mode == "record_only"
    assert first.confidence_band == "high"
    assert "task.deterministic_check" in first.reason_codes
    assert "permissions.no_language_synthesis_required" in first.reason_codes
    assert any(rejected.lane == "local_sandbox_execute" and "policy.disabled_for_mvp" in rejected.rejection_codes for rejected in first.rejected_lanes)


def test_routing_preview_can_authorize_guarded_utility_without_changing_default_preview() -> None:
    from supervisor.domain.routing import RoutingPreviewService, RoutingProfile, TaskKind

    profile = RoutingProfile(
        work_item_id="work-item-guarded-utility",
        step_id="path-scope",
        task_kind=TaskKind.PATH_SCOPE_CHECK,
    )

    service = RoutingPreviewService()
    default_decision = service.preview(profile)
    guarded_decision = service.preview(profile, allow_guarded_utility=True)

    assert default_decision.selected_lane == "utility"
    assert default_decision.authority_mode == "record_only"
    assert "authority.guarded_utility_allowed" not in default_decision.reason_codes
    assert guarded_decision.selected_lane == "utility"
    assert guarded_decision.authority_mode == "guarded"
    assert "authority.guarded_utility_allowed" in guarded_decision.reason_codes
    assert guarded_decision.permission_summary.startswith("Guarded utility execution allowed")
def test_routing_preview_selects_local_readonly_for_evidence_summary() -> None:
    from supervisor.domain.routing import RoutingPreviewService, RoutingProfile, TaskKind

    decision = RoutingPreviewService().preview(
        RoutingProfile(
            work_item_id="work-item-2",
            step_id="evidence-summary",
            task_kind=TaskKind.EVIDENCE_SUMMARY,
        )
    )

    assert decision.selected_lane == "local_readonly"
    assert decision.authority_mode == "advisory"
    assert "privacy.local_preferred" in decision.reason_codes
    assert "permissions.read_only_required" in decision.reason_codes


def test_routing_preview_selects_subscription_handoff_for_bounded_implementation() -> None:
    from supervisor.domain.routing import RoutingPreviewService, RoutingProfile, TaskKind

    decision = RoutingPreviewService().preview(
        RoutingProfile(
            work_item_id="work-item-3",
            step_id="implementation",
            task_kind=TaskKind.BOUNDED_RECIPE_IMPLEMENTATION,
        )
    )

    assert decision.selected_lane == "subscription_handoff"
    assert decision.authority_mode == "advisory"
    assert "quality.subscription_handoff_preferred" in decision.reason_codes
    assert any(rejected.lane == "premium_approval" and "policy.disabled_for_mvp" in rejected.rejection_codes for rejected in decision.rejected_lanes)


def test_routing_preview_explicitly_handles_additional_prd_task_kinds() -> None:
    from supervisor.domain.routing import RoutingPreviewService, RoutingProfile, TaskKind

    service = RoutingPreviewService()
    routing_preview = service.preview(
        RoutingProfile(
            work_item_id="work-item-routing-preview",
            step_id="routing-preview",
            task_kind=TaskKind.ROUTING_PREVIEW,
        )
    )
    architecture = service.preview(
        RoutingProfile(
            work_item_id="work-item-architecture",
            step_id="architecture",
            task_kind=TaskKind.ARCHITECTURE_REVIEW,
        )
    )
    security = service.preview(
        RoutingProfile(
            work_item_id="work-item-security",
            step_id="security",
            task_kind=TaskKind.SECURITY_REVIEW,
        )
    )
    handoff = service.preview(
        RoutingProfile(
            work_item_id="work-item-handoff",
            step_id="handoff-package",
            task_kind=TaskKind.SUBSCRIPTION_HANDOFF_PACKAGE,
        )
    )

    assert routing_preview.selected_lane == "local_readonly"
    assert routing_preview.authority_mode == "advisory"
    assert routing_preview.reason_codes == ("task.routing_preview", "permissions.read_only_required")
    assert architecture.selected_lane == "subscription_handoff"
    assert architecture.reason_codes == ("task.architecture_review", "quality.subscription_handoff_preferred")
    assert security.selected_lane == "subscription_handoff"
    assert security.reason_codes == ("task.security_review", "quality.subscription_handoff_preferred")
    assert handoff.selected_lane == "subscription_handoff"
    assert handoff.reason_codes == ("task.subscription_handoff_package", "permissions.execution_not_granted")


def test_supervisor_routing_preview_derives_from_next_managed_action_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Route managed recipe",
                "requestedOutcome": "Preview the safest lane for a managed recipe step.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        preview_response = client.get(f"/work-items/{work_item_id}/routing-preview")

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert preview_response.status_code == 200
    preview = preview_response.json()["data"]
    assert preview["profile"]["taskKind"] == "path_scope_check"
    assert preview["decision"]["selectedLane"] == "utility"
    assert preview["decision"]["authorityMode"] == "record_only"
    assert preview["decision"]["createdAt"] == before_item["updatedAt"]
    assert "task.deterministic_check" in preview["decision"]["reasonCodes"]
    assert before_item == after_item
    assert before_events == after_events


def test_task_packet_preview_uses_promoted_candidate_metadata_without_execution(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "task-packet-preview.db") as client:
        candidate_response = client.post(
            "/candidate-work",
            json={
                "title": "Task packet candidate",
                "requestedOutcome": "Preview how promoted work would be routed.",
                "source": "bmad",
                "sourceArtifactPath": "docs/workflows/implementation-evidence-boundary.md",
                "sourceArtifactType": "bmad_story",
                "riskLevel": "medium",
                "priority": "high",
            },
        )
        assert candidate_response.status_code == 200
        candidate_id = candidate_response.json()["data"]["id"]
        approve_response = client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"})
        assert approve_response.status_code == 200
        promote_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promote_response.status_code == 200
        work_item_id = promote_response.json()["data"]["workItem"]["id"]

        preview_response = client.get(f"/work-items/{work_item_id}/task-packet-preview")
        assert preview_response.status_code == 200
        preview = preview_response.json()["data"]

        packet = preview["packet"]
        assert packet["workItemId"] == work_item_id
        assert packet["title"] == "Task packet candidate"
        assert packet["requestedOutcome"] == "Preview how promoted work would be routed."
        assert packet["source"] == f"candidate_work:{candidate_id}"
        assert packet["sourceArtifactPath"] == "docs/workflows/implementation-evidence-boundary.md"
        assert packet["taskKind"] == "task_classification"
        assert packet["riskLevel"] == "medium"
        assert packet["priority"] == "high"
        assert packet["approvalMode"] == preview["route"]["authorityMode"]
        assert packet["verificationSummary"] == "No verification summary recorded yet."
        assert preview["route"]["selectedLane"] == "local_readonly"
        assert preview["route"]["rejectedLanes"]
        assert preview["whyThisPath"] == preview["route"]["humanExplanation"]
        assert preview["previewOnly"] is True
        assert preview["executionAttemptCreated"] is False
        assert preview["providerCallsAllowed"] is False
        assert preview["commandExecutionAllowed"] is False

        attempts_response = client.get(f"/work-items/{work_item_id}/execution-attempts")
        assert attempts_response.status_code == 200
        assert attempts_response.json()["data"] == []


def test_task_packet_preview_falls_back_for_missing_source_metadata(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "task-packet-preview-fallback.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Manual work item",
                "requestedOutcome": "Preview route without candidate metadata.",
                "source": "operator-dashboard",
                "riskLevel": "low",
            },
        )
        assert work_item_response.status_code == 200
        work_item_id = work_item_response.json()["data"]["id"]

        preview_response = client.get(f"/work-items/{work_item_id}/task-packet-preview")
        assert preview_response.status_code == 200
        packet = preview_response.json()["data"]["packet"]
        assert packet["sourceArtifactPath"] == "not_recorded"
        assert packet["priority"] == "normal"
        assert packet["taskKind"] == "task_classification"


def test_execution_attempt_records_task_packet_artifact_without_execution(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "task-packet-attempt.db") as client:
        candidate_response = client.post(
            "/candidate-work",
            json={
                "title": "Packet linked attempt",
                "requestedOutcome": "Record packet evidence on a blocked attempt.",
                "source": "bmad",
                "sourceArtifactPath": "docs/workflows/implementation-evidence-boundary.md",
                "sourceArtifactType": "bmad_story",
                "riskLevel": "medium",
                "priority": "high",
            },
        )
        assert candidate_response.status_code == 200
        candidate_id = candidate_response.json()["data"]["id"]
        assert client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"}).status_code == 200
        promote_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promote_response.status_code == 200
        work_item_id = promote_response.json()["data"]["workItem"]["id"]

        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={"taskKind": "evidence_summary"})
        assert attempt_response.status_code == 200
        attempt = attempt_response.json()["data"]
        assert attempt["status"] == "rejected"
        assert attempt["lane"] == "local_readonly"
        assert attempt["authorityMode"] == "advisory"
        assert attempt["workspaceIsolationPlan"]["sourceMutationAllowed"] is False
        assert attempt["workspaceIsolationPlan"]["commandsAllowed"] is False
        assert attempt["workspaceIsolationPlan"]["networkAllowed"] is False
        assert len(attempt["artifactRefs"]) == 1
        packet_ref = attempt["artifactRefs"][0]
        assert packet_ref["artifactType"] == "task_packet_v0"
        assert packet_ref["sourceArtifactPath"] == "docs/workflows/implementation-evidence-boundary.md"
        assert packet_ref["taskKind"] == "evidence_summary"
        assert packet_ref["priority"] == "high"
        assert packet_ref["previewOnly"] is True
        assert packet_ref["executionAllowed"] is False

        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200
        event = next(event for event in events_response.json()["data"] if event["eventType"] == "execution_attempt.rejected")
        assert event["payload"]["taskPacket"]["artifactType"] == "task_packet_v0"
        assert event["payload"]["processLaunchAllowed"] is False
        assert event["payload"]["providerCallsAllowed"] is False
        assert event["payload"]["commandExecutionAllowed"] is False


def test_packet_linked_attempt_blocks_duplicate_active_attempts(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "task-packet-duplicate-attempt.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Utility planned attempt",
                "requestedOutcome": "Keep duplicate active attempts blocked.",
                "source": "operator-dashboard",
                "riskLevel": "low",
            },
        )
        assert work_item_response.status_code == 200
        work_item_id = work_item_response.json()["data"]["id"]

        first_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={"taskKind": "path_scope_check"})
        assert first_response.status_code == 200
        assert first_response.json()["data"]["status"] == "planned"
        assert first_response.json()["data"]["artifactRefs"][0]["artifactType"] == "task_packet_v0"

        duplicate_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={"taskKind": "path_scope_check"})
        assert duplicate_response.status_code == 409
        assert duplicate_response.json()["detail"]["error"]["code"] == "invalid_execution_attempt"


def test_routing_preview_honors_forbidden_selected_lane() -> None:
    from supervisor.domain.routing import ExecutionLane, RoutingPreviewService, RoutingProfile, TaskKind

    decision = RoutingPreviewService().preview(
        RoutingProfile(
            work_item_id="work-item-4",
            step_id="path-scope",
            task_kind=TaskKind.PATH_SCOPE_CHECK,
            forbidden_lanes=(ExecutionLane.UTILITY,),
        )
    )

    assert decision.selected_lane != ExecutionLane.UTILITY
    assert "policy.selected_lane_forbidden" in decision.reason_codes
    assert any(rejected.lane == ExecutionLane.UTILITY and "policy.forbidden_by_profile" in rejected.rejection_codes for rejected in decision.rejected_lanes)


def test_routing_preview_rejects_every_non_selected_lane() -> None:
    from supervisor.domain.routing import ExecutionLane, RoutingPreviewService, RoutingProfile, TaskKind

    decision = RoutingPreviewService().preview(
        RoutingProfile(
            work_item_id="work-item-5",
            step_id="path-scope",
            task_kind=TaskKind.PATH_SCOPE_CHECK,
        )
    )

    rejected_lanes = {rejected.lane for rejected in decision.rejected_lanes}
    assert rejected_lanes == {lane for lane in ExecutionLane if lane != decision.selected_lane}


def test_routing_preview_handles_delivery_and_final_review_task_kinds() -> None:
    from supervisor.domain.routing import RoutingPreviewService, RoutingProfile, TaskKind

    service = RoutingPreviewService()
    delivery = service.preview(
        RoutingProfile(
            work_item_id="work-item-6",
            step_id="delivery-readiness",
            task_kind=TaskKind.DELIVERY_PACKAGE_CHECK,
        )
    )
    final_review = service.preview(
        RoutingProfile(
            work_item_id="work-item-7",
            step_id="review",
            task_kind=TaskKind.FINAL_VALIDATION_REVIEW,
        )
    )

    assert delivery.selected_lane == "utility"
    assert delivery.authority_mode == "record_only"
    assert "task.delivery_package_check" in delivery.reason_codes
    assert final_review.selected_lane == "local_readonly"
    assert final_review.authority_mode == "advisory"
    assert "task.general_analysis" not in final_review.reason_codes


def test_routing_preview_for_reviewing_item_skips_remote_preflight(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview-reviewing.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service
    from supervisor.domain.types import WorkflowState
    from supervisor.infrastructure.db.database import SessionLocal
    from supervisor.infrastructure.db.models import WorkItem

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Route reviewing recipe",
                "requestedOutcome": "Preview delivery routing without remote checks.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        async def mark_reviewing() -> None:
            async with SessionLocal() as session:
                item = await session.get(WorkItem, work_item_id)
                assert item is not None
                item.state = WorkflowState.REVIEWING.value
                await session.commit()

        asyncio.run(mark_reviewing())

        service._remote_delivery_enabled = lambda: True  # type: ignore[method-assign]

        def fail_remote_preflight() -> tuple[bool, str]:
            raise AssertionError("routing preview must not run remote preflight")

        service._remote_delivery_preflight_status = fail_remote_preflight  # type: ignore[method-assign]

        preview_response = client.get(f"/work-items/{work_item_id}/routing-preview")

    assert preview_response.status_code == 200
    preview = preview_response.json()["data"]
    assert preview["profile"]["taskKind"] == "delivery_package_check"
    assert preview["decision"]["selectedLane"] == "utility"


def test_routing_preview_missing_work_item_uses_work_item_not_found(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview-missing.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-1"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, " M unrelated.txt"
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "unrelated.txt | 1 +"
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    with TestClient(api_main.app) as client:
        response = client.get("/work-items/missing/routing-preview")

    assert response.status_code == 404
    assert response.json()["detail"]["error"]["code"] == "work_item_not_found"


def _create_routing_work_item(client: TestClient) -> str:
    created = client.post(
        "/work-items",
        json={
            "title": "Route dry-run request",
            "requestedOutcome": "Preview route decisions from an explicit dry-run request.",
            "source": "operator-dashboard:test",
            "riskLevel": "medium",
            "metadata": {"executionRecipeId": "dashboard-test-coverage"},
        },
    )
    assert created.status_code == 200
    return created.json()["data"]["id"]


def test_routing_preview_post_without_record_event_is_non_mutating(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview-post.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        preview_response = client.post(
            f"/work-items/{work_item_id}/routing-preview",
            json={"stepId": "manual-evidence", "taskKind": "evidence_summary"},
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert preview_response.status_code == 200
    preview = preview_response.json()["data"]
    assert preview["profile"]["stepId"] == "manual-evidence"
    assert preview["profile"]["taskKind"] == "evidence_summary"
    assert preview["decision"]["selectedLane"] == "local_readonly"
    assert preview["decision"]["createdAt"] == before_item["updatedAt"]
    assert before_item == after_item
    assert before_events == after_events


def test_routing_preview_post_can_record_workflow_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview-record-event.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        preview_response = client.post(
            f"/work-items/{work_item_id}/routing-preview",
            json={"stepId": "manual-validation", "taskKind": "validation_execution", "recordEvent": True},
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert preview_response.status_code == 200
    for stable_field in (
        "id",
        "state",
        "lane",
        "statusSummary",
        "blockedReason",
        "nextStep",
        "deliveryReadiness",
        "metadata",
    ):
        assert before_item[stable_field] == after_item[stable_field]
    assert len(after_events) == len(before_events) + 1
    event = after_events[0]
    assert event["eventType"] == "routing.preview_recorded"
    payload = event["payload"]
    assert payload["stepId"] == "manual-validation"
    assert payload["taskKind"] == "validation_execution"
    assert payload["selectedLane"] == "utility"
    assert payload["authorityMode"] == "record_only"
    assert payload["confidenceBand"] == "high"
    assert isinstance(payload["confidenceScore"], float)
    assert "task.deterministic_check" in payload["reasonCodes"]
    assert payload["rejectedLanes"]
    assert payload["escalationPath"]
    assert payload["permissionSummary"]


def test_routing_override_records_evidence_without_affecting_execution(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-override.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/routing-override",
            json={
                "proposedLane": "local_readonly",
                "reason": "Operator wants a second read-only explanation before continuing.",
                "note": "Record this as tuning evidence only.",
                "actorId": "operator:routing-override-test",
                "actorLabel": "Primary operator",
            },
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    override = response.json()["data"]
    assert override["overrideId"].startswith("routing-override-")
    assert override["workItemId"] == work_item_id
    assert override["currentRoute"]["selectedLane"] == "utility"
    assert override["proposedLane"] == "local_readonly"
    assert override["executionAffected"] is False
    assert override["actorLabel"] == "Primary operator"
    assert before_item == after_item
    assert len(after_events) == len(before_events) + 1
    event = after_events[0]
    assert event["eventType"] == "routing.override_recorded"
    assert event["actorType"] == "operator"
    assert event["actorLabel"] == "Primary operator"
    assert event["payload"]["currentLane"] == "utility"
    assert event["payload"]["proposedLane"] == "local_readonly"
    assert event["payload"]["executionAffected"] is False


def test_routing_override_rejects_unknown_lane_without_recording_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-override-invalid.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/routing-override",
            json={"proposedLane": "not_a_lane", "reason": "Bad lane should not record."},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_routing_override"
    assert before_events == after_events

def test_routing_lane_profiles_aggregate_recorded_routing_events(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-lane-profiles.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        utility = client.post(
            f"/work-items/{work_item_id}/routing-preview",
            json={"taskKind": "validation_execution", "recordEvent": True},
        )
        local = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={"taskKind": "evidence_summary", "recordEvent": True},
        )
        handoff = client.post(
            f"/work-items/{work_item_id}/subscription-handoff-package",
            json={"taskKind": "architecture_review", "recordEvent": True},
        )
        premium = client.post(
            f"/work-items/{work_item_id}/premium-approval-request",
            json={"taskKind": "security_review", "approvalReason": "Security impact is high.", "recordEvent": True},
        )
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        profiles_response = client.get("/routing/lane-profiles")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert utility.status_code == 200
    assert local.status_code == 200
    assert handoff.status_code == 200
    assert premium.status_code == 200
    assert profiles_response.status_code == 200
    profiles = {profile["lane"]: profile for profile in profiles_response.json()["data"]}
    assert profiles["utility"]["decisionCount"] == 1
    assert profiles["utility"]["previewCount"] == 1
    assert profiles["utility"]["guardedExecutionCount"] == 0
    assert "task.deterministic_check" in profiles["utility"]["recentReasonCodes"]
    assert profiles["local_readonly"]["decisionCount"] == 1
    assert profiles["local_readonly"]["localExplanationCount"] == 1
    assert "privacy.local_preferred" in profiles["local_readonly"]["recentReasonCodes"]
    assert profiles["subscription_handoff"]["decisionCount"] == 1
    assert profiles["subscription_handoff"]["handoffPackageCount"] == 1
    assert "task.architecture_review" in profiles["subscription_handoff"]["recentReasonCodes"]
    assert profiles["premium_approval"]["decisionCount"] == 1
    assert profiles["premium_approval"]["premiumApprovalRequestCount"] == 1
    assert profiles["premium_approval"]["outcomeCount"] == 0
    assert "task.security_review" in profiles["premium_approval"]["recentReasonCodes"]
    assert all(profile["latestEventAt"] for profile in profiles.values())
    assert before_events == after_events


def test_worker_registry_lists_static_workers_without_mutating_events(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "worker-registry.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        first_response = client.get("/routing/worker-registry")
        second_response = client.get("/routing/worker-registry")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json() == second_response.json()
    assert before_events == after_events

    workers = {worker["workerId"]: worker for worker in first_response.json()["data"]}
    utility = workers["utility.internal"]
    local = workers["local.readonly.mock"]
    handoff = workers["subscription.handoff"]
    agent = workers["subscription.agent.disabled"]
    premium = workers["premium.approval"]

    assert utility["lane"] == "utility"
    assert utility["adapterType"] == "internal_utility"
    assert utility["health"] == "online"
    assert utility["queueDepth"] == 0
    assert utility["maxParallelJobs"] == 1
    assert utility["disabledReason"] is None
    assert "internal_functions_only" in utility["permissions"]
    assert "path_scope_check" in utility["capabilities"]

    assert local["lane"] == "local_readonly"
    assert local["health"] == "online"
    assert local["disabledReason"] is None
    assert "no_file_writes" in local["permissions"]

    for worker_id, disabled_reason in {
        "local.ollama.disabled": "ollama_local_provider_not_enabled",
        "local.lmstudio.disabled": "lmstudio_local_provider_not_enabled",
        "local.vllm.disabled": "vllm_local_provider_not_enabled",
        "local.llamacpp.disabled": "llamacpp_local_provider_not_enabled",
    }.items():
        provider = workers[worker_id]
        assert provider["lane"] == "local_readonly"
        assert provider["adapterType"] == "local_openai_compatible"
        assert provider["health"] == "disabled"
        assert provider["disabledReason"] == disabled_reason
        assert "provider_disabled" in provider["permissions"]
        assert "no_http_calls" in provider["permissions"]
        assert "no_model_calls" in provider["permissions"]
    assert handoff["lane"] == "subscription_handoff"
    assert handoff["health"] == "disabled"
    assert handoff["disabledReason"] == "direct_subscription_launch_not_enabled"

    assert agent["lane"] == "subscription_agent"
    assert agent["adapterType"] == "subscription_agent"
    assert agent["health"] == "disabled"
    assert agent["disabledReason"] == "subscription_agent_process_launch_not_enabled"
    assert "no_process_launch" in agent["permissions"]

    assert premium["lane"] == "premium_approval"
    assert premium["health"] == "disabled"
    assert premium["disabledReason"] == "premium_execution_requires_operator_approval_flow"


def test_execution_configuration_checks_report_disabled_defaults_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-configuration-checks.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/execution-configuration-checks")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    checks_view = response.json()["data"]
    assert checks_view["allDisabled"] is True
    assert checks_view["summary"] == "Real worker execution remains disabled by configuration."
    assert before_events == after_events

    checks = {check["checkId"]: check for check in checks_view["checks"]}
    assert checks["subscription-agent-launch"]["disabledReason"] == "subscription_agent_process_launch_not_enabled"
    assert checks["subscription-agent-launch"]["affectedWorkers"] == ["subscription.agent.disabled"]
    assert checks["subscription-agent-launch"]["launchTargets"][0]["targetId"] == "codex.subscription.disabled"
    assert checks["subscription-agent-launch"]["launchTargets"][0]["enabled"] is False
    assert checks["subscription-agent-launch"]["launchTargets"][0]["broadGateEnabled"] is False
    assert checks["subscription-agent-launch"]["launchTargets"][0]["targetSpecificGateEnabled"] is False
    assert checks["subscription-launch-targets"]["disabledReason"] == "subscription_launch_targets_not_enabled"
    assert checks["subscription-launch-targets"]["affectedWorkers"] == ["subscription.agent.disabled"]
    assert {target["targetId"] for target in checks["subscription-launch-targets"]["launchTargets"]} == {
        "codex.subscription.disabled",
        "claude.subscription.disabled",
        "gemini.subscription.disabled",
    }
    assert checks["local-provider-calls"]["disabledReason"] == "local_provider_http_calls_not_enabled"
    assert set(checks["local-provider-calls"]["affectedWorkers"]) == {
        "local.ollama.disabled",
        "local.lmstudio.disabled",
        "local.vllm.disabled",
        "local.llamacpp.disabled",
    }
    assert checks["ollama-provider-gate"]["disabledReason"] == "ollama_provider_gate_not_enabled"
    assert checks["ollama-provider-gate"]["affectedWorkers"] == ["local.ollama.disabled"]
    assert any(
        "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS defaults to false" in evidence
        for evidence in checks["ollama-provider-gate"]["evidence"]
    )
    assert any(
        "SUPERVISOR_OLLAMA_MODEL_ID is required before adapter readiness" in evidence
        for evidence in checks["ollama-provider-gate"]["evidence"]
    )
    assert checks["premium-execution"]["disabledReason"] == "premium_execution_not_enabled"
    assert checks["premium-execution"]["affectedWorkers"] == ["premium.approval"]

    for check in checks.values():
        assert check["enabled"] is False
        assert check["status"] == "disabled"
        assert check["processLaunchAllowed"] is False
        assert check["providerCallsAllowed"] is False
        assert check["modelCallsAllowed"] is False
        assert check["premiumExecutionAllowed"] is False
        assert check["commandExecutionAllowed"] is False
        assert check["sourceMutationAllowed"] is False
        assert check["networkAllowed"] is False
        assert check["credentialAccessAllowed"] is False
        assert check["evidence"]


def test_subscription_launch_target_gate_reports_disabled_target_specific_state(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-launch-target-gate.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    launch_targets = {target["targetId"]: target for target in checks["subscription-launch-targets"]["launchTargets"]}
    codex = launch_targets["codex.subscription.disabled"]
    claude = launch_targets["claude.subscription.disabled"]

    assert checks["subscription-agent-launch"]["enabled"] is True
    assert checks["subscription-agent-launch"]["processLaunchAllowed"] is False
    assert checks["subscription-launch-targets"]["enabled"] is False
    assert codex["broadGateEnabled"] is True
    assert codex["targetSpecificGateEnabled"] is True
    assert codex["enabled"] is False
    assert codex["processLaunchAllowed"] is False
    assert claude["targetSpecificGateEnabled"] is False
    assert claude["enabled"] is False


def test_ollama_provider_gate_stays_non_executing_when_broad_gate_is_enabled(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-provider-gate-broad-only.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")
        proofs_response = client.get("/supervisor/disabled-provider-proofs")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    assert checks["ollama-provider-gate"]["enabled"] is False
    assert checks["ollama-provider-gate"]["disabledReason"] == "ollama_provider_gate_not_enabled"
    assert checks["ollama-provider-gate"]["providerCallsAllowed"] is False
    assert checks["ollama-provider-gate"]["modelCallsAllowed"] is False

    proofs = {proof["workerId"]: proof for proof in proofs_response.json()["data"]}
    ollama = proofs["local.ollama.disabled"]
    assert ollama["broadGateEnabled"] is True
    assert ollama["providerSpecificGateEnabled"] is False
    assert ollama["modelIdConfigured"] is False
    assert ollama["adapterReady"] is False
    assert ollama["registryState"] == "disabled"
    assert ollama["httpCallsAttempted"] is False
    assert ollama["modelCallsAttempted"] is False


def test_ollama_provider_gate_stays_disabled_when_broad_gate_is_disabled(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-provider-gate-ollama-only.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "llama3.2:fixture")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")
        proofs_response = client.get("/supervisor/disabled-provider-proofs")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    assert checks["ollama-provider-gate"]["enabled"] is False
    assert checks["ollama-provider-gate"]["disabledReason"] == "local_provider_http_calls_not_enabled"
    assert checks["ollama-provider-gate"]["providerCallsAllowed"] is False
    assert checks["ollama-provider-gate"]["modelCallsAllowed"] is False

    proofs = {proof["workerId"]: proof for proof in proofs_response.json()["data"]}
    ollama = proofs["local.ollama.disabled"]
    assert ollama["broadGateEnabled"] is False
    assert ollama["providerSpecificGateEnabled"] is True
    assert ollama["modelIdConfigured"] is True
    assert ollama["adapterReady"] is False
    assert ollama["registryState"] == "disabled"
    assert ollama["httpCallsAttempted"] is False
    assert ollama["modelCallsAttempted"] is False


def test_ollama_provider_gate_requires_model_id_before_adapter_readiness(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-provider-gate-missing-model.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://192.168.1.128:11434/v1/chat/completions")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")
        proofs_response = client.get("/supervisor/disabled-provider-proofs")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    assert checks["ollama-provider-gate"]["enabled"] is False
    assert checks["ollama-provider-gate"]["disabledReason"] == "ollama_model_id_not_configured"
    assert checks["ollama-provider-gate"]["providerCallsAllowed"] is False
    assert checks["ollama-provider-gate"]["modelCallsAllowed"] is False

    proofs = {proof["workerId"]: proof for proof in proofs_response.json()["data"]}
    ollama = proofs["local.ollama.disabled"]
    assert ollama["broadGateEnabled"] is True
    assert ollama["providerSpecificGateEnabled"] is True
    assert ollama["modelIdConfigured"] is False
    assert ollama["adapterReady"] is False
    assert ollama["registryState"] == "configured_ollama_gate_missing_model"


def test_ollama_timeout_settings_require_positive_values(monkeypatch) -> None:
    monkeypatch.setenv("SUPERVISOR_OLLAMA_CONNECT_TIMEOUT_SECONDS", "0")

    _reset_supervisor_modules()

    from supervisor.config.settings import Settings

    with pytest.raises(ValueError, match="greater than 0"):
        Settings()


def test_ollama_provider_gate_requires_approved_endpoint_before_execution(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-provider-gate-adapter-ready.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "llama3.2:fixture")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")
        proofs_response = client.get("/supervisor/disabled-provider-proofs")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    assert checks["ollama-provider-gate"]["enabled"] is False
    assert checks["ollama-provider-gate"]["disabledReason"] == "ollama_endpoint_not_configured"
    assert checks["ollama-provider-gate"]["providerCallsAllowed"] is False
    assert checks["ollama-provider-gate"]["modelCallsAllowed"] is False

    proofs = {proof["workerId"]: proof for proof in proofs_response.json()["data"]}
    ollama = proofs["local.ollama.disabled"]
    assert ollama["broadGateEnabled"] is True
    assert ollama["providerSpecificGateEnabled"] is True
    assert ollama["modelIdConfigured"] is True
    assert ollama["adapterReady"] is False
    assert ollama["registryState"] == "configured_ollama_gate_missing_endpoint"
    assert ollama["disabledReason"] == "ollama_endpoint_not_configured"
    assert ollama["httpCallsAttempted"] is False
    assert ollama["modelCallsAttempted"] is False


def test_ollama_provider_gate_enables_only_approved_host_endpoint_and_model(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-provider-gate-approved-host.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://192.168.1.128:11434/v1/chat/completions")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "qwen3:14b")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")
        proofs_response = client.get("/supervisor/disabled-provider-proofs")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    assert checks["ollama-provider-gate"]["enabled"] is True
    assert checks["ollama-provider-gate"]["disabledReason"] is None
    assert checks["ollama-provider-gate"]["providerCallsAllowed"] is True
    assert checks["ollama-provider-gate"]["modelCallsAllowed"] is True
    assert "Approved endpoint: http://192.168.1.128:11434/v1/chat/completions." in checks["ollama-provider-gate"]["evidence"]
    assert "Approved model id: qwen3:14b." in checks["ollama-provider-gate"]["evidence"]

    proofs = {proof["workerId"]: proof for proof in proofs_response.json()["data"]}
    ollama = proofs["local.ollama.disabled"]
    assert ollama["registryState"] == "enabled_approved_host_endpoint"
    assert ollama["disabledReason"] == "ollama_provider_enabled_for_approved_host_endpoint"
    assert ollama["httpCallsAttempted"] is True
    assert ollama["modelCallsAttempted"] is True
    assert ollama["connectTimeoutSeconds"] == 2
    assert ollama["totalTimeoutSeconds"] == 120


def test_ollama_provider_gate_rejects_unapproved_endpoint(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-provider-gate-unapproved-endpoint.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://127.0.0.1:11434/v1/chat/completions")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "qwen3:14b")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/execution-configuration-checks")

    assert response.status_code == 200
    checks = {check["checkId"]: check for check in response.json()["data"]["checks"]}
    assert checks["ollama-provider-gate"]["enabled"] is False
    assert checks["ollama-provider-gate"]["disabledReason"] == "ollama_endpoint_not_approved"
    assert checks["ollama-provider-gate"]["providerCallsAllowed"] is False
    assert checks["ollama-provider-gate"]["modelCallsAllowed"] is False


def _accepted_local_provider_approval(**overrides):
    now = datetime.now(timezone.utc)
    approval = {
        "approvalId": "local-provider-approval-test-001",
        "status": "accepted",
        "authorityFamily": "local-provider-execution",
        "operation": "one bounded Ollama provider operation",
        "endpointUrl": "http://192.168.1.128:11434/v1/chat/completions",
        "modelId": "qwen3:14b",
        "promptSourceId": "work-item-local-evidence-summary",
        "promptTemplateId": "local-evidence-explanation-v1",
        "redactionPolicy": "metadata_only_no_raw_prompt_completion_reasoning_or_provider_payload",
        "timeoutCancellationPolicy": "connect_timeout_2s_total_timeout_120s",
        "retainedEvidencePolicy": "metadata-only",
        "retainedEvidence": ["work_item_metadata", "workflow_event_summaries"],
        "approvedBy": "Operator",
        "approvedAt": now.isoformat(),
        "expiresAt": (now + timedelta(minutes=10)).isoformat(),
        "rollbackPath": ["disable local-provider and Ollama-specific gates"],
        "stopLines": [
            "Do not call any endpoint other than http://192.168.1.128:11434/v1/chat/completions.",
            "Do not use any model other than qwen3:14b.",
            "Do not retain raw prompt, completion, reasoning, or provider payload text in workflow events.",
        ],
    }
    approval.update(overrides)
    return approval


def test_ollama_local_evidence_explanation_rejects_missing_approval_before_adapter_call(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-local-evidence-missing-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://192.168.1.128:11434/v1/chat/completions")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "qwen3:14b")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    adapter_calls = {"count": 0}

    async def fake_explain(self, *, evidence_summary, evidence_count, cancellation_event=None):
        adapter_calls["count"] += 1
        raise AssertionError("Ollama adapter must not run without exact approval.")

    monkeypatch.setattr("supervisor.domain.ollama_provider_adapter.OllamaProviderAdapter.explain", fake_explain)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={"taskKind": "evidence_summary", "recordEvent": True},
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")

    assert response.status_code == 200
    explanation = response.json()["data"]
    assert adapter_calls["count"] == 0
    assert explanation["providerAttempt"]["status"] == "rejected"
    assert explanation["providerAttempt"]["approvalStatus"] == "rejected"
    assert explanation["providerAttempt"]["rejectionReason"] == "approval-instance-missing"
    assert explanation["providerAttempt"]["rawPayloadRetained"] is False
    assert explanation["providerAttempt"]["promptCharacterCount"] == 0

    events = events_response.json()["data"]
    recorded = next(event for event in events if event["eventType"] == "routing.local_evidence_explained")
    assert recorded["payload"]["providerAttempt"]["status"] == "rejected"
    assert recorded["payload"]["providerAttempt"]["rejectionReason"] == "approval-instance-missing"
    assert "OK." not in str(recorded)
    assert "Okay, the user wants" not in str(recorded)


def test_ollama_local_evidence_explanation_records_metadata_without_raw_provider_text(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-local-evidence-explanation.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://192.168.1.128:11434/v1/chat/completions")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "qwen3:14b")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    from supervisor.domain.ollama_provider_adapter import OllamaProviderResult

    captured_provider_prompt = {}

    async def fake_explain(self, *, evidence_summary, evidence_count, cancellation_event=None):
        captured_provider_prompt["evidence_summary"] = evidence_summary
        captured_provider_prompt["evidence_count"] = evidence_count
        return OllamaProviderResult(
            status="completed",
            model_id="qwen3:14b",
            endpoint_family="approved_vm_to_host_ollama_openai_compatible",
            finish_reason="stop",
            prompt_summary="Evidence summary for Route dry-run request.",
            response_summary="Provider returned 3 content character(s) and 42 reasoning character(s); raw text redacted.",
            response_character_count=3,
            reasoning_character_count=42,
            prompt_character_count=len(evidence_summary),
            completion_tokens=2,
            prompt_tokens=10,
            total_tokens=12,
            redaction_applied=True,
            raw_payload_retained=False,
            timeout_state="completed_before_total_timeout",
            cancellation_state="not_cancelled",
        )

    monkeypatch.setattr("supervisor.domain.ollama_provider_adapter.OllamaProviderAdapter.explain", fake_explain)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={
                "taskKind": "evidence_summary",
                "recordEvent": True,
                "localProviderApproval": _accepted_local_provider_approval(),
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")

    assert response.status_code == 200
    explanation = response.json()["data"]
    assert explanation["providerAttempt"]["status"] == "completed"
    assert explanation["providerAttempt"]["modelId"] == "qwen3:14b"
    assert explanation["providerAttempt"]["approvalId"] == "local-provider-approval-test-001"
    assert explanation["providerAttempt"]["approvalStatus"] == "accepted"
    assert explanation["providerAttempt"]["responseCharacterCount"] == 3
    assert explanation["providerAttempt"]["reasoningCharacterCount"] == 42
    assert explanation["providerAttempt"]["rawPayloadRetained"] is False
    assert (
        "Ollama approved endpoint: http://192.168.1.128:11434/v1/chat/completions with model qwen3:14b only."
        in explanation["boundaries"]
    )
    assert "OK." not in str(explanation)
    assert "Okay, the user wants" not in str(explanation)
    assert captured_provider_prompt["evidence_count"] == len(explanation["evidence"])
    assert "Approved workflow event summaries:" in captured_provider_prompt["evidence_summary"]
    assert "work_item.queued" in captured_provider_prompt["evidence_summary"]
    assert "recipe.selected" in captured_provider_prompt["evidence_summary"]

    events = events_response.json()["data"]
    recorded = next(event for event in events if event["eventType"] == "routing.local_evidence_explained")
    assert recorded["payload"]["providerAttempt"]["approvalStatus"] == "accepted"
    assert recorded["payload"]["providerAttempt"]["rawPayloadRetained"] is False
    assert "OK." not in str(recorded)
    assert "Okay, the user wants" not in str(recorded)


def test_ollama_local_evidence_explanation_rejects_mismatched_or_expired_approval(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-local-evidence-bad-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://192.168.1.128:11434/v1/chat/completions")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "qwen3:14b")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    adapter_calls = {"count": 0}

    async def fake_explain(self, *, evidence_summary, evidence_count, cancellation_event=None):
        adapter_calls["count"] += 1
        raise AssertionError("Ollama adapter must not run for mismatched or expired approval.")

    monkeypatch.setattr("supervisor.domain.ollama_provider_adapter.OllamaProviderAdapter.explain", fake_explain)

    expired_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={
                "taskKind": "evidence_summary",
                "localProviderApproval": _accepted_local_provider_approval(
                    endpointUrl="http://127.0.0.1:11434/v1/chat/completions",
                    expiresAt=expired_at.isoformat(),
                ),
            },
        )

    assert response.status_code == 200
    explanation = response.json()["data"]
    assert adapter_calls["count"] == 0
    assert explanation["providerAttempt"]["status"] == "rejected"
    assert explanation["providerAttempt"]["approvalStatus"] == "rejected"
    assert "approval-endpoint-mismatch" in explanation["providerAttempt"]["rejectionReasons"]
    assert "approval-expired" in explanation["providerAttempt"]["rejectionReasons"]
    assert explanation["providerAttempt"]["rawPayloadRetained"] is False


def test_ollama_local_evidence_explanation_rejects_unsafe_placeholder_approval_text(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "ollama-local-evidence-placeholder-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "true")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_ENDPOINT_URL", "http://192.168.1.128:11434/v1/chat/completions")
    monkeypatch.setenv("SUPERVISOR_OLLAMA_MODEL_ID", "qwen3:14b")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    adapter_calls = {"count": 0}

    async def fake_explain(self, *, evidence_summary, evidence_count, cancellation_event=None):
        adapter_calls["count"] += 1
        raise AssertionError("Ollama adapter must not run for unsafe placeholder approval text.")

    monkeypatch.setattr("supervisor.domain.ollama_provider_adapter.OllamaProviderAdapter.explain", fake_explain)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={
                "taskKind": "evidence_summary",
                "localProviderApproval": _accepted_local_provider_approval(
                    redactionPolicy="none",
                    rollbackPath=["anything"],
                    stopLines=["anything"],
                ),
            },
        )

    assert response.status_code == 200
    explanation = response.json()["data"]
    assert adapter_calls["count"] == 0
    assert explanation["providerAttempt"]["status"] == "rejected"
    assert "approval-redaction-policy-mismatch" in explanation["providerAttempt"]["rejectionReasons"]
    assert "approval-rollback-mismatch" in explanation["providerAttempt"]["rejectionReasons"]
    assert "approval-stop-lines-endpoint-missing" in explanation["providerAttempt"]["rejectionReasons"]
    assert "approval-stop-lines-model-missing" in explanation["providerAttempt"]["rejectionReasons"]
    assert "approval-stop-lines-retention-missing" in explanation["providerAttempt"]["rejectionReasons"]
    assert explanation["providerAttempt"]["rawPayloadRetained"] is False


def test_ollama_provider_request_uses_connect_timeout_without_global_socket_mutation(monkeypatch) -> None:
    from supervisor.domain.ollama_provider_adapter import OllamaProviderAdapter

    captured_timeout = {}
    original_default_timeout = socket.getdefaulttimeout()

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def read(self):
            return b'{"model":"qwen3:14b","choices":[{"message":{"content":"OK"},"finish_reason":"stop"}],"usage":{"completion_tokens":1,"prompt_tokens":2,"total_tokens":3}}'

    def fake_urlopen(request, timeout):
        captured_timeout["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    adapter = OllamaProviderAdapter(
        endpoint_url="http://192.168.1.128:11434/v1/chat/completions",
        model_id="qwen3:14b",
        connect_timeout_seconds=2,
        total_timeout_seconds=120,
    )

    result = adapter._post_chat_completion("approved evidence", None)

    assert result.status == "completed"
    assert captured_timeout["timeout"] == 2
    assert socket.getdefaulttimeout() == original_default_timeout


def test_execution_readiness_report_compacts_policy_attempt_and_outcome_evidence_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})
        managed_response = client.post(
            f"/work-items/{work_item_id}/managed-next-action",
            json={"expectedActionId": "supervisor_triage"},
        )
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/execution-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert attempt_response.status_code == 200
    assert managed_response.status_code == 200
    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "execution-readiness-report-v1"
    assert report["executionAllowed"] is False
    assert report["providerCallsAllowed"] is False
    assert report["commandExecutionAllowed"] is False
    assert report["sourceMutationAllowed"] is False
    assert {step["stepId"] for step in report["providerEnablementPolicy"]} == {
        "prd-decision",
        "threat-boundary-update",
        "settings-and-registry",
        "permission-envelope",
        "operator-copy-and-tests",
    }
    assert {check["checkId"] for check in report["disabledAuthorityChecks"]} >= {
        "local-provider-calls",
        "subscription-agent-launch",
        "premium-execution",
    }
    assert {proof["workerId"] for proof in report["disabledProviderProofs"]} == {
        "local.ollama.disabled",
        "local.lmstudio.disabled",
        "local.vllm.disabled",
        "local.llamacpp.disabled",
    }
    assert all(proof["httpCallsAttempted"] is False for proof in report["disabledProviderProofs"])
    assert all(proof["modelCallsAttempted"] is False for proof in report["disabledProviderProofs"])
    assert report["currentAttempts"][0]["workItemId"] == work_item_id
    assert report["currentAttempts"][0]["nextSafeAction"]
    assert report["latestOutcomes"][0]["workItemId"] == work_item_id
    assert report["latestOutcomes"][0]["reportingOnly"] is True
    assert report["nextSafeActions"]


def test_documentation_authority_report_surfaces_indexes_and_blocked_stories_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "documentation-authority-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/documentation-authority-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "documentation-authority-report-v1"
    assert report["executionAuthorityApproved"] is False
    assert {document["path"] for document in report["indexes"]} == {
        "docs/architecture/index.md",
        "docs/workflows/product-requirements-boundary.md",
        "docs/workflows/implementation-evidence-boundary.md",
    }
    assert report["approvalCheckpoint"]["path"].endswith("kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md")
    assert {story["storyId"] for story in report["blockedStories"]} == {"4.4", "5.5"}
    assert all(story["status"] == "blocked_pending_explicit_approval" for story in report["blockedStories"])
    assert {check["stepId"] for check in report["driftChecks"]} == {
        "required-documents-present",
        "blocked-story-count",
        "check-docs-command",
        "check-documentation-authority-command",
    }
    assert "pnpm run check:docs" in " ".join(report["nextSafeActions"])


def test_verification_readiness_report_surfaces_required_checks_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "verification-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/verification-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "verification-readiness-report-v1"
    assert report["readyForAuthorityEnablement"] is False
    assert report["executionAuthorityApproved"] is False
    assert {command["commandId"] for command in report["requiredCommands"]} == {
        "preflight",
        "check-docs",
        "check-documentation-authority",
        "check-verification-readiness",
        "check-authority-readiness",
        "check-e2e-report",
        "check-reports",
        "check-execution-boundary",
        "check-execution-evidence",
        "check-provider-fixtures",
        "check-process-lifecycle",
        "check-runbooks",
        "check-runtime-export",
        "check-runtime-review",
        "check-safe-backlog",
        "check-managed-recipes",
        "check-maintenance-action-plan",
        "check-development-runway",
        "check-delivery-readiness",
        "check-maintenance-readiness",
        "dashboard-build",
        "supervisor-tests",
        "full-check",
    }
    assert {command["commandId"] for command in report["optionalCommands"]} == {
        "setup-e2e",
        "dashboard-controls-e2e",
        "dashboard-detail-e2e",
        "dashboard-mobile-e2e",
        "dashboard-managed-recipe-e2e",
        "dashboard-managed-mobile-recipe-e2e",
        "dashboard-provider-raw-output-e2e",
        "dashboard-e2e",
        "github-doctor-remote",
    }
    assert {group["groupId"] for group in report["commandGroups"]} == {
        "setup-and-preflight",
        "static-drift-chain",
        "dashboard-browser-build",
        "supervisor-behavior-tests",
        "full-local-gate",
        "optional-remote-bootstrap",
    }
    static_group = next(group for group in report["commandGroups"] if group["groupId"] == "static-drift-chain")
    assert "check-runtime-review" in static_group["commandIds"]
    assert "check-development-runway" in static_group["commandIds"]
    dashboard_group = next(group for group in report["commandGroups"] if group["groupId"] == "dashboard-browser-build")
    assert "dashboard-controls-e2e" in dashboard_group["commandIds"]
    assert "dashboard-provider-raw-output-e2e" in dashboard_group["commandIds"]
    assert "dashboard-build" in dashboard_group["commandIds"]
    full_gate = next(group for group in report["commandGroups"] if group["groupId"] == "full-local-gate")
    assert full_gate["commandIds"] == ["full-check"]
    assert {checkpoint["checkpointId"] for checkpoint in report["handoffCheckpoints"]} == {
        "local-development-handoff",
        "dashboard-change-handoff",
        "setup-handoff",
        "authority-boundary-handoff",
    }
    local_handoff = next(checkpoint for checkpoint in report["handoffCheckpoints"] if checkpoint["checkpointId"] == "local-development-handoff")
    assert local_handoff["requiredCommandIds"] == ["preflight", "full-check"]
    assert "README.md" in local_handoff["relatedRunbooks"]
    assert "docs/workflows/current-session-runbook.md" in local_handoff["relatedRunbooks"]
    for checkpoint in report["handoffCheckpoints"]:
        assert "docs/handoffs/current.md" not in checkpoint["relatedRunbooks"]
    setup_handoff = next(checkpoint for checkpoint in report["handoffCheckpoints"] if checkpoint["checkpointId"] == "setup-handoff")
    assert "github-doctor-remote" in setup_handoff["requiredCommandIds"]
    assert "docs/workflows/linux-primary-development-runbook.md" in setup_handoff["relatedRunbooks"]
    authority_handoff = next(checkpoint for checkpoint in report["handoffCheckpoints"] if checkpoint["checkpointId"] == "authority-boundary-handoff")
    assert "explicit operator approval" in authority_handoff["summary"]
    assert any("provider/model calls" in stop_line for stop_line in report["stopLines"])
    assert "pnpm run check" in " ".join(report["nextSafeActions"])


def test_supervisor_report_catalog_indexes_report_endpoints_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervisor-report-catalog.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/report-catalog")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    catalog = response.json()["data"]
    assert catalog["catalogId"] == "supervisor-report-catalog-v1"
    assert catalog["readOnly"] is True
    assert catalog["executionAuthorityApproved"] is False

    endpoints = {report["endpoint"] for report in catalog["reports"]}
    assert endpoints == {
        "GET /supervisor/execution-configuration-checks",
        "GET /supervisor/execution-readiness-report",
        "GET /supervisor/documentation-authority-report",
        "GET /supervisor/verification-readiness-report",
        "GET /supervisor/authority-readiness-matrix-report",
        "GET /supervisor/dashboard-e2e-report",
        "GET /supervisor/maintenance-readiness-report",
        "GET /supervisor/maintenance-action-plan-report",
        "GET /supervisor/development-runway-report",
        "GET /supervisor/runtime-evidence-review-report",
        "GET /supervisor/safe-development-backlog",
        "GET /supervisor/managed-recipe-policy-report",
        "GET /supervisor/github-workflow-policy-report",
        "GET /supervisor/git-hygiene-report",
        "GET /supervisor/codex-readiness-report",
        "GET /supervisor/codex-implementation-approval-report",
        "GET /supervisor/claude-review-readiness-report",
        "GET /supervisor/claude-review-approval-report",
        "GET /supervisor/github-delivery-authority-report",
        "GET /supervisor/trusted-delivery-eligibility-report",
        "GET /supervisor/local-cleanup-readiness-report",
        "GET /supervisor/remote-cleanup-sync-readiness-report",
        "GET /supervisor/trusted-autonomy-readiness-report",
        "GET /supervisor/epic-6-completion-audit-report",
        "GET /supervisor/epic-6-mvp-proof-trial-report",
        "GET /supervisor/delivery-readiness-policy-report",
        "GET /supervisor/disabled-provider-proofs",
        "GET /supervisor/execution-state-boundary",
        "GET /supervisor/threat-boundary",
    }
    assert all(report["readOnly"] is True for report in catalog["reports"])
    assert all(report["executionAuthorityApproved"] is False for report in catalog["reports"])
    assert any("not approvals" in stop_line for stop_line in catalog["stopLines"])


def test_dashboard_e2e_report_lists_focused_runners_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "dashboard-e2e-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/dashboard-e2e-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "dashboard-e2e-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert {runner["runnerId"] for runner in report["runners"]} == {
        "dashboard-controls-e2e",
        "dashboard-detail-e2e",
        "dashboard-mobile-e2e",
        "dashboard-managed-recipe-e2e",
        "dashboard-managed-mobile-recipe-e2e",
        "dashboard-provider-raw-output-e2e",
        "dashboard-full-e2e",
    }
    runner_by_id = {runner["runnerId"]: runner for runner in report["runners"]}
    assert runner_by_id["dashboard-controls-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-detail-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-mobile-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-managed-recipe-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-managed-mobile-recipe-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-provider-raw-output-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-full-e2e"]["ownsServerLifecycle"] is False
    assert runner_by_id["dashboard-controls-e2e"]["command"] == "pnpm run test:e2e:dashboard:controls"
    assert runner_by_id["dashboard-detail-e2e"]["command"] == "pnpm run test:e2e:dashboard:detail"
    assert runner_by_id["dashboard-mobile-e2e"]["command"] == "pnpm run test:e2e:dashboard:mobile"
    assert runner_by_id["dashboard-managed-recipe-e2e"]["command"] == "pnpm run test:e2e:dashboard:managed"
    assert runner_by_id["dashboard-managed-mobile-recipe-e2e"]["command"] == "pnpm run test:e2e:dashboard:managed:mobile"
    assert runner_by_id["dashboard-provider-raw-output-e2e"]["command"] == "pnpm run test:e2e:dashboard:provider-raw-output"
    assert "scripts/dashboard-e2e-runner.mjs" in " ".join(runner_by_id["dashboard-controls-e2e"]["evidence"])
    assert "scripts/dashboard-e2e-runner.mjs" in " ".join(runner_by_id["dashboard-detail-e2e"]["evidence"])
    assert runner_by_id["dashboard-provider-raw-output-e2e"]["label"] == "Provider raw-output UI regression slice"
    assert "provider raw-output UI" in " ".join(runner_by_id["dashboard-provider-raw-output-e2e"]["evidence"])
    assert {command["commandId"] for command in report["setupCommands"]} == {
        "setup-e2e",
        "dashboard-build",
        "check-e2e-report",
    }
    assert any("provider/model calls" in stop_line for stop_line in report["stopLines"])
    assert any("focused runners" in action for action in report["nextSafeActions"])


def test_maintenance_readiness_report_tracks_safe_work_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "maintenance-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/maintenance-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "maintenance-readiness-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert {track["trackId"] for track in report["tracks"]} == {
        "documentation-hygiene",
        "verification-hygiene",
        "report-surface-alignment",
        "authority-blocker-watch",
    }
    blocker_track = next(track for track in report["tracks"] if track["trackId"] == "authority-blocker-watch")
    assert blocker_track["status"] == "blocked_pending_explicit_approval"
    assert (
        "Ollama Story 4.4 is approved only for VM-to-host endpoint "
        "http://192.168.1.128:11434/v1/chat/completions and model qwen3:14b."
    ) in blocker_track["evidence"]
    assert "Raw Ollama prompts, completions, reasoning fields, and provider payloads must not be retained." in blocker_track["evidence"]
    assert all("4.1-4.4 remain blocked" not in evidence for evidence in blocker_track["evidence"])
    assert "GET /supervisor/execution-readiness-report" in blocker_track["relatedReports"]
    assert "/controls#execution-readiness-report" in blocker_track["dashboardAnchors"]
    verification_track = next(track for track in report["tracks"] if track["trackId"] == "verification-hygiene")
    assert "GET /supervisor/dashboard-e2e-report" in verification_track["relatedReports"]
    assert "/controls#dashboard-e2e-report" in verification_track["dashboardAnchors"]
    documentation_track = next(track for track in report["tracks"] if track["trackId"] == "documentation-hygiene")
    assert "docs/workflows/implementation-evidence-boundary.md" in documentation_track["relatedDocs"]
    assert "/controls#documentation-authority-report" in documentation_track["dashboardAnchors"]
    assert any("must not approve local provider/model calls" in stop_line for stop_line in report["stopLines"])
    assert any("coherent PRs" in action for action in report["nextSafeActions"])


def test_maintenance_action_plan_report_consolidates_next_safe_steps_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "maintenance-action-plan-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/maintenance-action-plan-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "maintenance-action-plan-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert {step["stepId"] for step in report["steps"]} == {
        "select-large-safe-slice",
        "verify-evidence-surfaces",
        "run-verification-chain",
        "preserve-authority-stop-lines",
    }
    safe_slice_step = next(step for step in report["steps"] if step["stepId"] == "select-large-safe-slice")
    assert safe_slice_step["priority"] == "P0"
    assert safe_slice_step["status"] == "ready"
    assert "pnpm run check:safe-backlog" in safe_slice_step["verificationCommands"]
    assert "/controls#safe-development-backlog" in safe_slice_step["dashboardAnchors"]
    assert "GET /supervisor/safe-development-backlog" in safe_slice_step["relatedReports"]
    assert "docs/workflows/implementation-evidence-boundary.md" in safe_slice_step["relatedDocs"]
    authority_step = next(step for step in report["steps"] if step["stepId"] == "preserve-authority-stop-lines")
    assert authority_step["status"] == "blocked_pending_explicit_approval"
    assert "pnpm run check:process-lifecycle" in authority_step["verificationCommands"]
    assert "GET /supervisor/execution-readiness-report" in authority_step["relatedReports"]
    assert "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md" in authority_step["relatedDocs"]
    assert "pnpm run check" in report["verificationChain"]
    assert any("not execution-authority approvals" in stop_line for stop_line in report["stopLines"])
    assert any("one PR" in action for action in report["nextSafeActions"])


def test_development_runway_report_groups_larger_safe_slices_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "development-runway-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/development-runway-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "development-runway-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert report["remoteAutomationApproved"] is False
    assert "Prefer one coherent PR" in report["planningRule"]
    assert "at least two aligned surfaces" in report["minimumPrScope"]
    assert any("larger reviewable PRs" in policy for policy in report["batchingPolicy"])
    assert any("PR body names the safe slice" in item for item in report["prBatchingChecklist"])
    assert {slice_item["sliceId"] for slice_item in report["slices"]} == {
        "report-evidence-navigation-slice",
        "verification-runbook-hardening-slice",
        "authority-blocker-maintenance-slice",
    }
    report_slice = next(slice_item for slice_item in report["slices"] if slice_item["sliceId"] == "report-evidence-navigation-slice")
    assert report_slice["status"] == "ready"
    assert "safe-backlog-report-alignment" in report_slice["includedBacklogItems"]
    assert "verify-evidence-surfaces" in report_slice["includedActionSteps"]
    assert "pnpm run check:reports" in report_slice["requiredVerification"]
    assert "docs/workflows/implementation-evidence-boundary.md" in report_slice["relatedDocs"]
    assert "/controls#supervisor-report-catalog" in report_slice["dashboardAnchors"]
    assert {check["checkId"] for check in report_slice["readinessChecks"]} == {
        "ready-backlog-item",
        "action-plan-coverage",
        "focused-verification",
    }
    assert all(check["status"] == "ready" for check in report_slice["readinessChecks"])
    ready_check = next(check for check in report_slice["readinessChecks"] if check["checkId"] == "ready-backlog-item")
    assert "docs/workflows/implementation-evidence-boundary.md" in ready_check["relatedDocs"]
    assert "/controls#safe-development-backlog" in ready_check["dashboardAnchors"]
    verification_slice = next(slice_item for slice_item in report["slices"] if slice_item["sliceId"] == "verification-runbook-hardening-slice")
    assert "pnpm run check:runbooks" in verification_slice["requiredVerification"]
    assert "GET /supervisor/verification-readiness-report" in verification_slice["relatedReports"]
    assert "docs/workflows/implementation-evidence-boundary.md" in verification_slice["relatedDocs"]
    assert "docs/handoffs/current.md" not in verification_slice["relatedDocs"]
    assert {check["checkId"] for check in verification_slice["readinessChecks"]} == {
        "ready-backlog-items",
        "handoff-checkpoint-coverage",
        "full-gate-available",
    }
    handoff_coverage = next(check for check in verification_slice["readinessChecks"] if check["checkId"] == "handoff-checkpoint-coverage")
    assert "docs/workflows/current-session-runbook.md" in handoff_coverage["relatedDocs"]
    assert "docs/handoffs/current.md" not in handoff_coverage["relatedDocs"]
    assert any("local-development-handoff" in check["evidence"] for check in verification_slice["readinessChecks"])
    authority_slice = next(slice_item for slice_item in report["slices"] if slice_item["sliceId"] == "authority-blocker-maintenance-slice")
    assert authority_slice["status"] == "blocked_pending_explicit_authority_approval"
    assert {check["checkId"] for check in authority_slice["readinessChecks"]} == {
        "authority-families-blocked",
        "approval-checkpoint-indexed",
        "boundary-checks-required",
    }
    assert any(check["status"] == "blocked" for check in authority_slice["readinessChecks"])
    assert "local-provider-execution" in authority_slice["blockedBy"]
    assert "subscription-agent-launch" in authority_slice["blockedBy"]
    assert "GET /supervisor/authority-readiness-matrix-report" in authority_slice["relatedReports"]
    assert "docs/workflows/implementation-evidence-boundary.md" in authority_slice["relatedDocs"]
    assert "pnpm run check:development-runway" in report["verificationChain"]
    assert any("not execution-authority approvals" in stop_line for stop_line in report["stopLines"])
    assert any("ready safe backlog items" in action for action in report["nextSafeActions"])
    assert any("larger PRs" in action for action in report["nextSafeActions"])


def test_runtime_evidence_review_report_indexes_work_item_exports_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "runtime-evidence-review-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Review runtime evidence index",
                "requestedOutcome": "Create attempt evidence for runtime review.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]
        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/runtime-evidence-review-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert attempt_response.status_code == 200
    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "runtime-evidence-review-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert "GET /supervisor/runtime-evidence-review-report" in report["relatedReports"]
    assert "docs/workflows/implementation-evidence-boundary.md" in report["relatedDocs"]
    assert "/controls#runtime-evidence-review-report" in report["dashboardAnchors"]
    assert "reviewQueue" in report
    assert report["reviewQueue"]
    review_item = next(item for item in report["workItems"] if item["workItemId"] == work_item_id)
    assert review_item["title"] == "Review runtime evidence index"
    assert review_item["attemptCount"] == 1
    assert review_item["eventCount"] >= 2
    assert review_item["relatedReportCount"] == len(report["relatedReports"])
    assert "GET /supervisor/runtime-evidence-review-report" in review_item["relatedReports"]
    assert "docs/workflows/implementation-evidence-boundary.md" in review_item["relatedDocs"]
    assert "/controls#runtime-evidence-review-report" in review_item["dashboardAnchors"]
    assert review_item["runtimeExportHref"] == f"/work-items/{work_item_id}#runtime-evidence-export"
    assert review_item["reviewPriority"] in {"P0", "P1"}
    assert "Runtime evidence" in review_item["reviewReason"]
    assert any("not execution-authority approval" in stop_line for stop_line in report["stopLines"])
    assert any("highest-priority review queue item" in action for action in report["nextSafeActions"])


def test_authority_readiness_matrix_report_maps_blocked_authority_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "authority-readiness-matrix-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/authority-readiness-matrix-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "authority-readiness-matrix-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert {finding["findingId"] for finding in report["currentStateFindings"]} == {
        "planning-reconciliation-current",
        "pr-103-review-gated",
    }
    pr_finding = next(finding for finding in report["currentStateFindings"] if finding["findingId"] == "pr-103-review-gated")
    assert pr_finding["status"] == "ci_green_external_review_blocked"
    assert any("mergeStateStatus=BLOCKED" in evidence for evidence in pr_finding["evidence"])
    assert any("Local story completion is recorded" in evidence for evidence in pr_finding["evidence"])
    assert any("merged into codex/epic-10-delivery-cleanup-plans, not directly into main" in evidence for evidence in pr_finding["evidence"])
    assert any("Merged-to-main state remains false" in evidence for evidence in pr_finding["evidence"])
    packet = report["nextLaneDecisionPacket"]
    assert packet["packetId"] == "epic-11-next-lane-authority-decision-contract"
    assert packet["status"] == "decision_only_no_authority_granted"
    assert packet["approvalRequired"] is True
    assert packet["noAuthorityGranted"] is True
    assert "docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract" in packet["packetPath"]
    assert any("Do not treat the decision packet recommendation as approval" in stop_line for stop_line in packet["stopLines"])
    assert {family["familyId"] for family in report["families"]} == {
        "local-provider-execution",
        "subscription-agent-launch",
        "premium-execution",
        "adaptive-scoring",
        "worker-command-source-network-credentials",
        "remote-delivery-automation",
        "github-delivery",
        "cleanup-automation",
    }
    for family in report["families"]:
        assert family["rollbackPath"].strip()
        assert family["requiredApprovals"]
        assert family["requiredEvidence"]
        assert family["relatedReports"]
        assert family["relatedDocs"]
        assert family["stopLines"]
    provider_family = next(family for family in report["families"] if family["familyId"] == "local-provider-execution")
    assert provider_family["status"] == "blocked_pending_explicit_approval"
    assert provider_family["blockedStories"] == [
        "docs/workflows/implementation-evidence-boundary.md"
    ]
    assert "GET /supervisor/disabled-provider-proofs" in provider_family["relatedReports"]
    assert "no-call fixture evidence" in provider_family["rollbackPath"]
    launch_family = next(family for family in report["families"] if family["familyId"] == "subscription-agent-launch")
    assert "docs/workflows/implementation-evidence-boundary.md" in launch_family["blockedStories"]
    assert "/controls#maintenance-action-plan-report" in launch_family["dashboardAnchors"]
    scoring_family = next(family for family in report["families"] if family["familyId"] == "adaptive-scoring")
    assert scoring_family["status"] == "blocked_pending_explicit_approval"
    assert "GET /supervisor/development-runway-report" in scoring_family["relatedReports"]
    assert any("Do not run adaptive scoring" in stop_line for stop_line in scoring_family["stopLines"])
    command_family = next(family for family in report["families"] if family["familyId"] == "worker-command-source-network-credentials")
    assert command_family["status"] == "blocked_by_default"
    assert any("Blocked command classes" in evidence for evidence in command_family["requiredEvidence"])
    remote_family = next(family for family in report["families"] if family["familyId"] == "remote-delivery-automation")
    assert "GET /supervisor/delivery-readiness-policy-report" in remote_family["relatedReports"]
    delivery_family = next(family for family in report["families"] if family["familyId"] == "github-delivery")
    assert delivery_family["status"] == "evidence_ready_approval_required"
    assert "docs/workflows/implementation-evidence-boundary.md" in delivery_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in delivery_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in delivery_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in delivery_family["relatedDocs"]
    assert any("cleanup plan" in evidence for evidence in delivery_family["requiredEvidence"])
    assert any("PR #103" in evidence for evidence in delivery_family["requiredEvidence"])
    assert "dry-run planning" in delivery_family["rollbackPath"]
    cleanup_family = next(family for family in report["families"] if family["familyId"] == "cleanup-automation")
    assert cleanup_family["status"] == "blocked_pending_explicit_approval"
    assert "GET /supervisor/local-cleanup-readiness-report" in cleanup_family["relatedReports"]
    assert "GET /supervisor/remote-cleanup-sync-readiness-report" in cleanup_family["relatedReports"]
    assert "docs/workflows/implementation-evidence-boundary.md" in cleanup_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in cleanup_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in cleanup_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in cleanup_family["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in cleanup_family["relatedDocs"]
    assert any("Low-risk delivery dry-run plan" in evidence for evidence in cleanup_family["requiredEvidence"])
    assert any("Delivery execution evidence" in evidence for evidence in cleanup_family["requiredEvidence"])
    assert any("Trusted authority ledger" in evidence for evidence in cleanup_family["requiredEvidence"])
    assert any("Do not remove worktrees" in stop_line for stop_line in cleanup_family["stopLines"])
    assert "leave the target untouched" in cleanup_family["rollbackPath"]
    assert {step["stepId"] for step in report["readinessLadder"]} == {
        "explicit-authority-approval",
        "evidence-surface-alignment",
        "implementation-remains-disabled",
    }
    assert any("not execution-authority approvals" in stop_line for stop_line in report["stopLines"])
    assert any("explicit operator approval" in action for action in report["nextSafeActions"])


def test_safe_development_backlog_report_prioritizes_large_safe_slices_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "safe-development-backlog.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    def quote_identifier(value: str) -> str:
        return f'"{value.replace(chr(34), chr(34) * 2)}"'

    def persistence_snapshot() -> dict[str, list[str]]:
        with sqlite3.connect(db_path) as conn:
            table_names = {
                row[0]
                for row in conn.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").fetchall()
                if row and row[0]
            }
            snapshot: dict[str, list[str]] = {}
            for table in sorted(table_names):
                rows = conn.execute(f"select * from {quote_identifier(table)}").fetchall()
                snapshot[table] = sorted(json.dumps(row, default=str) for row in rows)
            return snapshot

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        before_snapshot = persistence_snapshot()
        response = client.get("/supervisor/safe-development-backlog")
        after_first_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        after_first_snapshot = persistence_snapshot()
        response_again = client.get("/supervisor/safe-development-backlog")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        after_snapshot = persistence_snapshot()

    assert response.status_code == 200
    assert response_again.status_code == 200
    assert before_events == after_first_events
    assert before_snapshot == after_first_snapshot
    assert after_first_events == after_events
    assert after_first_snapshot == after_snapshot
    assert before_events == after_events
    assert before_snapshot == after_snapshot

    report = response.json()["data"]
    assert report["reportId"] == "safe-development-backlog-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert {item["itemId"] for item in report["items"]} == {
        "safe-backlog-report-alignment",
        "verification-surface-hardening",
        "github-delivery-hygiene",
        "read-only-evidence-polish",
        "authority-blocked-work",
    }
    ready_items = [item for item in report["items"] if item["status"] == "ready"]
    assert all(item["recommendedSliceSize"] in {"large", "medium_to_large"} for item in ready_items)
    blocked_item = next(item for item in report["items"] if item["itemId"] == "authority-blocked-work")
    assert blocked_item["status"] == "blocked_pending_explicit_approval"
    assert blocked_item["recommendedSliceSize"] == "do_not_start"
    assert "explicit operator approval naming authority and scope" in blocked_item["blockedBy"]
    verification_item = next(item for item in report["items"] if item["itemId"] == "verification-surface-hardening")
    assert "/controls#verification-readiness-report" in verification_item["dashboardAnchors"]
    assert "/controls#development-runway-report" in verification_item["dashboardAnchors"]
    assert "docs/workflows/implementation-evidence-boundary.md" in verification_item["relatedDocs"]
    assert verification_item["relatedDocs"] == ["docs/workflows/implementation-evidence-boundary.md"]
    assert len(verification_item["relatedDocs"]) == len(set(verification_item["relatedDocs"]))
    assert verification_item["sourceEvidenceLabels"] == [
        "3-27-safe-development-backlog-report.md",
        "3-32-safe-development-backlog-drift-check.md",
        "3-47-core-readiness-drift-checks.md",
        "3-56-verification-execution-plan-groups.md",
        "3-58-verification-handoff-checkpoints.md",
        "3-60-safe-backlog-report-anchors.md",
    ]
    assert len(verification_item["sourceEvidenceLabels"]) == len(set(verification_item["sourceEvidenceLabels"]))
    assert verification_item["relatedReports"] == [
        "GET /supervisor/verification-readiness-report",
        "GET /supervisor/dashboard-e2e-report",
    ]
    assert verification_item["dashboardAnchors"] == [
        "/controls#verification-readiness-report",
        "/controls#dashboard-e2e-report",
        "/controls#supervisor-report-catalog",
        "/controls#development-runway-report",
    ]
    github_item = next(item for item in report["items"] if item["itemId"] == "github-delivery-hygiene")
    assert github_item["recommendedSliceSize"] == "large"
    assert "GET /supervisor/github-workflow-policy-report" in github_item["relatedReports"]
    assert "GET /supervisor/delivery-readiness-policy-report" in github_item["relatedReports"]
    assert "/controls#github-workflow-policy-report" in github_item["dashboardAnchors"]
    assert "/controls#delivery-readiness-policy-report" in github_item["dashboardAnchors"]
    assert "docs/workflows/implementation-evidence-boundary.md" in github_item["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in github_item["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in github_item["relatedDocs"]
    assert any("plaintext gh token" in evidence for evidence in github_item["evidence"])
    evidence_item = next(item for item in report["items"] if item["itemId"] == "read-only-evidence-polish")
    assert "/controls#supervisor-report-catalog" in evidence_item["dashboardAnchors"]
    assert "docs/workflows/implementation-evidence-boundary.md" in evidence_item["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in evidence_item["relatedDocs"]
    assert "docs/workflows/implementation-evidence-boundary.md" in evidence_item["relatedDocs"]
    assert "GET /supervisor/maintenance-readiness-report" in report["items"][0]["relatedReports"]
    assert "/controls#maintenance-readiness-report" in report["items"][0]["dashboardAnchors"]
    assert any("not execution-authority approvals" in stop_line for stop_line in report["stopLines"])
    assert any("large enough" in action for action in report["nextSafeActions"])
    assert any("GitHub delivery hygiene" in action for action in report["nextSafeActions"])


def test_disabled_provider_proofs_are_provider_specific_and_non_calling(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "disabled-provider-proofs.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/disabled-provider-proofs")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    proofs = response.json()["data"]
    assert {proof["workerId"] for proof in proofs} == {
        "local.ollama.disabled",
        "local.lmstudio.disabled",
        "local.vllm.disabled",
        "local.llamacpp.disabled",
    }
    endpoint_families = {proof["workerId"]: proof["endpointFamily"] for proof in proofs}
    assert endpoint_families == {
        "local.ollama.disabled": "ollama_openai_compatible_localhost",
        "local.lmstudio.disabled": "lm_studio_openai_compatible_localhost",
        "local.vllm.disabled": "vllm_openai_compatible_localhost",
        "local.llamacpp.disabled": "llamacpp_openai_compatible_localhost",
    }
    for proof in proofs:
        if proof["workerId"] == "local.ollama.disabled":
            assert proof["disabledReason"] == "ollama_provider_gate_not_enabled"
        else:
            assert proof["disabledReason"].endswith("_local_provider_not_enabled")
        assert proof["endpointFamily"].endswith("_openai_compatible_localhost")
        assert proof["endpointPolicy"].startswith("deny_all")
        assert proof["httpCallsAttempted"] is False
        assert proof["modelCallsAttempted"] is False
        assert proof["networkAccessAttempted"] is False
        assert proof["credentialAccessAttempted"] is False
        assert any(check.endswith("_prompt_fixture_excludes_env_values") for check in proof["redactionChecks"])
        assert proof["timeoutPolicy"].startswith("disabled_fixture_requires")
        assert proof["cancellationPolicy"].startswith("disabled_fixture_requires")
        assert proof["retentionPolicy"].startswith("disabled_fixture_forbids")

    ollama = next(proof for proof in proofs if proof["workerId"] == "local.ollama.disabled")
    assert ollama["registryState"] == "disabled"
    assert ollama["broadGateEnabled"] is False
    assert ollama["providerSpecificGateEnabled"] is False
    assert ollama["modelIdConfigured"] is False
    assert ollama["adapterReady"] is False
    assert ollama["rawPromptRetentionAllowed"] is False
    assert ollama["rawCompletionRetentionAllowed"] is False
    assert ollama["promptConstructionSources"] == [
        "work_item_title",
        "requested_outcome",
        "routing_decision_summary",
        "workflow_event_summaries",
        "local_evidence_packet_summaries",
        "execution_attempt_metadata",
        "workspace_isolation_summary",
    ]
    assert "environment_variables" in ollama["rejectedPromptSources"]
    assert "credential_paths" in ollama["rejectedPromptSources"]
    assert "raw_prompt_text" not in ollama["retainedEvidenceClasses"]
    assert "raw_completion_text" not in ollama["retainedEvidenceClasses"]
    assert "redaction_state" in ollama["retainedEvidenceClasses"]
    assert ollama["connectTimeoutSeconds"] == 2
    assert ollama["totalTimeoutSeconds"] == 120
    assert "cancel_requested -> request_abort_recorded" in ollama["attemptStateMapping"]
    assert ollama["retryPolicy"] == "retry_requires_new_route_decision_and_fresh_approval"


def test_execution_state_boundary_keeps_queue_leases_separate_from_attempt_authority(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-state-boundary.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/execution-state-boundary")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    boundary = response.json()["data"]
    assert boundary["boundaryId"] == "queue-lease-execution-attempt-boundary-v1"
    assert boundary["queueLeaseGrantsExecutionAuthority"] is False
    assert boundary["executionAttemptLaunchesWorkers"] is False
    assert "worker_id" in boundary["forbiddenQueueLeaseFields"]
    assert "credential_reference" in boundary["forbiddenQueueLeaseFields"]
    assert any("Record route-bound worker" in role for role in boundary["executionAttemptRole"])


def test_threat_boundary_reports_redaction_command_provider_and_secret_denials_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "threat-boundary.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/threat-boundary")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    boundary = response.json()["data"]
    assert boundary["boundaryId"] == "supervisor-worker-threat-boundary-v1"
    assert boundary["status"] == "blocked_by_default"
    assert "Do not include secrets" in boundary["redactionBoundary"][1]
    assert "workflow_event_summaries" in boundary["promptConstructionSources"]
    assert "supervisor_internal_utility_functions" in boundary["allowedCommandClasses"]
    assert "arbitrary_shell_commands" in boundary["blockedCommandClasses"]
    assert boundary["providerEndpointPolicy"].startswith("deny_all")
    assert boundary["credentialPolicy"].startswith("forbid_worker_access")
    assert boundary["artifactPolicy"].startswith("record_artifact_references")
    assert {rule["ruleId"] for rule in boundary["rules"]} == {
        "prompt-redaction-boundary",
        "command-allowlist",
        "provider-network-deny",
        "credential-deny",
        "artifact-boundary",
    }
    assert boundary["processLaunchAllowed"] is False
    assert boundary["providerCallsAllowed"] is False
    assert boundary["modelCallsAllowed"] is False
    assert boundary["premiumExecutionAllowed"] is False
    assert boundary["commandExecutionAllowed"] is False
    assert boundary["sourceMutationAllowed"] is False
    assert boundary["networkAllowed"] is False
    assert boundary["credentialAccessAllowed"] is False
    assert before_events == after_events


def test_local_evidence_packet_preview_is_non_mutating_and_bounded(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "local-evidence-packet.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        first_response = client.get(f"/work-items/{work_item_id}/local-evidence-packet")
        second_response = client.get(f"/work-items/{work_item_id}/local-evidence-packet")
        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert before_item == after_item
    assert before_events == after_events

    packet = first_response.json()["data"]
    assert packet["packetId"].startswith("local-evidence-packet-route-")
    assert packet["workItemId"] == work_item_id
    assert packet["taskKind"] == "evidence_summary"
    assert packet["stepId"] == "evidence-packet"
    assert packet["route"]["selectedLane"] == "local_readonly"
    assert packet["route"]["authorityMode"] == "advisory"
    assert packet["writesAllowed"] is False
    assert packet["commandsAllowed"] is False
    assert "apps/dashboard" in packet["allowedPaths"]
    assert "pnpm run check" in packet["validationCommands"]
    assert packet["evidence"]
    assert all("eventType" in evidence for evidence in packet["evidence"])
    assert any("Do not include secrets" in note for note in packet["redactionNotes"])
    assert any("file writes are not allowed" in boundary for boundary in packet["boundaries"])
    assert any("Provider endpoints policy: deny_all" in boundary for boundary in packet["boundaries"])
    assert any("Credential policy: forbid_worker_access" in boundary for boundary in packet["boundaries"])


def test_mock_local_readonly_worker_preview_is_deterministic_and_non_mutating(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "mock-local-readonly-worker.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        first_response = client.post(f"/work-items/{work_item_id}/local-readonly-worker-preview")
        second_response = client.post(f"/work-items/{work_item_id}/local-readonly-worker-preview")
        registry_response = client.get("/routing/worker-registry")
        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert registry_response.status_code == 200
    assert first_response.json() == second_response.json()
    assert before_item == after_item
    assert before_events == after_events

    preview = first_response.json()["data"]
    assert preview["workerId"] == "local.readonly.mock"
    assert preview["runId"] == "mock-local-readonly-" + work_item_id
    assert preview["status"] == "succeeded"
    assert preview["packetId"] == preview["packet"]["packetId"]
    assert preview["packet"]["route"]["selectedLane"] == "local_readonly"
    assert preview["writesAllowed"] is False
    assert preview["commandsAllowed"] is False
    assert "deterministic boundary validation" in preview["recommendations"][0]
    assert "Mock local read-only worker reviewed" in preview["summary"]

    workers = {worker["workerId"]: worker for worker in registry_response.json()["data"]}
    assert workers["local.readonly.mock"]["health"] == "online"
    assert workers["local.readonly.mock"]["disabledReason"] is None

def test_local_evidence_explanation_generation_is_non_mutating(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "local-evidence-explanation.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={"stepId": "evidence", "taskKind": "evidence_summary"},
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    explanation = response.json()["data"]
    assert explanation["explanationId"].startswith("local-evidence-route-")
    assert explanation["workItemId"] == work_item_id
    assert explanation["taskKind"] == "evidence_summary"
    assert explanation["stepId"] == "evidence"
    assert explanation["route"]["selectedLane"] == "local_readonly"
    assert explanation["writesAllowed"] is False
    assert explanation["commandsAllowed"] is False
    assert explanation["evidence"]
    assert any("Read-only" in boundary for boundary in explanation["boundaries"])
    assert explanation["nextStepSuggestions"]
    assert before_item == after_item
    assert before_events == after_events


def test_local_evidence_explanation_can_record_workflow_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "local-evidence-explanation-event.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={"taskKind": "validation_failure_analysis", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert len(after_events) == len(before_events) + 1
    event = after_events[0]
    assert event["eventType"] == "routing.local_evidence_explained"
    assert event["payload"]["taskKind"] == "validation_failure_analysis"
    assert event["payload"]["selectedLane"] == "local_readonly"
    assert event["payload"]["writesAllowed"] is False
    assert event["payload"]["commandsAllowed"] is False
    assert event["payload"]["evidenceCount"] >= 1


def test_local_evidence_explanation_rejects_non_readonly_route(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "local-evidence-explanation-reject.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/local-evidence-explanation",
            json={"taskKind": "architecture_review", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 409
    assert response.json()["detail"]["error"]["code"] == "invalid_local_evidence_explanation"
    assert "local_readonly" in response.json()["detail"]["error"]["message"]
    assert before_events == after_events

def test_premium_approval_request_generation_is_non_mutating(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "premium-approval-request.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/premium-approval-request",
            json={
                "stepId": "security",
                "taskKind": "security_review",
                "approvalReason": "Potential security impact needs premium scrutiny.",
            },
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    request = response.json()["data"]
    assert request["approvalRequestId"].startswith("premium-approval-route-")
    assert request["workItemId"] == work_item_id
    assert request["taskKind"] == "security_review"
    assert request["stepId"] == "security"
    assert request["requestedLane"] == "premium_approval"
    assert request["route"]["selectedLane"] == "subscription_handoff"
    assert request["approvalReason"] == "Potential security impact needs premium scrutiny."
    assert request["executionAllowed"] is False
    assert any("Secrets" in item for item in request["approvalChecklist"])
    assert any("executionAllowed is false" in item for item in request["riskControls"])
    assert before_item == after_item
    assert before_events == after_events


def test_premium_approval_request_can_record_workflow_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "premium-approval-request-event.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/premium-approval-request",
            json={"taskKind": "architecture_review", "approvalReason": "Architecture decision is high impact.", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert len(after_events) == len(before_events) + 1
    event = after_events[0]
    assert event["eventType"] == "routing.premium_approval_requested"
    assert event["payload"]["taskKind"] == "architecture_review"
    assert event["payload"]["selectedLane"] == "premium_approval"
    assert event["payload"]["sourceRouteLane"] == "subscription_handoff"
    assert event["payload"]["executionAllowed"] is False
    assert event["payload"]["approvalReason"] == "Architecture decision is high impact."


def test_premium_approval_request_rejects_ineligible_task_kind(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "premium-approval-request-reject.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/premium-approval-request",
            json={"taskKind": "path_scope_check", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 409
    assert response.json()["detail"]["error"]["code"] == "invalid_premium_approval_request"
    assert "not eligible" in response.json()["detail"]["error"]["message"]
    assert before_events == after_events

def test_subscription_agent_launch_stub_generation_is_non_mutating(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-stub.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"stepId": "implementation", "taskKind": "bounded_recipe_implementation", "requestedAgent": "codex"},
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    stub = response.json()["data"]
    assert stub["launchStubId"].startswith("subscription-agent-stub-route-")
    assert stub["workerId"] == "subscription.agent.disabled"
    assert stub["requestedAgent"] == "codex"
    assert stub["route"]["selectedLane"] == "subscription_handoff"
    assert stub["disabledReason"] == "subscription_agent_process_launch_not_enabled"
    assert stub["processLaunchAllowed"] is False
    assert stub["executionAllowed"] is False
    assert stub["estimate"]["cost"] == "subscription_plan_usage_only"
    assert any("Do not include secrets" in instruction for instruction in stub["launchInstructions"])
    assert any("Operator approval" in approval for approval in stub["requiredApprovals"])
    assert stub["targetRegistry"][0]["targetId"] == "codex.subscription.disabled"
    assert all(target["enabled"] is False for target in stub["targetRegistry"])
    assert stub["approvalBinding"]["workItemId"] == work_item_id
    assert stub["approvalBinding"]["targetId"] == "codex.subscription.disabled"
    assert stub["approvalBinding"]["workspacePlanId"] == stub["workspaceContract"]["workspacePlanId"]
    assert stub["approvalBinding"]["launchPolicyId"] == "epic-8-first-subscription-launch-policy-v1"
    assert stub["approvalBinding"]["truncationPolicy"] == "truncate_to_approved_artifact_limits"
    assert stub["approvalBinding"]["startupTimeoutSeconds"] == 10
    assert stub["approvalBinding"]["runTimeoutSeconds"] == 30
    assert stub["approvalBinding"]["cancellationTimeoutSeconds"] == 5
    assert "permissionEnvelope" in stub["approvalBinding"]["staleTrackedFields"]
    assert "heartbeatPolicy" in stub["approvalBinding"]["staleTrackedFields"]
    assert stub["approvalBinding"]["staleApprovalConsequence"] == "block_launch_and_require_new_exact_approval"
    assert stub["readinessEvidence"]["status"] == "blocked_pending_exact_launch_approval"
    assert stub["readinessEvidence"]["launchPolicyId"] == "epic-8-first-subscription-launch-policy-v1"
    assert set(stub["readinessEvidence"]["blockedReasonIds"]) == {
        "launch_policy_not_approved",
        "missing_approval_actor",
        "missing_approval_timestamp",
        "missing_approval_expiry",
        "permission_envelope_not_approved",
        "command_template_not_executable",
        "real_process_launch_not_approved",
    }
    assert stub["readinessEvidence"]["missingEnvelopeFields"] == [
        "approvalActor",
        "approvalTimestamp",
        "approvalExpiry",
    ]
    assert stub["readinessEvidence"]["rejectedEnvelopeFields"] == {
        "permissionEnvelope": "not_approved_for_real_launch",
        "commandTemplateExecutionStatus": "not_executable_by_kendall",
        "processLaunchPermission": "not_approved",
    }
    assert stub["readinessEvidence"]["staleEnvelopeFields"] == []
    assert stub["readinessEvidence"]["commandTemplateId"] == "codex-subscription-cli-template-disabled-v1"
    assert stub["readinessEvidence"]["commandTemplateExecutable"] is False
    assert stub["approvalBinding"]["verificationCommand"] == "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch"
    assert stub["workspaceContract"]["materializationMode"] == "artifact_only_no_workspace_created"
    assert stub["workspaceContract"]["environmentPolicy"] == "deny_inheritance_allowlist_only"
    assert ".ssh" in stub["workspaceContract"]["forbiddenPaths"]
    assert stub["workspaceContract"]["commandsAllowed"] is False
    assert stub["workspaceContract"]["credentialAccessAllowed"] is False
    assert stub["outputContract"]["rawOutputStored"] is False
    assert stub["outputContract"]["artifactReferenceOnly"] is True
    assert stub["outputContract"]["boundedByteCounts"] == {"stdout": 0, "stderr": 0, "generatedFiles": 2}
    assert {artifact["artifactKind"] for artifact in stub["outputContract"]["artifactReferences"]} == {
        "simulated_output_summary",
        "simulated_generated_patch",
    }
    assert all(artifact["operatorReviewRequired"] is True for artifact in stub["outputContract"]["artifactReferences"])
    assert stub["outputContract"]["artifactReferences"][0]["rawPayloadStored"] is False
    assert stub["outputContract"]["artifactReferences"][1]["applied"] is False
    assert stub["outputContract"]["generatedPatchHandling"] == "artifact_only_operator_review_required"
    assert stub["lifecycleEvidence"]["processLaunchAttempted"] is False
    assert stub["lifecycleEvidence"]["shellExecutionAttempted"] is False
    assert stub["lifecycleEvidence"]["credentialAccessAttempted"] is False
    assert stub["lifecycleEvidence"]["commandTemplateExecutable"] is False
    assert stub["lifecycleEvidence"]["dryRunMode"] == "disabled_metadata_only"
    assert "timed_out -> terminal_timed_out_without_process" in stub["lifecycleEvidence"]["stateMapping"]
    assert "completed -> terminal_completed_without_process" in stub["lifecycleEvidence"]["stateMapping"]
    assert "rejected -> terminal_rejected_without_process" in stub["lifecycleEvidence"]["stateMapping"]
    assert stub["lifecycleEvidence"]["heartbeatPolicy"] == "heartbeat_metadata_only_no_process_polling"
    assert stub["lifecycleEvidence"]["childProcessTreeTrackingPolicy"] == "no_child_process_tree_created_tracking_metadata_only"
    assert stub["lifecycleEvidence"]["orphanDetectionPolicy"] == "orphan_detection_records_no_process_tree_to_scan"
    assert stub["lifecycleEvidence"]["terminalStateReconciliationPolicy"] == "terminal_reconciliation_metadata_only_without_process_status"
    assert stub["lifecycleEvidence"]["idempotentCleanupPolicy"] == "cleanup_is_metadata_only_and_idempotent_without_deletion"
    assert stub["lifecycleEvidence"]["rollbackPolicy"] == "rollback_records_global_disable_without_resource_deletion"
    assert before_item == after_item
    assert before_events == after_events


def test_subscription_agent_launch_stub_can_record_workflow_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-stub-event.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "claude", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert len(after_events) == len(before_events) + 1
    event = after_events[0]
    assert event["eventType"] == "routing.subscription_agent_launch_stub_created"
    assert event["payload"]["selectedLane"] == "subscription_agent"
    assert event["payload"]["sourceRouteLane"] == "subscription_handoff"
    assert event["payload"]["workerId"] == "subscription.agent.disabled"
    assert event["payload"]["requestedAgent"] == "claude"
    assert event["payload"]["targetId"] == "claude.subscription.disabled"
    assert event["payload"]["workspacePlanId"].startswith("subscription-workspace-plan-route-")
    assert event["payload"]["commandTemplateExecutable"] is False
    assert event["payload"]["processLaunchAttempted"] is False
    assert event["payload"]["shellExecutionAttempted"] is False
    assert event["payload"]["credentialAccessAttempted"] is False
    assert event["payload"]["externalSendAttempted"] is False
    assert event["payload"]["processLaunchAllowed"] is False
    assert event["payload"]["executionAllowed"] is False
    assert event["payload"]["readinessStatus"] == "blocked_pending_exact_launch_approval"
    assert set(event["payload"]["blockedReasonIds"]) == {
        "launch_policy_not_approved",
        "missing_approval_actor",
        "missing_approval_timestamp",
        "missing_approval_expiry",
        "permission_envelope_not_approved",
        "command_template_not_executable",
        "real_process_launch_not_approved",
    }
    assert event["payload"]["missingEnvelopeFields"] == [
        "approvalActor",
        "approvalTimestamp",
        "approvalExpiry",
    ]
    assert event["payload"]["rejectedEnvelopeFields"]["permissionEnvelope"] == "not_approved_for_real_launch"
    assert event["payload"]["staleEnvelopeFields"] == []
    assert "planned -> disabled_precheck_recorded" in event["payload"]["stateMapping"]
    assert "running -> simulated_running_rejected_without_spawn" in event["payload"]["stateMapping"]
    assert set(event["payload"]["terminalStates"]) == {"cancelled", "timed_out", "failed", "completed", "rejected"}
    assert event["payload"]["lifecyclePolicyResults"]["heartbeatPolicy"] == "heartbeat_metadata_only_no_process_polling"
    assert event["payload"]["lifecyclePolicyResults"]["childProcessTreeTrackingPolicy"] == "no_child_process_tree_created_tracking_metadata_only"
    assert event["payload"]["lifecyclePolicyResults"]["orphanDetectionPolicy"] == "orphan_detection_records_no_process_tree_to_scan"
    assert event["payload"]["lifecyclePolicyResults"]["terminalStateReconciliationPolicy"] == "terminal_reconciliation_metadata_only_without_process_status"
    assert event["payload"]["lifecyclePolicyResults"]["idempotentCleanupPolicy"] == "cleanup_is_metadata_only_and_idempotent_without_deletion"
    assert event["payload"]["lifecyclePolicyResults"]["rollbackPolicy"] == "rollback_records_global_disable_without_resource_deletion"
    assert event["payload"]["outputArtifactSummary"]["artifactReferenceOnly"] is True
    assert event["payload"]["outputArtifactSummary"]["workflowEventRawOutputAllowed"] is False
    assert event["payload"]["outputArtifactSummary"]["rawOutputStored"] is False
    assert {artifact["artifactKind"] for artifact in event["payload"]["outputArtifactSummary"]["artifactReferences"]} == {
        "simulated_output_summary",
        "simulated_generated_patch",
    }
    assert "rawStdout" not in event["payload"]
    assert "rawStderr" not in event["payload"]
    assert "generatedPatch" not in event["payload"]


def test_subscription_agent_launch_request_rejects_missing_exact_approval_before_process_start(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-missing-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True},
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "rejected_missing_exact_approval"
    assert launch["approvalAccepted"] is False
    assert launch["processLaunchAllowed"] is False
    assert launch["executionAllowed"] is False
    assert launch["processLaunchAttempted"] is False
    assert launch["shellExecutionAttempted"] is False
    assert launch["credentialAccessAttempted"] is False
    assert "approvalActor" in launch["missingEnvelopeFields"]
    assert "approvalTimestamp" in launch["missingEnvelopeFields"]
    assert "approvalExpiry" in launch["missingEnvelopeFields"]
    assert "permissionEnvelope" in launch["missingEnvelopeFields"]
    assert "real_process_launch_not_approved" in launch["blockedReasonIds"]
    assert launch["nextSafeAction"] == "Fill approvalActor before exact launch approval can be requested."
    assert launch["approvalBinding"]["approvalActor"] is None
    assert launch["approvalBinding"]["approvalTimestamp"] is None
    assert launch["approvalBinding"]["approvalExpiry"] is None
    assert launch["approvalBinding"]["permissionEnvelope"] is None

    event = events[0]
    assert event["eventType"] == "routing.subscription_agent_launch_rejected"
    assert event["payload"]["status"] == "rejected_missing_exact_approval"
    assert event["payload"]["approvalBinding"]["approvalActor"] is None
    assert event["payload"]["approvalBinding"]["approvalTimestamp"] is None
    assert event["payload"]["approvalBinding"]["approvalExpiry"] is None
    assert event["payload"]["approvalBinding"]["permissionEnvelope"] is None
    assert event["payload"]["processLaunchAttempted"] is False
    assert event["payload"]["shellExecutionAttempted"] is False
    assert event["payload"]["credentialAccessAttempted"] is False
    assert "rawStdout" not in event["payload"]
    assert "rawStderr" not in event["payload"]
    assert "generatedPatch" not in event["payload"]


def test_subscription_agent_launch_request_default_record_event_is_read_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-read-only-evaluation.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        before_attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        )
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        after_attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "rejected_missing_exact_approval"
    assert launch["approvalAccepted"] is False
    assert launch["processLaunchAttempted"] is False
    assert launch["mutationContract"]["recordEvent"] is False
    assert launch["mutationContract"]["mode"] == "read_only_evaluation"
    assert before_events == after_events
    assert before_attempts == after_attempts


def test_subscription_agent_launch_request_record_event_true_persists_rejection_once(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-rejection-idempotent.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        payload = {"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True}
        first_response = client.post(f"/work-items/{work_item_id}/subscription-agent-launch", json=payload)
        second_response = client.post(f"/work-items/{work_item_id}/subscription-agent-launch", json=payload)
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json()["data"] == second_response.json()["data"]
    assert first_response.json()["data"]["mutationContract"]["mode"] == "mutating"
    assert first_response.json()["data"]["mutationContract"]["replayBehavior"] == "same rejection fingerprint is a stable no-op"
    rejection_events = [event for event in events if event["eventType"] == "routing.subscription_agent_launch_rejected"]
    assert len(rejection_events) == 1
    assert rejection_events[0]["payload"]["mutationContract"]["eventIdentity"]["rejection"] == first_response.json()["data"]["launchRequestId"]
    assert attempts == []


def test_subscription_agent_launch_request_records_changed_rejection_fingerprint(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-rejection-changed-fingerprint.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        first_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True},
        )
        second_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "not-a-target", "recordEvent": True},
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json()["data"]["launchRequestId"] == second_response.json()["data"]["launchRequestId"]
    assert second_response.json()["data"]["rejectedEnvelopeFields"]["requestedAgent"] == "unsupported_subscription_launch_target"
    rejection_events = [event for event in events if event["eventType"] == "routing.subscription_agent_launch_rejected"]
    assert len(rejection_events) == 2
    assert rejection_events[0]["payload"]["rejectedEnvelopeFields"]["requestedAgent"] == "unsupported_subscription_launch_target"
    assert "requestedAgent" not in rejection_events[1]["payload"]["rejectedEnvelopeFields"]


def _approved_subscription_launch_binding(stub: dict, **overrides: object) -> dict:
    allowed_fields = {
        "workItemId",
        "attemptId",
        "executionAttemptId",
        "routeDecisionId",
        "workerId",
        "lane",
        "authorityMode",
        "workspacePlanId",
        "launchPolicyId",
        "targetId",
        "commandTemplateId",
        "commandTemplateExecutionStatus",
        "approvalActor",
        "approvalTimestamp",
        "approvalExpiry",
        "permissionEnvelope",
        "environmentAllowlist",
        "blockedCredentialSessionPaths",
        "artifactLimits",
        "redactionPolicy",
        "truncationPolicy",
        "outputPolicy",
        "startupTimeoutSeconds",
        "runTimeoutSeconds",
        "cancellationTimeoutSeconds",
        "heartbeatPolicy",
        "childProcessTreeTrackingPolicy",
        "orphanDetectionPolicy",
        "terminalStateReconciliationPolicy",
        "idempotentCleanupPolicy",
        "dashboardControls",
        "rollbackPolicy",
        "verificationCommand",
        "allowedOutputMode",
    }
    approval = {key: value for key, value in stub["approvalBinding"].items() if key in allowed_fields}
    approval.update(
        {
            "executionAttemptId": approval["attemptId"],
            "approvalActor": "Operator",
            "approvalTimestamp": STORY_8_5_APPROVAL_TIMESTAMP.isoformat(),
            "approvalExpiry": STORY_8_5_APPROVAL_EXPIRY.isoformat(),
            "permissionEnvelope": "approved_for_one_artifact_only_subscription_launch",
            "commandTemplateExecutionStatus": "executable_by_kendall",
            "artifactLimits": {
                "rawOutputBytes": 0,
                "artifactReferenceOnly": True,
                "sourceMutationAllowed": False,
            },
            "outputPolicy": "artifact_references_only_no_raw_output",
            "redactionPolicy": "required",
            "truncationPolicy": "truncate_to_approved_artifact_limits",
            "startupTimeoutSeconds": 10,
            "runTimeoutSeconds": 30,
            "cancellationTimeoutSeconds": 5,
            "dashboardControls": "approval_bound_disabled_until_all_gates_green",
            "verificationCommand": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
            "allowedOutputMode": "artifact-only",
        }
    )
    approval.update(overrides)
    return approval


def _approved_subscription_runtime_binding(stub: dict, **overrides: object) -> dict:
    now = datetime.now(timezone.utc)
    attempt_id = stub["approvalBinding"]["attemptId"]
    approval_id_identity = "|".join(
        [
            "subscription-agent-launch",
            "one bounded supervised process-launch operation",
            stub["workItemId"],
            attempt_id,
            stub["approvalBinding"]["targetId"],
            stub["approvalBinding"]["commandTemplateId"],
            stub["approvalBinding"]["workspacePlanId"],
            "codex --version",
        ]
    )
    approval_id = f"subscription-runtime-approval-{uuid.uuid5(uuid.NAMESPACE_URL, approval_id_identity)}"
    approval = _approved_subscription_launch_binding(
        stub,
        approvalTimestamp=now.isoformat(),
        approvalExpiry=(now + timedelta(minutes=10)).isoformat(),
        approvalId=approval_id,
        authorityFamily="subscription-agent-launch",
        operation="one bounded supervised process-launch operation",
        commandTemplateExecutionStatus="executable_by_kendall_supervised_runtime",
        permissionEnvelope="approved_for_one_bounded_supervised_subscription_launch",
        redactionPolicy="metadata_only_no_raw_output_generated_patch_prompt_completion_provider_payload",
        allowedOutputMode="summary-and-artifact-references-only",
        commandArgv=["codex", "--version"],
        cwd=os.path.join(os.getcwd(), "_bmad-output", "subscription-runtime", attempt_id),
        retainedEvidence=["approval_instance_id", "attempt_id", "runtime_metadata", "artifact_references"],
        startupTimeoutPolicy="bounded_startup_timeout_enforced_before_process_run",
        runTimeoutPolicy="bounded_run_timeout_enforced_with_discard_only_output_counters",
        cancellationTimeoutPolicy="direct_process_kill_then_wait_without_child_tree_claims",
        heartbeatPolicy="not_enforced_for_single_bounded_probe",
        childProcessTreeTrackingPolicy="not_claimed_direct_process_only",
        orphanDetectionPolicy="not_claimed_direct_process_only",
        terminalStateReconciliationPolicy="direct_process_returncode_reconciled",
        idempotentCleanupPolicy="runtime_workspace_cleanup_deferred_no_source_or_branch_deletion",
        rollbackPolicy="disable subscription-agent process launch and return to artifact-only fixture evidence",
        stopLines=[
            "Do not use shell string execution.",
            "Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, or provider credentials.",
            "Do not call local, remote, or premium providers unless separately approved.",
            "Do not mutate source unless separately approved.",
            "Disable subscription-agent process launch if approval binding is stale.",
        ],
    )
    approval.update(overrides)
    return approval


def test_subscription_agent_launch_request_rejects_disabled_target_without_mutating_stub_contract(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-disabled-target.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "claude"},
        )
        stub = stub_response.json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={
                "taskKind": "architecture_review",
                "requestedAgent": "claude",
                "recordEvent": True,
                **approval,
            },
        )
        stub_after = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "claude"},
        ).json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "rejected_target_not_enabled"
    assert launch["approvalAccepted"] is False
    assert launch["processLaunchAttempted"] is False
    assert launch["processLaunchAllowed"] is False
    assert launch["executionAllowed"] is False
    assert launch["rejectedEnvelopeFields"]["targetStatus"] == "subscription_agent_target_not_enabled"
    assert launch["rejectedEnvelopeFields"]["processLaunchPermission"] == "not_approved"
    assert launch["outputArtifactSummary"]["artifactReferenceOnly"] is True
    assert launch["outputArtifactSummary"]["rawOutputStored"] is False
    assert stub_after["processLaunchAllowed"] is False
    assert stub_after["disabledReason"] == "subscription_agent_process_launch_not_enabled"


def test_subscription_agent_launch_request_rejects_expired_and_mismatched_exact_approval(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-expired-stale.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    approval_timestamp = datetime.now(timezone.utc) - timedelta(minutes=45)
    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(
            stub,
            approvalTimestamp=approval_timestamp.isoformat(),
            approvalExpiry=(approval_timestamp + timedelta(minutes=30)).isoformat(),
            outputPolicy="raw_output_allowed",
            artifactLimits={"notes": "raw stdout should not be retained here", "rawStdout": "do not retain this", "sourceMutationAllowed": True},
        )
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "rejected_stale_exact_approval"
    assert "approvalExpiry" in launch["staleEnvelopeFields"]
    assert "outputPolicy" in launch["staleEnvelopeFields"]
    assert "artifactLimits" in launch["staleEnvelopeFields"]
    assert launch["approvalBinding"]["artifactLimits"]["rawOutputBytes"] == 0
    assert launch["approvalBinding"]["submittedEnvelopeFields"]["artifactLimits"] == {
        "sourceMutationAllowed": True,
        "redactedUnknownKeys": True,
    }
    assert launch["rejectedEnvelopeFields"]["approvalExpiry"] == "expired"
    assert events[0]["payload"]["approvalBinding"]["submittedEnvelopeFields"]["artifactLimits"] == {
        "sourceMutationAllowed": True,
        "redactedUnknownKeys": True,
    }


def test_subscription_agent_launch_request_rejects_unknown_requested_agent(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-unknown-agent.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "not-a-target", "recordEvent": True, **approval},
        )

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "rejected_target_not_enabled"
    assert launch["rejectedEnvelopeFields"]["requestedAgent"] == "unsupported_subscription_launch_target"
    assert "subscription_agent_target_unsupported" in launch["blockedReasonIds"]


def test_subscription_agent_launch_request_accepts_exact_artifact_only_fixture_path(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-accepted-fixture.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "accepted_artifact_only_fixture_completed"
    assert launch["readinessStatus"] == "subscription_launch_fixture_completed"
    assert launch["approvalAccepted"] is True
    assert launch["processLaunchAllowed"] is True
    assert launch["executionAllowed"] is True
    assert launch["commandExecutionAllowed"] is False
    assert launch["sourceMutationAllowed"] is False
    assert launch["providerCallsAllowed"] is False
    assert launch["networkAllowed"] is False
    assert launch["credentialAccessAllowed"] is False
    assert launch["processLaunchAttempted"] is True
    assert launch["shellExecutionAttempted"] is False
    assert launch["credentialAccessAttempted"] is False
    assert launch["externalSendAttempted"] is False
    assert launch["missingEnvelopeFields"] == []
    assert launch["rejectedEnvelopeFields"] == {}
    assert launch["staleEnvelopeFields"] == []
    assert launch["blockedReasonIds"] == []
    assert launch["mutationContract"]["mode"] == "mutating"
    assert launch["mutationContract"]["eventIdentity"]["acceptedFixtureAttempt"] == approval["executionAttemptId"]
    assert launch["mutationContract"]["replayBehavior"] == "same accepted fixture attempt id is a stable no-op"
    assert launch["outputArtifactSummary"]["artifactReferenceOnly"] is True
    assert launch["outputArtifactSummary"]["rawOutputStored"] is False
    assert {artifact["artifactKind"] for artifact in launch["outputArtifactSummary"]["artifactReferences"]} == {
        "fixture_output_summary",
        "fixture_generated_patch_reference",
    }

    attempt = attempts[0]
    assert attempt["attemptId"] == approval["executionAttemptId"]
    assert attempt["status"] == "completed"
    assert attempt["completedAt"] is not None
    assert attempt["workerId"] == "subscription.agent.disabled"
    assert attempt["lane"] == "subscription_agent"
    assert attempt["authorityMode"] == "operator_approval_required"
    assert attempt["workspaceIsolationPlan"]["sourceMutationAllowed"] is False
    assert attempt["workspaceIsolationPlan"]["commandsAllowed"] is False
    assert attempt["workspaceIsolationPlan"]["networkAllowed"] is False
    assert attempt["workspaceIsolationPlan"]["credentialAccessAllowed"] is False
    assert ".env" in attempt["workspaceIsolationPlan"]["forbiddenPaths"]
    assert ".ssh" in attempt["workspaceIsolationPlan"]["forbiddenPaths"]
    assert ".claude" in attempt["workspaceIsolationPlan"]["forbiddenPaths"]
    assert ".codex" in attempt["workspaceIsolationPlan"]["forbiddenPaths"]
    assert attempt["workspaceIsolationPlan"]["sessionBoundary"] == "forbid_shell_profiles_ssh_browser_tokens_and_subscription_sessions"

    launch_events = [event for event in events if event["eventType"].startswith("execution_attempt.subscription_launch_fixture")]
    expected_launch_event_types = [
        "execution_attempt.subscription_launch_fixture_started",
        "execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
        "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
        "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
        "execution_attempt.subscription_launch_fixture_completed",
    ]
    assert {event["eventType"] for event in launch_events} == set(expected_launch_event_types)
    for event in launch_events:
        assert event["payload"]["processLaunchAttempted"] is True
        assert event["payload"]["shellExecutionAttempted"] is False
        assert event["payload"]["commandExecutionAllowed"] is False
        assert event["payload"]["credentialAccessAttempted"] is False
        assert event["payload"]["sourceMutationAllowed"] is False
        assert event["payload"]["rawOutputStored"] is False
        assert event["payload"]["timeoutPolicy"] == "timeout_records_terminal_evidence_without_process_signal"
        assert event["payload"]["cancellationPolicy"] == "cancellation_records_terminal_evidence_without_os_signal"
        assert event["payload"]["cleanupPolicy"] == "no_process_no_workspace_materialized_cleanup_metadata_only"
        assert event["payload"]["stateMapping"] == [
            "planned -> disabled_precheck_recorded",
            "approved -> approval_binding_recorded_without_launch",
            "starting -> simulated_start_rejected_without_spawn",
            "running -> simulated_running_rejected_without_spawn",
            "cancel_requested -> cancellation_recorded_without_signal",
            "cancelled -> terminal_cancelled_without_process",
            "timed_out -> terminal_timed_out_without_process",
            "failed -> terminal_failure_without_process",
            "completed -> terminal_completed_without_process",
            "rejected -> terminal_rejected_without_process",
        ]
        assert event["payload"]["terminalStates"] == ["cancelled", "timed_out", "failed", "completed", "rejected"]
        assert event["payload"]["lifecyclePolicyResults"]["heartbeatPolicy"] == "heartbeat_metadata_only_no_process_polling"
        assert event["payload"]["lifecyclePolicyResults"]["orphanDetectionPolicy"] == "orphan_detection_records_no_process_tree_to_scan"
        assert event["payload"]["lifecyclePolicyResults"]["terminalStateReconciliationPolicy"] == "terminal_reconciliation_metadata_only_without_process_status"
        assert event["payload"]["lifecyclePolicyResults"]["idempotentCleanupPolicy"] == "cleanup_is_metadata_only_and_idempotent_without_deletion"
        assert event["payload"]["lifecyclePolicyResults"]["rollbackPolicy"] == "rollback_records_global_disable_without_resource_deletion"
        assert ".ssh" in event["payload"]["workspaceContract"]["forbiddenPaths"]
        assert ".config/google-chrome" in event["payload"]["workspaceContract"]["forbiddenPaths"]
        assert "rawStdout" not in event["payload"]
        assert "rawStderr" not in event["payload"]
        assert "generatedPatch" not in event["payload"]
    assert {event_ref["eventId"] for event_ref in attempt["eventRefs"]} == {event["id"] for event in launch_events}


def test_subscription_agent_runtime_rejects_missing_exact_approval_before_adapter_call(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-runtime-missing-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    adapter_calls = {"count": 0}

    async def fake_run(self, **kwargs):
        adapter_calls["count"] += 1
        raise AssertionError("Runtime adapter must not run without exact approval.")

    monkeypatch.setattr("supervisor.domain.subscription_launch.SupervisedSubscriptionLaunchAdapter.run", fake_run)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True},
        )

    assert response.status_code == 200
    launch = response.json()["data"]
    assert adapter_calls["count"] == 0
    assert launch["approvalAccepted"] is False
    assert launch["processLaunchAttempted"] is False
    assert launch["commandExecutionAllowed"] is False
    assert launch["runtimeEvidence"] == {}


def test_subscription_agent_runtime_accepts_exact_approval_and_records_metadata_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-runtime-exact-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    from supervisor.domain.subscription_launch import SupervisedSubscriptionLaunchResult

    adapter_calls = {"count": 0, "kwargs": None}

    async def fake_run(self, **kwargs):
        adapter_calls["count"] += 1
        adapter_calls["kwargs"] = kwargs
        return SupervisedSubscriptionLaunchResult(
            status="completed",
            exit_code=0,
            stdout_byte_count=12,
            stderr_byte_count=0,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )

    monkeypatch.setattr("supervisor.domain.subscription_launch.SupervisedSubscriptionLaunchAdapter.run", fake_run)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_runtime_binding(stub)
        monkeypatch.setenv("SUPERVISOR_ACCEPTED_SUBSCRIPTION_RUNTIME_APPROVAL_IDS", str(approval["approvalId"]))
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert adapter_calls["count"] == 1
    assert adapter_calls["kwargs"]["command_argv"] == ["codex", "--version"]
    assert adapter_calls["kwargs"]["environment_allowlist"] == ["PATH"]
    assert adapter_calls["kwargs"]["cwd"].endswith(os.path.join("_bmad-output", "subscription-runtime", stub["approvalBinding"]["attemptId"]))
    assert launch["status"] == "accepted_supervised_runtime_completed"
    assert launch["readinessStatus"] == "subscription_launch_runtime_completed"
    assert launch["approvalAccepted"] is True
    assert launch["processLaunchAttempted"] is True
    assert launch["commandExecutionAllowed"] is True
    assert launch["sourceMutationAllowed"] is False
    assert launch["providerCallsAllowed"] is False
    assert launch["credentialAccessAllowed"] is False
    assert launch["runtimeEvidence"]["status"] == "completed"
    assert launch["runtimeEvidence"]["stdoutByteCount"] == 12
    assert launch["runtimeEvidence"]["rawStdoutRetained"] is False
    assert launch["runtimeEvidence"]["rawStderrRetained"] is False

    attempt = attempts[0]
    assert attempt["status"] == "completed"
    runtime_event = next(event for event in events if event["eventType"] == "execution_attempt.subscription_launch_runtime_recorded")
    assert runtime_event["payload"]["runtimeEvidence"]["status"] == "completed"
    assert runtime_event["payload"]["runtimeEvidence"]["rawStdoutRetained"] is False
    assert "rawStdoutText" not in str(runtime_event)
    assert "rawStderrText" not in str(runtime_event)
    assert "generatedPatchContent" not in str(runtime_event)


def test_subscription_agent_runtime_rejects_self_attested_unregistered_approval(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-runtime-unregistered-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    adapter_calls = {"count": 0}

    async def fake_run(self, **kwargs):
        adapter_calls["count"] += 1
        raise AssertionError("Runtime adapter must not run for unregistered approval.")

    monkeypatch.setattr("supervisor.domain.subscription_launch.SupervisedSubscriptionLaunchAdapter.run", fake_run)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_runtime_binding(stub)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )

    assert response.status_code == 200
    launch = response.json()["data"]
    assert adapter_calls["count"] == 0
    assert launch["approvalAccepted"] is False
    assert "accepted-approval-instance-not-registered" in launch["rejectedEnvelopeFields"]["runtimeApproval"]


def test_subscription_agent_runtime_replay_does_not_launch_second_process(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-runtime-replay.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    from supervisor.domain.subscription_launch import SupervisedSubscriptionLaunchResult

    adapter_calls = {"count": 0}

    async def fake_run(self, **kwargs):
        adapter_calls["count"] += 1
        return SupervisedSubscriptionLaunchResult(status="completed", exit_code=0)

    monkeypatch.setattr("supervisor.domain.subscription_launch.SupervisedSubscriptionLaunchAdapter.run", fake_run)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_runtime_binding(stub)
        monkeypatch.setenv("SUPERVISOR_ACCEPTED_SUBSCRIPTION_RUNTIME_APPROVAL_IDS", str(approval["approvalId"]))
        first = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        second = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]

    assert first.status_code == 200
    assert second.status_code == 200
    assert adapter_calls["count"] == 1
    assert second.json()["data"]["runtimeEvidence"]["status"] == "replayed_existing_attempt"
    assert len(attempts) == 1


def test_subscription_agent_runtime_rejects_artifact_only_approval_reuse(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-runtime-artifact-reuse.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH", "true")
    monkeypatch.setenv("SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH", "true")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    adapter_calls = {"count": 0}

    async def fake_run(self, **kwargs):
        adapter_calls["count"] += 1
        raise AssertionError("Runtime adapter must not run for artifact-only approval reuse.")

    monkeypatch.setattr("supervisor.domain.subscription_launch.SupervisedSubscriptionLaunchAdapter.run", fake_run)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_runtime_binding(
            stub,
            permissionEnvelope="approved_for_one_artifact_only_subscription_launch",
        )
        monkeypatch.setenv("SUPERVISOR_ACCEPTED_SUBSCRIPTION_RUNTIME_APPROVAL_IDS", str(approval["approvalId"]))
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )

    assert response.status_code == 200
    launch = response.json()["data"]
    assert adapter_calls["count"] == 0
    assert launch["approvalAccepted"] is False
    assert launch["processLaunchAttempted"] is False
    assert launch["commandExecutionAllowed"] is False


def test_subscription_agent_launch_request_rejects_future_dated_approval(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-future-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    approval_timestamp = datetime.now(timezone.utc) + timedelta(minutes=10)
    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(
            stub,
            approvalTimestamp=approval_timestamp.isoformat(),
            approvalExpiry=(approval_timestamp + timedelta(minutes=30)).isoformat(),
        )
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "rejected_stale_exact_approval"
    assert "approvalTimestamp" in launch["staleEnvelopeFields"]
    assert launch["rejectedEnvelopeFields"]["approvalTimestamp"] == "future_effective_time"
    assert launch["processLaunchAttempted"] is False


def test_subscription_agent_launch_request_read_only_accepted_fixture_is_evaluation_ready(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-read-only-accepted-fixture.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", **approval},
        )
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]

    assert response.status_code == 200
    launch = response.json()["data"]
    assert launch["status"] == "accepted_artifact_only_fixture_evaluation_ready"
    assert launch["readinessStatus"] == "subscription_launch_fixture_evaluation_ready"
    assert launch["approvalAccepted"] is True
    assert launch["processLaunchAllowed"] is False
    assert launch["executionAllowed"] is False
    assert launch["processLaunchAttempted"] is False
    assert launch["mutationContract"]["recordEvent"] is False
    assert launch["mutationContract"]["mode"] == "read_only_evaluation"
    assert before_events == after_events
    assert attempts == []


def test_subscription_agent_launch_request_rejects_second_fixture_attempt_for_work_item(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-one-fixture.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        first_approval = _approved_subscription_launch_binding(stub)
        first_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **first_approval},
        )
        second_attempt_id = f"{first_approval['executionAttemptId']}-replay"
        second_approval = _approved_subscription_launch_binding(
            stub,
            attemptId=second_attempt_id,
            executionAttemptId=second_attempt_id,
            workspacePlanId=f"subscription-workspace-plan-{second_attempt_id}",
        )
        second_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **second_approval},
        )
        third_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **first_approval},
        )
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    second_launch = second_response.json()["data"]
    assert second_launch["status"] == "rejected_stale_exact_approval"
    assert "executionAttemptId" in second_launch["staleEnvelopeFields"]
    assert "workspacePlanId" in second_launch["staleEnvelopeFields"]
    assert second_launch["processLaunchAttempted"] is False
    assert third_response.status_code == 200
    third_launch = third_response.json()["data"]
    assert third_launch["status"] == "accepted_artifact_only_fixture_completed"
    assert third_launch["approvalAccepted"] is True
    assert third_launch["processLaunchAttempted"] is True
    assert len(attempts) == 1
 
 
def test_runtime_evidence_export_includes_subscription_launch_summary_without_raw_output(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "runtime-export-subscription-launch.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app
    _freeze_subscription_launch_now(monkeypatch)

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        launch_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")

    assert launch_response.status_code == 200
    assert export_response.status_code == 200
    export = export_response.json()["data"]
    launch_export = export["subscriptionLaunch"]
    assert launch_export["status"] == "accepted_artifact_only_fixture_completed"
    assert launch_export["readinessStatus"] == "subscription_launch_fixture_completed"
    assert launch_export["latestEventType"] == "execution_attempt.subscription_launch_fixture_completed"
    assert launch_export["approvalBinding"]["permissionEnvelope"] == "approved_for_one_artifact_only_subscription_launch"
    assert launch_export["workspaceSummary"]["commandsAllowed"] is False
    assert launch_export["workspaceSummary"]["credentialAccessAllowed"] is False
    assert launch_export["outputArtifactReferences"][0]["artifactKind"] == "fixture_output_summary"
    assert launch_export["outputArtifactReferences"][1]["artifactKind"] == "fixture_generated_patch_reference"
    assert launch_export["verificationEvidence"]["status"] == "not_recorded"
    assert launch_export["verificationEvidence"]["commandShape"] == "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch"
    assert launch_export["verificationEvidence"]["blockedReason"] == "subscription-launch-verification-missing"
    assert launch_export["verificationEvidence"]["deliveryEligible"] is False
    assert launch_export["rawOutputStored"] is False
    assert launch_export["safetyFlags"]["sourceMutationAllowed"] is False
    assert launch_export["safetyFlags"]["networkAllowed"] is False
    assert launch_export["lifecycleSummary"]["terminalStates"] == ["cancelled", "timed_out", "failed", "completed", "rejected"]
    assert "rollbackPolicy" in launch_export["cancellationTimeoutRollbackEvidence"]
    assert "rawStdout" not in str(launch_export)
    assert "rawStderr" not in str(launch_export)
    assert "generatedPatch'" not in str(launch_export)
    assert "GET /work-items/{id}/runtime-evidence-export" in launch_export["relatedReports"]


def test_runtime_evidence_export_redacts_unknown_subscription_verification_raw_fields(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "runtime-evidence-export-redacted-verification.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    raw_sentinels = [
        "RAW_PROMPT_API_SENTINEL_DO_NOT_RETAIN",
        "RAW_COMPLETION_API_SENTINEL_DO_NOT_RETAIN",
        "PROVIDER_PAYLOAD_API_SENTINEL_DO_NOT_RETAIN",
        "SECRET_API_SENTINEL_DO_NOT_RETAIN",
        "SOURCE_COPY_API_SENTINEL_DO_NOT_RETAIN",
    ]
    payload = {
        "status": "provider_success_metadata_only",
        "readinessStatus": "provider_output_redacted",
        "subscriptionLaunchVerification": {
            "attemptId": "provider-raw-output-api",
            "routeDecisionId": "route-provider-raw-output-api",
            "status": "provider_success_metadata_only",
            "commandId": "provider-raw-output-api",
            "commandShape": "synthetic local-only provider raw-output API fixture",
            "summary": "Bounded provider output summary.",
            "artifactRef": "_bmad-output/provider-raw-output-ui/provider-api.json",
            "recoveryPath": "Review bounded provider success summary artifact.",
            "rollbackStatus": "not_triggered",
            "rollbackReason": None,
            "blockedReason": "provider_raw_output_excluded",
            "deliveryEligible": False,
            "nextSafeAction": "Keep raw provider output excluded from dashboard evidence.",
            "rawOutputRetained": False,
            "rawPrompt": raw_sentinels[0],
            "rawCompletion": raw_sentinels[1],
            "providerPayload": raw_sentinels[2],
            "secretValue": raw_sentinels[3],
            "sourceCopy": raw_sentinels[4],
        },
        "outputArtifactSummary": {
            "artifactReferences": [
                {
                    "artifactKind": "provider_success_summary",
                    "path": "_bmad-output/provider-raw-output-ui/provider-api.json",
                    "rawPayloadStored": False,
                    "operatorReviewRequired": True,
                },
            ],
            "rawOutputStored": False,
        },
    }

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        conn = sqlite3.connect(db_path)
        conn.execute(
            "insert into workflow_events (id, work_item_id, event_type, actor_type, actor_id, actor_label, correlation_id, summary, payload, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                work_item_id,
                "execution_attempt.verification_recorded",
                "supervisor",
                None,
                None,
                str(uuid.uuid4()),
                "Provider raw-output API regression fixture recorded with bounded metadata.",
                json.dumps(payload),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        conn.close()
        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")

    assert export_response.status_code == 200
    export = export_response.json()["data"]["subscriptionLaunch"]
    verification = export["verificationEvidence"]
    assert verification["status"] == "provider_success_metadata_only"
    assert verification["blockedReason"] == "provider_raw_output_excluded"
    assert verification["nextSafeAction"] == "Keep raw provider output excluded from dashboard evidence."
    assert "rawPrompt" not in verification
    assert "rawCompletion" not in verification
    assert "providerPayload" not in verification
    assert "secretValue" not in verification
    assert "sourceCopy" not in verification
    export_text = json.dumps(export_response.json())
    for sentinel in raw_sentinels:
        assert sentinel not in export_text


def test_subscription_agent_launch_verification_records_recovery_and_rollback_metadata(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-launch-verification-recovery.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main
    _freeze_subscription_launch_now(monkeypatch)

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "main"
        if command == ("git", "rev-parse", "HEAD"):
            return True, "abc1234"
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    def fake_verification_command(command_shape: str) -> dict:
        assert command_shape == "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch"
        return {
            "status": "failed",
            "exitCode": 1,
            "durationMs": 42000,
            "summary": "Approved subscription launch verification command exited with code 1.",
            "recoveryAction": "inspect retained subscription launch artifacts before retry or rollback",
        }

    monkeypatch.setattr(api_main.service, "_run_execution_attempt_verification_command", fake_verification_command)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        launch_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]
        attempt_id = attempts[0]["attemptId"]
        response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt_id}/verification-evidence",
            json={
                "commandId": "subscription-launch-fixture-check",
                "label": "Subscription launch fixture verification",
                "commandShape": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
                "status": "failed",
                "exitCode": 1,
                "durationMs": 42000,
                "summary": "Do not retain raw output from this check.",
                "artifactRef": "_bmad-output/subscription-launch/verification-summary.json",
                "recoveryAction": "inspect retained subscription launch artifacts before retry or rollback",
                "rollbackStatus": "triggered",
                "rollbackReason": "verification_failed",
                "nextSafeAction": "Keep subscription-agent launch disabled until the operator reviews retained artifacts.",
            },
        )
        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")
        replay_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt_id}/verification-evidence",
            json={
                "commandId": "subscription-launch-fixture-check",
                "label": "Subscription launch fixture verification",
                "commandShape": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
                "status": "failed",
                "summary": "Duplicate rollback evidence must not be accepted.",
                "recoveryAction": "inspect retained subscription launch artifacts before retry or rollback",
                "rollbackStatus": "triggered",
                "rollbackReason": "verification_failed",
                "nextSafeAction": "Keep subscription-agent launch disabled until the operator reviews retained artifacts.",
            },
        )
        replay_different_command_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt_id}/verification-evidence",
            json={
                "commandId": "subscription-launch-fixture-check-retry",
                "label": "Subscription launch fixture verification retry",
                "commandShape": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
                "status": "failed",
                "summary": "Duplicate rollback evidence with a new command id must not be accepted.",
                "recoveryAction": "inspect retained subscription launch artifacts before retry or rollback",
                "rollbackStatus": "triggered",
                "rollbackReason": "verification_failed",
                "nextSafeAction": "Keep subscription-agent launch disabled until the operator reviews retained artifacts.",
            },
        )
        rollback_blocked_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )

    assert launch_response.status_code == 200
    assert response.status_code == 200
    updated_attempt = response.json()["data"]
    evidence = next(ref for ref in updated_attempt["artifactRefs"] if ref.get("artifactType") == "verification_result")
    assert evidence["status"] == "failed"
    assert evidence["subscriptionLaunchVerification"]["status"] == "failed"
    assert evidence["subscriptionLaunchVerification"]["recoveryPath"] == "inspect retained subscription launch artifacts before retry or rollback"
    assert evidence["subscriptionLaunchVerification"]["rollbackStatus"] == "triggered"
    assert evidence["subscriptionLaunchVerification"]["rollbackReason"] == "verification_failed"
    assert evidence["subscriptionLaunchVerification"]["blockedReason"] == "subscription-launch-verification-failed"
    assert evidence["subscriptionLaunchVerification"]["nextSafeAction"] == "Keep subscription-agent launch disabled until the operator reviews retained artifacts."
    assert evidence["rawOutputRetained"] is False
    assert "rawStdout" not in str(evidence)
    assert "rawStderr" not in str(evidence)
    assert export_response.status_code == 200
    launch_export = export_response.json()["data"]["subscriptionLaunch"]
    assert launch_export["verificationEvidence"]["status"] == "failed"
    assert launch_export["verificationEvidence"]["recoveryPath"] == "inspect retained subscription launch artifacts before retry or rollback"
    assert launch_export["verificationEvidence"]["rollbackStatus"] == "triggered"
    assert launch_export["verificationEvidence"]["blockedReason"] == "subscription-launch-verification-failed"
    assert launch_export["verificationEvidence"]["nextSafeAction"] == "Keep subscription-agent launch disabled until the operator reviews retained artifacts."
    assert launch_export["readinessStatus"] == "subscription_launch_rollback_triggered"
    assert {artifact["artifactKind"] for artifact in launch_export["outputArtifactReferences"]} == {
        "fixture_output_summary",
        "fixture_generated_patch_reference",
        "verification_result",
    }
    assert replay_response.status_code == 409
    assert replay_different_command_response.status_code == 409
    assert rollback_blocked_response.status_code == 200
    blocked_launch = rollback_blocked_response.json()["data"]
    assert blocked_launch["status"] == "rejected_rollback_triggered"
    assert blocked_launch["rejectedEnvelopeFields"]["rollbackStatus"] == "verification_failed"
    assert "subscription_launch_rollback_triggered" in blocked_launch["blockedReasonIds"]


def test_subscription_agent_launch_stale_verification_is_metadata_only_and_blocks_delivery(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-launch-stale-verification.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main
    _freeze_subscription_launch_now(monkeypatch)

    def fake_verification_command(command_shape: str) -> dict:
        raise AssertionError("stale verification evidence must not execute a command")

    monkeypatch.setattr(api_main.service, "_run_execution_attempt_verification_command", fake_verification_command)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        stub = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "architecture_review", "requestedAgent": "codex"},
        ).json()["data"]
        approval = _approved_subscription_launch_binding(stub)
        launch_response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch",
            json={"taskKind": "architecture_review", "requestedAgent": "codex", "recordEvent": True, **approval},
        )
        attempts = client.get(f"/work-items/{work_item_id}/execution-attempts").json()["data"]
        attempt_id = attempts[0]["attemptId"]
        response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt_id}/verification-evidence",
            json={
                "commandId": "subscription-launch-stale-check",
                "label": "Subscription launch stale verification",
                "commandShape": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
                "status": "stale",
                "summary": "Prior subscription launch verification is stale.",
                "artifactRef": "_bmad-output/subscription-launch/stale-verification-summary.json",
                "recoveryAction": "record a fresh approved verification command result",
                "rollbackStatus": "available_not_triggered",
                "rollbackReason": "verification_stale",
                "nextSafeAction": "Record fresh subscription-agent launch verification evidence before delivery.",
            },
        )
        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")

    assert launch_response.status_code == 200
    assert response.status_code == 200
    evidence = next(ref for ref in response.json()["data"]["artifactRefs"] if ref.get("commandId") == "subscription-launch-stale-check")
    assert evidence["status"] == "stale"
    assert evidence["subscriptionLaunchVerification"]["blockedReason"] == "subscription-launch-verification-stale"
    assert evidence["subscriptionLaunchVerification"]["deliveryEligible"] is False
    launch_export = export_response.json()["data"]["subscriptionLaunch"]
    assert launch_export["verificationEvidence"]["status"] == "stale"
    assert launch_export["verificationEvidence"]["blockedReason"] == "subscription-launch-verification-stale"
    assert launch_export["verificationEvidence"]["nextSafeAction"] == "Record fresh subscription-agent launch verification evidence before delivery."


def test_subscription_agent_launch_stub_rejects_non_handoff_route(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-agent-launch-stub-reject.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/subscription-agent-launch-stub",
            json={"taskKind": "path_scope_check", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 409
    assert response.json()["detail"]["error"]["code"] == "invalid_subscription_agent_launch_stub"
    assert "subscription_handoff" in response.json()["detail"]["error"]["message"]
    assert before_events == after_events

def test_subscription_handoff_package_generation_is_non_mutating(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-handoff-package.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/subscription-handoff-package",
            json={"stepId": "architecture", "taskKind": "architecture_review"},
        )

        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    package = response.json()["data"]
    assert package["packageId"].startswith("handoff-route-")
    assert package["workItemId"] == work_item_id
    assert package["taskKind"] == "architecture_review"
    assert package["stepId"] == "architecture"
    assert package["route"]["selectedLane"] == "subscription_handoff"
    assert package["launchAllowed"] is False
    assert package["context"]
    assert any("Do not launch" in constraint for constraint in package["constraints"])
    assert any("Architecture review handoff" in constraint for constraint in package["constraints"])
    assert any("Expected output: recommended architecture decision" in instruction for instruction in package["operatorInstructions"])
    assert package["operatorInstructions"]
    assert before_item == after_item
    assert before_events == after_events


def test_subscription_handoff_package_can_record_workflow_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-handoff-package-event.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/subscription-handoff-package",
            json={"taskKind": "security_review", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert len(after_events) == len(before_events) + 1
    event = after_events[0]
    assert event["eventType"] == "routing.subscription_handoff_packaged"
    assert event["payload"]["taskKind"] == "security_review"
    assert event["payload"]["selectedLane"] == "subscription_handoff"
    assert event["payload"]["launchAllowed"] is False
    assert event["payload"]["reasonCodes"] == ["task.security_review", "quality.subscription_handoff_preferred"]
    package = response.json()["data"]
    assert any("do not include secrets" in constraint for constraint in package["constraints"])
    assert any("risk-ranked findings" in instruction for instruction in package["operatorInstructions"])


def test_subscription_handoff_package_hardens_implementation_handoff(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-handoff-package-implementation.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/subscription-handoff-package",
            json={"stepId": "implementation", "taskKind": "bounded_recipe_implementation"},
        )

    assert response.status_code == 200
    package = response.json()["data"]
    assert package["route"]["selectedLane"] == "subscription_handoff"
    assert package["launchAllowed"] is False
    assert "apps/dashboard" in package["allowedPaths"]
    assert "pnpm run check" in package["validationCommands"]
    assert any("Implementation handoff" in constraint for constraint in package["constraints"])
    assert any("Stay within recipe allowed paths" in constraint for constraint in package["constraints"])
    assert any("bounded patch plan" in instruction for instruction in package["operatorInstructions"])


def test_subscription_handoff_package_rejects_non_handoff_route(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-handoff-package-reject.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(
            f"/work-items/{work_item_id}/subscription-handoff-package",
            json={"taskKind": "path_scope_check", "recordEvent": True},
        )

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 409
    assert response.json()["detail"]["error"]["code"] == "invalid_subscription_handoff_package"
    assert "subscription_handoff" in response.json()["detail"]["error"]["message"]
    assert before_events == after_events

def test_routing_preview_post_rejects_unknown_task_kind(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview-invalid-task.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

        response = client.post(f"/work-items/{work_item_id}/routing-preview", json={"taskKind": "not_a_task_kind"})

        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_routing_preview"
    assert before_events == after_events


def test_routing_preview_post_missing_work_item_uses_work_item_not_found(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "routing-preview-post-missing.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.post("/work-items/missing/routing-preview", json={"taskKind": "evidence_summary"})

    assert response.status_code == 404
    assert response.json()["detail"]["error"]["code"] == "work_item_not_found"


def test_execution_attempt_plans_utility_attempt_and_records_history(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-utility.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Plan utility execution attempt",
                "requestedOutcome": "Record a non-executing attempt for the safest deterministic route.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        attempt_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts",
            json={"actorId": "operator-1", "actorLabel": "Primary operator"},
        )
        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")
        events_response = client.get(f"/work-items/{work_item_id}/events")
        duplicate_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})

    assert attempt_response.status_code == 200
    attempt = attempt_response.json()["data"]
    assert attempt["status"] == "planned"
    assert attempt["lane"] == "utility"
    assert attempt["workerId"] == "utility.internal"
    assert attempt["routeDecisionId"].startswith(f"route-{work_item_id}")
    assert attempt["rejectionReason"] is None
    assert attempt["workspaceIsolationPlan"]["planId"] == f"workspace-plan-{attempt['attemptId']}"
    assert "apps/dashboard" in attempt["workspaceIsolationPlan"]["readRoots"]
    assert "packages/contracts" in attempt["workspaceIsolationPlan"]["readRoots"]
    assert "services/supervisor" in attempt["workspaceIsolationPlan"]["readRoots"]
    assert attempt["workspaceIsolationPlan"]["writeRoots"] == []
    assert attempt["workspaceIsolationPlan"]["artifactRoot"] == f"_bmad-output/execution-attempts/{attempt['attemptId']}"
    assert attempt["workspaceIsolationPlan"]["sourceMutationAllowed"] is False
    assert attempt["workspaceIsolationPlan"]["commandsAllowed"] is False
    assert attempt["workspaceIsolationPlan"]["networkAllowed"] is False
    assert attempt["workspaceIsolationPlan"]["credentialAccessAllowed"] is False
    assert "Do not include secrets" in attempt["workspaceIsolationPlan"]["redactionBoundary"][1]
    assert "supervisor_internal_utility_functions" in attempt["workspaceIsolationPlan"]["allowedCommandClasses"]
    assert "arbitrary_shell_commands" in attempt["workspaceIsolationPlan"]["blockedCommandClasses"]
    assert attempt["workspaceIsolationPlan"]["providerEndpointPolicy"].startswith("deny_all")
    assert attempt["workspaceIsolationPlan"]["promptConstructionPolicy"] == "approved_evidence_only"
    assert attempt["workspaceIsolationPlan"]["boundaryRejectionReason"] == "worker_execution_safety_boundary_not_satisfied"
    assert attempt["eventRefs"][0]["eventType"] == "execution_attempt.planned"
    assert before_item == after_item

    assert history_response.status_code == 200
    history = history_response.json()["data"]
    assert [entry["attemptId"] for entry in history] == [attempt["attemptId"]]

    assert duplicate_response.status_code == 409
    assert "already has active execution attempt" in duplicate_response.json()["detail"]["error"]["message"]

    events = events_response.json()["data"]
    attempt_event = next(event for event in events if event["eventType"] == "execution_attempt.planned")
    assert attempt_event["actorType"] == "operator"
    assert attempt_event["actorLabel"] == "Primary operator"
    assert attempt_event["payload"]["attemptId"] == attempt["attemptId"]
    assert attempt_event["payload"]["routeDecisionId"] == attempt["routeDecisionId"]
    assert attempt_event["payload"]["workerId"] == "utility.internal"
    assert attempt_event["payload"]["workspaceIsolationPlan"]["planId"] == attempt["workspaceIsolationPlan"]["planId"]
    assert attempt_event["payload"]["workspaceIsolationPlan"]["writeRoots"] == []
    assert attempt_event["payload"]["executionAllowed"] is False
    assert attempt_event["payload"]["processLaunchAllowed"] is False
    assert attempt_event["payload"]["providerCallsAllowed"] is False
    assert attempt_event["payload"]["modelCallsAllowed"] is False
    assert attempt_event["payload"]["commandExecutionAllowed"] is False
    assert attempt_event["payload"]["sourceMutationAllowed"] is False
    assert attempt_event["payload"]["networkAllowed"] is False
    assert attempt_event["payload"]["credentialAccessAllowed"] is False
    assert attempt_event["payload"]["boundaryId"] == "supervisor-worker-threat-boundary-v1"
    assert attempt_event["payload"]["boundaryRejectionReason"] == "worker_execution_safety_boundary_not_satisfied"


def test_runtime_evidence_export_returns_attempts_events_and_boundaries_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "runtime-evidence-export.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Export runtime evidence",
                "requestedOutcome": "Back up attempt and event evidence in a reviewable format.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})
        before_events_response = client.get(f"/work-items/{work_item_id}/events")
        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")
        after_events_response = client.get(f"/work-items/{work_item_id}/events")
        missing_response = client.get("/work-items/missing/runtime-evidence-export")

    assert attempt_response.status_code == 200
    attempt = attempt_response.json()["data"]
    assert export_response.status_code == 200
    export = export_response.json()["data"]

    assert export["exportId"] == f"runtime-evidence-export-{work_item_id}"
    assert export["format"] == "application/json"
    assert export["version"] == "1.0"
    assert export["workItem"]["id"] == work_item_id
    assert [entry["attemptId"] for entry in export["executionAttempts"]] == [attempt["attemptId"]]
    assert export["executionAttempts"][0]["workspaceIsolationPlan"]["sourceMutationAllowed"] is False

    event_types = [event["eventType"] for event in export["workflowEvents"]]
    assert "execution_attempt.planned" in event_types
    assert "work_item.queued" in event_types
    assert export["boundary"]["localRuntimeState"] == [
        "supervisor_database.work_items",
        "supervisor_database.workflow_events",
        "supervisor_database.execution_attempts",
        "runtime-generated export timestamps and identifiers",
    ]
    git_backed_evidence = export["boundary"]["gitBackedEvidence"]
    assert len(git_backed_evidence) == len(set(git_backed_evidence))
    assert "docs/workflows/implementation-evidence-boundary.md" in git_backed_evidence
    assert "docs/workflows/execution-authority-boundary.md" in git_backed_evidence
    assert "docs/workflows/product-requirements-boundary.md#supervisor-execution-authority-expansion-boundary" in git_backed_evidence
    assert "GET /supervisor/execution-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/documentation-authority-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/verification-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/authority-readiness-matrix-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/dashboard-e2e-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/report-catalog" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/maintenance-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/maintenance-action-plan-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/development-runway-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/runtime-evidence-review-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/safe-development-backlog" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/managed-recipe-policy-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/github-workflow-policy-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/git-hygiene-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/codex-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/codex-implementation-approval-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/claude-review-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/claude-review-approval-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/github-delivery-authority-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/local-cleanup-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/remote-cleanup-sync-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/trusted-autonomy-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/epic-6-completion-audit-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/delivery-readiness-policy-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/execution-state-boundary" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/disabled-provider-proofs" in export["boundary"]["relatedSupervisorReports"]
    assert "environment variables and credential stores" in export["boundary"]["excludedState"]
    assert "raw Ollama prompts, completions, reasoning fields, and provider payloads" in export["boundary"]["excludedState"]
    assert "raw subscription-agent stdout and stderr" in export["boundary"]["excludedState"]
    assert "subscription-agent inherited environment values" in export["boundary"]["excludedState"]
    assert export["safety"]["exportOnly"] is True
    assert export["safety"]["processLaunchAllowed"] is False
    assert export["safety"]["providerCallsAllowed"] is False
    assert export["safety"]["modelCallsAllowed"] is False
    assert export["safety"]["premiumExecutionAllowed"] is False
    assert export["safety"]["commandExecutionAllowed"] is False
    assert export["safety"]["sourceMutationAllowed"] is False
    assert export["safety"]["networkAllowed"] is False
    assert export["safety"]["credentialAccessAllowed"] is False
    assert export["reviewManifest"]["manifestId"] == f"runtime-evidence-review-manifest-{work_item_id}"
    assert export["reviewManifest"]["evidenceCounts"]["executionAttempts"] == 1
    assert export["reviewManifest"]["evidenceCounts"]["workflowEvents"] == len(export["workflowEvents"])
    assert export["reviewManifest"]["evidenceCounts"]["relatedSupervisorReports"] == len(export["boundary"]["relatedSupervisorReports"])
    assert export["reviewManifest"]["readOnly"] is True
    assert export["reviewManifest"]["executionAuthorityApproved"] is False
    assert any("not execution-authority approval" in stop_line for stop_line in export["reviewManifest"]["stopLines"])
    assert any("credential stores" in note for note in export["reviewManifest"]["retentionNotes"])
    assert any(
        "Ollama timeout and cancellation summaries are metadata-only" in note
        for note in export["reviewManifest"]["retentionNotes"]
    )
    assert {item["itemId"] for item in export["reviewNavigator"]} == {
        "review-runtime-state",
        "review-authority-boundary",
        "review-git-backed-evidence",
        "review-ollama-no-call-prep",
        "review-subscription-launch-prep",
    }
    authority_item = next(item for item in export["reviewNavigator"] if item["itemId"] == "review-authority-boundary")
    assert authority_item["priority"] == "P0"
    assert "GET /supervisor/threat-boundary" in authority_item["relatedReports"]
    assert any("not execution-authority approval" in stop_line for stop_line in authority_item["stopLines"])
    ollama_item = next(item for item in export["reviewNavigator"] if item["itemId"] == "review-ollama-no-call-prep")
    assert "GET /supervisor/disabled-provider-proofs" in ollama_item["relatedReports"]
    assert "Approved endpoint: http://192.168.1.128:11434/v1/chat/completions." in ollama_item["evidence"]
    assert "Approved model id: qwen3:14b." in ollama_item["evidence"]
    assert "cancel_requested -> request_abort_recorded" in ollama_item["evidence"]
    assert any("approved host endpoint and qwen3:14b model" in stop_line for stop_line in ollama_item["stopLines"])
    assert before_events_response.json()["data"] == after_events_response.json()["data"]
    assert missing_response.status_code == 404


def test_managed_recipe_policy_report_catalogs_recipes_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "managed-recipe-policy-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/managed-recipe-policy-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "managed-recipe-policy-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert report["remoteAutomationApproved"] is False
    assert {recipe["id"] for recipe in report["recipes"]} == {"dashboard-test-coverage", "dashboard-mobile-coverage"}
    assert all(recipe["remoteAutomationPolicy"]["status"] == "blocked" for recipe in report["recipes"])
    assert any("git push" in action for action in report["nextSafeActions"])
    assert any("not execution-authority approvals" in stop_line for stop_line in report["stopLines"])


def test_github_workflow_policy_report_documents_auth_split_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "github-workflow-policy-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/github-workflow-policy-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "github-workflow-policy-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert report["plaintextTokenStorageApproved"] is False
    assert report["remoteAutomationApproved"] is False
    assert {item["itemId"] for item in report["authModel"]} == {"git-gcm-remotes", "codex-github-connector", "local-gh-auth"}
    assert {item["itemId"] for item in report["requiredChecks"]} == {"github-doctor-local", "github-doctor-remote", "connector-probe"}
    assert any("plaintext GitHub CLI tokens" in stop_line for stop_line in report["stopLines"])
    assert any("Git/GCM" in action for action in report["nextSafeActions"])


def test_git_hygiene_report_reads_local_status_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "git-hygiene-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/git-hygiene-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "git-hygiene-report-v1"
    assert report["readOnly"] is True
    assert report["remoteMutationApproved"] is False
    assert report["cleanupApproved"] is False
    assert report["currentBranch"]
    assert report["headRevision"]
    assert report["workingTreeStatus"] in {"clean", "attention"}
    assert set(report["statusCounts"]) == {"added", "modified", "deleted", "renamed", "untracked", "conflicted"}
    assert {signal["signalId"] for signal in report["localSignals"]} == {"working-tree", "branch", "upstream", "worktrees"}
    assert {signal["signalId"] for signal in report["remoteSignals"]} == {"pull-request", "ci"}
    assert all(signal["status"] == "not_queried" for signal in report["remoteSignals"])
    assert any("not approval to push" in stop_line for stop_line in report["stopLines"])


def test_codex_readiness_report_does_not_launch_codex(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "codex-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/codex-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events
    report = response.json()["data"]
    assert report["reportId"] == "codex-readiness-report-v1"
    assert report["readOnly"] is True
    assert report["processLaunchApproved"] is False
    assert report["workerTaskExecutionApproved"] is False
    assert report["sourceMutationApproved"] is False
    assert {check["checkId"] for check in report["checks"]} == {"cli-discovery", "auth-posture", "worker-launch", "source-mutation"}
    assert next(check for check in report["checks"] if check["checkId"] == "auth-posture")["status"] == "not_checked"
    assert next(check for check in report["checks"] if check["checkId"] == "worker-launch")["status"] == "blocked"
    assert any("does not approve Codex CLI process launch" in stop_line for stop_line in report["stopLines"])


def test_codex_implementation_approval_report_stays_non_executing(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "codex-implementation-approval-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/codex-implementation-approval-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "codex-implementation-approval-report-v1"
    assert report["readOnly"] is True
    assert report["authorityFamily"] == "codex_implementation"
    assert report["operation"] == "one_time_bounded_implementation_attempt"
    assert report["processLaunchApproved"] is False
    assert report["workerTaskExecutionApproved"] is False
    assert report["sourceMutationApproved"] is False
    assert report["approvalBindingImplemented"] is False
    assert ".git/**" in report["blockedPaths"]
    assert any("codex <non-interactive task mode>" in command for command in report["expectedCommandShape"])
    assert any("raw prompt or completion" in evidence for evidence in report["requiredEvidence"])
    assert any("outside the approved worktree" in stop_condition for stop_condition in report["stopConditions"])
    assert {requirement["requirementId"] for requirement in report["requirements"]} == {
        "isolated-worktree",
        "path-scope",
        "verification",
        "retention",
        "approval-binding",
    }
    approval_binding = next(requirement for requirement in report["requirements"] if requirement["requirementId"] == "approval-binding")
    assert approval_binding["status"] == "not_implemented"


def test_codex_launch_contract_reports_bounded_authority_and_negative_fixtures(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "codex-launch-contract-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/codex-implementation-approval-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    contract = report["launchContract"]
    assert contract["contractId"] == "codex-launch-contract-v1"
    assert contract["workerId"] == "codex.local"
    assert contract["lane"] == "utility"
    assert contract["authorityMode"] == "operator_approved_bounded_source_mutation"
    assert contract["approvalBinding"]["workItemId"] == "<selected-active-work-item>"
    assert contract["approvalBinding"]["routeDecisionId"] == "<current-route-decision-id>"
    assert contract["approvalBinding"]["attemptId"] == "<planned-execution-attempt-id>"
    assert contract["approvalBinding"]["workspacePlanId"] == "isolated-codex-worktree"
    assert contract["permissionEnvelope"]["allowedPaths"] == report["allowedPaths"]
    assert ".git/**" in contract["permissionEnvelope"]["blockedPaths"]
    assert "pnpm run check" in contract["permissionEnvelope"]["verificationCommand"]
    assert contract["evaluation"]["status"] == "accepted"
    assert contract["evaluation"]["launchApproved"] is False
    assert contract["evaluation"]["processLaunchAttempted"] is False

    blocked = {authority["authorityId"]: authority for authority in report["blockedAuthorities"]}
    assert blocked["claude_launch"]["status"] == "blocked_requires_separate_approval"
    assert blocked["subscription_agent_launch"]["status"] == "blocked_requires_separate_approval"
    assert blocked["provider_expansion"]["status"] == "blocked_requires_separate_approval"
    assert blocked["issue_sync"]["status"] == "blocked_requires_separate_approval"
    assert blocked["secret_access"]["status"] == "blocked_requires_separate_approval"
    assert blocked["merge"]["status"] == "blocked_requires_separate_approval"
    assert blocked["cleanup"]["status"] == "blocked_requires_separate_approval"
    assert blocked["broad_autonomy"]["status"] == "blocked_requires_separate_approval"

    fixtures = {fixture["fixtureId"]: fixture for fixture in report["launchContractFixtures"]}
    assert fixtures["positive-current-contract"]["evaluation"]["status"] == "accepted"
    assert fixtures["stale-route-decision"]["evaluation"]["blockedReason"] == "codex_launch.route_decision_stale"
    assert fixtures["changed-permission-envelope"]["evaluation"]["blockedReason"] == "codex_launch.permission_envelope_changed"
    assert fixtures["forbidden-path-scope"]["evaluation"]["blockedReason"] == "codex_launch.forbidden_path_scope"
    assert fixtures["missing-verification-command"]["evaluation"]["blockedReason"] == "codex_launch.verification_command_missing"
    assert fixtures["expired-approval"]["evaluation"]["blockedReason"] == "codex_launch.approval_expired"
    assert all(fixture["evaluation"]["processLaunchAttempted"] is False for fixture in fixtures.values())


def test_claude_review_readiness_report_does_not_launch_claude(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "claude-review-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/claude-review-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "claude-review-readiness-report-v1"
    assert report["readOnly"] is True
    assert report["processLaunchApproved"] is False
    assert report["reviewTaskExecutionApproved"] is False
    assert report["sourceMutationApproved"] is False
    assert report["scarceUseApproved"] is False
    assert {check["checkId"] for check in report["reviewPolicy"]} == {
        "cli-discovery",
        "auth-posture",
        "review-only",
        "source-mutation",
    }
    assert {check["checkId"] for check in report["scarcityPolicy"]} == {
        "scarce-use",
        "budget-record",
        "review-trigger",
    }
    assert next(check for check in report["reviewPolicy"] if check["checkId"] == "auth-posture")["status"] == "not_checked"
    assert next(check for check in report["reviewPolicy"] if check["checkId"] == "review-only")["status"] == "blocked"
    assert next(check for check in report["scarcityPolicy"] if check["checkId"] == "budget-record")["status"] == "not_implemented"
    assert any("does not approve Claude CLI process launch" in stop_line for stop_line in report["stopLines"])
    assert any("scarce Claude subscription usage" in stop_line for stop_line in report["stopLines"])


def test_claude_review_approval_report_stays_review_only_and_non_executing(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "claude-review-approval-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/claude-review-approval-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "claude-review-approval-report-v1"
    assert report["readOnly"] is True
    assert report["authorityFamily"] == "claude_review"
    assert report["operation"] == "one_time_bounded_review_only_attempt"
    assert report["processLaunchApproved"] is False
    assert report["reviewTaskExecutionApproved"] is False
    assert report["sourceMutationApproved"] is False
    assert report["scarceUseApproved"] is False
    assert report["approvalBindingImplemented"] is False
    assert {trigger["requirementId"] for trigger in report["triggerPolicy"]} == {
        "explicit-request",
        "high-risk-diff",
        "codex-output-check",
        "routine-generation",
    }
    assert next(trigger for trigger in report["triggerPolicy"] if trigger["requirementId"] == "routine-generation")["status"] == "blocked"
    assert any("review-only non-interactive mode" in command for command in report["expectedCommandShape"])
    assert any("Credentials" in blocked_input for blocked_input in report["blockedInputs"])
    assert any("Risk-ranked findings" in output for output in report["outputContract"])
    assert any("One Claude review attempt per approval" in control for control in report["scarcityControls"])
    assert any("edit files" in stop_condition for stop_condition in report["stopConditions"])


def test_github_delivery_authority_report_stays_read_only_and_blocks_remote_steps(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "github-delivery-authority-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/github-delivery-authority-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "github-delivery-authority-report-v1"
    assert report["readOnly"] is True
    assert report["authorityFamily"] == "github_delivery"
    assert report["pushApproved"] is False
    assert report["pullRequestApproved"] is False
    assert report["ciWaitApproved"] is False
    assert report["reviewResolutionApproved"] is False
    assert report["mergeApproved"] is False
    assert report["remoteCleanupApproved"] is False
    assert report["automaticDeliveryApproved"] is False
    assert {step["stepId"] for step in report["ladder"]} == {
        "push-branch",
        "open-or-update-pr",
        "wait-for-ci",
        "resolve-review-comments",
        "merge-pr",
        "remote-cleanup",
    }
    assert {stage["stageId"] for stage in report["eligibilityStages"]} == {
        "push-pr-auto-eligible",
        "ci-review-auto-eligible",
        "merge-auto-eligible",
        "cleanup-auto-eligible",
    }
    assert all(step["status"] == "blocked" for step in report["ladder"])
    assert all(stage["status"] == "policy_defined_not_enabled" for stage in report["eligibilityStages"])
    assert any("Trusted delivery is evidence-gated" in rule for rule in report["trustedDeliveryPolicy"])
    assert any("pnpm run check passed locally" in condition for stage in report["eligibilityStages"] for condition in stage["eligibleWhen"])
    assert any("Provider execution" in rule for rule in report["trustedDeliveryPolicy"])
    assert any("green CI" in evidence for step in report["ladder"] for evidence in step["evidence"])
    assert any("plaintext tokens" in stop_condition for stop_condition in report["stopConditions"])
    assert any("one delivery step at a time" in action for action in report["nextSafeActions"])


def test_trusted_delivery_eligibility_report_evaluates_local_evidence_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "trusted-delivery-eligibility-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/trusted-delivery"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, " M services/supervisor/src/supervisor/application/service.py"
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "services/supervisor/src/supervisor/application/service.py | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, "M\tservices/supervisor/src/supervisor/application/service.py"
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    broad_workflow_scope_guard = api_main.service._trusted_delivery_diff_guard(
        diff_name_ok=True,
        diff_name_output="M\tdocs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md",
        status_ok=True,
        status_output="",
        approved_scope=["docs/workflows/**"],
    )
    assert broad_workflow_scope_guard["changedFiles"][0]["reason"] == "forbidden-path"

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/trusted-delivery-eligibility-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "trusted-delivery-eligibility-report-v1"
    assert report["readOnly"] is True
    assert report["automaticDeliveryApproved"] is False
    assert report["mergeAutoEligible"] is False
    assert report["cleanupAutoEligible"] is False
    assert report["baseBranch"] == "main"
    assert report["currentBranch"]
    assert {stage["stageId"] for stage in report["stages"]} == {
        "push-pr-auto-eligible",
        "ci-review-auto-eligible",
        "merge-auto-eligible",
        "cleanup-auto-eligible",
    }
    push_stage = next(stage for stage in report["stages"] if stage["stageId"] == "push-pr-auto-eligible")
    assert any(check["checkId"] == "local-check-evidence" for check in push_stage["checks"])
    checks = [check for stage in report["stages"] for check in stage["checks"]]
    assert {check["gateFamily"] for check in checks} >= {
        "scope",
        "local_verification",
        "ci",
        "merge_state",
        "evidence_retention",
        "cleanup_target",
        "authority_boundary",
    }
    blocked_reasons = {check["blockedReason"] for check in checks if check["status"] != "passed"}
    assert "local-verification-evidence-missing" in blocked_reasons
    assert "local-verification-evidence-stale" in blocked_reasons
    assert "ci-evidence-missing" in blocked_reasons
    assert "merge-state-evidence-missing" in blocked_reasons
    assert "cleanup-target-missing" in blocked_reasons
    assert any(check["status"] == "stale" for check in checks)
    assert any(
        check["gateFamily"] == "local_verification"
        and check["status"] == "blocked"
        and check["blockedReason"] == "unexpected-local-diff"
        for check in checks
    )
    assert any("working tree is dirty" in stop for stop in report["hardStops"])
    assert "no push, PR, CI wait, merge, cleanup" in report["summary"]


def test_trusted_delivery_eligibility_reports_pr_merge_cleanup_actions_separately(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "trusted-delivery-action-eligibility.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/trusted-delivery-eligibility-report")

    assert response.status_code == 200
    report = response.json()["data"]
    actions = {action["actionId"]: action for action in report["actionEligibility"]}
    assert set(actions) == {"pr", "merge", "cleanup"}
    assert actions["pr"]["executionApproved"] is False
    assert actions["merge"]["executionApproved"] is False
    assert actions["cleanup"]["executionApproved"] is False
    assert actions["pr"]["status"] == "blocked"
    assert actions["merge"]["status"] == "blocked"
    assert actions["cleanup"]["status"] == "blocked"
    assert actions["pr"]["blockedReasons"]
    assert actions["merge"]["blockedReasons"]
    assert actions["cleanup"]["blockedReasons"]

    fixtures = {fixture["fixtureId"]: fixture for fixture in report["actionEligibilityFixtures"]}
    all_green = fixtures["all-green-reporting-only"]["actions"]
    assert all(action["status"] == "eligible" for action in all_green)
    assert all(action["executionApproved"] is False for action in all_green)
    assert fixtures["missing-verification-blocks-pr"]["actions"][0]["blockedReasons"] == ["local-verification-evidence-missing"]
    assert fixtures["failed-ci-blocks-merge"]["actions"][1]["blockedReasons"] == ["ci-not-green"]
    assert fixtures["ambiguous-cleanup-target-fails-closed"]["actions"][2]["blockedReasons"] == ["cleanup-target-ambiguous"]
    assert "provider_expansion" in report["unrelatedAuthoritiesBlocked"]
    assert "failed_check_bypass" in report["unrelatedAuthoritiesBlocked"]


def test_trusted_delivery_diff_guard_classifies_scope_violations_and_blocks_green_gate(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "trusted-delivery-diff-guard.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-3"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, "\n".join(
                [
                    " M AGENTS.md",
                    " M docs/prds/dirty.md",
                    "?? scratch/outside.txt",
                ]
            )
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "services/supervisor/src/supervisor/application/service.py | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, "\n".join(
                [
                    "M\tservices/supervisor/src/supervisor/application/service.py",
                    "M\t_bmad-output/reviews/local-review.md",
                    "M\t_bmad/memory/knx/profile.md",
                    "M\ttools/local.user.toml",
                    "M\t.claude/skills/bmad-help/SKILL.md",
                    "M\t.agents/skills/knx-profile-setup/.decision-log.md",
                    "M\tskills/generated-example/SKILL.md",
                    "M\tnode_modules/.pnpm/lock.yaml",
                    "M\tservices/supervisor/.venv/pyvenv.cfg",
                    "M\tservices/supervisor/tests/__pycache__/test_api.cpython-312.pyc",
                    "M\t.vscode/settings.json",
                    "M\truntime/.batch_timer_state.json",
                    "M\tapps/dashboard/next-env.d.ts",
                    "M\tapps/dashboard/.vercel/project.json",
                    "M\tapps/dashboard/.pnp.cjs",
                    "M\tapps/dashboard/.yarn/cache/example.zip",
                    "M\tapps/dashboard/out/index.html",
                    "M\tapps/dashboard/tsconfig.tsbuildinfo",
                    "M\tdocs/workflows/unchecked-runbook.md",
                    "M\tdocs/workflows-private/unchecked-runbook.md",
                    "M\ttests-private/out-of-scope.test.ts",
                    "M\tdocs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md",
                    "M\tdocs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
                    "M\tdocs/linux-install/planning/lane-status.md",
                    "M\tdocs/linux-install/evidence/fresh-vm-full-check-2026-06-16.md",
                    "M\tdocs/stories/local-story.md",
                    "A\t.env.local",
                    "D\tdocs/prds/legacy.md",
                    "R100\tprivate/secrets.md\tservices/supervisor/src/supervisor/safe.py",
                    "M\tapps/dashboard/.next/cache/build-manifest.json",
                ]
            )
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/trusted-delivery-eligibility-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    guard = report["diffGuard"]
    assert guard["status"] == "blocked"
    assert guard["blockedReason"] == "diff-guard-out-of-scope"
    classifications = {item["path"]: item for item in guard["changedFiles"]}
    assert classifications["services/supervisor/src/supervisor/application/service.py"]["classification"] == "allowed"
    assert classifications["services/supervisor/src/supervisor/safe.py"]["classification"] == "allowed"
    assert classifications["_bmad-output/reviews/local-review.md"]["reason"] == "forbidden-path"
    assert classifications["_bmad/memory/knx/profile.md"]["reason"] == "forbidden-path"
    assert classifications["tools/local.user.toml"]["reason"] == "forbidden-path"
    assert classifications[".claude/skills/bmad-help/SKILL.md"]["reason"] == "forbidden-path"
    assert classifications[".agents/skills/knx-profile-setup/.decision-log.md"]["reason"] == "forbidden-path"
    assert classifications["skills/generated-example/SKILL.md"]["reason"] == "forbidden-path"
    assert classifications["node_modules/.pnpm/lock.yaml"]["reason"] == "forbidden-path"
    assert classifications["services/supervisor/.venv/pyvenv.cfg"]["reason"] == "forbidden-path"
    assert classifications["services/supervisor/tests/__pycache__/test_api.cpython-312.pyc"]["reason"] == "forbidden-path"
    assert classifications[".vscode/settings.json"]["reason"] == "forbidden-path"
    assert classifications["runtime/.batch_timer_state.json"]["reason"] == "forbidden-path"
    assert classifications["apps/dashboard/next-env.d.ts"]["reason"] == "forbidden-path"
    assert classifications["apps/dashboard/.vercel/project.json"]["reason"] == "forbidden-path"
    assert classifications["apps/dashboard/.pnp.cjs"]["reason"] == "forbidden-path"
    assert classifications["apps/dashboard/.yarn/cache/example.zip"]["reason"] == "forbidden-path"
    assert classifications["apps/dashboard/out/index.html"]["reason"] == "forbidden-path"
    assert classifications["apps/dashboard/tsconfig.tsbuildinfo"]["reason"] == "forbidden-path"
    assert classifications["docs/workflows/unchecked-runbook.md"]["reason"] == "changed-path-outside-approved-scope"
    assert classifications["docs/workflows-private/unchecked-runbook.md"]["reason"] == "changed-path-outside-approved-scope"
    assert classifications["tests-private/out-of-scope.test.ts"]["reason"] == "changed-path-outside-approved-scope"
    assert classifications["docs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md"]["reason"] == "forbidden-path"
    assert classifications["docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md"]["reason"] == "forbidden-path"
    assert classifications["docs/linux-install/planning/lane-status.md"]["reason"] == "forbidden-path"
    assert classifications["docs/linux-install/evidence/fresh-vm-full-check-2026-06-16.md"]["reason"] == "forbidden-path"
    assert classifications["docs/stories/local-story.md"]["reason"] == "forbidden-path"
    assert classifications["private/secrets.md"]["classification"] == "unexpected"
    assert classifications[".env.local"]["classification"] == "blocked"
    assert classifications["docs/prds/legacy.md"]["classification"] == "blocked"
    assert classifications["docs/prds/dirty.md"]["classification"] == "blocked"
    assert classifications["apps/dashboard/.next/cache/build-manifest.json"]["reason"] == "forbidden-path"
    assert classifications["scratch/outside.txt"]["reason"] == "untracked-file-outside-approved-scope"
    assert classifications["AGENTS.md"]["reason"] == "user-owned-dirty-file"
    assert set(guard["blockedPaths"]) == {
        ".env.local",
        "_bmad-output/reviews/local-review.md",
        "_bmad/memory/knx/profile.md",
        "tools/local.user.toml",
        ".claude/skills/bmad-help/SKILL.md",
        ".agents/skills/knx-profile-setup/.decision-log.md",
        "skills/generated-example/SKILL.md",
        "node_modules/.pnpm/lock.yaml",
        "services/supervisor/.venv/pyvenv.cfg",
        "services/supervisor/tests/__pycache__/test_api.cpython-312.pyc",
        ".vscode/settings.json",
        "runtime/.batch_timer_state.json",
        "apps/dashboard/next-env.d.ts",
        "apps/dashboard/.vercel/project.json",
        "apps/dashboard/.pnp.cjs",
        "apps/dashboard/.yarn/cache/example.zip",
        "apps/dashboard/out/index.html",
        "apps/dashboard/tsconfig.tsbuildinfo",
        "docs/workflows/unchecked-runbook.md",
        "docs/workflows-private/unchecked-runbook.md",
        "tests-private/out-of-scope.test.ts",
        "docs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md",
        "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
        "docs/linux-install/planning/lane-status.md",
        "docs/linux-install/evidence/fresh-vm-full-check-2026-06-16.md",
        "docs/stories/local-story.md",
        "docs/prds/legacy.md",
        "private/secrets.md",
        "docs/prds/dirty.md",
        "apps/dashboard/.next/cache/build-manifest.json",
        "scratch/outside.txt",
        "AGENTS.md",
    }
    assert "inspect, revise scope, revert, or abandon" in guard["recommendation"]

    push_stage = next(stage for stage in report["stages"] if stage["stageId"] == "push-pr-auto-eligible")
    diff_check = next(check for check in push_stage["checks"] if check["checkId"] == "diff-guard")
    assert diff_check["status"] == "blocked"
    assert diff_check["blockedReason"] == "diff-guard-out-of-scope"
    assert report["pushPrAutoEligible"] is False

    fixtures = {fixture["fixtureId"]: fixture for fixture in report["diffGuardFixtures"]}
    assert fixtures["positive-approved-paths"]["guard"]["status"] == "passed"
    assert fixtures["unexpected-file"]["guard"]["blockedReason"] == "diff-guard-out-of-scope"
    assert fixtures["forbidden-path"]["guard"]["blockedReason"] == "diff-guard-out-of-scope"
    assert fixtures["out-of-scope-deletion"]["guard"]["blockedReason"] == "diff-guard-out-of-scope"
    assert fixtures["generated-churn"]["guard"]["blockedReason"] == "diff-guard-out-of-scope"
    assert fixtures["untracked-file"]["guard"]["blockedReason"] == "diff-guard-out-of-scope"
    assert fixtures["user-owned-dirty-file"]["guard"]["blockedReason"] == "diff-guard-out-of-scope"


def test_local_cleanup_readiness_report_is_read_only_and_blocks_deletion(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "local-cleanup-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/local-cleanup-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "local-cleanup-readiness-report-v1"
    assert report["readOnly"] is True
    assert report["automaticCleanupApproved"] is False
    assert report["worktreeRemovalApproved"] is False
    assert report["branchDeletionApproved"] is False
    assert report["evidenceDeletionApproved"] is False
    assert {item["itemId"] for item in report["cleanupPolicy"]} == {
        "completed-worktree",
        "stale-worktree",
        "abandoned-attempt",
        "evidence-retention",
    }
    assert "main repository checkout" in report["blockedTargets"]
    assert any("Required evidence would be deleted" in stop_condition for stop_condition in report["stopConditions"])
    assert any("one local cleanup target at a time" in action for action in report["nextSafeActions"])


def test_remote_cleanup_sync_readiness_report_blocks_remote_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "remote-cleanup-sync-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/remote-cleanup-sync-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "remote-cleanup-sync-readiness-report-v1"
    assert report["readOnly"] is True
    assert report["remoteBranchDeletionApproved"] is False
    assert report["issueSyncApproved"] is False
    assert report["storyStatusSyncApproved"] is False
    assert report["remoteMutationApproved"] is False
    assert {item["itemId"] for item in report["syncPolicy"]} == {
        "remote-branch-cleanup",
        "issue-sync",
        "story-status-sync",
        "audit-retention",
    }
    assert any("GitHub tokens" in operation for operation in report["blockedOperations"])
    assert any("target is ambiguous" in stop_condition for stop_condition in report["stopConditions"])
    assert any("one remote cleanup or sync target at a time" in action for action in report["nextSafeActions"])


def test_trusted_autonomy_readiness_report_blocks_autonomous_execution(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "trusted-autonomy-readiness-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/trusted-autonomy-readiness-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "trusted-autonomy-readiness-report-v1"
    assert report["readOnly"] is True
    assert report["lowRiskAutonomyApproved"] is False
    assert report["autonomousProviderUseApproved"] is False
    assert report["autonomousGitHubDeliveryApproved"] is False
    assert report["autonomousCleanupApproved"] is False
    assert {gate["gateId"] for gate in report["autonomyGates"]} == {
        "repeatable-low-risk-work",
        "bounded-tools",
        "automatic-stop",
        "operator-visibility",
    }
    assert any("Codex or Claude launch" in item for item in report["blockedWork"])
    assert any("authority report says the action is blocked" in condition for condition in report["stopConditions"])
    assert any("one narrow workflow class" in action for action in report["nextSafeActions"])


def test_epic_6_completion_audit_report_shows_mvp_complete_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "epic-6-completion-audit-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/epic-6-completion-audit-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "epic-6-completion-audit-report-v1"
    assert report["readOnly"] is True
    assert report["epicComplete"] is True
    assert report["remoteDeliveryApproved"] is True
    assert report["providerExecutionApproved"] is False
    assert report["cleanupApproved"] is True
    assert report["overallStatus"] == "epic_6_mvp_complete"
    assert {item["itemId"] for item in report["completedItems"]} == {
        "local-readiness-stack",
        "delivery-packaging-plan",
        "local-cleanup-closeout",
        "dev-console-integration",
        "trusted-delivery-eligibility",
        "story-3-66-selection",
        "story-3-66-done-proof",
    }
    assert {item["itemId"] for item in report["remainingItems"]} == {
        "provider-and-review-execution",
        "post-mvp-autonomy",
    }
    assert "Treat Epic 6 MVP as complete" in report["recommendedApproval"]
    assert any("Merging, closing, or deleting" in operation for operation in report["blockedOperations"])
    assert any("PR #97" in evidence for evidence in report["requiredEvidence"])
    assert any("worktree is dirty" in condition for condition in report["stopConditions"])
    assert any(
        "docs/workflows/implementation-evidence-boundary.md" in evidence
        for item in report["completedItems"]
        for evidence in item["evidence"]
    )
    assert any(
        "a750601af1d0144507f6cc05b3ca1ada676d2d07" in evidence
        for item in report["completedItems"]
        for evidence in item["evidence"]
    )


def test_epic_6_mvp_proof_trial_report_shows_done_evidence_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "epic-6-mvp-proof-trial-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/epic-6-mvp-proof-trial-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "epic-6-mvp-proof-trial-report-v1"
    assert report["readOnly"] is True
    assert report["codexLaunchApproved"] is True
    assert report["claudeLaunchApproved"] is False
    assert report["providerExpansionApproved"] is False
    assert report["autonomousDeliveryApproved"] is False
    assert report["selectedStory"] == "Story 3.66: docs/workflows/implementation-evidence-boundary.md"
    assert report["trialStatus"] == "epic_6_mvp_proof_complete"
    assert {step["stepId"] for step in report["steps"]} == {
        "select-real-story",
        "bounded-codex-implementation",
        "local-and-ollama-checks",
        "bounded-claude-review",
        "github-delivery",
        "done-evidence",
    }
    assert any("GitHub delivery, merge, and cleanup approvals completed" in packet for packet in report["approvalPackets"])
    assert any("raw prompts" in operation for operation in report["blockedOperations"])
    assert any("Story 3.66 scope expands" in condition for condition in report["stopConditions"])
    assert all(
        step["status"] == "completed"
        for step in report["steps"]
        if step["stepId"] in {
            "select-real-story",
            "bounded-codex-implementation",
            "local-and-ollama-checks",
            "github-delivery",
            "done-evidence",
        }
    )
    assert any(
        "Candidate Work 8afea99f-bb79-4f51-a66c-f1b02dff9005" in evidence
        for step in report["steps"]
        for evidence in step["evidence"]
    )
    assert any(
        "runtime-evidence-export-a8e43bba-a2dd-4b2e-b995-22fecea85611" in evidence
        for step in report["steps"]
        for evidence in step["evidence"]
    )
    assert any(
        "https://github.com/slawdawg/Kendall-vnxt/pull/97" in evidence
        for step in report["steps"]
        for evidence in step["evidence"]
    )


def test_delivery_readiness_policy_report_documents_review_gate_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-readiness-policy-report.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/delivery-readiness-policy-report")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

    report = response.json()["data"]
    assert report["reportId"] == "delivery-readiness-policy-report-v1"
    assert report["readOnly"] is True
    assert report["executionAuthorityApproved"] is False
    assert report["remoteAutomationApproved"] is False
    assert {item["itemId"] for item in report["statusPolicy"]} == {"pull-request-status", "ci-status", "merge-status"}
    assert {item["itemId"] for item in report["waiverPolicy"]} == {"local-only-waiver", "checkpoint-form-only"}
    assert any("remote delivery automation" in stop_line for stop_line in report["stopLines"])
    assert any("delivery readiness checkpoint form" in stop_line for stop_line in report["stopLines"])


def test_low_risk_delivery_plan_reports_dry_run_actions_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "low-risk-delivery-plan.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    def fail_remote_delivery_commands(item) -> list[dict]:
        raise AssertionError("low-risk delivery plan must not execute remote delivery commands")

    service._remote_delivery_commands = fail_remote_delivery_commands  # type: ignore[method-assign]

    with TestClient(app) as client:
        response = client.get("/supervisor/low-risk-delivery-plan")

    assert response.status_code == 200
    report = response.json()["data"]
    assert report["reportId"] == "low-risk-delivery-plan-report-v1"
    assert report["readOnly"] is True
    assert report["remoteMutationApproved"] is False
    assert report["cleanupApproved"] is False
    assert report["automaticDeliveryApproved"] is False
    assert {action["actionId"] for action in report["actions"]} == {"pr", "merge", "cleanup"}
    assert all(action["readOnly"] is True for action in report["actions"])
    policy_by_action = {action["actionId"]: action["requiredPolicy"] for action in report["actions"]}
    assert policy_by_action["pr"] == "low-risk-delivery-policy-v1"
    assert policy_by_action["merge"] == "low-risk-delivery-policy-v1"
    assert policy_by_action["cleanup"] == "low-risk-cleanup-policy-v1"
    assert all("policy-missing" in action["blockedReasons"] for action in report["actions"])
    assert all(action["status"] == "blocked" for action in report["actions"])
    assert all(action["eligible"] is False for action in report["actions"])
    assert all(action["allowedOperations"] == [] for action in report["actions"])
    assert any("would block push and PR creation" in effect for action in report["actions"] for effect in action["dryRunEffects"])
    cleanup_action = next(action for action in report["actions"] if action["actionId"] == "cleanup")
    assert any("would block worktree removal" in effect for effect in cleanup_action["dryRunEffects"])
    assert any("would block local branch deletion" in effect for effect in cleanup_action["dryRunEffects"])
    assert any("no push, PR mutation, merge, branch deletion" in report["summary"] for _ in [report])
    assert any("provider calls" in stop for stop in report["hardStops"])


def test_work_item_low_risk_delivery_plan_is_report_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "work-item-low-risk-delivery-plan.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    def fail_remote_delivery_commands(item) -> list[dict]:
        raise AssertionError("work-item delivery plan must not execute remote delivery commands")

    service._remote_delivery_commands = fail_remote_delivery_commands  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Low-risk delivery plan fixture",
                "requestedOutcome": "Preview PR, merge, and cleanup plan.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events
    report = response.json()["data"]
    assert report["workItemId"] == work_item_id
    assert report["readOnly"] is True
    assert report["prRef"] is None
    pr_action = next(action for action in report["actions"] if action["actionId"] == "pr")
    merge_action = next(action for action in report["actions"] if action["actionId"] == "merge")
    cleanup_action = next(action for action in report["actions"] if action["actionId"] == "cleanup")
    assert pr_action["status"] == "blocked"
    assert pr_action["eligible"] is False
    assert pr_action["allowedOperations"] == []
    assert "policy-missing" in pr_action["blockedReasons"]
    assert merge_action["status"] == "blocked"
    assert cleanup_action["status"] == "blocked"
    assert any("would block merge" in effect for effect in merge_action["dryRunEffects"])
    assert any("would block worktree removal" in effect for effect in cleanup_action["dryRunEffects"])
    assert any("would block local branch deletion" in effect for effect in cleanup_action["dryRunEffects"])


def test_work_item_low_risk_delivery_plan_blocks_stale_pr_head(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "work-item-low-risk-delivery-plan-stale-head.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Stale PR head fixture",
                "requestedOutcome": "Preview stale PR head blocking.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/999",
                    "pullRequestStatus": "open",
                    "pullRequestHeadRevision": "stale-head",
                    "ciStatus": "passed",
                    "mergeStatus": "ready",
                    "deliveryWaived": True,
                    "deliveryWaiverReason": "fixture review accepted",
                },
            },
        )
        work_item_id = created.json()["data"]["id"]
        response = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan")

    assert response.status_code == 200
    report = response.json()["data"]
    merge_action = next(action for action in report["actions"] if action["actionId"] == "merge")
    assert merge_action["status"] == "blocked"
    assert merge_action["eligible"] is False
    assert "stale-pr-head" in merge_action["blockedReasons"]
    assert "policy-missing" in merge_action["blockedReasons"]
    assert merge_action["allowedOperations"] == []


def test_low_risk_delivery_plan_blocks_green_stage_when_policy_is_missing(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "low-risk-delivery-plan-green-stage-policy-missing.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import service
    from supervisor.api.schemas import TrustedDeliveryEligibilityCheckView, TrustedDeliveryEligibilityStageEvaluationView

    stage = TrustedDeliveryEligibilityStageEvaluationView(
        stageId="push-pr-auto-eligible",
        label="Push and PR",
        status="eligible",
        eligible=True,
        checks=[
            TrustedDeliveryEligibilityCheckView(
                checkId="local-check-result",
                label="Local check result",
                gateFamily="local_verification",
                status="passed",
                summary="Local check passed.",
                evidence=["status=passed", "exitCode=0"],
            )
        ],
        allowedOperations=["push named branch", "open or update one PR"],
        blockedOperations=["merge", "cleanup"],
        nextAction="Request exact approval before execution.",
    )
    action = service._low_risk_delivery_plan_action(  # type: ignore[attr-defined]
        stage,
        action_id="pr",
        label="PR delivery",
        binding_blockers=[],
        delivery_evidence={},
        required_approval="Exact approval required.",
        dry_run_ready=["would push branch codex/story-10-1", "would open or update exactly one pull request"],
        dry_run_blocked=["would block push and PR creation until all PR delivery gates are green"],
    )

    assert action.status == "blocked"
    assert action.eligible is False
    assert action.allowedOperations == []
    assert "policy-missing" in action.blockedReasons
    assert "push named branch" in action.blockedOperations
    assert "would push branch codex/story-10-1" in action.dryRunEffects


def test_low_risk_delivery_plan_requires_pr_url_for_merge_binding(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "low-risk-delivery-plan-missing-pr-url.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import service
    from supervisor.api.schemas import TrustedDeliveryEligibilityCheckView, TrustedDeliveryEligibilityStageEvaluationView

    stage = TrustedDeliveryEligibilityStageEvaluationView(
        stageId="merge-auto-eligible",
        label="Merge",
        status="eligible",
        eligible=True,
        checks=[
            TrustedDeliveryEligibilityCheckView(
                checkId="merge-state",
                label="Merge state",
                gateFamily="merge_state",
                status="passed",
                summary="Merge checks passed.",
                evidence=["mergeStatus=ready", "ciStatus=passed", "reviewState=approved"],
            )
        ],
        allowedOperations=["merge approved eligible PR"],
        blockedOperations=["cleanup", "force push"],
        nextAction="Request exact approval before execution.",
    )
    blockers = service._low_risk_delivery_binding_blockers(  # type: ignore[attr-defined]
        SimpleNamespace(currentBranch="codex/story-10-2", headRevision="fixture-head"),
        {
            "executionBranch": "codex/story-10-2",
            "pullRequestHeadRevision": "fixture-head",
            "ciStatus": "passed",
            "reviewState": "approved",
            "mergeStatus": "ready",
        },
        action_id="merge",
    )
    action = service._low_risk_delivery_plan_action(  # type: ignore[attr-defined]
        stage,
        action_id="merge",
        label="Merge",
        binding_blockers=blockers,
        delivery_evidence={"pullRequestHeadRevision": "fixture-head"},
        required_approval="Exact approval required.",
        dry_run_ready=["would merge the approved PR"],
        dry_run_blocked=["would block merge until PR evidence is current"],
    )

    assert "pull-request-url-missing" in blockers
    assert action.status == "blocked"
    assert action.eligible is False
    assert "pull-request-url-missing" in action.blockedReasons
    assert "policy-missing" in action.blockedReasons
    assert action.allowedOperations == []
    assert action.dryRunEffects == ["would block merge until PR evidence is current"]


def test_delivery_execution_evidence_without_policy_is_report_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-report-only.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Report-only delivery evidence fixture",
                "requestedOutcome": "Request delivery evidence without policy.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-not-policy",
                "commandShape": "gh pr create --fill",
                "expectedBranch": "codex/story-10-2",
                "expectedHeadRevision": "fixture-head",
                "baseBranch": "main",
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/998",
                "pullRequestHeadRevision": "fixture-head",
                "ciStatus": "passed",
                "reviewState": "approved",
                "mergeStatus": "merged",
                "terminalStatus": "completed",
                "summary": "Synthetic metadata-only PR evidence.",
                "artifactRefs": ["delivery-plan://dry-run"],
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events
    evidence = response.json()["data"]
    assert evidence["mode"] == "report_only_readiness"
    assert evidence["status"] == "blocked"
    assert evidence["eventRecorded"] is False
    assert "policy-missing" in evidence["blockedReasons"]
    assert evidence["remoteMutationPerformed"] is False
    assert evidence["cleanupAllowed"] is False
    assert evidence["rawOutputRetained"] is False


def test_delivery_execution_evidence_records_stale_rejection_without_delivery_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-stale.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Stale delivery evidence fixture",
                "requestedOutcome": "Reject stale delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "merge",
                "recordEvent": True,
                "approvalId": "approval-stale-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": "codex/story-10-2",
                "expectedHeadRevision": "stale-head",
                "baseBranch": "main",
                "pullRequestHeadRevision": "newer-head",
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/999",
                "ciStatus": "passed",
                "reviewState": "approved",
                "mergeStatus": "ready",
                "mergeResult": "squash_merge_ready",
                "commandShape": "gh pr merge 999 --squash --delete-branch",
                "terminalStatus": "completed",
                "summary": "Synthetic metadata-only stale merge evidence.",
                "artifactRefs": ["delivery-plan://stale"],
                "recoveryPath": "inspect retained stale merge metadata before retry",
            },
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["status"] == "rejected"
    assert evidence["eventRecorded"] is True
    assert "branch-head-mismatch" in evidence["blockedReasons"]
    assert "stale-pr-head" in evidence["blockedReasons"]
    assert "merge-not-recorded" in evidence["blockedReasons"]
    event = next(event for event in events if event["eventType"] == "delivery_execution.rejected")
    assert event["payload"]["remoteMutationPerformed"] is False
    assert event["payload"]["cleanupAllowed"] is False
    assert event["payload"]["rawOutputRetained"] is False


def test_delivery_execution_evidence_rejects_missing_binding_fields(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-missing-binding.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Missing binding delivery evidence fixture",
                "requestedOutcome": "Reject incomplete approved delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-missing-binding-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "ciStatus": "passed",
                "reviewState": "approved",
                "mergeStatus": "ready",
                "artifactRefs": ["delivery-evidence://missing-binding"],
            },
        )
        updated = client.get(f"/work-items/{work_item_id}").json()["data"]

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["status"] == "rejected"
    assert evidence["eventRecorded"] is True
    assert "commandShape-missing" in evidence["blockedReasons"]
    assert "expectedHeadRevision-missing" in evidence["blockedReasons"]
    assert "pull-request-url-missing" in evidence["blockedReasons"]
    assert "pr-head-evidence-missing" in evidence["blockedReasons"]
    assert "deliveryExecutionEvidence" not in updated["metadata"]


def test_delivery_execution_evidence_rejects_retention_boundary_payload(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-retention-boundary.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Retention boundary delivery evidence fixture",
                "requestedOutcome": "Reject raw delivery evidence retention.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-1004"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-pr-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1004",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-retention-boundary-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1001",
                "ciStatus": "passed",
                "reviewState": "approved",
                "mergeStatus": "ready",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "summary": "Raw prompt from provider should never be retained.",
                "artifactRefs": ["delivery-evidence://pr-1001"],
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        updated = client.get(f"/work-items/{work_item_id}").json()["data"]

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["status"] == "rejected"
    assert evidence["eventRecorded"] is True
    assert "summary-retention-boundary" in evidence["blockedReasons"]
    event = next(event for event in events if event["eventType"] == "delivery_execution.rejected")
    assert event["payload"]["rawOutputRetained"] is False
    assert "Raw prompt" not in event["payload"]["summary"]
    assert event["payload"]["summary"] == "[redacted retention-boundary]"
    assert "deliveryExecutionEvidence" not in updated["metadata"]


def test_delivery_execution_evidence_exact_policy_without_approval_is_report_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-policy-only.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Policy-only delivery evidence fixture",
                "requestedOutcome": "Keep policy-only delivery evidence report-only.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1003",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "summary": "Synthetic metadata-only policy evidence.",
                "artifactRefs": ["delivery-evidence://policy-only"],
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events
    evidence = response.json()["data"]
    assert evidence["mode"] == "report_only_readiness"
    assert evidence["eventRecorded"] is False
    assert "policy-missing" in evidence["blockedReasons"]


def test_delivery_execution_evidence_rejects_unknown_approval_id_without_approved_metadata(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-unknown-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Unknown approval fixture",
                "requestedOutcome": "Reject arbitrary delivery approval ids.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-1004"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-pr-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1004",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "arbitrary-approval-id",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1006",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": ["delivery-evidence://pr-1006"],
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )
        updated = client.get(f"/work-items/{work_item_id}").json()["data"]
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["status"] == "rejected"
    assert evidence["eventRecorded"] is True
    assert "approval-id-unknown" in evidence["blockedReasons"]
    assert evidence["approvalReference"] is None
    assert evidence["externalMutationRecorded"] is False
    assert "deliveryExecutionEvidence" not in updated["metadata"]
    event = next(event for event in events if event["eventType"] == "delivery_execution.rejected")
    assert event["payload"]["approvalReference"] is None


def test_delivery_execution_evidence_rejects_expired_approval_ledger_entry(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-expired-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Expired approval fixture",
                "requestedOutcome": "Reject expired delivery approval ids.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-expired"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-expired-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1007",
                    artifact_refs=artifact_refs,
                    expires_at="2000-01-01T00:00:00+00:00",
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-expired-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1007",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert "approval-expired" in evidence["blockedReasons"]
    assert evidence["approvalReference"] is None


def test_delivery_execution_evidence_rejects_ambiguous_approval_ledger_id(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-ambiguous-approval.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Ambiguous approval fixture",
                "requestedOutcome": "Reject duplicate approval ledger ids.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-ambiguous"]
        approval_entry = _delivery_approval_entry(
            approval_id="approval-ambiguous-fixture",
            work_item_id=work_item_id,
            action_id="pr",
            plan=plan,
            pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1008",
            artifact_refs=artifact_refs,
        )
        _write_delivery_approval_ledger(db_path, work_item_id, [approval_entry, dict(approval_entry)])
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-ambiguous-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1008",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["approvalReference"] is None
    assert "approval-id-ambiguous" in evidence["blockedReasons"]


def test_delivery_execution_evidence_rejects_retained_evidence_mismatch(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-retained-evidence-mismatch.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Retained evidence mismatch fixture",
                "requestedOutcome": "Reject approval replay with missing retained evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-retained-evidence-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1009",
                    artifact_refs=["delivery-evidence://pr-1009", "delivery-evidence://review-1009"],
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-retained-evidence-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1009",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": ["delivery-evidence://pr-1009"],
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["approvalReference"] is None
    assert "approval-retained-evidence-mismatch" in evidence["blockedReasons"]


def test_delivery_execution_evidence_rejects_operator_mismatch(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-operator-mismatch.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Operator mismatch fixture",
                "requestedOutcome": "Reject approval used by a different operator.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-operator-mismatch"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-operator-mismatch-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1010",
                    artifact_refs=artifact_refs,
                    approved_by="Alice",
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-operator-mismatch-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1010",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["approvalReference"] is None
    assert "approval-operator-mismatch" in evidence["blockedReasons"]


def test_delivery_execution_evidence_rejects_trusted_current_pr_state_mismatch(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-current-pr-state-mismatch.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Trusted current PR mismatch fixture",
                "requestedOutcome": "Reject stale payload replay against current delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-current-state"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-current-state-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1011",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        _append_delivery_execution_metadata(
            db_path,
            work_item_id,
            {
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1012",
                "pullRequestHeadRevision": plan["headRevision"],
                "ciStatus": "passed",
                "reviewState": "approved",
            },
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-current-state-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1011",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert evidence["approvalReference"] is None
    assert "approval-pr-url-mismatch" in evidence["blockedReasons"]


def test_delivery_execution_evidence_records_pr_without_merge_status(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-pr-no-merge-status.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Approved PR evidence fixture",
                "requestedOutcome": "Record approved PR evidence without merge readiness.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-1004"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-pr-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1004",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-pr-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1004",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only PR evidence recorded.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained PR metadata before merge",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "approved_pr_action_recorded"
    assert evidence["blockedReasons"] == []
    assert evidence["externalMutationRecorded"] is True
    assert evidence["remoteMutationPerformed"] is False
    assert evidence["approvalReference"] == "approval-pr-fixture"


def test_delivery_execution_evidence_rejects_completed_nonzero_exit_code(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-nonzero-completed.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Nonzero completed delivery evidence fixture",
                "requestedOutcome": "Reject completed delivery evidence with nonzero exit code.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-nonzero"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-nonzero-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1005",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-nonzero-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1005",
                "ciStatus": "passed",
                "reviewState": "approved",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "completed",
                "exitCode": 1,
                "summary": "Synthetic metadata-only PR evidence rejected.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained PR metadata before retry",
            },
        )

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_rejected_stale"
    assert "exit-code-nonzero" in evidence["blockedReasons"]


def test_delivery_execution_evidence_records_failed_action_metadata_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-failed.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Failed delivery evidence fixture",
                "requestedOutcome": "Record failed delivery evidence without mutation.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://pr-1002"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-failed-pr-fixture",
                    work_item_id=work_item_id,
                    action_id="pr",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1002",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "pr",
                "recordEvent": True,
                "approvalId": "approval-failed-pr-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestHeadRevision": plan["headRevision"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1002",
                "ciStatus": "passed",
                "reviewState": "approved",
                "mergeStatus": "ready",
                "commandShape": "gh pr create --fill",
                "terminalStatus": "failed",
                "exitCode": 1,
                "summary": "Synthetic metadata-only failed PR evidence recorded.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained failed PR metadata before retry",
            },
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        updated = client.get(f"/work-items/{work_item_id}").json()["data"]

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "delivery_action_failed"
    assert evidence["status"] == "failed"
    assert evidence["eventRecorded"] is True
    assert evidence["blockedReasons"] == []
    assert evidence["remoteMutationPerformed"] is False
    event = next(event for event in events if event["eventType"] == "delivery_execution.failed")
    assert event["payload"]["mode"] == "delivery_action_failed"
    metadata = updated["metadata"]
    assert metadata["deliveryExecutionEvidence"][-1]["status"] == "failed"


def test_delivery_execution_evidence_records_approved_merge_metadata_only(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "delivery-execution-evidence-approved.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Approved delivery evidence fixture",
                "requestedOutcome": "Record approved delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        work_item_id = created.json()["data"]["id"]
        plan = client.get(f"/work-items/{work_item_id}/low-risk-delivery-plan").json()["data"]
        artifact_refs = ["delivery-evidence://merge-1000"]
        _write_delivery_approval_ledger(
            db_path,
            work_item_id,
            [
                _delivery_approval_entry(
                    approval_id="approval-merge-fixture",
                    work_item_id=work_item_id,
                    action_id="merge",
                    plan=plan,
                    pull_request_url="https://github.com/slawdawg/Kendall-vnxt/pull/1000",
                    merge_status="merged",
                    artifact_refs=artifact_refs,
                )
            ],
        )
        response = client.post(
            f"/work-items/{work_item_id}/delivery-execution-evidence",
            json={
                "actionId": "merge",
                "recordEvent": True,
                "approvalId": "approval-merge-fixture",
                "policyId": "low-risk-delivery-policy-v1",
                "actorLabel": "Operator",
                "expectedBranch": plan["currentBranch"],
                "expectedHeadRevision": plan["headRevision"],
                "pullRequestHeadRevision": plan["headRevision"],
                "baseBranch": plan["baseBranch"],
                "pullRequestUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/1000",
                "ciStatus": "passed",
                "reviewState": "approved",
                "mergeStatus": "merged",
                "mergeResult": "squash_merge_ready",
                "commandShape": "gh pr merge 1000 --squash --delete-branch",
                "terminalStatus": "completed",
                "exitCode": 0,
                "summary": "Synthetic metadata-only merge evidence recorded.",
                "artifactRefs": artifact_refs,
                "recoveryPath": "inspect retained merge metadata before cleanup",
            },
        )
        events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        updated = client.get(f"/work-items/{work_item_id}").json()["data"]

    assert response.status_code == 200
    evidence = response.json()["data"]
    assert evidence["mode"] == "approved_merge_action_recorded"
    assert evidence["status"] == "recorded"
    assert evidence["eventRecorded"] is True
    assert evidence["blockedReasons"] == []
    assert evidence["remoteMutationPerformed"] is False
    assert evidence["cleanupAllowed"] is False
    assert evidence["rawOutputRetained"] is False
    assert evidence["externalMutationRecorded"] is True
    assert evidence["artifactRefs"] == ["delivery-evidence://merge-1000"]
    assert evidence["approvalReference"] == "approval-merge-fixture"
    event = next(event for event in events if event["eventType"] == "delivery_execution.recorded")
    assert event["payload"]["commandShape"] == "gh pr merge 1000 --squash --delete-branch"
    assert "rawOutput" not in event["payload"]
    metadata = updated["metadata"]
    assert metadata["pullRequestHeadRevision"] == plan["headRevision"]
    assert metadata["deliveryExecutionEvidence"][-1]["mode"] == "approved_merge_action_recorded"


def test_cleanup_plan_classifies_filesystem_residue_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-residue.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    target_path = (tmp_path / "worktrees" / "codex-story-10-3").as_posix()
    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup residue fixture",
                "requestedOutcome": "Plan cleanup for a residue-only target.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupTargetPath": target_path,
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": False,
                    "cleanupTargetInsideApprovedRoot": True,
                    "cleanupResidue": [
                        {"kind": ".pytest_cache", "path": f"{target_path}/.pytest_cache"},
                        {"kind": ".mypy_cache", "path": f"{target_path}/.mypy_cache"},
                        {"kind": ".ruff_cache", "path": f"{target_path}/.ruff_cache"},
                        {"kind": "temp-test-output", "path": f"{target_path}/tmp/test-output"},
                        {"kind": ".venv", "path": f"{target_path}/.venv"},
                    ],
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "approved_merge_action_recorded",
                            "status": "recorded",
                            "mergeStatus": "merged",
                            "artifactRefs": ["delivery-evidence://merge-1003"],
                            "recoveryPath": "inspect retained merge evidence before cleanup",
                        }
                    ],
                },
            },
        )
        work_item_id = created.json()["data"]["id"]
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get(f"/work-items/{work_item_id}/cleanup-plan")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events
    plan = response.json()["data"]
    assert plan["readOnly"] is True
    assert plan["cleanupAllowed"] is False
    assert plan["remoteMutationApproved"] is False
    assert plan["branchDeletionApproved"] is False
    assert plan["gitWorktreeState"] == "not_registered"
    assert plan["filesystemState"] == "residue_only"
    assert plan["retainedEvidence"] == ["delivery-evidence://merge-1003"]
    assert [item["kind"] for item in plan["residue"]] == [".pytest_cache", ".mypy_cache", ".ruff_cache", "temp-test-output", ".venv"]
    assert plan["sourceFileState"] == "none"
    assert plan["sourceFiles"] == []
    assert all(item["insideApprovedTarget"] is True for item in plan["residue"])
    assert "policy-missing" in plan["blockedReasons"]
    assert "git worktree removal would be skipped because target is filesystem residue" in plan["dryRunEffects"]


def test_cleanup_plan_blocks_missing_retained_evidence(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-missing-evidence.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup missing evidence fixture",
                "requestedOutcome": "Block cleanup without retained evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupTargetPath": (tmp_path / "missing-evidence").as_posix(),
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": True,
                    "cleanupTargetInsideApprovedRoot": True,
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert plan["status"] == "blocked"
    assert "retained-evidence-missing" in plan["blockedReasons"]
    assert "Record or preserve metadata-only delivery evidence before cleanup." in plan["nextSafeActions"]


def test_cleanup_plan_blocks_unsafe_path_crossing(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-unsafe-path.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup unsafe path fixture",
                "requestedOutcome": "Block cleanup outside approved target.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupTargetPath": "/tmp/outside-kendall-cleanup-target",
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": True,
                    "cleanupTargetInsideApprovedRoot": False,
                    "cleanupBlockedPaths": ["/tmp/outside-kendall-cleanup-target"],
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "approved_merge_action_recorded",
                            "status": "recorded",
                            "mergeStatus": "merged",
                            "artifactRefs": ["delivery-evidence://merge-unsafe"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert plan["filesystemState"] == "unsafe_outside_target"
    assert "cleanup-target-outside-approved-root" in plan["blockedReasons"]
    assert "blocked-path-present" in plan["blockedReasons"]
    assert plan["cleanupAllowed"] is False


def test_cleanup_plan_blocks_missing_approved_root_proof(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-missing-approved-root.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup missing approved-root proof fixture",
                "requestedOutcome": "Block cleanup when approved-root proof is missing.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupPolicyId": "low-risk-cleanup-policy-v1",
                    "cleanupTargetPath": (tmp_path / "missing-approved-root").as_posix(),
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": True,
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "approved_merge_action_recorded",
                            "status": "recorded",
                            "mergeStatus": "merged",
                            "artifactRefs": ["delivery-evidence://merge-missing-approved-root"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert plan["status"] == "blocked"
    assert plan["cleanupAllowed"] is False
    assert "cleanup-target-approved-root-missing" in plan["blockedReasons"]
    assert "cleanup-target-outside-approved-root" not in plan["blockedReasons"]


def test_cleanup_plan_blocks_failed_delivery_evidence(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-failed-delivery.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup failed delivery fixture",
                "requestedOutcome": "Block cleanup after failed delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupTargetPath": (tmp_path / "failed-delivery").as_posix(),
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": True,
                    "cleanupTargetInsideApprovedRoot": True,
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "delivery_action_failed",
                            "status": "failed",
                            "artifactRefs": ["delivery-evidence://failed-pr"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert "delivery-evidence-failed" in plan["blockedReasons"]
    assert plan["cleanupAllowed"] is False
    assert any("failed delivery" in action for action in plan["nextSafeActions"])


def test_cleanup_plan_reports_source_files_and_ambiguous_target_action(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-source-ambiguous.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup source ambiguous fixture",
                "requestedOutcome": "Report source files and target ambiguity.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupTargetGitRegistered": True,
                    "cleanupTargetInsideApprovedRoot": True,
                    "cleanupSourceFiles": ["services/supervisor/src/changed.py"],
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "approved_merge_action_recorded",
                            "status": "recorded",
                            "mergeStatus": "merged",
                            "artifactRefs": ["delivery-evidence://merge-source"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert plan["sourceFileState"] == "present"
    assert plan["sourceFiles"] == ["services/supervisor/src/changed.py"]
    assert "source-files-present" in plan["blockedReasons"]
    assert "cleanup-target-ambiguous" in plan["blockedReasons"]
    assert "Identify one exact disposable cleanup target path before approval." in plan["nextSafeActions"]
    assert "Separate unexpected source files from residue before cleanup." in plan["nextSafeActions"]


def test_cleanup_plan_blocks_stale_delivery_evidence(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-stale-delivery.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup stale delivery fixture",
                "requestedOutcome": "Block cleanup after stale delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupTargetPath": (tmp_path / "stale-delivery").as_posix(),
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": True,
                    "cleanupTargetInsideApprovedRoot": True,
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "delivery_action_rejected_stale",
                            "status": "rejected",
                            "artifactRefs": ["delivery-evidence://stale-pr"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert "delivery-evidence-stale" in plan["blockedReasons"]
    assert "delivery-evidence-not-merged" in plan["blockedReasons"]
    assert "Refresh delivery evidence so cleanup binds to current branch, PR, and retained artifacts." in plan["nextSafeActions"]


def test_cleanup_plan_blocks_pr_only_delivery_evidence(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-pr-only-delivery.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup PR-only delivery fixture",
                "requestedOutcome": "Block cleanup before merge delivery evidence.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupPolicyId": "low-risk-cleanup-policy-v1",
                    "cleanupTargetPath": (tmp_path / "pr-only-delivery").as_posix(),
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": True,
                    "cleanupTargetInsideApprovedRoot": True,
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "approved_pr_action_recorded",
                            "status": "recorded",
                            "artifactRefs": ["delivery-evidence://pr-only"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert plan["status"] == "blocked"
    assert "delivery-evidence-not-merged" in plan["blockedReasons"]
    assert plan["cleanupAllowed"] is False


def test_cleanup_plan_blocks_residue_path_outside_target(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "cleanup-plan-unsafe-residue.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    target_path = (tmp_path / "worktrees" / "codex-story-10-3").as_posix()
    outside_path = (tmp_path / "outside" / ".venv").as_posix()
    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cleanup unsafe residue fixture",
                "requestedOutcome": "Block cleanup when residue crosses target path.",
                "source": "test",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "executionBranch": "codex/story-10-3",
                    "cleanupPolicyId": "low-risk-cleanup-policy-v1",
                    "cleanupTargetPath": target_path,
                    "cleanupTargetExists": True,
                    "cleanupTargetGitRegistered": False,
                    "cleanupTargetInsideApprovedRoot": True,
                    "cleanupResidue": [{"kind": ".venv", "path": outside_path}],
                    "deliveryExecutionEvidence": [
                        {
                            "mode": "approved_merge_action_recorded",
                            "status": "recorded",
                            "mergeStatus": "merged",
                            "artifactRefs": ["delivery-evidence://merge-unsafe-residue"],
                        }
                    ],
                },
            },
        )
        response = client.get(f"/work-items/{created.json()['data']['id']}/cleanup-plan")

    assert response.status_code == 200
    plan = response.json()["data"]
    assert "unsafe-residue-path" in plan["blockedReasons"]
    assert plan["residue"][0]["insideApprovedTarget"] is False
    assert plan["residue"][0]["safeToRemoveAfterApproval"] is False


def test_execution_attempt_rejects_local_readonly_without_provider_calls(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-local-readonly.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Reject local read-only attempt",
                "requestedOutcome": "Record disabled execution authority for a local read-only route.",
                "source": "operator-dashboard:test",
                "riskLevel": "low",
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        before_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        attempt_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts",
            json={"taskKind": "evidence_summary", "stepId": "evidence-summary"},
        )
        after_item = client.get(f"/work-items/{work_item_id}").json()["data"]
        events_response = client.get(f"/work-items/{work_item_id}/events")

    assert attempt_response.status_code == 200
    attempt = attempt_response.json()["data"]
    assert attempt["status"] == "rejected"
    assert attempt["lane"] == "local_readonly"
    assert attempt["workerId"] == "local.readonly.mock"
    assert attempt["rejectionReason"] == "execution_authority_not_enabled_for_local_readonly"
    assert attempt["workspaceIsolationPlan"]["readRoots"] == ["."]
    assert attempt["workspaceIsolationPlan"]["writeRoots"] == []
    assert ".env" in attempt["workspaceIsolationPlan"]["forbiddenPaths"]
    assert attempt["workspaceIsolationPlan"]["sourceMutationAllowed"] is False
    assert before_item == after_item

    event = next(event for event in events_response.json()["data"] if event["eventType"] == "execution_attempt.rejected")
    assert event["payload"]["attemptId"] == attempt["attemptId"]
    assert event["payload"]["workspaceIsolationPlan"]["artifactRoot"] == attempt["workspaceIsolationPlan"]["artifactRoot"]
    assert event["payload"]["providerCallsAllowed"] is False
    assert event["payload"]["modelCallsAllowed"] is False
    assert event["payload"]["commandExecutionAllowed"] is False
    assert event["payload"]["sourceMutationAllowed"] is False
    assert event["payload"]["networkAllowed"] is False
    assert event["payload"]["credentialAccessAllowed"] is False
    assert event["payload"]["boundaryId"] == "supervisor-worker-threat-boundary-v1"
    assert event["payload"]["boundaryRejectionReason"] == "execution_authority_not_enabled_for_local_readonly"


def test_execution_attempt_rejects_disabled_subscription_handoff_and_missing_work_item(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-subscription.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        missing_response = client.get("/work-items/missing/execution-attempts")
        created = client.post(
            "/work-items",
            json={
                "title": "Reject subscription handoff attempt",
                "requestedOutcome": "Record disabled execution authority for subscription-routed work.",
                "source": "operator-dashboard:test",
                "riskLevel": "high",
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]
        attempt_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts",
            json={"taskKind": "bounded_recipe_implementation", "stepId": "implementation"},
        )
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert missing_response.status_code == 404
    assert attempt_response.status_code == 200
    attempt = attempt_response.json()["data"]
    assert attempt["status"] == "rejected"
    assert attempt["lane"] == "subscription_handoff"
    assert attempt["workerId"] == "subscription.handoff"
    assert attempt["rejectionReason"] == "direct_subscription_launch_not_enabled"
    assert history_response.json()["data"][0]["attemptId"] == attempt["attemptId"]


def test_execution_attempt_lifecycle_records_cancel_history_without_execution(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-lifecycle-cancel.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Cancel planned execution attempt",
                "requestedOutcome": "Record a non-executing cancellation lifecycle.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        attempt_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts",
            json={"actorId": "operator-1", "actorLabel": "Primary operator"},
        )
        attempt = attempt_response.json()["data"]

        cancel_requested_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "cancel_requested",
                "reason": "operator paused the route",
                "actorId": "operator-1",
                "actorLabel": "Primary operator",
            },
        )
        cancelled_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "cancelled",
                "reason": "operator confirmed cancellation",
                "actorId": "operator-1",
                "actorLabel": "Primary operator",
            },
        )
        terminal_transition_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={"status": "completed"},
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert cancel_requested_response.status_code == 200
    cancel_requested = cancel_requested_response.json()["data"]
    assert cancel_requested["status"] == "cancel_requested"
    assert cancel_requested["cancelReason"] == "operator paused the route"
    assert cancel_requested["cancelRequestedAt"] is not None

    assert cancelled_response.status_code == 200
    cancelled = cancelled_response.json()["data"]
    assert cancelled["status"] == "cancelled"
    assert cancelled["cancelReason"] == "operator confirmed cancellation"
    assert cancelled["completedAt"] is not None
    assert [event_ref["eventType"] for event_ref in cancelled["eventRefs"]] == [
        "execution_attempt.planned",
        "execution_attempt.cancel_requested",
        "execution_attempt.cancelled",
    ]

    assert terminal_transition_response.status_code == 409
    assert terminal_transition_response.json()["detail"]["error"]["code"] == "invalid_execution_attempt_transition"

    events = events_response.json()["data"]
    cancel_event = next(event for event in events if event["eventType"] == "execution_attempt.cancel_requested")
    assert cancel_event["actorType"] == "operator"
    assert cancel_event["payload"]["previousStatus"] == "planned"
    assert cancel_event["payload"]["status"] == "cancel_requested"
    assert cancel_event["payload"]["executionAllowed"] is False
    assert cancel_event["payload"]["processLaunchAllowed"] is False
    assert cancel_event["payload"]["providerCallsAllowed"] is False
    assert cancel_event["payload"]["sourceMutationAllowed"] is False

    history = history_response.json()["data"]
    assert history[0]["attemptId"] == attempt["attemptId"]
    assert history[0]["status"] == "cancelled"


def test_execution_attempt_lifecycle_records_completion_and_rejects_invalid_transition(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-lifecycle-complete.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Complete planned execution attempt",
                "requestedOutcome": "Record non-executing completion lifecycle metadata.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})
        attempt = attempt_response.json()["data"]
        completed_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={"status": "completed", "reason": "mock lifecycle finished"},
        )
        second_attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})

        rejected_work_item = client.post(
            "/work-items",
            json={
                "title": "Reject invalid lifecycle transition",
                "requestedOutcome": "Record disabled execution authority for local read-only.",
                "source": "operator-dashboard:test",
                "riskLevel": "low",
            },
        )
        rejected_work_item_id = rejected_work_item.json()["data"]["id"]
        rejected_attempt_response = client.post(
            f"/work-items/{rejected_work_item_id}/execution-attempts",
            json={"taskKind": "evidence_summary", "stepId": "evidence-summary"},
        )
        rejected_attempt = rejected_attempt_response.json()["data"]
        invalid_transition_response = client.post(
            f"/work-items/{rejected_work_item_id}/execution-attempts/{rejected_attempt['attemptId']}/lifecycle",
            json={"status": "cancel_requested", "reason": "cannot cancel rejected attempt"},
        )
        missing_attempt_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/missing/lifecycle",
            json={"status": "completed"},
        )

    assert completed_response.status_code == 200
    completed = completed_response.json()["data"]
    assert completed["status"] == "completed"
    assert completed["completedAt"] is not None
    assert completed["eventRefs"][-1]["eventType"] == "execution_attempt.completed"

    assert second_attempt_response.status_code == 200
    assert second_attempt_response.json()["data"]["status"] == "planned"

    assert invalid_transition_response.status_code == 409
    assert "terminal with status rejected" in invalid_transition_response.json()["detail"]["error"]["message"]
    assert missing_attempt_response.status_code == 404


def test_execution_attempt_approval_requires_route_worker_lane_and_authority_binding(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-approval-binding.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Approve route-bound execution attempt",
                "requestedOutcome": "Record an approval only when it binds to the current attempt route.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})
        attempt = attempt_response.json()["data"]
        missing_binding_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={"status": "approved", "reason": "operator approves this attempt"},
        )
        approved_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "route-bound operator approval",
                "routeDecisionId": attempt["routeDecisionId"],
                "workerId": attempt["workerId"],
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
                "actorId": "operator-1",
                "actorLabel": "Primary operator",
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert missing_binding_response.status_code == 409
    assert missing_binding_response.json()["detail"]["error"]["code"] == "invalid_execution_attempt_transition"
    assert "routeDecisionId" in missing_binding_response.json()["detail"]["error"]["message"]

    assert approved_response.status_code == 200
    approved = approved_response.json()["data"]
    assert approved["status"] == "approved"
    assert approved["eventRefs"][-1]["eventType"] == "execution_attempt.approved"

    approved_event = next(event for event in events_response.json()["data"] if event["eventType"] == "execution_attempt.approved")
    assert approved_event["actorType"] == "operator"
    assert approved_event["actorLabel"] == "Primary operator"
    assert approved_event["payload"]["previousStatus"] == "planned"
    assert approved_event["payload"]["approvalBinding"] == {
        "routeDecisionId": attempt["routeDecisionId"],
        "attemptId": attempt["attemptId"],
        "workerId": attempt["workerId"],
        "selectedLane": attempt["lane"],
        "authorityMode": attempt["authorityMode"],
    }
    assert "process_launch" in approved_event["payload"]["remainingDisabled"]
    assert "model_api_calls" in approved_event["payload"]["remainingDisabled"]
    assert approved_event["payload"]["executionAllowed"] is False
    assert approved_event["payload"]["providerCallsAllowed"] is False
    assert approved_event["payload"]["sourceMutationAllowed"] is False

    history = history_response.json()["data"]
    assert history[0]["attemptId"] == attempt["attemptId"]
    assert history[0]["status"] == "approved"


def test_execution_attempt_approval_rejects_stale_or_mismatched_binding_without_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "execution-attempt-approval-mismatch.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Reject stale route-bound approval",
                "requestedOutcome": "Reject approval when route, worker, lane, or authority does not match.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]

        attempt_response = client.post(f"/work-items/{work_item_id}/execution-attempts", json={})
        attempt = attempt_response.json()["data"]
        stale_route_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "stale route approval",
                "routeDecisionId": "route-stale",
                "workerId": attempt["workerId"],
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
            },
        )
        worker_mismatch_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "wrong worker approval",
                "routeDecisionId": attempt["routeDecisionId"],
                "workerId": "subscription.handoff",
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert stale_route_response.status_code == 409
    assert "routeDecisionId" in stale_route_response.json()["detail"]["error"]["message"]
    assert worker_mismatch_response.status_code == 409
    assert "workerId" in worker_mismatch_response.json()["detail"]["error"]["message"]

    events = events_response.json()["data"]
    assert [event["eventType"] for event in events if event["eventType"] == "execution_attempt.approved"] == []
    history = history_response.json()["data"]
    assert history[0]["attemptId"] == attempt["attemptId"]
    assert history[0]["status"] == "planned"


def test_supervised_codex_launch_dry_run_records_terminal_attempt_evidence(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervised-codex-launch-dry-run.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-4"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, ""
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "docs/workflows/implementation-evidence-boundary.md | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, "M\tdocs/workflows/implementation-evidence-boundary.md"
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/supervised-codex-launch",
            json={
                "taskId": "story-7-4-readiness-evidence-clarity",
                "dryRun": True,
                "allowedPaths": ["docs/workflows/implementation-evidence-boundary.md"],
                "blockedPaths": [".env*", ".git/**", "node_modules/**", "services/supervisor/.venv/**"],
                "verificationCommand": "pnpm run check",
                "outputSummary": "Dry-run supervised Codex launch retained metadata-only evidence.",
                "touchedFiles": ["docs/workflows/implementation-evidence-boundary.md"],
            },
        )
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    attempt = response.json()["data"]
    assert attempt["status"] == "completed"
    assert attempt["workerId"] == "codex.local.supervised"
    assert attempt["lane"] == "utility"
    assert attempt["authorityMode"] == "operator_approved_bounded_source_mutation"
    assert attempt["workspaceIsolationPlan"]["writesAllowed"] is True
    assert attempt["workspaceIsolationPlan"]["sourceMutationAllowed"] is True
    assert attempt["workspaceIsolationPlan"]["commandsAllowed"] is True
    assert attempt["workspaceIsolationPlan"]["credentialAccessAllowed"] is False
    launch_evidence = next(ref for ref in attempt["artifactRefs"] if ref["artifactType"] == "supervised_codex_launch_evidence")
    assert launch_evidence["dryRun"] is True
    assert launch_evidence["commandShape"] == "codex <bounded task packet> --cwd <isolated-worktree>"
    assert launch_evidence["verificationCommand"] == "pnpm run check"
    assert launch_evidence["touchedFiles"] == ["docs/workflows/implementation-evidence-boundary.md"]
    assert launch_evidence["terminalState"] == "completed"
    assert launch_evidence["recoveryPath"] == "inspect retained worktree evidence before retry, revert, or delivery"
    assert len(history_response.json()["data"]) == 1
    assert len(after_events) == len(before_events) + 2
    event_types = {event["eventType"] for event in after_events[:2]}
    assert event_types == {"execution_attempt.completed", "execution_attempt.supervised_codex_launch_started"}
    completed_event = next(event for event in after_events if event["eventType"] == "execution_attempt.completed")
    assert completed_event["payload"]["prCreationAllowed"] is False
    assert completed_event["payload"]["mergeAllowed"] is False
    assert completed_event["payload"]["cleanupAllowed"] is False


def test_supervised_codex_launch_real_mutation_requires_green_diff_guard(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervised-codex-launch-blocked.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-4"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, "?? scratch/outside.txt"
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "scratch/outside.txt | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, ""
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/supervised-codex-launch",
            json={
                "taskId": "story-7-4-real-launch",
                "dryRun": False,
                "allowedPaths": ["docs/workflows/implementation-evidence-boundary.md"],
                "blockedPaths": [".env*", ".git/**", "node_modules/**", "services/supervisor/.venv/**"],
                "verificationCommand": "pnpm run check",
                "outputSummary": "Attempt real launch.",
                "touchedFiles": ["scratch/outside.txt"],
            },
        )
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 409
    assert response.json()["detail"]["error"]["code"] == "invalid_supervised_codex_launch"
    assert "diff guard" in response.json()["detail"]["error"]["message"]
    assert after_events == before_events


def test_supervised_codex_launch_real_mutation_scopes_diff_guard_to_request_paths(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervised-codex-launch-request-scope.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-4"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, ""
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "services/supervisor/src/supervisor/application/service.py | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, "M\tservices/supervisor/src/supervisor/application/service.py"
        return False, "unexpected git command"

    def fail_launch(payload, attempt_id: str) -> dict:
        raise AssertionError("real launch runner must not start when request scope excludes committed diff")

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)
    monkeypatch.setattr(api_main.service, "_run_supervised_codex_worker", fail_launch)

    now = datetime.now(timezone.utc)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        response = client.post(
            f"/work-items/{work_item_id}/supervised-codex-launch",
            json={
                "taskId": "story-7-4-real-launch",
                "dryRun": False,
                "allowedPaths": ["docs/workflows/implementation-evidence-boundary.md"],
                "blockedPaths": [".env*", ".git/**", "node_modules/**", "services/supervisor/.venv/**"],
                "verificationCommand": "pnpm run check",
                "outputSummary": "Attempt real launch.",
                "touchedFiles": ["docs/workflows/implementation-evidence-boundary.md"],
                "routeDecisionId": "supervised-codex-story-7-4-real-launch",
                "workerId": "codex.local.supervised",
                "lane": "utility",
                "authorityMode": "operator_approved_bounded_source_mutation",
                "approvalTimestamp": now.isoformat(),
                "expiresAt": (now + timedelta(minutes=10)).isoformat(),
            },
        )
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert response.status_code == 409
    assert "diff guard" in response.json()["detail"]["error"]["message"]
    assert history_response.json()["data"] == []


def test_supervised_codex_launch_real_mutation_requires_live_binding_and_invokes_runner(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervised-codex-launch-real-bound.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-4"
        if command == ("git", "rev-parse", "--short", "HEAD"):
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, ""
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "docs/workflows/implementation-evidence-boundary.md | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, "M\tdocs/workflows/implementation-evidence-boundary.md"
        return False, "unexpected git command"

    launched: list[str] = []

    def fake_launch(payload, attempt_id: str) -> dict:
        launched.append(attempt_id)
        return {
            "status": "completed",
            "commandShape": "node ./scripts/codex-workspace.mjs start <bounded task> --mode experiment",
            "workspaceOrBranch": "repo_owned_codex_workspace",
            "summary": "Repo-owned Codex workspace launch exited with code 0.",
            "exitCode": 0,
            "durationMs": 44,
            "processLaunchAttempted": True,
        }

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)
    monkeypatch.setattr(api_main.service, "_run_supervised_codex_worker", fake_launch)

    now = datetime.now(timezone.utc)
    base_payload = {
        "taskId": "story-7-4-real-launch",
        "dryRun": False,
        "allowedPaths": ["docs/workflows/implementation-evidence-boundary.md"],
        "blockedPaths": [".env*", ".git/**", "node_modules/**", "services/supervisor/.venv/**"],
        "verificationCommand": "pnpm run check",
        "outputSummary": "Attempt real launch.",
        "touchedFiles": ["docs/workflows/implementation-evidence-boundary.md"],
    }
    binding = {
        "routeDecisionId": "supervised-codex-story-7-4-real-launch",
        "workerId": "codex.local.supervised",
        "lane": "utility",
        "authorityMode": "operator_approved_bounded_source_mutation",
        "approvalTimestamp": now.isoformat(),
        "expiresAt": (now + timedelta(minutes=10)).isoformat(),
        "actorId": "operator-1",
        "actorLabel": "Primary operator",
    }

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        missing_binding = client.post(f"/work-items/{work_item_id}/supervised-codex-launch", json=base_payload)
        approved = client.post(f"/work-items/{work_item_id}/supervised-codex-launch", json={**base_payload, **binding})

    assert missing_binding.status_code == 409
    assert "approval binding" in missing_binding.json()["detail"]["error"]["message"]
    assert approved.status_code == 200
    attempt = approved.json()["data"]
    assert attempt["status"] == "completed"
    assert launched == [attempt["attemptId"]]
    launch_evidence = next(ref for ref in attempt["artifactRefs"] if ref["artifactType"] == "supervised_codex_launch_evidence")
    assert launch_evidence["processLaunchAttempted"] is True
    assert launch_evidence["workspaceOrBranch"] == "repo_owned_codex_workspace"


def test_supervised_codex_scope_rejects_traversal_and_absolute_paths(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "supervised-codex-scope-paths.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import service

    allowed = ["docs/workflows/**", "docs/stories/**"]
    blocked = [".env*", ".git/**", "node_modules/**", "docs/stories/**"]

    assert service._path_allowed_for_supervised_codex_launch("docs/workflows/approved-runbook.md", allowed, blocked) is True
    assert service._path_allowed_for_supervised_codex_launch("docs/workflows-private/approved-runbook.md", allowed, blocked) is False
    assert service._path_allowed_for_supervised_codex_launch("docs/workflows/../secrets.env", allowed, blocked) is False
    assert service._path_allowed_for_supervised_codex_launch(
        "/tmp/outside-kendall-cleanup-target/docs/workflows/approved-runbook.md", allowed, blocked
    ) is False
    assert service._path_allowed_for_supervised_codex_launch("/docs/workflows/approved-runbook.md", allowed, blocked) is False
    assert service._path_allowed_for_supervised_codex_launch("docs/stories/approved-story.md", allowed, blocked) is False


def test_verification_evidence_records_result_and_recovery_metadata(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "verification-evidence-record.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api import main as api_main

    def fake_git_output(args: list[str]) -> tuple[bool, str]:
        command = tuple(args)
        if command == ("git", "branch", "--show-current"):
            return True, "codex/story-7-5"
        if command in {
            ("git", "rev-parse", "--short", "HEAD"),
            ("git", "rev-parse", "HEAD"),
        }:
            return True, "abc1234"
        if command == ("git", "status", "--porcelain=v1"):
            return True, ""
        if command == ("git", "rev-parse", "--verify", "main"):
            return True, "main"
        if command == ("git", "rev-list", "--count", "main..HEAD"):
            return True, "1"
        if command == ("git", "diff", "--stat", "main...HEAD"):
            return True, "docs/workflows/implementation-evidence-boundary.md | 1 +"
        if command == ("git", "diff", "--name-status", "main...HEAD"):
            return True, "M\tdocs/workflows/implementation-evidence-boundary.md"
        return False, "unexpected git command"

    monkeypatch.setattr(api_main.service, "_git_output", fake_git_output)

    def fake_verification_command(command_shape: str) -> dict:
        assert command_shape == "pnpm run check"
        return {
            "status": "passed",
            "exitCode": 0,
            "durationMs": 132000,
            "summary": "Approved verification command exited with code 0.",
            "recoveryAction": "retain evidence for green-gate evaluation",
        }

    monkeypatch.setattr(api_main.service, "_run_execution_attempt_verification_command", fake_verification_command)

    with TestClient(api_main.app) as client:
        work_item_id = _create_routing_work_item(client)
        launch_response = client.post(
            f"/work-items/{work_item_id}/supervised-codex-launch",
            json={
                "taskId": "story-7-5-verification-evidence",
                "dryRun": True,
                "allowedPaths": ["docs/workflows/implementation-evidence-boundary.md"],
                "blockedPaths": [".env*", ".git/**", "node_modules/**", "services/supervisor/.venv/**"],
                "verificationCommand": "pnpm run check",
                "outputSummary": "Launch evidence ready for verification.",
                "touchedFiles": ["docs/workflows/implementation-evidence-boundary.md"],
            },
        )
        attempt = launch_response.json()["data"]
        response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/verification-evidence",
            json={
                "commandId": "full-check",
                "label": "Full workspace check",
                "commandShape": "pnpm run check",
                "status": "passed",
                "exitCode": 0,
                "durationMs": 132000,
                "summary": "Full check passed with existing aiosqlite warning.",
                "artifactRef": "_bmad-output/execution-attempts/check-summary.txt",
                "recoveryAction": "retain evidence for green-gate evaluation",
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        runtime_export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")
        readiness_response = client.get(f"/work-items/{work_item_id}/trusted-delivery-eligibility-report")
        second_launch_response = client.post(
            f"/work-items/{work_item_id}/supervised-codex-launch",
            json={
                "taskId": "story-7-5-newer-unverified-launch",
                "dryRun": True,
                "allowedPaths": ["docs/workflows/implementation-evidence-boundary.md"],
                "blockedPaths": [".env*", ".git/**", "node_modules/**", "services/supervisor/.venv/**"],
                "verificationCommand": "pnpm run check",
                "outputSummary": "Newer launch requires fresh verification.",
                "touchedFiles": ["docs/workflows/implementation-evidence-boundary.md"],
            },
        )
        stale_readiness_response = client.get(f"/work-items/{work_item_id}/trusted-delivery-eligibility-report")

    assert response.status_code == 200
    updated = response.json()["data"]
    evidence = next(ref for ref in updated["artifactRefs"] if ref["artifactType"] == "verification_result")
    assert evidence["commandId"] == "full-check"
    assert evidence["commandShape"] == "pnpm run check"
    assert evidence["status"] == "passed"
    assert evidence["exitCode"] == 0
    assert evidence["durationMs"] == 132000
    assert evidence["summary"] == "Approved verification command exited with code 0."
    assert "recordedAt" in evidence
    assert evidence["worktreePath"] == "isolated_codex_worktree"
    assert evidence["branch"] == "codex/story-7-5"
    assert evidence["headRevision"] == "abc1234"
    assert evidence["retentionPolicy"] == "metadata_only_no_secrets_prompts_provider_payloads_or_source_copies"
    event = next(event for event in events_response.json()["data"] if event["eventType"] == "execution_attempt.verification_recorded")
    assert event["payload"]["prCreationAllowed"] is False
    assert event["payload"]["mergeAllowed"] is False
    assert event["payload"]["cleanupAllowed"] is False
    assert event["payload"]["rawOutputRetained"] is False
    assert "subscriptionLaunchVerification" not in event["payload"]
    assert runtime_export_response.json()["data"]["subscriptionLaunch"]["latestEventType"] is None
    assert readiness_response.status_code == 200
    readiness = readiness_response.json()["data"]
    push_stage = next(stage for stage in readiness["stages"] if stage["stageId"] == "push-pr-auto-eligible")
    local_result = next(check for check in push_stage["checks"] if check["checkId"] == "local-check-result")
    local_freshness = next(check for check in push_stage["checks"] if check["checkId"] == "local-check-freshness")
    assert local_result["status"] == "passed"
    assert local_freshness["status"] == "passed"
    assert readiness["pushPrAutoEligible"] is True
    assert second_launch_response.status_code == 200
    stale_readiness = stale_readiness_response.json()["data"]
    stale_push_stage = next(stage for stage in stale_readiness["stages"] if stage["stageId"] == "push-pr-auto-eligible")
    stale_local_result = next(check for check in stale_push_stage["checks"] if check["checkId"] == "local-check-result")
    assert stale_local_result["status"] == "blocked"
    assert stale_local_result["blockedReason"] == "local-verification-evidence-missing"
    assert stale_readiness["pushPrAutoEligible"] is False


def test_green_gate_verification_evidence_fixtures_cover_terminal_states(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "verification-evidence-fixtures.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        response = client.get("/supervisor/trusted-delivery-eligibility-report")

    assert response.status_code == 200
    report = response.json()["data"]
    fixtures = {fixture["fixtureId"]: fixture for fixture in report["verificationEvidenceFixtures"]}
    assert fixtures["verification-passed"]["evidence"]["status"] == "passed"
    assert fixtures["verification-passed"]["greenGateContribution"] == "local_verification_passed"
    assert fixtures["verification-failed"]["blockedReason"] == "local-verification-failed"
    assert fixtures["verification-timed-out"]["blockedReason"] == "local-verification-timed-out"
    assert fixtures["verification-could-not-run"]["blockedReason"] == "local-verification-could-not-run"
    assert fixtures["verification-not-recorded"]["blockedReason"] == "local-verification-evidence-missing"
    assert all(fixture["evidence"]["rawOutputRetained"] is False for fixture in fixtures.values())


def test_subscription_launch_approval_rejection_records_non_executing_event(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-launch-approval-rejection.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Reject incomplete subscription launch approval",
                "requestedOutcome": "Record incomplete subscription launch approval as non-executing evidence.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]
        attempt = client.post(f"/work-items/{work_item_id}/execution-attempts", json={}).json()["data"]

        rejection_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "incomplete launch approval",
                "workItemId": work_item_id,
                "attemptId": attempt["attemptId"],
                "routeDecisionId": attempt["routeDecisionId"],
                "workerId": attempt["workerId"],
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
                "workspacePlanId": attempt["workspaceIsolationPlan"]["planId"],
                "launchPolicyId": "subscription-launch-policy-disabled-v1",
                "commandTemplateId": "codex-subscription-cli-template-disabled-v1",
                "actorId": "operator-1",
                "approvalTimestamp": "2026-06-09T12:00:00Z",
                "expiresAt": "2026-06-09T12:05:00Z",
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert rejection_response.status_code == 409
    assert "targetId" in rejection_response.json()["detail"]["error"]["message"]

    events = events_response.json()["data"]
    rejection_event = next(event for event in events if event["eventType"] == "execution_attempt.approval_rejected")
    assert rejection_event["payload"]["processLaunchAttempted"] is False
    assert rejection_event["payload"]["shellExecutionAttempted"] is False
    assert rejection_event["payload"]["credentialAccessAttempted"] is False
    assert rejection_event["payload"]["externalSendAttempted"] is False
    assert rejection_event["payload"]["providedBinding"]["commandTemplateId"] == "codex-subscription-cli-template-disabled-v1"

    history = history_response.json()["data"]
    assert history[0]["status"] == "planned"
    assert history[0]["eventRefs"][-1]["eventType"] == "execution_attempt.approval_rejected"


def test_subscription_launch_approval_rejects_stale_policy_and_command_template(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "subscription-launch-stale-policy.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app, service

    service._repo_is_dirty = lambda: False  # type: ignore[method-assign]

    with TestClient(app) as client:
        created = client.post(
            "/work-items",
            json={
                "title": "Reject stale subscription launch approval",
                "requestedOutcome": "Record stale launch policy and command template approval as non-executing evidence.",
                "source": "operator-dashboard:test",
                "riskLevel": "medium",
                "metadata": {"executionRecipeId": "dashboard-test-coverage"},
            },
        )
        assert created.status_code == 200
        work_item_id = created.json()["data"]["id"]
        attempt = client.post(f"/work-items/{work_item_id}/execution-attempts", json={}).json()["data"]

        rejection_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "stale launch approval",
                "workItemId": work_item_id,
                "attemptId": attempt["attemptId"],
                "routeDecisionId": attempt["routeDecisionId"],
                "workerId": attempt["workerId"],
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
                "workspacePlanId": attempt["workspaceIsolationPlan"]["planId"],
                "launchPolicyId": "subscription-launch-policy-stale-v1",
                "targetId": "codex.subscription.disabled",
                "commandTemplateId": "codex-subscription-cli-template-stale-v1",
                "actorId": "operator-1",
                "approvalTimestamp": "2026-06-09T12:00:00Z",
                "expiresAt": "2026-06-09T12:05:00Z",
            },
        )
        events_response = client.get(f"/work-items/{work_item_id}/events")
        history_response = client.get(f"/work-items/{work_item_id}/execution-attempts")

    assert rejection_response.status_code == 409
    rejection_message = rejection_response.json()["detail"]["error"]["message"]
    assert "launchPolicyId" in rejection_message
    assert "commandTemplateId" in rejection_message

    events = events_response.json()["data"]
    rejection_event = next(event for event in events if event["eventType"] == "execution_attempt.approval_rejected")
    assert rejection_event["payload"]["processLaunchAttempted"] is False
    assert rejection_event["payload"]["providedBinding"]["launchPolicyId"] == "subscription-launch-policy-stale-v1"
    assert rejection_event["payload"]["providedBinding"]["commandTemplateId"] == "codex-subscription-cli-template-stale-v1"

    history = history_response.json()["data"]
    assert history[0]["status"] == "planned"
