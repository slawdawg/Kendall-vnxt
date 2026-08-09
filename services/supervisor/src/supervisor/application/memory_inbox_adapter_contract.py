"""Fake-only provider ordering contract; no adapter activation or egress."""

from dataclasses import dataclass
from enum import StrEnum


class LocalAdapterOutcome(StrEnum):
    SUCCESS = "success"
    UNAVAILABLE = "unavailable"
    CAPACITY_TIMEOUT = "capacity_timeout"
    UNSUPPORTED_CAPABILITY = "unsupported_capability"
    FAILURE = "failure"


@dataclass(frozen=True)
class AdapterSelection:
    provider_order: tuple[str, ...]
    reason_code: str


def select_disclosed_fallback(*, local_outcome: LocalAdapterOutcome, activation_approved: bool) -> AdapterSelection:
    """Return only the disclosed fallback contract; callers still cannot invoke it."""
    if not activation_approved:
        return AdapterSelection((), "inbox_adapters_disabled")
    if local_outcome is LocalAdapterOutcome.SUCCESS:
        return AdapterSelection(("local",), "local_succeeded")
    if local_outcome in {
        LocalAdapterOutcome.UNAVAILABLE,
        LocalAdapterOutcome.CAPACITY_TIMEOUT,
        LocalAdapterOutcome.UNSUPPORTED_CAPABILITY,
    }:
        return AdapterSelection(("openai", "anthropic"), "allowlisted_local_fallback")
    return AdapterSelection((), "local_failure_blocks_fallback")
