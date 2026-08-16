"use client";

import { AuthorityReadinessMatrixReportPanel } from "./authority-readiness-matrix-report-panel";
import { ClaudeReviewApprovalReportPanel } from "./claude-review-approval-report-panel";
import { ClaudeReviewReadinessReportPanel } from "./claude-review-readiness-report-panel";
import { CodexImplementationApprovalReportPanel } from "./codex-implementation-approval-report-panel";
import { CodexReadinessReportPanel } from "./codex-readiness-report-panel";
import { ControlPanel } from "./control-panel";
import { CreateWorkItemForm } from "./create-work-item-form";
import { DashboardE2EReportPanel } from "./dashboard-e2e-report-panel";
import { DeliveryReadinessPolicyReportPanel } from "./delivery-readiness-policy-report-panel";
import { DevelopmentRunwayReportPanel } from "./development-runway-report-panel";
import { DocumentationAuthorityReportPanel } from "./documentation-authority-report-panel";
import { ExecutionReadinessReportPanel } from "./execution-readiness-report-panel";
import { GitHubDeliveryAuthorityReportPanel } from "./github-delivery-authority-report-panel";
import { GitHubWorkflowPolicyReportPanel } from "./github-workflow-policy-report-panel";
import { GitHygieneReportPanel } from "./git-hygiene-report-panel";
import { LegacyPlanningArtifactInventoryReportPanel } from "./legacy-planning-artifact-inventory-report-panel";
import { LocalCleanupReadinessReportPanel } from "./local-cleanup-readiness-report-panel";
import { MaintenanceActionPlanReportPanel } from "./maintenance-action-plan-report-panel";
import { MaintenanceReadinessReportPanel } from "./maintenance-readiness-report-panel";
import { MvpProofTrialReportPanel } from "./mvp-proof-trial-report-panel";
import { ManagedRecipePolicyReportPanel } from "./managed-recipe-policy-report-panel";
import { OperatorProfilePanel } from "./operator-profile-panel";
import { PageIntro } from "./page-intro";
import { RoutingFleetPanel } from "./routing-fleet-panel";
import { RuntimeEvidenceReviewReportPanel } from "./runtime-evidence-review-report-panel";
import { ReviewResourcePolicyReportPanel } from "./review-resource-policy-report-panel";
import { RunnerAssignmentStatusReportPanel } from "./runner-assignment-status-report-panel";
import { RemoteCleanupSyncReadinessReportPanel } from "./remote-cleanup-sync-readiness-report-panel";
import { SafeDevelopmentBacklogPanel } from "./safe-development-backlog-panel";
import { Shell } from "./shell";
import { SupervisorReportCatalogPanel } from "./supervisor-report-catalog-panel";
import { TrustedDeliveryEligibilityReportPanel } from "./trusted-delivery-eligibility-report-panel";
import { TrustedAutonomyReadinessReportPanel } from "./trusted-autonomy-readiness-report-panel";
import { VerificationReadinessReportPanel } from "./verification-readiness-report-panel";
import { buildNavStats } from "../lib/nav-stats";
import type { ControlsPageData } from "../lib/controls-page-data";

function Report({ id, children }: { id: string; children: React.ReactNode }) {
  return <div id={id} className="scroll-mt-28">{children}</div>;
}

