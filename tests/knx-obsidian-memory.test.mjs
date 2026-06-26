import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assessLiveReadiness,
  approveProposal,
  createDefaultConfig,
  createApprovedDraftWriteBack,
  createCustomerContactBrief,
  createLiveReadinessTemplate,
  createLiveOperatorHandoffPacket,
  createLiveReadOnlyProof,
  createMemoryProposal,
  createDashboardProposalPersistenceApprovalPacket,
  createDashboardProposalPersistenceExecutionPlan,
  createDashboardProposalPersistencePlan,
  createDraftWriteApprovalPacket,
  createEndToEndMemoryPlan,
  createMemoryHygieneReport,
  createReadOnlyProof,
  createSyntheticVault,
  listApprovedNotes,
  normalizeConfig,
  runSyntheticValidation,
  validateConfig,
  writeApprovedDraft,
} from "../scripts/lib/knx-obsidian-memory.mjs";

function approvedMemoryProposalV0(overrides = {}) {
  return {
    proposalId: "mp-20260625T010203Z",
    packetId: "work_item:test",
    label: "Memory proposal approved for AI draft",
    status: "approved",
    summary: "Example Co repeatedly asks for a one-page implementation checklist.",
    sourceRefs: ["obsidian:00-inbox-new-customer-insight"],
    evidenceRefs: ["evidence:read-only-proof"],
    targetVaultFolder: "01 Dashboard Queue/AI Drafts",
    proposalType: "new_note",
    suggestedContentSummary: "Create a Kendall-authored dashboard draft for operator review.",
    patchSummary: "Metadata-only proposal summary; no raw source content copied.",
    sensitivity: "medium",
    freshness: "fresh",
    contradictionStatus: "none",
    confidence: "high",
    operatorAction: "approve",
    decisionNeededContext: "Approved for a future gated draft preview only.",
    backupRecoveryPath: "Restore from the recorded backup and remove the AI draft if rejected.",
    writeBackStatus: "approved_for_future",
    writeBackAllowed: false,
    operatorApproval: {
      approvalRef: "approval:operator:m3",
      approvedBy: "Operator",
      approvedAt: "2026-06-25T01:02:03.000Z",
    },
    ...overrides,
  };
}

test("synthetic validation proves the v1 memory loop", () => {
  const result = runSyntheticValidation({ workDir: mkdtempSync(join(tmpdir(), "kom-test-")) });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.approved_notes, [
    "00 Inbox/new-customer-insight.md",
    "03 Contacts/unresolved-contact-question.md",
    "05 Decisions/contradictory-owner-record.md",
    "05 Decisions/stale-kickoff-checklist.md",
    "08 Lessons/orphaned-retro-note.md",
  ]);
  assert.equal(result.proposal.status, "pending_review");
  assert.match(result.draft.relative_path, /^01 Dashboard Queue\/AI Drafts\//);
  assert.equal(result.hygiene_report.proposals.length, 4);
});

test("excluded folders are not scanned", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = listApprovedNotes(config);

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.notes.map((note) => note.relative_path), ["00 Inbox/new-customer-insight.md"]);
});

