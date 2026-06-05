from __future__ import annotations

import unittest

from kendall_runtime.module_services import OutlookModuleService, SchedulingModuleService, TasksModuleService
from kendall_runtime.module_records import ReminderRecord, TaskRecord, TentativeInternalHoldRecord
from kendall_runtime.policy import ActionRequest
from kendall_runtime.runtime import KendallRuntime


class ReleaseOneModuleTests(unittest.TestCase):
    def test_release_one_module_services_reject_wrong_module_ids(self) -> None:
        with self.assertRaises(ValueError):
            OutlookModuleService(module_id="tasks")
        with self.assertRaises(ValueError):
            SchedulingModuleService(module_id="tasks")
        with self.assertRaises(ValueError):
            TasksModuleService(module_id="outlook")

    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap_release_one()

    def test_tasks_handler_creates_task_and_briefing_signal(self) -> None:
        outcome = self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-42",
                details={"title": "Prepare briefing", "priority": "high", "status": "open"},
            )
        )

        packet = self.runtime.orchestration_service.compose_briefing_from_registered_modules("morning")

        self.assertTrue(outcome.decision.allowed)
        self.assertEqual(
            outcome.execution_payload,
            {"status": "created", "reference_id": "task-42", "task_id": "task-42"},
        )
        task = TaskRecord.from_data_record(self.runtime.data_service.get("tasks", "task-42"))
        self.assertEqual(task.title, "Prepare briefing")
        self.assertEqual(task.priority, "high")
        self.assertEqual(packet.items[0].module_id, "tasks")
        self.assertIn("Prepare briefing", packet.items[0].summary)

    def test_scheduling_handler_creates_internal_hold(self) -> None:
        outcome = self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="scheduling",
                action_type="create-tentative-internal-hold",
                mode="internal",
                target="hold-7",
                details={"title": "Focus block", "reason": "deep work"},
            )
        )

        stored = self.runtime.data_service.get("tentative-internal-holds", "hold-7")

        self.assertTrue(outcome.decision.allowed)
        self.assertEqual(
            outcome.execution_payload,
            {"status": "created", "reference_id": "hold-7", "hold_id": "hold-7"},
        )
        self.assertIsNotNone(stored)
        hold = TentativeInternalHoldRecord.from_data_record(stored)
        self.assertEqual(hold.title, "Focus block")
        self.assertEqual(hold.reason, "deep work")

    def test_registered_providers_collect_outlook_and_scheduling_signals(self) -> None:
        self.runtime.data_service.put(
            "email-threads",
            "thread-1",
            {"subject": "Reply to CEO", "priority": "vip-follow-up"},
            "seed",
        )
        self.runtime.data_service.put(
            "calendar-events",
            "event-1",
            {"title": "Travel to client", "risk": "overload"},
            "seed",
        )

        packet = self.runtime.orchestration_service.compose_briefing_from_registered_modules("morning")
        module_ids = [item.module_id for item in packet.items]

        self.assertIn("outlook", module_ids)
        self.assertIn("scheduling", module_ids)

    def test_registered_providers_skip_invalid_stored_records(self) -> None:
        self.runtime.data_service.put(
            "email-threads",
            "thread-1",
            {"subject": "Reply to CEO", "priority": "urgent"},
            "seed",
        )
        self.runtime.data_service.put(
            "calendar-events",
            "event-1",
            {"title": "Travel to client", "risk": "critical"},
            "seed",
        )
        self.runtime.data_service.put(
            "tasks",
            "task-1",
            {"title": "Prepare briefing", "priority": "urgent", "status": "open"},
            "seed",
        )

        packet = self.runtime.orchestration_service.compose_briefing_from_registered_modules("morning")

        self.assertEqual(packet.items, [])
        self.assertEqual(packet.participating_modules, [])

    def test_update_reminder_preserves_unspecified_fields(self) -> None:
        self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-reminder",
                mode="internal",
                target="rem-1",
                details={"title": "Send recap", "due_at": "2026-06-03T09:00:00Z", "status": "scheduled"},
            )
        )
        self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="update-reminder",
                mode="internal",
                target="rem-1",
                details={"status": "done"},
            )
        )

        reminder = ReminderRecord.from_data_record(self.runtime.data_service.get("reminders", "rem-1"))
        self.assertEqual(reminder.title, "Send recap")
        self.assertEqual(reminder.due_at, "2026-06-03T09:00:00Z")
        self.assertEqual(reminder.status, "done")

    def test_reactivating_package_restores_actions_and_briefing(self) -> None:
        self.runtime.deactivate_module_package("release-one")
        blocked = self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-99",
                details={"title": "Prepare briefing", "priority": "high", "status": "open"},
            )
        )

        self.runtime.activate_module_package("release-one")
        allowed = self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-99",
                details={"title": "Prepare briefing", "priority": "high", "status": "open"},
            )
        )
        packet = self.runtime.orchestration_service.compose_briefing_from_registered_modules("morning")

        self.assertFalse(blocked.decision.allowed)
        self.assertTrue(allowed.decision.allowed)
        self.assertEqual(
            allowed.execution_payload,
            {"status": "created", "reference_id": "task-99", "task_id": "task-99"},
        )
        self.assertEqual(packet.items[0].module_id, "tasks")

    def test_invalid_task_priority_records_execution_failure_without_write(self) -> None:
        outcome = self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-bad",
                details={"title": "Prepare briefing", "priority": "urgent"},
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertIn("unknown task priority", outcome.decision.reason)
        self.assertEqual(outcome.audit_record.action_type, "execution-failed")
        self.assertIsNone(self.runtime.data_service.get("tasks", "task-bad"))

    def test_update_reminder_with_malformed_existing_record_records_execution_failure_without_overwrite(self) -> None:
        self.runtime.data_service.put(
            "reminders",
            "rem-bad",
            {"title": "Send recap", "due_at": "2026-06-03T09:00:00Z", "status": "scheduled"},
            "seed",
        )
        self.runtime.data_service.buckets["reminders"]["rem-bad"].payload["due_at"] = 123  # type: ignore[assignment]

        outcome = self.runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="update-reminder",
                mode="internal",
                target="rem-bad",
                details={"status": "done"},
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertIn("payload values must be strings", outcome.decision.reason)
        self.assertEqual(outcome.audit_record.action_type, "execution-failed")
        stored = self.runtime.data_service.buckets["reminders"]["rem-bad"]
        self.assertEqual(stored.payload["due_at"], 123)
        self.assertEqual(stored.payload["status"], "scheduled")


if __name__ == "__main__":
    unittest.main()
