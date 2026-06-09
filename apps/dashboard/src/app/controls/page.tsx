import { ControlPanel } from "../../components/control-panel";
import { DashboardE2EReportPanel } from "../../components/dashboard-e2e-report-panel";
import { DocumentationAuthorityReportPanel } from "../../components/documentation-authority-report-panel";
import { ExecutionReadinessReportPanel } from "../../components/execution-readiness-report-panel";
import { MaintenanceReadinessReportPanel } from "../../components/maintenance-readiness-report-panel";
import { OperatorProfilePanel } from "../../components/operator-profile-panel";
import { PageIntro } from "../../components/page-intro";
import { RoutingFleetPanel } from "../../components/routing-fleet-panel";
import { SafeDevelopmentBacklogPanel } from "../../components/safe-development-backlog-panel";
import { Shell } from "../../components/shell";
import { SupervisorReportCatalogPanel } from "../../components/supervisor-report-catalog-panel";
import { VerificationReadinessReportPanel } from "../../components/verification-readiness-report-panel";
import { buildNavStats } from "../../lib/nav-stats";
import {
  getDocumentationAuthorityReport,
  getDashboardE2EReport,
  getExecutionReadinessReport,
  getMaintenanceReadinessReport,
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
    dashboardE2EReport,
    reportCatalog,
    maintenanceReadinessReport,
    safeDevelopmentBacklog,
  ] = await Promise.all([
    getRunStatus(),
    getWorkItems(),
    getWorkerRegistry(),
    getRoutingLaneProfiles(),
    getExecutionReadinessReport(),
    getDocumentationAuthorityReport(),
    getVerificationReadinessReport(),
    getDashboardE2EReport(),
    getSupervisorReportCatalog(),
    getMaintenanceReadinessReport(),
    getSafeDevelopmentBacklogReport(),
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
      <ExecutionReadinessReportPanel report={readinessReport} />
      <DocumentationAuthorityReportPanel report={documentationAuthorityReport} />
      <VerificationReadinessReportPanel report={verificationReadinessReport} />
      <DashboardE2EReportPanel report={dashboardE2EReport} />
      <SupervisorReportCatalogPanel catalog={reportCatalog} />
      <MaintenanceReadinessReportPanel report={maintenanceReadinessReport} />
      <SafeDevelopmentBacklogPanel report={safeDevelopmentBacklog} />
      <RoutingFleetPanel workers={workers} laneProfiles={laneProfiles} />
    </Shell>
  );
}
