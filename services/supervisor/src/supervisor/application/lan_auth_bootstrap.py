"""Durable, supervisor-owned bootstrap identity primitives for LAN auth.

This module deliberately owns no HTTP handlers. Story 26.1 establishes the
credential boundary only; session and login behaviour are added in later
stories.
"""

from __future__ import annotations

import os
import socket
import stat
import asyncio
from dataclasses import dataclass
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from argon2.low_level import Type
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.infrastructure.db.models import DashboardAuditEvent, DashboardOperator, DashboardSession, utcnow


class LanAuthConfigurationError(ValueError):
    """A safe-to-display configuration error with no secret/path disclosure."""


PASSWORD_HASHER = PasswordHasher(type=Type.ID)


@dataclass(frozen=True)
class BootstrapIdentityResult:
    created: bool
    rotated: bool


@dataclass(frozen=True)
class TestViewerIdentityResult:
    created: bool
    rotated: bool
    enabled: bool
    configured: bool


MAX_BOOTSTRAP_PASSWORD_BYTES = 4096
TEST_VIEWER_ROLE = "test_viewer"
# One supervisor process owns both fixed-viewer login and lifecycle writes.
# Holding this lock through the session commit prevents a pre-rotation password
# verification from committing a new viewer session after rotation revokes it.
TEST_VIEWER_AUTH_LIFECYCLE_LOCK = asyncio.Lock()


def _validate_bootstrap_password(password: bytes) -> bytes:
    if not isinstance(password, bytes) or not password or len(password) > MAX_BOOTSTRAP_PASSWORD_BYTES:
        raise LanAuthConfigurationError("LAN auth bootstrap password is invalid.")
    password = password.rstrip(b"\r\n")
    if not password:
        raise LanAuthConfigurationError("LAN auth bootstrap password is invalid.")
    try:
        password.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise LanAuthConfigurationError("LAN auth bootstrap password is invalid.") from exc
    return password


def validate_private_uds_path(path_value: str, *, allow_existing_socket: bool = False) -> Path:
    """Validate the private supervisor socket location before Uvicorn binds."""

    path = Path(path_value)
    if not path.is_absolute() or path == Path("/"):
        raise LanAuthConfigurationError("LAN auth supervisor socket path is invalid.")
    current = path.parent
    ancestors: list[Path] = []
    while True:
        ancestors.append(current)
        if current == current.parent:
            break
        current = current.parent
    for ancestor in ancestors:
        try:
            details = ancestor.lstat()
        except OSError as exc:
            raise LanAuthConfigurationError("LAN auth supervisor socket directory is unavailable or unsafe.") from exc
        sticky_shared_temp = bool(details.st_mode & stat.S_ISVTX) and details.st_mode & 0o022 == 0o022 and ancestor != path.parent
        if stat.S_ISLNK(details.st_mode) or not stat.S_ISDIR(details.st_mode) or (details.st_mode & 0o022 and not sticky_shared_temp):
            raise LanAuthConfigurationError("LAN auth supervisor socket directory is unsafe.")
    try:
        parent_details = path.parent.lstat()
    except OSError as exc:
        raise LanAuthConfigurationError("LAN auth supervisor socket directory is unavailable or unsafe.") from exc
    if parent_details.st_uid != os.geteuid() or parent_details.st_mode & 0o077:
        raise LanAuthConfigurationError("LAN auth supervisor socket directory is unsafe.")
    if path.exists() or path.is_symlink():
        if not allow_existing_socket:
            raise LanAuthConfigurationError("LAN auth supervisor socket path is already in use.")
        try:
            socket_details = path.lstat()
        except OSError as exc:
            raise LanAuthConfigurationError("LAN auth supervisor socket path is unavailable or unsafe.") from exc
        if stat.S_ISLNK(socket_details.st_mode) or not stat.S_ISSOCK(socket_details.st_mode) or socket_details.st_uid != os.geteuid():
            raise LanAuthConfigurationError("LAN auth supervisor socket path is unsafe.")
    return path


def prepare_private_uds_path(path_value: str) -> Path:
    """Validate and remove only an owned, unbound stale socket before bind."""

    path = validate_private_uds_path(path_value, allow_existing_socket=True)
    if not path.exists():
        return path
    probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        probe.settimeout(0.2)
        probe.connect(str(path))
    except (ConnectionRefusedError, FileNotFoundError, NotADirectoryError, socket.timeout):
        try:
            path.unlink()
        except OSError as exc:
            raise LanAuthConfigurationError("LAN auth supervisor socket path is unavailable or unsafe.") from exc
    else:
        raise LanAuthConfigurationError("LAN auth supervisor socket path is already in use.")
    finally:
        probe.close()
    return path


