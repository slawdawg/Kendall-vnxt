import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const loaderPath = new URL("../apps/dashboard/src/lib/pipeline-packet-loader.ts", import.meta.url);
const runtimePath = new URL("../apps/dashboard/src/lib/pipeline-supervisor-runtime.ts", import.meta.url);
const detailRoutePath = new URL("../apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx", import.meta.url);
const detailComponentPath = new URL("../apps/dashboard/src/components/pipeline/packet-detail-page.tsx", import.meta.url);
const normalRoutePath = new URL("../apps/dashboard/src/app/pipeline/page.tsx", import.meta.url);
const demoRoutePath = new URL("../apps/dashboard/src/app/pipeline/demo/page.tsx", import.meta.url);
const demoDetailRoutePath = new URL("../apps/dashboard/src/app/pipeline/demo/packets/[packetId]/page.tsx", import.meta.url);
const pipelineControlPlaneContractPath = new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url);

const runtimeContractValidators = {
  AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES: [
    "packet.created",
    "packet.stage_transitioned",
    "packet.operational_action_applied",
    "packet.parallel_work_graph_refreshed",
  ],
  isPipelineCanonicalContractV1: () => true,
  isPipelineProductModeMappingV0: () => true,
  validatePipelineEpic25EvidenceChainV0: () => ["evidence-chain extension omitted from this fixture"],
  validatePipelineEpic25EvidenceChainV1: () => ["evidence-chain extension omitted from this fixture"],
};

async function loadActualPipelineControlPlaneContracts() {
  const source = await readFile(pipelineControlPlaneContractPath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, module: { exports: {} } };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-control-plane/index.ts" });
  return context.module.exports;
}

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
  const canonicalListed = await loader.__canonicalListForTest();
  const canonicalDetailed = await loader.__canonicalDetailForTest(authoritativePacket.packetId);

  assert.equal(listed.fixtureMode.kind, "runtime");
  assert.equal(listed.fixtureMode.label, "Supervisor runtime");
  assert.equal(listed.fixtureMode.canSatisfyLiveProof, false);
  assert.equal(listed.operationalTruth?.schemaVersion, "dashboard-canonical-operational-projection/v1");
  assert.equal(JSON.stringify(listed.operationalTruth?.workPackets), JSON.stringify([{ packetId: authoritativePacket.packetId }]));
  assert.equal(Object.hasOwn(listed.operationalTruth ?? {}, "rawProviderResponse"), false);
  assert.equal(listed.canonicalPackets[0].presentation.packetId, authoritativePacket.packetId);
  assert.equal(listed.canonicalPackets[0].presentation.packetId, listed.packets[0].packetId);
  assert.equal(Object.hasOwn(canonicalListed, "packets"), false);
  assert.equal(Object.hasOwn(canonicalDetailed, "packet"), false);
  assert.equal(canonicalListed.canonicalPackets[0].presentation.packetId, authoritativePacket.packetId);
  assert.equal(canonicalDetailed.canonicalPacket?.authoritativeLifecycle.packetId, authoritativePacket.packetId);
  assert.equal(listed.packets[0].packetId, authoritativePacket.packetId);
  assert.equal(detailed.fixtureMode.kind, "runtime");
  assert.equal(detailed.fixtureMode.label, "Supervisor runtime");
  assert.equal(detailed.packet.packetId, listed.packets[0].packetId);
  assert.equal(detailed.packet.sourceKind, "supervisor-runtime");
  assert.equal(detailed.packet.sourceId, authoritativePacket.packetId);
  assert.equal(detailed.packet.fixtureId, undefined);
  assert.equal(detailed.packet.fixtureKind, undefined);
  assert.deepEqual(calls, [
    "projection", "list", "projection", `detail:${authoritativePacket.packetId}`,
    "projection", "list", "projection", `detail:${authoritativePacket.packetId}`,
  ]);
});

test("pipeline loader exposes only the client-safe canonical lifecycle while naming the temporary compatibility projection", async () => {
  const authoritativePacket = {
    ...authoritativeWorkPacket(),
    canonicalContract: { productMode: "operator_assisted" },
    evidenceChain: { authoritativePacketId: "manager-source-authoritative-only", freshnessState: "stale" },
    productModeMapping: { requestedProductMode: "operator_assisted" },
  };
  const loader = await loadPipelinePacketLoader(populatedFixtureCatalog(), {
    getPipelineDashboardProjection: async () => runtimeProjection([authoritativePacket.packetId]),
    getWorkPackets: async () => [authoritativePacket],
    getWorkPacket: async () => authoritativePacket,
  });

  const listed = await loader.loadPipelineCockpitPackets();
  const detailed = await loader.loadPipelineCockpitPacket(authoritativePacket.packetId);

  assert.equal(listed.canonicalPackets[0].presentation.packetId, authoritativePacket.packetId);
  assert.equal(Object.hasOwn(listed.canonicalPackets[0], "canonicalContract"), false);
  assert.equal(Object.hasOwn(listed.canonicalPackets[0], "evidenceChain"), false);
  assert.equal(Object.hasOwn(listed.canonicalPackets[0], "productModeMapping"), false);
  assert.equal(listed.packets[0].packetId, listed.canonicalPackets[0].presentation.packetId);
  assert.deepEqual(detailed.canonicalPacket?.evidenceChain, authoritativePacket.evidenceChain);
  assert.equal(detailed.packet?.packetId, detailed.canonicalPacket?.presentation.packetId);
});

test("normal loader and packet-detail route keep the canonical DTO until their named compatibility boundaries", async () => {
  const [loaderSource, detailRouteSource, detailComponentSource] = await Promise.all([
    readFile(loaderPath, "utf8"),
    readFile(detailRoutePath, "utf8"),
    readFile(detailComponentPath, "utf8"),
  ]);

  assert.match(loaderSource, /canonicalPackets: DashboardCanonicalWorkPacketClientV1\[\]/);
  assert.match(loaderSource, /canonicalPacket: DashboardCanonicalWorkPacketV1 \| null/);
  assert.doesNotMatch(loaderSource, /packets: PipelineRuntimePacket\[\]/);
  assert.doesNotMatch(loaderSource, /packet: PipelineRuntimePacket \| null/);
  assert.match(detailRouteSource, /const \{ fixtureMode, canonicalPacket, workGraph \}/);
  assert.match(detailRouteSource, /<PacketDetailPage canonicalPacket=\{canonicalPacket\}/);
  assert.match(detailComponentSource, /const \{ authoritativeLifecycle: lifecycle, presentation \} = canonicalPacket/);
  assert.doesNotMatch(detailComponentSource, /projectDashboardCanonicalPresentationsToCockpitPackets|PipelineDashboardPacket|WorkPacketV0View/);
  assert.match(loaderSource, /canonicalPackets: canonicalPackets\.map\(projectDashboardCanonicalPacketForClient\)/);
});

test("pipeline packet reads use the transport selected by the caller runtime", async () => {
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
  assert.equal(listed.packets[0].packetId, authoritativePacket.packetId);
  assert.equal(detailed.fixtureMode.kind, "runtime");
  assert.equal(detailed.packet.packetId, authoritativePacket.packetId);
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
  emptyProjection.rawProviderResponse = "python-only extension";
  const loader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => emptyProjection,
    getWorkPackets: async () => [],
    getWorkPacket: async () => { throw detailError; },
  });

  const empty = await loader.loadPipelineCockpitPackets();
  assert.equal(empty.fixtureMode.kind, "empty");
  assert.equal(empty.packets.length, 0);
  assert.notEqual(empty.operationalProjection, emptyProjection);
  assert.doesNotMatch(JSON.stringify(empty.operationalProjection), /python-only extension/i);

  for (const emptyReason of ["blocked", "refilling", "source_exhausted"]) {
    const reasonProjection = runtimeProjection([], {
      truthSummary: {
        backendEmpty: true,
        emptyReason,
        summary: `Supervisor empty reason: ${emptyReason}.`,
      },
      queueSummary: { emptyReason },
    });
    const reasonLoader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => reasonProjection,
      getWorkPackets: async () => [],
    });
    const reasonEmpty = await reasonLoader.loadPipelineCockpitPackets();
    assert.equal(reasonEmpty.fixtureMode.kind, "invalid");
    assert.equal(reasonEmpty.packets.length, 0);
    assert.match(reasonEmpty.fixtureMode.summary, new RegExp(`empty reason was ${emptyReason}`));
  }

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
  assert.equal(unavailable.fixtureMode.kind, "invalid");
  assert.equal(unavailable.packet, null);
});

test("stale supervisor data stays readable but fixture-shaped packets fail closed", async () => {
  const fixtures = populatedFixtureCatalog();
  const staleLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      sourceLabel: "stale",
      freshnessState: "stale",
      truthSummary: { label: "stale", stale: true, summary: "Stale supervisor projection." },
    }),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });

  const stale = await staleLoader.loadPipelineCockpitPackets();
  assert.equal(stale.fixtureMode.kind, "stale");
  assert.equal(stale.fixtureMode.label, "Supervisor stale read-only");
  assert.equal(stale.packets.length, 1);
  assert.match(stale.fixtureMode.summary, /stale and read-only/i);

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

  for (const [label, overrides, expected] of [
    ["future-generated", { generatedAt: new Date(Date.now() + 86_400_000).toISOString(), sourceUpdatedAt: new Date(Date.now() + 86_400_000).toISOString() }, /future-dated/],
    ["overflow-window", { staleAfterSeconds: Number.MAX_SAFE_INTEGER }, /overflowed/],
  ]) {
    const badFreshnessLoader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], overrides),
      getWorkPackets: async () => [authoritativeWorkPacket()],
    });
    const badFreshness = await badFreshnessLoader.loadPipelineCockpitPackets();
    assert.equal(badFreshness.fixtureMode.kind, "invalid", label);
    assert.match(badFreshness.fixtureMode.summary, expected, label);
  }

  const contradictoryStaleLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      generatedAt: new Date(Date.now() + 86_400_000).toISOString(),
      sourceUpdatedAt: new Date(Date.now() + 86_400_000).toISOString(),
      sourceLabel: "stale",
      freshnessState: "stale",
      truthSummary: { label: "stale", stale: true, summary: "Stale flags contradict future timestamps." },
    }),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });
  const contradictoryStale = await contradictoryStaleLoader.loadPipelineCockpitPackets();
  assert.equal(contradictoryStale.fixtureMode.kind, "invalid");
  assert.match(contradictoryStale.fixtureMode.summary, /future-dated/);

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
  assert.equal(fixtureShaped.operationalProjection, null);
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

test("stale projections reconcile list identities and malformed nested truth fails closed", async () => {
  const fixtures = populatedFixtureCatalog();
  const staleProjection = runtimeProjection(["manager-source-authoritative-only"], {
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    sourceLabel: "stale",
    freshnessState: "stale",
    truthSummary: { label: "stale", stale: true, summary: "Stale supervisor projection." },
  });
  const staleIdentityMismatch = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => staleProjection,
    getWorkPackets: async () => [{ ...authoritativeWorkPacket(), packetId: "different-runtime-packet" }],
  });
  const mismatch = await staleIdentityMismatch.loadPipelineCockpitPackets();
  assert.equal(mismatch.fixtureMode.kind, "invalid");
  assert.equal(mismatch.packets.length, 0);
  assert.match(mismatch.projectionError, /omitted runtime packet identity|included runtime packet identity/);

  const malformedNestedTruth = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => ({ ...staleProjection, truthSummary: null }),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });
  const malformed = await malformedNestedTruth.loadPipelineCockpitPackets();
  assert.equal(malformed.fixtureMode.kind, "invalid");
  assert.equal(malformed.packets.length, 0);
  assert.match(malformed.projectionError, /missing or malformed/);
});

