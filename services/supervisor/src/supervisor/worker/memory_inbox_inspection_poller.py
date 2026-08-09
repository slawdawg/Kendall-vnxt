"""Private background executor and restart fence for Memory Inbox inspection."""

import asyncio
import contextlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.application.memory_inbox_inspection_worker import execute_inspection_job
from supervisor.config.settings import Settings
from supervisor.infrastructure.db.database import SessionLocal
from supervisor.infrastructure.db.models import MemoryInboxJob


class MemoryInboxInspectionPoller:
    """Run only explicitly planned, private inspection jobs off the request path."""

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
        """Reconcile abandoned claims first, then execute a bounded planned batch."""
        async with SessionLocal() as session:
            await recover_claimed_inspection_jobs(session)
            job_ids = list((await session.scalars(
                select(MemoryInboxJob.id)
                .where(
                    MemoryInboxJob.capability_ref == "inspection-v1",
                    MemoryInboxJob.lifecycle_state == "Planned",
                )
                .order_by(MemoryInboxJob.created_at)
                .limit(8)
            )).all())
        for job_id in job_ids:
            async with SessionLocal() as session:
                try:
                    await execute_inspection_job(
                        session, settings=self._settings, job_id=job_id,
                        actor_ref="worker:memory-inbox-inspection",
                    )
                except ValueError:
                    # Each expected failure is committed as an opaque result by
                    # the claim/completion fence. Do not emit source content.
                    continue

    async def _run(self) -> None:
        while self._running:
            await self.run_once()
            await asyncio.sleep(self._settings.poll_interval_seconds)


async def recover_claimed_inspection_jobs(session: AsyncSession) -> int:
    """Close work orphaned by cancellation or a process restart without rereading it."""
    jobs = list((await session.scalars(
        select(MemoryInboxJob)
        .where(
            MemoryInboxJob.capability_ref == "inspection-v1",
            MemoryInboxJob.lifecycle_state == "Claimed",
        )
        .with_for_update()
    )).all())
    for job in jobs:
        job.lifecycle_state = "Closed"
        job.result_ref = f"inspection:cancelled_or_restarted:{uuid.uuid4().hex}"
    if jobs:
        await session.commit()
    return len(jobs)
