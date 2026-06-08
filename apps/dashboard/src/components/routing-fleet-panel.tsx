import type { RoutingLaneEvidenceProfileView, WorkerRegistryEntryView } from "@kendall/contracts";

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

function healthClass(health: string): string {
  if (health === "online") {
    return "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]";
}

function laneTotal(profile: RoutingLaneEvidenceProfileView): number {
  return (
    profile.previewCount +
    profile.guardedExecutionCount +
    profile.handoffPackageCount +
    profile.premiumApprovalRequestCount +
    profile.localExplanationCount +
    profile.outcomeCount
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function RoutingFleetPanel({
  workers,
  laneProfiles,
}: {
  workers: WorkerRegistryEntryView[];
  laneProfiles: RoutingLaneEvidenceProfileView[];
}) {
  const onlineWorkers = workers.filter((worker) => worker.health === "online").length;
  const disabledWorkers = workers.filter((worker) => worker.health === "disabled").length;
  const totalDecisions = laneProfiles.reduce((sum, profile) => sum + profile.decisionCount, 0);
  const premiumRequests = laneProfiles.reduce((sum, profile) => sum + profile.premiumApprovalRequestCount, 0);

  return (
    <section id="routing-fleet" className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Routing</p>
          <h2 className="mt-2 text-xl font-semibold">Routing Fleet</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border bg-[var(--surface)] px-3 py-1 text-[var(--muted)]">Read only</span>
          <span className="rounded-full border bg-[var(--surface)] px-3 py-1 text-[var(--muted)]">No launches</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Workers online" value={String(onlineWorkers)} />
        <Stat label="Workers disabled" value={String(disabledWorkers)} />
        <Stat label="Route decisions" value={String(totalDecisions)} />
        <Stat label="Premium requests" value={String(premiumRequests)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-[1.25rem] border bg-[var(--surface)]">
          <div className="border-b px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Worker registry</p>
          </div>
          <div className="divide-y">
            {workers.map((worker) => (
              <div key={worker.workerId} className="grid gap-3 px-4 py-4 md:grid-cols-[1.1fr_0.8fr_0.8fr] md:items-start">
                <div>
                  <p className="text-sm font-semibold">{worker.displayName}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">{worker.workerId}</p>
                  {worker.disabledReason ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{titleCase(worker.disabledReason)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-3 py-1 font-semibold uppercase tracking-[0.14em] ${healthClass(worker.health)}`}>
                    {worker.health}
                  </span>
                  <span className="rounded-full border bg-[var(--panel)] px-3 py-1 text-[var(--muted)]">{titleCase(worker.lane)}</span>
                </div>
                <div className="text-xs leading-5 text-[var(--muted)]">
                  <p>{titleCase(worker.adapterType)}</p>
                  <p>
                    Queue {worker.queueDepth}/{worker.maxParallelJobs}
                  </p>
                  <p className="mt-1">{worker.capabilities.slice(0, 3).map(titleCase).join(", ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.25rem] border bg-[var(--surface)]">
          <div className="border-b px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Lane evidence</p>
          </div>
          <div className="divide-y">
            {laneProfiles.length > 0 ? (
              laneProfiles.map((profile) => (
                <div key={profile.lane} className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{titleCase(profile.lane)}</p>
                    <span className="rounded-full border bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
                      {laneTotal(profile)} signals
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
                    <span>Decisions {profile.decisionCount}</span>
                    <span>Guarded {profile.guardedExecutionCount}</span>
                    <span>Handoffs {profile.handoffPackageCount}</span>
                    <span>Premium {profile.premiumApprovalRequestCount}</span>
                    <span>Local {profile.localExplanationCount}</span>
                    <span>Outcomes {profile.outcomeCount}</span>
                  </div>
                  {profile.recentReasonCodes.length > 0 ? (
                    <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                      {profile.recentReasonCodes.slice(0, 3).map(titleCase).join(", ")}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="px-4 py-5 text-sm text-[var(--muted)]">No routing evidence recorded yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
