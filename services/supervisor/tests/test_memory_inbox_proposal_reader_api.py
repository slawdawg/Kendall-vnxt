import json
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


async def _asgi_get(app, path: str, *, cookie: str | None = None) -> tuple[int, dict[bytes, bytes], bytes]:
    headers = [(b"cookie", cookie.encode())] if cookie else []
    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1", "method": "GET", "scheme": "https", "path": path,
        "raw_path": path.encode(), "query_string": b"", "headers": headers,
        "client": None, "server": None,
    }
    messages: list[dict] = []
    received = False

    async def receive() -> dict:
        nonlocal received
        if received:
            return {"type": "http.disconnect"}
        received = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    await app(scope, receive, send)
    start = next(message for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], dict(start["headers"]), body


async def _reader_app(tmp_path, monkeypatch, *, lan_auth_enabled: bool):
    root = tmp_path / "private"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'reader-api.db'}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    monkeypatch.setenv("KENDALL_LAN_AUTH_ENABLED", str(lan_auth_enabled).lower())
    monkeypatch.setenv("KENDALL_SUPERVISOR_TRANSPORT", "private_uds")
    monkeypatch.setenv("SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT", str(root))
    monkeypatch.setenv("SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS", "24")
    monkeypatch.setenv("SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED", "true")
    monkeypatch.setenv("SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF", "capability:reader")
    _reset_supervisor_modules()

    from supervisor.api import main
    from supervisor.infrastructure.db.database import SessionLocal, init_db
    from supervisor.infrastructure.db.models import (
        MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxProposalReaderGrant,
        MemoryInboxProposalRevision, MemoryInboxSource,
    )
    from supervisor.infrastructure.private_content_store import PrivateContentStore

    await init_db()
    PrivateContentStore(str(root)).write_text("inbox-store:proposal-reader-api", "API reader secret")
    async with SessionLocal.begin() as session:
        source = MemoryInboxSource(id="source:reader-api", current_revision=2, lifecycle_state="Review", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None", policy_ref="policy:test")
        proposal = MemoryInboxProposalAggregate(id="proposal:reader-api", source_id=source.id, current_revision=1, lifecycle_state="Ready")
        revision = MemoryInboxProposalRevision(id="proposal-revision:reader-api", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:test", audit_ref="audit:test")
        grant = MemoryInboxProposalReaderGrant(id="reader-grant:reader-api", proposal_revision_id=revision.id, capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:test")
        session.add_all((source, proposal, revision, grant))
        await session.flush()
        manifest = MemoryInboxManifest(id="manifest:proposal-reader-api", legacy_owner_revision_id=revision.id, proposal_revision_id=revision.id, copy_class="proposal_body", store_ref="inbox-store:proposal-reader-api", creation_state="Created", retention_class="proposal_retention", deletion_state="None")
        session.add(manifest)
    return main.app, SessionLocal


@pytest.mark.asyncio
async def test_proposal_reader_rejects_unauthenticated_access_when_lan_auth_is_disabled(tmp_path, monkeypatch) -> None:
    app, _ = await _reader_app(tmp_path, monkeypatch, lan_auth_enabled=False)

    status, _, body = await _asgi_get(app, "/memory-inbox/proposals/proposal:reader-api/revisions/1/reader")

    assert status == 404
    assert b"API reader secret" not in body


@pytest.mark.asyncio
async def test_proposal_reader_rejects_a_disabled_operator_but_preserves_an_enabled_operator(tmp_path, monkeypatch) -> None:
    app, session_factory = await _reader_app(tmp_path, monkeypatch, lan_auth_enabled=True)
    from supervisor.application.lan_auth_bootstrap import ensure_bootstrap_operator
    from supervisor.application.operator_auth import authenticate_operator
    from supervisor.config.settings import get_settings
    from supervisor.infrastructure.db.models import DashboardOperator

    async with session_factory.begin() as session:
        await ensure_bootstrap_operator(session, b"operator-password")
    async with session_factory() as session:
        authenticated, token, _ = await authenticate_operator(session, "operator-password", "uds", get_settings())
    assert authenticated and token
    cookie = f"kendall_operator_session={token}"

    status, _, body = await _asgi_get(app, "/memory-inbox/proposals/proposal:reader-api/revisions/1/reader", cookie=cookie)
    assert status == 200
    assert json.loads(body)["data"]["body"] == "API reader secret"

    async with session_factory.begin() as session:
        operator = await session.scalar(select(DashboardOperator).where(DashboardOperator.role == "operator"))
        assert operator is not None
        operator.enabled = False

    status, _, body = await _asgi_get(app, "/memory-inbox/proposals/proposal:reader-api/revisions/1/reader", cookie=cookie)
    assert status == 401
    assert b"API reader secret" not in body


@pytest.mark.asyncio
async def test_proposal_reader_requires_a_live_operator_session_under_lan_auth(tmp_path, monkeypatch) -> None:
    app, session_factory = await _reader_app(tmp_path, monkeypatch, lan_auth_enabled=True)
    from supervisor.application.lan_auth_bootstrap import enable_or_rotate_test_viewer, ensure_bootstrap_operator
    from supervisor.application.operator_auth import (
        authenticate_dashboard_account,
        authenticate_operator,
        digest_secret,
    )
    from supervisor.config.settings import get_settings
    from supervisor.infrastructure.db.models import DashboardSession

    path = "/memory-inbox/proposals/proposal:reader-api/revisions/1/reader"
    for cookie in (None, "kendall_operator_session=not-a-session"):
        status, _, body = await _asgi_get(app, path, cookie=cookie)
        assert status == 401
        assert b"API reader secret" not in body

    async with session_factory.begin() as session:
        await ensure_bootstrap_operator(session, b"operator-password")
        await enable_or_rotate_test_viewer(session, b"viewer-password", rotate=False)
    async with session_factory() as session:
        authenticated, operator_token, _ = await authenticate_operator(
            session, "operator-password", "uds", get_settings(),
        )
        viewer_authenticated, viewer_token, _ = await authenticate_dashboard_account(
            session, "viewer-password", "uds", get_settings(), "test_viewer",
        )
    assert authenticated and operator_token and viewer_authenticated and viewer_token

    async with session_factory.begin() as session:
        stored = await session.scalar(
            select(DashboardSession).where(DashboardSession.token_hash == digest_secret(operator_token))
        )
        assert stored is not None
        stored.revoked_at = datetime.now(timezone.utc)

    for token in (operator_token, viewer_token):
        status, _, body = await _asgi_get(app, path, cookie=f"kendall_operator_session={token}")
        assert status == 401
        assert b"API reader secret" not in body
