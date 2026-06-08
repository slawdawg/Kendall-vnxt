from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum


_DEFAULT_DECISION_TIMESTAMP = datetime(1970, 1, 1, tzinfo=timezone.utc)


class ExecutionLane(StrEnum):
    UTILITY = "utility"
    LOCAL_READONLY = "local_readonly"
    LOCAL_PATCH_DRAFT = "local_patch_draft"
    LOCAL_SANDBOX_EXECUTE = "local_sandbox_execute"
    SUBSCRIPTION_HANDOFF = "subscription_handoff"
    SUBSCRIPTION_AGENT = "subscription_agent"
    PREMIUM_APPROVAL = "premium_approval"


class RoutingAuthorityMode(StrEnum):
    RECORD_ONLY = "record_only"
    ADVISORY = "advisory"
    GUARDED = "guarded"
    AUTHORITATIVE = "authoritative"


class TaskKind(StrEnum):
    REPO_INVENTORY = "repo_inventory"
    TASK_CLASSIFICATION = "task_classification"
    ROUTING_PREVIEW = "routing_preview"
    VALIDATION_EXECUTION = "validation_execution"
    VALIDATION_FAILURE_ANALYSIS = "validation_failure_analysis"
    PATH_SCOPE_CHECK = "path_scope_check"
    DELIVERY_PACKAGE_CHECK = "delivery_package_check"
    EVIDENCE_SUMMARY = "evidence_summary"
    BOUNDED_RECIPE_IMPLEMENTATION = "bounded_recipe_implementation"
    SIMPLE_PATCH_DRAFT = "simple_patch_draft"
    MULTI_FILE_IMPLEMENTATION = "multi_file_implementation"
    ARCHITECTURE_REVIEW = "architecture_review"
    SECURITY_REVIEW = "security_review"
    FINAL_VALIDATION_REVIEW = "final_validation_review"
    SUBSCRIPTION_HANDOFF_PACKAGE = "subscription_handoff_package"


class ConfidenceBand(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True)
class RoutingProfile:
    work_item_id: str
    step_id: str
    task_kind: TaskKind
    phase: str | None = None
    risk_level: str = "low"
    privacy_level: str = "internal"
    write_scope: str = "none"
    allowed_paths: tuple[str, ...] = ()
    context_need: str = "small"
    reasoning_need: str = "low"
    determinism_need: str = "high"
    validation_expectations: tuple[str, ...] = ()
    preferred_lanes: tuple[ExecutionLane, ...] = ()
    forbidden_lanes: tuple[ExecutionLane, ...] = ()
    escalation_triggers: tuple[str, ...] = ()


@dataclass(frozen=True)
class RejectedLane:
    lane: ExecutionLane
    rejection_codes: tuple[str, ...]
    explanation: str


@dataclass(frozen=True)
class RoutingDecision:
    decision_id: str
    work_item_id: str
    step_id: str
    profile_snapshot: RoutingProfile
    selected_lane: ExecutionLane
    authority_mode: RoutingAuthorityMode
    confidence_band: ConfidenceBand
    confidence_score: float
    reason_codes: tuple[str, ...]
    rejected_lanes: tuple[RejectedLane, ...]
    permission_summary: str
    escalation_path: tuple[ExecutionLane, ...]
    human_explanation: str
    created_at: datetime = _DEFAULT_DECISION_TIMESTAMP
    selected_worker_id: str | None = None
    rejected_workers: tuple[str, ...] = field(default_factory=tuple)


