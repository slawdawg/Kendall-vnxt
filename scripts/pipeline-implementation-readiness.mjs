import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_PIPELINE_READINESS_CATEGORY_IDS = [
  "contracts",
  "stage-mapping",
  "fixture-matrix",
  "dashboard-fixture-ui",
  "accessibility-density",
  "human-gate-guards",
  "local-model-policy",
  "hermes-containment",
  "codex-claude-lanes",
  "memory-proposals",
  "source-memory-boundaries",
  "no-live-call-boundary",
  "verification-readiness-report",
  "authority-readiness-report",
  "refined-ui-readiness",
  "runtime-enforcement-boundary",
];

export const PIPELINE_READINESS_CATEGORY_METADATA = {
  contracts: {
    ownerEpic: "epic-1",
    ownerStory: "1-1-validate-the-pipeline-work-packet-read-contract",
    failureClass: "blocker",
  },
  "stage-mapping": {
    ownerEpic: "epic-1",
    ownerStory: "1-2-map-existing-states-to-pipeline-stages",
    failureClass: "blocker",
  },
  "fixture-matrix": {
    ownerEpic: "epic-1",
    ownerStory: "1-5-define-pipeline-state-evidence-and-fixture-matrix",
    failureClass: "blocker",
  },
  "dashboard-fixture-ui": {
    ownerEpic: "epic-2",
    ownerStory: "2-7-demonstrate-golden-path-packet-lifecycle",
    failureClass: "blocker",
  },
  "accessibility-density": {
    ownerEpic: "epic-2",
    ownerStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
    failureClass: "blocker",
  },
  "human-gate-guards": {
    ownerEpic: "epic-3",
    ownerStory: "3-4-guard-against-stale-or-unsafe-actions",
    failureClass: "blocker",
  },
  "local-model-policy": {
    ownerEpic: "epic-4",
    ownerStory: "4-2-define-model-role-policy-wrappers",
    failureClass: "blocker",
  },
  "hermes-containment": {
    ownerEpic: "epic-4",
    ownerStory: "4-3-render-mocked-hermes-worker-containment",
    failureClass: "blocker",
  },
  "codex-claude-lanes": {
    ownerEpic: "epic-4",
    ownerStory: "4-4-render-codex-and-claude-lane-states",
    failureClass: "blocker",
  },
  "memory-proposals": {
    ownerEpic: "epic-5",
    ownerStory: "5-1-define-reviewable-memory-proposals",
    failureClass: "blocker",
  },
  "source-memory-boundaries": {
    ownerEpic: "epic-5",
    ownerStory: "5-2-preserve-source-obsidian-and-llm-wiki-boundaries",
    failureClass: "blocker",
  },
  "no-live-call-boundary": {
    ownerEpic: "epic-2",
    ownerStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
    failureClass: "blocker",
  },
  "verification-readiness-report": {
    ownerEpic: "meta",
    ownerStory: "verification-readiness-report",
    failureClass: "risk",
  },
  "authority-readiness-report": {
    ownerEpic: "meta",
    ownerStory: "authority-readiness-matrix-report",
    failureClass: "risk",
  },
  "refined-ui-readiness": {
    ownerEpic: "epic-6",
    ownerStory: "6-1-refine-pipeline-cockpit-ui",
    failureClass: "decision_needed",
  },
  "runtime-enforcement-boundary": {
    ownerEpic: "epic-5",
    ownerStory: "5-2-preserve-source-obsidian-and-llm-wiki-boundaries",
    failureClass: "risk",
  },
};

