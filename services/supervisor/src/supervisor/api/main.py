import asyncio
import os
import hmac
import re
from datetime import UTC, datetime
from contextlib import asynccontextmanager
from ipaddress import ip_address

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import (
    ApiEnvelope,
    AuditEventApiEnvelope,
    ApiErrorEnvelope,
    ApiErrorShape,
    AuthoritativeWorkPacketCreateRequest,
    AuthoritativeWorkPacketApiEnvelope,
    AuthoritativeWorkPacketListApiEnvelope,
    AuthoritativeWorkPacketTransitionRequest,
    CandidateWorkBmadImportRequest,
    CandidateWorkCreate,
    CandidateWorkApiEnvelope,
    CandidateWorkPromotionApiEnvelope,
    CandidateWorkListApiEnvelope,
    ExecutionConfigurationChecksApiEnvelope,
    ExecutionReadinessReportApiEnvelope,
    DocumentationAuthorityReportApiEnvelope,
    LegacyPlanningArtifactInventoryApiEnvelope,
    VerificationReadinessReportApiEnvelope,
    AuthorityReadinessMatrixReportApiEnvelope,
    DashboardE2EReportApiEnvelope,
    DevelopmentRunwayReportApiEnvelope,
    RuntimeEvidenceReviewReportApiEnvelope,
    ManagedRecipePolicyReportApiEnvelope,
    GitHubWorkflowPolicyReportApiEnvelope,
    GitHygieneReportApiEnvelope,
    CodexReadinessReportApiEnvelope,
    CodexImplementationApprovalReportApiEnvelope,
    ClaudeReviewReadinessReportApiEnvelope,
    ClaudeReviewApprovalReportApiEnvelope,
    ExecutionStateBoundaryApiEnvelope,
    ReviewResourcePolicyReportApiEnvelope,
    MvpProofTrialReportApiEnvelope,
    LocalDogfoodAuthorizationApiEnvelope,
    LocalDogfoodAttestationDecisionApiEnvelope,
    LocalDogfoodAttestationReadbackApiEnvelope,
    LocalDogfoodAttestationRevocationApiEnvelope,
    DeliveryReadinessPolicyReportApiEnvelope,
    GitHubDeliveryAuthorityReportApiEnvelope,
    TrustedDeliveryEligibilityReportApiEnvelope,
    CleanupPlanApiEnvelope,
    LocalCleanupReadinessReportApiEnvelope,
    RemoteCleanupSyncReadinessReportApiEnvelope,
    TrustedAutonomyReadinessReportApiEnvelope,
    DisabledProviderProofListApiEnvelope,
    ThreatBoundaryApiEnvelope,
    LowRiskDeliveryPlanReportApiEnvelope,
    SupervisorReportCatalogApiEnvelope,
    MaintenanceReadinessReportApiEnvelope,
    MaintenanceActionPlanReportApiEnvelope,
    SafeDevelopmentBacklogReportApiEnvelope,
    RunnerAssignmentStatusReportApiEnvelope,
    CandidateWorkObsidianMetadataImportRequest,
    CandidateWorkUpdate,
    OperationalActionRequest,
    OperationalActionRequestV1,
    OperationalActionApprovalRequest,
    OperationalActionApprovalRequestV1,
    OperatorViewCreate,
    OperatorViewDefaultRequest,
    DashboardCanonicalOperationalProjectionApiEnvelope,
    PipelineEpic25EvidenceChainIngestRequest,
    RoutingPreviewApiEnvelope,
    TaskPacketPreviewApiEnvelope,
    WorkItemActionRequest,
    WorkItemApiEnvelope,
    WorkItemAssignmentRequest,
    WorkItemBranchPreparationRequest,
    WorkItemCreate,
    WorkItemDeliveryReadinessRequest,
    DeliveryExecutionEvidencePayload,
    DeliveryExecutionEvidenceApiEnvelope,
    ExecutionAttemptApiEnvelope,
    ExecutionRecipeListApiEnvelope,
    RoutingLaneProfileListApiEnvelope,
    WorkerRegistryListApiEnvelope,
    LlmWikiArtifactApiEnvelope,
    LocalEvidencePacketApiEnvelope,
    LocalWorktreePlanApiEnvelope,
    LlmWikiDisposableRebuildWriteRequest,
    ManagerTerminalEventApiEnvelope,
    ManagerTerminalEventRequest,
    HermesLedgerIngestRequest,
    HermesReviewHandoffRequest,
    HermesRoleCapabilityProvisionRequestV1,
    HermesRoleCapabilityRevocationRequestV1,
    HermesLaneRunProjectionApiEnvelope,
    HermesOutcomeProjectionApiEnvelope,
    ManagerLaneClarityHandoffApiEnvelope,
    ManagerLaneClarityHandoffRequest,
    ManagerCoordinationHealthHandoffApiEnvelope,
    ManagerCoordinationHealthHandoffRequest,
    SupervisorTerminalEventProjectionApiEnvelope,
    OperatorViewListApiEnvelope,
    MemoryProposalAiDraftWriteRequest,
    MemoryProposalWriteRecoveryRequest,
    WorkItemMemoryReviewApiEnvelope,
    MemoryInboxShellApiEnvelope,
    MemoryInboxLifecycleCommandApiEnvelope,
    MemoryInboxLifecycleCommandRequest,
    MemoryInboxLifecycleCommandResultV1,
    MemoryInboxProjectionApiEnvelope,
    MemoryInboxProjectionRowV1,
    MemoryInboxProjectionV1,
    MemoryInboxProposalReaderApiEnvelope,
    MemoryInboxProposalReaderV1,
    MemoryInboxReviewDecisionApiEnvelope,
    MemoryInboxReviewDecisionRequest,
    MemoryInboxReviewDecisionResultV1,
    MemoryInboxApprovalApiEnvelope,
    MemoryInboxApprovalRequest,
    MemoryInboxApprovalResultV1,
    MemoryInboxSourceDeletionApiEnvelope,
    MemoryInboxSourceDeletionRequest,
    MemoryInboxSourceDeletionResultV1,
    MemoryInboxRetentionExtensionApiEnvelope,
    MemoryInboxRetentionExtensionRequest,
    MemoryInboxRetentionExtensionResultV1,
    MemoryInboxDeletionReceiptApiEnvelope,
    MemoryInboxDeletionReceiptV1,
    MemoryInboxTextCaptureApiEnvelope,
    MemoryInboxTextCaptureRequest,
    MemoryInboxTextCaptureResultV1,
    MemoryInboxCostPolicyUpdateRequest,
    MemoryInboxProcessingDisclosureRequest,
    MemoryInboxProcessingDisclosureApiEnvelope,
    MemoryInboxCostPolicyApiEnvelope,
    MemoryInboxDispatchClaimApiEnvelope,
    MemoryInboxCompletionUnknownResolutionApiEnvelope,
    MemoryInboxCompletionUnknownResolutionRequest,
    MemoryProposalCreateRequest,
    MemoryProposalUpdateRequest,
    WorkItemExecutionAttemptCreateRequest,
    WorkItemExecutionAttemptTransitionRequest,
    WorkItemLocalProofLeaseRequest,
    WorkItemLocalProofRequest,
    WorkItemEscalationRequest,
    WorkItemLocalEvidenceExplanationRequest,
    WorkItemListApiEnvelope,
    WorkItemManagedActionRequest,
    WorkItemRecipeGateAuditApiEnvelope,
    WorkItemPremiumApprovalRequest,
    WorkItemRoutingPreviewRequest,
    WorkItemRoutingOverrideRequest,
    WorkItemSupervisedCodexLaunchRequest,
    WorkItemSubscriptionAgentLaunchRequest,
    WorkItemSubscriptionAgentLaunchStubRequest,
    WorkItemSubscriptionHandoffRequest,
    WorkItemVerificationEvidenceRequest,
    RuntimeEvidenceExportApiEnvelope,
    RunStatusApiEnvelope,
    WorkflowEventApiEnvelope,
)
from supervisor.application.manager_terminal_events import (
    get_manager_terminal_event,
    get_latest_manager_terminal_event,
    persist_manager_terminal_event,
)
from supervisor.application.hermes_outcomes import ingest_hermes_ledger, ingest_hermes_review_handoff, provision_hermes_role_capability, read_hermes_lane_run, read_hermes_outcome, revoke_hermes_role_capability
from supervisor.application import hermes_board_bridge
from supervisor.application.manager_lane_clarity_handoffs import (
    get_manager_lane_clarity_handoff,
    persist_manager_lane_clarity_handoff,
)
from supervisor.application.manager_coordination_health_handoffs import (
    get_manager_coordination_health_handoff,
    persist_manager_coordination_health_handoff,
)
from supervisor.application import local_dogfood_attestation
from supervisor.application.operator_auth import (
    GENERIC_LOGIN_FAILURE,
    SESSION_ABSOLUTE_SECONDS,
    SESSION_COOKIE_NAME,
    authenticate_dashboard_account,
    can_dashboard_read,
    consume_login_csrf_challenge,
    create_login_csrf_challenge,
    exact_https_origin,
    load_valid_session,
    digest_secret,
    logout_session,
    record_auth_audit,
    revoke_all_sessions,
)
from supervisor.application.service import MemoryProposalRevisionConflict, SupervisorService
from supervisor.application.memory_inbox_lifecycle import MemoryInboxLifecycleCommand, apply_lifecycle_command
from supervisor.application.memory_inbox_projection import read_memory_inbox_projection, read_review_ready_count
from supervisor.application.memory_inbox_capture import capture_acknowledged_text
from supervisor.application.memory_inbox_upload import receive_quarantined_upload
from supervisor.application.memory_inbox_inspection import require_inspection_activation
from supervisor.application.memory_inbox_inspection_lease import plan_inspection_lease
from supervisor.application.memory_inbox_provider_policy import read_inbox_cost_policy, set_inbox_cost_policy
from supervisor.application.memory_inbox_processing_disclosure import accept_processing_disclosure, present_processing_disclosure
from supervisor.application.memory_inbox_dispatch_claim import claim_processing_dispatch
from supervisor.application.memory_inbox_cost_reservation import resolve_attempt_completion_unknown
from supervisor.application.memory_inbox_proposal_reader import read_authorized_proposal
from supervisor.application.memory_inbox_review_decision import deny_proposal_retaining_source, return_proposal_for_revision
from supervisor.application.memory_inbox_approval import approve_proposal_for_deletion
from supervisor.application.memory_inbox_source_deletion import delete_source_by_operator, retry_source_deletion
from supervisor.application.memory_inbox_deletion_receipt import read_deletion_receipt
from supervisor.application.memory_inbox_retention import extend_source_retention
from supervisor.worker.memory_inbox_deletion_poller import MemoryInboxDeletionPoller
from supervisor.worker.memory_inbox_inspection_poller import MemoryInboxInspectionPoller
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.application.lan_auth_bootstrap import (
    LanAuthConfigurationError,
    TEST_VIEWER_AUTH_LIFECYCLE_LOCK,
    enable_or_rotate_test_viewer,
    ensure_bootstrap_operator,
    read_private_bootstrap_password,
    prepare_private_uds_path,
    revoke_test_viewer,
    test_viewer_status,
    validate_private_uds_path,
)
from supervisor.config.settings import get_settings
from supervisor.domain.bmad_import import BmadImportError
from supervisor.domain.obsidian_metadata_import import ObsidianMetadataImportError
from supervisor.domain.types import ErrorCategory, WorkItemFilterScope
from supervisor.infrastructure.db.database import SessionLocal, get_session, init_db
from supervisor.infrastructure.db.models import DashboardOperator, LocalDogfoodAuthorization, MemoryInboxSource, WorkItem
from supervisor.infrastructure.streaming.bus import EventBus
from supervisor.worker.poller import Poller
from pydantic import BaseModel


class OperatorLoginRequest(BaseModel):
    password: str
    # Only these literal values ever authorize an account. Keeping this as a
    # string allows an invalid selector to receive the same generic failure as
    # an absent/disabled fixed principal rather than a schema oracle.
    account: object = "operator"


class TestViewerLifecycleRequest(BaseModel):
    action: str
    password: str | None = None

