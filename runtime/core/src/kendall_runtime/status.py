from __future__ import annotations

from dataclasses import dataclass

from .actions import ActionDispatcher
from .module_manager import ModuleManager
from .module_package_registry import ModulePackageRegistry
from .module_service_registry import ModuleServiceRegistry
from .services.audit import AuditService
from .services.memory import MemoryService
from .services.trust import TrustPolicyService
from .signal_registry import BriefingSignalRegistry


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class ModuleStatus:
    module_id: str
    enabled: bool
    package_id: str | None
    package_active: bool
    operational: bool
    installed: bool
    version: str
    configured_posture: str
    effective_posture: str
    has_service: bool
    service_owner_package_id: str | None
    has_signal_provider: bool
    signal_provider_owner_package_id: str | None
    registered_action_count: int
    direct_action_count: int
    package_action_count: int

    def __post_init__(self) -> None:
        _require_non_empty_string(self.module_id, field_name="module_id")
        if not isinstance(self.enabled, bool):
            raise ValueError("enabled must be a boolean")
        if self.package_id is not None:
            _require_non_empty_string(self.package_id, field_name="package_id")
        if not isinstance(self.package_active, bool):
            raise ValueError("package_active must be a boolean")
        if self.package_id is None and not self.package_active:
            raise ValueError("package_active must be True when package_id is None")
        if not isinstance(self.operational, bool):
            raise ValueError("operational must be a boolean")
        if not isinstance(self.installed, bool):
            raise ValueError("installed must be a boolean")
        if self.operational and (not self.enabled or not self.package_active):
            raise ValueError("operational cannot be True when the module is disabled or package-inactive")
        _require_non_empty_string(self.version, field_name="version")
        _require_non_empty_string(self.configured_posture, field_name="configured_posture")
        _require_non_empty_string(self.effective_posture, field_name="effective_posture")
        if not isinstance(self.has_service, bool):
            raise ValueError("has_service must be a boolean")
        if self.service_owner_package_id is not None:
            _require_non_empty_string(self.service_owner_package_id, field_name="service_owner_package_id")
        if not self.has_service and self.service_owner_package_id is not None:
            raise ValueError("service_owner_package_id must be None when has_service is False")
        if not isinstance(self.has_signal_provider, bool):
            raise ValueError("has_signal_provider must be a boolean")
        if self.signal_provider_owner_package_id is not None:
            _require_non_empty_string(
                self.signal_provider_owner_package_id,
                field_name="signal_provider_owner_package_id",
            )
        if not self.has_signal_provider and self.signal_provider_owner_package_id is not None:
            raise ValueError("signal_provider_owner_package_id must be None when has_signal_provider is False")
        for field_name in ("registered_action_count", "direct_action_count", "package_action_count"):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")
        installed_surface_present = (
            self.has_service or self.has_signal_provider or self.registered_action_count > 0
        )
        if self.installed != installed_surface_present:
            raise ValueError(
                "installed must match whether any service, signal provider, or action binding is present"
            )
        if self.direct_action_count + self.package_action_count != self.registered_action_count:
            raise ValueError(
                "direct_action_count plus package_action_count must equal registered_action_count"
            )
        if self.package_id is None and (
            self.service_owner_package_id is not None
            or self.signal_provider_owner_package_id is not None
            or self.package_action_count > 0
        ):
            raise ValueError("package-managed bindings require a package_id")

    def clone(self) -> "ModuleStatus":
        return ModuleStatus(
            module_id=self.module_id,
            enabled=self.enabled,
            package_id=self.package_id,
            package_active=self.package_active,
            operational=self.operational,
            installed=self.installed,
            version=self.version,
            configured_posture=self.configured_posture,
            effective_posture=self.effective_posture,
            has_service=self.has_service,
            service_owner_package_id=self.service_owner_package_id,
            has_signal_provider=self.has_signal_provider,
            signal_provider_owner_package_id=self.signal_provider_owner_package_id,
            registered_action_count=self.registered_action_count,
            direct_action_count=self.direct_action_count,
            package_action_count=self.package_action_count,
        )


