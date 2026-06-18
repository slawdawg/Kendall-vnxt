const gateStatuses = new Set(["pass", "fail", "warn", "skip", "blocked"]);
const checkStatuses = new Set(["pass", "fail", "warn", "skip"]);
const installCheckStatuses = new Set(["pass", "fail", "warn", "skip", "blocked"]);
const results = new Set(["pass", "fail", "blocked"]);
const modes = new Set(["doctor", "plan", "verify-only"]);
const bootstrapAuthorityLevels = new Set(["plan", "verify", "evidence-write"]);
const installAuthorityLevels = new Set(["verify", "evidence-write"]);
const manualTaskIds = new Set(["tailscale-login", "codex-login", "claude-login", "provider-auth"]);
const requiredRedactions = new Set(["gh-auth-output", "environment", "authorized-keys", "provider-tokens", "private-keys"]);
const forbiddenEvidenceTextPatterns = [
  { label: "private key material", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "provider token", pattern: /\b(?:sk|sk-proj|sk-ant)-[A-Za-z0-9_-]{12,}\b/ },
  { label: "auth URL", pattern: /https?:\/\/\S*(?:oauth|device|authorize)\S*/i },
  { label: "device code", pattern: /\bdevice[-_ ]?code\b\s*[:=]/i },
  { label: "credential helper output", pattern: /\bcredential helper output\b/i },
  { label: "shell history", pattern: /\b(?:\.bash_history|shell history)\b/i },
  { label: "environment dump", pattern: /\b(?:PATH=|HOME=|SHELL=|env dump|environment dump)\b/ },
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(errors, object, path) {
  if (typeof object !== "string" || object.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function requireBoolean(errors, object, path) {
  if (typeof object !== "boolean") {
    errors.push(`${path} must be boolean`);
  }
}

function requireNumber(errors, object, path) {
  if (typeof object !== "number" || !Number.isInteger(object) || object < 0) {
    errors.push(`${path} must be a non-negative integer`);
  }
}

function validateManualTasks(errors, manualTasks) {
  if (!Array.isArray(manualTasks)) {
    errors.push("manual_tasks must be an array");
    return;
  }

  const seen = new Set();
  for (const [index, task] of manualTasks.entries()) {
    if (!isObject(task)) {
      errors.push(`manual_tasks[${index}] must be an object`);
      continue;
    }
    requireString(errors, task.id, `manual_tasks[${index}].id`);
    requireString(errors, task.summary, `manual_tasks[${index}].summary`);
    if (task.status !== "manual-post-install") {
      errors.push(`manual_tasks[${index}].status must be manual-post-install`);
    }
    if (typeof task.id === "string") {
      seen.add(task.id);
    }
  }

  for (const id of manualTaskIds) {
    if (!seen.has(id)) {
      errors.push(`manual_tasks must include ${id}`);
    }
  }
}

function validateRedactions(errors, redactions) {
  if (!Array.isArray(redactions)) {
    errors.push("redactions must be an array");
    return;
  }

  const seen = new Set();
  for (const [index, redaction] of redactions.entries()) {
    if (typeof redaction !== "string" || redaction.length === 0) {
      errors.push(`redactions[${index}] must be a non-empty string`);
      continue;
    }
    seen.add(redaction);
  }

  for (const redaction of requiredRedactions) {
    if (!seen.has(redaction)) {
      errors.push(`redactions must include ${redaction}`);
    }
  }
}

function validateMutations(errors, mutations, authorityLevel) {
  if (!Array.isArray(mutations)) {
    errors.push("mutations must be an array");
    return;
  }

  const seen = new Set();
  for (const [index, mutation] of mutations.entries()) {
    if (typeof mutation !== "string" || mutation.length === 0) {
      errors.push(`mutations[${index}] must be a non-empty string`);
      continue;
    }
    seen.add(mutation);
  }

  if (authorityLevel === "evidence-write" && !seen.has("evidence-file")) {
    errors.push("evidence-write authority requires evidence-file mutation");
  }
}

function validateActionRows(errors, rows, path) {
  if (!Array.isArray(rows)) {
    errors.push(`${path} must be an array`);
    return;
  }

  for (const [index, row] of rows.entries()) {
    if (!isObject(row)) {
      errors.push(`${path}[${index}] must be an object`);
      continue;
    }
    requireString(errors, row.id, `${path}[${index}].id`);
    requireString(errors, row.status, `${path}[${index}].status`);
    requireString(errors, row.summary, `${path}[${index}].summary`);
  }
}

function validateSkippedRows(errors, rows) {
  if (!Array.isArray(rows)) {
    errors.push("skipped must be an array");
    return;
  }

  for (const [index, row] of rows.entries()) {
    if (!isObject(row)) {
      errors.push(`skipped[${index}] must be an object`);
      continue;
    }
    requireString(errors, row.id, `skipped[${index}].id`);
    if (row.status !== "skip" && row.status !== "blocked") {
      errors.push(`skipped[${index}].status must be skip or blocked`);
    }
    requireString(errors, row.reason, `skipped[${index}].reason`);
  }
}

function collectEvidenceText(value, path = "", entries = []) {
  if (typeof value === "string") {
    entries.push([path, value]);
    return entries;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectEvidenceText(item, `${path}[${index}]`, entries);
    }
    return entries;
  }

  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "redactions") {
        continue;
      }
      collectEvidenceText(item, path ? `${path}.${key}` : key, entries);
    }
  }

  return entries;
}

