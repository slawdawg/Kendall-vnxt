import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildContinuousRunPlan,
  buildCyclePacket,
  buildRefillPlan,
  buildSourceBackedPacketSeedPlan,
} from "../scripts/lib/manager-control-plane/core.mjs";
import { runManagerSourceIntakeCycle } from "../scripts/manager-source-intake-cycle.mjs";

const ARTIFACT_DIR = "_bmad-output/implementation-artifacts";
const PRD_ROOT = "_bmad-output/planning-artifacts/prds";
const STORY_KEY = "91-1-default-bmad-source-resolution-fixture";
const SOURCE_KEY = "2099-01-01-default-bmad-source-resolution-fixture";
const STORY_REF = `story:${ARTIFACT_DIR}/${STORY_KEY}.md`;
const BUNDLE_REF = `prd:${PRD_ROOT}/prd-Kendall_Nxt-${SOURCE_KEY}/prd.md`;
const SPRINT_STATUS_PATH = join(ARTIFACT_DIR, "sprint-status.yaml");
const ORIGINAL_SPRINT_STATUS = existsSync(SPRINT_STATUS_PATH)
  ? readFileSync(SPRINT_STATUS_PATH, "utf8")
  : null;

function writeFixture({ trackerStatus = "ready-for-dev", storyStatus = "ready-for-dev", sourceKey = SOURCE_KEY, bundleNames = [`prd-Kendall_Nxt-${SOURCE_KEY}`], story = true } = {}) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(SPRINT_STATUS_PATH, [
    `source_key: ${sourceKey}`,
    `source_ref: _bmad-output/planning-artifacts/epics.md`,
    "development_status:",
    `  ${STORY_KEY}: ${trackerStatus}`,
    "",
  ].join("\n"));
  if (story) {
    writeFileSync(join(ARTIFACT_DIR, `${STORY_KEY}.md`), [
      `# Story 91.1: Default BMAD Source Resolution Fixture`,
      "",
      `Status: ${storyStatus}`,
      "",
    ].join("\n"));
  }
  for (const bundleName of bundleNames) {
    const bundleDir = join(PRD_ROOT, bundleName);
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(join(bundleDir, "prd.md"), "# Fixture PRD\n");
  }
}

function cleanupFixture() {
  if (ORIGINAL_SPRINT_STATUS === null) {
    rmSync(SPRINT_STATUS_PATH, { force: true });
  } else {
    writeFileSync(SPRINT_STATUS_PATH, ORIGINAL_SPRINT_STATUS);
  }
  rmSync(join(ARTIFACT_DIR, `${STORY_KEY}.md`), { force: true });
  for (const name of [`prd-Kendall_Nxt-${SOURCE_KEY}`, `prd-${SOURCE_KEY}`]) {
    rmSync(join(PRD_ROOT, name), { recursive: true, force: true });
  }
}

function managerContext() {
  return {
    assignmentSummary: {
      summary: {
        backlogStatusCounts: { assignable: 0, closed: 0 },
        laneAssignmentStatusCounts: { claimed: 0 },
        workspaceAssignmentStatusCounts: { active: 0 },
      },
    },
    dispatchPreview: {
      counts: { dispatchable: 0, active: 0, blocked: 0 },
      dispatch: { allowed: false },
    },
  };
}

function cycleContext() {
  return {
    ...managerContext(),
    preflightStatus: { status: "ready", summary: { ok: true }, blockers: [], warnings: [] },
    usageContext: { status: "normal" },
    resourceContext: { status: "normal" },
    tmuxSummary: { available: true, paneCount: 0, managerOwnedPanes: 0, unmanagedPanes: 0, takeoverRequiredPanes: 0 },
    cleanupPlan: { status: "ready", summary: { mutationMode: "none", rawPayloadRetained: false }, blockers: [], warnings: [], nextActions: [] },
    deliveryPlan: { status: "ready", summary: { mutationMode: "none", rawPayloadRetained: false }, blockers: [], warnings: [], nextActions: [] },
    recoveryPlan: { status: "ready", summary: { state: "not_requested" }, blockers: [], warnings: [], nextActions: [] },
    workerProgressStatus: { status: "ready", summary: { workerProgress: [] }, blockers: [], warnings: [], nextActions: [] },
    laneAdvanceStatus: { status: "ready", summary: { readyLaneCount: 0, readyLanes: [] }, blockers: [], warnings: [], nextActions: [] },
  };
}

function refill(overrides = {}, context = {}) {
  return buildRefillPlan(
    {
      runId: "manager-default-bmad-source-test",
      desiredWorkers: 1,
      supervisorUrl: "http://127.0.0.1:8000",
      ...overrides,
    },
    { ...managerContext(), ...context },
  );
}

