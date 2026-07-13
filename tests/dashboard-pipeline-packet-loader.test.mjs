import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const loaderPath = new URL("../apps/dashboard/src/lib/pipeline-packet-loader.ts", import.meta.url);
const detailRoutePath = new URL("../apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx", import.meta.url);
const detailComponentPath = new URL("../apps/dashboard/src/components/pipeline/packet-detail-page.tsx", import.meta.url);
const normalRoutePath = new URL("../apps/dashboard/src/app/pipeline/page.tsx", import.meta.url);
const demoRoutePath = new URL("../apps/dashboard/src/app/pipeline/demo/page.tsx", import.meta.url);
const demoDetailRoutePath = new URL("../apps/dashboard/src/app/pipeline/demo/packets/[packetId]/page.tsx", import.meta.url);

test("authoritative-only WorkPacketV0 is listed and loaded by the same detail identity", async () => {
  const fixtures = populatedFixtureCatalog();
  const authoritativePacket = authoritativeWorkPacket();
  const calls = [];
  const loader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => {
      calls.push("projection");
      return runtimeProjection([authoritativePacket.packetId]);
    },
    getWorkPackets: async () => {
      calls.push("list");
      return [authoritativePacket];
    },
    getWorkPacket: async (packetId) => {
      calls.push(`detail:${packetId}`);
      return authoritativePacket;
    },
  });

  const listed = await loader.loadPipelineCockpitPackets();
  const detailed = await loader.loadPipelineCockpitPacket(authoritativePacket.packetId);

  assert.equal(listed.fixtureMode.kind, "runtime");
  assert.equal(listed.fixtureMode.label, "Supervisor runtime");
  assert.equal(listed.fixtureMode.canSatisfyLiveProof, false);
  assert.equal(listed.packets[0].packetId, authoritativePacket.packetId);
  assert.equal(detailed.fixtureMode.kind, "runtime");
  assert.equal(detailed.fixtureMode.label, "Supervisor runtime");
  assert.equal(detailed.packet.packetId, listed.packets[0].packetId);
  assert.equal(detailed.packet.sourceKind, "supervisor-runtime");
  assert.equal(detailed.packet.sourceId, authoritativePacket.packetId);
  assert.equal(detailed.packet.fixtureId, undefined);
  assert.equal(detailed.packet.fixtureKind, undefined);
  assert.deepEqual(calls, ["projection", "list", "projection", `detail:${authoritativePacket.packetId}`]);
});

test("empty, malformed, missing, and unavailable states fail closed without fixture substitution", async () => {
  const fixtures = populatedFixtureCatalog();
  let detailError = new Error("Request failed for /work-packets/missing-authoritative (404)");
  const emptyProjection = runtimeProjection([], {
    truthSummary: {
      backendEmpty: true,
      emptyReason: "healthy_empty",
      summary: "Supervisor returned zero persisted WorkPacketV0 rows.",
    },
  });
  const loader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => emptyProjection,
    getWorkPackets: async () => [],
    getWorkPacket: async () => { throw detailError; },
  });

  const empty = await loader.loadPipelineCockpitPackets();
  assert.equal(empty.fixtureMode.kind, "empty");
  assert.equal(empty.packets.length, 0);
  assert.equal(empty.projection, emptyProjection);

  const malformedLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPackets: async () => [authoritativeWorkPacket(), { packetId: "malformed-runtime-row" }],
  });
  const malformed = await malformedLoader.loadPipelineCockpitPackets();
  assert.equal(malformed.fixtureMode.kind, "invalid");
  assert.equal(malformed.packets.length, 0);
  assert.match(malformed.fixtureMode.summary, /malformed WorkPacketV0 row/);

  const unreadableLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["requested-runtime-packet"]),
    getWorkPackets: async () => [],
    getWorkPacket: async () => ({ ...authoritativeWorkPacket(), packetId: "different-supervisor-packet" }),
  });
  const unreadable = await unreadableLoader.loadPipelineCockpitPacket("requested-runtime-packet");
  assert.equal(unreadable.fixtureMode.kind, "invalid");
  assert.equal(unreadable.packet, null);

  const missing = await loader.loadPipelineCockpitPacket("missing-authoritative");
  assert.equal(missing.fixtureMode.kind, "invalid");
  assert.equal(missing.packet, null);

  detailError = new Error("Supervisor connection refused");
  const unavailable = await loader.loadPipelineCockpitPacket("unavailable-authoritative");
  assert.equal(unavailable.fixtureMode.kind, "unavailable");
  assert.equal(unavailable.packet, null);
});

