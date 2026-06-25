import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const packageJsonPath = new URL("../package.json", import.meta.url);

const canonicalMappingFixtures = [
  {
    name: "candidate-only proposed",
    input: { candidateWorkStatus: "proposed" },
    expected: {
      currentStage: "capture",
      currentOwner: "kendall",
      status: "waiting",
      reasonCodes: ["candidate.proposed"]
    }
  },
  {
    name: "candidate approved unpromoted",
    input: { candidateWorkStatus: "approved", candidateWorkPromoted: false },
    expected: {
      currentStage: "promote",
      currentOwner: "operator",
      status: "waiting",
      reasonCodes: ["candidate.approved_unpromoted"]
    }
  },
  {
    name: "candidate promoted missing work item",
    input: { candidateWorkStatus: "approved", candidateWorkPromoted: true },
    expected: {
      currentStage: "capture",
      currentOwner: "kendall",
      status: "waiting",
      reasonCodes: ["candidate.promoted_missing_work_item"]
    }
  },
  {
    name: "work-item-only queued",
    input: { workItemState: "queued" },
    expected: {
      currentStage: "capture",
      currentOwner: "kendall",
      status: "active",
      reasonCodes: ["work_item.queued"]
    }
  },
  {
    name: "triaged work item with route",
    input: { workItemState: "triaged", hasRoutingPreview: true },
    expected: {
      currentStage: "route",
      currentOwner: "kendall",
      status: "active",
      reasonCodes: ["routing.preview_present"]
    }
  },
  {
    name: "ready human gate",
    input: { workItemState: "ready" },
    expected: {
      currentStage: "human_gate",
      currentOwner: "operator",
      status: "waiting",
      reasonCodes: ["work_item.ready"]
    }
  },
  {
    name: "blocked work item",
    input: { workItemState: "blocked" },
    expected: {
      currentStage: "human_gate",
      currentOwner: "blocked",
      status: "blocked",
      reasonCodes: ["work_item.blocked"]
    }
  },
  {
    name: "failed execution attempt",
    input: { executionAttemptStatus: "failed", executionAttemptLane: "utility" },
    expected: {
      currentStage: "execute",
      currentOwner: "blocked",
      status: "failed",
      reasonCodes: ["execution_attempt.failed"]
    }
  },
  {
    name: "completed execution attempt",
    input: { executionAttemptStatus: "completed", executionAttemptLane: "utility" },
    expected: {
      currentStage: "review",
      currentOwner: "kendall",
      status: "complete",
      reasonCodes: ["execution_attempt.completed"]
    }
  },
  {
    name: "done with delivery evidence",
    input: { workItemState: "done", hasDeliveryEvidence: true, deliveryOwner: "github" },
    expected: {
      currentStage: "deliver",
      currentOwner: "github",
      status: "complete",
      reasonCodes: ["delivery.evidence_present"]
    }
  },
  {
    name: "done with memory proposal",
    input: { workItemState: "done", memoryProposalStatus: "pending_human_approval" },
    expected: {
      currentStage: "learn",
      currentOwner: "memory_review",
      status: "waiting",
      reasonCodes: ["memory.pending_human_approval"]
    }
  },
  {
    name: "memory proposal without done",
    input: { memoryProposalStatus: "proposed" },
    expected: {
      currentStage: "learn",
      currentOwner: "memory_review",
      status: "waiting",
      reasonCodes: ["memory.proposed", "memory.proposal_without_done"]
    }
  },
  {
    name: "delivery evidence without done",
    input: { hasDeliveryEvidence: true, deliveryOwner: "kendall" },
    expected: {
      currentStage: "deliver",
      currentOwner: "kendall",
      status: "complete",
      reasonCodes: ["delivery.evidence_without_done"]
    }
  },
  {
    name: "unsupported execution lane",
    input: { executionAttemptStatus: "running", executionAttemptLane: "external_agent" },
    expected: {
      currentStage: "execute",
      currentOwner: "kendall",
      status: "active",
      reasonCodes: ["execution_attempt.running", "execution_lane.unsupported.external_agent"]
    }
  },
  {
    name: "missing execution lane",
    input: { executionAttemptStatus: "running" },
    expected: {
      currentStage: "execute",
      currentOwner: "kendall",
      status: "active",
      reasonCodes: ["execution_attempt.running", "execution_lane.missing"]
    }
  },
  {
    name: "local patch draft",
    input: { executionAttemptStatus: "running", executionAttemptLane: "local_patch_draft" },
    expected: {
      currentStage: "execute",
      currentOwner: "kendall",
      status: "active",
      reasonCodes: ["execution_attempt.running", "execution_lane.local_patch_draft_kendall_owned"]
    }
  }
];

