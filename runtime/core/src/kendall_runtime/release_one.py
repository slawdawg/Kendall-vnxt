from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field

from .module_manifest import ActionBinding, ModuleBinding, ModulePackage
from .module_services import OutlookModuleService, SchedulingModuleService, TasksModuleService
from .runtime import KendallRuntime


def _require_service_type(service: object, expected_type: type[object], *, service_name: str) -> None:
    if not isinstance(service, expected_type):
        raise ValueError(f"{service_name} must be a {expected_type.__name__}")


def _require_callable_member(service: object, member_name: str, *, service_name: str) -> None:
    member = getattr(service, member_name, None)
    if not callable(member):
        raise ValueError(f"{service_name} must provide callable member {member_name}")


@dataclass(slots=True)
class ReleaseOneConfigurer:
    runtime: KendallRuntime
    outlook: OutlookModuleService = field(default_factory=OutlookModuleService)
    scheduling: SchedulingModuleService = field(default_factory=SchedulingModuleService)
    tasks: TasksModuleService = field(default_factory=TasksModuleService)

    def __post_init__(self) -> None:
        if not isinstance(self.runtime, KendallRuntime):
            raise ValueError("runtime must be a KendallRuntime")
        _require_service_type(self.outlook, OutlookModuleService, service_name="outlook release-one service")
        _require_service_type(
            self.scheduling,
            SchedulingModuleService,
            service_name="scheduling release-one service",
        )
        _require_service_type(self.tasks, TasksModuleService, service_name="tasks release-one service")
        expected_services = {
            "outlook": self.outlook,
            "scheduling": self.scheduling,
            "tasks": self.tasks,
        }
        for expected_module_id, service in expected_services.items():
            if getattr(service, "module_id", None) != expected_module_id:
                raise ValueError(
                    f"release-one service for {expected_module_id} must declare module_id {expected_module_id}"
                )
        _require_callable_member(self.outlook, "collect_briefing", service_name="outlook release-one service")
        _require_callable_member(self.scheduling, "collect_briefing", service_name="scheduling release-one service")
        _require_callable_member(
            self.scheduling,
            "create_tentative_hold",
            service_name="scheduling release-one service",
        )
        _require_callable_member(self.tasks, "collect_briefing", service_name="tasks release-one service")
        _require_callable_member(self.tasks, "create_task", service_name="tasks release-one service")
        _require_callable_member(self.tasks, "update_task", service_name="tasks release-one service")
        _require_callable_member(self.tasks, "create_reminder", service_name="tasks release-one service")
        _require_callable_member(self.tasks, "update_reminder", service_name="tasks release-one service")

    def install(self) -> None:
        ModulePackage(
            package_id="release-one",
            display_name="Release 1 Core Bundle",
            version="0.1.0",
            module_bindings=self._bindings(detach_services=False),
        ).install(self.runtime)

    def package(self) -> ModulePackage:
        return ModulePackage(
            package_id="release-one",
            display_name="Release 1 Core Bundle",
            version="0.1.0",
            module_bindings=self._bindings(detach_services=True),
        )

    def bindings(self) -> list[ModuleBinding]:
        return self._bindings(detach_services=True)

    def _bindings(self, *, detach_services: bool) -> list[ModuleBinding]:
        def service_copy(service: object) -> object:
            return deepcopy(service) if detach_services else service

        return [
            ModuleBinding(
                module_id="outlook",
                service=service_copy(self.outlook),
                briefing_method_name="collect_briefing",
            ),
            ModuleBinding(
                module_id="scheduling",
                service=service_copy(self.scheduling),
                briefing_method_name="collect_briefing",
                action_bindings=[
                    ActionBinding(
                        action_type="create-tentative-internal-hold",
                        method_name="create_tentative_hold",
                    )
                ],
            ),
            ModuleBinding(
                module_id="tasks",
                service=service_copy(self.tasks),
                briefing_method_name="collect_briefing",
                action_bindings=[
                    ActionBinding(action_type="create-task", method_name="create_task"),
                    ActionBinding(action_type="update-task", method_name="update_task"),
                    ActionBinding(action_type="create-reminder", method_name="create_reminder"),
                    ActionBinding(action_type="update-reminder", method_name="update_reminder"),
                ],
            ),
        ]


def install_release_one(runtime: KendallRuntime) -> KendallRuntime:
    if not isinstance(runtime, KendallRuntime):
        raise ValueError("runtime must be a KendallRuntime")
    ReleaseOneConfigurer(runtime).install()
    return runtime
