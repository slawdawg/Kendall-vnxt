import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildConsumptionRequest, consumePrivateHermesDeliveryAdmission } from "./lib/hermes-delivery-admission.mjs";

const head = "a".repeat(40);
const input = Object.freeze({
  taskId: "task:delivery-one", outcomeId: "outcome:one", laneRunId: "lane:one",
  deliveryStewardIdentity: "delivery:one", deliveryHome: "/tmp/delivery-home", deliveryWorkspace: "/tmp/delivery-workspace",
  deliveryCapabilityBindingId: "capability:delivery-one", deliveryCapabilityProof: "d".repeat(32),
  requestedAction: "request_review", requestedReviewer: "reviewer-one", pullRequestNumber: 920, exactHeadSha: head,
});

function receipt(request, extra = {}) {
  const now = new Date();
  const later = new Date(now.getTime() + 60_000);
  return {
    admissionId: "delivery-admission:one", consumptionResultId: "delivery-admission-consumed:one",
    taskId: request.taskId, outcomeId: request.outcomeId, laneRunId: request.laneRunId, schemaVersion: "hermes_delivery_admission_receipt.v2",
    requestedAction: request.requestedAction, requestedReviewer: request.requestedReviewer, decision: "allowed", repository: "slawdawg/Kendall-vnxt", baseBranch: "dev",
    pullRequestNumber: request.pullRequestNumber, exactHeadSha: request.exactHeadSha, auditFingerprint: "b".repeat(64),
    issuedAt: now.toISOString(), expiresAt: later.toISOString(), claimId: request.claimId, claimedAt: now.toISOString(),
    metadataOnly: true, rawPayloadRetained: false, ...extra,
  };
}

async function withPrivateServer(handler, fn) {
  const root = mkdtempSync(join(tmpdir(), "hermes-delivery-admission-"));
  const socketPath = join(root, "supervisor.sock");
  const server = createServer(handler);
  await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  chmodSync(socketPath, 0o600);
  try {
    return await fn(socketPath);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

test("private delivery admission consumes exact capability-bound metadata before mutation", async () => {
  let observed;
  await withPrivateServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(receipt(observed)));
  }, async (socketPath) => {
    const consumed = await consumePrivateHermesDeliveryAdmission(input, { supervisorTransport: "private_uds", supervisorUdsPath: socketPath, lanAuthDir: dirname(socketPath) });
    assert.equal(consumed.taskId, input.taskId);
    assert.equal(consumed.consumptionResultId, "delivery-admission-consumed:one");
  });
  assert.equal(observed.requestedAction, input.requestedAction);
  assert.equal(observed.requestedReviewer, input.requestedReviewer);
  assert.equal(observed.schemaVersion, "hermes_delivery_admission_claim.v2");
  assert.equal(observed.exactHeadSha, input.exactHeadSha);
  assert.equal(observed.deliveryCapabilityProof, input.deliveryCapabilityProof);
  assert.match(observed.claimId, /^delivery-claim:/);
});

test("private delivery admission rejects a response not bound to the generated exact claim", async () => {
  await withPrivateServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(receipt(requestBody, { exactHeadSha: "b".repeat(40) })));
  }, async (socketPath) => {
    await assert.rejects(
      consumePrivateHermesDeliveryAdmission(input, { supervisorTransport: "private_uds", supervisorUdsPath: socketPath, lanAuthDir: dirname(socketPath) }),
      /untrusted or stale receipt/,
    );
  });
});

test("private delivery admission rejects a response bound to another reviewer", async () => {
  await withPrivateServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(receipt(requestBody, { requestedReviewer: "reviewer-two" })));
  }, async (socketPath) => {
    await assert.rejects(
      consumePrivateHermesDeliveryAdmission(input, { supervisorTransport: "private_uds", supervisorUdsPath: socketPath, lanAuthDir: dirname(socketPath) }),
      /untrusted or stale receipt/,
    );
  });
});

test("private delivery admission fails closed without the configured private UDS", async () => {
  await assert.rejects(
    consumePrivateHermesDeliveryAdmission(input, { supervisorTransport: "loopback" }),
    /private Supervisor UDS transport/,
  );
});

test("private delivery admission rejects a socket outside the protected LAN-auth directory before sending the proof", async () => {
  let called = false;
  await withPrivateServer((request, response) => {
    called = true;
    response.statusCode = 200;
    response.end("{}");
  }, async (socketPath) => {
    await assert.rejects(
      consumePrivateHermesDeliveryAdmission(input, { supervisorTransport: "private_uds", supervisorUdsPath: socketPath, lanAuthDir: join(dirname(socketPath), "untrusted") }),
      /source-owned LAN-auth supervisor socket/,
    );
  });
  assert.equal(called, false);
});

test("production delivery ignores caller-selected LAN-auth socket environment", async () => {
  const prior = {
    transport: process.env.KENDALL_SUPERVISOR_TRANSPORT,
    socket: process.env.KENDALL_SUPERVISOR_UDS_PATH,
    authDir: process.env.KENDALL_LAN_AUTH_DIR,
    home: process.env.HOME,
  };
  let called = false;
  try {
    await withPrivateServer((request, response) => {
      called = true;
      response.statusCode = 200;
      response.end("{}");
    }, async (socketPath) => {
      process.env.KENDALL_SUPERVISOR_TRANSPORT = "private_uds";
      process.env.KENDALL_SUPERVISOR_UDS_PATH = socketPath;
      process.env.KENDALL_LAN_AUTH_DIR = dirname(socketPath);
      process.env.HOME = dirname(socketPath);
      await assert.rejects(consumePrivateHermesDeliveryAdmission(input), /private Supervisor UDS endpoint (is unavailable|is not a protected same-user LAN-auth socket)/);
    });
  } finally {
    for (const [key, value] of Object.entries({ KENDALL_SUPERVISOR_TRANSPORT: prior.transport, KENDALL_SUPERVISOR_UDS_PATH: prior.socket, KENDALL_LAN_AUTH_DIR: prior.authDir, HOME: prior.home })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  assert.equal(called, false);
});

test("private delivery admission reuses only the persisted exact claim identity", () => {
  const request = buildConsumptionRequest({ ...input, claimId: "delivery-claim:replay-one" });
  assert.equal(request.claimId, "delivery-claim:replay-one");
  assert.throws(() => buildConsumptionRequest({ ...input, claimId: "bad claim" }), /claim identity/);
});

test("private delivery admission rejects an unbound request-review recipient", () => {
  assert.throws(() => buildConsumptionRequest({ ...input, requestedReviewer: null }), /exact reviewer/);
});
