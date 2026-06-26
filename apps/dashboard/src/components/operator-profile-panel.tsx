"use client";

import { useState } from "react";
import { useOperatorProfile } from "../lib/operator-profile";

export function OperatorProfilePanel() {
  const { profile, summary, setProfile, resetProfile } = useOperatorProfile();
  const [message, setMessage] = useState(`Current operator: ${summary}`);

  function updateField(field: "actorId" | "actorLabel", value: string) {
    setProfile({ ...profile, [field]: value });
    setMessage("Operator identity updated for new work and workflow actions.");
  }

  function reset() {
    resetProfile();
    setMessage("Operator identity reset to the default local profile.");
  }

  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Operator identity</p>
        <h3 className="text-xl font-semibold">Attribution profile</h3>
        <p className="text-sm text-[var(--muted)]">
          New work items and workflow decisions will use this identity in event history and live telemetry.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Display name</span>
          <input
            value={profile.actorLabel}
            onChange={(event) => updateField("actorLabel", event.target.value)}
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            placeholder="Primary operator"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Actor ID</span>
          <input
            value={profile.actorId}
            onChange={(event) => updateField("actorId", event.target.value)}
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            placeholder="operator-1"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--muted)]">{message}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Reset profile
        </button>
      </div>
    </section>
  );
}
