import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkspaceCommand } from "../scripts/lib/workspace-command-resolution.mjs";

test("runs node-loadable pnpm npm_execpath through the current node executable", () => {
  const resolved = resolveWorkspaceCommand("pnpm", ["--version"], {
    env: { npm_execpath: "/opt/corepack/dist/pnpm.js" },
    platform: "linux",
    processExecPath: "/usr/bin/node",
  });

  assert.deepEqual(resolved, {
    command: "/usr/bin/node",
    args: ["/opt/corepack/dist/pnpm.js", "--version"],
  });
});

test("does not run non-JavaScript pnpm shims through node", () => {
  const resolved = resolveWorkspaceCommand("pnpm", ["install"], {
    env: { PATH: "/usr/bin", npm_execpath: "/tmp/mise/shims/pnpm" },
    platform: "linux",
    processExecPath: "/usr/bin/node",
  });

  assert.equal(resolved.command, "pnpm");
  assert.deepEqual(resolved.args, ["install"]);
  assert.equal(resolved.env?.PATH, "/usr/bin");
  assert.equal("npm_execpath" in resolved.env, false);
});

test("does not treat npm npm_execpath as a pnpm entrypoint", () => {
  const resolved = resolveWorkspaceCommand("pnpm", ["install"], {
    env: { PATH: "/usr/bin", npm_execpath: "/usr/lib/node_modules/npm/bin/npm-cli.js" },
    platform: "linux",
    processExecPath: "/usr/bin/node",
  });

  assert.equal(resolved.command, "pnpm");
  assert.deepEqual(resolved.args, ["install"]);
  assert.equal(resolved.env?.PATH, "/usr/bin");
  assert.equal("npm_execpath" in resolved.env, false);
});

test("uses cmd shell pnpm resolution on Windows when npm_execpath is a shim", () => {
  const resolved = resolveWorkspaceCommand("pnpm", ["run", "preflight"], {
    env: {
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      npm_execpath: "C:\\Users\\Bob\\AppData\\Local\\mise\\shims\\pnpm",
    },
    platform: "win32",
    processExecPath: "C:\\Program Files\\nodejs\\node.exe",
  });

  assert.equal(resolved.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(resolved.args, ["/d", "/s", "/c", "pnpm", "run", "preflight"]);
  assert.equal("npm_execpath" in resolved.env, false);
});
