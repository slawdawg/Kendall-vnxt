"use client";

import { useEffect, useState } from "react";
import { PipelineCockpit } from "./pipeline-cockpit";
import { Shell } from "../shell";
import { loadPipelineCockpitPackets, type PipelineCockpitPacketLoad } from "../../lib/pipeline-packet-loader";

export function LanPipelinePage({ lanAuthEnabled }: { lanAuthEnabled: boolean }) {
  const [result, setResult] = useState<PipelineCockpitPacketLoad | null>(null);
  const [error, setError] = useState<"expired" | "unavailable" | null>(null);

  useEffect(() => {
    let active = true;
    void loadPipelineCockpitPackets()
      .then((value) => {
        if (!active) return;
        if (value.projectionError && /\(401\)/.test(value.projectionError)) {
          setError("expired");
          return;
        }
        setResult(value);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error && /\(401\)/.test(reason.message) ? "expired" : "unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

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
          <button type="button" className="mt-4 rounded-[0.375rem] border px-3 py-2 text-xs font-medium" onClick={() => window.location.reload()}>Retry pipeline</button>
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
        packets={result.packets}
        projection={result.projection}
        projectionError={result.projectionError}
        selectedPacket={result.packets[0] ?? null}
      />
    </Shell>
  );
}