export const PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE = [
  {
    id: "epic1.work-packet-contracts",
    categoryId: "contracts",
    label: "WorkPacketV0 and memory/source contracts",
    ownerEpic: "epic-1",
    ownerStory: "1-1-validate-the-pipeline-work-packet-read-contract",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:work-packet-contracts", "pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["packages/contracts/src/work-packet.ts", "apps/dashboard/src/lib/pipeline-fixtures.ts", "tests/work-packet-contracts.test.mjs", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "packages/contracts/src/work-packet.ts", tokens: ["export interface WorkPacketV0View", "export interface MemoryProposalV0"] },
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["export type PipelineReadPacketContractV0 = WorkPacketV0View", "export type PipelineFixturePacket = PipelineReadPacketContractV0"] },
      { file: "tests/work-packet-contracts.test.mjs", tokens: ["metadata-only evidence", "MemoryProposalV0"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["PipelineReadPacketContractV0", "parallel dashboard model"] },
    ],
    summary: "Shared Work Packet and Memory Proposal contracts exist, and /pipeline fixture packets are anchored to WorkPacketV0View instead of a parallel dashboard packet model.",
  },
  {
    id: "epic1.stage-mapping",
    categoryId: "stage-mapping",
    label: "Canonical Work Packet stage mapping",
    ownerEpic: "epic-1",
    ownerStory: "1-2-map-existing-states-to-pipeline-stages",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:work-packet-stage-map"],
    sourceFiles: ["packages/workflow-core/src/work-packet-stage-map.ts", "tests/work-packet-stage-map.test.mjs"],
    requiredTokens: [
      { file: "packages/workflow-core/src/work-packet-stage-map.ts", tokens: ["mapWorkPacketStage", "WorkPacketStageMappingInputV0"] },
      { file: "tests/work-packet-stage-map.test.mjs", tokens: ["canonical source states", "ambiguous source state behavior"] },
    ],
    summary: "Existing Kendall states map into the Pipeline Stage vocabulary through a tested shared mapper.",
  },
  {
    id: "epic1.fixture-matrix-catalog",
    categoryId: "fixture-matrix",
    label: "Pipeline State/Evidence Matrix and fixture catalog",
    ownerEpic: "epic-1",
    ownerStory: "1-5-define-pipeline-state-evidence-and-fixture-matrix",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:pipeline-state-matrix", "pnpm run test:work-packet-fixtures"],
    sourceFiles: ["packages/workflow-core/src/pipeline-state-fixture-matrix.ts", "tests/pipeline-state-fixture-matrix.test.mjs"],
    requiredTokens: [
      { file: "packages/workflow-core/src/pipeline-state-fixture-matrix.ts", tokens: ["PIPELINE_STATE_FIXTURE_CATALOG_V0", "validatePipelineStateFixtureMatrix"] },
      { file: "tests/pipeline-state-fixture-matrix.test.mjs", tokens: ["missing state fixture", "boundary rows"] },
    ],
    summary: "Source-owned matrix/catalog validation names missing state, evidence, fixture, and boundary rows explicitly.",
  },
  {
    id: "epic2.dashboard-fixture-ui",
    categoryId: "dashboard-fixture-ui",
    label: "Fixture-backed /pipeline cockpit",
    ownerEpic: "epic-2",
    ownerStory: "2-7-demonstrate-golden-path-packet-lifecycle",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["apps/dashboard/src/app/pipeline/page.tsx", "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "apps/dashboard/src/app/pipeline/page.tsx", tokens: ["PipelineCockpit", "realtimeRefresh={false}"] },
      { file: "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", tokens: ["Pipeline command strip", "Pipeline route map", "Pipeline operational strip", "Mission control focus strip", "Pipeline board"] },
      { file: "apps/dashboard/src/components/pipeline/packet-detail-page.tsx", tokens: ["Packet detail", "Packet 5 Whys", "Gate, memory, recovery"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["fixture-only cockpit frame without supervisor calls", "fetch\\s*\\("] },
    ],
    summary: "The dashboard exposes a static fixture-only cockpit route without supervisor/provider/worker calls.",
  },
  {
    id: "epic2.accessibility-density",
    categoryId: "accessibility-density",
    label: "Accessibility, responsiveness, and 25-packet density evidence",
    ownerEpic: "epic-2",
    ownerStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures", "pnpm run test:dashboard-e2e-runner"],
    sourceFiles: ["apps/dashboard/src/lib/pipeline-fixtures.ts", "tests/dashboard-pipeline-fixtures.test.mjs", "tests/e2e/dashboard.spec.ts"],
    requiredTokens: [
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["pipelineDensityFixturePackets", "Array.from({ length: 15 }"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["density fixture clone count should be explicit", "pipeline cockpit should load at least 25 fixture packets"] },
      { file: "tests/e2e/dashboard.spec.ts", tokens: ["opens fixture-backed pipeline cockpit", "page.keyboard.press", "viewport"] },
    ],
    summary: "Current cockpit foundation has keyboard, responsive, density, and browser-smoke evidence.",
  },
  {
    id: "epic3.human-gate-guards",
    categoryId: "human-gate-guards",
    label: "Typed Human Gate, recovery, stale, and unsafe action guards",
    ownerEpic: "epic-3",
    ownerStory: "3-4-guard-against-stale-or-unsafe-actions",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["apps/dashboard/src/lib/pipeline-fixtures.ts", "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["evaluateFixtureActionDecision", "blocked_source_boundary"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["false_authority", "unknown_action", "safe next option"] },
    ],
    summary: "Fixture action decisions reject stale, unsafe, unknown, and blocked-boundary actions as false authority.",
  },
  {
    id: "epic4.local-model-policy",
    categoryId: "local-model-policy",
    label: "Local GPU/Ollama readiness and model role policy",
    ownerEpic: "epic-4",
    ownerStory: "4-2-define-model-role-policy-wrappers",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:work-packet-contracts", "pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["packages/contracts/src/work-packet.ts", "apps/dashboard/src/lib/pipeline-fixtures.ts", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "packages/contracts/src/work-packet.ts", tokens: ["ModelRolePolicyV0", "ModelRequestPacketV0", "ModelResultPacketV0"] },
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["LocalModelHealthV0", "provider execution from dashboard"] },
    ],
    summary: "Ollama/local GPU state is visible as readiness metadata, not direct dashboard provider execution.",
  },
  {
    id: "epic4.hermes-containment",
    categoryId: "hermes-containment",
    label: "Mocked Hermes worker containment",
    ownerEpic: "epic-4",
    ownerStory: "4-3-render-mocked-hermes-worker-containment",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["apps/dashboard/src/lib/pipeline-fixtures.ts", "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["HermesJobPacketV0", "real worker launch", "Hermes Worker Mock", "Mocked Hermes containment"] },
      { file: "apps/dashboard/src/components/pipeline/packet-detail-page.tsx", tokens: ["Workers and review", "Hermes:"] },
    ],
    summary: "Hermes remains mocked and blocked from worker launch, Docker execution, source mutation, and network egress.",
  },
  {
    id: "epic4.codex-claude-lanes",
    categoryId: "codex-claude-lanes",
    label: "Codex implementation lane and Claude reviewer lane separation",
    ownerEpic: "epic-4",
    ownerStory: "4-4-render-codex-and-claude-lane-states",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["apps/dashboard/src/lib/pipeline-fixtures.ts", "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["ClaudeReviewPacketV0", "codex_worker", "claude_reviewer", "Codex Worker Card", "Claude Reviewer Card"] },
      { file: "apps/dashboard/src/components/pipeline/packet-detail-page.tsx", tokens: ["Workers and review", "Codex:", "Claude:"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["claude implementation", "Codex Worker Card"] },
    ],
    summary: "Codex is implementation-worker state and Claude is scarce independent review state; neither is launched by the dashboard.",
  },
  {
    id: "epic5.memory-proposals",
    categoryId: "memory-proposals",
    label: "Reviewable memory proposal contract and proposal-only write-back",
    ownerEpic: "epic-5",
    ownerStory: "5-1-define-reviewable-memory-proposals",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:work-packet-contracts", "pnpm run test:work-packet-fixtures", "pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["packages/contracts/src/work-packet.ts", "apps/dashboard/src/lib/pipeline-fixtures.ts", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "packages/contracts/src/work-packet.ts", tokens: ["MemoryProposalV0", "writeBackAllowed"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["writeBackAllowed", "review_gated", "memory proposals should cover every review state"] },
      { file: "apps/dashboard/src/components/pipeline/packet-detail-page.tsx", tokens: ["Gate, memory, recovery", "Memory proposals"] },
    ],
    summary: "Memory proposals are review-gated metadata and never automatic canonical Obsidian writes.",
  },
  {
    id: "epic5.source-memory-boundaries",
    categoryId: "source-memory-boundaries",
    label: "Obsidian canonical boundary and LLM-Wiki derived boundary",
    ownerEpic: "epic-5",
    ownerStory: "5-2-preserve-source-obsidian-and-llm-wiki-boundaries",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures"],
    sourceFiles: ["apps/dashboard/src/lib/pipeline-fixtures.ts", "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx", "tests/dashboard-pipeline-fixtures.test.mjs"],
    requiredTokens: [
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["pipelineSourceBoundaryChecklist", "canonical, human-owned", "derived, disposable, rebuildable"] },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["Obsidian is canonical and human-owned", "LLM-Wiki is derived, disposable, and rebuildable"] },
    ],
    summary: "Obsidian remains canonical/human-owned and LLM-Wiki remains derived/disposable/rebuildable.",
  },
  {
    id: "cross.no-live-call-boundary",
    categoryId: "no-live-call-boundary",
    label: "No live provider, worker, source, vault, network, or process calls from /pipeline",
    ownerEpic: "epic-2",
    ownerStory: "2-8-verify-cockpit-accessibility-and-responsiveness",
    status: "satisfied",
    failureClass: "blocker",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures", "pnpm run check:static"],
    sourceFiles: ["tests/dashboard-pipeline-fixtures.test.mjs", "apps/dashboard/src/app/pipeline/page.tsx", "apps/dashboard/src/lib/pipeline-fixtures.ts"],
    requiredTokens: [
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["fetch\\s*\\(", "writeObsidian", "provider execution from dashboard"] },
      { file: "apps/dashboard/src/lib/pipeline-fixtures.ts", tokens: ["No provider, worker, GitHub, or Obsidian calls"] },
    ],
    summary: "Static tests deny hidden live calls and mutation paths in the fixture-backed cockpit.",
  },
  {
    id: "meta.verification-readiness-report",
    categoryId: "verification-readiness-report",
    label: "Existing verification readiness report is evidence only",
    ownerEpic: "meta",
    ownerStory: "verification-readiness-report",
    status: "satisfied",
    failureClass: "risk",
    executionAuthorityApproved: false,
    requiredCommands: ["pnpm run check:verification-readiness"],
    sourceFiles: ["scripts/check-verification-readiness-report.mjs", "services/supervisor/src/supervisor/application/service.py"],
    requiredTokens: [
      { file: "scripts/check-verification-readiness-report.mjs", tokens: ["readyForAuthorityEnablement", "executionAuthorityApproved"] },
      { file: "services/supervisor/src/supervisor/application/service.py", tokens: ["verification-readiness-report-v1", "executionAuthorityApproved=False"] },
    ],
    summary: "Verification readiness evidence does not grant authority enablement.",
  },
  {
    id: "meta.authority-readiness-report",
    categoryId: "authority-readiness-report",
    label: "Existing authority readiness matrix is evidence only",
    ownerEpic: "meta",
    ownerStory: "authority-readiness-matrix-report",
    status: "satisfied",
    failureClass: "risk",
    executionAuthorityApproved: false,
    requiredCommands: ["pnpm run check:authority-readiness"],
    sourceFiles: ["scripts/check-authority-readiness-matrix-report.mjs", "services/supervisor/src/supervisor/application/service.py"],
    requiredTokens: [
      { file: "scripts/check-authority-readiness-matrix-report.mjs", tokens: ["Authority readiness matrix entries are not execution-authority approvals."] },
      { file: "services/supervisor/src/supervisor/application/service.py", tokens: ["authority-readiness-matrix-report-v1", "executionAuthorityApproved=False"] },
    ],
    summary: "Authority readiness entries remain evidence, not execution approvals.",
  },
  {
    id: "ui.refined-pipeline-cockpit",
    categoryId: "refined-ui-readiness",
    label: "Refined video-inspired /pipeline cockpit readiness",
    ownerEpic: "epic-6",
    ownerStory: "6-1-refine-pipeline-cockpit-ui",
    status: "satisfied",
    failureClass: "decision_needed",
    visualProofs: [
      "test-results/pipeline-refined-1440.png",
      "test-results/pipeline-refined-900.png",
      "test-results/pipeline-refined-390.png",
    ],
    browserProofCommand: "pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep \"opens fixture-backed pipeline cockpit without live execution framing\"",
    proofSummary: "Story 6.1 adds a refined flow-only /pipeline surface, packet detail drill-down, browser visual-integrity checks, no-overlap checks, screenshots, and same-origin no-live-call instrumentation.",
    requiredCommands: ["pnpm run test:dashboard-pipeline-fixtures", "pnpm run test:dashboard-e2e-runner", "pnpm run test:e2e:dashboard"],
    sourceFiles: [
      "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx",
      "apps/dashboard/src/components/pipeline/packet-detail-page.tsx",
      "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx",
      "tests/dashboard-pipeline-fixtures.test.mjs",
      "tests/e2e/dashboard.spec.ts",
    ],
    requiredTokens: [
      {
        file: "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx",
        tokens: ["Refined pipeline cockpit frame", "Cockpit first-frame hierarchy", "Pipeline command strip", "Pipeline operational strip", "Pipeline route map", "Packet inspection panel"],
      },
      {
        file: "apps/dashboard/src/components/pipeline/packet-detail-page.tsx",
        tokens: ["Packet detail:", "Packet 5 Whys", "Source Boundary Checklist", "Gate, memory, recovery"],
      },
      {
        file: "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx",
        tokens: ["generateStaticParams", "decodeURIComponent(packetId)", "PacketDetailPage"],
      },
      {
        file: "tests/dashboard-pipeline-fixtures.test.mjs",
        tokens: ["Pipeline route map", "No packet is selected by default", "Packet detail", "doesNotMatch(cockpitSource"],
      },
      {
        file: "tests/e2e/dashboard.spec.ts",
        tokens: ["sameOriginRuntimeRequests", "visualIntegrityEvidence", "Inspect packet: Resolve stale research source before routing", "Packet detail"],
      },
    ],
    summary: "Refined cockpit UI has source-owned browser proof requirements for flow-only hierarchy, packet drill-down, screenshots, no-overlap, responsiveness, keyboard preservation, and no-live-call boundaries.",
  },
  {
    id: "epic5.runtime-enforcement-boundary",
    categoryId: "runtime-enforcement-boundary",
    label: "Bounded live memory/source enforcement boundary",
    ownerEpic: "epic-5",
    ownerStory: "5-2-preserve-source-obsidian-and-llm-wiki-boundaries",
    status: "future_blocked",
    failureClass: "risk",
    followUpStory: "future-operator-approved-canonical-writeback-authority-story",
    authorityFamily: "memory-writeback-and-source-mutation",
    stopLines: [
      "Do not write Obsidian directly from fixture mode.",
      "Do not promote LLM-Wiki to canonical memory.",
      "Do not launch workers/providers/review providers from /pipeline without a later authority packet.",
    ],
    verificationEvidence: [
      "pnpm run test:dashboard-pipeline-fixtures",
      "pnpm run test:knx-obsidian-memory",
      "pnpm run test:live-memory-source-enforcement",
      "pnpm run test:bounded-live-memory-source",
    ],
    operatorApprovalPath: "Create a future bounded live-write story with explicit operator approval evidence before any canonical Obsidian/source mutation integration.",
    requiredCommands: [
      "pnpm run test:dashboard-pipeline-fixtures",
      "pnpm run test:knx-obsidian-memory",
      "pnpm run test:live-memory-source-enforcement",
      "pnpm run test:bounded-live-memory-source",
    ],
    sourceFiles: [
      "docs/workflows/live-memory-source-enforcement.md",
      "scripts/lib/live-memory-source-enforcement.mjs",
      "scripts/lib/bounded-live-memory-source-integration.mjs",
      "tests/live-memory-source-enforcement.test.mjs",
      "tests/bounded-live-memory-source-integration.test.mjs",
      "tests/dashboard-pipeline-fixtures.test.mjs",
      "tests/knx-obsidian-memory.test.mjs",
    ],
    requiredTokens: [
      {
        file: "docs/workflows/live-memory-source-enforcement.md",
        tokens: [
          "memory-writeback-and-source-mutation",
          "direct canonical Obsidian mutation is forbidden",
          "LLM-Wiki is derived, disposable, and rebuildable",
          "unavailable source",
          "malformed source metadata",
          "metadata-only evidence",
          "bounded live adapter",
          "read-only mode",
        ],
      },
      {
        file: "scripts/lib/live-memory-source-enforcement.mjs",
        tokens: [
          "LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY",
          "evaluateLiveMemorySourceEnforcement",
          "inspect_approved_source_metadata",
          "create_dry_run_write_plan",
          "unavailable_source",
          "missing_rollback",
          "source_copy_retention_forbidden",
          "auditEventSchema",
          "operatorApprovalRequired",
          "rawPayloadRetained: false",
          "sourceContentCopied: false",
        ],
      },
      {
        file: "scripts/lib/bounded-live-memory-source-integration.mjs",
        tokens: [
          "createDryRunMemorySourceWritePlan",
          "inspectApprovedMemorySource",
          "createBoundedDraftWritePreview",
          "writePreviewArtifactCreated",
          "writePerformed: false",
        ],
      },
      {
        file: "tests/live-memory-source-enforcement.test.mjs",
        tokens: [
          "direct canonical writes, source mutation, and LLM-Wiki promotion are blocked",
          "unsafe source states block write-back",
          "missing or malformed source metadata fails closed",
          "raw payload and source-copy retention are blocked",
        ],
      },
      {
        file: "tests/bounded-live-memory-source-integration.test.mjs",
        tokens: [
          "dry-run write plan records metadata-only no-write evidence",
          "read-only approved source inspection returns metadata without raw content",
          "bounded draft write preview is approval gated and no-write by default",
        ],
      },
      { file: "tests/dashboard-pipeline-fixtures.test.mjs", tokens: ["writeObsidian", "canonical mutation", "llm_wiki"] },
      { file: "tests/knx-obsidian-memory.test.mjs", tokens: ["draft write-back requires approval"] },
    ],
    summary: "Runtime enforcement now has source-owned policy plus bounded dry-run/read-only live proof, but remains blocked for canonical Obsidian mutation, source mutation, worker/provider calls, GitHub/network actions, raw/source-copy retention, and LLM-Wiki promotion.",
  },
];

const defaultRootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(rootDir, path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function commandToScriptName(command) {
  const match = /^pnpm run ([A-Za-z0-9:-]+)$/.exec(command);
  return match?.[1] ?? null;
}

function addFailure(failures, item, kind, message, categoryDefaults = new Map()) {
  const defaults = item ? null : categoryDefaults.get(kind);
  failures.push({
    kind,
    itemId: item?.id ?? null,
    categoryId: item?.categoryId ?? defaults?.categoryId ?? kind,
    ownerEpic: item?.ownerEpic ?? defaults?.ownerEpic ?? "unknown",
    ownerStory: item?.ownerStory ?? defaults?.ownerStory ?? "unknown",
    failureClass: item?.failureClass ?? defaults?.failureClass ?? "blocker",
    message,
  });
}

function unresolvedSummary(evidenceItems) {
  const summary = { blockers: 0, risks: 0, decisions: 0 };
  for (const item of evidenceItems) {
    if (item.status === "satisfied") {
      continue;
    }
    if (item.failureClass === "blocker") {
      summary.blockers += 1;
    } else if (item.failureClass === "decision_needed") {
      summary.decisions += 1;
    } else {
      summary.risks += 1;
    }
  }
  return summary;
}

function unresolvedDetails(evidenceItems) {
  return evidenceItems
    .filter((item) => item.status !== "satisfied")
    .map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      ownerEpic: item.ownerEpic,
      ownerStory: item.ownerStory,
      status: item.status,
      failureClass: item.failureClass,
      followUpStory: item.followUpStory ?? null,
      authorityFamily: item.authorityFamily ?? null,
      summary: item.summary,
    }));
}

