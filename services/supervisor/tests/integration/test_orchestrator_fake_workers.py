from supervisor.domain.orchestrator import (
    FakeOrchestratorGraph,
    FakeOrchestratorWorker,
    OrchestratorEvidenceBuilder,
    OrchestratorJobMetadata,
    OrchestratorJobState,
    OrchestratorLane,
    OrchestratorLaneSelector,
    OrchestratorRiskTier,
    OrchestratorTaskKind,
)


def test_orchestrator_selects_ollama_for_local_safe_reasoning() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-local-summary",
            task_kind=OrchestratorTaskKind.SUMMARY,
        )
    )

    assert evidence.selected_lane == OrchestratorLane.OLLAMA_API
    assert evidence.state == OrchestratorJobState.COMPLETED
    assert "cost.ollama_first" in evidence.reason_codes
    assert evidence.raw_prompt_retained is False
    assert evidence.raw_completion_retained is False
    assert evidence.raw_provider_payload_retained is False
    assert "task=summary" in evidence.task_metadata_summary
    assert evidence.budget_class == "economy"


def test_orchestrator_selects_codex_fake_worker_for_implementation_without_launch() -> None:
    selector = OrchestratorLaneSelector()
    worker = FakeOrchestratorWorker()
    metadata = OrchestratorJobMetadata(
        job_id="job-implementation",
        task_kind=OrchestratorTaskKind.CODE_IMPLEMENTATION,
        requires_repo_mutation=True,
        file_scope=("services/supervisor/src/supervisor/domain/orchestrator.py",),
        verification_command="pytest services/supervisor/tests/integration/test_orchestrator_fake_workers.py",
    )

    decision = selector.select(metadata)
    attempt = worker.run(decision, metadata)

    assert decision.selected_lane == OrchestratorLane.CODEX_CLI_WORKER
    assert "permissions.fake_worker_only" in decision.reason_codes
    assert attempt.process_launch_attempted is False
    assert attempt.external_send_attempted is False
    assert attempt.changed_files == metadata.file_scope
    assert attempt.worktree_required is True
    assert attempt.allowed_file_scope == metadata.file_scope
    assert attempt.verification_command == metadata.verification_command
    assert attempt.expected_artifacts == ("orchestrator/fake-workers/job-implementation/codex-summary.json",)
    assert "fake_codex.completed_without_process_launch" in attempt.reason_codes


def test_orchestrator_selects_claude_review_only_for_high_risk_work() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-high-risk-review",
            task_kind=OrchestratorTaskKind.CODE_IMPLEMENTATION,
            risk_tier=OrchestratorRiskTier.HIGH,
            requires_independent_review=True,
            file_scope=("services/supervisor/src/supervisor/application/service.py",),
        )
    )

    assert evidence.selected_lane == OrchestratorLane.CLAUDE_CODE_REVIEW_WORKER
    assert evidence.state == OrchestratorJobState.READY_FOR_OPERATOR
    assert "permissions.review_only_worker" in evidence.reason_codes
    assert "fake_claude.review_findings_without_process_launch" in evidence.reason_codes
    assert evidence.next_action == "review_findings_with_operator"
    assert evidence.worktree_required is False
    assert evidence.allowed_file_scope == ("services/supervisor/src/supervisor/application/service.py",)


def test_orchestrator_records_github_workflow_rail_requirement() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-github-rail",
            task_kind=OrchestratorTaskKind.GITHUB_WORKFLOW,
            requires_github_workflow=True,
        )
    )

    assert evidence.selected_lane == OrchestratorLane.GITHUB_WORKFLOW_RAIL
    assert evidence.state == OrchestratorJobState.READY_FOR_OPERATOR
    assert "fake_github.workflow_requirement_recorded" in evidence.reason_codes


def test_orchestrator_blocks_when_selected_lane_unavailable() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-codex-unavailable",
            task_kind=OrchestratorTaskKind.CODE_IMPLEMENTATION,
            requires_repo_mutation=True,
            unavailable_lanes=(OrchestratorLane.CODEX_CLI_WORKER,),
        )
    )

    assert evidence.selected_lane == OrchestratorLane.BLOCKED
    assert evidence.state == OrchestratorJobState.BLOCKED
    assert "lane.unavailable" in evidence.reason_codes
    assert "fake_worker.blocked_without_launch" in evidence.reason_codes
    assert evidence.blocker == "codex_cli_worker_unavailable"
    assert evidence.next_action == "ready_for_operator"


