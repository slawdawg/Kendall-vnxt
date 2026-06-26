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

export function createLiveReadinessTemplate(overrides = {}) {
  return {
    profile: "obsidian-sync-headless",
    vault: {
      display_name: "REPLACE_WITH_APPROVED_VAULT_DISPLAY_NAME",
      local_path: "/absolute/path/to/operator-approved/ObsidianVault",
    },
    access: {
      read_allowlist: [
        "00 Inbox",
        "02 Customers",
        "03 Contacts",
        "04 Projects",
        "05 Decisions",
        "06 Research",
        "07 Operating Manual",
        "08 Lessons",
      ],
      excluded: [
        "01 Dashboard Queue",
        "09 Archive",
        "Private",
        "Personal",
        "Journal",
      ],
    },
    write_policy: {
      draft_folder: "01 Dashboard Queue/AI Drafts",
      require_dashboard_approval: true,
    },
    backup: {
      destination: "/absolute/path/outside/vault/kom-backups",
      retention: {
        daily: 14,
        weekly: 8,
        monthly: 6,
      },
    },
    sync: {
      mechanism: "REPLACE_WITH_obsidian-sync_OR_headless-sync_OR_local-folder-manual_OR_external-sync",
      health: "REPLACE_WITH_healthy_OR_manual-current",
      checked_at: "REPLACE_WITH_ISO_TIMESTAMP",
    },
    live_readiness: {
      operator_approval_ref: "REPLACE_WITH_OPERATOR_APPROVAL_REF",
      read_only_proof_approval_ref: "REPLACE_WITH_READ_ONLY_PROOF_APPROVAL_REF",
      source_boundary_ref: "REPLACE_WITH_SOURCE_BOUNDARY_REF",
      safety_review_ref: "REPLACE_WITH_KOM_SAFETY_REVIEW_REF",
    },
    ...overrides,
  };
}

export function normalizeConfig(config = {}) {
  const kom = config.kom ?? config;
  const vault = kom.vault ?? {};
  const access = kom.access ?? {};
  const writePolicy = kom.write_policy ?? {};
  const backup = kom.backup ?? {};
  const proposals = kom.proposals ?? {};
  const sync = kom.sync ?? {};
  const liveReadiness = kom.live_readiness ?? kom.liveReadiness ?? {};
  const vaultRoot = kom.vault_root ?? vault.local_path;
  const backupRoot = kom.backup_root ?? backup.destination;
  const draftFolder = kom.proposal_queue_folder ?? writePolicy.draft_folder;
  const proposalQueueFolder = typeof draftFolder === "string" && draftFolder.endsWith("/AI Drafts")
    ? dirname(draftFolder)
    : draftFolder;

  return createDefaultConfig({
    ...kom,
    module_name: kom.module_name ?? kom.module ?? DEFAULT_CONFIG.module_name,
    profile: kom.profile ?? DEFAULT_CONFIG.profile,
    vault_display_name: kom.vault_display_name ?? vault.display_name ?? DEFAULT_CONFIG.vault_display_name,
    vault_root: vaultRoot,
    backup_root: backupRoot,
    proposal_queue_folder: proposalQueueFolder,
    allowed_read_folders: kom.allowed_read_folders ?? access.read_allowlist,
    excluded_folders: kom.excluded_folders ?? access.excluded,
    backup_retention: kom.backup_retention ?? backup.retention,
    proposal_model: kom.proposal_model ?? proposals.model,
    sync_mechanism: kom.sync_mechanism ?? sync.mechanism,
    sync_health: kom.sync_health ?? sync.health,
    sync_checked_at: kom.sync_checked_at ?? sync.checked_at,
    operator_approval_ref: kom.operator_approval_ref ?? liveReadiness.operator_approval_ref,
    read_only_proof_approval_ref: kom.read_only_proof_approval_ref ?? liveReadiness.read_only_proof_approval_ref,
    source_boundary_ref: kom.source_boundary_ref ?? liveReadiness.source_boundary_ref,
    safety_review_ref: kom.safety_review_ref ?? liveReadiness.safety_review_ref,
  });
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

function stripFrontmatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\s*/, "");
}

function parseSimpleFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!parsed) {
      continue;
    }
    const [, key, rawValue] = parsed;
    metadata[key] = rawValue.replace(/^["']|["']$/g, "").trim();
  }
  return metadata;
}