test("stale and fixture-shaped supervisor data fail closed without runtime or fixture packets", async () => {
  const fixtures = populatedFixtureCatalog();
  const staleLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      freshnessState: "stale",
      truthSummary: { stale: true, summary: "Stale supervisor projection." },
    }),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });

  const stale = await staleLoader.loadPipelineCockpitPackets();
  assert.equal(stale.fixtureMode.kind, "invalid");
  assert.equal(stale.packets.length, 0);
  assert.equal(stale.projection, null);
  assert.match(stale.fixtureMode.summary, /stale/i);

  const staleTimestampLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      sourceLabel: "live",
      freshnessState: "live",
      truthSummary: { label: "live", stale: false, summary: "Flags claim live but timestamp is stale." },
    }),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });
  const staleTimestamp = await staleTimestampLoader.loadPipelineCockpitPackets();
  assert.equal(staleTimestamp.fixtureMode.kind, "invalid");
  assert.equal(staleTimestamp.packets.length, 0);
  assert.match(staleTimestamp.fixtureMode.summary, /timestamps are stale/);

  const fixtureShapedLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPackets: async () => [{
      ...authoritativeWorkPacket(),
      fixtureId: "fixture:leaked-runtime",
      fixtureKind: "future-real-source",
      fixtureLabel: "Future real-source boundary",
    }],
  });

  const fixtureShaped = await fixtureShapedLoader.loadPipelineCockpitPackets();
  assert.equal(fixtureShaped.fixtureMode.kind, "invalid");
  assert.equal(fixtureShaped.packets.length, 0);
  assert.equal(fixtureShaped.projection, null);
  assert.match(fixtureShaped.fixtureMode.summary, /fixture-shaped|fixture-only/i);

  const fixturePrefixedLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["fixture:leaked-runtime"]),
    getWorkPackets: async () => [{ ...authoritativeWorkPacket(), packetId: "fixture:leaked-runtime" }],
  });
  const fixturePrefixed = await fixturePrefixedLoader.loadPipelineCockpitPackets();
  assert.equal(fixturePrefixed.fixtureMode.kind, "invalid");
  assert.equal(fixturePrefixed.packets.length, 0);
  assert.match(fixturePrefixed.fixtureMode.summary, /fixture-shaped|fixture-only/i);
});

test("typed fixture provenance is rejected without arbitrary-string false positives", async () => {
  const fixtures = populatedFixtureCatalog();
  const fixtureRefCases = [
    { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], refId: "fixture:source-ref" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], evidenceType: "fixture" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], retentionClass: "fixture" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], artifactPath: "fixture:evidence-artifact" }] },
    { artifactRefs: [{ refId: "artifact:normal", artifactType: "fixture", label: "Fixture artifact", status: "available" }] },
    { artifactRefs: [{ refId: "fixture:artifact-ref", artifactType: "report", label: "Fixture artifact", status: "available" }] },
  ];
  for (const [index, overrides] of fixtureRefCases.entries()) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
      getWorkPackets: async () => [{ ...authoritativeWorkPacket(), ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", `fixture ref case ${index} must fail closed`);
    assert.equal(result.packets.length, 0);
  }

  const labelOnlyLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPackets: async () => [{
      ...authoritativeWorkPacket(),
      evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], label: "Operator note mentions fixture:legacy text" }],
    }],
  });
  const labelOnly = await labelOnlyLoader.loadPipelineCockpitPackets();
  assert.equal(labelOnly.fixtureMode.kind, "runtime");
  assert.equal(labelOnly.packets.length, 1);
});

