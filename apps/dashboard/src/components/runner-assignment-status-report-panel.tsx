"use client";

import { useMemo, useState } from "react";
import type { RunnerAssignmentStatusReportView, RunnerAssignmentStatusRowView, RunnerHandoffAuditEntryView } from "@kendall/contracts";
import {
  AUDIT_JSON_RETAINED_ENTRY_FIELDS,
  AUDIT_JSON_SCHEMA_VERSION,
  auditExportJson,
  auditJsonValidationMessages,
} from "../lib/runner-handoff-audit-json.mjs";

type AuditEvidenceFilter = "all" | RunnerHandoffAuditEntryView["evidenceStatus"];
type AuditPayloadFilter = "all" | RunnerHandoffAuditEntryView["payloadRetention"];
type AssignmentClassificationFilter = "attention" | "active" | "blocked" | "assignable" | "closed" | "all";
type AssignmentSourceFilter = "all" | "workspace" | "lane" | "backlog";
type SourceCompletionFilter = "all" | "any" | "assignment" | "workspace" | "none";
type SourceCompletionPresetFilter = Extract<SourceCompletionFilter, "assignment" | "workspace" | "none">;
type SourcedAssignmentRow = {
  row: RunnerAssignmentStatusRowView;
  source: Exclude<AssignmentSourceFilter, "all">;
};
type FilteredSourceKindSummary = {
  workspace: number;
  lane: number;
  backlog: number;
  sourceCompletionAssignment: number;
  sourceCompletionWorkspace: number;
  sourceCompletionNone: number;
};

function formatGenerated(value: string): string {
  return new Date(value).toLocaleString();
}

function labelFor(classification: string): string {
  if (classification === "blocked_stale_owner_needs_takeover") return "Stale";
  if (classification.startsWith("blocked_")) return "Blocked";
  return classification.replaceAll("_", " ");
}

function sourceLabel(source: AssignmentSourceFilter): string {
  if (source === "all") return "All sources";
  if (source === "workspace") return "Workspace";
  if (source === "lane") return "Lane assignment";
  return "Backlog";
}

function classificationFilterLabel(filter: AssignmentClassificationFilter): string {
  if (filter === "attention") return "Needs attention";
  if (filter === "all") return "All classifications";
  return labelFor(filter);
}

function sourceCompletionFilterLabel(filter: SourceCompletionFilter): string {
  if (filter === "all") return "all source-completion states";
  if (filter === "any") return "any source completion";
  if (filter === "none") return "no source completion";
  return `${filter} source completion`;
}

function sourceCompletionPresetLabel(filter: SourceCompletionPresetFilter): string {
  if (filter === "assignment") return "Assignment-backed";
  if (filter === "workspace") return "Workspace-backed";
  return "Uncompleted";
}

function sourceCompletionShortcutDisabledReason({
  filter,
  count,
  sourceCompletionFilter,
  filtersAtSourceCompletionPresetScope,
}: {
  filter: SourceCompletionPresetFilter;
  count: number;
  sourceCompletionFilter: SourceCompletionFilter;
  filtersAtSourceCompletionPresetScope: boolean;
}): string | null {
  const selectedAtPresetScope = sourceCompletionFilter === filter && filtersAtSourceCompletionPresetScope;
  const label = sourceCompletionPresetLabel(filter);
  const countReason = count === 0 ? `0 ${label.toLowerCase()} rows are available` : null;
  const selectedReason = selectedAtPresetScope ? "the empty-state shortcut already matches the current full-source filter" : null;
  if (countReason && selectedReason) return `${label} disabled: ${selectedReason}, and ${countReason}.`;
  if (countReason) return `${label} unavailable: ${countReason}.`;
  if (selectedReason) return `${label} disabled: ${selectedReason}.`;
  return null;
}

function assignmentRowEmptyStateGuidance({
  classificationFilter,
  sourceFilter,
  sourceCompletionFilter,
  filtersAtDefault,
}: {
  classificationFilter: AssignmentClassificationFilter;
  sourceFilter: AssignmentSourceFilter;
  sourceCompletionFilter: SourceCompletionFilter;
  filtersAtDefault: boolean;
}): string {
  if (sourceCompletionFilter === "assignment") {
    return "This assignment-backed view has 0 rows. Switch to Workspace-backed or Uncompleted, or reset filters before deciding the queue is empty.";
  }
  if (sourceCompletionFilter === "workspace") {
    return "This workspace-backed view has 0 rows. Switch to Assignment-backed or Uncompleted, or reset filters before deciding the queue is empty.";
  }
  if (sourceCompletionFilter === "none") {
    return "This uncompleted view has 0 rows. Switch to Assignment-backed or Workspace-backed, or reset filters before deciding the queue is empty.";
  }
  if (filtersAtDefault) {
    return "The default needs-attention view has 0 rows. Check the dispatcher continuity candidate before deciding the queue is empty.";
  }
  return `This filtered view has 0 rows for ${classificationFilterLabel(classificationFilter)} from ${sourceLabel(sourceFilter)} with ${sourceCompletionFilterLabel(
    sourceCompletionFilter,
  )}. Reset filters to return to the default needs-attention view before deciding the queue is empty.`;
}