def test_orchestrator_blocks_when_ollama_unavailable_for_local_reasoning() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-ollama-unavailable",
            task_kind=OrchestratorTaskKind.LOCAL_REASONING,
            unavailable_lanes=(OrchestratorLane.OLLAMA_API,),
        )
    )

    assert evidence.selected_lane == OrchestratorLane.BLOCKED
    assert evidence.state == OrchestratorJobState.BLOCKED
    assert evidence.blocker == "ollama_api_unavailable"
    assert "lane.unavailable" in evidence.reason_codes


def test_orchestrator_claude_budget_exhausted_requires_operator_decision() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-claude-budget",
            task_kind=OrchestratorTaskKind.SECURITY_REVIEW,
            requires_independent_review=True,
            budget_class="scarce",
            budget_exhausted=True,
        )
    )

    assert evidence.selected_lane == OrchestratorLane.BLOCKED
    assert evidence.state == OrchestratorJobState.AWAITING_APPROVAL
    assert evidence.blocker == "budget_exhausted_requires_operator_decision"
    assert "budget.exhausted" in evidence.reason_codes
    assert evidence.next_action == "ready_for_operator"


def test_orchestrator_verification_failure_keeps_state_resumable() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-verification-failed",
            task_kind=OrchestratorTaskKind.TEST_UPDATE,
            requires_repo_mutation=True,
            file_scope=("services/supervisor/tests/integration/test_orchestrator_fake_workers.py",),
            verification_command="pytest services/supervisor/tests/integration/test_orchestrator_fake_workers.py",
            verification_failed=True,
            source_reference="story-6.1",
        )
    )

    assert evidence.selected_lane == OrchestratorLane.CODEX_CLI_WORKER
    assert evidence.state == OrchestratorJobState.FAILED
    assert evidence.verification_status == "failed"
    assert evidence.blocker == "verification_failed"
    assert evidence.source_reference == "story-6.1"
    assert evidence.next_action == "ready_for_operator"
    assert "verification.failed" in evidence.reason_codes


def test_orchestrator_scope_expansion_requires_approval() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-scope-expanded",
            task_kind=OrchestratorTaskKind.CODE_IMPLEMENTATION,
            requires_repo_mutation=True,
            file_scope=("services/supervisor/src/supervisor/domain/orchestrator.py",),
            scope_expanded=True,
        )
    )

    assert evidence.selected_lane == OrchestratorLane.BLOCKED
    assert evidence.state == OrchestratorJobState.AWAITING_APPROVAL
    assert evidence.blocker == "scope_expansion_requires_operator_approval"
    assert "approval.scope_expansion_required" in evidence.reason_codes


def test_orchestrator_conflicting_review_requires_operator_decision() -> None:
    graph = FakeOrchestratorGraph()

    evidence = graph.run(
        OrchestratorJobMetadata(
            job_id="job-conflicting-review",
            task_kind=OrchestratorTaskKind.CODE_REVIEW,
            requires_independent_review=True,
            conflicting_review=True,
        )
    )

    assert evidence.selected_lane == OrchestratorLane.CLAUDE_CODE_REVIEW_WORKER
    assert evidence.state == OrchestratorJobState.READY_FOR_OPERATOR
    assert evidence.blocker == "conflicting_review_requires_operator_decision"
    assert "review.conflicting_findings" in evidence.reason_codes
    assert evidence.next_action == "ready_for_operator"


def test_orchestrator_evidence_builder_does_not_require_worker_attempt() -> None:
    selector = OrchestratorLaneSelector()
    builder = OrchestratorEvidenceBuilder()
    decision = selector.select(
        OrchestratorJobMetadata(
            job_id="job-decision-only",
            task_kind=OrchestratorTaskKind.CHEAP_VALIDATION,
        )
    )

    evidence = builder.build(decision)

    assert evidence.selected_lane == OrchestratorLane.OLLAMA_API
    assert evidence.state == OrchestratorJobState.LANE_SELECTED
    assert evidence.next_action == "run_fake_worker"
    assert evidence.worker_status is None
    assert evidence.raw_prompt_retained is False
