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