test("customer contact brief uses metadata and bounded summaries only", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createCustomerContactBrief(config, { customer: "Example Co" });

  assert.equal(result.status, "PASS");
  assert.equal(result.mode, "metadata_brief");
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.providerCallsAllowed, false);
  assert.equal(result.workerLaunchAllowed, false);
  assert.equal(result.customer.name, "Example Co");
  assert.deepEqual(result.contacts.map((contact) => contact.name), ["Taylor Ops"]);
  assert.equal(result.sourceRefs[0].path, "00 Inbox/new-customer-insight.md");
  assert.ok(result.evidenceRefs.some((ref) => ref.evidenceType === "memory"));
  assert.ok(result.interactionThemes.some((theme) => theme.summary.includes("one-page implementation checklist")));
  assert.ok(result.openQuestions.some((question) => question.summary.includes("checklist owner")));
  assert.ok(result.recommendedFollowUps.some((followUp) => followUp.summary.includes("owner list")));
  assert.equal(result.auditEvent.retentionClass, "metadata_only");
  assert.equal(result.auditEvent.decision, "allowed");
  assert.equal(JSON.stringify(result).includes("This note must not be scanned"), false);
  assert.equal(JSON.stringify(result).includes("Future follow-up should include"), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("customer contact brief blocks missing customer and unsafe configs without writes", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const missingCustomer = createCustomerContactBrief(config, { customer: "Missing Co" });

  assert.equal(missingCustomer.status, "blocked");
  assert.ok(missingCustomer.reasonCodes.includes("missing_customer_evidence"));
  assert.equal(missingCustomer.writePerformed, false);
  assert.equal(missingCustomer.backupCreated, false);

  const unsafeConfig = createDefaultConfig({
    vault_root: join(workDir, "missing-vault"),
    backup_root: backupRoot,
  });
  const blockedConfig = createCustomerContactBrief(unsafeConfig, { customer: "Example Co" });

  assert.equal(blockedConfig.status, "blocked");
  assert.ok(blockedConfig.reasonCodes.includes("vault-root-missing"));
  assert.equal(blockedConfig.writePerformed, false);
  assert.equal(blockedConfig.backupCreated, false);
  assert.equal(existsSync(backupRoot), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("customer contact brief omits stale and contradictory source states", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  writeFileSync(
    join(vaultRoot, "02 Customers", "stale-co.md"),
    [
      "---",
      "customer: Stale Co",
      "freshness: stale",
      "---",
      "",
      "# Stale Co signal",
      "",
      "This stale note should not be used for a contact brief.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(vaultRoot, "02 Customers", "conflict-co.md"),
    [
      "---",
      "customer: Conflict Co",
      "contradiction_status: confirmed",
      "---",
      "",
      "# Conflict Co signal",
      "",
      "This contradictory note should not be used for a contact brief.",
      "",
    ].join("\n"),
    "utf8",
  );

  const stale = createCustomerContactBrief(config, { customer: "Stale Co" });
  assert.equal(stale.status, "blocked");
  assert.ok(stale.reasonCodes.includes("stale_source"));
  assert.equal(stale.sourceRefs.length, 0);
  assert.equal(stale.skippedSources[0].reasonCode, "stale_source");

  const contradictory = createCustomerContactBrief(config, { customer: "Conflict Co" });
  assert.equal(contradictory.status, "blocked");
  assert.ok(contradictory.reasonCodes.includes("contradictory_source"));
  assert.equal(contradictory.sourceRefs.length, 0);
  assert.equal(contradictory.skippedSources[0].reasonCode, "contradictory_source");

  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("memory hygiene report emits proposal-only records for unsafe memory states", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir, { includeHygieneFixtures: true });
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createMemoryHygieneReport(config);

  assert.equal(result.status, "PASS");
  assert.equal(result.operation, "memory_hygiene_review");
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.providerCallsAllowed, false);
  assert.equal(result.workerLaunchAllowed, false);
  assert.equal(result.customerSystemWritesAllowed, false);
  assert.equal(result.auditEvent.retentionClass, "metadata_only");
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.status).sort(),
    ["contradictory", "deferred", "edit_needed", "stale"],
  );
  assert.ok(result.proposals.every((proposal) => proposal.writeBackAllowed === false));
  assert.ok(result.proposals.every((proposal) => proposal.sourceRefs.length > 0));
  assert.ok(result.proposals.every((proposal) => proposal.evidenceRefs.length > 0));
  assert.ok(result.proposals.every((proposal) => proposal.targetVaultFolder === "01 Dashboard Queue"));
  assert.ok(result.proposals.some((proposal) => proposal.freshness === "stale"));
  assert.ok(result.proposals.some((proposal) => proposal.contradictionStatus === "confirmed"));
  assert.equal(JSON.stringify(result).includes("This note must not be scanned"), false);
  assert.equal(JSON.stringify(result).includes("Future follow-up should include"), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("memory hygiene report handles clean and unsafe configs without writes", () => {
  const cleanWorkDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot: cleanVaultRoot, backupRoot: cleanBackupRoot } = createSyntheticVault(cleanWorkDir, {
    includeHygieneFixtures: false,
  });
  const cleanConfig = createDefaultConfig({
    vault_root: cleanVaultRoot,
    backup_root: cleanBackupRoot,
  });

  const clean = createMemoryHygieneReport(cleanConfig);
  assert.equal(clean.status, "PASS");
  assert.equal(clean.proposals.length, 0);
  assert.ok(clean.reasonCodes.includes("no_hygiene_findings"));
  assert.equal(clean.writePerformed, false);
  assert.equal(clean.backupCreated, false);

  const unsafeWorkDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(unsafeWorkDir);
  const unsafeConfig = createDefaultConfig({
    vault_root: join(unsafeWorkDir, "missing-vault"),
    backup_root: backupRoot,
  });

  const blocked = createMemoryHygieneReport(unsafeConfig);
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.reasonCodes.includes("vault-root-missing"));
  assert.equal(blocked.proposals.length, 0);
  assert.equal(blocked.writePerformed, false);
  assert.equal(blocked.backupCreated, false);
  assert.equal(existsSync(backupRoot), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("memory hygiene report skips malformed hygiene metadata without creating proposals", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  writeFileSync(
    join(vaultRoot, "02 Customers", "malformed-hygiene.md"),
    [
      "---",
      "kind: memory-hygiene",
      "freshness: sideways",
      "contradiction_status: maybe",
      "hygiene: obsolete",
      "---",
      "",
      "# Malformed hygiene metadata",
      "",
      "This malformed note should not become a proposal.",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = createMemoryHygieneReport(config);

  assert.equal(result.status, "PASS");
  assert.equal(result.proposals.length, 0);
  assert.ok(result.reasonCodes.includes("malformed_source_metadata"));
  assert.equal(result.skippedSources[0].reasonCode, "malformed_source_metadata");
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("planned nested config shape normalizes to runtime config", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = normalizeConfig({
    module: "knx-obsidian-memory",
    profile: "obsidian-sync-headless",
    vault: {
      display_name: "Kendall Memory",
      local_path: vaultRoot,
    },
    access: {
      read_allowlist: ["00 Inbox", "02 Customers"],
      excluded: ["01 Dashboard Queue", "Private"],
    },
    write_policy: {
      draft_folder: "01 Dashboard Queue/AI Drafts",
      require_dashboard_approval: true,
    },
    backup: {
      destination: backupRoot,
      retention: {
        daily: 14,
        weekly: 8,
        monthly: 6,
      },
    },
  });

  const result = validateConfig(config);

  assert.equal(result.status, "PASS");
  assert.equal(result.profile, "obsidian-sync-headless");
  assert.equal(result.vault_root, vaultRoot);
  assert.equal(result.backup_root, backupRoot);
  assert.equal(result.proposal_queue_folder, "01 Dashboard Queue");
  assert.deepEqual(result.allowed_read_folders, ["00 Inbox", "02 Customers"]);
  assert.deepEqual(result.excluded_folders, ["01 Dashboard Queue", "Private"]);
});

test("live readiness requires explicit operator, sync, boundary, safety, and backup evidence", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    sync_mechanism: "obsidian-sync",
    sync_health: "healthy",
    sync_checked_at: "2026-06-26T00:00:00.000Z",
    operator_approval_ref: "approval:operator:live-readiness",
    read_only_proof_approval_ref: "approval:operator:read-only-proof",
    source_boundary_ref: "docs/workflows/live-memory-source-enforcement.md",
    safety_review_ref: "_bmad-output/implementation-artifacts/reviews/kom-safety-review-2026-06-25.md",
  });
  mkdirSync(backupRoot, { recursive: true });

  const result = assessLiveReadiness(config);

  assert.equal(result.status, "ready");
  assert.equal(result.readOnlyProofAllowed, true);
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.providerCallsAllowed, false);
  assert.equal(result.workerLaunchAllowed, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(result.customerSystemWritesAllowed, false);
  assert.equal(result.liveEvidence.vaultRoot, vaultRoot);
  assert.equal(result.liveEvidence.backupRoot, backupRoot);
  assert.equal(result.liveEvidence.syncMechanism, "obsidian-sync");
  assert.equal(result.liveEvidence.syncHealth, "healthy");
  assert.equal(result.auditEvent.retentionClass, "metadata_only");
  assert.equal(result.auditEvent.decision, "allowed");
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("live readiness blocks missing evidence without scanning or writing", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = assessLiveReadiness(config);

  assert.equal(result.status, "blocked");
  assert.equal(result.readOnlyProofAllowed, false);
  assert.ok(result.reasonCodes.includes("live_backup_root_missing"));
  assert.ok(result.reasonCodes.includes("missing_or_invalid_sync_mechanism"));
  assert.ok(result.reasonCodes.includes("missing_or_unhealthy_sync_status"));
  assert.ok(result.reasonCodes.includes("missing_operator_approval_ref"));
  assert.ok(result.reasonCodes.includes("missing_read_only_proof_approval_ref"));
  assert.ok(result.reasonCodes.includes("missing_source_boundary_ref"));
  assert.ok(result.reasonCodes.includes("missing_safety_review_ref"));
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(existsSync(backupRoot), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("live readiness rejects placeholder evidence and malformed sync timestamps", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  mkdirSync(backupRoot, { recursive: true });
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    sync_mechanism: "obsidian-sync",
    sync_health: "healthy",
    sync_checked_at: "not-a-date",
    operator_approval_ref: "TODO",
    read_only_proof_approval_ref: "REPLACE_ME",
    source_boundary_ref: "{source-boundary-ref}",
    safety_review_ref: "placeholder",
  });

  const result = assessLiveReadiness(config);

  assert.equal(result.status, "blocked");
  assert.equal(result.readOnlyProofAllowed, false);
  assert.ok(result.reasonCodes.includes("missing_sync_checked_at"));
  assert.ok(result.reasonCodes.includes("missing_operator_approval_ref"));
  assert.ok(result.reasonCodes.includes("missing_read_only_proof_approval_ref"));
  assert.ok(result.reasonCodes.includes("missing_source_boundary_ref"));
  assert.ok(result.reasonCodes.includes("missing_safety_review_ref"));
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("live readiness template is redacted and intentionally blocked until completed", () => {
  const template = createLiveReadinessTemplate();
  const normalized = normalizeConfig(template);
  const result = assessLiveReadiness(template);

  assert.equal(template.vault.local_path, "/absolute/path/to/operator-approved/ObsidianVault");
  assert.equal(template.backup.destination, "/absolute/path/outside/vault/kom-backups");
  assert.deepEqual(template.access.excluded, ["01 Dashboard Queue", "09 Archive", "Private", "Personal", "Journal"]);
  assert.equal(template.write_policy.draft_folder, "01 Dashboard Queue/AI Drafts");
  assert.equal(normalized.proposal_queue_folder, "01 Dashboard Queue");
  assert.equal(result.status, "blocked");
  assert.equal(result.readOnlyProofAllowed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.ok(result.reasonCodes.includes("live_vault_path_missing"));
  assert.ok(result.reasonCodes.includes("live_backup_root_missing"));
  assert.ok(result.reasonCodes.includes("missing_or_invalid_sync_mechanism"));
  assert.ok(result.reasonCodes.includes("missing_or_unhealthy_sync_status"));
  assert.ok(result.reasonCodes.includes("missing_sync_checked_at"));
  assert.ok(result.reasonCodes.includes("missing_operator_approval_ref"));
  assert.ok(result.reasonCodes.includes("missing_read_only_proof_approval_ref"));
  assert.ok(result.reasonCodes.includes("missing_source_boundary_ref"));
  assert.ok(result.reasonCodes.includes("missing_safety_review_ref"));
  assert.equal(JSON.stringify(template).includes("/home/"), false);
});

test("live operator handoff packet reports missing evidence without reading or writing", () => {
  const template = createLiveReadinessTemplate();

  const result = createLiveOperatorHandoffPacket(template, {
    config_path: "kom-live-template.json",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.mode, "live_operator_handoff_packet");
  assert.equal(result.readiness.status, "blocked");
  assert.ok(result.reasonCodes.includes("live_readiness_blocked"));
  assert.ok(result.reasonCodes.includes("missing_handoff_note_path"));
  assert.ok(result.reasonCodes.includes("missing_work_item_id"));
  assert.ok(result.reasonCodes.includes("missing_draft_approval_ref"));
  assert.equal(result.commands.find((command) => command.name === "live_readiness").enabled, true);
  assert.equal(result.commands.find((command) => command.name === "live_read_only_proof").enabled, false);
  assert.equal(result.commands.find((command) => command.name === "live_end_to_end_plan").enabled, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.networkEgressAllowed, false);
});

test("live operator handoff packet emits ready command argv after readiness evidence exists", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  mkdirSync(backupRoot, { recursive: true });
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    sync_mechanism: "headless-sync",
    sync_health: "healthy",
    sync_checked_at: "2026-06-26T02:00:00.000Z",
    operator_approval_ref: "approval:operator:live-readiness",
    read_only_proof_approval_ref: "approval:operator:read-only-proof",
    source_boundary_ref: "docs/workflows/live-memory-source-enforcement.md",
    safety_review_ref: "review:kom-safety:ready",
  });

  const result = createLiveOperatorHandoffPacket(config, {
    config_path: "kom-live-ready.json",
    note_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "wi-live-handoff",
    approval_ref: "approval:operator:draft",
    approved_by: "Operator",
  });
  const endToEndCommand = result.commands.find((command) => command.name === "live_end_to_end_plan");

  assert.equal(result.status, "ready");
  assert.equal(result.readiness.status, "ready");
  assert.deepEqual(result.checklist.map((check) => check.status), result.checklist.map(() => "ready"));
  assert.equal(endToEndCommand.enabled, true);
  assert.deepEqual(endToEndCommand.argv, [
    "node",
    "scripts/knx-obsidian-memory.mjs",
    "end-to-end-plan",
    "--config",
    "kom-live-ready.json",
    "--note",
    "00 Inbox/new-customer-insight.md",
    "--work-item-id",
    "wi-live-handoff",
    "--approval-ref",
    "approval:operator:draft",
    "--approved-by",
    "Operator",
    "--live",
  ]);
  assert.equal(result.writePerformed, false);
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("read-only proof returns metadata and proposal preview without writes", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const [note] = listApprovedNotes(config).notes;

  const result = createReadOnlyProof(config, { relative_path: note.relative_path }, { now: new Date("2026-06-25T00:00:00.000Z") });

  assert.equal(result.status, "PASS");
  assert.equal(result.mode, "read_only");
  assert.equal(result.writePerformed, false);
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.noteMetadata.relative_path, "00 Inbox/new-customer-insight.md");
  assert.equal(result.noteMetadata.source_type, "obsidian");
  assert.ok(!("content" in result.noteMetadata));
  assert.equal(result.sourceRef.canonicality, "canonical_human_owned");
  assert.equal(result.proposalPreview.status, "pending_review");
  assert.equal(result.proposalPreview.source_refs[0].path, "00 Inbox/new-customer-insight.md");
  assert.equal(result.dashboardProposal.proposalId, result.proposalPreview.id);
  assert.equal(result.dashboardProposal.status, "pending_human_approval");
  assert.equal(result.dashboardProposal.sourceRefs[0], "obsidian:00 Inbox/new-customer-insight.md");
  assert.equal(result.dashboardProposal.evidenceRefs[0], "evidence:read-only-proof:00 Inbox/new-customer-insight.md");
  assert.equal(result.dashboardProposal.targetVaultFolder, "01 Dashboard Queue/AI Drafts");
  assert.equal(result.dashboardProposal.proposalType, "new_note");
  assert.equal(result.dashboardProposal.sensitivity, "medium");
  assert.equal(result.dashboardProposal.freshness, "fresh");
  assert.equal(result.dashboardProposal.contradictionStatus, "none");
  assert.equal(result.dashboardProposal.confidence, "medium");
  assert.equal(result.dashboardProposal.operatorAction, "defer");
  assert.equal(result.dashboardProposal.writeBackStatus, "review_gated");
  assert.equal(result.dashboardProposal.writeBackAllowed, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("live read-only proof requires live readiness before reading notes", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createLiveReadOnlyProof(config, { relative_path: "00 Inbox/new-customer-insight.md" });

  assert.equal(result.status, "blocked");
  assert.equal(result.mode, "live_read_only");
  assert.equal(result.readOnlyProofAllowed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.noteMetadata, null);
  assert.equal(result.proposalPreview, null);
  assert.equal(result.dashboardProposal, null);
  assert.ok(result.reasonCodes.includes("live_readiness_blocked"));
  assert.ok(result.reasonCodes.includes("live_backup_root_missing"));
  assert.ok(result.reasonCodes.includes("missing_operator_approval_ref"));
  assert.equal(existsSync(backupRoot), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("live read-only proof passes after readiness and stays metadata-only", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  mkdirSync(backupRoot, { recursive: true });
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    sync_mechanism: "obsidian-sync",
    sync_health: "healthy",
    sync_checked_at: "2026-06-26T00:00:00.000Z",
    operator_approval_ref: "approval:operator:live-readiness",
    read_only_proof_approval_ref: "approval:operator:read-only-proof",
    source_boundary_ref: "docs/workflows/live-memory-source-enforcement.md",
    safety_review_ref: "_bmad-output/implementation-artifacts/reviews/kom-safety-review-2026-06-25.md",
  });

  const result = createLiveReadOnlyProof(config, { relative_path: "00 Inbox/new-customer-insight.md" });

  assert.equal(result.status, "PASS");
  assert.equal(result.mode, "live_read_only");
  assert.equal(result.readOnlyProofAllowed, true);
  assert.equal(result.readiness.status, "ready");
  assert.equal(result.noteMetadata.relative_path, "00 Inbox/new-customer-insight.md");
  assert.ok(!("content" in result.noteMetadata));
  assert.equal(result.sourceRef.path, "00 Inbox/new-customer-insight.md");
  assert.equal(result.proposalPreview.status, "pending_review");
  assert.equal(result.dashboardProposal.status, "pending_human_approval");
  assert.equal(result.dashboardProposal.targetVaultFolder, "01 Dashboard Queue/AI Drafts");
  assert.equal(result.dashboardProposal.sensitivity, "medium");
  assert.equal(result.dashboardProposal.freshness, "fresh");
  assert.equal(result.dashboardProposal.contradictionStatus, "none");
  assert.equal(result.dashboardProposal.confidence, "medium");
  assert.equal(result.dashboardProposal.backupRecoveryPath.includes("No mutation performed"), true);
  assert.equal(result.dashboardProposal.writeBackAllowed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.providerCallsAllowed, false);
  assert.equal(result.workerLaunchAllowed, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(result.auditEvent.decision, "allowed");
  assert.equal(result.auditEvent.retentionClass, "metadata_only");
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("read-only proof maps source frontmatter into dashboard proposal metadata", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const notePath = join(vaultRoot, "02 Customers", "metadata-rich.md");
  writeFileSync(
    notePath,
    [
      "---",
      "sensitivity: high",
      "freshness: stale",
      "contradiction_status: possible",
      "confidence: low",
      "---",
      "",
      "# Metadata rich memory",
      "",
      "This note should surface review metadata without source-copy retention.",
      "",
    ].join("\n"),
    "utf8",
  );
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    allowed_read_folders: ["02 Customers"],
  });

  const result = createReadOnlyProof(config, { relative_path: "02 Customers/metadata-rich.md" });

  assert.equal(result.status, "PASS");
  assert.equal(result.sourceRef.freshness, "stale");
  assert.equal(result.sourceRef.contradictionStatus, "possible");
  assert.equal(result.dashboardProposal.sensitivity, "high");
  assert.equal(result.dashboardProposal.freshness, "stale");
  assert.equal(result.dashboardProposal.contradictionStatus, "possible");
  assert.equal(result.dashboardProposal.confidence, "low");
  assert.equal(result.dashboardProposal.writeBackAllowed, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(existsSync(backupRoot), false);
});

test("dashboard proposal persistence plan creates dry-run supervisor request", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "work item/with space",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.mode, "dashboard_proposal_persistence_plan");
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.supervisorRequest.method, "POST");
  assert.equal(result.supervisorRequest.path, "/work-items/work%20item%2Fwith%20space/memory-proposals");
  assert.equal(result.supervisorRequest.body.proposalId, result.dashboardProposal.proposalId);
  assert.equal(result.supervisorRequest.body.writeBackAllowed, false);
  assert.equal(result.proof.dashboardProposal.proposalId, result.dashboardProposal.proposalId);
  assert.equal(result.auditEvent.decision, "planned");
  assert.equal(result.auditEvent.proposalPersisted, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("dashboard proposal persistence plan blocks without work item before reading", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.proof, null);
  assert.equal(result.dashboardProposal, null);
  assert.equal(result.supervisorRequest, null);
  assert.ok(result.reasonCodes.includes("missing_work_item_id"));
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(existsSync(backupRoot), false);
});

test("dashboard proposal persistence approval packet bridges dry-run plan to explicit supervisor approval", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const plan = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "wi-persist-approval",
  });

  const packet = createDashboardProposalPersistenceApprovalPacket(
    plan,
    { approvalRef: "approval:operator:supervisor-persist", approvedBy: "Operator" },
    { now: new Date("2026-06-26T03:00:00.000Z") },
  );

  assert.equal(packet.status, "ready");
  assert.equal(packet.mode, "dashboard_proposal_persistence_approval_packet");
  assert.equal(packet.proposalPersisted, false);
  assert.equal(packet.networkEgressAllowed, false);
  assert.equal(packet.writePerformed, false);
  assert.equal(packet.rawPayloadRetained, false);
  assert.equal(packet.sourceContentCopied, false);
  assert.equal(packet.persistenceApprovalPacket.supervisorRequest.method, "POST");
  assert.equal(packet.persistenceApprovalPacket.supervisorRequest.path, "/work-items/wi-persist-approval/memory-proposals");
  assert.equal(packet.persistenceApprovalPacket.proposalId, plan.dashboardProposal.proposalId);
  assert.equal(packet.persistenceApprovalPacket.writeBackAllowed, false);
  assert.equal(packet.persistenceApprovalPacket.operatorApproval.approvalRef, "approval:operator:supervisor-persist");
  assert.equal(packet.persistenceApprovalPacket.operatorApproval.approvedBy, "Operator");
  assert.equal(packet.persistenceApprovalPacket.operatorApproval.approvedAt, "2026-06-26T03:00:00.000Z");
  assert.equal(packet.auditEvent.decision, "planned");
  assert.equal(packet.auditEvent.proposalPersisted, false);
  assert.equal(packet.auditEvent.networkEgressAllowed, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("dashboard proposal persistence approval packet blocks unsafe plans", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const plan = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "wi-persist-approval",
  });

  const cases = [
    [
      "missing approval",
      plan,
      undefined,
      "missing_persistence_approval_metadata",
    ],
    [
      "not ready",
      { ...plan, status: "blocked" },
      "approval:operator:persist",
      "persistence_plan_not_ready",
    ],
    [
      "write authority",
      {
        ...plan,
        supervisorRequest: {
          ...plan.supervisorRequest,
          body: { ...plan.supervisorRequest.body, writeBackAllowed: true },
        },
      },
      "approval:operator:persist",
      "canonical_write_authority_not_allowed",
    ],
    [
      "raw payload",
      { ...plan, rawContent: "forbidden raw source payload" },
      "approval:operator:persist",
      "raw_payload_retention_requested",
    ],
  ];

  for (const [label, candidate, approvalRef, reasonCode] of cases) {
    const result = createDashboardProposalPersistenceApprovalPacket(candidate, { approvalRef });
    assert.equal(result.status, "blocked", label);
    assert.equal(result.persistenceApprovalPacket, null, label);
    assert.ok(result.reasonCodes.includes(reasonCode), label);
    assert.equal(result.proposalPersisted, false, label);
    assert.equal(result.networkEgressAllowed, false, label);
    assert.equal(result.writePerformed, false, label);
  }
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("dashboard proposal persistence execution plan emits local request argv without network", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const plan = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "wi-persist-execute",
  });
  const approval = createDashboardProposalPersistenceApprovalPacket(plan, {
    approvalRef: "approval:operator:supervisor-persist",
  });

  const execution = createDashboardProposalPersistenceExecutionPlan(approval, {
    supervisorUrl: "http://localhost:8000",
  });

  assert.equal(execution.status, "ready");
  assert.equal(execution.mode, "dashboard_proposal_persistence_execution_plan");
  assert.equal(execution.proposalPersisted, false);
  assert.equal(execution.networkEgressAllowed, false);
  assert.equal(execution.writePerformed, false);
  assert.equal(execution.rawPayloadRetained, false);
  assert.equal(execution.sourceContentCopied, false);
  assert.equal(execution.httpRequest.method, "POST");
  assert.equal(execution.httpRequest.url, "http://localhost:8000/work-items/wi-persist-execute/memory-proposals");
  assert.equal(execution.httpRequest.headers["X-Kendall-Approval-Ref"], "approval:operator:supervisor-persist");
  assert.equal(execution.httpRequest.body.writeBackAllowed, false);
  assert.equal(execution.curlArgv[0], "curl");
  assert.ok(execution.curlArgv.includes("X-Kendall-Authority-Family: memory-writeback-and-source-mutation"));
  assert.ok(execution.curlArgv.includes(JSON.stringify(plan.supervisorRequest.body)));
  assert.equal(execution.auditEvent.decision, "planned");
  assert.equal(execution.auditEvent.proposalPersisted, false);
  assert.equal(execution.auditEvent.networkEgressAllowed, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("dashboard proposal persistence execution plan blocks remote or unsafe packets", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const plan = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "wi-persist-execute",
  });
  const approval = createDashboardProposalPersistenceApprovalPacket(plan, {
    approvalRef: "approval:operator:supervisor-persist",
  });

  const cases = [
    [
      "remote supervisor",
      approval,
      { supervisorUrl: "https://example.com" },
      "unapproved_supervisor_url",
    ],
    [
      "unapproved packet",
      { ...approval.persistenceApprovalPacket, status: "blocked" },
      { supervisorUrl: "http://127.0.0.1:8000" },
      "persistence_approval_packet_not_approved",
    ],
    [
      "raw payload",
      { ...approval, rawContent: "forbidden raw source payload" },
      { supervisorUrl: "http://127.0.0.1:8000" },
      "raw_payload_retention_requested",
    ],
    [
      "write authority",
      {
        ...approval.persistenceApprovalPacket,
        supervisorRequest: {
          ...approval.persistenceApprovalPacket.supervisorRequest,
          body: { ...approval.persistenceApprovalPacket.supervisorRequest.body, writeBackAllowed: true },
        },
      },
      { supervisorUrl: "http://127.0.0.1:8000" },
      "canonical_write_authority_not_allowed",
    ],
  ];

  for (const [label, candidate, options, reasonCode] of cases) {
    const result = createDashboardProposalPersistenceExecutionPlan(candidate, options);
    assert.equal(result.status, "blocked", label);
    assert.equal(result.httpRequest, null, label);
    assert.equal(result.curlArgv, null, label);
    assert.ok(result.reasonCodes.includes(reasonCode), label);
    assert.equal(result.proposalPersisted, false, label);
    assert.equal(result.networkEgressAllowed, false, label);
    assert.equal(result.writePerformed, false, label);
  }
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("live dashboard proposal persistence plan blocks before request when readiness is missing", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createDashboardProposalPersistencePlan(
    config,
    { relative_path: "00 Inbox/new-customer-insight.md", work_item_id: "wi-live" },
    { live: true },
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.mode, "live_dashboard_proposal_persistence_plan");
  assert.equal(result.dashboardProposal, null);
  assert.equal(result.supervisorRequest, null);
  assert.equal(result.proof.status, "blocked");
  assert.equal(result.proof.noteMetadata, null);
  assert.equal(result.proof.dashboardProposal, null);
  assert.ok(result.reasonCodes.includes("proof_not_ready_for_dashboard_persistence"));
  assert.ok(result.reasonCodes.includes("live_readiness_blocked"));
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(existsSync(backupRoot), false);
});

test("draft approval packet bridges approved dashboard proposal to dry-run write gate", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  mkdirSync(backupRoot, { recursive: true });
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const plan = createDashboardProposalPersistencePlan(config, {
    relative_path: "00 Inbox/new-customer-insight.md",
    work_item_id: "wi-draft-approval",
  });
  const approvedProposal = {
    ...plan.dashboardProposal,
    status: "approved",
    operatorAction: "approve",
    writeBackStatus: "approved_for_future",
  };

  const packet = createDraftWriteApprovalPacket(
    approvedProposal,
    { approvalRef: "approval:operator:dashboard-review", approvedBy: "Operator" },
    { now: new Date("2026-06-26T00:00:00.000Z") },
  );
  const dryRun = createApprovedDraftWriteBack(config, packet.approvalPacket);
  const wrapperDryRun = createApprovedDraftWriteBack(config, packet);

  assert.equal(packet.status, "ready");
  assert.equal(packet.writePerformed, false);
  assert.equal(packet.proposalPersisted, false);
  assert.equal(packet.approvalPacket.proposalId, approvedProposal.proposalId);
  assert.equal(packet.approvalPacket.operatorApproval.approvalRef, "approval:operator:dashboard-review");
  assert.equal(packet.approvalPacket.operatorApproval.approvedBy, "Operator");
  assert.equal(packet.approvalPacket.operatorApproval.approvedAt, "2026-06-26T00:00:00.000Z");
  assert.equal(packet.approvalPacket.writeBackAllowed, false);
  assert.equal(dryRun.status, "ready");
  assert.equal(dryRun.writePerformed, false);
  assert.equal(dryRun.backupCreated, false);
  assert.equal(dryRun.auditEvent.approvalRef, "approval:operator:dashboard-review");
  assert.equal(wrapperDryRun.status, "ready");
  assert.equal(wrapperDryRun.writePerformed, false);
  assert.equal(wrapperDryRun.backupCreated, false);
  assert.equal(wrapperDryRun.auditEvent.approvalRef, "approval:operator:dashboard-review");
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("draft write-back wrapper compatibility still rejects raw payload fields", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  mkdirSync(backupRoot, { recursive: true });
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const proposal = approvedMemoryProposalV0();
  const packet = createDraftWriteApprovalPacket(proposal, {
    approvalRef: "approval:operator:dashboard-review",
  });

  const result = createApprovedDraftWriteBack(config, {
    ...packet,
    rawContent: "forbidden raw source payload",
  });

  assert.equal(result.status, "blocked");
  assert.ok(result.reasonCodes.includes("raw_payload_retention_requested"));
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("draft approval packet blocks missing approval and unsafe proposal state", () => {
  const proposal = {
    proposalId: "mp-unsafe",
    label: "Unsafe memory proposal",
    status: "approved",
    summary: "Metadata-only summary.",
    sourceRefs: ["obsidian:source"],
    evidenceRefs: ["evidence:proof"],
    targetVaultFolder: "01 Dashboard Queue/AI Drafts",
    proposalType: "new_note",
    suggestedContentSummary: "Create a dashboard draft.",
    sensitivity: "medium",
    freshness: "fresh",
    contradictionStatus: "none",
    confidence: "medium",
    operatorAction: "approve",
    backupRecoveryPath: "No mutation performed.",
    writeBackStatus: "approved_for_future",
    writeBackAllowed: false,
  };

  const cases = [
    ["missing approval", proposal, undefined, "missing_approval_metadata"],
    ["placeholder approval", proposal, "REPLACE_WITH_APPROVAL", "missing_approval_metadata"],
    ["not approved", { ...proposal, status: "pending_human_approval" }, "approval:operator:test", "missing_approved_status"],
    ["stale", { ...proposal, freshness: "stale" }, "approval:operator:test", "unsafe_source_freshness"],
    ["contradiction", { ...proposal, contradictionStatus: "confirmed" }, "approval:operator:test", "unsafe_source_contradiction"],
    ["write authority", { ...proposal, writeBackAllowed: true }, "approval:operator:test", "canonical_write_authority_not_allowed"],
  ];

  for (const [label, candidate, approvalRef, reasonCode] of cases) {
    const result = createDraftWriteApprovalPacket(candidate, { approvalRef });
    assert.equal(result.status, "blocked", label);
    assert.equal(result.approvalPacket, null, label);
    assert.ok(result.reasonCodes.includes(reasonCode), label);
    assert.equal(result.writePerformed, false, label);
    assert.equal(result.proposalPersisted, false, label);
  }
});

test("end-to-end memory plan proves dry-run proposal and draft gates without writes", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createEndToEndMemoryPlan(
    config,
    {
      relative_path: "00 Inbox/new-customer-insight.md",
      work_item_id: "wi-end-to-end",
      approval_ref: "approval:operator:end-to-end",
      approved_by: "Operator",
    },
    { now: new Date("2026-06-26T01:00:00.000Z") },
  );

  assert.equal(result.status, "ready");
  assert.equal(result.mode, "end_to_end_memory_plan");
  assert.deepEqual(result.steps.map((step) => [step.name, step.status]), [
    ["dashboard_proposal_persistence_plan", "ready"],
    ["draft_approval_packet", "ready"],
    ["approved_draft_write_dry_run", "ready"],
  ]);
  assert.equal(result.persistencePlan.supervisorRequest.path, "/work-items/wi-end-to-end/memory-proposals");
  assert.equal(result.draftApprovalPacket.approvalPacket.operatorApproval.approvalRef, "approval:operator:end-to-end");
  assert.equal(result.draftWriteDryRun.status, "ready");
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.auditEvent.decision, "planned");
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("live end-to-end memory plan blocks at readiness before note proof", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const result = createEndToEndMemoryPlan(
    config,
    {
      relative_path: "00 Inbox/new-customer-insight.md",
      work_item_id: "wi-live-end-to-end",
      approval_ref: "approval:operator:end-to-end",
    },
    { live: true },
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.mode, "live_end_to_end_memory_plan");
  assert.deepEqual(result.steps.map((step) => [step.name, step.status]), [["live_readiness", "blocked"]]);
  assert.ok(result.reasonCodes.includes("live_readiness_blocked"));
  assert.equal(result.persistencePlan, null);
  assert.equal(result.draftApprovalPacket, null);
  assert.equal(result.draftWriteDryRun, null);
  assert.equal(result.proposalPersisted, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("read-only proof blocks excluded traversal and missing source paths", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const cases = [
    ["excluded", "Private/do-not-read.md", "excluded_source"],
    ["traversal", "../Private/do-not-read.md", "unknown_source"],
    ["missing", "00 Inbox/missing.md", "missing_source"],
  ];

  for (const [label, relativePath, reasonCode] of cases) {
    const result = createReadOnlyProof(config, { relative_path: relativePath });
    assert.equal(result.status, "blocked", label);
    assert.ok(result.reasonCodes.includes(reasonCode), label);
    assert.equal(result.proposalPreview, null, label);
    assert.equal(result.dashboardProposal, null, label);
    assert.equal(result.writePerformed, false, label);
    assert.equal(result.proposalPersisted, false, label);
  }
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
  assert.equal(existsSync(backupRoot), false);
});

test("queue folder cannot be configured as readable", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    allowed_read_folders: ["00 Inbox", "01 Dashboard Queue"],
  });

  const result = validateConfig(config);

  assert.equal(result.status, "FAIL");
  assert.ok(result.findings.some((finding) => finding.code === "queue-folder-readable"));
});

test("queue folder aliases cannot be configured as readable", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    allowed_read_folders: ["00 Inbox", "01 Dashboard Queue/."],
    excluded_folders: ["Private"],
  });

  const result = validateConfig(config);

  assert.equal(result.status, "FAIL");
  assert.ok(result.findings.some((finding) => finding.code === "queue-folder-readable"));
  assert.ok(result.findings.some((finding) => finding.code === "queue-folder-not-excluded"));
});

