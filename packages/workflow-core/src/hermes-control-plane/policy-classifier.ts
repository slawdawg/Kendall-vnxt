import { HermesControlPlane } from "@kendall/contracts";

const DEFAULT_TIME = "1970-01-01T00:00:00Z";
const POLICY_CLASSIFIER_VERSION = "hermes-policy-classifier.v1";
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FALLBACK_OUTCOME = "outcome:invalid-input";
const FALLBACK_LANE = "lane-run:invalid-input";
const FALLBACK_IDEMPOTENCY = "idempotency:invalid-input";
const FALLBACK_EVIDENCE = "evidence:invalid-input";
const ORDINARY_ACTIONS = new Set([
  "source", "sourceChange", "verification", "sourceVerification", "review", "codeReview", "boundedGithubDelivery", "githubDelivery", "boundedDelivery", "ordinary",
]);
const SPEND_ACTIONS = new Set(["spend", "paid", "paidPlan", "paidResource", "paidPlanAccountResourceAddOn", "incrementalBillableUsage", "billing"]);
const DEPLOYMENT_ACTIONS = new Set(["realUserDeployment", "deployment", "publish", "release", "production", "customerRelease", "publicRelease"]);
const ZERO_COST = new Set(["zero", "zeroCost", "included", "includedAllowance", "prepaid", "noCost"]);
const OPERATOR_ONLY_AUDIENCE = new Set(["namedOperatorOnly", "operatorOnly", "namedOperator"]);
const OPERATOR_ONLY_TARGET = new Set(["namedOperatorOnly", "operatorOnly", "operatorWorktree", "localOnly"]);
const METADATA_ONLY_EFFECT = new Set(["metadataOnly", "sourceOnly", "verificationOnly", "reviewOnly", "boundedDelivery"]);
const EXTERNAL_TARGET = new Set(["customer", "public", "production", "realUser", "nonOperator"]);
const EXTERNAL_EFFECT = new Set(["publish", "release", "deploy", "productionChange", "realUserDeployment"]);
const KNOWN_CERTAINTY = new Set(["known", "certain"]);
const ACTION_CLASSIFICATIONS = new Set([...ORDINARY_ACTIONS, ...SPEND_ACTIONS, ...DEPLOYMENT_ACTIONS, "unknown"]);
const COST_CLASSIFICATIONS = new Set([...ZERO_COST, ...SPEND_ACTIONS, "incremental", "unknown"]);
const CERTAINTY_VALUES = new Set(["known", "certain", "uncertain", "unknown"]);
const AUDIENCE_CLASSIFICATIONS = new Set([...OPERATOR_ONLY_AUDIENCE, ...EXTERNAL_TARGET, "unknown"]);
const TARGET_CLASSIFICATIONS = new Set([...OPERATOR_ONLY_TARGET, ...EXTERNAL_TARGET, "unknown"]);
const EFFECT_CLASSIFICATIONS = new Set([...METADATA_ONLY_EFFECT, ...EXTERNAL_EFFECT, "unknown"]);
const ALLOWED_REQUESTED_DECISIONS = new Set(HermesControlPlane.HERMES_RESULT_VALUES);
const INPUT_KEYS = new Set([
  "outcomeId", "laneRunId", "idempotencyKey", "evidenceRefs", "target", "effect", "requestedEffect", "scope",
  "targetClassification", "effectClassification", "alternativesConsidered", "actionClassification", "costClassification", "costCertainty", "audienceClassification",
  "audienceCertainty", "requestedDecision", "observedAt", "evaluationAt", "createdAt", "expiresAt", "policyDecisionId",
  "externalImpactRequestId", "digestInput",
]);

export type HermesPolicyReplayStatus = "active" | "expired" | "revoked" | "consumed";
export type HermesPolicyReplayState = "new" | "replayed" | "conflict" | "denied";

/** Metadata-only input for the pure pre-action Hermes policy classifier. */
export interface HermesPolicyClassifierInput {
  readonly outcomeId: unknown;
  readonly laneRunId: unknown;
  readonly idempotencyKey: unknown;
  readonly evidenceRefs: unknown;
  readonly target: unknown;
  readonly effect?: unknown;
  readonly requestedEffect?: unknown;
  readonly scope: unknown;
  readonly targetClassification: unknown;
  readonly effectClassification: unknown;
  readonly alternativesConsidered: unknown;
  readonly actionClassification: unknown;
  readonly costClassification: unknown;
  readonly costCertainty: unknown;
  readonly audienceClassification: unknown;
  readonly audienceCertainty: unknown;
  readonly requestedDecision?: unknown;
  readonly observedAt: unknown;
  readonly evaluationAt: unknown;
  readonly createdAt?: unknown;
  readonly expiresAt?: unknown;
  readonly policyDecisionId?: unknown;
  readonly externalImpactRequestId?: unknown;
  readonly digestInput?: unknown;
}

