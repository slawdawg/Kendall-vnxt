import http from "node:http";

const AUTH_PATHS = new Map([
  ["/auth/login-csrf", "GET"],
  ["/auth/login", "POST"],
  ["/auth/session", "GET"],
  ["/auth/logout", "POST"],
]);
const MAX_BODY_BYTES = 16 * 1024;
const AUTH_TIMEOUT_MS = 2000;
const AUTH_BODY_TIMEOUT_MS = 2000;

export function isAuthProxyPath(pathname, method) {
  return AUTH_PATHS.get(pathname) === method;
}

export function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\r\n]/.test(value)) return "/pipeline";
  try {
    const url = new URL(value, "https://dashboard.invalid");
    if (url.origin !== "https://dashboard.invalid" || !url.pathname.startsWith("/")) return "/pipeline";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/pipeline";
  }
}

export function createAuthProxy({ supervisorUdsPath, expectedOrigin, timeoutMs = AUTH_TIMEOUT_MS }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Auth proxy requires a fixed absolute supervisor UDS path.");
  return async function proxy(request, response) {
    let url;
    try { url = new URL(request.url || "/", "https://dashboard.invalid"); } catch { return false; }
    if (url.search || !isAuthProxyPath(url.pathname, request.method)) return false;
    if (request.headers.forwarded || request.headers["x-forwarded-for"] || request.headers["x-forwarded-host"] || request.headers["x-forwarded-proto"] || request.headers["x-forwarded-port"]) {
      sendJson(response, 400, { detail: "Authentication is unavailable." });
      return true;
    }
    if (request.method === "POST" && (!request.headers.origin || !request.headers.origin.startsWith("https://") || (expectedOrigin && request.headers.origin !== expectedOrigin))) {
      sendJson(response, 403, { detail: "Authentication is unavailable." });
      return true;
    }
    const body = await readBody(request);
    if (body === null) {
      sendJson(response, 413, { detail: "Authentication is unavailable." });
      return true;
    }
    try {
      const upstream = await requestSupervisor(supervisorUdsPath, url.pathname, request.method, request.headers, body, timeoutMs);
      const headers = { "cache-control": "no-store", "content-type": upstream.contentType || "application/json; charset=utf-8" };
      const setCookies = upstream.setCookie ? [...upstream.setCookie] : [];
      if (url.pathname === "/auth/login" && upstream.statusCode === 200) {
        try {
          const csrfToken = JSON.parse(upstream.body.toString("utf8")).csrfToken;
          if (typeof csrfToken === "string" && csrfToken.length > 0) setCookies.push(`kendall_operator_csrf=${encodeURIComponent(csrfToken)}; Max-Age=28800; Secure; SameSite=Strict; Path=/`);
        } catch { /* upstream body remains the authoritative response */ }
      }
      if (url.pathname === "/auth/logout" && upstream.statusCode === 200) setCookies.push("kendall_operator_csrf=; Max-Age=0; Secure; SameSite=Strict; Path=/");
      if (setCookies.length) headers["set-cookie"] = setCookies;
      response.writeHead(upstream.statusCode, headers);
      response.end(upstream.body);
    } catch {
      sendJson(response, 503, { detail: "Authentication is unavailable." });
    }
    return true;
  };
}

export async function supervisorSessionIsValid({ supervisorUdsPath, cookie, timeoutMs = AUTH_TIMEOUT_MS }) {
  if (!cookie) return false;
  try {
    const result = await requestSupervisor(supervisorUdsPath, "/auth/session", "GET", { cookie }, Buffer.alloc(0), timeoutMs);
    return result.statusCode === 200;
  } catch {
    return false;
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const deadline = setTimeout(() => {
      request.destroy();
      finish(null);
    }, AUTH_BODY_TIMEOUT_MS);
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        request.destroy();
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => finish(Buffer.concat(chunks)));
    request.on("error", () => finish(null));
  });
}

function requestSupervisor(socketPath, path, method, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path,
      method,
      headers: {
        accept: "application/json",
        ...(headers.cookie ? { cookie: headers.cookie } : {}),
        ...(headers.origin ? { origin: headers.origin } : {}),
        ...(headers["x-csrf-token"] ? { "x-csrf-token": headers["x-csrf-token"] } : {}),
        ...(body.length ? { "content-type": "application/json", "content-length": body.length } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode || 503,
        body: Buffer.concat(chunks),
        contentType: response.headers["content-type"],
        setCookie: response.headers["set-cookie"],
      }));
    });
    const deadline = setTimeout(() => request.destroy(new Error("Auth proxy deadline exceeded.")), timeoutMs);
    request.on("error", (error) => { clearTimeout(deadline); reject(error); });
    request.on("close", () => clearTimeout(deadline));
    request.end(body);
  });
}
