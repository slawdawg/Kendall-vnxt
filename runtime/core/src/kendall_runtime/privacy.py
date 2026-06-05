from __future__ import annotations

from dataclasses import dataclass, field

from .module_manager import ModuleManager
from .module_package_registry import ModulePackageRegistry
from .module_service_registry import ModuleServiceRegistry


@dataclass(slots=True)
class HostedUseRequest:
    module_id: str
    data_classes: list[str]
    context_labels: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("hosted use request must declare a module_id")
        if not isinstance(self.data_classes, list):
            raise ValueError("hosted use request data_classes must be a list")
        if not isinstance(self.context_labels, list):
            raise ValueError("hosted use request context_labels must be a list")
        if any(not isinstance(item, str) or not item for item in self.data_classes):
            raise ValueError("hosted use request data_classes must be non-empty strings")
        if any(not isinstance(item, str) or not item for item in self.context_labels):
            raise ValueError("hosted use request context_labels must be non-empty strings")
        self.data_classes = list(self.data_classes)
        self.context_labels = list(self.context_labels)

    def clone(self) -> "HostedUseRequest":
        return HostedUseRequest(
            module_id=self.module_id,
            data_classes=list(self.data_classes),
            context_labels=list(self.context_labels),
        )


@dataclass(slots=True)
class PrivacyGateDecision:
    allowed: bool
    reason: str

    def __post_init__(self) -> None:
        if not isinstance(self.allowed, bool):
            raise ValueError("privacy gate decision allowed must be a boolean")
        if not isinstance(self.reason, str) or not self.reason:
            raise ValueError("privacy gate decision must include a reason")

    def clone(self) -> "PrivacyGateDecision":
        return PrivacyGateDecision(allowed=self.allowed, reason=self.reason)


@dataclass(slots=True)
class OutboundPrivacyGate:
    module_manager: ModuleManager
    module_packages: ModulePackageRegistry = field(default_factory=ModulePackageRegistry)
    module_services: ModuleServiceRegistry = field(default_factory=ModuleServiceRegistry)

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("outbound privacy gate module_manager must be a ModuleManager")
        if not isinstance(self.module_packages, ModulePackageRegistry):
            raise ValueError("outbound privacy gate module_packages must be a ModulePackageRegistry")
        if not isinstance(self.module_services, ModuleServiceRegistry):
            raise ValueError("outbound privacy gate module_services must be a ModuleServiceRegistry")

    def evaluate_hosted_use(self, request: HostedUseRequest) -> PrivacyGateDecision:
        if not isinstance(request, HostedUseRequest):
            raise ValueError("request must be a HostedUseRequest")
        request = request.clone()
        try:
            registered = self.module_manager.get_module(request.module_id)
        except KeyError as exc:
            return PrivacyGateDecision(allowed=False, reason=str(exc))
        if not registered.enabled:
            return PrivacyGateDecision(allowed=False, reason=f"module {request.module_id} is disabled")
        if not self.module_packages.is_module_active(request.module_id):
            return PrivacyGateDecision(
                allowed=False,
                reason=f"module package for {request.module_id} is inactive",
            )
        if not self.module_services.has(request.module_id):
            return PrivacyGateDecision(
                allowed=False,
                reason=f"module {request.module_id} has no installed service",
            )

        contract = registered.contract
        privacy = contract.privacy

        if privacy.get("local_only_by_default", True) and not request.data_classes:
            return PrivacyGateDecision(allowed=False, reason="hosted use requires declared data classes")

        eligible = set(privacy.get("hosted_eligible_data_classes", []))
        forbidden_contexts = set(privacy.get("forbidden_outbound_contexts", []))

        for data_class in request.data_classes:
            if data_class not in eligible:
                return PrivacyGateDecision(
                    allowed=False,
                    reason=f"{request.module_id} cannot send data class outbound: {data_class}",
                )

        for context_label in request.context_labels:
            if context_label in forbidden_contexts:
                return PrivacyGateDecision(
                    allowed=False,
                    reason=f"{request.module_id} cannot send forbidden outbound context: {context_label}",
                )

        return PrivacyGateDecision(allowed=True, reason="hosted use allowed by privacy contract")
