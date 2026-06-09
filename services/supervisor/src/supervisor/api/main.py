import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import (
    ApiEnvelope,
    ApiErrorEnvelope,
    ApiErrorShape,
    OperatorViewCreate,
    OperatorViewDefaultRequest,
    WorkItemActionRequest,
    WorkItemAssignmentRequest,
    WorkItemBranchPreparationRequest,
    WorkItemCreate,
    WorkItemDeliveryReadinessRequest,
    WorkItemExecutionAttemptCreateRequest,
    WorkItemExecutionAttemptTransitionRequest,
    WorkItemEscalationRequest,
    WorkItemLocalEvidenceExplanationRequest,
    WorkItemManagedActionRequest,
    WorkItemPremiumApprovalRequest,
    WorkItemRoutingPreviewRequest,
    WorkItemRoutingOverrideRequest,
    WorkItemSubscriptionAgentLaunchStubRequest,
    WorkItemSubscriptionHandoffRequest,
)
from supervisor.application.service import SupervisorService
from supervisor.config.settings import get_settings
from supervisor.domain.types import ErrorCategory, RunMode, WorkItemFilterScope
from supervisor.infrastructure.db.database import get_session, init_db
from supervisor.infrastructure.db.models import WorkItem
from supervisor.infrastructure.streaming.bus import EventBus
from supervisor.worker.poller import Poller

