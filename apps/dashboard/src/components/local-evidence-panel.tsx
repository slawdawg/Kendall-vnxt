"use client";

import { useState } from "react";
import type { LocalEvidenceExplanationView } from "@kendall/contracts";
import { createLocalEvidenceExplanation } from "../lib/supervisor";

function providerStatus(explanation: LocalEvidenceExplanationView) {
  const attempt = explanation.providerAttempt;
  if (!attempt) {
    return {
      label: "Local model off",
      detail: "No model call was made. This check used existing work evidence only.",
    };
  }

  return {
    label: `${attempt.modelId} ${attempt.status}`,
    detail: `${attempt.endpointFamily}. ${attempt.rawPayloadRetained ? "Raw payload retained" : "Raw payload not stored"}.`,
  };
}

function BoundaryBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active
          ? "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]"
          : "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]"
      }`}
    >
      {label} {active ? "on" : "off"}
    </span>
  );
}

export function LocalEvidencePanel({ workItemId }: { workItemId: string }) {
  const [explanation, setExplanation] = useState<LocalEvidenceExplanationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function runLocalCheck() {
    setIsRunning(true);
    setError(null);
    try {
      const result = await createLocalEvidenceExplanation(workItemId, {
        stepId: "evidence_review",
        taskKind: "evidence_summary",
        recordEvent: true,
      });
      setExplanation(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to run the local check.");
    } finally {
      setIsRunning(false);
    }
  }

  const provider = explanation ? providerStatus(explanation) : null;

  return (
    <section id="local-check" className="scroll-mt-28 rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Local check</p>
          <h3 className="mt-2 text-xl font-semibold">Ask the local lane to explain this work</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Creates a safe evidence summary for this item. It cannot change files, run commands, push branches, or start external workers.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <BoundaryBadge label="Changes" active={Boolean(explanation?.writesAllowed)} />
            <BoundaryBadge label="Commands" active={Boolean(explanation?.commandsAllowed)} />
            <span className="rounded-full border bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">Evidence only</span>
          </div>
        </div>
        <button
          type="button"
          onClick={runLocalCheck}
          disabled={isRunning}
          className="w-full rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#08110f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
        >
          {isRunning ? "Checking..." : "Run local check"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-[0.5rem] border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-4 text-sm leading-6 text-[var(--warn)]">
          {error}
        </div>
      ) : null}

      {explanation ? (
        <div className="mt-5 grid gap-4">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Result</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{explanation.summary}</p>
              </div>
              <span className="w-fit rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                Local read-only
              </span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Model use</p>
              {provider ? (
                <>
                  <p className="mt-2 text-sm font-semibold">{provider.label}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{provider.detail}</p>
                  {explanation.providerAttempt ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span className="rounded-full bg-[var(--panel)] px-3 py-1">Prompt {explanation.providerAttempt.promptCharacterCount} chars</span>
                      <span className="rounded-full bg-[var(--panel)] px-3 py-1">Reply {explanation.providerAttempt.responseCharacterCount} chars</span>
                      <span className="rounded-full bg-[var(--panel)] px-3 py-1">Timeout {explanation.providerAttempt.timeoutState}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Next safe moves</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {explanation.nextStepSuggestions.map((suggestion) => (
                  <span key={suggestion} className="rounded-full border bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
                    {suggestion}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Recent evidence</p>
            <div className="mt-3 grid gap-3">
              {explanation.evidence.length > 0 ? (
                explanation.evidence.map((item) => (
                  <div key={`${item.eventType}-${item.createdAt}`} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                    <p className="text-sm font-semibold">{item.summary}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.eventType}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No workflow events have been recorded yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Safety boundaries</p>
            <div className="mt-3 grid gap-2">
              {explanation.boundaries.map((boundary) => (
                <p key={boundary} className="text-xs leading-5 text-[var(--muted)]">
                  {boundary}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
