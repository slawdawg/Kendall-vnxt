import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from supervisor.domain.types import AuditMode, CandidateWorkPriority, CandidateWorkStatus, BmadLane, ExecutionAttemptStatus, RiskLevel, RunMode, WorkflowState
from supervisor.infrastructure.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WorkItem(Base):
    __tablename__ = "work_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255))
    requested_outcome: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(255))
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


class ExecutionAttempt(Base):
    __tablename__ = "execution_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
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


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"))
    reason: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(16))
    outcome: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    work_item: Mapped[WorkItem] = relationship(back_populates="audits")


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
