const TAP_HEADER_ONLY_PATTERN = /^TAP version \d+\s*$/;

export function parseManagerShardTimeout(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`MANAGER_TEST_SHARD_TIMEOUT_MS must be a finite positive integer; received ${text || "<empty>"}.`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`MANAGER_TEST_SHARD_TIMEOUT_MS must be a finite positive integer; received ${text}.`);
  }
  return parsed;
}

export function resolveManagerShardJobs(value) {
  const text = String(value ?? "").trim();
  if (!text) return 1;
  if (!/^\d+$/.test(text)) {
    throw new Error(`MANAGER_TEST_SHARD_JOBS must be a positive integer; received ${text}.`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`MANAGER_TEST_SHARD_JOBS must be a positive integer; received ${text}.`);
  }
  return parsed;
}

export function terminateManagerShardProcessGroup(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

export function classifyManagerVerificationOutput({
  status,
  stdout = "",
  stderr = "",
  timedOut = false,
} = {}) {
  const output = `${stdout || ""}${stderr || ""}`.trim();
  if (timedOut) {
    return { status: "inconclusive", reason: "timeout", output };
  }
  if (status !== 0) {
    return { status: "failed", reason: "nonzero-exit", output };
  }
  if (!output) {
    return { status: "inconclusive", reason: "empty-output", output };
  }
  if (TAP_HEADER_ONLY_PATTERN.test(output)) {
    return { status: "inconclusive", reason: "tap-header-only", output };
  }

  const testCount = output.match(/(?:ℹ\s+tests|tests)\s+(\d+)/i);
  if (!testCount) {
    return { status: "inconclusive", reason: "missing-test-summary", output };
  }
  if (Number(testCount[1]) < 1) {
    return { status: "inconclusive", reason: "zero-tests", output };
  }
  if (!/(?:^|\n)\s*# Subtest:/m.test(output) && !/(?:^|\n)\s*✔\s+/m.test(output)) {
    return { status: "inconclusive", reason: "missing-test-evidence", output };
  }
  return { status: "passed", reason: "test-summary-present", output };
}

export function resolveManagerVerificationRoute(results = []) {
  const inconclusive = results.filter((result) => result?.status === "inconclusive");
  const failed = results.filter((result) => result?.status === "failed");
  if (failed.length > 0) {
    return { status: "failed", route: "serial-shards", failClosed: true, failed, inconclusive };
  }
  if (inconclusive.length > 0) {
    return { status: "inconclusive", route: "serial-shards", failClosed: true, failed, inconclusive };
  }
  return { status: "passed", route: "serial-shards", failClosed: false, failed, inconclusive };
}
