"use client";

import { useCallback } from "react";

import { AuthenticatedPageState } from "./authenticated-page-state";
import { ControlsPageContent } from "./controls-page-content";
import { useAuthenticatedPageRead } from "../lib/authenticated-page-read";
import { CONTROLS_PAGE_READ_TIMEOUT_MS, loadControlsPageData } from "../lib/controls-page-data";
import { ControlsReadFailure } from "../lib/controls-read-scheduler.mjs";

const controlsTimeoutMessage = "Controls data is unavailable: Controls manifest timed out.";

function safeControlsDiagnostic(error: unknown) {
  return error instanceof ControlsReadFailure
    ? error.message
    : "Controls data is unavailable: Controls manifest was unavailable.";
}

export function LanControlsPage() {
  const load = useCallback((signal: AbortSignal) => loadControlsPageData(signal), []);
  const { state, retry } = useAuthenticatedPageRead(load, [], () => false, true, {
    timeoutMs: CONTROLS_PAGE_READ_TIMEOUT_MS,
    timeoutMessage: controlsTimeoutMessage,
    unavailableMessage: safeControlsDiagnostic,
  });
  if (state.kind !== "ready") return <AuthenticatedPageState title="Controls" state={state.kind} onRetry={retry} diagnostic={state.kind === "unavailable" ? state.error : null} />;
  return <ControlsPageContent data={state.data} />;
}