@dataclass(slots=True)
class RuntimeStatusSnapshot:
    packages: list["PackageStatus"]
    modules: list[ModuleStatus]
    module_counts: "ModuleCounts"
    package_counts: "PackageCounts"
    privacy_surface_breakdown: "PrivacySurfaceBreakdown"
    load_failures: list[str]
    load_failure_breakdown: "LoadFailureBreakdown"
    installed_surface_breakdown: "InstalledSurfaceBreakdown"
    memory_breakdown: "MemoryBreakdown"
    audit_record_count: int
    audit_breakdown: "AuditBreakdown"
    reversible_audit_count: int
    memory_entry_count: int

    def __post_init__(self) -> None:
        if not isinstance(self.packages, list):
            raise ValueError("packages must be a list[PackageStatus]")
        if not isinstance(self.modules, list):
            raise ValueError("modules must be a list[ModuleStatus]")
        if not isinstance(self.load_failures, list):
            raise ValueError("load_failures must be a list[str]")
        if any(not isinstance(package, PackageStatus) for package in self.packages):
            raise ValueError("packages must contain PackageStatus instances")
        if any(not isinstance(module, ModuleStatus) for module in self.modules):
            raise ValueError("modules must contain ModuleStatus instances")
        if not isinstance(self.module_counts, ModuleCounts):
            raise ValueError("module_counts must be a ModuleCounts")
        if not isinstance(self.package_counts, PackageCounts):
            raise ValueError("package_counts must be a PackageCounts")
        if not isinstance(self.privacy_surface_breakdown, PrivacySurfaceBreakdown):
            raise ValueError("privacy_surface_breakdown must be a PrivacySurfaceBreakdown")
        if any(not isinstance(failure, str) or not failure for failure in self.load_failures):
            raise ValueError("load_failures must contain non-empty strings")
        if not isinstance(self.load_failure_breakdown, LoadFailureBreakdown):
            raise ValueError("load_failure_breakdown must be a LoadFailureBreakdown")
        if not isinstance(self.installed_surface_breakdown, InstalledSurfaceBreakdown):
            raise ValueError("installed_surface_breakdown must be an InstalledSurfaceBreakdown")
        if not isinstance(self.memory_breakdown, MemoryBreakdown):
            raise ValueError("memory_breakdown must be a MemoryBreakdown")
        if not isinstance(self.audit_record_count, int) or self.audit_record_count < 0:
            raise ValueError("audit_record_count must be a non-negative integer")
        if not isinstance(self.audit_breakdown, AuditBreakdown):
            raise ValueError("audit_breakdown must be an AuditBreakdown")
        if not isinstance(self.reversible_audit_count, int) or self.reversible_audit_count < 0:
            raise ValueError("reversible_audit_count must be a non-negative integer")
        if not isinstance(self.memory_entry_count, int) or self.memory_entry_count < 0:
            raise ValueError("memory_entry_count must be a non-negative integer")
        package_ids = [package.package_id for package in self.packages]
        if len(set(package_ids)) != len(package_ids):
            raise ValueError("packages must not contain duplicate package_id values")
        module_ids = [module.module_id for module in self.modules]
        if len(set(module_ids)) != len(module_ids):
            raise ValueError("modules must not contain duplicate module_id values")
        package_modules = {package.package_id: set(package.module_ids) for package in self.packages}
        if any(len(module_ids) != len(set(module_ids)) for module_ids in (package.module_ids for package in self.packages)):
            raise ValueError("package module_ids must not contain duplicates")
        for module in self.modules:
            if module.package_id is None:
                continue
            if module.package_id not in package_modules:
                raise ValueError(f"module {module.module_id} references unknown package_id {module.package_id}")
            if module.module_id not in package_modules[module.package_id]:
                raise ValueError(
                    f"module {module.module_id} must appear in package {module.package_id} module_ids"
                )
            package_active = next(package.active for package in self.packages if package.package_id == module.package_id)
            if module.package_active != package_active:
                raise ValueError(
                    f"module {module.module_id} package_active must match package {module.package_id} active state"
                )
        for package in self.packages:
            for module_id in package.module_ids:
                if module_id not in module_ids:
                    raise ValueError(
                        f"package {package.package_id} references unknown module_id {module_id}"
                    )
        if len(self.packages) != self.package_counts.total_count:
            raise ValueError("package_counts.total_count must match packages length")
        if sum(1 for package in self.packages if package.active) != self.package_counts.active_count:
            raise ValueError("package_counts.active_count must match active package count")
        if sum(1 for package in self.packages if not package.active) != self.package_counts.inactive_count:
            raise ValueError("package_counts.inactive_count must match inactive package count")
        if len(self.modules) != self.module_counts.total_count:
            raise ValueError("module_counts.total_count must match modules length")
        if sum(1 for module in self.modules if module.enabled) != self.module_counts.enabled_count:
            raise ValueError("module_counts.enabled_count must match enabled module count")
        if sum(1 for module in self.modules if not module.enabled) != self.module_counts.disabled_count:
            raise ValueError("module_counts.disabled_count must match disabled module count")
        if sum(1 for module in self.modules if module.operational) != self.module_counts.operational_count:
            raise ValueError("module_counts.operational_count must match operational module count")
        if sum(1 for module in self.modules if module.installed) != self.module_counts.installed_count:
            raise ValueError("module_counts.installed_count must match installed module count")
        if self.installed_surface_breakdown.package_managed_service_count != sum(
            1 for module in self.modules if module.has_service and module.service_owner_package_id is not None
        ):
            raise ValueError(
                "installed_surface_breakdown.package_managed_service_count must match package-managed services"
            )
        if self.installed_surface_breakdown.direct_service_count != sum(
            1 for module in self.modules if module.has_service and module.service_owner_package_id is None
        ):
            raise ValueError("installed_surface_breakdown.direct_service_count must match direct services")
        if self.installed_surface_breakdown.package_managed_signal_provider_count != sum(
            1
            for module in self.modules
            if module.has_signal_provider and module.signal_provider_owner_package_id is not None
        ):
            raise ValueError(
                "installed_surface_breakdown.package_managed_signal_provider_count must match "
                "package-managed signal providers"
            )
        if self.installed_surface_breakdown.direct_signal_provider_count != sum(
            1
            for module in self.modules
            if module.has_signal_provider and module.signal_provider_owner_package_id is None
        ):
            raise ValueError(
                "installed_surface_breakdown.direct_signal_provider_count must match direct signal providers"
            )
        if self.installed_surface_breakdown.package_managed_action_count != sum(
            module.package_action_count for module in self.modules
        ):
            raise ValueError(
                "installed_surface_breakdown.package_managed_action_count must match package-managed actions"
            )
        if self.installed_surface_breakdown.direct_action_count != sum(
            module.direct_action_count for module in self.modules
        ):
            raise ValueError("installed_surface_breakdown.direct_action_count must match direct actions")
        if self.privacy_surface_breakdown.local_only_module_count > self.module_counts.total_count:
            raise ValueError("privacy_surface_breakdown.local_only_module_count cannot exceed total modules")
        if self.privacy_surface_breakdown.hosted_eligible_module_count > self.module_counts.total_count:
            raise ValueError("privacy_surface_breakdown.hosted_eligible_module_count cannot exceed total modules")
        if self.privacy_surface_breakdown.sanitization_required_module_count > self.module_counts.total_count:
            raise ValueError(
                "privacy_surface_breakdown.sanitization_required_module_count cannot exceed total modules"
            )
        load_failure_total = (
            self.load_failure_breakdown.missing_root_count
            + self.load_failure_breakdown.non_directory_root_count
            + self.load_failure_breakdown.missing_contract_count
            + self.load_failure_breakdown.invalid_contract_count
            + self.load_failure_breakdown.duplicate_module_id_count
            + self.load_failure_breakdown.missing_dependency_count
            + self.load_failure_breakdown.other_count
        )
        if load_failure_total != len(self.load_failures):
            raise ValueError("load_failure_breakdown counts must match load_failures length")
        audit_total = (
            self.audit_breakdown.policy_denied_count
            + self.audit_breakdown.execution_failed_count
            + self.audit_breakdown.successful_action_count
        )
        if audit_total != self.audit_record_count:
            raise ValueError("audit_breakdown counts must match audit_record_count")
        if self.reversible_audit_count > self.audit_record_count:
            raise ValueError("reversible_audit_count cannot exceed audit_record_count")
        if self.memory_entry_count != sum(self.memory_breakdown.entry_count_by_class.values()):
            raise ValueError("memory_entry_count must match memory_breakdown total")
        self.packages = [package.clone() for package in self.packages]
        self.modules = [module.clone() for module in self.modules]
        self.module_counts = self.module_counts.clone()
        self.package_counts = self.package_counts.clone()
        self.privacy_surface_breakdown = self.privacy_surface_breakdown.clone()
        self.load_failures = list(self.load_failures)
        self.load_failure_breakdown = self.load_failure_breakdown.clone()
        self.installed_surface_breakdown = self.installed_surface_breakdown.clone()
        self.memory_breakdown = self.memory_breakdown.clone()
        self.audit_breakdown = self.audit_breakdown.clone()

    def clone(self) -> "RuntimeStatusSnapshot":
        return RuntimeStatusSnapshot(
            packages=[package.clone() for package in self.packages],
            modules=[module.clone() for module in self.modules],
            module_counts=self.module_counts.clone(),
            package_counts=self.package_counts.clone(),
            privacy_surface_breakdown=self.privacy_surface_breakdown.clone(),
            load_failures=list(self.load_failures),
            load_failure_breakdown=self.load_failure_breakdown.clone(),
            installed_surface_breakdown=self.installed_surface_breakdown.clone(),
            memory_breakdown=self.memory_breakdown.clone(),
            audit_record_count=self.audit_record_count,
            audit_breakdown=self.audit_breakdown.clone(),
            reversible_audit_count=self.reversible_audit_count,
            memory_entry_count=self.memory_entry_count,
        )


