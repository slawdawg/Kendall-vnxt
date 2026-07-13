import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readdir, readFile, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

const packageJsonPath = new URL("../package.json", import.meta.url);
const nextConfigPath = new URL("../apps/dashboard/next.config.ts", import.meta.url);
const routePath = new URL("../apps/dashboard/src/app/pipeline/page.tsx", import.meta.url);
const demoRoutePath = new URL("../apps/dashboard/src/app/pipeline/demo/page.tsx", import.meta.url);
const packetDetailRoutePath = new URL("../apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx", import.meta.url);
const settingsRoutePath = new URL("../apps/dashboard/src/app/settings/page.tsx", import.meta.url);
const settingsUsageVisibilityPath = new URL("../apps/dashboard/src/components/settings/usage-visibility-settings.tsx", import.meta.url);
const layoutPath = new URL("../apps/dashboard/src/app/layout.tsx", import.meta.url);
const pipelineComponentsPath = new URL("../apps/dashboard/src/components/pipeline/", import.meta.url);
const cockpitPath = new URL("pipeline-cockpit.tsx", pipelineComponentsPath);
const packetDetailPath = new URL("packet-detail-page.tsx", pipelineComponentsPath);
const fixturesPath = new URL("../apps/dashboard/src/lib/pipeline-fixtures.ts", import.meta.url);
const supervisorLibPath = new URL("../apps/dashboard/src/lib/supervisor.ts", import.meta.url);
const pipelineContractPath = new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url);
const projectionTruthPath = new URL("../apps/dashboard/src/lib/pipeline/projection-truth.ts", import.meta.url);
const activeBoardViewModelPath = new URL("../apps/dashboard/src/lib/pipeline/active-board-view-model.ts", import.meta.url);
const pipelineEvidenceSourcePath = new URL("../apps/dashboard/src/lib/pipeline-evidence-source.ts", import.meta.url);
const pipelinePacketLoaderPath = new URL("../apps/dashboard/src/lib/pipeline-packet-loader.ts", import.meta.url);
const managerExecutionLaneSummaryPath = new URL("../apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts", import.meta.url);
const realWorkPacketProofPath = new URL("../tests/fixtures/pipeline/pipeline-real-workpacket-proof-2026-07-02.json", import.meta.url);
const executionLoopReliabilityProofPath = new URL("../tests/fixtures/pipeline/pipeline-execution-loop-reliability-proof-2026-07-04.json", import.meta.url);
const operationalActionLoopProofPath = new URL("../tests/fixtures/pipeline/pipeline-operational-action-loop-proof-2026-07-10.json", import.meta.url);
const globalsPath = new URL("../apps/dashboard/src/app/globals.css", import.meta.url);
const shellPath = new URL("../apps/dashboard/src/components/shell.tsx", import.meta.url);
const graphBackgroundPath = new URL("../apps/dashboard/src/components/dashboard-graph-background.tsx", import.meta.url);
const realtimeRefreshPath = new URL("../apps/dashboard/src/components/realtime-refresh.tsx", import.meta.url);
const navPath = new URL("../apps/dashboard/src/components/operational-nav.tsx", import.meta.url);
const setupE2ePath = new URL("../scripts/setup-e2e.mjs", import.meta.url);
const pipelineImportBoundaryCheckPath = new URL("../scripts/check-dashboard-pipeline-import-boundary.mjs", import.meta.url);
const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));

function loadManagerExecutionLaneSummaryModule(source) {
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
  vm.runInNewContext(output, context, { filename: "manager-execution-lane-summary.ts" });
  return context.module.exports;
}

function loadProjectionTruthModule(source) {
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
  vm.runInNewContext(output, context, { filename: "projection-truth.ts" });
  return context.module.exports;
}

function loadActiveBoardViewModelModule(source) {
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

function loadPipelineCockpitModule(source, projectionTruthModule, activeBoardViewModelModule) {
  const ts = dashboardRequire("typescript");
  const react = dashboardRequire("react");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    module: { exports: {} },
    require: (specifier) => {
      if (specifier === "react") {
        return react;
      }
      if (specifier === "react/jsx-runtime") {
        return dashboardRequire("react/jsx-runtime");
      }
      if (specifier === "next/link") {
        const Link = ({ children, href, ...props }) => react.createElement("a", { ...props, href }, children);
        return { __esModule: true, default: Link };
      }
      if (specifier === "../../lib/pipeline/projection-truth") {
        return projectionTruthModule;
      }
      if (specifier === "../../lib/pipeline/active-board-view-model") {
        return activeBoardViewModelModule;
      }
      if (specifier === "../../lib/supervisor") {
        return {
          getPipelineDashboardProjection: async () => {
            throw new Error("server-render test does not refresh projection");
          },
        };
      }
      if (specifier === "../../lib/pipeline-packet-loader") {
        return {
          applyPipelineOperationalAction: async () => {
            throw new Error("server-render test does not apply operational actions");
          },
        };
      }
      throw new Error(`Unexpected PipelineCockpit test import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-cockpit.tsx" });
  return context.module.exports;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNonLiveProofClaims(value, path = []) {
  const nonLiveStates = new Set(["fixture", "stale", "simulated", "dry-run", "unknown", "terminal-only", "backend-unavailable", "unavailable"]);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findNonLiveProofClaims(item, [...path, String(index)]));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const entries = Object.entries(value);
  const hasNonLiveState = entries.some(([, entryValue]) => typeof entryValue === "string" && nonLiveStates.has(entryValue.toLowerCase()));
  const hasLiveProofClaim = entries.some(([key, entryValue]) => (
    entryValue === true
    && /canSatisfyLive(?:Movement)?Proof|displayedAsLive|satisfiesLiveProof|liveProofSatisfied/i.test(key)
  ));
  const current = hasNonLiveState && hasLiveProofClaim ? [path.join(".") || "<root>"] : [];
  return current.concat(entries.flatMap(([key, entryValue]) => findNonLiveProofClaims(entryValue, [...path, key])));
}

function sourceBetween(source, startMarker, endMarker) {
  assert.equal(
    [...source.matchAll(new RegExp(escapeRegExp(startMarker), "g"))].length,
    1,
    `expected exactly one source marker ${startMarker}`
  );
  assert.equal(
    [...source.matchAll(new RegExp(escapeRegExp(endMarker), "g"))].length,
    1,
    `expected exactly one source marker ${endMarker}`
  );
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker ${endMarker}`);
  return source.slice(start, end);
}

function projectionTruthChipPattern(label, value) {
  return new RegExp(`${escapeRegExp(label)}:<\\/span><span[^>]*>${escapeRegExp(value)}<\\/span>`);
}

function projectionFixture(overrides = {}) {
  const now = "2026-07-02T16:00:00.000Z";
  const baseWorkPacket = {
    packetId: "packet-story-3-1-live-control",
    title: "Story 3.1 live control packet",
    currentStage: "execute",
    status: "active",
    sourceRef: {
      refId: "story:3-1",
      sourceType: "bmad_story",
      pathOrUrl: "_bmad-output/implementation-artifacts/3-1-fixture-as-live-regression-tests.md",
      title: "Story 3.1",
    },
    blocker: null,
    nextAction: "Run fixture-as-live regression checks.",
    canonicalContract: null,
    productModeMapping: null,
    evidenceRefs: ["story:3-1"],
    truthLabel: "live",
    updatedAt: now,
    metadataOnly: true,
  };
  const base = {
    schemaVersion: "pipeline-dashboard-projection/v0",
    projectionId: "projection-story-3-1",
    generatedAt: now,
    sourceLabel: "live",
    freshnessState: "live",
    sourceUpdatedAt: now,
    staleAfterSeconds: 15,
    backendReachability: {
      state: "reachable",
      checkedAt: now,
      reason: null,
      summary: "Backend projection reachable.",
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
      summary: "Live backend projection.",
    },
    stageSummaries: [],
    workPackets: [baseWorkPacket],
    selectedPacketDetails: [],
    managerSummary: {
      stateSource: "supervisor_projection",
      reliabilityState: "ready",
      freshnessState: "live",
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      warmWorkerCount: 0,
      blockedQueueCount: 0,
      dispatchableQueueCount: 1,
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
      summary: "Manager metadata only.",
      metadataOnly: true,
    },
    workerSummary: {
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
      summary: "Worker metadata is unavailable to the projection.",
      metadataOnly: true,
    },
    reliabilityProblems: [],
    gatedControls: [],
    executeAdmission: {
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
      evidenceRefs: ["evidence:wip-capacity-available"],
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    queueSummary: {
      activeCount: 0,
      dispatchableCount: 1,
      blockedCount: 0,
      gatedCount: 0,
      closedCount: 0,
      staleCount: 0,
      refillingCount: 0,
      unknownCount: 0,
      emptyReason: null,
      sourceExhausted: false,
      summary: "Queue metadata only.",
    },
    evidenceRefs: ["story:3-1"],
  };
  return {
    ...base,
    ...overrides,
    backendReachability: { ...base.backendReachability, ...(overrides.backendReachability ?? {}) },
    fixtureMode: { ...base.fixtureMode, ...(overrides.fixtureMode ?? {}) },
    truthSummary: { ...base.truthSummary, ...(overrides.truthSummary ?? {}) },
    managerSummary: { ...base.managerSummary, ...(overrides.managerSummary ?? {}) },
    workerSummary: { ...base.workerSummary, ...(overrides.workerSummary ?? {}) },
    reliabilityProblems: overrides.reliabilityProblems ?? base.reliabilityProblems,
    gatedControls: overrides.gatedControls ?? base.gatedControls,
    queueSummary: { ...base.queueSummary, ...(overrides.queueSummary ?? {}) },
    workPackets: overrides.workPackets ?? base.workPackets,
  };
}

async function collectRelativeImportGraph(entryUrl, options = {}) {
  const visited = new Map();
  const queue = [fileURLToPath(entryUrl)];
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const terminalPaths = new Set((options.terminalUrls ?? []).map((url) => fileURLToPath(url)));

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (visited.has(currentPath)) {
      continue;
    }
    let source;
    try {
      source = await readFile(currentPath, "utf8");
    } catch {
      continue;
    }
    visited.set(currentPath, source);
    if (terminalPaths.has(currentPath)) {
      continue;
    }
    for (const specifier of extractImportSpecifiers(source)) {
      if (!specifier.startsWith(".")) {
        continue;
      }
      const resolved = await resolveDashboardImport(currentPath, specifier);
      if (resolved && resolved.startsWith(repoRoot)) {
        queue.push(resolved);
      }
    }
  }

  return {
    files: [...visited.keys()].map((path) => relative(repoRoot, path).replaceAll("\\", "/")),
    sources: [...visited.values()].join("\n")
  };
}

function extractImportSpecifiers(source) {
  return [
    ...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)
  ].map((match) => match[1]);
}

async function resolveDashboardImport(fromPath, specifier) {
  const base = resolve(dirname(fromPath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, "index.ts"),
    join(base, "index.tsx")
  ];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next supported extension.
    }
  }
  return null;
}

test("dashboard pipeline fixture test is wired into package checks", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const nextConfigSource = await readFile(nextConfigPath, "utf8");
  const globalsSource = await readFile(globalsPath, "utf8");
  const setupE2eSource = await readFile(setupE2ePath, "utf8");

  assert.equal(packageJson.scripts["test:dashboard-pipeline-fixtures"], "node --test tests/dashboard-pipeline-fixtures.test.mjs");
  assert.equal(packageJson.scripts["test:e2e:dashboard"], "playwright test");
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline-targets"], /PLAYWRIGHT_ENABLE_WEBKIT_PROJECTS=true/);
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline-targets"], /opens isolated demo pipeline cockpit without live execution framing/);
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline:windows"], /--project windows-11-chromium/);
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline:ipad"], /PLAYWRIGHT_ENABLE_WEBKIT_PROJECTS=true/);
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline:ipad"], /--project ipad-pro-gen-2-safari-ios-26/);
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline:iphone"], /PLAYWRIGHT_ENABLE_WEBKIT_PROJECTS=true/);
  assert.match(packageJson.scripts["test:e2e:dashboard:pipeline:iphone"], /--project iphone-15-pro-max-safari-ios-27/);
  assert.match(packageJson.scripts["check:dashboard"], /pnpm run test:dashboard-pipeline-fixtures/);
  assert.match(packageJson.scripts["check:dashboard"], /pnpm run build:dashboard/);
  assert.doesNotMatch(packageJson.scripts["check:dashboard"], /test:supervisor/);
  assert.match(setupE2eSource, /\["install", "chromium", "webkit"\]/);
  assert.match(packageJson.scripts["check:static"], /pnpm run test:dashboard-pipeline-fixtures/);
  assert.match(packageJson.scripts.check, /pnpm run test:dashboard-pipeline-fixtures/);
  assert.match(nextConfigSource, /devIndicators:\s*false/);
  assert.doesNotMatch(globalsSource, /nextjs-portal[\s\S]*display: none !important/);
  assert.match(nextConfigSource + (await readFile(new URL("../playwright.config.ts", import.meta.url), "utf8")), /PLAYWRIGHT_ENABLE_WEBKIT_PROJECTS/);
});

