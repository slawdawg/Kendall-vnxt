import assert from "node:assert/strict";
import fs from "node:fs";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, get } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const viewModelPath = new URL("../apps/dashboard/src/lib/local-dogfood-attestation-view-model.ts", import.meta.url);
const cockpitPath = new URL("../apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", import.meta.url);

async function loadViewModel() {
  const source = await readFile(viewModelPath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, module: { exports: {} } };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "local-dogfood-attestation-view-model.ts" });
  return context.module.exports;
}

test("local attestation detail has stable text-first accepted and rejection states", async () => {
  const { buildLocalDogfoodAttestationViewModel } = await loadViewModel();
  const accepted = buildLocalDogfoodAttestationViewModel({
    receiptState: "accepted", expiresAt: "2026-07-15T12:00:00Z", replayState: "not_replayed",
    evidenceClass: "integrated_local", liveEvidenceAccepted: false,
  });
  assert.equal(accepted.result, "Accepted");
  assert.equal(accepted.nextSafeAction, "No action needed. This receipt remains integrated local only.");
  assert.equal(accepted.liveObserved, false);

  for (const [rejectionReason, expectedResult, expectedNext] of [
    ["expired_or_future_receipt", "Expired", "Issue a new local authorization and receipt."],
    ["replay", "Replayed", "Create a new local authorization and receipt; do not reuse the prior receipt."],
    ["binding_mismatch", "Wrong target", "Create a receipt bound to this exact packet target."],
    ["invalid_signature", "Wrong key or issuer", "Use the authorized local issuer and development key."],
    ["authorization_not_found", "Unavailable", "Create or read a local authorization for this packet before verifying a receipt."],
  ]) {
    const state = buildLocalDogfoodAttestationViewModel({
      receiptState: rejectionReason === "authorization_not_found" ? "unavailable" : "rejected",
      rejectionReason,
      expiresAt: null,
      replayState: rejectionReason === "replay" ? "replayed" : "unknown",
      evidenceClass: "integrated_local",
      liveEvidenceAccepted: false,
    });
    assert.equal(state.result, expectedResult);
    assert.equal(state.nextSafeAction, expectedNext);
    assert.equal(state.liveObserved, false);
    assert.equal(state.blocking, true);
  }
});

test("local detail clears its last packet readback before a new target fetch", () => {
  const source = fs.readFileSync("apps/dashboard/src/components/pipeline/local-dogfood-attestation-panel.tsx", "utf8");
  assert.match(source, /setState\(\{ kind: "loading" \}\)/);
  assert.match(source, /bridgeAvailable, bridgeOrigin, enabled, targetRef/);
});

test("dashboard attestation readback uses only the explicitly configured numeric-loopback bridge", () => {
  const panel = fs.readFileSync("apps/dashboard/src/components/pipeline/local-dogfood-attestation-panel.tsx", "utf8");
  const bridge = fs.readFileSync("apps/dashboard/scripts/local-dogfood-attestation-bridge.mjs", "utf8");
  assert.match(panel, /NEXT_PUBLIC_LOCAL_DOGFOOD_ATTESTATION_BRIDGE_ORIGIN/);
  assert.match(panel, /127\\\.0\\\.0\\\.1/);
  assert.doesNotMatch(panel, /\/api\/local-dogfood-attestations/);
  assert.doesNotMatch(panel, /NEXT_PUBLIC_SUPERVISOR_URL|:8000|localSupervisorUrl/);
  assert.equal(fs.existsSync("apps/dashboard/src/app/api/local-dogfood-attestations/targets/[targetRef]/route.ts"), false);
  assert.match(bridge, /KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST must be exactly 127\.0\.0\.1 or ::1/);
  assert.match(bridge, /request\.socket\.remoteAddress/);
  assert.match(bridge, /httpRequest\(\{ socketPath/);
  assert.doesNotMatch(bridge, /NEXT_PUBLIC_SUPERVISOR_URL|:8000/);
});

test("numeric bridge rejects non-numeric bind config and performs a GET-only local UDS read", async () => {
  const bridge = await import(new URL("../apps/dashboard/scripts/local-dogfood-attestation-bridge.mjs", import.meta.url));
  assert.throws(() => bridge.resolveBridgeConfig({
    KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST: "localhost", KENDALL_LOCAL_DOGFOOD_BRIDGE_PORT: "8102",
    KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN: "http://127.0.0.1:3102", SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH: "/tmp/supervisor.sock",
  }), /exactly 127\.0\.0\.1 or ::1/);
  assert.throws(() => bridge.resolveBridgeConfig({
    KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST: "127.0.0.1", KENDALL_LOCAL_DOGFOOD_BRIDGE_PORT: "8102",
    KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN: "http:\/\/localhost:3102", SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH: "/tmp/supervisor.sock",
  }), /numeric-loopback/);
  assert.equal(bridge.resolveBridgeConfig({
    KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST: "::1", KENDALL_LOCAL_DOGFOOD_BRIDGE_PORT: "8102",
    KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN: "http://[::1]:3102", SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH: "/tmp/supervisor.sock",
  }).dashboardOrigin, "http://[::1]:3102");
  assert.equal(bridge.isLoopbackPeer("127.0.0.1"), true);
  assert.equal(bridge.isLoopbackPeer("203.0.113.1"), false);

  const root = await mkdtemp(path.join(tmpdir(), "kendall-bridge-"));
  const socketPath = path.join(root, "supervisor.sock");
  const supervisor = createServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/local-dogfood/attestations/targets/packet%3Aepic-25");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: { receiptState: "accepted" } }));
  });
  await new Promise((resolve) => supervisor.listen(socketPath, resolve));
  await chmod(socketPath, 0o600);
  const server = bridge.createBridgeServer({ host: "127.0.0.1", port: 0, socketPath, dashboardOrigin: "http://127.0.0.1:3102" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address === "object" && address.address, "127.0.0.1");
  const response = await new Promise((resolve, reject) => get({ hostname: "127.0.0.1", port: address.port, path: "/local-dogfood-attestations/targets/packet%3Aepic-25", headers: { origin: "http://127.0.0.1:3102", host: "attacker.invalid" } }, (incoming) => {
    let body = ""; incoming.on("data", (chunk) => { body += chunk; }); incoming.on("end", () => resolve({ status: incoming.statusCode, body }));
  }).once("error", reject));
  assert.equal(response.status, 200);
  assert.match(response.body, /accepted/);
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => supervisor.close(resolve));
  await rm(root, { recursive: true, force: true });
});

test("compact packet cards retain the two-fact text and accessible-name budget", async () => {
  const source = await readFile(cockpitPath, "utf8");
  const component = source.slice(source.indexOf("function PacketMiniCard"), source.indexOf("function StaleHistoryPanel"));
  assert.match(component, /aria-label=\{`\$\{miniCardLabel\(packet\)\}; \$\{packetCardStatusLabel\(packet\)\}`\}/);
  assert.match(component, /pipeline-mini-packet-label/);
  assert.match(component, /pipeline-mini-packet-meta/);
  for (const forbiddenFact of ["packetCardStageLabel", "packetCardTruthLabel", "packetCardNextLabel", "authoritativePacketLine", "packetCardAttentionReasonLabel", "packetCardOperatorActionLabel", "pipeline-mini-packet-proof"]) {
    assert.equal(component.includes(forbiddenFact), false, `${forbiddenFact} must stay out of compact cards`);
  }
});