test("synthetic reference identities are rejected while fixture-classified evidence metadata remains readable", async () => {
  const fixtures = populatedFixtureCatalog();
  const fixtureRefCases = [
    { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], refId: "fixture:source-ref" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], artifactPath: "fixture:evidence-artifact" }] },
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

  for (const overrides of [
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], evidenceType: "fixture" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], retentionClass: "fixture" }] },
    { artifactRefs: [{ refId: "artifact:normal", artifactType: "fixture", label: "Fixture artifact", status: "available" }] },
  ]) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
      getWorkPackets: async () => [{ ...authoritativeWorkPacket(), ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "runtime");
    assert.equal(result.packets.length, 1);
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

test("nested review, gate, and learn fixture provenance fails closed without scanning ordinary text", async () => {
  const fixtures = populatedFixtureCatalog();
  const packet = authoritativeWorkPacket();
  const reviewSummary = {
    reviewer: "claude_reviewer",
    status: "complete",
    summary: "Read-only review complete.",
    evidenceRefs: ["review:complete"],
    artifactRefs: ["artifact:review"],
  };
  const learnOutcome = authoritativeLearnOutcome();
  const learnRefill = authoritativeLearnRefill();
  const nestedFixtureCases = [
    ["review evidence", { reviewSummaries: [{ ...reviewSummary, evidenceRefs: ["fixture:nested-review"] }] }],
    ["delivery retained evidence", {
      deliveryEvidence: {
        evidenceId: "delivery:authoritative",
        mode: "metadata_only",
        status: "ready",
        readyForApproval: false,
        hasDeliveryExecutionEvidence: false,
        evidenceRefs: ["event:created"],
        artifactRefs: [],
        retainedEvidence: ["fixture:nested-delivery-retained"],
        blockedReasons: [],
        recoveryPath: "Return to delivery review.",
        deliveryRailsGrantAuthority: false,
        rawPayloadRetained: false,
        remoteMutationApproved: false,
        mergeApproved: false,
        cleanupApproved: false,
      },
    }],
    ["delivery pull request URL", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), pullRequestUrl: "fixture:pr" },
    }],
    ["learn evidence", { learnOutcome: { ...learnOutcome, evidenceRefs: ["fixture:nested-learn-evidence"] } }],
    ["learn source", { learnOutcome: { ...learnOutcome, sourceRefs: ["fixture:nested-learn-source"] } }],
    ["learn decision evidence", {
      learnOutcome: {
        ...learnOutcome,
        decisionRecords: [{ ...learnOutcome.decisionRecords[0], evidenceRefs: ["fixture:nested-decision"] }],
      },
    }],
    ["human gate required evidence", {
      humanGateActions: [{ ...authoritativeHumanGateAction(), requiredEvidenceRefs: ["fixture:nested-human-gate"] }],
    }],
    ["learn refill follow-up evidence", {
      learnRefill: {
        ...learnRefill,
        followUpCandidates: [{ ...learnRefill.followUpCandidates[0], evidenceRefs: ["fixture:nested-follow-up"] }],
      },
    }],
    ["learn refill source state", {
      learnRefill: {
        ...learnRefill,
        refillSourceState: { ...learnRefill.refillSourceState, sourceRefs: ["fixture:nested-refill-source"] },
      },
    }],
    ["learn refill ready-to-test verification", {
      learnRefill: {
        ...learnRefill,
        readyToTest: { ...learnRefill.readyToTest, verificationRefs: ["fixture:nested-verification"] },
      },
    }],
    ["gate replay ref state", {
      gateStateValidation: {
        ...authoritativeGateStateValidation(),
        refStates: [{ ...authoritativeGateStateValidation().refStates[0], refId: "fixture:nested-gate-ref" }],
      },
    }],
    ["nested fixture id discriminator", {
      routeSummary: {
        recommendation: "capture",
        reasonCodes: ["route.capture"],
        detail: { fixtureId: "ordinary-looking-value" },
      },
    }],
    ["nested case-variant fixture id discriminator", {
      routeSummary: {
        recommendation: "capture",
        reasonCodes: ["route.capture"],
        detail: { FixtureID: "ordinary-looking-value" },
      },
    }],
    ["nested fixture kind discriminator", {
      reviewSummaries: [{ ...reviewSummary, detail: { fixtureKind: "future-real-source" } }],
    }],
    ["nested fixture label discriminator", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), detail: { fixtureLabel: "Demo source" } },
    }],
    ["nested demo source kind discriminator", {
      learnOutcome: { ...learnOutcome, detail: { sourceKind: "demo-fixture" } },
    }],
    ["nested case-normalized demo source kind discriminator", {
      learnOutcome: { ...learnOutcome, detail: { SourceKind: "DEMO-FIXTURE" } },
    }],
  ];

  for (const [label, overrides] of nestedFixtureCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }

  const ordinaryTextLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
    getWorkPackets: async () => [{
      ...packet,
      reviewSummaries: [{ ...reviewSummary, summary: "Review discusses fixture:legacy wording only." }],
      humanGateActions: [{ ...authoritativeHumanGateAction(), label: "Discuss fixture:legacy wording" }],
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        detail: { label: "Operator label mentions fixture:legacy text" },
      },
      learnRefill: { ...learnRefill, nextSafeAction: "Document fixture:legacy as ordinary text." },
      gateStateValidation: { ...authoritativeGateStateValidation(), detail: { retentionClass: "fixture" } },
      humanGateActions: [{ ...authoritativeHumanGateAction(), detail: { artifactType: "fixture" } }],
    }],
  });
  const ordinaryText = await ordinaryTextLoader.loadPipelineCockpitPackets();
  assert.equal(ordinaryText.fixtureMode.kind, "runtime");
  assert.equal(ordinaryText.packets.length, 1);
});

test("runtime-reachable nested WorkPacket collection members fail closed before rendering", async () => {
  const fixtures = populatedFixtureCatalog();
  const packet = authoritativeWorkPacket();
  const nested = authoritativeNestedWorkPacketCollections(packet.packetId);
  const validLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
    getWorkPackets: async () => [{ ...packet, ...nested }],
  });
  const valid = await validLoader.loadPipelineCockpitPackets();
  assert.equal(valid.fixtureMode.kind, "runtime");
  assert.equal(valid.packets.length, 1);

  const malformedCases = [
    ["humanGateActions null member", { humanGateActions: [null] }],
    ["humanGateActions contradictory packet identity", {
      humanGateActions: [{
        ...nested.humanGateActions[0],
        payload: { ...nested.humanGateActions[0].payload, packetId: "packet:other" },
      }],
    }],
    ["humanGateActionRequests null member", { humanGateActionRequests: [null] }],
    ["humanGateActionRequests contradictory packet identity", {
      humanGateActionRequests: [{ ...nested.humanGateActionRequests[0], packetId: "packet:other" }],
    }],
    ["laneCards wrong enum", { laneCards: [{ ...nested.laneCards[0], status: "live" }] }],
    ["memoryProposals missing required field", { memoryProposals: [{ ...nested.memoryProposals[0], proposalId: undefined }] }],
    ["memoryProposals contradictory packet identity", { memoryProposals: [{ ...nested.memoryProposals[0], packetId: "packet:other" }] }],
    ["reviewSummaries null member", { reviewSummaries: [null] }],
    ["recoveryActions wrong enum", { recoveryActions: [{ ...nested.recoveryActions[0], actionType: "retry_forever" }] }],
    ["executionAttempts missing required field", { executionAttempts: [{ ...nested.executionAttempts[0], attemptId: undefined }] }],
    ["transitionEvents wrong enum", { transitionEvents: [{ ...nested.transitionEvents[0], targetStage: "archive" }] }],
    ["loopStopStates contradictory authority", { loopStopStates: [{ ...nested.loopStopStates[0], cleanupAllowed: true }] }],
  ];

  for (const [label, overrides] of malformedCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }
});

test("malformed nested projection detail structures fail closed before UI dereference", async () => {
  const fixtures = populatedFixtureCatalog();
  const packet = authoritativeWorkPacket();
  const learnOutcome = authoritativeLearnOutcome();
  const learnRefill = authoritativeLearnRefill();
  const malformedCases = [
    ["route summary reason codes", { routeSummary: { recommendation: "capture", reasonCodes: null } }],
    ["delivery evidence refs", { deliveryEvidence: { ...authoritativeDeliveryEvidence(), evidenceRefs: [null] } }],
    ["learn decision record", { learnOutcome: { ...learnOutcome, decisionRecords: [null] } }],
    ["learn refill follow-up", { learnRefill: { ...learnRefill, followUpCandidates: [null] } }],
    ["gate replay detail", {
      gateStateValidation: { ...authoritativeGateStateValidation(), refStates: [null] },
    }],
  ];

  for (const [label, overrides] of malformedCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }
});

test("lifecycle source accepts only the bounded WorkPacketV0 source contract", async () => {
  const fixtures = populatedFixtureCatalog();
  const packet = authoritativeWorkPacket();
  const allowedSources = [
    "candidate_work",
    "work_item",
    "execution_attempt",
    "workflow_event",
    "memory_proposal",
    "delivery_evidence",
    "source_missing",
  ];

  for (const source of allowedSources) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, lifecycleState: { ...packet.lifecycleState, source } }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "runtime", source);
  }

  const missingSourceState = { ...packet.lifecycleState };
  delete missingSourceState.source;
  for (const [label, lifecycleState] of [
    ["missing", missingSourceState],
    ["null", { ...packet.lifecycleState, source: null }],
    ["non-string", { ...packet.lifecycleState, source: 42 }],
    ["empty", { ...packet.lifecycleState, source: "" }],
    ["unknown", { ...packet.lifecycleState, source: "supervisor_runtime" }],
  ]) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, lifecycleState }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }
});

