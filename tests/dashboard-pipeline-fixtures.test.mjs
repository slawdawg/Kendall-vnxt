import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const packageJsonPath = new URL("../package.json", import.meta.url);
const routePath = new URL("../apps/dashboard/src/app/pipeline/page.tsx", import.meta.url);
const pipelineComponentsPath = new URL("../apps/dashboard/src/components/pipeline/", import.meta.url);
const cockpitPath = new URL("pipeline-cockpit.tsx", pipelineComponentsPath);
const fixturesPath = new URL("../apps/dashboard/src/lib/pipeline-fixtures.ts", import.meta.url);
const shellPath = new URL("../apps/dashboard/src/components/shell.tsx", import.meta.url);
const realtimeRefreshPath = new URL("../apps/dashboard/src/components/realtime-refresh.tsx", import.meta.url);
const navPath = new URL("../apps/dashboard/src/components/operational-nav.tsx", import.meta.url);

test("dashboard pipeline fixture test is wired into package checks", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(packageJson.scripts["test:dashboard-pipeline-fixtures"], "node --test tests/dashboard-pipeline-fixtures.test.mjs");
  assert.match(packageJson.scripts["check:static"], /pnpm run test:dashboard-pipeline-fixtures/);
  assert.match(packageJson.scripts.check, /pnpm run test:dashboard-pipeline-fixtures/);
});

