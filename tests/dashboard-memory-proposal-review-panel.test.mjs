import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("work item detail surfaces persisted memory proposal review controls", async () => {
  const [pageSource, panelSource, runtimeSource] = await Promise.all([
    readFile("apps/dashboard/src/components/work-item-detail-page.tsx", "utf8"),
    readFile("apps/dashboard/src/components/memory-proposal-review-panel.tsx", "utf8"),
    readFile("apps/dashboard/src/lib/pipeline-supervisor-runtime.ts", "utf8"),
  ]);

  assert.match(runtimeSource, /export async function getWorkPacket\(packetId: string, options\?: SupervisorReadOptions\)/);
  assert.match(runtimeSource, /\/pipeline-control-plane\/work-packets\/\$\{encodeURIComponent\(packetId\)\}/);
  assert.match(runtimeSource, /export async function getWorkPackets\(\): Promise<DashboardCanonicalWorkPacketV1\[\]>/);
  assert.match(runtimeSource, /canonicalPackets\(await requestJson<unknown>\("\/pipeline-control-plane\/work-packets"\)\)/);
  assert.match(runtimeSource, /export async function getWorkItemMemoryReview\(workItemId: string, options\?: SupervisorReadOptions\)/);
  assert.match(runtimeSource, /\/pipeline-control-plane\/work-items\/\$\{encodeURIComponent\(workItemId\)\}\/memory-review/);
  assert.match(runtimeSource, /review\.workItemId !== workItemId/);
  assert.match(pageSource, /getWorkItemMemoryReview\(workItemId, options\)/);
  assert.doesNotMatch(pageSource, /projectDashboardCanonicalPresentationForWorkItemHold/);
  assert.doesNotMatch(pageSource, /getWorkPacket\(`work_item:/);
  assert.match(pageSource, /memoryReview \? <MemoryProposalReviewPanel review=\{memoryReview\} workItemId=\{item\.id\} \/> : null/);
  assert.match(pageSource, /<MemoryProposalReviewPanel review=\{memoryReview\} workItemId=\{item\.id\} \/>/);
  assert.match(pageSource, /href="#memory-proposals"/);

  assert.match(panelSource, /PATCH/);
  assert.match(panelSource, /\/work-items\/\$\{workItemId\}\/memory-proposals\/\$\{encodeURIComponent\(proposal\.proposalId\)\}/);
  assert.match(panelSource, /POST/);
  assert.match(panelSource, /\/work-items\/\$\{workItemId\}\/memory-proposals\/\$\{encodeURIComponent\(proposal\.proposalId\)\}\/ai-draft/);
  assert.match(panelSource, /writeBackAllowed: false/);
  assert.match(panelSource, /No action here mutates canonical Obsidian notes/);
  assert.match(panelSource, /Approve future draft/);
  assert.match(panelSource, /Create AI draft/);
  assert.match(panelSource, /LLM-Wiki readiness/);
  assert.match(panelSource, /llmWikiReadiness/);
  assert.doesNotMatch(panelSource, /WorkPacketV0View/);
  assert.match(panelSource, /durableWriteAllowed/);
  assert.match(panelSource, /rebuildPreview/);
  assert.match(panelSource, /rebuildDryRunPlan/);
  assert.match(panelSource, /Metadata-only rebuild preview/);
  assert.match(panelSource, /No-write rebuild dry-run plan/);
  assert.match(panelSource, /llm-wiki-artifact/);
  assert.match(panelSource, /targetVaultFolder/);
  assert.match(panelSource, /LLM Wiki Derived/);
  assert.match(panelSource, /maxLength=\{120\}/);
  assert.match(panelSource, /llmWikiQuery\.trim\(\)\.slice\(0, 120\)/);
  assert.match(panelSource, /targetsAiDraftQueue/);
  assert.match(panelSource, /The supervisor request was interrupted; no memory proposal change was confirmed\./);
  assert.match(panelSource, /The LLM-Wiki artifact read was interrupted; no result was retained\./);
  assert.match(panelSource, /The AI draft request was interrupted; no draft write was confirmed\./);
  assert.match(panelSource, /Search artifact/);
  assert.match(panelSource, /LLM-Wiki search/);
  assert.match(panelSource, /Planned sections/);
  assert.match(panelSource, /Discard path/);
  assert.match(panelSource, /Input refs/);
  assert.doesNotMatch(panelSource, /Rebuild LLM-Wiki/);
  assert.doesNotMatch(panelSource, /llm-wiki-rebuild/);
  assert.match(panelSource, /Needs edit/);
  assert.match(panelSource, /Reject/);
  assert.match(panelSource, /Defer/);
});