test.beforeEach(cleanupFixture);
test.afterEach(cleanupFixture);

test("default refill and cycle resolve one ready BMAD story with matching bundle provenance", () => {
  writeFixture();

  const plan = refill();
  assert.equal(plan.status, "refill_needed");
  assert.equal(plan.summary.sourceBackedPacketSeed.packetState, "eligible");
  assert.equal(plan.summary.refillWatermark.queuedCount, 0);
  assert.equal(plan.nextActions.some((action) => action.dispatcherRefillAction), false);
  assert.deepEqual(plan.summary.sourceBackedPacketSeed.seedPacket.sourceRefs, [STORY_REF]);
  assert.deepEqual(plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance, {
    mode: "default_local_bmad",
    storyRef: STORY_REF,
    storyKey: STORY_KEY,
    storyStatus: "ready-for-dev",
    sprintStatusRef: `${ARTIFACT_DIR}/sprint-status.yaml`,
    sourceKey: SOURCE_KEY,
    bundleRef: BUNDLE_REF,
    metadataOnly: true,
    rawPayloadRetained: false,
  });
  const intake = plan.nextActions.find((action) => action.code === "manager-source-intake-ready");
  assert.ok(intake);
  assert.match(intake.dryRunCommand, /--source-bundle-ref/);
  assert.match(intake.dryRunCommand, /--source-story-key/);
  assert.match(intake.dryRunCommand, /--dry-run$/);

  const cycle = buildCyclePacket(
    { runId: "manager-default-bmad-source-test", desiredWorkers: 1, supervisorUrl: "http://127.0.0.1:8000" },
    cycleContext(),
  );
  assert.equal(cycle.summary.runway.sourceBackedPacketSeed.seedPacket.sourceProvenance.bundleRef, BUNDLE_REF);
  assert.ok(cycle.nextActions.some((action) => action.code === "manager-source-intake-ready"));
  assert.equal(cycle.summary.continuation.sourceIntakeAllowed, true);
  const continuous = buildContinuousRunPlan(
    { runtimeMode: "continuous_dry_run" },
    {
      cyclePacket: {
        ok: true,
        status: "attention",
        summary: {
          run: { runId: "manager-default-bmad-source-test" },
          usage: { state: "normal" },
          resources: { state: "normal" },
          workers: { workerCounts: { active: 0, warm: 0, paused: 0 } },
          preflight: { status: "ready", blockerCount: 0 },
          continuation: { sourceIntakeAllowed: true },
        },
        blockers: [],
        warnings: [],
        nextActions: cycle.nextActions,
      },
    },
  );
  assert.equal(continuous.summary.selectedAction.code, "continuous-source-intake");
  assert.equal(continuous.summary.selectedAction.managerCapability, "sourceIntake");
  assert.equal(continuous.summary.applySelectedAction, null);
});

test("default BMAD resolution fails closed for missing ambiguous unready and mismatched local state", async (t) => {
  const cases = [
    ["missing tracker", () => rmSync(SPRINT_STATUS_PATH, { force: true }), "default-bmad-source-sprint-status-missing"],
    ["missing story", () => writeFixture({ story: false }), "default-bmad-source-story-missing"],
    ["not ready", () => writeFixture({ trackerStatus: "backlog", storyStatus: "backlog" }), "default-bmad-source-story-not-ready"],
    ["tracker story mismatch", () => writeFixture({ storyStatus: "in-progress" }), "default-bmad-source-story-status-mismatch"],
    ["bundle mismatch", () => writeFixture({ sourceKey: "different-source-key" }), "default-bmad-source-bundle-missing"],
    ["ambiguous bundle", () => writeFixture({ bundleNames: [`prd-Kendall_Nxt-${SOURCE_KEY}`, `prd-${SOURCE_KEY}`] }), "default-bmad-source-bundle-ambiguous"],
  ];

  for (const [name, setup, blockerCode] of cases) {
    await t.test(name, () => {
      cleanupFixture();
      setup();
      const plan = refill();
      assert.equal(plan.nextActions.some((action) => action.code === "manager-source-intake-ready"), false);
      assert.equal(plan.summary.sourceBackedPacketSeed, null);
      assert.ok(plan.blockers.some((blocker) => blocker.code === blockerCode), JSON.stringify(plan.blockers));
      assert.doesNotMatch(JSON.stringify(plan), /Fixture PRD|acceptance criteria|verification command/i);
    });
  }
});