test("canonical lifecycle provenance and optional WorkPacket source views fail closed on malformed fields", async () => {
  const fixtures = populatedFixtureCatalog();
  const packet = authoritativeWorkPacket();
  const optionalSources = authoritativeOptionalWorkPacketSources();
  const validLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
    getWorkPackets: async () => [{ ...packet, ...optionalSources }],
  });
  const valid = await validLoader.loadPipelineCockpitPackets();
  assert.equal(valid.fixtureMode.kind, "runtime");
  assert.equal(valid.packets.length, 1);

  const proseOnlySources = structuredClone(optionalSources);
  proseOnlySources.candidateWork.sourceSummary.label = "Operator label mentions fixture:legacy text";
  proseOnlySources.workItem.executionRecipe.label = "Review fixture:legacy wording";
  proseOnlySources.taskPacket.verificationSummary = "Document fixture:legacy as ordinary prose.";
  proseOnlySources.routingPreview.decision.humanExplanation = "The label fixture:legacy is not provenance.";
  const proseOnlyLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
    getWorkPackets: async () => [{ ...packet, ...proseOnlySources }],
  });
  const proseOnly = await proseOnlyLoader.loadPipelineCockpitPackets();
  assert.equal(proseOnly.fixtureMode.kind, "runtime");
  assert.equal(proseOnly.packets.length, 1);

  const nestedPacketCollections = authoritativeNestedWorkPacketCollections(packet.packetId);
  const nestedSyntheticProvenanceCases = [
    ["allowed inputs", {
      routingPreview: { ...optionalSources.routingPreview, detail: { allowedInputs: ["fixture:nested-input"] } },
    }],
    ["targetVaultFolder", {
      memoryProposals: [{ ...nestedPacketCollections.memoryProposals[0], targetVaultFolder: "fixture:nested-folder" }],
    }],
    ["branchPrefix", {
      workItem: {
        ...optionalSources.workItem,
        executionRecipe: { ...optionalSources.workItem.executionRecipe, branchPrefix: "fixture:nested-branch-prefix" },
      },
    }],
    ["derivedTargetFolder", {
      alphaMemorySourceStatus: {
        ...authoritativeAlphaMemorySourceStatus(),
        llmWikiReadiness: authoritativeLlmWikiReadiness({
          rebuildPreview: { derivedTargetFolder: "fixture:nested-derived-folder" },
        }),
      },
    }],
    ["disposableTargetNamespace", {
      alphaMemorySourceStatus: {
        ...authoritativeAlphaMemorySourceStatus(),
        llmWikiReadiness: authoritativeLlmWikiReadiness({
          rebuildDryRunPlan: authoritativeLlmWikiRebuildDryRunPlan({
            disposableTargetNamespace: "fixture:nested-dry-run-namespace",
          }),
        }),
      },
    }],
    ["reference array object member", {
      alphaMemorySourceStatus: {
        ...authoritativeAlphaMemorySourceStatus(),
        llmWikiReadiness: authoritativeLlmWikiReadiness({
          rebuildPreview: { inputRefs: [{ refId: "fixture:nested-input-ref" }] },
        }),
      },
    }],
    ["backupPath", {
      alphaMemorySourceStatus: { ...authoritativeAlphaMemorySourceStatus(), backupPath: "demo:nested-backup" },
    }],
    ["rollbackPath", {
      alphaMemorySourceStatus: { ...authoritativeAlphaMemorySourceStatus(), rollbackPath: "fixture:nested-rollback" },
    }],
    ["expectedPr", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedPr: "demo:nested-pr" }),
      },
    }],
    ["expectedWorktree", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedWorktree: "fixture:nested-worktree" }),
      },
    }],
    ["expectedOwner", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedOwner: "fixture:nested-owner" }),
      },
    }],
    ["expectedLocalBranch", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedLocalBranch: "fixture:nested-local-branch" }),
      },
    }],
    ["expectedRemoteBranch", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedRemoteBranch: "fixture:nested-remote-branch" }),
      },
    }],
    ["expectedHeadRevision", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedHeadRevision: "fixture:nested-head-revision" }),
      },
    }],
    ["delivery target branch", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), targetBranch: "fixture:nested-target-branch" },
    }],
    ["delivery base branch", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), baseBranch: "fixture:nested-base-branch" },
    }],
    ["delivery pull request head revision", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), pullRequestHeadRevision: "fixture:nested-pr-head" },
    }],
    ["delivery evidence identity", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), evidenceId: "fixture:nested-delivery-id" },
    }],
    ["delivery gate evidence", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        mergeGate: {
          status: "blocked",
          lowRiskReady: false,
          criteria: [{
            criterionId: "criterion:delivery",
            label: "Delivery criterion",
            status: "blocked",
            evidence: ["fixture:nested-gate-evidence"],
            blockedReason: null,
          }],
          blockedReasons: [],
          recoveryPath: "Return to delivery review.",
          metadataOnly: true,
          mergeApproved: false,
        },
      },
    }],
    ["cleanupTarget", {
      deliveryEvidence: { ...authoritativeDeliveryEvidence(), cleanupTarget: "demo:nested-cleanup" },
    }],
    ["lowercase url", { candidateWork: { ...optionalSources.candidateWork, importMetadata: { url: "fixture:nested-url" } } }],
    ["uppercase URI", { candidateWork: { ...optionalSources.candidateWork, importMetadata: { URI: "demo:nested-uri" } } }],
    ["uppercase HREF", { candidateWork: { ...optionalSources.candidateWork, importMetadata: { HREF: "fixture:nested-href" } } }],
  ];
  for (const [label, overrides] of nestedSyntheticProvenanceCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, ...optionalSources, ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }

  const whitespaceProvenanceCases = [
    ["lifecycle latest transition event reference", { lifecycleState: { ...packet.lifecycleState, latestTransitionEventRef: " \t " } }],
    ["lifecycle attempt reference", { lifecycleState: { ...packet.lifecycleState, attemptRef: "  " } }],
    ["delivery pull request URL", { deliveryEvidence: { ...authoritativeDeliveryEvidence(), pullRequestUrl: " \t " } }],
    ["delivery expected head revision", { deliveryEvidence: { ...authoritativeDeliveryEvidence(), expectedHeadRevision: "  " } }],
    ["delivery cleanup target", { deliveryEvidence: { ...authoritativeDeliveryEvidence(), cleanupTarget: "\t" } }],
    ["cleanup expected head revision", {
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        cleanupDryRunGate: authoritativeCleanupDryRunGate({ expectedHeadRevision: "  " }),
      },
    }],
  ];
  for (const [label, overrides] of whitespaceProvenanceCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, ...optionalSources, ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }

  const nullableDeliveryLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
    getWorkPackets: async () => [{
      ...packet,
      ...optionalSources,
      deliveryEvidence: {
        ...authoritativeDeliveryEvidence(),
        pullRequestUrl: null,
        expectedHeadRevision: null,
        cleanupTarget: null,
        cleanupDryRunGate: authoritativeCleanupDryRunGate(),
      },
    }],
  });
  const nullableDelivery = await nullableDeliveryLoader.loadPipelineCockpitPackets();
  assert.equal(nullableDelivery.fixtureMode.kind, "runtime");
  assert.equal(nullableDelivery.packets.length, 1);

  const lifecycleCases = [
    ["reasonCodes", { ...packet.lifecycleState, reasonCodes: null }],
    ["authoritativeRef", { ...packet.lifecycleState, authoritativeRef: "" }],
    ["derivedFromRefs", { ...packet.lifecycleState, derivedFromRefs: ["doc:source", null] }],
    ["transitionEventRefs", { ...packet.lifecycleState, transitionEventRefs: 42 }],
    ["latestTransitionEventRef", { ...packet.lifecycleState, latestTransitionEventRef: { refId: "event:created" } }],
    ["attemptRef", { ...packet.lifecycleState, attemptRef: 42 }],
  ];
  for (const [label, lifecycleState] of lifecycleCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, lifecycleState }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }

  const { candidateWork, workItem, taskPacket, routingPreview } = optionalSources;
  const optionalSourceCases = [
    ["candidate required field", { candidateWork: { ...candidateWork, title: null } }],
    ["candidate source enum", { candidateWork: { ...candidateWork, source: "runtime_fixture" } }],
    ["candidate source artifact path", { candidateWork: { ...candidateWork, sourceArtifactPath: "fixture:candidate-source" } }],
    ["candidate source summary", {
      candidateWork: { ...candidateWork, sourceSummary: { ...candidateWork.sourceSummary, evidenceRefs: [null] } },
    }],
    ["candidate summary source artifact path", {
      candidateWork: {
        ...candidateWork,
        sourceSummary: { ...candidateWork.sourceSummary, sourceArtifactPath: "demo:candidate-summary-source" },
      },
    }],
    ["candidate import metadata", { candidateWork: { ...candidateWork, importMetadata: [] } }],
    ["work item workflow state", { workItem: { ...workItem, state: "active" } }],
    ["work item source", { workItem: { ...workItem, source: "fixture:work-item-source" } }],
    ["work item metadata value", { workItem: { ...workItem, metadata: { nested: { unsafe: true } } } }],
    ["work item recipe", {
      workItem: {
        ...workItem,
        executionRecipe: {
          ...workItem.executionRecipe,
          remoteAutomationPolicy: { ...workItem.executionRecipe.remoteAutomationPolicy, blockedOperations: null },
        },
      },
    }],
    ["work item delivery readiness", {
      workItem: { ...workItem, deliveryReadiness: { ...workItem.deliveryReadiness, readyForApproval: "yes" } },
    }],
    ["work item recipe allowed path", {
      workItem: {
        ...workItem,
        executionRecipe: { ...workItem.executionRecipe, allowedPaths: ["demo:work-item-path"] },
      },
    }],
    ["task packet required field", { taskPacket: { ...taskPacket, verificationSummary: undefined } }],
    ["task packet source", { taskPacket: { ...taskPacket, source: "fixture:task-packet-source" } }],
    ["task packet source artifact path", {
      taskPacket: { ...taskPacket, sourceArtifactPath: "demo:task-packet-source" },
    }],
    ["routing profile paths", {
      routingPreview: { ...routingPreview, profile: { ...routingPreview.profile, allowedPaths: null } },
    }],
    ["routing profile synthetic path", {
      routingPreview: { ...routingPreview, profile: { ...routingPreview.profile, allowedPaths: ["fixture:routing-path"] } },
    }],
    ["routing decision profile snapshot", {
      routingPreview: { ...routingPreview, decision: { ...routingPreview.decision, profileSnapshot: null } },
    }],
    ["routing decision snapshot synthetic path", {
      routingPreview: {
        ...routingPreview,
        decision: {
          ...routingPreview.decision,
          profileSnapshot: { ...routingPreview.decision.profileSnapshot, allowedPaths: ["demo:routing-snapshot-path"] },
        },
      },
    }],
    ["routing rejected lane", {
      routingPreview: { ...routingPreview, decision: { ...routingPreview.decision, rejectedLanes: [null] } },
    }],
  ];
  for (const [label, overrides] of optionalSourceCases) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection([packet.packetId]),
      getWorkPackets: async () => [{ ...packet, ...optionalSources, ...overrides }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }
});

test("malformed nested evidence and artifact references fail closed before rendering", async () => {
  const fixtures = populatedFixtureCatalog();
  for (const overrides of [
    { evidenceRefs: ["event:created"] },
    { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], sourceType: "repo_doc" }] },
    { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], accessState: "live" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], rawPayloadRetained: true }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], evidenceType: "raw_payload" }] },
    { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], retentionClass: "forever" }] },
    { artifactRefs: ["artifact:report"] },
    { artifactRefs: [{ refId: "artifact:report", artifactType: "report", label: "Report" }] },
    { artifactRefs: [{ refId: "artifact:report", artifactType: "raw_payload", label: "Report", status: "available" }] },
    { artifactRefs: [{ refId: "artifact:report", artifactType: "report", label: "Report", status: "live" }] },
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

test("detail lookup accepts canonical stale truth read-only and fails closed for unavailable or omitted identities", async () => {
  const fixtures = populatedFixtureCatalog();
  let detailCalls = 0;
  const staleLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
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
  assert.equal(stale.fixtureMode.kind, "stale");
  assert.equal(stale.fixtureMode.label, "Supervisor stale read-only");
  assert.equal(stale.packet?.packetId, "manager-source-authoritative-only");

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
  assert.equal(detailCalls, 2, "canonical stale and valid live projections may reach detail lookup");

  const emptyClaimLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"], {
      truthSummary: { backendEmpty: true, emptyReason: "healthy_empty", summary: "Contradictory backend-empty detail projection." },
    }),
    getWorkPacket: async () => {
      detailCalls += 1;
      return authoritativeWorkPacket();
    },
  });
  const emptyClaim = await emptyClaimLoader.loadPipelineCockpitPacket("manager-source-authoritative-only");
  assert.equal(emptyClaim.fixtureMode.kind, "invalid");
  assert.equal(emptyClaim.packet, null);
  assert.equal(detailCalls, 2, "backend-empty detail projection must fail before detail lookup");
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

  for (const packetId of ["", "   ", "fixture:legacy-detail", "Fixture:legacy-detail", "demo:legacy-detail", "Demo:legacy-detail", "fixture:legacy detail", "packet/with/slash", "packet\\with\\slash", 42, null, { packetId: "manager-source-authoritative-only" }]) {
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
  assert.equal(unavailable.operationalProjection, null);
  assert.equal(unavailable.projectionError, "Supervisor WorkPacket list unavailable");
});

test("contradictory projection empty and populated states fail closed", async () => {
  const fixtures = populatedFixtureCatalog();
  const nullProjectionLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => null,
    getWorkPackets: async () => [],
  });
  const nullProjection = await nullProjectionLoader.loadPipelineCockpitPackets();
  assert.equal(nullProjection.fixtureMode.kind, "invalid");
  assert.equal(nullProjection.packets.length, 0);
  assert.match(nullProjection.projectionError, /Invalid projection payload/);

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

  const duplicateRuntimeLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPackets: async () => [authoritativeWorkPacket(), authoritativeWorkPacket()],
  });
  const duplicateRuntime = await duplicateRuntimeLoader.loadPipelineCockpitPackets();
  assert.equal(duplicateRuntime.fixtureMode.kind, "invalid");
  assert.match(duplicateRuntime.fixtureMode.summary, /duplicate WorkPacketV0 identity|duplicate runtime packet identity|Canonical supervisor packet identities are duplicated/);
});

test("projection and runtime list identities must match exactly with unique packet IDs", async () => {
  const fixtures = populatedFixtureCatalog();
  const exactIdentityLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only", "extra-runtime-packet"]),
    getWorkPackets: async () => [authoritativeWorkPacket()],
  });

  const exactIdentity = await exactIdentityLoader.loadPipelineCockpitPackets();

  assert.equal(exactIdentity.fixtureMode.kind, "invalid");
  assert.equal(exactIdentity.packets.length, 0);
  assert.match(exactIdentity.fixtureMode.summary, /included runtime packet identity extra-runtime-packet that was absent from the WorkPacket list/);
});

test("normal mode does not substitute the real compiled fixture catalog", async () => {
  const realFixtures = await loadCompiledDashboardFixtures();
  assert.ok(realFixtures.pipelineCockpitPackets.length > 5);
  const fixturePacketIds = realFixtures.pipelineCockpitPackets.map((packet) => packet.packetId);
  assert.ok(fixturePacketIds.some((packetId) => packetId.startsWith("fixture:")));

  const emptyProjection = runtimeProjection([], {
    truthSummary: {
      backendEmpty: true,
      emptyReason: "healthy_empty",
      summary: "Supervisor returned zero persisted WorkPacketV0 rows.",
    },
  });
  const loader = await loadPipelinePacketLoader(realFixtures, {
    getPipelineDashboardProjection: async () => emptyProjection,
    getWorkPackets: async () => [],
  });
  const empty = await loader.loadPipelineCockpitPackets();
  assert.equal(empty.fixtureMode.kind, "empty");
  assert.equal(empty.packets.length, 0);
  assert.equal(empty.packets.map((packet) => packet.packetId).length, 0);

  const unavailableLoader = await loadPipelinePacketLoader(realFixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
    getWorkPackets: async () => { throw new Error("Supervisor WorkPacket list unavailable"); },
  });
  const unavailable = await unavailableLoader.loadPipelineCockpitPackets();
  assert.equal(unavailable.fixtureMode.kind, "unavailable");
  assert.equal(unavailable.packets.length, 0);
  assert.equal(unavailable.packets.map((packet) => packet.packetId).length, 0);
});