function boundedSummary(markdown, limit = 180) {
  return stripFrontmatter(markdown)
    .replace(/^# .*\r?\n/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 1)
    .join(" ")
    .slice(0, limit);
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

function yamlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function timestampId(prefix, date = new Date()) {
  return `${prefix}-${date.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
}

function vaultFolderPath(vaultRoot, folder) {
  return resolve(vaultRoot, normalize(folder));
}

export function validateConfig(config, options = {}) {
  config = normalizeConfig(config);
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
  config = normalizeConfig(config);
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
  config = normalizeConfig(config);
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

function normalizedProposalSourceState(metadata) {
  const rawFreshness = metadata.freshness ?? "fresh";
  const rawContradiction = metadata.contradiction_status ?? metadata.contradictionStatus ?? "none";
  return {
    freshness: ["fresh", "stale", "conflicting", "unknown"].includes(rawFreshness) ? rawFreshness : "unknown",
    contradictionStatus: ["none", "possible", "confirmed"].includes(rawContradiction) ? rawContradiction : "possible",
    sensitivity: VALID_PROPOSAL_SENSITIVITY.has(metadata.sensitivity) ? metadata.sensitivity : "medium",
    confidence: VALID_PROPOSAL_CONFIDENCE.has(metadata.confidence) ? metadata.confidence : "medium",
  };
}

export function createDashboardMemoryProposal(config, note, options = {}) {
  const normalizedConfig = normalizeConfig(config);
  const validation = options.validation ?? validateConfig(normalizedConfig, options);
  const now = options.now ?? new Date();
  const content = options.content ?? note.content ?? readFileSync(note.path, "utf8");
  const relativePath = note.relative_path ?? relative(validation.vault_root, note.path).split(sep).join("/");
  const proposalId = options.proposalPreview?.id ?? timestampId("mp", now);
  const metadata = parseSimpleFrontmatter(content);
  const sourceState = normalizedProposalSourceState(metadata);
  const title = firstLineTitle(content, basename(relativePath, ".md"));
  const summary = boundedSummary(content, 280) || title;
  const targetFile = `${slugify(title)}-${safeIdComponent(proposalId)}.md`;
  const targetVaultFolder = `${validation.proposal_queue_folder}/AI Drafts`;
  return {
    proposalId,
    label: title,
    status: "pending_human_approval",
    summary,
    sourceRefs: [`obsidian:${relativePath}`],
    evidenceRefs: [`evidence:read-only-proof:${relativePath}`],
    targetVaultPath: `${targetVaultFolder}/${targetFile}`,
    targetVaultFolder,
    proposalType: "new_note",
    suggestedContentSummary: "Create a Kendall-authored dashboard draft for operator review.",
    patchSummary: "Metadata-only proposal preview; no raw source note content copied.",
    sensitivity: sourceState.sensitivity,
    freshness: sourceState.freshness,
    contradictionStatus: sourceState.contradictionStatus,
    confidence: sourceState.confidence,
    operatorAction: "defer",
    decisionNeededContext: "Operator must review this proposal before any future draft write-back; canonical Obsidian notes remain human-owned.",
    backupRecoveryPath: "No mutation performed. If a future write-back is approved, create backup and rollback evidence before writing an AI draft.",
    writeBackStatus: "review_gated",
    writeBackAllowed: false,
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
  config = normalizeConfig(config);
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
  config = normalizeConfig(config);
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

const RAW_PAYLOAD_FIELD_NAMES = new Set([
  "rawContent",
  "rawPayload",
  "providerPayload",
  "prompt",
  "completion",
  "sourceContent",
  "sourceCopy",
  "rawNoteContent",
  "content",
]);

function findRawPayloadFields(value, path = []) {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findRawPayloadFields(entry, [...path, String(index)]));
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const keyPath = [...path, key];
    const nested = findRawPayloadFields(entry, keyPath);
    return RAW_PAYLOAD_FIELD_NAMES.has(key) ? [keyPath.join("."), ...nested] : nested;
  });
}

function normalizeReviewProposal(proposal = {}) {
  const proposalId = proposal.proposalId ?? proposal.id;
  const label = proposal.label ?? proposal.title ?? "Memory proposal approved for AI draft";
  const sourceRefs = Array.isArray(proposal.sourceRefs)
    ? proposal.sourceRefs
    : Array.isArray(proposal.source_refs)
      ? proposal.source_refs.map((ref) => ref.path ?? ref.refId ?? ref.id).filter(Boolean)
      : [];
  const evidenceRefs = Array.isArray(proposal.evidenceRefs)
    ? proposal.evidenceRefs
    : Array.isArray(proposal.evidence)
      ? proposal.evidence.map((entry) => entry.refId ?? entry.type ?? entry.description).filter(Boolean)
      : [];
  const approval = proposal.operatorApproval ?? proposal.approvalMetadata ?? {};
  const approvalRef = approval.approvalRef ?? approval.approvalId ?? approval.ref;
  return {
    proposalId,
    label,
    status: proposal.status,
    operatorAction: proposal.operatorAction ?? proposal.operator_decision,
    writeBackStatus: proposal.writeBackStatus,
    writeBackAllowed: proposal.writeBackAllowed,
    targetVaultFolder: proposal.targetVaultFolder,
    targetVaultPath: proposal.targetVaultPath,
    summary: proposal.summary ?? "",
    suggestedContentSummary: proposal.suggestedContentSummary ?? proposal.recommended_action ?? "",
    patchSummary: proposal.patchSummary ?? null,
    freshness: proposal.freshness,
    contradictionStatus: proposal.contradictionStatus,
    sourceRefs: sourceRefs.map(String),
    evidenceRefs: evidenceRefs.map(String),
    approval,
    approvalRef,
  };
}

function blockedApprovedDraftResult(config, validation, proposal, reasonCodes, findings = []) {
  return {
    status: "blocked",
    mode: "draft_preview",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "approved_ai_draft_write",
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    validation,
    proposal: {
      proposalId: proposal.proposalId ?? null,
      targetVaultFolder: proposal.targetVaultFolder ?? null,
      freshness: proposal.freshness ?? null,
      contradictionStatus: proposal.contradictionStatus ?? null,
      sourceRefs: proposal.sourceRefs ?? [],
      evidenceRefs: proposal.evidenceRefs ?? [],
    },
    reasonCodes,
    findings,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "approved_ai_draft_write",
      decision: "blocked",
      reasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      backupRequired: true,
      rollbackRequired: true,
    },
  };
}

function blockedCustomerBriefResult(validation, customer, reasonCodes, findings = [], skippedSources = []) {
  return {
    status: "blocked",
    mode: "metadata_brief",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "customer_contact_brief",
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    validation,
    customer: {
      name: customer,
    },
    contacts: [],
    sourceRefs: [],
    evidenceRefs: [],
    interactionThemes: [],
    openQuestions: [],
    recommendedFollowUps: [],
    skippedSources,
    reasonCodes,
    findings,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "customer_contact_brief",
      decision: "blocked",
      reasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: false,
      backupRequired: false,
      rollbackRequired: false,
    },
  };
}

function blockedMemoryHygieneResult(validation, reasonCodes, findings = [], skippedSources = []) {
  return {
    status: "blocked",
    mode: "hygiene_review",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "memory_hygiene_review",
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    validation,
    proposals: [],
    sourceRefs: [],
    evidenceRefs: [],
    skippedSources,
    reasonCodes,
    findings,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "memory_hygiene_review",
      decision: "blocked",
      reasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: false,
      backupRequired: false,
      rollbackRequired: false,
    },
  };
}

function blockedLiveReadinessResult(validation, config, reasonCodes, findings = []) {
  return {
    status: "blocked",
    mode: "live_readiness",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "read_only_live_vault_readiness",
    readOnlyProofAllowed: false,
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    validation,
    liveEvidence: {
      vaultRoot: validation.vault_root,
      backupRoot: validation.backup_root,
      allowedReadFolders: validation.allowed_read_folders,
      excludedFolders: validation.excluded_folders,
      syncMechanism: config.sync_mechanism ?? null,
      syncHealth: config.sync_health ?? null,
      syncCheckedAt: config.sync_checked_at ?? null,
      operatorApprovalRef: config.operator_approval_ref ?? null,
      readOnlyProofApprovalRef: config.read_only_proof_approval_ref ?? null,
      sourceBoundaryRef: config.source_boundary_ref ?? null,
      safetyReviewRef: config.safety_review_ref ?? null,
    },
    reasonCodes,
    findings,
    nextRequiredEvidence: [
      "operator-approved live Obsidian vault path",
      "healthy sync posture",
      "explicit live read allowlist and exclusions",
      "existing backup root outside the vault",
      "read-only live proof approval reference",
      "source boundary reference",
      "KOM safety review reference",
    ],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "read_only_live_vault_readiness",
      decision: "blocked",
      reasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      backupRequired: true,
      rollbackRequired: false,
    },
  };
}

const VALID_SYNC_MECHANISMS = new Set(["obsidian-sync", "headless-sync", "local-folder-manual", "external-sync"]);
const VALID_SYNC_HEALTH = new Set(["healthy", "manual-current"]);

const LIVE_HANDOFF_CHECKS = [
  ["config_clean", "config_not_clean", "Config validation is clean with no failures or concerns."],
  ["vault_path", "live_vault_path_missing", "Live vault path exists and is operator-approved."],
  ["backup_root", "live_backup_root_missing", "Backup root exists outside the vault."],
  ["sync_mechanism", "missing_or_invalid_sync_mechanism", "Sync mechanism is explicit and supported."],
  ["sync_health", "missing_or_unhealthy_sync_status", "Sync health is healthy or manually current."],
  ["sync_checked_at", "missing_sync_checked_at", "Sync check timestamp is recorded."],
  ["operator_approval_ref", "missing_operator_approval_ref", "Live readiness approval reference is recorded."],
  ["read_only_proof_approval_ref", "missing_read_only_proof_approval_ref", "Read-only proof approval reference is recorded."],
  ["source_boundary_ref", "missing_source_boundary_ref", "Source boundary reference is recorded."],
  ["safety_review_ref", "missing_safety_review_ref", "KOM safety review reference is recorded."],
];

function hasMeaningfulEvidenceRef(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return !/^(todo|tbd|unknown|placeholder|replace(?:[_ -].*)?|\{.+\})$/i.test(trimmed);
}

function hasValidTimestamp(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

export function assessLiveReadiness(config, options = {}) {
  config = normalizeConfig(config);
  const validation = validateConfig(config, options);
  const reasonCodes = [];
  const findings = [...validation.findings];

  for (const finding of validation.findings) {
    reasonCodes.push(finding.code.replaceAll("-", "_"));
  }

  if (validation.status !== STATUS_PASS) {
    reasonCodes.push("config_not_clean");
  }
  if (!existsSync(validation.vault_root)) {
    reasonCodes.push("live_vault_path_missing");
  }
  if (!existsSync(validation.backup_root)) {
    reasonCodes.push("live_backup_root_missing");
    findings.push({
      severity: "fail",
      code: "live-backup-root-missing",
      message: `backup_root must exist before live readiness passes: ${validation.backup_root}`,
    });
  } else if (!statSync(validation.backup_root).isDirectory()) {
    reasonCodes.push("live_backup_root_not_directory");
  }
  if (!VALID_SYNC_MECHANISMS.has(config.sync_mechanism)) {
    reasonCodes.push("missing_or_invalid_sync_mechanism");
  }
  if (!VALID_SYNC_HEALTH.has(config.sync_health)) {
    reasonCodes.push("missing_or_unhealthy_sync_status");
  }
  if (!hasValidTimestamp(config.sync_checked_at)) {
    reasonCodes.push("missing_sync_checked_at");
  }
  if (!hasMeaningfulEvidenceRef(config.operator_approval_ref)) {
    reasonCodes.push("missing_operator_approval_ref");
  }
  if (!hasMeaningfulEvidenceRef(config.read_only_proof_approval_ref)) {
    reasonCodes.push("missing_read_only_proof_approval_ref");
  }
  if (!hasMeaningfulEvidenceRef(config.source_boundary_ref)) {
    reasonCodes.push("missing_source_boundary_ref");
  }
  if (!hasMeaningfulEvidenceRef(config.safety_review_ref)) {
    reasonCodes.push("missing_safety_review_ref");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  if (uniqueReasonCodes.length > 0) {
    return blockedLiveReadinessResult(validation, config, uniqueReasonCodes, findings);
  }

  return {
    status: "ready",
    mode: "live_readiness",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "read_only_live_vault_readiness",
    readOnlyProofAllowed: true,
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    validation,
    liveEvidence: {
      vaultRoot: validation.vault_root,
      backupRoot: validation.backup_root,
      allowedReadFolders: validation.allowed_read_folders,
      excludedFolders: validation.excluded_folders,
      syncMechanism: config.sync_mechanism,
      syncHealth: config.sync_health,
      syncCheckedAt: config.sync_checked_at,
      operatorApprovalRef: config.operator_approval_ref,
      readOnlyProofApprovalRef: config.read_only_proof_approval_ref,
      sourceBoundaryRef: config.source_boundary_ref,
      safetyReviewRef: config.safety_review_ref,
    },
    reasonCodes: ["live_readiness_metadata_only"],
    findings,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "read_only_live_vault_readiness",
      decision: "allowed",
      reasonCodes: ["live_readiness_metadata_only"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      backupRequired: true,
      rollbackRequired: false,
    },
  };
}

function handoffCommand(name, argv, enabled = true) {
  return {
    name,
    enabled,
    argv: enabled ? argv : null,
  };
}

export function createLiveOperatorHandoffPacket(config, input = {}, options = {}) {
  const configPath = input.config_path ?? input.configPath ?? "PATH";
  const notePath = input.note_path ?? input.notePath ?? input.relative_path ?? input.relativePath;
  const workItemId = input.work_item_id ?? input.workItemId;
  const approvalRef = input.approval_ref ?? input.approvalRef ?? input.ref;
  const approvedBy = input.approved_by ?? input.approvedBy ?? "Operator";
  const readiness = assessLiveReadiness(config, options);
  const reasonCodes = [];

  if (readiness.status !== "ready") {
    reasonCodes.push("live_readiness_blocked", ...(readiness.reasonCodes ?? []));
  }
  if (!hasMeaningfulEvidenceRef(notePath)) {
    reasonCodes.push("missing_handoff_note_path");
  }
  if (!hasMeaningfulEvidenceRef(workItemId)) {
    reasonCodes.push("missing_work_item_id");
  }
  if (!hasMeaningfulEvidenceRef(approvalRef)) {
    reasonCodes.push("missing_draft_approval_ref");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const checklist = LIVE_HANDOFF_CHECKS.map(([id, reasonCode, label]) => ({
    id,
    label,
    status: readiness.reasonCodes?.includes(reasonCode) ? "missing" : "ready",
    reasonCode,
  }));
  const liveProofEnabled = hasMeaningfulEvidenceRef(notePath);
  const endToEndEnabled = liveProofEnabled && hasMeaningfulEvidenceRef(workItemId) && hasMeaningfulEvidenceRef(approvalRef);
  const commands = [
    handoffCommand("live_readiness_template", ["node", "scripts/knx-obsidian-memory.mjs", "live-readiness-template"]),
    handoffCommand("live_readiness", ["node", "scripts/knx-obsidian-memory.mjs", "live-readiness", "--config", configPath]),
    handoffCommand(
      "live_read_only_proof",
      ["node", "scripts/knx-obsidian-memory.mjs", "live-read-only-proof", "--config", configPath, "--note", notePath],
      liveProofEnabled,
    ),
    handoffCommand(
      "live_end_to_end_plan",
      [
        "node",
        "scripts/knx-obsidian-memory.mjs",
        "end-to-end-plan",
        "--config",
        configPath,
        "--note",
        notePath,
        "--work-item-id",
        workItemId,
        "--approval-ref",
        approvalRef,
        "--approved-by",
        approvedBy,
        "--live",
      ],
      endToEndEnabled,
    ),
  ];

  const ready = uniqueReasonCodes.length === 0;
  return {
    status: ready ? "ready" : "blocked",
    mode: "live_operator_handoff_packet",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "live_operator_handoff_packet",
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    readiness,
    checklist,
    commands,
    nextActions: ready
      ? [
          "Run live-readiness first and preserve the JSON output as evidence.",
          "Run live-read-only-proof only for the operator-approved note.",
          "Run end-to-end-plan --live before any supervisor persistence or write-approved-draft command.",
        ]
      : [
          "Complete every missing checklist item before any live note proof.",
          "Rerun the handoff packet after updating the config and approval metadata.",
        ],
    reasonCodes: ready ? ["live_operator_handoff_ready"] : uniqueReasonCodes,
    findings: readiness.findings ?? [],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "live_operator_handoff_packet",
      decision: ready ? "planned" : "blocked",
      reasonCodes: ready ? ["live_operator_handoff_ready"] : uniqueReasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      backupRequired: true,
      rollbackRequired: false,
      networkEgressAllowed: false,
      proposalPersisted: false,
    },
  };
}

const VALID_HYGIENE_FRESHNESS = new Set(["fresh", "stale"]);
const VALID_HYGIENE_CONTRADICTION_STATUS = new Set(["none", "possible", "confirmed"]);
const VALID_HYGIENE_FLAGS = new Set(["orphaned", "unresolved"]);
const VALID_PROPOSAL_SENSITIVITY = new Set(["low", "medium", "high"]);
const VALID_PROPOSAL_CONFIDENCE = new Set(["low", "medium", "high"]);

function hygieneClassification(metadata) {
  const contradictionStatus = metadata.contradiction_status || "none";
  const freshness = metadata.freshness || "fresh";
  const hygiene = metadata.hygiene || "";
  if (!VALID_HYGIENE_CONTRADICTION_STATUS.has(contradictionStatus)) {
    return {
      skipReasonCode: "malformed_source_metadata",
      detail: `invalid contradiction_status: ${contradictionStatus}`,
    };
  }
  if (!VALID_HYGIENE_FRESHNESS.has(freshness)) {
    return {
      skipReasonCode: "malformed_source_metadata",
      detail: `invalid freshness: ${freshness}`,
    };
  }
  if (hygiene && !VALID_HYGIENE_FLAGS.has(hygiene)) {
    return {
      skipReasonCode: "malformed_source_metadata",
      detail: `invalid hygiene: ${hygiene}`,
    };
  }
  if (contradictionStatus !== "none") {
    return {
      reasonCode: "contradictory_source",
      status: "contradictory",
      freshness: "conflicting",
      contradictionStatus,
      operatorAction: "blocked",
      writeBackStatus: "blocked",
      suggestedContentSummary: "Review contradictory memory evidence and decide which source remains canonical.",
    };
  }
  if (freshness === "stale") {
    return {
      reasonCode: "stale_source",
      status: "stale",
      freshness: "stale",
      contradictionStatus: "none",
      operatorAction: "defer",
      writeBackStatus: "deferred",
      suggestedContentSummary: "Review stale memory evidence before relying on this note.",
    };
  }
  if (hygiene === "orphaned") {
    return {
      reasonCode: "orphaned_source",
      status: "edit_needed",
      freshness: "unknown",
      contradictionStatus: "none",
      operatorAction: "edit",
      writeBackStatus: "review_gated",
      suggestedContentSummary: "Review orphaned memory metadata and link it to a current customer, project, decision, or evidence ref.",
    };
  }
  if (hygiene === "unresolved") {
    return {
      reasonCode: "unresolved_source",
      status: "deferred",
      freshness: "unknown",
      contradictionStatus: "none",
      operatorAction: "defer",
      writeBackStatus: "deferred",
      suggestedContentSummary: "Resolve the open memory question before using this note for write-back.",
    };
  }
  return null;
}

function createHygieneProposal(validation, note, content, metadata, classification) {
  const title = firstLineTitle(content, basename(note.relative_path, ".md"));
  const summary = boundedSummary(content) || title;
  const sourceRef = `obsidian:${note.relative_path}`;
  const evidenceRef = `evidence:memory-hygiene:${note.relative_path}`;
  const packetSlug = slugify(note.relative_path);
  return {
    proposalId: `hygiene-${packetSlug}-${classification.status}`,
    packetId: `memory_hygiene:${packetSlug}`,
    label: `Memory hygiene: ${title}`,
    status: classification.status,
    summary: `${title}: ${summary}`,
    sourceRefs: [sourceRef],
    evidenceRefs: [evidenceRef],
    targetVaultFolder: validation.proposal_queue_folder,
    proposalType: metadata.hygiene === "orphaned" ? "link_notes" : "decision_record",
    suggestedContentSummary: classification.suggestedContentSummary,
    patchSummary: "Metadata-only hygiene proposal; no source note mutation or raw source copy.",
    sensitivity: VALID_PROPOSAL_SENSITIVITY.has(metadata.sensitivity) ? metadata.sensitivity : "medium",
    freshness: classification.freshness,
    contradictionStatus: classification.contradictionStatus,
    confidence: VALID_PROPOSAL_CONFIDENCE.has(metadata.confidence) ? metadata.confidence : "medium",
    operatorAction: classification.operatorAction,
    decisionNeededContext: `${classification.reasonCode}: operator review is required before any future memory write-back.`,
    backupRecoveryPath: "No mutation performed. If a future write-back is approved, create backup and rollback evidence in that later story.",
    writeBackStatus: classification.writeBackStatus,
    writeBackAllowed: false,
    reasonCodes: [classification.reasonCode],
  };
}

export function createMemoryHygieneReport(config, options = {}) {
  const normalizedConfig = normalizeConfig(config);
  const validation = validateConfig(normalizedConfig, options);
  const listed = listApprovedNotes(normalizedConfig, options);
  const findings = [...validation.findings, ...listed.findings];

  if (validation.status !== STATUS_PASS || listed.status === STATUS_FAIL) {
    return blockedMemoryHygieneResult(
      validation,
      [...new Set([...validation.findings, ...listed.findings].map((finding) => finding.code))],
      findings,
    );
  }

  const proposals = [];
  const sourceRefs = [];
  const evidenceRefs = [];
  const skippedSources = [];
  const reasonCodes = [];
  for (const note of listed.notes) {
    const content = readFileSync(note.path, "utf8");
    const metadata = parseSimpleFrontmatter(content);
    const classification = hygieneClassification(metadata);
    if (!classification) {
      continue;
    }
    if (classification.skipReasonCode) {
      reasonCodes.push(classification.skipReasonCode);
      skippedSources.push({
        sourceRef: `obsidian:${note.relative_path}`,
        reasonCode: classification.skipReasonCode,
        detail: classification.detail,
      });
      continue;
    }
    const sourceRef = {
      refId: `obsidian:${note.relative_path}`,
      type: "obsidian-note",
      path: note.relative_path,
      accessState: "allowed",
      freshness: classification.freshness,
      canonicality: "canonical_human_owned",
      contradictionStatus: classification.contradictionStatus,
      summaryOnly: true,
    };
    const evidenceRef = {
      refId: `evidence:memory-hygiene:${note.relative_path}`,
      evidenceType: "memory",
      label: `Memory hygiene source: ${firstLineTitle(content, basename(note.relative_path, ".md"))}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    };
    sourceRefs.push(sourceRef);
    evidenceRefs.push(evidenceRef);
    reasonCodes.push(classification.reasonCode);
    proposals.push(createHygieneProposal(validation, note, content, metadata, classification));
  }

  const outputReasonCodes = reasonCodes.length > 0 ? [...new Set(reasonCodes)] : ["no_hygiene_findings"];
  return {
    status: STATUS_PASS,
    mode: "hygiene_review",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "memory_hygiene_review",
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    validation,
    proposals,
    sourceRefs,
    evidenceRefs,
    skippedSources,
    reasonCodes: outputReasonCodes,
    findings,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "memory_hygiene_review",
      decision: "allowed",
      reasonCodes: outputReasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: false,
      backupRequired: false,
      rollbackRequired: false,
    },
  };
}

