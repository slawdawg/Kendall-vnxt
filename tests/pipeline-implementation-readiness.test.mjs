import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const {
  PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE,
  REQUIRED_PIPELINE_READINESS_CATEGORY_IDS,
  evaluatePipelineImplementationReadiness,
} = await import("../scripts/pipeline-implementation-readiness.mjs");

test("pipeline implementation readiness evidence covers every required category", async () => {
  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE,
  });

  assert.deepEqual(result.driftFailures, []);
  assert.deepEqual(
    REQUIRED_PIPELINE_READINESS_CATEGORY_IDS.filter((categoryId) => !result.categoryIds.includes(categoryId)),
    [],
    "all required readiness categories should be present"
  );
  assert.equal(result.executionAuthorityApproved, false, "readiness evidence must not approve execution authority");
  assert.equal(result.driftStatus, "PASS", "the evidence catalog itself should be internally consistent");
  assert.equal(result.readinessStatus, "NOT_READY", "implementation readiness should remain blocked by the live-enforcement follow-up");
  assert.ok(
    result.evidenceItems.some(
      (item) =>
        item.id === "ui.refined-pipeline-cockpit" &&
        item.status === "satisfied" &&
        Array.isArray(item.visualProofs) &&
        item.visualProofs.includes("test-results/pipeline-refined-1440.png") &&
        item.browserProofCommand === "pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep \"opens fixture-backed pipeline cockpit without live execution framing\""
    ),
    "refined UI readiness should be satisfied only with screenshot/browser proof metadata"
  );
  assert.equal(
    result.unresolvedItems.some((item) => item.id === "ui.refined-pipeline-cockpit"),
    false,
    "refined UI readiness should no longer be unresolved after Story 6.1"
  );
  assert.ok(
    result.unresolvedItems.some(
      (item) =>
        item.id === "epic5.runtime-enforcement-boundary" &&
        item.authorityFamily === "memory-writeback-and-source-mutation" &&
        item.followUpStory === "future-operator-approved-canonical-writeback-authority-story"
    ),
    "runtime enforcement readiness should report its authority family and follow-up"
  );
  const runtimeEvidence = result.evidenceItems.find((item) => item.id === "epic5.runtime-enforcement-boundary");
  assert.ok(runtimeEvidence.requiredCommands.includes("pnpm run test:live-memory-source-enforcement"));
  assert.ok(runtimeEvidence.requiredCommands.includes("pnpm run test:bounded-live-memory-source"));
  assert.ok(runtimeEvidence.sourceFiles.includes("docs/workflows/live-memory-source-enforcement.md"));
  assert.ok(runtimeEvidence.sourceFiles.includes("scripts/lib/live-memory-source-enforcement.mjs"));
  assert.ok(runtimeEvidence.sourceFiles.includes("scripts/lib/bounded-live-memory-source-integration.mjs"));
  assert.ok(runtimeEvidence.sourceFiles.includes("tests/live-memory-source-enforcement.test.mjs"));
  assert.ok(runtimeEvidence.sourceFiles.includes("tests/bounded-live-memory-source-integration.test.mjs"));
  assert.ok(
    runtimeEvidence.requiredTokens.some(
      (tokenCheck) =>
        tokenCheck.file === "docs/workflows/live-memory-source-enforcement.md" &&
        tokenCheck.tokens.includes("memory-writeback-and-source-mutation") &&
        tokenCheck.tokens.includes("direct canonical Obsidian mutation is forbidden")
    ),
    "runtime evidence should require source-owned policy tokens"
  );
  assert.ok(
    runtimeEvidence.requiredTokens.some(
      (tokenCheck) =>
        tokenCheck.file === "scripts/lib/bounded-live-memory-source-integration.mjs" &&
        tokenCheck.tokens.includes("createDryRunMemorySourceWritePlan") &&
        tokenCheck.tokens.includes("inspectApprovedMemorySource")
    ),
    "runtime evidence should require bounded live integration tokens"
  );
  assert.equal(result.summary.blockers, 0, "current evidence catalog should not leave blocker-class gaps unowned");
  assert.ok(result.summary.risks >= 1, "runtime enforcement should remain visible as a risk until live integration work exists");
  assert.equal(result.summary.decisions, 0, "refined UI readiness should be resolved by Story 6.1 proof evidence");
});

