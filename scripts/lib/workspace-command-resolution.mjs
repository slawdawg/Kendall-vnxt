import { existsSync } from "node:fs";
import { basename, join } from "node:path";

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
    platform = process.platform,
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

    if (platform === "win32") {
      return {
        command: env.ComSpec || "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm", ...commandArgs],
        env: npmExecPath ? withoutNpmExecPath(env) : undefined,
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

  if (command === "uv" && platform === "win32") {
    for (const candidate of [
      env.UV_EXE,
      join(env.USERPROFILE ?? "", ".local", "bin", "uv.exe"),
      join(env.USERPROFILE ?? "", ".cargo", "bin", "uv.exe"),
    ]) {
      if (candidate && existsSync(candidate)) {
        return { command: candidate, args: commandArgs };
      }
    }
  }

  return { command, args: commandArgs };
}
