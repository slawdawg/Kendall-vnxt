"use client";

import { useEffect, useState } from "react";
import type { RunStatusView, WorkItemView } from "@kendall/contracts";

import { LiveFeed } from "./live-feed";
import { MonitoringHome } from "./monitoring-home";
import { PageIntro } from "./page-intro";
import { getRunStatus, getWorkItems } from "../lib/supervisor";

type OverviewData = { status: RunStatusView; items: WorkItemView[] };

export function LanOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    Promise.all([getRunStatus({ signal: controller.signal }), getWorkItems({ signal: controller.signal })])
      .then(([status, items]) => {
        if (!status || typeof status !== "object" || !Array.isArray(items)) throw new Error("Invalid overview payload");
        if (active) {
          setError(false);
          setData({ status, items });
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [retryCount]);

  const metrics = data
    ? [
        ["Mode", data.status.mode],
        ["Queued", String(data.status.queueCount)],
        ["Active", String(data.status.activeCount)],
        ["Blocked", String(data.status.blockedCount)],
      ].map(([label, value]) => ({ label, value }))
    : undefined;

  return (
    <>
      <PageIntro
        eyebrow="Mission Control"
        title="Overview"
        description="Watch active work, attention needs, failed or stale states, and recent evidence before opening any control surface."
        metrics={metrics}
      />
      {error ? (
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role="alert">
          <h2 className="text-lg font-semibold">Overview unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">The authenticated supervisor read could not be completed. Refresh and try again.</p>
          <button type="button" className="mt-4 rounded-[0.375rem] border px-3 py-2 text-xs font-medium" onClick={() => { setData(null); setError(false); setRetryCount((count) => count + 1); }}>Retry overview</button>
        </section>
      ) : data ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <MonitoringHome status={data.status} items={data.items} />
          <LiveFeed />
        </section>
      ) : (
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role="status" aria-live="polite">
          <h2 className="text-lg font-semibold">Loading overview</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Reading the authenticated supervisor status.</p>
        </section>
      )}
    </>
  );
}
