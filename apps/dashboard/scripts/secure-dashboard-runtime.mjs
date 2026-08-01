#!/usr/bin/env node
/** Story 26.1 listener/configuration foundation. No auth routes live here. */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import next from "next";
import { fileURLToPath } from "node:url";
import { createPacketDetailMediator } from "./packet-detail-mediator.mjs";
import { createAuthProxy, safeReturnPath, supervisorSessionIsValid } from "./dashboard-auth-proxy.mjs";
import { createSupervisorProxy } from "./dashboard-supervisor-proxy.mjs";

export class LanAuthConfigurationError extends Error {}

function fail(message) { throw new LanAuthConfigurationError(message); }

function writeProtectedRouteDenial(response) {
  const payload = JSON.stringify({ state: "sign_in_required" });
  response.writeHead(401, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

const DASHBOARD_PAGE_PATHS = new Set([
  "/",
  "/active-work",
  "/attention",
  "/audit",
  "/controls",
  "/pipeline",
  "/proposed-work",
  "/queue",
  "/settings",
]);

function parseDashboardPath(request) {
  const rawUrl = request.url || "/";
  const rawPath = rawUrl.split(/[?#]/, 1)[0];
  if (!rawPath.startsWith("/") || /\\/.test(rawPath)) return null;
  let pathname;
  try {
    pathname = new URL(rawUrl, "https://dashboard.invalid").pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\\") || pathname.includes("/../") || pathname.includes("/./") || /%(?:25|2e|2f|5c)/i.test(pathname)) return null;
  return pathname;
}

export function isDashboardStaticAsset(request) {
  const rawPath = (request.url || "/").split(/[?#]/, 1)[0];
  if (/%(?:2e|2f|5c|25)/i.test(rawPath)) return false;
  const pathname = parseDashboardPath(request);
  return pathname === "/favicon.ico" || pathname?.startsWith("/_next/") === true;
}

function isDashboardPagePath(pathname) {
  const canonicalPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return DASHBOARD_PAGE_PATHS.has(canonicalPath)
    || canonicalPath.startsWith("/pipeline/")
    || canonicalPath.startsWith("/work-items/");
}

export function isDashboardEntryRoute(request) {
  const pathname = parseDashboardPath(request);
  return pathname !== null && (isDashboardPagePath(pathname) || pathname.startsWith("/api/"));
}

export function isProtectedNextRoute(request) {
  const rawUrl = request.url || "/";
  const rawPath = rawUrl.split(/[?#]/, 1)[0];
  if (isDashboardStaticAsset(request)) return false;
  // Packet Detail is authenticated by the fixed UDS mediator before this
  // classifier runs; all other non-static app/API routes are default-deny.
  if (rawPath.startsWith("/api/packet-detail/")) return false;
  return true;
}

// Retained only for source compatibility while all callers use signInPageSafe.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function legacySignInPage(returnPath, message = "") {
  const safePath = JSON.stringify(safeReturnPath(returnPath));
  const messageHtml = message ? `<p id="auth-message" role="alert" class="message">${message}</p>` : `<p id="auth-message" role="status" aria-live="polite" class="message"></p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure operator access</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1018;color:#eef2f7;font:16px system-ui,sans-serif}.card{width:min(28rem,calc(100% - 2rem));padding:2rem;background:#141c28;border:1px solid #314052;border-radius:.5rem}label{display:block;margin-top:1rem;font-size:.9rem}input,button{box-sizing:border-box;width:100%;margin-top:.5rem;padding:.7rem;border:1px solid #536579;border-radius:.375rem;background:#0e1622;color:inherit;font:inherit}button{cursor:pointer;background:#2b6de0;border-color:#2b6de0}.message{min-height:1.5rem;color:#ffb4ab}h1{font-size:1.5rem}</style></head><body><main class="card" aria-labelledby="sign-in-heading"><h1 id="sign-in-heading" tabindex="-1">Secure operator access</h1><p>Sign in to continue to the Kendall dashboard.</p><form id="sign-in-form"><label for="password">Operator password</label><input id="password" name="password" type="password" autocomplete="current-password" required aria-describedby="auth-message"><button type="submit">Sign in</button></form>${messageHtml}</main><script>const form=document.getElementById("sign-in-form"),password=document.getElementById("password"),message=document.getElementById("auth-message"),returnPath=${safePath};password.focus();form.addEventListener("submit",async(event)=>{event.preventDefault();message.textContent="";try{const challenge=await fetch("/auth/login-csrf",{credentials:"same-origin"});const challengeBody=await challenge.json();if(!challenge.ok)throw new Error();const login=await fetch("/auth/login",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","origin:location.origin,"x-csrf-token":challengeBody.csrfToken},body:JSON.stringify({password:password.value})});if(!login.ok)throw new Error();location.assign(returnPath)}catch{message.textContent="Sign-in unavailable. Check credentials or try again later.";password.setAttribute("aria-invalid","true");password.focus()}});</script></body></html>`;
}

// Keep the browser-side script readable and avoid interpolating hyphenated
// header names into a giant template literal. This is the same standalone
// sign-in contract used by the runtime and the deterministic dogfood harness.
export function signInPageSafe(returnPath, message = "") {
  const safePath = JSON.stringify(safeReturnPath(returnPath));
  const messageHtml = message
    ? `<p id="auth-message" role="alert" class="message">${message}</p>`
    : `<p id="auth-message" role="status" aria-live="polite" class="message"></p>`;
  const script = `
    const form = document.getElementById("sign-in-form");
    const password = document.getElementById("password");
    const message = document.getElementById("auth-message");
    const returnPath = ${safePath};
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      try {
        const challenge = await fetch("/auth/login-csrf", { credentials: "same-origin" });
        const challengeBody = await challenge.json();
        if (!challenge.ok) throw new Error();
        const requestHeaders = { "content-type": "application/json", "origin": location.origin };
        requestHeaders["x-csrf-token"] = challengeBody.csrfToken;
        const login = await fetch("/auth/login", {
          method: "POST",
          credentials: "same-origin",
          headers: requestHeaders,
          body: JSON.stringify({ password: password.value }),
        });
        if (!login.ok) throw new Error();
        location.assign(returnPath);
      } catch {
        message.textContent = "Sign-in unavailable. Check credentials or try again later.";
        message.setAttribute("role", "alert");
        message.removeAttribute("aria-live");
        password.setAttribute("aria-invalid", "true");
        password.focus();
      }
    });`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure operator access</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1018;color:#eef2f7;font:16px system-ui,sans-serif}.card{width:min(28rem,calc(100% - 2rem));padding:2rem;background:#141c28;border:1px solid #314052;border-radius:.5rem}label{display:block;margin-top:1rem;font-size:.9rem}input,button{box-sizing:border-box;width:100%;margin-top:.5rem;padding:.7rem;border:1px solid #536579;border-radius:.375rem;background:#0e1622;color:inherit;font:inherit}button{cursor:pointer;background:#2b6de0;border-color:#2b6de0}.message{min-height:1.5rem;color:#ffb4ab}h1{font-size:1.5rem}</style></head><body><main class="card" aria-labelledby="sign-in-heading"><h1 id="sign-in-heading" tabindex="-1">Secure operator access</h1><p>Sign in to continue to the Kendall dashboard.</p><form id="sign-in-form" method="post" action="/auth/login"><label for="password">Operator password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus aria-describedby="auth-message"><button type="submit">Sign in</button></form>${messageHtml}</main><script>${script}</script></body></html>`;
}

// Preserve the original helper name while routing all callers to the
// parser-safe implementation.
export const signInPage = signInPageSafe;

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "cache-control": "no-store", "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html) });
  response.end(html);
}

export function applyLanAuthSecurityHeaders(response, config) {
  if (config?.lanAuthEnabled) {
    response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

function expandIpv6(value) {
  if (value.includes("%")) fail("LAN auth bind address must be a canonical numeric address.");
  const halves = value.toLowerCase().split("::");
  if (halves.length > 2) fail("LAN auth bind address must be a canonical numeric address.");
  const parse = (part) => {
    if (!part) return [];
    const values = part.split(":");
    const last = values.at(-1);
    if (last?.includes(".")) {
      const octets = last.split(".").map(Number);
      if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) fail("LAN auth bind address must be a canonical numeric address.");
      values.splice(-1, 1, ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16));
    }
    if (values.some((segment) => !/^[0-9a-f]{1,4}$/.test(segment))) fail("LAN auth bind address must be a canonical numeric address.");
    return values.map((segment) => Number.parseInt(segment, 16));
  };
  const left = parse(halves[0]);
  const right = halves.length === 2 ? parse(halves[1]) : [];
  if (halves.length === 1 && left.length !== 8) fail("LAN auth bind address must be a canonical numeric address.");
  if (halves.length === 2 && left.length + right.length >= 8) fail("LAN auth bind address must be a canonical numeric address.");
  return halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : left;
}

export function parseNumericLanBind(value) {
  if (typeof value !== "string" || !value || value !== value.trim() || net.isIP(value) === 0) fail("LAN auth requires an explicit numeric bind address.");
  const address = value;
  if (net.isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    if (octets[0] === 0 || octets[0] === 127) fail("LAN auth bind address must be a non-loopback, non-wildcard numeric address.");
    return address;
  }
  const segments = expandIpv6(address);
  const allZero = segments.every((segment) => segment === 0);
  const loopback = segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1;
  const mapped = segments.slice(0, 5).every((segment) => segment === 0) && segments[5] === 0xffff;
  if (allZero || loopback || mapped) fail("LAN auth bind address must be a non-loopback, non-wildcard numeric address.");
  return address;
}

function formatDashboardHost(host, port) {
  return net.isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
}

export function resolveCanonicalDashboardIdentity(environment, port) {
  const origin = environment.KENDALL_DASHBOARD_ORIGIN;
  const allowedHost = environment.KENDALL_DASHBOARD_ALLOWED_HOST;
  if (typeof origin !== "string" || typeof allowedHost !== "string" || !origin || !allowedHost) {
    fail("LAN auth requires a configured canonical dashboard origin and allowed host.");
  }
  if (/[\s/?#@\\]/.test(allowedHost)) fail("LAN auth allowed host is invalid.");
  let parsed;
  try { parsed = new URL(origin); } catch { fail("LAN auth dashboard origin is invalid."); }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || parsed.host !== allowedHost.toLowerCase()
    || parsed.port !== (String(port) === "443" ? "" : String(port))
  ) {
    fail("LAN auth dashboard origin and allowed host must be one canonical HTTPS identity.");
  }
  return { origin: parsed.origin, allowedHost: parsed.host };
}

export function isAllowedDashboardHost(request, identity) {
  return typeof request.headers.host === "string" && request.headers.host.toLowerCase() === identity.allowedHost;
}

export function runtimeHealthPayload(identity, environment = process.env) {
  return {
    schemaVersion: "kendall-dashboard-runtime-health/v1",
    state: "ready",
    origin: identity.origin,
    revision: environment.KENDALL_DASHBOARD_RUNTIME_REVISION || "unversioned",
  };
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

function validatePrivateDirectory(value) {
  let current = path.dirname(value);
  while (true) {
    let details;
    try { details = fs.lstatSync(current); } catch { fail("LAN auth private file parent is unavailable or unsafe."); }
    const stickySharedTemp = (details.mode & 0o1000) !== 0 && (details.mode & 0o022) === 0o022 && current !== path.dirname(value);
    if (!details.isDirectory() || details.isSymbolicLink() || ((details.mode & 0o022) !== 0 && !stickySharedTemp)) fail("LAN auth private file parent is unsafe.");
    if (current === path.parse(current).root) break;
    current = path.dirname(current);
  }
}

function validatePrivateFile(value, label) {
  if (typeof value !== "string" || !value) fail(`LAN auth ${label} is required.`);
  validatePrivateDirectory(value);
  const uid = process.getuid();
  let fd;
  try {
    fd = fs.openSync(value, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd);
    const linked = fs.lstatSync(value);
    if (opened.dev !== linked.dev || opened.ino !== linked.ino || !opened.isFile() || opened.uid !== uid || (opened.mode & 0o077) !== 0) fail("LAN auth private file ownership or permissions are unsafe.");
    return fs.readFileSync(fd);
  } catch (error) {
    if (error instanceof LanAuthConfigurationError) throw error;
    fail(`LAN auth ${label} is unavailable or unsafe.`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function validatePrivateSupervisorUds(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value === path.parse(value).root) fail("LAN auth supervisor UDS path is invalid.");
  let current = path.dirname(value);
  while (true) {
    let details;
    try { details = fs.lstatSync(current); } catch { fail("LAN auth supervisor UDS parent is unavailable or unsafe."); }
    const stickySharedTemp = (details.mode & 0o1000) !== 0 && (details.mode & 0o022) === 0o022 && current !== path.dirname(value);
    if (details.isSymbolicLink() || !details.isDirectory() || ((details.mode & 0o022) !== 0 && !stickySharedTemp)) fail("LAN auth supervisor UDS parent is unsafe.");
    if (current === path.parse(current).root) break;
    current = path.dirname(current);
  }
  try {
    const parent = fs.lstatSync(path.dirname(value));
    if (parent.uid !== process.getuid() || (parent.mode & 0o077) !== 0) fail("LAN auth supervisor UDS parent is unsafe.");
    const socket = fs.lstatSync(value);
    if (socket.isSymbolicLink() || !socket.isSocket() || socket.uid !== process.getuid()) fail("LAN auth supervisor UDS path is unsafe.");
  } catch (error) {
    if (error?.code !== "ENOENT") fail("LAN auth supervisor UDS path is unavailable or unsafe.");
  }
  return value;
}

export function resolveDashboardRuntime(environment = process.env) {
  const lanAuthEnabled = environment.KENDALL_LAN_AUTH_ENABLED === "true";
  if (!lanAuthEnabled) {
    const containerBind = environment.KENDALL_DASHBOARD_CONTAINER_MODE === "true" && environment.KENDALL_DASHBOARD_HOST === "0.0.0.0";
    return { lanAuthEnabled: false, host: containerBind ? "0.0.0.0" : "127.0.0.1", protocol: "http" };
  }
  const allInterfaces = environment.KENDALL_DASHBOARD_BIND_ADDRESS === "0.0.0.0";
  const bindAddress = allInterfaces
    ? (environment.KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES === "true" ? "0.0.0.0" : fail("LAN auth all-interface bind requires explicit KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES=true."))
    : parseNumericLanBind(environment.KENDALL_DASHBOARD_BIND_ADDRESS);
  const certificate = validatePrivateFile(environment.KENDALL_DASHBOARD_TLS_CERT_FILE, "certificate file");
  const key = validatePrivateFile(environment.KENDALL_DASHBOARD_TLS_KEY_FILE, "key file");
  if (!path.isAbsolute(environment.KENDALL_SUPERVISOR_UDS_PATH || "")) fail("LAN auth requires the fixed supervisor UDS path.");
  return { lanAuthEnabled: true, host: bindAddress, protocol: "https", certificate, key, supervisorUdsPath: environment.KENDALL_SUPERVISOR_UDS_PATH };
}

export function createDashboardServer(handler, environment = process.env) {
  const config = resolveDashboardRuntime(environment);
  if (!config.lanAuthEnabled) return { config, server: http.createServer(handler) };
  return { config, server: https.createServer({ cert: config.certificate, key: config.key }, handler) };
}

export function assertSupervisorStartupGate(config) {
  if (!config.lanAuthEnabled) return Promise.resolve();
  validatePrivateSupervisorUds(config.supervisorUdsPath);
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: config.supervisorUdsPath,
      path: "/internal/lan-auth/startup-gate",
      method: "GET",
      headers: { accept: "application/json" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new LanAuthConfigurationError("Supervisor LAN auth startup gate is unavailable."));
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reject(new LanAuthConfigurationError("Supervisor LAN auth startup gate is invalid.")); }
        if (payload.schemaVersion !== "kendall-lan-auth-startup-gate/v1" || payload.transport !== "private_uds" || payload.bootstrapValidated !== true || payload.supervisorUdsPath !== config.supervisorUdsPath) return reject(new LanAuthConfigurationError("Supervisor LAN auth startup gate is invalid."));
        resolve();
      });
    });
    request.setTimeout(2000, () => request.destroy(new LanAuthConfigurationError("Supervisor LAN auth startup gate timed out.")));
    request.on("error", (error) => reject(error instanceof LanAuthConfigurationError ? error : new LanAuthConfigurationError("Supervisor LAN auth startup gate is unavailable.")));
    request.end();
  });
}

async function main() {
  const config = resolveDashboardRuntime(process.env);
  await assertSupervisorStartupGate(config);
  const rawPort = process.env.KENDALL_DASHBOARD_PORT || "3000";
  if (!/^\d+$/.test(rawPort)) fail("Dashboard port is invalid.");
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail("Dashboard port is invalid.");
  const identity = config.lanAuthEnabled ? resolveCanonicalDashboardIdentity(process.env, port) : null;
  const { server } = createDashboardServer(() => {}, process.env);
  const dashboard = next({ dev: process.argv.includes("--dev") });
  await dashboard.prepare();
  const mediator = config.lanAuthEnabled
    ? createPacketDetailMediator({
      supervisorUdsPath: config.supervisorUdsPath,
      expectedHost: process.env.KENDALL_DASHBOARD_ALLOWED_HOST || formatDashboardHost(config.host, port),
      expectedOrigin: process.env.KENDALL_DASHBOARD_ORIGIN,
    })
    : null;
  const authProxy = config.lanAuthEnabled
    ? createAuthProxy({ supervisorUdsPath: config.supervisorUdsPath, expectedOrigin: process.env.KENDALL_DASHBOARD_ORIGIN })
    : null;
  const supervisorProxy = config.lanAuthEnabled
    ? createSupervisorProxy({ supervisorUdsPath: config.supervisorUdsPath, expectedOrigin: process.env.KENDALL_DASHBOARD_ORIGIN })
    : null;
  server.removeAllListeners("request");
  const nextHandler = dashboard.getRequestHandler();
  server.on("request", async (request, response) => {
    applyLanAuthSecurityHeaders(response, config);
    if (identity && !isAllowedDashboardHost(request, identity)) {
      sendJson(response, 421, { state: "unavailable" });
      return;
    }
    if (identity && request.method === "GET" && request.url === "/_kendall/runtime-health") {
      sendJson(response, 200, runtimeHealthPayload(identity));
      return;
    }
    if (mediator && await mediator(request, response)) return;
    if (authProxy && await authProxy(request, response)) return;
    if (supervisorProxy && await supervisorProxy(request, response)) return;
    if (config.lanAuthEnabled && isDashboardEntryRoute(request)) {
      const cookie = request.headers.cookie;
      const valid = await supervisorSessionIsValid({ supervisorUdsPath: config.supervisorUdsPath, cookie });
      if (!valid) {
        sendHtml(response, 200, signInPageSafe(request.url || "/", cookie ? "Your session ended. Sign in to continue." : ""));
        return;
      }
    }
    if (config.lanAuthEnabled && isProtectedNextRoute(request) && !isDashboardEntryRoute(request)) {
      writeProtectedRouteDenial(response);
      return;
    }
    nextHandler(request, response);
  });
  server.listen(port, config.host, () => {
    process.stdout.write(`Kendall dashboard listening on ${config.protocol}://${config.host}:${port}\n`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Dashboard startup failed."}\n`);
    process.exitCode = 1;
  });
}
