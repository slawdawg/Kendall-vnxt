import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const commands = [
  {
    label: "Install pnpm workspace dependencies",
    command: "pnpm",
    args: ["install"],
  },
  {
    label: "Sync supervisor virtualenv",
    command: "uv",
    args: ["sync", "--directory", "services/supervisor"],
  },
  {
    label: "Validate local workspace",
    command: "node",
    args: ["./scripts/preflight.mjs"],
  },
];

for (const step of commands) {
  console.log(`\n==> ${step.label}`);
  const resolved = resolveWorkspaceCommand(step.command, step.args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: rootDir,
    env: resolved.env ?? process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nSetup complete.");