test("source path invariants and case-insensitive synthetic prefixes fail closed", async () => {
  const fixtures = populatedFixtureCatalog();
  for (const [label, packetOverride] of [
    ["restricted-source-path", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], accessState: "blocked", canonical: false, summaryOnly: true, pathOrUrl: "docs/source.md", blockedReason: "blocked by policy" }] }],
    ["restricted-source-url", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], accessState: "missing", canonical: false, summaryOnly: true, pathOrUrl: "https://example.com/source", blockedReason: "missing from backend" }] }],
    ["restricted-source-empty-reason", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], accessState: "excluded", pathOrUrl: null, blockedReason: "" }] }],
    ["allowed-source-blocked-reason", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], blockedReason: "not allowed for an accessible source" }] }],
    ["malformed-source-path", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], pathOrUrl: 42 }] }],
    ["demo-prefixed-packet-id", { packetId: "Demo:synthetic-runtime" }],
    ["demo-prefixed-source-ref", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], refId: "DeMo:source-ref" }] }],
    ["demo-prefixed-source-path", { sourceRefs: [{ ...authoritativeWorkPacket().sourceRefs[0], pathOrUrl: " demo:source-path " }] }],
    ["demo-prefixed-evidence-artifact", { evidenceRefs: [{ ...authoritativeWorkPacket().evidenceRefs[0], artifactPath: "DeMo:evidence-artifact" }] }],
    ["demo-prefixed-artifact-path", { artifactRefs: [{ refId: "artifact:demo", artifactType: "report", label: "Report", pathOrUrl: "DEMO:artifact-path", status: "available" }] }],
  ]) {
    const loader = await loadPipelinePacketLoader(fixtures, {
      getPipelineDashboardProjection: async () => runtimeProjection(["manager-source-authoritative-only"]),
      getWorkPackets: async () => [{ ...authoritativeWorkPacket(), ...packetOverride }],
    });
    const result = await loader.loadPipelineCockpitPackets();
    assert.equal(result.fixtureMode.kind, "invalid", label);
    assert.equal(result.packets.length, 0, label);
  }

  const canonicalRestrictedPacket = authoritativeWorkPacket();
  canonicalRestrictedPacket.sourceRefs = [{
    ...canonicalRestrictedPacket.sourceRefs[0],
    accessState: "blocked",
    canonical: true,
    summaryOnly: true,
    pathOrUrl: null,
    blockedReason: "Canonical source metadata is blocked by policy.",
  }];
  const canonicalRestrictedLoader = await loadPipelinePacketLoader(fixtures, {
    getPipelineDashboardProjection: async () => runtimeProjection([canonicalRestrictedPacket.packetId]),
    getWorkPackets: async () => [canonicalRestrictedPacket],
  });
  const canonicalRestricted = await canonicalRestrictedLoader.loadPipelineCockpitPackets();
  assert.equal(canonicalRestricted.fixtureMode.kind, "runtime");
  assert.equal(canonicalRestricted.packets.length, 1);
});

test("pipeline detail route resolves decoded identity through the direct packet loader", async () => {
  const source = await readFile(detailRoutePath, "utf8");
  assert.match(source, /loadPipelineCockpitPacket\(decodedPacketId\)/);
  assert.doesNotMatch(source, /packets\.find\(/);
  assert.match(source, /decodeURIComponent\(packetId\)/);
  assert.doesNotMatch(source, /generateStaticParams/);
});

test("packet detail exposes canonical supervisor provenance without fixture-only semantics", async () => {
  const source = await readFile(detailComponentPath, "utf8");
  assert.match(source, /Source: Supervisor runtime/);
  assert.match(source, /canonical presentation v1/);
  assert.doesNotMatch(source, /PipelineDashboardPacket|WorkPacketV0View/);
});

test("explicit demo route is the only fixture catalog boundary", async () => {
  const normalRouteSource = await readFile(normalRoutePath, "utf8");
  const demoRouteSource = await readFile(demoRoutePath, "utf8");
  const demoDetailRouteSource = await readFile(demoDetailRoutePath, "utf8");
  const loaderSource = await readFile(loaderPath, "utf8");
  assert.doesNotMatch(normalRouteSource, /pipeline-fixtures/);
  assert.doesNotMatch(normalRouteSource, /manager-execution-lane-summary|selectedManagerExecutionLaneSummary|managerExecutionLane=/);
  assert.match(demoRouteSource, /pipeline-fixtures/);
  assert.match(demoRouteSource, /manager-execution-lane-summary/);
  assert.match(demoRouteSource, /managerExecutionLane=\{selectedManagerExecutionLaneSummary\}/);
  assert.match(demoDetailRouteSource, /pipeline-fixtures/);
  assert.doesNotMatch(loaderSource, /pipeline-fixtures|fixture fallback|fixture_fallback/i);
  assert.match(demoRouteSource, /kind: "demo"/);
  assert.match(demoRouteSource, /sourceKind: "demo-fixture"/);
  assert.match(demoRouteSource, /label: "Demo fixtures"/);
  assert.match(demoDetailRouteSource, /sourceKind: "demo-fixture"/);
  assert.match(demoDetailRouteSource, /cannot satisfy live proof or invoke supervisor authority/);
  assert.match(demoRouteSource, /dashboardDemoRoutesEnabled\(\)/);
  assert.match(demoDetailRouteSource, /dashboardDemoRoutesEnabled\(\)/);
  assert.match(demoRouteSource, /notFound\(\)/);
});

test("dedicated runtime delegates timeout and LAN-auth policy to shared transport", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return {
          normalizePipelineDashboardProjection: (projection) => projection,
          isPipelineDashboardProjection: () => true,
        };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path, options) => {
            assert.equal(path, "/pipeline-control-plane/work-packets");
            assert.equal(options.timeoutMs, 10_000);
            assert.equal(options.rejectServerLanAuth, true);
            throw new Error("Request timed out for /pipeline-control-plane/work-packets");
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });
  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Request timed out for \/pipeline-control-plane\/work-packets/,
  );
});

test("dedicated runtime surfaces canonical list and detail 404s without legacy reads", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            throw new Error(`Request failed for ${path} (404)`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });
  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Request failed for \/pipeline-control-plane\/work-packets \(404\)/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPacket("work_item:packet-1"),
    /Request failed for \/pipeline-control-plane\/work-packets\/work_item%3Apacket-1 \(404\)/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPacket("candidate_work:candidate-1"),
    /Request failed for \/pipeline-control-plane\/work-packets\/candidate_work%3Acandidate-1 \(404\)/,
  );
  assert.deepEqual(calls, [
    "/pipeline-control-plane/work-packets",
    "/pipeline-control-plane/work-packets/work_item%3Apacket-1",
    "/pipeline-control-plane/work-packets/candidate_work%3Acandidate-1",
  ]);
});

test("dedicated runtime fails closed on canonical 404 for authoritative identity", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            throw new Error(`Request failed for ${path} (404)`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  await assert.rejects(
    () => context.module.exports.getWorkPacket("packet-1"),
    /Request failed for \/pipeline-control-plane\/work-packets\/packet-1 \(404\)/,
  );
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets/packet-1"]);
});

test("dashboard WorkItem memory review binds its requested identity and rejects malformed client DTOs", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const review = {
    schemaVersion: "work-item-memory-review/v1",
    workItemId: "work-item-a",
    authoritativePacketId: "packet-a",
    proposals: [{
      proposalRouteId: "cbf78f6d-fb76-4913-a80b-da1692dd9bbd", proposalId: "proposal-a", revision: 1, label: "Review proposal", status: "proposed", summary: "Metadata only.",
      sourceRefs: ["source:work-item-a"], evidenceRefs: ["event:packet-a"], targetVaultPath: null,
      targetVaultFolder: "memory/review", proposalType: "new_note", suggestedContentSummary: "Review summary.",
      patchSummary: null, sensitivity: "low", freshness: "fresh", contradictionStatus: "none",
      confidence: "high", operatorAction: "blocked", decisionNeededContext: null,
      backupRecoveryPath: "memory/recovery/proposal-a", writeBackStatus: "review_gated", writeBackAllowed: false, aiDraftEligible: false, llmWikiArtifactSearchEligible: false,
    }],
    llmWikiReadiness: null,
    metadataOnly: true,
    rawPayloadRetained: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
  };
  const context = {
    exports: {}, module: { exports: {} }, process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      if (specifier === "./dashboard-supervisor-transport") return {
        requestSupervisorJson: async (path) => {
          if (path.endsWith("work-item-a/memory-review")) return review;
          if (path.endsWith("work-item-b/memory-review")) return { ...review, workItemId: "work-item-a" };
          if (path.endsWith("work-item-invalid/memory-review")) return {
            ...review,
            proposals: [{ ...review.proposals[0], targetVaultPath: 42, untrustedNestedPayload: "must not cross the DTO boundary" }],
          };
          if (path.endsWith("work-item-missing/memory-review")) {
            throw new Error(`Request failed for ${path} (404)`);
          }
          if (path.endsWith("work-item-blank/memory-review")) return {
            ...review,
            workItemId: "work-item-blank",
            proposals: [{
              ...review.proposals[0], proposalId: "", label: "", summary: "", sourceRefs: [""], evidenceRefs: [""],
              targetVaultFolder: "", suggestedContentSummary: "", backupRecoveryPath: "",
            }],
          };
          if (path.endsWith("work-item-enum/memory-review")) return {
            ...review,
            workItemId: "work-item-enum",
            proposals: [{ ...review.proposals[0], status: "future_unreviewed_status" }],
          };
          if (path.endsWith("work-item-unsafe-route/memory-review")) return {
            ...review,
            workItemId: "work-item-unsafe-route",
            proposals: [{ ...review.proposals[0], proposalRouteId: "proposal/unsafe" }],
          };
          throw new Error(`Unexpected request ${path}`);
        },
      };
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  const valid = JSON.parse(JSON.stringify(await context.module.exports.getWorkItemMemoryReview("work-item-a")));
  assert.equal(valid.workItemId, "work-item-a");
  assert.equal(valid.proposals[0].targetVaultPath, null);
  assert.equal(await context.module.exports.getWorkItemMemoryReview("work-item-missing"), null);
  assert.equal(await context.module.exports.getWorkItemMemoryReview("work-item-invalid"), null);
  const persistedBlank = JSON.parse(JSON.stringify(await context.module.exports.getWorkItemMemoryReview("work-item-blank")));
  assert.equal(persistedBlank.proposals[0].sourceRefs[0], "");
  await assert.rejects(
    () => context.module.exports.getWorkItemMemoryReview("work-item-b"),
    /identity does not bind its requested WorkItem/,
  );
  assert.equal(await context.module.exports.getWorkItemMemoryReview("work-item-enum"), null);
  assert.equal(await context.module.exports.getWorkItemMemoryReview("work-item-unsafe-route"), null);
});

test("dedicated runtime projects consistent authoritative list and detail without legacy requests", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const projectorSource = await readFile(new URL("../apps/dashboard/src/lib/pipeline-supervisor-projector.ts", import.meta.url), "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const projectorOutput = ts.transpileModule(projectorSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") {
        const projectorContext = { exports: {}, module: { exports: {} } };
        projectorContext.exports = projectorContext.module.exports;
        vm.runInNewContext(projectorOutput, projectorContext, { filename: "pipeline-supervisor-projector.ts" });
        return projectorContext.module.exports;
      }
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [supersededAuthoritativeLifecyclePacket("packet-1")];
            if (path === "/pipeline-control-plane/work-packets/packet-1") return supersededAuthoritativeLifecyclePacket("packet-1");
            throw new Error(`Unexpected legacy request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  const packets = JSON.parse(JSON.stringify(await context.module.exports.getWorkPackets()));
  const packet = JSON.parse(JSON.stringify(await context.module.exports.getWorkPacket("packet-1")));
  assert.equal(packets.length, 1);
  assert.equal(packet.authoritativeLifecycle.packetId, "packet-1");
  assert.equal(packet.canonicalContract, null);
  assert.equal(packet.evidenceChain, null);
  assert.equal(packet.productModeMapping, null);
  const display = packet.presentation;
  assert.equal(display.packetId, "packet-1");
  assert.equal(display.requestedOutcome, "Created from authoritative metadata.");
  assert.equal(display.currentStage, "capture");
  assert.equal(display.currentOwner, "kendall");
  assert.equal(display.lifecycleState.latestTransitionEventRef, "event:created");
  assert.deepEqual(display.sourceRefs.map((ref) => ref.refId), ["doc:source"]);
  assert.equal(display.sourceRefs[0].pathOrUrl, null);
  assert.equal(display.sourceRefs[0].freshness, "stale");
  assert.equal(display.sourceRefs[0].accessState, "blocked");
  assert.equal(
    display.sourceRefs[0].blockedReason,
    "Source is superseded by _bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md.",
  );
  assert.deepEqual(packets[0], packet);
  assert.deepEqual(calls, [
    "/pipeline-control-plane/work-packets",
    "/pipeline-control-plane/work-packets/packet-1",
  ]);
});

test("dashboard canonical DTO carries validated extensions and resolves WorkItem detail without a legacy read", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const canonicalPacket = authoritativeLifecyclePacket("packet-work-item-1");
  canonicalPacket.history[0].eventType = "packet.parallel_work_graph_refreshed";
  canonicalPacket.evidenceChain = supervisorEvidenceChainRead(canonicalPacket.packetId);
  const mismatchedEvidencePacket = {
    ...canonicalPacket,
    evidenceChain: supervisorEvidenceChainRead("packet-work-item-2"),
  };
  const malformedEvidencePacket = {
    ...canonicalPacket,
    evidenceChain: { ...supervisorEvidenceChainRead(canonicalPacket.packetId), chainDigestSha256: "sha256:not-a-digest" },
  };
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") {
        return {
          AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES: runtimeContractValidators.AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES,
          isPipelineCanonicalContractV1: () => false,
          isPipelineProductModeMappingV0: () => false,
          validatePipelineEpic25EvidenceChainV0: () => ["expected v1 read DTO"],
          validatePipelineEpic25EvidenceChainV1: (value) => isSupervisorEvidenceChainBase(value) ? [] : ["invalid supervisor evidence-chain base"],
        };
      }
      if (specifier === "./pipeline-supervisor-projection") return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [canonicalPacket];
            if (path === "/pipeline-control-plane/work-items/work-item-1/packet") return canonicalPacket;
            if (path === "/pipeline-control-plane/work-packets/packet-evidence-mismatch") return mismatchedEvidencePacket;
            if (path === "/pipeline-control-plane/work-items/work-item-malformed/packet") return malformedEvidencePacket;
            if (path === "/pipeline-control-plane/work-items/work-item-missing/packet") throw new Error(`Request failed for ${path} (404)`);
            throw new Error(`Unexpected request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  const listed = JSON.parse(JSON.stringify(await context.module.exports.getWorkPackets()));
  const workItemDetail = JSON.parse(JSON.stringify(await context.module.exports.getWorkPacketForWorkItem("work-item-1")));
  assert.deepEqual(listed[0].authoritativeLifecycle, canonicalPacket);
  assert.equal(workItemDetail.authoritativeLifecycle.history[0].eventType, "packet.parallel_work_graph_refreshed");
  assert.equal(workItemDetail.canonicalContract, null);
  assert.deepEqual(workItemDetail.evidenceChain, canonicalPacket.evidenceChain);
  assert.equal(workItemDetail.productModeMapping, null);
  assert.equal(workItemDetail.presentation.packetId, "packet-work-item-1");
  await assert.rejects(
    () => context.module.exports.getWorkPacket("packet-evidence-mismatch"),
    /Canonical WorkPacket evidenceChain does not bind its authoritative packet identity/,
  );
  assert.equal(await context.module.exports.getWorkPacketForWorkItem("work-item-malformed"), null);
  assert.equal(await context.module.exports.getWorkPacketForWorkItem("work-item-missing"), null);
  assert.deepEqual(calls, [
    "/pipeline-control-plane/work-packets",
    "/pipeline-control-plane/work-items/work-item-1/packet",
    "/pipeline-control-plane/work-packets/packet-evidence-mismatch",
    "/pipeline-control-plane/work-items/work-item-malformed/packet",
    "/pipeline-control-plane/work-items/work-item-missing/packet",
  ]);
});