const sourceRefFixtures = [
  { refId: "source:fresh", sourceType: "manual", label: "Fresh note", freshness: "fresh", accessState: "allowed", summaryOnly: true },
  { refId: "source:stale", sourceType: "obsidian", label: "Stale note", freshness: "stale", accessState: "allowed", summaryOnly: true },
  { refId: "source:missing", sourceType: "github", label: "Missing PR", freshness: "unknown", accessState: "missing", summaryOnly: true },
  { refId: "source:excluded", sourceType: "llm_wiki", label: "Excluded wiki", freshness: "unknown", accessState: "excluded", summaryOnly: true },
  { refId: "source:blocked", sourceType: "research", label: "Blocked source", freshness: "unknown", accessState: "blocked", summaryOnly: true }
];

const forbiddenFields = [
  "rawPrompt",
  "rawCompletion",
  "reasoningTrace",
  "providerPayload",
  "providerResponse",
  "modelPayload",
  "workerPayload",
  "secret",
  "credential",
  "rawOutput",
  "rawCommandOutput",
  "rawStdout",
  "rawStderr",
  "stdout",
  "stderr"
];

test("Work Packet fixture script is wired into package checks", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(packageJson.scripts["test:work-packet-fixtures"], "node --test tests/work-packet-fixtures.test.mjs");
  assert.match(packageJson.scripts["check:static"], /pnpm run test:work-packet-fixtures/);
  assert.match(packageJson.scripts.check, /pnpm run test:work-packet-fixtures/);
});

test("canonical Work Packet mapping fixtures cover expected stage, owner, status, and reason", async () => {
  const { mapWorkPacketStage } = await loadCompiledMapper();

  for (const fixture of canonicalMappingFixtures) {
    const result = mapWorkPacketStage(fixture.input);
    assert.equal(result.currentStage, fixture.expected.currentStage, fixture.name);
    assert.equal(result.currentOwner, fixture.expected.currentOwner, fixture.name);
    assert.equal(result.status, fixture.expected.status, fixture.name);
    assert.deepEqual(result.reasonCodes, fixture.expected.reasonCodes, fixture.name);
  }
});

test("canonical Work Packet fixtures cover refs, memory proposals, and recovery surfaces", async () => {
  const { mapWorkPacketStage } = await loadCompiledMapper();

  for (const fixture of canonicalMappingFixtures) {
    const stage = mapWorkPacketStage(fixture.input);
    const packet = buildWorkPacketFixture(fixture.name, fixture.input, stage);
    assert.deepEqual(validateWorkPacketFixtureBoundary(packet), [], fixture.name);
    assert.equal(packet.currentStage, fixture.expected.currentStage, fixture.name);
    assert.equal(packet.currentOwner, fixture.expected.currentOwner, fixture.name);
    assert.equal(packet.status, fixture.expected.status, fixture.name);
    assert.ok(packet.sourceRefs.length > 0, `${fixture.name}: missing source refs`);
    assert.ok(packet.evidenceRefs.length > 0, `${fixture.name}: missing evidence refs`);
    assert.ok(packet.artifactRefs.length > 0, `${fixture.name}: missing artifact refs`);
    assert.ok(packet.routeSummary.reasonCodes.length > 0, `${fixture.name}: missing route summary reasons`);

    if (packet.status === "blocked" || packet.status === "failed") {
      assert.ok(packet.recoveryActions.length > 0, `${fixture.name}: missing recovery availability`);
    }
    if (fixture.input.hasDeliveryEvidence) {
      assert.ok(packet.evidenceRefs.some((ref) => ref.evidenceType === "gate"), `${fixture.name}: missing delivery evidence`);
      assert.ok(packet.artifactRefs.some((ref) => ref.artifactType === "pull_request"), `${fixture.name}: missing delivery artifact`);
    }
    if (fixture.input.memoryProposalStatus) {
      assert.ok(packet.memoryProposals.length > 0, `${fixture.name}: missing memory proposal`);
      assert.equal(packet.memoryProposals[0].writeBackAllowed, false, fixture.name);
    }
  }
});

test("source reference fixtures keep excluded missing stale and blocked states visible in packet fixtures", () => {
  const packet = buildWorkPacketFixture("source visibility", {}, {
    currentStage: "capture",
    currentOwner: "kendall",
    status: "waiting",
    reasonCodes: ["fixture.source_visibility"],
    ambiguityNotes: []
  });
  assert.deepEqual(
    packet.sourceRefs.map((ref) => [ref.refId, ref.freshness, ref.accessState, ref.summaryOnly]),
    [
      ["source:fresh", "fresh", "allowed", true],
      ["source:stale", "stale", "allowed", true],
      ["source:missing", "unknown", "missing", true],
      ["source:excluded", "unknown", "excluded", true],
      ["source:blocked", "unknown", "blocked", true]
    ]
  );
});

