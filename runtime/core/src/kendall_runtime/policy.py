from __future__ import annotations

from dataclasses import dataclass, field

from .module_manager import ModuleManager
from .module_package_registry import ModulePackageRegistry
from .services.audit import AuditRecord, AuditService
from .services.trust import TrustPolicyService

VALID_ACTION_MODES = frozenset({"advisory", "drafting", "internal", "external"})


def _require_action_request(request: object) -> ActionRequest:
    if not isinstance(request, ActionRequest):
        raise ValueError("request must be an ActionRequest")
    return request.clone()


@dataclass(slots=True)
class ActionRequest:
    module_id: str
    action_type: str
    mode: str
    target: str
    details: dict[str, str] = field(default_factory=dict)
    approval_present: bool = False
    user_visible_disruption: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.mode, str) or self.mode not in VALID_ACTION_MODES:
            joined = ", ".join(sorted(VALID_ACTION_MODES))
            raise ValueError(f"unknown action mode {self.mode!r}; expected one of: {joined}")
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("action request must declare a module_id")
        if not isinstance(self.action_type, str) or not self.action_type:
            raise ValueError("action request must declare an action_type")
        if not isinstance(self.target, str) or not self.target:
            raise ValueError("action request must declare a target")
        if not isinstance(self.details, dict):
            raise ValueError("action request details must be a dict")
        for key, value in self.details.items():
            if not isinstance(key, str) or not key:
                raise ValueError("action request detail keys must be non-empty strings")
            if not isinstance(value, str):
                raise ValueError("action request detail values must be strings")
        if not isinstance(self.approval_present, bool):
            raise ValueError("action request approval_present must be a boolean")
        if not isinstance(self.user_visible_disruption, bool):
            raise ValueError("action request user_visible_disruption must be a boolean")
        self.details = dict(self.details)

    def clone(self) -> "ActionRequest":
        return ActionRequest(
            module_id=self.module_id,
            action_type=self.action_type,
            mode=self.mode,
            target=self.target,
            details=dict(self.details),
            approval_present=self.approval_present,
            user_visible_disruption=self.user_visible_disruption,
        )


@dataclass(slots=True)
class PolicyDecision:
    allowed: bool
    reason: str
    requires_approval: bool = False
    audit_recorded: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.allowed, bool):
            raise ValueError("allowed must be a boolean")
        if not isinstance(self.reason, str) or not self.reason:
            raise ValueError("reason must be a non-empty string")
        if not isinstance(self.requires_approval, bool):
            raise ValueError("requires_approval must be a boolean")
        if not isinstance(self.audit_recorded, bool):
            raise ValueError("audit_recorded must be a boolean")

    def clone(self) -> "PolicyDecision":
        return PolicyDecision(
            allowed=self.allowed,
            reason=self.reason,
            requires_approval=self.requires_approval,
            audit_recorded=self.audit_recorded,
        )


@dataclass(slots=True)
class ActionOutcome:
    decision: PolicyDecision
    audit_record: AuditRecord | None = None
    execution_payload: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.decision, PolicyDecision):
            raise ValueError("decision must be a PolicyDecision")
        if self.audit_record is not None and not isinstance(self.audit_record, AuditRecord):
            raise ValueError("audit_record must be an AuditRecord or None")
        if not isinstance(self.execution_payload, dict):
            raise ValueError("execution_payload must be a dict")
        for key, value in self.execution_payload.items():
            if not isinstance(key, str) or not key:
                raise ValueError("execution payload keys must be non-empty strings")
            if not isinstance(value, str):
                raise ValueError("execution payload values must be strings")
        self.decision = self.decision.clone()
        if self.audit_record is not None:
            self.audit_record = self.audit_record.clone()
        self.execution_payload = dict(self.execution_payload)

    def clone(self) -> "ActionOutcome":
        return ActionOutcome(
            decision=self.decision.clone(),
            audit_record=None if self.audit_record is None else self.audit_record.clone(),
            execution_payload=dict(self.execution_payload),
        )


