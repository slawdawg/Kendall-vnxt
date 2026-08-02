"use client";

import Link from "next/link";
import { useCallback } from "react";

import { ActiveWorkBrowser } from "./active-work-browser";
import { AttentionBrowser } from "./attention-browser";
import { AuditWorkbench } from "./audit-workbench";
import { AuthenticatedPageState } from "./authenticated-page-state";
import { PageIntro } from "./page-intro";
import { ProposedWorkBoard } from "./proposed-work-board";
import { QueueBrowser } from "./queue-browser";
import { RouteBrief } from "./route-brief";
import { Shell } from "./shell";
import { useAuthenticatedPageRead } from "../lib/authenticated-page-read";
import { buildNavStats } from "../lib/nav-stats";
import { getAuditEvents, getCandidateWork, getSavedOperatorViews, getWorkItems } from "../lib/supervisor";
import type { AuditEventView, CandidateWorkView, SavedWorkItemView, WorkItemView } from "@kendall/contracts";

export type LanOperatorPageKind = "active-work" | "attention" | "queue" | "audit" | "proposed-work";

type PageData = {
  items: WorkItemView[];
  savedViews?: SavedWorkItemView[];
  audits?: AuditEventView[];
  candidates?: CandidateWorkView[];
};

function loadingTitle(kind: LanOperatorPageKind) {
  return kind === "proposed-work" ? "proposed work" : kind.replace("-", " ");
}

function isEmpty(kind: LanOperatorPageKind, data: PageData) {
  if (kind === "proposed-work") return data.candidates?.length === 0;
  if (kind === "audit") return data.items.length === 0 && data.audits?.length === 0;
  return data.items.length === 0;
}