def _assert_private_regular_file(path: Path) -> None:
    """Validate a secret file without following links or exposing its path."""

    try:
        parent_stat = path.parent.stat()
        link_stat = path.lstat()
    except OSError as exc:
        raise LanAuthConfigurationError("LAN auth private file is unavailable or unsafe.") from exc
    current = path.parent
    while True:
        try:
            ancestor_stat = current.lstat()
        except OSError as exc:
            raise LanAuthConfigurationError("LAN auth private file parent is unsafe.") from exc
        sticky_shared_temp = bool(ancestor_stat.st_mode & stat.S_ISVTX) and ancestor_stat.st_mode & 0o022 == 0o022 and current != path.parent
        if stat.S_ISLNK(ancestor_stat.st_mode) or not stat.S_ISDIR(ancestor_stat.st_mode) or (ancestor_stat.st_mode & 0o022 and not sticky_shared_temp):
            raise LanAuthConfigurationError("LAN auth private file parent is unsafe.")
        if current == current.parent:
            break
        current = current.parent
    if not stat.S_ISDIR(parent_stat.st_mode) or parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o077:
        raise LanAuthConfigurationError("LAN auth private file parent is unsafe.")
    if stat.S_ISLNK(link_stat.st_mode) or not stat.S_ISREG(link_stat.st_mode):
        raise LanAuthConfigurationError("LAN auth private file must be a regular file.")
    if link_stat.st_uid != os.geteuid() or link_stat.st_mode & 0o077:
        raise LanAuthConfigurationError("LAN auth private file ownership or permissions are unsafe.")


def read_private_bootstrap_password(path_value: str) -> bytes:
    """Read a UTF-8 bootstrap password with no-follow and TOCTOU checks."""

    path = Path(path_value)
    _assert_private_regular_file(path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd)
            linked = path.lstat()
            if (opened.st_dev, opened.st_ino) != (linked.st_dev, linked.st_ino):
                raise LanAuthConfigurationError("LAN auth private file changed while being read.")
            if not stat.S_ISREG(opened.st_mode) or opened.st_uid != os.geteuid() or opened.st_mode & 0o077:
                raise LanAuthConfigurationError("LAN auth private file ownership or permissions are unsafe.")
            content = os.read(fd, MAX_BOOTSTRAP_PASSWORD_BYTES + 1)
        finally:
            os.close(fd)
    except LanAuthConfigurationError:
        raise
    except OSError as exc:
        raise LanAuthConfigurationError("LAN auth private file is unavailable or unsafe.") from exc
    return _validate_bootstrap_password(content.rstrip(b"\r\n"))