@dataclass(slots=True)
class PackageStatus:
    package_id: str
    display_name: str
    version: str
    active: bool
    module_ids: list[str]

    def __post_init__(self) -> None:
        _require_non_empty_string(self.package_id, field_name="package_id")
        _require_non_empty_string(self.display_name, field_name="display_name")
        _require_non_empty_string(self.version, field_name="version")
        if not isinstance(self.active, bool):
            raise ValueError("active must be a boolean")
        if not isinstance(self.module_ids, list):
            raise ValueError("module_ids must be a list[str]")
        if any(not isinstance(module_id, str) or not module_id for module_id in self.module_ids):
            raise ValueError("module_ids must contain non-empty strings")
        self.module_ids = list(self.module_ids)

    def clone(self) -> "PackageStatus":
        return PackageStatus(
            package_id=self.package_id,
            display_name=self.display_name,
            version=self.version,
            active=self.active,
            module_ids=list(self.module_ids),
        )


@dataclass(slots=True)
class AuditBreakdown:
    policy_denied_count: int
    execution_failed_count: int
    successful_action_count: int

    def __post_init__(self) -> None:
        for field_name in ("policy_denied_count", "execution_failed_count", "successful_action_count"):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")

    def clone(self) -> "AuditBreakdown":
        return AuditBreakdown(
            policy_denied_count=self.policy_denied_count,
            execution_failed_count=self.execution_failed_count,
            successful_action_count=self.successful_action_count,
        )