export function LanOperatorPage({ kind }: { kind: LanOperatorPageKind }) {
  const load = useCallback(async (signal: AbortSignal): Promise<PageData> => {
    if (kind === "proposed-work") {
      const [candidates, items] = await Promise.all([getCandidateWork({ signal }), getWorkItems({ signal })]);
      return { candidates, items };
    }
    if (kind === "audit") {
      const [audits, items, savedViews] = await Promise.all([
        getAuditEvents({ signal }),
        getWorkItems({ signal }),
        getSavedOperatorViews("audit", { signal }),
      ]);
      return { audits, items, savedViews };
    }
    const [items, savedViews] = await Promise.all([getWorkItems({ signal }), getSavedOperatorViews(kind, { signal })]);
    return { items, savedViews };
  }, [kind]);
  const { state, retry } = useAuthenticatedPageRead(load, [kind], (data) => isEmpty(kind, data));

  if (state.kind !== "ready" && state.kind !== "empty") {
    return <AuthenticatedPageState title={loadingTitle(kind)} state={state.kind} onRetry={retry} />;
  }
  const data = state.data;
  const items = data.items;
  const audits = data.audits ?? [];
  const candidates = data.candidates ?? [];
  const navStats = buildNavStats(items, kind === "proposed-work" ? (data.candidates ?? []).filter((candidate) => candidate.status === "proposed").length : undefined);

  if (kind === "active-work") {
    const active = items.filter((item) => ["implementing", "validating", "reviewing", "awaiting_audit"].includes(item.state));
    return <Shell lanAuthEnabled navStats={navStats}><PageIntro eyebrow="Active work" title="In-flight implementation and review" description="Track what is actively moving, which items are approaching decision points, and where audit load is accumulating." metrics={[{ label: "Active items", value: String(active.length) }, { label: "Validating", value: String(active.filter((item) => item.state === "validating").length) }, { label: "Reviewing", value: String(active.filter((item) => item.state === "reviewing").length) }, { label: "Awaiting audit", value: String(active.filter((item) => item.state === "awaiting_audit").length) }]} /><RouteBrief eyebrow="Watch order" title="Follow validating and review pressure first" action={{ href: "/attention", label: "Open attention" }}>Watch active items by decision pressure: validating, reviewing, and awaiting audit should be inspected before starting more queued work.</RouteBrief><ActiveWorkBrowser items={active} savedViews={data.savedViews ?? []} /></Shell>;
  }
  if (kind === "attention") {
    const attention = items.filter((item) => item.needsAttention);
    return <Shell lanAuthEnabled navStats={navStats}><PageIntro eyebrow="Attention" title="Needs-attention queue" description="Review blocked, stale, unowned, or explicitly escalated work before it slips into invisible drift." metrics={[{ label: "Attention items", value: String(attention.length) }, { label: "Self-detected", value: String(attention.filter((item) => item.selfDetectedIssue).length) }, { label: "Escalated", value: String(attention.filter((item) => item.escalatedAt).length) }, { label: "Blocked", value: String(attention.filter((item) => item.state === "blocked").length) }]} /><RouteBrief eyebrow="Review order" title="Inspect escalation evidence before opening controls" action={{ href: "/audit", label: "Open audit" }}>Start with blocked, escalated, or self-detected items. Use work-item detail and audit evidence before any retry, cleanup, or approval path.</RouteBrief><AttentionBrowser items={attention} savedViews={data.savedViews ?? []} /></Shell>;
  }
  if (kind === "queue") {
    return <Shell lanAuthEnabled navStats={navStats}><PageIntro eyebrow="Queue" title="Queue and lane backlog" description="Watch intake pressure, skim current step distribution, and take quick operator actions without leaving the board." metrics={[{ label: "Total items", value: String(items.length) }, { label: "Ready to start", value: String(items.filter((item) => item.state === "ready").length) }, { label: "Blocked / Rework", value: String(items.filter((item) => ["blocked", "needs_rework"].includes(item.state)).length) }, { label: "Done", value: String(items.filter((item) => item.state === "done").length) }]} /><RouteBrief eyebrow="Triage order" title="Balance ready work against blocked load" action={{ href: "/active-work", label: "Open active work" }}>Use the queue to compare ready work, blocked/rework load, and active capacity before moving into deliberate controls.</RouteBrief><QueueBrowser items={items} savedViews={data.savedViews ?? []} /></Shell>;
  }
  if (kind === "audit") {
    const awaitingAudit = items.filter((item) => item.state === "awaiting_audit");
    const completedWithAudit = items.filter((item) => item.state === "done" && item.auditMode !== "none");
    return <Shell lanAuthEnabled navStats={navStats}><PageIntro eyebrow="Audit" title="Audit backlog and completion trail" description="Handle risk-gated approvals, clear the audit lane, and keep a readable record of why higher-risk work was accepted or rerouted." metrics={[{ label: "Awaiting audit", value: String(awaitingAudit.length) }, { label: "Required", value: String(awaitingAudit.filter((item) => item.auditMode === "required").length) }, { label: "Advisory", value: String(awaitingAudit.filter((item) => item.auditMode === "advisory").length) }, { label: "Audit records", value: String(audits.length) }]} /><AuditWorkbench awaitingAudit={awaitingAudit} completedWithAudit={completedWithAudit} audits={audits} savedViews={data.savedViews ?? []} /><section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm"><h2 className="text-xl font-semibold">Audit history</h2><div className="mt-4 space-y-3">{audits.length === 0 ? <p className="text-sm text-[var(--muted)]">No audit events have been recorded yet.</p> : audits.map((audit) => <article key={audit.id} className="rounded-[0.5rem] border bg-[var(--surface)] p-3"><div className="flex items-center justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">{audit.mode}</p><h3 className="mt-2 text-lg font-semibold"><Link href={`/work-items/${audit.workItemId}`} className="transition hover:text-[var(--accent)]">{audit.reason}</Link></h3><p className="mt-2 text-sm text-[var(--muted)]">{audit.outcome}</p></div><div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{new Date(audit.createdAt).toLocaleString()}</div></div></article>)}</div></section></Shell>;
  }
  const proposedCount = candidates.filter((candidate) => candidate.status === "proposed").length;
  return <Shell lanAuthEnabled navStats={navStats}><PageIntro eyebrow="Proposed Work" title="Ideas waiting at the front door" description="Review plans and requests before they enter active work." metrics={[{ label: "Waiting", value: String(proposedCount) }, { label: "Approved", value: String(candidates.filter((candidate) => candidate.status === "approved").length) }, { label: "High priority", value: String(candidates.filter((candidate) => ["high", "urgent"].includes(candidate.priority)).length) }, { label: "Total", value: String(candidates.length) }]} /><ProposedWorkBoard candidates={candidates} /></Shell>;
}
