import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EPIC_25_PRELIVE_NOW,
  buildEpic25PreliveEvidenceBundle,
} from "../scripts/epic-25-prelive-harness.mjs";

test("Epic 25 pre-live harness deterministically emits a held fixture evidence bundle", () => {
  const first = JSON.stringify(buildEpic25PreliveEvidenceBundle());
  const second = JSON.stringify(buildEpic25PreliveEvidenceBundle());
  assert.equal(first, second);

  const bundle = JSON.parse(first);
  assert.equal(bundle.generatedAt, EPIC_25_PRELIVE_NOW);
  assert.equal(bundle.evidenceClass, "fixture");
  assert.equal(bundle.truthLabel, "prelive_fixture");
  assert.equal(bundle.metadataOnly, true);
  assert.equal(bundle.rawPayloadRetained, false);
  assert.equal(bundle.evidence.decision.decision, "hold");
  assert.equal(bundle.ok, true);
  assert.ok(Object.values(bundle.assertions).every(Boolean));
  assert.ok(Object.values(bundle.validations).every((failures) => failures.length === 0));
});

test("harness exercises breach, stale authority, forged provenance, secret refs, rollback, and hold paths", () => {
  const bundle = buildEpic25PreliveEvidenceBundle();
  const paths = bundle.exercisedPaths;

  assert.equal(paths.thresholdBreach.canaryOutcome, "stop");
  assert.equal(paths.thresholdBreach.rampOutcome, "stop");
  assert.deepEqual(paths.thresholdBreach.stageWorkerCounts, [1, 2, 4, 6]);
  assert.deepEqual(paths.thresholdBreach.stageOutcomes, ["hold", "stop", "hold", "hold"]);
  assert.equal(paths.thresholdBreach.rollbackRequired, true);
  assert.equal(paths.staleAndMissingAuthority.staleEvidenceRejected, true);
  assert.equal(paths.staleAndMissingAuthority.missingAuthorityRejected, true);
  assert.equal(paths.forgedLiveProvenance.accepted, false);
  assert.equal(paths.forgedLiveProvenance.fixtureGuardTriggered, true);
  assert.equal(paths.forgedLiveProvenance.finalDecision, "hold");
  assert.ok(paths.forgedLiveProvenance.validatorCodes.includes("inconsistent_result"));
  assert.equal(paths.secretLikeRefs.retained, false);
  assert.equal(paths.recoveryAndHold.recoveryOutcome, "stop");
  assert.equal(paths.recoveryAndHold.hardeningOutcome, "stop");
  assert.equal(paths.recoveryAndHold.finalDecision, "hold");
  assert.equal(paths.recoveryAndHold.rollbackRequired, true);
});

test("emitted evidence never claims live provenance or enables mutation", () => {
  const bundle = buildEpic25PreliveEvidenceBundle();
  const serialized = JSON.stringify(bundle);

  assert.doesNotMatch(serialized, /"(?:backendTruth|truthLabel)":"live"/);
  assert.doesNotMatch(serialized, /"evidenceClass":"live_observed"/);
  assert.doesNotMatch(serialized, /sk-prelivefixture|ghp_prelivefixture|Bearer prelivefixture/);
  assert.equal(bundle.evidence.canary.evidenceClass, "fixture");
  assert.equal(bundle.evidence.ramp.evidenceClass, "fixture");
  assert.equal(bundle.evidence.recovery.evidenceClass, "fixture");
  assert.equal(bundle.evidence.hardening.evidenceClass, "fixture");
  assert.equal(bundle.evidence.decision.evidenceClass, "fixture");

  for (const packet of Object.values(bundle.evidence)) {
    assert.equal(packet.metadataOnly, true);
    assert.equal(packet.rawPayloadRetained, false);
  }
  for (const field of ["rolloutAllowed", "automaticDeploymentAllowed", "providerCallsAllowed", "secretAccessAllowed", "mergeAllowed", "cleanupAllowed"]) {
    assert.equal(bundle.evidence.decision[field], false);
  }
});

test("harness source is side-effect free and uses only the existing Epic 25 contract module", () => {
  const source = readFileSync(new URL("../scripts/epic-25-prelive-harness.mjs", import.meta.url), "utf8");

  assert.match(source, /\.\/lib\/manager-control-plane\/operational-readiness\.mjs/);
  assert.doesNotMatch(source, /node:(?:child_process|fs|net|http|https)|fetch\s*\(|writeFile|mkdir|exec|spawn/);
});
