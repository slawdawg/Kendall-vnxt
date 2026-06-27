import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BLOCKED_AUTHORITY_FAMILIES,
  REQUIRED_DRY_RUN_PACKET_FIELDS,
  REQUIRED_STOP_LINES,
  evaluateStatusEvents,
  renderDryRunReport,
  validateDryRunPacket,
  validateToolReadinessProbe,
} from "../scripts/lib/governed-worker-execution-dry-run.mjs";
import { precheckGovernedWorkerExecutionDryRun } from "../scripts/check-governed-worker-execution-dry-run.mjs";

const fixtureBase = new URL("./fixtures/governed-worker-execution-dry-run/", import.meta.url);
const validatorSourcePath = new URL("../scripts/lib/governed-worker-execution-dry-run.mjs", import.meta.url);
const packageJsonPath = new URL("../package.json", import.meta.url);
const checkWrapperPath = new URL("../scripts/check-governed-worker-execution-dry-run.mjs", import.meta.url);

const deniedFixtureExpectations = Object.freeze([
  {
    fixtureName: "denied-live-launch.json",
    reason: "invalid_mode",
    authorityFamily: "worker-process-launch",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Exact worker launch approval",
  },
  {
    fixtureName: "denied-session-inheritance.json",
    reason: "session_inheritance_requested",
    authorityFamily: "session-inheritance",
    sourcePolicy: "docs/workflows/execution-authority-boundary.md",
    futureApprovalRequired: "Session approval naming account and repo context",
  },
  {
    fixtureName: "denied-network.json",
    reason: "network_requested",
    authorityFamily: "worker-network-or-session",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Worker-specific network/session approval naming Claude or Hermes",
  },
  {
    fixtureName: "denied-source-mutation.json",
    reason: "source_mutation_requested",
    authorityFamily: "worker-source-mutation",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Source mutation approval naming worker, task, paths, and diff limits",
  },
  {
    fixtureName: "denied-raw-retention.json",
    reason: "raw_evidence_retention_requested",
    authorityFamily: "raw-failure-retention",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Raw-failure-retention approval",
  },
  {
    fixtureName: "denied-delivery.json",
    reason: "delivery_requested",
    authorityFamily: "github-delivery",
    sourcePolicy: "docs/workflows/execution-authority-boundary.md",
    futureApprovalRequired: "Delivery approval through existing PR guardrails",
  },
  {
    fixtureName: "denied-cleanup.json",
    reason: "cleanup_requested",
    authorityFamily: "cleanup-automation",
    sourcePolicy: "docs/workflows/execution-authority-boundary.md",
    futureApprovalRequired: "Target-specific cleanup approval",
  },
  {
    fixtureName: "denied-adaptive-trust.json",
    reason: "adaptive_trust_effect_requested",
    authorityFamily: "adaptive-scoring",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Adaptive-scoring approval",
  },
  {
    fixtureName: "denied-live-status.json",
    reason: "live_status_requested",
    authorityFamily: "worker-process-launch",
    sourcePolicy: "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
    futureApprovalRequired: "Exact live-launch approval with lifecycle controls",
  },
  {
    fixtureName: "denied-observed-text-authority.json",
    reason: "observed_text_authority_requested",
    authorityFamily: "source-policy-boundary",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Explicit operator approval or active source-owned policy update",
  },
  {
    fixtureName: "denied-command-shell-string.json",
    reason: "invalid_command_allowlist",
    authorityFamily: "worker-command-execution",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Worker command execution approval",
  },
  {
    fixtureName: "denied-command-transitive-effects.json",
    reason: "invalid_command_allowlist",
    authorityFamily: "worker-command-execution",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Worker command execution approval",
  },
  {
    fixtureName: "denied-path-escape.json",
    reason: "path_escape",
    authorityFamily: "worker-source-mutation",
    sourcePolicy: "docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md",
    futureApprovalRequired: "Source mutation approval with workspace/path boundary proof",
  },
  {
    fixtureName: "denied-worker-shadow-delivery-exposure.json",
    reason: "worker_shadow_delivery_exposed",
    authorityFamily: "github-delivery",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Delivery approval through existing PR guardrails",
  },
]);

function sorted(value) {
  return [...value].sort();
}

async function readFixture(name) {
  const text = await readFile(new URL(name, fixtureBase), "utf8");
  return JSON.parse(text);
}

