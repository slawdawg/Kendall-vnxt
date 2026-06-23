import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const MODE = "dry-run";
const TIER_1 = "tier-1-safe-automatic";
const TIER_2 = "tier-2-prepare-only";
const TIER_3 = "tier-3-block-and-ask";
const TOKEN_ECONOMY_CHECK = "pnpm run check:token-economy";
const DEFAULT_SOURCE_PATHS = [
  "docs/workflows/tool-churn-rca-examples.md",
  "docs/workflows/tool-churn-rca.md",
  "AGENTS.md",
  "docs/workflows/end-to-end-lane-runner.md",
  "scripts/check-token-economy.mjs",
];

const REQUIRED_TIER_1_FIELDS = [
  "failureClass",
  "signature",
  "wrongRetryPattern",
  "nextSafeAction",
];

const HIGHER_AUTHORITY_TERMS = [
  "credential",
  "credentials",
  "provider",
  "paid",
  "github mutation",
  "github workflow",
  "github workflows",
  "github actions",
  "branch protection",
  "cleanup expansion",
  "cleanup-authority",
  "worker launch",
  "branch deletion",
  "remote mutation",
  "force-push",
  "merge policy",
  "deployment",
  "dependency",
  "dependencies",
  "third-party tool",
  "danger",
  "reviewdog",
  "pre-commit",
  "actionlint",
  "zizmor",
  "vale",
  "opentelemetry",
];

const STATIC_VERIFICATION_ROUTES = {
  "docs/workflows/tool-churn-rca.md": {
    command: TOKEN_ECONOMY_CHECK,
    expectedEvidence: "token-economy drift check passes",
  },
  "docs/workflows/tool-churn-rca-examples.md": {
    command: TOKEN_ECONOMY_CHECK,
    expectedEvidence: "token-economy drift check passes",
  },
  "docs/workflows/end-to-end-lane-runner.md": {
    command: TOKEN_ECONOMY_CHECK,
    expectedEvidence: "token-economy drift check covers lane-runner guidance",
  },
  "scripts/check-token-economy.mjs": {
    command: "node ./scripts/check-token-economy.mjs",
    expectedEvidence: "changed drift check passes directly",
  },
};

const HIGHER_AUTHORITY_TARGETS = new Set([
  "AGENTS.md",
]);

const ROUTES = [
  {
    match: (event) => event.failureClass === "sandbox" && includesAny(event.signature, [
      ".git/worktrees read-only filesystem boundary",
      "$home/.cache/uv read-only filesystem boundary",
      "managed-worktree pnpm temp read-only filesystem boundary",
    ]),
    targetGuidance: "tool-churn-rca-examples",
    durableTarget: "docs/workflows/tool-churn-rca-examples.md",
  },
  {
    match: (event) => includesAny(event.signature, [
      "repeated sandbox failure",
      "shell quoting/parser error",
      "missing tool or path",
      "permission denied",
      "stale state",
      "repeated environment failure",
      "repeated tool-resolution failure",
      "rca-classified environment failure",
      "rca-classified tool-resolution failure",
    ]),
    targetGuidance: "tool-churn-rca",
    durableTarget: "docs/workflows/tool-churn-rca.md",
  },
];

export function resolveGuidanceVerificationRoute(candidate = {}) {
  const target = normalizeDurableTarget(candidate.durableTarget || candidate.targetFile || candidate.target);
  if (!target) {
    return {
      status: "unsupported-verification-route",
      target: null,
      command: null,
      expectedEvidence: null,
      noOpReason: "unsupported-verification-route",
      autonomyTier: TIER_2,
      warnings: ["missing-durableTarget"],
      requiresAuthority: [],
    };
  }

  const mapped = STATIC_VERIFICATION_ROUTES[target];
  if (mapped) {
    return {
      status: "mapped",
      target,
      command: mapped.command,
      expectedEvidence: mapped.expectedEvidence,
      noOpReason: null,
      autonomyTier: TIER_1,
      warnings: [],
      requiresAuthority: [],
    };
  }

  if (isHigherAuthorityTarget(target)) {
    return {
      status: "requires-higher-authority",
      target,
      command: null,
      expectedEvidence: null,
      noOpReason: "requires-higher-authority",
      autonomyTier: TIER_3,
      warnings: [`unsupported-verification-route:${target}`],
      requiresAuthority: ["verification-route-higher-authority"],
    };
  }

  return {
    status: "unsupported-verification-route",
    target,
    command: null,
    expectedEvidence: null,
    noOpReason: "unsupported-verification-route",
    autonomyTier: TIER_2,
    warnings: [`unsupported-verification-route:${target}`],
    requiresAuthority: [],
  };
}

