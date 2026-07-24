import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const activeBoardViewModelPath = new URL("../apps/dashboard/src/lib/pipeline/active-board-view-model.ts", import.meta.url);
const pipelineCockpitPath = new URL("../apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", import.meta.url);
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
    gatedControls: [
      {
        controlId: "control:kill-worker",
        operation: "kill_worker",
        status: "gated",
        authorityFamily: "worker-process-control",
        stopLine: "Do not kill workers from pipeline reliability metadata.",
        nextAction: "Request explicit approval.",
        packetId: null,
        workerRefs: ["worker:codex-2"],
        evidenceRefs: ["control:kill-worker"],
        metadataOnly: true,
      },
    ],
  });

  assert.equal(derivePacketPlacement(projection.workPackets[0], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[1], projection), "stale_history");
  assert.equal(derivePacketPlacement(projection.workPackets[2], projection), "stale_history");
  assert.equal(derivePacketPlacement(projection.workPackets[3], projection), "stale_history");
  assert.equal(derivePacketPlacement(projection.workPackets[4], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[5], projection), "attention");
  assert.equal(derivePacketPlacement(projection.workPackets[6], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[7], projection), "attention");
  assert.equal(derivePacketPlacement(projection.workPackets[8], projection), "attention");
  assert.equal(derivePacketPlacement(projection.workPackets[9], projection), "active_board");
  assert.equal(derivePacketPlacement(projection.workPackets[10], projection), "hidden");
  assert.equal(derivePacketPlacement(projection.workPackets[11], projection), "diagnostics");

  assert.equal(derivePacketActionability(projection.workPackets[3], projection), "history");
  assert.equal(derivePacketActionability(projection.workPackets[4], projection), "actionable");
  assert.equal(derivePacketActionability(projection.workPackets[5], projection), "operator_attention");
  assert.equal(derivePacketActionability(projection.workPackets[6], projection), "ready_to_test");
  assert.equal(derivePacketActionability(projection.workPackets[7], projection), "operator_attention");
  assert.equal(derivePacketActionability(projection.workPackets[8], projection), "operator_attention");
  assert.equal(derivePacketActionability(projection.workPackets[9], projection), "actionable");
  assert.equal(derivePacketActionability(projection.workPackets[10], projection), "closed");
  assert.equal(derivePacketActionability(projection.workPackets[11], projection), "diagnostics_only");

  const viewModel = buildPipelineActiveBoardViewModel(projection);
  assert.equal(viewModel.summary.activePacketCount, 7);
  assert.equal(viewModel.summary.staleHistoryCount, 3);
  assert.equal(viewModel.summary.attentionCount, 4, "operator blocker plus missing ready-to-test evidence plus blocked dependency plus idle-with-ready-work manager attention");
  assert.equal(viewModel.summary.actionablePacketCount, 7);
  assert.equal(viewModel.summary.historicalPacketCount, 3);
  assert.equal(viewModel.summary.readyToTestCount, 1);
  assert.equal(viewModel.summary.executionLoopHealth.state, "blocked");
  assert.equal(viewModel.summary.executionLoopHealth.counts.moving, 7);
  assert.equal(viewModel.summary.executionLoopHealth.counts.actionNeeded, 5);
  assert.equal(viewModel.summary.executionLoopHealth.counts.readyToTest, 1);
  assert.deepEqual(Object.keys(viewModel.summary.executionLoopHealth.counts).sort(), [
    "actionNeeded",
    "blocked",
    "empty",
    "exhausted",
    "moving",
    "readyToTest",
    "stale",
    "total",
    "unavailable",
    "unhealthy",
  ]);
  assert.equal(viewModel.summary.executionLoopHealth.metadataOnly, true);
  assert.equal(JSON.stringify(viewModel.summary.executionLoopHealth).includes("check:dashboard"), false);
  assert.equal(JSON.stringify(viewModel.summary.executionLoopHealth).includes("Do not kill workers"), false);
  assert.equal(JSON.stringify(viewModel.summary.executionLoopHealth).includes("control:kill-worker"), false);
  assert.equal(viewModel.activeBoard.stageLanes.find((lane) => lane.stage === "execute").packetCards.length, 4);
  assert.equal(JSON.stringify(viewModel.staleHistory.items.map((item) => item.packetId)), JSON.stringify([
    "packet-stale-waiting",
    "packet-stale-failed",
    "packet-stale-cleanup",
  ]));
  assert.equal(JSON.stringify(viewModel.readyToTestItems.map((item) => item.packetId)), JSON.stringify(["packet-ready-to-test"]));
  assert.ok(viewModel.summary.dispatchAffectingManagerState);
  assert.equal(viewModel.summary.dispatchAffectingManagerState.reason, "idle_with_ready_work");

  const operatorAttentionCard = viewModel.attentionItems.find((item) => item.packetId === "packet-operator-blocked");
  assert.ok(operatorAttentionCard);
  assert.equal(operatorAttentionCard.attention, true);
  assert.equal(operatorAttentionCard.attentionKind, "approval_required");
  assert.equal(operatorAttentionCard.attentionReasonLabel, "Approval required");
  assert.equal(operatorAttentionCard.nextOperatorActionLabel, "Approve or reject the packet.");
  assert.equal(JSON.stringify(operatorAttentionCard).includes("evidenceRefs"), false);
  assert.equal(JSON.stringify(operatorAttentionCard).includes("Worker failed yesterday"), false);

  const card = viewModel.activeBoard.stageLanes
    .flatMap((lane) => lane.packetCards)
    .find((item) => item.packetId === "packet-ready-to-test");
  assert.ok(card);
  assert.equal(JSON.stringify(Object.keys(card).sort()), JSON.stringify([
    "attention",
    "attentionKind",
    "attentionReasonLabel",
    "canonicalPostureLabel",
    "nextActionLabel",
    "nextOperatorActionLabel",
    "packetId",
    "readyToTest",
    "stage",
    "statusLabel",
    "title",
    "truthLabel",
  ]));
  assert.equal(card.readyToTest, true);
  assert.equal(card.nextActionLabel, "Ready to test");
  assert.equal(card.attentionReasonLabel, null);
  assert.equal(card.nextOperatorActionLabel, null);
  assert.equal(JSON.stringify(card).includes("metadataOnly"), false);
  assert.equal(JSON.stringify(card).includes("evidenceRefs"), false);
  assert.equal(JSON.stringify(card).includes("sourceRef"), false);

  const denseAttentionModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "dense-attention",
        currentStage: "execute",
        status: "active",
        nextAction: "User can decide after Five Whys: manager run one, worker codex two, evidenceRefs sourceRefs latestTransitionEventRef rawPayloadRetained.",
        evidenceRefs: ["evidence:dense-attention"],
      }),
    ],
  }));
  const denseAttentionCard = denseAttentionModel.attentionItems[0];
  assert.equal(denseAttentionCard.attentionKind, "operator_decision");
  assert.equal(denseAttentionCard.nextOperatorActionLabel, "Inspect packet detail.");
  const compactCardJson = JSON.stringify(denseAttentionCard);
  for (const bannedCompactText of [
    "Five Whys",
    "manager run one",
    "worker codex two",
    "evidenceRefs",
    "sourceRefs",
    "latestTransitionEventRef",
    "rawPayloadRetained",
    "evidence:dense",
  ]) {
    assert.equal(compactCardJson.includes(bannedCompactText), false, `${bannedCompactText} must stay out of compact card JSON`);
  }

  const denseActionableModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "dense-actionable",
        currentStage: "execute",
        status: "active",
        nextAction: "Continue after five-whys evidenceRef sourceRef managerRun workerCodex raw payload review.",
        evidenceRefs: ["evidence:dense-actionable"],
      }),
    ],
  }));
  const denseActionableCard = denseActionableModel.activeBoard.stageLanes
    .flatMap((lane) => lane.packetCards)
    .find((item) => item.packetId === "dense-actionable");
  assert.ok(denseActionableCard);
  assert.equal(denseActionableCard.nextActionLabel, "Inspect packet detail.");
  assert.equal(JSON.stringify(denseActionableCard).includes("evidenceRef"), false);
  assert.equal(JSON.stringify(denseActionableCard).includes("managerRun"), false);

  const maskedStopLineModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "masked-stop-line",
        currentStage: "execute",
        status: "blocked",
        blocker: "do-not run provider call until approval.",
        nextAction: "Ask operator to continue.",
      }),
    ],
  }));
  assert.equal(maskedStopLineModel.attentionItems[0].nextOperatorActionLabel, "Request explicit approval.");

  const standaloneProviderCallModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "standalone-provider-call",
        currentStage: "execute",
        status: "active",
        nextAction: "provider call from dashboard",
      }),
    ],
  }));
  const standaloneProviderCallCard = standaloneProviderCallModel.activeBoard.stageLanes
    .flatMap((lane) => lane.packetCards)
    .find((item) => item.packetId === "standalone-provider-call");
  assert.ok(standaloneProviderCallCard);
  assert.equal(standaloneProviderCallCard.nextActionLabel, "Request explicit approval.");

  const providerPayloadModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "provider-payload-action",
        currentStage: "execute",
        status: "active",
        nextAction: "inspect raw provider payload",
      }),
    ],
  }));
  const providerPayloadCard = providerPayloadModel.activeBoard.stageLanes
    .flatMap((lane) => lane.packetCards)
    .find((item) => item.packetId === "provider-payload-action");
  assert.ok(providerPayloadCard);
  assert.equal(providerPayloadCard.nextActionLabel, "Inspect packet detail.");

  const denseStaleHistoryModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "dense-stale-history",
        currentStage: "execute",
        status: "blocked",
        truthLabel: "stale",
        blocker: "Stale five-whys evidenceRef managerRun raw payload detail.",
      }),
    ],
  }));
  assert.equal(denseStaleHistoryModel.staleHistory.items[0].staleReason, "Inspect packet detail.");

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

