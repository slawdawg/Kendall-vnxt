const SCHEMA_VERSION = "pipeline-operational-readiness-contract/v0";
const GATE_STATES = new Set(["pass", "fail", "blocked", "not_applicable"]);
const BACKEND_TRUTHS = new Set(["live", "simulated", "dry_run"]);
const OUTCOMES = new Set(["go", "no_go"]);
const FRESHNESS_TTL_MS = 5 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;
const SAFE_REF = /^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact|readiness):[A-Za-z0-9._/@:-]{1,180}$/;
const SECRET_LIKE = /\b(?:sk-[A-Za-z0-9_-]{8,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:api|secret|token|credential)[_-]?(?:key|token|secret)?[:=])/i;
const FORBIDDEN = /\b(?:raw[\s_-]*(?:prompt|completion|transcript|log|source)|reasoning[\s_-]*trace|provider[\s_-]*payload|secret(?:[\s_-]*(?:key|token|value|id))?|credential|password|api[\s_-]*key|access[\s_-]*token|terminal[\s_-]*(?:scrollback|output)|tmux[\s_-]*scrollback|pane[\s_-]*text)\b/i;

const REQUIRED_GATES = [
  "exact_ownership",
  "source_evidence",
  "backend_truth",
  "authority_risk",
  "recovery_rollback",
  "resource_cost",
  "configuration_secrets",
  "telemetry_alerts",
  "preflight",
  "usage",
  "resources",
  "heartbeat",
  "dispatcher_lease",
  "receipt_evidence",
];

const REQUIRED_INDICATORS = [
  "heartbeat_freshness",
  "readiness_projection_freshness",
  "lease_checkpoint_receipt_proof",
  "preflight",
  "usage",
  "resources",
  "telemetry",
  "errors",
  "latency",
  "cost",
];

function text(value, fallback = "", max = 500) {
  const result = typeof value === "string" ? value.trim() : fallback;
  return result.slice(0, max);
}

function safeText(value, fallback = "", max = 500) {
  const result = text(value, fallback, max);
  return Boolean(result) && !FORBIDDEN.test(result) && !SECRET_LIKE.test(result) && !/[\u0000-\u001f\u007f]/.test(result);
}

function safeId(value) {
  const result = text(value).toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._/@:,-]{0,198}[a-z0-9])?$/.test(result) && !result.includes("..") && !result.includes("//") ? result : "";
}

function refs(value, { allowReadiness = true } = {}) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return [];
  return value.filter((entry) => {
    const ref = text(entry, "", 180);
    return ref === entry && (SAFE_REF.test(ref) || (allowReadiness && /^readiness:[A-Za-z0-9._/@:-]{1,180}$/.test(ref))) && !FORBIDDEN.test(ref) && !SECRET_LIKE.test(ref) && !ref.includes("../");
  });
}

function reasonFor(code, fallback = "unknown") {
  const known = new Set([
    "threshold_missing", "threshold_malformed", "telemetry_missing", "telemetry_stale", "telemetry_contradictory",
    "alert_coverage_missing", "rollback_missing", "recovery_missing", "ownership_ambiguous", "target_not_exact",
    "evidence_missing", "evidence_stale", "backend_truth_unproven", "configuration_invalid", "secret_like_metadata",
    "resource_pressure", "usage_pressure", "preflight_blocked", "dispatcher_lease_unproven", "receipt_unproven",
    "predecessor_gate_not_passed", "safety_violation", "authority_violation", "unknown",
  ]);
  return known.has(code) ? code : fallback;
}

function threshold(value, name) {
  if (!value || typeof value !== "object" || !Number.isFinite(Number(value.value))) return null;
  const operator = ["lt", "lte", "gt", "gte", "eq"].includes(value.operator) ? value.operator : "";
  const unit = safeId(value.unit);
  if (!operator || !unit) return null;
  return { name: safeId(value.name || name), operator, value: Number(value.value), unit, explicit: true };
}