test("accepted Claude and Hermes dry-run fixtures validate with metadata-only result fields", async () => {
  const fixtureNames = ["claude-dry-run-ok.json", "hermes-dry-run-ok.json"];

  for (const fixtureName of fixtureNames) {
    const packet = await readFixture(fixtureName);
    const result = validateDryRunPacket(packet);

    assert.equal(result.ok, true, `${fixtureName} should validate`);
    assert.equal(result.packet_id, packet.packet_id);
    assert.equal(result.worker, packet.worker);
    assert.equal(result.mode, "dry_run");
    assert.equal(result.authority_level, packet.authority_level);
    assert.deepEqual(result.denied_reasons, []);
    assert.deepEqual(result.field_reasons, []);
    assert.deepEqual(sorted(packet.stop_lines), sorted(REQUIRED_STOP_LINES));
    assert.deepEqual(sorted(result.blocked_operations), sorted(BLOCKED_AUTHORITY_FAMILIES));
    assert.ok(result.evidence_refs.length > 0, "evidence refs should be retained as metadata");
    assert.ok(result.status_events.length > 0, "status events should be retained as metadata");
  }
});

test("real tool readiness probes validate metadata-only availability without launch authority", () => {
  for (const probe of [
    {
      probe_id: "probe:claude-readiness",
      worker: "claude",
      mode: "readiness_only",
      authority_level: "non_executing",
      readiness_state: "available",
      command_resolution: "operator_shell_observation",
      command_path: "/usr/local/bin/claude",
      command_version: "2.1.179 Claude Code",
      observed_at: "2026-06-27T00:00:00Z",
      evidence_ref: "metadata:worker-readiness/claude",
      network_required: false,
      session_inheritance_required: false,
      credential_access_required: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
      launch_attempted: false,
    },
    {
      probe_id: "probe:hermes-readiness",
      worker: "hermes",
      mode: "readiness_only",
      authority_level: "non_executing",
      readiness_state: "missing",
      command_resolution: "fixture",
      command_path: null,
      command_version: null,
      observed_at: "2026-06-27T00:00:00Z",
      evidence_ref: "metadata:worker-readiness/hermes",
      network_required: false,
      session_inheritance_required: false,
      credential_access_required: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
      launch_attempted: false,
    },
  ]) {
    const result = validateToolReadinessProbe(probe);
    assert.equal(result.ok, true, `${probe.worker} readiness probe should validate`);
    assert.equal(result.mode, "readiness_only");
    assert.equal(result.authority_level, "non_executing");
    assert.equal(result.readiness_state, probe.readiness_state);
    assert.equal(result.evidence_ref, probe.evidence_ref);
    assert.deepEqual(result.denied_reasons, []);
  }
});