export interface HermesPolicyReplayRecord {
  readonly policyDecision?: unknown;
  readonly externalImpactRequest?: unknown;
  readonly requestDigest: unknown;
  readonly status: HermesPolicyReplayStatus;
}

export interface HermesPolicyClassificationResult {
  readonly policyDecision: HermesControlPlane.PolicyDecisionV1;
  readonly externalImpactRequest: HermesControlPlane.ExternalImpactRequestV1 | null;
  readonly requestDigest: string;
  readonly replayState: HermesPolicyReplayState;
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function freezeArray<T>(value: readonly T[]): readonly T[] {
  return Object.freeze([...value]);
}

function text(value: unknown, maxLength = 500): value is string {
  return HermesControlPlane.isSafeText(value, maxLength);
}

function validInputKeys(value: Record<string, unknown>): boolean {
  try {
    return Reflect.ownKeys(value).every((key) => typeof key === "string" && INPUT_KEYS.has(key));
  } catch {
    return false;
  }
}

function isPlainDataRecord(value: unknown, allowedKeys?: ReadonlySet<string>): value is Record<string, unknown> {
  try {
    if (!HermesControlPlane.isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || (allowedKeys && !allowedKeys.has(key))) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.get || descriptor.set) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (key === "length") return true;
      if (typeof key !== "string" || !isCanonicalArrayIndexKey(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") && !descriptor.get && !descriptor.set);
    });
  } catch {
    return false;
  }
}

function isCanonicalArrayIndexKey(key: string): boolean {
  if (!/^(?:0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}

function snapshotArray(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") || typeof lengthDescriptor.value !== "number" || lengthDescriptor.value > 2048) return null;
    const keys = Reflect.ownKeys(value);
    if (!keys.every((key) => key === "length" || (typeof key === "string" && isCanonicalArrayIndexKey(key)))) return null;
    const snapshot: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.get || descriptor.set) return null;
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotRecord(value: unknown, allowedKeys?: ReadonlySet<string>): Record<string, unknown> | null {
  try {
    if (!HermesControlPlane.isRecord(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || (allowedKeys && !allowedKeys.has(key))) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.get || descriptor.set) return null;
      let item = (key === "evidenceRefs" || key === "alternativesConsidered") ? snapshotArray(descriptor.value) : descriptor.value;
      if ((key === "evidenceRefs" || key === "alternativesConsidered") && item === null) return null;
      if ((key === "evidenceRefs" || key === "alternativesConsidered") && Array.isArray(item) && item.every((entry) => typeof entry === "string")) item = Object.freeze([...item].sort());
      snapshot[key] = item;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotInput(value: unknown): HermesPolicyClassifierInput | null {
  return snapshotRecord(value, INPUT_KEYS) as HermesPolicyClassifierInput | null;
}

function safeId(value: unknown, fallback: string): string {
  return HermesControlPlane.isOpaqueId(value) ? value : fallback;
}

function safeEvidence(value: unknown): readonly HermesControlPlane.HermesEvidenceRefId[] {
  return HermesControlPlane.isEvidenceRefs(value) ? freezeArray([...value].sort()) : [FALLBACK_EVIDENCE as HermesControlPlane.HermesEvidenceRefId];
}

function safeTime(value: unknown, fallback = DEFAULT_TIME): string {
  return HermesControlPlane.isUtcIsoTimestamp(value) ? normalizeTime(value) : fallback;
}

function normalizeTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  return new Date(parsed).toISOString().replace(".000Z", "Z");
}

function addHour(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isSafeInteger(parsed) || parsed > Number.MAX_SAFE_INTEGER - HOUR_MS) return "";
  try {
    return new Date(parsed + HOUR_MS).toISOString().replace(".000Z", "Z");
  } catch {
    return "";
  }
}

function sha256(value: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const initial = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length + 8) % 64 !== 0) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(bitLength / 2 ** shift) & 0xff);
  const state = [...initial];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] = (bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3];
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15];
      const y = words[index - 2];
      const smallX = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const smallY = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      words[index] = (words[index - 16] + smallX + words[index - 7] + smallY) | 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const bigE = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + bigE + choose + constants[index] + words[index]) | 0;
      const bigA = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigA + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0; state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
    state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0; state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0;
  }
  return state.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

