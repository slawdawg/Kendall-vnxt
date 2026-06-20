import { basename } from "node:path";

function isPnpmNodeEntrypoint(path) {
  const entrypoint = basename(path || "").toLowerCase();
  return /^pnpm(?:[-.]cli)?\.[cm]?js$/.test(entrypoint);
}

function withoutNpmExecPath(env) {
  const { npm_execpath: _npmExecPath, ...rest } = env;
  return rest;
}

export function resolveWorkspaceCommand(command, commandArgs = [], options = {}) {
  const {
    env = process.env,
    processExecPath = process.execPath,
  } = options;

  if (command === "pnpm") {
    const npmExecPath = env.npm_execpath || "";
    if (isPnpmNodeEntrypoint(npmExecPath)) {
      return {
        command: processExecPath,
        args: [npmExecPath, ...commandArgs],
      };
    }

    if (npmExecPath) {
      return {
        command,
        args: commandArgs,
        env: withoutNpmExecPath(env),
      };
    }
  }

  return { command, args: commandArgs };
}