test("explicit source-backed candidates keep precedence over default BMAD resolution", () => {
  writeFixture({ storyStatus: "in-progress" });
  const plan = refill({
    candidateId: "explicit-source-candidate",
    title: "Explicit source candidate",
    sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
    acceptanceCriteria: ["Explicit candidate remains authoritative."],
    verificationTargets: ["node --test tests/manager-default-bmad-source-resolution.test.mjs"],
    touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
    riskClass: "low",
    authorityClass: "allowed_unattended",
  });

  assert.equal(plan.summary.sourceBackedPacketSeed.packetState, "eligible");
  assert.equal(plan.summary.sourceBackedPacketSeed.seedPacket.candidateWorkPacketId, "explicit-source-candidate");
  assert.equal(plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance, undefined);
  assert.ok(plan.nextActions.some((action) => action.code === "manager-source-intake-ready"));
  assert.equal(plan.blockers.some((blocker) => blocker.code.startsWith("default-bmad-source-")), false);
});

test("precomputed explicit source eligibility keeps precedence over default BMAD resolution", () => {
  writeFixture({ storyStatus: "in-progress" });
  const explicitSeed = buildSourceBackedPacketSeedPlan({
    runId: "manager-default-bmad-source-test",
    candidateId: "precomputed-explicit-source-candidate",
    title: "Precomputed explicit source candidate",
    sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
    acceptanceCriteria: ["Precomputed explicit eligibility remains authoritative."],
    verificationTargets: ["node --test tests/manager-default-bmad-source-resolution.test.mjs"],
    touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
    riskClass: "low",
    authorityClass: "allowed_unattended",
  });
  const plan = refill({}, {
    sourceWorkEligibility: {
      status: "ready",
      summary: explicitSeed.summary.sourceWorkEligibility,
    },
  });

  assert.equal(plan.summary.sourceWorkEligibility.candidateWorkPackets[0].candidateWorkPacketId, "precomputed-explicit-source-candidate");
  assert.equal(plan.summary.defaultBmadSourceResolution, undefined);
  assert.equal(plan.blockers.some((blocker) => blocker.code.startsWith("default-bmad-source-")), false);
});

test("explicit dispatcher refill candidates keep precedence over default BMAD resolution", () => {
  writeFixture({ storyStatus: "in-progress" });
  const plan = refill({}, {
    sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
    refillCandidates: [{
      candidateId: "explicit-dispatcher-refill-candidate",
      title: "Explicit dispatcher refill candidate",
      sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
      dedupeKey: "explicit-dispatcher-refill-candidate",
      authorityClass: "allowed_unattended",
      verificationTargets: ["node --test tests/manager-default-bmad-source-resolution.test.mjs"],
      evidenceRefs: ["evidence:explicit-dispatcher-refill-candidate"],
    }],
  });

  assert.equal(plan.summary.refillWatermark.eligibleCandidates[0].candidateId, "explicit-dispatcher-refill-candidate");
  assert.equal(plan.summary.defaultBmadSourceResolution, undefined);
  assert.equal(plan.blockers.some((blocker) => blocker.code.startsWith("default-bmad-source-")), false);
});

test("source intake cycle revalidates and preserves projected default BMAD provenance", async () => {
  writeFixture();
  let fetchCalls = 0;
  const result = await runManagerSourceIntakeCycle([
    "--run-id", "manager-default-bmad-source-test",
    "--candidate-id", `bmad-story-${STORY_KEY}`,
    "--title", "Default BMAD Source Resolution Fixture",
    "--source-ref", STORY_REF,
    "--acceptance-criterion", "Resolved local BMAD story and source bundle remain ready and identity-matched.",
    "--verification-target", "node --test tests/manager-default-bmad-source-resolution.test.mjs",
    "--touched-surface", "scripts/lib/manager-control-plane/core.mjs",
    "--risk-class", "low",
    "--authority-class", "allowed_unattended",
    "--source-bundle-ref", BUNDLE_REF,
    "--source-story-key", STORY_KEY,
    "--source-story-status", "ready-for-dev",
    "--source-sprint-status-ref", `${ARTIFACT_DIR}/sprint-status.yaml`,
    "--source-key", SOURCE_KEY,
    "--supervisor-url", "http://127.0.0.1:8000",
    "--dry-run",
  ], { fetchImpl: async () => { fetchCalls += 1; } });

  assert.equal(fetchCalls, 0);
  assert.equal(result.summary.packetState, "eligible");
  assert.equal(result.summary.seedPacket.sourceProvenance.bundleRef, BUNDLE_REF);
  assert.equal(result.summary.sourceIntakePlan.sourceRef, STORY_REF);
  assert.equal(result.summary.sourceIntakePlan.metadataOnly, true);
});
