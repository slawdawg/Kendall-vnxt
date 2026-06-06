"use client";

import type { WorkItemDeliveryReadinessView } from "@kendall/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useOperatorProfile } from "../lib/operator-profile";
import { getSupervisorBaseUrl } from "../lib/supervisor";

const prStatuses = ["not_recorded", "recorded", "ready", "waived"];
const ciStatuses = ["not_recorded", "pending", "passed", "failed", "waived"];
const mergeStatuses = ["not_recorded", "ready", "merged", "blocked", "waived"];

function labelFor(value: string) {
  return value.replaceAll("_", " ");
}

export function DeliveryReadinessPanel({
  workItemId,
  deliveryReadiness,
}: {
  workItemId: string;
  deliveryReadiness: WorkItemDeliveryReadinessView;
}) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [pullRequestStatus, setPullRequestStatus] = useState(deliveryReadiness.pullRequestStatus);
  const [pullRequestUrl, setPullRequestUrl] = useState(deliveryReadiness.pullRequestUrl ?? "");
  const [ciStatus, setCiStatus] = useState(deliveryReadiness.ciStatus);
  const [mergeStatus, setMergeStatus] = useState(deliveryReadiness.mergeStatus);
  const [deliveryWaived, setDeliveryWaived] = useState(deliveryReadiness.deliveryWaived);
  const [deliveryWaiverReason, setDeliveryWaiverReason] = useState(deliveryReadiness.deliveryWaiverReason ?? "");
  const [message, setMessage] = useState(
    deliveryReadiness.readyForApproval ? "Delivery gate is ready for approval." : "Delivery gate needs evidence or waiver.",
  );

  function submit() {
    startTransition(async () => {
      try {
        const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/delivery-readiness`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pullRequestStatus,
            pullRequestUrl: pullRequestUrl.trim() || null,
            ciStatus,
            mergeStatus,
            deliveryWaived,
            deliveryWaiverReason: deliveryWaiverReason.trim() || null,
            note: "Operator updated managed recipe delivery readiness.",
            actorId: profile.actorId,
            actorLabel: profile.actorLabel,
          }),
        });
        if (!response.ok) {
          setMessage("Unable to update delivery readiness.");
          return;
        }
        setMessage("Delivery readiness updated.");
        router.refresh();
      } catch {
        setMessage("Unable to update delivery readiness.");
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Delivery gate</p>
        <h3 className="text-xl font-semibold">Review readiness</h3>
        <p className="text-sm text-[var(--muted)]">{deliveryReadiness.remoteOperationsPolicy}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ["PR", deliveryReadiness.pullRequestStatus],
          ["CI", deliveryReadiness.ciStatus],
          ["Merge", deliveryReadiness.mergeStatus],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-base font-semibold capitalize">{labelFor(value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">PR status</span>
          <select value={pullRequestStatus} onChange={(event) => setPullRequestStatus(event.target.value)} className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none">
            {prStatuses.map((status) => (
              <option key={status} value={status}>{labelFor(status)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">CI status</span>
          <select value={ciStatus} onChange={(event) => setCiStatus(event.target.value)} className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none">
            {ciStatuses.map((status) => (
              <option key={status} value={status}>{labelFor(status)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Merge status</span>
          <select value={mergeStatus} onChange={(event) => setMergeStatus(event.target.value)} className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none">
            {mergeStatuses.map((status) => (
              <option key={status} value={status}>{labelFor(status)}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">PR URL</span>
        <input
          value={pullRequestUrl}
          onChange={(event) => setPullRequestUrl(event.target.value)}
          placeholder="https://github.com/..."
          className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <label className="mt-4 flex items-start gap-3 text-sm text-[var(--muted)]">
        <input type="checkbox" checked={deliveryWaived} onChange={(event) => setDeliveryWaived(event.target.checked)} className="mt-1 size-4" />
        <span>Use an explicit operator waiver for local-only delivery.</span>
      </label>
      {deliveryWaived ? (
        <label className="mt-3 flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Waiver reason</span>
          <textarea
            value={deliveryWaiverReason}
            onChange={(event) => setDeliveryWaiverReason(event.target.value)}
            className="min-h-24 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#08110f] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Working..." : "Record readiness"}
        </button>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${deliveryReadiness.readyForApproval ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]" : "bg-[var(--surface)] text-[var(--muted)]"}`}>
          {deliveryReadiness.readyForApproval ? "Ready for approval" : "Needs evidence"}
        </span>
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
    </section>
  );
}
