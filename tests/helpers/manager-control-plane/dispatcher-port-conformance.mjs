import assert from "node:assert/strict";

const CONTRACT_EVENT_NAMES = new Set([
  "dispatcher.work.queued",
  "dispatcher.lease.claimed",
  "dispatcher.lease.heartbeat",
  "dispatcher.lease.expired",
  "dispatcher.attempt.completed",
  "dispatcher.attempt.failed",
  "dispatcher.refill.started",
  "dispatcher.refill.completed",
  "dispatcher.authority.blocked",
  "dispatcher.candidate.blocked",
  "dispatcher.review.required",
  "dispatcher.summary.updated",
  "dispatcher.summary.stale",
  "dispatcher.progress.observed",
  "dispatcher.policy.blocked_action",
  "dispatcher.recovery.attempted",
  "dispatcher.work_supply.empty",
  "manager.run.started",
  "manager.run.steered",
  "manager.ledger.appended",
  "manager.question.recorded",
  "manager.checkpoint.recorded",
  "manager.resource.snapshot",
  "manager.usage.snapshot",
  "manager.blocker.recorded",
  "manager.recovery.blocked",
  "manager.replay.summarized"
]);

export async function assertDispatcherPortContractSuite(createAdapter, { candidate, createClock }) {
  assertCreateClock(createClock);
  await assertMalformedInputConformance(createAdapter, { candidate, createClock });
  await assertRetainedMetadataAndSafetyConformance(createAdapter, { candidate, createClock });
  await assertHappyPathConformance(createAdapter, { candidate, createClock });
  await assertEvidenceAndStaleLeaseConformance(createAdapter, { candidate, createClock });
  await assertHeartbeatFenceConformance(createAdapter, { candidate, createClock });
  await assertCloseoutFenceConformance(createAdapter, { candidate, createClock });
  await assertTimeoutRetryAndRecoveryConformance(createAdapter, { candidate, createClock });
  await assertFailedWorkRecoveryConformance(createAdapter, { candidate, createClock });
  await assertAuthorityDuplicateAndEvidenceConformance(createAdapter, { candidate, createClock });
}

export async function assertDispatcherPortConformance(createAdapter, { candidate, createClock }) {
  assert.equal(typeof createAdapter, "function", "legacy dispatcher conformance helper requires adapter factory");
  assert.equal(typeof candidate, "object", "legacy dispatcher conformance helper requires candidate fixture");
  assert.equal(
    typeof createClock,
    "function",
    "legacy dispatcher conformance helper now delegates to the full contract suite and requires createClock"
  );
  await assertDispatcherPortContractSuite(createAdapter, { candidate, createClock });
}

async function assertMalformedInputConformance(createAdapter, { candidate, createClock }) {
  const { adapter } = createAdapterHarness(createAdapter, { createClock });

  await assertInvalidInputResult(() => adapter.refill(undefined), "refill undefined input");
  await assertInvalidInputResult(() => adapter.refill(null), "refill null input");
  await assertInvalidInputResult(
    () => adapter.refill({ candidates: null, evidenceRefs: ["evidence-malformed-refill"], policyReason: "fixture-backed safe source" }),
    "refill null candidates"
  );
  await assertInvalidInputResult(
    () => adapter.refill({ candidates: [null], evidenceRefs: ["evidence-malformed-candidate"], policyReason: "fixture-backed safe source" }),
    "refill null candidate"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            sourceRefs: null
          }
        ],
        evidenceRefs: ["evidence-malformed-source-refs"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate with malformed sourceRefs"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            acceptanceCriteria: null
          }
        ],
        evidenceRefs: ["evidence-malformed-acceptance"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate with malformed acceptanceCriteria"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            dependencyHints: null
          }
        ],
        evidenceRefs: ["evidence-malformed-dependency"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate with malformed dependencyHints"
  );
  for (const field of [
    "candidateWorkPacketId",
    "runId",
    "proposedSlice",
    "riskClass",
    "dedupeKey",
    "authorityClass",
    "authorityStage",
    "status",
    "policyId",
    "createdAt",
    "updatedAt"
  ]) {
    await assertInvalidInputResult(
      () =>
        adapter.refill({
          candidates: [omitCandidateField(candidate, field)],
          evidenceRefs: [`evidence-missing-${field}`],
          policyReason: "fixture-backed safe source"
        }),
      `refill candidate missing ${field}`
    );
    await assertInvalidInputResult(
      () =>
        adapter.refill({
          candidates: [{ ...candidate, [field]: " " }],
          evidenceRefs: [`evidence-blank-${field}`],
          policyReason: "fixture-backed safe source"
        }),
      `refill candidate blank ${field}`
    );
  }
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            sourceRefs: [{ ...candidate.sourceRefs[0], sourceType: "" }]
          }
        ],
        evidenceRefs: ["evidence-malformed-source-type"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate malformed sourceType"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            sourceRefs: [{ ...candidate.sourceRefs[0], label: "" }]
          }
        ],
        evidenceRefs: ["evidence-malformed-source-label"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate malformed source label"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            sourceRefs: [{ ...candidate.sourceRefs[0], summaryOnly: "true" }]
          }
        ],
        evidenceRefs: ["evidence-malformed-source-summary-only"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate malformed source summaryOnly"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            verificationTargets: [{ ...candidate.verificationTargets[0], commandId: "" }]
          }
        ],
        evidenceRefs: ["evidence-malformed-verification-command-id"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate malformed verification target"
  );
  const needsReviewWithoutVerification = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-needs-review-no-verification",
    dedupeKey: "candidate-needs-review-no-verification",
    status: "needs_review",
    verificationTargets: []
  });
  const allowedWithMissingVerificationPeer = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-allowed-with-needs-review-peer",
    dedupeKey: "candidate-allowed-with-needs-review-peer",
    sourceRefId: "candidate-allowed-with-needs-review-peer-source",
    sourceSpan: "allowed peer source"
  });
  const mixedMissingVerification = await adapter.refill({
    candidates: [allowedWithMissingVerificationPeer, needsReviewWithoutVerification],
    evidenceRefs: ["evidence-needs-review-no-verification"],
    policyReason: "needs-review missing verification should not abort safe peers"
  });
  assert.equal(mixedMissingVerification.ok, true);
  assert.equal(mixedMissingVerification.value.queuedWorkItems.length, 1);
  assert.equal(mixedMissingVerification.value.needsReviewCandidates.length, 1);
  assert.equal(mixedMissingVerification.value.needsReviewCandidates[0].verificationTargets.length, 0);
  assert.equal(mixedMissingVerification.value.refillJob.needsReviewCount, 1);
  assertMetadataOnlyEvents(mixedMissingVerification.value.events);
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          cloneCandidate(candidate, {
            candidateWorkPacketId: "candidate-missing-verification-invalid",
            dedupeKey: "candidate-missing-verification-invalid",
            verificationTargets: []
          })
        ],
        evidenceRefs: ["evidence-missing-verification-invalid"],
        policyReason: "eligible candidates still require verification"
      }),
    "eligible candidate missing verification"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            evidenceRefs: [" "]
          }
        ],
        evidenceRefs: ["evidence-malformed-candidate-evidence"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate malformed evidence ref"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            acceptanceCriteria: []
          }
        ],
        evidenceRefs: ["evidence-empty-acceptance"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate with empty acceptance criteria"
  );
  const unsafeCandidateIdCases = [
    {
      label: "candidateWorkPacketId sk key",
      candidate: { ...candidate, candidateWorkPacketId: "sk-1234567890abcdef" }
    },
    {
      label: "runId raw provider",
      candidate: { ...candidate, runId: "rawProviderPayload: must-not-retain" }
    },
    {
      label: "policyId secret marker",
      candidate: { ...candidate, policyId: "secret=must-not-retain" }
    },
    {
      label: "createdAt provider marker",
      candidate: { ...candidate, createdAt: "provider=openai" }
    },
    {
      label: "updatedAt client secret marker",
      candidate: { ...candidate, updatedAt: "client_secret=abc123 retained" }
    },
    {
      label: "sourceRefId private key marker",
      candidate: {
        ...candidate,
        sourceRefs: [{ ...candidate.sourceRefs[0], sourceRefId: "private_key=abc123" }]
      }
    },
    {
      label: "verificationTargetId access key marker",
      candidate: {
        ...candidate,
        verificationTargets: [{ ...candidate.verificationTargets[0], verificationTargetId: "access_key=abc123" }]
      }
    },
    {
      label: "commandId api key marker",
      candidate: {
        ...candidate,
        verificationTargets: [{ ...candidate.verificationTargets[0], commandId: "api-key=abc123" }]
      }
    },
    {
      label: "candidate evidence ref sk key",
      candidate: { ...candidate, evidenceRefs: ["sk-1234567890abcdef"] }
    },
    {
      label: "proposed slice env api key",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-env-key-field",
        proposedSlice: "OPENAI_API_KEY=must-not-retain"
      })
    },
    {
      label: "acceptance criterion env token",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-env-github-field",
        acceptanceCriteria: ["GITHUB_TOKEN=must-not-retain"]
      })
    },
    {
      label: "source span access token",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-access-field",
        sourceSpan: "access_token=must-not-retain"
      })
    },
    {
      label: "verification expected result refresh token",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-refresh-field",
        verificationTargets: [{ ...candidate.verificationTargets[0], expectedResult: "refresh_token=must-not-retain" }]
      })
    },
    {
      label: "dependency hint env secret",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-env-sensitive-field",
        dependencyHints: ["CLIENT_SECRET=must-not-retain"]
      })
    },
    {
      label: "dedupe key id token",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-id-field",
        dedupeKey: "id_token=must-not-retain"
      })
    },
    {
      label: "bare bearer token",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-bare-bearer",
        proposedSlice: "Bearer abcdef1234567890"
      })
    },
    {
      label: "jwt-shaped value",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-jwt",
        proposedSlice: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature"
      })
    },
    {
      label: "privateKey camelCase alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-private-key-camel",
        proposedSlice: "privateKey must-not-retain"
      })
    },
    {
      label: "sshPrivateKey camelCase alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-ssh-private-key-camel",
        dependencyHints: ["sshPrivateKey must-not-retain"]
      })
    },
    {
      label: "accessKey camelCase alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-access-key-camel",
        verificationTargets: [{ ...candidate.verificationTargets[0], expectedResult: "accessKey must-not-retain" }]
      })
    },
    {
      label: "awsSecretAccessKey camelCase alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-aws-secret-access-key-camel",
        dedupeKey: "awsSecretAccessKey must-not-retain"
      })
    },
    {
      label: "secretKey camelCase alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-secret-key-camel",
        proposedSlice: "secretKey must-not-retain"
      })
    },
    {
      label: "raw_payload snake alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-raw-payload-snake",
        proposedSlice: "raw_payload must-not-retain"
      })
    },
    {
      label: "provider_payload snake alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-provider-payload-snake",
        dependencyHints: ["provider_payload must-not-retain"]
      })
    },
    {
      label: "provider_metadata snake alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-provider-metadata-snake",
        acceptanceCriteria: ["provider_metadata must-not-retain"]
      })
    },
    {
      label: "retained_payload snake alias",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-retained-payload-snake",
        verificationTargets: [{ ...candidate.verificationTargets[0], expectedResult: "retained_payload must-not-retain" }]
      })
    }
  ];
  for (const [index, unsafeCase] of unsafeCandidateIdCases.entries()) {
    await assertInvalidInputResult(
      () =>
        adapter.refill({
          candidates: [unsafeCase.candidate],
          evidenceRefs: [`evidence-unsafe-id-${index}`],
          policyReason: "unsafe retained IDs must fail closed"
        }),
      `refill candidate unsafe ${unsafeCase.label}`
    );
  }
  const unsafeRefillEvidence = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["rawProviderPayload: must-not-retain"],
    policyReason: "unsafe evidence refs must fail closed"
  });
  assert.equal(unsafeRefillEvidence.ok, false);
  assert.deepEqual(unsafeRefillEvidence.evidenceRefs, []);
  const unsafeEnvEvidence = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["OPENAI_API_KEY=must-not-retain"],
    policyReason: "unsafe env-style evidence refs must fail closed"
  });
  assert.equal(unsafeEnvEvidence.ok, false);
  assert.deepEqual(unsafeEnvEvidence.evidenceRefs, []);
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [candidate],
        evidenceRefs: ["evidence-unsafe-policy-reason"],
        policyReason: "providerMetadata: response_id=resp_123 must not be retained"
      }),
    "refill unsafe policy reason"
  );
  await assertInvalidInputResult(
    () => adapter.claim({ workerId: "sk-1234567890abcdef", evidenceRefs: ["evidence-unsafe-worker"] }),
    "claim unsafe worker id"
  );
  await assertInvalidInputResult(
    () => adapter.claim({ workerId: "GITHUB_TOKEN=must-not-retain", evidenceRefs: ["evidence-unsafe-worker-env"] }),
    "claim env-style unsafe worker id"
  );
  for (const [index, tokenPrefix] of ["github_pat", "ghp", "gho", "ghu", "ghs", "ghr"].entries()) {
    await assertInvalidInputResult(
      () =>
        adapter.refill({
          candidates: [
            cloneCandidate(candidate, {
              candidateWorkPacketId: `candidate-unsafe-github-token-${index}`,
              proposedSlice: `${tokenPrefix}_1234567890abcdef`
            })
          ],
          evidenceRefs: [`evidence-unsafe-gh-family-${index}`],
          policyReason: "gh family prefix must fail closed"
        }),
      `refill candidate unsafe ${tokenPrefix} token`
    );
  }
  const unsafeCandidateStringCases = [
    {
      label: "sourceSpan provider metadata",
      candidate: cloneCandidate(candidate, { candidateWorkPacketId: "candidate-unsafe-source-span", sourceSpan: "providerMetadata: response_id=resp_123" })
    },
    {
      label: "pathOrUrl provider marker",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-path",
        sourceRefs: [{ ...candidate.sourceRefs[0], pathOrUrl: "provider=openai response_id=resp_123" }]
      })
    },
    {
      label: "verification command authorization",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-command",
        verificationTargets: [{ ...candidate.verificationTargets[0], command: "curl -H 'Authorization: Bearer test-token'" }]
      })
    },
    {
      label: "verification expected result api key",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-expected",
        verificationTargets: [{ ...candidate.verificationTargets[0], expectedResult: "api_key=abc123" }]
      })
    },
    {
      label: "acceptance criterion sk key",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-acceptance",
        acceptanceCriteria: ["sk-1234567890abcdef must not be retained"]
      })
    },
    {
      label: "proposed slice password marker",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-slice",
        proposedSlice: "password=not-retained"
      })
    },
    {
      label: "dedupe key provider response",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-dedupe",
        dedupeKey: "providerResponse: response_id=resp_456"
      })
    },
    {
      label: "dependency hint credential marker",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-dependency",
        dependencyHints: ["credential=not-retained"]
      })
    },
    {
      label: "dependency hint client secret marker",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-client-secret",
        dependencyHints: ["client_secret=abc123 retained"]
      })
    },
    {
      label: "multiline proposed slice",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-multiline",
        proposedSlice: "line one\nline two"
      })
    },
    {
      label: "json provider metadata",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-json-provider",
        proposedSlice: '"provider":"openai","response_id":"resp_123"'
      })
    },
    {
      label: "github token prefix",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-ghp",
        proposedSlice: "ghp_1234567890abcdef"
      })
    },
    {
      label: "aws token prefix",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-akia",
        proposedSlice: "AKIA1234567890ABCDEF"
      })
    },
    {
      label: "pem key prefix",
      candidate: cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-unsafe-pem",
        proposedSlice: "-----BEGIN PRIVATE KEY-----"
      })
    }
  ];
  for (const [index, unsafeCase] of unsafeCandidateStringCases.entries()) {
    await assertInvalidInputResult(
      () =>
        adapter.refill({
          candidates: [unsafeCase.candidate],
          evidenceRefs: [`evidence-unsafe-string-${index}`],
          policyReason: "unsafe retained candidate metadata must fail closed"
        }),
      `refill candidate unsafe ${unsafeCase.label}`
    );
  }
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            sourceRefs: [{ ...candidate.sourceRefs[0], rawProviderPayload: { secret: "must-not-retain" } }]
          }
        ],
        evidenceRefs: ["evidence-raw-source-ref"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate raw source ref"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            verificationTargets: [{ ...candidate.verificationTargets[0], rawPayload: { secret: "must-not-retain" } }]
          }
        ],
        evidenceRefs: ["evidence-raw-verification-target"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate raw verification target"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            rawProviderPayload: { secret: "must-not-retain" }
          }
        ],
        evidenceRefs: ["evidence-raw-top-level-candidate"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate raw top-level payload"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            providerMetadata: { responseId: "must-not-retain" }
          }
        ],
        evidenceRefs: ["evidence-provider-metadata-top-level-candidate"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate provider metadata top-level payload"
  );
  await assertInvalidInputResult(
    () =>
      adapter.refill({
        candidates: [
          {
            ...candidate,
            safeUnknownMetadata: "safe extension is still outside the closed candidate shape"
          }
        ],
        evidenceRefs: ["evidence-safe-unknown-top-level-candidate"],
        policyReason: "fixture-backed safe source"
      }),
    "refill candidate safe unknown top-level payload"
  );
  await assertFailureEvidenceRefs(() => adapter.claim({ workerId: "worker-1", evidenceRefs: "evidence-string" }), []);
  await assertFailureEvidenceRefs(
    () => adapter.claim({ workerId: "worker-1", evidenceRefs: { evidenceRefId: "evidence-object" } }),
    []
  );
  await assertInvalidInputResult(() => adapter.claim(undefined), "claim undefined input");
  await assertInvalidInputResult(() => adapter.claim(null), "claim null input");
  await assertInvalidInputResult(() => adapter.heartbeat(undefined), "heartbeat undefined input");
  await assertInvalidInputResult(() => adapter.heartbeat(null), "heartbeat null input");
  await assertInvalidInputResult(() => adapter.complete(undefined), "complete undefined input");
  await assertInvalidInputResult(() => adapter.complete(null), "complete null input");
  await assertInvalidInputResult(() => adapter.fail(undefined), "fail undefined input");
  await assertInvalidInputResult(() => adapter.fail(null), "fail null input");
  await assertInvalidInputResult(() => adapter.recoverExpiredLeases(undefined), "recover undefined input");
  await assertInvalidInputResult(() => adapter.recoverExpiredLeases(null), "recover null input");

  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill-for-malformed-fence"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-for-malformed-fence"] });
  assert.equal(claim.ok, true);
  const leaseInput = {
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-malformed-fence"],
    ttlMs: 300_000,
    resultSummary: "should not complete",
    failureReason: "should not fail"
  };
  for (const method of ["heartbeat", "complete", "fail"]) {
    for (const field of ["leaseId", "attemptId", "idempotencyKey", "authorityDecisionId"]) {
      await assertInvalidInputResult(
        () => adapter[method](omitCandidateField(leaseInput, field)),
        `${method} missing ${field}`
      );
      await assertInvalidInputResult(
        () => adapter[method]({ ...leaseInput, [field]: " " }),
        `${method} blank ${field}`
      );
      await assertInvalidInputResult(
        () => adapter[method]({ ...leaseInput, [field]: 42 }),
        `${method} non-string ${field}`
      );
    }
  }
}

