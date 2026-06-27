import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  pipelineCockpitPackets,
  projectGovernedCopiedWorktreeExecutionEvidenceSnapshot,
  type GovernedCopiedWorktreeExecutionEvidenceSnapshotV0,
  type PipelineFixturePacket,
} from "./pipeline-fixtures";

const MAX_EVIDENCE_FILE_BYTES = 256 * 1024;
const MAX_EVIDENCE_FILES = 10;

type LoadEvidenceOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export type PipelineEvidenceLoadResult = {
  packets: PipelineFixturePacket[];
  evidenceFiles: string[];
  warnings: string[];
};

export function pipelinePacketsWithPersistedGovernedWorkerEvidence(options: LoadEvidenceOptions = {}): PipelineFixturePacket[] {
  const loaded = loadPersistedGovernedWorkerEvidencePackets(options);
  return mergePipelinePackets(loaded.packets, pipelineCockpitPackets);
}

export function loadPersistedGovernedWorkerEvidencePackets(options: LoadEvidenceOptions = {}): PipelineEvidenceLoadResult {
  const cwd = resolve(/* turbopackIgnore: true */ options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const evidenceDirResult = resolveEvidenceDir({ cwd, env });
  if (!evidenceDirResult.ok) {
    return { packets: [], evidenceFiles: [], warnings: evidenceDirResult.warnings };
  }
  const evidenceDir = evidenceDirResult.path;
  if (!safeExists(evidenceDir)) {
    return { packets: [], evidenceFiles: [], warnings: [] };
  }
  const dirStats = safeStat(evidenceDir);
  if (!dirStats) {
    return { packets: [], evidenceFiles: [], warnings: ["evidence_path_unreadable"] };
  }
  if (!dirStats.isDirectory()) {
    return { packets: [], evidenceFiles: [], warnings: ["evidence_path_not_directory"] };
  }

  const packets: PipelineFixturePacket[] = [];
  const evidenceFiles: string[] = [];
  const warnings: string[] = [];
  const directoryEntries = safeReadDir(evidenceDir, warnings);
  const files = directoryEntries
    .filter((file) => file.endsWith(".json") && !basename(file).startsWith("."))
    .map((file) => join(/* turbopackIgnore: true */ evidenceDir, file))
    .filter((file) => isSafeEvidenceFile(file, evidenceDir, warnings))
    .sort((left, right) => fileMtimeMs(right) - fileMtimeMs(left))
    .slice(0, MAX_EVIDENCE_FILES);

  for (const file of files) {
    const stats = safeStat(file);
    if (!stats) {
      warnings.push("evidence_file_unreadable");
      continue;
    }
    if (stats.size > MAX_EVIDENCE_FILE_BYTES) {
      warnings.push("evidence_file_too_large");
      continue;
    }
    try {
      const snapshot = JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) as GovernedCopiedWorktreeExecutionEvidenceSnapshotV0;
      const projected = projectGovernedCopiedWorktreeExecutionEvidenceSnapshot(snapshot);
      if (projected.length > 0) {
        packets.push(...projected);
        evidenceFiles.push(file);
      }
    } catch {
      warnings.push("evidence_file_unreadable_or_invalid_json");
    }
  }

  return { packets: dedupePackets(packets), evidenceFiles, warnings };
}

