import { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock } from "./clock";
import { lifecycleError, lifecycleOk, type ManagerLifecycleResult } from "./result";

export interface LeaseHeartbeatInput {
  leaseId: ManagerControlPlane.LeaseId;
  workerId: ManagerControlPlane.ManagerWorkerId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  idempotencyKey: ManagerControlPlane.ManagerIdempotencyKey;
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  clock: ManagerClock;
  ttlMs: number;
}

export interface LeaseCloseoutInput {
  leaseId: ManagerControlPlane.LeaseId;
  workerId: ManagerControlPlane.ManagerWorkerId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  idempotencyKey: ManagerControlPlane.ManagerIdempotencyKey;
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  clock: ManagerClock;
}

export interface ExpireLeaseInput {
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  clock: ManagerClock;
}

export function heartbeatLease(
  lease: ManagerControlPlane.Lease,
  input: LeaseHeartbeatInput
): ManagerLifecycleResult<ManagerControlPlane.Lease> {
  const fence = assertLeaseFence<ManagerControlPlane.Lease>(lease, input);
  if (fence) {
    return fence;
  }

  if (lease.state !== "leased" && lease.state !== "running") {
    return lifecycleError("terminal_state", "Only leased or running leases can receive heartbeats.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "running"
    });
  }

  if (input.evidenceRefs.length === 0) {
    return lifecycleError("missing_evidence", "Lease heartbeat requires evidence refs.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "running"
    });
  }

  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    return lifecycleError("invalid_input", "Lease heartbeat requires a positive finite ttlMs.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "running"
    });
  }

  const expiresAtEpochMs = parseLeaseExpiry(lease.expiresAt);
  if (!Number.isFinite(expiresAtEpochMs)) {
    return lifecycleError("invalid_input", "Lease expiry timestamp is invalid.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "running"
    });
  }

  if (input.clock.nowEpochMs() > expiresAtEpochMs) {
    return lifecycleError("lease_expired", "Lease heartbeat arrived after expiry.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "running"
    });
  }

  return lifecycleOk(
    {
      ...lease,
      state: "running",
      heartbeatAt: input.clock.nowIso(),
      expiresAt: new Date(input.clock.nowEpochMs() + input.ttlMs).toISOString(),
      evidenceRefs: mergeEvidence(lease.evidenceRefs, input.evidenceRefs),
      updatedAt: input.clock.nowIso()
    },
    input.evidenceRefs
  );
}

export function completeLease(
  workItem: ManagerControlPlane.WorkItem,
  lease: ManagerControlPlane.Lease,
  input: LeaseCloseoutInput
): ManagerLifecycleResult<{ workItem: ManagerControlPlane.WorkItem; lease: ManagerControlPlane.Lease }> {
  const stale = assertCurrentLease(workItem, lease, input);
  if (stale) {
    return stale;
  }

  return lifecycleOk(
    {
      workItem: {
        ...workItem,
        status: "completed",
        evidenceRefs: mergeEvidence(workItem.evidenceRefs, input.evidenceRefs),
        updatedAt: input.clock.nowIso()
      },
      lease: {
        ...lease,
        state: "completed",
        evidenceRefs: mergeEvidence(lease.evidenceRefs, input.evidenceRefs),
        updatedAt: input.clock.nowIso()
      }
    },
    input.evidenceRefs
  );
}

export function failLease(
  workItem: ManagerControlPlane.WorkItem,
  lease: ManagerControlPlane.Lease,
  input: LeaseCloseoutInput
): ManagerLifecycleResult<{ workItem: ManagerControlPlane.WorkItem; lease: ManagerControlPlane.Lease }> {
  const stale = assertCurrentLease(workItem, lease, input);
  if (stale) {
    return stale;
  }

  return lifecycleOk(
    {
      workItem: {
        ...workItem,
        status: "failed",
        evidenceRefs: mergeEvidence(workItem.evidenceRefs, input.evidenceRefs),
        updatedAt: input.clock.nowIso()
      },
      lease: {
        ...lease,
        state: "failed",
        evidenceRefs: mergeEvidence(lease.evidenceRefs, input.evidenceRefs),
        updatedAt: input.clock.nowIso()
      }
    },
    input.evidenceRefs
  );
}

export function expireLeaseIfStale(
  workItem: ManagerControlPlane.WorkItem,
  lease: ManagerControlPlane.Lease,
  input: ExpireLeaseInput
): ManagerLifecycleResult<{ workItem: ManagerControlPlane.WorkItem; lease: ManagerControlPlane.Lease }> {
  if (input.evidenceRefs.length === 0) {
    return lifecycleError("missing_evidence", "Lease expiry requires evidence refs.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "expired"
    });
  }

  if (workItem.leaseId !== lease.leaseId) {
    return lifecycleError("stale_lease", "Cannot expire a lease that is not current for the work item.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "expired"
    });
  }

  if (isTerminalWorkItem(workItem.status) || isTerminalLease(lease.state)) {
    return lifecycleError("terminal_state", "Terminal work or lease cannot be expired again.", input.evidenceRefs, {
      currentState: `${workItem.status}/${lease.state}`,
      requestedState: "expired"
    });
  }

  const expiresAtEpochMs = parseLeaseExpiry(lease.expiresAt);
  if (!Number.isFinite(expiresAtEpochMs)) {
    return lifecycleError("invalid_input", "Lease expiry timestamp is invalid.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "expired"
    });
  }

  if (input.clock.nowEpochMs() <= expiresAtEpochMs) {
    return lifecycleError("invalid_transition", "Lease has not reached expiry.", input.evidenceRefs, {
      currentState: lease.state,
      requestedState: "expired"
    });
  }

  return lifecycleOk(
    {
      workItem: {
        ...workItem,
        status: "expired",
        evidenceRefs: mergeEvidence(workItem.evidenceRefs, input.evidenceRefs),
        updatedAt: input.clock.nowIso()
      },
      lease: {
        ...lease,
        state: "expired",
        evidenceRefs: mergeEvidence(lease.evidenceRefs, input.evidenceRefs),
        updatedAt: input.clock.nowIso()
      }
    },
    input.evidenceRefs
  );
}