test("contextual action strips are selection scoped and return metadata-only action results", async () => {
  const {
    buildContextualActionStripForPacket,
    buildPipelineActiveBoardViewModel,
  } = await loadActiveBoardViewModelModule();

  const projection = projectionFixture({
    gatedControls: [
      {
        controlId: "control:cleanup-workspace",
        operation: "cleanup_workspace",
        status: "gated",
        authorityFamily: "cleanup-apply",
        stopLine: "Cleanup needs exact merged-lane evidence.",
        nextAction: "Review cleanup dry-run before apply.",
        packetId: "packet-gated-cleanup",
        workerRefs: [],
        evidenceRefs: ["control:cleanup-workspace"],
        metadataOnly: true,
      },
      {
        controlId: "control:unknown-a",
        operation: "unknown",
        status: "gated",
        authorityFamily: "unknown",
        stopLine: "Unknown operation needs classification.",
        nextAction: "Classify before action.",
        packetId: "packet-gated-cleanup",
        workerRefs: [],
        evidenceRefs: ["control:unknown-a"],
        metadataOnly: true,
      },
      {
        controlId: "control:unknown-b",
        operation: "unknown",
        status: "gated",
        authorityFamily: "unknown",
        stopLine: "Second unknown operation needs classification.",
        nextAction: "Classify before action.",
        packetId: "packet-gated-cleanup",
        workerRefs: [],
        evidenceRefs: ["control:unknown-b"],
        metadataOnly: true,
      },
      {
        controlId: "control:global-github",
        operation: "github_mutation",
        status: "gated",
        authorityFamily: "github-delivery",
        stopLine: "No GitHub mutation from dashboard.",
        nextAction: "Use delivery workflow.",
        packetId: null,
        workerRefs: [],
        evidenceRefs: ["control:global-github"],
        metadataOnly: true,
      },
    ],
    workPackets: [
      packetFixture({
        packetId: "packet-gated-cleanup",
        title: "Cleanup evidence packet",
        currentStage: "deliver",
        status: "blocked",
        blocker: "Cleanup approval is required.",
        nextAction: "Review cleanup dry-run.",
        evidenceRefs: ["packet:cleanup-evidence"],
      }),
      packetFixture({
        packetId: "packet-ready-result",
        title: "Ready result packet",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["packet:ready-evidence"],
      }),
      packetFixture({
        packetId: "packet-global-control-only",
        title: "Global control should not attach",
        currentStage: "execute",
        status: "active",
        nextAction: "Continue.",
      }),
    ],
    selectedPacketDetails: [
      detailFixture({
        packetId: "packet-ready-result",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["detail:ready-internal-path"],
      }),
    ],
  });

  const model = buildPipelineActiveBoardViewModel(projection);
  const gatedStrip = model.contextualActions.byPacketId["packet-gated-cleanup"];
  const readyStrip = model.contextualActions.byPacketId["packet-ready-result"];

  assert.equal(gatedStrip.visible, true);
  assert.equal(gatedStrip.selectionType, "packet");
  assert.equal(gatedStrip.selectionId, "packet-gated-cleanup");
  assert.equal(gatedStrip.actions.length, 4, "packet gets its gated controls plus the inspect blocker action");
  assert.equal(gatedStrip.actions[0].actionId, "cleanup_workspace");
  assert.equal(gatedStrip.actions[0].actionInstanceId, "control:cleanup-workspace");
  assert.equal(gatedStrip.actions[0].label, "Cleanup");
  assert.equal(gatedStrip.actions[0].state, "gated");
  assert.equal(gatedStrip.actions[0].riskTier, "extreme");
  assert.equal(gatedStrip.actions[0].result.status, "blocked");
  assert.equal(gatedStrip.actions[0].result.rawPayloadRetained, false);
  assert.equal(gatedStrip.actions[1].actionInstanceId, "control:unknown-a");
  assert.equal(gatedStrip.actions[2].actionInstanceId, "control:unknown-b");
  assert.equal(gatedStrip.actions[1].label, "Unknown");
  assert.equal(gatedStrip.actions[1].riskTier, "high");
  assert.equal(new Set(gatedStrip.actions.map((action) => action.actionInstanceId)).size, gatedStrip.actions.length);
  assert.equal(gatedStrip.actions.every((action) => action.metadataOnly === true), true);
  assert.equal(JSON.stringify(gatedStrip).includes("control:global-github"), false);
  assert.equal(model.contextualActions.byPacketId["packet-global-control-only"], undefined);

  assert.equal(readyStrip.visible, true);
  assert.equal(readyStrip.actions.length, 4);
  assert.equal(readyStrip.actions[0].actionId, "inspect_ready_to_test");
  assert.equal(readyStrip.actions[0].actionInstanceId, "packet-ready-result:inspect-ready-to-test");
  assert.equal(readyStrip.actions[0].state, "available");
  assert.equal(readyStrip.actions[0].result, null);
  assert.equal(JSON.stringify(readyStrip.actions.slice(1).map((action) => action.actionId)), JSON.stringify([
    "mark_tested",
    "mark_tested",
    "request_rework",
  ]));
  assert.equal(readyStrip.actions.slice(1).every((action) => action.state === "gated"), true);
  assert.equal(readyStrip.actions.slice(1).every((action) => action.riskTier === "medium"), true);
  assert.equal(readyStrip.actions.slice(1).every((action) => action.result?.status === "blocked"), true);
  assert.equal(readyStrip.actions.slice(1).every((action) => action.result?.rawPayloadRetained === false), true);
  assert.equal(readyStrip.actions.slice(1).every((action) => action.result?.correlationLabel === "packet-ready-result"), true);
  assert.equal(new Set(readyStrip.actions.map((action) => action.actionInstanceId)).size, readyStrip.actions.length);
  assert.equal(JSON.stringify(readyStrip).includes("packet:ready-evidence"), false);
  assert.equal(JSON.stringify(readyStrip).includes("detail:ready-internal-path"), false);
  assert.equal(JSON.stringify(readyStrip).includes("provider payload"), false);
  assert.equal(JSON.stringify(readyStrip).includes("raw prompt"), false);

  assert.equal(buildContextualActionStripForPacket(
    packetFixture({ packetId: "fixture-packet", truthLabel: "fixture" }),
    projection
  ), null);
  assert.equal(JSON.stringify(model.contextualActions).includes("raw prompt"), false);
  assert.equal(JSON.stringify(model.contextualActions).includes("provider payload"), false);
});

