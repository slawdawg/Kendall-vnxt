import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";

const CONSUME_PATH = "/internal/hermes-control-plane/delivery-admissions/consume";
const CANONICAL_REPOSITORY = "slawdawg/Kendall-vnxt";
const CANONICAL_BASE_BRANCH = "dev";
const MAX_RESPONSE_BYTES = 256 * 1024;

const safeText = (value, maxLength) => typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/.test(value);
const opaqueId = (value, maxLength = 120) => safeText(value, maxLength) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const exactHead = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const exactKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export async function consumePrivateHermesDeliveryAdmission(input, context = {}) {
  const socketPath = resolvePrivateSupervisorUdsPath(context);
  if (!socketPath) throw new Error("Hermes delivery admission requires the configured private Supervisor UDS transport.");
  const request = buildConsumptionRequest(input);
  let response;
  try {
    response = await requestPrivateSupervisorUds(socketPath, CONSUME_PATH, request);
  } catch {
    throw new Error("Hermes delivery admission could not reach the private Supervisor UDS.");
  }
  if (!response?.ok || response.status < 200 || response.status >= 300) {
    throw new Error(`Hermes delivery admission was denied by the private Supervisor (${response?.status ?? "unavailable"}).`);
  }
  let receipt;
  try {
    receipt = await response.json();
  } catch {
    throw new Error("Hermes delivery admission returned malformed metadata-only JSON.");
  }
  validateConsumptionReceipt(receipt, request);
  return receipt;
}

function resolvePrivateSupervisorUdsPath(context) {
  const transport = context.supervisorTransport ?? process.env.KENDALL_SUPERVISOR_TRANSPORT;
  if (transport !== "private_uds") return null;
  // Production delivery never accepts a caller-selected socket location. The
  // LAN-auth launcher owns this fixed protected directory; context overrides
  // exist solely for hermetic tests that inject a private socket.
  const authDir = context.lanAuthDir ?? join(userInfo().homedir, "kendall-lan-auth");
  const socketPath = context.supervisorUdsPath ?? join(resolve(authDir), "supervisor.sock");
  if (typeof authDir !== "string" || !authDir.trim() || authDir !== authDir.trim() || !authDir.startsWith("/") || authDir.includes("\0") || authDir.split("/").includes("..") || typeof socketPath !== "string" || !socketPath.trim() || socketPath !== socketPath.trim() || socketPath.length > 512 || !socketPath.startsWith("/") || socketPath.includes("\0") || socketPath.split("/").includes("..")) {
    throw new TypeError("private Supervisor UDS transport requires a safe absolute socket path.");
  }
  const protectedAuthDir = resolve(authDir);
  const protectedSocketPath = join(protectedAuthDir, "supervisor.sock");
  if (resolve(socketPath) !== protectedSocketPath) throw new TypeError("private Supervisor UDS path must be the source-owned LAN-auth supervisor socket.");
  assertPrivateSupervisorSocket(protectedSocketPath, protectedAuthDir);
  return protectedSocketPath;
}

function assertPrivateSupervisorSocket(socketPath, authDir) {
  let directory;
  let socket;
  try {
    directory = lstatSync(authDir);
    socket = lstatSync(socketPath);
  } catch {
    throw new Error("private Supervisor UDS endpoint is unavailable.");
  }
  const uid = process.getuid?.();
  if (!directory.isDirectory() || directory.isSymbolicLink() || !socket.isSocket() || socket.isSymbolicLink() || (Number.isInteger(uid) && (directory.uid !== uid || socket.uid !== uid)) || (directory.mode & 0o022) !== 0 || (socket.mode & 0o022) !== 0 || dirname(socketPath) !== authDir) {
    throw new Error("private Supervisor UDS endpoint is not a protected same-user LAN-auth socket.");
  }
}

