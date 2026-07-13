#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRefillPlan } from "./lib/manager-control-plane/core.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const proofPath = join(rootDir, "tests/fixtures/pipeline/gate4-bmad-dashboard-e2e-proof-2026-07-12.json");
const baselineRevision = "bfe5e44b0bee9c0f2424fccf0a3b4a462592ada1";
const generator = "gate4-bmad-dashboard-e2e/v3";
const nextBinaryRef = "apps/dashboard/node_modules/.bin/next";
const nextBinary = join(rootDir, nextBinaryRef);
const storyKey = "91-1-gate-4-reconciled-bmad-dashboard-proof";
const sourceKey = "2099-01-01-gate-4-reconciled-bmad-dashboard-proof";
const sprintStatusRef = "_bmad-output/implementation-artifacts/sprint-status.yaml";
const storyRef = `${sprintStatusRef.slice(0, sprintStatusRef.lastIndexOf("/") + 1)}${storyKey}.md`;
const prdRef = `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-${sourceKey}/prd.md`;
const architectureRef = `_bmad-output/planning-artifacts/architecture-${sourceKey}.md`;
const epicsRef = `_bmad-output/planning-artifacts/epics-${sourceKey}.md`;
const readinessRef = `_bmad-output/planning-artifacts/implementation-readiness-report-${sourceKey}.md`;
const rawBodyMarker = "RAW_BMAD_BODY_GATE4_MUST_NOT_BE_RETAINED_91_1";
const forbiddenTables = [
  "candidate_work",
  "work_items",
  "workflow_events",
  "execution_attempts",
  "queue_leases",
  "queue_lease_actions",
  "pipeline_operational_action_records",
  "pipeline_operational_approvals",
  "audit_events",
  "memory_proposals",
  "manager_terminal_events",
];

const children = new Set();
const launchedTopLevelProcessLabels = new Set();
let tempRoot;
let bmadRoot;

