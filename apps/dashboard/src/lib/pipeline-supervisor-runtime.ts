import type {
  AuthoritativeWorkPacketLifecycleView,
  PipelineDashboardProjectionV0,
  WorkPacketV0View,
} from "@kendall/contracts";
import {
  isPipelineDashboardProjection,
  normalizePipelineDashboardProjection,
} from "./pipeline-supervisor-projection";
import { isWorkPacketV0View } from "./pipeline-supervisor-projector";
import { requestSupervisorJson } from "./dashboard-supervisor-transport";

function requestJson<T>(path: string): Promise<T> {
  return requestSupervisorJson<T>(path, { timeoutMs: 10_000, rejectServerLanAuth: true });
}

function requestLegacyJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

const SAFE_PACKET_ID = /^[A-Za-z0-9._:%-]+$/;

function isCanonicalShapeError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.startsWith("Canonical WorkPacket response"));
}

function canonicalPacket(value: unknown): WorkPacketV0View {
  if (isAuthoritativeWorkPacketLifecycleView(value)) {
    throw authoritativeLifecycleFallbackError();
  }
  if (!isWorkPacketV0View(value)) throw new Error("Canonical WorkPacket response is not WorkPacketV0-shaped.");
  return value;
}

function isAuthoritativeWorkPacketLifecycleView(value: unknown): value is AuthoritativeWorkPacketLifecycleView {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<AuthoritativeWorkPacketLifecycleView>;
  return (
    typeof packet.packetId === "string" &&
    typeof packet.title === "string" &&
    typeof packet.currentStage === "string" &&
    typeof packet.status === "string" &&
    typeof packet.truthLabel === "string" &&
    typeof packet.sourceRef === "object" &&
    packet.sourceRef !== null &&
    typeof packet.createdAt === "string" &&
    typeof packet.updatedAt === "string" &&
    typeof packet.currentEventId === "string" &&
    Array.isArray(packet.history) &&
    packet.metadataOnly === true
  );
}

function authoritativeLifecycleFallbackError(): Error {
  return new Error("Canonical WorkPacket response is authoritative lifecycle-shaped; using legacy WorkPacketV0 fallback.");
}

function canonicalPackets(value: unknown): WorkPacketV0View[] {
  if (Array.isArray(value) && value.some((packet) => isAuthoritativeWorkPacketLifecycleView(packet))) {
    throw authoritativeLifecycleFallbackError();
  }
  if (!Array.isArray(value) || value.some((packet) => !isWorkPacketV0View(packet))) {
    throw new Error("Canonical WorkPacket response is not WorkPacketV0-shaped.");
  }
  return value;
}

function mergeWorkPackets(canonical: WorkPacketV0View[], legacy: WorkPacketV0View[]): WorkPacketV0View[] {
  const merged = new Map<string, WorkPacketV0View>();
  for (const packet of legacy) merged.set(packet.packetId, packet);
  for (const packet of canonical) merged.set(packet.packetId, packet);
  return [...merged.values()];
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "message" in error && typeof error.message === "string" && /\(404\)$/.test(error.message));
}

export async function getWorkPacket(packetId: string): Promise<WorkPacketV0View> {
  const canonicalPath = `/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}`;
  const legacyPath = `/work-packets/${encodeURIComponent(packetId)}`;
  try {
    return canonicalPacket(await requestJson<unknown>(canonicalPath));
  } catch (error) {
    if ((!isNotFoundError(error) && !isCanonicalShapeError(error)) || typeof packetId !== "string" || !SAFE_PACKET_ID.test(packetId)) throw error;
    return requestLegacyJson<WorkPacketV0View>(legacyPath);
  }
}

export async function getWorkPackets(): Promise<WorkPacketV0View[]> {
  let canonical: WorkPacketV0View[];
  try {
    canonical = canonicalPackets(await requestJson<unknown>("/pipeline-control-plane/work-packets"));
  } catch (error) {
    if (!isNotFoundError(error) && !isCanonicalShapeError(error)) throw error;
    return requestLegacyJson<WorkPacketV0View[]>("/work-packets");
  }
  try {
    const legacy = await requestLegacyJson<WorkPacketV0View[]>("/work-packets");
    return mergeWorkPackets(canonical, legacy);
  } catch (error) {
    if (isNotFoundError(error)) return canonical;
    throw error;
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
