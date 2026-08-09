import http from "node:http";

const PREFIX = "/api/supervisor/";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CONTROLS_RESPONSE_BYTES = 1024 * 1024;
const PROXY_TIMEOUT_MS = 2000;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY_SUPERVISOR_PATHS = [
  /^\/memory-inbox\/shell$/,
  /^\/memory-inbox\/projection$/,
  /^\/work-packets(?:\/[A-Za-z0-9._:%-]+)?$/,
  /^\/pipeline-control-plane\/(?:projection|work-packets(?:\/[A-Za-z0-9._:%-]+)?)$/,
];
// This is deliberately smaller than the operator read surface. It is the
// complete browser-to-supervisor capability of the fixed verification account.
const TEST_VIEWER_READ_PATHS = [
  // Target IDs are decoded exactly once before this check. `%` is excluded so
  // a second decoder in an upstream library can never reinterpret a permitted
  // viewer packet ID as a path separator or dot segment.
  /^\/work-packets(?:\/[A-Za-z0-9._:-]+)?$/,
  /^\/pipeline-control-plane\/(?:projection|work-packets(?:\/[A-Za-z0-9._:-]+)?)$/,
];
const ALLOWED_SUPERVISOR_PATHS = [
  /^\/memory-inbox\/shell$/,
  /^\/memory-inbox\/projection$/,
  /^\/supervisor\/status$/,
  /^\/supervisor\/runtime-evidence-review-report$/,
  /^\/events$/,
  /^\/audit-events$/,
  /^\/work-packets(?:\/[A-Za-z0-9._:%-]+(?:\/learn-follow-up-candidate-work)?)?$/,
  /^\/work-items(?:\/[A-Za-z0-9._:%-]+(?:\/[A-Za-z0-9._:%?-]+)*)?$/,
  /^\/candidate-work(?:\/[A-Za-z0-9._:%-]+)?(?:\/promote|\/import-bmad|\/import-obsidian-metadata)?$/,
  /^\/pipeline-control-plane\/(?:projection|work-packets(?:\/[A-Za-z0-9._:%-]+)?|actions(?:\/v1(?:\/capability)?)?|approvals(?:\/v1)?)$/,
  /^\/operator-views(?:\/[A-Za-z0-9._:%-]+(?:\/default)?)?$/,
];
export const MEMORY_INBOX_MUTATION_PATHS = new Set([
  "/memory-inbox/text-capture",
]);
// Controls has a separate exact browser capability. These paths deliberately
// have no parameters and no query contract.
export const CONTROLS_READ_PATHS = new Set([
  "/supervisor/status", "/work-items", "/routing/worker-registry", "/routing/lane-profiles",
  "/supervisor/execution-readiness-report", "/supervisor/documentation-authority-report", "/supervisor/legacy-planning-artifact-inventory", "/supervisor/verification-readiness-report", "/supervisor/authority-readiness-matrix-report", "/supervisor/dashboard-e2e-report", "/supervisor/report-catalog", "/supervisor/maintenance-readiness-report", "/supervisor/maintenance-action-plan-report", "/supervisor/development-runway-report", "/supervisor/runtime-evidence-review-report", "/supervisor/safe-development-backlog", "/supervisor/runner-assignment-status-report", "/supervisor/managed-recipe-policy-report", "/supervisor/github-workflow-policy-report", "/supervisor/github-delivery-authority-report", "/supervisor/git-hygiene-report", "/supervisor/local-cleanup-readiness-report", "/supervisor/remote-cleanup-sync-readiness-report", "/supervisor/trusted-delivery-eligibility-report", "/supervisor/trusted-autonomy-readiness-report", "/supervisor/epic-6-completion-audit-report", "/supervisor/epic-6-mvp-proof-trial-report", "/supervisor/codex-readiness-report", "/supervisor/codex-implementation-approval-report", "/supervisor/claude-review-readiness-report", "/supervisor/claude-review-approval-report", "/supervisor/review-resource-policy-report", "/supervisor/delivery-readiness-policy-report", "/execution-recipes",
]);
export const CONTROLS_MUTATION_PATHS = new Set([
  "/pipeline-control-plane/actions/v1/capability",
  "/pipeline-control-plane/approvals/v1",
  "/pipeline-control-plane/actions/v1",
]);
const SAVED_VIEW_SCOPES = new Set(["active-work", "attention", "queue", "audit"]);

function allowedReadQuery(url, method) {
  if (!url.search) return true;
  // Saved-view scopes are the only authenticated dashboard reads that need a
  // query. Preserve a one-key, one-value contract instead of allowing a
  // generic query pass-through to the private supervisor.
  return method === "GET"
    && url.pathname === `${PREFIX}operator-views`
    && [...url.searchParams].length === 1
    && url.searchParams.getAll("scope").length === 1
    && SAVED_VIEW_SCOPES.has(url.searchParams.get("scope"));
}

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

function sessionRole(body) {
  try {
    const payload = JSON.parse(body.toString("utf8"));
    return payload?.authenticated === true && (payload.role === "operator" || payload.role === "test_viewer")
      ? payload.role
      : null;
  } catch {
    return null;
  }
}

