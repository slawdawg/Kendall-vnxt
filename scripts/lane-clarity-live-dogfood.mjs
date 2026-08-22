#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, webkit } from "@playwright/test";

import { ledgerCommand } from "./lib/manager-control-plane/core.mjs";
import { runManagerRunLoop } from "./manager-run-loop.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const dashboardPort = 3102;
const supervisorPort = 8113;
const staleSupervisorPort = 8114;
const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
const supervisorUrl = `http://127.0.0.1:${supervisorPort}`;
const staleSupervisorUrl = `http://127.0.0.1:${staleSupervisorPort}`;
const nextBinary = join(rootDir, "apps/dashboard/node_modules/.bin/next");
const children = new Set();
let tempRoot = null;

const targets = [
  { label: "windows-11-chromium", browserType: chromium, context: { viewport: { width: 1440, height: 960 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36" } },
  { label: "ipad-pro-gen-2-webkit-approximation", browserType: webkit, context: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1" } },
  { label: "iphone-15-pro-max-webkit-approximation", browserType: webkit, context: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1" } },
];

try {
  preflight();
  await assertPortsAvailable([dashboardPort, supervisorPort, staleSupervisorPort]);
  tempRoot = await mkdtemp(join(tmpdir(), "kendall-lane-clarity-dogfood-"));
  const baseEnv = disposableEnvironment(tempRoot, dashboardUrl);

  let supervisor = startSupervisor(supervisorPort, join(tempRoot, "live.db"), baseEnv, "supervisor-live");
  await waitForUrl(`${supervisorUrl}/health`, supervisor, 60_000);
  const published = await runNormalManagerCycle({ stateRoot: join(tempRoot, "manager-live"), supervisorUrl, clarity: coherentClarity(), observedAt: new Date().toISOString() });
  assert.equal(published.summary.laneClarityHandoff.state, "published");
  assert.equal(published.summary.laneClarityHandoff.persisted, true);

  const handoffId = published.summary.laneClarityHandoff.handoffId;
  const receipt = await jsonData(`${supervisorUrl}/manager-control-plane/lane-clarity-handoffs/${encodeURIComponent(handoffId)}`);
  assert.equal(receipt.handoffId, handoffId);
  assert.equal(receipt.laneClarity.goal.summary, coherentClarity().goal.summary);
  const projection = await jsonData(`${supervisorUrl}/pipeline-control-plane/canonical-operational-projection`);
  assert.equal(projection.schemaVersion, "dashboard-canonical-operational-projection/v1");
  assert.equal(projection.activeManagerLaneClarity?.goal?.summary, coherentClarity().goal.summary);
  assert.equal(projection.activeManagerLaneClarity?.posture?.state, "on_scope");

  let dashboard = startDashboard(supervisorUrl, baseEnv, "dashboard-live");
  await waitForUrl(`${dashboardUrl}/pipeline`, dashboard, 120_000);
  const renderedTargets = [];
  for (const target of targets) {
    await assertLaneClarityCard(target, dashboardUrl, true);
    renderedTargets.push(target.label);
  }
  await stopProcess(dashboard);
  await stopProcess(supervisor);

  supervisor = startSupervisor(staleSupervisorPort, join(tempRoot, "stale.db"), baseEnv, "supervisor-stale");
  await waitForUrl(`${staleSupervisorUrl}/health`, supervisor, 60_000);
  const unavailable = await runNormalManagerCycle({ stateRoot: join(tempRoot, "manager-stale"), supervisorUrl: staleSupervisorUrl, clarity: staleClarity(), observedAt: new Date().toISOString() });
  assert.equal(unavailable.summary.laneClarityHandoff.state, "unavailable");
  assert.equal(unavailable.summary.laneClarityHandoff.failureCode, "coherent_lane_clarity_unavailable");
  const staleProjection = await jsonData(`${staleSupervisorUrl}/pipeline-control-plane/canonical-operational-projection`);
  assert.equal(staleProjection.schemaVersion, "dashboard-canonical-operational-projection/v1");
  assert.equal(staleProjection.activeManagerLaneClarity, null);

  dashboard = startDashboard(staleSupervisorUrl, baseEnv, "dashboard-stale");
  await waitForUrl(`${dashboardUrl}/pipeline`, dashboard, 120_000);
  for (const target of targets) await assertLaneClarityCard(target, dashboardUrl, false);
  await stopProcess(dashboard);
  await stopProcess(supervisor);

  console.log(JSON.stringify({
    schemaVersion: "lane-clarity-live-dogfood/v0",
    status: "passed",
    evidenceLevel: "integrated_local",
    receipt: { handoffId, exactReadback: true, metadataOnly: true, rawPayloadRetained: false },
    projection: { activeManagerLaneClarity: "present_then_null" },
    browserTargets: renderedTargets,
    failClosed: { receiptState: unavailable.summary.laneClarityHandoff.state, browserCard: "absent" },
    ports: { dashboardAutomation: dashboardPort, supervisor: supervisorPort, staleSupervisor: staleSupervisorPort, mainDashboardUntouched: 3000 },
    retention: { database: "disposable_removed", pageHtml: "not_retained", screenshots: "not_captured" },
  }));
} catch (error) {
  console.error(`Lane Clarity live dogfood failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([...children].map(stopProcess));
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
}

function preflight() {
  for (const [label, command, args] of [["Node", process.execPath, ["--version"]], ["uv", "uv", ["--version"]]]) {
    try { execFileSync(command, args, { cwd: rootDir, stdio: "ignore" }); } catch (error) { throw new Error(`${label} is required for this integrated-local proof.`, { cause: error }); }
  }
  if (!existsSync(nextBinary)) throw new Error(`Dashboard binary is missing: ${nextBinary}. Run pnpm install first.`);
  for (const browserType of [chromium, webkit]) {
    if (!existsSync(browserType.executablePath())) throw new Error(`Playwright ${browserType.name()} is unavailable. Install the configured browser before this required target-matrix proof.`);
  }
}

function disposableEnvironment(root, corsOrigin) {
  return {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    SUPERVISOR_ALLOW_DIRTY_REPO: "true",
    SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS: "false",
    SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS: "false",
    SUPERVISOR_ALLOW_PREMIUM_EXECUTION: "false",
    SUPERVISOR_ALLOW_REMOTE_DELIVERY: "false",
    SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH: "false",
    SUPERVISOR_ALLOW_WORKER_SOURCE_MUTATION: "false",
    SUPERVISOR_ENABLE_BACKGROUND: "false",
    SUPERVISOR_CORS_ORIGINS: corsOrigin,
    UV_CACHE_DIR: join(root, "uv-cache"),
  };
}

function startSupervisor(port, dbPath, env, label) {
  return startProcess("uv", ["run", "--directory", "services/supervisor", "uvicorn", "supervisor.api.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    label, env: { ...env, SUPERVISOR_DATABASE_URL: `sqlite+aiosqlite:///${dbPath}` },
  });
}

function startDashboard(url, env, label) {
  return startProcess(nextBinary, ["dev", "apps/dashboard", "--hostname", "127.0.0.1", "--port", String(dashboardPort)], {
    label, env: { ...env, NEXT_PUBLIC_SUPERVISOR_URL: url, SUPERVISOR_INTERNAL_URL: url },
  });
}

function startProcess(command, args, { label, env }) {
  const child = spawn(command, args, { cwd: rootDir, env, stdio: ["ignore", "pipe", "pipe"] });
  child.kendallLabel = label;
  // Consume child output so local processes cannot block, but do not retain or
  // print it as dogfood evidence.
  for (const stream of [child.stdout, child.stderr]) stream.resume();
  child.once("error", (error) => { child.kendallSpawnError = error; });
  children.add(child);
  return child;
}

async function runNormalManagerCycle({ stateRoot, supervisorUrl, clarity, observedAt }) {
  const runId = "lane-clarity-dogfood";
  assert.equal(ledgerCommand({ command: "init", runId, stateRoot }).status, "ready");
  const packets = [];
  await runManagerRunLoop(
    { runId, stateRoot, maxIterations: 1, heartbeatEvery: 1, runtimeMode: "continuous_dry_run", laneClaritySupervisorUrl: supervisorUrl },
    {
      buildPreflight: () => ({ ok: true, status: "ready", summary: {}, blockers: [], warnings: [] }),
      buildContinuousRunPlan: () => ({
        ok: true, status: "ready", blockers: [], warnings: [], nextActions: [],
        summary: {
          workerCounts: { active: 0, warm: 0, paused: 0 }, usageState: "normal", resourceState: "normal",
          selectedAction: null, applySelectedAction: null, runtimeReadiness: { allowedExecutionMode: "continuous_dry_run" },
          managerExecutionLaneSummary: { laneClarity: clarity, lastObservedAt: observedAt },
        },
      }),
      writePacket: (packet) => packets.push(packet),
      sleep: async () => {},
    },
  );
  assert.equal(packets.length, 1);
  return packets[0];
}

async function assertLaneClarityCard(target, url, expected) {
  const browser = await target.browserType.launch();
  try {
    const context = await browser.newContext(target.context);
    const page = await context.newPage();
    await page.goto(`${url}/pipeline`, { waitUntil: "networkidle" });
    const heading = page.getByRole("heading", { name: "Lane Clarity" });
    if (!expected) {
      assert.equal(await heading.count(), 0, `${target.label} fabricated a Lane Clarity card for the fail-closed path`);
      await context.close();
      return;
    }
    await assert.doesNotReject(heading.waitFor({ state: "visible", timeout: 15_000 }));
    const card = page.getByRole("status", { name: "Lane clarity" });
    await assert.doesNotReject(card.getByText(coherentClarity().goal.summary, { exact: true }).waitFor({ state: "visible", timeout: 15_000 }));
    await assert.doesNotReject(card.getByText("On scope", { exact: true }).waitFor({ state: "visible", timeout: 15_000 }));
    await assert.doesNotReject(card.getByText("Evidence: evidence:lane-clarity-dogfood", { exact: true }).waitFor({ state: "visible", timeout: 15_000 }));
    await context.close();
  } finally {
    await browser.close();
  }
}

function coherentClarity() {
  return {
    schemaVersion: "manager-lane-clarity/v0", runId: "run:lane-clarity-dogfood", eventWatermark: "event:lane-clarity-dogfood", sourceCursor: "1",
    goal: { summary: "Prove production Lane Clarity from one loopback receipt.", sourceRef: "requirement:lane-clarity-live-dogfood" },
    criteria: [{ criterionId: "criterion:lane-clarity-receipt", summary: "Supervisor receipt binds the current manager evidence.", disposition: "met", evidenceRefs: ["evidence:lane-clarity-dogfood"] }],
    canonicalState: { phase: "running", freshness: "fresh", evidenceFreshness: "fresh" },
    nextGate: { summary: "Render the production Lane Clarity card.", nextSafeAction: "verify_pipeline_render" },
    posture: { state: "on_scope", reason: "Current loopback receipt is coherent.", nextSafeAction: "verify_pipeline_render", decisionRef: null, qualification: null },
    metadataOnly: true, rawPayloadRetained: false,
  };
}

function staleClarity() {
  return { ...coherentClarity(), sourceCursor: "2", canonicalState: { phase: "running", freshness: "stale", evidenceFreshness: "stale" }, posture: { state: "not_assessed", reason: "Stale source evidence must not publish.", nextSafeAction: "record_current_lane_evidence", decisionRef: null, qualification: null } };
}

async function assertPortsAvailable(ports) {
  for (const port of ports) await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Required explicit loopback port ${port} is unavailable; do not choose an alternate port.`)));
    server.listen(port, "127.0.0.1", () => server.close((error) => error ? reject(error) : resolve()));
  });
}

async function waitForUrl(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    if (child.kendallSpawnError) throw new Error(`${child.kendallLabel} failed to spawn: ${child.kendallSpawnError.message}`);
    if (child.exitCode !== null) throw new Error(`${child.kendallLabel} exited ${child.exitCode}.`);
    try { const response = await fetch(url); if (response.ok) return; lastError = `${response.status} ${response.statusText}`; } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${child.kendallLabel} did not become ready at ${url}: ${lastError}`);
}

async function jsonData(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  const body = await response.json();
  assert.ok(body && Object.hasOwn(body, "data"), `${url} did not return an API envelope`);
  return body.data;
}

async function stopProcess(child) {
  if (!child) return;
  children.delete(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([new Promise((resolve) => child.once("exit", () => resolve(true))), new Promise((resolve) => setTimeout(() => resolve(false), 10_000))]);
  if (!stopped) { child.kill("SIGKILL"); await new Promise((resolve) => child.once("exit", resolve)); }
}
