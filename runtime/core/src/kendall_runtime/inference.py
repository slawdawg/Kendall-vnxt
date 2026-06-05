from __future__ import annotations

from dataclasses import dataclass, field

from .module_manager import ModuleManager
from .module_package_registry import ModulePackageRegistry
from .module_service_registry import ModuleServiceRegistry
from .privacy import HostedUseRequest, OutboundPrivacyGate, PrivacyGateDecision


@dataclass(slots=True)
class InferenceRequest:
    module_id: str
    task_type: str
    data_classes: list[str] = field(default_factory=list)
    context_labels: list[str] = field(default_factory=list)
    prefer_hosted: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("inference request must declare a module_id")
        if not isinstance(self.task_type, str) or not self.task_type:
            raise ValueError("inference request must declare a task_type")
        if not isinstance(self.data_classes, list):
            raise ValueError("inference request data_classes must be a list")
        if not isinstance(self.context_labels, list):
            raise ValueError("inference request context_labels must be a list")
        if any(not isinstance(item, str) or not item for item in self.data_classes):
            raise ValueError("inference request data_classes must be non-empty strings")
        if any(not isinstance(item, str) or not item for item in self.context_labels):
            raise ValueError("inference request context_labels must be non-empty strings")
        if not isinstance(self.prefer_hosted, bool):
            raise ValueError("inference request prefer_hosted must be a boolean")
        self.data_classes = list(self.data_classes)
        self.context_labels = list(self.context_labels)

    def clone(self) -> "InferenceRequest":
        return InferenceRequest(
            module_id=self.module_id,
            task_type=self.task_type,
            data_classes=list(self.data_classes),
            context_labels=list(self.context_labels),
            prefer_hosted=self.prefer_hosted,
        )


@dataclass(slots=True)
class InferenceRouteDecision:
    backend: str
    hosted_approved: bool
    privacy_decision: PrivacyGateDecision

    def __post_init__(self) -> None:
        if not isinstance(self.backend, str) or not self.backend:
            raise ValueError("inference route decision must declare a backend")
        if not isinstance(self.hosted_approved, bool):
            raise ValueError("inference route decision hosted_approved must be a boolean")
        if not isinstance(self.privacy_decision, PrivacyGateDecision):
            raise ValueError("inference route decision privacy_decision must be a PrivacyGateDecision")
        self.privacy_decision = self.privacy_decision.clone()

    def clone(self) -> "InferenceRouteDecision":
        return InferenceRouteDecision(
            backend=self.backend,
            hosted_approved=self.hosted_approved,
            privacy_decision=self.privacy_decision.clone(),
        )


@dataclass(slots=True)
class InferenceRoutingService:
    module_manager: ModuleManager
    module_packages: ModulePackageRegistry
    module_services: ModuleServiceRegistry
    privacy_gate: OutboundPrivacyGate
    local_backend_name: str = "local-default"
    hosted_backend_name: str = "hosted-optional"

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("inference routing service module_manager must be a ModuleManager")
        if not isinstance(self.module_packages, ModulePackageRegistry):
            raise ValueError("inference routing service module_packages must be a ModulePackageRegistry")
        if not isinstance(self.module_services, ModuleServiceRegistry):
            raise ValueError("inference routing service module_services must be a ModuleServiceRegistry")
        if not isinstance(self.privacy_gate, OutboundPrivacyGate):
            raise ValueError("inference routing service privacy_gate must be an OutboundPrivacyGate")
        if not isinstance(self.local_backend_name, str) or not self.local_backend_name:
            raise ValueError("inference routing service local_backend_name must be a non-empty string")
        if not isinstance(self.hosted_backend_name, str) or not self.hosted_backend_name:
            raise ValueError("inference routing service hosted_backend_name must be a non-empty string")

    def route(self, request: InferenceRequest) -> InferenceRouteDecision:
        if not isinstance(request, InferenceRequest):
            raise ValueError("request must be an InferenceRequest")
        request = request.clone()
        availability = self._check_module_availability(request.module_id)
        if not availability.allowed:
            return InferenceRouteDecision(
                backend=self.local_backend_name,
                hosted_approved=False,
                privacy_decision=availability,
            )

        if not request.prefer_hosted:
            return InferenceRouteDecision(
                backend=self.local_backend_name,
                hosted_approved=False,
                privacy_decision=PrivacyGateDecision(
                    allowed=True,
                    reason="local inference selected by default",
                ),
            )

        privacy_decision = self.privacy_gate.evaluate_hosted_use(
            HostedUseRequest(
                module_id=request.module_id,
                data_classes=request.data_classes,
                context_labels=request.context_labels,
            )
        )
        if not privacy_decision.allowed:
            return InferenceRouteDecision(
                backend=self.local_backend_name,
                hosted_approved=False,
                privacy_decision=privacy_decision,
            )

        return InferenceRouteDecision(
            backend=self.hosted_backend_name,
            hosted_approved=True,
            privacy_decision=privacy_decision,
        )

    def _check_module_availability(self, module_id: str) -> PrivacyGateDecision:
        try:
            registered = self.module_manager.get_module(module_id)
        except KeyError as exc:
            return PrivacyGateDecision(allowed=False, reason=str(exc))
        if not registered.enabled:
            return PrivacyGateDecision(allowed=False, reason=f"module {module_id} is disabled")
        if not self.module_packages.is_module_active(module_id):
            return PrivacyGateDecision(allowed=False, reason=f"module package for {module_id} is inactive")
        if not self.module_services.has(module_id):
            return PrivacyGateDecision(allowed=False, reason=f"module {module_id} has no installed service")
        return PrivacyGateDecision(allowed=True, reason="module is available for inference routing")