test("dashboard canonical DTO rejects extension provenance and mode cross-bindings", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const packet = authoritativeLifecyclePacket("packet-extension-bindings");
  const canonicalContract = {
    productMode: "read_only",
    canonicalSource: { provenance: { sourceRef: { ...packet.sourceRef } } },
  };
  const productModeMapping = { requestedProductMode: "read_only" };
  const provenanceMismatch = {
    ...packet,
    canonicalContract: {
      ...canonicalContract,
      canonicalSource: { provenance: { sourceRef: { ...packet.sourceRef, refId: "doc:other-source" } } },
    },
  };
  const modeMismatch = {
    ...packet,
    canonicalContract,
    productModeMapping: { requestedProductMode: "operator_review" },
  };
  const mappingWithoutContract = { ...packet, productModeMapping };
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return {
        AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES: runtimeContractValidators.AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES,
        isPipelineCanonicalContractV1: (value) => value?.canonicalSource?.provenance?.sourceRef?.refId?.startsWith("doc:"),
        isPipelineProductModeMappingV0: (value) => typeof value?.requestedProductMode === "string",
        validatePipelineEpic25EvidenceChainV0: () => ["evidence chain omitted"],
        validatePipelineEpic25EvidenceChainV1: () => ["evidence chain omitted"],
      };
      if (specifier === "./pipeline-supervisor-projection") return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") return {
        requestSupervisorJson: async (path) => {
          if (path.endsWith("packet-provenance-mismatch")) return provenanceMismatch;
          if (path.endsWith("packet-mode-mismatch")) return modeMismatch;
          if (path.endsWith("packet-mapping-without-contract")) return mappingWithoutContract;
          throw new Error(`Unexpected request ${path}`);
        },
      };
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  await assert.rejects(
    () => context.module.exports.getWorkPacket("packet-provenance-mismatch"),
    /canonicalContract provenance does not bind its authoritative source/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPacket("packet-mode-mismatch"),
    /productModeMapping does not match the canonical contract mode/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPacket("packet-mapping-without-contract"),
    /productModeMapping requires its canonical contract/,
  );
});

test("dashboard canonical DTO accepts a structurally valid stale supervisor evidence read and rejects incoherent read posture", async () => {
  const contracts = await loadActualPipelineControlPlaneContracts();
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const packet = authoritativeLifecyclePacket("packet-stale-evidence");
  const staleEvidence = supervisorEvidenceChainRead(packet.packetId);
  const baseEvidence = { ...staleEvidence };
  delete baseEvidence.chainDigestSha256;
  delete baseEvidence.freshnessState;
  delete baseEvidence.effectiveDecision;
  delete baseEvidence.typedBlockers;
  assert.equal(
    contracts.validatePipelineEpic25EvidenceChainV1(baseEvidence, Date.parse(baseEvidence.checkedAt)).length,
    0,
    "the shared contract accepts the exact stale-read base at its recorded check time",
  );
  const freshWithStaleBlocker = { ...staleEvidence, freshnessState: "fresh" };
  const staleWithoutFreshnessReason = { ...staleEvidence, typedBlockers: ["quality_gate_not_passed"] };
  const staleNonHoldDecision = { ...staleEvidence, effectiveDecision: "limited_rollout" };
  const futureDated = { ...staleEvidence, checkedAt: new Date(Date.now() + (2 * 60_000)).toISOString() };
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return contracts;
      if (specifier === "./pipeline-supervisor-projection") return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") return {
        requestSupervisorJson: async (path) => {
          if (path.endsWith("packet-stale-evidence")) return { ...packet, evidenceChain: staleEvidence };
          if (path.endsWith("packet-fresh-stale")) return { ...packet, evidenceChain: freshWithStaleBlocker };
          if (path.endsWith("packet-stale-no-reason")) return { ...packet, evidenceChain: staleWithoutFreshnessReason };
          if (path.endsWith("packet-stale-non-hold")) return { ...packet, evidenceChain: staleNonHoldDecision };
          if (path.endsWith("packet-future-dated")) return { ...packet, evidenceChain: futureDated };
          throw new Error(`Unexpected request ${path}`);
        },
      };
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  const accepted = JSON.parse(JSON.stringify(await context.module.exports.getWorkPacket("packet-stale-evidence")));
  assert.equal(accepted.evidenceChain.freshnessState, "stale");
  assert.deepEqual(accepted.evidenceChain.typedBlockers, ["evidence_chain_stale"]);
  for (const packetId of ["packet-fresh-stale", "packet-stale-no-reason", "packet-stale-non-hold", "packet-future-dated"]) {
    await assert.rejects(() => context.module.exports.getWorkPacket(packetId), /Canonical WorkPacket evidenceChain extension is invalid/);
  }
});

test("dedicated runtime sanitizes unsafe canonical lifecycle summaries and evidence refs before rendering", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const projectorSource = await readFile(new URL("../apps/dashboard/src/lib/pipeline-supervisor-projector.ts", import.meta.url), "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const projectorOutput = ts.transpileModule(projectorSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const unsafeSummaries = [
    "raw prompt: do not render copied instructions",
    "provider payload: do not render provider output",
    "credential token: do not render credential material",
  ];
  const canonicalPackets = unsafeSummaries.map((payloadSummary, index) => {
    const packet = authoritativeLifecyclePacket(`unsafe-summary-${index + 1}`);
    packet.history[0].payloadSummary = payloadSummary;
    return packet;
  });
  canonicalPackets[0].history[0].evidenceRefs = [
    " safe:event-evidence ",
    "provider payload: retained event secret",
    `oversized:${"x".repeat(501)}`,
  ];
  canonicalPackets[0].readyToTest = {
    readyId: "ready:unsafe-summary-1",
    userFacingSummary: "Inspect metadata-only verification evidence.",
    testableSurface: "Dashboard packet detail",
    verificationRefs: [],
    evidenceRefs: [" safe:ready-evidence ", "credential token: retained ready-to-test secret"],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") {
        const projectorContext = { exports: {}, module: { exports: {} } };
        projectorContext.exports = projectorContext.module.exports;
        vm.runInNewContext(projectorOutput, projectorContext, { filename: "pipeline-supervisor-projector.ts" });
        return projectorContext.module.exports;
      }
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return canonicalPackets;
            throw new Error(`Unexpected legacy request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  const packets = JSON.parse(JSON.stringify(await context.module.exports.getWorkPackets())).map((packet) => packet.presentation);
  assert.equal(packets.length, unsafeSummaries.length);
  for (const packet of packets) {
    assert.equal(packet.requestedOutcome, "Redacted metadata-only lifecycle summary.");
    assert.deepEqual(packet.transitionEvents.map((event) => event.summary), ["Redacted metadata-only lifecycle summary."]);
  }
  assert.deepEqual(packets[0].evidenceRefs.map((ref) => ref.refId), [
    "event:created",
    "safe:event-evidence",
    "safe:ready-evidence",
  ]);
  assert.deepEqual(packets[0].transitionEvents[0].evidenceRefs, ["event:created", "safe:event-evidence"]);
  assert.doesNotMatch(JSON.stringify(packets[0]), /provider payload|credential token|oversized:/i);
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets"]);
});

test("pipeline loader strips raw canonical lifecycle fields before cockpit client transport", async () => {
  const lifecycle = authoritativeLifecyclePacket("manager-source-authoritative-only");
  lifecycle.history[0].payloadSummary = "provider payload: raw browser secret";
  lifecycle.history[0].evidenceRefs = ["credential token: raw browser secret"];
  const rawCanonicalPacket = {
    authoritativeLifecycle: lifecycle,
    canonicalContract: { raw: "server-only extension" },
    evidenceChain: { raw: "server-only evidence" },
    productModeMapping: { raw: "server-only mapping" },
    presentation: { schemaVersion: "dashboard-canonical-presentation/v1", ...authoritativeWorkPacket() },
  };
  const projection = runtimeProjection([lifecycle.packetId]);
  projection.rawProviderResponse = "python-only extension";
  projection.workPackets[0].canonicalContract = { extra: "server-only extension" };
  projection.workPackets[0].productModeMapping = { extra: "server-only extension" };
  projection.workPackets[0].rawProviderResponse = "python-only extension";
  projection.workPackets[0].sourceRef = { refId: "doc:packet", sourceType: "workflow", pathOrUrl: null, title: "Packet", contentSha256: null, rawProviderResponse: "python-only extension" };
  projection.backendReachability.checkedAt = "2026-08-17T00:00:00.000Z";
  projection.fixtureMode.enabled = false;
  projection.managerSummary = { stateSource: "supervisor_projection", activeLeaseCount: 2, freshnessState: "live" };
  projection.workerSummary = { stateSource: "supervisor_projection", workerRefs: ["worker:1"], freshnessState: "live" };
  projection.queueSummary = { activeCount: 1, dispatchableCount: 2, closedCount: 3, staleCount: 4, refillingCount: 5, unknownCount: 6, emptyReason: null };
  const rawWorkGraph = {
    schemaVersion: "parallel-work-graph-evidence/v0",
    sourceSchemaVersion: "parallel-execution-graph-reservation/v1",
    availability: "available",
    packetId: lifecycle.packetId,
    executionJobId: "execution-job:canonical-loader",
    reportIdentity: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    generatedAt: "2026-08-17T00:00:00.000Z",
    freshnessState: "live",
    waveMembership: "selected",
    dependencyState: "clear",
    reservation: { status: "advisory_reserved", owner: "operator", reasonCode: "independent_surface" },
    capacity: { posture: "normal", reasonCode: "capacity_normal" },
    reason: "The packet is in the advisory wave.",
    nextSafeAction: "Inspect the existing authority gates before any future action.",
    evidenceRefs: ["evidence:parallel-wave"],
    metadataOnly: true,
    rawPayloadRetained: false,
    retention: "metadata_only_evidence_references",
  };
  projection.selectedPacketDetails = [{
    packetId: lifecycle.packetId,
    canonicalContract: { extra: "server-only extension" },
    productModeMapping: { extra: "server-only extension" },
    rawProviderResponse: "python-only extension",
    actionCapabilities: [{
      actionId: "mark_tested", targetType: "work_packet", targetId: lifecycle.packetId,
      capabilityState: "available", authorityState: "allowed", riskTier: "low", typedReason: null,
      expectedResultSummary: "Record the operator test.", correlationRequired: true, idempotencyRequired: true,
      evidenceRefs: [], metadataOnly: true, rawPayloadRetained: false, summary: "wrong-shape collision secret",
    }],
    actionResults: [{
      schemaVersion: "pipeline-operational-action/v0", actionId: "mark_tested", targetType: "work_packet", targetId: lifecycle.packetId,
      outcome: "accepted", resultingStage: "review", resultingStatus: "waiting", capabilityState: "available",
      authorityState: "allowed", riskTier: "low", typedReason: null, evidenceRefs: [], correlationId: "correlation:test",
      idempotencyKey: "idempotency:test", actionRecordId: "action:test", metadataOnly: true, rawPayloadRetained: false,
      summary: "wrong-shape collision secret",
    }],
    actionResultsV1: [{ summary: "wrong-shape collision secret" }],
    workGraph: { ...rawWorkGraph, rawProviderResponse: "wrong-shape work-graph secret" },
  }];
  const loader = await loadPipelinePacketLoader(populatedFixtureCatalog(), {
    getPipelineDashboardProjection: async () => projection,
    getWorkPackets: async () => [rawCanonicalPacket],
  });

  const result = await loader.__canonicalListForTest();
  const clientPacket = JSON.parse(JSON.stringify(result.canonicalPackets[0]));
  assert.deepEqual(Object.keys(clientPacket).sort(), ["presentation"]);
  assert.equal(clientPacket.presentation.schemaVersion, "dashboard-canonical-presentation/v1");
  assert.equal(result.operationalProjection.schemaVersion, "dashboard-canonical-operational-projection/v1");
  assert.doesNotMatch(JSON.stringify(clientPacket), /provider payload|credential token|server-only/i);
  assert.equal(clientPacket.presentation.packetId, lifecycle.packetId);
  assert.equal(result.operationalProjection.workPackets[0].canonicalContract, null);
  assert.equal(result.operationalProjection.workPackets[0].productModeMapping, null);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].canonicalContract, null);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].productModeMapping, null);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].actionCapabilities[0].summary, undefined);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].actionResults[0].summary, undefined);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].actionResultsV1, undefined);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].workGraph.schemaVersion, "dashboard-canonical-work-graph/v1");
  assert.equal(result.operationalProjection.selectedPacketDetails[0].workGraph.rawPayloadRetained, false);
  assert.equal(result.operationalProjection.selectedPacketDetails[0].workGraph.rawProviderResponse, undefined);
  assert.equal(result.operationalProjection.backendReachability.checkedAt, "2026-08-17T00:00:00.000Z");
  assert.equal(result.operationalProjection.managerSummary.activeLeaseCount, 2);
  assert.deepEqual(result.operationalProjection.workerSummary.workerRefs, ["worker:1"]);
  assert.equal(result.operationalProjection.queueSummary.dispatchableCount, 2);
  assert.doesNotMatch(JSON.stringify(result.operationalProjection), /python-only extension/i);
  assert.doesNotMatch(JSON.stringify(result.operationalProjection), /rawProviderResponse/i);
});

test("canonical dashboard presentation rejects unknown root and nested fields before cockpit rendering", async () => {
  const packet = authoritativeWorkPacket();
  const presentation = {
    schemaVersion: "dashboard-canonical-presentation/v1",
    packetId: packet.packetId,
    title: packet.title,
    requestedOutcome: packet.requestedOutcome,
    currentStage: packet.currentStage,
    currentOwner: packet.currentOwner,
    status: packet.status,
    lifecycleState: packet.lifecycleState,
    riskLevel: packet.riskLevel,
    priority: packet.priority,
    sourceRefs: packet.sourceRefs,
    evidenceRefs: packet.evidenceRefs,
    transitionEvents: packet.transitionEvents,
  };
  const loader = await loadPipelinePacketLoader(populatedFixtureCatalog(), {});

  const accepted = loader.__projectCanonicalPresentationsForTest([presentation]);
  assert.equal(accepted.kind, "runtime");
  assert.equal(accepted.packets[0].schemaVersion, "dashboard-canonical-presentation/v1");
  assert.equal(accepted.packets[0].packetId, packet.packetId);
  assert.equal(accepted.packets[0].executionAttempts.length, 0);
  assert.equal(accepted.packets[0].humanGateActions.length, 0);
  assert.equal(Object.hasOwn(accepted.packets[0], "candidateWork"), false);
  assert.equal(Object.hasOwn(accepted.packets[0], "memoryProposals"), false);
  assert.equal(Object.hasOwn(accepted.packets[0], "artifactRefs"), false);
  assert.equal(Object.hasOwn(accepted.packets[0], "humanGateActionRequests"), false);

  const unknownRoot = loader.__projectCanonicalPresentationsForTest([{ ...presentation, rawProviderResponse: "server-only" }]);
  assert.equal(unknownRoot.kind, "invalid");
  const legacyV0Root = loader.__projectCanonicalPresentationsForTest([{ ...presentation, memoryProposals: [{ raw: "server-only" }] }]);
  assert.equal(legacyV0Root.kind, "invalid");
  const unknownNested = loader.__projectCanonicalPresentationsForTest([{
    ...presentation,
    evidenceRefs: [{ ...presentation.evidenceRefs[0], rawProviderResponse: "server-only" }],
  }]);
  assert.equal(unknownNested.kind, "invalid");
});

test("dedicated runtime treats a successful empty canonical list as authoritative", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [];
            throw new Error(`Unexpected legacy request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  assert.deepEqual(await context.module.exports.getWorkPackets(), []);
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets"]);
});

