from __future__ import annotations

import unittest
import tempfile
import json
from pathlib import Path

from kendall_runtime.briefing import BriefingSignal
from kendall_runtime.module_api import ActionResult, BriefingResult
from kendall_runtime.module_manager import ModuleManager
from kendall_runtime.policy import ActionRequest
from kendall_runtime.runtime import KendallRuntime
from kendall_runtime.status import MemoryBreakdown, ModuleCounts, ModuleStatus, PackageStatus, RuntimeStatusSnapshot


def _contract_payload(module_id: str, *, required_modules: list[str] | None = None) -> dict:
    return {
        "identity": {
            "module_id": module_id,
            "display_name": module_id.title(),
            "version": "0.1.0",
            "publisher": "test",
        },
        "capability": {
            "purpose": f"{module_id} purpose",
            "scope_of_agency": "internal-action",
        },
        "data_access": {
            "readable_data_classes": [],
            "writable_data_classes": [],
            "forbidden_data_classes": [],
        },
        "actions": {
            "advisory_outputs": [],
            "drafting_outputs": [],
            "internal_actions": [],
            "external_actions": [],
            "forbidden_actions": [],
        },
        "trust": {
            "initial_posture": "advisory",
            "supported_autonomy_levels": ["shadow", "advisory"],
            "approval_required_for": [],
            "blocked_in_release_1": [],
        },
        "memory": {
            "readable_memory_classes": [],
            "writable_memory_classes": [],
            "accepted_correction_types": [],
            "shared_preference_propagation": False,
        },
        "privacy": {
            "local_only_by_default": True,
            "hosted_eligible_data_classes": [],
            "forbidden_outbound_contexts": [],
            "sanitization_required": True,
        },
        "observability": {
            "status_events": [],
            "audit_event_types": [],
            "metrics": [],
        },
        "dependencies": {
            "required_core_capabilities": [],
            "required_modules": required_modules or [],
            "optional_modules": [],
        },
        "installation": {
            "setup_steps": [],
            "restart_required": False,
            "migrations": [],
            "compatible_core_versions": ["0.1.x"],
        },
    }


