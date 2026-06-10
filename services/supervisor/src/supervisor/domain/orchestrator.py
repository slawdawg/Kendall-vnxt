from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum


DEFAULT_ORCHESTRATOR_TIMESTAMP = datetime(1970, 1, 1, tzinfo=timezone.utc)


class OrchestratorLane(StrEnum):
    OLLAMA_API = "ollama_api"
    CODEX_CLI_WORKER = "codex_cli_worker"
    CLAUDE_CODE_REVIEW_WORKER = "claude_code_review_worker"
    GITHUB_WORKFLOW_RAIL = "github_workflow_rail"
    BLOCKED = "blocked"


class OrchestratorJobState(StrEnum):
    CREATED = "created"
    CLASSIFIED = "classified"
    LANE_SELECTED = "lane_selected"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    VERIFICATION_RUNNING = "verification_running"
    REVIEW_RUNNING = "review_running"
    BLOCKED = "blocked"
    FAILED = "failed"
    COMPLETED = "completed"
    READY_FOR_PR = "ready_for_pr"
    READY_FOR_BOB = "ready_for_bob"


class OrchestratorTaskKind(StrEnum):
    LOCAL_REASONING = "local_reasoning"
    TASK_CLASSIFICATION = "task_classification"
    SUMMARY = "summary"
    DRAFT_PLAN = "draft_plan"
    CHEAP_VALIDATION = "cheap_validation"
    CODE_IMPLEMENTATION = "code_implementation"
    DEBUGGING = "debugging"
    TEST_UPDATE = "test_update"
    CODE_REVIEW = "code_review"
    SECURITY_REVIEW = "security_review"
    GITHUB_WORKFLOW = "github_workflow"


