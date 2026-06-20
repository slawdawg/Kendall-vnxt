import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("exposes canonical public Linux command surface", () => {
  assert.equal(packageJson.scripts["linux:doctor"], "node ./scripts/linux-bootstrap.mjs --doctor");
  assert.equal(packageJson.scripts["linux:setup"], "node ./scripts/linux-bootstrap.mjs --plan");
  assert.equal(packageJson.scripts["linux:smoke"], "node ./scripts/check-linux-bootstrap.mjs");
  assert.equal(packageJson.scripts["linux:drift"], "node ./scripts/check-linux-install-contract.mjs");
});

test("install contract checker validation fails when a canonical Linux script is missing", async () => {
  const { validatePublicLinuxScripts } = await import("../../scripts/check-linux-install-contract.mjs");
  const modified = {
    ...packageJson,
    scripts: { ...packageJson.scripts },
  };
  delete modified.scripts["linux:doctor"];

  assert(validatePublicLinuxScripts(modified).some((failure) => failure.includes("scripts.linux:doctor")));
});

test("install contract checker rejects alternate mutating install commands in active docs", async () => {
  const { validateSingleMutatingInstallBoundary } = await import("../../scripts/check-linux-install-contract.mjs");

  const failures = validateSingleMutatingInstallBoundary(
    new Map([
      [
        "docs/linux-install/install-playbook.md",
        [
          "There is only one supported v1 install method:",
          "scripts/bootstrap-linux.sh --install-kendall-vnxt",
          "Historical notes are not the generic installer entry point and must not override the single-method v1 boundary.",
          "The Node controller can mutate with node ./scripts/linux-bootstrap.mjs --apply.",
        ].join("\n"),
      ],
    ]),
  );

  assert(failures.some((failure) => failure.includes("alternate mutating install command")));
});

test("install contract checker requires historical notes to stay fenced by source-owned release boundary", async () => {
  const { validateSingleMutatingInstallBoundary } = await import("../../scripts/check-linux-install-contract.mjs");

  const failures = validateSingleMutatingInstallBoundary(
    new Map([
      [
        "docs/linux-install/index.md",
        [
          "scripts/bootstrap-linux.sh --install-kendall-vnxt",
          "Historical remote approval template is available.",
        ].join("\n"),
      ],
    ]),
  );

  assert(failures.some((failure) => failure.includes("source-owned release boundary")));
});
