import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = new URL("../apps/dashboard/src/app/pipeline/page.tsx", import.meta.url);
const detailRoute = new URL("../apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx", import.meta.url);
const pipelineClient = new URL("../apps/dashboard/src/components/pipeline/lan-pipeline-page.tsx", import.meta.url);
const detailClient = new URL("../apps/dashboard/src/components/pipeline/lan-packet-detail-page.tsx", import.meta.url);
const packetLoader = new URL("../apps/dashboard/src/lib/pipeline-packet-loader.ts", import.meta.url);
const runtime = new URL("../apps/dashboard/src/lib/pipeline-supervisor-runtime.ts", import.meta.url);
const transport = new URL("../apps/dashboard/src/lib/dashboard-supervisor-transport.ts", import.meta.url);
const uds = new URL("../apps/dashboard/src/lib/pipeline-supervisor-uds.ts", import.meta.url);
const supervisorProxy = new URL("../apps/dashboard/scripts/dashboard-supervisor-proxy.mjs", import.meta.url);
const cockpit = new URL("../apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", import.meta.url);

test("LAN pipeline route avoids server-side supervisor reads", async () => {
  const source = await readFile(route, "utf8");
  assert.match(source, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(source, /LanPipelinePage/);
  assert.match(source, /loadPipelineCockpitPackets/);
  assert.match(await readFile(pipelineClient, "utf8"), /loadPipelineCockpitPackets/);
});

test("normal and LAN cockpit callers carry client-safe canonical packets to the named V0 compatibility boundary", async () => {
  const [normalSource, lanSource, detailSource, loaderSource, cockpitSource] = await Promise.all([
    readFile(route, "utf8"),
    readFile(pipelineClient, "utf8"),
    readFile(detailRoute, "utf8"),
    readFile(packetLoader, "utf8"),
    readFile(cockpit, "utf8"),
  ]);
  assert.match(normalSource, /canonicalPackets=\{canonicalPackets\}/);
  assert.match(lanSource, /canonicalPackets=\{result\.canonicalPackets\}/);
  assert.match(loaderSource, /canonicalPackets: DashboardCanonicalWorkPacketClientV1\[\]/);
  assert.match(loaderSource, /canonicalPackets: canonicalPackets\.map\(projectDashboardCanonicalPacketForClient\)/);
  assert.match(loaderSource, /function clientSafePipelineProjection/);
  assert.match(loaderSource, /canonicalContract: null/);
  assert.match(loaderSource, /productModeMapping: null/);
  assert.match(loaderSource, /canonicalPacket: DashboardCanonicalWorkPacketV1 \| null/);
  assert.doesNotMatch(loaderSource, /packets: PipelineRuntimePacket\[\]/);
  assert.doesNotMatch(loaderSource, /packet: PipelineRuntimePacket \| null/);
  assert.doesNotMatch(loaderSource, /payloadSummary: lifecycle\.history/);
  assert.doesNotMatch(loaderSource, /evidenceRefs: lifecycle\.history/);
  assert.match(cockpitSource, /canonicalPackets\.map\(\(packet\) => packet\.compatibilityProjection\)/);
  assert.match(cockpitSource, /projectSupervisorWorkPacketsToCockpitPackets/);
  assert.match(detailSource, /const \{ fixtureMode, canonicalPacket, workGraph \}/);
  assert.match(detailSource, /<PacketDetailPage canonicalPacket=\{canonicalPacket\}/);
});

test("LAN pipeline browser reads stay out of the Node UDS module and use the authenticated supervisor proxy", async () => {
  const [client, loader, runtimeSource, transportSource, udsSource, proxySource, cockpitSource] = await Promise.all([
    readFile(pipelineClient, "utf8"),
    readFile(packetLoader, "utf8"),
    readFile(runtime, "utf8"),
    readFile(transport, "utf8"),
    readFile(uds, "utf8"),
    readFile(supervisorProxy, "utf8"),
    readFile(cockpit, "utf8"),
  ]);
  assert.match(client, /loadPipelineCockpitPackets/);
  assert.doesNotMatch(loader, /pipeline-supervisor-uds|node:http/);
  assert.match(runtimeSource, /requestSupervisorJson/);
  assert.match(transportSource, /\$\{window\.location\.origin\}\/api\/supervisor/);
  assert.match(proxySource, /READ_ONLY_SUPERVISOR_PATHS/);
  assert.match(proxySource, /redactPipelineProjectionResponse/);
  assert.match(proxySource, /projection\|work-packets.*work-items/);
  assert.match(proxySource, /\/work-packets/);
  assert.match(proxySource, /work-items\\\/\[A-Za-z0-9\._:%-\]\+\\\/packet/);
  assert.match(udsSource, /CANONICAL_WORK_ITEM_PACKET_PATH/);
  assert.match(udsSource, /\^\\\/pipeline-control-plane\\\/work-items\\\//);
  assert.doesNotMatch(udsSource, /work-items.*\(\.\*\|\.\+\)/);
  assert.match(proxySource, /requestSupervisor\(supervisorUdsPath, "\/auth\/session"/);
  assert.match(cockpitSource, /projectionSupportsOperationalActions/);
  assert.match(cockpitSource, /readOnly/);
  assert.match(cockpitSource, /until the supervisor projection is current live truth/);
  assert.match(cockpitSource, /sourceState\.kind !== "runtime" && sourceState\.kind !== "stale"/);
});

test("LAN Packet Detail uses the authenticated mediator with explicit expiry and unavailable states", async () => {
  const source = await readFile(detailRoute, "utf8");
  const client = await readFile(detailClient, "utf8");
  assert.match(source, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(source, /LanPacketDetailPage/);
  assert.match(client, /\/api\/packet-detail\//);
  assert.match(client, /setPacket\(null\)/);
  assert.match(client, /setState\("ready"\)/);
  assert.match(client, /let settled = false/);
  assert.match(client, /if \(!active \|\| settled\) return/);
  assert.match(client, /if \(!active \|\| settled \|\| controller\.signal\.aborted\) return/);
  assert.match(client, /Session expired/);
  assert.match(client, /Packet detail unavailable/);
});

test("LAN pipeline client distinguishes expired sessions from unavailable reads", async () => {
  const client = await readFile(pipelineClient, "utf8");
  assert.match(client, /Session expired/);
  assert.match(client, /401/);
  assert.match(client, /Return to sign in/);
  assert.match(client, /Retry pipeline/);
  assert.match(client, /8_000/);
});
