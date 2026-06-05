from __future__ import annotations

from dataclasses import dataclass, field

from .module_manifest import ModulePackage


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class RegisteredModulePackage:
    package: ModulePackage
    active: bool = True

    def __post_init__(self) -> None:
        if not isinstance(self.package, ModulePackage):
            raise ValueError("registered package must contain a ModulePackage")
        if not isinstance(self.active, bool):
            raise ValueError("registered package active must be a boolean")
        self.package = self.package.clone()

    def clone(self) -> "RegisteredModulePackage":
        return RegisteredModulePackage(package=self.package.clone(), active=self.active)


@dataclass(slots=True)
class ModulePackageRegistry:
    packages: dict[str, RegisteredModulePackage] = field(default_factory=dict)
    module_to_package: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.packages, dict):
            raise ValueError("packages must be a dict[str, RegisteredModulePackage]")
        if not isinstance(self.module_to_package, dict):
            raise ValueError("module_to_package must be a dict[str, str]")
        normalized_packages: dict[str, RegisteredModulePackage] = {}
        for package_id, registered in self.packages.items():
            _require_non_empty_string(package_id, field_name="package_id")
            if not isinstance(registered, RegisteredModulePackage):
                raise ValueError("packages must contain RegisteredModulePackage instances")
            if registered.package.package_id != package_id:
                raise ValueError("package key must match RegisteredModulePackage package_id")
            normalized_packages[package_id] = registered.clone()
        normalized_mapping: dict[str, str] = {}
        for module_id, package_id in self.module_to_package.items():
            _require_non_empty_string(module_id, field_name="module_id")
            _require_non_empty_string(package_id, field_name="package_id")
            if package_id not in normalized_packages:
                raise ValueError("module_to_package must reference known package ids")
            package_module_ids = {
                binding.module_id for binding in normalized_packages[package_id].package.module_bindings
            }
            if module_id not in package_module_ids:
                raise ValueError("module_to_package must reference module ids owned by the package")
            normalized_mapping[module_id] = package_id
        self.packages = normalized_packages
        self.module_to_package = normalized_mapping

    def _validate_internal_state(self) -> None:
        if not isinstance(self.packages, dict):
            raise ValueError("packages must be a dict[str, RegisteredModulePackage]")
        if not isinstance(self.module_to_package, dict):
            raise ValueError("module_to_package must be a dict[str, str]")
        for package_id, registered in self.packages.items():
            _require_non_empty_string(package_id, field_name="package_id")
            if not isinstance(registered, RegisteredModulePackage):
                raise ValueError("packages must contain RegisteredModulePackage instances")
            if registered.package.package_id != package_id:
                raise ValueError("package key must match RegisteredModulePackage package_id")
        for module_id, package_id in self.module_to_package.items():
            _require_non_empty_string(module_id, field_name="module_id")
            _require_non_empty_string(package_id, field_name="package_id")
            if package_id not in self.packages:
                raise ValueError("module_to_package must reference known package ids")
            package_module_ids = {
                binding.module_id for binding in self.packages[package_id].package.module_bindings
            }
            if module_id not in package_module_ids:
                raise ValueError("module_to_package must reference module ids owned by the package")

    def validate(self, package: ModulePackage) -> None:
        if not isinstance(package, ModulePackage):
            raise ValueError("package must be a ModulePackage")
        self._validate_internal_state()
        seen_module_ids: set[str] = set()
        existing = self.packages.get(package.package_id)
        existing_module_ids = (
            {binding.module_id for binding in existing.package.module_bindings}
            if existing is not None
            else set()
        )
        for binding in package.module_bindings:
            if binding.module_id in seen_module_ids:
                raise ValueError(
                    f"package {package.package_id} declares module {binding.module_id} more than once"
                )
            seen_module_ids.add(binding.module_id)
            owner = self.module_to_package.get(binding.module_id)
            if owner is not None and owner != package.package_id and binding.module_id not in existing_module_ids:
                raise ValueError(
                    f"module {binding.module_id} is already owned by package {owner}"
                )

    def register(self, package: ModulePackage) -> None:
        if not isinstance(package, ModulePackage):
            raise ValueError("package must be a ModulePackage")
        self._validate_internal_state()
        existing = self.packages.get(package.package_id)
        active = existing.active if existing is not None else True
        self.validate(package)
        stored_package = package.clone()
        if existing is not None:
            for binding in existing.package.module_bindings:
                if self.module_to_package.get(binding.module_id) == package.package_id:
                    del self.module_to_package[binding.module_id]
        self.packages[package.package_id] = RegisteredModulePackage(package=stored_package, active=active)
        for binding in stored_package.module_bindings:
            self.module_to_package[binding.module_id] = package.package_id

    def get(self, package_id: str) -> ModulePackage:
        _require_non_empty_string(package_id, field_name="package_id")
        self._validate_internal_state()
        try:
            return self.packages[package_id].package.clone()
        except KeyError as exc:
            raise KeyError(f"unknown module package: {package_id}") from exc

    def get_registered(self, package_id: str) -> RegisteredModulePackage:
        _require_non_empty_string(package_id, field_name="package_id")
        self._validate_internal_state()
        try:
            return self.packages[package_id].clone()
        except KeyError as exc:
            raise KeyError(f"unknown module package: {package_id}") from exc

    def _get_registered(self, package_id: str) -> RegisteredModulePackage:
        _require_non_empty_string(package_id, field_name="package_id")
        self._validate_internal_state()
        try:
            return self.packages[package_id]
        except KeyError as exc:
            raise KeyError(f"unknown module package: {package_id}") from exc

    def has(self, package_id: str) -> bool:
        _require_non_empty_string(package_id, field_name="package_id")
        self._validate_internal_state()
        return package_id in self.packages

    def is_active(self, package_id: str) -> bool:
        self._validate_internal_state()
        return self._get_registered(package_id).active

    def package_id_for_module(self, module_id: str) -> str | None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return self.module_to_package.get(module_id)

    def is_module_active(self, module_id: str) -> bool:
        package_id = self.package_id_for_module(module_id)
        if package_id is None:
            return True
        return self.is_active(package_id)

    def activate(self, package_id: str) -> RegisteredModulePackage:
        registered = self._get_registered(package_id)
        registered.active = True
        return registered.clone()

    def deactivate(self, package_id: str) -> RegisteredModulePackage:
        registered = self._get_registered(package_id)
        registered.active = False
        return registered.clone()

    def remove(self, package_id: str) -> RegisteredModulePackage:
        registered = self._get_registered(package_id)
        for binding in registered.package.module_bindings:
            if self.module_to_package.get(binding.module_id) == package_id:
                del self.module_to_package[binding.module_id]
        del self.packages[package_id]
        return registered.clone()

    def list(self) -> list[ModulePackage]:
        self._validate_internal_state()
        return [self.packages[package_id].package.clone() for package_id in sorted(self.packages)]

    def list_registered(self) -> list[RegisteredModulePackage]:
        self._validate_internal_state()
        return [self.packages[package_id].clone() for package_id in sorted(self.packages)]