export function ControlsPageContent({ data, lanAuthEnabled = true }: { data: ControlsPageData; lanAuthEnabled?: boolean }) {
  const navStats = buildNavStats(data.items);
  return <Shell lanAuthEnabled={lanAuthEnabled} navStats={navStats}>
    <PageIntro eyebrow="Controls" title="Supervisor run controls" description={data.status.summary} metrics={[{ label: "Mode", value: data.status.mode }, { label: "Poll interval", value: `${data.status.pollIntervalSeconds}s` }, { label: "Queued", value: String(data.status.queueCount) }, { label: "Active", value: String(data.status.activeCount) }]} />
    <OperatorProfilePanel />
    {!lanAuthEnabled && <CreateWorkItemForm executionRecipes={data.executionRecipes} />}
    <ControlPanel status={data.status} />
    <Report id="execution-readiness-report"><ExecutionReadinessReportPanel report={data.readinessReport} /></Report>
    <Report id="documentation-authority-report"><DocumentationAuthorityReportPanel report={data.documentationAuthorityReport} /></Report>
    <Report id="legacy-planning-artifact-inventory"><LegacyPlanningArtifactInventoryReportPanel report={data.legacyPlanningArtifactInventoryReport} /></Report>
    <Report id="verification-readiness-report"><VerificationReadinessReportPanel report={data.verificationReadinessReport} /></Report>
    <Report id="authority-readiness-matrix-report"><AuthorityReadinessMatrixReportPanel report={data.authorityReadinessMatrixReport} /></Report>
    <Report id="dashboard-e2e-report"><DashboardE2EReportPanel report={data.dashboardE2EReport} /></Report>
    <Report id="supervisor-report-catalog"><SupervisorReportCatalogPanel catalog={data.reportCatalog} /></Report>
    <Report id="maintenance-readiness-report"><MaintenanceReadinessReportPanel report={data.maintenanceReadinessReport} /></Report>
    <Report id="maintenance-action-plan-report"><MaintenanceActionPlanReportPanel report={data.maintenanceActionPlanReport} /></Report>
    <Report id="development-runway-report"><DevelopmentRunwayReportPanel report={data.developmentRunwayReport} /></Report>
    <Report id="runtime-evidence-review-report"><RuntimeEvidenceReviewReportPanel report={data.runtimeEvidenceReviewReport} /></Report>
    <Report id="safe-development-backlog"><SafeDevelopmentBacklogPanel report={data.safeDevelopmentBacklog} /></Report>
    <Report id="runner-assignment-status"><RunnerAssignmentStatusReportPanel report={data.runnerAssignmentStatusReport} /></Report>
    <Report id="managed-recipe-policy-report"><ManagedRecipePolicyReportPanel report={data.managedRecipePolicyReport} /></Report>
    <Report id="github-workflow-policy-report"><GitHubWorkflowPolicyReportPanel report={data.githubWorkflowPolicyReport} /></Report>
    <Report id="github-delivery-authority-report"><GitHubDeliveryAuthorityReportPanel report={data.githubDeliveryAuthorityReport} /></Report>
    <Report id="git-hygiene-report"><GitHygieneReportPanel report={data.gitHygieneReport} /></Report>
    <Report id="local-cleanup-readiness-report"><LocalCleanupReadinessReportPanel report={data.localCleanupReadinessReport} /></Report>
    <Report id="remote-cleanup-sync-readiness-report"><RemoteCleanupSyncReadinessReportPanel report={data.remoteCleanupSyncReadinessReport} /></Report>
    <Report id="trusted-delivery-eligibility-report"><TrustedDeliveryEligibilityReportPanel report={data.trustedDeliveryEligibilityReport} /></Report>
    <Report id="trusted-autonomy-readiness-report"><TrustedAutonomyReadinessReportPanel report={data.trustedAutonomyReadinessReport} /></Report>
    <Report id="epic-6-mvp-proof-trial-report"><MvpProofTrialReportPanel report={data.mvpProofTrialReport} /></Report>
    <Report id="codex-readiness-report"><CodexReadinessReportPanel report={data.codexReadinessReport} /></Report>
    <Report id="codex-implementation-approval-report"><CodexImplementationApprovalReportPanel report={data.codexImplementationApprovalReport} /></Report>
    <Report id="claude-review-readiness-report"><ClaudeReviewReadinessReportPanel report={data.claudeReviewReadinessReport} /></Report>
    <Report id="claude-review-approval-report"><ClaudeReviewApprovalReportPanel report={data.claudeReviewApprovalReport} /></Report>
    <Report id="review-resource-policy-report"><ReviewResourcePolicyReportPanel report={data.reviewResourcePolicyReport} /></Report>
    <Report id="delivery-readiness-policy-report"><DeliveryReadinessPolicyReportPanel report={data.deliveryReadinessPolicyReport} /></Report>
    <RoutingFleetPanel workers={data.workers} laneProfiles={data.laneProfiles} />
  </Shell>;
}
