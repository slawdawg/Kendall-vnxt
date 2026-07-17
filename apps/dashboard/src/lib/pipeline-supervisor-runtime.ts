import type { PipelineDashboardProjectionV0, WorkPacketV0View } from "@kendall/contracts";
import {
  isPipelineDashboardProjection,
  normalizePipelineDashboardProjection,
} from "./pipeline-supervisor-projection";
import { requestSupervisorJson } from "./dashboard-supervisor-transport";

function requestJson<T>(path: string): Promise<T> {
  return requestSupervisorJson<T>(path, { timeoutMs: 10_000, rejectServerLanAuth: true });
}

function requestLegacyJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "message" in error && typeof error.message === "string" && /\(404\)$/.test(error.message));
}

export async function getWorkPacket(packetId: string): Promise<WorkPacketV0View> {
  const canonicalPath = `/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}`;
  const legacyPath = `/work-packets/${encodeURIComponent(packetId)}`;
  try {
    return await requestJson<WorkPacketV0View>(canonicalPath);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return requestLegacyJson<WorkPacketV0View>(legacyPath);
  }
}

export async function getWorkPackets(): Promise<WorkPacketV0View[]> {
  try {
    return await requestJson<WorkPacketV0View[]>("/pipeline-control-plane/work-packets");
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return requestLegacyJson<WorkPacketV0View[]>("/work-packets");
  }
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
