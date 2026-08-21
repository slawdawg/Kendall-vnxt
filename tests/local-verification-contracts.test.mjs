import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_VERIFICATION_SCHEMA_VERSION,
  LocalVerificationError,
  assertPlanResponse,
  createErrorResponse,
  createPlanResponse,
  stableJson,
} from "../scripts/lib/local-verification/contracts.mjs";
import { createLocalVerificationPlan } from "../scripts/lib/local-verification/plan-adapter.mjs";
import { createCurrentSourceIdentity, createSourceIdentity } from "../scripts/lib/local-verification/source-identity.mjs";
import { createPlan, main, parseLocalVerificationArgs } from "../scripts/local-verification.mjs";

function fixtureSourceIdentity() {
  return createSourceIdentity({
    commit: "0123456789abcdef",
    worktree: {
      staged: "M scripts/check-plan.mjs\0",
      unstaged: "M tests/check-plan.test.mjs\0",
      untracked: "",
    },
    planner: { version: "check-plan/v1", changedFiles: ["docs/readme.md"] },
    environment: { node: "22.13.0", pnpm: "11.5.2" },
  });
}

test("source identity and plan response are deterministic and schema-valid", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({
    changedFiles: ["docs/workflows/example.md"],
    sourceIdentity,
  });
  const response = createPlanResponse({ sourceIdentity, plan });

  assert.equal(response.schemaVersion, LOCAL_VERIFICATION_SCHEMA_VERSION);
  assert.equal(response.command, "plan");
  assert.equal(response.ok, true);
  assert.equal(response.status, "planned");
  assert.match(response.result.planId, /^plan_[a-f0-9]{64}$/);
  assert.deepEqual(response.sourceIdentity, fixtureSourceIdentity());
  assert.doesNotThrow(() => assertPlanResponse(response));
  assert.deepEqual(response.result.jsonParseFiles, []);
  assert.equal(stableJson({ b: 2, a: ["x", { d: 4, c: 3 }] }), '{"a":["x",{"c":3,"d":4}],"b":2}');
});

test("empty changes create only the documented quick-fail plan shape", () => {
  const plan = createLocalVerificationPlan({ changedFiles: [], sourceIdentity: fixtureSourceIdentity() });
  assert.equal(plan.requiresFullStatic, false);
  assert.deepEqual(plan.surfaces, []);
  assert.deepEqual(plan.reasons, []);
  assert.deepEqual(plan.jsonParseFiles, []);
  assert.equal(plan.nodes.length, 3);
  assert.ok(plan.nodes.every((node) => node.command[0] === "git"));
});

test("unknown and policy-changing surfaces broaden to the canonical governed control", () => {
  for (const changedFiles of [["generated/unclassified.output"], ["package.json"], [".github/workflows/ci.yml"]]) {
    const plan = createLocalVerificationPlan({ changedFiles, sourceIdentity: fixtureSourceIdentity() });
    assert.equal(plan.broadening.mode, "governed-full");
    assert.ok(plan.broadening.reasons.length > 0);
    assert.equal(plan.broadening.fallback, "pnpm run check");
    assert.equal(plan.nextAction, "start-governed-control");
    assert.deepEqual(plan.nodes.map((node) => node.command), [["pnpm", "run", "check"]]);
    assert.deepEqual(plan.jsonParseFiles, []);
    assert.doesNotThrow(() => assertPlanResponse(createPlanResponse({ sourceIdentity: fixtureSourceIdentity(), plan })));
  }
});

test("explicit affected files cannot hide discovered risky source inputs", () => {
  const response = createPlan({
    files: ["docs/example.md"],
    base: "origin/dev",
    head: "HEAD",
    environment: {},
    collectChanges: () => ["docs/example.md", "package.json"],
    createIdentity: () => fixtureSourceIdentity(),
  });
  assert.equal(response.result.broadening.mode, "governed-full");
  assert.deepEqual(response.result.nodes.map((node) => node.command), [["pnpm", "run", "check"]]);
});

