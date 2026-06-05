import type { BmadLane, WorkflowState } from "@kendall/contracts";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatWorkflowState(state: WorkflowState | string): string {
  return titleCase(state);
}

export function formatLane(lane: BmadLane | string | null | undefined): string {
  if (!lane) {
    return "Not assigned";
  }

  return {
    intake: "Queue intake",
    implementation: "Implementation",
    validation: "Validation",
    review: "Review",
    corrective_loop: "Corrective loop",
  }[lane] ?? titleCase(lane);
}
