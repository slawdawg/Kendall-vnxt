"""Fake-only Memory Inbox adapter contract; it has no credential or network port."""

from dataclasses import dataclass
from typing import Literal


LocalAdapterOutcome = Literal["local_success", "unavailable", "capacity_timeout", "unsupported_capability", "blocked"]
FakeAdapterRoute = Literal["materialize_local", "consider_openai", "consider_anthropic", "blocked"]
FakeAdapterProvider = Literal["local", "openai", "anthropic"]

_FALLBACKABLE = {"unavailable", "capacity_timeout", "unsupported_capability"}


@dataclass(frozen=True)
class FakeAdapterDecision:
    route: FakeAdapterRoute
    provider: Literal["local", "openai", "anthropic", "none"]
    execution_enabled: Literal[False] = False


def decide_fake_local_adapter(
    *, provider: FakeAdapterProvider = "local", outcome: LocalAdapterOutcome,
    fresh_authorization_and_cost: bool,
) -> FakeAdapterDecision:
    """Model the disclosed order without enabling any real adapter execution."""
    if provider == "local" and outcome == "local_success":
        return FakeAdapterDecision("materialize_local", "local")
    if outcome in _FALLBACKABLE and fresh_authorization_and_cost:
        if provider == "local":
            return FakeAdapterDecision("consider_openai", "openai")
        if provider == "openai":
            return FakeAdapterDecision("consider_anthropic", "anthropic")
    return FakeAdapterDecision("blocked", "none")