export function createCustomerContactBrief(config, input = {}, options = {}) {
  const normalizedConfig = normalizeConfig(config);
  const validation = validateConfig(normalizedConfig, options);
  const customer = typeof input.customer === "string" ? input.customer.trim() : "";
  const listed = listApprovedNotes(normalizedConfig, options);
  const findings = [...validation.findings, ...listed.findings];

  if (validation.status !== STATUS_PASS || listed.status === STATUS_FAIL) {
    return blockedCustomerBriefResult(
      validation,
      customer,
      [...new Set([...validation.findings, ...listed.findings].map((finding) => finding.code))],
      findings,
    );
  }
  if (!customer) {
    return blockedCustomerBriefResult(validation, customer, ["missing_customer"], findings);
  }

  const contacts = new Map();
  const sourceRefs = [];
  const evidenceRefs = [];
  const interactionThemes = [];
  const openQuestions = [];
  const recommendedFollowUps = [];
  const skippedSources = [];

  for (const note of listed.notes) {
    const content = readFileSync(note.path, "utf8");
    const metadata = parseSimpleFrontmatter(content);
    if (metadata.customer !== customer) {
      continue;
    }
    const sourceRefId = `obsidian:${note.relative_path}`;
    const evidenceRefId = `evidence:customer-brief:${note.relative_path}`;
    const title = firstLineTitle(content, basename(note.relative_path, ".md"));
    const summary = boundedSummary(content);
    const freshness = metadata.freshness || "fresh";
    const contradictionStatus = metadata.contradiction_status || "none";
    if (freshness !== "fresh") {
      skippedSources.push({
        sourceRef: sourceRefId,
        reasonCode: "stale_source",
        freshness,
      });
      continue;
    }
    if (contradictionStatus !== "none") {
      skippedSources.push({
        sourceRef: sourceRefId,
        reasonCode: "contradictory_source",
        contradictionStatus,
      });
      continue;
    }
    if (!summary) {
      skippedSources.push({
        sourceRef: sourceRefId,
        reasonCode: "malformed_source_metadata",
      });
      continue;
    }
    if (metadata.contact) {
      contacts.set(metadata.contact, {
        name: metadata.contact,
        role: metadata.contact_role || null,
        sourceRefs: [sourceRefId],
        evidenceRefs: [evidenceRefId],
      });
    }
    sourceRefs.push({
      refId: sourceRefId,
      type: "obsidian-note",
      path: note.relative_path,
      accessState: "allowed",
      freshness,
      canonicality: "canonical_human_owned",
      contradictionStatus,
      summaryOnly: true,
    });
    evidenceRefs.push({
      refId: evidenceRefId,
      evidenceType: "memory",
      label: `Customer brief source: ${title}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    });
    interactionThemes.push({
      label: title,
      summary,
      sourceRefs: [sourceRefId],
      evidenceRefs: [evidenceRefId],
    });
    if (metadata.open_question) {
      openQuestions.push({
        summary: metadata.open_question,
        sourceRefs: [sourceRefId],
        evidenceRefs: [evidenceRefId],
      });
    }
    if (metadata.follow_up) {
      recommendedFollowUps.push({
        summary: metadata.follow_up,
        sourceRefs: [sourceRefId],
        evidenceRefs: [evidenceRefId],
      });
    }
  }

  if (sourceRefs.length === 0) {
    const skippedReasonCodes = skippedSources.map((source) => source.reasonCode);
    const reasonCodes = skippedReasonCodes.length > 0 ? [...new Set(skippedReasonCodes)] : ["missing_customer_evidence"];
    return blockedCustomerBriefResult(validation, customer, reasonCodes, findings, skippedSources);
  }

  return {
    status: STATUS_PASS,
    mode: "metadata_brief",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "customer_contact_brief",
    writePerformed: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    validation,
    customer: {
      name: customer,
    },
    contacts: [...contacts.values()],
    sourceRefs,
    evidenceRefs,
    interactionThemes,
    openQuestions,
    recommendedFollowUps,
    skippedSources,
    reasonCodes: ["customer_brief_metadata_only"],
    findings,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "customer_contact_brief",
      decision: "allowed",
      reasonCodes: ["customer_brief_metadata_only"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: false,
      backupRequired: false,
      rollbackRequired: false,
    },
  };
}

export function createDraftWriteApprovalPacket(proposal, approval = {}, options = {}) {
  const normalized = normalizeReviewProposal(proposal);
  const approvalRef = approval.approval_ref ?? approval.approvalRef ?? approval.ref;
  const approvedBy = approval.approved_by ?? approval.approvedBy ?? "Operator";
  const approvedAt = approval.approved_at ?? approval.approvedAt ?? (options.now ?? new Date()).toISOString();
  const reasonCodes = [];
  const findings = [];
  const rawPayloadFields = findRawPayloadFields(proposal);

  if (rawPayloadFields.length > 0) {
    reasonCodes.push("raw_payload_retention_requested");
    findings.push({
      severity: "fail",
      code: "raw-payload-retention-requested",
      message: `Proposal includes forbidden raw payload fields: ${rawPayloadFields.join(", ")}`,
    });
  }
  if (normalized.status !== "approved") {
    reasonCodes.push("missing_approved_status");
  }
  if (normalized.operatorAction !== "approve") {
    reasonCodes.push("missing_operator_approve_action");
  }
  if (normalized.writeBackStatus !== "approved_for_future") {
    reasonCodes.push("missing_approved_write_back_status");
  }
  if (normalized.writeBackAllowed !== false) {
    reasonCodes.push("canonical_write_authority_not_allowed");
  }
  if (normalized.freshness !== "fresh") {
    reasonCodes.push("unsafe_source_freshness");
  }
  if (normalized.contradictionStatus !== "none") {
    reasonCodes.push("unsafe_source_contradiction");
  }
  if (!hasMeaningfulEvidenceRef(approvalRef)) {
    reasonCodes.push("missing_approval_metadata");
  }
  if (normalized.sourceRefs.length === 0) {
    reasonCodes.push("missing_source_refs");
  }
  if (normalized.evidenceRefs.length === 0) {
    reasonCodes.push("missing_evidence_refs");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const base = {
    mode: "draft_write_approval_packet",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "draft_write_approval_packet",
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    proposal: normalized,
    approvalPacket: null,
    reasonCodes: uniqueReasonCodes,
    findings,
  };

  if (uniqueReasonCodes.length > 0) {
    return {
      ...base,
      status: "blocked",
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "draft_write_approval_packet",
        decision: "blocked",
        reasonCodes: uniqueReasonCodes,
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        backupRequired: true,
        rollbackRequired: false,
      },
    };
  }

  const approvalPacket = {
    proposalId: normalized.proposalId,
    packetId: proposal.packetId ?? proposal.packet_id ?? `memory_proposal:${normalized.proposalId}`,
    label: normalized.label,
    status: "approved",
    summary: normalized.summary,
    sourceRefs: normalized.sourceRefs,
    evidenceRefs: normalized.evidenceRefs,
    targetVaultPath: normalized.targetVaultPath,
    targetVaultFolder: normalized.targetVaultFolder,
    proposalType: proposal.proposalType ?? proposal.proposal_type ?? "new_note",
    suggestedContentSummary: normalized.suggestedContentSummary,
    patchSummary: normalized.patchSummary,
    sensitivity: proposal.sensitivity ?? "medium",
    freshness: normalized.freshness,
    contradictionStatus: normalized.contradictionStatus,
    confidence: proposal.confidence ?? "medium",
    operatorAction: "approve",
    decisionNeededContext: proposal.decisionNeededContext ?? "Approved for a future review-gated AI draft only.",
    backupRecoveryPath: proposal.backupRecoveryPath ?? "Restore from the recorded backup and remove the AI draft if rejected.",
    writeBackStatus: "approved_for_future",
    writeBackAllowed: false,
    operatorApproval: {
      approvalRef,
      approvedBy,
      approvedAt,
    },
  };

  return {
    ...base,
    status: "ready",
    approvalPacket,
    reasonCodes: ["operator_approved_for_draft_packet"],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "draft_write_approval_packet",
      decision: "planned",
      reasonCodes: ["operator_approved_for_draft_packet"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      approvalRef,
      backupRequired: true,
      rollbackRequired: true,
    },
  };
}

export function createApprovedDraftWriteBack(config, proposal, options = {}) {
  config = normalizeConfig(config);
  const validation = validateConfig(config, options);
  const approvalPacket = proposal?.approvalPacket ?? proposal;
  const normalized = normalizeReviewProposal(approvalPacket);
  const reasonCodes = [];
  const findings = [...validation.findings];
  const rawPayloadFields = findRawPayloadFields(proposal);
  const expectedDraftFolder = `${validation.proposal_queue_folder.replace(/\/+$/, "")}/AI Drafts`;

  if (validation.status !== STATUS_PASS) {
    reasonCodes.push(...validation.findings.map((finding) => finding.code));
  }
  if (rawPayloadFields.length > 0) {
    reasonCodes.push("raw_payload_retention_requested");
    findings.push({
      severity: "fail",
      code: "raw-payload-retention-requested",
      message: `Proposal includes forbidden raw payload fields: ${rawPayloadFields.join(", ")}`,
    });
  }
  if (normalized.status !== "approved") {
    reasonCodes.push("missing_approved_status");
  }
  if (normalized.operatorAction !== "approve") {
    reasonCodes.push("missing_operator_approve_action");
  }
  if (normalized.writeBackStatus !== "approved_for_future") {
    reasonCodes.push("missing_approved_write_back_status");
  }
  if (normalized.writeBackAllowed !== false) {
    reasonCodes.push("canonical_write_authority_not_allowed");
  }
  if (normalized.freshness !== "fresh") {
    reasonCodes.push("unsafe_source_freshness");
  }
  if (normalized.contradictionStatus !== "none") {
    reasonCodes.push("unsafe_source_contradiction");
  }
  if (!normalized.approvalRef || typeof normalized.approvalRef !== "string") {
    reasonCodes.push("missing_approval_metadata");
  }
  if (normalized.sourceRefs.length === 0) {
    reasonCodes.push("missing_source_refs");
  }
  if (normalized.evidenceRefs.length === 0) {
    reasonCodes.push("missing_evidence_refs");
  }
  if (normalized.targetVaultFolder !== expectedDraftFolder) {
    reasonCodes.push("unscoped_draft_target");
  }
  if (typeof normalized.targetVaultPath === "string" && normalized.targetVaultPath.trim()) {
    const targetPath = isAbsolute(normalized.targetVaultPath)
      ? resolve(normalized.targetVaultPath)
      : resolve(validation.vault_root, normalize(normalized.targetVaultPath));
    const expectedDraftPath = resolve(validation.vault_root, expectedDraftFolder);
    if (!isPathInside(targetPath, expectedDraftPath)) {
      reasonCodes.push("draft_path_outside_queue");
    }
  }

  let safeProposalId = null;
  try {
    safeProposalId = safeIdComponent(normalized.proposalId);
  } catch {
    reasonCodes.push("unsafe_proposal_id");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  if (uniqueReasonCodes.length > 0) {
    return blockedApprovedDraftResult(config, validation, normalized, uniqueReasonCodes, findings);
  }

  const draftsDir = join(validation.vault_root, validation.proposal_queue_folder, "AI Drafts");
  const draftRelativePath = `${expectedDraftFolder}/${slugify(normalized.label)}-${safeProposalId}.md`;
  const draftPath = join(draftsDir, `${slugify(normalized.label)}-${safeProposalId}.md`);
  if (!isPathInside(draftPath, draftsDir)) {
    return blockedApprovedDraftResult(config, validation, normalized, ["draft_path_outside_queue"], findings);
  }

  const base = {
    mode: options.apply ? "draft_preview" : "dry_run",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "approved_ai_draft_write",
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    validation,
    target: {
      folder: expectedDraftFolder,
      relativePath: draftRelativePath,
      draftPath,
    },
    rollback: {
      required: true,
      manualRecovery: `Remove ${draftRelativePath} and restore from the recorded backup if the operator rejects the draft.`,
    },
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "approved_ai_draft_write",
      decision: options.apply ? "allowed" : "dry_run_allowed",
      reasonCodes: options.apply ? ["operator_approved", "backup_created", "ai_draft_written_to_queue"] : ["operator_approved", "dry_run_only"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      approvalRef: normalized.approvalRef,
      backupRequired: true,
      rollbackRequired: true,
    },
  };

  if (!options.apply) {
    return {
      ...base,
      status: "ready",
      writePerformed: false,
      backupCreated: false,
      backup: {
        required: true,
        created: false,
        backup_path: null,
      },
      reasonCodes: ["operator_approved", "dry_run_only"],
      findings,
    };
  }

  const backup = backupVault(config, options);
  mkdirSync(draftsDir, { recursive: true });
  const sourceRefs = normalized.sourceRefs.map((ref) => `  - "${yamlString(ref)}"`).join("\n");
  const evidenceRefs = normalized.evidenceRefs.map((ref) => `  - "${yamlString(ref)}"`).join("\n");
  const body = [
    "---",
    "author: Kendall",
    "status: ai-draft",
    `proposal_id: ${safeProposalId}`,
    `approval_ref: ${normalized.approvalRef}`,
    "retention_class: metadata_only",
    "raw_payload_retained: false",
    "source_content_copied: false",
    "source_refs:",
    sourceRefs,
    "evidence_refs:",
    evidenceRefs,
    "---",
    "",
    `# ${normalized.label}`,
    "",
    normalized.summary,
    "",
    "## Suggested Content Summary",
    "",
    normalized.suggestedContentSummary,
    "",
    ...(normalized.patchSummary ? ["## Patch Summary", "", normalized.patchSummary, ""] : []),
  ].join("\n");
  writeFileSync(draftPath, body, "utf8");

  return {
    ...base,
    status: STATUS_PASS,
    writePerformed: true,
    backupCreated: true,
    backup,
    rollback: {
      ...base.rollback,
      backupPath: backup.backup_path,
    },
    draft: {
      draft_path: draftPath,
      relative_path: relative(validation.vault_root, draftPath).split(sep).join("/"),
    },
    reasonCodes: ["operator_approved", "backup_created", "ai_draft_written_to_queue"],
    findings,
  };
}

function safeRelativeNotePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "" || isAbsolute(relativePath)) {
    return false;
  }
  const normalized = normalize(relativePath);
  return normalized !== ".." && !normalized.startsWith(`..${sep}`) && !normalized.split(sep).includes("..");
}

