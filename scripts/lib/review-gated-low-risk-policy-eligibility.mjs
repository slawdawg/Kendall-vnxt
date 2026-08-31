const MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
const FORBIDDEN_METADATA_KEY = /^(?:rawprompt|rawcompletion|rawpayload|rawworkertranscript|unboundedlog|prompt|completion|reasoningtrace|providerpayload|secret|secrets|credential|credentials|apikey|accesskey|accesstoken|refreshtoken|bearertoken|authtoken|sessiontoken|oauthtoken|clientsecret|encryptionkey|signingkey|privatekey|token|password|authorization|bearer)/i;
const SENSITIVE_METADATA_TEXT = /raw\s*[-_ ]?prompt|raw\s*[-_ ]?completion|raw\s*[-_ ]?payload|reasoning\s*[-_ ]?(?:trace|output)|provider\s*[-_ ]?payload|(?:api|access|refresh|bearer|auth|session|oauth)[\s_-]*token|(?:access|client|encryption|signing|private)[\s_-]*key|\b(?:secret|credential|password|authorization)\b/i;
const DENIED_PROVENANCE = new Set(["synthetic", "fixture", "readiness"]);

/**
 * Evaluate post-pilot policy activation separately from first-pilot admission.
 * This is metadata-only and never activates automation or performs mutation.
 */
export function evaluatePolicyActivationEligibility(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const now = parseTimestamp(options.now ?? source.now);
  const state = source.state && typeof source.state === "object" ? source.state : {};
  const pilot = source.pilotResult && typeof source.pilotResult === "object" ? source.pilotResult : {};
  const retrospective = source.retrospective && typeof source.retrospective === "object" ? source.retrospective : {};
  const policy = source.policy && typeof source.policy === "object" ? source.policy : {};
  const admission = source.admission && typeof source.admission === "object" ? source.admission : {};
  const admissionBinding = admission.scope && typeof admission.scope === "object" ? admission.scope : admission;
  const blockers = [];

  if (!now) blockers.push("policy evaluation timestamp is missing or invalid");
  if (hasForbiddenMetadata(source)) blockers.push("policy packet contains forbidden raw payload or secret metadata");
  if (admission.status !== "READY" || admission.approved !== true) {
    blockers.push("prior approved pilot-admission checkpoint is missing");
  } else {
    const execution = admission.execution && typeof admission.execution === "object" ? admission.execution : {};
    const authorityDecision = admission.authorityDecision && typeof admission.authorityDecision === "object" ? admission.authorityDecision : {};
    if (admission.active !== false || admission.allowed !== false || admission.metadataOnly !== true
      || ["attempted", "applied", "filesystemWrites", "gitMutations", "providerCalls", "workerLaunch"].some((field) => execution[field] !== false)
      || authorityDecision.allowed !== false || authorityDecision.active !== false) {
      blockers.push("prior admission checkpoint is not inactive, unauthorized, metadata-only, and non-executing");
    }
    for (const field of ["owner", "worktree", "baseSha", "headSha", "diffHash"]) {
      if (admissionBinding[field] !== text(state[field])) blockers.push(`prior admission ${field} is not exact-bound`);
    }
    if (!admission.evidence || admission.evidence.review !== true || admission.evidence.checks !== true || admission.evidence.rollback !== true || admission.evidence.exactHead !== true) {
      blockers.push("prior admission gate evidence is missing or incomplete");
    }
    requireFresh(admission.approval?.approvedAt ?? admission.approvedAt, now, "prior admission approval", blockers);
  }
  if (pilot.completed !== true || pilot.synthetic !== false || DENIED_PROVENANCE.has(text(pilot.provenance).toLowerCase()) || DENIED_PROVENANCE.has(text(pilot.evidenceClass).toLowerCase()) || text(pilot.status).toUpperCase() !== "PASS") {
    blockers.push("completed non-synthetic PASS pilot result is required");
  }
  if (!safeText(pilot.resultId, 120)) blockers.push("pilot result ID is missing or unsafe");
  for (const field of ["owner", "worktree", "baseSha", "headSha", "diffHash"]) {
    if (!text(state[field]) || pilot[field] !== text(state[field])) blockers.push(`pilot result ${field} is not exact-bound`);
  }
  requireFresh(pilot.completedAt, now, "pilot result", blockers);

  if (retrospective.accepted !== true
    || !/^retrospective:[A-Za-z0-9._-]+$/i.test(text(retrospective.reference))
    || !safeText(retrospective.reference, 160)
    || !safeText(retrospective.acceptedBy, 120)) {
    blockers.push("accepted retrospective reference is missing or unsafe");
  }
  requireFresh(retrospective.acceptedAt, now, "accepted retrospective", blockers);

  if (policy.explicit !== true || text(policy.mode) !== "standard-delivery" || text(policy.batchMode) !== "per-epic") {
    blockers.push("standard-delivery per-epic batch policy is missing or ambiguous");
  }

  const safeBlockers = unique(blockers).map(redactSensitiveText);
  return {
    schemaVersion: 1,
    mode: "policy-activation-eligibility",
    status: safeBlockers.length ? "HOLD" : "READY",
    eligible: safeBlockers.length === 0,
    active: false,
    allowed: false,
    blockers: safeBlockers,
    binding: {
      owner: redactSensitiveText(text(state.owner)),
      worktree: redactSensitiveText(text(state.worktree)),
      baseSha: redactSensitiveText(text(state.baseSha)),
      headSha: redactSensitiveText(text(state.headSha)),
      diffHash: redactSensitiveText(text(state.diffHash)),
    },
    execution: {
      attempted: false,
      mutation: "none",
      filesystemWrites: false,
      gitMutations: false,
      providerCalls: false,
      workerLaunch: false,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function requireFresh(value, now, label, blockers) {
  const timestamp = parseTimestamp(value);
  if (!timestamp || !now || timestamp > now || now - timestamp > MAX_EVIDENCE_AGE_MS) blockers.push(`${label} is stale, future-dated, or invalid`);
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeText(value, maxLength) {
  const normalized = text(value);
  return normalized && normalized.length <= maxLength && !/raw\s*prompt|completion|reasoning|provider\s*payload|token|password|secret|credential/i.test(normalized) ? normalized : null;
}

function redactSensitiveText(value) {
  const normalized = text(value);
  return normalized && /raw\s*prompt|completion|reasoning|provider\s*payload|token|password|secret|credential/i.test(normalized) ? "[redacted]" : normalized || null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values)];
}

function hasForbiddenMetadata(value) {
  if (typeof value === "string") return SENSITIVE_METADATA_TEXT.test(value);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((nested) => hasForbiddenMetadata(nested));
  return Object.entries(value).some(([key, nested]) => {
    const normalizedKey = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    if (normalizedKey === "rawpayloadretained") return nested !== false;
    if (FORBIDDEN_METADATA_KEY.test(normalizedKey)) {
      return true;
    }
    return hasForbiddenMetadata(nested);
  });
}