@dataclass(slots=True)
class ModuleCounts:
    total_count: int
    enabled_count: int
    disabled_count: int
    operational_count: int
    installed_count: int

    def __post_init__(self) -> None:
        for field_name in (
            "total_count",
            "enabled_count",
            "disabled_count",
            "operational_count",
            "installed_count",
        ):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")
        if self.enabled_count + self.disabled_count != self.total_count:
            raise ValueError("enabled_count plus disabled_count must equal total_count")
        if self.operational_count > self.enabled_count:
            raise ValueError("operational_count cannot exceed enabled_count")
        if self.installed_count > self.total_count:
            raise ValueError("installed_count cannot exceed total_count")

    def clone(self) -> "ModuleCounts":
        return ModuleCounts(
            total_count=self.total_count,
            enabled_count=self.enabled_count,
            disabled_count=self.disabled_count,
            operational_count=self.operational_count,
            installed_count=self.installed_count,
        )


@dataclass(slots=True)
class PackageCounts:
    total_count: int
    active_count: int
    inactive_count: int

    def __post_init__(self) -> None:
        for field_name in ("total_count", "active_count", "inactive_count"):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")
        if self.active_count + self.inactive_count != self.total_count:
            raise ValueError("active_count plus inactive_count must equal total_count")

    def clone(self) -> "PackageCounts":
        return PackageCounts(
            total_count=self.total_count,
            active_count=self.active_count,
            inactive_count=self.inactive_count,
        )


