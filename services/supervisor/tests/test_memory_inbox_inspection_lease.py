from datetime import datetime, timedelta, timezone

import pytest

from supervisor.application.memory_inbox_inspection_lease import plan_inspection_lease
from supervisor.infrastructure.db.models import MemoryInboxJob, MemoryInboxSource, MemoryInboxSourceRevision


class RecordingSession:
    def __init__(self, responses: list[object]) -> None:
        self.responses = iter(responses)
        self.items: list[object] = []
        self.committed = False

    def add(self, item: object) -> None:
        self.items.append(item)

    async def execute(self, _statement):
        value = next(self.responses)
        return type("Result", (), {
            "scalar_one_or_none": lambda _self: value,
            "scalar_one": lambda _self: value,
        })()

    async def commit(self) -> None:
        self.committed = True


def scanning_source() -> MemoryInboxSource:
    return MemoryInboxSource(
        id="inbox-source:upload-1", current_revision=1, lifecycle_state="Scanning",
        retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=24),
        deletion_state="None", policy_ref="memory-inbox-retention-v1",
    )


@pytest.mark.asyncio
async def test_scanning_upload_job_is_fenced_to_the_new_quarantine_revision() -> None:
    source = scanning_source()
    session = RecordingSession([source, None])

    job = await plan_inspection_lease(
        session, source_id=source.id, actor_ref="operator:verified-operator",
    )

    revision = next(item for item in session.items if isinstance(item, MemoryInboxSourceRevision))
    assert session.committed
    assert source.lifecycle_state == "Quarantined"
    assert source.current_revision == 2
    assert revision.revision == 2
    assert revision.lifecycle_state == "Quarantined"
    assert job.source_revision_id == revision.id
    assert job.source_revision_id != "inbox-source-revision:upload-1"


@pytest.mark.asyncio
async def test_existing_inspection_job_is_returned_without_another_revision() -> None:
    source = MemoryInboxSource(
        id="inbox-source:upload-2", current_revision=2, lifecycle_state="Quarantined",
        retention_deadline_at=datetime.now(timezone.utc) + timedelta(hours=24),
        deletion_state="None", policy_ref="memory-inbox-retention-v1",
    )
    existing = MemoryInboxJob(
        id="inbox-job:already-planned", source_revision_id="inbox-source-revision:upload-2",
        capability_ref="inspection-v1", lifecycle_state="Planned",
    )
    revision = MemoryInboxSourceRevision(
        id="inbox-source-revision:upload-2", source_id=source.id, revision=2,
        lifecycle_state="Quarantined", actor_ref="operator:verified-operator",
        audit_ref="audit:prior", policy_ref=source.policy_ref,
    )
    session = RecordingSession([source, revision, existing])

    job = await plan_inspection_lease(
        session, source_id=source.id, actor_ref="operator:verified-operator",
    )

    assert job is existing
    assert source.current_revision == 2
    assert not session.items
    assert not session.committed
