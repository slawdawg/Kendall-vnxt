import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const activeBoardViewModelPath = new URL("../apps/dashboard/src/lib/pipeline/active-board-view-model.ts", import.meta.url);
const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));

async function loadActiveBoardViewModelModule() {
  const source = await readFile(activeBoardViewModelPath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    module: { exports: {} },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "active-board-view-model.ts" });
  return context.module.exports;
}

test("active board view model separates active work, stale history, ready-to-test, diagnostics, and attention", async () => {
  const {
    buildPipelineActiveBoardViewModel,
    derivePacketActionability,
    derivePacketPlacement,
    isDispatchAffectingManagerState,
  } = await loadActiveBoardViewModelModule();

  const projection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-active-execute",
        title: "Execute live active slice",
        currentStage: "execute",
        status: "active",
        nextAction: "Continue implementation.",
      }),
      packetFixture({
        packetId: "packet-stale-waiting",
        title: "Stale waiting packet",
        currentStage: "route",
        status: "waiting",
        truthLabel: "stale",
        nextAction: "Old dispatch wait.",
      }),
      packetFixture({
        packetId: "packet-stale-failed",
        title: "Stale failed packet",
        currentStage: "execute",
        status: "failed",
        truthLabel: "stale",
        blocker: "Worker failed yesterday.",
        nextAction: "Historical failure.",
      }),
      packetFixture({
        packetId: "packet-stale-cleanup",
        title: "Stale cleanup packet",
        currentStage: "execute",
        status: "failed",
        truthLabel: "stale",
        blocker: null,
        nextAction: "Cleanup reconciliation required.",
      }),
      packetFixture({
        packetId: "packet-remediation-queued",
        title: "Fresh failure with repair queued",
        currentStage: "execute",
        status: "failed",
        blocker: "Tool failed.",
        nextAction: "Worker remediation queued.",
      }),
      packetFixture({
        packetId: "packet-operator-blocked",
        title: "Operator approval needed",
        currentStage: "needs_approval",
        status: "blocked",
        blocker: "Operator approval required.",
        nextAction: "Approve or reject the packet.",
      }),
      packetFixture({
        packetId: "packet-ready-to-test",
        title: "Ready test target",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["check:dashboard"],
      }),
      packetFixture({
        packetId: "packet-ready-missing-evidence",
        title: "Ready missing evidence",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: [],
      }),
      packetFixture({
        packetId: "packet-blocked-dependency",
        title: "Blocked by dependency",
        currentStage: "execute",
        status: "blocked",
        blocker: "Dependency still running.",
        nextAction: "Wait for dependency.",
      }),
      packetFixture({
        packetId: "packet-delivery-handoff",
        title: "Delivery handoff packet",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Delivery handoff is waiting for the operator.",
        evidenceRefs: [],
      }),
      packetFixture({
        packetId: "packet-closed",
        title: "Closed completed work",
        currentStage: "learn",
        status: "complete",
        nextAction: null,
      }),
      packetFixture({
        packetId: "packet-fixture",
        title: "Fixture packet",
        currentStage: "execute",
        status: "active",
        truthLabel: "fixture",
        nextAction: "Fixture demonstration.",
      }),
    ],
    selectedPacketDetails: [
      detailFixture({ packetId: "packet-ready-to-test", evidenceRefs: ["check:dashboard"], nextAction: "Ready to test in /pipeline." }),
    ],
    managerSummary: {
      ...managerSummaryFixture(),
      activeWorkerCount: 0,
      warmWorkerCount: 6,
      dispatchableQueueCount: 2,
      inactivityReason: "unknown",
      summary: "Workers are idle while ready work exists.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 2,
      sourceExhausted: false,
      summary: "Ready work exists.",
    },
  });

  assert.equal(derivePacketPlacement(projection.workPackets[0], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[1], projection), "stale_history");
  assert.equal(derivePacketPlacement(projection.workPackets[2], projection), "stale_history");
  assert.equal(derivePacketPlacement(projection.workPackets[3], projection), "stale_history");
  assert.equal(derivePacketPlacement(projection.workPackets[4], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[5], projection), "attention");
  assert.equal(derivePacketPlacement(projection.workPackets[6], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[7], projection), "attention");
  assert.equal(derivePacketPlacement(projection.workPackets[8], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[9], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[10], projection), "hidden");
  assert.equal(derivePacketPlacement(projection.workPackets[11], projection), "diagnostics");

  assert.equal(derivePacketActionability(projection.workPackets[3], projection), "history");
  assert.equal(derivePacketActionability(projection.workPackets[4], projection), "actionable");
  assert.equal(derivePacketActionability(projection.workPackets[5], projection), "operator_attention");
  assert.equal(derivePacketActionability(projection.workPackets[6], projection), "ready_to_test");
  assert.equal(derivePacketActionability(projection.workPackets[7], projection), "operator_attention");
  assert.equal(derivePacketActionability(projection.workPackets[8], projection), "actionable");
  assert.equal(derivePacketActionability(projection.workPackets[9], projection), "actionable");
  assert.equal(derivePacketActionability(projection.workPackets[10], projection), "closed");
  assert.equal(derivePacketActionability(projection.workPackets[11], projection), "diagnostics_only");

  const viewModel = buildPipelineActiveBoardViewModel(projection);
  assert.equal(viewModel.summary.activePacketCount, 7);
  assert.equal(viewModel.summary.staleHistoryCount, 3);
  assert.equal(viewModel.summary.attentionCount, 3, "operator blocker plus missing ready-to-test evidence plus idle-with-ready-work manager attention");
  assert.equal(viewModel.summary.actionablePacketCount, 7);
  assert.equal(viewModel.summary.historicalPacketCount, 3);
  assert.equal(viewModel.summary.readyToTestCount, 1);
  assert.equal(viewModel.activeBoard.stageLanes.find((lane) => lane.stage === "execute").packetCards.length, 4);
  assert.equal(JSON.stringify(viewModel.staleHistory.items.map((item) => item.packetId)), JSON.stringify([
    "packet-stale-waiting",
    "packet-stale-failed",
    "packet-stale-cleanup",
  ]));
  assert.equal(JSON.stringify(viewModel.readyToTestItems.map((item) => item.packetId)), JSON.stringify(["packet-ready-to-test"]));
  assert.ok(viewModel.summary.dispatchAffectingManagerState);
  assert.equal(viewModel.summary.dispatchAffectingManagerState.reason, "idle_with_ready_work");

  const card = viewModel.activeBoard.stageLanes
    .flatMap((lane) => lane.packetCards)
    .find((item) => item.packetId === "packet-ready-to-test");
  assert.ok(card);
  assert.equal(JSON.stringify(Object.keys(card).sort()), JSON.stringify([
    "attention",
    "nextActionLabel",
    "packetId",
    "readyToTest",
    "stage",
    "statusLabel",
    "title",
    "truthLabel",
  ]));
  assert.equal(card.readyToTest, true);
  assert.equal(card.nextActionLabel, "Ready to test in /pipeline.");
  assert.equal(JSON.stringify(card).includes("metadataOnly"), false);
  assert.equal(JSON.stringify(card).includes("evidenceRefs"), false);
  assert.equal(JSON.stringify(card).includes("sourceRef"), false);

  assert.equal(isDispatchAffectingManagerState(projection.managerSummary, projection.queueSummary).visible, true);
});

