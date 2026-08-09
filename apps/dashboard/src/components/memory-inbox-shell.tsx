"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { MemoryInboxDestinationV1, MemoryInboxProjectionRowV1 } from "@kendall/contracts";
import { useAuthenticatedPageRead } from "../lib/authenticated-page-read";
import { getMemoryInboxProjection } from "../lib/supervisor";

const destinations: ReadonlyArray<{ id: MemoryInboxDestinationV1; label: string }> = [
  { id: "inbox", label: "Inbox" }, { id: "drafts", label: "Drafts" },
  { id: "review", label: "Review" }, { id: "processed", label: "Processed" },
];

function selectedDestination(value: string | null): MemoryInboxDestinationV1 {
  return destinations.some((destination) => destination.id === value) ? value as MemoryInboxDestinationV1 : "inbox";
}

export function MemoryInboxShell() {
  const searchParams = useSearchParams();
  const selected = selectedDestination(searchParams.get("destination"));
  const heading = destinations.find((destination) => destination.id === selected)?.label ?? "Inbox";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const { state, retry } = useAuthenticatedPageRead((signal) => getMemoryInboxProjection({ signal, timeoutMs: 6_000 }), [], () => false, true, { timeoutMessage: "Memory Inbox is unavailable." });

  useEffect(() => {
    if (state.kind !== "ready") return;
    headingRef.current?.focus();
    if (announcementRef.current) announcementRef.current.textContent = `${heading} selected.`;
  }, [heading, state.kind]);

  const destinationLinks = useMemo(() => destinations.map((destination) => (
    <Link key={destination.id} href={`/memory-inbox?destination=${destination.id}`} aria-current={destination.id === selected ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium text-[var(--accent)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">
      {destination.label}
    </Link>
  )), [selected]);

  if (state.kind === "expired") return <SessionExpired />;
  if (state.kind === "loading") return <StateSurface title="Loading Memory Inbox" body="Reading the authenticated Memory Inbox status." role="status" />;
  if (state.kind !== "ready") return <StateSurface title="Memory Inbox unavailable" body="The authenticated Memory Inbox status is unavailable." retry={retry} />;

  return <main className="grid max-w-full min-w-0 gap-4" aria-labelledby="memory-inbox-heading">
    <nav aria-label="Memory Inbox destinations" className="flex flex-wrap gap-2">{destinationLinks}</nav>
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" aria-describedby="memory-inbox-status">
      <h1 ref={headingRef} id="memory-inbox-heading" tabIndex={-1} className="text-xl font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">{heading}</h1>
      <p id="memory-inbox-status" className="mt-2 text-sm leading-6 text-[var(--muted)]">Supervisor-owned lifecycle projection is current.</p>
      <MemoryInboxRows selected={selected} rows={state.data.rows} />
      <button type="button" onClick={retry} className="mt-4 inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">Refresh Memory Inbox</button>
      <p ref={announcementRef} className="sr-only" aria-live="polite" />
    </section>
  </main>;
}

function MemoryInboxRows({ selected, rows }: { selected: MemoryInboxDestinationV1; rows: MemoryInboxProjectionRowV1[] }) {
  const visible = rows.filter((row) => destinationFor(row.lifecycleState) === selected);
  if (!visible.length) return <p className="mt-4 text-sm text-[var(--muted)]">No {selected} Sources are currently recorded. Refresh Memory Inbox for current lifecycle truth.</p>;
  return <ul className="mt-4 grid gap-2" aria-label={`${selected} Sources`}>{visible.map((row) => <li key={row.sourceId} className="rounded border p-3 text-sm"><p className="font-medium">{row.sourceId}</p><p className="text-[var(--muted)]">{row.lifecycleState} · revision {row.revision} · {row.nextSafeAction}</p><p className="text-[var(--muted)]">Retention deadline: {new Date(row.retentionDeadlineAt).toLocaleString()}</p></li>)}</ul>;
}

function destinationFor(state: MemoryInboxProjectionRowV1["lifecycleState"]): MemoryInboxDestinationV1 {
  if (["Draft", "Returned", "AwaitingAuthorization"].includes(state)) return "drafts";
  if (["Review", "DeniedRetained"].includes(state)) return "review";
  if (["DeletePending", "Deleted", "RejectedUnsafe"].includes(state)) return "processed";
  return "inbox";
}

function StateSurface({ title, body, role = "alert", retry }: { title: string; body: string; role?: "alert" | "status"; retry?: () => void }) {
  return <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role={role} aria-live={role === "status" ? "polite" : undefined}>
    <h1 className="text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    {retry ? <button type="button" onClick={retry} className="mt-4 inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">Refresh Memory Inbox</button> : null}
  </section>;
}

function SessionExpired() {
  return <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role="alert"><h1 className="text-lg font-semibold">Session expired</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Your authenticated session ended. Return to the dashboard to sign in again.</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]" href="/">Return to sign in</Link></section>;
}
