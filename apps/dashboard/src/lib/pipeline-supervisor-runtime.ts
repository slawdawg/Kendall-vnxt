import type { PipelineDashboardProjectionV0, WorkPacketV0View } from "@kendall/contracts";
import {
  isPipelineDashboardProjection,
  normalizePipelineDashboardProjection,
} from "./pipeline-supervisor-projection";
import { requestSupervisorJson } from "./dashboard-supervisor-transport";

function requestJson<T>(path: string): Promise<T> {
  return requestSupervisorJson<T>(path, { timeoutMs: 10_000, rejectServerLanAuth: true });
}

export async function getWorkPacket(packetId: string): Promise<WorkPacketV0View> {
  return requestJson<WorkPacketV0View>(`/work-packets/${encodeURIComponent(packetId)}`);
}

export async function getWorkPackets(): Promise<WorkPacketV0View[]> {
  return requestJson<WorkPacketV0View[]>("/work-packets");
}

export async function getPipelineDashboardProjection(): Promise<PipelineDashboardProjectionV0> {
  const projection = normalizePipelineDashboardProjection(
    await requestJson<Partial<PipelineDashboardProjectionV0>>("/pipeline-control-plane/projection"),
  );
  if (!isPipelineDashboardProjection(projection)) {
    throw new Error("Invalid projection payload");
  }
  return projection;
}
