import asyncio
import base64
import hashlib
import importlib.util
import json
import os
import sqlite3
import sys
import socket
import stat
import struct
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
import pytest


def _reset() -> None:
    for name in list(sys.modules):
        if name == "supervisor" or name.startswith("supervisor."):
            sys.modules.pop(name, None)


def _client(tmp_path, monkeypatch, key: Ed25519PrivateKey, *, enabled: bool = True) -> TestClient:
    secret_path = tmp_path / "observer-envelope.secret"
    secret_path.write_text(base64.b64encode(b"s" * 32).decode(), encoding="ascii")
    os.chmod(secret_path, 0o600)
    api_dir = tmp_path / "api-private"
    api_dir.mkdir(mode=0o700, exist_ok=True)
    os.chmod(api_dir, 0o700)
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{(tmp_path / 'attestation.db').as_posix()}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("SUPERVISOR_ENABLE_LOCAL_DOGFOOD_ATTESTATION", str(enabled).lower())
    monkeypatch.setenv("SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ISSUER_REGISTRY", json.dumps([{
        "issuerId": "issuer-local", "keyId": "dev-key-1",
        "publicKeyB64": base64.b64encode(key.public_key().public_bytes_raw()).decode(),
    }]))
    monkeypatch.setenv("SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ENVELOPE_SECRET_FILE", str(secret_path))
    monkeypatch.setenv("SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH", str(api_dir / "supervisor.sock"))
    _reset()
    from supervisor.api.main import app
    return TestClient(app, client=None)


async def _seed_packet(packet_id: str) -> None:
    from supervisor.infrastructure.db.database import SessionLocal
    from supervisor.infrastructure.db.models import AuthoritativeWorkPacket
    async with SessionLocal() as session:
        session.add(AuthoritativeWorkPacket(
            id=packet_id, title="Local dogfood packet", current_stage="verify", status="held",
            current_event_id="event-local-1", source_ref_json={"environment": "local_dogfood", "sourceRevision": "a" * 40, "sourceRefs": [f"packet:{packet_id}"], "evidenceRefs": [f"evidence:{packet_id}"]},
        ))
        await session.commit()


async def _set_authorization_state(authorization_id: str, *, revoked: bool = False, expired: bool = False) -> None:
    from supervisor.infrastructure.db.database import SessionLocal
    from supervisor.infrastructure.db.models import LocalDogfoodAuthorization
    async with SessionLocal() as session:
        authorization = await session.get(LocalDogfoodAuthorization, authorization_id)
        assert authorization is not None
        authorization.revoked = revoked
        if expired:
            authorization.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await session.commit()


def _authorize(client: TestClient, packet_id: str = "packet-local-1") -> dict:
    asyncio.run(_seed_packet(packet_id))
    response = client.post(f"/local-dogfood/attestations/packets/{packet_id}/authorizations")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _receipt(authorization: dict, now: datetime) -> dict:
    return {
        "schemaVersion": "pipeline-local-dogfood-attestation/v1", "receiptId": "receipt-local-1",
        "authorizationId": authorization["authorizationId"], "nonce": "nonce-local-1",
        "issuedAt": now.isoformat().replace("+00:00", "Z"),
        "expiresAt": (now + timedelta(seconds=60)).isoformat().replace("+00:00", "Z"),
        **authorization["receiptBindings"],
    }


def _signed(key: Ed25519PrivateKey, receipt: dict) -> str:
    from supervisor.application.local_dogfood_attestation import canonical_receipt_bytes
    return base64.b64encode(key.sign(canonical_receipt_bytes(receipt))).decode()


def test_local_dogfood_attestation_is_default_disabled(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key, enabled=False) as client:
        assert client.get("/local-dogfood/attestations/authorizations/missing").status_code == 404


