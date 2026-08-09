"""Atomic, no-egress ProcessingAttempt claim for one accepted disclosure."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.domain.memory_inbox import MemoryInboxSourceState
from supervisor.infrastructure.db.models import (
    MemoryInboxCostPolicy,
    MemoryInboxProcessingAttempt,
    MemoryInboxProcessingDisclosure,
    MemoryInboxProposalAggregate,
    MemoryInboxProposalRevision,
    MemoryInboxManifest,
    MemoryInboxSource,
    MemoryInboxSourceRevision,
)


async def claim_processing_dispatch(
    session: AsyncSession, *, disclosure_id: str, actor_ref: str,
) -> dict:
    """Claim exactly one attempt only if every disclosure fence is still current.

    This boundary intentionally does not invoke a provider or read credentials.
    Provider dispatch and cost reservation remain separately gated future work.
    """
    disclosure = (await session.execute(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.id == disclosure_id
    ).with_for_update())).scalar_one_or_none()
    if disclosure is None or disclosure.lifecycle_state != "Accepted":
        raise ValueError("dispatch_disclosure_not_accepted")
    existing = (await session.execute(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.consent_ref == disclosure.receipt_ref
    ).with_for_update())).scalar_one_or_none()
    if existing is not None:
        return {"attemptId": existing.id, "lifecycleState": existing.lifecycle_state, "replayed": True}
    source_revision = await session.get(MemoryInboxSourceRevision, disclosure.source_revision_id)
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == source_revision.source_id if source_revision else False
    ).with_for_update())).scalar_one_or_none()
    policy = await session.get(MemoryInboxCostPolicy, disclosure.policy_id)
    if (
        source_revision is None or source is None
        or source.current_revision != disclosure.source_revision
        or source.lifecycle_state not in {MemoryInboxSourceState.UNPROCESSED.value, MemoryInboxSourceState.DRAFT.value}
        or policy is None or policy.revision != disclosure.policy_revision
    ):
        raise ValueError("dispatch_disclosure_stale")
    proposal_id = f"inbox-proposal:{uuid.uuid4().hex}"
    proposal_revision_id = f"inbox-proposal-revision:{uuid.uuid4().hex}"
    proposal = MemoryInboxProposalAggregate(
        id=proposal_id, source_id=source.id, current_revision=1, lifecycle_state="Draft",
    )
    proposal_revision = MemoryInboxProposalRevision(
        id=proposal_revision_id, proposal_id=proposal_id, revision=1, lifecycle_state="Draft",
        actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}",
    )
    attempt = MemoryInboxProcessingAttempt(
        id=f"inbox-attempt:{uuid.uuid4().hex}", source_revision_id=source_revision.id,
        proposal_revision_id=proposal_revision_id, consent_ref=disclosure.receipt_ref,
        provider_code="unselected", attempt_sequence=1, lifecycle_state="Claimed",
    )
    proposal_manifest = MemoryInboxManifest(
        id=f"inbox-manifest:{uuid.uuid4().hex}", owner_revision_id=proposal_revision_id,
        copy_class="proposal_body", store_ref=f"inbox-store:{uuid.uuid4().hex}",
        creation_state="Planned", retention_class="proposal_retention", deletion_state="None",
    )
    session.add_all((proposal, proposal_revision, attempt, proposal_manifest))
    source.current_revision += 1
    source.lifecycle_state = MemoryInboxSourceState.PROCESSING.value
    session.add(MemoryInboxSourceRevision(
        id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id,
        revision=source.current_revision, lifecycle_state=source.lifecycle_state,
        actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref,
    ))
    await session.commit()
    return {"attemptId": attempt.id, "lifecycleState": attempt.lifecycle_state, "replayed": False}