settings = get_settings()
startup_gate_ready = False
bus = EventBus()
service = SupervisorService(settings, bus)
poller = Poller(service, settings.poll_interval_seconds)
inspection_poller = MemoryInboxInspectionPoller(settings)
deletion_poller = MemoryInboxDeletionPoller(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global startup_gate_ready
    settings.validate_local_dogfood_attestation_deployment()
    await init_db()
    if settings.enable_local_dogfood_attestation:
        socket_path = settings.supervisor_uds_path if settings.lan_auth_enabled else settings.local_dogfood_attestation_api_socket_path
        if socket_path and os.path.exists(socket_path):
            os.chmod(socket_path, 0o600)
    if settings.lan_auth_enabled:
        if settings.supervisor_transport != "private_uds":
            raise LanAuthConfigurationError("LAN auth requires the private supervisor UDS transport.")
        if not settings.lan_auth_bootstrap_password_file or not settings.supervisor_uds_path:
            raise LanAuthConfigurationError("LAN auth bootstrap or supervisor UDS configuration is missing.")
        validate_private_uds_path(settings.supervisor_uds_path, allow_existing_socket=True)
        bootstrap_password = read_private_bootstrap_password(settings.lan_auth_bootstrap_password_file)
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, bootstrap_password)
            await revoke_all_sessions(session, outcome="runtime_restart")
        startup_gate_ready = True
    if settings.enable_background:
        await poller.start()
        if settings.memory_inbox_inspection_configuration_error() is None:
            await inspection_poller.start()
        if settings.memory_inbox_capture_configuration_error() is None:
            await deletion_poller.start()
    try:
        yield
    finally:
        startup_gate_ready = False
        await poller.stop()
        await inspection_poller.stop()
        await deletion_poller.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_pattern.pattern,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def enforce_private_lan_transport(request: Request, call_next):
    if settings.lan_auth_enabled:
        client_host = request.client.host if request.client else None
        # UDS requests have no TCP client host. Every TCP request, including
        # loopback and reverse-proxy traffic, is rejected at the API edge.
        if client_host is not None:
            return JSONResponse(status_code=503, content={"detail": "Supervisor private transport is required."})
    return await call_next(request)


def request_has_local_operational_transport(request: Request) -> bool:
    client = request.client
    if client is None:
        # Uvicorn exposes a UDS peer without a TCP client address.  Treat that
        # shape as local only in the already-validated LAN private-UDS mode;
        # an absent client on an ordinary ASGI request must not widen access.
        return settings.lan_auth_enabled and settings.supervisor_transport == "private_uds"
    try:
        return ip_address(client.host).is_loopback
    except (TypeError, ValueError):
        return False


def require_local_operational_boundary(request: Request) -> None:
    if not request_has_local_operational_transport(request):
        raise HTTPException(
            status_code=403,
            detail=error_response(
                "Operational approval and action endpoints require a private UDS or loopback request.",
                "local_operational_boundary_required",
            ).model_dump(),
        )


async def require_memory_inbox_shell_operator(request: Request, session: AsyncSession) -> None:
    """Keep the shell's content-free projection behind the verified LAN session."""

    if not settings.lan_auth_enabled:
        return
    stored, _ = await load_valid_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    operator = await session.get(DashboardOperator, stored.operator_id) if stored else None
    if stored is None or operator is None or operator.role != "operator":
        raise HTTPException(status_code=401, detail="Sign-in required.")


async def require_memory_inbox_proposal_reader_operator(request: Request, session: AsyncSession) -> None:
    """Require an enabled LAN-authenticated operator before returning proposal content."""

    if not settings.lan_auth_enabled:
        raise HTTPException(status_code=404, detail="Authenticated Proposal Reader is unavailable.")
    stored, _ = await load_valid_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    operator = await session.get(DashboardOperator, stored.operator_id) if stored else None
    if stored is None or operator is None or operator.role != "operator" or not operator.enabled:
        raise HTTPException(status_code=401, detail="Sign-in required.")


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


async def require_memory_inbox_command_operator(request: Request, session: AsyncSession) -> DashboardOperator:
    """Mutating Inbox commands are always session-, Origin-, and CSRF-bound."""

    if not settings.lan_auth_enabled:
        raise HTTPException(status_code=404, detail="Memory Inbox commands are unavailable.")
    stored, _ = await load_valid_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    operator = await session.get(DashboardOperator, stored.operator_id) if stored else None
    if stored is None or operator is None or operator.role != "operator" or not operator.enabled:
        raise HTTPException(status_code=401, detail="Sign-in required.")
    if not exact_https_origin(request.headers.get("origin"), settings):
        raise HTTPException(status_code=403, detail="Authenticated origin required.")
    csrf = request.headers.get("x-csrf-token")
    if not csrf or not hmac.compare_digest(stored.csrf_token_hash, digest_secret(csrf)):
        raise HTTPException(status_code=403, detail="CSRF validation failed.")
    return operator


async def require_memory_proposal_recovery_operator(
    request: Request,
    session: AsyncSession,
) -> DashboardOperator | None:
    """Fence abandoned-write recovery to a local authenticated operator.

    Development instances without LAN authentication retain a loopback-only
    maintenance path. A deployed LAN instance must also satisfy the same
    session, Origin, and CSRF policy as every other operator mutation.
    """

    require_local_operational_boundary(request)
    if not settings.lan_auth_enabled:
        return None
    return await require_memory_inbox_command_operator(request, session)


