import asyncio
import json
import os
import shutil
import subprocess
import uuid
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import (
    AuditEventView,
    ExecutionConfigurationCheckView,
    ExecutionConfigurationChecksView,
    ExecutionAttemptView,
    LocalEvidenceExplanationView,
    LocalEvidenceItemView,
    LocalEvidencePacketItemView,
    LocalEvidencePacketView,
    LocalReadonlyWorkerPreviewView,
    OperatorViewCreate,
    OperatorViewResponse,
    PremiumApprovalEvidenceView,
    PremiumApprovalRequestView,
    RoutingDecisionView,
    RoutingLaneEvidenceProfileView,
    RoutingOverrideView,
    RoutingPreviewView,
    RoutingProfileView,
    SubscriptionAgentLaunchStubView,
    SubscriptionHandoffEvidenceView,
    SubscriptionHandoffPackageView,
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
    WorkItemSubscriptionAgentLaunchStubRequest,
    WorkItemSubscriptionHandoffRequest,
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
from supervisor.domain.local_readonly_worker import MockLocalReadonlyWorkerAdapter
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
from supervisor.domain.types import AuditMode, BmadLane, ExecutionAttemptStatus, RunMode, WorkItemFilterScope, WorkflowAction, WorkflowState
from supervisor.domain.utility_worker import UtilityWorkerAdapter, UtilityWorkerResult, UtilityWorkerStatus, UtilityWorkerTask
from supervisor.domain.worker_registry import StaticWorkerRegistry, WorkerRegistryEntry
from supervisor.infrastructure.db.models import AuditEvent, ExecutionAttempt, OperatorView, QueueLease, SupervisorControl, WorkItem, WorkflowEvent
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

    def __init__(self, settings: Settings, bus: EventBus) -> None:
        self.settings = settings
        self.bus = bus
        self._loop_lock = asyncio.Lock()
        self.utility_worker = UtilityWorkerAdapter()
        self.worker_registry = StaticWorkerRegistry()
        self.local_readonly_worker = MockLocalReadonlyWorkerAdapter()

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

    def list_execution_recipes(self) -> list[WorkItemExecutionRecipeView]:
        return [self._to_execution_recipe_view(recipe) for recipe in EXECUTION_RECIPES.values()]

    async def list_audit_events(self, session: AsyncSession) -> list[AuditEvent]:
        result = await session.execute(select(AuditEvent).order_by(AuditEvent.created_at.desc()))
        return list(result.scalars())


    def list_worker_registry(self) -> list[WorkerRegistryEntryView]:
        return [self._to_worker_registry_entry_view(worker) for worker in self.worker_registry.list_workers()]

    def get_execution_configuration_checks(self) -> ExecutionConfigurationChecksView:
        workers = self.worker_registry.list_workers()

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
                ],
                process_launch_allowed=self.settings.allow_subscription_agent_launch,
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
                ],
                provider_calls_allowed=self.settings.allow_local_provider_calls,
                model_calls_allowed=self.settings.allow_local_provider_calls,
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

    def _execution_configuration_check(
        self,
        *,
        check_id: str,
        label: str,
        enabled: bool,
        disabled_reason: str,
        affected_workers: list[str],
        evidence: list[str],
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
            artifact_refs_json=[],
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
            actor_id=payload.actorId,
            actor_label=payload.actorLabel,
        )
        attempt.event_refs_json = [{"eventId": event.id, "eventType": event.event_type}]
        await session.commit()
        await session.refresh(attempt)
        await session.refresh(item)
        return self._to_execution_attempt_view(attempt)

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
            self._validate_execution_attempt_approval_binding(attempt, payload)

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
        }

    async def _record_execution_attempt_event(
        self,
        session: AsyncSession,
        item: WorkItem,
        attempt: ExecutionAttempt,
        preview: RoutingPreviewView,
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
                "rejectionReason": attempt.rejection_reason,
                "workspaceIsolationPlan": dict(attempt.workspace_isolation_plan_json or {}),
                "executionAllowed": False,
                "processLaunchAllowed": False,
                "providerCallsAllowed": False,
                "sourceMutationAllowed": False,
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
                    ]
                    if attempt.status == ExecutionAttemptStatus.APPROVED.value
                    else []
                ),
                "executionAllowed": False,
                "processLaunchAllowed": False,
                "providerCallsAllowed": False,
                "sourceMutationAllowed": False,
            },
            actor_type="operator" if actor_id or actor_label else "supervisor",
            actor_id=actor_id,
            actor_label=actor_label,
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
            boundaries=self._local_evidence_boundaries(item),
            allowedPaths=list(recipe.allowed_paths) if recipe else [],
            validationCommands=[command.display for command in recipe.verification_commands] if recipe else [],
            redactionNotes=[
                "Use workflow event summaries and approved recipe metadata only.",
                "Do not include secrets, raw prompts, credentials, or unrelated local files.",
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
        explanation = LocalEvidenceExplanationView(
            explanationId=f"local-evidence-{preview.decision.decisionId}",
            workItemId=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            taskKind=preview.profile.taskKind,
            stepId=preview.profile.stepId,
            createdAt=datetime.now(timezone.utc),
            route=preview.decision,
            summary=self._local_evidence_summary(item, preview, events),
            evidence=[
                LocalEvidenceItemView(
                    eventType=event.event_type,
                    summary=event.summary,
                    createdAt=self._normalize_timestamp(event.created_at),
                )
                for event in events[:8]
            ],
            boundaries=self._local_evidence_boundaries(item),
            nextStepSuggestions=self._local_evidence_next_steps(preview),
            writesAllowed=False,
            commandsAllowed=False,
        )
        if payload.recordEvent:
            await self._record_local_evidence_explanation_event(session, item, explanation)
            await session.commit()
            await session.refresh(item)
        return explanation

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
            pnpm_cmd = shutil.which("pnpm.cmd")
            if pnpm_cmd:
                return [pnpm_cmd, *args[1:]]

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
