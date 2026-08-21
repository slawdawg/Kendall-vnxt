import { lstatSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFile } from "../../check-plan.mjs";

import {
  LocalVerificationError,
  SOURCE_IDENTITY_SCHEMA_VERSION,
  digest,
} from "./contracts.mjs";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new LocalVerificationError("source-unavailable", `${label} is unavailable.`, "Ensure the command runs inside a readable Git worktree.");
  }
  return value;
}

export function createSourceIdentity({ commit, worktree, planner, environment, surfaceFingerprints = {} }) {
  const normalizedCommit = requireText(commit, "Git commit");
  return {
    schemaVersion: SOURCE_IDENTITY_SCHEMA_VERSION,
    commit: normalizedCommit,
    worktreeFingerprint: digest(worktree || {}),
    plannerDigest: digest(planner || {}),
    commandDigest: digest({
      quickFailCommands: planner?.quickFailCommands || [],
      commands: planner?.commands || [],
      jsonParseFiles: planner?.jsonParseFiles || [],
    }),
    environmentDigest: digest(environment || {}),
    surfaceFingerprints,
  };
}

function gitDirectory(cwd, { readFile = readFileSync, stat = statSync } = {}) {
  const dotGit = resolve(cwd, ".git");
  try {
    if (stat(dotGit).isDirectory()) return dotGit;
    const match = /^gitdir:\s*(.+)\s*$/m.exec(readFile(dotGit, "utf8"));
    if (match) return resolve(cwd, match[1]);
  } catch {
    // Report all metadata failures with the public, actionable error below.
  }
  throw new LocalVerificationError("source-unavailable", "Git metadata is unavailable.", "Ensure the command runs inside a readable Git worktree.");
}

function commonGitDirectory(gitDir, { readFile = readFileSync } = {}) {
  try {
    const common = readFile(resolve(gitDir, "commondir"), "utf8").trim();
    return common ? resolve(gitDir, common) : gitDir;
  } catch {
    return gitDir;
  }
}

function readCurrentCommit(cwd, { readFile = readFileSync, stat = statSync } = {}) {
  const gitDir = gitDirectory(cwd, { readFile, stat });
  const head = requireText(readFile(resolve(gitDir, "HEAD"), "utf8").trim(), "Git HEAD");
  if (/^[a-f0-9]{40,64}$/i.test(head)) return head;
  const refMatch = /^ref:\s+(.+)$/.exec(head);
  if (!refMatch) throw new LocalVerificationError("source-unavailable", "Git HEAD has an unsupported format.", "Repair Git metadata, then retry local verification.");
  const ref = refMatch[1];
  if (!ref.startsWith("refs/") || ref.includes("..") || isAbsolute(ref)) throw new LocalVerificationError("source-unavailable", "Git HEAD references an unsafe ref.", "Repair Git metadata, then retry local verification.");
  const bases = [...new Set([gitDir, commonGitDirectory(gitDir, { readFile })])];
  for (const base of bases) {
    try {
      const value = readFile(resolve(base, ref), "utf8").trim();
      if (/^[a-f0-9]{40,64}$/i.test(value)) return value;
    } catch {
      // Packed refs are checked below.
    }
  }
  for (const base of bases) {
    try {
      const packed = readFile(resolve(base, "packed-refs"), "utf8");
      const entry = packed.split(/\r?\n/).find((line) => line.endsWith(` ${ref}`));
      if (entry && /^[a-f0-9]{40,64}\s/.test(entry)) return entry.split(/\s+/, 1)[0];
    } catch {
      // Try the remaining metadata locations before failing closed.
    }
  }
  throw new LocalVerificationError("source-unavailable", "Git HEAD cannot be resolved to a commit.", "Repair Git metadata, then retry local verification.");
}

function collectChangedContent(changedFiles, { cwd, readFile = readFileSync, lstat = lstatSync, readlink = readlinkSync }) {
  return [...new Set(changedFiles)].sort().map((path) => {
    const absolute = resolve(cwd, path);
    const normalized = relative(cwd, absolute).replaceAll("\\", "/");
    if (!normalized || normalized === ".." || normalized.startsWith("../") || isAbsolute(path)) {
      throw new LocalVerificationError("source-unavailable", `Changed path escapes the worktree: ${path}`, "Remove the unsafe path and retry local verification.");
    }
    try {
      const entry = lstat(absolute);
      if (entry.isSymbolicLink()) return { path: normalized, type: "symlink", content: readlink(absolute) };
      if (!entry.isFile()) throw new LocalVerificationError("source-unavailable", `Changed path is not a regular file: ${normalized}`, "Remove special files from the worktree and retry local verification.");
      if (entry.size > MAX_SOURCE_FILE_BYTES) throw new LocalVerificationError("source-unavailable", `Changed file exceeds the ${MAX_SOURCE_FILE_BYTES}-byte identity limit: ${normalized}`, "Split or remove the large changed file before local verification.");
      return { path: normalized, type: "file", content: readFile(absolute) };
    } catch (error) {
      if (error?.code === "ENOENT") return { path: normalized, type: "deleted" };
      throw error;
    }
  });
}

export function createCurrentSourceIdentity({
  planner,
  environment,
  cwd = rootDir,
  changedFiles = [],
  readFile = readFileSync,
  lstat = lstatSync,
  readlink = readlinkSync,
  readCommit = readCurrentCommit,
} = {}) {
  if (!Array.isArray(changedFiles)) throw new LocalVerificationError("source-unavailable", "Changed source paths are unavailable.", "Regenerate the local verification plan.");
  try {
    const entries = collectChangedContent(changedFiles, { cwd, readFile, lstat, readlink });
    const bySurface = new Map();
    for (const entry of entries) {
      const surfaces = classifyFile(entry.path).surfaces;
      // Unknown input can only reach a governed-full plan, but retain an
      // explicit scope so no future policy relaxation can reuse it by error.
      for (const surface of surfaces.length ? surfaces : ["unknown"]) {
        const values = bySurface.get(surface) || [];
        values.push(entry);
        bySurface.set(surface, values);
      }
    }
    const surfaceFingerprints = Object.fromEntries([...bySurface.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([surface, values]) => [surface, digest(values)]));
    const worktree = { changedFiles: entries };
    return createSourceIdentity({ commit: readCommit(cwd, { readFile }), worktree, planner, environment, surfaceFingerprints });
  } catch (error) {
    if (error instanceof LocalVerificationError) throw error;
    throw new LocalVerificationError("source-unavailable", "Could not read the local source identity.", "Ensure changed files and Git metadata are readable, then retry.");
  }
}
