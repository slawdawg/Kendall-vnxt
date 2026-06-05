from __future__ import annotations

from dataclasses import dataclass

from .briefing import BriefingSignal
from .module_api import ActionContext, ActionResult, BriefingContext, BriefingResult
from .module_records import (
    CalendarEventRecord,
    EmailThreadRecord,
    ReminderRecord,
    TaskRecord,
    TentativeInternalHoldRecord,
)


def _require_exact_module_id(value: object, *, expected: str, service_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{service_name} must declare a non-empty string module_id")
    if value != expected:
        raise ValueError(f"{service_name} must declare module_id {expected!r}")


def _require_briefing_context(
    context: object,
    *,
    expected_module_id: str,
    service_name: str,
) -> BriefingContext:
    if not isinstance(context, BriefingContext):
        raise ValueError(f"{service_name} context must be a BriefingContext")
    if context.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} context module_id must be {expected_module_id!r}"
        )
    if context.data.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} data scope module_id must be {expected_module_id!r}"
        )
    if context.memory.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} memory scope module_id must be {expected_module_id!r}"
        )
    return context


def _require_action_context(
    context: object,
    *,
    expected_module_id: str,
    expected_action_type: str,
    service_name: str,
) -> ActionContext:
    if not isinstance(context, ActionContext):
        raise ValueError(f"{service_name} context must be an ActionContext")
    if context.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} context module_id must be {expected_module_id!r}"
        )
    if context.request.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} request module_id must be {expected_module_id!r}"
        )
    if context.data.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} data scope module_id must be {expected_module_id!r}"
        )
    if context.memory.module_id != expected_module_id:
        raise ValueError(
            f"{service_name} memory scope module_id must be {expected_module_id!r}"
        )
    if context.request.action_type != expected_action_type:
        raise ValueError(
            f"{service_name} request action_type must be {expected_action_type!r}"
        )
    return context


@dataclass(slots=True)
class OutlookModuleService:
    module_id: str = "outlook"

    def __post_init__(self) -> None:
        _require_exact_module_id(self.module_id, expected="outlook", service_name="outlook module service")

    def collect_briefing(self, context: BriefingContext) -> BriefingResult:
        context = _require_briefing_context(
            context,
            expected_module_id=self.module_id,
            service_name="outlook module service",
        )
        signals: list[BriefingSignal] = []
        for record in context.data.list("email-threads"):
            try:
                thread = EmailThreadRecord.from_data_record(record)
            except ValueError:
                continue
            if thread.priority == "vip-follow-up":
                signals.append(
                    BriefingSignal(
                        module_id=self.module_id,
                        summary=f"{context.briefing_type} follow-up: {thread.subject}",
                        priority="high",
                        category="email",
                        details={"thread_id": thread.thread_id},
                    )
                )
        return BriefingResult(signals=signals)


@dataclass(slots=True)
class SchedulingModuleService:
    module_id: str = "scheduling"

    def __post_init__(self) -> None:
        _require_exact_module_id(self.module_id, expected="scheduling", service_name="scheduling module service")

    def collect_briefing(self, context: BriefingContext) -> BriefingResult:
        context = _require_briefing_context(
            context,
            expected_module_id=self.module_id,
            service_name="scheduling module service",
        )
        signals: list[BriefingSignal] = []
        for record in context.data.list("calendar-events"):
            try:
                event = CalendarEventRecord.from_data_record(record)
            except ValueError:
                continue
            if event.risk == "overload":
                signals.append(
                    BriefingSignal(
                        module_id=self.module_id,
                        summary=f"{context.briefing_type} schedule risk: {event.title}",
                        priority="high",
                        category="calendar",
                        details={"event_id": event.event_id},
                    )
                )
        return BriefingResult(signals=signals)

    def create_tentative_hold(self, context: ActionContext) -> ActionResult:
        context = _require_action_context(
            context,
            expected_module_id=self.module_id,
            expected_action_type="create-tentative-internal-hold",
            service_name="scheduling module service",
        )
        hold = TentativeInternalHoldRecord(
            hold_id=context.request.target,
            title=context.request.details.get("title", context.request.target),
            reason=context.request.details.get("reason", ""),
        )
        record = context.data.put(
            "tentative-internal-holds",
            hold.hold_id,
            hold.as_payload(),
            source=self.module_id,
        )
        return ActionResult(status="created", reference_id=record.record_id, details={"hold_id": record.record_id})