function classificationMatches(row: RunnerAssignmentStatusRowView, filter: AssignmentClassificationFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return row.classification !== "closed";
  if (filter === "active") return row.classification === "active" || row.classification === "claimed";
  if (filter === "blocked") return row.classification.startsWith("blocked_") || row.classification === "unknown";
  return row.classification === filter;
}

function sourceCompletionMatches(row: RunnerAssignmentStatusRowView, filter: SourceCompletionFilter): boolean {
  const evidenceKind = row.sourceCompletionEvidence?.evidenceKind;
  if (filter === "all") return true;
  if (filter === "any") return Boolean(evidenceKind);
  if (filter === "none") return !evidenceKind;
  return evidenceKind === filter;
}

function filteredSourceKindSummary(rows: SourcedAssignmentRow[]): FilteredSourceKindSummary {
  return rows.reduce<FilteredSourceKindSummary>(
    (summary, { row, source }) => {
      summary[source] += 1;
      const evidenceKind = row.sourceCompletionEvidence?.evidenceKind;
      if (evidenceKind === "assignment") summary.sourceCompletionAssignment += 1;
      else if (evidenceKind === "workspace") summary.sourceCompletionWorkspace += 1;
      else summary.sourceCompletionNone += 1;
      return summary;
    },
    {
      workspace: 0,
      lane: 0,
      backlog: 0,
      sourceCompletionAssignment: 0,
      sourceCompletionWorkspace: 0,
      sourceCompletionNone: 0,
    },
  );
}

function orderedCountEntries(counts: Record<string, number>): [string, number][] {
  const preferredOrder = [
    "assignable",
    "active",
    "claimed",
    "ambiguous",
    "blocked_authority",
    "blocked_owned_active",
    "blocked_stale_owner_needs_takeover",
    "closed",
  ];
  return [
    ...preferredOrder.filter((key) => Object.hasOwn(counts, key)),
    ...Object.keys(counts)
      .filter((key) => !preferredOrder.includes(key))
      .sort(),
  ].map((key) => [key, counts[key]]);
}

function handoffCountEntries(row: RunnerAssignmentStatusRowView): [string, number][] {
  return orderedCountEntries(row.handoffCandidateStateCounts ?? {});
}

