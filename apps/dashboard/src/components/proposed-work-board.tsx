"use client";

import type { CandidateWorkView } from "@kendall/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { promoteCandidateWork, updateCandidateWork } from "../lib/supervisor";

const sourceLabels: Record<CandidateWorkView["source"], string> = {
  bmad: "BMAD",
  chief_of_staff: "Chief of Staff",
  operator: "Dev Console",
  supervisor: "System",
};

const statusLabels: Record<CandidateWorkView["status"], string> = {
  proposed: "Needs review",
  approved: "Approved",
  rejected: "Not moving forward",
  deferred: "Later",
};

const priorityLabels: Record<CandidateWorkView["priority"], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const riskLabels: Record<CandidateWorkView["riskLevel"], string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

function chipTone(value: string): string {
  if (["urgent", "high", "rejected"].includes(value)) {
    return "border-[color-mix(in_srgb,var(--warn)_55%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[#ffd7c8]";
  }
  if (["approved", "medium"].includes(value)) {
    return "border-[color-mix(in_srgb,var(--accent-2)_60%,var(--line))] bg-[color-mix(in_srgb,var(--accent-2)_13%,transparent)] text-[#ffd8ba]";
  }
  if (["deferred", "low"].includes(value)) {
    return "border-[color-mix(in_srgb,var(--muted)_55%,var(--line))] bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] text-[var(--muted)]";
  }
  return "border-[color-mix(in_srgb,var(--accent)_58%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-[#bff5df]";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProposedWorkBoard({ candidates }: { candidates: CandidateWorkView[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(candidateId: string, action: () => Promise<unknown>, refresh = true) {
    setPendingId(candidateId);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          await action();
          if (refresh) {
            router.refresh();
          }
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Unable to update proposed work.");
          setPendingId(null);
        }
      })();
    });
  }

  if (!candidates.length) {
    return (
      <section className="rounded-lg border bg-[var(--panel)] p-8">
        <div className="mx-auto max-w-2xl text-center">
          <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border bg-[var(--surface)] text-2xl">
            +
          </div>
          <h3 className="mt-5 text-2xl font-semibold">No proposed work yet</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            BMAD plans, Chief of Staff requests, Dev Console ideas, and system suggestions can appear here before they enter active work.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {candidates.map((candidate) => (
        <article key={candidate.id} className="rounded-lg border bg-[var(--panel)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${chipTone(candidate.status)}`}>
                  {statusLabels[candidate.status]}
                </span>
                <span className="rounded-md border bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
                  {sourceLabels[candidate.source]}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold leading-7">{candidate.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{candidate.requestedOutcome}</p>
            </div>
            <div className="grid min-w-36 grid-cols-2 gap-2 text-xs sm:grid-cols-1">
              <span className={`rounded-md border px-3 py-2 ${chipTone(candidate.riskLevel)}`}>{riskLabels[candidate.riskLevel]}</span>
              <span className={`rounded-md border px-3 py-2 ${chipTone(candidate.priority)}`}>
                {priorityLabels[candidate.priority]} priority
              </span>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-[var(--muted)]">Source artifact</dt>
              <dd className="mt-1 break-words font-mono text-xs text-[var(--foreground)]">{candidate.sourceArtifactPath}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-[var(--muted)]">Last touched</dt>
              <dd className="mt-1 text-[var(--foreground)]">{formatDate(candidate.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-[var(--muted)]">Created</dt>
              <dd className="mt-1 text-[var(--foreground)]">{formatDate(candidate.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-[var(--muted)]">Next step</dt>
              <dd className="mt-1 text-[var(--foreground)]">
                {candidate.promotedWorkItemId ? "Already active" : "Review before active work"}
              </dd>
            </div>
          </dl>

          <div className="mt-5 border-t pt-4">
            <div className="flex flex-wrap gap-2">
              {(["low", "normal", "high", "urgent"] as const).map((priority) => (
                <button
                  key={priority}
                  type="button"
                  disabled={isPending && pendingId === candidate.id}
                  onClick={() => runAction(candidate.id, () => updateCandidateWork(candidate.id, { priority }))}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] disabled:opacity-50 ${
                    candidate.priority === priority ? "bg-[var(--panel-strong)] text-[var(--accent)]" : "bg-[var(--surface)] text-[var(--muted)]"
                  }`}
                >
                  {priorityLabels[priority]}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending && pendingId === candidate.id}
                onClick={() => runAction(candidate.id, () => updateCandidateWork(candidate.id, { sortOrder: candidate.sortOrder - 1 }))}
                className="rounded-md border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                Move earlier
              </button>
              <button
                type="button"
                disabled={isPending && pendingId === candidate.id}
                onClick={() => runAction(candidate.id, () => updateCandidateWork(candidate.id, { sortOrder: candidate.sortOrder + 1 }))}
                className="rounded-md border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                Move later
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending && pendingId === candidate.id}
                onClick={() => runAction(candidate.id, () => updateCandidateWork(candidate.id, { status: "approved" }))}
                className="rounded-md border border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-4 py-2 text-sm font-semibold text-[#bff5df] transition hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={isPending && pendingId === candidate.id}
                onClick={() => runAction(candidate.id, () => updateCandidateWork(candidate.id, { status: "deferred" }))}
                className="rounded-md border bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                Save for later
              </button>
              <button
                type="button"
                disabled={isPending && pendingId === candidate.id}
                onClick={() => runAction(candidate.id, () => updateCandidateWork(candidate.id, { status: "rejected" }))}
                className="rounded-md border border-[color-mix(in_srgb,var(--warn)_45%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-2 text-sm font-semibold text-[#ffd7c8] transition hover:bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] disabled:opacity-50"
              >
                Pass
              </button>
              <button
                type="button"
                disabled={candidate.status !== "approved" || Boolean(candidate.promotedWorkItemId) || (isPending && pendingId === candidate.id)}
                onClick={() =>
                  runAction(
                    candidate.id,
                    async () => {
                      const result = await promoteCandidateWork(candidate.id);
                      router.push(`/work-items/${result.workItem.id}`);
                    },
                    false,
                  )
                }
                className="rounded-md border border-[color-mix(in_srgb,var(--accent-2)_65%,var(--line))] bg-[color-mix(in_srgb,var(--accent-2)_14%,transparent)] px-4 py-2 text-sm font-semibold text-[#ffd8ba] transition enabled:hover:bg-[color-mix(in_srgb,var(--accent-2)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {candidate.promotedWorkItemId ? "Already active" : "Move to active work"}
              </button>
            </div>
            {message && pendingId === candidate.id ? <p className="mt-3 text-sm text-[var(--warn)]">{message}</p> : null}
          </div>
        </article>
      ))}
    </section>
  );
}
