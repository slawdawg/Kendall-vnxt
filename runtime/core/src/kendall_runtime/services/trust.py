from __future__ import annotations

from dataclasses import dataclass, field


DEFAULT_DOMAIN_POSTURE = "advisory"
VALID_POSTURES = frozenset({"shadow", "advisory", "approval-bound", "internal-action-limited"})


def _validate_domain(domain: object) -> None:
    if not isinstance(domain, str) or not domain:
        raise ValueError("domain must be a non-empty string")


@dataclass(slots=True)
class DomainTrustState:
    domain: str
    posture: str = DEFAULT_DOMAIN_POSTURE
    accepted_suggestions: int = 0
    corrected_suggestions: int = 0
    reversed_actions: int = 0
    shadow_successes: int = 0

    def __post_init__(self) -> None:
        _validate_domain(self.domain)
        if self.posture not in VALID_POSTURES:
            joined = ", ".join(sorted(VALID_POSTURES))
            raise ValueError(f"unknown trust posture {self.posture!r}; expected one of: {joined}")
        for field_name in (
            "accepted_suggestions",
            "corrected_suggestions",
            "reversed_actions",
            "shadow_successes",
        ):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")

    def clone(self) -> "DomainTrustState":
        return DomainTrustState(
            domain=self.domain,
            posture=self.posture,
            accepted_suggestions=self.accepted_suggestions,
            corrected_suggestions=self.corrected_suggestions,
            reversed_actions=self.reversed_actions,
            shadow_successes=self.shadow_successes,
        )


@dataclass(slots=True)
class TrustPolicyService:
    """Release 1 trust scaffold using rule-based, domain-local state."""

    domains: dict[str, DomainTrustState] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.domains, dict):
            raise ValueError("domains must be a dict[str, DomainTrustState]")
        normalized_domains: dict[str, DomainTrustState] = {}
        for domain, state in self.domains.items():
            _validate_domain(domain)
            if not isinstance(state, DomainTrustState):
                raise ValueError("domains must contain DomainTrustState instances")
            if state.domain != domain:
                raise ValueError("domain key must match DomainTrustState.domain")
            normalized_domains[domain] = state.clone()
        self.domains = normalized_domains

    def ensure_domain(self, domain: str, posture: str | None = None) -> DomainTrustState:
        _validate_domain(domain)
        if posture is not None:
            self._validate_posture(posture)
        self.list_domains()
        if domain not in self.domains:
            self.domains[domain] = DomainTrustState(domain=domain, posture=posture or DEFAULT_DOMAIN_POSTURE)
        return self.domains[domain].clone()

    def resolve_posture(self, domain: str, fallback_posture: str = DEFAULT_DOMAIN_POSTURE) -> str:
        _validate_domain(domain)
        self._validate_posture(fallback_posture)
        self.ensure_domain(domain, posture=fallback_posture)
        posture = self.domains[domain].posture
        self._validate_posture(posture)
        return posture

    def set_posture(self, domain: str, posture: str) -> DomainTrustState:
        _validate_domain(domain)
        self._validate_posture(posture)
        self.ensure_domain(domain)
        state = self.domains[domain]
        state.posture = posture
        return state.clone()

    def record_accepted_suggestion(self, domain: str) -> DomainTrustState:
        _validate_domain(domain)
        self.ensure_domain(domain)
        state = self.domains[domain]
        state.accepted_suggestions += 1
        return state.clone()

    def record_correction(self, domain: str) -> DomainTrustState:
        _validate_domain(domain)
        self.ensure_domain(domain)
        state = self.domains[domain]
        state.corrected_suggestions += 1
        return state.clone()

    def record_reversal(self, domain: str) -> DomainTrustState:
        _validate_domain(domain)
        self.ensure_domain(domain)
        state = self.domains[domain]
        state.reversed_actions += 1
        return state.clone()

    def record_shadow_success(self, domain: str) -> DomainTrustState:
        _validate_domain(domain)
        self.ensure_domain(domain)
        state = self.domains[domain]
        state.shadow_successes += 1
        return state.clone()

    def get_domain(self, domain: str) -> DomainTrustState | None:
        _validate_domain(domain)
        self.list_domains()
        state = self.domains.get(domain)
        if state is None:
            return None
        return state.clone()

    def list_domains(self) -> list[DomainTrustState]:
        for domain, state in self.domains.items():
            _validate_domain(domain)
            if not isinstance(state, DomainTrustState):
                raise ValueError("domains must contain DomainTrustState instances")
            if state.domain != domain:
                raise ValueError("domain key must match DomainTrustState.domain")
        return [self.domains[domain].clone() for domain in sorted(self.domains)]

    def _validate_posture(self, posture: str) -> None:
        if posture not in VALID_POSTURES:
            joined = ", ".join(sorted(VALID_POSTURES))
            raise ValueError(f"unknown trust posture {posture!r}; expected one of: {joined}")
