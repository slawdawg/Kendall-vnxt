from __future__ import annotations

from dataclasses import dataclass

from .actions import ActionDispatchResult, ActionDispatcher
from .briefing import BriefingPacket, BriefingService, BriefingSignal
from .module_api import ActionContext, BriefingContext, BriefingResult
from .module_manager import ModuleManager
from .policy import ActionOutcome, ActionRequest, PolicyDecision, PolicyGate
from .signal_registry import BriefingSignalRegistry
from .data_scope import DataScopeManager
from .memory_scope import MemoryScopeManager
from .module_package_registry import ModulePackageRegistry


@dataclass(slots=True)
class OrchestrationService:
    """Coordinate enabled modules through core-owned briefing and action paths."""

    module_manager: ModuleManager
    briefing_service: BriefingService
    policy_gate: PolicyGate
    action_dispatcher: ActionDispatcher
    signal_registry: BriefingSignalRegistry
    data_scope_manager: DataScopeManager
    memory_scope_manager: MemoryScopeManager
    module_packages: ModulePackageRegistry

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("orchestration service module_manager must be a ModuleManager")
        if not isinstance(self.briefing_service, BriefingService):
            raise ValueError("orchestration service briefing_service must be a BriefingService")
        if not isinstance(self.policy_gate, PolicyGate):
            raise ValueError("orchestration service policy_gate must be a PolicyGate")
        if not isinstance(self.action_dispatcher, ActionDispatcher):
            raise ValueError("orchestration service action_dispatcher must be an ActionDispatcher")
        if not isinstance(self.signal_registry, BriefingSignalRegistry):
            raise ValueError("orchestration service signal_registry must be a BriefingSignalRegistry")
        if not isinstance(self.data_scope_manager, DataScopeManager):
            raise ValueError("orchestration service data_scope_manager must be a DataScopeManager")
        if not isinstance(self.memory_scope_manager, MemoryScopeManager):
            raise ValueError("orchestration service memory_scope_manager must be a MemoryScopeManager")
        if not isinstance(self.module_packages, ModulePackageRegistry):
            raise ValueError("orchestration service module_packages must be a ModulePackageRegistry")

    def compose_briefing(
        self,
        briefing_type: str,
        signals_by_module: dict[str, list[BriefingSignal]],
        *,
        max_items: int = 8,
    ) -> BriefingPacket:
        if not isinstance(signals_by_module, dict):
            raise ValueError("signals_by_module must be a dict[str, list[BriefingSignal]]")
        eligible_signals: list[BriefingSignal] = []

        for module_id, signals in signals_by_module.items():
            if not isinstance(module_id, str) or not module_id:
                raise ValueError("signals_by_module keys must be non-empty strings")
            if not isinstance(signals, list):
                raise ValueError("signals_by_module values must be lists of BriefingSignal")
            for signal in signals:
                if not isinstance(signal, BriefingSignal):
                    raise ValueError("signals_by_module values must contain BriefingSignal instances")
            if not self.module_manager.has_module(module_id):
                continue
            if not self.module_packages.is_module_active(module_id):
                continue
            if not self.module_manager.is_enabled(module_id):
                continue
            for signal in signals:
                if signal.module_id != module_id:
                    raise ValueError(
                        f"briefing signal module mismatch: bucket={module_id}, signal={signal.module_id}"
                    )
            eligible_signals.extend(signal.clone() for signal in signals)

        return self.briefing_service.compose(briefing_type, eligible_signals, max_items=max_items)

    def compose_briefing_from_registered_modules(
        self,
        briefing_type: str,
        *,
        max_items: int = 8,
    ) -> BriefingPacket:
        signals_by_module: dict[str, list[BriefingSignal]] = {}
        for module in self.module_manager.list_modules(enabled_only=True):
            module_id = module.contract.identity.module_id
            if not self.module_packages.is_module_active(module_id):
                continue
            provider = self.signal_registry.provider_for(module_id)
            if provider is None:
                continue
            context = BriefingContext(
                module_id=module_id,
                briefing_type=briefing_type,
                data=self.data_scope_manager.for_module(module_id),
                memory=self.memory_scope_manager.for_module(module_id),
            )
            result = provider(context)
            if not isinstance(result, BriefingResult):
                raise ValueError(f"briefing provider for {module_id} must return a BriefingResult")
            signals_by_module[module_id] = result.signals
        return self.compose_briefing(briefing_type, signals_by_module, max_items=max_items)

    def route_action(self, request: ActionRequest) -> ActionOutcome:
        if not isinstance(request, ActionRequest):
            raise ValueError("request must be an ActionRequest")
        request = request.clone()
        decision = self.policy_gate.evaluate(request)
        if not decision.allowed:
            return self.policy_gate.record_denied(request, decision)

        if not self.action_dispatcher.has_handler(request.module_id, request.action_type):
            return self.policy_gate.record_denied(
                request,
                PolicyDecision(
                    allowed=False,
                    reason=f"no handler registered for {request.module_id}:{request.action_type}",
                ),
            )

        context = ActionContext(
            module_id=request.module_id,
            request=request,
            data=self.data_scope_manager.for_module(request.module_id),
            memory=self.memory_scope_manager.for_module(request.module_id),
        )
        try:
            dispatch = self.action_dispatcher.dispatch(context)
        except Exception as exc:
            return self.policy_gate.record_execution_failure(request, str(exc))

        allowed = self.policy_gate.record_allowed(request, decision.reason)
        return ActionOutcome(
            decision=allowed.decision,
            audit_record=allowed.audit_record,
            execution_payload=dispatch.payload,
        )
