import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { findManagerTmuxControlViolations } from "../scripts/lib/manager-control-plane/tmux-cwd-rebind-contract.mjs";

const corePath = "scripts/lib/manager-control-plane/core.mjs";

test("manager tmux policy permits only the validated managed-CWD rebind", async () => {
  const core = await readFile(corePath, "utf8");
  assert.deepEqual(findManagerTmuxControlViolations(core), []);
});

test("manager tmux policy blocks arbitrary or destructive tmux controls", async () => {
  const core = await readFile(corePath, "utf8");
  for (const control of ["kill-pane", "source-file"]) {
    const violations = findManagerTmuxControlViolations(`${core}\nrunner("tmux", ["${control}", "-t", target]);`);
    assert.equal(violations.includes(`Manager core must not expose tmux ${control}`), true, control);
  }

  const arbitraryRespawn = findManagerTmuxControlViolations(`${core}\nrunner("tmux", ["respawn-pane", "-t", target]);`);
  assert.equal(arbitraryRespawn.includes("Manager core may use respawn-pane only once for the validated managed worker CWD rebind before an allowed pre-write handoff"), true);
});
