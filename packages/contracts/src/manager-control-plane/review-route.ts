/** Report-only route state. None of these values permit execution. */
export type ReviewRouteState = "report_only" | "simulated" | "blocked";

export const REVIEW_ROUTE_DECISION_SCHEMA_VERSION = "review-route-decision/v2" as const;
export const DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1" as const;
export const NORMALIZED_FINDING_SCHEMA_VERSION = "normalized-finding/v1" as const;
export const SIMULATED_REVIEW_RESULT_SCHEMA_VERSION = "simulated-review-result/v2" as const;
export const SIMULATED_REVIEW_ADAPTER_ID = "simulated-review-fixture/v1" as const;
export const CLAUDE_READONLY_INJECTED_ADAPTER_ID = "claude-readonly-injected/v1" as const;
export const OLLAMA_EXACT_INJECTED_ADAPTER_ID = "ollama-exact-injected/v1" as const;
export const BMAD_GOVERNED_RUNNER_ADAPTER_ID = "bmad-governed-runner/v1" as const;

/** Report-only ordering; selecting a route never launches it. */
export type CanonicalReviewFallbackRouteId = "claude_readonly" | "ollama_exact" | "bmad_local";
export type ReviewDisclosureDataClass = "metadata_only" | "sanitized_path_scoped_private_diff";

/** The only adapter identifier accepted for simulated review. It has no tools. */
export type ReviewRouteAdapterId = "none" | typeof SIMULATED_REVIEW_ADAPTER_ID | typeof CLAUDE_READONLY_INJECTED_ADAPTER_ID | typeof OLLAMA_EXACT_INJECTED_ADAPTER_ID | typeof BMAD_GOVERNED_RUNNER_ADAPTER_ID;
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

export interface CanonicalReviewFallbackDecision {
  schemaVersion: "canonical-review-fallback/v1";
  state: "report_only" | "blocked";
  orderedRouteIds: readonly CanonicalReviewFallbackRouteId[];
  selectedRouteId: CanonicalReviewFallbackRouteId | null;
  skippedRouteIds: readonly CanonicalReviewFallbackRouteId[];
  controllingReason: ReviewRouteReason;
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

/** A path/digest pair only; the sanitized diff body is never retained here. */
export interface SanitizedPathScopedDiffRef {
  path: string;
  diffDigest: string;
}

/** Exact-identity-bound disclosure preparation with metadata-only local retention. */
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
    dataClass: ReviewDisclosureDataClass;
    evidenceRefs: readonly string[];
    pathScope: readonly SanitizedPathScopedDiffRef[];
  };
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Compact approval bound to one packet and immutable review identity. */
export interface InjectedReviewApproval {
  status: "accepted";
  authorityRef: string;
  disclosurePacketId: string;
  exactHead: string;
  reviewScope: "sanitized_path_scoped_private_diff";
}

/** No endpoint URL or model payload is retained in this injected-gate fact. */
export interface ExactOllamaReviewGate {
  enabled: true;
  endpointApproved: true;
  modelApproved: true;
  endpointRef: string;
  modelRef: string;
}

/**
 * A terminal result and compact evidence must be committed in one store
 * transaction by the future runtime integration. This source contract itself
 * is integration-agnostic and retains no raw request or response content.
 */
export interface ReviewExecutionTerminal {
  schemaVersion: "review-execution-terminal/v1";
  state: "review_satisfied" | "review_unsatisfied" | "stale";
  code: string;
  deliveryEvidenceEligible: false;
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
  deliveryEvidenceEligible: false;
  safeFallback: ReviewRouteFallback;
  execution: "none";
}

/** Pure simulation outcome. `blocked` and `stale` never carry findings. */
export type SimulatedReviewResult =
  | (SimulatedReviewResultBase & {
    state: "completed";
    code: "simulated_completed";
    findings: readonly [NormalizedFinding];
    disclosurePacketId: string;
    disclosurePacketDigest: string;
    decisionId: string;
    reviewedHead: string;
    digest: string;
  })
  | (SimulatedReviewResultBase & {
    state: "completed";
    code: "simulated_deduplicated";
    findings: readonly [];
    disclosurePacketId: string;
    disclosurePacketDigest: string;
    decisionId: string;
    reviewedHead: string;
    digest: string;
  })
  | (SimulatedReviewResultBase & {
    state: "stale";
    code: "immutable_identity_stale";
    findings: readonly [];
    disclosurePacketId: null;
    disclosurePacketDigest: null;
    decisionId: null;
    reviewedHead: string;
    digest: string;
  })
  | (SimulatedReviewResultBase & {
    state: "blocked";
    code: Exclude<SimulatedReviewResultCode, "simulated_completed" | "simulated_deduplicated" | "immutable_identity_stale">;
    findings: readonly [];
    disclosurePacketId: null;
    disclosurePacketDigest: null;
    decisionId: null;
    reviewedHead: string;
    digest: string;
  })
  | (SimulatedReviewResultBase & {
    state: "blocked";
    code: Exclude<SimulatedReviewResultCode, "simulated_completed" | "simulated_deduplicated" | "immutable_identity_stale">;
    findings: readonly [];
    disclosurePacketId: null;
    disclosurePacketDigest: null;
    decisionId: null;
    reviewedHead: null;
    digest: null;
  });
