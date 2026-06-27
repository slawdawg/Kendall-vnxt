"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { NavStats } from "../lib/nav-stats";

type ShellLink = {
  href: string;
  label: string;
  statKey?: keyof NavStats;
};

const linkGroups: { label: string; intent: string; links: ShellLink[] }[] = [
  {
    label: "Monitor",
    intent: "Watch state",
    links: [
      { href: "/", label: "Overview" },
      { href: "/pipeline", label: "Pipeline" },
      { href: "/attention", label: "Attention", statKey: "attention" },
      { href: "/active-work", label: "Active Work", statKey: "active" },
    ],
  },
  {
    label: "Evidence",
    intent: "Inspect records",
    links: [
      { href: "/queue", label: "Queue", statKey: "queue" },
      { href: "/audit", label: "Audit", statKey: "audit" },
      { href: "/proposed-work", label: "Proposed Work", statKey: "proposed" },
    ],
  },
  {
    label: "Deliberate",
    intent: "Control setup",
    links: [
      { href: "/controls", label: "Controls" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

function isCurrentPath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentPageLabel(pathname: string) {
  return linkGroups.flatMap((group) => group.links).find((link) => isCurrentPath(pathname, link.href))?.label ?? "Pages";
}

function NavBadge({ link, navStats }: { link: ShellLink; navStats?: NavStats }) {
  if (!link.statKey || !navStats) {
    return null;
  }

  const count = navStats[link.statKey];
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    return null;
  }

  const itemLabel = count === 1 ? "item" : "items";
  return (
    <span
      aria-label={`${count} ${link.label.toLowerCase()} ${itemLabel}`}
      className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs"
    >
      {count}
    </span>
  );
}

export function OperationalNav({ compact = false, navStats }: { compact?: boolean; navStats?: NavStats }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (compact) {
    return (
      <nav aria-label="Dashboard sections" className="dashboard-page-menu-nav">
        <details className="dashboard-page-menu" onToggle={(e) => setMenuOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary aria-label={`${menuOpen ? "Close" : "Open"} navigation menu. Current page: ${currentPageLabel(pathname)}`} className="dashboard-page-menu-summary">
            <span aria-hidden="true" className="dashboard-page-menu-icon">
              <span />
              <span />
              <span />
            </span>
          </summary>
          <div className="dashboard-page-menu-links">
            {linkGroups.map((group) => {
              const groupId = `dashboard-page-menu-${group.label.toLowerCase()}`;
              return (
                <section aria-labelledby={groupId} className="dashboard-page-menu-group" key={group.label}>
                  <div className="dashboard-page-menu-group-heading">
                    <h2 id={groupId}>{group.label}</h2>
                    <p>{group.intent}</p>
                  </div>
                  <div className="dashboard-page-menu-group-links">
                    {group.links.map((link) => {
                      const current = isCurrentPath(pathname, link.href);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          aria-current={current ? "page" : undefined}
                          className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-[0.375rem] border px-2.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)] ${
                            current
                              ? "border-[var(--accent)] bg-[var(--panel-strong)] text-[var(--foreground)]"
                              : "bg-[var(--background-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          }`}
                        >
                          {link.label}
                          <NavBadge link={link} navStats={navStats} />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </details>
      </nav>
    );
  }

  return (
    <nav aria-label="Dashboard sections" className="grid w-full max-w-full gap-3 xl:min-w-0 xl:grid-cols-[1fr_1fr_auto]">
      {linkGroups.map((group) => {
        const groupId = `dashboard-nav-${group.label.toLowerCase()}`;
        return (
          <section key={group.label} aria-labelledby={groupId} className="min-w-0 rounded-[0.5rem] border bg-[var(--surface)] p-2.5">
            <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
              <h2 id={groupId} className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {group.label}
              </h2>
              <p className="text-xs text-[var(--muted)]">{group.intent}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.links.map((link) => {
                const current = isCurrentPath(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={`inline-flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)] ${
                      current
                        ? "border-[var(--accent)] bg-[var(--panel-strong)] text-[var(--foreground)]"
                        : "bg-[var(--background-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    }`}
                  >
                    {link.label}
                    <NavBadge link={link} navStats={navStats} />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