function auditEntrySearchText(entry: RunnerHandoffAuditEntryView): string {
  return [
    entry.sequence,
    entry.lane,
    entry.branch,
    entry.taskId,
    entry.workspaceAction,
    entry.nextCommand,
    entry.generatedAt,
    entry.readinessStatus,
    entry.readinessCommand,
    entry.readinessSummary,
    entry.queueCountsStatus,
    entry.lifecycleState,
    entry.recoveryAction,
    entry.recoverySummary,
    entry.retentionPolicy,
    entry.payloadRetention,
    entry.retentionSummary,
    entry.evidenceStatus,
    entry.evidenceSummary,
    ...Object.keys(entry.queueCounts ?? {}),
    ...(entry.stopLines ?? []),
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();
}

function auditEntryExportText(entry: RunnerHandoffAuditEntryView): string {
  const queueCounts = orderedCountEntries(entry.queueCounts ?? {})
    .map(([state, count]) => `${state.replaceAll("_", " ")}=${count}`)
    .join(", ");
  const stopLines = (entry.stopLines ?? []).join(" | ");
  return [
    `#${entry.sequence} lane=${entry.lane ?? "unknown"} task=${entry.taskId ?? "unknown"} branch=${entry.branch ?? "unknown"}`,
    `evidence=${entry.evidenceStatus}; lifecycle=${entry.lifecycleState}; recovery=${entry.recoveryAction}`,
    `readiness=${entry.readinessStatus ?? "missing"}${entry.readinessCommand ? ` via ${entry.readinessCommand}` : ""}`,
    `queue=${entry.queueCountsStatus}${queueCounts ? `; counts ${queueCounts}` : ""}`,
    `retention=${entry.retentionPolicy}; payload=${entry.payloadRetention}`,
    `retention-summary=${entry.retentionSummary}`,
    stopLines ? `stop-lines=${stopLines}` : "stop-lines=none",
    `summary=${entry.evidenceSummary}`,
  ].join("\n");
}

function auditExportText(
  entries: RunnerHandoffAuditEntryView[],
  totalEntries: number,
  filters: { query: string; evidence: AuditEvidenceFilter; payload: AuditPayloadFilter },
): string {
  const query = filters.query.trim();
  return [
    "Filtered handoff audit export",
    `entries: ${entries.length}/${totalEntries}`,
    `filters: query=${query ? `"${query}"` : "all"}; evidence=${filters.evidence}; payload=${filters.payload}`,
    "retention: metadata-only; raw prompts, completions, provider payloads, reasoning traces, secrets, and source copies are not retained.",
    entries.length > 0 ? entries.map(auditEntryExportText).join("\n\n") : "No filtered audit entries to export.",
  ].join("\n");
}

function auditExportFilename(row: RunnerAssignmentStatusRowView, entries: RunnerHandoffAuditEntryView[]): string {
  const source = entries[0]?.lane ?? row.backlogItemId ?? row.id;
  const safeSource = source
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `handoff-audit-${safeSource || "filtered"}-${entries.length}-of-${row.handoffAuditTrail?.length ?? 0}.txt`;
}

function auditJsonFilename(row: RunnerAssignmentStatusRowView, entries: RunnerHandoffAuditEntryView[]): string {
  return auditExportFilename(row, entries).replace(/\.txt$/, ".json");
}

function Row({ row, source }: { row: RunnerAssignmentStatusRowView; source: Exclude<AssignmentSourceFilter, "all"> }) {
  const hasAvailableHandoff = row.handoffStatus === "available";
  const countEntries = handoffCountEntries(row);
  const auditEntries = row.handoffAuditTrail ?? [];
  const [auditQuery, setAuditQuery] = useState("");
  const [auditEvidenceFilter, setAuditEvidenceFilter] = useState<AuditEvidenceFilter>("all");
  const [auditPayloadFilter, setAuditPayloadFilter] = useState<AuditPayloadFilter>("all");
  const [auditExportStatus, setAuditExportStatus] = useState("Copy summary");
  const filteredAuditEntries = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    return auditEntries.filter((entry) => {
      if (auditEvidenceFilter !== "all" && entry.evidenceStatus !== auditEvidenceFilter) return false;
      if (auditPayloadFilter !== "all" && entry.payloadRetention !== auditPayloadFilter) return false;
      return query ? auditEntrySearchText(entry).includes(query) : true;
    });
  }, [auditEntries, auditEvidenceFilter, auditPayloadFilter, auditQuery]);
  const filteredAuditExportText = useMemo(
    () =>
      auditExportText(filteredAuditEntries, auditEntries.length, {
        query: auditQuery,
        evidence: auditEvidenceFilter,
        payload: auditPayloadFilter,
      }),
    [auditEntries.length, auditEvidenceFilter, auditPayloadFilter, auditQuery, filteredAuditEntries],
  );
  const filteredAuditExportFilename = useMemo(
    () => auditExportFilename(row, filteredAuditEntries),
    [filteredAuditEntries, row],
  );
  const filteredAuditJsonExport = useMemo(
    () =>
      auditExportJson(filteredAuditEntries, auditEntries.length, {
        query: auditQuery,
        evidence: auditEvidenceFilter,
        payload: auditPayloadFilter,
      }),
    [auditEntries.length, auditEvidenceFilter, auditPayloadFilter, auditQuery, filteredAuditEntries],
  );
  const filteredAuditJsonFilename = useMemo(
    () => auditJsonFilename(row, filteredAuditEntries),
    [filteredAuditEntries, row],
  );
  const filteredAuditJsonValidationMessages = useMemo(
    () => auditJsonValidationMessages(filteredAuditJsonExport),
    [filteredAuditJsonExport],
  );
  const filteredAuditJsonValidationSummary =
    filteredAuditJsonValidationMessages.length === 0
      ? `JSON validation: schema v${AUDIT_JSON_SCHEMA_VERSION} metadata-only; retained fields ${AUDIT_JSON_RETAINED_ENTRY_FIELDS.length}.`
      : `JSON validation failed: ${filteredAuditJsonValidationMessages.join("; ")}.`;

  async function copyAuditExportSummary() {
    setAuditExportStatus(`Copy prepared for ${filteredAuditEntries.length} audit ${filteredAuditEntries.length === 1 ? "entry" : "entries"}.`);
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(filteredAuditExportText);
      setAuditExportStatus(`Copied ${filteredAuditEntries.length} audit ${filteredAuditEntries.length === 1 ? "entry" : "entries"}.`);
    } catch {
      setAuditExportStatus("Copy unavailable; select summary text.");
    }
  }

  function downloadAuditExportSummary() {
    setAuditExportStatus(`Download prepared for ${filteredAuditEntries.length} audit ${filteredAuditEntries.length === 1 ? "entry" : "entries"}.`);
    if (typeof window === "undefined" || typeof document === "undefined" || typeof Blob === "undefined") return;
    const url = window.URL.createObjectURL(new Blob([filteredAuditExportText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filteredAuditExportFilename;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function downloadAuditJsonExport() {
    setAuditExportStatus(`JSON download prepared for ${filteredAuditEntries.length} audit ${filteredAuditEntries.length === 1 ? "entry" : "entries"}.`);
    if (typeof window === "undefined" || typeof document === "undefined" || typeof Blob === "undefined") return;
    const url = window.URL.createObjectURL(new Blob([filteredAuditJsonExport], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filteredAuditJsonFilename;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <article className="rounded-[0.75rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{labelFor(row.classification)}</p>
          <h4 className="mt-1 text-sm font-semibold">{row.title}</h4>
        </div>
        <span className="w-fit rounded-full border bg-[var(--surface)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
          {row.reasonCode}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{row.reason}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">source: {sourceLabel(source)}</span>
        <span className="break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">owner: {row.owner ?? "none"}</span>
        <span className="break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">branch: {row.branch ?? "none"}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">phase: {row.phase ?? "none"}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">heartbeat: {row.heartbeatAgeSeconds ?? "missing"}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">worktree: {row.worktreeState}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">delivery: {row.deliveryState}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">handoff: {row.handoffStatus}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">lifecycle: {row.handoffLifecycleState}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">recovery: {row.handoffRecoveryAction}</span>
      </div>
      <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--accent)]">{row.nextSafeAction}</p>
      {row.sourceCompletionEvidence ? (
        <div data-testid="source-completion-evidence" className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          <p className="font-semibold text-[var(--foreground)]">Source completion evidence</p>
          <p>Kind: {row.sourceCompletionEvidence.evidenceKind}</p>
          <p className="break-all">Record: {row.sourceCompletionEvidence.recordId}</p>
          <p className="break-all">Source backlog item: {row.sourceCompletionEvidence.sourceBacklogItemId}</p>
          {row.sourceCompletionEvidence.branch ? <p className="break-all">Branch: {row.sourceCompletionEvidence.branch}</p> : null}
          {row.sourceCompletionEvidence.taskId ? <p className="break-all">Task: {row.sourceCompletionEvidence.taskId}</p> : null}
          {row.sourceCompletionEvidence.sourceAssignmentId ? <p className="break-all">Source assignment: {row.sourceCompletionEvidence.sourceAssignmentId}</p> : null}
          {row.sourceCompletionEvidence.evidencePath ? <p className="break-all">Evidence path: {row.sourceCompletionEvidence.evidencePath}</p> : null}
          <p className="break-all">Summary: {row.sourceCompletionEvidence.evidenceSummary}</p>
        </div>
      ) : null}
      {row.handoffRecoveryAction !== "no-action" ? (
        <p className="mt-2 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          Recovery: {row.handoffRecoverySummary}
        </p>
      ) : null}
      {row.currentCommand ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Current command: {row.currentCommand}</p> : null}
      {row.lastResult ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Last result: {row.lastResult}</p> : null}
      {hasAvailableHandoff ? (
        <div data-testid="resume-packet" className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          <p className="font-semibold text-[var(--foreground)]">Resume packet</p>
          <p className="break-all">Owner: {row.owner ?? "none"}</p>
          <p className="break-all">Branch: {row.branch ?? "none"}</p>
          <p>Worktree state: {row.worktreeState}</p>
          {row.handoffNextCommand ? <p className="break-all">Next command: {row.handoffNextCommand}</p> : null}
          {row.handoffGeneratedAt ? <p className="break-all">Generated: {row.handoffGeneratedAt}</p> : null}
          {row.handoffReadinessStatus || row.handoffReadinessCommand ? (
            <p className="break-all">
              Readiness: {row.handoffReadinessStatus ?? "missing"}
              {row.handoffReadinessCommand ? ` via ${row.handoffReadinessCommand}` : ""}
            </p>
          ) : null}
          {row.handoffSummary ? <p className="break-all">Summary: {row.handoffSummary}</p> : null}
          <p>Lifecycle: {row.handoffLifecycleState}</p>
          <p>Recovery action: {row.handoffRecoveryAction}</p>
          <p>Recovery: {row.handoffRecoverySummary}</p>
          <p>Queue counts: {row.handoffCandidateStateCountsStatus}</p>
          {countEntries.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {countEntries.map(([state, count]) => (
                <span key={`${row.id}:handoff-count:${state}`} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {state.replaceAll("_", " ")}: {count}
                </span>
              ))}
            </div>
          ) : null}
          {row.handoffTakeoverStopLines.length > 0 ? (
            <ul className="mt-1 grid gap-1 text-[var(--warn)]">
              {row.handoffTakeoverStopLines.map((stopLine) => (
                <li key={`${row.id}:resume-stop:${stopLine}`} className="break-all">
                  Stop: {stopLine}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {auditEntries.length > 0 ? (
        <div data-testid="handoff-audit-trail" className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--foreground)]">Handoff audit trail</p>
              <p className="font-mono text-[11px] text-[var(--muted)]">
                Audit query: {filteredAuditEntries.length}/{auditEntries.length}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto_auto]">
              <label className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Query</span>
                <input
                  className="h-8 rounded-[0.5rem] border bg-[var(--panel)] px-2 text-xs text-[var(--foreground)]"
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                  placeholder="audit text"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Evidence</span>
                <select
                  className="h-8 rounded-[0.5rem] border bg-[var(--panel)] px-2 text-xs text-[var(--foreground)]"
                  value={auditEvidenceFilter}
                  onChange={(event) => setAuditEvidenceFilter(event.target.value as AuditEvidenceFilter)}
                >
                  <option value="all">all</option>
                  <option value="complete">complete</option>
                  <option value="partial">partial</option>
                  <option value="invalid">invalid</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Payload</span>
                <select
                  className="h-8 rounded-[0.5rem] border bg-[var(--panel)] px-2 text-xs text-[var(--foreground)]"
                  value={auditPayloadFilter}
                  onChange={(event) => setAuditPayloadFilter(event.target.value as AuditPayloadFilter)}
                >
                  <option value="all">all</option>
                  <option value="not-retained">not-retained</option>
                  <option value="redacted">redacted</option>
                  <option value="omitted">omitted</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-2 grid gap-2">
            {filteredAuditEntries.map((entry) => {
              const auditCounts = orderedCountEntries(entry.queueCounts ?? {});
              const stopLines = entry.stopLines ?? [];
              return (
                <div key={`${row.id}:handoff-audit:${entry.sequence}`} className="border-t pt-2 first:border-t-0 first:pt-0">
                  <p className="break-all">
                    Audit #{entry.sequence}: {entry.evidenceStatus}; lifecycle {entry.lifecycleState}; recovery {entry.recoveryAction}
                  </p>
                  <p className="break-all">
                    Handoff: {entry.workspaceAction ?? "unknown"} {entry.generatedAt ? `at ${entry.generatedAt}` : "with no timestamp"}
                  </p>
                  {entry.readinessStatus || entry.readinessCommand ? (
                    <p className="break-all">
                      Readiness evidence: {entry.readinessStatus ?? "missing"}
                      {entry.readinessCommand ? ` via ${entry.readinessCommand}` : ""}
                    </p>
                  ) : null}
                  {entry.readinessSummary ? <p className="break-all">Readiness summary: {entry.readinessSummary}</p> : null}
                  <p>Queue evidence: {entry.queueCountsStatus}</p>
                  <p>
                    Retention: {entry.retentionPolicy}; payload {entry.payloadRetention}
                  </p>
                  <p className="break-all">Retention summary: {entry.retentionSummary}</p>
                  {auditCounts.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {auditCounts.map(([state, count]) => (
                        <span key={`${row.id}:handoff-audit:${entry.sequence}:${state}`} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                          {state.replaceAll("_", " ")}: {count}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {stopLines.length > 0 ? (
                    <ul className="mt-1 grid gap-1 text-[var(--warn)]">
                      {stopLines.map((stopLine, stopLineIndex) => (
                        <li key={`${row.id}:handoff-audit:${entry.sequence}:${stopLineIndex}:${stopLine}`} className="break-all">
                          Audit stop: {stopLine}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="break-all">{entry.evidenceSummary}</p>
                </div>
              );
            })}
            {filteredAuditEntries.length === 0 ? (
              <p className="rounded-[0.5rem] border bg-[var(--panel)] px-2 py-1 text-[var(--muted)]">No audit entries match the current query.</p>
            ) : null}
          </div>
          <div className="mt-3 rounded-[0.5rem] border bg-[var(--panel)] p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-[var(--foreground)]">Filtered audit export</p>
              <button
                type="button"
                className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--foreground)]"
                onClick={copyAuditExportSummary}
              >
                Copy summary
              </button>
              <button
                type="button"
                className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--foreground)]"
                onClick={downloadAuditExportSummary}
              >
                Download .txt
              </button>
              <button
                type="button"
                className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--foreground)]"
                onClick={downloadAuditJsonExport}
              >
                Download .json
              </button>
            </div>
            <p className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">filename: {filteredAuditExportFilename}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">json filename: {filteredAuditJsonFilename}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">{filteredAuditJsonValidationSummary}</p>
            <textarea
              className="mt-2 min-h-32 w-full resize-y rounded-[0.5rem] border bg-[var(--surface)] p-2 font-mono text-[11px] leading-5 text-[var(--foreground)]"
              aria-label="Filtered audit export"
              readOnly
              value={filteredAuditExportText}
            />
            <textarea
              className="mt-2 min-h-32 w-full resize-y rounded-[0.5rem] border bg-[var(--surface)] p-2 font-mono text-[11px] leading-5 text-[var(--foreground)]"
              aria-label="Filtered audit JSON export"
              readOnly
              value={filteredAuditJsonExport}
            />
            <p className="mt-1 text-[11px] text-[var(--muted)]">{auditExportStatus}</p>
          </div>
        </div>
      ) : null}
      {!hasAvailableHandoff && row.handoffNextCommand ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">Handoff next: {row.handoffNextCommand}</p>
      ) : null}
      {!hasAvailableHandoff && row.handoffGeneratedAt ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">Handoff generated: {row.handoffGeneratedAt}</p>
      ) : null}
      {!hasAvailableHandoff && (row.handoffReadinessStatus || row.handoffReadinessCommand) ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">
          Handoff readiness: {row.handoffReadinessStatus ?? "missing"}
          {row.handoffReadinessCommand ? ` via ${row.handoffReadinessCommand}` : ""}
        </p>
      ) : null}
      {!hasAvailableHandoff && row.handoffSummary ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">Handoff summary: {row.handoffSummary}</p>
      ) : null}
      {!hasAvailableHandoff && row.handoffTakeoverStopLines.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--warn)]">
          {row.handoffTakeoverStopLines.map((stopLine) => (
            <li key={`${row.id}:handoff-stop:${stopLine}`} className="break-all">
              Handoff stop: {stopLine}
            </li>
          ))}
        </ul>
      ) : null}
      {row.warnings.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {row.warnings.map((warning) => (
            <span key={`${row.id}:${warning.code}`} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--warn)]">
              {warning.code}
            </span>
          ))}
        </div>
      ) : null}
      {row.worktreePath ? <p className="mt-2 break-all font-mono text-[11px] text-[var(--muted)]">{row.worktreePath}</p> : null}
    </article>
  );
}

