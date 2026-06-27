import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const mapperPath = new URL("../packages/workflow-core/src/work-packet-stage-map.ts", import.meta.url);
const workflowCoreIndexPath = new URL("../packages/workflow-core/src/index.ts", import.meta.url);
const packageJsonPath = new URL("../package.json", import.meta.url);

test("Work Packet stage mapper covers canonical source states and review guardrails", async () => {
  const [mapperSource, indexSource, packageJsonSource] = await Promise.all([
    readFile(mapperPath, "utf8"),
    readFile(workflowCoreIndexPath, "utf8"),
    readFile(packageJsonPath, "utf8")
  ]);
  const packageJson = JSON.parse(packageJsonSource);

  for (const exportedName of [
    "WorkPacketStageMappingInputV0",
    "WorkPacketStageMappingResultV0",
    "mapWorkPacketStage"
  ]) {
    assert.match(mapperSource, new RegExp(`export (interface|function) ${exportedName}\\b`));
  }

  for (const workflowState of [
    "queued",
    "triaged",
    "ready",
    "implementing",
    "validating",
    "reviewing",
    "awaiting_audit",
    "needs_rework",
    "blocked",
    "done"
  ]) {
    assert.match(mapperSource, new RegExp(`\\b${workflowState}\\b`));
  }

  for (const candidateStatus of ["proposed", "approved", "rejected", "deferred"]) {
    assert.match(mapperSource, new RegExp(`\\b${candidateStatus}\\b`));
  }

  for (const executionStatus of [
    "planned",
    "approved",
    "starting",
    "running",
    "cancel_requested",
    "cancelled",
    "timed_out",
    "failed",
    "completed",
    "rejected"
  ]) {
    assert.match(mapperSource, new RegExp(`\\b${executionStatus}\\b`));
  }

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
    "learn"
  ]) {
    assert.match(mapperSource, new RegExp(`"${stage}"`));
  }

  for (const owner of [
    "kendall",
    "operator",
    "local_model",
    "hermes_worker_mock",
    "hermes_execution_dry_run",
    "hermes_governed_execution",
    "claude_execution_dry_run",
    "claude_governed_execution",
    "codex_worker",
    "claude_reviewer",
    "github",
    "memory_review",
    "blocked"
  ]) {
    assert.match(mapperSource, new RegExp(`"${owner}"`));
  }

  assert.match(mapperSource, /ambiguityNotes:\s*string\[\]/);
  assert.match(mapperSource, /reasonCodes:\s*string\[\]/);
  assert.doesNotMatch(mapperSource, /rawPrompt|rawCompletion|reasoningTrace|providerPayload|secret|credential/);
  assert.match(indexSource, /export \* from "\.\/work-packet-stage-map";/);
  assert.equal(packageJson.scripts["test:work-packet-stage-map"], "node --test tests/work-packet-stage-map.test.mjs");
  assert.match(packageJson.scripts["check:static"], /pnpm run test:work-packet-stage-map/);
  assert.match(packageJson.scripts.check, /pnpm run test:work-packet-stage-map/);
});

