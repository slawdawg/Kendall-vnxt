import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..");
const source = readFileSync(resolve(root, "apps/dashboard/src/components/memory-inbox-shell.tsx"), "utf8");
const transport = readFileSync(resolve(root, "apps/dashboard/src/lib/supervisor.ts"), "utf8");

test("Memory Inbox shell has fixed native destinations and no lifecycle fixture", () => {
  for (const destination of ["inbox", "drafts", "review", "processed"]) assert.match(source, new RegExp(`id: "${destination}"`));
  assert.match(source, /aria-label="Memory Inbox destinations"/);
  assert.match(source, /aria-current=/);
  assert.match(source, /href=\{`\/memory-inbox\?destination=\$\{destination\.id\}`\}/);
  assert.match(source, /Memory Inbox unavailable/);
  assert.match(source, /Refresh Memory Inbox/);
  assert.match(source, /useAuthenticatedPageRead/);
  assert.match(source, /headingRef\.current\?\.focus/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fixture|sample|count|MemoryCapture|MemoryProposal/);
  assert.match(transport, /requestJson<unknown>\("\/memory-inbox\/shell"/);
  assert.match(transport, /isMemoryInboxShellStatusV1/);
});
