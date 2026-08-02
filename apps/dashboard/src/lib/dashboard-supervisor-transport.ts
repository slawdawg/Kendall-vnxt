import type { ApiEnvelope } from "@kendall/contracts";
import { readCookieValue } from "./browser-cookie.mjs";

const configuredPublicBaseUrl = process.env.NEXT_PUBLIC_SUPERVISOR_URL;
const publicBaseUrl = configuredPublicBaseUrl ?? "http://localhost:8000";
const internalBaseUrl = process.env.SUPERVISOR_INTERNAL_URL ?? publicBaseUrl;

export type SupervisorReadOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  rejectServerLanAuth?: boolean;
};

export function getSupervisorBaseUrl(): string {
  if (typeof window === "undefined") {
    return publicBaseUrl;
  }

  if (window.location.protocol === "https:") {
    return `${window.location.origin}/api/supervisor`;
  }

  if (!configuredPublicBaseUrl) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return configuredPublicBaseUrl;
}

export async function requestSupervisorJson<T>(path: string, options: SupervisorReadOptions = {}): Promise<T> {
  if (options.rejectServerLanAuth && typeof window === "undefined" && process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    throw new Error("LAN-auth supervisor reads require the authenticated UDS boundary.");
  }

  const baseUrl = typeof window === "undefined" ? internalBaseUrl : getSupervisorBaseUrl();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let detachCallerAbort: (() => void) | null = null;
  if (controller && options.signal) {
    const abortCaller = () => controller.abort(options.signal?.reason);
    if (options.signal.aborted) {
      abortCaller();
    } else {
      options.signal.addEventListener("abort", abortCaller, { once: true });
      detachCallerAbort = () => options.signal?.removeEventListener("abort", abortCaller);
    }
  }
  const timeout = controller && options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;
  const signal = controller?.signal ?? options.signal;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      ...(signal ? { signal } : {}),
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
    if (controller?.signal.aborted && !options.signal?.aborted) {
      throw new Error(`Request timed out for ${path}`);
    }
    throw error;
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    detachCallerAbort?.();
  }
}

/** Browser mutations must use the same authenticated proxy and synchronizer
 * token as logout. This preserves the proxy's strict Origin/CSRF rejection
 * instead of teaching each dashboard action a slightly different variant. */
export async function requestSupervisorMutation(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    headers.set("origin", window.location.origin);
    headers.set("x-csrf-token", readCookieValue(document.cookie, "kendall_operator_csrf"));
  }
  return fetch(`${getSupervisorBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
}
