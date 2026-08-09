"""Fake-only Memory Inbox adapter contract; it has no credential or network port."""

from dataclasses import dataclass
from typing import Literal


LocalAdapterOutcome = Literal["local_success", "unavailable", "capacity_timeout", "unsupported_capability", "blocked"]
FakeAdapterRoute = Literal["materialize_local", "consider_openai", "blocked"]

_FALLBACKABLE = {"unavailable", "capacity_timeout", "unsupported_capability"}


@dataclass(frozen=True)
class FakeAdapterDecision:
    route: FakeAdapterRoute
    provider: Literal["local", "openai", "none"]
    execution_enabled: Literal[False] = False


def decide_fake_local_adapter(*, outcome: LocalAdapterOutcome, fresh_authorization_and_cost: bool) -> FakeAdapterDecision:
    """Model the disclosed order without enabling any real adapter execution."""
    if outcome == "local_success":
        return FakeAdapterDecision("materialize_local", "local")
    if outcome in _FALLBACKABLE and fresh_authorization_and_cost:
        return FakeAdapterDecision("consider_openai", "openai")
    return FakeAdapterDecision("blocked", "none")
