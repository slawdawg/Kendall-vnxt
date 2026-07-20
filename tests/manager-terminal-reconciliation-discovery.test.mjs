import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildDispatcherRefillWatermarkPlan,
  buildRefillPlan,
} from "../scripts/lib/manager-control-plane/core.mjs";

const SOURCE_REVISION = "883fc7b100ec620323980a8e8a46e0f80c13176d";
const SUPERVISOR_EVENT_ID = "manager-terminal-event:8228918e3e42b2f3883af31649580a1e34665fc1";
const FIXTURE_ROOT = process.cwd();

function digest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function writeFixtureFile(relativePath, content) {
  const absolutePath = join(FIXTURE_ROOT, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
}

function terminalFixture({ packet = "valid", secondPacket = false, supervisorProof = "missing" } = {}) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceKey = `terminal-reconciliation-test-${suffix}`;
  const prdPath = `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-${sourceKey}/prd.md`;
  const epicsPath = `_bmad-output/planning-artifacts/epics-${sourceKey}.md`;
  const readinessPath = `_bmad-output/planning-artifacts/implementation-readiness-report-${sourceKey}.md`;
  const sprintPath = `_bmad-output/implementation-artifacts/sprint-status-${sourceKey}.yaml`;
  const packetPath = `_bmad-output/implementation-artifacts/terminal-reconciliation-${sourceKey}.json`;
  const secondPacketPath = `_bmad-output/implementation-artifacts/terminal-reconciliation-${sourceKey}-duplicate.json`;
  const sourceIdentity = `prd:${prdPath}`;
  const prd = `---\nstatus: final\nauthoritative: true\n---\n# PRD_RAW_SENTINEL_${suffix}\n`;
  const epics = `---\nworkflowType: epics-and-stories\nstatus: complete\nauthoritative_prd: ${prdPath}\n---\n# Epics\n`;
  const readiness = `---\nworkflowType: implementation-readiness\nstatus: complete\nauthoritative_prd: ${prdPath}\nauthoritative_epics: ${epicsPath}\n---\n# Readiness\n`;
  const sprint = `source_key: ${sourceKey}\nsource_revision: ${SOURCE_REVISION}\ndevelopment_status:\n  epic-1: done\n  1-1-terminal-source: done\n`;
  const counts = {
    totalItems: 1,
    reconciledItems: 1,
    eligible: 0,
    queued: 0,
    leased: 0,
    running: 0,
    reviewFix: 0,
    requiredRetrospective: 0,
    otherwiseRequired: 0,
    completed: 1,
    closed: 0,
    approvalGated: 0,
  };
  const terminalPacket = {
    packetType: "manager-terminal-reconciliation",
    proofMode: "metadata_only",
    status: "authoritative_backlog_exhausted",
    ok: true,
    sourceBundle: {
      sourceIdentity,
      sourceRevision: `git:${SOURCE_REVISION}`,
      digests: {
        prd: digest(prd),
        epics: digest(epics),
        readiness: digest(readiness),
        sprintStatus: digest(sprint),
      },
      fullyReconciled: true,
      noSeparatelyApprovedSource: true,
      remainingCandidates: [],
    },
    managerEvidence: { runId: "manager-terminal-fixture", preflightSummaryRef: "manager-preflight-summary:fixture" },
    terminalDisposition: {
      disposition: "authoritative_backlog_exhausted",
      runId: "manager-terminal-fixture",
      sourceIdentity,
      sourceRevision: `git:${SOURCE_REVISION}`,
      reconciliationCounts: counts,
      unresolvedApprovalGatedWork: [],
      evidenceRefs: [
        `source-path:${sourceIdentity}`,
        `epics-path:${epicsPath}`,
        `readiness-path:${readinessPath}`,
        `sprint-status-path:${sprintPath}`,
      ],
      resumeRequirement: "Continue only after a new accepted source-owned bundle is available.",
      nextManagerAction: "Stop without creating filler or a successor epic.",
      canonicalEventIntegration: "missing_supervisor_contract",
      idempotencyKey: "authoritative-backlog-exhausted:fixture",
      rawPayloadRetained: false,
    },
    noNewEpic: true,
    noFillerWork: true,
    rawPayloadRetained: false,
  };
  if (supervisorProof !== "missing") {
    terminalPacket.terminalDisposition.canonicalEventIntegration = "supervisor_canonical_event";
    terminalPacket.terminalDisposition.supervisorEvent = {
      eventId: SUPERVISOR_EVENT_ID,
      evidenceRef: `supervisor-event:${SUPERVISOR_EVENT_ID}`,
      status: "persisted",
      owner: "supervisor",
      persistedAt: "2026-07-12T14:28:15.078Z",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (supervisorProof === "missing-event") delete terminalPacket.terminalDisposition.supervisorEvent;
  if (supervisorProof === "unsafe-event-id") terminalPacket.terminalDisposition.supervisorEvent.eventId = "manager-terminal-event:8228918E3E42B2F3883AF31649580A1E34665FC1";
  if (supervisorProof === "wrong-evidence-ref") terminalPacket.terminalDisposition.supervisorEvent.evidenceRef = `supervisor-event:manager-terminal-event:${"1".repeat(40)}`;
  if (supervisorProof === "bad-status") terminalPacket.terminalDisposition.supervisorEvent.status = "queued";
  if (supervisorProof === "bad-persisted-at") terminalPacket.terminalDisposition.supervisorEvent.persistedAt = "not-a-timestamp";
  if (supervisorProof === "metadata-flag-missing") delete terminalPacket.terminalDisposition.supervisorEvent.metadataOnly;
  if (supervisorProof === "raw-flag-missing") delete terminalPacket.terminalDisposition.supervisorEvent.rawPayloadRetained;
  if (supervisorProof === "extra-field") terminalPacket.terminalDisposition.supervisorEvent.proofDocument = "terminal-reconciliation-sync-proof-2026-07-12.md";
  if (supervisorProof === "raw-retained") terminalPacket.terminalDisposition.supervisorEvent.rawPayloadRetained = true;
  if (packet === "identity-mismatch") terminalPacket.sourceBundle.sourceIdentity = `prd:${prdPath}.stale`;
  if (packet === "digest-mismatch") terminalPacket.sourceBundle.digests.prd = `sha256:${"0".repeat(64)}`;
  if (packet === "revision-mismatch") {
    terminalPacket.sourceBundle.sourceRevision = `git:${"1".repeat(40)}`;
    terminalPacket.terminalDisposition.sourceRevision = `git:${"1".repeat(40)}`;
  }
  if (packet === "raw-payload") terminalPacket.rawPacketPayload = `RAW_PACKET_SENTINEL_${suffix}`;

  writeFixtureFile(prdPath, prd);
  writeFixtureFile(epicsPath, epics);
  writeFixtureFile(readinessPath, readiness);
  writeFixtureFile(sprintPath, sprint);
  if (packet !== "missing") writeFixtureFile(packetPath, `${JSON.stringify(terminalPacket, null, 2)}\n`);
  if (secondPacket) writeFixtureFile(secondPacketPath, `${JSON.stringify(terminalPacket, null, 2)}\n`);

  return {
    sourceIdentity,
    sourceKey,
    sentinel: `PRD_RAW_SENTINEL_${suffix}`,
    cleanup() {
      rmSync(join(FIXTURE_ROOT, `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-${sourceKey}`), { recursive: true, force: true });
      for (const path of [epicsPath, readinessPath, sprintPath, packetPath, secondPacketPath]) {
        rmSync(join(FIXTURE_ROOT, path), { force: true });
      }
    },
  };
}

function buildFixturePlan(fixture) {
  return buildRefillPlan(
    { desiredWorkers: 6, runId: "manager-terminal-discovery-test", sourceRefs: [fixture.sourceIdentity] },
    {
      assignmentSummary: { summary: { backlogStatusCounts: { assignable: 0, closed: 1 } } },
      dispatchPreview: { counts: { dispatchable: 0, active: 0 } },
    },
  );
}

test("default local source planning discovers and binds a valid terminal reconciliation packet", () => {
  const fixture = terminalFixture();
  try {
    const plan = buildFixturePlan(fixture);

    assert.equal(plan.status, "authoritative_backlog_exhausted");
    assert.equal(plan.summary.sourcePlanning.activeSourceBinding.sourceIdentity, fixture.sourceIdentity);
    assert.equal(plan.summary.sourcePlanning.activeSourceBinding.sourceRevision, `git:${SOURCE_REVISION}`);
    assert.deepEqual(plan.summary.sourcePlanning.activeSourceBinding.sourceRefs, [fixture.sourceIdentity]);
    assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle.sourceIdentity, fixture.sourceIdentity);
    assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle.reconciliationCounts.totalItems, 1);
    assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle.rawPayloadRetained, false);
    assert.equal(plan.summary.terminalDisposition.canonicalEventIntegration, "missing_supervisor_contract");
    assert.equal(plan.summary.supervisorPersistence, "not_claimed; canonical supervisor terminal event integration is missing");
    assert.ok(plan.blockers.some((blocker) => blocker.code === "missing_supervisor_contract"));
    assert.equal(plan.summary.noNewEpic, true);
    assert.equal(plan.summary.noPostSliceWork, true);
    assert.doesNotMatch(JSON.stringify(plan), new RegExp(fixture.sentinel));
    assert.deepEqual(plan.summary.candidateLanes, []);
    assert.equal(plan.summary.workCreationStep, null);
    assert.doesNotMatch(JSON.stringify(plan), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
  } finally {
    fixture.cleanup();
  }
});