function assertCurrentLease(
  workItem: ManagerControlPlane.WorkItem,
  lease: ManagerControlPlane.Lease,
  input: LeaseCloseoutInput
): ManagerLifecycleResult<{ workItem: ManagerControlPlane.WorkItem; lease: ManagerControlPlane.Lease }> | null {
  if (input.evidenceRefs.length === 0) {
    return lifecycleError("missing_evidence", "Lease closeout requires evidence refs.", input.evidenceRefs, {
      currentState: lease.state
    });
  }

  const fence = assertLeaseFence<{ workItem: ManagerControlPlane.WorkItem; lease: ManagerControlPlane.Lease }>(lease, input);
  if (fence) {
    return fence;
  }

  if (workItem.leaseId !== input.leaseId) {
    return lifecycleError("stale_lease", "Lease closeout does not match current work item lease.", input.evidenceRefs, {
      currentState: lease.state
    });
  }

  if (workItem.status !== "running" || lease.state !== "running") {
    return lifecycleError(
      isTerminalWorkItem(workItem.status) || isTerminalLease(lease.state) ? "terminal_state" : "invalid_transition",
      "Lease closeout requires running work and a running lease.",
      input.evidenceRefs,
      {
        currentState: `${workItem.status}/${lease.state}`
      }
    );
  }

  const expiresAtEpochMs = parseLeaseExpiry(lease.expiresAt);
  if (!Number.isFinite(expiresAtEpochMs)) {
    return lifecycleError("invalid_input", "Lease expiry timestamp is invalid.", input.evidenceRefs, {
      currentState: lease.state
    });
  }

  if (input.clock.nowEpochMs() > expiresAtEpochMs) {
    return lifecycleError("lease_expired", "Lease closeout arrived after expiry.", input.evidenceRefs, {
      currentState: lease.state
    });
  }

  return null;
}

function assertLeaseFence<T>(
  lease: ManagerControlPlane.Lease,
  input: Pick<LeaseHeartbeatInput, "leaseId" | "workerId" | "attemptId" | "idempotencyKey" | "authorityDecisionId" | "evidenceRefs">
): ManagerLifecycleResult<T> | null {
  if (
    lease.leaseId !== input.leaseId ||
    lease.workerId !== input.workerId ||
    lease.attemptId !== input.attemptId ||
    lease.idempotencyKey !== input.idempotencyKey ||
    lease.authorityDecisionId !== input.authorityDecisionId
  ) {
    return lifecycleError("stale_lease", "Lease fencing metadata does not match active lease.", input.evidenceRefs, {
      currentState: lease.state
    });
  }
  return null;
}

function parseLeaseExpiry(expiresAt: string): number {
  return Date.parse(expiresAt);
}

function isTerminalWorkItem(status: ManagerControlPlane.ManagerWorkItemStatus): boolean {
  return status === "completed" || status === "quarantined" || status === "closed";
}

function isTerminalLease(status: ManagerControlPlane.ManagerLeaseStatus): boolean {
  return status === "completed" || status === "failed" || status === "expired" || status === "blocked";
}

function mergeEvidence(
  existing: readonly ManagerControlPlane.EvidenceRefId[],
  added: readonly ManagerControlPlane.EvidenceRefId[]
): readonly ManagerControlPlane.EvidenceRefId[] {
  return [...new Set([...existing, ...added])];
}

export function makeLeaseFixture(overrides: Partial<ManagerControlPlane.Lease> = {}): ManagerControlPlane.Lease {
  return {
    leaseId: "lease-1" as ManagerControlPlane.LeaseId,
    workItemId: "work-item-1" as ManagerControlPlane.WorkItemId,
    workerId: "worker-1" as ManagerControlPlane.ManagerWorkerId,
    attemptId: "attempt-1" as ManagerControlPlane.ExecutionAttemptId,
    state: "leased",
    claimedAt: "2026-06-30T00:00:00.000Z",
    heartbeatAt: "2026-06-30T00:00:00.000Z",
    expiresAt: "2026-06-30T00:05:00.000Z",
    attempt: 1,
    idempotencyKey: "idempotency-1" as ManagerControlPlane.ManagerIdempotencyKey,
    authorityDecisionId: "authority-1" as ManagerControlPlane.AuthorityDecisionId,
    evidenceRefs: ["evidence-lease" as ManagerControlPlane.EvidenceRefId],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}
