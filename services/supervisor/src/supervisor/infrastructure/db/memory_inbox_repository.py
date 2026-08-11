"""Supervisor-only persistence helpers for the inert Memory Inbox lifecycle plane.

There is intentionally no route, worker, or browser call site in Story 1.2.
The caller supplies server-resolved actor and policy references; this repository
never accepts raw source or proposal material.
"""

from datetime import UTC, datetime
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.domain.memory_inbox import MemoryInboxSourceState, is_positive_revision
from supervisor.infrastructure.db.models import MemoryInboxSource, MemoryInboxSourceRevision

_OPAQUE_REF = re.compile(r"^[A-Za-z0-9:_-]+$")


def _opaque_ref(value: str, *, maximum_length: int = 160) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= maximum_length or not _OPAQUE_REF.fullmatch(value):
        raise ValueError("Memory Inbox persistence references must be opaque identifiers.")
    return value


class MemoryInboxLifecycleRepository:
    """A transaction-scoped lifecycle repository; commits stay with the caller."""

    async def create_inert_source(
        self,
        session: AsyncSession,
        *,
        source_id: str,
        revision_id: str,
        retention_deadline_at: datetime,
        actor_ref: str,
        audit_ref: str,
        policy_ref: str,
        lifecycle_state: MemoryInboxSourceState = MemoryInboxSourceState.SCANNING,
    ) -> MemoryInboxSource:
        """Create only opaque lifecycle records; source acceptance is a later story."""

        if retention_deadline_at.tzinfo is None:
            raise ValueError("Memory Inbox retention deadline must be timezone aware.")
        source = MemoryInboxSource(
            id=_opaque_ref(source_id, maximum_length=80),
            current_revision=1,
            lifecycle_state=lifecycle_state.value,
            retention_deadline_at=retention_deadline_at.astimezone(UTC),
            deletion_state="None",
            policy_ref=_opaque_ref(policy_ref),
        )
        revision = MemoryInboxSourceRevision(
            id=_opaque_ref(revision_id, maximum_length=80),
            source_id=source.id,
            revision=1,
            lifecycle_state=lifecycle_state.value,
            actor_ref=_opaque_ref(actor_ref),
            audit_ref=_opaque_ref(audit_ref),
            policy_ref=source.policy_ref,
        )
        session.add_all((source, revision))
        await session.flush()
        return source

    async def load_source_at_revision(
        self,
        session: AsyncSession,
        *,
        source_id: str,
        expected_revision: int,
    ) -> MemoryInboxSource | None:
        """Load a source under row lock and reject stale revision claims."""

        if not is_positive_revision(expected_revision):
            raise ValueError("Memory Inbox expected revision must be a positive integer.")
        source = (await session.execute(
            select(MemoryInboxSource)
            .where(MemoryInboxSource.id == _opaque_ref(source_id, maximum_length=80))
            .with_for_update(),
        )).scalar_one_or_none()
        if source is None or source.current_revision != expected_revision:
            return None
        return source
