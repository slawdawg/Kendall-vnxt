import type {
  ApiEnvelope,
  PipelineDashboardProjectionV0,
  WorkPacketV0View,
} from "@kendall/contracts";

const configuredPublicBaseUrl = process.env.NEXT_PUBLIC_SUPERVISOR_URL;
const publicBaseUrl = configuredPublicBaseUrl ?? "http://localhost:8000";
const internalBaseUrl = process.env.SUPERVISOR_INTERNAL_URL ?? publicBaseUrl;

export function getSupervisorBaseUrl(): string {
  if (typeof window === "undefined") {
    return publicBaseUrl;
  }

  if (!configuredPublicBaseUrl) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return configuredPublicBaseUrl;
}

export async function requestJson<T>(path: string): Promise<T> {
  const baseUrl = typeof window === "undefined" ? internalBaseUrl : getSupervisorBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${path} (${response.status})`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!payload || !("data" in payload)) {
    throw new Error(`Malformed response for ${path}`);
  }
  return payload.data;
}

export async function getWorkPacket(packetId: string): Promise<WorkPacketV0View> {
  return requestJson<WorkPacketV0View>(`/work-packets/${encodeURIComponent(packetId)}`);
}

export async function getWorkPackets(): Promise<WorkPacketV0View[]> {
  return requestJson<WorkPacketV0View[]>("/work-packets");
}

export async function getPipelineDashboardProjection(): Promise<PipelineDashboardProjectionV0> {
  return requestJson<PipelineDashboardProjectionV0>("/pipeline-control-plane/projection");
}
