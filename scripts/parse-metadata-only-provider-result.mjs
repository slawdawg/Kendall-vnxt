import fs from "node:fs";

export const MAX_PROVIDER_RESULT_BYTES = 1024 * 1024;
const VALID_REVIEW_STATUSES = new Set(["PASS", "CONCERNS", "BLOCKED"]);
const SENSITIVE_METADATA = /raw[^\p{L}\p{N}]*(?:prompt|completion)|reasoning[^\p{L}\p{N}]*trace|provider[^\p{L}\p{N}]*payload|(?:api|access|refresh)?[^\p{L}\p{N}]*token|password|secret|credential/iu;
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Convert a provider JSON response into bounded metadata without retaining or
 * emitting the response body, result text, prompt, or provider payload.
 */
export function summarizeProviderResult(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(String(raw ?? ""));
  const source = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw ?? "");
  const summary = { received: bytes > 0, bytes, usable: false, shape: "empty" };
  if (!source) return summary;
  if (bytes > MAX_PROVIDER_RESULT_BYTES) return { ...summary, parse: "failed", errorType: "InputTooLarge", shape: "oversized" };
  try {
    if (hasDuplicateJsonKeys(source)) return { ...summary, parse: "ok", shape: "ambiguous-provider-envelope" };
    const data = JSON.parse(source);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ...summary, parse: "ok", shape: "invalid-envelope" };
    }
    if (Object.hasOwn(data, "is_error") && typeof data.is_error !== "boolean") {
      return { ...summary, parse: "ok", shape: "invalid-error-flag" };
    }
    const isError = data.is_error === true;
    const usableResult = !isError && typeof data.result === "string" && data.result.trim().length > 0;
    const review = usableResult ? parseReviewEnvelope(data.result) : { usable: false, shape: isError ? "provider-error" : "invalid-envelope" };
    return {
      ...summary,
      isError,
      resultPresent: usableResult,
      resultType: data?.result === undefined || data?.result === null ? null : typeof data.result,
      sessionIdPresent: typeof data?.session_id === "string" && data.session_id.length > 0,
      parse: "ok",
      usable: review.usable === true,
      shape: isError ? "provider-error" : review.shape,
      ...(review.usable ? { reviewStatus: review.status, resultId: review.resultId, reviewedAt: review.reviewedAt, summary: review.summary } : {}),
    };
  } catch (error) {
    return { ...summary, parse: "failed", errorType: error?.name || "ParseError", shape: "invalid-json" };
  }
}

function parseReviewEnvelope(resultText) {
  let review;
  try {
    if (hasDuplicateJsonKeys(resultText)) return { usable: false, shape: "ambiguous-review-envelope" };
    review = JSON.parse(resultText);
  } catch {
    return { usable: false, shape: "invalid-review-envelope" };
  }
  if (!review || typeof review !== "object" || Array.isArray(review)) return { usable: false, shape: "invalid-review-envelope" };
  const allowedKeys = new Set(["status", "resultId", "reviewedAt", "summary"]);
  if (Object.keys(review).some((key) => !allowedKeys.has(key))) return { usable: false, shape: "invalid-review-envelope" };
  const status = typeof review.status === "string" ? review.status.trim().toUpperCase() : "";
  const resultId = typeof review.resultId === "string" ? review.resultId.trim() : "";
  const reviewedAt = typeof review.reviewedAt === "string" ? review.reviewedAt.trim() : "";
  const summary = typeof review.summary === "string" ? review.summary.trim() : "";
  const parsedTime = reviewedAt ? new Date(reviewedAt) : null;
  const timestampMatch = reviewedAt.match(ISO_TIMESTAMP);
  const calendarValid = timestampMatch
    && Number(timestampMatch[2]) >= 1
    && Number(timestampMatch[2]) <= 12
    && Number(timestampMatch[3]) <= new Date(Date.UTC(Number(timestampMatch[1]), Number(timestampMatch[2]), 0)).getUTCDate();
  if (!VALID_REVIEW_STATUSES.has(status) || !resultId || resultId.length > 120 || SENSITIVE_METADATA.test(resultId) || !calendarValid
    || !parsedTime || Number.isNaN(parsedTime.getTime()) || !summary || summary.length > 500 || SENSITIVE_METADATA.test(summary)) {
    return { usable: false, shape: "invalid-review-envelope" };
  }
  return { usable: true, shape: "review-envelope", status, resultId, reviewedAt: parsedTime.toISOString(), summary };
}

function hasDuplicateJsonKeys(source) {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(source[index] || "")) index += 1;
  };
  const parseStringToken = () => {
    if (source[index] !== '"') return null;
    const start = index++;
    let escaped = false;
    for (; index < source.length; index += 1) {
      if (escaped) escaped = false;
      else if (source[index] === "\\") escaped = true;
      else if (source[index] === '"') {
        index += 1;
        return source.slice(start, index);
      }
    }
    return null;
  };
  const parseValue = () => {
    skipWhitespace();
    if (source[index] === "{") return parseObject();
    if (source[index] === "[") return parseArray();
    if (source[index] === '"') {
      parseStringToken();
      return false;
    }
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
    return false;
  };
  const parseObject = () => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (source[index] === "}") {
      index += 1;
      return false;
    }
    while (index < source.length) {
      const token = parseStringToken();
      if (token === null) return false;
      let key;
      try {
        key = JSON.parse(token);
      } catch {
        return false;
      }
      if (keys.has(key)) return true;
      keys.add(key);
      skipWhitespace();
      if (source[index] !== ":") return false;
      index += 1;
      if (parseValue()) return true;
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return false;
      }
      if (source[index] !== ",") return false;
      index += 1;
      skipWhitespace();
    }
    return false;
  };
  const parseArray = () => {
    index += 1;
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return false;
    }
    while (index < source.length) {
      if (parseValue()) return true;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return false;
      }
      if (source[index] !== ",") return false;
      index += 1;
      skipWhitespace();
    }
    return false;
  };
  const duplicate = parseValue();
  return duplicate === true;
}

export function readBoundedStdin() {
  const chunks = [];
  let total = 0;
  while (total <= MAX_PROVIDER_RESULT_BYTES) {
    const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_PROVIDER_RESULT_BYTES + 1 - total));
    const count = fs.readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) break;
    chunks.push(buffer.subarray(0, count));
    total += count;
  }
  return { raw: Buffer.concat(chunks), bytes: total, oversized: total > MAX_PROVIDER_RESULT_BYTES };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = readBoundedStdin();
  const summary = input.oversized
    ? { received: true, bytes: input.bytes, usable: false, shape: "oversized", parse: "failed", errorType: "InputTooLarge" }
    : summarizeProviderResult(input.raw);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
