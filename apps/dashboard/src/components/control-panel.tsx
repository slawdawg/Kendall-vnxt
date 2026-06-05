"use client";

import { useState, useTransition } from "react";

import { getSupervisorBaseUrl } from "../lib/supervisor";

const actions = [
  { mode: "enable", label: "Enable", tone: "bg-[var(--accent)] text-white" },
  { mode: "pause", label: "Pause", tone: "bg-[var(--surface)] text-[var(--foreground)] border border-[var(--line)]" },
  { mode: "drain", label: "Drain", tone: "bg-[var(--accent-2)] text-white" },
  { mode: "disable", label: "Disable", tone: "bg-[var(--warn)] text-white" },
] as const;

export function ControlPanel() {
  const [message, setMessage] = useState("No control action submitted yet.");
  const [pending, startTransition] = useTransition();

  function submit(mode: string) {
    startTransition(async () => {
      const response = await fetch(`${getSupervisorBaseUrl()}/supervisor/${mode}`, { method: "POST" });
      if (!response.ok) {
        setMessage(`Unable to ${mode} the supervisor.`);
        return;
      }
      setMessage(`Supervisor command accepted: ${mode}. Refresh status panels to confirm latest state.`);
    });
  }

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        {actions.map((action) => (
          <button
            key={action.mode}
            type="button"
            className={`rounded-full px-5 py-3 text-sm font-semibold ${action.tone} disabled:opacity-50`}
            onClick={() => submit(action.mode)}
            disabled={pending}
          >
            {pending ? "Working..." : action.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
    </section>
  );
}
