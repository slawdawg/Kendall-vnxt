import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

const contractPath = new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url);
const corePath = new URL("../packages/workflow-core/src/pipeline-control-plane/index.ts", import.meta.url);
const contractsIndexPath = new URL("../packages/contracts/src/index.ts", import.meta.url);
const workflowCoreIndexPath = new URL("../packages/workflow-core/src/index.ts", import.meta.url);
const dashboardSupervisorPath = new URL("../apps/dashboard/src/lib/supervisor.ts", import.meta.url);
const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));

test("authoritative pipeline control plane lifecycle contracts are namespaced and metadata-only", async () => {
  const [contractSource, coreSource, contractsIndex, workflowCoreIndex] = await Promise.all([
    readFile(contractPath, "utf8"),
    readFile(corePath, "utf8"),
    readFile(contractsIndexPath, "utf8"),
    readFile(workflowCoreIndexPath, "utf8"),
  ]);

  for (const stage of ["capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"]) {
    assert.match(contractSource, new RegExp(`"${stage}"`));
    assert.match(coreSource, new RegExp(`"${stage}"`));
  }

  for (const exportedName of [
    "AuthoritativePacketStage",
    "AuthoritativePacketSourceRef",
    "AuthoritativePacketLifecycleEvent",
    "AuthoritativeWorkPacketLifecycleView",
    "CreateAuthoritativeWorkPacketRequest",
    "TransitionAuthoritativeWorkPacketRequest",
    "PipelineDashboardProjectionV0",
    "PipelineProjectionSourceLabelV0",
    "PipelineProjectionFreshnessStateV0",
    "PipelineProjectionEmptyReasonV0",
    "PipelineBackendReachabilityV0",
    "PipelineFixtureModeV0",
    "PipelineTruthSummaryV0",
    "PipelineStageSummaryV0",
    "PipelineDashboardWorkPacketV0",
    "PipelineManagerSummaryV0",
    "PipelineQueueSummaryV0",
  ]) {
    assert.match(contractSource, new RegExp(`export (const|type|interface) ${exportedName}\\b`));
  }

  assert.match(contractSource, /AUTHORITATIVE_PACKET_STAGE_LABELS/);
  for (const projectionLiteral of [
    "live",
    "stale",
    "fixture",
    "simulated",
    "dry_run",
    "unavailable",
    "unknown",
    "healthy_empty",
    "source_exhausted",
    "cleanup_gated",
    "failure_budget_hit",
    "backend_unavailable",
    "projection_stale",
  ]) {
    assert.match(contractSource, new RegExp(`"${projectionLiteral}"`), `missing projection literal ${projectionLiteral}`);
  }
  assert.match(contractSource, /staleAfterSeconds:\s*number;/);
  assert.match(contractSource, /visibleLabelRequired:\s*true;/);
  assert.match(contractSource, /canSatisfyLiveProof:\s*false;/);
  assert.match(contractSource, /activeLeaseCount:\s*number \| null;/);
  assert.match(contractSource, /activeWorkerCount:\s*number \| null;/);
  assert.match(contractSource, /warmWorkerCount:\s*number \| null;/);
  assert.match(contractSource, /dispatchableCount:\s*number \| null;/);
  assert.match(contractSource, /blockedCount:\s*number \| null;/);
  assert.match(contractSource, /closedCount:\s*number \| null;/);
  assert.match(contractSource, /needs_approval:\s*"Needs Approval"/);
  assert.match(contractSource, /metadataOnly:\s*true;/);
  assert.match(coreSource, /LEGACY_TO_AUTHORITATIVE_STAGE/);
  assert.match(coreSource, /human_gate:\s*"needs_approval"/);
  assert.match(coreSource, /createWorkPacketCreatedEvent/);
  assert.match(coreSource, /createWorkPacketTransitionEvent/);
  assert.match(coreSource, /rawPrompt\|rawCompletion\|reasoningTrace\|providerPayload\|secret\|credential/);
  assert.doesNotMatch(contractSource, /\brawPrompt|rawCompletion|reasoningTrace|providerPayload|secret|credential\b/);
  assert.match(contractsIndex, /export \* from "\.\/pipeline-control-plane";/);
  assert.match(workflowCoreIndex, /export \* from "\.\/pipeline-control-plane";/);
});

