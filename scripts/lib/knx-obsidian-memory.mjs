import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export const STATUS_PASS = "PASS";
export const STATUS_CONCERNS = "CONCERNS";
export const STATUS_FAIL = "FAIL";

export const DEFAULT_ALLOWED_READ_FOLDERS = [
  "00 Inbox",
  "02 Customers",
  "03 Contacts",
  "04 Projects",
  "05 Decisions",
  "06 Research",
  "07 Operating Manual",
  "08 Lessons",
];

export const DEFAULT_EXCLUDED_FOLDERS = [
  "01 Dashboard Queue",
  "09 Archive",
  "Private",
  "Personal",
  "Journal",
];

export const DEFAULT_CONFIG = {
  module_name: "Kendall Obsidian Memory",
  module_code: "kom",
  profile: "local-folder",
  vault_display_name: "Synthetic Kendall Memory",
  proposal_queue_folder: "01 Dashboard Queue",
  allowed_read_folders: DEFAULT_ALLOWED_READ_FOLDERS,
  excluded_folders: DEFAULT_EXCLUDED_FOLDERS,
  backup_retention: {
    daily: 14,
    weekly: 8,
    monthly: 6,
  },
};

const VALID_PROFILES = new Set(["obsidian-sync-headless", "local-folder"]);

export function createDefaultConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    allowed_read_folders: overrides.allowed_read_folders ?? [...DEFAULT_ALLOWED_READ_FOLDERS],
    excluded_folders: overrides.excluded_folders ?? [...DEFAULT_EXCLUDED_FOLDERS],
    backup_retention: {
      ...DEFAULT_CONFIG.backup_retention,
      ...(overrides.backup_retention ?? {}),
    },
  };
}

export function statusFromFindings(findings) {
  if (findings.some((finding) => finding.severity === "fail")) {
    return STATUS_FAIL;
  }
  if (findings.some((finding) => finding.severity === "concern")) {
    return STATUS_CONCERNS;
  }
  return STATUS_PASS;
}

export function resolveProjectToken(value, projectRoot = process.cwd()) {
  if (typeof value !== "string") {
    return value;
  }
  if (value === "{project-root}") {
    return projectRoot;
  }
  if (value.startsWith("{project-root}/")) {
    return join(projectRoot, value.slice("{project-root}/".length));
  }
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim() !== "") : [];
}

function isSafeVaultFolder(folder) {
  const normalized = normalize(folder);
  return !isAbsolute(folder) && normalized !== ".." && !normalized.startsWith(`..${sep}`) && !normalized.split(sep).includes("..");
}

function isPathInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && rel !== ".." && !isAbsolute(rel));
}

function firstLineTitle(markdown, fallback) {
  const heading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "memory-proposal";
}

function safeIdComponent(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("MemoryProposal id must contain only letters, numbers, underscores, and hyphens.");
  }
  return value;
}

