"""Strict local Unix-socket observer/issuer for the dogfood verifier.

It deliberately has no stdin protocol and no generic ``sign`` action.  The
only accepted message is a supervisor-minted authorization envelope.  Before
signing it reads its configured local observation JSON and proves that its
canonical metadata digest is the server-authorized evidence digest.
"""

import argparse
import asyncio
import base64
import hmac
import json
import os
import socket
import stat
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from supervisor.application.local_dogfood_attestation import (
    MAX_RECEIPT_REQUEST_BYTES, SCHEMA, ReceiptRejected, canonical_authorization_envelope_bytes, canonical_receipt_bytes,
    canonical_source_binding_digest, read_owner_private_secret,
)


def _canonical_source_digest(path: Path) -> str:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError("issuer observation file is invalid")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino) or opened.st_uid != os.geteuid() or opened.st_mode & 0o077:
            raise ValueError("issuer observation file changed")
        source = json.loads(os.read(fd, 64 * 1024).decode("utf-8"))
    finally:
        os.close(fd)
    if not isinstance(source, dict):
        raise ValueError("observation must be a JSON object")
    for field in ("sourceRefs", "evidenceRefs"):
        if not isinstance(source.get(field), list) or not all(isinstance(value, str) for value in source[field]):
            raise ValueError("observation references are invalid")
        source[field] = sorted(set(source[field]))
    return canonical_source_binding_digest(
        source.get("environment", ""),
        source.get("sourceRevision", ""),
        source["sourceRefs"],
        source["evidenceRefs"],
    )


def _receipt(envelope: dict, observation_path: Path, key: Ed25519PrivateKey) -> dict:
    if set(envelope) != {"authorizationId", "expiresAt", "receiptBindings"}:
        raise ValueError("invalid authorization envelope")
    bindings = envelope["receiptBindings"]
    if not isinstance(bindings, dict) or _canonical_source_digest(observation_path) != bindings.get("evidenceDigest"):
        raise ValueError("observation_binding_mismatch")
    now = datetime.now(timezone.utc)
    expiry = datetime.fromisoformat(envelope["expiresAt"].replace("Z", "+00:00"))
    receipt = {
        "schemaVersion": SCHEMA, "receiptId": f"receipt-{os.urandom(12).hex()}",
        "authorizationId": envelope["authorizationId"], "nonce": f"nonce-{os.urandom(12).hex()}",
        "issuedAt": now.isoformat().replace("+00:00", "Z"),
        "expiresAt": min(expiry, now + timedelta(seconds=60)).isoformat().replace("+00:00", "Z"),
        **bindings,
    }
    return {"receipt": receipt, "signatureB64": base64.b64encode(key.sign(canonical_receipt_bytes(receipt))).decode("ascii")}


def _read_secret(path: Path) -> bytes:
    try:
        return read_owner_private_secret(str(path))
    except ReceiptRejected as exc:
        raise ValueError("issuer envelope secret is invalid") from exc


async def _read_bounded_line(reader: asyncio.StreamReader) -> bytes:
    chunks = bytearray()
    while len(chunks) <= MAX_RECEIPT_REQUEST_BYTES:
        chunk = await reader.read(min(4096, MAX_RECEIPT_REQUEST_BYTES + 1 - len(chunks)))
        if not chunk:
            break
        chunks.extend(chunk)
        if b"\n" in chunk:
            line, _, _ = bytes(chunks).partition(b"\n")
            return line + b"\n"
    raise ValueError("invalid_receipt_request")


def _private_owner_directory(path: Path, label: str) -> None:
    """Reject symlinks, shared directories, and directories owned by others."""
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ValueError(f"{label} must be a real directory")
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError(f"{label} must be private and owner-controlled")


def _private_existing_file(path: Path, label: str) -> None:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ValueError(f"{label} must be a real file")
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError(f"{label} must be owner-readable only")


