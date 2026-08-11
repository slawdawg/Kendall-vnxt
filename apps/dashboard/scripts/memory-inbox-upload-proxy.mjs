import http from "node:http";
import { supervisorSessionRole } from "./dashboard-auth-proxy.mjs";

export const MEMORY_INBOX_UPLOAD_PATH = "/api/memory-inbox/upload";
export const MEMORY_INBOX_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

function sendJson(response, statusCode, payload, { close = false } = {}) {
  const body = JSON.stringify(payload);
  if (close) {
    response.shouldKeepAlive = false;
    response.setHeader("connection", "close");
  }
  response.writeHead(statusCode, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

// Upload rejections must not leave unconsumed bytes on a reusable dashboard
// socket. A close response makes the rejected request a terminal exchange.
function reject(request, response, statusCode, payload) {
  request.resume();
  sendJson(response, statusCode, payload, { close: true });
}

function cookieValue(cookie, name) {
  return (cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function isForwardedRequest(request) {
  return ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"].some((name) => request.headers[name]);
}

function requestBody({ request, timeoutMs, idleTimeoutMs }) {
  return new Promise((resolve) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    let idle;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(total);
      clearTimeout(idle);
      resolve(result);
    };
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        request.destroy();
        finish({ status: 408 });
      }, idleTimeoutMs);
    };
    const total = setTimeout(() => {
      request.destroy();
      finish({ status: 408 });
    }, timeoutMs);
    resetIdle();
    request.on("data", (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      resetIdle();
      if (bytes > MEMORY_INBOX_UPLOAD_MAX_BYTES) {
        request.destroy();
        finish({ status: 413 });
        return;
      }
      chunks.push(chunk);
    });
    // Clear the body-idle timer as soon as intake is complete; an upstream
    // response must never be mistaken for a stalled browser upload.
    request.on("end", () => finish({ body: Buffer.concat(chunks) }));
    request.on("aborted", () => finish({ status: 503 }));
    request.on("error", () => finish({ status: 503 }));
  });
}

// The upload slot is a mutation permit, so client abandonment must fence every
// phase after it is reserved. In particular, an already-complete body can be
// abandoned while the second session check is in flight; checking only once
// forwarding starts would allow that stale request to open the UDS mutation.
function createClientDisconnectFence({ request, response }) {
  let cancelled = request.aborted || request.destroyed || response.destroyed;
  let resolveCancelled;
  const whenCancelled = new Promise((resolve) => { resolveCancelled = resolve; });
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    resolveCancelled();
  };
  const onResponseClose = () => cancel();
  request.once("aborted", cancel);
  request.once("error", cancel);
  // ServerResponse closes before it can write a reply only when the browser
  // exchange is gone; unlike IncomingMessage `close`, it is not a normal
  // completed-body signal.
  response.once("close", onResponseClose);
  if (cancelled) resolveCancelled();
  return {
    get cancelled() { return cancelled; },
    whenCancelled,
    dispose() {
      request.removeListener("aborted", cancel);
      request.removeListener("error", cancel);
      response.removeListener("close", onResponseClose);
    },
  };
}

async function raceClientDisconnect(value, fence) {
  return Promise.race([
    Promise.resolve(value).then((result) => ({ result })),
    fence.whenCancelled.then(() => ({ cancelled: true })),
  ]);
}

function forwardUpload({ body, request, response, supervisorUdsPath, timeoutMs, cancellationFence }) {
  return new Promise((resolve) => {
    let settled = false;
    let upstream;
    const cleanup = () => {
      clearTimeout(deadline);
    };
    const finish = (status = 503) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!response.headersSent && !response.destroyed) sendJson(response, status, { state: "unavailable" }, { close: true });
      resolve();
    };
    // A client that abandons the browser exchange must not keep the private
    // supervisor request (or the only upload slot) alive until its deadline.
    const cancelForClientDisconnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      upstream?.destroy();
      resolve();
    };
    upstream = http.request({
      socketPath: supervisorUdsPath,
      path: "/memory-inbox/upload",
      method: "POST",
      headers: {
        accept: "application/json",
        cookie: request.headers.cookie,
        origin: request.headers.origin,
        "x-csrf-token": request.headers["x-csrf-token"],
        "content-type": request.headers["content-type"],
        "content-length": body.length,
      },
    }, (upstreamResponse) => {
      const chunks = [];
      let size = 0;
      upstreamResponse.on("data", (chunk) => {
        size += chunk.length;
        if (size <= 16 * 1024) chunks.push(chunk);
      });
      upstreamResponse.on("end", () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!response.destroyed) {
          response.writeHead(upstreamResponse.statusCode || 503, {
            "cache-control": "no-store",
            "content-type": upstreamResponse.headers["content-type"] || "application/json; charset=utf-8",
          });
          response.end(Buffer.concat(chunks));
        }
        resolve();
      });
      upstreamResponse.on("error", () => finish());
    });
    const deadline = setTimeout(() => {
      upstream.destroy();
      finish(408);
    }, timeoutMs);
    // The fence was installed when capacity was reserved, before body intake.
    // It remains subscribed through the private UDS exchange.
    cancellationFence.whenCancelled.then(cancelForClientDisconnect);
    upstream.on("error", () => finish());
    upstream.end(body);
  });
}