@dataclass(slots=True)
class PrivacySurfaceBreakdown:
    local_only_module_count: int
    hosted_eligible_module_count: int
    sanitization_required_module_count: int

    def __post_init__(self) -> None:
        for field_name in (
            "local_only_module_count",
            "hosted_eligible_module_count",
            "sanitization_required_module_count",
        ):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")

    def clone(self) -> "PrivacySurfaceBreakdown":
        return PrivacySurfaceBreakdown(
            local_only_module_count=self.local_only_module_count,
            hosted_eligible_module_count=self.hosted_eligible_module_count,
            sanitization_required_module_count=self.sanitization_required_module_count,
        )


@dataclass(slots=True)
class LoadFailureBreakdown:
    missing_root_count: int
    non_directory_root_count: int
    missing_contract_count: int
    invalid_contract_count: int
    duplicate_module_id_count: int
    missing_dependency_count: int
    other_count: int

    def __post_init__(self) -> None:
        for field_name in (
            "missing_root_count",
            "non_directory_root_count",
            "missing_contract_count",
            "invalid_contract_count",
            "duplicate_module_id_count",
            "missing_dependency_count",
            "other_count",
        ):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")

    def clone(self) -> "LoadFailureBreakdown":
        return LoadFailureBreakdown(
            missing_root_count=self.missing_root_count,
            non_directory_root_count=self.non_directory_root_count,
            missing_contract_count=self.missing_contract_count,
            invalid_contract_count=self.invalid_contract_count,
            duplicate_module_id_count=self.duplicate_module_id_count,
            missing_dependency_count=self.missing_dependency_count,
            other_count=self.other_count,
        )


@dataclass(slots=True)
class InstalledSurfaceBreakdown:
    package_managed_service_count: int
    direct_service_count: int
    package_managed_signal_provider_count: int
    direct_signal_provider_count: int
    package_managed_action_count: int
    direct_action_count: int

    def __post_init__(self) -> None:
        for field_name in (
            "package_managed_service_count",
            "direct_service_count",
            "package_managed_signal_provider_count",
            "direct_signal_provider_count",
            "package_managed_action_count",
            "direct_action_count",
        ):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")

    def clone(self) -> "InstalledSurfaceBreakdown":
        return InstalledSurfaceBreakdown(
            package_managed_service_count=self.package_managed_service_count,
            direct_service_count=self.direct_service_count,
            package_managed_signal_provider_count=self.package_managed_signal_provider_count,
            direct_signal_provider_count=self.direct_signal_provider_count,
            package_managed_action_count=self.package_managed_action_count,
            direct_action_count=self.direct_action_count,
        )


@dataclass(slots=True)
class MemoryBreakdown:
    entry_count_by_class: dict[str, int]

    def __post_init__(self) -> None:
        if not isinstance(self.entry_count_by_class, dict):
            raise ValueError("entry_count_by_class must be a dict[str, int]")
        for key, value in self.entry_count_by_class.items():
            if not isinstance(key, str) or not key:
                raise ValueError("memory breakdown keys must be non-empty strings")
            if not isinstance(value, int) or value < 0:
                raise ValueError("memory breakdown values must be non-negative integers")
        self.entry_count_by_class = dict(self.entry_count_by_class)

    def clone(self) -> "MemoryBreakdown":
        return MemoryBreakdown(entry_count_by_class=dict(self.entry_count_by_class))