function isExcludedRelativeNotePath(relativePath, excludedFolders) {
  const normalized = normalize(relativePath).split(sep).join("/");
  return excludedFolders.some((folder) => {
    const excluded = normalize(folder).split(sep).join("/").replace(/\/+$/, "");
    return normalized === excluded || normalized.startsWith(`${excluded}/`);
  });
}

export function createReadOnlyProof(config, input = {}, options = {}) {
  const normalizedConfig = normalizeConfig(config);
  const validation = validateConfig(normalizedConfig, options);
  const listed = listApprovedNotes(normalizedConfig, options);
  const relativePath = input.relative_path ?? input.relativePath;
  const baseResult = {
    mode: "read_only",
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    validation,
    noteMetadata: null,
    sourceRef: null,
    proposalPreview: null,
    dashboardProposal: null,
    reasonCodes: [],
  };

  if (validation.status === STATUS_FAIL || !existsSync(validation.vault_root)) {
    return {
      ...baseResult,
      status: "blocked",
      reasonCodes: validation.findings.map((finding) => finding.code),
      findings: validation.findings,
    };
  }

  if (!safeRelativeNotePath(relativePath)) {
    return {
      ...baseResult,
      status: "blocked",
      reasonCodes: ["unknown_source"],
      findings: listed.findings,
    };
  }

  const normalizedRelativePath = normalize(relativePath).split(sep).join("/");
  if (isExcludedRelativeNotePath(normalizedRelativePath, validation.excluded_folders)) {
    return {
      ...baseResult,
      status: "blocked",
      reasonCodes: ["excluded_source"],
      findings: listed.findings,
    };
  }

  const note = listed.notes.find((candidate) => candidate.relative_path === normalizedRelativePath);
  if (!note) {
    return {
      ...baseResult,
      status: "blocked",
      reasonCodes: ["missing_source"],
      findings: listed.findings,
    };
  }

  const content = readFileSync(note.path, "utf8");
  const proposalPreview = createMemoryProposal(normalizedConfig, { ...note, content }, options);
  const sourceState = normalizedProposalSourceState(parseSimpleFrontmatter(content));
  const dashboardProposal = createDashboardMemoryProposal(normalizedConfig, { ...note, content }, {
    ...options,
    validation,
    content,
    proposalPreview,
  });
  const noteMetadata = {
    relative_path: note.relative_path,
    title: firstLineTitle(content, basename(note.relative_path, ".md")),
    size_bytes: statSync(note.path).size,
    source_type: "obsidian",
  };

  return {
    ...baseResult,
    status: listed.status,
    noteMetadata,
    sourceRef: {
      type: "obsidian-note",
      path: note.relative_path,
      accessState: "allowed",
      freshness: sourceState.freshness,
      canonicality: "canonical_human_owned",
      contradictionStatus: sourceState.contradictionStatus,
    },
    proposalPreview,
    dashboardProposal,
    reasonCodes: ["read_only_proof_allowed"],
    findings: listed.findings,
  };
}