function requestPrivateSupervisorUds(socketPath, path, bodyValue) {
  const body = JSON.stringify(bodyValue);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      socketPath,
      path,
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      timeout: 10_000,
    }, (response) => {
      const contentLength = Number(response.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        response.resume();
        reject(new Error("private Supervisor UDS response exceeds the metadata limit"));
        return;
      }
      const chunks = [];
      let received = 0;
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_RESPONSE_BYTES) response.destroy(new Error("private Supervisor UDS response exceeds the metadata limit"));
        else chunks.push(chunk);
      });
      response.once("error", reject);
      response.on("end", () => resolve({
        ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
        status: response.statusCode ?? 500,
        json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("private Supervisor UDS request timed out")));
    request.write(body);
    request.end();
  });
}

export function buildConsumptionRequest(input) {
  if (!input || typeof input !== "object") throw new TypeError("Hermes delivery admission input is required.");
  const requestedAction = input.requestedAction;
  if (!["request_review", "merge"].includes(requestedAction)) throw new TypeError("Hermes delivery admission action is not permitted.");
  if (!safeText(input.taskId, 160) || !opaqueId(input.outcomeId) || !opaqueId(input.laneRunId) || !safeText(input.deliveryStewardIdentity, 120) || !safeText(input.deliveryHome, 240) || !safeText(input.deliveryWorkspace, 240) || input.deliveryHome === input.deliveryWorkspace || !opaqueId(input.deliveryCapabilityBindingId) || !safeText(input.deliveryCapabilityProof, 512) || input.deliveryCapabilityProof.length < 24 || !Number.isSafeInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0 || !exactHead(input.exactHeadSha)) {
    throw new TypeError("Hermes delivery admission requires one exact Delivery capability-bound task, lane, PR, and head.");
  }
  const claimId = input.claimId ?? `delivery-claim:${randomUUID()}`;
  if (!opaqueId(claimId)) throw new TypeError("Hermes delivery admission claim identity is invalid.");
  return {
    claimId,
    taskId: input.taskId,
    outcomeId: input.outcomeId,
    laneRunId: input.laneRunId,
    deliveryStewardIdentity: input.deliveryStewardIdentity,
    deliveryHome: input.deliveryHome,
    deliveryWorkspace: input.deliveryWorkspace,
    deliveryCapabilityBindingId: input.deliveryCapabilityBindingId,
    deliveryCapabilityProof: input.deliveryCapabilityProof,
    requestedAction,
    pullRequestNumber: input.pullRequestNumber,
    exactHeadSha: input.exactHeadSha,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function validateConsumptionReceipt(receipt, request) {
  const fields = ["admissionId", "consumptionResultId", "taskId", "outcomeId", "laneRunId", "requestedAction", "decision", "repository", "baseBranch", "pullRequestNumber", "exactHeadSha", "auditFingerprint", "issuedAt", "expiresAt", "claimId", "claimedAt", "metadataOnly", "rawPayloadRetained"];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || !exactKeys(receipt, fields) || !opaqueId(receipt.admissionId) || !opaqueId(receipt.consumptionResultId) || receipt.taskId !== request.taskId || receipt.outcomeId !== request.outcomeId || receipt.laneRunId !== request.laneRunId || receipt.requestedAction !== request.requestedAction || receipt.decision !== "allowed" || receipt.repository !== CANONICAL_REPOSITORY || receipt.baseBranch !== CANONICAL_BASE_BRANCH || receipt.pullRequestNumber !== request.pullRequestNumber || receipt.exactHeadSha !== request.exactHeadSha || receipt.claimId !== request.claimId || !/^[0-9a-f]{64}$/.test(receipt.auditFingerprint) || !Number.isFinite(Date.parse(receipt.issuedAt)) || !Number.isFinite(Date.parse(receipt.claimedAt)) || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.issuedAt) > Date.parse(receipt.claimedAt) || Date.parse(receipt.claimedAt) > Date.parse(receipt.expiresAt) || Date.parse(receipt.expiresAt) <= Date.now() || receipt.metadataOnly !== true || receipt.rawPayloadRetained !== false) {
    throw new Error("Hermes delivery admission returned an untrusted or stale receipt.");
  }
}