test("vault folder config rejects traversal", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
    allowed_read_folders: ["00 Inbox", "../Private"],
  });

  const result = validateConfig(config);

  assert.equal(result.status, "FAIL");
  assert.ok(result.findings.some((finding) => finding.code === "unsafe-vault-folder"));
});

test("draft write-back requires approval", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const [note] = listApprovedNotes(config).notes;
  const proposal = createMemoryProposal(config, note);

  assert.throws(() => writeApprovedDraft(config, proposal), /approved/);

  const approved = approveProposal(proposal);
  const draft = writeApprovedDraft(config, approved);
  assert.match(draft.relative_path, /^01 Dashboard Queue\/AI Drafts\//);
  assert.ok(existsSync(draft.backup.backup_path));
});

test("draft write-back rejects unsafe proposal ids", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const [note] = listApprovedNotes(config).notes;
  const proposal = approveProposal({
    ...createMemoryProposal(config, note),
    id: "x/../../../outside",
  });

  assert.throws(() => writeApprovedDraft(config, proposal), /proposal id/i);
});

test("review-gated draft write-back writes metadata-only AI draft with backup and audit evidence", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });
  const proposal = approvedMemoryProposalV0();

  const dryRun = createApprovedDraftWriteBack(config, proposal);
  assert.equal(dryRun.status, "ready");
  assert.equal(dryRun.writePerformed, false);
  assert.equal(dryRun.backupCreated, false);
  assert.equal(dryRun.target.relativePath, "01 Dashboard Queue/AI Drafts/memory-proposal-approved-for-ai-draft-mp-20260625T010203Z.md");

  const result = createApprovedDraftWriteBack(config, proposal, { apply: true, now: new Date("2026-06-25T01:03:00.000Z") });
  assert.equal(result.status, "PASS");
  assert.equal(result.writePerformed, true);
  assert.equal(result.backupCreated, true);
  assert.equal(result.rawPayloadRetained, false);
  assert.equal(result.sourceContentCopied, false);
  assert.equal(result.canonicalMutationAllowed, false);
  assert.equal(result.sourceMutationAllowed, false);
  assert.equal(result.providerCallsAllowed, false);
  assert.equal(result.workerLaunchAllowed, false);
  assert.equal(result.githubCallsAllowed, false);
  assert.equal(result.networkEgressAllowed, false);
  assert.match(result.draft.relative_path, /^01 Dashboard Queue\/AI Drafts\//);
  assert.ok(existsSync(result.backup.backup_path));
  assert.ok(result.rollback.manualRecovery.includes(result.draft.relative_path));
  assert.equal(result.auditEvent.authorityFamily, "memory-writeback-and-source-mutation");
  assert.equal(result.auditEvent.retentionClass, "metadata_only");

  const draftContent = readFileSync(result.draft.draft_path, "utf8");
  assert.match(draftContent, /author: Kendall/);
  assert.match(draftContent, /status: ai-draft/);
  assert.match(draftContent, /proposal_id: mp-20260625T010203Z/);
  assert.match(draftContent, /approval_ref: approval:operator:m3/);
  assert.match(draftContent, /raw_payload_retained: false/);
  assert.match(draftContent, /source_content_copied: false/);
  assert.match(draftContent, /obsidian:00-inbox-new-customer-insight/);
  assert.match(draftContent, /evidence:read-only-proof/);
  assert.doesNotMatch(draftContent, /Future follow-up should include/);
});