class OrchestratorRiskTier(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FakeWorkerStatus(StrEnum):
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"


@dataclass(frozen=True)
class OrchestratorJobMetadata:
    job_id: str
    task_kind: OrchestratorTaskKind
    risk_tier: OrchestratorRiskTier = OrchestratorRiskTier.LOW
    budget_class: str = "economy"
    file_scope: tuple[str, ...] = ()
    requires_repo_mutation: bool = False
    requires_independent_review: bool = False
    requires_github_workflow: bool = False
    verification_command: str | None = None
    source_reference: str | None = None
    approvals: tuple[str, ...] = ()
    unavailable_lanes: tuple[OrchestratorLane, ...] = ()
    budget_exhausted: bool = False
    scope_expanded: bool = False
    verification_failed: bool = False
    conflicting_review: bool = False
    timeout_seconds: int = 120


@dataclass(frozen=True)
class OrchestratorLaneDecision:
    job_id: str
    selected_lane: OrchestratorLane
    state: OrchestratorJobState
    reason_codes: tuple[str, ...]
    blocked_reason: str | None = None
    created_at: datetime = DEFAULT_ORCHESTRATOR_TIMESTAMP


@dataclass(frozen=True)
class FakeWorkerAttempt:
    attempt_id: str
    job_id: str
    lane: OrchestratorLane
    status: FakeWorkerStatus
    state: OrchestratorJobState
    reason_codes: tuple[str, ...]
    artifact_refs: tuple[str, ...] = ()
    changed_files: tuple[str, ...] = ()
    verification_status: str | None = None
    task_metadata_summary: str = ""
    source_reference: str | None = None
    worktree_required: bool = False
    allowed_file_scope: tuple[str, ...] = ()
    verification_command: str | None = None
    expected_artifacts: tuple[str, ...] = ()
    timeout_seconds: int | None = None
    budget_class: str | None = None
    blocker: str | None = None
    raw_prompt_retained: bool = False
    raw_completion_retained: bool = False
    raw_provider_payload_retained: bool = False
    process_launch_attempted: bool = False
    external_send_attempted: bool = False


@dataclass(frozen=True)
class OrchestratorEvidenceRecord:
    job_id: str
    selected_lane: OrchestratorLane
    state: OrchestratorJobState
    reason_codes: tuple[str, ...]
    worker_status: str | None = None
    task_metadata_summary: str = ""
    source_reference: str | None = None
    artifact_refs: tuple[str, ...] = ()
    changed_files: tuple[str, ...] = ()
    verification_status: str | None = None
    worktree_required: bool = False
    allowed_file_scope: tuple[str, ...] = ()
    verification_command: str | None = None
    expected_artifacts: tuple[str, ...] = ()
    timeout_seconds: int | None = None
    budget_class: str | None = None
    blocker: str | None = None
    next_action: str = "ready_for_bob"
    raw_prompt_retained: bool = False
    raw_completion_retained: bool = False
    raw_provider_payload_retained: bool = False


class OrchestratorLaneSelector:
    _OLLAMA_TASKS = {
        OrchestratorTaskKind.LOCAL_REASONING,
        OrchestratorTaskKind.TASK_CLASSIFICATION,
        OrchestratorTaskKind.SUMMARY,
        OrchestratorTaskKind.DRAFT_PLAN,
        OrchestratorTaskKind.CHEAP_VALIDATION,
    }
    _CODEX_TASKS = {
        OrchestratorTaskKind.CODE_IMPLEMENTATION,
        OrchestratorTaskKind.DEBUGGING,
        OrchestratorTaskKind.TEST_UPDATE,
    }
    _CLAUDE_TASKS = {
        OrchestratorTaskKind.CODE_REVIEW,
        OrchestratorTaskKind.SECURITY_REVIEW,
    }

    def select(
        self,
        metadata: OrchestratorJobMetadata,
        created_at: datetime | None = None,
    ) -> OrchestratorLaneDecision:
        selected_lane, reason_codes = self._candidate_lane(metadata)
        if metadata.scope_expanded:
            return OrchestratorLaneDecision(
                job_id=metadata.job_id,
                selected_lane=OrchestratorLane.BLOCKED,
                state=OrchestratorJobState.AWAITING_APPROVAL,
                reason_codes=reason_codes + ("approval.scope_expansion_required",),
                blocked_reason="scope_expansion_requires_bob_approval",
                created_at=created_at or DEFAULT_ORCHESTRATOR_TIMESTAMP,
            )
        if metadata.budget_exhausted:
            return OrchestratorLaneDecision(
                job_id=metadata.job_id,
                selected_lane=OrchestratorLane.BLOCKED,
                state=OrchestratorJobState.AWAITING_APPROVAL,
                reason_codes=reason_codes + ("budget.exhausted", "approval.bob_required"),
                blocked_reason="budget_exhausted_requires_bob_decision",
                created_at=created_at or DEFAULT_ORCHESTRATOR_TIMESTAMP,
            )
        if selected_lane in metadata.unavailable_lanes:
            return OrchestratorLaneDecision(
                job_id=metadata.job_id,
                selected_lane=OrchestratorLane.BLOCKED,
                state=OrchestratorJobState.BLOCKED,
                reason_codes=reason_codes + ("lane.unavailable",),
                blocked_reason=f"{selected_lane.value}_unavailable",
                created_at=created_at or DEFAULT_ORCHESTRATOR_TIMESTAMP,
            )
        return OrchestratorLaneDecision(
            job_id=metadata.job_id,
            selected_lane=selected_lane,
            state=OrchestratorJobState.LANE_SELECTED,
            reason_codes=reason_codes,
            created_at=created_at or DEFAULT_ORCHESTRATOR_TIMESTAMP,
        )

    def _candidate_lane(self, metadata: OrchestratorJobMetadata) -> tuple[OrchestratorLane, tuple[str, ...]]:
        if metadata.requires_github_workflow or metadata.task_kind == OrchestratorTaskKind.GITHUB_WORKFLOW:
            return OrchestratorLane.GITHUB_WORKFLOW_RAIL, ("task.github_workflow", "rail.workflow_required")
        if metadata.requires_independent_review or metadata.risk_tier == OrchestratorRiskTier.HIGH or metadata.task_kind in self._CLAUDE_TASKS:
            return OrchestratorLane.CLAUDE_CODE_REVIEW_WORKER, (
                "quality.independent_review_required",
                "permissions.review_only_worker",
            )
        if metadata.requires_repo_mutation or metadata.task_kind in self._CODEX_TASKS:
            return OrchestratorLane.CODEX_CLI_WORKER, (
                "task.implementation_required",
                "permissions.fake_worker_only",
            )
        if metadata.task_kind in self._OLLAMA_TASKS:
            return OrchestratorLane.OLLAMA_API, ("task.local_safe_reasoning", "cost.ollama_first")
        return OrchestratorLane.BLOCKED, ("task.unmapped", "approval.required")


class FakeOrchestratorWorker:
    def run(self, decision: OrchestratorLaneDecision, metadata: OrchestratorJobMetadata) -> FakeWorkerAttempt:
        attempt_id = f"fake-{decision.selected_lane.value}-{metadata.job_id}"
        summary = self._metadata_summary(metadata)
        if decision.selected_lane == OrchestratorLane.BLOCKED:
            return FakeWorkerAttempt(
                attempt_id=attempt_id,
                job_id=metadata.job_id,
                lane=decision.selected_lane,
                status=FakeWorkerStatus.BLOCKED,
                state=decision.state,
                reason_codes=decision.reason_codes + ("fake_worker.blocked_without_launch",),
                task_metadata_summary=summary,
                source_reference=metadata.source_reference,
                blocker=decision.blocked_reason,
                timeout_seconds=metadata.timeout_seconds,
                budget_class=metadata.budget_class,
            )
        if decision.selected_lane == OrchestratorLane.CODEX_CLI_WORKER:
            status = FakeWorkerStatus.FAILED if metadata.verification_failed else FakeWorkerStatus.COMPLETED
            state = OrchestratorJobState.FAILED if metadata.verification_failed else OrchestratorJobState.COMPLETED
            verification_status = "failed" if metadata.verification_failed else "not_run_fake_worker"
            reason_codes = decision.reason_codes + ("fake_codex.completed_without_process_launch",)
            if metadata.verification_failed:
                reason_codes = reason_codes + ("verification.failed",)
            return FakeWorkerAttempt(
                attempt_id=attempt_id,
                job_id=metadata.job_id,
                lane=decision.selected_lane,
                status=status,
                state=state,
                reason_codes=reason_codes,
                artifact_refs=(f"orchestrator/fake-workers/{metadata.job_id}/codex-summary.json",),
                changed_files=metadata.file_scope,
                verification_status=verification_status,
                task_metadata_summary=summary,
                source_reference=metadata.source_reference,
                worktree_required=True,
                allowed_file_scope=metadata.file_scope,
                verification_command=metadata.verification_command,
                expected_artifacts=(f"orchestrator/fake-workers/{metadata.job_id}/codex-summary.json",),
                timeout_seconds=metadata.timeout_seconds,
                budget_class=metadata.budget_class,
                blocker="verification_failed" if metadata.verification_failed else None,
            )
        if decision.selected_lane == OrchestratorLane.CLAUDE_CODE_REVIEW_WORKER:
            reason_codes = decision.reason_codes + ("fake_claude.review_findings_without_process_launch",)
            blocker = None
            if metadata.conflicting_review:
                reason_codes = reason_codes + ("review.conflicting_findings", "approval.bob_required")
                blocker = "conflicting_review_requires_bob_decision"
            return FakeWorkerAttempt(
                attempt_id=attempt_id,
                job_id=metadata.job_id,
                lane=decision.selected_lane,
                status=FakeWorkerStatus.COMPLETED,
                state=OrchestratorJobState.READY_FOR_BOB,
                reason_codes=reason_codes,
                artifact_refs=(f"orchestrator/fake-workers/{metadata.job_id}/claude-review.json",),
                task_metadata_summary=summary,
                source_reference=metadata.source_reference,
                allowed_file_scope=metadata.file_scope,
                expected_artifacts=(f"orchestrator/fake-workers/{metadata.job_id}/claude-review.json",),
                timeout_seconds=metadata.timeout_seconds,
                budget_class=metadata.budget_class,
                blocker=blocker,
            )
        if decision.selected_lane == OrchestratorLane.GITHUB_WORKFLOW_RAIL:
            return FakeWorkerAttempt(
                attempt_id=attempt_id,
                job_id=metadata.job_id,
                lane=decision.selected_lane,
                status=FakeWorkerStatus.COMPLETED,
                state=OrchestratorJobState.READY_FOR_BOB,
                reason_codes=decision.reason_codes + ("fake_github.workflow_requirement_recorded",),
                artifact_refs=(f"orchestrator/fake-workers/{metadata.job_id}/github-rail.json",),
                task_metadata_summary=summary,
                source_reference=metadata.source_reference,
                expected_artifacts=(f"orchestrator/fake-workers/{metadata.job_id}/github-rail.json",),
                timeout_seconds=metadata.timeout_seconds,
                budget_class=metadata.budget_class,
            )
        return FakeWorkerAttempt(
            attempt_id=attempt_id,
            job_id=metadata.job_id,
            lane=decision.selected_lane,
            status=FakeWorkerStatus.COMPLETED,
            state=OrchestratorJobState.COMPLETED,
            reason_codes=decision.reason_codes + ("fake_ollama.completed_without_raw_payload",),
            artifact_refs=(f"orchestrator/fake-workers/{metadata.job_id}/ollama-summary.json",),
            verification_status="not_required",
            task_metadata_summary=summary,
            source_reference=metadata.source_reference,
            expected_artifacts=(f"orchestrator/fake-workers/{metadata.job_id}/ollama-summary.json",),
            timeout_seconds=metadata.timeout_seconds,
            budget_class=metadata.budget_class,
        )

    def _metadata_summary(self, metadata: OrchestratorJobMetadata) -> str:
        return (
            f"task={metadata.task_kind.value}; risk={metadata.risk_tier.value}; "
            f"budget={metadata.budget_class}; mutation={metadata.requires_repo_mutation}; "
            f"review={metadata.requires_independent_review}; github={metadata.requires_github_workflow}"
        )


class OrchestratorEvidenceBuilder:
    def build(
        self,
        decision: OrchestratorLaneDecision,
        attempt: FakeWorkerAttempt | None = None,
    ) -> OrchestratorEvidenceRecord:
        if attempt is None:
            return OrchestratorEvidenceRecord(
                job_id=decision.job_id,
                selected_lane=decision.selected_lane,
                state=decision.state,
                reason_codes=decision.reason_codes,
                next_action="run_fake_worker" if decision.selected_lane != OrchestratorLane.BLOCKED else "ready_for_bob",
            )
        return OrchestratorEvidenceRecord(
            job_id=decision.job_id,
            selected_lane=decision.selected_lane,
            state=attempt.state,
            reason_codes=attempt.reason_codes,
            worker_status=attempt.status.value,
            task_metadata_summary=attempt.task_metadata_summary,
            source_reference=attempt.source_reference,
            artifact_refs=attempt.artifact_refs,
            changed_files=attempt.changed_files,
            verification_status=attempt.verification_status,
            worktree_required=attempt.worktree_required,
            allowed_file_scope=attempt.allowed_file_scope,
            verification_command=attempt.verification_command,
            expected_artifacts=attempt.expected_artifacts,
            timeout_seconds=attempt.timeout_seconds,
            budget_class=attempt.budget_class,
            blocker=attempt.blocker,
            next_action=self._next_action(attempt),
            raw_prompt_retained=attempt.raw_prompt_retained,
            raw_completion_retained=attempt.raw_completion_retained,
            raw_provider_payload_retained=attempt.raw_provider_payload_retained,
        )

    def _next_action(self, attempt: FakeWorkerAttempt) -> str:
        if attempt.status == FakeWorkerStatus.BLOCKED:
            return "ready_for_bob"
        if attempt.status == FakeWorkerStatus.FAILED:
            return "ready_for_bob"
        if attempt.blocker:
            return "ready_for_bob"
        if attempt.lane == OrchestratorLane.CODEX_CLI_WORKER and attempt.verification_status != "passed":
            return "run_verification_or_request_bob"
        if attempt.lane == OrchestratorLane.CLAUDE_CODE_REVIEW_WORKER:
            return "review_findings_with_bob"
        return "ready_for_bob"


class FakeOrchestratorGraph:
    """LangGraph pilot boundary: deterministic graph-shaped flow without real workers."""

    def __init__(
        self,
        selector: OrchestratorLaneSelector | None = None,
        worker: FakeOrchestratorWorker | None = None,
        evidence_builder: OrchestratorEvidenceBuilder | None = None,
    ) -> None:
        self._selector = selector or OrchestratorLaneSelector()
        self._worker = worker or FakeOrchestratorWorker()
        self._evidence_builder = evidence_builder or OrchestratorEvidenceBuilder()

    def run(self, metadata: OrchestratorJobMetadata) -> OrchestratorEvidenceRecord:
        decision = self._selector.select(metadata)
        attempt = self._worker.run(decision, metadata)
        return self._evidence_builder.build(decision, attempt)
