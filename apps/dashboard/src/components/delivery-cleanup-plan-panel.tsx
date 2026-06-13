import type {
  CleanupPlanResidueView,
  CleanupPlanView,
  LowRiskDeliveryPlanActionView,
  LowRiskDeliveryPlanReportView,
} from "@kendall/contracts";

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusClass(status: string): string {
  if (["eligible", "approved", "executed", "cleaned_up", "recorded", "merged"].includes(status)) {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (["not_recorded", "pending", "dry_run", "read_only"].includes(status)) {
    return "bg-[var(--surface)] text-[var(--muted)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>{titleCase(status)}</span>;
}

function BoundaryBadge({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        allowed
          ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]"
          : "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]"
      }`}
    >
      {label}: {allowed ? "approved" : "blocked"}
    </span>
  );
}

function StateBadge({ label, value, goodText, badText }: { label: string; value: boolean; goodText: string; badText: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        value
          ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]"
          : "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]"
      }`}
    >
      {label}: {value ? goodText : badText}
    </span>
  );
}

function ValueList({ items, emptyText }: { items: string[]; emptyText: string }) {
  const values = items.length > 0 ? items : [emptyText];
  return (
    <div className="mt-2 space-y-2">
      {values.map((item) => (
        <p key={item} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          {item}
        </p>
      ))}
    </div>
  );
}

function PlanCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border bg-[var(--surface)] p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-words font-mono text-xs">{value}</p>
    </div>
  );
}

function actionLabel(action: LowRiskDeliveryPlanActionView): string {
  if (action.actionId === "pr") {
    return "PR readiness";
  }
  if (action.actionId === "merge") {
    return "Merge readiness";
  }
  if (action.actionId === "cleanup") {
    return "Cleanup readiness";
  }
  return action.label;
}

function missingAction(actionId: "pr" | "merge" | "cleanup"): LowRiskDeliveryPlanActionView {
  const label = actionId === "pr" ? "PR delivery" : actionId === "merge" ? "Merge" : "Cleanup";
  return {
    actionId,
    label,
    status: "blocked",
    eligible: false,
    dryRunEffects: [`would block ${actionId} because the plan action is missing from the supervisor response`],
    evidence: [],
    blockedReasons: [`${actionId}-plan-action-missing`],
    nextSafeAction: "Regenerate the delivery plan before requesting approval.",
    requiredApproval: "Exact approval cannot be requested until this plan action is present.",
    requiredPolicy: actionId === "cleanup" ? "low-risk-cleanup-policy-v1" : "low-risk-delivery-policy-v1",
    allowedOperations: [],
    blockedOperations: ["all execution until plan action is present"],
    readOnly: true,
  };
}

function DeliveryActionCard({ action }: { action: LowRiskDeliveryPlanActionView }) {
  return (
    <article className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{action.actionId}</p>
          <h4 className="mt-1 text-base font-semibold">{actionLabel(action)}</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={action.status} />
          <StateBadge label="Eligible" value={action.eligible} goodText="yes" badText="no" />
          <StateBadge label="Read-only" value={action.readOnly} goodText="yes" badText="no" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <PlanCell label="Required policy" value={action.requiredPolicy} />
        <PlanCell label="Required approval" value={action.requiredApproval} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div>
          <h5 className="text-sm font-semibold">Blocked reasons</h5>
          <ValueList items={action.blockedReasons} emptyText="No blocked reason recorded." />
        </div>
        <div>
          <h5 className="text-sm font-semibold">Evidence used</h5>
          <ValueList items={action.evidence} emptyText="No retained evidence recorded." />
        </div>
        <div>
          <h5 className="text-sm font-semibold">Dry-run effects</h5>
          <ValueList items={action.dryRunEffects} emptyText="No push, merge, cleanup, or issue sync would run from this panel." />
        </div>
      </div>

      <p className="mt-4 rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
        Next safe action: {action.nextSafeAction}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Allowed operations: {action.allowedOperations.length ? action.allowedOperations.join(", ") : "none"}. Blocked operations:{" "}
        {action.blockedOperations.length ? action.blockedOperations.join(", ") : "none"}.
      </p>
    </article>
  );
}

function ResidueRow({ residue }: { residue: CleanupPlanResidueView }) {
  return (
    <div className="grid gap-2 border-t border-[var(--border)] py-3 first:border-t-0 md:grid-cols-[8rem_minmax(0,1fr)_10rem]">
      <p className="font-mono text-xs text-[var(--muted)]">{residue.kind}</p>
      <p className="break-all font-mono text-xs">{residue.path}</p>
      <p className="text-xs text-[var(--muted)]">
        {residue.insideApprovedTarget ? "inside target" : "outside target"} / {residue.safeToRemoveAfterApproval ? "safe after approval" : "blocked"}
      </p>
    </div>
  );
}