test("validated canonical supervisor proof persists both terminal refill projections", () => {
  const fixture = terminalFixture({ supervisorProof: "valid" });
  try {
    const plan = buildFixturePlan(fixture);
    const bundle = plan.summary.sourcePlanning.authoritativeSourceBundle;
    const activeSource = plan.summary.sourcePlanning.activeSourceBinding;

    assert.equal(plan.status, "authoritative_backlog_exhausted");
    assert.equal(bundle.canonicalEventIntegration, "supervisor_canonical_event");
    assert.equal(bundle.supervisorEvent.eventId, SUPERVISOR_EVENT_ID);
    assert.equal(plan.summary.terminalDisposition.canonicalEventIntegration, "supervisor_canonical_event");
    assert.deepEqual(plan.summary.terminalDisposition.supervisorEvent, bundle.supervisorEvent);
    assert.equal(plan.summary.supervisorPersistence, "persisted; supervisor canonical terminal event recorded");
    assert.equal(plan.blockers.some((blocker) => blocker.code === "missing_supervisor_contract"), false);
    assert.equal(plan.summary.noNewEpic, true);
    assert.equal(plan.summary.noPostSliceWork, true);
    assert.deepEqual(plan.summary.candidateLanes, []);
    assert.equal(plan.summary.workCreationStep, null);

    const watermark = buildDispatcherRefillWatermarkPlan(
      { runId: "manager-terminal-discovery-test" },
      {
        dispatchPreview: { counts: { dispatchable: 0, active: 0 } },
        sourceRefs: [fixture.sourceIdentity],
        refillCandidates: [],
        authoritativeSourceBundle: bundle,
        activeSource,
      },
    );
    assert.equal(watermark.status, "authoritative_backlog_exhausted");
    assert.equal(watermark.summary.terminalDisposition.canonicalEventIntegration, "supervisor_canonical_event");
    assert.equal(watermark.summary.terminalDisposition.supervisorEvent.eventId, SUPERVISOR_EVENT_ID);
    assert.equal(watermark.summary.supervisorPersistence, "persisted; supervisor canonical terminal event recorded");
    assert.equal(watermark.blockers.some((blocker) => blocker.code === "missing_supervisor_contract"), false);
    assert.deepEqual(watermark.summary.eligibleCandidates, []);
    assert.deepEqual(watermark.summary.needsReviewCandidates, []);
    assert.deepEqual(watermark.summary.blockedCandidates, []);
    assert.doesNotMatch(JSON.stringify({ plan, watermark }), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
  } finally {
    fixture.cleanup();
  }
});

for (const supervisorProof of ["missing-event", "unsafe-event-id", "wrong-evidence-ref", "bad-status", "bad-persisted-at", "metadata-flag-missing", "raw-flag-missing", "extra-field"]) {
  test(`canonical supervisor proof fails closed for ${supervisorProof}`, () => {
    const fixture = terminalFixture({ supervisorProof });
    try {
      const plan = buildFixturePlan(fixture);

      assert.equal(plan.status, "authoritative_backlog_exhausted");
      assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle.canonicalEventIntegration, undefined);
      assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle.supervisorEvent, undefined);
      assert.equal(plan.summary.terminalDisposition.canonicalEventIntegration, "missing_supervisor_contract");
      assert.equal(plan.summary.terminalDisposition.supervisorEvent, undefined);
      assert.equal(plan.summary.supervisorPersistence, "not_claimed; canonical supervisor terminal event integration is missing");
      assert.ok(plan.blockers.some((blocker) => blocker.code === "missing_supervisor_contract"));
      assert.equal(plan.summary.noNewEpic, true);
      assert.equal(plan.summary.noPostSliceWork, true);
      assert.deepEqual(plan.summary.candidateLanes, []);
      assert.equal(plan.summary.workCreationStep, null);
      assert.doesNotMatch(JSON.stringify(plan), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
    } finally {
      fixture.cleanup();
    }
  });
}