export function classifyGuidanceCandidates(readResult = {}, options = {}) {
  const lane = readResult.lane || options.lane || "unknown-lane";
  const warnings = Array.isArray(readResult.warnings) ? [...readResult.warnings] : [];
  const requiresAuthority = copyAuthority(readResult.requiresAuthority);
  const candidates = [];
  const skipped = [];

  if (readResult.status !== "success" || !Array.isArray(readResult.events) || readResult.events.length === 0) {
    return {
      status: "insufficient-evidence",
      lane,
      mode: MODE,
      eventStore: readResult.eventStore || null,
      candidates,
      skipped: [
        buildSkipped({
          lane,
          noOpReason: "insufficient-evidence",
          warnings: warnings.length ? warnings : ["insufficient-evidence"],
        }),
      ],
      warnings,
      requiresAuthority: copyAuthority(readResult.requiresAuthority),
    };
  }

  for (const event of readResult.events || []) {
    const missing = missingRequiredFields(event);
    if (missing.length > 0) {
      skipped.push(buildSkipped({
        event,
        lane,
        noOpReason: "insufficient-evidence",
        warnings: missing.map((field) => `missing-${field}`),
      }));
      continue;
    }

    if (!hasRepeatabilityEvidence(event)) {
      skipped.push(buildSkipped({
        event,
        lane,
        noOpReason: "not-repeatable",
        autonomyTier: TIER_2,
      }));
      continue;
    }

    const route = routeEvent(event);
    const authority = classifyRequiredAuthority(event);
    if (authority.length > 0) {
      const durableTarget = normalizeDurableTarget(event.durableUpdate) || route?.durableTarget || "higher-authority:proposal";
      candidates.push(buildHigherAuthorityCandidate(event, lane, {
        durableTarget,
        targetGuidance: route?.targetGuidance || "prepare-only-proposal",
        authority,
      }));
      requiresAuthority.push({
        sourceEventId: event.eventId,
        lane: event.lane || lane,
        authority,
        reason: "requires-higher-authority",
      });
      continue;
    }

    if (!route) {
      skipped.push(buildSkipped({
        event,
        lane,
        noOpReason: "insufficient-evidence",
        autonomyTier: TIER_2,
        warnings: ["missing-durableTarget", "missing-verification"],
      }));
      continue;
    }

    const candidate = buildCandidate(event, lane, route);
    if (candidate.verificationPlan.status !== "mapped") {
      if (candidate.verificationPlan.requiresAuthority.length > 0) {
        requiresAuthority.push({
          sourceEventId: event.eventId,
          lane: event.lane || lane,
          authority: candidate.verificationPlan.requiresAuthority,
          reason: candidate.verificationPlan.noOpReason,
        });
      }
    }

    candidates.push(candidate);
  }

  return {
    status: "success",
    lane,
    mode: MODE,
    eventStore: readResult.eventStore || null,
    candidates,
    skipped,
    warnings,
    requiresAuthority,
  };
}