async function assertRetainedMetadataAndSafetyConformance(createAdapter, { candidate, createClock }) {
  assert.throws(
    () => createAdapterHarness(createAdapter, { createClock, runId: "provider=openai response_id=resp_unsafe" }),
    /runId/
  );

  const { adapter: runIdAdapter } = createAdapterHarness(createAdapter, { createClock, runId: " run-1 " });
  const runIdRefill = await runIdAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-run-id-normalized",
        dedupeKey: "candidate-run-id-normalized"
      })
    ],
    evidenceRefs: ["evidence-run-id-normalized"],
    policyReason: "adapter run id should normalize before event retention"
  });
  assert.equal(runIdRefill.ok, true);
  assert.equal(runIdRefill.value.events.every((event) => event.runId === "run-1"), true);
  assertMetadataOnlyEvents(runIdRefill.value.events);

  const { adapter: mutationAdapter } = createAdapterHarness(createAdapter, { createClock });
  const mutableCandidate = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-mutation-proof",
    dedupeKey: "candidate-mutation-proof"
  });
  const callerEvidenceRefs = ["evidence-mutation-proof"];
  const mutationRefill = await mutationAdapter.refill({
    candidates: [mutableCandidate],
    evidenceRefs: callerEvidenceRefs,
    policyReason: "fixture-backed mutation proof"
  });
  assert.equal(mutationRefill.ok, true);
  mutableCandidate.sourceRefs[0].sourceRefId = "mutated-source";
  mutableCandidate.sourceRefs[0].rawProviderPayload = { secret: "must-not-retain" };
  mutableCandidate.evidenceRefs.push("mutated-candidate-evidence");
  callerEvidenceRefs.push("mutated-refill-evidence");
  assert.equal(mutationRefill.value.queuedWorkItems[0].sourceRefs[0].sourceRefId, "candidate-mutation-proof-source-1");
  assert.equal(Object.hasOwn(mutationRefill.value.queuedWorkItems[0].sourceRefs[0], "rawProviderPayload"), false);
  assert.deepEqual(mutationRefill.value.queuedWorkItems[0].evidenceRefs, ["evidence-source", "evidence-mutation-proof"]);
  assert.deepEqual(mutationRefill.evidenceRefs, ["evidence-mutation-proof"]);
  assert.deepEqual(mutationRefill.value.refillJob.evidenceRefs, ["evidence-mutation-proof"]);
  assert.equal(
    mutationRefill.value.events.some((event) => event.evidenceRefs.includes("mutated-refill-evidence")),
    false
  );
  assertMetadataOnlyEvents(mutationRefill.value.events);

  const { adapter: scalarAdapter } = createAdapterHarness(createAdapter, { createClock });
  const scalarCandidate = cloneCandidate(candidate, {
    candidateWorkPacketId: " candidate-scalar-normalized ",
    runId: " run-1 ",
    dedupeKey: " dedupe-scalar-normalized ",
    policyId: " policy-1 ",
    createdAt: " 2026-06-30T00:00:00.000Z ",
    updatedAt: " 2026-06-30T00:00:00.000Z ",
    evidenceRefs: [" evidence-candidate-scalar "]
  });
  scalarCandidate.sourceRefs = [
    {
      ...scalarCandidate.sourceRefs[0],
      sourceRefId: " source-scalar ",
      label: " scalar source ",
      pathOrUrl: " docs/scalar.md ",
      sourceSpan: " lines 1-2 "
    }
  ];
  scalarCandidate.verificationTargets = [
    {
      ...scalarCandidate.verificationTargets[0],
      verificationTargetId: " verification-scalar ",
      commandId: " command-scalar ",
      command: " node --test tests/manager-control-plane.dispatcher-port.test.mjs ",
      expectedResult: " pass "
    }
  ];
  const scalarRefill = await scalarAdapter.refill({
    candidates: [scalarCandidate],
    evidenceRefs: [" evidence-scalar-refill "],
    policyReason: " scalar retained metadata should normalize before retention "
  });
  assert.equal(scalarRefill.ok, true);
  const scalarWorkItem = scalarRefill.value.queuedWorkItems[0];
  assert.equal(scalarWorkItem.runId, "run-1");
  assert.equal(scalarWorkItem.candidateWorkPacketId, "candidate-scalar-normalized");
  assert.equal(scalarWorkItem.sourceRefs[0].sourceRefId, "source-scalar");
  assert.equal(scalarWorkItem.sourceRefs[0].label, "scalar source");
  assert.equal(scalarWorkItem.sourceRefs[0].pathOrUrl, "docs/scalar.md");
  assert.equal(scalarWorkItem.sourceRefs[0].sourceSpan, "lines 1-2");
  assert.equal(scalarWorkItem.verificationTargets[0].verificationTargetId, "verification-scalar");
  assert.equal(scalarWorkItem.verificationTargets[0].commandId, "command-scalar");
  assert.equal(scalarWorkItem.verificationTargets[0].command, "node --test tests/manager-control-plane.dispatcher-port.test.mjs");
  assert.equal(scalarWorkItem.verificationTargets[0].expectedResult, "pass");
  assert.deepEqual(scalarWorkItem.evidenceRefs, ["evidence-candidate-scalar", "evidence-scalar-refill"]);
  assert.deepEqual(scalarRefill.value.refillJob.evidenceRefs, ["evidence-scalar-refill"]);
  assertMetadataOnlyEvents(scalarRefill.value.events);

  const scalarClaim = await scalarAdapter.claim({ workerId: " worker-scalar ", evidenceRefs: [" evidence-scalar-claim "] });
  assert.equal(scalarClaim.ok, true);
  assert.equal(scalarClaim.value.lease.workerId, "worker-scalar");
  assert.equal(scalarClaim.value.events.every((event) => event.actorId === "worker-scalar"), true);
  assertMetadataOnlyEvents(scalarClaim.value.events);

  const duplicateScalar = cloneCandidate(candidate, {
    candidateWorkPacketId: " candidate-scalar-normalized-duplicate ",
    dedupeKey: " dedupe-scalar-normalized "
  });
  duplicateScalar.sourceRefs = scalarCandidate.sourceRefs.map((sourceRef) => ({ ...sourceRef }));
  duplicateScalar.acceptanceCriteria = [...scalarCandidate.acceptanceCriteria];
  duplicateScalar.dependencyHints = [...scalarCandidate.dependencyHints];
  const duplicateScalarRefill = await scalarAdapter.refill({
    candidates: [duplicateScalar],
    evidenceRefs: [" evidence-scalar-duplicate "],
    policyReason: " normalized queued candidate identity should reserve dedupe "
  });
  assert.equal(duplicateScalarRefill.ok, true);
  assert.equal(duplicateScalarRefill.value.queuedWorkItems.length, 0);
  assert.equal(duplicateScalarRefill.value.duplicateCandidates.length, 1);
  assert.equal(duplicateScalarRefill.value.duplicateCandidates[0].candidateWorkPacketId, "candidate-scalar-normalized-duplicate");
  assertMetadataOnlyEvents(duplicateScalarRefill.value.events);

  const claimEvidenceRefs = ["evidence-claim-owned"];
  const mutationClaim = await mutationAdapter.claim({ workerId: "worker-1", evidenceRefs: claimEvidenceRefs });
  assert.equal(mutationClaim.ok, true);
  claimEvidenceRefs.push("mutated-claim-evidence");
  assert.deepEqual(mutationClaim.evidenceRefs, ["evidence-claim-owned"]);
  assert.deepEqual(mutationClaim.value.lease.evidenceRefs, ["evidence-claim-owned"]);
  assert.deepEqual(mutationClaim.value.executionAttempt.evidenceRefs, ["evidence-claim-owned"]);
  assert.equal(
    mutationClaim.value.events.some((event) => event.evidenceRefs.includes("mutated-claim-evidence")),
    false
  );
  assertMetadataOnlyEvents(mutationClaim.value.events);

  const mutationHeartbeat = await mutationAdapter.heartbeat({
    leaseId: mutationClaim.value.lease.leaseId,
    workerId: mutationClaim.value.lease.workerId,
    attemptId: mutationClaim.value.lease.attemptId,
    idempotencyKey: mutationClaim.value.lease.idempotencyKey,
    authorityDecisionId: mutationClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat-before-complete"],
    ttlMs: 300_000
  });
  assert.equal(mutationHeartbeat.ok, true);
  const completeEvidenceRefs = ["evidence-complete-owned"];
  const mutationComplete = await mutationAdapter.complete({
    leaseId: mutationClaim.value.lease.leaseId,
    workerId: mutationClaim.value.lease.workerId,
    attemptId: mutationClaim.value.lease.attemptId,
    idempotencyKey: mutationClaim.value.lease.idempotencyKey,
    authorityDecisionId: mutationClaim.value.lease.authorityDecisionId,
    evidenceRefs: completeEvidenceRefs,
    resultSummary: "metadata complete proof"
  });
  assert.equal(mutationComplete.ok, true);
  completeEvidenceRefs.push("mutated-complete-evidence");
  assert.deepEqual(mutationComplete.evidenceRefs, ["evidence-complete-owned"]);
  assert.equal(mutationComplete.value.executionAttempt.evidenceRefs.includes("mutated-complete-evidence"), false);
  assert.equal(
    mutationComplete.value.events.some((event) => event.evidenceRefs.includes("mutated-complete-evidence")),
    false
  );
  assertMetadataOnlyEvents(mutationComplete.value.events);

  const { adapter: failMutationAdapter } = createAdapterHarness(createAdapter, { createClock });
  const failMutationRefill = await failMutationAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-fail-mutation-proof",
        dedupeKey: "candidate-fail-mutation-proof"
      })
    ],
    evidenceRefs: ["evidence-fail-mutation-refill"],
    policyReason: "fixture-backed fail mutation proof"
  });
  assert.equal(failMutationRefill.ok, true);
  const failMutationClaim = await failMutationAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-fail-mutation-claim"] });
  assert.equal(failMutationClaim.ok, true);
  const failMutationHeartbeat = await failMutationAdapter.heartbeat({
    leaseId: failMutationClaim.value.lease.leaseId,
    workerId: failMutationClaim.value.lease.workerId,
    attemptId: failMutationClaim.value.lease.attemptId,
    idempotencyKey: failMutationClaim.value.lease.idempotencyKey,
    authorityDecisionId: failMutationClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat-before-fail"],
    ttlMs: 300_000
  });
  assert.equal(failMutationHeartbeat.ok, true);
  const failEvidenceRefs = ["evidence-fail-owned"];
  const mutationFail = await failMutationAdapter.fail({
    leaseId: failMutationClaim.value.lease.leaseId,
    workerId: failMutationClaim.value.lease.workerId,
    attemptId: failMutationClaim.value.lease.attemptId,
    idempotencyKey: failMutationClaim.value.lease.idempotencyKey,
    authorityDecisionId: failMutationClaim.value.lease.authorityDecisionId,
    evidenceRefs: failEvidenceRefs,
    failureReason: "metadata fail proof"
  });
  assert.equal(mutationFail.ok, true);
  failEvidenceRefs.push("mutated-fail-evidence");
  assert.deepEqual(mutationFail.evidenceRefs, ["evidence-fail-owned"]);
  assert.equal(mutationFail.value.executionAttempt.evidenceRefs.includes("mutated-fail-evidence"), false);
  assert.equal(
    mutationFail.value.events.some((event) => event.evidenceRefs.includes("mutated-fail-evidence")),
    false
  );
  assertMetadataOnlyEvents(mutationFail.value.events);

  const { adapter: failureResultAdapter } = createAdapterHarness(createAdapter, { createClock });
  const failureEvidenceRefs = ["evidence-failure-owned"];
  const failureResult = await failureResultAdapter.claim({ workerId: "worker-1", evidenceRefs: failureEvidenceRefs });
  assert.equal(failureResult.ok, false);
  failureEvidenceRefs.push("mutated-failure-evidence");
  assert.deepEqual(failureResult.evidenceRefs, ["evidence-failure-owned"]);

  const { adapter: publicCloneAdapter } = createAdapterHarness(createAdapter, { createClock });
  const publicCloneRefill = await publicCloneAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-public-clone-proof",
        dedupeKey: "candidate-public-clone-proof"
      })
    ],
    evidenceRefs: [" evidence-public-clone-refill ", "evidence-public-clone-refill"],
    policyReason: "public results must be defensive clones"
  });
  assert.equal(publicCloneRefill.ok, true);
  assert.deepEqual(publicCloneRefill.evidenceRefs, ["evidence-public-clone-refill"]);
  assert.deepEqual(publicCloneRefill.value.refillJob.evidenceRefs, ["evidence-public-clone-refill"]);
  assert.equal(publicCloneRefill.value.events.every((event) => event.evidenceRefs.includes(" evidence-public-clone-refill ") === false), true);
  const publicCloneClaim = await publicCloneAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-public-clone-claim"] });
  assert.equal(publicCloneClaim.ok, true);
  const publicFence = {
    leaseId: publicCloneClaim.value.lease.leaseId,
    workerId: publicCloneClaim.value.lease.workerId,
    attemptId: publicCloneClaim.value.lease.attemptId,
    idempotencyKey: publicCloneClaim.value.lease.idempotencyKey,
    authorityDecisionId: publicCloneClaim.value.lease.authorityDecisionId
  };
  publicCloneClaim.value.lease.workerId = "worker-mutated-return";
  publicCloneClaim.value.executionAttempt.workerId = "worker-mutated-return";
  publicCloneClaim.value.workItem.status = "mutated-return";
  publicCloneClaim.value.events[0].evidenceRefs.push("mutated-return-event-evidence");
  if (typeof publicCloneAdapter.snapshot === "function") {
    const snapshot = publicCloneAdapter.snapshot();
    assert.equal(snapshot.leases[0].workerId, "worker-1");
    assert.equal(snapshot.events.some((event) => event.evidenceRefs.includes("mutated-return-event-evidence")), false);
    snapshot.leases[0].workerId = "worker-mutated-snapshot";
    snapshot.events[0].evidenceRefs.push("mutated-snapshot-event-evidence");
    const secondSnapshot = publicCloneAdapter.snapshot();
    assert.equal(secondSnapshot.leases[0].workerId, "worker-1");
    assert.equal(secondSnapshot.events.some((event) => event.evidenceRefs.includes("mutated-snapshot-event-evidence")), false);
  }
  const mutatedFenceHeartbeat = await publicCloneAdapter.heartbeat({
    ...publicFence,
    workerId: "worker-mutated-return",
    evidenceRefs: ["evidence-mutated-public-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(mutatedFenceHeartbeat.ok, false);
  assert.equal(mutatedFenceHeartbeat.code, "stale_lease");
  const publicHeartbeat = await publicCloneAdapter.heartbeat({
    ...publicFence,
    evidenceRefs: ["evidence-public-clone-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(publicHeartbeat.ok, true);
  const mutatedFenceComplete = await publicCloneAdapter.complete({
    ...publicFence,
    workerId: "worker-mutated-return",
    evidenceRefs: ["evidence-mutated-public-complete"],
    resultSummary: "mutated public result must not pass"
  });
  assert.equal(mutatedFenceComplete.ok, false);
  assert.equal(mutatedFenceComplete.code, "stale_lease");
  const publicComplete = await publicCloneAdapter.complete({
    ...publicFence,
    evidenceRefs: ["evidence-public-clone-complete"],
    resultSummary: "public clone completion proof"
  });
  assert.equal(publicComplete.ok, true);

  const { adapter: publicFailCloneAdapter } = createAdapterHarness(createAdapter, { createClock });
  const publicFailRefill = await publicFailCloneAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-public-fail-clone-proof",
        dedupeKey: "candidate-public-fail-clone-proof"
      })
    ],
    evidenceRefs: ["evidence-public-fail-refill"],
    policyReason: "public fail results must be defensive clones"
  });
  assert.equal(publicFailRefill.ok, true);
  const publicFailClaim = await publicFailCloneAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-public-fail-claim"] });
  assert.equal(publicFailClaim.ok, true);
  const publicFailFence = {
    leaseId: publicFailClaim.value.lease.leaseId,
    workerId: publicFailClaim.value.lease.workerId,
    attemptId: publicFailClaim.value.lease.attemptId,
    idempotencyKey: publicFailClaim.value.lease.idempotencyKey,
    authorityDecisionId: publicFailClaim.value.lease.authorityDecisionId
  };
  publicFailClaim.value.lease.workerId = "worker-mutated-return";
  publicFailClaim.value.executionAttempt.workerId = "worker-mutated-return";
  const publicFailHeartbeat = await publicFailCloneAdapter.heartbeat({
    ...publicFailFence,
    evidenceRefs: ["evidence-public-fail-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(publicFailHeartbeat.ok, true);
  const mutatedFenceFail = await publicFailCloneAdapter.fail({
    ...publicFailFence,
    workerId: "worker-mutated-return",
    evidenceRefs: ["evidence-mutated-public-fail"],
    failureReason: "mutated public failure must not pass"
  });
  assert.equal(mutatedFenceFail.ok, false);
  assert.equal(mutatedFenceFail.code, "stale_lease");
  const publicFail = await publicFailCloneAdapter.fail({
    ...publicFailFence,
    evidenceRefs: ["evidence-public-fail"],
    failureReason: "public clone failure proof"
  });
  assert.equal(publicFail.ok, true);

  const { adapter: blankHintAdapter } = createAdapterHarness(createAdapter, { createClock });
  const blankHintOne = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-blank-hint-one",
    dedupeKey: "candidate-blank-hint-one",
    sourceRefId: "candidate-blank-hint-source",
    sourceSpan: "blank hint source",
    dependencyHints: [" ", "  "]
  });
  const blankHintTwo = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-blank-hint-two",
    dedupeKey: "candidate-blank-hint-two",
    sourceRefId: "candidate-blank-hint-source",
    sourceSpan: "blank hint source",
    acceptanceCriteria: blankHintOne.acceptanceCriteria,
    dependencyHints: [" ", "  "]
  });
  const blankHintRefill = await blankHintAdapter.refill({
    candidates: [blankHintOne, blankHintTwo],
    evidenceRefs: ["evidence-blank-hint-refill"],
    policyReason: "blank dependency hints must not create delimiter-only dedupe"
  });
  assert.equal(blankHintRefill.ok, true);
  assert.equal(blankHintRefill.value.queuedWorkItems.length, 2);
  assert.equal(blankHintRefill.value.duplicateCandidates.length, 0);
  assert.equal(blankHintRefill.value.queuedWorkItems.every((workItem) => workItem.dependencyHints === undefined), true);
  assert.equal(blankHintRefill.value.queuedWorkItems.every((workItem) => Array.isArray(workItem.dependencies) && workItem.dependencies.length === 0), true);
  assert.equal(blankHintRefill.value.queuedWorkItems.every((workItem) => !workItem.dedupeKey.endsWith("::|")), true);

  const { adapter: repeatedHintAdapter } = createAdapterHarness(createAdapter, { createClock });
  const repeatedHintOne = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-repeated-hint-one",
    dedupeKey: "candidate-repeated-hint",
    sourceRefId: "candidate-repeated-hint-source",
    sourceSpan: "repeated hint source",
    dependencyHints: ["pkg/a"]
  });
  const repeatedHintTwo = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-repeated-hint-two",
    dedupeKey: "candidate-repeated-hint",
    sourceRefId: "candidate-repeated-hint-source",
    sourceSpan: "repeated hint source",
    acceptanceCriteria: repeatedHintOne.acceptanceCriteria,
    dependencyHints: ["pkg/a", "pkg/a"]
  });
  const repeatedHintRefill = await repeatedHintAdapter.refill({
    candidates: [repeatedHintOne, repeatedHintTwo],
    evidenceRefs: ["evidence-repeated-hint-refill"],
    policyReason: "repeated dependency hints must canonicalize before dedupe"
  });
  assert.equal(repeatedHintRefill.ok, true);
  assert.equal(repeatedHintRefill.value.queuedWorkItems.length, 1);
  assert.equal(repeatedHintRefill.value.duplicateCandidates.length, 1);
  assert.deepEqual(repeatedHintRefill.value.queuedWorkItems[0].dependencies, ["pkg/a"]);
  assert.equal(repeatedHintRefill.value.duplicateCandidates[0].dependencyHints.length, 1);
  assert.equal(repeatedHintRefill.value.duplicateCandidates[0].dependencyHints[0], "pkg/a");

  for (const status of ["needs_review", "blocked"]) {
    const { adapter } = createAdapterHarness(createAdapter, { createClock });
    const refill = await adapter.refill({
      candidates: [
        cloneCandidate(candidate, {
          candidateWorkPacketId: `candidate-${status}`,
          dedupeKey: `candidate-${status}`,
          status
        })
      ],
      evidenceRefs: [`evidence-${status}`],
      policyReason: "non-eligible candidates must not queue"
    });
    assert.equal(refill.ok, true);
    assert.equal(refill.value.queuedWorkItems.length, 0);
    if (status === "needs_review") {
      assert.equal(refill.value.blockedCandidates.length, 0);
      assert.equal(refill.value.needsReviewCandidates.length, 1);
      assert.equal(refill.value.refillJob.needsReviewCount, 1);
      assert.equal(refill.value.refillJob.result, "needs_review");
    } else {
      assert.equal(refill.value.blockedCandidates.length, 1);
      assert.equal(refill.value.needsReviewCandidates.length, 0);
      assert.equal(refill.value.refillJob.blockedCount, 1);
      assert.equal(refill.value.refillJob.result, "blocked");
    }
    if (status === "needs_review") {
      assert.equal(refill.value.events.some((event) => event.eventName === "dispatcher.review.required"), true);
      assert.equal(refill.value.events.some((event) => event.eventName === "dispatcher.authority.blocked"), false);
    } else {
      assert.equal(refill.value.events.some((event) => event.eventName === "dispatcher.candidate.blocked"), true);
      assert.equal(refill.value.events.some((event) => event.eventName === "dispatcher.authority.blocked"), false);
    }
    assertMetadataOnlyEvents(refill.value.events);
    if (status === "needs_review") {
      const snapshot = typeof adapter.snapshot === "function" ? adapter.snapshot() : null;
      if (snapshot) {
        assert.equal(snapshot.needsReviewCandidates.length, 1);
        assert.equal(snapshot.needsReviewCandidates[0].candidateWorkPacketId, "candidate-needs_review");
      }
      const summary = await adapter.summarize();
      assert.equal(summary.currentPhase, "needs_review");
      assert.equal(summary.operatorAttentionRequired, true);
      assert.equal(summary.authorityClass, "requires_preauthorization");
      assert.equal(summary.authorityStopReason, "needs_review");
      assert.equal(summary.stateCounts.needsReviewCandidates, 1);
      assert.equal(summary.unsafeOrGatedWorkCount, 1);
      assert.equal(summary.stateCounts.noSafeWork, 0);
      assert.equal(summary.warnings.includes("needs_review_candidates_recorded"), true);
      assert.equal(summary.rawStateLabels.includes("candidate:needs_review"), true);
      assert.equal(summary.evidenceLinks.some((link) => link.evidenceRefId === "evidence-source" && link.sourceRequirementIds.includes("candidate-needs_review-source-1")), true);
      assert.equal(summary.evidenceLinks.some((link) => link.evidenceRefId === "evidence-source" && link.verificationCommandId === "manager-dispatcher-port-test"), true);
    } else {
      const summary = await adapter.summarize();
      assert.equal(summary.currentPhase, "blocked");
      assert.equal(summary.operatorAttentionRequired, true);
      assert.equal(summary.authorityBlockedReason, null);
      assert.equal(summary.authorityStopReason, null);
      assert.equal(summary.stateCounts.blockedCandidates, 1);
      assert.equal(summary.blockers.includes("dispatcher_has_blocked_candidates"), true);
      assert.equal(summary.nextAction, "resolve_authority_or_source_blocker");
      assert.equal(summary.warnings.includes("authority_blocked_candidates_recorded"), false);
    }
  }

  const { adapter: repeatedNeedsReviewAdapter } = createAdapterHarness(createAdapter, { createClock });
  const repeatedNeedsReviewCandidate = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-needs-review-repeat",
    dedupeKey: "candidate-needs-review-repeat",
    status: "needs_review",
    sourceRefId: "candidate-needs-review-repeat-source",
    sourceSpan: "repeated needs review source"
  });
  for (const evidenceRef of ["evidence-needs-review-repeat-one", "evidence-needs-review-repeat-two"]) {
    const repeatedNeedsReview = await repeatedNeedsReviewAdapter.refill({
      candidates: [repeatedNeedsReviewCandidate],
      evidenceRefs: [evidenceRef],
      policyReason: "repeated needs-review cycles must remain bounded"
    });
    assert.equal(repeatedNeedsReview.ok, true);
    assert.equal(repeatedNeedsReview.value.needsReviewCandidates.length, 1);
    assert.equal(repeatedNeedsReview.value.refillJob.needsReviewCount, 1);
  }
  const repeatedNeedsReviewSnapshot = typeof repeatedNeedsReviewAdapter.snapshot === "function" ? repeatedNeedsReviewAdapter.snapshot() : null;
  if (repeatedNeedsReviewSnapshot) {
    assert.equal(repeatedNeedsReviewSnapshot.needsReviewCandidates.length, 1);
  }
  const repeatedNeedsReviewSummary = await repeatedNeedsReviewAdapter.summarize();
  assert.equal(repeatedNeedsReviewSummary.stateCounts.needsReviewCandidates, 1);
  assert.equal(repeatedNeedsReviewSummary.unsafeOrGatedWorkCount, 1);

  const { adapter: canonicalRetentionAdapter } = createAdapterHarness(createAdapter, { createClock });
  for (const candidateWorkPacketId of ["candidate-canonical-needs-review-a", "candidate-canonical-needs-review-b"]) {
    const retainedNeedsReview = await canonicalRetentionAdapter.refill({
      candidates: [
        cloneCandidate(candidate, {
          candidateWorkPacketId,
          dedupeKey: "canonical-needs-review-dedupe",
          status: "needs_review",
          sourceRefId: "canonical-needs-review-source",
          sourceSpan: "canonical needs review source"
        })
      ],
      evidenceRefs: [`evidence-${candidateWorkPacketId}`],
      policyReason: "canonical needs-review identity must ignore packet id"
    });
    assert.equal(retainedNeedsReview.ok, true);
    assert.equal(retainedNeedsReview.value.needsReviewCandidates.length, 1);
  }
  const retainedNeedsReviewSnapshot = canonicalRetentionAdapter.snapshot();
  assert.equal(retainedNeedsReviewSnapshot.needsReviewCandidates.length, 1);
  assert.equal(retainedNeedsReviewSnapshot.needsReviewCandidates[0].candidateWorkPacketId, "candidate-canonical-needs-review-b");

  const { adapter: canonicalNeedsReviewRetentionAdapter } = createAdapterHarness(createAdapter, { createClock });
  for (const candidateWorkPacketId of ["candidate-canonical-blocked-a", "candidate-canonical-blocked-b"]) {
    const retainedNeedsReview = await canonicalNeedsReviewRetentionAdapter.refill({
      candidates: [
        cloneCandidate(candidate, {
          candidateWorkPacketId,
          dedupeKey: "canonical-blocked-dedupe",
          authorityClass: "requires_preauthorization",
          sourceRefId: "canonical-blocked-source",
          sourceSpan: "canonical blocked source"
        })
      ],
      evidenceRefs: [`evidence-${candidateWorkPacketId}`],
      policyReason: "canonical preauthorization identity must ignore packet id"
    });
    assert.equal(retainedNeedsReview.ok, true);
    assert.equal(retainedNeedsReview.value.needsReviewCandidates.length, 1);
    assert.equal(retainedNeedsReview.value.blockedCandidates.length, 0);
  }
  const retainedPreauthSnapshot = canonicalNeedsReviewRetentionAdapter.snapshot();
  assert.equal(retainedPreauthSnapshot.needsReviewCandidates.length, 1);
  assert.equal(retainedPreauthSnapshot.needsReviewCandidates[0].candidateWorkPacketId, "candidate-canonical-blocked-b");

  const { adapter: dualGateAdapter } = createAdapterHarness(createAdapter, { createClock });
  const dualGateRefill = await dualGateAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-needs-review-preauth",
        dedupeKey: "candidate-needs-review-preauth",
        status: "needs_review",
        authorityClass: "requires_preauthorization",
        sourceRefId: "candidate-needs-review-preauth-source",
        sourceSpan: "needs review plus preauthorization source"
      })
    ],
    evidenceRefs: ["evidence-needs-review-preauth"],
    policyReason: "needs-review plus preauthorization must keep both accounting paths"
  });
  assert.equal(dualGateRefill.ok, true);
  assert.equal(dualGateRefill.value.queuedWorkItems.length, 0);
  assert.equal(dualGateRefill.value.needsReviewCandidates.length, 1);
  assert.equal(dualGateRefill.value.blockedCandidates.length, 0);
  assert.equal(dualGateRefill.value.refillJob.needsReviewCount, 1);
  assert.equal(dualGateRefill.value.refillJob.blockedCount, 0);
  assert.equal(dualGateRefill.value.refillJob.result, "needs_review");
  assert.equal(dualGateRefill.value.refillJob.authorityClass, "requires_preauthorization");
  assert.equal(dualGateRefill.value.events.some((event) => event.eventName === "dispatcher.review.required"), true);
  assert.equal(dualGateRefill.value.events.some((event) => event.eventName === "dispatcher.authority.blocked"), false);
  const dualGateSummary = await dualGateAdapter.summarize();
  assert.equal(dualGateSummary.currentPhase, "needs_review");
  assert.equal(dualGateSummary.stateCounts.needsReviewCandidates, 1);
  assert.equal(dualGateSummary.stateCounts.blockedCandidates, 0);
  assert.equal(dualGateSummary.unsafeOrGatedWorkCount, 1);
  assert.equal(dualGateSummary.authorityBlockedReason, null);
  assert.equal(dualGateSummary.authorityClass, "requires_preauthorization");
  assert.equal(dualGateSummary.warnings.includes("needs_review_candidates_recorded"), true);
  assert.equal(dualGateSummary.blockers.includes("dispatcher_has_needs_review_candidates"), true);
  assert.equal(dualGateSummary.rawStateLabels.includes("candidate:needs_review"), true);
  assert.equal(dualGateSummary.authorityStopReason, "needs_review");
  assert.equal(dualGateSummary.nextAction, "review_refill_candidates");
  assertMetadataOnlyEvents(dualGateRefill.value.events);

  const { adapter: mixedRefillAdapter } = createAdapterHarness(createAdapter, { createClock });
  const mixedRefill = await mixedRefillAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-mixed-allowed",
        dedupeKey: "candidate-mixed-allowed",
        sourceRefId: "candidate-mixed-allowed-source",
        sourceSpan: "mixed allowed source"
      }),
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-mixed-needs-review",
        dedupeKey: "candidate-mixed-needs-review",
        status: "needs_review",
        sourceRefId: "candidate-mixed-needs-review-source",
        sourceSpan: "mixed needs review source"
      })
    ],
    evidenceRefs: ["evidence-mixed-refill"],
    policyReason: "mixed refill batches must remain gated"
  });
  assert.equal(mixedRefill.ok, true);
  assert.equal(mixedRefill.value.queuedWorkItems.length, 1);
  assert.equal(mixedRefill.value.needsReviewCandidates.length, 1);
  assert.equal(mixedRefill.value.refillJob.queuedCount, 1);
  assert.equal(mixedRefill.value.refillJob.needsReviewCount, 1);
  assert.equal(mixedRefill.value.refillJob.result, "queued_with_gated_candidates");
  assert.equal(mixedRefill.value.refillJob.authorityClass, "block_and_record");
  const mixedSummary = await mixedRefillAdapter.summarize();
  assert.equal(mixedSummary.currentPhase, "queued");
  assert.equal(mixedSummary.nextAction, "review_refill_candidates");
  assert.equal(mixedSummary.operatorAttentionRequired, true);
  assert.equal(mixedSummary.blockers.includes("dispatcher_has_needs_review_candidates"), true);
  assert.equal(mixedSummary.authorityClass, "block_and_record");
  assert.equal(mixedSummary.authorityStopReason, "needs_review");
  assert.equal(mixedSummary.stateCounts.needsReviewCandidates, 1);
  assert.equal(mixedSummary.unsafeOrGatedWorkCount, 1);
  assertMetadataOnlyEvents(mixedRefill.value.events);

  const { adapter: queuedThenGatedAdapter } = createAdapterHarness(createAdapter, { createClock });
  const queuedFirst = await queuedThenGatedAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-queued-before-gated",
        dedupeKey: "stable-queued-before-gated",
        sourceRefId: "stable-queued-before-gated-source",
        sourceSpan: "queued before gated source"
      })
    ],
    evidenceRefs: ["evidence-queued-before-gated"],
    policyReason: "initial eligible candidate queues"
  });
  assert.equal(queuedFirst.ok, true);
  assert.equal(queuedFirst.value.queuedWorkItems.length, 1);
  const needsReviewAfterQueued = await queuedThenGatedAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-needs-review-after-queued",
        dedupeKey: "stable-queued-before-gated",
        status: "needs_review",
        sourceRefId: "stable-queued-before-gated-source",
        sourceSpan: "queued before gated source"
      })
    ],
    evidenceRefs: ["evidence-needs-review-after-queued"],
    policyReason: "later gated equivalent must remain visible"
  });
  assert.equal(needsReviewAfterQueued.ok, true);
  assert.equal(needsReviewAfterQueued.value.duplicateCandidates.length, 1);
  assert.equal(needsReviewAfterQueued.value.needsReviewCandidates.length, 1);
  assert.equal(needsReviewAfterQueued.value.refillJob.needsReviewCount, 1);
  assert.equal(needsReviewAfterQueued.value.events.some((event) => event.eventName === "dispatcher.review.required"), true);
  const needsReviewAfterQueuedSummary = await queuedThenGatedAdapter.summarize();
  assert.equal(needsReviewAfterQueuedSummary.currentPhase, "queued");
  assert.equal(needsReviewAfterQueuedSummary.stateCounts.queued, 1);
  assert.equal(needsReviewAfterQueuedSummary.safeWorkAvailableCount, 1);
  assert.equal(needsReviewAfterQueuedSummary.stateCounts.needsReviewCandidates, 1);
  assert.equal(needsReviewAfterQueuedSummary.nextAction, "review_refill_candidates");
  assert.equal(needsReviewAfterQueuedSummary.blockers.includes("dispatcher_has_needs_review_candidates"), true);
  assert.equal(needsReviewAfterQueuedSummary.warnings.includes("needs_review_candidates_recorded"), true);

  const blockedAfterQueued = await queuedThenGatedAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-blocked-after-queued",
        dedupeKey: "stable-queued-before-gated",
        authorityClass: "block_and_record",
        sourceRefId: "stable-queued-before-gated-source",
        sourceSpan: "queued before gated source"
      })
    ],
    evidenceRefs: ["evidence-blocked-after-queued"],
    policyReason: "later authority-gated equivalent must remain visible"
  });
  assert.equal(blockedAfterQueued.ok, true);
  assert.equal(blockedAfterQueued.value.duplicateCandidates.length, 0);
  assert.equal(blockedAfterQueued.value.blockedCandidates.length, 1);
  const blockedAfterQueuedSummary = await queuedThenGatedAdapter.summarize();
  assert.equal(blockedAfterQueuedSummary.currentPhase, "queued");
  assert.equal(blockedAfterQueuedSummary.stateCounts.queued, 1);
  assert.equal(blockedAfterQueuedSummary.stateCounts.blockedCandidates, 1);
  assert.equal(blockedAfterQueuedSummary.nextAction, "resolve_authority_or_source_blocker");
  assert.equal(blockedAfterQueuedSummary.blockers.includes("dispatcher_has_blocked_candidates"), true);

  const { adapter: longSummaryAdapter } = createAdapterHarness(createAdapter, { createClock });
  const longCandidateId = `candidate-${"x".repeat(400)}`;
  const longSummaryRefill = await longSummaryAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: longCandidateId,
        dedupeKey: "candidate-long-summary",
        status: "needs_review"
      })
    ],
    evidenceRefs: ["evidence-long-summary"],
    policyReason: "long candidate identifiers must not create unbounded event summaries"
  });
  assert.equal(longSummaryRefill.ok, true);
  assert.equal(longSummaryRefill.value.queuedWorkItems.length, 0);
  assert.equal(longSummaryRefill.value.refillJob.needsReviewCount, 1);
  assert.equal(longSummaryRefill.value.refillJob.result, "needs_review");
  assert.equal(
    longSummaryRefill.value.events.every((event) => event.payloadSummary.length <= 240),
    true
  );
  assertMetadataOnlyEvents(longSummaryRefill.value.events);

  const { adapter: dedupeAdapter } = createAdapterHarness(createAdapter, { createClock });
  const blocked = await dedupeAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-blocked-first",
        dedupeKey: "stable-blocked-dedupe",
        authorityClass: "block_and_record",
        sourceRefId: "stable-blocked-source",
        sourceSpan: "stable blocked duplicate source"
      })
    ],
    evidenceRefs: ["evidence-blocked-first"],
    policyReason: "blocked candidate must not reserve dedupe"
  });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.value.queuedWorkItems.length, 0);
  assert.equal(blocked.value.blockedCandidates.length, 1);
  assert.equal(blocked.value.refillJob.result, "blocked");
  const allowedClone = await dedupeAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-allowed-later",
        dedupeKey: "stable-blocked-dedupe",
        sourceRefId: "stable-blocked-source",
        sourceSpan: "stable blocked duplicate source"
      })
    ],
    evidenceRefs: ["evidence-allowed-later"],
    policyReason: "later allowed candidate should queue after prior blocked candidate"
  });
  assert.equal(allowedClone.ok, true);
  assert.equal(allowedClone.value.queuedWorkItems.length, 1);
  assert.equal(allowedClone.value.duplicateCandidates.length, 0);
  assert.equal(allowedClone.value.events.some((event) => event.eventName === "dispatcher.work.queued"), true);
  assertMetadataOnlyEvents(allowedClone.value.events);
  const resolvedBlockedSummary = await dedupeAdapter.summarize();
  assert.equal(resolvedBlockedSummary.stateCounts.blockedCandidates, 0);
  assert.equal(resolvedBlockedSummary.operatorAttentionRequired, false);
  assert.equal(resolvedBlockedSummary.authorityStopReason, null);
  assert.equal(resolvedBlockedSummary.blockers.includes("dispatcher_has_blocked_candidates"), false);
  assert.equal(resolvedBlockedSummary.warnings.includes("authority_blocked_candidates_recorded"), false);

  const { adapter: needsReviewDedupeAdapter } = createAdapterHarness(createAdapter, { createClock });
  const needsReview = await needsReviewDedupeAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-needs-review-first",
        dedupeKey: "stable-needs-review-dedupe",
        status: "needs_review",
        sourceRefId: "stable-needs-review-source",
        sourceSpan: "stable needs review duplicate source"
      })
    ],
    evidenceRefs: ["evidence-needs-review-first"],
    policyReason: "needs-review candidate must not reserve dedupe"
  });
  assert.equal(needsReview.ok, true);
  assert.equal(needsReview.value.queuedWorkItems.length, 0);
  assert.equal(needsReview.value.needsReviewCandidates.length, 1);
  assert.equal(needsReview.value.refillJob.result, "needs_review");
  const eligibleAfterNeedsReview = await needsReviewDedupeAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-eligible-after-needs-review",
        dedupeKey: "stable-needs-review-dedupe",
        sourceRefId: "stable-needs-review-source",
        sourceSpan: "stable needs review duplicate source"
      })
    ],
    evidenceRefs: ["evidence-eligible-after-needs-review"],
    policyReason: "later eligible candidate should queue after prior needs-review candidate"
  });
  assert.equal(eligibleAfterNeedsReview.ok, true);
  assert.equal(eligibleAfterNeedsReview.value.queuedWorkItems.length, 1);
  assert.equal(eligibleAfterNeedsReview.value.duplicateCandidates.length, 0);
  assertMetadataOnlyEvents(eligibleAfterNeedsReview.value.events);
  const resolvedNeedsReviewSummary = await needsReviewDedupeAdapter.summarize();
  assert.equal(resolvedNeedsReviewSummary.stateCounts.needsReviewCandidates, 0);
  assert.equal(resolvedNeedsReviewSummary.operatorAttentionRequired, false);
  assert.equal(resolvedNeedsReviewSummary.authorityStopReason, null);
  assert.equal(resolvedNeedsReviewSummary.blockers.includes("dispatcher_has_needs_review_candidates"), false);
  assert.equal(resolvedNeedsReviewSummary.warnings.includes("needs_review_candidates_recorded"), false);

  const { adapter: sameBatchSupersedeAdapter } = createAdapterHarness(createAdapter, { createClock });
  const sameBatchSupersede = await sameBatchSupersedeAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-same-batch-blocked-first",
        dedupeKey: "same-batch-supersede-dedupe",
        authorityClass: "requires_preauthorization",
        sourceRefId: "same-batch-supersede-source",
        sourceSpan: "same batch supersede source"
      }),
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-same-batch-eligible-second",
        dedupeKey: "same-batch-supersede-dedupe",
        sourceRefId: "same-batch-supersede-source",
        sourceSpan: "same batch supersede source"
      })
    ],
    evidenceRefs: ["evidence-same-batch-supersede"],
    policyReason: "eligible equivalent in same batch supersedes stale gated record"
  });
  assert.equal(sameBatchSupersede.ok, true);
  assert.equal(sameBatchSupersede.value.queuedWorkItems.length, 1);
  assert.equal(sameBatchSupersede.value.blockedCandidates.length, 0);
  assert.equal(sameBatchSupersede.value.needsReviewCandidates.length, 0);
  assert.equal(sameBatchSupersede.value.refillJob.result, "queued_work");
  const sameBatchSupersedeSummary = await sameBatchSupersedeAdapter.summarize();
  assert.equal(sameBatchSupersedeSummary.stateCounts.blockedCandidates, 0);
  assert.equal(sameBatchSupersedeSummary.operatorAttentionRequired, false);

  const { adapter: closeoutAdapter } = createAdapterHarness(createAdapter, { createClock });
  const closeoutRefill = await closeoutAdapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-closeout-metadata-refill"],
    policyReason: "closeout metadata validation"
  });
  assert.equal(closeoutRefill.ok, true);
  const claim = await closeoutAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-closeout-metadata-claim"] });
  assert.equal(claim.ok, true);
  const closeoutInput = {
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-closeout-metadata"]
  };
  await assertInvalidInputResult(
    () => closeoutAdapter.complete({ ...closeoutInput, resultSummary: { rawProviderPayload: "must-not-retain" } }),
    "complete object resultSummary"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.fail({ ...closeoutInput, failureReason: { rawProviderPayload: "must-not-retain" } }),
    "fail object failureReason"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.complete({ ...closeoutInput, resultSummary: "x".repeat(1000) }),
    "complete oversized resultSummary"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.fail({ ...closeoutInput, failureReason: "rawProviderPayload secret marker must-not-retain" }),
    "fail raw provider failureReason"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.complete({ ...closeoutInput, resultSummary: "OPENAI_API_KEY=must-not-retain" }),
    "complete env-style resultSummary"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.fail({ ...closeoutInput, failureReason: "refresh_token=must-not-retain" }),
    "fail env-style failureReason"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.complete({ ...closeoutInput, resultSummary: "provider=openai response_id=resp_123" }),
    "complete provider-like resultSummary"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.fail({ ...closeoutInput, failureReason: "providerMetadata: model=openai response_id=resp_456" }),
    "fail provider-like failureReason"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.complete({ ...closeoutInput, resultSummary: "api_key=abc123 must not be retained" }),
    "complete api key resultSummary"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.fail({ ...closeoutInput, failureReason: "Authorization: Bearer abc123 must not be retained" }),
    "fail authorization bearer failureReason"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.complete({ ...closeoutInput, resultSummary: "password=abc123 must not be retained" }),
    "complete password resultSummary"
  );
  await assertInvalidInputResult(
    () => closeoutAdapter.fail({ ...closeoutInput, failureReason: "sk-1234567890abcdef must not be retained" }),
    "fail sk key failureReason"
  );

  const { adapter: nullCompleteAdapter } = createAdapterHarness(createAdapter, { createClock });
  const nullCompleteRefill = await nullCompleteAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-null-complete",
        dedupeKey: "candidate-null-complete"
      })
    ],
    evidenceRefs: ["evidence-null-complete-refill"],
    policyReason: "explicit null result summary should use default completion summary"
  });
  assert.equal(nullCompleteRefill.ok, true);
  const nullCompleteClaim = await nullCompleteAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-null-complete-claim"] });
  assert.equal(nullCompleteClaim.ok, true);
  const nullCompleteHeartbeat = await nullCompleteAdapter.heartbeat({
    leaseId: nullCompleteClaim.value.lease.leaseId,
    workerId: nullCompleteClaim.value.lease.workerId,
    attemptId: nullCompleteClaim.value.lease.attemptId,
    idempotencyKey: nullCompleteClaim.value.lease.idempotencyKey,
    authorityDecisionId: nullCompleteClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-null-complete-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(nullCompleteHeartbeat.ok, true);
  const nullComplete = await nullCompleteAdapter.complete({
    leaseId: nullCompleteClaim.value.lease.leaseId,
    workerId: nullCompleteClaim.value.lease.workerId,
    attemptId: nullCompleteClaim.value.lease.attemptId,
    idempotencyKey: nullCompleteClaim.value.lease.idempotencyKey,
    authorityDecisionId: nullCompleteClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-null-complete"],
    resultSummary: null
  });
  assert.equal(nullComplete.ok, true);
  assert.equal(nullComplete.value.executionAttempt.resultSummary, "completed");
  assertMetadataOnlyEvents(nullComplete.value.events);

  const { adapter: nullFailAdapter } = createAdapterHarness(createAdapter, { createClock });
  const nullFailRefill = await nullFailAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-null-fail",
        dedupeKey: "candidate-null-fail"
      })
    ],
    evidenceRefs: ["evidence-null-fail-refill"],
    policyReason: "explicit null failure reason should use default failure reason"
  });
  assert.equal(nullFailRefill.ok, true);
  const nullFailClaim = await nullFailAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-null-fail-claim"] });
  assert.equal(nullFailClaim.ok, true);
  const nullFailHeartbeat = await nullFailAdapter.heartbeat({
    leaseId: nullFailClaim.value.lease.leaseId,
    workerId: nullFailClaim.value.lease.workerId,
    attemptId: nullFailClaim.value.lease.attemptId,
    idempotencyKey: nullFailClaim.value.lease.idempotencyKey,
    authorityDecisionId: nullFailClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-null-fail-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(nullFailHeartbeat.ok, true);
  const nullFail = await nullFailAdapter.fail({
    leaseId: nullFailClaim.value.lease.leaseId,
    workerId: nullFailClaim.value.lease.workerId,
    attemptId: nullFailClaim.value.lease.attemptId,
    idempotencyKey: nullFailClaim.value.lease.idempotencyKey,
    authorityDecisionId: nullFailClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-null-fail"],
    failureReason: null
  });
  assert.equal(nullFail.ok, true);
  assert.equal(nullFail.value.executionAttempt.failureReason, "failed");
  assertMetadataOnlyEvents(nullFail.value.events);
}

async function assertHappyPathConformance(createAdapter, { candidate, createClock }) {
  const { adapter } = createAdapterHarness(createAdapter, { createClock });

  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 1);
  assert.equal(refill.value.duplicateCandidates.length, 0);
  assert.equal(refill.value.events.at(-1).eventName, "dispatcher.refill.completed");
  assertMetadataOnlyEvents(refill.value.events);

  const duplicateRefill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill-duplicate"],
    policyReason: "fixture-backed safe source duplicate"
  });
  assert.equal(duplicateRefill.ok, true);
  assert.equal(duplicateRefill.value.queuedWorkItems.length, 0);
  assert.equal(duplicateRefill.value.duplicateCandidates.length, 1);
  assert.equal(duplicateRefill.value.events.some((event) => event.eventName === "dispatcher.progress.observed"), true);
  assertMetadataOnlyEvents(duplicateRefill.value.events);

  const claim = await adapter.claim({
    workerId: "worker-1",
    evidenceRefs: ["evidence-claim"]
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.value.workItem.status, "leased");
  assert.equal(claim.value.lease.workerId, "worker-1");
  assert.equal(claim.value.executionAttempt.state, "running");
  assertMetadataOnlyEvents(claim.value.events);

  const repeatedClaim = await adapter.claim({
    workerId: "worker-2",
    evidenceRefs: ["evidence-repeat-claim"]
  });
  assert.equal(repeatedClaim.ok, false);
  assert.equal(repeatedClaim.code, "no_work");

  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.value.lease.state, "running");
  assert.equal(heartbeat.value.workItem.status, "running");
  assertMetadataOnlyEvents(heartbeat.value.events);

  const staleHeartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-2",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-stale-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(staleHeartbeat.ok, false);
  assert.equal(staleHeartbeat.code, "stale_lease");

  const invalidTtl = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-invalid-ttl"],
    ttlMs: -1
  });
  assert.equal(invalidTtl.ok, false);
  assert.equal(invalidTtl.code, "invalid_input");

  const complete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-complete"],
    resultSummary: "fake worker completed proof lease"
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.value.workItem.status, "completed");
  assert.equal(complete.value.lease.state, "completed");
  assert.equal(complete.value.executionAttempt.state, "completed");
  assert.equal(complete.value.events.at(-1).eventName, "dispatcher.attempt.completed");
  assertMetadataOnlyEvents(complete.value.events);
  assertMetadataOnlyEvidenceRecords(complete.value.evidenceRecords);

  const repeatedComplete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-repeat-complete"],
    resultSummary: "repeat completion should not duplicate terminal work"
  });
  assert.equal(repeatedComplete.ok, false);
  assert.equal(repeatedComplete.code, "terminal_state");

  const terminalHeartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-terminal-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(terminalHeartbeat.ok, false);
  assert.equal(terminalHeartbeat.code, "terminal_state");

  const summary = await adapter.summarize();
  assert.equal(summary.currentPhase, "completed");
  assert.equal(summary.stateSource, "fixture");
  assert.equal(summary.safeWorkAvailableCount, 0);
  assert.deepEqual(summary.activeWorkItemIds, []);
  assert.equal(summary.warnings.includes("backend_proof_simulated_no_live_worker_execution"), true);
}

