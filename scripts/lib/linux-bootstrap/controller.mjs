import {
  defaultEvidencePath,
  recordAuthBoundary,
  recordGate,
  recordManualTasks,
  validateEvidencePath,
  writeEvidence,
} from "./evidence.mjs";
import { buildPlanGates, localIdentityScript, parseTargetIdentity, validateTargetIdentity } from "./gates.mjs";

export function runLocalIdentityGate(executor, options, evidence) {
  const result = executor.shell(localIdentityScript());
  if (result.status !== 0) {
    return {
      id: "local-identity",
      status: "fail",
      summary: "local identity command failed",
      recovery: "Confirm this is Ubuntu, sudo is installed, and the terminal user is non-root.",
      command: "local identity probe",
      details: { stderr: result.stderr.trim().slice(0, 500) },
    };
  }

  const identity = parseTargetIdentity(result.stdout);
  options.user = identity.user || options.user;
  options.target = identity.hostname || "local";
  evidence.target.alias = "local";
  evidence.target.user = identity.user || evidence.target.user;
  evidence.target.hostname = identity.hostname || evidence.target.hostname;
  evidence.target.repo = `${identity.home || "$HOME"}/Kendall_Nxt`;
  return validateTargetIdentity(identity, options);
}

export function validatorArgs(options, { skipRepo = false, evidence = "" } = {}) {
  const args = ["--verify-only", "--alias", "local", "--address-source", "local-session"];
  if (options.hostname) {
    args.push("--hostname", options.hostname);
  }
  if (skipRepo) {
    args.push("--skip-repo");
  }
  if (evidence) {
    args.push("--evidence", evidence);
  } else {
    args.push("--json");
  }
  return args;
}

export function collectToolEvidence(evidence, validatorOutput) {
  if (!validatorOutput) {
    return;
  }
  try {
    const parsed = JSON.parse(validatorOutput);
    evidence.tool_versions = parsed.checks
      .filter((check) => ["git", "node", "pnpm", "uv", "gh", "codex", "claude", "bmad-method"].includes(check.id))
      .map((check) => ({ id: check.id, status: check.status, summary: check.summary }));
    evidence.repo_state = parsed.checks.find((check) => check.id === "repo") ?? null;
    evidence.validation_summary = parsed.checks_summary ?? null;
  } catch {
    evidence.validation_summary = { parse_error: "validator JSON output could not be parsed" };
  }
}

export function baseToolsGate(options) {
  return {
    id: "base-tools",
    status: "skip",
    summary: `${options.mode} mode does not install base tools`,
    recovery: "Run scripts/bootstrap-linux.sh --install-kendall-vnxt for the single supported install method.",
    command: "scripts/bootstrap-linux.sh --install-kendall-vnxt",
  };
}

export function repoStateGate(executor, options, evidence) {
  if (options.mode === "verify-only") {
    const result = executor.command("bash", ["scripts/validate-linux-install.sh", ...validatorArgs(options)]);
    return {
      id: "repo-state",
      status: result.status === 0 ? "pass" : "fail",
      summary: result.status === 0 ? "repo and project validation succeeded" : "repo or project validation failed",
      recovery: result.status === 0 ? "none" : "Clone the repo, complete manual GitHub auth if private repo access is required, then rerun.",
      command: "scripts/validate-linux-install.sh --verify-only",
      details: result.stdout ? { validator: result.stdout.trim().slice(0, 1000) } : undefined,
    };
  }

  return {
    id: "repo-state",
    status: "skip",
    summary: `${options.mode} mode does not clone or mutate the repo`,
    recovery: "Run scripts/bootstrap-linux.sh --install-kendall-vnxt for the single supported install method.",
    command: "scripts/bootstrap-linux.sh --install-kendall-vnxt",
  };
}

export function bootstrapApplyGate(options) {
  return {
    id: "install-script",
    status: "skip",
    summary: `${options.mode} mode does not run project setup`,
    recovery: "Run scripts/bootstrap-linux.sh --install-kendall-vnxt for the single supported install method.",
    command: "scripts/bootstrap-linux.sh --install-kendall-vnxt",
  };
}

export function fullVerifyGate(executor, options, evidence) {
  const result = executor.command("bash", ["scripts/validate-linux-install.sh", ...validatorArgs(options)]);
  if (result.status === 0) {
    collectToolEvidence(evidence, result.stdout.trim());
  }
  return {
    id: "full-verify",
    status: result.status === 0 ? "pass" : "fail",
    summary: result.status === 0 ? "local validation passed" : "local validation failed",
    recovery: result.status === 0 ? "none" : "Review validator output, fix failed checks, and rerun.",
    command: "scripts/validate-linux-install.sh --verify-only",
    details: result.stdout ? { validator: result.stdout.trim().slice(0, 2000) } : undefined,
  };
}

export function manualAuthSummaryGate() {
  return {
    id: "manual-auth-summary",
    status: "pass",
    summary: "Tailscale, Codex, Claude, and provider logins remain post-install user tasks",
    recovery: "Run those login flows manually after bootstrap if needed.",
    command: "none",
  };
}