test("canonical supervisor proof with retained raw payload invalidates packet discovery", () => {
  const fixture = terminalFixture({ supervisorProof: "raw-retained" });
  try {
    const plan = buildFixturePlan(fixture);

    assert.equal(plan.status, "blocked");
    assert.equal(plan.blockers[0].code, "authoritative-backlog-exhaustion-evidence-required");
    assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle, undefined);
    assert.equal(plan.summary.noNewEpic, true);
    assert.equal(plan.summary.noPostSliceWork, true);
    assert.deepEqual(plan.summary.candidateLanes, []);
    assert.equal(plan.summary.workCreationStep, null);
  } finally {
    fixture.cleanup();
  }
});

for (const packet of ["missing", "identity-mismatch", "revision-mismatch", "digest-mismatch", "raw-payload"]) {
  test(`default local source planning fails closed for ${packet} terminal reconciliation evidence`, () => {
    const fixture = terminalFixture({ packet });
    try {
      const plan = buildFixturePlan(fixture);

      assert.equal(plan.status, "blocked");
      assert.equal(plan.blockers[0].code, "authoritative-backlog-exhaustion-evidence-required");
      assert.equal(plan.summary.sourcePlanning.activeSourceBinding.sourceIdentity, fixture.sourceIdentity);
      assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle, undefined);
      assert.equal(plan.summary.noNewEpic, true);
      assert.equal(plan.summary.noPostSliceWork, true);
      assert.deepEqual(plan.summary.candidateLanes, []);
      assert.equal(plan.summary.workCreationStep, null);
      assert.doesNotMatch(JSON.stringify(plan), /Epic 26|epic-26|26-\d+-[a-z][a-z0-9-]*/i);
    } finally {
      fixture.cleanup();
    }
  });
}

test("default local source planning rejects ambiguous matching terminal reconciliation packets", () => {
  const fixture = terminalFixture({ secondPacket: true });
  try {
    const plan = buildFixturePlan(fixture);

    assert.equal(plan.status, "blocked");
    assert.equal(plan.blockers[0].code, "authoritative-backlog-exhaustion-evidence-required");
    assert.equal(plan.summary.sourcePlanning.authoritativeSourceBundle, undefined);
    assert.equal(plan.summary.noNewEpic, true);
  } finally {
    fixture.cleanup();
  }
});