def require_local_dogfood_attestation(request: Request) -> None:
    if not settings.enable_local_dogfood_attestation:
        raise HTTPException(
            status_code=404,
            detail=error_response("Local dogfood attestation is disabled.", "local_dogfood_disabled").model_dump(),
        )
    # Never trust a loopback TCP peer for this feature: a same-host proxy can
    # strip forwarding headers. The private Unix socket is the transport.
    if request.client is not None:
        raise HTTPException(
            status_code=403,
            detail=error_response(
                "Local dogfood attestation requires the supervisor-owned private Unix socket.",
                "local_dogfood_private_transport_required",
            ).model_dump(),
        )
    if any(name in request.headers for name in ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip")):
        raise HTTPException(
            status_code=403,
            detail=error_response(
                "Local dogfood attestation does not accept proxied requests.",
                "local_dogfood_no_proxy_required",
            ).model_dump(),
        )


async def require_local_dogfood_operator(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Bind LAN-authenticated attestation routes to the operator session."""
    require_local_dogfood_attestation(request)
    if not settings.lan_auth_enabled:
        return
    # The read-only bridge is a same-user process on the authenticated private
    # supervisor UDS and cannot forward the browser's session cookie. Mutating
    # routes below still require the operator session and CSRF token.
    if request.method == "GET":
        return
    stored, _ = await load_valid_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    operator = await session.get(DashboardOperator, stored.operator_id) if stored else None
    if stored is None or operator is None or operator.role != "operator":
        raise HTTPException(status_code=401, detail="Sign-in required.")
    if request.method != "GET":
        if not exact_https_origin(request.headers.get("origin"), settings):
            raise HTTPException(status_code=403, detail="Authenticated origin required.")
        csrf = request.headers.get("x-csrf-token")
        if not csrf or not hmac.compare_digest(stored.csrf_token_hash, digest_secret(csrf)):
            raise HTTPException(status_code=403, detail="CSRF validation failed.")


@app.post(
    "/local-dogfood/attestations/packets/{packet_id}/authorizations",
    response_model=LocalDogfoodAuthorizationApiEnvelope,
)
async def authorize_local_dogfood_attestation(
    packet_id: str,
    _: None = Depends(require_local_dogfood_operator),
    session: AsyncSession = Depends(get_session),
):
    try:
        return LocalDogfoodAuthorizationApiEnvelope(
            data=await local_dogfood_attestation.authorize_for_packet(
                session, packet_id, settings.local_dogfood_attestation_issuer_registry,
            )
        )
    except local_dogfood_attestation.ReceiptRejected as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), exc.reason).model_dump()) from exc


@app.post(
    "/local-dogfood/attestations/receipts",
    response_model=LocalDogfoodAttestationDecisionApiEnvelope,
)
async def verify_local_dogfood_attestation(
    request: Request,
    _: None = Depends(require_local_dogfood_operator),
    session: AsyncSession = Depends(get_session),
):
    try:
        receipt, signature_b64 = local_dogfood_attestation.parse_receipt_submission(await request.body())
        return LocalDogfoodAttestationDecisionApiEnvelope(
            data=await local_dogfood_attestation.verify(
                session,
                receipt,
                signature_b64,
                registry_json=settings.local_dogfood_attestation_issuer_registry,
            )
        )
    except local_dogfood_attestation.ReceiptRejected as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), exc.reason).model_dump()) from exc


@app.post(
    "/local-dogfood/attestations/authorizations/{authorization_id}/observe",
    response_model=LocalDogfoodAttestationDecisionApiEnvelope,
)
async def observe_local_dogfood_attestation(
    authorization_id: str,
    _: None = Depends(require_local_dogfood_operator),
    session: AsyncSession = Depends(get_session),
):
    if not settings.local_dogfood_attestation_socket_path or not settings.local_dogfood_attestation_envelope_secret_file:
        raise HTTPException(
            status_code=404,
            detail=error_response("Local observer socket is not configured.", "local_observer_unavailable").model_dump(),
        )
    try:
        secret = local_dogfood_attestation.read_owner_private_secret(
            settings.local_dogfood_attestation_envelope_secret_file
        )
        return LocalDogfoodAttestationDecisionApiEnvelope(
            data=await local_dogfood_attestation.observe_and_verify(
                session,
                authorization_id,
                settings.local_dogfood_attestation_socket_path,
                settings.local_dogfood_attestation_issuer_registry,
                secret,
            )
        )
    except local_dogfood_attestation.ReceiptRejected as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), exc.reason).model_dump()) from exc


@app.get(
    "/local-dogfood/attestations/authorizations/{authorization_id}",
    response_model=LocalDogfoodAttestationReadbackApiEnvelope,
)
async def read_local_dogfood_attestation(
    authorization_id: str,
    _: None = Depends(require_local_dogfood_operator),
    session: AsyncSession = Depends(get_session),
):
    try:
        return LocalDogfoodAttestationReadbackApiEnvelope(
            data=await local_dogfood_attestation.readback(
                session, authorization_id, registry_json=settings.local_dogfood_attestation_issuer_registry,
            )
        )
    except local_dogfood_attestation.ReceiptRejected as exc:
        raise HTTPException(status_code=404, detail=error_response(str(exc), exc.reason).model_dump()) from exc


@app.post(
    "/local-dogfood/attestations/authorizations/{authorization_id}/revoke",
    response_model=LocalDogfoodAttestationRevocationApiEnvelope,
)
async def revoke_local_dogfood_attestation(
    authorization_id: str,
    _: None = Depends(require_local_dogfood_operator),
    session: AsyncSession = Depends(get_session),
):
    authorization = await session.get(LocalDogfoodAuthorization, authorization_id)
    if authorization is None:
        raise HTTPException(status_code=404, detail=error_response("Authorization not found.", "authorization_not_found").model_dump())
    authorization.revoked = True
    await session.commit()
    return LocalDogfoodAttestationRevocationApiEnvelope(
        data={"authorizationId": authorization_id, "revoked": True, "evidenceClass": "integrated_local"}
    )


@app.get(
    "/local-dogfood/attestations/targets/{target_ref}",
    response_model=LocalDogfoodAttestationReadbackApiEnvelope,
)
async def read_local_dogfood_attestation_for_target(
    target_ref: str,
    _: None = Depends(require_local_dogfood_operator),
    session: AsyncSession = Depends(get_session),
):
    return LocalDogfoodAttestationReadbackApiEnvelope(
        data=await local_dogfood_attestation.readback_for_target(
            session, target_ref, registry_json=settings.local_dogfood_attestation_issuer_registry,
        )
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _auth_source_key(request: Request) -> str:
    return request.client.host if request.client and request.client.host else "uds"


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="strict")


def _expired_session_response() -> JSONResponse:
    response = JSONResponse(
        status_code=401,
        content={"detail": "Your session ended. Sign in to continue."},
        headers={"Cache-Control": "no-store"},
    )
    _clear_session_cookie(response)
    return response


def _private_test_viewer_lifecycle_request(request: Request) -> None:
    """Lifecycle writes are callable only by a same-user private UDS peer."""

    if (
        not settings.lan_auth_enabled
        or settings.supervisor_transport != "private_uds"
        or request.client is not None
        or any(request.headers.get(name) for name in ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"))
    ):
        raise HTTPException(status_code=404, detail="Not found.")


PACKET_DETAIL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$")
PACKET_DETAIL_MEDIATOR = "packet-detail/v1"


def _canonical_packet_detail_timestamp(value: datetime) -> str:
    """Emit one UTC wire form for the dashboard mediator's strict contract."""
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _lan_detail_stage(stage: str) -> str:
    """Project the one authoritative spelling that differs in dashboard presentation."""

    return "human_gate" if stage == "needs_approval" else stage


def _lan_detail_owner(stage: str, status: str) -> str:
    if status in {"blocked", "failed"}:
        return "blocked"
    return "operator" if stage == "needs_approval" else "kendall"


def _canonical_lan_work_graph_view(work_graph) -> dict[str, object]:
    """Reconstruct the browser DTO; never relabel the V0 projection record."""

    return {
        "schemaVersion": "dashboard-canonical-work-graph/v1",
        "sourceSchemaVersion": "parallel-execution-graph-reservation/v1",
        "availability": work_graph.availability,
        "packetId": work_graph.packetId,
        "executionJobId": work_graph.executionJobId,
        "reportIdentity": work_graph.reportIdentity,
        "generatedAt": _canonical_packet_detail_timestamp(work_graph.generatedAt) if work_graph.generatedAt else None,
        "freshnessState": work_graph.freshnessState,
        "waveMembership": work_graph.waveMembership,
        "dependencyState": work_graph.dependencyState,
        "reservation": {
            "status": work_graph.reservation.status,
            "owner": work_graph.reservation.owner,
            "reasonCode": work_graph.reservation.reasonCode,
        },
        "capacity": {
            "posture": work_graph.capacity.posture,
            "reasonCode": work_graph.capacity.reasonCode,
        },
        "reason": work_graph.reason,
        "nextSafeAction": work_graph.nextSafeAction,
        "evidenceRefs": list(work_graph.evidenceRefs),
        "metadataOnly": True,
        "rawPayloadRetained": False,
        "retention": "metadata_only_evidence_references",
    }


def _packet_detail_view(packet, work_graph=None) -> dict[str, object]:
    """Return the browser-safe canonical detail model for the LAN mediator.

    This is deliberately not an ``AuthoritativeWorkPacketLifecycleView`` dump:
    the authenticated browser receives only a fixed presentation projection, not
    raw lifecycle/event/provider fields. The private route is retained during
    the wider legacy-route retirement, but this mediated read is v2-only so a
    browser never receives a partially compatible legacy packet shape.
    """

    evidence = packet.evidenceChain
    evidence_view = None
    if evidence is not None:
        evidence_view = {
            "schemaVersion": evidence.schemaVersion,
            "evidenceClass": evidence.evidenceClass,
            "checkedAt": _canonical_packet_detail_timestamp(evidence.checkedAt),
            "expiresAt": _canonical_packet_detail_timestamp(evidence.expiresAt),
            "freshnessState": evidence.freshnessState,
            "effectiveDecision": evidence.effectiveDecision,
            "typedBlockers": list(evidence.typedBlockers),
        }
    current_event = next((event for event in packet.history if event.eventId == packet.currentEventId), None)
    if current_event is None:
        raise ValueError("Authoritative packet has no current lifecycle event.")
    graph_view = _canonical_lan_work_graph_view(work_graph) if work_graph is not None else None
    return {
        "schemaVersion": "dashboard-canonical-lan-packet-detail/v1",
        "state": "available",
        "packet": {
            "presentation": {
                "schemaVersion": "dashboard-canonical-lan-packet-presentation/v1",
                "packetId": packet.packetId,
                "title": packet.title,
                "requestedOutcome": current_event.payloadSummary,
                "currentStage": _lan_detail_stage(packet.currentStage),
                "currentOwner": _lan_detail_owner(packet.currentStage, packet.status),
                "status": packet.status,
                "truthLabel": packet.truthLabel,
                "currentEventId": packet.currentEventId,
                "createdAt": _canonical_packet_detail_timestamp(packet.createdAt),
                "updatedAt": _canonical_packet_detail_timestamp(packet.updatedAt),
                "metadataOnly": True,
                "rawPayloadRetained": False,
            },
            "evidence": evidence_view,
            "workGraph": graph_view,
        },
    }


def _packet_detail_error(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
        headers={"Cache-Control": "no-store"},
    )


@app.post("/auth/login")
async def operator_login(payload: OperatorLoginRequest, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    if not settings.lan_auth_enabled or not exact_https_origin(request.headers.get("origin"), settings):
        await record_auth_audit(session, "login_failure", "origin_denied")
        raise HTTPException(status_code=403, detail=GENERIC_LOGIN_FAILURE)
    if not await consume_login_csrf_challenge(session, request.headers.get("x-csrf-token")):
        await record_auth_audit(session, "login_failure", "csrf_denied")
        raise HTTPException(status_code=403, detail=GENERIC_LOGIN_FAILURE)
    success, raw_token, raw_csrf = await authenticate_dashboard_account(
        session,
        payload.password,
        _auth_source_key(request),
        settings,
        payload.account,
    )
    if not success or raw_token is None or raw_csrf is None:
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_FAILURE)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        raw_token,
        max_age=SESSION_ABSOLUTE_SECONDS,
        secure=True,
        httponly=True,
        samesite="strict",
        path="/",
    )
    return {"authenticated": True, "csrfToken": raw_csrf, "role": payload.account}


@app.get("/auth/login-csrf")
async def login_csrf(response: Response, session: AsyncSession = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    return {"csrfToken": await create_login_csrf_challenge(session)}


@app.get("/auth/session")
async def operator_session(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    stored, reason = await load_valid_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    if stored is None:
        return _expired_session_response()
    principal = await session.get(DashboardOperator, stored.operator_id)
    if principal is None or not can_dashboard_read(principal.role):
        return _expired_session_response()
    return {"authenticated": True, "role": principal.role, "sessionState": "active"}


@app.post("/auth/logout")
async def operator_logout(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    if not settings.lan_auth_enabled or not exact_https_origin(request.headers.get("origin"), settings):
        await record_auth_audit(session, "logout", "origin_denied")
        raise HTTPException(status_code=403, detail="Logout was not accepted.")
    csrf_token = request.headers.get("x-csrf-token")
    if not await logout_session(session, request.cookies.get(SESSION_COOKIE_NAME), csrf_token):
        await record_auth_audit(session, "logout", "denied")
        raise HTTPException(status_code=403, detail="Logout was not accepted.")
    _clear_session_cookie(response)
    return {"signedOut": True}


@app.post("/internal/lan-auth/test-viewer")
async def test_viewer_lifecycle(
    payload: TestViewerLifecycleRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """The only test-viewer lifecycle route; intentionally not browser-proxied."""

    _private_test_viewer_lifecycle_request(request)
    action = payload.action
    async with TEST_VIEWER_AUTH_LIFECYCLE_LOCK:
        if action == "status" and payload.password is None:
            result = await test_viewer_status(session)
        elif action in {"enable", "rotate"} and isinstance(payload.password, str):
            try:
                result = await enable_or_rotate_test_viewer(
                    session,
                    payload.password.encode("utf-8"),
                    rotate=action == "rotate",
                )
                await session.commit()
            except (UnicodeEncodeError, LanAuthConfigurationError):
                await session.rollback()
                raise HTTPException(status_code=400, detail="Test viewer lifecycle request was not accepted.")
        elif action == "revoke" and payload.password is None:
            result = await revoke_test_viewer(session)
            await session.commit()
        else:
            raise HTTPException(status_code=400, detail="Test viewer lifecycle request was not accepted.")
    return {
        "schemaVersion": "kendall-test-viewer-lifecycle/v1",
        "role": "test_viewer",
        "configured": result.configured,
        "enabled": result.enabled,
        "rotated": result.rotated,
    }


@app.get("/internal/dashboard/packet-detail/{packet_id}")
async def authenticated_packet_detail(
    packet_id: str,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """Fixed, read-only UDS target for the dashboard's authenticated mediator."""

    response.headers["Cache-Control"] = "no-store"
    if (
        request.headers.get("x-kendall-dashboard-mediator") != PACKET_DETAIL_MEDIATOR
        or settings.supervisor_transport != "private_uds"
        or request.client is not None
    ):
        return _packet_detail_error(404, "Not found.")
    if not settings.lan_auth_enabled or not PACKET_DETAIL_ID.fullmatch(packet_id):
        await record_auth_audit(session, "packet_detail_read", "denied")
        return _packet_detail_error(404, "Packet detail is unavailable.")
    if any(request.headers.get(name) for name in ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port")):
        await record_auth_audit(session, "packet_detail_read", "denied")
        return _packet_detail_error(403, "Packet detail is unavailable.")
    stored, _ = await load_valid_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    operator = await session.get(DashboardOperator, stored.operator_id) if stored else None
    if stored is None or operator is None or not can_dashboard_read(operator.role):
        await record_auth_audit(session, "packet_detail_read", "denied")
        return _packet_detail_error(401, "Sign-in required.")
    try:
        packet = await service.get_authoritative_work_packet(session, packet_id)
    except Exception:
        await record_auth_audit(session, "packet_detail_read", "unavailable")
        return _packet_detail_error(503, "Packet detail is unavailable.")
    if packet is None:
        await record_auth_audit(session, "packet_detail_read", "unavailable")
        return {"schemaVersion": "dashboard-canonical-lan-packet-detail/v1", "state": "unavailable"}
    try:
        projection = await service.get_dashboard_canonical_operational_projection(session, mutation_access=False)
    except Exception:
        await record_auth_audit(session, "packet_detail_read", "unavailable")
        return _packet_detail_error(503, "Packet detail is unavailable.")
    detail = next((item for item in projection.selectedPacketDetails if item.packetId == packet.packetId), None)
    if detail is None or detail.workGraph.packetId != packet.packetId:
        await record_auth_audit(session, "packet_detail_read", "unavailable")
        return {"schemaVersion": "dashboard-canonical-lan-packet-detail/v1", "state": "unavailable"}
    await record_auth_audit(session, "packet_detail_read", "allowed", target_ref=packet.packetId)
    return _packet_detail_view(packet, detail.workGraph)


@app.get("/internal/lan-auth/startup-gate")
async def lan_auth_startup_gate() -> dict[str, object]:
    if not settings.lan_auth_enabled or not startup_gate_ready or not settings.supervisor_uds_path:
        raise HTTPException(status_code=503, detail="LAN auth startup gate is unavailable.")
    return {
        "schemaVersion": "kendall-lan-auth-startup-gate/v1",
        "transport": "private_uds",
        "bootstrapValidated": True,
        "supervisorUdsPath": settings.supervisor_uds_path,
    }


@app.post("/work-items", response_model=WorkItemApiEnvelope)
async def create_work_item(payload: WorkItemCreate, session: AsyncSession = Depends(get_session)):
    try:
        item = await service.create_work_item(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "work_item_intake_blocked").model_dump()) from exc
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.get("/memory-inbox/shell", response_model=MemoryInboxShellApiEnvelope)
async def get_memory_inbox_shell(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """The initial shell reads no capture, proposal, or vault-backed state."""

    response.headers["Cache-Control"] = "no-store"
    await require_memory_inbox_shell_operator(request, session)
    return MemoryInboxShellApiEnvelope(data=service.get_memory_inbox_shell_status())


@app.get("/memory-inbox/cost-policy", response_model=MemoryInboxCostPolicyApiEnvelope)
async def get_memory_inbox_cost_policy(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    await require_memory_inbox_shell_operator(request, session)
    return {"data": await read_inbox_cost_policy(session)}


@app.post("/memory-inbox/cost-policy", response_model=MemoryInboxCostPolicyApiEnvelope)
async def update_memory_inbox_cost_policy(
    payload: MemoryInboxCostPolicyUpdateRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        policy = await set_inbox_cost_policy(
            session, finite_limit=payload.finiteLimit,
            unlimited_acknowledged=payload.unlimitedAcknowledged,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox Cost Policy was not accepted.") from exc
    return {"data": policy}


@app.post("/memory-inbox/sources/{source_id}/processing-disclosure", response_model=MemoryInboxProcessingDisclosureApiEnvelope)
async def present_memory_inbox_processing_disclosure(
    source_id: str,
    payload: MemoryInboxProcessingDisclosureRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        disclosure = await present_processing_disclosure(
            session, source_id=source_id, expected_revision=payload.expectedRevision,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Processing Disclosure is unavailable for this Source.") from exc
    return {"data": disclosure}


@app.post("/memory-inbox/processing-disclosures/{disclosure_id}/accept", response_model=MemoryInboxProcessingDisclosureApiEnvelope)
async def accept_memory_inbox_processing_disclosure(
    disclosure_id: str,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        disclosure = await accept_processing_disclosure(
            session, disclosure_id=disclosure_id, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Processing Disclosure acceptance is unavailable.") from exc
    return {"data": disclosure}


@app.post("/memory-inbox/processing-disclosures/{disclosure_id}/dispatch", response_model=MemoryInboxDispatchClaimApiEnvelope)
async def dispatch_memory_inbox_processing(
    disclosure_id: str,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """Create or read back exactly one no-egress ProcessingAttempt claim."""
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        claim = await claim_processing_dispatch(
            session, disclosure_id=disclosure_id, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox dispatch is unavailable.") from exc
    lifecycle_state = claim["lifecycleState"]
    next_safe_action = {
        "Claimed": "reserve_cost",
        "CompletionUnknown": "resolve_completion_unknown",
        "Closed": "review",
    }.get(lifecycle_state, "refresh_memory_inbox")
    return {"data": {
        "schemaVersion": "kendall-memory-inbox-dispatch-claim/v1",
        **claim,
        "nextSafeAction": next_safe_action,
    }}


@app.post("/memory-inbox/processing-attempts/{attempt_id}/resolve-completion-unknown", response_model=MemoryInboxCompletionUnknownResolutionApiEnvelope)
async def resolve_memory_inbox_completion_unknown(
    attempt_id: str,
    payload: MemoryInboxCompletionUnknownResolutionRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """Record one authenticated, content-safe closeout for an uncertain attempt."""
    response.headers["Cache-Control"] = "no-store"
    await require_memory_inbox_command_operator(request, session)
    try:
        lifecycle_state = await resolve_attempt_completion_unknown(
            session, attempt_id=attempt_id, resolution=payload.resolution,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox completion resolution is unavailable.") from exc
    return {"data": {
        "schemaVersion": "kendall-memory-inbox-completion-resolution/v1",
        "attemptId": attempt_id,
        "lifecycleState": lifecycle_state,
        "nextSafeAction": "refresh_memory_inbox",
    }}


@app.post("/memory-inbox/sources/{source_id}/lifecycle", response_model=MemoryInboxLifecycleCommandApiEnvelope)
async def command_memory_inbox_lifecycle(
    source_id: str,
    payload: MemoryInboxLifecycleCommandRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        result = await apply_lifecycle_command(
            session,
            MemoryInboxLifecycleCommand(
                source_id=source_id,
                expected_revision=payload.expectedRevision,
                idempotency_key=payload.idempotencyKey,
                target_state=MemoryInboxSourceState(payload.targetState),
            ),
            verified_actor_ref=f"operator:{operator.id}",
            audit_ref=f"audit:memory-inbox:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox command was not accepted.") from exc
    return MemoryInboxLifecycleCommandApiEnvelope(data=MemoryInboxLifecycleCommandResultV1(
        sourceId=result.source_id,
        expectedRevision=result.expected_revision,
        resultingRevision=result.resulting_revision,
        outcome=result.outcome,
        reasonCode=result.reason_code,
        lifecycleState=result.lifecycle_state.value if result.lifecycle_state else None,
    ))


@app.get("/memory-inbox/projection", response_model=MemoryInboxProjectionApiEnvelope)
async def get_memory_inbox_projection(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    await require_memory_inbox_shell_operator(request, session)
    rows = await read_memory_inbox_projection(session)
    return MemoryInboxProjectionApiEnvelope(data=MemoryInboxProjectionV1(
        rows=[MemoryInboxProjectionRowV1(
            sourceId=row.source_id,
            lifecycleState=row.lifecycle_state,
            revision=row.revision,
            retentionDeadlineAt=row.retention_deadline_at,
            deletionState=row.deletion_state,
            nextSafeAction=row.next_action_code,
            proposalId=row.proposal_id,
            proposalRevision=row.proposal_revision,
        ) for row in rows],
        reviewReadyCount=await read_review_ready_count(session),
        nextSafeAction="refresh_memory_inbox" if not rows else "review_memory_inbox",
    ))


@app.get("/memory-inbox/proposals/{proposal_id}/revisions/{revision}/reader", response_model=MemoryInboxProposalReaderApiEnvelope)
async def get_memory_inbox_proposal_reader(
    proposal_id: str,
    revision: int,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """The only Memory Inbox GET route permitted to return a proposal body."""
    response.headers["Cache-Control"] = "no-store"
    await require_memory_inbox_proposal_reader_operator(request, session)
    try:
        reader = await read_authorized_proposal(
            session, settings=get_settings(), proposal_id=proposal_id, revision=revision,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Authenticated Proposal Reader is unavailable.") from exc
    return MemoryInboxProposalReaderApiEnvelope(data=MemoryInboxProposalReaderV1(
        proposalId=reader.proposal_id, revision=reader.revision, body=reader.body,
    ))


@app.post("/memory-inbox/proposals/{proposal_id}/return", response_model=MemoryInboxReviewDecisionApiEnvelope)
async def return_memory_inbox_proposal(
    proposal_id: str, payload: MemoryInboxReviewDecisionRequest, request: Request,
    response: Response, session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    if payload.returnContext is None:
        raise HTTPException(status_code=422, detail="Revision context is required to return a Proposal.")
    try:
        result = await return_proposal_for_revision(
            session, proposal_id=proposal_id, expected_revision=payload.expectedRevision,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="The Proposal return is unavailable.") from exc
    return MemoryInboxReviewDecisionApiEnvelope(data=MemoryInboxReviewDecisionResultV1(
        proposalId=result.proposal_id, proposalRevision=result.proposal_revision, sourceId=result.source_id,
        sourceRevision=result.source_revision, lifecycleState=result.lifecycle_state,
        replayed=result.replayed, nextSafeAction=result.next_safe_action,
    ))


@app.post("/memory-inbox/proposals/{proposal_id}/deny", response_model=MemoryInboxReviewDecisionApiEnvelope)
async def deny_memory_inbox_proposal(
    proposal_id: str, payload: MemoryInboxReviewDecisionRequest, request: Request,
    response: Response, session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        result = await deny_proposal_retaining_source(
            session, proposal_id=proposal_id, expected_revision=payload.expectedRevision,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="The Proposal denial is unavailable.") from exc
    return MemoryInboxReviewDecisionApiEnvelope(data=MemoryInboxReviewDecisionResultV1(
        proposalId=result.proposal_id, proposalRevision=result.proposal_revision, sourceId=result.source_id,
        sourceRevision=result.source_revision, lifecycleState=result.lifecycle_state,
        replayed=result.replayed, nextSafeAction=result.next_safe_action,
    ))


@app.post("/memory-inbox/proposals/{proposal_id}/approve", response_model=MemoryInboxApprovalApiEnvelope)
async def approve_memory_inbox_proposal(
    proposal_id: str, payload: MemoryInboxApprovalRequest, request: Request,
    response: Response, session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        result = await approve_proposal_for_deletion(
            session, proposal_id=proposal_id, expected_revision=payload.expectedRevision,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="The Proposal approval is unavailable.") from exc
    return MemoryInboxApprovalApiEnvelope(data=MemoryInboxApprovalResultV1(
        proposalId=result.proposal_id, proposalRevision=result.proposal_revision, sourceId=result.source_id,
        sourceRevision=result.source_revision, deletionOperations=result.deletion_operations, replayed=result.replayed,
    ))


@app.post("/memory-inbox/sources/{source_id}/delete", response_model=MemoryInboxSourceDeletionApiEnvelope)
async def delete_memory_inbox_source(
    source_id: str, payload: MemoryInboxSourceDeletionRequest, request: Request,
    response: Response, session: AsyncSession = Depends(get_session),
):
    """Enter the same version-locked deletion barrier without reading a Source."""
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        result = await delete_source_by_operator(
            session, source_id=source_id, expected_revision=payload.expectedRevision,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox source deletion is unavailable.") from exc
    source = await session.get(MemoryInboxSource, source_id)
    deletion_state = source.deletion_state if source else "RetryNeeded"
    return MemoryInboxSourceDeletionApiEnvelope(data=MemoryInboxSourceDeletionResultV1(
        sourceId=result.source_id, sourceRevision=result.source_revision,
        deletionOperations=result.deletion_operations, initiator=result.initiator,
        replayed=result.replayed, deletionState=deletion_state,
        nextSafeAction="retry_deletion" if deletion_state == "RetryNeeded" else "await_deletion_proof",
    ))


@app.post("/memory-inbox/sources/{source_id}/retry-deletion", response_model=MemoryInboxSourceDeletionApiEnvelope)
async def retry_memory_inbox_source_deletion(
    source_id: str, payload: MemoryInboxSourceDeletionRequest, request: Request,
    response: Response, session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        result = await retry_source_deletion(
            session, source_id=source_id, expected_revision=payload.expectedRevision,
            idempotency_key=payload.idempotencyKey, actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox deletion retry is unavailable.") from exc
    source = await session.get(MemoryInboxSource, source_id)
    deletion_state = source.deletion_state if source else "RetryNeeded"
    return MemoryInboxSourceDeletionApiEnvelope(data=MemoryInboxSourceDeletionResultV1(
        sourceId=result.source_id, sourceRevision=result.source_revision,
        deletionOperations=result.deletion_operations, initiator=result.initiator,
        replayed=result.replayed, deletionState=deletion_state,
        nextSafeAction="retry_deletion" if deletion_state == "RetryNeeded" else "await_deletion_proof",
    ))


@app.get("/memory-inbox/sources/{source_id}/deletion-receipt", response_model=MemoryInboxDeletionReceiptApiEnvelope)
async def get_memory_inbox_deletion_receipt(
    source_id: str, request: Request, response: Response, session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    await require_memory_inbox_shell_operator(request, session)
    try:
        receipt = await read_deletion_receipt(session, source_id=source_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox deletion receipt is unavailable.") from exc
    return MemoryInboxDeletionReceiptApiEnvelope(data=MemoryInboxDeletionReceiptV1(
        sourceId=receipt.source_id, outcome=receipt.outcome, proofCount=receipt.proof_count,
        summary=receipt.summary, nextSafeAction=receipt.next_safe_action,
    ))


@app.post("/memory-inbox/sources/{source_id}/retention-extension", response_model=MemoryInboxRetentionExtensionApiEnvelope)
async def extend_memory_inbox_source_retention(
    source_id: str, payload: MemoryInboxRetentionExtensionRequest, request: Request,
    response: Response, session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        result = await extend_source_retention(
            session, source_id=source_id, expected_revision=payload.expectedRevision,
            extension_hours=payload.extensionHours, idempotency_key=payload.idempotencyKey,
            actor_ref=f"operator:{operator.id}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Memory Inbox retention extension is unavailable.") from exc
    return MemoryInboxRetentionExtensionApiEnvelope(data=MemoryInboxRetentionExtensionResultV1(
        sourceId=result.source_id, sourceRevision=result.source_revision,
        retentionDeadlineAt=result.retention_deadline_at, replayed=result.replayed,
    ))


@app.post("/memory-inbox/text-capture", response_model=MemoryInboxTextCaptureApiEnvelope)
async def capture_memory_inbox_text(
    payload: MemoryInboxTextCaptureRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        source_id = await capture_acknowledged_text(
            session, settings=settings, text_value=payload.text,
            acknowledged_non_sensitive=payload.acknowledgedNonSensitive, actor_ref=f"operator:{operator.id}",
            idempotency_key=payload.idempotencyKey,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Text capture was not accepted.") from exc
    return MemoryInboxTextCaptureApiEnvelope(data=MemoryInboxTextCaptureResultV1(sourceId=source_id))


@app.post("/memory-inbox/upload")
async def receive_memory_inbox_upload(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        source_id = await receive_quarantined_upload(
            session, settings=settings, chunks=request.stream(), actor_ref=f"operator:{operator.id}",
            declared_media_type=request.headers.get("content-type", "").split(";", 1)[0].lower(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Document upload was not accepted.") from exc
    return {"data": {"schemaVersion": "kendall-memory-inbox-upload/v1", "sourceId": source_id, "lifecycleState": "Scanning", "nextSafeAction": "await_inspection"}}


@app.post("/memory-inbox/sources/{source_id}/inspection")
async def request_memory_inbox_inspection(source_id: str, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    """Plan a private inspection lease; the request itself never reads content."""
    response.headers["Cache-Control"] = "no-store"
    operator = await require_memory_inbox_command_operator(request, session)
    try:
        require_inspection_activation(settings)
        job = await plan_inspection_lease(
            session, source_id=source_id, actor_ref=f"operator:{operator.id}",
            lease_seconds=max(60, settings.memory_inbox_scanner_timeout_seconds * 2 + 10),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Inspection is unavailable; the quarantined source remains inert.") from exc
    return {"data": {"schemaVersion": "kendall-memory-inbox-inspection/v1", "jobId": job.id, "lifecycleState": job.lifecycle_state, "nextSafeAction": "await_inspection"}}


@app.post("/candidate-work", response_model=CandidateWorkApiEnvelope)
async def create_candidate_work(payload: CandidateWorkCreate, session: AsyncSession = Depends(get_session)):
    candidate = await service.create_candidate_work(session, payload)
    return CandidateWorkApiEnvelope(data=service.to_candidate_work_view(candidate))


@app.post("/candidate-work/import-bmad", response_model=CandidateWorkApiEnvelope)
async def import_bmad_candidate_work(payload: CandidateWorkBmadImportRequest, session: AsyncSession = Depends(get_session)):
    try:
        candidate = await service.import_bmad_candidate_work(session, payload)
    except BmadImportError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_bmad_import").model_dump()) from exc
    return CandidateWorkApiEnvelope(data=service.to_candidate_work_view(candidate))


@app.post("/candidate-work/import-obsidian-metadata", response_model=CandidateWorkApiEnvelope)
async def import_obsidian_metadata_candidate_work(
    payload: CandidateWorkObsidianMetadataImportRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        candidate = await service.import_obsidian_metadata_candidate_work(session, payload)
    except ObsidianMetadataImportError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_obsidian_metadata_import").model_dump()) from exc
    return CandidateWorkApiEnvelope(data=service.to_candidate_work_view(candidate))


@app.get("/candidate-work", response_model=CandidateWorkListApiEnvelope)
async def list_candidate_work(session: AsyncSession = Depends(get_session)):
    candidates = await service.list_candidate_work(session)
    return CandidateWorkListApiEnvelope(data=[service.to_candidate_work_view(candidate) for candidate in candidates])


@app.post("/pipeline-control-plane/work-packets", response_model=AuthoritativeWorkPacketApiEnvelope)
async def create_authoritative_work_packet(
    payload: AuthoritativeWorkPacketCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    if service._is_manager_source_intake_actor(payload.actor.model_dump()):
        raise HTTPException(
            status_code=403,
            detail=error_response(
                "Manager source intake requires the same-user private supervisor UDS transport.",
                "manager_source_private_transport_required",
            ).model_dump(),
        )
    if payload.parallelWorkGraphEvidence is not None or payload.reviewRouteEvidence is not None:
        raise HTTPException(status_code=403, detail=error_response("Manager evidence intake requires the private manager supervisor transport.", "manager_graph_private_transport_required").model_dump())
    try:
        packet = await service.create_authoritative_work_packet(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_authoritative_work_packet").model_dump()) from exc
    return AuthoritativeWorkPacketApiEnvelope(data=packet)


@app.post("/internal/manager-source-intake/work-packets", response_model=AuthoritativeWorkPacketApiEnvelope)
async def create_manager_source_intake_work_packet(
    request: Request,
    payload: AuthoritativeWorkPacketCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    if (
        not settings.lan_auth_enabled
        or settings.supervisor_transport != "private_uds"
        or request.client is not None
        or not service._is_manager_source_intake_actor(payload.actor.model_dump())
    ):
        raise HTTPException(status_code=403, detail=error_response("Private manager source intake is unavailable.", "manager_graph_private_transport_required").model_dump())
    try:
        packet = await service.create_authoritative_work_packet(
            session,
            payload,
            manager_source_intake_authorized=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_authoritative_work_packet").model_dump()) from exc
    return AuthoritativeWorkPacketApiEnvelope(data=packet)


@app.get("/pipeline-control-plane/work-packets", response_model=AuthoritativeWorkPacketListApiEnvelope)
async def list_authoritative_work_packets(session: AsyncSession = Depends(get_session)):
    return AuthoritativeWorkPacketListApiEnvelope(data=await service.list_authoritative_work_packets(session))


@app.get("/pipeline-control-plane/work-items/{work_item_id}/packet", response_model=AuthoritativeWorkPacketApiEnvelope)
async def get_authoritative_work_packet_for_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    packet = await service.get_authoritative_work_packet_for_work_item(session, work_item_id)
    if not packet:
        raise HTTPException(
            status_code=404,
            detail=error_response("Authoritative WorkPacket link not found.", "authoritative_work_packet_link_not_found").model_dump(),
        )
    return AuthoritativeWorkPacketApiEnvelope(data=packet)


@app.get(
    "/pipeline-control-plane/canonical-operational-projection",
    response_model=DashboardCanonicalOperationalProjectionApiEnvelope,
)
async def get_dashboard_canonical_operational_projection(request: Request, session: AsyncSession = Depends(get_session)):
    return DashboardCanonicalOperationalProjectionApiEnvelope(
        data=await service.get_dashboard_canonical_operational_projection(
            session,
            mutation_access=request_has_local_operational_transport(request),
        )
    )


@app.post(
    "/manager-control-plane/lane-clarity-handoffs",
    response_model=ManagerLaneClarityHandoffApiEnvelope,
)
async def record_manager_lane_clarity_handoff(
    payload: ManagerLaneClarityHandoffRequest,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        handoff = await persist_manager_lane_clarity_handoff(session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "manager_lane_clarity_handoff_conflict").model_dump(),
        ) from exc
    return ManagerLaneClarityHandoffApiEnvelope(data=handoff)


@app.get(
    "/manager-control-plane/lane-clarity-handoffs/{handoff_id}",
    response_model=ManagerLaneClarityHandoffApiEnvelope,
)
async def read_manager_lane_clarity_handoff(
    handoff_id: str,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    handoff = await get_manager_lane_clarity_handoff(session, handoff_id)
    if handoff is None:
        raise HTTPException(
            status_code=404,
            detail=error_response("Manager lane clarity handoff not found.", "manager_lane_clarity_handoff_not_found").model_dump(),
        )
    return ManagerLaneClarityHandoffApiEnvelope(data=handoff)


@app.post(
    "/manager-control-plane/coordination-health-handoffs",
    response_model=ManagerCoordinationHealthHandoffApiEnvelope,
)
async def record_manager_coordination_health_handoff(
    payload: ManagerCoordinationHealthHandoffRequest,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        handoff = await persist_manager_coordination_health_handoff(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "manager_coordination_health_handoff_conflict").model_dump()) from exc
    return ManagerCoordinationHealthHandoffApiEnvelope(data=handoff)


@app.get(
    "/manager-control-plane/coordination-health-handoffs/{handoff_id}",
    response_model=ManagerCoordinationHealthHandoffApiEnvelope,
)
async def read_manager_coordination_health_handoff(
    handoff_id: str,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    handoff = await get_manager_coordination_health_handoff(session, handoff_id)
    if handoff is None:
        raise HTTPException(
            status_code=404,
            detail=error_response("Manager coordination-health handoff not found.", "manager_coordination_health_handoff_not_found").model_dump(),
        )
    return ManagerCoordinationHealthHandoffApiEnvelope(data=handoff)


@app.get("/pipeline-control-plane/work-packets/{packet_id}", response_model=AuthoritativeWorkPacketApiEnvelope)
async def get_authoritative_work_packet(packet_id: str, session: AsyncSession = Depends(get_session)):
    packet = await service.get_authoritative_work_packet(session, packet_id)
    if not packet:
        raise HTTPException(status_code=404, detail=error_response("Authoritative WorkPacket not found.", "authoritative_work_packet_not_found").model_dump())
    return AuthoritativeWorkPacketApiEnvelope(data=packet)


@app.post("/pipeline-control-plane/work-packets/{packet_id}/epic-25-evidence-chain", response_model=ApiEnvelope)
async def ingest_pipeline_epic_25_evidence_chain(
    packet_id: str,
    payload: PipelineEpic25EvidenceChainIngestRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    require_local_operational_boundary(request)
    try:
        evidence_chain = await service.ingest_pipeline_epic_25_evidence_chain(session, packet_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_epic_25_evidence_chain").model_dump()) from exc
    if evidence_chain is None:
        raise HTTPException(status_code=404, detail=error_response("Authoritative WorkPacket not found.", "authoritative_work_packet_not_found").model_dump())
    return ApiEnvelope(data=evidence_chain)


@app.post(
    "/pipeline-control-plane/work-packets/{packet_id}/transitions",
    response_model=AuthoritativeWorkPacketApiEnvelope,
)
async def transition_authoritative_work_packet(
    packet_id: str,
    payload: AuthoritativeWorkPacketTransitionRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        packet = await service.transition_authoritative_work_packet(session, packet_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_authoritative_work_packet_transition").model_dump()) from exc
    if not packet:
        raise HTTPException(status_code=404, detail=error_response("Authoritative WorkPacket not found.", "authoritative_work_packet_not_found").model_dump())
    return AuthoritativeWorkPacketApiEnvelope(data=packet)


@app.post("/pipeline-control-plane/work-packets/{packet_id}/local-proof", response_model=ApiEnvelope)
async def run_authoritative_work_packet_local_proof(
    packet_id: str,
    payload: WorkItemLocalProofRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        proof = await service.run_authoritative_local_proof(session, packet_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_local_proof", payload.correlationId).model_dump()) from exc
    if not proof:
        raise HTTPException(status_code=404, detail=error_response("Authoritative WorkPacket not found.", "authoritative_work_packet_not_found").model_dump())
    return ApiEnvelope(data=proof)


@app.post("/pipeline-control-plane/actions", response_model=ApiEnvelope)
async def apply_pipeline_operational_action(
    payload: OperationalActionRequest,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await service.apply_pipeline_operational_action(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_pipeline_operational_action", payload.correlationId).model_dump()) from exc
    return ApiEnvelope(data=result)


@app.post("/pipeline-control-plane/approvals", response_model=ApiEnvelope)
async def issue_pipeline_operational_approval(
    payload: OperationalActionApprovalRequest,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        approval = await service.issue_pipeline_operational_approval(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_pipeline_operational_approval").model_dump()) from exc
    return ApiEnvelope(data=approval)


@app.post("/pipeline-control-plane/actions/v1/capability", response_model=ApiEnvelope)
async def pipeline_operational_action_capability_v1(
    payload: OperationalActionApprovalRequestV1,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        capability = await service.pipeline_operational_action_capability_v1(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_pipeline_operational_action_v1").model_dump()) from exc
    return ApiEnvelope(data=capability)


@app.post("/pipeline-control-plane/approvals/v1", response_model=ApiEnvelope)
async def issue_pipeline_operational_approval_v1(
    payload: OperationalActionApprovalRequestV1,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        approval = await service.issue_pipeline_operational_approval_v1(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_pipeline_operational_approval_v1").model_dump()) from exc
    return ApiEnvelope(data=approval)


@app.post("/pipeline-control-plane/actions/v1", response_model=ApiEnvelope)
async def apply_pipeline_operational_action_v1(
    payload: OperationalActionRequestV1,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await service.apply_pipeline_operational_action_v1(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "invalid_pipeline_operational_action_v1", payload.correlationId).model_dump()) from exc
    return ApiEnvelope(data=result)


@app.post(
    "/manager-control-plane/terminal-events",
    response_model=ManagerTerminalEventApiEnvelope,
)
async def record_manager_terminal_event(
    payload: ManagerTerminalEventRequest,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    try:
        event = await persist_manager_terminal_event(session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "manager_terminal_event_conflict").model_dump(),
        ) from exc
    return ManagerTerminalEventApiEnvelope(data=event)


@app.post(
    "/hermes-control-plane/ledger",
    response_model=HermesOutcomeProjectionApiEnvelope,
)
async def ingest_hermes_outcome_ledger(
    payload: HermesLedgerIngestRequest,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    """Persist metadata-only lifecycle evidence; this route cannot execute delivery."""
    try:
        projection = await ingest_hermes_ledger(session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "hermes_ledger_conflict").model_dump(),
        ) from exc
    return HermesOutcomeProjectionApiEnvelope(data=projection)


@app.post("/hermes-control-plane/role-capabilities")
async def provision_hermes_role_capability_route(payload: HermesRoleCapabilityProvisionRequestV1, request: Request, session: AsyncSession = Depends(get_session)):
    await require_memory_proposal_recovery_operator(request, session)
    try:
        binding = await provision_hermes_role_capability(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "hermes_role_capability_conflict").model_dump()) from exc
    return {"capabilityBindingId": binding.capability_binding_id, "role": binding.role, "expiresAt": binding.expires_at, "metadataOnly": True, "rawPayloadRetained": False}


@app.post("/hermes-control-plane/review-handoffs", response_model=HermesOutcomeProjectionApiEnvelope)
async def ingest_hermes_review_handoff_route(payload: HermesReviewHandoffRequest, request: Request, session: AsyncSession = Depends(get_session)):
    operator = await require_memory_proposal_recovery_operator(request, session)
    operator_identity = operator.id if operator is not None else "operator:local"
    try:
        projection = await ingest_hermes_review_handoff(session, payload, operator_identity=operator_identity)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "hermes_review_handoff_conflict").model_dump()) from exc
    return HermesOutcomeProjectionApiEnvelope(data=projection)


@app.post("/hermes-control-plane/role-capabilities/{capability_binding_id}/revoke")
async def revoke_hermes_role_capability_route(capability_binding_id: str, payload: HermesRoleCapabilityRevocationRequestV1, request: Request, session: AsyncSession = Depends(get_session)):
    operator = await require_memory_proposal_recovery_operator(request, session)
    if capability_binding_id != payload.capabilityBindingId:
        raise HTTPException(status_code=409, detail=error_response("Role capability path and payload mismatch.", "hermes_role_capability_conflict").model_dump())
    if operator is not None and payload.revokedBy != operator.id:
        raise HTTPException(status_code=403, detail=error_response("Role capability revocation actor does not match the authenticated operator.", "hermes_role_capability_actor_mismatch").model_dump())
    try:
        binding = await revoke_hermes_role_capability(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "hermes_role_capability_conflict").model_dump()) from exc
    return {"capabilityBindingId": binding.capability_binding_id, "revokedAt": binding.revoked_at, "metadataOnly": True, "rawPayloadRetained": False}


@app.post(
    "/hermes-control-plane/board-events",
    response_model=HermesOutcomeProjectionApiEnvelope,
)
async def ingest_hermes_board_event(
    request: Request,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    """Verify one signed board observation; it cannot issue a delivery action."""
    try:
        projection = await hermes_board_bridge.ingest_board_lifecycle_event(
            session,
            await request.body(),
            settings.hermes_board_bridge_issuer_registry,
        )
    except hermes_board_bridge.BoardBridgeRejected as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), str(exc)).model_dump(),
        ) from exc
    return HermesOutcomeProjectionApiEnvelope(data=projection)


@app.get(
    "/hermes-control-plane/outcomes/{outcome_id}",
    response_model=HermesOutcomeProjectionApiEnvelope,
)
async def get_hermes_outcome_ledger(
    outcome_id: str,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    projection = await read_hermes_outcome(session, outcome_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail=error_response("Hermes outcome not found.", "hermes_outcome_not_found").model_dump(),
        )
    return HermesOutcomeProjectionApiEnvelope(data=projection)


@app.get(
    "/hermes-control-plane/lane-runs/{lane_run_id}",
    response_model=HermesLaneRunProjectionApiEnvelope,
)
async def get_hermes_lane_run_ledger(
    lane_run_id: str,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    projection = await read_hermes_lane_run(session, lane_run_id)
    if projection is None:
        raise HTTPException(
            status_code=404,
            detail=error_response("Hermes lane run not found.", "hermes_lane_run_not_found").model_dump(),
        )
    return HermesLaneRunProjectionApiEnvelope(data=projection)


@app.get(
    "/manager-control-plane/terminal-events/{event_id}",
    response_model=ManagerTerminalEventApiEnvelope,
)
async def read_manager_terminal_event(
    event_id: str,
    _: None = Depends(require_local_operational_boundary),
    session: AsyncSession = Depends(get_session),
):
    event = await get_manager_terminal_event(session, event_id)
    if event is None:
        raise HTTPException(
            status_code=404,
            detail=error_response(
                "Manager terminal event not found.",
                "manager_terminal_event_not_found",
            ).model_dump(),
        )
    return ManagerTerminalEventApiEnvelope(data=event)


@app.get(
    "/supervisor/terminal-event",
    response_model=SupervisorTerminalEventProjectionApiEnvelope,
    responses={503: {"model": SupervisorTerminalEventProjectionApiEnvelope}},
)
async def get_supervisor_terminal_event(
    session: AsyncSession = Depends(get_session),
):
    generated_at = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    try:
        event = await get_latest_manager_terminal_event(session)
    except (ValidationError, SQLAlchemyError, ValueError):
        projection = SupervisorTerminalEventProjectionApiEnvelope(
            data={
                "projectionId": f"supervisor-terminal-event-projection:{generated_at}",
                "generatedAt": generated_at,
                "status": "unavailable",
                "event": None,
                "owner": "supervisor",
                "metadataOnly": True,
                "rawPayloadRetained": False,
            }
        )
        return JSONResponse(status_code=503, content=projection.model_dump(mode="json"))
    return SupervisorTerminalEventProjectionApiEnvelope(
        data={
            "projectionId": f"supervisor-terminal-event-projection:{generated_at}",
            "generatedAt": generated_at,
            "status": "available" if event is not None else "empty",
            "event": event,
            "owner": "supervisor",
            "metadataOnly": True,
            "rawPayloadRetained": False,
        }
    )


@app.patch("/candidate-work/{candidate_work_id}", response_model=CandidateWorkApiEnvelope)
async def update_candidate_work(
    candidate_work_id: str,
    payload: CandidateWorkUpdate,
    session: AsyncSession = Depends(get_session),
):
    candidate = await service.update_candidate_work(session, candidate_work_id, payload)
    if not candidate:
        raise HTTPException(status_code=404, detail=error_response("Candidate work not found.", "candidate_work_not_found").model_dump())
    return CandidateWorkApiEnvelope(data=service.to_candidate_work_view(candidate))


@app.post("/candidate-work/{candidate_work_id}/promote", response_model=CandidateWorkPromotionApiEnvelope)
async def promote_candidate_work(candidate_work_id: str, session: AsyncSession = Depends(get_session)):
    try:
        promoted = await service.promote_candidate_work(session, candidate_work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "candidate_work_promotion_rejected").model_dump()) from exc
    if not promoted:
        raise HTTPException(status_code=404, detail=error_response("Candidate work not found.", "candidate_work_not_found").model_dump())
    candidate, item = promoted
    return CandidateWorkPromotionApiEnvelope(
        data={"candidateWork": service.to_candidate_work_view(candidate), "workItem": service.to_work_item_view(item)}
    )


@app.get("/work-items", response_model=WorkItemListApiEnvelope)
async def list_work_items(session: AsyncSession = Depends(get_session)):
    items = await service.list_work_items(session)
    return WorkItemListApiEnvelope(data=[service.to_work_item_view(item) for item in items])


@app.get("/execution-recipes", response_model=ExecutionRecipeListApiEnvelope)
async def list_execution_recipes():
    return ExecutionRecipeListApiEnvelope(data=service.list_execution_recipes())


@app.get("/routing/lane-profiles", response_model=RoutingLaneProfileListApiEnvelope)
async def list_routing_lane_profiles(session: AsyncSession = Depends(get_session)):
    return RoutingLaneProfileListApiEnvelope(data=await service.list_routing_lane_profiles(session))



@app.get("/routing/worker-registry", response_model=WorkerRegistryListApiEnvelope)
async def list_worker_registry():
    return WorkerRegistryListApiEnvelope(data=service.list_worker_registry())

@app.get("/work-items/{work_item_id}", response_model=WorkItemApiEnvelope)
async def get_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    items = await service.list_work_items(session)
    for item in items:
        if item.id == work_item_id:
            return WorkItemApiEnvelope(data=service.to_work_item_view(item))
    raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())


@app.get("/work-items/{work_item_id}/events", response_model=WorkflowEventApiEnvelope)
async def get_work_item_events(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    events = await service.list_work_item_events(session, work_item_id)
    return WorkflowEventApiEnvelope(data=[service.to_event_view(event) for event in events])


@app.post("/work-items/{work_item_id}/memory-proposals", response_model=ApiEnvelope)
async def create_work_item_memory_proposal(
    work_item_id: str,
    payload: MemoryProposalCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        proposal = await service.create_memory_proposal(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "memory_proposal_conflict").model_dump()) from exc
    if not proposal:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_memory_proposal_view(proposal, packet_id=f"work_item:{work_item_id}"))


@app.patch("/work-items/{work_item_id}/memory-proposals/{proposal_id}", response_model=ApiEnvelope)
async def update_work_item_memory_proposal(
    work_item_id: str,
    proposal_id: str,
    payload: MemoryProposalUpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        proposal = await service.update_memory_proposal(session, work_item_id, proposal_id, payload)
    except MemoryProposalRevisionConflict as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "memory_proposal_revision_conflict").model_dump()) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "memory_proposal_review_rejected").model_dump()) from exc
    if not proposal:
        raise HTTPException(status_code=404, detail=error_response("Memory proposal not found.", "memory_proposal_not_found").model_dump())
    # PATCH is part of the WorkItem V1 review surface. Build the persisted row
    # directly: a whole-review rebuild can include vault-backed eligibility
    # probes and otherwise outlive the proxy's short mutation response budget
    # after this update has already committed.
    return ApiEnvelope(data=service._work_item_memory_review_proposal_view(proposal))


@app.post("/work-items/{work_item_id}/memory-proposals/{proposal_id}/ai-draft", response_model=ApiEnvelope)
async def create_work_item_memory_proposal_ai_draft(
    work_item_id: str,
    proposal_id: str,
    payload: MemoryProposalAiDraftWriteRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        proposal = await service.create_memory_proposal_ai_draft(session, work_item_id, proposal_id, payload)
    except MemoryProposalRevisionConflict as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "memory_proposal_revision_conflict").model_dump()) from exc
    except ValueError as exc:
        await service.release_failed_memory_proposal_write(session, work_item_id)
        raise HTTPException(status_code=400, detail=error_response(str(exc), "memory_proposal_ai_draft_blocked").model_dump()) from exc
    except asyncio.CancelledError:
        await service.release_failed_memory_proposal_write(session, work_item_id)
        raise
    except Exception:
        await service.release_failed_memory_proposal_write(session, work_item_id)
        raise
    if not proposal:
        raise HTTPException(status_code=404, detail=error_response("Memory proposal not found.", "memory_proposal_not_found").model_dump())
    return ApiEnvelope(data=service.to_memory_proposal_view(proposal, packet_id=f"work_item:{work_item_id}"))


@app.post("/work-items/{work_item_id}/memory-proposals/{proposal_id}/recover-abandoned-write", response_model=ApiEnvelope)
async def recover_work_item_memory_proposal_write(
    work_item_id: str,
    proposal_id: str,
    payload: MemoryProposalWriteRecoveryRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    operator = await require_memory_proposal_recovery_operator(request, session)
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        proposal = await service.recover_abandoned_memory_proposal_write(
            session,
            work_item_id,
            proposal_id,
            expected_revision=payload.expectedRevision,
            recovery_ref=payload.recoveryRef,
            actor_id=operator.id if operator else None,
            actor_label="Dashboard operator" if operator else None,
        )
    except MemoryProposalRevisionConflict as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "memory_proposal_revision_conflict").model_dump()) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "memory_proposal_recovery_blocked").model_dump()) from exc
    if not proposal:
        raise HTTPException(status_code=404, detail=error_response("Memory proposal not found.", "memory_proposal_not_found").model_dump())
    return ApiEnvelope(data=service.to_memory_proposal_view(proposal, packet_id=f"work_item:{work_item_id}"))


@app.post("/work-items/{work_item_id}/memory-proposals/{proposal_id}/llm-wiki-rebuild", response_model=ApiEnvelope)
async def create_work_item_llm_wiki_rebuild(
    work_item_id: str,
    proposal_id: str,
    payload: LlmWikiDisposableRebuildWriteRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        proposal = await service.create_llm_wiki_disposable_rebuild(session, work_item_id, proposal_id, payload)
    except MemoryProposalRevisionConflict as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "memory_proposal_revision_conflict").model_dump()) from exc
    except ValueError as exc:
        await service.release_failed_memory_proposal_write(session, work_item_id)
        raise HTTPException(status_code=400, detail=error_response(str(exc), "llm_wiki_rebuild_blocked").model_dump()) from exc
    except asyncio.CancelledError:
        await service.release_failed_memory_proposal_write(session, work_item_id)
        raise
    except Exception:
        await service.release_failed_memory_proposal_write(session, work_item_id)
        raise
    if not proposal:
        raise HTTPException(status_code=404, detail=error_response("Memory proposal not found.", "memory_proposal_not_found").model_dump())
    return ApiEnvelope(data=service.to_memory_proposal_view(proposal, packet_id=f"work_item:{work_item_id}"))


@app.get("/work-items/{work_item_id}/memory-proposals/{proposal_id}/llm-wiki-artifact", response_model=LlmWikiArtifactApiEnvelope)
async def get_work_item_llm_wiki_artifact(
    work_item_id: str,
    proposal_id: str,
    query: str = "",
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        result = await service.search_llm_wiki_artifact(session, work_item_id, proposal_id, query)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_response(str(exc), "llm_wiki_artifact_read_blocked").model_dump()) from exc
    if not result:
        raise HTTPException(status_code=404, detail=error_response("Memory proposal not found.", "memory_proposal_not_found").model_dump())
    return LlmWikiArtifactApiEnvelope(data=result)


@app.get("/pipeline-control-plane/work-items/{work_item_id}/memory-review", response_model=WorkItemMemoryReviewApiEnvelope)
async def get_canonical_work_item_memory_review(work_item_id: str, session: AsyncSession = Depends(get_session)):
    review = await service.get_work_item_memory_review(session, work_item_id)
    if not review:
        raise HTTPException(status_code=404, detail=error_response("Work item memory review not found.", "work_item_memory_review_not_found").model_dump())
    return WorkItemMemoryReviewApiEnvelope(data=review)


@app.get("/work-items/{work_item_id}/execution-attempts", response_model=ExecutionAttemptApiEnvelope)
async def get_work_item_execution_attempts(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    attempts = await service.list_execution_attempts(session, work_item_id)
    return ExecutionAttemptApiEnvelope(data=attempts)


@app.get("/work-items/{work_item_id}/runtime-evidence-export", response_model=RuntimeEvidenceExportApiEnvelope)
async def get_work_item_runtime_evidence_export(work_item_id: str, session: AsyncSession = Depends(get_session)):
    export = await service.get_runtime_evidence_export(session, work_item_id)
    if not export:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return RuntimeEvidenceExportApiEnvelope(data=export)


@app.post("/work-items/{work_item_id}/execution-attempts", response_model=ApiEnvelope)
async def create_work_item_execution_attempt(
    work_item_id: str,
    payload: WorkItemExecutionAttemptCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        attempt = await service.create_execution_attempt(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_execution_attempt").model_dump()) from exc
    if not attempt:
        raise HTTPException(status_code=404, detail=error_response("Execution attempt not found.", "execution_attempt_not_found").model_dump())
    return ApiEnvelope(data=attempt)


@app.post("/pipeline-control-plane/work-packets/{packet_id}/local-proof/lease", response_model=ApiEnvelope)
async def operate_authoritative_work_packet_local_proof_lease(
    packet_id: str,
    payload: WorkItemLocalProofLeaseRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        lease = await service.operate_authoritative_local_proof_lease(session, packet_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_local_proof_lease", payload.correlationId).model_dump()) from exc
    if not lease:
        raise HTTPException(status_code=404, detail=error_response("Authoritative WorkPacket not found.", "authoritative_work_packet_not_found").model_dump())
    return ApiEnvelope(data=lease)


@app.post("/pipeline-control-plane/work-packets/{packet_id}/local-proof/replay", response_model=ApiEnvelope)
async def replay_authoritative_work_packet_local_proof(
    packet_id: str,
    session: AsyncSession = Depends(get_session),
):
    try:
        replay = await service.rebuild_authoritative_local_proof_projection(session, packet_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_local_proof_replay").model_dump()) from exc
    if not replay:
        raise HTTPException(status_code=404, detail=error_response("Authoritative WorkPacket not found.", "authoritative_work_packet_not_found").model_dump())
    return ApiEnvelope(data=replay)


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


@app.post("/work-items/{work_item_id}/supervised-codex-launch", response_model=ApiEnvelope)
async def launch_supervised_codex_worker(
    work_item_id: str,
    payload: WorkItemSupervisedCodexLaunchRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        attempt = await service.launch_supervised_codex_worker(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_supervised_codex_launch").model_dump()) from exc
    if not attempt:
        raise HTTPException(status_code=404, detail=error_response("Execution attempt not found.", "execution_attempt_not_found").model_dump())
    return ApiEnvelope(data=attempt)


@app.post("/work-items/{work_item_id}/execution-attempts/{attempt_id}/verification-evidence", response_model=ApiEnvelope)
async def record_work_item_execution_attempt_verification_evidence(
    work_item_id: str,
    attempt_id: str,
    payload: WorkItemVerificationEvidenceRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        attempt = await service.record_execution_attempt_verification_evidence(session, work_item_id, attempt_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_verification_evidence").model_dump()) from exc
    if not attempt:
        raise HTTPException(status_code=404, detail=error_response("Execution attempt not found.", "execution_attempt_not_found").model_dump())
    return ApiEnvelope(data=attempt)


@app.get("/work-items/{work_item_id}/recipe-gate-audit", response_model=WorkItemRecipeGateAuditApiEnvelope)
async def get_work_item_recipe_gate_audit(work_item_id: str, session: AsyncSession = Depends(get_session)):
    audit = await service.get_recipe_gate_audit(session, work_item_id)
    if not audit:
        raise HTTPException(status_code=404, detail=error_response("Recipe gate audit not found.", "recipe_gate_audit_not_found").model_dump())
    return WorkItemRecipeGateAuditApiEnvelope(data=audit)


@app.get("/work-items/{work_item_id}/routing-preview", response_model=RoutingPreviewApiEnvelope)
async def get_work_item_routing_preview(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    preview = await service.get_routing_preview(session, work_item_id)
    if not preview:
        raise HTTPException(status_code=404, detail=error_response("Routing preview not found.", "routing_preview_not_found").model_dump())
    return RoutingPreviewApiEnvelope(data=preview)


@app.get("/work-items/{work_item_id}/task-packet-preview", response_model=TaskPacketPreviewApiEnvelope)
async def get_work_item_task_packet_preview(work_item_id: str, session: AsyncSession = Depends(get_session)):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    preview = await service.get_task_packet_preview(session, work_item_id)
    if not preview:
        raise HTTPException(status_code=404, detail=error_response("Task packet preview not found.", "task_packet_preview_not_found").model_dump())
    return TaskPacketPreviewApiEnvelope(data=preview)


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


@app.get("/work-items/{work_item_id}/local-evidence-packet", response_model=LocalEvidencePacketApiEnvelope)
async def get_work_item_local_evidence_packet(work_item_id: str, session: AsyncSession = Depends(get_session)):
    packet = await service.get_local_evidence_packet(session, work_item_id)
    if not packet:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return LocalEvidencePacketApiEnvelope(data=packet)


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

@app.post("/work-items/{work_item_id}/subscription-agent-launch", response_model=ApiEnvelope)
async def create_work_item_subscription_agent_launch(
    work_item_id: str,
    payload: WorkItemSubscriptionAgentLaunchRequest,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    try:
        launch = await service.evaluate_subscription_agent_launch_request(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_subscription_agent_launch").model_dump()) from exc
    if not launch:
        raise HTTPException(status_code=404, detail=error_response("Subscription agent launch request not found.", "subscription_agent_launch_not_found").model_dump())
    return ApiEnvelope(data=launch)

@app.post("/work-items/{work_item_id}/prepare-branch", response_model=WorkItemApiEnvelope)
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
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.get("/work-items/{work_item_id}/local-worktree-plan", response_model=LocalWorktreePlanApiEnvelope)
async def get_work_item_local_worktree_plan(work_item_id: str, session: AsyncSession = Depends(get_session)):
    try:
        plan = await service.get_local_worktree_plan(session, work_item_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "invalid_local_worktree_plan").model_dump(),
        ) from exc
    if not plan:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return LocalWorktreePlanApiEnvelope(data=plan)


@app.post("/work-items/{work_item_id}/retry", response_model=WorkItemApiEnvelope)
async def retry_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    try:
        item = await service.retry_item(session, work_item_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "work_item_retry_blocked").model_dump()) from exc
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/actions", response_model=WorkItemApiEnvelope)
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
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/managed-next-action", response_model=WorkItemApiEnvelope)
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
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/delivery-readiness", response_model=WorkItemApiEnvelope)
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
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/assignment", response_model=WorkItemApiEnvelope)
async def assign_work_item(
    work_item_id: str,
    payload: WorkItemAssignmentRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        item = await service.assign_work_item(
            session,
            work_item_id,
            payload.assigneeId,
            payload.assigneeLabel,
            payload.actorId,
            payload.actorLabel,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=error_response(str(exc), "legacy_assignment_disabled_use_canonical_reassign_v1").model_dump(),
        ) from exc
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.post("/work-items/{work_item_id}/escalation", response_model=WorkItemApiEnvelope)
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
    return WorkItemApiEnvelope(data=service.to_work_item_view(item))


@app.get("/supervisor/status", response_model=RunStatusApiEnvelope)
async def get_status(session: AsyncSession = Depends(get_session)):
    return RunStatusApiEnvelope(data=await service.get_status(session))


@app.get("/supervisor/execution-configuration-checks", response_model=ExecutionConfigurationChecksApiEnvelope)
async def get_execution_configuration_checks():
    return ExecutionConfigurationChecksApiEnvelope(data=service.get_execution_configuration_checks())


@app.get("/supervisor/execution-readiness-report", response_model=ExecutionReadinessReportApiEnvelope)
async def get_execution_readiness_report(session: AsyncSession = Depends(get_session)):
    return ExecutionReadinessReportApiEnvelope(data=await service.get_execution_readiness_report(session))


@app.get("/supervisor/documentation-authority-report", response_model=DocumentationAuthorityReportApiEnvelope)
async def get_documentation_authority_report():
    return DocumentationAuthorityReportApiEnvelope(data=service.get_documentation_authority_report())


@app.get("/supervisor/legacy-planning-artifact-inventory", response_model=LegacyPlanningArtifactInventoryApiEnvelope)
async def get_legacy_planning_artifact_inventory_report():
    return LegacyPlanningArtifactInventoryApiEnvelope(data=service.get_legacy_planning_artifact_inventory_report())


@app.get("/supervisor/verification-readiness-report", response_model=VerificationReadinessReportApiEnvelope)
async def get_verification_readiness_report():
    return VerificationReadinessReportApiEnvelope(data=service.get_verification_readiness_report())


@app.get("/supervisor/authority-readiness-matrix-report", response_model=AuthorityReadinessMatrixReportApiEnvelope)
async def get_authority_readiness_matrix_report():
    return AuthorityReadinessMatrixReportApiEnvelope(data=service.get_authority_readiness_matrix_report())


@app.get("/supervisor/dashboard-e2e-report", response_model=DashboardE2EReportApiEnvelope)
async def get_dashboard_e2e_report():
    return DashboardE2EReportApiEnvelope(data=service.get_dashboard_e2e_report())


@app.get("/supervisor/report-catalog", response_model=SupervisorReportCatalogApiEnvelope)
async def get_supervisor_report_catalog():
    return SupervisorReportCatalogApiEnvelope(data=service.get_supervisor_report_catalog())


@app.get("/supervisor/maintenance-readiness-report", response_model=MaintenanceReadinessReportApiEnvelope)
async def get_maintenance_readiness_report():
    return MaintenanceReadinessReportApiEnvelope(data=service.get_maintenance_readiness_report())


@app.get("/supervisor/maintenance-action-plan-report", response_model=MaintenanceActionPlanReportApiEnvelope)
async def get_maintenance_action_plan_report():
    return MaintenanceActionPlanReportApiEnvelope(data=service.get_maintenance_action_plan_report())


@app.get("/supervisor/safe-development-backlog", response_model=SafeDevelopmentBacklogReportApiEnvelope)
async def get_safe_development_backlog_report():
    return SafeDevelopmentBacklogReportApiEnvelope(data=service.get_safe_development_backlog_report())


@app.get("/supervisor/runner-assignment-status-report", response_model=RunnerAssignmentStatusReportApiEnvelope)
async def get_runner_assignment_status_report():
    return RunnerAssignmentStatusReportApiEnvelope(data=service.get_runner_assignment_status_report())


@app.get("/supervisor/development-runway-report", response_model=DevelopmentRunwayReportApiEnvelope)
async def get_development_runway_report():
    return DevelopmentRunwayReportApiEnvelope(data=service.get_development_runway_report())


@app.get("/supervisor/runtime-evidence-review-report", response_model=RuntimeEvidenceReviewReportApiEnvelope)
async def get_runtime_evidence_review_report(session: AsyncSession = Depends(get_session)):
    return RuntimeEvidenceReviewReportApiEnvelope(data=await service.get_runtime_evidence_review_report(session))


@app.get("/supervisor/managed-recipe-policy-report", response_model=ManagedRecipePolicyReportApiEnvelope)
async def get_managed_recipe_policy_report():
    return ManagedRecipePolicyReportApiEnvelope(data=service.get_managed_recipe_policy_report())


@app.get("/supervisor/github-workflow-policy-report", response_model=GitHubWorkflowPolicyReportApiEnvelope)
async def get_github_workflow_policy_report():
    return GitHubWorkflowPolicyReportApiEnvelope(data=service.get_github_workflow_policy_report())


@app.get("/supervisor/git-hygiene-report", response_model=GitHygieneReportApiEnvelope)
async def get_git_hygiene_report():
    return GitHygieneReportApiEnvelope(data=service.get_git_hygiene_report())


@app.get("/supervisor/codex-readiness-report", response_model=CodexReadinessReportApiEnvelope)
async def get_codex_readiness_report():
    return CodexReadinessReportApiEnvelope(data=service.get_codex_readiness_report())


@app.get("/supervisor/codex-implementation-approval-report", response_model=CodexImplementationApprovalReportApiEnvelope)
async def get_codex_implementation_approval_report():
    return CodexImplementationApprovalReportApiEnvelope(data=service.get_codex_implementation_approval_report())


@app.get("/supervisor/claude-review-readiness-report", response_model=ClaudeReviewReadinessReportApiEnvelope)
async def get_claude_review_readiness_report():
    return ClaudeReviewReadinessReportApiEnvelope(data=service.get_claude_review_readiness_report())


@app.get("/supervisor/claude-review-approval-report", response_model=ClaudeReviewApprovalReportApiEnvelope)
async def get_claude_review_approval_report():
    return ClaudeReviewApprovalReportApiEnvelope(data=service.get_claude_review_approval_report())


@app.get("/supervisor/review-resource-policy-report", response_model=ReviewResourcePolicyReportApiEnvelope)
async def get_review_resource_policy_report():
    return ReviewResourcePolicyReportApiEnvelope(data=service.get_review_resource_policy_report())


@app.get("/supervisor/github-delivery-authority-report", response_model=GitHubDeliveryAuthorityReportApiEnvelope)
async def get_github_delivery_authority_report():
    return GitHubDeliveryAuthorityReportApiEnvelope(data=service.get_github_delivery_authority_report())


@app.get("/supervisor/trusted-delivery-eligibility-report", response_model=TrustedDeliveryEligibilityReportApiEnvelope)
async def get_trusted_delivery_eligibility_report():
    return TrustedDeliveryEligibilityReportApiEnvelope(data=await service.get_trusted_delivery_eligibility_report())


@app.get(
    "/work-items/{work_item_id}/trusted-delivery-eligibility-report",
    response_model=TrustedDeliveryEligibilityReportApiEnvelope,
)
async def get_work_item_trusted_delivery_eligibility_report(
    work_item_id: str,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return TrustedDeliveryEligibilityReportApiEnvelope(
        data=await service.get_trusted_delivery_eligibility_report(session, work_item_id=work_item_id)
    )


@app.get("/supervisor/low-risk-delivery-plan", response_model=LowRiskDeliveryPlanReportApiEnvelope)
async def get_low_risk_delivery_plan():
    return LowRiskDeliveryPlanReportApiEnvelope(data=await service.get_low_risk_delivery_plan_report())


@app.get("/work-items/{work_item_id}/low-risk-delivery-plan", response_model=LowRiskDeliveryPlanReportApiEnvelope)
async def get_work_item_low_risk_delivery_plan(
    work_item_id: str,
    session: AsyncSession = Depends(get_session),
):
    work_item = await session.get(WorkItem, work_item_id)
    if not work_item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return LowRiskDeliveryPlanReportApiEnvelope(data=await service.get_low_risk_delivery_plan_report(session, work_item_id=work_item_id))


@app.get("/work-items/{work_item_id}/cleanup-plan", response_model=CleanupPlanApiEnvelope)
async def get_work_item_cleanup_plan(
    work_item_id: str,
    session: AsyncSession = Depends(get_session),
):
    plan = await service.get_cleanup_plan(session, work_item_id)
    if plan is None:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return CleanupPlanApiEnvelope(data=plan)


@app.post("/work-items/{work_item_id}/delivery-execution-evidence", response_model=DeliveryExecutionEvidenceApiEnvelope)
async def record_work_item_delivery_execution_evidence(
    work_item_id: str,
    payload: DeliveryExecutionEvidencePayload,
    session: AsyncSession = Depends(get_session),
):
    try:
        evidence = await service.record_delivery_execution_evidence(session, work_item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=error_response(str(exc), "invalid_delivery_execution_evidence").model_dump())
    if evidence is None:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return DeliveryExecutionEvidenceApiEnvelope(data=evidence)


@app.get("/supervisor/local-cleanup-readiness-report", response_model=LocalCleanupReadinessReportApiEnvelope)
async def get_local_cleanup_readiness_report():
    return LocalCleanupReadinessReportApiEnvelope(data=service.get_local_cleanup_readiness_report())


@app.get("/supervisor/remote-cleanup-sync-readiness-report", response_model=RemoteCleanupSyncReadinessReportApiEnvelope)
async def get_remote_cleanup_sync_readiness_report():
    return RemoteCleanupSyncReadinessReportApiEnvelope(data=service.get_remote_cleanup_sync_readiness_report())


@app.get(
    "/supervisor/trusted-autonomy-readiness-report",
    response_model=TrustedAutonomyReadinessReportApiEnvelope,
)
async def get_trusted_autonomy_readiness_report():
    return TrustedAutonomyReadinessReportApiEnvelope(
        data=service.get_trusted_autonomy_readiness_report()
    )


@app.get(
    "/supervisor/epic-6-mvp-proof-trial-report",
    response_model=MvpProofTrialReportApiEnvelope,
)
async def get_epic_6_mvp_proof_trial_report():
    return MvpProofTrialReportApiEnvelope(
        data=service.get_epic_6_mvp_proof_trial_report()
    )


@app.get("/supervisor/delivery-readiness-policy-report", response_model=DeliveryReadinessPolicyReportApiEnvelope)
async def get_delivery_readiness_policy_report():
    return DeliveryReadinessPolicyReportApiEnvelope(data=service.get_delivery_readiness_policy_report())


@app.get(
    "/supervisor/disabled-provider-proofs",
    response_model=DisabledProviderProofListApiEnvelope,
)
async def list_disabled_provider_proofs():
    return DisabledProviderProofListApiEnvelope(data=service.list_disabled_provider_proofs())


@app.get("/supervisor/execution-state-boundary", response_model=ExecutionStateBoundaryApiEnvelope)
async def get_execution_state_boundary():
    return ExecutionStateBoundaryApiEnvelope(data=service.get_execution_state_boundary())


@app.get("/supervisor/threat-boundary", response_model=ThreatBoundaryApiEnvelope)
async def get_threat_boundary():
    return ThreatBoundaryApiEnvelope(data=service.get_threat_boundary())


def _legacy_mode_control_rejected() -> None:
    raise HTTPException(
        status_code=410,
        detail={
            "error": {
                "code": "deprecated_runtime_control",
                "message": "Legacy supervisor mode controls are unavailable; use the server-bound pipeline operational-action v1 approval/apply path.",
            }
        },
    )


@app.post("/supervisor/enable", response_model=ApiEnvelope)
async def enable():
    _legacy_mode_control_rejected()


@app.post("/supervisor/pause", response_model=ApiEnvelope)
async def pause():
    _legacy_mode_control_rejected()


@app.post("/supervisor/drain", response_model=ApiEnvelope)
async def drain():
    _legacy_mode_control_rejected()


@app.post("/supervisor/disable", response_model=ApiEnvelope)
async def disable():
    _legacy_mode_control_rejected()


@app.get("/audit-events", response_model=AuditEventApiEnvelope)
async def list_audit_events(session: AsyncSession = Depends(get_session)):
    audits = await service.list_audit_events(session)
    return AuditEventApiEnvelope(data=[service.to_audit_view(audit) for audit in audits])


@app.get("/operator-views", response_model=OperatorViewListApiEnvelope)
async def list_operator_views(scope: WorkItemFilterScope | None = None, session: AsyncSession = Depends(get_session)):
    views = await service.list_operator_views(session, scope)
    return OperatorViewListApiEnvelope(data=[service.to_operator_view(view) for view in views])


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
    container_bind = os.environ.get("SUPERVISOR_CONTAINER_MODE") == "true" and os.environ.get("SUPERVISOR_HOST") == "0.0.0.0"
    kwargs = {"host": "0.0.0.0" if container_bind else "127.0.0.1", "port": settings.supervisor_port, "reload": os.environ.get("SUPERVISOR_RELOAD") == "true"}
    if settings.enable_local_dogfood_attestation and not settings.lan_auth_enabled:
        settings.validate_local_dogfood_attestation_deployment()
        raise LanAuthConfigurationError(
            "Local dogfood attestation requires LAN-auth private UDS mode; refusing to replace the normal dashboard TCP listener. "
            "Disable SUPERVISOR_ENABLE_LOCAL_DOGFOOD_ATTESTATION for the normal loopback profile."
        )
    if settings.lan_auth_enabled:
        if not settings.supervisor_uds_path:
            raise LanAuthConfigurationError("LAN auth supervisor UDS configuration is missing.")
        kwargs["uds"] = str(prepare_private_uds_path(settings.supervisor_uds_path))
        settings.supervisor_transport = "private_uds"
    uvicorn.run("supervisor.api.main:app", **kwargs)


if __name__ == "__main__":
    main()


async def process_once_for_tests() -> None:
    from supervisor.infrastructure.db.database import SessionLocal

    async with SessionLocal() as session:
        await service.process_once(session)