settings = get_settings()
bus = EventBus()
service = SupervisorService(settings, bus)
poller = Poller(service, settings.poll_interval_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    if settings.enable_background:
        await poller.start()
    try:
        yield
    finally:
        await poller.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_pattern.pattern,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def error_response(message: str, code: str, correlation_id: str = "n/a") -> ApiErrorEnvelope:
    return ApiErrorEnvelope(
        error=ApiErrorShape(
            code=code,
            message=message,
            category=ErrorCategory.TERMINAL,
            retryable=False,
            correlationId=correlation_id,
        )
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/work-items", response_model=ApiEnvelope)
async def create_work_item(payload: WorkItemCreate, session: AsyncSession = Depends(get_session)):
    item = await service.create_work_item(session, payload)
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.get("/work-items", response_model=ApiEnvelope)
async def list_work_items(session: AsyncSession = Depends(get_session)):
    items = await service.list_work_items(session)
    return ApiEnvelope(data=[service.to_work_item_view(item) for item in items])


@app.get("/execution-recipes", response_model=ApiEnvelope)
async def list_execution_recipes():
    return ApiEnvelope(data=service.list_execution_recipes())


@app.get("/routing/lane-profiles", response_model=ApiEnvelope)
async def list_routing_lane_profiles(session: AsyncSession = Depends(get_session)):
    return ApiEnvelope(data=await service.list_routing_lane_profiles(session))



@app.get("/routing/worker-registry", response_model=ApiEnvelope)
async def list_worker_registry():
    return ApiEnvelope(data=service.list_worker_registry())

@app.get("/work-items/{work_item_id}", response_model=ApiEnvelope)
async def get_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    items = await service.list_work_items(session)
    for item in items:
        if item.id == work_item_id:
            return ApiEnvelope(data=service.to_work_item_view(item))
    raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())


@app.get("/work-items/{work_item_id}/events", response_model=ApiEnvelope)
async def get_work_item_events(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    events = await service.list_work_item_events(session, work_item_id)
    return ApiEnvelope(data=[service.to_event_view(event) for event in events])


@app.get("/work-items/{work_item_id}/execution-attempts", response_model=ApiEnvelope)
async def get_work_item_execution_attempts(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    attempts = await service.list_execution_attempts(session, work_item_id)
    return ApiEnvelope(data=attempts)


@app.get("/work-items/{work_item_id}/runtime-evidence-export", response_model=ApiEnvelope)
async def get_work_item_runtime_evidence_export(work_item_id: str, session: AsyncSession = Depends(get_session)):
    export = await service.get_runtime_evidence_export(session, work_item_id)
    if not export:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=export)


@app.post("/work-items/{work_item_id}/execution-attempts", response_model=ApiEnvelope)
async def create_work_item_execution_attempt(
    work_item_id: str,
    payload: WorkItemExecutionAttemptCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        attempt = await service.create_execution_attempt(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_execution_attempt").model_dump()) from exc
    if not attempt:
        raise HTTPException(status_code=404, detail=error_response("Execution attempt not found.", "execution_attempt_not_found").model_dump())
    return ApiEnvelope(data=attempt)


@app.post("/work-items/{work_item_id}/execution-attempts/{attempt_id}/lifecycle", response_model=ApiEnvelope)
async def transition_work_item_execution_attempt(
    work_item_id: str,
    attempt_id: str,
    payload: WorkItemExecutionAttemptTransitionRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        attempt = await service.transition_execution_attempt(session, work_item_id, attempt_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_execution_attempt_transition").model_dump()) from exc
    if not attempt:
        raise HTTPException(status_code=404, detail=error_response("Execution attempt not found.", "execution_attempt_not_found").model_dump())
    return ApiEnvelope(data=attempt)


@app.get("/work-items/{work_item_id}/recipe-gate-audit", response_model=ApiEnvelope)
async def get_work_item_recipe_gate_audit(work_item_id: str, session: AsyncSession = Depends(get_session)):
    audit = await service.get_recipe_gate_audit(session, work_item_id)
    if not audit:
        raise HTTPException(status_code=404, detail=error_response("Recipe gate audit not found.", "recipe_gate_audit_not_found").model_dump())
    return ApiEnvelope(data=audit)


@app.get("/work-items/{work_item_id}/routing-preview", response_model=ApiEnvelope)
async def get_work_item_routing_preview(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    preview = await service.get_routing_preview(session, work_item_id)
    if not preview:
        raise HTTPException(status_code=404, detail=error_response("Routing preview not found.", "routing_preview_not_found").model_dump())
    return ApiEnvelope(data=preview)


@app.post("/work-items/{work_item_id}/routing-preview", response_model=ApiEnvelope)
async def create_work_item_routing_preview(
    work_item_id: str,
    payload: WorkItemRoutingPreviewRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        preview = await service.get_routing_preview(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_routing_preview").model_dump()) from exc
    if not preview:
        raise HTTPException(status_code=404, detail=error_response("Routing preview not found.", "routing_preview_not_found").model_dump())
    return ApiEnvelope(data=preview)


@app.post("/work-items/{work_item_id}/routing-override", response_model=ApiEnvelope)
async def record_work_item_routing_override(
    work_item_id: str,
    payload: WorkItemRoutingOverrideRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        override = await service.record_routing_override(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_routing_override").model_dump()) from exc
    if not override:
        raise HTTPException(status_code=404, detail=error_response("Routing override not found.", "routing_override_not_found").model_dump())
    return ApiEnvelope(data=override)


@app.get("/work-items/{work_item_id}/local-evidence-packet", response_model=ApiEnvelope)
async def get_work_item_local_evidence_packet(work_item_id: str, session: AsyncSession = Depends(get_session)):
    packet = await service.get_local_evidence_packet(session, work_item_id)
    if not packet:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=packet)


@app.post("/work-items/{work_item_id}/local-readonly-worker-preview", response_model=ApiEnvelope)
async def preview_work_item_local_readonly_worker(work_item_id: str, session: AsyncSession = Depends(get_session)):
    preview = await service.preview_local_readonly_worker(session, work_item_id)
    if not preview:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=preview)

@app.post("/work-items/{work_item_id}/local-evidence-explanation", response_model=ApiEnvelope)
async def create_work_item_local_evidence_explanation(
    work_item_id: str,
    payload: WorkItemLocalEvidenceExplanationRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        explanation = await service.get_local_evidence_explanation(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_local_evidence_explanation").model_dump()) from exc
    if not explanation:
        raise HTTPException(status_code=404, detail=error_response("Local evidence explanation not found.", "local_evidence_explanation_not_found").model_dump())
    return ApiEnvelope(data=explanation)

@app.post("/work-items/{work_item_id}/subscription-handoff-package", response_model=ApiEnvelope)
async def create_work_item_subscription_handoff_package(
    work_item_id: str,
    payload: WorkItemSubscriptionHandoffRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        package = await service.get_subscription_handoff_package(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_subscription_handoff_package").model_dump()) from exc
    if not package:
        raise HTTPException(status_code=404, detail=error_response("Subscription handoff package not found.", "subscription_handoff_package_not_found").model_dump())
    return ApiEnvelope(data=package)

@app.post("/work-items/{work_item_id}/premium-approval-request", response_model=ApiEnvelope)
async def create_work_item_premium_approval_request(
    work_item_id: str,
    payload: WorkItemPremiumApprovalRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        request = await service.get_premium_approval_request(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_premium_approval_request").model_dump()) from exc
    if not request:
        raise HTTPException(status_code=404, detail=error_response("Premium approval request not found.", "premium_approval_request_not_found").model_dump())
    return ApiEnvelope(data=request)

@app.post("/work-items/{work_item_id}/subscription-agent-launch-stub", response_model=ApiEnvelope)
async def create_work_item_subscription_agent_launch_stub(
    work_item_id: str,
    payload: WorkItemSubscriptionAgentLaunchStubRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        stub = await service.get_subscription_agent_launch_stub(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_subscription_agent_launch_stub").model_dump()) from exc
    if not stub:
        raise HTTPException(status_code=404, detail=error_response("Subscription agent launch stub not found.", "subscription_agent_launch_stub_not_found").model_dump())
    return ApiEnvelope(data=stub)

@app.post("/work-items/{work_item_id}/prepare-branch", response_model=ApiEnvelope)
async def prepare_work_item_branch(
    work_item_id: str,
    payload: WorkItemBranchPreparationRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        item = await service.prepare_recipe_branch(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "invalid_branch_preparation").model_dump(),
        ) from exc
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/retry", response_model=ApiEnvelope)
async def retry_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    item = await service.retry_item(session, work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/actions", response_model=ApiEnvelope)
async def apply_work_item_action(
    work_item_id: str,
    payload: WorkItemActionRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        item = await service.apply_action(
            session,
            work_item_id,
            payload.action,
            payload.note,
            payload.actorId,
            payload.actorLabel,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "invalid_workflow_action").model_dump(),
        ) from exc
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/managed-next-action", response_model=ApiEnvelope)
async def execute_managed_next_action(
    work_item_id: str,
    payload: WorkItemManagedActionRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        item = await service.execute_managed_next_action(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "invalid_managed_next_action").model_dump(),
        ) from exc
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/delivery-readiness", response_model=ApiEnvelope)
async def record_delivery_readiness(
    work_item_id: str,
    payload: WorkItemDeliveryReadinessRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        item = await service.record_delivery_readiness(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "invalid_delivery_readiness").model_dump(),
        ) from exc
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/assignment", response_model=ApiEnvelope)
async def assign_work_item(
    work_item_id: str,
    payload: WorkItemAssignmentRequest,
    session: AsyncSession = Depends(get_session),
):
    item = await service.assign_work_item(
        session,
        work_item_id,
        payload.assigneeId,
        payload.assigneeLabel,
        payload.actorId,
        payload.actorLabel,
    )
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/escalation", response_model=ApiEnvelope)
async def escalate_work_item(
    work_item_id: str,
    payload: WorkItemEscalationRequest,
    session: AsyncSession = Depends(get_session),
):
    item = await service.set_escalation(
        session,
        work_item_id,
        payload.reason,
        payload.clear,
        payload.actorId,
        payload.actorLabel,
    )
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.get("/supervisor/status", response_model=ApiEnvelope)
async def get_status(session: AsyncSession = Depends(get_session)):
    return ApiEnvelope(data=await service.get_status(session))


@app.get("/supervisor/execution-configuration-checks", response_model=ApiEnvelope)
async def get_execution_configuration_checks():
    return ApiEnvelope(data=service.get_execution_configuration_checks())


@app.get("/supervisor/execution-readiness-report", response_model=ApiEnvelope)
async def get_execution_readiness_report(session: AsyncSession = Depends(get_session)):
    return ApiEnvelope(data=await service.get_execution_readiness_report(session))


@app.get("/supervisor/documentation-authority-report", response_model=ApiEnvelope)
async def get_documentation_authority_report():
    return ApiEnvelope(data=service.get_documentation_authority_report())


@app.get("/supervisor/verification-readiness-report", response_model=ApiEnvelope)
async def get_verification_readiness_report():
    return ApiEnvelope(data=service.get_verification_readiness_report())


@app.get("/supervisor/dashboard-e2e-report", response_model=ApiEnvelope)
async def get_dashboard_e2e_report():
    return ApiEnvelope(data=service.get_dashboard_e2e_report())


@app.get("/supervisor/report-catalog", response_model=ApiEnvelope)
async def get_supervisor_report_catalog():
    return ApiEnvelope(data=service.get_supervisor_report_catalog())


@app.get("/supervisor/maintenance-readiness-report", response_model=ApiEnvelope)
async def get_maintenance_readiness_report():
    return ApiEnvelope(data=service.get_maintenance_readiness_report())


@app.get("/supervisor/safe-development-backlog", response_model=ApiEnvelope)
async def get_safe_development_backlog_report():
    return ApiEnvelope(data=service.get_safe_development_backlog_report())


@app.get("/supervisor/managed-recipe-policy-report", response_model=ApiEnvelope)
async def get_managed_recipe_policy_report():
    return ApiEnvelope(data=service.get_managed_recipe_policy_report())


@app.get("/supervisor/github-workflow-policy-report", response_model=ApiEnvelope)
async def get_github_workflow_policy_report():
    return ApiEnvelope(data=service.get_github_workflow_policy_report())


@app.get("/supervisor/delivery-readiness-policy-report", response_model=ApiEnvelope)
async def get_delivery_readiness_policy_report():
    return ApiEnvelope(data=service.get_delivery_readiness_policy_report())


@app.get("/supervisor/disabled-provider-proofs", response_model=ApiEnvelope)
async def list_disabled_provider_proofs():
    return ApiEnvelope(data=service.list_disabled_provider_proofs())


@app.get("/supervisor/execution-state-boundary", response_model=ApiEnvelope)
async def get_execution_state_boundary():
    return ApiEnvelope(data=service.get_execution_state_boundary())


@app.get("/supervisor/threat-boundary", response_model=ApiEnvelope)
async def get_threat_boundary():
    return ApiEnvelope(data=service.get_threat_boundary())


async def _set_mode(mode: RunMode, session: AsyncSession) -> ApiEnvelope:
    control = await service.set_mode(session, mode)
    status = await service.get_status(session)
    return ApiEnvelope(data={"mode": control.mode, "status": status.model_dump()})


@app.post("/supervisor/enable", response_model=ApiEnvelope)
async def enable(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.RUNNING, session)


@app.post("/supervisor/pause", response_model=ApiEnvelope)
async def pause(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.PAUSED, session)


@app.post("/supervisor/drain", response_model=ApiEnvelope)
async def drain(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.DRAINING, session)


@app.post("/supervisor/disable", response_model=ApiEnvelope)
async def disable(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.DISABLED, session)


@app.get("/audit-events", response_model=ApiEnvelope)
async def list_audit_events(session: AsyncSession = Depends(get_session)):
    audits = await service.list_audit_events(session)
    return ApiEnvelope(data=[service.to_audit_view(audit) for audit in audits])


@app.get("/operator-views", response_model=ApiEnvelope)
async def list_operator_views(scope: WorkItemFilterScope | None = None, session: AsyncSession = Depends(get_session)):
    views = await service.list_operator_views(session, scope)
    return ApiEnvelope(data=[service.to_operator_view(view) for view in views])


@app.post("/operator-views", response_model=ApiEnvelope)
async def save_operator_view(payload: OperatorViewCreate, session: AsyncSession = Depends(get_session)):
    try:
        view = await service.save_operator_view(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_operator_view").model_dump()) from exc
    return ApiEnvelope(data=service.to_operator_view(view))


@app.post("/operator-views/{view_id}/default", response_model=ApiEnvelope)
async def set_operator_view_default(
    view_id: str,
    payload: OperatorViewDefaultRequest,
    session: AsyncSession = Depends(get_session),
):
    view = await service.set_operator_view_default(session, view_id, payload.isDefault)
    if not view:
        raise HTTPException(status_code=404, detail=error_response("Operator view not found.", "operator_view_not_found").model_dump())
    return ApiEnvelope(data=service.to_operator_view(view))


@app.delete("/operator-views/{view_id}", response_model=ApiEnvelope)
async def delete_operator_view(view_id: str, session: AsyncSession = Depends(get_session)):
    deleted = await service.delete_operator_view(session, view_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=error_response("Operator view not found.", "operator_view_not_found").model_dump())
    return ApiEnvelope(data={"deleted": True, "id": view_id})


@app.get("/events")
async def stream_events():
    async def event_stream():
        async with bus.subscribe() as queue:
            while True:
                message = await queue.get()
                yield f"data: {message}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def main() -> None:
    uvicorn.run("supervisor.api.main:app", host="0.0.0.0", port=8000, reload=True)


async def process_once_for_tests() -> None:
    from supervisor.infrastructure.db.database import SessionLocal

    async with SessionLocal() as session:
        await service.process_once(session)