export function planOnlyGates() {
  return [
    {
      id: "local-identity",
      status: "skip",
      summary: "planned gate: verify local user, hostname, Ubuntu version, architecture, home, and sudo availability",
      recovery: "Run --verify-only inside Ubuntu to execute the local identity probe.",
      command: "local identity probe",
    },
    {
      id: "base-tools",
      status: "skip",
      summary: "planned gate: single install script detects and installs approved base tools",
      recovery: "Run scripts/bootstrap-linux.sh --install-kendall-vnxt only from the local Ubuntu terminal.",
      command: "scripts/bootstrap-linux.sh --install-kendall-vnxt",
    },
    {
      id: "repo-state",
      status: "skip",
      summary: "planned gate: detect, clone, or validate Kendall Vnxt repo without starting auth flows",
      recovery: "Perform manual GitHub repo auth if private repo access is required.",
      command: "detect repo or git clone with GIT_TERMINAL_PROMPT=0",
    },
    {
      id: "install-script",
      status: "skip",
      summary: "planned gate: single install script runs project setup",
      recovery: "Resolve dependency errors and rerun scripts/bootstrap-linux.sh --install-kendall-vnxt if setup fails.",
      command: "scripts/bootstrap-linux.sh --install-kendall-vnxt",
    },
    {
      id: "full-verify",
      status: "skip",
      summary: "planned gate: run local validation after repo setup",
      recovery: "Run --verify-only to execute validation without install mutation.",
      command: "scripts/validate-linux-install.sh --verify-only",
    },
    {
      id: "evidence-write",
      status: "skip",
      summary: "planned gate: write evidence for verify-only or the single install script",
      recovery: "Use --verify-only for verifier evidence or scripts/bootstrap-linux.sh --install-kendall-vnxt for install evidence.",
      command: "write local evidence JSON",
    },
  ];
}

export function evidencePathGate(repoRoot, options) {
  if (options.mode === "plan") {
    return {
      id: "evidence-path",
      status: "skip",
      summary: "plan mode does not write evidence",
      recovery: "Use --verify-only for verifier evidence or scripts/bootstrap-linux.sh --install-kendall-vnxt for install evidence.",
      command: "validate local evidence path",
    };
  }

  if (!options.evidence) {
    options.evidence = defaultEvidencePath(repoRoot, options.mode, options.target || "local");
  }

  try {
    validateEvidencePath(repoRoot, options.evidence);
  } catch (error) {
    return {
      id: "evidence-path",
      status: "fail",
      summary: error.message,
      recovery: "Choose a new evidence path under docs/linux-install/evidence/.",
      command: "validate local evidence path",
    };
  }

  return {
    id: "evidence-path",
    status: "pass",
    summary: `evidence path is available at ${options.evidence}`,
    recovery: "none",
    command: "validate local evidence path",
  };
}

export function evidenceWriteGate(repoRoot, options) {
  if (!options.evidence) {
    options.evidence = defaultEvidencePath(repoRoot, options.mode, options.target || "local");
  }
  return {
    id: "evidence-write",
    status: "pass",
    summary: `wrote bootstrap evidence to ${options.evidence}`,
    recovery: "Commit evidence only when it is part of an approved feature slice.",
    command: "write local evidence JSON",
  };
}

export function recordAndWriteEvidence(repoRoot, options, evidence) {
  recordGate(evidence, evidenceWriteGate(repoRoot, options));
  if (!evidence.mutations.includes("evidence-file")) {
    evidence.mutations.push("evidence-file");
  }
  writeEvidence(repoRoot, options.evidence, evidence);
}

export function hasBlockingGate(gates) {
  return gates.some((gate) => ["fail", "blocked"].includes(gate.status));
}

export function runBootstrapController({ repoRoot, options, executor, evidence, operatorPreflightGate }) {
  for (const gate of buildPlanGates(options)) {
    recordGate(evidence, gate);
  }

  recordGate(evidence, operatorPreflightGate());
  recordGate(evidence, evidencePathGate(repoRoot, options));

  if (hasBlockingGate(evidence.gates)) {
    recordGate(evidence, manualAuthSummaryGate());
    recordAuthBoundary(evidence);
    recordManualTasks(evidence);
    return { exitCode: 1, wroteEvidence: false };
  }

  if (options.mode === "plan") {
    for (const gate of planOnlyGates()) {
      recordGate(evidence, gate);
    }
    recordGate(evidence, manualAuthSummaryGate());
    recordAuthBoundary(evidence);
    recordManualTasks(evidence);
    return { exitCode: 0, wroteEvidence: false };
  }

  recordGate(evidence, runLocalIdentityGate(executor, options, evidence));
  if (!hasBlockingGate(evidence.gates)) {
    recordGate(evidence, baseToolsGate(options));
  }
  if (!hasBlockingGate(evidence.gates)) {
    recordGate(evidence, repoStateGate(executor, options, evidence));
  }
  if (!hasBlockingGate(evidence.gates)) {
    recordGate(evidence, bootstrapApplyGate(options));
  }
  if (!hasBlockingGate(evidence.gates)) {
    recordGate(evidence, fullVerifyGate(executor, options, evidence));
  }

  recordGate(evidence, manualAuthSummaryGate());
  recordAuthBoundary(evidence);
  recordManualTasks(evidence);
  recordAndWriteEvidence(repoRoot, options, evidence);
  return { exitCode: hasBlockingGate(evidence.gates) ? 1 : 0, wroteEvidence: true };
}