export function RunnerAssignmentStatusReportPanel({ report }: { report: RunnerAssignmentStatusReportView }) {
  const [classificationFilter, setClassificationFilter] = useState<AssignmentClassificationFilter>("attention");
  const [sourceFilter, setSourceFilter] = useState<AssignmentSourceFilter>("all");
  const [sourceCompletionFilter, setSourceCompletionFilter] = useState<SourceCompletionFilter>("all");
  const rows: SourcedAssignmentRow[] = [
    ...report.workspaceAssignments.map((row) => ({ row, source: "workspace" as const })),
    ...report.laneAssignments.map((row) => ({ row, source: "lane" as const })),
    ...report.backlogCandidates.map((row) => ({ row, source: "backlog" as const })),
  ];
  const filteredRows = rows.filter(({ row, source }) => {
    if (sourceFilter !== "all" && source !== sourceFilter) return false;
    if (!sourceCompletionMatches(row, sourceCompletionFilter)) return false;
    return classificationMatches(row, classificationFilter);
  });
  const sourceCompletionPresetCounts = {
    assignment: rows.filter(({ row }) => sourceCompletionMatches(row, "assignment")).length,
    workspace: rows.filter(({ row }) => sourceCompletionMatches(row, "workspace")).length,
    none: rows.filter(({ row }) => sourceCompletionMatches(row, "none")).length,
  };
  const filteredSourceSummary = filteredSourceKindSummary(filteredRows);
  const filtersAtDefault = classificationFilter === "attention" && sourceFilter === "all" && sourceCompletionFilter === "all";
  const filtersAtSourceCompletionPresetScope = classificationFilter === "all" && sourceFilter === "all";
  const emptyStateGuidance = assignmentRowEmptyStateGuidance({
    classificationFilter,
    sourceFilter,
    sourceCompletionFilter,
    filtersAtDefault,
  });
  const resetFilters = () => {
    setClassificationFilter("attention");
    setSourceFilter("all");
    setSourceCompletionFilter("all");
  };
  const applySourceCompletionPreset = (filter: SourceCompletionPresetFilter) => {
    setClassificationFilter("all");
    setSourceFilter("all");
    setSourceCompletionFilter(filter);
  };
  const sourceCompletionShortcutDisabledReasons = {
    assignment: sourceCompletionShortcutDisabledReason({
      filter: "assignment",
      count: sourceCompletionPresetCounts.assignment,
      sourceCompletionFilter,
      filtersAtSourceCompletionPresetScope,
    }),
    workspace: sourceCompletionShortcutDisabledReason({
      filter: "workspace",
      count: sourceCompletionPresetCounts.workspace,
      sourceCompletionFilter,
      filtersAtSourceCompletionPresetScope,
    }),
    none: sourceCompletionShortcutDisabledReason({
      filter: "none",
      count: sourceCompletionPresetCounts.none,
      sourceCompletionFilter,
      filtersAtSourceCompletionPresetScope,
    }),
  };
  const sourceCompletionShortcutDisabled = (filter: SourceCompletionPresetFilter) => sourceCompletionShortcutDisabledReasons[filter] !== null;
  const applyEmptyStateSourceCompletionPreset = (filter: SourceCompletionPresetFilter) => {
    if (sourceCompletionShortcutDisabled(filter)) return;
    applySourceCompletionPreset(filter);
  };
  const emptyStateShortcutDisabledReasonRows = Object.entries(sourceCompletionShortcutDisabledReasons).filter(
    (entry): entry is [SourceCompletionPresetFilter, string] => entry[1] !== null,
  );
  const closedAssignmentEvidenceRows = [...report.workspaceAssignments, ...report.laneAssignments].filter((row) => row.classification === "closed");
  return (
    <section className="rounded-[1rem] border bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Runner Assignment Status</p>
          <h2 className="mt-2 text-xl font-semibold">Which lane needs attention now?</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Generated {formatGenerated(report.generatedAt)}. State root {report.stateRootStatus}; stale after {report.staleAfterSeconds}s.
          </p>
        </div>
        <span className="w-fit rounded-full border bg-[var(--panel)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {report.reportStatus}
        </span>
      </div>

      {report.reportStatus === "error" ? (
        <p className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 text-sm text-[var(--warn)]">
          Assignment status could not be inspected. {report.errorMessage ?? "No assignment action."}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(report.summary).map(([label, value]) => (
          <div key={label} className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div data-testid="source-completion-rollup" className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Source completion rollup</p>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)] sm:grid-cols-2">
          <p>Total: {report.sourceCompletionRollup.total}</p>
          <p>Assignment: {report.sourceCompletionRollup.assignment}</p>
          <p>Workspace: {report.sourceCompletionRollup.workspace}</p>
          <p className="break-all">Source backlog items: {report.sourceCompletionRollup.sourceBacklogItemIds.join(", ") || "none"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Dispatcher continuity snapshot</p>
        <p className="mt-1 text-sm font-semibold">{report.dispatcherContinuity.snapshotId}</p>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)] sm:grid-cols-2">
          <p className="break-all">Candidate: {report.dispatcherContinuity.selectedBacklogItemId ?? "none"}</p>
          <p className="break-all">Branch: {report.dispatcherContinuity.selectedBranch ?? "none"}</p>
          <p className="break-all">Dry run: {report.dispatcherContinuity.dryRunCommand}</p>
          <p>Assignable: {report.dispatcherContinuity.assignableCount}</p>
          <p>Active: {report.dispatcherContinuity.activeCount}</p>
          <p>Blocked: {report.dispatcherContinuity.blockedCount}</p>
          <p>Ambiguous: {report.dispatcherContinuity.ambiguousCount}</p>
          <p>Closed: {report.dispatcherContinuity.closedCount}</p>
        </div>
        {report.dispatcherContinuity.blockerCodes.length > 0 ? (
          <p className="mt-2 break-all text-xs leading-5 text-[var(--muted)]">Blockers: {report.dispatcherContinuity.blockerCodes.join(", ")}</p>
        ) : null}
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Queue proof</p>
          <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
            {report.dispatcherContinuity.queueProofRows.map((row) => (
              <p key={`${row.backlogItemId}:${row.classification}:${row.reasonCode}`} className="break-all">
                {row.backlogItemId}: {row.classification} ({row.reasonCode}) {row.branch ? `branch ${row.branch}` : "no branch"}
              </p>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{report.dispatcherContinuity.nextAction}</p>
      </div>

      {closedAssignmentEvidenceRows.length > 0 ? (
        <div data-testid="closed-assignment-evidence" className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Closed assignment evidence</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {closedAssignmentEvidenceRows.length} closed assignment evidence {closedAssignmentEvidenceRows.length === 1 ? "row" : "rows"} retained as
            non-dispatchable proof.
          </p>
          <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
            {closedAssignmentEvidenceRows.slice(0, 8).map((row) => (
              <p key={`${row.id}:closed-assignment-evidence`} className="break-all">
                {row.assignmentId ?? row.id}: {row.reasonCode} {row.branch ? `branch ${row.branch}` : "no branch"} - {row.nextSafeAction}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div data-testid="assignment-row-filters" className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Assignment row filters</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Showing {filteredRows.length}/{rows.length} rows for {classificationFilterLabel(classificationFilter)} from {sourceLabel(sourceFilter)} with{" "}
              {sourceCompletionFilterLabel(sourceCompletionFilter)}.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Classification</span>
              <select
                aria-label="Classification"
                className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"
                value={classificationFilter}
                onChange={(event) => setClassificationFilter(event.target.value as AssignmentClassificationFilter)}
              >
                <option value="attention">needs attention</option>
                <option value="active">active</option>
                <option value="blocked">blocked</option>
                <option value="assignable">assignable</option>
                <option value="closed">closed</option>
                <option value="all">all</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Source</span>
              <select
                aria-label="Source"
                className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as AssignmentSourceFilter)}
              >
                <option value="all">all</option>
                <option value="workspace">workspace</option>
                <option value="lane">lane assignment</option>
                <option value="backlog">backlog</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Source completion</span>
              <select
                aria-label="Source completion"
                className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"
                value={sourceCompletionFilter}
                onChange={(event) => setSourceCompletionFilter(event.target.value as SourceCompletionFilter)}
              >
                <option value="all">all</option>
                <option value="any">any</option>
                <option value="assignment">assignment</option>
                <option value="workspace">workspace</option>
                <option value="none">none</option>
              </select>
            </label>
            <button
              type="button"
              aria-label="Reset assignment row filters"
              className="h-8 self-end rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={filtersAtDefault}
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Assignment row filter presets">
            <button
              type="button"
              aria-label={`Show assignment-backed rows (${sourceCompletionPresetCounts.assignment})`}
              className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)]"
              onClick={() => applySourceCompletionPreset("assignment")}
            >
              Assignment-backed <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">{sourceCompletionPresetCounts.assignment}</span>
            </button>
            <button
              type="button"
              aria-label={`Show workspace-backed rows (${sourceCompletionPresetCounts.workspace})`}
              className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)]"
              onClick={() => applySourceCompletionPreset("workspace")}
            >
              Workspace-backed <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">{sourceCompletionPresetCounts.workspace}</span>
            </button>
            <button
              type="button"
              aria-label={`Show uncompleted rows (${sourceCompletionPresetCounts.none})`}
              className="h-8 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)]"
              onClick={() => applySourceCompletionPreset("none")}
            >
              Uncompleted <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">{sourceCompletionPresetCounts.none}</span>
            </button>
          </div>
        </div>
        <div data-testid="filtered-source-kind-summary" className="mt-3 grid gap-1 text-xs leading-5 text-[var(--muted)] sm:grid-cols-2">
          <p className="font-semibold text-[var(--foreground)]">Filtered source summary</p>
          <p>
            Rows: workspace {filteredSourceSummary.workspace}, lane assignment {filteredSourceSummary.lane}, backlog {filteredSourceSummary.backlog}
          </p>
          <p>
            Source completion: assignment {filteredSourceSummary.sourceCompletionAssignment}, workspace {filteredSourceSummary.sourceCompletionWorkspace}, none{" "}
            {filteredSourceSummary.sourceCompletionNone}
          </p>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>No assignment rows match the current filters. {emptyStateGuidance}</p>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-label={`Show assignment-backed rows from empty state (${sourceCompletionPresetCounts.assignment})`}
                aria-describedby={sourceCompletionShortcutDisabledReasons.assignment ? "empty-state-assignment-shortcut-disabled-reason" : undefined}
                aria-disabled={sourceCompletionShortcutDisabled("assignment")}
                className="h-8 w-fit shrink-0 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                onClick={() => applyEmptyStateSourceCompletionPreset("assignment")}
              >
                Assignment-backed <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">{sourceCompletionPresetCounts.assignment}</span>
              </button>
              <button
                type="button"
                aria-label={`Show workspace-backed rows from empty state (${sourceCompletionPresetCounts.workspace})`}
                aria-describedby={sourceCompletionShortcutDisabledReasons.workspace ? "empty-state-workspace-shortcut-disabled-reason" : undefined}
                aria-disabled={sourceCompletionShortcutDisabled("workspace")}
                className="h-8 w-fit shrink-0 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                onClick={() => applyEmptyStateSourceCompletionPreset("workspace")}
              >
                Workspace-backed <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">{sourceCompletionPresetCounts.workspace}</span>
              </button>
              <button
                type="button"
                aria-label={`Show uncompleted rows from empty state (${sourceCompletionPresetCounts.none})`}
                aria-describedby={sourceCompletionShortcutDisabledReasons.none ? "empty-state-none-shortcut-disabled-reason" : undefined}
                aria-disabled={sourceCompletionShortcutDisabled("none")}
                className="h-8 w-fit shrink-0 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                onClick={() => applyEmptyStateSourceCompletionPreset("none")}
              >
                Uncompleted <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">{sourceCompletionPresetCounts.none}</span>
              </button>
              <button
                type="button"
                aria-label="Reset assignment row filters from empty state"
                className="h-8 w-fit shrink-0 rounded-[0.5rem] border bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={filtersAtDefault}
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>
            {emptyStateShortcutDisabledReasonRows.length > 0 ? (
              <div data-testid="empty-state-shortcut-disabled-reasons" className="grid gap-1 text-xs leading-5 text-[var(--muted)]">
                {emptyStateShortcutDisabledReasonRows.map(([filter, reason]) => (
                  <p key={filter} id={`empty-state-${filter}-shortcut-disabled-reason`}>
                    {reason}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {filteredRows.map(({ row, source }) => (
            <Row key={`${source}:${row.id}:${row.classification}:${row.reasonCode}`} row={row} source={source} />
          ))}
        </div>
      )}

      {report.degradedInputs.length > 0 ? (
        <details className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Degraded evidence</summary>
          <div className="mt-2 grid gap-2">
            {report.degradedInputs.map((input, index) => (
              <p key={`${input.inputKind}:${input.path ?? index}`} className="break-all text-xs leading-5 text-[var(--muted)]">
                {input.severity}: {input.inputKind} {input.path ?? ""} {input.reason}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
