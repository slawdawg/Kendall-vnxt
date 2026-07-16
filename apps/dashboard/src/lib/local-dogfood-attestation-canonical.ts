/** Restricted JCS-compatible bytes shared with the supervisor's v1 contract.
 * The receipt intentionally permits ASCII strings only, making JSON's sorted
 * key encoding deterministic across the Python verifier and dashboard tests.
 */
export const localDogfoodReceiptFields = [
  "schemaVersion", "issuerId", "keyId", "receiptId", "authorizationId", "nonce",
  "issuedAt", "expiresAt", "environment", "packetSchema", "targetRef",
  "sourceRevision", "sourceRefs", "evidenceDigest", "evidenceRefs", "runId", "attemptId", "policyVersion",
  "retentionPolicy", "observerId",
] as const;

export function canonicalLocalDogfoodReceipt(receipt: Record<string, unknown>): string {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("invalid_metadata");
  const expected = new Set<string>(localDogfoodReceiptFields);
  if (Object.keys(receipt).length !== expected.size || Object.keys(receipt).some((key) => !expected.has(key))) {
    throw new Error("unknown_or_missing_field");
  }
  for (const value of Object.values(receipt)) {
    if (typeof value !== "string" || !value || !/^[\x20-\x7e]+$/.test(value) || value.length > 200) throw new Error("invalid_metadata");
  }
  if (receipt.schemaVersion !== "pipeline-local-dogfood-attestation/v1") throw new Error("unsupported_schema");
  return JSON.stringify(Object.fromEntries(Object.entries(receipt).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
