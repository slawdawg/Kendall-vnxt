import type {
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionApprovalV0,
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionResultV0,
  PipelineOperationalActionApprovalRequestV1,
  PipelineOperationalActionApprovalV1,
  PipelineOperationalActionCapabilityV1,
  PipelineOperationalActionRequestV1,
  PipelineOperationalActionResultV1,
} from "@kendall/contracts";

import {
  applyPipelineOperationalAction as applySupervisorPipelineOperationalAction,
  issuePipelineOperationalApproval as issueSupervisorPipelineOperationalApproval,
  applyPipelineOperationalActionV1 as applySupervisorPipelineOperationalActionV1,
  issuePipelineOperationalApprovalV1 as issueSupervisorPipelineOperationalApprovalV1,
  requestPipelineOperationalCapabilityV1 as requestSupervisorPipelineOperationalCapabilityV1,
} from "./supervisor";

export async function requestPipelineOperationalCapabilityV1(
  payload: PipelineOperationalActionApprovalRequestV1,
): Promise<PipelineOperationalActionCapabilityV1> {
  return requestSupervisorPipelineOperationalCapabilityV1(payload);
}

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

export async function requestPipelineOperationalApprovalV1(
  payload: PipelineOperationalActionApprovalRequestV1,
): Promise<PipelineOperationalActionApprovalV1> {
  return issueSupervisorPipelineOperationalApprovalV1(payload);
}

export async function applyPipelineOperationalActionV1(
  payload: PipelineOperationalActionRequestV1,
): Promise<PipelineOperationalActionResultV1> {
  return applySupervisorPipelineOperationalActionV1(payload);
}