test("dedicated runtime rejects malformed canonical list actors without legacy reads", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const malformedPackets = [undefined, "manager"].map((actor, index) => {
    const packet = authoritativeLifecyclePacket(`malformed-actor-${index + 1}`);
    if (actor === undefined) delete packet.history[0].actor;
    else packet.history[0].actor = actor;
    return packet;
  });
  const calls = [];
  let canonicalIndex = 0;
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [malformedPackets[canonicalIndex++]];
            throw new Error(`Unexpected request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  assert.deepEqual(calls, [
    "/pipeline-control-plane/work-packets",
    "/pipeline-control-plane/work-packets",
  ]);
});

test("dedicated runtime rejects malformed canonical ready-to-test evidence without legacy reads", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const malformedPackets = [
    42,
    { evidenceRefs: 42 },
    { readyId: "ready:partial", evidenceRefs: [], metadataOnly: true, rawPayloadRetained: false },
  ].map((readyToTest, index) => {
    const packet = authoritativeLifecyclePacket(`malformed-ready-to-test-${index + 1}`);
    packet.readyToTest = readyToTest;
    return packet;
  });
  const calls = [];
  let canonicalIndex = 0;
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [malformedPackets[canonicalIndex++]];
            throw new Error(`Unexpected request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  assert.deepEqual(calls, [
    "/pipeline-control-plane/work-packets",
    "/pipeline-control-plane/work-packets",
    "/pipeline-control-plane/work-packets",
  ]);
});

test("dedicated runtime does not legacy-fallback unsafe slash-containing packet ids", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets/foo%2Flearn-follow-up-candidate-work") {
              throw new Error(`Request failed for ${path} (404)`);
            }
            throw new Error(`Unexpected legacy fallback for ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });
  await assert.rejects(
    () => context.module.exports.getWorkPacket("foo/learn-follow-up-candidate-work"),
    /Request failed for \/pipeline-control-plane\/work-packets\/foo%2Flearn-follow-up-candidate-work \(404\)/,
  );
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets/foo%2Flearn-follow-up-candidate-work"]);
});

test("dedicated runtime fails closed without legacy fallback when canonical packet payload is malformed", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: (value) => value?.shape === "valid" };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets/packet-1") return { packetId: "packet-1", lifecycle: [] };
            throw new Error(`Unexpected request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });
  await assert.rejects(
    () => context.module.exports.getWorkPacket("packet-1"),
    /Canonical WorkPacket detail response is not authoritative lifecycle-shaped/,
  );
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets/packet-1"]);
});

