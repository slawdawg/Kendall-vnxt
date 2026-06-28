import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const packageJsonPath = new URL("../package.json", import.meta.url);

const requiredFixtureIds = [
  "happy_path_work_packet",
  "blocked_human_gate",
  "stale_gate_action",
  "failed_stage_recovery",
  "partial_worker_evidence",
  "mocked_hermes_unavailable",
  "codex_active_claude_pending",
  "obsidian_proposal_pending_approval",
  "no_packets",
  "corrupted_incomplete_aggregate"
];

const requiredProvenance = [
  "fixture-only",
  "mocked",
  "synthetic",
  "local-readiness",
  "future-real-source"
];

test("Pipeline State/Evidence Matrix script is wired into package checks", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(packageJson.scripts["test:pipeline-state-matrix"], "node --test tests/pipeline-state-fixture-matrix.test.mjs");
  assert.match(packageJson.scripts["check:static"], /pnpm run test:pipeline-state-matrix/);
  assert.match(packageJson.scripts.check, /pnpm run test:pipeline-state-matrix/);
});

test("Pipeline State/Evidence Matrix covers required rows, stages, actions, and fixture catalog", async () => {
  const {
    PIPELINE_STATE_FIXTURE_CATALOG_V0,
    PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    validatePipelineStateFixtureMatrix
  } = await loadCompiledMatrix();

  const rowIds = new Set(PIPELINE_STATE_EVIDENCE_MATRIX_V0.map((row) => row.id));
  for (const rowId of [
    "candidate_work.proposed",
    "candidate_work.approved_unpromoted",
    "candidate_work.promoted_missing_work_item",
    "work_item.queued",
    "work_item.triaged",
    "routing.preview_present",
    "execution.recipe_unapproved",
    "work_item.ready",
    "work_item.blocked",
    "work_item.done",
    "execution_attempt.running",
    "governed_worker.hermes_dry_run_running",
    "governed_worker.claude_dry_run_running",
    "governed_worker.claude_real_execution_running",
    "governed_worker.hermes_real_execution_unavailable",
    "execution_attempt.failed",
    "execution_attempt.completed",
    "execution_attempt.review_rejected",
    "delivery.evidence_present",
    "memory.pending_human_approval",
    "memory.obsidian_proposal_pending_human_approval",
    "source.restricted_refs",
    "execution_lane.missing",
    "mock.hermes_unavailable",
    "mock.codex_active",
    "mock.claude_pending_skipped",
    "readiness.local_provider_disabled",
    "aggregate.no_packets",
    "aggregate.corrupted_incomplete"
  ]) {
    assert.ok(rowIds.has(rowId), `missing matrix row ${rowId}`);
  }

  const matrixRowById = new Map(PIPELINE_STATE_EVIDENCE_MATRIX_V0.map((row) => [row.id, row]));
  assert.deepEqual(matrixRowById.get("execution_attempt.completed").recoveryActions, []);
  assert.deepEqual(matrixRowById.get("governed_worker.hermes_dry_run_running").allowedActions, []);
  assert.deepEqual(matrixRowById.get("governed_worker.claude_dry_run_running").allowedActions, []);
  assert.deepEqual(matrixRowById.get("governed_worker.claude_real_execution_running").allowedActions, []);
  assert.ok(matrixRowById.get("governed_worker.hermes_real_execution_unavailable").recoveryActions.includes("reroute"));
  assert.deepEqual(matrixRowById.get("governed_worker.hermes_dry_run_running").requiredEvidence, ["attempt", "event"]);
  assert.deepEqual(matrixRowById.get("governed_worker.claude_dry_run_running").requiredEvidence, ["attempt", "review"]);
  assert.deepEqual(matrixRowById.get("governed_worker.claude_real_execution_running").requiredEvidence, ["attempt", "event", "review"]);
  assert.deepEqual(matrixRowById.get("mock.hermes_unavailable").recoveryActions, ["retry_smaller", "reroute", "send_back_to_shape"]);
  assert.deepEqual(matrixRowById.get("execution_attempt.review_rejected").recoveryActions, ["discard_result", "send_back_to_shape", "mark_blocked"]);
  assert.ok(matrixRowById.get("memory.pending_human_approval").recoveryActions.includes("reopen_human_gate"));
  assert.ok(matrixRowById.get("memory.pending_human_approval").recoveryActions.includes("send_back_to_research"));

  assert.deepEqual(new Set(PIPELINE_STATE_EVIDENCE_MATRIX_V0.map((row) => row.stage)), new Set([
    "capture",
    "classify",
    "route",
    "shape",
    "human_gate",
    "execute",
    "review",
    "promote",
    "deliver",
    "learn"
  ]));
  for (const actionType of [
    "approve_route",
    "approve_execution",
    "approve_provider_exception",
    "approve_memory_proposal",
    "approve_delivery",
    "reject_packet",
    "edit_packet",
    "request_clarification",
    "downgrade_to_reference",
    "send_back_to_shape",
    "send_back_to_research",
    "rerun_smaller",
    "reroute",
    "cancel_worker",
    "discard_result"
  ]) {
    assert.ok(
      PIPELINE_STATE_EVIDENCE_MATRIX_V0.some((row) =>
        row.allowedActions.includes(actionType) ||
        row.disallowedOrStaleActions.some((action) => action.type === actionType)
      ),
      `missing typed action matrix coverage for ${actionType}`
    );
  }
  assert.ok(!PIPELINE_STATE_EVIDENCE_MATRIX_V0.some((row) => row.allowedActions.includes("approve")));
  assert.ok(!PIPELINE_STATE_EVIDENCE_MATRIX_V0.some((row) => row.allowedActions.includes("revise")));
  assert.ok(!PIPELINE_STATE_EVIDENCE_MATRIX_V0.some((row) => row.allowedActions.includes("send_back")));
  assert.ok(PIPELINE_STATE_EVIDENCE_MATRIX_V0.some((row) => row.disallowedOrStaleActions.some((action) => action.type === "approve_execution" && action.status === "stale")));
  assert.ok(PIPELINE_STATE_EVIDENCE_MATRIX_V0.every((row) => row.workPacketFields.length > 0));
  assert.ok(PIPELINE_STATE_EVIDENCE_MATRIX_V0.every((row) => row.requiredEvidence.length > 0));
  assert.ok(PIPELINE_STATE_EVIDENCE_MATRIX_V0.every((row) => row.futureRealSourceCoverage));
  for (const row of PIPELINE_STATE_EVIDENCE_MATRIX_V0) {
    const blockedActionTypes = new Set(row.disallowedOrStaleActions
      .filter((action) => action.status === "blocked")
      .map((action) => action.type));
    assert.deepEqual(
      row.allowedActions.filter((actionType) => blockedActionTypes.has(actionType)),
      [],
      `${row.id} cannot both allow and block the same action`
    );
  }

  const fixtureIds = new Set(PIPELINE_STATE_FIXTURE_CATALOG_V0.map((fixture) => fixture.id));
  for (const fixtureId of requiredFixtureIds) {
    assert.ok(fixtureIds.has(fixtureId), `missing fixture ${fixtureId}`);
  }
  for (const provenance of requiredProvenance) {
    assert.ok(PIPELINE_STATE_FIXTURE_CATALOG_V0.some((fixture) => fixture.provenance === provenance), `missing provenance ${provenance}`);
  }

  assert.deepEqual(validatePipelineStateFixtureMatrix(), { ok: true, failures: [] });
});

