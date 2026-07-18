import assert from "node:assert/strict";
import test from "node:test";

import { buildFakeReviewInput } from "../scripts/lib/review-gated-low-risk-fake-adapter.mjs";
import { evaluateGovernedReadOnlyReview } from "../scripts/lib/review-gated-low-risk-read-only-review.mjs";

const now = "2026-07-17T12:00:00.000Z";

test("default governed 5.6 Luna/high PASS route is read-only and eligible", () => {
  const packet = evaluateGovernedReadOnlyReview(validInput(), { now });

  assert.equal(packet.status, "eligible");
  assert.equal(packet.mode, "governed-read-only-review");
  assert.equal(packet.authorityDecision.allowed, false);
  assert.equal(packet.reviewIntegration.route.model, "5.6 Luna");
  assert.equal(packet.reviewIntegration.route.effort, "high");
  assert.equal(packet.reviewIntegration.providerCalls, false);
  assert.equal(packet.reviewIntegration.liveModelCalls, false);
  assert.equal(packet.rawPayloadRetained, false);
});

test("non-default governed route requires rationale", () => {
  const withoutRationale = validInput();
  withoutRationale.route.model = "gpt-5.3-codex-spark";
  const blocked = evaluateGovernedReadOnlyReview(withoutRationale, { now });
  assert.equal(blocked.status, "hold");
  assert.match(blocked.blockers.join("; "), /rationale/);

  const withRationale = validInput();
  withRationale.route.model = "gpt-5.3-codex-spark";
  withRationale.route.rationale = "Approved governed high-effort route for independent read-only critique.";
  withRationale.reviewRecord.model = "gpt-5.3-codex-spark";
  const eligible = evaluateGovernedReadOnlyReview(withRationale, { now });
  assert.equal(eligible.status, "eligible");
});

test("unavailable, timeout, ambiguous, contradictory, and non-PASS results hold", () => {
  for (const change of [
    { route: { available: false } },
    { result: { timeout: true } },
    { result: { ambiguous: true } },
    { result: { contradictory: true } },
    { result: { status: "CONCERNS" } },
    { result: { status: "BLOCKED" } },
  ]) {
    const input = validInput();
    input.route = { ...input.route, ...change.route };
    input.result = { ...input.result, ...change.result };
    const packet = evaluateGovernedReadOnlyReview(input, { now });
    assert.equal(packet.status, "hold");
    assert.equal(packet.authorityDecision.allowed, false);
  }
});

test("forbidden source/result metadata and execution flags are rejected without retention", () => {
  const redacted = validInput();
  redacted.sourcePacket.rawProviderPayload = "forbidden";
  const redactedPacket = evaluateGovernedReadOnlyReview(redacted, { now });
  assert.equal(redactedPacket.status, "hold");
  assert.match(redactedPacket.blockers.join("; "), /forbidden raw payload/);
  assert.equal(Object.hasOwn(redactedPacket, "sourcePacket"), false);

  const summaryRedacted = validInput();
  summaryRedacted.result.summary = "provider payload: secret token";
  const summaryPacket = evaluateGovernedReadOnlyReview(summaryRedacted, { now });
  assert.equal(summaryPacket.status, "hold");
  assert.match(summaryPacket.blockers.join("; "), /summary contains forbidden/);
  assert.doesNotMatch(JSON.stringify(summaryPacket), /provider payload|secret token/);

  const missingResultStatus = validInput();
  delete missingResultStatus.result.status;
  const missingStatusPacket = evaluateGovernedReadOnlyReview(missingResultStatus, { now });
  assert.equal(missingStatusPacket.status, "hold");
  assert.match(missingStatusPacket.blockers.join("; "), /result is unavailable or ambiguous/);

  const execution = validInput();
  execution.providerCall = true;
  const executionPacket = evaluateGovernedReadOnlyReview(execution, { now });
  assert.equal(executionPacket.status, "hold");
  assert.match(executionPacket.blockers.join("; "), /execution attempt/);

  const failure = validInput();
  failure.result.error = "reviewer timeout";
  const failurePacket = evaluateGovernedReadOnlyReview(failure, { now });
  assert.equal(failurePacket.status, "hold");
  assert.match(failurePacket.blockers.join("; "), /error or failure/);

  const oversized = validInput();
  oversized.result.resultId = "r".repeat(121);
  const oversizedPacket = evaluateGovernedReadOnlyReview(oversized, { now });
  assert.equal(oversizedPacket.status, "hold");
  assert.match(oversizedPacket.blockers.join("; "), /bounded length/);

  for (const field of ["shell", "network", "httpRequest", "writeFile", "deleteFiles", "workerProcessLaunch", "gitPush", "command"]) {
    const attempt = validInput();
    attempt[field] = field === "command" ? "git merge dev" : true;
    const attemptPacket = evaluateGovernedReadOnlyReview(attempt, { now });
    assert.equal(attemptPacket.status, "hold", field);
    assert.match(attemptPacket.blockers.join("; "), /execution attempt/, field);
  }
});

