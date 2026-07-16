import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// This is a type-erasure-only loader for the small, dependency-free dashboard
// module. It invokes the implementation itself rather than reproducing it in
// the test, and shares its immutable vector with the Python verifier test.
let source = fs.readFileSync("apps/dashboard/src/lib/local-dogfood-attestation-canonical.ts", "utf8");
source = source
  .replace(" as const", "")
  .replace(/receipt: Record<string, unknown>/, "receipt")
  .replace("): string {", ") {")
  .replace("Set<string>", "Set")
  .replace("export const ", "const ")
  .replace("export function ", "function ")
  .concat("\nmodule.exports = { canonicalLocalDogfoodReceipt };\n");
const sandbox = { module: { exports: {} }, Set, Object, JSON, Error };
vm.runInNewContext(source, sandbox, { filename: "local-dogfood-attestation-canonical.ts" });
const { canonicalLocalDogfoodReceipt } = sandbox.module.exports;
const receipt = JSON.parse(fs.readFileSync("tests/fixtures/local-dogfood-canonical-vector.json", "utf8"));
const expected = JSON.stringify(receipt);

assert.equal(canonicalLocalDogfoodReceipt(receipt), expected);
assert.throws(() => canonicalLocalDogfoodReceipt({ ...receipt, extra: "forged" }), /unknown_or_missing_field/);
assert.throws(() => canonicalLocalDogfoodReceipt({ ...receipt, issuerId: "" }), /invalid_metadata/);
assert.throws(() => canonicalLocalDogfoodReceipt({ ...receipt, schemaVersion: "pipeline-observed-evidence-attestation/v0" }), /unsupported_schema/);
for (const value of [1, true, null, "line\nbreak", "caf\u00e9", "x".repeat(201)]) {
  assert.throws(() => canonicalLocalDogfoodReceipt({ ...receipt, issuerId: value }), /invalid_metadata/);
}
assert.equal(canonicalLocalDogfoodReceipt(Object.fromEntries(Object.entries(receipt).reverse())), expected);
console.log("local dogfood canonical implementation/vector: passed");