test("Pipeline State/Evidence Matrix validates typed Human Gate actions and readiness gaps", async () => {
  const {
    PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    getMissingHumanGateActionFixtureCoverage,
    validateHumanGateActionModel
  } = await loadCompiledMatrix();

  assert.deepEqual(getMissingHumanGateActionFixtureCoverage(), []);
  assert.deepEqual(validateHumanGateActionModel(validGateAction({
    type: "approve_execution",
    payload: {
      packetId: "fixture:human-gate-blocked",
      actionId: "fixture:human-gate-blocked:action:approve_execution",
      decisionId: "fixture:human-gate-blocked:decision:current"
    }
  })), { ok: true, failures: [] });

  const unknown = validateHumanGateActionModel({
    actionId: "fixture:gate:unknown",
    type: "approve",
    status: "available",
    payload: {
      packetId: "fixture:human-gate-blocked",
      actionId: "fixture:gate:unknown",
      decisionId: "fixture:human-gate-blocked:decision:current"
    },
    requiredEvidenceRefs: ["fixture:human-gate-blocked:evidence:fixture"],
    resultingStage: "execute",
    resultingOwner: "codex_worker"
  });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.failures.some((failure) => failure.id === "type"));
  assert.ok(unknown.failures.some((failure) => failure.id === "family"));
  assert.ok(unknown.failures.some((failure) => failure.id === "stopLines"));

  const stale = validateHumanGateActionModel(validGateAction({
    actionId: "fixture:gate:stale",
    type: "approve_execution",
    status: "available",
    payload: {
      packetId: "fixture:human-gate-blocked",
      actionId: "fixture:gate:other",
      decisionId: ""
    },
    requiredEvidenceRefs: [],
    resultingStage: "execute",
    resultingOwner: "codex_worker"
  }));
  assert.equal(stale.ok, false);
  assert.ok(stale.failures.some((failure) => failure.id === "payload.actionId"));
  assert.ok(stale.failures.some((failure) => failure.id === "payload.decisionId"));
  assert.ok(stale.failures.some((failure) => failure.id === "requiredEvidenceRefs"));

  const unavailableWithoutDisabledReason = validateHumanGateActionModel(validGateAction({
    status: "blocked",
    disabledReason: undefined,
    reasonCodes: ["human_gate.unavailable.approve_execution"]
  }));
  assert.equal(unavailableWithoutDisabledReason.ok, false);
  assert.ok(unavailableWithoutDisabledReason.failures.some((failure) => failure.id === "disabledReason"));
  assert.ok(!unavailableWithoutDisabledReason.failures.some((failure) => failure.id === "reasonCodes"));

  const unavailableWithoutReasonCodes = validateHumanGateActionModel(validGateAction({
    status: "blocked",
    disabledReason: "disabled reason: blocked for fixture review.",
    reasonCodes: []
  }));
  assert.equal(unavailableWithoutReasonCodes.ok, false);
  assert.ok(unavailableWithoutReasonCodes.failures.some((failure) => failure.id === "reasonCodes"));

  const malformedReasonCodes = validateHumanGateActionModel(validGateAction({
    reasonCodes: ["human_gate.status.available", "not a code", "human_gate.status.available"]
  }));
  assert.equal(malformedReasonCodes.ok, false);
  assert.ok(malformedReasonCodes.failures.some((failure) => failure.id === "reasonCodes.format"));
  assert.ok(malformedReasonCodes.failures.some((failure) => failure.id === "reasonCodes.duplicate"));

  const missingIntentionalCoverage = getMissingHumanGateActionFixtureCoverage(
    PIPELINE_STATE_EVIDENCE_MATRIX_V0.map((row) => row.id === "source.restricted_refs"
      ? {
          ...row,
          allowedActions: row.allowedActions.filter((actionType) => actionType !== "downgrade_to_reference"),
          disallowedOrStaleActions: row.disallowedOrStaleActions.filter((action) => action.type !== "downgrade_to_reference")
        }
      : row
    )
  );
  assert.ok(missingIntentionalCoverage.includes("downgrade_to_reference"));

  assert.ok(
    PIPELINE_STATE_EVIDENCE_MATRIX_V0.some((row) =>
      row.disallowedOrStaleActions.some((action) => action.type === "unknown_action" && action.status === "blocked")
    ),
    "matrix should represent unknown action rejection"
  );
});