@dataclass(slots=True)
class TasksModuleService:
    module_id: str = "tasks"

    def __post_init__(self) -> None:
        _require_exact_module_id(self.module_id, expected="tasks", service_name="tasks module service")

    def collect_briefing(self, context: BriefingContext) -> BriefingResult:
        context = _require_briefing_context(
            context,
            expected_module_id=self.module_id,
            service_name="tasks module service",
        )
        signals: list[BriefingSignal] = []
        for record in context.data.list("tasks"):
            try:
                task = TaskRecord.from_data_record(record)
            except ValueError:
                continue
            if task.status != "done":
                signals.append(
                    BriefingSignal(
                        module_id=self.module_id,
                        summary=f"{context.briefing_type} task: {task.title}",
                        priority=task.priority,
                        category="tasks",
                        details={"task_id": task.task_id},
                    )
                )
        return BriefingResult(signals=signals)

    def create_task(self, context: ActionContext) -> ActionResult:
        context = _require_action_context(
            context,
            expected_module_id=self.module_id,
            expected_action_type="create-task",
            service_name="tasks module service",
        )
        task = TaskRecord(
            task_id=context.request.target,
            title=context.request.details.get("title", context.request.target),
            priority=context.request.details.get("priority", "normal"),
            status=context.request.details.get("status", "open"),
        )
        record = context.data.put("tasks", task.task_id, task.as_payload(), source=self.module_id)
        return ActionResult(status="created", reference_id=record.record_id, details={"task_id": record.record_id})

    def update_task(self, context: ActionContext) -> ActionResult:
        context = _require_action_context(
            context,
            expected_module_id=self.module_id,
            expected_action_type="update-task",
            service_name="tasks module service",
        )
        existing = context.data.get("tasks", context.request.target)
        prior = TaskRecord.from_data_record(existing) if existing is not None else TaskRecord(
            task_id=context.request.target,
            title=context.request.target,
        )
        task = TaskRecord(
            task_id=context.request.target,
            title=context.request.details.get("title", prior.title),
            priority=context.request.details.get("priority", prior.priority),
            status=context.request.details.get("status", prior.status),
        )
        record = context.data.put("tasks", task.task_id, task.as_payload(), source=self.module_id)
        return ActionResult(status="updated", reference_id=record.record_id, details={"task_id": record.record_id})

    def create_reminder(self, context: ActionContext) -> ActionResult:
        context = _require_action_context(
            context,
            expected_module_id=self.module_id,
            expected_action_type="create-reminder",
            service_name="tasks module service",
        )
        reminder = ReminderRecord(
            reminder_id=context.request.target,
            title=context.request.details.get("title", context.request.target),
            due_at=context.request.details.get("due_at", ""),
            status=context.request.details.get("status", "scheduled"),
        )
        record = context.data.put("reminders", reminder.reminder_id, reminder.as_payload(), source=self.module_id)
        return ActionResult(
            status="created",
            reference_id=record.record_id,
            details={"reminder_id": record.record_id},
        )

    def update_reminder(self, context: ActionContext) -> ActionResult:
        context = _require_action_context(
            context,
            expected_module_id=self.module_id,
            expected_action_type="update-reminder",
            service_name="tasks module service",
        )
        existing = context.data.get("reminders", context.request.target)
        prior = ReminderRecord.from_data_record(existing) if existing is not None else ReminderRecord(
            reminder_id=context.request.target,
            title=context.request.target,
        )
        reminder = ReminderRecord(
            reminder_id=context.request.target,
            title=context.request.details.get("title", prior.title),
            due_at=context.request.details.get("due_at", prior.due_at),
            status=context.request.details.get("status", prior.status),
        )
        record = context.data.put("reminders", reminder.reminder_id, reminder.as_payload(), source=self.module_id)
        return ActionResult(
            status="updated",
            reference_id=record.record_id,
            details={"reminder_id": record.record_id},
        )
