from __future__ import annotations

import unittest

from kendall_runtime.briefing import BriefingSignal
from kendall_runtime.module_api import ActionResult, BriefingResult
from kendall_runtime.module_manifest import ModulePackage
from kendall_runtime.module_services import OutlookModuleService, SchedulingModuleService, TasksModuleService
from kendall_runtime.runtime import KendallRuntime
from kendall_runtime.module_package_registry import ModulePackageRegistry


class WrongOwnerService:
    module_id = "outlook"

    def collect_briefing(self, context) -> BriefingResult:
        return BriefingResult(
            signals=[BriefingSignal(module_id=self.module_id, summary=f"{context.briefing_type} wrong owner")]
        )

    def create_task(self, context) -> ActionResult:
        return ActionResult(status="ok", reference_id=context.request.target)


class RuntimeBootstrapTests(unittest.TestCase):
    def test_bootstrap_wires_release_one_runtime(self) -> None:
        runtime = KendallRuntime.bootstrap()

        self.assertEqual(sorted(runtime.module_manager.registry), ["outlook", "scheduling", "tasks"])
        self.assertIs(runtime.orchestration_service.module_manager, runtime.module_manager)
        self.assertIs(runtime.orchestration_service.policy_gate, runtime.policy_gate)
        self.assertIs(runtime.orchestration_service.action_dispatcher, runtime.action_dispatcher)
        self.assertIs(runtime.orchestration_service.signal_registry, runtime.signal_registry)
        self.assertIs(runtime.data_scope_manager.data_service, runtime.data_service)
        self.assertIs(runtime.memory_scope_manager.memory_service, runtime.memory_service)
        self.assertIs(runtime.status_service.module_manager, runtime.module_manager)
        self.assertIs(runtime.inference_service.privacy_gate, runtime.privacy_gate)
        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertEqual(runtime.module_packages.list(), [])
        self.assertEqual(runtime.module_manager.load_failures, [])
        self.assertFalse(runtime.is_module_installed("tasks"))
        self.assertEqual(
            [module.contract.identity.module_id for module in runtime.list_operational_modules()],
            ["outlook", "scheduling", "tasks"],
        )
        self.assertEqual(runtime.list_installed_modules(), [])
        with self.assertRaises(ValueError):
            runtime.service_for_module("tasks", require_operational=False)

    def test_runtime_rejects_malformed_core_dependencies(self) -> None:
        with self.assertRaises(ValueError):
            KendallRuntime(module_manager="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            KendallRuntime.bootstrap("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            KendallRuntime.bootstrap_release_one("bad")  # type: ignore[arg-type]

    def test_runtime_public_module_accessors_reject_malformed_inputs(self) -> None:
        runtime = KendallRuntime.bootstrap()

        with self.assertRaises(ValueError):
            runtime.memory_for_module("")
        with self.assertRaises(ValueError):
            runtime.data_for_module("")
        with self.assertRaises(ValueError):
            runtime.service_for_module("")
        with self.assertRaises(ValueError):
            runtime.service_for_module("tasks", require_operational="yes")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            runtime.is_module_operational("")
        with self.assertRaises(ValueError):
            runtime.is_module_installed("")

    def test_runtime_registration_helpers_validate_module_ids(self) -> None:
        runtime = KendallRuntime.bootstrap()
        runtime.register_action_handler(
            "tasks",
            "create-task",
            lambda context: ActionResult(status="ok", reference_id=context.request.target),
        )
        runtime.register_briefing_provider(
            "tasks",
            lambda context: BriefingResult(
                signals=[BriefingSignal(module_id="tasks", summary=f"{context.briefing_type} tasks")]
            ),
        )

        self.assertIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)
        self.assertIn("tasks", runtime.signal_registry.providers)

        with self.assertRaises(ValueError):
            runtime.register_action_handler(
                "tasks",
                "create-task",
                lambda context: ActionResult(status="ok", reference_id=context.request.target),
            )

        with self.assertRaises(ValueError):
            runtime.register_briefing_provider(
                "tasks",
                lambda context: BriefingResult(
                    signals=[BriefingSignal(module_id="tasks", summary=f"{context.briefing_type} tasks duplicate")]
                ),
            )

        with self.assertRaises(KeyError):
            runtime.register_action_handler(
                "unknown",
                "create-task",
                lambda context: ActionResult(status="ok", reference_id=context.request.target),
            )

        with self.assertRaises(ValueError):
            runtime.register_action_handler(
                "tasks",
                "not-a-real-action",
                lambda context: ActionResult(status="ok", reference_id=context.request.target),
            )
        with self.assertRaises(ValueError):
            runtime.register_action_handler(
                "tasks",
                "create-task",
                None,  # type: ignore[arg-type]
            )

        with self.assertRaises(KeyError):
            runtime.register_briefing_provider("unknown", lambda context: BriefingResult(signals=[]))
        with self.assertRaises(ValueError):
            runtime.validate_module_action("", "create-task")
        with self.assertRaises(ValueError):
            runtime.validate_module_action("tasks", "")
        with self.assertRaises(ValueError):
            runtime.validate_module_owner("", object())
        with self.assertRaises(ValueError):
            runtime.validate_module_service_registration("", replacing_package_id=None)
        with self.assertRaises(ValueError):
            runtime.validate_module_service_registration("tasks", replacing_package_id="")
        with self.assertRaises(ValueError):
            runtime.validate_briefing_provider_registration("", replacing_package_id=None)
        with self.assertRaises(ValueError):
            runtime.validate_briefing_provider_registration("tasks", replacing_package_id="")
        with self.assertRaises(ValueError):
            runtime.validate_action_handler_registration("", "create-task", replacing_package_id=None)
        with self.assertRaises(ValueError):
            runtime.validate_action_handler_registration("tasks", "", replacing_package_id=None)
        with self.assertRaises(ValueError):
            runtime.validate_action_handler_registration("tasks", "create-task", replacing_package_id="")

        wrong_owner = WrongOwnerService()
        with self.assertRaises(ValueError):
            runtime.register_module_service("tasks", wrong_owner)
        with self.assertRaises(ValueError):
            runtime.register_briefing_provider("tasks", wrong_owner.collect_briefing)
        with self.assertRaises(ValueError):
            runtime.register_action_handler("tasks", "create-task", wrong_owner.create_task)

    def test_runtime_rejects_duplicate_module_service_registration(self) -> None:
        runtime = KendallRuntime.bootstrap()
        runtime.register_module_service("tasks", object())

        with self.assertRaises(ValueError):
            runtime.register_module_service("tasks", object())

    def test_runtime_can_unregister_direct_bindings(self) -> None:
        runtime = KendallRuntime.bootstrap()
        runtime.register_module_service("tasks", object())
        runtime.register_briefing_provider("tasks", lambda context: BriefingResult(signals=[]))
        runtime.register_action_handler(
            "tasks",
            "create-task",
            lambda context: ActionResult(status="ok", reference_id=context.request.target),
        )

        runtime.unregister_module_service("tasks")
        runtime.unregister_briefing_provider("tasks")
        runtime.unregister_action_handler("tasks", "create-task")

        self.assertFalse(runtime.module_services.has("tasks"))
        self.assertNotIn("tasks", runtime.signal_registry.providers)
        self.assertFalse(runtime.action_dispatcher.has_handler("tasks", "create-task"))

    def test_runtime_direct_unregister_rejects_package_managed_bindings(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        with self.assertRaises(ValueError):
            runtime.unregister_module_service("tasks")
        with self.assertRaises(ValueError):
            runtime.unregister_briefing_provider("tasks")
        with self.assertRaises(ValueError):
            runtime.unregister_action_handler("tasks", "create-task")

        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertTrue(runtime.action_dispatcher.has_handler("tasks", "create-task"))

    def test_runtime_registration_and_unregistration_reject_malformed_dependency_state(self) -> None:
        runtime = KendallRuntime.bootstrap()

        runtime.module_services.service_owners["unknown"] = "pkg"
        with self.assertRaises(ValueError):
            runtime.register_module_service("tasks", object())
        with self.assertRaises(ValueError):
            runtime.unregister_module_service("tasks")

        runtime = KendallRuntime.bootstrap()
        runtime.signal_registry.provider_owners["unknown"] = "pkg"
        with self.assertRaises(ValueError):
            runtime.register_briefing_provider("tasks", lambda context: BriefingResult(signals=[]))
        with self.assertRaises(ValueError):
            runtime.unregister_briefing_provider("tasks")

        runtime = KendallRuntime.bootstrap()
        runtime.action_dispatcher.handler_owners[("unknown", "create-task")] = "pkg"
        with self.assertRaises(ValueError):
            runtime.register_action_handler(
                "tasks",
                "create-task",
                lambda context: ActionResult(status="ok", reference_id=context.request.target),
            )
        with self.assertRaises(ValueError):
            runtime.unregister_action_handler("tasks", "create-task")

    def test_bootstrap_release_one_installs_expected_handlers_and_providers(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        self.assertTrue(runtime.module_packages.has("release-one"))
        self.assertTrue(runtime.module_packages.is_active("release-one"))
        self.assertIs(runtime.service_for_module("outlook"), runtime.module_services.get("outlook"))
        self.assertIsInstance(runtime.module_services.get("outlook"), OutlookModuleService)
        self.assertIsInstance(runtime.module_services.get("scheduling"), SchedulingModuleService)
        self.assertIsInstance(runtime.module_services.get("tasks"), TasksModuleService)
        self.assertTrue(runtime.is_module_installed("outlook"))
        self.assertTrue(runtime.is_module_installed("scheduling"))
        self.assertTrue(runtime.is_module_installed("tasks"))
        self.assertEqual(
            [module.contract.identity.module_id for module in runtime.list_installed_modules()],
            ["outlook", "scheduling", "tasks"],
        )
        self.assertIn("outlook", runtime.signal_registry.providers)
        self.assertIn("scheduling", runtime.signal_registry.providers)
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertIn(("scheduling", "create-tentative-internal-hold"), runtime.action_dispatcher.handlers)
        self.assertIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)
        self.assertIn(("tasks", "update-task"), runtime.action_dispatcher.handlers)
        self.assertIn(("tasks", "create-reminder"), runtime.action_dispatcher.handlers)
        self.assertIn(("tasks", "update-reminder"), runtime.action_dispatcher.handlers)

    def test_runtime_can_toggle_package_active_state(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        deactivated = runtime.module_packages.deactivate("release-one")
        deactivated.active = True
        self.assertFalse(runtime.module_packages.is_active("release-one"))
        self.assertFalse(runtime.is_module_operational("tasks"))
        self.assertTrue(runtime.is_module_installed("tasks"))
        self.assertEqual(runtime.list_operational_modules(), [])
        with self.assertRaises(ValueError):
            runtime.service_for_module("tasks")
        self.assertIs(runtime.service_for_module("tasks", require_operational=False), runtime.module_services.get("tasks"))
        activated = runtime.module_packages.activate("release-one")
        activated.active = False
        self.assertTrue(runtime.module_packages.is_active("release-one"))
        self.assertTrue(runtime.is_module_operational("tasks"))
        self.assertIs(runtime.service_for_module("tasks"), runtime.module_services.get("tasks"))
        self.assertEqual(
            [module.contract.identity.module_id for module in runtime.list_operational_modules()],
            ["outlook", "scheduling", "tasks"],
        )

    def test_runtime_can_uninstall_package(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        runtime.uninstall_module_package("release-one")

        self.assertFalse(runtime.module_packages.has("release-one"))
        self.assertFalse(runtime.is_module_installed("outlook"))
        self.assertFalse(runtime.is_module_installed("scheduling"))
        self.assertFalse(runtime.is_module_installed("tasks"))
        self.assertEqual(runtime.list_installed_modules(), [])
        self.assertIsNone(runtime.module_packages.package_id_for_module("tasks"))
        with self.assertRaises(ValueError):
            runtime.service_for_module("tasks", require_operational=False)

    def test_runtime_package_lifecycle_rejects_malformed_inputs(self) -> None:
        runtime = KendallRuntime.bootstrap()

        with self.assertRaises(ValueError):
            runtime.register_module_package("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            runtime.activate_module_package("")
        with self.assertRaises(ValueError):
            runtime.deactivate_module_package("") 
        with self.assertRaises(ValueError):
            runtime.uninstall_module_package("") 
        with self.assertRaises(ValueError):
            runtime._unregister_package_bindings("bad")  # type: ignore[arg-type]

        package = ModulePackage(package_id="fake-package")
        with self.assertRaises(KeyError):
            runtime.activate_module_package("missing-package")
        runtime._unregister_package_bindings(package)

    def test_package_registry_rejects_malformed_identifiers(self) -> None:
        registry = ModulePackageRegistry()

        with self.assertRaises(ValueError):
            registry.has("")
        with self.assertRaises(ValueError):
            registry.get("")
        with self.assertRaises(ValueError):
            registry.package_id_for_module("")

    def test_package_registry_mutation_methods_return_detached_objects(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        registered = runtime.module_packages.get_registered("release-one")
        registered.active = False
        self.assertTrue(runtime.module_packages.is_active("release-one"))

        deactivated = runtime.module_packages.deactivate("release-one")
        deactivated.active = True
        self.assertFalse(runtime.module_packages.is_active("release-one"))

        activated = runtime.module_packages.activate("release-one")
        activated.active = False
        self.assertTrue(runtime.module_packages.is_active("release-one"))

        removed = runtime.module_packages.remove("release-one")
        removed.active = False
        self.assertFalse(runtime.module_packages.has("release-one"))

    def test_package_registry_constructor_validates_and_detaches_state(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        registered = runtime.module_packages.get_registered("release-one")
        packages = {"release-one": registered}
        mapping = {"tasks": "release-one"}

        registry = ModulePackageRegistry(packages=packages, module_to_package=mapping)
        registered.active = False
        mapping["tasks"] = "other"

        self.assertTrue(registry.is_active("release-one"))
        self.assertEqual(registry.package_id_for_module("tasks"), "release-one")

    def test_package_registry_constructor_rejects_malformed_state(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        registered = runtime.module_packages.get_registered("release-one")

        with self.assertRaises(ValueError):
            ModulePackageRegistry(packages={"": registered})
        with self.assertRaises(ValueError):
            ModulePackageRegistry(packages={"release-one": "bad"})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModulePackageRegistry(packages={"other": registered})
        with self.assertRaises(ValueError):
            ModulePackageRegistry(packages={"release-one": registered}, module_to_package={"tasks": "other"})
        with self.assertRaises(ValueError):
            ModulePackageRegistry(packages={"release-one": registered}, module_to_package={"unknown": "release-one"})

    def test_package_registry_reads_reject_malformed_internal_state(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.module_packages.packages["release-one"] = "bad"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            runtime.register_module_package(ModulePackage(package_id="another-package"))
        with self.assertRaises(ValueError):
            runtime.module_packages.has("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.get("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.get_registered("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.is_active("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.package_id_for_module("tasks")
        with self.assertRaises(ValueError):
            runtime.module_packages.activate("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.deactivate("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.remove("release-one")
        with self.assertRaises(ValueError):
            runtime.module_packages.list()
        with self.assertRaises(ValueError):
            runtime.module_packages.list_registered()

    def test_runtime_public_accessors_reject_malformed_dependency_state(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        runtime.module_services.service_owners["unknown"] = "pkg"
        with self.assertRaises(ValueError):
            runtime.is_module_installed("tasks")
        with self.assertRaises(ValueError):
            runtime.service_for_module("tasks", require_operational=False)

        runtime = KendallRuntime.bootstrap_release_one()
        runtime.module_packages.packages["release-one"] = "bad"  # type: ignore[assignment]
        with self.assertRaises(ValueError):
            runtime.is_module_operational("tasks")
        with self.assertRaises(ValueError):
            runtime.list_operational_modules()

        runtime = KendallRuntime.bootstrap_release_one()
        runtime.module_manager.registry["tasks"] = "bad"  # type: ignore[assignment]
        with self.assertRaises(ValueError):
            runtime.list_installed_modules()


if __name__ == "__main__":
    unittest.main()