test("local paused or draining runtime exposes only server-projected runtime controls", async () => {
  const {
    buildRuntimeOperationalActionStrip,
    isLocalPausedOrDrainingSupervisorRuntime,
  } = await loadActiveBoardViewModelModule();

  for (const [runtimeMode, expectedActions] of [
    ["paused", ["drain", "resume"]],
    ["draining", ["resume"]],
  ]) {
    const projection = projectionFixture({
      runtimeReadiness: runtimeReadinessFixture({
        operationalMode: "read_only",
        actionCapabilitiesV1: [
          runtimeCapabilityFixture("pause", {
            capabilityState: "unavailable",
            typedReason: "invalid_transition",
            actionContext: { kind: "pause", expectedRuntimeMode: runtimeMode, expectedRuntimeRevision: 7 },
          }),
          runtimeCapabilityFixture("drain", {
            capabilityState: runtimeMode === "paused" ? "available" : "unavailable",
            typedReason: runtimeMode === "paused" ? null : "invalid_transition",
            actionContext: { kind: "drain", expectedRuntimeMode: runtimeMode, expectedRuntimeRevision: 7 },
          }),
          runtimeCapabilityFixture("resume", {
            actionContext: { kind: "resume", expectedRuntimeMode: runtimeMode, expectedRuntimeRevision: 7 },
          }),
        ],
      }),
    });

    assert.equal(isLocalPausedOrDrainingSupervisorRuntime(projection), true);
    const strip = buildRuntimeOperationalActionStrip(projection);
    assert.ok(strip);
    assert.deepEqual(strip.actions.map((action) => action.actionId), expectedActions);
    const resume = strip.actions.find((action) => action.actionId === "resume");
    assert.equal(resume.label, "Resume intake");
    assert.equal(resume.v1Capability.targetId, "supervisor-runtime");
    assert.deepEqual(resume.v1Capability.actionContext, {
      kind: "resume",
      expectedRuntimeMode: runtimeMode,
      expectedRuntimeRevision: 7,
    });
    assert.equal(resume.v1Capability.actionContextDigestSha256, "sha256:resume-context");
  }

  const remoteReadOnly = projectionFixture({
    runtimeReadiness: runtimeReadinessFixture({
      readinessState: "degraded",
      operationalMode: "read_only",
      capabilityState: "unavailable",
      actionCapabilitiesV1: [runtimeCapabilityFixture("resume")],
    }),
  });
  const fixtureProjection = projectionFixture({
    sourceLabel: "fixture",
    fixtureMode: {
      enabled: true,
      reason: "demo fixture",
      allowedForEnvironment: true,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    runtimeReadiness: runtimeReadinessFixture({
      operationalMode: "read_only",
      actionCapabilitiesV1: [runtimeCapabilityFixture("resume")],
    }),
  });
  const unavailableProjection = projectionFixture({
    sourceLabel: "unavailable",
    freshnessState: "unavailable",
    runtimeReadiness: runtimeReadinessFixture({
      operationalMode: "read_only",
      actionCapabilitiesV1: [runtimeCapabilityFixture("resume")],
    }),
  });
  const staleProjection = projectionFixture({
    sourceLabel: "stale",
    freshnessState: "stale",
    truthSummary: {
      ...truthSummaryFixture(),
      label: "stale",
      stale: true,
    },
    runtimeReadiness: runtimeReadinessFixture({
      operationalMode: "bounded_write",
      actionCapabilitiesV1: [runtimeCapabilityFixture("resume")],
    }),
  });

  for (const projection of [remoteReadOnly, fixtureProjection, unavailableProjection, staleProjection]) {
    assert.equal(isLocalPausedOrDrainingSupervisorRuntime(projection), false);
    assert.equal(buildRuntimeOperationalActionStrip(projection), null);
  }

  const cockpit = await readFile(pipelineCockpitPath, "utf8");
  assert.match(cockpit, /if \(fixtureMode\.kind !== "runtime"\)/);
  assert.match(cockpit, /capability\.sourceMode !== \(packetId === "supervisor-runtime" \? "supervisor_runtime" : "packet"\)/);
  assert.match(cockpit, /targetId: capability\.targetId/);
  assert.match(cockpit, /actionContext: capability\.actionContext/);
  assert.match(cockpit, /actionContextDigestSha256: approval\.actionContextDigestSha256/);
  assert.match(cockpit, /approvalId: approval\.approvalId/);
});

test("packet detail why diagnostics contract explains placement without retaining raw payloads", async () => {
  const {
    buildPacketDetailWhyDiagnosticsForPacket,
    buildPipelineActiveBoardViewModel,
  } = await loadActiveBoardViewModelModule();

  const projection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-why-detail",
        title: "Why detail packet",
        currentStage: "execute",
        status: "active",
        nextAction: "Continue after five-whys evidenceRef sourceRef managerRun raw provider payload review.",
        evidenceRefs: ["packet:evidence-one"],
      }),
      packetFixture({
        packetId: "packet-empty-detail-fallback",
        title: "Empty detail fallback packet",
        currentStage: "execute",
        status: "active",
        sourceRef: {
          refId: "source:packet-fallback",
          sourceType: "prd",
          title: "Fallback source",
          pathOrUrl: "docs/fallback.md",
        },
        nextAction: "Continue packet-level work.",
        evidenceRefs: ["packet:fallback-evidence"],
      }),
      packetFixture({
        packetId: "packet-why-stale",
        title: "Why stale packet",
        currentStage: "execute",
        status: "blocked",
        truthLabel: "stale",
        blocker: "Stale five-whys sourceRef evidenceRef detail.",
      }),
    ],
    selectedPacketDetails: [
      detailFixture({
        packetId: "packet-why-detail",
        sourceRefs: [
          {
            refId: "source:packet-why-detail",
            sourceType: "prd",
            title: "Packet why detail source",
            pathOrUrl: "_bmad-output/planning-artifacts/prds/example.md",
          },
        ],
        evidenceRefs: ["detail:evidence-one", "detail:evidence-two"],
        recentTransitionEventRefs: ["transition:one", "transition:two"],
        latestTransitionEventRef: "transition:two",
        latestMovementSummary: "moved from review to execute with metadata-only proof",
        nextAction: "Continue after five-whys evidenceRef sourceRef managerRun raw provider payload review.",
      }),
      detailFixture({
        packetId: "packet-empty-detail-fallback",
        sourceRefs: [],
        evidenceRefs: [],
        recentTransitionEventRefs: [],
        latestMovementSummary: null,
        nextAction: "   ",
      }),
    ],
  });

  const model = buildPipelineActiveBoardViewModel(projection);
  const detail = model.packetDetails.byPacketId["packet-why-detail"];

  assert.equal(detail.packetId, "packet-why-detail");
  assert.equal(detail.detailSource, "PipelineDashboardProjectionV0.selectedPacketDetails");
  assert.equal(detail.selectedDetailAvailable, true);
  assert.equal(detail.placement, "active_board");
  assert.equal(detail.actionability, "actionable");
  assert.equal(detail.why.label, "active_board / actionable");
  assert.equal(detail.why.placementReason, "Packet is live active work.");
  assert.equal(detail.why.nextDiagnosticAction, "Inspect packet detail.");
  assert.equal(detail.diagnostics.sourceRefCount, 1);
  assert.equal(detail.diagnostics.evidenceRefCount, 2);
  assert.equal(detail.diagnostics.movementRefCount, 2);
  assert.equal(detail.diagnostics.latestMovementLabel, "moved from review to execute with metadata-only proof");
  assert.equal(detail.diagnostics.retentionClass, "metadata_only");
  assert.equal(detail.diagnostics.rawPayloadRetained, false);
  assert.equal(detail.metadataOnly, true);

  const fallbackDetail = model.packetDetails.byPacketId["packet-empty-detail-fallback"];
  assert.equal(fallbackDetail.selectedDetailAvailable, true);
  assert.equal(fallbackDetail.diagnostics.sourceRefCount, 1);
  assert.equal(fallbackDetail.diagnostics.evidenceRefCount, 1);
  assert.equal(fallbackDetail.diagnostics.movementRefCount, 1);
  assert.equal(fallbackDetail.diagnostics.latestMovementLabel, "latest movement summary not present in projection detail");
  assert.equal(fallbackDetail.why.nextDiagnosticAction, "Continue packet-level work.");

  const staleDetail = model.packetDetails.byPacketId["packet-why-stale"];
  assert.equal(staleDetail.detailSource, "PipelineDashboardProjectionV0.workPackets");
  assert.equal(staleDetail.selectedDetailAvailable, false);
  assert.equal(staleDetail.placement, "stale_history");
  assert.equal(staleDetail.actionability, "history");
  assert.equal(staleDetail.why.placementReason, "Packet is stale history.");

  assert.deepEqual(buildPacketDetailWhyDiagnosticsForPacket(projection.workPackets[0], projection), detail);
  const detailJson = JSON.stringify(model.packetDetails);
  for (const bannedDetailText of [
    "five-whys",
    "sourceRef managerRun",
    "raw provider payload",
    "transition:one",
    "detail:evidence-one",
    "_bmad-output/planning-artifacts",
  ]) {
    assert.equal(detailJson.includes(bannedDetailText), false, `${bannedDetailText} must stay out of packet detail why diagnostics`);
  }
});

