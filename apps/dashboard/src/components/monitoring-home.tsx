import Link from "next/link";
import type { ReactNode } from "react";
import type { RunStatusView, WorkItemView } from "@kendall/contracts";

import { AttentionBadge } from "./attention-badge";
import { reportShortcutHref } from "../lib/report-shortcuts";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

const activeStates = new Set(["implementing", "validating", "reviewing", "awaiting_audit"]);
const authorityKeywords = [
  "approval",
  "approve",
  "audit",
  "retry",
  "rework",
  "cleanup",
  "merge",
  "provider",
  "launch",
  "mutation",
  "mutate",
  "credential",
  "blocked",
  "failed",
];
const runtimeEvidenceReviewHref = reportShortcutHref("GET /supervisor/runtime-evidence-review-report");

function sortByLatest(items: WorkItemView[]) {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.lastEventAt || right.updatedAt || right.createdAt);
    const leftTime = Date.parse(left.lastEventAt || left.updatedAt || left.createdAt);
    return rightTime - leftTime;
  });
}

function needsAuthorityReview(item: WorkItemView) {
  const text = [item.attentionReason, item.blockedReason, item.nextStep, item.statusSummary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return authorityKeywords.some((keyword) => text.includes(keyword));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function WorkItemSummary({ item, compact = false }: { item: WorkItemView; compact?: boolean }) {
  const authorityReview = needsAuthorityReview(item);
  return (
    <article className="border-b border-[var(--border)] py-4 last:border-b-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.needsAttention ? <AttentionBadge reason={item.attentionReason} /> : null}
            <span className="rounded-full bg-[var(--panel-strong)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {formatWorkflowState(item.state)}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">
              {formatLane(item.lane)}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold">
            <Link href={`/work-items/${item.id}`} className="transition hover:text-[var(--accent)]">
              {item.title}
            </Link>
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.statusSummary}</p>
          {item.attentionReason ? <p className="mt-2 text-sm text-[var(--warn)]">{item.attentionReason}</p> : null}
          {item.blockedReason ? <p className="mt-2 text-sm text-[var(--warn)]">{item.blockedReason}</p> : null}
        </div>
        <div className="grid shrink-0 gap-2 text-xs text-[var(--muted)] sm:grid-cols-3 md:min-w-80 md:grid-cols-1">
          <span>Owner: {item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}</span>
          <span>Age: {item.ageMinutes} min</span>
          <span>Next: {authorityReview ? "Inspect evidence first" : item.nextStep ?? "Open detail"}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/work-items/${item.id}`}
          className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Open detail
        </Link>
        {authorityReview ? (
          <span className="rounded-[0.5rem] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--muted)]">
            Authority-gated: inspect before action
          </span>
        ) : null}
        {!compact && item.lastEventAt ? (
          <span className="font-mono text-[11px] text-[var(--muted)]">Last event: {item.lastEventAt}</span>
        ) : null}
      </div>
    </article>
  );
}

function Panel({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">{eyebrow}</p>
          <h2 className="mt-2 text-lg font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BriefCard({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[0.5rem] border bg-[var(--surface)] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-base font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{children}</p>
    </div>
  );
}

function ScanStep({
  index,
  title,
  count,
  href,
  children,
}: {
  index: number;
  title: string;
  count: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="block h-full rounded-[0.5rem] border bg-[var(--surface)] p-4 transition hover:border-[var(--info)] hover:text-[var(--info)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--panel-strong)] font-mono text-xs text-[var(--muted)]">
            {index}
          </span>
          <span className="rounded-full bg-[var(--panel-strong)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {count}
          </span>
        </div>
        <h3 className="mt-3 text-sm font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{children}</p>
      </Link>
    </li>
  );
}

export function MonitoringHome({ status, items }: { status: RunStatusView; items: WorkItemView[] }) {
  const allAttentionItems = sortByLatest(items.filter((item) => item.needsAttention || item.blockedReason));
  const attentionItems = allAttentionItems.slice(0, 5);
  const allActiveItems = sortByLatest(items.filter((item) => activeStates.has(item.state)));
  const activeItems = allActiveItems.slice(0, 6);
  const recentItems = sortByLatest(items).slice(0, 4);
  const failedOrBlocked = items.filter((item) => ["blocked", "needs_rework"].includes(item.state)).length;
  const authorityReviewCount = items.filter((item) => needsAuthorityReview(item)).length;
  const priorityHref = allAttentionItems.length > 0 ? "/attention" : allActiveItems.length > 0 ? "/active-work" : "/audit";
  const priorityLabel = allAttentionItems.length > 0 ? "Open attention review" : allActiveItems.length > 0 ? "Open active work" : "Open audit";
  const priorityValue = allAttentionItems.length > 0 ? "Operator review first" : allActiveItems.length > 0 ? "Watch active work" : "Calm monitoring";
  const priorityCopy =
    allAttentionItems.length > 0
      ? `${pluralize(allAttentionItems.length, "item")} ${allAttentionItems.length === 1 ? "needs" : "need"} review before any control surface.`
      : allActiveItems.length > 0
        ? `${pluralize(allActiveItems.length, "item")} currently moving; inspect progress before intervening.`
        : "No active attention pressure; use audit and recent evidence for a quiet check.";

  return (
    <div className="space-y-4">
      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Active", String(status.activeCount)],
            ["Attention", String(allAttentionItems.length)],
            ["Failed / blocked", String(failedOrBlocked)],
            ["Queued", String(status.queueCount)],
            ["Mode", status.mode],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{status.summary}</p>
      </section>

      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--info)]">Operations Brief</p>
            <h2 className="mt-2 text-lg font-semibold">What to inspect next</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Passive status only: use the brief to choose a read-only route before opening deliberate controls.
            </p>
          </div>
          <Link
            href={priorityHref}
            className="inline-flex w-fit items-center rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 text-sm font-medium transition hover:border-[var(--info)] hover:text-[var(--info)]"
          >
            {priorityLabel}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <BriefCard label="Priority" value={priorityValue}>
            {priorityCopy}
          </BriefCard>
          <BriefCard label="Safety posture" value="Evidence first">
            {authorityReviewCount > 0
              ? `${pluralize(authorityReviewCount, "authority-sensitive item")} flagged; inspect evidence before action.`
              : "No authority-sensitive attention currently detected on the home surface."}
          </BriefCard>
          <BriefCard label="Execution controls" value="0 on home">
            The home page remains monitoring-only. Execution, approval, retry, cleanup, and launch controls stay elsewhere.
          </BriefCard>
        </div>
      </section>

      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--info)]">Scan Order</p>
            <h2 className="mt-2 text-lg font-semibold">Read the board top-down</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
            A passive path from urgent signals to evidence, keeping control surfaces out of the home page.
          </p>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ScanStep index={1} title="Attention" count={String(allAttentionItems.length)} href="/attention">
            Start with blocked, escalated, or authority-sensitive work before watching normal flow.
          </ScanStep>
          <ScanStep index={2} title="Active work" count={String(allActiveItems.length)} href="/active-work">
            Check moving items for current step, owner, and evidence before intervention.
          </ScanStep>
          <ScanStep index={3} title="Recent evidence" count={String(recentItems.length)} href="/queue">
            Review newly updated records when attention is quiet but the queue is changing.
          </ScanStep>
          <ScanStep index={4} title="Audit trail" count={String(status.doneCount)} href="/audit">
            Fall back to completed and retained evidence when the board is calm.
          </ScanStep>
        </ol>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <Panel
          eyebrow="Attention queue"
          title="Needs operator review"
          action={
            <Link href="/attention" className="text-sm font-medium text-[var(--accent)] transition hover:underline">
              View all
            </Link>
          }
        >
          {attentionItems.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No attention needed.</p>
          ) : (
            attentionItems.map((item) => <WorkItemSummary key={item.id} item={item} />)
          )}
        </Panel>

        <Panel
          eyebrow="Read-only evidence"
          title="Drill-in shortcuts"
          action={
            <Link href="/audit" className="text-sm font-medium text-[var(--accent)] transition hover:underline">
              Open audit
            </Link>
          }
        >
          {recentItems.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No recent evidence found.</p>
          ) : (
            <div className="space-y-3">
              {recentItems.map((item) => {
                const workItemHref = `/work-items/${encodeURIComponent(item.id)}`;
                return (
                  <article
                    key={item.id}
                    className="rounded-[0.5rem] border bg-[var(--surface)] p-3 transition hover:border-[var(--accent)]"
                  >
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {formatWorkflowState(item.state)} / {formatLane(item.lane)}
                    </p>
                    <Link href={workItemHref} className="mt-1 block break-words text-sm font-semibold transition hover:text-[var(--accent)]">
                      {item.title}
                    </Link>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      Inspect routing, attempt, history, and evidence details. No execution controls here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={workItemHref}
                        className="rounded-[0.5rem] border bg-[var(--panel)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Detail
                      </Link>
                      <Link
                        href={`${workItemHref}#runtime-evidence-export`}
                        className="rounded-[0.5rem] border bg-[var(--panel)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Runtime export
                      </Link>
                      <Link
                        href={runtimeEvidenceReviewHref}
                        className="rounded-[0.5rem] border bg-[var(--panel)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Review index
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </section>

      <Panel
        eyebrow="Active work"
        title="Currently moving"
        action={
          <Link href="/active-work" className="text-sm font-medium text-[var(--accent)] transition hover:underline">
            View active
          </Link>
        }
      >
        {activeItems.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No active work is currently moving.</p>
        ) : (
          activeItems.map((item) => <WorkItemSummary key={item.id} item={item} compact />)
        )}
      </Panel>
    </div>
  );
}