function canonical(value: HermesPolicyClassifierInput, impactType: HermesControlPlane.HermesImpactType | "ordinary"): string {
  const effect = (value.effect ?? value.requestedEffect) as string;
  const evidence = Array.isArray(value.evidenceRefs) ? value.evidenceRefs.map(String).sort() : [];
  const alternatives = Array.isArray(value.alternativesConsidered) ? value.alternativesConsidered.map(String).sort() : [];
  const createdAt = normalizeTime((value.createdAt ?? value.observedAt) as string);
  const observedAt = normalizeTime(value.observedAt as string);
  const expiresAt = normalizeTime((value.expiresAt ?? addHour(createdAt)) as string);
  const fields = [
    POLICY_CLASSIFIER_VERSION, HermesControlPlane.HERMES_POLICY_DECISION_SCHEMA_VERSION, HermesControlPlane.HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION,
    value.outcomeId, value.laneRunId, value.idempotencyKey, value.target, value.targetClassification, effect, value.effectClassification, value.scope,
    impactType, value.actionClassification, value.costClassification, value.costCertainty,
    value.audienceClassification, value.audienceCertainty, evidence, alternatives, createdAt, observedAt, expiresAt, value.digestInput ?? "",
  ];
  return JSON.stringify(fields);
}

function policyDecision(input: {
  policyDecisionId: string;
  outcomeId: string;
  laneRunId: string;
  decision: HermesControlPlane.HermesResult;
  reasonCode: string;
  evidenceRefs: readonly HermesControlPlane.HermesEvidenceRefId[];
  nextAction: string;
  observedAt: string;
  createdAt: string;
  idempotencyKey: string;
}): HermesControlPlane.PolicyDecisionV1 {
  const result = freeze({
    policyDecisionId: input.policyDecisionId,
    outcomeId: input.outcomeId,
    laneRunId: input.laneRunId,
    schemaVersion: HermesControlPlane.HERMES_POLICY_DECISION_SCHEMA_VERSION,
    decision: input.decision,
    reasonCode: input.reasonCode,
    evidenceRefs: freezeArray(input.evidenceRefs),
    nextAction: input.nextAction,
    observedAt: input.observedAt,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
    metadataOnly: true as const,
    rawPayloadRetained: false as const,
  });
  return HermesControlPlane.isPolicyDecisionV1(result) ? result : invalidDecision();
}

function invalidDecision(): HermesControlPlane.PolicyDecisionV1 {
  return freeze({
    policyDecisionId: "policy-decision:invalid-input",
    outcomeId: FALLBACK_OUTCOME,
    laneRunId: FALLBACK_LANE,
    schemaVersion: HermesControlPlane.HERMES_POLICY_DECISION_SCHEMA_VERSION,
    decision: "deniedPolicy",
    reasonCode: "invalid_input",
    evidenceRefs: freezeArray([FALLBACK_EVIDENCE as HermesControlPlane.HermesEvidenceRefId]),
    nextAction: "inspect_metadata",
    observedAt: DEFAULT_TIME,
    idempotencyKey: FALLBACK_IDEMPOTENCY,
    createdAt: DEFAULT_TIME,
    metadataOnly: true as const,
    rawPayloadRetained: false as const,
  }) as unknown as HermesControlPlane.PolicyDecisionV1;
}

function makeResult(
  decision: HermesControlPlane.PolicyDecisionV1,
  request: HermesControlPlane.ExternalImpactRequestV1 | null,
  requestDigest: string,
  replayState: HermesPolicyReplayState,
): HermesPolicyClassificationResult {
  const frozenDecision = freeze({ ...decision, evidenceRefs: freezeArray(decision.evidenceRefs) }) as unknown as HermesControlPlane.PolicyDecisionV1;
  const frozenRequest = request === null ? null : freeze({
    ...request,
    alternativesConsidered: freezeArray(request.alternativesConsidered),
    evidenceRefs: freezeArray(request.evidenceRefs),
  }) as unknown as HermesControlPlane.ExternalImpactRequestV1;
  return freeze({ policyDecision: frozenDecision, externalImpactRequest: frozenRequest, requestDigest, replayState });
}

function malformedResult(): HermesPolicyClassificationResult {
  return makeResult(invalidDecision(), null, "digest:invalid-input", "denied");
}

