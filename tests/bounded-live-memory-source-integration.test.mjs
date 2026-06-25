import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  approveProposal,
  createDefaultConfig,
  createMemoryProposal,
  createSyntheticVault,
  listApprovedNotes,
} from "../scripts/lib/knx-obsidian-memory.mjs";
import {
  createBoundedDraftWritePreview,
  createDryRunMemorySourceWritePlan,
  inspectApprovedMemorySource,
} from "../scripts/lib/bounded-live-memory-source-integration.mjs";
import { LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY } from "../scripts/lib/live-memory-source-enforcement.mjs";

function syntheticConfig() {
  const workDir = mkdtempSync(join(tmpdir(), "bounded-live-memory-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const [note] = listApprovedNotes(config).notes;
  return { workDir, vaultRoot, backupRoot, config, note };
}

function safeSourceRef(overrides = {}) {
  return {
    sourceType: "obsidian",
    accessState: "allowed",
    freshness: "fresh",
    canonicality: "canonical_human_owned",
    contradictionStatus: "none",
    ...overrides,
  };
}

function safeTargetRef(overrides = {}) {
  return {
    targetType: "obsidian_draft",
    targetPath: "01 Dashboard Queue/AI Drafts/example.md",
    quarantine: true,
    ...overrides,
  };
}

test("bounded live policy includes dry-run and read-only integration operations", () => {
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.allowedOperations.includes("create_dry_run_write_plan"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.allowedOperations.includes("inspect_approved_source_metadata"));
});

test("dry-run write plan records metadata-only no-write evidence", () => {
  const result = createDryRunMemorySourceWritePlan({
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef(),
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.dryRun, true);
  assert.equal(result.writePerformed, false);
  assert.equal(result.writePreviewArtifactCreated, false);
  assert.equal(result.auditEvent.rawPayloadRetained, false);
  assert.equal(result.auditEvent.sourceContentCopied, false);
  assert.equal(result.retention.rawPayloadRetained, false);
  assert.equal(result.retention.sourceContentCopied, false);
  assert.equal(result.recovery.backupPath, "backups/planned");
  assert.equal(result.recovery.rollbackPath, "rollbacks/planned");
  assert.deepEqual(result.targetMetadata, {
    targetType: "obsidian_draft",
    targetPath: "01 Dashboard Queue/AI Drafts/example.md",
    quarantine: true,
  });
});

test("dry-run write plan rejects unscoped draft targets", () => {
  const result = createDryRunMemorySourceWritePlan({
    sourceRef: safeSourceRef(),
    targetRef: {
      targetType: "obsidian_draft",
      targetPath: "00 Inbox/example.md",
      quarantine: false,
    },
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.writePerformed, false);
  assert.ok(result.reasonCodes.includes("unscoped_target"));
  assert.ok(result.blockedOperations.includes("write_back"));
});

test("dry-run write plan honors configured draft queue folders", () => {
  const result = createDryRunMemorySourceWritePlan({
    sourceRef: safeSourceRef(),
    draftQueueFolder: "Custom Queue",
    targetRef: safeTargetRef({
      targetPath: "Custom Queue/AI Drafts/example.md",
    }),
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.targetMetadata.targetPath, "Custom Queue/AI Drafts/example.md");
});

test("read-only approved source inspection returns metadata without raw content", () => {
  const { config, note } = syntheticConfig();
  const result = inspectApprovedMemorySource(config, {
    sourceRef: safeSourceRef(),
    relativePath: note.relative_path,
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.mode, "read_only");
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.metadata.relativePath, "00 Inbox/new-customer-insight.md");
  assert.equal(result.metadata.sourceType, "obsidian");
  assert.equal(typeof result.metadata.title, "string");
  assert.ok(!("content" in result.metadata));
  assert.ok(!("rawContent" in result.metadata));
});

test("read-only source inspection rejects excluded missing traversal and derived refs", () => {
  const { config } = syntheticConfig();
  const cases = [
    ["excluded", "Private/do-not-read.md", safeSourceRef({ accessState: "excluded" }), "excluded_source"],
    ["missing", "00 Inbox/missing.md", safeSourceRef(), "missing_source"],
    ["traversal", "../Private/do-not-read.md", safeSourceRef(), "unknown_source"],
    ["derived", "00 Inbox/new-customer-insight.md", safeSourceRef({
      sourceType: "llm_wiki",
      canonicality: "derived_rebuildable",
    }), "derived_only_source"],
  ];

  for (const [label, relativePath, sourceRef, expectedReason] of cases) {
    const result = inspectApprovedMemorySource(config, { sourceRef, relativePath });
    assert.equal(result.decision, "blocked", label);
    assert.ok(result.reasonCodes.includes(expectedReason), label);
    assert.ok(result.blockedOperations.includes("write_back"), label);
  }
});

test("bounded integration fails closed when source refs are missing", () => {
  const { config, note } = syntheticConfig();
  const proposal = approveProposal(createMemoryProposal(config, note));

  const dryRunPlan = createDryRunMemorySourceWritePlan({
    targetRef: safeTargetRef(),
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
  });
  assert.equal(dryRunPlan.decision, "blocked");
  assert.ok(dryRunPlan.reasonCodes.includes("missing_source"));

  const inspection = inspectApprovedMemorySource(config, { relativePath: note.relative_path });
  assert.equal(inspection.decision, "blocked");
  assert.ok(inspection.reasonCodes.includes("missing_source"));

  const preview = createBoundedDraftWritePreview(config, proposal, {
    targetRef: safeTargetRef(),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });
  assert.equal(preview.decision, "blocked");
  assert.equal(preview.writePreviewArtifactCreated, false);
  assert.ok(preview.reasonCodes.includes("missing_source"));
});

test("bounded draft write preview is approval gated and no-write by default", () => {
  const { config, note } = syntheticConfig();
  const proposal = approveProposal(createMemoryProposal(config, note));

  const missingApproval = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef(),
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    approvalRef: "approval:story-8-1",
  });
  assert.equal(missingApproval.decision, "requires_human_gate");
  assert.equal(missingApproval.writePerformed, false);
  assert.equal(missingApproval.writePreviewArtifactCreated, false);

  const dryRun = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef(),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
  });
  assert.equal(dryRun.decision, "allowed");
  assert.equal(dryRun.writePerformed, false);
  assert.equal(dryRun.writePreviewArtifactCreated, false);
  assert.equal(dryRun.dryRun, true);
});

test("bounded draft write preview rejects missing or unscoped target metadata", () => {
  const { config, note } = syntheticConfig();
  const proposal = approveProposal(createMemoryProposal(config, note));

  const missingTarget = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });
  assert.equal(missingTarget.decision, "blocked");
  assert.equal(missingTarget.writePreviewArtifactCreated, false);
  assert.ok(missingTarget.reasonCodes.includes("unscoped_target"));

  const canonicalTarget = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef({
      targetPath: "00 Inbox/example.md",
      quarantine: false,
    }),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });
  assert.equal(canonicalTarget.decision, "blocked");
  assert.equal(canonicalTarget.writePreviewArtifactCreated, false);
  assert.ok(canonicalTarget.reasonCodes.includes("unscoped_target"));
});

