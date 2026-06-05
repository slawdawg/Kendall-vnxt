from __future__ import annotations

from dataclasses import dataclass, field


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class ModuleServiceRegistry:
    services: dict[str, object] = field(default_factory=dict)
    service_owners: dict[str, str | None] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.services, dict):
            raise ValueError("services must be a dict[str, object]")
        if not isinstance(self.service_owners, dict):
            raise ValueError("service_owners must be a dict[str, str | None]")
        normalized_services: dict[str, object] = {}
        for module_id, service in self.services.items():
            _require_non_empty_string(module_id, field_name="module_id")
            if service is None:
                raise ValueError("service must not be None")
            normalized_services[module_id] = service
        normalized_owners: dict[str, str | None] = {}
        for module_id, owner_package_id in self.service_owners.items():
            if module_id not in normalized_services:
                raise ValueError("service owner keys must reference registered services")
            if owner_package_id is not None:
                _require_non_empty_string(owner_package_id, field_name="owner_package_id")
            normalized_owners[module_id] = owner_package_id
        self.services = dict(normalized_services)
        self.service_owners = dict(normalized_owners)

    def _validate_internal_state(self) -> None:
        if not isinstance(self.services, dict):
            raise ValueError("services must be a dict[str, object]")
        if not isinstance(self.service_owners, dict):
            raise ValueError("service_owners must be a dict[str, str | None]")
        for module_id, service in self.services.items():
            _require_non_empty_string(module_id, field_name="module_id")
            if service is None:
                raise ValueError("service must not be None")
        for module_id, owner_package_id in self.service_owners.items():
            if module_id not in self.services:
                raise ValueError("service owner keys must reference registered services")
            if owner_package_id is not None:
                _require_non_empty_string(owner_package_id, field_name="owner_package_id")

    def register(self, module_id: str, service: object, *, owner_package_id: str | None = None) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        if service is None:
            raise ValueError("service must not be None")
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        if module_id in self.services:
            raise ValueError(f"module service already registered for {module_id}")
        self.services[module_id] = service
        self.service_owners[module_id] = owner_package_id

    def get(self, module_id: str) -> object:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        try:
            return self.services[module_id]
        except KeyError as exc:
            raise KeyError(f"unknown module service: {module_id}") from exc

    def has(self, module_id: str) -> bool:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return module_id in self.services

    def owner_for(self, module_id: str) -> str | None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return self.service_owners.get(module_id)

    def list_module_ids(self) -> list[str]:
        self._validate_internal_state()
        return sorted(self.services)

    def unregister(self, module_id: str, *, owner_package_id: str | None = None) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        if owner_package_id is not None and self.service_owners.get(module_id) != owner_package_id:
            return
        self.services.pop(module_id, None)
        self.service_owners.pop(module_id, None)
