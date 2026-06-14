import type { ReactNode } from "react";
import type { NavStats } from "../lib/nav-stats";
import { OperationalNav } from "./operational-nav";
import { RealtimeRefresh } from "./realtime-refresh";

export function Shell({ children, navStats }: { children: ReactNode; navStats?: NavStats }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <RealtimeRefresh />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="rounded-[0.75rem] border bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h1 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                Kendall Supervisor
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Monitoring, evidence, queue, audit, and deliberate controls for BMAD orchestration.
              </p>
            </div>
            <div className="w-full xl:max-w-[44rem]">
              <OperationalNav navStats={navStats} />
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
