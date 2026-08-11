import asyncio
from datetime import datetime, timedelta, timezone
import os
from uuid import uuid4

import pytest
from sqlalchemy import event, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from supervisor.application.memory_inbox_approval import approve_proposal_for_deletion
from supervisor.application.memory_inbox_proposal_reader import read_authorized_proposal
from supervisor.application.memory_inbox_reader_serialization import (
    serialize_memory_inbox_source_use,
    sqlite_source_lock_registry_size,
)
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.database import Base
from supervisor.infrastructure.db.models import (
    MemoryInboxManifest, MemoryInboxProposalAggregate, MemoryInboxProposalReaderGrant,
    MemoryInboxProposalRevision, MemoryInboxSource,
)
from supervisor.infrastructure.private_content_store import PrivateContentStore


class _ScalarResult:
    def __init__(self, value) -> None:
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RecordingReaderSession:
    def __init__(self, *, proposal, proposal_revision, source, grant, manifest) -> None:
        self._values = iter((proposal, proposal, proposal_revision, grant, manifest))
        self.source = source
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _ScalarResult(next(self._values))

    async def get(self, _model, _identifier):
        return self.source


@pytest.mark.asyncio
async def test_sqlite_serializes_reader_and_deletion_source_use(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'reader-serialization.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    reader_entered = asyncio.Event()
    release_reader = asyncio.Event()
    deletion_entered = asyncio.Event()

    async def reader() -> None:
        async with sessions() as session, serialize_memory_inbox_source_use(session, "source:serialized"):
            reader_entered.set()
            await release_reader.wait()

    async def deletion() -> None:
        async with sessions() as session, serialize_memory_inbox_source_use(session, "source:serialized"):
            deletion_entered.set()

    reader_task = asyncio.create_task(reader())
    await asyncio.wait_for(reader_entered.wait(), timeout=2)
    deletion_task = asyncio.create_task(deletion())
    await asyncio.sleep(0)
    assert not deletion_entered.is_set(), "SQLite deletion must not pass a live reader gate"
    release_reader.set()
    await asyncio.wait_for(reader_task, timeout=2)
    await asyncio.wait_for(deletion_task, timeout=2)
    assert deletion_entered.is_set()
    assert sqlite_source_lock_registry_size() == 0
    await engine.dispose()


@pytest.mark.asyncio
async def test_reader_requires_an_enabled_exact_revision_grant_and_proposal_manifest(tmp_path) -> None:
    root = tmp_path / "private"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:proposal-reader", "# Private proposal\n\nOnly this article may render this body.")
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'reader.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        deadline = datetime.now(timezone.utc) + timedelta(hours=1)
        source = MemoryInboxSource(id="source:reader", current_revision=2, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test")
        proposal = MemoryInboxProposalAggregate(id="proposal:reader", source_id=source.id, current_revision=1, lifecycle_state="Ready")
        revision = MemoryInboxProposalRevision(id="proposal-revision:reader", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:test", audit_ref="audit:test")
        grant = MemoryInboxProposalReaderGrant(id="reader-grant:reader", proposal_revision_id=revision.id, capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:test")
        manifest = MemoryInboxManifest(id="manifest:proposal-reader", proposal_revision_id=revision.id, copy_class="proposal_body", store_ref="inbox-store:proposal-reader", creation_state="Created", retention_class="proposal_retention", deletion_state="None")
        session.add_all((source, proposal, revision, grant, manifest))
        await session.commit()
        disabled = Settings(SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root), SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24)
        with pytest.raises(ValueError, match="proposal_reader_unavailable"):
            await read_authorized_proposal(session, settings=disabled, proposal_id=proposal.id, revision=1)
        enabled = Settings(SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root), SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24, SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True, SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader")
        result = await read_authorized_proposal(session, settings=enabled, proposal_id=proposal.id, revision=1)
        assert result.proposal_id == proposal.id
        assert result.revision == 1
        assert result.body == "# Private proposal\n\nOnly this article may render this body."
    await engine.dispose()


@pytest.mark.asyncio
async def test_reader_locks_the_live_grant_until_private_content_is_read(tmp_path) -> None:
    root = tmp_path / "private"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:proposal-reader-lock", "Reader lock regression body.")
    settings = Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True,
        SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader",
    )
    source = MemoryInboxSource(id="source:reader-lock", current_revision=2, lifecycle_state="Review", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1), deletion_state="None", policy_ref="policy:test")
    proposal = MemoryInboxProposalAggregate(id="proposal:reader-lock", source_id=source.id, current_revision=1, lifecycle_state="Ready")
    revision = MemoryInboxProposalRevision(id="proposal-revision:reader-lock", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:test", audit_ref="audit:test")
    grant = MemoryInboxProposalReaderGrant(id="reader-grant:reader-lock", proposal_revision_id=revision.id, capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:test")
    manifest = MemoryInboxManifest(id="manifest:proposal-reader-lock", legacy_owner_revision_id=revision.id, proposal_revision_id=revision.id, copy_class="proposal_body", store_ref="inbox-store:proposal-reader-lock", creation_state="Created", retention_class="proposal_retention", deletion_state="None")
    session = _RecordingReaderSession(
        proposal=proposal, proposal_revision=revision, source=source, grant=grant, manifest=manifest,
    )

    result = await read_authorized_proposal(session, settings=settings, proposal_id=proposal.id, revision=1)

    assert result.body == "Reader lock regression body."
    assert "FOR UPDATE" in str(session.statements[3].compile(dialect=postgresql.dialect()))


@pytest.mark.asyncio
async def test_sqlite_reader_waits_for_deletion_commit_before_rechecking_its_grant(tmp_path, monkeypatch) -> None:
    root = tmp_path / "private"
    root.mkdir(mode=0o700)
    os.chmod(root, 0o700)
    store = PrivateContentStore(str(root))
    store.write_text("inbox-store:proposal-reader-revoked", "Proposal body that must not survive deletion.")
    settings = Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True,
        SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader",
    )
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'reader-revoked.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        deadline = datetime.now(timezone.utc) + timedelta(hours=1)
        source = MemoryInboxSource(id="source:reader-revoked", current_revision=2, lifecycle_state="Review", retention_deadline_at=deadline, deletion_state="None", policy_ref="policy:test")
        proposal = MemoryInboxProposalAggregate(id="proposal:reader-revoked", source_id=source.id, current_revision=1, lifecycle_state="Ready")
        revision = MemoryInboxProposalRevision(id="proposal-revision:reader-revoked", proposal_id=proposal.id, revision=1, lifecycle_state="Ready", actor_ref="operator:test", audit_ref="audit:test")
        grant = MemoryInboxProposalReaderGrant(id="reader-grant:reader-revoked", proposal_revision_id=revision.id, capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:test")
        manifest = MemoryInboxManifest(id="manifest:proposal-reader-revoked", legacy_owner_revision_id=revision.id, proposal_revision_id=revision.id, copy_class="proposal_body", store_ref="inbox-store:proposal-reader-revoked", creation_state="Created", retention_class="proposal_retention", deletion_state="None")
        session.add_all((source, proposal, revision, grant, manifest))
        await session.commit()

    deletion_ready_to_commit = asyncio.Event()
    release_deletion_commit = asyncio.Event()
    async with sessions() as deletion_session, sessions() as reader_session:
        original_commit = deletion_session.commit

        async def paused_commit() -> None:
            deletion_ready_to_commit.set()
            await release_deletion_commit.wait()
            await original_commit()

        monkeypatch.setattr(deletion_session, "commit", paused_commit)
        deletion_task = asyncio.create_task(approve_proposal_for_deletion(
            deletion_session, proposal_id=proposal.id, expected_revision=1,
            idempotency_key="reader-revocation-delete-0001", actor_ref="operator:test",
        ))
        await asyncio.wait_for(deletion_ready_to_commit.wait(), timeout=2)
        reader_task = asyncio.create_task(read_authorized_proposal(
            reader_session, settings=settings, proposal_id=proposal.id, revision=1,
        ))
        await asyncio.sleep(0)
        assert not reader_task.done(), "SQLite reader must wait until deletion publishes its revoked grant"
        release_deletion_commit.set()
        await asyncio.wait_for(deletion_task, timeout=2)
        with pytest.raises(ValueError, match="proposal_reader_revision_unavailable"):
            await asyncio.wait_for(reader_task, timeout=2)
    assert sqlite_source_lock_registry_size() == 0
    await engine.dispose()


def test_postgres_reader_grant_lock_blocks_deletion_until_reader_finishes_when_available(tmp_path) -> None:
    """Use two real PostgreSQL sessions; SQLite cannot prove row-lock serialization."""
    database_url = os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_URL")
    if not database_url or os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_ISOLATED") != "1":
        pytest.skip(
            "No explicitly isolated PostgreSQL test database; the real two-session reader/deletion lock probe was not run."
        )

    async def run_probe() -> None:
        root = tmp_path / "private"
        root.mkdir(mode=0o700)
        os.chmod(root, 0o700)
        store_ref = f"inbox-store:reader-lock-{uuid4().hex}"
        PrivateContentStore(str(root)).write_text(store_ref, "Reader/delete interlock body.")
        settings = Settings(
            SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(root),
            SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
            SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=True,
            SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF="capability:reader",
        )
        schema_name = f"memory_inbox_reader_lock_{uuid4().hex}"
        schema_engine = create_async_engine(database_url, future=True)
        engine = create_async_engine(
            database_url, future=True,
            connect_args={"server_settings": {"search_path": schema_name}},
        )
        try:
            async with schema_engine.begin() as connection:
                await connection.execute(text(f"CREATE SCHEMA {schema_name}"))
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            sessions = async_sessionmaker(engine, expire_on_commit=False)
            suffix = uuid4().hex
            proposal_id = f"proposal:reader-postgres-lock:{suffix}"
            source = MemoryInboxSource(
                id=f"source:reader-postgres-lock:{suffix}", current_revision=2,
                lifecycle_state="Review", retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=1),
                deletion_state="None", policy_ref="policy:test",
            )
            proposal = MemoryInboxProposalAggregate(
                id=proposal_id, source_id=source.id, current_revision=1, lifecycle_state="Ready",
            )
            revision = MemoryInboxProposalRevision(
                id=f"proposal-revision:reader-postgres-lock:{suffix}", proposal_id=proposal.id,
                revision=1, lifecycle_state="Ready", actor_ref="operator:test", audit_ref="audit:test",
            )
            grant = MemoryInboxProposalReaderGrant(
                id=f"reader-grant:reader-postgres-lock:{suffix}", proposal_revision_id=revision.id,
                capability_ref="capability:reader", lifecycle_state="Approved", actor_ref="operator:test",
            )
            manifest = MemoryInboxManifest(
                id=f"manifest:reader-postgres-lock:{suffix}", legacy_owner_revision_id=revision.id, proposal_revision_id=revision.id,
                copy_class="proposal_body", store_ref=store_ref, creation_state="Created",
                retention_class="proposal_retention", deletion_state="None",
            )
            async with sessions.begin() as session:
                # These models deliberately use scalar foreign-key identifiers
                # rather than ORM relationships. Flush each referenced row before
                # inserting its dependent so this probe exercises real PostgreSQL
                # FK enforcement rather than relying on unit-of-work ordering.
                session.add(source)
                await session.flush()
                session.add(proposal)
                await session.flush()
                session.add(revision)
                await session.flush()
                session.add(grant)
                await session.flush()
                session.add(manifest)
                await session.flush()

            lock_acquired = asyncio.Event()
            release_reader = asyncio.Event()
            deletion_reached_grant = asyncio.Event()
            observe_deletion = False

            @event.listens_for(engine.sync_engine, "before_cursor_execute")
            def observe_contested_grant(_connection, _cursor, statement, _parameters, _context, _executemany):
                if observe_deletion and "memory_inbox_proposal_reader_grants" in statement and "FOR UPDATE" in statement:
                    deletion_reached_grant.set()

            class PausedReaderSession:
                def __init__(self, session) -> None:
                    self._session = session
                    self._paused = False

                async def execute(self, statement):
                    result = await self._session.execute(statement)
                    if (
                        not self._paused
                        and "memory_inbox_proposal_reader_grants" in str(statement)
                        and getattr(statement, "_for_update_arg", None) is not None
                    ):
                        self._paused = True
                        lock_acquired.set()
                        await release_reader.wait()
                    return result

                async def get(self, *args, **kwargs):
                    return await self._session.get(*args, **kwargs)

            async with sessions() as reader_session, sessions() as deletion_session:
                reader_task = asyncio.create_task(read_authorized_proposal(
                    PausedReaderSession(reader_session), settings=settings, proposal_id=proposal_id, revision=1,
                ))
                await asyncio.wait_for(lock_acquired.wait(), timeout=2)

                observe_deletion = True
                deletion_task = asyncio.create_task(approve_proposal_for_deletion(
                    deletion_session, proposal_id=proposal_id, expected_revision=1,
                    idempotency_key=f"reader-postgres-lock-delete:{suffix}", actor_ref="operator:test",
                ))
                await asyncio.wait_for(deletion_reached_grant.wait(), timeout=2)
                assert not deletion_task.done(), "deletion grant query must wait on the reader's live lock"

                release_reader.set()
                reader = await asyncio.wait_for(reader_task, timeout=2)
                assert reader.body == "Reader/delete interlock body."
                await reader_session.commit()
                deletion = await asyncio.wait_for(deletion_task, timeout=2)
                assert deletion.proposal_id == proposal_id

            async with sessions() as session:
                with pytest.raises(ValueError, match="proposal_reader_revision_unavailable"):
                    await read_authorized_proposal(session, settings=settings, proposal_id=proposal_id, revision=1)
        finally:
            await engine.dispose()
            async with schema_engine.begin() as connection:
                await connection.execute(text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE"))
            await schema_engine.dispose()

    asyncio.run(run_probe())
