"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { prepareRecipeBranch } from "../lib/supervisor";
import { useOperatorProfile } from "../lib/operator-profile";

export function BranchPreparationPanel({
  workItemId,
  executionBranch,
  baseBranch,
  baseRevision,
}: {
  workItemId: string;
  executionBranch?: string | null;
  baseBranch?: string | null;
  baseRevision?: string | null;
}) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("Prepare the recorded branch before supervisor implementation starts.");

  function submit() {
    startTransition(async () => {
      setMessage("Preparing the recipe branch...");
      try {
        const item = await prepareRecipeBranch(workItemId, {
          note: note.trim() || null,
          actorId: profile.actorId,
          actorLabel: profile.actorLabel,
        });
        setMessage(item.blockedReason ?? "Recipe branch preparation recorded.");
        setNote("");
        router.refresh();
      } catch {
        setMessage("The supervisor could not prepare the recipe branch.");
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Branch preparation</p>
        <h3 className="text-xl font-semibold">Prepare execution branch</h3>
        <p className="text-sm text-[var(--muted)]">
          The supervisor will only create or switch to the recorded recipe branch after clean-worktree and base-revision checks pass.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Execution branch</p>
          <p className="mt-2 break-words font-mono text-sm">{executionBranch ?? "Not recorded yet"}</p>
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Base branch</p>
          <p className="mt-2 break-words font-mono text-sm">{baseBranch ?? "Not recorded yet"}</p>
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Base revision</p>
          <p className="mt-2 break-words font-mono text-sm">{baseRevision ?? "Not recorded yet"}</p>
        </div>
      </div>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">Operator note</span>
        <textarea
          className="min-h-20 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional branch-preparation context for the audit trail."
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--muted)]">{message}</p>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#08110f] transition disabled:opacity-50"
        >
          {pending ? "Preparing..." : "Prepare branch"}
        </button>
      </div>
    </section>
  );
}