function validateForbiddenEvidenceText(errors, evidence) {
  for (const [path, text] of collectEvidenceText(evidence)) {
    for (const { label, pattern } of forbiddenEvidenceTextPatterns) {
      if (pattern.test(text)) {
        errors.push(`${path} must not include ${label}`);
      }
    }
  }
}

function validateAuthority(errors, authority, allowedLevels) {
  if (!isObject(authority)) {
    errors.push("authority must be an object");
    return;
  }

  requireString(errors, authority.level, "authority.level");
  if (typeof authority.level === "string" && !allowedLevels.has(authority.level)) {
    errors.push(`authority.level must be one of ${[...allowedLevels].join(", ")}`);
  }
}

export function validateBootstrapEvidence(evidence) {
  const errors = [];

  if (!isObject(evidence)) {
    return ["evidence must be an object"];
  }
  validateForbiddenEvidenceText(errors, evidence);
  if (evidence.schema !== "kendall-linux-bootstrap-evidence/v1") {
    errors.push("schema must be kendall-linux-bootstrap-evidence/v1");
  }
  requireString(errors, evidence.generated_at, "generated_at");

  if (!isObject(evidence.command)) {
    errors.push("command must be an object");
  } else {
    if (!modes.has(evidence.command.mode)) {
      errors.push("command.mode must be doctor, plan, or verify-only");
    }
    requireString(errors, evidence.command.invoked, "command.invoked");
  }

  if (!isObject(evidence.target)) {
    errors.push("target must be an object");
  } else {
    for (const key of ["alias", "user", "hostname", "repo", "minimumOsVersion", "nodeRange", "address_source"]) {
      requireString(errors, evidence.target[key], `target.${key}`);
    }
  }

  validateAuthority(errors, evidence.authority, bootstrapAuthorityLevels);
  if (evidence.command?.mode === "doctor" && evidence.authority?.level !== "verify") {
    errors.push("doctor authority must be verify");
  }

  if (!Array.isArray(evidence.gates) || evidence.gates.length === 0) {
    errors.push("gates must be a non-empty array");
  } else {
    for (const [index, gate] of evidence.gates.entries()) {
      if (!isObject(gate)) {
        errors.push(`gates[${index}] must be an object`);
        continue;
      }
      for (const key of ["id", "summary", "recovery", "timestamp", "command"]) {
        requireString(errors, gate[key], `gates[${index}].${key}`);
      }
      if (!gateStatuses.has(gate.status)) {
        errors.push(`gates[${index}].status is invalid`);
      }
    }
  }

  if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
    errors.push("checks must be a non-empty array");
  } else {
    for (const [index, check] of evidence.checks.entries()) {
      if (!isObject(check)) {
        errors.push(`checks[${index}] must be an object`);
        continue;
      }
      requireString(errors, check.id, `checks[${index}].id`);
      requireString(errors, check.summary, `checks[${index}].summary`);
      if (!checkStatuses.has(check.status)) {
        errors.push(`checks[${index}].status is invalid`);
      }
    }
  }

  validateManualTasks(errors, evidence.manual_tasks);

  validateMutations(errors, evidence.mutations, evidence.authority?.level);
  if (evidence.command?.mode === "doctor" && Array.isArray(evidence.mutations) && evidence.mutations.length > 0) {
    errors.push("doctor evidence must not include mutations");
  }
  validateActionRows(errors, evidence.project_actions, "project_actions");
  validateActionRows(errors, evidence.tool_changes, "tool_changes");
  validateSkippedRows(errors, evidence.skipped);
  validateRedactions(errors, evidence.redactions);

  if (!isObject(evidence.auth_boundary)) {
    errors.push("auth_boundary must be an object");
  } else {
    for (const key of [
      "performed_provider_login",
      "performed_tailscale_login",
      "performed_codex_login",
      "performed_claude_login",
      "performed_browser_auth",
      "read_or_wrote_provider_tokens",
    ]) {
      requireBoolean(errors, evidence.auth_boundary[key], `auth_boundary.${key}`);
      if (evidence.auth_boundary[key] !== false) {
        errors.push(`auth_boundary.${key} must be false`);
      }
    }
  }

  if (!results.has(evidence.result)) {
    errors.push("result must be pass, fail, or blocked");
  }
  requireString(errors, evidence.rerun_guidance, "rerun_guidance");

  const gateStatusesSeen = new Set((evidence.gates ?? []).map((gate) => gate.status));
  if (evidence.result === "blocked" && !gateStatusesSeen.has("blocked")) {
    errors.push("blocked result requires at least one blocked gate");
  }
  if (evidence.result === "fail" && !gateStatusesSeen.has("fail")) {
    errors.push("fail result requires at least one failed gate");
  }
  if (evidence.result === "pass" && (gateStatusesSeen.has("fail") || gateStatusesSeen.has("blocked"))) {
    errors.push("pass result must not include failed or blocked gates");
  }

  const fullVerifyPassed = (evidence.gates ?? []).some((gate) => gate.id === "full-verify" && gate.status === "pass");
  if (fullVerifyPassed) {
    if (!Array.isArray(evidence.tool_versions) || evidence.tool_versions.length === 0) {
      errors.push("passing full-verify evidence must include tool_versions");
    }
    if (!isObject(evidence.repo_state)) {
      errors.push("passing full-verify evidence must include repo_state");
    }
    if (!isObject(evidence.validation_summary)) {
      errors.push("passing full-verify evidence must include validation_summary");
    }
  }

  return errors;
}