function timestampId(prefix, date = new Date()) {
  return `${prefix}-${date.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
}

function vaultFolderPath(vaultRoot, folder) {
  return resolve(vaultRoot, normalize(folder));
}

export function validateConfig(config, options = {}) {
  const projectRoot = options.projectRoot ?? process.cwd();
  const resolvedVaultRoot = resolve(resolveProjectToken(config.vault_root, projectRoot) ?? "");
  const resolvedBackupRoot = resolve(resolveProjectToken(config.backup_root, projectRoot) ?? "");
  const proposalQueueFolder = config.proposal_queue_folder ?? DEFAULT_CONFIG.proposal_queue_folder;
  const allowedReadFolders = asArray(config.allowed_read_folders);
  const excludedFolders = asArray(config.excluded_folders);
  const proposalQueuePath = vaultFolderPath(resolvedVaultRoot, proposalQueueFolder);
  const allowedReadFolderPaths = allowedReadFolders.map((folder) => vaultFolderPath(resolvedVaultRoot, folder));
  const excludedFolderPaths = excludedFolders.map((folder) => vaultFolderPath(resolvedVaultRoot, folder));
  const findings = [];

  if (!VALID_PROFILES.has(config.profile)) {
    findings.push({
      severity: "fail",
      code: "invalid-profile",
      message: `profile must be one of ${[...VALID_PROFILES].join(", ")}`,
    });
  }

  if (allowedReadFolders.length === 0) {
    findings.push({
      severity: "fail",
      code: "missing-allowlist",
      message: "allowed_read_folders must include at least one folder",
    });
  }

  for (const folder of [...allowedReadFolders, ...excludedFolders, proposalQueueFolder]) {
    if (!isSafeVaultFolder(folder)) {
      findings.push({
        severity: "fail",
        code: "unsafe-vault-folder",
        message: `${folder} must be a relative vault folder without traversal`,
      });
    }
  }

  for (const [index, folder] of excludedFolders.entries()) {
    if (allowedReadFolderPaths.includes(excludedFolderPaths[index])) {
      findings.push({
        severity: "fail",
        code: "folder-in-allowlist-and-exclusions",
        message: `${folder} cannot be both allowed and excluded`,
      });
    }
  }

  if (allowedReadFolderPaths.includes(proposalQueuePath)) {
    findings.push({
      severity: "fail",
      code: "queue-folder-readable",
      message: `${proposalQueueFolder} must not be in allowed_read_folders`,
    });
  }

  if (!excludedFolderPaths.includes(proposalQueuePath)) {
    findings.push({
      severity: "concern",
      code: "queue-folder-not-excluded",
      message: `${proposalQueueFolder} should be listed in excluded_folders`,
    });
  }

  if (!existsSync(resolvedVaultRoot)) {
    findings.push({
      severity: "concern",
      code: "vault-root-missing",
      message: `vault_root does not exist: ${resolvedVaultRoot}`,
    });
  } else if (!statSync(resolvedVaultRoot).isDirectory()) {
    findings.push({
      severity: "fail",
      code: "vault-root-not-directory",
      message: `vault_root is not a directory: ${resolvedVaultRoot}`,
    });
  }

  if (existsSync(resolvedBackupRoot) && !statSync(resolvedBackupRoot).isDirectory()) {
    findings.push({
      severity: "fail",
      code: "backup-root-not-directory",
      message: `backup_root is not a directory: ${resolvedBackupRoot}`,
    });
  }

  if (resolvedVaultRoot === resolvedBackupRoot || isPathInside(resolvedBackupRoot, resolvedVaultRoot)) {
    findings.push({
      severity: "fail",
      code: "backup-root-inside-vault",
      message: "backup_root must not be the vault root or inside the vault",
    });
  }

  return {
    status: statusFromFindings(findings),
    profile: config.profile,
    vault_root: resolvedVaultRoot,
    backup_root: resolvedBackupRoot,
    proposal_queue_folder: proposalQueueFolder,
    allowed_read_folders: allowedReadFolders,
    excluded_folders: excludedFolders,
    findings,
  };
}

export function listApprovedNotes(config, options = {}) {
  const validation = validateConfig(config, options);
  if (validation.status === STATUS_FAIL || !existsSync(validation.vault_root)) {
    return { ...validation, notes: [] };
  }

  const vaultRoot = validation.vault_root;
  const excludedRoots = validation.excluded_folders.map((folder) => resolve(vaultRoot, folder));
  const notes = [];

  function walk(dir) {
    if (excludedRoots.some((excludedRoot) => isPathInside(dir, excludedRoot))) {
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        notes.push({
          path: entryPath,
          relative_path: relative(vaultRoot, entryPath).split(sep).join("/"),
        });
      }
    }
  }

  for (const folder of validation.allowed_read_folders) {
    const folderPath = resolve(vaultRoot, folder);
    if (existsSync(folderPath)) {
      walk(folderPath);
    }
  }

  return {
    ...validation,
    notes,
  };
}

export function createMemoryProposal(config, note, options = {}) {
  const now = options.now ?? new Date();
  const content = note.content ?? readFileSync(note.path, "utf8");
  const relativePath = note.relative_path ?? relative(validateConfig(config, options).vault_root, note.path).split(sep).join("/");
  const title = firstLineTitle(content, basename(relativePath, ".md"));
  const summary = content
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/^# .*\r?\n/, "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
    .slice(0, 280);

  return {
    id: timestampId("mp", now),
    source_module: "kom",
    source_profile: config.profile,
    proposal_type: "memory-draft",
    title,
    summary,
    source_refs: [
      {
        type: "obsidian-note",
        path: relativePath,
      },
    ],
    evidence: [
      {
        type: "approved-folder-read",
        description: "Source note came from an allowed_read_folders path.",
      },
    ],
    recommended_action: "Create an AI draft in the dashboard queue for operator review.",
    status: "pending_review",
    operator_decision: null,
    created_at: now.toISOString(),
    reviewed_at: null,
    resulting_artifact_refs: [],
  };
}

export function approveProposal(proposal, options = {}) {
  const now = options.now ?? new Date();
  return {
    ...proposal,
    status: "approved",
    operator_decision: options.operator_decision ?? "approved-for-ai-draft",
    reviewed_at: now.toISOString(),
  };
}

export function backupVault(config, options = {}) {
  const validation = validateConfig(config, options);
  if (validation.status === STATUS_FAIL) {
    throw new Error(`Cannot back up invalid vault config: ${validation.findings.map((finding) => finding.code).join(", ")}`);
  }
  const backupId = timestampId("vault-backup", options.now ?? new Date());
  const backupPath = join(validation.backup_root, backupId);
  mkdirSync(dirname(backupPath), { recursive: true });
  cpSync(validation.vault_root, backupPath, {
    recursive: true,
    dereference: false,
    filter: (source) => !isPathInside(resolve(source), validation.backup_root),
  });
  return {
    backup_id: backupId,
    backup_path: backupPath,
  };
}

export function writeApprovedDraft(config, proposal, options = {}) {
  if (proposal.status !== "approved") {
    throw new Error("MemoryProposal must be approved before write-back.");
  }
  const validation = validateConfig(config, options);
  if (validation.status === STATUS_FAIL) {
    throw new Error(`Cannot write draft for invalid vault config: ${validation.findings.map((finding) => finding.code).join(", ")}`);
  }

  const backup = backupVault(config, options);
  const draftsDir = join(validation.vault_root, validation.proposal_queue_folder, "AI Drafts");
  mkdirSync(draftsDir, { recursive: true });
  const draftPath = join(draftsDir, `${slugify(proposal.title)}-${safeIdComponent(proposal.id)}.md`);
  if (!isPathInside(draftPath, draftsDir)) {
    throw new Error("Draft path must remain inside the AI Drafts queue.");
  }
  const sourceRefs = proposal.source_refs.map((ref) => `  - "${ref.path}"`).join("\n");
  const body = [
    "---",
    "author: Kendall",
    "status: ai-draft",
    `proposal_id: ${proposal.id}`,
    `source_module: ${proposal.source_module}`,
    "source_refs:",
    sourceRefs,
    "---",
    "",
    `# ${proposal.title}`,
    "",
    proposal.summary,
    "",
    "## Recommended Action",
    "",
    proposal.recommended_action,
    "",
  ].join("\n");
  writeFileSync(draftPath, body, "utf8");
  return {
    backup,
    draft_path: draftPath,
    relative_path: relative(validation.vault_root, draftPath).split(sep).join("/"),
  };
}

