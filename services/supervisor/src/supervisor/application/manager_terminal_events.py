from datetime import UTC

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import ManagerTerminalEventRequest, ManagerTerminalEventView
from supervisor.infrastructure.db.models import ManagerTerminalEvent


def _validated_payload(payload: ManagerTerminalEventRequest) -> ManagerTerminalEventRequest:
    """Revalidate the metadata-only boundary before any persistence occurs."""
    return ManagerTerminalEventRequest.model_validate(payload.model_dump())


def _record_payload(record: ManagerTerminalEvent) -> dict[str, object]:
    return {
        "eventId": record.event_id,
        "eventType": record.event_type,
        "runId": record.run_id,
        "sourceIdentity": record.source_identity,
        "sourceRevision": record.source_revision,
        "reconciliationCounts": record.reconciliation_counts_json,
        "unresolvedApprovalGatedWork": record.unresolved_approval_gated_work_json,
        "evidenceRefs": record.evidence_refs_json,
        "resumeRequirement": record.resume_requirement,
        "nextManagerAction": record.next_manager_action,
        "idempotencyKey": record.idempotency_key,
        "metadataOnly": record.metadata_only,
        "rawPayloadRetained": record.raw_payload_retained,
    }


def _to_view(record: ManagerTerminalEvent) -> ManagerTerminalEventView:
    created_at = record.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    else:
        created_at = created_at.astimezone(UTC)
    return ManagerTerminalEventView.model_validate(
        {
            **_record_payload(record),
            "createdAt": created_at.isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            ),
        }
    )


def _same_event(record: ManagerTerminalEvent, payload: ManagerTerminalEventRequest) -> bool:
    return _record_payload(record) == payload.model_dump()


async def _find_existing(
    session: AsyncSession,
    payload: ManagerTerminalEventRequest,
) -> ManagerTerminalEvent | None:
    by_idempotency = await session.scalar(
        select(ManagerTerminalEvent).where(
            ManagerTerminalEvent.idempotency_key == payload.idempotencyKey
        )
    )
    if by_idempotency is not None:
        if not _same_event(by_idempotency, payload):
            raise ValueError(
                "Manager terminal-event idempotency key already belongs to conflicting metadata."
            )
        return by_idempotency

    by_event_id = await session.get(ManagerTerminalEvent, payload.eventId)
    if by_event_id is not None:
        if not _same_event(by_event_id, payload):
            raise ValueError("Manager terminal eventId already belongs to conflicting metadata.")
        return by_event_id
    return None


async def persist_manager_terminal_event(
    session: AsyncSession,
    payload: ManagerTerminalEventRequest,
) -> ManagerTerminalEventView:
    validated = _validated_payload(payload)
    existing = await _find_existing(session, validated)
    if existing is not None:
        return _to_view(existing)

    record = ManagerTerminalEvent(
        event_id=validated.eventId,
        event_type=validated.eventType,
        run_id=validated.runId,
        source_identity=validated.sourceIdentity,
        source_revision=validated.sourceRevision,
        reconciliation_counts_json=validated.reconciliationCounts.model_dump(),
        unresolved_approval_gated_work_json=[
            item.model_dump() for item in validated.unresolvedApprovalGatedWork
        ],
        evidence_refs_json=validated.evidenceRefs,
        resume_requirement=validated.resumeRequirement,
        next_manager_action=validated.nextManagerAction,
        idempotency_key=validated.idempotencyKey,
        metadata_only=validated.metadataOnly,
        raw_payload_retained=validated.rawPayloadRetained,
    )
    session.add(record)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        replay = await _find_existing(session, validated)
        if replay is not None:
            return _to_view(replay)
        raise ValueError("Manager terminal event conflicts with persisted metadata.") from exc
    await session.refresh(record)
    return _to_view(record)


async def get_manager_terminal_event(
    session: AsyncSession,
    event_id: str,
) -> ManagerTerminalEventView | None:
    record = await session.get(ManagerTerminalEvent, event_id)
    return _to_view(record) if record is not None else None
