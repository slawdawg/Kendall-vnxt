/**
 * Dashboard-owned operational truth boundary. This deliberately starts with
 * the small, behavior-critical projection surface shared by cockpit action
 * gating. Broader board/detail state is added here before each V0 consumer is
 * migrated; normal callers must not introduce a new V0 alias.
 */
export type DashboardCanonicalOperationalSourceLabelV1 =
  | "live"
  | "stale"
  | "fixture"
  | "simulated"
  | "dry_run"
  | "unavailable"
  | "unknown";

export type DashboardCanonicalOperationalFreshnessV1 = "live" | "stale" | "unavailable" | "unknown";

export type DashboardCanonicalOperationalProjectionTruthV1 = {
  schemaVersion: "dashboard-canonical-operational-projection/v1";
  sourceUpdatedAt: string;
  staleAfterSeconds: number;
  sourceLabel: DashboardCanonicalOperationalSourceLabelV1;
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  truthSummary: {
    label: DashboardCanonicalOperationalSourceLabelV1;
    backendEmpty: boolean;
    backendUnavailable: boolean;
    fixtureBacked: boolean;
    stale: boolean;
  };
  backendReachability: {
    state: "reachable" | "unavailable" | "unknown";
  };
  fixtureMode: {
    enabled: boolean;
    canSatisfyLiveProof: false;
  };
  workPackets: readonly { packetId: string }[];
};

/** Structural input accepted while the server-side V0 read adapter is retired. */
export type DashboardCanonicalOperationalProjectionTruthInputV1 = Omit<
  DashboardCanonicalOperationalProjectionTruthV1,
  "schemaVersion"
>;
