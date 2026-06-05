import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "Overview" },
  { href: "/queue", label: "Queue" },
  { href: "/active-work", label: "Active Work" },
  { href: "/audit", label: "Audit" },
  { href: "/controls", label: "Controls" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eff7f1,_transparent_35%),linear-gradient(180deg,_#f4efe7,_#efe6d8)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="rounded-[2rem] border bg-[var(--panel)]/90 p-6 shadow-[0_18px_60px_rgba(23,33,31,0.08)] backdrop-blur">
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
                  className="rounded-full border bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {link.label}
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
