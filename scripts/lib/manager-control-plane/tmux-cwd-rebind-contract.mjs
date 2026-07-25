const REBIND_REQUIRED_FRAGMENTS = [
  "function rebindManagedWorkerCwd",
  'const cwd = sanitizeLedgerField(pairing.workerHandoff?.cwd || "", "", 260);',
  'const respawn = runner("tmux", [',
  '"respawn-pane", "-k", "-t", target.target, "-c", cwd,',
  'const inspected = runner("tmux", ["display-message", "-p", "-t", target.target, "#{pane_current_path}"]',
  'const observedCwd = sanitizeLedgerField(String(inspected?.stdout || "").trim(), "", 260);',
  'return { ok: true, status: "rebound", cwd: observedCwd, expectedCwd: cwd, paneTarget: target.target };',
  "const preWriteGuard = rebind.ok",
  "approveManagerPreWriteHandoff(pairing, rebind, context)",
  "const paste = rebind.ok && preWriteGuard.status === \"allowed\"",
];

const FORBIDDEN_TMUX_CONTROLS = ["kill-pane", "source-file"];

export function findManagerTmuxControlViolations(source = "") {
  const violations = [];
  for (const forbidden of FORBIDDEN_TMUX_CONTROLS) {
    if (source.includes(forbidden)) {
      violations.push(`Manager core must not expose tmux ${forbidden}`);
    }
  }

  const respawnMentions = source.match(/\brespawn-pane\b/g) || [];
  const respawnCalls = source.match(/runner\(\s*["']tmux["']\s*,\s*\[\s*["']respawn-pane["']/g) || [];
  if (respawnMentions.length !== 3 || respawnCalls.length !== 1 || REBIND_REQUIRED_FRAGMENTS.some((fragment) => !source.includes(fragment))) {
    violations.push("Manager core may use respawn-pane only once for the validated managed worker CWD rebind before an allowed pre-write handoff");
  }
  return violations;
}
