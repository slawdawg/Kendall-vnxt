import type { ManagerControlPlane } from "@kendall/contracts";

export type ManagerLifecycleErrorCode =
  | "invalid_candidate_status"
  | "invalid_transition"
  | "missing_evidence"
  | "stale_lease"
  | "terminal_state"
  | "lease_expired"
  | "retry_limit_exceeded"
  | "invalid_input"
  | "no_work"
  | "authority_blocked";

export type ManagerLifecycleResult<T> =
  | {
      ok: true;
      value: T;
      evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
    }
  | {
      ok: false;
      code: ManagerLifecycleErrorCode;
      message: string;
      currentState?: string;
      requestedState?: string;
      evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
    };

export function lifecycleOk<T>(
  value: T,
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[]
): ManagerLifecycleResult<T> {
  return { ok: true, value, evidenceRefs };
}

export function lifecycleError<T>(
  code: ManagerLifecycleErrorCode,
  message: string,
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[],
  state?: { currentState?: string; requestedState?: string }
): ManagerLifecycleResult<T> {
  return { ok: false, code, message, evidenceRefs, ...state };
}

export function hasDecisionEvidence(input: {
  policyReason?: string | null;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}): boolean {
  return Boolean(input.policyReason?.trim()) && input.evidenceRefs.length > 0;
}
