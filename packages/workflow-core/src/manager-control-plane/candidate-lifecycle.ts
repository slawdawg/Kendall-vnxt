import { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock } from "./clock";
import { hasDecisionEvidence, lifecycleError, lifecycleOk, type ManagerLifecycleResult } from "./result";

export interface CandidateEligibilityDecision {
  status: ManagerControlPlane.ManagerCandidateWorkPacketStatus;
  policyReason: string;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  clock: ManagerClock;
}

export interface CandidateEligibilityDecisionRecord {
  status: ManagerControlPlane.ManagerCandidateWorkPacketStatus;
  policyReason: string;
  sourceRefs: readonly ManagerControlPlane.ManagerSourceRef[];
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass;
  authorityStage: ManagerControlPlane.ManagerAuthorityStage;
  verificationTargets: readonly ManagerControlPlane.VerificationTarget[];
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  decidedAt: string;
}

export interface CandidateEligibilityEvaluation {
  candidate: ManagerControlPlane.CandidateWorkPacket;
  decisionRecord: CandidateEligibilityDecisionRecord;
}

const candidateStatuses = new Set<string>(ManagerControlPlane.CANDIDATE_WORK_PACKET_STATUSES);

export function evaluateCandidateEligibility(
  candidate: ManagerControlPlane.CandidateWorkPacket,
  decision: CandidateEligibilityDecision
): ManagerLifecycleResult<CandidateEligibilityEvaluation> {
  if (!candidateStatuses.has(decision.status)) {
    return lifecycleError("invalid_candidate_status", `Unsupported candidate status: ${decision.status}`, decision.evidenceRefs, {
      currentState: candidate.status,
      requestedState: decision.status
    });
  }

  if (!hasDecisionEvidence(decision)) {
    return lifecycleError("missing_evidence", "Candidate eligibility requires policy reason and evidence refs.", decision.evidenceRefs, {
      currentState: candidate.status,
      requestedState: decision.status
    });
  }

  if (
    candidate.sourceRefs.length === 0 ||
    candidate.verificationTargets.length === 0 ||
    !candidate.authorityClass ||
    candidate.evidenceRefs.length === 0
  ) {
    return lifecycleError("missing_evidence", "Candidate packet is missing required source, authority, verification, or evidence context.", decision.evidenceRefs, {
      currentState: candidate.status,
      requestedState: decision.status
    });
  }

  const decidedAt = decision.clock.nowIso();
  const evidenceRefs = mergeEvidence(candidate.evidenceRefs, decision.evidenceRefs);

  return lifecycleOk(
    {
      candidate: {
      ...candidate,
      status: decision.status,
        evidenceRefs,
        updatedAt: decidedAt
      },
      decisionRecord: {
        status: decision.status,
        policyReason: decision.policyReason,
        sourceRefs: candidate.sourceRefs,
        authorityClass: candidate.authorityClass,
        authorityStage: candidate.authorityStage,
        verificationTargets: candidate.verificationTargets,
        evidenceRefs: decision.evidenceRefs,
        decidedAt
      }
    },
    decision.evidenceRefs
  );
}

function mergeEvidence(
  existing: readonly ManagerControlPlane.EvidenceRefId[],
  added: readonly ManagerControlPlane.EvidenceRefId[]
): readonly ManagerControlPlane.EvidenceRefId[] {
  return [...new Set([...existing, ...added])];
}

export function makeCandidateWorkPacketFixture(
  overrides: Partial<ManagerControlPlane.CandidateWorkPacket> = {}
): ManagerControlPlane.CandidateWorkPacket {
  return {
    candidateWorkPacketId: "candidate-1" as ManagerControlPlane.CandidateWorkPacketId,
    runId: "run-1" as ManagerControlPlane.ManagerRunId,
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
    proposedSlice: "Implement deterministic lifecycle state machines",
    acceptanceCriteria: ["transitions are deterministic"],
    verificationTargets: [
      {
        verificationTargetId: "verify-1" as ManagerControlPlane.VerificationTargetId,
        commandId: "manager-lifecycle-test",
        command: "node --test tests/manager-control-plane.lifecycle.test.mjs",
        expectedResult: "passes"
      }
    ],
    riskClass: "low",
    dependencyHints: [],
    dedupeKey: "story-1.2",
    authorityClass: "allowed_unattended",
    authorityStage: "backend_proof",
    status: "blocked",
    policyId: "policy-1" as ManagerControlPlane.ManagerPolicyId,
    evidenceRefs: ["evidence-source" as ManagerControlPlane.EvidenceRefId],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}
