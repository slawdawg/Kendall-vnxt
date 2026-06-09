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
    assert checks["local-provider-calls"]["disabledReason"] == "local_provider_http_calls_not_enabled"
    assert set(checks["local-provider-calls"]["affectedWorkers"]) == {
        "local.ollama.disabled",
        "local.lmstudio.disabled",
        "local.vllm.disabled",
        "local.llamacpp.disabled",
    }
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
        "docs/prds/index.md",
        "docs/stories/index.md",
    }
    assert report["approvalCheckpoint"]["path"].endswith("kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md")
    assert {story["storyId"] for story in report["blockedStories"]} == {"4.1", "4.2", "4.3", "4.4", "5.1", "5.2", "5.3", "5.4", "5.5"}
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
        "check-e2e-report",
        "check-reports",
        "check-execution-boundary",
        "check-execution-evidence",
        "check-provider-fixtures",
        "check-process-lifecycle",
        "check-runbooks",
        "check-runtime-export",
        "check-safe-backlog",
        "check-managed-recipes",
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
        "dashboard-e2e",
        "github-doctor-remote",
        "bootstrap-run-check",
    }
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
        "GET /supervisor/dashboard-e2e-report",
        "GET /supervisor/maintenance-readiness-report",
        "GET /supervisor/safe-development-backlog",
        "GET /supervisor/managed-recipe-policy-report",
        "GET /supervisor/github-workflow-policy-report",
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
        "dashboard-full-e2e",
    }
    runner_by_id = {runner["runnerId"]: runner for runner in report["runners"]}
    assert runner_by_id["dashboard-controls-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-detail-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-mobile-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-managed-recipe-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-managed-mobile-recipe-e2e"]["ownsServerLifecycle"] is True
    assert runner_by_id["dashboard-full-e2e"]["ownsServerLifecycle"] is False
    assert runner_by_id["dashboard-controls-e2e"]["command"] == "pnpm run test:e2e:dashboard:controls"
    assert runner_by_id["dashboard-detail-e2e"]["command"] == "pnpm run test:e2e:dashboard:detail"
    assert runner_by_id["dashboard-mobile-e2e"]["command"] == "pnpm run test:e2e:dashboard:mobile"
    assert runner_by_id["dashboard-managed-recipe-e2e"]["command"] == "pnpm run test:e2e:dashboard:managed"
    assert runner_by_id["dashboard-managed-mobile-recipe-e2e"]["command"] == "pnpm run test:e2e:dashboard:managed:mobile"
    assert "scripts/dashboard-e2e-runner.mjs" in " ".join(runner_by_id["dashboard-controls-e2e"]["evidence"])
    assert "scripts/dashboard-e2e-runner.mjs" in " ".join(runner_by_id["dashboard-detail-e2e"]["evidence"])
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
    assert "GET /supervisor/execution-readiness-report" in blocker_track["relatedReports"]
    verification_track = next(track for track in report["tracks"] if track["trackId"] == "verification-hygiene")
    assert "GET /supervisor/dashboard-e2e-report" in verification_track["relatedReports"]
    assert any("must not approve local provider/model calls" in stop_line for stop_line in report["stopLines"])
    assert any("coherent PRs" in action for action in report["nextSafeActions"])