test("closed deliver and learn packets need explicit handoff language before becoming actionable", async () => {
  const { buildPipelineActiveBoardViewModel, derivePacketActionability, derivePacketPlacement } = await loadActiveBoardViewModelModule();
  const projection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "closed-delivery-complete",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Delivery complete.",
      }),
      packetFixture({
        packetId: "closed-learn-recorded",
        currentStage: "learn",
        status: "complete",
        nextAction: "Learn outcome recorded.",
      }),
      packetFixture({
        packetId: "closed-delivery-handoff",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Delivery handoff is waiting for the operator.",
      }),
    ],
  });

  assert.equal(derivePacketActionability(projection.workPackets[0], projection), "closed");
  assert.equal(derivePacketPlacement(projection.workPackets[0], projection), "hidden");
  assert.equal(derivePacketActionability(projection.workPackets[1], projection), "closed");
  assert.equal(derivePacketPlacement(projection.workPackets[1], projection), "hidden");
  assert.equal(derivePacketActionability(projection.workPackets[2], projection), "actionable");
  assert.equal(derivePacketPlacement(projection.workPackets[2], projection), "active_board");

  const viewModel = buildPipelineActiveBoardViewModel(projection);
  assert.equal(viewModel.summary.activePacketCount, 1);
  assert.equal(viewModel.summary.actionablePacketCount, 1);
});

