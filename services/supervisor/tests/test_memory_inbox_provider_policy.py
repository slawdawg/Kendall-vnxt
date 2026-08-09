from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_provider_policy import InboxCostPolicy, disabled_provider_projection, read_inbox_cost_policy, set_inbox_cost_policy, validate_policy_change
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import MemoryInboxCostPolicyReceipt


def test_inbox_provider_policy_remains_disabled_without_reading_legacy_provider_configuration() -> None:
    projection = disabled_provider_projection(InboxCostPolicy(1, "USD", Decimal("25"), Decimal("3"), Decimal("4"), "UTC"))
    assert projection["remaining"] == "18"
    assert [entry["availability"] for entry in projection["providerOrder"]] == ["disabled", "disabled", "disabled"]


def test_unlimited_cost_policy_requires_its_separate_acknowledgement() -> None:
    with pytest.raises(ValueError, match="unlimited_acknowledgement_required"):
        validate_policy_change(finite_limit=None, unlimited_acknowledged=False)
    validate_policy_change(finite_limit=None, unlimited_acknowledged=True)


@pytest.mark.asyncio
async def test_inbox_cost_policy_is_durable_versioned_and_keeps_adapters_disabled(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'policy.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        initial = await read_inbox_cost_policy(session)
        finite = await set_inbox_cost_policy(
            session, finite_limit=Decimal("25.00"), unlimited_acknowledged=False,
            actor_ref="operator:verified", idempotency_key="policy-finite-key",
        )
        replay = await set_inbox_cost_policy(
            session, finite_limit=Decimal("25.00"), unlimited_acknowledged=False,
            actor_ref="operator:verified", idempotency_key="policy-finite-key",
        )
        unlimited = await set_inbox_cost_policy(
            session, finite_limit=None, unlimited_acknowledged=True,
            actor_ref="operator:verified", idempotency_key="policy-unlimited-key",
        )
        receipts = list((await session.scalars(select(MemoryInboxCostPolicyReceipt).order_by(MemoryInboxCostPolicyReceipt.revision))).all())
        assert initial["finiteLimit"] == "0"
        assert (finite["policyRevision"], finite["remaining"], finite["mode"]) == (2, "25.00", "finite")
        assert replay["policyRevision"] == 2
        assert (unlimited["policyRevision"], unlimited["finiteLimit"], unlimited["mode"]) == (3, None, "unlimited")
        assert unlimited["providerActivation"] == "disabled_by_default"
        assert [receipt.mode for receipt in receipts] == ["finite", "finite", "unlimited"]
    await engine.dispose()