// Narrow deterministic guard for untrusted labels. This is intentionally lexical rather than NLP:
// Bounded external terms in target/effect/scope override an operator-safe label. This is
// intentionally safety-first: definite terms remain external even inside negated or prohibited
// prose. No caller text is interpreted beyond these fixed words and bounded phrases.
const SEMANTIC_AUDIENCE_WORDS = new Set([
  "customer", "customers", "public", "production", "prod", "non-operator", "non-operators", "real-user", "real-users", "user", "users", "user-facing", "live", "external",
]);
const SEMANTIC_PUNCTUATION = new Set([".", "!", "?", ",", ";", ":"]);
const SEMANTIC_EXTERNAL_PAIRS = new Set(["non operator", "non operators", "real user", "real users", "user facing", "external audience", "external user", "external users", "roll out", "rolling out"]);
const SPEND_AUDIENCE_WORDS = new Set(["resource", "resources", "account", "accounts", "plan", "plans", "add-on", "add-ons", "addon", "addons", "api", "apis"]);
const SPEND_DIRECT_WORDS = /^(?:buy|bought|purchase|purchases|purchased|purchasing|billable|bill|bills|billed|invoiced|charge|charges|charged|charging|pay|pays|payment|payments|spend|spends|spent|spending|subscribe|subscribes|subscribed|subscribing|subscription|subscriptions)$/;
const SPEND_ACTION_CONTEXT_WORDS = new Set(["add", "activate", "buy", "bought", "bill", "bills", "billed", "invoiced", "charge", "charged", "charging", "enable", "incur", "incurs", "incurred", "incurring", "pay", "paid", "payment", "purchase", "purchased", "purchasing", "renew", "renewal", "renewing", "spend", "spent", "subscribe", "subscribed", "subscribing", "subscription", "upgrade", "upgraded", "upgrading"]);

function isInflectedExternalVerb(word: string): boolean {
  return /^(?:publish|release|deploy|rollout)(?:s|ed|ing)?$/.test(word);
}

function hasSemanticAudience(word: string): boolean {
  return SEMANTIC_AUDIENCE_WORDS.has(word) || word.split("-").some((part) => SEMANTIC_AUDIENCE_WORDS.has(part));
}

function hasRouteOrEnable(word: string): boolean {
  return /^(?:route|enable)(?:s|d|ing)?$/.test(word) || word === "routing" || word === "enabling" ||
    word.split("-").some((part) => /^(?:route|enable)(?:s|d|ing)?$/.test(part) || part === "routing" || part === "enabling");
}

function semanticTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z]+|[.!?,;:]/g) ?? [];
}

function hasSpendActionContext(tokens: readonly string[], index: number, includeAudienceNouns: boolean): boolean {
  for (const direction of [-1, 1]) {
    for (let distance = 1; distance <= 3; distance += 1) {
      const neighbor = tokens[index + direction * distance];
      if (neighbor === undefined || SEMANTIC_PUNCTUATION.has(neighbor) || ["and", "or", "but", "then"].includes(neighbor)) break;
      if (SPEND_ACTION_CONTEXT_WORDS.has(neighbor) || (includeAudienceNouns && SPEND_AUDIENCE_WORDS.has(neighbor))) return true;
    }
  }
  return false;
}

function hasOrdinaryMetadataReviewContext(tokens: readonly string[], index: number): boolean {
  for (const direction of [-1, 1]) {
    for (let distance = 1; distance <= 3; distance += 1) {
      const neighbor = tokens[index + direction * distance];
      if (neighbor === undefined || SEMANTIC_PUNCTUATION.has(neighbor) || ["and", "or", "but", "then"].includes(neighbor)) break;
      if (["check", "inspect", "metadata", "report", "review", "summary", "verification", "verify"].includes(neighbor)) return true;
    }
  }
  return false;
}

function hasSpendSemanticSignal(value: HermesPolicyClassifierInput): boolean {
  const textValues = [value.target, value.effect ?? value.requestedEffect, value.scope];
  for (const textValue of textValues) {
    const tokens = semanticTokens(textValue as string);
    for (const [index, token] of tokens.entries()) {
      if (token === "bill" && hasOrdinaryMetadataReviewContext(tokens, index)) continue;
      if (SPEND_DIRECT_WORDS.test(token)) return true;
      const following: string[] = [];
      for (let nextIndex = index + 1; nextIndex < tokens.length && following.length < 4; nextIndex += 1) {
        if (SEMANTIC_PUNCTUATION.has(tokens[nextIndex]) || tokens[nextIndex] === "and" || tokens[nextIndex] === "or" || tokens[nextIndex] === "but" || tokens[nextIndex] === "then") break;
        following.push(tokens[nextIndex]);
      }
      if (token === "incremental" && following.some((next) => next === "usage" || next === "billable")) return true;
      if (token === "paid" && following.some((next, followingIndex) => SPEND_AUDIENCE_WORDS.has(next) || (next === "add" && following[followingIndex + 1] === "on"))) return true;
      if ((token === "cost" || token === "costs") && (following.includes("money") || hasSpendActionContext(tokens, index, false))) return true;
      if (token === "billing" && hasSpendActionContext(tokens, index, true)) return true;
    }
  }
  return false;
}

