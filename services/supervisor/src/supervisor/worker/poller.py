import asyncio
import contextlib

from supervisor.application.service import SupervisorService
from supervisor.infrastructure.db.database import SessionLocal


class Poller:
    def __init__(self, service: SupervisorService, interval_seconds: int) -> None:
        self.service = service
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._running = False

    async def start(self) -> None:
        if self._task:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _run(self) -> None:
        while self._running:
            async with SessionLocal() as session:
                await self.service.process_once(session)
            await asyncio.sleep(self.interval_seconds)
