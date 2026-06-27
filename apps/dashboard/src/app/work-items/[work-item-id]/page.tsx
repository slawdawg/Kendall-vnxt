import { AssignmentPanel } from "../../../components/assignment-panel";
import { AttentionBadge } from "../../../components/attention-badge";
import { BranchPreparationPanel } from "../../../components/branch-preparation-panel";
import { DeliveryCleanupPlanPanel } from "../../../components/delivery-cleanup-plan-panel";
import { DeliveryReadinessPanel } from "../../../components/delivery-readiness-panel";
import { EscalationPanel } from "../../../components/escalation-panel";
import { EvidenceOverviewPanel } from "../../../components/evidence-overview-panel";
import { ExecutionAttemptEvidencePanel } from "../../../components/execution-attempt-evidence-panel";
import { ExecutionRecipePanel } from "../../../components/execution-recipe-panel";
import { GreenGateReadinessPanel } from "../../../components/green-gate-readiness-panel";
import { LocalEvidencePanel } from "../../../components/local-evidence-panel";
import { LocalWorktreePlanPanel } from "../../../components/local-worktree-plan-panel";
import { MemoryProposalReviewPanel } from "../../../components/memory-proposal-review-panel";
import { RecipeGateAuditPanel } from "../../../components/recipe-gate-audit-panel";
import { RoutingPreviewPanel } from "../../../components/routing-preview-panel";
import { RuntimeEvidenceExportPanel } from "../../../components/runtime-evidence-export-panel";
import { Shell } from "../../../components/shell";
import { SubscriptionLaunchReadinessPanel } from "../../../components/subscription-launch-readiness-panel";
import { WorkItemActions } from "../../../components/work-item-actions";
import { WorkItemHistory } from "../../../components/work-item-history";
import { WorkItemRetryHistory } from "../../../components/work-item-retry-history";
import { buildNavStats } from "../../../lib/nav-stats";
import {
  getExecutionAttempts,
  getWorkItemCleanupPlan,
  getLocalWorktreePlan,
  getRecipeGateAudit,
  getRoutingPreview,
  getRuntimeEvidenceExport,
  getRuntimeEvidenceReviewReport,
  getWorkItemLowRiskDeliveryPlan,
  getWorkItemTrustedDeliveryEligibilityReport,
  getWorkPacket,
  getWorkItem,
  getWorkItemEvents,
  getWorkItems,
} from "../../../lib/supervisor";
import { formatLane, formatWorkflowState } from "../../../lib/workflow-display";