test("fixture, unavailable, and stale-only projections cannot satisfy live or ready-to-test counts", async () => {
  const { buildPipelineActiveBoardViewModel, derivePacketActionability, derivePacketPlacement } = await loadActiveBoardViewModelModule();

  const fixtureProjection = projectionFixture({
    sourceLabel: "fixture",
    freshnessState: "unknown",
    fixtureMode: {
      enabled: true,
      reason: "fixture fallback",
      allowedForEnvironment: true,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: {
      ...truthSummaryFixture(),
      label: "fixture",
      fixtureBacked: true,
      summary: "Fixture fallback.",
    },
    workPackets: [
      packetFixture({
        packetId: "fixture-ready",
        truthLabel: "fixture",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Ready to test fixture.",
        evidenceRefs: ["fixture:evidence"],
      }),
    ],
  });

  const fixtureModel = buildPipelineActiveBoardViewModel(fixtureProjection);
  assert.equal(fixtureModel.summary.activePacketCount, 0);
  assert.equal(fixtureModel.summary.readyToTestCount, 0);
  assert.equal(fixtureModel.diagnostics.items.some((item) => item.value.includes("fixture-ready")), true);

  const unavailableProjection = projectionFixture({
    sourceLabel: "unavailable",
    freshnessState: "unavailable",
    backendReachability: {
      state: "unavailable",
      checkedAt: "2026-07-02T20:00:00.000Z",
      reason: "backend_unavailable",
      summary: "Backend unavailable.",
    },
    truthSummary: {
      ...truthSummaryFixture(),
      label: "unavailable",
      backendUnavailable: true,
      summary: "Backend unavailable.",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      inactivityReason: "backend_unavailable",
      summary: "Backend unavailable.",
    },
    workPackets: [
      packetFixture({
        packetId: "unavailable-packet",
        truthLabel: "live",
        currentStage: "execute",
        status: "active",
      }),
    ],
  });

  const unavailableModel = buildPipelineActiveBoardViewModel(unavailableProjection);
  assert.equal(unavailableModel.summary.activePacketCount, 0);
  assert.equal(unavailableModel.summary.readyToTestCount, 0);
  assert.equal(unavailableModel.summary.dispatchAffectingManagerState.reason, "backend_unavailable");

  const unavailablePacketProjection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "unavailable-truth-packet",
        truthLabel: "unavailable",
        currentStage: "execute",
        status: "active",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["unavailable:evidence"],
      }),
    ],
  });
  assert.equal(derivePacketPlacement(unavailablePacketProjection.workPackets[0], unavailablePacketProjection), "diagnostics");
  assert.equal(derivePacketActionability(unavailablePacketProjection.workPackets[0], unavailablePacketProjection), "diagnostics_only");
  const unavailablePacketModel = buildPipelineActiveBoardViewModel(unavailablePacketProjection);
  assert.equal(unavailablePacketModel.summary.activePacketCount, 0);
  assert.equal(unavailablePacketModel.summary.readyToTestCount, 0);

  const agedProjection = projectionFixture({
    generatedAt: "2026-07-02T20:05:01.000Z",
    sourceUpdatedAt: "2026-07-02T20:00:00.000Z",
    staleAfterSeconds: 60,
    workPackets: [
      packetFixture({
        packetId: "aged-live-labeled-packet",
        truthLabel: "live",
        currentStage: "execute",
        status: "active",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["aged:evidence"],
      }),
      packetFixture({
        packetId: "aged-closed-live-labeled-packet",
        truthLabel: "live",
        currentStage: "learn",
        status: "complete",
        nextAction: "Historical completion.",
      }),
    ],
    selectedPacketDetails: [
      detailFixture({
        packetId: "aged-live-labeled-packet",
        evidenceRefs: ["aged:evidence"],
        nextAction: "Ready to test in /pipeline.",
      }),
    ],
  });
  const agedModel = buildPipelineActiveBoardViewModel(agedProjection);
  assert.equal(derivePacketPlacement(agedProjection.workPackets[0], agedProjection), "active_board");
  assert.equal(derivePacketPlacement(agedProjection.workPackets[1], agedProjection), "hidden");
  assert.equal(agedModel.summary.activePacketCount, 1);
  assert.equal(agedModel.summary.readyToTestCount, 1);
  assert.equal(agedModel.summary.staleHistoryCount, 0);

  const staleProjection = projectionFixture({
    freshnessState: "stale",
    truthSummary: {
      ...truthSummaryFixture(),
      stale: true,
      summary: "Projection stale.",
    },
    workPackets: [
      packetFixture({
        packetId: "live-labeled-stale-projection",
        truthLabel: "live",
        currentStage: "execute",
        status: "active",
      }),
      packetFixture({
        packetId: "stale-cleanup-in-stale-projection",
        truthLabel: "stale",
        currentStage: "execute",
        status: "failed",
        nextAction: "Cleanup reconciliation required.",
      }),
      packetFixture({
        packetId: "ready-with-stale-detail",
        truthLabel: "live",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["packet:evidence"],
      }),
    ],
    selectedPacketDetails: [
      detailFixture({
        packetId: "ready-with-stale-detail",
        truthLabel: "stale",
        evidenceRefs: ["stale:evidence"],
        nextAction: "Ready to test in /pipeline.",
      }),
    ],
  });

  const staleModel = buildPipelineActiveBoardViewModel(staleProjection);
  assert.equal(staleModel.summary.activePacketCount, 0);
  assert.equal(staleModel.summary.readyToTestCount, 0);
  assert.equal(staleModel.summary.staleHistoryCount, 3);
  assert.equal(JSON.stringify(staleModel.staleHistory.items.map((item) => item.packetId)), JSON.stringify([
    "live-labeled-stale-projection",
    "stale-cleanup-in-stale-projection",
    "ready-with-stale-detail",
  ]));

  const unknownManagerModel = buildPipelineActiveBoardViewModel(projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      stateSource: "unknown",
      activeWorkerCount: null,
      activeLeaseCount: null,
      dispatchableQueueCount: 2,
      summary: "Manager state unknown.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 2,
    },
  }));
  assert.equal(unknownManagerModel.summary.dispatchAffectingManagerState, null);

  const emergencyStopModel = buildPipelineActiveBoardViewModel(projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      summary: "Emergency stop line is active; dispatch is paused.",
    },
  }));
  assert.equal(emergencyStopModel.summary.dispatchAffectingManagerState.reason, "emergency_stop");

  const killStateModel = buildPipelineActiveBoardViewModel(projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      summary: "Kill state is active for failed workers.",
    },
  }));
  assert.equal(killStateModel.summary.dispatchAffectingManagerState.reason, "kill");
});

