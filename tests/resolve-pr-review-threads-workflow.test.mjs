import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/resolve-pr-review-threads.yml", import.meta.url);

test("review-thread workflow preserves threads for governed resolution", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  assert.match(workflow, /pull-requests: read/);
  assert.doesNotMatch(workflow, /pull-requests:\s*["']?write["']?/);
  assert.doesNotMatch(workflow, /permissions:\s*["']?write-all["']?/);
  assert.match(workflow, /Automatic review-thread resolution is disabled/);
  assert.match(workflow, /governed codex-workspace review-thread gate/);
  assert.doesNotMatch(workflow, /resolveReviewThread/);
  assert.doesNotMatch(workflow, /ci-resolve-review-threads/);
});
