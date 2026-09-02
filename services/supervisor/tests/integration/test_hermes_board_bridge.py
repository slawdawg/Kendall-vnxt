"""Focused adversarial coverage for authenticated Hermes board observations."""
from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.hermes_board_bridge import (
    BoardBridgeRejected,
    _binding_id,
    _derived_id,
    canonical_board_event_bytes,
    ingest_board_lifecycle_event,
    register_board_binding,
)
from supervisor.api.schemas import HermesLedgerIngestRequest
from supervisor.application.hermes_outcomes import ingest_hermes_ledger
from supervisor.infrastructure.db.database import Base

def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _ledger_payload() -> dict[str, object]:
    now = datetime(2026, 9, 2, 12, tzinfo=UTC)
    later = now + timedelta(minutes=1)
    refs = ["evidence:hermes-ledger-1"]
    return {
        "outcome": {"outcomeId": "outcome:1", "schemaVersion": "hermes_outcome.v1", "title": "Persist Hermes outcome", "summary": "Metadata-only ledger proof.", "status": "active", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "observedAt": _iso(later), "idempotencyKey": "outcome:1", "createdAt": _iso(now), "updatedAt": _iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "laneRun": {"laneRunId": "lane:1", "outcomeId": "outcome:1", "schemaVersion": "hermes_lane_run.v1", "laneType": "implementation", "status": "running", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "heartbeatAt": _iso(now), "staleDeadlineAt": _iso(later), "timeoutAt": _iso(later + timedelta(minutes=1)), "retryBudget": 1, "reworkBudget": 1, "evidenceFingerprint": "sha256:ledger-proof", "observedAt": _iso(later), "idempotencyKey": "lane:1", "createdAt": _iso(now), "updatedAt": _iso(later), "metadataOnly": True, "rawPayloadRetained": False},
        "deliveryEvidence": {"deliveryEvidenceId": "evidence:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "delivery_evidence.v1", "evidenceType": "verification", "summary": "Focused check passed.", "sourceRef": "test:hermes-ledger", "observedAt": _iso(later), "evidenceRefs": refs, "idempotencyKey": "evidence:1", "createdAt": _iso(now), "metadataOnly": True, "rawPayloadRetained": False},
        "event": {"eventId": "event:1", "outcomeId": "outcome:1", "laneRunId": "lane:1", "schemaVersion": "hermes_lifecycle_event.v1", "eventName": "hermes.outcome.created", "result": "retryable", "reasonCode": "verification_pending", "evidenceRefs": refs, "nextAction": "Run focused verification.", "correlationId": "correlation:1", "causationId": "causation:1", "observedAt": _iso(later), "idempotencyKey": "event:1", "emittedAt": _iso(later), "metadataOnly": True, "rawPayloadRetained": False, "authoritative": False},
    }


def _registry(private_key: Ed25519PrivateKey) -> str:
    public = private_key.public_key().public_bytes_raw()
    return json.dumps([{
        "issuerId": "issuer:hermes-local",
        "keyId": "key:hermes-local-1",
        "publicKeyB64": base64.b64encode(public).decode("ascii"),
        "active": True,
    }])


def _signed_event(private_key: Ed25519PrivateKey, *, event_id: str = "event:board-1", observed_at: datetime | None = None) -> bytes:
    observed_at = observed_at or datetime(2026, 9, 2, 12, 2, tzinfo=UTC)
    event = {
        "schemaVersion": "hermes_board_lifecycle_event.v1",
        "issuerId": "issuer:hermes-local",
        "keyId": "key:hermes-local-1",
        "eventId": event_id,
        "idempotencyKey": event_id,
        "boardId": "board:local-1",
        "cardId": "card:outcome-1",
        "outcomeId": "outcome:1",
        "laneRunId": "lane:1",
        "eventName": "hermes.lane.recovered",
        "result": "retryable",
        "reasonCode": "board_recovery_observed",
        "evidenceRefs": ["evidence:hermes-ledger-1"],
        "nextAction": "Run focused verification.",
        "correlationId": "correlation:board-1",
        "causationId": "causation:board-1",
        "observedAt": _iso(observed_at),
        "emittedAt": _iso(observed_at + timedelta(seconds=1)),
        "expiresAt": _iso(observed_at + timedelta(minutes=5)),
        "metadataOnly": True,
        "rawPayloadRetained": False,
        "authoritative": False,
    }
    event["signatureB64"] = base64.b64encode(private_key.sign(canonical_board_event_bytes({**event, "signatureB64": "AA=="}))).decode("ascii")
    return json.dumps(event).encode("utf-8")


@pytest.mark.asyncio
async def test_signed_bound_event_is_replay_safe_and_updates_projection_atomically(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bridge.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    private_key = Ed25519PrivateKey.generate()
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(_ledger_payload()))
        await register_board_binding(
            session,
            issuer_id="issuer:hermes-local",
            board_id="board:local-1",
            card_id="card:outcome-1",
            outcome_id="outcome:1",
            lane_run_id="lane:1",
        )
        assert len(_binding_id("issuer:" + "a" * 110, "board:" + "b" * 110, "card:" + "c" * 110)) <= 120
        assert len(_derived_id("evidence:board", "event:" + "x" * 110)) <= 120
        assert len(_derived_id("hermes-board", "issuer:" + "a" * 110, "board:" + "b" * 110, "card:" + "c" * 110)) <= 255
        now = datetime(2026, 9, 2, 12, 3, tzinfo=UTC)
        accepted = await ingest_board_lifecycle_event(session, _signed_event(private_key), _registry(private_key), now=now)
        replay = await ingest_board_lifecycle_event(session, _signed_event(private_key), _registry(private_key), now=now)
        assert accepted == replay
        assert accepted.currentLaneRunId == "lane:1"
    async with engine.begin() as connection:
        assert await connection.scalar(text("SELECT COUNT(*) FROM hermes_board_event_receipts")) == 1
        assert await connection.scalar(text("SELECT COUNT(*) FROM hermes_ledger_events")) == 2
    await engine.dispose()


@pytest.mark.asyncio
async def test_bad_signature_binding_replay_and_late_events_fail_without_partial_write(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bridge-failures.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    private_key = Ed25519PrivateKey.generate()
    async with sessions() as session:
        await ingest_hermes_ledger(session, HermesLedgerIngestRequest.model_validate(_ledger_payload()))
        event = json.loads(_signed_event(private_key))
        with pytest.raises(BoardBridgeRejected, match="binding"):
            await ingest_board_lifecycle_event(session, json.dumps(event).encode("utf-8"), _registry(private_key), now=datetime(2026, 9, 2, 12, 3, tzinfo=UTC))
        await register_board_binding(session, issuer_id="issuer:hermes-local", board_id="board:local-1", card_id="card:outcome-1", outcome_id="outcome:1", lane_run_id="lane:1")
        event["signatureB64"] = base64.b64encode(b"not-a-valid-ed25519-signature").decode("ascii")
        with pytest.raises(BoardBridgeRejected, match="signature"):
            await ingest_board_lifecycle_event(session, json.dumps(event).encode("utf-8"), _registry(private_key), now=datetime(2026, 9, 2, 12, 3, tzinfo=UTC))
        accepted = _signed_event(private_key)
        await ingest_board_lifecycle_event(session, accepted, _registry(private_key), now=datetime(2026, 9, 2, 12, 3, tzinfo=UTC))
        changed = json.loads(accepted); changed["reasonCode"] = "changed"; changed["signatureB64"] = base64.b64encode(private_key.sign(canonical_board_event_bytes(changed))).decode("ascii")
        with pytest.raises(BoardBridgeRejected, match="conflict"):
            await ingest_board_lifecycle_event(session, json.dumps(changed).encode("utf-8"), _registry(private_key), now=datetime(2026, 9, 2, 12, 3, tzinfo=UTC))
        with pytest.raises(BoardBridgeRejected, match="stale"):
            await ingest_board_lifecycle_event(session, _signed_event(private_key, event_id="event:board-2", observed_at=datetime(2026, 9, 2, 12, 2, tzinfo=UTC)), _registry(private_key), now=datetime(2026, 9, 2, 12, 3, tzinfo=UTC))
    async with engine.begin() as connection:
        assert await connection.scalar(text("SELECT COUNT(*) FROM hermes_board_event_receipts")) == 1
    await engine.dispose()
