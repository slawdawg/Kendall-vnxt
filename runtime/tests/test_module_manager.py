from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from kendall_runtime.module_loader import discover_modules
from kendall_runtime.module_manager import ModuleManager, RegisteredModule
from kendall_runtime.paths import modules_root


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


def _write_contract(root: Path, folder_name: str, module_id: str, *, required_modules: list[str] | None = None) -> None:
    module_dir = root / folder_name
    module_dir.mkdir(parents=True, exist_ok=True)
    (module_dir / "module.contract.json").write_text(
        json.dumps(_contract_payload(module_id, required_modules=required_modules)),
        encoding="utf-8",
    )


class ModuleManagerTests(unittest.TestCase):
    def test_registers_release_one_modules(self) -> None:
        manager = ModuleManager.discover(modules_root())
        self.assertEqual(sorted(manager.registry), ["outlook", "scheduling", "tasks"])
        self.assertEqual(manager.load_failures, [])
        self.assertEqual(len(manager.list_modules(enabled_only=True)), 3)

    def test_module_snapshots_are_detached_from_contract_mutation(self) -> None:
        manager = ModuleManager.discover(modules_root())

        listed = manager.list_modules()
        listed[0].contract.identity.display_name = "Mutated"
        fetched = manager.get_module(listed[0].contract.identity.module_id)
        fetched.contract.actions["internal_actions"] = ["mutated"]

        refreshed = manager.get_module(listed[0].contract.identity.module_id)
        self.assertNotEqual(refreshed.contract.identity.display_name, "Mutated")
        self.assertNotEqual(refreshed.contract.actions.get("internal_actions"), ["mutated"])

    def test_register_discovery_detaches_loaded_contracts(self) -> None:
        discovery = discover_modules(modules_root())
        manager = ModuleManager.from_discovery(discovery)

        discovery.loaded[0].contract.identity.display_name = "Mutated"
        discovery.loaded[0].contract.actions["internal_actions"] = ["mutated"]

        refreshed = manager.get_module(discovery.loaded[0].contract.identity.module_id)
        self.assertNotEqual(refreshed.contract.identity.display_name, "Mutated")
        self.assertNotEqual(refreshed.contract.actions.get("internal_actions"), ["mutated"])

    def test_registered_module_detaches_direct_constructor_contract(self) -> None:
        contract = discover_modules(modules_root()).loaded[0].contract
        registered = RegisteredModule(contract=contract, module_dir=modules_root() / "tasks")
        contract.identity.display_name = "Mutated"

        self.assertNotEqual(registered.contract.identity.display_name, "Mutated")

    def test_module_manager_constructor_validates_and_detaches_registry(self) -> None:
        contract = discover_modules(modules_root()).loaded[0].contract
        registered = RegisteredModule(contract=contract, module_dir=modules_root() / "tasks")
        registry = {contract.identity.module_id: registered}
        failures = ["seed failure"]

        manager = ModuleManager(registry=registry, load_failures=failures)
        registered.enabled = False
        failures[0] = "mutated"

        self.assertTrue(manager.is_enabled(contract.identity.module_id))
        self.assertEqual(manager.list_load_failures(), ["seed failure"])

    def test_module_manager_constructor_rejects_malformed_state(self) -> None:
        contract = discover_modules(modules_root()).loaded[0].contract
        registered = RegisteredModule(contract=contract, module_dir=modules_root() / "tasks")

        with self.assertRaises(ValueError):
            ModuleManager(registry={"": registered})
        with self.assertRaises(ValueError):
            ModuleManager(registry={contract.identity.module_id: "bad"})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleManager(registry={"other": registered})
        with self.assertRaises(ValueError):
            ModuleManager(load_failures=["", "ok"])
        with self.assertRaises(ValueError):
            ModuleManager.from_discovery("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleManager.discover("bad")  # type: ignore[arg-type]

    def test_enable_disable_updates_module_state(self) -> None:
        manager = ModuleManager.discover(modules_root())
        manager.disable_module("tasks")
        self.assertFalse(manager.is_enabled("tasks"))
        manager.enable_module("tasks")
        self.assertTrue(manager.is_enabled("tasks"))

    def test_registered_module_rejects_malformed_construction(self) -> None:
        contract = discover_modules(modules_root()).loaded[0].contract

        with self.assertRaises(ValueError):
            RegisteredModule(contract="bad", module_dir=Path("."))  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            RegisteredModule(contract=contract, module_dir="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            RegisteredModule(contract=contract, module_dir=Path("."), enabled="yes")  # type: ignore[arg-type]

    def test_duplicate_module_ids_are_rejected_from_registry(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_contract(root, "tasks-a", "tasks")
            _write_contract(root, "tasks-b", "tasks")

            manager = ModuleManager.discover(root)

        self.assertEqual(manager.registry, {})
        self.assertEqual(
            sorted(manager.load_failures),
            [
                "tasks-a: duplicate module_id: tasks",
                "tasks-b: duplicate module_id: tasks",
            ],
        )

    def test_missing_required_module_disables_dependent_at_discovery(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_contract(root, "consumer", "consumer", required_modules=["provider"])

            manager = ModuleManager.discover(root)

        self.assertIn("consumer", manager.registry)
        self.assertFalse(manager.is_enabled("consumer"))
        self.assertIn("consumer: missing required modules: provider", manager.load_failures)

    def test_list_load_failures_is_detached(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_root = Path(temp_dir) / "missing"
            manager = ModuleManager.discover(missing_root)

        failures = manager.list_load_failures()
        failures.append("mutated")

        self.assertNotIn("mutated", manager.list_load_failures())

    def test_manager_reads_reject_malformed_internal_state(self) -> None:
        manager = ModuleManager.discover(modules_root())
        manager.registry["tasks"] = "bad"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            manager.has_module("tasks")
        with self.assertRaises(ValueError):
            manager.get_module("tasks")
        with self.assertRaises(ValueError):
            manager.is_enabled("tasks")
        with self.assertRaises(ValueError):
            manager.disable_module("tasks")
        with self.assertRaises(ValueError):
            manager.enable_module("tasks")
        with self.assertRaises(ValueError):
            manager.list_modules()
        with self.assertRaises(ValueError):
            manager.list_load_failures()

    def test_register_discovery_rejects_malformed_internal_state(self) -> None:
        manager = ModuleManager.discover(modules_root())
        discovery = discover_modules(modules_root())
        manager.registry["tasks"] = "bad"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            manager.register_discovery(discovery)

    def test_disabling_dependency_disables_dependents_transitively(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_contract(root, "provider", "provider")
            _write_contract(root, "consumer", "consumer", required_modules=["provider"])
            _write_contract(root, "downstream", "downstream", required_modules=["consumer"])

            manager = ModuleManager.discover(root)
            manager.disable_module("provider")

        self.assertFalse(manager.is_enabled("provider"))
        self.assertFalse(manager.is_enabled("consumer"))
        self.assertFalse(manager.is_enabled("downstream"))

    def test_enable_rejects_when_required_module_is_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_contract(root, "provider", "provider")
            _write_contract(root, "consumer", "consumer", required_modules=["provider"])

            manager = ModuleManager.discover(root)
            manager.disable_module("provider")

        with self.assertRaises(ValueError):
            manager.enable_module("consumer")

    def test_enable_succeeds_after_required_module_is_reenabled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_contract(root, "provider", "provider")
            _write_contract(root, "consumer", "consumer", required_modules=["provider"])

            manager = ModuleManager.discover(root)
            manager.disable_module("provider")
            manager.enable_module("provider")
            manager.enable_module("consumer")

        self.assertTrue(manager.is_enabled("provider"))
        self.assertTrue(manager.is_enabled("consumer"))

    def test_module_manager_returns_detached_module_snapshots(self) -> None:
        manager = ModuleManager.discover(modules_root())

        fetched = manager.get_module("tasks")
        listed = next(module for module in manager.list_modules() if module.contract.identity.module_id == "tasks")
        fetched.enabled = False
        listed.enabled = False

        self.assertTrue(manager.is_enabled("tasks"))

    def test_enable_disable_return_detached_modules(self) -> None:
        manager = ModuleManager.discover(modules_root())

        disabled = manager.disable_module("tasks")
        disabled.enabled = True
        self.assertFalse(manager.is_enabled("tasks"))

        enabled = manager.enable_module("tasks")
        enabled.enabled = False
        self.assertTrue(manager.is_enabled("tasks"))

    def test_module_manager_rejects_malformed_module_ids(self) -> None:
        manager = ModuleManager.discover(modules_root())

        with self.assertRaises(ValueError):
            manager.get_module("")
        with self.assertRaises(ValueError):
            manager.is_enabled("")
        with self.assertRaises(ValueError):
            manager.disable_module("")
        with self.assertRaises(ValueError):
            manager.enable_module("")
        with self.assertRaises(ValueError):
            manager.list_modules(enabled_only="yes")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            manager.register_discovery("bad")  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
