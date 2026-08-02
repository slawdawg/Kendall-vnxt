"""Supervisor-owned operator authentication primitives for Story 26.2."""

from __future__ import annotations

import hashlib
import hmac
import asyncio
import secrets
from datetime import datetime, timedelta, timezone

from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import case, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.lan_auth_bootstrap import PASSWORD_HASHER, TEST_VIEWER_AUTH_LIFECYCLE_LOCK
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.models import (
    DashboardAuditEvent,
    DashboardLoginRateLimit,
    DashboardLoginCsrfChallenge,
    DashboardOperator,
    DashboardSession,
)


SESSION_IDLE_SECONDS = 30 * 60
SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60
RATE_WINDOW_SECONDS = 15 * 60
RATE_LOCK_SECONDS = 15 * 60
RATE_FAILURE_LIMIT = 5
LOGIN_CSRF_SECONDS = 5 * 60
SESSION_COOKIE_NAME = "kendall_operator_session"
GENERIC_LOGIN_FAILURE = "Sign-in unavailable. Check credentials or try again later."
AUTH_POLICY_VERSION = "epic-26-auth/v1"
_RATE_LIMIT_LOCK = asyncio.Lock()
OPERATOR_ROLE = "operator"
TEST_VIEWER_ROLE = "test_viewer"
DASHBOARD_ROLES = frozenset((OPERATOR_ROLE, TEST_VIEWER_ROLE))
# This non-secret verifier keeps invalid/disabled account attempts on the
# Argon2id path too. It prevents the fixed account selector from becoming an
# account-state timing oracle.
_INVALID_ACCOUNT_PASSWORD_HASH = PASSWORD_HASHER.hash("kendall-invalid-dashboard-account-v1")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def digest_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def exact_https_origin(origin: str | None, settings: Settings) -> bool:
    return bool(
        origin
        and origin.startswith("https://")
        and (origin in settings.cors_origin_list or settings.cors_origin_pattern.fullmatch(origin))
    )


def _audit(session: AsyncSession, event_type: str, outcome: str, *, target_ref: str | None = None) -> None:
    session.add(
        DashboardAuditEvent(
            event_type=event_type,
            outcome=outcome,
            target_ref=target_ref,
            policy_version=AUTH_POLICY_VERSION,
        )
    )


async def record_auth_audit(
    session: AsyncSession,
    event_type: str,
    outcome: str,
    *,
    target_ref: str | None = None,
) -> None:
    _audit(session, event_type, outcome, target_ref=target_ref)
    await session.commit()


async def create_login_csrf_challenge(session: AsyncSession) -> str:
    await session.execute(
        delete(DashboardLoginCsrfChallenge).where(
            DashboardLoginCsrfChallenge.expires_at <= now_utc()
        )
    )
    raw_token = secrets.token_urlsafe(32)
    session.add(
        DashboardLoginCsrfChallenge(
            token_hash=digest_secret(raw_token),
            expires_at=now_utc() + timedelta(seconds=LOGIN_CSRF_SECONDS),
        )
    )
    await session.commit()
    return raw_token


async def consume_login_csrf_challenge(session: AsyncSession, raw_token: str | None) -> bool:
    if not raw_token:
        return False
    current = now_utc()
    result = await session.execute(
        delete(DashboardLoginCsrfChallenge).where(
            DashboardLoginCsrfChallenge.token_hash == digest_secret(raw_token),
            DashboardLoginCsrfChallenge.expires_at > current,
        )
    )
    if result.rowcount != 1:
        await session.rollback()
        return False
    await session.commit()
    return True


async def revoke_all_sessions(session: AsyncSession, *, outcome: str = "revoked") -> int:
    current = now_utc()
    result = await session.execute(
        select(DashboardSession).where(DashboardSession.revoked_at.is_(None))
    )
    sessions = list(result.scalars())
    for stored in sessions:
        stored.revoked_at = current
    if sessions:
        _audit(session, "session_revoked", outcome)
    await session.flush()
    return len(sessions)