/** A single exact browser-to-supervisor ingress; never a generic proxy hop. */
export function createMemoryInboxUploadProxy({ supervisorUdsPath, expectedOrigin, timeoutMs = 30_000, idleTimeoutMs = 5_000, maxConcurrent = 1 }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Memory Inbox upload proxy requires a fixed absolute supervisor UDS path.");
  let active = 0;
  return async function proxy(request, response) {
    let url;
    try { url = new URL(request.url || "/", "https://dashboard.invalid"); } catch { return false; }
    if (url.pathname !== MEMORY_INBOX_UPLOAD_PATH) return false;
    if (url.search) { reject(request, response, 404, { state: "unavailable" }); return true; }
    if (request.method !== "POST") { reject(request, response, 405, { state: "unavailable" }); return true; }
    if (isForwardedRequest(request)) { reject(request, response, 400, { state: "unavailable" }); return true; }

    // Authenticate before revealing upload limits, content capabilities, or
    // current capacity. This also reserves capacity only for real operators.
    if (await supervisorSessionRole({ supervisorUdsPath, cookie: request.headers.cookie }) !== "operator") {
      reject(request, response, 401, { state: "sign_in_required" });
      return true;
    }
    if (request.headers.origin !== expectedOrigin || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf")) {
      reject(request, response, 403, { state: "unavailable" });
      return true;
    }
    const declared = Number(request.headers["content-length"] || "0");
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > MEMORY_INBOX_UPLOAD_MAX_BYTES || request.headers["transfer-encoding"]) {
      reject(request, response, 413, { state: "unavailable" });
      return true;
    }
    if (!ACCEPTED_CONTENT_TYPES.has(String(request.headers["content-type"] || "").split(";", 1)[0].toLowerCase())) {
      reject(request, response, 415, { state: "unavailable" });
      return true;
    }
    if (active >= maxConcurrent) { reject(request, response, 429, { state: "unavailable" }); return true; }

    active += 1;
    // Capacity is held from this point through intake, revalidation, and the
    // private UDS hop. Each phase consumes the same one end-to-end budget.
    const cancellationFence = createClientDisconnectFence({ request, response });
    const deadlineAt = Date.now() + timeoutMs;
    const remainingBudget = () => Math.max(0, deadlineAt - Date.now());
    try {
      // checkContinue reaches this function through the same protected runtime
      // dispatcher, so only an authorized, reserved upload gets its 100.
      if (request.headers.expect?.toLowerCase() === "100-continue") response.writeContinue();
      const intake = await requestBody({ request, timeoutMs: remainingBudget(), idleTimeoutMs });
      if (!intake.body) {
        reject(request, response, intake.status || 503, { state: "unavailable" });
        return true;
      }
      if (cancellationFence.cancelled) return true;
      // The body can take seconds to arrive. Revalidate immediately before the
      // only mutation-capable hop so a concurrently revoked session cannot win.
      if (remainingBudget() < 1) {
        reject(request, response, 408, { state: "unavailable" });
        return true;
      }
      const revalidation = await raceClientDisconnect(
        supervisorSessionRole({ supervisorUdsPath, cookie: request.headers.cookie, timeoutMs: remainingBudget() }),
        cancellationFence,
      );
      if (revalidation.cancelled || cancellationFence.cancelled) return true;
      if (revalidation.result !== "operator") {
        reject(request, response, 401, { state: "sign_in_required" });
        return true;
      }
      if (remainingBudget() < 1) {
        reject(request, response, 408, { state: "unavailable" });
        return true;
      }
      await forwardUpload({ body: intake.body, request, response, supervisorUdsPath, timeoutMs: remainingBudget(), cancellationFence });
    } finally {
      cancellationFence.dispose();
      active -= 1;
    }
    return true;
  };
}
