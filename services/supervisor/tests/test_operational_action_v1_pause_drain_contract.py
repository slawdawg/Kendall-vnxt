from __future__ import annotations

import inspect

from sqlalchemy import Integer, update
from sqlalchemy.dialects import postgresql

from supervisor.api.schemas import (
    DrainActionContextV1,
    PauseActionContextV1,
    ResumeActionContextV1,
    OperationalActionResultV1,
    operational_action_context_digest_sha256_v1,
)
from supervisor.application.service import SupervisorService
from supervisor.infrastructure.db.database import (
    SUPERVISOR_CONTROL_POSTGRES_COLUMNS,
    SUPERVISOR_CONTROL_SQLITE_COLUMNS,
    init_db,
)
from supervisor.infrastructure.db.models import SupervisorControl


def test_runtime_revision_contract_is_shared_by_sqlalchemy_and_both_migrations() -> None:
    assert isinstance(SupervisorControl.__table__.c.revision.type, Integer)
    assert SupervisorControl.__table__.c.revision.default.arg == 1
    assert SUPERVISOR_CONTROL_POSTGRES_COLUMNS == (("revision", "INTEGER NOT NULL DEFAULT 1"),)
    assert SUPERVISOR_CONTROL_SQLITE_COLUMNS == (("revision", "INTEGER NOT NULL DEFAULT 1"),)

    statement = update(SupervisorControl).where(
        SupervisorControl.id == 1,
        SupervisorControl.revision == 3,
    ).values(mode="paused", revision=4)
    sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "supervisor_control.revision = 3" in sql
    assert "revision=4" in sql


def test_runtime_v1_result_requires_exact_deterministic_counts() -> None:
    context = PauseActionContextV1.model_validate(
        {"kind": "pause", "expectedRuntimeMode": "running", "expectedRuntimeRevision": 1}
    )
    request = {
        "schemaVersion": "pipeline-operational-action/v1",
        "actionId": "pause",
        "targetType": "runtime",
        "targetId": "supervisor-runtime",
        "actionContext": context,
        "actionContextDigestSha256": operational_action_context_digest_sha256_v1(
            "pause", "runtime", "supervisor-runtime", context
        ),
        "serverBound": True,
        "outcome": "succeeded",
        "capabilityState": "available",
        "authorityState": "allowed",
        "riskTier": "low",
        "typedReason": None,
        "successEvidence": {
            "kind": "pause",
            "resultingRuntimeMode": "paused",
            "resultingRuntimeRevision": 2,
            "activeWorkCount": 2,
            "activeLeaseCount": 1,
            "runningAttemptCount": 1,
            "intakeStopped": True,
            "activeWorkPreserved": True,
        },
        "evidenceRefs": ["test:pause:p2-2"],
        "correlationId": "corr-p2-2",
        "idempotencyKey": "idem-p2-2",
        "actionRecordId": "action-p2-2",
        "approvalId": "approval-p2-2",
        "replayed": False,
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }
    result = OperationalActionResultV1.model_validate(request)
    assert result.successEvidence.activeLeaseCount == 1


def test_runtime_apply_source_consumes_approval_and_cas_transitions_without_kill_or_cancel() -> None:
    source = inspect.getsource(SupervisorService._apply_p2_2_runtime_action)
    assert "consumed_action_idempotency_key" in source
    assert "SupervisorControl.revision == control.revision" in source
    assert "revision=resulting_revision" in source
    assert "workersKilled" in source
    assert "cancel" not in source.lower()
    assert "delete" not in source.lower()


def test_runtime_admission_and_initialization_contracts_are_fenced_and_idempotent() -> None:
    process_source = inspect.getsource(SupervisorService.process_once)
    advance_source = inspect.getsource(SupervisorService._advance_item)
    lease_source = inspect.getsource(SupervisorService._create_or_refresh_lease)
    intake_source = inspect.getsource(SupervisorService.create_work_item)
    init_source = inspect.getsource(init_db)
    status_source = inspect.getsource(SupervisorService.get_status)

    assert "_acquire_execute_admission_lock(session)" in process_source
    assert "_runtime_control_snapshot(session, lock=True)" in process_source
    assert "_runtime_control_snapshot(session, lock=True)" in advance_source
    assert "_runtime_control_snapshot(session, lock=True)" in lease_source
    assert "_require_running_runtime_for_admission(session)" in intake_source
    assert "ON CONFLICT (id) DO NOTHING" in init_source
    assert "activeLeaseCount" in status_source
    assert "runningAttemptCount" in status_source


def test_resume_contract_is_fenced_and_preserves_active_work() -> None:
    context = ResumeActionContextV1.model_validate(
        {"kind": "resume", "expectedRuntimeMode": "draining", "expectedRuntimeRevision": 3}
    )
    request = {
        "schemaVersion": "pipeline-operational-action/v1",
        "actionId": "resume",
        "targetType": "runtime",
        "targetId": "supervisor-runtime",
        "actionContext": context,
        "actionContextDigestSha256": operational_action_context_digest_sha256_v1(
            "resume", "runtime", "supervisor-runtime", context
        ),
        "serverBound": True,
        "outcome": "succeeded",
        "capabilityState": "available",
        "authorityState": "allowed",
        "riskTier": "low",
        "typedReason": None,
        "successEvidence": {
            "kind": "resume",
            "resultingRuntimeMode": "running",
            "resultingRuntimeRevision": 4,
            "activeWorkCount": 1,
            "activeLeaseCount": 1,
            "runningAttemptCount": 1,
            "intakeResumed": True,
            "activeWorkPreserved": True,
        },
        "evidenceRefs": ["test:resume:p2-2"],
        "correlationId": "corr-resume-p2-2",
        "idempotencyKey": "idem-resume-p2-2",
        "actionRecordId": "action-resume-p2-2",
        "approvalId": "approval-resume-p2-2",
        "replayed": False,
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }
    result = OperationalActionResultV1.model_validate(request)
    assert result.successEvidence.resultingRuntimeMode == "running"
