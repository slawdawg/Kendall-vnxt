import asyncio
import json
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import (
    AuditEventView,
    OperatorViewCreate,
    OperatorViewResponse,
    RunStatusView,
    WorkItemCreate,
    WorkItemFilterView,
    WorkflowEventView,
    WorkItemView,
)
from supervisor.config.settings import Settings
from supervisor.domain.summaries import default_status_summary, mode_summary, next_step_summary
from supervisor.domain.types import AuditMode, BmadLane, RunMode, WorkItemFilterScope, WorkflowAction, WorkflowState
from supervisor.infrastructure.db.models import AuditEvent, OperatorView, QueueLease, SupervisorControl, WorkItem, WorkflowEvent
from supervisor.infrastructure.streaming.bus import EventBus


ACTIVE_STATES = {
    WorkflowState.IMPLEMENTING.value,
    WorkflowState.VALIDATING.value,
    WorkflowState.REVIEWING.value,
    WorkflowState.AWAITING_AUDIT.value,
}

_LANE_UNSET = object()


class SupervisorService:
    def __init__(self, settings: Settings, bus: EventBus) -> None:
        self.settings = settings
        self.bus = bus
        self._loop_lock = asyncio.Lock()

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
        await session.commit()
        await session.refresh(item)
        await self._publish_item(item)
        return item

    async def list_work_items(self, session: AsyncSession) -> list[WorkItem]:
        result = await session.execute(select(WorkItem).order_by(WorkItem.created_at.desc()))
        return list(result.scalars())

    async def list_audit_events(self, session: AsyncSession) -> list[AuditEvent]:
        result = await session.execute(select(AuditEvent).order_by(AuditEvent.created_at.desc()))
        return list(result.scalars())

    async def list_work_item_events(self, session: AsyncSession, work_item_id: str) -> list[WorkflowEvent]:
        result = await session.execute(
            select(WorkflowEvent)
            .where(WorkflowEvent.work_item_id == work_item_id)
            .order_by(WorkflowEvent.created_at.desc())
        )
        return list(result.scalars())

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
            await self._transition(
                session,
                item,
                WorkflowState.READY,
                "work_item.ready",
                default_status_summary(WorkflowState.READY),
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
            await self._create_or_refresh_lease(session, item)
            await self._transition(
                session,
                item,
                WorkflowState.IMPLEMENTING,
                "work_item.implementing",
                default_status_summary(WorkflowState.IMPLEMENTING),
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
            await self._transition(
                session,
                item,
                WorkflowState.VALIDATING,
                "workflow.validating",
                clean_note or default_status_summary(WorkflowState.VALIDATING),
                payload_overrides={"note": clean_note},
                actor_type="operator",
                actor_id=actor_id,
                actor_label=actor_label,
                lane_override=BmadLane.VALIDATION.value,
            )
            return

        if action == WorkflowAction.VALIDATION_PASSED and current == WorkflowState.VALIDATING:
            await self._transition(
                session,
                item,
                WorkflowState.REVIEWING,
                "workflow.reviewing",
                clean_note or default_status_summary(WorkflowState.REVIEWING),
                payload_overrides={"note": clean_note},
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
                    payload_overrides={"note": clean_note, "auditMode": item.audit_mode},
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
                payload_overrides={"note": clean_note},
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
                payload_overrides={"note": clean_note, "auditMode": item.audit_mode},
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
            await self._create_or_refresh_lease(session, item)
            item.blocked_reason = None
            await self._transition(
                session,
                item,
                WorkflowState.IMPLEMENTING,
                "work_item.implementing",
                clean_note or default_status_summary(WorkflowState.IMPLEMENTING),
                payload_overrides={"note": clean_note},
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

        if action == WorkflowAction.APPROVE_REVIEW and item.requires_audit and not note:
            raise ValueError("Risk-reviewed approval requires an operator note before the audit gate begins.")

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
    ) -> None:
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
            )
            return bool(result.stdout.strip())
        except OSError:
            return False

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

    def to_work_item_view(self, item: WorkItem) -> WorkItemView:
        age_minutes = self._age_minutes(item)
        needs_attention, attention_reason = self._derive_attention(item)
        return WorkItemView(
            id=item.id,
            title=item.title,
            requestedOutcome=item.requested_outcome,
            source=item.source,
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
