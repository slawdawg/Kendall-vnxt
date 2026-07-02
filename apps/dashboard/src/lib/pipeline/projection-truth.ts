import type { PipelineDashboardProjectionV0 } from "@kendall/contracts";

export type ProjectionLiveProofFailureReason =
  | "no_projection"
  | "source_not_live"
  | "freshness_not_live"
  | "truth_label_not_live"
  | "backend_empty_truth"
  | "fixture_backed_truth"
  | "stale_truth"
  | "backend_unavailable_truth"
  | "fixture_mode_enabled"
  | "fixture_mode_contract_allows_live_proof";

export type ProjectionLiveProofState = {
  canSatisfyLiveProof: boolean;
  failureReasons: ProjectionLiveProofFailureReason[];
  primaryReason: ProjectionLiveProofFailureReason | null;
};

export function projectionHasRenderableBackendPackets(projection: PipelineDashboardProjectionV0 | null) {
  return Boolean(projection && projection.workPackets.length > 0);
}

export function projectionLiveProofState(
  projection: PipelineDashboardProjectionV0 | null,
  sourceLabel: PipelineDashboardProjectionV0["sourceLabel"],
  freshnessState: PipelineDashboardProjectionV0["freshnessState"]
): ProjectionLiveProofState {
  if (!projection) {
    return {
      canSatisfyLiveProof: false,
      failureReasons: ["no_projection"],
      primaryReason: "no_projection",
    };
  }

  const failureReasons: ProjectionLiveProofFailureReason[] = [];
  if (sourceLabel !== "live") {
    failureReasons.push("source_not_live");
  }
  if (freshnessState !== "live") {
    failureReasons.push("freshness_not_live");
  }
  if (projection.truthSummary.label !== "live") {
    failureReasons.push("truth_label_not_live");
  }
  if (projection.truthSummary.backendEmpty === true) {
    failureReasons.push("backend_empty_truth");
  }
  if (!(projection.truthSummary.fixtureBacked === false)) {
    failureReasons.push("fixture_backed_truth");
  }
  if (!(projection.truthSummary.stale === false)) {
    failureReasons.push("stale_truth");
  }
  if (!(projection.truthSummary.backendUnavailable === false) || projection.backendReachability.state !== "reachable") {
    failureReasons.push("backend_unavailable_truth");
  }
  if (!(projection.fixtureMode.enabled === false)) {
    failureReasons.push("fixture_mode_enabled");
  }
  if (!(projection.fixtureMode.canSatisfyLiveProof === false)) {
    failureReasons.push("fixture_mode_contract_allows_live_proof");
  }

  return {
    canSatisfyLiveProof: failureReasons.length === 0,
    failureReasons,
    primaryReason: failureReasons[0] ?? null,
  };
}

export function projectionDisplayLabels(
  projection: PipelineDashboardProjectionV0 | null,
  sourceLabel: PipelineDashboardProjectionV0["sourceLabel"],
  freshnessState: PipelineDashboardProjectionV0["freshnessState"],
  refreshUnavailable: boolean,
  liveProofState = projectionLiveProofState(projection, sourceLabel, freshnessState)
): {
  sourceLabel: PipelineDashboardProjectionV0["sourceLabel"];
  freshnessState: PipelineDashboardProjectionV0["freshnessState"];
} {
  if (refreshUnavailable || !projection) {
    return { sourceLabel: "unavailable", freshnessState: "unavailable" };
  }
  if (liveProofState.canSatisfyLiveProof) {
    return { sourceLabel, freshnessState };
  }
  if (
    liveProofState.failureReasons.includes("fixture_backed_truth")
    || liveProofState.failureReasons.includes("fixture_mode_enabled")
    || liveProofState.failureReasons.includes("fixture_mode_contract_allows_live_proof")
  ) {
    return { sourceLabel: "fixture", freshnessState: "unknown" };
  }
  if (liveProofState.failureReasons.includes("backend_unavailable_truth")) {
    return { sourceLabel: "unavailable", freshnessState: "unavailable" };
  }
  if (liveProofState.failureReasons.includes("stale_truth")) {
    return { sourceLabel: "stale", freshnessState: "stale" };
  }
  switch (liveProofState.primaryReason) {
    case "backend_empty_truth":
      return { sourceLabel, freshnessState };
    case "fixture_backed_truth":
    case "fixture_mode_enabled":
    case "fixture_mode_contract_allows_live_proof":
      return { sourceLabel: "fixture", freshnessState: "unknown" };
    case "stale_truth":
      return { sourceLabel: "stale", freshnessState: "stale" };
    case "backend_unavailable_truth":
      return { sourceLabel: "unavailable", freshnessState: "unavailable" };
    case "truth_label_not_live":
      return {
        sourceLabel: projection.truthSummary.label,
        freshnessState: projection.truthSummary.label === "stale" ? "stale" : freshnessState === "live" ? "unknown" : freshnessState,
      };
    case "source_not_live":
    case "freshness_not_live":
    default:
      return { sourceLabel, freshnessState };
  }
}

export function projectionIsLiveForProof(
  projection: PipelineDashboardProjectionV0,
  sourceLabel: PipelineDashboardProjectionV0["sourceLabel"],
  freshnessState: PipelineDashboardProjectionV0["freshnessState"]
) {
  return projectionLiveProofState(projection, sourceLabel, freshnessState).canSatisfyLiveProof;
}

export function projectionLiveProofLabel(state: ProjectionLiveProofState) {
  if (state.canSatisfyLiveProof) {
    return "live backend proof";
  }
  switch (state.primaryReason) {
    case "no_projection":
      return "not live proof: no projection";
    case "source_not_live":
      return "not live proof: source not live";
    case "freshness_not_live":
      return "not live proof: freshness not live";
    case "truth_label_not_live":
      return "not live proof: truth label not live";
    case "backend_empty_truth":
      return "not live proof: backend empty";
    case "fixture_backed_truth":
      return "not live proof: fixture backed";
    case "stale_truth":
      return "not live proof: stale";
    case "backend_unavailable_truth":
      return "not live proof: backend unavailable";
    case "fixture_mode_enabled":
      return "not live proof: fixture mode enabled";
    case "fixture_mode_contract_allows_live_proof":
      return "not live proof: fixture contract invalid";
    default:
      return "not live proof";
  }
}
