/** Report-only route state. None of these values permit execution. */
export type ReviewRouteState = "report_only" | "simulated" | "blocked";

export const REVIEW_ROUTE_DECISION_SCHEMA_VERSION = "review-route-decision/v2" as const;
export const DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1" as const;
export const NORMALIZED_FINDING_SCHEMA_VERSION = "normalized-finding/v1" as const;
export const SIMULATED_REVIEW_RESULT_SCHEMA_VERSION = "simulated-review-result/v2" as const;
export const SIMULATED_REVIEW_ADAPTER_ID = "simulated-review-fixture/v1" as const;

/** The only adapter identifier accepted for simulated review. It has no tools. */
export type ReviewRouteAdapterId = "none" | typeof SIMULATED_REVIEW_ADAPTER_ID;
export type NormalizedFindingSeverity = "info" | "low" | "medium" | "high";
export type SimulatedReviewResultState = "completed" | "stale" | "blocked";
export type SimulatedReviewResultCode =
  | "simulated_completed"
  | "simulated_deduplicated"
  | "immutable_identity_stale"
  | "packet_invalid"
  | "packet_already_used"
  | "decision_invalid"
  | "simulation_timeout"
  | "policy_vetoed"
  | "capability_unsupported"
  | "resource_blocked";

export interface ImmutableReviewIdentity {
  executionJobId: string;
  exactHead: string;
  digest: string;
}

export interface ReviewRouteReason {
  code: string;
  summary: string;
}

export interface ReviewRouteFallback {
  action: "retain_report_only" | "re_evaluate" | "reissue_disclosure_packet" | "resolve_policy_block";
  summary: string;
}

/** Compact authority proof. It is evidence only, never execution permission. */
export interface ReviewRouteAuthorityEvidence {
  issuerId: string;
  authorityRef: string;
  status: "valid" | "invalid";
}

/** Canonical non-executing route conclusion. */
export interface ReviewRouteDecision {
  schemaVersion: typeof REVIEW_ROUTE_DECISION_SCHEMA_VERSION;
  decisionId: string;
  state: ReviewRouteState;
  controllingReason: ReviewRouteReason;
  safeFallback: ReviewRouteFallback;
  immutableReview: ImmutableReviewIdentity | null;
  authorityEvidence: ReviewRouteAuthorityEvidence;
  disclosurePacketId: string | null;
  disclosurePacketDigest: string | null;
  metadataOnly: true;
  rawPayloadRetained: false;
  execution: "none";
}

export interface DisclosurePacketAuthority {
  issuerId: string;
  authorityRef: string;
  valid: true;
}

export interface DisclosurePacketIssuance {
  issuedAt: string;
  expiresAt: string;
  revocationState: "active" | "revoked";
  cancellationState: "active" | "cancelled";
  singleUse: true;
}

/** Metadata-only, exact-identity-bound disclosure preparation. */
export interface DisclosurePacket {
  schemaVersion: typeof DISCLOSURE_PACKET_SCHEMA_VERSION;
  disclosurePacketId: string;
  immutableReview: ImmutableReviewIdentity;
  routeAllowlist: readonly string[];
  adapterAllowlist: readonly ReviewRouteAdapterId[];
  toolAllowlist: readonly string[];
  authority: DisclosurePacketAuthority;
  issuance: DisclosurePacketIssuance;
  scope: {
    dataClass: "metadata_only";
    evidenceRefs: readonly string[];
  };
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Metadata-only simulated finding. */
export interface NormalizedFinding {
  schemaVersion: typeof NORMALIZED_FINDING_SCHEMA_VERSION;
  findingId: string;
  rule: string;
  severity: NormalizedFindingSeverity;
  pathOrRef: string;
  lineOrRange: string;
  summary: string;
  remediation: string;
  reviewedHead: string;
  digest: string;
}

interface SimulatedReviewResultBase {
  schemaVersion: typeof SIMULATED_REVIEW_RESULT_SCHEMA_VERSION;
  adapterId: typeof SIMULATED_REVIEW_ADAPTER_ID;
  code: SimulatedReviewResultCode;
  disclosurePacketId: string | null;
  disclosurePacketDigest: string | null;
  decisionId: string | null;
  reviewedHead: string | null;
  digest: string | null;
  deliveryEvidenceEligible: false;
  safeFallback: ReviewRouteFallback;
  execution: "none";
}

/** Pure simulation outcome. `blocked` and `stale` never carry findings. */
export type SimulatedReviewResult =
  | (SimulatedReviewResultBase & {
    state: "completed";
    code: "simulated_completed" | "simulated_deduplicated";
    findings: readonly NormalizedFinding[];
  })
  | (SimulatedReviewResultBase & {
    state: "stale" | "blocked";
    code: Exclude<SimulatedReviewResultCode, "simulated_completed" | "simulated_deduplicated">;
    findings: readonly [];
  });