test("Work Packet stage mapper handles precedence and ambiguous source state behavior", async () => {
  const { mapWorkPacketStage } = await loadCompiledMapper();

  const cases = [
    {
      name: "delivery evidence outranks memory proposal on done work",
      input: { workItemState: "done", hasDeliveryEvidence: true, deliveryOwner: "github", hasMemoryProposal: true },
      expected: {
        currentStage: "deliver",
        currentOwner: "github",
        status: "complete",
        reasonCodes: ["delivery.evidence_present", "precedence.delivery_over_memory"]
      },
      ambiguity: "delivery evidence takes Deliver precedence"
    },
    {
      name: "done work outranks stale failed execution attempt",
      input: { workItemState: "done", hasDeliveryEvidence: true, executionAttemptStatus: "failed" },
      expected: {
        currentStage: "deliver",
        currentOwner: "kendall",
        status: "complete",
        reasonCodes: ["delivery.evidence_present"]
      }
    },
    {
      name: "routing preview does not override ready human gate",
      input: { workItemState: "ready", hasRoutingPreview: true },
      expected: {
        currentStage: "human_gate",
        currentOwner: "operator",
        status: "waiting",
        reasonCodes: ["work_item.ready", "routing.preview_unexpected_state"]
      },
      ambiguity: "Routing preview is present outside the expected triaged state."
    },
    {
      name: "all standalone execution statuses map deterministically",
      input: { executionAttemptStatus: "planned" },
      expected: {
        currentStage: "shape",
        currentOwner: "kendall",
        status: "waiting",
        reasonCodes: ["execution_attempt.planned"]
      }
    },
    {
      name: "completed execution maps to review instead of source missing",
      input: { executionAttemptStatus: "completed" },
      expected: {
        currentStage: "review",
        currentOwner: "kendall",
        status: "complete",
        reasonCodes: ["execution_attempt.completed"]
      }
    },
    {
      name: "memory proposal state maps without done work while exposing contradiction",
      input: { memoryProposalStatus: "pending_human_approval" },
      expected: {
        currentStage: "learn",
        currentOwner: "memory_review",
        status: "waiting",
        reasonCodes: ["memory.pending_human_approval", "memory.proposal_without_done"]
      }
    },
    {
      name: "delivery evidence maps without done work while exposing contradiction",
      input: { hasDeliveryEvidence: true, deliveryOwner: "github" },
      expected: {
        currentStage: "deliver",
        currentOwner: "github",
        status: "complete",
        reasonCodes: ["delivery.evidence_without_done"]
      }
    },
    {
      name: "unsupported execution lane emits ambiguity instead of silent owner fallback",
      input: { executionAttemptStatus: "running", executionAttemptLane: "external_agent" },
      expected: {
        currentStage: "execute",
        currentOwner: "kendall",
        status: "active",
        reasonCodes: ["execution_attempt.running", "execution_lane.unsupported.external_agent"]
      },
      ambiguity: "falling back to Kendall"
    },
    {
      name: "local patch draft remains Kendall-owned until a worker is selected",
      input: { executionAttemptStatus: "running", executionAttemptLane: "local_patch_draft" },
      expected: {
        currentStage: "execute",
        currentOwner: "kendall",
        status: "active",
        reasonCodes: ["execution_attempt.running", "execution_lane.local_patch_draft_kendall_owned"]
      },
      ambiguity: "Kendall-owned until a worker is selected"
    },
    {
      name: "governed Claude execution maps visibly to Claude reviewer lane",
      input: { executionAttemptStatus: "running", executionAttemptLane: "claude_governed_execution" },
      expected: {
        currentStage: "execute",
        currentOwner: "claude_reviewer",
        status: "active",
        reasonCodes: ["execution_attempt.running", "execution_lane.claude_governed_execution"]
      }
    },
    {
      name: "governed Hermes execution maps visibly to Hermes lane when active",
      input: { executionAttemptStatus: "running", executionAttemptLane: "hermes_governed_execution" },
      expected: {
        currentStage: "execute",
        currentOwner: "hermes_worker_mock",
        status: "active",
        reasonCodes: ["execution_attempt.running", "execution_lane.hermes_governed_execution"]
      }
    },
    {
      name: "governed Hermes rejected execution maps visibly to blocked Hermes lane",
      input: { executionAttemptStatus: "rejected", executionAttemptLane: "hermes_governed_execution" },
      expected: {
        currentStage: "execute",
        currentOwner: "hermes_worker_mock",
        status: "blocked",
        reasonCodes: ["execution_attempt.rejected", "execution_lane.hermes_governed_execution"]
      }
    }
  ];

  for (const { name, input, expected, ambiguity } of cases) {
    const result = mapWorkPacketStage(input);
    assert.equal(result.currentStage, expected.currentStage, name);
    assert.equal(result.currentOwner, expected.currentOwner, name);
    assert.equal(result.status, expected.status, name);
    for (const reasonCode of expected.reasonCodes) {
      assert.ok(result.reasonCodes.includes(reasonCode), `${name}: missing reason ${reasonCode}`);
    }
    if (ambiguity) {
      assert.ok(result.ambiguityNotes.some((note) => note.includes(ambiguity)), `${name}: missing ambiguity note`);
    }
  }
});

async function loadCompiledMapper() {
  const outDir = await mkdtemp(join(tmpdir(), "work-packet-stage-map-"));
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