def _fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _consume_or_recover(consumed_dir: Path, authorization_id: str, response_factory) -> dict:
    """Atomically reserve and durably cache one response per authorization.

    A ``pending`` marker represents a crash after reservation but before a
    response was durable.  Retrying the authenticated identical envelope then
    completes that reservation.  A stored response is returned byte-for-byte,
    so a crash after daemon consumption cannot permanently lock the request or
    yield a second receipt.
    """
    if not authorization_id.startswith("local-auth-") or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in authorization_id):
        raise ValueError("invalid authorization envelope")
    _private_owner_directory(consumed_dir, "issuer consumed directory")
    marker = consumed_dir / authorization_id
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError as exc:
        _private_existing_file(marker, "issuer consumption marker")
        try:
            cached = json.loads(marker.read_text(encoding="utf-8"))
        except json.JSONDecodeError as read_exc:
            raise ValueError("issuer_consumption_state_invalid") from read_exc
        if isinstance(cached, dict) and cached.get("state") == "complete" and isinstance(cached.get("response"), dict):
            return cached["response"]
        if not isinstance(cached, dict) or cached.get("state") != "pending":
            raise ValueError("issuer_consumption_state_invalid") from exc
    else:
        with os.fdopen(fd, "w", encoding="ascii") as output:
            output.write('{"state":"pending"}')
            output.flush()
            os.fsync(output.fileno())
        _fsync_directory(consumed_dir)
    response = response_factory()
    temporary = consumed_dir / f".{authorization_id}.{os.urandom(8).hex()}.tmp"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump({"state": "complete", "response": response}, output, separators=(",", ":"))
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, marker)
    # A file fsync alone does not make its directory entry crash durable.
    _fsync_directory(consumed_dir)
    return response


def _authenticated_envelope(message: dict, secret: bytes) -> dict:
    if not isinstance(message, dict) or set(message) != {"action", "authorization"} or message["action"] != "observe":
        raise ValueError("unsupported_request")
    authorization = dict(message["authorization"]) if isinstance(message["authorization"], dict) else message["authorization"]
    if not isinstance(authorization, dict) or set(authorization) != {"authorizationId", "expiresAt", "receiptBindings", "macB64"}:
        raise ValueError("invalid_authorization_envelope")
    mac_b64 = authorization.pop("macB64")
    try:
        supplied = base64.b64decode(mac_b64, validate=True)
        expected = hmac.digest(secret, canonical_authorization_envelope_bytes(authorization), "sha256")
        expires = datetime.fromisoformat(authorization["expiresAt"].replace("Z", "+00:00"))
    except (ValueError, TypeError, ReceiptRejected) as exc:
        raise ValueError("invalid_authorization_envelope") from exc
    if not hmac.compare_digest(supplied, expected):
        raise ValueError("unauthenticated_authorization_envelope")
    if expires.tzinfo is None or expires.astimezone(timezone.utc) <= datetime.now(timezone.utc):
        raise ValueError("expired_authorization_envelope")
    return authorization


async def serve(socket_path: Path, observation_path: Path, private_key_path: Path, envelope_secret_path: Path, consumed_dir: Path) -> None:
    _private_owner_directory(socket_path.parent, "issuer socket parent")
    _private_owner_directory(consumed_dir, "issuer consumed directory")
    if socket_path.exists() or socket_path.is_symlink():
        raise ValueError("issuer socket path must not already exist")
    _private_existing_file(private_key_path, "issuer private key file")
    _private_existing_file(observation_path, "issuer observation file")
    key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_key_path.read_text(encoding="ascii").strip(), validate=True))
    secret = _read_secret(envelope_secret_path)

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            peer = writer.get_extra_info("socket")
            if not hasattr(socket, "SO_PEERCRED") or peer is None:
                raise ValueError("local_peer_credentials_unavailable")
            credentials = peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
            peer_uid = int.from_bytes(credentials[4:8], byteorder=sys.byteorder)
            if peer_uid != os.geteuid():
                raise ValueError("local_peer_identity_rejected")
            raw = await asyncio.wait_for(_read_bounded_line(reader), timeout=2)
            request = json.loads(raw.split(b"\n", 1)[0].decode("utf-8"))
            envelope = _authenticated_envelope(request, secret)
            response = _consume_or_recover(consumed_dir, envelope["authorizationId"], lambda: _receipt(envelope, observation_path, key))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError, asyncio.TimeoutError) as exc:
            response = {"error": str(exc)}
        writer.write(json.dumps(response, separators=(",", ":")).encode() + b"\n")
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    old_umask = os.umask(0o077)
    try:
        server = await asyncio.start_unix_server(handle, path=str(socket_path))
    finally:
        os.umask(old_umask)
    os.chmod(socket_path, 0o600)
    async with server:
        await server.serve_forever()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--observation-json", required=True)
    parser.add_argument("--private-key-file", required=True)
    parser.add_argument("--envelope-secret-file", required=True)
    parser.add_argument("--consumed-dir", required=True)
    args = parser.parse_args()
    asyncio.run(serve(Path(args.socket), Path(args.observation_json), Path(args.private_key_file), Path(args.envelope_secret_file), Path(args.consumed_dir)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
