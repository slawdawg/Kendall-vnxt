from decimal import Decimal

import pytest

from supervisor.application.memory_inbox_provider_policy import InboxCostPolicy, disabled_provider_projection, validate_policy_change


def test_inbox_provider_policy_remains_disabled_without_reading_legacy_provider_configuration() -> None:
    projection = disabled_provider_projection(InboxCostPolicy(1, "USD", Decimal("25"), Decimal("3"), Decimal("4"), "UTC"))
    assert projection["remaining"] == "18"
    assert [entry["availability"] for entry in projection["providerOrder"]] == ["disabled", "disabled", "disabled"]


def test_unlimited_cost_policy_requires_its_separate_acknowledgement() -> None:
    with pytest.raises(ValueError, match="unlimited_acknowledgement_required"):
        validate_policy_change(finite_limit=None, unlimited_acknowledged=False)
    validate_policy_change(finite_limit=None, unlimited_acknowledged=True)
