"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemoryProposalV0, WorkPacketV0View } from "@kendall/contracts";

import { useOperatorProfile } from "../lib/operator-profile";
import { getSupervisorBaseUrl } from "../lib/supervisor";

type ReviewAction = "approve_future_draft" | "edit_needed" | "reject" | "defer";

const reviewActions: Array<{
  action: ReviewAction;
  label: string;
  status: MemoryProposalV0["status"];
  operatorAction: MemoryProposalV0["operatorAction"];
  writeBackStatus: MemoryProposalV0["writeBackStatus"];
  decisionNeededContext: string;
}> = [
  {
    action: "approve_future_draft",
    label: "Approve future draft",
    status: "approved",
    operatorAction: "approve",
    writeBackStatus: "approved_for_future",
    decisionNeededContext: "Approved for a future review-gated AI draft only; no canonical memory write-back is allowed by this action.",
  },
  {
    action: "edit_needed",
    label: "Needs edit",
    status: "edit_needed",
    operatorAction: "edit",
    writeBackStatus: "review_gated",
    decisionNeededContext: "Operator requested edits before any future draft write-back can be considered.",
  },
  {
    action: "reject",
    label: "Reject",
    status: "rejected",
    operatorAction: "reject",
    writeBackStatus: "blocked",
    decisionNeededContext: "Operator rejected this memory proposal; write-back remains blocked.",
  },
  {
    action: "defer",
    label: "Defer",
    status: "deferred",
    operatorAction: "defer",
    writeBackStatus: "deferred",
    decisionNeededContext: "Operator deferred this memory proposal for later review.",
  },
];

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function proposalBoundaryLabel(proposal: MemoryProposalV0): string {
  if (proposal.contradictionStatus === "confirmed") {
    return "Confirmed contradiction; Obsidian remains human-owned.";
  }
  if (proposal.freshness === "stale") {
    return "Stale source; review before future use.";
  }
  return "Proposal-only boundary; no source mutation.";
}

function canApproveFutureDraft(proposal: MemoryProposalV0): boolean {
  return proposal.freshness === "fresh" && proposal.contradictionStatus === "none" && !["blocked", "stale", "contradictory", "rejected"].includes(proposal.status);
}

function aiDraftQueued(proposal: MemoryProposalV0): boolean {
  return /AI draft (written|already exists)/.test(proposal.patchSummary ?? "");
}

function canCreateAiDraft(proposal: MemoryProposalV0): boolean {
  return (
    proposal.status === "approved" &&
    proposal.operatorAction === "approve" &&
    proposal.writeBackStatus === "approved_for_future" &&
    proposal.writeBackAllowed === false &&
    proposal.freshness === "fresh" &&
    proposal.contradictionStatus === "none" &&
    !aiDraftQueued(proposal)
  );
}