export function createLiveReadOnlyProof(config, input = {}, options = {}) {
  const normalizedConfig = normalizeConfig(config);
  const readiness = assessLiveReadiness(normalizedConfig, options);
  const baseResult = {
    mode: "live_read_only",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "live_read_only_proof",
    readOnlyProofAllowed: false,
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    readiness,
    validation: readiness.validation,
    noteMetadata: null,
    sourceRef: null,
    proposalPreview: null,
    dashboardProposal: null,
    reasonCodes: [],
    findings: readiness.findings,
  };

  if (readiness.status !== "ready") {
    const reasonCodes = ["live_readiness_blocked", ...readiness.reasonCodes];
    return {
      ...baseResult,
      status: "blocked",
      reasonCodes,
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "live_read_only_proof",
        decision: "blocked",
        reasonCodes,
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        backupRequired: true,
        rollbackRequired: false,
      },
    };
  }

  const proof = createReadOnlyProof(normalizedConfig, input, options);
  const allowed = proof.status === STATUS_PASS;
  return {
    ...proof,
    mode: "live_read_only",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "live_read_only_proof",
    readOnlyProofAllowed: allowed,
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    readiness,
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "live_read_only_proof",
      decision: allowed ? "allowed" : "blocked",
      reasonCodes: proof.reasonCodes,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      backupRequired: true,
      rollbackRequired: false,
    },
  };
}

export function createDashboardProposalPersistencePlan(config, input = {}, options = {}) {
  const workItemId = input.work_item_id ?? input.workItemId;
  const relativePath = input.relative_path ?? input.relativePath;
  const live = options.live === true || input.live === true;
  const baseResult = {
    status: "blocked",
    mode: live ? "live_dashboard_proposal_persistence_plan" : "dashboard_proposal_persistence_plan",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "dashboard_memory_proposal_persistence_plan",
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    proof: null,
    dashboardProposal: null,
    supervisorRequest: null,
    reasonCodes: [],
    findings: [],
  };

  if (typeof workItemId !== "string" || workItemId.trim() === "") {
    return {
      ...baseResult,
      reasonCodes: ["missing_work_item_id"],
      findings: [
        {
          severity: "fail",
          code: "missing-work-item-id",
          message: "work_item_id is required before creating a supervisor memory proposal persistence plan.",
        },
      ],
    };
  }

  const proof = live
    ? createLiveReadOnlyProof(config, { relative_path: relativePath }, options)
    : createReadOnlyProof(config, { relative_path: relativePath }, options);
  if (proof.status !== STATUS_PASS || !proof.dashboardProposal) {
    return {
      ...baseResult,
      proof,
      reasonCodes: ["proof_not_ready_for_dashboard_persistence", ...(proof.reasonCodes ?? [])],
      findings: proof.findings ?? [],
    };
  }

  const encodedWorkItemId = encodeURIComponent(workItemId.trim());
  return {
    ...baseResult,
    status: "ready",
    proof,
    dashboardProposal: proof.dashboardProposal,
    supervisorRequest: {
      method: "POST",
      path: `/work-items/${encodedWorkItemId}/memory-proposals`,
      body: proof.dashboardProposal,
    },
    reasonCodes: ["supervisor_proposal_persistence_dry_run"],
    findings: proof.findings ?? [],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "dashboard_memory_proposal_persistence_plan",
      decision: "planned",
      reasonCodes: ["supervisor_proposal_persistence_dry_run"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      backupRequired: false,
      rollbackRequired: false,
      networkEgressAllowed: false,
      proposalPersisted: false,
    },
  };
}