test("real tool readiness probes fail closed for launch session network raw retention or trust effects", () => {
  const baseProbe = {
    probe_id: "probe:claude-readiness",
    worker: "claude",
    mode: "readiness_only",
    authority_level: "non_executing",
    readiness_state: "available",
    command_resolution: "operator_shell_observation",
    command_path: "/usr/local/bin/claude",
    command_version: "2.1.179 Claude Code",
    observed_at: "2026-06-27T00:00:00Z",
    evidence_ref: "metadata:worker-readiness/claude",
    network_required: false,
    session_inheritance_required: false,
    credential_access_required: false,
    raw_output_retained: false,
    affects_trust: false,
    affects_routing: false,
    launch_attempted: false,
  };

  for (const [field, value] of [
    ["mode", "dry_run"],
    ["authority_level", "write"],
    ["readiness_state", "running_live_worker"],
    ["command_resolution", "path_lookup"],
    ["command_path", "claude"],
    ["command_path", null],
    ["command_version", null],
    ["command_version", "raw_prompt sk-proj-123456789"],
    ["evidence_ref", "raw_prompt: sk-proj-123456789"],
    ["network_required", true],
    ["session_inheritance_required", true],
    ["credential_access_required", true],
    ["raw_output_retained", true],
    ["affects_trust", true],
    ["affects_routing", true],
    ["launch_attempted", true],
  ]) {
    const result = validateToolReadinessProbe({ ...baseProbe, [field]: value });
    assert.equal(result.ok, false, `${field} should fail readiness validation`);
    assert.ok(
      result.field_reasons.some((reason) => reason.reason === "invalid_tool_readiness_probe"),
      `${field} should produce invalid_tool_readiness_probe`,
    );
    assert.ok(
      result.denial_details.some((detail) => detail.authority_family === "worker-command-execution"),
      `${field} should retain command-execution denial details`,
    );
  }

  for (const field of [
    "command_path",
    "command_version",
    "network_required",
    "session_inheritance_required",
    "credential_access_required",
    "raw_output_retained",
    "affects_trust",
    "affects_routing",
    "launch_attempted",
  ]) {
    const probe = { ...baseProbe };
    delete probe[field];
    const result = validateToolReadinessProbe(probe);
    assert.equal(result.ok, false, `${field} must be explicit readiness metadata`);
    assert.ok(result.field_reasons.some((reason) => reason.field === field));
  }

  for (const probe of [
    { ...baseProbe, readiness_state: "missing", command_path: "/usr/local/bin/claude", command_version: null },
    { ...baseProbe, readiness_state: "missing", command_path: null, command_version: "2.1.179 Claude Code" },
  ]) {
    const result = validateToolReadinessProbe(probe);
    assert.equal(result.ok, false, "missing readiness cannot retain command path or version proof");
    assert.ok(result.field_reasons.some((reason) => reason.field === "readiness_state"));
  }

  const rawIdentityResult = validateToolReadinessProbe({ ...baseProbe, probe_id: "probe:sk-proj-123456789" });
  assert.equal(rawIdentityResult.ok, false);
  assert.equal(rawIdentityResult.probe_id, null);
  assert.equal(rawIdentityResult.worker, "claude");
  assert.equal(rawIdentityResult.mode, "readiness_only");
  assert.equal(rawIdentityResult.authority_level, "non_executing");

  const rawWorkerResult = validateToolReadinessProbe({ ...baseProbe, worker: "sk-proj-123456789" });
  assert.equal(rawWorkerResult.ok, false);
  assert.equal(rawWorkerResult.worker, null);
  assert.equal(rawWorkerResult.probe_id, "probe:claude-readiness");
});