test("Pipeline State/Evidence Matrix rejects malformed typed action rows", async () => {
  const {
    PIPELINE_STATE_FIXTURE_CATALOG_V0,
    PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    validatePipelineStateFixtureMatrix
  } = await loadCompiledMatrix();

  const malformedResult = validatePipelineStateFixtureMatrix({
    matrixRows: PIPELINE_STATE_EVIDENCE_MATRIX_V0.map((row) => row.id === "work_item.ready"
      ? {
          ...row,
          allowedActions: [...row.allowedActions, "approve"],
          disallowedOrStaleActions: [
            ...row.disallowedOrStaleActions,
            { type: "approve", status: "blocked", reason: "Unsupported legacy action." },
            { type: "reject_packet", status: "available", reason: "Unavailable rows cannot be available." }
          ]
        }
      : row
    ),
    fixtureCatalog: PIPELINE_STATE_FIXTURE_CATALOG_V0
  });

  assert.equal(malformedResult.ok, false);
  assert.ok(malformedResult.failures.some((failure) => failure.id.includes("allowedActions.approve")));
  assert.ok(malformedResult.failures.some((failure) => failure.id.includes("disallowedOrStaleActions.approve")));
  assert.ok(malformedResult.failures.some((failure) => failure.id.includes("disallowedOrStaleActions.reject_packet.status")));
});

