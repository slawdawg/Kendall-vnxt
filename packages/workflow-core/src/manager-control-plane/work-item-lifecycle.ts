import { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock } from "./clock";
import { lifecycleError, lifecycleOk, type ManagerLifecycleResult } from "./result";

export interface WorkItemTransition {
  toStatus: ManagerControlPlane.ManagerWorkItemStatus;
  leaseId?: ManagerControlPlane.LeaseId | null;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  clock: ManagerClock;
}

const terminalStatuses = new Set<ManagerControlPlane.ManagerWorkItemStatus>(["completed", "quarantined", "closed"]);
const runningCloseoutStatuses = new Set<ManagerControlPlane.ManagerWorkItemStatus>(["completed", "failed", "blocked", "expired"]);
const allowedTransitions = new Map<ManagerControlPlane.ManagerWorkItemStatus, readonly ManagerControlPlane.ManagerWorkItemStatus[]>([
  ["eligible", ["queued"]],
  ["queued", ["leased"]],
  ["leased", ["running"]],
  ["running", ["completed", "failed", "blocked", "expired"]],
  ["failed", ["queued", "quarantined", "blocked"]],
  ["expired", ["queued", "quarantined"]],
  ["blocked", ["closed"]],
  ["completed", ["closed"]],
  ["quarantined", ["closed"]],
  ["closed", []],
  ["refilling", ["queued", "blocked"]]
]);

export function transitionWorkItem(
  workItem: ManagerControlPlane.WorkItem,
  transition: WorkItemTransition
): ManagerLifecycleResult<ManagerControlPlane.WorkItem> {
  if (transition.evidenceRefs.length === 0) {
    return lifecycleError("missing_evidence", "Work item transition requires evidence refs.", transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  if (terminalStatuses.has(workItem.status) && transition.toStatus !== "closed") {
    return lifecycleError("terminal_state", "Terminal work cannot be reissued.", transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  const allowedNext = allowedTransitions.get(workItem.status) ?? [];
  if (!allowedNext.includes(transition.toStatus)) {
    return lifecycleError("invalid_transition", `Invalid work item transition ${workItem.status} -> ${transition.toStatus}.`, transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  if ((transition.toStatus === "leased" || transition.toStatus === "running") && !transition.leaseId) {
    return lifecycleError("missing_evidence", "Lease-bound work item transition requires lease id.", transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  if (transition.toStatus === "leased" && workItem.leaseId) {
    return lifecycleError("stale_lease", "Queued work already has a lease id and cannot receive a duplicate lease.", transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  if (transition.toStatus === "running" && workItem.leaseId !== transition.leaseId) {
    return lifecycleError("stale_lease", "Running transition must use the current lease id.", transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  if (workItem.status === "running" && runningCloseoutStatuses.has(transition.toStatus) && workItem.leaseId !== transition.leaseId) {
    return lifecycleError("stale_lease", "Running closeout transition must use the current lease id.", transition.evidenceRefs, {
      currentState: workItem.status,
      requestedState: transition.toStatus
    });
  }

  const nextLeaseId = leaseIdForTransition(workItem, transition);
  const nextAttemptCount = transition.toStatus === "leased" ? workItem.attemptCount + 1 : workItem.attemptCount;

  return lifecycleOk(
    {
      ...workItem,
      status: transition.toStatus,
      leaseId: nextLeaseId,
      attemptCount: nextAttemptCount,
      evidenceRefs: mergeEvidence(workItem.evidenceRefs, transition.evidenceRefs),
      updatedAt: transition.clock.nowIso()
    },
    transition.evidenceRefs
  );
}

function leaseIdForTransition(
  workItem: ManagerControlPlane.WorkItem,
  transition: WorkItemTransition
): ManagerControlPlane.LeaseId | null | undefined {
  if (transition.toStatus === "queued" || transition.toStatus === "quarantined" || transition.toStatus === "blocked" || transition.toStatus === "closed") {
    return transition.toStatus === "blocked" ? workItem.leaseId : null;
  }
  if (transition.toStatus === "leased" || transition.toStatus === "running") {
    return transition.leaseId ?? workItem.leaseId;
  }
  return workItem.leaseId;
}

function mergeEvidence(
  existing: readonly ManagerControlPlane.EvidenceRefId[],
  added: readonly ManagerControlPlane.EvidenceRefId[]
): readonly ManagerControlPlane.EvidenceRefId[] {
  return [...new Set([...existing, ...added])];
}

export function makeWorkItemFixture(overrides: Partial<ManagerControlPlane.WorkItem> = {}): ManagerControlPlane.WorkItem {
  return {
    workItemId: "work-item-1" as ManagerControlPlane.WorkItemId,
    runId: "run-1" as ManagerControlPlane.ManagerRunId,
    candidateWorkPacketId: "candidate-1" as ManagerControlPlane.CandidateWorkPacketId,
    sourceRefs: [
      {
        sourceRefId: "source-1" as ManagerControlPlane.ManagerSourceRefId,
        sourceType: "prd",
        label: "Story 1.2",
        pathOrUrl: "_bmad-output/planning-artifacts/epics.md",
        sourceSpan: "Story 1.2",
        summaryOnly: true
      }
    ],
    dedupeKey: "story-1.2",
    title: "Implement deterministic lifecycle state machines",
    sliceType: "backend_proof",
    status: "eligible",
    priority: "normal",
    authorityClass: "allowed_unattended",
    authorityDecisionId: "authority-1" as ManagerControlPlane.AuthorityDecisionId,
    verificationTargets: [
      {
        verificationTargetId: "verify-1" as ManagerControlPlane.VerificationTargetId,
        commandId: "manager-lifecycle-test",
        command: "node --test tests/manager-control-plane.lifecycle.test.mjs",
        expectedResult: "passes"
      }
    ],
    dependencies: [],
    attemptCount: 0,
    leaseId: null,
    evidenceRefs: ["evidence-source" as ManagerControlPlane.EvidenceRefId],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}
