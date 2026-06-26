import type { ReactNode } from "react";
import type { NavStats } from "../lib/nav-stats";
import { DashboardGraphBackground } from "./dashboard-graph-background";
import { OperationalNav } from "./operational-nav";
import { RealtimeRefresh } from "./realtime-refresh";

export function Shell({
  children,
  compactHeader = false,
  navStats,
  realtimeRefresh = true,
  wide = false,
}: {
  children: ReactNode;
  compactHeader?: boolean;
  navStats?: NavStats;
  realtimeRefresh?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[var(--background)]">
      <DashboardGraphBackground />
      {realtimeRefresh ? <RealtimeRefresh /> : null}
      <OperationalNav compact navStats={navStats} />
      <div
        className={`relative z-10 mx-auto box-border flex w-auto min-w-0 flex-col gap-6 px-6 py-6 ${wide ? "max-w-[96rem]" : "max-w-7xl"}`}
        style={{ boxSizing: "border-box", maxWidth: "min(96rem, calc(100vw - 3rem))", width: "100%" }}
      >
        <header className={`min-w-0 rounded-[0.5rem] border shadow-sm ${compactHeader ? "bg-transparent p-2" : "bg-[var(--panel)] p-4"}`}>
          <div className={compactHeader ? "flex items-start justify-between gap-3" : "flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"}>
            <div className="min-w-0">
              <h1 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                Kendall Supervisor
              </h1>
              <p className={`${compactHeader ? "sr-only" : "mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]"}`}>
                Monitoring, evidence, queue, audit, and deliberate controls for BMAD orchestration.
              </p>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