export function createDashboardProposalPersistenceApprovalPacket(plan, approval = {}, options = {}) {
  const persistencePlan = plan?.persistencePlan ?? plan?.dashboard_proposal_persistence_plan ?? plan;
  const approvalRef = approval.approval_ref ?? approval.approvalRef ?? approval.ref;
  const approvedBy = approval.approved_by ?? approval.approvedBy ?? "Operator";
  const approvedAt = approval.approved_at ?? approval.approvedAt ?? (options.now ?? new Date()).toISOString();
  const supervisorRequest = persistencePlan?.supervisorRequest;
  const proposal = supervisorRequest?.body ?? persistencePlan?.dashboardProposal;
  const rawPayloadFields = findRawPayloadFields(plan);
  const reasonCodes = [];
  const findings = [];

  if (rawPayloadFields.length > 0) {
    reasonCodes.push("raw_payload_retention_requested");
    findings.push({
      severity: "fail",
      code: "raw-payload-retention-requested",
      message: `Persistence plan includes forbidden raw payload fields: ${rawPayloadFields.join(", ")}`,
    });
  }
  if (persistencePlan?.status !== "ready") {
    reasonCodes.push("persistence_plan_not_ready");
  }
  if (supervisorRequest?.method !== "POST") {
    reasonCodes.push("invalid_supervisor_request_method");
  }
  if (typeof supervisorRequest?.path !== "string" || !/^\/work-items\/[^/]+\/memory-proposals$/.test(supervisorRequest.path)) {
    reasonCodes.push("invalid_supervisor_request_path");
  }
  if (!proposal) {
    reasonCodes.push("missing_dashboard_proposal");
  } else {
    if (proposal.status !== "pending_human_approval") {
      reasonCodes.push("proposal_not_pending_human_approval");
    }
    if (proposal.operatorAction !== "defer") {
      reasonCodes.push("proposal_not_deferred_for_review");
    }
    if (proposal.writeBackStatus !== "review_gated") {
      reasonCodes.push("proposal_not_review_gated");
    }
    if (proposal.writeBackAllowed !== false) {
      reasonCodes.push("canonical_write_authority_not_allowed");
    }
    if (!Array.isArray(proposal.sourceRefs) || proposal.sourceRefs.length === 0) {
      reasonCodes.push("missing_source_refs");
    }
    if (!Array.isArray(proposal.evidenceRefs) || proposal.evidenceRefs.length === 0) {
      reasonCodes.push("missing_evidence_refs");
    }
  }
  if (!hasMeaningfulEvidenceRef(approvalRef)) {
    reasonCodes.push("missing_persistence_approval_metadata");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const base = {
    mode: "dashboard_proposal_persistence_approval_packet",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "dashboard_proposal_persistence_approval_packet",
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    persistencePlan: persistencePlan ?? null,
    persistenceApprovalPacket: null,
    reasonCodes: uniqueReasonCodes,
    findings,
  };

  if (uniqueReasonCodes.length > 0) {
    return {
      ...base,
      status: "blocked",
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "dashboard_proposal_persistence_approval_packet",
        decision: "blocked",
        reasonCodes: uniqueReasonCodes,
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        backupRequired: false,
        rollbackRequired: false,
        networkEgressAllowed: false,
        proposalPersisted: false,
      },
    };
  }

  const packet = {
    packetId: `memory_proposal_persistence:${proposal.proposalId}`,
    status: "approved",
    supervisorRequest,
    proposalId: proposal.proposalId,
    sourceRefs: proposal.sourceRefs,
    evidenceRefs: proposal.evidenceRefs,
    writeBackAllowed: false,
    operatorApproval: {
      approvalRef,
      approvedBy,
      approvedAt,
    },
    recovery: {
      rollbackRequired: true,
      manualRecovery: `Delete or reject memory proposal ${proposal.proposalId} from supervisor review state if persistence is later rejected.`,
    },
  };

  return {
    ...base,
    status: "ready",
    persistenceApprovalPacket: packet,
    reasonCodes: ["operator_approved_for_supervisor_persistence_packet"],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "dashboard_proposal_persistence_approval_packet",
      decision: "planned",
      reasonCodes: ["operator_approved_for_supervisor_persistence_packet"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      approvalRef,
      backupRequired: false,
      rollbackRequired: true,
      networkEgressAllowed: false,
      proposalPersisted: false,
    },
  };
}

function isLocalSupervisorUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:")
      && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function createDashboardProposalPersistenceExecutionPlan(packet, options = {}) {
  const approvalPacket = packet?.persistenceApprovalPacket ?? packet?.persistence_approval_packet ?? packet;
  const supervisorUrl = options.supervisorUrl ?? options.supervisor_url ?? "http://127.0.0.1:8000";
  const supervisorRequest = approvalPacket?.supervisorRequest;
  const approvalRef = approvalPacket?.operatorApproval?.approvalRef;
  const rawPayloadFields = findRawPayloadFields(packet);
  const reasonCodes = [];
  const findings = [];

  if (rawPayloadFields.length > 0) {
    reasonCodes.push("raw_payload_retention_requested");
    findings.push({
      severity: "fail",
      code: "raw-payload-retention-requested",
      message: `Persistence approval packet includes forbidden raw payload fields: ${rawPayloadFields.join(", ")}`,
    });
  }
  if (approvalPacket?.status !== "approved") {
    reasonCodes.push("persistence_approval_packet_not_approved");
  }
  if (!hasMeaningfulEvidenceRef(approvalRef)) {
    reasonCodes.push("missing_persistence_approval_metadata");
  }
  if (!isLocalSupervisorUrl(supervisorUrl)) {
    reasonCodes.push("unapproved_supervisor_url");
  }
  if (supervisorRequest?.method !== "POST") {
    reasonCodes.push("invalid_supervisor_request_method");
  }
  if (typeof supervisorRequest?.path !== "string" || !/^\/work-items\/[^/]+\/memory-proposals$/.test(supervisorRequest.path)) {
    reasonCodes.push("invalid_supervisor_request_path");
  }
  if (!supervisorRequest?.body) {
    reasonCodes.push("missing_supervisor_request_body");
  } else if (supervisorRequest.body.writeBackAllowed !== false) {
    reasonCodes.push("canonical_write_authority_not_allowed");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const base = {
    mode: "dashboard_proposal_persistence_execution_plan",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "dashboard_proposal_persistence_execution_plan",
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    persistenceApprovalPacket: approvalPacket ?? null,
    supervisorUrl,
    httpRequest: null,
    curlArgv: null,
    reasonCodes: uniqueReasonCodes,
    findings,
  };

  if (uniqueReasonCodes.length > 0) {
    return {
      ...base,
      status: "blocked",
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "dashboard_proposal_persistence_execution_plan",
        decision: "blocked",
        reasonCodes: uniqueReasonCodes,
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        approvalRef: hasMeaningfulEvidenceRef(approvalRef) ? approvalRef : null,
        backupRequired: false,
        rollbackRequired: false,
        networkEgressAllowed: false,
        proposalPersisted: false,
      },
    };
  }

  const requestUrl = new URL(supervisorRequest.path, supervisorUrl).toString();
  const body = JSON.stringify(supervisorRequest.body);
  const headers = {
    "Content-Type": "application/json",
    "X-Kendall-Approval-Ref": approvalRef,
    "X-Kendall-Authority-Family": "memory-writeback-and-source-mutation",
  };

  return {
    ...base,
    status: "ready",
    httpRequest: {
      method: "POST",
      url: requestUrl,
      headers,
      body: supervisorRequest.body,
    },
    curlArgv: [
      "curl",
      "--fail",
      "--show-error",
      "--request",
      "POST",
      requestUrl,
      "--header",
      "Content-Type: application/json",
      "--header",
      `X-Kendall-Approval-Ref: ${approvalRef}`,
      "--header",
      "X-Kendall-Authority-Family: memory-writeback-and-source-mutation",
      "--data",
      body,
    ],
    reasonCodes: ["supervisor_persistence_execution_plan_ready"],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "dashboard_proposal_persistence_execution_plan",
      decision: "planned",
      reasonCodes: ["supervisor_persistence_execution_plan_ready"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      approvalRef,
      backupRequired: false,
      rollbackRequired: true,
      networkEgressAllowed: false,
      proposalPersisted: false,
    },
  };
}

function planStep(name, result, readyStatuses = ["ready", STATUS_PASS]) {
  const status = result ? (readyStatuses.includes(result.status) ? "ready" : "blocked") : "blocked";
  return {
    name,
    status,
    resultStatus: result?.status ?? null,
    reasonCodes: result?.reasonCodes ?? [],
  };
}

