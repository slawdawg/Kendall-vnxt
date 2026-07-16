import { request as httpRequest, createServer } from "node:http";
import { lstat } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname } from "node:path";
import process from "node:process";

const NUMERIC_LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const TARGET_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;

function ownerPrivate(stat, label, expectedType) {
  if (stat.uid !== process.getuid() || stat.mode & 0o077) throw new Error(`${label} must be owner-controlled and private.`);
  if (expectedType === "directory" && !stat.isDirectory()) throw new Error(`${label} must be a directory.`);
  if (expectedType === "socket" && !stat.isSocket()) throw new Error(`${label} must be a Unix socket.`);
}

function numericLoopbackOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN must be an absolute numeric-loopback http origin."); }
  if (url.protocol !== "http:" || !new Set(["127.0.0.1", "[::1]"]).has(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN must be an absolute numeric-loopback http origin.");
  }
  return url.origin;
}

export function resolveBridgeConfig(environment = process.env) {
  const host = environment.KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST ?? "127.0.0.1";
  if (!NUMERIC_LOOPBACK_HOSTS.has(host)) throw new Error("KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST must be exactly 127.0.0.1 or ::1.");
  const port = Number(environment.KENDALL_LOCAL_DOGFOOD_BRIDGE_PORT ?? "8102");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("KENDALL_LOCAL_DOGFOOD_BRIDGE_PORT must be a valid TCP port.");
  const socketPath = environment.SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH;
  if (!socketPath || !socketPath.startsWith("/")) throw new Error("SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH must be an absolute private UDS path.");
  return { host, port, socketPath, dashboardOrigin: numericLoopbackOrigin(environment.KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN ?? "") };
}

async function validatePrivateSupervisorSocket(socketPath) {
  let current = dirname(socketPath);
  let first = true;
  while (current && current !== "/") {
    const directory = await lstat(current);
    if (directory.isSymbolicLink()) throw new Error("supervisor UDS parent must not contain symlinked ancestors.");
    if (first) ownerPrivate(directory, "supervisor UDS parent", "directory");
    else if (!directory.isDirectory()) throw new Error("supervisor UDS ancestors must be directories.");
    first = false;
    current = dirname(current);
  }
  const socket = await lstat(socketPath);
  ownerPrivate(socket, "supervisor UDS", "socket");
}

export function isLoopbackPeer(address) {
  return isIP(address ?? "") !== 0 && (address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1");
}

async function readTarget(socketPath, targetRef, requestHeaders = {}) {
  await validatePrivateSupervisorSocket(socketPath);
  return await new Promise((resolve, reject) => {
      const request = httpRequest({ socketPath, method: "GET", path: `/local-dogfood/attestations/targets/${encodeURIComponent(targetRef)}`, headers: { accept: "application/json", ...(requestHeaders ?? {}) } }, (response) => {
      let body = "";
      let bytes = 0;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_RESPONSE_BYTES) request.destroy(new Error("supervisor response exceeds bridge limit"));
        else body += chunk;
      });
      response.on("end", () => {
        try { JSON.parse(body); } catch { reject(new Error("supervisor returned malformed JSON")); return; }
        resolve({ status: response.statusCode ?? 502, body });
      });
    });
    request.once("error", reject);
    request.end();
  });
}

export function createBridgeServer(config) {
  return createServer(async (request, response) => {
    if (!isLoopbackPeer(request.socket.remoteAddress)) { response.writeHead(403); response.end(); return; }
    if (request.method === "OPTIONS") {
      if (request.headers.origin !== config.dashboardOrigin) { response.writeHead(403); response.end(); return; }
      response.writeHead(204, { "access-control-allow-origin": config.dashboardOrigin, "access-control-allow-methods": "GET", "access-control-allow-credentials": "true", vary: "Origin" }); response.end(); return;
    }
    if (request.method !== "GET" || request.headers.origin !== config.dashboardOrigin || Object.keys(request.headers).some((name) => ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip"].includes(name))) { response.writeHead(403); response.end(); return; }
    const match = /^\/local-dogfood-attestations\/targets\/([^/?#]+)$/.exec(request.url ?? "");
    let targetRef;
    try { targetRef = match ? decodeURIComponent(match[1]) : ""; } catch { targetRef = ""; }
    if (!match || !TARGET_REF.test(targetRef)) { response.writeHead(404); response.end(); return; }
    try {
      const result = await readTarget(config.socketPath, targetRef, request.headers.cookie ? { cookie: request.headers.cookie } : {});
      response.writeHead(result.status, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": config.dashboardOrigin, "access-control-allow-credentials": "true", vary: "Origin" });
      response.end(result.body);
    } catch {
      response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": config.dashboardOrigin, "access-control-allow-credentials": "true", vary: "Origin" });
      response.end(JSON.stringify({ error: { code: "local_observer_unavailable" } }));
    }
  });
}

export async function startBridge(config = resolveBridgeConfig()) {
  await validatePrivateSupervisorSocket(config.socketPath);
  const server = createBridgeServer(config);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen({ host: config.host, port: config.port, exclusive: true }, resolve); });
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== config.host || address.port !== config.port) { server.close(); throw new Error("bridge listener did not bind the configured numeric loopback address."); }
  return server;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  startBridge().then(() => console.log("Local dogfood attestation bridge listening on numeric loopback.")).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