test("malformed nested evidence and artifact references fail closed before rendering", async () => {
  const fixtures = populatedFixtureCatalog();
  for (const overrides of [
    { evidenceRefs: ["event:created"] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], rawPayloadRetained: true }] },
    { artifactRefs: ["artifact:report"] },
    { artifactRefs: [{ refId: "artifact:report", artifactType: "report", label: "Report" }] },
  ]) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
      getWorkPackets: async () => [{ ...authoritativeWorkPacket(), ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid");
    assert.equal(result.packets.length, 0);
  }
});

test("detail lookup fails closed when supervisor projection is stale, unavailable, or omits the identity", async () => {
  const fixtures = populatedFixtureCatalog();
  let detailCalls = 0;
  const staleLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      sourceLabel: "stale",
      freshnessState: "stale",
      truthSummary: { label: "stale", stale: true, summary: "Stale projection." },
    }),
    getWorkPacket: async () => {
      detailCalls += 1;
      return authoritativeWorkPacket();
    },
  });
  const stale = await staleLoader.loadPipelineCockpitPacket("manager-source-authoritative-only");
  assert.equal(stale.fixtureMode.kind, "invalid");
  assert.equal(stale.packet, null);

  const unavailableLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      sourceLabel: "unavailable",
      freshnessState: "unavailable",
      backendReachability: { state: "unavailable" },
      truthSummary: { label: "unavailable", backendUnavailable: true, summary: "Unavailable projection." },
    }),
    getWorkPacket: async () => {
      detailCalls += 1;
      return authoritativeWorkPacket();
    },
  });
  const unavailable = await unavailableLoader.loadPipelineCockpitPacket("manager-source-authoritative-only");
  assert.equal(unavailable.fixtureMode.kind, "unavailable");
  assert.equal(unavailable.packet, null);

  const omittedIdentityLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([]),
    getWorkPacket: async () => {
      detailCalls += 1;
      return authoritativeWorkPacket();
    },
  });
  const omittedIdentity = await omittedIdentityLoader.loadPipelineCockpitPacket("manager-source-authoritative-only");
  assert.equal(omittedIdentity.fixtureMode.kind, "invalid");
  assert.equal(omittedIdentity.packet, null);
  assert.equal(detailCalls, 1, "only a valid projection may reach detail lookup");
});

test("malformed detail packet IDs fail closed before supervisor lookup", async () => {
  const fixtures = populatedFixtureCatalog();
  const calls = [];
  const loader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPacket: async (packetId) => {
      calls.push(packetId);
      return authoritativeWorkPacket();
    },
  });

  for (const packetId of ["", "   ", "fixture:legacy-detail", "fixture:legacy detail", "packet/with/slash", "packet\\with\\slash", 42, null, { packetId: "manager-source-authoritative-only" }]) {
    const result = await loader.loadPipelineCockpitPacket(packetId);
    assert.equal(result.fixtureMode.kind, "invalid");
    assert.equal(result.packet, null);
  }
  assert.deepEqual(calls, []);
});

test("WorkPacket list failure clears a successful projection and reports the read error", async () => {
  const fixtures = populatedFixtureCatalog();
  const loader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPackets: async () => { throw new Error("Supervisor WorkPacket list unavailable"); },
  });

  const unavailable = await loader.loadPipelineCockpitPackets();

  assert.equal(unavailable.fixtureMode.kind, "unavailable");
  assert.equal(unavailable.fixtureMode.label, "Supervisor unavailable");
  assert.equal(unavailable.packets.length, 0);
  assert.equal(unavailable.projection, null);
  assert.equal(unavailable.projectionError, "Supervisor WorkPacket list unavailable");
});

test("contradictory projection empty and populated states fail closed", async () => {
  const fixtures = populatedFixtureCatalog();
  const emptyContradictionLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      truthSummary: { backendEmpty: true, emptyReason: "healthy_empty", summary: "Contradictory empty projection." },
    }),
    getWorkPackets: async () => [],
  });
  const emptyContradiction = await emptyContradictionLoader.loadPipelineCockpitPackets();
  assert.equal(emptyContradiction.fixtureMode.kind, "invalid");
  assert.match(emptyContradiction.fixtureMode.summary, /zero rows while projection still contains packet identities/);

  const populatedContradictionLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([]),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });
  const populatedContradiction = await populatedContradictionLoader.loadPipelineCockpitPackets();
  assert.equal(populatedContradiction.fixtureMode.kind, "invalid");
  assert.match(populatedContradiction.fixtureMode.summary, /omitted runtime packet identity/);
});

