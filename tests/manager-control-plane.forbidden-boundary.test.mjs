import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  BACKEND_PROOF_BOUNDARY,
  buildBackendProofEvidencePacket,
  classifyBackendProofOperation,
  classifyBackendProofSourceBoundary
} from "../scripts/lib/manager-control-plane/forbidden-boundary.mjs";

const backendProofFiles = collectFiles("scripts/lib/manager-control-plane", {
  include: (path) =>
    (path.endsWith(".mjs") || path.endsWith(".js")) &&
    (
      path.endsWith("backend-proof-harness.mjs") ||
      path.endsWith("summary-json.mjs") ||
      path.endsWith("summary-projection.mjs") ||
      path.includes("/adapters/")
    )
});

const dashboardProjectionFiles = collectFiles("apps/dashboard/src/lib/pipeline", {
  include: (path) => path.endsWith(".ts") || path.endsWith(".tsx")
});

const workflowCoreFiles = collectFiles("packages/workflow-core/src/manager-control-plane", {
  include: (path) => path.endsWith(".ts")
});
workflowCoreFiles.push("packages/workflow-core/src/index.ts");
workflowCoreFiles.push("packages/workflow-core/src/ports/dispatcher-port.ts");
workflowCoreFiles.push("packages/workflow-core/src/ports/index.ts");

const contractFiles = collectFiles("packages/contracts/src/manager-control-plane", {
  include: (path) => path.endsWith(".ts")
});
contractFiles.push("packages/contracts/src/index.ts");

const expectedBackendProofFiles = [
  "scripts/lib/manager-control-plane/backend-proof-harness.mjs",
  "scripts/lib/manager-control-plane/summary-json.mjs",
  "scripts/lib/manager-control-plane/summary-projection.mjs",
  "scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs"
];

function collectFiles(root, { include }) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      files.push(...collectFiles(path, { include }));
    } else if (include(path)) {
      files.push(path);
    }
  }
  return files.sort();
}

test("backend proof classifies forbidden operations with stop reasons", () => {
  for (const operation of [
    "tmux.mutate",
    "codex_worker.launch",
    "github.delivery",
    "provider.call",
    "cleanup.apply",
    "bullmq.runtime",
    "redis.runtime",
    "sqlite.runtime",
    "hatchet.runtime",
    "supervisor.runtime",
    "child_process.worker_dispatch"
  ]) {
    const decision = classifyBackendProofOperation(operation);
    assert.equal(decision.allowed, false, operation);
    assert.equal(decision.authorityStage, "backend_proof");
    assert.equal(decision.authorityClass, "forbidden");
    assert.equal(decision.operation, operation);
    assert.match(decision.authorityStopReason, /backend_proof_forbids/);
  }

  assert.equal(classifyBackendProofOperation("memory_dispatcher.refill").allowed, true);
  assert.equal(classifyBackendProofOperation("summary_json.emit").allowed, true);
});

test("source boundary catches forbidden live-system code patterns", () => {
  const samples = {
    "tmux-send.mjs": "export const command = 'tmux send-keys codex C-m';",
    "tmux-array.mjs": "runner('tmux', ['send-keys', '-t', target, 'C-m']);",
    "worker-launch.mjs": "import { spawn } from 'node:child_process'; spawn('codex', []);",
    "worker-launch-sync.mjs": "import { spawnSync } from 'child_process'; spawnSync('codex', []);",
    "github.mjs": "export const command = 'gh pr create --fill';",
    "github-octokit.mjs": "import { Octokit } from '@octokit/rest';",
    "github-http.mjs": "fetch('https://api.github.com/repos/acme/project/pulls');",
    "git-push.mjs": "export const command = 'git push origin HEAD';",
    "provider.mjs": "process.env.OPENAI_API_KEY;",
    "provider-sdk.mjs": "import OpenAI from 'openai';",
    "provider-http.mjs": "fetch('https://api.openai.com/v1/responses');",
    "queue.mjs": "import { Queue } from 'bullmq'; import Redis from 'ioredis';",
    "queue-subpath.mjs": "import { Queue } from 'bullmq/dist/cjs'; import Redis from 'redis/client';",
    "sqlite.mjs": "import sqlite3 from 'sqlite3/promises';",
    "hatchet.mjs": "import { Hatchet } from '@hatchet-dev/typescript-sdk';",
    "supervisor.mjs": "import { app } from '../../services/supervisor/src/supervisor/application/service.py';",
    "cleanup.mjs": "export const command = 'node scripts/manager-cleanup-plan.mjs --apply';",
    "workspace-cleanup.mjs": "export const command = 'node ./scripts/codex-workspace.mjs cleanup-branches --apply';"
  };

  for (const [path, source] of Object.entries(samples)) {
    const result = classifyBackendProofSourceBoundary({ path, source, surface: "backend_proof" });
    assert.equal(result.ok, false, path);
    assert.equal(result.violations.length > 0, true, path);
    assert.equal(result.violations.every((violation) => violation.authorityStage === "backend_proof"), true);
  }
});

