import type {
  ReviewResourcePolicyReportView,
  ReviewResourcePolicyRouteView,
  ReviewResourcePolicyTriggerView,
} from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function TriggerCard({ trigger }: { trigger: ReviewResourcePolicyTriggerView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{trigger.triggerId}</p>
      <h5 className="mt-1 text-sm font-semibold">{trigger.label}</h5>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{trigger.summary}</p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Routes</p>
      <p className="mt-1 break-words font-mono text-xs text-[var(--muted)]">{trigger.recommendedRoutes.join(", ")}</p>
    </article>
  );
}

function RouteCard({ route }: { route: ReviewResourcePolicyRouteView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{route.routeId}</p>
          <h5 className="mt-1 text-sm font-semibold">{route.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {route.authorityFamily}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{route.summary}</p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Metadata retained</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{route.retainedEvidence.join(", ")}</p>
    </article>
  );
}

export function ReviewResourcePolicyReportPanel({ report }: { report: ReviewResourcePolicyReportView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Review resource policy</p>
          <h3 className="mt-2 text-xl font-semibold">Policy triggers</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["processLaunchApproved", "Launch", report.processLaunchApproved ? "approved" : "blocked"],
          ["sourceMutationApproved", "Source edits", report.sourceMutationApproved ? "approved" : "blocked"],
          ["githubMutationApproved", "GitHub", report.githubMutationApproved ? "approved" : "blocked"],
          ["rawProviderPayloadsRetained", "Raw payloads", report.rawProviderPayloadsRetained ? "retained" : "not retained"],
          ["rawReasoningRetained", "Raw reasoning", report.rawReasoningRetained ? "retained" : "not retained"],
        ].map(([field, label, value]) => (
          <div key={field} data-testid={`review-resource-policy-${field}`} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Policy triggers</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.triggers.map((trigger) => (
              <TriggerCard key={trigger.triggerId} trigger={trigger} />
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Review routes</h4>
          <div className="mt-3 grid gap-3">
            {report.routes.map((route) => (
              <RouteCard key={route.routeId} route={route} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Packet evaluations</h4>
          <div className="mt-3 space-y-3">
            {report.packetEvaluations.map((evaluation) => (
              <article key={evaluation.packetId} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{evaluation.packetKind}</p>
                    <h5 className="mt-1 text-sm font-semibold">{evaluation.packetId}</h5>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {evaluation.readOnly ? "read-only" : "mutation-risk"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{evaluation.decisionBasis}</p>
                <p className="mt-2 break-words font-mono text-xs text-[var(--muted)]">{evaluation.triggerIds.join(", ")}</p>
                <p className="mt-2 break-words font-mono text-xs text-[var(--muted)]">{evaluation.selectedRoutes.join(", ")}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Claude read-only command</h4>
          <div className="mt-3 space-y-2">
            {report.claudeReadOnlyCommand.map((part) => (
              <p key={part} className="rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                {part}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Scenario outcomes</h4>
          <div className="mt-3 space-y-3">
            {report.scenarios.map((scenario) => (
              <article key={scenario.scenarioId} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                <h5 className="text-sm font-semibold">{scenario.label}</h5>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{scenario.policyBasis}</p>
                <p className="mt-2 break-words font-mono text-xs text-[var(--muted)]">{scenario.selectedRoutes.join(", ") || "none"}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Stop lines</h4>
          <div className="mt-3 space-y-2">
            {report.stopLines.map((line) => (
              <p key={line} className="rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Next safe actions</h4>
          <div className="mt-3 space-y-2">
            {report.nextSafeActions.map((action) => (
              <p key={action} className="rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {action}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
