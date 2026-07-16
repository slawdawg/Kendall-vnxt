"""Default-disabled, local-only Ed25519 receipt verification.

The supervisor owns authorization creation and snapshots its public trust
registry.  The separate local issuer retains its private key.  This module has
no provider, worker, or evidence-chain promotion path: every result stays
``integrated_local``.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import os
import stat
import struct
import uuid
import re
from datetime import datetime, timedelta, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import (
    AuthoritativeWorkPacket,
    LocalDogfoodAuthorization,
    LocalDogfoodReceiptDecision,
    LocalDogfoodReplayFence,
)

SCHEMA = "pipeline-local-dogfood-attestation/v1"
PACKET_SCHEMA = "pipeline-authoritative-work-packet/v1"
POLICY_VERSION = "local-dogfood/v1"
RETENTION_POLICY = "metadata_only"
OBSERVER_ID = "local_unix_observer/v1"
ENVIRONMENT = "local_dogfood"
TTL_SECONDS = 300
SKEW_SECONDS = 30
OBSERVATION_LEASE_SECONDS = 5
MAX_FIELD_LENGTH = 200
MAX_RECEIPT_REQUEST_BYTES = 4096
REQUIRED_FIELDS = frozenset({
    "schemaVersion", "issuerId", "keyId", "receiptId", "authorizationId", "nonce",
    "issuedAt", "expiresAt", "environment", "packetSchema", "targetRef",
    "sourceRevision", "evidenceDigest", "runId", "attemptId", "policyVersion",
    "retentionPolicy", "observerId", "sourceRefs", "evidenceRefs",
})


class ReceiptRejected(ValueError):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


def canonical_receipt_bytes(receipt: dict[str, str]) -> bytes:
    """JCS bytes for the deliberately string-only, ASCII metadata contract."""
    if set(receipt) != REQUIRED_FIELDS:
        raise ReceiptRejected("unknown_or_missing_field")
    if receipt.get("schemaVersion") != SCHEMA:
        raise ReceiptRejected("unsupported_schema")
    if not all(isinstance(value, str) and value and value.isascii() and value.isprintable() and len(value) <= MAX_FIELD_LENGTH for value in receipt.values()):
        raise ReceiptRejected("invalid_metadata")
    return json.dumps(receipt, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def canonical_authorization_envelope_bytes(envelope: dict) -> bytes:
    """Canonical authenticated message for the private supervisor→issuer UDS hop."""
    if set(envelope) != {"authorizationId", "expiresAt", "receiptBindings"}:
        raise ReceiptRejected("invalid_authorization_envelope")
    authorization_id = envelope["authorizationId"]
    expires_at = envelope["expiresAt"]
    bindings = envelope["receiptBindings"]
    if (not isinstance(authorization_id, str) or not authorization_id.startswith("local-auth-")
            or not isinstance(expires_at, str) or not isinstance(bindings, dict)):
        raise ReceiptRejected("invalid_authorization_envelope")
    # Bindings use the same restricted string contract as the signed receipt.
    canonical_receipt_bytes({
        "schemaVersion": SCHEMA, "receiptId": "envelope", "authorizationId": authorization_id,
        "nonce": "envelope", "issuedAt": expires_at, "expiresAt": expires_at, **bindings,
    })
    return json.dumps(envelope, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def canonical_source_binding_digest(
    environment: str,
    source_revision: str,
    source_refs: list[str],
    evidence_refs: list[str],
) -> str:
    """Hash only the documented source/evidence binding contract."""
    binding = {
        "environment": environment,
        "sourceRevision": source_revision,
        "sourceRefs": sorted(set(source_refs)),
        "evidenceRefs": sorted(set(evidence_refs)),
    }
    payload = json.dumps(binding, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def sign_authorization_envelope(envelope: dict, secret: bytes) -> str:
    if len(secret) < 32:
        raise ReceiptRejected("local_observer_auth_unavailable")
    return base64.b64encode(hmac.digest(secret, canonical_authorization_envelope_bytes(envelope), "sha256")).decode("ascii")


def read_owner_private_secret(path_value: str) -> bytes:
    """Read a local secret without following links or trusting path metadata.

    The check is repeated on every read and compares lstat with fstat so a
    replacement between validation and open cannot redirect the supervisor.
    """
    path = os.fspath(path_value)
    parent = os.path.dirname(path) or "."
    try:
        parent_stat = os.lstat(parent)
        before = os.lstat(path)
    except OSError as exc:
        raise ReceiptRejected("local_observer_auth_unavailable") from exc
    if (stat.S_ISLNK(parent_stat.st_mode) or not stat.S_ISDIR(parent_stat.st_mode)
            or parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o077):
        raise ReceiptRejected("local_observer_auth_unavailable")
    if (stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode)
            or before.st_uid != os.geteuid() or before.st_mode & 0o077):
        raise ReceiptRejected("local_observer_auth_unavailable")
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as exc:
        raise ReceiptRejected("local_observer_auth_unavailable") from exc
    try:
        opened = os.fstat(fd)
        if (not stat.S_ISREG(opened.st_mode) or opened.st_uid != os.geteuid()
                or opened.st_mode & 0o077 or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino)):
            raise ReceiptRejected("local_observer_auth_unavailable")
        secret = base64.b64decode(os.read(fd, 4096).strip(), validate=True)
    except (OSError, ValueError) as exc:
        raise ReceiptRejected("local_observer_auth_unavailable") from exc
    finally:
        os.close(fd)
    if len(secret) < 32:
        raise ReceiptRejected("local_observer_auth_unavailable")
    return secret


def _validate_owner_private_observer_socket(path_value: str) -> None:
    """Reject a shared, replaced, or non-socket observer endpoint before connect."""
    path = os.fspath(path_value)
    if not os.path.isabs(path):
        raise ReceiptRejected("local_observer_unavailable")
    parent = os.path.dirname(path) or "."
    try:
        parent_info = os.lstat(parent)
        socket_info = os.lstat(path)
    except OSError as exc:
        raise ReceiptRejected("local_observer_unavailable") from exc
    if (stat.S_ISLNK(parent_info.st_mode) or not stat.S_ISDIR(parent_info.st_mode)
            or parent_info.st_uid != os.geteuid() or parent_info.st_mode & 0o077
            or stat.S_ISLNK(socket_info.st_mode) or not stat.S_ISSOCK(socket_info.st_mode)
            or socket_info.st_uid != os.geteuid() or socket_info.st_mode & 0o077):
        raise ReceiptRejected("local_observer_unavailable")


def _require_same_uid_unix_peer(peer: object | None) -> None:
    """Require kernel peer credentials; local pathname checks alone are racy."""
    if peer is None or not hasattr(__import__("socket"), "SO_PEERCRED"):
        raise ReceiptRejected("local_observer_unavailable")
    import socket
    try:
        credentials = peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
        _, peer_uid, _ = struct.unpack("3i", credentials)
    except (OSError, struct.error) as exc:
        raise ReceiptRejected("local_observer_unavailable") from exc
    if peer_uid != os.geteuid():
        raise ReceiptRejected("local_observer_unavailable")


async def _open_owner_private_observer_connection(socket_path: str) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    _validate_owner_private_observer_socket(socket_path)
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_unix_connection(socket_path), timeout=2)
        _require_same_uid_unix_peer(writer.get_extra_info("socket"))
        return reader, writer
    except (OSError, asyncio.TimeoutError, ReceiptRejected) as exc:
        try:
            writer.close()  # type: ignore[possibly-undefined]
            await writer.wait_closed()  # type: ignore[possibly-undefined]
        except (UnboundLocalError, OSError):
            pass
        raise ReceiptRejected("local_observer_unavailable") from exc


def parse_receipt_submission(raw: bytes) -> tuple[dict[str, str], str]:
    """Reject oversized or duplicate-key wire input before canonicalization."""
    if not raw or len(raw) > MAX_RECEIPT_REQUEST_BYTES:
        raise ReceiptRejected("invalid_receipt_request")

    def reject_duplicate(pairs: list[tuple[str, object]]) -> dict[str, object]:
        decoded: dict[str, object] = {}
        for key, value in pairs:
            if key in decoded:
                raise ReceiptRejected("duplicate_receipt_field")
            decoded[key] = value
        return decoded

    try:
        body = json.loads(raw, object_pairs_hook=reject_duplicate)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ReceiptRejected("invalid_receipt_request") from exc
    if not isinstance(body, dict) or set(body) != {"receipt", "signatureB64"}:
        raise ReceiptRejected("invalid_receipt_request")
    receipt, signature = body["receipt"], body["signatureB64"]
    if not isinstance(receipt, dict) or not isinstance(signature, str) or not signature or len(signature) > MAX_FIELD_LENGTH:
        raise ReceiptRejected("invalid_receipt_request")
    return receipt, signature


def _timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", value):
        raise ReceiptRejected("invalid_timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ReceiptRejected("invalid_timestamp") from exc
    if parsed.tzinfo is None:
        raise ReceiptRejected("invalid_timestamp")
    return parsed.astimezone(timezone.utc)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def _read_bounded_line(reader: asyncio.StreamReader, limit: int) -> bytes:
    chunks = bytearray()
    while len(chunks) <= limit:
        chunk = await reader.read(min(4096, limit + 1 - len(chunks)))
        if not chunk:
            break
        chunks.extend(chunk)
        if b"\n" in chunk:
            line, _, _ = bytes(chunks).partition(b"\n")
            return line + b"\n"
    raise ReceiptRejected("invalid_receipt_request")


def _issuer_registry(registry_json: str) -> tuple[str, str, str]:
    """Load exactly one development issuer from supervisor-owned configuration."""
    try:
        entries = json.loads(registry_json)
    except json.JSONDecodeError as exc:
        raise ReceiptRejected("local_trust_registry_unavailable") from exc
    if not isinstance(entries, list) or len(entries) != 1:
        raise ReceiptRejected("local_trust_registry_unavailable")
    entry = entries[0]
    if not isinstance(entry, dict) or set(entry) != {"issuerId", "keyId", "publicKeyB64"}:
        raise ReceiptRejected("local_trust_registry_unavailable")
    issuer_id = entry["issuerId"]
    key_id = entry["keyId"]
    public_key_b64 = entry["publicKeyB64"]
    if not all(isinstance(value, str) and value and value.isascii() and value.isprintable() and len(value) <= MAX_FIELD_LENGTH for value in (issuer_id, key_id, public_key_b64)):
        raise ReceiptRejected("local_trust_registry_unavailable")
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64, validate=True))
    except ValueError as exc:
        raise ReceiptRejected("local_trust_registry_unavailable") from exc
    return issuer_id, key_id, public_key_b64


def _snapshot(packet: AuthoritativeWorkPacket) -> tuple[str, str, str, str]:
    source_meta = packet.source_ref_json if isinstance(packet.source_ref_json, dict) else {}
    source_revision = source_meta.get("sourceRevision")
    source_refs_value = source_meta.get("sourceRefs")
    evidence_refs_value = source_meta.get("evidenceRefs")
    if (source_meta.get("environment") != ENVIRONMENT
            or not isinstance(source_revision, str) or len(source_revision) != 40
            or any(char not in "0123456789abcdef" for char in source_revision)
            or not isinstance(source_refs_value, list) or not source_refs_value
            or not isinstance(evidence_refs_value, list) or not evidence_refs_value
            or any(not isinstance(ref, str) or not ref or len(ref) > MAX_FIELD_LENGTH for ref in source_refs_value + evidence_refs_value)):
        raise ReceiptRejected("missing_source_evidence_binding")
    source_refs_value = sorted(set(source_refs_value))
    evidence_refs_value = sorted(set(evidence_refs_value))
    source_refs = json.dumps(source_refs_value, separators=(",", ":"), ensure_ascii=True)
    evidence_refs = json.dumps(evidence_refs_value, separators=(",", ":"), ensure_ascii=True)
    if len(source_refs) > MAX_FIELD_LENGTH or len(evidence_refs) > MAX_FIELD_LENGTH:
        raise ReceiptRejected("invalid_metadata")
    evidence_digest = canonical_source_binding_digest(
        ENVIRONMENT, source_revision, source_refs_value, evidence_refs_value,
    )
    return source_revision, source_refs, evidence_digest, evidence_refs


async def _record(session: AsyncSession, receipt: dict | None, reason: str | None) -> dict[str, str | bool | None]:
    receipt = receipt or {}
    session.add(LocalDogfoodReceiptDecision(
        authorization_id=receipt.get("authorizationId"), receipt_id=receipt.get("receiptId"),
        issuer_id=receipt.get("issuerId"), key_id=receipt.get("keyId"),
        accepted=reason is None, rejection_reason=reason,
    ))
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise ReceiptRejected("rejection_persistence_failed") from exc
    return {"evidenceClass": "integrated_local", "accepted": reason is None, "rejectionReason": reason,
            "issuerId": receipt.get("issuerId"), "keyId": receipt.get("keyId"), "receiptId": receipt.get("receiptId")}


async def authorize_for_packet(session: AsyncSession, packet_id: str, registry_json: str, now: datetime | None = None) -> dict[str, str]:
    """Mint a local authorization from a persisted packet and config allowlist only."""
    packet = await session.get(AuthoritativeWorkPacket, packet_id)
    if packet is None:
        raise ReceiptRejected("packet_not_found")
    issuer_id, key_id, public_key_b64 = _issuer_registry(registry_json)
    now = now or datetime.now(timezone.utc)
    source_revision, source_refs, evidence_digest, evidence_refs = _snapshot(packet)
    authorization = LocalDogfoodAuthorization(
        id=f"local-auth-{uuid.uuid4()}", issuer_id=issuer_id, key_id=key_id, public_key_b64=public_key_b64,
        packet_schema=PACKET_SCHEMA, target_ref=packet.id, source_revision=source_revision,
        source_refs=source_refs, evidence_digest=evidence_digest, evidence_refs=evidence_refs,
        run_id=f"local-run-{uuid.uuid4()}", attempt_id=f"local-attempt-{uuid.uuid4()}",
        policy_version=POLICY_VERSION, retention_policy=RETENTION_POLICY, observer_id=OBSERVER_ID,
        environment=ENVIRONMENT, expires_at=now + timedelta(seconds=TTL_SECONDS),
    )
    session.add(authorization)
    await session.commit()
    return {"authorizationId": authorization.id, "runId": authorization.run_id, "attemptId": authorization.attempt_id,
            "expiresAt": _utc(authorization.expires_at).isoformat().replace("+00:00", "Z"), "evidenceClass": "integrated_local",
            "receiptBindings": {"issuerId": issuer_id, "keyId": key_id, "environment": ENVIRONMENT,
                                "packetSchema": PACKET_SCHEMA, "targetRef": packet.id, "sourceRevision": source_revision,
                                "sourceRefs": source_refs, "evidenceDigest": evidence_digest, "evidenceRefs": evidence_refs,
                                "runId": authorization.run_id,
                                "attemptId": authorization.attempt_id, "policyVersion": POLICY_VERSION,
                                "retentionPolicy": RETENTION_POLICY, "observerId": OBSERVER_ID}}


async def verify(session: AsyncSession, receipt: dict, signature_b64: str, now: datetime | None = None, registry_json: str = "[]") -> dict:
    now = now or datetime.now(timezone.utc)
    try:
        canonical = canonical_receipt_bytes(receipt)
        authorization = await session.get(LocalDogfoodAuthorization, receipt["authorizationId"])
        if authorization is None or authorization.revoked:
            raise ReceiptRejected("unknown_or_revoked_authorization")
        # An authorization snapshots a key for auditability, but acceptance is
        # always governed by the current supervisor-owned allowlist.  A key
        # removed during rotation/revocation cannot keep verifying receipts.
        current_issuer, current_key, current_public_key = _issuer_registry(registry_json)
        if (authorization.issuer_id, authorization.key_id, authorization.public_key_b64) != (
            current_issuer, current_key, current_public_key
        ):
            raise ReceiptRejected("unknown_or_revoked_key")
        actual = tuple(receipt[key] for key in ("issuerId", "keyId", "environment", "packetSchema", "targetRef", "sourceRevision", "sourceRefs", "evidenceDigest", "evidenceRefs", "runId", "attemptId", "policyVersion", "retentionPolicy", "observerId"))
        expected = (authorization.issuer_id, authorization.key_id, authorization.environment, authorization.packet_schema, authorization.target_ref, authorization.source_revision, authorization.source_refs, authorization.evidence_digest, authorization.evidence_refs, authorization.run_id, authorization.attempt_id, authorization.policy_version, authorization.retention_policy, authorization.observer_id)
        if actual != expected:
            raise ReceiptRejected("binding_mismatch")
        issued, expires = _timestamp(receipt["issuedAt"]), _timestamp(receipt["expiresAt"])
        created, authorization_expires = _utc(authorization.created_at), _utc(authorization.expires_at)
        if (expires <= issued or issued < created - timedelta(seconds=SKEW_SECONDS)
                or expires > authorization_expires or expires - issued > timedelta(seconds=TTL_SECONDS)
                or expires < now or issued > now + timedelta(seconds=SKEW_SECONDS) or now > authorization_expires):
            raise ReceiptRejected("expired_or_future_receipt")
        try:
            Ed25519PublicKey.from_public_bytes(base64.b64decode(authorization.public_key_b64, validate=True)).verify(
                base64.b64decode(signature_b64, validate=True), canonical)
        except (InvalidSignature, ValueError) as exc:
            raise ReceiptRejected("invalid_signature") from exc
        # Claim the authorization in the same transaction as the replay fences
        # and accepted decision.  Receipt/nonce uniqueness alone allows two
        # different receipts to race for one authorization.
        claimed = await session.execute(update(LocalDogfoodAuthorization).where(
            LocalDogfoodAuthorization.id == authorization.id,
            LocalDogfoodAuthorization.accepted_receipt_id.is_(None),
            LocalDogfoodAuthorization.revoked.is_(False),
            LocalDogfoodAuthorization.expires_at > now,
        ).values(accepted_receipt_id=receipt["receiptId"], observation_receipt_id=receipt["receiptId"], observation_state="verified", observation_lease_expires_at=None).execution_options(synchronize_session=False))
        if claimed.rowcount != 1:
            raise ReceiptRejected("replay")
        for kind, value in (("receipt", receipt["receiptId"]), ("nonce", receipt["nonce"])):
            session.add(LocalDogfoodReplayFence(authorization_id=authorization.id, fence_kind=kind, value=value))
        await session.flush()
    except ReceiptRejected as exc:
        await session.rollback()
        return await _record(session, receipt, exc.reason)
    except IntegrityError:
        await session.rollback()
        return await _record(session, receipt, "replay")
    return await _record(session, receipt, None)


async def observe_and_verify(session: AsyncSession, authorization_id: str, socket_path: str, registry_json: str, envelope_secret: bytes) -> dict:
    """Ask the separately-run local observer to construct one receipt.

    The socket peer receives a server-minted envelope only; it never accepts a
    caller supplied receipt or generic signing request.  The supervisor still
    verifies the returned bytes and applies the durable replay fence.
    """
    authorization = await session.get(LocalDogfoodAuthorization, authorization_id)
    if authorization is None or authorization.revoked:
        raise ReceiptRejected("unknown_or_revoked_authorization")
    now = datetime.now(timezone.utc)
    # A short durable lease gives one caller the observer hop.  A retry after a
    # crash can reclaim an expired lease; parallel callers wait for the same
    # receipt rather than minting another one.
    lease_until = now + timedelta(seconds=OBSERVATION_LEASE_SECONDS)
    result = await session.execute(update(LocalDogfoodAuthorization).where(
        LocalDogfoodAuthorization.id == authorization_id,
        ((LocalDogfoodAuthorization.observation_state == "ready") |
         ((LocalDogfoodAuthorization.observation_state == "dispatched") &
          (LocalDogfoodAuthorization.observation_lease_expires_at < now))),
        LocalDogfoodAuthorization.revoked.is_(False),
        LocalDogfoodAuthorization.expires_at > now,
    ).values(observation_requested=True, observation_state="dispatched", observation_lease_expires_at=lease_until).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        await session.rollback()
        # Re-open after rollback and return the single persisted acceptance to
        # concurrent callers.  The bounded wait is intentionally local-only.
        for _ in range(60):
            await asyncio.sleep(0.1)
            current = await session.get(LocalDogfoodAuthorization, authorization_id)
            if current is not None:
                await session.refresh(current)
            if current and current.accepted_receipt_id:
                return {"evidenceClass": "integrated_local", "accepted": True, "rejectionReason": None,
                        "issuerId": current.issuer_id, "keyId": current.key_id, "receiptId": current.accepted_receipt_id}
            if current and current.observation_state == "ready":
                raise ReceiptRejected("local_observer_unavailable")
            if current is None or current.observation_lease_expires_at is None or _utc(current.observation_lease_expires_at) <= datetime.now(timezone.utc):
                break
        raise ReceiptRejected("authorization_observation_in_progress")
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise ReceiptRejected("rejection_persistence_failed") from exc
    envelope = {
        "authorizationId": authorization.id,
        "expiresAt": _utc(authorization.expires_at).isoformat().replace("+00:00", "Z"),
        "receiptBindings": {
            "issuerId": authorization.issuer_id, "keyId": authorization.key_id,
            "environment": authorization.environment, "packetSchema": authorization.packet_schema,
            "targetRef": authorization.target_ref, "sourceRevision": authorization.source_revision,
            "sourceRefs": authorization.source_refs, "evidenceDigest": authorization.evidence_digest,
            "evidenceRefs": authorization.evidence_refs, "runId": authorization.run_id,
            "attemptId": authorization.attempt_id, "policyVersion": authorization.policy_version,
            "retentionPolicy": authorization.retention_policy, "observerId": authorization.observer_id,
        },
    }
    envelope["macB64"] = sign_authorization_envelope(envelope, envelope_secret)
    try:
        reader, writer = await _open_owner_private_observer_connection(socket_path)
        writer.write(json.dumps({"action": "observe", "authorization": envelope}, separators=(",", ":")).encode() + b"\n")
        await writer.drain()
        raw = await asyncio.wait_for(_read_bounded_line(reader, MAX_RECEIPT_REQUEST_BYTES), timeout=2)
        writer.close()
        await writer.wait_closed()
        receipt, signature = parse_receipt_submission(raw)
        if not isinstance(receipt.get("receiptId"), str) or not receipt["receiptId"]:
            raise ReceiptRejected("invalid_receipt_request")
    except (OSError, asyncio.TimeoutError, ValueError, ReceiptRejected) as exc:
        # Release only this lease on an unavailable observer.  Waiting callers
        # see the durable retryable state instead of a misleading consumed
        # authorization, while a live owner cannot be overwritten.
        await session.execute(update(LocalDogfoodAuthorization).where(
            LocalDogfoodAuthorization.id == authorization_id,
            LocalDogfoodAuthorization.observation_state == "dispatched",
            LocalDogfoodAuthorization.observation_lease_expires_at == lease_until,
        ).values(observation_state="ready", observation_lease_expires_at=None))
        await session.commit()
        raise ReceiptRejected("local_observer_unavailable") from exc
    # A process may have verified and committed this exact cached response
    # before dying.  Treat the daemon's replayed cached response as idempotent
    # success rather than turning recovery into a replay rejection.
    existing = (await session.execute(select(LocalDogfoodReceiptDecision).where(
        LocalDogfoodReceiptDecision.authorization_id == authorization_id,
        LocalDogfoodReceiptDecision.receipt_id == receipt["receiptId"],
        LocalDogfoodReceiptDecision.accepted.is_(True),
    ))).scalar_one_or_none()
    if existing is not None:
        return {"evidenceClass": "integrated_local", "accepted": True, "rejectionReason": None,
                "issuerId": receipt["issuerId"], "keyId": receipt["keyId"], "receiptId": receipt["receiptId"]}
    return await verify(session, receipt, signature, registry_json=registry_json)


async def readback(session: AsyncSession, authorization_id: str, registry_json: str | None = None) -> dict:
    authorization = await session.get(LocalDogfoodAuthorization, authorization_id)
    if authorization is None:
        raise ReceiptRejected("authorization_not_found")
    decisions = (await session.execute(select(LocalDogfoodReceiptDecision).where(
        LocalDogfoodReceiptDecision.authorization_id == authorization_id).order_by(LocalDogfoodReceiptDecision.created_at.desc())
    )).scalars().all()
    latest = decisions[0] if decisions else None
    accepted = next((decision for decision in decisions if decision.accepted), None)
    replayed = any(decision.rejection_reason == "replay" for decision in decisions)
    if authorization.revoked:
        receipt_state, rejection_reason = "rejected", "unknown_or_revoked_authorization"
    elif datetime.now(timezone.utc) > _utc(authorization.expires_at):
        receipt_state, rejection_reason = "rejected", "expired_or_future_receipt"
    elif registry_json is not None:
        try:
            current_issuer, current_key, current_public_key = _issuer_registry(registry_json)
        except ReceiptRejected:
            current_issuer = current_key = current_public_key = None
        if (authorization.issuer_id, authorization.key_id, authorization.public_key_b64) != (
            current_issuer, current_key, current_public_key
        ):
            receipt_state, rejection_reason = "rejected", "unknown_or_revoked_key"
        elif latest and latest.accepted:
            receipt_state, rejection_reason = "accepted", None
        else:
            receipt_state = "rejected" if latest else "pending"
            rejection_reason = latest.rejection_reason if latest else None
    else:
        receipt_state = "accepted" if latest and latest.accepted else "rejected" if latest else "pending"
        rejection_reason = None if latest and latest.accepted else latest.rejection_reason if latest else None
    return {"authorizationId": authorization.id, "issuerId": authorization.issuer_id, "keyId": authorization.key_id,
            "receiptId": accepted.receipt_id if accepted else latest.receipt_id if latest else None, "receiptState": receipt_state,
            "rejectionReason": rejection_reason, "expiresAt": _utc(authorization.expires_at).isoformat().replace("+00:00", "Z"),
            "replayState": "replayed" if replayed else "not_replayed" if latest else "unknown",
            "evidenceClass": "integrated_local", "liveEvidenceAccepted": False}


async def readback_for_target(session: AsyncSession, target_ref: str, registry_json: str | None = None) -> dict:
    authorization = (await session.execute(select(LocalDogfoodAuthorization).where(
        LocalDogfoodAuthorization.target_ref == target_ref
    ).order_by(LocalDogfoodAuthorization.created_at.desc()).limit(1))).scalar_one_or_none()
    if authorization is None:
        return {"authorizationId": None, "issuerId": None, "keyId": None, "receiptId": None,
                "receiptState": "unavailable", "rejectionReason": "authorization_not_found", "expiresAt": None,
                "replayState": "unknown", "evidenceClass": "integrated_local", "liveEvidenceAccepted": False}
    return await readback(session, authorization.id, registry_json=registry_json)