try {
  preflight();
  tempRoot = await mkdtemp(join(tmpdir(), "kendall-gate4-bmad-dashboard-"));
  bmadRoot = join(tempRoot, "bmad-root");
  const trackedDigestBefore = await trackedSourceDigest();
  await installHierarchy(bmadRoot);

  const supervisorPort = await freeLoopbackPort("supervisor");
  const dashboardPort = await freeLoopbackPort("dashboard");
  const supervisorUrl = `http://127.0.0.1:${supervisorPort}`;
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
  const dbPath = join(tempRoot, "gate4-proof.db");
  const baseEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    KENDALL_BMAD_ROOT: bmadRoot,
    SUPERVISOR_ALLOW_DIRTY_REPO: "true",
    SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS: "false",
    SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS: "false",
    SUPERVISOR_ALLOW_PREMIUM_EXECUTION: "false",
    SUPERVISOR_ALLOW_REMOTE_DELIVERY: "false",
    SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH: "false",
    SUPERVISOR_ALLOW_WORKER_SOURCE_MUTATION: "false",
    SUPERVISOR_DATABASE_URL: `sqlite+aiosqlite:///${dbPath}`,
    SUPERVISOR_ENABLE_BACKGROUND: "false",
    SUPERVISOR_CORS_ORIGINS: dashboardUrl,
    UV_CACHE_DIR: join(tempRoot, "uv-cache"),
  };

  let supervisor = startProcess(
    "uv",
    ["run", "--directory", "services/supervisor", "uvicorn", "supervisor.api.main:app", "--host", "127.0.0.1", "--port", String(supervisorPort)],
    { env: baseEnv, label: "supervisor" },
  );
  await waitForUrl(`${supervisorUrl}/health`, supervisor, 60_000);

  const plan = buildRefillPlan(
    { runId: "gate4-bmad-dashboard-proof", desiredWorkers: 1, supervisorUrl },
    managerContext(bmadRoot),
  );
  const action = plan.nextActions.find((candidate) => candidate.code === "manager-source-intake-ready");
  assert.ok(action, `default local BMAD resolver did not produce manager-source-intake-ready: ${compact({
    status: plan.status,
    blockers: plan.blockers,
    warnings: plan.warnings,
    nextActionCodes: plan.nextActions?.map((candidate) => candidate.code),
    defaultBmadSourceResolution: plan.summary?.defaultBmadSourceResolution,
    sourceBackedPacketSeed: plan.summary?.sourceBackedPacketSeed,
  })}`);
  const provenance = plan.summary.sourceBackedPacketSeed.seedPacket.sourceProvenance;
  assert.equal(provenance.mode, "default_local_bmad");
  assert.equal(plan.summary.sourceBackedPacketSeed.seedPacket.callerSuppliedCandidateDefaults, undefined);

  const dryRun = await runGeneratedManagerCommand(action.dryRunCommand, baseEnv);
  assert.equal(dryRun.summary.sourceIntakePlan.fetchPerformed, false);
  assert.equal(await tableCount(dbPath, "authoritative_work_packets", baseEnv), 0);

  const integrated = await runGeneratedManagerCommand(action.applyCommand, baseEnv);
  assert.equal(integrated.summary.sourceIntakePlan.fetchPerformed, true);
  assert.deepEqual(integrated.summary.continuousSelection, dryRun.summary.continuousSelection);
  const intake = integrated.summary.seedPacket.supervisorIntake;
  assert.equal(intake.status, "persisted");
  assert.equal(intake.metadataOnly, true);
  assert.equal(intake.rawPayloadRetained, false);
  const packetId = intake.packetId;

  const lifecycle = await jsonData(`${supervisorUrl}/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}`);
  const firstSupervisorProof = await readSupervisorParity(supervisorUrl, packetId);
  assert.equal(await tableCount(dbPath, "authoritative_work_packets", baseEnv), 1);
  assert.equal(await tableCount(dbPath, "authoritative_work_packet_lifecycle_events", baseEnv), 1);
  assert.equal(lifecycle.history.length, 1);
  assert.equal(lifecycle.history[0].eventType, "packet.created");

  let dashboard = startDashboard(dashboardPort, supervisorUrl, baseEnv);
  await waitForUrl(`${dashboardUrl}/pipeline`, dashboard, 120_000);
  const firstDashboardProof = await readDashboardParity(dashboardUrl, firstSupervisorProof.detail);

  await stopProcess(dashboard);
  await stopProcess(supervisor);
  supervisor = startProcess(
    "uv",
    ["run", "--directory", "services/supervisor", "uvicorn", "supervisor.api.main:app", "--host", "127.0.0.1", "--port", String(supervisorPort)],
    { env: baseEnv, label: "supervisor-restart" },
  );
  await waitForUrl(`${supervisorUrl}/health`, supervisor, 60_000);
  const restartedLifecycle = await jsonData(`${supervisorUrl}/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}`);
  assert.deepEqual(restartedLifecycle, lifecycle);
  const restartedSupervisorProof = await readSupervisorParity(supervisorUrl, packetId);
  assert.deepEqual(restartedSupervisorProof.detail, firstSupervisorProof.detail);

  dashboard = startDashboard(dashboardPort, supervisorUrl, baseEnv);
  await waitForUrl(`${dashboardUrl}/pipeline`, dashboard, 120_000);
  const restartedDashboardProof = await readDashboardParity(dashboardUrl, restartedSupervisorProof.detail);
  await stopProcess(dashboard);
  await stopProcess(supervisor);

  const tableCounts = Object.fromEntries(await Promise.all(
    forbiddenTables.map(async (table) => [table, await tableCount(dbPath, table, baseEnv)]),
  ));
  assert.deepEqual(tableCounts, Object.fromEntries(forbiddenTables.map((table) => [table, 0])));
  assert.equal((await readFile(dbPath)).includes(Buffer.from(rawBodyMarker)), false, "raw BMAD body marker reached SQLite");
  await rm(bmadRoot, { recursive: true, force: true });
  assertDisposableRootRemoved(bmadRoot, "BMAD hierarchy");
  assert.equal(await trackedSourceDigest(), trackedDigestBefore, "tracked source bytes changed during proof");
  await rm(tempRoot, { recursive: true, force: true });
  assertDisposableRootRemoved(tempRoot, "runtime");

  const observed = {
    schemaVersion: "gate4-bmad-dashboard-e2e-proof/v3",
    status: "passed",
    skipped: 0,
    evidenceLevel: "integrated_local",
    command: "pnpm run test:gate4-bmad-dashboard-e2e",
    provenance: {
      baselineRevision,
      generator,
      commandVersion: 3,
      runnerSha256: `sha256:${createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex")}`,
    },
    manager: {
      sourceResolutionMode: provenance.mode,
      bundleSelection: provenance.bundleSelection,
      callerSuppliedCandidateDefaults: false,
      generatedIntakeAction: action.code,
      dryRunFetchPerformed: false,
      applyFetchPerformed: true,
      hierarchy: hierarchyProof(provenance),
    },
    supervisor: {
      packetId,
      packetCount: 1,
      lifecycleEventCount: 1,
      stage: firstSupervisorProof.detail.currentStage,
      status: firstSupervisorProof.detail.status,
      comparedFieldsParity: true,
      comparedFields: ["packetId", "sourceRefs", "currentStage", "status", "evidenceRefs"],
      metadataOnly: true,
    },
    dashboard: {
      actualProcess: true,
      binary: nextBinaryRef,
      listRoute: "/pipeline",
      detailRoute: `/pipeline/packets/${packetId}`,
      supervisorPacketMode: firstDashboardProof.supervisorPacketMode,
      comparedFieldsParity: true,
      comparedFields: ["packetId", "sourceRefs", "currentStage", "status", "evidenceRefs"],
      requestedPacketUsedSupervisorProjection: true,
      staticFallbackPacketsRenderedInList: firstDashboardProof.staticFallbackPacketsRenderedInList,
    },
    persistence: {
      supervisorRestartVerified: true,
      lifecycleParityAfterRestart: true,
      requestedPacketProjectionAfterRestart: restartedDashboardProof.supervisorPacketMode,
    },
    sideEffects: {
      tableCounts,
    },
    executionBoundary: {
      configuredDenials: {
        localProviderCalls: false,
        ollamaProviderCalls: false,
        premiumExecution: false,
        remoteDelivery: false,
        subscriptionAgentLaunch: false,
        workerSourceMutation: false,
        backgroundExecution: false,
      },
      launchedTopLevelProcessLabels: [...launchedTopLevelProcessLabels].sort(),
    },
    retention: {
      metadataOnly: true,
      hierarchyBodiesRetained: false,
      trackedSourceBytesUnchanged: true,
      isolatedBmadRootRemoved: true,
    },
    cleanup: {
      disposableBmadRootRemoved: true,
      disposableRuntimeRootRemoved: true,
    },
    denials: [
      "worker, provider, delivery, and source mutation capabilities configured denied",
      "no execution-attempt, queue, operational-action, audit, memory-proposal, or terminal-event rows observed",
      "tracked source bytes observed unchanged",
      "no bounded-live or production claim",
    ],
  };

  assert.deepEqual(restartedDashboardProof, firstDashboardProof);
  assert.deepEqual(JSON.parse(await readFile(proofPath, "utf8")), observed);
  console.log(JSON.stringify(observed, null, 2));
} catch (error) {
  console.error(`Gate 4 BMAD dashboard proof failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([...children].map(stopProcess));
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
}

function preflight() {
  for (const [label, command, args] of [
    ["Node", process.execPath, ["--version"]],
    ["uv", "uv", ["--version"]],
  ]) {
    try {
      execFileSync(command, args, { cwd: rootDir, stdio: "ignore" });
    } catch (error) {
      throw new Error(`${label} is required for the zero-skip joined proof.`, { cause: error });
    }
  }
  if (!existsSync(nextBinary)) {
    throw new Error(`Required dashboard binary is missing: ${nextBinaryRef}. Run pnpm install before this zero-skip proof.`);
  }
  try {
    execFileSync("git", ["cat-file", "-e", `${baselineRevision}^{commit}`], { cwd: rootDir, stdio: "ignore" });
  } catch (error) {
    throw new Error(`Recorded proof baseline revision is unavailable: ${baselineRevision}.`, { cause: error });
  }
}

function managerContext(bmadRoot) {
  return {
    bmadRoot,
    assignmentSummary: { summary: {
      backlogStatusCounts: { assignable: 0, closed: 0 },
      laneAssignmentStatusCounts: { claimed: 0 },
      workspaceAssignmentStatusCounts: { active: 0 },
    } },
    dispatchPreview: { counts: { dispatchable: 0, active: 0, blocked: 0 }, dispatch: { allowed: false } },
  };
}

async function installHierarchy(root) {
  const hierarchyFiles = [
    [join(root, sprintStatusRef), `source_key: ${sourceKey}\nsource_ref: ${epicsRef}\ndevelopment_status:\n  ${storyKey}: ready-for-dev\n`],
    [join(root, storyRef), `---\nstatus: ready-for-dev\n---\n\n# Story 91.1: Gate 4 Reconciled BMAD Dashboard Proof\n\n${rawBodyMarker}\n`],
    [join(root, prdRef), `---\nstatus: final\nauthoritative: true\n---\n\n# Gate 4 PRD\n\n${rawBodyMarker}\n`],
    [join(root, architectureRef), `---\nworkflowType: architecture\nstatus: complete\nauthoritative_prd: ${prdRef}\n---\n\n${rawBodyMarker}\n`],
    [join(root, epicsRef), `---\nworkflowType: epics-and-stories\nstatus: complete\nauthoritative_prd: ${prdRef}\nauthoritative_architecture: ${architectureRef}\n---\n\n${rawBodyMarker}\n`],
    [join(root, readinessRef), `---\nworkflowType: implementation-readiness\nstatus: complete\nauthoritative_prd: ${prdRef}\nauthoritative_architecture: ${architectureRef}\nauthoritative_epics: ${epicsRef}\n---\n\n${rawBodyMarker}\n`],
  ];
  for (const [path, contents] of hierarchyFiles) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, "utf8");
  }
}

