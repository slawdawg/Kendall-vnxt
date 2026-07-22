import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from types import SimpleNamespace

import pytest
from sqlalchemy import select


def _reset_supervisor_modules():
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


async def _asgi_request(app, method, path, *, body=None, headers=None, cookie=None):
    payload = json.dumps(body).encode("utf-8") if body is not None else b""
    request_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    if cookie:
        request_headers.append((b"cookie", cookie.encode()))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": request_headers,
        "client": None,
        "server": None,
    }
    messages = []
    received = False

    async def receive():
        nonlocal received
        if received:
            return {"type": "http.disconnect"}
        received = True
        return {"type": "http.request", "body": payload, "more_body": False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    start = next(message for message in messages if message["type"] == "http.response.start")
    chunks = [message.get("body", b"") for message in messages if message["type"] == "http.response.body"]
    return start["status"], dict(start["headers"]), b"".join(chunks)


def _cookie_value(headers, name):
    cookie = SimpleCookie()
    cookie.load(headers.get(b"set-cookie", b"").decode())
    return cookie[name].value if name in cookie else None


def test_login_logout_cookie_csrf_origin_and_redacted_audit(tmp_path, monkeypatch):
    db_path = tmp_path / "auth.db"
    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(private / "supervisor.sock"))
    monkeypatch.setenv("SUPERVISOR_CORS_ORIGINS", "https://dashboard.test")
    _reset_supervisor_modules()

    async def run():
        from supervisor.api import main
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardAuditEvent, DashboardSession

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"operator-password")
        origin = {"origin": "https://dashboard.test", "content-type": "application/json"}
        status, challenge_headers, challenge_body = await _asgi_request(main.app, "GET", "/auth/login-csrf", headers=origin)
        assert status == 200
        assert challenge_headers.get(b"cache-control") == b"no-store"
        login_csrf = json.loads(challenge_body)["csrfToken"]
        status, headers, body = await _asgi_request(main.app, "POST", "/auth/login", body={"password": "operator-password"}, headers={**origin, "x-csrf-token": login_csrf})
        assert status == 200
        assert headers.get(b"cache-control") == b"no-store"
        session_cookie = _cookie_value(headers, "kendall_operator_session")
        assert session_cookie
        cookie_header = f"kendall_operator_session={session_cookie}"
        cookie_text = headers[b"set-cookie"].decode().lower()
        assert "secure" in cookie_text and "httponly" in cookie_text and "samesite=strict" in cookie_text
        csrf = json.loads(body)["csrfToken"]
        async with SessionLocal() as session:
            stored = (await session.execute(select(DashboardSession))).scalar_one()
            assert session_cookie not in stored.token_hash
            assert csrf not in stored.csrf_token_hash

        status, _, _ = await _asgi_request(main.app, "POST", "/auth/logout", headers=origin, cookie=cookie_header)
        assert status == 403
        status, _, _ = await _asgi_request(main.app, "POST", "/auth/logout", headers={**origin, "x-csrf-token": csrf}, cookie=cookie_header)
        assert status == 200
        status, _, _ = await _asgi_request(main.app, "GET", "/auth/session", headers={"origin": "https://dashboard.test"}, cookie=cookie_header)
        assert status == 401
        status, _, _ = await _asgi_request(main.app, "POST", "/auth/login", body={"password": "operator-password"}, headers={**origin, "origin": "http://dashboard.test"})
        assert status == 403

        async with SessionLocal() as session:
            events = (await session.execute(select(DashboardAuditEvent))).scalars().all()
            assert events
            serialized = " ".join(f"{event.event_type} {event.outcome} {event.correlation_id}" for event in events)
            assert "operator-password" not in serialized and session_cookie not in serialized and csrf not in serialized

    asyncio.run(run())


def test_login_failures_are_generic_and_rate_limited_by_both_dimensions(tmp_path, monkeypatch):
    db_path = tmp_path / "rate.db"
    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(private / "supervisor.sock"))
    monkeypatch.setenv("SUPERVISOR_CORS_ORIGINS", "https://dashboard.test")
    _reset_supervisor_modules()

    async def run():
        from supervisor.api import main
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardAuditEvent

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"operator-password")
        headers = {"origin": "https://dashboard.test", "content-type": "application/json"}
        bodies = []
        statuses = []
        for _ in range(6):
            _, _, challenge_body = await _asgi_request(main.app, "GET", "/auth/login-csrf", headers=headers)
            challenge = json.loads(challenge_body)["csrfToken"]
            status, _, body = await _asgi_request(main.app, "POST", "/auth/login", body={"password": "wrong-password"}, headers={**headers, "x-csrf-token": challenge})
            statuses.append(status)
            bodies.append(body)
        assert statuses == [401] * 6
        assert len(set(bodies)) == 1
        async with SessionLocal() as session:
            events = (await session.execute(select(DashboardAuditEvent))).scalars().all()
            assert any(event.event_type == "login_rate_limit" for event in events)

    asyncio.run(run())