test("malformed planner output broadens without propagating unsafe commands", () => {
  const plan = createLocalVerificationPlan({
    changedFiles: ["docs/example.md"],
    sourceIdentity: fixtureSourceIdentity(),
    buildPlan: () => ({ requiresFullStatic: false, commands: [{ command: ["unsafe", "run"] }] }),
  });
  assert.equal(plan.broadening.mode, "governed-full");
  assert.deepEqual(plan.nodes.map((node) => node.command), [["pnpm", "run", "check"]]);
  assert.ok(plan.broadening.reasons.includes("planner-malformed"));
});

test("unapproved planner recipes broaden to the fixed control", () => {
  const plan = createLocalVerificationPlan({
    changedFiles: ["docs/example.md"], sourceIdentity: fixtureSourceIdentity(),
    buildPlan: () => ({
      requiresFullStatic: false,
      reasons: [], surfaces: ["docs"], jsonParseFiles: [], quickFailCommands: [],
      commands: [{ command: ["pnpm", "run", "not-approved"], commandText: "pnpm run not-approved" }],
    }),
  });
  assert.equal(plan.broadening.mode, "governed-full");
  assert.deepEqual(plan.nodes.map((node) => node.command), [["pnpm", "run", "check"]]);
});

test("planner omissions and forged quick-fail recipes cannot suppress governed broadening", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({
    changedFiles: ["package.json"], sourceIdentity,
    buildPlan: () => ({ requiresFullStatic: false, reasons: [], surfaces: [], jsonParseFiles: [], quickFailCommands: [], commands: [] }),
  });
  assert.equal(plan.broadening.mode, "governed-full");

  const forged = createLocalVerificationPlan({
    changedFiles: ["docs/example.md"], sourceIdentity,
    buildPlan: () => ({
      requiresFullStatic: false, reasons: ["docs/example.md: documentation/runbook surface"], surfaces: ["docs"], jsonParseFiles: [],
      quickFailCommands: [{ command: ["pnpm", "run", "not-approved"], commandText: "pnpm run not-approved", reason: "forged" }],
      commands: [{ command: ["pnpm", "run", "check:docs"], commandText: "pnpm run check:docs" }],
    }),
  });
  assert.equal(forged.broadening.mode, "governed-full");
  assert.deepEqual(forged.nodes.map((node) => node.command), [["pnpm", "run", "check"]]);
});

test("a thrown planner becomes the fixed governed control rather than a partial plan", () => {
  const response = createPlan({
    files: ["docs/example.md"], base: "origin/dev", head: "HEAD", environment: {},
    collectChanges: () => ["docs/example.md"],
    createIdentity: () => fixtureSourceIdentity(),
    buildPlan: () => { throw new Error("planner unavailable"); },
  });
  assert.equal(response.result.broadening.mode, "governed-full");
  assert.ok(response.result.broadening.reasons.includes("planner-malformed"));
  assert.deepEqual(response.result.nodes.map((node) => node.command), [["pnpm", "run", "check"]]);
});