async function assertEvidenceAndStaleLeaseConformance(createAdapter, { candidate, createClock }) {
  const { adapter } = createAdapterHarness(createAdapter, { createClock });

  const missingRefillEvidence = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: [],
    policyReason: "missing evidence must block refill"
  });
  assert.equal(missingRefillEvidence.ok, false);
  assert.equal(missingRefillEvidence.code, "missing_evidence");

  const blankRefillEvidence = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: [" "],
    policyReason: "blank evidence must block refill"
  });
  assert.equal(blankRefillEvidence.ok, false);
  assert.equal(blankRefillEvidence.code, "missing_evidence");

  const missingPolicyReason = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: " "
  });
  assert.equal(missingPolicyReason.ok, false);
  assert.equal(missingPolicyReason.code, "invalid_input");

  const missingClaimEvidence = await adapter.claim({
    workerId: "worker-1",
    evidenceRefs: []
  });
  assert.equal(missingClaimEvidence.ok, false);
  assert.equal(missingClaimEvidence.code, "missing_evidence");

  const blankClaimEvidence = await adapter.claim({
    workerId: "worker-1",
    evidenceRefs: [" "]
  });
  assert.equal(blankClaimEvidence.ok, false);
  assert.equal(blankClaimEvidence.code, "missing_evidence");

  const missingWorker = await adapter.claim({
    workerId: "",
    evidenceRefs: ["evidence-claim"]
  });
  assert.equal(missingWorker.ok, false);
  assert.equal(missingWorker.code, "invalid_input");

  const whitespaceWorker = await adapter.claim({
    workerId: " ",
    evidenceRefs: ["evidence-claim"]
  });
  assert.equal(whitespaceWorker.ok, false);
  assert.equal(whitespaceWorker.code, "invalid_input");

  const noWork = await adapter.claim({
    workerId: "worker-1",
    evidenceRefs: ["evidence-empty-claim"]
  });
  assert.equal(noWork.ok, false);
  assert.equal(noWork.code, "no_work");

  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill-for-lease-validation"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({
    workerId: "worker-1",
    evidenceRefs: ["evidence-claim-for-lease-validation"]
  });
  assert.equal(claim.ok, true);

  const missingHeartbeatEvidence = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [],
    ttlMs: 300_000
  });
  assert.equal(missingHeartbeatEvidence.ok, false);
  assert.equal(missingHeartbeatEvidence.code, "missing_evidence");

  const blankHeartbeatEvidence = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [" "],
    ttlMs: 300_000
  });
  assert.equal(blankHeartbeatEvidence.ok, false);
  assert.equal(blankHeartbeatEvidence.code, "missing_evidence");

  const whitespaceHeartbeatWorker = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: " ",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-whitespace-heartbeat-worker"],
    ttlMs: 300_000
  });
  assert.equal(whitespaceHeartbeatWorker.ok, false);
  assert.equal(whitespaceHeartbeatWorker.code, "invalid_input");

  const missingCompleteEvidence = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [],
    resultSummary: "should not complete"
  });
  assert.equal(missingCompleteEvidence.ok, false);
  assert.equal(missingCompleteEvidence.code, "missing_evidence");

  const blankCompleteEvidence = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [" "],
    resultSummary: "should not complete"
  });
  assert.equal(blankCompleteEvidence.ok, false);
  assert.equal(blankCompleteEvidence.code, "missing_evidence");

  const whitespaceCompleteWorker = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: " ",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-whitespace-complete-worker"],
    resultSummary: "should not complete"
  });
  assert.equal(whitespaceCompleteWorker.ok, false);
  assert.equal(whitespaceCompleteWorker.code, "invalid_input");

  const missingFailEvidence = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [],
    failureReason: "should not fail"
  });
  assert.equal(missingFailEvidence.ok, false);
  assert.equal(missingFailEvidence.code, "missing_evidence");

  const blankFailEvidence = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [" "],
    failureReason: "should not fail"
  });
  assert.equal(blankFailEvidence.ok, false);
  assert.equal(blankFailEvidence.code, "missing_evidence");

  const whitespaceFailWorker = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: " ",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-whitespace-fail-worker"],
    failureReason: "should not fail"
  });
  assert.equal(whitespaceFailWorker.ok, false);
  assert.equal(whitespaceFailWorker.code, "invalid_input");

  const unknownHeartbeat = await adapter.heartbeat({
    leaseId: "lease-missing",
    workerId: "worker-1",
    attemptId: "attempt-missing",
    idempotencyKey: "idempotency-missing",
    authorityDecisionId: "authority-missing",
    evidenceRefs: ["evidence-unknown-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(unknownHeartbeat.ok, false);
  assert.equal(unknownHeartbeat.code, "stale_lease");

  const unknownComplete = await adapter.complete({
    leaseId: "lease-missing",
    workerId: "worker-1",
    attemptId: "attempt-missing",
    idempotencyKey: "idempotency-missing",
    authorityDecisionId: "authority-missing",
    evidenceRefs: ["evidence-unknown-complete"],
    resultSummary: "should not complete"
  });
  assert.equal(unknownComplete.ok, false);
  assert.equal(unknownComplete.code, "stale_lease");

  const unknownFail = await adapter.fail({
    leaseId: "lease-missing",
    workerId: "worker-1",
    attemptId: "attempt-missing",
    idempotencyKey: "idempotency-missing",
    authorityDecisionId: "authority-missing",
    evidenceRefs: ["evidence-unknown-fail"],
    failureReason: "should not fail"
  });
  assert.equal(unknownFail.ok, false);
  assert.equal(unknownFail.code, "stale_lease");

  const missingRecoveryEvidence = await adapter.recoverExpiredLeases({ evidenceRefs: [] });
  assert.equal(missingRecoveryEvidence.ok, false);
  assert.equal(missingRecoveryEvidence.code, "missing_evidence");

  const blankRecoveryEvidence = await adapter.recoverExpiredLeases({ evidenceRefs: [" "] });
  assert.equal(blankRecoveryEvidence.ok, false);
  assert.equal(blankRecoveryEvidence.code, "missing_evidence");
}

async function assertHeartbeatFenceConformance(createAdapter, { candidate, createClock }) {
  const { adapter: ttlAdapter, clock } = createAdapterHarness(createAdapter, { createClock, leaseTtlMs: 60_000 });
  const ttlRefill = await ttlAdapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-heartbeat-ttl-renewal",
        dedupeKey: "candidate-heartbeat-ttl-renewal"
      })
    ],
    evidenceRefs: ["evidence-refill-heartbeat-ttl-renewal"],
    policyReason: "fixture-backed heartbeat ttl renewal source"
  });
  assert.equal(ttlRefill.ok, true);
  const ttlClaim = await ttlAdapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-heartbeat-ttl-renewal"] });
  assert.equal(ttlClaim.ok, true);
  const originalExpiresAt = ttlClaim.value.lease.expiresAt;
  assert.equal(originalExpiresAt, "2026-06-30T00:01:00.000Z");
  clock.advanceMs(30_000);
  const ttlHeartbeat = await ttlAdapter.heartbeat({
    leaseId: ttlClaim.value.lease.leaseId,
    workerId: ttlClaim.value.lease.workerId,
    attemptId: ttlClaim.value.lease.attemptId,
    idempotencyKey: ttlClaim.value.lease.idempotencyKey,
    authorityDecisionId: ttlClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat-ttl-renewal"],
    ttlMs: 120_000
  });
  assert.equal(ttlHeartbeat.ok, true);
  assert.equal(ttlHeartbeat.value.lease.expiresAt, "2026-06-30T00:02:30.000Z");
  assert.notEqual(ttlHeartbeat.value.lease.expiresAt, originalExpiresAt);

  for (const field of ["workerId", "attemptId", "idempotencyKey", "authorityDecisionId"]) {
    const { adapter } = createAdapterHarness(createAdapter, { createClock });
    const refill = await adapter.refill({
      candidates: [candidate],
      evidenceRefs: [`evidence-refill-heartbeat-fence-${field}`],
      policyReason: "fixture-backed heartbeat fence source"
    });
    assert.equal(refill.ok, true);
    const claim = await adapter.claim({
      workerId: "worker-1",
      evidenceRefs: [`evidence-claim-heartbeat-fence-${field}`]
    });
    assert.equal(claim.ok, true);

    const input = {
      leaseId: claim.value.lease.leaseId,
      workerId: claim.value.lease.workerId,
      attemptId: claim.value.lease.attemptId,
      idempotencyKey: claim.value.lease.idempotencyKey,
      authorityDecisionId: claim.value.lease.authorityDecisionId,
      evidenceRefs: [`evidence-heartbeat-fence-${field}`],
      ttlMs: 300_000
    };
    input[field] = `${input[field]}-mismatch`;

    const result = await adapter.heartbeat(input);
    assert.equal(result.ok, false, `heartbeat with mismatched ${field} must fail`);
    assert.equal(result.code, "stale_lease", `heartbeat with mismatched ${field} must report stale lease`);
  }

  const heartbeatCrossReplay = await createTwoLeaseHarness(createAdapter, { candidate, createClock, scenario: "heartbeat-cross-replay" });
  const crossHeartbeat = await heartbeatCrossReplay.adapter.heartbeat({
    leaseId: heartbeatCrossReplay.first.leaseId,
    workerId: heartbeatCrossReplay.first.workerId,
    attemptId: heartbeatCrossReplay.second.attemptId,
    idempotencyKey: heartbeatCrossReplay.second.idempotencyKey,
    authorityDecisionId: heartbeatCrossReplay.second.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat-cross-replay"],
    ttlMs: 300_000
  });
  assert.equal(crossHeartbeat.ok, false, "heartbeat must reject a valid lease id paired with another valid attempt tuple");
  assert.equal(crossHeartbeat.code, "stale_lease");
}