test("Pipeline State/Evidence Matrix readiness failures name missing state fixture and boundary rows", async () => {
  const {
    PIPELINE_STATE_FIXTURE_CATALOG_V0,
    PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    validatePipelineStateFixtureMatrix
  } = await loadCompiledMatrix();

  const result = validatePipelineStateFixtureMatrix({
    matrixRows: PIPELINE_STATE_EVIDENCE_MATRIX_V0.filter((row) => row.id !== "work_item.ready" && row.id !== "source.restricted_refs"),
    fixtureCatalog: PIPELINE_STATE_FIXTURE_CATALOG_V0.filter((fixture) => fixture.id !== "stale_gate_action")
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.category === "state" && failure.id === "work_item.ready"));
  assert.ok(result.failures.some((failure) => failure.category === "boundary" && failure.id === "source.restricted_refs"));
  assert.ok(result.failures.some((failure) => failure.category === "fixture" && failure.id === "stale_gate_action"));
});

test("Pipeline State/Evidence Matrix rejects unsafe or unlinked fixture boundaries", async () => {
  const {
    PIPELINE_STATE_FIXTURE_CATALOG_V0,
    PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    validatePipelineStateFixtureMatrix
  } = await loadCompiledMatrix();

  const unsafeFixture = {
    ...PIPELINE_STATE_FIXTURE_CATALOG_V0[0],
    id: "unsafe_fixture",
    provenance: undefined,
    matrixRowIds: ["missing.row"],
    rawOutput: "forbidden raw stdout",
    memoryProposal: { writeBackAllowed: true }
  };
  const result = validatePipelineStateFixtureMatrix({
    matrixRows: PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    fixtureCatalog: PIPELINE_STATE_FIXTURE_CATALOG_V0.concat(unsafeFixture)
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.category === "fixture" && failure.id === "unsafe_fixture.provenance"));
  assert.ok(result.failures.some((failure) => failure.category === "fixture" && failure.id === "unsafe_fixture.matrixRowIds.missing.row"));
  assert.ok(result.failures.some((failure) => failure.category === "boundary" && failure.id === "unsafe_fixture.rawOutput"));
  assert.ok(result.failures.some((failure) => failure.category === "boundary" && failure.id === "unsafe_fixture.memoryProposal.writeBackAllowed"));
});

test("Pipeline State/Evidence Matrix allows explicit false raw-payload retention markers", async () => {
  const {
    PIPELINE_STATE_FIXTURE_CATALOG_V0,
    PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    validatePipelineStateFixtureMatrix
  } = await loadCompiledMatrix();

  const safeFixture = {
    ...PIPELINE_STATE_FIXTURE_CATALOG_V0[0],
    id: "safe_false_raw_payload_marker",
    rawPayloadRetained: false,
    evidence: { rawPayloadRetained: false, writeBackAllowed: false }
  };

  assert.deepEqual(validatePipelineStateFixtureMatrix({
    matrixRows: PIPELINE_STATE_EVIDENCE_MATRIX_V0,
    fixtureCatalog: PIPELINE_STATE_FIXTURE_CATALOG_V0.concat(safeFixture)
  }), { ok: true, failures: [] });
});

async function loadCompiledMatrix() {
  const outDir = await mkdtemp(join(tmpdir(), "pipeline-state-matrix-"));
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
      "packages/workflow-core/src/pipeline-state-fixture-matrix.ts"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return import(pathToFileURL(join(outDir, "pipeline-state-fixture-matrix.js")).href);
}

function validGateAction(overrides = {}) {
  const actionId = "fixture:human-gate-blocked:action:approve_execution";
  return {
    actionId,
    type: "approve_execution",
    family: "Approve",
    label: "Approve execution",
    uiCopy: "Approve execution with fixture evidence.",
    status: "available",
    authorityFamily: "operator.execution.fixture",
    payload: {
      packetId: "fixture:human-gate-blocked",
      actionId,
      decisionId: "fixture:human-gate-blocked:decision:current"
    },
    requiredEvidenceRefs: ["fixture:human-gate-blocked:evidence:fixture"],
    reasonCodes: ["human_gate.status.available"],
    stopLines: ["Do not launch real workers."],
    rollbackPath: "Return to Shape with fixture evidence preserved.",
    resultingStage: "execute",
    resultingOwner: "codex_worker",
    auditEventType: "human_gate.approve_execution.fixture",
    ...overrides
  };
}
