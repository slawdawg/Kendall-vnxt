"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItemExecutionRecipeView } from "@kendall/contracts";

import { getSupervisorBaseUrl } from "../lib/supervisor";
import { useOperatorProfile } from "../lib/operator-profile";

const riskOptions = [
  { value: "low", label: "Low", hint: "Routine execution without external review." },
  { value: "medium", label: "Medium", hint: "Useful for supervised validation." },
  { value: "high", label: "High", hint: "Triggers required audit review." },
] as const;

type RiskLevelValue = (typeof riskOptions)[number]["value"];

const intakeTemplates = [
  {
    id: "operator-blank",
    name: "Start from scratch",
    summary: "Use a blank guided draft when the work does not fit a known pattern.",
    source: "operator-dashboard",
    riskLevel: "medium" as RiskLevelValue,
    titlePlaceholder: "Investigate failing export run",
    outcomePlaceholder: "Describe the result you want the supervisor to deliver.",
    detailsPlaceholder: "Optional context, constraints, links, or notes for the team.",
    outcomeStarter: "",
    detailsStarter: "",
  },
  {
    id: "operator-fix",
    name: "Fix a problem",
    summary: "Good for broken behavior, regressions, missing data, or incidents that need triage.",
    source: "operator-dashboard:issue",
    riskLevel: "medium" as RiskLevelValue,
    titlePlaceholder: "Fix the broken dashboard export",
    outcomePlaceholder: "Describe what should be working again when this is done.",
    detailsPlaceholder: "What is failing, who is affected, when it started, and any known clues.",
    outcomeStarter: "Restore the expected behavior so operators can complete the affected workflow again.",
    detailsStarter: "Observed problem:\nImpact:\nWhen it started:\nKnown clues or logs:\n",
  },
  {
    id: "operator-change",
    name: "Ship an improvement",
    summary: "Use this for UI, workflow, copy, or automation improvements that are not break/fix work.",
    source: "operator-dashboard:improvement",
    riskLevel: "medium" as RiskLevelValue,
    titlePlaceholder: "Improve the attention queue filters",
    outcomePlaceholder: "Describe the improved operator or customer experience you want delivered.",
    detailsPlaceholder: "What should change, who it helps, and any must-keep behavior.",
    outcomeStarter: "Deliver the requested improvement with a clean operator experience and preserve current working behavior.",
    detailsStarter: "Requested change:\nWho it helps:\nMust keep:\nSuccess signs:\n",
  },
  {
    id: "operator-audit",
    name: "Review risky work",
    summary: "Use this when the work needs stronger oversight, extra verification, or clear audit visibility.",
    source: "operator-dashboard:audit",
    riskLevel: "high" as RiskLevelValue,
    titlePlaceholder: "Audit the release readiness of the workflow change",
    outcomePlaceholder: "Describe the risk decision or validation outcome you need.",
    detailsPlaceholder: "What makes this risky, what evidence matters, and what cannot be missed.",
    outcomeStarter: "Produce a clear risk decision with enough evidence for operators to act confidently.",
    detailsStarter: "Risk concerns:\nEvidence to review:\nBlocking questions:\nDecision needed:\n",
  },
  {
    id: "operator-test-coverage",
    name: "Expand dashboard coverage",
    summary: "Use the supervisor-managed recipe for narrow dashboard browser coverage and verification work.",
    source: "operator-dashboard:improvement",
    riskLevel: "medium" as RiskLevelValue,
    executionRecipeId: "dashboard-test-coverage",
    titlePlaceholder: "Cover the assignment flow with Playwright",
    outcomePlaceholder: "Describe the dashboard workflow that needs browser coverage or a focused test update.",
    detailsPlaceholder: "Capture the target flow, expected evidence, and any scope limits for the recipe.",
    outcomeStarter: "Expand focused dashboard coverage for the named workflow and leave the repo green after browser and shared checks.",
    detailsStarter: "Target flow:\nExpected evidence:\nScope limits:\n",
  },
  {
    id: "operator-mobile-coverage",
    name: "Harden mobile dashboard",
    summary: "Use the supervisor-managed recipe for mobile dashboard coverage and verification work.",
    source: "operator-dashboard:improvement",
    riskLevel: "medium" as RiskLevelValue,
    executionRecipeId: "dashboard-mobile-coverage",
    titlePlaceholder: "Cover mobile intake with Playwright",
    outcomePlaceholder: "Describe the mobile dashboard workflow that needs browser coverage or a focused test update.",
    detailsPlaceholder: "Capture the target mobile flow, expected evidence, and any scope limits for the recipe.",
    outcomeStarter: "Expand focused mobile dashboard coverage for the named workflow and leave the repo green after browser and shared checks.",
    detailsStarter: "Target mobile flow:\nExpected evidence:\nScope limits:\n",
  },
] as const;