async function assertCloseoutFenceConformance(createAdapter, { candidate, createClock }) {
  for (const outcome of ["complete", "fail"]) {
    for (const field of ["workerId", "attemptId", "idempotencyKey", "authorityDecisionId"]) {
      const { adapter } = createAdapterHarness(createAdapter, { createClock });
      const refill = await adapter.refill({
        candidates: [candidate],
        evidenceRefs: [`evidence-refill-fence-${outcome}-${field}`],
        policyReason: "fixture-backed fence source"
      });
      assert.equal(refill.ok, true);
      const claim = await adapter.claim({
        workerId: "worker-1",
        evidenceRefs: [`evidence-claim-fence-${outcome}-${field}`]
      });
      assert.equal(claim.ok, true);
      const heartbeat = await adapter.heartbeat({
        leaseId: claim.value.lease.leaseId,
        workerId: claim.value.lease.workerId,
        attemptId: claim.value.lease.attemptId,
        idempotencyKey: claim.value.lease.idempotencyKey,
        authorityDecisionId: claim.value.lease.authorityDecisionId,
        evidenceRefs: [`evidence-heartbeat-fence-${outcome}-${field}`],
        ttlMs: 300_000
      });
      assert.equal(heartbeat.ok, true);

      const input = {
        leaseId: claim.value.lease.leaseId,
        workerId: claim.value.lease.workerId,
        attemptId: claim.value.lease.attemptId,
        idempotencyKey: claim.value.lease.idempotencyKey,
        authorityDecisionId: claim.value.lease.authorityDecisionId,
        evidenceRefs: [`evidence-${outcome}-fence-${field}`],
        resultSummary: "should not complete with stale fence",
        failureReason: "should not fail with stale fence"
      };
      input[field] = `${input[field]}-mismatch`;

      const result = outcome === "complete"
        ? await adapter.complete(input)
        : await adapter.fail(input);
      assert.equal(result.ok, false, `${outcome} with mismatched ${field} must fail`);
      assert.equal(result.code, "stale_lease", `${outcome} with mismatched ${field} must report stale lease`);
    }
  }

  for (const outcome of ["complete", "fail"]) {
    const harness = await createTwoLeaseHarness(createAdapter, { candidate, createClock, scenario: `${outcome}-cross-replay` });
    const heartbeat = await harness.adapter.heartbeat({
      leaseId: harness.first.leaseId,
      workerId: harness.first.workerId,
      attemptId: harness.first.attemptId,
      idempotencyKey: harness.first.idempotencyKey,
      authorityDecisionId: harness.first.authorityDecisionId,
      evidenceRefs: [`evidence-${outcome}-cross-replay-heartbeat`],
      ttlMs: 300_000
    });
    assert.equal(heartbeat.ok, true);
    const result = await harness.adapter[outcome]({
      leaseId: harness.first.leaseId,
      workerId: harness.first.workerId,
      attemptId: harness.second.attemptId,
      idempotencyKey: harness.second.idempotencyKey,
      authorityDecisionId: harness.second.authorityDecisionId,
      evidenceRefs: [`evidence-${outcome}-cross-replay`],
      resultSummary: "should not complete with another valid attempt tuple",
      failureReason: "should not fail with another valid attempt tuple"
    });
    assert.equal(result.ok, false, `${outcome} must reject a valid lease id paired with another valid attempt tuple`);
    assert.equal(result.code, "stale_lease");
  }
}