async def _is_rate_limited(session: AsyncSession, keys: list[str], current: datetime) -> bool:
    limited = False
    for key in keys:
        record = (
            await session.execute(
                select(DashboardLoginRateLimit).where(
                    DashboardLoginRateLimit.dimension_key == key
                )
            )
        ).scalar_one_or_none()
        if record is not None and record.locked_until and _aware(record.locked_until) > current:
            limited = True
    return limited


async def _record_failed_login(session: AsyncSession, keys: list[str], current: datetime) -> bool:
    locked = False
    for key in keys:
        cutoff = current - timedelta(seconds=RATE_WINDOW_SECONDS)
        lock_until = current + timedelta(seconds=RATE_LOCK_SECONDS)
        reset_window = DashboardLoginRateLimit.window_started_at <= cutoff
        next_count = case(
            (reset_window, 1),
            else_=DashboardLoginRateLimit.failure_count + 1,
        )
        next_lock = case(
            (next_count >= RATE_FAILURE_LIMIT, lock_until),
            else_=None,
        )
        values = {
            "dimension_key": key,
            "failure_count": 1,
            "window_started_at": current,
            "locked_until": None,
            "updated_at": current,
        }
        if session.bind and session.bind.dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as dialect_insert
        else:
            from sqlalchemy.dialects.sqlite import insert as dialect_insert
        statement = dialect_insert(DashboardLoginRateLimit).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=[DashboardLoginRateLimit.dimension_key],
            set_={
                "failure_count": next_count,
                "window_started_at": case(
                    (reset_window, current),
                    else_=DashboardLoginRateLimit.window_started_at,
                ),
                "locked_until": next_lock,
                "updated_at": current,
            },
        )
        await session.execute(statement)
        record = (
            await session.execute(
                select(DashboardLoginRateLimit).where(
                    DashboardLoginRateLimit.dimension_key == key
                )
            )
        ).scalar_one()
        if record.locked_until and _aware(record.locked_until) > current:
            locked = True
    return locked


def normalize_dashboard_account(value: object) -> str | None:
    return value if isinstance(value, str) and value in DASHBOARD_ROLES else None


def can_dashboard_read(role: str | None) -> bool:
    return role in DASHBOARD_ROLES


async def _authenticate_dashboard_account(
    session: AsyncSession,
    password: str,
    source_key: str,
    settings: Settings,
    account: object = OPERATOR_ROLE,
) -> tuple[bool, str | None, str]:
    """Authenticate one fixed principal and create an opaque session."""

    current = now_utc()
    selected_account = normalize_dashboard_account(account)
    # Invalid selectors intentionally share a bounded synthetic dimension and
    # the same generic response; they never query a principal by attacker text.
    rate_account = selected_account or "invalid"
    keys = [f"ip:{source_key}", f"account:{rate_account}"]
    if await _is_rate_limited(session, keys, current):
        _audit(session, "login_rate_limit", "denied")
        await session.commit()
        return False, None, GENERIC_LOGIN_FAILURE

    operator = None
    if selected_account is not None:
        operator = (
            await session.execute(
                select(DashboardOperator).where(DashboardOperator.role == selected_account)
            )
        ).scalar_one_or_none()
    enabled = bool(operator and (operator.role == OPERATOR_ROLE or operator.enabled))
    verifier = operator.password_hash if enabled else _INVALID_ACCOUNT_PASSWORD_HASH
    try:
        valid = settings.lan_auth_enabled and selected_account is not None and enabled and bool(PASSWORD_HASHER.verify(verifier, password))
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        valid = False
    if not valid:
        locked = await _record_failed_login(session, keys, current)
        _audit(session, "login_failure", "rate_limited" if locked else "denied")
        await session.commit()
        return False, None, GENERIC_LOGIN_FAILURE

    for key in keys:
        record = (
            await session.execute(
                select(DashboardLoginRateLimit).where(
                    DashboardLoginRateLimit.dimension_key == key
                )
            )
        ).scalar_one_or_none()
        if record is not None:
            record.failure_count = 0
            record.locked_until = None
    raw_token = secrets.token_urlsafe(32)
    raw_csrf = secrets.token_urlsafe(32)
    session.add(
        DashboardSession(
            operator_id=operator.id,
            token_hash=digest_secret(raw_token),
            csrf_token_hash=digest_secret(raw_csrf),
            created_at=current,
            last_seen_at=current,
            expires_at=current + timedelta(seconds=SESSION_ABSOLUTE_SECONDS),
        )
    )
    _audit(session, "login_success", "allowed", target_ref=selected_account)
    await session.commit()
    return True, raw_token, raw_csrf


