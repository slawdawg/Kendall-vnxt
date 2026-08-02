import fs from "node:fs";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, chmodSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

function lanAddress() {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === "IPv4" && !entry.internal && entry.address !== "127.0.0.1") return entry.address;
    }
  }
  throw new Error("No non-loopback IPv4 address is available for the real LAN runtime harness.");
}

export async function startEpic26NextLanHarness(port = 3103) {
  const host = lanAddress();
  const directory = mkdtempSync(join(tmpdir(), "kendall-epic26-next-lan-"));
  chmodSync(directory, 0o700);
  const socketPath = join(directory, "supervisor.sock");
  const certPath = join(directory, "cert.pem");
  const keyPath = join(directory, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", `/CN=${host}`, "-addext", `subjectAltName=IP:${host}`], { stdio: "ignore" });
  chmodSync(certPath, 0o600);
  chmodSync(keyPath, 0o600);
  let sessionValid = false;
  let sessionRole = "operator";
  const readCookie = (header, name) => header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  const supervisor = http.createServer((request, response) => {
    const cookie = request.headers.cookie || "";
    const json = (status, payload) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(payload)); };
    if (request.url === "/internal/lan-auth/startup-gate") return json(200, { schemaVersion: "kendall-lan-auth-startup-gate/v1", transport: "private_uds", bootstrapValidated: true, supervisorUdsPath: socketPath });
    if (request.url === "/auth/login-csrf") return json(200, { csrfToken: "harness-login-csrf" });
    if (request.url === "/auth/login" && request.method === "POST") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        let payload = {};
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* generic failure */ }
        if (payload.password !== "test-password" || !["operator", "test_viewer"].includes(payload.account)) return json(401, { detail: "Sign-in unavailable." });
        sessionValid = true;
        sessionRole = payload.account;
        response.setHeader("set-cookie", "kendall_operator_session=harness-session; Secure; HttpOnly; SameSite=Strict; Path=/");
        return json(200, { authenticated: true, csrfToken: "harness-session-csrf", role: sessionRole });
      });
      return;
    }
    if (request.url === "/auth/session") return json(sessionValid && readCookie(cookie, "kendall_operator_session") === "harness-session" ? 200 : 401, { authenticated: sessionValid, role: sessionRole });
    if (request.url === "/auth/logout" && request.method === "POST") {
      sessionValid = false;
      sessionRole = "operator";
      response.setHeader("set-cookie", "kendall_operator_session=; Max-Age=0; Secure; HttpOnly; SameSite=Strict; Path=/");
      return json(200, { signedOut: true });
    }
    if (!sessionValid || readCookie(cookie, "kendall_operator_session") !== "harness-session") return json(401, { detail: "Sign-in required." });
    if (request.url === "/pipeline-control-plane/projection") return json(200, { data: {} });
    if (request.url === "/pipeline-control-plane/work-packets") return json(200, { data: [] });
    if (request.url === "/internal/dashboard/packet-detail/packet-1") return json(200, { schemaVersion: "kendall-authenticated-packet-detail/v1", state: "available", packet: { packetId: "packet-1", title: "Packet 1 detail", currentStage: "shaping", status: "ready", truthLabel: "integrated_local", evidence: { schemaVersion: "pipeline-epic-25-evidence-chain/v1", evidenceClass: "source_owned", checkedAt: "2026-07-22T12:00:00.000Z", expiresAt: "2026-07-22T12:05:00.000Z", freshnessState: "fresh", effectiveDecision: "hold", typedBlockers: [] } } });
    return json(404, { detail: "Not found." });
  });
  await new Promise((resolve) => supervisor.listen(socketPath, resolve));

  const origin = `https://${host}:${port}`;
  const dashboard = spawn(process.execPath, ["scripts/secure-dashboard-runtime.mjs", "--dev"], {
    cwd: new URL("../../apps/dashboard", import.meta.url),
    env: {
      ...process.env,
      KENDALL_LAN_AUTH_ENABLED: "true",
      KENDALL_DASHBOARD_BIND_ADDRESS: host,
      KENDALL_DASHBOARD_PORT: String(port),
      KENDALL_DASHBOARD_TLS_CERT_FILE: certPath,
      KENDALL_DASHBOARD_TLS_KEY_FILE: keyPath,
      KENDALL_SUPERVISOR_UDS_PATH: socketPath,
      KENDALL_DASHBOARD_ORIGIN: origin,
      KENDALL_DASHBOARD_ALLOWED_HOST: `${host}:${port}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  const waitForReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Next LAN runtime did not start.\n${output.join("")}`)), 120_000);
    const onData = (chunk) => {
      output.push(chunk.toString());
      if (chunk.toString().includes(`Kendall dashboard listening on https://${host}:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    dashboard.stdout.on("data", onData);
    dashboard.stderr.on("data", onData);
    dashboard.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Next LAN runtime exited (${code}).\n${output.join("")}`)); });
  });
  await waitForReady;
  return {
    origin,
    close: async () => {
      const stopped = new Promise((resolve) => dashboard.once("exit", resolve));
      dashboard.kill("SIGTERM");
      const graceful = await Promise.race([
        stopped.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
      ]);
      if (!graceful) {
        dashboard.kill("SIGKILL");
        await stopped;
      }
      await new Promise((resolve) => supervisor.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
