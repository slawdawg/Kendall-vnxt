import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..");
const source = readFileSync(resolve(root, "apps/dashboard/src/components/memory-inbox-shell.tsx"), "utf8");
const transport = readFileSync(resolve(root, "apps/dashboard/src/lib/supervisor.ts"), "utf8");

test("Memory Inbox renders only the authoritative, content-free lifecycle projection", () => {
  for (const destination of ["inbox", "drafts", "review", "processed"]) assert.match(source, new RegExp(`id: "${destination}"`));
  assert.match(source, /aria-label="Memory Inbox destinations"/);
  assert.match(source, /aria-current=/);
  assert.match(source, /href=\{`\/memory-inbox\?destination=\$\{destination\.id\}`\}/);
  assert.match(source, /Supervisor-owned lifecycle projection is current/);
  assert.match(source, /Refresh Memory Inbox/);
  assert.match(source, /useAuthenticatedPageRead/);
  assert.match(source, /headingRef\.current\?\.focus/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fixture|sample|MemoryCapture|MemoryProposal/);
  assert.match(source, /sourceId|lifecycleState|retentionDeadlineAt|nextSafeAction/);
  assert.match(source, /Capture non-sensitive text/);
  assert.match(source, /I confirm this text is non-sensitive/);
  assert.match(source, /Upload a document/);
  assert.match(source, /Document upload is unavailable until its secure intake gate is configured/);
  assert.match(source, /Upload a document/);
  assert.doesNotMatch(source, /type="file"/);
  assert.match(source, /captureMemoryInboxText/);
  assert.match(source, /Save as draft/);
  assert.match(source, /saveMemoryInboxDraft/);
  assert.match(transport, /requestJson<unknown>\("\/memory-inbox\/projection"/);
  assert.match(transport, /isMemoryInboxProjectionV1/);
  assert.match(transport, /requestSupervisorMutation\("\/memory-inbox\/text-capture"/);
  assert.match(transport, /\/memory-inbox\/sources\/\$\{encodeURIComponent\(sourceId\)\}\/lifecycle/);
});