async function assertTimeoutRetryAndRecoveryConformance(createAdapter, { candidate, createClock }) {
  const { adapter, clock } = createAdapterHarness(createAdapter, {
    createClock,
    leaseTtlMs: 60_000,
    maxAttempts: 2
  });
  assert.equal(typeof clock?.advanceMs, "function", "contract timeout scenario requires an advanceable manual clock");

  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill-timeout"],
    policyReason: "fixture-backed timeout source"
  });
  assert.equal(refill.ok, true);

  const firstClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-timeout"] });
  assert.equal(firstClaim.ok, true);

  clock.advanceMs(60_000);
  const boundaryHeartbeat = await adapter.heartbeat({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: firstClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-boundary-heartbeat"],
    ttlMs: 60_000
  });
  assert.equal(boundaryHeartbeat.ok, true);
  assert.equal(boundaryHeartbeat.value.lease.state, "running");

  const boundaryRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-boundary-recovery"] });
  assert.equal(boundaryRecovery.ok, true);
  assert.equal(boundaryRecovery.value.expiredLeases.length, 0);
  assert.equal(boundaryRecovery.value.recoveredWorkItems.length, 0);

  clock.advanceMs(60_001);
  const lateHeartbeat = await adapter.heartbeat({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: firstClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-late-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(lateHeartbeat.ok, false);
  assert.equal(lateHeartbeat.code, "lease_expired");

  const lateComplete = await adapter.complete({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: firstClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-late-complete"],
    resultSummary: "should not complete after expiry"
  });
  assert.equal(lateComplete.ok, false);
  assert.equal(lateComplete.code, "lease_expired");

  const lateFail = await adapter.fail({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: firstClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-late-fail"],
    failureReason: "should not fail after expiry"
  });
  assert.equal(lateFail.ok, false);
  assert.equal(lateFail.code, "lease_expired");

  const firstRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-recover-expired"] });
  assert.equal(firstRecovery.ok, true);
  assert.equal(firstRecovery.value.expiredLeases.length, 1);
  assert.equal(firstRecovery.value.expiredLeases[0].state, "expired");
  assert.equal(firstRecovery.value.recoveredWorkItems.length, 1);
  assert.equal(firstRecovery.value.recoveredWorkItems[0].status, "queued");
  assert.equal(firstRecovery.value.events.some((event) => event.eventName === "dispatcher.lease.expired"), true);
  assert.equal(firstRecovery.value.events.some((event) => event.eventName === "dispatcher.recovery.attempted"), true);
  assertMetadataOnlyEvents(firstRecovery.value.events);

  const secondClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-retry"] });
  assert.equal(secondClaim.ok, true);
  clock.advanceMs(60_001);

  const exhaustedRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-recover-exhausted"] });
  assert.equal(exhaustedRecovery.ok, true);
  assert.equal(exhaustedRecovery.value.expiredLeases.length, 1);
  assert.equal(exhaustedRecovery.value.recoveredWorkItems.length, 1);
  assert.equal(exhaustedRecovery.value.recoveredWorkItems[0].status, "quarantined");
  assertMetadataOnlyEvents(exhaustedRecovery.value.events);

  const summary = await adapter.summarize();
  assert.equal(summary.stateCounts.quarantined, 1);
  assert.equal(summary.rawStateLabels.includes("work:quarantined"), true);
  assert.equal(summary.operatorAttentionRequired, true);
}

async function assertFailedWorkRecoveryConformance(createAdapter, { candidate, createClock }) {
  const { adapter } = createAdapterHarness(createAdapter, {
    createClock,
    maxAttempts: 2
  });
  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill-failed-recovery"],
    policyReason: "fixture-backed failed recovery source"
  });
  assert.equal(refill.ok, true);

  const firstClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-failed-recovery"] });
  assert.equal(firstClaim.ok, true);
  const firstHeartbeat = await adapter.heartbeat({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: firstClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat-failed-recovery"],
    ttlMs: 300_000
  });
  assert.equal(firstHeartbeat.ok, true);
  const firstFail = await adapter.fail({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: firstClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-fail-retryable"],
    failureReason: "fixture retryable failure"
  });
  assert.equal(firstFail.ok, true);
  assert.equal(firstFail.value.workItem.status, "failed");
  assertMetadataOnlyEvents(firstFail.value.events);
  assertMetadataOnlyEvidenceRecords(firstFail.value.evidenceRecords);

  const needsReviewWhileFailed = await adapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-needs-review-while-failed",
        dedupeKey: "candidate-needs-review-while-failed",
        status: "needs_review",
        sourceRefId: "candidate-needs-review-while-failed-source",
        sourceSpan: "needs review while failed source"
      })
    ],
    evidenceRefs: ["evidence-needs-review-while-failed"],
    policyReason: "failed work recovery must remain the next action priority"
  });
  assert.equal(needsReviewWhileFailed.ok, true);
  const failedWithReviewSummary = await adapter.summarize();
  assert.equal(failedWithReviewSummary.currentPhase, "failed");
  assert.equal(failedWithReviewSummary.nextAction, "run_recovery");
  assert.equal(failedWithReviewSummary.blockers.includes("dispatcher_has_needs_review_candidates"), true);
  assert.equal(failedWithReviewSummary.warnings.includes("needs_review_candidates_recorded"), true);

  const retryRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-failed-retry-recovery"] });
  assert.equal(retryRecovery.ok, true);
  assert.equal(retryRecovery.value.expiredLeases.length, 0);
  assert.equal(retryRecovery.value.recoveredWorkItems.length, 1);
  assert.equal(retryRecovery.value.recoveredWorkItems[0].status, "queued");
  assertMetadataOnlyEvents(retryRecovery.value.events);

  const secondClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-failed-quarantine"] });
  assert.equal(secondClaim.ok, true);
  const secondHeartbeat = await adapter.heartbeat({
    leaseId: secondClaim.value.lease.leaseId,
    workerId: secondClaim.value.lease.workerId,
    attemptId: secondClaim.value.lease.attemptId,
    idempotencyKey: secondClaim.value.lease.idempotencyKey,
    authorityDecisionId: secondClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat-failed-quarantine"],
    ttlMs: 300_000
  });
  assert.equal(secondHeartbeat.ok, true);
  const secondFail = await adapter.fail({
    leaseId: secondClaim.value.lease.leaseId,
    workerId: secondClaim.value.lease.workerId,
    attemptId: secondClaim.value.lease.attemptId,
    idempotencyKey: secondClaim.value.lease.idempotencyKey,
    authorityDecisionId: secondClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-fail-quarantine"],
    failureReason: "fixture retry exhaustion"
  });
  assert.equal(secondFail.ok, true);

  const exhaustedRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-failed-quarantine-recovery"] });
  assert.equal(exhaustedRecovery.ok, true);
  assert.equal(exhaustedRecovery.value.expiredLeases.length, 0);
  assert.equal(exhaustedRecovery.value.recoveredWorkItems.length, 1);
  assert.equal(exhaustedRecovery.value.recoveredWorkItems[0].status, "quarantined");
  assertMetadataOnlyEvents(exhaustedRecovery.value.events);
}

