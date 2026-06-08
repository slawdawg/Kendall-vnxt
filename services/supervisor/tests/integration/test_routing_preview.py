import asyncio
import sys

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


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

    from supervisor.api.main import app

    with TestClient(app) as client:
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
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        profiles_response = client.get("/routing/lane-profiles")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert utility.status_code == 200
    assert local.status_code == 200
    assert handoff.status_code == 200
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

    assert premium["lane"] == "premium_approval"
    assert premium["health"] == "disabled"
    assert premium["disabledReason"] == "premium_execution_requires_operator_approval_flow"


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