export function MemoryProposalReviewPanel({
  packet,
  workItemId,
}: {
  packet: WorkPacketV0View;
  workItemId: string;
}) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [message, setMessage] = useState("Review proposals without writing back to Obsidian.");
  const [pending, startTransition] = useTransition();
  const proposals = packet.memoryProposals;
  const llmWikiReadiness = packet.alphaMemorySourceStatus?.llmWikiReadiness;

  function submit(proposal: MemoryProposalV0, action: (typeof reviewActions)[number]) {
    startTransition(async () => {
      setPendingProposalId(proposal.proposalId);
      setMessage(`Updating ${proposal.proposalId}...`);
      const response = await fetch(
        `${getSupervisorBaseUrl()}/work-items/${workItemId}/memory-proposals/${encodeURIComponent(proposal.proposalId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action.status,
            operatorAction: action.operatorAction,
            writeBackStatus: action.writeBackStatus,
            decisionNeededContext: `${action.decisionNeededContext} Reviewed by ${profile.actorLabel}.`,
            writeBackAllowed: false,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: { error?: { message?: string } } }
          | null;
        setMessage(payload?.detail?.error?.message ?? "The supervisor rejected that memory proposal update.");
        setPendingProposalId(null);
        return;
      }

      setMessage(`${proposal.proposalId} updated. Obsidian write-back remains disabled.`);
      setPendingProposalId(null);
      router.refresh();
    });
  }

  function createAiDraft(proposal: MemoryProposalV0) {
    startTransition(async () => {
      setPendingProposalId(proposal.proposalId);
      setMessage(`Creating AI draft for ${proposal.proposalId}...`);
      const response = await fetch(
        `${getSupervisorBaseUrl()}/work-items/${workItemId}/memory-proposals/${encodeURIComponent(proposal.proposalId)}/ai-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorId: profile.actorId,
            actorLabel: profile.actorLabel,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: { error?: { message?: string } } }
          | null;
        setMessage(payload?.detail?.error?.message ?? "The supervisor blocked the AI draft write-back.");
        setPendingProposalId(null);
        return;
      }

      const payload = (await response.json()) as { data?: MemoryProposalV0 };
      setMessage(`${proposal.proposalId} queued as an Obsidian AI draft at ${payload.data?.targetVaultPath ?? "01 Dashboard Queue/AI Drafts"}.`);
      setPendingProposalId(null);
      router.refresh();
    });
  }

  return (
    <section id="memory-proposals" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Memory review</p>
          <h3 className="mt-2 text-xl font-semibold">Obsidian proposals</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Review dashboard-owned proposal state. No action here mutates canonical Obsidian notes.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {proposals.length} proposal{proposals.length === 1 ? "" : "s"}
        </span>
      </div>

      {llmWikiReadiness ? (
        <div className="mt-5 rounded-[1rem] border bg-[var(--surface)] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--accent)]">LLM-Wiki readiness</p>
              <p className="mt-2 text-sm font-semibold">{statusLabel(llmWikiReadiness.decisionState)}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{llmWikiReadiness.boundarySummary}</p>
            </div>
            <span className="w-fit rounded-full bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
              {llmWikiReadiness.canonicality.replaceAll("_", " ")}
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[
              ["Allowed inputs", llmWikiReadiness.allowedInputs.length > 0 ? llmWikiReadiness.allowedInputs.join(", ") : "none"],
              ["Blocked reasons", llmWikiReadiness.blockedReasons.length > 0 ? llmWikiReadiness.blockedReasons.join(", ") : "none"],
              ["Next action", llmWikiReadiness.nextActions.join(" ")],
              ["Rebuild preview", llmWikiReadiness.rebuildPreview ? llmWikiReadiness.rebuildPreview.previewId : "not available"],
              ["Dry-run plan", llmWikiReadiness.rebuildDryRunPlan ? llmWikiReadiness.rebuildDryRunPlan.planId : "not available"],
              ["Durable writes", llmWikiReadiness.durableWriteAllowed ? "allowed" : "blocked"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[0.75rem] border bg-[var(--panel)] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                <p className="mt-1 break-words text-sm">{value}</p>
              </div>
            ))}
          </div>
          {llmWikiReadiness.rebuildPreview ? (
            <div className="mt-3 rounded-[0.75rem] border bg-[var(--panel)] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Metadata-only rebuild preview</p>
              <p className="mt-2 text-sm leading-6">{llmWikiReadiness.rebuildPreview.plannedOutputScope}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  ["Input refs", llmWikiReadiness.rebuildPreview.inputRefs.join(", ")],
                  ["Memory proposals", llmWikiReadiness.rebuildPreview.memoryProposalRefs.join(", ")],
                  ["Retention", llmWikiReadiness.rebuildPreview.retentionClass],
                  ["Stop line", llmWikiReadiness.rebuildPreview.stopLine],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[0.75rem] border bg-[var(--surface)] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                    <p className="mt-1 break-words text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {llmWikiReadiness.rebuildDryRunPlan ? (
            <div className="mt-3 rounded-[0.75rem] border bg-[var(--panel)] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">No-write rebuild dry-run plan</p>
              <p className="mt-2 text-sm leading-6">{llmWikiReadiness.rebuildDryRunPlan.disposableTargetNamespace}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  ["Plan id", llmWikiReadiness.rebuildDryRunPlan.planId],
                  ["Input refs", llmWikiReadiness.rebuildDryRunPlan.inputRefs.join(", ")],
                  ["Planned sections", llmWikiReadiness.rebuildDryRunPlan.plannedDerivedSections.join(", ")],
                  ["Stop lines", llmWikiReadiness.rebuildDryRunPlan.stopLines.join(" ")],
                  ["Discard path", llmWikiReadiness.rebuildDryRunPlan.discardRecoveryPath],
                  ["Write performed", llmWikiReadiness.rebuildDryRunPlan.writePerformed ? "yes" : "no"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[0.75rem] border bg-[var(--surface)] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                    <p className="mt-1 break-words text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {proposals.length === 0 ? (
        <p className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          No memory proposals are attached to this Work Packet.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {proposals.map((proposal) => (
            <article key={proposal.proposalId} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                      {statusLabel(proposal.status)}
                    </span>
                    <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
                      {proposalBoundaryLabel(proposal)}
                    </span>
                  </div>
                  <h4 className="mt-3 break-words text-base font-semibold">{proposal.label}</h4>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{proposal.summary}</p>
                </div>
                <div className="rounded-[1rem] border bg-[var(--panel)] p-3 text-xs text-[var(--muted)] lg:w-64">
                  <p>Write-back: {proposal.writeBackAllowed ? "allowed" : "blocked"}</p>
                  <p className="mt-1">Review state: {statusLabel(proposal.writeBackStatus)}</p>
                  <p className="mt-1">Operator action: {statusLabel(proposal.operatorAction)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ["Proposal id", proposal.proposalId],
                  ["Target folder", proposal.targetVaultFolder],
                  ["Proposal type", statusLabel(proposal.proposalType)],
                  ["Sensitivity", proposal.sensitivity],
                  ["Freshness", proposal.freshness],
                  ["Contradiction", proposal.contradictionStatus],
                  ["Confidence", proposal.confidence],
                  ["Source refs", proposal.sourceRefs.join(", ")],
                  ["Evidence refs", proposal.evidenceRefs.join(", ")],
                  ["Suggested content", proposal.suggestedContentSummary],
                  ["Patch summary", proposal.patchSummary ?? "summary only"],
                  ["Backup / recovery", proposal.backupRecoveryPath],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                    <p className="mt-1 break-words text-sm">{value}</p>
                  </div>
                ))}
              </div>

              {proposal.decisionNeededContext ? (
                <p className="mt-4 rounded-[1rem] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3 text-sm text-[var(--warn)]">
                  {proposal.decisionNeededContext}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {reviewActions.map((action) => {
                  const approvalBlocked = action.action === "approve_future_draft" && !canApproveFutureDraft(proposal);
                  return (
                    <button
                      key={action.action}
                      type="button"
                      disabled={pending || approvalBlocked}
                      title={approvalBlocked ? "Stale, contradictory, blocked, or rejected proposals cannot be approved for future draft write-back." : undefined}
                      onClick={() => submit(proposal, action)}
                      className="rounded-full border bg-[var(--panel)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    >
                      {pending && pendingProposalId === proposal.proposalId ? "Updating..." : action.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={pending || !canCreateAiDraft(proposal)}
                  title={
                    aiDraftQueued(proposal)
                      ? "This proposal already has an AI draft queued."
                      : "Requires an approved, fresh, non-contradictory proposal before writing to the AI Drafts queue."
                  }
                  onClick={() => createAiDraft(proposal)}
                  className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:border-[var(--border)] disabled:bg-[var(--panel)] disabled:text-[var(--muted)] disabled:opacity-50"
                >
                  {pending && pendingProposalId === proposal.proposalId ? "Creating..." : "Create AI draft"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
    </section>
  );
}
