import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const runtimeSource = fs.readFileSync(path.join(appRoot, "lib/pipeline-supervisor-runtime.ts"), "utf8");

test("authoritative packet detail validates lifecycle shape before legacy fallback", () => {
  assert.match(runtimeSource, /AuthoritativeWorkPacketLifecycleView/);
  assert.match(runtimeSource, /isAuthoritativeWorkPacketLifecycleView/);
  assert.match(runtimeSource, /authoritative lifecycle-shaped; using legacy WorkPacketV0 fallback/);
  assert.match(runtimeSource, /Canonical WorkPacket response is not WorkPacketV0-shaped/);
});
