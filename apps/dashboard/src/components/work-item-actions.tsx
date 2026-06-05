"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowAction, WorkflowState } from "@kendall/contracts";

import { useOperatorProfile } from "../lib/operator-profile";
import { getSupervisorBaseUrl } from "../lib/supervisor";
import { actionsByState, messageForWorkflowAction, policyHintForState } from "../lib/workflow-actions";

export function WorkItemActions({
  workItemId,
  state,
  requiresAudit = false,
  compact = false,
}: {
  workItemId: string;
  state: WorkflowState;
  requiresAudit?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(
    compact ? "Use a quick action to move this item." : "Choose the next workflow decision.",
  );
  const [note, setNote] = useState("");

  const actions = actionsByState[state] ?? [];
  const policyHint = policyHintForState(state, requiresAudit);
  if (actions.length === 0) {
    return null;
  }

  function submit(action: WorkflowAction) {
    startTransition(async () => {
      setMessage("Submitting workflow action...");
      const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: note.trim() || null,
          actorId: `${profile.actorId}:${compact ? "queue" : "detail"}`,
          actorLabel: profile.actorLabel,
        }),
      });

        if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: { error?: { message?: string } } }
          | null;
        setMessage(payload?.detail?.error?.message ?? "The supervisor rejected that transition.");
        return;
      }

      setMessage(messageForWorkflowAction(action));
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className={compact ? "" : "rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm"}>
      <div className="flex flex-col gap-2">
        {compact ? null : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Workflow actions</p>
            <h3 className="text-xl font-semibold">Move this item forward</h3>
          </>
        )}
      </div>
      {policyHint ? (
        <div className="mt-3 rounded-2xl border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-3 text-sm text-[var(--warn)]">
          {policyHint}
        </div>
      ) : null}
      <label className={compact ? "mt-0 flex flex-col gap-2" : "mt-5 flex flex-col gap-2"}>
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Operator note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional rationale, validation result, or operator guidance."
          className={`rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)] ${
            compact ? "min-h-20" : "min-h-24"
          }`}
        />
      </label>
      {!compact ? (
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
          Acting as {profile.actorLabel} ({profile.actorId})
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((item) => (
          <button
            key={item.action}
            type="button"
            onClick={() => submit(item.action)}
            disabled={pending}
            className={`rounded-full bg-[var(--accent)] text-sm font-semibold text-[#08110f] transition hover:brightness-110 disabled:opacity-50 ${
              compact ? "px-4 py-2.5" : "px-5 py-3"
            }`}
          >
            {pending ? "Working..." : item.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
    </section>
  );
}
