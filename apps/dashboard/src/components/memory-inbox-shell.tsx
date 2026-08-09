"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { MemoryInboxDestinationV1, MemoryInboxProjectionRowV1 } from "@kendall/contracts";
import { useAuthenticatedPageRead } from "../lib/authenticated-page-read";
import { captureMemoryInboxText, getMemoryInboxProjection, saveMemoryInboxDraft } from "../lib/supervisor";

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
  const reviewReadyCount = state.kind === "ready" ? state.data.reviewReadyCount : 0;

  useEffect(() => {
    if (state.kind !== "ready") return;
    headingRef.current?.focus();
    if (announcementRef.current) announcementRef.current.textContent = `${heading} selected.`;
  }, [heading, state.kind]);

  const destinationLinks = useMemo(() => destinations.map((destination) => (
    <Link key={destination.id} href={`/memory-inbox?destination=${destination.id}`} aria-current={destination.id === selected ? "page" : undefined} aria-label={destination.label} aria-describedby={destination.id === "review" ? "memory-inbox-review-ready-count" : undefined} className="inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium text-[var(--accent)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">
      <span aria-hidden="true">{destination.label}</span>
      {destination.id === "review" ? <span id="memory-inbox-review-ready-count" className="ml-2 rounded-full border px-2 py-0.5 text-xs" aria-live="polite">{reviewReadyCount} ready</span> : null}
    </Link>
  )), [selected, reviewReadyCount]);

  if (state.kind === "expired") return <SessionExpired />;
  if (state.kind === "loading") return <StateSurface title="Loading Memory Inbox" body="Reading the authenticated Memory Inbox status." role="status" />;
  if (state.kind !== "ready") return <StateSurface title="Memory Inbox unavailable" body="The authenticated Memory Inbox status is unavailable." retry={retry} />;

  return <main className="grid max-w-full min-w-0 gap-4" aria-labelledby="memory-inbox-heading">
    <nav aria-label="Memory Inbox destinations" className="flex flex-wrap gap-2">{destinationLinks}</nav>
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" aria-describedby="memory-inbox-status">
      <h1 ref={headingRef} id="memory-inbox-heading" tabIndex={-1} className="text-xl font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">{heading}</h1>
      <p id="memory-inbox-status" className="mt-2 text-sm leading-6 text-[var(--muted)]">Supervisor-owned lifecycle projection is current.</p>
      <MemoryInboxCaptureComposer onCaptured={retry} />
      <MemoryInboxRows selected={selected} rows={state.data.rows} />
      <button type="button" onClick={retry} className="mt-4 inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">Refresh Memory Inbox</button>
      <p ref={announcementRef} className="sr-only" aria-live="polite" />
    </section>
  </main>;
}

function MemoryInboxCaptureComposer({ onCaptured }: { onCaptured: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "submitting" | "success" | "error"; message: string }>({ kind: "idle", message: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const text = values.get("memory-inbox-text");
    const acknowledged = values.get("memory-inbox-non-sensitive") === "on";
    if (typeof text !== "string" || !text.trim() || !acknowledged) {
      setStatus({ kind: "error", message: "Enter non-sensitive text and confirm the acknowledgement before capturing." });
      return;
    }
    setStatus({ kind: "submitting", message: "Capturing text…" });
    try {
      const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      const result = await captureMemoryInboxText(text, acknowledged, idempotencyKey);
      formRef.current?.reset();
      idempotencyKeyRef.current = null;
      setStatus({ kind: "success", message: `Text captured as ${result.sourceId}. Its next safe action is to create a draft.` });
      onCaptured();
    } catch {
      setStatus({ kind: "error", message: "Text capture was not accepted. Check the acknowledgement and try again." });
    }
  }

  return <section className="mt-5 rounded border p-4" aria-labelledby="memory-inbox-capture-heading">
    <h2 id="memory-inbox-capture-heading" className="text-base font-semibold">Capture</h2>
    <form ref={formRef} className="mt-3 grid gap-3" onSubmit={submit}>
      <label className="grid gap-1 text-sm font-medium" htmlFor="memory-inbox-text">Capture non-sensitive text
        <textarea id="memory-inbox-text" name="memory-inbox-text" required maxLength={32000} rows={5} className="rounded border p-2 font-normal" />
      </label>
      <label className="flex items-start gap-2 text-sm"><input id="memory-inbox-non-sensitive" name="memory-inbox-non-sensitive" type="checkbox" required className="mt-1" /> <span>I confirm this text is non-sensitive.</span></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status.kind === "submitting"} className="inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">Capture text</button>
        <button type="button" disabled aria-describedby="memory-inbox-upload-gate" className="inline-flex min-h-11 items-center rounded-[0.375rem] border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">Upload a document</button>
      </div>
      <p id="memory-inbox-upload-gate" className="text-sm text-[var(--muted)]">Document upload is unavailable until its secure intake gate is configured.</p>
      {status.kind !== "idle" ? <p role={status.kind === "error" ? "alert" : "status"} aria-live="polite" className="text-sm">{status.message}</p> : null}
    </form>
  </section>;
}

function MemoryInboxRows({ selected, rows }: { selected: MemoryInboxDestinationV1; rows: MemoryInboxProjectionRowV1[] }) {
  const visible = rows.filter((row) => destinationFor(row.lifecycleState) === selected);
  if (!visible.length) return <p className="mt-4 text-sm text-[var(--muted)]">No {selected} Sources are currently recorded. Refresh Memory Inbox for current lifecycle truth.</p>;
  return <ul className="mt-4 grid gap-2" aria-label={`${selected} Sources`}>{visible.map((row) => <MemoryInboxRow key={row.sourceId} row={row} />)}</ul>;
}

function MemoryInboxRow({ row }: { row: MemoryInboxProjectionRowV1 }) {
  const [status, setStatus] = useState("");
  async function saveDraft() {
    setStatus("Saving draft…");
    try { await saveMemoryInboxDraft(row.sourceId, row.revision, crypto.randomUUID()); setStatus("Draft saved. Refresh Memory Inbox for current lifecycle truth."); }
    catch { setStatus("This source cannot be saved as a draft in its current state."); }
  }
  return <li className="rounded border p-3 text-sm"><p className="font-medium">{row.sourceId}</p><p className="text-[var(--muted)]">{row.lifecycleState} · revision {row.revision} · {row.nextSafeAction}</p><p className="text-[var(--muted)]">Retention deadline: {new Date(row.retentionDeadlineAt).toLocaleString()}</p>{row.lifecycleState === "Unprocessed" ? <button type="button" onClick={saveDraft} className="mt-3 inline-flex min-h-11 items-center rounded border px-3 py-2 text-sm font-medium">Save as draft</button> : null}{status ? <p className="mt-2 text-sm" role="status" aria-live="polite">{status}</p> : null}</li>;
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