test("canonical packet posture consumes supervisor source, readiness, quality, retention, delivery, and capability truth", async () => {
  const { buildPipelineActiveBoardViewModel } = await loadActiveBoardViewModelModule();
  const contract = canonicalContractFixture({
    productMode: "bounded_write",
    readinessComponents: canonicalReadinessFixture({
      quality_gates: {
        componentId: "quality_gates",
        requirement: "required",
        state: "blocked",
        evidenceRefs: ["evidence:quality-blocked"],
      },
    }),
  });
  const mapping = productModeMappingFixture({
    requestedProductMode: "bounded_write",
    effectiveProductMode: "blocked",
    operationalMode: "unavailable",
    readinessState: "blocked",
    capabilityState: "gated",
    ready: false,
    blockedReasons: ["canonical_contract_does_not_grant_write_authority"],
  });
  const projection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-canonical-blocked",
        sourceRef: {
          refId: "legacy:contradictory",
          sourceType: "operator_input",
          pathOrUrl: null,
          title: "Legacy fallback must not win",
        },
        canonicalContract: contract,
        productModeMapping: mapping,
        nextAction: "Continue bounded write automatically.",
      }),
      packetFixture({ packetId: "packet-canonical-unavailable" }),
    ],
    selectedPacketDetails: [
      detailFixture({
        packetId: "packet-canonical-blocked",
        sourceRefs: [{ refId: "legacy:selected-detail", sourceType: "operator_input", pathOrUrl: null, title: null }],
        canonicalContract: contract,
        productModeMapping: mapping,
      }),
    ],
  });

  const model = buildPipelineActiveBoardViewModel(projection);
  const card = model.activeBoard.stageLanes.flatMap((lane) => lane.packetCards).find((item) => item.packetId === "packet-canonical-blocked");
  assert.ok(card);
  assert.equal(card.canonicalPostureLabel, "blocked · blocked · gated");
  assert.equal(JSON.stringify(card).includes("legacy:contradictory"), false);
  assert.equal(JSON.stringify(card).includes("evidence:quality-blocked"), false);

  const detail = model.packetDetails.byPacketId["packet-canonical-blocked"].canonical;
  assert.equal(detail.availability, "available");
  assert.equal(detail.source.sourceId, "source:canonical-prd");
  assert.equal(detail.source.role, "canonical");
  assert.equal(detail.source.trust, "authoritative");
  assert.equal(detail.source.sourceRef.refId, "prd:canonical");
  assert.equal(detail.source.sourceRef.refId.includes("legacy"), false);
  assert.equal(detail.productMode.effectiveProductMode, "blocked");
  assert.equal(detail.productMode.operationalMode, "unavailable");
  assert.equal(detail.productMode.capabilityState, "gated");
  assert.equal(detail.readinessComponents.find((component) => component.componentId === "quality_gates").state, "blocked");
  assert.equal(detail.qualityGates.find((gate) => gate.gateId === "quality:dashboard").state, "blocked");
  assert.equal(detail.deliveryEvidence[0].status, "blocked");
  assert.equal(detail.retentionEvidence[0].disposition, "metadata_only");
  assert.equal(detail.authority.githubMutationAllowed, false);
  assert.equal(detail.metadataOnly, true);
  assert.equal(detail.rawPayloadRetained, false);

  const unavailable = model.packetDetails.byPacketId["packet-canonical-unavailable"].canonical;
  assert.equal(unavailable.availability, "unavailable");
  assert.equal(unavailable.source, null);
  assert.equal(unavailable.productMode, null);
  assert.equal(unavailable.readinessComponents.length, 0);
  assert.equal(unavailable.deliveryEvidence.length, 0);
  assert.equal(model.activeBoard.stageLanes.flatMap((lane) => lane.packetCards).find((item) => item.packetId === "packet-canonical-unavailable").canonicalPostureLabel, "canonical posture unavailable");
});

