import type { RuntimeEvidenceExportView, WorkflowEventView } from "@kendall/contracts";

const SUBSCRIPTION_LAUNCH_EVENTS = new Set([
  "routing.subscription_agent_launch_stub_created",
  "routing.subscription_agent_launch_rejected",
  "execution_attempt.subscription_launch_fixture_started",
  "execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
  "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
  "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
  "execution_attempt.subscription_launch_fixture_completed",
  "execution_attempt.verification_recorded",
]);

function statusClass(status: string): string {
  if (["completed", "terminal", "dry_run_ready"].includes(status)) {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (["not_started", "missing_evidence", "readiness_only"].includes(status)) {
    return "bg-[var(--surface)] text-[var(--muted)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "not_recorded"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function asArtifactReferences(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function formatAllowance(label: string, value: boolean): string {
  return `${label}: ${value ? "allowed" : "disabled"}`;
}

function formatAttempt(label: string, value: boolean): string {
  return `${label}: ${value ? "attempted" : "not attempted"}`;
}

function formatField(label: string, value: unknown): string {
  if (typeof value === "boolean") {
    return `${label}: ${value ? "true" : "false"}`;
  }
  if (typeof value === "number") {
    return `${label}: ${value}`;
  }
  return `${label}: ${asString(value)}`;
}

function eventTimestamp(event: WorkflowEventView): number {
  const parsed = Date.parse(event.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function eventPriority(event: WorkflowEventView): number {
  const verification = asRecord(event.payload.subscriptionLaunchVerification);
  if (event.eventType === "execution_attempt.verification_recorded" && verification.rollbackStatus === "triggered") {
    return 8;
  }
  if (event.eventType === "execution_attempt.verification_recorded" && Object.keys(verification).length > 0) {
    return 7;
  }
  if (event.eventType === "execution_attempt.subscription_launch_fixture_completed") {
    return 6;
  }
  if (event.eventType === "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded") {
    return 5;
  }
  if (event.eventType === "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded") {
    return 4;
  }
  if (event.eventType === "execution_attempt.subscription_launch_fixture_timeout_policy_recorded") {
    return 3;
  }
  if (event.eventType === "routing.subscription_agent_launch_rejected") {
    return 2;
  }
  if (event.eventType === "execution_attempt.subscription_launch_fixture_started") {
    return 1;
  }
  return 0;
}

function latestSubscriptionEvent(...eventGroups: WorkflowEventView[][]): WorkflowEventView | null {
  const matches = eventGroups.flat().filter((event) => {
    if (!SUBSCRIPTION_LAUNCH_EVENTS.has(event.eventType)) {
      return false;
    }
    return event.eventType !== "execution_attempt.verification_recorded" || Object.keys(asRecord(event.payload.subscriptionLaunchVerification)).length > 0;
  });
  return matches.sort((a, b) => eventPriority(b) - eventPriority(a) || eventTimestamp(b) - eventTimestamp(a))[0] ?? null;
}

function nextSafeAction(missingFields: string[], rejectedFields: Record<string, unknown>, staleFields: string[]): string {
  if (missingFields.length > 0) {
    return `Fill ${missingFields[0]} before exact launch approval can be requested.`;
  }
  if (staleFields.length > 0) {
    return `Refresh ${staleFields[0]} before reusing any prior approval.`;
  }
  const rejectedField = Object.keys(rejectedFields)[0];
  if (rejectedField) {
    return `Inspect ${rejectedField} before exact launch approval can be requested.`;
  }
  return "Preserve disabled launch state until a later exact approval packet is accepted.";
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
      <h4 className="text-base font-semibold">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <p key={item} className="break-words rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
              {item}
            </p>
          ))
        ) : (
          <p className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">None recorded.</p>
        )}
      </div>
    </div>
  );
}

