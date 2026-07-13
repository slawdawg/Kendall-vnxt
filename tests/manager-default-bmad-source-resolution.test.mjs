import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const PRD_REF = BUNDLE_REF.slice("prd:".length);
const ARCHITECTURE_REF = `_bmad-output/planning-artifacts/architecture-${SOURCE_KEY}.md`;
const EPICS_REF = `_bmad-output/planning-artifacts/epics-${SOURCE_KEY}.md`;
const READINESS_REF = `_bmad-output/planning-artifacts/implementation-readiness-report-${SOURCE_KEY}.md`;
const SPRINT_STATUS_PATH = join(ARTIFACT_DIR, "sprint-status.yaml");
const ORIGINAL_SPRINT_STATUS = existsSync(SPRINT_STATUS_PATH)
  ? readFileSync(SPRINT_STATUS_PATH, "utf8")
  : null;

function writeFrontmatter(path, metadata, bodyMarker) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, ["---", ...metadata, "---", "", `# ${bodyMarker}`, "", `RAW BODY ${bodyMarker} MUST NOT CROSS`, ""].join("\n"));
}

function writeFixture({
  trackerStatus = "ready-for-dev",
  storyStatus = "ready-for-dev",
  sourceKey = SOURCE_KEY,
  bundleNames = [`prd-Kendall_Nxt-${SOURCE_KEY}`],
  story = true,
  architecture = true,
  epics = true,
  readiness = true,
  prdStatus = "final",
  prdAuthoritative = true,
  architectureStatus = "complete",
  epicsStatus = "complete",
  readinessStatus = "complete",
  architecturePrdRef = PRD_REF,
  epicsPrdRef = PRD_REF,
  epicsArchitectureRef = ARCHITECTURE_REF,
  readinessPrdRef = PRD_REF,
  readinessArchitectureRef = ARCHITECTURE_REF,
  readinessEpicsRef = EPICS_REF,
  readyStoryKeys = [STORY_KEY],
} = {}) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(SPRINT_STATUS_PATH, [
    `source_key: ${sourceKey}`,
    `source_ref: ${EPICS_REF}`,
    "development_status:",
    ...readyStoryKeys.map((storyKey) => `  ${storyKey}: ${storyKey === STORY_KEY ? trackerStatus : "ready-for-dev"}`),
    "",
  ].join("\n"));
  if (story) {
    writeFrontmatter(join(ARTIFACT_DIR, `${STORY_KEY}.md`), [`status: ${storyStatus}`], "Story 91.1: Default BMAD Source Resolution Fixture");
  }
  for (const bundleName of bundleNames) {
    const bundleDir = join(PRD_ROOT, bundleName);
    mkdirSync(bundleDir, { recursive: true });
    writeFrontmatter(join(bundleDir, "prd.md"), [`status: ${prdStatus}`, ...(prdAuthoritative ? ["authoritative: true"] : [])], "Fixture PRD");
  }
  if (architecture) writeFrontmatter(ARCHITECTURE_REF, ["workflowType: architecture", `status: ${architectureStatus}`, `authoritative_prd: ${architecturePrdRef}`], "Fixture Architecture");
  if (epics) writeFrontmatter(EPICS_REF, ["workflowType: epics-and-stories", `status: ${epicsStatus}`, `authoritative_prd: ${epicsPrdRef}`, `authoritative_architecture: ${epicsArchitectureRef}`], "Fixture Epics");
  if (readiness) writeFrontmatter(READINESS_REF, ["workflowType: implementation-readiness", `status: ${readinessStatus}`, `authoritative_prd: ${readinessPrdRef}`, `authoritative_architecture: ${readinessArchitectureRef}`, `authoritative_epics: ${readinessEpicsRef}`], "Fixture Readiness");
}