async def authenticate_operator(
    session: AsyncSession,
    password: str,
    source_key: str,
    settings: Settings,
) -> tuple[bool, str | None, str]:
    """Compatibility wrapper for the fixed bootstrap `operator` principal."""

    async with _RATE_LIMIT_LOCK:
        return await _authenticate_dashboard_account(session, password, source_key, settings, OPERATOR_ROLE)


async def authenticate_dashboard_account(
    session: AsyncSession,
    password: str,
    source_key: str,
    settings: Settings,
    account: object,
) -> tuple[bool, str | None, str]:
    """Serialize role-scoped rate limit state for one of two fixed accounts."""

    # Viewer verification and session creation share the lifecycle lock with
    # enable/rotate/revoke. This makes rotation's session revocation atomic
    # relative to an old-password login through its committing session write.
    if normalize_dashboard_account(account) == TEST_VIEWER_ROLE:
        async with TEST_VIEWER_AUTH_LIFECYCLE_LOCK:
            async with _RATE_LIMIT_LOCK:
                return await _authenticate_dashboard_account(session, password, source_key, settings, account)
    async with _RATE_LIMIT_LOCK:
        return await _authenticate_dashboard_account(session, password, source_key, settings, account)


async def load_valid_session(session: AsyncSession, raw_token: str | None) -> tuple[DashboardSession | None, str | None]:
    if not raw_token:
        return None, "missing"
    stored = (await session.execute(select(DashboardSession).where(DashboardSession.token_hash == digest_secret(raw_token)))).scalar_one_or_none()
    if stored is None or stored.revoked_at is not None:
        return None, "revoked"
    principal = await session.get(DashboardOperator, stored.operator_id)
    if principal is None or principal.role not in DASHBOARD_ROLES or (principal.role == TEST_VIEWER_ROLE and not principal.enabled):
        stored.revoked_at = now_utc()
        _audit(session, "session_revoked", "principal_disabled", target_ref=TEST_VIEWER_ROLE if principal and principal.role == TEST_VIEWER_ROLE else None)
        await session.commit()
        return None, "revoked"
    current = now_utc()
    if current >= _aware(stored.expires_at) or current - _aware(stored.last_seen_at) >= timedelta(seconds=SESSION_IDLE_SECONDS):
        stored.revoked_at = current
        _audit(session, "session_expired", "denied")
        await session.commit()
        return None, "expired"
    stored.last_seen_at = current
    await session.commit()
    return stored, None


async def logout_session(session: AsyncSession, raw_token: str | None, raw_csrf: str | None) -> bool:
    if not raw_token or not raw_csrf:
        return False
    stored = (await session.execute(select(DashboardSession).where(DashboardSession.token_hash == digest_secret(raw_token)))).scalar_one_or_none()
    if stored is None or stored.revoked_at is not None:
        return False
    if not hmac.compare_digest(stored.csrf_token_hash, digest_secret(raw_csrf)):
        return False
    stored.revoked_at = now_utc()
    _audit(session, "logout", "allowed")
    await session.commit()
    return True