test("bounded draft write preview rejects unapproved proposals before artifact creation", () => {
  const { config, note } = syntheticConfig();
  const proposal = createMemoryProposal(config, note);

  const result = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef(),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.writePerformed, false);
  assert.equal(result.writePreviewArtifactCreated, false);
  assert.equal(result.preview, null);
  assert.ok(result.reasonCodes.includes("missing_approval_metadata"));
});

test("bounded draft write preview honors configured draft queue folders", () => {
  const { vaultRoot, backupRoot } = syntheticConfig();
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    proposal_queue_folder: "Custom Queue",
  });
  const [note] = listApprovedNotes(config).notes;
  const proposal = approveProposal(createMemoryProposal(config, note));

  const result = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef({
      targetPath: "Custom Queue/AI Drafts/example.md",
    }),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.writePerformed, false);
  assert.equal(result.writePreviewArtifactCreated, true);
  assert.match(result.preview.relativePath, /^Custom Queue\/AI Drafts\//);
  assert.ok(existsSync(result.preview.path));
});

test("bounded draft write preview rejects unapproved proposal source refs before artifact creation", () => {
  const { config, note } = syntheticConfig();
  const proposal = approveProposal({
    ...createMemoryProposal(config, note),
    source_refs: [
      {
        type: "obsidian-note",
        path: "Private/do-not-read.md",
      },
    ],
  });

  const result = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef(),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.writePerformed, false);
  assert.equal(result.writePreviewArtifactCreated, false);
  assert.equal(result.preview, null);
  assert.ok(result.reasonCodes.includes("excluded_source"));
  assert.ok(result.blockedOperations.includes("write_back"));
});

test("bounded draft write preview writes only to approved draft queue when explicitly requested", () => {
  const { config, note } = syntheticConfig();
  const proposal = approveProposal(createMemoryProposal(config, note));

  const result = createBoundedDraftWritePreview(config, proposal, {
    sourceRef: safeSourceRef(),
    targetRef: safeTargetRef(),
    explicitApproval: true,
    approvalRef: "approval:story-8-1",
    backupPath: "backups/planned",
    rollbackPath: "rollbacks/planned",
    writePreviewArtifact: true,
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.writePerformed, false);
  assert.equal(result.writePreviewArtifactCreated, true);
  assert.match(result.preview.relativePath, /^01 Dashboard Queue\/AI Drafts\//);
  assert.ok(existsSync(result.preview.path));
  assert.ok(existsSync(result.recovery.backupPath));

  const previewContent = readFileSync(result.preview.path, "utf8");
  assert.match(previewContent, /status: ai-draft/);
  assert.doesNotMatch(result.preview.relativePath, /^00 Inbox\//);
});