test("/pipeline route uses fixture-only cockpit frame without supervisor calls", async () => {
  const routeSource = await readFile(routePath, "utf8");
  const cockpitSource = await readFile(cockpitPath, "utf8");
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const shellSource = await readFile(shellPath, "utf8");
  const realtimeRefreshSource = await readFile(realtimeRefreshPath, "utf8");
  const navSource = await readFile(navPath, "utf8");
  const componentFiles = (await readdir(pipelineComponentsPath)).filter((file) => file.endsWith(".tsx"));
  const pipelineComponentSource = (
    await Promise.all(componentFiles.map((file) => readFile(new URL(file, pipelineComponentsPath), "utf8")))
  ).join("\n");
  const allPipelineSource = `${routeSource}\n${fixtureSource}\n${pipelineComponentSource}`;

  assert.match(routeSource, /<Shell\b/);
  assert.match(routeSource, /<Shell\b[^>]*realtimeRefresh=\{false\}[^>]*wide/);
  assert.match(shellSource, /realtimeRefresh = true/);
  assert.match(shellSource, /\{realtimeRefresh \? <RealtimeRefresh \/> : null\}/);
  assert.doesNotMatch(shellSource, /EventSource|WebSocket|XMLHttpRequest|sendBeacon|fetch\s*\(/);
  assert.match(realtimeRefreshSource, /EventSource/);
  assert.match(routeSource, /PipelineCockpit/);
  assert.doesNotMatch(routeSource, /lib\/supervisor|getRunStatus|getWorkItems|getWorkPackets|fetch\s*\(/);

  for (const regionName of [
    "Refined pipeline cockpit frame",
    "Cockpit first-frame hierarchy",
    "Pipeline command strip",
    "Operator command center",
    "Pipeline source rail collapsed",
    "Pipeline source rail",
    "Pipeline board",
    "Active packet drawer",
    "Worker review memory recovery rail",
    "Pipeline evidence strip"
  ]) {
    assert.match(cockpitSource, new RegExp(`aria-label=["']${regionName}["']`));
  }

  for (const visibleLabel of [
    "Chief-of-Staff cockpit",
    "Refined first frame",
    "Decision queue",
    "Source intelligence",
    "Stage board",
    "Active packet",
    "Worker / review / memory / recovery",
    "Evidence runway",
    "Fixture mode",
    "Current mode",
    "Active packets",
    "Blocked gates",
    "Provider approval",
    "Top blocked packet",
    "Global recovery",
    "Fixture scenario selector",
    "Static fixture selector",
    "Failure and prototype scenarios",
    "Read-only static import mode",
    "prototype-only",
    "bounded states",
    "Selected packet",
    "Current owner",
    "Blocked reason",
    "Next operator option",
    "Stop-line",
    "Rollback path",
    "Golden path lifecycle",
    "Read-only golden path",
    "Packet lifecycle snapshots",
    "Local fixture selection only",
    "Decision consequence",
    "Why here",
    "Needs operator",
    "What happens next",
    "fixture-only",
    "mocked",
    "synthetic",
    "Human Gate",
    "Pipeline board",
    "Source:",
    "Source trust",
    "Packet drawer tabs",
    "Intent",
    "Sources",
    "Route",
    "Stage",
    "Gates",
    "Evidence",
    "Worker",
    "Memory",
    "Recovery",
    "Local GPU Card",
    "Local GPU health",
    "Local model readiness",
    "Configured endpoint",
    "Approved endpoint",
    "Endpoint approval",
    "Configured model",
    "Approved model",
    "Model approval",
    "Reachability",
    "Busy state",
    "Allowed caller",
    "Latency",
    "Last failure",
    "Call authority",
    "Retention policy",
    "Fallback path",
    "Hermes Worker Card",
    "Mocked worker containment",
    "Codex Worker Card",
    "Implementation worker lane",
    "Attempt refs",
    "Implementation role",
    "Reviewer boundary",
    "Claude Reviewer Card",
    "Reviewer / second opinion",
    "Review purpose",
    "Allowed context",
    "Excluded context",
    "Expected findings schema",
    "Independence marker",
    "Cost/scarcity",
    "Approval requirement",
    "Review status",
    "Worker profile",
    "Input refs",
    "Allowed mounts",
    "Writable output dir",
    "Network policy",
    "Credential policy",
    "Source mutation policy",
    "Expected output schema",
    "Cleanup policy",
    "Kill switch",
    "Execution mode",
    "Route Fork Panel",
    "Selected route",
    "Rejected routes",
    "Source context",
    "Reason codes",
    "Low-confidence route actions",
    "Clarify",
    "Downgrade to reference",
    "Send back to Research",
    "Last event",
    "Next allowed actions",
    "Risk flags",
    "Recovery availability",
    "Typed action",
    "Action family",
    "Authority level",
    "Authority family",
    "Audit event",
    "Rollback",
    "approve_execution",
    "approve_provider_exception",
    "approve_memory_proposal",
    "approve_delivery",
    "request_clarification",
    "Request Changes",
    "Pause",
    "Mark Resolved",
    "disabled reason",
    "What exists",
    "Why it matters",
    "Where it came from",
    "Retention",
    "Evidence state",
    "missing or unavailable evidence",
    "known stage",
    "Memory Proposal Card",
    "Memory proposal blocked",
    "Proposal id",
    "Packet id",
    "Target path",
    "Target folder",
    "Proposal type",
    "Patch summary",
    "Sensitivity",
    "Freshness",
    "Contradiction",
    "Confidence",
    "Operator action",
    "Decision context",
    "Backup / recovery",
    "Write-back status",
    "Proposal-only boundary",
    "Source Boundary Checklist",
    "Canonicality",
    "Allowed reads",
    "Allowed writes",
    "Blocked operations",
    "Obsidian is canonical and human-owned",
    "LLM-Wiki is derived, disposable, and rebuildable",
    "Obsidian wins by default",
    "Candidate Work",
    "Obsidian inbox",
    "BMAD artifacts",
    "research/video",
    "GitHub",
    "manual capture",
    "included",
    "excluded",
    "stale",
    "contradictory",
    "unavailable",
    "derived-only"
  ]) {
    assert.match(pipelineComponentSource + fixtureSource, new RegExp(visibleLabel, "i"));
  }

  for (const { label, state, packetId } of [
    { label: "Candidate Work", state: "included", packetId: "fixture:happy-path" },
    { label: "Candidate Work", state: "included", packetId: "fixture:classify-intake" },
    { label: "Candidate Work", state: "included", packetId: "fixture:shape-plan" },
    { label: "Candidate Work", state: "included", packetId: "fixture:review-complete" },
    { label: "Candidate Work", state: "included", packetId: "fixture:promote-candidate" },
    { label: "Candidate Work", state: "included", packetId: "fixture:deliver-evidence" },
    { label: "Obsidian inbox", state: "excluded", packetId: "fixture:stale-source" },
    { label: "Obsidian inbox", state: "excluded", packetId: "fixture:learn-memory" },
    { label: "BMAD artifacts", state: "included", packetId: "fixture:human-gate-blocked" },
    { label: "research/video", state: "stale", packetId: "fixture:stale-source" },
    { label: "manual capture", state: "contradictory", packetId: "fixture:stale-source" },
    { label: "LLM-Wiki digest", state: "derived-only", packetId: "fixture:stale-source" },
    { label: "LLM-Wiki digest", state: "derived-only", packetId: "fixture:learn-memory" },
  ]) {
    assert.match(fixtureSource, new RegExp(`label: "${label}"[\\s\\S]*?state: "${state}"[\\s\\S]*?packetRefs: \\[[^\\]]*"${packetId}"`));
    assert.match(fixtureSource, new RegExp(`packetId: "${packetId}"[\\s\\S]*?sourceTrustStates: \\[[^\\]]*"${state}"`));
  }

  for (const packetSurface of [
    "sourceRefs",
    "evidenceRefs",
    "artifactRefs",
    "laneCards",
    "humanGateActions",
    "humanGateFixtureEvents",
    "recoveryFixtureEvents",
    "actionGuardFixtures",
    "memoryProposals",
    "recoveryActions"
  ]) {
    assert.match(fixtureSource, new RegExp(packetSurface));
  }

  assert.match(fixtureSource, /WorkPacketV0View/);
  assert.match(fixtureSource, /type: "approve_execution"/);
  assert.match(fixtureSource, /type: "approve_delivery"/);
  assert.match(fixtureSource, /type: "request_clarification"/);
  for (const recoveryActionType of [
    "retry_smaller",
    "reroute",
    "cancel_worker",
    "discard_result",
    "preserve_evidence",
    "reopen_human_gate",
    "mark_blocked",
    "send_back_to_shape",
    "send_back_to_research",
  ]) {
    assert.match(fixtureSource, new RegExp(`"${recoveryActionType}"`));
  }
  assert.match(fixtureSource, /family: "Approve"/);
  assert.match(fixtureSource, /family: "Pause"/);
  assert.match(fixtureSource, /family: "Mark Resolved"/);
  assert.match(fixtureSource, /authorityFamily:/);
  assert.match(fixtureSource, /payload:/);
  assert.match(fixtureSource, /decisionId:/);
  assert.match(fixtureSource, /stopLines:/);
  assert.match(fixtureSource, /rollbackPath:/);
  assert.match(fixtureSource, /auditEventType:/);
  assert.match(fixtureSource, /disabledReason:/);
  assert.match(fixtureSource, /payload:\s*\{\s*\.\.\.action\.payload[\s\S]*packetId,[\s\S]*actionId: remapId\(action\.payload\.actionId\),[\s\S]*decisionId: remapId\(action\.payload\.decisionId\),/);
  assert.match(fixtureSource, /buildHumanGateFixtureEvents/);
  assert.match(fixtureSource, /eventId: `\$\{action\.actionId\}:event`/);
  assert.match(fixtureSource, /fromStage:/);
  assert.match(fixtureSource, /toStage: action\.resultingStage/);
  assert.match(fixtureSource, /toOwner: action\.resultingOwner/);
  assert.match(fixtureSource, /humanGateFixtureEvents: packet\.humanGateFixtureEvents\.map/);
  assert.match(fixtureSource, /eventId: remapId\(event\.eventId\)/);
  assert.match(fixtureSource, /buildRecoveryFixtureEvents/);
  assert.match(fixtureSource, /buildActionGuardFixtures/);
  assert.match(fixtureSource, /ActionGuardFixture/);
  assert.match(fixtureSource, /stale_packet_state/);
  assert.match(fixtureSource, /stale_action_id/);
  assert.match(fixtureSource, /missing_evidence/);
  assert.match(fixtureSource, /unknown_action/);
  assert.match(fixtureSource, /unsafe_authority_class/);
  assert.match(fixtureSource, /blocked_source_boundary/);
  assert.match(fixtureSource, /LocalModelHealthV0/);
  assert.match(fixtureSource, /pipelineLocalModelHealthFixtures/);
  assert.match(fixtureSource, /pipelineSourceBoundaryChecklist/);
  assert.match(fixtureSource, /localModelHealth/);
  assert.match(fixtureSource, /local-readiness/);
  assert.match(fixtureSource, /healthy/);
  assert.match(fixtureSource, /unavailable/);
  assert.match(fixtureSource, /busy/);
  assert.match(fixtureSource, /model_mismatch/);
  assert.match(fixtureSource, /endpoint_mismatch/);
  assert.match(fixtureSource, /approval_required/);
  assert.match(fixtureSource, /metadata_only/);
  assert.match(fixtureSource, /fixture_or_wrapper_state_only/);
  assert.match(fixtureSource, /Dashboard does not probe the Windows Ollama endpoint/);
  assert.match(pipelineComponentSource, /primaryLocalModelHealth/);
  assert.match(pipelineComponentSource, /localModelStatusLabel/);
  assert.match(fixtureSource, /real_hermes_launch/);
  assert.match(fixtureSource, /obsidian_mutation/);
  assert.match(fixtureSource, /model_gateway_replacement/);
  assert.match(fixtureSource, /expanded_claude_automation/);
  assert.match(fixtureSource, /evidence_retention_bypass/);
  assert.match(fixtureSource, /false_authority/);
  assert.match(fixtureSource, /actionGuardFixtures: packet\.actionGuardFixtures\.map/);
  assert.match(fixtureSource, /recoveryActionFixtureMetadata/);
  assert.match(fixtureSource, /matrixRecoveryActions/);
  assert.match(fixtureSource, /catalogRecoveryActions/);
  assert.match(fixtureSource, /execution_attempt\.review_rejected/);
  assert.match(pipelineComponentSource, /No matrix-backed recovery actions are relevant/);
  assert.match(fixtureSource, /eventType: "work_packet\.recovery_selected\.fixture_preview"/);
  assert.match(fixtureSource, /requiresHumanGate: metadata\.requiresHumanGate/);
  assert.doesNotMatch(fixtureSource, /action\.availability !== "available" && humanGateAction !== null/);
  assert.match(fixtureSource, /recoveryFixtureEvents: packet\.recoveryFixtureEvents\.map/);
  assert.doesNotMatch(fixtureSource, /actionType: "approve"/);
  assert.doesNotMatch(fixtureSource, /availability: input\.currentStage === "human_gate" \? "available" : "blocked"/);
  for (const stage of [
    "capture",
    "classify",
    "route",
    "shape",
    "human_gate",
    "execute",
    "review",
    "promote",
    "deliver",
    "learn",
  ]) {
    assert.match(fixtureSource, new RegExp(`currentStage: "${stage}"`));
  }
  for (const cardField of [
    "Source:",
    "Source trust:",
    "Owner",
    "Confidence",
    "Risk",
    "Evidence",
    "Freshness",
    "Next:"
  ]) {
    assert.match(pipelineComponentSource, new RegExp(cardField));
  }
  assert.match(pipelineComponentSource, /w-\[15rem\]/);
  assert.match(pipelineComponentSource, /Health/);
  assert.match(pipelineComponentSource, /summarizeStatuses/);
  assert.doesNotMatch(pipelineComponentSource, /Fixture packet stage\./);
  assert.match(pipelineComponentSource, /No fixture packets in this lane/);
  assert.match(pipelineComponentSource, /useState/);
  assert.match(pipelineComponentSource, /setSelectedPacketId/);
  assert.match(pipelineComponentSource, /role="tablist"/);
  assert.match(pipelineComponentSource, /role="tab"/);
  assert.match(pipelineComponentSource, /role="tabpanel"/);
  assert.match(pipelineComponentSource, /aria-pressed=\{selected\}/);
  assert.match(pipelineComponentSource, /aria-disabled="true"/);
  assert.match(pipelineComponentSource, /onSelectPacket/);
  assert.match(pipelineComponentSource, /Packet search/);
  assert.match(pipelineComponentSource, /searchInputRef/);
  assert.match(pipelineComponentSource, /event\.key === "\/"/);
  assert.match(pipelineComponentSource, /movePacketFocus/);
  assert.match(pipelineComponentSource, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown/);
  assert.match(pipelineComponentSource, /onReturnFocus/);
  assert.match(pipelineComponentSource, /onEscape/);
  assert.match(pipelineComponentSource, /registerPacketCard/);
  assert.match(pipelineComponentSource, /searchablePacketText/);
  assert.match(pipelineComponentSource, /visibleSelectedPacketId/);
  assert.match(pipelineComponentSource, /moveDrawerTab/);
  assert.match(pipelineComponentSource, /Home/);
  assert.match(pipelineComponentSource, /End/);
  assert.match(pipelineComponentSource, /disabled/);
  assert.match(pipelineComponentSource, /aria-describedby/);
  assert.match(pipelineComponentSource, /sr-only/);
  assert.match(pipelineComponentSource, /max-sm:hidden/);
  assert.match(pipelineComponentSource, /tabIndex=\{0\}/);
  assert.match(pipelineComponentSource, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(pipelineComponentSource, /overflow-x-auto/);
  assert.match(pipelineComponentSource, /snap-x/);
  assert.match(pipelineComponentSource, /snap-start/);
  assert.match(pipelineComponentSource, /grid-rows-\[auto_minmax\(0,1fr\)\]/);
  assert.match(pipelineComponentSource, /min-h-\[34rem\]/);
  assert.match(pipelineComponentSource, /Refined pipeline cockpit frame/);
  assert.match(pipelineComponentSource, /Cockpit first-frame hierarchy/);
  assert.match(pipelineComponentSource, /Worker review memory recovery rail/);
  assert.match(pipelineComponentSource, /Evidence runway/);
  assert.match(pipelineComponentSource, /xl:grid-cols-\[13\.75rem_minmax\(0,1fr\)_22\.5rem\]/);
  assert.match(pipelineComponentSource, /lg:grid-cols-\[13\.75rem_minmax\(0,1fr\)\]/);
  assert.match(pipelineComponentSource, /break-words/);
  assert.doesNotMatch(cockpitSource, /import\s+\{\s*pipelineStages\s+\}\s+from\s+"..\/..\/lib\/pipeline-fixtures"/);
  assert.match(pipelineComponentSource, /EvidenceDetailList/);
  assert.match(pipelineComponentSource, /selectedGateActionId/);
  assert.match(pipelineComponentSource, /selectedGateFixtureEventId/);
  assert.match(pipelineComponentSource, /setSelectedGateActionId/);
  assert.match(pipelineComponentSource, /setSelectedGateFixtureEventId/);
  assert.match(pipelineComponentSource, /expandedGateActionId/);
  assert.match(pipelineComponentSource, /Consequence preview/);
  assert.match(pipelineComponentSource, /Fixture event/);
  assert.match(pipelineComponentSource, /canActivateHumanGateAction/);
  assert.match(pipelineComponentSource, /authorityLevelLabel/);
  assert.match(pipelineComponentSource, /humanGateFixtureEvents\.find\(\(event\) => event\.actionId === action\.actionId\)/);
  assert.match(pipelineComponentSource, /action\.requiredEvidenceRefs\.length > 0/);
  assert.match(pipelineComponentSource, /action\.payload\.packetId === packet\.packetId/);
  assert.match(pipelineComponentSource, /action\.payload\.actionId === action\.actionId/);
  assert.match(pipelineComponentSource, /fixtureEvent !== undefined/);
  assert.match(pipelineComponentSource, /fixtureEvent\.toStage === action\.resultingStage/);
  assert.match(pipelineComponentSource, /fixtureEvent\.toOwner === action\.resultingOwner/);
  assert.match(pipelineComponentSource, /fixtureEvent\.evidenceRefs\.every/);
  assert.match(pipelineComponentSource, /Preview fixture event/);
  assert.match(pipelineComponentSource, /aria-expanded/);
  assert.match(pipelineComponentSource, /onToggle/);
  assert.match(pipelineComponentSource, /sourceRefImportance/);
  assert.match(pipelineComponentSource, /evidenceRefImportance/);
  assert.match(pipelineComponentSource, /artifactRefImportance/);
  assert.match(pipelineComponentSource, /gateEvidenceReason/);
  assert.match(pipelineComponentSource, /recoveryEvidenceReason/);
  assert.match(pipelineComponentSource, /RecoveryDrawerPanel/);
  assert.match(pipelineComponentSource, /ActionGuardPanel/);
  assert.match(pipelineComponentSource, /ActionGuardSummary/);
  assert.match(pipelineComponentSource, /evaluateFixtureActionDecision/);
  assert.match(pipelineComponentSource, /blockingActionGuard/);
  assert.match(pipelineComponentSource, /Stale or unsafe action guard/);
  assert.match(pipelineComponentSource, /Deterministic guard cases/);
  assert.match(pipelineComponentSource, /State changed/);
  assert.match(pipelineComponentSource, /Action binding/);
  assert.match(pipelineComponentSource, /Primary risk prevented/);
  assert.match(pipelineComponentSource, /Safe next option/);
  assert.match(pipelineComponentSource, /evaluateFixtureActionDecision\(packet, action\.actionId, "human_gate"\)\.submitCapable/);
  assert.match(pipelineComponentSource, /recoveryRequiresHumanGate\(fixtureEvent\)/);
  assert.match(pipelineComponentSource, /Human Gate reference/);
  assert.match(pipelineComponentSource, /selectedRecoveryActionId/);
  assert.match(pipelineComponentSource, /selectedRecoveryFixtureEventId/);
  assert.match(pipelineComponentSource, /expandedRecoveryActionId/);
  assert.match(pipelineComponentSource, /Recovery consequence/);
  assert.match(pipelineComponentSource, /Recovery fixture event/);
  assert.match(pipelineComponentSource, /Preview recovery event/);
  assert.match(pipelineComponentSource, /canSelectRecoveryAction/);
  assert.match(pipelineComponentSource, /recoveryRequiresHumanGate/);
  assert.match(pipelineComponentSource, /humanGateActions\.find/);
  assert.match(pipelineComponentSource, /recoveryFixtureEvents\.find\(\(event\) => event\.actionId === action\.actionId\)/);
  assert.match(pipelineComponentSource, /fixtureEvent !== undefined/);
  assert.match(pipelineComponentSource, /fixtureEvent\.toStage === action\.resultingStage/);
  assert.match(pipelineComponentSource, /fixtureEvent\.toOwner === action\.resultingOwner/);
  assert.match(fixtureSource, /routeFork/);
  assert.match(fixtureSource, /pipelineFixtureScenarios/);
  assert.match(fixtureSource, /pipelineGoldenPathSnapshots/);
  assert.match(fixtureSource, /pipelineDensityFixturePackets/);
  assert.match(fixtureSource, /pipelineCockpitPackets/);
  assert.match(fixtureSource, /Array\.from\(\{ length: 15 \}/);
  assert.match(fixtureSource, /Density \$\{ordinal\}:/);
  assert.match(routeSource, /pipelineCockpitPackets/);
  const fixturePacketCount = (fixtureSource.match(/packetFixture\(\{/g) ?? []).length;
  const densityCloneCountMatch = fixtureSource.match(/Array\.from\(\{ length: (\d+) \}/);
  assert.ok(densityCloneCountMatch, "density fixture clone count should be explicit");
  assert.ok(fixturePacketCount + Number(densityCloneCountMatch[1]) >= 25, "pipeline cockpit should load at least 25 fixture packets");
  for (const snapshotLabel of [
    "Capture",
    "Classify",
    "Route",
    "Shape",
    "Human Gate",
    "Execute",
    "Review",
    "Deliver",
    "Learn",
  ]) {
    assert.match(fixtureSource, new RegExp(`"${snapshotLabel}"`));
  }
  for (const snapshotField of [
    "snapshotId",
    "packetId",
    "currentStage",
    "currentOwner",
    "evidenceRef",
    "nextAction",
    "decisionConsequence",
    "whatPacketIs",
    "whyHere",
    "whatNeedsOperator",
    "whatHappensNext",
  ]) {
    assert.match(fixtureSource, new RegExp(snapshotField));
  }
  for (const scenarioLabel of [
    "happy path",
    "model unavailable",
    "local GPU busy",
    "low-confidence route",
    "source excluded",
    "stale memory",
    "contradiction detected",
    "Hermes timeout",
    "Claude skipped",
    "rejected Claude finding",
    "blocked Obsidian write-back",
    "provider approval required",
    "recovery action available",
    "no-packets",
  ]) {
    assert.match(fixtureSource, new RegExp(`label:\\s*"${scenarioLabel}"|,\\s*"${scenarioLabel}"`));
  }
  for (const scenarioField of [
    "currentOwner",
    "blockedReason",
    "nextOperatorOption",
    "fixtureLabel",
    "evidenceRefs",
    "stopLine",
    "rollbackPath",
    "selectedPacketId",
  ]) {
    assert.match(fixtureSource, new RegExp(scenarioField));
  }
  assert.match(fixtureSource, /lowConfidenceActions/);
  assert.match(fixtureSource, /rejectedRoutes/);
  assert.match(fixtureSource, /riskFlags/);
  assert.match(fixtureSource, /lastEvent/);
  assert.match(fixtureSource, /requireCatalogEntry/);
  assert.match(fixtureSource, /requireMatrixRows/);
  assert.match(fixtureSource, /validatePacketMatrixRows/);
  assert.match(fixtureSource, /requireSelectedPipelinePacket/);
  assert.match(fixtureSource, /PIPELINE_STATE_EVIDENCE_MATRIX_V0|PIPELINE_STATE_FIXTURE_CATALOG_V0/);
  assert.doesNotMatch(fixtureSource, /rawPrompt|rawCompletion|reasoningTrace|providerPayload|secretValue|credentialValue|credentialPayload|writeBackAllowed:\s*true/);
  assert.doesNotMatch(allPipelineSource, /rawPrompt|rawCompletion|reasoningTrace|providerPayload|secretValue|credentialValue|credentialPayload|memoryDump|fullRawHistory/);
  assert.doesNotMatch(allPipelineSource, /lib\/supervisor|getRunStatus|getWorkItems|getWorkPackets|fetch\s*\(|EventSource|WebSocket|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(routeSource + "\n" + pipelineComponentSource, /11434\/v1\/chat\/completions|OllamaProviderAdapter|ollama_provider_adapter|model\s*discovery|endpoint\s*discovery/i);
  assert.doesNotMatch(
    allPipelineSource,
    /from\s+["']node:child_process["']|require\(["']child_process["']\)|spawn\s*\(|exec\s*\(|from\s+["']node:worker_threads["']|from\s+["']node:http["']|from\s+["']node:https["']|from\s+["']node:fs["']|from\s+["']fs["']|writeFile\s*\(|appendFile\s*\(|mkdir\s*\(|rename\s*\(|unlink\s*\(|from\s+["']undici["']|from\s+["']axios["']|import\s*\(\s*["']openai["']|import\s*\(\s*["']@anthropic|new\s+Worker\s*\(|Dockerode|dockerode|@docker|createContainer|runHermes|launchHermes|HermesRuntime|runCodex|launchCodex|CodexRuntime|runClaude|launchClaude|ClaudeRuntime|writeObsidian|mutateObsidian|updateCanonicalMemory|canonicalMemoryUpdate|obsidianWriteBack|vaultWrite|from\s+["']@anthropic|from\s+["']openai|api\.anthropic|api\.openai|killSwitch\(\)/i
  );
  assert.match(navSource, /href:\s*"\/pipeline"/);
});

test("pipeline local model health fixtures cover readiness states without direct provider probes", async () => {
  const { pipelineCockpitPackets, pipelineFixturePackets, pipelineLocalModelHealthFixtures } = await loadCompiledDashboardFixtures();

  const requiredStates = ["healthy", "unavailable", "busy", "model_mismatch", "endpoint_mismatch", "approval_required"];
  assert.deepEqual(
    requiredStates.filter((state) => !pipelineLocalModelHealthFixtures.some((fixture) => fixture.statusLabel === state)),
    [],
    "local model health fixtures should cover every required status"
  );

  for (const fixture of pipelineLocalModelHealthFixtures) {
    assert.equal(fixture.provider, "ollama");
    assert.equal(fixture.retentionPolicy, "metadata_only");
    assert.equal(fixture.dataSource, "fixture_or_wrapper_state_only");
    assert.equal(fixture.noProbeBoundary, "Dashboard does not probe the Windows Ollama endpoint");
    assert.equal(fixture.approvedEndpointUrl, "approved VM-to-host Ollama endpoint (redacted)");
    assert.ok(!/http:\/\/|https:\/\/|11434|192\.168\.|127\.0\.0\.1/.test(fixture.approvedEndpointUrl), `${fixture.statusLabel} should not expose a concrete provider endpoint`);
    assert.equal(fixture.endpointApproved, fixture.endpointUrl === fixture.approvedEndpointUrl, `${fixture.statusLabel} endpoint approval should match configured vs approved endpoint`);
    assert.equal(fixture.modelApproved, fixture.modelId === fixture.approvedModelId, `${fixture.statusLabel} model approval should match configured vs approved model`);
    assert.doesNotMatch(fixture.fallbackPath, /openai|anthropic|claude|remote provider|alternate provider|silently route/i, `${fixture.statusLabel} fallback should not route to another provider`);
    assert.ok(fixture.allowedCaller.length > 0, `${fixture.statusLabel} should name the allowed caller/source`);
    assert.ok(fixture.fallbackPath.length > 0, `${fixture.statusLabel} should name a fallback path`);
    assert.ok(fixture.authoritySummary.length > 0, `${fixture.statusLabel} should explain call authority`);
    assert.ok(fixture.statusLabel.length > 0, "status label should be visible");

    if (fixture.statusLabel !== "healthy") {
      assert.ok(fixture.lastFailure?.length > 0 || fixture.callAuthorityState !== "approved", `${fixture.statusLabel} should expose failure or authority context`);
    }
  }

  const byState = Object.fromEntries(pipelineLocalModelHealthFixtures.map((fixture) => [fixture.statusLabel, fixture]));
  assert.equal(byState.healthy.endpointApproved, true);
  assert.equal(byState.healthy.modelApproved, true);
  assert.equal(byState.healthy.reachable, true);
  assert.equal(byState.healthy.busyState, "idle");
  assert.equal(byState.healthy.callAuthorityState, "approved");
  assert.equal(typeof byState.healthy.lastLatencyMs, "number");
  assert.equal(byState.unavailable.reachable, false);
  assert.equal(byState.unavailable.callAuthorityState, "blocked");
  assert.equal(byState.busy.reachable, true);
  assert.equal(byState.busy.busyState, "busy");
  assert.equal(byState.model_mismatch.modelApproved, false);
  assert.equal(byState.model_mismatch.callAuthorityState, "approval_required");
  assert.equal(byState.endpoint_mismatch.endpointApproved, false);
  assert.equal(byState.endpoint_mismatch.callAuthorityState, "approval_required");
  assert.equal(byState.approval_required.endpointApproved, true);
  assert.equal(byState.approval_required.modelApproved, true);
  assert.equal(byState.approval_required.callAuthorityState, "approval_required");

  const packetsWithHealth = pipelineFixturePackets.filter((packet) => packet.localModelHealth !== null);
  assert.ok(packetsWithHealth.length >= requiredStates.length, "fixture packets should expose local model health examples");
  for (const state of requiredStates) {
    const packet = packetsWithHealth.find((candidate) => candidate.localModelHealth?.statusLabel === state);
    assert.ok(packet, `missing packet-bound local model health state ${state}`);
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "local_model" && lane.evidenceRefs.includes(packet.localModelHealth.evidenceRef)),
      `${state} should be represented by a local_model lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.localModelHealth.evidenceRef && ref.evidenceType === "local_model" && ref.rawPayloadRetained === false),
      `${state} should have metadata-only local_model evidence`
    );
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.localModelHealth !== null)) {
    const refs = packet.evidenceRefs.map((ref) => ref.refId);
    assert.equal(refs.filter((ref) => ref === packet.localModelHealth.evidenceRef).length, 1, `${packet.packetId} should contain local health evidence exactly once`);
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "local_model" && lane.evidenceRefs.includes(packet.localModelHealth.evidenceRef)),
      `${packet.packetId} local model lane should point at packet-local health evidence`
    );
    assert.match(packet.localModelHealth.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} local health evidence should be packet-local`);
  }
});

test("pipeline Hermes worker fixtures render mocked containment without runtime paths", async () => {
  const { pipelineCockpitPackets, pipelineFixturePackets, pipelineHermesJobFixtures } = await loadCompiledDashboardFixtures();

  const requiredStates = ["mocked_ready", "mocked_timeout", "blocked_containment"];
  assert.deepEqual(
    requiredStates.filter((state) => !pipelineHermesJobFixtures.some((fixture) => fixture.statusLabel === state)),
    [],
    "Hermes fixtures should cover ready, timeout, and blocked containment states"
  );

  for (const fixture of pipelineHermesJobFixtures) {
    assert.equal(fixture.executionMode, "mocked");
    assert.equal(fixture.credentialPolicy, "none");
    assert.equal(fixture.sourceMutationPolicy, "forbidden");
    assert.equal(fixture.networkPolicy, "none");
    assert.ok(fixture.jobId.length > 0);
    assert.ok(fixture.packetId.length > 0);
    assert.ok(fixture.workerProfile.length > 0);
    assert.ok(fixture.inputRefs.length > 0);
    assert.ok(fixture.allowedMounts.length > 0);
    assert.ok(fixture.writableOutputDir.length > 0);
    assert.ok(fixture.timeoutSeconds >= 0);
    assert.ok(fixture.expectedOutputSchema.length > 0);
    assert.equal(fixture.cleanupPolicy, "preview cleanup policy only; no filesystem cleanup runs");
    assert.equal(fixture.killSwitch, "visible policy stop line only; not runnable from dashboard");
    assert.ok(fixture.containmentSummary.length > 0);
    assert.match(fixture.boundarySummary, /no Docker worker is launched/i);
    assert.doesNotMatch(`${fixture.cleanupPolicy} ${fixture.killSwitch}`, /execute|executed|launch/i);
  }

  const packetsWithHermes = pipelineFixturePackets.filter((packet) => packet.hermesJob !== null);
  assert.ok(packetsWithHermes.length >= requiredStates.length, "fixture packets should expose Hermes job examples");
  for (const state of requiredStates) {
    const packet = packetsWithHermes.find((candidate) => candidate.hermesJob?.statusLabel === state);
    assert.ok(packet, `missing packet-bound Hermes state ${state}`);
    assert.equal(packet.hermesJob.executionMode, "mocked");
    if (state === "mocked_ready") {
      assert.equal(packet.status, "blocked", "mocked_ready is ready for inspection only until runtime authority exists");
      assert.match(packet.hermesJob.containmentSummary, /ready for inspection without runtime authority/i);
    }
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "hermes_worker_mock" && lane.evidenceRefs.includes(packet.hermesJob.evidenceRef)),
      `${state} should be represented by a hermes_worker_mock lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.hermesJob.evidenceRef && ref.retentionClass === "metadata_only" && ref.rawPayloadRetained === false),
      `${state} should have metadata-only Hermes evidence`
    );
  }

  for (const packet of packetsWithHermes.filter((candidate) => candidate.status === "blocked")) {
    const actionTypes = new Set(packet.recoveryActions.map((action) => action.actionType));
    for (const expectedAction of ["retry_smaller", "reroute", "send_back_to_shape"]) {
      assert.ok(actionTypes.has(expectedAction), `${packet.packetId} should expose ${expectedAction} recovery`);
    }
    assert.ok(packet.recoveryFixtureEvents.length > 0, `${packet.packetId} should expose recovery fixture events`);
    for (const action of packet.recoveryActions.filter((candidate) => actionTypes.has(candidate.actionType))) {
      const fixtureEvent = packet.recoveryFixtureEvents.find((event) => event.actionId === action.actionId);
      assert.equal(action.availability, "available", `${packet.packetId} ${action.actionType} should be previewable in the Recovery Drawer`);
      assert.ok(fixtureEvent, `${packet.packetId} ${action.actionType} should have a recovery fixture event`);
      assert.equal(fixtureEvent.requiresHumanGate, true, `${packet.packetId} ${action.actionType} should preserve Human Gate authority`);
      assert.ok(fixtureEvent.humanGateActionId, `${packet.packetId} ${action.actionType} should reference a Human Gate action`);
    }
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.hermesJob !== null)) {
    const refs = packet.evidenceRefs.map((ref) => ref.refId);
    assert.equal(refs.filter((ref) => ref === packet.hermesJob.evidenceRef).length, 1, `${packet.packetId} should contain Hermes evidence exactly once`);
    assert.match(packet.hermesJob.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} Hermes evidence should be packet-local`);
    assert.ok(packet.hermesJob.inputRefs.every((ref) => ref.includes(packet.packetId)), `${packet.packetId} Hermes input refs should be packet-local`);
    assert.ok(
      packet.hermesJob.writableOutputDir === "not allocated in fixture mode" || packet.hermesJob.writableOutputDir.includes(packet.packetId.replaceAll(":", "-")),
      `${packet.packetId} Hermes writable output metadata should be packet-local or explicitly unallocated`
    );
  }
});

test("pipeline Codex and Claude lane fixtures stay distinct and metadata-only", async () => {
  const { pipelineClaudeReviewFixtures, pipelineCockpitPackets, pipelineCodexWorkerFixtures, pipelineFixturePackets } = await loadCompiledDashboardFixtures();

  const pipelineComponentSource = await readPipelineComponentSource();

  assert.ok(Array.isArray(pipelineCodexWorkerFixtures), "Codex worker fixtures should be exported");
  assert.ok(Array.isArray(pipelineClaudeReviewFixtures), "Claude review fixtures should be exported");
  assert.ok(pipelineCodexWorkerFixtures.length > 0, "Codex worker fixtures should cover active/readiness state");
  assert.ok(pipelineClaudeReviewFixtures.length > 0, "Claude review fixtures should cover skipped or blocked review state");
  assert.match(pipelineComponentSource, /packet\.codexWorker \? <CodexWorkerCard worker=\{packet\.codexWorker\} \/> : null/);
  assert.match(pipelineComponentSource, /packet\.claudeReview \? <ClaudeReviewerCard review=\{packet\.claudeReview\} \/> : null/);
  assert.match(pipelineComponentSource, /Implementation worker lane/);
  assert.match(pipelineComponentSource, /Reviewer \/ second opinion/);

  for (const fixture of pipelineCodexWorkerFixtures) {
    assert.equal(fixture.role, "implementation_worker");
    assert.equal(fixture.retentionPolicy, "metadata_only");
    assert.ok(fixture.attemptRefs.length > 0);
    assert.match(fixture.boundarySummary, /not.*independent reviewer/i);
    assert.doesNotMatch(`${fixture.role} ${fixture.boundarySummary}`, /second opinion|reviewer lane/i);
    assert.equal(Object.hasOwn(fixture, "command"), false);
    assert.equal(Object.hasOwn(fixture, "endpointUrl"), false);
    assert.equal(Object.hasOwn(fixture, "apiKey"), false);
    assert.equal(Object.hasOwn(fixture, "runtimeAdapter"), false);
  }

  for (const fixture of pipelineClaudeReviewFixtures) {
    assert.equal(fixture.retentionPolicy, "metadata_only");
    assert.equal(fixture.costScarcity, "scarce");
    assert.ok(["required", "policy_triggered"].includes(fixture.approvalRequirement));
    assert.equal(fixture.executionMode, "readiness_or_packet_only");
    assert.match(fixture.boundarySummary, /not an implementation lane/i);
    assert.ok(fixture.allowedContextRefs.length > 0);
    assert.ok(fixture.excludedContextRefs.length > 0);
    assert.ok(fixture.expectedFindingsSchema.length > 0);
    assert.equal(Object.hasOwn(fixture, "command"), false);
    assert.equal(Object.hasOwn(fixture, "endpointUrl"), false);
    assert.equal(Object.hasOwn(fixture, "apiKey"), false);
    assert.equal(Object.hasOwn(fixture, "runtimeAdapter"), false);
  }

  const packetsWithCodex = pipelineFixturePackets.filter((packet) => packet.codexWorker !== null);
  const packetsWithClaude = pipelineFixturePackets.filter((packet) => packet.claudeReview !== null);
  assert.ok(packetsWithCodex.length > 0, "fixture packets should expose Codex worker state");
  assert.ok(packetsWithClaude.length > 0, "fixture packets should expose Claude review state");
  assert.deepEqual(
    ["ready", "active", "blocked"].filter((state) => !packetsWithCodex.some((packet) => packet.codexWorker?.readiness === state)),
    [],
    "packet-bound Codex fixtures should cover ready, active, and blocked readiness"
  );
  assert.deepEqual(
    ["pending", "skipped", "blocked"].filter((state) => !packetsWithClaude.some((packet) => packet.claudeReview?.statusLabel === state)),
    [],
    "packet-bound Claude fixtures should cover pending, skipped, and blocked review states"
  );

  const packetWithoutWorkerCards = pipelineFixturePackets.find((packet) => packet.codexWorker === null && packet.claudeReview === null);
  assert.ok(packetWithoutWorkerCards, "at least one packet should prove nullable Codex/Claude metadata remains absent");
  assert.equal(packetWithoutWorkerCards.laneCards.some((lane) => lane.laneType === "codex_worker" || lane.laneType === "claude_reviewer"), false);

  for (const packet of packetsWithCodex) {
    assert.equal(packet.codexWorker.role, "implementation_worker");
    assert.notEqual(packet.codexWorker.role, "independent_reviewer");
    assert.equal(packet.reviewSummaries.some((review) => review.reviewer === "codex_worker"), false, `${packet.packetId} should not present Codex as a reviewer`);
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "codex_worker" && lane.evidenceRefs.includes(packet.codexWorker.evidenceRef)),
      `${packet.packetId} should expose a codex_worker lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.codexWorker.evidenceRef && ref.retentionClass === "metadata_only" && ref.rawPayloadRetained === false),
      `${packet.packetId} Codex evidence should be metadata-only`
    );
    if (packet.codexWorker.readiness === "active") {
      assert.ok(packet.laneCards.some((lane) => lane.laneType === "codex_worker" && lane.status === "running"), `${packet.packetId} active Codex lane should be running`);
    }
  }

  for (const packet of packetsWithClaude) {
    assert.ok(["skipped", "blocked", "pending"].includes(packet.claudeReview.statusLabel));
    assert.ok(
      packet.laneCards.some((lane) => lane.laneType === "claude_reviewer" && lane.evidenceRefs.includes(packet.claudeReview.evidenceRef)),
      `${packet.packetId} should expose a claude_reviewer lane card`
    );
    assert.ok(
      packet.evidenceRefs.some((ref) => ref.refId === packet.claudeReview.evidenceRef && ref.retentionClass === "metadata_only" && ref.rawPayloadRetained === false),
      `${packet.packetId} Claude evidence should be metadata-only`
    );
    assert.equal(packet.claudeReview.executionMode, "readiness_or_packet_only");
    assert.doesNotMatch(packet.nextAction, /implement with claude|claude implementation/i);
    assert.ok(packet.reviewSummaries.some((review) => review.reviewer === "claude_reviewer" && review.evidenceRefs.includes(packet.claudeReview.evidenceRef)));
    if (packet.claudeReview.statusLabel === "pending") {
      assert.ok(packet.matrixRowIds.includes("mock.claude_pending_skipped"), `${packet.packetId} should reuse the Claude pending/skipped matrix row`);
      assert.equal(packet.currentOwner, "claude_reviewer");
    }
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.codexWorker !== null || candidate.claudeReview !== null)) {
    if (packet.codexWorker) {
      assert.match(packet.codexWorker.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} Codex evidence should be packet-local`);
      assert.ok(packet.codexWorker.attemptRefs.every((ref) => ref.includes(packet.packetId)), `${packet.packetId} Codex attempt refs should be packet-local`);
    }
    if (packet.claudeReview) {
      assert.match(packet.claudeReview.evidenceRef, new RegExp(escapeRegExp(packet.packetId)), `${packet.packetId} Claude evidence should be packet-local`);
      assert.ok(packet.claudeReview.allowedContextRefs.every((ref) => ref.includes(packet.packetId)), `${packet.packetId} Claude allowed context should be packet-local`);
    }
  }
});

test("pipeline memory proposal fixtures stay review-gated and proposal-only", async () => {
  const { pipelineCockpitPackets, pipelineFixturePackets } = await loadCompiledDashboardFixtures();
  const pipelineComponentSource = await readPipelineComponentSource();
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  const allPipelineSource = `${routeSource}\n${fixtureSource}\n${pipelineComponentSource}`;

  assert.match(pipelineComponentSource, /MemoryProposalCard/);
  assert.match(pipelineComponentSource, /packet\.memoryProposals\.map\(\(proposal\) => <MemoryProposalCard/);

  for (const visibleLabel of [
    "Memory Proposal Card",
    "Proposal id",
    "Packet id",
    "Target path",
    "Target folder",
    "Proposal type",
    "Patch summary",
    "Sensitivity",
    "Freshness",
    "Contradiction",
    "Confidence",
    "Operator action",
    "Decision context",
    "Backup / recovery",
    "Write-back status",
    "Source boundary labels",
    "Proposal-only boundary",
    "Obsidian is canonical and human-owned",
    "LLM-Wiki is derived, disposable, and rebuildable",
  ]) {
    assert.match(pipelineComponentSource + fixtureSource, new RegExp(visibleLabel, "i"));
  }

  const memoryPackets = pipelineFixturePackets.filter((packet) => packet.memoryProposals.length > 0);
  assert.ok(memoryPackets.length > 0, "fixture packets should expose memory proposals");
  assert.ok(
    memoryPackets.some((packet) => packet.fixtureId === "obsidian_proposal_pending_approval"),
    "memory proposals should reuse obsidian_proposal_pending_approval"
  );

  const allProposals = memoryPackets.flatMap((packet) => packet.memoryProposals.map((proposal) => ({ packet, proposal })));
  assert.deepEqual(
    ["not_applicable", "proposed", "pending_human_approval", "approved", "rejected", "deferred", "edit_needed", "stale", "contradictory", "blocked"].filter(
      (status) => !allProposals.some(({ proposal }) => proposal.status === status)
    ),
    [],
    "memory proposals should cover every review state"
  );

  for (const { packet, proposal } of allProposals) {
    const packetSourceRefIds = new Set(packet.sourceRefs.map((ref) => ref.refId));
    const packetEvidenceRefIds = new Set(packet.evidenceRefs.map((ref) => ref.refId));
    assert.equal(proposal.packetId, packet.packetId);
    assert.ok(proposal.proposalId.includes(packet.packetId), `${packet.packetId} proposal id should be packet-local`);
    assert.ok(proposal.sourceRefs.length > 0, `${packet.packetId} proposal should cite source refs`);
    assert.ok(proposal.evidenceRefs.length > 0, `${packet.packetId} proposal should cite evidence refs`);
    assert.ok(proposal.sourceRefs.every((refId) => packetSourceRefIds.has(refId)), `${packet.packetId} proposal source refs should resolve to packet source refs`);
    assert.ok(proposal.evidenceRefs.every((refId) => packetEvidenceRefIds.has(refId)), `${packet.packetId} proposal evidence refs should resolve to packet evidence refs`);
    assert.ok(proposal.targetVaultPath || proposal.targetVaultFolder, `${packet.packetId} proposal should name a target path or folder`);
    if (packet.fixtureId === "obsidian_proposal_pending_approval") {
      assert.ok(proposal.sourceRefs.some((ref) => ref.includes("obsidian-human-owned")), `${packet.packetId} proposal should cite the Obsidian human-owned boundary`);
      assert.ok(proposal.sourceRefs.some((ref) => ref.includes("llm-wiki-derived-only")), `${packet.packetId} proposal should cite the LLM-Wiki derived-only boundary`);
    }
    assert.ok(proposal.suggestedContentSummary.length > 0, `${packet.packetId} proposal should summarize suggested content`);
    assert.ok(proposal.backupRecoveryPath.length > 0, `${packet.packetId} proposal should describe backup/recovery`);
    assert.equal(proposal.writeBackAllowed, false, `${packet.packetId} proposal should not allow direct write-back`);
    assert.match(proposal.writeBackStatus, /blocked|review_gated|approved_for_future|deferred/);
    if (proposal.status === "approved" && packet.packetId !== "fixture:llm-wiki-rebuild-preview") {
      assert.equal(proposal.writeBackStatus, "review_gated", `${packet.packetId} approved proposal should still require a later review-gated workflow`);
    }
    if (packet.packetId === "fixture:llm-wiki-rebuild-preview") {
      assert.equal(proposal.writeBackStatus, "approved_for_future", `${packet.packetId} ready preview proposal should be approved for future workflow metadata`);
    }
    if (proposal.contradictionStatus === "confirmed") {
      assert.match(proposal.status, /^(contradictory|blocked|edit_needed|deferred)$/, `${packet.packetId} confirmed contradiction should not render as approved`);
    }
    for (const target of [proposal.targetVaultPath, proposal.targetVaultFolder].filter(Boolean)) {
      assert.doesNotMatch(target, /^(\/|[A-Za-z]:\\|~\/|\\\\)|\.\.|\.obsidian|\.ssh|secret|credential/i, `${packet.packetId} proposal target should be relative and non-sensitive`);
    }
    assert.doesNotMatch(`${proposal.suggestedContentSummary} ${proposal.patchSummary ?? ""} ${proposal.backupRecoveryPath}`, /raw prompt|raw completion|reasoning trace|provider payload|secret|credential/i);

    if (["stale", "contradictory", "blocked", "deferred", "edit_needed"].includes(proposal.status)) {
      assert.ok(proposal.decisionNeededContext?.length > 0, `${proposal.status} proposal should expose decision-needed context`);
    }
  }

  for (const packet of pipelineCockpitPackets.filter((candidate) => candidate.memoryProposals.length > 0)) {
    assert.ok(packet.memoryProposals.every((proposal) => proposal.proposalId.includes(packet.packetId)), `${packet.packetId} memory proposal refs should be packet-local`);
    if (packet.packetId === "fixture:llm-wiki-rebuild-preview") {
      const preview = packet.alphaMemorySourceStatus?.llmWikiReadiness?.rebuildPreview;
      assert.ok(preview, `${packet.packetId} ready fixture should expose a rebuild preview`);
      assert.equal(preview.durableWriteAllowed, false);
      assert.ok(preview.inputRefs.some((ref) => ref.includes("obsidian-approved")), `${packet.packetId} preview should include approved Obsidian input ref`);
    } else {
      assert.equal(packet.alphaMemorySourceStatus?.llmWikiReadiness?.rebuildPreview ?? null, null, `${packet.packetId} blocked fixture proposals should not expose a rebuild preview`);
    }
  }

  assert.match(fixtureSource, /fixture:llm-wiki-rebuild-preview/);
  assert.match(fixtureSource, /rebuildPreview/);
  assert.match(fixtureSource, /llm-wiki-rebuild-preview/);
  assert.match(fixtureSource, /do not write LLM-Wiki index/);
  assert.doesNotMatch(fixtureSource, /writeBackAllowed:\s*true/);
  assert.doesNotMatch(
    allPipelineSource,
    /writeObsidian|mutateObsidian|updateCanonicalMemory|canonicalMemoryUpdate|obsidianWriteBack|vaultWrite|from\s+["']node:fs["']|from\s+["']fs["']|writeFile\s*\(|appendFile\s*\(|rename\s*\(|unlink\s*\(/i
  );
});

test("pipeline source boundary checklist preserves Obsidian and LLM-Wiki ownership", async () => {
  const { pipelineFixturePackets, pipelineSourceBoundaryChecklist } = await loadCompiledDashboardFixtures();
  const pipelineComponentSource = await readPipelineComponentSource();
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const allPipelineSource = `${fixtureSource}\n${pipelineComponentSource}`;

  assert.ok(Array.isArray(pipelineSourceBoundaryChecklist), "source boundary checklist should be exported");
  const requiredBoundaryIds = ["work_packet_v0", "obsidian", "llm_wiki", "hermes", "ollama", "codex", "claude"];
  const boundaryIds = pipelineSourceBoundaryChecklist.map((boundary) => boundary.boundaryId);
  assert.deepEqual(boundaryIds.toSorted(), requiredBoundaryIds.toSorted(), "source boundary checklist should contain only required boundaries");
  assert.equal(new Set(boundaryIds).size, requiredBoundaryIds.length, "source boundary checklist should not duplicate boundary ids");

  for (const boundary of pipelineSourceBoundaryChecklist) {
    assert.ok(boundary.canonicality.length > 0, `${boundary.boundaryId} should declare canonicality`);
    assert.ok(boundary.allowedReads.length > 0, `${boundary.boundaryId} should declare allowed reads`);
    assert.ok(boundary.allowedWrites.length > 0, `${boundary.boundaryId} should declare allowed writes`);
    assert.ok(boundary.retentionClass.length > 0, `${boundary.boundaryId} should declare retention class`);
    assert.ok(boundary.blockedOperations.length > 0, `${boundary.boundaryId} should declare blocked operations`);
    assert.ok(boundary.boundarySummary.length > 0, `${boundary.boundaryId} should declare boundary summary`);
  }

  const obsidian = pipelineSourceBoundaryChecklist.find((boundary) => boundary.boundaryId === "obsidian");
  const llmWiki = pipelineSourceBoundaryChecklist.find((boundary) => boundary.boundaryId === "llm_wiki");
  assert.equal(obsidian.canonicality, "canonical, human-owned");
  assert.match(obsidian.boundarySummary, /Obsidian is canonical and human-owned/i);
  assert.match(obsidian.blockedOperations.join(" "), /direct write-back|canonical mutation/i);
  assert.equal(llmWiki.canonicality, "derived, disposable, rebuildable");
  assert.match(llmWiki.boundarySummary, /LLM-Wiki is derived, disposable, and rebuildable/i);
  assert.doesNotMatch(`${llmWiki.canonicality} ${llmWiki.boundarySummary}`, /\bcanonical\b/i);

  assertRequiredBlockedOps(pipelineSourceBoundaryChecklist, {
    work_packet_v0: ["raw payload retention", "inventing authority", "source mutation"],
    obsidian: ["direct write-back", "canonical mutation", "note overwrite", "agent-owned memory promotion"],
    llm_wiki: ["promote derived wiki to source of truth", "override Obsidian", "durable vault write-back"],
    hermes: ["real worker launch", "Docker execution", "source mutation", "network egress"],
    ollama: ["provider execution from dashboard", "endpoint discovery", "model gateway replacement"],
    codex: ["self-review authority", "dashboard process launch", "source mutation from fixture mode"],
    claude: ["implementation-lane use", "routine automation", "provider call from dashboard"],
  });

  const memoryPacket = pipelineFixturePackets.find((packet) => packet.packetId === "fixture:learn-memory");
  assert.ok(memoryPacket, "learn-memory packet should exist");
  assert.ok(memoryPacket.sourceRefs.some((ref) => ref.sourceType === "obsidian" && /human-owned/i.test(ref.label)), "learn-memory should include human-owned Obsidian ref");
  assert.ok(memoryPacket.sourceRefs.some((ref) => ref.sourceType === "llm_wiki" && /derived-only/i.test(ref.label)), "learn-memory should include derived-only LLM-Wiki ref");
  assert.equal(memoryPacket.alphaMemorySourceStatus?.llmWikiReadiness?.canonicality, "derived_disposable_rebuildable");
  assert.equal(memoryPacket.alphaMemorySourceStatus?.llmWikiReadiness?.durableWriteAllowed, false);
  assert.match(memoryPacket.alphaMemorySourceStatus?.llmWikiReadiness?.boundarySummary ?? "", /never overrides Obsidian/i);
  assert.ok(
    memoryPacket.memoryProposals.some((proposal) => proposal.status === "contradictory" && /Obsidian remains the default authority/i.test(proposal.decisionNeededContext ?? "")),
    "contradictory proposals should state Obsidian wins by default"
  );

  for (const visibleLabel of [
    "Source Boundary Checklist",
    "Boundary id",
    "Canonicality",
    "Allowed reads",
    "Allowed writes",
    "Retention class",
    "Blocked operations",
    "Boundary summary",
    "Obsidian is canonical and human-owned",
    "LLM-Wiki is derived, disposable, and rebuildable",
    "LLM-Wiki derived readiness",
    "Obsidian wins by default",
  ]) {
    assert.match(allPipelineSource, new RegExp(visibleLabel, "i"));
  }

  assert.doesNotMatch(allPipelineSource, /llm[-_ ]?wiki[^.\n]{0,80}canonical memory|canonicality:\s*"canonical[^"]*llm/i);
  assert.doesNotMatch(allPipelineSource, /writeObsidian|mutateObsidian|updateCanonicalMemory|canonicalMemoryUpdate|obsidianWriteBack|vaultWrite/i);
});

test("pipeline action guards reject stale unsafe unknown and boundary cases through fixture decision helper", async () => {
  const {
    evaluateFixtureActionDecision,
    pipelineDensityFixturePackets,
    pipelineFixturePackets,
  } = await loadCompiledDashboardFixtures();

  const allGuards = pipelineFixturePackets.flatMap((packet) => packet.actionGuardFixtures.map((guard) => ({ packet, guard })));
  for (const classification of [
    "stale_packet_state",
    "stale_action_id",
    "missing_evidence",
    "unknown_action",
    "unsafe_authority_class",
    "blocked_source_boundary",
  ]) {
    const match = allGuards.find(({ guard }) => guard.classification === classification);
    assert.ok(match, `missing executable guard fixture for ${classification}`);
    assert.equal(match.guard.primaryRisk, "false_authority", `${classification} should report false authority as primary risk`);
    assert.ok(match.guard.disabledReason.length > 0, `${classification} should explain disabled reason`);
    assert.ok(match.guard.stopLine.length > 0, `${classification} should include stop line`);
    assert.ok(match.guard.safeNextOption.length > 0, `${classification} should include safe next option`);
    assert.ok(match.guard.resultingStage.length > 0, `${classification} should keep known stage`);
    assert.ok(match.guard.resultingOwner.length > 0, `${classification} should keep known owner`);

    const decision = evaluateFixtureActionDecision(match.packet, match.guard.actionId, match.guard.actionSurface);
    assert.equal(decision.submitCapable, false, `${classification} should not be submit-capable`);
    assert.equal(decision.primaryRisk, "false_authority", `${classification} decision should report false authority`);
  }

  const staleId = allGuards.find(({ guard }) => guard.classification === "stale_action_id" && guard.expectedPacketId !== guard.actualPacketId && guard.expectedActionId !== guard.actualActionId);
  assert.ok(staleId, "stale packet and action id mismatch should be represented");

  const unknownGuard = allGuards.find(({ guard }) => guard.classification === "unknown_action");
  assert.ok(unknownGuard, "unknown action guard should exist");
  const unknownDecision = evaluateFixtureActionDecision(unknownGuard.packet, `${unknownGuard.packet.packetId}:action:not_in_packet`, "human_gate");
  assert.equal(unknownDecision.submitCapable, false);
  assert.equal(unknownDecision.guard?.classification, "unknown_action");
  assert.equal(unknownDecision.primaryRisk, "false_authority");

  const densityGuard = pipelineDensityFixturePackets
    .flatMap((packet) => packet.actionGuardFixtures.map((guard) => ({ packet, guard })))
    .find(({ guard }) => guard.safeNextOption.includes("Human Gate reference"));
  if (densityGuard) {
    assert.match(densityGuard.guard.safeNextOption, new RegExp(escapeRegExp(densityGuard.packet.packetId)));
  }
});

async function loadCompiledDashboardFixtures() {
  const outDir = await mkdtemp(join(tmpdir(), "dashboard-fixtures-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');
  const result = spawnSync(
    "apps/dashboard/node_modules/.bin/tsc",
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--verbatimModuleSyntax",
      "--rootDir",
      ".",
      "--outDir",
      outDir,
      "apps/dashboard/src/lib/pipeline-fixtures.ts",
      "packages/workflow-core/src/pipeline-state-fixture-matrix.ts",
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const compiledFixturePath = join(outDir, "apps/dashboard/src/lib/pipeline-fixtures.js");
  const compiledFixtureSource = await readFile(compiledFixturePath, "utf8");
  await writeFile(
    compiledFixturePath,
    compiledFixtureSource.replace(
      'from "@kendall/workflow-core"',
      'from "../../../../packages/workflow-core/src/pipeline-state-fixture-matrix.js"'
    )
  );

  return import(pathToFileURL(compiledFixturePath).href);
}

async function readPipelineComponentSource() {
  const componentFiles = (await readdir(pipelineComponentsPath)).filter((file) => file.endsWith(".tsx"));
  return (
    await Promise.all(componentFiles.map((file) => readFile(new URL(file, pipelineComponentsPath), "utf8")))
  ).join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertRequiredBlockedOps(boundaries, requiredByBoundaryId) {
  for (const [boundaryId, requiredOperations] of Object.entries(requiredByBoundaryId)) {
    const boundary = boundaries.find((candidate) => candidate.boundaryId === boundaryId);
    assert.ok(boundary, `${boundaryId} boundary should exist`);
    for (const operation of requiredOperations) {
      assert.ok(boundary.blockedOperations.includes(operation), `${boundaryId} should block ${operation}`);
    }
  }
}
