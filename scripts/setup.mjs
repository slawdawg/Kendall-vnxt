import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function resolveCommand(command) {
  if (command === "pnpm" && process.env.npm_execpath) {
    return process.execPath;
  }

  if (process.platform === "win32" && command === "pnpm") {
    return "pnpm.cmd";
  }

  return command;
}

function resolveArgs(command, args) {
  if (command === "pnpm" && process.env.npm_execpath) {
    return [process.env.npm_execpath, ...args];
  }

  return args;
}

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
  const result = spawnSync(resolveCommand(step.command), resolveArgs(step.command, step.args), {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nSetup complete.");