test("accepted packets fail closed when safety policy fields request live authority", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const [field, value, expectedReason, overrides = {}] of [
    ["network_policy", { requested: true }, "network_requested"],
    ["session_policy", { inheritance_requested: true }, "session_inheritance_requested"],
    ["evidence_policy", { retention: "raw", raw_payload_retained: true }, "raw_evidence_retention_requested"],
    ["review_requirement", "skip_review", "invalid_review_requirement"],
    ["status_events", [{ ...packet.status_events[0], state: "running_live_worker" }], "live_status_requested"],
    ["stop_lines", ["no provider calls"], "missing_required_stop_line"],
    ["blocked_operations", ["worker-process-launch"], "missing_blocked_authority_family"],
    ["evidence_refs", [], "missing_evidence_refs"],
  ]) {
    const result = validateDryRunPacket({ ...packet, [field]: value });
    assert.equal(result.ok, false, `${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((reason) => reason.field === field && reason.reason === expectedReason),
      `${field} should produce ${expectedReason}`,
    );
  }
});

test("command allowlist entries must remain model-only canonical argument arrays", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const command_allowlist of [
    ["node --test tests/governed-worker-execution-dry-run.test.mjs"],
    [{ argv: "node --test tests/governed-worker-execution-dry-run.test.mjs", model_only: true }],
    [{ argv: ["/usr/bin/node"], model_only: false }],
    [{ argv: ["node", "--test"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/bin/sh", "-c", "node --test tests/governed-worker-execution-dry-run.test.mjs"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/claude", "--dangerously-skip-permissions"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/curl", "https://example.invalid"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/gh", "pr", "merge"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/node", "--api-key=sk-proj-123456789"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/node", "--test", "tests/*.test.mjs"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/node"], model_only: true, transitive_effects: ["network"] }],
  ]) {
    const result = validateDryRunPacket({ ...packet, command_allowlist });
    assert.equal(result.ok, false);
    assert.ok(
      result.field_reasons.some((reason) => reason.field === "command_allowlist" && reason.reason === "invalid_command_allowlist"),
    );
  }
});

test("reviewed safety gaps fail closed with explicit denial details", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const [event] = packet.status_events;

  for (const [field, value, expectedReason, overrides = {}] of [
    ["evidence_policy", "raw provider_payload sk-proj-123456789", "raw_evidence_retention_requested"],
    ["environment_allowlist", ["GITHUB_TOKEN"], "environment_secret_requested"],
    ["environment_allowlist", [{ name: "OPENAI_API_KEY", value: "sk-proj-123456789" }], "environment_secret_requested"],
    ["status_events", [{ ...event, sequence: 2 }, { ...event, sequence: 1 }], "non_monotonic_status_events"],
    ["status_events", [{ ...event, mode: "live" }], "unsafe_status_event_payload"],
    ["status_events", [{ ...event, authority_level: "write" }], "unsafe_status_event_payload"],
    ["status_events", [{ ...event, next_action: "finish-pr" }], "unsafe_status_event_payload"],
    ["status_events", [{ ...event, evidence_ref: "raw_prompt: sk-proj-123456789" }], "unsafe_status_event_payload"],
    ["allowed_file_scopes", [".git/config"], "protected_scope_requested"],
    ["allowed_file_scopes", [".env"], "protected_scope_requested"],
    ["allowed_file_scopes", ["node_modules/pkg"], "protected_scope_requested"],
    ["task_class", "provider_payload", "invalid_packet_metadata"],
    ["task_class", "sk-proj-123456789", "invalid_packet_metadata"],
    ["base_sha", "not-a-sha", "invalid_packet_metadata"],
    ["expiry_or_review_point", "2000-01-01T00:00:00Z", "invalid_packet_metadata"],
    ["delivery_policy", "finish-pr", "delivery_requested"],
    ["delivery_policy", { pr_creation_requested: false, merge_requested: false, operations: ["merge"] }, "merge_requested"],
    ["network_policy", { requested: false, endpoints: ["https://api.openai.com"] }, "network_requested"],
    ["session_policy", { inheritance_requested: false, sessions: ["github"] }, "session_inheritance_requested"],
    ["source_mutation_policy", { requested: false, operations: ["writeFile"] }, "source_mutation_requested"],
    ["stop_lines", [...REQUIRED_STOP_LINES, "provider calls approved"], "missing_required_stop_line"],
    [
      "retry_policy",
      { max_attempts: 3, rca_required: false },
      "invalid_retry_policy",
      { status_events: [{ ...event, state: "unknown" }] },
    ],
  ]) {
    const result = validateDryRunPacket({ ...packet, ...overrides, [field]: value });
    assert.equal(result.ok, false, `${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((fieldReason) => fieldReason.field === field && fieldReason.reason === expectedReason),
      `${field} should produce ${expectedReason}`,
    );
    assert.ok(
      result.denial_details.some((detail) => detail.reason === expectedReason && detail.future_approval_required.length > 0),
      `${field} should include denial details for ${expectedReason}`,
    );
  }
});