export function createSyntheticVault(workDir) {
  const vaultRoot = join(workDir, "vault");
  const backupRoot = join(workDir, "backups");
  for (const folder of [...DEFAULT_ALLOWED_READ_FOLDERS, ...DEFAULT_EXCLUDED_FOLDERS]) {
    mkdirSync(join(vaultRoot, folder), { recursive: true });
  }

  writeFileSync(
    join(vaultRoot, "00 Inbox", "new-customer-insight.md"),
    [
      "---",
      "kind: customer-insight",
      "customer: Example Co",
      "---",
      "",
      "# Example Co onboarding signal",
      "",
      "The customer repeatedly asks for a one-page implementation checklist.",
      "Future follow-up should include a concise decision log and owner list.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(vaultRoot, "Private", "do-not-read.md"), "# Private note\n\nThis note must not be scanned.\n", "utf8");
  writeFileSync(join(vaultRoot, "01 Dashboard Queue", "existing.md"), "# Existing queue item\n", "utf8");

  return {
    vaultRoot,
    backupRoot,
  };
}

export function runSyntheticValidation(options = {}) {
  const workDir = options.workDir ?? mkdtempSync(join(tmpdir(), "kom-synthetic-"));
  mkdirSync(workDir, { recursive: true });
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    profile: "local-folder",
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const listed = listApprovedNotes(config, { projectRoot: options.projectRoot });
  const forbiddenRead = listed.notes.some((note) =>
    note.relative_path.startsWith("Private/") || note.relative_path.startsWith("01 Dashboard Queue/"),
  );
  const proposal = createMemoryProposal(config, listed.notes[0], { now: new Date("2026-06-23T00:00:00.000Z") });
  const approved = approveProposal(proposal, { now: new Date("2026-06-23T00:01:00.000Z") });
  const draft = writeApprovedDraft(config, approved, { now: new Date("2026-06-23T00:02:00.000Z") });
  const draftContent = readFileSync(draft.draft_path, "utf8");

  const findings = [...listed.findings];
  if (listed.notes.length !== 1) {
    findings.push({
      severity: "fail",
      code: "unexpected-note-count",
      message: `expected 1 approved note, found ${listed.notes.length}`,
    });
  }
  if (forbiddenRead) {
    findings.push({
      severity: "fail",
      code: "excluded-folder-read",
      message: "synthetic validation read an excluded folder",
    });
  }
  if (!draft.relative_path.startsWith("01 Dashboard Queue/AI Drafts/")) {
    findings.push({
      severity: "fail",
      code: "draft-outside-queue",
      message: `draft was written outside the queue: ${draft.relative_path}`,
    });
  }
  if (!draftContent.includes("status: ai-draft") || !draftContent.includes(`proposal_id: ${proposal.id}`)) {
    findings.push({
      severity: "fail",
      code: "draft-frontmatter-invalid",
      message: "draft frontmatter is missing AI draft status or proposal id",
    });
  }
  if (!existsSync(draft.backup.backup_path)) {
    findings.push({
      severity: "fail",
      code: "backup-missing",
      message: "backup was not created before write-back",
    });
  }

  return {
    status: statusFromFindings(findings),
    work_dir: workDir,
    vault_root: vaultRoot,
    approved_notes: listed.notes.map((note) => note.relative_path),
    proposal,
    backup: draft.backup,
    draft,
    findings,
  };
}
