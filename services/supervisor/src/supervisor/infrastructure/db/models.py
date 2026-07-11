import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from supervisor.domain.types import AuditMode, CandidateWorkPriority, CandidateWorkStatus, BmadLane, ExecutionAttemptStatus, RiskLevel, RunMode, WorkflowState
from supervisor.infrastructure.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    approval_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    outcome: Mapped[str] = mapped_column(String(16))
    resulting_stage: Mapped[str] = mapped_column(String(32))
    resulting_status: Mapped[str] = mapped_column(String(32))
    capability_state: Mapped[str] = mapped_column(String(16))
    authority_state: Mapped[str] = mapped_column(String(40))
    typed_reason: Mapped[str | None] = mapped_column(String(48), nullable=True)
    child_packet_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    evidence_refs_json: Mapped[list] = mapped_column(JSON, default=list)
    operator_intent_summary: Mapped[str] = mapped_column(Text, default="")
    test_result: Mapped[str | None] = mapped_column(String(16), nullable=True)
    test_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OperationalActionApprovalRecord(Base):
    __tablename__ = "pipeline_operational_approvals"

    approval_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    action_id: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(120))
    requested_actor_json: Mapped[dict] = mapped_column(JSON, default=dict)
    requested_authority_family: Mapped[str] = mapped_column(String(40))
    requested_risk_tier: Mapped[str] = mapped_column(String(16))
    expected_current_event_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_action_idempotency_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    consumed_action_record_id: Mapped[str | None] = mapped_column(String(80), nullable=True)


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


class SupervisorControl(Base):
    __tablename__ = "supervisor_control"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    mode: Mapped[str] = mapped_column(String(16), default=RunMode.RUNNING.value)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class OperatorView(Base):
    __tablename__ = "operator_views"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120))
    scope: Mapped[str] = mapped_column(String(32))
    filters_json: Mapped[dict] = mapped_column(JSON, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