test("backpressure prefers backend Execute admission truth and keeps legacy metadata signals conservative", async () => {
  const {
    buildPipelineActiveBoardViewModel,
    deriveBackpressureState,
    isDispatchAffectingManagerState,
  } = await loadActiveBoardViewModelModule();

  const enforcedProjection = projectionFixture({
    executeAdmission: executeAdmissionFixture({
      state: "blocked",
      capacityAvailable: false,
      typedReason: "review_wip_limit_reached",
      observed: { review: 1, deliver: 0, verification: 0, operatorTesting: 0 },
      blockingDimensions: ["review"],
      nextSafeAction: "Complete Review work before retrying Execute admission.",
      evidenceRefs: ["evidence:wip-policy-supervisor-wip-v0", "evidence:wip-review-1-of-1"],
    }),
  });
  const enforcedBackpressure = deriveBackpressureState(enforcedProjection);
  assert.equal(enforcedBackpressure.reason, "review_overloaded");
  assert.equal(enforcedBackpressure.source, "executeAdmission");
  assert.equal(enforcedBackpressure.severity, "high");
  assert.equal(enforcedBackpressure.nextSafeAction, enforcedProjection.executeAdmission.nextSafeAction);
  assert.equal(JSON.stringify(enforcedBackpressure.affectedStages), "[\"review\"]");
  assert.equal(enforcedBackpressure.backendWip.typedReason, "review_wip_limit_reached");
  assert.equal(enforcedBackpressure.backendWip.observed.review, 1);
  assert.equal(enforcedBackpressure.backendWip.limits.review, 1);
  assert.equal(enforcedBackpressure.backendWip.evidenceRefs[1], "evidence:wip-review-1-of-1");

  const unavailableAdmission = deriveBackpressureState(projectionFixture({
    executeAdmission: executeAdmissionFixture({
      state: "unavailable",
      capacityAvailable: false,
      typedReason: "runtime_unavailable",
      source: "unavailable",
      limits: null,
      observed: null,
      nextSafeAction: "Restore supervisor admission truth.",
      evidenceRefs: ["evidence:wip-admission-unavailable"],
    }),
    workPackets: [packetFixture({ currentStage: "review", status: "blocked" })],
  }));
  assert.equal(unavailableAdmission.reason, "readiness_blocked");
  assert.equal(unavailableAdmission.source, "executeAdmission");
  assert.equal(unavailableAdmission.backendWip.state, "unavailable");
  assert.equal(unavailableAdmission.summary, "Backend Execute admission capability is unavailable.");

  const blockedQueueProjection = projectionFixture({
    queueSummary: {
      ...queueSummaryFixture(),
      blockedCount: 3,
      dispatchableCount: 0,
      emptyReason: "blocked",
      summary: "Review queue is blocked.",
    },
  });
  const blockedBackpressure = deriveBackpressureState(blockedQueueProjection);
  assert.equal(blockedBackpressure.reason, "queue_blocked");
  assert.equal(blockedBackpressure.source, "queueSummary");
  assert.equal(blockedBackpressure.metadataOnly, true);
  assert.equal(blockedBackpressure.rawPayloadRetained, false);
  assert.equal(blockedBackpressure.backendWip, null);
  assert.match(blockedBackpressure.nextSafeAction, /Inspect blockers/);

  const blockedDispatchState = isDispatchAffectingManagerState(
    blockedQueueProjection.managerSummary,
    blockedQueueProjection.queueSummary,
    blockedQueueProjection
  );
  assert.equal(blockedDispatchState.visible, false);

  const usageProjection = projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      inactivityReason: "usage_limited",
      summary: "Usage is constrained.",
    },
  });
  assert.equal(deriveBackpressureState(usageProjection).reason, "usage_limited");

  const readyToTestProjection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-ready-pressure",
        currentStage: "review",
        status: "complete",
        readyToTest: readyToTestFixture({ readyId: "ready:pressure", evidenceRefs: ["ready:pressure:evidence"] }),
      }),
    ],
  });
  const readyToTestModel = buildPipelineActiveBoardViewModel(readyToTestProjection);
  assert.equal(readyToTestModel.summary.backpressure, null, "packet and stage counts cannot override ready backend Execute admission");
  assert.equal(readyToTestModel.packetDetails.byPacketId["packet-ready-pressure"].backpressure, null);

  const unrelatedPacketPressureModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-ready-pressure",
        currentStage: "review",
        status: "complete",
        readyToTest: readyToTestFixture({ readyId: "ready:pressure", evidenceRefs: ["ready:pressure:evidence"] }),
      }),
      packetFixture({
        packetId: "packet-execute-unrelated",
        currentStage: "execute",
        status: "active",
      }),
    ],
  }));
  assert.equal(unrelatedPacketPressureModel.packetDetails.byPacketId["packet-execute-unrelated"].backpressure, null);

  const unprovenReadyToTestModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-unproven-ready-pressure",
        currentStage: "review",
        status: "waiting",
        readyToTest: readyToTestFixture({ readyId: "ready:pressure", evidenceRefs: [] }),
      }),
    ],
  }));
  assert.equal(unprovenReadyToTestModel.summary.backpressure, null);

  const reviewBlockedProjection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-review-blocked",
        currentStage: "review",
        status: "blocked",
        blocker: "Review queue is overloaded.",
      }),
    ],
  });
  assert.equal(deriveBackpressureState(reviewBlockedProjection), null, "review cards cannot synthesize backend WIP pressure");

  const deliveryBlockedProjection = projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "packet-delivery-blocked",
        currentStage: "deliver",
        status: "blocked",
      }),
    ],
  });
  assert.equal(deriveBackpressureState(deliveryBlockedProjection), null, "delivery cards cannot synthesize backend WIP pressure");

  const resourceLimitedProjection = projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      inactivityReason: "resource_limited",
      summary: "CPU pressure is high.",
    },
    workPackets: [
      packetFixture({
        packetId: "packet-review-blocked",
        currentStage: "review",
        status: "blocked",
      }),
    ],
  });
  assert.equal(deriveBackpressureState(resourceLimitedProjection).reason, "resource_limited");

  const readinessBlockedProjection = projectionFixture({
    backendReachability: {
      state: "unavailable",
      checkedAt: "2026-07-02T20:00:00.000Z",
      reason: "backend_unavailable",
      summary: "Backend unavailable.",
    },
    workPackets: [
      packetFixture({
        packetId: "packet-review-blocked",
        currentStage: "review",
        status: "blocked",
      }),
    ],
  });
  assert.equal(deriveBackpressureState(readinessBlockedProjection).reason, "readiness_blocked");

  const verificationBlockedProjection = projectionFixture({
    queueSummary: {
      ...queueSummaryFixture(),
      emptyReason: "failure_budget_hit",
    },
  });
  assert.equal(deriveBackpressureState(verificationBlockedProjection).reason, "verification_overloaded");

  const fixtureBlockedProjection = projectionFixture({
    sourceLabel: "fixture",
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
    },
    workPackets: [
      packetFixture({
        packetId: "packet-fixture-review-blocked",
        currentStage: "review",
        status: "blocked",
      }),
    ],
  });
  assert.equal(deriveBackpressureState(fixtureBlockedProjection), null);

  const healthyModel = buildPipelineActiveBoardViewModel(projectionFixture());
  assert.equal(healthyModel.summary.backpressure, null);

  const backpressureJson = JSON.stringify(readyToTestModel.summary.backpressure);
  assert.equal(backpressureJson.includes("raw prompt"), false);
  assert.equal(backpressureJson.includes("provider payload"), false);
  assert.equal(backpressureJson.includes("tmux scrollback"), false);
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
  assert.equal(unavailableModel.summary.executionLoopHealth.state, "unavailable");
  assert.equal(unavailableModel.summary.executionLoopHealth.truthLabel, "unavailable");
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
  assert.equal(derivePacketPlacement(agedProjection.workPackets[0], agedProjection), "attention");
  assert.equal(derivePacketPlacement(agedProjection.workPackets[1], agedProjection), "hidden");
  assert.equal(agedModel.summary.activePacketCount, 1);
  assert.equal(agedModel.summary.readyToTestCount, 0);
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
  assert.equal(staleModel.summary.executionLoopHealth.state, "stale");
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
      summary: "Emergency stop line is active; dispatch is paused. Internal worker lease id manager-raw-123.",
    },
  }));
  assert.equal(emergencyStopModel.summary.dispatchAffectingManagerState.reason, "emergency_stop");
  assert.equal(JSON.stringify(emergencyStopModel.summary).includes("Emergency stop line is active"), false);
  assert.equal(JSON.stringify(emergencyStopModel.summary).includes("manager-raw-123"), false);

  const killStateModel = buildPipelineActiveBoardViewModel(projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      summary: "Kill state is active for failed workers.",
    },
  }));
  assert.equal(killStateModel.summary.dispatchAffectingManagerState.reason, "kill");
});