export function createEndToEndMemoryPlan(config, input = {}, options = {}) {
  const relativePath = input.relative_path ?? input.relativePath;
  const workItemId = input.work_item_id ?? input.workItemId;
  const approvalRef = input.approval_ref ?? input.approvalRef ?? input.ref;
  const approvedBy = input.approved_by ?? input.approvedBy ?? "Operator";
  const live = options.live === true || input.live === true;
  const base = {
    status: "blocked",
    mode: live ? "live_end_to_end_memory_plan" : "end_to_end_memory_plan",
    authorityFamily: "memory-writeback-and-source-mutation",
    operation: "end_to_end_memory_plan",
    live,
    writePerformed: false,
    proposalPersisted: false,
    backupCreated: false,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
    customerSystemWritesAllowed: false,
    liveReadiness: null,
    persistencePlan: null,
    draftApprovalPacket: null,
    draftWriteDryRun: null,
    steps: [],
    nextActions: [],
    reasonCodes: [],
    findings: [],
  };

  if (live) {
    const liveReadiness = assessLiveReadiness(config, options);
    const steps = [planStep("live_readiness", liveReadiness)];
    if (liveReadiness.status !== "ready") {
      return {
        ...base,
        liveReadiness,
        steps,
        nextActions: ["Complete the live readiness evidence before reading the requested Obsidian note."],
        reasonCodes: ["live_readiness_blocked", ...(liveReadiness.reasonCodes ?? [])],
        findings: liveReadiness.findings ?? [],
        auditEvent: {
          authorityFamily: "memory-writeback-and-source-mutation",
          operation: "end_to_end_memory_plan",
          decision: "blocked",
          reasonCodes: ["live_readiness_blocked", ...(liveReadiness.reasonCodes ?? [])],
          retentionClass: "metadata_only",
          rawPayloadRetained: false,
          sourceContentCopied: false,
          operatorApprovalRequired: true,
          backupRequired: true,
          rollbackRequired: false,
          networkEgressAllowed: false,
          proposalPersisted: false,
        },
      };
    }
    base.liveReadiness = liveReadiness;
    base.steps = steps;
  }

  const persistencePlan = createDashboardProposalPersistencePlan(
    config,
    { relative_path: relativePath, work_item_id: workItemId },
    { ...options, live },
  );
  const persistenceStep = planStep("dashboard_proposal_persistence_plan", persistencePlan);
  const persistenceSteps = [...base.steps, persistenceStep];
  if (persistencePlan.status !== "ready" || !persistencePlan.dashboardProposal) {
    return {
      ...base,
      persistencePlan,
      steps: persistenceSteps,
      nextActions: ["Resolve the blocked proof or work item evidence before planning dashboard persistence."],
      reasonCodes: ["dashboard_proposal_persistence_plan_blocked", ...(persistencePlan.reasonCodes ?? [])],
      findings: persistencePlan.findings ?? [],
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "end_to_end_memory_plan",
        decision: "blocked",
        reasonCodes: ["dashboard_proposal_persistence_plan_blocked", ...(persistencePlan.reasonCodes ?? [])],
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        backupRequired: false,
        rollbackRequired: false,
        networkEgressAllowed: false,
        proposalPersisted: false,
      },
    };
  }

  const approvedProposal = {
    ...persistencePlan.dashboardProposal,
    status: "approved",
    operatorAction: "approve",
    writeBackStatus: "approved_for_future",
  };
  const draftApprovalPacket = createDraftWriteApprovalPacket(
    approvedProposal,
    { approvalRef, approvedBy },
    options,
  );
  const approvalStep = planStep("draft_approval_packet", draftApprovalPacket);
  const approvalSteps = [...persistenceSteps, approvalStep];
  if (draftApprovalPacket.status !== "ready" || !draftApprovalPacket.approvalPacket) {
    return {
      ...base,
      persistencePlan,
      draftApprovalPacket,
      steps: approvalSteps,
      nextActions: ["Record explicit operator dashboard approval metadata before planning a draft write dry-run."],
      reasonCodes: ["draft_approval_packet_blocked", ...(draftApprovalPacket.reasonCodes ?? [])],
      findings: [...(persistencePlan.findings ?? []), ...(draftApprovalPacket.findings ?? [])],
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "end_to_end_memory_plan",
        decision: "blocked",
        reasonCodes: ["draft_approval_packet_blocked", ...(draftApprovalPacket.reasonCodes ?? [])],
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        approvalRef,
        backupRequired: true,
        rollbackRequired: false,
        networkEgressAllowed: false,
        proposalPersisted: false,
      },
    };
  }

  const draftWriteDryRun = createApprovedDraftWriteBack(config, draftApprovalPacket);
  const writeStep = planStep("approved_draft_write_dry_run", draftWriteDryRun);
  const steps = [...approvalSteps, writeStep];
  if (draftWriteDryRun.status !== "ready") {
    return {
      ...base,
      persistencePlan,
      draftApprovalPacket,
      draftWriteDryRun,
      steps,
      nextActions: ["Resolve the draft target, backup, or approval gate before any write-approved-draft command."],
      reasonCodes: ["approved_draft_write_dry_run_blocked", ...(draftWriteDryRun.reasonCodes ?? [])],
      findings: [
        ...(persistencePlan.findings ?? []),
        ...(draftApprovalPacket.findings ?? []),
        ...(draftWriteDryRun.findings ?? []),
      ],
      auditEvent: {
        authorityFamily: "memory-writeback-and-source-mutation",
        operation: "end_to_end_memory_plan",
        decision: "blocked",
        reasonCodes: ["approved_draft_write_dry_run_blocked", ...(draftWriteDryRun.reasonCodes ?? [])],
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
        operatorApprovalRequired: true,
        approvalRef,
        backupRequired: true,
        rollbackRequired: true,
        networkEgressAllowed: false,
        proposalPersisted: false,
      },
    };
  }

  return {
    ...base,
    status: "ready",
    persistencePlan,
    draftApprovalPacket,
    draftWriteDryRun,
    steps,
    nextActions: [
      "Persist the supervisorRequest only after operator approval for supervisor state mutation.",
      "Run write-approved-draft --apply only after the dashboard proposal remains approved and a backup/recovery path is accepted.",
    ],
    reasonCodes: ["end_to_end_memory_plan_ready"],
    findings: [
      ...(persistencePlan.findings ?? []),
      ...(draftApprovalPacket.findings ?? []),
      ...(draftWriteDryRun.findings ?? []),
    ],
    auditEvent: {
      authorityFamily: "memory-writeback-and-source-mutation",
      operation: "end_to_end_memory_plan",
      decision: "planned",
      reasonCodes: ["end_to_end_memory_plan_ready"],
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
      sourceContentCopied: false,
      operatorApprovalRequired: true,
      approvalRef,
      backupRequired: true,
      rollbackRequired: true,
      networkEgressAllowed: false,
      proposalPersisted: false,
    },
  };
}