def test_safe_development_backlog_report_prioritizes_large_safe_slices_without_mutation(tmp_path, monkeypatch) -> None:
    db_path = (tmp_path / "safe-development-backlog.db").as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    _reset_supervisor_modules()

    from supervisor.api.main import app

    with TestClient(app) as client:
        work_item_id = _create_routing_work_item(client)
        before_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]
        response = client.get("/supervisor/safe-development-backlog")
        after_events = client.get(f"/work-items/{work_item_id}/events").json()["data"]

    assert response.status_code == 200
    assert before_events == after_events

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
    assert "docs/stories/3-32-safe-development-backlog-drift-check.md" in verification_item["relatedDocs"]
    assert "docs/stories/3-35-runbook-check-chain-hardening.md" in verification_item["relatedDocs"]
    assert "docs/stories/3-37-managed-recipe-policy-drift-check.md" in verification_item["relatedDocs"]
    assert "docs/stories/3-38-runbook-managed-recipe-check-chain.md" in verification_item["relatedDocs"]
    assert "docs/stories/3-45-delivery-readiness-policy-drift-check.md" in verification_item["relatedDocs"]
    assert "docs/stories/3-46-maintenance-readiness-drift-check.md" in verification_item["relatedDocs"]
    github_item = next(item for item in report["items"] if item["itemId"] == "github-delivery-hygiene")
    assert github_item["recommendedSliceSize"] == "large"
    assert "GET /supervisor/github-workflow-policy-report" in github_item["relatedReports"]
    assert "GET /supervisor/delivery-readiness-policy-report" in github_item["relatedReports"]
    assert "docs/stories/3-42-github-workflow-policy-report.md" in github_item["relatedDocs"]
    assert "docs/stories/3-43-safe-delivery-hygiene.md" in github_item["relatedDocs"]
    assert "docs/stories/3-44-delivery-readiness-policy-report.md" in github_item["relatedDocs"]
    assert any("plaintext gh token" in evidence for evidence in github_item["evidence"])
    evidence_item = next(item for item in report["items"] if item["itemId"] == "read-only-evidence-polish")
    assert "docs/stories/3-33-evidence-overview-review-shortcuts.md" in evidence_item["relatedDocs"]
    assert "docs/stories/3-34-report-shortcuts-in-evidence-overview.md" in evidence_item["relatedDocs"]
    assert "docs/stories/3-39-report-shortcut-anchor-polish.md" in evidence_item["relatedDocs"]
    assert "GET /supervisor/maintenance-readiness-report" in report["items"][0]["relatedReports"]
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
    assert event["payload"]["processLaunchAllowed"] is False
    assert event["payload"]["executionAllowed"] is False


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
    assert "docs/stories/2-7-runtime-evidence-export-strategy.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-7-execution-readiness-and-evidence-report.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-8-queue-attempt-boundary-and-provider-proofs.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-20-runtime-evidence-review-manifest.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-22-dashboard-e2e-report.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-23-dashboard-e2e-runner-lifecycle-helper.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-24-dashboard-mobile-e2e-runner.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-25-managed-recipe-e2e-runners.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-26-dashboard-e2e-report-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-27-safe-development-backlog-report.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-28-supervisor-report-catalog-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-29-runbook-verification-alignment.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-30-runtime-evidence-review-navigator.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-31-runtime-evidence-export-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-32-safe-development-backlog-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-33-evidence-overview-review-shortcuts.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-34-report-shortcuts-in-evidence-overview.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-35-runbook-check-chain-hardening.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-37-managed-recipe-policy-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-38-runbook-managed-recipe-check-chain.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-39-report-shortcut-anchor-polish.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-40-runtime-report-anchor-links.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-41-current-gap-review-refresh.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-42-github-workflow-policy-report.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-43-safe-delivery-hygiene.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-44-delivery-readiness-policy-report.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-45-delivery-readiness-policy-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-46-maintenance-readiness-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-47-core-readiness-drift-checks.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-48-execution-boundary-report-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-49-execution-evidence-boundary-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-50-provider-fixture-policy-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "docs/stories/3-51-process-lifecycle-policy-drift-check.md" in export["boundary"]["gitBackedEvidence"]
    assert "GET /supervisor/execution-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/documentation-authority-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/verification-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/dashboard-e2e-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/report-catalog" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/maintenance-readiness-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/safe-development-backlog" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/managed-recipe-policy-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/github-workflow-policy-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/delivery-readiness-policy-report" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/execution-state-boundary" in export["boundary"]["relatedSupervisorReports"]
    assert "GET /supervisor/disabled-provider-proofs" in export["boundary"]["relatedSupervisorReports"]
    assert "environment variables and credential stores" in export["boundary"]["excludedState"]
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
    assert {item["itemId"] for item in export["reviewNavigator"]} == {
        "review-runtime-state",
        "review-authority-boundary",
        "review-git-backed-evidence",
    }
    authority_item = next(item for item in export["reviewNavigator"] if item["itemId"] == "review-authority-boundary")
    assert authority_item["priority"] == "P0"
    assert "GET /supervisor/threat-boundary" in authority_item["relatedReports"]
    assert any("not execution-authority approval" in stop_line for stop_line in authority_item["stopLines"])
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
