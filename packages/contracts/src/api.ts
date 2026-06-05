import type {
  AuditFilterMode,
  BmadLane,
  RiskLevel,
  RunMode,
  WorkItemFilterScope,
  WorkflowAction,
  WorkflowState,
} from "./workflow";

export interface WorkItemPayload {
  title: string;
  requestedOutcome: string;
  source: string;
  details?: string | null;
  riskLevel?: RiskLevel;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface WorkItemView extends WorkItemPayload {
  id: string;
  state: WorkflowState;
  lane: BmadLane | null;
  assigneeId?: string | null;
  assigneeLabel?: string | null;
  ageMinutes: number;
  needsAttention: boolean;
  attentionReason?: string | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  escalatedByLabel?: string | null;
  statusSummary: string;
  blockedReason: string | null;
  nextStep: string | null;
  createdAt: string;
  updatedAt: string;
  lastEventAt: string;
  requiresAudit: boolean;
  auditMode: "none" | "advisory" | "required";
}

export interface RunStatusView {
  mode: RunMode;
  pollIntervalSeconds: number;
  queueCount: number;
  activeCount: number;
  blockedCount: number;
  doneCount: number;
  summary: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, string | number | boolean | null>;
}

export interface WorkItemActionPayload {
  action: WorkflowAction;
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkflowEventView {
  id: string;
  workItemId: string;
  eventType: string;
  actorType: string;
  actorId?: string | null;
  actorLabel?: string | null;
  correlationId: string;
  summary: string;
  payload: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
}

export interface OperatorProfile {
  actorId: string;
  actorLabel: string;
}

export interface WorkItemAssignmentPayload {
  assigneeId?: string | null;
  assigneeLabel?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemEscalationPayload {
  reason?: string | null;
  clear?: boolean;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemFilterView {
  query: string;
  risk: "all" | RiskLevel;
  audit: AuditFilterMode;
  source: string;
}

export interface SavedWorkItemView {
  id: string;
  name: string;
  scope: WorkItemFilterScope;
  filters: WorkItemFilterView;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedWorkItemViewPayload {
  name: string;
  scope: WorkItemFilterScope;
  filters: WorkItemFilterView;
}