class RoutingPreviewService:
    _DISABLED_EXECUTION_LANES = {
        ExecutionLane.LOCAL_PATCH_DRAFT,
        ExecutionLane.LOCAL_SANDBOX_EXECUTE,
        ExecutionLane.SUBSCRIPTION_AGENT,
        ExecutionLane.PREMIUM_APPROVAL,
    }

    def preview(
        self,
        profile: RoutingProfile,
        created_at: datetime | None = None,
        allow_guarded_utility: bool = False,
    ) -> RoutingDecision:
        selected_lane, authority_mode, confidence_band, confidence_score, reason_codes, explanation = self._select(profile)
        if allow_guarded_utility and selected_lane == ExecutionLane.UTILITY:
            authority_mode = RoutingAuthorityMode.GUARDED
            reason_codes = reason_codes + ("authority.guarded_utility_allowed",)
            explanation = (
                "This deterministic supervisor utility action is eligible for guarded routing authority, "
                "so the supervisor may execute the existing utility check after recording the route."
            )
        if selected_lane in profile.forbidden_lanes:
            selected_lane = self._fallback_lane(profile)
            authority_mode = RoutingAuthorityMode.ADVISORY
            confidence_band = ConfidenceBand.LOW
            confidence_score = min(confidence_score, 0.45)
            reason_codes = reason_codes + ("policy.selected_lane_forbidden", "policy.fallback_lane_selected")
            explanation = "The task-kind route was forbidden by policy, so the preview selected the safest allowed fallback lane."
        return RoutingDecision(
            decision_id=self._decision_id(profile),
            work_item_id=profile.work_item_id,
            step_id=profile.step_id,
            profile_snapshot=profile,
            selected_lane=selected_lane,
            authority_mode=authority_mode,
            confidence_band=confidence_band,
            confidence_score=confidence_score,
            reason_codes=reason_codes,
            rejected_lanes=self._rejected_lanes(selected_lane, profile),
            permission_summary=self._permission_summary(selected_lane, authority_mode),
            escalation_path=self._escalation_path(selected_lane, profile),
            human_explanation=explanation,
            created_at=created_at or _DEFAULT_DECISION_TIMESTAMP,
        )

    def _select(
        self,
        profile: RoutingProfile,
    ) -> tuple[ExecutionLane, RoutingAuthorityMode, ConfidenceBand, float, tuple[str, ...], str]:
        if profile.task_kind in {TaskKind.PATH_SCOPE_CHECK, TaskKind.VALIDATION_EXECUTION, TaskKind.REPO_INVENTORY}:
            return (
                ExecutionLane.UTILITY,
                RoutingAuthorityMode.RECORD_ONLY,
                ConfidenceBand.HIGH,
                0.95,
                ("task.deterministic_check", "permissions.no_language_synthesis_required"),
                "This step is a deterministic supervisor check, so the utility lane is the safest preview route.",
            )
        if profile.task_kind == TaskKind.DELIVERY_PACKAGE_CHECK:
            return (
                ExecutionLane.UTILITY,
                RoutingAuthorityMode.RECORD_ONLY,
                ConfidenceBand.HIGH,
                0.9,
                ("task.delivery_package_check", "permissions.no_worker_execution_required"),
                "Delivery readiness is a deterministic evidence check, so the utility lane is the safest preview route.",
            )
        if profile.task_kind == TaskKind.ROUTING_PREVIEW:
            return (
                ExecutionLane.LOCAL_READONLY,
                RoutingAuthorityMode.ADVISORY,
                ConfidenceBand.MEDIUM,
                0.8,
                ("task.routing_preview", "permissions.read_only_required"),
                "Route inspection is read-only policy analysis, so the safest preview route is local read-only reasoning.",
            )
        if profile.task_kind in {
            TaskKind.EVIDENCE_SUMMARY,
            TaskKind.VALIDATION_FAILURE_ANALYSIS,
            TaskKind.TASK_CLASSIFICATION,
            TaskKind.FINAL_VALIDATION_REVIEW,
        }:
            return (
                ExecutionLane.LOCAL_READONLY,
                RoutingAuthorityMode.ADVISORY,
                ConfidenceBand.MEDIUM,
                0.75,
                ("privacy.local_preferred", "permissions.read_only_required"),
                "This step can be explained from local read-only context without granting execution or write permission.",
            )
        if profile.task_kind == TaskKind.ARCHITECTURE_REVIEW:
            return (
                ExecutionLane.SUBSCRIPTION_HANDOFF,
                RoutingAuthorityMode.ADVISORY,
                ConfidenceBand.MEDIUM,
                0.8,
                ("task.architecture_review", "quality.subscription_handoff_preferred"),
                "Architecture review benefits from a higher-quality handoff route, so MVP 1 previews a subscription handoff package instead of a local execution lane.",
            )
        if profile.task_kind == TaskKind.SECURITY_REVIEW:
            return (
                ExecutionLane.SUBSCRIPTION_HANDOFF,
                RoutingAuthorityMode.ADVISORY,
                ConfidenceBand.MEDIUM,
                0.82,
                ("task.security_review", "quality.subscription_handoff_preferred"),
                "Security review should preserve careful human scrutiny, so MVP 1 previews a subscription handoff route rather than local execution.",
            )
        if profile.task_kind == TaskKind.SUBSCRIPTION_HANDOFF_PACKAGE:
            return (
                ExecutionLane.SUBSCRIPTION_HANDOFF,
                RoutingAuthorityMode.ADVISORY,
                ConfidenceBand.MEDIUM,
                0.78,
                ("task.subscription_handoff_package", "permissions.execution_not_granted"),
                "This task is already a handoff package, so the safe MVP route is to keep it in the subscription handoff lane without launching an agent.",
            )
        if profile.task_kind in {
            TaskKind.BOUNDED_RECIPE_IMPLEMENTATION,
            TaskKind.MULTI_FILE_IMPLEMENTATION,
            TaskKind.SIMPLE_PATCH_DRAFT,
        }:
            return (
                ExecutionLane.SUBSCRIPTION_HANDOFF,
                RoutingAuthorityMode.ADVISORY,
                ConfidenceBand.MEDIUM,
                0.7,
                ("quality.subscription_handoff_preferred", "permissions.execution_not_granted"),
                "This work may require implementation quality beyond preview-only local lanes, so the safe MVP route is a subscription handoff package.",
            )
        return (
            ExecutionLane.LOCAL_READONLY,
            RoutingAuthorityMode.ADVISORY,
            ConfidenceBand.LOW,
            0.5,
            ("task.general_analysis", "permissions.read_only_required"),
            "The task kind is not specifically mapped yet, so the safest preview route is local read-only analysis.",
        )

    def _fallback_lane(self, profile: RoutingProfile) -> ExecutionLane:
        for lane in (ExecutionLane.UTILITY, ExecutionLane.LOCAL_READONLY, ExecutionLane.SUBSCRIPTION_HANDOFF):
            if lane not in profile.forbidden_lanes and lane not in self._DISABLED_EXECUTION_LANES:
                return lane
        return ExecutionLane.LOCAL_READONLY

    def _rejected_lanes(self, selected_lane: ExecutionLane, profile: RoutingProfile) -> tuple[RejectedLane, ...]:
        rejected = []
        for lane in ExecutionLane:
            if lane == selected_lane:
                continue
            if lane in profile.forbidden_lanes:
                rejected.append(RejectedLane(lane, ("policy.forbidden_by_profile",), "The routing profile forbids this lane."))
            elif lane in self._DISABLED_EXECUTION_LANES:
                rejected.append(RejectedLane(lane, ("policy.disabled_for_mvp",), "This execution lane is defined for future use but disabled in MVP 1."))
            elif selected_lane == ExecutionLane.UTILITY and lane == ExecutionLane.LOCAL_READONLY:
                rejected.append(RejectedLane(lane, ("capability.language_synthesis_not_required",), "Language synthesis is not required for this deterministic check."))
            elif selected_lane == ExecutionLane.LOCAL_READONLY and lane == ExecutionLane.UTILITY:
                rejected.append(RejectedLane(lane, ("capability.language_synthesis_required",), "A plain deterministic utility check would not produce the needed explanation."))
            elif selected_lane == ExecutionLane.SUBSCRIPTION_HANDOFF and lane in {ExecutionLane.UTILITY, ExecutionLane.LOCAL_READONLY}:
                rejected.append(RejectedLane(lane, ("quality.local_insufficient_for_task",), "This implementation-oriented task needs a higher-quality handoff route."))
            else:
                rejected.append(RejectedLane(lane, ("policy.not_selected",), "Another lane was a better fit for this preview decision."))
        return tuple(rejected)

    def _permission_summary(self, selected_lane: ExecutionLane, authority_mode: RoutingAuthorityMode) -> str:
        if selected_lane == ExecutionLane.UTILITY and authority_mode == RoutingAuthorityMode.GUARDED:
            return "Guarded utility execution allowed for this deterministic supervisor action after route recording."
        if selected_lane == ExecutionLane.UTILITY:
            return "Preview only. Deterministic utility lane selected without command execution in MVP 1."
        if selected_lane == ExecutionLane.LOCAL_READONLY:
            return "Preview only. Read-only local analysis lane selected; no file writes or commands are allowed."
        if selected_lane == ExecutionLane.SUBSCRIPTION_HANDOFF:
            return "Preview only. Prepare handoff guidance; do not launch subscription agents."
        return "Preview only. No worker execution authority is granted."

    def _escalation_path(self, selected_lane: ExecutionLane, profile: RoutingProfile) -> tuple[ExecutionLane, ...]:
        if selected_lane == ExecutionLane.UTILITY:
            path = (ExecutionLane.LOCAL_READONLY, ExecutionLane.SUBSCRIPTION_HANDOFF, ExecutionLane.PREMIUM_APPROVAL)
        elif selected_lane == ExecutionLane.LOCAL_READONLY:
            path = (ExecutionLane.SUBSCRIPTION_HANDOFF, ExecutionLane.PREMIUM_APPROVAL)
        else:
            path = (ExecutionLane.PREMIUM_APPROVAL,)
        return tuple(lane for lane in path if lane not in profile.forbidden_lanes)

    def _decision_id(self, profile: RoutingProfile) -> str:
        return f"route-{profile.work_item_id}-{profile.step_id}-{profile.task_kind.value}"
