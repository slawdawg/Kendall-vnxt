import http from "node:http";

const PREFIX = "/api/supervisor/";
const MAX_BODY_BYTES = 256 * 1024;
const PROXY_TIMEOUT_MS = 2000;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY_SUPERVISOR_PATHS = [
  /^\/work-packets(?:\/[A-Za-z0-9._:%-]+)?$/,
  /^\/pipeline-control-plane\/(?:projection|work-packets(?:\/[A-Za-z0-9._:%-]+)?)$/,
];
const ALLOWED_SUPERVISOR_PATHS = [
  /^\/supervisor\/status$/,
  /^\/events$/,
  /^\/audit-events$/,
  /^\/work-packets(?:\/[A-Za-z0-9._:%-]+(?:\/learn-follow-up-candidate-work)?)?$/,
  /^\/work-items(?:\/[A-Za-z0-9._:%-]+(?:\/[A-Za-z0-9._:%?-]+)*)?$/,
  /^\/candidate-work(?:\/[A-Za-z0-9._:%-]+)?(?:\/promote|\/import-bmad|\/import-obsidian-metadata)?$/,
  /^\/pipeline-control-plane\/(?:projection|work-packets(?:\/[A-Za-z0-9._:%-]+)?|actions(?:\/v1)?|approvals(?:\/v1)?)$/,
  /^\/operator-views(?:\/[A-Za-z0-9._:%-]+(?:\/default)?)?$/,
];

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const deadline = setTimeout(() => { request.destroy(); finish(null); }, PROXY_TIMEOUT_MS);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { request.destroy(); finish(null); return; }
      chunks.push(chunk);
    });
    request.on("end", () => finish(Buffer.concat(chunks)));
    request.on("error", () => finish(null));
  });
}

export function createSupervisorProxy({ supervisorUdsPath, expectedOrigin, timeoutMs = PROXY_TIMEOUT_MS }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Supervisor proxy requires a fixed absolute UDS path.");
  return async function proxy(request, response) {
    let url;
    try { url = new URL(request.url || "/", "https://dashboard.invalid"); } catch { return false; }
    if (!url.pathname.startsWith(PREFIX) || url.search) return false;
    if (!request.headers.cookie) { sendJson(response, 401, { state: "sign_in_required" }); return true; }
    if (["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"].some((name) => request.headers[name])) {
      sendJson(response, 400, { state: "unavailable" });
      return true;
    }
    if (MUTATING_METHODS.has(request.method) && (!request.headers.origin || request.headers.origin !== expectedOrigin)) {
      sendJson(response, 403, { state: "unavailable" });
      return true;
    }
    const body = await readBody(request);
    if (body === null) { sendJson(response, 413, { state: "unavailable" }); return true; }
    try {
      const session = await requestSupervisor(supervisorUdsPath, "/auth/session", "GET", { cookie: request.headers.cookie }, Buffer.alloc(0), timeoutMs);
      if (session.statusCode !== 200) { sendJson(response, 401, { state: "sign_in_required" }); return true; }
      let targetPath;
      try { targetPath = `/${decodeURIComponent(url.pathname.slice(PREFIX.length))}`; } catch { sendJson(response, 400, { state: "unavailable" }); return true; }
      if (!targetPath.startsWith("/") || targetPath.includes("\\") || targetPath.includes("/../") || targetPath.includes("/./")) { sendJson(response, 400, { state: "unavailable" }); return true; }
      if (!ALLOWED_SUPERVISOR_PATHS.some((pattern) => pattern.test(targetPath))) { sendJson(response, 404, { state: "unavailable" }); return true; }
      if (READ_ONLY_SUPERVISOR_PATHS.some((pattern) => pattern.test(targetPath)) && !["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 405, { state: "unavailable" });
        return true;
      }
      if (targetPath === "/events") {
        await streamSupervisor(supervisorUdsPath, targetPath, request.headers, response, timeoutMs);
        return true;
      }
      const upstream = await requestSupervisor(supervisorUdsPath, targetPath, request.method, request.headers, body, timeoutMs);
      const headers = { "cache-control": "no-store", "content-type": upstream.contentType || "application/json; charset=utf-8" };
      if (upstream.setCookie) headers["set-cookie"] = upstream.setCookie;
      response.writeHead(upstream.statusCode, headers);
      response.end(upstream.body);
    } catch {
      if (response.headersSent) response.destroy();
      else sendJson(response, 503, { state: "unavailable" });
    }
    return true;
  };
}

function streamSupervisor(socketPath, targetPath, headers, response, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: targetPath, method: "GET", headers: { accept: "text/event-stream", cookie: headers.cookie } }, (upstream) => {
      response.writeHead(upstream.statusCode || 503, { "cache-control": "no-store", "content-type": upstream.headers["content-type"] || "text/event-stream" });
      upstream.pipe(response);
      upstream.on("end", resolve);
      upstream.on("error", reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error("Supervisor stream startup timed out.")), timeoutMs);
    request.on("error", (error) => { clearTimeout(deadline); reject(error); });
    request.on("response", () => clearTimeout(deadline));
    request.end();
  });
}

function requestSupervisor(socketPath, targetPath, method, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: targetPath,
      method,
      headers: {
        accept: headers.accept || "application/json",
        ...(headers.cookie ? { cookie: headers.cookie } : {}),
        ...(headers.origin ? { origin: headers.origin } : {}),
        ...(headers["x-csrf-token"] ? { "x-csrf-token": headers["x-csrf-token"] } : {}),
        ...(body.length ? { "content-type": headers["content-type"] || "application/json", "content-length": body.length } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ statusCode: response.statusCode || 503, body: Buffer.concat(chunks), contentType: response.headers["content-type"], setCookie: response.headers["set-cookie"] }));
    });
    const deadline = setTimeout(() => request.destroy(new Error("Supervisor proxy deadline exceeded.")), timeoutMs);
    request.on("error", reject);
    request.on("close", () => clearTimeout(deadline));
    request.end(body);
  });
}
