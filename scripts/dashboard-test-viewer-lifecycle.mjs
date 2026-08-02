#!/usr/bin/env node
// Local-only lifecycle tool for the fixed dashboard verification identity.
// It deliberately never prints or accepts a password from argv/stdin.
import { randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const ACTIONS = new Set(["status", "enable", "rotate", "revoke"]);
const PASSWORD_BYTES = 32;
const MAX_RESPONSE_BYTES = 16 * 1024;

function fail(message) {
  throw new Error(`Kendall test viewer: ${message}`);
}

function privateDirectory(pathValue) {
  if (!isAbsolute(pathValue)) fail("private directory must be absolute.");
  const directory = resolve(pathValue);
  let current = directory;
  while (true) {
    let details;
    try { details = lstatSync(current); } catch { fail("private directory is unavailable or unsafe."); }
    const stickySharedTemp = (details.mode & 0o1000) !== 0 && (details.mode & 0o022) === 0o022 && current !== directory;
    if (details.isSymbolicLink() || !details.isDirectory() || ((details.mode & 0o022) !== 0 && !stickySharedTemp)) fail("private directory is unsafe.");
    if (current === directory && (details.uid !== process.getuid() || (details.mode & 0o077) !== 0)) fail("private directory must be owner-private.");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return directory;
}

function privateRegularFile(pathValue) {
  let descriptor;
  try {
    descriptor = openSync(pathValue, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const linked = lstatSync(pathValue);
    if (opened.dev !== linked.dev || opened.ino !== linked.ino || linked.isSymbolicLink() || !opened.isFile() || opened.uid !== process.getuid() || (opened.mode & 0o077) !== 0) fail("credential file is unsafe.");
  } catch (error) {
    if (error?.message?.startsWith("Kendall test viewer:")) throw error;
    fail("credential file is unavailable or unsafe.");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function privateSocket(pathValue) {
  let details;
  try { details = lstatSync(pathValue); } catch { fail("supervisor UDS is unavailable or unsafe."); }
  if (details.isSymbolicLink() || !details.isSocket() || details.uid !== process.getuid()) fail("supervisor UDS is unavailable or unsafe.");
}

function resolveConfig(environment = process.env) {
  const authDir = privateDirectory(environment.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth"));
  const socketPath = environment.KENDALL_SUPERVISOR_UDS_PATH || join(authDir, "supervisor.sock");
  const passwordFile = environment.KENDALL_TEST_VIEWER_PASSWORD_FILE || join(authDir, "test-viewer-password");
  const bootstrapFile = environment.KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE || join(authDir, "bootstrap-password");
  const resolvedSocket = resolve(socketPath);
  const resolvedPassword = resolve(passwordFile);
  const resolvedBootstrap = resolve(bootstrapFile);
  if (!isAbsolute(socketPath) || dirname(resolvedSocket) !== authDir) fail("supervisor UDS must be inside the private auth directory.");
  if (!isAbsolute(passwordFile) || dirname(resolvedPassword) !== authDir) fail("credential file must be inside the private auth directory.");
  if (basename(resolvedPassword) !== "test-viewer-password") fail("credential file must use the fixed local test-viewer-password name.");
  if (resolvedPassword === resolvedSocket || resolvedPassword === resolvedBootstrap) fail("credential file conflicts with reserved LAN auth state.");
  return { authDir, socketPath: resolvedSocket, passwordFile: resolvedPassword };
}

function requestLifecycle(socketPath, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolvePromise, reject) => {
    const request = http.request({
      socketPath,
      path: "/internal/lan-auth/test-viewer",
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "content-length": body.length },
    }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total <= MAX_RESPONSE_BYTES) chunks.push(chunk);
        else request.destroy(new Error("lifecycle response exceeded limit"));
      });
      response.on("end", () => {
        if (total > MAX_RESPONSE_BYTES) return reject(new Error("lifecycle response exceeded limit"));
        let result;
        try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reject(new Error("lifecycle response was invalid")); }
        if (response.statusCode !== 200 || result?.schemaVersion !== "kendall-test-viewer-lifecycle/v1" || result?.role !== "test_viewer" || typeof result.enabled !== "boolean") return reject(new Error("lifecycle request was not accepted"));
        resolvePromise(result);
      });
    });
    request.setTimeout(2_000, () => request.destroy(new Error("lifecycle request timed out")));
    request.on("error", () => reject(new Error("lifecycle request was unavailable")));
    request.end(body);
  });
}

function writeAllSync(descriptor, value) {
  const bytes = Buffer.from(value, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (!Number.isSafeInteger(written) || written <= 0) throw new Error("private file write was incomplete");
    offset += written;
  }
}