@dataclass(slots=True)
class PolicyGate:
    module_manager: ModuleManager
    trust_service: TrustPolicyService
    audit_service: AuditService
    module_packages: ModulePackageRegistry = field(default_factory=ModulePackageRegistry)

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("policy gate module_manager must be a ModuleManager")
        if not isinstance(self.trust_service, TrustPolicyService):
            raise ValueError("policy gate trust_service must be a TrustPolicyService")
        if not isinstance(self.audit_service, AuditService):
            raise ValueError("policy gate audit_service must be an AuditService")
        if not isinstance(self.module_packages, ModulePackageRegistry):
            raise ValueError("policy gate module_packages must be a ModulePackageRegistry")

    def evaluate(self, request: ActionRequest) -> PolicyDecision:
        request = _require_action_request(request)
        try:
            registered = self.module_manager.get_module(request.module_id)
        except KeyError as exc:
            return PolicyDecision(allowed=False, reason=str(exc))

        if not registered.enabled:
            return PolicyDecision(allowed=False, reason=f"module {request.module_id} is disabled")

        if not self.module_packages.is_module_active(request.module_id):
            return PolicyDecision(
                allowed=False,
                reason=f"module package for {request.module_id} is inactive",
            )

        contract = registered.contract
        posture = self.trust_service.resolve_posture(
            request.module_id,
            fallback_posture=contract.trust.get("initial_posture", "advisory"),
        )
        supported_postures = set(contract.trust.get("supported_autonomy_levels", []))
        if supported_postures and posture not in supported_postures:
            return PolicyDecision(
                allowed=False,
                reason=f"{request.module_id} posture {posture} is not supported by contract",
            )

        if request.action_type in contract.actions.get("forbidden_actions", []):
            return PolicyDecision(allowed=False, reason=f"{request.action_type} is forbidden by contract")

        blocked = set(contract.trust.get("blocked_in_release_1", []))
        if request.action_type in blocked:
            return PolicyDecision(allowed=False, reason=f"{request.action_type} is blocked in Release 1")

        allowed_actions = self._allowed_actions_for_mode(contract.actions, request.mode)
        if request.action_type not in allowed_actions:
            return PolicyDecision(
                allowed=False,
                reason=f"{request.action_type} is not an allowed {request.mode} action for {request.module_id}",
            )

        approval_decision = self._check_approval_requirement(request, contract.trust)
        if approval_decision is not None:
            return approval_decision

        posture_decision = self._check_posture(posture, request)
        if posture_decision is not None:
            return posture_decision

        return PolicyDecision(allowed=True, reason="allowed by module contract and trust policy")

    def execute(self, request: ActionRequest) -> ActionOutcome:
        request = _require_action_request(request)
        decision = self.evaluate(request)
        if not decision.allowed:
            return self.record_denied(request, decision)

        return self.record_allowed(request, decision.reason)

    def record_denied(self, request: ActionRequest, decision: PolicyDecision) -> ActionOutcome:
        request = _require_action_request(request)
        audit_record = self.audit_service.append(
            actor=request.module_id,
            action_type="policy-denied",
            target=request.target,
            details={
                "requested_action_type": request.action_type,
                "requested_mode": request.mode,
                "reason": decision.reason,
            },
            reversible=False,
        )
        return ActionOutcome(
            decision=PolicyDecision(
                allowed=False,
                reason=decision.reason,
                requires_approval=decision.requires_approval,
                audit_recorded=True,
            )
            ,
            audit_record=audit_record,
        )

    def record_allowed(self, request: ActionRequest, reason: str) -> ActionOutcome:
        request = _require_action_request(request)
        audit_record = self.audit_service.append(
            actor=request.module_id,
            action_type=request.action_type,
            target=request.target,
            details=request.details,
            reversible=request.mode == "internal",
        )
        return ActionOutcome(
            decision=PolicyDecision(
                allowed=True,
                reason=reason,
                requires_approval=False,
                audit_recorded=True,
            ),
            audit_record=audit_record,
        )

    def record_execution_failure(self, request: ActionRequest, reason: str) -> ActionOutcome:
        request = _require_action_request(request)
        audit_record = self.audit_service.append(
            actor=request.module_id,
            action_type="execution-failed",
            target=request.target,
            details={
                "requested_action_type": request.action_type,
                "requested_mode": request.mode,
                "reason": reason,
            },
            reversible=False,
        )
        return ActionOutcome(
            decision=PolicyDecision(
                allowed=False,
                reason=reason,
                requires_approval=False,
                audit_recorded=True,
            ),
            audit_record=audit_record,
        )

    def _allowed_actions_for_mode(self, actions: dict, mode: str) -> list[str]:
        if mode == "advisory":
            return actions.get("advisory_outputs", [])
        if mode == "drafting":
            return actions.get("drafting_outputs", [])
        if mode == "internal":
            return actions.get("internal_actions", [])
        if mode == "external":
            return actions.get("external_actions", [])
        return []

    def _check_approval_requirement(self, request: ActionRequest, trust: dict) -> PolicyDecision | None:
        required = set(trust.get("approval_required_for", []))

        needs_approval = False
        if request.action_type in required:
            needs_approval = True
        elif request.mode == "drafting" and "draft-use" in required:
            needs_approval = True
        elif request.action_type == "create-tentative-internal-hold":
            if "tentative-hold-if-user-visible-disruption" in required and request.user_visible_disruption:
                needs_approval = True

        if needs_approval and not request.approval_present:
            return PolicyDecision(
                allowed=False,
                reason=f"{request.action_type} requires explicit approval",
                requires_approval=True,
            )
        return None

    def _check_posture(self, posture: str, request: ActionRequest) -> PolicyDecision | None:
        if posture == "shadow" and request.mode in {"drafting", "internal", "external"}:
            return PolicyDecision(allowed=False, reason=f"{request.module_id} is in shadow posture")
        if posture == "advisory" and request.mode in {"internal", "external"}:
            return PolicyDecision(allowed=False, reason=f"{request.module_id} posture only permits advisory output")
        if posture == "approval-bound" and request.mode in {"drafting", "internal", "external"}:
            if not request.approval_present:
                return PolicyDecision(
                    allowed=False,
                    reason=f"{request.module_id} posture requires approval",
                    requires_approval=True,
                )
        if posture == "internal-action-limited" and request.mode == "external":
            return PolicyDecision(
                allowed=False,
                reason=f"{request.module_id} posture blocks external actions",
            )
        return None