function cookieValue(cookie, name) {
  return (cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

export function createSupervisorProxy({ supervisorUdsPath, expectedOrigin, timeoutMs = PROXY_TIMEOUT_MS }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Supervisor proxy requires a fixed absolute UDS path.");
  return async function proxy(request, response) {
    let url;
    try { url = new URL(request.url || "/", "https://dashboard.invalid"); } catch { return false; }
    if (!url.pathname.startsWith(PREFIX) || !allowedReadQuery(url, request.method)) return false;
    if (!request.headers.cookie) { sendJson(response, 401, { state: "sign_in_required" }); return true; }
    if (["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"].some((name) => request.headers[name])) {
      sendJson(response, 400, { state: "unavailable" });
      return true;
    }
    const body = await readBody(request);
    if (body === null) { sendJson(response, 413, { state: "unavailable" }); return true; }
    try {
      const session = await requestSupervisor(supervisorUdsPath, "/auth/session", "GET", { cookie: request.headers.cookie }, Buffer.alloc(0), timeoutMs);
      const role = session.statusCode === 200 ? sessionRole(session.body) : null;
      if (!role) { sendJson(response, 401, { state: "sign_in_required" }); return true; }
      let targetPath;
      try { targetPath = `/${decodeURIComponent(url.pathname.slice(PREFIX.length))}`; } catch { sendJson(response, 400, { state: "unavailable" }); return true; }
      if (!targetPath.startsWith("/") || targetPath.includes("\\") || targetPath.includes("/../") || targetPath.includes("/./")) { sendJson(response, 400, { state: "unavailable" }); return true; }
      if (!ALLOWED_SUPERVISOR_PATHS.some((pattern) => pattern.test(targetPath)) && !CONTROLS_READ_PATHS.has(targetPath) && !CONTROLS_MUTATION_PATHS.has(targetPath) && !MEMORY_INBOX_MUTATION_PATHS.has(targetPath)) { sendJson(response, 404, { state: "unavailable" }); return true; }
      const controlsRead = CONTROLS_READ_PATHS.has(targetPath);
      const controlsMutation = CONTROLS_MUTATION_PATHS.has(targetPath);
      const memoryInboxMutation = MEMORY_INBOX_MUTATION_PATHS.has(targetPath);
      if (controlsRead && (!['GET', 'HEAD'].includes(request.method) || url.search)) {
        sendJson(response, ['GET', 'HEAD'].includes(request.method) ? 404 : 405, { state: "unavailable" });
        return true;
      }
      if (controlsMutation && (request.method !== "POST" || url.search)) {
        sendJson(response, request.method === "POST" ? 404 : 405, { state: "unavailable" });
        return true;
      }
      if (memoryInboxMutation && (request.method !== "POST" || url.search)) {
        sendJson(response, request.method === "POST" ? 404 : 405, { state: "unavailable" });
        return true;
      }
      // Controls method denial is intentionally evaluated before the generic
      // mutation origin guard, so a non-POST never becomes an origin oracle.
      if (MUTATING_METHODS.has(request.method) && (!request.headers.origin || request.headers.origin !== expectedOrigin)) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (role === "test_viewer" && (controlsRead || controlsMutation || memoryInboxMutation)) {
        sendJson(response, 404, { state: "unavailable" });
        return true;
      }
      if (role === "test_viewer" && (!TEST_VIEWER_READ_PATHS.some((pattern) => pattern.test(targetPath)) || !["GET", "HEAD"].includes(request.method))) {
        sendJson(response, ["GET", "HEAD"].includes(request.method) ? 404 : 405, { state: "unavailable" });
        return true;
      }
      if (controlsMutation && (role !== "operator" || request.headers.origin !== expectedOrigin || !request.headers["x-csrf-token"] || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf"))) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (memoryInboxMutation && (role !== "operator" || request.headers.origin !== expectedOrigin || !request.headers["x-csrf-token"] || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf"))) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (READ_ONLY_SUPERVISOR_PATHS.some((pattern) => pattern.test(targetPath)) && !["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 405, { state: "unavailable" });
        return true;
      }
      if (targetPath === "/events") {
        await streamSupervisor(supervisorUdsPath, targetPath, request.headers, response, timeoutMs);
        return true;
      }
      const upstreamPath = url.search ? `${targetPath}?${url.searchParams.toString()}` : targetPath;
      const upstream = await requestSupervisor(supervisorUdsPath, upstreamPath, request.method, request.headers, body, timeoutMs, controlsRead ? MAX_CONTROLS_RESPONSE_BYTES : Infinity);
      // A viewer revocation concurrent with an in-flight read must win before
      // the browser receives data. Operator requests retain existing behavior.
      if (role === "test_viewer") {
        const confirmation = await requestSupervisor(supervisorUdsPath, "/auth/session", "GET", { cookie: request.headers.cookie }, Buffer.alloc(0), timeoutMs);
        if (confirmation.statusCode !== 200 || sessionRole(confirmation.body) !== "test_viewer") {
          sendJson(response, 401, { state: "sign_in_required" });
          return true;
        }
      }
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

function requestSupervisor(socketPath, targetPath, method, headers, body, timeoutMs, maxResponseBytes = Infinity) {
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
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxResponseBytes) { response.destroy(new Error("Supervisor response exceeds the allowed size.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ statusCode: response.statusCode || 503, body: Buffer.concat(chunks), contentType: response.headers["content-type"], setCookie: response.headers["set-cookie"] }));
      response.on("error", reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error("Supervisor proxy deadline exceeded.")), timeoutMs);
    request.on("error", reject);
    request.on("close", () => clearTimeout(deadline));
    request.end(body);
  });
}
