const EXACT_RERUN = "exact_command_outside_sandbox_when_read_only";
const DEFAULT_NEXT_ACTION =
  "Stop retrying this command in the sandbox; request approval to rerun the exact same read-only command outside the sandbox.";

const READ_ONLY_FILESYSTEM_TARGETS = [
  {
    signature: ".git/worktrees read-only filesystem boundary",
    target: ".git/worktrees",
    matches(text) {
      return text.includes(".git/worktrees");
    },
  },
  {
    signature: "$HOME/.cache/uv read-only filesystem boundary",
    target: "$HOME/.cache/uv",
    matches(text) {
      return text.includes("$home/.cache/uv") || text.includes(".cache/uv");
    },
  },
  {
    signature: "managed-worktree pnpm temp read-only filesystem boundary",
    target: "managed-worktree pnpm temp",
    matches(text) {
      return text.includes("managed-worktree pnpm") || text.includes("pnpm temp") || (text.includes("pnpm") && text.includes("_tmp_"));
    },
  },
  {
    signature: "local Codex workspace state read-only filesystem boundary",
    target: "local Codex workspace state",
    matches(text) {
      return text.includes(".codex-workspaces") || text.includes("codex workspace state") || text.includes("workspace metadata");
    },
  },
];

const EPERM_CONTEXTS = [
  {
    signature: "git sandbox permission boundary",
    target: "Git probe",
    matches(text) {
      return text.includes("git") || text.includes(".git/");
    },
  },
  {
    signature: "tmux sandbox permission boundary",
    target: "tmux probe",
    matches(text) {
      return text.includes("tmux");
    },
  },
  {
    signature: "workspace metadata sandbox permission boundary",
    target: "workspace metadata probe",
    matches(text) {
      return text.includes("workspace") || text.includes("assignment") || text.includes(".codex-workspaces");
    },
  },
  {
    signature: "child process sandbox permission boundary",
    target: "child process probe",
    matches(text) {
      return text.includes("child_process") || text.includes("spawn") || text.includes("process");
    },
  },
];

export function classifySandboxBoundaryResult(input = {}) {
  const observation = normalizeInput(input);
  const text = observationText(observation);

  if (isSpawnSyncPermissionBoundary(observation, text)) {
    return boundaryPacket(observation, {
      signature: "spawnSync EPERM sandbox boundary",
      evidenceSummary: "Child process spawn was blocked by an EPERM sandbox boundary.",
    });
  }

  for (const target of READ_ONLY_FILESYSTEM_TARGETS) {
    if (target.matches(text) && isReadOnlyFilesystemBoundary(text)) {
      return boundaryPacket(observation, {
        signature: target.signature,
        evidenceSummary: `${target.target} hit a read-only filesystem boundary while running a read-only command.`,
      });
    }
  }

  if (isPermissionBoundary(text)) {
    const context = EPERM_CONTEXTS.find((candidate) => candidate.matches(text));
    if (context) {
      return boundaryPacket(observation, {
        signature: context.signature,
        evidenceSummary: `${context.target} hit an EPERM/EACCES sandbox boundary.`,
      });
    }
  }

  if (isEmptyJsonStdoutBoundary(observation, text)) {
    return boundaryPacket(observation, {
      signature: "empty JSON stdout sandbox/process boundary",
      evidenceSummary: "A child command expected to emit JSON produced empty stdout before parseable output was available.",
      nextAction:
        "Stop parsing empty stdout as JSON; report the child command metadata and rerun the exact same read-only command outside the sandbox when the command is read-only.",
    });
  }

  return null;
}

export function isKnownSandboxBoundary(input = {}) {
  return Boolean(classifySandboxBoundaryResult(input));
}

function normalizeInput(input) {
  const result = input.result && typeof input.result === "object" ? input.result : input;
  const error = result.error || input.error || null;
  return {
    command: normalizeCommand(input.command || result.command || result.spawnargs || result.args || ""),
    stdout: stringValue(result.stdout ?? input.stdout),
    stderr: stringValue(result.stderr ?? input.stderr),
    output: stringValue(input.output),
    error,
    errorCode: stringValue(input.errorCode || result.errorCode || error?.code),
    errorMessage: stringValue(input.errorMessage || result.errorMessage || error?.message),
    status: result.status ?? input.status ?? null,
    signal: result.signal ?? input.signal ?? null,
    expectedJson: Boolean(input.expectedJson || input.requiresJson || input.jsonExpected),
    readOnly: input.readOnly === true || result.readOnly === true,
    mutation: normalizeMutation(input.mutation),
  };
}

function boundaryPacket(observation, fields) {
  return {
    boundary: true,
    class: "sandbox",
    signature: fields.signature,
    command: observation.command || "unknown-command",
    safe_rerun: observation.readOnly ? EXACT_RERUN : "none",
    mutation: observation.mutation,
    next_action: fields.nextAction || DEFAULT_NEXT_ACTION,
    evidence_summary: fields.evidenceSummary,
  };
}

function normalizeCommand(value) {
  if (Array.isArray(value)) {
    return value.filter((part) => part !== undefined && part !== null).map((part) => shellQuote(String(part))).join(" ").trim();
  }
  return stringValue(value).trim();
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizeMutation(value) {
  const mutation = stringValue(value).trim();
  return mutation || "none";
}

function stringValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return String(value);
}

function observationText(observation) {
  return [
    observation.stdout,
    observation.stderr,
    observation.output,
    observation.errorCode,
    observation.errorMessage,
    observation.command,
  ]
    .join("\n")
    .toLowerCase();
}

function isSpawnSyncPermissionBoundary(observation, text) {
  return /spawnsync .*eperm|spawn .*eperm|\beperm\b.*spawnsync|\beperm\b.*spawn/.test(text);
}

function isReadOnlyFilesystemBoundary(text) {
  return /read-only file system|erofs/.test(text);
}

function isPermissionBoundary(text) {
  return /\beperm\b|\beacces\b|permission denied|operation not permitted/.test(text);
}

function isEmptyJsonStdoutBoundary(observation, text) {
  if (!observation.expectedJson || observation.stdout.trim() !== "") {
    return false;
  }
  return (
    Boolean(observation.signal) ||
    text.includes("unexpected end of json input") ||
    text.includes("workspace command produced no json output") ||
    text.includes("empty stdout") ||
    text.includes("interrupted before output") ||
    text.includes("sandbox/process boundary")
  );
}
