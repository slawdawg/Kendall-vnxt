import { AssignmentPanel } from "../../../components/assignment-panel";
import { AttentionBadge } from "../../../components/attention-badge";
import { EscalationPanel } from "../../../components/escalation-panel";
import { Shell } from "../../../components/shell";
import { WorkItemActions } from "../../../components/work-item-actions";
import { WorkItemHistory } from "../../../components/work-item-history";
import { buildNavStats } from "../../../lib/nav-stats";
import { getWorkItem, getWorkItemEvents, getWorkItems } from "../../../lib/supervisor";
import { formatLane, formatWorkflowState } from "../../../lib/workflow-display";

export default async function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ "work-item-id": string }>;
}) {
  const { "work-item-id": workItemId } = await params;
  const [item, events, items] = await Promise.all([getWorkItem(workItemId), getWorkItemEvents(workItemId), getWorkItems()]);
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {item.needsAttention ? <AttentionBadge reason={item.attentionReason} /> : null}
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
            {formatWorkflowState(item.state)}
          </p>
        </div>
        <h2 className="mt-3 text-3xl font-semibold">{item.title}</h2>
        <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">{item.requestedOutcome}</p>
        {item.details ? <p className="mt-4 rounded-[1.25rem] border bg-[var(--surface)] p-4 text-sm">{item.details}</p> : null}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {[
            ["Source", item.source],
            ["Current step", formatWorkflowState(item.state)],
            ["Workflow group", formatLane(item.lane)],
            ["Next action", item.nextStep ?? "None"],
            ["Owner", item.assigneeLabel ?? item.assigneeId ?? "Unassigned"],
            ["Age", `${item.ageMinutes} min`],
            ["Audit mode", item.auditMode],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {item.attentionReason ? (
          <div className="mt-6 rounded-[1.25rem] border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-4 text-sm text-[var(--warn)]">
            {item.attentionReason}
          </div>
        ) : null}
        {item.blockedReason ? (
          <div className="mt-6 rounded-[1.25rem] border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-4 text-sm text-[var(--warn)]">
            {item.blockedReason}
          </div>
        ) : null}
      </section>
      <AssignmentPanel workItemId={item.id} assigneeId={item.assigneeId} assigneeLabel={item.assigneeLabel} />
      <EscalationPanel
        workItemId={item.id}
        attentionReason={item.attentionReason}
        escalatedAt={item.escalatedAt}
        escalationReason={item.escalationReason}
        escalatedByLabel={item.escalatedByLabel}
      />
      <WorkItemActions workItemId={item.id} state={item.state} requiresAudit={item.requiresAudit} />
      <WorkItemHistory events={events} />
    </Shell>
  );
}
