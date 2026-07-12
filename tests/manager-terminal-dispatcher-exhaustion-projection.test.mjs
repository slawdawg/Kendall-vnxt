import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCyclePacket,
  buildPreflight,
  ledgerCommand,
} from "../scripts/lib/manager-control-plane/core.mjs";

const RUN_ID = "manager-terminal-dispatcher-test";
const SOURCE_IDENTITY = "prd:_bmad-output/planning-artifacts/prds/prd-terminal-dispatcher-test/prd.md";
const SOURCE_REVISION = `git:${"8".repeat(40)}`;
const EVENT_ID = `manager-terminal-event:${"a".repeat(40)}`;
const EMPTY_DISPATCH_BLOCKERS = [
  "no dispatchable safe backlog lane found",
  "No dispatchable safe backlog lane is ready to preview.",
];

function terminalBundle({ canonicalProof = true } = {}) {
  return {
    sourceIdentity: SOURCE_IDENTITY,
    sourceRevision: SOURCE_REVISION,
    fullyReconciled: true,
    noSeparatelyApprovedSource: true,
    reconciliationCounts: {
      totalItems: 1,
      reconciledItems: 1,
      eligible: 0,
      queued: 0,
      leased: 0,
      running: 0,
      reviewFix: 0,
      requiredRetrospective: 0,
      otherwiseRequired: 0,
      completed: 1,
      closed: 0,
      approvalGated: 0,
    },
    unresolvedApprovalGatedWork: [],
    evidenceRefs: ["evidence:terminal-dispatcher-test"],
    resumeRequirement: "Continue only after a new accepted source-owned bundle is available.",
    nextManagerAction: "Stop without dispatch, refill, worker launch, or successor work.",
    ...(canonicalProof
      ? {
          canonicalEventIntegration: "supervisor_canonical_event",
          supervisorEvent: {
            eventId: EVENT_ID,
            evidenceRef: `supervisor-event:${EVENT_ID}`,
            status: "persisted",
            persistedAt: "2026-07-12T14:28:15.078Z",
            metadataOnly: true,
            rawPayloadRetained: false,
          },
        }
      : {}),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function dispatchPreview({ active = 0, queued = 0, extraBlocker = null } = {}) {
  const blockers = [...EMPTY_DISPATCH_BLOCKERS, ...(extraBlocker ? [extraBlocker] : [])];
  return {
    ok: false,
    status: "blocked",
    summary: {
      allowed: false,
      counts: {
        total: 1,
        dispatchable: 0,
        queued,
        active,
        blocked: 1,
        closed: 1,
      },
      candidateStateCounts: { assignable: 0, queued, active, blocked: 1, closed: 1 },
      dispatch: { allowed: false, blockers },
      blockers,
      mutation: "none; dry-run summary only",
      rawPayloadRetained: false,
    },
    blockers: blockers.map((message) => ({ message })),
    warnings: [],
    nextActions: [],
  };
}

function seedStateRoot() {
  const stateRoot = mkdtempSync(join(tmpdir(), "manager-terminal-dispatcher-"));
  ledgerCommand({ command: "init", runId: RUN_ID, stateRoot });
  const runRoot = join(stateRoot, "manager-runs", RUN_ID);
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(join(runRoot, "dispatcher-summary.json"), JSON.stringify({
    stateSource: "dispatcher-summary-fixture",
    freshness: "fresh",
    currentPhase: "blocked",
    nextAction: "No dispatchable safe backlog lane is ready to preview.",
    updatedAt: "2026-07-12T14:28:15.078Z",
    counts: { queued: 0, active: 0, blocked: 1, failed: 0 },
    rawPayloadRetained: false,
  }, null, 2));
  return stateRoot;
}

function injectedContext(overrides = {}) {
  const preview = overrides.dispatchPreview || dispatchPreview();
  return {
    usageContext: { status: "normal" },
    resourceContext: { status: "normal" },
    assignmentSummary: {
      summary: {
        backlogStatusCounts: { assignable: 0, active: 0, closed: 1 },
        laneAssignmentStatusCounts: { claimed: 0 },
        workspaceAssignmentStatusCounts: { active: 0 },
      },
    },
    dispatchPreview: preview,
    authoritativeBacklogExhaustion: true,
    authoritativeSourceBundle: terminalBundle(),
    activeSource: {
      sourceIdentity: SOURCE_IDENTITY,
      sourceRevision: SOURCE_REVISION,
      sourceRefs: [SOURCE_IDENTITY],
    },
    sourceRefs: [SOURCE_IDENTITY],
    refillCandidates: [],
    gitRunner: (_command, args) => {
      if (args.includes("--show-toplevel")) return { status: 0, stdout: "/workspace/Kendall_Nxt\n", stderr: "" };
      if (args.includes("--abbrev-ref")) return { status: 0, stdout: "dev\n", stderr: "" };
      if (args.includes("--short")) return { status: 0, stdout: "## dev...origin/dev\n", stderr: "" };
      if (args.includes("HEAD")) return { status: 0, stdout: "267aed59d76896c6df098596c069d4ebfcf2ac54\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    ghRunner: () => ({ status: 0, stdout: "gh version 2.46.0\n", stderr: "" }),
    tmuxContext: {
      tmuxResult: {
        ok: true,
        panes: [{
          sessionName: "unmanaged",
          windowIndex: "1",
          windowName: "node",
          paneIndex: "1",
          paneId: "%1",
          currentPath: "/tmp/unmanaged",
          currentCommand: "node",
        }],
        error: "",
      },
      workspaceResult: { manifests: [], manifestErrors: [] },
    },
    staleOwnerInspection: {
      ok: true,
      status: "attention",
      summary: {
        runId: RUN_ID,
        targetCount: 12,
        cleanupCandidateCount: 0,
        dirtyWorkspaceCount: 12,
        takeoverApprovalCandidateCount: 0,
        inspections: [],
      },
      blockers: [],
      warnings: [{
        code: "dirty-stale-owner-workspaces",
        message: "12 stale owner workspace(s) have dirty worktree evidence that must be preserved before apply or cleanup.",
      }],
    },
    ...overrides,
    dispatchPreview: preview,
  };
}

function staleAssignmentSummary() {
  const blockedLaneAssignments = Array.from({ length: 9 }, (_, index) => ({
    assignmentId: `stale-lane-${index + 1}`,
    status: "blocked_stale_owner_needs_takeover",
  }));
  const blockedWorkspaceAssignments = Array.from({ length: 13 }, (_, index) => ({
    taskId: `stale-workspace-${index + 1}`,
    status: "blocked_stale_owner_needs_takeover",
  }));
  return {
    summary: {
      backlogStatusCounts: { assignable: 0, active: 0, closed: 1 },
      laneAssignmentStatusCounts: { blocked_stale_owner_needs_takeover: blockedLaneAssignments.length },
      workspaceAssignmentStatusCounts: { blocked_stale_owner_needs_takeover: blockedWorkspaceAssignments.length },
      blockedLaneAssignments,
      blockedWorkspaceAssignments,
    },
  };
}

test("validated terminal exhaustion projects dispatcher preflight and cycle without empty-backlog blockers", () => {
  const stateRoot = seedStateRoot();
  try {
    const context = injectedContext();
    const preflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, context);

    assert.equal(preflight.status, "ready");
    assert.equal(preflight.ok, true);
    assert.equal(preflight.summary.dispatcher.status, "ready");
    assert.equal(preflight.summary.dispatcher.terminalState.status, "authoritative_backlog_exhausted");
    assert.equal(preflight.summary.dispatcher.dispatchApplyAllowed, false);
    assert.deepEqual(preflight.summary.dispatcher.blockers, []);
    assert.equal(preflight.blockers.some((blocker) => /^preflight-dispatcher-blocked(?:-2)?$/.test(blocker.code)), false);
    assert.ok(preflight.warnings.some((warning) => warning.code === "tmux-unmanaged-orientation-evidence"));
    assert.ok(preflight.warnings.some((warning) => warning.code === "dirty-stale-owner-workspaces"));
    for (const stopLine of ["no_dispatch_apply", "no_refill", "no_worker_launch", "no_epic_26_or_filler", "new_accepted_source_bundle_required"]) {
      assert.ok(preflight.summary.dispatcher.stopLines.includes(stopLine), stopLine);
    }

    const cycle = buildCyclePacket({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, { ...context, preflightStatus: preflight });
    assert.notEqual(cycle.status, "blocked");
    assert.equal(cycle.summary.dispatcher.status, "authoritative_backlog_exhausted");
    assert.equal(cycle.summary.dispatcher.allowed, false);
    assert.equal(cycle.summary.dispatcher.blockerCount, 0);
    assert.equal(cycle.blockers.some((blocker) => /^preflight-dispatcher-blocked(?:-2)?$/.test(blocker.code)), false);
    assert.equal(cycle.nextActions.some((action) => /dispatch-next.+--apply|manager-refill-plan.+--apply|manager-worker-warm/i.test(action.nextAction || "")), false);
    assert.deepEqual(preflight.summary.runway.candidateLanes, []);
    assert.equal(preflight.summary.runway.workCreationStep, null);
    assert.equal(preflight.summary.runway.noNewEpic, true);
    assert.equal(preflight.summary.runway.noPostSliceWork, true);
    assert.doesNotMatch(JSON.stringify({ preflight, cycle }), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("terminal cycle preserves stale ownership evidence without projecting assignment ambiguity as an operational blocker", () => {
  const stateRoot = seedStateRoot();
  try {
    const context = injectedContext({ assignmentSummary: staleAssignmentSummary() });
    const preflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, context);
    const cycle = buildCyclePacket({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, { ...context, preflightStatus: preflight });

    assert.equal(preflight.status, "ready");
    assert.equal(cycle.status, "ready");
    assert.equal(cycle.ok, true);
    assert.equal(cycle.summary.continuation.state, "terminal_waiting_for_new_source");
    assert.equal(cycle.summary.continuation.canContinue, false);
    assert.equal(cycle.summary.continuation.progressRunState, "terminal-waiting-for-new-source");
    assert.equal(cycle.summary.continuation.workerMutationAllowed, false);
    assert.equal(cycle.summary.continuation.workerStartAllowed, false);
    assert.equal(cycle.summary.continuation.dispatchApplyAllowed, false);
    assert.equal(cycle.summary.continuation.deliveryAllowed, false);
    assert.equal(cycle.summary.continuation.takeoverAllowed, false);
    assert.equal(cycle.summary.continuation.refillAllowed, false);
    assert.deepEqual(cycle.summary.continuation.allowedActions, ["status_reporting", "read_only_inspection"]);
    for (const action of ["worker_start", "worker_kill", "worker_answer", "lane_advance", "dispatch_apply", "delivery", "cleanup", "ownership_takeover", "refill", "source_intake"]) {
      assert.ok(cycle.summary.continuation.blockedActions.includes(action), action);
    }
    assert.equal(cycle.summary.continuation.blockedLaneAssignments, 9);
    assert.equal(cycle.summary.continuation.blockedWorkspaceAssignments, 13);
    assert.equal(cycle.summary.resume.blockedLaneAssignments.length, 9);
    assert.equal(cycle.summary.resume.blockedWorkspaceAssignments.length, 13);
    assert.equal(cycle.blockers.some((blocker) => blocker.code === "assignment-ambiguous-status"), false);
    assert.equal(cycle.summary.blockers.some((blocker) => blocker.code === "assignment-ambiguous-status"), false);
    assert.ok(cycle.warnings.some((warning) => warning.code === "terminal-stale-ownership-preserved"));
    assert.ok(cycle.warnings.some((warning) => warning.code === "dirty-stale-owner-workspaces"));
    assert.equal(cycle.nextActions.every((action) => ["terminal-waiting-for-new-source", "terminal-stale-ownership-status"].includes(action.code)), true);
    assert.doesNotMatch(JSON.stringify(cycle.nextActions), /--apply|worker-warm|worker-submit|worker-answer|cleanup-current|cleanup-merged/i);
    assert.equal(cycle.summary.runway.noNewEpic, true);
    assert.equal(cycle.summary.runway.noPostSliceWork, true);
    assert.doesNotMatch(JSON.stringify(cycle), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("assignment ambiguity remains blocking when terminal proof or zero-work evidence is absent", () => {
  const stateRoot = seedStateRoot();
  try {
    const missingProofContext = injectedContext({
      assignmentSummary: staleAssignmentSummary(),
      authoritativeSourceBundle: terminalBundle({ canonicalProof: false }),
    });
    const missingProofPreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, missingProofContext);
    const missingProofCycle = buildCyclePacket(
      { runId: RUN_ID, stateRoot, desiredWorkers: 6 },
      { ...missingProofContext, preflightStatus: missingProofPreflight },
    );
    assert.equal(missingProofCycle.status, "blocked");
    assert.notEqual(missingProofCycle.summary.continuation.state, "terminal_waiting_for_new_source");
    assert.ok(missingProofCycle.summary.continuation.blockerCodes.includes("assignment-ambiguous-status"));

    const inconsistentContext = injectedContext({ assignmentSummary: staleAssignmentSummary() });
    const inconsistentPreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, inconsistentContext);
    inconsistentPreflight.ok = false;
    const inconsistentCycle = buildCyclePacket(
      { runId: RUN_ID, stateRoot, desiredWorkers: 6 },
      { ...inconsistentContext, preflightStatus: inconsistentPreflight },
    );
    assert.equal(inconsistentCycle.status, "blocked");
    assert.notEqual(inconsistentCycle.summary.continuation.state, "terminal_waiting_for_new_source");
    assert.ok(inconsistentCycle.summary.continuation.blockerCodes.includes("assignment-ambiguous-status"));

    const activeContext = injectedContext({
      assignmentSummary: staleAssignmentSummary(),
      dispatchPreview: dispatchPreview({ active: 1 }),
    });
    const activePreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, activeContext);
    const activeCycle = buildCyclePacket(
      { runId: RUN_ID, stateRoot, desiredWorkers: 6 },
      { ...activeContext, preflightStatus: activePreflight },
    );
    assert.equal(activeCycle.status, "blocked");
    assert.notEqual(activeCycle.summary.continuation.state, "terminal_waiting_for_new_source");
    assert.ok(activeCycle.summary.continuation.blockerCodes.includes("assignment-ambiguous-status"));
    assert.doesNotMatch(JSON.stringify({ missingProofCycle, inconsistentCycle, activeCycle }), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("active work contradicting terminal evidence remains blocked", () => {
  const stateRoot = seedStateRoot();
  try {
    const context = injectedContext({ dispatchPreview: dispatchPreview({ active: 1 }) });
    const preflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, context);

    assert.equal(preflight.status, "blocked");
    assert.equal(preflight.summary.dispatcher.terminalState, null);
    assert.ok(preflight.blockers.some((blocker) => blocker.code === "authoritative-reconciliation-work-remains"));
    assert.equal(preflight.summary.runway.terminalDisposition, null);
    assert.doesNotMatch(JSON.stringify(preflight), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);

    const queuedContext = injectedContext({ dispatchPreview: dispatchPreview({ queued: 1 }) });
    const queuedPreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, queuedContext);
    assert.equal(queuedPreflight.status, "blocked");
    assert.equal(queuedPreflight.summary.dispatcher.terminalState, null);
    assert.ok(queuedPreflight.blockers.some((blocker) => blocker.code === "preflight-dispatcher-blocked"));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("missing canonical proof and unrelated dispatcher blockers remain fail closed", () => {
  const stateRoot = seedStateRoot();
  try {
    const unrelated = "dispatcher source integrity is stale";
    const missingProof = injectedContext({
      authoritativeSourceBundle: terminalBundle({ canonicalProof: false }),
      dispatchPreview: dispatchPreview(),
    });
    const missingProofPreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, missingProof);
    assert.equal(missingProofPreflight.status, "blocked");
    assert.ok(missingProofPreflight.blockers.some((blocker) => blocker.code === "missing_supervisor_contract"));
    assert.equal(missingProofPreflight.summary.dispatcher.terminalState, null);
    const forgedPreflight = structuredClone(missingProofPreflight);
    forgedPreflight.ok = true;
    forgedPreflight.status = "ready";
    forgedPreflight.blockers = [];
    forgedPreflight.summary.dispatcher.status = "ready";
    forgedPreflight.summary.dispatcher.blockers = [];
    forgedPreflight.summary.dispatcher.terminalState = {
      status: "authoritative_backlog_exhausted",
      canonicalEventIntegration: "supervisor_canonical_event",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
    const missingProofCycle = buildCyclePacket(
      { runId: RUN_ID, stateRoot, desiredWorkers: 6 },
      { ...missingProof, preflightStatus: forgedPreflight },
    );
    assert.notEqual(missingProofCycle.summary.dispatcher.status, "authoritative_backlog_exhausted");
    assert.ok(missingProofCycle.blockers.some((blocker) => blocker.code === "missing_supervisor_contract"));

    const unrelatedBlocker = injectedContext({ dispatchPreview: dispatchPreview({ extraBlocker: unrelated }) });
    const unrelatedPreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, unrelatedBlocker);
    assert.equal(unrelatedPreflight.status, "blocked");
    assert.equal(unrelatedPreflight.summary.dispatcher.terminalState.status, "authoritative_backlog_exhausted");
    assert.ok(unrelatedPreflight.summary.dispatcher.blockers.includes(unrelated));
    assert.ok(unrelatedPreflight.blockers.some((blocker) => blocker.message === unrelated));

    const misleading = "No safe backlog because dispatcher source integrity is stale";
    const misleadingBlocker = injectedContext({ dispatchPreview: dispatchPreview({ extraBlocker: misleading }) });
    const misleadingPreflight = buildPreflight({ runId: RUN_ID, stateRoot, desiredWorkers: 6 }, misleadingBlocker);
    assert.equal(misleadingPreflight.status, "blocked");
    assert.ok(misleadingPreflight.summary.dispatcher.blockers.includes(misleading));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