def test_session_idle_and_absolute_expiry_revoke_before_access(tmp_path, monkeypatch):
    db_path = tmp_path / "expiry.db"
    private = tmp_path / "private"
    private.mkdir()
    private.chmod(0o700)
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("KENDALL_SUPERVISOR_UDS_PATH", str(private / "supervisor.sock"))
    monkeypatch.setenv("SUPERVISOR_CORS_ORIGINS", "https://dashboard.test")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.application.operator_auth import authenticate_operator, load_valid_session
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardSession
        from supervisor.config.settings import get_settings

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"operator-password")
        async with SessionLocal.begin() as session:
            success, token, csrf = await authenticate_operator(session, "operator-password", "uds", get_settings())
            assert success and token and csrf
        async with SessionLocal.begin() as session:
            stored = (await session.execute(select(DashboardSession))).scalar_one()
            stored.last_seen_at = datetime.now(timezone.utc) - timedelta(minutes=31)
        async with SessionLocal() as session:
            loaded, reason = await load_valid_session(session, token)
            assert loaded is None and reason == "expired"

    asyncio.run(run())


def test_csrf_challenge_is_single_use_and_rate_updates_are_concurrent_safe(tmp_path, monkeypatch):
    db_path = tmp_path / "concurrency.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("SUPERVISOR_CORS_ORIGINS", "https://dashboard.test")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.application.operator_auth import (
            authenticate_operator,
            consume_login_csrf_challenge,
            create_login_csrf_challenge,
        )
        from supervisor.config.settings import get_settings
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardLoginRateLimit

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"operator-password")
            csrf = await create_login_csrf_challenge(session)

        async def consume():
            async with SessionLocal.begin() as session:
                return await consume_login_csrf_challenge(session, csrf)

        assert sorted(await asyncio.gather(consume(), consume())) == [False, True]

        async def fail_login():
            async with SessionLocal.begin() as session:
                return await authenticate_operator(session, "wrong-password", "same-ip", get_settings())

        results = await asyncio.gather(fail_login(), fail_login())
        assert all(result[0] is False for result in results)
        async with SessionLocal() as session:
            record = await session.get(DashboardLoginRateLimit, "ip:same-ip")
            assert record is not None and record.failure_count == 2

        async with SessionLocal.begin() as session:
            record = await session.get(DashboardLoginRateLimit, "ip:same-ip")
            record.failure_count = 4
            record.locked_until = None

        await asyncio.gather(fail_login(), fail_login())
        async with SessionLocal() as session:
            record = await session.get(DashboardLoginRateLimit, "ip:same-ip")
            assert record is not None and record.failure_count == 5
            assert record.locked_until is not None

    asyncio.run(run())


def test_password_rotation_revocation_leaves_metadata_audit(tmp_path, monkeypatch):
    db_path = tmp_path / "rotation-audit.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    _reset_supervisor_modules()

    async def run():
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.application.operator_auth import authenticate_operator
        from supervisor.config.settings import get_settings
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardAuditEvent, DashboardSession

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"old-password")
        async with SessionLocal.begin() as session:
            success, token, _ = await authenticate_operator(session, "old-password", "uds", get_settings())
            assert success and token
        async with SessionLocal.begin() as session:
            result = await ensure_bootstrap_operator(session, b"new-password")
            assert result.rotated
        async with SessionLocal() as session:
            stored = (await session.execute(select(DashboardSession))).scalar_one()
            assert stored.revoked_at is not None
            events = (await session.execute(select(DashboardAuditEvent))).scalars().all()
            assert any(event.event_type == "session_revoked" and event.outcome == "password_rotation" for event in events)

    asyncio.run(run())


