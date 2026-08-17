import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const runtimeSource = fs.readFileSync(path.join(appRoot, "lib/pipeline-supervisor-runtime.ts"), "utf8");

test("authoritative packet detail returns the explicit canonical DTO without legacy fallback", () => {
  assert.match(runtimeSource, /AuthoritativeWorkPacketLifecycleView/);
  assert.match(runtimeSource, /DashboardCanonicalWorkPacketV1/);
  assert.match(runtimeSource, /authoritativeLifecycle/);
  assert.match(runtimeSource, /presentation/);
  assert.match(runtimeSource, /getWorkPacketForWorkItem/);
  assert.match(runtimeSource, /isAuthoritativeWorkPacketLifecycleView/);
  assert.match(runtimeSource, /projectAuthoritativeWorkPacket/);
  assert.match(runtimeSource, /isPipelineCanonicalContractV1/);
  assert.match(runtimeSource, /validatePipelineEpic25EvidenceChainV0/);
  assert.match(runtimeSource, /Canonical WorkPacket detail response is not authoritative lifecycle-shaped/);
  assert.match(runtimeSource, /Canonical WorkPacket response is not authoritative lifecycle-shaped/);
  assert.doesNotMatch(runtimeSource, /requestLegacyJson|mergeWorkPackets|["'`]\/work-packets(?:\/|["'`])/);
});
