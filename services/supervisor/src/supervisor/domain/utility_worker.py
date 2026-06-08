from dataclasses import dataclass
from enum import StrEnum


class UtilityWorkerStatus(StrEnum):
    SUCCEEDED = "succeeded"
    REJECTED = "rejected"


@dataclass(frozen=True)
class UtilityWorkerTask:
    work_item_id: str
    step_id: str
    task_kind: str
    function_id: str
    allowed_paths: tuple[str, ...] = ()
    timeout_seconds: int = 30


@dataclass(frozen=True)
class UtilityWorkerResult:
    worker_id: str
    function_id: str
    status: UtilityWorkerStatus
    failure_reason: str | None = None


class UtilityWorkerAdapter:
    worker_id = "utility.internal"

    def __init__(self, allowed_function_ids: set[str] | None = None) -> None:
        self.allowed_function_ids = {"supervisor_triage"} if allowed_function_ids is None else allowed_function_ids

    def run(self, task: UtilityWorkerTask) -> UtilityWorkerResult:
        if task.function_id not in self.allowed_function_ids:
            return UtilityWorkerResult(
                worker_id=self.worker_id,
                function_id=task.function_id,
                status=UtilityWorkerStatus.REJECTED,
                failure_reason="utility.function_not_allowlisted",
            )
        return UtilityWorkerResult(
            worker_id=self.worker_id,
            function_id=task.function_id,
            status=UtilityWorkerStatus.SUCCEEDED,
        )