async def ensure_bootstrap_operator(session: AsyncSession, bootstrap_password: bytes) -> BootstrapIdentityResult:
    """Create or rotate the sole operator and revoke sessions in one transaction."""

    password = _validate_bootstrap_password(bootstrap_password).decode("utf-8")
    record = (await session.execute(select(DashboardOperator).where(DashboardOperator.role == "operator"))).scalar_one_or_none()
    if record is None:
        try:
            async with session.begin_nested():
                session.add(
                    DashboardOperator(
                        role="operator",
                        password_hash=PASSWORD_HASHER.hash(password),
                        password_policy_version="argon2id/v1",
                        enabled=True,
                    )
                )
                await session.flush()
        except IntegrityError:
            # Another supervisor won the unique operator insert race. Do not
            # overwrite its credential during this startup attempt.
            return BootstrapIdentityResult(created=False, rotated=False)
        return BootstrapIdentityResult(created=True, rotated=False)
    try:
        unchanged = PASSWORD_HASHER.verify(record.password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        unchanged = False
    if unchanged:
        if PASSWORD_HASHER.check_needs_rehash(record.password_hash):
            record.password_hash = PASSWORD_HASHER.hash(password)
            await _revoke_operator_sessions(session, record.id, "password_rehash")
            await session.flush()
            return BootstrapIdentityResult(created=False, rotated=True)
        return BootstrapIdentityResult(created=False, rotated=False)
    record.password_hash = PASSWORD_HASHER.hash(password)
    record.password_policy_version = "argon2id/v1"
    await _revoke_operator_sessions(session, record.id, "password_rotation")
    await session.flush()
    return BootstrapIdentityResult(created=False, rotated=True)


async def _revoke_operator_sessions(session: AsyncSession, operator_id: str, outcome: str) -> None:
    sessions = list((await session.execute(select(DashboardSession).where(DashboardSession.operator_id == operator_id, DashboardSession.revoked_at.is_(None)))).scalars())
    current = utcnow()
    for stored in sessions:
        stored.revoked_at = current
    if sessions:
        session.add(DashboardAuditEvent(event_type="session_revoked", outcome=outcome, policy_version="epic-26-auth/v1"))


async def _revoke_principal_sessions(session: AsyncSession, principal_id: str, outcome: str) -> int:
    """Revoke only one fixed principal's sessions; never touch bootstrap sessions."""

    sessions = list(
        (
            await session.execute(
                select(DashboardSession).where(
                    DashboardSession.operator_id == principal_id,
                    DashboardSession.revoked_at.is_(None),
                )
            )
        ).scalars()
    )
    current = utcnow()
    for stored in sessions:
        stored.revoked_at = current
    if sessions:
        session.add(
            DashboardAuditEvent(
                event_type="session_revoked",
                outcome=outcome,
                target_ref=TEST_VIEWER_ROLE,
                policy_version="epic-26-auth/v1",
            )
        )
    return len(sessions)


async def test_viewer_status(session: AsyncSession) -> TestViewerIdentityResult:
    record = (
        await session.execute(
            select(DashboardOperator).where(DashboardOperator.role == TEST_VIEWER_ROLE)
        )
    ).scalar_one_or_none()
    return TestViewerIdentityResult(created=False, rotated=False, enabled=bool(record and record.enabled), configured=record is not None)


async def enable_or_rotate_test_viewer(
    session: AsyncSession,
    password: bytes,
    *,
    rotate: bool,
) -> TestViewerIdentityResult:
    """Create/enable the one viewer or rotate it without changing operator state."""

    secret = _validate_bootstrap_password(password).decode("utf-8")
    record = (
        await session.execute(
            select(DashboardOperator).where(DashboardOperator.role == TEST_VIEWER_ROLE)
        )
    ).scalar_one_or_none()
    if record is None:
        if rotate:
            raise LanAuthConfigurationError("Test viewer lifecycle request was not accepted.")
        record = DashboardOperator(
            role=TEST_VIEWER_ROLE,
            password_hash=PASSWORD_HASHER.hash(secret),
            password_policy_version="argon2id/v1",
            enabled=True,
        )
        session.add(record)
        await session.flush()
        session.add(
            DashboardAuditEvent(
                event_type="test_viewer_enabled",
                outcome="allowed",
                target_ref=TEST_VIEWER_ROLE,
                policy_version="epic-26-auth/v1",
            )
        )
        return TestViewerIdentityResult(created=True, rotated=False, enabled=True, configured=True)

    if rotate and not record.enabled:
        # Rotation only replaces the active verification secret. It must never
        # recreate or re-enable a principal that an explicit revoke disabled.
        raise LanAuthConfigurationError("Test viewer lifecycle request was not accepted.")

    if record.enabled and not rotate:
        # A caller must use explicit rotation to replace an active verifier.
        # This prevents a locally generated helper secret from being written
        # over the known-good file without changing the server verifier.
        raise LanAuthConfigurationError("Test viewer lifecycle request was not accepted.")

    # Enabling a disabled viewer always replaces the verifier so a stale local
    # file cannot silently regain access. A verified active rotation does too.
    record.password_hash = PASSWORD_HASHER.hash(secret)
    record.password_policy_version = "argon2id/v1"
    await _revoke_principal_sessions(
        session,
        record.id,
        "test_viewer_rotation" if rotate else "test_viewer_enable",
    )
    record.enabled = True
    session.add(
        DashboardAuditEvent(
            event_type="test_viewer_rotated" if rotate else "test_viewer_enabled",
            outcome="allowed",
            target_ref=TEST_VIEWER_ROLE,
            policy_version="epic-26-auth/v1",
        )
    )
    await session.flush()
    return TestViewerIdentityResult(created=False, rotated=rotate, enabled=True, configured=True)


async def revoke_test_viewer(session: AsyncSession) -> TestViewerIdentityResult:
    """Disable the fixed viewer and revoke only its sessions; idempotent by design."""

    record = (
        await session.execute(
            select(DashboardOperator).where(DashboardOperator.role == TEST_VIEWER_ROLE)
        )
    ).scalar_one_or_none()
    if record is None:
        session.add(
            DashboardAuditEvent(
                event_type="test_viewer_revoked",
                outcome="allowed",
                target_ref=TEST_VIEWER_ROLE,
                policy_version="epic-26-auth/v1",
            )
        )
        return TestViewerIdentityResult(created=False, rotated=False, enabled=False, configured=False)
    record.enabled = False
    await _revoke_principal_sessions(session, record.id, "test_viewer_revoked")
    session.add(
        DashboardAuditEvent(
            event_type="test_viewer_revoked",
            outcome="allowed",
            target_ref=TEST_VIEWER_ROLE,
            policy_version="epic-26-auth/v1",
        )
    )
    await session.flush()
    return TestViewerIdentityResult(created=False, rotated=False, enabled=False, configured=True)