test("blocked authority and boundary fixtures fail closed with stable denial details", async () => {
  for (const expectation of deniedFixtureExpectations) {
    const { fixtureName, reason, authorityFamily, sourcePolicy, futureApprovalRequired } = expectation;
    const packet = await readFixture(fixtureName);
    const result = validateDryRunPacket(packet);

    assert.equal(result.ok, false, `${fixtureName} should fail validation`);
    assert.ok(Array.isArray(result.denial_details), `${fixtureName} should include denial_details`);
    assert.ok(result.denial_details.length > 0, `${fixtureName} should include at least one denial detail`);
    const matchingDetail = result.denial_details.find((detail) => detail.reason === reason);
    assert.ok(matchingDetail, `${fixtureName} should include ${reason}`);
    assert.equal(matchingDetail.authority_family, authorityFamily);
    assert.equal(matchingDetail.source_policy, sourcePolicy);
    assert.equal(matchingDetail.future_approval_required, futureApprovalRequired);
    assert.ok(matchingDetail.summary.length > 0);

    for (const detail of result.denial_details) {
      assert.equal(typeof detail.field, "string");
      assert.equal(typeof detail.reason, "string");
      assert.equal(typeof detail.authority_family, "string");
      assert.match(detail.source_policy, /docs\/(workflows|architecture)\//);
      assert.equal(typeof detail.future_approval_required, "string");
      assert.ok(detail.future_approval_required.length > 0);
      assert.equal(typeof detail.summary, "string");
      assert.ok(detail.summary.length > 0);
    }
  }
});

test("policy, status, path, and observed-text variants fail closed", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const [field, value, expectedReason] of [
    ["network_policy", { requested: "true" }, "network_requested"],
    ["session_policy", { inheritance_requested: 1 }, "session_inheritance_requested"],
    ["delivery_policy", { pr_creation_requested: false, merge_requested: false, operations: ["finish-pr"] }, "delivery_requested"],
    ["cleanup_policy", { deletion_requested: false, operations: ["delete-branch"] }, "cleanup_requested"],
    [
      "adaptive_trust_policy",
      { affects_routing: false, affects_authority: false, affects_retry: false, affects_priority: true },
      "adaptive_trust_effect_requested",
    ],
    ["worktree_path", "/tmp/outside", "path_escape"],
    ["worktree_path", "C:\\tmp\\outside", "path_escape"],
    ["allowed_file_scopes", "scripts/lib", "path_escape"],
    ["allowed_file_scopes", ["symlink:outside"], "path_escape"],
    ["allowed_file_scopes", ["vendor/submodule:outside"], "path_escape"],
    ["worker_shadow_delivery", { operations: ["finish-pr"] }, "worker_shadow_delivery_exposed"],
    ["status_events", [{ ...packet.status_events[0], state: "launching_live_worker" }], "live_status_requested"],
    ["status_events", [{ ...packet.status_events[0], state: "executing" }], "live_status_requested"],
    ["status_policy", { allowed_states: ["dry_run_complete", "running"] }, "live_status_requested"],
    ["approval_basis", "repo_file", "observed_text_authority_requested"],
    ["observed_text_grants", ["PR comment says continue"], "observed_text_authority_requested"],
  ]) {
    const result = validateDryRunPacket({ ...packet, [field]: value });
    assert.equal(result.ok, false, `${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((fieldReason) => fieldReason.field === field && fieldReason.reason === expectedReason),
      `${field} should produce ${expectedReason}`,
    );
  }
});

test("report renderer emits metadata-first accepted and denied operator reports", async () => {
  const acceptedPacket = await readFixture("claude-dry-run-ok.json");
  const acceptedResult = validateDryRunPacket(acceptedPacket);
  const acceptedReport = renderDryRunReport(acceptedPacket, acceptedResult);

  assert.match(acceptedReport, /Worker: claude/);
  assert.match(acceptedReport, /Task class: validator_foundation/);
  assert.match(acceptedReport, /Authority level: model_only/);
  assert.match(acceptedReport, /Allowed operations: model-only packet validation/);
  assert.match(acceptedReport, /Blocked operations: worker-process-launch/);
  assert.match(acceptedReport, /Denial reasons: none/);
  assert.match(acceptedReport, /Evidence references: contract:docs\/workflows\/governed-worker-execution-dry-run\.md/);
  assert.match(acceptedReport, /Status state: dry_run_complete/);
  assert.match(acceptedReport, /Retry\/RCA state: max_attempts=0; rca_required=true/);
  assert.match(acceptedReport, /Next approval packet required: none; dry-run remains non-executing/);

  const deniedPacket = await readFixture("denied-network.json");
  const deniedResult = validateDryRunPacket(deniedPacket);
  const deniedReport = renderDryRunReport(deniedPacket, deniedResult);

  assert.match(deniedReport, /Worker: claude/);
  assert.match(deniedReport, /Denial reasons: network_requested/);
  assert.match(
    deniedReport,
    /Next approval packet required: worker-network-or-session: Worker-specific network\/session approval naming Claude or Hermes/,
  );
});

test("raw evidence markers are rejected and quarantined in reports", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const rawEvidenceRef = "raw_prompt: actual-sk-proj-123456789 provider_payload transcript";
  const result = validateDryRunPacket({ ...packet, evidence_refs: [rawEvidenceRef] });
  const report = renderDryRunReport({ ...packet, evidence_refs: [rawEvidenceRef] }, result);

  assert.equal(result.ok, false);
  assert.ok(
    result.field_reasons.some((fieldReason) => {
      return fieldReason.field === "evidence_refs" && fieldReason.reason === "raw_evidence_retention_requested";
    }),
  );
  assert.match(report, /\[quarantined-evidence-ref\]/);
  assert.doesNotMatch(report, /actual-sk-proj-123456789/);
  assert.doesNotMatch(report, /provider_payload transcript/);

  for (const evidenceRef of ["plain-short-ref", "sk-proj-123456789", "Authorization: Bearer abc123", "-----BEGIN PRIVATE KEY-----"]) {
    const evidenceResult = validateDryRunPacket({ ...packet, evidence_refs: [evidenceRef] });
    assert.equal(evidenceResult.ok, false, `${evidenceRef} should fail evidence validation`);
    assert.ok(evidenceResult.field_reasons.some((fieldReason) => fieldReason.reason === "raw_evidence_retention_requested"));
  }

  const rawPolicyResult = validateDryRunPacket({
    ...packet,
    evidence_policy: { retention: "metadata_only", raw_payload_retained: false, provider_payload: "raw" },
  });
  assert.equal(rawPolicyResult.ok, false);
  assert.ok(rawPolicyResult.field_reasons.some((fieldReason) => fieldReason.field === "evidence_policy"));
});

test("status event ordering ignores stale events and denies live states", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const [event] = packet.status_events;
  const evaluation = evaluateStatusEvents([
    { ...event, sequence: 2, state: "validating" },
    { ...event, sequence: 1, state: "queued" },
    { ...event, sequence: 3, state: "dry_run_complete" },
    { ...event, sequence: 4, state: "running_live_worker" },
    { ...event, sequence: Number.NaN, state: "queued" },
    { ...event, sequence: 5, state: "raw_prompt: sk-proj-123456789" },
  ]);

  assert.deepEqual(
    evaluation.ordered_events.map((statusEvent) => statusEvent.sequence),
    [2, 3],
  );
  assert.deepEqual(
    evaluation.ignored_stale_events.map((statusEvent) => statusEvent.sequence),
    [1],
  );
  assert.deepEqual(
    evaluation.denied_live_events.map((statusEvent) => statusEvent.sequence),
    [4],
  );
  assert.equal(evaluation.ignored_malformed_events.length, 2);
  assert.equal(evaluation.latest_event.state, "dry_run_complete");
  assert.equal(evaluation.latest_denied_event.state, "running_live_worker");

  const multiRunEvaluation = evaluateStatusEvents([
    { ...event, run_id: "run-a", sequence: 2, state: "dry_run_complete" },
    { ...event, run_id: "run-b", sequence: 1, state: "queued" },
  ]);
  assert.deepEqual(
    multiRunEvaluation.ordered_events.map((statusEvent) => `${statusEvent.run_id}:${statusEvent.sequence}`),
    ["run-a:2", "run-b:1"],
  );
  assert.deepEqual(multiRunEvaluation.ignored_stale_events, []);

  const liveResult = validateDryRunPacket({
    ...packet,
    status_events: [{ ...event, sequence: 1, state: "running_live_worker" }],
  });
  assert.equal(liveResult.ok, false);
  assert.ok(liveResult.field_reasons.some((fieldReason) => fieldReason.reason === "live_status_requested"));

  const malformedResult = validateDryRunPacket({
    ...packet,
    status_events: [{ ...event, sequence: Number.NaN, state: "queued" }],
  });
  assert.equal(malformedResult.ok, false);
  assert.ok(malformedResult.field_reasons.some((fieldReason) => fieldReason.reason === "invalid_status_state"));

  const staleResult = validateDryRunPacket({
    ...packet,
    status_events: [
      { ...event, sequence: 2, state: "validating" },
      { ...event, sequence: 2, state: "dry_run_complete" },
    ],
  });
  assert.equal(staleResult.ok, false);
  assert.ok(staleResult.field_reasons.some((fieldReason) => fieldReason.reason === "non_monotonic_status_events"));
});

test("report renderer uses canonical metadata instead of raw packet fields", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const rawMarker = "raw_prompt: sk-proj-123456789 transcript provider_payload";
  const mutated = {
    ...packet,
    worker: rawMarker,
    task_class: rawMarker,
    retry_policy: { max_attempts: rawMarker, rca_required: true },
    blocked_operations: [...BLOCKED_AUTHORITY_FAMILIES, rawMarker],
  };
  const result = validateDryRunPacket(mutated);
  const report = renderDryRunReport(mutated, result);

  assert.equal(result.ok, false);
  assert.ok(result.field_reasons.some((fieldReason) => fieldReason.field === "blocked_operations"));
  assert.match(report, /Worker: unknown/);
  assert.match(report, /Task class: unknown/);
  assert.match(report, /Retry\/RCA state: max_attempts=unknown; rca_required=true/);
  assert.match(report, /Blocked operations: worker-process-launch/);
  assert.doesNotMatch(report, /sk-proj-123456789/);
  assert.doesNotMatch(report, /provider_payload/);
});

test("packet input must be an own-property object with non-empty required values", async () => {
  assert.equal(validateDryRunPacket(null).ok, false);
  assert.ok(validateDryRunPacket(null).field_reasons.some((reason) => reason.field === "$" && reason.reason === "invalid_packet_object"));

  const inheritedPacket = Object.create(await readFixture("claude-dry-run-ok.json"));
  const inheritedResult = validateDryRunPacket(inheritedPacket);
  assert.equal(inheritedResult.ok, false);
  assert.ok(inheritedResult.field_reasons.some((reason) => reason.reason === "missing_required_field"));

  const packet = await readFixture("claude-dry-run-ok.json");
  const emptyPacketId = validateDryRunPacket({ ...packet, packet_id: "" });
  assert.equal(emptyPacketId.ok, false);
  assert.ok(emptyPacketId.field_reasons.some((reason) => reason.field === "packet_id" && reason.reason === "empty_required_field"));
});

test("missing required packet fields fail with field-level reasons", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const field of REQUIRED_DRY_RUN_PACKET_FIELDS) {
    const mutated = { ...packet };
    delete mutated[field];

    const result = validateDryRunPacket(mutated);
    assert.equal(result.ok, false, `missing ${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((reason) => reason.field === field && reason.reason === "missing_required_field"),
      `missing ${field} should produce a field-level missing_required_field reason`,
    );
    assert.ok(result.denied_reasons.includes("missing_required_field"));
  }
});

