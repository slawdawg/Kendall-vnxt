import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

export function safeCommandSummary(value) {
  return String(value).replace(/[^\w.@%+=:,-]/g, "?");
}

export function defaultEvidencePath(repoRoot, mode, target) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return relative(repoRoot, resolve(repoRoot, "docs", "linux-install", "evidence", `${safeCommandSummary(target)}-${mode}-${stamp}.json`));
}

export function validateEvidencePath(repoRoot, evidencePath) {
  const resolved = resolve(repoRoot, evidencePath);
  const allowed = resolve(repoRoot, "docs", "linux-install", "evidence");
  const rel = relative(allowed, resolved);
  if (!rel || rel.startsWith("..") || rel.includes("..\\")) {
    throw new Error(`Evidence path must be under docs/linux-install/evidence/: ${evidencePath}`);
  }
  if (basename(resolved).startsWith(".")) {
    throw new Error("Evidence file name must not be hidden.");
  }
  if (existsSync(resolved)) {
    throw new Error(`Evidence file already exists: ${evidencePath}`);
  }
  return resolved;
}

export function buildEvidence({ repoRoot, options }) {
  const invokedParts = ["node", "./scripts/linux-bootstrap.mjs", `--${options.mode}`];
  if (options.hostname) {
    invokedParts.push("--hostname", safeCommandSummary(options.hostname));
  }
  return {
    schema: "kendall-linux-bootstrap-evidence/v1",
    generated_at: new Date().toISOString(),
    command: {
      mode: options.mode,
      invoked: invokedParts.join(" "),
    },
    target: {
      alias: options.target || "local",
      user: options.user || "current-user",
      hostname: options.hostname || "not-enforced",
      repo: "$HOME/Kendall_Nxt",
      minimumOsVersion: "26.04",
      nodeRange: ">=22 <25",
      address_source: "local-session",
    },
    authority: {
      level: ["doctor", "verify-only"].includes(options.mode) ? "verify" : "plan",
      approval_id: options.approvalId || null,
    },
    gates: [],
    checks: [],
    tool_changes: [],
    project_actions: [],
    manual_tasks: [],
    skipped: [],
    mutations: [],
    redactions: ["gh-auth-output", "environment", "authorized-keys", "provider-tokens", "private-keys"],
    auth_boundary: {},
    result: "blocked",
    rerun_guidance: "",
    repoRoot,
  };
}

export function recordGate(evidence, gate) {
  const normalized = {
    id: gate.id,
    status: gate.status,
    summary: gate.summary,
    recovery: gate.recovery || "none",
    timestamp: new Date().toISOString(),
    command: gate.command || "none",
  };
  if (gate.details) {
    normalized.details = gate.details;
  }
  evidence.gates.push(normalized);
  evidence.checks.push({
    id: gate.id,
    status: gate.status === "blocked" ? "fail" : gate.status,
    summary: gate.summary,
  });
  if (gate.status === "skip" || gate.status === "blocked") {
    evidence.skipped.push({ id: gate.id, status: gate.status, reason: gate.summary });
  }
}

export function recordAuthBoundary(evidence) {
  evidence.auth_boundary = {
    performed_provider_login: false,
    performed_tailscale_login: false,
    performed_codex_login: false,
    performed_claude_login: false,
    performed_browser_auth: false,
    read_or_wrote_provider_tokens: false,
  };
}

export function recordManualTasks(evidence) {
  evidence.manual_tasks = [
    {
      id: "tailscale-login",
      status: "manual-post-install",
      summary: "Enroll or log in to Tailscale only after base bootstrap if the workflow needs Tailnet access.",
    },
    {
      id: "codex-login",
      status: "manual-post-install",
      summary: "Run Codex login manually only after deployment if an interactive Codex workflow needs it.",
    },
    {
      id: "claude-login",
      status: "manual-post-install",
      summary: "Run Claude login manually only after deployment if a Claude workflow needs it.",
    },
    {
      id: "provider-auth",
      status: "manual-post-install",
      summary: "Configure provider authentication manually only after a separately approved workflow needs provider calls.",
    },
  ];
}

export function finalizeResult(evidence) {
  const blocked = evidence.gates.filter((gate) => gate.status === "blocked");
  const failed = evidence.gates.filter((gate) => gate.status === "fail");
  if (blocked.length > 0) {
    evidence.result = "blocked";
    const gate = blocked[0];
    evidence.rerun_guidance = `Resolve blocked gate ${gate.id}: ${gate.recovery}`;
  } else if (failed.length > 0) {
    evidence.result = "fail";
    const gate = failed[0];
    evidence.rerun_guidance = `Fix gate ${gate.id}: ${gate.recovery}`;
  } else {
    evidence.result = "pass";
    evidence.rerun_guidance = "Safe to rerun. Successful reruns should verify existing state without destructive changes.";
  }
  return evidence;
}

export function writeEvidence(repoRoot, evidencePath, evidence) {
  const resolved = validateEvidencePath(repoRoot, evidencePath);
  mkdirSync(dirname(resolved), { recursive: true });
  finalizeResult(evidence);
  const copy = { ...evidence };
  delete copy.repoRoot;
  writeFileSync(resolved, `${JSON.stringify(copy, null, 2)}\n`, "utf8");
  return relative(repoRoot, resolved);
}

export function printSummary(evidence) {
  finalizeResult(evidence);
  const copy = { ...evidence };
  delete copy.repoRoot;
  console.log(JSON.stringify(copy, null, 2));
}
