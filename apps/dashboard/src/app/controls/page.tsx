import { ControlPanel } from "../../components/control-panel";
import { ClaudeReviewApprovalReportPanel } from "../../components/claude-review-approval-report-panel";
import { ClaudeReviewReadinessReportPanel } from "../../components/claude-review-readiness-report-panel";
import { CodexImplementationApprovalReportPanel } from "../../components/codex-implementation-approval-report-panel";
import { CodexReadinessReportPanel } from "../../components/codex-readiness-report-panel";
import { AuthorityReadinessMatrixReportPanel } from "../../components/authority-readiness-matrix-report-panel";
import { DashboardE2EReportPanel } from "../../components/dashboard-e2e-report-panel";
import { DeliveryReadinessPolicyReportPanel } from "../../components/delivery-readiness-policy-report-panel";
import { DevelopmentRunwayReportPanel } from "../../components/development-runway-report-panel";
import { DocumentationAuthorityReportPanel } from "../../components/documentation-authority-report-panel";
import { EpicCompletionAuditReportPanel } from "../../components/epic-completion-audit-report-panel";
import { ExecutionReadinessReportPanel } from "../../components/execution-readiness-report-panel";
import { GitHubDeliveryAuthorityReportPanel } from "../../components/github-delivery-authority-report-panel";
import { GitHubWorkflowPolicyReportPanel } from "../../components/github-workflow-policy-report-panel";
import { GitHygieneReportPanel } from "../../components/git-hygiene-report-panel";
import { LocalCleanupReadinessReportPanel } from "../../components/local-cleanup-readiness-report-panel";
import { MaintenanceActionPlanReportPanel } from "../../components/maintenance-action-plan-report-panel";
import { MaintenanceReadinessReportPanel } from "../../components/maintenance-readiness-report-panel";
import { ManagedRecipePolicyReportPanel } from "../../components/managed-recipe-policy-report-panel";
import { OperatorProfilePanel } from "../../components/operator-profile-panel";
import { PageIntro } from "../../components/page-intro";
import { RoutingFleetPanel } from "../../components/routing-fleet-panel";
import { RuntimeEvidenceReviewReportPanel } from "../../components/runtime-evidence-review-report-panel";
import { RemoteCleanupSyncReadinessReportPanel } from "../../components/remote-cleanup-sync-readiness-report-panel";
import { SafeDevelopmentBacklogPanel } from "../../components/safe-development-backlog-panel";
import { Shell } from "../../components/shell";
import { SupervisorReportCatalogPanel } from "../../components/supervisor-report-catalog-panel";
import { TrustedAutonomyReadinessReportPanel } from "../../components/trusted-autonomy-readiness-report-panel";
import { VerificationReadinessReportPanel } from "../../components/verification-readiness-report-panel";
import { buildNavStats } from "../../lib/nav-stats";
import {
  getAuthorityReadinessMatrixReport,
  getClaudeReviewApprovalReport,
  getClaudeReviewReadinessReport,
  getCodexImplementationApprovalReport,
  getCodexReadinessReport,
  getDocumentationAuthorityReport,
  getDashboardE2EReport,
  getDeliveryReadinessPolicyReport,
  getDevelopmentRunwayReport,
  getExecutionReadinessReport,
  getEpic6CompletionAuditReport,
  getGitHubDeliveryAuthorityReport,
  getGitHubWorkflowPolicyReport,
  getGitHygieneReport,
  getLocalCleanupReadinessReport,
  getMaintenanceActionPlanReport,
  getMaintenanceReadinessReport,
  getManagedRecipePolicyReport,
  getRoutingLaneProfiles,
  getRunStatus,
  getRuntimeEvidenceReviewReport,
  getRemoteCleanupSyncReadinessReport,
  getSafeDevelopmentBacklogReport,
  getSupervisorReportCatalog,
  getTrustedAutonomyReadinessReport,
  getVerificationReadinessReport,
  getWorkerRegistry,
  getWorkItems,
} from "../../lib/supervisor";

