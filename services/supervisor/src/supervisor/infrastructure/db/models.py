import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from supervisor.domain.types import AuditMode, CandidateWorkPriority, CandidateWorkStatus, BmadLane, ExecutionAttemptStatus, RiskLevel, RunMode, WorkflowState
from supervisor.infrastructure.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DashboardOperator(Base):
    """One of the two fixed dashboard principals; plaintext credentials never persist."""

    __tablename__ = "dashboard_operators"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role: Mapped[str] = mapped_column(String(32), unique=True, default="operator")
    password_hash: Mapped[str] = mapped_column(Text)
    password_policy_version: Mapped[str] = mapped_column(String(32), default="argon2id/v1")
    # `operator` remains enabled by the bootstrap lifecycle. `test_viewer` is
    # created only by the private-UDS lifecycle and is inactive by default.
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DashboardSession(Base):
    """Opaque server-side operator session; raw token/CSRF values never persist."""

    __tablename__ = "dashboard_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operator_id: Mapped[str] = mapped_column(ForeignKey("dashboard_operators.id"), index=True)
    # Uniqueness is installed by the dialect-specific startup migration so
    # legacy tables receive the same invariant as fresh databases.
    token_hash: Mapped[str] = mapped_column(String(64))
    csrf_token_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DashboardLoginRateLimit(Base):
    """Metadata-only login abuse state keyed by source IP or operator account."""

    __tablename__ = "dashboard_login_rate_limits"

    dimension_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DashboardLoginCsrfChallenge(Base):
    """Short-lived pre-auth synchronizer challenge; only its hash persists."""

    __tablename__ = "dashboard_login_csrf_challenges"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DashboardAuditEvent(Base):
    """Metadata-only auth audit record; no credentials, hashes, cookies or tokens."""

    __tablename__ = "dashboard_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(48))
    outcome: Mapped[str] = mapped_column(String(32))
    correlation_id: Mapped[str] = mapped_column(String(36), index=True, default=lambda: str(uuid.uuid4()))
    target_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    policy_version: Mapped[str] = mapped_column(String(32), default="epic-26-auth/v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkItem(Base):
    __tablename__ = "work_items"
    __table_args__ = (UniqueConstraint("authoritative_packet_id", name="uq_work_items_authoritative_packet"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255))
    requested_outcome: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(255))
    authoritative_packet_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(16), default=RiskLevel.LOW.value)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String(32), default=WorkflowState.QUEUED.value)
    lane: Mapped[str | None] = mapped_column(String(32), nullable=True)
    assignee_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assignee_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalated_by_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    escalated_by_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status_summary: Mapped[str] = mapped_column(Text, default="")
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_step: Mapped[str | None] = mapped_column(String(255), nullable=True)
    requires_audit: Mapped[bool] = mapped_column(Boolean, default=False)
    audit_mode: Mapped[str] = mapped_column(String(16), default=AuditMode.NONE.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    last_event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    events: Mapped[list["WorkflowEvent"]] = relationship(back_populates="work_item", cascade="all, delete-orphan")
    leases: Mapped[list["QueueLease"]] = relationship(back_populates="work_item", cascade="all, delete-orphan")
    execution_attempts: Mapped[list["ExecutionAttempt"]] = relationship(back_populates="work_item", cascade="all, delete-orphan")
    audits: Mapped[list["AuditEvent"]] = relationship(back_populates="work_item", cascade="all, delete-orphan")
    memory_proposals: Mapped[list["MemoryProposal"]] = relationship(back_populates="work_item", cascade="all, delete-orphan")


class CandidateWork(Base):
    __tablename__ = "candidate_work"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255))
    requested_outcome: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(64))
    source_artifact_path: Mapped[str] = mapped_column(Text)
    source_artifact_type: Mapped[str] = mapped_column(String(64))
    risk_level: Mapped[str] = mapped_column(String(16), default=RiskLevel.LOW.value)
    priority: Mapped[str] = mapped_column(String(16), default=CandidateWorkPriority.NORMAL.value)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    import_metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default=CandidateWorkStatus.PROPOSED.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    promoted_work_item_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class WorkflowEvent(Base):
    __tablename__ = "workflow_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    event_type: Mapped[str] = mapped_column(String(80))
    actor_type: Mapped[str] = mapped_column(String(50), default="system")
    actor_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actor_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(36), default=lambda: str(uuid.uuid4()))
    summary: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    work_item: Mapped[WorkItem] = relationship(back_populates="events")