test("source identity hashes changed regular files without process or state side effects", () => {
  const reads = [];
  const identity = createCurrentSourceIdentity({
    cwd: "/workspace",
    changedFiles: ["new-file.mjs", "deleted.json"],
    planner: { commands: [["pnpm", "run", "test"]] },
    environment: { node: "22.13.0" },
    readCommit: () => "a".repeat(40),
    lstat: (path) => {
      reads.push(path);
      if (path.endsWith("deleted.json")) {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      }
      return { isSymbolicLink: () => false, isFile: () => true, size: 3 };
    },
    readFile: (path) => Buffer.from(path.endsWith("new-file.mjs") ? "new" : ""),
  });
  assert.match(identity.worktreeFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(reads, ["/workspace/deleted.json", "/workspace/new-file.mjs"]);
});

test("missing bases block planning even when affected files are explicit", () => {
  let identityCalls = 0;
  assert.throws(
    () => createPlan({
      files: ["docs/example.md"],
      base: "missing-base",
      head: "HEAD",
      environment: {},
      collectChanges: () => { throw new Error("bad revision"); },
      createIdentity: () => { identityCalls += 1; },
    }),
    (error) => error instanceof LocalVerificationError && error.code === "source-unavailable",
  );
  assert.equal(identityCalls, 0);

  let stdout = "";
  let stderr = "";
  const status = main(["plan", "--json", "--files", "docs/example.md"], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  }, {
    planFactory: () => createPlan({
      files: ["docs/example.md"], base: "missing-base", head: "HEAD", environment: {},
      collectChanges: () => { throw new Error("bad revision"); },
    }),
  });
  assert.equal(status, 1);
  assert.equal(JSON.parse(stdout).error.code, "source-unavailable");
  assert.match(stderr, /source-unavailable/);
});

test("opt-in plan persistence writes only through the injected durable-state boundary", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  const response = createPlanResponse({ sourceIdentity, plan });
  let stateArguments;
  let writeArguments;
  let stdout = "";
  const status = main(["plan", "--json", "--persist", "--state-root", "/safe/state"], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => {} },
  }, {
    planFactory: () => response,
    stateFactory: (options, context) => {
      stateArguments = { options, context };
      return { root: "/safe/state/local-verification" };
    },
    planWriter: (arguments_) => {
      writeArguments = arguments_;
      return { planId: plan.planId, status: "planned" };
    },
    receiptSelector: () => [],
    superseder: () => [],
    runSuperseder: () => [],
  });
  assert.equal(status, 0);
  assert.deepEqual(stateArguments.options, { stateRoot: "/safe/state" });
  assert.equal(stateArguments.context.repoRoot.replace(/\/$/, ""), process.cwd());
  assert.deepEqual(writeArguments.sourceIdentity, sourceIdentity);
  assert.equal(writeArguments.plan.planId, plan.planId);
  assert.deepEqual(JSON.parse(stdout).state, { planId: plan.planId, status: "planned", reusedNodeIds: [], supersededPlanIds: [] });
});

