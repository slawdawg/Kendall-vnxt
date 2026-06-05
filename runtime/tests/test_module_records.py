from __future__ import annotations

import unittest

from kendall_runtime.module_records import (
    CalendarEventRecord,
    EmailThreadRecord,
    ReminderRecord,
    TaskRecord,
    TentativeInternalHoldRecord,
)
from kendall_runtime.services.data import DataRecord


class ModuleRecordTests(unittest.TestCase):
    def test_email_thread_record_decodes_data_record(self) -> None:
        record = DataRecord(record_id="thread-1", payload={"subject": "Reply", "priority": "vip-follow-up"}, source="seed")
        thread = EmailThreadRecord.from_data_record(record)

        self.assertEqual(thread.thread_id, "thread-1")
        self.assertEqual(thread.subject, "Reply")
        self.assertEqual(thread.priority, "vip-follow-up")

    def test_email_thread_record_rejects_unknown_priority(self) -> None:
        with self.assertRaises(ValueError):
            EmailThreadRecord(thread_id="thread-1", subject="Reply", priority="urgent")
        with self.assertRaises(ValueError):
            EmailThreadRecord(thread_id="thread-1", subject="Reply", priority=object())  # type: ignore[arg-type]

        with self.assertRaises(ValueError):
            EmailThreadRecord(thread_id="thread-1", subject="", priority="normal")

    def test_task_record_round_trips_payload(self) -> None:
        task = TaskRecord(task_id="task-1", title="Prepare brief", priority="high", status="open")
        rebuilt = TaskRecord.from_data_record(DataRecord(record_id="task-1", payload=task.as_payload(), source="seed"))

        self.assertEqual(rebuilt.task_id, "task-1")
        self.assertEqual(rebuilt.title, "Prepare brief")
        self.assertEqual(rebuilt.priority, "high")
        self.assertEqual(rebuilt.status, "open")

    def test_reminder_and_hold_records_encode_expected_payloads(self) -> None:
        reminder = ReminderRecord(reminder_id="rem-1", title="Send recap", due_at="2026-06-03T09:00:00Z")
        hold = TentativeInternalHoldRecord(hold_id="hold-1", title="Focus block", reason="deep work")
        event = CalendarEventRecord.from_data_record(
            DataRecord(record_id="evt-1", payload={"title": "Travel", "risk": "overload"}, source="seed")
        )

        self.assertEqual(reminder.as_payload()["title"], "Send recap")
        self.assertEqual(hold.as_payload()["reason"], "deep work")
        self.assertEqual(event.risk, "overload")

    def test_calendar_event_record_rejects_unknown_risk(self) -> None:
        with self.assertRaises(ValueError):
            CalendarEventRecord(event_id="evt-1", title="Travel", risk="critical")
        with self.assertRaises(ValueError):
            CalendarEventRecord(event_id="evt-1", title="Travel", risk=object())  # type: ignore[arg-type]

        with self.assertRaises(ValueError):
            CalendarEventRecord(event_id="evt-1", title="", risk="normal")

    def test_task_record_rejects_unknown_priority_and_status(self) -> None:
        with self.assertRaises(ValueError):
            TaskRecord(task_id="task-1", title="Prepare brief", priority="urgent")
        with self.assertRaises(ValueError):
            TaskRecord(task_id="task-1", title="Prepare brief", priority=object())  # type: ignore[arg-type]

        with self.assertRaises(ValueError):
            TaskRecord(task_id="task-1", title="Prepare brief", status="blocked")
        with self.assertRaises(ValueError):
            TaskRecord(task_id="task-1", title="Prepare brief", status=object())  # type: ignore[arg-type]

        with self.assertRaises(ValueError):
            TaskRecord(task_id="task-1", title="", status="open")

    def test_reminder_record_rejects_unknown_status(self) -> None:
        with self.assertRaises(ValueError):
            ReminderRecord(reminder_id="rem-1", title="Send recap", status="later")
        with self.assertRaises(ValueError):
            ReminderRecord(reminder_id="rem-1", title="Send recap", status=object())  # type: ignore[arg-type]

        with self.assertRaises(ValueError):
            ReminderRecord(reminder_id="rem-1", title="Send recap", due_at=123)  # type: ignore[arg-type]

    def test_hold_record_rejects_invalid_title_and_reason(self) -> None:
        with self.assertRaises(ValueError):
            TentativeInternalHoldRecord(hold_id="hold-1", title="", reason="deep work")

        with self.assertRaises(ValueError):
            TentativeInternalHoldRecord(hold_id="hold-1", title="Focus block", reason=1)  # type: ignore[arg-type]

    def test_record_decoders_reject_non_data_record_inputs(self) -> None:
        for decoder in (
            EmailThreadRecord.from_data_record,
            CalendarEventRecord.from_data_record,
            TaskRecord.from_data_record,
            ReminderRecord.from_data_record,
            TentativeInternalHoldRecord.from_data_record,
        ):
            with self.assertRaises(ValueError):
                decoder("bad")  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