test("source exhaustion and dispatchability are driven by backend source and queue summaries only", async () => {
  const { buildPipelineActiveBoardViewModel, isDispatchAffectingManagerState } = await loadActiveBoardViewModelModule();

  const sourceStateOnlyExhaustedModel = buildPipelineActiveBoardViewModel(projectionFixture({
    truthSummary: {
      ...truthSummaryFixture(),
      backendEmpty: true,
      emptyReason: "healthy_empty",
    },
    sourceStates: [
      sourceStateFixture({
        state: "exhausted",
        evidenceRefs: ["evidence:source-exhausted"],
      }),
    ],
    queueSummary: {
      ...queueSummaryFixture(),
      sourceExhausted: false,
      emptyReason: "healthy_empty",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      sourceExhausted: false,
      inactivityReason: null,
      summary: "Manager healthy; no backend queue exhaustion reported.",
    },
    workPackets: [],
  }));
  assert.equal(sourceStateOnlyExhaustedModel.summary.dispatchAffectingManagerState, null);
  assert.equal(sourceStateOnlyExhaustedModel.summary.activePacketCount, 0);
  assert.equal(sourceStateOnlyExhaustedModel.summary.attentionCount, 0);
  assert.equal(sourceStateOnlyExhaustedModel.summary.executionLoopHealth.state, "empty");
  assert.equal(sourceStateOnlyExhaustedModel.summary.executionLoopHealth.counts.exhausted, 1);

  const sourceExhaustedModel = buildPipelineActiveBoardViewModel(projectionFixture({
    truthSummary: {
      ...truthSummaryFixture(),
      backendEmpty: true,
      emptyReason: "source_exhausted",
      summary: "Backend source state proves source exhaustion.",
    },
    sourceStates: [
      sourceStateFixture({
        state: "exhausted",
        evidenceRefs: ["evidence:source-exhausted"],
      }),
    ],
    queueSummary: {
      ...queueSummaryFixture(),
      sourceExhausted: true,
      emptyReason: "source_exhausted",
      summary: "Queue source is exhausted.",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      sourceExhausted: true,
      inactivityReason: "source_exhausted",
      summary: "Manager has no dispatchable work because the source is exhausted.",
    },
    workPackets: [],
  }));
  assert.equal(sourceExhaustedModel.summary.dispatchAffectingManagerState.reason, "source_exhausted");
  assert.equal(sourceExhaustedModel.summary.dispatchAffectingManagerState.summary, "Source work exhausted.");
  assert.equal(sourceExhaustedModel.summary.activePacketCount, 0);
  assert.equal(sourceExhaustedModel.summary.attentionCount, 1);
  assert.equal(sourceExhaustedModel.summary.executionLoopHealth.state, "exhausted");

  const backendMovingModel = buildPipelineActiveBoardViewModel(projectionFixture({
    queueSummary: {
      ...queueSummaryFixture(),
      activeCount: 2,
      emptyReason: null,
    },
    workerSummary: {
      ...workerSummaryFixture(),
      stateSource: "supervisor_projection",
      freshnessState: "live",
      activeCount: 1,
    },
    truthSummary: {
      ...truthSummaryFixture(),
      backendEmpty: false,
      emptyReason: null,
    },
    workPackets: [],
  }));
  assert.equal(backendMovingModel.summary.executionLoopHealth.counts.moving, 2);
  assert.equal(backendMovingModel.summary.executionLoopHealth.state, "moving");

  const unhealthyWorkerModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workerSummary: {
      ...workerSummaryFixture(),
      stateSource: "supervisor_projection",
      freshnessState: "live",
      failedCount: 1,
    },
    workPackets: [
      packetFixture({
        packetId: "operator-can-act",
        currentStage: "needs_approval",
        status: "blocked",
        blocker: "Operator approval required.",
        nextAction: "Approve or reject the packet.",
      }),
    ],
  }));
  assert.equal(unhealthyWorkerModel.summary.attentionCount, 1);
  assert.equal(unhealthyWorkerModel.summary.executionLoopHealth.state, "blocked");

  const failedRecoveryModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "failed-recovery",
        currentStage: "execute",
        status: "failed",
        blocker: "Worker command failed.",
        nextAction: "Inspect recovery details.",
      }),
    ],
  }));
  const failedRecoveryCard = failedRecoveryModel.attentionItems[0];
  assert.equal(failedRecoveryCard.attentionKind, "recovery_needed");
  assert.equal(failedRecoveryCard.attentionReasonLabel, "Recovery needed");
  assert.equal(failedRecoveryCard.nextOperatorActionLabel, "Inspect recovery details.");

  const stalledModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "stalled-active",
        currentStage: "execute",
        status: "active",
        blocker: "Worker is stalled.",
        nextAction: "Inspect stalled lane.",
      }),
    ],
  }));
  assert.equal(stalledModel.attentionItems[0].attentionKind, "stalled");
  assert.equal(stalledModel.attentionItems[0].attentionReasonLabel, "Stalled");

  const missingEvidenceModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "ready-missing-evidence",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: [],
      }),
    ],
  }));
  const missingEvidenceCard = missingEvidenceModel.attentionItems[0];
  assert.equal(missingEvidenceCard.attentionKind, "missing_evidence");
  assert.equal(missingEvidenceCard.attentionReasonLabel, "Evidence needed");
  assert.equal(missingEvidenceCard.nextOperatorActionLabel, "Ready-to-test claim needs live evidence.");

  const detailMissingEvidenceModel = buildPipelineActiveBoardViewModel(projectionFixture({
    selectedPacketDetails: [
      detailFixture({
        packetId: "detail-empty-evidence",
        evidenceRefs: [],
        nextAction: "Ready to test in /pipeline.",
      }),
    ],
    workPackets: [
      packetFixture({
        packetId: "detail-empty-evidence",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["packet:evidence-should-not-upgrade-detail"],
      }),
    ],
  }));
  assert.equal(detailMissingEvidenceModel.summary.readyToTestCount, 0);
  assert.equal(detailMissingEvidenceModel.attentionItems[0].attentionKind, "missing_evidence");

  const activeReadyLanguageModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "active-ready-language",
        currentStage: "execute",
        status: "active",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["packet:evidence"],
      }),
    ],
  }));
  assert.equal(activeReadyLanguageModel.summary.readyToTestCount, 0);
  assert.equal(activeReadyLanguageModel.attentionItems[0].attentionKind, "missing_evidence");

  const structuredReadyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    selectedPacketDetails: [
      detailFixture({
        packetId: "structured-ready",
        currentStage: "execute",
        status: "complete",
        evidenceRefs: [],
        nextAction: null,
        readyToTest: readyToTestFixture({
          readyId: "ready:structured",
          evidenceRefs: ["proof:structured"],
          verificationRefs: ["check:dashboard"],
        }),
      }),
    ],
    workPackets: [
      packetFixture({
        packetId: "structured-ready",
        currentStage: "execute",
        status: "complete",
        nextAction: null,
        evidenceRefs: [],
        readyToTest: readyToTestFixture({
          readyId: "ready:structured",
          evidenceRefs: ["proof:structured"],
          verificationRefs: ["check:dashboard"],
        }),
      }),
    ],
  }));
  assert.equal(structuredReadyModel.summary.readyToTestCount, 1);
  assert.equal(structuredReadyModel.readyToTestItems[0].packetId, "structured-ready");
  assert.equal(structuredReadyModel.readyToTestItems[0].attention, false);

  const operatorWordedStructuredReadyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    selectedPacketDetails: [
      detailFixture({
        packetId: "operator-worded-ready",
        currentStage: "execute",
        status: "complete",
        nextAction: "Operator can test in /pipeline.",
        readyToTest: readyToTestFixture({
          readyId: "ready:operator-worded",
          evidenceRefs: ["proof:operator-worded"],
          verificationRefs: ["check:dashboard"],
        }),
      }),
    ],
    workPackets: [
      packetFixture({
        packetId: "operator-worded-ready",
        currentStage: "execute",
        status: "complete",
        nextAction: "Operator can test in /pipeline.",
        readyToTest: readyToTestFixture({
          readyId: "ready:operator-worded",
          evidenceRefs: ["proof:operator-worded"],
          verificationRefs: ["check:dashboard"],
        }),
      }),
    ],
  }));
  assert.equal(operatorWordedStructuredReadyModel.summary.readyToTestCount, 1);
  assert.equal(operatorWordedStructuredReadyModel.attentionItems.some((item) => item.packetId === "operator-worded-ready"), false);

  const approvalReadyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "approval-ready",
        currentStage: "needs_approval",
        status: "complete",
        nextAction: "Ready to test in /pipeline after approval.",
        evidenceRefs: ["packet:evidence"],
      }),
    ],
  }));
  assert.equal(approvalReadyModel.summary.readyToTestCount, 0);
  assert.equal(approvalReadyModel.attentionItems[0].attentionKind, "approval_required");

  const detailOverridesPacketReadyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    selectedPacketDetails: [
      detailFixture({
        packetId: "detail-not-ready",
        currentStage: "execute",
        status: "complete",
        evidenceRefs: ["detail:evidence"],
        nextAction: "Continue review before operator testing.",
      }),
    ],
    workPackets: [
      packetFixture({
        packetId: "detail-not-ready",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["detail:evidence"],
      }),
    ],
  }));
  assert.equal(detailOverridesPacketReadyModel.summary.readyToTestCount, 0);
  assert.equal(detailOverridesPacketReadyModel.readyToTestItems.length, 0);

  const staleDetailReadyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    selectedPacketDetails: [
      detailFixture({
        packetId: "stale-detail-ready",
        currentStage: "execute",
        status: "complete",
        truthLabel: "stale",
        evidenceRefs: ["detail:evidence"],
        nextAction: "Ready to test in /pipeline.",
      }),
    ],
    workPackets: [
      packetFixture({
        packetId: "stale-detail-ready",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["packet:evidence"],
      }),
    ],
  }));
  assert.equal(staleDetailReadyModel.summary.readyToTestCount, 0);
  assert.equal(staleDetailReadyModel.attentionItems[0].attentionKind, "missing_evidence");

  const denseReadyLabelModel = buildPipelineActiveBoardViewModel(projectionFixture({
    workPackets: [
      packetFixture({
        packetId: "dense-ready",
        currentStage: "execute",
        status: "complete",
        nextAction: "Ready to test in /pipeline with check:dashboard and attempt:codex-123 proof.",
        evidenceRefs: ["packet:evidence"],
      }),
    ],
  }));
  assert.equal(denseReadyLabelModel.readyToTestItems[0].nextActionLabel, "Ready to test");
  assert.equal(JSON.stringify(denseReadyLabelModel.readyToTestItems[0]).includes("attempt:codex-123"), false);

  const gatedControlModel = buildPipelineActiveBoardViewModel(projectionFixture({
    gatedControls: [
      {
        controlId: "control:kill-worker",
        operation: "kill_worker",
        status: "gated",
        authorityFamily: "worker-process-control",
        stopLine: "Do not kill workers from pipeline reliability metadata.",
        nextAction: "Request explicit approval.",
        packetId: "gated-packet",
        workerRefs: ["worker:codex-2"],
        evidenceRefs: ["control:kill-worker"],
        metadataOnly: true,
      },
    ],
    workPackets: [
      packetFixture({
        packetId: "gated-packet",
        currentStage: "needs_approval",
        status: "blocked",
        blocker: "Gated worker operation.",
        nextAction: "Do not kill workers from pipeline reliability metadata.",
      }),
    ],
  }));
  const gatedCard = gatedControlModel.attentionItems[0];
  assert.equal(gatedCard.attentionKind, "gated");
  assert.equal(gatedCard.attentionReasonLabel, "Gated operation");
  assert.equal(gatedCard.nextOperatorActionLabel, "Request explicit approval.");
  assert.equal(JSON.stringify(gatedCard).includes("control:kill-worker"), false);
  assert.equal(JSON.stringify(gatedCard).includes("worker:codex-2"), false);
  assert.equal(JSON.stringify(gatedCard).includes("Do not kill workers"), false);
  assert.equal(gatedControlModel.summary.attentionCount, 1);
  assert.equal(gatedControlModel.summary.executionLoopHealth.counts.actionNeeded, 1);
  assert.equal(gatedControlModel.summary.executionLoopHealth.state, "blocked");

  const activeGatedControlModel = buildPipelineActiveBoardViewModel(projectionFixture({
    gatedControls: [
      {
        controlId: "control:cleanup-worktree",
        operation: "cleanup",
        status: "gated",
        authorityFamily: "workspace-cleanup",
        stopLine: "cleanup requires scoped evidence",
        nextAction: "cleanup worker codex-2 after approval",
        packetId: "active-gated-packet",
        workerRefs: ["codex-2"],
        evidenceRefs: ["control:cleanup-worktree"],
        metadataOnly: true,
      },
    ],
    workPackets: [
      packetFixture({
        packetId: "active-gated-packet",
        currentStage: "execute",
        status: "complete",
        blocker: null,
        nextAction: "Ready to test in /pipeline.",
        evidenceRefs: ["packet:evidence"],
      }),
    ],
  }));
  assert.equal(activeGatedControlModel.summary.readyToTestCount, 0);
  assert.equal(activeGatedControlModel.attentionItems[0].attentionKind, "gated");
  assert.equal(activeGatedControlModel.attentionItems[0].nextOperatorActionLabel, "Request explicit approval.");
  assert.equal(JSON.stringify(activeGatedControlModel.attentionItems[0]).includes("codex-2"), false);
  assert.equal(activeGatedControlModel.summary.attentionCount, 1);
  assert.equal(activeGatedControlModel.summary.executionLoopHealth.counts.actionNeeded, 1);

  const blockedHealthModel = buildPipelineActiveBoardViewModel(projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      reliabilityState: "blocked",
      blockedQueueCount: 1,
      summary: "One packet is blocked.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      blockedCount: 1,
      emptyReason: "blocked",
    },
    workPackets: [
      packetFixture({
        packetId: "blocked-health",
        currentStage: "execute",
        status: "blocked",
        blocker: "Waiting for operator input.",
        nextAction: "Clear blocker.",
      }),
    ],
  }));
  assert.equal(blockedHealthModel.summary.executionLoopHealth.state, "blocked");
  assert.equal(blockedHealthModel.summary.executionLoopHealth.label, "Work blocked");

  const deliverReadyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    selectedPacketDetails: [
      detailFixture({
        packetId: "deliver-ready",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Operator can test in /pipeline.",
        readyToTest: readyToTestFixture({
          readyId: "ready:deliver",
          evidenceRefs: ["proof:deliver"],
          verificationRefs: ["check:dashboard"],
        }),
      }),
    ],
    workPackets: [
      packetFixture({
        packetId: "deliver-ready",
        currentStage: "deliver",
        status: "complete",
        nextAction: "Delivery handoff is waiting for the operator.",
        readyToTest: readyToTestFixture({
          readyId: "ready:deliver",
          evidenceRefs: ["proof:deliver"],
          verificationRefs: ["check:dashboard"],
        }),
      }),
    ],
  }));
  assert.equal(deliverReadyModel.summary.readyToTestCount, 1);
  assert.equal(deliverReadyModel.readyToTestItems[0].packetId, "deliver-ready");

  const packetCountOnlyModel = buildPipelineActiveBoardViewModel(projectionFixture({
    stageSummaries: projectionStageSummariesFixture({
      execute: { packetCount: 99, emptyReason: null },
      route: { packetCount: 12, emptyReason: null },
    }),
    managerSummary: {
      ...managerSummaryFixture(),
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      warmWorkerCount: 6,
      dispatchableQueueCount: 0,
      summary: "Workers are warm but backend queue reports no dispatchable work.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 0,
      sourceExhausted: false,
    },
    workPackets: [],
  }));
  assert.equal(packetCountOnlyModel.summary.activePacketCount, 0);
  assert.equal(packetCountOnlyModel.summary.dispatchAffectingManagerState, null);

  const queueOnlyReadyWorkModel = buildPipelineActiveBoardViewModel(projectionFixture({
    managerSummary: {
      ...managerSummaryFixture(),
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      dispatchableQueueCount: 0,
      summary: "Manager mirror is stale but queue summary reports ready work.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 4,
      summary: "Backend queue reports ready work.",
    },
  }));
  assert.equal(queueOnlyReadyWorkModel.summary.dispatchAffectingManagerState.reason, "idle_with_ready_work");
  assert.equal(queueOnlyReadyWorkModel.summary.dispatchAffectingManagerState.summary, "Ready work exists but workers are idle.");

  const fixtureArrayModel = buildPipelineActiveBoardViewModel(projectionFixture({
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
      summary: "Fixture fallback cannot create live dispatchability.",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      warmWorkerCount: 6,
      dispatchableQueueCount: 5,
      summary: "Fixture manager text mentions dispatchable work.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 5,
      summary: "Fixture queue text mentions dispatchable work.",
    },
    workPackets: [
      packetFixture({
        packetId: "fixture-active-card",
        truthLabel: "fixture",
        status: "active",
      }),
    ],
  }));
  assert.equal(fixtureArrayModel.summary.activePacketCount, 0);
  assert.equal(fixtureArrayModel.summary.dispatchAffectingManagerState, null);
  assert.equal(fixtureArrayModel.summary.executionLoopHealth.state, "unknown");
  assert.equal(fixtureArrayModel.diagnostics.items.some((item) => item.value.includes("fixture-active-card")), true);

  const fixtureSourceExhaustedModel = buildPipelineActiveBoardViewModel(projectionFixture({
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
      emptyReason: "source_exhausted",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      sourceExhausted: true,
      inactivityReason: "source_exhausted",
      summary: "Fixture source exhausted text must not create backend exhaustion.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      sourceExhausted: true,
      emptyReason: "source_exhausted",
    },
  }));
  assert.equal(fixtureSourceExhaustedModel.summary.dispatchAffectingManagerState, null);
  assert.equal(fixtureSourceExhaustedModel.summary.executionLoopHealth.state, "unknown");

  const fixtureEmergencyStopModel = buildPipelineActiveBoardViewModel(projectionFixture({
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
    },
    managerSummary: {
      ...managerSummaryFixture(),
      summary: "Emergency stop line is active; fixture mode must still show the stop line.",
    },
  }));
  assert.equal(fixtureEmergencyStopModel.summary.dispatchAffectingManagerState.reason, "emergency_stop");

  const fixtureUsageLimitedModel = buildPipelineActiveBoardViewModel(projectionFixture({
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
    },
    managerSummary: {
      ...managerSummaryFixture(),
      inactivityReason: "usage_limited",
      summary: "Dispatch paused because usage is limited.",
    },
  }));
  assert.equal(fixtureUsageLimitedModel.summary.dispatchAffectingManagerState.reason, "usage_limited");

  const fixtureResourceLimitedModel = buildPipelineActiveBoardViewModel(projectionFixture({
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
    },
    managerSummary: {
      ...managerSummaryFixture(),
      inactivityReason: "resource_limited",
      summary: "Dispatch paused because host resources are limited.",
    },
  }));
  assert.equal(fixtureResourceLimitedModel.summary.dispatchAffectingManagerState.reason, "resource_limited");

  const truthStaleModel = buildPipelineActiveBoardViewModel(projectionFixture({
    truthSummary: {
      ...truthSummaryFixture(),
      stale: true,
      summary: "Truth summary is stale despite live labels.",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      dispatchableQueueCount: 3,
      summary: "Stale truth must not create idle-ready-work.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 3,
    },
  }));
  assert.equal(truthStaleModel.summary.dispatchAffectingManagerState, null);

  const unknownReachabilityModel = buildPipelineActiveBoardViewModel(projectionFixture({
    backendReachability: {
      state: "unknown",
      checkedAt: "2026-07-02T20:00:00.000Z",
      reason: "unknown",
      summary: "Backend reachability unknown.",
    },
    managerSummary: {
      ...managerSummaryFixture(),
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      dispatchableQueueCount: 3,
      summary: "Unknown reachability must not create idle-ready-work.",
    },
    queueSummary: {
      ...queueSummaryFixture(),
      dispatchableCount: 3,
    },
  }));
  assert.equal(unknownReachabilityModel.summary.dispatchAffectingManagerState, null);
  assert.equal(unknownReachabilityModel.summary.executionLoopHealth.state, "unknown");

  const blockedQueueState = isDispatchAffectingManagerState(
    {
      ...managerSummaryFixture(),
      sourceExhausted: false,
      inactivityReason: "blocked",
      summary: "Backend queue is blocked.",
    },
    {
      ...queueSummaryFixture(),
      blockedCount: 2,
      dispatchableCount: 0,
      sourceExhausted: false,
      emptyReason: "blocked",
    }
  );
  assert.equal(blockedQueueState.visible, false);

  const gatedQueueState = isDispatchAffectingManagerState(
    {
      ...managerSummaryFixture(),
      sourceExhausted: false,
      inactivityReason: "approval_required",
      summary: "Backend queue is gated.",
    },
    {
      ...queueSummaryFixture(),
      gatedCount: 2,
      dispatchableCount: 0,
      sourceExhausted: false,
      emptyReason: "approval_required",
    }
  );
  assert.equal(gatedQueueState.visible, false);
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
    stageSummaries: projectionStageSummariesFixture(),
    sourceStates: [],
    workPackets: [],
    selectedPacketDetails: [],
    managerSummary: managerSummaryFixture(),
    workerSummary: workerSummaryFixture(),
    reliabilityProblems: [],
    gatedControls: [],
    executeAdmission: executeAdmissionFixture(),
    queueSummary: queueSummaryFixture(),
    evidenceRefs: [],
  };
  return { ...base, ...overrides };
}

