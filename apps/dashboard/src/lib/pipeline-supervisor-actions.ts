import type {
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionApprovalV0,
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionResultV0,
} from "@kendall/contracts";

import {
  applyPipelineOperationalAction as applySupervisorPipelineOperationalAction,
  issuePipelineOperationalApproval as issueSupervisorPipelineOperationalApproval,
} from "./supervisor";

export async function requestPipelineOperationalApproval(
  payload: PipelineOperationalActionApprovalRequestV0,
): Promise<PipelineOperationalActionApprovalV0> {
  return issueSupervisorPipelineOperationalApproval(payload);
}

export async function applyPipelineOperationalAction(
  payload: PipelineOperationalActionRequestV0,
): Promise<PipelineOperationalActionResultV0> {
  return applySupervisorPipelineOperationalAction(payload);
}
