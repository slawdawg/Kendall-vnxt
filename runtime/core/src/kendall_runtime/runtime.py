from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .actions import ActionDispatcher
from .briefing import BriefingService
from .data_scope import DataScopeManager, ScopedDataView
from .inference import InferenceRoutingService
from .memory_scope import MemoryScopeManager, ScopedMemoryView
from .module_manager import ModuleManager
from .module_manifest import ModulePackage
from .module_service_registry import ModuleServiceRegistry
from .module_package_registry import ModulePackageRegistry
from .orchestration import OrchestrationService
from .paths import modules_root
from .policy import PolicyGate
from .privacy import OutboundPrivacyGate
from .services.audit import AuditService
from .services.data import DataService
from .services.memory import MemoryService
from .services.trust import TrustPolicyService
from .signal_registry import BriefingSignalProvider, BriefingSignalRegistry
from .status import StatusService
from .actions import ActionHandler
from .module_manager import RegisteredModule


@dataclass(slots=True)
class KendallRuntime:
    module_manager: ModuleManager
    data_service: DataService = field(default_factory=DataService)
    memory_service: MemoryService = field(default_factory=MemoryService)
    trust_service: TrustPolicyService = field(default_factory=TrustPolicyService)
    audit_service: AuditService = field(default_factory=AuditService)
    briefing_service: BriefingService = field(default_factory=BriefingService)
    action_dispatcher: ActionDispatcher = field(default_factory=ActionDispatcher)
    signal_registry: BriefingSignalRegistry = field(default_factory=BriefingSignalRegistry)
    module_services: ModuleServiceRegistry = field(default_factory=ModuleServiceRegistry)
    module_packages: ModulePackageRegistry = field(default_factory=ModulePackageRegistry)
    policy_gate: PolicyGate = field(init=False)
    orchestration_service: OrchestrationService = field(init=False)
    memory_scope_manager: MemoryScopeManager = field(init=False)
    data_scope_manager: DataScopeManager = field(init=False)
    status_service: StatusService = field(init=False)
    privacy_gate: OutboundPrivacyGate = field(init=False)
    inference_service: InferenceRoutingService = field(init=False)

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("module_manager must be a ModuleManager")
        if not isinstance(self.data_service, DataService):
            raise ValueError("data_service must be a DataService")
        if not isinstance(self.memory_service, MemoryService):
            raise ValueError("memory_service must be a MemoryService")
        if not isinstance(self.trust_service, TrustPolicyService):
            raise ValueError("trust_service must be a TrustPolicyService")
        if not isinstance(self.audit_service, AuditService):
            raise ValueError("audit_service must be an AuditService")
        if not isinstance(self.briefing_service, BriefingService):
            raise ValueError("briefing_service must be a BriefingService")
        if not isinstance(self.action_dispatcher, ActionDispatcher):
            raise ValueError("action_dispatcher must be an ActionDispatcher")
        if not isinstance(self.signal_registry, BriefingSignalRegistry):
            raise ValueError("signal_registry must be a BriefingSignalRegistry")
        if not isinstance(self.module_services, ModuleServiceRegistry):
            raise ValueError("module_services must be a ModuleServiceRegistry")
        if not isinstance(self.module_packages, ModulePackageRegistry):
            raise ValueError("module_packages must be a ModulePackageRegistry")
        self.data_scope_manager = DataScopeManager(self.module_manager, self.data_service)
        self.memory_scope_manager = MemoryScopeManager(self.module_manager, self.memory_service)
        self.privacy_gate = OutboundPrivacyGate(self.module_manager, self.module_packages, self.module_services)
        self.inference_service = InferenceRoutingService(
            self.module_manager,
            self.module_packages,
            self.module_services,
            self.privacy_gate,
        )
        self.status_service = StatusService(
            self.module_manager,
            self.audit_service,
            self.memory_service,
            self.trust_service,
            self.action_dispatcher,
            self.signal_registry,
            self.module_services,
            self.module_packages,
        )
        self.policy_gate = PolicyGate(
            module_manager=self.module_manager,
            trust_service=self.trust_service,
            audit_service=self.audit_service,
            module_packages=self.module_packages,
        )
        self.orchestration_service = OrchestrationService(
            module_manager=self.module_manager,
            briefing_service=self.briefing_service,
            policy_gate=self.policy_gate,
            action_dispatcher=self.action_dispatcher,
            signal_registry=self.signal_registry,
            data_scope_manager=self.data_scope_manager,
            memory_scope_manager=self.memory_scope_manager,
            module_packages=self.module_packages,
        )

    @classmethod
    def bootstrap(cls, module_root: Path | None = None) -> "KendallRuntime":
        if module_root is not None and not isinstance(module_root, Path):
            raise ValueError("module_root must be a pathlib.Path or None")
        manager = ModuleManager.discover(module_root or modules_root())
        return cls(module_manager=manager)

    @classmethod
    def bootstrap_release_one(cls, module_root: Path | None = None) -> "KendallRuntime":
        if module_root is not None and not isinstance(module_root, Path):
            raise ValueError("module_root must be a pathlib.Path or None")
        runtime = cls.bootstrap(module_root)
        from .release_one import install_release_one

        return install_release_one(runtime)

    def memory_for_module(self, module_id: str) -> ScopedMemoryView:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        return self.memory_scope_manager.for_module(module_id)

    def data_for_module(self, module_id: str) -> ScopedDataView:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        return self.data_scope_manager.for_module(module_id)

    def validate_module_action(self, module_id: str, action_type: str) -> None:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        if not isinstance(action_type, str) or not action_type:
            raise ValueError("action_type must be a non-empty string")
        contract = self.module_manager.get_module(module_id).contract
        declared_actions = {
            *contract.actions.get("advisory_outputs", []),
            *contract.actions.get("drafting_outputs", []),
            *contract.actions.get("internal_actions", []),
            *contract.actions.get("external_actions", []),
        }
        if action_type not in declared_actions:
            raise ValueError(f"action {action_type} is not declared by module {module_id}")

    def validate_module_owner(self, module_id: str, obj: object) -> None:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        owner = getattr(obj, "__self__", obj)
        owner_module_id = getattr(owner, "module_id", None)
        if owner_module_id is not None and owner_module_id != module_id:
            raise ValueError(
                f"registered object declares module_id {owner_module_id} but was bound to {module_id}"
            )

    def validate_module_service_registration(self, module_id: str, *, replacing_package_id: str | None = None) -> None:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        if replacing_package_id is not None and (not isinstance(replacing_package_id, str) or not replacing_package_id):
            raise ValueError("replacing_package_id must be a non-empty string or None")
        if self.module_services.has(module_id) and self.module_services.owner_for(module_id) != replacing_package_id:
            raise ValueError(f"module service already registered for {module_id}")

    def validate_briefing_provider_registration(
        self,
        module_id: str,
        *,
        replacing_package_id: str | None = None,
    ) -> None:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        if replacing_package_id is not None and (not isinstance(replacing_package_id, str) or not replacing_package_id):
            raise ValueError("replacing_package_id must be a non-empty string or None")
        if self.signal_registry.has_provider(module_id) and self.signal_registry.owner_for(module_id) != replacing_package_id:
            raise ValueError(f"briefing provider already registered for {module_id}")

    def validate_action_handler_registration(
        self,
        module_id: str,
        action_type: str,
        *,
        replacing_package_id: str | None = None,
    ) -> None:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        if not isinstance(action_type, str) or not action_type:
            raise ValueError("action_type must be a non-empty string")
        if replacing_package_id is not None and (not isinstance(replacing_package_id, str) or not replacing_package_id):
            raise ValueError("replacing_package_id must be a non-empty string or None")
        if self.action_dispatcher.has_handler(module_id, action_type) and (
            self.action_dispatcher.owner_for(module_id, action_type) != replacing_package_id
        ):
            raise ValueError(f"handler already registered for {module_id}:{action_type}")

    def is_module_operational(self, module_id: str) -> bool:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        return self.module_manager.is_enabled(module_id) and self.module_packages.is_module_active(module_id)

    def is_module_installed(self, module_id: str) -> bool:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        return (
            self.module_services.has(module_id)
            or self.signal_registry.has_provider(module_id)
            or bool(self.action_dispatcher.list_action_types(module_id))
        )

    def list_operational_modules(self) -> list[RegisteredModule]:
        return [
            module
            for module in self.module_manager.list_modules(enabled_only=True)
            if self.module_packages.is_module_active(module.contract.identity.module_id)
        ]

    def list_installed_modules(self) -> list[RegisteredModule]:
        return [
            module
            for module in self.module_manager.list_modules()
            if self.is_module_installed(module.contract.identity.module_id)
        ]

    def service_for_module(self, module_id: str, *, require_operational: bool = True) -> object:
        if not isinstance(module_id, str) or not module_id:
            raise ValueError("module_id must be a non-empty string")
        if not isinstance(require_operational, bool):
            raise ValueError("require_operational must be a boolean")
        self.module_manager.get_module(module_id)
        if require_operational and not self.is_module_operational(module_id):
            raise ValueError(f"module {module_id} is not operational")
        if not self.module_services.has(module_id):
            raise ValueError(f"module {module_id} has no installed service")
        return self.module_services.get(module_id)

    def register_action_handler(
        self,
        module_id: str,
        action_type: str,
        handler: ActionHandler,
        *,
        owner_package_id: str | None = None,
    ) -> None:
        self.validate_module_action(module_id, action_type)
        self.validate_module_owner(module_id, handler)
        self.validate_action_handler_registration(module_id, action_type, replacing_package_id=owner_package_id)
        self.action_dispatcher.register_handler(
            module_id,
            action_type,
            handler,
            owner_package_id=owner_package_id,
        )

    def register_briefing_provider(
        self,
        module_id: str,
        provider: BriefingSignalProvider,
        *,
        owner_package_id: str | None = None,
    ) -> None:
        self.module_manager.get_module(module_id)
        self.validate_module_owner(module_id, provider)
        self.validate_briefing_provider_registration(module_id, replacing_package_id=owner_package_id)
        self.signal_registry.register_provider(module_id, provider, owner_package_id=owner_package_id)

    def register_module_service(
        self,
        module_id: str,
        service: object,
        *,
        owner_package_id: str | None = None,
    ) -> None:
        self.module_manager.get_module(module_id)
        self.validate_module_owner(module_id, service)
        self.validate_module_service_registration(module_id, replacing_package_id=owner_package_id)
        self.module_services.register(module_id, service, owner_package_id=owner_package_id)

    def unregister_action_handler(self, module_id: str, action_type: str) -> None:
        self.module_manager.get_module(module_id)
        if self.action_dispatcher.owner_for(module_id, action_type) is not None:
            raise ValueError(f"handler {module_id}:{action_type} is package-managed")
        self.action_dispatcher.unregister_handler(module_id, action_type)

    def unregister_briefing_provider(self, module_id: str) -> None:
        self.module_manager.get_module(module_id)
        if self.signal_registry.owner_for(module_id) is not None:
            raise ValueError(f"briefing provider for {module_id} is package-managed")
        self.signal_registry.unregister_provider(module_id)

    def unregister_module_service(self, module_id: str) -> None:
        self.module_manager.get_module(module_id)
        if self.module_services.owner_for(module_id) is not None:
            raise ValueError(f"module service for {module_id} is package-managed")
        self.module_services.unregister(module_id)

    def register_module_package(self, package) -> None:
        if not isinstance(package, ModulePackage):
            raise ValueError("package must be a ModulePackage")
        for binding in package.module_bindings:
            self.module_manager.get_module(binding.module_id)
        self.module_packages.validate(package)
        if self.module_packages.has(package.package_id):
            existing = self.module_packages.get(package.package_id)
            self._unregister_package_bindings(existing)
        self.module_packages.register(package)

    def activate_module_package(self, package_id: str) -> None:
        if not isinstance(package_id, str) or not package_id:
            raise ValueError("package_id must be a non-empty string")
        self.module_packages.activate(package_id)

    def deactivate_module_package(self, package_id: str) -> None:
        if not isinstance(package_id, str) or not package_id:
            raise ValueError("package_id must be a non-empty string")
        self.module_packages.deactivate(package_id)

    def uninstall_module_package(self, package_id: str) -> None:
        if not isinstance(package_id, str) or not package_id:
            raise ValueError("package_id must be a non-empty string")
        package = self.module_packages.get(package_id)
        self._unregister_package_bindings(package)
        self.module_packages.remove(package_id)

    def _validate_package_binding_ownership(self, package: ModulePackage) -> None:
        if not isinstance(package, ModulePackage):
            raise ValueError("package must be a ModulePackage")
        for binding in package.module_bindings:
            self.module_manager.get_module(binding.module_id)
            mapped_package_id = self.module_packages.package_id_for_module(binding.module_id)
            if mapped_package_id != package.package_id:
                raise ValueError(
                    f"module {binding.module_id} is mapped to package {mapped_package_id}, not {package.package_id}"
                )
            service_owner = self.module_services.owner_for(binding.module_id)
            if service_owner is not None and service_owner != package.package_id:
                raise ValueError(
                    f"module service for {binding.module_id} is owned by {service_owner}, not {package.package_id}"
                )
            if service_owner is None and self.module_services.has(binding.module_id):
                raise ValueError(
                    f"module service for {binding.module_id} is no longer package-managed by {package.package_id}"
                )
            provider_owner = self.signal_registry.owner_for(binding.module_id)
            if provider_owner is not None and provider_owner != package.package_id:
                raise ValueError(
                    f"briefing provider for {binding.module_id} is owned by {provider_owner}, not {package.package_id}"
                )
            if provider_owner is None and self.signal_registry.has_provider(binding.module_id):
                raise ValueError(
                    f"briefing provider for {binding.module_id} is no longer package-managed by {package.package_id}"
                )
            for action_binding in binding.action_bindings:
                handler_owner = self.action_dispatcher.owner_for(binding.module_id, action_binding.action_type)
                if handler_owner is not None and handler_owner != package.package_id:
                    raise ValueError(
                        f"handler for {binding.module_id}:{action_binding.action_type} is owned by "
                        f"{handler_owner}, not {package.package_id}"
                    )
                if handler_owner is None and self.action_dispatcher.has_handler(binding.module_id, action_binding.action_type):
                    raise ValueError(
                        f"handler for {binding.module_id}:{action_binding.action_type} is no longer package-managed by "
                        f"{package.package_id}"
                    )

    def _unregister_package_bindings(self, package) -> None:
        if not isinstance(package, ModulePackage):
            raise ValueError("package must be a ModulePackage")
        self._validate_package_binding_ownership(package)
        for binding in package.module_bindings:
            self.module_services.unregister(binding.module_id, owner_package_id=package.package_id)
            self.signal_registry.unregister_provider(binding.module_id, owner_package_id=package.package_id)
            self.action_dispatcher.unregister_module(binding.module_id, owner_package_id=package.package_id)