def test_server_mints_authorization_from_packet_and_configured_issuer(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client)
        assert authorization["authorizationId"].startswith("local-auth-")
        assert authorization["runId"].startswith("local-run-")
        assert authorization["attemptId"].startswith("local-attempt-")
        assert authorization["receiptBindings"] == {
            "issuerId": "issuer-local", "keyId": "dev-key-1", "environment": "local_dogfood",
            "packetSchema": "pipeline-authoritative-work-packet/v1", "targetRef": "packet-local-1",
            "sourceRevision": "a" * 40, "sourceRefs": "[\"packet:packet-local-1\"]",
            "evidenceDigest": authorization["receiptBindings"]["evidenceDigest"],
            "evidenceRefs": "[\"evidence:packet-local-1\"]",
            "runId": authorization["runId"], "attemptId": authorization["attemptId"],
            "policyVersion": "local-dogfood/v1", "retentionPolicy": "metadata_only",
            "observerId": "local_unix_observer/v1",
        }
        assert client.post("/local-dogfood/attestations/authorizations", json={"publicKeyB64": "caller-key"}).status_code == 404


def test_authorization_holds_packets_without_explicit_source_and_evidence_refs(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        asyncio.run(_seed_packet("packet-missing-refs"))
        from supervisor.infrastructure.db.database import SessionLocal
        from supervisor.infrastructure.db.models import AuthoritativeWorkPacket

        async def remove_refs():
            async with SessionLocal() as session:
                packet = await session.get(AuthoritativeWorkPacket, "packet-missing-refs")
                assert packet is not None
                packet.source_ref_json = {"environment": "local_dogfood", "sourceRevision": "a" * 40}
                await session.commit()

        asyncio.run(remove_refs())
        response = client.post("/local-dogfood/attestations/packets/packet-missing-refs/authorizations")
        assert response.status_code == 400
        assert response.json()["detail"]["error"]["code"] == "missing_source_evidence_binding"


def test_local_attestation_routes_reject_non_loopback_transport(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key):
        from supervisor.api.main import app
        with TestClient(app, client=("203.0.113.10", 50000)) as remote:
            assert remote.get("/local-dogfood/attestations/authorizations/missing").status_code == 403
        # A loopback TCP peer is equally rejected: this models a proxy that
        # connects locally after stripping forwarded headers.
        with TestClient(app, client=("127.0.0.1", 50000)) as proxied:
            assert proxied.get("/local-dogfood/attestations/authorizations/missing").status_code == 403


def test_enabled_local_attestation_fails_startup_for_proxy_or_remote_bind(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    monkeypatch.setenv("SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_BIND_HOST", "0.0.0.0")
    try:
        with _client(tmp_path, monkeypatch, key):
            raise AssertionError("unsafe deployment must not start")
    except ValueError as exc:
        assert "loopback configuration" in str(exc)


def test_local_receipt_success_replay_and_binding_rejections(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client)
        receipt = _receipt(authorization, datetime.now(timezone.utc))
        accepted = client.post("/local-dogfood/attestations/receipts", json={"receipt": receipt, "signatureB64": _signed(key, receipt)})
        assert accepted.json()["data"]["accepted"] is True
        replay = client.post("/local-dogfood/attestations/receipts", json={"receipt": receipt, "signatureB64": _signed(key, receipt)})
        assert replay.json()["data"]["rejectionReason"] == "replay"
        readback = client.get(f"/local-dogfood/attestations/authorizations/{authorization['authorizationId']}").json()["data"]
        assert readback["receiptState"] == "accepted"
        assert readback["replayState"] == "replayed"
        assert readback["evidenceClass"] == "integrated_local"
        assert readback["liveEvidenceAccepted"] is False


def test_local_receipt_rejects_wrong_bindings_time_signature_and_duplicate_wire_fields(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    wrong = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client)
        now = datetime.now(timezone.utc)
        target = _receipt(authorization, now)
        target["targetRef"] = "wrong-target"
        assert client.post("/local-dogfood/attestations/receipts", json={"receipt": target, "signatureB64": _signed(key, target)}).json()["data"]["rejectionReason"] == "binding_mismatch"
        valid = _receipt(authorization, now)
        assert client.post("/local-dogfood/attestations/receipts", json={"receipt": valid, "signatureB64": _signed(wrong, valid)}).json()["data"]["rejectionReason"] == "invalid_signature"
        expired = _receipt(authorization, now - timedelta(minutes=10))
        expired["receiptId"], expired["nonce"] = "receipt-expired", "nonce-expired"
        assert client.post("/local-dogfood/attestations/receipts", json={"receipt": expired, "signatureB64": _signed(key, expired)}).json()["data"]["rejectionReason"] == "expired_or_future_receipt"
        wire = json.dumps({"receipt": valid, "signatureB64": _signed(key, valid)}).replace('"issuerId":', '"issuerId":"spoofed","issuerId":', 1)
        duplicate = client.post("/local-dogfood/attestations/receipts", content=wire, headers={"content-type": "application/json"})
        assert duplicate.status_code == 400
        assert duplicate.json()["detail"]["error"]["code"] == "duplicate_receipt_field"


def test_existing_sqlite_attestation_table_gets_server_owned_binding_columns(tmp_path, monkeypatch):
    db_path = tmp_path / "attestation.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute("create table local_dogfood_attestation_authorizations (id varchar(80) primary key)")
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key):
        pass
    with sqlite3.connect(db_path) as connection:
        columns = {row[1] for row in connection.execute("pragma table_info(local_dogfood_attestation_authorizations)")}
    assert {"issuer_id", "key_id", "public_key_b64", "packet_schema", "target_ref", "source_revision", "source_refs", "evidence_digest", "evidence_refs", "run_id", "attempt_id", "policy_version", "retention_policy", "observer_id", "environment", "expires_at", "revoked", "created_at"} <= columns


def test_verifier_rechecks_rotated_registry_and_rejects_future_and_v0(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client)
        future = _receipt(authorization, datetime.now(timezone.utc) + timedelta(minutes=2))
        assert client.post("/local-dogfood/attestations/receipts", json={"receipt": future, "signatureB64": _signed(key, future)}).json()["data"]["rejectionReason"] == "expired_or_future_receipt"
        legacy = _receipt(authorization, datetime.now(timezone.utc))
        legacy["schemaVersion"] = "pipeline-observed-evidence-attestation/v0"
        assert client.post("/local-dogfood/attestations/receipts", json={"receipt": legacy, "signatureB64": "AA=="}).json()["data"]["rejectionReason"] == "unsupported_schema"
    replacement = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, replacement) as rotated:
        valid = _receipt(authorization, datetime.now(timezone.utc))
        assert rotated.post("/local-dogfood/attestations/receipts", json={"receipt": valid, "signatureB64": _signed(key, valid)}).json()["data"]["rejectionReason"] == "unknown_or_revoked_key"