export async function evaluatePipelineImplementationReadiness({
  rootDir = defaultRootDir,
  evidenceItems = PIPELINE_IMPLEMENTATION_READINESS_EVIDENCE,
  requiredCategoryIds = REQUIRED_PIPELINE_READINESS_CATEGORY_IDS,
} = {}) {
  const failures = [];
  const packageJsonPath = join(rootDir, "package.json");
  const packageJson = existsSync(packageJsonPath) ? JSON.parse(readFileSync(packageJsonPath, "utf8")) : { scripts: {} };
  const evidenceByCategory = new Map();
  const requiredCategoryDefaults = new Map(
    evidenceItems.map((item) => [item.categoryId, item])
  );

  for (const item of evidenceItems) {
    if (!evidenceByCategory.has(item.categoryId)) {
      evidenceByCategory.set(item.categoryId, []);
    }
    evidenceByCategory.get(item.categoryId).push(item);
  }

  for (const categoryId of requiredCategoryIds) {
    if (!evidenceByCategory.has(categoryId)) {
      const defaults = PIPELINE_READINESS_CATEGORY_METADATA[categoryId] ?? requiredCategoryDefaults.get(categoryId) ?? {
        categoryId,
        ownerEpic: "unknown",
        ownerStory: "unknown",
        failureClass: "blocker",
      };
      failures.push({
        kind: "missing_category",
        itemId: null,
        categoryId,
        ownerEpic: defaults.ownerEpic,
        ownerStory: defaults.ownerStory,
        failureClass: defaults.failureClass,
        message: `Missing required pipeline implementation readiness evidence for ${categoryId}.`,
      });
    }
  }

  for (const item of evidenceItems) {
    if (requiredCategoryIds.includes(item.categoryId) && !PIPELINE_READINESS_CATEGORY_METADATA[item.categoryId]) {
      addFailure(failures, item, "missing_category_metadata", `${item.categoryId} missing category ownership metadata.`);
    }

    for (const field of ["id", "categoryId", "label", "ownerEpic", "ownerStory", "status", "failureClass", "summary"]) {
      if (typeof item[field] !== "string" || item[field].trim().length === 0) {
        addFailure(failures, item, "invalid_item", `${item.id ?? "unknown"} missing ${field}.`);
      }
    }

    for (const arrayField of ["requiredCommands", "sourceFiles", "requiredTokens"]) {
      if (!Array.isArray(item[arrayField]) || item[arrayField].length === 0) {
        addFailure(failures, item, "invalid_item", `${item.id} missing ${arrayField}.`);
      }
    }

    for (const command of item.requiredCommands ?? []) {
      const scriptName = commandToScriptName(command);
      if (!scriptName || !packageJson.scripts?.[scriptName]) {
        addFailure(failures, item, "missing_command", `${item.id} references missing package script command ${command}.`);
      }
    }

    for (const sourceFile of item.sourceFiles ?? []) {
      if (!existsSync(join(rootDir, sourceFile))) {
        addFailure(failures, item, "missing_source_file", `${item.id} references missing source file ${sourceFile}.`);
      }
    }

    for (const tokenCheck of item.requiredTokens ?? []) {
      const sourcePath = join(rootDir, tokenCheck.file);
      if (!existsSync(sourcePath)) {
        addFailure(failures, item, "missing_source_file", `${item.id} token source missing ${tokenCheck.file}.`);
        continue;
      }
      const source = readWorkspaceFile(rootDir, tokenCheck.file);
      for (const token of tokenCheck.tokens) {
        if (!source.includes(token)) {
          addFailure(failures, item, "missing_token", `${item.id} expected ${tokenCheck.file} to include ${token}.`);
        }
      }
    }

    if (item.executionAuthorityApproved === true) {
      addFailure(failures, item, "authority_leak", `${item.id} must not approve execution authority.`);
    }

    if (item.failureClass === "blocker" && item.status !== "satisfied") {
      addFailure(failures, item, "unresolved_blocker", `${item.id} is blocker-class evidence with status ${item.status}.`);
    }

    if (item.status === "decision_needed" && (typeof item.followUpStory !== "string" || item.followUpStory.trim().length === 0)) {
      addFailure(failures, item, "missing_decision_metadata", `${item.id} missing followUpStory.`);
    }

    if (item.categoryId === "refined-ui-readiness" && item.status !== "satisfied") {
      addFailure(failures, item, "invalid_refined_ui_status", `${item.id} must be satisfied after the refined cockpit story is complete.`);
    }

    if (item.categoryId === "refined-ui-readiness" && item.status === "satisfied") {
      if (!Array.isArray(item.visualProofs) || item.visualProofs.length === 0) {
        addFailure(failures, item, "missing_refined_ui_proof", `${item.id} missing visualProofs.`);
      }
      for (const field of ["browserProofCommand", "proofSummary"]) {
        if (typeof item[field] !== "string" || item[field].trim().length === 0) {
          addFailure(failures, item, "missing_refined_ui_proof", `${item.id} missing ${field}.`);
        }
      }
    }

    if (item.categoryId === "runtime-enforcement-boundary" && item.status !== "future_blocked") {
      addFailure(failures, item, "invalid_runtime_enforcement_status", `${item.id} must remain future_blocked until live-integration authority exists.`);
    }

    if (item.status === "future_blocked" || item.categoryId === "runtime-enforcement-boundary") {
      for (const field of ["followUpStory", "authorityFamily", "operatorApprovalPath"]) {
        if (typeof item[field] !== "string" || item[field].trim().length === 0) {
          addFailure(failures, item, "missing_future_authority_metadata", `${item.id} missing ${field}.`);
        }
      }
      for (const field of ["stopLines", "verificationEvidence"]) {
        if (!Array.isArray(item[field]) || item[field].length === 0) {
          addFailure(failures, item, "missing_future_authority_metadata", `${item.id} missing ${field}.`);
        }
      }
    }
  }

  const summary = unresolvedSummary(evidenceItems);
  const unresolved = unresolvedDetails(evidenceItems);
  const driftStatus = failures.length === 0 ? "PASS" : "FAIL";
  const readinessStatus =
    failures.length > 0 ? "DRIFT_FAIL" : summary.blockers > 0 || unresolved.length > 0 ? "NOT_READY" : "READY";

  return {
    status: driftStatus,
    driftStatus,
    readinessStatus,
    readyForImplementation: false,
    executionAuthorityApproved: false,
    categoryIds: [...evidenceByCategory.keys()],
    evidenceItems,
    unresolvedItems: unresolved,
    driftFailures: failures,
    summary,
  };
}