function runtimeReadinessFixture(overrides = {}) {
  return {
    schemaVersion: "pipeline-operational-runtime-readiness/v0",
    actionSchemaVersion: "pipeline-operational-action/v0",
    readinessState: "ready",
    operationalMode: "local_proof",
    freshnessState: "live",
    capabilityState: "available",
    typedReason: null,
    checkedAt: "2026-07-02T20:00:00.000Z",
    expiresAt: "2026-07-02T20:05:00.000Z",
    summary: "Runtime readiness fixture.",
    actionCapabilities: [],
    actionCapabilitiesV1: [],
    evidenceRefs: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function runtimeCapabilityFixture(actionId, overrides = {}) {
  return {
    schemaVersion: "pipeline-operational-action/v1",
    actionId,
    targetType: "runtime",
    targetId: "supervisor-runtime",
    actionContext: {
      kind: actionId,
      expectedRuntimeMode: "paused",
      expectedRuntimeRevision: 7,
    },
    actionContextDigestSha256: "sha256:resume-context",
    sourceMode: "supervisor_runtime",
    capabilityState: "available",
    authorityState: "needs_authority_approval",
    riskTier: "low",
    typedReason: null,
    expectedResultSummary: "Transition the supervisor runtime with the exact server-projected fence.",
    correlationRequired: true,
    idempotencyRequired: true,
    serverBound: true,
    evidenceRefs: ["operational-action:capability:runtime"],
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function executeAdmissionFixture(overrides = {}) {
  return {
    schemaVersion: "pipeline-execute-admission/v0",
    policyVersion: "supervisor-wip/v0",
    state: "ready",
    capacityAvailable: true,
    typedReason: "capacity_available",
    source: "supervisor_settings",
    limits: { review: 1, deliver: 1, verification: 1, operatorTesting: 1 },
    observed: { review: 0, deliver: 0, verification: 0, operatorTesting: 0 },
    blockingDimensions: [],
    nextSafeAction: "New Execute work may be admitted.",
    evidenceRefs: ["evidence:wip-policy-supervisor-wip-v0", "evidence:wip-capacity-available"],
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function projectionStageSummariesFixture(overrides = {}) {
  return [
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
    packetCount: overrides[stage]?.packetCount ?? 0,
    sourceLabel: overrides[stage]?.sourceLabel ?? "live",
    freshnessState: overrides[stage]?.freshnessState ?? "live",
    emptyReason: overrides[stage]?.emptyReason ?? "healthy_empty",
  }));
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
    reliabilityState: "running",
    freshnessState: "live",
    activeLeaseCount: 1,
    activeWorkerCount: 1,
    warmWorkerCount: 6,
    blockedQueueCount: 0,
    dispatchableQueueCount: 0,
    closedQueueCount: 0,
    healthySourceCount: 0,
    exhaustedSourceCount: 0,
    blockedSourceCount: 0,
    gatedSourceCount: 0,
    staleSourceCount: 0,
    unavailableSourceCount: 0,
    refillingSourceCount: 0,
    unknownSourceCount: 0,
    sourceExhausted: false,
    inactivityReason: null,
    evidenceRefs: ["manager:fixture"],
    summary: "Manager healthy.",
    metadataOnly: true,
  };
}

function workerSummaryFixture() {
  return {
    stateSource: "unknown",
    freshnessState: "unknown",
    warmCount: null,
    activeCount: null,
    waitingCount: null,
    stalledCount: null,
    failedCount: null,
    drainingCount: null,
    killedCount: null,
    completeCount: null,
    unavailableCount: null,
    unknownCount: null,
    workerRefs: [],
    evidenceRefs: [],
    summary: "Worker metadata unavailable.",
    metadataOnly: true,
  };
}

function queueSummaryFixture() {
  return {
    activeCount: 0,
    dispatchableCount: 0,
    blockedCount: 0,
    gatedCount: 0,
    closedCount: 0,
    staleCount: 0,
    refillingCount: 0,
    unknownCount: 0,
    emptyReason: "healthy_empty",
    sourceExhausted: false,
    summary: "Queue healthy.",
  };
}

function sourceStateFixture(overrides = {}) {
  return {
    sourceId: "source:test",
    sourceRef: "source:test",
    sourceKind: "manual",
    state: "healthy",
    summary: "Source state fixture.",
    evidenceRefs: [],
    updatedAt: "2026-07-02T20:00:00.000Z",
    metadataOnly: true,
    ...overrides,
  };
}

function authorityProhibitionsFixture() {
  return {
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
    rawPayloadRetentionAllowed: false,
  };
}

function canonicalReadinessFixture(overrides = {}) {
  return Object.fromEntries([
    "source_provenance",
    "trust_boundary",
    "authority_boundary",
    "evidence_retention",
    "quality_gates",
    "delivery_evidence",
  ].map((componentId) => [componentId, overrides[componentId] ?? {
    componentId,
    requirement: "required",
    state: "pass",
    evidenceRefs: [`evidence:${componentId}`],
  }]));
}

function canonicalContractFixture(overrides = {}) {
  return {
    schemaVersion: "pipeline-canonical-contract/v1",
    productMode: "read_only",
    canonicalSource: {
      sourceId: "source:canonical-prd",
      role: "canonical",
      trust: "authoritative",
      provenance: {
        sourceRef: {
          refId: "prd:canonical",
          sourceType: "prd",
          pathOrUrl: "docs/product/canonical-prd.md",
          title: "Canonical PRD",
        },
        observedAt: "2026-07-12T18:00:00.000Z",
        evidenceRefs: ["evidence:canonical-source"],
      },
      authority: authorityProhibitionsFixture(),
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    qualityGates: {
      kind: "all_of",
      gateId: "quality:all",
      children: [{
        kind: "gate",
        gateId: "quality:dashboard",
        requirement: "required",
        state: "blocked",
        evidenceRefs: ["evidence:quality-blocked"],
      }],
    },
    readinessComponents: canonicalReadinessFixture(),
    deliveryEvidence: [{
      deliveryId: "delivery:pr",
      action: "pull_request",
      status: "blocked",
      target: { repository: "slawdawg/Kendall-vnxt", baseBranch: "dev" },
      evidence: {
        evidenceId: "evidence:delivery-pr",
        disposition: "metadata_only",
        evidenceRefs: ["evidence:delivery-blocked"],
        metadataOnly: true,
        rawPayloadRetained: false,
      },
      authority: authorityProhibitionsFixture(),
      deliveryAuthorityGranted: false,
      metadataOnly: true,
      rawPayloadRetained: false,
    }],
    authority: authorityProhibitionsFixture(),
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function productModeMappingFixture(overrides = {}) {
  return {
    requestedProductMode: "read_only",
    effectiveProductMode: "read_only",
    operationalMode: "read_only",
    readinessState: "ready",
    freshnessState: "live",
    capabilityState: "gated",
    checkedAt: "2026-07-12T18:00:00.000Z",
    expiresAt: "2026-07-12T18:05:00.000Z",
    ready: true,
    blockedReasons: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
    ...overrides,
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
    canonicalContract: null,
    productModeMapping: null,
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
    canonicalContract: null,
    productModeMapping: null,
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

function readyToTestFixture(overrides = {}) {
  return {
    readyId: "ready:packet-base",
    userFacingSummary: "Completed user-facing work is ready to test.",
    testableSurface: "/pipeline",
    verificationRefs: [],
    evidenceRefs: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}