export default async function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ "work-item-id": string }>;
}) {
  const { "work-item-id": workItemId } = await params;
  const [
    item,
    events,
    items,
    routingPreview,
    executionAttempts,
    runtimeEvidenceExport,
    runtimeEvidenceReviewReport,
    trustedDeliveryReport,
    lowRiskDeliveryPlan,
    cleanupPlan,
    workPacket,
  ] = await Promise.all([
    getWorkItem(workItemId),
    getWorkItemEvents(workItemId),
    getWorkItems(),
    getRoutingPreview(workItemId),
    getExecutionAttempts(workItemId),
    getRuntimeEvidenceExport(workItemId),
    getRuntimeEvidenceReviewReport(),
    getWorkItemTrustedDeliveryEligibilityReport(workItemId),
    getWorkItemLowRiskDeliveryPlan(workItemId),
    getWorkItemCleanupPlan(workItemId),
    getWorkPacket(`work_item:${workItemId}`),
  ]);
  const recipeGateAudit = item.executionRecipe ? await getRecipeGateAudit(workItemId) : null;
  const localWorktreePlan = item.executionRecipe ? await getLocalWorktreePlan(workItemId) : null;
  const metadata = item.metadata ?? {};
  const navStats = buildNavStats(items);
  const retryCount = Math.max(0, events.filter((event) => event.eventType === "work_item.implementing").length - 1);
  const runtimeEvidenceReviewItem =
    runtimeEvidenceReviewReport.workItems.find((reviewItem) => reviewItem.workItemId === workItemId) ?? null;

  return (
    <Shell navStats={navStats}>
      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {item.needsAttention ? <AttentionBadge reason={item.attentionReason} /> : null}
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
            {formatWorkflowState(item.state)}
          </p>
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{item.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{item.requestedOutcome}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Current step", formatWorkflowState(item.state)],
            ["Next action", item.nextStep ?? "None"],
            ["Owner", item.assigneeLabel ?? item.assigneeId ?? "Unassigned"],
            ["Workflow group", formatLane(item.lane)],
            ["Source", item.source],
            ["Age", `${item.ageMinutes} min`],
            ["Retries", String(retryCount)],
            ["Audit mode", item.auditMode],
            ["Last updated", new Date(item.updatedAt).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-base font-semibold sm:text-lg">{value}</p>
            </div>
          ))}
        </div>
        {item.attentionReason ? (
          <div className="mt-6 rounded-[0.5rem] border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-4 text-sm text-[var(--warn)]">
            {item.attentionReason}
          </div>
        ) : null}
        {item.blockedReason ? (
          <div className="mt-6 rounded-[0.5rem] border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-4 text-sm text-[var(--warn)]">
            {item.blockedReason}
          </div>
        ) : null}
      </section>
      <section className="sticky top-3 z-10 rounded-[0.5rem] border bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Next action</p>
            <h3 className="mt-2 text-lg font-semibold">{item.nextStep ?? "Review current workflow state"}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{item.statusSummary}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <span className="rounded-full bg-[var(--surface)] px-3 py-1">Owner: {item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}</span>
              <span className="rounded-full bg-[var(--surface)] px-3 py-1">Age: {item.ageMinutes} min</span>
              <span className="rounded-full bg-[var(--surface)] px-3 py-1">Audit: {item.auditMode}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="#workflow-actions"
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#08110f] transition hover:brightness-110"
            >
              Move work
            </a>
            {item.details ? (
              <a
                href="#request-detail"
                className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Request detail
              </a>
            ) : null}
            <a
              href="#retry-history"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Retries
            </a>
            {recipeGateAudit ? (
              <a
                href="#recipe-gate-audit"
                className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Gates
              </a>
            ) : null}
            <a
              href="#memory-proposals"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Memory
            </a>
            <a
              href="#routing-decision"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Routing
            </a>
            <a
              href="#local-check"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Local check
            </a>
            <a
              href="#subscription-launch-readiness"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Launch readiness
            </a>
            <a
              href="#delivery-cleanup-plan"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Delivery plans
            </a>
            <a
              href="#execution-attempts"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Attempts
            </a>
            <a
              href="#runtime-evidence-export"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Export
            </a>
            <a
              href="#workflow-history"
              className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              History
            </a>
          </div>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.9fr)] xl:items-start">
        <div className="space-y-4">
          {item.details ? (
            <section id="request-detail" className="scroll-mt-28 rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Request detail</p>
                  <h3 className="text-xl font-semibold">Full operator context</h3>
                </div>
                <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
                  Expanded intake
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.details}</p>
            </section>
          ) : null}
          <EvidenceOverviewPanel
            routingPreview={routingPreview}
            attempts={executionAttempts}
            runtimeEvidenceExport={runtimeEvidenceExport}
            runtimeEvidenceReviewItem={runtimeEvidenceReviewItem}
            events={events}
          />
          <GreenGateReadinessPanel report={trustedDeliveryReport} attempts={executionAttempts} />
          <DeliveryCleanupPlanPanel deliveryPlan={lowRiskDeliveryPlan} cleanupPlan={cleanupPlan} />
          <SubscriptionLaunchReadinessPanel events={events} runtimeEvidenceExport={runtimeEvidenceExport} />
          <MemoryProposalReviewPanel packet={workPacket} workItemId={item.id} />
          <RoutingPreviewPanel preview={routingPreview} />
          <LocalEvidencePanel workItemId={item.id} />
          <ExecutionAttemptEvidencePanel attempts={executionAttempts} />
          <RuntimeEvidenceExportPanel exportView={runtimeEvidenceExport} />
          {item.executionRecipe ? <ExecutionRecipePanel recipe={item.executionRecipe} /> : null}
          {localWorktreePlan ? <LocalWorktreePlanPanel plan={localWorktreePlan} /> : null}
          {item.executionRecipe ? (
            <BranchPreparationPanel
              workItemId={item.id}
              executionBranch={typeof metadata.executionBranch === "string" ? metadata.executionBranch : null}
              baseBranch={typeof metadata.baseBranch === "string" ? metadata.baseBranch : null}
              baseRevision={typeof metadata.baseRevision === "string" ? metadata.baseRevision : null}
            />
          ) : null}
          {recipeGateAudit ? <RecipeGateAuditPanel audit={recipeGateAudit} workItemId={item.id} /> : null}
          {item.deliveryReadiness ? <DeliveryReadinessPanel workItemId={item.id} deliveryReadiness={item.deliveryReadiness} /> : null}
          <WorkItemRetryHistory events={events} />
          <div id="workflow-history" className="scroll-mt-28">
            <WorkItemHistory events={events} />
          </div>
        </div>
        <div className="space-y-4 xl:sticky xl:top-6">
          <div id="workflow-actions" className="scroll-mt-28">
            <WorkItemActions workItemId={item.id} state={item.state} requiresAudit={item.requiresAudit} />
          </div>
          <AssignmentPanel workItemId={item.id} assigneeId={item.assigneeId} assigneeLabel={item.assigneeLabel} />
          <EscalationPanel
            workItemId={item.id}
            attentionReason={item.attentionReason}
            escalatedAt={item.escalatedAt}
            escalationReason={item.escalationReason}
            escalatedByLabel={item.escalatedByLabel}
          />
        </div>
      </div>
    </Shell>
  );
}
