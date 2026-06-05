"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useOperatorProfile } from "../lib/operator-profile";
import { getSupervisorBaseUrl } from "../lib/supervisor";

export function EscalationPanel({
  workItemId,
  attentionReason,
  escalatedAt,
  escalationReason,
  escalatedByLabel,
}: {
  workItemId: string;
  attentionReason?: string | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  escalatedByLabel?: string | null;
}) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState(escalationReason ?? "");
  const [message, setMessage] = useState(
    escalatedAt
      ? `Escalated${escalatedByLabel ? ` by ${escalatedByLabel}` : ""}.`
      : attentionReason ?? "Escalation is clear.",
  );

  function submit(clear: boolean) {
    startTransition(async () => {
      try {
        const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/escalation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: clear ? null : reason.trim() || "Operator marked this item for attention.",
            clear,
            actorId: profile.actorId,
            actorLabel: profile.actorLabel,
          }),
        });
        if (!response.ok) {
          setMessage("Unable to update escalation right now.");
          return;
        }
        setMessage(clear ? "Escalation cleared." : "Escalation recorded.");
        if (clear) {
          setReason("");
        }
        router.refresh();
      } catch {
        setMessage("Unable to update escalation right now.");
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Escalation</p>
        <h3 className="text-xl font-semibold">Attention and escalation</h3>
      </div>
      {attentionReason ? (
        <div className="mt-4 rounded-[1.25rem] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-4 text-sm text-[var(--warn)]">
          {attentionReason}
        </div>
      ) : null}
      <label className="mt-4 flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Escalation note</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain why this item needs follow-up."
          className="min-h-24 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
        Acting as {profile.actorLabel} ({profile.actorId})
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pending}
          className="rounded-full bg-[var(--warn)] px-5 py-3 text-sm font-semibold text-[#120805] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Working..." : escalatedAt ? "Update escalation" : "Escalate item"}
        </button>
        {escalatedAt ? (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending}
            className="rounded-full border bg-[var(--surface)] px-5 py-3 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            Clear escalation
          </button>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
    </section>
  );
}