test("real WorkPacket projection proof artifact is metadata-only and non-fixture", async () => {
  const proofSource = await readFile(realWorkPacketProofPath, "utf8");
  const proof = JSON.parse(proofSource);

  assert.equal(proof.schemaVersion, "pipeline-real-workpacket-proof/v0");
  assert.equal(proof.story, "2.4-real-workpacket-backend-proof-path");
  assert.equal(proof.backendEndpoint, "/pipeline-control-plane/projection");
  assert.equal(proof.packetId, "packet-story-2-4-real-proof");
  assert.equal(proof.projectionSourceLabel, "live");
  assert.equal(proof.projectionFreshnessState, "live");
  assert.equal(proof.fixtureMode.enabled, false);
  assert.equal(proof.fixtureMode.canSatisfyLiveProof, false);
  assert.equal(proof.truthSummary.fixtureBacked, false);
  assert.equal(proof.truthSummary.backendUnavailable, false);
  assert.equal(proof.truthSummary.stale, false);
  assert.deepEqual(proof.evidenceRefs, ["proof:pipeline-real-workpacket", "story:2-4"]);
  assert.equal(proof.selectedPacketDetailsSource, "PipelineDashboardProjectionV0.selectedPacketDetails");
  assert.equal(proof.retention.metadataOnly, true);
  assert.equal(proof.retention.rawProviderPayloadsRetained, false);
  assert.equal(proof.retention.rawPromptsRetained, false);
  assert.equal(proof.retention.rawCompletionsRetained, false);
  assert.equal(proof.retention.terminalScrollbackRetained, false);
  assert.equal(proof.liveProofCannotUseFixtures, true);
  assert.ok(proof.verificationCommands.includes("uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -k pipeline_dashboard_projection_returns_truthful_empty_and_live_packet_states"));
  assert.ok(proof.verificationCommands.includes("node --test tests/dashboard-pipeline-fixtures.test.mjs"));
  assert.ok(proof.verificationCommands.some((command) => command.includes("playwright test tests/e2e/dashboard.spec.ts") && command.includes("opens real backend WorkPacket projection detail after dashboard refresh")));
  assert.ok(proof.verificationResults.every((result) => result.status === "passed"));
  assert.ok(proof.verificationResults.some((result) => result.command === "pnpm run build:dashboard" && result.sandbox === "outside-sandbox"));
  assert.ok(proof.verificationResults.some((result) => result.command.includes("playwright test tests/e2e/dashboard.spec.ts") && result.browser === "windows-11-chromium"));
  assert.doesNotMatch(proofSource, /"(rawPrompt|rawCompletion|reasoningTrace|providerPayload|rawProviderPayload|sourceContent)"\s*:/i);
  assert.doesNotMatch(proofSource, /sk-[A-Za-z0-9]|bearer\s+[A-Za-z0-9]|authorization:\s*[^",}\]]|password\s*[:=]|secret\s*[:=]/i);
});

test("execution-loop reliability proof artifact is current metadata-only evidence", async () => {
  const proofSource = await readFile(executionLoopReliabilityProofPath, "utf8");
  const proof = JSON.parse(proofSource);

  assert.equal(proof.schemaVersion, "pipeline-execution-loop-reliability-proof/v0");
  assert.equal(proof.slice, "pipeline-execution-loop-reliability");
  assert.equal(proof.prd, "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md");
  assert.equal(proof.architecture, "_bmad-output/planning-artifacts/architecture-pipeline-execution-loop-reliability-2026-07-04.md");
  assert.ok(proof.stories.includes("_bmad-output/implementation-artifacts/5-1-run-representative-execution-loop-proof.md"));
  assert.ok(proof.stories.includes("_bmad-output/implementation-artifacts/5-2-record-metadata-only-reliability-proof-artifact.md"));
  assert.equal(proof.backendEndpoint, "/pipeline-control-plane/projection");
  assert.equal(proof.packetId, "packet-story-1-4-multi-stage-proof");
  assert.deepEqual(proof.lifecycleStagesTraversed, ["capture", "classify", "route", "shape", "needs_approval", "execute", "review"]);
  assert.deepEqual(proof.terminalStagesChecked, ["promote", "deliver", "learn"]);
  assert.equal(proof.projectionTruth.projectionSourceLabel, "live");
  assert.equal(proof.projectionTruth.projectionFreshnessState, "live");
  assert.equal(proof.projectionTruth.backendReachabilityState, "reachable");
  assert.equal(proof.projectionTruth.fixtureMode.enabled, false);
  assert.equal(proof.projectionTruth.fixtureMode.canSatisfyLiveProof, false);
  assert.equal(proof.projectionTruth.truthSummary.fixtureBacked, false);
  assert.equal(proof.projectionTruth.truthSummary.backendUnavailable, false);
  assert.equal(proof.projectionTruth.truthSummary.stale, false);
  assert.equal(proof.selectedPacketDetails.source, "PipelineDashboardProjectionV0.selectedPacketDetails");
  assert.equal(proof.selectedPacketDetails.currentStage, "review");
  assert.equal(proof.selectedPacketDetails.status, "active");
  assert.equal(proof.selectedPacketDetails.truthLabel, "live");
  assert.equal(proof.selectedPacketDetails.canSatisfyLiveMovementProof, true);
  assert.equal(proof.selectedPacketDetails.terminalOnlyCanSatisfyLiveMovementProof, false);
  assert.equal(proof.dashboardProof.movementSource, "PipelineDashboardProjectionV0.selectedPacketDetails");
  assert.equal(proof.dashboardProof.fixtureFallbackDisplayedAsLive, false);
  assert.equal(proof.dashboardProof.terminalOnlyDisplayedAsLive, false);
  assert.equal(proof.dashboardProof.compactCardsExposeRawMovementRefs, false);
  for (const requiredRef of [
    "story:5-1",
    "proof:representative-execution-loop",
    "proof:multi-stage-backend-movement",
    "stage:execute",
    "stage:review",
  ]) {
    assert.ok(proof.evidenceRefs.includes(requiredRef), `${requiredRef} should be retained as metadata evidence`);
  }
  assert.ok(proof.artifactPaths.includes("tests/fixtures/pipeline/pipeline-execution-loop-reliability-proof-2026-07-04.json"));
  assert.equal(proof.codeReviewOutcome.workflow, "bmad-code-review");
  assert.equal(proof.codeReviewOutcome.blindHunter, "no findings");
  assert.equal(proof.codeReviewOutcome.acceptanceAuditor, "no findings");
  assert.equal(proof.codeReviewOutcome.edgeCaseHunter, "three patch findings fixed");
  assert.ok(proof.verificationCommands.includes("uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -q"));
  assert.ok(proof.verificationCommands.includes("node --test tests/dashboard-pipeline-fixtures.test.mjs"));
  assert.ok(proof.verificationCommands.includes("pnpm run build:dashboard"));
  assert.ok(proof.verificationResults.every((result) => result.status === "passed"));
  for (const command of proof.verificationCommands) {
    assert.ok(
      proof.verificationResults.some((result) => result.command === command && result.status === "passed"),
      `${command} must have matching passed verification evidence`,
    );
  }
  for (const result of proof.verificationResults) {
    assert.equal(typeof result.provenance, "string");
    assert.notEqual(result.provenance.trim(), "");
    assert.equal(typeof result.currentStoryRun, "boolean");
  }
  assert.ok(proof.verificationResults.some((result) => result.command === "node --test tests/dashboard-pipeline-fixtures.test.mjs" && result.currentStoryRun === true));
  assert.ok(proof.verificationResults.some((result) => result.command === "pnpm run build:dashboard" && result.currentStoryRun === false && /Story 5\.1/.test(result.provenance)));
  assert.ok(proof.verificationResults.some((result) => result.command === "pnpm run build:dashboard" && result.sandbox === "outside-sandbox"));
  assert.ok(proof.verificationResults.some((result) => result.command.includes("pytest tests/integration/test_work_packets.py") && result.sandbox === "outside-sandbox"));
  assert.ok(proof.sandboxBoundaryEvidence.some((item) => item.boundary === "uv-cache-outside-workspace"));
  assert.ok(proof.sandboxBoundaryEvidence.some((item) => item.boundary === "turbopack-process-port"));
  assert.equal(proof.retention.metadataOnly, true);
  for (const retentionKey of [
    "rawProviderPayloadsRetained",
    "rawPromptsRetained",
    "rawCompletionsRetained",
    "reasoningTracesRetained",
    "secretsRetained",
    "credentialsRetained",
    "terminalScrollbackRetained",
    "tmuxScrollbackRetained",
    "paneScrollbackRetained",
    "rawTranscriptsRetained",
    "unnecessarySourceCopiesRetained",
  ]) {
    assert.equal(proof.retention[retentionKey], false, `${retentionKey} must be false`);
  }
  assert.equal(proof.liveProofCannotUseFixtures, true);
  for (const nonLiveState of ["fixture", "stale", "simulated", "dry-run", "unknown", "terminal-only", "backend-unavailable"]) {
    assert.ok(proof.nonLiveStatesCannotSatisfyProof.includes(nonLiveState), `${nonLiveState} must be named as non-live`);
    const proofInput = proof.nonLiveProofInputs.find((item) => item.state === nonLiveState);
    assert.ok(proofInput, `${nonLiveState} must have a denied proof input`);
    assert.equal(proofInput.canSatisfyLiveProof, false);
    assert.equal(proofInput.canSatisfyLiveMovementProof, false);
  }
  assert.equal(findNonLiveProofClaims(proof).length, 0);
  assert.doesNotMatch(proofSource, /"(rawPrompt|rawCompletion|reasoningTrace|providerPayload|rawProviderPayload|sourceContent)"\s*:/i);
  assert.doesNotMatch(proofSource, /"(raw[_-]?prompt|raw[_-]?completion|reasoning[_-]?trace|provider[_-]?payload|raw[_-]?provider[_-]?payload|source[_-]?content)"\s*:/i);
  assert.doesNotMatch(proofSource, /"(password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|credential|credentials)"\s*:/i);
  assert.doesNotMatch(proofSource, /sk-[A-Za-z0-9]|bearer\s+[A-Za-z0-9]|authorization:\s*[^",}\]]/i);
  assert.doesNotMatch(proofSource, /raw prompt|raw completion|provider payload|reasoning trace|terminal scrollback|tmux scrollback|pane scrollback|raw transcript/i);
});

test("operational action loop proof artifact records current backend action truth", async () => {
  const proofSource = await readFile(operationalActionLoopProofPath, "utf8");
  const proof = JSON.parse(proofSource);

  assert.equal(proof.schemaVersion, "pipeline-operational-action-loop-proof/v1");
  assert.equal(proof.prd, "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md");
  assert.equal(proof.backendEndpoint, "/pipeline-control-plane/projection");
  assert.equal(proof.actionEndpoint, "/pipeline-control-plane/actions");
  assert.equal(proof.truthLabel, "integrated_local");
  assert.equal(proof.evidenceLevel, "integrated_local");
  assert.equal(proof.runtimeMode, "local_proof");
  assert.deepEqual(proof.proofStates, {
    readyToTestProjection: true,
    serverIssuedApprovalBindsCurrentEvent: true,
    passAdvancesReviewToPromote: true,
    idempotentReplayReturnsSameActionRecord: true,
    staleSecondApprovalIsRejected: true,
    missingApprovalIsRejected: true,
    reworkCreatesParentLinkedChild: true,
    projectionReflectsBackendActionAndLineage: true,
    blockedPacketProjectionIsVisibleAndOwned: true,
    blockedPacketCapabilityIsGated: true,
    nonApprovalBlockedPacketNotLabeledOperator: true,
  });
  assert.ok(proof.verificationResults.every((result) => result.status === "passed"));
  assert.equal(proof.retention.metadataOnly, true);
  assert.equal(proof.retention.rawProviderPayloadsRetained, false);
  assert.equal(proof.retention.rawPromptsRetained, false);
  assert.equal(proof.retention.rawCompletionsRetained, false);
  assert.equal(proof.fixtureCannotSatisfyIntegratedLocalEvidence, true);
  assert.match(proof.fr13Status, /blocked.*visibility|visibility.*blocked/i);
  assert.match(proof.fr13Status, /defer|rework|restart/i);
  assert.match(proof.broaderProofPending, /queue|lease|worker|restart/i);
  assert.doesNotMatch(proofSource, /live_backend_local_proof|bounded_live|production_observed|full Gate 4 integrated MVP proof/);
  assert.doesNotMatch(proofSource, /evidence:product-test-approval|evidence:authority-approval/);
  assert.doesNotMatch(proofSource, /"(rawPrompt|rawCompletion|reasoningTrace|providerPayload|rawProviderPayload|sourceContent)"\s*:/i);
  assert.doesNotMatch(proofSource, /sk-[A-Za-z0-9]|bearer\s+[A-Za-z0-9]|authorization:\s*[^",}\]]|password\s*[:=]|secret\s*[:=]/i);
});

test("fixture-as-live regressions are blocked by explicit projection truth predicates", async () => {
  const cockpitSource = await readFile(cockpitPath, "utf8");
  const supervisorLibSource = await readFile(supervisorLibPath, "utf8");
  const contractSource = await readFile(pipelineContractPath, "utf8");
  const projectionTruthSource = await readFile(projectionTruthPath, "utf8");
  const activeBoardViewModelSource = await readFile(activeBoardViewModelPath, "utf8");
  const activeBoardViewModelModule = loadActiveBoardViewModelModule(activeBoardViewModelSource);
  const {
    projectionDisplayLabels,
    projectionHasRenderableBackendPackets,
    projectionLiveProofLabel,
    projectionLiveProofState,
  } = loadProjectionTruthModule(projectionTruthSource);
  const { PipelineCockpit } = loadPipelineCockpitModule(cockpitSource, {
    projectionDisplayLabels,
    projectionHasRenderableBackendPackets,
    projectionLiveProofLabel,
    projectionLiveProofState,
  }, activeBoardViewModelModule);
  const react = dashboardRequire("react");
  const reactDomServer = dashboardRequire("react-dom/server");

  const packetProjectionMapper = sourceBetween(
    cockpitSource,
    "function projectionToCockpitPackets",
    "function projectionSourceForPackets"
  );
  const liveProofHelper = sourceBetween(
    projectionTruthSource,
    "export function projectionLiveProofState",
    "export function projectionDisplayLabels"
  );
  const displayLabelsHelper = sourceBetween(
    projectionTruthSource,
    "export function projectionDisplayLabels",
    "export function projectionIsLiveForProof"
  );

  assert.match(packetProjectionMapper, /if \(!projection\)[\s\S]*return runtimePackets;/);
  assert.match(packetProjectionMapper, /projectionHasRenderableBackendPackets\(projection\)/);
  assert.match(packetProjectionMapper, /refreshUnavailable \? "unavailable" : proofSource/);
  assert.match(packetProjectionMapper, /refreshUnavailable \? "unavailable" : proofFreshness/);
  assert.match(packetProjectionMapper, /packetIsLive = projectionIsLive && packet\.truthLabel === "live"/);
  assert.match(packetProjectionMapper, /packetIsLive[\s\S]*\? "live backend proof"[\s\S]*not live proof: packet/);
  assert.match(packetProjectionMapper, /fixtureLabel:[\s\S]*backend projection: packet truth live[\s\S]*dashboard proof/);
  assert.match(packetProjectionMapper, /confidenceScore: packetIsLive \? 0\.86 : 0\.42/);

  for (const requiredLiveBlocker of [
    /sourceLabel !== "live"/,
    /freshnessState !== "live"/,
    /projection\.truthSummary\.label !== "live"/,
    /projection\.truthSummary\.backendEmpty === true/,
    /projection\.truthSummary\.fixtureBacked === false/,
    /projection\.truthSummary\.stale === false/,
    /projection\.truthSummary\.backendUnavailable === false/,
    /projection\.backendReachability\.state !== "reachable"/,
    /projection\.fixtureMode\.enabled === false/,
    /projection\.fixtureMode\.canSatisfyLiveProof === false/,
  ]) {
    assert.match(liveProofHelper, requiredLiveBlocker);
  }

  for (const requiredDowngrade of [
    /failureReasons\.includes\("fixture_backed_truth"\)/,
    /failureReasons\.includes\("backend_unavailable_truth"\)/,
    /failureReasons\.includes\("stale_truth"\)/,
    /case "fixture_backed_truth":/,
    /case "fixture_mode_enabled":/,
    /case "fixture_mode_contract_allows_live_proof":/,
    /return \{ sourceLabel: "fixture", freshnessState: "unknown" \};/,
    /case "stale_truth":[\s\S]*return \{ sourceLabel: "stale", freshnessState: "stale" \};/,
    /case "backend_unavailable_truth":[\s\S]*return \{ sourceLabel: "unavailable", freshnessState: "unavailable" \};/,
  ]) {
    assert.match(displayLabelsHelper, requiredDowngrade);
  }

  assert.match(supervisorLibSource, /fixtureMode\.visibleLabelRequired === true/);
  assert.match(supervisorLibSource, /fixtureMode\.canSatisfyLiveProof === false/);
  assert.match(supervisorLibSource, /typeof truthSummary\.fixtureBacked === "boolean"/);
  assert.match(supervisorLibSource, /typeof truthSummary\.stale === "boolean"/);
  assert.match(supervisorLibSource, /typeof truthSummary\.backendUnavailable === "boolean"/);
  assert.match(contractSource, /visibleLabelRequired:\s*true;/);
  assert.match(contractSource, /canSatisfyLiveProof:\s*false;/);
  assert.match(cockpitSource, /projectionHasRenderableBackendPackets/);
  assert.match(cockpitSource, /projectionLiveProofState/);
  assert.match(cockpitSource, /projectionDisplayLabels/);
  assert.match(cockpitSource, /projectionLiveProofLabel/);
  assert.match(cockpitSource, /explicitNonRuntimeSource[\s\S]*\?\s*"unavailable"/);
  assert.match(cockpitSource, /applyNonRuntimeStageLabels\(/);
  assert.doesNotMatch(cockpitSource, /ProjectionTruthChip label="Fixture mode"/);
  assert.match(cockpitSource, /Open Diagnostics only when you need debug details/);
  assert.doesNotMatch(cockpitSource, /Diagnostics contain proof, fixture, catalog, and manager internals when needed/);
  assert.match(cockpitSource, /non-live fixture/);
  assert.match(cockpitSource, /Fixture\/non-live packet; cannot satisfy live proof/);

  const liveProjection = projectionFixture();
  const liveProof = projectionLiveProofState(liveProjection, "live", "live");
  assert.equal(projectionHasRenderableBackendPackets(liveProjection), true);
  assert.equal(liveProof.canSatisfyLiveProof, true);
  assert.equal(liveProof.failureReasons.length, 0);
  assert.equal(projectionLiveProofLabel(liveProof), "live backend proof");
  const liveDisplayLabels = projectionDisplayLabels(liveProjection, "live", "live", false, liveProof);
  assert.equal(liveDisplayLabels.sourceLabel, "live");
  assert.equal(liveDisplayLabels.freshnessState, "live");

  const emptyProjection = projectionFixture({
    generatedAt: "2099-01-01T00:00:00.000Z",
    sourceUpdatedAt: "2099-01-01T00:00:00.000Z",
    staleAfterSeconds: 60,
    workPackets: [],
    truthSummary: {
      backendEmpty: true,
      emptyReason: "healthy_empty",
      summary: "Live backend projection has no WorkPackets.",
    },
    queueSummary: {
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
      summary: "No ready work.",
    },
  });
  assert.equal(projectionHasRenderableBackendPackets(emptyProjection), false);
  const emptyProof = projectionLiveProofState(emptyProjection, "live", "live");
  assert.equal(emptyProof.canSatisfyLiveProof, false);
  assert.equal(emptyProof.primaryReason, "backend_empty_truth");
  assert.equal(projectionLiveProofLabel(emptyProof), "not live proof: backend empty");
  const emptyProjectionHtml = reactDomServer.renderToStaticMarkup(react.createElement(PipelineCockpit, {
    fixtureMode: {
      kind: "empty",
      label: "Supervisor empty",
      summary: "Supervisor is reachable but has no persisted WorkPacketV0 rows.",
      matrixRows: 0,
      fixtureCatalogEntries: 0,
      canSatisfyLiveProof: false,
    },
    packets: [{ packetId: "unexpected-runtime-packet", title: "Unexpected Runtime Packet" }],
    projection: emptyProjection,
    projectionError: null,
    selectedPacket: null,
  }));
  assert.doesNotMatch(emptyProjectionHtml, /not live proof: backend empty/);
  assert.doesNotMatch(emptyProjectionHtml, /live backend proof/);
  assert.match(emptyProjectionHtml, /Open Diagnostics only when you need debug details/);
  assert.doesNotMatch(emptyProjectionHtml, /Unexpected Runtime Packet/);
  assert.match(emptyProjectionHtml, projectionTruthChipPattern("Projection", "empty"));
  assert.match(emptyProjectionHtml, projectionTruthChipPattern("Source", "empty"));

  const demoProjectionHtml = reactDomServer.renderToStaticMarkup(react.createElement(PipelineCockpit, {
    fixtureMode: {
      kind: "demo",
      label: "Demo fixture",
      summary: "Fixture-only demo route.",
      matrixRows: 1,
      fixtureCatalogEntries: 1,
      canSatisfyLiveProof: false,
    },
    packets: [],
    projection: liveProjection,
    projectionError: null,
    selectedPacket: null,
  }));
  assert.match(demoProjectionHtml, projectionTruthChipPattern("Projection", "demo"));
  assert.match(demoProjectionHtml, projectionTruthChipPattern("Source", "demo"));
  assert.doesNotMatch(demoProjectionHtml, projectionTruthChipPattern("Projection", "live"));
  assert.doesNotMatch(demoProjectionHtml, projectionTruthChipPattern("Source", "unavailable"));

  const invalidProjectionHtml = reactDomServer.renderToStaticMarkup(react.createElement(PipelineCockpit, {
    fixtureMode: {
      kind: "invalid",
      label: "Supervisor invalid",
      summary: "Projection identity mismatch.",
      matrixRows: 0,
      fixtureCatalogEntries: 0,
      canSatisfyLiveProof: false,
    },
    packets: [],
    projection: liveProjection,
    projectionError: null,
    selectedPacket: null,
  }));
  assert.match(invalidProjectionHtml, projectionTruthChipPattern("Projection", "invalid"));
  assert.match(invalidProjectionHtml, projectionTruthChipPattern("Source", "invalid"));
  assert.doesNotMatch(invalidProjectionHtml, projectionTruthChipPattern("Projection", "live"));

  const invalidProjectionWithReadbackErrorHtml = reactDomServer.renderToStaticMarkup(react.createElement(PipelineCockpit, {
    fixtureMode: {
      kind: "invalid",
      label: "Supervisor invalid",
      summary: "Projection timestamps are stale.",
      matrixRows: 0,
      fixtureCatalogEntries: 0,
      canSatisfyLiveProof: false,
    },
    packets: [],
    projection: liveProjection,
    projectionError: "Projection timestamps are stale.",
    selectedPacket: null,
  }));
  assert.match(invalidProjectionWithReadbackErrorHtml, projectionTruthChipPattern("Projection", "invalid"));
  assert.match(invalidProjectionWithReadbackErrorHtml, projectionTruthChipPattern("Source", "invalid"));

  const negativeCases = [
    {
      caseId: "backend-unavailable",
      projection: projectionFixture({
        sourceLabel: "unavailable",
        freshnessState: "unavailable",
        backendReachability: { state: "unavailable", reason: "backend_unavailable" },
        truthSummary: {
          label: "unavailable",
          backendUnavailable: true,
          emptyReason: "backend_unavailable",
          summary: "Backend unavailable.",
        },
      }),
      sourceLabel: "unavailable",
      freshnessState: "unavailable",
      expectedPrimaryReason: "source_not_live",
      expectedDisplayLabels: { sourceLabel: "unavailable", freshnessState: "unavailable" },
    },
    {
      caseId: "stale-projection",
      projection: projectionFixture({
        sourceLabel: "stale",
        freshnessState: "stale",
        truthSummary: {
          label: "stale",
          stale: true,
          emptyReason: "projection_stale",
          summary: "Projection stale.",
        },
      }),
      sourceLabel: "stale",
      freshnessState: "stale",
      expectedPrimaryReason: "source_not_live",
      expectedDisplayLabels: { sourceLabel: "stale", freshnessState: "stale" },
    },
    {
      caseId: "fixture-backed-truth",
      projection: projectionFixture({
        truthSummary: {
          fixtureBacked: true,
          summary: "Fixture-backed projection.",
        },
      }),
      sourceLabel: "live",
      freshnessState: "live",
      expectedPrimaryReason: "fixture_backed_truth",
      expectedDisplayLabels: { sourceLabel: "fixture", freshnessState: "unknown" },
    },
    {
      caseId: "backend-reachability-unavailable-with-live-truth",
      projection: projectionFixture({
        backendReachability: { state: "unavailable", reason: "backend_unavailable" },
      }),
      sourceLabel: "live",
      freshnessState: "live",
      expectedPrimaryReason: "backend_unavailable_truth",
      expectedDisplayLabels: { sourceLabel: "unavailable", freshnessState: "unavailable" },
    },
    {
      caseId: "fixture-mode-enabled",
      projection: projectionFixture({
        fixtureMode: {
          enabled: true,
          reason: "development fixture mode",
          allowedForEnvironment: true,
        },
      }),
      sourceLabel: "live",
      freshnessState: "live",
      expectedPrimaryReason: "fixture_mode_enabled",
      expectedDisplayLabels: { sourceLabel: "fixture", freshnessState: "unknown" },
    },
    {
      caseId: "fixture-contract-invalid",
      projection: projectionFixture({
        fixtureMode: {
          canSatisfyLiveProof: true,
        },
      }),
      sourceLabel: "live",
      freshnessState: "live",
      expectedPrimaryReason: "fixture_mode_contract_allows_live_proof",
      expectedDisplayLabels: { sourceLabel: "fixture", freshnessState: "unknown" },
    },
    {
      caseId: "activity-theater-does-not-upgrade-fixture",
      projection: projectionFixture({
        truthSummary: {
          fixtureBacked: true,
          summary: "Fixture-backed projection with activity theater.",
        },
        managerSummary: {
          activeLeaseCount: 99,
          activeWorkerCount: 99,
          warmWorkerCount: 99,
          dispatchableQueueCount: 99,
        },
        queueSummary: {
          activeCount: 0,
          dispatchableCount: 99,
          blockedCount: 0,
          gatedCount: 0,
          closedCount: 0,
          staleCount: 0,
          refillingCount: 0,
          unknownCount: 0,
        },
      }),
      sourceLabel: "live",
      freshnessState: "live",
      expectedPrimaryReason: "fixture_backed_truth",
      expectedDisplayLabels: { sourceLabel: "fixture", freshnessState: "unknown" },
    },
    {
      caseId: "mixed-fixture-backed-stale-still-displays-fixture",
      projection: projectionFixture({
        freshnessState: "stale",
        truthSummary: {
          fixtureBacked: true,
          stale: true,
          summary: "Fixture-backed stale projection.",
        },
      }),
      sourceLabel: "live",
      freshnessState: "stale",
      expectedPrimaryReason: "freshness_not_live",
      expectedDisplayLabels: { sourceLabel: "fixture", freshnessState: "unknown" },
    },
    {
      caseId: "mixed-fixture-mode-unavailable-still-displays-fixture",
      projection: projectionFixture({
        sourceLabel: "unavailable",
        freshnessState: "unavailable",
        backendReachability: { state: "unavailable", reason: "backend_unavailable" },
        fixtureMode: {
          enabled: true,
          reason: "development demo mode",
          allowedForEnvironment: true,
        },
        truthSummary: {
          label: "unavailable",
          backendUnavailable: true,
          emptyReason: "backend_unavailable",
          summary: "Unavailable projection with explicit demo mode enabled.",
        },
      }),
      sourceLabel: "unavailable",
      freshnessState: "unavailable",
      expectedPrimaryReason: "source_not_live",
      expectedDisplayLabels: { sourceLabel: "fixture", freshnessState: "unknown" },
    },
  ];

  for (const { caseId, expectedDisplayLabels, expectedPrimaryReason, freshnessState, projection, sourceLabel } of negativeCases) {
    const state = projectionLiveProofState(projection, sourceLabel, freshnessState);
    assert.equal(state.canSatisfyLiveProof, false, `${caseId} cannot satisfy live proof`);
    assert.equal(state.primaryReason, expectedPrimaryReason, `${caseId} primary reason`);
    assert.notEqual(projectionLiveProofLabel(state), "live backend proof", `${caseId} proof label`);
    const displayLabels = projectionDisplayLabels(projection, sourceLabel, freshnessState, false, state);
    assert.equal(displayLabels.sourceLabel, expectedDisplayLabels.sourceLabel, `${caseId} source display label`);
    assert.equal(displayLabels.freshnessState, expectedDisplayLabels.freshnessState, `${caseId} freshness display label`);
  }

  assert.doesNotMatch(
    liveProofHelper,
    /worker|lease|activeLeaseCount|activeWorkerCount|warmWorkerCount|token|usage|tmux|terminal|route-line|pipeline-route|packetCount|workPackets\.length|packets\.length|fixtureCatalogEntries|matrixRows/i,
    "live proof must depend on projection source/freshness/truth, not activity theater"
  );
  assert.doesNotMatch(
    packetProjectionMapper,
    /activeLeaseCount|activeWorkerCount|warmWorkerCount|token|usage|tmux|terminal|route-line|pipeline-route|fixtureCatalogEntries|matrixRows/i,
    "packet projection mapping must not use activity-theater signals to upgrade proof"
  );
  assert.doesNotMatch(
    displayLabelsHelper,
    /worker|lease|activeLeaseCount|activeWorkerCount|warmWorkerCount|token|usage|tmux|terminal|route-line|pipeline-route|packetCount|workPackets\.length|packets\.length|fixtureCatalogEntries|matrixRows/i,
    "display truth labels must not be upgraded by worker, token, route-line, terminal, packet-count, or fixture-catalog signals"
  );
});

test("/pipeline route uses supervisor WorkPacketV0 projections and isolates explicit demo fixtures", async () => {
  const routeSource = await readFile(routePath, "utf8");
  const demoRouteSource = await readFile(demoRoutePath, "utf8");
  const packetDetailRouteSource = await readFile(packetDetailRoutePath, "utf8");
  const settingsRouteSource = await readFile(settingsRoutePath, "utf8");
  const settingsUsageVisibilitySource = await readFile(settingsUsageVisibilityPath, "utf8");
  const layoutSource = await readFile(layoutPath, "utf8");
  const packetDetailSource = await readFile(packetDetailPath, "utf8");
  const cockpitSource = await readFile(cockpitPath, "utf8");
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const supervisorLibSource = await readFile(supervisorLibPath, "utf8");
  const contractSource = await readFile(pipelineContractPath, "utf8");
  const projectionTruthSource = await readFile(projectionTruthPath, "utf8");
  const activeBoardViewModelSource = await readFile(activeBoardViewModelPath, "utf8");
  const managerExecutionLaneSummarySource = await readFile(managerExecutionLaneSummaryPath, "utf8");
  const globalsSource = await readFile(globalsPath, "utf8");
  const shellSource = await readFile(shellPath, "utf8");
  const graphBackgroundSource = await readFile(graphBackgroundPath, "utf8");
  const realtimeRefreshSource = await readFile(realtimeRefreshPath, "utf8");
  const navSource = await readFile(navPath, "utf8");
  const componentFiles = (await readdir(pipelineComponentsPath)).filter((file) => file.endsWith(".tsx"));
  const pipelineComponentSource = (
    await Promise.all(componentFiles.map((file) => readFile(new URL(file, pipelineComponentsPath), "utf8")))
  ).join("\n");
  const allPipelineSource = `${routeSource}\n${packetDetailRouteSource}\n${fixtureSource}\n${managerExecutionLaneSummarySource}\n${pipelineComponentSource}`;
  const projectionImplementationSource = `${cockpitSource}\n${projectionTruthSource}`;
  const defaultDashboardSurfaceSource = [
    extractFunctionSource(cockpitSource, "ProjectionTruthSummary"),
    extractFunctionSource(cockpitSource, "MissionControlStrip"),
    extractFunctionSource(cockpitSource, "OperationalStrip"),
    extractFunctionSource(cockpitSource, "RouteStation"),
    extractFunctionSource(cockpitSource, "PacketMiniCard"),
  ].join("\n");
  const packetMiniCardSource = extractFunctionSource(cockpitSource, "PacketMiniCard");
  const packetInspectionSource = extractFunctionSource(cockpitSource, "PacketInspection");
  const pipelinePacketLoaderSource = await readFile(pipelinePacketLoaderPath, "utf8");
  const pipelineImportGraph = await collectRelativeImportGraph(routePath, { terminalUrls: [shellPath, supervisorLibPath] });
  const demoPipelineImportGraph = await collectRelativeImportGraph(demoRoutePath, { terminalUrls: [shellPath, supervisorLibPath] });

  assert.match(routeSource, /<Shell\b/);
  assert.match(routeSource, /<Shell\b[^>]*realtimeRefresh=\{false\}[^>]*wide/);
  assert.match(shellSource, /realtimeRefresh = true/);
  assert.match(shellSource, /\{realtimeRefresh \? <RealtimeRefresh \/> : null\}/);
  assert.match(shellSource, /DashboardGraphBackground/);
  assert.match(shellSource, /relative isolate min-h-screen overflow-hidden/);
  assert.match(shellSource, /relative z-10 mx-auto/);
  assert.match(shellSource, /box-border flex w-auto/);
  assert.match(shellSource, /\.\.\.\(wide \? \{ maxWidth: "min\(96rem, calc\(100vw - 3rem\)\)" \} : \{\}\)/);
  assert.doesNotMatch(shellSource, /EventSource|WebSocket|XMLHttpRequest|sendBeacon|fetch\s*\(/);
  assert.match(graphBackgroundSource, /aria-hidden="true"/);
  assert.match(graphBackgroundSource, /kendall-graph-background/);
  assert.match(graphBackgroundSource, /animateMotion/);
  assert.match(globalsSource, /\.kendall-graph-background/);
  assert.match(globalsSource, /position: fixed/);
  assert.match(globalsSource, /kendall-graph-drift/);
  assert.match(globalsSource, /\.kendall-graph-background__pulses[\s\S]*display: none/);
  assert.match(realtimeRefreshSource, /EventSource/);
  assert.match(layoutSource, /data-scroll-behavior="smooth"/);
  assert.match(routeSource, /PipelineCockpit/);
  assert.match(routeSource, /loadPipelineCockpitPackets/);
  assert.match(routeSource, /projection=\{projection\}/);
  assert.match(routeSource, /projectionError=\{projectionError\}/);
  assert.doesNotMatch(routeSource, /selectedManagerExecutionLaneSummary|manager-execution-lane-summary|managerExecutionLane=/);
  assert.match(demoRouteSource, /selectedManagerExecutionLaneSummary/);
  assert.match(demoRouteSource, /managerExecutionLane=\{selectedManagerExecutionLaneSummary\}/);
  assert.match(demoRouteSource, /pipeline-fixtures/);
  assert.ok(pipelineImportGraph.files.includes("apps/dashboard/src/app/pipeline/page.tsx"));
  assert.ok(pipelineImportGraph.files.includes("apps/dashboard/src/components/shell.tsx"));
  assert.ok(pipelineImportGraph.files.includes("apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx"));
  assert.ok(pipelineImportGraph.files.includes("apps/dashboard/src/lib/supervisor.ts"));
  assert.ok(!pipelineImportGraph.files.includes("apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts"));
  assert.ok(!pipelineImportGraph.files.includes("apps/dashboard/src/lib/pipeline-fixtures.ts"));
  assert.ok(demoPipelineImportGraph.files.includes("apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts"));
  assert.ok(demoPipelineImportGraph.files.includes("apps/dashboard/src/lib/pipeline-fixtures.ts"));
  assert.equal(
    pipelineImportGraph.files.filter((path) => /(^|\/)(scripts|services\/supervisor|packages\/workflow-core\/src\/manager-control-plane|scripts\/lib\/manager-control-plane)(\/|$)/.test(path)).length,
    0,
    "/pipeline import graph should not reach manager runtime, dispatcher, scripts, or supervisor source"
  );
  assert.doesNotMatch(
    pipelineImportGraph.sources,
    /from\s+["'](?:node:child_process|child_process|openai|@anthropic|undici|axios)["']|import\s*\(\s*["'](?:openai|@anthropic|undici|axios)["']|tmux\s+send|tmux\s+capture|gh\s+pr|gh\s+api|EventSource|WebSocket|XMLHttpRequest|sendBeacon/i,
    "/pipeline import graph should only use the supervisor projection read path and avoid runtime transports"
  );
  assert.doesNotMatch(routeSource, /getRunStatus|getWorkItems|getWorkPackets|fetch\s*\(/);
  assert.match(cockpitSource, /ProjectionTruthSummary/);
  for (const bannedDefaultSurfacePattern of [
    /route id/i,
    /attempt id/i,
    /raw evidence ref/i,
    /metadataOnly/,
    /projection detail from backend/i,
    /Manager Execution Lane/,
    /full five-whys/i,
    /sourceRefs/,
    /evidenceRefs/,
  ]) {
    assert.doesNotMatch(defaultDashboardSurfaceSource, bannedDefaultSurfacePattern);
  }
  assert.match(defaultDashboardSurfaceSource, /Ready to test: \$\{packet\.title\}/);
  assert.match(defaultDashboardSurfaceSource, /pipeline-mini-packet-ready/);
  assert.match(defaultDashboardSurfaceSource, /Stale history/);
  assert.match(defaultDashboardSurfaceSource, /Diagnostics/);
  for (const bannedMiniCardPattern of [
    /packetCardEvidenceLabel/,
    /packet\.evidenceRefs/,
    /packet\.sourceRefs/,
    /packet\.executionAttempts/,
    /packet\.laneCards/,
    /packet\.routeFork/,
    /packet\.routeSummary/,
    /latestMovementSummary/,
    /latestTransitionEventRef/,
    /recentTransitionEventRefs/,
    /rawPayloadRetained/,
  ]) {
    assert.doesNotMatch(packetMiniCardSource, bannedMiniCardPattern);
  }
  assert.match(packetInspectionSource, /RefList title="Source refs"/);
  assert.match(packetInspectionSource, /RefList title="Evidence refs"/);
  assert.match(packetInspectionSource, /Latest movement/);
  assert.match(packetInspectionSource, /Five whys/);
  assert.match(packetInspectionSource, /PacketWhyDiagnosticsPanel/);
  assert.match(packetInspectionSource, /packetDetailWhyDiagnostics/);
  assert.match(packetInspectionSource, /Execution attempts/);
  assert.match(packetInspectionSource, /Manager lane details/);
  assert.match(packetInspectionSource, /CanonicalPacketDetailPanel/);
  assert.match(cockpitSource, /Canonical source, readiness, quality, retention, delivery, and product-mode posture are unavailable/);
  assert.match(cockpitSource, /Canonical readiness components/);
  assert.match(cockpitSource, /Canonical quality gates/);
  assert.match(cockpitSource, /Canonical delivery and retention evidence/);
  assert.match(cockpitSource, /buildPipelineActiveBoardViewModel/);
  assert.match(cockpitSource, /activeBoardViewModel\.activeBoard\.stageLanes/);
  assert.match(cockpitSource, /activeBoardCard/);
  assert.match(cockpitSource, /!currentProjection\?\.workPackets\.some/);
  assert.match(cockpitSource, /!currentProjection\?\.selectedPacketDetails\.some/);
  assert.match(pipelinePacketLoaderSource, /getPipelineDashboardProjection/);
  assert.match(pipelinePacketLoaderSource, /projectionError: projectionResult\.error/);
  assert.doesNotMatch(cockpitSource, /getPipelineDashboardProjection|window\.setInterval\(refreshProjection, 15_000\)|setCurrentProjection\(nextProjection\)/);
  assert.match(cockpitSource, /projectionToCockpitPackets/);
  assert.match(cockpitSource, /projectionToCockpitPackets\(currentProjection, packets, currentProjectionError, activeBoardViewModel, fixtureMode\)/);
  assert.match(cockpitSource, /runtimePacketIds = new Set\(runtimePackets\.map/);
  assert.match(cockpitSource, /!runtimePacketIds\.has\(card\.packetId\)/);
  assert.match(cockpitSource, /selectedDetailByPacketId = new Map\(projection\.selectedPacketDetails\.map/);
  assert.match(cockpitSource, /selectedDetailByPacketId\.get\(packet\.packetId\)/);
  assert.match(cockpitSource, /projectionDetailSourceRefs = detail\?\.sourceRefs \?\? \[\]/);
  assert.match(cockpitSource, /projectionDetailEvidenceRefs = detail\?\.evidenceRefs \?\? \[\]/);
  assert.match(cockpitSource, /projectionDetailMovementRefs = detail\?\.recentTransitionEventRefs \?\? \[\]/);
  assert.match(cockpitSource, /detailCanSatisfyLiveMovementProof = detail\?\.canSatisfyLiveMovementProof \?\? false/);
  assert.match(cockpitSource, /packetIsLive = projectionIsLive && packet\.truthLabel === "live" && detailCanSatisfyLiveMovementProof/);
  assert.match(cockpitSource, /movementEventRefs = detail[\s\S]{0,80}\? projectionDetailMovementRefs[\s\S]{0,80}: lifecycleEvidenceRefs/);
  assert.match(cockpitSource, /detail\?\.latestTransitionEventRef \?\? movementEventRefs\.at\(-1\) \?\? null/);
  assert.match(cockpitSource, /lastEvent: detail\?\.latestMovementSummary \?\? `projection updated \$\{packet\.updatedAt\}`/);
  assert.match(cockpitSource, /selectedMapPacket\.fixtureId \?\? ""\)\.startsWith\("projection:"\)/);
  assert.doesNotMatch(cockpitSource, /latestTransitionEventRef: lifecycleEvidenceRefs\.at\(-1\) \?\? null/);
  assert.match(activeBoardViewModelSource, /derivePacketPlacement/);
  assert.match(activeBoardViewModelSource, /derivePacketActionability/);
  assert.match(activeBoardViewModelSource, /PipelinePacketDetailWhyDiagnostics/);
  assert.match(activeBoardViewModelSource, /PipelineBackpressureState/);
  assert.match(activeBoardViewModelSource, /deriveBackpressureState/);
  assert.match(activeBoardViewModelSource, /buildCanonicalPacketDetail/);
  assert.match(activeBoardViewModelSource, /detail \? detail\.canonicalContract : packet\.canonicalContract/);
  assert.match(activeBoardViewModelSource, /canonicalPostureLabel\(packet\.productModeMapping\)/);
  assert.match(activeBoardViewModelSource, /projection\.executeAdmission\.state === "unavailable"/);
  assert.match(activeBoardViewModelSource, /projection\.executeAdmission\?\.state === "blocked"/);
  assert.doesNotMatch(activeBoardViewModelSource, /function deriveStageBackpressure/);
  assert.doesNotMatch(activeBoardViewModelSource, /Review has blocked or failed packets/);
  assert.match(activeBoardViewModelSource, /operator_testing_overloaded/);
  assert.match(activeBoardViewModelSource, /rawPayloadRetained: false/);
  assert.match(activeBoardViewModelSource, /buildPacketDetailWhyDiagnosticsForPacket/);
  assert.match(activeBoardViewModelSource, /packetPlacementReason/);
  assert.match(activeBoardViewModelSource, /readyToTestResultControls/);
  assert.match(activeBoardViewModelSource, /mark_tested/);
  assert.match(activeBoardViewModelSource, /request_rework/);
  assert.match(activeBoardViewModelSource, /request_rework/);
  assert.match(activeBoardViewModelSource, /Backend action capability is not available/);
  assert.match(cockpitSource, /activeBoardViewModel\?\.packetDetails\?\.byPacketId\?\./);
  assert.match(cockpitSource, /activeBoardViewModel\?\.summary\.backpressure/);
  assert.match(cockpitSource, /aria-label="Backpressure state"/);
  assert.match(cockpitSource, /aria-live="polite"/);
  assert.match(cockpitSource, /role="status"/);
  assert.match(cockpitSource, /Backpressure: \{backpressure\.summary\}/);
  assert.match(cockpitSource, /Backend WIP:/);
  assert.match(cockpitSource, /formatBackendWipCounts\(backpressure\.backendWip\.observed, backpressure\.backendWip\.limits\)/);
  assert.match(cockpitSource, /Next safe action: \{backpressure\.nextSafeAction\}/);
  assert.match(cockpitSource, /canonicalDetail\?\.source/);
  assert.match(cockpitSource, /canonicalSourceTrustState\(canonicalDetail\.source\.trust, packetSourceLabel, packetFreshness\)/);
  assert.match(cockpitSource, /projectionState === "stale" \|\| projectionState === "unavailable"/);
  assert.match(cockpitSource, /canonicalDetail\.source\.sourceRef/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.canonicalPostureLabel \?\? "canonical posture unavailable"/);
  assert.match(cockpitSource, /Backpressure next/);
  assert.match(cockpitSource, /aria-disabled="true"/);
  assert.doesNotMatch(cockpitSource, /disabled\s*\n\s*title=\{`\$\{action\.reason/);
  assert.match(cockpitSource, /aria-label="Packet why diagnostics"/);
  assert.match(cockpitSource, /refreshUnavailable = Boolean\(projectionError\)/);
  assert.match(cockpitSource, /refreshUnavailable \? "unavailable" : proofSource/);
  assert.match(cockpitSource, /refreshUnavailable \? "unavailable" : proofFreshness/);
  assert.match(cockpitSource, /projectionIsLive = projectionLiveProof\.canSatisfyLiveProof/);
  assert.match(cockpitSource, /effectiveLabels = projectionDisplayLabels\(projection, proofSource, proofFreshness, refreshUnavailable, projectionLiveProof\)/);
  assert.match(cockpitSource, /stageSummaryByStage/);
  assert.match(cockpitSource, /buildStageSummaryByStage/);
  assert.match(cockpitSource, /buildStageSummaryByStage\(currentProjection, currentProjectionError, fixtureMode\)/);
  assert.match(cockpitSource, /stageSummary=\{stageSummaryByStage\.get\(stage\)/);
  assert.match(cockpitSource, /projectionAvailable=\{Boolean\(currentProjection\)\}/);
  assert.doesNotMatch(cockpitSource, /stageProjectionCount/);
  assert.match(cockpitSource, /stageRenderedCount = sortedPackets\.length/);
  assert.match(cockpitSource, /stageKnownTotalCount = stageRenderedCount/);
  assert.match(cockpitSource, /unknown packets/);
  assert.match(cockpitSource, /searchActive/);
  assert.match(cockpitSource, /No matching packets in this stage/);
  assert.match(cockpitSource, /Packet details unavailable in projection/);
  assert.match(cockpitSource, /Stage health/);
  assert.match(cockpitSource, /stageHealthStateLabel/);
  assert.match(cockpitSource, /normalizeStageEmptyReason/);
  assert.match(cockpitSource, /healthy-empty/);
  assert.match(cockpitSource, /source exhausted/);
  assert.match(cockpitSource, /blocked/);
  assert.match(cockpitSource, /refilling/);
  assert.match(cockpitSource, /unknown/);
  assert.match(cockpitSource, /backend unavailable/);
  assert.match(cockpitSource, /projection stale/);
  assert.doesNotMatch(cockpitSource, /fixture fallback/);
  assert.match(cockpitSource, /Stage source/);
  assert.match(cockpitSource, /Stage freshness/);
  assert.match(cockpitSource, /Stage count/);
  assert.match(cockpitSource, /stageButtonRefs\.current\.get\(stage\)\?\.focus\(\)/);
  assert.match(cockpitSource, /stageAnchorRefs\.current\.get\(stage\)/);
  assert.match(cockpitSource, /stageAnchorRefs\.current\.forEach\(\(node\) => observer\.observe\(node\)\)/);
  assert.match(cockpitSource, /stageStationRefs\.current\.forEach\(\(node\) => observer\.observe\(node\)\)/);
  assert.match(cockpitSource, /className="pipeline-route-anchor"/);
  assert.doesNotMatch(cockpitSource, /\[updateConnectorPaths, visiblePackets\.length\]/);
  assert.match(cockpitSource, /sourceKind: "projection"/);
  assert.doesNotMatch(cockpitSource, /fixtureKind: "future-real-source"/);
  assert.match(cockpitSource, /fixtureLabel:\s+packetIsLive\s+\?\s+"backend projection: packet truth live"/);
  assert.match(cockpitSource, /: `backend projection: packet truth \$\{packet\.truthLabel\}; dashboard proof \$\{packetProofLabel\}`/);
  assert.match(cockpitSource, /packet\.sourceKind === "demo-fixture" \? "\/pipeline\/demo\/packets" : "\/pipeline\/packets"/);
  assert.doesNotMatch(cockpitSource, /packet\.sourceKind !== "demo-fixture"/);
  assert.match(cockpitSource, /managerExecutionLane\?\.operatorAttentionRequired \? <ManagerAttentionSummary lane=\{managerExecutionLane\} \/> : null/);
  assert.match(cockpitSource, /managerExecutionLane \? \([\s\S]*<ManagerExecutionLane lane=\{managerExecutionLane\} \/>/);
  assert.match(cockpitSource, /aria-label="Projection truth summary"/);
  assert.match(cockpitSource, /ProjectionTruthChip label="Projection"/);
  assert.match(cockpitSource, /Backend/);
  assert.doesNotMatch(cockpitSource, /ProjectionTruthChip label="Fixture mode"/);
  assert.match(cockpitSource, /refresh unavailable; last-known/);
  assert.match(cockpitSource, /last-known \$\{packet\.freshnessLabel\}/);
  assert.match(cockpitSource, /Backend projection refresh unavailable/);
  assert.doesNotMatch(cockpitSource, /fixture fallback only and does not prove live backend work/);
  assert.match(cockpitSource, /isProjectionTooOld/);
  assert.doesNotMatch(cockpitSource, /projectionRefreshAttemptAt|projectionRequestSequenceRef|requestSequence !== projectionRequestSequenceRef\.current/);
  assert.match(pipelinePacketLoaderSource, /loadPipelineDashboardProjection/);
  assert.match(pipelinePacketLoaderSource, /error: error instanceof Error \? error\.message : "Projection fetch failed\."/);
  assert.match(cockpitSource, /projectionSourceForPackets/);
  assert.match(cockpitSource, /projectionFreshnessForPackets/);
  assert.match(cockpitSource, /projectionLiveProofState/);
  assert.match(cockpitSource, /projectionDisplayLabels/);
  assert.match(projectionTruthSource, /projectionIsLiveForProof/);
  assert.doesNotMatch(cockpitSource, /ProjectionTruthChip label="Live proof"/);
  assert.match(projectionImplementationSource, /live backend proof/);
  assert.match(projectionTruthSource, /not live proof: no projection/);
  assert.match(projectionTruthSource, /not live proof: source not live/);
  assert.match(projectionTruthSource, /not live proof: freshness not live/);
  assert.match(projectionTruthSource, /not live proof: truth label not live/);
  assert.match(projectionTruthSource, /not live proof: backend empty/);
  assert.match(projectionTruthSource, /not live proof: fixture backed/);
  assert.match(projectionTruthSource, /not live proof: stale/);
  assert.match(projectionTruthSource, /not live proof: backend unavailable/);
  assert.match(projectionTruthSource, /not live proof: fixture mode enabled/);
  assert.match(projectionTruthSource, /not live proof: fixture contract invalid/);
  assert.doesNotMatch(cockpitSource, /packetCountLabel = projectionError \|\| !projectionIsLive/);
  assert.match(cockpitSource, /packetIsLive = projectionIsLive && packet\.truthLabel === "live"/);
  assert.match(cockpitSource, /packetProofLabel = packetIsLive/);
  assert.match(cockpitSource, /confidenceScore: packetIsLive \? 0\.86 : 0\.42/);
  assert.match(cockpitSource, /confidenceLabel: packetIsLive \? "backend projection" : `\$\{packetSourceLabel\} \$\{packetFreshness\} projection; \$\{packetProofLabel\}`/);
  assert.match(cockpitSource, /fixtureLabel:\s+packetIsLive\s+\?\s+"backend projection: packet truth live"/);
  assert.match(cockpitSource, /: `backend projection: packet truth \$\{packet\.truthLabel\}; dashboard proof \$\{packetProofLabel\}`/);
  assert.match(projectionTruthSource, /projection\.truthSummary\.fixtureBacked === false/);
  assert.match(projectionTruthSource, /projection\.truthSummary\.backendEmpty === true/);
  assert.match(projectionTruthSource, /projection\.truthSummary\.stale === false/);
  assert.match(projectionTruthSource, /projection\.truthSummary\.backendUnavailable === false/);
  assert.match(projectionTruthSource, /projection\.backendReachability\.state !== "reachable"/);
  assert.match(projectionTruthSource, /projection\.fixtureMode\.enabled === false/);
  assert.match(projectionTruthSource, /projection\.fixtureMode\.canSatisfyLiveProof === false/);
  assert.match(cockpitSource, /sourceTrustStates: \[sourceTrustState\]/);
  assert.match(cockpitSource, /projectionSourceFreshness\(sourceLabel, freshnessState\)/);
  assert.match(cockpitSource, /sourceLabel === "live" && freshnessState === "live"/);
  assert.match(cockpitSource, /arrivalLabel\(packet\)/);
  assert.match(cockpitSource, /From backend projection metadata/);
  assert.match(cockpitSource, /packet\.fixtureId \?\? ""\)\.startsWith\("projection:"\)/);
  assert.match(cockpitSource, /selectedProjectionDetail/);
  assert.match(cockpitSource, /currentProjection\?\.selectedPacketDetails\.find/);
  assert.match(cockpitSource, /projectionDetailSourceRefs/);
  assert.match(cockpitSource, /projectionDetailEvidenceRefs/);
  assert.doesNotMatch(cockpitSource, /detail && detail\.sourceRefs\.length > 0/);
  assert.doesNotMatch(cockpitSource, /owner\/session unavailable/);
  assert.doesNotMatch(cockpitSource, /quality state unknown/);
  assert.doesNotMatch(cockpitSource, /authority needs unknown/);
  assert.match(cockpitSource, /ready to test/);
  assert.match(cockpitSource, /testability unknown/);
  assert.match(cockpitSource, /Selected packet is no longer present in the latest projection/);
  assert.match(cockpitSource, /ProjectionDetailUnavailableInspection/);
  assert.match(cockpitSource, /Selected detail unavailable in latest projection/);
  assert.match(cockpitSource, /selectedMapPacket\.fixtureId \?\? ""\)\.startsWith\("projection:"\) && !selectedProjectionDetail/);
  assert.match(cockpitSource, /projectionDetailStageLabel\(projectionDetail, packet\)/);
  assert.match(cockpitSource, /projectionDetailTruthLabel\(projectionDetail, packet, projectionRefreshLabel\)/);
  assert.match(cockpitSource, /truth \$\{detail\.truthLabel\}; source \$\{freshnessLabel\}/);
  assert.match(cockpitSource, /projection detail from backend selectedPacketDetails/);
  assert.match(cockpitSource, /Close Packet Detail/);
  assert.match(cockpitSource, /focusPanelReturnTarget\(selectedPacketReturnFocusRef\.current\)/);
  assert.match(cockpitSource, /registerPacketButton/);
  assert.match(cockpitSource, /selectedDetailOnlyPacket/);
  assert.match(cockpitSource, /projectionWorkPacketToDetailOnlyCockpitPacket/);
  assert.match(cockpitSource, /Stale History \{activeBoardViewModel\?\.staleHistory\.count \?\? 0\}/);
  assert.match(cockpitSource, /staleHistoryOpen && activeBoardViewModel \? \(/);
  assert.match(cockpitSource, /function StaleHistoryPanel/);
  assert.match(cockpitSource, /Historical packets are inspection context only/);
  assert.match(cockpitSource, /Last known state/);
  assert.match(cockpitSource, /Stale reason/);
  assert.match(cockpitSource, /Inspect action/);
  assert.match(cockpitSource, /Inspect stale packet/);
  assert.match(cockpitSource, /Diagnostics Panel/);
  assert.match(cockpitSource, /diagnosticsOpen \? \(/);
  assert.match(cockpitSource, /useState\(false\)/);
  assert.match(cockpitSource, /Debug metadata and projection proof/);
  assert.match(cockpitSource, /Diagnostics are opt-in/);
  assert.match(cockpitSource, /metadata-only retention/);
  assert.match(cockpitSource, /Projection evidence refs/);
  assert.match(cockpitSource, /live proof \$\{projectionLiveProofLabel\(diagnosticsLiveProof\)\}/);
  assert.match(cockpitSource, /DiagnosticCopyButton/);
  assert.match(cockpitSource, /Manager internals/);
  assert.match(cockpitSource, /data-pipeline-panel="packet-detail"/);
  assert.match(cockpitSource, /data-pipeline-panel="stale-history"/);
  assert.match(cockpitSource, /data-pipeline-panel="diagnostics"/);
  assert.doesNotMatch(cockpitSource, /full backend packet pages are handled by the next real-detail story/);
  assert.doesNotMatch(cockpitSource, /fallbackPackets\.length === 0/);
  assert.match(cockpitSource, /staleAfterSeconds\) \|\| projection\.staleAfterSeconds <= 0/);
  assert.doesNotMatch(cockpitSource, /active leases \$\{formatNullableCount\(projection\.managerSummary\.activeLeaseCount\)\}/);
  assert.doesNotMatch(cockpitSource, /ManagerProjectionSummary/);
  assert.doesNotMatch(cockpitSource, /aria-label="Manager projection summary"/);
  assert.doesNotMatch(cockpitSource, /Manager source/);
  assert.doesNotMatch(cockpitSource, /Manager freshness/);
  const liveProofHelperMatch = projectionTruthSource.match(/export function projectionLiveProofState[\s\S]*?export function projectionIsLiveForProof/);
  assert.ok(liveProofHelperMatch, "live-proof guardrail helper should exist");
  const liveProofHelperSource = liveProofHelperMatch[0];
  for (const requiredPredicate of [
    /sourceLabel !== "live"/,
    /freshnessState !== "live"/,
    /projection\.truthSummary\.label !== "live"/,
    /projection\.truthSummary\.backendEmpty === true/,
    /projection\.truthSummary\.fixtureBacked === false/,
    /projection\.truthSummary\.stale === false/,
    /projection\.truthSummary\.backendUnavailable === false/,
    /projection\.backendReachability\.state !== "reachable"/,
    /projection\.fixtureMode\.enabled === false/,
    /projection\.fixtureMode\.canSatisfyLiveProof === false/,
  ]) {
    assert.match(liveProofHelperSource, requiredPredicate);
  }
  assert.doesNotMatch(
    liveProofHelperSource,
    /worker|token|tmux|terminal|route-line|pipeline-route|packetCount|packets\.length|fixtureCatalogEntries|matrixRows/i,
    "live proof must not depend on worker count, token usage, terminal state, route styling, packet count, or fixture catalog size"
  );
  assert.doesNotMatch(cockpitSource, /Active leases/);
  assert.doesNotMatch(cockpitSource, /Active workers/);
  assert.doesNotMatch(cockpitSource, /Warm workers/);
  assert.doesNotMatch(cockpitSource, /Dispatchable queue/);
  assert.doesNotMatch(cockpitSource, /Blocked queue/);
  assert.doesNotMatch(cockpitSource, /Closed queue/);
  assert.doesNotMatch(cockpitSource, /Source exhausted/);
  assert.doesNotMatch(cockpitSource, /Primary inactivity reason/);
  assert.doesNotMatch(cockpitSource, /Primary reason: \{primaryReason\}/);
  assert.doesNotMatch(cockpitSource, /Manager inactivity reason: \$\{managerInactivityLabel\(manager\?\.inactivityReason \?\? null\)\}/);
  assert.doesNotMatch(cockpitSource, /Backend reason: \$\{managerInactivityLabel\(projection\?\.backendReachability\.reason \?\? null\)\}/);
  assert.doesNotMatch(cockpitSource, /managerPrimaryInactivityReason/);
  assert.doesNotMatch(cockpitSource, /managerInactivityLabel/);
  assert.match(cockpitSource, /isProjectionTooOld\(projection\)/);
  assert.doesNotMatch(cockpitSource, /No ready work/);
  assert.match(cockpitSource, /approval required/);
  assert.match(cockpitSource, /usage limited/);
  assert.match(cockpitSource, /resource limited/);
  assert.match(cockpitSource, /backend unavailable/);
  assert.match(cockpitSource, /projection stale/);
  assert.match(cockpitSource, /cleanup gated/);
  assert.match(cockpitSource, /failure budget hit/);
  assert.match(cockpitSource, /failure budget hit/);
  assert.match(cockpitSource, /Wait for failure budget recovery/);
  assert.match(supervisorLibSource, /"failure_budget_hit"/);
  assert.match(contractSource, /"failure_budget_hit"/);
  assert.doesNotMatch(cockpitSource, /Degraded or unknown/);
  assert.doesNotMatch(cockpitSource, /Manager summary is metadata-only and cannot authorize mutation/);
  assert.doesNotMatch(cockpitSource, /key=\{`\$\{index\}:\$\{detail\}`\}/);
  assert.match(cockpitSource, /aria-hidden="true" className="pipeline-empty-station/);
  assert.doesNotMatch(cockpitSource, /formatNullableCount\(manager\.activeLeaseCount\)/);
  assert.doesNotMatch(cockpitSource, /formatNullableCount\(manager\.activeWorkerCount\)/);
  assert.doesNotMatch(cockpitSource, /formatNullableCount\(manager\.warmWorkerCount\)/);
  assert.doesNotMatch(cockpitSource, /formatNullableCount\(queue\.dispatchableCount\)/);
  assert.doesNotMatch(cockpitSource, /formatNullableCount\(queue\.blockedCount\)/);
  assert.doesNotMatch(cockpitSource, /formatNullableCount\(queue\.closedCount\)/);
  assert.doesNotMatch(cockpitSource, /tmux\s+capture|tmux\s+send|child_process|provider payload|raw worker transcript|raw prompt|sk-/i);
  assert.match(packetDetailRouteSource, /PacketDetailPage/);
  assert.match(packetDetailRouteSource, /<Shell\b[^>]*compactHeader[^>]*realtimeRefresh=\{false\}[^>]*wide/);
  assert.match(packetDetailRouteSource, /realtimeRefresh=\{false\}/);
  assert.doesNotMatch(packetDetailRouteSource, /generateStaticParams/);
  assert.doesNotMatch(packetDetailRouteSource + packetDetailSource, /lib\/supervisor|getRunStatus|getWorkItems|getWorkPackets|fetch\s*\(/);
  assert.match(supervisorLibSource, /Malformed response for \$\{path\}/);
  assert.match(supervisorLibSource, /Invalid projection payload/);
  assert.match(supervisorLibSource, /isPipelineDashboardProjection/);
  assert.match(supervisorLibSource, /projection\.workPackets\.every\(isProjectionWorkPacket\)/);
  assert.match(supervisorLibSource, /isLiveProjectionRenderable\(projection\)/);
  assert.match(supervisorLibSource, /function projectionHasOpenPacket/);
  assert.match(supervisorLibSource, /\["active", "waiting", "blocked", "failed"\]\.includes\(\(candidate as \{ status\?: string \}\)\.status \|\| ""\)/);
  assert.match(supervisorLibSource, /projection\.truthSummary\?\.backendEmpty === true/);
  assert.match(supervisorLibSource, /\["healthy_empty", "blocked", "refilling"\]\.includes\(projection\.truthSummary\.emptyReason \|\| ""\)/);
  assert.match(supervisorLibSource, /projection\.queueSummary\?\.emptyReason === projection\.truthSummary\.emptyReason/);
  assert.match(supervisorLibSource, /isProjectionStage\(packet\.currentStage\)/);
  assert.match(supervisorLibSource, /isPipelineCanonicalContractV1\(packet\.canonicalContract\)/);
  assert.match(supervisorLibSource, /isPipelineProductModeMappingV0\(packet\.productModeMapping\)/);
  assert.match(supervisorLibSource, /Array\.isArray\(packet\.evidenceRefs\)/);
  assert.match(supervisorLibSource, /packet\.metadataOnly === true/);
  assert.match(supervisorLibSource, /isFixtureMode\(projection\.fixtureMode\)/);
  assert.match(supervisorLibSource, /isTruthSummary\(projection\.truthSummary\)/);
  assert.match(supervisorLibSource, /isManagerSummary\(projection\.managerSummary\)/);
  assert.match(supervisorLibSource, /isQueueSummary\(projection\.queueSummary\)/);
  assert.match(supervisorLibSource, /fixtureMode\.visibleLabelRequired === true/);
  assert.match(supervisorLibSource, /managerSummary\.metadataOnly === true/);
  assert.match(supervisorLibSource, /const detailIds = new Set<string>\(\)/);
  assert.match(supervisorLibSource, /detailIds\.has\(detail\.packetId\)/);
  assert.match(supervisorLibSource, /detail\.currentStage !== packet\.currentStage/);
  assert.match(supervisorLibSource, /packet\.evidenceRefs\.some\(\(ref\) => !detailEvidence\.has\(ref\)\)/);

  for (const regionName of [
    "Refined pipeline cockpit frame",
    "Cockpit first-frame hierarchy",
    "Pipeline command strip",
    "Operator command center",
    "Pipeline board",
    "Pipeline operational strip",
    "Mission control focus strip",
    "Pipeline status key",
    "Pipeline capacity strip",
    "Pipeline route map",
    "Manager Execution Lane",
    "Manager run summary strip",
    "Packet inspection panel",
    "Packet plain-language summary",
    "Packet detail",
    "Packet 5 Whys",
    "Action request ledger",
    "Packet source boundaries"
  ]) {
    assert.match(cockpitSource + packetDetailSource, new RegExp(`aria-label=["']${regionName}["']`));
  }
  assert.match(cockpitSource, /function ManagerExecutionLane/);
  for (const managerLabel of [
    "Queue and lease table",
    "Refill and bootstrap",
    "Worker pool",
    "Resource and usage",
    "Authority and stop-line drawer",
    "Evidence and Checkpoint Drawer",
    "Allowed unattended operations",
    "Preauthorization required",
    "Blocked operations",
    "Forbidden operations",
    "Delivery controls unavailable",
    "Missing contract: delivery_phase",
    "PR creation",
    "PR update",
    "PR merge",
    "Cleanup",
    "Operator feedback routing",
    "Feedback routes",
    "Affected delivery gates",
    "continue_unrelated_safe_lanes",
    "metadata_only_feedback_record",
    "Manager live status",
    "Cleanup and takeover gates",
    "Not dispatchable safe work",
    "Gate reason",
    "Why it matters",
    "Next safe action",
    "Worker launch is not implied",
    "Cleanup gated, not source exhausted",
    "Takeover gated, not implementation work",
    "Manager compact status blocks",
    "Liveness",
    "Blockers",
    "Checkpoint status",
    "State chip raw state",
    "role=\"table\"",
    "role=\"row\"",
    "role=\"cell\"",
    "role=\"status\"",
    "role=\"meter\"",
    "aria-valuenow",
    "pipeline-usage-meter-value",
    "manager-execution-lane",
    "manager-lane-row",
    "manager-lane-block"
  ]) {
    assert.match(allPipelineSource, new RegExp(managerLabel));
  }
  assert.match(cockpitSource, /rawPayloadRetained/);
  assert.doesNotMatch(cockpitSource, /<section\s+aria-label="Manager Execution Lane"[\s\S]{0,240}aria-live=/);
  assert.match(cockpitSource, /aria-label="Manager live status"/);
  assert.match(cockpitSource, /role=\{lane\.operatorAttentionRequired \? "alert" : "status"\}/);
  assert.match(cockpitSource, /function UsageMeterRow/);
  assert.match(cockpitSource, /const percent = clampPercent\(meter\.percent\)/);
  assert.match(cockpitSource, /aria-label=\{`\$\{item\.provider\} \$\{meter\.label\} usage \$\{percent\}%`\}/);
  assert.match(cockpitSource, /aria-label=\{`\$\{title\} row \$\{row\.label\}: \$\{row\.id\}; backend state \$\{row\.rawState\}; next \$\{row\.nextAction\}`\}/);
  assert.match(cockpitSource, /details\.contains\(target\)/);
  assert.match(cockpitSource, /aria-live="polite"/);
  assert.match(cockpitSource, /Delivery, cleanup, retry, worker launch, tmux, provider, GitHub, and supervisor actions stay unavailable/);
  assert.match(cockpitSource, /function ManagerCleanupTakeoverGates/);
  assert.match(cockpitSource, /cleanupTakeoverGateRows\(lane\)/);
  assert.match(cockpitSource, /cleanup_stewardship/);
  assert.match(cockpitSource, /stale owner/);
  assert.match(cockpitSource, /dirty workspace/);
  assert.match(cockpitSource, /cleanup partial/);
  assert.match(cockpitSource, /cleanup ready/);
  assert.match(cockpitSource, /blocked cleanup target/);
  assert.match(cockpitSource, /not counted as dispatchable safe work/);
  assert.match(cockpitSource, /gateDispatchableCountLabel/);
  assert.match(cockpitSource, /safeWorkAvailableCount/);
  assert.match(cockpitSource, /kind: "cleanup"/);
  assert.match(cockpitSource, /kind: "takeover"/);
  assert.match(cockpitSource, /row\.kind === "takeover" \? "Takeover gated, not implementation work" : "Cleanup gated, not source exhausted"/);
  assert.doesNotMatch(cockpitSource, /row\.label\.includes\("Takeover"\)/);
  assert.match(cockpitSource, /const hasCleanupGate = \/cleanup/);
  assert.doesNotMatch(cockpitSource, /if \(cleanupOperation \|\|/);
  const cleanupGateHelperMatch = cockpitSource.match(/function cleanupTakeoverGateRows[\s\S]*?function cleanupGateLabel/);
  assert.ok(cleanupGateHelperMatch, "cleanup/takeover gate helper should exist");
  assert.doesNotMatch(cleanupGateHelperMatch[0], /setSelectedItem|onClick=\{|fetch\s*\(|navigator\.clipboard|tmux|child_process|rm\s+-|git\s+worktree\s+remove/i);
  assert.match(globalsSource, /\.pipeline-usage-meter-value/);
  assert.match(globalsSource, /prefers-reduced-motion: reduce[\s\S]*\.manager-execution-lane/);
  assert.match(globalsSource, /prefers-reduced-motion: reduce[\s\S]*\.manager-lane-row:hover/);
  assert.match(globalsSource, /max-width: 720px[\s\S]*\.manager-execution-lane[\s\S]*overflow-wrap: anywhere/);
  assert.match(managerExecutionLaneSummarySource, /projectManagerExecutionLaneSummary/);
  assert.match(managerExecutionLaneSummarySource, /ManagerExecutionLaneSummary/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-empty/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-refilling/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-only/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-blocked/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-delivery-unavailable/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-source-exhausted/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-resource-critical/);
  assert.match(managerExecutionLaneSummarySource, /run-manager-recovery/);
  assert.match(managerExecutionLaneSummarySource, /source_exhausted/);
  assert.match(managerExecutionLaneSummarySource, /split_brain_recovery/);
  assert.match(managerExecutionLaneSummarySource, /resource_critical/);
  assert.match(managerExecutionLaneSummarySource, /delivery_unavailable/);
  assert.match(managerExecutionLaneSummarySource, /fixtureBacked: summary\.stateSource === "fixture"/);
  assert.doesNotMatch(managerExecutionLaneSummarySource, /fixtureBacked:[^\n]*proofMode/);
  assert.match(managerExecutionLaneSummarySource, /singleActiveLeaseEvidenceRefs/);
  assert.match(managerExecutionLaneSummarySource, /link\.leaseId && !link\.workItemId/);
  assert.match(managerExecutionLaneSummarySource, /active_mixed/);
  assert.match(managerExecutionLaneSummarySource, /currentLimitations/);
  assert.match(cockpitSource, /handleManagerKeyDown/);
  assert.match(cockpitSource, /navigator\.clipboard/);
  assert.match(cockpitSource, /Copy evidence ref/);
  assert.match(cockpitSource, /Copy verification id/);
  assert.match(cockpitSource, /<dl role="cell"><ManagerDefinition label="Item"/);
  assert.match(cockpitSource, /Authority chip/);
  assert.match(cockpitSource, /authorityOperations/);
  assert.match(cockpitSource, /deliveryControlRows/);
  assert.match(cockpitSource, /key=\{link\.key\}/);
  assert.match(managerExecutionLaneSummarySource, /PipelineManagerAuthorityOperationRow/);
  assert.match(managerExecutionLaneSummarySource, /PipelineManagerFeedbackRouteRow/);
  assert.match(managerExecutionLaneSummarySource, /buildAuthorityOperationRows/);
  assert.match(managerExecutionLaneSummarySource, /buildFeedbackRouteRows/);
  assert.match(managerExecutionLaneSummarySource, /workspace_files/);
  assert.match(managerExecutionLaneSummarySource, /runtime_state/);
  assert.match(managerExecutionLaneSummarySource, /live_worker_execution/);
  assert.match(managerExecutionLaneSummarySource, /delivery_stewardship/);
  assert.match(managerExecutionLaneSummarySource, /cleanup_stewardship/);
  assert.match(managerExecutionLaneSummarySource, /git_mutation/);
  assert.match(managerExecutionLaneSummarySource, /provider_access/);
  assert.match(managerExecutionLaneSummarySource, /supervisor_runtime/);
  assert.doesNotMatch(managerExecutionLaneSummarySource + cockpitSource, /scripts\/lib|child_process|tmux send|fetch\s*\(|EventSource|WebSocket|XMLHttpRequest|sendBeacon|api\.openai|api\.anthropic|provider payload|raw worker transcript|raw prompt|sk-/i);
  const managerSummaryModule = loadManagerExecutionLaneSummaryModule(managerExecutionLaneSummarySource);
  const requiredAuthorityClasses = new Set(["allowed_unattended", "requires_preauthorization", "block_and_record", "forbidden"]);
  const projectedAuthorityClasses = new Set();
  for (const fixture of managerSummaryModule.managerExecutionLaneSummaryFixtures) {
    const projected = managerSummaryModule.projectManagerExecutionLaneSummary(fixture);
    assert.equal(typeof projected.runId, "string");
    assert.ok(projected.statusText.length > 0, projected.runId);
    assert.ok(projected.nextAction.length > 0, projected.runId);
    assert.ok(projected.refillPanel.reason.length > 0, projected.runId);
    assert.ok(projected.workerPanel.reason.length > 0, projected.runId);
    assert.ok(projected.resourceUsagePanel.reason.length > 0, projected.runId);
    assert.ok(projected.displayStates.length > 0, projected.runId);
    assert.equal(projected.fixtureBacked, fixture.stateSource === "fixture", projected.runId);
    assert.ok(projected.authorityOperations.length >= 8, `${projected.runId} should expose operation-level authority rows`);
    assert.ok(projected.authorityOperations.every((operation) => operation.operation.length > 0), projected.runId);
    assert.ok(projected.authorityOperations.every((operation) => operation.authorityClass.length > 0), projected.runId);
    assert.ok(projected.authorityOperations.every((operation) => operation.reason.length > 0), projected.runId);
    assert.ok(projected.authorityOperations.every((operation) => operation.rollbackOrRecoveryNote.length > 0), projected.runId);
    assert.ok(projected.authorityOperations.some((operation) => operation.missingContract === "delivery_phase"), `${projected.runId} should name missing delivery_phase`);
    assert.ok(Array.isArray(projected.feedbackRouteRows), `${projected.runId} should expose feedback route rows`);
    assert.equal(projected.feedbackRetention, "metadata_only", `${projected.runId} should preserve metadata-only feedback retention`);
    assert.equal(projected.feedbackRawPayloadRetained, false, `${projected.runId} should not retain raw feedback payloads`);
    assert.ok(projected.deliveryControlRows.length >= 4, `${projected.runId} should expose read-only delivery controls`);
    assert.ok(projected.deliveryControlRows.every((control) => control.available === false || projected.authorityStage === "delivery"), projected.runId);
    assert.ok(projected.deliveryControlRows.some((control) => control.label === "PR creation" && control.missingContract === "delivery_phase"), projected.runId);
    projectedAuthorityClasses.add(projected.authorityClass);
    if (projected.queueRows.length === 0 && projected.leaseRows.length === 0) {
      assert.match(projected.phase, /no_safe_work|closed|manager_only|blocked|refilling/, projected.runId);
    }
  }
  for (const authorityClass of requiredAuthorityClasses) {
    assert.ok(projectedAuthorityClasses.has(authorityClass), `manager fixtures should cover ${authorityClass}`);
  }
  const baseManagerFixture = managerSummaryModule.managerExecutionLaneSummaryFixtures[0];
  const baseProjected = managerSummaryModule.projectManagerExecutionLaneSummary(baseManagerFixture);
  assert.ok(baseProjected.displayStates.includes("delivery_unavailable"), "allowed pipeline_adapter summaries should still show delivery unavailable");
  assert.equal(
    baseProjected.authorityOperations.find((operation) => operation.key === "runtime-state")?.authorityClass,
    "requires_preauthorization",
    "runtime state mutation should not be allowed from pipeline_adapter authority"
  );
  assert.equal(
    baseProjected.authorityOperations.find((operation) => operation.key === "git-mutation")?.missingContract,
    "delivery_phase",
    "Git mutation should expose the delivery_phase stop line"
  );

  const metadataOnlyQueuedProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-metadata-only-queued",
    safeWorkAvailableCount: 0,
    metadataOnlyQueuedCount: 3,
    unsafeOrGatedWorkCount: 0,
    queuedWorkItemIds: [],
    activeWorkItemIds: [],
    stateCounts: {
      ...baseManagerFixture.stateCounts,
      queued: 0,
      leased: 0,
      running: 0,
      metadataOnlyQueuedCandidates: 3
    },
    rawStateLabels: ["refill:queued_metadata", "fixture-backed"]
  });
  assert.match(metadataOnlyQueuedProjection.refillPanel.reason, /3 metadata-only queued candidate\(s\) reported/);
  assert.doesNotMatch(metadataOnlyQueuedProjection.refillPanel.reason, /claimable safe item\(s\) available/);

  const needsReviewRefillProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-refill-needs-review",
    safeWorkAvailableCount: 0,
    unsafeOrGatedWorkCount: 2,
    stateCounts: {
      ...baseManagerFixture.stateCounts,
      queued: 0,
      refilling: 0,
      needsReviewCandidates: 2
    },
    blockers: ["dispatcher_has_needs_review_candidates"],
    warnings: ["needs_review_candidates_recorded"],
    rawStateLabels: ["candidate:needs_review", "fixture-backed"]
  });
  assert.equal(needsReviewRefillProjection.refillPanel.state, "needs_review");
  assert.match(needsReviewRefillProjection.refillPanel.reason, /2 unsafe or gated item\(s\) held/);

  const deliveryAuthorizedProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-delivery-authorized",
    authorityStage: "delivery",
    authorityClass: "allowed_unattended",
    rawStateLabels: ["delivery:authorized", "fixture-backed"]
  });
  assert.equal(deliveryAuthorizedProjection.displayStates.includes("delivery_unavailable"), false);
  assert.equal(deliveryAuthorizedProjection.deliveryControlRows.every((control) => control.available === true), true);
  assert.equal(deliveryAuthorizedProjection.deliveryControlRows.every((control) => control.missingContract === null), true);

  const liveWorkerProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-live-worker-authorized",
    authorityStage: "live_worker",
    authorityClass: "allowed_unattended",
    rawStateLabels: ["live_worker:authorized", "fixture-backed"]
  });
  assert.equal(liveWorkerProjection.authorityOperations.find((operation) => operation.key === "live-workers")?.authorityClass, "allowed_unattended");
  assert.equal(liveWorkerProjection.authorityOperations.find((operation) => operation.key === "tmux-session-control")?.authorityClass, "allowed_unattended");

  const blockedProjection = managerSummaryModule.projectManagerExecutionLaneSummary(
    managerSummaryModule.managerExecutionLaneSummaryFixtures.find((fixture) => fixture.runId === "run-manager-block-and-record")
  );
  assert.match(
    blockedProjection.authorityOperations.find((operation) => operation.key === "cleanup")?.reason ?? "",
    /cleanup target is outside scoped manager-owned state/,
    "operation rows should preserve raw backend authority reason"
  );

  const unsafePayloadProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-unsafe-payload",
    evidenceLinks: baseManagerFixture.evidenceLinks.map((link) => ({ ...link, rawPayloadRetained: true }))
  });
  assert.equal(
    unsafePayloadProjection.evidenceLinks.every((link) => link.rawPayloadRetained === false),
    true,
    "dashboard projection must not render raw payload retention as true"
  );

  const blockingFeedbackProjection = managerSummaryModule.projectManagerExecutionLaneSummary(
    managerSummaryModule.managerExecutionLaneSummaryFixtures.find((fixture) => fixture.runId === "run-manager-feedback-blocking")
  );
  assert.ok(blockingFeedbackProjection.displayStates.includes("feedback_blocking"), "blocking feedback should be visible as a display state");
  assert.equal(blockingFeedbackProjection.feedbackRouteRows[0]?.classification, "blocking");
  assert.equal(blockingFeedbackProjection.feedbackRouteRows[0]?.affectedDeliveryGate?.mergePolicy, "prevent_affected_pr_merge");
  assert.equal(blockingFeedbackProjection.feedbackRouteRows[0]?.unrelatedLanePolicy, "continue_unrelated_safe_lanes");
  assert.match(blockingFeedbackProjection.feedbackRouteRows[0]?.authorityImpact ?? "", /delivery/i);
  assert.equal(blockingFeedbackProjection.feedbackRouteRows[0]?.rawPayloadRetained, false);

  const correctionFeedbackProjection = managerSummaryModule.projectManagerExecutionLaneSummary(
    managerSummaryModule.managerExecutionLaneSummaryFixtures.find((fixture) => fixture.runId === "run-manager-feedback-correction")
  );
  assert.equal(correctionFeedbackProjection.feedbackRouteRows[0]?.route, "route_to_active_worker");
  assert.equal(correctionFeedbackProjection.feedbackRouteRows[0]?.targetWorkerId, "codex-3");

  const queuedCorrectionProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-feedback-queued-correction",
    feedbackRoutes: [
      {
        feedbackId: "feedback-correction-lane",
        classification: "correction",
        summary: "correction feedback without active worker",
        targetSurface: "/pipeline",
        affectedLane: "lane-pipeline",
        sourceRefs: ["checkpoint:daily-use"],
        route: "create_correction_lane",
        targetWorkerId: null,
        affectedDeliveryGate: {
          action: "hold_affected_delivery_until_correction_resolved",
          affectedLane: "lane-pipeline",
          scope: "targeted_lane",
          mergePolicy: "hold_until_correction_resolved",
          downstreamPolicy: "continue_unrelated_safe_lanes",
          recoveryPath: "route correction feedback before affected delivery is marked merge-ready"
        },
        authorityImpact: "affected delivery is held until correction feedback is routed",
        dependencyImpact: "route correction while unrelated safe lanes continue",
        nextAction: "Create or queue a correction lane while unrelated lanes continue.",
        recordPolicy: "metadata_only_feedback_record",
        unrelatedLanePolicy: "continue_unrelated_safe_lanes",
        retention: "metadata_only",
        rawPayloadRetained: false
      }
    ]
  });
  assert.equal(queuedCorrectionProjection.feedbackRouteRows[0]?.route, "create_correction_lane");
  assert.equal(queuedCorrectionProjection.feedbackRouteRows[0]?.targetWorkerId, null);
  assert.equal(queuedCorrectionProjection.feedbackRouteRows[0]?.affectedDeliveryGate?.mergePolicy, "hold_until_correction_resolved");

  const polishFeedbackProjection = managerSummaryModule.projectManagerExecutionLaneSummary(
    managerSummaryModule.managerExecutionLaneSummaryFixtures.find((fixture) => fixture.runId === "run-manager-feedback-polish")
  );
  assert.equal(polishFeedbackProjection.feedbackRouteRows[0]?.classification, "polish");
  assert.equal(polishFeedbackProjection.feedbackRouteRows[0]?.route, "batch_polish_feedback");
  assert.equal(polishFeedbackProjection.feedbackRouteRows[0]?.retention, "metadata_only");
  assert.equal(polishFeedbackProjection.feedbackRouteRows[0]?.rawPayloadRetained, false);

  const futureFeedbackProjection = managerSummaryModule.projectManagerExecutionLaneSummary(
    managerSummaryModule.managerExecutionLaneSummaryFixtures.find((fixture) => fixture.runId === "run-manager-feedback-future")
  );
  assert.equal(futureFeedbackProjection.feedbackRouteRows[0]?.classification, "future_work");
  assert.equal(futureFeedbackProjection.feedbackRouteRows[0]?.route, "record_future_work");

  const malformedFeedbackProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-feedback-malformed",
    feedbackRecordPolicy: "raw_feedback_record",
    feedbackUnrelatedLanePolicy: "stop_unrelated_lanes",
    feedbackRetention: "raw_payload",
    feedbackRawPayloadRetained: true,
    feedbackRoutes: [
      {
        feedbackId: "feedback-unknown-route",
        classification: "urgent_blocker",
        summary: "unknown feedback classification",
        targetSurface: "/pipeline",
        affectedLane: "lane-pipeline",
        sourceRefs: ["checkpoint:daily-use"],
        route: "allow_delivery",
        targetWorkerId: null,
        affectedDeliveryGate: {
          action: "allow_affected_delivery",
          affectedLane: "lane-pipeline",
          scope: "global_release",
          mergePolicy: "allow_merge",
          downstreamPolicy: "continue_downstream_lanes",
          recoveryPath: "none"
        },
        authorityImpact: "safe",
        dependencyImpact: "none",
        nextAction: "merge",
        recordPolicy: "raw_feedback_record",
        unrelatedLanePolicy: "stop_unrelated_lanes",
        retention: "raw_payload",
        rawPayloadRetained: true
      }
    ]
  });
  assert.ok(malformedFeedbackProjection.displayStates.includes("feedback_malformed"));
  assert.ok(malformedFeedbackProjection.displayStates.includes("feedback_blocking"));
  assert.equal(malformedFeedbackProjection.feedbackRouteRows[0]?.classification, "malformed_feedback");
  assert.equal(malformedFeedbackProjection.feedbackRouteRows[0]?.route, "hold_for_feedback_contract_review");
  assert.equal(malformedFeedbackProjection.feedbackRouteRows[0]?.affectedDeliveryGate?.mergePolicy, "prevent_affected_pr_merge");
  assert.equal(malformedFeedbackProjection.feedbackRouteRows[0]?.affectedDeliveryGate?.downstreamPolicy, "pause_downstream_lanes");
  assert.match(malformedFeedbackProjection.feedbackRouteRows[0]?.authorityImpact ?? "", /malformed/i);
  assert.equal(malformedFeedbackProjection.feedbackRouteRows[0]?.retention, "metadata_only");
  assert.equal(malformedFeedbackProjection.feedbackRouteRows[0]?.rawPayloadRetained, false);

  const routeUnsafeFeedbackProjection = managerSummaryModule.projectManagerExecutionLaneSummary({
    ...baseManagerFixture,
    runId: "run-manager-feedback-route-unsafe-retention",
    feedbackRoutes: [
      {
        feedbackId: "feedback-unsafe-route",
        classification: "polish",
        summary: "route-level unsafe retention should fail closed",
        targetSurface: "/pipeline",
        affectedLane: "lane-pipeline",
        sourceRefs: ["checkpoint:daily-use"],
        route: "batch_polish_feedback",
        targetWorkerId: null,
        affectedDeliveryGate: null,
        authorityImpact: "polish only",
        dependencyImpact: "unrelated lanes stop until raw payload is inspected",
        nextAction: "inspect raw provider payload",
        recordPolicy: "metadata_only_feedback_record",
        unrelatedLanePolicy: "continue_unrelated_safe_lanes",
        retention: "raw_payload",
        rawPayloadRetained: true,
      },
    ],
  });
  assert.ok(routeUnsafeFeedbackProjection.displayStates.includes("feedback_malformed"));
  assert.equal(routeUnsafeFeedbackProjection.feedbackRouteRows[0]?.classification, "malformed_feedback");
  assert.equal(routeUnsafeFeedbackProjection.feedbackRouteRows[0]?.route, "hold_for_feedback_contract_review");
  assert.equal(routeUnsafeFeedbackProjection.feedbackRouteRows[0]?.retention, "metadata_only");
  assert.equal(routeUnsafeFeedbackProjection.feedbackRouteRows[0]?.rawPayloadRetained, false);

  assert.match(supervisorLibSource, /detailIds\.has\(detail\.packetId\)/);
  assert.doesNotMatch(cockpitSource, /Pipeline workflow strip|Pipeline mobile workflow strip|Idea captured|Review ready|Promote candidate/);
  assert.match(cockpitSource, /InfoTooltip/);
  assert.doesNotMatch(cockpitSource, /Each stage shows packets currently sitting there/);
  assert.doesNotMatch(cockpitSource, /See what is being worked on and where each packet sits in the process/);
  assert.match(cockpitSource, /stagePurpose/);
  assert.match(cockpitSource, /New ideas and requests land here before Kendall decides what they are/);
  assert.match(cockpitSource, /currentItem\?\.type === "packet" && currentItem\.id === packetId/);
  assert.match(navSource, /href:\s*"\/settings"/);
  assert.match(settingsRouteSource, /Dashboard settings/);
  assert.match(settingsRouteSource, /Usage source settings/);
  assert.match(settingsRouteSource, /Codex and Claude limits/);
  assert.match(settingsRouteSource, /UsageVisibilitySettings/);
  assert.match(settingsUsageVisibilitySource, /kendall\.dashboard\.usage\.codex\.visible/);
  assert.match(settingsUsageVisibilitySource, /kendall\.dashboard\.usage\.claude\.visible/);
  assert.match(settingsUsageVisibilitySource, /Usage graph visibility settings/);
  assert.match(settingsRouteSource, /ccusage local summary/);
  assert.doesNotMatch(settingsRouteSource + settingsUsageVisibilitySource, /fetch\s*\(|EventSource|WebSocket|XMLHttpRequest|sendBeacon|api\.openai|api\.anthropic|claude\.ai/);

  for (const visibleLabel of [
    "Pipeline",
    "Pipeline operational strip",
    "Mission control focus strip",
    "Most urgent",
    "Active board",
    "Pipeline status key",
    "Needs approval",
    "Blocked",
    "Complete",
    "Pipeline route map",
    "Codex",
    "Claude",
    "5h",
    "Weekly",
    "Open full packet",
    "Where",
    "Came from",
    "Got here",
    "Next",
    "Blocked by",
    "Execution attempts",
    "Back to pipeline",
    "Packet detail:",
    "Packet 5 Whys",
    "What this packet cannot do",
    "Fixture mode",
    "Top blocked packet",
    "What happens next",
    "fixture-only",
    "mocked",
    "synthetic",
    "Human Gate",
    "Pipeline board",
    "Source:",
    "Source trust",
    "Sources",
    "Route",
    "Stage",
    "Evidence",
    "Worker",
    "Memory",
    "Recovery",
    "Local GPU Card",
    "Local GPU health",
    "Configured endpoint",
    "Approved endpoint",
    "Configured model",
    "Approved model",
    "Latency",
    "Call authority",
    "authority mode",
    "metadata_only",
    "rawPayloadRetained false",
    "Hermes Worker Mock",
    "Mocked Hermes containment",
    "Codex Worker Card",
    "implementation_worker",
    "Attempt refs",
    "Claude Reviewer Card",
    "independent_review",
    "Approval requirement",
    "Network policy",
    "Cleanup policy",
    "Governed Hermes dry-run attempt active",
    "Governed Claude dry-run attempt active",
    "Governed Claude copied-worktree execution running",
    "Governed Hermes real execution unavailable",
    "copied_worktree_worker_execution",
    "real copied-worktree execution",
    "real execution unavailable",
    "governed.dry_run",
    "governed.copied_worktree_worker_execution",
    "governed_worker.claude_dry_run_running",
    "governed_worker.claude_real_execution_running",
    "governed_worker.hermes_real_execution_unavailable",
    "non_executing_dry_run",
    "KENDALL_COPY_EXECUTION_OK",
    "Selected route",
    "Rejected routes",
    "Source context",
    "Reason codes",
    "Clarify",
    "Downgrade to reference",
    "Send back to Research",
    "Typed action",
    "Rollback",
    "approve_execution",
    "approve_provider_exception",
    "approve_memory_proposal",
    "approve_delivery",
    "request_clarification",
    "Request Changes",
    "Pause",
    "Mark Resolved",
    "disabled reason",
    "Retention",
    "Memory proposal blocked",
    "Packet id",
    "Patch summary",
    "Sensitivity",
    "Freshness",
    "Contradiction",
    "Confidence",
    "Source Boundary Checklist",
    "Canonicality",
    "Allowed reads",
    "Allowed writes",
    "Blocked operations",
    "Obsidian is canonical and human-owned",
    "LLM-Wiki is derived, disposable, and rebuildable",
    "Obsidian wins by default",
    "Candidate Work",
    "Obsidian inbox",
    "BMAD artifacts",
    "research/video",
    "GitHub",
    "manual capture",
    "included",
    "excluded",
    "stale",
    "contradictory",
    "unavailable",
    "derived-only"
  ]) {
    assert.match(pipelineComponentSource + fixtureSource, new RegExp(visibleLabel, "i"));
  }

  for (const cssContract of [
    ".pipeline-nohype-shell",
    ".pipeline-map-layout",
    ".pipeline-route-map",
    ".pipeline-route-row",
    ".pipeline-route-station",
    ".pipeline-stage-station",
    ".pipeline-mini-packet",
    ".pipeline-mini-packet-label",
    ".pipeline-inspection-panel",
    ".pipeline-route-connector-line",
    ".pipeline-usage-meter",
    ".pipeline-usage-meter-fill",
    ".pipeline-status-key",
    "prefers-reduced-motion: reduce",
  ]) {
    assert.match(globalsSource, new RegExp(cssContract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(globalsSource, /prefers-reduced-motion: reduce[\s\S]*\.pipeline-route-connector-line[\s\S]*animation: none/);
  assert.match(globalsSource, /prefers-reduced-motion: reduce[\s\S]*\.pipeline-inspection-panel[\s\S]*transition: none/);

  for (const { label, state, packetId } of [
    { label: "Candidate Work", state: "included", packetId: "fixture:happy-path" },
    { label: "Candidate Work", state: "included", packetId: "fixture:classify-intake" },
    { label: "Candidate Work", state: "included", packetId: "fixture:shape-plan" },
    { label: "Candidate Work", state: "included", packetId: "fixture:review-complete" },
    { label: "Candidate Work", state: "included", packetId: "fixture:promote-candidate" },
    { label: "Candidate Work", state: "included", packetId: "fixture:deliver-evidence" },
    { label: "Obsidian inbox", state: "excluded", packetId: "fixture:stale-source" },
    { label: "Obsidian inbox", state: "excluded", packetId: "fixture:learn-memory" },
    { label: "BMAD artifacts", state: "included", packetId: "fixture:human-gate-blocked" },
    { label: "research/video", state: "stale", packetId: "fixture:stale-source" },
    { label: "manual capture", state: "contradictory", packetId: "fixture:stale-source" },
    { label: "LLM-Wiki digest", state: "derived-only", packetId: "fixture:stale-source" },
    { label: "LLM-Wiki digest", state: "derived-only", packetId: "fixture:learn-memory" },
  ]) {
    assert.match(fixtureSource, new RegExp(`label: "${label}"[\\s\\S]*?state: "${state}"[\\s\\S]*?packetRefs: \\[[^\\]]*"${packetId}"`));
    assert.match(fixtureSource, new RegExp(`packetId: "${packetId}"[\\s\\S]*?sourceTrustStates: \\[[^\\]]*"${state}"`));
  }

  for (const packetSurface of [
    "sourceRefs",
    "evidenceRefs",
    "artifactRefs",
    "laneCards",
    "humanGateActions",
    "humanGateFixtureEvents",
    "recoveryFixtureEvents",
    "actionGuardFixtures",
    "memoryProposals",
    "recoveryActions"
  ]) {
    assert.match(fixtureSource, new RegExp(packetSurface));
  }

  assert.match(fixtureSource, /WorkPacketV0View/);
  assert.match(fixtureSource, /import type \{[\s\S]*WorkPacketV0View[\s\S]*\} from "@kendall\/contracts";/);
  assert.match(fixtureSource, /export type PipelineReadPacketContractV0 = WorkPacketV0View;/);
  assert.match(fixtureSource, /export type PipelineFixturePacket = PipelineReadPacketContractV0 & \{/);
  assert.doesNotMatch(
    fixtureSource,
    /export type Pipeline(Read)?Packet(V0|View)?\s*=\s*\{/,
    "dashboard fixtures should not define a parallel dashboard model"
  );
  assert.doesNotMatch(
    fixtureSource,
    /export interface Pipeline(Read)?Packet(V0|View)?\s*\{/,
    "dashboard fixtures should not define a parallel dashboard model"
  );
  assert.match(cockpitSource, /import type \{ PipelineDashboardPacket \} from "\.\.\/\.\.\/lib\/pipeline-supervisor-projector";/);
  assert.match(cockpitSource, /type PipelineFixturePacket = PipelineDashboardPacket;/);
  assert.match(packetDetailSource, /import type \{ PipelineDashboardPacket \} from "\.\.\/\.\.\/lib\/pipeline-supervisor-projector";/);
  assert.match(packetDetailSource, /type PipelineFixturePacket = PipelineDashboardPacket;/);
  assert.match(fixtureSource, /type: "approve_execution"/);
  assert.match(fixtureSource, /type: "approve_delivery"/);
  assert.match(fixtureSource, /type: "request_clarification"/);
  for (const recoveryActionType of [
    "retry_smaller",
    "reroute",
    "cancel_worker",
    "discard_result",
    "preserve_evidence",
    "reopen_human_gate",
    "mark_blocked",
    "reenter_capture",
    "send_back_to_shape",
    "send_back_to_research",
  ]) {
    assert.match(fixtureSource, new RegExp(`"${recoveryActionType}"`));
  }
  assert.match(fixtureSource, /family: "Approve"/);
  assert.match(fixtureSource, /family: "Pause"/);
  assert.match(fixtureSource, /family: "Mark Resolved"/);
  assert.match(fixtureSource, /authorityFamily:/);
  assert.match(fixtureSource, /payload:/);
  assert.match(fixtureSource, /decisionId:/);
  assert.match(fixtureSource, /stopLines:/);
  assert.match(fixtureSource, /rollbackPath:/);
  assert.match(fixtureSource, /auditEventType:/);
  assert.match(fixtureSource, /disabledReason:/);
  assert.match(fixtureSource, /payload:\s*\{\s*\.\.\.action\.payload[\s\S]*packetId,[\s\S]*actionId: remapId\(action\.payload\.actionId\),[\s\S]*decisionId: remapId\(action\.payload\.decisionId\),/);
  assert.match(fixtureSource, /buildHumanGateFixtureEvents/);
  assert.match(fixtureSource, /eventId: `\$\{action\.actionId\}:event`/);
  assert.match(fixtureSource, /fromStage:/);
  assert.match(fixtureSource, /toStage: action\.resultingStage/);
  assert.match(fixtureSource, /toOwner: action\.resultingOwner/);
  assert.match(fixtureSource, /humanGateFixtureEvents: packet\.humanGateFixtureEvents\.map/);
  assert.match(fixtureSource, /eventId: remapId\(event\.eventId\)/);
  assert.match(fixtureSource, /buildRecoveryFixtureEvents/);
  assert.match(fixtureSource, /buildActionGuardFixtures/);
  assert.match(fixtureSource, /ActionGuardFixture/);
  assert.match(fixtureSource, /stale_packet_state/);
  assert.match(fixtureSource, /stale_action_id/);
  assert.match(fixtureSource, /missing_evidence/);
  assert.match(fixtureSource, /unknown_action/);
  assert.match(fixtureSource, /unsafe_authority_class/);
  assert.match(fixtureSource, /blocked_source_boundary/);
  assert.match(fixtureSource, /LocalModelHealthV0/);
  assert.match(fixtureSource, /pipelineLocalModelHealthFixtures/);
  assert.match(fixtureSource, /pipelineSourceBoundaryChecklist/);
  assert.match(fixtureSource, /localModelHealth/);
  assert.match(fixtureSource, /local-readiness/);
  assert.match(fixtureSource, /healthy/);
  assert.match(fixtureSource, /unavailable/);
  assert.match(fixtureSource, /busy/);
  assert.match(fixtureSource, /model_mismatch/);
  assert.match(fixtureSource, /endpoint_mismatch/);
  assert.match(fixtureSource, /approval_required/);
  assert.match(fixtureSource, /metadata_only/);
  assert.match(fixtureSource, /fixture_or_wrapper_state_only/);
  assert.match(fixtureSource, /Dashboard does not probe the Windows Ollama endpoint/);
  assert.match(fixtureSource, /real_hermes_launch/);
  assert.match(fixtureSource, /obsidian_mutation/);
  assert.match(fixtureSource, /model_gateway_replacement/);
  assert.match(fixtureSource, /expanded_claude_automation/);
  assert.match(fixtureSource, /evidence_retention_bypass/);
  assert.match(fixtureSource, /false_authority/);
  assert.match(fixtureSource, /actionGuardFixtures: packet\.actionGuardFixtures\.map/);
  assert.match(fixtureSource, /recoveryActionFixtureMetadata/);
  assert.match(fixtureSource, /matrixRecoveryActions/);
  assert.match(fixtureSource, /catalogRecoveryActions/);
  assert.match(fixtureSource, /execution_attempt\.review_rejected/);
  assert.match(fixtureSource, /eventType: "work_packet\.recovery_selected\.fixture_preview"/);
  assert.match(fixtureSource, /requiresHumanGate: metadata\.requiresHumanGate/);
  assert.doesNotMatch(fixtureSource, /action\.availability !== "available" && humanGateAction !== null/);
  assert.match(fixtureSource, /recoveryFixtureEvents: packet\.recoveryFixtureEvents\.map/);
  assert.doesNotMatch(fixtureSource, /actionType: "approve"/);
  assert.doesNotMatch(fixtureSource, /availability: input\.currentStage === "human_gate" \? "available" : "blocked"/);
  for (const stage of [
    "capture",
    "classify",
    "route",
    "shape",
    "human_gate",
    "execute",
    "review",
    "promote",
    "deliver",
    "learn",
  ]) {
    assert.match(fixtureSource, new RegExp(`currentStage: "${stage}"`));
  }
  assert.doesNotMatch(pipelineComponentSource, /Fixture packet stage\./);
  assert.match(pipelineComponentSource, /useState/);
  assert.match(cockpitSource, /SelectedMapItem/);
  assert.match(cockpitSource, /setSelectedItem/);
  assert.doesNotMatch(cockpitSource, /pipelineStageRows/);
  assert.match(cockpitSource, /pipelineStages\.map/);
  assert.match(cockpitSource, /RouteStation/);
  assert.match(cockpitSource, /PacketMiniCard/);
  assert.match(cockpitSource, /PacketInspection/);
  assert.match(cockpitSource, /sortPacketsForMap/);
  assert.match(cockpitSource, /selectedPacketInStage/);
  assert.match(cockpitSource, /expanded \? sortedPackets : sortedPackets\.slice\(0, visibleLimit\)/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.attention/);
  assert.match(cockpitSource, /aria-label="Action needed packet"/);
  assert.match(cockpitSource, /Action needed: \$\{packet\.title\}/);
  assert.match(cockpitSource, /pipeline-mini-packet-action-needed/);
  assert.match(cockpitSource, /<span aria-hidden="true">!<\/span>/);
  assert.match(cockpitSource, /<span>Need<\/span>/);
  assert.match(cockpitSource, /packetCardAttentionReasonLabel/);
  assert.match(cockpitSource, /packetCardOperatorActionLabel/);
  assert.match(cockpitSource, /stageKnownTotalCount = stageRenderedCount/);
  assert.match(cockpitSource, /return packet\.nextAction/);
  assert.match(cockpitSource, /plainStageLabel/);
  assert.match(cockpitSource, /onSelectStage/);
  assert.match(cockpitSource, /aria-label=\{packet\.activeBoardCard\?\.attention/);
  assert.match(cockpitSource, /: `Inspect packet: \$\{packet\.title\}`/);
  assert.match(pipelineComponentSource, /packet\.sourceKind === "demo-fixture" \? "\/pipeline\/demo\/packets" : "\/pipeline\/packets"/);
  assert.match(pipelineComponentSource, /encodeURIComponent\(packet\.packetId\)/);
  assert.match(packetDetailRouteSource, /decodeURIComponent\(packetId\)/);
  assert.match(pipelineComponentSource, /onSelectPacket/);
  assert.match(pipelineComponentSource, /Packet search/);
  assert.match(pipelineComponentSource, /searchInputRef/);
  assert.match(pipelineComponentSource, /event\.key === "\/"/);
  assert.doesNotMatch(cockpitSource, /movePacketFocus/);
  assert.match(cockpitSource, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown/);
  assert.match(cockpitSource, /handleRouteMapKeyDown/);
  assert.match(cockpitSource, /event\.key === "Escape"/);
  assert.doesNotMatch(cockpitSource, /registerPacketCard/);
  assert.doesNotMatch(cockpitSource, /StageLane/);
  assert.match(pipelineComponentSource, /searchablePacketText/);
  assert.match(pipelineComponentSource, /sr-only/);
  assert.match(pipelineComponentSource, /tabIndex=\{0\}/);
  assert.doesNotMatch(cockpitSource, /overflow-x-auto/);
  assert.doesNotMatch(cockpitSource, /pipelineStageRows/);
  assert.match(cockpitSource, /pipelineStages\.map/);
  assert.match(globalsSource, /\.pipeline-route-map[\s\S]*overflow: visible/);
  assert.match(globalsSource, /\.pipeline-nohype-shell[\s\S]*overflow: visible/);
  assert.match(cockpitSource, /pipeline-route-connectors/);
  assert.match(cockpitSource, /pipeline-route-connector-line/);
  assert.doesNotMatch(cockpitSource, /pipeline-route-connector-pulse/);
  assert.doesNotMatch(cockpitSource, /stageSummary[\s\S]{0,240}pipeline-route-connector|sourceLabel[\s\S]{0,240}pipeline-route-connector|freshnessState[\s\S]{0,240}pipeline-route-connector/);
  assert.match(globalsSource, /\.pipeline-route-anchor[\s\S]*position: absolute/);
  assert.match(cockpitSource, /Math\.abs\(currentRect\.top - nextRect\.top\) < 24/);
  assert.doesNotMatch(cockpitSource, /Math\.abs\(start\.y - end\.y\) < 24/);
  assert.match(cockpitSource, /currentRect\.height \* 0\.76/);
  assert.match(cockpitSource, /nextRect\.height \* 0\.24/);
  assert.doesNotMatch(globalsSource, /@keyframes pipeline-route-flow[\s\S]*stroke-dashoffset/);
  assert.match(globalsSource, /\.pipeline-route-connector-line[\s\S]*stroke-dasharray/);
  assert.match(globalsSource, /\.pipeline-route-row[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(12\.5rem, 100%\), 1fr\)\)/);
  assert.match(globalsSource, /max-width: 720px[\s\S]*\.pipeline-route-row[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(12\.5rem, 100%\), 1fr\)\)/);
  assert.doesNotMatch(cockpitSource, /min-h-\[34rem\]/);
  assert.match(globalsSource, /\.kendall-info-tip/);
  assert.match(globalsSource, /\.dashboard-page-menu-nav[\s\S]*position: fixed/);
  assert.match(globalsSource, /\.dashboard-page-menu-nav[\s\S]*right: 1rem/);
  assert.match(globalsSource, /max-width: 720px[\s\S]*\.dashboard-page-menu-nav[\s\S]*bottom: 1rem/);
  assert.match(globalsSource, /max-width: 720px[\s\S]*\.dashboard-page-menu-nav[\s\S]*right: auto/);
  assert.match(globalsSource, /\.dashboard-page-menu/);
  assert.match(globalsSource, /\.dashboard-page-menu-links[\s\S]*right: 0/);
  assert.match(globalsSource, /\.dashboard-page-menu-group/);
  assert.match(globalsSource, /\.dashboard-page-menu-group-heading/);
  assert.match(globalsSource, /\.dashboard-page-menu-group-links/);
  assert.match(globalsSource, /max-width: 720px[\s\S]*\.dashboard-page-menu-links[\s\S]*left: 0[\s\S]*right: auto/);
  assert.match(globalsSource, /\.dashboard-page-menu-summary[\s\S]*list-style: none/);
  assert.match(globalsSource, /\.dashboard-page-menu-summary::marker[\s\S]*display: none/);
  assert.match(globalsSource, /\.pipeline-stage-info-icon/);
  assert.match(globalsSource, /\.pipeline-stage-info-bubble/);
  assert.match(globalsSource, /\.pipeline-stage-station:hover \.pipeline-stage-info-bubble/);
  assert.match(globalsSource, /\.pipeline-stage-label/);
  assert.match(cockpitSource, /Pipeline operational strip/);
  assert.match(cockpitSource, /Mission control focus strip/);
  assert.doesNotMatch(cockpitSource, /stageToneForPackets/);
  assert.doesNotMatch(cockpitSource, /pipeline-route-station-\$\{stageTone\}/);
  assert.doesNotMatch(globalsSource, /\.pipeline-route-connector-pulse|pipeline-route-flow|\.pipeline-route-station-active|\.pipeline-route-station-approval|\.pipeline-route-station-blocked|\.pipeline-route-station-complete/);
  assert.match(cockpitSource, /pipeline-mini-packet-proof/);
  assert.match(cockpitSource, /pipeline-mini-packet-body/);
  assert.match(cockpitSource, /pipeline-mini-packet-meta/);
  assert.match(globalsSource, /\.pipeline-mini-packet-body/);
  assert.match(globalsSource, /\.pipeline-mini-packet-meta/);
  for (const packetCardHelper of [
    "packetCardStatusLabel",
    "packetCardStageLabel",
    "packetCardTruthLabel",
    "packetCardEvidenceLabel",
    "packetCardNextLabel",
    "packetCardTestabilityLabel",
  ]) {
    assert.match(cockpitSource, new RegExp(packetCardHelper));
  }
  assert.match(cockpitSource, /status \$\{packet\.status\}/);
  assert.match(cockpitSource, /stage \$\{plainStageLabel\(packet\.currentStage\)\}/);
  assert.match(cockpitSource, /truth \$\{truth\}; source \$\{packet\.freshnessLabel\}/);
  assert.match(cockpitSource, /function packetCardEvidenceLabel/);
  assert.doesNotMatch(cockpitSource, /packetCardEvidenceLabel\(packet\)/);
  assert.match(cockpitSource, /next action not named/);
  assert.match(cockpitSource, /blocker not named/);
  assert.match(cockpitSource, /testability unknown/);
  assert.doesNotMatch(cockpitSource, /testability ready/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.title\.trim\(\) \|\| packet\.title\.trim\(\) \|\| "untitled packet"/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.statusLabel/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.nextActionLabel/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.attentionReasonLabel/);
  assert.match(cockpitSource, /packet\.activeBoardCard\?\.nextOperatorActionLabel/);
  assert.match(cockpitSource, /detailBlocker !== "blocker not named"/);
  assert.match(cockpitSource, /detailNextAction !== "next action not named"/);
  assert.match(cockpitSource, /aria-label=\{`Ready to test: \$\{packet\.title\}`\}/);
  assert.match(cockpitSource, /pipeline-mini-packet-ready/);
  assert.doesNotMatch(cockpitSource, /packetCardNextLabel\(packet\)}; \{packetCardTestabilityLabel\(packet\)/);
  assert.match(cockpitSource, /Testing and risk/);
  assert.match(cockpitSource, /projectionDetailMovementSummary/);
  assert.match(cockpitSource, /Latest movement/);
  assert.match(cockpitSource, /movement proof not present in projection detail/);
  assert.match(cockpitSource, /packetTestTargetLabel/);
  assert.match(cockpitSource, /packetChecksRunLabel/);
  assert.match(cockpitSource, /packetResidualRiskLabel/);
  assert.match(activeBoardViewModelSource, /emergency_stop/);
  assert.match(activeBoardViewModelSource, /kill state/);
  assert.match(cockpitSource, /backend projection: packet truth live/);
  assert.match(cockpitSource, /backend projection: packet truth \$\{packet\.truthLabel\}; dashboard proof \$\{packetProofLabel\}/);
  assert.match(cockpitSource, /const nextAction = packet\.nextAction\.trim\(\) \|\| "next action not named"/);
  assert.doesNotMatch(cockpitSource, /Inspect backend projection packet/);
  assert.doesNotMatch(cockpitSource, /miniCardReasonLabel/);
  assert.match(globalsSource, /\.pipeline-mini-packet-proof/);
  assert.match(cockpitSource, /non-live fixture/);
  assert.match(cockpitSource, /Fixture\/non-live packet; cannot satisfy live proof/);
  assert.match(packetDetailSource, /Demo fixture; cannot satisfy live proof/);
  assert.match(packetDetailSource, /non-live fixture/);
  assert.doesNotMatch(cockpitSource, /sourceLabel === "fixture" \|\| freshnessState === "fixture" \|\| reason === "fixture_fallback"/);
  assert.match(cockpitSource, /stageCode/);
  assert.match(cockpitSource, /globalUsageItems/);
  assert.match(cockpitSource, /providerKey:\s*"codex"/);
  assert.match(cockpitSource, /providerKey:\s*"claude"/);
  assert.match(cockpitSource, /pipeline-usage-warning-icon/);
  assert.doesNotMatch(cockpitSource, /Codex 5h remaining|Codex weekly|Claude 5h remaining|Claude weekly|Connect read-only usage source/);
  assert.doesNotMatch(cockpitSource, /codexActiveCount|claudePendingCount|codexFiveHourRemaining|claudeFiveHourRemaining/);
  assert.doesNotMatch(cockpitSource + globalsSource, /pipeline-stage-dot/);
  assert.match(cockpitSource, /Packet plain-language summary/);
  assert.match(cockpitSource, /overflowSummary/);
  assert.doesNotMatch(cockpitSource, /More packets inside|No packets here/);
  assert.doesNotMatch(cockpitSource, /Pipeline inspection panel|Stage inspection panel|Stage plain-language facts|Choose a packet or stage|No packet is selected by default/);
  assert.doesNotMatch(cockpitSource, /From idea to shipped|dev branch|no live calls|Blocked gates|Provider approval|Global recovery/);
  assert.doesNotMatch(cockpitSource, /Mission route map|map view|manual/);
  assert.match(pipelineComponentSource, /Refined pipeline cockpit frame/);
  assert.match(pipelineComponentSource, /Cockpit first-frame hierarchy/);
  assert.doesNotMatch(cockpitSource, /Pipeline orientation summary/);
  assert.doesNotMatch(cockpitSource, /This page shows flow, stage, ownership, blockage, and next motion/);
  assert.doesNotMatch(cockpitSource, /Packet internals live behind the packet click/);
  assert.doesNotMatch(cockpitSource, /Stage flow/);
  assert.doesNotMatch(cockpitSource, /pipeline-board-flow/);
  assert.match(cockpitSource, /shadow-\[0_0_1rem_color-mix\(in_srgb,var\(--info\)_10%,transparent\)\]/);
  assert.match(cockpitSource, /pipeline-mini-packet-label/);
  assert.match(globalsSource, /\.pipeline-mini-packet-label[\s\S]*white-space: nowrap/);
  assert.doesNotMatch(cockpitSource, /import\s+\{\s*pipelineStages\s+\}\s+from\s+"..\/..\/lib\/pipeline-fixtures"/);
  assert.match(packetDetailSource, /Packet 5 Whys/);
  assert.match(packetDetailSource, /Evidence and artifacts/);
  assert.match(packetDetailSource, /Workers and review/);
  assert.match(packetDetailSource, /Gate, memory, recovery/);
  assert.match(packetDetailSource, /Delivery and cleanup evidence/);
  assert.match(packetDetailSource, /Learn panel: Memory proposals/);
  assert.match(packetDetailSource, /Action request ledger/);
  assert.match(packetDetailSource, /Learn outcome/);
  assert.match(packetDetailSource, /Learn refill/);
  assert.match(packetDetailSource, /required evidence:/);
  assert.match(packetDetailSource, /stop lines:/);
  assert.match(packetDetailSource, /rollback:/);
  assert.match(packetDetailSource, /audit:/);
  assert.match(packetDetailSource, /proposal type:/);
  assert.match(packetDetailSource, /sensitivity:/);
  assert.match(packetDetailSource, /contradiction:/);
  assert.match(packetDetailSource, /write-back allowed:/);
  assert.match(packetDetailSource, /write-back status:/);
  assert.match(packetDetailSource, /guard classification:/);
  assert.match(packetDetailSource, /expected binding:/);
  assert.match(packetDetailSource, /actual binding:/);
  assert.match(packetDetailSource, /primary risk:/);
  assert.match(packetDetailSource, /stop line:/);
  assert.match(packetDetailSource, /safe next option:/);
  assert.match(packetDetailSource, /fixture event:/);
  assert.match(packetDetailSource, /Packet source boundaries/);
  assert.doesNotMatch(cockpitSource, /FixtureScenarioSelector|GoldenPathLifecycle|ActivePacketDrawer|RecoveryDrawerPanel|ActionGuardPanel|EvidenceDetailList|evaluateFixtureActionDecision/);
  assert.match(fixtureSource, /routeFork/);
  assert.match(fixtureSource, /pipelineFixtureScenarios/);
  assert.match(fixtureSource, /pipelineGoldenPathSnapshots/);
  assert.match(fixtureSource, /pipelineDensityFixturePackets/);
  assert.match(fixtureSource, /pipelineCockpitPackets/);
  assert.match(fixtureSource, /Array\.from\(\{ length: 15 \}/);
  assert.match(cockpitSource, /findTopAttentionPacket/);
  assert.match(cockpitSource, /packet\.status === "blocked" \|\| packet\.status === "failed" \|\| packet\.currentStage === "human_gate"/);
  assert.match(fixtureSource, /Density \$\{ordinal\}:/);
  assert.match(routeSource, /loadPipelineCockpitPackets/);
  const fixturePacketCount = (fixtureSource.match(/packetFixture\(\{/g) ?? []).length;
  const densityCloneCountMatch = fixtureSource.match(/Array\.from\(\{ length: (\d+) \}/);
  assert.ok(densityCloneCountMatch, "density fixture clone count should be explicit");
  assert.ok(fixturePacketCount + Number(densityCloneCountMatch[1]) >= 25, "pipeline cockpit should load at least 25 fixture packets");
  for (const snapshotLabel of [
    "Capture",
    "Classify",
    "Route",
    "Shape",
    "Human Gate",
    "Execute",
    "Review",
    "Deliver",
    "Learn",
  ]) {
    assert.match(fixtureSource, new RegExp(`"${snapshotLabel}"`));
  }
  for (const snapshotField of [
    "snapshotId",
    "packetId",
    "currentStage",
    "currentOwner",
    "evidenceRef",
    "nextAction",
    "decisionConsequence",
    "whatPacketIs",
    "whyHere",
    "whatNeedsOperator",
    "whatHappensNext",
  ]) {
    assert.match(fixtureSource, new RegExp(snapshotField));
  }
  for (const scenarioLabel of [
    "happy path",
    "model unavailable",
    "local GPU busy",
    "low-confidence route",
    "source excluded",
    "stale memory",
    "contradiction detected",
    "Hermes timeout",
    "Claude skipped",
    "rejected Claude finding",
    "blocked Obsidian write-back",
    "provider approval required",
    "recovery action available",
    "no-packets",
  ]) {
    assert.match(fixtureSource, new RegExp(`label:\\s*"${scenarioLabel}"|,\\s*"${scenarioLabel}"`));
  }
  for (const scenarioField of [
    "currentOwner",
    "blockedReason",
    "nextOperatorOption",
    "fixtureLabel",
    "evidenceRefs",
    "stopLine",
    "rollbackPath",
    "selectedPacketId",
  ]) {
    assert.match(fixtureSource, new RegExp(scenarioField));
  }
  assert.match(fixtureSource, /lowConfidenceActions/);
  assert.match(fixtureSource, /rejectedRoutes/);
  assert.match(fixtureSource, /riskFlags/);
  assert.match(fixtureSource, /lastEvent/);
  assert.match(fixtureSource, /requireCatalogEntry/);
  assert.match(fixtureSource, /requireMatrixRows/);
  assert.match(fixtureSource, /validatePacketMatrixRows/);
  assert.match(fixtureSource, /requireSelectedPipelinePacket/);
  assert.match(fixtureSource, /PIPELINE_STATE_EVIDENCE_MATRIX_V0|PIPELINE_STATE_FIXTURE_CATALOG_V0/);
  assert.doesNotMatch(fixtureSource, /rawPrompt|rawCompletion|reasoningTrace|providerPayload|secretValue|credentialValue|credentialPayload|writeBackAllowed:\s*true/);
  assert.doesNotMatch(allPipelineSource, /rawPrompt|rawCompletion|reasoningTrace|providerPayload|secretValue|credentialValue|credentialPayload|memoryDump|fullRawHistory/);
  assert.doesNotMatch(allPipelineSource, /getRunStatus|getWorkItems|getWorkPackets|EventSource|WebSocket|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(routeSource + "\n" + pipelineComponentSource, /11434\/v1\/chat\/completions|OllamaProviderAdapter|ollama_provider_adapter|model\s*discovery|endpoint\s*discovery/i);
  assert.doesNotMatch(
    allPipelineSource,
    /from\s+["']node:child_process["']|require\(["']child_process["']\)|spawn\s*\(|exec\s*\(|from\s+["']node:worker_threads["']|from\s+["']node:http["']|from\s+["']node:https["']|from\s+["']node:fs["']|from\s+["']fs["']|writeFile\s*\(|appendFile\s*\(|mkdir\s*\(|rename\s*\(|unlink\s*\(|from\s+["']undici["']|from\s+["']axios["']|import\s*\(\s*["']openai["']|import\s*\(\s*["']@anthropic|new\s+Worker\s*\(|Dockerode|dockerode|@docker|createContainer|runHermes|launchHermes|HermesRuntime|runCodex|launchCodex|CodexRuntime|runClaude|launchClaude|ClaudeRuntime|writeObsidian|mutateObsidian|updateCanonicalMemory|canonicalMemoryUpdate|obsidianWriteBack|vaultWrite|from\s+["']@anthropic|from\s+["']openai|api\.anthropic|api\.openai|killSwitch\(\)/i
  );
  assert.match(navSource, /href:\s*"\/pipeline"/);
});

test("pipeline import boundary follows shared dashboard-local runtime intermediaries", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "pipeline-import-boundary-"));
  const fixtureFiles = {
    "scripts/check-dashboard-pipeline-import-boundary.mjs": await readFile(pipelineImportBoundaryCheckPath, "utf8"),
    "apps/dashboard/src/app/pipeline/page.tsx": 'import "../../components/shared-pipeline-runtime";\n',
    "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx": "export default function Page() {}\n",
    "apps/dashboard/src/app/pipeline/demo/page.tsx": [
      'import "../../../lib/pipeline-fixtures";',
      'import "../../../lib/pipeline/manager-execution-lane-summary";',
      "export default function DemoPage() {}",
      "",
    ].join("\n"),
    "apps/dashboard/src/app/pipeline/demo/packets/[packetId]/page.tsx": "export default function DemoDetailPage() {}\n",
    "apps/dashboard/src/components/shared-pipeline-runtime.ts": [
      'import "node:fs";',
      'import "../lib/pipeline-fixtures";',
      "export function sharedPipelineRuntime() { return fetch(\"/forbidden\"); }",
      "",
    ].join("\n"),
    "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx": "export function PipelineCockpit() {}\n",
    "apps/dashboard/src/components/pipeline/packet-detail-page.tsx": "export function PacketDetailPage() {}\n",
    "apps/dashboard/src/lib/pipeline-fixtures.ts": "export const fixtureCatalog = [];\n",
    "apps/dashboard/src/lib/pipeline-packet-loader.ts": "export const loadPackets = () => [];\n",
    "apps/dashboard/src/lib/pipeline-supervisor-projector.ts": "export const projectPackets = () => [];\n",
    "apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts": "export const managerSummary = {};\n",
  };

  try {
    for (const [relativePath, source] of Object.entries(fixtureFiles)) {
      const targetPath = join(fixtureRoot, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, source, "utf8");
    }

    const checkerPath = join(fixtureRoot, "scripts/check-dashboard-pipeline-import-boundary.mjs");
    const leakingRun = spawnSync(process.execPath, [checkerPath], { cwd: fixtureRoot, encoding: "utf8" });
    assert.equal(leakingRun.status, 1);
    assert.match(leakingRun.stderr, /normal \/pipeline route graph must not reach apps\/dashboard\/src\/lib\/pipeline-fixtures\.ts/);
    assert.match(leakingRun.stderr, /shared-pipeline-runtime\.ts: forbidden import boundary node-fs: node:fs/);
    assert.match(leakingRun.stderr, /shared-pipeline-runtime\.ts: forbidden call boundary network-fetch/);

    await writeFile(
      join(fixtureRoot, "apps/dashboard/src/components/shared-pipeline-runtime.ts"),
      "export const sharedPipelineRuntime = true;\n",
      "utf8",
    );
    const cleanRun = spawnSync(process.execPath, [checkerPath], { cwd: fixtureRoot, encoding: "utf8" });
    assert.equal(cleanRun.status, 0, cleanRun.stderr);
    const report = JSON.parse(cleanRun.stdout);
    assert.equal(report.normalFixtureCatalogReachable, false);
    assert.equal(report.demoFixtureCatalogReachable, true);
    assert.ok(report.normalRouteGraphFiles >= 3, "normal graph should include the shared dashboard-local intermediary");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("pipeline local model health fixtures cover readiness states without direct provider probes", async () => {
  const { pipelineCockpitPackets, pipelineFixturePackets, pipelineLocalModelHealthFixtures } = await loadCompiledDashboardFixtures();

  const requiredStates = ["healthy", "unavailable", "busy", "model_mismatch", "endpoint_mismatch", "approval_required"];
  assert.deepEqual(
    requiredStates.filter((state) => !pipelineLocalModelHealthFixtures.some((fixture) => fixture.statusLabel === state)),
    [],
    "local model health fixtures should cover every required status"
  );

  for (const fixture of pipelineLocalModelHealthFixtures) {
    assert.equal(fixture.provider, "ollama");
    assert.equal(fixture.retentionPolicy, "metadata_only");
    assert.equal(fixture.dataSource, "fixture_or_wrapper_state_only");
    assert.equal(fixture.noProbeBoundary, "Dashboard does not probe the Windows Ollama endpoint");
    assert.equal(fixture.approvedEndpointUrl, "approved VM-to-host Ollama endpoint (redacted)");
    assert.ok(!/http:\/\/|https:\/\/|11434|192\.168\.|127\.0\.0\.1/.test(fixture.approvedEndpointUrl), `${fixture.statusLabel} should not expose a concrete provider endpoint`);
    assert.equal(fixture.endpointApproved, fixture.endpointUrl === fixture.approvedEndpointUrl, `${fixture.statusLabel} endpoint approval should match configured vs approved endpoint`);
    assert.equal(fixture.modelApproved, fixture.modelId === fixture.approvedModelId, `${fixture.statusLabel} model approval should match configured vs approved model`);
    assert.doesNotMatch(fixture.fallbackPath, /openai|anthropic|claude|remote provider|alternate provider|silently route/i, `${fixture.statusLabel} fallback should not route to another provider`);
    assert.ok(fixture.allowedCaller.length > 0, `${fixture.statusLabel} should name the allowed caller/source`);
    assert.ok(fixture.fallbackPath.length > 0, `${fixture.statusLabel} should name a fallback path`);
    assert.ok(fixture.authoritySummary.length > 0, `${fixture.statusLabel} should explain call authority`);
    assert.ok(fixture.statusLabel.length > 0, "status label should be visible");

    if (fixture.statusLabel !== "healthy") {
      assert.ok(fixture.lastFailure?.length > 0 || fixture.callAuthorityState !== "approved", `${fixture.statusLabel} should expose failure or authority context`);
    }
  }

  const byState = Object.fromEntries(pipelineLocalModelHealthFixtures.map((fixture) => [fixture.statusLabel, fixture]));
  assert.equal(byState.healthy.endpointApproved, true);
  assert.equal(byState.healthy.modelApproved, true);
  assert.equal(byState.healthy.reachable, true);
  assert.equal(byState.healthy.busyState, "idle");
  assert.equal(byState.healthy.callAuthorityState, "approved");
  assert.equal(typeof byState.healthy.lastLatencyMs, "number");
  assert.equal(byState.unavailable.reachable, false);
  assert.equal(byState.unavailable.callAuthorityState, "blocked");
  assert.equal(byState.busy.reachable, true);
  assert.equal(byState.busy.busyState, "busy");
  assert.equal(byState.model_mismatch.modelApproved, false);
  assert.equal(byState.model_mismatch.callAuthorityState, "approval_required");
  assert.equal(byState.endpoint_mismatch.endpointApproved, false);
  assert.equal(byState.endpoint_mismatch.callAuthorityState, "approval_required");
  assert.equal(byState.approval_required.endpointApproved, true);
  assert.equal(byState.approval_required.modelApproved, true);
  assert.equal(byState.approval_required.callAuthorityState, "approval_required");

  const packetsWithHealth = pipelineFixturePackets.filter((packet) => packet.localModelHealth !== null);
  assert.ok(packetsWithHealth.length >= requiredStates.length, "fixture packets should expose local model health examples");
  for (const state of requiredStates) {
    const packet = packetsWithHealth.find((candidate) => candidate.localModelHealth?.statusLabel === state);
    assert.ok(packet, `missing packet-bound local model health state ${state}`);
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "local_model" && lane.evidenceRefs.includes(packet.localModelHealth.evidenceRef)),
      `${state} should be represented by a local_model lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.localModelHealth.evidenceRef && ref.evidenceType === "local_model" && ref.rawPayloadRetained === false),
      `${state} should have metadata-only local_model evidence`
    );
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.localModelHealth !== null)) {
    const refs = packet.evidenceRefs.map((ref) => ref.refId);
    assert.equal(refs.filter((ref) => ref === packet.localModelHealth.evidenceRef).length, 1, `${packet.packetId} should contain local health evidence exactly once`);
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "local_model" && lane.evidenceRefs.includes(packet.localModelHealth.evidenceRef)),
      `${packet.packetId} local model lane should point at packet-local health evidence`
    );
    assert.match(packet.localModelHealth.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} local health evidence should be packet-local`);
  }
});

test("pipeline Hermes worker fixtures render mocked containment without runtime paths", async () => {
  const { pipelineCockpitPackets, pipelineFixturePackets, pipelineHermesJobFixtures } = await loadCompiledDashboardFixtures();

  const requiredStates = ["mocked_ready", "mocked_timeout", "blocked_containment"];
  assert.deepEqual(
    requiredStates.filter((state) => !pipelineHermesJobFixtures.some((fixture) => fixture.statusLabel === state)),
    [],
    "Hermes fixtures should cover ready, timeout, and blocked containment states"
  );

  for (const fixture of pipelineHermesJobFixtures) {
    assert.equal(fixture.executionMode, "mocked");
    assert.equal(fixture.credentialPolicy, "none");
    assert.equal(fixture.sourceMutationPolicy, "forbidden");
    assert.equal(fixture.networkPolicy, "none");
    assert.ok(fixture.jobId.length > 0);
    assert.ok(fixture.packetId.length > 0);
    assert.ok(fixture.workerProfile.length > 0);
    assert.ok(fixture.inputRefs.length > 0);
    assert.ok(fixture.allowedMounts.length > 0);
    assert.ok(fixture.writableOutputDir.length > 0);
    assert.ok(fixture.timeoutSeconds >= 0);
    assert.ok(fixture.expectedOutputSchema.length > 0);
    assert.equal(fixture.cleanupPolicy, "preview cleanup policy only; no filesystem cleanup runs");
    assert.equal(fixture.killSwitch, "visible policy stop line only; not runnable from dashboard");
    assert.ok(fixture.containmentSummary.length > 0);
    assert.match(fixture.boundarySummary, /no Docker worker is launched/i);
    assert.doesNotMatch(`${fixture.cleanupPolicy} ${fixture.killSwitch}`, /execute|executed|launch/i);
  }

  const packetsWithHermes = pipelineFixturePackets.filter((packet) => packet.hermesJob !== null);
  assert.ok(packetsWithHermes.length >= requiredStates.length, "fixture packets should expose Hermes job examples");
  for (const state of requiredStates) {
    const packet = packetsWithHermes.find((candidate) => candidate.hermesJob?.statusLabel === state);
    assert.ok(packet, `missing packet-bound Hermes state ${state}`);
    assert.equal(packet.hermesJob.executionMode, "mocked");
    if (state === "mocked_ready") {
      assert.equal(packet.status, "blocked", "mocked_ready is ready for inspection only until runtime authority exists");
      assert.match(packet.hermesJob.containmentSummary, /ready for inspection without runtime authority/i);
    }
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "hermes_worker_mock" && lane.evidenceRefs.includes(packet.hermesJob.evidenceRef)),
      `${state} should be represented by a hermes_worker_mock lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.hermesJob.evidenceRef && ref.retentionClass === "metadata_only" && ref.rawPayloadRetained === false),
      `${state} should have metadata-only Hermes evidence`
    );
  }

  for (const packet of packetsWithHermes.filter((candidate) => candidate.status === "blocked")) {
    const actionTypes = new Set(packet.recoveryActions.map((action) => action.actionType));
    for (const expectedAction of ["retry_smaller", "reroute", "send_back_to_shape"]) {
      assert.ok(actionTypes.has(expectedAction), `${packet.packetId} should expose ${expectedAction} recovery`);
    }
    assert.ok(packet.recoveryFixtureEvents.length > 0, `${packet.packetId} should expose recovery fixture events`);
    for (const action of packet.recoveryActions.filter((candidate) => actionTypes.has(candidate.actionType))) {
      const fixtureEvent = packet.recoveryFixtureEvents.find((event) => event.actionId === action.actionId);
      assert.equal(action.availability, "available", `${packet.packetId} ${action.actionType} should be previewable in the Recovery Drawer`);
      assert.ok(fixtureEvent, `${packet.packetId} ${action.actionType} should have a recovery fixture event`);
      assert.equal(fixtureEvent.requiresHumanGate, true, `${packet.packetId} ${action.actionType} should preserve Human Gate authority`);
      assert.ok(fixtureEvent.humanGateActionId, `${packet.packetId} ${action.actionType} should reference a Human Gate action`);
    }
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.hermesJob !== null)) {
    const refs = packet.evidenceRefs.map((ref) => ref.refId);
    assert.equal(refs.filter((ref) => ref === packet.hermesJob.evidenceRef).length, 1, `${packet.packetId} should contain Hermes evidence exactly once`);
    assert.match(packet.hermesJob.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} Hermes evidence should be packet-local`);
    assert.ok(packet.hermesJob.inputRefs.every((ref) => ref.includes(packet.packetId)), `${packet.packetId} Hermes input refs should be packet-local`);
    assert.ok(
      packet.hermesJob.writableOutputDir === "not allocated in fixture mode" || packet.hermesJob.writableOutputDir.includes(packet.packetId.replaceAll(":", "-")),
      `${packet.packetId} Hermes writable output metadata should be packet-local or explicitly unallocated`
    );
  }
});

test("pipeline Codex and Claude lane fixtures stay distinct and metadata-only", async () => {
  const { pipelineClaudeReviewFixtures, pipelineCockpitPackets, pipelineCodexWorkerFixtures, pipelineFixturePackets } = await loadCompiledDashboardFixtures();

  const packetDetailSource = await readFile(packetDetailPath, "utf8");
  const fixtureSource = await readFile(fixturesPath, "utf8");

  assert.ok(Array.isArray(pipelineCodexWorkerFixtures), "Codex worker fixtures should be exported");
  assert.ok(Array.isArray(pipelineClaudeReviewFixtures), "Claude review fixtures should be exported");
  assert.ok(pipelineCodexWorkerFixtures.length > 0, "Codex worker fixtures should cover active/readiness state");
  assert.ok(pipelineClaudeReviewFixtures.length > 0, "Claude review fixtures should cover skipped or blocked review state");
  assert.match(packetDetailSource, /Workers and review/);
  assert.match(packetDetailSource, /Codex:/);
  assert.match(packetDetailSource, /Claude:/);
  assert.match(fixtureSource, /implementation_worker/);
  assert.match(fixtureSource, /independent_review/);

  for (const fixture of pipelineCodexWorkerFixtures) {
    assert.equal(fixture.role, "implementation_worker");
    assert.equal(fixture.retentionPolicy, "metadata_only");
    assert.ok(fixture.attemptRefs.length > 0);
    assert.match(fixture.boundarySummary, /not.*independent reviewer/i);
    assert.doesNotMatch(`${fixture.role} ${fixture.boundarySummary}`, /second opinion|reviewer lane/i);
    assert.equal(Object.hasOwn(fixture, "command"), false);
    assert.equal(Object.hasOwn(fixture, "endpointUrl"), false);
    assert.equal(Object.hasOwn(fixture, "apiKey"), false);
    assert.equal(Object.hasOwn(fixture, "runtimeAdapter"), false);
  }

  for (const fixture of pipelineClaudeReviewFixtures) {
    assert.equal(fixture.retentionPolicy, "metadata_only");
    assert.equal(fixture.costScarcity, "scarce");
    assert.ok(["required", "policy_triggered"].includes(fixture.approvalRequirement));
    assert.equal(fixture.executionMode, "readiness_or_packet_only");
    assert.match(fixture.boundarySummary, /not an implementation lane/i);
    assert.ok(fixture.allowedContextRefs.length > 0);
    assert.ok(fixture.excludedContextRefs.length > 0);
    assert.ok(fixture.expectedFindingsSchema.length > 0);
    assert.equal(Object.hasOwn(fixture, "command"), false);
    assert.equal(Object.hasOwn(fixture, "endpointUrl"), false);
    assert.equal(Object.hasOwn(fixture, "apiKey"), false);
    assert.equal(Object.hasOwn(fixture, "runtimeAdapter"), false);
  }

  const packetsWithCodex = pipelineFixturePackets.filter((packet) => packet.codexWorker !== null);
  const packetsWithClaude = pipelineFixturePackets.filter((packet) => packet.claudeReview !== null);
  assert.ok(packetsWithCodex.length > 0, "fixture packets should expose Codex worker state");
  assert.ok(packetsWithClaude.length > 0, "fixture packets should expose Claude review state");
  assert.deepEqual(
    ["ready", "active", "blocked"].filter((state) => !packetsWithCodex.some((packet) => packet.codexWorker?.readiness === state)),
    [],
    "packet-bound Codex fixtures should cover ready, active, and blocked readiness"
  );
  assert.deepEqual(
    ["pending", "skipped", "blocked"].filter((state) => !packetsWithClaude.some((packet) => packet.claudeReview?.statusLabel === state)),
    [],
    "packet-bound Claude fixtures should cover pending, skipped, and blocked review states"
  );

  const packetWithoutWorkerCards = pipelineFixturePackets.find((packet) => packet.codexWorker === null && packet.claudeReview === null);
  assert.ok(packetWithoutWorkerCards, "at least one packet should prove nullable Codex/Claude metadata remains absent");
  assert.equal(packetWithoutWorkerCards.laneCards.some((lane) => lane.laneType === "codex_worker" || lane.laneType === "claude_reviewer"), false);

  for (const packet of packetsWithCodex) {
    assert.equal(packet.codexWorker.role, "implementation_worker");
    assert.notEqual(packet.codexWorker.role, "independent_reviewer");
    assert.equal(packet.reviewSummaries.some((review) => review.reviewer === "codex_worker"), false, `${packet.packetId} should not present Codex as a reviewer`);
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "codex_worker" && lane.evidenceRefs.includes(packet.codexWorker.evidenceRef)),
      `${packet.packetId} should expose a codex_worker lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.codexWorker.evidenceRef && ref.retentionClass === "metadata_only" && ref.rawPayloadRetained === false),
      `${packet.packetId} Codex evidence should be metadata-only`
    );
    if (packet.codexWorker.readiness === "active") {
      assert.ok(packet.laneCards.some((lane) => lane.laneType === "codex_worker" && lane.status === "running"), `${packet.packetId} active Codex lane should be running`);
    }
  }

  for (const packet of packetsWithClaude) {
    assert.ok(["skipped", "blocked", "pending"].includes(packet.claudeReview.statusLabel));
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "claude_reviewer" && lane.evidenceRefs.includes(packet.claudeReview.evidenceRef)),
      `${packet.packetId} should expose a claude_reviewer lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.claudeReview.evidenceRef && ref.retentionClass === "metadata_only" && ref.rawPayloadRetained === false),
      `${packet.packetId} Claude evidence should be metadata-only`
    );
    assert.equal(packet.claudeReview.executionMode, "readiness_or_packet_only");
    assert.doesNotMatch(packet.nextAction, /implement with claude|claude implementation/i);
    assert.ok(packet.reviewSummaries.some((review) => review.reviewer === "claude_reviewer" && review.evidenceRefs.includes(packet.claudeReview.evidenceRef)));
    if (packet.claudeReview.statusLabel === "pending") {
      assert.ok(
        packet.matrixRowIds.includes("mock.claude_pending_skipped") ||
          packet.matrixRowIds.includes("governed_worker.claude_dry_run_running") ||
          packet.matrixRowIds.includes("governed_worker.claude_real_execution_running"),
        `${packet.packetId} should link a Claude pending/skipped, governed dry-run, or governed real-execution row`
      );
      assert.equal(packet.currentOwner, "claude_reviewer");
    }
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.codexWorker !== null || candidate.claudeReview !== null)) {
    if (packet.codexWorker) {
      assert.match(packet.codexWorker.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} Codex evidence should be packet-local`);
      assert.ok(packet.codexWorker.attemptRefs.every((ref) => ref.includes(packet.packetId)), `${packet.packetId} Codex attempt refs should be packet-local`);
    }
    if (packet.claudeReview) {
      assert.match(packet.claudeReview.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} Claude evidence should be packet-local`);
      assert.ok(packet.claudeReview.allowedContextRefs.every((ref) => ref.includes(packet.packetId)), `${packet.packetId} Claude allowed context should be packet-local`);
    }
  }
});

test("pipeline memory proposal fixtures stay review-gated and proposal-only", async () => {
  const { pipelineCockpitPackets, pipelineFixturePackets } = await loadCompiledDashboardFixtures();
  const pipelineComponentSource = await readPipelineComponentSource();
  const packetDetailSource = await readFile(packetDetailPath, "utf8");
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  const allPipelineSource = `${routeSource}\n${fixtureSource}\n${pipelineComponentSource}\n${packetDetailSource}`;

  assert.match(packetDetailSource, /Memory proposals/);
  assert.match(packetDetailSource, /packet\.memoryProposals\.map\(formatMemoryProposal\)/);
  assert.match(packetDetailSource, /function formatMemoryProposal/);

  for (const visibleLabel of [
    "Packet id",
    "Patch summary",
    "Sensitivity",
    "Freshness",
    "Contradiction",
    "Confidence",
    "Obsidian is canonical and human-owned",
    "LLM-Wiki is derived, disposable, and rebuildable",
  ]) {
    assert.match(pipelineComponentSource + fixtureSource, new RegExp(visibleLabel, "i"));
  }

  const memoryPackets = pipelineFixturePackets.filter((packet) => packet.memoryProposals.length > 0);
  assert.ok(memoryPackets.length > 0, "fixture packets should expose memory proposals");
  assert.ok(
    memoryPackets.some((packet) => packet.fixtureId === "obsidian_proposal_pending_approval"),
    "memory proposals should reuse obsidian_proposal_pending_approval"
  );

  const allProposals = memoryPackets.flatMap((packet) => packet.memoryProposals.map((proposal) => ({ packet, proposal })));
  assert.deepEqual(
    ["not_applicable", "proposed", "pending_human_approval", "approved", "rejected", "deferred", "edit_needed", "stale", "contradictory", "blocked"].filter(
      (status) => !allProposals.some(({ proposal }) => proposal.status === status)
    ),
    [],
    "memory proposals should cover every review state"
  );

  for (const { packet, proposal } of allProposals) {
    const packetSourceRefIds = new Set(packet.sourceRefs.map((ref) => ref.refId));
    const packetEvidenceRefIds = new Set(packet.evidenceRefs.map((ref) => ref.refId));
    assert.equal(proposal.packetId, packet.packetId);
    assert.ok(proposal.proposalId.includes(packet.packetId), `${packet.packetId} proposal id should be packet-local`);
    assert.ok(proposal.sourceRefs.length > 0, `${packet.packetId} proposal should cite source refs`);
    assert.ok(proposal.evidenceRefs.length > 0, `${packet.packetId} proposal should cite evidence refs`);
    assert.ok(proposal.sourceRefs.every((refId) => packetSourceRefIds.has(refId)), `${packet.packetId} proposal source refs should resolve to packet source refs`);
    assert.ok(proposal.evidenceRefs.every((refId) => packetEvidenceRefIds.has(refId)), `${packet.packetId} proposal evidence refs should resolve to packet evidence refs`);
    assert.ok(proposal.targetVaultPath || proposal.targetVaultFolder, `${packet.packetId} proposal should name a target path or folder`);
    if (packet.fixtureId === "obsidian_proposal_pending_approval") {
      assert.ok(proposal.sourceRefs.some((ref) => ref.includes("obsidian-human-owned")), `${packet.packetId} proposal should cite the Obsidian human-owned boundary`);
      assert.ok(proposal.sourceRefs.some((ref) => ref.includes("llm-wiki-derived-only")), `${packet.packetId} proposal should cite the LLM-Wiki derived-only boundary`);
    }
    assert.ok(proposal.suggestedContentSummary.length > 0, `${packet.packetId} proposal should summarize suggested content`);
    assert.ok(proposal.backupRecoveryPath.length > 0, `${packet.packetId} proposal should describe backup/recovery`);
    assert.equal(proposal.writeBackAllowed, false, `${packet.packetId} proposal should not allow direct write-back`);
    assert.match(proposal.writeBackStatus, /blocked|review_gated|approved_for_future|deferred/);
    if (proposal.status === "approved" && packet.packetId !== "fixture:llm-wiki-rebuild-preview") {
      assert.equal(proposal.writeBackStatus, "review_gated", `${packet.packetId} approved proposal should still require a later review-gated workflow`);
    }
    if (packet.packetId === "fixture:llm-wiki-rebuild-preview") {
      assert.equal(proposal.writeBackStatus, "approved_for_future", `${packet.packetId} ready preview proposal should be approved for future workflow metadata`);
    }
    if (proposal.contradictionStatus === "confirmed") {
      assert.match(proposal.status, /^(contradictory|blocked|edit_needed|deferred)$/, `${packet.packetId} confirmed contradiction should not render as approved`);
    }
    for (const target of [proposal.targetVaultPath, proposal.targetVaultFolder].filter(Boolean)) {
      assert.doesNotMatch(target, /^(\/|[A-Za-z]:\\|~\/|\\\\)|\.\.|\.obsidian|\.ssh|secret|credential/i, `${packet.packetId} proposal target should be relative and non-sensitive`);
    }
    assert.doesNotMatch(`${proposal.suggestedContentSummary} ${proposal.patchSummary ?? ""} ${proposal.backupRecoveryPath}`, /raw prompt|raw completion|reasoning trace|provider payload|secret|credential/i);

    if (["stale", "contradictory", "blocked", "deferred", "edit_needed"].includes(proposal.status)) {
      assert.ok(proposal.decisionNeededContext?.length > 0, `${proposal.status} proposal should expose decision-needed context`);
    }
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.memoryProposals.length > 0)) {
    assert.ok(packet.memoryProposals.every((proposal) => proposal.proposalId.includes(packet.packetId)), `${packet.packetId} memory proposal refs should be packet-local`);
    if (packet.packetId === "fixture:llm-wiki-rebuild-preview") {
      const preview = packet.alphaMemorySourceStatus?.llmWikiReadiness?.rebuildPreview;
      assert.ok(preview, `${packet.packetId} ready fixture should expose a rebuild preview`);
      assert.equal(preview.durableWriteAllowed, false);
      assert.ok(preview.inputRefs.some((ref) => ref.includes("obsidian-approved")), `${packet.packetId} preview should include approved Obsidian input ref`);
      const plan = packet.alphaMemorySourceStatus?.llmWikiReadiness?.rebuildDryRunPlan;
      assert.ok(plan, `${packet.packetId} ready fixture should expose a rebuild dry-run plan`);
      assert.equal(plan.operationMode, "dry_run");
      assert.equal(plan.writePerformed, false);
      assert.equal(plan.backupCreated, false);
      assert.ok(plan.plannedDerivedSections.includes("approved-memory-proposals"));
      assert.match(plan.disposableTargetNamespace, /^derived:\/\/llm-wiki\/dry-run\//);
      assert.ok(plan.stopLines.some((stopLine) => stopLine.includes("do not write LLM-Wiki index")));
    } else {
      assert.equal(packet.alphaMemorySourceStatus?.llmWikiReadiness?.rebuildPreview ?? null, null, `${packet.packetId} blocked fixture proposals should not expose a rebuild preview`);
      assert.equal(packet.alphaMemorySourceStatus?.llmWikiReadiness?.rebuildDryRunPlan ?? null, null, `${packet.packetId} blocked fixture proposals should not expose a rebuild dry-run plan`);
    }
  }

  assert.match(fixtureSource, /fixture:llm-wiki-rebuild-preview/);
  assert.match(fixtureSource, /rebuildPreview/);
  assert.match(fixtureSource, /rebuildDryRunPlan/);
  assert.match(fixtureSource, /llm-wiki-rebuild-preview/);
  assert.match(fixtureSource, /llm-wiki-rebuild-dry-run-plan/);
  assert.match(fixtureSource, /do not write LLM-Wiki index/);
  assert.doesNotMatch(fixtureSource, /writeBackAllowed:\s*true/);
  assert.doesNotMatch(
    allPipelineSource,
    /writeObsidian|mutateObsidian|updateCanonicalMemory|canonicalMemoryUpdate|obsidianWriteBack|vaultWrite|from\s+["']node:fs["']|from\s+["']fs["']|writeFile\s*\(|appendFile\s*\(|rename\s*\(|unlink\s*\(/i
  );
});

test("pipeline source boundary checklist preserves Obsidian and LLM-Wiki ownership", async () => {
  const { pipelineFixturePackets, pipelineSourceBoundaryChecklist } = await loadCompiledDashboardFixtures();
  const pipelineComponentSource = await readPipelineComponentSource();
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const allPipelineSource = `${fixtureSource}\n${pipelineComponentSource}`;

  assert.ok(Array.isArray(pipelineSourceBoundaryChecklist), "source boundary checklist should be exported");
  const requiredBoundaryIds = ["work_packet_v0", "obsidian", "llm_wiki", "hermes", "ollama", "codex", "claude"];
  const boundaryIds = pipelineSourceBoundaryChecklist.map((boundary) => boundary.boundaryId);
  assert.deepEqual(boundaryIds.toSorted(), requiredBoundaryIds.toSorted(), "source boundary checklist should contain only required boundaries");
  assert.equal(new Set(boundaryIds).size, requiredBoundaryIds.length, "source boundary checklist should not duplicate boundary ids");

  for (const boundary of pipelineSourceBoundaryChecklist) {
    assert.ok(boundary.canonicality.length > 0, `${boundary.boundaryId} should declare canonicality`);
    assert.ok(boundary.allowedReads.length > 0, `${boundary.boundaryId} should declare allowed reads`);
    assert.ok(boundary.allowedWrites.length > 0, `${boundary.boundaryId} should declare allowed writes`);
    assert.ok(boundary.retentionClass.length > 0, `${boundary.boundaryId} should declare retention class`);
    assert.ok(boundary.blockedOperations.length > 0, `${boundary.boundaryId} should declare blocked operations`);
    assert.ok(boundary.boundarySummary.length > 0, `${boundary.boundaryId} should declare boundary summary`);
  }

  const obsidian = pipelineSourceBoundaryChecklist.find((boundary) => boundary.boundaryId === "obsidian");
  const llmWiki = pipelineSourceBoundaryChecklist.find((boundary) => boundary.boundaryId === "llm_wiki");
  assert.equal(obsidian.canonicality, "canonical, human-owned");
  assert.match(obsidian.boundarySummary, /Obsidian is canonical and human-owned/i);
  assert.match(obsidian.blockedOperations.join(" "), /direct write-back|canonical mutation/i);
  assert.equal(llmWiki.canonicality, "derived, disposable, rebuildable");
  assert.match(llmWiki.boundarySummary, /LLM-Wiki is derived, disposable, and rebuildable/i);
  assert.doesNotMatch(`${llmWiki.canonicality} ${llmWiki.boundarySummary}`, /\bcanonical\b/i);

  assertRequiredBlockedOps(pipelineSourceBoundaryChecklist, {
    work_packet_v0: ["raw payload retention", "inventing authority", "source mutation"],
    obsidian: ["direct write-back", "canonical mutation", "note overwrite", "agent-owned memory promotion"],
    llm_wiki: ["promote derived wiki to source of truth", "override Obsidian", "durable vault write-back"],
    hermes: ["real worker launch", "Docker execution", "source mutation", "network egress"],
    ollama: ["provider execution from dashboard", "endpoint discovery", "model gateway replacement"],
    codex: ["self-review authority", "dashboard process launch", "source mutation from fixture mode"],
    claude: ["implementation-lane use", "routine automation", "provider call from dashboard"],
  });

  const memoryPacket = pipelineFixturePackets.find((packet) => packet.packetId === "fixture:learn-memory");
  assert.ok(memoryPacket, "learn-memory packet should exist");
  assert.ok(memoryPacket.sourceRefs.some((ref) => ref.sourceType === "obsidian" && /human-owned/i.test(ref.label)), "learn-memory should include human-owned Obsidian ref");
  assert.ok(memoryPacket.sourceRefs.some((ref) => ref.sourceType === "llm_wiki" && /derived-only/i.test(ref.label)), "learn-memory should include derived-only LLM-Wiki ref");
  assert.equal(memoryPacket.alphaMemorySourceStatus?.llmWikiReadiness?.canonicality, "derived_disposable_rebuildable");
  assert.equal(memoryPacket.alphaMemorySourceStatus?.llmWikiReadiness?.durableWriteAllowed, false);
  assert.match(memoryPacket.alphaMemorySourceStatus?.llmWikiReadiness?.boundarySummary ?? "", /never overrides Obsidian/i);
  assert.ok(
    memoryPacket.memoryProposals.some((proposal) => proposal.status === "contradictory" && /Obsidian remains the default authority/i.test(proposal.decisionNeededContext ?? "")),
    "contradictory proposals should state Obsidian wins by default"
  );

  for (const visibleLabel of [
    "Source Boundary Checklist",
    "Boundary id",
    "Canonicality",
    "Allowed reads",
    "Allowed writes",
    "Retention class",
    "Blocked operations",
    "Boundary summary",
    "Obsidian is canonical and human-owned",
    "LLM-Wiki is derived, disposable, and rebuildable",
    "LLM-Wiki derived readiness",
    "Obsidian wins by default",
  ]) {
    assert.match(allPipelineSource, new RegExp(visibleLabel, "i"));
  }

  assert.doesNotMatch(allPipelineSource, /llm[-_ ]?wiki[^.\n]{0,80}canonical memory|canonicality:\s*"canonical[^"]*llm/i);
  assert.doesNotMatch(allPipelineSource, /writeObsidian|mutateObsidian|updateCanonicalMemory|canonicalMemoryUpdate|obsidianWriteBack|vaultWrite/i);
});

test("pipeline action guards reject stale unsafe unknown and boundary cases through fixture decision helper", async () => {
  const {
    evaluateFixtureActionDecision,
    pipelineDensityFixturePackets,
    pipelineFixturePackets,
  } = await loadCompiledDashboardFixtures();

  const allGuards = pipelineFixturePackets.flatMap((packet) => packet.actionGuardFixtures.map((guard) => ({ packet, guard })));
  for (const classification of [
    "stale_packet_state",
    "stale_action_id",
    "missing_evidence",
    "unknown_action",
    "unsafe_authority_class",
    "blocked_source_boundary",
  ]) {
    const match = allGuards.find(({ guard }) => guard.classification === classification);
    assert.ok(match, `missing executable guard fixture for ${classification}`);
    assert.equal(match.guard.primaryRisk, "false_authority", `${classification} should report false authority as primary risk`);
    assert.ok(match.guard.disabledReason.length > 0, `${classification} should explain disabled reason`);
    assert.ok(match.guard.stopLine.length > 0, `${classification} should include stop line`);
    assert.ok(match.guard.safeNextOption.length > 0, `${classification} should include safe next option`);
    assert.ok(match.guard.resultingStage.length > 0, `${classification} should keep known stage`);
    assert.ok(match.guard.resultingOwner.length > 0, `${classification} should keep known owner`);

    const decision = evaluateFixtureActionDecision(match.packet, match.guard.actionId, match.guard.actionSurface);
    assert.equal(decision.submitCapable, false, `${classification} should not be submit-capable`);
    assert.equal(decision.primaryRisk, "false_authority", `${classification} decision should report false authority`);
  }

  const staleId = allGuards.find(({ guard }) => guard.classification === "stale_action_id" && guard.expectedPacketId !== guard.actualPacketId && guard.expectedActionId !== guard.actualActionId);
  assert.ok(staleId, "stale packet and action id mismatch should be represented");

  const unknownGuard = allGuards.find(({ guard }) => guard.classification === "unknown_action");
  assert.ok(unknownGuard, "unknown action guard should exist");
  const unknownDecision = evaluateFixtureActionDecision(unknownGuard.packet, `${unknownGuard.packet.packetId}:action:not_in_packet`, "human_gate");
  assert.equal(unknownDecision.submitCapable, false);
  assert.equal(unknownDecision.guard?.classification, "unknown_action");
  assert.equal(unknownDecision.primaryRisk, "false_authority");

  const densityGuard = pipelineDensityFixturePackets
    .flatMap((packet) => packet.actionGuardFixtures.map((guard) => ({ packet, guard })))
    .find(({ guard }) => guard.safeNextOption.includes("Human Gate reference"));
  if (densityGuard) {
    assert.match(densityGuard.guard.safeNextOption, new RegExp(escapeRegExp(densityGuard.packet.packetId)));
  }
});

test("governed copied-worktree evidence projects into pipeline packets without live dashboard authority", async () => {
  const {
    projectGovernedCopiedWorktreeExecutionEvidence,
    projectGovernedCopiedWorktreeExecutionEvidenceSnapshot,
  } = await loadCompiledDashboardFixtures();
  const baseEvidence = {
    mode: "copied_worktree_execution",
    authority_level: "copied_worktree_worker_execution",
    evidence_ref: "metadata:worker-copied-worktree-execution/claude",
    status_event_ref: "metadata:worker-copied-worktree-execution/claude:status-event",
    observed_at: "2026-06-27T00:00:00Z",
    expected_response: "KENDALL_COPY_EXECUTION_OK",
    observed_response: "KENDALL_COPY_EXECUTION_OK",
    exit_code: 0,
    timed_out: false,
    command_path: "/usr/local/bin/claude",
    copied_tracked_files: 7,
    copy_bytes: 2048,
    copy_retained: false,
    network_allowed: true,
    session_inheritance_allowed: true,
    source_mutation_allowed: false,
    tools_allowed: false,
    raw_output_retained: false,
    affects_trust: false,
    affects_routing: false,
  };

  const [claudePacket] = projectGovernedCopiedWorktreeExecutionEvidence([
    {
      ...baseEvidence,
      source_id: "claude-run-1",
      worker: "claude",
      execution_state: "execution_observed",
    },
  ]);

  assert.equal(claudePacket.currentStage, "review");
  assert.equal(claudePacket.currentOwner, "kendall");
  assert.equal(claudePacket.status, "complete");
  assert.equal(claudePacket.fixtureKind, "future-real-source");
  assert.equal(claudePacket.executionAttempts[0].status, "completed");
  assert.equal(claudePacket.executionAttempts[0].lane, "claude_governed_execution");
  assert.equal(claudePacket.executionAttempts[0].authorityMode, "copied_worktree_worker_execution");
  assert.ok(claudePacket.executionAttempts[0].evidenceRefs.includes(baseEvidence.evidence_ref));
  assert.ok(claudePacket.evidenceRefs.some((ref) => ref.refId === baseEvidence.evidence_ref && ref.rawPayloadRetained === false));
  assert.match(claudePacket.summary, /metadata only/);
  assert.match(claudePacket.lastEvent, /not live process liveness/);

  const [hermesPacket] = projectGovernedCopiedWorktreeExecutionEvidence([
    {
      ...baseEvidence,
      source_id: "hermes-run-1",
      worker: "hermes",
      execution_state: "unsupported",
      evidence_ref: "metadata:worker-copied-worktree-execution/hermes",
      status_event_ref: "metadata:worker-copied-worktree-execution/hermes:status-event",
      observed_response: null,
      exit_code: null,
      command_path: null,
      copied_tracked_files: 0,
      copy_bytes: 0,
    },
  ]);

  assert.equal(hermesPacket.currentStage, "execute");
  assert.equal(hermesPacket.currentOwner, "hermes_worker_mock");
  assert.equal(hermesPacket.status, "blocked");
  assert.equal(hermesPacket.executionAttempts[0].status, "rejected");
  assert.equal(hermesPacket.executionAttempts[0].lane, "hermes_governed_execution");
  assert.equal(hermesPacket.hermesJob.statusLabel, "blocked_containment");
  assert.match(hermesPacket.lastEvent, /do not infer a hidden worker is running/);

  const unsafePackets = projectGovernedCopiedWorktreeExecutionEvidence([
    {
      ...baseEvidence,
      source_id: "unsafe-run",
      worker: "claude",
      execution_state: "execution_observed",
      raw_output_retained: true,
    },
    {
      ...baseEvidence,
      source_id: "missing-evidence-ref",
      worker: "claude",
      execution_state: "execution_observed",
      evidence_ref: null,
    },
    {
      ...baseEvidence,
      source_id: "bad-status-event-ref",
      worker: "claude",
      execution_state: "execution_observed",
      status_event_ref: 42,
    },
    {
      ...baseEvidence,
      source_id: "bad-execution-state",
      worker: "claude",
      execution_state: "running_live_worker",
    },
    {
      ...baseEvidence,
      source_id: "success-without-command",
      worker: "claude",
      execution_state: "execution_observed",
      command_path: null,
    },
    {
      ...baseEvidence,
      source_id: "success-without-copy",
      worker: "claude",
      execution_state: "execution_observed",
      copied_tracked_files: 0,
    },
    {
      ...baseEvidence,
      source_id: "unsupported-with-success-response",
      worker: "hermes",
      execution_state: "unsupported",
      evidence_ref: "metadata:worker-copied-worktree-execution/hermes",
      status_event_ref: "metadata:worker-copied-worktree-execution/hermes:status-event",
    },
    {
      ...baseEvidence,
      source_id: "raw_prompt sk-proj-123456789",
      worker: "claude",
      execution_state: "execution_observed",
    },
  ]);
  assert.deepEqual(unsafePackets, []);

  const snapshotPackets = projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: [
      {
        ...baseEvidence,
        source_id: "claude-run-1",
        worker: "claude",
        execution_state: "execution_observed",
      },
    ],
    errors: [],
  });
  assert.equal(snapshotPackets.length, 1);
  assert.equal(snapshotPackets[0].executionAttempts[0].authorityMode, "copied_worktree_worker_execution");

  const [patchProposalPacket] = projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: [
      {
        ...baseEvidence,
        source_id: "claude-patch-proposal-1",
        worker: "claude",
        task_id: "starter_patch_proposal",
        execution_state: "execution_observed",
        expected_response: "KENDALL_PATCH_PROPOSAL_OK",
        observed_response: "KENDALL_PATCH_PROPOSAL_OK",
        output_contract_diagnostic: "structured_match",
        proposal_target_file: "README.md",
        proposal_change_kind: "append_line",
        proposal_summary: "Add a harmless Kendall starter note",
      },
    ],
    errors: [],
  });

  assert.ok(patchProposalPacket, "patch-proposal evidence should project into the cockpit");
  assert.equal(patchProposalPacket.status, "complete");
  assert.equal(patchProposalPacket.executionAttempts[0].status, "completed");
  assert.match(patchProposalPacket.summary, /KENDALL_PATCH_PROPOSAL_OK/);

  const failurePackets = projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: [
      {
        ...baseEvidence,
        source_id: "claude-missing",
        worker: "claude",
        execution_state: "missing",
        observed_response: null,
        exit_code: null,
        command_path: null,
        copied_tracked_files: 0,
        copy_bytes: 0,
      },
      {
        ...baseEvidence,
        source_id: "claude-timeout",
        worker: "claude",
        execution_state: "timed_out",
        observed_response: null,
        timed_out: true,
      },
      {
        ...baseEvidence,
        source_id: "claude-invalid-output",
        worker: "claude",
        execution_state: "invalid_output",
        observed_response: null,
        output_contract_diagnostic: "unexpected_result",
      },
      {
        ...baseEvidence,
        source_id: "hermes-unsupported",
        worker: "hermes",
        execution_state: "unsupported",
        evidence_ref: "metadata:worker-copied-worktree-execution/hermes",
        status_event_ref: "metadata:worker-copied-worktree-execution/hermes:status-event",
        observed_response: null,
        exit_code: null,
        command_path: null,
        copied_tracked_files: 0,
        copy_bytes: 0,
      },
    ],
    errors: [],
  });

  assert.equal(failurePackets.length, 4);
  assert.deepEqual(
    Object.fromEntries(failurePackets.map((packet) => [packet.packetId, packet.status])),
    {
      "evidence:governed-claude-copied-worktree:claude-missing": "failed",
      "evidence:governed-claude-copied-worktree:claude-timeout": "failed",
      "evidence:governed-claude-copied-worktree:claude-invalid-output": "failed",
      "evidence:governed-hermes-copied-worktree:hermes-unsupported": "blocked",
    },
  );
  assert.equal(failurePackets.every((packet) => packet.executionAttempts[0].authorityMode === "copied_worktree_worker_execution"), true);
  assert.equal(failurePackets.every((packet) => packet.evidenceRefs.every((ref) => ref.rawPayloadRetained === false)), true);

  assert.deepEqual(projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    source_worktree: "/home/operator/repo",
    attempts: [],
    errors: [],
  }), []);
  assert.deepEqual(projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: [],
    errors: [{ reason: "provider_payload sk-proj-123" }],
  }), []);
  assert.deepEqual(projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: [
      {
        ...baseEvidence,
        source_id: "claude-run-1",
        worker: "claude",
        execution_state: "execution_observed",
        source_worktree: "/home/operator/repo",
      },
    ],
    errors: [],
  }), []);
  assert.deepEqual(projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    operator_note: "looks harmless",
    attempts: [],
    errors: [],
  }), []);
  assert.deepEqual(projectGovernedCopiedWorktreeExecutionEvidenceSnapshot({
    schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
    generated_at: "2026-06-27T00:00:00Z",
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: [
      {
        ...baseEvidence,
        source_id: "claude-run-1",
        worker: "claude",
        execution_state: "execution_observed",
        operator_note: "looks harmless",
      },
    ],
    errors: [],
  }), []);
});

