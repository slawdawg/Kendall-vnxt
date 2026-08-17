import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifestUrl = new URL("src/lib/dashboard-page-read-manifest.json", root);
const boundaryUrl = new URL("src/lib/authenticated-page-read.ts", root);
const stateUrl = new URL("src/components/authenticated-page-state.tsx", root);
const navUrl = new URL("src/components/operational-nav.tsx", root);
const transportUrl = new URL("src/lib/dashboard-supervisor-transport.ts", root);
const controlsContentUrl = new URL("src/components/controls-page-content.tsx", root);
const controlsDataUrl = new URL("src/lib/controls-page-data.ts", root);
const lanControlsUrl = new URL("src/components/lan-controls-page.tsx", root);
const controlsSchedulerUrl = new URL("src/lib/controls-read-scheduler.mjs", root);
const controlsRouteUrl = new URL("src/app/controls/page.tsx", root);
const operatorProfileUrl = new URL("src/lib/operator-profile.ts", root);
const runnerAssignmentPanelUrl = new URL("src/components/runner-assignment-status-report-panel.tsx", root);

test("LAN operator pages declare exact read contracts and do not replace the server LAN guard", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const expected = ["active-work", "attention", "queue", "audit", "proposed-work", "controls", "work-item-detail", "pipeline"];
  assert.deepEqual(manifest.map((entry) => entry.page), expected);
  for (const page of manifest.filter((entry) => entry.page !== "pipeline")) {
    assert.deepEqual(page.roles, ["operator"]);
    assert.ok(page.reads.every((read) => read.method === "GET"));
  }
  const controls = manifest.find((entry) => entry.page === "controls");
  assert.equal(controls.reads.length, 33);
  assert.equal(
    controls.reads.filter((read) => read.path === "/supervisor/epic-6-completion-audit-report").length,
    0,
  );
  assert.ok(controls.reads.every((read) => read.method === "GET" && !("query" in read)));
  assert.deepEqual(manifest.at(-1).roles, ["operator", "test_viewer"]);
  const [boundary, state, transport] = await Promise.all([readFile(boundaryUrl, "utf8"), readFile(stateUrl, "utf8"), readFile(transportUrl, "utf8")]);
  assert.match(boundary, /8_000/);
  assert.match(boundary, /sign_in_required/);
  assert.match(state, /Session expired/);
  assert.match(state, /Record not found/);
  assert.match(transport, /rejectServerLanAuth/);
  assert.match(transport, /requestSupervisorMutation/);
  assert.match(transport, /credentials:\s*["']same-origin["']/);
  assert.match(transport, /headers\.set\(["']origin["']/);
  assert.match(transport, /headers\.set\(["']x-csrf-token["']/);
});

test("named pages use the authenticated LAN client boundary rather than SSR supervisor reads", async () => {
  for (const route of ["active-work", "attention", "queue", "audit", "proposed-work"]) {
    const source = await readFile(new URL(`src/app/${route}/page.tsx`, root), "utf8");
    assert.match(source, /KENDALL_LAN_AUTH_ENABLED/);
    assert.match(source, /LanOperatorPage/);
  }
  const controlsRoute = await readFile(new URL("src/app/controls/page.tsx", root), "utf8");
  assert.match(controlsRoute, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(controlsRoute, /LanControlsPage/);
  const [controlsContent, operatorProfile] = await Promise.all([readFile(controlsContentUrl, "utf8"), readFile(operatorProfileUrl, "utf8")]);
  assert.match(controlsContent, /!lanAuthEnabled\s*&&\s*<CreateWorkItemForm/);
  assert.match(controlsContent, /<OperatorProfilePanel/);
  assert.match(operatorProfile, /window\.localStorage/);
  assert.doesNotMatch(operatorProfile, /fetch\s*\(/);
  const [detailRoute, detailClient] = await Promise.all([
    readFile(new URL("src/app/work-items/[work-item-id]/page.tsx", root), "utf8"),
    readFile(new URL("src/components/work-item-detail-page.tsx", root), "utf8"),
  ]);
  assert.match(detailRoute, /KENDALL_LAN_AUTH_ENABLED/);
  assert.match(detailRoute, /getWorkItem\(workItemId\)/);
  assert.match(detailRoute, /<WorkItemDetailPage workItemId=\{workItemId\} lanAuthEnabled \/>/);
  assert.match(detailClient, /"use client"/);
  assert.match(detailClient, /useAuthenticatedPageRead/);
  assert.match(detailClient, /AuthenticatedPageState/);
  assert.match(detailClient, /loadWorkItemDetail\(workItemId, signal\)/);
  assert.match(detailClient, /getWorkPacketForWorkItem\(workItemId, options\)/);
  assert.doesNotMatch(detailClient, /getWorkPacket\(`work_item:/);
});

test("Controls keeps its fixed full-data manifest while using bounded safe diagnostics", async () => {
  const [controlsData, controlsContent, lanControls, scheduler, pageState, controlsRoute] = await Promise.all([
    readFile(controlsDataUrl, "utf8"),
    readFile(controlsContentUrl, "utf8"),
    readFile(lanControlsUrl, "utf8"),
    readFile(controlsSchedulerUrl, "utf8"),
    readFile(stateUrl, "utf8"),
    readFile(controlsRouteUrl, "utf8"),
  ]);
  assert.match(controlsData, /runBoundedControlsReads/);
  assert.match(controlsData, /CONTROLS_PAGE_READ_TIMEOUT_MS = 15_000/);
  assert.equal((controlsData.match(/alias:/g) || []).length, 33);
  assert.doesNotMatch(controlsData, /epic-6-completion-audit-report|Epic6CompletionAudit/);
  assert.doesNotMatch(controlsContent, /epic-6-completion-audit-report|EpicCompletionAudit/);
  assert.doesNotMatch(controlsData, /Promise\.all\(\[/);
  assert.match(lanControls, /timeoutMs: CONTROLS_PAGE_READ_TIMEOUT_MS/);
  assert.match(lanControls, /safeControlsDiagnostic/);
  assert.match(lanControls, /ControlsReadFailure/);
  assert.match(pageState, /diagnostic\?: string \| null/);
  assert.match(scheduler, /CONTROLS_READ_CONCURRENCY = 8/);
  assert.match(scheduler, /controller\.abort\(\)/);
  assert.match(scheduler, /new ControlsReadFailure\(task\.alias, failureCategory\(error\)\)/);
  assert.doesNotMatch(scheduler, /super\(.*error\.message/);
  assert.match(controlsRoute, /export const dynamic = "force-dynamic"/);
});

test("test viewer navigation contains only the pipeline surface while its session role is unknown or viewer", async () => {
  const nav = await readFile(navUrl, "utf8");
  assert.match(nav, /useDashboardSessionRole/);
  assert.match(nav, /link\.href === "\/pipeline"/);
});

test("runner assignment history stays explicit and cache-compatible after compact projection", async () => {
  const panel = await readFile(runnerAssignmentPanelUrl, "utf8");
  assert.match(panel, /report\.closedHistory \?\? EMPTY_CLOSED_HISTORY/);
  assert.match(panel, /Closed degraded rows/);
  assert.match(panel, /Closed warning aggregate/);
  assert.match(panel, /sourceBacklogItemIdsOmitted/);
  assert.match(panel, /sourceBacklogItemIdsStatus \?\? "complete"/);
  assert.match(panel, /Source item IDs omitted/);
});