test("dedicated runtime surfaces malformed canonical list results without legacy reads", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [{ packetId: "malformed-canonical" }];
            throw new Error(`Unexpected request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });

  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets"]);
});

test("dedicated runtime rejects V0-shaped canonical lists without legacy merge", async () => {
  const runtimeSource = await readFile(runtimePath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(runtimeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") return runtimeContractValidators;
      if (specifier === "./pipeline-supervisor-projection") {
        return { normalizePipelineDashboardProjection: (projection) => projection, isPipelineDashboardProjection: () => true };
      }
      if (specifier === "./pipeline-supervisor-projector") return { isWorkPacketV0View: () => true };
      if (specifier === "./dashboard-supervisor-transport") {
        return {
          requestSupervisorJson: async (path) => {
            calls.push(path);
            if (path === "/pipeline-control-plane/work-packets") return [{ shape: "valid", packetId: "canonical-1", title: "Canonical" }];
            throw new Error(`Unexpected request ${path}`);
          },
        };
      }
      throw new Error(`Unexpected runtime import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-supervisor-runtime.ts" });
  await assert.rejects(
    () => context.module.exports.getWorkPackets(),
    /Canonical WorkPacket response is not authoritative lifecycle-shaped/,
  );
  assert.deepEqual(calls, ["/pipeline-control-plane/work-packets"]);
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

function authoritativeLifecyclePacket(packetId) {
  const occurredAt = "2026-08-13T12:00:00.000Z";
  const sourceRef = {
    refId: "doc:source",
    sourceType: "repo_doc",
    pathOrUrl: "docs/source.md",
    title: "Source metadata",
  };
  return {
    packetId,
    title: "Authoritative lifecycle packet",
    currentStage: "capture",
    status: "waiting",
    truthLabel: "source_owned",
    sourceRef,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    currentEventId: "created",
    parentPacketId: null,
    lineageKind: "root",
    readyToTest: null,
    operatorTestState: "not_ready",
    operatorTestNote: null,
    history: [{
      eventId: "created",
      packetId,
      schemaVersion: 1,
      eventType: "packet.created",
      previousStage: null,
      targetStage: "capture",
      status: "waiting",
      truthLabel: "source_owned",
      sourceRef,
      actor: { actorType: "manager", actorId: "manager-1", actorLabel: "Manager" },
      occurredAt,
      correlationId: "correlation-1",
      causationId: null,
      idempotencyKey: "packet-created-1",
      payloadSummary: "Created from authoritative metadata.",
      evidenceRefs: ["source:doc:source"],
      metadataOnly: true,
    }],
    metadataOnly: true,
  };
}

function supervisorEvidenceChainRead(authoritativePacketId) {
  // Keep the base record genuinely stale at runtime while validating it at its
  // own observation time. The dashboard must accept that retained read DTO,
  // but reject an observation timestamp forged ahead of the local clock.
  const checkedAt = new Date(Date.now() - (10 * 60_000)).toISOString();
  const expiresAt = new Date(Date.now() - (6 * 60_000)).toISOString();
  const retentionExpiresAt = new Date(Date.parse(checkedAt) + (30 * 24 * 60 * 60_000)).toISOString();
  const targetRevision = "a".repeat(40);
  const outcomes = { readiness: "no_go", canary: "hold", ramp: "hold", recovery: "hold", hardening: "hold", decision: "hold" };
  const schemas = {
    readiness: "pipeline-operational-readiness-contract/v0",
    canary: "pipeline-one-worker-live-canary/v0",
    ramp: "pipeline-live-capacity-ramp/v0",
    recovery: "pipeline-resilience-recovery-validation/v0",
    hardening: "pipeline-operational-hardening-runbooks/v0",
    decision: "pipeline-production-readiness-decision/v0",
  };
  const packets = {};
  let predecessorPacketId = null;
  for (const slot of Object.keys(schemas)) {
    const packetId = `epic25-${slot}`;
    const details = slot === "readiness"
      ? { kind: slot, backendTruth: "dry_run", authorityState: "blocked", gateCount: 10, thresholdsComplete: false, telemetryReady: false, rollbackReady: true, recoveryReady: true, configurationValid: true }
      : slot === "canary"
        ? { kind: slot, workerCount: 1, backendTruth: "dry_run", leaseState: "blocked", checkpointState: "blocked", measurementsComplete: false, canaryAuthorityProven: false, rampAllowed: false }
        : slot === "ramp"
          ? { kind: slot, canaryPacketId: packets.canary.packetId, canaryOutcome: packets.canary.outcome, stageWorkerCounts: [1, 2, 4, 6], stageOutcomes: ["hold", "hold", "hold", "hold"], scaleEvidenceReady: false }
          : slot === "recovery"
            ? { kind: slot, rampPacketId: packets.ramp.packetId, predecessorOutcome: packets.ramp.outcome, drillCount: 1, allDrillsPassed: false, idempotencyProven: false, silentRetryObserved: false, reliabilityEvidenceReady: false }
            : slot === "hardening"
              ? { kind: slot, recoveryPacketId: packets.recovery.packetId, predecessorOutcome: packets.recovery.outcome, domainCount: 1, unresolvedHighRiskGap: true, readinessHandoffReady: false }
              : { kind: slot, predecessorPacketIds: Object.fromEntries(["canary", "ramp", "recovery", "hardening"].map((name) => [name, packets[name].packetId])), predecessorOutcomes: Object.fromEntries(["canary", "ramp", "recovery", "hardening"].map((name) => [name, packets[name].outcome])), authorityReady: false, simulatedEvidence: true, staleEvidence: false, fixtureEvidence: false };
    packets[slot] = {
      slot,
      packetId,
      packetSchemaVersion: schemas[slot],
      predecessorPacketId,
      evidenceClass: "integrated_local",
      outcome: outcomes[slot],
      sourceRefs: ["prd:epic25"],
      evidenceRefs: [`evidence:${slot}`],
      checkedAt,
      expiresAt,
      observedEvidenceAttestation: null,
      details,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
    predecessorPacketId = packetId;
  }
  return {
    schemaVersion: "pipeline-epic-25-evidence-chain/v1",
    authoritativePacketId,
    evidenceClass: "integrated_local",
    packets,
    checkedAt,
    expiresAt,
    executionAllowed: false,
    providerCallsAllowed: false,
    mutationAllowed: false,
    metadataOnly: true,
    rawPayloadRetained: false,
    policyProfile: {
      schemaVersion: "pipeline-epic-25-policy-profile/v0",
      targetRevision,
      checkedAt,
      expiresAt,
      qualityGates: ["security", "retention", "rollback", "runbook", "telemetry", "recovery"].map((family) => ({
        family,
        requirement: family === "runbook" ? "not_applicable" : "required",
        state: family === "runbook" ? "not_applicable" : "pass",
        typedReason: null,
        nextSafeAction: family === "runbook" ? "No action is required." : "Preserve passing evidence and continue review.",
        notApplicableReason: family === "runbook" ? "Runbook publication is outside this validation target." : null,
        targetRevision,
        checkedAt,
        expiresAt,
        evidenceRefs: [`evidence:${family}-gate`],
      })),
      retentionPolicy: {
        sourceOwner: "epic25-source-owner",
        toolOwner: "supervisor",
        disposition: "metadata_only",
        redactionState: "verified_redacted",
        expiresAt: retentionExpiresAt,
        retentionPeriodDays: 30,
        disposalAction: "delete_metadata",
        verificationStatus: "verified",
        policyReason: "Retain bounded validation metadata for audit and then dispose it.",
        evidenceRefs: ["evidence:retention-policy"],
        metadataOnly: true,
        rawPayloadRetained: false,
      },
      executionAllowed: false,
      providerCallsAllowed: false,
      mutationAllowed: false,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    chainDigestSha256: `sha256:${"b".repeat(64)}`,
    freshnessState: "stale",
    effectiveDecision: "hold",
    typedBlockers: ["evidence_chain_stale"],
  };
}

function isSupervisorEvidenceChainBase(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    value.schemaVersion === "pipeline-epic-25-evidence-chain/v1" &&
    typeof value.authoritativePacketId === "string" &&
    value.evidenceClass === "integrated_local" &&
    value.packets && typeof value.packets === "object" &&
    value.policyProfile && typeof value.policyProfile === "object" &&
    typeof value.checkedAt === "string" && typeof value.expiresAt === "string" &&
    value.executionAllowed === false && value.providerCallsAllowed === false && value.mutationAllowed === false &&
    value.metadataOnly === true && value.rawPayloadRetained === false &&
    !("chainDigestSha256" in value) && !("freshnessState" in value) &&
    !("effectiveDecision" in value) && !("typedBlockers" in value));
}

function supersededAuthoritativeLifecyclePacket(packetId) {
  const packet = authoritativeLifecyclePacket(packetId);
  const sourceRef = {
    refId: "doc:source",
    sourceType: "prd",
    pathOrUrl: "C:\\workspace\\_bmad-output\\planning-artifacts\\prds\\prd-Kendall_Nxt-2026-07-02\\prd.md",
    title: "Superseded source metadata",
  };
  packet.sourceRef = sourceRef;
  packet.history[0].sourceRef = sourceRef;
  return packet;
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

function authoritativeOptionalWorkPacketSources() {
  const profile = {
    workItemId: "work-item:authoritative",
    stepId: "step:inspect-source",
    taskKind: "source_inspection",
    phase: null,
    riskLevel: "low",
    privacyLevel: "internal",
    writeScope: "none",
    allowedPaths: ["docs/source.md"],
    contextNeed: "bounded",
    reasoningNeed: "standard",
    determinismNeed: "high",
    validationExpectations: ["Inspect source metadata."],
    preferredLanes: ["utility"],
    forbiddenLanes: ["premium"],
    escalationTriggers: ["Source becomes unavailable."],
  };
  return {
    candidateWork: {
      id: "candidate:authoritative",
      title: "Inspect authoritative source",
      requestedOutcome: "Confirm persisted source metadata.",
      source: "operator",
      sourceArtifactPath: "docs/source.md",
      sourceArtifactType: "manual_note",
      riskLevel: "low",
      priority: "normal",
      sortOrder: 1,
      status: "approved",
      createdAt: "2026-07-13T12:00:00.000Z",
      updatedAt: "2026-07-13T12:00:00.000Z",
      approvedAt: "2026-07-13T12:00:00.000Z",
      promotedWorkItemId: "work-item:authoritative",
      sourceSummary: {
        label: "Operator source",
        summary: "Source metadata is available.",
        sourceType: "operator",
        sourceRef: "doc:source",
        sourceArtifactPath: "docs/source.md",
        freshness: "fresh",
        accessState: "allowed",
        retentionPolicy: "metadata_only",
        boundarySummary: "Read-only source metadata.",
        evidenceRefs: ["event:created"],
        approvalStatus: "approved",
        approvedBy: "Operator",
        approvedAt: "2026-07-13T12:00:00.000Z",
      },
      importMetadata: { imported: true, sourceOrder: 1, note: null },
    },
    workItem: {
      id: "work-item:authoritative",
      title: "Inspect authoritative source",
      requestedOutcome: "Confirm persisted source metadata.",
      source: "operator",
      details: null,
      riskLevel: "low",
      metadata: { candidateWorkId: "candidate:authoritative", readOnly: true },
      origin: "supervisor",
      state: "ready",
      lane: "implementation",
      assigneeId: null,
      assigneeLabel: null,
      ageMinutes: 1,
      needsAttention: false,
      attentionReason: null,
      escalatedAt: null,
      escalationReason: null,
      escalatedByLabel: null,
      statusSummary: "Ready for read-only inspection.",
      blockedReason: null,
      nextStep: "Inspect source metadata.",
      selfDetectedIssue: false,
      selfDetectedIssueCategory: null,
      executionRecipe: {
        id: "recipe:source-inspection",
        label: "Source inspection",
        summary: "Inspect source metadata without mutation.",
        branchPrefix: "inspect-",
        allowedPaths: ["docs/source.md"],
        implementationCommands: [],
        verificationCommands: ["git diff --check"],
        policyGates: [{
          id: "gate:readonly",
          label: "Read-only",
          requiredBefore: "inspection",
          summary: "No source mutation.",
          evidence: ["event:created"],
        }],
        operatorCheckpoints: [],
        autonomyNotes: ["Read-only only."],
        remoteAutomationPolicy: {
          status: "blocked",
          summary: "Remote operations are not allowed.",
          allowedOperations: [],
          blockedOperations: ["push"],
          approvalRequirements: ["Operator approval."],
        },
      },
      deliveryReadiness: {
        pullRequestStatus: "not_started",
        pullRequestUrl: null,
        ciStatus: "not_started",
        mergeStatus: "not_started",
        deliveryWaived: false,
        deliveryWaiverReason: null,
        remoteOperationsPerformed: false,
        remoteOperationsPolicy: "No remote operations.",
        readyForApproval: false,
      },
      createdAt: "2026-07-13T12:00:00.000Z",
      updatedAt: "2026-07-13T12:00:00.000Z",
      lastEventAt: "2026-07-13T12:00:00.000Z",
      requiresAudit: false,
      auditMode: "none",
    },
    taskPacket: {
      workItemId: "work-item:authoritative",
      title: "Inspect authoritative source",
      requestedOutcome: "Confirm persisted source metadata.",
      source: "operator",
      sourceArtifactPath: "docs/source.md",
      taskKind: "source_inspection",
      riskLevel: "low",
      priority: "normal",
      approvalMode: "read_only",
      verificationSummary: "Inspect source metadata and preserve evidence.",
    },
    routingPreview: {
      profile,
      decision: {
        decisionId: "decision:source-inspection",
        workItemId: "work-item:authoritative",
        stepId: "step:inspect-source",
        createdAt: "2026-07-13T12:00:00.000Z",
        profileSnapshot: { ...profile },
        selectedLane: "utility",
        selectedWorkerId: null,
        authorityMode: "read_only",
        confidenceScore: 0.9,
        confidenceBand: "high",
        reasonCodes: ["route.read_only"],
        rejectedLanes: [{ lane: "premium", rejectionCodes: ["authority.blocked"], explanation: "Paid execution is not needed." }],
        rejectedWorkers: [],
        permissionSummary: "Read-only inspection only.",
        escalationPath: ["operator"],
        humanExplanation: "Utility lane preserves the source boundary.",
      },
    },
  };
}

function authoritativeHumanGateAction() {
  return {
    actionId: "action:approve-route",
    type: "approve_route",
    family: "Approve",
    label: "Approve route",
    uiCopy: "Approve the bounded route.",
    status: "available",
    authorityFamily: "route-approval",
    payload: {
      packetId: "manager-source-authoritative-only",
      actionId: "action:approve-route",
      decisionId: "decision:approve-route",
    },
    requiredEvidenceRefs: ["event:created"],
    stopLines: ["Stop before execution."],
    rollbackPath: "Return to route review.",
    resultingStage: "shape",
    resultingOwner: "kendall",
    auditEventType: "route_approved",
    reasonCodes: ["route.approved"],
  };
}

function authoritativeNestedWorkPacketCollections(packetId) {
  const humanGateAction = authoritativeHumanGateAction();
  return {
    humanGateActions: [humanGateAction],
    humanGateActionRequests: [{
      requestId: "request:approve-route",
      packetId,
      actionId: humanGateAction.actionId,
      decisionId: humanGateAction.payload.decisionId,
      requestedActionType: humanGateAction.type,
      requestDisplayLabel: "Approve route",
      requestedByLabel: "Operator",
      requestedAt: "2026-07-13T12:00:00.000Z",
      status: "recorded",
      auditEventType: "route_approval_requested",
      evidenceRefs: ["event:created"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      executionStarted: false,
      resultingStateApplied: false,
      stopLines: ["Stop before execution."],
      rollbackPath: "Return to route review.",
    }],
    laneCards: [{
      laneId: "lane:local-readonly",
      laneType: "local_readonly",
      label: "Local read-only",
      status: "available",
      summary: "Read-only inspection is available.",
      currentOwner: "kendall",
      routeConfidence: 0.82,
      reasonCodes: ["lane.readonly"],
      evidenceRefs: ["event:created"],
      artifactRefs: [],
    }],
    memoryProposals: [{
      proposalId: "memory-proposal:authoritative",
      packetId,
      label: "Review authoritative memory proposal",
      status: "pending_human_approval",
      summary: "Metadata-only proposal for operator review.",
      sourceRefs: ["doc:source"],
      evidenceRefs: ["event:created"],
      targetRef: null,
      targetVaultPath: null,
      targetVaultFolder: "Kendall/Decisions",
      proposalType: "decision_record",
      suggestedContentSummary: "Record the bounded source decision.",
      patchSummary: null,
      sensitivity: "low",
      freshness: "fresh",
      contradictionStatus: "none",
      confidence: "high",
      operatorAction: "approve",
      decisionNeededContext: null,
      backupRecoveryPath: "Discard the proposal without mutating memory.",
      writeBackStatus: "review_gated",
      writeBackAllowed: false,
    }],
    reviewSummaries: [{
      reviewer: "claude_reviewer",
      status: "complete",
      summary: "Read-only review complete.",
      evidenceRefs: ["review:complete"],
      artifactRefs: ["artifact:review"],
    }],
    recoveryActions: [{
      actionId: "action:retry-smaller",
      actionType: "retry_smaller",
      label: "Retry smaller",
      availability: "available",
      consequence: "Return to a smaller bounded packet.",
      resultingStage: "shape",
      resultingOwner: "kendall",
      evidenceRefs: ["event:created"],
    }],
    executionAttempts: [{
      attemptId: "attempt:authoritative",
      workItemId: "work-item:authoritative",
      leaseId: null,
      fencingToken: null,
      routeDecisionId: "decision:approve-route",
      workerId: "worker:none",
      lane: "local_readonly",
      authorityMode: "none",
      status: "planned",
      requestedById: null,
      requestedByLabel: "Operator",
      createdAt: "2026-07-13T12:00:00.000Z",
      updatedAt: "2026-07-13T12:00:00.000Z",
      startedAt: null,
      completedAt: null,
      heartbeatAt: null,
      timeoutAt: null,
      cancelRequestedAt: null,
      cancelReason: null,
      rejectionReason: null,
      failureReason: null,
      evidenceRefs: ["event:created"],
      artifactRefs: [],
    }],
    transitionEvents: [{
      eventId: "transition:created",
      eventType: "packet_created",
      summary: "Packet entered capture.",
      createdAt: "2026-07-13T12:00:00.000Z",
      sourceStage: null,
      targetStage: "capture",
      sourceOwner: null,
      targetOwner: "kendall",
      sourceStatus: null,
      targetStatus: "waiting",
      reasonCodes: ["packet.created"],
      evidenceRefs: ["event:created"],
      durable: true,
      sourceEventId: null,
      actorLabel: "Supervisor",
    }],
    loopStopStates: [{
      stopStateId: "stop:scope-boundary",
      kind: "scope_boundary",
      label: "Scope boundary",
      phase: "capture",
      severity: "info",
      summary: "The packet remains bounded.",
      stopLine: "Do not expand execution authority.",
      nextSafeAction: "Continue read-only review.",
      evidenceRefs: ["event:created"],
      metadataOnly: true,
      sourceMutationAllowed: false,
      providerCallsAllowed: false,
      workerLaunchAllowed: false,
      githubMutationAllowed: false,
      cleanupAllowed: false,
    }],
  };
}

function authoritativeDeliveryEvidence() {
  return {
    evidenceId: "delivery:authoritative",
    mode: "metadata_only",
    status: "ready",
    readyForApproval: false,
    hasDeliveryExecutionEvidence: false,
    evidenceRefs: ["event:created"],
    artifactRefs: [],
    retainedEvidence: ["event:created"],
    blockedReasons: [],
    recoveryPath: "Return to delivery review.",
    deliveryRailsGrantAuthority: false,
    rawPayloadRetained: false,
    remoteMutationApproved: false,
    mergeApproved: false,
    cleanupApproved: false,
  };
}

function authoritativeCleanupDryRunGate(overrides = {}) {
  return {
    status: "blocked",
    dryRunMatchesPolicy: false,
    expectedPr: null,
    expectedOwner: null,
    expectedWorktree: null,
    expectedLocalBranch: null,
    expectedRemoteBranch: null,
    expectedHeadRevision: null,
    blockedReasons: [],
    recoveryPath: "Return to cleanup review.",
    metadataOnly: true,
    cleanupApproved: false,
    ...overrides,
  };
}

function authoritativeAlphaMemorySourceStatus() {
  return {
    statusId: "memory-source-status:authoritative",
    authorityFamily: "memory-writeback-and-source-mutation",
    operationMode: "read_only",
    decisionState: "ready",
    retentionClass: "metadata_only",
    sourceRefs: ["doc:source"],
    targetMetadata: { label: "Operator memory target" },
    backupPath: "docs/memory-backup.md",
    rollbackPath: "docs/memory-rollback.md",
    auditEventSummary: "Metadata-only memory source status.",
    blockedReasons: [],
    recoveryOptions: ["Return to memory review."],
    evidenceRefs: ["event:created"],
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
  };
}

function authoritativeLlmWikiReadiness(overrides = {}) {
  return {
    statusId: "llm-wiki-readiness:authoritative",
    operationMode: "read_only",
    decisionState: "ready",
    canonicality: "derived_disposable_rebuildable",
    retentionClass: "metadata_only",
    sourceRefs: ["doc:source"],
    evidenceRefs: ["event:created"],
    memoryProposalRefs: ["memory-proposal:authoritative"],
    allowedInputs: ["doc:source"],
    blockedReasons: [],
    nextActions: ["Review derived readiness."],
    boundarySummary: "Derived read-only readiness metadata.",
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    durableWriteAllowed: false,
    ...overrides,
  };
}

function authoritativeLlmWikiRebuildDryRunPlan(overrides = {}) {
  return {
    planId: "llm-wiki-rebuild-dry-run-plan:authoritative",
    operationMode: "dry_run",
    inputRefs: ["doc:source"],
    memoryProposalRefs: ["memory-proposal:authoritative"],
    plannedDerivedSections: ["approved-memory-proposals"],
    disposableTargetNamespace: "derived://llm-wiki/dry-run/authoritative",
    derivedTargetFolder: "llm-wiki/derived",
    freshness: "fresh",
    rebuildBasis: ["approved-memory-proposals"],
    retentionClass: "metadata_only",
    stopLines: ["Do not write the canonical source."],
    discardRecoveryPath: "Discard the derived dry-run plan and return to review.",
    auditEventSummary: "Metadata-only derived rebuild plan.",
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    durableWriteAllowed: false,
    writePerformed: false,
    backupCreated: false,
    ...overrides,
  };
}

function authoritativeLearnOutcome() {
  return {
    outcomeId: "learn-outcome:authoritative",
    status: "accepted",
    retentionClass: "metadata_only",
    learningProposalCount: 1,
    documentationProposalStatus: "approved",
    automationAuthorityChangeStatus: "not_requested",
    blockedWriteBackState: "review_gated",
    nextSafeAction: "Retain metadata-only learning evidence.",
    decisionRecords: [{
      decisionId: "learn-decision:authoritative",
      proposalId: "memory-proposal:authoritative",
      proposalType: "decision_record",
      actor: "operator",
      result: "approved",
      operatorAction: "approve",
      evidenceRefs: ["event:created"],
      recoveryPath: "Reopen learn review.",
      writeBackStatus: "review_gated",
      canonicalMutationAllowed: false,
      durableWriteAllowed: false,
    }],
    evidenceRefs: ["event:created"],
    sourceRefs: ["doc:source"],
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    durableWriteAllowed: false,
  };
}

function authoritativeLearnRefill() {
  return {
    projectionId: "learn-refill:authoritative",
    retentionClass: "metadata_only",
    followUpCandidates: [{
      followUpId: "follow-up:authoritative",
      candidateWorkId: "candidate:authoritative",
      label: "Authoritative follow-up",
      sourcePacketId: "manager-source-authoritative-only",
      reason: "Quality follow-up.",
      status: "not_created",
      origin: "quality",
      reentryPath: "reenter_capture",
      evidenceRefs: ["event:created"],
      metadataOnly: true,
      rawPayloadRetained: false,
    }],
    operatorOwnedExits: [],
    refillSourceState: {
      state: "healthy",
      operationalLabel: "Healthy",
      explanation: "Authoritative source remains available.",
      sourceRefs: ["doc:source"],
      evidenceRefs: ["event:created"],
      metadataOnly: true,
    },
    housekeeping: {
      status: "complete",
      summary: "Metadata-only housekeeping complete.",
      evidenceRefs: ["event:created"],
      metadataOnly: true,
    },
    sourceExhaustion: {
      exhausted: false,
      summary: "Source is not exhausted.",
      sourceRefs: ["doc:source"],
      evidenceRefs: ["event:created"],
      metadataOnly: true,
    },
    readyToTest: {
      readyId: "ready:authoritative",
      userFacingSummary: "Ready for focused verification.",
      testableSurface: "/pipeline",
      verificationRefs: ["check:loader"],
      evidenceRefs: ["event:created"],
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    nextSafeAction: "Run focused verification.",
    rawPayloadRetained: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
  };
}

function authoritativeGateStateValidation() {
  return {
    status: "matched",
    storedStage: "capture",
    derivedStage: "capture",
    storedOwner: "kendall",
    derivedOwner: "kendall",
    storedStatus: "waiting",
    derivedStatus: "waiting",
    eventCount: 1,
    latestEventType: "packet_created",
    replayedEventTypes: ["packet_created"],
    mismatchReasons: [],
    blockedReasons: [],
    refStates: [{
      refId: "event:created",
      refType: "event",
      state: "allowed",
      label: "Created event",
    }],
    readOnly: true,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
  };
}

async function loadPipelinePacketLoader(fixtures, supervisorOverrides, { lanAuthEnabled = false, requestPipelineSupervisorViaUds } = {}) {
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
  let projectorModule;
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: { KENDALL_LAN_AUTH_ENABLED: lanAuthEnabled ? "true" : "false" } },
    require: (specifier) => {
      if (specifier === "./pipeline-supervisor-projector") {
        if (projectorModule) return projectorModule;
        const projectorContext = { exports: {}, module: { exports: {} }, require: () => fixtures };
        projectorContext.exports = projectorContext.module.exports;
        vm.runInNewContext(projectorOutput, projectorContext, { filename: "pipeline-supervisor-projector.ts" });
        projectorModule = projectorContext.module.exports;
        return projectorModule;
      }
      if (specifier === "./pipeline-supervisor-runtime") return supervisor;
      if (specifier === "./pipeline-supervisor-uds") return {
        requestPipelineSupervisorViaUds: requestPipelineSupervisorViaUds ?? (async () => { throw new Error("UDS should be unused when LAN auth is disabled"); }),
      };
      throw new Error(`Unexpected loader import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "pipeline-packet-loader.ts" });
  projectorModule = context.require("./pipeline-supervisor-projector");
  let fixtureAdapterError = null;
  // Existing fixture callers are V0-shaped. Adapt them only after the real
  // projector validates the same bounded shape that historical tests cover;
  // malformed V0 inputs therefore remain fail-closed rather than acquiring a
  // synthetic canonical wrapper.
  const canonicalFixtureAdapter = (packet) => {
    if (packet?.presentation) return packet;
    const projection = projectorModule.projectSupervisorWorkPacketsToCockpitPackets([packet]);
    if (projection.kind !== "runtime" || projection.packets.length !== 1) {
      fixtureAdapterError = projection.kind === "invalid"
        ? projection.error
        : "Fixture packet did not produce one runtime compatibility projection.";
      return {
        authoritativeLifecycle: authoritativeWorkPacket(),
        canonicalContract: null,
        evidenceChain: null,
        productModeMapping: null,
        presentation: authoritativeWorkPacket(),
      };
    }
    const currentStage = packet.currentStage === "human_gate" ? "needs_approval" : packet.currentStage;
    const lifecycle = authoritativeLifecyclePacket(packet.packetId);
    lifecycle.title = packet.title;
    lifecycle.currentStage = currentStage;
    lifecycle.status = packet.status;
    lifecycle.history[0].targetStage = currentStage;
    lifecycle.history[0].status = packet.status;
    return {
      authoritativeLifecycle: lifecycle,
      canonicalContract: packet?.canonicalContract ?? null,
      evidenceChain: packet?.evidenceChain ?? null,
      productModeMapping: packet?.productModeMapping ?? null,
      presentation: packet,
    };
  };
  if (typeof supervisor.getWorkPackets === "function") {
    const getWorkPackets = supervisor.getWorkPackets;
    supervisor.getWorkPackets = async (...args) => (await getWorkPackets(...args)).map(canonicalFixtureAdapter);
  }
  if (typeof supervisor.getWorkPacket === "function") {
    const getWorkPacket = supervisor.getWorkPacket;
    supervisor.getWorkPacket = async (...args) => canonicalFixtureAdapter(await getWorkPacket(...args));
  }
  const invalidFixtureMode = (label, summary) => ({
    kind: "invalid",
    label,
    summary: `${summary} No runtime or demo packets are shown.`,
    matrixRows: 0,
    fixtureCatalogEntries: 0,
    canSatisfyLiveProof: false,
  });
  // Legacy assertions intentionally inspect the existing V0 cockpit projector.
  // Production loader results now expose only canonical packets; this harness
  // keeps those unrelated V0 assertions at their explicit test adapter.
  const loadCanonicalList = context.module.exports.loadPipelineCockpitPackets;
  const loadCanonicalDetail = context.module.exports.loadPipelineCockpitPacket;
  context.module.exports.loadPipelineCockpitPackets = async (...args) => {
    fixtureAdapterError = null;
    const result = await loadCanonicalList(...args);
    if (fixtureAdapterError) {
      return {
        fixtureMode: invalidFixtureMode("Supervisor invalid", fixtureAdapterError),
        canonicalPackets: [],
        operationalProjection: null,
        projectionError: fixtureAdapterError,
        packets: [],
      };
    }
    const projection = projectorModule.projectSupervisorWorkPacketsToCockpitPackets(
      result.canonicalPackets.map((packet) => packet.presentation),
    );
    return { ...result, packets: projection.kind === "runtime" ? projection.packets : [] };
  };
  context.module.exports.loadPipelineCockpitPacket = async (...args) => {
    fixtureAdapterError = null;
    const result = await loadCanonicalDetail(...args);
    if (fixtureAdapterError) {
      return {
        fixtureMode: {
          ...invalidFixtureMode("Supervisor packet invalid", fixtureAdapterError),
          summary: `${fixtureAdapterError} No demo packet was substituted.`,
        },
        canonicalPacket: null,
        workGraph: null,
        packet: null,
      };
    }
    const projection = result.canonicalPacket
      ? projectorModule.projectSupervisorWorkPacketsToCockpitPackets([result.canonicalPacket.presentation])
      : null;
    return { ...result, packet: projection?.kind === "runtime" ? projection.packets[0] ?? null : null };
  };
  return {
    ...context.module.exports,
    __projectCanonicalPresentationsForTest: (presentations) => projectorModule.projectDashboardCanonicalPresentationsToCockpitPackets(presentations),
    __canonicalListForTest: loadCanonicalList,
    __canonicalDetailForTest: loadCanonicalDetail,
  };
}

async function loadCompiledDashboardFixtures() {
  const outDir = await mkdtemp(join(tmpdir(), "dashboard-loader-fixtures-"));
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