function projectionFixture(overrides = {}) {
  const base = {
    schemaVersion: "pipeline-dashboard-projection/v0",
    projectionId: "projection-active-board-test",
    generatedAt: "2026-07-02T20:00:00.000Z",
    sourceUpdatedAt: "2026-07-02T20:00:00.000Z",
    sourceLabel: "live",
    freshnessState: "live",
    staleAfterSeconds: 15,
    backendReachability: {
      state: "reachable",
      checkedAt: "2026-07-02T20:00:00.000Z",
      reason: null,
      summary: "Backend reachable.",
    },
    fixtureMode: {
      enabled: false,
      reason: null,
      allowedForEnvironment: false,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: truthSummaryFixture(),
    stageSummaries: [
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
    ].map((stage) => ({
      stage,
      label: stage.replace(/_/g, " "),
      packetCount: 0,
      sourceLabel: "live",
      freshnessState: "live",
      emptyReason: "healthy_empty",
    })),
    workPackets: [],
    selectedPacketDetails: [],
    managerSummary: managerSummaryFixture(),
    queueSummary: queueSummaryFixture(),
    evidenceRefs: [],
  };
  return { ...base, ...overrides };
}

function truthSummaryFixture() {
  return {
    label: "live",
    emptyReason: null,
    backendEmpty: false,
    backendUnavailable: false,
    fixtureBacked: false,
    stale: false,
    summary: "Live projection.",
  };
}

function managerSummaryFixture() {
  return {
    stateSource: "supervisor_projection",
    freshnessState: "live",
    activeLeaseCount: 1,
    activeWorkerCount: 1,
    warmWorkerCount: 6,
    blockedQueueCount: 0,
    dispatchableQueueCount: 0,
    closedQueueCount: 0,
    sourceExhausted: false,
    inactivityReason: null,
    summary: "Manager healthy.",
    metadataOnly: true,
  };
}

function queueSummaryFixture() {
  return {
    dispatchableCount: 0,
    blockedCount: 0,
    closedCount: 0,
    emptyReason: "healthy_empty",
    sourceExhausted: false,
    summary: "Queue healthy.",
  };
}

function packetFixture(overrides = {}) {
  return {
    packetId: "packet-base",
    title: "Base packet",
    currentStage: "execute",
    status: "active",
    truthLabel: "live",
    sourceRef: {
      refId: "story:1-1",
      sourceType: "bmad_story",
      pathOrUrl: "_bmad-output/implementation-artifacts/1-1-build-the-active-board-view-model.md",
      title: "Story 1.1",
    },
    blocker: null,
    nextAction: "Continue.",
    evidenceRefs: ["story:1-1"],
    updatedAt: "2026-07-02T20:00:00.000Z",
    metadataOnly: true,
    ...overrides,
  };
}

function detailFixture(overrides = {}) {
  return {
    packetId: "packet-base",
    sourceRefs: [],
    evidenceRefs: [],
    currentStage: "execute",
    status: "active",
    truthLabel: "live",
    blocker: null,
    nextAction: null,
    metadataOnly: true,
    ...overrides,
  };
}