test("fixture evidence boundary rejects forbidden raw retained content by field name", () => {
  const safeFixture = {
    packetId: "fixture:safe",
    evidenceRefs: [{ refId: "evidence:safe", retentionClass: "metadata_only", rawPayloadRetained: false }],
    memoryProposals: [{ proposalId: "memory:safe", writeBackAllowed: false }]
  };
  assert.deepEqual(validateWorkPacketFixtureBoundary(safeFixture), []);

  for (const field of forbiddenFields) {
    const errors = validateWorkPacketFixtureBoundary({ packetId: "fixture:bad", [field]: "forbidden raw content" });
    assert.ok(errors.some((error) => error.includes(field)), `${field} boundary was not named`);
  }

  assert.ok(validateWorkPacketFixtureBoundary({ evidenceRefs: [{ refId: "evidence:raw", rawPayloadRetained: true }] })[0].includes("rawPayloadRetained"));
  assert.ok(validateWorkPacketFixtureBoundary({ memoryProposals: [{ proposalId: "memory:raw", writeBackAllowed: true }] })[0].includes("writeBackAllowed"));
});

function buildWorkPacketFixture(name, input, stage) {
  const slug = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "packet";
  const evidenceRefs = [
    {
      refId: `evidence:fixture:${slug}`,
      evidenceType: input.executionAttemptStatus ? "attempt" : "fixture",
      label: `Fixture evidence for ${name}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false
    }
  ];
  const artifactRefs = [
    {
      refId: `artifact:fixture:${slug}`,
      artifactType: "fixture",
      label: `Fixture artifact for ${name}`,
      pathOrUrl: `fixtures/work-packets/${slug}.json`,
      status: "available"
    }
  ];
  const memoryProposals = [];
  const recoveryActions = [];

  if (input.hasDeliveryEvidence) {
    evidenceRefs.push({
      refId: `delivery:fixture:${slug}`,
      evidenceType: "gate",
      label: "Delivery readiness fixture",
      retentionClass: "metadata_only",
      rawPayloadRetained: false
    });
    artifactRefs.push({
      refId: `artifact:delivery:${slug}:pull_request`,
      artifactType: "pull_request",
      label: "Delivery pull request fixture",
      pathOrUrl: "https://github.com/example/repo/pull/42",
      status: "available"
    });
  }
  if (input.memoryProposalStatus) {
    memoryProposals.push({
      proposalId: `memory:fixture:${slug}`,
      packetId: `fixture:${slug}`,
      label: "Memory proposal fixture",
      status: input.memoryProposalStatus,
      summary: "Synthetic memory proposal for fixture coverage.",
      targetRef: sourceRefFixtures[1],
      targetVaultPath: `Obsidian/Kendall_Nxt/Inbox/${slug}.md`,
      targetVaultFolder: "Obsidian/Kendall_Nxt/Inbox",
      proposalType: "append_note",
      suggestedContentSummary: "Synthetic memory proposal for fixture coverage.",
      patchSummary: "Patch summary only; no fixture writes are performed.",
      sensitivity: "medium",
      freshness: input.memoryProposalStatus === "stale" ? "stale" : input.memoryProposalStatus === "contradictory" ? "conflicting" : "fresh",
      contradictionStatus: input.memoryProposalStatus === "contradictory" ? "confirmed" : "none",
      confidence: "medium",
      operatorAction: input.memoryProposalStatus === "rejected" ? "reject" : input.memoryProposalStatus === "deferred" ? "defer" : input.memoryProposalStatus === "edit_needed" ? "edit" : "approve",
      decisionNeededContext: input.memoryProposalStatus === "stale" || input.memoryProposalStatus === "contradictory" || input.memoryProposalStatus === "blocked" ? "Operator decision required before any future write-back." : null,
      backupRecoveryPath: "Preserve fixture evidence and leave memory unchanged.",
      writeBackStatus: input.memoryProposalStatus === "deferred" ? "deferred" : input.memoryProposalStatus === "rejected" || input.memoryProposalStatus === "blocked" ? "blocked" : "review_gated",
      sourceRefs: [sourceRefFixtures[1].refId],
      evidenceRefs: [evidenceRefs[0].refId],
      writeBackAllowed: false
    });
    artifactRefs.push({
      refId: `artifact:memory:${slug}`,
      artifactType: "memory_proposal",
      label: "Memory proposal artifact fixture",
      status: "available"
    });
  }
  if (stage.status === "blocked" || stage.status === "failed") {
    recoveryActions.push({
      actionId: `recovery:fixture:${slug}`,
      actionType: "retry_smaller",
      label: "Retry smaller fixture",
      availability: "available",
      consequence: "Create a smaller scoped fixture task.",
      resultingStage: "shape",
      resultingOwner: "kendall",
      evidenceRefs: [evidenceRefs[0].refId]
    });
  }

  return {
    packetId: `fixture:${slug}`,
    title: `${name} fixture`,
    requestedOutcome: "Validate canonical Work Packet fixture mapping.",
    currentStage: stage.currentStage,
    currentOwner: stage.currentOwner,
    status: stage.status,
    riskLevel: "low",
    priority: "normal",
    candidateWork: input.candidateWorkStatus ? { id: `candidate:${slug}` } : null,
    workItem: input.workItemState ? { id: `work-item:${slug}` } : null,
    taskPacket: null,
    routingPreview: input.hasRoutingPreview ? { decision: { selectedLane: "utility" } } : null,
    routeSummary: {
      recommendation: stage.currentOwner,
      confidenceScore: 1,
      confidenceBand: "fixture",
      reasonCodes: stage.reasonCodes
    },
    executionAttempts: input.executionAttemptStatus
      ? [
          {
            attemptId: `attempt:${slug}`,
            workItemId: `work-item:${slug}`,
            routeDecisionId: `route:${slug}`,
            workerId: "fixture.worker",
            lane: input.executionAttemptLane ?? "unknown",
            authorityMode: "fixture_only",
            status: input.executionAttemptStatus,
            createdAt: "2026-06-23T00:00:00Z",
            updatedAt: "2026-06-23T00:00:00Z",
            evidenceRefs: [evidenceRefs[0].refId],
            artifactRefs: [artifactRefs[0].refId]
          }
        ]
      : [],
    sourceRefs: sourceRefFixtures,
    evidenceRefs,
    artifactRefs,
    humanGateActions: stage.currentStage === "human_gate" ? [{
      actionId: `gate:fixture:${slug}`,
      actionType: "approve",
      label: "Approve fixture gate",
      availability: "available",
      summary: "Synthetic gate action.",
      requiredEvidenceRefs: [evidenceRefs[0].refId],
      resultingStage: "execute",
      resultingOwner: "kendall"
    }] : [],
    laneCards: input.executionAttemptStatus ? [{
      laneId: `lane:fixture:${slug}`,
      laneType: input.executionAttemptLane === "external_agent" ? "unknown" : input.executionAttemptLane ?? "unknown",
      label: "Fixture lane",
      status: stage.status === "complete" ? "complete" : stage.status === "failed" ? "blocked" : "running",
      summary: "Synthetic lane card.",
      currentOwner: stage.currentOwner,
      routeConfidence: 1,
      reasonCodes: stage.reasonCodes,
      evidenceRefs: [evidenceRefs[0].refId],
      artifactRefs: [artifactRefs[0].refId]
    }] : [],
    memoryProposals,
    reviewSummaries: [{
      reviewer: "kendall",
      status: stage.status === "complete" ? "complete" : "pending",
      summary: "Synthetic review summary.",
      evidenceRefs: [evidenceRefs[0].refId],
      artifactRefs: [artifactRefs[0].refId]
    }],
    recoveryActions
  };
}

function validateWorkPacketFixtureBoundary(value, path = "fixture") {
  const errors = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => errors.push(...validateWorkPacketFixtureBoundary(entry, `${path}[${index}]`)));
    return errors;
  }
  if (!value || typeof value !== "object") {
    return errors;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenFields.includes(key) || isForbiddenRawRetentionKey(key)) {
      errors.push(`${childPath} violates raw retained content boundary`);
    }
    if (key === "rawPayloadRetained" && child !== false) {
      errors.push(`${childPath} must be false`);
    }
    if (key === "writeBackAllowed" && child !== false) {
      errors.push(`${childPath} must be false`);
    }
    errors.push(...validateWorkPacketFixtureBoundary(child, childPath));
  }
  return errors;
}

function isForbiddenRawRetentionKey(key) {
  return /^(raw.*(prompt|completion|output|stdout|stderr|payload|response)|.*(secret|credential).*)$/i.test(key) ||
    /^(provider|model|worker).*(payload|response)$/i.test(key) ||
    /^(stdout|stderr)$/i.test(key);
}

async function loadCompiledMapper() {
  const outDir = await mkdtemp(join(tmpdir(), "work-packet-fixture-map-"));
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
      "--verbatimModuleSyntax",
      "--rootDir",
      "packages/workflow-core/src",
      "--outDir",
      outDir,
      "packages/workflow-core/src/work-packet-stage-map.ts"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return import(pathToFileURL(join(outDir, "work-packet-stage-map.js")).href);
}