export function DeliveryCleanupPlanPanel({
  deliveryPlan,
  cleanupPlan,
}: {
  deliveryPlan: LowRiskDeliveryPlanReportView;
  cleanupPlan: CleanupPlanView;
}) {
  const prAction = deliveryPlan.actions.find((action) => action.actionId === "pr") ?? missingAction("pr");
  const mergeAction = deliveryPlan.actions.find((action) => action.actionId === "merge") ?? missingAction("merge");
  const cleanupAction = deliveryPlan.actions.find((action) => action.actionId === "cleanup") ?? missingAction("cleanup");
  const orderedActions = [prAction, mergeAction, cleanupAction];

  return (
    <section id="delivery-cleanup-plan" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Delivery plans</p>
          <h3 className="mt-2 text-xl font-semibold">PR, merge, and cleanup dry-run plan</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Read-only plan from retained metadata evidence; each mutating step requires exact approval. This panel does not push, merge,
            delete worktrees, delete branches, sync issues, call providers, or bypass failed checks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={cleanupPlan.status} />
          <BoundaryBadge label="Remote mutation" allowed={deliveryPlan.remoteMutationApproved || cleanupPlan.remoteMutationApproved} />
          <BoundaryBadge label="Cleanup" allowed={cleanupPlan.cleanupAllowed} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PlanCell label="Current branch" value={deliveryPlan.currentBranch} />
        <PlanCell label="Base branch" value={deliveryPlan.baseBranch} />
        <PlanCell label="Head revision" value={deliveryPlan.headRevision} />
        <PlanCell label="Working tree" value={deliveryPlan.workingTreeStatus} />
      </div>

      <div className="mt-5 grid gap-4">
        {orderedActions.map((action) => (
          <DeliveryActionCard key={action.actionId} action={action} />
        ))}
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Cleanup readiness</p>
            <h4 className="mt-1 text-base font-semibold">Cleanup target and retained evidence</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <BoundaryBadge label="Branch deletion" allowed={cleanupPlan.branchDeletionApproved} />
            <BoundaryBadge label="Worktree removal" allowed={cleanupPlan.worktreeRemovalApproved} />
            <BoundaryBadge label="Evidence deletion" allowed={cleanupPlan.evidenceDeletionApproved} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PlanCell label="Target branch" value={cleanupPlan.branchTarget} />
          <PlanCell label="Cleanup target" value={cleanupPlan.cleanupTargetPath ?? "not recorded"} />
          <PlanCell label="Git worktree state" value={cleanupPlan.gitWorktreeState} />
          <PlanCell label="Filesystem state" value={cleanupPlan.filesystemState} />
          <PlanCell label="Source file state" value={cleanupPlan.sourceFileState} />
          <PlanCell label="Required policy" value={cleanupPlan.requiredPolicy} />
          <PlanCell label="Required approval" value={cleanupPlan.requiredApproval} />
          <PlanCell label="Recovery path" value={cleanupPlan.recoveryPath} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div>
            <h5 className="text-sm font-semibold">Retained evidence</h5>
            <ValueList items={cleanupPlan.retainedEvidence} emptyText="No retained cleanup evidence recorded." />
          </div>
          <div>
            <h5 className="text-sm font-semibold">Dry-run effects</h5>
            <ValueList items={cleanupPlan.dryRunEffects} emptyText="Cleanup dry-run has no deletions to report." />
          </div>
          <div>
            <h5 className="text-sm font-semibold">Blocked paths</h5>
            <ValueList items={cleanupPlan.blockedPaths} emptyText="No blocked cleanup paths recorded." />
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div>
            <h5 className="text-sm font-semibold">Blocked reasons</h5>
            <ValueList items={cleanupPlan.blockedReasons} emptyText="No cleanup blocker recorded." />
          </div>
          <div>
            <h5 className="text-sm font-semibold">Next safe actions</h5>
            <ValueList items={cleanupPlan.nextSafeActions} emptyText="No cleanup next action recorded." />
          </div>
        </div>

        <div className="mt-5 rounded-[1rem] border bg-[var(--panel)] px-4">
          <div className="grid gap-2 py-3 md:grid-cols-[8rem_minmax(0,1fr)_10rem]">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Residue</p>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Path</p>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Classification</p>
          </div>
          {cleanupPlan.residue.length ? (
            cleanupPlan.residue.map((residue) => <ResidueRow key={`${residue.kind}:${residue.path}`} residue={residue} />)
          ) : (
            <p className="border-t border-[var(--border)] py-3 text-xs leading-5 text-[var(--muted)]">
              No filesystem residue recorded. Git-registered worktree state remains separate from filesystem residue state.
            </p>
          )}
        </div>

        <div className="mt-5">
          <h5 className="text-sm font-semibold">Source files</h5>
          <ValueList items={cleanupPlan.sourceFiles} emptyText="No source file list recorded for cleanup." />
        </div>
      </div>
    </section>
  );
}
