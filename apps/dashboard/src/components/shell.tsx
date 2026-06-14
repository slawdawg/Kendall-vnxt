import Link from "next/link";
import type { ReactNode } from "react";
import type { NavStats } from "../lib/nav-stats";
import { RealtimeRefresh } from "./realtime-refresh";

const links = [
  { href: "/", label: "Overview" },
  { href: "/proposed-work", label: "Proposed Work" },
  { href: "/queue", label: "Queue" },
  { href: "/active-work", label: "Active Work" },
  { href: "/audit", label: "Audit" },
  { href: "/attention", label: "Attention" },
  { href: "/controls", label: "Controls" },
];

export function Shell({ children, navStats }: { children: ReactNode; navStats?: NavStats }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <RealtimeRefresh />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="rounded-[0.75rem] border bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                Kendall Supervisor
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Monitoring, evidence, queue, audit, and deliberate controls for BMAD orchestration.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {link.label}
                  {link.href === "/proposed-work" && typeof navStats?.proposed === "number" ? (
                    <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{navStats.proposed}</span>
                  ) : null}
                  {link.href === "/queue" && navStats ? (
                    <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{navStats.queue}</span>
                  ) : null}
                  {link.href === "/active-work" && navStats ? (
                    <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{navStats.active}</span>
                  ) : null}
                  {link.href === "/audit" && navStats ? (
                    <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{navStats.audit}</span>
                  ) : null}
                  {link.href === "/attention" && navStats ? (
                    <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{navStats.attention}</span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