function hasExternalSemanticSignal(value: HermesPolicyClassifierInput): boolean {
  const textValues = [value.target, value.effect ?? value.requestedEffect, value.scope];
  let routeOrEnableSignal = false;
  let affirmativeAudienceSignal = false;
  for (const textValue of textValues) {
    const tokens = semanticTokens(textValue as string);
    for (const [index, token] of tokens.entries()) {
      if (hasSemanticAudience(token) || (index + 1 < tokens.length && SEMANTIC_EXTERNAL_PAIRS.has(`${token} ${tokens[index + 1]}`))) {
        affirmativeAudienceSignal = true;
        return true;
      }
      if (isInflectedExternalVerb(token)) return true;
      if (hasRouteOrEnable(token)) routeOrEnableSignal = true;
    }
  }
  return routeOrEnableSignal && affirmativeAudienceSignal;
}

function classifyImpact(value: HermesPolicyClassifierInput): HermesControlPlane.HermesImpactType | "ordinary" | null {
  if (!SPEND_ACTIONS.has(value.actionClassification as string) && !DEPLOYMENT_ACTIONS.has(value.actionClassification as string) && !ORDINARY_ACTIONS.has(value.actionClassification as string)) return null;
  if (!KNOWN_CERTAINTY.has(value.costCertainty as string) || !ZERO_COST.has(value.costClassification as string) || SPEND_ACTIONS.has(value.actionClassification as string)) return "spend";
  if (hasSpendSemanticSignal(value)) return "spend";
  if (!KNOWN_CERTAINTY.has(value.audienceCertainty as string) || !OPERATOR_ONLY_AUDIENCE.has(value.audienceClassification as string) || DEPLOYMENT_ACTIONS.has(value.actionClassification as string)) return "realUserDeployment";
  if (EXTERNAL_TARGET.has(value.targetClassification as string) || EXTERNAL_EFFECT.has(value.effectClassification as string) || hasExternalSemanticSignal(value)) return "realUserDeployment";
  if (!OPERATOR_ONLY_TARGET.has(value.targetClassification as string) || !METADATA_ONLY_EFFECT.has(value.effectClassification as string)) return null;
  return "ordinary";
}