@dataclass(slots=True)
class StatusService:
    module_manager: ModuleManager
    audit_service: AuditService
    memory_service: MemoryService
    trust_service: TrustPolicyService
    action_dispatcher: ActionDispatcher
    signal_registry: BriefingSignalRegistry
    module_services: ModuleServiceRegistry
    module_packages: ModulePackageRegistry

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("status service module_manager must be a ModuleManager")
        if not isinstance(self.audit_service, AuditService):
            raise ValueError("status service audit_service must be an AuditService")
        if not isinstance(self.memory_service, MemoryService):
            raise ValueError("status service memory_service must be a MemoryService")
        if not isinstance(self.trust_service, TrustPolicyService):
            raise ValueError("status service trust_service must be a TrustPolicyService")
        if not isinstance(self.action_dispatcher, ActionDispatcher):
            raise ValueError("status service action_dispatcher must be an ActionDispatcher")
        if not isinstance(self.signal_registry, BriefingSignalRegistry):
            raise ValueError("status service signal_registry must be a BriefingSignalRegistry")
        if not isinstance(self.module_services, ModuleServiceRegistry):
            raise ValueError("status service module_services must be a ModuleServiceRegistry")
        if not isinstance(self.module_packages, ModulePackageRegistry):
            raise ValueError("status service module_packages must be a ModulePackageRegistry")

    def snapshot(self) -> RuntimeStatusSnapshot:
        packages = [
            PackageStatus(
                package_id=registered.package.package_id,
                display_name=registered.package.display_name or registered.package.package_id,
                version=registered.package.version,
                active=registered.active,
                module_ids=[binding.module_id for binding in registered.package.module_bindings],
            )
            for registered in self.module_packages.list_registered()
        ]
        modules: list[ModuleStatus] = []
        for registered in self.module_manager.list_modules():
            module_id = registered.contract.identity.module_id
            package_id = self.module_packages.package_id_for_module(module_id)
            package_active = self.module_packages.is_module_active(module_id)
            action_types = self.action_dispatcher.list_action_types(module_id)
            action_count = len(action_types)
            direct_action_count = sum(
                1 for action_type in action_types if self.action_dispatcher.owner_for(module_id, action_type) is None
            )
            package_action_count = action_count - direct_action_count
            has_service = self.module_services.has(module_id)
            has_signal_provider = self.signal_registry.has_provider(module_id)
            service_owner_package_id = self.module_services.owner_for(module_id)
            signal_provider_owner_package_id = self.signal_registry.owner_for(module_id)
            configured_posture = registered.contract.trust.get("initial_posture", "advisory")
            effective_posture = self.trust_service.resolve_posture(module_id, fallback_posture=configured_posture)
            modules.append(
                ModuleStatus(
                    module_id=module_id,
                    enabled=registered.enabled,
                    package_id=package_id,
                    package_active=package_active,
                    operational=registered.enabled and package_active,
                    installed=has_service or has_signal_provider or action_count > 0,
                    version=registered.contract.identity.version,
                    configured_posture=configured_posture,
                    effective_posture=effective_posture,
                    has_service=has_service,
                    service_owner_package_id=service_owner_package_id,
                    has_signal_provider=has_signal_provider,
                    signal_provider_owner_package_id=signal_provider_owner_package_id,
                    registered_action_count=action_count,
                    direct_action_count=direct_action_count,
                    package_action_count=package_action_count,
                )
            )

        memory_entry_count = self.memory_service.entry_count()
        audit_records = self.audit_service.list_records()
        policy_denied_count = sum(1 for record in audit_records if record.action_type == "policy-denied")
        execution_failed_count = sum(1 for record in audit_records if record.action_type == "execution-failed")
        load_failures = self.module_manager.list_load_failures()
        snapshot = RuntimeStatusSnapshot(
            packages=packages,
            modules=modules,
            module_counts=ModuleCounts(
                total_count=len(modules),
                enabled_count=sum(1 for module in modules if module.enabled),
                disabled_count=sum(1 for module in modules if not module.enabled),
                operational_count=sum(1 for module in modules if module.operational),
                installed_count=sum(1 for module in modules if module.installed),
            ),
            package_counts=PackageCounts(
                total_count=len(packages),
                active_count=sum(1 for package in packages if package.active),
                inactive_count=sum(1 for package in packages if not package.active),
            ),
            privacy_surface_breakdown=self._summarize_privacy_surfaces(),
            load_failures=load_failures,
            load_failure_breakdown=self._summarize_load_failures(load_failures),
            installed_surface_breakdown=self._summarize_installed_surfaces(modules),
            memory_breakdown=MemoryBreakdown(entry_count_by_class=self.memory_service.entry_count_by_class()),
            audit_record_count=len(audit_records),
            audit_breakdown=AuditBreakdown(
                policy_denied_count=policy_denied_count,
                execution_failed_count=execution_failed_count,
                successful_action_count=(
                    len(audit_records) - policy_denied_count - execution_failed_count
                ),
            ),
            reversible_audit_count=len(self.audit_service.reversible_records()),
            memory_entry_count=memory_entry_count,
        )
        return snapshot.clone()

    def _summarize_load_failures(self, failures: list[str]) -> LoadFailureBreakdown:
        if not isinstance(failures, list):
            raise ValueError("failures must be a list[str]")
        if any(not isinstance(failure, str) or not failure for failure in failures):
            raise ValueError("failures must contain non-empty strings")
        missing_root_count = sum(1 for failure in failures if "module root does not exist" in failure)
        non_directory_root_count = sum(1 for failure in failures if "module root is not a directory" in failure)
        missing_contract_count = sum(1 for failure in failures if "missing module.contract.json" in failure)
        duplicate_module_id_count = sum(1 for failure in failures if "duplicate module_id:" in failure)
        missing_dependency_count = sum(1 for failure in failures if "missing required modules:" in failure)
        invalid_contract_count = sum(
            1
            for failure in failures
            if (
                "module root does not exist" not in failure
                and "module root is not a directory" not in failure
                and "missing module.contract.json" not in failure
                and "duplicate module_id:" not in failure
                and "missing required modules:" not in failure
            )
        )
        return LoadFailureBreakdown(
            missing_root_count=missing_root_count,
            non_directory_root_count=non_directory_root_count,
            missing_contract_count=missing_contract_count,
            invalid_contract_count=invalid_contract_count,
            duplicate_module_id_count=duplicate_module_id_count,
            missing_dependency_count=missing_dependency_count,
            other_count=(
                len(failures)
                - missing_root_count
                - non_directory_root_count
                - missing_contract_count
                - invalid_contract_count
                - duplicate_module_id_count
                - missing_dependency_count
            ),
        )

    def _summarize_installed_surfaces(self, modules: list[ModuleStatus]) -> InstalledSurfaceBreakdown:
        if not isinstance(modules, list):
            raise ValueError("modules must be a list[ModuleStatus]")
        if any(not isinstance(module, ModuleStatus) for module in modules):
            raise ValueError("modules must contain ModuleStatus instances")
        return InstalledSurfaceBreakdown(
            package_managed_service_count=sum(
                1 for module in modules if module.has_service and module.service_owner_package_id is not None
            ),
            direct_service_count=sum(
                1 for module in modules if module.has_service and module.service_owner_package_id is None
            ),
            package_managed_signal_provider_count=sum(
                1
                for module in modules
                if module.has_signal_provider and module.signal_provider_owner_package_id is not None
            ),
            direct_signal_provider_count=sum(
                1 for module in modules if module.has_signal_provider and module.signal_provider_owner_package_id is None
            ),
            package_managed_action_count=sum(module.package_action_count for module in modules),
            direct_action_count=sum(module.direct_action_count for module in modules),
        )

    def _summarize_privacy_surfaces(self) -> PrivacySurfaceBreakdown:
        contracts = [registered.contract for registered in self.module_manager.list_modules()]
        return PrivacySurfaceBreakdown(
            local_only_module_count=sum(
                1 for contract in contracts if contract.privacy.get("local_only_by_default", True)
            ),
            hosted_eligible_module_count=sum(
                1 for contract in contracts if contract.privacy.get("hosted_eligible_data_classes", [])
            ),
            sanitization_required_module_count=sum(
                1 for contract in contracts if contract.privacy.get("sanitization_required", True)
            ),
        )