test("authoritative lifecycle rules create metadata-only creation and transition events", async () => {
  const {
    createWorkPacketCreatedEvent,
    createWorkPacketTransitionEvent,
    isAuthoritativePacketStage,
  } = await loadCompiledLifecycleModule();

  assert.equal(isAuthoritativePacketStage("needs_approval"), true);
  assert.equal(isAuthoritativePacketStage("human_gate"), false);

  const sourceRef = {
    refId: "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
    sourceType: "prd",
    pathOrUrl: "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
    title: "Backend-backed pipeline control plane",
  };
  const actor = { actorType: "manager", actorId: "manager-test", actorLabel: "Manager" };

  const created = createWorkPacketCreatedEvent({
    packetId: "packet-story-1-1",
    eventId: "event-created",
    occurredAt: "2026-07-02T00:00:00.000Z",
    sourceRef,
    actor,
    idempotencyKey: "create-1-1",
    evidenceRefs: ["story:1-1"],
  });
  assert.equal(created.eventType, "packet.created");
  assert.equal(created.previousStage, null);
  assert.equal(created.targetStage, "capture");
  assert.equal(created.metadataOnly, true);
  assert.equal(created.sourceRef.refId, sourceRef.refId);
  assert.deepEqual(created.evidenceRefs, ["story:1-1"]);

  const transitioned = createWorkPacketTransitionEvent({
    packetId: "packet-story-1-1",
    previousStage: "shape",
    targetStage: "needs_approval",
    eventId: "event-needs-approval",
    occurredAt: "2026-07-02T00:01:00.000Z",
    sourceRef,
    actor,
    payloadSummary: "Accepted transition to needs approval.",
  });
  assert.equal(transitioned.eventType, "packet.stage_transitioned");
  assert.equal(transitioned.previousStage, "shape");
  assert.equal(transitioned.targetStage, "needs_approval");
  assert.equal(transitioned.metadataOnly, true);

  assert.throws(
    () => createWorkPacketCreatedEvent({
      packetId: "packet-story-1-1",
      eventId: "event-unsafe",
      occurredAt: "2026-07-02T00:00:00.000Z",
      sourceRef,
      actor,
      payloadSummary: "rawPrompt must not be stored",
    }),
    /must not retain raw prompt/,
  );
});

test("dashboard projection contract validator accepts explicit states and rejects bad labels", async () => {
  const dashboardSupervisorSource = await readFile(dashboardSupervisorPath, "utf8");
  const { getPipelineDashboardProjection, setProjectionEnvelope, setProjectionPayload, setResponseOk } = loadDashboardSupervisorModule(dashboardSupervisorSource);

  const liveProjection = projectionContractFixture();
  setProjectionPayload(liveProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), liveProjection);

  const fixtureEnabledProjection = projectionContractFixture({
    sourceLabel: "fixture",
    freshnessState: "unknown",
    backendReachability: {
      state: "unknown",
      checkedAt: "2026-07-02T17:00:00.000Z",
      reason: "unknown",
      summary: "Fixture projection is local test data.",
    },
    fixtureMode: {
      enabled: true,
      reason: "contract fixture enabled for test",
      allowedForEnvironment: true,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: {
      label: "fixture",
      emptyReason: "unknown",
      backendEmpty: false,
      backendUnavailable: false,
      fixtureBacked: true,
      stale: false,
      summary: "Fixture projection is explicit and non-live.",
    },
    managerSummary: {
      stateSource: "unknown",
      freshnessState: "unknown",
      activeLeaseCount: null,
      activeWorkerCount: null,
      warmWorkerCount: null,
      blockedQueueCount: null,
      dispatchableQueueCount: null,
      closedQueueCount: null,
      sourceExhausted: false,
      inactivityReason: "unknown",
      summary: "Fixture projection has no live manager authority.",
      metadataOnly: true,
    },
    queueSummary: {
      dispatchableCount: null,
      blockedCount: null,
      closedCount: null,
      emptyReason: "unknown",
      sourceExhausted: false,
      summary: "Fixture projection has no live queue authority.",
    },
    workPackets: [],
    selectedPacketDetails: [],
    evidenceRefs: ["fixture:projection-contract"],
  });
  setProjectionPayload(fixtureEnabledProjection);
  const acceptedFixtureProjection = await getPipelineDashboardProjection();
  assert.equal(acceptedFixtureProjection.sourceLabel, "fixture");
  assert.equal(acceptedFixtureProjection.fixtureMode.enabled, true);
  assert.equal(acceptedFixtureProjection.fixtureMode.visibleLabelRequired, true);
  assert.equal(acceptedFixtureProjection.fixtureMode.canSatisfyLiveProof, false);
  assert.equal(acceptedFixtureProjection.truthSummary.fixtureBacked, true);

  const healthyEmptyLiveProjection = projectionContractFixture({
    truthSummary: {
      ...liveProjection.truthSummary,
      emptyReason: "healthy_empty",
      backendEmpty: true,
      summary: "Live backend projection has no queued work.",
    },
    queueSummary: {
      ...liveProjection.queueSummary,
      dispatchableCount: 0,
      emptyReason: "healthy_empty",
      summary: "Queue is healthy and empty.",
    },
    workPackets: [],
    selectedPacketDetails: [],
    evidenceRefs: ["supervisor:healthy-empty"],
  });
  setProjectionPayload(healthyEmptyLiveProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), healthyEmptyLiveProjection);

  const staleOpenLiveProjection = projectionContractFixture({
    sourceUpdatedAt: "2026-07-02T16:59:00.000Z",
  });
  setProjectionPayload(staleOpenLiveProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), staleOpenLiveProjection);

  for (const [caseId, override] of [
    ["bad-source-label", { sourceLabel: "tmux_active" }],
    ["bad-freshness-state", { freshnessState: "terminal_idle" }],
    ["fixture-live-proof", { fixtureMode: { ...liveProjection.fixtureMode, canSatisfyLiveProof: true } }],
    ["fixture-live-labels", { fixtureMode: { ...liveProjection.fixtureMode, enabled: true, canSatisfyLiveProof: false } }],
    [
      "stale-timestamp-without-open-packet",
      {
        sourceUpdatedAt: "2026-07-02T16:59:00.000Z",
        workPackets: [{ ...liveProjection.workPackets[0], status: "complete" }],
        selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], status: "complete" }],
      },
    ],
    ["future-timestamp-live-freshness", { sourceUpdatedAt: "2026-07-02T17:00:01.000Z" }],
    ["missing-stage-summary", { stageSummaries: liveProjection.stageSummaries.slice(1) }],
    ["duplicate-stage-summary", { stageSummaries: [liveProjection.stageSummaries[0], ...liveProjection.stageSummaries.slice(0, -1)] }],
    ["mismatched-selected-detail", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], packetId: "packet-other" }] }],
    ["bad-packet-updated-at", { workPackets: [{ ...liveProjection.workPackets[0], updatedAt: "not-a-date" }] }],
    ["manager-raw-count", { managerSummary: { ...liveProjection.managerSummary, activeWorkerCount: -1 } }],
    ["bad-evidence-refs", { evidenceRefs: [42] }],
  ]) {
    setProjectionPayload(projectionContractFixture(override));
    await assert.rejects(
      () => getPipelineDashboardProjection(),
      /Invalid projection payload/,
      `${caseId} should fail dashboard projection validation`,
    );
  }

  setProjectionEnvelope({});
  await assert.rejects(
    () => getPipelineDashboardProjection(),
    /Malformed response/,
    "missing data envelope should fail before validation",
  );

  setProjectionEnvelope({ data: liveProjection });
  setResponseOk(false);
  await assert.rejects(
    () => getPipelineDashboardProjection(),
    /Request failed/,
    "non-OK projection response should fail before validation",
  );
});