export function validateInstallEvidence(evidence) {
  const errors = [];

  if (!isObject(evidence)) {
    return ["evidence must be an object"];
  }
  validateForbiddenEvidenceText(errors, evidence);
  if (evidence.schema !== "kendall-linux-install-evidence/v1") {
    errors.push("schema must be kendall-linux-install-evidence/v1");
  }
  requireString(errors, evidence.generated_at, "generated_at");
  if (evidence.mode !== "verify") {
    errors.push("mode must be verify");
  }

  if (!isObject(evidence.command)) {
    errors.push("command must be an object");
  } else {
    if (evidence.command.mode !== "verify") {
      errors.push("command.mode must be verify");
    }
    requireString(errors, evidence.command.invoked, "command.invoked");
  }

  if (!isObject(evidence.target)) {
    errors.push("target must be an object");
  } else {
    for (const key of ["alias", "user", "hostname", "repo", "repo_url", "minimumOsVersion", "nodeRange", "address_source"]) {
      requireString(errors, evidence.target[key], `target.${key}`);
    }
    if (evidence.target.alias !== "local") {
      errors.push("target.alias must be local");
    }
    if (evidence.target.address_source !== "local-session") {
      errors.push("target.address_source must be local-session");
    }
  }

  validateAuthority(errors, evidence.authority, installAuthorityLevels);

  if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
    errors.push("checks must be a non-empty array");
  } else {
    for (const [index, check] of evidence.checks.entries()) {
      if (!isObject(check)) {
        errors.push(`checks[${index}] must be an object`);
        continue;
      }
      requireString(errors, check.id, `checks[${index}].id`);
      requireString(errors, check.summary, `checks[${index}].summary`);
      if (!installCheckStatuses.has(check.status)) {
        errors.push(`checks[${index}].status is invalid`);
      }
    }
  }

  if (!isObject(evidence.checks_summary)) {
    errors.push("checks_summary must be an object");
  } else {
    for (const key of ["pass", "fail", "warn"]) {
      requireNumber(errors, evidence.checks_summary[key], `checks_summary.${key}`);
    }
    if (evidence.checks_summary.blocked !== undefined) {
      requireNumber(errors, evidence.checks_summary.blocked, "checks_summary.blocked");
    }
  }
  validateMutations(errors, evidence.mutations, evidence.authority?.level);
  validateRedactions(errors, evidence.redactions);
  if (evidence.tool_changes !== undefined) {
    validateActionRows(errors, evidence.tool_changes, "tool_changes");
  }

  validateManualTasks(errors, evidence.manual_tasks);

  if (!isObject(evidence.auth_boundary)) {
    errors.push("auth_boundary must be an object");
  } else {
    for (const key of [
      "performed_provider_login",
      "performed_tailscale_login",
      "performed_codex_login",
      "performed_claude_login",
      "performed_browser_auth",
      "read_or_wrote_provider_tokens",
    ]) {
      requireBoolean(errors, evidence.auth_boundary[key], `auth_boundary.${key}`);
      if (evidence.auth_boundary[key] !== false) {
        errors.push(`auth_boundary.${key} must be false`);
      }
    }
  }

  if (!results.has(evidence.result)) {
    errors.push("result must be pass, fail, or blocked");
  }
  requireString(errors, evidence.rerun_guidance, "rerun_guidance");

  const checkStatusesSeen = new Set((evidence.checks ?? []).map((check) => check.status));
  if (isObject(evidence.checks_summary) && Array.isArray(evidence.checks)) {
    const actualSummary = evidence.checks.reduce(
      (summary, check) => {
        if (check.status === "pass" || check.status === "fail" || check.status === "warn" || check.status === "blocked") {
          summary[check.status] += 1;
        }
        return summary;
      },
      { pass: 0, fail: 0, warn: 0, blocked: 0 },
    );
    for (const key of ["pass", "fail", "warn"]) {
      if (evidence.checks_summary[key] !== actualSummary[key]) {
        errors.push(`checks_summary.${key} must equal actual ${key} check count`);
      }
    }
    if (evidence.checks_summary.blocked !== undefined && evidence.checks_summary.blocked !== actualSummary.blocked) {
      errors.push("checks_summary.blocked must equal actual blocked check count");
    }
  }
  if (evidence.result === "blocked" && !checkStatusesSeen.has("blocked")) {
    errors.push("blocked install result requires at least one blocked check explaining the stop");
  }
  if (evidence.result === "fail" && !checkStatusesSeen.has("fail")) {
    errors.push("failed install result requires at least one failed check");
  }
  if (evidence.result === "pass" && checkStatusesSeen.has("fail")) {
    errors.push("passing install result must not include failed checks");
  }

  return errors;
}

export function validateLinuxEvidence(evidence) {
  if (evidence?.schema === "kendall-linux-install-evidence/v1") {
    return validateInstallEvidence(evidence);
  }
  return validateBootstrapEvidence(evidence);
}
