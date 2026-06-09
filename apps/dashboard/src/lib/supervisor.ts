import type {
  ApiEnvelope,
  DashboardE2EReportView,
  DocumentationAuthorityReportView,
  ExecutionAttemptView,
  ExecutionReadinessReportView,
  MaintenanceReadinessReportView,
  RuntimeEvidenceExportView,
  RoutingLaneEvidenceProfileView,
  RoutingPreviewView,
  RunStatusView,
  SafeDevelopmentBacklogReportView,
  SavedWorkItemView,
  SavedWorkItemViewPayload,
  SupervisorReportCatalogView,
  WorkItemBranchPreparationPayload,
  WorkItemAssignmentPayload,
  WorkItemFilterScope,
  WorkItemExecutionRecipeView,
  WorkItemManagedActionPayload,
  WorkItemRecipeGateAuditView,
  VerificationReadinessReportView,
  WorkflowEventView,
  WorkItemView,
  WorkerRegistryEntryView,
} from "@kendall/contracts";

const configuredPublicBaseUrl = process.env.NEXT_PUBLIC_SUPERVISOR_URL;
const publicBaseUrl = configuredPublicBaseUrl ?? "http://localhost:8000";
const internalBaseUrl = process.env.SUPERVISOR_INTERNAL_URL ?? publicBaseUrl;

export function getSupervisorBaseUrl(): string {
  if (typeof window === "undefined") {
    return publicBaseUrl;
  }

  if (!configuredPublicBaseUrl) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return configuredPublicBaseUrl;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${internalBaseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export async function getRunStatus(): Promise<RunStatusView> {
  return requestJson<RunStatusView>("/supervisor/status");
}

export async function getWorkItems(): Promise<WorkItemView[]> {
  return requestJson<WorkItemView[]>("/work-items");
}

export async function getWorkItem(id: string): Promise<WorkItemView> {
  return requestJson<WorkItemView>(`/work-items/${id}`);
}

export async function getWorkItemEvents(id: string): Promise<WorkflowEventView[]> {
  return requestJson<WorkflowEventView[]>(`/work-items/${id}/events`);
}

export async function getExecutionAttempts(workItemId: string): Promise<ExecutionAttemptView[]> {
  return requestJson<ExecutionAttemptView[]>(`/work-items/${workItemId}/execution-attempts`);
}

export async function getRuntimeEvidenceExport(workItemId: string): Promise<RuntimeEvidenceExportView> {
  return requestJson<RuntimeEvidenceExportView>(`/work-items/${workItemId}/runtime-evidence-export`);
}

export async function getExecutionRecipes(): Promise<WorkItemExecutionRecipeView[]> {
  return requestJson<WorkItemExecutionRecipeView[]>("/execution-recipes");
}

export async function getRecipeGateAudit(workItemId: string): Promise<WorkItemRecipeGateAuditView> {
  return requestJson<WorkItemRecipeGateAuditView>(`/work-items/${workItemId}/recipe-gate-audit`);
}

export async function getRoutingPreview(workItemId: string): Promise<RoutingPreviewView> {
  return requestJson<RoutingPreviewView>(`/work-items/${workItemId}/routing-preview`);
}

export async function getRoutingLaneProfiles(): Promise<RoutingLaneEvidenceProfileView[]> {
  return requestJson<RoutingLaneEvidenceProfileView[]>("/routing/lane-profiles");
}

export async function getExecutionReadinessReport(): Promise<ExecutionReadinessReportView> {
  return requestJson<ExecutionReadinessReportView>("/supervisor/execution-readiness-report");
}

export async function getDocumentationAuthorityReport(): Promise<DocumentationAuthorityReportView> {
  return requestJson<DocumentationAuthorityReportView>("/supervisor/documentation-authority-report");
}

export async function getVerificationReadinessReport(): Promise<VerificationReadinessReportView> {
  return requestJson<VerificationReadinessReportView>("/supervisor/verification-readiness-report");
}

export async function getDashboardE2EReport(): Promise<DashboardE2EReportView> {
  return requestJson<DashboardE2EReportView>("/supervisor/dashboard-e2e-report");
}

export async function getSupervisorReportCatalog(): Promise<SupervisorReportCatalogView> {
  return requestJson<SupervisorReportCatalogView>("/supervisor/report-catalog");
}

export async function getMaintenanceReadinessReport(): Promise<MaintenanceReadinessReportView> {
  return requestJson<MaintenanceReadinessReportView>("/supervisor/maintenance-readiness-report");
}

export async function getSafeDevelopmentBacklogReport(): Promise<SafeDevelopmentBacklogReportView> {
  return requestJson<SafeDevelopmentBacklogReportView>("/supervisor/safe-development-backlog");
}

export async function getWorkerRegistry(): Promise<WorkerRegistryEntryView[]> {
  return requestJson<WorkerRegistryEntryView[]>("/routing/worker-registry");
}

export async function getAuditEvents(): Promise<
  Array<{
    id: string;
    workItemId: string;
    reason: string;
    mode: string;
    outcome: string;
    createdAt: string;
  }>
> {
  return requestJson("/audit-events");
}

export async function getSavedOperatorViews(scope?: WorkItemFilterScope): Promise<SavedWorkItemView[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return requestJson<SavedWorkItemView[]>(`/operator-views${query}`);
}

export async function saveOperatorView(payload: SavedWorkItemViewPayload): Promise<SavedWorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/operator-views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to save operator view.");
  }
  const envelope = (await response.json()) as ApiEnvelope<SavedWorkItemView>;
  return envelope.data;
}

export async function setOperatorViewDefault(viewId: string, isDefault: boolean): Promise<SavedWorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/operator-views/${viewId}/default`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isDefault }),
  });
  if (!response.ok) {
    throw new Error("Unable to update the default operator view.");
  }
  const envelope = (await response.json()) as ApiEnvelope<SavedWorkItemView>;
  return envelope.data;
}

export async function deleteOperatorView(viewId: string): Promise<void> {
  const response = await fetch(`${getSupervisorBaseUrl()}/operator-views/${viewId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Unable to delete the operator view.");
  }
}

export async function assignWorkItem(workItemId: string, payload: WorkItemAssignmentPayload): Promise<WorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to update assignment.");
  }
  const envelope = (await response.json()) as ApiEnvelope<WorkItemView>;
  return envelope.data;
}

export async function prepareRecipeBranch(workItemId: string, payload: WorkItemBranchPreparationPayload): Promise<WorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/prepare-branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to prepare recipe branch.");
  }
  const envelope = (await response.json()) as ApiEnvelope<WorkItemView>;
  return envelope.data;
}

export async function executeManagedNextAction(workItemId: string, payload: WorkItemManagedActionPayload): Promise<WorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/managed-next-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { detail?: { error?: { message?: string } } }
      | null;
    throw new Error(errorPayload?.detail?.error?.message ?? "Unable to execute the managed next action.");
  }
  const envelope = (await response.json()) as ApiEnvelope<WorkItemView>;
  return envelope.data;
}