function assertDisposableRootRemoved(path, label) {
  assert.equal(existsSync(path), false, `disposable ${label} root was not removed: ${path}`);
}

async function freeLoopbackPort(label) {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => reject(new Error(`Unable to allocate a loopback ${label} socket: ${error.message}`, { cause: error })));
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function startDashboard(port, supervisorUrl, env) {
  return startProcess(nextBinary, ["dev", "apps/dashboard", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...env, NEXT_PUBLIC_SUPERVISOR_URL: supervisorUrl, SUPERVISOR_INTERNAL_URL: supervisorUrl },
    label: "dashboard",
  });
}

function startProcess(command, args, { env, label }) {
  const child = spawn(command, args, { cwd: rootDir, env, stdio: ["ignore", "pipe", "pipe"] });
  child.kendallLabel = label;
  child.kendallLog = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      child.kendallLog = `${child.kendallLog}${chunk}`.slice(-24_000);
    });
  }
  child.once("error", (error) => {
    child.kendallSpawnError = error;
  });
  children.add(child);
  launchedTopLevelProcessLabels.add(label.replace(/-restart$/, ""));
  return child;
}

async function stopProcess(child) {
  if (!child) return;
  children.delete(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (!exited) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function waitForUrl(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    if (child.kendallSpawnError) throw new Error(`${child.kendallLabel} failed to spawn: ${child.kendallSpawnError.message}`);
    if (child.exitCode !== null) throw new Error(`${child.kendallLabel} exited ${child.exitCode} before ${url} became ready:\n${child.kendallLog}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${child.kendallLabel} did not become ready at ${url}: ${lastError}\n${child.kendallLog}`);
}

async function runGeneratedManagerCommand(command, env) {
  const argv = parseGeneratedCommand(command);
  assert.deepEqual(argv.slice(0, 2), ["node", "./scripts/manager-source-intake-cycle.mjs"]);
  const child = startProcess(process.execPath, argv.slice(1), { env, label: "manager-source-intake" });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode));
  });
  children.delete(child);
  assert.equal(code, 0, child.kendallLog);
  const jsonStart = child.kendallLog.indexOf("{");
  assert.notEqual(jsonStart, -1, `manager command emitted no JSON: ${child.kendallLog}`);
  return JSON.parse(child.kendallLog.slice(jsonStart));
}

