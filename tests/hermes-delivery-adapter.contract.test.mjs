import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const deliverySource = new URL("../packages/contracts/src/hermes-control-plane/delivery.ts", import.meta.url);

test("Hermes delivery contract has a closed ordinary-action matrix", async () => {
  const source = await readFile(deliverySource, "utf8");
  for (const action of ["finish_pr", "request_review", "resolve_current_thread", "merge"]) {
    assert.match(source, new RegExp(`"${action}"`));
  }
  for (const forbidden of ["commit", "push", "pull_request", "force_push", "history_rewrite", "protection_bypass", "cleanup", "billing", "deployment"]) {
    assert.doesNotMatch(source, new RegExp(`"${forbidden}"`));
  }
  for (const field of ["taskId", "outcomeId", "laneRunId", "deliveryStewardIdentity", "deliveryHome", "deliveryWorkspace", "deliveryCapabilityBindingId", "deliveryCapabilityProof", "repository", "baseBranch", "expectedHeadSha", "requestedAction", "idempotencyKey", "expectedOutcomeRevision", "expectedLaneRevision", "policyEvidenceRef", "localVerificationRef", "rollbackRef"]) {
    assert.match(source, new RegExp(`"${field}"`));
  }
  assert.match(source, /isHermesDeliveryAuditRequestV1/);
  assert.match(source, /isHermesDeliveryActionResultV1/);
  assert.match(source, /isHermesDeliveryActionResultV1[\s\S]*isTimestampOrder\(value, \["createdAt", "observedAt"\]\)/);
  assert.match(source, /isHermesDeliveryActionResultV1[\s\S]*timestampMillis\(value\.observedAt\) <= Date\.now\(\)/);
  assert.match(source, /metadataOnly/);
  assert.match(source, /rawPayloadRetained/);
});
