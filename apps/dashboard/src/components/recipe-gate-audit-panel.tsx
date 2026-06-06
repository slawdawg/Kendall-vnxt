"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItemRecipeGateAuditView } from "@kendall/contracts";

import { useOperatorProfile } from "../lib/operator-profile";
import { executeManagedNextAction } from "../lib/supervisor";

function statusClass(status: string) {
  if (status === "passed") {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (status === "blocked") {
    return "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]";
  }
  return "bg-[var(--panel)] text-[var(--muted)]";
}

export function RecipeGateAuditPanel({ audit, workItemId }: { audit: WorkItemRecipeGateAuditView; workItemId: string }) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("The supervisor will refuse this action if the policy ledger changes.");
  const nextAction = audit.nextManagedAction;
  const canExecute = nextAction.status === "available" && nextAction.actionId !== "record_delivery_readiness";

  function executeNextAction() {
    startTransition(async () => {
      setMessage("Asking the supervisor to execute the managed next action...");
      try {
        await executeManagedNextAction(workItemId, {
          expectedActionId: nextAction.actionId,
          note: note.trim() || null,
          actorId: `${profile.actorId}:managed-action`,
          actorLabel: profile.actorLabel,
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The supervisor rejected the managed action.");
        return;
      }
      setMessage("Managed action completed. Refreshing the policy ledger...");
      setNote("");
      router.refresh();
    });
  }

  return (
    <section id="recipe-gate-audit" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Gate audit</p>
          <h3 className="mt-2 text-xl font-semibold">Supervisor policy ledger</h3>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusClass(audit.status)}`}>
          {audit.status}
        </span>
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Next managed action</p>
            <p className="mt-2 text-base font-semibold">{nextAction.label}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusClass(nextAction.status)}`}>
            {nextAction.status}
          </span>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">{nextAction.reason}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-full border px-3 py-1">Actor: {nextAction.allowedActor}</span>
          {nextAction.requiredGate ? <span className="rounded-full border px-3 py-1">Gate: {nextAction.requiredGate}</span> : null}
          {nextAction.operatorCheckpoint ? <span className="rounded-full border px-3 py-1">Checkpoint: {nextAction.operatorCheckpoint}</span> : null}
          <span className="rounded-full border px-3 py-1">Remote: {nextAction.remoteOperation ? "required" : "blocked"}</span>
        </div>
        {canExecute ? (
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Checkpoint note</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Operator checkpoint note for this managed action."
                className="min-h-20 rounded-2xl border bg-[var(--panel)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={executeNextAction}
              disabled={pending}
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#08110f] transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Working..." : "Run approved action"}
            </button>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Passed", audit.passedCount],
          ["Pending", audit.pendingCount],
          ["Blocked", audit.blockedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {audit.gates.map((gate) => (
          <div key={gate.gateId} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{gate.label}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Before {gate.requiredBefore}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusClass(gate.status)}`}>
                {gate.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">{gate.summary}</p>
            {gate.latestEventType ? <p className="mt-2 font-mono text-xs text-[var(--muted)]">{gate.latestEventType}</p> : null}
            {gate.reason ? <p className="mt-2 text-sm text-[var(--warn)]">{gate.reason}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
