from __future__ import annotations

import unittest

from kendall_runtime.module_api import ActionContext, BriefingContext
from kendall_runtime.module_services import OutlookModuleService, SchedulingModuleService, TasksModuleService
from kendall_runtime.policy import ActionRequest
from kendall_runtime.runtime import KendallRuntime


class ModuleServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap()

    def test_outlook_service_collects_vip_follow_up_signal(self) -> None:
        self.runtime.data_service.put(
            "email-threads",
            "thread-1",
            {"subject": "Reply to CEO", "priority": "vip-follow-up"},
            "seed",
        )
        service = OutlookModuleService()
        result = service.collect_briefing(
            BriefingContext(
                module_id="outlook",
                briefing_type="morning",
                data=self.runtime.data_for_module("outlook"),
                memory=self.runtime.memory_for_module("outlook"),
            )
        )

        self.assertEqual(len(result.signals), 1)
        self.assertEqual(result.signals[0].details["thread_id"], "thread-1")

    def test_service_types_reject_malformed_module_id_values(self) -> None:
        with self.assertRaises(ValueError):
            OutlookModuleService(module_id="")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            SchedulingModuleService(module_id=1)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            TasksModuleService(module_id="other")

    def test_services_reject_malformed_context_types(self) -> None:
        with self.assertRaises(ValueError):
            OutlookModuleService().collect_briefing("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            SchedulingModuleService().create_tentative_hold("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            TasksModuleService().create_task("bad")  # type: ignore[arg-type]

    def test_outlook_service_skips_invalid_email_thread_records(self) -> None:
        self.runtime.data_service.put(
            "email-threads",
            "thread-1",
            {"subject": "Reply to CEO", "priority": "urgent"},
            "seed",
        )
        service = OutlookModuleService()

        result = service.collect_briefing(
            BriefingContext(
                module_id="outlook",
                briefing_type="morning",
                data=self.runtime.data_for_module("outlook"),
                memory=self.runtime.memory_for_module("outlook"),
            )
        )

        self.assertEqual(result.signals, [])

    def test_scheduling_service_creates_typed_hold(self) -> None:
        service = SchedulingModuleService()
        result = service.create_tentative_hold(
            ActionContext(
                module_id="scheduling",
                request=ActionRequest(
                    module_id="scheduling",
                    action_type="create-tentative-internal-hold",
                    mode="internal",
                    target="hold-1",
                    details={"title": "Focus block", "reason": "deep work"},
                ),
                data=self.runtime.data_for_module("scheduling"),
                memory=self.runtime.memory_for_module("scheduling"),
            )
        )

        self.assertEqual(result.reference_id, "hold-1")
        stored = self.runtime.data_service.get("tentative-internal-holds", "hold-1")
        self.assertEqual(stored.payload["reason"], "deep work")

    def test_scheduling_service_skips_invalid_calendar_event_records(self) -> None:
        self.runtime.data_service.put(
            "calendar-events",
            "event-1",
            {"title": "Travel", "risk": "critical"},
            "seed",
        )
        service = SchedulingModuleService()

        result = service.collect_briefing(
            BriefingContext(
                module_id="scheduling",
                briefing_type="morning",
                data=self.runtime.data_for_module("scheduling"),
                memory=self.runtime.memory_for_module("scheduling"),
            )
        )

        self.assertEqual(result.signals, [])

    def test_tasks_service_updates_existing_task_without_losing_fields(self) -> None:
        service = TasksModuleService()
        create = ActionContext(
            module_id="tasks",
            request=ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-1",
                details={"title": "Prepare brief", "priority": "high", "status": "open"},
            ),
            data=self.runtime.data_for_module("tasks"),
            memory=self.runtime.memory_for_module("tasks"),
        )
        update = ActionContext(
            module_id="tasks",
            request=ActionRequest(
                module_id="tasks",
                action_type="update-task",
                mode="internal",
                target="task-1",
                details={"status": "done"},
            ),
            data=self.runtime.data_for_module("tasks"),
            memory=self.runtime.memory_for_module("tasks"),
        )

        service.create_task(create)
        result = service.update_task(update)

        self.assertEqual(result.reference_id, "task-1")
        stored = self.runtime.data_service.get("tasks", "task-1")
        self.assertEqual(stored.payload["title"], "Prepare brief")
        self.assertEqual(stored.payload["priority"], "high")
        self.assertEqual(stored.payload["status"], "done")

    def test_tasks_service_rejects_invalid_task_priority(self) -> None:
        service = TasksModuleService()

        with self.assertRaises(ValueError):
            service.create_task(
                ActionContext(
                    module_id="tasks",
                    request=ActionRequest(
                        module_id="tasks",
                        action_type="create-task",
                        mode="internal",
                        target="task-2",
                        details={"title": "Prepare brief", "priority": "urgent"},
                    ),
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )

        self.assertIsNone(self.runtime.data_service.get("tasks", "task-2"))

    def test_tasks_service_skips_invalid_stored_task_records_during_briefing(self) -> None:
        self.runtime.data_service.put(
            "tasks",
            "task-1",
            {"title": "Prepare brief", "priority": "urgent", "status": "open"},
            "seed",
        )
        service = TasksModuleService()

        result = service.collect_briefing(
            BriefingContext(
                module_id="tasks",
                briefing_type="morning",
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        )

        self.assertEqual(result.signals, [])

    def test_tasks_service_update_rejects_malformed_existing_record_without_overwrite(self) -> None:
        self.runtime.data_service.put(
            "tasks",
            "task-1",
            {"title": "", "priority": "high", "status": "open"},
            "seed",
        )
        service = TasksModuleService()

        with self.assertRaises(ValueError):
            service.update_task(
                ActionContext(
                    module_id="tasks",
                    request=ActionRequest(
                        module_id="tasks",
                        action_type="update-task",
                        mode="internal",
                        target="task-1",
                        details={"status": "done"},
                    ),
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )

        stored = self.runtime.data_service.get("tasks", "task-1")
        self.assertEqual(stored.payload["title"], "")
        self.assertEqual(stored.payload["status"], "open")

    def test_tasks_service_update_reminder_rejects_malformed_existing_record_without_overwrite(self) -> None:
        self.runtime.data_service.put(
            "reminders",
            "rem-1",
            {"title": "Send recap", "due_at": "2026-06-03T09:00:00Z", "status": "scheduled"},
            "seed",
        )
        self.runtime.data_service.buckets["reminders"]["rem-1"].payload["due_at"] = 123  # type: ignore[assignment]
        service = TasksModuleService()

        with self.assertRaises(ValueError):
            service.update_reminder(
                ActionContext(
                    module_id="tasks",
                    request=ActionRequest(
                        module_id="tasks",
                        action_type="update-reminder",
                        mode="internal",
                        target="rem-1",
                        details={"status": "done"},
                    ),
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )

        stored = self.runtime.data_service.buckets["reminders"]["rem-1"]
        self.assertEqual(stored.payload["due_at"], 123)
        self.assertEqual(stored.payload["status"], "scheduled")

    def test_services_reject_cross_module_contexts(self) -> None:
        with self.assertRaises(ValueError):
            OutlookModuleService().collect_briefing(
                BriefingContext(
                    module_id="tasks",
                    briefing_type="morning",
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )
        with self.assertRaises(ValueError):
            SchedulingModuleService().create_tentative_hold(
                ActionContext(
                    module_id="tasks",
                    request=ActionRequest(
                        module_id="tasks",
                        action_type="create-tentative-internal-hold",
                        mode="internal",
                        target="hold-1",
                    ),
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )

    def test_action_services_reject_wrong_action_type(self) -> None:
        with self.assertRaises(ValueError):
            TasksModuleService().create_task(
                ActionContext(
                    module_id="tasks",
                    request=ActionRequest(
                        module_id="tasks",
                        action_type="update-task",
                        mode="internal",
                        target="task-1",
                    ),
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )
        with self.assertRaises(ValueError):
            TasksModuleService().update_reminder(
                ActionContext(
                    module_id="tasks",
                    request=ActionRequest(
                        module_id="tasks",
                        action_type="create-reminder",
                        mode="internal",
                        target="rem-1",
                    ),
                    data=self.runtime.data_for_module("tasks"),
                    memory=self.runtime.memory_for_module("tasks"),
                )
            )

    def test_action_services_reject_mutated_request_module_id(self) -> None:
        context = ActionContext(
            module_id="tasks",
            request=ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-1",
            ),
            data=self.runtime.data_for_module("tasks"),
            memory=self.runtime.memory_for_module("tasks"),
        )
        context.request.module_id = "outlook"

        with self.assertRaises(ValueError):
            TasksModuleService().create_task(context)

    def test_action_services_reject_mutated_scope_module_ids(self) -> None:
        context = ActionContext(
            module_id="tasks",
            request=ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-1",
            ),
            data=self.runtime.data_for_module("tasks"),
            memory=self.runtime.memory_for_module("tasks"),
        )
        context.data.module_id = "outlook"

        with self.assertRaises(ValueError):
            TasksModuleService().create_task(context)

    def test_briefing_services_reject_mutated_scope_module_ids(self) -> None:
        context = BriefingContext(
            module_id="outlook",
            briefing_type="morning",
            data=self.runtime.data_for_module("outlook"),
            memory=self.runtime.memory_for_module("outlook"),
        )
        context.data.module_id = "tasks"

        with self.assertRaises(ValueError):
            OutlookModuleService().collect_briefing(context)


if __name__ == "__main__":
    unittest.main()
