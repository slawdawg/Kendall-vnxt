import type {
  TrustedAutonomyDeauthorizationTriggerView,
  TrustedAutonomyReadinessGateView,
  TrustedAutonomyReadinessReportView,
} from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function GateCard({ gate }: { gate: TrustedAutonomyReadinessGateView }) {
  const required = gate.status === "required";
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{gate.gateId}</p>
          <h5 className="mt-1 text-sm font-semibold">{gate.label}</h5>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 font-mono text-[11px] ${required ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]"}`}>
          {gate.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{gate.summary}</p>
      <div className="mt-3 space-y-2">
        {gate.evidence.map((evidence, evidenceIndex) => (
          <p
            key={`${gate.gateId}:evidence:${evidence}:${evidenceIndex}`}
            className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
          >
            {evidence}
          </p>
        ))}
      </div>
    </article>
  );
}

function ListPanel({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
      <h4 className="text-base font-semibold">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <p key={`${title}:${item}:${index}`} className={`rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 ${warn ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function TriggerCard({ trigger }: { trigger: TrustedAutonomyDeauthorizationTriggerView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--warn)]">{trigger.triggerId}</p>
          <h4 className="mt-1 text-base font-semibold">{trigger.label}</h4>
        </div>
        <span className="w-fit max-w-full break-words rounded-full bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] px-3 py-1 font-mono text-[11px] text-[var(--warn)]">
          {trigger.status}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{trigger.summary}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <h5 className="text-sm font-semibold">Deauthorized operations</h5>
          <div className="mt-2 space-y-2">
            {trigger.deauthorizedOperations.map((operation, index) => (
              <p key={`${trigger.triggerId}:operation:${operation}:${index}`} className="text-xs leading-5 text-[var(--warn)]">
                {operation}
              </p>
            ))}
          </div>
        </div>
        <div>
          <h5 className="text-sm font-semibold">Recovery evidence</h5>
          <div className="mt-2 space-y-2">
            {trigger.recoveryEvidence.map((evidence, index) => (
              <p key={`${trigger.triggerId}:recovery:${evidence}:${index}`} className="text-xs leading-5 text-[var(--muted)]">
                {evidence}
              </p>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function TrustedAutonomyReadinessReportPanel({ report }: { report: TrustedAutonomyReadinessReportView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Trusted autonomy</p>
          <h3 className="mt-2 text-xl font-semibold">Autonomy readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Low-risk", report.lowRiskAutonomyApproved ? "approved" : "blocked"],
          ["Providers", report.autonomousProviderUseApproved ? "approved" : "blocked"],
          ["GitHub", report.autonomousGitHubDeliveryApproved ? "approved" : "blocked"],
          ["Cleanup", report.autonomousCleanupApproved ? "approved" : "blocked"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {report.autonomyGates.map((gate) => (
          <GateCard key={gate.gateId} gate={gate} />
        ))}
      </div>

      <div className="mt-5 grid gap-4">
        {report.deauthorizationTriggers.map((trigger) => (
          <TriggerCard key={trigger.triggerId} trigger={trigger} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ListPanel title="Eligible work" items={report.eligibleWork} />
        <ListPanel title="Blocked work" items={report.blockedWork} warn />
        <ListPanel title="Required evidence" items={report.requiredEvidence} />
        <ListPanel title="Stop conditions" items={report.stopConditions} warn />
        <ListPanel title="Next safe actions" items={report.nextSafeActions} />
      </div>
    </section>
  );
}
