import asyncio
import socket
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from argon2 import PasswordHasher
from argon2.low_level import Type
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine


def _reset_supervisor_modules():
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def test_bootstrap_file_rejects_unsafe_permission_and_never_echoes_path(tmp_path):
    from supervisor.application.lan_auth_bootstrap import LanAuthConfigurationError, read_private_bootstrap_password

    secret = tmp_path / "bootstrap"
    secret.write_text("correct horse battery staple\n", encoding="utf-8")
    secret.chmod(0o644)
    with pytest.raises(LanAuthConfigurationError) as error:
        read_private_bootstrap_password(str(secret))
    assert str(secret) not in str(error.value)


@pytest.mark.parametrize("value", [b"", b"\xff", b"x" * 4097, b"\n"])
def test_bootstrap_identity_rejects_empty_invalid_utf8_and_oversize(value):
    from supervisor.application.lan_auth_bootstrap import LanAuthConfigurationError, _validate_bootstrap_password

    with pytest.raises(LanAuthConfigurationError):
        _validate_bootstrap_password(value)


def test_private_uds_path_requires_private_absolute_parent(tmp_path):
    from supervisor.application.lan_auth_bootstrap import LanAuthConfigurationError, validate_private_uds_path

    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    assert validate_private_uds_path(str(private / "supervisor.sock")).name == "supervisor.sock"
    with pytest.raises(LanAuthConfigurationError):
        validate_private_uds_path("relative.sock")
    private.chmod(0o755)
    with pytest.raises(LanAuthConfigurationError):
        validate_private_uds_path(str(private / "supervisor.sock"))
    private.chmod(0o700)

    socket_private = Path(tempfile.mkdtemp(prefix="kuds-", dir="/tmp"))
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    socket_path = socket_private / "bound.sock"
    listener.bind(str(socket_path))
    try:
        assert validate_private_uds_path(str(socket_path), allow_existing_socket=True) == socket_path
        with pytest.raises(LanAuthConfigurationError):
            validate_private_uds_path(str(socket_path))
    finally:
        listener.close()
        socket_path.unlink(missing_ok=True)
        socket_private.rmdir()


def test_bootstrap_identity_creates_once_rotates_and_revokes_sessions(tmp_path, monkeypatch):
    db_path = tmp_path / "supervisor.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardOperator, DashboardSession

        await init_db()
        async with SessionLocal.begin() as session:
            first = await ensure_bootstrap_operator(session, b"first-password")
        assert first.created and not first.rotated
        async with SessionLocal.begin() as session:
            operator = (await session.execute(select(DashboardOperator))).scalar_one()
            assert operator.role == "operator"
            assert "first-password" not in operator.password_hash
            assert PasswordHasher().verify(operator.password_hash, "first-password")
            session.add(
                DashboardSession(
                    operator_id=operator.id,
                    token_hash="stale-token-hash",
                    csrf_token_hash="stale-csrf-hash",
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                )
            )
        async with SessionLocal.begin() as session:
            unchanged = await ensure_bootstrap_operator(session, b"first-password")
        assert not unchanged.created and not unchanged.rotated
        async with SessionLocal.begin() as session:
            rotated = await ensure_bootstrap_operator(session, b"next-password")
        assert not rotated.created and rotated.rotated
        async with SessionLocal() as session:
            operator = (await session.execute(select(DashboardOperator))).scalar_one()
            assert PasswordHasher().verify(operator.password_hash, "next-password")
            sessions = (await session.execute(select(DashboardSession))).scalars().all()
            assert len(sessions) == 1 and sessions[0].revoked_at is not None

    asyncio.run(run())


def test_bootstrap_rehashes_legacy_argon2i_to_argon2id(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardOperator

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"legacy-password")
            operator = (await session.execute(select(DashboardOperator))).scalar_one()
            operator.password_hash = PasswordHasher(type=Type.I).hash("legacy-password")
        async with SessionLocal.begin() as session:
            result = await ensure_bootstrap_operator(session, b"legacy-password")
            assert result.rotated
        async with SessionLocal() as session:
            operator = (await session.execute(select(DashboardOperator))).scalar_one()
            assert operator.password_hash.startswith("$argon2id$")

    asyncio.run(run())