test("contradictory record, route, and result metadata holds", () => {
  const status = validInput();
  status.reviewRecord.status = "BLOCKED";
  const statusPacket = evaluateGovernedReadOnlyReview(status, { now });
  assert.equal(statusPacket.status, "hold");
  assert.match(statusPacket.blockers.join("; "), /statuses contradict/);

  const model = validInput();
  model.reviewRecord.model = "gpt-5.3-codex-spark";
  const modelPacket = evaluateGovernedReadOnlyReview(model, { now });
  assert.equal(modelPacket.status, "hold");
  assert.match(modelPacket.blockers.join("; "), /models contradict/);

  const effort = validInput();
  effort.reviewRecord.effort = "unsupported";
  const effortPacket = evaluateGovernedReadOnlyReview(effort, { now });
  assert.equal(effortPacket.status, "hold");
  assert.match(effortPacket.blockers.join("; "), /efforts contradict/);

  const rationale = validInput();
  rationale.route.rationale = "route rationale";
  rationale.reviewRecord.routeRationale = "record rationale";
  const rationalePacket = evaluateGovernedReadOnlyReview(rationale, { now });
  assert.equal(rationalePacket.status, "hold");
  assert.match(rationalePacket.blockers.join("; "), /rationales contradict/);

  const timestamp = validInput();
  timestamp.reviewRecord.reviewedAt = "2026-07-17T11:59:59.000Z";
  const timestampPacket = evaluateGovernedReadOnlyReview(timestamp, { now });
  assert.equal(timestampPacket.status, "hold");
  assert.match(timestampPacket.blockers.join("; "), /timestamps contradict/);

  const malformedFlag = validInput();
  malformedFlag.result.timeout = "true";
  const malformedPacket = evaluateGovernedReadOnlyReview(malformedFlag, { now });
  assert.equal(malformedPacket.status, "hold");
  assert.match(malformedPacket.blockers.join("; "), /timeout flag is malformed/);
});

test("accepts governed GPT-5.6 variants and supported effort levels", () => {
  for (const [model, effort] of [["GPT-5.6 Sol", "low"], ["gpt-5.6-codex", "medium"], ["gpt-5.3-codex-spark", "xhigh"]]) {
    const input = validInput();
    input.route.model = model;
    input.route.effort = effort;
    input.route.rationale = "Independent governed route.";
    input.reviewRecord.model = model;
    input.reviewRecord.effort = effort;
    const packet = evaluateGovernedReadOnlyReview(input, { now });
    assert.equal(packet.status, "eligible", `${model}/${effort}`);
  }
});

test("requires explicit rationale for non-default model or effort routes", () => {
  const input = validInput();
  input.route.effort = "low";
  input.reviewRecord.effort = "low";
  delete input.route.rationale;
  const packet = evaluateGovernedReadOnlyReview(input, { now });
  assert.equal(packet.status, "hold");
  assert.match(packet.blockers.join("; "), /rationale/);
});

test("exact binding and freshness mismatches hold", () => {
  for (const field of ["baseSha", "headSha", "diffHash", "owner", "worktree"]) {
    const input = validInput();
    input.reviewRecord[field] = `${input.reviewRecord[field]}-other`;
    const packet = evaluateGovernedReadOnlyReview(input, { now });
    assert.equal(packet.status, "hold");
    assert.match(packet.blockers.join("; "), new RegExp(field));
  }

  const stale = validInput();
  stale.result.reviewedAt = "2026-07-17T11:00:00.000Z";
  const stalePacket = evaluateGovernedReadOnlyReview(stale, { now });
  assert.equal(stalePacket.status, "hold");
  assert.match(stalePacket.blockers.join("; "), /stale/);
});

function validInput() {
  const fake = buildFakeReviewInput("PASS", now);
  return {
    operation: fake.operation,
    reviewRecord: fake.review,
    state: fake.state,
    authority: fake.authority,
    route: {
      available: true,
      mode: "metadata-only",
      model: "5.6 Luna",
      effort: "high",
    },
    result: {
      status: "PASS",
      resultId: "result-1",
      summary: "Bounded metadata-only review summary.",
      reviewedAt: now,
    },
    sourcePacket: {
      packetId: "packet-1",
      sourceRefs: ["source:metadata-only"],
    },
  };
}