function validBaseInput(value: unknown): value is HermesPolicyClassifierInput {
  try {
    if (!isPlainDataRecord(value, INPUT_KEYS) || !validInputKeys(value)) return false;
    const requiredKeys = [
      "outcomeId", "laneRunId", "idempotencyKey", "evidenceRefs", "target", "scope", "targetClassification", "effectClassification", "alternativesConsidered",
      "actionClassification", "costClassification", "costCertainty", "audienceClassification", "audienceCertainty", "observedAt", "evaluationAt",
    ];
    if (requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    if (!Object.prototype.hasOwnProperty.call(value, "effect") && !Object.prototype.hasOwnProperty.call(value, "requestedEffect")) return false;
    if (!isPlainDataArray(value.evidenceRefs) || !isPlainDataArray(value.alternativesConsidered)) return false;
    const hasEffect = Object.prototype.hasOwnProperty.call(value, "effect");
    const hasRequestedEffect = Object.prototype.hasOwnProperty.call(value, "requestedEffect");
    if (hasEffect && !text(value.effect, 500)) return false;
    if (hasRequestedEffect && !text(value.requestedEffect, 500)) return false;
    if (hasEffect && hasRequestedEffect && value.effect !== value.requestedEffect) return false;
    const effect = value.effect ?? value.requestedEffect;
    const createdAtInput = value.createdAt ?? value.observedAt;
    if (typeof createdAtInput !== "string" || typeof value.observedAt !== "string" || typeof value.evaluationAt !== "string" ||
      (value.expiresAt !== undefined && typeof value.expiresAt !== "string") ||
      !HermesControlPlane.isUtcIsoTimestamp(createdAtInput) || !HermesControlPlane.isUtcIsoTimestamp(value.observedAt) ||
      !HermesControlPlane.isUtcIsoTimestamp(value.evaluationAt) || (value.expiresAt !== undefined && !HermesControlPlane.isUtcIsoTimestamp(value.expiresAt))) return false;
    const expiresAtInput = value.expiresAt ?? addHour(normalizeTime(createdAtInput));
    if (!expiresAtInput || !HermesControlPlane.isUtcIsoTimestamp(expiresAtInput)) return false;
    const createdAt = Date.parse(createdAtInput);
    const observedAt = Date.parse(value.observedAt);
    const expiresAt = Date.parse(expiresAtInput);
    const evaluationAt = Date.parse(value.evaluationAt);
    if (![createdAt, observedAt, expiresAt, evaluationAt].every(Number.isSafeInteger) || createdAt > observedAt || observedAt > evaluationAt || evaluationAt >= expiresAt || expiresAt - createdAt > MAX_TTL_MS) return false;
    return HermesControlPlane.isOpaqueId(value.outcomeId) && HermesControlPlane.isOpaqueId(value.laneRunId) &&
      HermesControlPlane.isOpaqueId(value.idempotencyKey) && HermesControlPlane.isEvidenceRefs(value.evidenceRefs) &&
      text(value.target, 240) && text(effect, 500) && text(value.scope, 500) &&
      typeof value.targetClassification === "string" && TARGET_CLASSIFICATIONS.has(value.targetClassification) &&
      typeof value.effectClassification === "string" && EFFECT_CLASSIFICATIONS.has(value.effectClassification) &&
      typeof value.actionClassification === "string" && ACTION_CLASSIFICATIONS.has(value.actionClassification) &&
      typeof value.costClassification === "string" && COST_CLASSIFICATIONS.has(value.costClassification) &&
      typeof value.costCertainty === "string" && CERTAINTY_VALUES.has(value.costCertainty) &&
      typeof value.audienceClassification === "string" && AUDIENCE_CLASSIFICATIONS.has(value.audienceClassification) &&
      typeof value.audienceCertainty === "string" && CERTAINTY_VALUES.has(value.audienceCertainty) &&
      HermesControlPlane.isSafeStringCollection(value.alternativesConsidered, 8, 2048) &&
      HermesControlPlane.isUtcIsoTimestamp(value.observedAt) &&
      HermesControlPlane.isUtcIsoTimestamp(value.evaluationAt) &&
      (value.createdAt === undefined || HermesControlPlane.isUtcIsoTimestamp(value.createdAt)) &&
      (value.expiresAt === undefined || HermesControlPlane.isUtcIsoTimestamp(value.expiresAt)) &&
      (value.policyDecisionId === undefined || HermesControlPlane.isOpaqueId(value.policyDecisionId)) &&
      (value.externalImpactRequestId === undefined || HermesControlPlane.isOpaqueId(value.externalImpactRequestId)) &&
      (value.digestInput === undefined || text(value.digestInput, 1024)) &&
      (value.requestedDecision === undefined || (typeof value.requestedDecision === "string" && ALLOWED_REQUESTED_DECISIONS.has(value.requestedDecision as HermesControlPlane.HermesResult)));
  } catch {
    return false;
  }
}

function buildExternalRequest(input: HermesPolicyClassifierInput, impactType: HermesControlPlane.HermesImpactType, digest: string): HermesControlPlane.ExternalImpactRequestV1 {
  const createdAt = safeTime(input.createdAt, input.observedAt as string);
  const expiresAt = safeTime(input.expiresAt, addHour(createdAt));
  const effect = (input.effect ?? input.requestedEffect) as string;
  const record = freeze({
    externalImpactRequestId: safeId(input.externalImpactRequestId, `external-impact-request:${digest.slice(-8)}`),
    outcomeId: input.outcomeId as string,
    laneRunId: input.laneRunId as string,
    schemaVersion: HermesControlPlane.HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION,
    impactType,
    target: input.target as string,
    effect,
    scope: input.scope as string,
    expiresAt,
    alternativesConsidered: freezeArray([...(input.alternativesConsidered as readonly string[])].sort()),
    classificationRationale: impactType === "spend" ? "cost is paid, incremental, or uncertain" : "audience is non-operator or uncertain",
    evidenceRefs: freezeArray([...(input.evidenceRefs as readonly HermesControlPlane.HermesEvidenceRefId[])].sort()),
    idempotencyKey: input.idempotencyKey as string,
    createdAt,
    metadataOnly: true as const,
    rawPayloadRetained: false as const,
  });
  return HermesControlPlane.isExternalImpactRequestV1(record) ? record : malformedExternalRequest();
}

function malformedExternalRequest(): HermesControlPlane.ExternalImpactRequestV1 {
  return freeze({
    externalImpactRequestId: "external-impact-request:invalid-input",
    outcomeId: FALLBACK_OUTCOME,
    laneRunId: FALLBACK_LANE,
    schemaVersion: HermesControlPlane.HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION,
    impactType: "spend",
    target: "invalid-input",
    effect: "inspect metadata",
    scope: "invalid-input",
    expiresAt: "1970-01-01T01:00:00Z",
    alternativesConsidered: freezeArray(["stop"]),
    classificationRationale: "invalid input",
    evidenceRefs: freezeArray([FALLBACK_EVIDENCE as HermesControlPlane.HermesEvidenceRefId]),
    idempotencyKey: FALLBACK_IDEMPOTENCY,
    createdAt: DEFAULT_TIME,
    metadataOnly: true as const,
    rawPayloadRetained: false as const,
  }) as unknown as HermesControlPlane.ExternalImpactRequestV1;
}

const PRIOR_KEYS = new Set(["policyDecision", "externalImpactRequest", "requestDigest", "status", "replayState"]);

interface PriorCheck {
  readonly record: HermesPolicyReplayRecord | null;
  readonly malformed: boolean;
}

function normalizePrior(prior: HermesPolicyReplayRecord | null | undefined): PriorCheck {
  if (prior === null || prior === undefined) return { record: null, malformed: false };
  const snapshot = snapshotRecord(prior, PRIOR_KEYS);
  if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, "status") || !Object.prototype.hasOwnProperty.call(snapshot, "requestDigest")) {
    return { record: null, malformed: true };
  }
  const nested: Record<string, unknown> = Object.assign(Object.create(null) as Record<string, unknown>, snapshot);
  for (const key of ["policyDecision", "externalImpactRequest"]) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key) && snapshot[key] !== null && snapshot[key] !== undefined) {
      const nestedSnapshot = snapshotRecord(snapshot[key]);
      if (nestedSnapshot === null) return { record: null, malformed: true };
      nested[key] = nestedSnapshot;
    }
  }
  if (!["active", "expired", "revoked", "consumed"].includes(nested.status as string)) return { record: null, malformed: true };
  if (typeof nested.requestDigest !== "string") return { record: null, malformed: true };
  return { record: Object.freeze(nested) as unknown as HermesPolicyReplayRecord, malformed: false };
}

