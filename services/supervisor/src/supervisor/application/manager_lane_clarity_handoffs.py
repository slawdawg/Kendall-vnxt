"""Supervisor-owned idempotent receipt store for manager Lane Clarity handoffs."""

from datetime import UTC

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import (
    ManagerLaneClarityHandoffRequest,
    ManagerLaneClarityHandoffView,
)
from supervisor.infrastructure.db.models import ManagerLaneClarityHandoff


def _payload(record: ManagerLaneClarityHandoff) -> dict[str, object]:
    observed_at = record.observed_at.replace(tzinfo=UTC) if record.observed_at.tzinfo is None else record.observed_at.astimezone(UTC)
    return {
        "schemaVersion": "manager-lane-clarity-handoff/v0",
        "handoffId": record.handoff_id,
        "selectedLaneId": record.selected_lane_id,
        "runId": record.run_id,
        "eventWatermark": record.event_watermark,
        "sourceCursor": record.source_cursor,
        "sourceSequence": record.source_sequence,
        "observedAt": observed_at,
        "laneClarity": record.lane_clarity_json,
        "idempotencyKey": record.idempotency_key,
        "metadataOnly": record.metadata_only,
        "rawPayloadRetained": record.raw_payload_retained,
    }


def _view(record: ManagerLaneClarityHandoff) -> ManagerLaneClarityHandoffView:
    created_at = record.created_at.replace(tzinfo=UTC) if record.created_at.tzinfo is None else record.created_at.astimezone(UTC)
    return ManagerLaneClarityHandoffView.model_validate({**_payload(record), "owner": "supervisor", "createdAt": created_at})


def _same(record: ManagerLaneClarityHandoff, request: ManagerLaneClarityHandoffRequest) -> bool:
    return _payload(record) == request.model_dump()


async def _existing(session: AsyncSession, request: ManagerLaneClarityHandoffRequest) -> ManagerLaneClarityHandoff | None:
    by_key = await session.scalar(select(ManagerLaneClarityHandoff).where(ManagerLaneClarityHandoff.idempotency_key == request.idempotencyKey))
    if by_key is not None:
        if not _same(by_key, request):
            raise ValueError("Lane clarity handoff idempotency key already belongs to conflicting metadata.")
        return by_key
    by_id = await session.get(ManagerLaneClarityHandoff, request.handoffId)
    if by_id is not None:
        if not _same(by_id, request):
            raise ValueError("Lane clarity handoff ID already belongs to conflicting metadata.")
        return by_id
    return None


async def persist_manager_lane_clarity_handoff(
    session: AsyncSession, request: ManagerLaneClarityHandoffRequest
) -> ManagerLaneClarityHandoffView:
    validated = ManagerLaneClarityHandoffRequest.model_validate(request.model_dump())
    existing = await _existing(session, validated)
    if existing is not None:
        return _view(existing)
    current = await session.scalar(
        select(ManagerLaneClarityHandoff)
        .where(ManagerLaneClarityHandoff.selected_lane_id == validated.selectedLaneId)
        .order_by(ManagerLaneClarityHandoff.source_sequence.desc(), ManagerLaneClarityHandoff.created_at.desc())
        .limit(1)
    )
    if current is not None and validated.sourceSequence <= current.source_sequence:
        raise ValueError("Lane clarity handoff source sequence must advance for the selected lane.")
    record = ManagerLaneClarityHandoff(
        handoff_id=validated.handoffId,
        selected_lane_id=validated.selectedLaneId,
        run_id=validated.runId,
        event_watermark=validated.eventWatermark,
        source_cursor=validated.sourceCursor,
        source_sequence=validated.sourceSequence,
        observed_at=validated.observedAt,
        lane_clarity_json=validated.laneClarity.model_dump(mode="json"),
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
        raise ValueError("Lane clarity handoff conflicts with persisted metadata.") from exc
    await session.refresh(record)
    return _view(record)


async def get_current_manager_lane_clarity_handoff(session: AsyncSession) -> ManagerLaneClarityHandoffView | None:
    record = await session.scalar(
        select(ManagerLaneClarityHandoff)
        .order_by(ManagerLaneClarityHandoff.created_at.desc(), ManagerLaneClarityHandoff.handoff_id.desc())
        .limit(1)
    )
    return _view(record) if record is not None else None


async def get_manager_lane_clarity_handoff(
    session: AsyncSession, handoff_id: str
) -> ManagerLaneClarityHandoffView | None:
    record = await session.get(ManagerLaneClarityHandoff, handoff_id)
    return _view(record) if record is not None else None
