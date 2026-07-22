import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthProxy, supervisorSessionIsValid } from "../../apps/dashboard/scripts/dashboard-auth-proxy.mjs";
import { createPacketDetailMediator } from "../../apps/dashboard/scripts/packet-detail-mediator.mjs";
import { signInPageSafe } from "../../apps/dashboard/scripts/secure-dashboard-runtime.mjs";

export async function startEpic26AuthHarness(port = 3102) {
  const directory = mkdtempSync(join(tmpdir(), "kendall-epic26-auth-harness-"));
  chmodSync(directory, 0o700);
  const socketPath = join(directory, "supervisor.sock");
  const certPath = join(directory, "cert.pem");
  const keyPath = join(directory, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  chmodSync(certPath, 0o600);
  chmodSync(keyPath, 0o600);
  let sessionValid = false;
  const readCookie = (header, name) => header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  const supervisor = http.createServer((request, response) => {
    const cookie = request.headers.cookie || "";
    if (request.url === "/internal/lan-auth/startup-gate") {
      response.end(JSON.stringify({ schemaVersion: "kendall-lan-auth-startup-gate/v1", transport: "private_uds", bootstrapValidated: true, supervisorUdsPath: socketPath }));
      return;
    }
    if (request.url === "/auth/login-csrf") {
      response.end(JSON.stringify({ csrfToken: "harness-login-csrf" }));
      return;
    }
    if (request.url === "/auth/login" && request.method === "POST") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        let payload = {};
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* generic failure */ }
        if (payload.password !== "test-password") {
          response.writeHead(401);
          response.end(JSON.stringify({ detail: "Sign-in unavailable. Check credentials or try again later." }));
          return;
        }
        sessionValid = true;
        response.setHeader("set-cookie", ["kendall_operator_session=harness-session; Secure; HttpOnly; SameSite=Strict; Path=/"]);
        response.end(JSON.stringify({ authenticated: true, csrfToken: "harness-session-csrf", role: "operator" }));
      });
      return;
    }
    if (request.url === "/auth/session") {
      response.writeHead(sessionValid && readCookie(cookie, "kendall_operator_session") === "harness-session" ? 200 : 401);
      response.end(JSON.stringify({ authenticated: sessionValid, role: "operator" }));
      return;
    }
    if (request.url === "/auth/logout" && request.method === "POST") {
      if (!sessionValid || readCookie(cookie, "kendall_operator_session") !== "harness-session" || request.headers["x-csrf-token"] !== "harness-session-csrf") {
        response.writeHead(403);
        response.end(JSON.stringify({ detail: "Logout was not accepted." }));
        return;
      }
      sessionValid = false;
      response.setHeader("set-cookie", ["kendall_operator_session=; Max-Age=0; Secure; HttpOnly; SameSite=Strict; Path=/", "kendall_operator_csrf=; Max-Age=0; Secure; SameSite=Strict; Path=/"]);
      response.end(JSON.stringify({ signedOut: true }));
      return;
    }
    if (request.url === "/internal/dashboard/packet-detail/packet-1") {
      if (!sessionValid || readCookie(cookie, "kendall_operator_session") !== "harness-session") { response.writeHead(401); response.end(JSON.stringify({ detail: "Sign-in required." })); return; }
      response.end(JSON.stringify({ schemaVersion: "kendall-authenticated-packet-detail/v1", state: "available", packet: { packetId: "packet-1", title: "Packet 1 detail", currentStage: "shaping", status: "ready", truthLabel: "integrated_local", evidence: { schemaVersion: "pipeline-epic-25-evidence-chain/v1", evidenceClass: "source_owned", checkedAt: "2026-07-22T12:00:00.000Z", expiresAt: "2026-07-22T12:05:00.000Z", freshnessState: "fresh", effectiveDecision: "hold", typedBlockers: [] } } }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => supervisor.listen(socketPath, resolve));

  const proxy = createAuthProxy({ supervisorUdsPath: socketPath, expectedOrigin: `https://127.0.0.1:${port}` });
  const mediator = createPacketDetailMediator({ supervisorUdsPath: socketPath, expectedHost: `127.0.0.1:${port}`, expectedOrigin: `https://127.0.0.1:${port}` });
  const dashboard = https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, async (request, response) => {
    if (await mediator(request, response) || await proxy(request, response)) return;
    if (request.url === "/pipeline" || request.url === "/") {
      if (!await supervisorSessionIsValid({ supervisorUdsPath: socketPath, cookie: request.headers.cookie })) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(signInPageSafe(request.url));
        return;
      }
      response.end(`<!doctype html><html><body><main><h1>Kendall Supervisor</h1><article><h2>Packet 1</h2><p>Status: ready</p><button id="detail">Open Packet Detail</button><section id="detail-view" hidden></section><button id="logout">Sign out</button></article></main><script>document.getElementById("detail").onclick=async()=>{const response=await fetch("/api/packet-detail/packet-1",{credentials:"same-origin"});const body=await response.json();if(body.state==="available"){const view=document.getElementById("detail-view");view.hidden=false;view.textContent=body.packet.title+" "+body.packet.evidence.effectiveDecision}};document.getElementById("logout").onclick=async()=>{await fetch("/auth/logout",{method:"POST",credentials:"same-origin",headers:{origin:location.origin,"x-csrf-token":"harness-session-csrf"}});location.assign("/")}</script></body></html>`);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => { dashboard.once("error", reject); dashboard.listen(port, "127.0.0.1", resolve); });
  return { port, close: async () => { await new Promise((resolve) => dashboard.close(resolve)); await new Promise((resolve) => supervisor.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); } };
}
