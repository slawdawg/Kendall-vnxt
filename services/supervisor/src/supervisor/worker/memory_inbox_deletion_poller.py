"""Private, bounded execution of approved Memory Inbox deletion operations."""

import asyncio
import contextlib

from sqlalchemy import select

from supervisor.application.memory_inbox_approval import plan_pending_deletion_operations
from supervisor.application.memory_inbox_deletion import execute_deletion_operation
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.database import SessionLocal
from supervisor.infrastructure.db.models import MemoryInboxDeletionOperation, MemoryInboxSource


class MemoryInboxDeletionPoller:
    """Reconcile the deletion barrier before executing a small planned batch."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._task: asyncio.Task[None] | None = None
        self._running = False

    async def start(self) -> None:
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def run_once(self) -> None:
        """Wait out live cancellation leases, then delete only planned copies."""
        async with SessionLocal() as session:
            sources = list((await session.scalars(select(MemoryInboxSource).where(
                MemoryInboxSource.lifecycle_state == "DeletePending",
                MemoryInboxSource.deletion_state.in_(("Pending", "RetryNeeded")),
            ).with_for_update())).all())
            for source in sources:
                await plan_pending_deletion_operations(session, source=source)
            if sources:
                await session.commit()
            operation_ids = list((await session.scalars(select(MemoryInboxDeletionOperation.id).where(
                MemoryInboxDeletionOperation.lifecycle_state.in_(("Planned", "RetryNeeded")),
            ).order_by(MemoryInboxDeletionOperation.requested_at).limit(8))).all())
        for operation_id in operation_ids:
            async with SessionLocal() as session:
                try:
                    await execute_deletion_operation(
                        session, settings=self._settings, operation_id=operation_id,
                        actor_ref="worker:memory-inbox-deletion",
                    )
                except ValueError:
                    # Lifecycle validation is intentionally opaque; it must not
                    # turn a stale operation into source exposure.
                    continue

    async def _run(self) -> None:
        while self._running:
            await self.run_once()
            await asyncio.sleep(self._settings.poll_interval_seconds)