function MissingEvidenceState({
  badge = "Missing Evidence",
  message = "No subscription launch evidence has been recorded.",
  nextAction = "Create disabled launch stub evidence before requesting exact launch approval.",
}: {
  badge?: string;
  message?: string;
  nextAction?: string;
}) {
  return (
    <section id="subscription-launch-readiness" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Readiness only</p>
          <h3 className="mt-2 text-xl font-semibold">Subscription launch readiness</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{message}</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass("missing_evidence")}`}>{badge}</span>
      </div>
      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Next safe action</h4>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{nextAction}</p>
      </div>
    </section>
  );
}

export function SubscriptionLaunchReadinessPanel({
  events,
  runtimeEvidenceExport,
}: {
  events: WorkflowEventView[];
  runtimeEvidenceExport: RuntimeEvidenceExportView;
}) {
  const latestEvent = latestSubscriptionEvent(events, runtimeEvidenceExport.workflowEvents);

  if (!latestEvent) {
    return <MissingEvidenceState />;
  }

  const payload = latestEvent.payload;
  const hasReadinessEvidence =
    typeof payload.readinessStatus === "string" ||
    payload.subscriptionLaunchVerification != null ||
    Array.isArray(payload.missingEnvelopeFields) ||
    Array.isArray(payload.blockedReasonIds) ||
    payload.readinessEvidence != null;

  if (!hasReadinessEvidence) {
    return (
      <MissingEvidenceState
        badge="Incomplete Evidence"
        message="A subscription launch event was recorded without readiness evidence."
        nextAction="Refresh disabled launch stub evidence before requesting exact launch approval."
      />
    );
  }

  const readinessStatus = asString(payload.readinessStatus);
  const lifecyclePolicyResults = asRecord(payload.lifecyclePolicyResults);
  const verificationEvidence = asRecord(payload.subscriptionLaunchVerification);
  const outputArtifactSummary = asRecord(payload.outputArtifactSummary);
  const missingEnvelopeFields = asStringArray(payload.missingEnvelopeFields);
  const rejectedEnvelopeFields = asRecord(payload.rejectedEnvelopeFields);
  const staleEnvelopeFields = asStringArray(payload.staleEnvelopeFields);
  const blockedReasonIds = [...new Set(asStringArray(payload.blockedReasonIds))].sort();
  const artifactReferences = asArtifactReferences(outputArtifactSummary.artifactReferences);
  const boundedByteCounts = asRecord(outputArtifactSummary.boundedByteCounts);
  const launchBlocked = !asBoolean(payload.processLaunchAllowed) || !asBoolean(payload.executionAllowed);
  const stateMapping = asStringArray(payload.stateMapping);
  const terminalStates = asStringArray(payload.terminalStates);

  const lifecycleItems = [
    asString(payload.lifecyclePolicy),
    ...stateMapping,
    ...terminalStates.map((state) => `terminalState: ${state}`),
    ...Object.values(lifecyclePolicyResults).filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  ];
  const artifactItems = [
    formatField("artifactReferenceOnly", outputArtifactSummary.artifactReferenceOnly),
    formatField("workflowEventRawOutputAllowed", outputArtifactSummary.workflowEventRawOutputAllowed),
    formatField("rawOutputStored", outputArtifactSummary.rawOutputStored),
    formatField("generatedPatchHandling", outputArtifactSummary.generatedPatchHandling),
    ...Object.entries(boundedByteCounts).map(([key, value]) => `boundedByteCounts.${key}: ${String(value)}`),
  ];

  return (
    <section id="subscription-launch-readiness" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Readiness only</p>
          <h3 className="mt-2 text-xl font-semibold">Subscription launch readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Launch evidence is read from persisted supervisor events. This panel does not approve or start a subscription-agent process.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(launchBlocked ? "blocked" : "readiness_only")}`}>
          {launchBlocked ? "Launch blocked" : "Readiness only"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Request status", asString(payload.status, readinessStatus)],
          ["Status", readinessStatus],
          ["Disabled reason", asString(payload.disabledReason)],
          ["Launch policy", asString(payload.launchPolicyId)],
          ["Target", asString(payload.targetId)],
          ["Command template", asString(payload.commandTemplateId)],
          ["Command executable", formatField("commandTemplateExecutable", payload.commandTemplateExecutable)],
          ["Workspace plan", asString(payload.workspacePlanId)],
          ["Output contract", asString(payload.outputContractId)],
          ["Next action", asString(payload.nextSafeAction, nextSafeAction(missingEnvelopeFields, rejectedEnvelopeFields, staleEnvelopeFields))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <EvidenceList title="Missing fields" items={missingEnvelopeFields} />
        <EvidenceList title="Rejected fields" items={Object.entries(rejectedEnvelopeFields).map(([key, value]) => `${key}: ${asString(value)}`)} />
        <EvidenceList title="Stale fields" items={staleEnvelopeFields} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <EvidenceList title="Blocked reasons" items={blockedReasonIds} />
        <EvidenceList title="Lifecycle policy results" items={lifecycleItems} />
      </div>

      {Object.keys(verificationEvidence).length > 0 ? (
        <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Verification and recovery</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ["Verification", verificationEvidence.status],
              ["Blocked reason", verificationEvidence.blockedReason],
              ["Rollback", verificationEvidence.rollbackStatus],
              ["Rollback reason", verificationEvidence.rollbackReason],
              ["Recovery", verificationEvidence.recoveryPath],
              ["Next action", verificationEvidence.nextSafeAction],
            ] as Array<[string, unknown]>).map(([label, value]) => (
              <div key={label} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
                <p className="mt-1 break-words text-xs font-semibold">{asString(value)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Output artifacts</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            {artifactItems.map((item) => (
              <p key={item} className="break-words rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                {item}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            {artifactReferences.length > 0 ? (
              artifactReferences.map((artifact, index) => (
                <article key={`${asString(artifact.artifactId, "artifact")}-${index}`} className="rounded-[0.85rem] border bg-[var(--panel)] p-3">
                  <p className="font-mono text-xs text-[var(--accent)]">{asString(artifact.artifactKind, "artifact_reference")}</p>
                  <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">{asString(artifact.path, "path_not_recorded")}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">{formatField("operatorReviewRequired", artifact.operatorReviewRequired)}</p>
                  {typeof artifact.applied === "boolean" ? <p className="mt-1 text-xs text-[var(--muted)]">{formatField("applied", artifact.applied)}</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">No artifact references recorded.</p>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Raw stdout, stderr, and generated patch contents remain excluded.</p>
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Authority flags</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            formatAllowance("Process launch", asBoolean(payload.processLaunchAllowed)),
            formatAllowance("Execution", asBoolean(payload.executionAllowed)),
            formatAttempt("Shell execution", asBoolean(payload.shellExecutionAttempted)),
            formatAttempt("Credentials", asBoolean(payload.credentialAccessAttempted)),
            formatAttempt("External sends", asBoolean(payload.externalSendAttempted)),
          ].map((item) => (
            <span key={item} className="rounded-full border bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
