"""Content-free Inbox provider and cost-policy vocabulary; adapters start disabled."""

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class InboxCostPolicy:
    revision: int
    currency: str
    finite_limit: Decimal | None
    measured_spend: Decimal
    reserved_spend: Decimal
    reset_timezone: str
    high_cost_acknowledged: bool = False

    @property
    def remaining(self) -> Decimal | None:
        return None if self.finite_limit is None else max(Decimal("0"), self.finite_limit - self.measured_spend - self.reserved_spend)


def disabled_provider_projection(policy: InboxCostPolicy) -> dict:
    """Never consult generic provider configuration, credentials, or egress state."""
    return {
        "schemaVersion": "kendall-memory-inbox-provider-policy/v1",
        "policyRevision": policy.revision,
        "currency": policy.currency,
        "measuredSpend": str(policy.measured_spend),
        "reservedSpend": str(policy.reserved_spend),
        "finiteLimit": str(policy.finite_limit) if policy.finite_limit is not None else None,
        "remaining": str(policy.remaining) if policy.remaining is not None else None,
        "resetTimezone": policy.reset_timezone,
        "providerOrder": [
            {"provider": "local", "availability": "disabled"},
            {"provider": "openai", "availability": "disabled"},
            {"provider": "anthropic", "availability": "disabled"},
        ],
    }


def validate_policy_change(*, finite_limit: Decimal | None, unlimited_acknowledged: bool) -> None:
    if finite_limit is not None and finite_limit < Decimal("0"):
        raise ValueError("finite_limit_invalid")
    if finite_limit is None and not unlimited_acknowledged:
        raise ValueError("unlimited_acknowledgement_required")