function parseGeneratedCommand(command) {
  const tokens = [];
  let token = "";
  let quoted = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === "'") {
      quoted = !quoted;
    } else if (/\s/.test(character) && !quoted) {
      if (token) tokens.push(token);
      token = "";
    } else {
      token += character;
    }
  }
  if (quoted) throw new Error("manager-generated intake command contains an unterminated quote");
  if (token) tokens.push(token);
  return tokens;
}

async function jsonData(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  const body = await response.json();
  assert.ok(body && Object.hasOwn(body, "data"), `${url} did not return an API envelope`);
  return body.data;
}

async function readSupervisorParity(supervisorUrl, packetId) {
  const list = await jsonData(`${supervisorUrl}/work-packets`);
  const listed = list.find((packet) => packet.packetId === packetId);
  assert.ok(listed, `authoritative packet ${packetId} missing from /work-packets`);
  const detail = await jsonData(`${supervisorUrl}/work-packets/${encodeURIComponent(packetId)}`);
  const comparedFields = ["packetId", "sourceRefs", "currentStage", "status", "evidenceRefs"];
  assert.deepEqual(pickFields(detail, comparedFields), pickFields(listed, comparedFields));
  assert.equal(detail.currentStage, "capture");
  assert.equal(detail.status, "waiting");
  assert.equal(detail.candidateWork, null);
  assert.equal(detail.workItem, null);
  assert.equal(detail.lifecycleState.metadataOnly, true);
  assert.deepEqual(detail.sourceRefs.map((source) => source.refId), [`story:${storyRef}`]);
  assert.ok(detail.evidenceRefs.length > 0);
  return { detail };
}

