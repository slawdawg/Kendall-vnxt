import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CURRENT_THREAD_RESOLUTION_PREREQUISITES,
  hasCurrentThreadResolutionPrerequisites,
} from "../scripts/lib/runbook-review-thread-policy.mjs";

const runbook = readFileSync(new URL("../docs/workflows/end-to-end-lane-runner.md", import.meta.url), "utf8");

test("current-thread resolution policy requires every positive prerequisite", () => {
  assert.equal(hasCurrentThreadResolutionPrerequisites(runbook), true);

  for (const prerequisite of CURRENT_THREAD_RESOLUTION_PREREQUISITES) {
    assert.equal(
      hasCurrentThreadResolutionPrerequisites(runbook.replace(prerequisite, "")),
      false,
      `omitting ${JSON.stringify(prerequisite)} must fail the runbook policy check`,
    );
  }
});
