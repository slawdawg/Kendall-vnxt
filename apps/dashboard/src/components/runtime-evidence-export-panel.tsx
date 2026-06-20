import type { RuntimeEvidenceExportView } from "@kendall/contracts";
import { reportShortcutHref } from "../lib/report-shortcuts";

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

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function formatUnknown(value: unknown, fallback = "not recorded"): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

export function RuntimeEvidenceExportPanel({ exportView }: { exportView: RuntimeEvidenceExportView }) {
  const safetyEntries: Array<[string, boolean]> = [
    ["Process launch", exportView.safety.processLaunchAllowed],
    ["Provider calls", exportView.safety.providerCallsAllowed],
    ["Model calls", exportView.safety.modelCallsAllowed],
    ["Premium execution", exportView.safety.premiumExecutionAllowed],
    ["Commands", exportView.safety.commandExecutionAllowed],
    ["Source mutation", exportView.safety.sourceMutationAllowed],
    ["Network", exportView.safety.networkAllowed],
    ["Credentials", exportView.safety.credentialAccessAllowed],
  ];

  return (
    <section id="runtime-evidence-export" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Runtime export</p>
          <h3 className="mt-2 text-xl font-semibold">Evidence package</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Read-only export summary for work item evidence, attempts, events, boundaries, and safety flags.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(exportView.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Format", exportView.format],
          ["Attempts", String(exportView.executionAttempts.length)],
          ["Events", String(exportView.workflowEvents.length)],
          ["Export only", exportView.safety.exportOnly ? "Yes" : "No"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Safety flags</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {safetyEntries.map(([label, allowed]) => (
            <span
              key={label}
              className={`rounded-full border px-3 py-1 text-xs ${
                allowed ? "border-[var(--warn)]/40 text-[var(--warn)]" : "bg-[var(--panel)] text-[var(--muted)]"
              }`}
            >
              {label}: {allowed ? "allowed" : "disabled"}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Subscription launch evidence</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Status", exportView.subscriptionLaunch.status],
            ["Readiness", exportView.subscriptionLaunch.readinessStatus],
            ["Latest event", exportView.subscriptionLaunch.latestEventType ?? "not recorded"],
            ["Raw output stored", exportView.subscriptionLaunch.rawOutputStored ? "true" : "false"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
              <p className="mt-1 break-words text-xs font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <div className="space-y-2">
            {Object.entries(exportView.subscriptionLaunch.safetyFlags).map(([label, value]) => (
              <p key={label} className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                {label}: {value ? "true" : "false"}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            {exportView.subscriptionLaunch.outputArtifactReferences.length > 0 ? (
              exportView.subscriptionLaunch.outputArtifactReferences.map((artifact, index) => (
                <p key={`${formatUnknown(artifact.artifactId, "artifact")}-${index}`} className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                  {formatUnknown(artifact.artifactKind, "artifact_reference")}
                </p>
              ))
            ) : (
              <p className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]">No subscription launch artifacts recorded.</p>
            )}
          </div>
          <div className="space-y-2">
            {([
              ["terminalStates", Array.isArray(exportView.subscriptionLaunch.lifecycleSummary.terminalStates) ? exportView.subscriptionLaunch.lifecycleSummary.terminalStates.join(", ") : undefined],
              ["rollbackPolicy", exportView.subscriptionLaunch.cancellationTimeoutRollbackEvidence.rollbackPolicy],
              ["idempotentCleanupPolicy", exportView.subscriptionLaunch.cancellationTimeoutRollbackEvidence.idempotentCleanupPolicy],
            ] as Array<[string, unknown]>).map(([label, value]) => (
              <p key={label} className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                {label}: {formatUnknown(value)}
              </p>
            ))}
          </div>
        </div>
        {Object.keys(exportView.subscriptionLaunch.verificationEvidence).length > 0 ? (
          <div className="mt-3 rounded-[0.85rem] border bg-[var(--panel)] p-3">
            <h5 className="text-sm font-semibold">Verification and recovery</h5>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["status", exportView.subscriptionLaunch.verificationEvidence.status],
                ["blockedReason", exportView.subscriptionLaunch.verificationEvidence.blockedReason],
                ["rollbackStatus", exportView.subscriptionLaunch.verificationEvidence.rollbackStatus],
                ["rollbackReason", exportView.subscriptionLaunch.verificationEvidence.rollbackReason],
                ["recoveryPath", exportView.subscriptionLaunch.verificationEvidence.recoveryPath],
                ["nextSafeAction", exportView.subscriptionLaunch.verificationEvidence.nextSafeAction],
              ] as Array<[string, unknown]>).map(([label, value]) => (
                <p key={label} className="break-words rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                  {label}: {formatUnknown(value)}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Review navigator</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {exportView.reviewNavigator.map((item) => (
            <article key={item.itemId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{item.priority}</p>
                  <h5 className="mt-1 text-sm font-semibold">{item.label}</h5>
                </div>
                <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {item.itemId}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.summary}</p>
              <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {item.target}
              </p>
              <div className="mt-3 space-y-2">
                {item.evidence.map((evidence, evidenceIndex) => (
                  <p
                    key={`${item.itemId}:evidence:${evidence}:${evidenceIndex}`}
                    className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]"
                  >
                    {evidence}
                  </p>
                ))}
              </div>
              <p className="mt-3 break-words rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {item.relatedReports.join(" | ")}
              </p>
              {item.stopLines.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {item.stopLines.map((stopLine) => (
                    <p key={stopLine} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                      {stopLine}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Related reports</h4>
          <div className="mt-3 space-y-2">
            {exportView.boundary.relatedSupervisorReports.map((report) => (
              <a
                key={report}
                href={reportShortcutHref(report)}
                className="block rounded-[1rem] border bg-[var(--panel)] p-3 font-mono text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {report}
              </a>
            ))}
          </div>
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Boundary evidence</h4>
          <div className="mt-3 space-y-2">
            {exportView.boundary.gitBackedEvidence.slice(0, 6).map((path) => (
              <p key={path} className="rounded-[1rem] border bg-[var(--panel)] p-3 font-mono text-xs text-[var(--muted)]">
                {path}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Review manifest</h4>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{exportView.reviewManifest.summary}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(exportView.reviewManifest.evidenceCounts).map(([label, value]) => (
              <div key={label} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{titleCase(label)}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 break-all font-mono text-xs text-[var(--muted)]">{exportView.reviewManifest.manifestId}</p>
        </div>

        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Review checklist</h4>
          <div className="mt-3 space-y-2">
            {exportView.reviewManifest.reviewChecklist.map((item) => (
              <p key={item} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Retention notes</h4>
          <div className="mt-3 space-y-2">
            {exportView.reviewManifest.retentionNotes.map((note) => (
              <p key={note} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {note}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Manifest stop lines</h4>
          <div className="mt-3 space-y-2">
            {exportView.reviewManifest.stopLines.map((stopLine) => (
              <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                {stopLine}
              </p>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 break-all font-mono text-xs text-[var(--muted)]">{titleCase(exportView.exportId)}</p>
    </section>
  );
}
