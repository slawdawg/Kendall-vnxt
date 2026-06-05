from __future__ import annotations

from dataclasses import dataclass

from .services.data import DataRecord
from .briefing import VALID_PRIORITIES


VALID_EMAIL_THREAD_PRIORITIES = frozenset({"normal", "vip-follow-up"})
VALID_CALENDAR_EVENT_RISKS = frozenset({"normal", "overload"})
VALID_TASK_STATUSES = frozenset({"open", "in-progress", "done"})
VALID_REMINDER_STATUSES = frozenset({"scheduled", "done", "canceled"})


def _validate_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")


def _validate_data_record(record: object) -> DataRecord:
    if not isinstance(record, DataRecord):
        raise ValueError("record must be a DataRecord")
    return record


@dataclass(slots=True)
class EmailThreadRecord:
    thread_id: str
    subject: str
    priority: str = "normal"

    def __post_init__(self) -> None:
        _validate_non_empty_string(self.thread_id, field_name="thread_id")
        _validate_non_empty_string(self.subject, field_name="subject")
        _validate_non_empty_string(self.priority, field_name="priority")
        if self.priority not in VALID_EMAIL_THREAD_PRIORITIES:
            joined = ", ".join(sorted(VALID_EMAIL_THREAD_PRIORITIES))
            raise ValueError(f"unknown email thread priority {self.priority!r}; expected one of: {joined}")

    @classmethod
    def from_data_record(cls, record: DataRecord) -> "EmailThreadRecord":
        record = _validate_data_record(record)
        return cls(
            thread_id=record.record_id,
            subject=record.payload.get("subject", record.record_id),
            priority=record.payload.get("priority", "normal"),
        )


@dataclass(slots=True)
class CalendarEventRecord:
    event_id: str
    title: str
    risk: str = "normal"

    def __post_init__(self) -> None:
        _validate_non_empty_string(self.event_id, field_name="event_id")
        _validate_non_empty_string(self.title, field_name="title")
        _validate_non_empty_string(self.risk, field_name="risk")
        if self.risk not in VALID_CALENDAR_EVENT_RISKS:
            joined = ", ".join(sorted(VALID_CALENDAR_EVENT_RISKS))
            raise ValueError(f"unknown calendar event risk {self.risk!r}; expected one of: {joined}")

    @classmethod
    def from_data_record(cls, record: DataRecord) -> "CalendarEventRecord":
        record = _validate_data_record(record)
        return cls(
            event_id=record.record_id,
            title=record.payload.get("title", record.record_id),
            risk=record.payload.get("risk", "normal"),
        )


@dataclass(slots=True)
class TaskRecord:
    task_id: str
    title: str
    priority: str = "normal"
    status: str = "open"

    def __post_init__(self) -> None:
        _validate_non_empty_string(self.task_id, field_name="task_id")
        _validate_non_empty_string(self.title, field_name="title")
        _validate_non_empty_string(self.priority, field_name="priority")
        if self.priority not in VALID_PRIORITIES:
            joined = ", ".join(sorted(VALID_PRIORITIES))
            raise ValueError(f"unknown task priority {self.priority!r}; expected one of: {joined}")
        _validate_non_empty_string(self.status, field_name="status")
        if self.status not in VALID_TASK_STATUSES:
            joined = ", ".join(sorted(VALID_TASK_STATUSES))
            raise ValueError(f"unknown task status {self.status!r}; expected one of: {joined}")

    @classmethod
    def from_data_record(cls, record: DataRecord) -> "TaskRecord":
        record = _validate_data_record(record)
        return cls(
            task_id=record.record_id,
            title=record.payload.get("title", record.record_id),
            priority=record.payload.get("priority", "normal"),
            status=record.payload.get("status", "open"),
        )

    def as_payload(self) -> dict[str, str]:
        return {
            "title": self.title,
            "priority": self.priority,
            "status": self.status,
        }


@dataclass(slots=True)
class ReminderRecord:
    reminder_id: str
    title: str
    due_at: str = ""
    status: str = "scheduled"

    def __post_init__(self) -> None:
        _validate_non_empty_string(self.reminder_id, field_name="reminder_id")
        _validate_non_empty_string(self.title, field_name="title")
        _validate_string(self.due_at, field_name="due_at")
        _validate_non_empty_string(self.status, field_name="status")
        if self.status not in VALID_REMINDER_STATUSES:
            joined = ", ".join(sorted(VALID_REMINDER_STATUSES))
            raise ValueError(f"unknown reminder status {self.status!r}; expected one of: {joined}")

    @classmethod
    def from_data_record(cls, record: DataRecord) -> "ReminderRecord":
        record = _validate_data_record(record)
        return cls(
            reminder_id=record.record_id,
            title=record.payload.get("title", record.record_id),
            due_at=record.payload.get("due_at", ""),
            status=record.payload.get("status", "scheduled"),
        )

    def as_payload(self) -> dict[str, str]:
        return {
            "title": self.title,
            "due_at": self.due_at,
            "status": self.status,
        }


@dataclass(slots=True)
class TentativeInternalHoldRecord:
    hold_id: str
    title: str
    reason: str = ""

    def __post_init__(self) -> None:
        _validate_non_empty_string(self.hold_id, field_name="hold_id")
        _validate_non_empty_string(self.title, field_name="title")
        _validate_string(self.reason, field_name="reason")

    @classmethod
    def from_data_record(cls, record: DataRecord) -> "TentativeInternalHoldRecord":
        record = _validate_data_record(record)
        return cls(
            hold_id=record.record_id,
            title=record.payload.get("title", record.record_id),
            reason=record.payload.get("reason", ""),
        )

    def as_payload(self) -> dict[str, str]:
        return {
            "title": self.title,
            "reason": self.reason,
        }
