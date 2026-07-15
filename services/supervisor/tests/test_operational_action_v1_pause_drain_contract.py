from __future__ import annotations

import inspect

from sqlalchemy import Integer, update
from sqlalchemy.dialects import postgresql

from supervisor.api.schemas import (
    DrainActionContextV1,
    PauseActionContextV1,
    OperationalActionResultV1,
    operational_action_context_digest_sha256_v1,
)
from supervisor.application.service import SupervisorService
from supervisor.infrastructure.db.database import (
    SUPERVISOR_CONTROL_POSTGRES_COLUMNS,
    SUPERVISOR_CONTROL_SQLITE_COLUMNS,
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