function sameFields(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validPairedDenial(
  input: HermesPolicyClassifierInput,
  current: HermesPolicyClassificationResult,
  prior: HermesPolicyReplayRecord,
): boolean {
  const decision = prior.policyDecision;
  const request = prior.externalImpactRequest;
  if (prior.status !== "active" || prior.requestDigest !== current.requestDigest || !HermesControlPlane.isPolicyDecisionV1(decision) || !HermesControlPlane.isExternalImpactRequestV1(request)) return false;
  if (decision.decision !== "deniedExternalImpact" || decision.schemaVersion !== HermesControlPlane.HERMES_POLICY_DECISION_SCHEMA_VERSION || request.schemaVersion !== HermesControlPlane.HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION) return false;
  if (decision.outcomeId !== input.outcomeId || decision.laneRunId !== input.laneRunId || decision.idempotencyKey !== input.idempotencyKey) return false;
  if (request.outcomeId !== input.outcomeId || request.laneRunId !== input.laneRunId || request.idempotencyKey !== input.idempotencyKey) return false;
  if (current.externalImpactRequest === null || decision.policyDecisionId !== current.policyDecision.policyDecisionId || request.externalImpactRequestId !== current.externalImpactRequest.externalImpactRequestId) return false;
  if (decision.observedAt !== current.policyDecision.observedAt || decision.createdAt !== current.policyDecision.createdAt ||
    request.createdAt !== current.externalImpactRequest.createdAt || request.expiresAt !== current.externalImpactRequest.expiresAt) return false;
  if (request.impactType !== current.externalImpactRequest.impactType || request.target !== current.externalImpactRequest.target || request.effect !== current.externalImpactRequest.effect || request.scope !== current.externalImpactRequest.scope) return false;
  if (!sameFields([...request.evidenceRefs], [...current.externalImpactRequest.evidenceRefs]) || !sameFields([...request.alternativesConsidered], [...current.externalImpactRequest.alternativesConsidered])) return false;
  const evaluationAt = Date.parse((input.evaluationAt ?? input.observedAt) as string);
  return Number.isSafeInteger(evaluationAt) && evaluationAt < Date.parse(request.expiresAt);
}

function validOrdinaryReplay(
  input: HermesPolicyClassifierInput,
  current: HermesPolicyClassificationResult,
  prior: HermesPolicyReplayRecord,
): boolean {
  const decision = prior.policyDecision;
  return prior.status === "active" && prior.requestDigest === current.requestDigest &&
    Object.prototype.hasOwnProperty.call(prior, "externalImpactRequest") && prior.externalImpactRequest === null &&
    HermesControlPlane.isPolicyDecisionV1(decision) && decision.decision === "allowed" &&
    decision.schemaVersion === HermesControlPlane.HERMES_POLICY_DECISION_SCHEMA_VERSION &&
    decision.outcomeId === input.outcomeId && decision.laneRunId === input.laneRunId &&
    decision.idempotencyKey === input.idempotencyKey && decision.policyDecisionId === current.policyDecision.policyDecisionId;
}

function conflictDecision(current: HermesPolicyClassificationResult): HermesControlPlane.PolicyDecisionV1 {
  return policyDecision({
    policyDecisionId: current.policyDecision.policyDecisionId,
    outcomeId: current.policyDecision.outcomeId,
    laneRunId: current.policyDecision.laneRunId,
    decision: "deniedPolicy",
    reasonCode: "replay_conflict",
    evidenceRefs: current.policyDecision.evidenceRefs,
    nextAction: "inspect_replay_record",
    observedAt: current.policyDecision.observedAt,
    createdAt: current.policyDecision.createdAt,
    idempotencyKey: current.policyDecision.idempotencyKey,
  });
}

function classifySnapshot(value: HermesPolicyClassifierInput): HermesPolicyClassificationResult {
  if (!validBaseInput(value)) return malformedResult();
  const impact = classifyImpact(value);
  if (!impact) return malformedResult();
  if (impact !== "ordinary" && value.requestedDecision === "allowed") return malformedResult();
  const digest = `sha256:${sha256(canonical(value, impact))}`;
  const outcomeId = value.outcomeId as string;
  const laneRunId = value.laneRunId as string;
  const idempotencyKey = value.idempotencyKey as string;
  const evidenceRefs = safeEvidence(value.evidenceRefs);
  const observedAt = safeTime(value.observedAt);
  const createdAt = safeTime(value.createdAt, observedAt);
  const decisionId = safeId(value.policyDecisionId, `policy-decision:${digest.slice(-8)}`);
  if (impact === "ordinary") {
    return makeResult(policyDecision({
      policyDecisionId: decisionId, outcomeId, laneRunId, decision: "allowed", reasonCode: "ordinary_work",
      evidenceRefs, nextAction: "continue", observedAt, createdAt, idempotencyKey,
    }), null, digest, "new");
  }
  const request = buildExternalRequest(value, impact, digest);
  const decision = policyDecision({
    policyDecisionId: decisionId, outcomeId, laneRunId, decision: "deniedExternalImpact",
    reasonCode: impact === "spend" ? "external_spend" : "external_real_user_deployment", evidenceRefs,
    nextAction: "request_operator_decision", observedAt, createdAt, idempotencyKey,
  });
  return makeResult(decision, request, digest, "new");
}

export function classifyHermesPolicy(value: HermesPolicyClassifierInput): HermesPolicyClassificationResult {
  const snapshot = snapshotInput(value);
  return snapshot ? classifySnapshot(snapshot) : malformedResult();
}

export function evaluateHermesPolicy(value: HermesPolicyClassifierInput, priorValue?: HermesPolicyReplayRecord | null): HermesPolicyClassificationResult {
  const snapshot = snapshotInput(value);
  const current = snapshot ? classifySnapshot(snapshot) : malformedResult();
  const priorCheck = normalizePrior(priorValue);
  if (priorCheck.malformed) return makeResult(conflictDecision(current), null, current.requestDigest, "conflict");
  const prior = priorCheck.record;
  if (!prior) return current;
  const priorDecision = HermesControlPlane.isPolicyDecisionV1(prior.policyDecision) ? prior.policyDecision : null;
  const priorRequest = HermesControlPlane.isExternalImpactRequestV1(prior.externalImpactRequest) ? prior.externalImpactRequest : null;
  if (current.externalImpactRequest === null) {
    const reusedKey = snapshot && ((priorRequest?.idempotencyKey === snapshot.idempotencyKey) || (priorDecision?.idempotencyKey === snapshot.idempotencyKey));
    if (reusedKey && validOrdinaryReplay(snapshot, current, prior)) {
      return makeResult(current.policyDecision, null, current.requestDigest, "replayed");
    }
    if (reusedKey) {
      return makeResult(conflictDecision(current), null, current.requestDigest, "conflict");
    }
    return current;
  }
  if (prior.status !== "active") return makeResult(current.policyDecision, current.externalImpactRequest, current.requestDigest, "denied");
  if (!snapshot || !priorDecision || priorDecision.decision !== "deniedExternalImpact" || !priorRequest || !validPairedDenial(snapshot, current, prior)) {
    const missingPairedDenial = priorDecision?.decision === "deniedExternalImpact" && !priorRequest;
    return makeResult(missingPairedDenial ? conflictDecision(current) : current.policyDecision, null, current.requestDigest, "conflict");
  }
  return makeResult(current.policyDecision, current.externalImpactRequest, current.requestDigest, "replayed");
}

export const classifyPolicy = classifyHermesPolicy;