test("pipeline detail route resolves decoded identity through the direct packet loader", async () => {
  const source = await readFile(detailRoutePath, "utf8");
  assert.match(source, /loadPipelineCockpitPacket\(decodedPacketId\)/);
  assert.doesNotMatch(source, /packets\.find\(/);
  assert.match(source, /decodeURIComponent\(packetId\)/);
  assert.doesNotMatch(source, /generateStaticParams/);
});

test("packet detail exposes supervisor runtime provenance without fixture-only semantics", async () => {
  const source = await readFile(detailComponentPath, "utf8");
  assert.match(source, /packet\.sourceKind === "supervisor-runtime"/);
});

test("explicit demo route is the only fixture catalog boundary", async () => {
  const normalRouteSource = await readFile(normalRoutePath, "utf8");
  const demoRouteSource = await readFile(demoRoutePath, "utf8");
  const demoDetailRouteSource = await readFile(demoDetailRoutePath, "utf8");
  const loaderSource = await readFile(loaderPath, "utf8");
  assert.doesNotMatch(normalRouteSource, /pipeline-fixtures/);
  assert.match(demoRouteSource, /pipeline-fixtures/);
  assert.match(demoDetailRouteSource, /pipeline-fixtures/);
  assert.doesNotMatch(loaderSource, /pipeline-fixtures|fixture fallback|fixture_fallback/i);
  assert.match(demoRouteSource, /kind: "demo"/);
  assert.match(demoRouteSource, /sourceKind: "demo-fixture"/);
  assert.match(demoRouteSource, /label: "Demo fixtures"/);
  assert.match(demoDetailRouteSource, /sourceKind: "demo-fixture"/);
  assert.match(demoDetailRouteSource, /cannot satisfy live proof or invoke supervisor authority/);
});

function runtimeProjection(packetIds = ["manager-source-authoritative-only"], overrides = {}) {
  const now = new Date().toISOString();
  const workPackets = packetIds.map((packetId) => ({
    packetId,
    title: `Projection packet ${packetId}`,
    currentStage: "capture",
    status: "waiting",
    truthLabel: "live",
    sourceRef: null,
    canonicalContract: null,
    productModeMapping: null,
    blocker: null,
    nextAction: "Inspect runtime packet.",
    unblocker: { state: "not_blocked", reason: null, actionLabel: null },
    evidenceRefs: [`event:${packetId}`],
    updatedAt: now,
    metadataOnly: true,
  }));
  const truthSummary = {
    label: "live",
    emptyReason: null,
    backendEmpty: false,
    backendUnavailable: false,
    fixtureBacked: false,
    stale: false,
    summary: "Live supervisor projection.",
    ...(overrides.truthSummary ?? {}),
  };
  return {
    schemaVersion: "pipeline-dashboard-projection/v0",
    projectionId: "projection-story-4-6-loader-test",
    generatedAt: now,
    sourceUpdatedAt: now,
    sourceLabel: "live",
    freshnessState: "live",
    staleAfterSeconds: 3600,
    backendReachability: {
      state: "reachable",
      checkedAt: now,
      reason: null,
      summary: "Supervisor reachable.",
      ...(overrides.backendReachability ?? {}),
    },
    fixtureMode: {
      enabled: false,
      reason: null,
      allowedForEnvironment: false,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
      ...(overrides.fixtureMode ?? {}),
    },
    truthSummary,
    stageSummaries: [],
    sourceStates: [],
    workPackets,
    selectedPacketDetails: [],
    managerSummary: { freshnessState: "live" },
    workerSummary: { freshnessState: "live" },
    reliabilityProblems: [],
    gatedControls: [],
    executeAdmission: {},
    queueSummary: { emptyReason: truthSummary.emptyReason },
    evidenceRefs: [],
    ...overrides,
    backendReachability: {
      state: "reachable",
      checkedAt: now,
      reason: null,
      summary: "Supervisor reachable.",
      ...(overrides.backendReachability ?? {}),
    },
    fixtureMode: {
      enabled: false,
      reason: null,
      allowedForEnvironment: false,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
      ...(overrides.fixtureMode ?? {}),
    },
    truthSummary,
    workPackets: overrides.workPackets ?? workPackets,
    selectedPacketDetails: overrides.selectedPacketDetails ?? [],
  };
}

function populatedFixtureCatalog() {
  return {
    pipelineCockpitPackets: [
      {
        packetId: "fixture:happy-path",
        fixtureId: "fixture:happy-path",
        fixtureKind: "future-real-source",
        title: "Shape cockpit route from Work Packet matrix",
      },
    ],
  };
}

function authoritativeWorkPacket() {
  return {
    packetId: "manager-source-authoritative-only",
    title: "Authoritative-only manager packet",
    requestedOutcome: "Inspect persisted source intake metadata.",
    currentStage: "capture",
    currentOwner: "kendall",
    status: "waiting",
    lifecycleState: {
      source: "workflow_event",
      stage: "capture",
      owner: "kendall",
      status: "waiting",
      reasonCodes: ["supervisor.authoritative_work_packet", "supervisor.truth.source_owned"],
      authoritativeRef: "authoritative_work_packet:manager-source-authoritative-only",
      derivedFromRefs: ["doc:source", "event:created"],
      transitionEventRefs: ["event:created"],
      latestTransitionEventRef: "event:created",
      attemptRef: null,
      metadataOnly: true,
      sourceMutationAllowed: false,
      providerCallsAllowed: false,
      workerLaunchAllowed: false,
      githubMutationAllowed: false,
      cleanupAllowed: false,
    },
    riskLevel: "low",
    priority: "normal",
    candidateWork: null,
    workItem: null,
    taskPacket: null,
    routingPreview: null,
    routeSummary: null,
    executionAttempts: [],
    transitionEvents: [],
    sourceRefs: [{
      refId: "doc:source",
      sourceType: "manual",
      label: "Source metadata",
      pathOrUrl: "docs/source.md",
      freshness: "unknown",
      accessState: "allowed",
      canonical: true,
      summaryOnly: true,
      blockedReason: null,
    }],
    evidenceRefs: [{
      refId: "event:created",
      evidenceType: "event",
      label: "Supervisor authoritative lifecycle event",
      artifactPath: null,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    }],
    artifactRefs: [],
    humanGateActions: [],
    humanGateActionRequests: [],
    laneCards: [],
    memoryProposals: [],
    deliveryEvidence: null,
    learnOutcome: null,
    learnRefill: null,
    alphaMemorySourceStatus: null,
    gateStateValidation: null,
    loopStopStates: [],
    reviewSummaries: [],
    recoveryActions: [],
  };
}

async function loadPipelinePacketLoader(fixtures, supervisorOverrides) {
  const source = await readFile(loaderPath, "utf8");
  const projectorSource = await readFile(new URL("../apps/dashboard/src/lib/pipeline-supervisor-projector.ts", import.meta.url), "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const projectorOutput = ts.transpileModule(projectorSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const supervisor = {
    applyPipelineOperationalAction: async () => { throw new Error("operational actions are outside this proof"); },
    issuePipelineOperationalApproval: async () => { throw new Error("operational approvals are outside this proof"); },
    ...supervisorOverrides,
  };
  const context = {
    exports: {},
    module: { exports: {} },
    require: (specifier) => {
      if (specifier === "./pipeline-supervisor-projector") {
        const projectorContext = { exports: {}, module: { exports: {} }, require: () => fixtures };
        projectorContext.exports = projectorContext.module.exports;
        vm.runInNewContext(projectorOutput, projectorContext, { filename: "pipeline-supervisor-projector.ts" });
        return projectorContext.module.exports;
      }
      if (specifier === "./supervisor") return supervisor;
      throw new Error(`Unexpected loader import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-packet-loader.ts" });
  return context.module.exports;
}