function cleanupFixture() {
  if (ORIGINAL_SPRINT_STATUS === null) {
    rmSync(SPRINT_STATUS_PATH, { force: true });
  } else {
    writeFileSync(SPRINT_STATUS_PATH, ORIGINAL_SPRINT_STATUS);
  }
  rmSync(join(ARTIFACT_DIR, `${STORY_KEY}.md`), { force: true });
  rmSync(join(ARTIFACT_DIR, "91-2-second-ready-story.md"), { force: true });
  rmSync(ARCHITECTURE_REF, { force: true });
  rmSync(EPICS_REF, { force: true });
  rmSync(READINESS_REF, { force: true });
  rmSync(`_bmad-output/planning-artifacts/architecture-${SOURCE_KEY}-duplicate.md`, { force: true });
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

test("default BMAD resolution can read a disposable injected root without overlaying canonical planning state", () => {
  const root = mkdtempSync(join(tmpdir(), "kendall-default-bmad-root-"));
  try {
    const sprintPath = join(root, SPRINT_STATUS_PATH);
    mkdirSync(join(sprintPath, ".."), { recursive: true });
    writeFileSync(sprintPath, `source_key: ${SOURCE_KEY}\nsource_ref: ${EPICS_REF}\ndevelopment_status:\n  ${STORY_KEY}: ready-for-dev\n`);
    writeFrontmatter(join(root, ARTIFACT_DIR, `${STORY_KEY}.md`), ["status: ready-for-dev"], "Isolated Story");
    writeFrontmatter(join(root, PRD_REF), ["status: final", "authoritative: true"], "Isolated PRD");
    writeFrontmatter(join(root, ARCHITECTURE_REF), ["workflowType: architecture", "status: complete", `authoritative_prd: ${PRD_REF}`], "Isolated Architecture");
    writeFrontmatter(join(root, EPICS_REF), ["workflowType: epics-and-stories", "status: complete", `authoritative_prd: ${PRD_REF}`, `authoritative_architecture: ${ARCHITECTURE_REF}`], "Isolated Epics");
    writeFrontmatter(join(root, READINESS_REF), ["workflowType: implementation-readiness", "status: complete", `authoritative_prd: ${PRD_REF}`, `authoritative_architecture: ${ARCHITECTURE_REF}`, `authoritative_epics: ${EPICS_REF}`], "Isolated Readiness");

    const canonicalBefore = existsSync(SPRINT_STATUS_PATH) ? readFileSync(SPRINT_STATUS_PATH) : null;
    const plan = refill({ sourceRefs: [BUNDLE_REF] }, { bmadRoot: root });
    assert.equal(plan.summary.sourceBackedPacketSeed.packetState, "eligible", JSON.stringify(plan.blockers));
    assert.equal(plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.storyKey, STORY_KEY);
    assert.equal(plan.summary.sourcePlanning.sprintStatus.exists, true);
    assert.equal(plan.summary.sourcePlanning.sprintStatus.path, SPRINT_STATUS_PATH);
    assert.deepEqual(existsSync(SPRINT_STATUS_PATH) ? readFileSync(SPRINT_STATUS_PATH) : null, canonicalBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test("an injected BMAD root cannot make external doc or runway refs source-owned", () => {
  const root = mkdtempSync(join(tmpdir(), "kendall-external-source-root-"));
  try {
    const externalDoc = `docs/${root.split("/").at(-1)}.md`;
    const externalRunway = `docs/${root.split("/").at(-1)}-development-runway.md`;
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, externalDoc), "# External doc\n");
    writeFileSync(join(root, externalRunway), "# External runway\n");

    for (const sourceRef of [`doc:${externalDoc}`, `runway:${externalRunway}`]) {
      const seed = buildSourceBackedPacketSeedPlan({
        runId: "external-source-authority-test",
        candidateId: "external-source-candidate",
        title: "External source candidate",
        sourceRefs: [sourceRef],
        acceptanceCriteria: ["External files remain ineligible."],
        verificationTargets: ["node --test tests/manager-default-bmad-source-resolution.test.mjs"],
        touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
        riskClass: "low",
        authorityClass: "allowed_unattended",
      }, { bmadRoot: root });
      assert.equal(seed.summary.packetState, "blocked");
      assert.deepEqual(seed.summary.seedPacket.sourceRefs, []);
      assert.deepEqual(seed.summary.seedPacket.rejectedSourceRefs, undefined);
      assert.ok(seed.blockers.some((blocker) => blocker.reason === "ambiguous_source"), JSON.stringify(seed.blockers));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an injected BMAD root rejects canonical source symlinks that escape its realpath", () => {
  const root = mkdtempSync(join(tmpdir(), "kendall-bmad-symlink-root-"));
  const outside = mkdtempSync(join(tmpdir(), "kendall-bmad-symlink-target-"));
  try {
    const prdRef = "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-symlink-escape/prd.md";
    const outsidePrd = join(outside, "prd.md");
    writeFrontmatter(outsidePrd, ["status: final", "authoritative: true"], "Escaped PRD");
    mkdirSync(join(root, prdRef, ".."), { recursive: true });
    symlinkSync(outsidePrd, join(root, prdRef));

    const seed = buildSourceBackedPacketSeedPlan({
      runId: "bmad-symlink-containment-test",
      candidateId: "bmad-symlink-candidate",
      title: "BMAD symlink candidate",
      sourceRefs: [`prd:${prdRef}`],
      acceptanceCriteria: ["Symlink escapes remain ineligible."],
      verificationTargets: ["node --test tests/manager-default-bmad-source-resolution.test.mjs"],
      touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
      riskClass: "low",
      authorityClass: "allowed_unattended",
    }, { bmadRoot: root });
    assert.equal(seed.summary.packetState, "blocked");
    assert.deepEqual(seed.summary.seedPacket.sourceRefs, []);
    assert.ok(seed.blockers.some((blocker) => blocker.reason === "ambiguous_source"), JSON.stringify(seed.blockers));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

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
    bundleSelection: "canonical_sprint_source_key",
    storyRef: STORY_REF,
    storyKey: STORY_KEY,
    storyStatus: "ready-for-dev",
    sprintStatusRef: `${ARTIFACT_DIR}/sprint-status.yaml`,
    sourceKey: SOURCE_KEY,
    bundleRef: BUNDLE_REF,
    prd: { ref: PRD_REF, status: "final", metadataDigest: plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.prd.metadataDigest },
    architecture: { ref: ARCHITECTURE_REF, status: "complete", metadataDigest: plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.architecture.metadataDigest },
    epics: { ref: EPICS_REF, status: "complete", metadataDigest: plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.epics.metadataDigest },
    implementationReadiness: { ref: READINESS_REF, status: "complete", metadataDigest: plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.implementationReadiness.metadataDigest },
    sprint: { ref: `${ARTIFACT_DIR}/sprint-status.yaml`, sourceKey: SOURCE_KEY, metadataDigest: plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.sprint.metadataDigest },
    story: { ref: `${ARTIFACT_DIR}/${STORY_KEY}.md`, key: STORY_KEY, status: "ready-for-dev", metadataDigest: plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.story.metadataDigest },
    metadataOnly: true,
    rawPayloadRetained: false,
  });
  for (const member of ["prd", "architecture", "epics", "implementationReadiness", "sprint", "story"]) {
    assert.match(plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance[member].metadataDigest, /^sha256:[0-9a-f]{64}$/);
  }
  assert.doesNotMatch(JSON.stringify(plan), /RAW BODY|Fixture Architecture|Fixture Epics|Fixture Readiness/);
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

test("default BMAD resolution fails closed for every missing ambiguity supersession mismatch and readiness case", async (t) => {
  const cases = [
    ["missing tracker", () => rmSync(SPRINT_STATUS_PATH, { force: true }), "default-bmad-source-sprint-status-missing"],
    ["missing source key", () => { writeFixture(); writeFileSync(SPRINT_STATUS_PATH, readFileSync(SPRINT_STATUS_PATH, "utf8").replace(`source_key: ${SOURCE_KEY}\n`, "")); }, "default-bmad-source-key-missing"],
    ["ambiguous source key", () => { writeFixture(); writeFileSync(SPRINT_STATUS_PATH, `${readFileSync(SPRINT_STATUS_PATH, "utf8")}source_key: conflicting-source\n`); }, "default-bmad-source-key-ambiguous"],
    ["missing PRD", () => { writeFixture(); rmSync(join(PRD_ROOT, `prd-Kendall_Nxt-${SOURCE_KEY}`), { recursive: true, force: true }); }, "default-bmad-source-bundle-missing"],
    ["superseded PRD", () => writeFixture({ prdStatus: "superseded" }), "default-bmad-source-prd-superseded"],
    ["non-authoritative PRD", () => writeFixture({ prdAuthoritative: false }), "default-bmad-source-prd-not-authoritative"],
    ["conflicting PRD metadata", () => { writeFixture(); writeFrontmatter(join(PRD_ROOT, `prd-Kendall_Nxt-${SOURCE_KEY}`, "prd.md"), ["status: final", "status: draft", "authoritative: true"], "Conflicting PRD"); }, "default-bmad-source-prd-conflicting"],
    ["missing architecture", () => writeFixture({ architecture: false }), "default-bmad-source-architecture-missing"],
    ["unready architecture", () => writeFixture({ architectureStatus: "draft" }), "default-bmad-source-architecture-not-ready"],
    ["ambiguous architecture", () => { writeFixture(); writeFrontmatter(`_bmad-output/planning-artifacts/architecture-${SOURCE_KEY}-duplicate.md`, ["workflowType: architecture", "status: complete", `authoritative_prd: ${PRD_REF}`], "Duplicate Architecture"); }, "default-bmad-source-architecture-ambiguous"],
    ["missing epics", () => writeFixture({ epics: false }), "default-bmad-source-epics-missing"],
    ["unready epics", () => writeFixture({ epicsStatus: "in-progress" }), "default-bmad-source-epics-not-ready"],
    ["epics architecture mismatch", () => writeFixture({ epicsArchitectureRef: "_bmad-output/planning-artifacts/architecture-wrong.md" }), "default-bmad-source-epics-mismatch"],
    ["missing readiness", () => writeFixture({ readiness: false }), "default-bmad-source-readiness-missing"],
    ["unready readiness", () => writeFixture({ readinessStatus: "in-progress" }), "default-bmad-source-readiness-not-ready"],
    ["readiness epics mismatch", () => writeFixture({ readinessEpicsRef: "_bmad-output/planning-artifacts/epics-wrong.md" }), "default-bmad-source-readiness-mismatch"],
    ["missing story", () => writeFixture({ story: false }), "default-bmad-source-story-missing"],
    ["not ready", () => writeFixture({ trackerStatus: "backlog", storyStatus: "backlog" }), "default-bmad-source-story-not-ready"],
    ["multiple ready stories", () => { writeFixture({ readyStoryKeys: [STORY_KEY, "91-2-second-ready-story"] }); writeFrontmatter(join(ARTIFACT_DIR, "91-2-second-ready-story.md"), ["status: ready-for-dev"], "Second Ready Story"); }, "default-bmad-source-story-ambiguous"],
    ["duplicate story identity", () => { writeFixture(); writeFileSync(SPRINT_STATUS_PATH, `${readFileSync(SPRINT_STATUS_PATH, "utf8")}  ${STORY_KEY}: ready-for-dev\n`); }, "default-bmad-source-story-ambiguous"],
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

test("canonical sprint metadata accepts quoted source keys and ready statuses", () => {
  writeFixture();
  const quoted = readFileSync(SPRINT_STATUS_PATH, "utf8")
    .replace(`source_key: ${SOURCE_KEY}`, `source_key: "${SOURCE_KEY}"`)
    .replace(`${STORY_KEY}: ready-for-dev`, `${STORY_KEY}: "ready-for-dev" # canonical quoted status`);
  writeFileSync(SPRINT_STATUS_PATH, quoted);
  assert.equal(refill().summary.sourceBackedPacketSeed.packetState, "eligible");
});

test("an explicit local PRD bundle ref has selection precedence but must match the canonical sprint source key", () => {
  writeFixture();
  const selected = refill({ sourceBundleRef: BUNDLE_REF });
  assert.equal(selected.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.bundleSelection, "explicit_source_bundle");
  assert.equal(selected.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance.bundleRef, BUNDLE_REF);

  const mismatched = refill({ sourceBundleRef: "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-other-source/prd.md" });
  assert.equal(mismatched.summary.sourceBackedPacketSeed, null);
  assert.ok(mismatched.blockers.some((blocker) => blocker.code === "default-bmad-source-explicit-bundle-mismatch"));
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