function resolveEvidenceDir({ cwd, env }: { cwd: string; env: Record<string, string | undefined> }): { ok: true; path: string; warnings: string[] } | { ok: false; path: null; warnings: string[] } {
  const defaultDir = resolve(/* turbopackIgnore: true */ cwd, ".kendall-local", "governed-worker-evidence");
  const configuredDir = env.KENDALL_PIPELINE_WORKER_EVIDENCE_DIR;
  const evidenceDir = configuredDir ? resolve(/* turbopackIgnore: true */ configuredDir) : defaultDir;
  const warnings: string[] = [];
  if (configuredDir && !isAbsolute(configuredDir)) {
    warnings.push("evidence_dir_not_absolute");
    return { ok: false, path: null, warnings };
  }
  const tmpRoot = realpathSync("/tmp");
  const realCwd = safeExists(cwd) ? safeRealpath(cwd) ?? cwd : cwd;
  const dashboardRepoRoot = dashboardRepoRootForRuntimeCwd(cwd);
  const dashboardRepoEvidenceDir = dashboardRepoRoot
    ? resolve(/* turbopackIgnore: true */ dashboardRepoRoot, ".kendall-local", "governed-worker-evidence")
    : null;
  const underDefaultRoot = pathIsUnder(defaultDir, evidenceDir);
  const underDashboardRepoRoot = dashboardRepoEvidenceDir ? pathIsUnder(dashboardRepoEvidenceDir, evidenceDir) : false;
  const underTmp = pathIsUnder(tmpRoot, evidenceDir);
  if (!underDefaultRoot && !underDashboardRepoRoot && !underTmp) {
    warnings.push("evidence_dir_outside_safe_roots");
    return { ok: false, path: null, warnings };
  }
  if (safeExists(evidenceDir)) {
    const realEvidenceDir = safeRealpath(evidenceDir);
    if (!realEvidenceDir) {
      warnings.push("evidence_dir_unreadable");
      return { ok: false, path: null, warnings };
    }
    if (underDefaultRoot && !pathIsUnder(realCwd, realEvidenceDir)) {
      warnings.push("evidence_dir_realpath_outside_workspace");
      return { ok: false, path: null, warnings };
    }
    if (underDefaultRoot && resolve(evidenceDir) !== realEvidenceDir) {
      warnings.push("evidence_dir_symlink_rejected");
      return { ok: false, path: null, warnings };
    }
    if (underDashboardRepoRoot) {
      const realDashboardRepoRoot = dashboardRepoRoot && safeExists(dashboardRepoRoot)
        ? safeRealpath(dashboardRepoRoot) ?? dashboardRepoRoot
        : dashboardRepoRoot;
      if (!realDashboardRepoRoot || !pathIsUnder(realDashboardRepoRoot, realEvidenceDir)) {
        warnings.push("evidence_dir_realpath_outside_workspace");
        return { ok: false, path: null, warnings };
      }
      if (resolve(evidenceDir) !== realEvidenceDir) {
        warnings.push("evidence_dir_symlink_rejected");
        return { ok: false, path: null, warnings };
      }
    }
    if (underTmp && !pathIsUnder(tmpRoot, realEvidenceDir)) {
      warnings.push("evidence_dir_realpath_outside_tmp");
      return { ok: false, path: null, warnings };
    }
  }
  return { ok: true, path: evidenceDir, warnings };
}

function dashboardRepoRootForRuntimeCwd(cwd: string): string | null {
  const dashboardDir = resolve(/* turbopackIgnore: true */ cwd);
  if (basename(dashboardDir) !== "dashboard" || basename(dirname(dashboardDir)) !== "apps") {
    return null;
  }
  return resolve(/* turbopackIgnore: true */ dashboardDir, "..", "..");
}

function isSafeEvidenceFile(file: string, evidenceDir: string, warnings: string[]): boolean {
  const resolvedFile = resolve(/* turbopackIgnore: true */ file);
  if (!pathIsUnder(evidenceDir, resolvedFile)) {
    warnings.push("evidence_file_outside_directory");
    return false;
  }
  const realDir = safeRealpath(evidenceDir);
  const realFileParent = safeRealpath(dirname(resolvedFile));
  if (!realDir || !realFileParent) {
    warnings.push("evidence_file_unreadable");
    return false;
  }
  if (!pathIsUnder(realDir, realFileParent)) {
    warnings.push("evidence_file_realpath_outside_directory");
    return false;
  }
  const linkStats = safeLstat(resolvedFile);
  if (!linkStats) {
    warnings.push("evidence_file_unreadable");
    return false;
  }
  if (linkStats.isSymbolicLink()) {
    warnings.push("evidence_file_symlink_rejected");
    return false;
  }
  const stats = safeStat(resolvedFile);
  if (!stats) {
    warnings.push("evidence_file_unreadable");
    return false;
  }
  if (!stats.isFile()) {
    warnings.push("evidence_file_not_regular");
    return false;
  }
  return true;
}

function mergePipelinePackets(primary: PipelineFixturePacket[], fallback: PipelineFixturePacket[]): PipelineFixturePacket[] {
  return dedupePackets([...primary, ...fallback]);
}

function dedupePackets(packets: PipelineFixturePacket[]): PipelineFixturePacket[] {
  const seen = new Set<string>();
  return packets.filter((packet) => {
    if (seen.has(packet.packetId)) {
      return false;
    }
    seen.add(packet.packetId);
    return true;
  });
}

function pathIsUnder(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function fileMtimeMs(pathValue: string): number {
  const stats = safeStat(pathValue);
  return typeof stats?.mtimeMs === "number" ? stats.mtimeMs : 0;
}

function safeExists(pathValue: string): boolean {
  try {
    return existsSync(/* turbopackIgnore: true */ pathValue);
  } catch {
    return false;
  }
}

function safeReadDir(pathValue: string, warnings: string[]): string[] {
  try {
    return readdirSync(/* turbopackIgnore: true */ pathValue);
  } catch {
    warnings.push("evidence_path_unreadable");
    return [];
  }
}

function safeRealpath(pathValue: string): string | null {
  try {
    return realpathSync(/* turbopackIgnore: true */ pathValue);
  } catch {
    return null;
  }
}

function safeLstat(pathValue: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(/* turbopackIgnore: true */ pathValue);
  } catch {
    return null;
  }
}

function safeStat(pathValue: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(/* turbopackIgnore: true */ pathValue);
  } catch {
    return null;
  }
}