def _write_contract(root: Path, folder_name: str, payload: dict) -> None:
    module_dir = root / folder_name
    module_dir.mkdir(parents=True, exist_ok=True)
    (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")


class StatusServiceTests(unittest.TestCase):
    def test_snapshot_reports_module_and_runtime_counters(self) -> None:
        runtime = KendallRuntime.bootstrap()
        runtime.signal_registry.register_provider(
            "tasks",
            lambda context: BriefingResult(
                signals=[BriefingSignal(module_id="tasks", summary=f"{context.briefing_type} tasks")]
            ),
        )
        runtime.action_dispatcher.register_handler(
            "tasks",
            "create-task",
            lambda context: ActionResult(status="ok", reference_id=context.request.target),
        )
        runtime.memory_for_module("tasks").put("domain-preference", "priority", "high", "user")
        runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-1",
            )
        )

        snapshot = runtime.status_service.snapshot()
        self.assertEqual(snapshot.packages, [])
        self.assertEqual(snapshot.module_counts.total_count, 3)
        self.assertEqual(snapshot.module_counts.enabled_count, 3)
        self.assertEqual(snapshot.module_counts.disabled_count, 0)
        self.assertEqual(snapshot.module_counts.operational_count, 3)
        self.assertEqual(snapshot.module_counts.installed_count, 1)
        self.assertEqual(snapshot.package_counts.total_count, 0)
        self.assertEqual(snapshot.package_counts.active_count, 0)
        self.assertEqual(snapshot.package_counts.inactive_count, 0)
        self.assertEqual(snapshot.privacy_surface_breakdown.local_only_module_count, 3)
        self.assertEqual(snapshot.privacy_surface_breakdown.hosted_eligible_module_count, 0)
        self.assertEqual(snapshot.privacy_surface_breakdown.sanitization_required_module_count, 3)
        tasks_status = next(module for module in snapshot.modules if module.module_id == "tasks")

        self.assertTrue(tasks_status.enabled)
        self.assertIsNone(tasks_status.package_id)
        self.assertTrue(tasks_status.package_active)
        self.assertTrue(tasks_status.operational)
        self.assertTrue(tasks_status.installed)
        self.assertEqual(tasks_status.configured_posture, "internal-action-limited")
        self.assertEqual(tasks_status.effective_posture, "internal-action-limited")
        self.assertFalse(tasks_status.has_service)
        self.assertIsNone(tasks_status.service_owner_package_id)
        self.assertTrue(tasks_status.has_signal_provider)
        self.assertIsNone(tasks_status.signal_provider_owner_package_id)
        self.assertEqual(tasks_status.registered_action_count, 1)
        self.assertEqual(tasks_status.direct_action_count, 1)
        self.assertEqual(tasks_status.package_action_count, 0)
        self.assertEqual(snapshot.audit_record_count, 1)
        self.assertEqual(snapshot.audit_breakdown.policy_denied_count, 0)
        self.assertEqual(snapshot.audit_breakdown.execution_failed_count, 0)
        self.assertEqual(snapshot.audit_breakdown.successful_action_count, 1)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_service_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_service_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_signal_provider_count, 1)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_signal_provider_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_action_count, 1)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_action_count, 0)
        self.assertEqual(snapshot.memory_breakdown.entry_count_by_class["domain_preference"], 1)
        self.assertEqual(snapshot.memory_breakdown.entry_count_by_class["core_preference"], 0)
        self.assertEqual(snapshot.reversible_audit_count, 1)
        self.assertEqual(snapshot.memory_entry_count, 1)

    def test_snapshot_is_detached_from_returned_mutation(self) -> None:
        runtime = KendallRuntime.bootstrap()

        snapshot = runtime.status_service.snapshot()
        snapshot.modules[0].effective_posture = "shadow"
        snapshot.load_failures.append("mutated")
        snapshot.memory_breakdown.entry_count_by_class["domain_preference"] = 99

        refreshed = runtime.status_service.snapshot()
        self.assertNotEqual(refreshed.modules[0].effective_posture, "shadow")
        self.assertNotIn("mutated", refreshed.load_failures)
        self.assertEqual(refreshed.memory_breakdown.entry_count_by_class["domain_preference"], 0)

    def test_status_types_detach_constructor_inputs(self) -> None:
        runtime = KendallRuntime.bootstrap()
        baseline = runtime.status_service.snapshot()
        package = PackageStatus(
            package_id="pkg",
            display_name="Package",
            version="0.1.0",
            active=True,
            module_ids=["tasks"],
        )
        module = ModuleStatus(
            module_id="tasks",
            enabled=True,
            package_id="pkg",
            package_active=True,
            operational=True,
            installed=True,
            version="0.1.0",
            configured_posture="advisory",
            effective_posture="advisory",
            has_service=True,
            service_owner_package_id="pkg",
            has_signal_provider=False,
            signal_provider_owner_package_id=None,
            registered_action_count=1,
            direct_action_count=0,
            package_action_count=1,
        )
        packages = [package]
        modules = [module]
        failures = ["failed"]
        memory_counts = {"core_preference": 1}

        snapshot = RuntimeStatusSnapshot(
            packages=packages,
            modules=modules,
            module_counts=ModuleCounts(1, 1, 0, 1, 1),
            package_counts=baseline.package_counts.__class__(total_count=1, active_count=1, inactive_count=0),
            privacy_surface_breakdown=baseline.privacy_surface_breakdown.__class__(1, 0, 1),
            load_failures=failures,
            load_failure_breakdown=baseline.load_failure_breakdown.__class__(0, 0, 0, 0, 0, 0, 1),
            installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(1, 0, 0, 0, 1, 0),
            memory_breakdown=MemoryBreakdown(entry_count_by_class=memory_counts),
            audit_record_count=0,
            audit_breakdown=baseline.audit_breakdown.clone(),
            reversible_audit_count=0,
            memory_entry_count=1,
        )

        package.module_ids[0] = "mutated"
        packages[0] = PackageStatus(package_id="other", display_name="Other", version="0.1.0", active=True, module_ids=["other"])
        modules[0].effective_posture = "shadow"
        baseline.module_counts.total_count = 99
        baseline.package_counts.total_count = 99
        baseline.privacy_surface_breakdown.local_only_module_count = 99
        failures[0] = "mutated"
        baseline.load_failure_breakdown.invalid_contract_count = 99
        baseline.installed_surface_breakdown.direct_action_count = 99
        memory_counts["core_preference"] = 99
        baseline.audit_breakdown.successful_action_count = 99

        self.assertEqual(snapshot.packages[0].module_ids, ["tasks"])
        self.assertEqual(snapshot.modules[0].effective_posture, "advisory")
        self.assertEqual(snapshot.module_counts.total_count, 1)
        self.assertEqual(snapshot.package_counts.total_count, 1)
        self.assertEqual(snapshot.privacy_surface_breakdown.local_only_module_count, 1)
        self.assertEqual(snapshot.load_failures, ["failed"])
        self.assertEqual(snapshot.load_failure_breakdown.invalid_contract_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_action_count, 0)
        self.assertEqual(snapshot.memory_breakdown.entry_count_by_class["core_preference"], 1)
        self.assertEqual(snapshot.audit_breakdown.successful_action_count, 0)

    def test_snapshot_reports_audit_breakdown(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-1",
                details={"title": "Prepare briefing", "priority": "high", "status": "open"},
            )
        )
        runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-reminder",
                mode="external",
                target="reminder-1",
            )
        )
        runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-bad",
                details={"title": "Prepare briefing", "priority": "urgent"},
            )
        )

        snapshot = runtime.status_service.snapshot()

        self.assertEqual(snapshot.audit_record_count, 3)
        self.assertEqual(snapshot.audit_breakdown.policy_denied_count, 1)
        self.assertEqual(snapshot.audit_breakdown.execution_failed_count, 1)
        self.assertEqual(snapshot.audit_breakdown.successful_action_count, 1)

    def test_release_one_bootstrap_registers_expected_module_surfaces(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()

        snapshot = runtime.status_service.snapshot()
        self.assertEqual(len(snapshot.packages), 1)
        self.assertEqual(snapshot.module_counts.total_count, 3)
        self.assertEqual(snapshot.module_counts.enabled_count, 3)
        self.assertEqual(snapshot.module_counts.disabled_count, 0)
        self.assertEqual(snapshot.module_counts.operational_count, 3)
        self.assertEqual(snapshot.module_counts.installed_count, 3)
        self.assertEqual(snapshot.package_counts.total_count, 1)
        self.assertEqual(snapshot.package_counts.active_count, 1)
        self.assertEqual(snapshot.package_counts.inactive_count, 0)
        self.assertEqual(snapshot.privacy_surface_breakdown.local_only_module_count, 3)
        self.assertEqual(snapshot.privacy_surface_breakdown.hosted_eligible_module_count, 0)
        self.assertEqual(snapshot.privacy_surface_breakdown.sanitization_required_module_count, 3)
        self.assertEqual(snapshot.packages[0].package_id, "release-one")
        self.assertEqual(snapshot.packages[0].display_name, "Release 1 Core Bundle")
        self.assertTrue(snapshot.packages[0].active)
        self.assertEqual(snapshot.packages[0].module_ids, ["outlook", "scheduling", "tasks"])
        self.assertEqual(snapshot.installed_surface_breakdown.direct_service_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_service_count, 3)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_signal_provider_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_signal_provider_count, 3)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_action_count, 0)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_action_count, 5)
        self.assertEqual(snapshot.memory_breakdown.entry_count_by_class["core_preference"], 0)
        self.assertEqual(snapshot.memory_breakdown.entry_count_by_class["domain_preference"], 0)
        by_module = {module.module_id: module for module in snapshot.modules}

        self.assertEqual(by_module["outlook"].package_id, "release-one")
        self.assertTrue(by_module["outlook"].package_active)
        self.assertTrue(by_module["outlook"].operational)
        self.assertTrue(by_module["outlook"].installed)
        self.assertEqual(by_module["outlook"].configured_posture, "approval-bound")
        self.assertEqual(by_module["outlook"].effective_posture, "approval-bound")
        self.assertTrue(by_module["outlook"].has_service)
        self.assertEqual(by_module["outlook"].service_owner_package_id, "release-one")
        self.assertTrue(by_module["outlook"].has_signal_provider)
        self.assertEqual(by_module["outlook"].signal_provider_owner_package_id, "release-one")
        self.assertEqual(by_module["outlook"].registered_action_count, 0)
        self.assertEqual(by_module["outlook"].direct_action_count, 0)
        self.assertEqual(by_module["outlook"].package_action_count, 0)
        self.assertEqual(by_module["scheduling"].package_id, "release-one")
        self.assertTrue(by_module["scheduling"].package_active)
        self.assertTrue(by_module["scheduling"].operational)
        self.assertTrue(by_module["scheduling"].installed)
        self.assertEqual(by_module["scheduling"].configured_posture, "internal-action-limited")
        self.assertEqual(by_module["scheduling"].effective_posture, "internal-action-limited")
        self.assertTrue(by_module["scheduling"].has_service)
        self.assertEqual(by_module["scheduling"].service_owner_package_id, "release-one")
        self.assertTrue(by_module["scheduling"].has_signal_provider)
        self.assertEqual(by_module["scheduling"].signal_provider_owner_package_id, "release-one")
        self.assertEqual(by_module["scheduling"].registered_action_count, 1)
        self.assertEqual(by_module["scheduling"].direct_action_count, 0)
        self.assertEqual(by_module["scheduling"].package_action_count, 1)
        self.assertEqual(by_module["tasks"].package_id, "release-one")
        self.assertTrue(by_module["tasks"].package_active)
        self.assertTrue(by_module["tasks"].operational)
        self.assertTrue(by_module["tasks"].installed)
        self.assertEqual(by_module["tasks"].configured_posture, "internal-action-limited")
        self.assertEqual(by_module["tasks"].effective_posture, "internal-action-limited")
        self.assertTrue(by_module["tasks"].has_service)
        self.assertEqual(by_module["tasks"].service_owner_package_id, "release-one")
        self.assertTrue(by_module["tasks"].has_signal_provider)
        self.assertEqual(by_module["tasks"].signal_provider_owner_package_id, "release-one")
        self.assertEqual(by_module["tasks"].registered_action_count, 4)
        self.assertEqual(by_module["tasks"].direct_action_count, 0)
        self.assertEqual(by_module["tasks"].package_action_count, 4)
        self.assertTrue(runtime.module_services.has("outlook"))
        self.assertTrue(runtime.module_services.has("scheduling"))
        self.assertTrue(runtime.module_services.has("tasks"))

    def test_status_snapshot_distinguishes_direct_and_package_managed_actions(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.register_action_handler(
            "tasks",
            "task-summary",
            lambda context: ActionResult(status="ok", reference_id=context.request.target),
        )

        snapshot = runtime.status_service.snapshot()

        by_module = {module.module_id: module for module in snapshot.modules}
        self.assertEqual(by_module["tasks"].registered_action_count, 5)
        self.assertEqual(by_module["tasks"].direct_action_count, 1)
        self.assertEqual(by_module["tasks"].package_action_count, 4)
        self.assertEqual(snapshot.installed_surface_breakdown.direct_action_count, 1)
        self.assertEqual(snapshot.installed_surface_breakdown.package_managed_action_count, 5)

    def test_status_snapshot_reflects_package_deactivation(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.deactivate_module_package("release-one")

        snapshot = runtime.status_service.snapshot()

        self.assertEqual(len(snapshot.packages), 1)
        self.assertFalse(snapshot.packages[0].active)
        self.assertEqual(snapshot.module_counts.operational_count, 0)
        self.assertEqual(snapshot.module_counts.installed_count, 3)
        self.assertEqual(snapshot.package_counts.total_count, 1)
        self.assertEqual(snapshot.package_counts.active_count, 0)
        self.assertEqual(snapshot.package_counts.inactive_count, 1)
        by_module = {module.module_id: module for module in snapshot.modules}
        self.assertFalse(by_module["outlook"].package_active)
        self.assertFalse(by_module["outlook"].operational)
        self.assertTrue(by_module["outlook"].installed)
        self.assertFalse(by_module["scheduling"].package_active)
        self.assertFalse(by_module["scheduling"].operational)
        self.assertTrue(by_module["scheduling"].installed)
        self.assertFalse(by_module["tasks"].package_active)
        self.assertFalse(by_module["tasks"].operational)
        self.assertTrue(by_module["tasks"].installed)

    def test_status_snapshot_distinguishes_operational_from_installed(self) -> None:
        runtime = KendallRuntime.bootstrap()

        snapshot = runtime.status_service.snapshot()

        by_module = {module.module_id: module for module in snapshot.modules}
        self.assertTrue(by_module["tasks"].operational)
        self.assertFalse(by_module["tasks"].installed)
        self.assertEqual(snapshot.module_counts.installed_count, 0)

    def test_status_snapshot_reflects_package_uninstall(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.uninstall_module_package("release-one")

        snapshot = runtime.status_service.snapshot()

        self.assertEqual(snapshot.packages, [])
        self.assertEqual(snapshot.module_counts.operational_count, 3)
        self.assertEqual(snapshot.module_counts.installed_count, 0)
        self.assertEqual(snapshot.package_counts.total_count, 0)
        self.assertEqual(snapshot.package_counts.active_count, 0)
        self.assertEqual(snapshot.package_counts.inactive_count, 0)
        by_module = {module.module_id: module for module in snapshot.modules}
        self.assertIsNone(by_module["outlook"].package_id)
        self.assertTrue(by_module["outlook"].package_active)
        self.assertTrue(by_module["outlook"].operational)
        self.assertFalse(by_module["outlook"].installed)

    def test_status_snapshot_reports_effective_posture_override(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.trust_service.set_posture("tasks", "shadow")

        snapshot = runtime.status_service.snapshot()

        by_module = {module.module_id: module for module in snapshot.modules}
        self.assertEqual(by_module["tasks"].configured_posture, "internal-action-limited")
        self.assertEqual(by_module["tasks"].effective_posture, "shadow")

    def test_status_snapshot_reports_load_failure_breakdown(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_contract(root, "dup-a", _contract_payload("dup"))
            _write_contract(root, "dup-b", _contract_payload("dup"))
            _write_contract(root, "consumer", _contract_payload("consumer", required_modules=["provider"]))
            broken_dir = root / "broken"
            broken_dir.mkdir()
            (broken_dir / "module.contract.json").write_text('{"identity": {}}', encoding="utf-8")
            (root / "missing-contract").mkdir()

            runtime = KendallRuntime(module_manager=ModuleManager.discover(root))

        snapshot = runtime.status_service.snapshot()

        self.assertEqual(snapshot.load_failure_breakdown.missing_contract_count, 1)
        self.assertEqual(snapshot.load_failure_breakdown.invalid_contract_count, 1)
        self.assertEqual(snapshot.load_failure_breakdown.duplicate_module_id_count, 2)
        self.assertEqual(snapshot.load_failure_breakdown.missing_dependency_count, 1)
        self.assertEqual(snapshot.load_failure_breakdown.other_count, 0)

    def test_status_snapshot_reports_root_level_load_failures(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_root = Path(temp_dir) / "missing"
            missing_runtime = KendallRuntime(module_manager=ModuleManager.discover(missing_root))
            root_file = Path(temp_dir) / "modules.json"
            root_file.write_text("{}", encoding="utf-8")
            file_runtime = KendallRuntime(module_manager=ModuleManager.discover(root_file))

        missing_snapshot = missing_runtime.status_service.snapshot()
        file_snapshot = file_runtime.status_service.snapshot()

        self.assertEqual(missing_snapshot.load_failure_breakdown.missing_root_count, 1)
        self.assertEqual(missing_snapshot.load_failure_breakdown.invalid_contract_count, 0)
        self.assertEqual(missing_snapshot.load_failure_breakdown.other_count, 0)
        self.assertEqual(file_snapshot.load_failure_breakdown.non_directory_root_count, 1)
        self.assertEqual(file_snapshot.load_failure_breakdown.invalid_contract_count, 0)
        self.assertEqual(file_snapshot.load_failure_breakdown.other_count, 0)

    def test_status_types_reject_malformed_construction(self) -> None:
        runtime = KendallRuntime.bootstrap()
        baseline = runtime.status_service.snapshot()
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="",
                enabled=True,
                package_id=None,
                package_active=True,
                operational=True,
                installed=False,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=False,
                service_owner_package_id=None,
                has_signal_provider=False,
                signal_provider_owner_package_id=None,
                registered_action_count=0,
                direct_action_count=0,
                package_action_count=0,
            )
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="tasks",
                enabled=True,
                package_id=None,
                package_active=False,
                operational=False,
                installed=False,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=False,
                service_owner_package_id=None,
                has_signal_provider=False,
                signal_provider_owner_package_id=None,
                registered_action_count=0,
                direct_action_count=0,
                package_action_count=0,
            )
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="tasks",
                enabled=False,
                package_id=None,
                package_active=True,
                operational=True,
                installed=False,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=False,
                service_owner_package_id=None,
                has_signal_provider=False,
                signal_provider_owner_package_id=None,
                registered_action_count=0,
                direct_action_count=0,
                package_action_count=0,
            )
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="tasks",
                enabled=True,
                package_id=None,
                package_active=True,
                operational=True,
                installed=False,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=False,
                service_owner_package_id="pkg",
                has_signal_provider=False,
                signal_provider_owner_package_id=None,
                registered_action_count=0,
                direct_action_count=0,
                package_action_count=0,
            )
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="tasks",
                enabled=True,
                package_id=None,
                package_active=True,
                operational=True,
                installed=False,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=False,
                service_owner_package_id=None,
                has_signal_provider=False,
                signal_provider_owner_package_id="pkg",
                registered_action_count=0,
                direct_action_count=0,
                package_action_count=0,
            )
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="tasks",
                enabled=True,
                package_id=None,
                package_active=True,
                operational=True,
                installed=True,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=True,
                service_owner_package_id=None,
                has_signal_provider=False,
                signal_provider_owner_package_id=None,
                registered_action_count=2,
                direct_action_count=1,
                package_action_count=0,
            )
        with self.assertRaises(ValueError):
            ModuleStatus(
                module_id="tasks",
                enabled=True,
                package_id=None,
                package_active=True,
                operational=True,
                installed=True,
                version="0.1.0",
                configured_posture="advisory",
                effective_posture="advisory",
                has_service=False,
                service_owner_package_id=None,
                has_signal_provider=False,
                signal_provider_owner_package_id=None,
                registered_action_count=1,
                direct_action_count=0,
                package_action_count=1,
            )
        with self.assertRaises(ValueError):
            PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=True, module_ids=[""])
        with self.assertRaises(ValueError):
            PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=True, module_ids="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            MemoryBreakdown(entry_count_by_class={"core_preference": -1})
        with self.assertRaises(ValueError):
            ModuleCounts(total_count=1, enabled_count=1, disabled_count=1, operational_count=1, installed_count=1)
        with self.assertRaises(ValueError):
            ModuleCounts(total_count=1, enabled_count=1, disabled_count=0, operational_count=2, installed_count=1)
        with self.assertRaises(ValueError):
            ModuleCounts(total_count=1, enabled_count=1, disabled_count=0, operational_count=1, installed_count=2)
        with self.assertRaises(ValueError):
            baseline.package_counts.__class__(total_count=1, active_count=1, inactive_count=1)
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages="bad",  # type: ignore[arg-type]
                modules=[],
                module_counts=ModuleCounts(0, 0, 0, 0, 0),
                package_counts=baseline.package_counts.clone(),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.clone(),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.clone(),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[],
                modules=[],
                module_counts=ModuleCounts(0, 0, 0, 0, 0),
                package_counts="bad",  # type: ignore[arg-type]
                privacy_surface_breakdown=object(),  # type: ignore[arg-type]
                load_failures=[],
                load_failure_breakdown=object(),  # type: ignore[arg-type]
                installed_surface_breakdown=object(),  # type: ignore[arg-type]
                memory_breakdown=MemoryBreakdown(entry_count_by_class={}),
                audit_record_count=0,
                audit_breakdown=object(),  # type: ignore[arg-type]
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        package = PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=True, module_ids=["tasks"])
        module = ModuleStatus(
            module_id="tasks",
            enabled=True,
            package_id="pkg",
            package_active=True,
            operational=True,
            installed=True,
            version="0.1.0",
            configured_posture="advisory",
            effective_posture="advisory",
            has_service=True,
            service_owner_package_id="pkg",
            has_signal_provider=False,
            signal_provider_owner_package_id=None,
            registered_action_count=1,
            direct_action_count=0,
            package_action_count=1,
        )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[package],
                modules=[module],
                module_counts=ModuleCounts(1, 1, 0, 1, 1),
                package_counts=baseline.package_counts.clone(),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.clone(),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(0, 0, 0, 0, 0, 0),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={"core_preference": 0}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[],
                modules=[module],
                module_counts=ModuleCounts(1, 1, 0, 1, 1),
                package_counts=baseline.package_counts.clone(),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.clone(),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(0, 0, 0, 0, 0, 0),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={"core_preference": 1}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=1,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[],
                modules=[],
                module_counts=ModuleCounts(0, 0, 0, 0, 0),
                package_counts=baseline.package_counts.clone(),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.__class__(1, 0, 0),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.clone(),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[],
                modules=[],
                module_counts=ModuleCounts(0, 0, 0, 0, 0),
                package_counts=baseline.package_counts.clone(),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.clone(),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.clone(),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={}),
                audit_record_count=1,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        package = PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=True, module_ids=["tasks"])
        duplicate_package = PackageStatus(package_id="pkg", display_name="Other", version="0.1.0", active=True, module_ids=["outlook"])
        duplicate_module = ModuleStatus(
            module_id="tasks",
            enabled=True,
            package_id="pkg",
            package_active=True,
            operational=True,
            installed=True,
            version="0.1.0",
            configured_posture="advisory",
            effective_posture="advisory",
            has_service=True,
            service_owner_package_id="pkg",
            has_signal_provider=False,
            signal_provider_owner_package_id=None,
            registered_action_count=1,
            direct_action_count=0,
            package_action_count=1,
        )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[package, duplicate_package],
                modules=[duplicate_module],
                module_counts=ModuleCounts(1, 1, 0, 1, 1),
                package_counts=baseline.package_counts.__class__(total_count=2, active_count=2, inactive_count=0),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.__class__(1, 0, 1),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(1, 0, 0, 0, 1, 0),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={"core_preference": 0}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=True, module_ids=["tasks", "tasks"])],
                modules=[duplicate_module],
                module_counts=ModuleCounts(1, 1, 0, 1, 1),
                package_counts=baseline.package_counts.__class__(total_count=1, active_count=1, inactive_count=0),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.__class__(1, 0, 1),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(1, 0, 0, 0, 1, 0),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={"core_preference": 0}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=True, module_ids=["outlook"])],
                modules=[duplicate_module],
                module_counts=ModuleCounts(1, 1, 0, 1, 1),
                package_counts=baseline.package_counts.__class__(total_count=1, active_count=1, inactive_count=0),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.__class__(1, 0, 1),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(1, 0, 0, 0, 1, 0),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={"core_preference": 0}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            RuntimeStatusSnapshot(
                packages=[PackageStatus(package_id="pkg", display_name="Package", version="0.1.0", active=False, module_ids=["tasks"])],
                modules=[duplicate_module],
                module_counts=ModuleCounts(1, 1, 0, 1, 1),
                package_counts=baseline.package_counts.__class__(total_count=1, active_count=0, inactive_count=1),
                privacy_surface_breakdown=baseline.privacy_surface_breakdown.__class__(1, 0, 1),
                load_failures=[],
                load_failure_breakdown=baseline.load_failure_breakdown.clone(),
                installed_surface_breakdown=baseline.installed_surface_breakdown.__class__(1, 0, 0, 0, 1, 0),
                memory_breakdown=MemoryBreakdown(entry_count_by_class={"core_preference": 0}),
                audit_record_count=0,
                audit_breakdown=baseline.audit_breakdown.clone(),
                reversible_audit_count=0,
                memory_entry_count=0,
            )
        with self.assertRaises(ValueError):
            type(runtime.status_service)(
                module_manager="bad",  # type: ignore[arg-type]
                audit_service=runtime.audit_service,
                memory_service=runtime.memory_service,
                trust_service=runtime.trust_service,
                action_dispatcher=runtime.action_dispatcher,
                signal_registry=runtime.signal_registry,
                module_services=runtime.module_services,
                module_packages=runtime.module_packages,
            )
        with self.assertRaises(ValueError):
            type(runtime.status_service)(
                module_manager=runtime.module_manager,
                audit_service=runtime.audit_service,
                memory_service=runtime.memory_service,
                trust_service=runtime.trust_service,
                action_dispatcher=runtime.action_dispatcher,
                signal_registry=runtime.signal_registry,
                module_services="bad",  # type: ignore[arg-type]
                module_packages=runtime.module_packages,
            )

    def test_status_helpers_reject_malformed_collections(self) -> None:
        runtime = KendallRuntime.bootstrap()

        with self.assertRaises(ValueError):
            runtime.status_service._summarize_load_failures("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            runtime.status_service._summarize_load_failures([""]) 
        with self.assertRaises(ValueError):
            runtime.status_service._summarize_installed_surfaces("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            runtime.status_service._summarize_installed_surfaces([object()])  # type: ignore[list-item]


if __name__ == "__main__":
    unittest.main()
