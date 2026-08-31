const REQUIRED_MANIFEST_FIELDS = [
  "taskId",
  "branch",
  "worktreePath",
  "baseBranch",
];
const DEFAULT_DIRTY_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function evaluateApplySafeGate(input = {}) {
  const manifest = input.manifest || null;
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const now = input.now ? new Date(input.now) : new Date();
  const maxDirtyEvidenceAgeMs = input.maxDirtyEvidenceAgeMs ?? DEFAULT_DIRTY_EVIDENCE_MAX_AGE_MS;
  const base = {
    status: "passed",
    noOpReason: null,
    missingFields: [],
    dirtyTargets: [],
    warnings: [],
    requiresAuthority: [],
    residualRisks: [],
    filesChanged: [],
    applied: [],
    transactionId: null,
  };

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "missing-lane-manifest",
      missingFields: [...REQUIRED_MANIFEST_FIELDS],
      warnings: ["missing-lane-manifest"],
      residualRisks: ["source-application-blocked-without-structured-lane-manifest"],
    };
  }

  const missingFields = REQUIRED_MANIFEST_FIELDS.filter((field) => isBlank(manifest[field]));
  if (missingFields.length > 0) {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "missing-lane-manifest-field",
      missingFields,
      warnings: missingFields.map((field) => `missing-lane-manifest-field:${field}`),
      residualRisks: ["source-application-blocked-without-required-lane-fields"],
    };
  }

  if (manifest.pr?.merged === true) {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "merged-pr",
      warnings: ["merged-pr"],
      residualRisks: ["source-application-blocked-for-merged-pr"],
    };
  }

  if (manifest.cleanup && manifest.cleanup.status !== "not-started") {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "cleanup-started",
      warnings: [`cleanup-status:${manifest.cleanup.status || "unknown"}`],
      residualRisks: ["source-application-blocked-after-cleanup-started"],
    };
  }

  if (!manifest.dirtyWorktree || isBlank(manifest.dirtyWorktree.checkedAt) || !Array.isArray(manifest.dirtyWorktree.paths)) {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "missing-dirty-worktree-evidence",
      warnings: ["missing-dirty-worktree-evidence"],
      residualRisks: ["source-application-blocked-without-current-dirty-worktree-evidence"],
    };
  }

  const dirtyCheckedAt = new Date(manifest.dirtyWorktree.checkedAt);
  if (
    Number.isNaN(dirtyCheckedAt.getTime())
    || Number.isNaN(now.getTime())
    || now.getTime() - dirtyCheckedAt.getTime() > maxDirtyEvidenceAgeMs
    || dirtyCheckedAt.getTime() > now.getTime()
  ) {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "stale-dirty-worktree-evidence",
      warnings: [`stale-dirty-worktree-evidence:${manifest.dirtyWorktree.checkedAt}`],
      residualRisks: ["source-application-blocked-without-current-dirty-worktree-evidence"],
    };
  }

  const dirtyTargets = overlappingDirtyTargets(candidates, manifest.dirtyWorktree.paths);
  if (dirtyTargets.length > 0) {
    return {
      ...base,
      status: "requires-higher-authority",
      noOpReason: "dirty-target-overlap",
      dirtyTargets,
      warnings: dirtyTargets.map((target) => `dirty-target-overlap:${target}`),
      requiresAuthority: [
        {
          reason: "dirty-target-overlap",
          authority: ["operator-review"],
          behavior: "block-source-application",
        },
      ],
      residualRisks: ["source-application-blocked-by-overlapping-dirty-target"],
    };
  }

  if (!manifest.pr && candidates.some((candidate) => candidate.requiresPrState === true)) {
    return {
      ...base,
      status: "proposal-only",
      noOpReason: "pr-state-unavailable",
      warnings: ["pr-state-unavailable"],
      residualRisks: ["pr-dependent-candidate-degraded-without-pr-state"],
    };
  }

  return {
    ...base,
    warnings: ["source-application-deferred-to-later-epic-3-story"],
  };
}

function overlappingDirtyTargets(candidates, dirtyPaths) {
  const dirty = new Set(dirtyPaths.map(String));
  return [...new Set(
    candidates
      .flatMap((candidate) => [
        candidate.durableTarget,
        candidate.targetFile,
        candidate.verificationPlan?.target,
      ])
      .filter(Boolean)
      .filter((target) => dirty.has(target)),
  )];
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}
