import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  approveProposal,
  createDefaultConfig,
  createMemoryProposal,
  createSyntheticVault,
  listApprovedNotes,
  runSyntheticValidation,
  validateConfig,
  writeApprovedDraft,
} from "../scripts/lib/knx-obsidian-memory.mjs";

test("synthetic validation proves the v1 memory loop", () => {
  const result = runSyntheticValidation({ workDir: mkdtempSync(join(tmpdir(), "kom-test-")) });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.approved_notes, ["00 Inbox/new-customer-insight.md"]);
  assert.equal(result.proposal.status, "pending_review");
  assert.match(result.draft.relative_path, /^01 Dashboard Queue\/AI Drafts\//);
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
