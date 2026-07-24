import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const pageSource = fs.readFileSync(path.join(appRoot, "app/page.tsx"), "utf8");
const overviewSource = fs.readFileSync(path.join(appRoot, "components/lan-overview.tsx"), "utf8");
const pipelinePageSource = fs.readFileSync(path.join(appRoot, "app/pipeline/page.tsx"), "utf8");
const packetDetailPageSource = fs.readFileSync(path.join(appRoot, "app/pipeline/packets/[packetId]/page.tsx"), "utf8");
const lanPipelineSource = fs.readFileSync(path.join(appRoot, "components/pipeline/lan-pipeline-page.tsx"), "utf8");
const lanPacketDetailSource = fs.readFileSync(path.join(appRoot, "components/pipeline/lan-packet-detail-page.tsx"), "utf8");
const shellSource = fs.readFileSync(path.join(appRoot, "components/shell.tsx"), "utf8");
const serverShellSource = fs.readFileSync(path.join(appRoot, "components/server-shell.tsx"), "utf8");

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

test("LAN-auth pipeline passes server-resolved auth mode through the client shell", () => {
  assert.match(pipelinePageSource, /<LanPipelinePage\s+lanAuthEnabled\s*\/>/);
  assert.match(packetDetailPageSource, /<LanPacketDetailPage\s+lanAuthEnabled\s+packetId=\{decodedPacketId\}\s*\/>/);
  assert.match(lanPipelineSource, /function LanPipelinePage\(\{ lanAuthEnabled \}: \{ lanAuthEnabled: boolean \}\)/);
  assert.match(lanPacketDetailSource, /function LanPacketDetailPage\(\{ lanAuthEnabled, packetId \}: \{ lanAuthEnabled: boolean; packetId: string \}\)/);
  assert.equal((lanPipelineSource.match(/<Shell compactHeader lanAuthEnabled=\{lanAuthEnabled\} realtimeRefresh=\{false\} wide>/g) ?? []).length, 4);
  assert.equal((lanPacketDetailSource.match(/<Shell compactHeader lanAuthEnabled=\{lanAuthEnabled\} realtimeRefresh=\{false\} wide>/g) ?? []).length, 4);
  assert.doesNotMatch(shellSource, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(serverShellSource, /process\.env\.KENDALL_LAN_AUTH_ENABLED === "true"/);
  assert.match(serverShellSource, /<Shell \{\.\.\.props\} lanAuthEnabled=\{process\.env\.KENDALL_LAN_AUTH_ENABLED === "true"\} \/>/);
});
