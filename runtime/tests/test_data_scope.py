from __future__ import annotations

import unittest

from kendall_runtime.data_scope import DataScopeManager, ScopedDataView
from kendall_runtime.module_manager import ModuleManager
from kendall_runtime.paths import modules_root
from kendall_runtime.runtime import KendallRuntime


class DataScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap()

    def test_module_can_read_and_write_allowed_data_classes(self) -> None:
        tasks_data = self.runtime.data_for_module("tasks")
        record = tasks_data.put("tasks", "task-1", {"title": "Follow up"}, "tasks")

        loaded = tasks_data.get("tasks", "task-1")
        listed = tasks_data.list("tasks")

        self.assertEqual(record.record_id, "task-1")
        self.assertIsNotNone(loaded)
        self.assertEqual(len(listed), 1)

    def test_data_scope_returns_copied_records(self) -> None:
        tasks_data = self.runtime.data_for_module("tasks")

        created = tasks_data.put("tasks", "task-1", {"title": "Follow up"}, "tasks")
        created.payload["title"] = "Mutated created copy"
        loaded = tasks_data.get("tasks", "task-1")
        loaded.payload["title"] = "Mutated loaded copy"
        listed = tasks_data.list("tasks")
        listed[0].payload["title"] = "Mutated listed copy"
        reloaded = tasks_data.get("tasks", "task-1")

        self.assertEqual(reloaded.payload["title"], "Follow up")

    def test_data_scope_put_detaches_input_payload(self) -> None:
        tasks_data = self.runtime.data_for_module("tasks")
        payload = {"title": "Follow up"}

        tasks_data.put("tasks", "task-1", payload, "tasks")
        payload["title"] = "mutated"

        self.assertEqual(tasks_data.get("tasks", "task-1").payload["title"], "Follow up")

    def test_module_cannot_write_unlisted_data_class(self) -> None:
        tasks_data = self.runtime.data_for_module("tasks")
        with self.assertRaises(PermissionError):
            tasks_data.put("email-threads", "thread-1", {"subject": "Hi"}, "tasks")

    def test_module_cannot_read_unlisted_data_class(self) -> None:
        scheduling_data = self.runtime.data_for_module("scheduling")
        self.runtime.data_service.put("tasks", "task-1", {"title": "Follow up"}, "seed")

        with self.assertRaises(PermissionError):
            scheduling_data.list("tasks")

    def test_data_scope_rejects_malformed_payload_before_write(self) -> None:
        tasks_data = self.runtime.data_for_module("tasks")

        with self.assertRaises(ValueError):
            tasks_data.put("tasks", "task-1", {"title": 1}, "tasks")  # type: ignore[arg-type]

    def test_scoped_data_view_rejects_malformed_configuration(self) -> None:
        with self.assertRaises(ValueError):
            ScopedDataView(
                module_id="",
                readable_classes=frozenset({"tasks"}),
                writable_classes=frozenset({"tasks"}),
                data_service=self.runtime.data_service,
            )
        with self.assertRaises(ValueError):
            ScopedDataView(
                module_id="tasks",
                readable_classes=frozenset({""}),  # type: ignore[arg-type]
                writable_classes=frozenset({"tasks"}),
                data_service=self.runtime.data_service,
            )
        with self.assertRaises(ValueError):
            ScopedDataView(
                module_id="tasks",
                readable_classes={"tasks"},  # type: ignore[arg-type]
                writable_classes=frozenset({"tasks"}),
                data_service=self.runtime.data_service,
            )
        with self.assertRaises(ValueError):
            ScopedDataView(
                module_id="tasks",
                readable_classes=frozenset({"tasks"}),
                writable_classes=frozenset({"tasks"}),
                data_service="bad",  # type: ignore[arg-type]
            )

    def test_scoped_data_view_rejects_malformed_entrypoint_inputs(self) -> None:
        view = self.runtime.data_for_module("tasks")

        with self.assertRaises(ValueError):
            view.get(object(), "task-1")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            view.get("tasks", object())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            view.list("")
        with self.assertRaises(ValueError):
            view.put("tasks", "task-1", {"title": "Follow up"}, "")
        with self.assertRaises(ValueError):
            view.delete("tasks", "")

    def test_scoped_data_view_clone_is_detached(self) -> None:
        view = self.runtime.data_for_module("tasks")
        cloned = view.clone()
        cloned.module_id = "outlook"

        self.assertEqual(view.module_id, "tasks")

    def test_data_scope_manager_rejects_malformed_dependencies(self) -> None:
        manager = ModuleManager.discover(modules_root())

        with self.assertRaises(ValueError):
            DataScopeManager(module_manager="bad", data_service=self.runtime.data_service)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            DataScopeManager(module_manager=manager, data_service="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            DataScopeManager(module_manager=manager, data_service=self.runtime.data_service).for_module("")
        with self.assertRaises(ValueError):
            DataScopeManager(module_manager=manager, data_service=self.runtime.data_service).for_module(object())  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
