import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContinuousRunPlan,
  buildCyclePacket,
  buildRefillPlan,
  parseCommonArgs,
} from "../scripts/lib/manager-control-plane/core.mjs";
import { executeContinuousSelectedAction } from "../scripts/manager-run-loop.mjs";

const SEED_OPTIONS = {
  runId: "continuous-source-intake-test",
  desiredWorkers: 1,
  candidateId: "continuous-source-candidate",
  title: "Continuous source intake candidate",
  sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
  acceptanceCriteria: ["The source seed reaches authoritative WorkPacket truth."],
  verificationTargets: ["node --test tests/manager-continuous-source-intake.test.mjs"],
  touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
  riskClass: "low",
  authorityClass: "allowed_unattended",
};

function refill(options = {}, context = {}) {
  return buildRefillPlan(
    { ...SEED_OPTIONS, ...options },
    {
      assignmentSummary: {
        summary: {
          backlogStatusCounts: { assignable: 0, closed: 0 },
          laneAssignmentStatusCounts: { claimed: 0 },
          workspaceAssignmentStatusCounts: { active: 0 },
        },
      },
      ...context,
    },
  );
}

function cyclePacket(nextActions, continuation = {}) {
  return {
    ok: true,
    status: "attention",
    summary: {
      run: { runId: SEED_OPTIONS.runId },
      usage: { state: "normal" },
      resources: { state: "normal" },
      workers: { workerCounts: { active: 0, warm: 0, paused: 0 } },
      preflight: { status: "ready", blockerCount: 0 },
      continuation,
    },
    blockers: [],
    warnings: [],
    nextActions,
  };
}

function actualCycleContext() {
  return {
    preflightStatus: { status: "ready", summary: { ok: true }, blockers: [], warnings: [] },
    assignmentSummary: {
      summary: {
        backlogStatusCounts: { assignable: 0, closed: 0 },
        laneAssignmentStatusCounts: { claimed: 0 },
        workspaceAssignmentStatusCounts: { active: 0 },
      },
    },
    sourceRefs: SEED_OPTIONS.sourceRefs,
    sourcePlanningState: { sprintStatus: { exists: false, storyStatuses: {} } },
    tmuxSummary: { available: true, paneCount: 0, managerOwnedPanes: 0, unmanagedPanes: 0, takeoverRequiredPanes: 0 },
    cleanupPlan: { status: "ready", summary: { mutationMode: "none", rawPayloadRetained: false }, blockers: [], warnings: [], nextActions: [] },
    deliveryPlan: { status: "ready", summary: { mutationMode: "none", rawPayloadRetained: false }, blockers: [], warnings: [], nextActions: [] },
    recoveryPlan: { status: "ready", summary: { state: "not_requested" }, blockers: [], warnings: [], nextActions: [] },
    workerProgressStatus: { status: "ready", summary: { workerProgress: [] }, blockers: [], warnings: [], nextActions: [] },
    laneAdvanceStatus: { status: "ready", summary: { readyLaneCount: 0, readyLanes: [] }, blockers: [], warnings: [], nextActions: [] },
  };
}

test("refill and continuous planning project source intake only with one eligible seed and explicit loopback URL", () => {
  assert.equal(parseCommonArgs([]).supervisorUrl, "");
  assert.throws(() => parseCommonArgs(["--supervisor-url", "https://supervisor.example.com"]), /loopback/);
  const defaultRefill = refill();
  assert.equal(defaultRefill.nextActions.some((action) => action.code === "manager-source-intake-ready"), false);

  const plannedRefill = refill({ supervisorUrl: "http://127.0.0.1:8000" });
  const intake = plannedRefill.nextActions.find((action) => action.code === "manager-source-intake-ready");
  assert.ok(intake);
  assert.match(intake.dryRunCommand, /manager-source-intake-cycle\.mjs .*--dry-run$/);
  assert.match(intake.applyCommand, /manager-source-intake-cycle\.mjs .*--apply$/);
  assert.equal(intake.dryRunCommand.includes(" --apply"), false);
  assert.equal(intake.targetComponents.length, 4);

  const continuous = buildContinuousRunPlan(
    { runtimeMode: "continuous_dry_run" },
    { cyclePacket: cyclePacket(plannedRefill.nextActions, { sourceIntakeAllowed: true }) },
  );
  assert.equal(continuous.summary.selectedAction.code, "continuous-source-intake");
  assert.equal(continuous.summary.selectedAction.managerCapability, "sourceIntake");
  assert.equal(continuous.summary.selectedAction.applyCommand, undefined);
  assert.equal(continuous.summary.applySelectedAction, null);
});