export function createSyntheticVault(workDir, options = {}) {
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
      "contact: Taylor Ops",
      "contact_role: Implementation Lead",
      "open_question: Which checklist owner should sign off before kickoff?",
      "follow_up: Share a concise decision log and owner list.",
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
  if (options.includeHygieneFixtures) {
    writeFileSync(
      join(vaultRoot, "05 Decisions", "stale-kickoff-checklist.md"),
      [
        "---",
        "kind: memory-hygiene",
        "freshness: stale",
        "sensitivity: low",
        "confidence: medium",
        "---",
        "",
        "# Stale kickoff checklist",
        "",
        "The kickoff checklist needs operator review before it can be trusted.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(vaultRoot, "05 Decisions", "contradictory-owner-record.md"),
      [
        "---",
        "kind: memory-hygiene",
        "contradiction_status: confirmed",
        "sensitivity: medium",
        "confidence: high",
        "---",
        "",
        "# Contradictory owner record",
        "",
        "Two memory records disagree about the implementation owner.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(vaultRoot, "08 Lessons", "orphaned-retro-note.md"),
      [
        "---",
        "kind: memory-hygiene",
        "hygiene: orphaned",
        "sensitivity: low",
        "confidence: medium",
        "---",
        "",
        "# Orphaned retro note",
        "",
        "This lesson has no current project or decision reference.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(vaultRoot, "03 Contacts", "unresolved-contact-question.md"),
      [
        "---",
        "kind: memory-hygiene",
        "hygiene: unresolved",
        "sensitivity: medium",
        "confidence: low",
        "---",
        "",
        "# Unresolved contact question",
        "",
        "The follow-up owner is still unresolved.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
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
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir, { includeHygieneFixtures: true });
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
  const approved = {
    proposalId: proposal.id,
    packetId: "synthetic:kom",
    label: proposal.title,
    status: "approved",
    summary: proposal.summary,
    sourceRefs: proposal.source_refs.map((ref) => `obsidian:${ref.path}`),
    evidenceRefs: proposal.evidence.map((entry) => `evidence:${entry.type}`),
    targetVaultFolder: "01 Dashboard Queue/AI Drafts",
    proposalType: "new_note",
    suggestedContentSummary: proposal.recommended_action,
    patchSummary: "Synthetic metadata-only draft write proof.",
    sensitivity: "low",
    freshness: "fresh",
    contradictionStatus: "none",
    confidence: "high",
    operatorAction: "approve",
    decisionNeededContext: "Synthetic proof approved for local AI draft only.",
    backupRecoveryPath: "Remove the AI draft and restore from the recorded backup.",
    writeBackStatus: "approved_for_future",
    writeBackAllowed: false,
    operatorApproval: {
      approvalRef: "synthetic-operator-approval",
      approvedBy: "Synthetic operator",
      approvedAt: "2026-06-23T00:01:00.000Z",
    },
  };
  const draftWrite = createApprovedDraftWriteBack(config, approved, {
    apply: true,
    now: new Date("2026-06-23T00:02:00.000Z"),
  });
  const draftContent = draftWrite.draft ? readFileSync(draftWrite.draft.draft_path, "utf8") : "";
  const customerBrief = createCustomerContactBrief(config, { customer: "Example Co" }, options);
  const hygieneReport = createMemoryHygieneReport(config, options);
  const liveReadyConfig = {
    ...config,
    sync_mechanism: "local-folder-manual",
    sync_health: "manual-current",
    sync_checked_at: "2026-06-23T00:03:00.000Z",
    operator_approval_ref: "synthetic-operator-live-readiness",
    read_only_proof_approval_ref: "synthetic-read-only-proof-approval",
    source_boundary_ref: "docs/workflows/live-memory-source-enforcement.md",
    safety_review_ref: "synthetic-kom-safety-review",
  };
  const liveReadiness = assessLiveReadiness(liveReadyConfig, options);
  const liveReadOnlyProof = createLiveReadOnlyProof(
    liveReadyConfig,
    { relative_path: "00 Inbox/new-customer-insight.md" },
    { ...options, now: new Date("2026-06-23T00:04:00.000Z") },
  );
  const dashboardProposalPersistencePlan = createDashboardProposalPersistencePlan(
    liveReadyConfig,
    { relative_path: "00 Inbox/new-customer-insight.md", work_item_id: "wi-synthetic-memory" },
    { ...options, live: true, now: new Date("2026-06-23T00:05:00.000Z") },
  );
  const dashboardProposalPersistenceApprovalPacket = createDashboardProposalPersistenceApprovalPacket(
    dashboardProposalPersistencePlan,
    {
      approvalRef: "synthetic-operator-supervisor-persistence-approval",
      approvedBy: "Synthetic operator",
    },
    { now: new Date("2026-06-23T00:05:30.000Z") },
  );
  const dashboardProposalPersistenceExecutionPlan = createDashboardProposalPersistenceExecutionPlan(
    dashboardProposalPersistenceApprovalPacket,
    { supervisorUrl: "http://127.0.0.1:8000" },
  );
  const draftApprovalPacket = createDraftWriteApprovalPacket(
    {
      ...dashboardProposalPersistencePlan.dashboardProposal,
      status: "approved",
      operatorAction: "approve",
      writeBackStatus: "approved_for_future",
    },
    {
      approvalRef: "synthetic-operator-draft-approval",
      approvedBy: "Synthetic operator",
    },
    { now: new Date("2026-06-23T00:06:00.000Z") },
  );
  const draftApprovalDryRun = draftApprovalPacket.approvalPacket
    ? createApprovedDraftWriteBack(liveReadyConfig, draftApprovalPacket)
    : null;
  const endToEndMemoryPlan = createEndToEndMemoryPlan(
    liveReadyConfig,
    {
      relative_path: "00 Inbox/new-customer-insight.md",
      work_item_id: "wi-synthetic-memory",
      approval_ref: "synthetic-operator-draft-approval",
      approved_by: "Synthetic operator",
    },
    { ...options, live: true, now: new Date("2026-06-23T00:07:00.000Z") },
  );
  const liveOperatorHandoffPacket = createLiveOperatorHandoffPacket(
    liveReadyConfig,
    {
      config_path: "synthetic-kom-live.json",
      note_path: "00 Inbox/new-customer-insight.md",
      work_item_id: "wi-synthetic-memory",
      approval_ref: "synthetic-operator-draft-approval",
      approved_by: "Synthetic operator",
    },
    { ...options, now: new Date("2026-06-23T00:08:00.000Z") },
  );

  const findings = [...listed.findings];
  if (listed.notes.length !== 5) {
    findings.push({
      severity: "fail",
      code: "unexpected-note-count",
      message: `expected 5 approved notes, found ${listed.notes.length}`,
    });
  }
  if (forbiddenRead) {
    findings.push({
      severity: "fail",
      code: "excluded-folder-read",
      message: "synthetic validation read an excluded folder",
    });
  }
  if (draftWrite.status !== STATUS_PASS) {
    findings.push({
      severity: "fail",
      code: "draft-write-gate-blocked",
      message: `review-gated draft write did not pass: ${draftWrite.reasonCodes.join(", ")}`,
    });
  }
  if (!draftWrite.draft?.relative_path.startsWith("01 Dashboard Queue/AI Drafts/")) {
    findings.push({
      severity: "fail",
      code: "draft-outside-queue",
      message: `draft was written outside the queue: ${draftWrite.draft?.relative_path ?? "(missing)"}`,
    });
  }
  if (!draftContent.includes("status: ai-draft") || !draftContent.includes(`proposal_id: ${proposal.id}`)) {
    findings.push({
      severity: "fail",
      code: "draft-frontmatter-invalid",
      message: "draft frontmatter is missing AI draft status or proposal id",
    });
  }
  if (!draftWrite.backup?.backup_path || !existsSync(draftWrite.backup.backup_path)) {
    findings.push({
      severity: "fail",
      code: "backup-missing",
      message: "backup was not created before write-back",
    });
  }
  if (draftWrite.auditEvent?.retentionClass !== "metadata_only" || draftWrite.rawPayloadRetained !== false || draftWrite.sourceContentCopied !== false) {
    findings.push({
      severity: "fail",
      code: "draft-audit-boundary-invalid",
      message: "draft write audit evidence is missing metadata-only retention markers",
    });
  }
  if (customerBrief.status !== STATUS_PASS) {
    findings.push({
      severity: "fail",
      code: "customer-brief-blocked",
      message: `customer brief did not pass: ${customerBrief.reasonCodes.join(", ")}`,
    });
  }
  if (customerBrief.rawPayloadRetained !== false || customerBrief.sourceContentCopied !== false || customerBrief.writePerformed !== false) {
    findings.push({
      severity: "fail",
      code: "customer-brief-boundary-invalid",
      message: "customer brief evidence is missing metadata-only/no-write markers",
    });
  }
  if (hygieneReport.status !== STATUS_PASS || hygieneReport.proposals.length !== 4) {
    findings.push({
      severity: "fail",
      code: "hygiene-report-invalid",
      message: `hygiene report expected 4 proposals, found ${hygieneReport.proposals.length}`,
    });
  }
  if (hygieneReport.rawPayloadRetained !== false || hygieneReport.sourceContentCopied !== false || hygieneReport.writePerformed !== false) {
    findings.push({
      severity: "fail",
      code: "hygiene-report-boundary-invalid",
      message: "hygiene report evidence is missing metadata-only/no-write markers",
    });
  }
  if (liveReadiness.status !== "ready") {
    findings.push({
      severity: "fail",
      code: "live-readiness-blocked",
      message: `live readiness gate did not pass: ${liveReadiness.reasonCodes.join(", ")}`,
    });
  }
  if (
    liveReadiness.rawPayloadRetained !== false
    || liveReadiness.sourceContentCopied !== false
    || liveReadiness.writePerformed !== false
    || liveReadiness.readOnlyProofAllowed !== true
  ) {
    findings.push({
      severity: "fail",
      code: "live-readiness-boundary-invalid",
      message: "live readiness evidence is missing metadata-only/no-write markers",
    });
  }
  if (liveReadOnlyProof.status !== STATUS_PASS) {
    findings.push({
      severity: "fail",
      code: "live-read-only-proof-blocked",
      message: `live read-only proof did not pass: ${liveReadOnlyProof.reasonCodes.join(", ")}`,
    });
  }
  if (
    liveReadOnlyProof.rawPayloadRetained !== false
    || liveReadOnlyProof.sourceContentCopied !== false
    || liveReadOnlyProof.writePerformed !== false
    || liveReadOnlyProof.proposalPersisted !== false
  ) {
    findings.push({
      severity: "fail",
      code: "live-read-only-proof-boundary-invalid",
      message: "live read-only proof evidence is missing metadata-only/no-write markers",
    });
  }
  if (
    !liveReadOnlyProof.dashboardProposal
    || liveReadOnlyProof.dashboardProposal.status !== "pending_human_approval"
    || liveReadOnlyProof.dashboardProposal.sensitivity !== "medium"
    || liveReadOnlyProof.dashboardProposal.freshness !== "fresh"
    || liveReadOnlyProof.dashboardProposal.confidence !== "medium"
    || liveReadOnlyProof.dashboardProposal.writeBackAllowed !== false
  ) {
    findings.push({
      severity: "fail",
      code: "live-dashboard-proposal-invalid",
      message: "live read-only proof did not produce a dashboard-ready memory proposal with required metadata fields",
    });
  }
  if (dashboardProposalPersistencePlan.status !== "ready") {
    findings.push({
      severity: "fail",
      code: "dashboard-proposal-persistence-plan-blocked",
      message: `dashboard proposal persistence plan did not become ready: ${dashboardProposalPersistencePlan.reasonCodes.join(", ")}`,
    });
  }
  if (
    dashboardProposalPersistencePlan.proposalPersisted !== false
    || dashboardProposalPersistencePlan.networkEgressAllowed !== false
    || dashboardProposalPersistencePlan.writePerformed !== false
    || dashboardProposalPersistencePlan.supervisorRequest?.method !== "POST"
    || dashboardProposalPersistencePlan.supervisorRequest?.path !== "/work-items/wi-synthetic-memory/memory-proposals"
    || dashboardProposalPersistencePlan.supervisorRequest?.body?.writeBackAllowed !== false
  ) {
    findings.push({
      severity: "fail",
      code: "dashboard-proposal-persistence-plan-boundary-invalid",
      message: "dashboard proposal persistence plan did not preserve dry-run/no-network/no-write boundaries",
    });
  }
  if (
    dashboardProposalPersistenceApprovalPacket.status !== "ready"
    || dashboardProposalPersistenceApprovalPacket.proposalPersisted !== false
    || dashboardProposalPersistenceApprovalPacket.networkEgressAllowed !== false
    || dashboardProposalPersistenceApprovalPacket.writePerformed !== false
    || dashboardProposalPersistenceApprovalPacket.persistenceApprovalPacket?.operatorApproval?.approvalRef
      !== "synthetic-operator-supervisor-persistence-approval"
  ) {
    findings.push({
      severity: "fail",
      code: "dashboard-proposal-persistence-approval-packet-invalid",
      message: "dashboard proposal persistence approval packet did not preserve dry-run/no-network/no-write boundaries",
    });
  }
  if (
    dashboardProposalPersistenceExecutionPlan.status !== "ready"
    || dashboardProposalPersistenceExecutionPlan.proposalPersisted !== false
    || dashboardProposalPersistenceExecutionPlan.networkEgressAllowed !== false
    || dashboardProposalPersistenceExecutionPlan.writePerformed !== false
    || dashboardProposalPersistenceExecutionPlan.httpRequest?.method !== "POST"
    || dashboardProposalPersistenceExecutionPlan.curlArgv?.[0] !== "curl"
  ) {
    findings.push({
      severity: "fail",
      code: "dashboard-proposal-persistence-execution-plan-invalid",
      message: "dashboard proposal persistence execution plan did not preserve no-network/no-persistence boundaries",
    });
  }
  if (draftApprovalPacket.status !== "ready" || draftApprovalPacket.approvalPacket?.operatorApproval?.approvalRef !== "synthetic-operator-draft-approval") {
    findings.push({
      severity: "fail",
      code: "draft-approval-packet-invalid",
      message: "draft approval packet did not include required explicit operator approval metadata",
    });
  }
  if (draftApprovalDryRun?.status !== "ready" || draftApprovalDryRun.writePerformed !== false || draftApprovalDryRun.backupCreated !== false) {
    findings.push({
      severity: "fail",
      code: "draft-approval-dry-run-invalid",
      message: "draft approval packet did not pass the existing draft write dry-run gate without writes",
    });
  }
  if (
    endToEndMemoryPlan.status !== "ready"
    || endToEndMemoryPlan.proposalPersisted !== false
    || endToEndMemoryPlan.networkEgressAllowed !== false
    || endToEndMemoryPlan.writePerformed !== false
    || endToEndMemoryPlan.backupCreated !== false
    || endToEndMemoryPlan.steps.some((step) => step.status !== "ready")
  ) {
    findings.push({
      severity: "fail",
      code: "end-to-end-memory-plan-invalid",
      message: "end-to-end memory plan did not prove the dry-run workflow without persistence, network, backup, or writes",
    });
  }
  if (
    liveOperatorHandoffPacket.status !== "ready"
    || liveOperatorHandoffPacket.writePerformed !== false
    || liveOperatorHandoffPacket.proposalPersisted !== false
    || liveOperatorHandoffPacket.networkEgressAllowed !== false
    || liveOperatorHandoffPacket.commands.some((command) => !command.enabled)
  ) {
    findings.push({
      severity: "fail",
      code: "live-operator-handoff-packet-invalid",
      message: "live operator handoff packet did not produce a ready metadata-only command packet",
    });
  }

  return {
    status: statusFromFindings(findings),
    work_dir: workDir,
    vault_root: vaultRoot,
    approved_notes: listed.notes.map((note) => note.relative_path),
    proposal,
    backup: draftWrite.backup,
    draft: draftWrite.draft,
    draft_write: draftWrite,
    customer_brief: customerBrief,
    hygiene_report: hygieneReport,
    live_readiness: liveReadiness,
    live_read_only_proof: liveReadOnlyProof,
    dashboard_proposal_persistence_plan: dashboardProposalPersistencePlan,
    dashboard_proposal_persistence_approval_packet: dashboardProposalPersistenceApprovalPacket,
    dashboard_proposal_persistence_execution_plan: dashboardProposalPersistenceExecutionPlan,
    draft_approval_packet: draftApprovalPacket,
    draft_approval_dry_run: draftApprovalDryRun,
    end_to_end_memory_plan: endToEndMemoryPlan,
    live_operator_handoff_packet: liveOperatorHandoffPacket,
    findings,
  };
}