async function assertAuthorityDuplicateAndEvidenceConformance(createAdapter, { candidate, createClock }) {
  const { adapter } = createAdapterHarness(createAdapter, { createClock });
  const duplicateOne = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-duplicate-contract-a",
    dedupeKey: "candidate-duplicate-contract",
    sourceRefId: "candidate-duplicate-contract-source",
    sourceSpan: "duplicate contract source"
  });
  const duplicateTwo = cloneCandidate(candidate, {
    candidateWorkPacketId: "candidate-duplicate-contract-b",
    dedupeKey: "candidate-duplicate-contract",
    sourceRefId: "candidate-duplicate-contract-source",
    sourceSpan: "duplicate contract source",
    acceptanceCriteria: duplicateOne.acceptanceCriteria,
    dependencyHints: duplicateOne.dependencyHints
  });

  const duplicateRefill = await adapter.refill({
    candidates: [duplicateOne, duplicateTwo],
    evidenceRefs: ["evidence-duplicate-contract"],
    policyReason: "fixture-backed duplicate source"
  });
  assert.equal(duplicateRefill.ok, true);
  assert.equal(duplicateRefill.value.queuedWorkItems.length, 1);
  assert.equal(duplicateRefill.value.duplicateCandidates.length, 1);
  assert.equal(duplicateRefill.value.duplicateCandidates[0].candidateWorkPacketId, "candidate-duplicate-contract-b");
  assert.equal(duplicateRefill.value.events.some((event) => event.eventName === "dispatcher.progress.observed"), true);
  assertMetadataOnlyEvents(duplicateRefill.value.events);

  const gated = await adapter.refill({
    candidates: [
      cloneCandidate(candidate, {
        candidateWorkPacketId: "candidate-gated-contract",
        authorityClass: "requires_preauthorization",
        dedupeKey: "candidate-gated-contract"
      })
    ],
    evidenceRefs: ["evidence-gated-contract"],
    policyReason: "gated authority candidate should not queue"
  });
  assert.equal(gated.ok, true);
  assert.equal(gated.value.queuedWorkItems.length, 0);
  assert.equal(gated.value.needsReviewCandidates.length, 1);
  assert.equal(gated.value.blockedCandidates.length, 0);
  assert.equal(gated.value.events.some((event) => event.eventName === "dispatcher.review.required"), true);
  assert.equal(gated.value.events.some((event) => event.eventName === "dispatcher.authority.blocked"), false);
  assertMetadataOnlyEvents(gated.value.events);

  const summary = await adapter.summarize();
  assert.equal(summary.stateCounts.queued, 1);
  assert.equal(summary.stateCounts.needsReviewCandidates, 1);
  assert.equal(summary.stateCounts.blockedCandidates, 0);
  assert.equal(summary.stateCounts.duplicateCandidates, 1);
  assert.equal(summary.authorityClass, "requires_preauthorization");
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.warnings.includes("duplicate_candidates_ignored"), true);
  assert.equal(summary.warnings.includes("needs_review_candidates_recorded"), true);
}