function thresholdFor(profile, name, defaults = null) {
  const candidate = profile?.thresholds?.[name] ?? profile?.[name];
  if (candidate !== undefined) return threshold(candidate, name);
  return defaults;
}

function gate(gateId, input, fallbackReason, fallbackAction, evidence = []) {
  const state = GATE_STATES.has(input?.state) ? input.state : input === true ? "pass" : "blocked";
  const typedReason = state === "pass" || state === "not_applicable" ? null : reasonFor(text(input?.typedReason, fallbackReason));
  return {
    gateId,
    state,
    typedReason,
    nextAction: safeText(input?.nextAction, fallbackAction, 220) ? text(input?.nextAction, fallbackAction, 220) : fallbackAction,
    evidenceRefs: refs(input?.evidenceRefs || evidence),
  };
}

function suppliedGate(gates, id, condition, fallbackReason, fallbackAction, evidence = []) {
  const candidate = Array.isArray(gates) ? gates.find((entry) => entry?.gateId === id) : gates?.[id];
  if (condition !== true && candidate?.state === "pass") {
    return gate(id, { ...candidate, state: "blocked", typedReason: fallbackReason }, fallbackReason, fallbackAction, evidence);
  }
  return gate(id, candidate === undefined ? condition : candidate, fallbackReason, fallbackAction, evidence);
}

function explicitThresholds(profile = {}) {
  const defaults = {
    heartbeat_freshness: threshold({ name: "heartbeat_freshness", operator: "lte", value: 300, unit: "seconds" }, "heartbeat_freshness"),
    readiness_projection_freshness: threshold({ name: "readiness_projection_freshness", operator: "lte", value: 300, unit: "seconds" }, "readiness_projection_freshness"),
  };
  const output = [];
  for (const name of REQUIRED_INDICATORS) {
    const item = thresholdFor(profile, name, defaults[name] || null);
    if (item) output.push({ indicator: name, target: item, windowSeconds: Number(profile?.windows?.[name] || 300), errorBudget: Number(profile?.errorBudgets?.[name] ?? 0), ...(name.includes("heartbeat") || name.includes("readiness") ? {} : {}) });
  }
  return output;
}

