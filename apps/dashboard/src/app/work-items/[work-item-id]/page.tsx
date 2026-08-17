import { WorkItemDetailPage } from "../../../components/work-item-detail-page";
import {
  getExecutionAttempts,
  getLocalWorktreePlan,
  getRecipeGateAudit,
  getRoutingPreview,
  getRuntimeEvidenceExport,
  getRuntimeEvidenceReviewReport,
  getWorkItem,
  getWorkItemCleanupPlan,
  getWorkItemEvents,
  getWorkItemLowRiskDeliveryPlan,
  getWorkItemTrustedDeliveryEligibilityReport,
  getWorkItems,
  getWorkPacketForWorkItem,
} from "../../../lib/supervisor";
import { projectDashboardCanonicalPresentationForWorkItemHold } from "../../../lib/pipeline-supervisor-projector";

export default async function WorkItemDetailRoute({ params }: { params: Promise<{ "work-item-id": string }> }) {
  const { "work-item-id": workItemId } = await params;
  if (process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    return <WorkItemDetailPage workItemId={workItemId} lanAuthEnabled />;
  }

  const [item, events, items, routingPreview, executionAttempts, runtimeEvidenceExport, runtimeEvidenceReviewReport, trustedDeliveryReport, lowRiskDeliveryPlan, cleanupPlan, workPacket] = await Promise.all([
    getWorkItem(workItemId), getWorkItemEvents(workItemId), getWorkItems(), getRoutingPreview(workItemId), getExecutionAttempts(workItemId),
    getRuntimeEvidenceExport(workItemId), getRuntimeEvidenceReviewReport(), getWorkItemTrustedDeliveryEligibilityReport(workItemId),
    getWorkItemLowRiskDeliveryPlan(workItemId), getWorkItemCleanupPlan(workItemId), getWorkPacketForWorkItem(workItemId).then((packet) => packet ? projectDashboardCanonicalPresentationForWorkItemHold(packet.presentation) : null),
  ]);
  const [recipeGateAudit, localWorktreePlan] = await Promise.all([
    item.executionRecipe ? getRecipeGateAudit(workItemId) : null,
    item.executionRecipe ? getLocalWorktreePlan(workItemId) : null,
  ]);
  return <WorkItemDetailPage workItemId={workItemId} lanAuthEnabled={false} initialData={{ item, events, items, routingPreview, executionAttempts, runtimeEvidenceExport, runtimeEvidenceReviewReport, trustedDeliveryReport, lowRiskDeliveryPlan, cleanupPlan, workPacket, recipeGateAudit, localWorktreePlan }} />;
}