test("manager cycle selects the explicit source-intake action without fetching", () => {
  const cycle = buildCyclePacket(
    { ...SEED_OPTIONS, supervisorUrl: "http://127.0.0.1:8000" },
    actualCycleContext(),
  );
  const intake = cycle.nextActions.find((action) => action.code === "manager-source-intake-ready");
  assert.ok(intake);
  assert.equal(cycle.summary.runway.sourceBackedPacketSeed.packetState, "eligible");
  assert.equal(cycle.summary.continuation.sourceIntakeAllowed, true);
  assert.match(intake.dryRunCommand, /--dry-run$/);
  assert.match(intake.applyCommand, /--apply$/);
});

test("non-eligible ambiguous review dedupe and blocked source states never project intake", () => {
  const cases = [
    ["missing-source", { sourceRefs: ["doc:docs/workflows/not-present.md"] }, {}],
    ["needs-review", {}, { sourceArtifacts: [{ ref: SEED_OPTIONS.sourceRefs[0], ownershipBoundary: "bmad_local_planning_state", freshness: "stale" }] }],
    ["dedupe", {}, { existingCandidateWorkPackets: [{ candidateWorkPacketId: "existing", sourceRefs: SEED_OPTIONS.sourceRefs, acceptanceCriteria: SEED_OPTIONS.acceptanceCriteria, touchedSurfaceHint: SEED_OPTIONS.touchedSurfaceHint }] }],
    ["blocked", { sourceRefs: ["runtime:manager-runs/test/events.ndjson"] }, { sourceArtifacts: [{ ref: "runtime:manager-runs/test/events.ndjson", sourceType: "runtime_state" }] }],
  ];
  for (const [name, options, context] of cases) {
    const plan = refill({ supervisorUrl: "http://127.0.0.1:8000", ...options }, context);
    assert.equal(plan.nextActions?.some((action) => action.code === "manager-source-intake-ready") || false, false, name);
  }
  assert.equal(refill({ supervisorUrl: "https://supervisor.example.com" }).nextActions.some((action) => action.code === "manager-source-intake-ready"), false);
});

test("continuous apply requires sourceIntake capability and exact dry-run/apply target pairing", () => {
  const plannedRefill = refill({ supervisorUrl: "http://127.0.0.1:8000" });
  const applyPlan = buildContinuousRunPlan(
    { runtimeMode: "continuous_apply" },
    {
      cyclePacket: cyclePacket(plannedRefill.nextActions, { sourceIntakeAllowed: true }),
      preflight: { status: "ready", blockerCount: 0, blockers: [] },
    },
  );
  assert.equal(applyPlan.summary.applySelectedAction.code, "continuous-source-intake");
  assert.equal(applyPlan.summary.runtimeReadiness.selectedGate, "sourceIntake");

  const selected = applyPlan.summary.selectedAction;
  const matchedCommands = [];
  const matched = executeContinuousSelectedAction({
    selected,
    applySelected: applyPlan.summary.applySelectedAction,
    runCommand: (command) => {
      matchedCommands.push(command);
      return {
        ok: true,
        packet: {
          ok: true,
          status: "ready",
          blockers: [],
          summary: {
            continuousSelection: {
              code: selected.code,
              mutationClass: selected.mutationClass,
              targetComponents: selected.targetComponents,
              allowed: true,
              status: "ready",
            },
          },
        },
      };
    },
  });
  assert.equal(matched.ok, true);
  assert.equal(matchedCommands.length, 2);
  assert.match(matchedCommands[0], /--dry-run$/);
  assert.match(matchedCommands[1], /--apply$/);

  const applySelected = structuredClone(applyPlan.summary.applySelectedAction);
  applySelected.targetComponents = [...applySelected.targetComponents, "candidate:wrong-target"];
  const commands = [];
  const result = executeContinuousSelectedAction({
    selected,
    applySelected,
    runCommand: (command) => {
      commands.push(command);
      return { ok: true, packet: { ok: true, status: "ready", blockers: [] } };
    },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers[0].code, "continuous-selected-action-pair-mismatch");
  assert.equal(commands.length, 1, "dry-run may execute, apply must not");

  const capabilityBlocked = buildContinuousRunPlan(
    { runtimeMode: "continuous_apply" },
    {
      cyclePacket: cyclePacket(plannedRefill.nextActions, { sourceIntakeAllowed: true }),
      preflight: { status: "ready", blockerCount: 0, blockers: [] },
      managerCapabilityPosture: { sourceIntake: { state: "blocked", reasonCodes: ["operator_hold"], safeFallbacks: ["heartbeat_reporting"] } },
    },
  );
  assert.equal(capabilityBlocked.summary.selectedAction?.code === "continuous-source-intake", false);
  assert.ok(capabilityBlocked.summary.capabilityHolds.heldActions.some((action) => action.managerCapability === "sourceIntake"));
});