function createPendingCredential(passwordFile) {
  const temporary = join(dirname(passwordFile), `.${basename(passwordFile)}.${randomBytes(12).toString("hex")}.tmp`);
  const secret = randomBytes(PASSWORD_BYTES).toString("base64url");
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAllSync(descriptor, `${secret}\n`);
  } catch {
    try { rmSync(temporary, { force: true }); } catch { /* fixed failure below */ }
    fail("could not create the private credential file.");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try {
    privateRegularFile(temporary);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* caller receives a fixed safe error */ }
    throw error;
  }
  return { temporary, secret };
}

function processStartIdentity(pid) {
  try {
    const statLine = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = statLine.lastIndexOf(")");
    const fields = close >= 0 ? statLine.slice(close + 2).trim().split(/\s+/) : [];
    const startedAt = fields[19]; // Linux proc stat field 22, after pid/comm.
    if (!/^\d+$/.test(startedAt || "")) fail("test-viewer lifecycle lock cannot be verified.");
    return startedAt;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ESRCH") return null;
    if (error?.message?.startsWith("Kendall test viewer:")) throw error;
    fail("test-viewer lifecycle lock cannot be verified.");
  }
}

function acquireLifecycleLock(passwordFile) {
  const lockPath = `${passwordFile}.lock`;
  let descriptor;
  let created = false;
  try {
    descriptor = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    const startedAt = processStartIdentity(process.pid);
    if (!startedAt) fail("test-viewer lifecycle lock cannot be verified.");
    writeAllSync(descriptor, `${process.pid}:${startedAt}\n`);
    privateRegularFile(lockPath);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) {
      rmSync(lockPath, { force: true });
      fail("could not acquire the test-viewer lifecycle lock.");
    }
    if (error?.code !== "EEXIST") fail("could not acquire the test-viewer lifecycle lock.");
    privateRegularFile(lockPath);
    const ownerText = readFileSync(lockPath, "utf8");
    const match = /^([1-9]\d*):(\d+)\n$/.exec(ownerText);
    if (!match) fail("test-viewer lifecycle lock is unsafe.");
    const owner = Number.parseInt(match[1], 10);
    if (!Number.isSafeInteger(owner)) fail("test-viewer lifecycle lock is unsafe.");
    const actualStart = processStartIdentity(owner);
    if (actualStart === match[2]) fail("another test-viewer lifecycle operation is already running.");
    rmSync(lockPath);
    return acquireLifecycleLock(passwordFile);
  }
  return () => {
    try {
      closeSync(descriptor);
      rmSync(lockPath, { force: true });
    } catch {
      fail("could not release the test-viewer lifecycle lock.");
    }
  };
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  // `pnpm run <script> -- <arg>` intentionally forwards its separator too.
  // Accept precisely that one documented invocation shape, while leaving all
  // other extra argv values rejected.
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  const [action] = values;
  if (values.length !== 1 || !ACTIONS.has(action)) fail("usage: dashboard-test-viewer-lifecycle.mjs <status|enable|rotate|revoke>");
  const { socketPath, passwordFile } = resolveConfig(environment);
  privateSocket(socketPath);
  const release = acquireLifecycleLock(passwordFile);
  try {
    if (action === "status") return requestLifecycle(socketPath, { action });
    if (action === "revoke") {
      const result = await requestLifecycle(socketPath, { action });
      if (existsSync(passwordFile)) {
        privateRegularFile(passwordFile);
        rmSync(passwordFile);
      }
      return result;
    }
    if (action === "enable") {
      const state = await requestLifecycle(socketPath, { action: "status" });
      if (state.enabled) fail("test viewer is already enabled; use rotate or revoke.");
    }
    const pending = createPendingCredential(passwordFile);
    let published = false;
    try {
      const result = await requestLifecycle(socketPath, { action, password: pending.secret });
      renameSync(pending.temporary, passwordFile);
      published = true;
      privateRegularFile(passwordFile);
      return result;
    } catch (error) {
      try { rmSync(pending.temporary, { force: true }); } catch { /* outer handler stays redacted */ }
      if (published) {
        try { rmSync(passwordFile, { force: true }); } catch { /* outer handler stays redacted */ }
      }
      throw error;
    }
  } finally {
    release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (result) => process.stdout.write(`${JSON.stringify({ schemaVersion: result.schemaVersion, role: result.role, configured: result.configured, enabled: result.enabled, rotated: result.rotated })}\n`),
    (error) => {
      const message = error instanceof Error && error.message.startsWith("Kendall test viewer:")
        ? error.message
        : "Kendall test viewer: lifecycle operation failed.";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
}

export { main, resolveConfig };
