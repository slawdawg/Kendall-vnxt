from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .runtime import KendallRuntime


def _get_callable_member(service: object, member_name: str, *, package_id: str, module_id: str) -> object:
    try:
        member = getattr(service, member_name)
    except AttributeError as exc:
        raise ValueError(
            f"package {package_id} binding for module {module_id} references missing method {member_name}"
        ) from exc
    if not callable(member):
        raise ValueError(
            f"package {package_id} binding for module {module_id} references non-callable member {member_name}"
        )
    return member


@dataclass(slots=True)
class ActionBinding:
    action_type: str
    method_name: str

    def __post_init__(self) -> None:
        if not isinstance(self.action_type, str) or not self.action_type:
            raise ValueError("action binding must declare an action_type")
        if not isinstance(self.method_name, str) or not self.method_name:
            raise ValueError("action binding must declare a method_name")

    def clone(self) -> "ActionBinding":
        return ActionBinding(action_type=self.action_type, method_name=self.method_name)


@dataclass(slots=True)
class ModuleBinding:
    module_id: str
    service: object
    briefing_method_name: str | None = None
    action_bindings: list[ActionBinding] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("module binding must declare a module_id")
        if self.service is None:
            raise ValueError("module binding must declare a service")
        if self.briefing_method_name is not None and (
            not isinstance(self.briefing_method_name, str) or not self.briefing_method_name
        ):
            raise ValueError("module binding briefing_method_name cannot be empty")
        if not isinstance(self.action_bindings, list):
            raise ValueError("module binding action_bindings must be a list")
        if any(not isinstance(binding, ActionBinding) for binding in self.action_bindings):
            raise ValueError("module binding action_bindings must contain ActionBinding instances")
        self.action_bindings = [binding.clone() for binding in self.action_bindings]

    def clone(self) -> "ModuleBinding":
        return ModuleBinding(
            module_id=self.module_id,
            service=self.service,
            briefing_method_name=self.briefing_method_name,
            action_bindings=[binding.clone() for binding in self.action_bindings],
        )


@dataclass(slots=True)
class ModulePackage:
    package_id: str
    display_name: str = ""
    version: str = "0.1.0"
    module_bindings: list[ModuleBinding] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.package_id, str) or not self.package_id:
            raise ValueError("module package must declare a package_id")
        if not isinstance(self.display_name, str):
            raise ValueError("module package display_name must be a string")
        if not isinstance(self.version, str) or not self.version:
            raise ValueError("module package must declare a version")
        if not isinstance(self.module_bindings, list):
            raise ValueError("module package module_bindings must be a list")
        if any(not isinstance(binding, ModuleBinding) for binding in self.module_bindings):
            raise ValueError("module package module_bindings must contain ModuleBinding instances")
        self.module_bindings = [binding.clone() for binding in self.module_bindings]

    def clone(self) -> "ModulePackage":
        return ModulePackage(
            package_id=self.package_id,
            display_name=self.display_name,
            version=self.version,
            module_bindings=[binding.clone() for binding in self.module_bindings],
        )

    def install(self, runtime: KendallRuntime) -> None:
        from .runtime import KendallRuntime as RuntimeType

        if not isinstance(runtime, RuntimeType):
            raise ValueError("runtime must be a KendallRuntime")
        self._validate_bindings(runtime)
        runtime.register_module_package(self)
        for binding in self.module_bindings:
            runtime.register_module_service(binding.module_id, binding.service, owner_package_id=self.package_id)
            if binding.briefing_method_name is not None:
                provider = _get_callable_member(
                    binding.service,
                    binding.briefing_method_name,
                    package_id=self.package_id,
                    module_id=binding.module_id,
                )
                runtime.register_briefing_provider(binding.module_id, provider, owner_package_id=self.package_id)
            for action_binding in binding.action_bindings:
                handler = _get_callable_member(
                    binding.service,
                    action_binding.method_name,
                    package_id=self.package_id,
                    module_id=binding.module_id,
                )
                runtime.register_action_handler(
                    binding.module_id,
                    action_binding.action_type,
                    handler,
                    owner_package_id=self.package_id,
                )

    def _validate_bindings(self, runtime: KendallRuntime) -> None:
        from .runtime import KendallRuntime as RuntimeType

        if not isinstance(runtime, RuntimeType):
            raise ValueError("runtime must be a KendallRuntime")
        seen_module_ids: set[str] = set()
        for binding in self.module_bindings:
            if binding.module_id in seen_module_ids:
                raise ValueError(
                    f"package {self.package_id} declares module {binding.module_id} more than once"
                )
            seen_module_ids.add(binding.module_id)
            seen_action_types: set[str] = set()
            runtime.module_manager.get_module(binding.module_id)
            runtime.validate_module_owner(binding.module_id, binding.service)
            runtime.validate_module_service_registration(binding.module_id, replacing_package_id=self.package_id)
            if binding.briefing_method_name is not None:
                provider = _get_callable_member(
                    binding.service,
                    binding.briefing_method_name,
                    package_id=self.package_id,
                    module_id=binding.module_id,
                )
                runtime.validate_module_owner(binding.module_id, provider)
                runtime.validate_briefing_provider_registration(binding.module_id, replacing_package_id=self.package_id)
            for action_binding in binding.action_bindings:
                if action_binding.action_type in seen_action_types:
                    raise ValueError(
                        f"package {self.package_id} declares action {action_binding.action_type} more than once for module {binding.module_id}"
                    )
                seen_action_types.add(action_binding.action_type)
                runtime.validate_module_action(binding.module_id, action_binding.action_type)
                handler = _get_callable_member(
                    binding.service,
                    action_binding.method_name,
                    package_id=self.package_id,
                    module_id=binding.module_id,
                )
                runtime.validate_module_owner(binding.module_id, handler)
                runtime.validate_action_handler_registration(
                    binding.module_id,
                    action_binding.action_type,
                    replacing_package_id=self.package_id,
                )