test("pipeline implementation readiness fails closed for missing visual density source-boundary and no-live-call evidence", async () => {
  const expectedFailures = new Map([
    [
      "accessibility-density",
      {
        ownerEpic: "epic-2",
        ownerStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
        failureClass: "blocker",
      },
    ],
    [
      "source-memory-boundaries",
      {
        ownerEpic: "epic-5",
        ownerStory: "5-2-preserve-source-obsidian-and-llm-wiki-boundaries",
        failureClass: "blocker",
      },
    ],
    [
      "no-live-call-boundary",
      {
        ownerEpic: "epic-2",
        ownerStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
        failureClass: "blocker",
      },
    ],
  ]);
  const requiredFailureCategories = new Set(expectedFailures.keys());
  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.filter((item) => !requiredFailureCategories.has(item.categoryId)),
  });

  for (const categoryId of requiredFailureCategories) {
    const failure = result.driftFailures.find((candidate) => candidate.categoryId === categoryId);
    const expected = expectedFailures.get(categoryId);
    assert.ok(failure, `${categoryId} should fail when missing`);
    assert.equal(failure.kind, "missing_category");
    assert.match(failure.message, /missing required pipeline implementation readiness evidence/i);
    assert.equal(failure.ownerEpic, expected.ownerEpic);
    assert.equal(failure.ownerStory, expected.ownerStory);
    assert.equal(failure.failureClass, expected.failureClass);
  }
});

test("pipeline implementation readiness rejects satisfied refined UI evidence without proof metadata", async () => {
  const corruptedEvidence = PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.map((item) =>
    item.id === "ui.refined-pipeline-cockpit"
      ? {
          ...item,
          visualProofs: [],
          browserProofCommand: "",
          proofSummary: "",
        }
      : item
  );

  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: corruptedEvidence,
  });

  assert.ok(
    result.driftFailures.some(
      (failure) =>
        failure.itemId === "ui.refined-pipeline-cockpit" &&
        failure.kind === "missing_refined_ui_proof" &&
        failure.message.includes("visualProofs")
    ),
    "refined UI satisfied evidence should keep screenshot proof metadata"
  );
});

test("pipeline implementation readiness rejects evidence items without token checks", async () => {
  const corruptedEvidence = PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.map((item) =>
    item.id === "epic2.accessibility-density"
      ? {
          ...item,
          requiredTokens: [],
        }
      : item
  );

  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: corruptedEvidence,
  });

  assert.ok(
    result.driftFailures.some(
      (failure) =>
        failure.itemId === "epic2.accessibility-density" &&
        failure.kind === "invalid_item" &&
        failure.message.includes("requiredTokens")
    ),
    "evidence items should not pass without token-level drift checks"
  );
});

test("pipeline implementation readiness rejects blocker-class evidence that is not satisfied", async () => {
  const corruptedEvidence = PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.map((item) =>
    item.id === "epic2.accessibility-density"
      ? {
          ...item,
          status: "decision_needed",
          followUpStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
        }
      : item
  );

  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: corruptedEvidence,
  });

  assert.ok(
    result.driftFailures.some(
      (failure) =>
        failure.itemId === "epic2.accessibility-density" &&
        failure.kind === "unresolved_blocker" &&
        failure.failureClass === "blocker"
    ),
    "blocker-class evidence should not pass drift checks when unresolved"
  );
  assert.equal(result.driftStatus, "FAIL");
  assert.equal(result.readinessStatus, "DRIFT_FAIL");
});

test("pipeline implementation readiness requires meta report evidence", async () => {
  const reportCategories = new Set(["verification-readiness-report", "authority-readiness-report"]);
  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.filter((item) => !reportCategories.has(item.categoryId)),
  });

  for (const categoryId of reportCategories) {
    const failure = result.driftFailures.find((candidate) => candidate.categoryId === categoryId);
    assert.ok(failure, `${categoryId} should fail when missing`);
    assert.equal(failure.kind, "missing_category");
    assert.equal(failure.ownerEpic, "meta");
    assert.equal(failure.failureClass, "risk");
  }
});

