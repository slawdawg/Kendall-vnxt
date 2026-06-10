import Link from "next/link";
import type { ReactNode } from "react";
import type { NavStats } from "../lib/nav-stats";

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(92,200,166,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(240,154,97,0.12),_transparent_24%),linear-gradient(180deg,_var(--background-elevated),_var(--background))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="rounded-[2rem] border bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] p-6 shadow-[0_22px_60px_rgba(3,8,8,0.32)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
                Kendall Supervisor
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Development control plane for BMAD orchestration
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Queue intake, autonomous progression, operator controls, and selective audit in one surface.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
