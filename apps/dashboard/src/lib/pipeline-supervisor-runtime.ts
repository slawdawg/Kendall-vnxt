import type {
  ApiEnvelope,
  PipelineDashboardProjectionV0,
  WorkPacketV0View,
} from "@kendall/contracts";
import {
  isPipelineDashboardProjection,
  normalizePipelineDashboardProjection,
} from "./pipeline-supervisor-projection";

const configuredPublicBaseUrl = process.env.NEXT_PUBLIC_SUPERVISOR_URL;
const publicBaseUrl = configuredPublicBaseUrl ?? "http://localhost:8000";
const internalBaseUrl = process.env.SUPERVISOR_INTERNAL_URL ?? publicBaseUrl;

function getRuntimeSupervisorBaseUrl(): string {
  if (typeof window === "undefined") {
    return publicBaseUrl;
  }

  if (!configuredPublicBaseUrl) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return configuredPublicBaseUrl;
}

async function requestJson<T>(path: string): Promise<T> {
  const baseUrl = typeof window === "undefined" ? internalBaseUrl : getRuntimeSupervisorBaseUrl();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 10_000) : null;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) {
      throw new Error(`Request failed for ${path} (${response.status})`);
    }
    const payload = (await response.json()) as ApiEnvelope<T>;
    if (!payload || !("data" in payload)) {
      throw new Error(`Malformed response for ${path}`);
    }
    return payload.data;
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error(`Request timed out for ${path}`);
    }
    throw error;
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  }
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
