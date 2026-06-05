import type { BmadLane, WorkflowState } from "./workflow";

export interface SupervisorEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  workItemId?: string;
  workflowRunId?: string;
  correlationId: string;
  actorType: string;
  actorId?: string;
  actorLabel?: string;
  payload: {
    state?: WorkflowState;
    lane?: BmadLane | null;
    summary?: string;
    [key: string]: unknown;
  };
}
