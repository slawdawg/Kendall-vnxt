/** Report-only route state. None of these values permit execution. */
export type ReviewRouteState = "report_only" | "simulated" | "blocked";

export const REVIEW_ROUTE_DECISION_SCHEMA_VERSION = "review-route-decision/v1" as const;
export const DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1" as const;

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
  adapterAllowlist: readonly string[];
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