test("current backend proof source files stay inside allowed backend-proof boundaries", async () => {
  for (const expected of expectedBackendProofFiles) {
    assert.equal(backendProofFiles.includes(expected), true, `backend proof discovery missed ${expected}`);
  }
  for (const path of backendProofFiles) {
    const source = await readFile(path, "utf8");
    const result = classifyBackendProofSourceBoundary({ path, source, surface: "backend_proof" });
    assert.equal(result.ok, true, `${path}: ${result.violations.map((violation) => violation.operation).join(", ")}`);
  }
});

test("contracts workflow-core and dashboard projection obey import boundaries", async () => {
  for (const path of contractFiles) {
    const source = await readFile(path, "utf8");
    const result = classifyBackendProofSourceBoundary({ path, source, surface: "contracts" });
    assert.equal(result.ok, true, `${path}: ${result.violations.map((violation) => violation.operation).join(", ")}`);
  }
  for (const path of workflowCoreFiles) {
    const source = await readFile(path, "utf8");
    const result = classifyBackendProofSourceBoundary({ path, source, surface: "workflow_core" });
    assert.equal(result.ok, true, `${path}: ${result.violations.map((violation) => violation.operation).join(", ")}`);
  }
  for (const path of dashboardProjectionFiles) {
    const source = await readFile(path, "utf8");
    const result = classifyBackendProofSourceBoundary({ path, source, surface: "dashboard_projection" });
    assert.equal(result.ok, true, `${path}: ${result.violations.map((violation) => violation.operation).join(", ")}`);
  }
});

test("backend proof evidence packet names real fake and forbidden capabilities without raw retention", () => {
  const packet = buildBackendProofEvidencePacket({
    runId: "run-1",
    result: "blocked",
    evidenceRefs: [
      "evidence-boundary",
      "sk-1234567890abcdef",
      "raw",
      "provider",
      "rawPayloadEvidence",
      "raw_payload_evidence",
      "providerPayloadEvidence",
      "provider_payload_evidence",
      { label: "safe-label", rawPrompt: "do not retain" }
    ]
  });

  assert.equal(packet.authority_stage, "backend_proof");
  assert.equal(packet.result, "blocked");
  assert.equal(packet.metadata_only, true);
  assert.equal(packet.raw_payload_retained, false);
  assert.equal(packet.real.includes("contract_objects"), true);
  assert.equal(packet.fake.includes("simulated_worker_execution"), true);
  assert.equal(packet.forbidden.includes("live_tmux_mutation"), true);
  for (const forbiddenField of ["rawPrompt", "rawCompletion", "providerPayload", "secret", "rawWorkerTranscript", "unboundedLog"]) {
    assert.equal(forbiddenField in packet, false, forbiddenField);
  }
  assert.deepEqual(BACKEND_PROOF_BOUNDARY.forbiddenCapabilities, packet.forbidden);
  assert.notEqual(packet.forbidden, BACKEND_PROOF_BOUNDARY.forbiddenCapabilities);
  assert.equal(packet.evidence_refs.includes("metadata-only:safe-label"), true);
  assert.equal(packet.evidence_refs.includes("sk-1234567890abcdef"), false);
  assert.equal(packet.evidence_refs.includes("raw"), false);
  assert.equal(packet.evidence_refs.includes("provider"), false);
  assert.equal(packet.evidence_refs.includes("rawPayloadEvidence"), false);
  assert.equal(packet.evidence_refs.includes("raw_payload_evidence"), false);
  assert.equal(packet.evidence_refs.includes("providerPayloadEvidence"), false);
  assert.equal(packet.evidence_refs.includes("provider_payload_evidence"), false);
  assert.equal(packet.evidence_refs.includes("metadata-only:redacted"), true);
  assert.equal(Object.isFrozen(BACKEND_PROOF_BOUNDARY), true);
  assert.equal(Object.isFrozen(BACKEND_PROOF_BOUNDARY.forbiddenCapabilities), true);
});