def test_test_viewer_lifecycle_isolated_from_bootstrap_and_sessions(tmp_path, monkeypatch):
    db_path = tmp_path / "test-viewer.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import (
            enable_or_rotate_test_viewer,
            ensure_bootstrap_operator,
            revoke_test_viewer,
            test_viewer_status,
        )
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardOperator, DashboardSession

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"operator-password")
            operator = (await session.execute(select(DashboardOperator).where(DashboardOperator.role == "operator"))).scalar_one()
            session.add(DashboardSession(operator_id=operator.id, token_hash="operator-token", csrf_token_hash="operator-csrf", expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        async with SessionLocal.begin() as session:
            result = await enable_or_rotate_test_viewer(session, b"viewer-password", rotate=False)
            assert result.created and result.configured and result.enabled and not result.rotated
        async with SessionLocal.begin() as session:
            viewer = (await session.execute(select(DashboardOperator).where(DashboardOperator.role == "test_viewer"))).scalar_one()
            session.add(DashboardSession(operator_id=viewer.id, token_hash="viewer-token", csrf_token_hash="viewer-csrf", expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        async with SessionLocal.begin() as session:
            rotated = await enable_or_rotate_test_viewer(session, b"viewer-password-next", rotate=True)
            assert rotated.rotated and rotated.enabled
        async with SessionLocal() as session:
            sessions = (await session.execute(select(DashboardSession))).scalars().all()
            assert next(item for item in sessions if item.token_hash == "operator-token").revoked_at is None
            assert next(item for item in sessions if item.token_hash == "viewer-token").revoked_at is not None
        async with SessionLocal.begin() as session:
            revoked = await revoke_test_viewer(session)
            assert revoked.configured and not revoked.enabled
        async with SessionLocal.begin() as session:
            from supervisor.application.lan_auth_bootstrap import LanAuthConfigurationError

            with pytest.raises(LanAuthConfigurationError):
                await enable_or_rotate_test_viewer(session, b"viewer-password-after-revoke", rotate=True)
            enabled_again = await enable_or_rotate_test_viewer(session, b"viewer-password-after-revoke", rotate=False)
            assert enabled_again.configured and enabled_again.enabled and not enabled_again.rotated
        async with SessionLocal() as session:
            state = await test_viewer_status(session)
            operator = (await session.execute(select(DashboardOperator).where(DashboardOperator.role == "operator"))).scalar_one()
            assert state.configured and state.enabled and operator.enabled

    asyncio.run(run())


def test_legacy_dashboard_session_table_gets_auth_columns_and_unique_token_index(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-sessions.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", database_url)
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    async def run():
        legacy_engine = create_async_engine(database_url)
        async with legacy_engine.begin() as connection:
            await connection.execute(
                text(
                    "CREATE TABLE dashboard_sessions ("
                    "id VARCHAR(36) PRIMARY KEY, "
                    "operator_id VARCHAR(36) NOT NULL, "
                    "created_at DATETIME NOT NULL)"
                )
            )
        await legacy_engine.dispose()

        from supervisor.infrastructure.db.database import SessionLocal, engine, init_db

        await init_db()
        async with engine.connect() as connection:
            columns = {
                row[1]
                for row in (await connection.execute(text("PRAGMA table_info(dashboard_sessions)"))).fetchall()
            }
            assert {"token_hash", "csrf_token_hash", "last_seen_at", "expires_at", "revoked_at"} <= columns
            indexes = (await connection.execute(text("PRAGMA index_list(dashboard_sessions)"))).fetchall()
            unique_token_indexes = [row[1] for row in indexes if row[2]]
            assert "uq_dashboard_sessions_token_hash" in unique_token_indexes
            index_columns = (
                await connection.execute(
                    text("PRAGMA index_info(uq_dashboard_sessions_token_hash)")
                )
            ).fetchall()
            assert [row[2] for row in index_columns] == ["token_hash"]

        await engine.dispose()
        # Keep SessionLocal referenced so module initialization is exercised.
        assert SessionLocal is not None

    asyncio.run(run())


def test_legacy_operator_table_preserves_bootstrap_enabled_state(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-operators.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", database_url)
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    async def run():
        legacy_engine = create_async_engine(database_url)
        async with legacy_engine.begin() as connection:
            await connection.execute(text("CREATE TABLE dashboard_operators (id VARCHAR(36) PRIMARY KEY, role VARCHAR(32) UNIQUE, password_hash TEXT, password_policy_version VARCHAR(32), created_at DATETIME, updated_at DATETIME)"))
            await connection.execute(text("INSERT INTO dashboard_operators (id, role, password_hash) VALUES ('legacy-operator', 'operator', 'hash')"))
        await legacy_engine.dispose()
        from supervisor.infrastructure.db.database import SessionLocal, engine, init_db
        from supervisor.infrastructure.db.models import DashboardOperator
        await init_db()
        async with SessionLocal() as session:
            operator = await session.get(DashboardOperator, "legacy-operator")
            assert operator is not None and operator.enabled is True
        await engine.dispose()

    asyncio.run(run())


def test_concurrent_first_bootstrap_keeps_one_operator(tmp_path, monkeypatch):
    db_path = tmp_path / "race.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardOperator

        await init_db()

        async def bootstrap():
            async with SessionLocal.begin() as session:
                return await ensure_bootstrap_operator(session, b"race-password")

        results = await asyncio.gather(bootstrap(), bootstrap())
        assert all(result.created or not result.rotated for result in results)
        async with SessionLocal() as session:
            assert len((await session.execute(select(DashboardOperator))).scalars().all()) == 1

    asyncio.run(run())


def test_lan_auth_lifespan_rejects_direct_uvicorn_transport(tmp_path, monkeypatch):
    db_path = tmp_path / "lifespan.db"
    secret = tmp_path / "bootstrap"
    secret.write_text("bootstrap-password\n", encoding="utf-8")
    secret.chmod(0o600)
    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE", str(secret))
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(private / "supervisor.sock"))
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "loopback")
    _reset_supervisor_modules()
    from supervisor.api.main import app, lifespan
    from supervisor.application.lan_auth_bootstrap import LanAuthConfigurationError

    async def run():
        with pytest.raises(LanAuthConfigurationError):
            async with lifespan(app):
                pass

    asyncio.run(run())


def test_lan_auth_lifespan_accepts_private_bootstrap_and_uds(tmp_path, monkeypatch):
    db_path = tmp_path / "valid-lan.db"
    secret = tmp_path / "bootstrap"
    secret.write_text("valid-bootstrap-password\n", encoding="utf-8")
    secret.chmod(0o600)
    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    socket_private = Path(tempfile.mkdtemp(prefix="kuds-", dir="/tmp"))
    socket_path = socket_private / "supervisor.sock"
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(str(socket_path))
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE", str(secret))
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(socket_path))
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    _reset_supervisor_modules()
    from supervisor.api import main
    from supervisor.infrastructure.db.database import SessionLocal
    from supervisor.infrastructure.db.models import DashboardOperator

    async def run():
        async with main.lifespan(main.app):
            assert main.startup_gate_ready is True
            async with SessionLocal() as session:
                operator = (await session.execute(select(DashboardOperator))).scalar_one()
                assert operator.role == "operator"
                assert "valid-bootstrap-password" not in operator.password_hash
        assert main.startup_gate_ready is False

    try:
        asyncio.run(run())
    finally:
        listener.close()
        socket_path.unlink(missing_ok=True)
        socket_private.rmdir()


def test_lan_auth_rejects_all_tcp_and_allows_uds_shaped_request(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(private / "supervisor.sock"))
    _reset_supervisor_modules()
    from supervisor.api import main

    async def invoke(client):
        messages = []
        request_complete = False

        async def receive():
            nonlocal request_complete
            if request_complete:
                return {"type": "http.disconnect"}
            request_complete = True
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            messages.append(message)

        await main.app(
            {
                "type": "http",
                "asgi": {"version": "3.0", "spec_version": "2.3"},
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/health",
                "raw_path": b"/health",
                "query_string": b"",
                "headers": [],
                "client": client,
                "server": None,
            },
            receive,
            send,
        )
        return next(message["status"] for message in messages if message["type"] == "http.response.start")

    async def run():
        assert await invoke(("192.0.2.10", 50000)) == 503
        assert await invoke(("127.0.0.1", 50000)) == 503
        assert await invoke(None) == 200

    asyncio.run(run())


def test_supervisor_main_is_loopback_or_private_uds_only(tmp_path, monkeypatch):
    private = tmp_path / "supervisor-private"
    private.mkdir()
    private.chmod(0o700)
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(private / "supervisor.sock"))
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.api import main

    captured = {}
    monkeypatch.setattr(main.uvicorn, "run", lambda _app, **kwargs: captured.update(kwargs))
    main.main()
    assert captured["host"] == "127.0.0.1"
    assert captured["uds"] == str(private / "supervisor.sock")
