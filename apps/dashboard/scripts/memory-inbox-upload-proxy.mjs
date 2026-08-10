import http from "node:http";
import { supervisorSessionRole } from "./dashboard-auth-proxy.mjs";

export const MEMORY_INBOX_UPLOAD_PATH = "/api/memory-inbox/upload";
export const MEMORY_INBOX_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function cookieValue(cookie, name) {
  return (cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

/** A single exact, streaming browser-to-supervisor ingress; never a generic proxy hop. */
export function createMemoryInboxUploadProxy({ supervisorUdsPath, expectedOrigin, timeoutMs = 30_000, idleTimeoutMs = 5_000, maxConcurrent = 1 }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Memory Inbox upload proxy requires a fixed absolute supervisor UDS path.");
  let active = 0;
  return async function proxy(request, response) {
    let url;
    try { url = new URL(request.url || "/", "https://dashboard.invalid"); } catch { return false; }
    if (url.pathname !== MEMORY_INBOX_UPLOAD_PATH || url.search) return false;
    if (request.method !== "POST") { sendJson(response, 405, { state: "unavailable" }); return true; }
    if (!request.headers.cookie || request.headers.origin !== expectedOrigin || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf")) { sendJson(response, 403, { state: "unavailable" }); return true; }
    if (["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"].some((name) => request.headers[name])) { sendJson(response, 400, { state: "unavailable" }); return true; }
    if (active >= maxConcurrent) { sendJson(response, 429, { state: "unavailable" }); return true; }
    const declared = Number(request.headers["content-length"] || "0");
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > MEMORY_INBOX_UPLOAD_MAX_BYTES) { sendJson(response, 413, { state: "unavailable" }); return true; }
    if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"].includes(String(request.headers["content-type"] || "").split(";")[0].toLowerCase())) { sendJson(response, 415, { state: "unavailable" }); return true; }
    if (await supervisorSessionRole({ supervisorUdsPath, cookie: request.headers.cookie }) !== "operator") { sendJson(response, 401, { state: "sign_in_required" }); return true; }
    active += 1;
    try {
      await streamToSupervisor({ request, response, supervisorUdsPath, timeoutMs, idleTimeoutMs });
    } finally { active -= 1; }
    return true;
  };
}

function streamToSupervisor({ request, response, supervisorUdsPath, timeoutMs, idleTimeoutMs }) {
  return new Promise((resolve) => {
    let settled = false; let bytes = 0; let idle;
    const finish = (status = 503) => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); if (!response.headersSent) sendJson(response, status, { state: "unavailable" }); resolve(); };
    const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => { upstream.destroy(); request.destroy(); finish(408); }, idleTimeoutMs); };
    const upstream = http.request({ socketPath: supervisorUdsPath, path: "/memory-inbox/upload", method: "POST", headers: { accept: "application/json", cookie: request.headers.cookie, origin: request.headers.origin, "x-csrf-token": request.headers["x-csrf-token"], "content-type": request.headers["content-type"], "content-length": request.headers["content-length"] } }, (upstreamResponse) => {
      const chunks = []; let size = 0;
      upstreamResponse.on("data", (chunk) => { size += chunk.length; if (size <= 16 * 1024) chunks.push(chunk); });
      upstreamResponse.on("end", () => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); response.writeHead(upstreamResponse.statusCode || 503, { "cache-control": "no-store", "content-type": upstreamResponse.headers["content-type"] || "application/json; charset=utf-8" }); response.end(Buffer.concat(chunks)); resolve(); });
    });
    const total = setTimeout(() => { upstream.destroy(); request.destroy(); finish(408); }, timeoutMs);
    resetIdle();
    request.on("data", (chunk) => { bytes += chunk.length; resetIdle(); if (bytes > MEMORY_INBOX_UPLOAD_MAX_BYTES) { upstream.destroy(); request.destroy(); finish(413); return; } if (!upstream.write(chunk)) request.pause(), upstream.once("drain", () => request.resume()); });
    request.on("end", () => upstream.end());
    request.on("aborted", () => { upstream.destroy(); finish(); });
    request.on("error", () => { upstream.destroy(); finish(); });
    upstream.on("error", () => finish());
  });
}
