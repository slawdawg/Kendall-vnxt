"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { getSupervisorBaseUrl } from "../lib/supervisor";
import { useOperatorProfile } from "../lib/operator-profile";

const riskOptions = [
  { value: "low", label: "Low", hint: "Routine execution without external review." },
  { value: "medium", label: "Medium", hint: "Useful for supervised validation." },
  { value: "high", label: "High", hint: "Triggers required audit review." },
] as const;

type RiskLevelValue = (typeof riskOptions)[number]["value"];

const storageKey = "kendall-dashboard-intake-draft";
const defaultForm = {
  title: "",
  requestedOutcome: "",
  source: "operator-dashboard",
  details: "",
  riskLevel: "medium" as RiskLevelValue,
};

function readStoredDraft(): typeof defaultForm {
  if (typeof window === "undefined") {
    return defaultForm;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultForm;
    }

    const parsed = JSON.parse(raw) as Partial<typeof defaultForm>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : defaultForm.title,
      requestedOutcome:
        typeof parsed.requestedOutcome === "string" ? parsed.requestedOutcome : defaultForm.requestedOutcome,
      source: typeof parsed.source === "string" && parsed.source.trim() ? parsed.source : defaultForm.source,
      details: typeof parsed.details === "string" ? parsed.details : defaultForm.details,
      riskLevel:
        parsed.riskLevel === "low" || parsed.riskLevel === "medium" || parsed.riskLevel === "high"
          ? parsed.riskLevel
          : defaultForm.riskLevel,
    };
  } catch {
    return defaultForm;
  }
}

function isDefaultDraft(form: typeof defaultForm): boolean {
  return (
    form.title === defaultForm.title &&
    form.requestedOutcome === defaultForm.requestedOutcome &&
    form.source === defaultForm.source &&
    form.details === defaultForm.details &&
    form.riskLevel === defaultForm.riskLevel
  );
}

export function CreateWorkItemForm() {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("Ready to accept a new work item.");
  const [form, setForm] = useState(defaultForm);
  const skipInitialPersist = useRef(true);

  useEffect(() => {
    // Hydrate the client-only draft after mount so refresh restores work in progress.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(readStoredDraft());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (skipInitialPersist.current) {
      skipInitialPersist.current = false;
      return;
    }

    if (isDefaultDraft(form)) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(form));
  }, [form]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      setMessage("Submitting work item...");
      try {
        const response = await fetch(`${getSupervisorBaseUrl()}/work-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            requestedOutcome: form.requestedOutcome.trim(),
            source: form.source.trim(),
            details: form.details.trim() || null,
            riskLevel: form.riskLevel,
            metadata: {
              submittedByActorId: profile.actorId,
              submittedByActorLabel: profile.actorLabel,
            },
          }),
        });

        if (!response.ok) {
          setMessage("The supervisor rejected the work item. Check the required fields and try again.");
          return;
        }

        const payload = (await response.json()) as { data: { id: string; title: string } };
        setForm(defaultForm);
        window.localStorage.removeItem(storageKey);
        setMessage(`Created "${payload.data.title}" as ${profile.actorLabel}. Opening the work item detail view now.`);
        router.refresh();
        router.push(`/work-items/${payload.data.id}`);
      } catch {
        setMessage("Unable to reach the supervisor API right now.");
      }
    });
  }

  const isDisabled =
    pending ||
    !form.title.trim() ||
    !form.requestedOutcome.trim() ||
    !form.source.trim();

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Intake</p>
        <h2 className="text-2xl font-semibold">Create a work item</h2>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Capture the outcome, set the risk posture, and hand it directly to the supervisor queue.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Title</span>
          <input
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="Investigate failing export run"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Source</span>
          <input
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            value={form.source}
            onChange={(event) => updateField("source", event.target.value)}
            placeholder="operator-dashboard"
          />
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">Requested outcome</span>
        <textarea
          className="min-h-28 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          value={form.requestedOutcome}
          onChange={(event) => updateField("requestedOutcome", event.target.value)}
          placeholder="Describe the concrete result the supervisor should drive toward."
        />
      </label>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">Details</span>
        <textarea
          className="min-h-24 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          value={form.details}
          onChange={(event) => updateField("details", event.target.value)}
          placeholder="Optional notes, constraints, references, or operator context."
        />
      </label>

      <div className="mt-6">
        <p className="text-sm font-medium">Risk level</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {riskOptions.map((option) => {
            const selected = form.riskLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateField("riskLevel", option.value)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selected ? "border-[var(--accent)] bg-[var(--surface-strong)]" : "bg-[var(--panel)]"
                }`}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{option.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--muted)]">{message}</p>
        <button
          type="button"
          onClick={submit}
          disabled={isDisabled}
          className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Submitting..." : "Create work item"}
        </button>
      </div>
    </section>
  );
}