test("pipeline evidence source loads persisted worker snapshots without live calls", async () => {
  const pipelineEvidenceSource = await readFile(pipelineEvidenceSourcePath, "utf8");
  assert.match(pipelineEvidenceSource, /pipelinePacketsWithPersistedGovernedWorkerEvidence/);
  const {
    loadPersistedGovernedWorkerEvidencePackets,
    pipelinePacketsWithPersistedGovernedWorkerEvidence,
  } = await loadCompiledDashboardEvidenceSource();
  const tempDir = await mkdtemp(join(tmpdir(), "pipeline-worker-evidence-"));
  try {
    const evidenceDir = join(tempDir, ".kendall-local", "governed-worker-evidence");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, "snapshot.json"), JSON.stringify({
      schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
      generated_at: "2026-06-27T00:00:00Z",
      metadata_only: true,
      raw_payload_retained: false,
      dashboard_consumption: "no_live_calls",
      attempts: [
        {
          source_id: "copy-exec:claude:execution_observed:20260627:0",
          worker: "claude",
          mode: "copied_worktree_execution",
          authority_level: "copied_worktree_worker_execution",
          execution_state: "execution_observed",
          evidence_ref: "metadata:worker-copied-worktree-execution/claude",
          status_event_ref: "metadata:worker-copied-worktree-execution/claude:status-event",
          observed_at: "2026-06-27T00:00:00Z",
          expected_response: "KENDALL_COPY_EXECUTION_OK",
          observed_response: "KENDALL_COPY_EXECUTION_OK",
          exit_code: 0,
          timed_out: false,
          command_path: "/usr/local/bin/claude",
          copied_tracked_files: 7,
          copy_bytes: 2048,
          copy_retained: false,
          network_allowed: true,
          session_inheritance_allowed: true,
          source_mutation_allowed: false,
          tools_allowed: false,
          raw_output_retained: false,
          affects_trust: false,
          affects_routing: false,
        },
      ],
      errors: [],
    }), "utf8");
    await writeFile(join(evidenceDir, "unsafe.json"), JSON.stringify({
      schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
      generated_at: "2026-06-27T00:00:00Z",
      metadata_only: true,
      raw_payload_retained: false,
      dashboard_consumption: "no_live_calls",
      attempts: [],
      errors: [{ reason: "raw_prompt sk-proj-123" }],
    }), "utf8");
    const linkedTarget = join(tempDir, "linked-target.json");
    await writeFile(linkedTarget, JSON.stringify({ metadata_only: true }), "utf8");
    await symlink(linkedTarget, join(evidenceDir, "linked.json"));
    await symlink(join(tempDir, "missing-target.json"), join(evidenceDir, "broken.json"));

    const loaded = loadPersistedGovernedWorkerEvidencePackets({ cwd: tempDir, env: {} });
    assert.equal(loaded.packets.length, 1);
    assert.equal(loaded.packets[0].title, "Governed Claude copied-worktree execution completed");
    assert.equal(loaded.evidenceFiles.length, 1);
    assert.ok(loaded.warnings.includes("evidence_file_symlink_rejected"));

    const repoRoot = join(tempDir, "repo-root");
    const dashboardCwd = join(repoRoot, "apps", "dashboard");
    const repoEvidenceDir = join(repoRoot, ".kendall-local", "governed-worker-evidence");
    await mkdir(dashboardCwd, { recursive: true });
    await mkdir(repoEvidenceDir, { recursive: true });
    await writeFile(join(repoEvidenceDir, "snapshot.json"), JSON.stringify({
      schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0",
      generated_at: "2026-06-27T00:00:00Z",
      metadata_only: true,
      raw_payload_retained: false,
      dashboard_consumption: "no_live_calls",
      attempts: [
        {
          source_id: "copy-exec:claude:execution_observed:repo-root:0",
          worker: "claude",
          mode: "copied_worktree_execution",
          authority_level: "copied_worktree_worker_execution",
          execution_state: "execution_observed",
          evidence_ref: "metadata:worker-copied-worktree-execution/claude",
          status_event_ref: "metadata:worker-copied-worktree-execution/claude:status-event",
          observed_at: "2026-06-27T00:00:00Z",
          expected_response: "KENDALL_COPY_EXECUTION_OK",
          observed_response: "KENDALL_COPY_EXECUTION_OK",
          exit_code: 0,
          timed_out: false,
          command_path: "/usr/local/bin/claude",
          copied_tracked_files: 7,
          copy_bytes: 2048,
          copy_retained: false,
          network_allowed: true,
          session_inheritance_allowed: true,
          source_mutation_allowed: false,
          tools_allowed: false,
          raw_output_retained: false,
          affects_trust: false,
          affects_routing: false,
        },
      ],
      errors: [],
    }), "utf8");
    const loadedFromRepoRoot = loadPersistedGovernedWorkerEvidencePackets({
      cwd: dashboardCwd,
      env: { KENDALL_PIPELINE_WORKER_EVIDENCE_DIR: repoEvidenceDir },
    });
    assert.equal(loadedFromRepoRoot.packets.length, 1);
    assert.equal(loadedFromRepoRoot.packets[0].title, "Governed Claude copied-worktree execution completed");
    assert.deepEqual(loadedFromRepoRoot.warnings, []);
    assert.equal(loadedFromRepoRoot.evidenceFiles.length, 1);

    const packets = pipelinePacketsWithPersistedGovernedWorkerEvidence({ cwd: tempDir, env: {} });
    assert.equal(packets[0].packetId, loaded.packets[0].packetId);
    assert.ok(packets.length > loaded.packets.length);

    const rejected = loadPersistedGovernedWorkerEvidencePackets({ cwd: tempDir, env: { KENDALL_PIPELINE_WORKER_EVIDENCE_DIR: "/etc" } });
    assert.deepEqual(rejected.packets, []);
    assert.ok(rejected.warnings.includes("evidence_dir_outside_safe_roots"));

    const symlinkedWorkspace = join(tempDir, "symlinked-workspace");
    const symlinkedTarget = join(tempDir, "other-source-dir");
    await mkdir(join(symlinkedWorkspace, ".kendall-local"), { recursive: true });
    await mkdir(symlinkedTarget, { recursive: true });
    await symlink(symlinkedTarget, join(symlinkedWorkspace, ".kendall-local", "governed-worker-evidence"));
    const symlinked = loadPersistedGovernedWorkerEvidencePackets({ cwd: symlinkedWorkspace, env: {} });
    assert.deepEqual(symlinked.packets, []);
    assert.ok(
      symlinked.warnings.includes("evidence_dir_symlink_rejected")
        || symlinked.warnings.includes("evidence_dir_realpath_outside_workspace")
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("pipeline evidence source stays local and non-executing", async () => {
  const source = await readFile(pipelineEvidenceSourcePath, "utf8");
  assert.match(source, /readFileSync/);
  assert.match(source, /projectGovernedCopiedWorktreeExecutionEvidenceSnapshot/);
  for (const forbiddenPattern of [
    /fetch\s*\(/,
    /EventSource/,
    /WebSocket/,
    /XMLHttpRequest/,
    /sendBeacon/,
    /spawnSync|execSync|fork\s*\(/,
    /node:child_process/,
    /node:http|node:https|node:net|node:tls|node:dns/,
    /worker:copy:execute|collectCopiedWorktreeExecutionAttempts/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});

async function loadCompiledDashboardFixtures() {
  const outDir = await mkdtemp(join(tmpdir(), "dashboard-fixtures-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');
  const result = spawnSync(
    "apps/dashboard/node_modules/.bin/tsc",
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--types",
      "node",
      "--typeRoots",
      "apps/dashboard/node_modules/@types",
      "--verbatimModuleSyntax",
      "--rootDir",
      ".",
      "--outDir",
      outDir,
      "apps/dashboard/src/lib/pipeline-fixtures.ts",
      "packages/workflow-core/src/pipeline-state-fixture-matrix.ts",
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const compiledFixturePath = join(outDir, "apps/dashboard/src/lib/pipeline-fixtures.js");
  const compiledFixtureSource = await readFile(compiledFixturePath, "utf8");
  await writeFile(
    compiledFixturePath,
    compiledFixtureSource.replace(
      'from "@kendall/workflow-core"',
      'from "../../../../packages/workflow-core/src/pipeline-state-fixture-matrix.js"'
    )
  );

  return import(pathToFileURL(compiledFixturePath).href);
}

async function loadCompiledDashboardEvidenceSource() {
  const outDir = await mkdtemp(join(tmpdir(), "dashboard-evidence-source-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');
  const result = spawnSync(
    "apps/dashboard/node_modules/.bin/tsc",
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--types",
      "node",
      "--typeRoots",
      "apps/dashboard/node_modules/@types",
      "--verbatimModuleSyntax",
      "--rootDir",
      ".",
      "--outDir",
      outDir,
      "apps/dashboard/src/lib/pipeline-evidence-source.ts",
      "apps/dashboard/src/lib/pipeline-fixtures.ts",
      "packages/workflow-core/src/pipeline-state-fixture-matrix.ts",
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const compiledFixturePath = join(outDir, "apps/dashboard/src/lib/pipeline-fixtures.js");
  const compiledEvidencePath = join(outDir, "apps/dashboard/src/lib/pipeline-evidence-source.js");
  const compiledFixtureSource = await readFile(compiledFixturePath, "utf8");
  const compiledEvidenceSource = await readFile(compiledEvidencePath, "utf8");
  await writeFile(
    compiledFixturePath,
    compiledFixtureSource.replace(
      'from "@kendall/workflow-core"',
      'from "../../../../packages/workflow-core/src/pipeline-state-fixture-matrix.js"'
    )
  );
  await writeFile(
    compiledEvidencePath,
    compiledEvidenceSource.replace('from "./pipeline-fixtures"', 'from "./pipeline-fixtures.js"')
  );

  return import(pathToFileURL(compiledEvidencePath).href);
}

async function readPipelineComponentSource() {
  const componentFiles = (await readdir(pipelineComponentsPath)).filter((file) => file.endsWith(".tsx"));
  return (
    await Promise.all(componentFiles.map((file) => readFile(new URL(file, pipelineComponentsPath), "utf8")))
  ).join("\n");
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} source should exist`);
  let openBrace = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] !== "{") {
      continue;
    }
    let previousIndex = index - 1;
    while (previousIndex >= start && /\s/.test(source[previousIndex])) {
      previousIndex -= 1;
    }
    if (source[previousIndex] === ")") {
      openBrace = index;
      break;
    }
  }
  assert.notEqual(openBrace, -1, `${functionName} should have a function body`);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  assert.fail(`${functionName} function body should close`);
}

function assertRequiredBlockedOps(boundaries, requiredByBoundaryId) {
  for (const [boundaryId, requiredOperations] of Object.entries(requiredByBoundaryId)) {
    const boundary = boundaries.find((candidate) => candidate.boundaryId === boundaryId);
    assert.ok(boundary, `${boundaryId} boundary should exist`);
    for (const operation of requiredOperations) {
      assert.ok(boundary.blockedOperations.includes(operation), `${boundaryId} should block ${operation}`);
    }
  }
}
