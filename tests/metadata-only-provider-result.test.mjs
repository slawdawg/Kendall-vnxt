import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PROVIDER_RESULT_BYTES, summarizeProviderResult } from "../scripts/parse-metadata-only-provider-result.mjs";

test("summarizes a structured provider result without retaining result text", () => {
  const summary = summarizeProviderResult(JSON.stringify({
    is_error: false,
    result: JSON.stringify({ status: "PASS", resultId: "result-1", reviewedAt: "2026-07-18T12:00:00.000Z", summary: "Bounded metadata-only review summary." }),
    session_id: "session-secret-like-id",
  }));
  const outer = JSON.stringify({
    is_error: false,
    result: JSON.stringify({ status: "PASS", resultId: "result-1", reviewedAt: "2026-07-18T12:00:00.000Z", summary: "Bounded metadata-only review summary." }),
    session_id: "session-secret-like-id",
  });
  assert.deepEqual(summary, {
    received: true,
    bytes: outer.length,
    isError: false,
    resultPresent: true,
    resultType: "string",
    sessionIdPresent: true,
    parse: "ok",
    usable: true,
    shape: "review-envelope",
    reviewStatus: "PASS",
    resultId: "result-1",
    reviewedAt: "2026-07-18T12:00:00.000Z",
    summary: "Bounded metadata-only review summary.",
  });
  assert.doesNotMatch(JSON.stringify(summary), /session-secret|provider completion/);
});

test("classifies empty and malformed provider output without throwing or retaining it", () => {
  assert.deepEqual(summarizeProviderResult(""), { received: false, bytes: 0, usable: false, shape: "empty" });
  const malformed = summarizeProviderResult("provider output that is not JSON");
  assert.equal(malformed.received, true);
  assert.equal(malformed.parse, "failed");
  assert.equal(malformed.errorType, "SyntaxError");
  assert.equal(malformed.usable, false);
  assert.equal(malformed.shape, "invalid-json");
  assert.doesNotMatch(JSON.stringify(malformed), /provider output that is not JSON/);
});

test("requires a valid bounded review envelope and rejects sensitive or ambiguous fields", () => {
  for (const review of [
    { status: "PASS", resultId: "id", reviewedAt: "bad", summary: "summary" },
    { status: "PASS", resultId: "id", reviewedAt: "July 18 2026", summary: "summary" },
    { status: "UNKNOWN", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "summary" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "   " },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "provider payload: secret" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "provider.payload leaked" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "provider/payload leaked" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "raw_prompt leaked" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "raw.prompt leaked" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "raw:prompt leaked" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "reasoning-trace leaked" },
    { status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "reasoning.trace leaked" },
  ]) {
    const summary = summarizeProviderResult(JSON.stringify({ is_error: false, result: JSON.stringify(review) }));
    assert.equal(summary.usable, false);
    assert.equal(summary.shape, "invalid-review-envelope");
  }
  for (const key of ["providerPayload", "rawPrompt", "reasoningTrace", "unexpected"]) {
    const summary = summarizeProviderResult(JSON.stringify({
      is_error: false,
      result: JSON.stringify({ status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "summary", [key]: "metadata" }),
    }));
    assert.equal(summary.usable, false, key);
    assert.equal(summary.shape, "invalid-review-envelope", key);
  }
  const duplicate = summarizeProviderResult(JSON.stringify({
    is_error: false,
    result: '{"status":"PASS","status":"BLOCKED","resultId":"id","reviewedAt":"2026-07-18T12:00:00Z","summary":"summary"}',
  }));
  assert.equal(duplicate.usable, false);
  assert.equal(duplicate.shape, "ambiguous-review-envelope");
  const escapedDuplicate = summarizeProviderResult(JSON.stringify({
    is_error: false,
    result: '{"status":"PASS","resultId":"id","res\\u0075ltId":"evil","reviewedAt":"2026-07-18T12:00:00Z","summary":"summary"}',
  }));
  assert.equal(escapedDuplicate.usable, false);
  assert.equal(escapedDuplicate.shape, "ambiguous-review-envelope");
  const outerDuplicate = '{"is_error":true,"is_error":false,"result":"{\\"status\\":\\"PASS\\",\\"resultId\\":\\"id\\",\\"reviewedAt\\":\\"2026-07-18T12:00:00Z\\",\\"summary\\":\\"summary\\"}"}';
  const outer = summarizeProviderResult(outerDuplicate);
  assert.equal(outer.usable, false);
  assert.equal(outer.shape, "ambiguous-provider-envelope");
  const invalidCalendar = summarizeProviderResult(JSON.stringify({ is_error: false, result: JSON.stringify({ status: "PASS", resultId: "id", reviewedAt: "2026-02-31T12:00:00Z", summary: "summary" }) }));
  assert.equal(invalidCalendar.usable, false);
  const invalidMonth = summarizeProviderResult(JSON.stringify({ is_error: false, result: JSON.stringify({ status: "PASS", resultId: "id", reviewedAt: "2026-13-01T12:00:00Z", summary: "summary" }) }));
  assert.equal(invalidMonth.usable, false);
  const repeatedNestedKey = summarizeProviderResult(JSON.stringify({
    is_error: false,
    metadata: { is_error: false },
    result: JSON.stringify({ status: "PASS", resultId: "id", reviewedAt: "2026-07-18T12:00:00Z", summary: "summary" }),
  }));
  assert.equal(repeatedNestedKey.usable, true);
});

test("rejects valid-but-wrong envelopes and oversized input fail-closed", () => {
  for (const value of [null, [], "text", 42, {}, { result: null }, { result: "" }]) {
    const summary = summarizeProviderResult(JSON.stringify(value));
    assert.equal(summary.parse, "ok");
    assert.equal(summary.usable, false);
    assert.equal(summary.shape, "invalid-envelope");
  }
  const oversized = summarizeProviderResult(Buffer.alloc(MAX_PROVIDER_RESULT_BYTES + 1, "x"));
  assert.deepEqual(oversized, {
    received: true,
    bytes: MAX_PROVIDER_RESULT_BYTES + 1,
    usable: false,
    shape: "oversized",
    parse: "failed",
    errorType: "InputTooLarge",
  });
});

test("rejects explicit provider errors, malformed error flags, and whitespace results", () => {
  const providerError = summarizeProviderResult(JSON.stringify({ is_error: true, result: "error body" }));
  assert.equal(providerError.usable, false);
  assert.equal(providerError.shape, "provider-error");
  const malformedFlag = summarizeProviderResult(JSON.stringify({ is_error: "true", result: "result" }));
  assert.equal(malformedFlag.usable, false);
  assert.equal(malformedFlag.shape, "invalid-error-flag");
  const whitespace = summarizeProviderResult(JSON.stringify({ is_error: false, result: "   " }));
  assert.equal(whitespace.usable, false);
  assert.equal(whitespace.shape, "invalid-envelope");
});
