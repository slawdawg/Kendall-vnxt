import { ControlPanel } from "../../components/control-panel";
import { AuthorityReadinessMatrixReportPanel } from "../../components/authority-readiness-matrix-report-panel";
import { DashboardE2EReportPanel } from "../../components/dashboard-e2e-report-panel";
import { DeliveryReadinessPolicyReportPanel } from "../../components/delivery-readiness-policy-report-panel";
import { DocumentationAuthorityReportPanel } from "../../components/documentation-authority-report-panel";
import { ExecutionReadinessReportPanel } from "../../components/execution-readiness-report-panel";
import { GitHubWorkflowPolicyReportPanel } from "../../components/github-workflow-policy-report-panel";
import { MaintenanceActionPlanReportPanel } from "../../components/maintenance-action-plan-report-panel";
import { MaintenanceReadinessReportPanel } from "../../components/maintenance-readiness-report-panel";
import { ManagedRecipePolicyReportPanel } from "../../components/managed-recipe-policy-report-panel";
import { OperatorProfilePanel } from "../../components/operator-profile-panel";
import { PageIntro } from "../../components/page-intro";
import { RoutingFleetPanel } from "../../components/routing-fleet-panel";
import { SafeDevelopmentBacklogPanel } from "../../components/safe-development-backlog-panel";
import { Shell } from "../../components/shell";
import { SupervisorReportCatalogPanel } from "../../components/supervisor-report-catalog-panel";
import { VerificationReadinessReportPanel } from "../../components/verification-readiness-report-panel";
import { buildNavStats } from "../../lib/nav-stats";
import {
  getAuthorityReadinessMatrixReport,
  getDocumentationAuthorityReport,
  getDashboardE2EReport,
  getDeliveryReadinessPolicyReport,
  getExecutionReadinessReport,
  getGitHubWorkflowPolicyReport,
  getMaintenanceActionPlanReport,
  getMaintenanceReadinessReport,
  getManagedRecipePolicyReport,
  getRoutingLaneProfiles,
  getRunStatus,
  getSafeDevelopmentBacklogReport,
  getSupervisorReportCatalog,
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
    safeDevelopmentBacklog,
    managedRecipePolicyReport,
    githubWorkflowPolicyReport,
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
    getSafeDevelopmentBacklogReport(),
    getManagedRecipePolicyReport(),
    getGitHubWorkflowPolicyReport(),
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
      <div id="safe-development-backlog" className="scroll-mt-28">
        <SafeDevelopmentBacklogPanel report={safeDevelopmentBacklog} />
      </div>
      <div id="managed-recipe-policy-report" className="scroll-mt-28">
        <ManagedRecipePolicyReportPanel report={managedRecipePolicyReport} />
      </div>
      <div id="github-workflow-policy-report" className="scroll-mt-28">
        <GitHubWorkflowPolicyReportPanel report={githubWorkflowPolicyReport} />
      </div>
      <div id="delivery-readiness-policy-report" className="scroll-mt-28">
        <DeliveryReadinessPolicyReportPanel report={deliveryReadinessPolicyReport} />
      </div>
      <RoutingFleetPanel workers={workers} laneProfiles={laneProfiles} />
    </Shell>
  );
}
