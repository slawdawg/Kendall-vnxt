from supervisor.application.memory_inbox_adapter_contract import LocalAdapterOutcome, select_disclosed_fallback


def test_inbox_adapters_are_disabled_without_their_own_activation_gate() -> None:
    assert select_disclosed_fallback(local_outcome=LocalAdapterOutcome.UNAVAILABLE, activation_approved=False).reason_code == "inbox_adapters_disabled"


def test_only_allowlisted_local_failures_may_select_the_disclosed_cloud_order() -> None:
    assert select_disclosed_fallback(local_outcome=LocalAdapterOutcome.UNAVAILABLE, activation_approved=True).provider_order == ("openai", "anthropic")
    assert select_disclosed_fallback(local_outcome=LocalAdapterOutcome.CAPACITY_TIMEOUT, activation_approved=True).provider_order == ("openai", "anthropic")
    assert select_disclosed_fallback(local_outcome=LocalAdapterOutcome.UNSUPPORTED_CAPABILITY, activation_approved=True).provider_order == ("openai", "anthropic")
    assert select_disclosed_fallback(local_outcome=LocalAdapterOutcome.FAILURE, activation_approved=True).provider_order == ()
