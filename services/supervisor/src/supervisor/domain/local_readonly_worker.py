from dataclasses import dataclass
from enum import StrEnum


class LocalReadonlyWorkerStatus(StrEnum):
    SUCCEEDED = "succeeded"


@dataclass(frozen=True)
class LocalReadonlyWorkerResult:
    worker_id: str
    run_id: str
    packet_id: str
    status: LocalReadonlyWorkerStatus
    summary: str
    recommendations: tuple[str, ...]
    writes_allowed: bool = False
    commands_allowed: bool = False


class MockLocalReadonlyWorkerAdapter:
    worker_id = "local.readonly.mock"

    def run(
        self,
        packet_id: str,
        work_item_id: str,
        evidence_count: int,
        route_lane: str,
    ) -> LocalReadonlyWorkerResult:
        return LocalReadonlyWorkerResult(
            worker_id=self.worker_id,
            run_id=f"mock-local-readonly-{work_item_id}",
            packet_id=packet_id,
            status=LocalReadonlyWorkerStatus.SUCCEEDED,
            summary=f"Mock local read-only worker reviewed {evidence_count} evidence item(s) through the {route_lane} route.",
            recommendations=(
                "Use this as deterministic boundary validation, not model reasoning.",
                "Escalate to subscription handoff if the evidence packet is insufficient.",
            ),
        )

