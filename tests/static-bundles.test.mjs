import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { STATIC_BUNDLES, commandsForBundle, staticBundleNames } from "../scripts/run-static-bundle.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const rootDir = fileURLToPath(new URL("..", import.meta.url));

function aggregateStaticCommands() {
  return packageJson.scripts["check:static"]
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean)
    .map((command) => {
      assert.match(command, /^pnpm run /, `Unexpected static command shape: ${command}`);
      return command.slice("pnpm run ".length);
    });
}

test("static bundles have package script entry points", () => {
  assert.deepEqual(staticBundleNames(), [
    "core",
    "manager",
    "workspace",
    "policy",
    "pipeline-dashboard",
    "anti-churn",
  ]);

  for (const bundleName of staticBundleNames()) {
    assert.equal(
      packageJson.scripts[`check:static-${bundleName}`],
      `node ./scripts/run-static-bundle.mjs ${bundleName}`,
    );
  }

  assert.equal(packageJson.scripts["check:static-bundles"], "node ./scripts/run-static-bundle.mjs all");
});

test("static bundle coverage matches the monolithic static aggregate", () => {
  const aggregateCommands = aggregateStaticCommands();
  const bundleCommands = staticBundleNames().flatMap((bundleName) => STATIC_BUNDLES[bundleName]);

  assert.deepEqual(
    new Set(bundleCommands).size,
    bundleCommands.length,
    "A static command should belong to only one bundle",
  );

  assert.deepEqual(
    bundleCommands.sort(),
    [...aggregateCommands].sort(),
  );
});

test("all static bundle expands bundles in declared order", () => {
  assert.deepEqual(
    commandsForBundle("all"),
    staticBundleNames().flatMap((bundleName) => STATIC_BUNDLES[bundleName]),
  );
});

test("unknown static bundle fails before running commands", () => {
  assert.throws(() => commandsForBundle("unknown"), /Unknown static bundle "unknown"/);
});

test("static bundle CLI executes entry guard for package scripts", () => {
  const result = spawnSync(process.execPath, ["scripts/run-static-bundle.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: node \.\/scripts\/run-static-bundle\.mjs/);
});
