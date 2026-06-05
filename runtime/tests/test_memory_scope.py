from __future__ import annotations

import unittest

from kendall_runtime.memory_scope import MemoryScopeManager, ScopedMemoryView
from kendall_runtime.module_manager import ModuleManager
from kendall_runtime.paths import modules_root
from kendall_runtime.runtime import KendallRuntime


class MemoryScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap()

    def test_module_can_read_and_write_allowed_memory_classes(self) -> None:
        tasks_memory = self.runtime.memory_for_module("tasks")

        entry = tasks_memory.put("domain-preference", "default_priority", "high", "user")
        loaded = tasks_memory.get("domain-preference", "default_priority")

        self.assertEqual(entry.value, "high")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.value, "high")

    def test_module_cannot_write_unlisted_memory_class(self) -> None:
        tasks_memory = self.runtime.memory_for_module("tasks")

        with self.assertRaises(PermissionError):
            tasks_memory.put("core-preference", "briefing_time", "08:00", "tasks-module")

    def test_module_cannot_read_unlisted_memory_class(self) -> None:
        outlook_memory = self.runtime.memory_for_module("outlook")
        self.runtime.memory_service.put("core_preference", "briefing_time", "08:00", "user")

        with self.assertRaises(PermissionError):
            outlook_memory.get("factual-correction", "customer-name")

    def test_memory_scope_rejects_malformed_value_before_write(self) -> None:
        tasks_memory = self.runtime.memory_for_module("tasks")

        with self.assertRaises(ValueError):
            tasks_memory.put("domain-preference", "default_priority", 1, "user")  # type: ignore[arg-type]

    def test_scoped_memory_view_rejects_malformed_configuration(self) -> None:
        with self.assertRaises(ValueError):
            ScopedMemoryView(
                module_id="",
                readable_classes=frozenset({"domain_preference"}),
                writable_classes=frozenset({"domain_preference"}),
                memory_service=self.runtime.memory_service,
            )
        with self.assertRaises(ValueError):
            ScopedMemoryView(
                module_id="tasks",
                readable_classes=frozenset({""}),  # type: ignore[arg-type]
                writable_classes=frozenset({"domain_preference"}),
                memory_service=self.runtime.memory_service,
            )
        with self.assertRaises(ValueError):
            ScopedMemoryView(
                module_id="tasks",
                readable_classes={"domain_preference"},  # type: ignore[arg-type]
                writable_classes=frozenset({"domain_preference"}),
                memory_service=self.runtime.memory_service,
            )
        with self.assertRaises(ValueError):
            ScopedMemoryView(
                module_id="tasks",
                readable_classes=frozenset({"domain_preference"}),
                writable_classes=frozenset({"domain_preference"}),
                memory_service="bad",  # type: ignore[arg-type]
            )

    def test_scoped_memory_view_rejects_malformed_entrypoint_inputs(self) -> None:
        view = self.runtime.memory_for_module("tasks")

        with self.assertRaises(ValueError):
            view.get(object(), "default_priority")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            view.get("domain-preference", object())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            view.put("domain-preference", "default_priority", "high", "")
        with self.assertRaises(ValueError):
            view.delete("domain-preference", "")

    def test_scoped_memory_view_clone_is_detached(self) -> None:
        view = self.runtime.memory_for_module("tasks")
        cloned = view.clone()
        cloned.module_id = "outlook"

        self.assertEqual(view.module_id, "tasks")

    def test_memory_scope_manager_rejects_malformed_dependencies(self) -> None:
        manager = ModuleManager.discover(modules_root())

        with self.assertRaises(ValueError):
            MemoryScopeManager(module_manager="bad", memory_service=self.runtime.memory_service)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            MemoryScopeManager(module_manager=manager, memory_service="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            MemoryScopeManager(module_manager=manager, memory_service=self.runtime.memory_service).for_module("")
        with self.assertRaises(ValueError):
            MemoryScopeManager(module_manager=manager, memory_service=self.runtime.memory_service).for_module(object())  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
