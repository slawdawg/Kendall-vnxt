import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const pageSource = fs.readFileSync(path.join(appRoot, "app/page.tsx"), "utf8");
const overviewSource = fs.readFileSync(path.join(appRoot, "components/lan-overview.tsx"), "utf8");

test("LAN-auth root renders the authenticated Overview client", () => {
  assert.match(pageSource, /KENDALL_LAN_AUTH_ENABLED === "true"/);
  assert.match(pageSource, /<LanOverview\s*\/>/);
  assert.match(overviewSource, /getRunStatus\(/);
  assert.match(overviewSource, /getWorkItems\(/);
  assert.match(overviewSource, /<MonitoringHome status=\{data\.status\} items=\{data\.items\}/);
  assert.match(overviewSource, /Overview unavailable/);
  assert.match(overviewSource, /AbortController/);
  assert.match(overviewSource, /Invalid overview payload/);
  assert.match(overviewSource, /Retry overview/);
});