async function readDashboardParity(dashboardUrl, packet) {
  const listHtml = await text(`${dashboardUrl}/pipeline`);
  const detailHtml = await text(`${dashboardUrl}/pipeline/packets/${encodeURIComponent(packet.packetId)}`);
  for (const value of [packet.packetId, packet.currentStage, packet.status, `story:${storyRef}`]) {
    assert.ok(listHtml.includes(value), `dashboard list omitted ${value}`);
    assert.ok(detailHtml.includes(value), `dashboard detail omitted ${value}`);
  }
  for (const evidence of packet.evidenceRefs) {
    assert.ok(listHtml.includes(evidence.refId), `dashboard list omitted ${evidence.refId}`);
    assert.ok(detailHtml.includes(evidence.refId), `dashboard detail omitted ${evidence.refId}`);
  }
  assert.ok(listHtml.includes("Supervisor packets"));
  assert.ok(listHtml.includes("fixture:happy-path"), "dashboard list did not render the documented static fallback packets");
  assert.ok(detailHtml.includes("supervisor WorkPacketV0 projection"));
  for (const forbidden of ["Fixture/non-live packet", "Fixture fallback", "Supervisor unavailable"]) {
    assert.equal(detailHtml.includes(forbidden), false, `dashboard detail used ${forbidden}`);
  }
  return { supervisorPacketMode: true, staticFallbackPacketsRenderedInList: true, packetId: packet.packetId, sourceRef: `story:${storyRef}` };
}

function pickFields(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

async function text(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return await response.text();
}

async function tableCount(dbPath, table, env) {
  const script = "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute('SELECT COUNT(*) FROM ' + sys.argv[2]).fetchone()[0])";
  const output = execFileSync("uv", ["run", "--directory", "services/supervisor", "python", "-c", script, dbPath, table], {
    cwd: rootDir,
    env,
    encoding: "utf8",
  });
  return Number.parseInt(output.trim(), 10);
}

async function trackedSourceDigest() {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: rootDir }).toString().split("\0").filter(Boolean).sort();
  const digest = createHash("sha256");
  for (const path of paths) {
    digest.update(path);
    digest.update("\0");
    digest.update(await readFile(join(rootDir, path)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function hierarchyProof(provenance) {
  return {
    sourceKey: provenance.sourceKey,
    storyKey: provenance.storyKey,
    members: Object.fromEntries([
      ["prd", provenance.prd],
      ["architecture", provenance.architecture],
      ["epics", provenance.epics],
      ["implementationReadiness", provenance.implementationReadiness],
      ["sprint", provenance.sprint],
      ["story", provenance.story],
    ].map(([name, member]) => [name, member])),
  };
}

function compact(value) {
  return JSON.stringify(value ?? []).slice(0, 2_000);
}
