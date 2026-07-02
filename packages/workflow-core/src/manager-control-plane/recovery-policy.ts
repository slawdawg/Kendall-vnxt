import { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock } from "./clock";
import { lifecycleError, lifecycleOk, type ManagerLifecycleResult } from "./result";

export type RecoveryDecision = "retry" | "quarantine" | "requeue" | "blocked";

export interface RecoveryInput {
  maxAttempts: number;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  clock: ManagerClock;
}

export interface RecoveryResult {
  decision: RecoveryDecision;
  workItem: ManagerControlPlane.WorkItem;
}

export function recoverWorkItem(
  workItem: ManagerControlPlane.WorkItem,
  input: RecoveryInput
): ManagerLifecycleResult<RecoveryResult> {
  if (!Number.isFinite(input.maxAttempts) || input.maxAttempts <= 0) {
    return lifecycleError("invalid_input", "Recovery requires a positive finite maxAttempts value.", input.evidenceRefs, {
      currentState: workItem.status
    });
  }

  if (input.evidenceRefs.length === 0) {
    return lifecycleError("missing_evidence", "Recovery requires evidence refs.", input.evidenceRefs, {
      currentState: workItem.status
    });
  }

  if (workItem.status === "completed" || workItem.status === "closed") {
    return lifecycleError("terminal_state", "Terminal work cannot be recovered.", input.evidenceRefs, {
      currentState: workItem.status
    });
  }

  if (workItem.status === "blocked") {
    return lifecycleOk(
      {
        decision: "blocked",
        workItem: {
          ...workItem,
          evidenceRefs: mergeEvidence(workItem.evidenceRefs, input.evidenceRefs),
          updatedAt: input.clock.nowIso()
        }
      },
      input.evidenceRefs
    );
  }

  if (workItem.status === "failed") {
    if (workItem.attemptCount >= input.maxAttempts) {
      return lifecycleOk(
        {
          decision: "quarantine",
          workItem: recoverAs(workItem, "quarantined", input)
        },
        input.evidenceRefs
      );
    }
    return lifecycleOk(
      {
        decision: "retry",
        workItem: recoverAs(workItem, "queued", input)
      },
      input.evidenceRefs
    );
  }

  if (workItem.status === "expired") {
    if (workItem.attemptCount >= input.maxAttempts) {
      return lifecycleOk(
        {
          decision: "quarantine",
          workItem: recoverAs(workItem, "quarantined", input)
        },
        input.evidenceRefs
      );
    }
    return lifecycleOk(
      {
        decision: "requeue",
        workItem: recoverAs(workItem, "queued", input)
      },
      input.evidenceRefs
    );
  }

  return lifecycleError("invalid_transition", `No recovery policy for ${workItem.status}.`, input.evidenceRefs, {
    currentState: workItem.status
  });
}

function recoverAs(
  workItem: ManagerControlPlane.WorkItem,
  status: ManagerControlPlane.ManagerWorkItemStatus,
  input: RecoveryInput
): ManagerControlPlane.WorkItem {
  return {
    ...workItem,
    status,
    leaseId: null,
    evidenceRefs: mergeEvidence(workItem.evidenceRefs, input.evidenceRefs),
    updatedAt: input.clock.nowIso()
  };
}

function mergeEvidence(
  existing: readonly ManagerControlPlane.EvidenceRefId[],
  added: readonly ManagerControlPlane.EvidenceRefId[]
): readonly ManagerControlPlane.EvidenceRefId[] {
  return [...new Set([...existing, ...added])];
}
