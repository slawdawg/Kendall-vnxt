import type { RoutingPreviewView } from "@kendall/contracts";

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replaceAll(".", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function laneLabel(value: string): string {
  const labels: Record<string, string> = {
    utility: "Utility",
    local_readonly: "Local read-only",
    local_patch_draft: "Local patch draft",
    local_sandbox_execute: "Local sandbox",
    subscription_handoff: "Subscription handoff",
    subscription_agent: "Subscription agent",
    premium_approval: "Premium approval",
  };
  return labels[value] ?? titleCase(value);
}

function confidenceClass(value: string): string {
  if (value === "high") {
    return "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]";
  }
  if (value === "medium") {
    return "bg-[color-mix(in_srgb,var(--accent-2)_18%,transparent)] text-[var(--accent-2)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]";
}

function ReadableCode({ code }: { code: string }) {
  return (
    <span className="rounded-full border bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]" title={code}>
      {titleCase(code)}
    </span>
  );
}

export function RoutingPreviewPanel({ preview }: { preview: RoutingPreviewView }) {
  const { profile, decision } = preview;
  const executionAffected = !["record_only", "advisory"].includes(decision.authorityMode);

  return (
    <section id="routing-decision" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Routing</p>
          <h3 className="mt-2 text-xl font-semibold">Why This Route?</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{decision.humanExplanation}</p>
        </div>
        <div className="flex w-full flex-col gap-2 rounded-[1.25rem] border bg-[var(--surface)] p-4 sm:w-64">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Selected lane</p>
          <p className="text-lg font-semibold">{laneLabel(decision.selectedLane)}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-[var(--muted)]">{titleCase(decision.authorityMode)}</span>
            <span className={`rounded-full px-3 py-1 font-semibold uppercase tracking-[0.14em] ${confidenceClass(decision.confidenceBand)}`}>
              {decision.confidenceBand}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Task kind", titleCase(profile.taskKind)],
          ["Step", titleCase(profile.stepId)],
          ["Authority", titleCase(decision.authorityMode)],
          ["Execution affected", executionAffected ? "Yes" : "No"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Permission summary</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{decision.permissionSummary}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Reason codes</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {decision.reasonCodes.map((code) => (
              <ReadableCode key={code} code={code} />
            ))}
          </div>
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Escalation path</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {decision.escalationPath.length > 0 ? (
              decision.escalationPath.map((lane) => (
                <span key={lane} className="rounded-full border bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
                  {laneLabel(lane)}
                </span>
              ))
            ) : (
              <span className="text-sm text-[var(--muted)]">No escalation lane available under the current policy.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Rejected lanes</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {decision.rejectedLanes.map((rejected) => (
            <div key={rejected.lane} className="rounded-[1rem] border bg-[var(--panel)] p-3">
              <p className="text-sm font-semibold">{laneLabel(rejected.lane)}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{rejected.explanation}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {rejected.rejectionCodes.map((code) => (
                  <ReadableCode key={code} code={code} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}