class AuthoritativeWorkPacket(Base):
    __tablename__ = "authoritative_work_packets"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    current_stage: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    truth_label: Mapped[str] = mapped_column(String(32), default="source_owned")
    source_ref_json: Mapped[dict] = mapped_column(JSON, default=dict)
    parent_packet_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lineage_kind: Mapped[str] = mapped_column(String(32), default="root")
    ready_to_test_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    operator_test_state: Mapped[str] = mapped_column(String(24), default="not_ready")
    operator_test_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_event_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    lifecycle_events: Mapped[list["AuthoritativeWorkPacketLifecycleEvent"]] = relationship(
        back_populates="packet",
        cascade="all, delete-orphan",
        order_by="AuthoritativeWorkPacketLifecycleEvent.occurred_at",
    )


class LocalDogfoodAuthorization(Base):
    """Local-only, server-owned receipt authorization; never a live-evidence record."""

    __tablename__ = "local_dogfood_attestation_authorizations"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    issuer_id: Mapped[str] = mapped_column(String(120))
    key_id: Mapped[str] = mapped_column(String(120))
    public_key_b64: Mapped[str] = mapped_column(String(120))
    packet_schema: Mapped[str] = mapped_column(String(160))
    target_ref: Mapped[str] = mapped_column(String(200))
    source_revision: Mapped[str] = mapped_column(String(80))
    source_refs: Mapped[str] = mapped_column(String(512), default="[]")
    evidence_digest: Mapped[str] = mapped_column(String(80))
    evidence_refs: Mapped[str] = mapped_column(String(512), default="[]")
    run_id: Mapped[str] = mapped_column(String(80))
    attempt_id: Mapped[str] = mapped_column(String(80))
    policy_version: Mapped[str] = mapped_column(String(64), default="local-dogfood/v1")
    retention_policy: Mapped[str] = mapped_column(String(64), default="metadata_only")
    observer_id: Mapped[str] = mapped_column(String(120), default="local_unix_observer/v1")
    environment: Mapped[str] = mapped_column(String(32), default="local_dogfood")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    observation_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    observation_state: Mapped[str] = mapped_column(String(24), default="ready")
    observation_receipt_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    accepted_receipt_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    observation_lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LocalDogfoodReplayFence(Base):
    __tablename__ = "local_dogfood_attestation_replay_fences"
    __table_args__ = (UniqueConstraint("fence_kind", "value", name="uq_local_dogfood_attestation_fence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    authorization_id: Mapped[str] = mapped_column(ForeignKey("local_dogfood_attestation_authorizations.id"))
    fence_kind: Mapped[str] = mapped_column(String(16))
    value: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LocalDogfoodReceiptDecision(Base):
    __tablename__ = "local_dogfood_attestation_receipt_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    authorization_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    receipt_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    issuer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    key_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    rejection_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    evidence_class: Mapped[str] = mapped_column(String(32), default="integrated_local")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthoritativeWorkPacketLifecycleEvent(Base):
    __tablename__ = "authoritative_work_packet_lifecycle_events"
    __table_args__ = (UniqueConstraint("packet_id", "idempotency_key", name="uq_authoritative_work_packet_event_idempotency"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    packet_id: Mapped[str] = mapped_column(ForeignKey("authoritative_work_packets.id"))
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    event_type: Mapped[str] = mapped_column(String(64))
    previous_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_stage: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    truth_label: Mapped[str] = mapped_column(String(32), default="source_owned")
    source_ref_json: Mapped[dict] = mapped_column(JSON, default=dict)
    actor_json: Mapped[dict] = mapped_column(JSON, default=dict)
    correlation_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    causation_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    packet_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    parent_packet_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lineage_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ready_to_test_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    operator_test_state: Mapped[str | None] = mapped_column(String(24), nullable=True)
    operator_test_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    parallel_work_graph_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    payload_summary: Mapped[str] = mapped_column(Text, default="")
    evidence_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    packet: Mapped[AuthoritativeWorkPacket] = relationship(back_populates="lifecycle_events")


class OperationalActionRecord(Base):
    __tablename__ = "pipeline_operational_action_records"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_pipeline_operational_action_idempotency"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    schema_version: Mapped[str] = mapped_column(String(64), default="pipeline-operational-action/v0")
    packet_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action_id: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(120))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    correlation_id: Mapped[str] = mapped_column(String(120))
    actor_json: Mapped[dict] = mapped_column(JSON, default=dict)
    requested_authority_state: Mapped[str] = mapped_column(String(40))
    requested_risk_tier: Mapped[str] = mapped_column(String(16))
    expected_current_event_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action_context_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    action_context_digest_sha256: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approval_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    outcome: Mapped[str] = mapped_column(String(16))
    resulting_stage: Mapped[str] = mapped_column(String(32))
    resulting_status: Mapped[str] = mapped_column(String(32))
    capability_state: Mapped[str] = mapped_column(String(16))
    authority_state: Mapped[str] = mapped_column(String(40))
    typed_reason: Mapped[str | None] = mapped_column(String(48), nullable=True)
    child_packet_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    success_evidence_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    operator_intent_summary: Mapped[str] = mapped_column(Text, default="")
    test_result: Mapped[str | None] = mapped_column(String(16), nullable=True)
    test_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OperationalActionApprovalRecord(Base):
    __tablename__ = "pipeline_operational_approvals"

    approval_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    schema_version: Mapped[str] = mapped_column(String(64), default="pipeline-operational-action/v0")
    action_id: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(120))
    requested_actor_json: Mapped[dict] = mapped_column(JSON, default=dict)
    requested_authority_family: Mapped[str] = mapped_column(String(40))
    requested_risk_tier: Mapped[str] = mapped_column(String(16))
    expected_current_event_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action_context_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    action_context_digest_sha256: Mapped[str | None] = mapped_column(String(80), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_action_idempotency_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    consumed_action_record_id: Mapped[str | None] = mapped_column(String(80), nullable=True)


class VerificationRetryIntent(Base):
    """Metadata-only verification queue intent; never an execution/launch record."""

    __tablename__ = "verification_retry_intents"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_verification_retry_intent_idempotency"),
        Index(
            "uq_verification_retry_intents_pending_work_item",
            "work_item_id",
            unique=True,
            sqlite_where=text("status = 'pending'"),
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    original_attempt_id: Mapped[str] = mapped_column(ForeignKey("execution_attempts.id"))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    packet_id: Mapped[str] = mapped_column(ForeignKey("authoritative_work_packets.id"))
    status: Mapped[str] = mapped_column(String(24), default="pending")
    idempotency_key: Mapped[str] = mapped_column(String(160))
    correlation_id: Mapped[str] = mapped_column(String(120))
    approval_id: Mapped[str] = mapped_column(String(120))
    actor_json: Mapped[dict] = mapped_column(JSON, default=dict)
    source_ref_json: Mapped[dict] = mapped_column(JSON, default=dict)
    evidence_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    expected_lease_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    expected_lease_fencing_token: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_or_worker_launched: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdmissionLock(Base):
    """Durable singleton authority for cross-process Execute admission."""

    __tablename__ = "admission_locks"

    scope: Mapped[str] = mapped_column(String(32), primary_key=True)
    generation: Mapped[int] = mapped_column(Integer, default=0)


class ExecutionAttempt(Base):
    __tablename__ = "execution_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    queue_lease_id: Mapped[str | None] = mapped_column(ForeignKey("queue_leases.id"), nullable=True)
    queue_fencing_token: Mapped[int | None] = mapped_column(Integer, nullable=True)
    route_decision_id: Mapped[str] = mapped_column(String(255))
    worker_id: Mapped[str] = mapped_column(String(120))
    lane: Mapped[str] = mapped_column(String(64))
    authority_mode: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default=ExecutionAttemptStatus.PLANNED.value)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    launch_fence_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    launch_claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_by_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    requested_by_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace_isolation_plan_json: Mapped[dict] = mapped_column(JSON, default=dict)
    artifact_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    event_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timeout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    work_item: Mapped[WorkItem] = relationship(back_populates="execution_attempts")

class QueueLease(Base):
    __tablename__ = "queue_leases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    attempt_count: Mapped[int] = mapped_column(Integer, default=1)
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lease_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    fencing_token: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    work_item: Mapped[WorkItem] = relationship(back_populates="leases")


class QueueLeaseAction(Base):
    __tablename__ = "queue_lease_actions"
    __table_args__ = (UniqueConstraint("lease_id", "idempotency_key", name="uq_queue_lease_action_idempotency"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lease_id: Mapped[str] = mapped_column(ForeignKey("queue_leases.id"))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    operation: Mapped[str] = mapped_column(String(32))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    correlation_id: Mapped[str] = mapped_column(String(120))
    fencing_token: Mapped[int] = mapped_column(Integer)
    provided_fencing_token: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outcome: Mapped[str] = mapped_column(String(16), default="accepted")
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    reason: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(16))
    outcome: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    work_item: Mapped[WorkItem] = relationship(back_populates="audits")


class MemoryProposal(Base):
    __tablename__ = "memory_proposals"
    __table_args__ = (UniqueConstraint("work_item_id", "proposal_id", name="uq_memory_proposals_work_item_proposal"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    proposal_id: Mapped[str] = mapped_column(String(120))
    label: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="pending_human_approval")
    summary: Mapped[str] = mapped_column(Text)
    source_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    evidence_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    target_ref_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    target_vault_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_vault_folder: Mapped[str] = mapped_column(Text)
    proposal_type: Mapped[str] = mapped_column(String(32))
    suggested_content_summary: Mapped[str] = mapped_column(Text)
    patch_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    sensitivity: Mapped[str] = mapped_column(String(16))
    freshness: Mapped[str] = mapped_column(String(16))
    contradiction_status: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[str] = mapped_column(String(16))
    operator_action: Mapped[str] = mapped_column(String(16))
    decision_needed_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    backup_recovery_path: Mapped[str] = mapped_column(Text)
    write_back_status: Mapped[str] = mapped_column(String(32))
    write_back_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    work_item: Mapped[WorkItem] = relationship(back_populates="memory_proposals")


# This is a wholly separate lifecycle plane.  It deliberately has no relation
# to WorkItem, MemoryProposal, ExecutionAttempt, QueueLease, or their events.
# The absence of free-form JSON/Text columns is intentional: content belongs
# to a future private store and must never enter lifecycle persistence.
class MemoryInboxSource(Base):
    __tablename__ = "memory_inbox_sources"
    __table_args__ = (
        CheckConstraint("current_revision > 0", name="ck_memory_inbox_source_positive_revision"),
        CheckConstraint(
            "lifecycle_state IN ('Scanning','Quarantined','Unprocessed','Draft','AwaitingAuthorization','Processing','Review','Returned','DeniedRetained','DeletePending','Deleted','RejectedUnsafe')",
            name="ck_memory_inbox_source_state",
        ),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    current_revision: Mapped[int] = mapped_column(Integer, default=1)
    lifecycle_state: Mapped[str] = mapped_column(String(32), default="Scanning")
    retention_deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deletion_state: Mapped[str] = mapped_column(String(16), default="None")
    policy_ref: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemoryInboxSourceRevision(Base):
    __tablename__ = "memory_inbox_source_revisions"
    __table_args__ = (
        UniqueConstraint("source_id", "revision", name="uq_memory_inbox_source_revision"),
        CheckConstraint("revision > 0", name="ck_memory_inbox_source_revision_positive"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_sources.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    lifecycle_state: Mapped[str] = mapped_column(String(32))
    actor_ref: Mapped[str] = mapped_column(String(160))
    audit_ref: Mapped[str] = mapped_column(String(160))
    policy_ref: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryInboxProposalAggregate(Base):
    __tablename__ = "memory_inbox_proposals"
    __table_args__ = (
        CheckConstraint("current_revision > 0", name="ck_memory_inbox_proposal_positive_revision"),
        CheckConstraint("lifecycle_state IN ('Absent','Draft','Ready','Returned','Denied','Approved')", name="ck_memory_inbox_proposal_state"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_sources.id"), index=True)
    current_revision: Mapped[int] = mapped_column(Integer, default=1)
    lifecycle_state: Mapped[str] = mapped_column(String(16), default="Absent")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemoryInboxProposalRevision(Base):
    __tablename__ = "memory_inbox_proposal_revisions"
    __table_args__ = (
        UniqueConstraint("proposal_id", "revision", name="uq_memory_inbox_proposal_revision"),
        CheckConstraint("revision > 0", name="ck_memory_inbox_proposal_revision_positive"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_proposals.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    lifecycle_state: Mapped[str] = mapped_column(String(16))
    actor_ref: Mapped[str] = mapped_column(String(160))
    audit_ref: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryInboxCommandResult(Base):
    __tablename__ = "memory_inbox_command_results"
    __table_args__ = (
        UniqueConstraint("aggregate_id", "idempotency_key", name="uq_memory_inbox_command_replay"),
        CheckConstraint("expected_revision > 0", name="ck_memory_inbox_command_positive_revision"),
        CheckConstraint("resulting_revision > 0", name="ck_memory_inbox_command_positive_result"),
        CheckConstraint("outcome IN ('accepted','replayed','conflict','rejected')", name="ck_memory_inbox_command_outcome"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    aggregate_id: Mapped[str] = mapped_column(String(80), index=True)
    expected_revision: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str] = mapped_column(String(160))
    command_kind: Mapped[str] = mapped_column(String(48))
    request_digest: Mapped[str] = mapped_column(String(128))
    outcome: Mapped[str] = mapped_column(String(16))
    reason_code: Mapped[str] = mapped_column(String(64))
    resulting_revision: Mapped[int] = mapped_column(Integer)
    actor_ref: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryInboxManifest(Base):
    __tablename__ = "memory_inbox_manifests"
    __table_args__ = (UniqueConstraint("owner_revision_id", "copy_class", name="uq_memory_inbox_manifest_copy"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_revision_id: Mapped[str] = mapped_column(String(80), index=True)
    copy_class: Mapped[str] = mapped_column(String(32))
    store_ref: Mapped[str] = mapped_column(String(200), unique=True)
    declared_media_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    inspected_media_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    creation_state: Mapped[str] = mapped_column(String(16), default="Planned")
    retention_class: Mapped[str] = mapped_column(String(32))
    deletion_state: Mapped[str] = mapped_column(String(16), default="None")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MemoryInboxProcessingAttempt(Base):
    __tablename__ = "memory_inbox_processing_attempts"
    __table_args__ = (
        UniqueConstraint("source_revision_id", "proposal_revision_id", "consent_ref", "provider_code", "attempt_sequence", name="uq_memory_inbox_attempt_fence"),
        CheckConstraint("attempt_sequence > 0", name="ck_memory_inbox_attempt_positive_sequence"),
        CheckConstraint("lifecycle_state IN ('Planned','Claimed','Dispatched','CompletionUnknown','Reconciled','Cancelled','Closed')", name="ck_memory_inbox_attempt_state"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_revision_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_source_revisions.id"))
    proposal_revision_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_proposal_revisions.id"))
    consent_ref: Mapped[str] = mapped_column(String(160))
    provider_code: Mapped[str] = mapped_column(String(64))
    attempt_sequence: Mapped[int] = mapped_column(Integer)
    lifecycle_state: Mapped[str] = mapped_column(String(24), default="Planned")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemoryInboxJob(Base):
    __tablename__ = "memory_inbox_jobs"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_revision_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_source_revisions.id"), index=True)
    capability_ref: Mapped[str] = mapped_column(String(160))
    lifecycle_state: Mapped[str] = mapped_column(String(24), default="Planned")
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timeout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_ref: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryInboxCostPolicy(Base):
    """One supervisor-owned Inbox policy; it never shares generic provider state."""

    __tablename__ = "memory_inbox_cost_policies"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    finite_limit: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    measured_spend: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    reserved_spend: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    reset_timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    high_cost_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    actor_ref: Mapped[str] = mapped_column(String(160))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemoryInboxCostPolicyReceipt(Base):
    """Immutable, content-free receipt for each Inbox policy revision."""

    __tablename__ = "memory_inbox_cost_policy_receipts"
    __table_args__ = (
        UniqueConstraint("policy_id", "revision", name="uq_memory_inbox_cost_policy_receipt_revision"),
        UniqueConstraint("policy_id", "idempotency_key", name="uq_memory_inbox_cost_policy_receipt_replay"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    policy_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_cost_policies.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(16))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    actor_ref: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryInboxCostReservation(Base):
    __tablename__ = "memory_inbox_cost_reservations"
    __table_args__ = (UniqueConstraint("attempt_id", name="uq_memory_inbox_cost_reservation_attempt"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_processing_attempts.id"), index=True)
    policy_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_cost_policies.id"))
    amount: Mapped[float] = mapped_column(Numeric(18, 2))
    lifecycle_state: Mapped[str] = mapped_column(String(24), default="Reserved")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemoryInboxProcessingDisclosure(Base):
    """Immutable, metadata-only authorization disclosure for one source revision."""

    __tablename__ = "memory_inbox_processing_disclosures"
    __table_args__ = (UniqueConstraint("source_revision_id", "idempotency_key", name="uq_memory_inbox_disclosure_replay"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_revision_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_source_revisions.id"), index=True)
    source_revision: Mapped[int] = mapped_column(Integer)
    policy_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_cost_policies.id"))
    policy_revision: Mapped[int] = mapped_column(Integer)
    provider_order: Mapped[str] = mapped_column(String(64), default="local>openai>anthropic")
    retention_deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lifecycle_state: Mapped[str] = mapped_column(String(16), default="Presented")
    idempotency_key: Mapped[str] = mapped_column(String(160))
    actor_ref: Mapped[str] = mapped_column(String(160))
    receipt_ref: Mapped[str] = mapped_column(String(160), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MemoryInboxDeletionOperation(Base):
    __tablename__ = "memory_inbox_deletion_operations"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    manifest_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_manifests.id"), unique=True)
    lifecycle_state: Mapped[str] = mapped_column(String(16), default="None")
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MemoryInboxDeletionProof(Base):
    __tablename__ = "memory_inbox_deletion_proofs"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    deletion_operation_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_deletion_operations.id"), unique=True)
    proof_ref: Mapped[str] = mapped_column(String(160), unique=True)
    lifecycle_state: Mapped[str] = mapped_column(String(16), default="None")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryInboxProjectionSnapshot(Base):
    __tablename__ = "memory_inbox_projection_snapshots"
    __table_args__ = (UniqueConstraint("source_id", "projection_version", name="uq_memory_inbox_projection_version"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("memory_inbox_sources.id"), index=True)
    projection_version: Mapped[int] = mapped_column(Integer)
    lifecycle_state: Mapped[str] = mapped_column(String(32))
    freshness_state: Mapped[str] = mapped_column(String(16))
    next_action_code: Mapped[str] = mapped_column(String(64))
    retention_deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deletion_state: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SupervisorControl(Base):
    __tablename__ = "supervisor_control"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    mode: Mapped[str] = mapped_column(String(16), default=RunMode.RUNNING.value)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ManagerTerminalEvent(Base):
    __tablename__ = "manager_terminal_events"

    event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(80))
    run_id: Mapped[str] = mapped_column(String(120))
    source_identity: Mapped[str] = mapped_column(String(240))
    source_revision: Mapped[str] = mapped_column(String(160))
    reconciliation_counts_json: Mapped[dict] = mapped_column(JSON)
    unresolved_approval_gated_work_json: Mapped[list] = mapped_column(JSON)
    evidence_refs_json: Mapped[list] = mapped_column(JSON)
    resume_requirement: Mapped[str] = mapped_column(Text)
    next_manager_action: Mapped[str] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(String(180), unique=True)
    metadata_only: Mapped[bool] = mapped_column(Boolean, default=True)
    raw_payload_retained: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ManagerLaneClarityHandoff(Base):
    """Idempotent transport receipt, not manager lifecycle or tracker state."""

    __tablename__ = "manager_lane_clarity_handoffs"
    __table_args__ = (
        UniqueConstraint("selected_lane_id", "source_sequence", name="uq_manager_lane_clarity_handoff_sequence"),
    )

    handoff_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    selected_lane_id: Mapped[str] = mapped_column(String(160), index=True)
    run_id: Mapped[str] = mapped_column(String(120))
    event_watermark: Mapped[str] = mapped_column(String(160))
    source_cursor: Mapped[str] = mapped_column(String(160))
    source_sequence: Mapped[int] = mapped_column(Integer)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lane_clarity_json: Mapped[dict] = mapped_column(JSON)
    idempotency_key: Mapped[str] = mapped_column(String(180), unique=True)
    metadata_only: Mapped[bool] = mapped_column(Boolean, default=True)
    raw_payload_retained: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ManagerCoordinationHealthHandoff(Base):
    """Idempotent metadata-only receipt for canonical manager coordination health."""

    __tablename__ = "manager_coordination_health_handoffs"
    __table_args__ = (
        UniqueConstraint("source_sequence", name="uq_manager_coordination_health_handoff_sequence"),
    )

    handoff_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    source_sequence: Mapped[int] = mapped_column(BigInteger)
    coordination_health_json: Mapped[dict] = mapped_column(JSON)
    idempotency_key: Mapped[str] = mapped_column(String(180), unique=True)
    metadata_only: Mapped[bool] = mapped_column(Boolean, default=True)
    raw_payload_retained: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OperatorView(Base):
    __tablename__ = "operator_views"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120))
    scope: Mapped[str] = mapped_column(String(32))
    filters_json: Mapped[dict] = mapped_column(JSON, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
