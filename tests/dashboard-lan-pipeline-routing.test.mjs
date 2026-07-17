import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = new URL("../apps/dashboard/src/app/pipeline/page.tsx", import.meta.url);
const detailRoute = new URL("../apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx", import.meta.url);
const pipelineClient = new URL("../apps/dashboard/src/components/pipeline/lan-pipeline-page.tsx", import.meta.url);
const detailClient = new URL("../apps/dashboard/src/components/pipeline/lan-packet-detail-page.tsx", import.meta.url);

test("LAN pipeline route avoids server-side supervisor reads", async () => {
  const source = await readFile(route, "utf8");
  assert.match(source, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(source, /LanPipelinePage/);
  assert.match(source, /loadPipelineCockpitPackets/);
  assert.match(await readFile(pipelineClient, "utf8"), /loadPipelineCockpitPackets/);
});

test("LAN Packet Detail uses the authenticated mediator with explicit expiry and unavailable states", async () => {
  const source = await readFile(detailRoute, "utf8");
  const client = await readFile(detailClient, "utf8");
  assert.match(source, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(source, /LanPacketDetailPage/);
  assert.match(client, /\/api\/packet-detail\//);
  assert.match(client, /Session expired/);
  assert.match(client, /Packet detail unavailable/);
});
