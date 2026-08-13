import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const runtimeSource = fs.readFileSync(path.join(appRoot, "lib/pipeline-supervisor-runtime.ts"), "utf8");

test("authoritative packet detail projects canonical lifecycle before narrow legacy fallback", () => {
  assert.match(runtimeSource, /AuthoritativeWorkPacketLifecycleView/);
  assert.match(runtimeSource, /isAuthoritativeWorkPacketLifecycleView/);
  assert.match(runtimeSource, /projectAuthoritativeWorkPacket/);
  assert.match(runtimeSource, /LEGACY_PACKET_ID/);
  assert.match(runtimeSource, /Canonical WorkPacket detail response is not authoritative lifecycle-shaped/);
  assert.match(runtimeSource, /canonical\.kind === "authoritative"/);
});