export function dedupeGuidanceCandidates(candidates = [], options = {}) {
  const sourceSnapshots = normalizeSourceSnapshots(options.sourceSnapshots ?? readDefaultSourceSnapshots(options));
  const grouped = groupCandidates(candidates);
  const output = {
    candidates: [],
    skipped: [],
    proposals: [],
    warnings: [],
  };

  for (const group of grouped.values()) {
    const merged = mergeCandidateGroup(group);
    const coverage = evaluateCoverage(merged, sourceSnapshots);
    const annotated = {
      ...merged,
      coverage,
    };

    if (coverage.status === "already-covered") {
      output.skipped.push({
        ...skippedFromCandidate(annotated, "already-covered"),
        coverage,
      });
      continue;
    }

    if (coverage.status === "vague-guidance") {
      output.skipped.push({
        ...skippedFromCandidate(annotated, "would-add-noise"),
        decision: "proposal",
        coverage,
      });
      continue;
    }

    if (coverage.status === "conflicting-guidance") {
      output.proposals.push({
        ...skippedFromCandidate(annotated, "requires-higher-authority"),
        decision: "proposal",
        coverage,
      });
      continue;
    }

    const verificationPlan = annotated.verificationPlan?.status && annotated.verificationPlan.status !== "mapped"
      ? annotated.verificationPlan
      : resolveGuidanceVerificationRoute(annotated);
    if (verificationPlan.status !== "mapped") {
      output.proposals.push({
        ...skippedFromCandidate({
          ...annotated,
          verification: null,
          verificationPlan,
          requiresAuthority: verificationPlan.requiresAuthority,
          warnings: [...(annotated.warnings || []), ...verificationPlan.warnings],
          autonomyTier: verificationPlan.autonomyTier,
        }, verificationPlan.noOpReason),
        decision: "proposal",
        coverage,
      });
      continue;
    }

    output.candidates.push(annotated);
  }

  return output;
}

function buildCandidate(event, lane, route) {
  const durableTarget = normalizeDurableTarget(event.durableUpdate) || route.durableTarget;
  const verificationPlan = resolveGuidanceVerificationRoute({ durableTarget });
  return {
    candidateId: buildCandidateId(event, durableTarget),
    sourceEventId: event.eventId,
    lane: event.lane || lane,
    failureClass: event.failureClass,
    signature: event.signature,
    wrongRetryPattern: event.wrongRetryPattern,
    nextSafeAction: event.nextSafeAction,
    targetGuidance: route.targetGuidance,
    durableTarget,
    verification: verificationPlan.command,
    verificationPlan,
    autonomyTier: verificationPlan.autonomyTier,
    decision: verificationPlan.status === "mapped" ? "candidate" : "proposal",
    noOpReason: verificationPlan.noOpReason,
    requiresAuthority: verificationPlan.requiresAuthority,
    warnings: verificationPlan.warnings,
  };
}

function buildHigherAuthorityCandidate(event, lane, input) {
  const verificationPlan = {
    status: "requires-higher-authority",
    target: input.durableTarget,
    command: null,
    expectedEvidence: null,
    noOpReason: "requires-higher-authority",
    autonomyTier: TIER_3,
    warnings: [`higher-authority-surface:${input.durableTarget}`],
    requiresAuthority: input.authority,
  };
  return {
    candidateId: buildCandidateId(event, input.durableTarget),
    sourceEventId: event.eventId,
    lane: event.lane || lane,
    failureClass: event.failureClass,
    signature: event.signature,
    wrongRetryPattern: event.wrongRetryPattern,
    nextSafeAction: event.nextSafeAction,
    targetGuidance: input.targetGuidance,
    durableTarget: input.durableTarget,
    verification: null,
    verificationPlan,
    autonomyTier: TIER_3,
    decision: "proposal",
    noOpReason: "requires-higher-authority",
    requiresAuthority: input.authority,
    warnings: verificationPlan.warnings,
  };
}

function groupCandidates(candidates) {
  const grouped = new Map();
  for (const candidate of candidates || []) {
    const key = buildDedupeKey(candidate);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push({ ...candidate, dedupeKey: key });
  }
  return grouped;
}

function mergeCandidateGroup(group) {
  const [first] = group;
  return {
    ...first,
    collapsedSourceEventIds: unique(group.map((candidate) => candidate.sourceEventId).filter(Boolean)),
    collapsedCandidateIds: unique(group.map((candidate) => candidate.candidateId).filter(Boolean)),
  };
}

function buildDedupeKey(candidate) {
  return [
    normalizeKeyPart(candidate.failureClass),
    normalizeKeyPart(candidate.signature),
    normalizeKeyPart(candidate.nextSafeAction),
  ].join("|");
}