test("verification nodes retain direct approved argv arrays and never shell text", () => {
  const plan = createLocalVerificationPlan({
    changedFiles: ["docs/workflows/example.md"],
    sourceIdentity: fixtureSourceIdentity(),
  });

  assert.ok(plan.nodes.length > 0);
  const prior = new Set();
  for (const node of plan.nodes) {
    assert.ok(Array.isArray(node.command));
    assert.ok(node.command.length > 0);
    assert.equal(typeof node.commandText, "string");
    assert.equal(node.command.some((part) => /[;&|`$]/.test(part)), false);
    assert.ok(node.dependsOn.every((nodeId) => prior.has(nodeId)));
    assert.equal(node.resourceClass, "default");
    prior.add(node.nodeId);
  }
});

test("response validation rejects a forged arbitrary command before lifecycle use", () => {
  const response = createPlanResponse({
    sourceIdentity: fixtureSourceIdentity(),
    plan: {
      planId: `plan_${"0".repeat(64)}`,
      nodes: [{
        nodeId: `node_${"0".repeat(64)}`,
        command: ["totally-unapproved", "--run-anything"],
        commandText: "totally-unapproved --run-anything",
        resourceClass: "default",
        dependsOn: [],
        rationale: ["forged"],
      }],
      requiresFullStatic: false,
      surfaces: [],
      reasons: [],
      jsonParseFiles: [],
      nextAction: "start",
    },
  });
  assert.throws(() => assertPlanResponse(response), (error) => error instanceof LocalVerificationError && error.code === "invalid-response");
});

test("response validation rejects a syntactically valid but unapproved pnpm recipe", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  plan.nodes[0].command = ["pnpm", "run", "publish-everything"];
  plan.nodes[0].commandText = "pnpm run publish-everything";
  plan.nodes[0].nodeId = `node_${"0".repeat(64)}`;
  plan.planId = `plan_${"0".repeat(64)}`;
  assert.throws(() => assertPlanResponse(createPlanResponse({ sourceIdentity, plan })), (error) => error instanceof LocalVerificationError && error.code === "invalid-response");
});

test("response validation rejects a forged governed mode with focused work", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const focused = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  focused.broadening = { mode: "governed-full", reasons: ["forged"], fallback: "pnpm run check" };
  focused.nextAction = "start-governed-control";
  focused.planId = `plan_${"0".repeat(64)}`;
  assert.throws(() => assertPlanResponse(createPlanResponse({ sourceIdentity, plan: focused })), (error) => error instanceof LocalVerificationError && error.code === "invalid-response");
});

test("malformed commands return stable actionable errors without planner execution", () => {
  assert.throws(
    () => parseLocalVerificationArgs(["unsupported", "--json"]),
    (error) => error instanceof LocalVerificationError && error.code === "unsupported-command",
  );
  assert.throws(
    () => parseLocalVerificationArgs(["plan", "--unknown"]),
    (error) => error instanceof LocalVerificationError && error.code === "invalid-argument",
  );
  assert.deepEqual(parseLocalVerificationArgs(["plan", "--json", "--", "--files", "docs/example.md"]).files, ["docs/example.md"]);

  const response = createErrorResponse({
    command: "plan",
    error: new LocalVerificationError("invalid-argument", "Unknown option: --unknown", "Run plan --help for supported options."),
  });
  assert.deepEqual(response.error, {
    code: "invalid-argument",
    message: "Unknown option: --unknown",
    actionable: "Run plan --help for supported options.",
  });

  let stdout = "";
  const status = main(["unsupported", "--json"], { stdout: { write: (chunk) => { stdout += chunk; } }, stderr: { write() {} } });
  assert.equal(status, 1);
  assert.equal(JSON.parse(stdout).command, "unsupported");
});

test("plan CLI renders exactly one parseable JSON response through its injected plan seam", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({
    changedFiles: ["docs/workflows/example.md"],
    sourceIdentity,
  });
  let stdout = "";
  let stderr = "";
  const status = main(
    ["plan", "--json", "--files", "docs/workflows/example.md"],
    {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    { planFactory: () => createPlanResponse({ sourceIdentity, plan }) },
  );

  assert.equal(status, 0);
  const response = JSON.parse(stdout);
  assert.doesNotThrow(() => assertPlanResponse(response));
  assert.equal(response.result.nextAction, "start");
  assert.equal(stderr, "");
});

test("start returns promptly with one owned worker and duplicate starts reuse the active run", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  const response = createPlanResponse({ sourceIdentity, plan });
  const writes = [];
  let spawned = 0;
  let workerArgs;
  let stdout = "";
  const dependencies = {
    planFactory: () => response,
    stateFactory: () => ({ root: "/safe", plansDir: "/safe/plans", runsDir: "/safe/runs", receiptsDir: "/safe/receipts", maxRecordBytes: 16_384, maxReceipts: 20 }),
    planWriter: () => ({ planId: plan.planId, status: "planned" }),
    receiptSelector: () => [],
    superseder: () => [],
    activeRunReader: () => [],
    startClaim: ({ action }) => action(),
    runWriter: (value) => { writes.push(value); return { runId: value.runId, status: value.status }; },
    spawn: (_command, args) => { workerArgs = args; return { pid: 777, unref: () => { spawned += 1; } }; },
    processIdentity: (pid) => `${pid}:1`,
    now: () => Date.parse("2026-08-21T00:00:00.000Z"),
  };
  assert.equal(main(["start", "--json", "--files", "docs/example.md", "--base", "topic-base", "--head", "topic-head"], { stdout: { write: (chunk) => { stdout += chunk; } }, stderr: { write() {} } }, dependencies), 0);
  const started = JSON.parse(stdout);
  assert.equal(started.status, "running");
  assert.equal(started.result.duplicate, false);
  assert.equal(spawned, 1);
  assert.equal(writes.length, 2);
  assert.ok(workerArgs.includes("--files") && workerArgs.includes("docs/example.md"));
  assert.ok(workerArgs.includes("topic-base") && workerArgs.includes("topic-head"));

  stdout = "";
  dependencies.activeRunReader = () => [{ run_id: "run_existing", plan_id: plan.planId, status: "running", started_at: "2026-08-21T00:00:00.000Z", nodes: plan.nodes.map((node) => ({ node_id: node.nodeId, status: "pending" })), first_failure: null }];
  assert.equal(main(["start", "--json"], { stdout: { write: (chunk) => { stdout += chunk; } }, stderr: { write() {} } }, dependencies), 0);
  assert.equal(JSON.parse(stdout).result.duplicate, true);
  assert.equal(spawned, 1);
});

test("resume relaunches a recoverable run through the same exclusive start boundary", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  const response = createPlanResponse({ sourceIdentity, plan });
  let stdout = "";
  let claims = 0;
  let spawned = 0;
  const unknown = { run_id: "run_unknown", plan_id: plan.planId, status: "unknown", started_at: "2026-08-21T00:00:00.000Z", nodes: plan.nodes.map((node) => ({ node_id: node.nodeId, status: "unknown" })), first_failure: null };
  const status = main(["resume", "--json"], { stdout: { write: (chunk) => { stdout += chunk; } }, stderr: { write() {} } }, {
    planFactory: () => response,
    stateFactory: () => ({ root: "/safe", plansDir: "/safe/plans", runsDir: "/safe/runs", receiptsDir: "/safe/receipts", maxRecordBytes: 16_384, maxReceipts: 20 }),
    runReader: () => [unknown],
    activeRunReader: () => [],
    startClaim: ({ action }) => { claims += 1; return action(); },
    planWriter: () => ({ planId: plan.planId, status: "planned" }), receiptSelector: () => [], superseder: () => [], runSuperseder: () => [],
    runWriter: () => ({}), spawn: () => ({ pid: 778, unref: () => { spawned += 1; } }), processIdentity: (pid) => `${pid}:1`, now: () => Date.parse("2026-08-21T00:00:01.000Z"),
  });
  assert.equal(status, 0);
  assert.equal(claims, 1);
  assert.equal(spawned, 1);
  const responseBody = JSON.parse(stdout);
  assert.equal(responseBody.command, "resume");
  assert.equal(responseBody.result.status, "running");
  assert.equal(responseBody.result.duplicate, false);
});

test("Shadow records an exact-source governed control comparison without promotion authority", () => {
  const sourceIdentity = fixtureSourceIdentity();
  const plan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  const response = createPlanResponse({ sourceIdentity, plan });
  let stdout = "";
  const status = main(["shadow", "--json"], { stdout: { write: (chunk) => { stdout += chunk; } }, stderr: { write() {} } }, {
    planFactory: () => response,
    stateFactory: () => ({ root: "/safe" }),
    runReader: () => [{ status: "passed" }],
    controlRunner: () => ({ status: 0 }),
    shadowWriter: ({ comparison }) => ({ comparisonId: comparison.comparisonId, outcome: comparison.outcome }),
    shadowReader: () => [],
    now: () => Date.parse("2026-08-21T00:00:00.000Z"),
  });
  assert.equal(status, 0);
  const payload = JSON.parse(stdout);
  assert.equal(payload.result.outcome, "matched");
  assert.equal(payload.result.promotion.status, "unavailable");
  assert.equal(payload.result.promotion.fallback, "pnpm run check");
});