function createAdapterHarness(createAdapter, { createClock, ...options } = {}) {
  const clock = options.clock ?? createClock?.();
  return {
    adapter: createAdapter({ ...options, clock }),
    clock
  };
}

async function createTwoLeaseHarness(createAdapter, { candidate, createClock, scenario }) {
  const { adapter } = createAdapterHarness(createAdapter, { createClock });
  const secondCandidate = cloneCandidate(candidate, {
    candidateWorkPacketId: `candidate-${scenario}-second`,
    dedupeKey: `candidate-${scenario}-second`,
    sourceRefId: `candidate-${scenario}-second-source`,
    sourceSpan: `${scenario} second source`
  });
  const refill = await adapter.refill({
    candidates: [cloneCandidate(candidate, {
      candidateWorkPacketId: `candidate-${scenario}-first`,
      dedupeKey: `candidate-${scenario}-first`,
      sourceRefId: `candidate-${scenario}-first-source`,
      sourceSpan: `${scenario} first source`
    }), secondCandidate],
    evidenceRefs: [`evidence-refill-${scenario}`],
    policyReason: "fixture-backed two-lease cross replay source"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 2);
  const firstClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: [`evidence-claim-${scenario}-first`] });
  const secondClaim = await adapter.claim({ workerId: "worker-2", evidenceRefs: [`evidence-claim-${scenario}-second`] });
  assert.equal(firstClaim.ok, true);
  assert.equal(secondClaim.ok, true);
  return {
    adapter,
    first: firstClaim.value.lease,
    second: secondClaim.value.lease
  };
}

