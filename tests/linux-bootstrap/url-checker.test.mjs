import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = process.cwd();

test("bootstrap URL checker fails closed for unreachable URL", () => {
  const result = spawnSync(
    "node",
    ["scripts/check-linux-bootstrap-url.mjs", "https://127.0.0.1:9/not-found.sh"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
      timeout: 20000,
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bootstrap URL is not reachable/);
});
