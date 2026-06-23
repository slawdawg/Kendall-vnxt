import asyncio
import json
import os
import re
import shutil
import subprocess
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class DeliveryApprovalValidation:
    approved: bool
    blockers: list[str]
    approval_reference: str | None = None


@dataclass(frozen=True)
class LocalProviderApprovalValidation:
    approved: bool
    blockers: list[str]
    approval_reference: str | None = None


from supervisor.api.schemas import (
    AuditEventView,
    AuthorityReadinessFamilyView,
    AuthorityReadinessMatrixReportView,
    CandidateWorkBmadImportRequest,
    CandidateWorkCreate,
    CandidateWorkUpdate,
    CandidateWorkView,
    ClaudeReadinessCheckView,
    ClaudeReviewApprovalReportView,
    ClaudeReviewApprovalRequirementView,
    ClaudeReviewReadinessReportView,
    CodexImplementationApprovalReportView,
    CodexImplementationApprovalRequirementView,
    CodexReadinessCheckView,
    CodexReadinessReportView,
    CleanupPlanResidueView,
    CleanupPlanView,
    CurrentStateReconciliationFindingView,
    DashboardE2EReportView,
    DashboardE2ERunnerView,
    DeliveryReadinessPolicyItemView,
    DeliveryReadinessPolicyReportView,
    DeliveryExecutionEvidencePayload,
    DeliveryExecutionEvidenceView,
    DevelopmentRunwayReportView,
    DevelopmentRunwayReadinessCheckView,
    DevelopmentRunwaySliceView,
    DocumentationAuthorityBlockedStoryView,
    DocumentationAuthorityDocumentView,
    DocumentationAuthorityReportView,
    ExecutionConfigurationCheckView,
    ExecutionConfigurationChecksView,
    ExecutionAttemptView,
    EpicCompletionAuditItemView,
    EpicCompletionAuditReportView,
    ExecutionReadinessAttemptSummaryView,
    ExecutionReadinessOutcomeEvidenceView,
    ExecutionReadinessReportView,
    ExecutionStateBoundaryView,
    DisabledProviderProofView,
    GitHubWorkflowPolicyItemView,
    GitHubDeliveryAuthorityReportView,
    GitHubDeliveryEligibilityStageView,
    GitHubDeliveryAuthorityStepView,
    GitHubWorkflowPolicyReportView,
    GitHygieneReportView,
    GitHygieneSignalView,
    GitHygieneWorktreeView,
    LocalEvidenceExplanationView,
    LocalEvidenceItemView,
    LocalEvidencePacketItemView,
    LocalEvidencePacketView,
    LocalCleanupPolicyItemView,
    LocalCleanupReadinessReportView,
    LocalProviderApprovalInstance,
    LowRiskDeliveryPlanActionView,
    LowRiskDeliveryPlanReportView,
    LocalProviderAttemptMetadataView,
    LocalReadonlyWorkerPreviewView,
    LocalWorktreePlanView,
    ManagedRecipePolicyReportView,
    MaintenanceActionPlanReportView,
    MaintenanceActionPlanStepView,
    MaintenanceReadinessReportView,
    MaintenanceReadinessTrackView,
    MvpProofTrialReportView,
    MvpProofTrialStepView,
    NextLaneRecommendationView,
    NextLaneDecisionPacketView,
    OperatorViewCreate,
    OperatorViewResponse,
    PremiumApprovalEvidenceView,
    PremiumApprovalRequestView,
    ProviderEnablementPolicyStepView,
    RemoteCleanupSyncPolicyItemView,
    RemoteCleanupSyncReadinessReportView,
    RuntimeEvidenceExportBoundaryView,
    RuntimeEvidenceCrossCheckView,
    RuntimeEvidenceReviewManifestView,
    RuntimeEvidenceReviewNavigatorItemView,
    RuntimeEvidenceReviewReportView,
    RuntimeEvidenceReviewWorkItemView,
    RuntimeEvidenceExportSafetyView,
    RuntimeEvidenceSubscriptionLaunchView,
    RunnerAssignmentDegradedInputView,
    RunnerDispatcherContinuitySnapshotView,
    RunnerDispatcherQueueProofRowView,
    RunnerAssignmentStatusReportView,
    RunnerAssignmentStatusRowView,
    RunnerAssignmentStatusSummaryView,
    RunnerAssignmentWarningView,
    RuntimeEvidenceExportView,
    SafeDevelopmentBacklogItemView,
    SafeDevelopmentBacklogReportView,
    RoutingDecisionView,
    RoutingLaneEvidenceProfileView,
    RoutingOverrideView,
    RoutingPreviewView,
    RoutingProfileView,
    SubscriptionAgentLaunchRequestView,
    SubscriptionAgentLaunchStubView,
    SubscriptionHandoffEvidenceView,
    SubscriptionHandoffPackageView,
    SupervisorReportCatalogEntryView,
    SupervisorReportCatalogView,
    TaskPacketPreviewView,
    TaskPacketV0View,
    ThreatBoundaryRuleView,
    ThreatBoundaryView,
    TrustedDeliveryEligibilityCheckView,
    TrustedDeliveryEligibilityReportView,
    TrustedDeliveryEligibilityStageEvaluationView,
    TrustedAutonomyReadinessGateView,
    TrustedAutonomyReadinessReportView,
    VerificationCommandView,
    VerificationCommandGroupView,
    VerificationHandoffCheckpointView,
    VerificationReadinessReportView,
    RejectedRoutingLaneView,
    RunStatusView,
    WorkItemCreate,
    WorkItemExecutionAttemptCreateRequest,
    WorkItemExecutionAttemptTransitionRequest,
    WorkItemLocalEvidenceExplanationRequest,
    WorkItemPremiumApprovalRequest,
    WorkItemBranchPreparationRequest,
    WorkItemDeliveryReadinessRequest,
    WorkItemDeliveryReadinessView,
    WorkItemExecutionRecipeView,
    WorkItemManagedActionRequest,
    WorkItemRoutingPreviewRequest,
    WorkItemRoutingOverrideRequest,
    WorkItemSupervisedCodexLaunchRequest,
    WorkItemSubscriptionAgentLaunchRequest,
    WorkItemSubscriptionAgentLaunchStubRequest,
    WorkItemSubscriptionHandoffRequest,
    WorkItemVerificationEvidenceRequest,
    WorkItemManagedActionView,
    WorkItemPolicyGateView,
    WorkItemRecipeGateAuditEntryView,
    WorkItemRecipeGateAuditView,
    WorkItemRemoteAutomationPolicyView,
    WorkItemFilterView,
    WorkerRegistryEntryView,
    WorkflowEventView,
    WorkItemView,
)
from supervisor.config.settings import Settings
from supervisor.domain.bmad_import import parse_bmad_import_package
from supervisor.domain.disabled_provider_adapter import DisabledLocalProviderAdapter
from supervisor.domain.local_readonly_worker import MockLocalReadonlyWorkerAdapter
from supervisor.domain.ollama_provider_adapter import OllamaProviderAdapter
from supervisor.domain.recipes import EXECUTION_RECIPES, ExecutionRecipe, RecipeCommand
from supervisor.domain.routing import (
    ExecutionLane,
    RoutingAuthorityMode,
    RoutingDecision,
    RoutingPreviewService,
    RoutingProfile,
    TaskKind,
)
from supervisor.domain.summaries import default_status_summary, mode_summary, next_step_summary
from supervisor.domain.subscription_launch import (
    DisabledSubscriptionLaunchAdapter,
    SupervisedSubscriptionLaunchAdapter,
    SubscriptionLaunchRegistry,
)
from supervisor.domain.types import AuditMode, BmadLane, CandidateWorkStatus, ExecutionAttemptStatus, RunMode, WorkItemFilterScope, WorkflowAction, WorkflowState
from supervisor.domain.utility_worker import UtilityWorkerAdapter, UtilityWorkerResult, UtilityWorkerStatus, UtilityWorkerTask
from supervisor.domain.worker_registry import StaticWorkerRegistry, WorkerAdapterType, WorkerHealthStatus, WorkerRegistryEntry
from supervisor.infrastructure.db.models import AuditEvent, CandidateWork, ExecutionAttempt, OperatorView, QueueLease, SupervisorControl, WorkItem, WorkflowEvent
from supervisor.infrastructure.streaming.bus import EventBus


ACTIVE_STATES = {
    WorkflowState.IMPLEMENTING.value,
    WorkflowState.VALIDATING.value,
    WorkflowState.REVIEWING.value,
    WorkflowState.AWAITING_AUDIT.value,
}

ACTIVE_EXECUTION_ATTEMPT_STATUSES = {
    ExecutionAttemptStatus.PLANNED.value,
    ExecutionAttemptStatus.APPROVED.value,
    ExecutionAttemptStatus.STARTING.value,
    ExecutionAttemptStatus.RUNNING.value,
    ExecutionAttemptStatus.CANCEL_REQUESTED.value,
}

TERMINAL_EXECUTION_ATTEMPT_STATUSES = {
    ExecutionAttemptStatus.CANCELLED.value,
    ExecutionAttemptStatus.TIMED_OUT.value,
    ExecutionAttemptStatus.FAILED.value,
    ExecutionAttemptStatus.COMPLETED.value,
    ExecutionAttemptStatus.REJECTED.value,
}

EXECUTION_ATTEMPT_TRANSITIONS = {
    ExecutionAttemptStatus.PLANNED.value: {
        ExecutionAttemptStatus.APPROVED.value,
        ExecutionAttemptStatus.STARTING.value,
        ExecutionAttemptStatus.RUNNING.value,
        ExecutionAttemptStatus.CANCEL_REQUESTED.value,
        ExecutionAttemptStatus.CANCELLED.value,
        ExecutionAttemptStatus.TIMED_OUT.value,
        ExecutionAttemptStatus.FAILED.value,
        ExecutionAttemptStatus.COMPLETED.value,
    },
    ExecutionAttemptStatus.APPROVED.value: {
        ExecutionAttemptStatus.STARTING.value,
        ExecutionAttemptStatus.RUNNING.value,
        ExecutionAttemptStatus.CANCEL_REQUESTED.value,
        ExecutionAttemptStatus.CANCELLED.value,
        ExecutionAttemptStatus.TIMED_OUT.value,
        ExecutionAttemptStatus.FAILED.value,
        ExecutionAttemptStatus.COMPLETED.value,
    },
    ExecutionAttemptStatus.STARTING.value: {
        ExecutionAttemptStatus.RUNNING.value,
        ExecutionAttemptStatus.CANCEL_REQUESTED.value,
        ExecutionAttemptStatus.CANCELLED.value,
        ExecutionAttemptStatus.TIMED_OUT.value,
        ExecutionAttemptStatus.FAILED.value,
        ExecutionAttemptStatus.COMPLETED.value,
    },
    ExecutionAttemptStatus.RUNNING.value: {
        ExecutionAttemptStatus.CANCEL_REQUESTED.value,
        ExecutionAttemptStatus.CANCELLED.value,
        ExecutionAttemptStatus.TIMED_OUT.value,
        ExecutionAttemptStatus.FAILED.value,
        ExecutionAttemptStatus.COMPLETED.value,
    },
    ExecutionAttemptStatus.CANCEL_REQUESTED.value: {
        ExecutionAttemptStatus.CANCELLED.value,
        ExecutionAttemptStatus.TIMED_OUT.value,
        ExecutionAttemptStatus.FAILED.value,
    },
}

_LANE_UNSET = object()

PR_STATUSES = {"not_recorded", "recorded", "ready", "waived"}
CI_STATUSES = {"not_recorded", "pending", "passed", "failed", "waived"}
MERGE_STATUSES = {"not_recorded", "ready", "merged", "blocked", "waived"}


class SupervisorService:
    _ROUTING_PROFILE_EVENT_TYPES = {
        "routing.preview_recorded",
        "routing.utility_execution_authorized",
        "routing.subscription_handoff_packaged",
        "routing.subscription_agent_launch_stub_created",
        "routing.premium_approval_requested",
        "routing.local_evidence_explained",
        "routing.outcome_recorded",
    }
    _PREMIUM_APPROVAL_TASK_KINDS = {
        TaskKind.ARCHITECTURE_REVIEW.value,
        TaskKind.SECURITY_REVIEW.value,
        TaskKind.FINAL_VALIDATION_REVIEW.value,
        TaskKind.BOUNDED_RECIPE_IMPLEMENTATION.value,
        TaskKind.MULTI_FILE_IMPLEMENTATION.value,
    }
    _SUBSCRIPTION_AGENT_STUB_TASK_KINDS = {
        TaskKind.ARCHITECTURE_REVIEW.value,
        TaskKind.SECURITY_REVIEW.value,
        TaskKind.BOUNDED_RECIPE_IMPLEMENTATION.value,
        TaskKind.MULTI_FILE_IMPLEMENTATION.value,
        TaskKind.SIMPLE_PATCH_DRAFT.value,
        TaskKind.SUBSCRIPTION_HANDOFF_PACKAGE.value,
    }
    _SUBSCRIPTION_AGENT_LAUNCH_REQUIRED_FIELDS = (
        "workItemId",
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
    )
    _STORY_8_5_ACCEPTED_APPROVAL_TIMESTAMP = datetime.fromisoformat(
        "2026-06-12T16:20:33.2776334-05:00"
    ).astimezone(timezone.utc)
    _STORY_8_5_ACCEPTED_APPROVAL_EXPIRY = datetime.fromisoformat(
        "2026-06-12T16:50:33.2776334-05:00"
    ).astimezone(timezone.utc)

    def __init__(self, settings: Settings, bus: EventBus) -> None:
        self.settings = settings
        self.bus = bus
        self._loop_lock = asyncio.Lock()
        self.utility_worker = UtilityWorkerAdapter()
        self.worker_registry = StaticWorkerRegistry()
        self.local_readonly_worker = MockLocalReadonlyWorkerAdapter()
        self.disabled_provider_adapter = DisabledLocalProviderAdapter()
        self.ollama_provider_adapter = OllamaProviderAdapter(
            endpoint_url=self.settings.ollama_endpoint_url or self.settings.ollama_approved_endpoint_url,
            model_id=self.settings.ollama_model_id or self.settings.ollama_approved_model_id,
            connect_timeout_seconds=self.settings.ollama_connect_timeout_seconds,
            total_timeout_seconds=self.settings.ollama_total_timeout_seconds,
        )
        self.subscription_launch_registry = SubscriptionLaunchRegistry()
        self.disabled_subscription_launch_adapter = DisabledSubscriptionLaunchAdapter()
        self.supervised_subscription_launch_adapter = SupervisedSubscriptionLaunchAdapter()

    async def ensure_control(self, session: AsyncSession) -> SupervisorControl:
        control = await session.get(SupervisorControl, 1)
        if not control:
            control = SupervisorControl(id=1, mode=RunMode.RUNNING.value)
            session.add(control)
            await session.commit()
            await session.refresh(control)
        return control

    async def create_work_item(self, session: AsyncSession, payload: WorkItemCreate) -> WorkItem:
        item = WorkItem(
            title=payload.title,
            requested_outcome=payload.requestedOutcome,
            source=payload.source,
            details=payload.details,
            risk_level=payload.riskLevel.value,
            metadata_json=payload.metadata,
            state=WorkflowState.QUEUED.value,
            lane=None,
            status_summary=default_status_summary(WorkflowState.QUEUED),
            blocked_reason=None,
            next_step=next_step_summary(WorkflowState.QUEUED),
            requires_audit=payload.riskLevel.value in {"medium", "high"},
            audit_mode=AuditMode.NONE.value,
        )
        session.add(item)
        await session.flush()
        submitted_by_id = item.metadata_json.get("submittedByActorId") if isinstance(item.metadata_json, dict) else None
        submitted_by_label = item.metadata_json.get("submittedByActorLabel") if isinstance(item.metadata_json, dict) else None
        await self._record_event(
            session,
            item,
            "work_item.queued",
            item.status_summary,
            {"source": item.source},
            actor_type="operator" if submitted_by_id or submitted_by_label else "system",
            actor_id=submitted_by_id if isinstance(submitted_by_id, str) else None,
            actor_label=submitted_by_label if isinstance(submitted_by_label, str) else None,
        )
        recipe = self._execution_recipe_for_item(item)
        if recipe:
            await self._record_event(
                session,
                item,
                "recipe.selected",
                f"Supervisor selected the {recipe.label} recipe.",
                {
                    "recipeId": recipe.id,
                    "branchPrefix": recipe.branch_prefix,
                    "policyGates": [gate.id for gate in recipe.policy_gates],
                    "operatorCheckpoints": list(recipe.operator_checkpoints),
                },
            )
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def list_work_items(self, session: AsyncSession) -> list[WorkItem]:
        result = await session.execute(select(WorkItem).order_by(WorkItem.created_at.desc()))
        return list(result.scalars())

    async def create_candidate_work(self, session: AsyncSession, payload: CandidateWorkCreate) -> CandidateWork:
        candidate = CandidateWork(
            title=payload.title,
            requested_outcome=payload.requestedOutcome,
            source=payload.source.value,
            source_artifact_path=payload.sourceArtifactPath,
            source_artifact_type=payload.sourceArtifactType.value,
            risk_level=payload.riskLevel.value,
            priority=payload.priority.value,
            sort_order=payload.sortOrder,
            import_metadata_json=dict(payload.importMetadata),
            status=CandidateWorkStatus.PROPOSED.value,
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)
        await self._publish_candidate_work(candidate)
        return candidate

    async def import_bmad_candidate_work(self, session: AsyncSession, payload: CandidateWorkBmadImportRequest) -> CandidateWork:
        repo_root = Path(self._repo_root() or Path(__file__).resolve().parents[5])
        package = parse_bmad_import_package(repo_root, payload.artifactPath)
        return await self.create_candidate_work(
            session,
            CandidateWorkCreate(
                title=package.title,
                requestedOutcome=package.requested_outcome,
                source="bmad",
                sourceArtifactPath=package.source_artifact_path,
                sourceArtifactType=package.source_artifact_type,
                riskLevel=package.risk_level,
                priority=package.recommended_priority,
                sortOrder=payload.sortOrder,
                importMetadata={
                    "artifactTitle": package.artifact_title,
                    "storyId": package.story_id,
                    "epicId": package.epic_id,
                    "acceptanceCriteria": package.acceptance_criteria,
                    "verificationSummary": package.verification_summary,
                    "allowedScope": package.allowed_scope,
                    "notes": list(package.notes),
                    "retentionPolicy": "metadata_only_no_raw_artifact_content",
                },
            ),
        )

    async def list_candidate_work(self, session: AsyncSession) -> list[CandidateWork]:
        result = await session.execute(select(CandidateWork).order_by(CandidateWork.sort_order.asc(), CandidateWork.created_at.desc()))
        return list(result.scalars())

    async def update_candidate_work(self, session: AsyncSession, candidate_work_id: str, payload: CandidateWorkUpdate) -> CandidateWork | None:
        candidate = await session.get(CandidateWork, candidate_work_id)
        if not candidate:
            return None

        if payload.status is not None:
            candidate.status = payload.status.value
            if payload.status == CandidateWorkStatus.APPROVED and candidate.approved_at is None:
                candidate.approved_at = datetime.now(timezone.utc)
            elif payload.status != CandidateWorkStatus.APPROVED:
                candidate.approved_at = None
        if payload.priority is not None:
            candidate.priority = payload.priority.value
        if payload.riskLevel is not None:
            candidate.risk_level = payload.riskLevel.value
        if payload.sortOrder is not None:
            candidate.sort_order = payload.sortOrder

        candidate.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(candidate)
        await self._publish_candidate_work(candidate)
        return candidate

    async def promote_candidate_work(self, session: AsyncSession, candidate_work_id: str) -> tuple[CandidateWork, WorkItem] | None:
        candidate = await session.get(CandidateWork, candidate_work_id)
        if not candidate:
            return None
        if candidate.status != CandidateWorkStatus.APPROVED.value:
            raise ValueError("Candidate work must be approved before promotion.")
        if candidate.promoted_work_item_id:
            raise ValueError("Candidate work has already been promoted.")

        import_metadata = candidate.import_metadata_json if isinstance(candidate.import_metadata_json, dict) else {}
        item_metadata = {
            "candidateWorkId": candidate.id,
            "candidatePriority": candidate.priority,
            "candidateSortOrder": candidate.sort_order,
            "sourceArtifactPath": candidate.source_artifact_path,
            "sourceArtifactType": candidate.source_artifact_type,
            "source": candidate.source,
            "importMetadata": import_metadata,
        }
        verification_summary = import_metadata.get("verificationSummary")
        acceptance_criteria = import_metadata.get("acceptanceCriteria")
        if isinstance(verification_summary, str) and verification_summary:
            item_metadata["verificationSummary"] = verification_summary
        if isinstance(acceptance_criteria, str) and acceptance_criteria:
            item_metadata["acceptanceCriteriaSummary"] = acceptance_criteria

        item = WorkItem(
            title=candidate.title,
            requested_outcome=candidate.requested_outcome,
            source=f"candidate_work:{candidate.id}",
            details=None,
            risk_level=candidate.risk_level,
            metadata_json=item_metadata,
            state=WorkflowState.QUEUED.value,
            lane=None,
            status_summary=default_status_summary(WorkflowState.QUEUED),
            blocked_reason=None,
            next_step=next_step_summary(WorkflowState.QUEUED),
            requires_audit=candidate.risk_level in {"medium", "high"},
            audit_mode=AuditMode.NONE.value,
        )
        session.add(item)
        await session.flush()
        candidate.promoted_work_item_id = item.id
        candidate.updated_at = datetime.now(timezone.utc)
        await self._record_event(
            session,
            item,
            "candidate_work.promoted",
            "Proposed work was moved into active work.",
            {
                "candidateWorkId": candidate.id,
                "sourceArtifactPath": candidate.source_artifact_path,
                "sourceArtifactType": candidate.source_artifact_type,
                "candidatePriority": candidate.priority,
                "candidateSortOrder": candidate.sort_order,
                "importMetadata": import_metadata,
            },
        )
        await session.commit()
        await session.refresh(candidate)
        await session.refresh(item)
        await self._publish_candidate_work(candidate)
        await self._publish_item(item)
        return candidate, item

    def list_execution_recipes(self) -> list[WorkItemExecutionRecipeView]:
        return [self._to_execution_recipe_view(recipe) for recipe in EXECUTION_RECIPES.values()]

    async def list_audit_events(self, session: AsyncSession) -> list[AuditEvent]:
        result = await session.execute(select(AuditEvent).order_by(AuditEvent.created_at.desc()))
        return list(result.scalars())


    def list_worker_registry(self) -> list[WorkerRegistryEntryView]:
        return [self._to_worker_registry_entry_view(worker) for worker in self.worker_registry.list_workers()]

    def get_documentation_authority_report(self) -> DocumentationAuthorityReportView:
        root_dir = Path(__file__).resolve().parents[5]
        index_documents = [
            ("docs/architecture/index.md", "Architecture index"),
            ("docs/workflows/product-requirements-boundary.md", "Product requirements boundary"),
            ("docs/workflows/implementation-evidence-boundary.md", "Story index"),
        ]
        approval_checkpoint_path = "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md"
        blocked_stories = [
            ("4.4", "docs/workflows/implementation-evidence-boundary.md", "Ollama local provider"),
            ("5.5", "docs/workflows/implementation-evidence-boundary.md", "Subscription-agent launch"),
        ]

        def document_view(path: str, label: str, extra_evidence: list[str] | None = None) -> DocumentationAuthorityDocumentView:
            exists = (root_dir / path).exists()
            evidence = [f"{path} is tracked in the repository." if exists else f"{path} is missing from the repository."]
            if extra_evidence:
                evidence.extend(extra_evidence)
            return DocumentationAuthorityDocumentView(
                path=path,
                label=label,
                status="present" if exists else "missing",
                evidence=evidence,
            )

        required_documents = index_documents + [(approval_checkpoint_path, "Execution authority approval checkpoints")]
        missing_paths = [path for path, _label in required_documents if not (root_dir / path).exists()]
        missing_paths.extend(path for _story_id, path, _family in blocked_stories if not (root_dir / path).exists())
        authority_story_count = len(blocked_stories)
        drift_status = "passed" if not missing_paths else "blocked"

        return DocumentationAuthorityReportView(
            reportId="documentation-authority-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Documentation authority indexes are present and blocked execution-authority stories remain explicit."
                if not missing_paths
                else "Documentation authority evidence is missing one or more required files."
            ),
            indexes=[document_view(path, label) for path, label in index_documents],
            approvalCheckpoint=document_view(
                approval_checkpoint_path,
                "Execution authority approval checkpoints",
                ["Generic continuation language is not execution-authority approval."],
            ),
            blockedStories=[
                DocumentationAuthorityBlockedStoryView(
                    storyId=story_id,
                    path=path,
                    authorityFamily=family,
                    status="blocked_pending_explicit_approval",
                )
                for story_id, path, family in blocked_stories
            ],
            driftChecks=[
                ProviderEnablementPolicyStepView(
                    stepId="required-documents-present",
                    label="Required authority documents",
                    status=drift_status,
                    summary="Architecture, PRD, story, and approval checkpoint documents must be present.",
                    requiredEvidence=[path for path, _label in required_documents],
                ),
                ProviderEnablementPolicyStepView(
                    stepId="blocked-story-count",
                    label="Blocked execution-authority stories",
                    status="passed" if authority_story_count == 2 else "blocked",
                    summary=f"{authority_story_count} blocked stories are represented for remaining Ollama execution and supervised subscription-agent process authority.",
                    requiredEvidence=[path for _story_id, path, _family in blocked_stories],
                ),
                ProviderEnablementPolicyStepView(
                    stepId="check-docs-command",
                    label="Documentation drift command",
                    status="required",
                    summary="Run `pnpm run check:docs` or the full `pnpm run check` before merging authority documentation changes.",
                    requiredEvidence=["scripts/check-doc-indexes.mjs", "package.json"],
                ),
                ProviderEnablementPolicyStepView(
                    stepId="check-documentation-authority-command",
                    label="Documentation authority report drift command",
                    status="required",
                    summary="Run `pnpm run check:documentation-authority` before merging documentation authority report changes.",
                    requiredEvidence=["scripts/check-documentation-authority-report.mjs", "docs/workflows/implementation-evidence-boundary.md"],
                ),
            ],
            nextSafeActions=[
                "Keep blocked authority stories blocked unless explicit operator approval names authority and scope.",
                "Run `pnpm run check:documentation-authority` after changing documentation authority report surfaces.",
                "Run `pnpm run check:docs` after changing architecture, PRD, story, or approval checkpoint references.",
                "Use the documentation indexes before starting new execution-authority work.",
            ],
        )

    def get_verification_readiness_report(self) -> VerificationReadinessReportView:
        required_commands = [
            VerificationCommandView(
                commandId="preflight",
                label="Workspace preflight",
                command="pnpm run preflight",
                status="required",
                requiredFor=["local dependency readiness", "fresh VM acceptance", "full check"],
                evidence=[
                    "Confirms JavaScript workspace dependencies are installed.",
                    "Confirms the supervisor Python virtualenv is ready.",
                ],
            ),
            VerificationCommandView(
                commandId="check-docs",
                label="Documentation authority drift",
                command="pnpm run check:docs",
                status="required",
                requiredFor=["architecture changes", "PRD changes", "story changes", "authority checkpoint changes"],
                evidence=[
                    "Validates documentation indexes reference existing files.",
                    "Validates blocked execution-authority stories remain consistent with the approval checkpoint.",
                ],
            ),
            VerificationCommandView(
                commandId="check-documentation-authority",
                label="Documentation authority report drift",
                command="pnpm run check:documentation-authority",
                status="required",
                requiredFor=["documentation authority report changes", "blocked story surface changes", "authority checkpoint report changes"],
                evidence=[
                    "Validates documentation authority contracts, schemas, API route, service report, dashboard rendering, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-verification-readiness",
                label="Verification readiness report drift",
                command="pnpm run check:verification-readiness",
                status="required",
                requiredFor=["verification readiness report changes", "verification command changes", "controls-page verification report changes"],
                evidence=[
                    "Validates verification readiness contracts, schemas, API route, service commands, dashboard rendering, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-authority-readiness",
                label="Authority readiness matrix drift",
                command="pnpm run check:authority-readiness",
                status="required",
                requiredFor=["authority readiness matrix changes", "blocked story reference changes", "controls-page report changes"],
                evidence=[
                    "Validates authority readiness matrix contracts, schemas, API route, service families, dashboard rendering, report anchors, runtime evidence, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-adaptive-scoring",
                label="Adaptive scoring decision-prep drift",
                command="pnpm run check:adaptive-scoring",
                status="required",
                requiredFor=["adaptive scoring decision-prep changes", "authority boundary changes", "verification command changes"],
                evidence=[
                    "Validates the adaptive scoring decision-prep package, research anchors, stop lines, runbooks, and runtime tripwires stay aligned without enabling scoring.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-premium-execution",
                label="Premium execution approval-packet drift",
                command="pnpm run check:premium-execution",
                status="required",
                requiredFor=["premium execution approval packet changes", "authority boundary changes", "verification command changes"],
                evidence=[
                    "Validates premium execution approval-packet docs, scripts, runbooks, and stop lines stay aligned without enabling premium execution.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-worker-launch",
                label="Worker launch approval-packet drift",
                command="pnpm run check:worker-launch",
                status="required",
                requiredFor=["worker launch approval packet changes", "process launch planning changes", "verification command changes"],
                evidence=[
                    "Validates real CLI worker launch approval-packet docs, scripts, runbooks, and stop lines stay aligned without launching workers.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-e2e-report",
                label="Dashboard e2e report drift",
                command="pnpm run check:e2e-report",
                status="required",
                requiredFor=["dashboard e2e runner changes", "verification report changes", "browser coverage documentation"],
                evidence=[
                    "Validates dashboard e2e package scripts, supervisor reports, browser assertions, and story references stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-reports",
                label="Supervisor report catalog drift",
                command="pnpm run check:reports",
                status="required",
                requiredFor=["supervisor report changes", "controls-page report changes", "runtime export report references"],
                evidence=[
                    "Validates supervisor report catalog entries, FastAPI routes, runtime export references, dashboard fetches, browser assertions, and story references stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-execution-boundary",
                label="Execution boundary report drift",
                command="pnpm run check:execution-boundary",
                status="required",
                requiredFor=["execution readiness changes", "execution configuration changes", "threat boundary changes", "authority boundary references"],
                evidence=[
                    "Validates execution configuration, execution readiness, and threat-boundary contracts, schemas, routes, service evidence, dashboard shortcuts, browser assertions, supervisor tests, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-execution-evidence",
                label="Execution evidence boundary drift",
                command="pnpm run check:execution-evidence",
                status="required",
                requiredFor=["execution state boundary changes", "disabled provider proof changes", "runtime evidence boundary references"],
                evidence=[
                    "Validates execution-state boundary and disabled-provider proof contracts, schemas, routes, service evidence, report catalog entries, browser assertions, supervisor tests, runtime evidence, runbooks, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-provider-fixtures",
                label="Provider fixture policy drift",
                command="pnpm run check:provider-fixtures",
                status="required",
                requiredFor=["disabled provider fixture changes", "worker registry provider changes", "provider proof policy changes"],
                evidence=[
                    "Validates disabled local-provider fixtures, registry entries, no-call proof tests, architecture policy, runtime evidence, runbooks, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-process-lifecycle",
                label="Process lifecycle policy drift",
                command="pnpm run check:process-lifecycle",
                status="required",
                requiredFor=["process lifecycle design changes", "execution attempt lifecycle changes", "subscription launch planning changes"],
                evidence=[
                    "Validates future process lifecycle design, execution attempt lifecycle states, disabled launch safety flags, runtime evidence, runbooks, and story evidence stay aligned without enabling process launch.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-runbooks",
                label="Runbook verification alignment",
                command="pnpm run check:runbooks",
                status="required",
                requiredFor=["README changes", "fresh VM runbook changes", "handoff changes", "verification command changes"],
                evidence=[
                    "Validates current operator runbooks mention the active verification chain and avoid stale fixed supervisor test counts.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-runtime-export",
                label="Runtime evidence export drift",
                command="pnpm run check:runtime-export",
                status="required",
                requiredFor=["runtime evidence export changes", "work-item detail evidence panel changes", "runtime export story references"],
                evidence=[
                    "Validates runtime export contracts, schemas, API route, service navigator items, dashboard rendering, browser assertions, and story references stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-runtime-review",
                label="Runtime evidence review index drift",
                command="pnpm run check:runtime-review",
                status="required",
                requiredFor=["runtime evidence review changes", "work-item evidence navigation changes", "controls-page report changes"],
                evidence=[
                    "Validates runtime evidence review contracts, schemas, API route, service queue construction, dashboard rendering, report catalog, browser assertions, runbooks, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-safe-backlog",
                label="Safe development backlog drift",
                command="pnpm run check:safe-backlog",
                status="required",
                requiredFor=["safe backlog changes", "maintenance report changes", "blocked authority story reference changes"],
                evidence=[
                    "Validates safe backlog contracts, schemas, API route, service items, dashboard rendering, browser assertions, blocked authority stop lines, and story references stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-managed-recipes",
                label="Managed recipe policy drift",
                command="pnpm run check:managed-recipes",
                status="required",
                requiredFor=["managed recipe changes", "recipe policy report changes", "controls-page report changes"],
                evidence=[
                    "Validates managed recipe contracts, schemas, API route, service report, dashboard rendering, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-maintenance-action-plan",
                label="Maintenance action plan drift",
                command="pnpm run check:maintenance-action-plan",
                status="required",
                requiredFor=["maintenance action plan changes", "safe backlog changes", "controls-page report changes"],
                evidence=[
                    "Validates maintenance action plan contracts, schemas, API route, service steps, dashboard rendering, report anchors, runtime evidence, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-development-runway",
                label="Development runway drift",
                command="pnpm run check:development-runway",
                status="required",
                requiredFor=["development runway changes", "safe slice planning changes", "larger PR policy changes", "controls-page report changes"],
                evidence=[
                    "Validates development runway contracts, schemas, API route, service slices, dashboard rendering, report anchors, runtime evidence, browser assertions, runbooks, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-runner-assignment-status",
                label="Runner assignment status report drift",
                command="pnpm run check:runner-assignment-status",
                status="required",
                requiredFor=["runner assignment report changes", "workspace assignment evidence changes", "controls-page report changes"],
                evidence=[
                    "Validates runner assignment contracts, schemas, API route, service report, dashboard rendering, report shortcuts, and source-owned assignment evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-delivery-readiness",
                label="Delivery readiness policy drift",
                command="pnpm run check:delivery-readiness",
                status="required",
                requiredFor=["delivery readiness policy changes", "controls-page report changes", "work-item delivery gate changes"],
                evidence=[
                    "Validates delivery readiness policy contracts, schemas, API route, service report, dashboard rendering, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-github-workflow-policy",
                label="GitHub workflow policy drift",
                command="pnpm run check:github-workflow-policy",
                status="required",
                requiredFor=["GitHub workflow policy changes", "delivery runbook changes", "controls-page report changes"],
                evidence=[
                    "Validates Git/GCM, GitHub connector, optional gh auth, plaintext-token stop lines, report catalog entries, dashboard rendering, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-cleanup-automation",
                label="Cleanup automation approval-packet drift",
                command="pnpm run check:cleanup-automation",
                status="required",
                requiredFor=["cleanup automation approval packet changes", "workspace cleanup policy changes", "delivery runbook changes"],
                evidence=[
                    "Validates cleanup automation approval-packet docs, scripts, exact-head safeguards, dry-run evidence, and stop lines stay aligned without deleting branches or worktrees.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-maintenance-readiness",
                label="Maintenance readiness drift",
                command="pnpm run check:maintenance-readiness",
                status="required",
                requiredFor=["maintenance report changes", "safe backlog changes", "authority blocker reference changes"],
                evidence=[
                    "Validates maintenance readiness contracts, schemas, API route, service tracks, dashboard rendering, browser assertions, and story evidence stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-token-economy",
                label="Token economy and tool-churn governance drift",
                command="pnpm run check:token-economy",
                status="required",
                requiredFor=["token economy governance changes", "tool churn RCA changes", "agent instruction changes"],
                evidence=[
                    "Validates token-economy governance, Tool Churn RCA routing, examples, source-owned docs, and implementation evidence references stay aligned without adopting external token tooling.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-workspace-coordination",
                label="Workspace coordination report drift",
                command="pnpm run check:workspace-coordination",
                status="required",
                requiredFor=["workspace coordination report changes", "lane ownership guidance changes", "GitHub delivery evidence changes"],
                evidence=[
                    "Validates workspace coordination report contracts, runbook guidance, CI/static check references, dashboard anchors, and cleanup stop lines stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-mise-workflow",
                label="Mise workflow readiness drift",
                command="pnpm run check:mise-workflow",
                status="required",
                requiredFor=["mise workflow changes", "workspace readiness changes", "setup guidance changes"],
                evidence=[
                    "Validates mise-managed workspace readiness guidance, package scripts, runbooks, and fallback behavior stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-linux-install-lane",
                label="Linux install lane boundary drift",
                command="pnpm run check:linux-install-lane",
                status="required",
                requiredFor=["Linux install lane changes", "fresh host proof changes", "install package boundary changes"],
                evidence=[
                    "Validates Linux install lane docs, release-gate traceability, evidence boundaries, package artifact policy, and stop lines stay aligned.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-bmad-work-products",
                label="BMAD work-product boundary drift",
                command="pnpm run check:bmad-work-products",
                status="required",
                requiredFor=["BMAD artifact boundary changes", "agent skill output policy changes", "local planning state changes"],
                evidence=[
                    "Validates BMAD-generated artifacts stay local, source-owned policy references stay current, and tracked files avoid generated planning-state leakage.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-knx-obsidian-memory",
                label="Kendall Obsidian memory synthetic check",
                command="pnpm run check:knx-obsidian-memory",
                status="required",
                requiredFor=["Obsidian memory module changes", "vault boundary changes", "memory proposal runtime changes"],
                evidence=[
                    "Runs the synthetic vault validation loop for approved-folder reads, proposal creation, backup-before-write, and dashboard queue write-back.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="check-clean-install-boundary",
                label="Clean install boundary drift",
                command="pnpm run check:clean-install-boundary",
                status="required",
                requiredFor=["clean install boundary changes", "tracked artifact policy changes", "source-control hygiene changes"],
                evidence=[
                    "Validates tracked files avoid local-only BMAD output, secrets, tool caches, unsupported platform assets, and generated runtime artifacts.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-clean-install-boundary",
                label="Clean install boundary tests",
                command="pnpm run test:clean-install-boundary",
                status="required",
                requiredFor=["clean install boundary changes", "tracked artifact policy changes", "source-control hygiene changes"],
                evidence=[
                    "Runs the clean-install boundary unit test suite that backs the tracked artifact policy.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-knx-obsidian-memory",
                label="Kendall Obsidian memory tests",
                command="pnpm run test:knx-obsidian-memory",
                status="required",
                requiredFor=["Obsidian memory module changes", "vault boundary changes", "memory proposal runtime changes"],
                evidence=[
                    "Runs unit tests for excluded folder handling, traversal rejection, proposal approval gating, and queue-only write-back.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-codex-workspace",
                label="Codex workspace protocol tests",
                command="pnpm run test:codex-workspace",
                status="required",
                requiredFor=["workspace lifecycle changes", "lane assignment changes", "delivery cleanup changes"],
                evidence=[
                    "Runs workspace start, assignment, heartbeat, takeover, finish, and cleanup protocol tests.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-codex-workspace-state",
                label="Codex workspace state tests",
                command="pnpm run test:codex-workspace-state",
                status="required",
                requiredFor=["workspace state resolution changes", "workspace lifecycle changes", "delivery cleanup changes"],
                evidence=[
                    "Validates shared workspace-state resolution and manifest storage boundaries.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-event-writer",
                label="Anti-churn event writer tests",
                command="pnpm run test:anti-churn-event-writer",
                status="required",
                requiredFor=["anti-churn event storage changes", "tool-churn evidence changes", "finish-pr finalization changes"],
                evidence=[
                    "Validates anti-churn event writing keeps local evidence structured and bounded.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-signature-classifier",
                label="Anti-churn signature classifier tests",
                command="pnpm run test:anti-churn-signature-classifier",
                status="required",
                requiredFor=["anti-churn classification changes", "tool-churn routing changes", "failure signature changes"],
                evidence=[
                    "Validates anti-churn signature classification for repeated command and tooling failures.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-event-reader",
                label="Anti-churn event reader tests",
                command="pnpm run test:anti-churn-event-reader",
                status="required",
                requiredFor=["anti-churn event storage changes", "malformed event handling changes", "finish-pr finalization changes"],
                evidence=[
                    "Validates anti-churn event reading distinguishes no-event omissions from malformed input.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-guidance-candidate-classifier",
                label="Anti-churn guidance candidate tests",
                command="pnpm run test:anti-churn-guidance-candidate-classifier",
                status="required",
                requiredFor=["anti-churn guidance changes", "safe edit classification changes", "proposal routing changes"],
                evidence=[
                    "Validates anti-churn guidance candidates are classified for safe edits, proposals, and blocked actions.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-guidance-dedupe",
                label="Anti-churn guidance dedupe tests",
                command="pnpm run test:anti-churn-guidance-dedupe",
                status="required",
                requiredFor=["anti-churn guidance changes", "duplicate proposal handling changes", "event aggregation changes"],
                evidence=[
                    "Validates anti-churn guidance output avoids duplicate lessons and proposals.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-guidance-output",
                label="Anti-churn guidance output tests",
                command="pnpm run test:anti-churn-guidance-output",
                status="required",
                requiredFor=["anti-churn guidance changes", "operator-facing output changes", "finish-pr finalization changes"],
                evidence=[
                    "Validates anti-churn guidance output stays structured, bounded, and evidence-oriented.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-verification-routing",
                label="Anti-churn verification routing tests",
                command="pnpm run test:anti-churn-verification-routing",
                status="required",
                requiredFor=["anti-churn verification changes", "safe edit rollback changes", "finish-pr finalization changes"],
                evidence=[
                    "Validates anti-churn verification routing preserves focused checks and recovery metadata.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-apply-safe-gate",
                label="Anti-churn safe-apply gate tests",
                command="pnpm run test:anti-churn-apply-safe-gate",
                status="required",
                requiredFor=["anti-churn source edit changes", "safe-apply gating changes", "authority boundary changes"],
                evidence=[
                    "Validates anti-churn safe-apply gates block unsafe source edits and preserve approval boundaries.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-hook-transaction-store",
                label="Anti-churn transaction store tests",
                command="pnpm run test:anti-churn-hook-transaction-store",
                status="required",
                requiredFor=["anti-churn transaction changes", "rollback metadata changes", "finish-pr finalization changes"],
                evidence=[
                    "Validates anti-churn hook transactions retain recovery metadata without raw prompts or provider payloads.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-source-apply",
                label="Anti-churn source apply tests",
                command="pnpm run test:anti-churn-source-apply",
                status="required",
                requiredFor=["anti-churn source edit changes", "safe local edit changes", "rollback metadata changes"],
                evidence=[
                    "Validates anti-churn source edits apply only through bounded, recoverable safe-edit paths.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-anti-churn-verification-rollback",
                label="Anti-churn verification rollback tests",
                command="pnpm run test:anti-churn-verification-rollback",
                status="required",
                requiredFor=["anti-churn verification changes", "rollback handling changes", "finish-pr finalization changes"],
                evidence=[
                    "Validates anti-churn verification failures roll back local source edits and preserve recovery evidence.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-workspace-command-resolution",
                label="Workspace command resolution tests",
                command="pnpm run test:workspace-command-resolution",
                status="required",
                requiredFor=["workspace command resolution changes", "pnpm runner changes", "tool invocation changes"],
                evidence=[
                    "Validates workspace command resolution keeps JavaScript pnpm entrypoints under the current Node executable without misrouting other shims.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="test-dashboard-e2e-runner",
                label="Dashboard e2e runner tests",
                command="pnpm run test:dashboard-e2e-runner",
                status="required",
                requiredFor=["dashboard e2e runner changes", "browser preflight changes", "workspace browser cache changes"],
                evidence=[
                    "Validates dashboard e2e runner preflight behavior before web-server launch and accepted workspace browser cache posture.",
                    "Runs as part of the full local verification command.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-build",
                label="Dashboard build and type check",
                command="pnpm --filter @kendall/dashboard build",
                status="required",
                requiredFor=["dashboard changes", "contract changes", "controls-page report changes", "full check"],
                evidence=[
                    "Runs the Next.js production build.",
                    "Runs dashboard TypeScript validation through the build pipeline.",
                ],
            ),
            VerificationCommandView(
                commandId="supervisor-tests",
                label="Supervisor integration tests",
                command="pnpm run test:supervisor",
                status="required",
                requiredFor=["supervisor API changes", "domain/service changes", "contract-affecting behavior", "full check"],
                evidence=[
                    "Runs supervisor integration tests through uv and pytest.",
                    "Covers routing, execution evidence, configuration gates, and report endpoints.",
                ],
            ),
            VerificationCommandView(
                commandId="full-check",
                label="Full local verification",
                command="pnpm run check",
                status="required",
                requiredFor=["pre-merge confidence", "local handoff", "fresh VM acceptance"],
                evidence=[
                    "Runs preflight, documentation checks, core readiness/report and authority readiness checks, runtime/safe-backlog/policy drift checks, runbook and workspace hygiene checks, dashboard build, and supervisor integration tests.",
                    "Does not grant execution authority by passing.",
                ],
            ),
        ]
        optional_commands = [
            VerificationCommandView(
                commandId="setup-e2e",
                label="Playwright browser setup",
                command="pnpm run setup:e2e",
                status="optional_when_browser_stack_missing",
                requiredFor=["dashboard browser coverage", "fresh VM browser verification", "focused e2e scripts"],
                evidence=[
                    "Installs Chromium for Playwright when the browser cache is missing.",
                    "Can use the repo-local `.data/ms-playwright` browser cache configured by Playwright.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-controls-e2e",
                label="Dashboard controls browser slice",
                command="pnpm run test:e2e:dashboard:controls",
                status="optional_when_browser_stack_ready",
                requiredFor=["controls page report changes", "read-only evidence panel changes", "focused browser regression checks"],
                evidence=[
                    "Runs the controls-page Playwright slice with stable test-file and grep arguments.",
                    "Uses the Playwright config web servers, including repo-local uv/temp cache defaults.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-detail-e2e",
                label="Dashboard detail browser slice",
                command="pnpm run test:e2e:dashboard:detail",
                status="optional_when_browser_stack_ready",
                requiredFor=["work-item detail changes", "runtime evidence panel changes", "focused browser regression checks"],
                evidence=[
                    "Runs the work-item detail Playwright slice with stable test-file and grep arguments.",
                    "Owns supervisor and dashboard server lifecycle through the supported Linux Playwright web-server path.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-mobile-e2e",
                label="Dashboard mobile browser slice",
                command="pnpm run test:e2e:dashboard:mobile",
                status="optional_when_browser_stack_ready",
                requiredFor=["mobile dashboard changes", "intake draft persistence changes", "focused phone viewport regression checks"],
                evidence=[
                    "Runs the mobile intake draft Playwright slice with stable test-file and grep arguments.",
                    "Uses the shared focused dashboard e2e lifecycle helper with repo-local cache defaults.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-managed-recipe-e2e",
                label="Dashboard managed recipe browser slice",
                command="pnpm run test:e2e:dashboard:managed",
                status="optional_when_browser_stack_ready",
                requiredFor=["managed dashboard recipe changes", "operator template changes", "recipe intake regression checks"],
                evidence=[
                    "Runs the managed dashboard coverage recipe Playwright slice with stable test-file and grep arguments.",
                    "Uses the shared focused dashboard e2e lifecycle helper with repo-local cache defaults.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-managed-mobile-recipe-e2e",
                label="Dashboard managed mobile recipe browser slice",
                command="pnpm run test:e2e:dashboard:managed:mobile",
                status="optional_when_browser_stack_ready",
                requiredFor=["managed mobile recipe changes", "mobile operator template changes", "phone viewport recipe intake checks"],
                evidence=[
                    "Runs the managed mobile dashboard coverage recipe Playwright slice with stable test-file and grep arguments.",
                    "Uses the shared focused dashboard e2e lifecycle helper with repo-local cache defaults.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-provider-raw-output-e2e",
                label="Dashboard provider raw-output browser slice",
                command="pnpm run test:e2e:dashboard:provider-raw-output",
                status="optional_when_browser_stack_ready",
                requiredFor=["provider-adjacent evidence display changes", "raw-output UI regression checks"],
                evidence=[
                    "Runs a focused Playwright slice with synthetic local-only provider raw-output fixtures.",
                    "Asserts bounded metadata is visible while raw prompts, completions, provider payloads, secrets, and source copies stay out of DOM text.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-e2e",
                label="Dashboard browser coverage",
                command="pnpm run test:e2e:dashboard",
                status="optional_when_browser_stack_ready",
                requiredFor=["dashboard interaction changes", "responsive UI changes", "operator workflow changes"],
                evidence=[
                    "Runs Playwright coverage for dashboard intake, controls, and work-item workflows.",
                    "May require local browser/web-server cache posture to be healthy.",
                ],
            ),
            VerificationCommandView(
                commandId="github-doctor-remote",
                label="GitHub remote readiness",
                command="pnpm run doctor:github -- --remote",
                status="optional_before_live_delivery",
                requiredFor=["fresh VM acceptance", "interactive credential proof", "remote delivery debugging"],
                evidence=[
                    "Checks Git/GCM/GitHub delivery readiness.",
                    "Live remote checks should be run from an approved interactive context when needed.",
                ],
            ),
        ]
        command_groups = [
            VerificationCommandGroupView(
                groupId="setup-and-preflight",
                label="Setup and preflight",
                status="required",
                summary="Confirm workspace tools, JavaScript dependencies, and supervisor Python environment before deeper verification.",
                commandIds=["preflight"],
                requiredBefore="all local verification",
                nextAction="Run `pnpm run preflight` first when a shell, VM, dependency, or PATH state is uncertain.",
            ),
            VerificationCommandGroupView(
                groupId="static-drift-chain",
                label="Static drift chain",
                status="required",
                summary="Run documentation, report, runtime evidence, safe backlog, runbook, and policy drift checks before browser or full test work.",
                commandIds=[
                    "check-docs",
                    "check-documentation-authority",
                    "check-verification-readiness",
                    "check-authority-readiness",
                    "check-adaptive-scoring",
                    "check-premium-execution",
                    "check-worker-launch",
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
                    "check-runner-assignment-status",
                    "check-delivery-readiness",
                    "check-github-workflow-policy",
                    "check-cleanup-automation",
                    "check-maintenance-readiness",
                    "check-token-economy",
                    "check-workspace-coordination",
                    "check-mise-workflow",
                    "check-linux-install-lane",
                    "check-bmad-work-products",
                    "check-knx-obsidian-memory",
                    "test-clean-install-boundary",
                    "test-knx-obsidian-memory",
                    "check-clean-install-boundary",
                    "test-codex-workspace",
                    "test-codex-workspace-state",
                    "test-anti-churn-event-writer",
                    "test-anti-churn-signature-classifier",
                    "test-anti-churn-event-reader",
                    "test-anti-churn-guidance-candidate-classifier",
                    "test-anti-churn-guidance-dedupe",
                    "test-anti-churn-guidance-output",
                    "test-anti-churn-verification-routing",
                    "test-anti-churn-apply-safe-gate",
                    "test-anti-churn-hook-transaction-store",
                    "test-anti-churn-source-apply",
                    "test-anti-churn-verification-rollback",
                    "test-workspace-command-resolution",
                    "test-dashboard-e2e-runner",
                ],
                requiredBefore="dashboard build, supervisor tests, and merge",
                nextAction="Run focused drift checks matching changed surfaces, then let `pnpm run check` run the full static chain.",
            ),
            VerificationCommandGroupView(
                groupId="dashboard-browser-build",
                label="Dashboard browser and build",
                status="required_when_dashboard_changes",
                summary="Use focused browser runners for changed dashboard surfaces, then build the dashboard before merge.",
                commandIds=[
                    "dashboard-controls-e2e",
                    "dashboard-detail-e2e",
                    "dashboard-mobile-e2e",
                    "dashboard-managed-recipe-e2e",
                    "dashboard-managed-mobile-recipe-e2e",
                    "dashboard-provider-raw-output-e2e",
                    "dashboard-e2e",
                    "dashboard-build",
                ],
                requiredBefore="dashboard UI delivery",
                nextAction="Run the focused runner for the changed page and keep the production dashboard build green.",
            ),
            VerificationCommandGroupView(
                groupId="supervisor-behavior-tests",
                label="Supervisor behavior tests",
                status="required",
                summary="Run focused supervisor tests for changed behavior, then the full supervisor integration suite through the local wrapper.",
                commandIds=["supervisor-tests"],
                requiredBefore="service/API delivery",
                nextAction="Use `pnpm run test:supervisor -- ... -k ...` for focused checks before `pnpm run check`.",
            ),
            VerificationCommandGroupView(
                groupId="full-local-gate",
                label="Full local gate",
                status="required",
                summary="The full local gate runs preflight, static checks, dashboard build, and supervisor integration tests without approving execution authority.",
                commandIds=["full-check"],
                requiredBefore="commit, PR, and merge",
                nextAction="Run `pnpm run check` after focused verification passes and before committing.",
            ),
            VerificationCommandGroupView(
                groupId="optional-remote-bootstrap",
                label="Optional remote and setup",
                status="optional",
                summary="Use GitHub doctor and setup verification when changing remote delivery or setup behavior.",
                commandIds=["github-doctor-remote", "setup-e2e"],
                requiredBefore="remote delivery or setup troubleshooting",
                nextAction="Run optional checks only when the relevant auth or browser target is available.",
            ),
        ]
        handoff_checkpoints = [
            VerificationHandoffCheckpointView(
                checkpointId="local-development-handoff",
                label="Local development handoff",
                status="required_before_pr",
                summary="Confirm the changed surfaces have focused verification, then run the full local gate before commit and PR.",
                requiredCommandIds=["preflight", "full-check"],
                relatedRunbooks=["README.md", "docs/workflows/current-session-runbook.md"],
                nextAction="Record focused checks and `pnpm run check` in the PR body before requesting merge.",
            ),
            VerificationHandoffCheckpointView(
                checkpointId="dashboard-change-handoff",
                label="Dashboard change handoff",
                status="required_when_dashboard_changes",
                summary="Pair dashboard UI changes with focused browser coverage and a production dashboard build.",
                requiredCommandIds=["dashboard-controls-e2e", "dashboard-detail-e2e", "dashboard-build"],
                relatedRunbooks=["docs/workflows/current-session-runbook.md"],
                nextAction="Run the focused browser runner for the changed page, then keep `pnpm run check` green.",
            ),
            VerificationHandoffCheckpointView(
                checkpointId="setup-handoff",
                label="Setup handoff",
                status="required_for_setup_changes",
                summary="Use setup verification and GitHub doctor evidence when supported setup or remote-delivery assumptions change.",
                requiredCommandIds=["github-doctor-remote", "setup-e2e"],
                relatedRunbooks=["README.md", "docs/workflows/linux-primary-development-runbook.md"],
                nextAction="Run optional setup checks only from an appropriate context with healthy credentials.",
            ),
            VerificationHandoffCheckpointView(
                checkpointId="authority-boundary-handoff",
                label="Authority boundary handoff",
                status="always_blocking_without_explicit_approval",
                summary="Treat green verification as repo-health evidence only; execution-authority stories remain blocked without explicit operator approval.",
                requiredCommandIds=["check-authority-readiness", "check-execution-boundary", "check-process-lifecycle"],
                relatedRunbooks=[
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                nextAction=(
                    "Do not start provider calls, process launch, shell execution, source mutation, network, "
                    "credential, premium, or remote automation work from verification results."
                ),
            ),
        ]

        return VerificationReadinessReportView(
            reportId="verification-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Verification readiness is local and evidence-oriented: checks prove repo health, dashboard buildability, "
                "supervisor behavior, and documentation consistency without approving worker execution."
            ),
            requiredCommands=required_commands,
            optionalCommands=optional_commands,
            commandGroups=command_groups,
            handoffCheckpoints=handoff_checkpoints,
            stopLines=[
                "Passing verification does not approve local provider/model calls.",
                "Passing verification does not approve subscription-agent process launch.",
                "Passing verification does not approve premium execution.",
                "Passing verification does not approve arbitrary shell execution by workers.",
                "Passing verification does not approve worker source mutation, network access, or credential access.",
            ],
            nextSafeActions=[
                "Run focused tests for the code area changed, then run `pnpm run check` before merge.",
                "Use Playwright dashboard coverage when UI behavior changes and the local browser stack is healthy.",
                "Use the dashboard e2e report before changing browser workflow coverage.",
                "Keep verification reports aligned with README, handoff, and fresh VM checklist commands.",
            ],
        )

    def get_authority_readiness_matrix_report(self) -> AuthorityReadinessMatrixReportView:
        documentation = self.get_documentation_authority_report()
        verification = self.get_verification_readiness_report()
        threat_boundary = self.get_threat_boundary()

        blocked_by_family = {
            "Ollama local provider": [
                story.path for story in documentation.blockedStories if story.authorityFamily == "Ollama local provider"
            ],
            "Subscription-agent launch": [
                story.path for story in documentation.blockedStories if story.authorityFamily == "Subscription-agent launch"
            ],
        }
        required_commands = [command.command for command in verification.requiredCommands]

        families = [
            AuthorityReadinessFamilyView(
                familyId="local-provider-execution",
                label="Local provider execution",
                status="blocked_pending_explicit_approval",
                summary="Ollama and other local provider calls remain disabled until provider-specific approval, no-call proofs, settings gates, prompt policy, and rollback evidence are accepted.",
                blockedStories=blocked_by_family["Ollama local provider"],
                requiredApprovals=[
                    "Explicit operator approval naming the local provider, endpoint, model, authority scope, and rollback plan.",
                    "Approved provider PRD or decision record for the exact provider lane.",
                ],
                requiredEvidence=[
                    "Disabled provider no-call proofs for Ollama, LM Studio, vLLM, and llama.cpp.",
                    "Execution readiness provider enablement policy remains unsatisfied.",
                    "Prompt redaction, retention, timeout, cancellation, and credential policies are reviewed before enablement.",
                ],
                relatedReports=[
                    "GET /supervisor/execution-readiness-report",
                    "GET /supervisor/disabled-provider-proofs",
                    "GET /supervisor/threat-boundary",
                    "GET /supervisor/documentation-authority-report",
                ],
                relatedDocs=[
                    "docs/workflows/product-requirements-boundary.md#local-provider-ollama-boundary",
                    "docs/workflows/product-requirements-boundary.md#local-provider-ollama-boundary",
                    "docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md",
                ],
                dashboardAnchors=["/controls#execution-readiness-report", "/controls#documentation-authority-report"],
                stopLines=[
                    "Do not call local provider HTTP endpoints.",
                    "Do not construct prompts for a local model from work-item evidence.",
                    "Do not read provider credentials or model server secrets.",
                ],
                rollbackPath="Keep provider execution disabled and revert to no-call fixture evidence if any provider gate, endpoint, model, prompt, or retention requirement is missing.",
                nextAction="Keep provider execution blocked until explicit approval names the provider authority and scope.",
            ),
            AuthorityReadinessFamilyView(
                familyId="subscription-agent-launch",
                label="Subscription-agent launch",
                status="blocked_pending_explicit_approval",
                summary="Direct subscription-agent process launch remains disabled until process lifecycle, workspace, output, session, approval, and rollback requirements are approved.",
                blockedStories=blocked_by_family["Subscription-agent launch"],
                requiredApprovals=[
                    "Explicit operator approval naming the agent launch target, lifecycle scope, workspace policy, and rollback plan.",
                    "Approved subscription-agent launch PRD or decision record for supervised execution.",
                ],
                requiredEvidence=[
                    "Process lifecycle policy requires route-bound approval and disabled launch evidence.",
                    "Execution attempts record lifecycle state without launching a process.",
                    "Workspace isolation and artifact output policies remain review-only.",
                ],
                relatedReports=[
                    "GET /supervisor/maintenance-action-plan-report",
                    "GET /supervisor/execution-readiness-report",
                    "GET /supervisor/execution-state-boundary",
                    "GET /supervisor/threat-boundary",
                ],
                relatedDocs=[
                    "docs/workflows/product-requirements-boundary.md#subscription-agent-launch-boundary",
                    "docs/workflows/product-requirements-boundary.md#subscription-agent-launch-boundary",
                    "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
                ],
                dashboardAnchors=["/controls#maintenance-action-plan-report", "/controls#execution-readiness-report"],
                stopLines=[
                    "Do not launch subscription-agent processes.",
                    "Do not allocate supervised runtime sessions.",
                    "Do not attach OS process IDs or live process supervisors to execution attempts.",
                ],
                rollbackPath="Keep the disabled dry-run adapter path and stop at metadata-only lifecycle evidence if launch approval, workspace isolation, or rollback evidence is stale.",
                nextAction="Keep launch stories blocked until explicit approval names process launch authority and scope.",
            ),
            AuthorityReadinessFamilyView(
                familyId="premium-execution",
                label="Premium execution",
                status="blocked_pending_explicit_approval",
                summary="Premium provider execution remains limited to approval request artifacts and may not run paid model calls from maintenance or generic continuation work.",
                blockedStories=[],
                requiredApprovals=[
                    "Explicit operator approval naming premium provider, cost ceiling, data policy, and audit requirements.",
                    "Approved premium execution policy before any paid call is made.",
                ],
                requiredEvidence=[
                    "Premium approval artifacts are request-only.",
                    "Execution configuration checks keep premiumExecutionAllowed false.",
                    "Verification passing does not approve premium execution.",
                ],
                relatedReports=[
                    "GET /supervisor/execution-readiness-report",
                    "GET /supervisor/threat-boundary",
                    "GET /supervisor/managed-recipe-policy-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/product-requirements-boundary.md#supervisor-execution-authority-expansion-boundary",
                ],
                dashboardAnchors=["/controls#execution-readiness-report", "/controls#managed-recipe-policy-report"],
                stopLines=[
                    "Do not run premium provider calls.",
                    "Do not treat approval request artifacts as approval to execute.",
                ],
                rollbackPath="Keep premiumExecutionAllowed false and revert to approval-request artifacts only if provider, cost, data, or audit policy is incomplete.",
                nextAction="Leave premium execution deferred until a premium-specific policy and approval exist.",
            ),
            AuthorityReadinessFamilyView(
                familyId="adaptive-scoring",
                label="Adaptive scoring",
                status="blocked_pending_explicit_approval",
                summary="Adaptive scoring remains disabled until a scoring policy names approved inputs, outputs, retention, operator review, rollback, and stop lines.",
                blockedStories=[],
                requiredApprovals=[
                    "Explicit operator approval naming the scoring authority, score inputs, output use, review path, and rollback plan.",
                    "Approved scoring policy before scores can influence priority, launch, delivery, cleanup, or authority decisions.",
                ],
                requiredEvidence=[
                    "Current readiness and backlog reports remain read-only evidence surfaces.",
                    "No score is allowed to promote, execute, merge, clean up, or bypass a failed check.",
                    "Future scoring evidence must preserve metadata only and avoid raw prompts, completions, provider payloads, secrets, or unbounded source copies.",
                ],
                relatedReports=[
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/development-runway-report",
                    "GET /supervisor/verification-readiness-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/adaptive-scoring-decision-prep.md",
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                ],
                dashboardAnchors=[
                    "/controls#safe-development-backlog",
                    "/controls#development-runway-report",
                    "/controls#verification-readiness-report",
                ],
                stopLines=[
                    "Do not run adaptive scoring.",
                    "Do not let scores change work priority, authority state, or delivery/cleanup eligibility.",
                    "Do not retain raw scoring inputs beyond metadata-only evidence.",
                ],
                rollbackPath="Keep deterministic review-only ordering and remove any scoring-derived recommendation if the scoring policy, evidence, or approval binding is incomplete.",
                nextAction="Use docs/workflows/adaptive-scoring-decision-prep.md and pnpm run check:adaptive-scoring to prepare a separate scoring decision packet before any adaptive scoring implementation starts.",
            ),
            AuthorityReadinessFamilyView(
                familyId="worker-command-source-network-credentials",
                label="Worker command, source, network, and credential authority",
                status="blocked_by_default",
                summary="Worker shell commands, source mutation, network access, and credential access remain denied by the threat boundary and workspace isolation plan.",
                blockedStories=[],
                requiredApprovals=[
                    "Explicit operator approval naming allowed command classes, write roots, network destinations, and credential boundary.",
                    "Threat-boundary update with tests before any worker receives broader capabilities.",
                ],
                requiredEvidence=[
                    f"Blocked command classes: {', '.join(threat_boundary.blockedCommandClasses)}.",
                    "Workspace isolation plans keep sourceMutationAllowed, commandsAllowed, networkAllowed, and credentialAccessAllowed false.",
                    "Runtime evidence exports exclude credentials, provider payloads, and external filesystem snapshots.",
                ],
                relatedReports=[
                    "GET /supervisor/threat-boundary",
                    "GET /supervisor/execution-configuration-checks",
                    "GET /work-items/{id}/runtime-evidence-export",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md",
                    "docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#execution-readiness-report"],
                stopLines=[
                    "Do not permit arbitrary worker shell commands.",
                    "Do not grant worker source mutation, network access, or credential access.",
                    "Do not weaken runtime evidence export exclusions to include secrets.",
                ],
                rollbackPath="Keep worker authority denied by default and revert to read-only metadata/export evidence if any command, source, network, or credential boundary is unclear.",
                nextAction="Keep worker authority disabled while improving read-only evidence and review surfaces.",
            ),
            AuthorityReadinessFamilyView(
                familyId="remote-delivery-automation",
                label="Remote delivery automation",
                status="blocked_pending_explicit_approval",
                summary="Automated remote delivery remains blocked for managed recipes; Codex may use approved Git/GCM or connector workflows, but workers may not automate remote operations.",
                blockedStories=[],
                requiredApprovals=[
                    "Explicit operator approval naming allowed remote operations and scope before worker-run remote automation.",
                    "Delivery readiness evidence for PR, CI, merge, and waiver state before review approval.",
                ],
                requiredEvidence=[
                    "Managed recipe policy blocks git push, pull request creation, CI wait, merge, release, and deployment.",
                    "GitHub workflow policy requires Git/GCM or connector-backed authentication and rejects persistent plaintext token storage.",
                    "Delivery readiness report keeps remote automation approval false.",
                ],
                relatedReports=[
                    "GET /supervisor/github-workflow-policy-report",
                    "GET /supervisor/delivery-readiness-policy-report",
                    "GET /supervisor/managed-recipe-policy-report",
                ],
                relatedDocs=[
                    "docs/github-connector-workflow.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#github-workflow-policy-report",
                    "/controls#delivery-readiness-policy-report",
                    "/controls#managed-recipe-policy-report",
                ],
                stopLines=[
                    "Do not give managed workers remote delivery automation.",
                    "Do not persist plaintext GitHub tokens.",
                    "Do not treat delivery readiness records as approval to deploy.",
                ],
                rollbackPath="Keep managed workers blocked from remote delivery and fall back to human or connector-backed GitHub work if approval, CI, review, or credential evidence is missing.",
                nextAction="Keep remote delivery policy visible while human/connector-backed PR work remains separate from worker automation.",
            ),
            AuthorityReadinessFamilyView(
                familyId="github-delivery",
                label="GitHub delivery",
                status="evidence_ready_approval_required",
                summary="Epic 10 delivery evidence supports human/connector-backed PR and merge review flows, while worker-run remote delivery automation remains separately blocked.",
                blockedStories=[],
                requiredApprovals=[
                    "Exact delivery approval naming PR, merge, branch, base, evidence, rollback path, stop lines, and review point before any remote mutation.",
                    "Trusted approval-ledger entry for delivery execution; authority-looking identifiers alone are rejected.",
                ],
                requiredEvidence=[
                    "Low-risk delivery dry-run plan from Story 10.1.",
                    "Safe cleanup plan from Story 10.3 remains linked because delivery closeout and cleanup readiness are evaluated together.",
                    "Delivery execution evidence from Story 10.2 for approved PR and merge actions.",
                    "Trusted authority ledger validation from Story 10.5.",
                    "PR #103 recorded merged to main as of GitHub state checked on 2026-06-21; GitHub reports merge commit 80dbd488885d90c225c1d7625d1e84ef75a94752.",
                ],
                relatedReports=[
                    "GET /supervisor/delivery-readiness-policy-report",
                    "GET /supervisor/github-workflow-policy-report",
                    "GET /work-items/{id}/delivery-execution-evidence",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/github-connector-workflow.md",
                ],
                dashboardAnchors=[
                    "/controls#delivery-readiness-policy-report",
                    "/controls#github-workflow-policy-report",
                    "/work-items",
                ],
                stopLines=[
                    "Do not treat readiness as approval to push, create PRs, wait CI, merge, deploy, or delete branches.",
                    "Do not execute remote delivery from managed workers.",
                    "Do not use PR #103 delivery evidence for new remote mutation without a fresh exact approval packet.",
                ],
                rollbackPath="Stop before remote mutation when PR state, CI, review, approval-ledger, or branch evidence is stale; preserve delivery evidence and return to dry-run planning.",
                nextAction="Use the current delivery packet and GitHub state to drive human/connector-backed PR work only.",
            ),
            AuthorityReadinessFamilyView(
                familyId="cleanup-automation",
                label="Cleanup automation",
                status="blocked_pending_explicit_approval",
                summary="Cleanup planning evidence is available, but local deletion, branch deletion, worktree removal, and remote cleanup remain blocked until a target-specific approval is accepted.",
                blockedStories=[],
                requiredApprovals=[
                    "Exact cleanup approval naming target path or branch, classification, retained evidence, blocked paths, rollback path, and expiry.",
                    "Separate approval for destructive local cleanup, branch deletion, worktree deletion, or remote cleanup/sync.",
                ],
                requiredEvidence=[
                    "Low-risk delivery dry-run plan from Story 10.1 defines PR, merge, and cleanup planning as one report-only workflow.",
                    "Delivery execution evidence from Story 10.2 keeps cleanup downstream of approved PR and merge evidence.",
                    "Safe cleanup plan from Story 10.3 with evidence preservation and worktree residue classification.",
                    "Delivery and cleanup Dev Console plan visibility from Story 10.4.",
                    "Trusted authority ledger validation from Story 10.5 is required before cleanup execution approval can be accepted.",
                    "Cleanup target must be classified as Git worktree, filesystem residue, source checkout, or blocked path before action.",
                    "PR #103 merged state is recorded evidence only; cleanup use still requires a fresh GitHub re-check and target-specific approval.",
                ],
                relatedReports=[
                    "GET /supervisor/local-cleanup-readiness-report",
                    "GET /supervisor/remote-cleanup-sync-readiness-report",
                    "GET /work-items/{id}/cleanup-plan",
                    "GET /supervisor/delivery-readiness-policy-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#local-cleanup-readiness-report",
                    "/controls#remote-cleanup-sync-readiness-report",
                    "/work-items",
                ],
                stopLines=[
                    "Do not remove worktrees, branches, source checkouts, or filesystem residue from this report.",
                    "Do not clean up before retained evidence and target classification are verified.",
                    "Do not treat cleanup auto-eligibility as approval for deletion.",
                ],
                rollbackPath="Preserve retained evidence and leave the target untouched if classification, approval, Git registration, or approved-root evidence is missing or ambiguous.",
                nextAction="Use cleanup readiness to prepare a target-specific approval packet; do not delete anything from readiness alone.",
            ),
        ]

        return AuthorityReadinessMatrixReportView(
            reportId="authority-readiness-matrix-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary="Read-only matrix of execution-authority families, approval evidence, blocked stories, related reports, and stop lines before any real worker execution can be enabled.",
            currentStateFindings=[
                CurrentStateReconciliationFindingView(
                    findingId="planning-reconciliation-current",
                    label="Planning reconciliation",
                    status="current_from_story_11_1",
                    summary="Story, PRD, architecture, sprint, and PR-state claims were reconciled from current implementation evidence before selecting the next authority lane.",
                    evidence=[
                        "Story 11.1 is done.",
                        "Stale blocked/deferred wording was corrected only where implementation, verification, approval, PR, or merge evidence existed.",
                        "Artifacts still blocked or deferred name the missing approval, policy, evidence, or readiness gate.",
                    ],
                    relatedDocs=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md",
                        "docs/workflows/product-requirements-boundary.md",
                    ],
                    nextAction="Use refreshed evidence, not stale planning labels, before selecting the next authority lane.",
                ),
                CurrentStateReconciliationFindingView(
                    findingId="pr-103-merged-to-main",
                    label="PR #103 delivery state",
                    status="merged_to_main_recorded",
                    summary="PR #103 is recorded as merged to main in GitHub state checked on 2026-06-21, so Epic 10 delivery and cleanup planning evidence is merged-to-main recorded evidence rather than review-gated PR state.",
                    evidence=[
                        "PR #103 head is codex/epic-10-delivery-cleanup-plans and base is main.",
                        "GitHub state checked on 2026-06-21 reports PR #103 closed and merged on 2026-06-13T22:51:00Z.",
                        "PR #103 merge commit is 80dbd488885d90c225c1d7625d1e84ef75a94752.",
                        "Local story completion is recorded for Stories 11.1, 11.2, and 11.3; this PR #103 status does not cover local Story 11.4 readiness.",
                        "Stacked Story 11.2 and Story 11.3 branches landed through PR #103 rather than remaining only on the stacked branch.",
                        "Merged-to-main state is recorded true for PR #103; successor delivery or cleanup actions still need fresh GitHub re-checks and exact approval.",
                    ],
                    relatedDocs=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract",
                    ],
                    nextAction="Use PR #103 as recorded merged evidence only; re-check GitHub and approval state before any successor delivery or cleanup decision.",
                ),
            ],
            nextLaneDecisionPacket=NextLaneDecisionPacketView(
                packetId="epic-11-next-lane-authority-decision-contract",
                status="decision_only_no_authority_granted",
                recommendation="Adaptive scoring decision preparation is only a lane for the operator to consider approving; no lane is selected or authorized.",
                packetPath="docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract",
                approvalRequired=True,
                noAuthorityGranted=True,
                requiredFreshnessCheck="PR, CI, review, and lane-readiness state must be re-checked on the same day as successor-story approval.",
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract",
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                ],
                stopLines=[
                    "Do not treat the decision packet recommendation as approval.",
                    "Do not compute adaptive scores, call providers, launch processes, perform premium execution, mutate GitHub, or clean up from this packet.",
                    "Any successor story must match the selected packet lane's exact authority family, operation, target, evidence, stop lines, retained evidence, rollback path, and expiry or review point.",
                ],
                nextAction="Prepare an exact approval packet only after the operator selects one lane to consider.",
            ),
            families=families,
            readinessLadder=[
                ProviderEnablementPolicyStepView(
                    stepId="explicit-authority-approval",
                    label="Explicit authority approval",
                    status="blocked",
                    summary="No authority family may move from blocked to ready without operator approval naming the authority and scope.",
                    requiredEvidence=[
                        "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                    ],
                ),
                ProviderEnablementPolicyStepView(
                    stepId="evidence-surface-alignment",
                    label="Evidence surface alignment",
                    status="ready",
                    summary="Read-only reports, runtime exports, dashboard anchors, and static drift checks are available for review before approval decisions.",
                    requiredEvidence=[
                        "GET /supervisor/report-catalog",
                        "GET /supervisor/maintenance-action-plan-report",
                        f"{len(required_commands)} required verification commands listed.",
                    ],
                ),
                ProviderEnablementPolicyStepView(
                    stepId="implementation-remains-disabled",
                    label="Implementation remains disabled",
                    status="blocked",
                    summary="Provider calls, process launch, premium execution, worker commands, source mutation, network access, and credentials remain disabled.",
                    requiredEvidence=[
                        "GET /supervisor/execution-readiness-report",
                        "GET /supervisor/threat-boundary",
                        "GET /supervisor/execution-configuration-checks",
                    ],
                ),
            ],
            stopLines=[
                "Authority readiness matrix entries are not execution-authority approvals.",
                "Do not start blocked Ollama provider stories or subscription-agent launch stories from this report.",
                "Do not enable process launch, provider/model calls, premium execution, worker commands, source mutation, network access, credential access, or worker remote automation from this report.",
            ],
            nextSafeActions=[
                "Use this matrix before changing any authority-adjacent report, PRD, story, or dashboard surface.",
                "Keep blocked story status and approval checkpoint language aligned with documentation authority checks.",
                "Continue safe maintenance and evidence navigation until explicit operator approval names an authority family and scope.",
            ],
        )

    def get_dashboard_e2e_report(self) -> DashboardE2EReportView:
        setup_commands = [
            VerificationCommandView(
                commandId="setup-e2e",
                label="Playwright browser setup",
                command="pnpm run setup:e2e",
                status="optional_when_browser_stack_missing",
                requiredFor=["dashboard browser coverage", "fresh VM browser verification", "focused e2e scripts"],
                evidence=[
                    "Installs Chromium for Playwright when the browser cache is missing.",
                    "Uses the repo-local `.data/ms-playwright` browser cache configured by Playwright.",
                ],
            ),
            VerificationCommandView(
                commandId="dashboard-build",
                label="Dashboard build and type check",
                command="pnpm --filter @kendall/dashboard build",
                status="required_for_dashboard_changes",
                requiredFor=["dashboard changes", "contract changes", "controls-page report changes"],
                evidence=[
                    "Runs the Next.js production build.",
                    "Validates dashboard TypeScript through the build pipeline.",
                ],
            ),
            VerificationCommandView(
                commandId="check-e2e-report",
                label="Dashboard e2e report drift",
                command="pnpm run check:e2e-report",
                status="required_for_runner_changes",
                requiredFor=["dashboard e2e runner changes", "verification report changes", "browser coverage documentation"],
                evidence=[
                    "Validates package scripts, supervisor report command metadata, browser assertions, and story index coverage.",
                    "Runs as part of `pnpm run check` before merge.",
                ],
            ),
        ]
        runners = [
            DashboardE2ERunnerView(
                runnerId="dashboard-controls-e2e",
                label="Controls report slice",
                command="pnpm run test:e2e:dashboard:controls",
                target="Controls page report panels and read-only authority summaries.",
                status="active",
                evidence=[
                    "scripts/run-controls-e2e.mjs declares the controls slice.",
                    "scripts/dashboard-e2e-runner.mjs owns supervisor and dashboard server lifecycle.",
                    "tests/e2e/dashboard.spec.ts covers controls-page report panels.",
                    "Uses repo-local database, uv cache, temp, and Playwright browser cache paths.",
                ],
            ),
            DashboardE2ERunnerView(
                runnerId="dashboard-detail-e2e",
                label="Work-item detail runtime export slice",
                command="pnpm run test:e2e:dashboard:detail",
                target="Work-item detail runtime evidence export and review manifest panels.",
                status="active",
                evidence=[
                    "scripts/run-detail-e2e.mjs declares the work-item detail slice.",
                    "scripts/dashboard-e2e-runner.mjs owns supervisor and dashboard server lifecycle.",
                    "tests/e2e/dashboard.spec.ts covers runtime evidence export detail behavior.",
                    "Runtime evidence review manifest assertions stay isolated from authority enablement.",
                ],
            ),
            DashboardE2ERunnerView(
                runnerId="dashboard-mobile-e2e",
                label="Mobile intake draft slice",
                command="pnpm run test:e2e:dashboard:mobile",
                target="Phone-sized intake draft persistence and submission cleanup.",
                status="active",
                evidence=[
                    "scripts/run-mobile-e2e.mjs declares the mobile intake slice.",
                    "scripts/dashboard-e2e-runner.mjs owns supervisor and dashboard server lifecycle.",
                    "tests/e2e/dashboard-mobile.spec.ts covers phone-sized draft restore behavior.",
                    "Uses repo-local database, uv cache, temp, and Playwright browser cache paths.",
                ],
            ),
            DashboardE2ERunnerView(
                runnerId="dashboard-managed-recipe-e2e",
                label="Managed dashboard recipe slice",
                command="pnpm run test:e2e:dashboard:managed",
                target="Desktop operator template intake for dashboard coverage recipe work.",
                status="active",
                evidence=[
                    "scripts/run-managed-recipe-e2e.mjs declares the managed dashboard recipe slice.",
                    "scripts/dashboard-e2e-runner.mjs owns supervisor and dashboard server lifecycle.",
                    "tests/e2e/supervisor-managed-recipe.spec.ts covers the dashboard coverage intake template.",
                    "Uses repo-local database, uv cache, temp, and Playwright browser cache paths.",
                ],
            ),
            DashboardE2ERunnerView(
                runnerId="dashboard-managed-mobile-recipe-e2e",
                label="Managed mobile dashboard recipe slice",
                command="pnpm run test:e2e:dashboard:managed:mobile",
                target="Phone-sized operator template intake for mobile dashboard coverage recipe work.",
                status="active",
                evidence=[
                    "scripts/run-managed-mobile-recipe-e2e.mjs declares the managed mobile recipe slice.",
                    "scripts/dashboard-e2e-runner.mjs owns supervisor and dashboard server lifecycle.",
                    "tests/e2e/supervisor-managed-mobile-recipe.spec.ts covers the mobile coverage intake template.",
                    "Uses repo-local database, uv cache, temp, and Playwright browser cache paths.",
                ],
            ),
            DashboardE2ERunnerView(
                runnerId="dashboard-provider-raw-output-e2e",
                label="Provider raw-output UI regression slice",
                command="pnpm run test:e2e:dashboard:provider-raw-output",
                target="Work-item runtime evidence UI and report surfaces that must not render raw provider output.",
                status="active",
                evidence=[
                    "scripts/run-provider-raw-output-ui-e2e.mjs declares the provider raw-output UI slice.",
                    "tests/fixtures/provider-raw-output-ui/cases.json provides synthetic success, failure, empty, and oversized raw-output fixtures.",
                    "tests/e2e/dashboard.spec.ts asserts bounded metadata appears and raw provider sentinels do not appear in DOM text.",
                    "Uses the shared focused dashboard e2e lifecycle helper with repo-local cache defaults.",
                ],
            ),
            DashboardE2ERunnerView(
                runnerId="dashboard-full-e2e",
                label="Full dashboard coverage",
                command="pnpm run test:e2e:dashboard",
                target="Dashboard intake, controls, queue, audit, and work-item workflows.",
                status="optional_when_browser_stack_ready",
                evidence=[
                    "Runs Playwright coverage through playwright.config.ts web servers.",
                    "Useful after broad operator workflow or responsive UI changes.",
                    "Requires the Linux browser stack and Playwright web-server lifecycle to be healthy.",
                ],
                ownsServerLifecycle=False,
            ),
        ]

        return DashboardE2EReportView(
            reportId="dashboard-e2e-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only browser verification map for dashboard e2e runners, setup commands, cache posture, "
                "server lifecycle ownership, and authority stop lines."
            ),
            runners=runners,
            setupCommands=setup_commands,
            stopLines=[
                "Browser verification does not approve local provider/model calls.",
                "Browser verification does not approve subscription-agent process launch.",
                "Browser verification does not approve premium execution.",
                "Browser verification does not approve arbitrary shell execution by workers.",
                "Browser verification does not approve worker source mutation, network access, or credential access.",
            ],
            nextSafeActions=[
                "Use focused runners for report, runtime export, mobile, or managed recipe dashboard changes.",
                "Run `pnpm run check:e2e-report` after changing dashboard e2e runner commands or report metadata.",
                "Run full dashboard e2e only when the browser stack and web-server lifecycle posture are healthy.",
                "Keep runner commands aligned with the verification readiness report and package scripts.",
            ],
        )


    def _codex_workspace_repo_root(self) -> Path:
        return Path(__file__).resolve().parents[5]

    def _codex_workspace_key(self) -> str:
        repo_root = self._codex_workspace_repo_root()
        try:
            origin = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=repo_root,
                capture_output=True,
                check=False,
                text=True,
                timeout=2,
            ).stdout.strip()
        except Exception:
            origin = ""
        match = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(\.git)?$", origin, re.I)
        raw = f"{match.group('owner')}-{match.group('repo')}" if match else repo_root.name
        return re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")

    def _codex_workspace_state_root(self) -> Path:
        configured = os.getenv("CODEX_WORKSPACE_STATE_ROOT") or os.getenv("CODEX_WORKSPACE_ROOT")
        if configured:
            return Path(configured).expanduser().resolve()
        return (Path.home() / ".codex-workspaces" / self._codex_workspace_key()).resolve()

    def _runner_degraded_input(self, input_kind: str, path: str | None, severity: str, reason: str, skipped_count: int | None = None) -> RunnerAssignmentDegradedInputView:
        return RunnerAssignmentDegradedInputView(inputKind=input_kind, path=path, severity=severity, reason=reason, skippedCount=skipped_count)

    def _runner_warning(self, code: str, severity: str, message: str) -> RunnerAssignmentWarningView:
        return RunnerAssignmentWarningView(code=code, severity=severity, message=message)

    def _parse_runner_timestamp(self, manifest: dict, now: datetime) -> tuple[datetime | None, str, int | None, bool, list[RunnerAssignmentWarningView]]:
        warnings: list[RunnerAssignmentWarningView] = []
        for source in ["last_heartbeat_at", "owner_updated_at", "updated_at", "assigned_at", "created_at"]:
            value = manifest.get(source)
            if not value:
                continue
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
            except ValueError:
                return None, "invalid", None, True, [self._runner_warning("invalid-heartbeat-timestamp", "warning", "Heartbeat timestamp could not be parsed.")]
            age = int((now - parsed).total_seconds())
            if age < 0:
                warnings.append(self._runner_warning("future-heartbeat-timestamp", "warning", "Heartbeat timestamp is in the future; clock skew is visible."))
                return parsed, "future", 0, False, warnings
            if source != "last_heartbeat_at":
                warnings.append(self._runner_warning("inferred-heartbeat", "info", f"Heartbeat age inferred from {source}."))
            return parsed, source, age, False, warnings
        return None, "missing", None, True, [self._runner_warning("missing-heartbeat", "warning", "No heartbeat timestamp is available.")]

    def _runner_delivery_state(self, manifest: dict) -> str:
        status = str(manifest.get("status") or "").lower()
        pr_url = manifest.get("pr_url")
        pr_number = manifest.get("pr_number")
        if status == "closed":
            return "closed"
        if status == "merged":
            return "merged"
        if manifest.get("cleanup_partial"):
            return "cleanup-partial"
        if status == "cleanup-ready":
            return "cleanup-ready"
        if manifest.get("draft_pr"):
            return "draft-pr"
        if manifest.get("pr_closed_unmerged"):
            return "pr-closed-unmerged"
        if pr_url or pr_number:
            return "pr-open"
        return "no-pr"

    def _runner_handoff_text(self, value: object) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    def _runner_handoff_stop_lines(self, handoff: dict) -> list[str]:
        raw_stop_lines = handoff.get("stop_lines") or handoff.get("stopLines")
        if not isinstance(raw_stop_lines, list):
            raw_stop_line = handoff.get("takeover_stop_line") or handoff.get("takeoverStopLine")
            raw_stop_lines = [raw_stop_line] if raw_stop_line else []
        return list(dict.fromkeys(item.strip() for item in raw_stop_lines if isinstance(item, str) and item.strip()))

    def _runner_handoff_candidate_state_counts(self, handoff: dict) -> dict[str, int]:
        raw_counts = handoff["candidate_state_counts"] if "candidate_state_counts" in handoff else handoff.get("candidateStateCounts")
        if not isinstance(raw_counts, dict):
            return {}
        counts: dict[str, int] = {}
        for raw_key, raw_value in raw_counts.items():
            if not isinstance(raw_key, str) or not raw_key.strip():
                continue
            if isinstance(raw_value, bool) or not isinstance(raw_value, int):
                continue
            if raw_value < 0:
                continue
            counts[raw_key.strip()] = raw_value
        return counts

    def _runner_handoff_evidence(self, manifest: dict) -> dict[str, str | list[str] | dict[str, int] | None]:
        handoffs = manifest.get("dispatch_handoffs")
        if not isinstance(handoffs, list) or not handoffs:
            return {
                "handoffStatus": "missing" if manifest.get("worktree_path") else "not-applicable",
                "handoffNextCommand": None,
                "handoffReadinessStatus": None,
                "handoffReadinessCommand": None,
                "handoffGeneratedAt": None,
                "handoffSummary": None,
                "handoffTakeoverStopLines": [],
                "handoffCandidateStateCounts": {},
            }
        latest = next(
            (
                handoff
                for handoff in reversed(handoffs)
                if isinstance(handoff, dict)
                and self._runner_handoff_text(handoff.get("next_command"))
                and isinstance(handoff.get("readiness"), dict)
                and self._runner_handoff_text(handoff["readiness"].get("status"))
            ),
            None,
        )
        if latest is None:
            return {
                "handoffStatus": "missing",
                "handoffNextCommand": None,
                "handoffReadinessStatus": None,
                "handoffReadinessCommand": None,
                "handoffGeneratedAt": None,
                "handoffSummary": None,
                "handoffTakeoverStopLines": [],
                "handoffCandidateStateCounts": {},
            }
        readiness = latest.get("readiness") if isinstance(latest.get("readiness"), dict) else {}
        return {
            "handoffStatus": "available",
            "handoffNextCommand": self._runner_handoff_text(latest.get("next_command")),
            "handoffReadinessStatus": self._runner_handoff_text(readiness.get("status")),
            "handoffReadinessCommand": self._runner_handoff_text(readiness.get("command")),
            "handoffGeneratedAt": self._runner_handoff_text(latest.get("generated_at")),
            "handoffSummary": self._runner_handoff_text(readiness.get("summary")) or self._runner_handoff_text(latest.get("handoff")),
            "handoffTakeoverStopLines": self._runner_handoff_stop_lines(latest),
            "handoffCandidateStateCounts": self._runner_handoff_candidate_state_counts(latest),
        }

    def _runner_worktree_state(self, worktree_path: str | None, state_root: Path, deadline: float) -> tuple[str, list[RunnerAssignmentWarningView]]:
        if not worktree_path:
            return "not-applicable", []
        warnings: list[RunnerAssignmentWarningView] = []
        expected_root = (state_root / "worktrees").resolve()
        try:
            resolved = Path(worktree_path).expanduser().resolve()
        except Exception:
            return "unreadable", [self._runner_warning("worktree-path-unreadable", "blocking", "Worktree path could not be resolved.")]
        if not str(resolved).startswith(str(expected_root)):
            return "unreadable", [self._runner_warning("worktree-outside-managed-root", "blocking", "Worktree path is outside the managed Codex worktree root.")]
        if not resolved.exists():
            return "missing", [self._runner_warning("missing-worktree", "warning", "Worktree path is missing.")]
        if datetime.now(timezone.utc).timestamp() >= deadline:
            return "unreadable", [self._runner_warning("worktree-inspection-skipped-deadline", "warning", "Worktree inspection skipped because the report deadline was reached.")]
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=resolved,
                capture_output=True,
                check=False,
                text=True,
                timeout=2,
                env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
            )
        except subprocess.TimeoutExpired:
            return "unreadable", [self._runner_warning("worktree-inspection-timeout", "warning", "Worktree inspection timed out.")]
        except Exception:
            return "unreadable", [self._runner_warning("worktree-inspection-failed", "warning", "Worktree inspection failed.")]
        if result.returncode != 0:
            return "unreadable", [self._runner_warning("worktree-inspection-failed", "warning", "Git status failed for the worktree.")]
        return ("dirty" if result.stdout.strip() else "clean"), warnings

    def _runner_summary(self, rows: list[RunnerAssignmentStatusRowView], degraded_inputs: list[RunnerAssignmentDegradedInputView]) -> RunnerAssignmentStatusSummaryView:
        summary = RunnerAssignmentStatusSummaryView(degraded=len(degraded_inputs))
        for row in rows:
            if row.classification == "closed":
                summary.closed += 1
            elif row.classification == "blocked_stale_owner_needs_takeover":
                summary.stale += 1
            elif row.classification in {"blocked_missing_worktree"}:
                summary.missing += 1
            elif row.classification.startswith("blocked_") or row.classification == "unknown":
                summary.blocked += 1
            elif row.classification == "ambiguous":
                summary.ambiguous += 1
            elif row.classification == "assignable":
                summary.assignable += 1
            elif row.classification in {"active", "claimed"}:
                summary.active += 1
            if row.degraded:
                summary.degraded += 1
        return summary

    def _runner_assignment_row(
        self,
        record: dict,
        path: Path,
        state_root: Path,
        deadline: float,
        now: datetime,
        stale_after_seconds: int,
        row_kind: str,
    ) -> RunnerAssignmentStatusRowView:
        warnings: list[RunnerAssignmentWarningView] = []
        record_id = str(
            record.get("task_id")
            or record.get("assignment_id")
            or record.get("lane_slug")
            or path.stem
        )
        title = str(record.get("title") or record.get("label") or record_id)
        owner = record.get("owner") or record.get("owner_thread_id")
        heartbeat_at, heartbeat_source, heartbeat_age, heartbeat_missing, heartbeat_warnings = self._parse_runner_timestamp(record, now)
        warnings.extend(heartbeat_warnings)
        stale_after = int(record.get("stale_after_seconds") or stale_after_seconds)
        is_stale = heartbeat_age is not None and heartbeat_age > stale_after
        status = str(record.get("status") or "unknown").lower()

        if status == "closed":
            classification = "closed"
            reason_code = f"{row_kind}-closed"
            reason = f"{row_kind} record is closed"
            next_safe_action = "No assignment action"
        elif owner:
            classification = "claimed" if row_kind == "lane" else "active"
            reason_code = f"{row_kind}-owned"
            reason = f"{row_kind} record is owned"
            next_safe_action = "Review active lane or request heartbeat update"
        else:
            classification = "assignable"
            reason_code = f"{row_kind}-unowned"
            reason = f"{row_kind} record is unowned and claimable"
            next_safe_action = "Claim or resume this lane before mutating it"

        if is_stale and owner and status != "closed":
            classification = "blocked_stale_owner_needs_takeover"
            reason_code = "stale-owner"
            reason = "owner heartbeat is past stale threshold"
            next_safe_action = "Review stale lane before takeover"

        worktree_state, worktree_warnings = self._runner_worktree_state(record.get("worktree_path"), state_root, deadline)
        warnings.extend(worktree_warnings)
        handoff_evidence = self._runner_handoff_evidence(record)
        if worktree_state == "missing" and classification != "closed":
            classification = "blocked_missing_worktree"
            reason_code = "missing-worktree"
            reason = "worktree path is missing"
            next_safe_action = "Inspect worktree before takeover or cleanup"

        return RunnerAssignmentStatusRowView(
            id=record_id,
            title=title,
            classification=classification,
            degraded=bool(warnings) or heartbeat_source in {"invalid", "future"},
            reasonCode=reason_code,
            reason=reason,
            warnings=warnings,
            nextSafeAction=next_safe_action,
            owner=str(owner) if owner else None,
            branch=record.get("branch"),
            taskId=record.get("task_id") or record_id,
            assignmentId=record.get("assignment_id"),
            phase=record.get("phase"),
            runnerKind="codex" if str(record.get("runner_kind") or "").startswith("codex") else "unknown",
            heartbeatAt=heartbeat_at,
            heartbeatSource=heartbeat_source,
            heartbeatAgeSeconds=heartbeat_age,
            heartbeatMissing=heartbeat_missing,
            staleAfterSeconds=stale_after,
            currentCommand=record.get("current_command"),
            lastResult=record.get("last_result"),
            worktreePath=record.get("worktree_path"),
            worktreeState=worktree_state,
            handoffStatus=str(handoff_evidence["handoffStatus"]),
            handoffNextCommand=handoff_evidence["handoffNextCommand"],
            handoffReadinessStatus=handoff_evidence["handoffReadinessStatus"],
            handoffReadinessCommand=handoff_evidence["handoffReadinessCommand"],
            handoffGeneratedAt=handoff_evidence["handoffGeneratedAt"],
            handoffSummary=handoff_evidence["handoffSummary"],
            handoffTakeoverStopLines=handoff_evidence["handoffTakeoverStopLines"],
            handoffCandidateStateCounts=handoff_evidence["handoffCandidateStateCounts"],
            deliveryState=self._runner_delivery_state(record),
            localEvidenceStatus="available",
            evidencePath=str(path),
        )

    def get_runner_assignment_status_report(self) -> RunnerAssignmentStatusReportView:
        now = datetime.now(timezone.utc)
        deadline = now.timestamp() + 2
        stale_after_seconds = 86400
        state_root = self._codex_workspace_state_root()
        degraded_inputs: list[RunnerAssignmentDegradedInputView] = []
        workspace_rows: list[RunnerAssignmentStatusRowView] = []
        lane_rows: list[RunnerAssignmentStatusRowView] = []
        backlog_rows: list[RunnerAssignmentStatusRowView] = []
        state_root_status = "available"
        current_owner: str | None = None

        tasks_dir = state_root / "tasks"
        assignments_dir = state_root / "assignments"
        if not state_root.exists():
            state_root_status = "missing"
            degraded_inputs.append(self._runner_degraded_input("state-root", str(state_root), "blocking", "Codex workspace state root is missing."))
        elif state_root.is_symlink() or not state_root.is_dir():
            state_root_status = "unreadable"
            degraded_inputs.append(self._runner_degraded_input("state-root", str(state_root), "blocking", "Codex workspace state root is not a readable directory."))
        else:
            task_files = sorted([p for p in tasks_dir.iterdir() if p.suffix == ".json"]) if tasks_dir.exists() and tasks_dir.is_dir() else []
            if not tasks_dir.exists():
                state_root_status = "partial"
                degraded_inputs.append(self._runner_degraded_input("tasks-dir", str(tasks_dir), "blocking", "Codex tasks directory is missing."))
            if not assignments_dir.exists():
                state_root_status = "partial"
                degraded_inputs.append(self._runner_degraded_input("assignments-dir", str(assignments_dir), "warning", "Codex assignments directory is missing."))
            assignment_files = sorted([p for p in assignments_dir.iterdir() if p.suffix == ".json"]) if assignments_dir.exists() and assignments_dir.is_dir() else []
            skipped = max(0, len(task_files) - 500)
            assignment_skipped = max(0, len(assignment_files) - 500)
            if skipped:
                state_root_status = "partial"
                degraded_inputs.append(self._runner_degraded_input("task-manifest", str(tasks_dir), "warning", "Task manifest scan limit exceeded.", skipped))
            if assignment_skipped:
                state_root_status = "partial"
                degraded_inputs.append(self._runner_degraded_input("assignment-record", str(assignments_dir), "warning", "Assignment record scan limit exceeded.", assignment_skipped))
            for path in task_files[:500]:
                if path.is_symlink():
                    degraded_inputs.append(self._runner_degraded_input("task-manifest", str(path), "blocking", "Task manifest is a symlink and was skipped."))
                    continue
                try:
                    if path.stat().st_size > 1024 * 1024:
                        degraded_inputs.append(self._runner_degraded_input("task-manifest", str(path), "warning", "Task manifest exceeds the 1 MiB file-size limit."))
                        continue
                    manifest = json.loads(path.read_text())
                except Exception:
                    degraded_inputs.append(self._runner_degraded_input("task-manifest", str(path), "blocking", "Task manifest is malformed or unreadable."))
                    continue

                owner = manifest.get("owner") or manifest.get("owner_thread_id")
                if current_owner is None and owner:
                    current_owner = str(owner)
                workspace_rows.append(self._runner_assignment_row(manifest, path, state_root, deadline, now, stale_after_seconds, "workspace"))
            for path in assignment_files[:500]:
                if path.is_symlink():
                    degraded_inputs.append(self._runner_degraded_input("assignment-record", str(path), "blocking", "Assignment record is a symlink and was skipped."))
                    continue
                try:
                    if path.stat().st_size > 1024 * 1024:
                        degraded_inputs.append(self._runner_degraded_input("assignment-record", str(path), "warning", "Assignment record exceeds the 1 MiB file-size limit."))
                        continue
                    assignment = json.loads(path.read_text())
                except Exception:
                    degraded_inputs.append(self._runner_degraded_input("assignment-record", str(path), "blocking", "Assignment record is malformed or unreadable."))
                    continue
                owner = assignment.get("owner") or assignment.get("owner_thread_id")
                if current_owner is None and owner:
                    current_owner = str(owner)
                lane_rows.append(self._runner_assignment_row(assignment, path, state_root, deadline, now, stale_after_seconds, "lane"))

        try:
            backlog = self.get_safe_development_backlog_report()
            occupied_branches = {row.branch for row in workspace_rows + lane_rows if row.branch and row.classification not in {"closed", "assignable"}}
            occupied_backlog_ids = {row.backlogItemId or row.assignmentId or row.taskId or row.id for row in lane_rows if row.classification not in {"closed", "assignable"}}
            for item in backlog.items:
                classification = "assignable" if item.nextLane else "ambiguous"
                reason_code = "backlog-assignable" if item.nextLane else "missing-lane-metadata"
                reason = "safe backlog item has source-owned lane metadata" if item.nextLane else "ready item has no source-owned lane start command"
                next_action = "Review lane before dispatch" if item.nextLane else "Add source-owned branch/start metadata before dispatch"
                if item.status == "closed" or item.recommendedSliceSize == "complete":
                    classification = "closed"
                    reason_code = "backlog-closed"
                    reason = "safe backlog item is already complete and must not be requeued"
                    next_action = "Use as evidence only; choose the next ready safe backlog lane"
                elif item.status.startswith("blocked"):
                    classification = "blocked_authority"
                    reason_code = "blocked-authority"
                    reason = "safe backlog item is blocked pending explicit authority approval"
                    next_action = "Wait for explicit authority approval"
                elif (item.nextLane and item.nextLane.branchName in occupied_branches) or item.itemId in occupied_backlog_ids:
                    classification = "claimed"
                    reason_code = "backlog-lane-claimed"
                    reason = "safe backlog item already has local workspace or lane assignment evidence"
                    next_action = "Review the existing assignment before dispatch"
                backlog_rows.append(
                    RunnerAssignmentStatusRowView(
                        id=item.itemId,
                        title=item.label,
                        classification=classification,
                        degraded=False,
                        reasonCode=reason_code,
                        reason=reason,
                        warnings=[],
                        nextSafeAction=next_action,
                        branch=item.nextLane.branchName if item.nextLane else None,
                        backlogItemId=item.itemId,
                        runnerKind="unknown",
                        heartbeatSource="missing",
                        heartbeatMissing=True,
                        staleAfterSeconds=stale_after_seconds,
                        worktreeState="not-applicable",
                        deliveryState="unknown",
                        localEvidenceStatus="available",
                    )
                )
        except Exception as exc:
            degraded_inputs.append(self._runner_degraded_input("safe-backlog", None, "warning", f"Safe backlog source unavailable: {exc}"))

        all_rows = workspace_rows + lane_rows + backlog_rows
        summary = self._runner_summary(all_rows, degraded_inputs)
        preferred_successor_ids = (
            "read-only-evidence-polish",
            "dispatcher-queue-handoff-status-refresh",
            "dispatcher-queue-handoff-badges-refresh",
            "dispatcher-queue-state-fixtures-refresh",
            "assignment-report-queue-proof-refresh",
        )
        queued_successor = None
        for successor_id in preferred_successor_ids:
            queued_successor = next(
                (
                    row
                    for row in backlog_rows
                    if row.backlogItemId == successor_id and row.classification == "assignable"
                ),
                None,
            )
            if queued_successor:
                break
        selected_backlog = queued_successor or next((row for row in backlog_rows if row.classification == "assignable"), None)
        blocker_codes = list(
            dict.fromkeys(
                row.reasonCode
                for row in backlog_rows
                if row.classification not in {"assignable", "closed"}
            )
        )
        queue_proof_rows = [
            RunnerDispatcherQueueProofRowView(
                backlogItemId=row.backlogItemId or row.id,
                classification=row.classification,
                reasonCode=row.reasonCode,
                branch=row.branch,
                nextSafeAction=row.nextSafeAction,
            )
            for row in backlog_rows
        ]
        dispatcher_continuity = RunnerDispatcherContinuitySnapshotView(
            snapshotId="dispatcher-continuity-snapshot-v1",
            selectedBacklogItemId=selected_backlog.backlogItemId if selected_backlog else None,
            selectedBranch=selected_backlog.branch if selected_backlog else None,
            dryRunCommand="node ./scripts/codex-workspace.mjs dispatch-next --dry-run --owner <owner>",
            assignableCount=summary.assignable,
            activeCount=summary.active,
            blockedCount=summary.blocked,
            ambiguousCount=summary.ambiguous,
            closedCount=summary.closed,
            blockerCodes=blocker_codes,
            queueProofRows=queue_proof_rows,
            nextAction=selected_backlog.nextSafeAction if selected_backlog else "Resolve blockers before dispatch; do not infer work from chat-only state.",
        )
        partial = bool(degraded_inputs) or any(row.degraded for row in all_rows)
        report_status = "partial" if partial else "ok"
        if state_root_status == "available" and partial:
            state_root_status = "partial"
        return RunnerAssignmentStatusReportView(
            reportStatus=report_status,
            errorMessage=None,
            generatedAt=now,
            stateRoot=str(state_root),
            stateRootStatus=state_root_status,
            partial=partial,
            currentOwner=current_owner,
            staleAfterSeconds=stale_after_seconds,
            summary=summary,
            dispatcherContinuity=dispatcher_continuity,
            workspaceAssignments=workspace_rows,
            laneAssignments=lane_rows,
            backlogCandidates=backlog_rows,
            degradedInputs=degraded_inputs,
        )

    def get_supervisor_report_catalog(self) -> SupervisorReportCatalogView:
        reports = [
            SupervisorReportCatalogEntryView(
                reportId="execution-configuration-checks",
                label="Execution configuration checks",
                endpoint="GET /supervisor/execution-configuration-checks",
                status="active",
                summary="Reports disabled process, provider, model, premium, command, source, network, and credential authority.",
                evidenceScope=["runtime settings", "worker registry", "disabled authority gates"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="execution-readiness-report-v1",
                label="Execution readiness report",
                endpoint="GET /supervisor/execution-readiness-report",
                status="active",
                summary="Summarizes provider enablement policy, disabled authority checks, provider proofs, attempts, and outcomes.",
                evidenceScope=["provider enablement policy", "attempt evidence", "routing outcome evidence"],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="documentation-authority-report-v1",
                label="Documentation authority report",
                endpoint="GET /supervisor/documentation-authority-report",
                status="active",
                summary="Indexes architecture, PRD, story, approval checkpoint, blocked story, and documentation drift status.",
                evidenceScope=["documentation indexes", "blocked authority stories", "approval checkpoint"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="verification-readiness-report-v1",
                label="Verification readiness report",
                endpoint="GET /supervisor/verification-readiness-report",
                status="active",
                summary="Lists required checks, optional checks, and verification stop lines for local delivery readiness.",
                evidenceScope=["workspace checks", "dashboard build", "supervisor tests", "browser test setup"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="authority-readiness-matrix-report-v1",
                label="Authority readiness matrix report",
                endpoint="GET /supervisor/authority-readiness-matrix-report",
                status="active",
                summary="Maps execution-authority families, current-state reconciliation, next-lane decision-packet readiness, approval evidence, dashboard anchors, and stop lines.",
                evidenceScope=[
                    "authority families",
                    "current-state reconciliation",
                    "next-lane decision packet",
                    "blocked stories",
                    "required approvals",
                    "authority stop lines",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="dashboard-e2e-report-v1",
                label="Dashboard e2e report",
                endpoint="GET /supervisor/dashboard-e2e-report",
                status="active",
                summary="Maps focused and full dashboard browser verification runners, setup commands, lifecycle notes, and stop lines.",
                evidenceScope=["Playwright runners", "dashboard browser setup", "repo-local e2e caches", "authority stop lines"],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="maintenance-readiness-report-v1",
                label="Maintenance readiness report",
                endpoint="GET /supervisor/maintenance-readiness-report",
                status="active",
                summary="Aggregates safe maintenance tracks for docs, verification, reports, and blocked authority posture.",
                evidenceScope=["maintenance tracks", "safe next actions", "authority stop lines"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="maintenance-action-plan-report-v1",
                label="Maintenance action plan report",
                endpoint="GET /supervisor/maintenance-action-plan-report",
                status="active",
                summary="Consolidates the next safe maintenance actions, verification chain, evidence links, and authority stop lines into one operator plan.",
                evidenceScope=["maintenance action steps", "verification chain", "dashboard anchors", "authority stop lines"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),

            SupervisorReportCatalogEntryView(
                reportId="runner-assignment-status-report-v1",
                label="Runner assignment status",
                endpoint="GET /supervisor/runner-assignment-status-report",
                status="active",
                summary="Shows read-only local Codex workspace assignments, stale ownership, degraded state-root evidence, and next safe actions.",
                evidenceScope=["Codex workspace manifests", "safe backlog candidates", "state-root safety", "read-only next actions"],
                relatedDocs=["docs/workflows/workspace-coordination-report.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="safe-development-backlog-report-v1",
                label="Safe development backlog report",
                endpoint="GET /supervisor/safe-development-backlog",
                status="active",
                summary="Prioritizes larger safe work slices while execution-authority stories remain blocked.",
                evidenceScope=["safe backlog items", "recommended PR slice size", "blocked authority boundaries"],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="development-runway-report-v1",
                label="Development runway report",
                endpoint="GET /supervisor/development-runway-report",
                status="active",
                summary="Groups safe backlog, maintenance action, verification, and authority blocker evidence into larger PR-sized development slices.",
                evidenceScope=["larger PR slice planning", "safe backlog items", "verification chain", "authority stop lines"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="runtime-evidence-review-report-v1",
                label="Runtime evidence review report",
                endpoint="GET /supervisor/runtime-evidence-review-report",
                status="active",
                summary="Indexes work-item runtime evidence exports, review priority, evidence counts, related reports, and read-only review actions.",
                evidenceScope=["work-item review queue", "runtime evidence counts", "review priority", "authority stop lines"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="managed-recipe-policy-report-v1",
                label="Managed recipe policy report",
                endpoint="GET /supervisor/managed-recipe-policy-report",
                status="active",
                summary="Catalogs supervisor-managed recipe gates, allowed paths, commands, checkpoints, and blocked remote automation posture.",
                evidenceScope=["managed recipes", "policy gates", "allowed paths", "remote automation stop lines"],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="github-workflow-policy-report-v1",
                label="GitHub workflow policy report",
                endpoint="GET /supervisor/github-workflow-policy-report",
                status="active",
                summary="Documents Git/GCM, Codex GitHub connector, optional gh auth, and plaintext-token stop lines for remote delivery workflows.",
                evidenceScope=["Git credential posture", "Codex connector workflow", "GitHub CLI optionality", "remote delivery checks"],
                relatedDocs=[
                    "docs/github-connector-workflow.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="git-hygiene-report-v1",
                label="Git hygiene report",
                endpoint="GET /supervisor/git-hygiene-report",
                status="active",
                summary="Shows read-only repository, worktree, branch, PR, and CI hygiene signals before delivery automation is approved.",
                evidenceScope=["local Git status", "branch and upstream status", "worktree inventory", "PR/CI query posture"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="codex-readiness-report-v1",
                label="Codex readiness report",
                endpoint="GET /supervisor/codex-readiness-report",
                status="active",
                summary="Shows no-launch Codex CLI discovery, auth-check posture, worker-launch stop lines, and source-mutation boundaries.",
                evidenceScope=["PATH discovery", "auth check posture", "worker launch boundary", "source mutation boundary"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="codex-implementation-approval-report-v1",
                label="Codex implementation approval report",
                endpoint="GET /supervisor/codex-implementation-approval-report",
                status="active",
                summary="Defines the exact approval packet for a future bounded Codex implementation run without launching Codex.",
                evidenceScope=["approval request", "isolated worktree scope", "path boundaries", "verification and rollback evidence"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="claude-review-readiness-report-v1",
                label="Claude review readiness report",
                endpoint="GET /supervisor/claude-review-readiness-report",
                status="active",
                summary="Shows no-launch Claude CLI discovery, review-only policy, scarcity controls, and stop lines.",
                evidenceScope=["PATH discovery", "review-only posture", "scarce-use policy", "source mutation boundary"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="claude-review-approval-report-v1",
                label="Claude review approval report",
                endpoint="GET /supervisor/claude-review-approval-report",
                status="active",
                summary="Defines the exact approval packet for a future bounded Claude adversarial review without launching Claude.",
                evidenceScope=["review trigger", "context scope", "no-edit boundary", "scarcity controls", "output contract"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="github-delivery-authority-report-v1",
                label="GitHub delivery authority report",
                endpoint="GET /supervisor/github-delivery-authority-report",
                status="active",
                summary="Defines the progressive approval ladder for push, PR, CI, review resolution, merge, and remote cleanup without remote writes.",
                evidenceScope=["push approval", "PR approval", "CI wait approval", "merge approval", "remote cleanup boundary"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="trusted-delivery-eligibility-report-v1",
                label="Trusted delivery eligibility report",
                endpoint="GET /supervisor/trusted-delivery-eligibility-report",
                status="active",
                summary="Evaluates local branch and evidence readiness for future trusted push, PR, merge, and cleanup without remote mutation.",
                evidenceScope=["current branch", "working tree", "commits ahead", "missing delivery evidence", "hard stops"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="local-cleanup-readiness-report-v1",
                label="Local cleanup readiness report",
                endpoint="GET /supervisor/local-cleanup-readiness-report",
                status="active",
                summary="Defines evidence and stop lines for future local worktree, branch, and artifact cleanup without deleting anything.",
                evidenceScope=["cleanup policy", "retained evidence", "blocked targets", "worktree and branch removal boundaries"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="remote-cleanup-sync-readiness-report-v1",
                label="Remote cleanup and sync readiness report",
                endpoint="GET /supervisor/remote-cleanup-sync-readiness-report",
                status="active",
                summary="Defines readiness for future remote branch cleanup and GitHub issue/story sync without remote mutation.",
                evidenceScope=["remote branch cleanup", "GitHub issue sync", "story status sync", "remote mutation boundaries"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="trusted-autonomy-readiness-report-v1",
                label="Trusted autonomy readiness report",
                endpoint="GET /supervisor/trusted-autonomy-readiness-report",
                status="active",
                summary="Defines graduation gates for future low-risk autonomy without enabling autonomous execution.",
                evidenceScope=["low-risk eligibility", "graduation gates", "blocked work", "autonomy stop lines"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="epic-6-completion-audit-report-v1",
                label="Epic 6 completion audit",
                endpoint="GET /supervisor/epic-6-completion-audit-report",
                status="active",
                summary="Shows Epic 6 completion evidence, remaining blockers, and the next approval needed before delivery work continues.",
                evidenceScope=["Epic 6 local stack", "delivery packaging plan", "authority gates", "completion blockers"],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="epic-6-mvp-proof-trial-report-v1",
                label="Epic 6 MVP proof trial packet",
                endpoint="GET /supervisor/epic-6-mvp-proof-trial-report",
                status="active",
                summary="Defines the exact read-only approval packet needed before one real BMAD story trial can use bounded Codex, Claude, delivery, and cleanup lanes.",
                evidenceScope=["selected story", "approval packets", "blocked operations", "stop conditions", "next safe actions"],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="delivery-readiness-policy-report-v1",
                label="Delivery readiness policy report",
                endpoint="GET /supervisor/delivery-readiness-policy-report",
                status="active",
                summary="Documents PR, CI, merge, and waiver evidence required before recipe review approval without performing remote delivery.",
                evidenceScope=["delivery readiness statuses", "operator waiver rules", "record-only dashboard checkpoint", "remote automation stop lines"],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
            ),
            SupervisorReportCatalogEntryView(
                reportId="disabled-provider-proofs",
                label="Disabled provider proofs",
                endpoint="GET /supervisor/disabled-provider-proofs",
                status="active",
                summary="Shows no-call proof fixtures for disabled OpenAI-compatible local providers.",
                evidenceScope=["provider endpoint policy", "redaction checks", "timeout and retention policy"],
                relatedDocs=["docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="queue-lease-execution-attempt-boundary-v1",
                label="Execution state boundary",
                endpoint="GET /supervisor/execution-state-boundary",
                status="active",
                summary="Separates queue leases from execution attempt authority and future process lifecycle attachments.",
                evidenceScope=["queue lease roles", "attempt roles", "forbidden lease fields"],
                relatedDocs=["docs/architecture/kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md"],
            ),
            SupervisorReportCatalogEntryView(
                reportId="supervisor-worker-threat-boundary-v1",
                label="Worker threat boundary",
                endpoint="GET /supervisor/threat-boundary",
                status="active",
                summary="Reports prompt, command, provider, network, credential, and artifact safety boundaries.",
                evidenceScope=["redaction boundary", "command policy", "provider and credential policy"],
                relatedDocs=["docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md"],
            ),
        ]

        return SupervisorReportCatalogView(
            catalogId="supervisor-report-catalog-v1",
            generatedAt=datetime.now(timezone.utc),
            summary="Read-only catalog of supervisor reports used to review execution readiness, documentation authority, verification, and safety boundaries.",
            reports=reports,
            stopLines=[
                "Catalog entries are references, not approvals.",
                "Reading reports does not enable provider calls or process launch.",
                "Execution-authority stories remain blocked until explicit operator approval names authority and scope.",
            ],
            nextSafeActions=[
                "Use the catalog before reviewing work that touches execution authority, verification, or report surfaces.",
                "Keep report endpoints, dashboard panels, and runtime evidence export references aligned.",
                "Add new read-only reports to this catalog before relying on them in operator workflows.",
            ],
        )

    def get_maintenance_action_plan_report(self) -> MaintenanceActionPlanReportView:
        maintenance = self.get_maintenance_readiness_report()
        backlog = self.get_safe_development_backlog_report()
        verification = self.get_verification_readiness_report()
        catalog = self.get_supervisor_report_catalog()

        verification_chain = [command.command for command in verification.requiredCommands]
        ready_backlog_items = [item for item in backlog.items if item.status == "ready"]
        blocked_backlog_items = [item for item in backlog.items if "blocked" in item.status]
        active_report_count = sum(1 for report in catalog.reports if report.status == "active")

        steps = [
            MaintenanceActionPlanStepView(
                stepId="select-large-safe-slice",
                label="Select a larger safe slice",
                priority="P0",
                status="ready",
                summary="Use safe backlog and maintenance readiness evidence to select one coherent API, dashboard, docs, tests, and drift-check slice.",
                evidence=[
                    f"{len(ready_backlog_items)} ready safe backlog items are available.",
                    "Safe backlog guidance prefers larger coherent slices over many small PRs.",
                    "Maintenance readiness tracks documentation, verification, report alignment, and blocked authority posture.",
                ],
                verificationCommands=["pnpm run check:safe-backlog", "pnpm run check:maintenance-readiness"],
                relatedReports=[
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/maintenance-readiness-report",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#safe-development-backlog", "/controls#maintenance-readiness-report"],
                nextAction="Start with one ready safe backlog item and include all related contracts, service, dashboard, docs, tests, and drift checks in one PR.",
            ),
            MaintenanceActionPlanStepView(
                stepId="verify-evidence-surfaces",
                label="Verify evidence surfaces",
                priority="P0",
                status="ready",
                summary="Keep supervisor reports, runtime evidence exports, and dashboard anchors aligned before relying on a surface for operator review.",
                evidence=[
                    f"{active_report_count} active supervisor reports are cataloged.",
                    "Runtime evidence exports include related supervisor reports and git-backed evidence.",
                    "Controls page report anchors provide stable navigation for review.",
                ],
                verificationCommands=["pnpm run check:reports", "pnpm run check:runtime-export", "pnpm run test:e2e:dashboard:controls"],
                relatedReports=[
                    "GET /supervisor/report-catalog",
                    "GET /work-items/{id}/runtime-evidence-export",
                    "GET /supervisor/verification-readiness-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#supervisor-report-catalog", "/controls#verification-readiness-report"],
                nextAction="When an evidence surface changes, update report catalog entries, runtime export references, dashboard links, and browser assertions together.",
            ),
            MaintenanceActionPlanStepView(
                stepId="run-verification-chain",
                label="Run verification chain",
                priority="P1",
                status="ready",
                summary="Use focused checks first, then the full local verification command before delivery.",
                evidence=[
                    f"{len(verification.requiredCommands)} required verification commands are listed.",
                    "Verification readiness report includes command-specific requiredFor and evidence guidance.",
                    "Full verification remains local and does not approve provider calls or process launch.",
                ],
                verificationCommands=["pnpm run check:verification-readiness", "pnpm run check"],
                relatedReports=[
                    "GET /supervisor/verification-readiness-report",
                    "GET /supervisor/dashboard-e2e-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#verification-readiness-report", "/controls#dashboard-e2e-report"],
                nextAction="Run focused checks matching the changed surfaces, then `pnpm run check` before commit.",
            ),
            MaintenanceActionPlanStepView(
                stepId="preserve-authority-stop-lines",
                label="Preserve authority stop lines",
                priority="P0",
                status="blocked_pending_explicit_approval",
                summary="Keep unapproved provider execution, process launch, premium execution, commands, network, source mutation, and credential access outside maintenance work.",
                evidence=[
                    f"{len(blocked_backlog_items)} safe backlog items remain blocked pending explicit approval.",
                    "Ollama Story 4.4 is approved only for VM-to-host endpoint http://192.168.1.128:11434/v1/chat/completions and model qwen3:14b.",
                    "Ollama Stories 4.1-4.3 remain the required gate, redaction, retention, timeout, and no-call preparation evidence.",
                    "Subscription-agent Story 5.5 remains blocked.",
                ],
                verificationCommands=["pnpm run check:docs", "pnpm run check:execution-boundary", "pnpm run check:process-lifecycle"],
                relatedReports=[
                    "GET /supervisor/documentation-authority-report",
                    "GET /supervisor/execution-readiness-report",
                    "GET /supervisor/maintenance-readiness-report",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#documentation-authority-report",
                    "/controls#execution-readiness-report",
                    "/controls#maintenance-readiness-report",
                ],
                nextAction="Do not move blocked authority stories into implementation from generic continuation or maintenance language.",
            ),
        ]

        return MaintenanceActionPlanReportView(
            reportId="maintenance-action-plan-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary="Read-only operator plan for choosing, verifying, and delivering larger safe maintenance slices while authority work remains blocked.",
            steps=steps,
            verificationChain=verification_chain,
            stopLines=[
                "Maintenance action plans are not execution-authority approvals.",
                "Do not launch subscription-agent processes from this plan.",
                "Do not call local or remote model/provider endpoints from this plan.",
                "Do not enable premium execution, arbitrary worker commands, source mutation, network access, or credential access from this plan.",
            ],
            nextSafeActions=[
                "Use this report to choose the next larger coherent safe slice.",
                "Keep report catalog, runtime export, dashboard anchors, story evidence, and drift checks aligned.",
                "Record completed work as one PR when the related surfaces form one reviewable unit.",
            ],
        )

    def get_development_runway_report(self) -> DevelopmentRunwayReportView:
        backlog = self.get_safe_development_backlog_report()
        action_plan = self.get_maintenance_action_plan_report()
        authority_matrix = self.get_authority_readiness_matrix_report()
        verification = self.get_verification_readiness_report()

        verification_chain = [command.command for command in verification.requiredCommands]
        ready_items = [item for item in backlog.items if item.status == "ready"]
        blocked_families = [family.familyId for family in authority_matrix.families if "blocked" in family.status]
        ready_backlog_item_ids = {item.itemId for item in backlog.items if item.status == "ready"}
        action_step_ids = {step.stepId for step in action_plan.steps}
        verification_command_ids = {command.commandId for command in verification.requiredCommands + verification.optionalCommands}
        report_catalog_shortcut_lane = self._safe_backlog_next_lane(
            lane_slug="report-catalog-shortcut-refresh",
            lane_title="Report catalog shortcut refresh",
            scope=[
                "operator shortcuts from safe backlog items to existing supervisor reports",
                "dashboard report-link coverage for generated worker lanes",
                "report catalog references that avoid execution-authority expansion",
                "browser assertions for read-only report navigation",
            ],
            verification_commands=[
                "pnpm run check:reports",
                "pnpm run check:safe-backlog",
                "pnpm run test:dashboard-e2e-runner",
                "pnpm run check:static",
            ],
        )
        dispatcher_continuity_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-continuity-snapshot-refresh",
            lane_title="Dispatcher continuity snapshot refresh",
            scope=[
                "safe backlog next-lane queue snapshots",
                "runner assignment status report continuity links",
                "operator-visible dispatcher dry-run evidence",
                "static drift checks for generated lane starvation prevention",
            ],
            verification_commands=[
                "pnpm run check:safe-backlog",
                "pnpm run check:runner-assignment-status",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        assignment_queue_proof_lane = self._safe_backlog_next_lane(
            lane_slug="assignment-report-queue-proof-refresh",
            lane_title="Assignment report queue proof refresh",
            scope=[
                "runner assignment continuity snapshot drift coverage",
                "safe backlog queue proof links",
                "dashboard dispatcher dry-run evidence",
                "workspace dispatcher starvation prevention checks",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        dispatcher_queue_fixture_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-queue-state-fixtures-refresh",
            lane_title="Dispatcher queue state fixtures refresh",
            scope=[
                "runner assignment queue proof fixture expansion",
                "dispatcher candidate ordering for generated lane workers",
                "dashboard queue proof assertions for every candidate state",
                "workspace dispatcher starvation prevention checks",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        dispatcher_queue_handoff_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-queue-handoff-badges-refresh",
            lane_title="Dispatcher queue handoff badges refresh",
            scope=[
                "dispatch handoff queue state count badges",
                "runner assignment continuity count alignment",
                "workspace dispatcher evidence tests for generated lane workers",
                "dashboard assertions for selected queue state summaries",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        dispatcher_queue_handoff_status_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-queue-handoff-status-refresh",
            lane_title="Dispatcher queue handoff status refresh",
            scope=[
                "dispatch handoff status and empty-count visibility",
                "runner assignment continuity status alignment",
                "workspace dispatcher evidence tests for missing count packets",
                "dashboard assertions for handoff count empty states",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        slices = [
            DevelopmentRunwaySliceView(
                sliceId="report-evidence-navigation-slice",
                label="Report and evidence navigation slice",
                status="ready",
                recommendedPrScope="Bundle contracts, supervisor report construction, dashboard panel or shortcut updates, browser assertions, story evidence, and drift checks in one PR.",
                summary="Use this slice for dispatcher continuity and report navigation work that improves read-only lane visibility without expanding execution authority.",
                includedBacklogItems=["dispatcher-queue-handoff-status-refresh"],
                includedActionSteps=["select-large-safe-slice", "verify-evidence-surfaces"],
                requiredVerification=[
                    "pnpm run check:reports",
                    "pnpm run check:runtime-export",
                    "pnpm run check:safe-backlog",
                    "pnpm run test:e2e:dashboard:controls",
                ],
                relatedReports=[
                    "GET /supervisor/report-catalog",
                    "GET /work-items/{id}/runtime-evidence-export",
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/maintenance-action-plan-report",
                ],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                dashboardAnchors=[
                    "/controls#development-runway-report",
                    "/controls#supervisor-report-catalog",
                    "/controls#safe-development-backlog",
                    "/controls#maintenance-action-plan-report",
                ],
                readinessChecks=[
                    DevelopmentRunwayReadinessCheckView(
                        checkId="ready-backlog-item",
                        label="Ready backlog item",
                        status="ready" if "dispatcher-queue-handoff-status-refresh" in ready_backlog_item_ids else "missing",
                        summary="Confirms the dispatcher queue handoff status item is the next safe backlog item for read-only lane visibility work.",
                        evidence=["dispatcher-queue-handoff-status-refresh"],
                        requiredCommandIds=["check-safe-backlog"],
                        relatedReports=["GET /supervisor/safe-development-backlog"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#safe-development-backlog"],
                        nextAction="Keep the dispatcher queue handoff status item ready before changing lane visibility or queue snapshot surfaces.",
                    ),
                    DevelopmentRunwayReadinessCheckView(
                        checkId="action-plan-coverage",
                        label="Maintenance action coverage",
                        status="ready"
                        if {"select-large-safe-slice", "verify-evidence-surfaces"}.issubset(action_step_ids)
                        else "missing",
                        summary="Confirms maintenance action steps cover slice selection and evidence-surface verification.",
                        evidence=["select-large-safe-slice", "verify-evidence-surfaces"],
                        requiredCommandIds=["check-maintenance-action-plan"],
                        relatedReports=["GET /supervisor/maintenance-action-plan-report"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#maintenance-action-plan-report"],
                        nextAction="Keep maintenance action plan steps aligned with report/evidence navigation work.",
                    ),
                    DevelopmentRunwayReadinessCheckView(
                        checkId="focused-verification",
                        label="Focused verification available",
                        status="ready" if {"check-reports", "check-runtime-export", "check-safe-backlog"}.issubset(verification_command_ids) else "missing",
                        summary="Confirms focused report, runtime export, and safe backlog verification commands exist.",
                        evidence=["check-reports", "check-runtime-export", "check-safe-backlog"],
                        requiredCommandIds=["check-reports", "check-runtime-export", "check-safe-backlog"],
                        relatedReports=["GET /supervisor/verification-readiness-report"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#verification-readiness-report"],
                        nextAction="Run focused checks before the full local gate when this slice changes.",
                    ),
                ],
                blockedBy=[],
                nextLane=dispatcher_queue_handoff_status_lane,
                nextAction="Select this slice for dispatcher queue handoff status work, and keep every touched report registered in the catalog and runtime export references.",
            ),
            DevelopmentRunwaySliceView(
                sliceId="verification-runbook-hardening-slice",
                label="Verification and runbook hardening slice",
                status="closed",
                recommendedPrScope="Bundle package script changes, verification readiness entries, runbook text, focused tests, dashboard assertions, and static drift checks in one PR.",
                summary="Use this slice when verification commands, setup guidance, or fresh-VM/handoff instructions change.",
                includedBacklogItems=["github-delivery-hygiene"],
                includedActionSteps=["run-verification-chain", "verify-evidence-surfaces"],
                requiredVerification=[
                    "pnpm run check:verification-readiness",
                    "pnpm run check:runbooks",
                    "pnpm run check:github-workflow-policy",
                    "pnpm run check:delivery-readiness",
                    "pnpm run check:e2e-report",
                    "pnpm run check",
                ],
                relatedReports=[
                    "GET /supervisor/verification-readiness-report",
                    "GET /supervisor/dashboard-e2e-report",
                    "GET /supervisor/github-workflow-policy-report",
                    "GET /supervisor/delivery-readiness-policy-report",
                ],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                dashboardAnchors=[
                    "/controls#verification-readiness-report",
                    "/controls#dashboard-e2e-report",
                    "/controls#github-workflow-policy-report",
                    "/controls#delivery-readiness-policy-report",
                ],
                readinessChecks=[
                    DevelopmentRunwayReadinessCheckView(
                        checkId="ready-backlog-items",
                        label="Completed backlog item",
                        status="closed",
                        summary="Confirms the GitHub delivery hygiene backlog item is completed evidence and not the next dispatchable lane.",
                        evidence=["github-delivery-hygiene"],
                        requiredCommandIds=["check-safe-backlog", "check-development-runway"],
                        relatedReports=["GET /supervisor/safe-development-backlog", "GET /supervisor/development-runway-report"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#safe-development-backlog", "/controls#development-runway-report"],
                        nextAction="Use the completed GitHub delivery hygiene item as evidence only; do not requeue it.",
                    ),
                    DevelopmentRunwayReadinessCheckView(
                        checkId="handoff-checkpoint-coverage",
                        label="Handoff checkpoint coverage",
                        status="ready" if verification.handoffCheckpoints else "missing",
                        summary="Confirms verification readiness includes runbook-backed handoff checkpoints.",
                        evidence=[checkpoint.checkpointId for checkpoint in verification.handoffCheckpoints],
                        requiredCommandIds=["check-verification-readiness", "check-runbooks"],
                        relatedReports=["GET /supervisor/verification-readiness-report"],
                        relatedDocs=[
                            "docs/workflows/implementation-evidence-boundary.md",
                            "docs/workflows/current-session-runbook.md",
                        ],
                        dashboardAnchors=["/controls#verification-readiness-report"],
                        nextAction="Keep handoff checkpoints aligned with runbooks whenever verification guidance changes.",
                    ),
                    DevelopmentRunwayReadinessCheckView(
                        checkId="full-gate-available",
                        label="Full gate available",
                        status="ready" if "full-check" in verification_command_ids else "missing",
                        summary="Confirms the full local gate remains available for final verification.",
                        evidence=["full-check"],
                        requiredCommandIds=["full-check"],
                        relatedReports=["GET /supervisor/verification-readiness-report"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#verification-readiness-report"],
                        nextAction="Run the full local gate before committing verification/runbook work.",
                    ),
                ],
                blockedBy=[],
                nextLane=None,
                nextAction="Use this completed slice as evidence when future delivery or runbook guidance changes.",
            ),
            DevelopmentRunwaySliceView(
                sliceId="authority-blocker-maintenance-slice",
                label="Authority blocker maintenance slice",
                status="blocked_pending_explicit_authority_approval",
                recommendedPrScope="Only documentation, blocked-story indexing, approval-checkpoint evidence, and read-only dashboard/report updates may be batched here until explicit authority approval exists.",
                summary="Use this slice to keep blocked authority state current without moving Ollama, subscription launch, premium, command, source, network, credential, or remote automation work into implementation.",
                includedBacklogItems=["authority-blocked-implementation"],
                includedActionSteps=["preserve-authority-stop-lines"],
                requiredVerification=[
                    "pnpm run check:docs",
                    "pnpm run check:documentation-authority",
                    "pnpm run check:authority-readiness",
                    "pnpm run check:execution-boundary",
                    "pnpm run check:process-lifecycle",
                ],
                relatedReports=[
                    "GET /supervisor/documentation-authority-report",
                    "GET /supervisor/authority-readiness-matrix-report",
                    "GET /supervisor/execution-readiness-report",
                    "GET /supervisor/maintenance-readiness-report",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#documentation-authority-report",
                    "/controls#authority-readiness-matrix-report",
                    "/controls#execution-readiness-report",
                    "/controls#maintenance-readiness-report",
                ],
                readinessChecks=[
                    DevelopmentRunwayReadinessCheckView(
                        checkId="authority-families-blocked",
                        label="Authority families blocked",
                        status="blocked",
                        summary="Confirms execution-authority families still require explicit approval before implementation.",
                        evidence=blocked_families,
                        requiredCommandIds=["check-authority-readiness"],
                        relatedReports=["GET /supervisor/authority-readiness-matrix-report"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#authority-readiness-matrix-report"],
                        nextAction="Keep this slice read-only until explicit operator approval names the authority family and scope.",
                    ),
                    DevelopmentRunwayReadinessCheckView(
                        checkId="approval-checkpoint-indexed",
                        label="Approval checkpoint indexed",
                        status="ready",
                        summary="Confirms blocked authority work is governed by documentation authority and approval checkpoint evidence.",
                        evidence=["docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md"],
                        requiredCommandIds=["check-docs", "check-documentation-authority"],
                        relatedReports=["GET /supervisor/documentation-authority-report"],
                        relatedDocs=[
                            "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                            "docs/workflows/implementation-evidence-boundary.md",
                        ],
                        dashboardAnchors=["/controls#documentation-authority-report"],
                        nextAction="Update approval checkpoint evidence only as read-only governance maintenance.",
                    ),
                    DevelopmentRunwayReadinessCheckView(
                        checkId="boundary-checks-required",
                        label="Boundary checks required",
                        status="blocked",
                        summary="Confirms execution boundary checks remain required before any authority work can move.",
                        evidence=["check-execution-boundary", "check-process-lifecycle"],
                        requiredCommandIds=["check-execution-boundary", "check-process-lifecycle"],
                        relatedReports=["GET /supervisor/execution-readiness-report", "GET /supervisor/maintenance-readiness-report"],
                        relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                        dashboardAnchors=["/controls#execution-readiness-report", "/controls#maintenance-readiness-report"],
                        nextAction="Do not treat green boundary checks as approval to implement blocked authority stories.",
                    ),
                ],
                blockedBy=blocked_families,
                nextAction="Keep this slice limited to read-only authority evidence until explicit operator approval names the authority family and scope.",
            ),
        ]

        return DevelopmentRunwayReportView(
            reportId="development-runway-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only development runway for selecting larger coherent PR slices from current safe backlog, "
                "maintenance action plan, verification readiness, and authority blocker evidence."
            ),
            planningRule="Prefer one coherent PR per related API, dashboard, docs, tests, drift-check, and runbook slice; avoid standalone micro-PRs for isolated report or doc tweaks.",
            minimumPrScope="A normal PR should include at least two aligned surfaces, such as service plus dashboard, or verification plus runbooks, unless the change is an urgent narrow fix.",
            batchingPolicy=[
                "Default to larger reviewable PRs that close a complete safe slice across contracts, supervisor service, dashboard, tests, drift checks, and docs.",
                "Do not open separate PRs for isolated report text, story-index, dashboard assertion, or drift-check updates when they support the same operator-facing slice.",
                "Use a narrow PR only for urgent breakage, security fixes, or isolated failures that cannot wait for the surrounding slice.",
                "Keep authority-blocked work out of batching decisions; larger PRs do not expand execution authority.",
            ],
            prBatchingChecklist=[
                "One clear slice label and story evidence file are present.",
                "Changed API contracts, supervisor schemas, service construction, dashboard rendering, tests, and drift checks are updated together when applicable.",
                "Focused verification for each touched surface is listed before the full local gate.",
                "PR body names the safe slice, verification evidence, and authority stop lines.",
            ],
            slices=slices,
            verificationChain=verification_chain,
            stopLines=[
                "Development runway slices are not execution-authority approvals.",
                "Do not use a larger PR slice to hide provider calls, process launch, premium execution, arbitrary worker commands, source mutation, network access, credential access, or remote automation.",
                "Blocked authority stories remain blocked until explicit operator approval names authority and scope.",
            ],
            nextSafeActions=[
                f"Select one of {len(ready_items)} ready safe backlog items and batch all related surfaces into one PR.",
                "Use the report-evidence navigation slice for read-only evidence improvements.",
                "Use the verification-runbook hardening slice for command, check, and setup guidance changes.",
                "Keep authority-blocker maintenance read-only until explicit approval exists.",
                "Batch future safe work into larger PRs when the changes share one reviewable operator outcome.",
            ],
        )

    def get_maintenance_readiness_report(self) -> MaintenanceReadinessReportView:
        documentation = self.get_documentation_authority_report()
        verification = self.get_verification_readiness_report()
        catalog = self.get_supervisor_report_catalog()

        missing_docs = sum(1 for document in [*documentation.indexes, documentation.approvalCheckpoint] if document.status != "present")
        active_reports = sum(1 for report in catalog.reports if report.status == "active")

        tracks = [
            MaintenanceReadinessTrackView(
                trackId="documentation-hygiene",
                label="Documentation hygiene",
                status="ready",
                summary="Documentation indexes, approval checkpoints, and blocked authority story references are the first maintenance lane.",
                evidence=[
                    f"{len(documentation.indexes)} documentation indexes tracked.",
                    f"{len(documentation.blockedStories)} blocked authority stories represented.",
                    f"{missing_docs} required authority documents missing.",
                ],
                relatedReports=["GET /supervisor/documentation-authority-report"],
                relatedDocs=[
                    "docs/architecture/index.md",
                    "docs/workflows/product-requirements-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#documentation-authority-report"],
                nextAction="Run `pnpm run check:docs` after every architecture, PRD, story, or approval-checkpoint change.",
            ),
            MaintenanceReadinessTrackView(
                trackId="verification-hygiene",
                label="Verification hygiene",
                status="ready",
                summary="Focused and full verification commands are available for safe delivery without granting execution authority.",
                evidence=[
                    f"{len(verification.requiredCommands)} required commands listed.",
                    f"{len(verification.optionalCommands)} optional commands listed.",
                    "Focused controls and detail e2e runners are available for report and runtime export changes.",
                ],
                relatedReports=["GET /supervisor/verification-readiness-report", "GET /supervisor/dashboard-e2e-report"],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#verification-readiness-report", "/controls#dashboard-e2e-report"],
                nextAction="Run focused checks for changed areas, then `pnpm run check` before merge.",
            ),
            MaintenanceReadinessTrackView(
                trackId="report-surface-alignment",
                label="Report surface alignment",
                status="ready",
                summary="Read-only report endpoints, dashboard panels, and runtime evidence references should stay aligned as surfaces grow.",
                evidence=[
                    f"{active_reports} active supervisor reports indexed.",
                    "Runtime evidence exports reference the report catalog and safety reports.",
                    "Controls page fetches the report catalog, dashboard e2e report, managed recipe policy report, and other read-only reports.",
                ],
                relatedReports=["GET /supervisor/report-catalog", "GET /supervisor/dashboard-e2e-report", "GET /supervisor/managed-recipe-policy-report"],
                relatedDocs=["docs/workflows/implementation-evidence-boundary.md", "docs/workflows/implementation-evidence-boundary.md"],
                dashboardAnchors=["/controls#supervisor-report-catalog", "/controls#dashboard-e2e-report", "/controls#managed-recipe-policy-report"],
                nextAction="Add new read-only reports to the catalog, controls page, tests, and runtime export references together.",
            ),
            MaintenanceReadinessTrackView(
                trackId="authority-blocker-watch",
                label="Authority blocker watch",
                status="blocked_pending_explicit_approval",
                summary="Only the approved Ollama host endpoint/model may cross the provider boundary; all other provider calls and subscription-agent launch stay blocked.",
                evidence=[
                    "Ollama Story 4.4 is approved only for VM-to-host endpoint http://192.168.1.128:11434/v1/chat/completions and model qwen3:14b.",
                    "Raw Ollama prompts, completions, reasoning fields, and provider payloads must not be retained.",
                    "Subscription-agent launch Story 5.5 remains blocked.",
                    "Generic continuation language is not execution-authority approval.",
                ],
                relatedReports=[
                    "GET /supervisor/documentation-authority-report",
                    "GET /supervisor/execution-readiness-report",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=["/controls#documentation-authority-report", "/controls#execution-readiness-report"],
                nextAction="Wait for explicit operator approval naming authority and scope before moving blocked stories into implementation.",
            ),
        ]

        return MaintenanceReadinessReportView(
            reportId="maintenance-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary="Read-only maintenance map for safe repo hygiene while execution-authority stories remain blocked.",
            tracks=tracks,
            stopLines=[
                "Maintenance work must not approve local provider/model calls.",
                "Maintenance work must not approve subscription-agent process launch.",
                "Maintenance work must not approve premium execution.",
                "Maintenance work must not grant worker commands, source mutation, network access, or credential access.",
            ],
            nextSafeActions=[
                "Batch maintenance changes into coherent PRs covering API, dashboard, docs, and tests when surfaces are related.",
                "Keep documentation, verification, report catalog, and runtime export references synchronized.",
                "Prefer read-only evidence improvements until explicit execution-authority approval is recorded.",
            ],
        )

    def get_safe_development_backlog_report(self) -> SafeDevelopmentBacklogReportView:
        maintenance = self.get_maintenance_readiness_report()
        verification = self.get_verification_readiness_report()
        catalog = self.get_supervisor_report_catalog()

        blocked_maintenance_tracks = [track.trackId for track in maintenance.tracks if "blocked" in track.status]
        required_verification = [command.command for command in verification.requiredCommands]
        report_count = len(catalog.reports)
        verification_surface_lane = self._safe_backlog_next_lane(
            lane_slug="verification-surface-hardening",
            lane_title="Verification surface hardening",
            scope=[
                "verification readiness report entries and package scripts",
                "runbook and handoff verification guidance",
                "focused dashboard and static drift checks",
                "supervisor integration tests for verification surfaces",
            ],
            verification_commands=[
                "pnpm run check:verification-readiness",
                "pnpm run check:runbooks",
                "pnpm run check:e2e-report",
                "uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py",
                "pnpm run check:static",
            ],
        )
        github_delivery_lane = self._safe_backlog_next_lane(
            lane_slug="github-delivery-hygiene",
            lane_title="GitHub delivery hygiene",
            scope=[
                "GitHub workflow policy report guidance",
                "delivery readiness policy report guidance",
                "workspace finish, merge, and cleanup runbooks",
                "static drift checks for GitHub delivery safety",
            ],
            verification_commands=[
                "pnpm run check:github-workflow-policy",
                "pnpm run check:delivery-readiness",
                "uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py",
                "pnpm run check:static",
            ],
        )
        read_only_evidence_lane = self._safe_backlog_next_lane(
            lane_slug="read-only-evidence-polish",
            lane_title="Read-only evidence polish",
            scope=[
                "runtime evidence export review shortcuts",
                "controls and work-item detail evidence links",
                "read-only supervisor report references",
                "dashboard and static drift checks",
            ],
            verification_commands=[
                "pnpm run check:runtime-export",
                "pnpm run check:runtime-review",
                "pnpm run check:reports",
                "uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py",
                "pnpm run check:static",
            ],
        )
        lane_handoff_evidence_lane = self._safe_backlog_next_lane(
            lane_slug="lane-handoff-evidence-refresh",
            lane_title="Lane handoff evidence refresh",
            scope=[
                "workspace handoff evidence shown to future lane runners",
                "current-session runbook and verification handoff text",
                "supervisor report references for safe continuation decisions",
                "focused checks that prove handoff work remains read-only until claimed",
            ],
            verification_commands=[
                "pnpm run check:verification-readiness",
                "pnpm run check:runbooks",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        report_catalog_shortcut_lane = self._safe_backlog_next_lane(
            lane_slug="report-catalog-shortcut-refresh",
            lane_title="Report catalog shortcut refresh",
            scope=[
                "operator shortcuts from safe backlog items to existing supervisor reports",
                "dashboard report-link coverage for generated worker lanes",
                "report catalog references that avoid execution-authority expansion",
                "browser assertions for read-only report navigation",
            ],
            verification_commands=[
                "pnpm run check:reports",
                "pnpm run check:safe-backlog",
                "pnpm run test:dashboard-e2e-runner",
                "pnpm run check:static",
            ],
        )
        dispatcher_continuity_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-continuity-snapshot-refresh",
            lane_title="Dispatcher continuity snapshot refresh",
            scope=[
                "safe backlog next-lane queue snapshots",
                "runner assignment status report continuity links",
                "operator-visible dispatcher dry-run evidence",
                "static drift checks for generated lane starvation prevention",
            ],
            verification_commands=[
                "pnpm run check:safe-backlog",
                "pnpm run check:runner-assignment-status",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        assignment_queue_proof_lane = self._safe_backlog_next_lane(
            lane_slug="assignment-report-queue-proof-refresh",
            lane_title="Assignment report queue proof refresh",
            scope=[
                "runner assignment continuity snapshot drift coverage",
                "safe backlog queue proof links",
                "dashboard dispatcher dry-run evidence",
                "workspace dispatcher starvation prevention checks",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        dispatcher_queue_fixture_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-queue-state-fixtures-refresh",
            lane_title="Dispatcher queue state fixtures refresh",
            scope=[
                "runner assignment queue proof fixture expansion",
                "dispatcher candidate ordering for generated lane workers",
                "dashboard queue proof assertions for every candidate state",
                "workspace dispatcher starvation prevention checks",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        dispatcher_queue_handoff_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-queue-handoff-badges-refresh",
            lane_title="Dispatcher queue handoff badges refresh",
            scope=[
                "dispatch handoff queue state count badges",
                "runner assignment continuity count alignment",
                "workspace dispatcher evidence tests for generated lane workers",
                "dashboard assertions for selected queue state summaries",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )
        dispatcher_queue_handoff_status_lane = self._safe_backlog_next_lane(
            lane_slug="dispatcher-queue-handoff-status-refresh",
            lane_title="Dispatcher queue handoff status refresh",
            scope=[
                "dispatch handoff status and empty-count visibility",
                "runner assignment continuity status alignment",
                "workspace dispatcher evidence tests for missing count packets",
                "dashboard assertions for handoff count empty states",
            ],
            verification_commands=[
                "pnpm run check:runner-assignment-status",
                "pnpm run check:safe-backlog",
                "pnpm run test:codex-workspace",
                "pnpm run check:static",
            ],
        )

        items = [
            SafeDevelopmentBacklogItemView(
                itemId="safe-backlog-report-alignment",
                label="Report-aligned backlog governance",
                priority="P0",
                status="closed",
                summary="Delivered backlog governance evidence that keeps future work selected from explicit safe backlog items with reports, docs, tests, and stop lines.",
                recommendedSliceSize="complete",
                evidence=[
                    f"{report_count} supervisor reports are indexed for operator review.",
                    "Maintenance readiness recommends coherent PRs across API, dashboard, docs, and tests.",
                    "Architecture reconciliation names maintenance and hygiene as the highest-value next safe work.",
                ],
                relatedReports=[
                    "GET /supervisor/maintenance-readiness-report",
                    "GET /supervisor/report-catalog",
                    "GET /supervisor/verification-readiness-report",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#maintenance-readiness-report",
                    "/controls#supervisor-report-catalog",
                    "/controls#verification-readiness-report",
                ],
                nextAction="Use this completed item as evidence only; do not requeue it as a new lane.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="verification-surface-hardening",
                label="Verification surface hardening",
                priority="P1",
                status="closed",
                summary="Delivered verification readiness surface hardening; keep the completed lane as evidence and create a new lane before future expansion.",
                recommendedSliceSize="complete",
                evidence=[
                    f"{len(required_verification)} required verification commands are surfaced.",
                    "Dashboard e2e, supervisor report catalog, runtime evidence export, safe backlog, managed recipe policy, and delivery readiness policy drift checks now run inside the full local check.",
                    "Focused dashboard e2e runners cover controls, detail, mobile, and managed recipe slices.",
                    "Future PRs should batch related API, dashboard, docs, and tests into larger coherent slices.",
                    "Verification surface hardening is read-only planning guidance, not execution-authority approval.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-47-core-readiness-drift-checks.md",
                    "3-56-verification-execution-plan-groups.md",
                    "3-58-verification-handoff-checkpoints.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/verification-readiness-report",
                    "GET /supervisor/dashboard-e2e-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#verification-readiness-report",
                    "/controls#dashboard-e2e-report",
                    "/controls#supervisor-report-catalog",
                    "/controls#development-runway-report",
                ],
                nextAction="Use this completed verification lane as evidence only; do not requeue codex/verification-surface-hardening as a new lane.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="github-delivery-hygiene",
                label="GitHub delivery hygiene",
                priority="P1",
                status="closed",
                summary="Delivered GitHub delivery hygiene guidance for Git/GCM, Codex connector, optional gh auth, PR sizing, and delivery verification.",
                recommendedSliceSize="complete",
                evidence=[
                    "GitHub workflow policy report documents Git/GCM, Codex connector, optional gh auth, and plaintext-token stop lines.",
                    "Future PRs should be larger coherent slices that bundle related API, dashboard, docs, tests, and drift checks.",
                    "Remote delivery must use Git/GCM or the Codex GitHub connector rather than persistent plaintext gh token storage.",
                ],
                relatedReports=[
                    "GET /supervisor/github-workflow-policy-report",
                    "GET /supervisor/delivery-readiness-policy-report",
                    "GET /supervisor/report-catalog",
                    "GET /supervisor/verification-readiness-report",
                    "GET /supervisor/managed-recipe-policy-report",
                ],
                relatedDocs=[
                    "docs/github-connector-workflow.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#github-workflow-policy-report",
                    "/controls#delivery-readiness-policy-report",
                    "/controls#supervisor-report-catalog",
                    "/controls#verification-readiness-report",
                    "/controls#managed-recipe-policy-report",
                ],
                nextAction="Use this completed GitHub delivery hygiene lane as evidence only; do not requeue codex/github-delivery-hygiene as a new lane.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="read-only-evidence-polish",
                label="Read-only evidence polish",
                priority="P2",
                status="ready",
                summary="Improve operator review shortcuts only when they connect existing evidence without adding execution authority.",
                recommendedSliceSize="medium_to_large",
                evidence=[
                    "Runtime evidence exports reference supervisor reports and git-backed evidence.",
                    "Controls and work-item detail pages already surface read-only evidence panels, supervisor report shortcuts, and runtime export review shortcuts.",
                    "Maintenance tracks point future work toward reports rather than execution enablement.",
                ],
                relatedReports=[
                    "GET /work-items/{id}/runtime-evidence-export",
                    "GET /supervisor/documentation-authority-report",
                    "GET /supervisor/maintenance-readiness-report",
                    "GET /supervisor/managed-recipe-policy-report",
                    "GET /supervisor/delivery-readiness-policy-report",
                ],
                relatedDocs=[
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#supervisor-report-catalog",
                    "/controls#documentation-authority-report",
                    "/controls#maintenance-readiness-report",
                    "/controls#managed-recipe-policy-report",
                    "/controls#delivery-readiness-policy-report",
                ],
                nextLane=read_only_evidence_lane,
                nextAction="Prefer review shortcuts that reduce operator navigation across existing read-only evidence.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="worker-backlog-queue-refresh",
                label="Worker backlog queue refresh",
                priority="P1",
                status="closed",
                summary="Delivered fresh, source-owned safe backlog capacity so end-to-end lane workers can claim generated work without taking over active lanes.",
                recommendedSliceSize="complete",
                evidence=[
                    "Current claim-next evidence can become starved when all ready lanes are active or assigned to other runners.",
                    "New generated worker lanes must remain source-owned, branch-scoped, and claimable through codex-workspace rather than ad hoc chat state.",
                    "The assignment report and safe backlog drift check prove generated work stays dispatchable without touching owned lanes.",
                    "After this completed item closes, claim-next should advance to report-catalog-shortcut-refresh once lane-handoff-evidence-refresh is closed.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/development-runway-report",
                    "GET /supervisor/verification-readiness-report",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#safe-development-backlog",
                    "/controls#runner-assignment-status",
                    "/controls#development-runway-report",
                    "/controls#verification-readiness-report",
                ],
                nextAction="Use this completed queue refresh as evidence only; do not requeue worker-backlog-queue-refresh. Continue with report-catalog-shortcut-refresh after lane-handoff-evidence-refresh is closed.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="lane-handoff-evidence-refresh",
                label="Lane handoff evidence refresh",
                priority="P1",
                status="closed",
                summary="Delivered explicit resume-packet evidence for prepared worktrees so future lane runners can continue safely with fewer ownership ambiguities.",
                recommendedSliceSize="complete",
                evidence=[
                    "The runner assignment status panel now groups owner, branch, worktree state, readiness, next command, and stop lines as a visible resume packet.",
                    "Current-session runbook guidance names the resume-packet evidence required before continuation or takeover decisions.",
                    "This completed lane remains source-owned report, dashboard, docs, and static-check evidence; it is not takeover approval.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-58-verification-handoff-checkpoints.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/verification-readiness-report",
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/report-catalog",
                    "GET /supervisor/safe-development-backlog",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#verification-readiness-report",
                    "/controls#runner-assignment-status",
                    "/controls#supervisor-report-catalog",
                    "/controls#safe-development-backlog",
                ],
                nextAction="Use this completed handoff evidence only; do not requeue lane-handoff-evidence-refresh. Continue with report-catalog-shortcut-refresh for the next generated worker lane.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="report-catalog-shortcut-refresh",
                label="Report catalog shortcut refresh",
                priority="P2",
                status="closed",
                summary="Delivered precise report shortcuts for generated worker lanes so operators can inspect existing read-only evidence quickly.",
                recommendedSliceSize="complete",
                evidence=[
                    "Generated backlog items link to explicit dashboard report anchors rather than falling back to the report catalog.",
                    "Controls-page assertions cover generated worker-lane report links and dashboard anchors.",
                    "This completed shortcut refresh preserves read-only evidence boundaries and avoids provider, worker launch, or credential changes.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/report-catalog",
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/github-workflow-policy-report",
                    "GET /supervisor/delivery-readiness-policy-report",
                    "GET /supervisor/runner-assignment-status-report",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#supervisor-report-catalog",
                    "/controls#safe-development-backlog",
                    "/controls#github-workflow-policy-report",
                    "/controls#delivery-readiness-policy-report",
                    "/controls#runner-assignment-status",
                ],
                nextAction="Use this completed shortcut evidence only; do not requeue report-catalog-shortcut-refresh. Continue with dispatcher-continuity-snapshot-refresh for the next generated worker lane.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="dispatcher-continuity-snapshot-refresh",
                label="Dispatcher continuity snapshot refresh",
                priority="P2",
                status="closed",
                summary="Delivered dispatcher queue snapshots so end-to-end lane runners can continue from source-owned safe work without hidden chat state.",
                recommendedSliceSize="complete",
                evidence=[
                    "Runner assignment status now exposes a dispatcher continuity snapshot with candidate, branch, counts, dry-run command, blockers, and next action.",
                    "Safe backlog and development runway reports advance to the next source-owned queue proof lane.",
                    "This completed lane preserved dispatch dry-run evidence only; it did not launch workers, call providers, or take over owned lanes.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/development-runway-report",
                    "GET /supervisor/report-catalog",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#safe-development-backlog",
                    "/controls#runner-assignment-status",
                    "/controls#development-runway-report",
                    "/controls#supervisor-report-catalog",
                ],
                nextAction="Use this completed dispatcher continuity evidence only; do not requeue dispatcher-continuity-snapshot-refresh. Continue with assignment-report-queue-proof-refresh.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="assignment-report-queue-proof-refresh",
                label="Assignment report queue proof refresh",
                priority="P2",
                status="closed",
                summary="Delivered explicit runner-assignment queue proof so generated lane workers can see why the next dispatch is safe, blocked, or ambiguous.",
                recommendedSliceSize="complete",
                evidence=[
                    "Continuity snapshots now expose queue proof rows backed by dashboard assertions and drift checks rather than chat-only resume state.",
                    "Queue proof work preserved read-only local evidence boundaries and avoided provider, worker launch, or takeover behavior.",
                    "Generated lane starvation prevention now has source-owned tests for assignable, active, ambiguous, blocked, and closed candidates.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/development-runway-report",
                    "GET /supervisor/report-catalog",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#runner-assignment-status",
                    "/controls#safe-development-backlog",
                    "/controls#development-runway-report",
                ],
                nextAction="Use this completed queue proof evidence only; do not requeue assignment-report-queue-proof-refresh. Continue with dispatcher-queue-state-fixtures-refresh.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="dispatcher-queue-state-fixtures-refresh",
                label="Dispatcher queue state fixtures refresh",
                priority="P2",
                status="closed",
                summary="Delivered source-owned dispatcher queue fixtures so generated lane workers keep explicit evidence for assignable, active, blocked, and closed candidates.",
                recommendedSliceSize="complete",
                evidence=[
                    "Dispatch handoff packets now record queue candidate state counts alongside selected lane, owner, branch, blockers, and next command.",
                    "Workspace dispatcher tests assert visible dry-run counts and persisted handoff count evidence without provider calls, worker launches, or lane takeovers.",
                    "Generated lane continuity remains source-owned after assignment-report-queue-proof-refresh closes.",
                ],
                sourceEvidenceLabels=[
                    "3-27-safe-development-backlog-report.md",
                    "3-32-safe-development-backlog-drift-check.md",
                    "3-60-safe-backlog-report-anchors.md",
                ],
                relatedReports=[
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/development-runway-report",
                    "GET /supervisor/report-catalog",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#runner-assignment-status",
                    "/controls#safe-development-backlog",
                    "/controls#development-runway-report",
                ],
                nextAction="Use this completed dispatcher queue fixture evidence only; do not requeue dispatcher-queue-state-fixtures-refresh. Continue with dispatcher-queue-handoff-status-refresh.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="dispatcher-queue-handoff-badges-refresh",
                label="Dispatcher queue handoff badges refresh",
                priority="P2",
                status="closed",
                summary="Delivered compact dispatcher queue state count badges in the runner assignment handoff packet so generated lane workers can scan why a lane was selected.",
                recommendedSliceSize="complete",
                evidence=[
                    "Runner assignment status rows now expose sanitized handoff candidate state counts through the API schema and shared dashboard contract.",
                    "The dashboard resume packet renders compact badges for active, blocked, and closed queue state counts without provider calls, worker launches, or lane takeovers.",
                    "Generated lane continuity remains explicit after dispatcher-queue-state-fixtures-refresh closes.",
                ],
                relatedReports=[
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/development-runway-report",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#runner-assignment-status",
                    "/controls#safe-development-backlog",
                    "/controls#development-runway-report",
                ],
                nextAction="Use this completed dispatcher queue handoff badge evidence only; do not requeue dispatcher-queue-handoff-badges-refresh. Continue with dispatcher-queue-handoff-status-refresh.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="dispatcher-queue-handoff-status-refresh",
                label="Dispatcher queue handoff status refresh",
                priority="P2",
                status="ready",
                summary="Clarify runner assignment handoff status and empty-count states so generated lane workers can tell missing queue evidence from a clean zero-count packet.",
                recommendedSliceSize="medium_to_large",
                evidence=[
                    "Dispatch handoff badges now expose candidate state counts, but missing or empty count packets need clearer status treatment in reports and dashboard copy.",
                    "The next lane must stay read-only/source-owned and avoid provider calls, worker launches, or lane takeovers.",
                    "Generated lane continuity should remain explicit after dispatcher-queue-handoff-badges-refresh closes.",
                ],
                relatedReports=[
                    "GET /supervisor/runner-assignment-status-report",
                    "GET /supervisor/safe-development-backlog",
                    "GET /supervisor/development-runway-report",
                ],
                relatedDocs=[
                    "docs/workflows/end-to-end-lane-runner.md",
                    "docs/workflows/current-session-runbook.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#runner-assignment-status",
                    "/controls#safe-development-backlog",
                    "/controls#development-runway-report",
                ],
                nextLane=dispatcher_queue_handoff_status_lane,
                nextAction="Refresh dispatcher queue handoff status and empty-count evidence while keeping generated-worker evidence read-only and source-owned.",
            ),
            SafeDevelopmentBacklogItemView(
                itemId="authority-blocked-work",
                label="Execution-authority stories",
                priority="blocked",
                status="blocked_pending_explicit_approval",
                summary="Unapproved provider execution and subscription-agent process launch remain outside the safe backlog.",
                recommendedSliceSize="do_not_start",
                evidence=[
                    "Ollama Story 4.4 is approved only for VM-to-host endpoint http://192.168.1.128:11434/v1/chat/completions and model qwen3:14b.",
                    "LM Studio, vLLM, llama.cpp, remote providers, premium execution, commands, source mutation, credentials, and unapproved network access remain blocked.",
                    "Subscription-agent Story 5.5 remains blocked pending explicit process-launch approval.",
                    f"Blocked maintenance tracks: {', '.join(blocked_maintenance_tracks) or 'none'}.",
                ],
                relatedReports=[
                    "GET /supervisor/documentation-authority-report",
                    "GET /supervisor/execution-readiness-report",
                ],
                relatedDocs=[
                    "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                    "docs/workflows/implementation-evidence-boundary.md",
                ],
                dashboardAnchors=[
                    "/controls#documentation-authority-report",
                    "/controls#execution-readiness-report",
                    "/controls#authority-readiness-matrix-report",
                ],
                blockedBy=[
                    "explicit operator approval naming authority and scope",
                    "provider/process PRD approval",
                    "safety gate evidence",
                ],
                nextAction="Do not implement blocked authority stories from generic continuation language.",
            ),
        ]

        return SafeDevelopmentBacklogReportView(
            reportId="safe-development-backlog-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only prioritized backlog for larger safe development slices while provider calls, process launch, "
                "premium execution, worker commands, source mutation, network access, and credential access remain blocked."
            ),
            items=items,
            stopLines=[
                "Safe backlog items are planning and maintenance guidance, not execution-authority approvals.",
                "Do not start Ollama provider execution stories without explicit approval naming authority and scope.",
                "Do not start subscription-agent launch stories without explicit approval naming authority and scope.",
                "Do not add provider/model calls, process launch, premium execution, worker shell commands, source mutation, network access, or credential access.",
            ],
            nextSafeActions=[
                "Choose the next PR from ready safe backlog items and keep it large enough to include API, dashboard, docs, and tests when related.",
                "Keep GitHub delivery hygiene current before relying on remote PR automation, and avoid persistent plaintext token storage.",
                "Use required verification commands and focused e2e runners as acceptance evidence for each slice.",
                "Keep blocked authority work visible but outside implementation until explicit approval arrives.",
            ],
        )

    def _safe_backlog_next_lane(
        self,
        lane_slug: str,
        lane_title: str,
        scope: list[str],
        verification_commands: list[str],
        stop_lines: list[str] | None = None,
    ) -> NextLaneRecommendationView:
        default_stop_lines = [
            "Do not add provider/model calls, process launch, premium execution, worker shell commands, source mutation, network access, or credential access.",
            "Do not treat this lane-start recommendation as merge, cleanup, issue-sync, or execution-authority approval.",
            "Do not start or modify another active lane while using this recommendation.",
        ]
        return NextLaneRecommendationView(
            laneTitle=lane_title,
            laneSlug=lane_slug,
            branchName=f"codex/{lane_slug}",
            startCommand=f'node ./scripts/codex-workspace.mjs start "{lane_slug.replace("-", " ")}"',
            scope=scope,
            verificationCommands=verification_commands,
            stopLines=stop_lines or default_stop_lines,
        )

    def _report_evidence_navigation_next_lane(self) -> NextLaneRecommendationView:
        return self._safe_backlog_next_lane(
            lane_slug="verification-surface-hardening",
            lane_title="Verification surface hardening",
            scope=[
                "verification readiness report entries and package scripts",
                "runbook and handoff verification guidance",
                "focused dashboard and static drift checks",
                "supervisor integration tests for verification surfaces",
            ],
            verification_commands=[
                "pnpm run check:verification-readiness",
                "pnpm run check:runbooks",
                "pnpm run check:e2e-report",
                "uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py",
                "pnpm run check:static",
            ],
        )

    def get_managed_recipe_policy_report(self) -> ManagedRecipePolicyReportView:
        recipes = [self._to_execution_recipe_view(recipe) for recipe in EXECUTION_RECIPES.values()]
        blocked_remote_operations = sorted(
            {operation for recipe in EXECUTION_RECIPES.values() for operation in recipe.remote_automation_policy.blocked_operations}
        )
        return ManagedRecipePolicyReportView(
            reportId="managed-recipe-policy-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only catalog of supervisor-managed recipe gates, allowed paths, verification commands, "
                "operator checkpoints, and blocked remote automation posture."
            ),
            recipes=recipes,
            stopLines=[
                "Managed recipe policies are not execution-authority approvals.",
                "Remote operations remain blocked unless explicit operator approval names allowed remote operations and scope.",
                "Implementation automation remains limited to declared recipe commands, branch gates, path scopes, and verification evidence.",
                "Do not use managed recipes to launch provider/model calls, subscription-agent processes, premium execution, arbitrary worker shell commands, network access, or credential access.",
            ],
            nextSafeActions=[
                "Review managed recipe policy before changing recipe commands, allowed paths, branch gates, or dashboard recipe controls.",
                "Keep recipe policy, dashboard panels, browser coverage, and report catalog references aligned when recipe behavior changes.",
                f"Blocked remote operations: {', '.join(blocked_remote_operations)}.",
            ],
            readOnly=True,
            executionAuthorityApproved=False,
            remoteAutomationApproved=False,
        )

    def get_github_workflow_policy_report(self) -> GitHubWorkflowPolicyReportView:
        return GitHubWorkflowPolicyReportView(
            reportId="github-workflow-policy-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only GitHub delivery policy for using Git Credential Manager for Git remotes, "
                "the Codex GitHub connector for PR automation, and optional local gh auth only when a workflow explicitly shells out to gh."
            ),
            authModel=[
                GitHubWorkflowPolicyItemView(
                    itemId="git-gcm-remotes",
                    label="Git remotes use Git Credential Manager",
                    status="preferred",
                    summary="Ordinary fetch, pull, and push should use Git/GCM or the supported Linux credential posture.",
                    evidence=[
                        "docs/github-connector-workflow.md defines Git/GCM as the preferred remote Git path.",
                        "pnpm run doctor:github checks credential helper and credentialStore posture.",
                    ],
                ),
                GitHubWorkflowPolicyItemView(
                    itemId="codex-github-connector",
                    label="Codex GitHub connector handles PR work",
                    status="preferred",
                    summary="Connector-backed PR inspection, metadata, and merge actions avoid local plaintext GitHub CLI token requirements.",
                    evidence=[
                        "docs/github-connector-workflow.md names the connector probe before relying on PR automation.",
                        "Fresh VM handoff requires connector-backed workflow awareness before product work.",
                    ],
                ),
                GitHubWorkflowPolicyItemView(
                    itemId="local-gh-auth",
                    label="GitHub CLI auth is optional",
                    status="optional_when_workflow_shells_out_to_gh",
                    summary="Local gh auth is not a baseline requirement and must not be replaced with persistent insecure token storage.",
                    evidence=[
                        "Bootstrap checks gh auth posture without creating tokens.",
                        "doctor:github treats gh auth as optional when Git/GCM remote delivery is healthy.",
                    ],
                ),
            ],
            requiredChecks=[
                GitHubWorkflowPolicyItemView(
                    itemId="github-doctor-local",
                    label="Local GitHub doctor",
                    status="required_for_remote_debugging",
                    summary="Run the non-mutating local doctor before diagnosing remote delivery failures.",
                    evidence=["pnpm run doctor:github"],
                ),
                GitHubWorkflowPolicyItemView(
                    itemId="github-doctor-remote",
                    label="Remote GitHub doctor",
                    status="required_for_fresh_vm_acceptance",
                    summary="Run live remote checks only when interactive Git/GCM credentials are expected to work.",
                    evidence=["pnpm run doctor:github -- --remote"],
                ),
                GitHubWorkflowPolicyItemView(
                    itemId="connector-probe",
                    label="Connector probe",
                    status="required_before_connector_pr_automation",
                    summary="Use the Codex GitHub connector to inspect repository or PR state before connector-backed automation.",
                    evidence=["docs/github-connector-workflow.md"],
                ),
            ],
            stopLines=[
                "This report is not approval for worker source mutation, network access, credential access, or arbitrary remote automation.",
                "Do not create persistent plaintext GitHub CLI tokens or use gh auth insecure storage as a baseline setup.",
                "If Git/GCM or connector authentication is unavailable, pause and ask the operator which GitHub path to use.",
            ],
            nextSafeActions=[
                "Use Git/GCM for ordinary Git push and pull operations.",
                "Use the Codex GitHub connector for PR inspection, PR creation, and merge actions when available.",
                "Keep GitHub delivery checks documented in runbooks and fresh VM acceptance evidence.",
            ],
            readOnly=True,
            executionAuthorityApproved=False,
            plaintextTokenStorageApproved=False,
            remoteAutomationApproved=False,
        )

    def get_git_hygiene_report(self) -> GitHygieneReportView:
        repo_root = self._repo_root() or str(Path.cwd())
        branch_ok, branch_output = self._git_hygiene_output(["git", "branch", "--show-current"], repo_root)
        head_ok, head_output = self._git_hygiene_output(["git", "rev-parse", "--short", "HEAD"], repo_root)
        upstream_ok, upstream_output = self._git_hygiene_output(
            ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
            repo_root,
        )
        status_ok, status_output = self._git_hygiene_output(["git", "status", "--porcelain=v1"], repo_root)
        worktree_ok, worktree_output = self._git_hygiene_output(["git", "worktree", "list", "--porcelain"], repo_root)

        status_counts = self._git_hygiene_status_counts(status_output if status_ok else "")
        working_tree_status = "clean" if status_ok and not status_output.strip() else "attention"
        current_branch = branch_output if branch_ok and branch_output else ("detached" if head_ok else "unknown")
        head_revision = head_output if head_ok else "unknown"
        upstream_branch = upstream_output if upstream_ok and upstream_output else None
        worktrees = self._parse_git_worktrees(worktree_output if worktree_ok else "")

        return GitHygieneReportView(
            reportId="git-hygiene-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only Git hygiene snapshot for the current repository, isolated worktrees, branch posture, "
                "and PR/CI query readiness. It does not push, pull, merge, create PRs, wait for CI, or clean up files."
            ),
            repoRoot=repo_root,
            currentBranch=current_branch,
            headRevision=head_revision,
            upstreamBranch=upstream_branch,
            workingTreeStatus=working_tree_status,
            statusCounts=status_counts,
            worktrees=worktrees,
            localSignals=[
                GitHygieneSignalView(
                    signalId="working-tree",
                    label="Working tree",
                    status=working_tree_status,
                    summary=(
                        "No local file changes are visible to Git."
                        if working_tree_status == "clean"
                        else "Local file changes are visible and should be reviewed before delivery."
                    ),
                    evidence=["git status --porcelain=v1", f"changed={sum(status_counts.values())}"],
                ),
                GitHygieneSignalView(
                    signalId="branch",
                    label="Current branch",
                    status="detached" if current_branch == "detached" else "detected",
                    summary=f"Current branch is {current_branch}.",
                    evidence=["git branch --show-current", f"HEAD {head_revision}"],
                ),
                GitHygieneSignalView(
                    signalId="upstream",
                    label="Upstream tracking",
                    status="configured" if upstream_branch else "not_configured",
                    summary=(
                        f"Branch tracks {upstream_branch}."
                        if upstream_branch
                        else "No upstream branch is configured for the current branch."
                    ),
                    evidence=["git rev-parse --abbrev-ref --symbolic-full-name @{u}"],
                ),
                GitHygieneSignalView(
                    signalId="worktrees",
                    label="Worktree inventory",
                    status="detected" if worktrees else "unavailable",
                    summary=f"{len(worktrees)} local worktree(s) are visible to Git.",
                    evidence=["git worktree list --porcelain"],
                ),
            ],
            remoteSignals=[
                GitHygieneSignalView(
                    signalId="pull-request",
                    label="Pull request",
                    status="not_queried",
                    summary="No GitHub PR lookup was performed by this read-only local report.",
                    evidence=["Use the GitHub connector or `pnpm run doctor:github -- --remote` only when remote checks are approved."],
                ),
                GitHygieneSignalView(
                    signalId="ci",
                    label="CI checks",
                    status="not_queried",
                    summary="No remote CI lookup or wait was performed by this read-only local report.",
                    evidence=["CI evidence remains a delivery-readiness record, not an automatic action."],
                ),
            ],
            stopLines=[
                "This report is not approval to push, pull, create PRs, wait for CI, merge, delete branches, or remove worktrees.",
                "Remote GitHub writes remain blocked until explicit operator approval names the action and scope.",
                "Cleanup remains blocked until local cleanup policy and evidence retention are implemented.",
            ],
            nextSafeActions=[
                "Review changed-file counts before preparing delivery.",
                "Use isolated worktrees for implementation stories before source mutation authority expands.",
                "Record PR and CI evidence through delivery readiness surfaces after remote delivery is approved.",
            ],
            readOnly=True,
            remoteMutationApproved=False,
            cleanupApproved=False,
        )

    def get_codex_readiness_report(self) -> CodexReadinessReportView:
        cli_path = shutil.which("codex")
        cli_detected = bool(cli_path)
        return CodexReadinessReportView(
            reportId="codex-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "No-launch Codex readiness report. It discovers whether a Codex CLI executable is on PATH, "
                "but does not run Codex, check auth, start a session, send a task, write files, or mutate source."
            ),
            cliPath=cli_path,
            checks=[
                CodexReadinessCheckView(
                    checkId="cli-discovery",
                    label="CLI discovery",
                    status="available" if cli_detected else "not_found",
                    summary=(
                        "A Codex CLI executable was found on PATH."
                        if cli_detected
                        else "No Codex CLI executable was found on PATH."
                    ),
                    evidence=["shutil.which('codex')"],
                ),
                CodexReadinessCheckView(
                    checkId="auth-posture",
                    label="Auth posture",
                    status="not_checked",
                    summary="No Codex auth or account command was executed by this report.",
                    evidence=["Auth checks require an explicit successor story or operator-approved manual command."],
                ),
                CodexReadinessCheckView(
                    checkId="worker-launch",
                    label="Worker launch",
                    status="blocked",
                    summary="Codex worker process launch remains blocked pending explicit authority.",
                    evidence=["Story 6.16 is no-launch readiness only."],
                ),
                CodexReadinessCheckView(
                    checkId="source-mutation",
                    label="Source mutation",
                    status="blocked",
                    summary="Codex source mutation remains blocked until isolated worktree, path scope, tests, and approval binding are implemented.",
                    evidence=["Story 6.17 is the first bounded implementation authority candidate."],
                ),
            ],
            stopLines=[
                "This report does not approve Codex CLI process launch.",
                "This report does not approve sending tasks, prompts, repository context, or credentials to Codex.",
                "This report does not approve source mutation, command execution, Git operations, GitHub delivery, or merge.",
            ],
            nextSafeActions=[
                "Use this report to decide whether a future manual Codex availability check is needed.",
                "Keep bounded Codex implementation behind isolated worktree, path scope, verification, and explicit approval.",
                "Use Claude review only through its separate scarce-review authority path.",
            ],
            readOnly=True,
            processLaunchApproved=False,
            workerTaskExecutionApproved=False,
            sourceMutationApproved=False,
        )

    def get_codex_implementation_approval_report(self) -> CodexImplementationApprovalReportView:
        generated_at = datetime.now(timezone.utc)
        approval_expires_at = generated_at + timedelta(hours=24)
        allowed_paths = [
            "docs/workflows/** only when the approved delivery requires source-owned workflow or runbook changes",
            "services/supervisor/** only when the approved story requires backend behavior",
            "apps/dashboard/** only when the approved story requires Dev Console behavior",
            "packages/contracts/** only when API/dashboard contracts change",
            "tests/** only for verification tied to the approved story",
            "scripts/** only for drift checks tied to the approved story",
            "Local BMAD story artifacts are input-only and must stay out of the Git delivery diff",
        ]
        blocked_paths = [
            ".env and credential files",
            ".git/**",
            "node_modules/**",
            "services/supervisor/.venv/**",
            "Any path outside the approved worktree",
            "Any unrelated source, docs, or generated output not named by the approval",
        ]
        expected_command_shape = [
            "codex <non-interactive task mode> --cwd <approved-worktree> -- <bounded task packet>",
            "pnpm run check or narrower approved verification command",
            "git diff --stat and git status --short for evidence only",
        ]
        required_evidence = [
            "approval text with authority family, operation, target story, allowed paths, expected command shape, and stop conditions",
            "worktree path, branch, base revision, and task packet id",
            "Codex process start/finish metadata without raw prompt or completion retention",
            "changed-file list and diffstat",
            "verification commands and exit codes",
            "rollback or cleanup recommendation",
        ]
        stop_conditions = [
            "Codex attempts to read or write outside the approved worktree or allowed paths.",
            "Codex asks for credentials, secrets, browser session access, or external account changes.",
            "The task packet expands beyond the approved story or requested operation.",
            "Verification fails in a way that cannot be repaired within the approved scope.",
            "The run would require GitHub remote writes, merge, cleanup, Claude review, or a new provider/model authority.",
        ]
        launch_contract = self._codex_launch_contract(
            allowed_paths=allowed_paths,
            blocked_paths=blocked_paths,
            expected_command_shape=expected_command_shape,
            required_evidence=required_evidence,
            stop_conditions=stop_conditions,
            approval_expires_at=approval_expires_at,
        )
        return CodexImplementationApprovalReportView(
            reportId="codex-implementation-approval-report-v1",
            generatedAt=generated_at,
            summary=(
                "Read-only approval packet for the first future bounded Codex implementation run. "
                "It does not launch Codex, send a task, inspect auth, create a worktree, write source, run Git, or execute shell commands."
            ),
            approvalPrompt=(
                "Approve one bounded Codex implementation attempt for the selected work item only, in an isolated worktree, "
                "limited to the listed paths and verification commands, with metadata evidence retained and stop conditions enforced."
            ),
            authorityFamily="codex_implementation",
            operation="one_time_bounded_implementation_attempt",
            targetScope=[
                "One named Active work item or story.",
                "One isolated local worktree created by the approved worktree-management path.",
                "One Codex worker task packet generated from existing supervisor evidence.",
            ],
            allowedPaths=allowed_paths,
            blockedPaths=blocked_paths,
            expectedCommandShape=expected_command_shape,
            requiredEvidence=required_evidence,
            rollbackPlan=[
                "Leave all changes in the isolated worktree until the operator reviews them.",
                "If verification fails, keep the branch blocked and retain failure evidence.",
                "Do not push, merge, delete branches, or remove the worktree without separate authority.",
                "Use Git diff/status evidence to decide whether to repair, abandon, or manually inspect the attempt.",
            ],
            stopConditions=stop_conditions,
            requirements=[
                CodexImplementationApprovalRequirementView(
                    requirementId="isolated-worktree",
                    label="Isolated worktree",
                    status="required",
                    summary="The run must happen in a named local worktree with branch and base revision evidence.",
                    evidence=["Story 6.15 local worktree plan", "git status --short", "git diff --stat"],
                ),
                CodexImplementationApprovalRequirementView(
                    requirementId="path-scope",
                    label="Path scope",
                    status="required",
                    summary="Allowed and blocked paths must be named before any Codex task execution.",
                    evidence=["allowedPaths", "blockedPaths", "approval text"],
                ),
                CodexImplementationApprovalRequirementView(
                    requirementId="verification",
                    label="Verification",
                    status="required",
                    summary="The approval must name the focused and broad checks that prove the attempt.",
                    evidence=["pnpm run check", "focused supervisor/dashboard checks when applicable"],
                ),
                CodexImplementationApprovalRequirementView(
                    requirementId="retention",
                    label="Evidence retention",
                    status="metadata_only",
                    summary="Store process/task metadata and verification evidence, not raw prompt or completion bodies.",
                    evidence=["task packet id", "exit code", "changed-file list", "verification command output summary"],
                ),
                CodexImplementationApprovalRequirementView(
                    requirementId="approval-binding",
                    label="Approval binding",
                    status="not_implemented",
                    summary="The backend does not yet bind a recorded approval to a real Codex launch.",
                    evidence=["processLaunchApproved=false", "workerTaskExecutionApproved=false", "sourceMutationApproved=false"],
                ),
            ],
            launchContract=launch_contract,
            launchContractFixtures=self._codex_launch_contract_fixtures(),
            blockedAuthorities=self._codex_blocked_authorities(),
            nextSafeActions=[
                "Use this packet to ask the operator for one story-scoped Codex implementation authority when ready.",
                "Add approval binding before any backend endpoint can launch Codex.",
                "Keep Claude review, GitHub delivery, merge, and cleanup on separate authority paths.",
            ],
            readOnly=True,
            processLaunchApproved=False,
            workerTaskExecutionApproved=False,
            sourceMutationApproved=False,
            approvalBindingImplemented=False,
        )

    def _codex_launch_contract(
        self,
        *,
        allowed_paths: list[str],
        blocked_paths: list[str],
        expected_command_shape: list[str],
        required_evidence: list[str],
        stop_conditions: list[str],
        approval_expires_at: datetime,
    ) -> dict:
        approval_binding = {
            "workItemId": "<selected-active-work-item>",
            "routeDecisionId": "<current-route-decision-id>",
            "attemptId": "<planned-execution-attempt-id>",
            "workerId": "codex.local",
            "lane": "utility",
            "authorityMode": "operator_approved_bounded_source_mutation",
            "workspacePlanId": "isolated-codex-worktree",
            "policyId": "codex-bounded-launch-policy-v1",
            "approvedScope": allowed_paths,
            "expiresAt": approval_expires_at,
        }
        permission_envelope = {
            "allowedPaths": allowed_paths,
            "blockedPaths": blocked_paths,
            "allowedCommandShape": expected_command_shape,
            "verificationCommand": "pnpm run check",
            "timeoutSeconds": 3600,
            "budget": "one_bounded_attempt",
            "evidenceOutputs": required_evidence,
            "stopConditions": stop_conditions,
        }
        return {
            "contractId": "codex-launch-contract-v1",
            "targetWorkItem": approval_binding["workItemId"],
            "routeDecision": approval_binding["routeDecisionId"],
            "attemptId": approval_binding["attemptId"],
            "workerId": approval_binding["workerId"],
            "lane": approval_binding["lane"],
            "authorityMode": approval_binding["authorityMode"],
            "workspacePlan": approval_binding["workspacePlanId"],
            "approvalBinding": approval_binding,
            "permissionEnvelope": permission_envelope,
            "evidenceToRetain": required_evidence,
            "evaluation": self._codex_launch_contract_evaluation("accepted", None, None),
        }

    def _codex_launch_contract_fixtures(self) -> list[dict]:
        return [
            {
                "fixtureId": "positive-current-contract",
                "label": "Current route, attempt, workspace, scope, verification, and approval expiry match.",
                "mutatedField": "none",
                "evaluation": self._codex_launch_contract_evaluation("accepted", None, None),
            },
            {
                "fixtureId": "stale-route-decision",
                "label": "Route decision changed after approval.",
                "mutatedField": "approvalBinding.routeDecisionId",
                "evaluation": self._codex_launch_contract_evaluation(
                    "rejected",
                    "codex_launch.route_decision_stale",
                    "approvalBinding.routeDecisionId",
                ),
            },
            {
                "fixtureId": "changed-permission-envelope",
                "label": "Allowed command, timeout, path, or evidence envelope changed after approval.",
                "mutatedField": "permissionEnvelope",
                "evaluation": self._codex_launch_contract_evaluation(
                    "rejected",
                    "codex_launch.permission_envelope_changed",
                    "permissionEnvelope",
                ),
            },
            {
                "fixtureId": "forbidden-path-scope",
                "label": "A requested write path is outside approved scope or inside blocked paths.",
                "mutatedField": "permissionEnvelope.allowedPaths",
                "evaluation": self._codex_launch_contract_evaluation(
                    "rejected",
                    "codex_launch.forbidden_path_scope",
                    "permissionEnvelope.allowedPaths",
                ),
            },
            {
                "fixtureId": "missing-verification-command",
                "label": "The approval omits the verification command required to prove the attempt.",
                "mutatedField": "permissionEnvelope.verificationCommand",
                "evaluation": self._codex_launch_contract_evaluation(
                    "rejected",
                    "codex_launch.verification_command_missing",
                    "permissionEnvelope.verificationCommand",
                ),
            },
            {
                "fixtureId": "expired-approval",
                "label": "The approval expiry is before the attempted launch time.",
                "mutatedField": "approvalBinding.expiresAt",
                "evaluation": self._codex_launch_contract_evaluation(
                    "rejected",
                    "codex_launch.approval_expired",
                    "approvalBinding.expiresAt",
                ),
            },
        ]

    def _codex_launch_contract_evaluation(self, status: str, blocked_reason: str | None, unsafe_field: str | None) -> dict:
        accepted = status == "accepted"
        return {
            "status": status,
            "launchApproved": False,
            "processLaunchAttempted": False,
            "blockedReason": blocked_reason,
            "unsafeField": unsafe_field,
            "summary": (
                "Contract shape is internally consistent, but Story 7.2 remains fake-adapter/no-launch."
                if accepted
                else f"Launch rejected before process start because {unsafe_field} is unsafe or stale."
            ),
        }

    def _codex_blocked_authorities(self) -> list[dict]:
        blocked_authorities = [
            ("claude_launch", "Claude launch"),
            ("subscription_agent_launch", "Subscription-agent launch"),
            ("provider_expansion", "Provider expansion"),
            ("issue_sync", "GitHub issue sync"),
            ("secret_access", "Secret access"),
            ("merge", "Merge"),
            ("cleanup", "Cleanup"),
            ("broad_autonomy", "Broad autonomy"),
        ]
        return [
            {
                "authorityId": authority_id,
                "label": label,
                "status": "blocked_requires_separate_approval",
                "summary": f"{label} is outside this bounded Codex launch contract and requires separate explicit approval.",
            }
            for authority_id, label in blocked_authorities
        ]

    def get_claude_review_readiness_report(self) -> ClaudeReviewReadinessReportView:
        cli_path = shutil.which("claude")
        cli_detected = bool(cli_path)
        return ClaudeReviewReadinessReportView(
            reportId="claude-review-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "No-launch Claude review readiness report. It discovers whether a Claude CLI executable is on PATH, "
                "but does not run Claude, check auth, start a session, send code or diffs, write files, or consume review budget."
            ),
            cliPath=cli_path,
            reviewPolicy=[
                ClaudeReadinessCheckView(
                    checkId="cli-discovery",
                    label="CLI discovery",
                    status="available" if cli_detected else "not_found",
                    summary=(
                        "A Claude CLI executable was found on PATH."
                        if cli_detected
                        else "No Claude CLI executable was found on PATH."
                    ),
                    evidence=["shutil.which('claude')"],
                ),
                ClaudeReadinessCheckView(
                    checkId="auth-posture",
                    label="Auth posture",
                    status="not_checked",
                    summary="No Claude auth, account, model, or subscription command was executed by this report.",
                    evidence=["Auth checks require explicit successor approval before any CLI invocation."],
                ),
                ClaudeReadinessCheckView(
                    checkId="review-only",
                    label="Review-only posture",
                    status="blocked",
                    summary="Claude review execution remains blocked until a successor story proves review-only invocation behavior.",
                    evidence=["Story 6.18 is no-launch readiness only.", "Source mutation is not approved for Claude review."],
                ),
                ClaudeReadinessCheckView(
                    checkId="source-mutation",
                    label="Source mutation",
                    status="blocked",
                    summary="Claude must not edit files unless the operator later grants a separate explicit edit-mode authority.",
                    evidence=["Current Claude lane is scarce adversarial review, not routine implementation."],
                ),
            ],
            scarcityPolicy=[
                ClaudeReadinessCheckView(
                    checkId="scarce-use",
                    label="Scarce use",
                    status="required",
                    summary="Claude is reserved for adversarial review, high-risk changes, security-sensitive diffs, and checks on Codex output.",
                    evidence=["User preference: Claude is a limited $20/month subscription for review, not routine generation."],
                ),
                ClaudeReadinessCheckView(
                    checkId="budget-record",
                    label="Budget record",
                    status="not_implemented",
                    summary="The supervisor does not yet record Claude review budget usage or monthly scarcity limits.",
                    evidence=["Story 6.19 is the first bounded Claude review authority candidate."],
                ),
                ClaudeReadinessCheckView(
                    checkId="review-trigger",
                    label="Review trigger",
                    status="policy_pending",
                    summary="High-risk or explicitly approved work should trigger Claude review only after review-only behavior is proven.",
                    evidence=["Security-sensitive diffs", "Broad architectural changes", "Codex output flaw-finding"],
                ),
            ],
            stopLines=[
                "This report does not approve Claude CLI process launch.",
                "This report does not approve sending code, diffs, prompts, repository context, or credentials to Claude.",
                "This report does not approve source mutation, command execution, Git operations, GitHub delivery, merge, or cleanup.",
                "This report does not approve consuming scarce Claude subscription usage.",
            ],
            nextSafeActions=[
                "Use this report to decide whether a future manual Claude availability check is needed.",
                "Define a review-only command shape before bounded Claude review execution.",
                "Keep Claude scarce-use policy separate from Codex implementation and GitHub delivery authority.",
            ],
            readOnly=True,
            processLaunchApproved=False,
            reviewTaskExecutionApproved=False,
            sourceMutationApproved=False,
            scarceUseApproved=False,
        )

    def get_claude_review_approval_report(self) -> ClaudeReviewApprovalReportView:
        return ClaudeReviewApprovalReportView(
            reportId="claude-review-approval-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only approval packet for a future bounded Claude adversarial review. "
                "It does not launch Claude, send code or diffs, consume subscription usage, write files, or mutate workflow state."
            ),
            approvalPrompt=(
                "Approve one bounded Claude review-only attempt for the selected work item only, using the listed context scope, "
                "scarcity controls, output contract, and stop conditions. Claude may produce findings only; file edits remain blocked."
            ),
            authorityFamily="claude_review",
            operation="one_time_bounded_review_only_attempt",
            triggerPolicy=[
                ClaudeReviewApprovalRequirementView(
                    requirementId="explicit-request",
                    label="Explicit request",
                    status="allowed",
                    summary="The operator can explicitly request Claude review for a named work item or diff.",
                    evidence=["approvalPrompt", "target work item id", "review reason"],
                ),
                ClaudeReviewApprovalRequirementView(
                    requirementId="high-risk-diff",
                    label="High-risk diff",
                    status="allowed",
                    summary="Security-sensitive, broad, or architecture-changing diffs can qualify for scarce review.",
                    evidence=["riskLevel=high", "security-sensitive paths", "architecture decision impact"],
                ),
                ClaudeReviewApprovalRequirementView(
                    requirementId="codex-output-check",
                    label="Codex output check",
                    status="allowed",
                    summary="Claude can review Codex output for flaws after Codex implementation authority is separately approved.",
                    evidence=["Codex changed-file list", "verification summary", "review question"],
                ),
                ClaudeReviewApprovalRequirementView(
                    requirementId="routine-generation",
                    label="Routine generation",
                    status="blocked",
                    summary="Claude is not a routine generation or implementation lane.",
                    evidence=["scarceUseApproved=false", "sourceMutationApproved=false"],
                ),
            ],
            contextScope=[
                "Named work item, story, or PR/diff summary.",
                "Changed-file list and bounded diff excerpts only when approved.",
                "Relevant architecture/product docs needed to judge risk.",
                "Verification results and known failure summaries.",
                "A precise review question and expected finding format.",
            ],
            blockedInputs=[
                "Credentials, tokens, secrets, cookies, browser sessions, or account data.",
                "Raw unrelated repository context.",
                "Private data not required for the review question.",
                "Instructions to edit files, run commands, push branches, merge, or clean up.",
                "Any context outside the approved work item or review scope.",
            ],
            expectedCommandShape=[
                "claude <review-only non-interactive mode> --cwd <approved-worktree> -- <bounded review packet>",
                "No write flags, no shell execution request, and no edit-mode approval.",
                "Supervisor records metadata, review reason, context scope, exit status, and findings artifact location.",
            ],
            outputContract=[
                "Risk-ranked findings with file/path references where applicable.",
                "False-positive tolerant critique; no implementation patch is expected.",
                "Explicit statement if no material issues are found.",
                "Questions or blockers that require the operator rather than autonomous expansion.",
            ],
            requiredEvidence=[
                "approval text with authority family, operation, target work item, review reason, and context scope",
                "scarce-use reason and review trigger",
                "bounded context manifest without raw secrets",
                "Claude process metadata without raw prompt retention",
                "findings artifact summary and verification follow-up recommendation",
            ],
            scarcityControls=[
                "One Claude review attempt per approval unless the operator grants a wider policy.",
                "Do not use Claude for routine generation, low-risk changes, formatting, or ordinary docs cleanup.",
                "Record why Codex, Ollama, deterministic checks, or human review were insufficient.",
                "Stop before retrying or expanding context if the review fails or asks for more authority.",
            ],
            stopConditions=[
                "Claude invocation would require credentials, secrets, account state, or browser/session access.",
                "Claude would edit files, run commands, or mutate Git/GitHub state.",
                "The review packet expands beyond the approved work item, diff, or question.",
                "The review would consume scarce subscription usage without a recorded reason.",
                "The review output requires implementation, merge, delivery, or cleanup authority.",
            ],
            nextSafeActions=[
                "Use this packet to ask the operator for one review-only Claude authority when a high-risk work item is ready.",
                "Implement approval binding before any endpoint can launch Claude.",
                "Keep implementation fixes, GitHub delivery, and cleanup on separate authority paths.",
            ],
            readOnly=True,
            processLaunchApproved=False,
            reviewTaskExecutionApproved=False,
            sourceMutationApproved=False,
            scarceUseApproved=False,
            approvalBindingImplemented=False,
        )

    def get_github_delivery_authority_report(self) -> GitHubDeliveryAuthorityReportView:
        return GitHubDeliveryAuthorityReportView(
            reportId="github-delivery-authority-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only GitHub delivery authority ladder. It documents the progressive approvals needed for remote delivery "
                "without pushing, creating PRs, waiting for CI, resolving review comments, merging, or deleting remote branches."
            ),
            authorityFamily="github_delivery",
            approvalPrompt=(
                "Approve only the named GitHub delivery step for the selected branch/PR, with required evidence retained and stop conditions enforced."
            ),
            ladder=[
                GitHubDeliveryAuthorityStepView(
                    stepId="push-branch",
                    label="Push branch",
                    status="blocked",
                    summary="Push a named local branch to origin only after branch, diffstat, and target remote are approved.",
                    requiredApproval="branch-scoped push approval",
                    evidence=["git status --short", "git diff --stat", "target remote and branch name"],
                ),
                GitHubDeliveryAuthorityStepView(
                    stepId="open-or-update-pr",
                    label="Open or update PR",
                    status="blocked",
                    summary="Create or update one pull request only after title, body, base branch, and source branch are approved.",
                    requiredApproval="PR-scoped create/update approval",
                    evidence=["PR title/body", "base branch", "source branch", "linked story evidence"],
                ),
                GitHubDeliveryAuthorityStepView(
                    stepId="wait-for-ci",
                    label="Wait for CI",
                    status="blocked",
                    summary="Read CI status only after remote checks are approved for the named PR or commit.",
                    requiredApproval="read-only CI wait approval",
                    evidence=["PR number or commit sha", "check suite summary", "timeout"],
                ),
                GitHubDeliveryAuthorityStepView(
                    stepId="resolve-review-comments",
                    label="Resolve review comments",
                    status="blocked",
                    summary="Resolve or reply to review comments only after the operator confirms comments were addressed.",
                    requiredApproval="comment-resolution approval",
                    evidence=["review thread ids", "resolution summary", "verification after changes"],
                ),
                GitHubDeliveryAuthorityStepView(
                    stepId="merge-pr",
                    label="Merge PR",
                    status="blocked",
                    summary="Merge only after PR, CI, review, and final branch evidence are ready and the operator approves the merge.",
                    requiredApproval="PR-scoped merge approval",
                    evidence=["green CI", "review resolved", "merge method", "post-merge target branch"],
                ),
                GitHubDeliveryAuthorityStepView(
                    stepId="remote-cleanup",
                    label="Remote cleanup",
                    status="blocked",
                    summary="Delete remote branches or close stale remote state only after delivery completion and cleanup approval.",
                    requiredApproval="remote cleanup approval",
                    evidence=["merged PR", "branch name", "cleanup target", "rollback note"],
                ),
            ],
            trustedDeliveryPolicy=[
                "Trusted delivery is evidence-gated, not blanket permission.",
                "Push and PR creation can become routine only for system-owned branches with clean local checks and approved scope.",
                "Merge can become routine only after CI is green, mergeability is clean, review threads are resolved, and the risk/scope class is eligible.",
                "Cleanup can become routine only after merge evidence is retained and exact local or remote targets are proven safe.",
                "Provider execution, Codex launch, Claude launch, auth changes, secrets, ambiguous targets, failed checks, and high-risk scope remain hard stops.",
            ],
            eligibilityStages=[
                GitHubDeliveryEligibilityStageView(
                    stageId="push-pr-auto-eligible",
                    label="Push and PR",
                    status="policy_defined_not_enabled",
                    summary="The first softening line is branch-scoped push plus one PR create/update after local evidence is clean.",
                    eligibleWhen=[
                        "branch is not main and is system-owned",
                        "target remote is origin and base branch is main",
                        "git status is clean except the approved delivery commits",
                        "diff scope matches the active work item or follow-up delivery plan",
                        "pnpm run check passed locally",
                        "PR title/body include verification and authority boundary evidence",
                    ],
                    hardStops=[
                        "push is rejected or requests auth changes",
                        "remote target or base branch is ambiguous",
                        "local checks failed or were skipped",
                        "diff includes secrets, credentials, or unapproved paths",
                    ],
                    allowedOperations=["push named branch", "open or update one PR", "read PR metadata"],
                    blockedOperations=["merge", "delete branches", "cleanup", "issue/story sync", "Codex or Claude launch"],
                ),
                GitHubDeliveryEligibilityStageView(
                    stageId="ci-review-auto-eligible",
                    label="CI and review inspection",
                    status="policy_defined_not_enabled",
                    summary="Read-only PR and CI inspection can continue after a PR exists and remains scoped.",
                    eligibleWhen=[
                        "PR URL and commit sha are retained",
                        "CI check target is the named PR or commit",
                        "review comments are read-only unless separately approved for mutation",
                    ],
                    hardStops=[
                        "CI fails",
                        "review requests changes",
                        "PR target changes",
                        "inspection requires credential or auth mutation",
                    ],
                    allowedOperations=["read PR status", "read CI status", "prepare merge packet", "prepare cleanup packet"],
                    blockedOperations=["resolve review comments", "merge", "delete branches", "remote cleanup"],
                ),
                GitHubDeliveryEligibilityStageView(
                    stageId="merge-auto-eligible",
                    label="Merge",
                    status="policy_defined_not_enabled",
                    summary="Merge can soften only for eligible low-risk scopes after PR evidence is fully green.",
                    eligibleWhen=[
                        "CI is green",
                        "mergeability is clean",
                        "review threads are resolved or explicitly waived",
                        "work class is low-risk or explicitly marked delivery-auto-eligible",
                        "merge method and target branch are retained before action",
                    ],
                    hardStops=[
                        "merge conflicts",
                        "failed or pending required checks",
                        "unresolved review comments",
                        "high-risk scope, provider execution, or auth-sensitive changes",
                    ],
                    allowedOperations=["merge approved eligible PR", "record merge commit", "refresh read-only post-merge status"],
                    blockedOperations=["cleanup", "issue/story sync", "merge with changed method", "force push"],
                ),
                GitHubDeliveryEligibilityStageView(
                    stageId="cleanup-auto-eligible",
                    label="Cleanup",
                    status="policy_defined_not_enabled",
                    summary="Cleanup can soften only after delivery evidence is retained and the exact targets are safe.",
                    eligibleWhen=[
                        "PR is merged",
                        "merge commit, branch, and worktree evidence are retained",
                        "cleanup dry-run names exactly one target",
                        "target is inside the managed worktree root or exact merged remote branch",
                    ],
                    hardStops=[
                        "target path is ambiguous or outside the managed root",
                        "branch is unmerged or evidence is missing",
                        "cleanup would delete runtime evidence or current work",
                        "remote cleanup target is not the exact merged branch",
                    ],
                    allowedOperations=["remove exact merged worktree", "delete exact merged local branch", "prepare remote cleanup evidence"],
                    blockedOperations=["delete main checkout", "delete arbitrary directories", "remote deletion without retained merge evidence"],
                ),
            ],
            requiredEvidence=[
                "named branch, PR, commit, or remote target for each approved step",
                "operator approval text naming action and scope",
                "pre-action local git status and diffstat where relevant",
                "remote result metadata without credential retention",
                "post-action status, URL, check result, or merge summary",
            ],
            rollbackPlan=[
                "If push or PR creation fails, leave local branch untouched and record the error.",
                "If CI fails, stop delivery and return the work item to blocked or repair status.",
                "If review comments require changes, create a new local implementation/repair slice before merge.",
                "If merge fails, do not retry with a different method without new approval.",
                "Do not delete local or remote branches until cleanup authority is separately approved.",
            ],
            stopConditions=[
                "The remote target, branch, PR, or merge base is ambiguous.",
                "Local git status is dirty outside the approved delivery changes.",
                "CI fails, review comments remain unresolved, or required evidence is missing.",
                "The operation would expose credentials, persist plaintext tokens, or alter GitHub auth state.",
                "The requested step expands into merge, cleanup, issue sync, or branch deletion without matching approval.",
            ],
            nextSafeActions=[
                "Use this ladder to request one delivery step at a time.",
                "Keep GitHub remote writes, merge, and cleanup separate until the system earns broader policy authority.",
                "Record remote evidence through delivery readiness and runtime evidence surfaces after approval.",
            ],
            readOnly=True,
            pushApproved=False,
            pullRequestApproved=False,
            ciWaitApproved=False,
            reviewResolutionApproved=False,
            mergeApproved=False,
            remoteCleanupApproved=False,
            automaticDeliveryApproved=False,
        )

    async def get_trusted_delivery_eligibility_report(
        self,
        session: AsyncSession | None = None,
        *,
        work_item_id: str | None = None,
        approved_scope: list[str] | None = None,
    ) -> TrustedDeliveryEligibilityReportView:
        base_branch = "main"
        branch_ok, branch_output = self._git_output(["git", "branch", "--show-current"])
        head_ok, head_output = self._git_output(["git", "rev-parse", "--short", "HEAD"])
        status_ok, status_output = self._git_output(["git", "status", "--porcelain=v1"])
        base_ok, _ = self._git_output(["git", "rev-parse", "--verify", base_branch])
        ahead_ok, ahead_output = self._git_output(["git", "rev-list", "--count", f"{base_branch}..HEAD"])
        diff_ok, diff_output = self._git_output(["git", "diff", "--stat", f"{base_branch}...HEAD"])
        diff_name_ok, diff_name_output = self._git_output(["git", "diff", "--name-status", f"{base_branch}...HEAD"])

        current_branch = branch_output if branch_ok and branch_output else "detached"
        head_revision = head_output if head_ok else "unknown"
        working_tree_status = "clean" if status_ok and not status_output.strip() else "attention"
        commits_ahead = int(ahead_output) if ahead_ok and ahead_output.isdigit() else 0
        diff_stat = diff_output if diff_ok and diff_output else "No committed diff from main."

        system_branch = current_branch.startswith("codex/")
        branch_not_main = current_branch not in {"main", "master", "detached", ""}
        clean_tree = working_tree_status == "clean"
        has_commits = commits_ahead > 0
        launch_evidence = await self._latest_work_item_artifact_evidence(session, work_item_id, "supervised_codex_launch_evidence")
        launch_scope = launch_evidence.get("inputScope") if isinstance(launch_evidence, dict) else None
        scoped_allowed_paths = approved_scope or (
            launch_scope.get("allowedPaths")
            if isinstance(launch_scope, dict) and isinstance(launch_scope.get("allowedPaths"), list)
            else None
        )
        diff_guard = self._trusted_delivery_diff_guard(
            diff_name_ok=diff_name_ok,
            diff_name_output=diff_name_output,
            status_ok=status_ok,
            status_output=status_output,
            approved_scope=[str(path) for path in scoped_allowed_paths] if scoped_allowed_paths else None,
        )
        verification_evidence = await self._latest_work_item_verification_evidence(session, work_item_id)
        delivery_evidence = await self._work_item_delivery_evidence(session, work_item_id)
        verification_status = str(verification_evidence.get("status")) if verification_evidence else "not_recorded"
        verification_summary = (
            str(verification_evidence.get("summary"))
            if verification_evidence and verification_evidence.get("summary")
            else "A recent `pnpm run check` result must be retained before auto-eligible push or PR."
        )
        verification_command = (
            str(verification_evidence.get("commandShape"))
            if verification_evidence and verification_evidence.get("commandShape")
            else "manual verification record required"
        )
        verification_exit_code = verification_evidence.get("exitCode") if verification_evidence else None
        verification_passed = verification_status == "passed" and verification_exit_code == 0
        verification_recorded = verification_status != "not_recorded"
        verification_fresh = bool(verification_evidence and verification_evidence.get("recordedAt"))
        verification_blocked_reason_by_status = {
            "failed": "local-verification-failed",
            "timed_out": "local-verification-timed-out",
            "could_not_run": "local-verification-could-not-run",
            "not_recorded": "local-verification-evidence-missing",
        }

        push_checks = [
            self._eligibility_check(
                "system-branch",
                "System-owned branch",
                "scope",
                system_branch,
                f"Current branch is {current_branch}.",
                ["git branch --show-current", "required prefix: codex/"],
                "scope-branch-not-system-owned",
            ),
            self._eligibility_check(
                "not-main",
                "Not main",
                "scope",
                branch_not_main,
                "Delivery automation must never run directly from main.",
                [f"branch={current_branch}"],
                "scope-main-branch-blocked",
            ),
            self._eligibility_check(
                "base-main",
                "Base branch",
                "scope",
                base_ok,
                "Base branch main must resolve locally before delivery evaluation.",
                ["git rev-parse --verify main"],
                "scope-base-main-missing",
            ),
            self._eligibility_check(
                "clean-tree",
                "Clean working tree",
                "local_verification",
                clean_tree,
                "Working tree must be clean before remote delivery can soften.",
                ["git status --porcelain=v1", f"workingTreeStatus={working_tree_status}"],
                "unexpected-local-diff",
            ),
            self._eligibility_check(
                "commits-ahead",
                "Committed diff",
                "scope",
                has_commits,
                "Branch must contain committed work ahead of main.",
                ["git rev-list --count main..HEAD", f"commitsAhead={commits_ahead}"],
                "scope-committed-diff-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="diff-guard",
                label="Diff guard",
                gateFamily="scope",
                status="passed" if diff_guard["status"] == "passed" else diff_guard["status"],
                summary=(
                    "Changed files are inside the approved scope."
                    if diff_guard["status"] == "passed"
                    else "Changed files include out-of-scope or unsafe paths that block delivery."
                ),
                evidence=diff_guard["blockedPaths"] or [item["path"] for item in diff_guard["changedFiles"]],
                blockedReason=diff_guard["blockedReason"],
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="local-check-evidence",
                label="Local check evidence",
                gateFamily="local_verification",
                status="passed" if verification_recorded else "not_recorded",
                summary=verification_summary if verification_recorded else "A recent `pnpm run check` result must be retained before auto-eligible push or PR.",
                evidence=[verification_command],
                blockedReason=None if verification_recorded else "local-verification-evidence-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="local-check-result",
                label="Local check result",
                gateFamily="local_verification",
                status="passed" if verification_passed else "blocked",
                summary=verification_summary,
                evidence=[f"status={verification_status}", f"exitCode={verification_exit_code}"],
                blockedReason=None if verification_passed else verification_blocked_reason_by_status.get(verification_status, "local-verification-failed"),
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="local-check-freshness",
                label="Local check freshness",
                gateFamily="evidence_retention",
                status="passed" if verification_fresh else "stale",
                summary=(
                    "Latest verification evidence includes a retained timestamp."
                    if verification_fresh
                    else "Stale local verification evidence blocks the green gate until a fresh result is retained."
                ),
                evidence=[
                    str(verification_evidence.get("recordedAt"))
                    if verification_evidence and verification_evidence.get("recordedAt")
                    else "no freshness timestamp retained by this report"
                ],
                blockedReason=None if verification_fresh else "local-verification-evidence-stale",
            ),
        ]
        push_eligible = all(check.status == "passed" for check in push_checks)

        ci_checks = [
            TrustedDeliveryEligibilityCheckView(
                checkId="pr-url",
                label="PR URL",
                gateFamily="ci",
                status="passed" if delivery_evidence.get("pullRequestUrl") else "not_recorded",
                summary=(
                    "PR URL is retained for this work item."
                    if delivery_evidence.get("pullRequestUrl")
                    else "A PR URL is required before CI and review inspection can become auto-eligible."
                ),
                evidence=[delivery_evidence.get("pullRequestUrl") or "No GitHub query performed by this read-only local report."],
                blockedReason=None if delivery_evidence.get("pullRequestUrl") else "ci-evidence-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="ci-target",
                label="CI target",
                gateFamily="ci",
                status="passed" if delivery_evidence.get("ciStatus") in {"passed", "waived"} else "not_recorded",
                summary="Retained CI state can be evaluated for this work item.",
                evidence=[f"ciStatus={delivery_evidence.get('ciStatus', 'not_recorded')}"],
                blockedReason=None if delivery_evidence.get("ciStatus") in {"passed", "waived"} else "ci-target-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="evidence-retained",
                label="Evidence retained",
                gateFamily="evidence_retention",
                status="passed" if delivery_evidence.get("pullRequestUrl") and delivery_evidence.get("ciStatus") in {"passed", "waived"} else "not_recorded",
                summary="The PR, CI target, and inspection evidence must be retained before CI review can soften.",
                evidence=[
                    f"pullRequestStatus={delivery_evidence.get('pullRequestStatus', 'not_recorded')}",
                    f"ciStatus={delivery_evidence.get('ciStatus', 'not_recorded')}",
                ],
                blockedReason=None if delivery_evidence.get("pullRequestUrl") and delivery_evidence.get("ciStatus") in {"passed", "waived"} else "delivery-evidence-missing",
            ),
        ]

        merge_checks = [
            TrustedDeliveryEligibilityCheckView(
                checkId="ci-green",
                label="Green CI",
                gateFamily="ci",
                status="passed" if delivery_evidence.get("ciStatus") in {"passed", "waived"} else "not_recorded",
                summary="Merge cannot soften until remote CI is known green for the named PR.",
                evidence=[f"ciStatus={delivery_evidence.get('ciStatus', 'not_recorded')}"],
                blockedReason=None if delivery_evidence.get("ciStatus") in {"passed", "waived"} else "ci-evidence-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="mergeability-clean",
                label="Clean mergeability",
                gateFamily="merge_state",
                status="passed" if delivery_evidence.get("mergeStatus") in {"ready", "merged", "waived"} else "not_recorded",
                summary="Mergeability must be clean immediately before merge.",
                evidence=[f"mergeStatus={delivery_evidence.get('mergeStatus', 'not_recorded')}"],
                blockedReason=None if delivery_evidence.get("mergeStatus") in {"ready", "merged", "waived"} else "merge-state-evidence-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="review-resolution",
                label="Review resolution",
                gateFamily="merge_state",
                status="passed" if delivery_evidence.get("readyForApproval") else "not_recorded",
                summary="Review threads must be resolved or explicitly waived before merge can soften.",
                evidence=[f"readyForApproval={delivery_evidence.get('readyForApproval', False)}"],
                blockedReason=None if delivery_evidence.get("readyForApproval") else "review-evidence-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="merge-authority",
                label="Merge authority",
                gateFamily="authority_boundary",
                status="passed",
                summary="This report computes merge readiness only; execution remains unapproved until separate authority names the PR, head, CI, and clean merge state.",
                evidence=["executionApproved=false", "readiness-reporting-only"],
                blockedReason=None,
            ),
        ]

        cleanup_checks = [
            TrustedDeliveryEligibilityCheckView(
                checkId="merge-evidence",
                label="Merge evidence",
                gateFamily="evidence_retention",
                status="passed" if delivery_evidence.get("mergeStatus") == "merged" else "not_recorded",
                summary="Cleanup cannot soften until merge commit and branch evidence are retained.",
                evidence=[f"mergeStatus={delivery_evidence.get('mergeStatus', 'not_recorded')}", delivery_evidence.get("pullRequestUrl") or "merged PR URL and merge commit required"],
                blockedReason=None if delivery_evidence.get("mergeStatus") == "merged" else "merge-evidence-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="cleanup-dry-run",
                label="Cleanup dry run",
                gateFamily="cleanup_target",
                status="passed" if delivery_evidence.get("cleanupDryRunStatus") == "passed" else "not_recorded",
                summary="Cleanup dry-run must name exactly one safe target.",
                evidence=[delivery_evidence.get("cleanupTarget") or "cleanup dry-run required; no cleanup command executed by this report"],
                blockedReason=None if delivery_evidence.get("cleanupDryRunStatus") == "passed" else "cleanup-target-missing",
            ),
            TrustedDeliveryEligibilityCheckView(
                checkId="cleanup-authority",
                label="Cleanup authority",
                gateFamily="authority_boundary",
                status="passed",
                summary="This report computes cleanup readiness only; execution remains unapproved until separate cleanup authority names the exact merged branch and worktree.",
                evidence=["executionApproved=false", "readiness-reporting-only"],
                blockedReason=None,
            ),
        ]

        stages = [
            self._trusted_delivery_stage(
                "push-pr-auto-eligible",
                "Push and PR",
                push_checks,
                ["push named branch", "open or update one PR", "read PR metadata"],
                ["merge", "cleanup", "issue/story sync", "Codex or Claude launch"],
            ),
            self._trusted_delivery_stage(
                "ci-review-auto-eligible",
                "CI and review inspection",
                ci_checks,
                ["read PR status", "read CI status", "prepare merge packet"],
                ["resolve comments", "merge", "delete branches"],
            ),
            self._trusted_delivery_stage(
                "merge-auto-eligible",
                "Merge",
                merge_checks,
                ["merge approved eligible PR", "record merge commit"],
                ["cleanup", "issue/story sync", "force push"],
            ),
            self._trusted_delivery_stage(
                "cleanup-auto-eligible",
                "Cleanup",
                cleanup_checks,
                ["remove exact merged worktree", "delete exact merged local branch"],
                ["delete main checkout", "delete arbitrary directories", "remote deletion without retained merge evidence"],
            ),
        ]
        action_eligibility = self._trusted_delivery_action_eligibility(stages)
        stage_by_id = {stage.stageId: stage for stage in stages}

        hard_stops = [
            "current branch is main, detached, or not system-owned",
            "working tree is dirty",
            "local full check evidence is missing",
            "PR URL, CI state, mergeability, review state, or merge evidence is missing",
            "the action would require auth changes, provider execution, Codex launch, Claude launch, or secret access",
        ]

        return TrustedDeliveryEligibilityReportView(
            reportId="trusted-delivery-eligibility-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only evaluator for trusted delivery eligibility. It inspects local branch and Git evidence, "
                "names missing proof, and performs no push, PR, CI wait, merge, cleanup, or GitHub mutation."
            ),
            currentBranch=current_branch,
            baseBranch=base_branch,
            headRevision=head_revision,
            workingTreeStatus=working_tree_status,
            commitsAhead=commits_ahead,
            diffStat=diff_stat,
            diffGuard=diff_guard,
            diffGuardFixtures=self._trusted_delivery_diff_guard_fixtures(),
            verificationEvidenceFixtures=self._trusted_delivery_verification_evidence_fixtures(),
            actionEligibility=action_eligibility,
            actionEligibilityFixtures=self._trusted_delivery_action_eligibility_fixtures(),
            unrelatedAuthoritiesBlocked=[
                "issue_sync",
                "claude_launch",
                "provider_expansion",
                "subscription_agent_launch",
                "secret_access",
                "failed_check_bypass",
                "broad_autonomy",
            ],
            stages=stages,
            hardStops=hard_stops,
            nextSafeActions=[
                "Use this report before requesting or exercising delivery authority.",
                "Record local check evidence before push or PR can become auto-eligible.",
                "Keep merge and cleanup blocked until remote PR, CI, review, and merge evidence are retained.",
            ],
            readOnly=True,
            automaticDeliveryApproved=False,
            pushPrAutoEligible=push_eligible,
            mergeAutoEligible=stage_by_id["merge-auto-eligible"].eligible,
            cleanupAutoEligible=stage_by_id["cleanup-auto-eligible"].eligible,
        )

    async def get_low_risk_delivery_plan_report(
        self,
        session: AsyncSession | None = None,
        *,
        work_item_id: str | None = None,
    ) -> LowRiskDeliveryPlanReportView:
        eligibility = await self.get_trusted_delivery_eligibility_report(session, work_item_id=work_item_id)
        delivery_evidence = await self._work_item_delivery_evidence(session, work_item_id)
        stage_by_id = {stage.stageId: stage for stage in eligibility.stages}
        actions = [
            self._low_risk_delivery_plan_action(
                self._low_risk_delivery_stage(stage_by_id, "push-pr-auto-eligible", "PR delivery"),
                action_id="pr",
                label="PR delivery",
                binding_blockers=self._low_risk_delivery_binding_blockers(eligibility, delivery_evidence, action_id="pr"),
                delivery_evidence=delivery_evidence,
                required_approval="Exact approval or policy naming branch, PR target, local verification, retained evidence, and allowed GitHub operations.",
                required_policy="low-risk-delivery-policy-v1",
                dry_run_ready=[
                    f"would push branch {eligibility.currentBranch}",
                    "would open or update exactly one pull request",
                    "would retain pull request URL, head revision, and command summary metadata",
                ],
                dry_run_blocked=["would block push and PR creation until all PR delivery gates are green"],
            ),
            self._low_risk_delivery_plan_action(
                self._low_risk_delivery_stage(stage_by_id, "merge-auto-eligible", "Merge"),
                action_id="merge",
                label="Merge",
                binding_blockers=self._low_risk_delivery_binding_blockers(eligibility, delivery_evidence, action_id="merge"),
                delivery_evidence=delivery_evidence,
                required_approval="Exact approval or policy naming PR, expected head, green CI, review state, merge state, and merge method.",
                required_policy="low-risk-delivery-policy-v1",
                dry_run_ready=[
                    f"would merge {delivery_evidence.get('pullRequestUrl') or 'the approved PR'} at head {delivery_evidence.get('pullRequestHeadRevision') or '<PR head evidence required>'} after rechecking CI and mergeability",
                    "would retain merge result, PR URL, head revision, and terminal status metadata",
                ],
                dry_run_blocked=["would block merge until PR, CI, review, mergeability, and approval evidence are current"],
            ),
            self._low_risk_delivery_plan_action(
                self._low_risk_delivery_stage(stage_by_id, "cleanup-auto-eligible", "Cleanup"),
                action_id="cleanup",
                label="Cleanup",
                binding_blockers=self._low_risk_delivery_binding_blockers(eligibility, delivery_evidence, action_id="cleanup"),
                delivery_evidence=delivery_evidence,
                required_approval="Exact approval or policy naming merged branch, retained evidence, worktree target, and cleanup boundary.",
                required_policy="low-risk-cleanup-policy-v1",
                dry_run_ready=[
                    f"would remove Git worktree target {delivery_evidence.get('cleanupTarget') or '<exact worktree target required>'}",
                    f"would delete local branch {delivery_evidence.get('executionBranch') or '<exact branch target required>'}",
                    "would preserve retained evidence before branch or worktree cleanup",
                    "would leave unrelated worktrees, main checkout, caches outside target, and evidence artifacts untouched",
                ],
                dry_run_blocked=[
                    "would block worktree removal until merge evidence, retained evidence, and an exact cleanup target are present",
                    "would block local branch deletion until merged branch identity is retained",
                ],
            ),
        ]
        return LowRiskDeliveryPlanReportView(
            reportId="low-risk-delivery-plan-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only dry-run plan for low-risk delivery. It composes green-gate evidence into PR, merge, "
                "and cleanup actions, names missing proof, and performs no push, PR mutation, merge, branch deletion, "
                "worktree deletion, issue sync, provider call, credential access, or failed-check bypass."
            ),
            workItemId=work_item_id,
            currentBranch=eligibility.currentBranch,
            baseBranch=eligibility.baseBranch,
            headRevision=eligibility.headRevision,
            workingTreeStatus=eligibility.workingTreeStatus,
            prRef=delivery_evidence.get("pullRequestUrl") if isinstance(delivery_evidence.get("pullRequestUrl"), str) else None,
            actions=actions,
            hardStops=[
                *eligibility.hardStops,
                "policy approval is missing or stale",
                "dry-run plan target does not match current branch, PR, head, evidence, or cleanup target",
                "operation would require remote mutation, destructive cleanup, issue sync, provider calls, credential access, failed-check bypass, or broad autonomy outside the named policy",
            ],
            nextSafeActions=[
                "Review the dry-run plan before requesting delivery or cleanup approval.",
                "Record fresh verification, CI, review, merge, and retained-evidence metadata before execution is considered.",
                "Keep the plan report-only until exact approval or a low-risk delivery policy names the action scope.",
            ],
            readOnly=True,
            remoteMutationApproved=False,
            cleanupApproved=False,
            automaticDeliveryApproved=False,
        )

    def _low_risk_delivery_stage(
        self,
        stage_by_id: dict[str, TrustedDeliveryEligibilityStageEvaluationView],
        stage_id: str,
        label: str,
    ) -> TrustedDeliveryEligibilityStageEvaluationView:
        stage = stage_by_id.get(stage_id)
        if stage:
            return stage
        return TrustedDeliveryEligibilityStageEvaluationView(
            stageId=stage_id,
            label=label,
            status="blocked",
            eligible=False,
            checks=[],
            allowedOperations=[],
            blockedOperations=["stage evidence missing"],
            nextAction=f"Regenerate trusted delivery eligibility so {label} evidence is available.",
        )

    def _low_risk_delivery_plan_action(
        self,
        stage: TrustedDeliveryEligibilityStageEvaluationView,
        *,
        action_id: str,
        label: str,
        binding_blockers: list[str],
        delivery_evidence: dict,
        required_approval: str,
        required_policy: str = "low-risk-delivery-policy-v1",
        dry_run_ready: list[str],
        dry_run_blocked: list[str],
    ) -> LowRiskDeliveryPlanActionView:
        blocked_reasons = [
            check.blockedReason
            for check in stage.checks
            if check.blockedReason
        ]
        blocked_reasons.extend(binding_blockers)
        policy_missing = True
        if not stage.eligible:
            blocked_reasons = blocked_reasons or [f"{action_id}-evidence-missing"]
        if policy_missing:
            blocked_reasons.append("policy-missing")
        evidence = []
        for check in stage.checks:
            evidence.extend(check.evidence)
        execution_eligible = stage.eligible and not binding_blockers and not policy_missing
        status = self._low_risk_delivery_action_status(
            action_id=action_id,
            execution_eligible=execution_eligible,
            delivery_evidence=delivery_evidence,
        )
        return LowRiskDeliveryPlanActionView(
            actionId=action_id,
            label=label,
            status=status,
            eligible=execution_eligible,
            dryRunEffects=dry_run_ready if stage.eligible and not binding_blockers else dry_run_blocked,
            evidence=evidence,
            blockedReasons=list(dict.fromkeys(blocked_reasons)),
            nextSafeAction=self._low_risk_delivery_next_safe_action(action_id, list(dict.fromkeys(blocked_reasons))),
            requiredApproval=required_approval,
            requiredPolicy=required_policy,
            allowedOperations=[],
            blockedOperations=list(dict.fromkeys([*stage.allowedOperations, *stage.blockedOperations, "live execution until policy approval is present"])),
            readOnly=True,
        )

    def _low_risk_delivery_action_status(
        self,
        *,
        action_id: str,
        execution_eligible: bool,
        delivery_evidence: dict,
    ) -> str:
        if delivery_evidence.get("actionId") == action_id:
            evidence_status = delivery_evidence.get("status")
            if evidence_status == "failed":
                return "failed"
            if evidence_status == "recorded":
                return "executed"
            if evidence_status == "rejected":
                return "blocked"
        return "eligible" if execution_eligible else "blocked"

    def _low_risk_delivery_next_safe_action(self, action_id: str, blocked_reasons: list[str]) -> str:
        if "policy-missing" in blocked_reasons:
            policy = "low-risk cleanup policy" if action_id == "cleanup" else "low-risk delivery policy"
            return f"Request exact {policy} approval before any {action_id} execution."
        if "delivery-target-mismatch" in blocked_reasons or "branch-head-mismatch" in blocked_reasons or "stale-pr-head" in blocked_reasons:
            return "Refresh branch, head revision, and PR evidence before requesting approval."
        if "cleanup-target-ambiguous" in blocked_reasons or "cleanup-branch-target-missing" in blocked_reasons:
            return "Record one exact cleanup target and branch before requesting cleanup approval."
        if "pr-head-evidence-missing" in blocked_reasons or "pull-request-url-missing" in blocked_reasons:
            return "Record PR URL and PR head revision before merge or cleanup approval."
        if blocked_reasons:
            return f"Resolve {blocked_reasons[0]} before requesting {action_id} approval."
        return f"Review retained evidence and request exact {action_id} approval before execution."

    def _low_risk_delivery_binding_blockers(
        self,
        eligibility: TrustedDeliveryEligibilityReportView,
        delivery_evidence: dict,
        *,
        action_id: str,
    ) -> list[str]:
        blockers: list[str] = []
        execution_branch = delivery_evidence.get("executionBranch")
        if isinstance(execution_branch, str) and execution_branch and execution_branch != eligibility.currentBranch:
            blockers.append("delivery-target-mismatch")

        if action_id in {"merge", "cleanup"}:
            pull_request_url = delivery_evidence.get("pullRequestUrl")
            pull_request_head = delivery_evidence.get("pullRequestHeadRevision")
            if isinstance(pull_request_url, str) and pull_request_url:
                if not isinstance(pull_request_head, str) or not pull_request_head:
                    blockers.append("pr-head-evidence-missing")
                elif pull_request_head != eligibility.headRevision:
                    blockers.append("stale-pr-head")
            else:
                blockers.append("pull-request-url-missing")

        if action_id == "cleanup":
            cleanup_target = delivery_evidence.get("cleanupTarget")
            if not isinstance(cleanup_target, str) or not cleanup_target:
                blockers.append("cleanup-target-ambiguous")
            if not isinstance(execution_branch, str) or not execution_branch:
                blockers.append("cleanup-branch-target-missing")

        return blockers

    async def _latest_work_item_verification_evidence(
        self,
        session: AsyncSession | None,
        work_item_id: str | None,
    ) -> dict | None:
        if session is None or not work_item_id:
            return None
        result = await session.execute(
            select(ExecutionAttempt)
            .where(ExecutionAttempt.work_item_id == work_item_id)
            .order_by(ExecutionAttempt.updated_at.desc(), ExecutionAttempt.created_at.desc())
        )
        latest_attempt = result.scalars().first()
        if latest_attempt is None:
            return None
        refs = [ref for ref in list(latest_attempt.artifact_refs_json or []) if isinstance(ref, dict)]
        verification_refs = [ref for ref in refs if ref.get("artifactType") == "verification_result"]
        return verification_refs[-1] if verification_refs else None

    async def _latest_work_item_artifact_evidence(
        self,
        session: AsyncSession | None,
        work_item_id: str | None,
        artifact_type: str,
    ) -> dict | None:
        if session is None or not work_item_id:
            return None
        result = await session.execute(
            select(ExecutionAttempt)
            .where(ExecutionAttempt.work_item_id == work_item_id)
            .order_by(ExecutionAttempt.updated_at.desc(), ExecutionAttempt.created_at.desc())
        )
        for attempt in result.scalars():
            refs = [ref for ref in list(attempt.artifact_refs_json or []) if isinstance(ref, dict)]
            artifact_refs = [ref for ref in refs if ref.get("artifactType") == artifact_type]
            if artifact_refs:
                return artifact_refs[-1]
        return None

    async def _work_item_delivery_evidence(
        self,
        session: AsyncSession | None,
        work_item_id: str | None,
    ) -> dict:
        if session is None or not work_item_id:
            return {}
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return {}
        recipe = self._execution_recipe_for_item(item)
        if not recipe:
            return {}
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        cleanup_evidence = metadata.get("cleanupEvidence") if isinstance(metadata.get("cleanupEvidence"), dict) else {}
        cleanup_target = cleanup_evidence.get("target")
        if not isinstance(cleanup_target, str) or not cleanup_target:
            cleanup_target = metadata.get("cleanupTargetPath")
        delivery_entries = [entry for entry in metadata.get("deliveryExecutionEvidence", []) if isinstance(entry, dict)]
        latest_delivery_evidence = delivery_entries[-1] if delivery_entries else {}
        return {
            **self._recipe_delivery_gate_payload(item, recipe),
            **latest_delivery_evidence,
            "hasDeliveryExecutionEvidence": bool(latest_delivery_evidence),
            "cleanupDryRunStatus": cleanup_evidence.get("dryRunStatus"),
            "cleanupTarget": cleanup_target,
        }

    async def get_cleanup_plan(self, session: AsyncSession, work_item_id: str) -> CleanupPlanView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        branch_target = self._metadata_text(metadata, "executionBranch") or self._metadata_text(metadata, "branchTarget") or "unknown"
        cleanup_target_path = self._metadata_text(metadata, "cleanupTargetPath")
        target_exists = metadata.get("cleanupTargetExists")
        target_registered = metadata.get("cleanupTargetGitRegistered")
        inside_approved_root = metadata.get("cleanupTargetInsideApprovedRoot")
        blocked_paths = [path for path in metadata.get("cleanupBlockedPaths", []) if isinstance(path, str) and path]
        source_files = [path for path in metadata.get("cleanupSourceFiles", []) if isinstance(path, str) and path]
        delivery_entries = [entry for entry in metadata.get("deliveryExecutionEvidence", []) if isinstance(entry, dict)]
        delivery_evidence = delivery_entries[-1] if delivery_entries else {}
        retained_evidence = [ref for ref in delivery_evidence.get("artifactRefs", []) if isinstance(ref, str) and ref]
        retained_evidence.extend(ref for ref in metadata.get("retainedEvidence", []) if isinstance(ref, str) and ref)
        retained_evidence = list(dict.fromkeys(retained_evidence))

        residue = self._cleanup_plan_residue(metadata, cleanup_target_path)
        git_worktree_state = self._cleanup_git_worktree_state(target_registered)
        filesystem_state = self._cleanup_filesystem_state(
            target_exists=target_exists,
            target_registered=target_registered,
            inside_approved_root=inside_approved_root,
            source_files=source_files,
            residue=residue,
        )
        blocked_reasons = self._cleanup_plan_blockers(
            metadata=metadata,
            cleanup_target_path=cleanup_target_path,
            inside_approved_root=inside_approved_root,
            blocked_paths=blocked_paths,
            source_files=source_files,
            delivery_evidence=delivery_evidence,
            retained_evidence=retained_evidence,
            residue=residue,
            git_worktree_state=git_worktree_state,
        )
        dry_run_effects = self._cleanup_plan_dry_run_effects(
            cleanup_target_path=cleanup_target_path,
            git_worktree_state=git_worktree_state,
            filesystem_state=filesystem_state,
            residue=residue,
            retained_evidence=retained_evidence,
            blocked_reasons=blocked_reasons,
        )
        return CleanupPlanView(
            planId=f"cleanup-plan-{item.id}",
            generatedAt=datetime.now(timezone.utc),
            workItemId=item.id,
            status="cleaned_up" if metadata.get("cleanupCompleted") is True else ("blocked" if blocked_reasons else "eligible"),
            branchTarget=branch_target,
            cleanupTargetPath=cleanup_target_path,
            gitWorktreeState=git_worktree_state,
            filesystemState=filesystem_state,
            sourceFileState="present" if source_files else "none",
            sourceFiles=source_files,
            retainedEvidence=retained_evidence,
            residue=residue,
            blockedPaths=blocked_paths,
            dryRunEffects=dry_run_effects,
            blockedReasons=list(dict.fromkeys(blocked_reasons)),
            requiredApproval="Exact cleanup approval naming the branch, worktree or residue path, retained evidence, and stop lines.",
            requiredPolicy="low-risk-cleanup-policy-v1",
            recoveryPath=self._metadata_text(metadata, "cleanupRecoveryPath") or "inspect retained delivery evidence and cleanup target classification before retry",
            nextSafeActions=self._cleanup_plan_next_safe_actions(blocked_reasons),
            readOnly=True,
            cleanupAllowed=False,
            branchDeletionApproved=False,
            worktreeRemovalApproved=False,
            evidenceDeletionApproved=False,
            remoteMutationApproved=False,
        )

    def _metadata_text(self, metadata: dict, key: str) -> str | None:
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value
        return None

    def _cleanup_plan_residue(self, metadata: dict, cleanup_target_path: str | None) -> list[CleanupPlanResidueView]:
        residue: list[CleanupPlanResidueView] = []
        for entry in metadata.get("cleanupResidue", []):
            if not isinstance(entry, dict):
                continue
            kind = entry.get("kind")
            path = entry.get("path")
            if not isinstance(kind, str) or not kind or not isinstance(path, str) or not path:
                continue
            inside = self._path_inside_target(path, cleanup_target_path)
            residue.append(
                CleanupPlanResidueView(
                    kind=kind,
                    path=path,
                    insideApprovedTarget=inside,
                    safeToRemoveAfterApproval=inside,
                )
            )
        return residue

    def _path_inside_target(self, path: str, cleanup_target_path: str | None) -> bool:
        if not cleanup_target_path:
            return False
        try:
            candidate = Path(path).resolve()
            target = Path(cleanup_target_path).resolve()
            candidate.relative_to(target)
            return True
        except (OSError, RuntimeError, ValueError):
            return False

    def _cleanup_git_worktree_state(self, target_registered: object) -> str:
        if target_registered is True:
            return "registered"
        if target_registered is False:
            return "not_registered"
        return "unknown"

    def _cleanup_filesystem_state(
        self,
        *,
        target_exists: object,
        target_registered: object,
        inside_approved_root: object,
        source_files: list[str],
        residue: list[CleanupPlanResidueView],
    ) -> str:
        if inside_approved_root is False:
            return "unsafe_outside_target"
        if target_exists is False:
            return "missing"
        if target_exists is True and target_registered is False and residue and not source_files:
            return "residue_only"
        if target_exists is True:
            return "exists"
        return "unknown"

    def _cleanup_plan_blockers(
        self,
        *,
        metadata: dict,
        cleanup_target_path: str | None,
        inside_approved_root: object,
        blocked_paths: list[str],
        source_files: list[str],
        delivery_evidence: dict,
        retained_evidence: list[str],
        residue: list[CleanupPlanResidueView],
        git_worktree_state: str,
    ) -> list[str]:
        blockers: list[str] = []
        if metadata.get("cleanupPolicyId") != "low-risk-cleanup-policy-v1":
            blockers.append("policy-missing")
        if not cleanup_target_path:
            blockers.append("cleanup-target-ambiguous")
        if inside_approved_root is False:
            blockers.append("cleanup-target-outside-approved-root")
        elif cleanup_target_path and inside_approved_root is not True:
            blockers.append("cleanup-target-approved-root-missing")
        if blocked_paths:
            blockers.append("blocked-path-present")
        if source_files:
            blockers.append("source-files-present")
        if not retained_evidence:
            blockers.append("retained-evidence-missing")
        if not delivery_evidence:
            blockers.append("delivery-evidence-missing")
        if git_worktree_state == "unknown":
            blockers.append("git-worktree-state-unknown")
        if any(not item.insideApprovedTarget for item in residue):
            blockers.append("unsafe-residue-path")
        delivery_mode = delivery_evidence.get("mode")
        delivery_status = delivery_evidence.get("status")
        if delivery_mode == "delivery_action_rejected_stale" or delivery_status == "rejected":
            blockers.append("delivery-evidence-stale")
        if delivery_mode == "delivery_action_failed" or delivery_status == "failed":
            blockers.append("delivery-evidence-failed")
        if delivery_evidence and (
            delivery_mode != "approved_merge_action_recorded"
            or delivery_status != "recorded"
            or delivery_evidence.get("mergeStatus") != "merged"
        ):
            blockers.append("delivery-evidence-not-merged")
        return blockers

    def _cleanup_plan_dry_run_effects(
        self,
        *,
        cleanup_target_path: str | None,
        git_worktree_state: str,
        filesystem_state: str,
        residue: list[CleanupPlanResidueView],
        retained_evidence: list[str],
        blocked_reasons: list[str],
    ) -> list[str]:
        effects = [
            "would preserve retained delivery evidence before any cleanup",
            "would not delete files, branches, worktrees, remote branches, issues, or evidence in this story",
        ]
        if cleanup_target_path:
            effects.append(f"would inspect cleanup target {cleanup_target_path}")
        if git_worktree_state == "registered":
            effects.append("would require explicit Git worktree removal approval before deletion")
        elif git_worktree_state == "not_registered":
            effects.append("git worktree removal would be skipped because target is filesystem residue")
        if filesystem_state == "residue_only":
            effects.append("would classify cache, virtualenv, and temp residue separately from source files")
        for item in residue:
            effects.append(f"would classify {item.kind} residue at {item.path}")
        if retained_evidence:
            effects.append(f"would retain evidence refs: {', '.join(retained_evidence)}")
        if blocked_reasons:
            effects.append(f"would block cleanup until resolved: {', '.join(list(dict.fromkeys(blocked_reasons)))}")
        return effects

    def _cleanup_plan_next_safe_actions(self, blocked_reasons: list[str]) -> list[str]:
        actions = []
        if "retained-evidence-missing" in blocked_reasons:
            actions.append("Record or preserve metadata-only delivery evidence before cleanup.")
        if "delivery-evidence-failed" in blocked_reasons:
            actions.append("Inspect failed delivery evidence and recover or retry before cleanup.")
        if "delivery-evidence-stale" in blocked_reasons:
            actions.append("Refresh delivery evidence so cleanup binds to current branch, PR, and retained artifacts.")
        if "delivery-evidence-missing" in blocked_reasons or "delivery-evidence-not-merged" in blocked_reasons:
            actions.append("Record approved merge delivery evidence before cleanup.")
        if "cleanup-target-ambiguous" in blocked_reasons:
            actions.append("Identify one exact disposable cleanup target path before approval.")
        if "git-worktree-state-unknown" in blocked_reasons:
            actions.append("Verify Git worktree registration state before cleanup.")
        if "source-files-present" in blocked_reasons:
            actions.append("Separate unexpected source files from residue before cleanup.")
        if "unsafe-residue-path" in blocked_reasons:
            actions.append("Move or narrow residue to the approved cleanup target before approval.")
        if "cleanup-target-outside-approved-root" in blocked_reasons or "blocked-path-present" in blocked_reasons:
            actions.append("Narrow cleanup to one approved disposable worktree or residue path.")
        if "policy-missing" in blocked_reasons:
            actions.append("Request exact cleanup approval or low-risk cleanup policy evidence before execution.")
        if not actions:
            actions.append("Review the dry-run cleanup plan and request exact cleanup approval before deletion.")
        return actions

    async def record_delivery_execution_evidence(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: DeliveryExecutionEvidencePayload,
    ) -> DeliveryExecutionEvidenceView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        plan = await self.get_low_risk_delivery_plan_report(session, work_item_id=work_item_id)
        current_delivery_evidence = await self._work_item_delivery_evidence(session, work_item_id)
        approval_validation = self._validate_delivery_execution_approval(item, plan, current_delivery_evidence, payload)
        approval_present = approval_validation.approved
        blocked_reasons = list(self._delivery_execution_evidence_blockers(plan, payload))
        blocked_reasons.extend(approval_validation.blockers)

        mode = "report_only_readiness"
        status = "blocked"
        if approval_present and blocked_reasons:
            mode = "delivery_action_rejected_stale"
            status = "rejected"
        elif approval_present:
            terminal_status = payload.terminalStatus or "completed"
            failed_terminal = terminal_status in {"failed", "timed_out", "cancelled"}
            mode = "delivery_action_failed" if failed_terminal else ("approved_pr_action_recorded" if payload.actionId == "pr" else "approved_merge_action_recorded")
            status = "failed" if failed_terminal else "recorded"
        elif payload.policyId == "low-risk-delivery-policy-v1" and payload.approvalId:
            mode = "delivery_action_rejected_stale"
            status = "rejected"

        evidence = self._delivery_execution_evidence_view(
            item=item,
            plan=plan,
            payload=payload,
            mode=mode,
            status=status,
            event_recorded=False,
            blocked_reasons=blocked_reasons,
            approval_reference=approval_validation.approval_reference,
        )

        if not payload.recordEvent or (not approval_present and mode == "report_only_readiness"):
            return evidence

        if blocked_reasons:
            await self._record_event(
                session,
                item,
                "delivery_execution.rejected",
                f"Delivery execution evidence rejected for {payload.actionId}.",
                self._sanitized_delivery_execution_event_payload(evidence),
                actor_type="operator",
            )
            await session.commit()
            return evidence.model_copy(update={"eventRecorded": True})

        metadata = dict(item.metadata_json) if isinstance(item.metadata_json, dict) else {}
        entries = [entry for entry in metadata.get("deliveryExecutionEvidence", []) if isinstance(entry, dict)]
        entries.append(evidence.model_dump(mode="json") | {"recordedAt": datetime.now(timezone.utc).isoformat()})
        metadata["deliveryExecutionEvidence"] = entries
        if payload.pullRequestUrl:
            metadata["pullRequestUrl"] = payload.pullRequestUrl
        if payload.pullRequestHeadRevision:
            metadata["pullRequestHeadRevision"] = payload.pullRequestHeadRevision
        if payload.ciStatus:
            metadata["ciStatus"] = payload.ciStatus
        if payload.mergeStatus:
            metadata["mergeStatus"] = payload.mergeStatus
        item.metadata_json = metadata
        item.updated_at = datetime.now(timezone.utc)
        item.last_event_at = item.updated_at
        event_type = "delivery_execution.failed" if status == "failed" else "delivery_execution.recorded"
        await self._record_event(
            session,
            item,
            event_type,
            f"Delivery execution evidence recorded for {payload.actionId}.",
            evidence.model_dump(mode="json"),
            actor_type="operator",
        )
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return evidence.model_copy(update={"eventRecorded": True})

    def _delivery_execution_evidence_blockers(
        self,
        plan: LowRiskDeliveryPlanReportView,
        payload: DeliveryExecutionEvidencePayload,
    ) -> list[str]:
        blockers: list[str] = []
        required_text_fields = [
            ("commandShape", "commandShape-missing", payload.commandShape),
            ("expectedBranch", "expectedBranch-missing", payload.expectedBranch),
            ("expectedHeadRevision", "expectedHeadRevision-missing", payload.expectedHeadRevision),
            ("baseBranch", "baseBranch-missing", payload.baseBranch),
            ("terminalStatus", "terminalStatus-missing", payload.terminalStatus),
            ("summary", "summary-missing", payload.summary),
            ("recoveryPath", "recoveryPath-missing", payload.recoveryPath),
        ]
        for _field_name, blocker_name, value in required_text_fields:
            if not isinstance(value, str) or not value.strip():
                blockers.append(blocker_name)
        for field_name, value in {
            "commandShape": payload.commandShape,
            "summary": payload.summary,
            "recoveryPath": payload.recoveryPath,
            "pullRequestUrl": payload.pullRequestUrl,
            "mergeResult": payload.mergeResult,
        }.items():
            blocker = self._delivery_execution_metadata_boundary_blocker(field_name, value)
            if blocker:
                blockers.append(blocker)
        for index, artifact_ref in enumerate(payload.artifactRefs):
            blocker = self._delivery_execution_metadata_boundary_blocker(f"artifactRefs[{index}]", artifact_ref)
            if blocker:
                blockers.append(blocker)
        if payload.expectedBranch and payload.expectedBranch != plan.currentBranch:
            blockers.append("delivery-target-mismatch")
        if payload.baseBranch and payload.baseBranch != plan.baseBranch:
            blockers.append("base-branch-mismatch")
        if payload.expectedHeadRevision and payload.expectedHeadRevision != plan.headRevision:
            blockers.append("branch-head-mismatch")
        if not payload.pullRequestUrl:
            blockers.append("pull-request-url-missing")
        if not payload.pullRequestHeadRevision:
            blockers.append("pr-head-evidence-missing")
        if payload.pullRequestHeadRevision and payload.expectedHeadRevision and payload.pullRequestHeadRevision != payload.expectedHeadRevision:
            blockers.append("stale-pr-head")
        if payload.ciStatus in {"failed", "cancelled", "timed_out"}:
            blockers.append("ci-failed")
        elif payload.ciStatus not in {"passed", "waived"}:
            blockers.append("ci-evidence-missing")
        if payload.reviewState not in {"approved", "resolved", "waived"}:
            blockers.append("review-missing")
        if payload.actionId == "merge" and payload.mergeStatus != "merged":
            blockers.append("merge-not-recorded")
        if payload.actionId == "merge" and not payload.mergeResult:
            blockers.append("merge-result-missing")
        terminal_statuses = {"completed", "failed", "timed_out", "cancelled"}
        if payload.terminalStatus and payload.terminalStatus not in terminal_statuses:
            blockers.append("terminal-status-invalid")
        if payload.terminalStatus == "completed" and payload.exitCode not in (0, None):
            blockers.append("exit-code-nonzero")
        if payload.terminalStatus in {"failed", "timed_out", "cancelled"} and payload.exitCode == 0:
            blockers.append("exit-code-conflicts-terminal-status")
        if not payload.artifactRefs:
            blockers.append("retained-evidence-missing")
        return list(dict.fromkeys(blockers))

    def _validate_delivery_execution_approval(
        self,
        item: WorkItem,
        plan: LowRiskDeliveryPlanReportView,
        current_delivery_evidence: dict,
        payload: DeliveryExecutionEvidencePayload,
    ) -> DeliveryApprovalValidation:
        if payload.policyId != "low-risk-delivery-policy-v1":
            return DeliveryApprovalValidation(False, ["policy-missing"])
        if not payload.approvalId:
            return DeliveryApprovalValidation(False, ["policy-missing", "approval-ledger-missing"])

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        ledger_entries = [entry for entry in metadata.get("deliveryApprovalLedger", []) if isinstance(entry, dict)]
        if not ledger_entries:
            return DeliveryApprovalValidation(False, ["approval-ledger-missing"])

        matches = [entry for entry in ledger_entries if entry.get("approvalId") == payload.approvalId]
        if not matches:
            return DeliveryApprovalValidation(False, ["approval-id-unknown"])
        if len(matches) != 1:
            return DeliveryApprovalValidation(False, ["approval-id-ambiguous"])
        approval = matches[0]

        blockers: list[str] = []
        has_current_delivery_evidence = current_delivery_evidence.get("hasDeliveryExecutionEvidence") is True
        trusted_pull_request_url = (
            current_delivery_evidence.get("pullRequestUrl")
            if has_current_delivery_evidence and isinstance(current_delivery_evidence.get("pullRequestUrl"), str)
            else payload.pullRequestUrl
        )
        trusted_pull_request_head = (
            current_delivery_evidence.get("pullRequestHeadRevision")
            if has_current_delivery_evidence and isinstance(current_delivery_evidence.get("pullRequestHeadRevision"), str)
            else payload.pullRequestHeadRevision
        )
        trusted_ci_status = (
            current_delivery_evidence.get("ciStatus")
            if has_current_delivery_evidence and isinstance(current_delivery_evidence.get("ciStatus"), str)
            else payload.ciStatus
        )
        trusted_review_state = (
            current_delivery_evidence.get("reviewState")
            if has_current_delivery_evidence and isinstance(current_delivery_evidence.get("reviewState"), str)
            else payload.reviewState
        )
        trusted_merge_status = (
            current_delivery_evidence.get("mergeStatus")
            if has_current_delivery_evidence and isinstance(current_delivery_evidence.get("mergeStatus"), str)
            else payload.mergeStatus
        )
        expected_text_fields = [
            ("authorityFamily", "github_delivery", "approval-authority-family-mismatch"),
            ("policyId", payload.policyId, "approval-policy-mismatch"),
            ("actionId", payload.actionId, "approval-action-mismatch"),
            ("workItemId", item.id, "approval-work-item-mismatch"),
            ("targetBranch", plan.currentBranch, "approval-branch-mismatch"),
            ("baseBranch", plan.baseBranch, "approval-base-branch-mismatch"),
            ("headRevision", plan.headRevision, "approval-head-mismatch"),
            ("pullRequestUrl", trusted_pull_request_url, "approval-pr-url-mismatch"),
            ("pullRequestHeadRevision", trusted_pull_request_head, "approval-pr-head-mismatch"),
            ("ciStatus", trusted_ci_status, "approval-ci-state-mismatch"),
            ("reviewState", trusted_review_state, "approval-review-state-mismatch"),
        ]
        for field_name, expected, blocker in expected_text_fields:
            if not isinstance(expected, str) or not expected.strip() or approval.get(field_name) != expected:
                blockers.append(blocker)

        if payload.actionId == "merge":
            if approval.get("mergeStatus") != trusted_merge_status or trusted_merge_status != "merged":
                blockers.append("approval-merge-state-mismatch")

        retained_evidence = [ref for ref in approval.get("retainedEvidence", []) if isinstance(ref, str) and ref]
        if set(payload.artifactRefs) != set(retained_evidence):
            blockers.append("approval-retained-evidence-mismatch")

        approved_by = approval.get("approvedBy")
        actor_identity = payload.actorLabel or payload.actorId
        if not isinstance(approved_by, str) or not approved_by.strip():
            blockers.append("approval-operator-missing")
        elif actor_identity != approved_by:
            blockers.append("approval-operator-mismatch")

        approved_at = approval.get("approvedAt")
        parsed_approved_at: datetime | None = None
        if not isinstance(approved_at, str) or not approved_at.strip():
            blockers.append("approval-approved-at-missing")
        else:
            try:
                parsed_approved_at = datetime.fromisoformat(approved_at.replace("Z", "+00:00"))
                if parsed_approved_at.tzinfo is None:
                    parsed_approved_at = parsed_approved_at.replace(tzinfo=timezone.utc)
                if parsed_approved_at > datetime.now(timezone.utc):
                    blockers.append("approval-approved-at-future")
            except ValueError:
                blockers.append("approval-approved-at-invalid")
        expires_at = approval.get("expiresAt")
        if isinstance(expires_at, str) and expires_at.strip():
            try:
                parsed_expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if parsed_expiry.tzinfo is None:
                    parsed_expiry = parsed_expiry.replace(tzinfo=timezone.utc)
                if parsed_expiry < datetime.now(timezone.utc):
                    blockers.append("approval-expired")
                if parsed_approved_at and parsed_approved_at > parsed_expiry:
                    blockers.append("approval-approved-after-expiry")
            except ValueError:
                blockers.append("approval-expiry-invalid")
        else:
            blockers.append("approval-expiry-or-review-point-missing")

        rollback_plan = [item for item in approval.get("rollbackPlan", []) if isinstance(item, str) and item]
        if not rollback_plan:
            blockers.append("approval-rollback-missing")
        stop_lines = [item for item in approval.get("stopLines", []) if isinstance(item, str) and item]
        if not stop_lines:
            blockers.append("approval-stop-lines-missing")

        unique_blockers = list(dict.fromkeys(blockers))
        return DeliveryApprovalValidation(
            approved=not unique_blockers,
            blockers=unique_blockers,
            approval_reference=payload.approvalId if not unique_blockers else None,
        )

    def _delivery_execution_metadata_boundary_blocker(self, field_name: str, value: str | None) -> str | None:
        if not isinstance(value, str) or not value:
            return None
        if len(value) > 512:
            return f"{field_name}-too-large"
        lowered = value.lower()
        forbidden_markers = [
            "rawoutput",
            "raw output",
            "stdout:",
            "stderr:",
            "secret",
            "token",
            "password",
            "raw prompt",
            "raw completion",
            "provider payload",
            "source copy",
            "-----begin",
        ]
        if any(marker in lowered for marker in forbidden_markers):
            return f"{field_name}-retention-boundary"
        return None

    def _delivery_execution_evidence_view(
        self,
        *,
        item: WorkItem,
        plan: LowRiskDeliveryPlanReportView,
        payload: DeliveryExecutionEvidencePayload,
        mode: str,
        status: str,
        event_recorded: bool,
        blocked_reasons: list[str],
        approval_reference: str | None,
    ) -> DeliveryExecutionEvidenceView:
        return DeliveryExecutionEvidenceView(
            evidenceId=f"delivery-execution-{item.id}-{payload.actionId}",
            mode=mode,
            actionId=payload.actionId,
            status=status,
            eventRecorded=event_recorded,
            blockedReasons=list(dict.fromkeys(blocked_reasons)),
            commandShape=payload.commandShape,
            targetBranch=payload.expectedBranch or plan.currentBranch,
            pullRequestUrl=payload.pullRequestUrl,
            expectedHeadRevision=payload.expectedHeadRevision or plan.headRevision,
            pullRequestHeadRevision=payload.pullRequestHeadRevision,
            baseBranch=payload.baseBranch or plan.baseBranch,
            ciStatus=payload.ciStatus,
            reviewState=payload.reviewState,
            mergeStatus=payload.mergeStatus,
            mergeResult=payload.mergeResult,
            terminalStatus=payload.terminalStatus,
            exitCode=payload.exitCode,
            summary=payload.summary or "Delivery execution evidence is metadata-only and report-bound.",
            artifactRefs=list(payload.artifactRefs),
            approvalReference=approval_reference,
            recoveryPath=payload.recoveryPath or "inspect retained delivery evidence before retry, merge, or cleanup",
            rawOutputRetained=False,
            cleanupAllowed=False,
            externalMutationRecorded=(status == "recorded"),
            remoteMutationPerformed=False,
        )

    def _sanitized_delivery_execution_event_payload(self, evidence: DeliveryExecutionEvidenceView) -> dict:
        payload = evidence.model_dump(mode="json")
        blocked_reasons = list(payload.get("blockedReasons") or [])
        if any(reason.endswith("-retention-boundary") or reason.endswith("-too-large") for reason in blocked_reasons):
            for field_name in ["commandShape", "summary", "pullRequestUrl", "mergeResult", "recoveryPath"]:
                if field_name in payload:
                    payload[field_name] = "[redacted retention-boundary]"
            if payload.get("artifactRefs"):
                payload["artifactRefs"] = ["[redacted retention-boundary]"]
        return payload

    def _trusted_delivery_diff_guard(
        self,
        *,
        diff_name_ok: bool,
        diff_name_output: str,
        status_ok: bool,
        status_output: str,
        approved_scope: list[str] | None = None,
    ) -> dict:
        default_allowed_globs = [
            "services/supervisor/**",
            "apps/dashboard/**",
            "packages/contracts/**",
            "tests/**",
            "scripts/**",
        ]
        approved_files = [path for path in (approved_scope or []) if not path.endswith("/**")]
        allowed_globs = approved_scope or default_allowed_globs
        forbidden_paths = [
            ".env*",
            ".git/**",
            "node_modules/**",
            "**/.next/**",
            "**/.turbo/**",
            "**/.pnp*",
            "**/.yarn/**",
            "**/.vercel/**",
            "**/out/**",
            "**/.venv/**",
            "**/venv/**",
            "**/__pycache__/**",
            ".pytest_cache/**",
            ".mypy_cache/**",
            ".ruff_cache/**",
            ".data/**",
            ".idea/**",
            ".vscode/**",
            ".coverage",
            "*.pyc",
            "*.pyo",
            "*.pyd",
            "*.tsbuildinfo",
            "next-env.d.ts",
            ".DS_Store",
            "Thumbs.db",
            "runtime/.batch_timer_state.json",
            "services/supervisor/.venv/**",
            "_bmad/config.user.*",
            "_bmad/custom/config.user.*",
            "*.user.toml",
            "_bmad/memory/knx/**",
            "_bmad-output/**",
            ".claude/skills/**",
            ".agents/skills/.claude-plugin/**",
            ".agents/skills/**/.decision-log.md",
            ".agents/skills/**/validation-report-*.md",
            "skills/**",
            "docs/goals/**",
            "docs/handoffs/**",
            "docs/workflows/knx-*-2026-06-19.md",
            "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
            "docs/linux-install/planning/**",
            "docs/linux-install/evidence/** except schema.md",
            "docs/prds/**",
            "docs/research/**",
            "docs/stories/**",
        ]
        generated_file_rules = [
            "generated files are blocked unless their directory is explicitly approved",
            "dashboard build output under apps/dashboard/.next/** is never delivery evidence",
        ]
        user_owned_dirty_file_rules = [
            "AGENTS.md requires explicit story scope before worker mutation",
            "existing dirty files owned by the operator remain blocked until inspected or separated",
        ]
        if not diff_name_ok or not status_ok:
            return {
                "approvedFiles": approved_files,
                "allowedGlobs": allowed_globs,
                "forbiddenPaths": forbidden_paths,
                "generatedFileRules": generated_file_rules,
                "userOwnedDirtyFileRules": user_owned_dirty_file_rules,
                "status": "not_recorded",
                "blockedReason": "diff-guard-evidence-missing",
                "changedFiles": [],
                "blockedPaths": [],
                "recommendation": "Retain file-level diff evidence before delivery, merge, or cleanup eligibility.",
            }

        changed_files: list[dict] = []
        for line in diff_name_output.splitlines():
            if not line.strip():
                continue
            parts = line.split("\t")
            change_type = parts[0].strip()
            paths = [part.strip() for part in parts[1:] if part.strip()]
            for path in paths:
                changed_files.append(self._classify_trusted_delivery_path(path, change_type, allowed_globs))

        for line in status_output.splitlines():
            if not line.strip():
                continue
            status_code = line[:2]
            path = line[3:].strip()
            if " -> " in path:
                path = path.split(" -> ", 1)[1].strip()
            if status_code == "??":
                changed_files.append(self._classify_trusted_delivery_path(path, "untracked", allowed_globs))
            elif path == "AGENTS.md":
                changed_files.append(
                    {
                        "path": path,
                        "changeType": status_code.strip() or "dirty",
                        "classification": "blocked",
                        "reason": "user-owned-dirty-file",
                    }
                )
            else:
                changed_files.append(self._classify_trusted_delivery_path(path, status_code.strip() or "dirty", allowed_globs))

        blocked_paths = [item["path"] for item in changed_files if item["classification"] != "allowed"]
        return {
            "approvedFiles": approved_files,
            "allowedGlobs": allowed_globs,
            "forbiddenPaths": forbidden_paths,
            "generatedFileRules": generated_file_rules,
            "userOwnedDirtyFileRules": user_owned_dirty_file_rules,
            "status": "passed" if not blocked_paths else "blocked",
            "blockedReason": None if not blocked_paths else "diff-guard-out-of-scope",
            "changedFiles": changed_files,
            "blockedPaths": blocked_paths,
            "recommendation": (
                "Diff guard passed; retain changed-file inventory as delivery evidence."
                if not blocked_paths
                else "Out-of-scope changes detected; inspect, revise scope, revert, or abandon before delivery eligibility."
            ),
        }

    def _classify_trusted_delivery_path(self, path: str, change_type: str, allowed_globs: list[str]) -> dict:
        normalized = path.replace("\\", "/")
        if self._is_forbidden_clean_install_delivery_path(normalized):
            return {
                "path": path,
                "changeType": change_type,
                "classification": "blocked",
                "reason": "forbidden-path",
            }
        if normalized.startswith("apps/dashboard/.next/"):
            return {
                "path": path,
                "changeType": change_type,
                "classification": "blocked",
                "reason": "generated-churn-outside-allowed-generated-paths",
            }
        if change_type == "untracked":
            return {
                "path": path,
                "changeType": change_type,
                "classification": "blocked",
                "reason": "untracked-file-outside-approved-scope",
            }
        allowed_exact_paths = [glob for glob in allowed_globs if not glob.endswith("/**")]
        if normalized in allowed_exact_paths:
            return {
                "path": path,
                "changeType": change_type,
                "classification": "allowed",
                "reason": "approved-scope",
            }
        allowed_prefixes = [glob[:-3] for glob in allowed_globs if glob.endswith("/**")]
        if any(normalized == prefix or normalized.startswith(f"{prefix}/") for prefix in allowed_prefixes):
            return {
                "path": path,
                "changeType": change_type,
                "classification": "allowed",
                "reason": "approved-scope",
            }
        return {
            "path": path,
            "changeType": change_type,
            "classification": "unexpected",
            "reason": "changed-path-outside-approved-scope",
        }

    def _is_forbidden_clean_install_delivery_path(self, normalized: str) -> bool:
        if (
            normalized.startswith(".env")
            or normalized.startswith(".git/")
            or normalized.startswith("node_modules/")
            or normalized.startswith(".pytest_cache/")
            or normalized.startswith(".mypy_cache/")
            or normalized.startswith(".ruff_cache/")
            or normalized.startswith(".data/")
            or normalized.startswith(".idea/")
            or normalized.startswith(".vscode/")
            or normalized.startswith("services/supervisor/.venv/")
            or normalized in {".coverage", ".DS_Store", "Thumbs.db", "runtime/.batch_timer_state.json"}
            or normalized.rsplit("/", 1)[-1] == "next-env.d.ts"
            or normalized.endswith("/.DS_Store")
            or normalized.endswith("/Thumbs.db")
            or normalized in {"_bmad/config.user.yaml", "_bmad/config.user.toml", "_bmad/custom/config.user.toml"}
            or normalized.rsplit("/", 1)[-1].endswith(".user.toml")
            or normalized.startswith("_bmad/memory/knx/")
            or normalized.startswith("_bmad-output/")
            or normalized.startswith(".claude/skills/")
            or normalized.startswith(".agents/skills/.claude-plugin/")
            or normalized.startswith("skills/")
            or normalized.startswith("docs/goals/")
            or normalized.startswith("docs/handoffs/")
            or normalized.startswith("docs/linux-install/planning/")
            or normalized.startswith("docs/prds/")
            or normalized.startswith("docs/research/")
            or normalized.startswith("docs/stories/")
        ):
            return True
        if re.match(r"^\.agents/skills/.*/\.decision-log\.md$", normalized):
            return True
        if re.match(r"^\.agents/skills/.*/validation-report-[^/]+\.md$", normalized):
            return True
        if re.match(r"^docs/workflows/knx-.*-2026-06-19\.md$", normalized):
            return True
        if re.search(r"(^|/)(\.next|\.turbo|\.venv|venv|__pycache__)(/|$)", normalized):
            return True
        if re.search(r"(^|/)(\.yarn|\.vercel|out)(/|$)", normalized):
            return True
        if re.search(r"(^|/)\.pnp(\..*)?$", normalized, re.IGNORECASE):
            return True
        if re.search(r"\.tsbuildinfo$", normalized, re.IGNORECASE):
            return True
        if re.search(r"\.py[cod]$", normalized, re.IGNORECASE):
            return True
        if normalized == "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md":
            return True
        if normalized.startswith("docs/linux-install/evidence/"):
            return normalized != "docs/linux-install/evidence/schema.md"
        return False

    def _trusted_delivery_diff_guard_fixtures(self) -> list[dict]:
        def guard_for(path: str, change_type: str) -> dict:
            return self._trusted_delivery_diff_guard(
                diff_name_ok=True,
                diff_name_output=f"{change_type}\t{path}",
                status_ok=True,
                status_output="",
            )

        return [
            {
                "fixtureId": "positive-approved-paths",
                "label": "Only approved service source changed.",
                "guard": guard_for("services/supervisor/src/supervisor/application/service.py", "M"),
            },
            {
                "fixtureId": "unexpected-file",
                "label": "Unexpected file outside approved scope.",
                "guard": guard_for("docs/prds/unapproved.md", "M"),
            },
            {
                "fixtureId": "forbidden-path",
                "label": "Forbidden path changed.",
                "guard": guard_for(".env.local", "A"),
            },
            {
                "fixtureId": "out-of-scope-deletion",
                "label": "Deletion outside approved scope.",
                "guard": guard_for("docs/prds/legacy.md", "D"),
            },
            {
                "fixtureId": "generated-churn",
                "label": "Generated dashboard build output changed.",
                "guard": guard_for("apps/dashboard/.next/cache/build-manifest.json", "M"),
            },
            {
                "fixtureId": "untracked-file",
                "label": "Untracked file outside approved scope.",
                "guard": self._trusted_delivery_diff_guard(
                    diff_name_ok=True,
                    diff_name_output="",
                    status_ok=True,
                    status_output="?? scratch/outside.txt",
                ),
            },
            {
                "fixtureId": "user-owned-dirty-file",
                "label": "User-owned dirty file requires separation or explicit scope.",
                "guard": self._trusted_delivery_diff_guard(
                    diff_name_ok=True,
                    diff_name_output="",
                    status_ok=True,
                    status_output=" M AGENTS.md",
                ),
            },
        ]

    def _trusted_delivery_verification_evidence_fixtures(self) -> list[dict]:
        def evidence(status: str, exit_code: int | None, summary: str, recovery_action: str) -> dict:
            return {
                "commandId": "full-check",
                "label": "Full workspace check",
                "commandShape": "pnpm run check",
                "status": status,
                "exitCode": exit_code,
                "durationMs": 132000 if status == "passed" else None,
                "summary": summary,
                "artifactRef": "_bmad-output/execution-attempts/check-summary.txt",
                "recoveryAction": recovery_action,
                "rawOutputRetained": False,
            }

        return [
            {
                "fixtureId": "verification-passed",
                "label": "Approved verification command passed.",
                "evidence": evidence("passed", 0, "Full check passed with bounded summary.", "retain evidence for green-gate evaluation"),
                "greenGateContribution": "local_verification_passed",
                "blockedReason": None,
            },
            {
                "fixtureId": "verification-failed",
                "label": "Approved verification command failed.",
                "evidence": evidence("failed", 1, "Full check failed; retain worktree for inspection.", "inspect, retry, resume, or rollback"),
                "greenGateContribution": "blocked",
                "blockedReason": "local-verification-failed",
            },
            {
                "fixtureId": "verification-timed-out",
                "label": "Approved verification command timed out.",
                "evidence": evidence("timed_out", None, "Full check timed out; retain worktree and partial evidence.", "inspect timeout, retry, resume, or rollback"),
                "greenGateContribution": "blocked",
                "blockedReason": "local-verification-timed-out",
            },
            {
                "fixtureId": "verification-could-not-run",
                "label": "Approved verification command could not run.",
                "evidence": evidence("could_not_run", None, "Full check could not run in this environment.", "repair environment before retry"),
                "greenGateContribution": "blocked",
                "blockedReason": "local-verification-could-not-run",
            },
            {
                "fixtureId": "verification-not-recorded",
                "label": "Verification evidence is missing.",
                "evidence": evidence("not_recorded", None, "No verification evidence retained.", "run approved verification command before delivery"),
                "greenGateContribution": "blocked",
                "blockedReason": "local-verification-evidence-missing",
            },
        ]

    def _trusted_delivery_action_eligibility(self, stages: list[TrustedDeliveryEligibilityStageEvaluationView]) -> list[dict]:
        by_id = {stage.stageId: stage for stage in stages}
        return [
            self._trusted_delivery_action_from_stage(
                "pr",
                "PR",
                by_id["push-pr-auto-eligible"],
                "PR creation/update remains reporting-only until an explicit delivery policy or approval exists.",
            ),
            self._trusted_delivery_action_from_stage(
                "merge",
                "Merge",
                by_id["merge-auto-eligible"],
                "Merge remains reporting-only until explicit merge authority names the PR, head, CI, and clean merge state.",
            ),
            self._trusted_delivery_action_from_stage(
                "cleanup",
                "Cleanup",
                by_id["cleanup-auto-eligible"],
                "Cleanup remains reporting-only until explicit cleanup authority names exact branch/worktree targets.",
            ),
        ]

    def _trusted_delivery_action_from_stage(
        self,
        action_id: str,
        label: str,
        stage: TrustedDeliveryEligibilityStageEvaluationView,
        next_action: str,
    ) -> dict:
        blocked_reasons = [
            check.blockedReason
            for check in stage.checks
            if check.status != "passed" and check.blockedReason
        ]
        return {
            "actionId": action_id,
            "label": label,
            "status": "eligible" if not blocked_reasons else "blocked",
            "evidence": [evidence for check in stage.checks for evidence in check.evidence],
            "blockedReasons": blocked_reasons,
            "nextAction": next_action,
            "executionApproved": False,
        }

    def _trusted_delivery_action_eligibility_fixtures(self) -> list[dict]:
        all_green = [
            self._trusted_delivery_action_fixture("pr", "PR", "eligible", [], ["scope approved", "diff guard passed", "verification passed", "evidence retained"]),
            self._trusted_delivery_action_fixture("merge", "Merge", "eligible", [], ["PR URL retained", "CI green", "merge state clean", "review resolved"]),
            self._trusted_delivery_action_fixture("cleanup", "Cleanup", "eligible", [], ["PR merged", "merge commit retained", "exact cleanup target retained", "cleanup dry-run retained"]),
        ]
        return [
            {
                "fixtureId": "all-green-reporting-only",
                "label": "All gates green but execution still requires policy.",
                "actions": all_green,
            },
            {
                "fixtureId": "missing-verification-blocks-pr",
                "label": "Missing verification blocks PR eligibility.",
                "actions": [
                    self._trusted_delivery_action_fixture("pr", "PR", "blocked", ["local-verification-evidence-missing"], ["scope approved", "diff guard passed"]),
                    all_green[1],
                    all_green[2],
                ],
            },
            {
                "fixtureId": "failed-ci-blocks-merge",
                "label": "Failed CI blocks merge eligibility.",
                "actions": [
                    all_green[0],
                    self._trusted_delivery_action_fixture("merge", "Merge", "blocked", ["ci-not-green"], ["PR URL retained", "merge target retained"]),
                    all_green[2],
                ],
            },
            {
                "fixtureId": "ambiguous-cleanup-target-fails-closed",
                "label": "Ambiguous cleanup target blocks cleanup eligibility.",
                "actions": [
                    all_green[0],
                    all_green[1],
                    self._trusted_delivery_action_fixture("cleanup", "Cleanup", "blocked", ["cleanup-target-ambiguous"], ["PR merged", "merge commit retained"]),
                ],
            },
        ]

    def _trusted_delivery_action_fixture(
        self,
        action_id: str,
        label: str,
        status: str,
        blocked_reasons: list[str],
        evidence: list[str],
    ) -> dict:
        return {
            "actionId": action_id,
            "label": label,
            "status": status,
            "evidence": evidence,
            "blockedReasons": blocked_reasons,
            "nextAction": "Report eligibility only; do not execute without explicit policy approval.",
            "executionApproved": False,
        }

    def _eligibility_check(
        self,
        check_id: str,
        label: str,
        gate_family: str,
        passed: bool,
        summary: str,
        evidence: list[str],
        blocked_reason: str,
    ) -> TrustedDeliveryEligibilityCheckView:
        return TrustedDeliveryEligibilityCheckView(
            checkId=check_id,
            label=label,
            gateFamily=gate_family,
            status="passed" if passed else "blocked",
            summary=summary,
            evidence=evidence,
            blockedReason=None if passed else blocked_reason,
        )

    def _trusted_delivery_stage(
        self,
        stage_id: str,
        label: str,
        checks: list[TrustedDeliveryEligibilityCheckView],
        allowed_operations: list[str],
        blocked_operations: list[str],
    ) -> TrustedDeliveryEligibilityStageEvaluationView:
        eligible = all(check.status == "passed" for check in checks)
        return TrustedDeliveryEligibilityStageEvaluationView(
            stageId=stage_id,
            label=label,
            status="eligible" if eligible else "blocked",
            eligible=eligible,
            checks=checks,
            allowedOperations=allowed_operations if eligible else [],
            blockedOperations=blocked_operations,
            nextAction="ready_for_operator_review" if eligible else "retain_missing_evidence",
        )

    def get_local_cleanup_readiness_report(self) -> LocalCleanupReadinessReportView:
        return LocalCleanupReadinessReportView(
            reportId="local-cleanup-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only local cleanup readiness report. It defines when completed, stale, or abandoned local work can be cleaned up "
                "while retaining evidence, but it does not remove worktrees, delete branches, delete artifacts, or mutate files."
            ),
            cleanupPolicy=[
                LocalCleanupPolicyItemView(
                    itemId="completed-worktree",
                    label="Completed worktree",
                    status="approval_required",
                    summary="A completed worktree can be removed only after merge/local-closure evidence and retained verification are present.",
                    evidence=["clean git status", "commit hash", "verification summary", "delivery or local-closure decision"],
                ),
                LocalCleanupPolicyItemView(
                    itemId="stale-worktree",
                    label="Stale worktree",
                    status="manual_review",
                    summary="A stale worktree requires operator review until the system can prove it has no unmerged useful changes.",
                    evidence=["last commit", "branch relation", "changed-file list", "staleness reason"],
                ),
                LocalCleanupPolicyItemView(
                    itemId="abandoned-attempt",
                    label="Abandoned attempt",
                    status="approval_required",
                    summary="Failed or abandoned attempts can be cleaned only after failure evidence and recovery notes are retained.",
                    evidence=["failure summary", "remaining diffstat", "reason for abandonment", "next replacement branch if any"],
                ),
                LocalCleanupPolicyItemView(
                    itemId="evidence-retention",
                    label="Evidence retention",
                    status="required",
                    summary="Runtime evidence, story verification, and final status must survive local cleanup.",
                    evidence=["story file", "runtime evidence export", "verification command list", "commit id"],
                ),
            ],
            requiredEvidence=[
                "target worktree path and branch name",
                "current git status and diffstat before cleanup",
                "commit hash or explicit no-commit reason",
                "verification or failure summary",
                "delivery, abandonment, or local-only closure decision",
                "retained evidence location after cleanup",
            ],
            blockedTargets=[
                "main repository checkout",
                "current active worktree",
                "dirty worktree with unreviewed changes",
                "branch without retained commit/evidence reference",
                "runtime evidence database or exported evidence artifacts",
                "remote branches, PRs, issues, or GitHub state",
            ],
            stopConditions=[
                "The cleanup target path is ambiguous or outside the managed worktree root.",
                "Git reports uncommitted changes that have not been reviewed.",
                "The branch has not been merged, intentionally abandoned, or explicitly waived.",
                "Required evidence would be deleted or become unreachable.",
                "Cleanup would require remote branch deletion, PR closure, issue sync, or merge authority.",
            ],
            nextSafeActions=[
                "Use this report to request one local cleanup target at a time.",
                "Add a future cleanup candidate inventory before enabling removal commands.",
                "Keep destructive removal commands behind explicit approval until repeated evidence proves the policy.",
            ],
            readOnly=True,
            automaticCleanupApproved=False,
            worktreeRemovalApproved=False,
            branchDeletionApproved=False,
            evidenceDeletionApproved=False,
        )

    def get_remote_cleanup_sync_readiness_report(self) -> RemoteCleanupSyncReadinessReportView:
        return RemoteCleanupSyncReadinessReportView(
            reportId="remote-cleanup-sync-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only remote cleanup and sync readiness report. It defines the evidence needed before remote branch deletion, "
                "GitHub issue updates, or story status sync, but performs no GitHub mutation."
            ),
            syncPolicy=[
                RemoteCleanupSyncPolicyItemView(
                    itemId="remote-branch-cleanup",
                    label="Remote branch cleanup",
                    status="blocked",
                    summary="Remote branches can be deleted only after merged/abandoned evidence and explicit branch-scoped approval.",
                    evidence=["PR merged or closed", "remote branch name", "local retained evidence", "rollback note"],
                ),
                RemoteCleanupSyncPolicyItemView(
                    itemId="issue-sync",
                    label="Issue sync",
                    status="blocked",
                    summary="GitHub issues can be updated only after the target issue, status, and comment body are approved.",
                    evidence=["issue number", "intended label/status/comment", "linked story or PR", "operator approval"],
                ),
                RemoteCleanupSyncPolicyItemView(
                    itemId="story-status-sync",
                    label="Story status sync",
                    status="blocked",
                    summary="Story status sync must preserve local story evidence and avoid claiming delivery that did not happen.",
                    evidence=["story file", "delivery status", "verification summary", "PR or waiver evidence"],
                ),
                RemoteCleanupSyncPolicyItemView(
                    itemId="audit-retention",
                    label="Audit retention",
                    status="required",
                    summary="Every remote sync must retain before/after metadata without storing credentials or raw tokens.",
                    evidence=["before state", "after state", "actor", "timestamp", "target URL"],
                ),
            ],
            requiredEvidence=[
                "exact remote branch, issue, PR, or story target",
                "operator approval naming the remote operation and scope",
                "before/after remote metadata without credential retention",
                "local evidence retained before remote cleanup",
                "rollback or correction plan if sync is wrong",
            ],
            blockedOperations=[
                "deleting remote branches without merged or abandoned evidence",
                "closing issues or PRs without explicit target approval",
                "changing labels, milestones, assignees, or project fields automatically",
                "rewriting story status without preserving local evidence",
                "storing GitHub tokens, credentials, or session material",
            ],
            stopConditions=[
                "The remote branch, issue, PR, or story target is ambiguous.",
                "The local evidence does not prove the remote cleanup or sync is safe.",
                "The requested operation would alter auth state or persist credentials.",
                "The sync would claim completion without PR, merge, waiver, or local closure evidence.",
                "The operation expands from cleanup/sync into merge, delivery, or new implementation work.",
            ],
            nextSafeActions=[
                "Use this report to request one remote cleanup or sync target at a time.",
                "Keep remote cleanup and issue sync blocked until GitHub delivery authority has landed for the work item.",
                "Record remote sync evidence in runtime evidence exports after approval.",
            ],
            readOnly=True,
            remoteBranchDeletionApproved=False,
            issueSyncApproved=False,
            storyStatusSyncApproved=False,
            remoteMutationApproved=False,
        )

    def get_trusted_autonomy_readiness_report(self) -> TrustedAutonomyReadinessReportView:
        return TrustedAutonomyReadinessReportView(
            reportId="trusted-autonomy-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only trusted autonomy readiness report. It defines the evidence needed before low-risk repeatable workflows "
                "can run end to end with the operator handling exceptions, but it does not approve autonomous execution."
            ),
            autonomyGates=[
                TrustedAutonomyReadinessGateView(
                    gateId="repeatable-low-risk-work",
                    label="Repeatable low-risk work",
                    status="not_approved",
                    summary="Only narrow, repeatable, already-proven work can be considered for autonomy.",
                    evidence=["synthetic proof", "real-story proof", "passing verification history"],
                ),
                TrustedAutonomyReadinessGateView(
                    gateId="bounded-tools",
                    label="Bounded tools",
                    status="not_approved",
                    summary="Every tool lane must have explicit path, provider, command, GitHub, and cleanup boundaries.",
                    evidence=["authority reports", "blocked default booleans", "runtime evidence export"],
                ),
                TrustedAutonomyReadinessGateView(
                    gateId="automatic-stop",
                    label="Automatic stop",
                    status="required",
                    summary="The system must stop for failures, ambiguous targets, scope expansion, scarce usage, or high-risk actions.",
                    evidence=["stopConditions", "attention queue", "work-item evidence"],
                ),
                TrustedAutonomyReadinessGateView(
                    gateId="operator-visibility",
                    label="Operator visibility",
                    status="required",
                    summary="The Dev Console must show live status, waiting items, attention needs, and retained evidence.",
                    evidence=["Controls reports", "work item detail", "runtime evidence review"],
                ),
            ],
            eligibleWork=[
                "documentation-only cleanup with stable checks",
                "deterministic report or index drift repairs",
                "safe local evidence summarization",
                "repeatable low-risk dashboard copy changes with focused tests",
            ],
            blockedWork=[
                "Codex or Claude launch without explicit authority",
                "provider/model expansion beyond approved Ollama boundary",
                "GitHub push, PR, merge, issue sync, or cleanup without matching approval",
                "source mutation outside approved paths",
                "credential, token, auth, session, or secret handling",
            ],
            requiredEvidence=[
                "history of repeated successful runs for the same workflow class",
                "clear rollback or stop behavior",
                "bounded path, command, provider, GitHub, and cleanup scope",
                "runtime evidence export retained before and after automation",
                "operator-approved policy defining what exceptions still interrupt the operator",
            ],
            stopConditions=[
                "The work is not low-risk, repeatable, and already proven.",
                "Any required authority report says the action is blocked.",
                "Verification fails or becomes flaky.",
                "The task requests scarce Claude usage or remote GitHub mutation.",
                "The workflow would hide evidence, delete state, or continue after ambiguity.",
            ],
            nextSafeActions=[
                "Use this report to select one narrow workflow class for a future autonomy trial.",
                "Keep all autonomy booleans false until a specific policy is approved.",
                "Prefer operator exceptions over silent retries when failures or scope changes occur.",
            ],
            readOnly=True,
            lowRiskAutonomyApproved=False,
            autonomousProviderUseApproved=False,
            autonomousGitHubDeliveryApproved=False,
            autonomousCleanupApproved=False,
        )

    def get_epic_6_completion_audit_report(self) -> EpicCompletionAuditReportView:
        return EpicCompletionAuditReportView(
            reportId="epic-6-completion-audit-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only Epic 6 completion audit. The integrated Epic 6 milestone, cleanup hardening, and trusted "
                "delivery eligibility follow-ups were merged. Story 3.66 completed the real BMAD proof path through "
                "Candidate Work, Active Work, lane decision, local evidence, bounded Codex implementation, verification, "
                "PR/CI/merge, cleanup, and retained done evidence. Epic 6 MVP is complete; post-MVP autonomy remains gated."
            ),
            epicId="6",
            overallStatus="epic_6_mvp_complete",
            completedItems=[
                EpicCompletionAuditItemView(
                    itemId="local-readiness-stack",
                    label="Local readiness stack",
                    status="prepared_locally",
                    summary="Stories 6.3 through 6.26 have implementation evidence for proposed work, routing preview, Dev Console visibility, authority readiness reports, delivery eligibility, and completion audit visibility.",
                    evidence=[
                        "Candidate Work and BMAD import surfaces exist.",
                        "Task Packet preview, fake or blocked attempts, runtime evidence, and Dev Console live state are wired.",
                        "Codex, Claude, GitHub, cleanup, and trusted autonomy reports are read-only and default to blocked.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="delivery-packaging-plan",
                    label="Delivery packaging plan",
                    status="merged",
                    summary="Integrated PR #86 delivered the Epic 6 milestone stack into main after approved merge authority.",
                    evidence=[
                        "https://github.com/slawdawg/Kendall-vnxt/pull/86",
                        "PR #86 was merged into main.",
                        "docs/workflows/implementation-evidence-boundary.md",
                        "The delivery plan did not approve Codex launch, Claude launch, remote cleanup, story sync, or trusted autonomy expansion.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="local-cleanup-closeout",
                    label="Local cleanup closeout",
                    status="completed_with_follow_up",
                    summary="Merged Epic 6 worktrees and branches were cleaned up, and local cleanup RCA produced a hardening follow-up.",
                    evidence=[
                        "Local Git worktree list was reduced to the main checkout plus intentional ongoing work.",
                        "Remote merged branches for PR #85, PR #86, PR #87, and PR #88 were cleaned up.",
                        "Local cache and ACL cleanup prevention was delivered through PR #87.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="dev-console-integration",
                    label="Dev Console integration",
                    status="visible",
                    summary="Controls, proposed work, active work, runtime evidence, and report catalog surfaces make the pipeline visible.",
                    evidence=[
                        "Controls page includes authority, cleanup, delivery, and autonomy reports.",
                        "Report shortcut anchors link evidence to the right dashboard sections.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="trusted-delivery-eligibility",
                    label="Trusted delivery eligibility",
                    status="merged",
                    summary="Story 6.26 now evaluates the current branch before any future push, PR, merge, or cleanup action is considered eligible.",
                    evidence=[
                        "https://github.com/slawdawg/Kendall-vnxt/pull/88",
                        "GET /supervisor/trusted-delivery-eligibility-report is wired into Controls and report shortcuts.",
                        "The evaluator uses branch-scoped merge-base diff evidence and performs no GitHub mutation.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="story-3-66-selection",
                    label="Story 3.66 proof selection",
                    status="completed",
                    summary="Story 3.66 is the selected low-risk real BMAD story for the Epic 6 MVP proof lifecycle.",
                    evidence=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "Candidate Work 8afea99f-bb79-4f51-a66c-f1b02dff9005 was promoted to Active WorkItem a8e43bba-a2dd-4b2e-b995-22fecea85611.",
                        "PR #96 merged proof-selection, approval-packet, progress, and authority-ledger evidence into main.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="story-3-66-done-proof",
                    label="Story 3.66 done proof",
                    status="completed",
                    summary="Story 3.66 completed the approved MVP proof lifecycle and retained delivery, cleanup, and done-state evidence.",
                    evidence=[
                        "PR #97 delivered the Story 3.66 implementation evidence and merged into main at a750601af1d0144507f6cc05b3ca1ada676d2d07.",
                        "Branch/worktree codex/epic-6-mvp-proof-story-3-66-bounded-implementati was cleaned up locally and remotely after merge evidence was retained.",
                        "Dev Console done evidence is retained for the Story 3.66 proof path.",
                        "Runtime evidence remains metadata-only and must not retain raw prompts, completions, reasoning traces, secrets, or unnecessary source copies.",
                    ],
                ),
            ],
            remainingItems=[
                EpicCompletionAuditItemView(
                    itemId="provider-and-review-execution",
                    label="Provider and review execution",
                    status="post_mvp_blocked_by_default",
                    summary="Epic 6 MVP does not require Claude launch or provider expansion; those remain blocked until a post-MVP approval grants them.",
                    evidence=[
                        "Claude readiness and approval packet reports do not launch Claude.",
                        "Provider expansion remains blocked beyond the approved metadata-only local/Ollama boundary.",
                    ],
                ),
                EpicCompletionAuditItemView(
                    itemId="post-mvp-autonomy",
                    label="Post-MVP autonomy",
                    status="blocked_by_default",
                    summary="Epic 6 MVP completion does not approve trusted end-to-end autonomy, issue sync, provider expansion, or unrelated cleanup.",
                    evidence=[
                        "Trusted autonomy remains policy-scoped and evidence-gated.",
                        "Remote cleanup and sync readiness report defaults remote mutation approvals to false outside approved targets.",
                    ],
                ),
            ],
            blockedOperations=[
                "Pushing follow-up hardening branches without explicit update approval.",
                "Merging, closing, or deleting GitHub PRs without matching approval.",
                "Launching additional Codex workers or Claude workers without bounded approval.",
                "Deleting local worktrees, branches, artifacts, or remote branches before retained evidence and cleanup approval for the specific target.",
                "Marking trusted autonomy complete before a separate post-MVP autonomy policy is approved.",
            ],
            recommendedApproval=(
                "Treat Epic 6 MVP as complete. Use separate post-MVP approvals for Claude launch, provider expansion, issue/story sync, trusted autonomy expansion, or additional delivery automation."
            ),
            requiredEvidence=[
                "Merged PR #86, PR #87, PR #88, PR #96, and PR #97 URLs and merge commits retained as milestone and proof evidence.",
                "Story 3.66 work item, approval packet, lane decision, local/Ollama evidence, implementation diff, verification output, and done evidence retained.",
                "PR #97 CI, merge, and cleanup evidence retained.",
                "Post-MVP authority remains separately gated.",
            ],
            stopConditions=[
                "The local worktree is dirty or contains unrelated changes.",
                "The remote branch or PR target is ambiguous.",
                "CI fails, review comments remain unresolved, or GitHub reports merge conflicts.",
                "The requested action expands into Claude launch, provider expansion, issue sync, unrelated cleanup, or post-MVP autonomy without separate approval.",
                "Evidence needed for audit or rollback would be lost.",
            ],
            nextSafeActions=[
                "Run a post-MVP retrospective or plan the next authority-hardening epic.",
                "Keep Claude, provider expansion, remote sync, and broad autonomy separately gated until their evidence exists.",
            ],
            readOnly=True,
            epicComplete=True,
            remoteDeliveryApproved=True,
            providerExecutionApproved=False,
            cleanupApproved=True,
        )

    def get_epic_6_mvp_proof_trial_report(self) -> MvpProofTrialReportView:
        return MvpProofTrialReportView(
            reportId="epic-6-mvp-proof-trial-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only MVP proof trial report for Story 3.66. It records the selected story, Candidate Work promotion, "
                "local-readonly routing evidence, merged PR #96 proof-selection evidence, PR #97 implementation delivery, "
                "cleanup evidence, and final done evidence without launching Claude, expanding providers, syncing issues, "
                "or retaining raw prompts."
            ),
            selectedStory="Story 3.66: docs/workflows/implementation-evidence-boundary.md",
            trialStatus="epic_6_mvp_proof_complete",
            steps=[
                MvpProofTrialStepView(
                    stepId="select-real-story",
                    label="Select real story",
                    status="completed",
                    summary="Story 3.66 was selected as the low-risk real BMAD story for the Epic 6 MVP proof lifecycle.",
                    requiredApproval="Selection was approved through the merged PR #96 proof-selection evidence.",
                    evidence=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "PR #96 merged proof-selection evidence into main.",
                        "Candidate Work 8afea99f-bb79-4f51-a66c-f1b02dff9005",
                        "Active WorkItem a8e43bba-a2dd-4b2e-b995-22fecea85611",
                    ],
                ),
                MvpProofTrialStepView(
                    stepId="bounded-codex-implementation",
                    label="Bounded Codex implementation",
                    status="completed",
                    summary="One isolated local Codex worktree updated only the approved proof-scope evidence/report surface for Story 3.66.",
                    requiredApproval="Approved one Story 3.66 bounded Codex implementation with pnpm run check verification and no GitHub delivery, cleanup, Claude, provider expansion, or issue sync.",
                    evidence=[
                        "Story 3.66 and the Epic 6 authority ledger retain the bounded implementation approval evidence.",
                        "Worktree branch codex/epic-6-mvp-proof-story-3-66-bounded-implementati",
                        "Focused supervisor tests passed for the changed report surfaces.",
                        "Full pnpm run check passed before PR delivery.",
                    ],
                ),
                MvpProofTrialStepView(
                    stepId="local-and-ollama-checks",
                    label="Local and Ollama checks",
                    status="completed",
                    summary="The selected WorkItem retained local-readonly routing evidence, metadata-only local evidence, and full local verification evidence.",
                    requiredApproval="No provider expansion; stay within approved local/Ollama metadata boundaries and record no raw prompts or provider payloads.",
                    evidence=[
                        "Task packet/routing preview selected local_readonly.",
                        "Local evidence explanation local-evidence-route-a8e43bba-a2dd-4b2e-b995-22fecea85611-epic-6-mvp-proof-local-evidence-task_classification",
                        "Runtime export runtime-evidence-export-a8e43bba-a2dd-4b2e-b995-22fecea85611",
                        "No secret, prompt, completion, reasoning trace, or provider payload retention is approved.",
                    ],
                ),
                MvpProofTrialStepView(
                    stepId="bounded-claude-review",
                    label="Bounded Claude review",
                    status="blocked_pending_approval",
                    summary="Claude review remains scarce and should be used only for adversarial review of the implementation diff when justified.",
                    requiredApproval="Approve one Claude review launch with review-only output and bounded context.",
                    evidence=[
                        "Claude review approval packet",
                        "Diff or file list under review",
                        "Review findings and disposition",
                    ],
                ),
                MvpProofTrialStepView(
                    stepId="github-delivery",
                    label="GitHub delivery",
                    status="completed",
                    summary="PR #97 delivered the Story 3.66 implementation evidence with green CI, clean merge state, approved merge, and approved cleanup.",
                    requiredApproval="GitHub delivery, merge, and cleanup were authorized for the Epic 6 completion goal after evidence gates passed.",
                    evidence=[
                        "https://github.com/slawdawg/Kendall-vnxt/pull/97",
                        "PR #97 CI check passed on 2026-06-11.",
                        "PR #97 merged at a750601af1d0144507f6cc05b3ca1ada676d2d07.",
                        "Branch/worktree codex/epic-6-mvp-proof-story-3-66-bounded-implementati was cleaned up locally and remotely.",
                    ],
                ),
                MvpProofTrialStepView(
                    stepId="done-evidence",
                    label="Done evidence",
                    status="completed",
                    summary="The Epic 6 proof report and completion audit retain the WorkItem done evidence and remaining post-MVP blockers.",
                    requiredApproval="No separate approval unless done evidence requires remote issue/story sync.",
                    evidence=[
                        "Runtime evidence export",
                        "Work item final state: done evidence retained for Story 3.66 proof path.",
                        "PR #97 cleanup and rollback evidence retained.",
                    ],
                ),
            ],
            approvalPackets=[
                "Selected real BMAD story id/path and PR #96 proof-selection evidence are retained.",
                "Story 3.66 Codex implementation approval completed with local verification.",
                "GitHub delivery, merge, and cleanup approvals completed for PR #97.",
                "Claude review was optional and not used for the low-risk final proof evidence.",
                "Post-MVP Claude, provider expansion, issue sync, and broad autonomy remain separately gated.",
            ],
            blockedOperations=[
                "Launching additional Codex or Claude workers without bounded approval.",
                "Using providers outside the approved Ollama endpoint/model boundary.",
                "Syncing issues or retaining raw prompts, completions, reasoning traces, secrets, or provider payloads without explicit approval.",
                "Expanding trusted autonomy beyond the approved Epic 6 completion run without a post-MVP policy.",
            ],
            stopConditions=[
                "The selected Story 3.66 scope expands beyond the approved BMAD/story artifact and approval packet.",
                "The implementation scope expands beyond the approved paths or expected outcome.",
                "Verification fails or becomes flaky.",
                "Claude usage is requested without an adversarial review need.",
                "GitHub reports unresolved review comments, failed CI, or merge conflicts for future follow-up work.",
                "Cleanup would remove evidence needed for rollback or audit.",
            ],
            nextSafeActions=[
                "Use this report as the retained Epic 6 MVP completion evidence.",
                "Run a retrospective or create the next post-MVP hardening plan.",
                "Keep Claude, provider expansion, remote sync, and broad autonomy separately gated until their evidence exists.",
            ],
            readOnly=True,
            codexLaunchApproved=True,
            claudeLaunchApproved=False,
            providerExpansionApproved=False,
            autonomousDeliveryApproved=False,
        )

    def get_delivery_readiness_policy_report(self) -> DeliveryReadinessPolicyReportView:
        return DeliveryReadinessPolicyReportView(
            reportId="delivery-readiness-policy-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Read-only policy for the managed recipe delivery checkpoint. It explains how PR, CI, merge, "
                "and explicit local-only waiver evidence make a work item ready for operator review approval without executing remote delivery."
            ),
            statusPolicy=[
                DeliveryReadinessPolicyItemView(
                    itemId="pull-request-status",
                    label="Pull request evidence",
                    status="record_only",
                    summary="PR status must be recorded or ready before remote delivery can satisfy the review gate.",
                    evidence=[
                        "WorkItemDeliveryReadinessView.pullRequestStatus supports not_recorded, recorded, ready, and waived.",
                        "Delivery readiness updates are recorded through POST /work-items/{id}/delivery-readiness.",
                    ],
                ),
                DeliveryReadinessPolicyItemView(
                    itemId="ci-status",
                    label="CI evidence",
                    status="record_only",
                    summary="CI status is review evidence and does not trigger test execution from the report surface.",
                    evidence=[
                        "WorkItemDeliveryReadinessView.ciStatus supports not_recorded, pending, passed, failed, and waived.",
                        "The dashboard delivery gate displays CI state before review approval.",
                    ],
                ),
                DeliveryReadinessPolicyItemView(
                    itemId="merge-status",
                    label="Merge evidence",
                    status="record_only",
                    summary="Merge status must be ready or merged for remote delivery readiness unless an explicit waiver is recorded.",
                    evidence=[
                        "WorkItemDeliveryReadinessView.mergeStatus supports not_recorded, ready, merged, blocked, and waived.",
                        "readyForApproval is true only for recorded or ready PR evidence plus ready or merged merge evidence, or for a waiver with a reason.",
                    ],
                ),
            ],
            waiverPolicy=[
                DeliveryReadinessPolicyItemView(
                    itemId="local-only-waiver",
                    label="Local-only delivery waiver",
                    status="operator_explicit",
                    summary="A waiver can satisfy the review gate only when the operator records a reason.",
                    evidence=[
                        "deliveryWaived must be true and deliveryWaiverReason must be present.",
                        "Waivers are record-only evidence and are not remote automation approval.",
                    ],
                ),
                DeliveryReadinessPolicyItemView(
                    itemId="checkpoint-form-only",
                    label="Dedicated checkpoint form",
                    status="required",
                    summary="Managed next action execution redirects readiness updates to the delivery readiness checkpoint form.",
                    evidence=[
                        "Managed next action rejects record_delivery_readiness and instructs operators to use the checkpoint form.",
                        "The report is read-only and does not mutate delivery readiness metadata.",
                    ],
                ),
            ],
            stopLines=[
                "This report is not approval for remote delivery automation, GitHub writes, worker execution, provider calls, or process launch.",
                "Do not treat a local-only waiver as proof that remote PR, CI, or merge evidence exists.",
                "Record delivery readiness only through the work-item delivery readiness checkpoint form.",
            ],
            nextSafeActions=[
                "Use this report to review delivery-readiness rules before changing the work-item delivery gate.",
                "Keep delivery readiness dashboard controls, supervisor tests, and report catalog references aligned.",
                "Use the GitHub workflow policy report for Git/GCM and connector posture before remote delivery work.",
            ],
            readOnly=True,
            executionAuthorityApproved=False,
            remoteAutomationApproved=False,
        )

    def get_execution_configuration_checks(self) -> ExecutionConfigurationChecksView:
        workers = self.worker_registry.list_workers()
        ollama_state = self._ollama_provider_gate_state()
        subscription_launch_targets = self._subscription_launch_target_views()

        def affected_by_adapter(adapter_type: str) -> list[str]:
            return [worker.worker_id for worker in workers if worker.adapter_type.value == adapter_type]

        checks = [
            self._execution_configuration_check(
                check_id="subscription-agent-launch",
                label="Subscription agent launch",
                enabled=self.settings.allow_subscription_agent_launch,
                disabled_reason="subscription_agent_process_launch_not_enabled",
                affected_workers=affected_by_adapter("subscription_agent"),
                evidence=[
                    "Subscription launch stubs can create instructions only.",
                    "No Codex, Claude, Gemini, Antigravity, or subscription CLI process launch is enabled.",
                    "Target-specific subscription launch gates are reported separately from handoff packages.",
                ],
                launch_targets=subscription_launch_targets,
                process_launch_allowed=False,
            ),
            self._execution_configuration_check(
                check_id="subscription-launch-targets",
                label="Subscription launch target registry",
                enabled=False,
                disabled_reason="subscription_launch_targets_not_enabled",
                affected_workers=affected_by_adapter("subscription_agent"),
                evidence=[
                    "Approved target entries are present only as disabled registry metadata.",
                    "A target remains denied unless the broad launch gate, target-specific gate, policy id, and command template id all match.",
                    "Subscription handoff packages remain separate package-only artifacts.",
                ],
                launch_targets=subscription_launch_targets,
                process_launch_allowed=False,
            ),
            self._execution_configuration_check(
                check_id="local-provider-calls",
                label="Local provider calls",
                enabled=self.settings.allow_local_provider_calls,
                disabled_reason="local_provider_http_calls_not_enabled",
                affected_workers=[
                    worker.worker_id
                    for worker in workers
                    if worker.adapter_type.value == "local_openai_compatible" and worker.disabled_reason
                ],
                evidence=[
                    "Ollama, LM Studio, vLLM, and llama.cpp registry entries remain disabled.",
                    "Mock local read-only evidence does not call provider HTTP endpoints or model APIs.",
                    "Provider-specific gates must be satisfied before any local provider can become adapter-ready.",
                ],
                provider_calls_allowed=bool(ollama_state["provider_calls_allowed"]),
                model_calls_allowed=bool(ollama_state["model_calls_allowed"]),
            ),
            self._execution_configuration_check(
                check_id="ollama-provider-gate",
                label="Ollama provider gate",
                enabled=bool(ollama_state["enabled"]),
                disabled_reason=ollama_state["disabled_reason"],  # type: ignore[arg-type]
                affected_workers=["local.ollama.disabled"],
                evidence=[
                    "SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS is the broad local-provider gate.",
                    "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS defaults to false and gates only Ollama.",
                    "SUPERVISOR_OLLAMA_MODEL_ID is required before adapter readiness; there is no hardcoded default model.",
                    "SUPERVISOR_OLLAMA_ENDPOINT_URL must match the approved VM-to-host endpoint exactly.",
                    f"Approved endpoint: {self.settings.ollama_approved_endpoint_url}.",
                    f"Approved model id: {self.settings.ollama_approved_model_id}.",
                    f"Registry state: {ollama_state['registry_state']}.",
                    "Story 4.4 approval allows only this Ollama endpoint/model; LM Studio, vLLM, llama.cpp, remote providers, premium, commands, source mutation, credentials, and subscription launch remain disabled.",
                ],
                provider_calls_allowed=bool(ollama_state["provider_calls_allowed"]),
                model_calls_allowed=bool(ollama_state["model_calls_allowed"]),
            ),
            self._execution_configuration_check(
                check_id="premium-execution",
                label="Premium execution",
                enabled=self.settings.allow_premium_execution,
                disabled_reason="premium_execution_not_enabled",
                affected_workers=affected_by_adapter("premium_approval"),
                evidence=[
                    "Premium approval artifacts remain review packages only.",
                    "No premium model invocation is enabled by approval artifacts.",
                ],
                premium_execution_allowed=self.settings.allow_premium_execution,
                provider_calls_allowed=self.settings.allow_premium_execution,
                model_calls_allowed=self.settings.allow_premium_execution,
            ),
            self._execution_configuration_check(
                check_id="arbitrary-shell-execution",
                label="Arbitrary shell execution",
                enabled=self.settings.allow_arbitrary_shell_execution,
                disabled_reason="arbitrary_shell_execution_not_enabled",
                affected_workers=[worker.worker_id for worker in workers],
                evidence=[
                    "Execution attempts and local read-only packets keep commands disabled.",
                    "Guarded utility behavior remains limited to supervisor-owned internal functions.",
                ],
                command_execution_allowed=self.settings.allow_arbitrary_shell_execution,
            ),
            self._execution_configuration_check(
                check_id="worker-source-mutation",
                label="Worker source mutation",
                enabled=self.settings.allow_worker_source_mutation,
                disabled_reason="worker_source_mutation_not_enabled",
                affected_workers=[worker.worker_id for worker in workers],
                evidence=[
                    "Execution attempt workspace isolation plans keep write roots empty.",
                    "Source mutation remains deferred until isolated workspace execution is approved.",
                ],
                source_mutation_allowed=self.settings.allow_worker_source_mutation,
            ),
            self._execution_configuration_check(
                check_id="worker-network",
                label="Worker network access",
                enabled=self.settings.allow_worker_network,
                disabled_reason="worker_network_access_not_enabled",
                affected_workers=[worker.worker_id for worker in workers],
                evidence=[
                    "Worker attempts do not receive network permission in this phase.",
                    "Provider endpoints remain denied unless later policy approves them.",
                ],
                network_allowed=self.settings.allow_worker_network,
            ),
            self._execution_configuration_check(
                check_id="worker-credential-access",
                label="Worker credential access",
                enabled=self.settings.allow_worker_credentials,
                disabled_reason="worker_credential_access_not_enabled",
                affected_workers=[worker.worker_id for worker in workers],
                evidence=[
                    "Workspace isolation plans forbid credential access.",
                    "Prompt/evidence packets must not include secrets, tokens, or raw environment values.",
                ],
                credential_access_allowed=self.settings.allow_worker_credentials,
            ),
        ]
        all_disabled = all(not check.enabled for check in checks)
        summary = (
            "Real worker execution remains disabled by configuration."
            if all_disabled
            else "One or more execution authority gates are enabled; review policy before allowing real worker execution."
        )
        return ExecutionConfigurationChecksView(
            summary=summary,
            allDisabled=all_disabled,
            generatedAt=datetime.now(timezone.utc),
            checks=checks,
        )

    def _ollama_provider_gate_state(self) -> dict[str, object]:
        broad_gate_enabled = self.settings.allow_local_provider_calls
        provider_gate_enabled = self.settings.allow_ollama_provider_calls
        endpoint_url = (self.settings.ollama_endpoint_url or "").strip()
        approved_endpoint_url = self.settings.ollama_approved_endpoint_url.strip()
        model_id = (self.settings.ollama_model_id or "").strip()
        approved_model_id = self.settings.ollama_approved_model_id.strip()
        endpoint_configured = bool(endpoint_url)
        endpoint_approved = endpoint_url == approved_endpoint_url
        model_id_configured = bool(model_id)
        model_id_approved = model_id == approved_model_id

        if not broad_gate_enabled and not provider_gate_enabled:
            registry_state = "disabled"
            disabled_reason = "ollama_provider_gate_not_enabled"
            adapter_ready = False
        elif broad_gate_enabled and not provider_gate_enabled:
            registry_state = "disabled"
            disabled_reason = "ollama_provider_gate_not_enabled"
            adapter_ready = False
        elif provider_gate_enabled and not broad_gate_enabled:
            registry_state = "disabled"
            disabled_reason = "local_provider_http_calls_not_enabled"
            adapter_ready = False
        elif not endpoint_configured:
            registry_state = "configured_ollama_gate_missing_endpoint"
            disabled_reason = "ollama_endpoint_not_configured"
            adapter_ready = False
        elif not endpoint_approved:
            registry_state = "configured_ollama_gate_unapproved_endpoint"
            disabled_reason = "ollama_endpoint_not_approved"
            adapter_ready = False
        elif not model_id_configured:
            registry_state = "configured_ollama_gate_missing_model"
            disabled_reason = "ollama_model_id_not_configured"
            adapter_ready = False
        elif not model_id_approved:
            registry_state = "configured_ollama_gate_unapproved_model"
            disabled_reason = "ollama_model_id_not_approved"
            adapter_ready = False
        else:
            registry_state = "enabled_approved_host_endpoint"
            disabled_reason = None
            adapter_ready = True
        enabled = adapter_ready and disabled_reason is None

        return {
            "broad_gate_enabled": broad_gate_enabled,
            "provider_gate_enabled": provider_gate_enabled,
            "endpoint_configured": endpoint_configured,
            "endpoint_approved": endpoint_approved,
            "model_id_configured": model_id_configured,
            "model_id_approved": model_id_approved,
            "registry_state": registry_state,
            "disabled_reason": disabled_reason,
            "adapter_ready": adapter_ready,
            "enabled": enabled,
            "provider_calls_allowed": enabled,
            "model_calls_allowed": enabled,
        }

    def _subscription_launch_target_views(self) -> list[dict[str, object]]:
        target_gate_enabled = {
            "codex.subscription.disabled": self.settings.allow_codex_subscription_agent_launch,
            "claude.subscription.disabled": self.settings.allow_claude_subscription_agent_launch,
            "gemini.subscription.disabled": self.settings.allow_gemini_subscription_agent_launch,
        }
        targets = []
        for target in self.subscription_launch_registry.list_targets():
            target_specific_gate = target_gate_enabled.get(target.target_id, False)
            enabled = bool(self.settings.allow_subscription_agent_launch and target_specific_gate and target.enabled)
            targets.append(
                {
                    "targetId": target.target_id,
                    "displayName": target.display_name,
                    "workerId": target.worker_id,
                    "launchPolicyId": target.launch_policy_id,
                    "commandTemplateId": target.command_template_id,
                    "enabled": enabled,
                    "disabledReason": None if enabled else target.disabled_reason,
                    "broadGateEnabled": self.settings.allow_subscription_agent_launch,
                    "targetSpecificGateEnabled": target_specific_gate,
                    "approvalRequired": target.approval_required,
                    "processLaunchAllowed": False,
                    "commandExecutionAllowed": False,
                    "credentialAccessAllowed": False,
                    "externalSendAllowed": False,
                }
            )
        return targets

    def get_threat_boundary(self) -> ThreatBoundaryView:
        redaction_boundary = [
            "Use workflow event summaries, work item metadata, route decisions, attempt metadata, and approved recipe metadata only.",
            "Do not include secrets, credentials, tokens, environment variables, local secret files, raw provider payloads, or unrelated local files.",
            "Do not include external provider prompts or completions unless a later provider-specific policy explicitly approves retention.",
            "Reference artifact paths and summaries instead of embedding filesystem snapshots.",
        ]
        allowed_command_classes = [
            "supervisor_internal_utility_functions",
            "configured_recipe_commands_after_recipe_gates",
            "git_metadata_reads_for_policy_checks",
        ]
        blocked_command_classes = [
            "subscription_agent_process_launch",
            "local_provider_http_calls",
            "premium_provider_execution",
            "arbitrary_shell_commands",
            "worker_source_mutation_commands",
            "network_commands",
            "credential_or_secret_reads",
        ]
        rules = [
            ThreatBoundaryRuleView(
                ruleId="prompt-redaction-boundary",
                label="Prompt and evidence redaction",
                status="active",
                summary="Future prompt construction is limited to approved evidence summaries and metadata.",
                blockedReason="prompt_redaction_boundary_required",
                evidence=[
                    "Local evidence packets carry redaction notes.",
                    "Runtime evidence exports exclude credentials and provider payloads.",
                ],
            ),
            ThreatBoundaryRuleView(
                ruleId="command-allowlist",
                label="Command allowlist",
                status="blocked_by_default",
                summary="Worker command execution is denied except existing supervisor-owned internal utility behavior and gated recipe automation.",
                blockedReason="command_execution_not_allowlisted",
                evidence=[
                    "Execution attempts set commandsAllowed=false.",
                    "Arbitrary shell execution is disabled by configuration.",
                ],
            ),
            ThreatBoundaryRuleView(
                ruleId="provider-network-deny",
                label="Provider and network deny",
                status="blocked_by_default",
                summary="Local provider endpoints, model APIs, and worker network access remain denied.",
                blockedReason="provider_network_access_not_enabled",
                evidence=[
                    "Local provider registry entries remain disabled.",
                    "Execution configuration checks deny provider/model/network access.",
                ],
            ),
            ThreatBoundaryRuleView(
                ruleId="credential-deny",
                label="Credential deny",
                status="blocked_by_default",
                summary="Worker credential, token, environment secret, and account access remain forbidden.",
                blockedReason="credential_access_forbidden",
                evidence=[
                    "Workspace isolation plans forbid credential access.",
                    "Runtime evidence exports exclude environment variables and credential stores.",
                ],
            ),
            ThreatBoundaryRuleView(
                ruleId="artifact-boundary",
                label="Artifact boundary",
                status="active",
                summary="Artifacts are referenced by path and summary until a later policy approves broader snapshot export.",
                blockedReason="artifact_snapshot_export_not_enabled",
                evidence=[
                    "Attempt artifacts use artifactRefs metadata.",
                    "Runtime evidence exports exclude filesystem snapshots outside recorded artifact references.",
                ],
            ),
        ]
        return ThreatBoundaryView(
            boundaryId="supervisor-worker-threat-boundary-v1",
            status="blocked_by_default",
            generatedAt=datetime.now(timezone.utc),
            summary="Real worker/provider execution remains denied until prompt, command, provider, network, credential, and artifact boundaries are explicitly approved by later policy.",
            redactionBoundary=redaction_boundary,
            promptConstructionSources=[
                "work_item_metadata",
                "workflow_event_summaries",
                "routing_decision_metadata",
                "execution_attempt_metadata",
                "approved_recipe_metadata",
                "reviewed_artifact_references",
            ],
            allowedCommandClasses=allowed_command_classes,
            blockedCommandClasses=blocked_command_classes,
            providerEndpointPolicy="deny_all_local_and_remote_provider_endpoints_until_provider_specific_policy_approval",
            credentialPolicy="forbid_worker_access_to_credentials_tokens_environment_secrets_and_account_security_state",
            artifactPolicy="record_artifact_references_and_summaries_only_until_snapshot_export_is_approved",
            rules=rules,
        )

    def _execution_configuration_check(
        self,
        *,
        check_id: str,
        label: str,
        enabled: bool,
        disabled_reason: str,
        affected_workers: list[str],
        evidence: list[str],
        launch_targets: list[dict[str, object]] | None = None,
        process_launch_allowed: bool = False,
        provider_calls_allowed: bool = False,
        model_calls_allowed: bool = False,
        premium_execution_allowed: bool = False,
        command_execution_allowed: bool = False,
        source_mutation_allowed: bool = False,
        network_allowed: bool = False,
        credential_access_allowed: bool = False,
    ) -> ExecutionConfigurationCheckView:
        return ExecutionConfigurationCheckView(
            checkId=check_id,
            label=label,
            status="enabled" if enabled else "disabled",
            enabled=enabled,
            disabledReason=None if enabled else disabled_reason,
            affectedWorkers=affected_workers,
            evidence=evidence,
            launchTargets=launch_targets or [],
            processLaunchAllowed=process_launch_allowed,
            providerCallsAllowed=provider_calls_allowed,
            modelCallsAllowed=model_calls_allowed,
            premiumExecutionAllowed=premium_execution_allowed,
            commandExecutionAllowed=command_execution_allowed,
            sourceMutationAllowed=source_mutation_allowed,
            networkAllowed=network_allowed,
            credentialAccessAllowed=credential_access_allowed,
        )

    def _to_worker_registry_entry_view(self, worker: WorkerRegistryEntry) -> WorkerRegistryEntryView:
        return WorkerRegistryEntryView(
            workerId=worker.worker_id,
            displayName=worker.display_name,
            lane=worker.lane.value,
            adapterType=worker.adapter_type.value,
            capabilities=list(worker.capabilities),
            permissions=list(worker.permissions),
            health=worker.health.value,
            queueDepth=worker.queue_depth,
            maxParallelJobs=worker.max_parallel_jobs,
            disabledReason=worker.disabled_reason,
        )
    async def list_work_item_events(self, session: AsyncSession, work_item_id: str) -> list[WorkflowEvent]:
        result = await session.execute(
            select(WorkflowEvent)
            .where(WorkflowEvent.work_item_id == work_item_id)
            .order_by(WorkflowEvent.created_at.desc())
        )
        return list(result.scalars())

    async def list_execution_attempts(self, session: AsyncSession, work_item_id: str) -> list[ExecutionAttemptView]:
        result = await session.execute(
            select(ExecutionAttempt)
            .where(ExecutionAttempt.work_item_id == work_item_id)
            .order_by(ExecutionAttempt.created_at.desc())
        )
        return [self._to_execution_attempt_view(attempt) for attempt in result.scalars()]

    def _runtime_evidence_cross_checks(self) -> list[RuntimeEvidenceCrossCheckView]:
        return [
            RuntimeEvidenceCrossCheckView(
                label="Review index",
                report="GET /supervisor/runtime-evidence-review-report",
                dashboardAnchor="/controls#runtime-evidence-review-report",
                relatedDoc="docs/workflows/implementation-evidence-boundary.md",
                reason="Confirm the work item is indexed before changing workflow state.",
            ),
            RuntimeEvidenceCrossCheckView(
                label="Authority boundary",
                report="GET /supervisor/execution-readiness-report",
                dashboardAnchor="/controls#execution-readiness-report",
                relatedDoc="docs/workflows/execution-authority-boundary.md",
                reason="Confirm review work does not grant execution, provider, command, network, or credential authority.",
            ),
            RuntimeEvidenceCrossCheckView(
                label="Documentation authority",
                report="GET /supervisor/documentation-authority-report",
                dashboardAnchor="/controls#documentation-authority-report",
                relatedDoc="docs/workflows/product-requirements-boundary.md",
                reason="Confirm planning or approval documents are evidence only unless explicit approval is recorded.",
            ),
            RuntimeEvidenceCrossCheckView(
                label="Development runway",
                report="GET /supervisor/development-runway-report",
                dashboardAnchor="/controls#development-runway-report",
                relatedDoc="docs/workflows/implementation-evidence-boundary.md",
                reason="Confirm the next work stays inside a ready read-only evidence or report-navigation slice.",
            ),
        ]

    async def get_runtime_evidence_review_report(self, session: AsyncSession) -> RuntimeEvidenceReviewReportView:
        items = await self.list_work_items(session)
        cross_checks = self._runtime_evidence_cross_checks()
        related_reports = [
            "GET /work-items/{id}/runtime-evidence-export",
            "GET /supervisor/runtime-evidence-review-report",
            "GET /supervisor/report-catalog",
            "GET /supervisor/development-runway-report",
            "GET /supervisor/execution-readiness-report",
            "GET /supervisor/authority-readiness-matrix-report",
        ]
        related_docs = [
            "docs/workflows/implementation-evidence-boundary.md",
            "docs/workflows/implementation-evidence-boundary.md",
            "docs/workflows/implementation-evidence-boundary.md",
            "docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md",
        ]
        review_dashboard_anchors = [
            "/controls#runtime-evidence-review-report",
            "/controls#development-runway-report",
            "/controls#supervisor-report-catalog",
        ]
        work_item_reviews: list[RuntimeEvidenceReviewWorkItemView] = []

        for item in items:
            attempts = await self.list_execution_attempts(session, item.id)
            events = await self.list_work_item_events(session, item.id)
            latest_event_at = events[0].created_at if events else item.last_event_at
            needs_attention, attention_reason = self._derive_attention(item)
            terminal_or_blocked = item.state in {
                WorkflowState.REVIEWING.value,
                WorkflowState.AWAITING_AUDIT.value,
                WorkflowState.BLOCKED.value,
                WorkflowState.NEEDS_REWORK.value,
            }
            if item.state == WorkflowState.BLOCKED.value:
                review_priority = "P0"
                review_reason = item.blocked_reason or "Blocked work item requires evidence review before any next action."
            elif needs_attention:
                review_priority = "P0"
                review_reason = attention_reason or "Work item needs operator attention."
            elif terminal_or_blocked or attempts:
                review_priority = "P1"
                review_reason = "Runtime evidence is available for review before changing workflow state."
            else:
                review_priority = "P2"
                review_reason = "Runtime evidence exists, but no attempt-specific review signal is active."

            work_item_reviews.append(
                RuntimeEvidenceReviewWorkItemView(
                    workItemId=item.id,
                    title=item.title,
                    state=item.state,
                    riskLevel=item.risk_level,
                    needsAttention=needs_attention,
                    attemptCount=len(attempts),
                    eventCount=len(events),
                    relatedReportCount=len(related_reports),
                    relatedReports=related_reports,
                    relatedDocs=related_docs,
                    dashboardAnchors=review_dashboard_anchors,
                    latestEventAt=self._normalize_timestamp(latest_event_at) if latest_event_at else None,
                    runtimeExportHref=f"/work-items/{item.id}#runtime-evidence-export",
                    reviewPriority=review_priority,
                    reviewReason=review_reason,
                    recommendedAction=(
                        "Review runtime evidence export, related reports, and workflow history before resolving the blocker."
                        if review_priority == "P0"
                        else "Review runtime evidence export before approving, reworking, or closing the item."
                    ),
                )
            )

        priority_rank = {"P0": 0, "P1": 1, "P2": 2}
        review_queue = sorted(
            work_item_reviews,
            key=lambda entry: (
                priority_rank.get(entry.reviewPriority, 9),
                entry.latestEventAt is None,
                entry.latestEventAt or datetime.min.replace(tzinfo=timezone.utc),
            ),
        )[:8]

        return RuntimeEvidenceReviewReportView(
            reportId="runtime-evidence-review-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary="Read-only index of work-item runtime evidence exports, review priority, evidence counts, and related report links.",
            workItems=work_item_reviews,
            reviewQueue=review_queue,
            crossChecks=cross_checks,
            relatedReports=related_reports,
            relatedDocs=related_docs,
            dashboardAnchors=review_dashboard_anchors,
            stopLines=[
                "Runtime evidence review is not execution-authority approval.",
                "Do not launch processes, call providers, run arbitrary worker commands, mutate source, use network access, or read credentials from this review index.",
                "Blocked authority stories remain blocked until explicit operator approval names authority and scope.",
            ],
            nextSafeActions=[
                "Open the highest-priority review queue item before changing workflow state.",
                "Use related supervisor reports to cross-check authority boundaries before approving review work.",
                "Keep this index aligned with runtime export, report catalog, dashboard detail, and development runway surfaces.",
            ],
        )

    async def get_runtime_evidence_export(self, session: AsyncSession, work_item_id: str) -> RuntimeEvidenceExportView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        attempts = await self.list_execution_attempts(session, work_item_id)
        events = [
            self._runtime_evidence_export_event_view(self.to_event_view(event))
            for event in await self.list_work_item_events(session, work_item_id)
        ]
        related_reports = [
            "GET /supervisor/execution-configuration-checks",
            "GET /supervisor/threat-boundary",
            "GET /supervisor/execution-readiness-report",
            "GET /supervisor/documentation-authority-report",
            "GET /supervisor/verification-readiness-report",
            "GET /supervisor/authority-readiness-matrix-report",
            "GET /supervisor/dashboard-e2e-report",
            "GET /supervisor/report-catalog",
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
            "GET /supervisor/execution-state-boundary",
            "GET /supervisor/disabled-provider-proofs",
        ]
        git_backed_evidence = [
            "docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md",
            "docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md",
            "docs/workflows/implementation-evidence-boundary.md",
            "docs/workflows/product-requirements-boundary.md#supervisor-execution-authority-expansion-boundary",
            "docs/workflows/execution-authority-boundary.md",
            "docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md",
            "docs/architecture/kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md",
            "services/supervisor/src/supervisor/api/main.py",
            "services/supervisor/src/supervisor/application/service.py",
            "packages/contracts/src/api.ts",
        ]
        cross_checks = self._runtime_evidence_cross_checks()
        return RuntimeEvidenceExportView(
            exportId=f"runtime-evidence-export-{work_item_id}",
            format="application/json",
            version="1.0",
            generatedAt=datetime.now(timezone.utc),
            workItem=self.to_work_item_view(item),
            executionAttempts=attempts,
            workflowEvents=events,
            boundary=RuntimeEvidenceExportBoundaryView(
                localRuntimeState=[
                    "supervisor_database.work_items",
                    "supervisor_database.workflow_events",
                    "supervisor_database.execution_attempts",
                    "runtime-generated export timestamps and identifiers",
                ],
                gitBackedEvidence=git_backed_evidence,
                relatedSupervisorReports=related_reports,
                excludedState=[
                    "environment variables and credential stores",
                    "provider HTTP request/response bodies",
                    "model prompts or completions from external providers",
                    "raw Ollama prompts, completions, reasoning fields, and provider payloads",
                    "raw subscription-agent stdout and stderr",
                    "subscription-agent inherited environment values",
                    "filesystem snapshots outside recorded artifact references",
                    "background process output not recorded as workflow events",
                ],
            ),
            safety=RuntimeEvidenceExportSafetyView(),
            subscriptionLaunch=self._runtime_evidence_subscription_launch_summary(events),
            reviewManifest=RuntimeEvidenceReviewManifestView(
                manifestId=f"runtime-evidence-review-manifest-{work_item_id}",
                summary="Review manifest for export contents, evidence counts, retention boundaries, and authority stop lines.",
                evidenceCounts={
                    "executionAttempts": len(attempts),
                    "workflowEvents": len(events),
                    "relatedSupervisorReports": len(related_reports),
                    "gitBackedEvidence": len(git_backed_evidence),
                    "excludedState": 8,
                },
                reviewChecklist=[
                    "Confirm work-item state, attempts, and workflow events match the review question.",
                    "Review related supervisor reports before changing execution-authority posture.",
                    "Confirm excluded state is not needed for the current review.",
                    "Keep the export attached to the work item instead of copying secrets or provider payloads into notes.",
                ],
                retentionNotes=[
                    "Export includes supervisor database evidence and git-backed references.",
                    "Export excludes credential stores, provider request/response bodies, and external filesystem snapshots.",
                    "Ollama timeout and cancellation summaries are metadata-only; raw prompts and completions remain excluded.",
                    "Subscription launch lifecycle evidence is metadata-only; raw process output, inherited environment, and session state remain excluded.",
                    "Generated timestamps and identifiers are local runtime evidence, not durable Git state.",
                ],
                stopLines=[
                    "The review manifest is not execution-authority approval.",
                    "Export review must not enable provider/model calls or process launch.",
                    "Export review must not grant worker commands, source mutation, network access, or credential access.",
                ],
            ),
            reviewNavigator=[
                RuntimeEvidenceReviewNavigatorItemView(
                    itemId="review-runtime-state",
                    label="Runtime state",
                    priority="P0",
                    target="Confirm work item, attempts, and workflow event evidence.",
                    summary="Start with runtime state before reading report references or changing the work item.",
                    evidence=[
                        f"{len(attempts)} execution attempts included.",
                        f"{len(events)} workflow events included.",
                        "Local runtime state is limited to supervisor database rows and generated export identifiers.",
                    ],
                    relatedReports=["GET /work-items/{id}/runtime-evidence-export"],
                    relatedDocs=["docs/workflows/implementation-evidence-boundary.md"],
                    dashboardAnchors=["#execution-attempts", "#workflow-history"],
                    crossChecks=cross_checks,
                ),
                RuntimeEvidenceReviewNavigatorItemView(
                    itemId="review-authority-boundary",
                    label="Authority boundary",
                    priority="P0",
                    target="Confirm the export does not approve provider calls, process launch, premium execution, commands, source mutation, network, or credentials.",
                    summary="Use safety flags and related reports to keep review work above the execution-authority line.",
                    evidence=[
                        "All runtime evidence export safety authority flags remain disabled.",
                        f"{len(related_reports)} related supervisor reports are available for cross-checks.",
                        "Excluded state keeps credentials, provider payloads, and external filesystem snapshots out of the export.",
                    ],
                    relatedReports=[
                        "GET /supervisor/execution-readiness-report",
                        "GET /supervisor/threat-boundary",
                        "GET /supervisor/documentation-authority-report",
                    ],
                    relatedDocs=[
                        "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                    ],
                    dashboardAnchors=["#runtime-evidence-export"],
                    stopLines=[
                        "Review navigation is not execution-authority approval.",
                        "Do not enable provider/model calls or process launch from runtime export review.",
                    ],
                    crossChecks=cross_checks,
                ),
                RuntimeEvidenceReviewNavigatorItemView(
                    itemId="review-git-backed-evidence",
                    label="Git-backed evidence",
                    priority="P1",
                    target="Inspect the story, architecture, PRD, and source references that explain the runtime evidence boundary.",
                    summary="Use git-backed evidence to understand why the export includes or excludes each evidence class.",
                    evidence=[
                        f"{len(git_backed_evidence)} git-backed evidence references included.",
                        "Runtime evidence review manifest and navigator stories are included in the evidence trail.",
                        "Source references point to supervisor API/service and shared contracts.",
                    ],
                    relatedReports=[
                        "GET /supervisor/report-catalog",
                        "GET /supervisor/maintenance-action-plan-report",
                        "GET /supervisor/development-runway-report",
                        "GET /supervisor/runtime-evidence-review-report",
                        "GET /supervisor/safe-development-backlog",
                    ],
                    relatedDocs=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                    ],
                    dashboardAnchors=["#runtime-evidence-export"],
                    crossChecks=cross_checks,
                ),
                RuntimeEvidenceReviewNavigatorItemView(
                    itemId="review-ollama-no-call-prep",
                    label="Ollama approved host provider lane",
                    priority="P1",
                    target="Review Ollama gate, approved endpoint/model, prompt-retention, timeout, and cancellation evidence.",
                    summary="Stories 4.1-4.4 now allow only the approved VM-to-host Ollama endpoint/model with metadata-only retention.",
                    evidence=[
                        "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS defaults to false.",
                        "Approved endpoint: http://192.168.1.128:11434/v1/chat/completions.",
                        "Approved model id: qwen3:14b.",
                        "Raw Ollama prompts, completions, reasoning fields, and provider payloads are excluded from workflow events and runtime exports.",
                        "cancel_requested -> request_abort_recorded",
                        "retry_requires_new_route_decision_and_fresh_approval",
                    ],
                    relatedReports=[
                        "GET /supervisor/execution-configuration-checks",
                        "GET /supervisor/disabled-provider-proofs",
                        "GET /supervisor/threat-boundary",
                    ],
                    relatedDocs=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                    ],
                    dashboardAnchors=["#runtime-evidence-export", "/controls#execution-readiness-report"],
                    stopLines=[
                        "Ollama provider/model calls are allowed only for the approved host endpoint and qwen3:14b model.",
                        "Do not add endpoint discovery, model discovery, raw payload retention, or any other provider/model authority without a successor approval.",
                    ],
                    crossChecks=cross_checks,
                ),
                RuntimeEvidenceReviewNavigatorItemView(
                    itemId="review-subscription-launch-prep",
                    label="Subscription launch prep",
                    priority="P1",
                    target="Review disabled subscription launch target, approval, workspace, output, and lifecycle evidence without approving process launch.",
                    summary="Stories 5.1-5.4 add non-executing subscription launch preparation only; Story 5.5 remains required for any supervised process.",
                    evidence=[
                        "SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH and target-specific gates default to false.",
                        "Launch approval bindings require route, attempt, workspace, policy, target, command template, actor, timestamp, and expiry evidence.",
                        "Workspace and output contracts exclude credentials, sessions, inherited environment values, and raw stdout/stderr.",
                        "Disabled lifecycle evidence records cancellation, timeout, cleanup, and terminal states without process launch.",
                    ],
                    relatedReports=[
                        "GET /supervisor/execution-configuration-checks",
                        "GET /supervisor/threat-boundary",
                        "GET /supervisor/execution-readiness-report",
                    ],
                    relatedDocs=[
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                        "docs/workflows/implementation-evidence-boundary.md",
                    ],
                    dashboardAnchors=["#runtime-evidence-export", "#execution-attempts", "/controls#execution-readiness-report"],
                    stopLines=[
                        "Subscription launch prep keeps process launch disabled.",
                        "Do not add a command runner, process supervisor, credential/session access, shell execution, or external send before Story 5.5 approval.",
                    ],
                    crossChecks=cross_checks,
                ),
            ],
        )

    def _runtime_evidence_subscription_launch_summary(
        self,
        events: list[WorkflowEventView],
    ) -> RuntimeEvidenceSubscriptionLaunchView:
        subscription_event_types = {
            "routing.subscription_agent_launch_stub_created",
            "routing.subscription_agent_launch_rejected",
            "execution_attempt.subscription_launch_fixture_started",
            "execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
            "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
            "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
            "execution_attempt.subscription_launch_fixture_completed",
            "execution_attempt.verification_recorded",
        }
        priority_by_type = {
            "execution_attempt.verification_recorded": 7,
            "execution_attempt.subscription_launch_fixture_completed": 6,
            "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded": 5,
            "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded": 4,
            "execution_attempt.subscription_launch_fixture_timeout_policy_recorded": 3,
            "routing.subscription_agent_launch_rejected": 2,
            "execution_attempt.subscription_launch_fixture_started": 1,
            "routing.subscription_agent_launch_stub_created": 0,
        }
        subscription_events = [
            event
            for event in events
            if event.eventType in subscription_event_types
            and (
                event.eventType != "execution_attempt.verification_recorded"
                or bool(self._safe_dict(event.payload.get("subscriptionLaunchVerification")))
            )
        ]
        if not subscription_events:
            return RuntimeEvidenceSubscriptionLaunchView(
                relatedReports=[
                    "GET /work-items/{id}/runtime-evidence-export",
                    "GET /supervisor/execution-readiness-report",
                    "GET /supervisor/threat-boundary",
                ],
            )
        latest_event = sorted(
            subscription_events,
            key=lambda event: (priority_by_type.get(event.eventType, -1), event.createdAt),
            reverse=True,
        )[0]
        lifecycle_events = [event for event in subscription_events if event.eventType != "execution_attempt.verification_recorded"]
        lifecycle_event = (
            sorted(
                lifecycle_events,
                key=lambda event: (priority_by_type.get(event.eventType, -1), event.createdAt),
                reverse=True,
            )[0]
            if lifecycle_events
            else latest_event
        )
        verification_events = [event for event in subscription_events if event.eventType == "execution_attempt.verification_recorded"]
        verification_event = sorted(verification_events, key=lambda event: event.createdAt, reverse=True)[0] if verification_events else None
        payload = lifecycle_event.payload
        latest_payload = latest_event.payload
        lifecycle_policy_results = self._safe_dict(payload.get("lifecyclePolicyResults"))
        lifecycle_summary = {
            "lifecyclePolicy": payload.get("lifecyclePolicy"),
            "stateMapping": list(payload.get("stateMapping") or []),
            "terminalStates": list(payload.get("terminalStates") or []),
            "heartbeatPolicy": lifecycle_policy_results.get("heartbeatPolicy"),
            "childProcessTreeTrackingPolicy": lifecycle_policy_results.get("childProcessTreeTrackingPolicy"),
            "orphanDetectionPolicy": lifecycle_policy_results.get("orphanDetectionPolicy"),
            "terminalStateReconciliationPolicy": lifecycle_policy_results.get("terminalStateReconciliationPolicy"),
        }
        workspace_contract = self._safe_dict(payload.get("workspaceContract"))
        workspace_summary = {
            "workspacePlanId": payload.get("workspacePlanId") or workspace_contract.get("workspacePlanId"),
            "materializationMode": workspace_contract.get("materializationMode"),
            "environmentPolicy": workspace_contract.get("environmentPolicy"),
            "environmentAllowlist": list(workspace_contract.get("environmentAllowlist") or []),
            "commandsAllowed": bool(payload.get("commandExecutionAllowed", False))
            and bool(workspace_contract.get("commandsAllowed", False)),
            "sourceMutationAllowed": bool(payload.get("sourceMutationAllowed", False)),
            "networkAllowed": bool(payload.get("networkAllowed", False)),
            "credentialAccessAllowed": bool(payload.get("credentialAccessAllowed", False)),
        }
        output_summary = self._safe_dict(payload.get("outputArtifactSummary"))
        verification_output_summary = self._safe_dict(verification_event.payload.get("outputArtifactSummary")) if verification_event else {}
        cancellation_timeout_rollback = {
            "timeoutPolicy": payload.get("timeoutPolicy"),
            "cancellationPolicy": payload.get("cancellationPolicy"),
            "cleanupPolicy": payload.get("cleanupPolicy"),
            "rollbackPolicy": lifecycle_policy_results.get("rollbackPolicy"),
            "idempotentCleanupPolicy": lifecycle_policy_results.get("idempotentCleanupPolicy"),
            "terminalStateReconciliationPolicy": lifecycle_policy_results.get("terminalStateReconciliationPolicy"),
        }
        safety_flags = {
            "sourceMutationAllowed": bool(payload.get("sourceMutationAllowed", False)),
            "providerCallsAllowed": bool(payload.get("providerCallsAllowed", False)),
            "networkAllowed": bool(payload.get("networkAllowed", False)),
            "credentialAccessAllowed": bool(payload.get("credentialAccessAllowed", False)),
            "shellExecutionAttempted": bool(payload.get("shellExecutionAttempted", False)),
            "externalSendAttempted": bool(payload.get("externalSendAttempted", False)),
        }
        verification_evidence = (
            self._runtime_evidence_subscription_launch_verification_evidence(
                self._safe_dict(verification_event.payload.get("subscriptionLaunchVerification"))
            )
            if verification_event
            else {}
        )
        if not verification_evidence and latest_event.eventType == "execution_attempt.subscription_launch_fixture_completed":
            approval_binding = self._safe_dict(payload.get("approvalBinding"))
            verification_evidence = {
                "status": "not_recorded",
                "commandShape": approval_binding.get("verificationCommand"),
                "rollbackStatus": "not_triggered",
                "blockedReason": "subscription-launch-verification-missing",
                "deliveryEligible": False,
                "nextSafeAction": "Record the approved subscription launch verification command result before delivery eligibility.",
                "rawOutputRetained": False,
            }
        output_artifact_references = list(output_summary.get("artifactReferences") or [])
        for artifact in list(verification_output_summary.get("artifactReferences") or []):
            if artifact not in output_artifact_references:
                output_artifact_references.append(artifact)
        return RuntimeEvidenceSubscriptionLaunchView(
            status=str(latest_payload.get("status") or latest_payload.get("readinessStatus") or payload.get("status") or "recorded"),
            readinessStatus=str(latest_payload.get("readinessStatus") or payload.get("readinessStatus") or "recorded"),
            latestEventType=latest_event.eventType,
            latestEventAt=latest_event.createdAt,
            approvalBinding=self._safe_dict(payload.get("approvalBinding")),
            lifecycleSummary=lifecycle_summary,
            workspaceSummary=workspace_summary,
            outputArtifactReferences=output_artifact_references,
            verificationEvidence=verification_evidence,
            safetyFlags=safety_flags,
            cancellationTimeoutRollbackEvidence=cancellation_timeout_rollback,
            relatedReports=[
                "GET /work-items/{id}/runtime-evidence-export",
                "GET /supervisor/execution-readiness-report",
                "GET /supervisor/threat-boundary",
            ],
            rawOutputStored=bool(output_summary.get("rawOutputStored", False)),
        )

    def _safe_dict(self, value: object) -> dict[str, object]:
        return value if isinstance(value, dict) else {}

    def _runtime_evidence_export_event_view(self, event: WorkflowEventView) -> WorkflowEventView:
        return event.model_copy(update={"payload": self._runtime_evidence_export_safe_payload(event.payload)})

    def _runtime_evidence_export_safe_payload(self, value: object) -> object:
        sensitive_keys = {
            "rawPrompt",
            "rawCompletion",
            "providerPayload",
            "secretValue",
            "sourceCopy",
            "rawStdout",
            "rawStderr",
            "generatedPatch",
        }
        if isinstance(value, dict):
            safe: dict[str, object] = {}
            redacted = False
            for key, child_value in value.items():
                if key in sensitive_keys:
                    redacted = True
                    continue
                safe[key] = self._runtime_evidence_export_safe_payload(child_value)
            if redacted:
                safe["redactedUnknownKeys"] = True
            return safe
        if isinstance(value, list):
            return [self._runtime_evidence_export_safe_payload(item) for item in value]
        return value

    def _runtime_evidence_subscription_launch_verification_evidence(
        self,
        evidence: dict[str, object],
    ) -> dict[str, object]:
        allowed_keys = {
            "attemptId",
            "routeDecisionId",
            "status",
            "commandId",
            "commandShape",
            "summary",
            "artifactRef",
            "recoveryPath",
            "rollbackStatus",
            "rollbackReason",
            "blockedReason",
            "deliveryEligible",
            "nextSafeAction",
            "rawOutputRetained",
        }
        return {key: value for key, value in evidence.items() if key in allowed_keys}

    async def get_execution_readiness_report(self, session: AsyncSession) -> ExecutionReadinessReportView:
        configuration = self.get_execution_configuration_checks()
        disabled_provider_proofs = self.list_disabled_provider_proofs()
        attempt_result = await session.execute(select(ExecutionAttempt).order_by(ExecutionAttempt.updated_at.desc()).limit(8))
        attempts = list(attempt_result.scalars())
        outcome_result = await session.execute(
            select(WorkflowEvent)
            .where(WorkflowEvent.event_type == "routing.outcome_recorded")
            .order_by(WorkflowEvent.created_at.desc())
            .limit(8)
        )
        outcomes = list(outcome_result.scalars())

        next_safe_actions = [
            "Keep all execution authority disabled until a PRD or decision record approves a specific lane.",
            "Use this report, runtime evidence exports, and threat-boundary checks before drafting provider-specific execution work.",
            "Expand reporting evidence before adaptive scoring or automated execution authority.",
        ]
        if not attempts:
            next_safe_actions.insert(0, "Record a non-executing attempt when a work item needs lane, worker, and boundary evidence.")

        return ExecutionReadinessReportView(
            reportId="execution-readiness-report-v1",
            generatedAt=datetime.now(timezone.utc),
            summary=(
                "Execution readiness is reporting-only: provider calls, command execution, source mutation, and real worker launch "
                "remain disabled until every enablement policy step is satisfied."
            ),
            providerEnablementPolicy=self._provider_enablement_policy_steps(),
            disabledAuthorityChecks=[check for check in configuration.checks if not check.enabled],
            disabledProviderProofs=disabled_provider_proofs,
            currentAttempts=[self._execution_readiness_attempt_summary(attempt) for attempt in attempts],
            latestOutcomes=[self._execution_readiness_outcome_evidence(event) for event in outcomes],
            nextSafeActions=next_safe_actions,
        )

    def list_disabled_provider_proofs(self) -> list[DisabledProviderProofView]:
        proofs = []
        ollama_state = self._ollama_provider_gate_state()
        for worker in self.worker_registry.list_workers():
            if (
                worker.adapter_type == WorkerAdapterType.LOCAL_OPENAI_COMPATIBLE
                and worker.health == WorkerHealthStatus.DISABLED
                and worker.disabled_reason
            ):
                proof = self.disabled_provider_adapter.prove_disabled(worker)
                registry_state = proof.registry_state
                broad_gate_enabled = proof.broad_gate_enabled
                provider_specific_gate_enabled = proof.provider_specific_gate_enabled
                model_id_configured = proof.model_id_configured
                adapter_ready = proof.adapter_ready
                disabled_reason = proof.disabled_reason
                http_calls_attempted = proof.http_calls_attempted
                model_calls_attempted = proof.model_calls_attempted
                network_access_attempted = proof.network_access_attempted
                connect_timeout_seconds = proof.connect_timeout_seconds
                total_timeout_seconds = proof.total_timeout_seconds
                if worker.worker_id == "local.ollama.disabled":
                    registry_state = str(ollama_state["registry_state"])
                    broad_gate_enabled = bool(ollama_state["broad_gate_enabled"])
                    provider_specific_gate_enabled = bool(ollama_state["provider_gate_enabled"])
                    model_id_configured = bool(ollama_state["model_id_configured"])
                    adapter_ready = bool(ollama_state["adapter_ready"])
                    disabled_reason = (
                        "ollama_provider_enabled_for_approved_host_endpoint"
                        if bool(ollama_state["enabled"])
                        else str(ollama_state["disabled_reason"] or proof.disabled_reason)
                    )
                    http_calls_attempted = bool(ollama_state["enabled"])
                    model_calls_attempted = bool(ollama_state["enabled"])
                    network_access_attempted = bool(ollama_state["enabled"])
                    connect_timeout_seconds = self.settings.ollama_connect_timeout_seconds
                    total_timeout_seconds = self.settings.ollama_total_timeout_seconds
                proofs.append(
                    DisabledProviderProofView(
                        workerId=proof.worker_id,
                        providerLabel=proof.provider_label,
                        disabledReason=disabled_reason,
                        registryState=registry_state,
                        broadGateEnabled=broad_gate_enabled,
                        providerSpecificGateEnabled=provider_specific_gate_enabled,
                        modelIdConfigured=model_id_configured,
                        adapterReady=adapter_ready,
                        endpointFamily=proof.endpoint_family,
                        endpointPolicy=proof.endpoint_policy,
                        httpCallsAttempted=http_calls_attempted,
                        modelCallsAttempted=model_calls_attempted,
                        networkAccessAttempted=network_access_attempted,
                        credentialAccessAttempted=proof.credential_access_attempted,
                        redactionChecks=list(proof.redaction_checks),
                        promptConstructionSources=list(proof.prompt_construction_sources),
                        rejectedPromptSources=list(proof.rejected_prompt_sources),
                        retainedEvidenceClasses=list(proof.retained_evidence_classes),
                        rawPromptRetentionAllowed=proof.raw_prompt_retention_allowed,
                        rawCompletionRetentionAllowed=proof.raw_completion_retention_allowed,
                        connectTimeoutSeconds=connect_timeout_seconds,
                        totalTimeoutSeconds=total_timeout_seconds,
                        attemptStateMapping=list(proof.attempt_state_mapping),
                        retryPolicy=proof.retry_policy,
                        timeoutPolicy=proof.timeout_policy,
                        cancellationPolicy=proof.cancellation_policy,
                        retentionPolicy=proof.retention_policy,
                    )
                )
        return proofs

    def get_execution_state_boundary(self) -> ExecutionStateBoundaryView:
        return ExecutionStateBoundaryView(
            boundaryId="queue-lease-execution-attempt-boundary-v1",
            generatedAt=datetime.now(timezone.utc),
            summary="Queue leases schedule supervisor work; execution attempts record worker-authority evidence without launching workers.",
            queueLeaseRole=[
                "Track supervisor ownership of queued work.",
                "Record lease heartbeat, expiry, fencing token, and retry count.",
                "Remain independent from route decision, worker, lane, authority mode, workspace, and provider policy.",
            ],
            executionAttemptRole=[
                "Record route-bound worker, lane, authority mode, and lifecycle evidence.",
                "Carry workspace isolation, disabled permission, artifact, and event references.",
                "Provide the attachment point for any future process lifecycle evidence after explicit approval.",
            ],
            forbiddenQueueLeaseFields=[
                "worker_id",
                "provider_endpoint",
                "process_id",
                "command_line",
                "credential_reference",
                "workspace_write_root",
                "approval_binding",
            ],
            futureProcessLifecycleAttachments=[
                "stdout/stderr artifact references",
                "process supervisor id",
                "cancellation and timeout evidence",
                "workspace materialization id",
                "rollback artifact reference",
            ],
        )

    def _provider_enablement_policy_steps(self) -> list[ProviderEnablementPolicyStepView]:
        return [
            ProviderEnablementPolicyStepView(
                stepId="prd-decision",
                label="PRD or decision record",
                status="required",
                summary="Name the exact lane, provider, authority, rollback, and stop conditions before any setting can enable execution.",
                requiredEvidence=[
                    "Approved PRD or decision record.",
                    "Provider-specific scope, timeout, cancellation, and retention policy.",
                ],
            ),
            ProviderEnablementPolicyStepView(
                stepId="threat-boundary-update",
                label="Threat boundary update",
                status="required",
                summary="Update prompt, command, provider, network, credential, and artifact rules for the exact authority being requested.",
                requiredEvidence=[
                    "Threat-boundary artifact updated.",
                    "No-secret and redaction fixtures for prompt or provider payloads.",
                ],
            ),
            ProviderEnablementPolicyStepView(
                stepId="settings-and-registry",
                label="Settings and registry gate",
                status="blocked_by_default",
                summary="Runtime settings and worker registry must agree before a disabled provider can become executable.",
                requiredEvidence=[
                    "Configuration check moves only the approved lane from disabled to enabled.",
                    "Worker registry health, permissions, and disabled reason match the approved policy.",
                ],
            ),
            ProviderEnablementPolicyStepView(
                stepId="permission-envelope",
                label="Permission envelope",
                status="required",
                summary="Every attempt needs bound read roots, write roots, artifact roots, redaction rules, and denied credential/network defaults.",
                requiredEvidence=[
                    "Workspace isolation plan fixtures.",
                    "Approval binding for route, worker, lane, and authority mode.",
                ],
            ),
            ProviderEnablementPolicyStepView(
                stepId="operator-copy-and-tests",
                label="Operator copy and tests",
                status="required",
                summary="Dashboard copy and tests must prove what is enabled, what remains denied, and how rollback works.",
                requiredEvidence=[
                    "Focused API and dashboard tests.",
                    "Rollback or disable plan documented beside the enabling change.",
                ],
            ),
        ]

    def _execution_readiness_attempt_summary(self, attempt: ExecutionAttempt) -> ExecutionReadinessAttemptSummaryView:
        event_refs = list(attempt.event_refs_json or [])
        latest_event = event_refs[-1] if event_refs else {}
        disabled_reason = attempt.rejection_reason or attempt.failure_reason or attempt.cancel_reason
        if attempt.status in ACTIVE_EXECUTION_ATTEMPT_STATUSES:
            next_safe_action = "Review route binding and disabled authority checks before any lifecycle transition."
        elif attempt.status == ExecutionAttemptStatus.REJECTED.value:
            next_safe_action = "Keep rejected authority disabled; satisfy provider enablement policy before retrying execution."
        else:
            next_safe_action = "Use the recorded attempt as evidence only; do not infer execution authority from terminal status."
        return ExecutionReadinessAttemptSummaryView(
            attemptId=attempt.id,
            workItemId=attempt.work_item_id,
            status=attempt.status,
            workerId=attempt.worker_id,
            lane=attempt.lane,
            authorityMode=attempt.authority_mode,
            disabledReason=disabled_reason,
            latestEventType=latest_event.get("eventType") if isinstance(latest_event, dict) else None,
            latestEventAt=self._normalize_timestamp(attempt.updated_at),
            nextSafeAction=next_safe_action,
        )

    def _execution_readiness_outcome_evidence(self, event: WorkflowEvent) -> ExecutionReadinessOutcomeEvidenceView:
        payload = event.payload if isinstance(event.payload, dict) else {}
        failure_reason = payload.get("failureReason") or payload.get("escalationReason")
        return ExecutionReadinessOutcomeEvidenceView(
            eventId=event.id,
            workItemId=event.work_item_id,
            createdAt=self._normalize_timestamp(event.created_at),
            selectedLane=payload.get("selectedLane") if isinstance(payload.get("selectedLane"), str) else None,
            workerId=payload.get("workerId") if isinstance(payload.get("workerId"), str) else None,
            taskKind=payload.get("taskKind") if isinstance(payload.get("taskKind"), str) else None,
            attemptStatus=payload.get("attemptStatus") if isinstance(payload.get("attemptStatus"), str) else None,
            validationStatus=payload.get("validationStatus") if isinstance(payload.get("validationStatus"), str) else None,
            failureClass=failure_reason if isinstance(failure_reason, str) and failure_reason else None,
            escalationReason=payload.get("escalationReason") if isinstance(payload.get("escalationReason"), str) else None,
            operatorOverrideReason=payload.get("operatorOverrideReason") if isinstance(payload.get("operatorOverrideReason"), str) else None,
        )

    async def create_execution_attempt(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemExecutionAttemptCreateRequest,
    ) -> ExecutionAttemptView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        active_attempt = await self._active_execution_attempt(session, work_item_id)
        if active_attempt:
            raise ValueError(f"Work item already has active execution attempt {active_attempt.id}.")
        preview_payload = WorkItemRoutingPreviewRequest(
            stepId=payload.stepId,
            taskKind=payload.taskKind,
            recordEvent=False,
        )
        preview = await self.get_routing_preview(session, work_item_id, preview_payload)
        if not preview:
            return None
        worker = self._worker_for_execution_attempt(preview)
        status, rejection_reason = self._execution_attempt_initial_status(preview, worker)
        now = datetime.now(timezone.utc)
        attempt_id = str(uuid.uuid4())
        workspace_isolation_plan = self._workspace_isolation_plan(attempt_id, preview)
        packet_ref = self._task_packet_artifact_ref(item, preview)
        attempt = ExecutionAttempt(
            id=attempt_id,
            work_item_id=item.id,
            route_decision_id=preview.decision.decisionId,
            worker_id=worker.worker_id,
            lane=preview.decision.selectedLane,
            authority_mode=preview.decision.authorityMode,
            status=status.value,
            requested_by_id=payload.actorId,
            requested_by_label=payload.actorLabel,
            rejection_reason=rejection_reason,
            workspace_isolation_plan_json=workspace_isolation_plan,
            artifact_refs_json=[packet_ref],
            event_refs_json=[],
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        await session.flush()
        event = await self._record_execution_attempt_event(
            session,
            item,
            attempt,
            preview,
            packet_ref,
            actor_id=payload.actorId,
            actor_label=payload.actorLabel,
        )
        attempt.event_refs_json = [{"eventId": event.id, "eventType": event.event_type}]
        await session.commit()
        await session.refresh(attempt)
        await session.refresh(item)
        return self._to_execution_attempt_view(attempt)

    async def launch_supervised_codex_worker(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemSupervisedCodexLaunchRequest,
    ) -> ExecutionAttemptView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        if not payload.taskId.strip():
            raise ValueError("Supervised Codex launch requires a taskId.")
        if not payload.allowedPaths:
            raise ValueError("Supervised Codex launch requires allowed paths.")
        if not payload.verificationCommand.strip():
            raise ValueError("Supervised Codex launch requires a verification command.")

        eligibility = await self.get_trusted_delivery_eligibility_report(approved_scope=payload.allowedPaths)
        if not payload.dryRun and eligibility.diffGuard.status != "passed":
            raise ValueError(f"Supervised Codex real launch requires green diff guard; current status is {eligibility.diffGuard.status}.")
        blocked_touched = [
            path
            for path in payload.touchedFiles
            if not self._path_allowed_for_supervised_codex_launch(path, payload.allowedPaths, payload.blockedPaths)
        ]
        if blocked_touched:
            raise ValueError(f"Supervised Codex launch touched files outside approved scope: {', '.join(blocked_touched)}.")

        active_attempt = await self._active_execution_attempt(session, work_item_id)
        if active_attempt:
            raise ValueError(f"Work item already has active execution attempt {active_attempt.id}.")

        attempt_id = str(uuid.uuid4())
        route_decision_id = f"supervised-codex-{payload.taskId}"
        worker_id = "codex.local.supervised"
        lane = ExecutionLane.UTILITY.value
        authority_mode = "operator_approved_bounded_source_mutation"
        self._validate_supervised_codex_launch_binding(
            payload,
            route_decision_id=route_decision_id,
            worker_id=worker_id,
            lane=lane,
            authority_mode=authority_mode,
        )
        launch_result = self._run_supervised_codex_worker(payload, attempt_id)

        now = datetime.now(timezone.utc)
        workspace_isolation_plan = self._supervised_codex_workspace_isolation_plan(attempt_id, payload)
        launch_evidence = self._supervised_codex_launch_evidence(payload, attempt_id, launch_result)
        terminal_status = launch_result["status"]
        attempt = ExecutionAttempt(
            id=attempt_id,
            work_item_id=item.id,
            route_decision_id=route_decision_id,
            worker_id=worker_id,
            lane=lane,
            authority_mode=authority_mode,
            status=terminal_status,
            requested_by_id=payload.actorId,
            requested_by_label=payload.actorLabel or "Operator",
            failure_reason=launch_result["summary"] if terminal_status != ExecutionAttemptStatus.COMPLETED.value else None,
            workspace_isolation_plan_json=workspace_isolation_plan,
            artifact_refs_json=[launch_evidence],
            event_refs_json=[],
            started_at=now,
            completed_at=now,
            heartbeat_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        await session.flush()
        started_event = await self._record_supervised_codex_launch_event(
            session,
            item,
            attempt,
            payload,
            launch_evidence,
            event_type="execution_attempt.supervised_codex_launch_started",
            summary="Supervised Codex launch started with bounded authority evidence.",
        )
        completed_event = await self._record_supervised_codex_launch_event(
            session,
            item,
            attempt,
            payload,
            launch_evidence,
            event_type=f"execution_attempt.{terminal_status}",
            summary=f"Supervised Codex launch reached terminal {terminal_status} state.",
        )
        attempt.event_refs_json = [
            {"eventId": started_event.id, "eventType": started_event.event_type},
            {"eventId": completed_event.id, "eventType": completed_event.event_type},
        ]
        await session.commit()
        await session.refresh(attempt)
        await session.refresh(item)
        return self._to_execution_attempt_view(attempt)

    def _validate_supervised_codex_launch_binding(
        self,
        payload: WorkItemSupervisedCodexLaunchRequest,
        *,
        route_decision_id: str,
        worker_id: str,
        lane: str,
        authority_mode: str,
    ) -> None:
        if payload.dryRun:
            return
        required = {
            "routeDecisionId": payload.routeDecisionId,
            "workerId": payload.workerId,
            "lane": payload.lane,
            "authorityMode": payload.authorityMode,
            "approvalTimestamp": payload.approvalTimestamp,
            "expiresAt": payload.expiresAt,
        }
        missing = [name for name, value in required.items() if value in {None, ""}]
        if missing:
            raise ValueError(f"Supervised Codex real launch requires approval binding fields: {', '.join(missing)}.")
        expected = {
            "routeDecisionId": route_decision_id,
            "workerId": worker_id,
            "lane": lane,
            "authorityMode": authority_mode,
        }
        actual = {
            "routeDecisionId": payload.routeDecisionId,
            "workerId": payload.workerId,
            "lane": payload.lane,
            "authorityMode": payload.authorityMode,
        }
        for key, expected_value in expected.items():
            if actual[key] != expected_value:
                raise ValueError(f"Supervised Codex approval binding {key} does not match current launch contract.")
        now = datetime.now(timezone.utc)
        if payload.approvalTimestamp and payload.approvalTimestamp > now + timedelta(minutes=1):
            raise ValueError("Supervised Codex approval timestamp is in the future.")
        if payload.expiresAt and payload.expiresAt <= now:
            raise ValueError("Supervised Codex approval binding is stale.")

    def _run_supervised_codex_worker(self, payload: WorkItemSupervisedCodexLaunchRequest, attempt_id: str) -> dict:
        command_shape = "codex <bounded task packet> --cwd <isolated-worktree>"
        if payload.dryRun:
            return {
                "status": ExecutionAttemptStatus.COMPLETED.value,
                "commandShape": command_shape,
                "workspaceOrBranch": "isolated_codex_worktree",
                "summary": payload.outputSummary,
                "exitCode": 0,
                "durationMs": 0,
                "processLaunchAttempted": False,
            }

        repo_root = Path(__file__).resolve().parents[5]
        command = [
            "node",
            "./scripts/codex-workspace.mjs",
            "start",
            payload.outputSummary or payload.taskId,
            "--mode",
            "experiment",
        ]
        started = datetime.now(timezone.utc)
        try:
            result = subprocess.run(
                command,
                cwd=repo_root,
                capture_output=True,
                text=True,
                timeout=300,
                check=False,
                env={"PATH": os.environ.get("PATH", "")},
            )
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            status = ExecutionAttemptStatus.COMPLETED.value if result.returncode == 0 else ExecutionAttemptStatus.FAILED.value
            return {
                "status": status,
                "commandShape": "node ./scripts/codex-workspace.mjs start <bounded task> --mode experiment",
                "workspaceOrBranch": "repo_owned_codex_workspace",
                "summary": f"Repo-owned Codex workspace launch exited with code {result.returncode}.",
                "exitCode": result.returncode,
                "durationMs": duration_ms,
                "processLaunchAttempted": True,
            }
        except subprocess.TimeoutExpired:
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            return {
                "status": ExecutionAttemptStatus.TIMED_OUT.value,
                "commandShape": "node ./scripts/codex-workspace.mjs start <bounded task> --mode experiment",
                "workspaceOrBranch": "repo_owned_codex_workspace",
                "summary": "Repo-owned Codex workspace launch timed out before completion.",
                "exitCode": None,
                "durationMs": duration_ms,
                "processLaunchAttempted": True,
            }
        except OSError as exc:
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            return {
                "status": ExecutionAttemptStatus.FAILED.value,
                "commandShape": "node ./scripts/codex-workspace.mjs start <bounded task> --mode experiment",
                "workspaceOrBranch": "repo_owned_codex_workspace",
                "summary": f"Repo-owned Codex workspace launch could not start: {exc.__class__.__name__}.",
                "exitCode": None,
                "durationMs": duration_ms,
                "processLaunchAttempted": True,
            }

    async def record_execution_attempt_verification_evidence(
        self,
        session: AsyncSession,
        work_item_id: str,
        attempt_id: str,
        payload: WorkItemVerificationEvidenceRequest,
    ) -> ExecutionAttemptView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        attempt = await session.get(ExecutionAttempt, attempt_id)
        if not attempt or attempt.work_item_id != work_item_id:
            return None
        if attempt.status != ExecutionAttemptStatus.COMPLETED.value:
            raise ValueError("Verification evidence can be recorded only for a completed execution attempt.")
        if payload.status not in {"passed", "failed", "timed_out", "could_not_run", "not_recorded", "stale"}:
            raise ValueError("Verification evidence status must be passed, failed, timed_out, could_not_run, not_recorded, or stale.")
        if not payload.commandShape.strip():
            raise ValueError("Verification evidence requires a command shape.")
        artifact_refs = list(attempt.artifact_refs_json or [])
        if any(isinstance(ref, dict) and ref.get("artifactType") == "verification_result" and ref.get("commandId") == payload.commandId for ref in artifact_refs):
            raise ValueError("Verification evidence commandId has already been recorded for this attempt.")
        if attempt.lane == ExecutionLane.SUBSCRIPTION_AGENT.value and payload.rollbackStatus == "triggered":
            for ref in artifact_refs:
                verification = self._safe_dict(ref.get("subscriptionLaunchVerification")) if isinstance(ref, dict) else {}
                if verification.get("rollbackStatus") == "triggered":
                    raise ValueError("Rollback evidence has already been recorded for this subscription launch attempt.")
        allowed_commands = {
            ref.get("verificationCommand")
            for ref in artifact_refs
            if isinstance(ref, dict) and isinstance(ref.get("verificationCommand"), str)
        }
        if not allowed_commands:
            raise ValueError("Verification command shape is not bound to this attempt.")
        if payload.commandShape not in allowed_commands:
            raise ValueError("Verification command shape does not match the approved attempt command.")

        branch_ok, branch_output = self._git_output(["git", "branch", "--show-current"])
        head_ok, head_output = self._git_output(["git", "rev-parse", "HEAD"])
        if payload.status in {"not_recorded", "stale"}:
            run_result = {
                "status": payload.status,
                "exitCode": payload.exitCode,
                "durationMs": payload.durationMs,
                "summary": payload.summary,
                "recoveryAction": payload.recoveryAction,
            }
        else:
            run_result = self._run_execution_attempt_verification_command(payload.commandShape)
        recorded_at = datetime.now(timezone.utc)
        evidence = {
            "artifactType": "verification_result",
            "commandId": payload.commandId,
            "label": payload.label,
            "commandShape": payload.commandShape,
            "status": run_result["status"],
            "exitCode": run_result["exitCode"],
            "durationMs": run_result["durationMs"],
            "summary": run_result["summary"],
            "artifactRef": payload.artifactRef,
            "recoveryAction": payload.recoveryAction or run_result["recoveryAction"],
            "worktreePath": self._verification_worktree_path(attempt),
            "branch": branch_output if branch_ok and branch_output else "unknown",
            "headRevision": head_output if head_ok and head_output else "unknown",
            "recordedAt": recorded_at.isoformat(),
            "retentionPolicy": "metadata_only_no_secrets_prompts_provider_payloads_or_source_copies",
            "rawOutputRetained": False,
            "secretRetentionAllowed": False,
            "providerPayloadRetentionAllowed": False,
        }
        if attempt.lane == ExecutionLane.SUBSCRIPTION_AGENT.value:
            evidence["subscriptionLaunchVerification"] = self._subscription_launch_verification_evidence(
                attempt,
                payload,
                run_result,
            )
        artifact_refs.append(evidence)
        attempt.artifact_refs_json = artifact_refs
        attempt.updated_at = recorded_at
        if run_result["status"] in {"failed", "timed_out", "could_not_run"}:
            attempt.failure_reason = run_result["summary"]
        event = await self._record_verification_evidence_event(session, item, attempt, evidence)
        event_refs = list(attempt.event_refs_json or [])
        event_refs.append({"eventId": event.id, "eventType": event.event_type})
        attempt.event_refs_json = event_refs
        await session.commit()
        await session.refresh(attempt)
        await session.refresh(item)
        return self._to_execution_attempt_view(attempt)

    def _subscription_launch_verification_evidence(
        self,
        attempt: ExecutionAttempt,
        payload: WorkItemVerificationEvidenceRequest,
        run_result: dict,
    ) -> dict[str, object]:
        status = str(run_result["status"])
        rollback_status = payload.rollbackStatus or (
            "not_required" if status == "passed" else "available_not_triggered"
        )
        rollback_reason = payload.rollbackReason or (
            "verification_passed" if status == "passed" else f"verification_{status}"
        )
        blocked_reason_by_status = {
            "passed": None,
            "failed": "subscription-launch-verification-failed",
            "timed_out": "subscription-launch-verification-timed-out",
            "could_not_run": "subscription-launch-verification-could-not-run",
            "not_recorded": "subscription-launch-verification-missing",
            "stale": "subscription-launch-verification-stale",
        }
        blocked_reason = blocked_reason_by_status.get(status, "subscription-launch-verification-invalid")
        next_safe_action = payload.nextSafeAction or (
            "Retain subscription-agent launch evidence for review."
            if status == "passed"
            else "Inspect retained subscription-agent launch artifacts before retry or rollback."
        )
        return {
            "attemptId": attempt.id,
            "routeDecisionId": attempt.route_decision_id,
            "status": status,
            "commandId": payload.commandId,
            "commandShape": payload.commandShape,
            "summary": str(run_result["summary"]),
            "artifactRef": payload.artifactRef,
            "recoveryPath": payload.recoveryAction or str(run_result["recoveryAction"]),
            "rollbackStatus": rollback_status,
            "rollbackReason": rollback_reason,
            "blockedReason": blocked_reason,
            "rollbackBlockedReason": "subscription_launch_rollback_triggered"
            if rollback_status == "triggered"
            else None,
            "deliveryEligible": status == "passed" and rollback_status != "triggered",
            "nextSafeAction": next_safe_action,
            "rawOutputRetained": False,
            "secretRetentionAllowed": False,
            "providerPayloadRetentionAllowed": False,
            "sourceCopiesRetained": False,
        }

    def _run_execution_attempt_verification_command(self, command_shape: str) -> dict:
        allowed_commands = {
            "pnpm run check": ["pnpm", "run", "check"],
            "pnpm run test:supervisor": ["pnpm", "run", "test:supervisor"],
            "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch": [
                "pnpm",
                "run",
                "test:supervisor",
                "--",
                "tests/integration/test_routing_preview.py",
                "-q",
                "-k",
                "subscription_agent_launch",
            ],
        }
        command = allowed_commands.get(command_shape)
        if command is None:
            raise ValueError("Verification command is not in the bounded execution allowlist.")

        repo_root = Path(__file__).resolve().parents[5]
        started = datetime.now(timezone.utc)
        try:
            result = subprocess.run(
                command,
                cwd=repo_root,
                capture_output=True,
                text=True,
                timeout=900,
                check=False,
                env={"PATH": os.environ.get("PATH", "")},
            )
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            status = "passed" if result.returncode == 0 else "failed"
            return {
                "status": status,
                "exitCode": result.returncode,
                "durationMs": duration_ms,
                "summary": f"Approved verification command exited with code {result.returncode}.",
                "recoveryAction": "retain evidence for green-gate evaluation" if status == "passed" else "inspect, retry, resume, or rollback",
            }
        except subprocess.TimeoutExpired:
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            return {
                "status": "timed_out",
                "exitCode": None,
                "durationMs": duration_ms,
                "summary": "Approved verification command timed out before completion.",
                "recoveryAction": "inspect timeout, retry, resume, or rollback",
            }
        except OSError as exc:
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            return {
                "status": "could_not_run",
                "exitCode": None,
                "durationMs": duration_ms,
                "summary": f"Approved verification command could not start: {exc.__class__.__name__}.",
                "recoveryAction": "repair environment before retry",
            }

    async def transition_execution_attempt(
        self,
        session: AsyncSession,
        work_item_id: str,
        attempt_id: str,
        payload: WorkItemExecutionAttemptTransitionRequest,
    ) -> ExecutionAttemptView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        attempt = await session.get(ExecutionAttempt, attempt_id)
        if not attempt or attempt.work_item_id != work_item_id:
            return None

        current_status = attempt.status
        requested_status = payload.status.value
        if current_status in TERMINAL_EXECUTION_ATTEMPT_STATUSES:
            raise ValueError(f"Execution attempt {attempt.id} is terminal with status {current_status}.")
        allowed = EXECUTION_ATTEMPT_TRANSITIONS.get(current_status, set())
        if requested_status not in allowed:
            raise ValueError(f"Invalid execution attempt transition from {current_status} to {requested_status}.")
        if requested_status == ExecutionAttemptStatus.APPROVED.value:
            try:
                self._validate_execution_attempt_approval_binding(attempt, payload)
            except ValueError as exc:
                if self._has_subscription_launch_approval_fields(payload):
                    event = await self._record_execution_attempt_approval_rejection_event(
                        session,
                        item,
                        attempt,
                        reason=str(exc),
                        payload=payload,
                    )
                    event_refs = list(attempt.event_refs_json or [])
                    event_refs.append({"eventId": event.id, "eventType": event.event_type})
                    attempt.event_refs_json = event_refs
                    await session.commit()
                raise

        now = datetime.now(timezone.utc)
        attempt.status = requested_status
        attempt.updated_at = now
        if requested_status in {ExecutionAttemptStatus.STARTING.value, ExecutionAttemptStatus.RUNNING.value} and not attempt.started_at:
            attempt.started_at = now
        if requested_status == ExecutionAttemptStatus.RUNNING.value:
            attempt.heartbeat_at = now
        if requested_status == ExecutionAttemptStatus.CANCEL_REQUESTED.value:
            attempt.cancel_requested_at = now
            attempt.cancel_reason = payload.reason
        if requested_status == ExecutionAttemptStatus.CANCELLED.value:
            attempt.cancel_requested_at = attempt.cancel_requested_at or now
            attempt.completed_at = now
            if payload.reason:
                attempt.cancel_reason = payload.reason
        if requested_status == ExecutionAttemptStatus.TIMED_OUT.value:
            attempt.timeout_at = now
            attempt.completed_at = now
            if payload.reason:
                attempt.failure_reason = payload.reason
        if requested_status == ExecutionAttemptStatus.FAILED.value:
            attempt.completed_at = now
            attempt.failure_reason = payload.reason
        if requested_status == ExecutionAttemptStatus.COMPLETED.value:
            attempt.completed_at = now

        event = await self._record_execution_attempt_transition_event(
            session,
            item,
            attempt,
            previous_status=current_status,
            reason=payload.reason,
            actor_id=payload.actorId,
            actor_label=payload.actorLabel,
        )
        event_refs = list(attempt.event_refs_json or [])
        event_refs.append({"eventId": event.id, "eventType": event.event_type})
        attempt.event_refs_json = event_refs
        await session.commit()
        await session.refresh(attempt)
        await session.refresh(item)
        return self._to_execution_attempt_view(attempt)

    def _path_allowed_for_supervised_codex_launch(self, path: str, allowed_paths: list[str], blocked_paths: list[str]) -> bool:
        normalized = self._normalize_supervised_codex_scope_path(path)
        if not normalized:
            return False
        for blocked in blocked_paths:
            blocked_normalized = self._normalize_supervised_codex_scope_path(blocked, allow_glob=True)
            if not blocked_normalized:
                return False
            if blocked_normalized.endswith("/**") and self._path_matches_scope_prefix(normalized, blocked_normalized[:-3]):
                return False
            if blocked_normalized.endswith("*") and normalized.startswith(blocked_normalized[:-1]):
                return False
            if normalized == blocked_normalized or normalized.startswith(f"{blocked_normalized}/"):
                return False
        for allowed in allowed_paths:
            allowed_normalized = self._normalize_supervised_codex_scope_path(allowed, allow_glob=True)
            if not allowed_normalized:
                continue
            if allowed_normalized.endswith("/**") and self._path_matches_scope_prefix(normalized, allowed_normalized[:-3]):
                return True
            if normalized == allowed_normalized:
                return True
        return False

    def _path_matches_scope_prefix(self, normalized: str, prefix: str) -> bool:
        return normalized == prefix or normalized.startswith(f"{prefix}/")

    def _normalize_supervised_codex_scope_path(self, path: str, *, allow_glob: bool = False) -> str | None:
        normalized = path.replace("\\", "/").strip()
        if not normalized:
            return None
        glob_suffix = ""
        if allow_glob and normalized.endswith("/**"):
            normalized = normalized[:-3]
            glob_suffix = "/**"
        elif allow_glob and normalized.endswith("*"):
            normalized = normalized[:-1]
            glob_suffix = "*"
        if normalized.startswith("/") or normalized.startswith("//") or ":" in normalized.split("/", 1)[0]:
            return None
        parts = [part for part in normalized.split("/") if part not in {"", "."}]
        if any(part == ".." for part in parts):
            return None
        return "/".join(parts) + glob_suffix

    def _supervised_codex_workspace_isolation_plan(
        self,
        attempt_id: str,
        payload: WorkItemSupervisedCodexLaunchRequest,
    ) -> dict:
        return {
            "planId": f"workspace-plan-{attempt_id}",
            "sourceSnapshotStrategy": "approved_epic_7_supervised_codex_launch_scope",
            "branchStrategy": "isolated_codex_worktree_no_remote_delivery",
            "readRoots": payload.allowedPaths,
            "writeRoots": payload.allowedPaths,
            "artifactRoot": f"_bmad-output/execution-attempts/{attempt_id}",
            "forbiddenPaths": payload.blockedPaths,
            "cleanupRule": "preserve_worktree_until_operator_inspection",
            "rollbackRule": "inspect_retained_diff_then_revert_or_abandon_before_delivery",
            "diffCaptureRule": "capture_file_inventory_and_diff_guard_status_before_delivery",
            "writesAllowed": True,
            "sourceMutationAllowed": True,
            "commandsAllowed": True,
            "networkAllowed": False,
            "credentialAccessAllowed": False,
            "redactionBoundary": [
                "no raw prompts, completions, provider payloads, secrets, browser sessions, or credential material",
            ],
            "allowedCommandClasses": ["bounded_codex_worker", "approved_verification_command"],
            "blockedCommandClasses": [
                "git_remote_write",
                "merge",
                "cleanup",
                "provider_call",
                "claude_launch",
                "subscription_agent_launch",
                "issue_sync",
                "secret_access",
            ],
            "providerEndpointPolicy": "deny_all_provider_endpoints",
            "promptConstructionPolicy": "bounded_task_packet_metadata_only",
            "boundaryRejectionReason": "",
            "materializationMode": "isolated_worktree_required_for_real_launch",
            "environmentPolicy": "deny_inheritance_allowlist_only",
            "environmentAllowlist": ["PATH"],
            "sessionBoundary": "forbid_shell_profiles_ssh_browser_tokens_subscription_sessions_and_credentials",
            "outputPolicy": "metadata_summary_only_no_raw_stdout_or_stderr_retention",
        }

    def _supervised_codex_launch_evidence(
        self,
        payload: WorkItemSupervisedCodexLaunchRequest,
        attempt_id: str,
        launch_result: dict,
    ) -> dict:
        return {
            "artifactType": "supervised_codex_launch_evidence",
            "taskId": payload.taskId,
            "attemptId": attempt_id,
            "dryRun": payload.dryRun,
            "commandShape": launch_result["commandShape"],
            "workspaceOrBranch": launch_result["workspaceOrBranch"],
            "inputScope": {
                "allowedPaths": payload.allowedPaths,
                "blockedPaths": payload.blockedPaths,
            },
            "outputSummary": launch_result["summary"],
            "touchedFiles": payload.touchedFiles,
            "verificationCommand": payload.verificationCommand,
            "terminalState": launch_result["status"],
            "exitCode": launch_result["exitCode"],
            "durationMs": launch_result["durationMs"],
            "processLaunchAttempted": launch_result["processLaunchAttempted"],
            "recoveryPath": "inspect retained worktree evidence before retry, revert, or delivery",
            "retentionPolicy": "metadata_only_no_raw_prompt_completion_stdout_or_stderr",
            "prCreationAllowed": False,
            "mergeAllowed": False,
            "cleanupAllowed": False,
            "claudeLaunchAllowed": False,
            "providerExpansionAllowed": False,
            "subscriptionAgentLaunchAllowed": False,
            "issueSyncAllowed": False,
            "secretAccessAllowed": False,
        }

    async def _record_supervised_codex_launch_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        payload: WorkItemSupervisedCodexLaunchRequest,
        launch_evidence: dict,
        *,
        event_type: str,
        summary: str,
    ) -> WorkflowEvent:
        return await self._record_event(
            session,
            item,
            event_type,
            summary,
            {
                "attemptId": attempt.id,
                "workItemId": item.id,
                "routeDecisionId": attempt.route_decision_id,
                "workerId": attempt.worker_id,
                "selectedLane": attempt.lane,
                "authorityMode": attempt.authority_mode,
                "status": attempt.status,
                "taskId": payload.taskId,
                "dryRun": payload.dryRun,
                "commandShape": launch_evidence["commandShape"],
                "workspaceOrBranch": launch_evidence["workspaceOrBranch"],
                "inputScope": launch_evidence["inputScope"],
                "outputSummary": launch_evidence["outputSummary"],
                "touchedFiles": payload.touchedFiles,
                "terminalState": launch_evidence["terminalState"],
                "exitCode": launch_evidence["exitCode"],
                "durationMs": launch_evidence["durationMs"],
                "recoveryPath": launch_evidence["recoveryPath"],
                "verificationCommand": payload.verificationCommand,
                "processLaunchAllowed": True,
                "processLaunchAttempted": launch_evidence["processLaunchAttempted"],
                "sourceMutationAllowed": True,
                "commandExecutionAllowed": True,
                "providerCallsAllowed": False,
                "networkAllowed": False,
                "credentialAccessAllowed": False,
                "prCreationAllowed": False,
                "mergeAllowed": False,
                "cleanupAllowed": False,
                "claudeLaunchAllowed": False,
                "providerExpansionAllowed": False,
                "subscriptionAgentLaunchAllowed": False,
                "issueSyncAllowed": False,
                "secretAccessAllowed": False,
            },
            actor_type="operator",
            actor_id=payload.actorId,
            actor_label=payload.actorLabel or "Operator",
        )

    def _verification_worktree_path(self, attempt: ExecutionAttempt) -> str:
        for ref in list(attempt.artifact_refs_json or []):
            if isinstance(ref, dict) and isinstance(ref.get("workspaceOrBranch"), str):
                return str(ref["workspaceOrBranch"])
        workspace = attempt.workspace_isolation_plan_json if isinstance(attempt.workspace_isolation_plan_json, dict) else {}
        artifact_root = workspace.get("artifactRoot")
        return str(artifact_root) if isinstance(artifact_root, str) else "unknown"

    async def _record_verification_evidence_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        evidence: dict,
    ) -> WorkflowEvent:
        subscription_launch_verification = self._safe_dict(evidence.get("subscriptionLaunchVerification"))
        payload = {
            "attemptId": attempt.id,
            "workItemId": item.id,
            "routeDecisionId": attempt.route_decision_id,
            "workerId": attempt.worker_id,
            "selectedLane": attempt.lane,
            "authorityMode": attempt.authority_mode,
            "commandId": evidence["commandId"],
            "commandShape": evidence["commandShape"],
            "status": evidence["status"],
            "exitCode": evidence["exitCode"],
            "durationMs": evidence["durationMs"],
            "summary": evidence["summary"],
            "artifactRef": evidence["artifactRef"],
            "recoveryAction": evidence["recoveryAction"],
            "readinessStatus": "verification_recorded",
            "outputArtifactSummary": {
                "artifactReferences": [
                    {
                        "artifactKind": "verification_result",
                        "path": evidence["artifactRef"],
                        "rawPayloadStored": False,
                        "operatorReviewRequired": True,
                    }
                ]
                if evidence.get("artifactRef")
                else [],
                "rawOutputStored": False,
            },
            "worktreePath": evidence["worktreePath"],
            "branch": evidence["branch"],
            "headRevision": evidence["headRevision"],
            "rawOutputRetained": False,
            "secretRetentionAllowed": False,
            "providerPayloadRetentionAllowed": False,
            "sourceCopiesRetained": False,
            "prCreationAllowed": False,
            "mergeAllowed": False,
            "cleanupAllowed": False,
            "ciWaitAllowed": False,
            "issueSyncAllowed": False,
            "claudeLaunchAllowed": False,
            "providerExpansionAllowed": False,
            "subscriptionAgentLaunchAllowed": False,
            "secretAccessAllowed": False,
        }
        if subscription_launch_verification:
            payload["readinessStatus"] = subscription_launch_verification.get("readinessStatus") or (
                "subscription_launch_rollback_triggered"
                if subscription_launch_verification.get("rollbackStatus") == "triggered"
                else "subscription_launch_verification_recorded"
            )
            payload["subscriptionLaunchVerification"] = subscription_launch_verification
        return await self._record_event(
            session,
            item,
            "execution_attempt.verification_recorded",
            f"Verification evidence recorded with status {evidence['status']}.",
            payload,
            actor_type="supervisor",
        )

    def _validate_execution_attempt_approval_binding(
        self,
        attempt: ExecutionAttempt,
        payload: WorkItemExecutionAttemptTransitionRequest,
    ) -> None:
        required = {
            "routeDecisionId": payload.routeDecisionId,
            "workerId": payload.workerId,
            "lane": payload.lane,
            "authorityMode": payload.authorityMode,
        }
        missing = [field for field, value in required.items() if not value]
        if missing:
            raise ValueError(f"Execution attempt approval requires binding fields: {', '.join(missing)}.")

        mismatches = []
        if payload.routeDecisionId != attempt.route_decision_id:
            mismatches.append("routeDecisionId")
        if payload.workerId != attempt.worker_id:
            mismatches.append("workerId")
        if payload.lane != attempt.lane:
            mismatches.append("lane")
        if payload.authorityMode != attempt.authority_mode:
            mismatches.append("authorityMode")
        if mismatches:
            raise ValueError(f"Execution attempt approval binding mismatch: {', '.join(mismatches)}.")

        launch_binding_fields = {
            "workItemId": payload.workItemId,
            "attemptId": payload.attemptId,
            "workspacePlanId": payload.workspacePlanId,
            "launchPolicyId": payload.launchPolicyId,
            "targetId": payload.targetId,
            "commandTemplateId": payload.commandTemplateId,
            "actorId": payload.actorId,
            "approvalTimestamp": payload.approvalTimestamp,
            "expiresAt": payload.expiresAt,
        }
        if self._has_subscription_launch_approval_fields(payload):
            missing_launch_fields = [field for field, value in launch_binding_fields.items() if value is None or value == ""]
            if missing_launch_fields:
                raise ValueError(
                    f"Subscription launch approval requires binding fields: {', '.join(missing_launch_fields)}."
                )
            if payload.workItemId != attempt.work_item_id:
                mismatches.append("workItemId")
            if payload.attemptId != attempt.id:
                mismatches.append("attemptId")
            workspace_plan = attempt.workspace_isolation_plan_json or {}
            if payload.workspacePlanId != workspace_plan.get("planId"):
                mismatches.append("workspacePlanId")
            expected_target = self.subscription_launch_registry.get_target(payload.targetId)
            if payload.targetId != expected_target.target_id:
                mismatches.append("targetId")
            if payload.launchPolicyId != expected_target.launch_policy_id:
                mismatches.append("launchPolicyId")
            if payload.commandTemplateId != expected_target.command_template_id:
                mismatches.append("commandTemplateId")
            if payload.expiresAt and payload.expiresAt <= datetime.now(timezone.utc):
                mismatches.append("expiresAt")
            if mismatches:
                raise ValueError(f"Subscription launch approval binding mismatch or stale approval: {', '.join(mismatches)}.")

    def _has_subscription_launch_approval_fields(self, payload: WorkItemExecutionAttemptTransitionRequest) -> bool:
        return any(
            value is not None and value != ""
            for value in (
                payload.workItemId,
                payload.attemptId,
                payload.workspacePlanId,
                payload.launchPolicyId,
                payload.targetId,
                payload.commandTemplateId,
                payload.approvalTimestamp,
                payload.expiresAt,
            )
        )

    async def _active_execution_attempt(self, session: AsyncSession, work_item_id: str) -> ExecutionAttempt | None:
        result = await session.execute(
            select(ExecutionAttempt)
            .where(
                ExecutionAttempt.work_item_id == work_item_id,
                ExecutionAttempt.status.in_(ACTIVE_EXECUTION_ATTEMPT_STATUSES),
            )
            .order_by(ExecutionAttempt.created_at.desc())
        )
        return result.scalars().first()

    def _worker_for_execution_attempt(self, preview: RoutingPreviewView) -> WorkerRegistryEntry:
        selected_worker_id = preview.decision.selectedWorkerId
        workers = self.worker_registry.list_workers()
        if selected_worker_id:
            for worker in workers:
                if worker.worker_id == selected_worker_id:
                    return worker
        for worker in workers:
            if worker.lane.value == preview.decision.selectedLane:
                return worker
        raise ValueError(f"No worker registry entry found for lane {preview.decision.selectedLane}.")

    def _execution_attempt_initial_status(
        self,
        preview: RoutingPreviewView,
        worker: WorkerRegistryEntry,
    ) -> tuple[ExecutionAttemptStatus, str | None]:
        if preview.decision.selectedLane == ExecutionLane.UTILITY.value and worker.worker_id == "utility.internal":
            return ExecutionAttemptStatus.PLANNED, None
        if worker.disabled_reason:
            return ExecutionAttemptStatus.REJECTED, worker.disabled_reason
        return ExecutionAttemptStatus.REJECTED, f"execution_authority_not_enabled_for_{preview.decision.selectedLane}"

    def _workspace_isolation_plan(self, attempt_id: str, preview: RoutingPreviewView) -> dict:
        read_roots = list(preview.profile.allowedPaths) or ["."]
        threat_boundary = self.get_threat_boundary()
        forbidden_paths = sorted(
            {
                ".env",
                ".env.*",
                ".git",
                ".ssh",
                "node_modules",
                "services/supervisor/.venv",
                "**/*secret*",
                "**/*credential*",
                "**/*token*",
            }
        )
        return {
            "planId": f"workspace-plan-{attempt_id}",
            "sourceSnapshotStrategy": "record_current_route_and_attempt_metadata_only",
            "branchStrategy": "none_non_executing_attempt",
            "readRoots": read_roots,
            "writeRoots": [],
            "artifactRoot": f"_bmad-output/execution-attempts/{attempt_id}",
            "forbiddenPaths": forbidden_paths,
            "cleanupRule": "no_workspace_created_no_cleanup_required",
            "rollbackRule": "source_mutation_disabled_no_rollback_required",
            "diffCaptureRule": "capture_diff_metadata_only_after_future_isolated_execution_is_enabled",
            "writesAllowed": False,
            "sourceMutationAllowed": False,
            "commandsAllowed": False,
            "networkAllowed": False,
            "credentialAccessAllowed": False,
            "redactionBoundary": threat_boundary.redactionBoundary,
            "allowedCommandClasses": threat_boundary.allowedCommandClasses,
            "blockedCommandClasses": threat_boundary.blockedCommandClasses,
            "providerEndpointPolicy": threat_boundary.providerEndpointPolicy,
            "promptConstructionPolicy": "approved_evidence_only",
            "boundaryRejectionReason": "worker_execution_safety_boundary_not_satisfied",
            "materializationMode": "metadata_only_no_workspace_created",
            "environmentPolicy": "deny_inheritance_allowlist_only",
            "environmentAllowlist": ["PATH"],
            "sessionBoundary": "forbid_shell_profiles_ssh_browser_tokens_subscription_sessions_and_credentials",
            "outputPolicy": "summary_only_no_raw_stdout_or_stderr_retention",
        }

    def _task_packet_artifact_ref(self, item: WorkItem, preview: RoutingPreviewView) -> dict:
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        source_artifact_path = metadata.get("sourceArtifactPath")
        candidate_priority = metadata.get("candidatePriority")
        return {
            "artifactType": "task_packet_v0",
            "packetId": f"task-packet-{preview.decision.decisionId}",
            "workItemId": item.id,
            "routeDecisionId": preview.decision.decisionId,
            "sourceArtifactPath": source_artifact_path if isinstance(source_artifact_path, str) else None,
            "taskKind": preview.profile.taskKind,
            "priority": candidate_priority if isinstance(candidate_priority, str) else "normal",
            "approvalMode": preview.decision.authorityMode,
            "retentionPolicy": "metadata_only_no_raw_artifact_content",
            "previewOnly": True,
            "executionAllowed": False,
        }

    async def _record_execution_attempt_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        preview: RoutingPreviewView,
        packet_ref: dict,
        actor_id: str | None,
        actor_label: str | None,
    ) -> WorkflowEvent:
        planned = attempt.status == ExecutionAttemptStatus.PLANNED.value
        event_type = "execution_attempt.planned" if planned else "execution_attempt.rejected"
        summary = (
            f"Execution attempt planned for {attempt.lane} via {attempt.worker_id}."
            if planned
            else f"Execution attempt rejected for {attempt.lane} via {attempt.worker_id}."
        )
        return await self._record_event(
            session,
            item,
            event_type,
            summary,
            {
                "attemptId": attempt.id,
                "workItemId": item.id,
                "routeDecisionId": attempt.route_decision_id,
                "workerId": attempt.worker_id,
                "selectedLane": attempt.lane,
                "authorityMode": attempt.authority_mode,
                "status": attempt.status,
                "taskKind": preview.profile.taskKind,
                "stepId": preview.profile.stepId,
                "taskPacket": packet_ref,
                "rejectionReason": attempt.rejection_reason,
                "workspaceIsolationPlan": dict(attempt.workspace_isolation_plan_json or {}),
                "executionAllowed": False,
                "processLaunchAllowed": False,
                "providerCallsAllowed": False,
                "modelCallsAllowed": False,
                "commandExecutionAllowed": False,
                "sourceMutationAllowed": False,
                "networkAllowed": False,
                "credentialAccessAllowed": False,
                "boundaryId": "supervisor-worker-threat-boundary-v1",
                "boundaryRejectionReason": attempt.rejection_reason or "worker_execution_safety_boundary_not_satisfied",
            },
            actor_type="operator" if actor_id or actor_label else "supervisor",
            actor_id=actor_id,
            actor_label=actor_label,
        )

    async def _record_execution_attempt_transition_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        previous_status: str,
        reason: str | None,
        actor_id: str | None,
        actor_label: str | None,
    ) -> WorkflowEvent:
        event_type = f"execution_attempt.{attempt.status}"
        return await self._record_event(
            session,
            item,
            event_type,
            f"Execution attempt moved from {previous_status} to {attempt.status}.",
            {
                "attemptId": attempt.id,
                "workItemId": item.id,
                "routeDecisionId": attempt.route_decision_id,
                "workerId": attempt.worker_id,
                "selectedLane": attempt.lane,
                "authorityMode": attempt.authority_mode,
                "previousStatus": previous_status,
                "status": attempt.status,
                "reason": reason,
                "workspaceIsolationPlan": dict(attempt.workspace_isolation_plan_json or {}),
                "approvalBinding": (
                    {
                        "routeDecisionId": attempt.route_decision_id,
                        "attemptId": attempt.id,
                        "workerId": attempt.worker_id,
                        "selectedLane": attempt.lane,
                        "authorityMode": attempt.authority_mode,
                    }
                    if attempt.status == ExecutionAttemptStatus.APPROVED.value
                    else None
                ),
                "remainingDisabled": (
                    [
                        "process_launch",
                        "provider_http_calls",
                        "model_api_calls",
                        "premium_execution",
                        "source_mutation",
                        "arbitrary_shell_execution",
                        "worker_network_access",
                        "credential_access",
                    ]
                    if attempt.status == ExecutionAttemptStatus.APPROVED.value
                    else []
                ),
                "executionAllowed": False,
                "processLaunchAllowed": False,
                "providerCallsAllowed": False,
                "modelCallsAllowed": False,
                "commandExecutionAllowed": False,
                "sourceMutationAllowed": False,
                "networkAllowed": False,
                "credentialAccessAllowed": False,
                "boundaryId": "supervisor-worker-threat-boundary-v1",
                "boundaryRejectionReason": "worker_execution_safety_boundary_not_satisfied",
            },
            actor_type="operator" if actor_id or actor_label else "supervisor",
            actor_id=actor_id,
            actor_label=actor_label,
        )

    async def _record_execution_attempt_approval_rejection_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        *,
        reason: str,
        payload: WorkItemExecutionAttemptTransitionRequest,
    ) -> WorkflowEvent:
        return await self._record_event(
            session,
            item,
            "execution_attempt.approval_rejected",
            "Execution attempt approval rejected before any process launch.",
            {
                "attemptId": attempt.id,
                "workItemId": item.id,
                "routeDecisionId": attempt.route_decision_id,
                "workerId": attempt.worker_id,
                "selectedLane": attempt.lane,
                "authorityMode": attempt.authority_mode,
                "status": attempt.status,
                "rejectionReason": reason,
                "providedBinding": {
                    "workItemId": payload.workItemId,
                    "attemptId": payload.attemptId,
                    "routeDecisionId": payload.routeDecisionId,
                    "workerId": payload.workerId,
                    "lane": payload.lane,
                    "authorityMode": payload.authorityMode,
                    "workspacePlanId": payload.workspacePlanId,
                    "launchPolicyId": payload.launchPolicyId,
                    "targetId": payload.targetId,
                    "commandTemplateId": payload.commandTemplateId,
                    "actorId": payload.actorId,
                    "approvalTimestampPresent": payload.approvalTimestamp is not None,
                    "expiresAtPresent": payload.expiresAt is not None,
                },
                "processLaunchAllowed": False,
                "processLaunchAttempted": False,
                "shellExecutionAttempted": False,
                "credentialAccessAttempted": False,
                "externalSendAttempted": False,
            },
            actor_type="operator" if payload.actorId or payload.actorLabel else "supervisor",
            actor_id=payload.actorId,
            actor_label=payload.actorLabel,
        )

    async def list_routing_lane_profiles(self, session: AsyncSession) -> list[RoutingLaneEvidenceProfileView]:
        result = await session.execute(
            select(WorkflowEvent)
            .where(WorkflowEvent.event_type.in_(self._ROUTING_PROFILE_EVENT_TYPES))
            .order_by(WorkflowEvent.created_at.desc())
        )
        events = list(result.scalars())
        profiles: dict[str, dict] = {}
        for event in events:
            payload = event.payload if isinstance(event.payload, dict) else {}
            lane = payload.get("selectedLane")
            if not isinstance(lane, str) or not lane.strip():
                continue
            profile = profiles.setdefault(
                lane,
                {
                    "decisionCount": 0,
                    "previewCount": 0,
                    "guardedExecutionCount": 0,
                    "handoffPackageCount": 0,
                    "premiumApprovalRequestCount": 0,
                    "localExplanationCount": 0,
                    "outcomeCount": 0,
                    "recentReasonCodes": [],
                    "latestEventAt": None,
                },
            )
            profile["decisionCount"] += 1
            if event.event_type == "routing.preview_recorded":
                profile["previewCount"] += 1
            elif event.event_type == "routing.utility_execution_authorized":
                profile["guardedExecutionCount"] += 1
            elif event.event_type == "routing.subscription_handoff_packaged":
                profile["handoffPackageCount"] += 1
            elif event.event_type == "routing.premium_approval_requested":
                profile["premiumApprovalRequestCount"] += 1
            elif event.event_type == "routing.local_evidence_explained":
                profile["localExplanationCount"] += 1
            elif event.event_type == "routing.outcome_recorded":
                profile["outcomeCount"] += 1
            if profile["latestEventAt"] is None:
                profile["latestEventAt"] = self._normalize_timestamp(event.created_at)
            reason_codes = payload.get("reasonCodes")
            if isinstance(reason_codes, list):
                for code in reason_codes:
                    if isinstance(code, str) and code not in profile["recentReasonCodes"]:
                        profile["recentReasonCodes"].append(code)
        return [
            RoutingLaneEvidenceProfileView(
                lane=lane,
                decisionCount=profile["decisionCount"],
                previewCount=profile["previewCount"],
                guardedExecutionCount=profile["guardedExecutionCount"],
                handoffPackageCount=profile["handoffPackageCount"],
                premiumApprovalRequestCount=profile["premiumApprovalRequestCount"],
                localExplanationCount=profile["localExplanationCount"],
                outcomeCount=profile["outcomeCount"],
                recentReasonCodes=profile["recentReasonCodes"][:8],
                latestEventAt=profile["latestEventAt"],
            )
            for lane, profile in sorted(profiles.items())
        ]

    async def get_recipe_gate_audit(self, session: AsyncSession, work_item_id: str) -> WorkItemRecipeGateAuditView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        recipe = self._execution_recipe_for_item(item)
        if not recipe:
            return None
        events = await self.list_work_item_events(session, work_item_id)
        return self._recipe_gate_audit_view(item, recipe, events)

    async def get_routing_preview(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemRoutingPreviewRequest | None = None,
    ) -> RoutingPreviewView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        profile = await self._routing_profile_for_item(session, item)
        if payload:
            profile = self._apply_routing_preview_request(profile, payload)
        decision = RoutingPreviewService().preview(profile, created_at=self._normalize_timestamp(item.updated_at))
        preview = RoutingPreviewView(
            profile=self._to_routing_profile_view(profile),
            decision=self._to_routing_decision_view(decision),
        )
        if payload and payload.recordEvent:
            await self._record_routing_preview_event(session, item, preview)
            await session.commit()
            await session.refresh(item)
        return preview

    async def get_task_packet_preview(self, session: AsyncSession, work_item_id: str) -> TaskPacketPreviewView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        preview = await self.get_routing_preview(session, work_item_id)
        if not preview:
            return None

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        source_artifact_path = metadata.get("sourceArtifactPath")
        priority = metadata.get("candidatePriority")
        verification_summary = metadata.get("verificationSummary")
        packet = TaskPacketV0View(
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            source=item.source,
            sourceArtifactPath=source_artifact_path if isinstance(source_artifact_path, str) and source_artifact_path else "not_recorded",
            taskKind=preview.profile.taskKind,
            riskLevel=item.risk_level,
            priority=priority if isinstance(priority, str) and priority else "normal",
            approvalMode=preview.decision.authorityMode,
            verificationSummary=verification_summary
            if isinstance(verification_summary, str) and verification_summary
            else "No verification summary recorded yet.",
        )
        return TaskPacketPreviewView(
            packet=packet,
            route=preview.decision,
            whyThisPath=preview.decision.humanExplanation,
            previewOnly=True,
            executionAttemptCreated=False,
            providerCallsAllowed=False,
            commandExecutionAllowed=False,
        )

    async def get_subscription_handoff_package(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemSubscriptionHandoffRequest,
    ) -> SubscriptionHandoffPackageView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        preview_payload = WorkItemRoutingPreviewRequest(
            stepId=payload.stepId,
            taskKind=payload.taskKind,
            recordEvent=False,
        )
        preview = await self.get_routing_preview(session, work_item_id, preview_payload)
        if not preview:
            return None
        if preview.decision.selectedLane != ExecutionLane.SUBSCRIPTION_HANDOFF.value:
            raise ValueError(f"Route selected {preview.decision.selectedLane}; subscription handoff package requires subscription_handoff.")

        events = await self.list_work_item_events(session, work_item_id)
        recipe = self._execution_recipe_for_item(item)
        package = SubscriptionHandoffPackageView(
            packageId=f"handoff-{preview.decision.decisionId}",
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            taskKind=preview.profile.taskKind,
            stepId=preview.profile.stepId,
            createdAt=datetime.now(timezone.utc),
            route=preview.decision,
            summary=self._subscription_handoff_summary(item, preview),
            context=self._subscription_handoff_context(item, preview),
            constraints=self._subscription_handoff_constraints(item, recipe, preview),
            allowedPaths=list(preview.profile.allowedPaths),
            validationCommands=list(preview.profile.validationExpectations),
            recentEvidence=[
                SubscriptionHandoffEvidenceView(
                    eventType=event.event_type,
                    summary=event.summary,
                    createdAt=self._normalize_timestamp(event.created_at),
                )
                for event in events[:8]
            ],
            operatorInstructions=self._subscription_handoff_operator_instructions(preview),
            launchAllowed=False,
        )
        if payload.recordEvent:
            await self._record_subscription_handoff_package_event(session, item, package)
            await session.commit()
            await session.refresh(item)
        return package

    async def get_premium_approval_request(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemPremiumApprovalRequest,
    ) -> PremiumApprovalRequestView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        preview_payload = WorkItemRoutingPreviewRequest(
            stepId=payload.stepId,
            taskKind=payload.taskKind,
            recordEvent=False,
        )
        preview = await self.get_routing_preview(session, work_item_id, preview_payload)
        if not preview:
            return None
        if ExecutionLane.PREMIUM_APPROVAL.value not in preview.decision.escalationPath:
            raise ValueError(
                f"Route selected {preview.decision.selectedLane}; premium approval request requires a premium escalation path."
            )
        if preview.profile.taskKind not in self._PREMIUM_APPROVAL_TASK_KINDS:
            raise ValueError(
                f"Task kind {preview.profile.taskKind} is not eligible for premium approval request artifacts."
            )

        events = await self.list_work_item_events(session, work_item_id)
        request = PremiumApprovalRequestView(
            approvalRequestId=f"premium-approval-{preview.decision.decisionId}",
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            taskKind=preview.profile.taskKind,
            stepId=preview.profile.stepId,
            createdAt=datetime.now(timezone.utc),
            requestedLane=ExecutionLane.PREMIUM_APPROVAL.value,
            route=preview.decision,
            justification=self._premium_approval_justification(item, preview, payload),
            requiredEvidence=self._premium_approval_required_evidence(preview),
            approvalChecklist=self._premium_approval_checklist(),
            riskControls=self._premium_approval_risk_controls(),
            recentEvidence=[
                PremiumApprovalEvidenceView(
                    eventType=event.event_type,
                    summary=event.summary,
                    createdAt=self._normalize_timestamp(event.created_at),
                )
                for event in events[:8]
            ],
            approvalReason=payload.approvalReason,
            executionAllowed=False,
        )
        if payload.recordEvent:
            await self._record_premium_approval_request_event(session, item, request)
            await session.commit()
            await session.refresh(item)
        return request

    async def evaluate_subscription_agent_launch_request(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemSubscriptionAgentLaunchRequest,
    ) -> SubscriptionAgentLaunchRequestView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        preview_payload = WorkItemRoutingPreviewRequest(
            stepId=payload.stepId,
            taskKind=payload.taskKind,
            recordEvent=False,
        )
        preview = await self.get_routing_preview(session, work_item_id, preview_payload)
        if not preview:
            return None
        if preview.decision.selectedLane != ExecutionLane.SUBSCRIPTION_HANDOFF.value:
            raise ValueError(
                f"Route selected {preview.decision.selectedLane}; subscription agent launch requires subscription_handoff."
            )
        if preview.profile.taskKind not in self._SUBSCRIPTION_AGENT_STUB_TASK_KINDS:
            raise ValueError(f"Task kind {preview.profile.taskKind} is not eligible for subscription agent launch.")

        requested_target = self.subscription_launch_registry.find_target(payload.requestedAgent)
        explicit_target = self.subscription_launch_registry.find_target(payload.targetId)
        target = explicit_target or requested_target or self.subscription_launch_registry.get_target(None)
        attempt_id = preview.decision.decisionId
        workspace_contract = self.disabled_subscription_launch_adapter.workspace_contract(
            attempt_id=attempt_id,
            target=target,
        )
        output_contract = self.disabled_subscription_launch_adapter.output_contract(attempt_id=attempt_id)
        lifecycle_evidence = self.disabled_subscription_launch_adapter.lifecycle_evidence(target)
        expected_values = {
            "workItemId": item.id,
            "executionAttemptId": attempt_id,
            "routeDecisionId": preview.decision.decisionId,
            "workerId": target.worker_id,
            "lane": ExecutionLane.SUBSCRIPTION_AGENT.value,
            "authorityMode": "operator_approval_required",
            "workspacePlanId": workspace_contract["workspacePlanId"],
            "launchPolicyId": target.launch_policy_id,
            "targetId": target.target_id,
            "commandTemplateId": target.command_template_id,
            "commandTemplateExecutionStatus": "executable_by_kendall",
            "approvalActor": "Operator",
            "approvalTimestamp": self._subscription_launch_datetime_as_utc(
                self._STORY_8_5_ACCEPTED_APPROVAL_TIMESTAMP
            ).isoformat(),
            "approvalExpiry": self._subscription_launch_datetime_as_utc(
                self._STORY_8_5_ACCEPTED_APPROVAL_EXPIRY
            ).isoformat(),
            "permissionEnvelope": "approved_for_one_artifact_only_subscription_launch",
            "environmentAllowlist": workspace_contract["environmentAllowlist"],
            "blockedCredentialSessionPaths": workspace_contract["forbiddenPaths"],
            "artifactLimits": {
                "rawOutputBytes": 0,
                "artifactReferenceOnly": True,
                "sourceMutationAllowed": False,
            },
            "redactionPolicy": "required",
            "truncationPolicy": "truncate_to_approved_artifact_limits",
            "outputPolicy": "artifact_references_only_no_raw_output",
            "startupTimeoutSeconds": 10,
            "runTimeoutSeconds": 30,
            "cancellationTimeoutSeconds": 5,
            "heartbeatPolicy": lifecycle_evidence["heartbeatPolicy"],
            "childProcessTreeTrackingPolicy": lifecycle_evidence["childProcessTreeTrackingPolicy"],
            "orphanDetectionPolicy": lifecycle_evidence["orphanDetectionPolicy"],
            "terminalStateReconciliationPolicy": lifecycle_evidence["terminalStateReconciliationPolicy"],
            "idempotentCleanupPolicy": lifecycle_evidence["idempotentCleanupPolicy"],
            "dashboardControls": "approval_bound_disabled_until_all_gates_green",
            "rollbackPolicy": lifecycle_evidence["rollbackPolicy"],
            "verificationCommand": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
            "allowedOutputMode": "artifact-only",
        }

        request_values = self._subscription_agent_launch_request_values(payload)
        missing_fields = [
            field
            for field in self._SUBSCRIPTION_AGENT_LAUNCH_REQUIRED_FIELDS
            if self._launch_envelope_value_missing(request_values.get(field))
        ]
        stale_fields = [
            field
            for field, expected_value in expected_values.items()
            if not self._launch_envelope_value_missing(request_values.get(field)) and request_values.get(field) != expected_value
        ]
        rejected_fields: dict[str, str] = {}
        if payload.requestedAgent is not None and requested_target is None:
            rejected_fields["requestedAgent"] = "unsupported_subscription_launch_target"
        if payload.targetId is not None and explicit_target is None:
            rejected_fields["targetId"] = "unsupported_subscription_launch_target"
        if requested_target and explicit_target and requested_target.target_id != explicit_target.target_id:
            rejected_fields["targetSelector"] = "requested_agent_and_target_id_disagree"
        rollback_reason = await self._subscription_launch_rollback_reason(session, item.id)
        if rollback_reason:
            rejected_fields["rollbackStatus"] = rollback_reason
        if payload.approvalTimestamp and payload.approvalExpiry:
            approval_timestamp = self._subscription_launch_datetime_as_utc(payload.approvalTimestamp)
            approval_expiry = self._subscription_launch_datetime_as_utc(payload.approvalExpiry)
            now = self._subscription_launch_now()
            if approval_timestamp > now + timedelta(minutes=1):
                if "approvalTimestamp" not in stale_fields:
                    stale_fields.append("approvalTimestamp")
                rejected_fields["approvalTimestamp"] = "future_effective_time"
            if approval_expiry <= approval_timestamp:
                rejected_fields["approvalExpiry"] = "not_after_approval_timestamp"
            if approval_expiry <= now:
                if "approvalExpiry" not in stale_fields:
                    stale_fields.append("approvalExpiry")
                rejected_fields["approvalExpiry"] = "expired"
        accepted_fixture_path = (
            not missing_fields
            and not stale_fields
            and not rejected_fields
            and target.target_id == "codex.subscription.disabled"
            and target.command_template_id == "codex-subscription-cli-template-disabled-v1"
            and payload.commandTemplateExecutionStatus == "executable_by_kendall"
            and payload.permissionEnvelope == "approved_for_one_artifact_only_subscription_launch"
            and payload.allowedOutputMode == "artifact-only"
        )
        runtime_approval = self._subscription_agent_runtime_approval_validation(
            payload=payload,
            item=item,
            preview=preview,
            target=target,
            workspace_contract=workspace_contract,
            lifecycle_evidence=lifecycle_evidence,
        )
        accepted_runtime_path = bool(runtime_approval["approved"]) and not rollback_reason
        if not accepted_runtime_path and (payload.approvalId or payload.authorityFamily or payload.operation):
            rejected_fields["runtimeApproval"] = ",".join(str(blocker) for blocker in runtime_approval["blockers"])
        if not missing_fields:
            if not target.enabled and not accepted_fixture_path and not accepted_runtime_path:
                rejected_fields["targetStatus"] = target.disabled_reason
            if not accepted_fixture_path and not accepted_runtime_path:
                rejected_fields["processLaunchPermission"] = "not_approved"

        runtime_metadata: dict[str, object] = {}
        record_event = bool(payload.recordEvent)
        if accepted_runtime_path:
            missing_fields = []
            stale_fields = []
            rejected_fields = {}
            if record_event:
                existing_attempt = await session.get(ExecutionAttempt, attempt_id)
                active_attempt = await self._active_execution_attempt(session, item.id)
                if existing_attempt:
                    runtime_metadata = {
                        "status": "replayed_existing_attempt",
                        "executionAttemptId": attempt_id,
                        "processStarted": False,
                        "rawStdoutRetained": False,
                        "rawStderrRetained": False,
                    }
                elif active_attempt:
                    accepted_runtime_path = False
                    rejected_fields["runtimeApproval"] = f"active-attempt-exists:{active_attempt.id}"
                    runtime_metadata = {
                        "status": "rejected_active_attempt_exists",
                        "executionAttemptId": attempt_id,
                        "processStarted": False,
                        "rawStdoutRetained": False,
                        "rawStderrRetained": False,
                    }
                    status = "rejected_process_launch_not_approved"
                    readiness_status = "subscription_launch_approval_rejected"
                else:
                    reserved = await self._reserve_subscription_agent_launch_runtime_attempt(
                        session,
                        item,
                        attempt_id=attempt_id,
                        preview=preview,
                        worker_id=target.worker_id,
                        lane=ExecutionLane.SUBSCRIPTION_AGENT.value,
                        authority_mode="operator_approval_required",
                        workspace_contract=self._subscription_agent_runtime_workspace_contract(
                            dict(workspace_contract),
                            attempt_id=attempt_id,
                        ),
                    )
                    if not reserved:
                        runtime_metadata = {
                            "status": "replayed_existing_attempt",
                            "executionAttemptId": attempt_id,
                            "processStarted": False,
                            "rawStdoutRetained": False,
                            "rawStderrRetained": False,
                        }
                    else:
                        runtime_cwd = self._subscription_agent_runtime_cwd(attempt_id)
                        runtime_cwd.mkdir(parents=True, exist_ok=True)
                        runtime_result = await self.supervised_subscription_launch_adapter.run(
                            command_argv=list(payload.commandArgv),
                            cwd=str(runtime_cwd),
                            environment_allowlist=list(payload.environmentAllowlist),
                            startup_timeout_seconds=int(payload.startupTimeoutSeconds or 10),
                            run_timeout_seconds=int(payload.runTimeoutSeconds or 30),
                            max_output_bytes=int((payload.artifactLimits or {}).get("rawOutputBytes", 0)),
                        )
                        runtime_metadata = runtime_result.to_metadata()
                if accepted_runtime_path:
                    status = f"accepted_supervised_runtime_{runtime_metadata['status']}"
                    readiness_status = f"subscription_launch_runtime_{runtime_metadata['status']}"
            else:
                status = "accepted_supervised_runtime_evaluation_ready"
                readiness_status = "subscription_launch_runtime_evaluation_ready"
        elif missing_fields:
            status = "rejected_missing_exact_approval"
            readiness_status = "blocked_pending_exact_launch_approval"
        elif stale_fields:
            status = "rejected_stale_exact_approval"
            readiness_status = "subscription_launch_approval_stale"
        elif rejected_fields.get("rollbackStatus"):
            status = "rejected_rollback_triggered"
            readiness_status = "subscription_launch_rollback_triggered"
        elif accepted_fixture_path:
            if payload.recordEvent:
                status = "accepted_artifact_only_fixture_completed"
                readiness_status = "subscription_launch_fixture_completed"
            else:
                status = "accepted_artifact_only_fixture_evaluation_ready"
                readiness_status = "subscription_launch_fixture_evaluation_ready"
        elif rejected_fields.get("targetStatus"):
            status = "rejected_target_not_enabled"
            readiness_status = "subscription_launch_approval_rejected"
        else:
            status = "rejected_process_launch_not_approved"
            readiness_status = "subscription_launch_approval_rejected"

        blocked_reason_ids = (
            []
            if accepted_fixture_path or accepted_runtime_path
            else self._subscription_agent_launch_blocked_reasons(
                missing_fields=missing_fields,
                stale_fields=stale_fields,
                rejected_fields=rejected_fields,
            )
        )
        output_artifact_summary = {
            "artifactReferenceOnly": output_contract.get("artifactReferenceOnly", True),
            "outputContractId": output_contract.get("outputContractId"),
            "boundedByteCounts": output_contract.get("boundedByteCounts") or {},
            "artifactReferences": output_contract.get("artifactReferences") or [],
            "workflowEventRawOutputAllowed": output_contract.get("workflowEventRawOutputAllowed", False),
            "generatedPatchHandling": output_contract.get("generatedPatchHandling"),
            "rawOutputStored": output_contract.get("rawOutputStored", False),
            "redactionRequired": output_contract.get("redactionRequired", True),
            "truncationApplied": output_contract.get("truncationApplied", False),
        }
        if accepted_fixture_path:
            output_artifact_summary["artifactReferences"] = self._subscription_agent_launch_fixture_artifacts(attempt_id)
            output_artifact_summary["boundedByteCounts"] = {"stdout": 0, "stderr": 0, "generatedFiles": 2}
        if accepted_runtime_path:
            workspace_contract = self._subscription_agent_runtime_workspace_contract(
                dict(workspace_contract),
                attempt_id=attempt_id,
            )
        runtime_process_started = bool(
            accepted_runtime_path
            and record_event
            and runtime_metadata.get("processStarted", True) is not False
        )
        mutation_attempted = bool((accepted_fixture_path and record_event) or runtime_process_started)
        launch_request = SubscriptionAgentLaunchRequestView(
            launchRequestId=f"subscription-agent-launch-request-{preview.decision.decisionId}",
            workItemId=item.id,
            status=status,
            readinessStatus=readiness_status,
            approvalAccepted=bool(accepted_fixture_path or accepted_runtime_path),
            processLaunchAllowed=mutation_attempted,
            executionAllowed=mutation_attempted,
            commandExecutionAllowed=runtime_process_started,
            sourceMutationAllowed=False,
            providerCallsAllowed=False,
            networkAllowed=False,
            credentialAccessAllowed=False,
            processLaunchAttempted=mutation_attempted,
            shellExecutionAttempted=False,
            credentialAccessAttempted=False,
            externalSendAttempted=False,
            missingEnvelopeFields=missing_fields,
            rejectedEnvelopeFields=rejected_fields,
            staleEnvelopeFields=stale_fields,
            blockedReasonIds=blocked_reason_ids,
            nextSafeAction=self._subscription_agent_launch_next_safe_action(missing_fields, stale_fields, rejected_fields),
            approvalBinding=self._subscription_agent_launch_evidence_binding(
                request_values=request_values,
                expected_values=expected_values,
                missing_fields=missing_fields,
                stale_fields=stale_fields,
                attempt_id=attempt_id,
            ),
            workspaceContract=workspace_contract,
            outputArtifactSummary=output_artifact_summary,
            lifecycleEvidence=lifecycle_evidence,
            safetyFlags={
                "sourceMutationAllowed": False,
                "issueSyncAllowed": False,
                "prCreationAllowed": False,
                "mergeAllowed": False,
                "cleanupAllowed": False,
                "failedCheckBypassAllowed": False,
                "providerCallsAllowed": False,
                "claudeLaunchAllowed": False,
                "credentialAccessAllowed": False,
                "networkAllowed": False,
                "broadAutonomyAllowed": False,
            },
            mutationContract=self._subscription_agent_launch_mutation_contract(
                record_event=record_event,
                accepted_fixture_path=accepted_fixture_path,
                launch_request_id=f"subscription-agent-launch-request-{preview.decision.decisionId}",
                attempt_id=attempt_id,
            ),
            runtimeEvidence=runtime_metadata,
        )
        # recordEvent=false is an evaluation-only path; only true mutates event or attempt state.
        if not record_event:
            return launch_request
        if accepted_runtime_path:
            if runtime_metadata.get("status") == "replayed_existing_attempt":
                return launch_request
            await self._record_subscription_agent_launch_runtime_attempt(
                session,
                item,
                launch_request,
                attempt_id=attempt_id,
                preview=preview,
            )
            await session.commit()
            await session.refresh(item)
        elif accepted_fixture_path:
            existing_attempt = await session.get(ExecutionAttempt, attempt_id)
            if existing_attempt:
                if not self._subscription_agent_launch_attempt_matches_request(
                    existing_attempt,
                    launch_request,
                    preview=preview,
                ):
                    raise ValueError(f"Subscription-agent launch attempt {attempt_id} exists with different evidence.")
                return launch_request
            await self._record_subscription_agent_launch_fixture_attempt(
                session,
                item,
                launch_request,
                attempt_id=attempt_id,
                preview=preview,
            )
            await session.commit()
            await session.refresh(item)
        else:
            existing_rejection = await self._subscription_agent_launch_existing_rejection_event(
                session,
                item.id,
                launch_request,
            )
            if existing_rejection:
                return launch_request
            await self._record_subscription_agent_launch_rejection_event(session, item, launch_request)
            await session.commit()
            await session.refresh(item)
        return launch_request

    def _subscription_agent_target_gate_enabled(self, target_id: str) -> bool:
        target_gate_enabled = {
            "codex.subscription.disabled": self.settings.allow_codex_subscription_agent_launch,
            "claude.subscription.disabled": self.settings.allow_claude_subscription_agent_launch,
            "gemini.subscription.disabled": self.settings.allow_gemini_subscription_agent_launch,
        }
        return bool(self.settings.allow_subscription_agent_launch and target_gate_enabled.get(target_id, False))

    def _accepted_subscription_runtime_approval_ids(self) -> set[str]:
        configured_ids = os.environ.get(
            "SUPERVISOR_ACCEPTED_SUBSCRIPTION_RUNTIME_APPROVAL_IDS",
            self.settings.accepted_subscription_runtime_approval_ids,
        )
        return {
            approval_id.strip()
            for approval_id in configured_ids.split(",")
            if approval_id.strip()
        }

    def _subscription_agent_runtime_command_argv(self, target_id: str) -> list[str]:
        command_name = target_id.split(".", maxsplit=1)[0]
        return [command_name, "--version"]

    def _subscription_agent_runtime_cwd(self, attempt_id: str) -> Path:
        return Path(os.getcwd()) / "_bmad-output" / "subscription-runtime" / attempt_id

    def _subscription_agent_runtime_approval_id(
        self,
        *,
        item: WorkItem,
        preview: RoutingPreviewView,
        target,
        workspace_contract: dict[str, object],
    ) -> str:
        identity = "|".join(
            [
                "subscription-agent-launch",
                "one bounded supervised process-launch operation",
                item.id,
                preview.decision.decisionId,
                target.target_id,
                target.command_template_id,
                workspace_contract["workspacePlanId"],
                " ".join(self._subscription_agent_runtime_command_argv(target.target_id)),
            ]
        )
        return f"subscription-runtime-approval-{uuid.uuid5(uuid.NAMESPACE_URL, identity)}"

    def _subscription_agent_runtime_workspace_contract(self, workspace_contract: dict[str, object], *, attempt_id: str) -> dict[str, object]:
        runtime_cwd = self._subscription_agent_runtime_cwd(attempt_id)
        workspace_contract.update(
            {
                "materializationMode": "bounded_runtime_workspace_created_under_supervisor_output_root",
                "runtimeCwd": str(runtime_cwd),
                "writeRoots": [str(runtime_cwd)],
                "permissionEnvelope": "approved_for_one_bounded_supervised_subscription_launch",
                "commandsAllowed": True,
                "processLaunchAllowed": True,
                "sourceMutationAllowed": False,
                "credentialAccessAllowed": False,
                "externalSendAllowed": False,
            }
        )
        return workspace_contract

    def _subscription_agent_runtime_accepted_approval_instance(
        self,
        *,
        payload: WorkItemSubscriptionAgentLaunchRequest,
        item: WorkItem,
        preview: RoutingPreviewView,
        target,
        workspace_contract: dict[str, object],
        lifecycle_evidence: dict[str, object],
    ) -> dict[str, object] | None:
        expected_approval_id = self._subscription_agent_runtime_approval_id(
            item=item,
            preview=preview,
            target=target,
            workspace_contract=workspace_contract,
        )
        if (
            not isinstance(payload.approvalId, str)
            or payload.approvalId.strip() != expected_approval_id
            or expected_approval_id not in self._accepted_subscription_runtime_approval_ids()
        ):
            return None
        attempt_id = payload.executionAttemptId or payload.attemptId or preview.decision.decisionId
        return {
            "approvalId": expected_approval_id,
            "status": "accepted",
            "authorityFamily": "subscription-agent-launch",
            "operation": "one bounded supervised process-launch operation",
            "workItemId": item.id,
            "executionAttemptId": preview.decision.decisionId,
            "routeDecisionId": preview.decision.decisionId,
            "workerId": target.worker_id,
            "lane": ExecutionLane.SUBSCRIPTION_AGENT.value,
            "authorityMode": "operator_approval_required",
            "workspacePlanId": workspace_contract["workspacePlanId"],
            "launchPolicyId": target.launch_policy_id,
            "targetId": target.target_id,
            "commandTemplateId": target.command_template_id,
            "commandTemplateExecutionStatus": "executable_by_kendall_supervised_runtime",
            "permissionEnvelope": "approved_for_one_bounded_supervised_subscription_launch",
            "environmentAllowlist": list(workspace_contract["environmentAllowlist"]),
            "blockedCredentialSessionPaths": list(workspace_contract["forbiddenPaths"]),
            "artifactLimits": {"rawOutputBytes": 0, "artifactReferenceOnly": True, "sourceMutationAllowed": False},
            "redactionPolicy": "metadata_only_no_raw_output_generated_patch_prompt_completion_provider_payload",
            "truncationPolicy": "truncate_to_approved_artifact_limits",
            "outputPolicy": "artifact_references_only_no_raw_output",
            "startupTimeoutSeconds": 10,
            "runTimeoutSeconds": 30,
            "cancellationTimeoutSeconds": 5,
            "startupTimeoutPolicy": "bounded_startup_timeout_enforced_before_process_run",
            "runTimeoutPolicy": "bounded_run_timeout_enforced_with_discard_only_output_counters",
            "cancellationTimeoutPolicy": "direct_process_kill_then_wait_without_child_tree_claims",
            "heartbeatPolicy": "not_enforced_for_single_bounded_probe",
            "childProcessTreeTrackingPolicy": "not_claimed_direct_process_only",
            "orphanDetectionPolicy": "not_claimed_direct_process_only",
            "terminalStateReconciliationPolicy": "direct_process_returncode_reconciled",
            "idempotentCleanupPolicy": "runtime_workspace_cleanup_deferred_no_source_or_branch_deletion",
            "approvalActor": "Operator",
            "commandArgv": self._subscription_agent_runtime_command_argv(target.target_id),
            "cwd": str(self._subscription_agent_runtime_cwd(str(attempt_id))),
            "retainedEvidence": ["approval_instance_id", "attempt_id", "runtime_metadata", "artifact_references"],
            "rollbackPolicy": "disable subscription-agent process launch and return to artifact-only fixture evidence",
            "verificationCommand": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
            "allowedOutputMode": "summary-and-artifact-references-only",
            "stopLines": [
                "Do not use shell string execution.",
                "Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, or provider credentials.",
                "Do not call local, remote, or premium providers unless separately approved.",
                "Do not mutate source unless separately approved.",
                "Disable subscription-agent process launch if approval binding is stale.",
            ],
        }

    def _subscription_agent_runtime_approval_validation(
        self,
        *,
        payload: WorkItemSubscriptionAgentLaunchRequest,
        item: WorkItem,
        preview: RoutingPreviewView,
        target,
        workspace_contract: dict[str, object],
        lifecycle_evidence: dict[str, object],
    ) -> dict[str, object]:
        blockers: list[str] = []
        if not self._subscription_agent_target_gate_enabled(target.target_id):
            blockers.append("subscription-agent-runtime-gates-disabled")
        accepted_instance = self._subscription_agent_runtime_accepted_approval_instance(
            payload=payload,
            item=item,
            preview=preview,
            target=target,
            workspace_contract=workspace_contract,
            lifecycle_evidence=lifecycle_evidence,
        )
        if accepted_instance is None:
            blockers.append("accepted-approval-instance-not-registered")
            accepted_instance = {}
        expected_pairs = [
            ("approvalId", payload.approvalId, accepted_instance.get("approvalId")),
            ("authorityFamily", payload.authorityFamily, accepted_instance.get("authorityFamily")),
            ("operation", payload.operation, accepted_instance.get("operation")),
            ("workItemId", payload.workItemId, accepted_instance.get("workItemId")),
            ("executionAttemptId", payload.executionAttemptId or payload.attemptId, accepted_instance.get("executionAttemptId")),
            ("routeDecisionId", payload.routeDecisionId, accepted_instance.get("routeDecisionId")),
            ("workerId", payload.workerId, accepted_instance.get("workerId")),
            ("lane", payload.lane, accepted_instance.get("lane")),
            ("authorityMode", payload.authorityMode, accepted_instance.get("authorityMode")),
            ("workspacePlanId", payload.workspacePlanId, accepted_instance.get("workspacePlanId")),
            ("launchPolicyId", payload.launchPolicyId, accepted_instance.get("launchPolicyId")),
            ("targetId", payload.targetId, accepted_instance.get("targetId")),
            ("commandTemplateId", payload.commandTemplateId, accepted_instance.get("commandTemplateId")),
            ("commandTemplateExecutionStatus", payload.commandTemplateExecutionStatus, accepted_instance.get("commandTemplateExecutionStatus")),
            ("permissionEnvelope", payload.permissionEnvelope, accepted_instance.get("permissionEnvelope")),
            ("redactionPolicy", payload.redactionPolicy, accepted_instance.get("redactionPolicy")),
            ("truncationPolicy", payload.truncationPolicy, accepted_instance.get("truncationPolicy")),
            ("outputPolicy", payload.outputPolicy, accepted_instance.get("outputPolicy")),
            ("startupTimeoutSeconds", payload.startupTimeoutSeconds, accepted_instance.get("startupTimeoutSeconds")),
            ("runTimeoutSeconds", payload.runTimeoutSeconds, accepted_instance.get("runTimeoutSeconds")),
            ("cancellationTimeoutSeconds", payload.cancellationTimeoutSeconds, accepted_instance.get("cancellationTimeoutSeconds")),
            ("startupTimeoutPolicy", payload.startupTimeoutPolicy, accepted_instance.get("startupTimeoutPolicy")),
            ("runTimeoutPolicy", payload.runTimeoutPolicy, accepted_instance.get("runTimeoutPolicy")),
            ("cancellationTimeoutPolicy", payload.cancellationTimeoutPolicy, accepted_instance.get("cancellationTimeoutPolicy")),
            ("heartbeatPolicy", payload.heartbeatPolicy, accepted_instance.get("heartbeatPolicy")),
            ("childProcessTreeTrackingPolicy", payload.childProcessTreeTrackingPolicy, accepted_instance.get("childProcessTreeTrackingPolicy")),
            ("orphanDetectionPolicy", payload.orphanDetectionPolicy, accepted_instance.get("orphanDetectionPolicy")),
            ("terminalStateReconciliationPolicy", payload.terminalStateReconciliationPolicy, accepted_instance.get("terminalStateReconciliationPolicy")),
            ("idempotentCleanupPolicy", payload.idempotentCleanupPolicy, accepted_instance.get("idempotentCleanupPolicy")),
            ("verificationCommand", payload.verificationCommand, accepted_instance.get("verificationCommand")),
            ("allowedOutputMode", payload.allowedOutputMode, accepted_instance.get("allowedOutputMode")),
            ("cwd", payload.cwd, accepted_instance.get("cwd")),
            ("approvalActor", payload.approvalActor, accepted_instance.get("approvalActor")),
            ("rollbackPolicy", payload.rollbackPolicy, accepted_instance.get("rollbackPolicy")),
        ]
        for field_name, actual, expected in expected_pairs:
            if actual != expected:
                blockers.append(f"{field_name}-mismatch")
        if list(payload.environmentAllowlist) != list(accepted_instance.get("environmentAllowlist", [])):
            blockers.append("environmentAllowlist-mismatch")
        if list(payload.blockedCredentialSessionPaths) != list(accepted_instance.get("blockedCredentialSessionPaths", [])):
            blockers.append("blockedCredentialSessionPaths-mismatch")
        if payload.artifactLimits != accepted_instance.get("artifactLimits"):
            blockers.append("artifactLimits-mismatch")
        if list(payload.commandArgv) != list(accepted_instance.get("commandArgv", [])):
            blockers.append("commandArgv-mismatch")
        if any(any(token in part for token in ["&", "|", ";", ">", "<"]) for part in payload.commandArgv):
            blockers.append("commandArgv-shell-token-rejected")
        if list(payload.retainedEvidence) != list(accepted_instance.get("retainedEvidence", [])):
            blockers.append("retainedEvidence-missing")
        if list(payload.stopLines) != list(accepted_instance.get("stopLines", [])):
            blockers.append("stopLines-mismatch")
        now = self._subscription_launch_now()
        if payload.approvalTimestamp is None:
            blockers.append("approvalTimestamp-missing")
        else:
            approval_timestamp = self._subscription_launch_datetime_as_utc(payload.approvalTimestamp)
            if approval_timestamp > now + timedelta(minutes=1):
                blockers.append("approvalTimestamp-future")
        if payload.approvalExpiry is None:
            blockers.append("approvalExpiry-missing")
        else:
            approval_expiry = self._subscription_launch_datetime_as_utc(payload.approvalExpiry)
            if approval_expiry <= now:
                blockers.append("approvalExpiry-expired")
            if payload.approvalTimestamp and approval_expiry <= self._subscription_launch_datetime_as_utc(payload.approvalTimestamp):
                blockers.append("approvalExpiry-not-after-approvalTimestamp")
        if payload.permissionEnvelope == "approved_for_one_artifact_only_subscription_launch":
            blockers.append("artifact-only-approval-reuse-rejected")
        unique_blockers = list(dict.fromkeys(blockers))
        return {"approved": not unique_blockers, "blockers": unique_blockers}

    async def _subscription_agent_launch_existing_rejection_event(
        self,
        session: AsyncSession,
        work_item_id: str,
        launch_request: SubscriptionAgentLaunchRequestView,
    ) -> WorkflowEvent | None:
        expected_fingerprint = self._subscription_agent_launch_rejection_fingerprint(launch_request)
        result = await session.execute(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.work_item_id == work_item_id,
                WorkflowEvent.event_type == "routing.subscription_agent_launch_rejected",
            )
            .order_by(WorkflowEvent.created_at.desc())
        )
        for event in result.scalars():
            payload = event.payload if isinstance(event.payload, dict) else {}
            if (
                payload.get("launchRequestId") == launch_request.launchRequestId
                and self._subscription_agent_launch_rejection_fingerprint_from_payload(payload) == expected_fingerprint
            ):
                return event
        return None

    def _subscription_agent_launch_mutation_contract(
        self,
        *,
        record_event: bool,
        accepted_fixture_path: bool,
        launch_request_id: str,
        attempt_id: str,
    ) -> dict[str, object]:
        return {
            "recordEvent": record_event,
            "mode": "mutating" if record_event else "read_only_evaluation",
            "launchRequestId": launch_request_id,
            "eventIdentity": {
                "rejection": launch_request_id,
                "acceptedFixtureAttempt": attempt_id,
            },
            "immutableFields": [
                "workItemId",
                "routeDecisionId",
                "workerId",
                "lane",
                "authorityMode",
                "workspacePlanId",
                "launchPolicyId",
                "targetId",
                "commandTemplateId",
                "approvalTimestamp",
                "approvalExpiry",
                "permissionEnvelope",
            ],
            "mutableFields": [],
            "derivedStateRecomputed": [
                "status",
                "readinessStatus",
                "blockedReasonIds",
                "nextSafeAction",
                "approvalBinding",
                "outputArtifactSummary",
                "safetyFlags",
            ],
            "replayBehavior": (
                "same accepted fixture attempt id is a stable no-op"
                if accepted_fixture_path
                else "same rejection fingerprint is a stable no-op"
            ),
            "ordering": "workflow event createdAt order; accepted fixture lifecycle eventRefs preserve explicit event order",
            "failureBehavior": "ambiguous, stale, mismatched, partial, or out-of-order mutation fails closed without readiness advancement",
            "authorityBoundary": "metadata_only_no_provider_credential_source_mutation_retry_pr_merge_cleanup_or_failed_check_bypass",
        }

    def _subscription_agent_launch_attempt_matches_request(
        self,
        attempt: ExecutionAttempt,
        launch_request: SubscriptionAgentLaunchRequestView,
        *,
        preview: RoutingPreviewView,
    ) -> bool:
        return (
            attempt.work_item_id == launch_request.workItemId
            and attempt.route_decision_id == preview.decision.decisionId
            and attempt.worker_id == str(launch_request.approvalBinding.get("workerId"))
            and attempt.lane == str(launch_request.approvalBinding.get("lane"))
            and attempt.authority_mode == str(launch_request.approvalBinding.get("authorityMode"))
            and attempt.status == ExecutionAttemptStatus.COMPLETED.value
            and bool(attempt.event_refs_json)
            and bool(attempt.artifact_refs_json)
        )

    def _subscription_agent_launch_rejection_fingerprint(
        self,
        launch_request: SubscriptionAgentLaunchRequestView,
    ) -> dict[str, object]:
        return {
            "status": launch_request.status,
            "readinessStatus": launch_request.readinessStatus,
            "missingEnvelopeFields": list(launch_request.missingEnvelopeFields),
            "rejectedEnvelopeFields": dict(launch_request.rejectedEnvelopeFields),
            "staleEnvelopeFields": list(launch_request.staleEnvelopeFields),
            "blockedReasonIds": list(launch_request.blockedReasonIds),
        }

    def _subscription_agent_launch_rejection_fingerprint_from_payload(
        self,
        payload: dict[str, object],
    ) -> dict[str, object]:
        return {
            "status": payload.get("status"),
            "readinessStatus": payload.get("readinessStatus"),
            "missingEnvelopeFields": list(payload.get("missingEnvelopeFields") or []),
            "rejectedEnvelopeFields": dict(payload.get("rejectedEnvelopeFields") or {}),
            "staleEnvelopeFields": list(payload.get("staleEnvelopeFields") or []),
            "blockedReasonIds": list(payload.get("blockedReasonIds") or []),
        }

    async def _subscription_launch_rollback_reason(self, session: AsyncSession, work_item_id: str) -> str | None:
        result = await session.execute(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.work_item_id == work_item_id,
                WorkflowEvent.event_type == "execution_attempt.verification_recorded",
            )
            .order_by(WorkflowEvent.created_at.desc())
        )
        for event in result.scalars():
            payload = event.payload if isinstance(event.payload, dict) else {}
            verification = payload.get("subscriptionLaunchVerification")
            if isinstance(verification, dict) and verification.get("rollbackStatus") == "triggered":
                reason = verification.get("rollbackReason")
                return str(reason) if reason else "subscription_launch_rollback_triggered"
        return None

    def _subscription_agent_launch_fixture_artifacts(self, attempt_id: str) -> list[dict[str, object]]:
        return [
            {
                "artifactId": f"subscription-fixture-output-summary-{attempt_id}",
                "artifactKind": "fixture_output_summary",
                "path": f"_bmad-output/subscription-launch/{attempt_id}/fixture-output-summary.json",
                "verificationCommand": "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
                "rawPayloadStored": False,
                "operatorReviewRequired": True,
            },
            {
                "artifactId": f"subscription-fixture-generated-patch-reference-{attempt_id}",
                "artifactKind": "fixture_generated_patch_reference",
                "path": f"_bmad-output/subscription-launch/{attempt_id}/fixture-generated.patch",
                "applied": False,
                "operatorReviewRequired": True,
            },
        ]

    async def _record_subscription_agent_launch_fixture_attempt(
        self,
        session: AsyncSession,
        item: WorkItem,
        launch_request: SubscriptionAgentLaunchRequestView,
        *,
        attempt_id: str,
        preview: RoutingPreviewView,
    ) -> None:
        if await session.get(ExecutionAttempt, attempt_id):
            raise ValueError(f"Subscription-agent launch attempt {attempt_id} already exists.")
        active_attempt = await self._active_execution_attempt(session, item.id)
        if active_attempt:
            raise ValueError(f"Work item already has active execution attempt {active_attempt.id}.")
        prior_fixture_result = await session.execute(
            select(ExecutionAttempt)
            .where(
                ExecutionAttempt.work_item_id == item.id,
                ExecutionAttempt.worker_id == "subscription.agent.disabled",
                ExecutionAttempt.lane == ExecutionLane.SUBSCRIPTION_AGENT.value,
            )
            .limit(1)
        )
        prior_fixture_attempt = prior_fixture_result.scalar_one_or_none()
        if prior_fixture_attempt:
            raise ValueError(
                f"Work item already has subscription-agent launch attempt {prior_fixture_attempt.id}."
            )

        now = datetime.now(timezone.utc)
        attempt = ExecutionAttempt(
            id=attempt_id,
            work_item_id=item.id,
            route_decision_id=preview.decision.decisionId,
            worker_id=str(launch_request.approvalBinding["workerId"]),
            lane=str(launch_request.approvalBinding["lane"]),
            authority_mode=str(launch_request.approvalBinding["authorityMode"]),
            status=ExecutionAttemptStatus.COMPLETED.value,
            requested_by_label="Operator",
            workspace_isolation_plan_json=self._subscription_agent_launch_workspace_isolation_plan(launch_request.workspaceContract),
            artifact_refs_json=launch_request.outputArtifactSummary["artifactReferences"],
            event_refs_json=[],
            started_at=now,
            completed_at=now,
            heartbeat_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        try:
            await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            raise ValueError(f"Subscription-agent launch attempt {attempt_id} already exists.") from exc
        started_event = await self._record_subscription_agent_launch_fixture_event(
            session,
            item,
            attempt,
            launch_request,
            event_type="execution_attempt.subscription_launch_fixture_started",
            summary="Subscription-agent artifact-only fixture launch entered the approved starting path.",
        )
        timeout_event = await self._record_subscription_agent_launch_fixture_event(
            session,
            item,
            attempt,
            launch_request,
            event_type="execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
            summary="Subscription-agent artifact-only fixture timeout metadata recorded without process signal.",
        )
        cancellation_event = await self._record_subscription_agent_launch_fixture_event(
            session,
            item,
            attempt,
            launch_request,
            event_type="execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
            summary="Subscription-agent artifact-only fixture cancellation metadata recorded without OS signal.",
        )
        rollback_event = await self._record_subscription_agent_launch_fixture_event(
            session,
            item,
            attempt,
            launch_request,
            event_type="execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
            summary="Subscription-agent artifact-only fixture rollback-disabled metadata recorded without resource deletion.",
        )
        completed_event = await self._record_subscription_agent_launch_fixture_event(
            session,
            item,
            attempt,
            launch_request,
            event_type="execution_attempt.subscription_launch_fixture_completed",
            summary="Subscription-agent artifact-only fixture launch completed with metadata-only evidence.",
        )
        await session.flush()
        attempt.event_refs_json = [
            {"eventId": started_event.id, "eventType": started_event.event_type},
            {"eventId": timeout_event.id, "eventType": timeout_event.event_type},
            {"eventId": cancellation_event.id, "eventType": cancellation_event.event_type},
            {"eventId": rollback_event.id, "eventType": rollback_event.event_type},
            {"eventId": completed_event.id, "eventType": completed_event.event_type},
        ]

    async def _reserve_subscription_agent_launch_runtime_attempt(
        self,
        session: AsyncSession,
        item: WorkItem,
        *,
        attempt_id: str,
        preview: RoutingPreviewView,
        worker_id: str,
        lane: str,
        authority_mode: str,
        workspace_contract: dict[str, object],
    ) -> bool:
        if await session.get(ExecutionAttempt, attempt_id):
            return False
        active_attempt = await self._active_execution_attempt(session, item.id)
        if active_attempt:
            return False

        now = datetime.now(timezone.utc)
        attempt = ExecutionAttempt(
            id=attempt_id,
            work_item_id=item.id,
            route_decision_id=preview.decision.decisionId,
            worker_id=worker_id,
            lane=lane,
            authority_mode=authority_mode,
            status=ExecutionAttemptStatus.STARTING.value,
            requested_by_label="Operator",
            workspace_isolation_plan_json=self._subscription_agent_launch_workspace_isolation_plan(workspace_contract),
            artifact_refs_json=[],
            event_refs_json=[],
            started_at=now,
            completed_at=None,
            heartbeat_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        try:
            await session.flush()
            await session.commit()
        except IntegrityError:
            await session.rollback()
            return False
        return True

    async def _record_subscription_agent_launch_runtime_attempt(
        self,
        session: AsyncSession,
        item: WorkItem,
        launch_request: SubscriptionAgentLaunchRequestView,
        *,
        attempt_id: str,
        preview: RoutingPreviewView,
    ) -> None:
        now = datetime.now(timezone.utc)
        runtime_status = str(launch_request.runtimeEvidence.get("status") or "completed")
        terminal_status = {
            "completed": ExecutionAttemptStatus.COMPLETED.value,
            "timed_out": ExecutionAttemptStatus.TIMED_OUT.value,
            "cancelled": ExecutionAttemptStatus.CANCELLED.value,
        }.get(runtime_status, ExecutionAttemptStatus.FAILED.value)
        attempt = await session.get(ExecutionAttempt, attempt_id)
        if attempt:
            if attempt.work_item_id != item.id or attempt.route_decision_id != preview.decision.decisionId:
                raise ValueError(f"Subscription-agent launch attempt {attempt_id} does not match this request.")
            attempt.worker_id = str(launch_request.approvalBinding["workerId"])
            attempt.lane = str(launch_request.approvalBinding["lane"])
            attempt.authority_mode = str(launch_request.approvalBinding["authorityMode"])
            attempt.status = terminal_status
            attempt.workspace_isolation_plan_json = self._subscription_agent_launch_workspace_isolation_plan(
                launch_request.workspaceContract
            )
            attempt.artifact_refs_json = launch_request.outputArtifactSummary["artifactReferences"]
            attempt.started_at = attempt.started_at or now
            attempt.completed_at = now
            attempt.heartbeat_at = now
            attempt.updated_at = now
        else:
            active_attempt = await self._active_execution_attempt(session, item.id)
            if active_attempt:
                raise ValueError(f"Work item already has active execution attempt {active_attempt.id}.")
            attempt = ExecutionAttempt(
                id=attempt_id,
                work_item_id=item.id,
                route_decision_id=preview.decision.decisionId,
                worker_id=str(launch_request.approvalBinding["workerId"]),
                lane=str(launch_request.approvalBinding["lane"]),
                authority_mode=str(launch_request.approvalBinding["authorityMode"]),
                status=terminal_status,
                requested_by_label="Operator",
                workspace_isolation_plan_json=self._subscription_agent_launch_workspace_isolation_plan(
                    launch_request.workspaceContract
                ),
                artifact_refs_json=launch_request.outputArtifactSummary["artifactReferences"],
                event_refs_json=[],
                started_at=now,
                completed_at=now,
                heartbeat_at=now,
                created_at=now,
                updated_at=now,
            )
            session.add(attempt)
        await session.flush()
        runtime_event = await self._record_event(
            session,
            item,
            "execution_attempt.subscription_launch_runtime_recorded",
            f"Subscription-agent supervised runtime recorded terminal metadata: {runtime_status}.",
            {
                "launchRequestId": launch_request.launchRequestId,
                "workItemId": item.id,
                "executionAttemptId": attempt.id,
                "attemptStatus": attempt.status,
                "status": launch_request.status,
                "readinessStatus": launch_request.readinessStatus,
                "approvalAccepted": True,
                "approvalBinding": launch_request.approvalBinding,
                "workspaceContract": launch_request.workspaceContract,
                "outputArtifactSummary": launch_request.outputArtifactSummary,
                "runtimeEvidence": launch_request.runtimeEvidence,
                "artifactReferenceOnly": True,
                "rawOutputStored": False,
                "processLaunchAllowed": True,
                "executionAllowed": True,
                "commandExecutionAllowed": True,
                "sourceMutationAllowed": False,
                "providerCallsAllowed": False,
                "networkAllowed": False,
                "credentialAccessAllowed": False,
                "processLaunchAttempted": True,
                "shellExecutionAttempted": False,
                "credentialAccessAttempted": False,
                "externalSendAttempted": False,
                "safetyFlags": launch_request.safetyFlags,
                "mutationContract": launch_request.mutationContract,
            },
        )
        await session.flush()
        attempt.event_refs_json = [{"eventId": runtime_event.id, "eventType": runtime_event.event_type}]

    def _subscription_agent_launch_workspace_isolation_plan(self, workspace_contract: dict[str, object]) -> dict[str, object]:
        return {
            "planId": str(workspace_contract.get("workspacePlanId") or "subscription-workspace-plan-not-recorded"),
            "sourceSnapshotStrategy": "metadata_only_no_source_snapshot",
            "branchStrategy": "none_artifact_only_fixture",
            "readRoots": ["."],
            "writeRoots": list(workspace_contract.get("writeRoots") or []),
            "artifactRoot": str(workspace_contract.get("artifactRoot") or "_bmad-output/subscription-launch"),
            "forbiddenPaths": list(workspace_contract.get("forbiddenPaths") or []),
            "cleanupRule": str(workspace_contract.get("idempotentCleanupPolicy") or "cleanup_is_metadata_only_and_idempotent_without_deletion"),
            "rollbackRule": str(workspace_contract.get("rollbackPolicy") or "rollback_records_global_disable_without_resource_deletion"),
            "diffCaptureRule": "metadata_only_no_source_diff_capture",
            "writesAllowed": False,
            "sourceMutationAllowed": False,
            "commandsAllowed": False,
            "networkAllowed": False,
            "credentialAccessAllowed": False,
            "redactionBoundary": ["workflow_event_metadata_only", "artifact_references_only"],
            "allowedCommandClasses": [],
            "blockedCommandClasses": ["shell", "provider", "network", "credential", "source_mutation"],
            "providerEndpointPolicy": "provider_endpoints_denied",
            "promptConstructionPolicy": "no_prompt_construction",
            "boundaryRejectionReason": "subscription_launch_fixture_artifact_only_boundary",
            "materializationMode": str(workspace_contract.get("materializationMode") or "artifact_only_no_workspace_created"),
            "environmentPolicy": str(workspace_contract.get("environmentPolicy") or "deny_inheritance_allowlist_only"),
            "environmentAllowlist": list(workspace_contract.get("environmentAllowlist") or []),
            "sessionBoundary": str(workspace_contract.get("sessionBoundary") or "credentials_sessions_and_shell_profiles_forbidden"),
            "outputPolicy": str(workspace_contract.get("outputPolicy") or "artifact_references_only_no_raw_output"),
        }

    async def _record_subscription_agent_launch_fixture_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        launch_request: SubscriptionAgentLaunchRequestView,
        *,
        event_type: str,
        summary: str,
    ) -> WorkflowEvent:
        return await self._record_event(
            session,
            item,
            event_type,
            summary,
            {
                "launchRequestId": launch_request.launchRequestId,
                "workItemId": item.id,
                "executionAttemptId": attempt.id,
                "attemptStatus": attempt.status,
                "status": launch_request.status,
                "readinessStatus": launch_request.readinessStatus,
                "approvalAccepted": True,
                "approvalBinding": launch_request.approvalBinding,
                "workspaceContract": launch_request.workspaceContract,
                "workspacePlanId": launch_request.workspaceContract.get("workspacePlanId"),
                "launchPolicyId": launch_request.approvalBinding.get("launchPolicyId"),
                "targetId": launch_request.approvalBinding.get("targetId"),
                "commandTemplateId": launch_request.approvalBinding.get("commandTemplateId"),
                "commandTemplateExecutable": True,
                "outputContractId": launch_request.outputArtifactSummary.get("outputContractId"),
                "outputArtifactSummary": launch_request.outputArtifactSummary,
                "lifecyclePolicy": launch_request.lifecycleEvidence.get("lifecyclePolicy"),
                "stateMapping": launch_request.lifecycleEvidence.get("stateMapping"),
                "terminalStates": launch_request.lifecycleEvidence.get("terminalStates"),
                "lifecyclePolicyResults": {
                    "heartbeatPolicy": launch_request.lifecycleEvidence.get("heartbeatPolicy"),
                    "childProcessTreeTrackingPolicy": launch_request.lifecycleEvidence.get("childProcessTreeTrackingPolicy"),
                    "orphanDetectionPolicy": launch_request.lifecycleEvidence.get("orphanDetectionPolicy"),
                    "terminalStateReconciliationPolicy": launch_request.lifecycleEvidence.get("terminalStateReconciliationPolicy"),
                    "idempotentCleanupPolicy": launch_request.lifecycleEvidence.get("idempotentCleanupPolicy"),
                    "rollbackPolicy": launch_request.lifecycleEvidence.get("rollbackPolicy"),
                },
                "timeoutPolicy": launch_request.lifecycleEvidence.get("timeoutPolicy"),
                "cancellationPolicy": launch_request.lifecycleEvidence.get("cancellationPolicy"),
                "cleanupPolicy": launch_request.lifecycleEvidence.get("cleanupPolicy"),
                "artifactReferenceOnly": True,
                "rawOutputStored": False,
                "processLaunchAllowed": True,
                "executionAllowed": True,
                "commandExecutionAllowed": launch_request.commandExecutionAllowed,
                "sourceMutationAllowed": False,
                "providerCallsAllowed": False,
                "networkAllowed": False,
                "credentialAccessAllowed": False,
                "processLaunchAttempted": True,
                "shellExecutionAttempted": False,
                "credentialAccessAttempted": False,
                "externalSendAttempted": False,
                "safetyFlags": launch_request.safetyFlags,
                "mutationContract": launch_request.mutationContract,
            },
        )

    def _subscription_agent_launch_request_values(self, payload: WorkItemSubscriptionAgentLaunchRequest) -> dict[str, object]:
        return {
            "workItemId": payload.workItemId,
            "executionAttemptId": payload.executionAttemptId or payload.attemptId,
            "routeDecisionId": payload.routeDecisionId,
            "workerId": payload.workerId,
            "lane": payload.lane,
            "authorityMode": payload.authorityMode,
            "workspacePlanId": payload.workspacePlanId,
            "launchPolicyId": payload.launchPolicyId,
            "targetId": payload.targetId,
            "commandTemplateId": payload.commandTemplateId,
            "commandTemplateExecutionStatus": payload.commandTemplateExecutionStatus,
            "approvalActor": payload.approvalActor,
            "approvalTimestamp": self._subscription_launch_datetime_as_utc(payload.approvalTimestamp).isoformat()
            if payload.approvalTimestamp
            else None,
            "approvalExpiry": self._subscription_launch_datetime_as_utc(payload.approvalExpiry).isoformat()
            if payload.approvalExpiry
            else None,
            "permissionEnvelope": payload.permissionEnvelope,
            "environmentAllowlist": payload.environmentAllowlist,
            "blockedCredentialSessionPaths": payload.blockedCredentialSessionPaths,
            "artifactLimits": payload.artifactLimits,
            "redactionPolicy": payload.redactionPolicy,
            "truncationPolicy": payload.truncationPolicy,
            "outputPolicy": payload.outputPolicy,
            "startupTimeoutSeconds": payload.startupTimeoutSeconds,
            "runTimeoutSeconds": payload.runTimeoutSeconds,
            "cancellationTimeoutSeconds": payload.cancellationTimeoutSeconds,
            "startupTimeoutPolicy": payload.startupTimeoutPolicy,
            "runTimeoutPolicy": payload.runTimeoutPolicy,
            "cancellationTimeoutPolicy": payload.cancellationTimeoutPolicy,
            "heartbeatPolicy": payload.heartbeatPolicy,
            "childProcessTreeTrackingPolicy": payload.childProcessTreeTrackingPolicy,
            "orphanDetectionPolicy": payload.orphanDetectionPolicy,
            "terminalStateReconciliationPolicy": payload.terminalStateReconciliationPolicy,
            "idempotentCleanupPolicy": payload.idempotentCleanupPolicy,
            "dashboardControls": payload.dashboardControls,
            "rollbackPolicy": payload.rollbackPolicy,
            "verificationCommand": payload.verificationCommand,
            "allowedOutputMode": payload.allowedOutputMode,
            "approvalId": payload.approvalId,
            "authorityFamily": payload.authorityFamily,
            "operation": payload.operation,
            "commandArgv": payload.commandArgv,
            "cwd": payload.cwd,
            "retainedEvidence": payload.retainedEvidence,
            "stopLines": payload.stopLines,
        }

    def _subscription_launch_datetime_as_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _subscription_launch_now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _subscription_agent_launch_evidence_binding(
        self,
        *,
        request_values: dict[str, object],
        expected_values: dict[str, object],
        missing_fields: list[str],
        stale_fields: list[str],
        attempt_id: str,
    ) -> dict[str, object]:
        binding = {
            field: (
                self._subscription_agent_launch_sanitized_field(field, request_values.get(field))
                if field in missing_fields
                else expected_values.get(field, request_values.get(field))
            )
            for field in self._SUBSCRIPTION_AGENT_LAUNCH_REQUIRED_FIELDS
        }
        binding["attemptId"] = attempt_id
        if stale_fields:
            binding["submittedEnvelopeFields"] = {
                field: self._subscription_agent_launch_sanitized_field(field, request_values.get(field))
                for field in stale_fields
            }
        return binding

    def _subscription_agent_launch_sanitized_field(self, field: str, value: object) -> object:
        if field != "artifactLimits" or not isinstance(value, dict):
            return self._subscription_agent_launch_sanitized_value(value)
        safe: dict[str, object] = {}
        if isinstance(value.get("rawOutputBytes"), (int, float)):
            safe["rawOutputBytes"] = value["rawOutputBytes"]
        elif "rawOutputBytes" in value:
            safe["rawOutputBytes"] = "[redacted]"
        if isinstance(value.get("artifactReferenceOnly"), bool):
            safe["artifactReferenceOnly"] = value["artifactReferenceOnly"]
        elif "artifactReferenceOnly" in value:
            safe["artifactReferenceOnly"] = "[redacted]"
        if isinstance(value.get("sourceMutationAllowed"), bool):
            safe["sourceMutationAllowed"] = value["sourceMutationAllowed"]
        elif "sourceMutationAllowed" in value:
            safe["sourceMutationAllowed"] = "[redacted]"
        if any(key not in {"rawOutputBytes", "artifactReferenceOnly", "sourceMutationAllowed"} for key in value):
            safe["redactedUnknownKeys"] = True
        return safe

    def _subscription_agent_launch_sanitized_value(self, value: object) -> object:
        if value is None or isinstance(value, (bool, int, float)):
            return value
        if isinstance(value, str):
            return value if len(value) <= 120 else f"{value[:117]}..."
        if isinstance(value, list):
            return [self._subscription_agent_launch_sanitized_value(item) for item in value[:20]]
        if isinstance(value, dict):
            safe: dict[str, object] = {}
            for index, (key, item) in enumerate(value.items()):
                if index >= 20:
                    safe["truncated"] = True
                    break
                safe_key = str(key)[:80]
                if any(token in safe_key.lower() for token in ("raw", "secret", "credential", "token", "stdout", "stderr", "generatedpatch")):
                    safe[safe_key] = "[redacted]"
                else:
                    safe[safe_key] = self._subscription_agent_launch_sanitized_value(item)
            return safe
        return str(value)[:120]

    def _launch_envelope_value_missing(self, value: object) -> bool:
        if value is None:
            return True
        if isinstance(value, str):
            return not value.strip()
        if isinstance(value, (list, dict, tuple, set)):
            return len(value) == 0
        return False

    def _subscription_agent_launch_blocked_reasons(
        self,
        *,
        missing_fields: list[str],
        stale_fields: list[str],
        rejected_fields: dict[str, str],
    ) -> list[str]:
        reasons = {"real_process_launch_not_approved"}
        reasons.update(f"missing_{self._camel_to_snake(field)}" for field in missing_fields)
        reasons.update(f"stale_{self._camel_to_snake(field)}" for field in stale_fields)
        if "targetStatus" in rejected_fields:
            reasons.add("subscription_agent_target_not_enabled")
        if "requestedAgent" in rejected_fields or "targetId" in rejected_fields or "targetSelector" in rejected_fields:
            reasons.add("subscription_agent_target_unsupported")
        if "commandTemplateExecutionStatus" in rejected_fields:
            reasons.add("command_template_not_executable")
        if "permissionEnvelope" in rejected_fields:
            reasons.add("permission_envelope_not_approved")
        if "approvalExpiry" in rejected_fields:
            reasons.add("approval_expiry_invalid")
        if "processLaunchPermission" in rejected_fields:
            reasons.add("process_launch_not_approved")
        if "rollbackStatus" in rejected_fields:
            reasons.add("subscription_launch_rollback_triggered")
        return sorted(reasons)

    def _camel_to_snake(self, value: str) -> str:
        chars: list[str] = []
        for index, char in enumerate(value):
            if char.isupper() and index > 0:
                chars.append("_")
            chars.append(char.lower())
        return "".join(chars)

    def _subscription_agent_launch_next_safe_action(
        self,
        missing_fields: list[str],
        stale_fields: list[str],
        rejected_fields: dict[str, str],
    ) -> str:
        if missing_fields:
            for field in ("approvalActor", "approvalTimestamp", "approvalExpiry", "permissionEnvelope"):
                if field in missing_fields:
                    return f"Fill {field} before exact launch approval can be requested."
            return f"Fill {missing_fields[0]} before exact launch approval can be requested."
        if stale_fields:
            return f"Refresh {stale_fields[0]} before reusing any prior approval."
        if rejected_fields:
            if "rollbackStatus" in rejected_fields:
                return "Keep subscription-agent launch disabled until rollback evidence is reviewed."
            return f"Inspect {next(iter(rejected_fields))} before exact launch approval can be requested."
        return "Preserve disabled launch state until the operator supplies an exact launch approval packet."

    async def _record_subscription_agent_launch_rejection_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        launch_request: SubscriptionAgentLaunchRequestView,
    ) -> None:
        await self._record_event(
            session,
            item,
            "routing.subscription_agent_launch_rejected",
            "Subscription-agent launch request rejected before process start.",
            {
                "launchRequestId": launch_request.launchRequestId,
                "status": launch_request.status,
                "readinessStatus": launch_request.readinessStatus,
                "approvalAccepted": launch_request.approvalAccepted,
                "missingEnvelopeFields": launch_request.missingEnvelopeFields,
                "rejectedEnvelopeFields": launch_request.rejectedEnvelopeFields,
                "staleEnvelopeFields": launch_request.staleEnvelopeFields,
                "blockedReasonIds": launch_request.blockedReasonIds,
                "nextSafeAction": launch_request.nextSafeAction,
                "approvalBinding": launch_request.approvalBinding,
                "workspaceContract": launch_request.workspaceContract,
                "workspacePlanId": launch_request.workspaceContract.get("workspacePlanId"),
                "launchPolicyId": launch_request.approvalBinding.get("launchPolicyId"),
                "targetId": launch_request.approvalBinding.get("targetId"),
                "commandTemplateId": launch_request.approvalBinding.get("commandTemplateId"),
                "commandTemplateExecutable": False,
                "outputContractId": launch_request.outputArtifactSummary.get("outputContractId"),
                "outputArtifactSummary": launch_request.outputArtifactSummary,
                "lifecyclePolicy": launch_request.lifecycleEvidence.get("lifecyclePolicy"),
                "stateMapping": launch_request.lifecycleEvidence.get("stateMapping"),
                "terminalStates": launch_request.lifecycleEvidence.get("terminalStates"),
                "lifecyclePolicyResults": {
                    "heartbeatPolicy": launch_request.lifecycleEvidence.get("heartbeatPolicy"),
                    "childProcessTreeTrackingPolicy": launch_request.lifecycleEvidence.get("childProcessTreeTrackingPolicy"),
                    "orphanDetectionPolicy": launch_request.lifecycleEvidence.get("orphanDetectionPolicy"),
                    "terminalStateReconciliationPolicy": launch_request.lifecycleEvidence.get("terminalStateReconciliationPolicy"),
                    "idempotentCleanupPolicy": launch_request.lifecycleEvidence.get("idempotentCleanupPolicy"),
                    "rollbackPolicy": launch_request.lifecycleEvidence.get("rollbackPolicy"),
                },
                "processLaunchAllowed": launch_request.processLaunchAllowed,
                "executionAllowed": launch_request.executionAllowed,
                "commandExecutionAllowed": launch_request.commandExecutionAllowed,
                "sourceMutationAllowed": launch_request.sourceMutationAllowed,
                "providerCallsAllowed": launch_request.providerCallsAllowed,
                "networkAllowed": launch_request.networkAllowed,
                "credentialAccessAllowed": launch_request.credentialAccessAllowed,
                "processLaunchAttempted": launch_request.processLaunchAttempted,
                "shellExecutionAttempted": launch_request.shellExecutionAttempted,
                "credentialAccessAttempted": launch_request.credentialAccessAttempted,
                "externalSendAttempted": launch_request.externalSendAttempted,
                "safetyFlags": launch_request.safetyFlags,
                "mutationContract": launch_request.mutationContract,
            },
        )

    async def get_subscription_agent_launch_stub(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemSubscriptionAgentLaunchStubRequest,
    ) -> SubscriptionAgentLaunchStubView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        preview_payload = WorkItemRoutingPreviewRequest(
            stepId=payload.stepId,
            taskKind=payload.taskKind,
            recordEvent=False,
        )
        preview = await self.get_routing_preview(session, work_item_id, preview_payload)
        if not preview:
            return None
        if preview.decision.selectedLane != ExecutionLane.SUBSCRIPTION_HANDOFF.value:
            raise ValueError(
                f"Route selected {preview.decision.selectedLane}; subscription agent launch stub requires subscription_handoff."
            )
        if preview.profile.taskKind not in self._SUBSCRIPTION_AGENT_STUB_TASK_KINDS:
            raise ValueError(
                f"Task kind {preview.profile.taskKind} is not eligible for subscription agent launch stubs."
            )

        target = self.subscription_launch_registry.get_target(payload.requestedAgent)
        workspace_contract = self.disabled_subscription_launch_adapter.workspace_contract(
            attempt_id=preview.decision.decisionId,
            target=target,
        )
        stub = SubscriptionAgentLaunchStubView(
            launchStubId=f"subscription-agent-stub-{preview.decision.decisionId}",
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            taskKind=preview.profile.taskKind,
            stepId=preview.profile.stepId,
            createdAt=datetime.now(timezone.utc),
            workerId="subscription.agent.disabled",
            requestedAgent=payload.requestedAgent or "subscription-agent-unspecified",
            route=preview.decision,
            estimate=self._subscription_agent_stub_estimate(preview),
            launchInstructions=self._subscription_agent_stub_instructions(preview),
            requiredApprovals=self._subscription_agent_stub_required_approvals(),
            disabledReason="subscription_agent_process_launch_not_enabled",
            targetRegistry=self._subscription_launch_target_views(),
            approvalBinding=self.disabled_subscription_launch_adapter.approval_binding(
                work_item_id=item.id,
                attempt_id=preview.decision.decisionId,
                route_decision_id=preview.decision.decisionId,
                workspace_plan_id=str(workspace_contract["workspacePlanId"]),
                target=target,
            ),
            workspaceContract=workspace_contract,
            outputContract=self.disabled_subscription_launch_adapter.output_contract(attempt_id=preview.decision.decisionId),
            lifecycleEvidence=self.disabled_subscription_launch_adapter.lifecycle_evidence(target),
            readinessEvidence=self.disabled_subscription_launch_adapter.readiness_evidence(target),
            processLaunchAllowed=False,
            executionAllowed=False,
        )
        if payload.recordEvent:
            await self._record_subscription_agent_launch_stub_event(session, item, stub)
            await session.commit()
            await session.refresh(item)
        return stub


    async def get_local_evidence_packet(
        self,
        session: AsyncSession,
        work_item_id: str,
    ) -> LocalEvidencePacketView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        events = await self.list_work_item_events(session, work_item_id)
        recipe = self._execution_recipe_for_item(item)
        created_at = self._normalize_timestamp(item.updated_at)
        profile = RoutingProfile(
            work_item_id=item.id,
            step_id="evidence-packet",
            task_kind=TaskKind.EVIDENCE_SUMMARY,
            phase=item.state,
            risk_level=item.risk_level,
            write_scope="none",
            allowed_paths=tuple(recipe.allowed_paths) if recipe else (),
            validation_expectations=tuple(command.display for command in recipe.verification_commands) if recipe else (),
        )
        decision = RoutingPreviewService().preview(profile, created_at=created_at)
        preview = RoutingPreviewView(
            profile=self._to_routing_profile_view(profile),
            decision=self._to_routing_decision_view(decision),
        )
        evidence = [
            LocalEvidencePacketItemView(
                eventType=event.event_type,
                summary=event.summary,
                createdAt=event.created_at,
            )
            for event in events[:8]
        ]
        threat_boundary = self.get_threat_boundary()
        ollama_state = self._ollama_provider_gate_state()
        return LocalEvidencePacketView(
            packetId=f"local-evidence-packet-{decision.decision_id}",
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            taskKind=profile.task_kind.value,
            stepId=profile.step_id,
            createdAt=created_at,
            route=preview.decision,
            summary=self._local_evidence_summary(item, preview, events),
            evidence=evidence,
            boundaries=self._local_evidence_boundaries(item)
            + [
                f"Provider endpoints policy: {threat_boundary.providerEndpointPolicy}.",
                (
                    f"Ollama approved endpoint: {self.settings.ollama_approved_endpoint_url} with model "
                    f"{self.settings.ollama_approved_model_id} only."
                    if bool(ollama_state["enabled"])
                    else "Ollama provider calls remain disabled until the broad gate, provider gate, exact approved endpoint, and exact approved model are configured."
                ),
                f"Credential policy: {threat_boundary.credentialPolicy}.",
            ],
            allowedPaths=list(recipe.allowed_paths) if recipe else [],
            validationCommands=[command.display for command in recipe.verification_commands] if recipe else [],
            redactionNotes=threat_boundary.redactionBoundary
            + [
                "Do not grant the local worker direct repo, shell, or write access from this packet.",
            ],
            writesAllowed=False,
            commandsAllowed=False,
        )

    async def preview_local_readonly_worker(
        self,
        session: AsyncSession,
        work_item_id: str,
    ) -> LocalReadonlyWorkerPreviewView | None:
        packet = await self.get_local_evidence_packet(session, work_item_id)
        if not packet:
            return None
        result = self.local_readonly_worker.run(
            packet_id=packet.packetId,
            work_item_id=packet.workItemId,
            evidence_count=len(packet.evidence),
            route_lane=packet.route.selectedLane,
        )
        return LocalReadonlyWorkerPreviewView(
            workerId=result.worker_id,
            runId=result.run_id,
            packetId=result.packet_id,
            workItemId=packet.workItemId,
            status=result.status.value,
            summary=result.summary,
            recommendations=list(result.recommendations),
            packet=packet,
            writesAllowed=result.writes_allowed,
            commandsAllowed=result.commands_allowed,
        )
    async def get_local_evidence_explanation(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemLocalEvidenceExplanationRequest,
    ) -> LocalEvidenceExplanationView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        preview_payload = WorkItemRoutingPreviewRequest(
            stepId=payload.stepId,
            taskKind=payload.taskKind,
            recordEvent=False,
        )
        preview = await self.get_routing_preview(session, work_item_id, preview_payload)
        if not preview:
            return None
        if preview.decision.selectedLane != ExecutionLane.LOCAL_READONLY.value:
            raise ValueError(f"Route selected {preview.decision.selectedLane}; local evidence explanation requires local_readonly.")

        events = await self.list_work_item_events(session, work_item_id)
        threat_boundary = self.get_threat_boundary()
        provider_attempt = None
        ollama_state = self._ollama_provider_gate_state()
        evidence_summary = self._local_evidence_summary(item, preview, events)
        provider_evidence_summary = self._local_provider_evidence_summary(item, preview, events)
        if bool(ollama_state["enabled"]):
            approval_validation = self._validate_local_provider_approval(payload.localProviderApproval, ollama_state)
            if approval_validation.approved:
                provider_result = await self.ollama_provider_adapter.explain(
                    evidence_summary=provider_evidence_summary,
                    evidence_count=len(events),
                )
                provider_attempt = LocalProviderAttemptMetadataView(
                    **provider_result.to_metadata(),
                    approvalId=approval_validation.approval_reference,
                    approvalStatus="accepted",
                )
            else:
                provider_attempt = self._local_provider_rejected_attempt(approval_validation, ollama_state)
        explanation = LocalEvidenceExplanationView(
            explanationId=f"local-evidence-{preview.decision.decisionId}",
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            taskKind=preview.profile.taskKind,
            stepId=preview.profile.stepId,
            createdAt=datetime.now(timezone.utc),
            route=preview.decision,
            summary=evidence_summary,
            evidence=[
                LocalEvidenceItemView(
                    eventType=event.event_type,
                    summary=event.summary,
                    createdAt=self._normalize_timestamp(event.created_at),
                )
                for event in events[:8]
            ],
            boundaries=self._local_evidence_boundaries(item)
            + [
                f"Provider endpoints policy: {threat_boundary.providerEndpointPolicy}.",
                (
                    f"Ollama approved endpoint: {self.settings.ollama_approved_endpoint_url} with model "
                    f"{self.settings.ollama_approved_model_id} only."
                    if bool(ollama_state["enabled"])
                    else "Ollama provider calls remain disabled until the broad gate, provider gate, exact approved endpoint, and exact approved model are configured."
                ),
                f"Credential policy: {threat_boundary.credentialPolicy}.",
            ],
            nextStepSuggestions=self._local_evidence_next_steps(preview),
            providerAttempt=provider_attempt,
            writesAllowed=False,
            commandsAllowed=False,
        )
        if payload.recordEvent:
            await self._record_local_evidence_explanation_event(session, item, explanation)
            await session.commit()
            await session.refresh(item)
        return explanation

    def _validate_local_provider_approval(
        self,
        approval: LocalProviderApprovalInstance | None,
        ollama_state: dict[str, object],
    ) -> LocalProviderApprovalValidation:
        if approval is None:
            return LocalProviderApprovalValidation(False, ["approval-instance-missing"])

        blockers: list[str] = []
        expected_endpoint = self.settings.ollama_approved_endpoint_url.strip()
        expected_model = self.settings.ollama_approved_model_id.strip()
        expected_fields = [
            ("status", approval.status, "accepted", "approval-status-not-accepted"),
            ("authorityFamily", approval.authorityFamily, "local-provider-execution", "approval-authority-family-mismatch"),
            ("operation", approval.operation, "one bounded Ollama provider operation", "approval-operation-mismatch"),
            ("endpointUrl", approval.endpointUrl, expected_endpoint, "approval-endpoint-mismatch"),
            ("modelId", approval.modelId, expected_model, "approval-model-mismatch"),
            ("retainedEvidencePolicy", approval.retainedEvidencePolicy, "metadata-only", "approval-retention-policy-mismatch"),
            (
                "timeoutCancellationPolicy",
                approval.timeoutCancellationPolicy,
                "connect_timeout_2s_total_timeout_120s",
                "approval-timeout-cancellation-policy-mismatch",
            ),
        ]
        for _field_name, actual, expected, blocker in expected_fields:
            if not isinstance(actual, str) or actual.strip() != expected:
                blockers.append(blocker)

        required_text_fields = [
            ("approvalId", approval.approvalId, "approval-id-missing"),
            ("promptSourceId", approval.promptSourceId, "approval-prompt-source-missing"),
            ("promptTemplateId", approval.promptTemplateId, "approval-prompt-template-missing"),
            ("approvedBy", approval.approvedBy, "approval-operator-missing"),
        ]
        for _field_name, value, blocker in required_text_fields:
            if not isinstance(value, str) or not value.strip():
                blockers.append(blocker)
        if approval.redactionPolicy != "metadata_only_no_raw_prompt_completion_reasoning_or_provider_payload":
            blockers.append("approval-redaction-policy-mismatch")

        if not any(isinstance(ref, str) and ref.strip() for ref in approval.retainedEvidence):
            blockers.append("approval-retained-evidence-missing")
        rollback_steps = [step.strip() for step in approval.rollbackPath if isinstance(step, str) and step.strip()]
        if not rollback_steps:
            blockers.append("approval-rollback-missing")
        elif not any(
            "disable local-provider" in step.lower() and "ollama" in step.lower()
            for step in rollback_steps
        ):
            blockers.append("approval-rollback-mismatch")
        stop_lines = [stop_line.strip() for stop_line in approval.stopLines if isinstance(stop_line, str) and stop_line.strip()]
        if not stop_lines:
            blockers.append("approval-stop-lines-missing")
        else:
            stop_line_text = "\n".join(stop_lines).lower()
            if expected_endpoint.lower() not in stop_line_text:
                blockers.append("approval-stop-lines-endpoint-missing")
            if expected_model.lower() not in stop_line_text:
                blockers.append("approval-stop-lines-model-missing")
            if not all(term in stop_line_text for term in ["raw prompt", "completion", "reasoning", "provider payload"]):
                blockers.append("approval-stop-lines-retention-missing")

        now = datetime.now(timezone.utc)
        approved_at = self._normalize_timestamp(approval.approvedAt) if approval.approvedAt else None
        expires_at = self._normalize_timestamp(approval.expiresAt) if approval.expiresAt else None
        if approved_at is None:
            blockers.append("approval-approved-at-missing")
        elif approved_at > now + timedelta(minutes=1):
            blockers.append("approval-approved-at-future")
        if expires_at is None:
            if not isinstance(approval.reviewPoint, str) or not approval.reviewPoint.strip():
                blockers.append("approval-expiry-or-review-point-missing")
        elif expires_at <= now:
            blockers.append("approval-expired")
        if approved_at and expires_at and approved_at > expires_at:
            blockers.append("approval-approved-after-expiry")

        unique_blockers = list(dict.fromkeys(blockers))
        return LocalProviderApprovalValidation(
            approved=not unique_blockers,
            blockers=unique_blockers,
            approval_reference=approval.approvalId if not unique_blockers else approval.approvalId,
        )

    def _local_provider_rejected_attempt(
        self,
        validation: LocalProviderApprovalValidation,
        ollama_state: dict[str, object],
    ) -> LocalProviderAttemptMetadataView:
        blockers = validation.blockers or ["approval-rejected"]
        return LocalProviderAttemptMetadataView(
            status="rejected",
            modelId=str(ollama_state.get("approved_model_id") or self.settings.ollama_approved_model_id),
            endpointFamily="approved_vm_to_host_ollama_openai_compatible",
            approvalId=validation.approval_reference,
            approvalStatus="rejected",
            rejectionReason=blockers[0],
            rejectionReasons=blockers,
            finishReason=None,
            promptSummary="Provider prompt not built; approval binding rejected before adapter execution.",
            responseSummary=f"Provider call rejected before adapter execution: {blockers[0]}.",
            responseCharacterCount=0,
            reasoningCharacterCount=0,
            promptCharacterCount=0,
            completionTokens=None,
            promptTokens=None,
            totalTokens=None,
            redactionApplied=True,
            rawPayloadRetained=False,
            timeoutState="not_started",
            cancellationState="not_started",
        )

    async def record_routing_override(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemRoutingOverrideRequest,
    ) -> RoutingOverrideView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        try:
            proposed_lane = ExecutionLane(payload.proposedLane)
        except ValueError as exc:
            raise ValueError(f"Unknown routing lane: {payload.proposedLane}") from exc
        reason = payload.reason.strip()
        if not reason:
            raise ValueError("Routing override evidence requires a reason.")

        preview = await self.get_routing_preview(session, work_item_id)
        if not preview:
            return None
        override = RoutingOverrideView(
            overrideId=f"routing-override-{uuid.uuid4()}",
            workItemId=item.id,
            createdAt=datetime.now(timezone.utc),
            currentRoute=preview.decision,
            proposedLane=proposed_lane.value,
            reason=reason,
            note=payload.note.strip() if payload.note else None,
            actorId=payload.actorId,
            actorLabel=payload.actorLabel,
            executionAffected=False,
        )
        await self._record_event(
            session,
            item,
            "routing.override_recorded",
            f"Operator recorded routing override evidence from {preview.decision.selectedLane} to {override.proposedLane}.",
            {
                "overrideId": override.overrideId,
                "currentLane": preview.decision.selectedLane,
                "proposedLane": override.proposedLane,
                "reason": override.reason,
                "note": override.note,
                "executionAffected": override.executionAffected,
                "currentDecisionId": preview.decision.decisionId,
            },
            actor_type="operator",
            actor_id=payload.actorId,
            actor_label=payload.actorLabel,
        )
        await session.commit()
        return override
    def _apply_routing_preview_request(
        self,
        profile: RoutingProfile,
        payload: WorkItemRoutingPreviewRequest,
    ) -> RoutingProfile:
        task_kind = profile.task_kind
        if payload.taskKind:
            try:
                task_kind = TaskKind(payload.taskKind)
            except ValueError as exc:
                raise ValueError(f"Unknown routing task kind: {payload.taskKind}") from exc
        return replace(
            profile,
            step_id=payload.stepId or profile.step_id,
            task_kind=task_kind,
        )

    async def _record_routing_preview_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        preview: RoutingPreviewView,
    ) -> None:
        decision = preview.decision
        profile = preview.profile
        await self._record_event(
            session,
            item,
            "routing.preview_recorded",
            f"Routing preview selected {decision.selectedLane} in {decision.authorityMode} mode.",
            {
                "stepId": profile.stepId,
                "taskKind": profile.taskKind,
                "selectedLane": decision.selectedLane,
                "authorityMode": decision.authorityMode,
                "confidenceScore": decision.confidenceScore,
                "confidenceBand": decision.confidenceBand,
                "reasonCodes": list(decision.reasonCodes),
                "rejectedLanes": [
                    {
                        "lane": rejected.lane,
                        "rejectionCodes": list(rejected.rejectionCodes),
                    }
                    for rejected in decision.rejectedLanes
                ],
                "escalationPath": list(decision.escalationPath),
                "permissionSummary": decision.permissionSummary,
            },
        )

    def _local_evidence_summary(self, item: WorkItem, preview: RoutingPreviewView, events: list[WorkflowEvent]) -> str:
        evidence_count = len(events)
        return (
            f"{item.title}: local read-only evidence review for {preview.profile.taskKind} "
            f"using {evidence_count} recorded workflow event(s)."
        )

    def _local_provider_evidence_summary(self, item: WorkItem, preview: RoutingPreviewView, events: list[WorkflowEvent]) -> str:
        base_summary = self._local_evidence_summary(item, preview, events)
        event_lines = [
            f"- {event.event_type}: {event.summary}"
            for event in events[:8]
        ]
        if not event_lines:
            return f"{base_summary}\nApproved workflow event summaries: none recorded."
        return f"{base_summary}\nApproved workflow event summaries:\n" + "\n".join(event_lines)

    def _local_evidence_boundaries(self, item: WorkItem) -> list[str]:
        boundaries = [
            "Read-only explanation only; file writes are not allowed.",
            "Command execution is not allowed for this explanation.",
            "Use workflow events and work item metadata as the evidence boundary.",
            "Do not include secrets or unrelated local files in follow-up prompts.",
        ]
        if item.blocked_reason:
            boundaries.append(f"Current blocked reason is evidence, not an instruction to bypass policy: {item.blocked_reason}")
        return boundaries

    def _local_evidence_next_steps(self, preview: RoutingPreviewView) -> list[str]:
        suggestions = [
            "Review the route rationale and rejected lanes before escalating.",
            "Use the evidence list to decide whether local read-only analysis is sufficient.",
        ]
        if preview.decision.escalationPath:
            suggestions.append(f"Escalate through {preview.decision.escalationPath[0]} if evidence is insufficient.")
        return suggestions

    async def _record_local_evidence_explanation_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        explanation: LocalEvidenceExplanationView,
    ) -> None:
        await self._record_event(
            session,
            item,
            "routing.local_evidence_explained",
            f"Local read-only evidence explanation created for {explanation.taskKind}.",
            {
                "explanationId": explanation.explanationId,
                "stepId": explanation.stepId,
                "taskKind": explanation.taskKind,
                "selectedLane": explanation.route.selectedLane,
                "authorityMode": explanation.route.authorityMode,
                "confidenceBand": explanation.route.confidenceBand,
                "reasonCodes": list(explanation.route.reasonCodes),
                "evidenceCount": len(explanation.evidence),
                "providerAttempt": explanation.providerAttempt.model_dump() if explanation.providerAttempt else None,
                "writesAllowed": explanation.writesAllowed,
                "commandsAllowed": explanation.commandsAllowed,
            },
        )
    def _subscription_agent_stub_estimate(self, preview: RoutingPreviewView) -> dict[str, str]:
        runtime_band = "medium" if preview.profile.taskKind in {TaskKind.ARCHITECTURE_REVIEW.value, TaskKind.SECURITY_REVIEW.value} else "long"
        return {
            "expectedRuntimeBand": runtime_band,
            "contextFit": preview.profile.contextNeed,
            "confidence": preview.decision.confidenceBand,
            "cost": "subscription_plan_usage_only",
        }

    def _subscription_agent_stub_instructions(self, preview: RoutingPreviewView) -> list[str]:
        return [
            "Review the subscription handoff package before any manual agent launch.",
            "Create an isolated workspace or branch before invoking a subscription CLI agent.",
            "Pass only approved paths, validation expectations, and necessary evidence.",
            "Do not include secrets, credentials, tokens, private keys, or raw environment values.",
            "Record operator approval, command line, workspace path, and cancellation plan before launch.",
            f"Expected agent output should match the route task kind: {preview.profile.taskKind}.",
        ]

    def _subscription_agent_stub_required_approvals(self) -> list[str]:
        return [
            "Operator approval for process launch.",
            "Workspace isolation and rollback plan approved.",
            "Credential and secret redaction confirmed.",
            "Cancellation and log capture plan approved.",
        ]

    def _premium_approval_justification(
        self,
        item: WorkItem,
        preview: RoutingPreviewView,
        payload: WorkItemPremiumApprovalRequest,
    ) -> list[str]:
        justification = [
            f"Current route is {preview.decision.selectedLane} with {preview.decision.confidenceBand} confidence.",
            f"Premium approval is requested only as an escalation artifact for {preview.profile.taskKind}.",
            f"Work item risk level is {item.risk_level}; premium usage remains operator-gated.",
        ]
        if payload.approvalReason:
            justification.append(f"Operator reason: {payload.approvalReason}")
        if item.blocked_reason:
            justification.append(f"Blocked reason to resolve first: {item.blocked_reason}")
        return justification

    def _premium_approval_required_evidence(self, preview: RoutingPreviewView) -> list[str]:
        evidence = [
            "Current routing decision and rejected lanes.",
            "Relevant work item context and recent supervisor events.",
            "Focused validation commands or evidence needed to judge the escalation.",
            "Expected cost of a wrong answer versus premium usage.",
        ]
        if preview.profile.taskKind == TaskKind.SECURITY_REVIEW.value:
            evidence.append("Security-specific evidence with secrets redacted before any external prompt.")
        if preview.profile.validationExpectations:
            evidence.append("Validation expectations: " + ", ".join(preview.profile.validationExpectations))
        return evidence

    def _premium_approval_checklist(self) -> list[str]:
        return [
            "Operator has reviewed route decision, reason codes, and rejected lanes.",
            "Local and subscription lanes are insufficient, failed, or too risky for this task.",
            "Secrets, credentials, tokens, private keys, and raw environment values are excluded.",
            "Allowed paths, validation plan, and rollback expectations are documented.",
            "A human approval decision is recorded before any premium execution is attempted.",
        ]

    def _premium_approval_risk_controls(self) -> list[str]:
        return [
            "executionAllowed is false; this artifact cannot launch a premium provider.",
            "Use this package for approval review only, not direct model invocation.",
            "Record any approval or rejection in the supervisor event trail before execution work continues.",
            "Prefer the smallest useful premium prompt and include only necessary evidence.",
        ]

    def _subscription_handoff_summary(self, item: WorkItem, preview: RoutingPreviewView) -> str:
        return f"{item.title}: {preview.decision.humanExplanation}"

    def _subscription_handoff_context(self, item: WorkItem, preview: RoutingPreviewView) -> list[str]:
        context = [
            f"Requested outcome: {item.requested_outcome}",
            f"Current workflow state: {item.state}",
            f"Risk level: {item.risk_level}",
            f"Route confidence: {preview.decision.confidenceBand} ({preview.decision.confidenceScore:.2f})",
        ]
        if item.details:
            context.append(f"Details: {item.details}")
        return context

    def _subscription_handoff_constraints(self, item: WorkItem, recipe: ExecutionRecipe | None, preview: RoutingPreviewView) -> list[str]:
        constraints = [
            "Do not launch a subscription agent from this package; launchAllowed is false.",
            "Preserve the work item state unless an operator explicitly approves the next workflow action.",
            "Keep secrets and local-only environment details out of any external prompt.",
        ]
        constraints.extend(self._subscription_handoff_task_constraints(preview))
        if recipe:
            constraints.extend(
                [
                    f"Stay within recipe allowed paths: {', '.join(recipe.allowed_paths)}.",
                    "Remote operations remain governed by the recipe remote automation policy.",
                ]
            )
        if item.blocked_reason:
            constraints.append(f"Current blocked reason must be resolved first: {item.blocked_reason}")
        return constraints


    def _subscription_handoff_task_constraints(self, preview: RoutingPreviewView) -> list[str]:
        task_kind = preview.profile.taskKind
        if task_kind == TaskKind.SECURITY_REVIEW.value:
            return [
                "Security review handoff: do not include secrets, credentials, tokens, private keys, or raw environment values.",
                "Security review handoff: focus on risk, exploitability, affected paths, and concrete mitigation evidence.",
                "Security review handoff: recommendations must not ask the operator to weaken supervisor approval gates.",
            ]
        if task_kind == TaskKind.ARCHITECTURE_REVIEW.value:
            return [
                "Architecture review handoff: focus on tradeoffs, boundaries, failure modes, and reversible decisions.",
                "Architecture review handoff: call out assumptions separately from verified repo evidence.",
            ]
        if task_kind in {TaskKind.BOUNDED_RECIPE_IMPLEMENTATION.value, TaskKind.MULTI_FILE_IMPLEMENTATION.value, TaskKind.SIMPLE_PATCH_DRAFT.value}:
            return [
                "Implementation handoff: propose changes only inside allowed paths and include a validation plan.",
                "Implementation handoff: return patch guidance, touched files, tests to run, and rollback notes.",
            ]
        return [
            "General handoff: return concise findings, assumptions, recommended next action, and stop conditions.",
        ]

    def _subscription_handoff_operator_instructions(self, preview: RoutingPreviewView) -> list[str]:
        return [
            "Review the route decision and rejected lanes before using this package.",
            "Use the summary, constraints, allowed paths, and validation commands as the handoff boundary.",
            "Paste only the needed package sections into a subscription agent; do not include secrets or unrelated local files.",
            "Return any generated patch or recommendation through the existing supervisor review and validation flow.",
            f"Expected output: {self._subscription_handoff_expected_output(preview)}",
        ]


    def _subscription_handoff_expected_output(self, preview: RoutingPreviewView) -> str:
        task_kind = preview.profile.taskKind
        if task_kind == TaskKind.SECURITY_REVIEW.value:
            return "risk-ranked findings with affected paths, evidence, mitigation, and residual risk."
        if task_kind == TaskKind.ARCHITECTURE_REVIEW.value:
            return "recommended architecture decision, alternatives considered, tradeoffs, assumptions, and validation needs."
        if task_kind in {TaskKind.BOUNDED_RECIPE_IMPLEMENTATION.value, TaskKind.MULTI_FILE_IMPLEMENTATION.value, TaskKind.SIMPLE_PATCH_DRAFT.value}:
            return "bounded patch plan with files, tests, rollback notes, and explicit stop conditions."
        return "concise findings, assumptions, recommended next action, and stop conditions."

    async def _record_subscription_agent_launch_stub_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        stub: SubscriptionAgentLaunchStubView,
    ) -> None:
        readiness_evidence = stub.readinessEvidence or {}
        lifecycle_evidence = stub.lifecycleEvidence or {}
        output_contract = stub.outputContract or {}
        await self._record_event(
            session,
            item,
            "routing.subscription_agent_launch_stub_created",
            f"Disabled subscription-agent launch stub created for {stub.taskKind}.",
            {
                "launchStubId": stub.launchStubId,
                "stepId": stub.stepId,
                "taskKind": stub.taskKind,
                "selectedLane": ExecutionLane.SUBSCRIPTION_AGENT.value,
                "sourceRouteLane": stub.route.selectedLane,
                "workerId": stub.workerId,
                "requestedAgent": stub.requestedAgent,
                "authorityMode": stub.route.authorityMode,
                "confidenceBand": stub.route.confidenceBand,
                "reasonCodes": stub.route.reasonCodes,
                "targetId": stub.approvalBinding.get("targetId"),
                "launchPolicyId": stub.approvalBinding.get("launchPolicyId"),
                "commandTemplateId": stub.approvalBinding.get("commandTemplateId"),
                "workspacePlanId": stub.workspaceContract.get("workspacePlanId"),
                "outputContractId": output_contract.get("outputContractId"),
                "commandTemplateExecutable": lifecycle_evidence.get(
                    "commandTemplateExecutable",
                    readiness_evidence.get("commandTemplateExecutable", False),
                ),
                "lifecyclePolicy": lifecycle_evidence.get("lifecyclePolicy"),
                "stateMapping": list(lifecycle_evidence.get("stateMapping") or []),
                "terminalStates": list(lifecycle_evidence.get("terminalStates") or []),
                "readinessStatus": readiness_evidence.get("status") or "blocked_pending_exact_launch_approval",
                "blockedReasonIds": list(readiness_evidence.get("blockedReasonIds") or []),
                "missingEnvelopeFields": list(readiness_evidence.get("missingEnvelopeFields") or []),
                "rejectedEnvelopeFields": readiness_evidence.get("rejectedEnvelopeFields") or {},
                "staleEnvelopeFields": list(readiness_evidence.get("staleEnvelopeFields") or []),
                "lifecyclePolicyResults": {
                    "timeoutPolicy": lifecycle_evidence.get("timeoutPolicy"),
                    "cancellationPolicy": lifecycle_evidence.get("cancellationPolicy"),
                    "heartbeatPolicy": lifecycle_evidence.get("heartbeatPolicy"),
                    "childProcessTreeTrackingPolicy": lifecycle_evidence.get("childProcessTreeTrackingPolicy"),
                    "orphanDetectionPolicy": lifecycle_evidence.get("orphanDetectionPolicy"),
                    "terminalStateReconciliationPolicy": lifecycle_evidence.get("terminalStateReconciliationPolicy"),
                    "idempotentCleanupPolicy": lifecycle_evidence.get("idempotentCleanupPolicy"),
                    "rollbackPolicy": lifecycle_evidence.get("rollbackPolicy"),
                },
                "outputArtifactSummary": {
                    "artifactReferenceOnly": output_contract.get("artifactReferenceOnly", True),
                    "boundedByteCounts": output_contract.get("boundedByteCounts") or {},
                    "artifactReferences": output_contract.get("artifactReferences") or [],
                    "workflowEventRawOutputAllowed": output_contract.get("workflowEventRawOutputAllowed", False),
                    "generatedPatchHandling": output_contract.get("generatedPatchHandling"),
                    "rawOutputStored": output_contract.get("rawOutputStored", False),
                },
                "processLaunchAttempted": False,
                "shellExecutionAttempted": False,
                "credentialAccessAttempted": False,
                "externalSendAttempted": False,
                "processLaunchAllowed": stub.processLaunchAllowed,
                "executionAllowed": stub.executionAllowed,
                "disabledReason": stub.disabledReason,
            },
        )

    async def _record_premium_approval_request_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        request: PremiumApprovalRequestView,
    ) -> None:
        await self._record_event(
            session,
            item,
            "routing.premium_approval_requested",
            f"Premium approval request artifact created for {request.taskKind}.",
            {
                "approvalRequestId": request.approvalRequestId,
                "stepId": request.stepId,
                "taskKind": request.taskKind,
                "selectedLane": request.requestedLane,
                "sourceRouteLane": request.route.selectedLane,
                "authorityMode": request.route.authorityMode,
                "confidenceBand": request.route.confidenceBand,
                "reasonCodes": request.route.reasonCodes,
                "executionAllowed": request.executionAllowed,
                "approvalReason": request.approvalReason,
            },
        )

    async def _record_subscription_handoff_package_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        package: SubscriptionHandoffPackageView,
    ) -> None:
        await self._record_event(
            session,
            item,
            "routing.subscription_handoff_packaged",
            f"Subscription handoff package created for {package.taskKind}.",
            {
                "packageId": package.packageId,
                "stepId": package.stepId,
                "taskKind": package.taskKind,
                "selectedLane": package.route.selectedLane,
                "authorityMode": package.route.authorityMode,
                "confidenceBand": package.route.confidenceBand,
                "reasonCodes": list(package.route.reasonCodes),
                "allowedPaths": list(package.allowedPaths),
                "validationCommands": list(package.validationCommands),
                "launchAllowed": package.launchAllowed,
            },
        )

    async def _record_guarded_utility_routing_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        recipe: ExecutionRecipe,
        action: WorkItemManagedActionView,
        actor_id: str | None,
        actor_label: str | None,
    ) -> RoutingDecision | None:
        profile = self._routing_profile_for_managed_action(item, recipe, action)
        decision = RoutingPreviewService().preview(
            profile,
            created_at=datetime.now(timezone.utc),
            allow_guarded_utility=True,
        )
        if decision.selected_lane != ExecutionLane.UTILITY:
            return None
        if decision.authority_mode != RoutingAuthorityMode.GUARDED:
            raise ValueError("Utility-routed managed actions require guarded routing authority.")
        await self._record_event(
            session,
            item,
            "routing.utility_execution_authorized",
            f"Routing authorized guarded utility execution for {action.actionId}.",
            {
                "actionId": action.actionId,
                "stepId": profile.step_id,
                "taskKind": profile.task_kind.value,
                "selectedLane": decision.selected_lane.value,
                "authorityMode": decision.authority_mode.value,
                "confidenceScore": decision.confidence_score,
                "confidenceBand": decision.confidence_band.value,
                "reasonCodes": list(decision.reason_codes),
                "rejectedLanes": [
                    {
                        "lane": rejected.lane.value,
                        "rejectionCodes": list(rejected.rejection_codes),
                    }
                    for rejected in decision.rejected_lanes
                ],
                "escalationPath": [lane.value for lane in decision.escalation_path],
                "permissionSummary": decision.permission_summary,
                "routeAffectsExecution": True,
            },
            actor_type="supervisor",
            actor_id=actor_id,
            actor_label=actor_label,
        )
        return decision

    async def _run_guarded_utility_worker(
        self,
        session: AsyncSession,
        item: WorkItem,
        profile: RoutingProfile,
        function_id: str,
        actor_id: str | None,
        actor_label: str | None,
    ) -> UtilityWorkerResult:
        task = UtilityWorkerTask(
            work_item_id=item.id,
            step_id=profile.step_id,
            task_kind=profile.task_kind.value,
            function_id=function_id,
            allowed_paths=profile.allowed_paths,
            timeout_seconds=30,
        )
        result = self.utility_worker.run(task)
        await self._record_event(
            session,
            item,
            "worker.utility_attempt_recorded",
            f"Utility worker {result.status.value} for {function_id}.",
            self._utility_worker_attempt_payload(task, result),
            actor_type="supervisor",
            actor_id=actor_id,
            actor_label=actor_label,
        )
        return result

    def _utility_worker_attempt_payload(
        self,
        task: UtilityWorkerTask,
        result: UtilityWorkerResult,
    ) -> dict:
        return {
            "workerId": result.worker_id,
            "functionId": task.function_id,
            "stepId": task.step_id,
            "taskKind": task.task_kind,
            "allowedPaths": list(task.allowed_paths),
            "timeoutSeconds": task.timeout_seconds,
            "status": result.status.value,
            "failureReason": result.failure_reason,
        }


    async def _record_routing_outcome_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        decision: RoutingDecision,
        result: UtilityWorkerResult,
        function_id: str,
        actor_id: str | None,
        actor_label: str | None,
    ) -> None:
        failure_reason = result.failure_reason
        await self._record_event(
            session,
            item,
            "routing.outcome_recorded",
            f"Routing outcome recorded for {decision.selected_lane.value} via {result.worker_id}.",
            {
                "decisionId": decision.decision_id,
                "selectedLane": decision.selected_lane.value,
                "authorityMode": decision.authority_mode.value,
                "workerId": result.worker_id,
                "functionId": function_id,
                "taskKind": decision.profile_snapshot.task_kind.value,
                "stepId": decision.profile_snapshot.step_id,
                "attemptStatus": result.status.value,
                "validationStatus": "not_run",
                "escalationReason": failure_reason,
                "avoidanceNote": self._routing_outcome_avoidance_note(result),
                "reasonCodes": list(decision.reason_codes),
            },
            actor_type="supervisor",
            actor_id=actor_id,
            actor_label=actor_label,
        )

    def _routing_outcome_avoidance_note(self, result: UtilityWorkerResult) -> str | None:
        if result.failure_reason == "utility.function_not_allowlisted":
            return "Add a narrowly reviewed allowlist entry only if this deterministic function should be routable."
        return None
    async def _routing_profile_for_item(self, session: AsyncSession, item: WorkItem) -> RoutingProfile:
        recipe = self._execution_recipe_for_item(item)
        if recipe:
            events = await self.list_work_item_events(session, item.id)
            audit = self._recipe_gate_audit_view(item, recipe, events, preview_only=True)
            return self._routing_profile_for_managed_action(item, recipe, audit.nextManagedAction)
        return RoutingProfile(
            work_item_id=item.id,
            step_id=item.state,
            task_kind=TaskKind.TASK_CLASSIFICATION,
            phase=item.state,
            risk_level=item.risk_level,
        )

    def _routing_profile_for_managed_action(
        self,
        item: WorkItem,
        recipe: ExecutionRecipe,
        action: WorkItemManagedActionView,
    ) -> RoutingProfile:
        task_kind = self._task_kind_for_managed_action(action.actionId, action.requiredGate)
        return RoutingProfile(
            work_item_id=item.id,
            step_id=action.requiredGate or action.actionId,
            task_kind=task_kind,
            phase=item.state,
            risk_level=item.risk_level,
            write_scope="none",
            allowed_paths=tuple(recipe.allowed_paths),
            validation_expectations=tuple(command.display for command in recipe.verification_commands),
            escalation_triggers=("preview_rejected", "validation_failed", "operator_requested"),
        )

    def _task_kind_for_managed_action(self, action_id: str, required_gate: str | None) -> TaskKind:
        if required_gate in {"scope", "clean-worktree", "branch-ownership", "path-scope", "verification"}:
            return TaskKind.PATH_SCOPE_CHECK
        if required_gate == "delivery-readiness":
            return TaskKind.DELIVERY_PACKAGE_CHECK
        if action_id in {"run_recipe_implementation", "prepare_recipe_branch"}:
            return TaskKind.BOUNDED_RECIPE_IMPLEMENTATION
        if action_id == "record_delivery_readiness":
            return TaskKind.DELIVERY_PACKAGE_CHECK
        if action_id == "complete":
            return TaskKind.FINAL_VALIDATION_REVIEW
        return TaskKind.TASK_CLASSIFICATION

    def _to_routing_profile_view(self, profile: RoutingProfile) -> RoutingProfileView:
        return RoutingProfileView(
            workItemId=profile.work_item_id,
            stepId=profile.step_id,
            taskKind=profile.task_kind.value,
            phase=profile.phase,
            riskLevel=profile.risk_level,
            privacyLevel=profile.privacy_level,
            writeScope=profile.write_scope,
            allowedPaths=list(profile.allowed_paths),
            contextNeed=profile.context_need,
            reasoningNeed=profile.reasoning_need,
            determinismNeed=profile.determinism_need,
            validationExpectations=list(profile.validation_expectations),
            preferredLanes=[lane.value for lane in profile.preferred_lanes],
            forbiddenLanes=[lane.value for lane in profile.forbidden_lanes],
            escalationTriggers=list(profile.escalation_triggers),
        )

    def _to_routing_decision_view(self, decision: RoutingDecision) -> RoutingDecisionView:
        return RoutingDecisionView(
            decisionId=decision.decision_id,
            workItemId=decision.work_item_id,
            stepId=decision.step_id,
            createdAt=self._normalize_timestamp(decision.created_at),
            profileSnapshot=self._to_routing_profile_view(decision.profile_snapshot),
            selectedLane=decision.selected_lane.value,
            selectedWorkerId=decision.selected_worker_id,
            authorityMode=decision.authority_mode.value,
            confidenceScore=decision.confidence_score,
            confidenceBand=decision.confidence_band.value,
            reasonCodes=list(decision.reason_codes),
            rejectedLanes=[
                RejectedRoutingLaneView(
                    lane=rejected.lane.value,
                    rejectionCodes=list(rejected.rejection_codes),
                    explanation=rejected.explanation,
                )
                for rejected in decision.rejected_lanes
            ],
            rejectedWorkers=list(decision.rejected_workers),
            permissionSummary=decision.permission_summary,
            escalationPath=[lane.value for lane in decision.escalation_path],
            humanExplanation=decision.human_explanation,
        )

    async def list_operator_views(
        self,
        session: AsyncSession,
        scope: WorkItemFilterScope | None = None,
    ) -> list[OperatorView]:
        query = select(OperatorView)
        if scope:
            query = query.where(OperatorView.scope == scope.value)
        result = await session.execute(query.order_by(OperatorView.scope.asc(), OperatorView.updated_at.desc()))
        return list(result.scalars())

    async def save_operator_view(self, session: AsyncSession, payload: OperatorViewCreate) -> OperatorView:
        normalized_name = payload.name.strip()
        if not normalized_name:
            raise ValueError("Operator views require a non-empty name.")
        result = await session.execute(
            select(OperatorView).where(
                OperatorView.scope == payload.scope.value,
                OperatorView.name.ilike(normalized_name),
            )
        )
        view = result.scalars().first()
        if not view:
            view = OperatorView(
                name=normalized_name,
                scope=payload.scope.value,
                filters_json=payload.filters.model_dump(),
                is_default=False,
            )
            session.add(view)
        else:
            view.name = normalized_name
            view.filters_json = payload.filters.model_dump()
        await session.commit()
        await session.refresh(view)
        await self.bus.publish(
            self._event_payload(
                "operator_view.saved",
                correlation_id=str(uuid.uuid4()),
                payload={"scope": view.scope, "name": view.name, "viewId": view.id},
                actor_type="operator",
                actor_id="dashboard",
            )
        )
        return view

    async def set_operator_view_default(self, session: AsyncSession, view_id: str, is_default: bool) -> OperatorView | None:
        view = await session.get(OperatorView, view_id)
        if not view:
            return None
        result = await session.execute(select(OperatorView).where(OperatorView.scope == view.scope))
        for candidate in result.scalars():
            candidate.is_default = candidate.id == view_id if is_default else False
        await session.commit()
        await session.refresh(view)
        await self.bus.publish(
            self._event_payload(
                "operator_view.default_changed",
                correlation_id=str(uuid.uuid4()),
                payload={"scope": view.scope, "viewId": view.id, "isDefault": view.is_default},
                actor_type="operator",
                actor_id="dashboard",
            )
        )
        return view

    async def delete_operator_view(self, session: AsyncSession, view_id: str) -> bool:
        view = await session.get(OperatorView, view_id)
        if not view:
            return False
        await session.delete(view)
        await session.commit()
        await self.bus.publish(
            self._event_payload(
                "operator_view.deleted",
                correlation_id=str(uuid.uuid4()),
                payload={"scope": view.scope, "name": view.name, "viewId": view.id},
                actor_type="operator",
                actor_id="dashboard",
            )
        )
        return True

    async def set_mode(self, session: AsyncSession, mode: RunMode) -> SupervisorControl:
        control = await self.ensure_control(session)
        control.mode = mode.value
        await session.commit()
        await session.refresh(control)
        await self.bus.publish(
            self._event_payload(
                "supervisor.mode_changed",
                correlation_id=str(uuid.uuid4()),
                payload={"mode": mode.value, "summary": mode_summary(mode)},
            )
        )
        return control

    async def get_status(self, session: AsyncSession) -> RunStatusView:
        control = await self.ensure_control(session)
        items = await self.list_work_items(session)
        return RunStatusView(
            mode=RunMode(control.mode),
            pollIntervalSeconds=self.settings.poll_interval_seconds,
            queueCount=sum(1 for item in items if item.state in {WorkflowState.QUEUED.value, WorkflowState.TRIAGED.value, WorkflowState.READY.value}),
            activeCount=sum(1 for item in items if item.state in ACTIVE_STATES),
            blockedCount=sum(1 for item in items if item.state == WorkflowState.BLOCKED.value),
            doneCount=sum(1 for item in items if item.state == WorkflowState.DONE.value),
            summary=mode_summary(RunMode(control.mode)),
        )

    async def retry_item(self, session: AsyncSession, work_item_id: str) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None
        item.state = WorkflowState.READY.value
        item.blocked_reason = None
        item.status_summary = default_status_summary(WorkflowState.READY)
        item.next_step = next_step_summary(WorkflowState.READY)
        await self._record_event(session, item, "work_item.retry_requested", item.status_summary, {})
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def assign_work_item(
        self,
        session: AsyncSession,
        work_item_id: str,
        assignee_id: str | None,
        assignee_label: str | None,
        actor_id: str | None = None,
        actor_label: str | None = None,
    ) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        clean_assignee_id = assignee_id.strip() if assignee_id else None
        clean_assignee_label = assignee_label.strip() if assignee_label else None
        item.assignee_id = clean_assignee_id
        item.assignee_label = clean_assignee_label
        item.updated_at = datetime.now(timezone.utc)
        item.last_event_at = item.updated_at

        if clean_assignee_id or clean_assignee_label:
            summary = f"Assigned to {clean_assignee_label or clean_assignee_id}."
            event_type = "work_item.assigned"
        else:
            summary = "Ownership released."
            event_type = "work_item.unassigned"

        await self._record_event(
            session,
            item,
            event_type,
            summary,
            {
                "assigneeId": clean_assignee_id,
                "assigneeLabel": clean_assignee_label,
                "state": item.state,
                "lane": item.lane,
            },
            actor_type="operator",
            actor_id=actor_id,
            actor_label=actor_label,
        )
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def set_escalation(
        self,
        session: AsyncSession,
        work_item_id: str,
        reason: str | None,
        clear: bool = False,
        actor_id: str | None = None,
        actor_label: str | None = None,
    ) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        if clear:
            item.escalated_at = None
            item.escalation_reason = None
            item.escalated_by_id = None
            item.escalated_by_label = None
            summary = "Escalation cleared."
            event_type = "work_item.escalation_cleared"
        else:
            clean_reason = reason.strip() if reason else "Operator marked this item for attention."
            item.escalated_at = datetime.now(timezone.utc)
            item.escalation_reason = clean_reason
            item.escalated_by_id = actor_id
            item.escalated_by_label = actor_label
            summary = f"Escalated: {clean_reason}"
            event_type = "work_item.escalated"

        item.updated_at = datetime.now(timezone.utc)
        item.last_event_at = item.updated_at
        await self._record_event(
            session,
            item,
            event_type,
            summary,
            {
                "state": item.state,
                "lane": item.lane,
                "escalationReason": item.escalation_reason,
                "escalatedByLabel": item.escalated_by_label,
            },
            actor_type="operator",
            actor_id=actor_id,
            actor_label=actor_label,
        )
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def apply_action(
        self,
        session: AsyncSession,
        work_item_id: str,
        action: WorkflowAction,
        note: str | None = None,
        actor_id: str | None = None,
        actor_label: str | None = None,
    ) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        await self._apply_action_to_item(session, item, action, note, actor_id, actor_label)
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def execute_managed_next_action(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemManagedActionRequest,
    ) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        recipe = self._execution_recipe_for_item(item)
        if not recipe:
            raise ValueError("Managed next actions can only run for recipe-managed work.")

        events = await self.list_work_item_events(session, work_item_id)
        audit = self._recipe_gate_audit_view(item, recipe, events)
        next_action = audit.nextManagedAction
        if payload.expectedActionId and payload.expectedActionId != next_action.actionId:
            raise ValueError(f"Managed action changed from {payload.expectedActionId} to {next_action.actionId}. Refresh before continuing.")
        if next_action.status != "available":
            raise ValueError(f"Managed action {next_action.actionId} is {next_action.status}: {next_action.reason}")
        if next_action.remoteOperation and next_action.actionId != "execute_remote_delivery":
            raise ValueError("Managed next action requires remote automation, which is blocked by policy.")

        if next_action.actionId == "record_delivery_readiness":
            raise ValueError("Record delivery readiness through the delivery readiness checkpoint form.")
        if next_action.actionId == "execute_remote_delivery":
            if not self._remote_delivery_enabled():
                raise ValueError("Remote delivery automation is disabled by policy.")
            if item.state != WorkflowState.REVIEWING.value:
                raise ValueError("Remote delivery can only run during review.")
            remote_results = self._remote_delivery_commands(item)
            if any(result["exitCode"] != 0 for result in remote_results):
                await self._record_event(
                    session,
                    item,
                    "recipe.remote_delivery_failed",
                    f"Remote delivery failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "delivery-readiness",
                        "remote-delivery",
                        {"commands": remote_results},
                    ),
                    actor_type="system",
                    actor_id=payload.actorId,
                    actor_label=payload.actorLabel,
                )
                item.state = WorkflowState.NEEDS_REWORK.value
                item.lane = BmadLane.CORRECTIVE_LOOP.value
                item.next_step = next_step_summary(WorkflowState.NEEDS_REWORK)
                item.status_summary = default_status_summary(WorkflowState.NEEDS_REWORK)
                item.updated_at = datetime.now(timezone.utc)
                item.last_event_at = item.updated_at
                await session.commit()
                await session.refresh(item)
                await self._publish_item(item)
                return item

            metadata = dict(item.metadata_json) if isinstance(item.metadata_json, dict) else {}
            pr_url = next((result["stdout"].strip() for result in remote_results if result["command"].startswith("gh pr create") and result["stdout"].strip().startswith("https://github.com/")), None)
            if not pr_url:
                pr_url = next((result["stdout"].strip() for result in remote_results if result["stdout"].strip().startswith("https://github.com/")), None)
            metadata.update(
                {
                    "pullRequestStatus": "recorded",
                    "pullRequestUrl": pr_url,
                    "ciStatus": "passed",
                    "mergeStatus": "merged",
                    "remoteOperationsPerformed": True,
                }
            )
            item.metadata_json = metadata
            await self._record_event(
                session,
                item,
                "recipe.remote_delivery_executed",
                f"Remote delivery executed for {recipe.label}.",
                self._recipe_policy_payload(
                    recipe,
                    "delivery-readiness",
                    "remote-delivery",
                    {"commands": remote_results, "pullRequestUrl": pr_url, "remoteOperationsPerformed": True},
                ),
                actor_type="supervisor",
                actor_id=payload.actorId,
                actor_label=payload.actorLabel,
            )
            item.updated_at = datetime.now(timezone.utc)
            item.last_event_at = item.updated_at
            await session.commit()
            await session.refresh(item)
            await self._publish_item(item)
            return item
        if next_action.actionId == "supervisor_triage":
            decision = await self._record_guarded_utility_routing_event(
                session,
                item,
                recipe,
                next_action,
                payload.actorId,
                payload.actorLabel,
            )
            if decision:
                utility_result = await self._run_guarded_utility_worker(
                    session,
                    item,
                    decision.profile_snapshot,
                    next_action.actionId,
                    payload.actorId,
                    payload.actorLabel,
                )
                await self._record_routing_outcome_event(
                    session,
                    item,
                    decision,
                    utility_result,
                    next_action.actionId,
                    payload.actorId,
                    payload.actorLabel,
                )
                if utility_result.status != UtilityWorkerStatus.SUCCEEDED:
                    await session.commit()
                    raise ValueError(f"Guarded utility worker rejected {next_action.actionId}: {utility_result.failure_reason}")
        if next_action.actionId == "prepare_recipe_branch":
            return await self.prepare_recipe_branch(
                session,
                work_item_id,
                WorkItemBranchPreparationRequest(
                    note=payload.note,
                    actorId=payload.actorId,
                    actorLabel=payload.actorLabel,
                ),
            )
        if next_action.actionId in {"supervisor_triage", "run_recipe_implementation"}:
            control = await self.ensure_control(session)
            if control.mode != RunMode.RUNNING.value:
                raise ValueError("Supervisor managed actions require running mode.")
            max_steps = 2 if next_action.actionId == "supervisor_triage" else 1
            for _ in range(max_steps):
                before_state = item.state
                await self._advance_item(session, item, RunMode.RUNNING)
                if item.state == before_state or item.state not in {WorkflowState.QUEUED.value, WorkflowState.TRIAGED.value}:
                    break
            await session.commit()
            await session.refresh(item)
            await self._publish_item(item)
            return item

        workflow_action = next((candidate for candidate in WorkflowAction if candidate.value == next_action.actionId), None)
        if workflow_action:
            await self._apply_action_to_item(
                session,
                item,
                workflow_action,
                payload.note,
                payload.actorId,
                payload.actorLabel,
            )
            await session.commit()
            await session.refresh(item)
            await self._publish_item(item)
            return item

        raise ValueError(f"Managed action {next_action.actionId} is not executable by the supervisor.")

    async def record_delivery_readiness(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemDeliveryReadinessRequest,
    ) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        recipe = self._execution_recipe_for_item(item)
        if not recipe:
            raise ValueError("Delivery readiness can only be recorded for managed recipe work.")
        if item.state not in {WorkflowState.VALIDATING.value, WorkflowState.REVIEWING.value}:
            raise ValueError("Delivery readiness can only be recorded during validation or review.")

        delivery_payload = self._normalize_delivery_readiness_payload(item, payload)
        metadata = dict(item.metadata_json) if isinstance(item.metadata_json, dict) else {}
        metadata.update(
            {
                "pullRequestStatus": delivery_payload["pullRequestStatus"],
                "pullRequestUrl": delivery_payload["pullRequestUrl"],
                "ciStatus": delivery_payload["ciStatus"],
                "mergeStatus": delivery_payload["mergeStatus"],
                "deliveryWaived": delivery_payload["deliveryWaived"],
                "deliveryWaiverReason": delivery_payload["deliveryWaiverReason"],
            }
        )
        item.metadata_json = metadata
        item.updated_at = datetime.now(timezone.utc)
        item.last_event_at = item.updated_at

        await self._record_event(
            session,
            item,
            "recipe.delivery_readiness_updated",
            f"Operator recorded delivery readiness for {recipe.label}.",
            self._recipe_policy_payload(
                recipe,
                "delivery-readiness",
                "delivery-readiness-update",
                delivery_payload | {"note": payload.note},
            ),
            actor_type="operator",
            actor_id=payload.actorId,
            actor_label=payload.actorLabel,
        )
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def prepare_recipe_branch(
        self,
        session: AsyncSession,
        work_item_id: str,
        payload: WorkItemBranchPreparationRequest,
    ) -> WorkItem | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        recipe = self._execution_recipe_for_item(item)
        if not recipe:
            raise ValueError("Branch preparation can only be run for managed recipe work.")
        if item.state not in {WorkflowState.READY.value, WorkflowState.BLOCKED.value}:
            raise ValueError("Branch preparation can only run after recipe scope has been triaged.")

        note = payload.note.strip() if payload.note else None
        branch_record_error, branch_record_payload = self._ensure_recipe_branch_record(item, recipe)
        if branch_record_error:
            await self._block_recipe_branch_preparation(
                session,
                item,
                recipe,
                branch_record_error,
                branch_record_payload | {"note": note},
                payload.actorId,
                payload.actorLabel,
            )
            await session.commit()
            await session.refresh(item)
            await self._publish_item(item)
            return item

        if self._repo_is_dirty():
            await self._block_recipe_branch_preparation(
                session,
                item,
                recipe,
                "Repository is dirty. Clean the working tree before preparing a recipe branch.",
                {"note": note},
                payload.actorId,
                payload.actorLabel,
            )
            await session.commit()
            await session.refresh(item)
            await self._publish_item(item)
            return item

        preparation_error, preparation_payload = self._prepare_recipe_branch(item, recipe)
        preparation_payload["note"] = note
        if preparation_error:
            await self._block_recipe_branch_preparation(
                session,
                item,
                recipe,
                preparation_error,
                preparation_payload,
                payload.actorId,
                payload.actorLabel,
            )
            await session.commit()
            await session.refresh(item)
            await self._publish_item(item)
            return item

        item.blocked_reason = None
        if item.state == WorkflowState.BLOCKED.value:
            await self._transition(
                session,
                item,
                WorkflowState.READY,
                "recipe.branch_prepared",
                "Recipe execution branch is prepared for supervisor implementation.",
                payload_overrides=self._recipe_policy_payload(
                    recipe,
                    "branch-ownership",
                    "branch-preparation",
                    preparation_payload,
                ),
                actor_type="operator",
                actor_id=payload.actorId,
                actor_label=payload.actorLabel,
                lane_override=BmadLane.IMPLEMENTATION.value,
            )
        else:
            item.updated_at = datetime.now(timezone.utc)
            item.last_event_at = item.updated_at
            await self._record_event(
                session,
                item,
                "recipe.branch_prepared",
                "Recipe execution branch is prepared for supervisor implementation.",
                self._recipe_policy_payload(
                    recipe,
                    "branch-ownership",
                    "branch-preparation",
                    preparation_payload,
                ),
                actor_type="operator",
                actor_id=payload.actorId,
                actor_label=payload.actorLabel,
            )
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def get_local_worktree_plan(self, session: AsyncSession, work_item_id: str) -> LocalWorktreePlanView | None:
        item = await session.get(WorkItem, work_item_id)
        if not item:
            return None

        recipe = self._execution_recipe_for_item(item)
        if not recipe:
            raise ValueError("Local worktree planning is available only for managed recipe work.")

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        repo_root = self._repo_root() or str(Path.cwd())
        branch_ok, current_branch = self._git_output(["git", "branch", "--show-current"])
        revision_ok, current_revision = self._git_output(["git", "rev-parse", "HEAD"])
        base_branch = metadata.get("baseBranch") if isinstance(metadata.get("baseBranch"), str) and metadata.get("baseBranch").strip() else current_branch
        base_revision = (
            metadata.get("baseRevision")
            if isinstance(metadata.get("baseRevision"), str) and metadata.get("baseRevision").strip()
            else current_revision
        )
        execution_branch = (
            metadata.get("executionBranch")
            if isinstance(metadata.get("executionBranch"), str) and metadata.get("executionBranch").strip()
            else self._recipe_execution_branch(item, recipe)
        )
        if not base_branch:
            base_branch = "unknown"
        if not base_revision:
            base_revision = "unknown"

        worktree_path = str(self._planned_worktree_path(repo_root, execution_branch))
        dirty = self._repo_is_dirty()
        blocked_by = ["local_worktree_creation_not_enabled", "local_worktree_cleanup_not_enabled"]
        if dirty:
            blocked_by.append("current_repo_has_uncommitted_changes")
        if not branch_ok:
            blocked_by.append("base_branch_unavailable")
        if not revision_ok:
            blocked_by.append("base_revision_unavailable")

        return LocalWorktreePlanView(
            planId=f"local-worktree-plan-{item.id}",
            workItemId=item.id,
            title=item.title,
            executionBranch=execution_branch,
            baseBranch=base_branch,
            baseRevision=base_revision,
            worktreePath=worktree_path,
            status="blocked_pending_authority",
            createCommand=["git", "worktree", "add", "-b", execution_branch, worktree_path, base_revision],
            cleanupCommand=["git", "worktree", "remove", worktree_path],
            safetyChecks=[
                "Confirm current repository status is clean before creating an isolated worktree.",
                "Confirm execution branch starts with the managed recipe branch prefix.",
                "Keep all implementation changes inside recipe allowed paths.",
                "Record verification evidence before any delivery or cleanup action.",
            ],
            blockedBy=blocked_by,
            evidence=[
                "Plan only: no local filesystem mutation was performed.",
                f"Recipe branch prefix: {recipe.branch_prefix}.",
                f"Allowed paths: {', '.join(recipe.allowed_paths)}.",
            ],
            createAllowed=False,
            cleanupAllowed=False,
            remoteOperationsAllowed=False,
        )

    async def process_once(self, session: AsyncSession) -> None:
        async with self._loop_lock:
            control = await self.ensure_control(session)
            if control.mode == RunMode.DISABLED.value:
                return

            items = await self.list_work_items(session)
            for item in items:
                await self._advance_item(session, item, RunMode(control.mode))
            await session.commit()

    async def _advance_item(self, session: AsyncSession, item: WorkItem, mode: RunMode) -> None:
        current = WorkflowState(item.state)
        if current == WorkflowState.QUEUED:
            await self._transition(session, item, WorkflowState.TRIAGED, "work_item.triaged", default_status_summary(WorkflowState.TRIAGED))
            return
        if current == WorkflowState.TRIAGED:
            if not item.requested_outcome.strip():
                item.blocked_reason = "Requested outcome is missing."
                await self._transition(session, item, WorkflowState.BLOCKED, "work_item.blocked", default_status_summary(WorkflowState.BLOCKED))
                return
            recipe_error = self._validate_execution_recipe(item)
            if recipe_error:
                item.blocked_reason = recipe_error
                await self._transition(
                    session,
                    item,
                    WorkflowState.BLOCKED,
                    "recipe.blocked",
                    default_status_summary(WorkflowState.BLOCKED),
                )
                return
            recipe = self._execution_recipe_for_item(item)
            branch_record_error, branch_record_payload = self._ensure_recipe_branch_record(item, recipe)
            if branch_record_error:
                item.blocked_reason = branch_record_error
                await self._transition(
                    session,
                    item,
                    WorkflowState.BLOCKED,
                    "recipe.branch_blocked",
                    default_status_summary(WorkflowState.BLOCKED),
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "branch-ownership",
                        "branch-record",
                        branch_record_payload | {"reason": branch_record_error},
                    ),
                )
                return
            if recipe and branch_record_payload:
                await self._record_event(
                    session,
                    item,
                    "recipe.branch_recorded",
                    "Supervisor recorded the recipe execution branch target.",
                    self._recipe_policy_payload(recipe, "branch-ownership", "branch-record", branch_record_payload),
                )
            await self._transition(
                session,
                item,
                WorkflowState.READY,
                "recipe.ready" if recipe else "work_item.ready",
                default_status_summary(WorkflowState.READY),
                payload_overrides=self._recipe_policy_payload(recipe, "scope", "scope-reviewed"),
                lane_override=BmadLane.IMPLEMENTATION.value,
            )
            return
        if current == WorkflowState.READY:
            if mode in {RunMode.PAUSED, RunMode.DRAINING}:
                return
            if self._repo_is_dirty():
                item.blocked_reason = "Repository is dirty. Clean the working tree before new work starts."
                await self._transition(session, item, WorkflowState.BLOCKED, "repo.blocked", default_status_summary(WorkflowState.BLOCKED))
                return
            recipe = self._execution_recipe_for_item(item)
            branch_error, branch_payload = self._recipe_branch_policy(item, recipe)
            if branch_error:
                item.blocked_reason = branch_error
                await self._transition(
                    session,
                    item,
                    WorkflowState.BLOCKED,
                    "recipe.branch_blocked",
                    default_status_summary(WorkflowState.BLOCKED),
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "branch-ownership",
                        "branch-policy",
                        branch_payload | {"reason": branch_error},
                    ),
                )
                return
            command_results = self._run_recipe_implementation_commands(recipe, item)
            if recipe and not all(result["exitCode"] == 0 for result in command_results):
                item.blocked_reason = None
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_failed",
                    f"Recipe implementation automation failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "implementation-automation",
                        "implementation-command-run",
                        {
                            "commands": command_results,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership"],
                        },
                    ),
                )
                await self._transition(
                    session,
                    item,
                    WorkflowState.NEEDS_REWORK,
                    "workflow.needs_rework",
                    "Recipe implementation automation failed before implementation start.",
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "implementation-automation",
                        "implementation-command-run",
                        {
                            "commands": command_results,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership"],
                        },
                    ),
                    actor_type="system",
                    lane_override=BmadLane.CORRECTIVE_LOOP.value,
                )
                return
            path_error, path_payload = self._recipe_path_scope_policy(item, recipe)
            if recipe and path_error:
                item.blocked_reason = None
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_path_scope_failed",
                    f"Recipe implementation path scope failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "implementation-path-scope",
                        path_payload | {"reason": path_error, "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"]},
                    ),
                )
                await self._transition(
                    session,
                    item,
                    WorkflowState.NEEDS_REWORK,
                    "workflow.needs_rework",
                    "Recipe implementation automation escaped the allowed path boundary.",
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "implementation-path-scope",
                        path_payload | {"reason": path_error, "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"]},
                    ),
                    actor_type="system",
                    lane_override=BmadLane.CORRECTIVE_LOOP.value,
                )
                return
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_path_scope_passed",
                    f"Recipe implementation path scope passed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "implementation-path-scope",
                        path_payload | {"passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"]},
                    ),
                )
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_passed",
                    f"Recipe implementation automation passed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "implementation-automation",
                        "implementation-command-run",
                        {
                            "commands": command_results,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"],
                        },
                    ),
                )
            await self._create_or_refresh_lease(session, item)
            await self._transition(
                session,
                item,
                WorkflowState.IMPLEMENTING,
                "recipe.implementing" if recipe else "work_item.implementing",
                default_status_summary(WorkflowState.IMPLEMENTING),
                payload_overrides=self._recipe_policy_payload(
                    recipe,
                    "branch-ownership",
                    "implementation-start",
                    branch_payload | {"passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"]} if recipe else {},
                ),
                lane_override=BmadLane.IMPLEMENTATION.value,
            )
            return

    async def _apply_action_to_item(
        self,
        session: AsyncSession,
        item: WorkItem,
        action: WorkflowAction,
        note: str | None,
        actor_id: str | None,
        actor_label: str | None,
    ) -> None:
        current = WorkflowState(item.state)
        clean_note = note.strip() if note else None
        self._enforce_action_policy(item, action, clean_note)

        if action == WorkflowAction.SUBMIT_FOR_VALIDATION and current == WorkflowState.IMPLEMENTING:
            recipe = self._execution_recipe_for_item(item)
            path_error, path_payload = self._recipe_path_scope_policy(item, recipe)
            if recipe and path_error:
                item.blocked_reason = None
                await self._record_event(
                    session,
                    item,
                    "recipe.path_scope_failed",
                    f"Recipe path scope failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "path-scope-check",
                        path_payload | {"note": clean_note, "reason": path_error},
                    ),
                )
                await self._transition(
                    session,
                    item,
                    WorkflowState.NEEDS_REWORK,
                    "workflow.needs_rework",
                    "Recipe changed files escaped the allowed path boundary.",
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "path-scope-check",
                        path_payload | {"note": clean_note, "reason": path_error},
                    ),
                    actor_type="system",
                    lane_override=BmadLane.CORRECTIVE_LOOP.value,
                )
                return
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.path_scope_passed",
                    f"Recipe path scope passed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "path-scope-check",
                        path_payload | {"note": clean_note},
                    ),
                )
            command_results = self._run_recipe_verification_commands(recipe)
            if recipe and not all(result["exitCode"] == 0 for result in command_results):
                item.blocked_reason = None
                await self._record_event(
                    session,
                    item,
                    "recipe.verification_failed",
                    f"Recipe verification failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "verification",
                        "verification-command-run",
                        {
                            "note": clean_note,
                            "commands": command_results,
                        },
                    ),
                )
                await self._transition(
                    session,
                    item,
                    WorkflowState.NEEDS_REWORK,
                    "workflow.needs_rework",
                    "Recipe verification failed before validation handoff.",
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "verification",
                        "verification-command-run",
                        {
                            "note": clean_note,
                            "commands": command_results,
                        },
                    ),
                    actor_type="system",
                    lane_override=BmadLane.CORRECTIVE_LOOP.value,
                )
                return
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.verification_passed",
                    f"Recipe verification passed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "verification",
                        "verification-command-run",
                        {
                            "note": clean_note,
                            "commands": command_results,
                        },
                    ),
                )
            await self._transition(
                session,
                item,
                WorkflowState.VALIDATING,
                "workflow.validating",
                clean_note or default_status_summary(WorkflowState.VALIDATING),
                payload_overrides=self._recipe_policy_payload(
                    recipe,
                    "verification",
                    "validation-evidence",
                    {"note": clean_note, "commands": command_results if recipe else None},
                ),
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.VALIDATION.value,
            )
            return

        if action == WorkflowAction.VALIDATION_PASSED and current == WorkflowState.VALIDATING:
            recipe = self._execution_recipe_for_item(item)
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.delivery_gate_recorded",
                    "Supervisor recorded recipe delivery gate status before review.",
                    self._recipe_policy_payload(
                        recipe,
                        "delivery-readiness",
                        "delivery-gate",
                        self._recipe_delivery_gate_payload(item, recipe),
                    ),
                    actor_type="operator",
                    actor_id=actor_id,
                    actor_label=actor_label,
                )
            await self._transition(
                session,
                item,
                WorkflowState.REVIEWING,
                "workflow.reviewing",
                clean_note or default_status_summary(WorkflowState.REVIEWING),
                payload_overrides=self._recipe_policy_payload(
                    recipe,
                    "verification",
                    "review-entry",
                    {"note": clean_note},
                ),
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.REVIEW.value,
            )
            return

        if action == WorkflowAction.VALIDATION_FAILED and current == WorkflowState.VALIDATING:
            item.blocked_reason = None
            await self._transition(
                session,
                item,
                WorkflowState.NEEDS_REWORK,
                "workflow.needs_rework",
                clean_note or default_status_summary(WorkflowState.NEEDS_REWORK),
                payload_overrides={"note": clean_note},
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.CORRECTIVE_LOOP.value,
            )
            return

        if action == WorkflowAction.APPROVE_REVIEW and current == WorkflowState.REVIEWING:
            if item.requires_audit:
                if item.audit_mode == AuditMode.NONE.value:
                    await self._maybe_create_audit(session, item)
                await self._transition(
                    session,
                    item,
                    WorkflowState.AWAITING_AUDIT,
                    "workflow.awaiting_audit",
                    clean_note or default_status_summary(WorkflowState.AWAITING_AUDIT),
                    payload_overrides=self._recipe_policy_payload(
                        self._execution_recipe_for_item(item),
                        "review",
                        "operator-review",
                        {"note": clean_note, "auditMode": item.audit_mode},
                    ),
                    actor_type="operator",
                    actor_id=actor_id,
                    actor_label=actor_label,
                    lane_override=BmadLane.REVIEW.value,
                )
                return
            await self._transition(
                session,
                item,
                WorkflowState.DONE,
                "workflow.done",
                clean_note or default_status_summary(WorkflowState.DONE),
                payload_overrides=self._recipe_policy_payload(
                    self._execution_recipe_for_item(item),
                    "review",
                    "operator-review",
                    {"note": clean_note},
                ),
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.REVIEW.value,
            )
            return

        if action == WorkflowAction.COMPLETE_AUDIT_REVIEW and current == WorkflowState.AWAITING_AUDIT:
            if item.audit_mode == AuditMode.NONE.value:
                raise ValueError("Audit completion is not available until an audit has been requested.")
            await self._transition(
                session,
                item,
                WorkflowState.DONE,
                "workflow.done",
                clean_note or default_status_summary(WorkflowState.DONE),
                payload_overrides=self._recipe_policy_payload(
                    self._execution_recipe_for_item(item),
                    "review",
                    "audit-complete",
                    {"note": clean_note, "auditMode": item.audit_mode},
                ),
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.REVIEW.value,
            )
            return

        if action == WorkflowAction.REQUEST_REWORK and current == WorkflowState.REVIEWING:
            item.blocked_reason = None
            await self._transition(
                session,
                item,
                WorkflowState.NEEDS_REWORK,
                "workflow.needs_rework",
                clean_note or default_status_summary(WorkflowState.NEEDS_REWORK),
                payload_overrides={"note": clean_note},
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.CORRECTIVE_LOOP.value,
            )
            return

        if action == WorkflowAction.REQUEST_REWORK and current == WorkflowState.AWAITING_AUDIT:
            item.blocked_reason = None
            await self._transition(
                session,
                item,
                WorkflowState.NEEDS_REWORK,
                "workflow.needs_rework",
                clean_note or default_status_summary(WorkflowState.NEEDS_REWORK),
                payload_overrides={"note": clean_note, "auditMode": item.audit_mode},
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.CORRECTIVE_LOOP.value,
            )
            return

        if action == WorkflowAction.RESTART_IMPLEMENTATION and current == WorkflowState.NEEDS_REWORK:
            if self._repo_is_dirty():
                item.blocked_reason = "Repository is dirty. Clean the working tree before implementation restarts."
                await self._transition(session, item, WorkflowState.BLOCKED, "repo.blocked", default_status_summary(WorkflowState.BLOCKED))
                return
            recipe = self._execution_recipe_for_item(item)
            branch_error, branch_payload = self._recipe_branch_policy(item, recipe)
            if branch_error:
                item.blocked_reason = branch_error
                await self._transition(
                    session,
                    item,
                    WorkflowState.BLOCKED,
                    "recipe.branch_blocked",
                    default_status_summary(WorkflowState.BLOCKED),
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "branch-ownership",
                        "branch-policy",
                        branch_payload | {"reason": branch_error},
                    ),
                    actor_type="operator",
                    actor_id=actor_id,
                    actor_label=actor_label,
                )
                return
            command_results = self._run_recipe_implementation_commands(recipe, item)
            if recipe and not all(result["exitCode"] == 0 for result in command_results):
                item.blocked_reason = None
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_failed",
                    f"Recipe implementation automation failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "implementation-automation",
                        "implementation-restart-command-run",
                        {
                            "note": clean_note,
                            "commands": command_results,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership"],
                        },
                    ),
                    actor_type="system",
                )
                await self._transition(
                    session,
                    item,
                    WorkflowState.NEEDS_REWORK,
                    "workflow.needs_rework",
                    "Recipe implementation automation failed before implementation restart.",
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "implementation-automation",
                        "implementation-restart-command-run",
                        {
                            "note": clean_note,
                            "commands": command_results,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership"],
                        },
                    ),
                    actor_type="system",
                    lane_override=BmadLane.CORRECTIVE_LOOP.value,
                )
                return
            path_error, path_payload = self._recipe_path_scope_policy(item, recipe)
            if recipe and path_error:
                item.blocked_reason = None
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_path_scope_failed",
                    f"Recipe implementation path scope failed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "implementation-restart-path-scope",
                        path_payload
                        | {
                            "note": clean_note,
                            "reason": path_error,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"],
                        },
                    ),
                    actor_type="system",
                )
                await self._transition(
                    session,
                    item,
                    WorkflowState.NEEDS_REWORK,
                    "workflow.needs_rework",
                    "Recipe implementation automation escaped the allowed path boundary.",
                    payload_overrides=self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "implementation-restart-path-scope",
                        path_payload
                        | {
                            "note": clean_note,
                            "reason": path_error,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"],
                        },
                    ),
                    actor_type="system",
                    lane_override=BmadLane.CORRECTIVE_LOOP.value,
                )
                return
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_path_scope_passed",
                    f"Recipe implementation path scope passed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "path-scope",
                        "implementation-restart-path-scope",
                        path_payload
                        | {
                            "note": clean_note,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"],
                        },
                    ),
                    actor_type="operator",
                    actor_id=actor_id,
                    actor_label=actor_label,
                )
            if recipe:
                await self._record_event(
                    session,
                    item,
                    "recipe.implementation_passed",
                    f"Recipe implementation automation passed for {recipe.label}.",
                    self._recipe_policy_payload(
                        recipe,
                        "implementation-automation",
                        "implementation-restart-command-run",
                        {
                            "note": clean_note,
                            "commands": command_results,
                            "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"],
                        },
                    ),
                    actor_type="operator",
                    actor_id=actor_id,
                    actor_label=actor_label,
                )
            await self._create_or_refresh_lease(session, item)
            item.blocked_reason = None
            await self._transition(
                session,
                item,
                WorkflowState.IMPLEMENTING,
                "recipe.implementing" if recipe else "work_item.implementing",
                clean_note or default_status_summary(WorkflowState.IMPLEMENTING),
                payload_overrides=self._recipe_policy_payload(
                    recipe,
                    "branch-ownership",
                    "implementation-restart",
                    branch_payload | {"note": clean_note, "passedPolicyGates": ["clean-worktree", "branch-ownership", "implementation-automation"]} if recipe else {"note": clean_note},
                ),
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.IMPLEMENTATION.value,
            )
            return

        if action == WorkflowAction.RETURN_TO_READY and current == WorkflowState.BLOCKED:
            item.blocked_reason = None
            await self._transition(
                session,
                item,
                WorkflowState.READY,
                "work_item.ready",
                clean_note or default_status_summary(WorkflowState.READY),
                payload_overrides={"note": clean_note},
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.INTAKE.value,
            )
            return

        raise ValueError(f"Action {action.value} is not valid from state {current.value}")

    def _enforce_action_policy(self, item: WorkItem, action: WorkflowAction, note: str | None) -> None:
        note_required_actions = {
            WorkflowAction.VALIDATION_FAILED,
            WorkflowAction.REQUEST_REWORK,
            WorkflowAction.RETURN_TO_READY,
            WorkflowAction.COMPLETE_AUDIT_REVIEW,
        }

        if action in note_required_actions and not note:
            raise ValueError(f"Action {action.value} requires an operator note.")

        recipe = self._execution_recipe_for_item(item)
        if recipe and action in {WorkflowAction.SUBMIT_FOR_VALIDATION, WorkflowAction.VALIDATION_PASSED} and not note:
            raise ValueError(f"Recipe action {action.value} requires an operator checkpoint note.")

        if action == WorkflowAction.APPROVE_REVIEW and (item.requires_audit or recipe) and not note:
            raise ValueError("Review approval requires an operator note before the final gate can advance.")

        if recipe and action == WorkflowAction.APPROVE_REVIEW:
            delivery_error = self._recipe_delivery_review_error(item)
            if delivery_error:
                raise ValueError(delivery_error)

    async def _maybe_create_audit(self, session: AsyncSession, item: WorkItem) -> None:
        if item.risk_level == "low":
            return
        mode = AuditMode.REQUIRED if item.risk_level == "high" else AuditMode.ADVISORY
        item.audit_mode = mode.value
        audit = AuditEvent(
            work_item_id=item.id,
            reason="Risk-based external review triggered by supervisor policy.",
            mode=mode.value,
            outcome="Claude review lane requested.",
        )
        session.add(audit)
        await self._record_event(
            session,
            item,
            "audit.requested",
            f"Claude audit requested in {mode.value} mode.",
            {"auditMode": mode.value},
        )

    async def _create_or_refresh_lease(self, session: AsyncSession, item: WorkItem) -> None:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(QueueLease).where(QueueLease.work_item_id == item.id, QueueLease.active.is_(True))
        )
        lease = result.scalars().first()
        if lease:
            lease.heartbeat_at = now
            lease.lease_expires_at = now + timedelta(seconds=self.settings.lease_ttl_seconds)
            lease.fencing_token += 1
            lease.attempt_count += 1
            return
        session.add(
            QueueLease(
                work_item_id=item.id,
                heartbeat_at=now,
                lease_expires_at=now + timedelta(seconds=self.settings.lease_ttl_seconds),
                fencing_token=1,
                attempt_count=1,
                active=True,
            )
        )

    async def _transition(
        self,
        session: AsyncSession,
        item: WorkItem,
        new_state: WorkflowState,
        event_type: str,
        summary: str,
        payload_overrides: dict | None = None,
        actor_type: str = "system",
        actor_id: str | None = None,
        actor_label: str | None = None,
        lane_override: str | None | object = _LANE_UNSET,
    ) -> None:
        item.state = new_state.value
        if lane_override is not _LANE_UNSET:
            item.lane = lane_override
        item.status_summary = summary
        item.next_step = next_step_summary(new_state)
        item.updated_at = datetime.now(timezone.utc)
        item.last_event_at = item.updated_at
        payload = {"state": item.state, "lane": item.lane}
        if payload_overrides:
            payload.update({key: value for key, value in payload_overrides.items() if value is not None})
        await self._record_event(
            session,
            item,
            event_type,
            summary,
            payload,
            actor_type=actor_type,
            actor_id=actor_id,
            actor_label=actor_label,
        )
        await self._publish_item(item)

    async def _record_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        event_type: str,
        summary: str,
        payload: dict,
        actor_type: str = "system",
        actor_id: str | None = None,
        actor_label: str | None = None,
    ) -> WorkflowEvent:
        correlation_id = str(uuid.uuid4())
        event = WorkflowEvent(
            work_item_id=item.id,
            event_type=event_type,
            actor_type=actor_type,
            actor_id=actor_id,
            actor_label=actor_label,
            correlation_id=correlation_id,
            summary=summary,
            payload=payload,
        )
        session.add(event)
        await self.bus.publish(
            self._event_payload(
                event_type,
                item.id,
                correlation_id,
                payload | {"summary": summary},
                actor_type=actor_type,
                actor_id=actor_id,
                actor_label=actor_label,
            )
        )
        return event

    async def _publish_item(self, item: WorkItem) -> None:
        needs_attention, attention_reason = self._derive_attention(item)
        await self.bus.publish(
            self._event_payload(
                "work_item.snapshot",
                item.id,
                str(uuid.uuid4()),
                {
                    "state": item.state,
                    "lane": item.lane,
                    "assigneeId": item.assignee_id,
                    "assigneeLabel": item.assignee_label,
                    "needsAttention": needs_attention,
                    "attentionReason": attention_reason,
                    "summary": item.status_summary,
                    "blockedReason": item.blocked_reason,
                    "nextStep": item.next_step,
                },
            )
        )

    async def _publish_candidate_work(self, candidate: CandidateWork) -> None:
        await self.bus.publish(
            self._event_payload(
                "candidate_work.snapshot",
                None,
                str(uuid.uuid4()),
                {
                    "candidateWorkId": candidate.id,
                    "title": candidate.title,
                    "source": candidate.source,
                    "sourceArtifactPath": candidate.source_artifact_path,
                    "riskLevel": candidate.risk_level,
                    "priority": candidate.priority,
                    "sortOrder": candidate.sort_order,
                    "status": candidate.status,
                    "promotedWorkItemId": candidate.promoted_work_item_id,
                    "importMetadata": candidate.import_metadata_json if isinstance(candidate.import_metadata_json, dict) else {},
                    "summary": f"Proposed work updated: {candidate.title}",
                },
            )
        )

    def _event_payload(
        self,
        event_type: str,
        work_item_id: str | None = None,
        correlation_id: str | None = None,
        payload: dict | None = None,
        actor_type: str = "system",
        actor_id: str | None = None,
        actor_label: str | None = None,
    ) -> str:
        return json.dumps(
            {
                "eventId": str(uuid.uuid4()),
                "eventType": event_type,
                "occurredAt": datetime.now(timezone.utc).isoformat(),
                "workItemId": work_item_id,
                "workflowRunId": None,
                "correlationId": correlation_id or str(uuid.uuid4()),
                "actorType": actor_type,
                "actorId": actor_id,
                "actorLabel": actor_label,
                "payload": payload or {},
            }
        )

    def _repo_is_dirty(self) -> bool:
        if self.settings.allow_dirty_repo:
            return False
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True,
                text=True,
                check=False,
                cwd=self._repo_root(),
            )
            return bool(result.stdout.strip())
        except OSError:
            return False

    def _git_output(self, args: list[str]) -> tuple[bool, str]:
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                cwd=self._repo_root(),
            )
        except OSError as exc:
            return False, str(exc)
        output = result.stdout.strip() or result.stderr.strip()
        return result.returncode == 0, output

    def _git_hygiene_output(self, args: list[str], repo_root: str) -> tuple[bool, str]:
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                timeout=10,
                cwd=repo_root,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return False, str(exc)
        output = result.stdout.strip() or result.stderr.strip()
        return result.returncode == 0, output

    def _git_hygiene_status_counts(self, porcelain: str) -> dict[str, int]:
        counts = {
            "added": 0,
            "modified": 0,
            "deleted": 0,
            "renamed": 0,
            "untracked": 0,
            "conflicted": 0,
        }
        for line in porcelain.splitlines():
            if not line:
                continue
            status = line[:2]
            if status == "??":
                counts["untracked"] += 1
                continue
            if "U" in status or status in {"AA", "DD"}:
                counts["conflicted"] += 1
            if "A" in status:
                counts["added"] += 1
            if "M" in status:
                counts["modified"] += 1
            if "D" in status:
                counts["deleted"] += 1
            if "R" in status:
                counts["renamed"] += 1
        return counts

    def _parse_git_worktrees(self, porcelain: str) -> list[GitHygieneWorktreeView]:
        worktrees: list[GitHygieneWorktreeView] = []
        current: dict[str, str | bool | None] | None = None
        for raw_line in porcelain.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("worktree "):
                if current:
                    worktrees.append(self._git_hygiene_worktree_view(current))
                current = {
                    "path": line.removeprefix("worktree "),
                    "branch": None,
                    "head": None,
                    "detached": False,
                    "locked": False,
                    "prunable": False,
                }
                continue
            if current is None:
                continue
            if line.startswith("HEAD "):
                current["head"] = line.removeprefix("HEAD ")[:12]
            elif line.startswith("branch "):
                current["branch"] = line.removeprefix("branch ").removeprefix("refs/heads/")
            elif line == "detached":
                current["detached"] = True
            elif line.startswith("locked"):
                current["locked"] = True
            elif line.startswith("prunable"):
                current["prunable"] = True
        if current:
            worktrees.append(self._git_hygiene_worktree_view(current))
        return worktrees

    def _git_hygiene_worktree_view(self, data: dict[str, str | bool | None]) -> GitHygieneWorktreeView:
        return GitHygieneWorktreeView(
            path=str(data.get("path") or ""),
            branch=str(data["branch"]) if data.get("branch") else None,
            head=str(data["head"]) if data.get("head") else None,
            detached=bool(data.get("detached")),
            locked=bool(data.get("locked")),
            prunable=bool(data.get("prunable")),
        )

    def _git_success(self, args: list[str]) -> bool:
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                cwd=self._repo_root(),
            )
        except OSError:
            return False
        return result.returncode == 0

    def _run_git_command(self, args: list[str]) -> dict:
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                cwd=self._repo_root(),
            )
        except OSError as exc:
            return {"command": " ".join(args), "exitCode": 1, "stdout": "", "stderr": str(exc)}
        return {
            "command": " ".join(args),
            "exitCode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }

    def _run_recipe_verification_commands(self, recipe: ExecutionRecipe | None) -> list[dict]:
        if not recipe:
            return []

        return [self._run_recipe_command(command) for command in recipe.verification_commands]

    def _run_recipe_implementation_commands(self, recipe: ExecutionRecipe | None, item: WorkItem) -> list[dict]:
        if not recipe:
            return []

        return [self._run_recipe_command(command, recipe, item) for command in recipe.implementation_commands]

    def _run_recipe_command(self, command: RecipeCommand, recipe: ExecutionRecipe | None = None, item: WorkItem | None = None) -> dict:
        args = self._resolve_recipe_command_args(list(command.args))
        if not args:
            return {"command": command.display, "exitCode": 1, "stdout": "", "stderr": "Empty recipe command."}

        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                timeout=600,
                cwd=self._repo_root(),
                env=self._recipe_command_env(recipe, item),
            )
        except subprocess.TimeoutExpired as exc:
            return {
                "command": command.display,
                "exitCode": 124,
                "stdout": exc.stdout or "",
                "stderr": "Recipe command timed out.",
            }
        except OSError as exc:
            return {"command": command.display, "exitCode": 1, "stdout": "", "stderr": str(exc)}

        return {
            "command": command.display,
            "exitCode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }

    def _run_remote_command(self, args: list[str], timeout: int = 600) -> dict:
        resolved_args = self._resolve_recipe_command_args(args)
        try:
            result = subprocess.run(
                resolved_args,
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout,
                cwd=self._repo_root(),
            )
        except subprocess.TimeoutExpired as exc:
            return {
                "command": " ".join(args),
                "exitCode": 124,
                "stdout": exc.stdout or "",
                "stderr": "Remote delivery command timed out.",
            }
        except OSError as exc:
            return {"command": " ".join(args), "exitCode": 1, "stdout": "", "stderr": str(exc)}

        return {
            "command": " ".join(args),
            "exitCode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }

    def _resolve_recipe_command_args(self, args: list[str]) -> list[str]:
        if not args:
            return args

        executable = args[0]
        resolved = shutil.which(executable)
        if resolved:
            return [resolved, *args[1:]]

        if executable == "pnpm":
            corepack = shutil.which("corepack")
            if corepack:
                return [corepack, "pnpm", *args[1:]]

        return args

    def _remote_delivery_enabled(self) -> bool:
        return self.settings.allow_remote_delivery

    def _remote_delivery_policy_view(self, recipe: ExecutionRecipe) -> WorkItemRemoteAutomationPolicyView:
        policy = recipe.remote_automation_policy
        remote_ready, remote_reason = self._remote_delivery_preflight_status()
        if not self._remote_delivery_enabled():
            return WorkItemRemoteAutomationPolicyView(
                status=policy.status,
                summary=policy.summary,
                allowedOperations=list(policy.allowed_operations),
                blockedOperations=list(policy.blocked_operations),
                approvalRequirements=list(policy.approval_requirements),
            )
        return WorkItemRemoteAutomationPolicyView(
            status="available" if remote_ready else "blocked",
            summary=(
                "Remote delivery automation is enabled for approved recipe work and the live delivery target is ready."
                if remote_ready
                else f"Remote delivery automation is enabled but the live delivery target is not ready: {remote_reason}"
            ),
            allowedOperations=["git push", "pull request creation", "CI wait", "merge"],
            blockedOperations=["release", "deployment"],
            approvalRequirements=list(policy.approval_requirements)
            + ["GitHub auth and an origin remote must be available before live delivery can run."],
        )

    def _remote_delivery_commands(self, item: WorkItem) -> list[dict]:
        remote_ready, remote_reason = self._remote_delivery_preflight_status()
        if not remote_ready:
            return [
                {
                    "command": "remote-delivery-preflight",
                    "exitCode": 1,
                    "stdout": "",
                    "stderr": remote_reason,
                }
            ]
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        execution_branch = metadata.get("executionBranch")
        base_branch = metadata.get("baseBranch") if isinstance(metadata.get("baseBranch"), str) and metadata.get("baseBranch").strip() else "main"
        title = item.title.strip()
        body = item.requested_outcome.strip()
        commands: list[dict] = []

        if not isinstance(execution_branch, str) or not execution_branch.strip():
            return [
                {
                    "command": "remote-delivery",
                    "exitCode": 1,
                    "stdout": "",
                    "stderr": "Remote delivery requires executionBranch metadata.",
                }
            ]

        execution_branch = execution_branch.strip()
        commands.append(self._run_remote_command(["git", "push", "-u", "origin", execution_branch]))
        if commands[-1]["exitCode"] != 0:
            return commands

        pr_create = self._run_remote_command([
            "gh",
            "pr",
            "create",
            "--base",
            base_branch,
            "--head",
            execution_branch,
            "--title",
            title,
            "--body",
            body,
        ])
        commands.append(pr_create)
        if pr_create["exitCode"] != 0:
            return commands

        pr_url = self._extract_pull_request_url(pr_create["stdout"])
        if not pr_url:
            pr_view = self._run_remote_command(["gh", "pr", "view", "--json", "url", "--jq", ".url"])
            commands.append(pr_view)
            if pr_view["exitCode"] == 0:
                pr_url = pr_view["stdout"].strip()

        checks = self._run_remote_command(["gh", "pr", "checks", "--watch", "--fail-fast"])
        commands.append(checks)
        if checks["exitCode"] != 0:
            return commands

        merge = self._run_remote_command(["gh", "pr", "merge", "--squash", "--delete-branch"])
        commands.append(merge)
        if merge["exitCode"] != 0:
            return commands

        commands.append(
            {
                "command": "remote-delivery",
                "exitCode": 0,
                "stdout": pr_url or "",
                "stderr": "",
            }
        )
        return commands

    def _remote_delivery_preflight_status(self) -> tuple[bool, str]:
        origin_result = self._run_remote_command(["git", "remote", "get-url", "origin"], timeout=30)
        if origin_result["exitCode"] != 0:
            return False, "Git origin remote is missing or inaccessible."
        auth_result = self._run_remote_command(["gh", "auth", "status"], timeout=30)
        if auth_result["exitCode"] != 0:
            return False, "GitHub CLI authentication is not available."
        return True, ""

    def _extract_pull_request_url(self, stdout: str) -> str | None:
        for line in stdout.splitlines():
            candidate = line.strip()
            if candidate.startswith("https://github.com/"):
                return candidate
        return None

    def _repo_root(self) -> str | None:
        ok, output = self._git_output_uncached(["git", "rev-parse", "--show-toplevel"])
        return output if ok and output else None

    def _git_output_uncached(self, args: list[str]) -> tuple[bool, str]:
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError as exc:
            return False, str(exc)
        output = result.stdout.strip() or result.stderr.strip()
        return result.returncode == 0, output

    def _recipe_command_env(self, recipe: ExecutionRecipe | None, item: WorkItem | None) -> dict[str, str]:
        env = dict(os.environ)
        if recipe:
            env["KENDALL_RECIPE_ID"] = recipe.id
            env["KENDALL_RECIPE_ALLOWED_PATHS"] = json.dumps(list(recipe.allowed_paths))
        if item:
            env["KENDALL_WORK_ITEM_ID"] = item.id
            env["KENDALL_WORK_ITEM_TITLE"] = item.title
            env["KENDALL_WORK_ITEM_SOURCE"] = item.source
            env["KENDALL_WORK_ITEM_REQUESTED_OUTCOME"] = item.requested_outcome
        return env

    def _normalize_timestamp(self, value: datetime | None) -> datetime:
        if value is None:
            return datetime.now(timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _age_minutes(self, item: WorkItem) -> int:
        now = datetime.now(timezone.utc)
        last_event_at = self._normalize_timestamp(item.last_event_at)
        return max(0, int((now - last_event_at).total_seconds() // 60))

    def _derive_attention(self, item: WorkItem) -> tuple[bool, str | None]:
        age_minutes = self._age_minutes(item)

        if item.escalated_at:
            by = f" by {item.escalated_by_label}" if item.escalated_by_label else ""
            reason = item.escalation_reason or "Operator escalation"
            return True, f"Escalated{by}: {reason}"

        if item.state == WorkflowState.BLOCKED.value:
            return True, item.blocked_reason or "Blocked item needs operator attention."

        if item.state == WorkflowState.AWAITING_AUDIT.value and age_minutes >= 10:
            return True, "Audit lane is aging and needs review."

        if item.state == WorkflowState.READY.value and not item.assignee_id and age_minutes >= 10:
            return True, "Ready work has no owner."

        if item.state in ACTIVE_STATES and not item.assignee_id and age_minutes >= 15:
            return True, "Active work has no clear owner."

        if item.state in ACTIVE_STATES and age_minutes >= 45:
            return True, "Active work is aging and should be reviewed."

        return False, None

    def _execution_recipe_for_item(self, item: WorkItem) -> ExecutionRecipe | None:
        recipe_id = self._requested_execution_recipe_id(item)
        if recipe_id:
            return EXECUTION_RECIPES.get(recipe_id)
        return None

    def _requested_execution_recipe_id(self, item: WorkItem) -> str | None:
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        recipe_id = metadata.get("executionRecipeId")
        if isinstance(recipe_id, str) and recipe_id.strip():
            return recipe_id.strip()
        return None

    def _validate_execution_recipe(self, item: WorkItem) -> str | None:
        recipe_id = self._requested_execution_recipe_id(item)
        if not recipe_id:
            return None
        recipe = EXECUTION_RECIPES.get(recipe_id)
        if not recipe:
            return f"Unknown execution recipe requested: {recipe_id}."

        if recipe.id in {"dashboard-test-coverage", "dashboard-mobile-coverage"}:
            if item.risk_level == "high":
                return f"{recipe.label} recipe only supports low or medium risk work."
            if not item.source.startswith("operator-dashboard"):
                return f"{recipe.label} recipe requires an operator-dashboard source."

        return None

    def _recipe_branch_policy(self, item: WorkItem, recipe: ExecutionRecipe | None) -> tuple[str | None, dict]:
        if not recipe:
            return None, {}

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        expected_branch = metadata.get("executionBranch")
        base_branch = metadata.get("baseBranch")
        base_revision = metadata.get("baseRevision")
        normalized_base_branch = base_branch.strip() if isinstance(base_branch, str) and base_branch.strip() else "main"

        payload = {
            "branchPrefix": recipe.branch_prefix,
            "expectedBranch": expected_branch if isinstance(expected_branch, str) else None,
            "baseBranch": normalized_base_branch,
            "baseRevision": base_revision if isinstance(base_revision, str) else None,
        }

        if not isinstance(expected_branch, str) or not expected_branch.strip():
            return "Recipe work requires executionBranch metadata before implementation can start.", payload

        expected_branch = expected_branch.strip()
        payload["expectedBranch"] = expected_branch
        if not expected_branch.startswith(recipe.branch_prefix):
            return f"Recipe branch must start with {recipe.branch_prefix}.", payload

        if not isinstance(base_revision, str) or not base_revision.strip():
            return "Recipe work requires baseRevision metadata before implementation can start.", payload

        base_revision = base_revision.strip()
        payload["baseRevision"] = base_revision
        base_branch = payload["baseBranch"]

        ok, current_branch = self._git_output(["git", "branch", "--show-current"])
        payload["currentBranch"] = current_branch if ok else None
        if not ok or not current_branch:
            return "Recipe branch ownership could not be verified from the current Git worktree.", payload
        if current_branch != expected_branch:
            return f"Recipe branch mismatch: expected {expected_branch}, found {current_branch}.", payload

        ok, current_base_revision = self._git_output(["git", "rev-parse", "--verify", base_branch])
        payload["currentBaseRevision"] = current_base_revision if ok else None
        if not ok or not current_base_revision:
            return f"Recipe base branch could not be verified: {base_branch}.", payload
        if current_base_revision != base_revision:
            return f"Recipe branch is stale: {base_branch} moved since baseRevision was recorded.", payload

        if not self._git_success(["git", "merge-base", "--is-ancestor", base_revision, "HEAD"]):
            return "Recipe branch does not contain its recorded baseRevision.", payload

        return None, payload

    def _prepare_recipe_branch(self, item: WorkItem, recipe: ExecutionRecipe) -> tuple[str | None, dict]:
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        expected_branch = metadata.get("executionBranch")
        base_branch = metadata.get("baseBranch")
        base_revision = metadata.get("baseRevision")
        normalized_base_branch = base_branch.strip() if isinstance(base_branch, str) and base_branch.strip() else "main"
        payload = {
            "branchPrefix": recipe.branch_prefix,
            "expectedBranch": expected_branch if isinstance(expected_branch, str) else None,
            "baseBranch": normalized_base_branch,
            "baseRevision": base_revision if isinstance(base_revision, str) else None,
        }

        if not isinstance(expected_branch, str) or not expected_branch.strip():
            return "Recipe work requires executionBranch metadata before branch preparation can run.", payload
        if not expected_branch.strip().startswith(recipe.branch_prefix):
            return f"Recipe branch must start with {recipe.branch_prefix}.", payload
        if not isinstance(base_revision, str) or not base_revision.strip():
            return "Recipe work requires baseRevision metadata before branch preparation can run.", payload

        expected_branch = expected_branch.strip()
        base_revision = base_revision.strip()
        payload["expectedBranch"] = expected_branch
        payload["baseRevision"] = base_revision

        ok, current_branch = self._git_output(["git", "branch", "--show-current"])
        payload["currentBranch"] = current_branch if ok else None
        if not ok or not current_branch:
            return "Recipe branch preparation could not determine the current Git branch.", payload

        ok, current_base_revision = self._git_output(["git", "rev-parse", "--verify", normalized_base_branch])
        payload["currentBaseRevision"] = current_base_revision if ok else None
        if not ok or not current_base_revision:
            return f"Recipe base branch could not be verified: {normalized_base_branch}.", payload
        if current_base_revision != base_revision:
            return f"Recipe branch is stale: {normalized_base_branch} moved since baseRevision was recorded.", payload

        if current_branch == expected_branch:
            policy_error, policy_payload = self._recipe_branch_policy(item, recipe)
            return policy_error, payload | policy_payload | {"alreadyPrepared": True}

        branch_exists = self._git_success(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{expected_branch}"])
        command = ["git", "switch", expected_branch] if branch_exists else ["git", "switch", "-c", expected_branch, base_revision]
        result = self._run_git_command(command)
        payload["command"] = result
        payload["branchExisted"] = branch_exists
        if result["exitCode"] != 0:
            return "Recipe branch preparation command failed.", payload

        policy_error, policy_payload = self._recipe_branch_policy(item, recipe)
        if policy_error:
            return policy_error, payload | policy_payload

        return None, payload | policy_payload | {"alreadyPrepared": False}

    async def _block_recipe_branch_preparation(
        self,
        session: AsyncSession,
        item: WorkItem,
        recipe: ExecutionRecipe,
        reason: str,
        payload: dict,
        actor_id: str | None,
        actor_label: str | None,
    ) -> None:
        item.blocked_reason = reason
        await self._transition(
            session,
            item,
            WorkflowState.BLOCKED,
            "recipe.branch_preparation_failed",
            reason,
            payload_overrides=self._recipe_policy_payload(
                recipe,
                "branch-ownership",
                "branch-preparation",
                payload | {"reason": reason},
            ),
            actor_type="operator",
            actor_id=actor_id,
            actor_label=actor_label,
            lane_override=BmadLane.IMPLEMENTATION.value,
        )

    def _recipe_path_scope_policy(self, item: WorkItem, recipe: ExecutionRecipe | None) -> tuple[str | None, dict]:
        if not recipe:
            return None, {}

        changed_paths = self._recipe_changed_paths(item)
        allowed_paths = list(recipe.allowed_paths)
        out_of_scope_paths = [path for path in changed_paths if not self._path_is_allowed(path, recipe.allowed_paths)]
        payload = {
            "allowedPaths": allowed_paths,
            "changedPaths": changed_paths,
            "outOfScopePaths": out_of_scope_paths,
        }

        if out_of_scope_paths:
            return "Recipe changed files are outside allowedPaths.", payload

        return None, payload

    def _recipe_changed_paths(self, item: WorkItem) -> list[str]:
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        base_revision = metadata.get("baseRevision")
        commands = []
        if isinstance(base_revision, str) and base_revision.strip():
            commands.append(["git", "diff", "--name-only", f"{base_revision.strip()}...HEAD"])
        commands.extend(
            [
                ["git", "diff", "--name-only"],
                ["git", "diff", "--cached", "--name-only"],
                ["git", "ls-files", "--others", "--exclude-standard"],
            ]
        )

        paths: set[str] = set()
        for command in commands:
            ok, output = self._git_output(command)
            if not ok:
                continue
            for line in output.splitlines():
                normalized = self._normalize_repo_path(line)
                if normalized:
                    paths.add(normalized)

        return sorted(paths)

    def _normalize_repo_path(self, path: str) -> str:
        normalized = path.strip().replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        return normalized

    def _path_is_allowed(self, path: str, allowed_paths: tuple[str, ...]) -> bool:
        normalized_path = self._normalize_repo_path(path)
        for allowed_path in allowed_paths:
            normalized_allowed = self._normalize_repo_path(allowed_path).rstrip("/")
            if normalized_path == normalized_allowed or normalized_path.startswith(f"{normalized_allowed}/"):
                return True
        return False

    def _ensure_recipe_branch_record(self, item: WorkItem, recipe: ExecutionRecipe | None) -> tuple[str | None, dict]:
        if not recipe:
            return None, {}

        metadata = dict(item.metadata_json) if isinstance(item.metadata_json, dict) else {}
        existing_branch = metadata.get("executionBranch")
        existing_base_branch = metadata.get("baseBranch")
        existing_base_revision = metadata.get("baseRevision")
        if (
            isinstance(existing_branch, str)
            and existing_branch.strip()
            and isinstance(existing_base_branch, str)
            and existing_base_branch.strip()
            and isinstance(existing_base_revision, str)
            and existing_base_revision.strip()
        ):
            return None, {}

        ok, base_branch = self._git_output(["git", "branch", "--show-current"])
        if not ok or not base_branch:
            return "Recipe branch record could not determine the current base branch.", {}

        ok, base_revision = self._git_output(["git", "rev-parse", "HEAD"])
        if not ok or not base_revision:
            return "Recipe branch record could not determine the current base revision.", {"baseBranch": base_branch}

        execution_branch = existing_branch.strip() if isinstance(existing_branch, str) and existing_branch.strip() else self._recipe_execution_branch(item, recipe)
        if not execution_branch.startswith(recipe.branch_prefix):
            return f"Recipe branch must start with {recipe.branch_prefix}.", {"expectedBranch": execution_branch, "branchPrefix": recipe.branch_prefix}

        metadata["executionBranch"] = execution_branch
        metadata["baseBranch"] = existing_base_branch.strip() if isinstance(existing_base_branch, str) and existing_base_branch.strip() else base_branch
        metadata["baseRevision"] = existing_base_revision.strip() if isinstance(existing_base_revision, str) and existing_base_revision.strip() else base_revision
        item.metadata_json = metadata
        return None, {
            "expectedBranch": metadata["executionBranch"],
            "baseBranch": metadata["baseBranch"],
            "baseRevision": metadata["baseRevision"],
            "branchPrefix": recipe.branch_prefix,
        }

    def _recipe_execution_branch(self, item: WorkItem, recipe: ExecutionRecipe) -> str:
        normalized = []
        for character in item.title.lower():
            if character.isalnum():
                normalized.append(character)
            elif normalized and normalized[-1] != "-":
                normalized.append("-")
        slug = "".join(normalized).strip("-")[:32] or "work"
        return f"{recipe.branch_prefix}{slug}-{item.id[:8]}"

    def _planned_worktree_path(self, repo_root: str, execution_branch: str) -> Path:
        safe_branch = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in execution_branch).strip("-")
        root = Path(repo_root)
        return root.parent / f"{root.name}-worktrees" / (safe_branch or "worktree")

    def _recipe_delivery_gate_payload(self, item: WorkItem, recipe: ExecutionRecipe | None) -> dict:
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        changed_paths = self._recipe_changed_paths(item) if recipe else []
        out_of_scope_paths = [path for path in changed_paths if recipe and not self._path_is_allowed(path, recipe.allowed_paths)]
        base_revision = metadata.get("baseRevision") if isinstance(metadata.get("baseRevision"), str) else None
        diff_command = ["git", "diff", "--stat", f"{base_revision}...HEAD"] if base_revision else ["git", "diff", "--stat"]
        ok, diff_stat = self._git_output(diff_command)
        payload = {
            "localDeliveryPackageStatus": "ready",
            "localDeliveryPackageKind": "git-diff-summary",
            "changedPaths": changed_paths,
            "outOfScopePaths": out_of_scope_paths,
            "diffStat": diff_stat if ok else None,
            "diffStatAvailable": ok,
            "baseBranch": metadata.get("baseBranch") if isinstance(metadata.get("baseBranch"), str) else None,
            "baseRevision": base_revision,
            "executionBranch": metadata.get("executionBranch") if isinstance(metadata.get("executionBranch"), str) else None,
            "pullRequestStatus": metadata.get("pullRequestStatus") if isinstance(metadata.get("pullRequestStatus"), str) else "not_recorded",
            "pullRequestUrl": metadata.get("pullRequestUrl") if isinstance(metadata.get("pullRequestUrl"), str) else None,
            "pullRequestHeadRevision": metadata.get("pullRequestHeadRevision") if isinstance(metadata.get("pullRequestHeadRevision"), str) else None,
            "ciStatus": metadata.get("ciStatus") if isinstance(metadata.get("ciStatus"), str) else "not_recorded",
            "mergeStatus": metadata.get("mergeStatus") if isinstance(metadata.get("mergeStatus"), str) else "not_recorded",
            "deliveryWaived": metadata.get("deliveryWaived") is True,
            "deliveryWaiverReason": metadata.get("deliveryWaiverReason") if isinstance(metadata.get("deliveryWaiverReason"), str) else None,
            "remoteOperationsPerformed": metadata.get("remoteOperationsPerformed") is True,
            "remoteOperationsPolicy": (
                "live remote delivery executed by the supervisor"
                if metadata.get("remoteOperationsPerformed") is True
                else (
                    "live remote delivery is enabled; supervisor can create a PR, wait for CI, and merge"
                    if self._remote_delivery_enabled()
                    else "record-only; supervisor did not create a PR, wait for CI, or merge"
                )
            ),
        }
        payload["readyForApproval"] = self._delivery_ready_for_approval(payload)
        return payload

    def _normalize_delivery_readiness_payload(self, item: WorkItem, payload: WorkItemDeliveryReadinessRequest) -> dict:
        recipe = self._execution_recipe_for_item(item)
        current = self._recipe_delivery_gate_payload(item, recipe)
        pull_request_status = self._delivery_status_value(payload.pullRequestStatus, current["pullRequestStatus"], PR_STATUSES, "pullRequestStatus")
        ci_status = self._delivery_status_value(payload.ciStatus, current["ciStatus"], CI_STATUSES, "ciStatus")
        merge_status = self._delivery_status_value(payload.mergeStatus, current["mergeStatus"], MERGE_STATUSES, "mergeStatus")
        pull_request_url = payload.pullRequestUrl.strip() if isinstance(payload.pullRequestUrl, str) and payload.pullRequestUrl.strip() else current["pullRequestUrl"]
        delivery_waived = payload.deliveryWaived
        waiver_reason = (
            payload.deliveryWaiverReason.strip()
            if isinstance(payload.deliveryWaiverReason, str) and payload.deliveryWaiverReason.strip()
            else current["deliveryWaiverReason"]
        )
        if delivery_waived and not waiver_reason:
            raise ValueError("Delivery waiver requires a reason.")

        normalized = {
            **current,
            "pullRequestStatus": pull_request_status,
            "pullRequestUrl": pull_request_url,
            "ciStatus": ci_status,
            "mergeStatus": merge_status,
            "deliveryWaived": delivery_waived,
            "deliveryWaiverReason": waiver_reason if delivery_waived else None,
            "remoteOperationsPerformed": current["remoteOperationsPerformed"],
        }
        normalized["readyForApproval"] = self._delivery_ready_for_approval(normalized)
        return normalized

    def _delivery_status_value(self, requested: str | None, current: str, allowed: set[str], field_name: str) -> str:
        value = requested.strip().lower() if isinstance(requested, str) and requested.strip() else current
        if value not in allowed:
            raise ValueError(f"{field_name} must be one of: {', '.join(sorted(allowed))}.")
        return value

    def _delivery_ready_for_approval(self, payload: dict) -> bool:
        waiver_ready = payload.get("deliveryWaived") is True and bool(payload.get("deliveryWaiverReason"))
        remote_delivery_ready = (
            payload.get("pullRequestStatus") in {"recorded", "ready"}
            and payload.get("ciStatus") == "passed"
            and payload.get("mergeStatus") in {"ready", "merged"}
        )
        return waiver_ready or remote_delivery_ready

    def _recipe_delivery_review_error(self, item: WorkItem) -> str | None:
        recipe = self._execution_recipe_for_item(item)
        payload = self._recipe_delivery_gate_payload(item, recipe)
        if self._delivery_ready_for_approval(payload):
            return None
        return "Recipe review approval requires delivery readiness evidence or an explicit delivery waiver."

    def _recipe_gate_audit_view(
        self,
        item: WorkItem,
        recipe: ExecutionRecipe,
        events: list[WorkflowEvent],
        preview_only: bool = False,
    ) -> WorkItemRecipeGateAuditView:
        entries = [self._recipe_gate_audit_entry(item, recipe, gate, events) for gate in recipe.policy_gates]
        passed_count = sum(1 for entry in entries if entry.status == "passed")
        blocked_count = sum(1 for entry in entries if entry.status == "blocked")
        pending_count = sum(1 for entry in entries if entry.status == "pending")
        status = "blocked" if blocked_count else "passed" if passed_count == len(entries) else "pending"
        return WorkItemRecipeGateAuditView(
            recipeId=recipe.id,
            status=status,
            passedCount=passed_count,
            blockedCount=blocked_count,
            pendingCount=pending_count,
            gates=entries,
            nextManagedAction=self._next_managed_action_view(item, recipe, entries, preview_only=preview_only),
        )

    def _next_managed_action_view(
        self,
        item: WorkItem,
        recipe: ExecutionRecipe,
        entries: list[WorkItemRecipeGateAuditEntryView],
        preview_only: bool = False,
    ) -> WorkItemManagedActionView:
        gate_status = {entry.gateId: entry.status for entry in entries}
        blocked_gate = next((entry for entry in entries if entry.status == "blocked"), None)
        if blocked_gate:
            return WorkItemManagedActionView(
                actionId="resolve_blocked_gate",
                label="Resolve blocked policy gate",
                status="blocked",
                reason=blocked_gate.reason or f"{blocked_gate.label} is blocked.",
                requiredGate=blocked_gate.gateId,
                operatorCheckpoint="blocked-gate-resolution",
                allowedActor="operator",
                recovery=self._blocked_gate_recovery(blocked_gate),
            )

        state = WorkflowState(item.state)
        if state in {WorkflowState.QUEUED, WorkflowState.TRIAGED}:
            return WorkItemManagedActionView(
                actionId="supervisor_triage",
                label="Let supervisor finish recipe triage",
                status="available",
                reason="The supervisor can advance intake through recipe scope validation.",
                requiredGate="scope",
                operatorCheckpoint="scope-reviewed",
                allowedActor="supervisor",
            )
        if state == WorkflowState.READY:
            branch_status = gate_status.get("branch-ownership")
            return WorkItemManagedActionView(
                actionId="prepare_recipe_branch" if branch_status != "passed" else "run_recipe_implementation",
                label="Prepare execution branch" if branch_status != "passed" else "Run constrained implementation",
                status="available",
                reason=(
                    "Record or prepare the approved recipe branch before implementation starts."
                    if branch_status != "passed"
                    else "The supervisor may run the recipe implementation commands with remote operations blocked."
                ),
                requiredGate="branch-ownership" if branch_status != "passed" else "implementation-automation",
                operatorCheckpoint="branch-preparation" if branch_status != "passed" else "implementation-command-run",
                allowedActor="operator" if branch_status != "passed" else "supervisor",
            )
        if state == WorkflowState.IMPLEMENTING:
            return WorkItemManagedActionView(
                actionId=WorkflowAction.SUBMIT_FOR_VALIDATION.value,
                label="Submit for validation",
                status="available",
                reason="Operator checkpoint note is required before recipe verification runs.",
                requiredGate="path-scope",
                operatorCheckpoint="path-scope-check",
                allowedActor="operator",
            )
        if state == WorkflowState.VALIDATING:
            return WorkItemManagedActionView(
                actionId=WorkflowAction.VALIDATION_PASSED.value,
                label="Record validation review",
                status="available" if gate_status.get("verification") == "passed" else "waiting",
                reason=(
                    "Verification evidence is recorded; operator can move the recipe into review."
                    if gate_status.get("verification") == "passed"
                    else "Waiting for recipe verification evidence."
                ),
                requiredGate="verification",
                operatorCheckpoint="review-entry",
                allowedActor="operator",
            )
        if state == WorkflowState.REVIEWING:
            delivery_payload = self._recipe_delivery_gate_payload(item, recipe)
            delivery_ready = delivery_payload["readyForApproval"]
            remote_ready = False
            remote_reason = "Remote delivery preflight is skipped for routing preview." if preview_only else ""
            if not preview_only:
                remote_ready, remote_reason = self._remote_delivery_preflight_status()
            if self._remote_delivery_enabled() and not delivery_payload["remoteOperationsPerformed"]:
                return WorkItemManagedActionView(
                    actionId="execute_remote_delivery",
                    label="Execute remote delivery",
                    status="available" if remote_ready else "blocked",
                    reason=(
                        "Remote delivery is approved by the policy ledger and can now create, check, and merge the pull request."
                        if remote_ready
                        else f"Remote delivery is approved by the policy ledger, but the live target is not ready: {remote_reason}"
                    ),
                    requiredGate="delivery-readiness",
                    operatorCheckpoint="remote-delivery" if remote_ready else "remote-delivery-preflight",
                    allowedActor="supervisor",
                    remoteOperation=True,
                    recovery=None if remote_ready else self._remote_delivery_preflight_recovery(),
                )
            return WorkItemManagedActionView(
                actionId=WorkflowAction.APPROVE_REVIEW.value if delivery_ready else "record_delivery_readiness",
                label="Approve recipe output" if delivery_ready else "Record delivery readiness",
                status="available",
                reason=(
                    "Delivery readiness is satisfied by local package evidence, remote readiness evidence, or waiver; final operator approval can complete the recipe."
                    if delivery_ready
                    else "A safe local delivery package, PR/CI/merge readiness evidence, or an explicit waiver is required before approval."
                ),
                requiredGate="review" if delivery_ready else "delivery-readiness",
                operatorCheckpoint="operator-review" if delivery_ready else "delivery-readiness-update",
                allowedActor="operator",
            )
        if state == WorkflowState.NEEDS_REWORK:
            return WorkItemManagedActionView(
                actionId=WorkflowAction.RESTART_IMPLEMENTATION.value,
                label="Restart implementation after rework",
                status="available",
                reason="Corrective-loop evidence is required before the supervisor can retry the constrained recipe.",
                requiredGate="implementation-automation",
                operatorCheckpoint="rework-review",
                allowedActor="operator",
            )
        if state == WorkflowState.BLOCKED:
            return WorkItemManagedActionView(
                actionId="resolve_blocked_work_item",
                label="Resolve blocked work item",
                status="blocked",
                reason=item.blocked_reason or "Work item is blocked before the supervisor can continue.",
                requiredGate=None,
                operatorCheckpoint="blocked-work-item-resolution",
                allowedActor="operator",
                recovery=self._blocked_work_item_recovery(item),
            )
        if state == WorkflowState.DONE:
            return WorkItemManagedActionView(
                actionId="complete",
                label="Recipe complete",
                status="complete",
                reason="All supervisor-managed recipe gates are complete.",
                requiredGate="review",
                operatorCheckpoint="operator-review",
                allowedActor="supervisor",
            )
        return WorkItemManagedActionView(
            actionId="operator_review_required",
            label="Operator review required",
            status="waiting",
            reason=f"State {item.state} does not have an automatic recipe action.",
            requiredGate=None,
            operatorCheckpoint="operator-review",
            allowedActor="operator",
        )

    def _blocked_gate_recovery(self, gate: WorkItemRecipeGateAuditEntryView) -> dict[str, str]:
        reason = (gate.reason or "").lower()
        if "dirty" in reason or "working tree" in reason:
            return {
                "mode": "human-only",
                "label": "Clean the working tree manually",
                "detail": "Inspect the local changes and commit, stash, or remove them before allowing the supervisor to continue.",
            }
        if gate.gateId == "path-scope":
            return {
                "mode": "human-only",
                "label": "Repair out-of-scope changes manually",
                "detail": "Review and remove or intentionally re-scope the out-of-bound changes before the supervisor can continue.",
            }
        if gate.gateId == "branch-ownership":
            return {
                "mode": "operator-checkpoint",
                "label": "Review branch ownership",
                "detail": "Confirm the recorded execution branch, prepare the branch again if safe, or hand the work item back for manual branch repair.",
            }
        if gate.gateId == "clean-worktree":
            return {
                "mode": "human-only",
                "label": "Clean the working tree manually",
                "detail": "Inspect the local changes and commit, stash, or remove them before allowing the supervisor to continue.",
            }
        return {
            "mode": "operator-checkpoint",
            "label": "Review blocked policy gate",
            "detail": "Review the gate evidence and record the appropriate operator checkpoint before continuing.",
        }

    def _blocked_work_item_recovery(self, item: WorkItem) -> dict[str, str]:
        reason = (item.blocked_reason or "").lower()
        if "dirty" in reason or "working tree" in reason:
            return {
                "mode": "human-only",
                "label": "Clean the working tree manually",
                "detail": "Inspect the local changes and commit, stash, or remove them before allowing the supervisor to continue.",
            }
        if "branch" in reason:
            return {
                "mode": "operator-checkpoint",
                "label": "Review branch ownership",
                "detail": "Confirm the recorded execution branch, prepare the branch again if safe, or hand the work item back for manual branch repair.",
            }
        return {
            "mode": "operator-checkpoint",
            "label": "Review blocked work item",
            "detail": "Review the blocked reason and decide whether to repair locally, re-scope the work, or hand it back for manual handling.",
        }

    def _remote_delivery_preflight_recovery(self) -> dict[str, str]:
        return {
            "mode": "operator-checkpoint",
            "label": "Restore live target readiness",
            "detail": "Resolve the remote-delivery preflight issue, then refresh the policy ledger before retrying remote delivery.",
        }

    def _recipe_gate_audit_entry(
        self,
        item: WorkItem,
        recipe: ExecutionRecipe,
        gate,
        events: list[WorkflowEvent],
    ) -> WorkItemRecipeGateAuditEntryView:
        gate_events = [
            event
            for event in events
            if isinstance(event.payload, dict) and event.payload.get("policyGate") == gate.id
        ]
        passed_by_group_event = next(
            (
                event
                for event in events
                if isinstance(event.payload, dict)
                and isinstance(event.payload.get("passedPolicyGates"), list)
                and gate.id in event.payload["passedPolicyGates"]
            ),
            None,
        )
        latest_event = gate_events[0] if gate_events else None
        failed_event = next(
            (
                event
                for event in gate_events
                if event.event_type.endswith("_failed")
                or event.event_type.endswith("_blocked")
                or event.event_type in {"recipe.blocked", "repo.blocked"}
            ),
            None,
        )

        status = "pending"
        reason = None
        if failed_event:
            status = "blocked"
            reason = failed_event.payload.get("reason") if isinstance(failed_event.payload, dict) else failed_event.summary
        elif gate.id == "delivery-readiness":
            delivery_payload = self._recipe_delivery_gate_payload(item, recipe)
            status = "passed" if delivery_payload["readyForApproval"] else "pending"
            reason = None if status == "passed" else "Delivery readiness evidence or waiver is still required."
        elif gate.id == "review":
            status = "passed" if item.state == WorkflowState.DONE.value else "pending"
        elif gate_events or passed_by_group_event:
            status = "passed"

        return WorkItemRecipeGateAuditEntryView(
            gateId=gate.id,
            label=gate.label,
            requiredBefore=gate.required_before,
            status=status,
            summary=gate.summary,
            evidence=list(gate.evidence),
            latestEventType=(latest_event or passed_by_group_event).event_type if latest_event or passed_by_group_event else None,
            latestEventAt=self._normalize_timestamp((latest_event or passed_by_group_event).created_at) if latest_event or passed_by_group_event else None,
            reason=reason,
        )

    def _recipe_policy_payload(
        self,
        recipe: ExecutionRecipe | None,
        gate_id: str,
        checkpoint_id: str,
        extra: dict | None = None,
    ) -> dict:
        payload = dict(extra or {})
        if not recipe:
            return payload

        gate = next((candidate for candidate in recipe.policy_gates if candidate.id == gate_id), None)
        payload.update(
            {
                "recipeId": recipe.id,
                "policyGate": gate_id,
                "operatorCheckpoint": checkpoint_id,
            }
        )
        if gate:
            payload.update(
                {
                    "policyGateLabel": gate.label,
                    "policyGateRequiredBefore": gate.required_before,
                    "policyGateEvidence": list(gate.evidence),
                }
            )
        return payload

    def _to_policy_gate_view(self, gate) -> WorkItemPolicyGateView:
        return WorkItemPolicyGateView(
            id=gate.id,
            label=gate.label,
            requiredBefore=gate.required_before,
            summary=gate.summary,
            evidence=list(gate.evidence),
        )

    def _to_remote_automation_policy_view(self, recipe: ExecutionRecipe) -> WorkItemRemoteAutomationPolicyView:
        return self._remote_delivery_policy_view(recipe)

    def _to_execution_recipe_view(self, recipe: ExecutionRecipe) -> WorkItemExecutionRecipeView:
        return WorkItemExecutionRecipeView(
            id=recipe.id,
            label=recipe.label,
            summary=recipe.summary,
            branchPrefix=recipe.branch_prefix,
            allowedPaths=list(recipe.allowed_paths),
            implementationCommands=[command.display for command in recipe.implementation_commands],
            verificationCommands=[command.display for command in recipe.verification_commands],
            policyGates=[self._to_policy_gate_view(gate) for gate in recipe.policy_gates],
            operatorCheckpoints=list(recipe.operator_checkpoints),
            autonomyNotes=list(recipe.autonomy_notes),
            remoteAutomationPolicy=self._to_remote_automation_policy_view(recipe),
        )

    def _to_delivery_readiness_view(self, item: WorkItem, recipe: ExecutionRecipe | None) -> WorkItemDeliveryReadinessView | None:
        if not recipe:
            return None
        payload = self._recipe_delivery_gate_payload(item, recipe)
        return WorkItemDeliveryReadinessView(
            pullRequestStatus=payload["pullRequestStatus"],
            pullRequestUrl=payload["pullRequestUrl"],
            ciStatus=payload["ciStatus"],
            mergeStatus=payload["mergeStatus"],
            deliveryWaived=payload["deliveryWaived"],
            deliveryWaiverReason=payload["deliveryWaiverReason"],
            remoteOperationsPerformed=payload["remoteOperationsPerformed"],
            remoteOperationsPolicy=payload["remoteOperationsPolicy"],
            readyForApproval=payload["readyForApproval"],
        )

    def _origin_for_item(self, item: WorkItem) -> str:
        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        generated_by = metadata.get("generatedBy")
        if isinstance(generated_by, str) and generated_by.strip().lower() == "supervisor":
            return "supervisor"

        normalized_source = item.source.strip().lower()
        if normalized_source.startswith("supervisor"):
            return "supervisor"

        return "operator"

    def _self_detected_issue_category(self, item: WorkItem) -> str | None:
        if self._origin_for_item(item) != "supervisor":
            return None

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        issue_category = metadata.get("issueCategory") or metadata.get("issueType")
        if isinstance(issue_category, str) and issue_category.strip():
            return issue_category.strip()

        issue_flag = metadata.get("selfDetectedIssue")
        if issue_flag is True:
            return "general"
        if isinstance(issue_flag, str) and issue_flag.strip().lower() == "true":
            return "general"

        return None

    def to_candidate_work_view(self, candidate: CandidateWork) -> CandidateWorkView:
        return CandidateWorkView(
            id=candidate.id,
            title=candidate.title,
            requestedOutcome=candidate.requested_outcome,
            source=candidate.source,
            sourceArtifactPath=candidate.source_artifact_path,
            sourceArtifactType=candidate.source_artifact_type,
            riskLevel=candidate.risk_level,
            priority=candidate.priority,
            sortOrder=candidate.sort_order,
            status=candidate.status,
            createdAt=self._normalize_timestamp(candidate.created_at),
            updatedAt=self._normalize_timestamp(candidate.updated_at),
            approvedAt=self._normalize_timestamp(candidate.approved_at) if candidate.approved_at else None,
            promotedWorkItemId=candidate.promoted_work_item_id,
            importMetadata=candidate.import_metadata_json if isinstance(candidate.import_metadata_json, dict) else {},
        )

    def to_work_item_view(self, item: WorkItem) -> WorkItemView:
        age_minutes = self._age_minutes(item)
        needs_attention, attention_reason = self._derive_attention(item)
        origin = self._origin_for_item(item)
        self_detected_issue_category = self._self_detected_issue_category(item)
        recipe = self._execution_recipe_for_item(item)
        return WorkItemView(
            id=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            source=item.source,
            origin=origin,
            details=item.details,
            riskLevel=item.risk_level,
            metadata=item.metadata_json,
            state=item.state,
            lane=item.lane,
            assigneeId=item.assignee_id,
            assigneeLabel=item.assignee_label,
            ageMinutes=age_minutes,
            needsAttention=needs_attention,
            attentionReason=attention_reason,
            escalatedAt=item.escalated_at,
            escalationReason=item.escalation_reason,
            escalatedByLabel=item.escalated_by_label,
            statusSummary=item.status_summary,
            blockedReason=item.blocked_reason,
            nextStep=item.next_step,
            selfDetectedIssue=self_detected_issue_category is not None,
            selfDetectedIssueCategory=self_detected_issue_category,
            executionRecipe=self._to_execution_recipe_view(recipe) if recipe else None,
            deliveryReadiness=self._to_delivery_readiness_view(item, recipe),
            createdAt=self._normalize_timestamp(item.created_at),
            updatedAt=self._normalize_timestamp(item.updated_at),
            lastEventAt=self._normalize_timestamp(item.last_event_at),
            requiresAudit=item.requires_audit,
            auditMode=item.audit_mode,
        )

    def to_audit_view(self, audit: AuditEvent) -> AuditEventView:
        return AuditEventView(
            id=audit.id,
            workItemId=audit.work_item_id,
            reason=audit.reason,
            mode=audit.mode,
            outcome=audit.outcome,
            createdAt=self._normalize_timestamp(audit.created_at),
        )

    def _to_execution_attempt_view(self, attempt: ExecutionAttempt) -> ExecutionAttemptView:
        return ExecutionAttemptView(
            attemptId=attempt.id,
            workItemId=attempt.work_item_id,
            routeDecisionId=attempt.route_decision_id,
            workerId=attempt.worker_id,
            lane=attempt.lane,
            authorityMode=attempt.authority_mode,
            status=ExecutionAttemptStatus(attempt.status),
            requestedById=attempt.requested_by_id,
            requestedByLabel=attempt.requested_by_label,
            createdAt=self._normalize_timestamp(attempt.created_at),
            updatedAt=self._normalize_timestamp(attempt.updated_at),
            startedAt=self._normalize_timestamp(attempt.started_at) if attempt.started_at else None,
            completedAt=self._normalize_timestamp(attempt.completed_at) if attempt.completed_at else None,
            heartbeatAt=self._normalize_timestamp(attempt.heartbeat_at) if attempt.heartbeat_at else None,
            timeoutAt=self._normalize_timestamp(attempt.timeout_at) if attempt.timeout_at else None,
            cancelRequestedAt=self._normalize_timestamp(attempt.cancel_requested_at) if attempt.cancel_requested_at else None,
            cancelReason=attempt.cancel_reason,
            rejectionReason=attempt.rejection_reason,
            failureReason=attempt.failure_reason,
            workspaceIsolationPlan=attempt.workspace_isolation_plan_json or self._legacy_workspace_isolation_plan(attempt),
            artifactRefs=list(attempt.artifact_refs_json or []),
            eventRefs=list(attempt.event_refs_json or []),
        )

    def _legacy_workspace_isolation_plan(self, attempt: ExecutionAttempt) -> dict:
        return {
            "planId": f"workspace-plan-{attempt.id}",
            "sourceSnapshotStrategy": "legacy_attempt_metadata_only",
            "branchStrategy": "none_non_executing_attempt",
            "readRoots": ["."],
            "writeRoots": [],
            "artifactRoot": f"_bmad-output/execution-attempts/{attempt.id}",
            "forbiddenPaths": [".env", ".git", ".ssh", "node_modules", "services/supervisor/.venv"],
            "cleanupRule": "no_workspace_created_no_cleanup_required",
            "rollbackRule": "source_mutation_disabled_no_rollback_required",
            "diffCaptureRule": "capture_diff_metadata_only_after_future_isolated_execution_is_enabled",
            "writesAllowed": False,
            "sourceMutationAllowed": False,
            "commandsAllowed": False,
            "networkAllowed": False,
            "credentialAccessAllowed": False,
            "materializationMode": "metadata_only_no_workspace_created",
            "environmentPolicy": "deny_inheritance_allowlist_only",
            "environmentAllowlist": ["PATH"],
            "sessionBoundary": "forbid_shell_profiles_ssh_browser_tokens_subscription_sessions_and_credentials",
            "outputPolicy": "summary_only_no_raw_stdout_or_stderr_retention",
        }

    def to_event_view(self, event: WorkflowEvent) -> WorkflowEventView:
        return WorkflowEventView(
            id=event.id,
            workItemId=event.work_item_id,
            eventType=event.event_type,
            actorType=event.actor_type,
            actorId=event.actor_id,
            actorLabel=event.actor_label,
            correlationId=event.correlation_id,
            summary=event.summary,
            payload=event.payload,
            createdAt=self._normalize_timestamp(event.created_at),
        )

    def to_operator_view(self, view: OperatorView) -> OperatorViewResponse:
        return OperatorViewResponse(
            id=view.id,
            name=view.name,
            scope=WorkItemFilterScope(view.scope),
            filters=WorkItemFilterView(**view.filters_json),
            isDefault=view.is_default,
            createdAt=view.created_at,
            updatedAt=view.updated_at,
        )
