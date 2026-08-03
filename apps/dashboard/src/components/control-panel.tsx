"use client";

import { useState, useTransition } from "react";
import { pipelineOperationalActionContextDigestSha256V1, type PipelineOperationalActionApprovalRequestV1, type PipelineOperationalActionRequestV1, type RunStatusView } from "@kendall/contracts";

import {
  applyPipelineOperationalActionV1,
  issuePipelineOperationalApprovalV1,
  requestPipelineOperationalCapabilityV1,
} from "../lib/supervisor";

const actions = [
  { mode: "pause", label: "Pause", tone: "bg-[var(--surface)] text-[var(--foreground)] border border-[var(--line)]" },
  { mode: "drain", label: "Drain", tone: "bg-[var(--accent-2)] text-white" },
  { mode: "resume", label: "Resume", tone: "bg-[var(--accent)] text-white" },
] as const;

type RuntimeAction = (typeof actions)[number]["mode"];

function isAvailable(action: RuntimeAction, status: RunStatusView) {
  return action === "pause" ? status.mode === "running"
    : action === "drain" ? status.mode === "running" || status.mode === "paused"
      : status.mode === "paused" || status.mode === "draining";
}

function approvalRequest(actionId: RuntimeAction, status: RunStatusView): PipelineOperationalActionApprovalRequestV1 {
  const actionContext = actionId === "drain"
    ? { kind: "drain" as const, expectedRuntimeMode: status.mode, expectedRuntimeRevision: status.revision, expectedActiveWorkCount: status.activeWorkCount, expectedActiveLeaseCount: status.activeLeaseCount, expectedRunningAttemptCount: status.runningAttemptCount }
    : actionId === "pause"
      ? { kind: "pause" as const, expectedRuntimeMode: status.mode, expectedRuntimeRevision: status.revision }
      : { kind: "resume" as const, expectedRuntimeMode: status.mode as "paused" | "draining", expectedRuntimeRevision: status.revision };
  return {
    schemaVersion: "pipeline-operational-action/v1",
    actionId,
    targetType: "runtime",
    targetId: "supervisor-runtime",
    actionContext,
    actionContextDigestSha256: pipelineOperationalActionContextDigestSha256V1(actionId, "runtime", "supervisor-runtime", actionContext),
    requestedBy: { actorType: "operator", actorId: "pipeline-operator", actorLabel: "Pipeline operator" },
    requestedAuthorityState: "needs_authority_approval",
    requestedRiskTier: actionId === "drain" ? "medium" : "low",
    serverBound: true,
    metadataOnly: true,
    rawPayloadRetained: false,
  } as PipelineOperationalActionApprovalRequestV1;
}

export function ControlPanel({ status }: { status: RunStatusView }) {
  const [message, setMessage] = useState("No runtime action submitted yet.");
  const [pending, startTransition] = useTransition();

  function submit(actionId: RuntimeAction) {
    startTransition(async () => {
      try {
        const requested = approvalRequest(actionId, status);
        const capability = await requestPipelineOperationalCapabilityV1(requested);
        if (capability.capabilityState !== "available" || capability.authorityState !== "needs_authority_approval") {
          setMessage(`Runtime action unavailable: ${capability.typedReason ?? "the current state no longer permits it"}. Refreshing reports.`);
          window.setTimeout(() => window.location.reload(), 250);
          return;
        }
        const approval = await issuePipelineOperationalApprovalV1({ ...requested, actionContext: capability.actionContext, actionContextDigestSha256: capability.actionContextDigestSha256, requestedRiskTier: capability.riskTier } as PipelineOperationalActionApprovalRequestV1);
        const request = {
          schemaVersion: approval.schemaVersion,
          actionId: approval.actionId,
          targetType: approval.targetType,
          targetId: approval.targetId,
          actionContext: approval.actionContext,
          actionContextDigestSha256: approval.actionContextDigestSha256,
          idempotencyKey: `controls-ui-${crypto.randomUUID()}`,
          correlationId: crypto.randomUUID(),
          requestedBy: approval.requestedBy,
          requestedAuthorityState: approval.requestedAuthorityState,
          requestedRiskTier: approval.requestedRiskTier,
          approvalId: approval.approvalId,
          serverBound: true,
          evidenceRefs: ["operational-action:controls-v1"],
          metadataOnly: true,
          rawPayloadRetained: false,
        } as PipelineOperationalActionRequestV1;
        const result = await applyPipelineOperationalActionV1(request);
        setMessage(`${result.actionId}: ${result.outcome}; ${result.typedReason ?? "runtime state updated"}. Refreshing reports.`);
        window.setTimeout(() => window.location.reload(), 250);
      } catch (error) {
        setMessage(`${error instanceof Error ? error.message : "Runtime action failed."} Refreshing reports to obtain current runtime state.`);
        window.setTimeout(() => window.location.reload(), 250);
      }
    });
  }

  return <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
      {actions.map((action) => <button key={action.mode} type="button" className={`rounded-full px-5 py-3 text-sm font-semibold ${action.tone} disabled:opacity-50`} onClick={() => submit(action.mode)} disabled={pending || !isAvailable(action.mode, status)}>{pending ? "Working..." : action.label}</button>)}
    </div>
    <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
  </section>;
}
