import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const sourcePath = new URL("../apps/dashboard/src/lib/dashboard-demo-routes.ts", import.meta.url);

async function loadAccessPolicy() {
  const typescript = dashboardRequire("typescript");
  const source = await readFile(sourcePath, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, module: { exports: {} }, process: { env: {} } };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "dashboard-demo-routes.ts" });
  return context.module.exports;
}

test("demo fixtures require explicit development/test opt-in and are always denied with LAN auth", async () => {
  const { dashboardDemoRoutesEnabled } = await loadAccessPolicy();
  assert.equal(dashboardDemoRoutesEnabled({}), false);
  assert.equal(dashboardDemoRoutesEnabled({ KENDALL_DASHBOARD_ENABLE_DEMO_ROUTES: "true" }), true);
  assert.equal(dashboardDemoRoutesEnabled({ KENDALL_LAN_AUTH_ENABLED: "true", KENDALL_DASHBOARD_ENABLE_DEMO_ROUTES: "true" }), false);
  assert.equal(dashboardDemoRoutesEnabled({ KENDALL_DASHBOARD_ENABLE_DEMO_ROUTES: "false" }), false);
});