async function loadCompiledLifecycleModule() {
  const outDir = await mkdtemp(join(tmpdir(), "pipeline-control-plane-lifecycle-"));
  const tsconfigPath = join(outDir, "tsconfig.json");
  const repoRoot = process.cwd();
  await writeFile(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          verbatimModuleSyntax: true,
          baseUrl: repoRoot,
          rootDir: repoRoot,
          outDir: join(outDir, "dist"),
          paths: {
            "@kendall/contracts": ["packages/contracts/src/index.ts"],
          },
        },
        include: [
          join(repoRoot, "packages/contracts/src/pipeline-control-plane/index.ts"),
          join(repoRoot, "packages/contracts/src/index.ts"),
          join(repoRoot, "packages/workflow-core/src/pipeline-control-plane/index.ts"),
        ],
      },
      null,
      2,
    ),
  );
  const result = spawnSync("apps/dashboard/node_modules/.bin/tsc", ["-p", tsconfigPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const modulePath = join(outDir, "dist/packages/workflow-core/src/pipeline-control-plane/index.js");
  return import(pathToFileURL(modulePath).href);
}

function projectionContractFixture(overrides = {}) {
  const now = "2026-07-02T17:00:00.000Z";
  const base = {
    schemaVersion: "pipeline-dashboard-projection/v0",
    projectionId: "pipeline-projection:test",
    generatedAt: now,
    sourceUpdatedAt: now,
    sourceLabel: "live",
    freshnessState: "live",
    staleAfterSeconds: 15,
    backendReachability: {
      state: "reachable",
      checkedAt: now,
      reason: null,
      summary: "Projection endpoint reachable.",
    },
    fixtureMode: {
      enabled: false,
      reason: null,
      allowedForEnvironment: false,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: {
      label: "live",
      emptyReason: null,
      backendEmpty: false,
      backendUnavailable: false,
      fixtureBacked: false,
      stale: false,
      summary: "Live projection.",
    },
    stageSummaries: projectionStageSummaryFixtures(),
    workPackets: [
      {
        packetId: "packet-contract-live",
        title: "Contract live packet",
        currentStage: "execute",
        status: "active",
        truthLabel: "live",
        sourceRef: {
          refId: "story:3-2",
          sourceType: "bmad_story",
          pathOrUrl: "_bmad-output/implementation-artifacts/3-2-projection-state-test-coverage.md",
          title: "Story 3.2",
        },
        blocker: null,
        nextAction: "Advance toward Review.",
        evidenceRefs: ["story:3-2"],
        updatedAt: now,
        metadataOnly: true,
      },
    ],
    selectedPacketDetails: [
      {
        packetId: "packet-contract-live",
        sourceRefs: [
          {
            refId: "story:3-2",
            sourceType: "bmad_story",
            pathOrUrl: "_bmad-output/implementation-artifacts/3-2-projection-state-test-coverage.md",
            title: "Story 3.2",
          },
        ],
        evidenceRefs: ["story:3-2"],
        currentStage: "execute",
        status: "active",
        truthLabel: "live",
        blocker: null,
        nextAction: "Advance toward Review.",
        metadataOnly: true,
      },
    ],
    managerSummary: {
      stateSource: "supervisor_projection",
      freshnessState: "live",
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      warmWorkerCount: 0,
      blockedQueueCount: 0,
      dispatchableQueueCount: 1,
      closedQueueCount: 0,
      sourceExhausted: false,
      inactivityReason: null,
      summary: "Projection contract manager summary.",
      metadataOnly: true,
    },
    queueSummary: {
      dispatchableCount: 1,
      blockedCount: 0,
      closedCount: 0,
      emptyReason: null,
      sourceExhausted: false,
      summary: "Projection contract queue summary.",
    },
    evidenceRefs: ["story:3-2"],
  };
  return {
    ...base,
    ...overrides,
    backendReachability: { ...base.backendReachability, ...(overrides.backendReachability ?? {}) },
    fixtureMode: { ...base.fixtureMode, ...(overrides.fixtureMode ?? {}) },
    truthSummary: { ...base.truthSummary, ...(overrides.truthSummary ?? {}) },
    managerSummary: { ...base.managerSummary, ...(overrides.managerSummary ?? {}) },
    queueSummary: { ...base.queueSummary, ...(overrides.queueSummary ?? {}) },
    stageSummaries: overrides.stageSummaries ?? base.stageSummaries,
    workPackets: overrides.workPackets ?? base.workPackets,
    selectedPacketDetails: overrides.selectedPacketDetails ?? base.selectedPacketDetails,
    evidenceRefs: overrides.evidenceRefs ?? base.evidenceRefs,
  };
}

function projectionStageSummaryFixtures() {
  const labels = new Map([
    ["capture", "Capture"],
    ["classify", "Classify"],
    ["route", "Route"],
    ["shape", "Shape"],
    ["needs_approval", "Needs Approval"],
    ["execute", "Execute"],
    ["review", "Review"],
    ["promote", "Promote"],
    ["deliver", "Deliver"],
    ["learn", "Learn"],
  ]);
  return [...labels].map(([stage, label]) => ({
    stage,
    label,
    packetCount: stage === "execute" ? 1 : 0,
    sourceLabel: "live",
    freshnessState: "live",
    emptyReason: stage === "execute" ? null : "healthy_empty",
  }));
}

function loadDashboardSupervisorModule(source) {
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let projectionPayload = projectionContractFixture();
  let projectionEnvelope = { data: projectionPayload };
  let responseOk = true;
  const context = {
    exports: {},
    module: { exports: {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPERVISOR_URL: "http://supervisor.test",
      },
    },
    fetch: async (url, options) => {
      assert.equal(url, "http://supervisor.test/pipeline-control-plane/projection");
      assert.equal(options.cache, "no-store");
      return {
        ok: responseOk,
        async json() {
          return projectionEnvelope;
        },
      };
    },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") {
        return {
          AUTHORITATIVE_PACKET_STAGES: [
            "capture",
            "classify",
            "route",
            "shape",
            "needs_approval",
            "execute",
            "review",
            "promote",
            "deliver",
            "learn",
          ],
        };
      }
      throw new Error(`Unexpected dashboard supervisor import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "supervisor.ts" });
  return {
    ...context.module.exports,
    setProjectionEnvelope(nextProjectionEnvelope) {
      projectionEnvelope = nextProjectionEnvelope;
    },
    setProjectionPayload(nextProjectionPayload) {
      projectionPayload = nextProjectionPayload;
      projectionEnvelope = { data: projectionPayload };
      responseOk = true;
    },
    setResponseOk(nextResponseOk) {
      responseOk = nextResponseOk;
    },
  };
}
