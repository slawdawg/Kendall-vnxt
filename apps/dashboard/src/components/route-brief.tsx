import Link from "next/link";
import type { ReactNode } from "react";

type RouteBriefAction = {
  href: string;
  label: string;
};

export function RouteBrief({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: RouteBriefAction;
}) {
  return (
    <section className="rounded-[0.75rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--info)]">{eyebrow}</p>
          <h2 className="mt-2 text-base font-semibold">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{children}</p>
        </div>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex w-fit items-center rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 text-sm font-medium transition hover:border-[var(--info)] hover:text-[var(--info)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

