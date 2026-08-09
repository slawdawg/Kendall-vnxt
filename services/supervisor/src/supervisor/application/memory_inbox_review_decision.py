"""Content-safe, exact-revision return and deny decisions for Memory Inbox."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import (
    MemoryInboxCommandResult,
    MemoryInboxProcessingAttempt,
    MemoryInboxProcessingDisclosure,
    MemoryInboxProposalAggregate,
    MemoryInboxProposalRevision,
    MemoryInboxSource,
    MemoryInboxSourceRevision,
)

DecisionKind = Literal["return", "deny"]


@dataclass(frozen=True)
class ReviewDecision:
    proposal_id: str
    proposal_revision: int
    source_id: str
    source_revision: int
    lifecycle_state: str
    replayed: bool
    next_safe_action: str


def _digest(*, proposal_id: str, expected_revision: int, decision: DecisionKind) -> str:
    return hashlib.sha256(f"{proposal_id}\x1f{expected_revision}\x1f{decision}".encode("utf-8")).hexdigest()


async def return_proposal_for_revision(
    session: AsyncSession, *, proposal_id: str, expected_revision: int, idempotency_key: str, actor_ref: str,
) -> ReviewDecision:
    return await _apply_decision(session, proposal_id=proposal_id, expected_revision=expected_revision, idempotency_key=idempotency_key, actor_ref=actor_ref, decision="return")


async def deny_proposal_retaining_source(
    session: AsyncSession, *, proposal_id: str, expected_revision: int, idempotency_key: str, actor_ref: str,
) -> ReviewDecision:
    return await _apply_decision(session, proposal_id=proposal_id, expected_revision=expected_revision, idempotency_key=idempotency_key, actor_ref=actor_ref, decision="deny")


async def _apply_decision(
    session: AsyncSession, *, proposal_id: str, expected_revision: int, idempotency_key: str, actor_ref: str, decision: DecisionKind,
) -> ReviewDecision:
    if expected_revision < 1 or not idempotency_key:
        raise ValueError("review_decision_invalid")
    digest = _digest(proposal_id=proposal_id, expected_revision=expected_revision, decision=decision)
    recorded = (await session.execute(select(MemoryInboxCommandResult).where(
        MemoryInboxCommandResult.aggregate_id == proposal_id,
        MemoryInboxCommandResult.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if recorded is not None:
        if recorded.command_kind != f"review_{decision}" or recorded.request_digest != digest:
            raise ValueError("review_decision_idempotency_conflict")
        proposal = await session.get(MemoryInboxProposalAggregate, proposal_id)
        source = await session.get(MemoryInboxSource, proposal.source_id) if proposal else None
        if proposal is None or source is None:
            raise ValueError("review_decision_unavailable")
        return _view(proposal, source, replayed=True)

    proposal = (await session.execute(select(MemoryInboxProposalAggregate).where(
        MemoryInboxProposalAggregate.id == proposal_id
    ).with_for_update())).scalar_one_or_none()
    if proposal is None or proposal.lifecycle_state != "Ready" or proposal.current_revision != expected_revision:
        raise ValueError("review_decision_revision_unavailable")
    proposal_revision = (await session.execute(select(MemoryInboxProposalRevision).where(
        MemoryInboxProposalRevision.proposal_id == proposal.id,
        MemoryInboxProposalRevision.revision == expected_revision,
        MemoryInboxProposalRevision.lifecycle_state == "Ready",
    ).with_for_update())).scalar_one_or_none()
    source = (await session.execute(select(MemoryInboxSource).where(
        MemoryInboxSource.id == proposal.source_id
    ).with_for_update())).scalar_one_or_none()
    if proposal_revision is None or source is None or source.lifecycle_state != "Review" or source.deletion_state != "None" or source.retention_deadline_at <= datetime.now(timezone.utc):
        raise ValueError("review_decision_revision_unavailable")
    attempts = (await session.execute(select(MemoryInboxProcessingAttempt).where(
        MemoryInboxProcessingAttempt.proposal_revision_id == proposal_revision.id
    ).with_for_update())).scalars().all()
    if any(attempt.lifecycle_state in {"Dispatched", "CompletionUnknown"} for attempt in attempts):
        raise ValueError("review_decision_attempt_unresolved")
    for attempt in attempts:
        if attempt.lifecycle_state in {"Planned", "Claimed"}:
            attempt.lifecycle_state = "Cancelled"
    disclosures = (await session.execute(select(MemoryInboxProcessingDisclosure).where(
        MemoryInboxProcessingDisclosure.source_revision_id.in_(
            select(MemoryInboxSourceRevision.id).where(MemoryInboxSourceRevision.source_id == source.id)
        ),
        MemoryInboxProcessingDisclosure.lifecycle_state == "Accepted",
    ).with_for_update())).scalars().all()
    for disclosure in disclosures:
        disclosure.lifecycle_state = "Invalidated"
    next_proposal_revision = proposal.current_revision + 1
    next_source_revision = source.current_revision + 1
    proposal_state = "Returned" if decision == "return" else "Denied"
    source_state = "Returned" if decision == "return" else "DeniedRetained"
    proposal.current_revision = next_proposal_revision
    proposal.lifecycle_state = proposal_state
    source.current_revision = next_source_revision
    source.lifecycle_state = source_state
    session.add_all((
        MemoryInboxProposalRevision(
            id=f"inbox-proposal-revision:{uuid.uuid4().hex}", proposal_id=proposal.id,
            revision=next_proposal_revision, lifecycle_state=proposal_state,
            actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}",
        ),
        MemoryInboxSourceRevision(
            id=f"inbox-source-revision:{uuid.uuid4().hex}", source_id=source.id,
            revision=next_source_revision, lifecycle_state=source_state,
            actor_ref=actor_ref, audit_ref=f"audit:{uuid.uuid4().hex}", policy_ref=source.policy_ref,
        ),
        MemoryInboxCommandResult(
            id=f"inbox-command:{uuid.uuid4().hex}", aggregate_id=proposal.id,
            expected_revision=expected_revision, idempotency_key=idempotency_key,
            command_kind=f"review_{decision}", request_digest=digest, outcome="accepted",
            reason_code=f"proposal_{proposal_state.lower()}", resulting_revision=next_proposal_revision,
            actor_ref=actor_ref,
        ),
    ))
    await session.commit()
    return _view(proposal, source, replayed=False)


def _view(proposal: MemoryInboxProposalAggregate, source: MemoryInboxSource, *, replayed: bool) -> ReviewDecision:
    return ReviewDecision(
        proposal_id=proposal.id, proposal_revision=proposal.current_revision, source_id=source.id,
        source_revision=source.current_revision, lifecycle_state=proposal.lifecycle_state,
        replayed=replayed, next_safe_action="create_draft" if proposal.lifecycle_state == "Returned" else "review_retention",
    )
