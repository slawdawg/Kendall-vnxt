"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useOperatorProfile } from "../lib/operator-profile";
import { assignWorkItem } from "../lib/supervisor";

export function AssignmentPanel({
  workItemId,
  assigneeId,
  assigneeLabel,
  compact = false,
}: {
  workItemId: string;
  assigneeId?: string | null;
  assigneeLabel?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(
    assigneeId || assigneeLabel
      ? `Owned by ${assigneeLabel ?? assigneeId}.`
      : "No operator owns this item yet.",
  );

  const isMine = assigneeId === profile.actorId || assigneeId === `${profile.actorId}:queue` || assigneeId === `${profile.actorId}:detail`;
  const ownerText = assigneeLabel ?? assigneeId ?? "Unassigned";

  function updateAssignment(nextAssigneeId: string | null, nextAssigneeLabel: string | null) {
    startTransition(async () => {
      try {
        await assignWorkItem(workItemId, {
          assigneeId: nextAssigneeId,
          assigneeLabel: nextAssigneeLabel,
          actorId: profile.actorId,
          actorLabel: profile.actorLabel,
        });
        setMessage(nextAssigneeId || nextAssigneeLabel ? `Assigned to ${nextAssigneeLabel ?? nextAssigneeId}.` : "Ownership released.");
        router.refresh();
      } catch {
        setMessage("Unable to update work item ownership right now.");
      }
    });
  }

  return (
    <section className={compact ? "" : "rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm"}>
      <div className="flex flex-col gap-2">
        {compact ? null : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Ownership</p>
            <h3 className="text-xl font-semibold">Assignment</h3>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            {ownerText}
          </span>
          {isMine ? (
            <span className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
              You
            </span>
          ) : null}
        </div>
      </div>

      {!compact ? (
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
          Acting as {profile.actorLabel} ({profile.actorId})
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => updateAssignment(profile.actorId, profile.actorLabel)}
          disabled={pending}
          className={`rounded-full bg-[var(--accent)] text-sm font-semibold text-[#08110f] transition hover:brightness-110 disabled:opacity-50 ${
            compact ? "px-4 py-2.5" : "px-5 py-3"
          }`}
        >
          {pending ? "Working..." : assigneeId || assigneeLabel ? "Assign to me" : "Claim ownership"}
        </button>
        {(assigneeId || assigneeLabel) ? (
          <button
            type="button"
            onClick={() => updateAssignment(null, null)}
            disabled={pending}
            className={`rounded-full border bg-[var(--surface)] text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 ${
              compact ? "px-4 py-2.5" : "px-5 py-3"
            }`}
          >
            Release ownership
          </button>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
    </section>
  );
}
