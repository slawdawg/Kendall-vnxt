from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from .module_api import BriefingContext, BriefingResult


BriefingSignalProvider = Callable[[BriefingContext], BriefingResult]


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class BriefingSignalRegistry:
    providers: dict[str, BriefingSignalProvider] = field(default_factory=dict)
    provider_owners: dict[str, str | None] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.providers, dict):
            raise ValueError("providers must be a dict[str, BriefingSignalProvider]")
        if not isinstance(self.provider_owners, dict):
            raise ValueError("provider_owners must be a dict[str, str | None]")
        normalized_providers: dict[str, BriefingSignalProvider] = {}
        for module_id, provider in self.providers.items():
            _require_non_empty_string(module_id, field_name="module_id")
            if not callable(provider):
                raise ValueError("provider must be callable")
            normalized_providers[module_id] = provider
        normalized_owners: dict[str, str | None] = {}
        for module_id, owner_package_id in self.provider_owners.items():
            if module_id not in normalized_providers:
                raise ValueError("provider owner keys must reference registered providers")
            if owner_package_id is not None:
                _require_non_empty_string(owner_package_id, field_name="owner_package_id")
            normalized_owners[module_id] = owner_package_id
        self.providers = dict(normalized_providers)
        self.provider_owners = dict(normalized_owners)

    def _validate_internal_state(self) -> None:
        if not isinstance(self.providers, dict):
            raise ValueError("providers must be a dict[str, BriefingSignalProvider]")
        if not isinstance(self.provider_owners, dict):
            raise ValueError("provider_owners must be a dict[str, str | None]")
        for module_id, provider in self.providers.items():
            _require_non_empty_string(module_id, field_name="module_id")
            if not callable(provider):
                raise ValueError("provider must be callable")
        for module_id, owner_package_id in self.provider_owners.items():
            if module_id not in self.providers:
                raise ValueError("provider owner keys must reference registered providers")
            if owner_package_id is not None:
                _require_non_empty_string(owner_package_id, field_name="owner_package_id")

    def register_provider(
        self,
        module_id: str,
        provider: BriefingSignalProvider,
        *,
        owner_package_id: str | None = None,
    ) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        if not callable(provider):
            raise ValueError("provider must be callable")
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        if module_id in self.providers:
            raise ValueError(f"briefing provider already registered for {module_id}")
        self.providers[module_id] = provider
        self.provider_owners[module_id] = owner_package_id

    def owner_for(self, module_id: str) -> str | None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return self.provider_owners.get(module_id)

    def unregister_provider(self, module_id: str, *, owner_package_id: str | None = None) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        if owner_package_id is not None and self.provider_owners.get(module_id) != owner_package_id:
            return
        self.providers.pop(module_id, None)
        self.provider_owners.pop(module_id, None)

    def provider_for(self, module_id: str) -> BriefingSignalProvider | None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return self.providers.get(module_id)

    def has_provider(self, module_id: str) -> bool:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return module_id in self.providers

    def list_module_ids(self) -> list[str]:
        self._validate_internal_state()
        return sorted(self.providers)