function evaluateCoverage(candidate, sourceSnapshots) {
  const signature = normalizeSearchText(candidate.signature);
  const nextSafeAction = normalizeSearchText(candidate.nextSafeAction);
  const failureClass = normalizeSearchText(candidate.failureClass);

  const conflicts = [];
  const specificMatches = [];
  const vagueMatches = [];

  for (const [source, raw] of Object.entries(sourceSnapshots)) {
    const text = normalizeSearchText(raw);
    if (!text) {
      continue;
    }
    const hasSignature = signature && signatureCovered(candidate.signature, text, signature);
    const hasNextSafeAction = nextSafeAction && nextSafeActionCovered(candidate.nextSafeAction, text, nextSafeAction);
    const hasFailureClass = failureClass && text.includes(failureClass);

    if (hasSignature && hasConflict(text)) {
      conflicts.push(source);
      continue;
    }
    if (hasSignature && hasNextSafeAction) {
      specificMatches.push(source);
      continue;
    }
    if (hasSignature || hasFailureClass) {
      vagueMatches.push(source);
    }
  }

  if (conflicts.length > 0) {
    return {
      status: "conflicting-guidance",
      matchedSources: conflicts,
      reason: "source-owned guidance conflicts with candidate next safe action",
    };
  }
  if (specificMatches.length > 0) {
    return {
      status: "already-covered",
      matchedSources: specificMatches,
      reason: "specific-signature-and-next-safe-action-covered",
    };
  }
  if (vagueMatches.length > 0) {
    return {
      status: "vague-guidance",
      matchedSources: vagueMatches,
      reason: "broad append-only guidance would add noise without deterministic managed-section or preimage safety",
    };
  }
  return {
    status: "unique",
    matchedSources: [],
    reason: "no matching source-owned guidance found",
  };
}

function skippedFromCandidate(candidate, noOpReason) {
  return {
    candidateId: candidate.candidateId,
    sourceEventId: candidate.sourceEventId,
    lane: candidate.lane,
    failureClass: candidate.failureClass,
    signature: candidate.signature,
    targetGuidance: candidate.targetGuidance,
    durableTarget: candidate.durableTarget,
    verification: candidate.verification,
    verificationPlan: candidate.verificationPlan,
    dedupeKey: candidate.dedupeKey,
    collapsedSourceEventIds: candidate.collapsedSourceEventIds,
    collapsedCandidateIds: candidate.collapsedCandidateIds,
    autonomyTier: candidate.autonomyTier,
    decision: "skipped",
    noOpReason,
    requiresAuthority: candidate.requiresAuthority || [],
    warnings: candidate.warnings || [],
    ...proposalFields(candidate, noOpReason),
  };
}

function buildSkipped(input) {
  const event = input.event || {};
  return {
    sourceEventId: event.eventId || null,
    lane: event.lane || input.lane,
    failureClass: event.failureClass || null,
    signature: event.signature || null,
    autonomyTier: input.autonomyTier || TIER_2,
    decision: "skipped",
    noOpReason: input.noOpReason,
    requiresAuthority: input.requiresAuthority || [],
    warnings: input.warnings || [],
  };
}

function isHigherAuthorityTarget(target) {
  const normalized = target.toLowerCase();
  return HIGHER_AUTHORITY_TARGETS.has(target)
    || normalized.startsWith("github:")
    || normalized.startsWith("provider:")
    || normalized.includes("package.json")
    || normalized.includes("cleanup")
    || (normalized.startsWith("scripts/") && !STATIC_VERIFICATION_ROUTES[target]);
}

function normalizeDurableTarget(value) {
  if (typeof value !== "string") {
    return "";
  }
  const target = value.trim();
  if (target === "AGENTS") {
    return "AGENTS.md";
  }
  return target;
}

function missingRequiredFields(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return ["event"];
  }
  const missing = [];
  if (!event.eventId) {
    missing.push("eventId");
  }
  if (!event.lane) {
    missing.push("lane");
  }
  for (const field of REQUIRED_TIER_1_FIELDS) {
    if (typeof event[field] !== "string" || event[field].trim() === "") {
      missing.push(field);
    }
  }
  return missing;
}

function hasRepeatabilityEvidence(event) {
  return event.wrongRetryPrevented === true
    || event.repeatable === true
    || event.metadata?.wrongRetryPrevented === true
    || event.metadata?.repeatable === true;
}