test("backend proof runtime metadata sanitizer rejects prototype-special keys", () => {
  const runtimeProof = Object.create(null);
  runtimeProof.status = "metadata_proof_only";
  runtimeProof.__proto__ = { polluted: true };
  runtimeProof.constructor = { misleading: true };
  runtimeProof.prototype = { misleading: true };
  runtimeProof.safe = Object.create(null);
  runtimeProof.safe.status = "ok";
  runtimeProof.safe.__proto__ = { nestedPolluted: true };

  const packet = buildBackendProofEvidencePacket({
    runId: "run-1",
    result: "completed",
    evidenceRefs: ["runtime-port:verification-metadata-proof"],
    runtimeProof
  });

  assert.equal(Object.getPrototypeOf(packet.runtime_ports), null);
  assert.equal(Object.hasOwn(packet.runtime_ports, "__proto__"), false);
  assert.equal(Object.hasOwn(packet.runtime_ports, "constructor"), false);
  assert.equal(Object.hasOwn(packet.runtime_ports, "prototype"), false);
  assert.equal(Object.getPrototypeOf(packet.runtime_ports.safe), null);
  assert.equal(Object.hasOwn(packet.runtime_ports.safe, "__proto__"), false);
  assert.equal({}.polluted, undefined);
  assert.equal({}.nestedPolluted, undefined);
});

test("backend proof runtime metadata sanitizer redacts raw-payload string values", () => {
  const packet = buildBackendProofEvidencePacket({
    runId: "run-1",
    result: "blocked",
    evidenceRefs: ["runtime-port:metadata-proof"],
    runtimeProof: {
      status: "metadata_proof_only",
      completion: "raw completion transcript from provider payload",
      nested: {
        safe: "metadata-only status",
        token: "sk-1234567890abcdef",
        rawPayload: "rawPayload",
        providerPayload: "providerPayload",
        bareRaw: "raw",
        bareProvider: "provider"
      }
    }
  });

  assert.equal(packet.runtime_ports.status, "metadata_proof_only");
  assert.equal(packet.runtime_ports.completion, "metadata-only:redacted");
  assert.match(packet.runtime_ports.nested.safe, /^metadata-only:sha256:[0-9a-f]{32}$/);
  assert.equal(packet.runtime_ports.nested.token, "metadata-only:redacted");
  assert.equal(Object.hasOwn(packet.runtime_ports.nested, "rawPayload"), false);
  assert.equal(Object.hasOwn(packet.runtime_ports.nested, "providerPayload"), false);
  assert.equal(packet.runtime_ports.nested.bareRaw, "metadata-only:redacted");
  assert.equal(packet.runtime_ports.nested.bareProvider, "metadata-only:redacted");
  assert.equal(JSON.stringify(packet).includes("raw completion transcript"), false);
  assert.equal(JSON.stringify(packet).includes("sk-1234567890abcdef"), false);
  assert.equal(JSON.stringify(packet).includes("providerPayload"), false);
  assert.equal(JSON.stringify(packet).includes('"raw"'), false);
  assert.equal(JSON.stringify(packet).includes('"provider"'), false);
});

test("backend proof runtime metadata sanitizer redacts raw-payload safe-key values", () => {
  const packet = buildBackendProofEvidencePacket({
    runId: "run-1",
    result: "blocked",
    evidenceRefs: ["runtime-port:metadata-proof"],
    runtimeProof: {
      status: "raw",
      code: "raw_payload_evidence",
      blocker: "provider",
      verification: {
        command_id: "provider_payload_evidence"
      }
    }
  });

  assert.equal(packet.runtime_ports.status, "metadata-only:redacted");
  assert.equal(packet.runtime_ports.code, "metadata-only:redacted");
  assert.equal(packet.runtime_ports.blocker, "metadata-only:redacted");
  assert.equal(packet.runtime_ports.verification.command_id, "metadata-only:redacted");
  assert.equal(JSON.stringify(packet).includes('"raw"'), false);
  assert.equal(JSON.stringify(packet).includes("raw_payload_evidence"), false);
  assert.equal(JSON.stringify(packet).includes('"provider"'), false);
  assert.equal(JSON.stringify(packet).includes("provider_payload_evidence"), false);
});

test("backend proof runtime metadata sanitizer digests arbitrary caller strings", () => {
  const arbitraryCallerText = "Please summarize this lane exactly as written for the operator";
  const packet = buildBackendProofEvidencePacket({
    runId: "run-1",
    result: "blocked",
    evidenceRefs: ["runtime-port:metadata-proof"],
    runtimeProof: {
      status: "metadata_proof_only",
      completion: arbitraryCallerText,
      session: {
        approved_workspace_root: "/tmp/kendall/manager-control-plane/worktrees/"
      }
    }
  });

  assert.equal(packet.runtime_ports.status, "metadata_proof_only");
  assert.match(packet.runtime_ports.completion, /^metadata-only:sha256:[0-9a-f]{32}$/);
  assert.match(packet.runtime_ports.session.approved_workspace_root, /^metadata-only:sha256:[0-9a-f]{32}$/);
  assert.equal(JSON.stringify(packet).includes(arbitraryCallerText), false);
  assert.equal(JSON.stringify(packet).includes("/tmp/kendall/manager-control-plane/worktrees/"), false);
});
