import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from supervisor.api.schemas import ApiEnvelope, ApiErrorEnvelope, ApiErrorShape, WorkItemCreate
from supervisor.application.service import SupervisorService
from supervisor.config.settings import get_settings
from supervisor.domain.types import ErrorCategory, RunMode
from supervisor.infrastructure.db.database import get_session, init_db
from supervisor.infrastructure.streaming.bus import EventBus
from supervisor.worker.poller import Poller

settings = get_settings()
bus = EventBus()
service = SupervisorService(settings, bus)
poller = Poller(service, settings.poll_interval_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    if settings.enable_background:
        await poller.start()
    try:
        yield
    finally:
        await poller.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def error_response(message: str, code: str, correlation_id: str = "n/a") -> ApiErrorEnvelope:
    return ApiErrorEnvelope(
        error=ApiErrorShape(
            code=code,
            message=message,
            category=ErrorCategory.TERMINAL,
            retryable=False,
            correlationId=correlation_id,
        )
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/work-items", response_model=ApiEnvelope)
async def create_work_item(payload: WorkItemCreate, session: AsyncSession = Depends(get_session)):
    item = await service.create_work_item(session, payload)
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.get("/work-items", response_model=ApiEnvelope)
async def list_work_items(session: AsyncSession = Depends(get_session)):
    items = await service.list_work_items(session)
    return ApiEnvelope(data=[service.to_work_item_view(item) for item in items])


@app.get("/work-items/{work_item_id}", response_model=ApiEnvelope)
async def get_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    items = await service.list_work_items(session)
    for item in items:
        if item.id == work_item_id:
            return ApiEnvelope(data=service.to_work_item_view(item))
    raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())


@app.post("/work-items/{work_item_id}/retry", response_model=ApiEnvelope)
async def retry_work_item(work_item_id: str, session: AsyncSession = Depends(get_session)):
    item = await service.retry_item(session, work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail=error_response("Work item not found.", "work_item_not_found").model_dump())
    return ApiEnvelope(data=service.to_work_item_view(item))


@app.get("/supervisor/status", response_model=ApiEnvelope)
async def get_status(session: AsyncSession = Depends(get_session)):
    return ApiEnvelope(data=await service.get_status(session))


async def _set_mode(mode: RunMode, session: AsyncSession) -> ApiEnvelope:
    control = await service.set_mode(session, mode)
    status = await service.get_status(session)
    return ApiEnvelope(data={"mode": control.mode, "status": status.model_dump()})


@app.post("/supervisor/enable", response_model=ApiEnvelope)
async def enable(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.RUNNING, session)


@app.post("/supervisor/pause", response_model=ApiEnvelope)
async def pause(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.PAUSED, session)


@app.post("/supervisor/drain", response_model=ApiEnvelope)
async def drain(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.DRAINING, session)


@app.post("/supervisor/disable", response_model=ApiEnvelope)
async def disable(session: AsyncSession = Depends(get_session)):
    return await _set_mode(RunMode.DISABLED, session)


@app.get("/audit-events", response_model=ApiEnvelope)
async def list_audit_events(session: AsyncSession = Depends(get_session)):
    audits = await service.list_audit_events(session)
    return ApiEnvelope(data=[service.to_audit_view(audit) for audit in audits])


@app.get("/events")
async def stream_events():
    async def event_stream():
        async with bus.subscribe() as queue:
            while True:
                message = await queue.get()
                yield f"data: {message}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def main() -> None:
    uvicorn.run("supervisor.api.main:app", host="0.0.0.0", port=8000, reload=True)


async def process_once_for_tests() -> None:
    from supervisor.infrastructure.db.database import SessionLocal

    async with SessionLocal() as session:
        await service.process_once(session)