test("pipeline implementation readiness keeps refined UI and runtime enforcement statuses explicit", async () => {
  const corruptedEvidence = PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.map((item) => {
    if (item.id === "ui.refined-pipeline-cockpit") {
      return {
        ...item,
        status: "decision_needed",
        followUpStory: "6-1-refine-pipeline-cockpit-ui",
      };
    }
    if (item.id === "epic5.runtime-enforcement-boundary") {
      return {
        ...item,
        status: "satisfied",
        followUpStory: "",
        authorityFamily: "",
        operatorApprovalPath: "",
        stopLines: [],
        verificationEvidence: [],
      };
    }
    return item;
  });

  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: corruptedEvidence,
  });

  assert.ok(
    result.driftFailures.some(
      (failure) => failure.itemId === "ui.refined-pipeline-cockpit" && failure.kind === "invalid_refined_ui_status"
    ),
    "refined UI readiness should be satisfied after the UI story is complete"
  );
  assert.ok(
    result.driftFailures.some(
      (failure) => failure.itemId === "epic5.runtime-enforcement-boundary" && failure.kind === "invalid_runtime_enforcement_status"
    ),
    "runtime enforcement should remain future-blocked until live-integration authority exists"
  );
  assert.ok(
    result.driftFailures.some(
      (failure) =>
        failure.itemId === "epic5.runtime-enforcement-boundary" &&
        failure.kind === "missing_future_authority_metadata" &&
        failure.message.includes("authorityFamily")
    ),
    "runtime enforcement should keep authority metadata even if status is spoofed"
  );
});

test("pipeline implementation readiness rejects future enforcement without authority metadata", async () => {
  const corruptedEvidence = PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE.map((item) =>
    item.id === "epic5.runtime-enforcement-boundary"
      ? {
          ...item,
          authorityFamily: "",
          followUpStory: "",
          operatorApprovalPath: "",
          stopLines: [],
          verificationEvidence: [],
        }
      : item
  );

  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: corruptedEvidence,
  });

  for (const field of ["followUpStory", "authorityFamily", "stopLines", "verificationEvidence", "operatorApprovalPath"]) {
    assert.ok(
      result.driftFailures.some((failure) => failure.itemId === "epic5.runtime-enforcement-boundary" && failure.message.includes(field)),
      `future enforcement evidence should require ${field}`
    );
  }
});

test("pipeline implementation readiness treats verification and authority reports as evidence not approval", async () => {
  const result = await evaluatePipelineImplementationReadiness({
    rootDir,
    evidenceItems: PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE,
  });
  const reportEvidence = result.evidenceItems.filter((item) =>
    item.id === "meta.verification-readiness-report" || item.id === "meta.authority-readiness-report"
  );

  assert.equal(reportEvidence.length, 2);
  assert.ok(reportEvidence.every((item) => item.executionAuthorityApproved === false));
  assert.equal(result.executionAuthorityApproved, false);

  const authorityScript = await readFile(join(rootDir, "scripts/check-authority-readiness-matrix-report.mjs"), "utf8");
  assert.match(authorityScript, /Authority readiness matrix entries are not execution-authority approvals\./);
});

test("package scripts wire the pipeline implementation readiness check into static and full checks", async () => {
  const packageJson = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));

  assert.equal(
    packageJson.scripts["check:pipeline-implementation-readiness"],
    "node ./scripts/check-pipeline-implementation-readiness.mjs"
  );
  assert.equal(
    packageJson.scripts["test:pipeline-implementation-readiness"],
    "node --test tests/pipeline-implementation-readiness.test.mjs"
  );
  assert.equal(
    packageJson.scripts["test:live-memory-source-enforcement"],
    "node --test tests/live-memory-source-enforcement.test.mjs"
  );
  assert.equal(
    packageJson.scripts["test:bounded-live-memory-source"],
    "node --test tests/bounded-live-memory-source-integration.test.mjs"
  );
  assert.match(packageJson.scripts["check:static"], /pnpm run check:pipeline-implementation-readiness/);
  assert.match(packageJson.scripts["check:static"], /pnpm run test:pipeline-implementation-readiness/);
  assert.match(packageJson.scripts["check:static"], /pnpm run test:live-memory-source-enforcement/);
  assert.match(packageJson.scripts["check:static"], /pnpm run test:bounded-live-memory-source/);
  assert.match(packageJson.scripts.check, /pnpm run check:pipeline-implementation-readiness/);
  assert.match(packageJson.scripts.check, /pnpm run test:pipeline-implementation-readiness/);
  assert.match(packageJson.scripts.check, /pnpm run test:live-memory-source-enforcement/);
  assert.match(packageJson.scripts.check, /pnpm run test:bounded-live-memory-source/);
});