function classifyRequiredAuthority(event) {
  const explicit = event.requiresAuthority ?? event.metadata?.requiresAuthority;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map(String);
  }
  if (typeof explicit === "string" && explicit.trim()) {
    return [explicit.trim()];
  }

  const text = `${event.failureClass || ""}\n${event.signature || ""}\n${event.nextSafeAction || ""}\n${event.evidenceSummary || ""}`.toLowerCase();
  return HIGHER_AUTHORITY_TERMS
    .filter((term) => text.includes(term))
    .map((term) => term.replace(/\s+/g, "-"));
}

function routeEvent(event) {
  const durableTarget = normalizeDurableTarget(event.durableUpdate);
  if (durableTarget) {
    return {
      match: () => true,
      targetGuidance: isHigherAuthorityTarget(durableTarget) ? "prepare-only-proposal" : "durable-update",
      durableTarget,
    };
  }
  const normalized = {
    ...event,
    failureClass: String(event.failureClass || "").toLowerCase(),
    signature: String(event.signature || "").toLowerCase(),
  };
  return ROUTES.find((route) => route.match(normalized)) || null;
}

function proposalFields(candidate, noOpReason) {
  const authority = candidate.requiresAuthority || candidate.verificationPlan?.requiresAuthority || [];
  const target = candidate.durableTarget || candidate.verificationPlan?.target || null;
  const fields = {
    evidenceReferences: [candidate.sourceEventId].filter(Boolean),
    proposedTarget: target,
    requiredAuthority: authority,
    requiredAuthorityFamily: authority.length ? authority : authorityForTarget(target),
    verificationIdea: verificationIdeaForTarget(target, noOpReason),
    residualRisk: residualRiskForTarget(target, authority),
  };
  if (requiresOperatorContractApproval(target)) {
    fields.operatorApprovalRequired = true;
    fields.approvalGuidance = "Explicit operator-visible approval is required before source application in v1.";
  }
  const matureToolDecision = matureToolDecisionFor(candidate);
  if (matureToolDecision) {
    fields.matureToolDecision = matureToolDecision;
  }
  return fields;
}

function authorityForTarget(target) {
  const normalized = String(target || "").toLowerCase();
  if (normalized === "agents.md") {
    return ["operator-contract", "operator-approval"];
  }
  if (normalized.startsWith("github:") || normalized.includes(".github/")) {
    return ["github-settings", "operator-approval"];
  }
  if (normalized.startsWith("provider:")) {
    return ["provider-call", "operator-approval"];
  }
  if (normalized.includes("package.json")) {
    return ["dependency-change", "operator-approval"];
  }
  if (normalized.includes("cleanup")) {
    return ["cleanup-authority", "operator-approval"];
  }
  if (normalized.startsWith("scripts/")) {
    return ["new-executable-or-drift-check", "operator-approval"];
  }
  return ["operator-approval"];
}

function verificationIdeaForTarget(target, noOpReason) {
  const normalized = String(target || "").toLowerCase();
  if (normalized === "agents.md") {
    return "Run operator-contract section/marker integrity checks after explicit operator-visible approval.";
  }
  if (normalized.startsWith("github:") || normalized.includes(".github/")) {
    return "Prepare an approval packet and run read-only policy or workflow validation before any GitHub mutation.";
  }
  if (normalized.startsWith("provider:")) {
    return "Prepare provider authority evidence and use fake or read-only adapters before any provider call.";
  }
  if (normalized.includes("package.json")) {
    return "Prepare dependency adoption evidence and run existing static checks before package changes.";
  }
  if (noOpReason === "unsupported-verification-route") {
    return "Add a deterministic target-bound verification route before source application.";
  }
  return "Prepare a local proposal and identify deterministic verification before mutation.";
}

function residualRiskForTarget(target, authority) {
  const normalized = String(target || "").toLowerCase();
  if (normalized === "agents.md") {
    return "requires explicit operator-visible approval before source application to an operator contract";
  }
  if (normalized.startsWith("provider:")) {
    return "requires explicit provider and paid-usage authority before any provider call";
  }
  if (matureToolText(normalized) || normalized === "github:actions") {
    return "mature-tool adoption is deferred; do not install dependencies or project configuration changes";
  }
  if ((authority || []).length > 0) {
    return `requires higher authority: ${(authority || []).join(", ")}`;
  }
  return "requires explicit operator-visible approval before mutation";
}

