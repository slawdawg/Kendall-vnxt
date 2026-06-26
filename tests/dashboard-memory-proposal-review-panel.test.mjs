import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("work item detail surfaces persisted memory proposal review controls", async () => {
  const [pageSource, panelSource, supervisorSource] = await Promise.all([
    readFile("apps/dashboard/src/app/work-items/[work-item-id]/page.tsx", "utf8"),
    readFile("apps/dashboard/src/components/memory-proposal-review-panel.tsx", "utf8"),
    readFile("apps/dashboard/src/lib/supervisor.ts", "utf8"),
  ]);

  assert.match(supervisorSource, /export async function getWorkPacket\(packetId: string\)/);
  assert.match(supervisorSource, /\/work-packets\/\$\{encodeURIComponent\(packetId\)\}/);
  assert.match(pageSource, /getWorkPacket\(`work_item:\$\{workItemId\}`\)/);
  assert.match(pageSource, /<MemoryProposalReviewPanel packet=\{workPacket\} workItemId=\{item\.id\} \/>/);
  assert.match(pageSource, /href="#memory-proposals"/);

  assert.match(panelSource, /PATCH/);
  assert.match(panelSource, /\/work-items\/\$\{workItemId\}\/memory-proposals\/\$\{encodeURIComponent\(proposal\.proposalId\)\}/);
  assert.match(panelSource, /writeBackAllowed: false/);
  assert.match(panelSource, /No action here mutates canonical Obsidian notes/);
  assert.match(panelSource, /Approve future draft/);
  assert.match(panelSource, /Needs edit/);
  assert.match(panelSource, /Reject/);
  assert.match(panelSource, /Defer/);
});