test("review-gated draft write-back blocks unsafe proposals without mutation", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const config = createDefaultConfig({
    vault_root: vaultRoot,
    backup_root: backupRoot,
  });

  const blockedCases = [
    approvedMemoryProposalV0({ operatorApproval: undefined }),
    approvedMemoryProposalV0({ status: "pending_human_approval" }),
    approvedMemoryProposalV0({ sourceRefs: [] }),
    approvedMemoryProposalV0({ targetVaultFolder: "05 Decisions" }),
    approvedMemoryProposalV0({ targetVaultPath: "05 Decisions/outside.md" }),
    approvedMemoryProposalV0({ writeBackAllowed: true }),
    approvedMemoryProposalV0({ rawContent: "raw source note text" }),
    approvedMemoryProposalV0({ proposalId: "../outside" }),
    approvedMemoryProposalV0({ freshness: "stale" }),
    approvedMemoryProposalV0({ contradictionStatus: "confirmed" }),
  ];

  for (const proposal of blockedCases) {
    const result = createApprovedDraftWriteBack(config, proposal, { apply: true });
    assert.equal(result.status, "blocked");
    assert.equal(result.writePerformed, false);
    assert.equal(result.backupCreated, false);
  }

  assert.equal(existsSync(backupRoot), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});

test("review-gated draft write-back blocks config concerns before backup or draft writes", () => {
  const workDir = mkdtempSync(join(tmpdir(), "kom-test-"));
  const { vaultRoot, backupRoot } = createSyntheticVault(workDir);
  const missingVaultRoot = join(workDir, "missing-vault");
  const config = createDefaultConfig({
    vault_root: missingVaultRoot,
    backup_root: backupRoot,
  });

  const result = createApprovedDraftWriteBack(config, approvedMemoryProposalV0(), { apply: true });

  assert.equal(result.status, "blocked");
  assert.ok(result.reasonCodes.includes("vault-root-missing"));
  assert.equal(result.writePerformed, false);
  assert.equal(result.backupCreated, false);
  assert.equal(existsSync(backupRoot), false);
  assert.equal(existsSync(join(vaultRoot, "01 Dashboard Queue", "AI Drafts")), false);
});