def test_replay_fence_survives_restart(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client)
        receipt = _receipt(authorization, datetime.now(timezone.utc))
        payload = {"receipt": receipt, "signatureB64": _signed(key, receipt)}
        assert client.post("/local-dogfood/attestations/receipts", json=payload).json()["data"]["accepted"] is True
    with _client(tmp_path, monkeypatch, key) as restarted:
        assert restarted.post("/local-dogfood/attestations/receipts", json=payload).json()["data"]["rejectionReason"] == "replay"


def test_concurrent_duplicate_receipts_accept_once_and_fence_the_other(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client)
        receipt = _receipt(authorization, datetime.now(timezone.utc))
        signature = _signed(key, receipt)
        from supervisor.application.local_dogfood_attestation import verify
        from supervisor.infrastructure.db.database import SessionLocal
        from supervisor.config.settings import get_settings

        async def submit():
            async with SessionLocal() as session:
                return await verify(session, receipt, signature, registry_json=get_settings().local_dogfood_attestation_issuer_registry)

        async def race():
            return await asyncio.gather(submit(), submit())

        accepted, duplicate = asyncio.run(race())
        assert sorted([accepted["accepted"], duplicate["accepted"]]) == [False, True]
        assert {accepted["rejectionReason"], duplicate["rejectionReason"]} == {None, "replay"}


