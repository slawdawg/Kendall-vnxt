"use client";

import { useEffect, useState } from "react";
import { PipelineCockpit } from "./pipeline-cockpit";
import { Shell } from "../shell";
import { loadPipelineCockpitPackets, type PipelineCockpitPacketLoad } from "../../lib/pipeline-packet-loader";
import { useDashboardSessionRole } from "../../lib/dashboard-session-role";

export function LanPipelinePage({ lanAuthEnabled }: { lanAuthEnabled: boolean }) {
  const [result, setResult] = useState<PipelineCockpitPacketLoad | null>(null);
  const [error, setError] = useState<"expired" | "unavailable" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const role = useDashboardSessionRole();

  useEffect(() => {
    let active = true;
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      setError("unavailable");
    }, 8_000);
    void loadPipelineCockpitPackets()
      .then((value) => {
        if (!active || settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (value.projectionError && /\(401\)/.test(value.projectionError)) {
          setError("expired");
          return;
        }
        setResult(value);
      })
      .catch((reason) => {
        if (active && !settled) {
          settled = true;
          window.clearTimeout(timeout);
          setError(reason instanceof Error && /\(401\)/.test(reason.message) ? "expired" : "unavailable");
        }
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  if (error === "expired") {
    return (
      <Shell compactHeader lanAuthEnabled={lanAuthEnabled} realtimeRefresh={false} wide>
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role="alert">
          <h1 className="text-lg font-semibold">Session expired</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Your authenticated pipeline session ended. Return to the dashboard to sign in again.</p>
          <a className="mt-4 inline-block rounded-[0.375rem] border px-3 py-2 text-xs font-medium" href="/">Return to sign in</a>
        </section>
      </Shell>
    );
  }
  if (error === "unavailable") {
    return (
      <Shell compactHeader lanAuthEnabled={lanAuthEnabled} realtimeRefresh={false} wide>
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role="alert">
          <h1 className="text-lg font-semibold">Pipeline unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Your authenticated supervisor read could not be completed. Refresh the page or sign in again.</p>
          <button type="button" className="mt-4 rounded-[0.375rem] border px-3 py-2 text-xs font-medium" onClick={() => { setResult(null); setError(null); setAttempt((value) => value + 1); }}>Retry pipeline</button>
        </section>
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell compactHeader lanAuthEnabled={lanAuthEnabled} realtimeRefresh={false} wide>
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role="status" aria-live="polite">
          <h1 className="text-lg font-semibold">Loading pipeline</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Reading authenticated supervisor packets.</p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell compactHeader lanAuthEnabled={lanAuthEnabled} realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={result.fixtureMode}
        readOnly={role !== "operator"}
        canonicalPackets={result.canonicalPackets}
        operationalTruth={result.operationalTruth}
        projection={result.projection}
        projectionError={result.projectionError}
      />
    </Shell>
  );
}
