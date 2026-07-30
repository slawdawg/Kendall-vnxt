"""Supervisor-owned receipt store for manager coordination-health snapshots."""

from datetime import UTC

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import ManagerCoordinationHealthHandoffRequest, ManagerCoordinationHealthHandoffView
from supervisor.infrastructure.db.models import ManagerCoordinationHealthHandoff


def _payload(record: ManagerCoordinationHealthHandoff) -> dict[str, object]:
    return {
        "schemaVersion": "manager-coordination-health-handoff/v0",
        "handoffId": record.handoff_id,
        "sourceSequence": record.source_sequence,
        "coordinationHealth": record.coordination_health_json,
        "idempotencyKey": record.idempotency_key,
        "metadataOnly": record.metadata_only,
        "rawPayloadRetained": record.raw_payload_retained,
    }


def _view(record: ManagerCoordinationHealthHandoff) -> ManagerCoordinationHealthHandoffView:
    created_at = record.created_at.replace(tzinfo=UTC) if record.created_at.tzinfo is None else record.created_at.astimezone(UTC)
    return ManagerCoordinationHealthHandoffView.model_validate({**_payload(record), "owner": "supervisor", "createdAt": created_at})


async def persist_manager_coordination_health_handoff(session: AsyncSession, request: ManagerCoordinationHealthHandoffRequest) -> ManagerCoordinationHealthHandoffView:
    validated = ManagerCoordinationHealthHandoffRequest.model_validate(request.model_dump())
    existing = await _existing(session, validated)
    if existing is not None:
        return _view(existing)
    latest = await session.scalar(select(ManagerCoordinationHealthHandoff).order_by(ManagerCoordinationHealthHandoff.source_sequence.desc()).limit(1))
    if latest is not None and validated.sourceSequence <= latest.source_sequence:
        raise ValueError("Coordination-health handoff source sequence must advance.")
    record = ManagerCoordinationHealthHandoff(
        handoff_id=validated.handoffId,
        source_sequence=validated.sourceSequence,
        coordination_health_json=validated.coordinationHealth.model_dump(mode="json"),
        idempotency_key=validated.idempotencyKey,
        metadata_only=validated.metadataOnly,
        raw_payload_retained=validated.rawPayloadRetained,
    )
    session.add(record)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        replay = await _existing(session, validated)
        if replay is not None:
            return _view(replay)
        raise ValueError("Coordination-health handoff conflicts with persisted metadata.") from exc
    await session.refresh(record)
    return _view(record)


async def get_current_manager_coordination_health_handoff(session: AsyncSession) -> ManagerCoordinationHealthHandoffView | None:
    record = await session.scalar(select(ManagerCoordinationHealthHandoff).order_by(ManagerCoordinationHealthHandoff.source_sequence.desc()).limit(1))
    return _view(record) if record is not None else None


async def get_manager_coordination_health_handoff(session: AsyncSession, handoff_id: str) -> ManagerCoordinationHealthHandoffView | None:
    record = await session.get(ManagerCoordinationHealthHandoff, handoff_id)
    return _view(record) if record is not None else None


async def _existing(session: AsyncSession, request: ManagerCoordinationHealthHandoffRequest) -> ManagerCoordinationHealthHandoff | None:
    by_key = await session.scalar(select(ManagerCoordinationHealthHandoff).where(ManagerCoordinationHealthHandoff.idempotency_key == request.idempotencyKey))
    if by_key is not None:
        if _payload(by_key) != request.model_dump():
            raise ValueError("Coordination-health handoff idempotency key already belongs to conflicting metadata.")
        return by_key
    by_id = await session.get(ManagerCoordinationHealthHandoff, request.handoffId)
    if by_id is not None:
        if _payload(by_id) != request.model_dump():
            raise ValueError("Coordination-health handoff ID already belongs to conflicting metadata.")
        return by_id
    return None