def test_concurrent_distinct_receipts_claim_one_authorization_once(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client, "packet-distinct-receipt-race")
        first = _receipt(authorization, datetime.now(timezone.utc))
        second = {**_receipt(authorization, datetime.now(timezone.utc)), "receiptId": "receipt-local-2", "nonce": "nonce-local-2"}
        from supervisor.application.local_dogfood_attestation import verify
        from supervisor.config.settings import get_settings
        from supervisor.infrastructure.db.database import SessionLocal

        async def submit(receipt):
            async with SessionLocal() as session:
                return await verify(session, receipt, _signed(key, receipt), registry_json=get_settings().local_dogfood_attestation_issuer_registry)

        async def race():
            return await asyncio.gather(submit(first), submit(second))

        results = asyncio.run(race())
        assert sum(result["accepted"] for result in results) == 1
        assert {result["rejectionReason"] for result in results} == {None, "replay"}


def test_observer_outage_is_retryable_without_minting_a_second_authorization(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        authorization = _authorize(client, "packet-observe-race")
        from supervisor.application.local_dogfood_attestation import ReceiptRejected, observe_and_verify
        from supervisor.config.settings import get_settings
        from supervisor.infrastructure.db.database import SessionLocal

        async def submit():
            async with SessionLocal() as session:
                try:
                    return await observe_and_verify(
                        session, authorization["authorizationId"], str(tmp_path / "absent.sock"),
                        get_settings().local_dogfood_attestation_issuer_registry, b"s" * 32,
                    )
                except ReceiptRejected as exc:
                    return exc.reason

        async def race():
            return await asyncio.gather(submit(), submit())

        first, second = asyncio.run(race())
        assert {first, second} == {"local_observer_unavailable"}


def test_observer_protocol_authenticates_expiry_replay_and_observation_binding(tmp_path):
    script = Path(__file__).parents[2] / "scripts" / "local_dogfood_attestation_issuer.py"
    spec = importlib.util.spec_from_file_location("local_dogfood_attestation_issuer", script)
    assert spec and spec.loader
    issuer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(issuer)
    from supervisor.application.local_dogfood_attestation import sign_authorization_envelope

    secret = b"m" * 32
    bindings = {
        "issuerId": "issuer-local", "keyId": "dev-key-1", "environment": "local_dogfood",
        "packetSchema": "pipeline-authoritative-work-packet/v1", "targetRef": "packet",
        "sourceRevision": "a" * 40, "sourceRefs": "[\"packet:packet\"]", "evidenceDigest": "",
        "evidenceRefs": "[]",
        "runId": "run", "attemptId": "attempt", "policyVersion": "local-dogfood/v1",
        "retentionPolicy": "metadata_only", "observerId": "local_unix_observer/v1",
    }
    observation_path = tmp_path / "observation.json"
    observation_path.write_text('{"environment":"local_dogfood","observed":"local","sourceRefs":["packet:packet"],"evidenceRefs":["evidence:protocol"],"sourceRevision":"' + "a" * 40 + '"}', encoding="utf-8")
    os.chmod(observation_path, 0o600)
    bindings["evidenceDigest"] = issuer._canonical_source_digest(observation_path)
    bindings["evidenceRefs"] = "[\"evidence:protocol\"]"
    bare = {"authorizationId": "local-auth-protocol-1", "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat().replace("+00:00", "Z"), "receiptBindings": bindings}
    message = {"action": "observe", "authorization": {**bare, "macB64": sign_authorization_envelope(bare, secret)}}
    consumed = tmp_path / "consumed"
    consumed.mkdir(mode=0o700)
    accepted = issuer._authenticated_envelope(message, secret)
    assert accepted == bare
    receipt = issuer._receipt(accepted, observation_path, Ed25519PrivateKey.generate())
    assert receipt["receipt"]["evidenceDigest"] == bindings["evidenceDigest"]
    first = issuer._consume_or_recover(consumed, accepted["authorizationId"], lambda: receipt)
    assert first == receipt
    # A retry after daemon consumption returns the identical persisted receipt,
    # which lets the supervisor recover from a crash before it records verify.
    assert issuer._consume_or_recover(consumed, accepted["authorizationId"], lambda: {"unexpected": True}) == receipt
    forged = {"action": "observe", "authorization": {**bare, "authorizationId": "local-auth-forged", "macB64": "AA=="}}
    try:
        issuer._authenticated_envelope(forged, secret)
    except ValueError as exc:
        assert str(exc) == "unauthenticated_authorization_envelope"
    else:
        raise AssertionError("forged envelope must be rejected")
    expired = {**bare, "authorizationId": "local-auth-expired", "expiresAt": "2020-01-01T00:00:00Z"}
    expired_message = {"action": "observe", "authorization": {**expired, "macB64": sign_authorization_envelope(expired, secret)}}
    try:
        issuer._authenticated_envelope(expired_message, secret)
    except ValueError as exc:
        assert str(exc) == "expired_authorization_envelope"
    else:
        raise AssertionError("expired envelope must be rejected")


def test_readback_recomputes_revocation_and_expiry_at_read_time(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    with _client(tmp_path, monkeypatch, key) as client:
        revoked = _authorize(client, "packet-revoked")
        asyncio.run(_set_authorization_state(revoked["authorizationId"], revoked=True))
        assert client.get(f"/local-dogfood/attestations/authorizations/{revoked['authorizationId']}").json()["data"]["rejectionReason"] == "unknown_or_revoked_authorization"
        expired = _authorize(client, "packet-expired")
        asyncio.run(_set_authorization_state(expired["authorizationId"], expired=True))
        assert client.get(f"/local-dogfood/attestations/authorizations/{expired['authorizationId']}").json()["data"]["rejectionReason"] == "expired_or_future_receipt"


def test_rejection_persistence_failure_fails_closed():
    from supervisor.application.local_dogfood_attestation import ReceiptRejected, _record

    class FailingSession:
        def add(self, _: object) -> None:
            pass

        async def commit(self) -> None:
            raise RuntimeError("disk unavailable")

        async def rollback(self) -> None:
            pass

    try:
        asyncio.run(_record(FailingSession(), {}, "replay"))
    except ReceiptRejected as exc:
        assert exc.reason == "rejection_persistence_failed"
    else:
        raise AssertionError("persistence failure must fail closed")


def test_secret_read_rejects_symlink_unsafe_mode_and_foreign_owner(tmp_path, monkeypatch):
    from supervisor.application.local_dogfood_attestation import ReceiptRejected, read_owner_private_secret
    parent = tmp_path / "private"
    parent.mkdir(mode=0o700)
    os.chmod(parent, 0o700)
    secret = parent / "secret"
    secret.write_text(base64.b64encode(b"s" * 32).decode(), encoding="ascii")
    os.chmod(secret, 0o600)
    assert read_owner_private_secret(str(secret)) == b"s" * 32
    link = parent / "secret-link"
    link.symlink_to(secret)
    with pytest.raises(ReceiptRejected, match="local_observer_auth_unavailable"):
        read_owner_private_secret(str(link))
    os.chmod(secret, 0o644)
    with pytest.raises(ReceiptRejected, match="local_observer_auth_unavailable"):
        read_owner_private_secret(str(secret))
    os.chmod(secret, 0o600)
    # Simulate a foreign *file* owner without requiring privileged chown in CI;
    # the parent remains owner-private, so this exercises the file check.
    from supervisor.application import local_dogfood_attestation as attestation
    original_lstat = attestation.os.lstat

    def foreign_file_lstat(path):
        info = original_lstat(path)
        if os.fspath(path) == str(secret):
            return SimpleNamespace(st_mode=info.st_mode, st_uid=info.st_uid + 1, st_dev=info.st_dev, st_ino=info.st_ino)
        return info

    monkeypatch.setattr(attestation.os, "lstat", foreign_file_lstat)
    with pytest.raises(ReceiptRejected, match="local_observer_auth_unavailable"):
        read_owner_private_secret(str(secret))


def test_python_canonicalizer_matches_shared_typescript_vector():
    from supervisor.application.local_dogfood_attestation import ReceiptRejected, canonical_receipt_bytes
    vector_path = Path(__file__).parents[4] / "tests" / "fixtures" / "local-dogfood-canonical-vector.json"
    receipt = json.loads(vector_path.read_text(encoding="utf-8"))
    assert canonical_receipt_bytes(receipt) == json.dumps(receipt, separators=(",", ":"), ensure_ascii=False).encode()
    with pytest.raises(ReceiptRejected, match="unknown_or_missing_field"):
        canonical_receipt_bytes({**receipt, "extra": "forged"})
    for value in (1, True, None, "line\nbreak", "caf\u00e9", "x" * 201):
        with pytest.raises(ReceiptRejected, match="invalid_metadata"):
            canonical_receipt_bytes({**receipt, "issuerId": value})
    assert canonical_receipt_bytes(dict(reversed(list(receipt.items())))) == canonical_receipt_bytes(receipt)


def test_issuer_refuses_shared_or_existing_socket_paths(tmp_path):
    script = Path(__file__).parents[2] / "scripts" / "local_dogfood_attestation_issuer.py"
    spec = importlib.util.spec_from_file_location("local_dogfood_attestation_issuer_hardening", script)
    assert spec and spec.loader
    issuer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(issuer)
    shared = tmp_path / "shared"
    shared.mkdir(mode=0o755)
    with pytest.raises(ValueError, match="private"):
        issuer._private_owner_directory(shared, "test socket parent")
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    marker = private / "already.sock"
    marker.write_text("not a socket", encoding="utf-8")
    assert marker.exists()


def test_supervisor_refuses_shared_or_wrong_type_observer_socket(tmp_path):
    from supervisor.application.local_dogfood_attestation import ReceiptRejected, _validate_owner_private_observer_socket
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    os.chmod(private, 0o700)
    wrong_type = private / "observer.sock"
    wrong_type.write_text("not a socket", encoding="ascii")
    os.chmod(wrong_type, 0o600)
    with pytest.raises(ReceiptRejected, match="local_observer_unavailable"):
        _validate_owner_private_observer_socket(str(wrong_type))
    wrong_type.unlink()
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(str(wrong_type))
    try:
        os.chmod(wrong_type, 0o666)
        with pytest.raises(ReceiptRejected, match="local_observer_unavailable"):
            _validate_owner_private_observer_socket(str(wrong_type))
        os.chmod(wrong_type, 0o600)
        _validate_owner_private_observer_socket(str(wrong_type))
    finally:
        listener.close()


def test_supervisor_requires_kernel_same_uid_observer_peer(monkeypatch):
    from supervisor.application.local_dogfood_attestation import ReceiptRejected, _require_same_uid_unix_peer

    class Peer:
        def getsockopt(self, *_):
            return struct.pack("3i", 123, os.geteuid(), 456)

    _require_same_uid_unix_peer(Peer())
    class ForeignPeer:
        def getsockopt(self, *_):
            return struct.pack("3i", 123, os.geteuid() + 1, 456)

    with pytest.raises(ReceiptRejected, match="local_observer_unavailable"):
        _require_same_uid_unix_peer(ForeignPeer())


def test_issuer_fsyncs_marker_directory_for_reservation_and_completion(tmp_path, monkeypatch):
    script = Path(__file__).parents[2] / "scripts" / "local_dogfood_attestation_issuer.py"
    spec = importlib.util.spec_from_file_location("local_dogfood_attestation_issuer_fsync", script)
    assert spec and spec.loader
    issuer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(issuer)
    consumed = tmp_path / "consumed"
    consumed.mkdir(mode=0o700)
    calls: list[Path] = []
    monkeypatch.setattr(issuer, "_fsync_directory", lambda path: calls.append(path))
    response = issuer._consume_or_recover(consumed, "local-auth-fsync-1", lambda: {"receipt": "one"})
    assert response == {"receipt": "one"}
    assert calls == [consumed, consumed]
