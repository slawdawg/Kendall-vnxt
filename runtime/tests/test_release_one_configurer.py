from __future__ import annotations

import unittest

from kendall_runtime.module_services import OutlookModuleService
from kendall_runtime.release_one import ReleaseOneConfigurer, install_release_one
from kendall_runtime.runtime import KendallRuntime


class WrongOutlookService:
    module_id = "outlook"

    def collect_briefing(self, context):
        return None


class WrongTasksService(OutlookModuleService):
    module_id = "outlook"


class MissingTaskMethodService:
    module_id = "tasks"

    def collect_briefing(self, context):
        return None

    def create_task(self, context):
        return None

    def update_task(self, context):
        return None

    def create_reminder(self, context):
        return None


class ReleaseOneConfigurerTests(unittest.TestCase):
    def test_configurer_rejects_malformed_runtime_and_service_ownership(self) -> None:
        with self.assertRaises(ValueError):
            ReleaseOneConfigurer(runtime="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ReleaseOneConfigurer(KendallRuntime.bootstrap(), outlook=WrongOutlookService())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ReleaseOneConfigurer(KendallRuntime.bootstrap(), tasks=WrongTasksService())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ReleaseOneConfigurer(KendallRuntime.bootstrap(), tasks=MissingTaskMethodService())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            install_release_one("bad")  # type: ignore[arg-type]

    def test_package_wraps_release_one_bindings(self) -> None:
        configurer = ReleaseOneConfigurer(KendallRuntime.bootstrap())
        package = configurer.package()

        self.assertEqual(package.package_id, "release-one")
        self.assertEqual(package.display_name, "Release 1 Core Bundle")
        self.assertEqual(package.version, "0.1.0")
        self.assertEqual([binding.module_id for binding in package.module_bindings], ["outlook", "scheduling", "tasks"])

    def test_bindings_describe_expected_release_one_surface(self) -> None:
        configurer = ReleaseOneConfigurer(KendallRuntime.bootstrap())
        bindings = configurer.bindings()
        by_module = {binding.module_id: binding for binding in bindings}

        self.assertEqual(sorted(by_module), ["outlook", "scheduling", "tasks"])
        self.assertEqual(by_module["outlook"].briefing_method_name, "collect_briefing")
        self.assertEqual(
            [binding.action_type for binding in by_module["scheduling"].action_bindings],
            ["create-tentative-internal-hold"],
        )
        self.assertEqual(
            [binding.action_type for binding in by_module["tasks"].action_bindings],
            ["create-task", "update-task", "create-reminder", "update-reminder"],
        )

    def test_package_and_bindings_are_detached_between_calls(self) -> None:
        configurer = ReleaseOneConfigurer(KendallRuntime.bootstrap())

        bindings = configurer.bindings()
        bindings[0].module_id = "mutated"
        bindings[0].service.module_id = "mutated"  # type: ignore[attr-defined]
        package = configurer.package()
        package.module_bindings[0].module_id = "mutated"
        package.module_bindings[0].service.module_id = "mutated"  # type: ignore[attr-defined]

        self.assertEqual(configurer.bindings()[0].module_id, "outlook")
        self.assertEqual(configurer.bindings()[0].service.module_id, "outlook")  # type: ignore[attr-defined]
        self.assertEqual(configurer.package().module_bindings[0].module_id, "outlook")
        self.assertEqual(configurer.package().module_bindings[0].service.module_id, "outlook")  # type: ignore[attr-defined]

    def test_install_applies_manifest_to_runtime(self) -> None:
        runtime = KendallRuntime.bootstrap()
        configurer = ReleaseOneConfigurer(runtime)

        configurer.install()

        self.assertTrue(runtime.module_services.has("outlook"))
        self.assertTrue(runtime.module_services.has("scheduling"))
        self.assertTrue(runtime.module_services.has("tasks"))
        self.assertIn("outlook", runtime.signal_registry.providers)
        self.assertIn("scheduling", runtime.signal_registry.providers)
        self.assertIn("tasks", runtime.signal_registry.providers)
        self.assertIn(("scheduling", "create-tentative-internal-hold"), runtime.action_dispatcher.handlers)
        self.assertIn(("tasks", "create-task"), runtime.action_dispatcher.handlers)


if __name__ == "__main__":
    unittest.main()
