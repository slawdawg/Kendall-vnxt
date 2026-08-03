"use client";

import { useCallback, useEffect, useState } from "react";

const AUTHENTICATED_PAGE_DATA_CHANGED = "kendall:authenticated-page-data-changed";

export function invalidateAuthenticatedPageData() {
  window.dispatchEvent(new Event(AUTHENTICATED_PAGE_DATA_CHANGED));
}

export type DashboardReadState<T> =
  | { kind: "loading"; data: null; error: null }
  | { kind: "ready"; data: T; error: null }
  | { kind: "empty"; data: T; error: null }
  | { kind: "expired"; data: null; error: null }
  | { kind: "not_found"; data: null; error: null }
  | { kind: "unavailable"; data: null; error: string };

export type AuthenticatedPageReadOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
  unavailableMessage?: (error: unknown) => string;
};

function classify(error: unknown, unavailableMessage?: (error: unknown) => string): DashboardReadState<never> {
  const message = error instanceof Error ? error.message : "Authenticated dashboard data is unavailable.";
  if (/\(401\)|sign_in_required/i.test(message)) return { kind: "expired", data: null, error: null };
  if (/\(404\)/.test(message)) return { kind: "not_found", data: null, error: null };
  return { kind: "unavailable", data: null, error: unavailableMessage?.(error) ?? message };
}

/**
 * Browser-only, bounded read boundary for pages that must cross the fixed
 * same-origin dashboard proxy. The server-side supervisor guard remains in
 * place; callers cannot accidentally read the private UDS without a session.
 */
export function useAuthenticatedPageRead<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
  isEmpty: (data: T) => boolean = () => false,
  enabled = true,
  options: AuthenticatedPageReadOptions = {},
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DashboardReadState<T>>({ kind: "loading", data: null, error: null });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    const deadline = window.setTimeout(() => {
      controller.abort();
      if (active) setState({ kind: "unavailable", data: null, error: options.timeoutMessage ?? "The authenticated read timed out." });
    }, options.timeoutMs ?? 8_000);
    setState({ kind: "loading", data: null, error: null });
    void load(controller.signal)
      .then((data) => {
        if (!active || controller.signal.aborted) return;
        setState(isEmpty(data) ? { kind: "empty", data, error: null } : { kind: "ready", data, error: null });
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) setState(classify(error, options.unavailableMessage));
      })
      .finally(() => window.clearTimeout(deadline));
    return () => {
      active = false;
      window.clearTimeout(deadline);
      controller.abort();
    };
  // load is intentionally owned by the page callback; dependencies describe its stable inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt, enabled, options.timeoutMs, options.timeoutMessage, options.unavailableMessage]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener(AUTHENTICATED_PAGE_DATA_CHANGED, retry);
    return () => window.removeEventListener(AUTHENTICATED_PAGE_DATA_CHANGED, retry);
  }, [enabled, retry]);

  return { state, retry };
}