type IntakeTemplate = (typeof intakeTemplates)[number];

const storageKey = "kendall-dashboard-intake-draft";
const refreshPauseStorageKey = "kendall-dashboard-realtime-refresh-paused-until";
const defaultForm = {
  templateId: "operator-blank" as IntakeTemplate["id"],
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
      templateId:
        typeof parsed.templateId === "string" &&
        intakeTemplates.some((template) => template.id === parsed.templateId)
          ? (parsed.templateId as IntakeTemplate["id"])
          : defaultForm.templateId,
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
    form.templateId === defaultForm.templateId &&
    form.riskLevel === defaultForm.riskLevel
  );
}

function recipeIdForTemplate(template: IntakeTemplate): string | null {
  return "executionRecipeId" in template ? template.executionRecipeId : null;
}

function pauseRealtimeRefresh() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(refreshPauseStorageKey, String(Date.now() + 10_000));
  } catch {
    // If storage is unavailable, the form still works; it just cannot pause live refresh.
  }
}

export function CreateWorkItemForm({ executionRecipes }: { executionRecipes: WorkItemExecutionRecipeView[] }) {
  const router = useRouter();
  const { profile } = useOperatorProfile();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("Pick a work type and describe the outcome you need.");
  const [form, setForm] = useState(defaultForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const skipInitialPersist = useRef(true);
  const selectedTemplate = intakeTemplates.find((template) => template.id === form.templateId) ?? intakeTemplates[0];
  const recipeById = new Map(executionRecipes.map((recipe) => [recipe.id, recipe]));
  const selectedRecipe = recipeById.get(recipeIdForTemplate(selectedTemplate) ?? "");

  useEffect(() => {
    // Hydrate the client-only draft after mount so refresh restores work in progress.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(readStoredDraft());
    setHydrated(true);
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
    pauseRealtimeRefresh();
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function applyTemplate(template: IntakeTemplate) {
    pauseRealtimeRefresh();
    setForm((current) => {
      const next = {
        ...current,
        templateId: template.id,
        source: current.source === defaultForm.source || current.templateId !== template.id ? template.source : current.source,
        riskLevel: current.riskLevel === defaultForm.riskLevel || current.templateId !== template.id ? template.riskLevel : current.riskLevel,
        requestedOutcome:
          !current.requestedOutcome.trim() || current.templateId !== template.id
            ? template.outcomeStarter
            : current.requestedOutcome,
        details:
          !current.details.trim() || current.templateId !== template.id ? template.detailsStarter : current.details,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
    setMessage(`Template selected: ${template.name}. Fill in the blanks and launch the work.`);
  }

  function submit() {
    startTransition(async () => {
      pauseRealtimeRefresh();
      setMessage("Starting the next work item...");
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
              intakeTemplateId: form.templateId,
              intakeTemplateLabel: selectedTemplate.name,
              executionRecipeId: recipeIdForTemplate(selectedTemplate),
              submittedByActorId: profile.actorId,
              submittedByActorLabel: profile.actorLabel,
            },
          }),
        });

        if (!response.ok) {
          setMessage("The supervisor rejected this draft. Check the required fields and try again.");
          return;
        }

        const payload = (await response.json()) as { data: { id: string; title: string } };
        setForm(defaultForm);
        window.localStorage.removeItem(storageKey);
        setShowAdvanced(false);
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
    <section
      className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm"
      onFocusCapture={pauseRealtimeRefresh}
      onPointerDownCapture={pauseRealtimeRefresh}
    >
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Intake</p>
        <h2 className="text-2xl font-semibold">Start next work</h2>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Choose the kind of help you need, describe the result in plain language, and hand it directly to the supervisor queue.
        </p>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium">1. Choose the kind of work</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {intakeTemplates.map((template) => {
            const selected = form.templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                disabled={!hydrated}
                onClick={() => applyTemplate(template)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selected ? "border-[var(--accent)] bg-[var(--surface-strong)]" : "bg-[var(--panel)]"
                } disabled:cursor-wait disabled:opacity-60`}
              >
                <p className="text-sm font-semibold">{template.name}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{template.summary}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">2. Name the work</span>
          <input
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder={selectedTemplate.titlePlaceholder}
          />
        </label>
        <div className="rounded-2xl border bg-[var(--surface)] p-4">
          <p className="text-sm font-medium">Suggested handling</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-full bg-[var(--panel)] px-3 py-1">Template: {selectedTemplate.name}</span>
            <span className="rounded-full bg-[var(--panel)] px-3 py-1">Source: {form.source}</span>
            <span className="rounded-full bg-[var(--panel)] px-3 py-1">Risk: {form.riskLevel}</span>
            {selectedRecipe ? (
              <span className="rounded-full bg-[var(--panel)] px-3 py-1">Recipe: {selectedRecipe.label}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="mt-4 rounded-full border bg-[var(--panel)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {showAdvanced ? "Hide advanced fields" : "Adjust advanced fields"}
          </button>
        </div>
      </div>

      {selectedRecipe ? (
        <div className="mt-4 rounded-2xl border bg-[var(--surface)] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{selectedRecipe.label}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{selectedRecipe.summary}</p>
            </div>
            <span className="w-fit rounded-full bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
              {selectedRecipe.remoteAutomationPolicy.status}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] lg:grid-cols-3">
            <p className="rounded-xl bg-[var(--panel)] px-3 py-2">Branch: {selectedRecipe.branchPrefix}*</p>
            <p className="rounded-xl bg-[var(--panel)] px-3 py-2">
              Gates: {selectedRecipe.policyGates.map((gate) => gate.label).join(", ")}
            </p>
            <p className="rounded-xl bg-[var(--panel)] px-3 py-2">
              Checks: {selectedRecipe.verificationCommands.join(" + ")}
            </p>
          </div>
        </div>
      ) : null}

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">3. Describe the result you need</span>
        <textarea
          className="min-h-28 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          value={form.requestedOutcome}
          onChange={(event) => updateField("requestedOutcome", event.target.value)}
          placeholder={selectedTemplate.outcomePlaceholder}
        />
      </label>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">Helpful context</span>
        <textarea
          className="min-h-24 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          value={form.details}
          onChange={(event) => updateField("details", event.target.value)}
          placeholder={selectedTemplate.detailsPlaceholder}
        />
      </label>

      {showAdvanced ? (
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium">Source</span>
          <input
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            value={form.source}
            onChange={(event) => updateField("source", event.target.value)}
            placeholder="operator-dashboard"
          />
        </label>
      ) : null}

      <div className="mt-6">
        <p className="text-sm font-medium">Risk level</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {riskOptions.map((option) => {
            const selected = form.riskLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={!hydrated}
                onClick={() => updateField("riskLevel", option.value)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selected ? "border-[var(--accent)] bg-[var(--surface-strong)]" : "bg-[var(--panel)]"
                } disabled:cursor-wait disabled:opacity-60`}
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
          {pending ? "Starting..." : "Start work"}
        </button>
      </div>
    </section>
  );
}
