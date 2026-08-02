import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const dashboardRequire = createRequire(new URL("./package.json", import.meta.url));
const configPath = new URL("./next.config.ts", import.meta.url);

async function loadNextConfig(environment) {
  const source = await readFile(configPath, "utf8");
  const typescript = dashboardRequire("typescript");
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: environment },
    require: dashboardRequire,
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "next.config.ts" });
  return context.module.exports.default;
}

test("dashboard development origins use the validated configured LAN or Tailscale bind without expanding local mode", async () => {
  const localConfig = await loadNextConfig({});
  assert.deepEqual([...localConfig.allowedDevOrigins], ["localhost", "127.0.0.1"]);

  const lanConfig = await loadNextConfig({
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_DASHBOARD_BIND_ADDRESS: "192.168.1.8",
  });
  assert.deepEqual([...lanConfig.allowedDevOrigins], ["localhost", "127.0.0.1", "192.168.1.8"]);

  const tailnetConfig = await loadNextConfig({
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_DASHBOARD_BIND_ADDRESS: "100.86.154.99",
    KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME: "kendallvnxt-1.tail045dec.ts.net.",
  });
  assert.deepEqual([...tailnetConfig.allowedDevOrigins], ["localhost", "127.0.0.1", "100.86.154.99", "kendallvnxt-1.tail045dec.ts.net"]);

  const invalidConfig = await loadNextConfig({
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_DASHBOARD_BIND_ADDRESS: "dashboard.local",
  });
  assert.deepEqual([...invalidConfig.allowedDevOrigins], ["localhost", "127.0.0.1"]);

  const invalidHostnameConfig = await loadNextConfig({
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME: "https://not-a-host.example",
  });
  assert.deepEqual([...invalidHostnameConfig.allowedDevOrigins], ["localhost", "127.0.0.1"]);

  const publicHostnameConfig = await loadNextConfig({
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME: "dashboard.example.com",
  });
  assert.deepEqual([...publicHostnameConfig.allowedDevOrigins], ["localhost", "127.0.0.1"]);
});