export function buildOperationalReadinessContract(options = {}, context = {}) {
  const now = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(now) ? now : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const expiresAt = new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString();
  const targetInput = context.target || options.target || {};
  const target = {
    workerId: safeId(targetInput.workerId),
    assignmentId: safeId(targetInput.assignmentId),
    owner: safeId(targetInput.owner),
    runId: safeId(targetInput.runId),
    sourceRefs: refs(targetInput.sourceRefs),
    evidenceRefs: refs(targetInput.evidenceRefs),
  };
  const profile = context.readinessProfile || options.readinessProfile || {};
  const thresholds = explicitThresholds(profile);
  const missingThresholds = REQUIRED_INDICATORS.filter((name) => !thresholds.some((entry) => entry.indicator === name));
  const telemetryInput = context.telemetry || {};
  const telemetry = {
    source: safeId(telemetryInput.source),
    coverage: safeId(telemetryInput.coverage),
    observationWindowSeconds: Number(telemetryInput.observationWindowSeconds),
    alertThresholdIds: Array.isArray(telemetryInput.alertThresholdIds) ? telemetryInput.alertThresholdIds.map(safeId).filter(Boolean).slice(0, 12) : [],
    alertReady: telemetryInput.alertReady === true,
  };
  const configurationInput = context.configuration || context.secrets || {};
  const names = Array.isArray(configurationInput.names || configurationInput.allowlistedNames) ? (configurationInput.names || configurationInput.allowlistedNames).map(safeId).filter(Boolean).slice(0, 24) : [];
  const configuration = { names, validationState: ["pass", "fail", "unknown"].includes(configurationInput.validationState) ? configurationInput.validationState : "unknown", noValueRetention: configurationInput.noValueRetention === true };
  const recoveryInput = context.recovery || {};
  const recovery = {
    owner: safeId(recoveryInput.owner),
    rollbackPath: safeText(recoveryInput.rollbackPath) ? text(recoveryInput.rollbackPath) : "",
    remediationAction: safeText(recoveryInput.remediationAction) ? text(recoveryInput.remediationAction) : "",
    recheckAt: safeText(recoveryInput.recheckAt) ? text(recoveryInput.recheckAt) : "",
    expiryAt: safeText(recoveryInput.expiryAt) ? text(recoveryInput.expiryAt) : "",
  };
  const backendTruth = BACKEND_TRUTHS.has(context.backendTruth || options.backendTruth) ? (context.backendTruth || options.backendTruth) : "dry_run";
  const sourceEvidence = target.sourceRefs.length > 0 && target.evidenceRefs.length > 0;
  const exactTarget = [target.workerId, target.assignmentId, target.owner, target.runId].every(Boolean);
  const backendProof = backendTruth !== "live" || context.backendTruthProven === true || context.backendTruthProof === true;
  const authorityState = text(context.authorityState || options.authorityState, "blocked");
  const riskTier = ["low", "medium", "high", "extreme"].includes(context.riskTier || options.riskTier) ? (context.riskTier || options.riskTier) : "high";
  const gatesInput = context.gates || {};
  const evidence = target.evidenceRefs;
  const gates = [
    suppliedGate(gatesInput, "exact_ownership", exactTarget && context.ownershipAmbiguous !== true, "ownership_ambiguous", "Provide exact worker, assignment, owner, and run identity.", evidence),
    suppliedGate(gatesInput, "source_evidence", sourceEvidence, "evidence_missing", "Provide source and evidence refs for the exact target.", evidence),
    suppliedGate(gatesInput, "backend_truth", backendProof, "backend_truth_unproven", "Provide backend truth proof before live eligibility.", evidence),
    suppliedGate(gatesInput, "authority_risk", authorityState === "allowed" && context.authorityProven === true, "authority_violation", "Provide explicit authority and risk evidence.", evidence),
    suppliedGate(gatesInput, "recovery_rollback", Boolean(recovery.owner && recovery.rollbackPath && recovery.remediationAction), "rollback_missing", "Provide a recovery owner, rollback path, and remediation action.", evidence),
    suppliedGate(gatesInput, "resource_cost", Boolean(thresholdFor(profile, "resources") && thresholdFor(profile, "cost")), "threshold_missing", "Provide explicit resource and cost ceilings.", evidence),
    suppliedGate(gatesInput, "configuration_secrets", configuration.validationState === "pass" && configuration.noValueRetention && names.length > 0, "configuration_invalid", "Provide allowlisted configuration names with no value retention.", evidence),
    suppliedGate(gatesInput, "telemetry_alerts", Boolean(telemetry.source && telemetry.coverage && telemetry.alertReady && telemetry.alertThresholdIds.length > 0), "telemetry_missing", "Provide fresh telemetry coverage and alert threshold metadata.", evidence),
    suppliedGate(gatesInput, "preflight", context.preflight?.status === "ready" && !(context.preflight?.blockers?.length), "preflight_blocked", "Refresh preflight and clear all blockers.", evidence),
    suppliedGate(gatesInput, "usage", ["normal", "ready"].includes(context.usage?.status || context.usage?.state), "usage_pressure", "Wait for an explicitly normal usage posture.", evidence),
    suppliedGate(gatesInput, "resources", ["normal", "ready"].includes(context.resources?.status || context.resources?.state), "resource_pressure", "Wait for an explicitly normal resource posture.", evidence),
    suppliedGate(gatesInput, "heartbeat", context.heartbeat?.fresh === true, "evidence_stale", "Refresh the worker heartbeat within five minutes.", evidence),
    suppliedGate(gatesInput, "dispatcher_lease", context.dispatcherLease?.proven === true, "dispatcher_lease_unproven", "Provide dispatcher lease proof for the exact target.", evidence),
    suppliedGate(gatesInput, "receipt_evidence", context.receipt?.proven === true, "receipt_unproven", "Provide receipt/checkpoint proof for the exact target.", evidence),
  ];
  if (missingThresholds.length > 0) {
    gates.push(gate("explicit_thresholds", { state: "blocked", typedReason: "threshold_missing" }, "threshold_missing", `Provide explicit thresholds for: ${missingThresholds.join(", ")}.`, evidence));
  }
  const typedBlockers = gates.filter((entry) => entry.state !== "pass").map((entry) => ({ gateId: entry.gateId, reason: entry.typedReason || "unknown", nextAction: entry.nextAction }));
  const outcome = typedBlockers.length === 0 && backendTruth === "live" && context.freshnessState === "live" && context.metadataOnly !== false ? "go" : "no_go";
  return {
    schemaVersion: SCHEMA_VERSION,
    target,
    backendTruth,
    authorityState,
    riskTier,
    sliSlo: thresholds,
    telemetry,
    configuration,
    recovery,
    gates,
    outcome,
    typedBlockers,
    checkedAt,
    expiresAt,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateOperationalReadinessContract(contract = {}) {
  const blockers = [];
  if (contract?.schemaVersion !== SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported readiness contract schema.", nextAction: "Regenerate the readiness packet." });
  if (contract?.metadataOnly !== true || contract?.rawPayloadRetained !== false) blockers.push({ code: "safety_violation", message: "Readiness evidence must be metadata-only.", nextAction: "Remove raw payload retention and regenerate." });
  if (!OUTCOMES.has(contract?.outcome)) blockers.push({ code: "unknown", message: "Readiness outcome is missing or malformed.", nextAction: "Regenerate the readiness packet." });
  if (!Array.isArray(contract?.gates) || REQUIRED_GATES.some((id) => !contract.gates.some((entry) => entry?.gateId === id))) blockers.push({ code: "evidence_missing", message: "Required readiness gates are missing.", nextAction: "Evaluate every required readiness gate." });
  if (Array.isArray(contract?.gates)) {
    for (const entry of contract.gates) {
      if (!GATE_STATES.has(entry?.state) || !safeText(entry?.nextAction) || refs(entry?.evidenceRefs).length !== (entry?.evidenceRefs || []).length) blockers.push({ code: "evidence_missing", message: `Gate ${text(entry?.gateId, "unknown")} is malformed.`, nextAction: "Regenerate the gate evidence." });
    }
  }
  if (contract?.outcome === "go" && (!Array.isArray(contract?.sliSlo) || REQUIRED_INDICATORS.some((name) => !contract.sliSlo.some((entry) => entry?.indicator === name && entry?.target?.explicit === true)))) blockers.push({ code: "threshold_missing", message: "Explicit SLI/SLO thresholds are incomplete.", nextAction: "Provide all non-default readiness thresholds." });
  if (contract?.outcome === "go" && (!Array.isArray(contract?.configuration?.names) || contract.configuration.names.length === 0 || contract.configuration.noValueRetention !== true || contract.configuration.validationState !== "pass" || contract.configuration.names.some((name) => !safeId(name)))) blockers.push({ code: "configuration_invalid", message: "Configuration readiness must contain allowlisted names without values.", nextAction: "Provide validated allowlisted configuration metadata only." });
  if (contract?.outcome === "go" && (!safeId(contract?.telemetry?.source) || !safeId(contract?.telemetry?.coverage) || contract.telemetry.alertReady !== true || !Array.isArray(contract.telemetry.alertThresholdIds) || contract.telemetry.alertThresholdIds.length === 0)) blockers.push({ code: "telemetry_missing", message: "Telemetry and alert coverage is incomplete.", nextAction: "Provide fresh telemetry source, coverage, and alert threshold metadata." });
  if (contract?.outcome === "go" && (contract.backendTruth !== "live" || contract.typedBlockers?.length)) blockers.push({ code: "backend_truth_unproven", message: "Go requires live backend truth and no blockers.", nextAction: "Hold until live proof is complete." });
  return blockers;
}

export { SCHEMA_VERSION as PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION, REQUIRED_GATES as PIPELINE_OPERATIONAL_READINESS_REQUIRED_GATES };