export default async function ControlsPage() {
  const [
    status,
    items,
    workers,
    laneProfiles,
    readinessReport,
    documentationAuthorityReport,
    verificationReadinessReport,
    authorityReadinessMatrixReport,
    dashboardE2EReport,
    reportCatalog,
    maintenanceReadinessReport,
    maintenanceActionPlanReport,
    developmentRunwayReport,
    runtimeEvidenceReviewReport,
    safeDevelopmentBacklog,
    managedRecipePolicyReport,
    githubWorkflowPolicyReport,
    githubDeliveryAuthorityReport,
    gitHygieneReport,
    localCleanupReadinessReport,
    remoteCleanupSyncReadinessReport,
    trustedAutonomyReadinessReport,
    epic6CompletionAuditReport,
    codexReadinessReport,
    codexImplementationApprovalReport,
    claudeReviewReadinessReport,
    claudeReviewApprovalReport,
    deliveryReadinessPolicyReport,
  ] = await Promise.all([
    getRunStatus(),
    getWorkItems(),
    getWorkerRegistry(),
    getRoutingLaneProfiles(),
    getExecutionReadinessReport(),
    getDocumentationAuthorityReport(),
    getVerificationReadinessReport(),
    getAuthorityReadinessMatrixReport(),
    getDashboardE2EReport(),
    getSupervisorReportCatalog(),
    getMaintenanceReadinessReport(),
    getMaintenanceActionPlanReport(),
    getDevelopmentRunwayReport(),
    getRuntimeEvidenceReviewReport(),
    getSafeDevelopmentBacklogReport(),
    getManagedRecipePolicyReport(),
    getGitHubWorkflowPolicyReport(),
    getGitHubDeliveryAuthorityReport(),
    getGitHygieneReport(),
    getLocalCleanupReadinessReport(),
    getRemoteCleanupSyncReadinessReport(),
    getTrustedAutonomyReadinessReport(),
    getEpic6CompletionAuditReport(),
    getCodexReadinessReport(),
    getCodexImplementationApprovalReport(),
    getClaudeReviewReadinessReport(),
    getClaudeReviewApprovalReport(),
    getDeliveryReadinessPolicyReport(),
  ]);
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Controls"
        title="Supervisor run controls"
        description={status.summary}
        metrics={[
          { label: "Mode", value: status.mode },
          { label: "Poll interval", value: `${status.pollIntervalSeconds}s` },
          { label: "Queued", value: String(status.queueCount) },
          { label: "Active", value: String(status.activeCount) },
        ]}
      />
      <OperatorProfilePanel />
      <ControlPanel />
      <div id="execution-readiness-report" className="scroll-mt-28">
        <ExecutionReadinessReportPanel report={readinessReport} />
      </div>
      <div id="documentation-authority-report" className="scroll-mt-28">
        <DocumentationAuthorityReportPanel report={documentationAuthorityReport} />
      </div>
      <div id="verification-readiness-report" className="scroll-mt-28">
        <VerificationReadinessReportPanel report={verificationReadinessReport} />
      </div>
      <div id="authority-readiness-matrix-report" className="scroll-mt-28">
        <AuthorityReadinessMatrixReportPanel report={authorityReadinessMatrixReport} />
      </div>
      <div id="dashboard-e2e-report" className="scroll-mt-28">
        <DashboardE2EReportPanel report={dashboardE2EReport} />
      </div>
      <div id="supervisor-report-catalog" className="scroll-mt-28">
        <SupervisorReportCatalogPanel catalog={reportCatalog} />
      </div>
      <div id="maintenance-readiness-report" className="scroll-mt-28">
        <MaintenanceReadinessReportPanel report={maintenanceReadinessReport} />
      </div>
      <div id="maintenance-action-plan-report" className="scroll-mt-28">
        <MaintenanceActionPlanReportPanel report={maintenanceActionPlanReport} />
      </div>
      <div id="development-runway-report" className="scroll-mt-28">
        <DevelopmentRunwayReportPanel report={developmentRunwayReport} />
      </div>
      <div id="runtime-evidence-review-report" className="scroll-mt-28">
        <RuntimeEvidenceReviewReportPanel report={runtimeEvidenceReviewReport} />
      </div>
      <div id="safe-development-backlog" className="scroll-mt-28">
        <SafeDevelopmentBacklogPanel report={safeDevelopmentBacklog} />
      </div>
      <div id="managed-recipe-policy-report" className="scroll-mt-28">
        <ManagedRecipePolicyReportPanel report={managedRecipePolicyReport} />
      </div>
      <div id="github-workflow-policy-report" className="scroll-mt-28">
        <GitHubWorkflowPolicyReportPanel report={githubWorkflowPolicyReport} />
      </div>
      <div id="github-delivery-authority-report" className="scroll-mt-28">
        <GitHubDeliveryAuthorityReportPanel report={githubDeliveryAuthorityReport} />
      </div>
      <div id="git-hygiene-report" className="scroll-mt-28">
        <GitHygieneReportPanel report={gitHygieneReport} />
      </div>
      <div id="local-cleanup-readiness-report" className="scroll-mt-28">
        <LocalCleanupReadinessReportPanel report={localCleanupReadinessReport} />
      </div>
      <div id="remote-cleanup-sync-readiness-report" className="scroll-mt-28">
        <RemoteCleanupSyncReadinessReportPanel report={remoteCleanupSyncReadinessReport} />
      </div>
      <div id="trusted-autonomy-readiness-report" className="scroll-mt-28">
        <TrustedAutonomyReadinessReportPanel report={trustedAutonomyReadinessReport} />
      </div>
      <div id="epic-6-completion-audit-report" className="scroll-mt-28">
        <EpicCompletionAuditReportPanel report={epic6CompletionAuditReport} />
      </div>
      <div id="codex-readiness-report" className="scroll-mt-28">
        <CodexReadinessReportPanel report={codexReadinessReport} />
      </div>
      <div id="codex-implementation-approval-report" className="scroll-mt-28">
        <CodexImplementationApprovalReportPanel report={codexImplementationApprovalReport} />
      </div>
      <div id="claude-review-readiness-report" className="scroll-mt-28">
        <ClaudeReviewReadinessReportPanel report={claudeReviewReadinessReport} />
      </div>
      <div id="claude-review-approval-report" className="scroll-mt-28">
        <ClaudeReviewApprovalReportPanel report={claudeReviewApprovalReport} />
      </div>
      <div id="delivery-readiness-policy-report" className="scroll-mt-28">
        <DeliveryReadinessPolicyReportPanel report={deliveryReadinessPolicyReport} />
      </div>
      <RoutingFleetPanel workers={workers} laneProfiles={laneProfiles} />
    </Shell>
  );
}
