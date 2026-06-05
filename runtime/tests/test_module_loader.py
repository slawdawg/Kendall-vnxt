from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from kendall_runtime.module_contract import ModuleCapability, ModuleContract, ModuleIdentity
from kendall_runtime.module_loader import LoadedModule, ModuleDiscoveryResult, ModuleLoadFailure, discover_modules
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


class ModuleLoaderTests(unittest.TestCase):
    def test_discovers_release_one_modules(self) -> None:
        result = discover_modules(modules_root())
        loaded_ids = {item.contract.identity.module_id for item in result.loaded}
        self.assertEqual(loaded_ids, {"outlook", "scheduling", "tasks"})
        self.assertEqual(result.failed, [])

    def test_discovery_result_clone_is_detached(self) -> None:
        result = discover_modules(modules_root())

        cloned = result.clone()
        cloned.loaded.pop()
        cloned.loaded[0].contract.identity.display_name = "Mutated"

        self.assertEqual(len(result.loaded), 3)
        self.assertNotEqual(result.loaded[0].contract.identity.display_name, "Mutated")

    def test_contract_clone_detaches_nested_mutable_sections(self) -> None:
        contract = ModuleContract.from_path(modules_root() / "tasks" / "module.contract.json")
        contract.dependencies["metadata"] = {"owners": ["ops"]}

        cloned = contract.clone()
        cloned.dependencies["metadata"]["owners"][0] = "mutated"

        self.assertEqual(contract.dependencies["metadata"]["owners"][0], "ops")

    def test_contract_construction_detaches_nested_input_sections(self) -> None:
        payload = _contract_payload("tasks")
        payload["dependencies"]["metadata"] = {"owners": ["ops"]}

        contract = ModuleContract.from_dict(payload, source_path=modules_root() / "tasks" / "module.contract.json")
        payload["dependencies"]["metadata"]["owners"][0] = "mutated"

        self.assertEqual(contract.dependencies["metadata"]["owners"][0], "ops")

    def test_loader_types_detach_constructor_inputs(self) -> None:
        contract = ModuleContract.from_path(modules_root() / "tasks" / "module.contract.json")
        loaded = LoadedModule(contract=contract, module_dir=modules_root() / "tasks")
        contract.identity.display_name = "Mutated"
        self.assertNotEqual(loaded.contract.identity.display_name, "Mutated")

        failure = ModuleLoadFailure(module_dir=Path("broken"), reason="oops")
        discovery = ModuleDiscoveryResult(loaded=[loaded], failed=[failure])
        loaded.contract.identity.display_name = "Mutated again"
        discovery.loaded[0].contract.identity.display_name = "Detached mutation"
        self.assertNotEqual(loaded.contract.identity.display_name, "Detached mutation")

    def test_module_capability_detaches_internal_agents(self) -> None:
        agents = ["planner"]
        capability = ModuleCapability(
            purpose="Tasks purpose",
            scope_of_agency="internal-action",
            internal_agents=agents,
        )
        agents[0] = "mutated"

        self.assertEqual(capability.internal_agents, ["planner"])

    def test_discovery_types_reject_malformed_construction(self) -> None:
        contract = ModuleContract.from_path(modules_root() / "tasks" / "module.contract.json")

        with self.assertRaises(ValueError):
            LoadedModule(contract="bad", module_dir=Path("."))  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleLoadFailure(module_dir="bad", reason="oops")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleDiscoveryResult(loaded="bad", failed=[])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleDiscoveryResult(loaded=[], failed="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleDiscoveryResult(loaded=[LoadedModule(contract=contract, module_dir=Path(".")), "bad"], failed=[])  # type: ignore[list-item]
        with self.assertRaises(ValueError):
            ModuleIdentity(module_id="", display_name="Tasks", version="0.1.0", publisher="test")
        with self.assertRaises(ValueError):
            ModuleCapability(purpose="", scope_of_agency="internal-action")
        with self.assertRaises(ValueError):
            ModuleContract(
                identity="bad",  # type: ignore[arg-type]
                capability=ModuleCapability(purpose="Tasks purpose", scope_of_agency="internal-action"),
                data_access={},
                actions={},
                trust={},
                memory={},
                privacy={},
                observability={},
                dependencies={},
                installation={},
                source_path=Path("."),
            )
        with self.assertRaises(ValueError):
            discover_modules("bad")  # type: ignore[arg-type]

    def test_missing_root_is_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_root = Path(temp_dir) / "missing"
            result = discover_modules(missing_root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertEqual(result.failed[0].module_dir, missing_root)
        self.assertEqual(result.failed[0].reason, "module root does not exist")

    def test_non_directory_root_is_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_file = Path(temp_dir) / "modules.json"
            root_file.write_text("{}", encoding="utf-8")
            result = discover_modules(root_file)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertEqual(result.failed[0].module_dir, root_file)
        self.assertEqual(result.failed[0].reason, "module root is not a directory")

    def test_invalid_contract_is_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            (module_dir / "module.contract.json").write_text('{"identity": {}}', encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertEqual(result.failed[0].module_dir.name, "broken")
        self.assertIn("missing required keys", result.failed[0].reason)

    def test_invalid_scope_of_agency_is_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["capability"]["scope_of_agency"] = "automatic"
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("capability.scope_of_agency", result.failed[0].reason)

    def test_invalid_supported_posture_is_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["trust"]["supported_autonomy_levels"] = ["shadow", "automatic"]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("trust.supported_autonomy_levels[1]", result.failed[0].reason)

    def test_initial_posture_must_be_supported_when_support_levels_are_declared(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["trust"]["supported_autonomy_levels"] = ["shadow"]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("trust.initial_posture must be included", result.failed[0].reason)

    def test_invalid_boolean_fields_are_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["privacy"]["local_only_by_default"] = "yes"
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("privacy.local_only_by_default must be a boolean", result.failed[0].reason)

    def test_overlapping_declared_action_groups_are_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["actions"]["advisory_outputs"] = ["shared-action"]
            payload["actions"]["internal_actions"] = ["shared-action"]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("actions.advisory_outputs overlaps actions.internal_actions", result.failed[0].reason)

    def test_forbidden_actions_cannot_overlap_declared_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["actions"]["internal_actions"] = ["create-task"]
            payload["actions"]["forbidden_actions"] = ["create-task"]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("actions.forbidden_actions overlaps declared actions", result.failed[0].reason)

    def test_self_referential_required_module_is_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["dependencies"]["required_modules"] = ["broken"]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("dependencies.required_modules cannot include the module itself", result.failed[0].reason)

    def test_overlapping_required_and_optional_modules_are_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["dependencies"]["required_modules"] = ["tasks"]
            payload["dependencies"]["optional_modules"] = ["tasks"]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("dependencies.required_modules overlaps dependencies.optional_modules", result.failed[0].reason)

    def test_non_string_list_entries_are_reported_as_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            module_dir = root / "broken"
            module_dir.mkdir()
            payload = _contract_payload("broken")
            payload["installation"]["compatible_core_versions"] = ["0.1.x", 2]
            (module_dir / "module.contract.json").write_text(json.dumps(payload), encoding="utf-8")

            result = discover_modules(root)

        self.assertEqual(result.loaded, [])
        self.assertEqual(len(result.failed), 1)
        self.assertIn("installation.compatible_core_versions must be a list of strings", result.failed[0].reason)


if __name__ == "__main__":
    unittest.main()
