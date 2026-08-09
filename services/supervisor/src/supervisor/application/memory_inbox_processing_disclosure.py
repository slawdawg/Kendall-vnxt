"""Immutable, content-safe Processing Disclosure receipts for Memory Inbox."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.memory_inbox_provider_policy import read_inbox_cost_policy
from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.models import (
    MemoryInboxCostPolicy,
    MemoryInboxProcessingDisclosure,
    MemoryInboxSource,
    MemoryInboxSourceRevision,
)


async def present_processing_disclosure(
    session: AsyncSession, *, source_id: str, expected_revision: int, idempotency_key: str, actor_ref: str,
) -> dict:
    """Record one exact policy/source disclosure; this function cannot dispatch."""
    source = (await session.execute(
        select(MemoryInboxSource).where(MemoryInboxSource.id == source_id).with_for_update()
    )).scalar_one_or_none()
    if source is None or source.current_revision != expected_revision:
        raise ValueError("disclosure_source_revision_mismatch")
    if source.lifecycle_state not in {MemoryInboxSourceState.UNPROCESSED.value, MemoryInboxSourceState.DRAFT.value}:
        raise ValueError("disclosure_source_not_safe")
    if source.retention_deadline_at <= datetime.now(timezone.utc):
        raise ValueError("disclosure_source_expired")
    source_revision = (await session.execute(select(MemoryInboxSourceRevision).where(
        MemoryInboxSourceRevision.source_id == source.id,
        MemoryInboxSourceRevision.revision == source.current_revision,
    ))).scalar_one_or_none()
    if source_revision is None:
        raise ValueError("disclosure_source_revision_missing")
    existing = (await session.execute(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.source_revision_id == source_revision.id,
        MemoryInboxProcessingDisclosure.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if existing is not None:
        return _view(existing, replayed=True)
    await read_inbox_cost_policy(session)
    policy = await session.get(MemoryInboxCostPolicy, "inbox-cost-policy:current")
    if policy is None:
        raise ValueError("disclosure_policy_unavailable")
    disclosure = MemoryInboxProcessingDisclosure(
        id=f"inbox-disclosure:{uuid.uuid4().hex}", source_revision_id=source_revision.id,
        source_revision=source_revision.revision, policy_id=policy.id, policy_revision=policy.revision,
        retention_deadline_at=source.retention_deadline_at, idempotency_key=idempotency_key,
        actor_ref=actor_ref, receipt_ref=f"receipt:inbox-disclosure:{uuid.uuid4().hex}",
    )
    session.add(disclosure)
    await session.commit()
    return _view(disclosure, replayed=False)


async def accept_processing_disclosure(session: AsyncSession, *, disclosure_id: str, actor_ref: str) -> dict:
    """Record consent only; dispatch stays unavailable until later atomic stories."""
    disclosure = (await session.execute(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.id == disclosure_id
    ).with_for_update())).scalar_one_or_none()
    if disclosure is None or disclosure.lifecycle_state != "Presented":
        raise ValueError("disclosure_unavailable")
    disclosure.lifecycle_state = "Accepted"
    disclosure.accepted_at = datetime.now(timezone.utc)
    disclosure.actor_ref = actor_ref
    await session.commit()
    return _view(disclosure, replayed=False)


def _view(disclosure: MemoryInboxProcessingDisclosure, *, replayed: bool) -> dict:
    return {
        "schemaVersion": "kendall-memory-inbox-disclosure/v1",
        "disclosureId": disclosure.id,
        "receiptRef": disclosure.receipt_ref,
        "sourceRevision": disclosure.source_revision,
        "policyRevision": disclosure.policy_revision,
        "providerOrder": ["local", "openai", "anthropic"],
        "retentionDeadlineAt": disclosure.retention_deadline_at.isoformat(),
        "noWriteGuarantee": True,
        "providerActivation": "disabled_by_default",
        "lifecycleState": disclosure.lifecycle_state,
        "replayed": replayed,
        "nextSafeAction": "dispatch_unavailable",
    }
