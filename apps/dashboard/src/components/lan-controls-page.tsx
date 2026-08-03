"use client";

import { useCallback } from "react";

import { AuthenticatedPageState } from "./authenticated-page-state";
import { ControlsPageContent } from "./controls-page-content";
import { useAuthenticatedPageRead } from "../lib/authenticated-page-read";
import { loadControlsPageData } from "../lib/controls-page-data";

export function LanControlsPage() {
  const load = useCallback((signal: AbortSignal) => loadControlsPageData(signal), []);
  const { state, retry } = useAuthenticatedPageRead(load, []);
  if (state.kind !== "ready") return <AuthenticatedPageState title="Controls" state={state.kind} onRetry={retry} />;
  return <ControlsPageContent data={state.data} />;
}