test("validator foundation rejects invalid worker, mode, and authority level without throwing", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const result = validateDryRunPacket({
    ...packet,
    worker: "codex",
    mode: "live",
    authority_level: "write",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.field_reasons.filter((reason) => reason.field === "worker"),
    [{ field: "worker", reason: "invalid_worker" }],
  );
  assert.deepEqual(
    result.field_reasons.filter((reason) => reason.field === "mode"),
    [{ field: "mode", reason: "invalid_mode" }],
  );
  assert.deepEqual(
    result.field_reasons.filter((reason) => reason.field === "authority_level"),
    [{ field: "authority_level", reason: "invalid_authority_level" }],
  );
});

test("validator module does not expose process, network, GitHub, cleanup, or source mutation primitives", async () => {
  const source = await readFile(validatorSourcePath, "utf8");

  for (const forbiddenPattern of [
    /\bchild_process\b/,
    /\bspawn\b/,
    /\bexec\b/,
    /\bfetch\s*\(/,
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
    /\bimport\s*\(/,
    /\bWebSocket\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }

  const importLines = source.split("\n").filter((line) => line.trim().startsWith("import "));
  assert.deepEqual(importLines, []);
});

test("scoped package scripts and check wrapper are wired for the dry-run slice", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(
    packageJson.scripts?.["test:governed-worker-execution-dry-run"],
    "node --test tests/governed-worker-execution-dry-run.test.mjs",
  );
  assert.equal(
    packageJson.scripts?.["check:governed-worker-execution-dry-run"],
    "node ./scripts/check-governed-worker-execution-dry-run.mjs",
  );
  assert.match(packageJson.scripts?.["check:static"], /pnpm run check:governed-worker-execution-dry-run/);
  assert.equal(existsSync(checkWrapperPath), true);
});

test("scoped check wrapper precheck validates source policy refs and fixture inventory", () => {
  const result = precheckGovernedWorkerExecutionDryRun();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("scoped check wrapper remains local and avoids worker/provider/GitHub/cleanup primitives", async () => {
  const source = await readFile(checkWrapperPath, "utf8");

  assert.match(source, /spawnSync\(process\.execPath, \["--test", testPath\]/);
  for (const forbiddenPattern of [
    /\bfetch\s*\(/,
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
    /\bWebSocket\b/,
    /\bclaude\b.*\bspawnSync\b/,
    /\bhermes\b.*\bspawnSync\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});
