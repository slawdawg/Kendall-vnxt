import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));

const supervisorPath = new URL("../apps/dashboard/src/lib/supervisor.ts", import.meta.url);
const loaderPath = new URL("../apps/dashboard/src/lib/pipeline-packet-loader.ts", import.meta.url);
const cockpitPath = new URL("../apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", import.meta.url);

test("dashboard obtains server-bound approval before gated pipeline apply", async () => {
  const [supervisor, loader, cockpit] = await Promise.all([
    readFile(supervisorPath, "utf8"),
    readFile(loaderPath, "utf8"),
    readFile(cockpitPath, "utf8"),
  ]);

  assert.match(supervisor, /\/pipeline-control-plane\/approvals/);
  assert.match(supervisor, /issuePipelineOperationalApproval/);
  assert.match(loader, /requestPipelineOperationalApproval/);
  assert.match(cockpit, /const approval = await requestPipelineOperationalApproval\(approvalRequest\)/);
  assert.match(cockpit, /approvalId: approval\.approvalId/);
  assert.match(cockpit, /expectedCurrentEventId: approval\.expectedCurrentEventId/);
  assert.match(cockpit, /evidence:dashboard-action-request/);
  assert.doesNotMatch(cockpit, /evidence:product-test-approval|evidence:authority-approval/);
});

test("dashboard supervisor client performs approval then apply with server event binding", async () => {
  const source = await readFile(supervisorPath, "utf8");
  const ts = dashboardRequire("typescript");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const calls = [];
  const approval = {
    approvalId: "approval-dashboard-test",
    actionId: "mark_tested",
    targetType: "work_packet",
    targetId: "packet-dashboard-test",
    requestedBy: { actorType: "operator", actorId: "pipeline-operator" },
    requestedAuthorityState: "needs_product_approval",
    requestedRiskTier: "medium",
    expectedCurrentEventId: "event-server-current",
    issuedAt: "2026-07-11T00:00:00.000Z",
    expiresAt: "2026-07-11T00:05:00.000Z",
    consumed: false,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  const context = {
    exports: {},
    module: { exports: {} },
    process: { env: { NEXT_PUBLIC_SUPERVISOR_URL: "http://supervisor.test" } },
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      if (url.endsWith("/approvals")) {
        return { ok: true, async json() { return { data: approval }; } };
      }
      return {
        ok: true,
        async json() {
          return { data: { actionId: "mark_tested", outcome: "succeeded", approvalId: approval.approvalId } };
        },
      };
    },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") {
        return { AUTHORITATIVE_PACKET_STAGES: ["capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"] };
      }
      throw new Error(`Unexpected dashboard supervisor import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "supervisor.ts" });
  const client = context.module.exports;
  const issued = await client.issuePipelineOperationalApproval({
    actionId: "mark_tested",
    targetType: "work_packet",
    targetId: "packet-dashboard-test",
    requestedBy: approval.requestedBy,
    requestedAuthorityState: "needs_product_approval",
    requestedRiskTier: "medium",
    metadataOnly: true,
    rawPayloadRetained: false,
  });
  const applied = await client.applyPipelineOperationalAction({
    schemaVersion: "pipeline-operational-action/v0",
    actionId: issued.actionId,
    targetType: issued.targetType,
    targetId: issued.targetId,
    idempotencyKey: "dashboard-apply-test",
    correlationId: "dashboard-correlation-test",
    requestedBy: approval.requestedBy,
    requestedAuthorityState: issued.requestedAuthorityState,
    requestedRiskTier: issued.requestedRiskTier,
    approvalId: issued.approvalId,
    expectedCurrentEventId: issued.expectedCurrentEventId,
    operatorIntentSummary: "Dashboard bounded test action.",
    evidenceRefs: ["evidence:dashboard-action-request"],
    testResult: "notes",
    metadataOnly: true,
    rawPayloadRetained: false,
  });
  assert.equal(applied.approvalId, approval.approvalId);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://supervisor.test/pipeline-control-plane/approvals");
  assert.equal(calls[0].body.expectedCurrentEventId, undefined);
  assert.equal(calls[1].url, "http://supervisor.test/pipeline-control-plane/actions");
  assert.equal(calls[1].body.approvalId, approval.approvalId);
  assert.equal(calls[1].body.expectedCurrentEventId, approval.expectedCurrentEventId);
  assert.deepEqual(calls[1].body.evidenceRefs, ["evidence:dashboard-action-request"]);
  assert.equal(calls[1].body.metadataOnly, true);
  assert.equal(calls[1].body.rawPayloadRetained, false);
});