function requiresOperatorContractApproval(target) {
  const normalized = String(target || "").toLowerCase();
  return normalized === "agents.md" || normalized.includes("operator-contract");
}

function matureToolDecisionFor(candidate) {
  const text = `${candidate.signature || ""}\n${candidate.nextSafeAction || ""}\n${candidate.durableTarget || ""}`.toLowerCase();
  const tool = matureToolText(text);
  if (!tool) {
    return "";
  }
  return `Defer ${tool} adoption in v1; preserve proposal-only handling until explicit mature-tool approval.`;
}

function matureToolText(text) {
  const tools = ["danger", "reviewdog", "pre-commit", "actionlint", "zizmor", "vale", "opentelemetry", "github actions", "github:actions"];
  return tools.find((tool) => text.includes(tool)) || "";
}

function buildCandidateId(event, durableTarget) {
  const hash = createHash("sha256")
    .update([
      event.eventId,
      event.lane,
      event.failureClass,
      event.signature,
      event.nextSafeAction,
      durableTarget,
    ].join("\0"))
    .digest("hex")
    .slice(0, 12);
  return `candidate-${hash}`;
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function copyAuthority(authority) {
  return Array.isArray(authority) ? authority.map((entry) => ({ ...entry })) : [];
}

function readDefaultSourceSnapshots(options = {}) {
  const cwd = options.cwd || process.cwd();
  const snapshots = {};
  for (const path of DEFAULT_SOURCE_PATHS) {
    snapshots[path] = existsSync(`${cwd}/${path}`) ? readFileSync(`${cwd}/${path}`, "utf8") : "";
  }
  return snapshots;
}

function normalizeSourceSnapshots(snapshots = {}) {
  const normalized = {};
  for (const [source, value] of Object.entries(snapshots || {})) {
    const sourceName = source === "AGENTS" ? "AGENTS.md" : source;
    normalized[sourceName] = String(value || "");
  }
  return normalized;
}

function normalizeKeyPart(value) {
  return normalizeSearchText(value)
    .replace(/\bthe\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.git\/worktrees/g, "git worktrees")
    .replace(/\$home\/\.cache\/uv/g, "home cache uv")
    .replace(/read[-\s]+only/g, "read only")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasConflict(text) {
  if (text.includes("do not skip")) {
    return false;
  }
  const conflictTerms = [
    "skip the git worktree test",
    "skip git worktree test",
    "change the test scope",
    "do not request approval",
    "retry inside the sandbox",
  ];
  return conflictTerms.some((term) => text.includes(term));
}

function unique(values) {
  return [...new Set(values)];
}

function signatureCovered(rawSignature, text, normalizedSignature) {
  if (text.includes(normalizedSignature)) {
    return true;
  }
  const signature = String(rawSignature || "").toLowerCase();
  if (signature.includes(".git/worktrees")) {
    return text.includes("git worktrees") && (text.includes("read only") || text.includes("erofs"));
  }
  if (signature.includes("$home/.cache/uv")) {
    return text.includes("home cache uv") && (text.includes("read only") || text.includes("erofs"));
  }
  if (signature.includes("managed-worktree pnpm temp")) {
    return text.includes("pnpm") && text.includes("temp") && (text.includes("read only") || text.includes("erofs"));
  }
  return false;
}

function nextSafeActionCovered(rawAction, text, normalizedAction) {
  if (text.includes(normalizedAction)) {
    return true;
  }
  const action = normalizeSearchText(rawAction);
  if (
    action.includes("request approval")
    && action.includes("rerun")
    && action.includes("exact same")
    && action.includes("read only")
    && outsideSandboxCovered(action)
  ) {
    return text.includes("request approval")
      && text.includes("rerun")
      && text.includes("exact same")
      && text.includes("read only")
      && outsideSandboxCovered(text);
  }
  return false;
}

function outsideSandboxCovered(text) {
  return text.includes("outside sandbox") || text.includes("outside the sandbox");
}
