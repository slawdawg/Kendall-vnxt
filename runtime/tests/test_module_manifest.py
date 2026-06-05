from __future__ import annotations

import unittest

from kendall_runtime.briefing import BriefingSignal
from kendall_runtime.module_api import ActionResult, BriefingResult
from kendall_runtime.module_manifest import ActionBinding, ModuleBinding, ModulePackage
from kendall_runtime.runtime import KendallRuntime


class FakeModuleService:
    def collect_briefing(self, context) -> BriefingResult:
        return BriefingResult(signals=[BriefingSignal(module_id="tasks", summary=f"{context.briefing_type} fake")])

    def create_task(self, context) -> ActionResult:
        return ActionResult(status="created", reference_id=context.request.target, details={"task_id": context.request.target})


class WrongOwnerService:
    module_id = "outlook"

    def collect_briefing(self, context) -> BriefingResult:
        return BriefingResult(signals=[BriefingSignal(module_id=self.module_id, summary=f"{context.briefing_type} fake")])

    def create_task(self, context) -> ActionResult:
        return ActionResult(status="created", reference_id=context.request.target, details={"task_id": context.request.target})


class NonCallableBindingService:
    collect_briefing = "not-callable"


class ModuleManifestTests(unittest.TestCase):
    def test_manifest_objects_reject_malformed_fields(self) -> None:
        with self.assertRaises(ValueError):
            ActionBinding(action_type="", method_name="create_task")
        with self.assertRaises(ValueError):
            ActionBinding(action_type="create-task", method_name="")
        with self.assertRaises(ValueError):
            ActionBinding(action_type=1, method_name="create_task")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleBinding(module_id="", service=FakeModuleService())
        with self.assertRaises(ValueError):
            ModuleBinding(module_id="tasks", service=None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleBinding(module_id="tasks", service=FakeModuleService(), briefing_method_name="")
        with self.assertRaises(ValueError):
            ModuleBinding(module_id=1, service=FakeModuleService())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleBinding(
                module_id="tasks",
                service=FakeModuleService(),
                action_bindings=["not-a-binding"],  # type: ignore[list-item]
            )
        with self.assertRaises(ValueError):
            ModulePackage(package_id="", module_bindings=[])
        with self.assertRaises(ValueError):
            ModulePackage(package_id="pkg", display_name=1, module_bindings=[])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModulePackage(package_id="pkg", version="", module_bindings=[])
        with self.assertRaises(ValueError):
            ModulePackage(package_id="pkg", module_bindings=["not-a-binding"])  # type: ignore[list-item]

    def test_manifest_clone_methods_return_detached_objects(self) -> None:
        package = ModulePackage(
            package_id="pkg",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )

        cloned = package.clone()
        cloned.module_bindings[0].action_bindings[0] = ActionBinding(
            action_type="update-task",
            method_name="create_task",
        )

        self.assertEqual(package.module_bindings[0].action_bindings[0].action_type, "create-task")

    def test_manifest_detaches_constructor_lists(self) -> None:
        action_bindings = [ActionBinding(action_type="create-task", method_name="create_task")]
        binding = ModuleBinding(
            module_id="tasks",
            service=FakeModuleService(),
            action_bindings=action_bindings,
        )
        action_bindings[0] = ActionBinding(action_type="update-task", method_name="create_task")
        self.assertEqual(binding.action_bindings[0].action_type, "create-task")

        module_bindings = [binding]
        package = ModulePackage(package_id="pkg", module_bindings=module_bindings)
        module_bindings[0] = ModuleBinding(module_id="outlook", service=FakeModuleService())
        self.assertEqual(package.module_bindings[0].module_id, "tasks")

    def test_package_install_registers_service_provider_and_handlers(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="fake-package",
            display_name="Fake Package",
            version="1.2.3",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )

        package.install(runtime)

        self.assertTrue(runtime.module_packages.has("fake-package"))
        self.assertTrue(runtime.module_packages.is_active("fake-package"))
        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertEqual(runtime.module_services.owner_for("tasks"), "fake-package")
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertEqual(runtime.signal_registry.owner_for("tasks"), "fake-package")
        self.assertIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)
        self.assertEqual(runtime.action_dispatcher.owner_for("tasks", "create-task"), "fake-package")

    def test_registry_get_and_list_return_detached_package_objects(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )
        runtime.register_module_package(package)

        fetched = runtime.module_packages.get("fake-package")
        listed = runtime.module_packages.list()[0]
        registered = runtime.module_packages.list_registered()[0]
        fetched.module_bindings[0] = ModuleBinding(module_id="outlook", service=FakeModuleService())
        listed.module_bindings[0] = ModuleBinding(module_id="outlook", service=FakeModuleService())
        registered.package.module_bindings[0] = ModuleBinding(module_id="outlook", service=FakeModuleService())

        self.assertEqual(runtime.module_packages.get_registered("fake-package").package.module_bindings[0].module_id, "tasks")

    def test_registry_and_manifest_entrypoints_reject_malformed_inputs(self) -> None:
        runtime = KendallRuntime.bootstrap()
        registry = runtime.module_packages
        package = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )

        with self.assertRaises(ValueError):
            registry.validate("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            registry.register("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            package.install("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            package._validate_bindings("bad")  # type: ignore[arg-type]

    def test_registry_register_detaches_original_package_object(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )

        runtime.register_module_package(package)
        package.module_bindings[0] = ModuleBinding(module_id="outlook", service=FakeModuleService())

        self.assertEqual(runtime.module_packages.get("fake-package").module_bindings[0].module_id, "tasks")

    def test_reregistering_package_replaces_module_ownership_mapping(self) -> None:
        runtime = KendallRuntime.bootstrap()
        original = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )
        replacement = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="outlook",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                )
            ],
        )

        original.install(runtime)
        replacement.install(runtime)

        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        self.assertEqual(runtime.module_packages.package_id_for_module("outlook"), "fake-package")
        self.assertTrue(runtime.module_packages.is_module_active("tasks"))
        self.assertTrue(runtime.module_packages.is_module_active("outlook"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertNotIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)
        self.assertTrue(runtime.module_services.has("outlook"))
        self.assertIn("outlook", runtime.signal_registry.providers)
        self.assertFalse(runtime.action_dispatcher.has_handler("tasks", "create-task"))

    def test_reregistering_package_preserves_active_state(self) -> None:
        runtime = KendallRuntime.bootstrap()
        original = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )
        replacement = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="outlook", service=FakeModuleService())],
        )

        runtime.register_module_package(original)
        runtime.deactivate_module_package("fake-package")
        runtime.register_module_package(replacement)

        self.assertFalse(runtime.module_packages.is_active("fake-package"))
        self.assertFalse(runtime.module_packages.is_module_active("outlook"))

    def test_register_rejects_module_claimed_by_another_package(self) -> None:
        runtime = KendallRuntime.bootstrap()
        runtime.register_module_package(
            ModulePackage(
                package_id="package-one",
                module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
            )
        )

        with self.assertRaises(ValueError):
            runtime.register_module_package(
                ModulePackage(
                    package_id="package-two",
                    module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
                )
            )

    def test_failed_package_replacement_preserves_existing_runtime_surface(self) -> None:
        runtime = KendallRuntime.bootstrap()
        original = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )
        conflicting = ModulePackage(
            package_id="other-package",
            module_bindings=[ModuleBinding(module_id="outlook", service=FakeModuleService())],
        )
        replacement = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="outlook", service=FakeModuleService())],
        )

        original.install(runtime)
        runtime.register_module_package(conflicting)

        with self.assertRaises(ValueError):
            runtime.register_module_package(replacement)

        self.assertEqual(runtime.module_packages.package_id_for_module("tasks"), "fake-package")
        self.assertEqual(runtime.module_packages.package_id_for_module("outlook"), "other-package")
        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)

    def test_package_uninstall_preserves_direct_action_handlers(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )
        package.install(runtime)
        runtime.register_action_handler(
            "tasks",
            "update-task",
            lambda context: ActionResult(status="updated", reference_id=context.request.target),
        )

        runtime.uninstall_module_package("fake-package")

        self.assertFalse(runtime.action_dispatcher.has_handler("tasks", "create-task"))
        self.assertTrue(runtime.action_dispatcher.has_handler("tasks", "update-task"))
        self.assertIsNone(runtime.action_dispatcher.owner_for("tasks", "update-task"))

    def test_package_uninstall_rejects_drifted_owned_bindings_without_partial_teardown(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )
        package.install(runtime)
        runtime.module_services.service_owners["tasks"] = None

        with self.assertRaises(ValueError):
            runtime.uninstall_module_package("fake-package")

        self.assertTrue(runtime.module_packages.has("fake-package"))
        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertTrue(runtime.action_dispatcher.has_handler("tasks", "create-task"))

    def test_package_uninstall_rejects_drifted_module_mapping_without_partial_teardown(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )
        package.install(runtime)
        del runtime.module_packages.module_to_package["tasks"]

        with self.assertRaises(ValueError):
            runtime.uninstall_module_package("fake-package")

        self.assertTrue(runtime.module_packages.has("fake-package"))
        self.assertTrue(runtime.module_services.has("tasks"))

    def test_package_replacement_preserves_direct_action_handlers(self) -> None:
        runtime = KendallRuntime.bootstrap()
        original = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )
        replacement = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    action_bindings=[ActionBinding(action_type="create-reminder", method_name="create_task")],
                )
            ],
        )
        original.install(runtime)
        runtime.register_action_handler(
            "tasks",
            "update-task",
            lambda context: ActionResult(status="updated", reference_id=context.request.target),
        )

        replacement.install(runtime)

        self.assertFalse(runtime.action_dispatcher.has_handler("tasks", "create-task"))
        self.assertTrue(runtime.action_dispatcher.has_handler("tasks", "create-reminder"))
        self.assertTrue(runtime.action_dispatcher.has_handler("tasks", "update-task"))
        self.assertEqual(runtime.action_dispatcher.owner_for("tasks", "create-reminder"), "fake-package")
        self.assertIsNone(runtime.action_dispatcher.owner_for("tasks", "update-task"))

    def test_package_replacement_rejects_drifted_owned_bindings_without_partial_teardown(self) -> None:
        runtime = KendallRuntime.bootstrap()
        original = ModulePackage(
            package_id="fake-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )
        replacement = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="outlook", service=FakeModuleService())],
        )
        original.install(runtime)
        runtime.signal_registry.provider_owners["tasks"] = None

        with self.assertRaises(ValueError):
            replacement.install(runtime)

        self.assertEqual(runtime.module_packages.package_id_for_module("tasks"), "fake-package")
        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertTrue(runtime.action_dispatcher.has_handler("tasks", "create-task"))
        self.assertFalse(runtime.module_services.has("outlook"))

    def test_package_replacement_rejects_drifted_module_mapping_without_partial_teardown(self) -> None:
        runtime = KendallRuntime.bootstrap()
        original = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )
        replacement = ModulePackage(
            package_id="fake-package",
            module_bindings=[ModuleBinding(module_id="outlook", service=FakeModuleService())],
        )
        original.install(runtime)
        del runtime.module_packages.module_to_package["tasks"]

        with self.assertRaises(ValueError):
            replacement.install(runtime)

        self.assertTrue(runtime.module_packages.has("fake-package"))
        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertFalse(runtime.module_services.has("outlook"))

    def test_register_rejects_duplicate_module_bindings_within_package(self) -> None:
        runtime = KendallRuntime.bootstrap()

        with self.assertRaises(ValueError):
            runtime.register_module_package(
                ModulePackage(
                    package_id="package-one",
                    module_bindings=[
                        ModuleBinding(module_id="tasks", service=FakeModuleService()),
                        ModuleBinding(module_id="tasks", service=FakeModuleService()),
                    ],
                )
            )

    def test_package_install_rejects_duplicate_module_bindings_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(module_id="tasks", service=FakeModuleService()),
                ModuleBinding(module_id="tasks", service=FakeModuleService()),
            ],
        )

        with self.assertRaises(ValueError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertEqual(runtime.action_dispatcher.list_action_types("tasks"), [])

    def test_package_install_rejects_unknown_module_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(module_id="tasks", service=FakeModuleService()),
                ModuleBinding(module_id="unknown", service=FakeModuleService()),
            ],
        )

        with self.assertRaises(KeyError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))

    def test_package_install_rejects_missing_or_non_callable_methods_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        missing_method = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="missing_method",
                )
            ],
        )
        non_callable = ModulePackage(
            package_id="bad-package-2",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=NonCallableBindingService(),
                    briefing_method_name="collect_briefing",
                )
            ],
        )

        with self.assertRaises(ValueError):
            missing_method.install(runtime)
        with self.assertRaises(ValueError):
            non_callable.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertFalse(runtime.module_packages.has("bad-package-2"))
        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertNotIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)

    def test_package_install_rejects_unknown_method_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="missing_briefing_method",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )

        with self.assertRaises(ValueError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertNotIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)

    def test_package_install_rejects_undeclared_action_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    action_bindings=[ActionBinding(action_type="not-a-real-action", method_name="create_task")],
                )
            ],
        )

        with self.assertRaises(ValueError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertNotIn(("tasks", "not-a-real-action"), runtime.action_dispatcher.handlers)

    def test_package_install_rejects_mismatched_service_owner_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=WrongOwnerService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[ActionBinding(action_type="create-task", method_name="create_task")],
                )
            ],
        )

        with self.assertRaises(ValueError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertNotIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)

    def test_package_install_rejects_existing_direct_service_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        runtime.register_module_service("tasks", object())
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[ModuleBinding(module_id="tasks", service=FakeModuleService())],
        )

        with self.assertRaises(ValueError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertTrue(runtime.module_services.has("tasks"))

    def test_package_install_rejects_duplicate_action_bindings_without_partial_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        package = ModulePackage(
            package_id="bad-package",
            module_bindings=[
                ModuleBinding(
                    module_id="tasks",
                    service=FakeModuleService(),
                    briefing_method_name="collect_briefing",
                    action_bindings=[
                        ActionBinding(action_type="create-task", method_name="create_task"),
                        ActionBinding(action_type="create-task", method_name="create_task"),
                    ],
                )
            ],
        )

        with self.assertRaises(ValueError):
            package.install(runtime)

        self.assertFalse(runtime.module_packages.has("bad-package"))
        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertNotIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)


if __name__ == "__main__":
    unittest.main()
