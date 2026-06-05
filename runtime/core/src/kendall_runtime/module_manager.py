from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .module_contract import ModuleContract
from .module_loader import ModuleDiscoveryResult, discover_modules


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class RegisteredModule:
    contract: ModuleContract
    module_dir: Path
    enabled: bool = True

    def __post_init__(self) -> None:
        if not isinstance(self.contract, ModuleContract):
            raise ValueError("registered module contract must be a ModuleContract")
        if not isinstance(self.module_dir, Path):
            raise ValueError("registered module_dir must be a pathlib.Path")
        if not isinstance(self.enabled, bool):
            raise ValueError("registered module enabled must be a boolean")
        self.contract = self.contract.clone()

    def clone(self) -> "RegisteredModule":
        return RegisteredModule(contract=self.contract.clone(), module_dir=self.module_dir, enabled=self.enabled)


@dataclass(slots=True)
class ModuleManager:
    registry: dict[str, RegisteredModule] = field(default_factory=dict)
    load_failures: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.registry, dict):
            raise ValueError("registry must be a dict[str, RegisteredModule]")
        if not isinstance(self.load_failures, list):
            raise ValueError("load_failures must be a list[str]")
        normalized_registry: dict[str, RegisteredModule] = {}
        for module_id, registered in self.registry.items():
            _require_non_empty_string(module_id, field_name="module_id")
            if not isinstance(registered, RegisteredModule):
                raise ValueError("registry must contain RegisteredModule instances")
            if registered.contract.identity.module_id != module_id:
                raise ValueError("registry key must match RegisteredModule contract module_id")
            normalized_registry[module_id] = registered.clone()
        if any(not isinstance(failure, str) or not failure for failure in self.load_failures):
            raise ValueError("load_failures must contain non-empty strings")
        self.registry = normalized_registry
        self.load_failures = list(self.load_failures)

    def _validate_internal_state(self) -> None:
        if not isinstance(self.registry, dict):
            raise ValueError("registry must be a dict[str, RegisteredModule]")
        if not isinstance(self.load_failures, list):
            raise ValueError("load_failures must be a list[str]")
        for module_id, registered in self.registry.items():
            _require_non_empty_string(module_id, field_name="module_id")
            if not isinstance(registered, RegisteredModule):
                raise ValueError("registry must contain RegisteredModule instances")
            if registered.contract.identity.module_id != module_id:
                raise ValueError("registry key must match RegisteredModule contract module_id")
        if any(not isinstance(failure, str) or not failure for failure in self.load_failures):
            raise ValueError("load_failures must contain non-empty strings")

    @classmethod
    def from_discovery(cls, discovery: ModuleDiscoveryResult) -> "ModuleManager":
        if not isinstance(discovery, ModuleDiscoveryResult):
            raise ValueError("discovery must be a ModuleDiscoveryResult")
        manager = cls()
        manager.register_discovery(discovery)
        return manager

    @classmethod
    def discover(cls, root: Path | None = None) -> "ModuleManager":
        if root is not None and not isinstance(root, Path):
            raise ValueError("root must be a pathlib.Path or None")
        return cls.from_discovery(discover_modules(root))

    def register_discovery(self, discovery: ModuleDiscoveryResult) -> None:
        if not isinstance(discovery, ModuleDiscoveryResult):
            raise ValueError("discovery must be a ModuleDiscoveryResult")
        self._validate_internal_state()
        self.load_failures = [f"{failure.module_dir.name}: {failure.reason}" for failure in discovery.failed]
        self.registry.clear()
        loaded_by_module: dict[str, list] = {}
        for loaded in discovery.loaded:
            module_id = loaded.contract.identity.module_id
            loaded_by_module.setdefault(module_id, []).append(loaded)

        for module_id, loaded_group in loaded_by_module.items():
            if len(loaded_group) > 1:
                for loaded in loaded_group:
                    self.load_failures.append(f"{loaded.module_dir.name}: duplicate module_id: {module_id}")
                continue
            loaded = loaded_group[0]
            self.registry[module_id] = RegisteredModule(contract=loaded.contract.clone(), module_dir=loaded.module_dir)

        self._apply_dependency_disables()

    def _apply_dependency_disables(self) -> None:
        available_modules = set(self.registry)
        for module_id, registered in self.registry.items():
            required_modules = registered.contract.dependencies.get("required_modules", [])
            missing = sorted(required for required in required_modules if required not in available_modules)
            if missing:
                registered.enabled = False
                joined = ", ".join(missing)
                self.load_failures.append(f"{module_id}: missing required modules: {joined}")

    def list_modules(self, *, enabled_only: bool = False) -> list[RegisteredModule]:
        if not isinstance(enabled_only, bool):
            raise ValueError("enabled_only must be a boolean")
        self._validate_internal_state()
        modules = sorted(
            (module.clone() for module in self.registry.values()),
            key=lambda item: item.contract.identity.module_id,
        )
        if enabled_only:
            return [module for module in modules if module.enabled]
        return modules

    def get_module(self, module_id: str) -> RegisteredModule:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        try:
            return self.registry[module_id].clone()
        except KeyError as exc:
            raise KeyError(f"unknown module: {module_id}") from exc

    def is_enabled(self, module_id: str) -> bool:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return self._get_registered_module(module_id).enabled

    def has_module(self, module_id: str) -> bool:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return module_id in self.registry

    def list_load_failures(self) -> list[str]:
        self._validate_internal_state()
        return list(self.load_failures)

    def disable_module(self, module_id: str) -> RegisteredModule:
        _require_non_empty_string(module_id, field_name="module_id")
        module = self._get_registered_module(module_id)
        module.enabled = False
        for dependent_id in self._dependent_module_ids(module_id):
            self.registry[dependent_id].enabled = False
        return module.clone()

    def enable_module(self, module_id: str) -> RegisteredModule:
        _require_non_empty_string(module_id, field_name="module_id")
        module = self._get_registered_module(module_id)
        required_modules = module.contract.dependencies.get("required_modules", [])
        missing = [required for required in required_modules if required not in self.registry]
        if missing:
            joined = ", ".join(sorted(missing))
            raise ValueError(f"cannot enable {module_id}; missing required modules: {joined}")
        disabled = [required for required in required_modules if not self.registry[required].enabled]
        if disabled:
            joined = ", ".join(sorted(disabled))
            raise ValueError(f"cannot enable {module_id}; required modules are disabled: {joined}")
        module.enabled = True
        return module.clone()

    def _dependent_module_ids(self, module_id: str) -> list[str]:
        _require_non_empty_string(module_id, field_name="module_id")
        dependents: list[str] = []
        queue = [module_id]
        seen = {module_id}
        while queue:
            current = queue.pop(0)
            for candidate_id, registered in self.registry.items():
                if candidate_id in seen:
                    continue
                required_modules = registered.contract.dependencies.get("required_modules", [])
                if current in required_modules:
                    dependents.append(candidate_id)
                    queue.append(candidate_id)
                    seen.add(candidate_id)
        return dependents

    def _get_registered_module(self, module_id: str) -> RegisteredModule:
        self._validate_internal_state()
        try:
            return self.registry[module_id]
        except KeyError as exc:
            raise KeyError(f"unknown module: {module_id}") from exc