function assertCreateClock(createClock) {
  assert.equal(typeof createClock, "function", "dispatcher port full contract suite requires createClock");
}

function cloneCandidate(candidate, overrides = {}) {
  const candidateWorkPacketId = overrides.candidateWorkPacketId ?? candidate.candidateWorkPacketId;
  const sourceRefs = overrides.sourceRefs ?? candidate.sourceRefs ?? [];
  const acceptanceCriteria = overrides.acceptanceCriteria ?? candidate.acceptanceCriteria ?? [];
  const dependencyHints = overrides.dependencyHints ?? candidate.dependencyHints ?? [];
  const verificationTargets = overrides.verificationTargets ?? candidate.verificationTargets ?? [];
  const evidenceRefs = overrides.evidenceRefs ?? candidate.evidenceRefs ?? [];
  return {
    ...candidate,
    candidateWorkPacketId,
    runId: overrides.runId ?? candidate.runId,
    sourceRefs: sourceRefs.map((sourceRef, index) => ({
      ...sourceRef,
      sourceRefId: overrides.sourceRefId ?? `${candidateWorkPacketId}-source-${index + 1}`,
      sourceSpan: overrides.sourceSpan ?? `${sourceRef.sourceSpan ?? "contract fixture"} ${candidateWorkPacketId}`
    })),
    proposedSlice: overrides.proposedSlice ?? candidate.proposedSlice,
    acceptanceCriteria: [...acceptanceCriteria],
    riskClass: overrides.riskClass ?? candidate.riskClass,
    dependencyHints: [...dependencyHints],
    verificationTargets: verificationTargets.map((target) => ({ ...target })),
    authorityClass: overrides.authorityClass ?? candidate.authorityClass,
    authorityStage: overrides.authorityStage ?? candidate.authorityStage,
    status: overrides.status ?? candidate.status,
    policyId: overrides.policyId ?? candidate.policyId,
    evidenceRefs: [...evidenceRefs],
    dedupeKey: overrides.dedupeKey ?? `${candidate.dedupeKey ?? candidate.candidateWorkPacketId}:${candidateWorkPacketId}`,
    createdAt: overrides.createdAt ?? candidate.createdAt,
    updatedAt: overrides.updatedAt ?? candidate.updatedAt
  };
}

function omitCandidateField(candidate, field) {
  const clone = { ...candidate };
  delete clone[field];
  return clone;
}

function assertMetadataOnlyEvents(events) {
  const eventFields = [
    "actorId",
    "actorType",
    "causationId",
    "correlationId",
    "eventId",
    "eventName",
    "evidenceRefs",
    "idempotencyKey",
    "occurredAt",
    "payloadSummary",
    "projectionBehavior",
    "redactionBoundary",
    "runId",
    "schemaVersion"
  ].sort();
  assert.equal(Array.isArray(events), true);
  assert.equal(events.length > 0, true);
  assert.equal(events.every((event) => deepEqualArray(Object.keys(event).sort(), eventFields)), true);
  assert.equal(events.every((event) => event.redactionBoundary === "metadata_only"), true);
  assert.equal(events.every((event) => CONTRACT_EVENT_NAMES.has(event.eventName)), true);
  assert.equal(events.every((event) => isMetadataSafeScalar(event.runId)), true);
  assert.equal(events.every((event) => Array.isArray(event.evidenceRefs) && event.evidenceRefs.length > 0), true);
  assert.equal(events.every((event) => event.evidenceRefs.every((ref) => isMetadataSafeScalar(ref))), true);
  assert.equal(events.every((event) => isMetadataSafeScalar(event.actorId)), true);
  assert.equal(events.every((event) => isMetadataSafeScalar(event.correlationId)), true);
  assert.equal(events.every((event) => event.causationId === null || isMetadataSafeScalar(event.causationId)), true);
  assert.equal(events.every((event) => typeof event.payloadSummary === "string" && event.payloadSummary.length > 0 && event.payloadSummary.length <= 240), true);
  assert.equal(events.every((event) => isMetadataSafeScalar(event.payloadSummary)), true);
  assert.equal(events.every((event) => allNestedScalarsSafe(event)), true);
  assert.equal(events.every((event) => !containsRawPayloadField(event)), true);
  assert.equal(
    events.every((event) =>
      !["rawPayload", "payload", "rawProviderPayload", "providerPayload", "retainedPayload", "rawPayloadRetained", "retentionClass"].some(
        (field) => Object.hasOwn(event, field)
      )
    ),
    true
  );
}

function isMetadataSafeScalar(value) {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    !/rawProviderPayload|providerPayload|providerMetadata|providerResponse|provider_response|rawPayload|raw_payload|provider_payload|provider_metadata|retainedPayload|retained_payload|raw payload|provider payload|provider response|secret|token|credential|scrollback|api_key|api-key|apikey|client_secret|clientSecret|private_key|privateKey|sshPrivateKey|access_key|accessKey|secret_key|secretKey|secretAccessKey|awsSecretAccessKey|password|[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|ID_TOKEN|TOKEN|SECRET)\b\s*=?|provider\s*[:=]|response_id\s*[:=]|authorization\s*:\s*bearer|\bbearer\s+[A-Za-z0-9._~+/-]+=*|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}|(?:github_pat|gh[opusr])_[A-Za-z0-9_]{8,}/i.test(value);
}

function allNestedScalarsSafe(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return isMetadataSafeScalar(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(allNestedScalarsSafe);
  }
  if (typeof value === "object") {
    return Object.values(value).every(allNestedScalarsSafe);
  }
  return false;
}

function containsRawPayloadField(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (/raw|payload|provider|secret|scrollback/i.test(key) && key !== "payloadSummary") {
      return true;
    }
    if (key === "payloadSummary" && /rawProviderPayload|providerPayload|rawPayload|raw_payload|provider_payload|provider_metadata|retainedPayload|retained_payload|secret|scrollback|privateKey|sshPrivateKey|accessKey|secretKey|secretAccessKey|awsSecretAccessKey|[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|ID_TOKEN|TOKEN|SECRET)\b\s*=?|\bbearer\s+[A-Za-z0-9._~+/-]+=*|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(String(nested))) {
      return true;
    }
    if (containsRawPayloadField(nested)) {
      return true;
    }
  }
  return false;
}

async function assertInvalidInputResult(run, label) {
  const result = await run();
  assert.equal(result.ok, false, `${label} must fail closed`);
  assert.equal(result.code, "invalid_input", `${label} must report invalid input`);
  assert.equal(Array.isArray(result.evidenceRefs ?? []), true, `${label} must return bounded evidence refs`);
  assert.equal((result.evidenceRefs ?? []).every((ref) => isMetadataSafeScalar(ref)), true);
}

async function assertFailureEvidenceRefs(run, expectedRefs) {
  const result = await run();
  assert.equal(result.ok, false);
  assert.equal(result.evidenceRefs.every((ref) => isMetadataSafeScalar(ref)), true);
  assert.deepEqual(result.evidenceRefs, expectedRefs);
}

function assertMetadataOnlyEvidenceRecords(records) {
  const recordFields = [
    "artifactPath",
    "createdAt",
    "evidenceRefId",
    "evidenceType",
    "label",
    "rawPayloadRetained",
    "retentionClass"
  ].sort();
  assert.equal(Array.isArray(records), true);
  assert.equal(records.length > 0, true);
  assert.equal(records.every((record) => deepEqualArray(Object.keys(record).sort(), recordFields)), true);
  assert.equal(records.every((record) => allNestedScalarsSafe(record)), true);
  assert.equal(records.every((record) => record.rawPayloadRetained === false), true);
  assert.equal(records.every((record) => record.retentionClass === "fixture"), true);
  assert.equal(records.every((record) => record.artifactPath === null), true);
  assert.equal(
    records.every((record) =>
      !["rawPayload", "payload", "rawProviderPayload", "providerPayload", "retainedPayload", "secret", "scrollback"].some((field) =>
        Object.hasOwn(record, field)
      )
    ),
    true
  );
}

function deepEqualArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