def test_packet_detail_mediator_requires_operator_and_returns_minimal_audited_view(tmp_path, monkeypatch):
    db_path = tmp_path / "packet-detail.db"
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", "true")
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    _reset_supervisor_modules()

    async def run():
        from supervisor.api import main
        from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
        from supervisor.application.operator_auth import authenticate_operator
        from supervisor.config.settings import get_settings
        from supervisor.infrastructure.db.database import SessionLocal, init_db
        from supervisor.infrastructure.db.models import DashboardAuditEvent

        await init_db()
        async with SessionLocal.begin() as session:
            await ensure_bootstrap_operator(session, b"operator-password")
        async with SessionLocal.begin() as session:
            success, token, _ = await authenticate_operator(session, "operator-password", "uds", get_settings())
            assert success and token

        evidence = SimpleNamespace(
            schemaVersion="pipeline-epic-25-evidence-chain/v1",
            evidenceClass="integrated_local",
            checkedAt=datetime.now(timezone.utc),
            expiresAt=datetime.now(timezone.utc) + timedelta(minutes=5),
            freshnessState="fresh",
            effectiveDecision="hold",
            typedBlockers=["quality_gate_not_passed"],
        )
        packet = SimpleNamespace(
            packetId="packet-1",
            title="Approved packet title",
            currentStage="shaping",
            status="active",
            truthLabel="source_owned",
            evidenceChain=evidence,
        )
        work_graph_payload = {
            "schemaVersion": "parallel-work-graph-evidence/v0",
            "sourceSchemaVersion": "parallel-execution-graph-reservation/v1",
            "availability": "unavailable",
            "packetId": "packet-1",
            "executionJobId": None,
            "generatedAt": None,
            "freshnessState": "unavailable",
            "waveMembership": "unavailable",
            "dependencyState": "unavailable",
            "reservation": {"status": "unavailable", "owner": None, "reasonCode": "parallel_report_unavailable"},
            "capacity": {"posture": "unavailable", "reasonCode": "parallel_capacity_unavailable"},
            "reason": "No current supervisor-validated parallel wave evidence is available for this packet.",
            "nextSafeAction": "Refresh the advisory planning evidence; this detail does not dispatch work, call a provider, or establish delivery eligibility.",
            "evidenceRefs": [],
            "metadataOnly": True,
            "rawPayloadRetained": False,
            "retention": "metadata_only_evidence_references",
        }
        work_graph = SimpleNamespace(packetId="packet-1", model_dump=lambda **_kwargs: work_graph_payload)
        projection = SimpleNamespace(selectedPacketDetails=[SimpleNamespace(packetId="packet-1", workGraph=work_graph)])
        original = main.service.get_authoritative_work_packet
        original_projection = main.service.get_pipeline_dashboard_projection
        async def fake_get_packet(_session, _packet_id):
            return packet
        async def fake_get_projection(_session, mutation_access=False):
            assert mutation_access is False
            return projection
        main.service.get_authoritative_work_packet = fake_get_packet
        main.service.get_pipeline_dashboard_projection = fake_get_projection
        try:
            cookie = f"kendall_operator_session={token}"
            headers = {"x-kendall-dashboard-mediator": "packet-detail/v1"}
            status, response_headers, _ = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1")
            assert status == 404 and response_headers.get(b"cache-control") == b"no-store"
            status, response_headers, body = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1", headers=headers, cookie=cookie)
            assert status == 200
            assert response_headers.get(b"cache-control") == b"no-store"
            payload = json.loads(body)
            assert payload["packet"]["packetId"] == "packet-1"
            assert set(payload["packet"]) == {"packetId", "title", "currentStage", "status", "truthLabel", "evidence", "workGraph"}
            assert payload["packet"]["workGraph"] == work_graph_payload
            assert "authorization" not in body.decode().lower()

            status, _, body = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1", headers={**headers, "x-forwarded-for": "127.0.0.1"}, cookie=cookie)
            assert status == 403 and b"unavailable" in body
            status, _, body = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1", headers={**headers, "x-forwarded-port": "443"}, cookie=cookie)
            assert status == 403 and b"unavailable" in body
            status, response_headers, _ = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1", headers=headers)
            assert status == 401 and response_headers.get(b"cache-control") == b"no-store"
            original_projection_reader = main.service.get_pipeline_dashboard_projection
            async def unavailable_projection(_session, mutation_access=False):
                raise RuntimeError("simulated projection failure")
            main.service.get_pipeline_dashboard_projection = unavailable_projection
            try:
                status, response_headers, _ = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1", headers=headers, cookie=cookie)
                assert status == 503 and response_headers.get(b"cache-control") == b"no-store"
            finally:
                main.service.get_pipeline_dashboard_projection = original_projection_reader
            original_packet_reader = main.service.get_authoritative_work_packet
            async def unavailable(_session, _packet_id):
                raise RuntimeError("simulated supervisor failure")
            main.service.get_authoritative_work_packet = unavailable
            try:
                status, response_headers, _ = await _asgi_request(main.app, "GET", "/internal/dashboard/packet-detail/packet-1", headers=headers, cookie=cookie)
                assert status == 503 and response_headers.get(b"cache-control") == b"no-store"
            finally:
                main.service.get_authoritative_work_packet = original_packet_reader
        finally:
            main.service.get_authoritative_work_packet = original
            main.service.get_pipeline_dashboard_projection = original_projection

        async with SessionLocal() as session:
            events = (await session.execute(select(DashboardAuditEvent))).scalars().all()
            assert any(event.event_type == "packet_detail_read" and event.outcome == "allowed" and event.target_ref == "packet-1" for event in events)
            assert any(event.event_type == "packet_detail_read" and event.outcome == "denied" and event.target_ref is None for event in events)

    asyncio.run(run())
