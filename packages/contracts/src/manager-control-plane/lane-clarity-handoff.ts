import type { ManagerLaneClarity } from "./summary";

declare const managerLaneClarityHandoffIdBrand: unique symbol;

/** Stable identity for a metadata-only manager lane-clarity handoff receipt. */
export type ManagerLaneClarityHandoffId = `manager-lane-clarity-handoff:${string}` & {
  readonly [managerLaneClarityHandoffIdBrand]: true;
};

export const MANAGER_LANE_CLARITY_HANDOFF_SCHEMA_VERSION = "manager-lane-clarity-handoff/v0" as const;

export const MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS = [
  "schemaVersion",
  "handoffId",
  "selectedLaneId",
  "runId",
  "eventWatermark",
  "sourceCursor",
  "sourceSequence",
  "observedAt",
  "laneClarity",
  "idempotencyKey",
  "metadataOnly",
  "rawPayloadRetained",
] as const;

export const MANAGER_LANE_CLARITY_HANDOFF_VIEW_FIELDS = [
  ...MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS,
  "owner",
  "createdAt",
] as const;

export const MANAGER_LANE_CLARITY_HANDOFF_API_ENVELOPE_FIELDS = ["data", "meta"] as const;
export const MANAGER_LANE_CLARITY_HANDOFF_API_ENVELOPE_REQUIRED_FIELDS = ["data"] as const;

/** Exact metadata-only request accepted by the loopback supervisor endpoint. */
export interface ManagerLaneClarityHandoffRequest {
  schemaVersion: typeof MANAGER_LANE_CLARITY_HANDOFF_SCHEMA_VERSION;
  handoffId: ManagerLaneClarityHandoffId;
  selectedLaneId: string;
  runId: ManagerLaneClarity["runId"];
  eventWatermark: ManagerLaneClarity["eventWatermark"];
  sourceCursor: ManagerLaneClarity["sourceCursor"];
  sourceSequence: number;
  observedAt: string;
  laneClarity: ManagerLaneClarity;
  idempotencyKey: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Supervisor-owned receipt for an exact manager snapshot. */
export interface ManagerLaneClarityHandoffView extends ManagerLaneClarityHandoffRequest {
  owner: "supervisor";
  createdAt: string;
}

export interface ManagerLaneClarityHandoffApiEnvelope {
  data: ManagerLaneClarityHandoffView;
  meta?: Readonly<Record<string, string | number | boolean | null>> | null;
}
