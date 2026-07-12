# Epic 25 Pre-Live Operational Runbook

Status: **dry-run and pre-live only**
Base contract: `dev` at `b66bf296` or newer, including PRs #549 and #550
Evidence retention: metadata only
Default decision in this profile: `hold`

## Purpose and hard boundary

This runbook prepares Epic 25 canary, capacity, recovery, hardening, and final
decision operations without launching a provider, worker, dispatch, production
traffic, deployment, schema migration, merge, cleanup, or secret-access action.
It exercises the source-owned contracts and produces a reviewable rehearsal
package. It does not grant execution authority.

The deterministic harness is fixture-backed. Its output must remain classified
as `fixture` / `prelive_fixture`, must be metadata-only, and must end in
`hold`. **Fixture, simulated, caller-asserted, or integrated-local evidence can
never clear a live canary, ramp, recovery, hardening, `go`, or
`limited_rollout` gate.** Re-labeling fixture evidence, copying fixture values
into a live packet, or setting a caller boolean to `live` does not change its
provenance.

The following stop lines apply throughout this runbook:

- no provider calls;
- no production or worker mutation;
- no dispatch or schema migration;
- no secret value retention;
- no live or rollout claim;
- no automatic deployment, merge, cleanup, or authority expansion.

If a step would cross one of these lines, stop and obtain a separately scoped
live-operation authority packet. Do not reinterpret this document as approval.

## Roles, owners, and authority prerequisites

Name one person or system identity for every role before starting. One identity
may fill multiple roles only when the authority approver records that exception
and the independent observer remains independent of the subject runtime.

| Role | Responsibility | Required evidence |
| --- | --- | --- |
| Run owner | Coordinates the rehearsal, freezes scope, records stage state, and declares stop | Owner ID, run ID, handoff contact |
| Authority approver | Approves the exact operation, environment, worker count, budget, and time window | Authority state `allowed`, `proven: true`, scoped evidence refs |
| Runtime owner | Owns worker, assignment, dispatcher lease, checkpoint, restart, pause, and drain state | Exact worker/assignment/owner/run IDs and recovery path |
| Telemetry observer | Independently observes the exact packet subject and issues a fresh receipt | `independent_runtime` observer ID and bound attestation receipt |
| Incident commander | Owns stop, rollback, severity, incident timeline, and return-to-service decision | Named contact and incident channel/reference |
| Support lead | Owns operator communications, escalation, and handoff acknowledgement | Named contact, support window, acknowledgement ref |
| Evidence custodian | Builds the metadata-only manifest and disposes of prohibited/raw material | Manifest ID, retention deadline, disposal receipt |
| Final decision owner | Records `go`, `hold`, or `limited_rollout`; cannot execute rollout from this package | Final authority evidence and signed decision ref |

Before any future live-observed run, all of the following must be true:

1. The target has exact `workerId`, `assignmentId`, `owner`, and `runId` values,
   plus source and evidence refs for that same target.
2. Backend truth is independently proven live. Caller-supplied booleans are not
   proof.
3. The exact operation has explicit authority for the environment, stage,
   worker count, cost ceiling, and observation window. Generic permission to
   continue is insufficient.
4. Configuration is validated from allowlisted variable names only; values,
   tokens, prompts, completions, and provider payloads are not retained.
5. Preflight has no blockers; usage and resources are normal; heartbeat, lease,
   and checkpoint/receipt proof are fresh and target-bound.
6. Telemetry, alerts, rollback, incident, support, and evidence-custodian owners
   have acknowledged the run.
7. The preceding Epic 25 packet validates and passes in order: readiness,
   canary, ramp, recovery, hardening, then final decision.

Any missing, stale, contradictory, ambiguous, simulated, fixture-backed, or
unbound prerequisite is a `hold`; a threshold breach, timeout, ownership
ambiguity, unsafe retry, or unrecoverable state is a `stop`.

## Pre-live environment profile

Complete this profile in the metadata manifest before rehearsal. The values
below are the required pre-live defaults; changing them requires an authority
and rationale record.

| Field | Required pre-live value |
| --- | --- |
| Profile name | `epic-25-pre-live-dry-run` |
| Backend truth | `dry_run` or `simulated`; never `live` |
| Evidence class | `fixture` for harness output; `integrated_local` for non-attested local observations |
| Runtime mutation | Disabled |
| Provider calls | Disabled |
| Worker/dispatch launch | Disabled |
| Production traffic | None |
| Secrets | Allowlisted names only; no values retained |
| Data | Synthetic or fixture metadata only |
| Harness clock | Fixed `2026-07-12T12:00:00.000Z` for deterministic output |
| Ramp topology | Rehearse `1 → 2 → 4 → 6`; do not start workers |
| Output | Standard output or approved local metadata-only evidence location |
| Final outcome | `hold`, regardless of fixture assertion results |

Record repository head, dirty-state result, Node and pnpm versions, operating
environment, profile name, target IDs, and owners. Do not record environment
values or credentials.

## Pre-live thresholds and SLO rehearsal

These are provisional rehearsal thresholds, aligned with the deterministic
harness. They do not become production SLOs merely by appearing here. A future
live authority packet must affirm or replace each threshold from measured
baseline data before a live canary.

| Indicator | Pass threshold | Evaluation |
| --- | --- | --- |
| Lease/checkpoint/receipt age | `≤ 60 seconds` | Exact target proof remains bound and fresh |
| Preflight age | `≤ 60 seconds` | Status is `ready` with zero blockers |
| Usage | `≤ 80%` | Usage state remains normal |
| Resources | max CPU, memory, or disk `≤ 80%` | Any one resource can stop the stage |
| Telemetry freshness | `≤ 60 seconds` | Required sources and alerts remain ready |
| Errors | `0` | Any observed error stops the current stage |
| Latency | `≤ 100 ms` | Evaluate the run's declared latency statistic consistently |
| Cost | `≤ 100 cents` per observation window | Missing or unbounded cost is a hold |
| Timeout | `false` | Any timeout is an immediate stop |
| Ownership ambiguity | `false` | Unknown or conflicting owner is an immediate stop |

No missing measurement passes by default. A stage also requires normal usage,
a healthy lease, exact process count, complete telemetry, no silent retry, and
an available rollback path. Do not average away a breach.

## Telemetry and observation windows

The deterministic harness models 60-second windows without waiting in real
time. That fixture duration proves contract handling only. For a separately
authorized future live-observed exercise, use these minimum windows unless the
authority packet sets stricter values:

| Window | Minimum | Required observations |
| --- | --- | --- |
| Baseline before canary | 15 minutes | Queue, errors, latency, CPU, memory, disk, cost, lease, heartbeat, checkpoint |
| One-worker canary | 30 minutes | Continuous telemetry plus beginning, midpoint, and end receipts |
| Ramp stage 1 | 15 minutes | Same signals, exact process count `1` |
| Ramp stage 2 | 15 minutes | Same signals, exact process count `2` |
| Ramp stage 4 | 30 minutes | Same signals, exact process count `4` |
| Ramp stage 6 | 30 minutes | Same signals, exact process count `6` |
| Drill stabilization | 5 minutes and two fresh heartbeats | Unambiguous owner, renewed lease, idempotency proof, rollback available |
| Post-ramp soak | 30 minutes | No breach, backlog distortion, stale lease, hidden retry, or cost drift |

An independent observation attestation must use
`pipeline-observed-evidence-attestation/v0`, identify an
`independent_runtime` observer, bind the packet schema and exact target, and
carry a receipt ID, observed/issued/expiry timestamps, SHA-256 evidence digest,
source refs, and evidence refs. Packet freshness is at most five minutes. An
expired, unrelated, malformed, or non-binding receipt downgrades evidence to
`integrated_local` and holds promotion.

At each window boundary, the run owner and telemetry observer compare the same
declared statistic and acknowledge the metadata checkpoint. Conflicting views
are an ownership/evidence ambiguity and stop the run.

## Dry-run procedure

### 1. Freeze and inspect

Confirm the branch is based on `b66bf296` or newer and the intended evidence
location is ignored or otherwise approved for metadata-only retention.

```bash
git status -sb
```

```bash
git rev-parse HEAD
```

```bash
node --version
```

```bash
pnpm --version
```

Do not continue with unrelated dirty changes, unknown ownership, a stale base,
or an output path that could retain secrets or raw payloads.

### 2. Verify the deterministic contract

```bash
pnpm run test:epic25:prelive
```

```bash
node --test tests/operational-readiness-contract.test.mjs
```

The harness test must prove deterministic output, `fixture` provenance,
metadata-only retention, secret-like reference rejection, all mutation
authorities disabled, threshold breach handling, rollback required, and a final
`hold`.

### 3. Generate and inspect the fixture bundle

```bash
pnpm run epic25:prelive
```

Inspect the output without changing its classification. Required bundle facts:

- schema `epic-25-prelive-evidence-bundle.v1`;
- `evidenceClass: fixture` and `truthLabel: prelive_fixture`;
- `metadataOnly: true` and `rawPayloadRetained: false`;
- ordered worker counts `[1, 2, 4, 6]`;
- threshold, stale/missing authority, forged provenance, recovery, and hold
  paths exercised;
- all validators return no schema failures;
- decision is `hold`; and
- `rolloutAllowed`, `automaticDeploymentAllowed`, `providerCallsAllowed`,
  `secretAccessAllowed`, `mergeAllowed`, and `cleanupAllowed` remain `false`.

Validator success means the held packet is structurally valid. It does not mean
the fixture passed a live gate.

## One-worker canary rehearsal

The canary is a packet rehearsal in this profile; it does not launch a worker.
Record the hypothetical exact target and evaluate in this order:

1. Readiness contract is valid and its outcome is `go` from independently
   observed live prerequisites. In this dry-run profile it remains `no_go`.
2. Worker count is exactly one; target identity and source refs are complete.
3. Canary authority is `allowed` and independently proven for that exact
   target. In this dry-run profile it remains blocked.
4. Telemetry and alerts cover the full window.
5. Lease and checkpoint are `pass` with bound proof refs.
6. Latency, errors, maximum resource use, and cost satisfy every threshold;
   timeout is false.
7. Recovery owner, rollback path, and remediation action are present.
8. The independent observation receipt is valid, fresh, and bound.

Only a promotion-grade `live_observed` packet may have `outcome: pass` and
`rampAllowed: true`. `fixture` or `integrated_local` yields `hold` or `stop`.
On timeout or threshold breach, mark `stop`, set recovery required, preserve the
metadata checkpoint, and do not proceed to the ramp.

## Capacity ramp rehearsal: `1 → 2 → 4 → 6`

The one-worker canary is the mandatory predecessor. Evaluate stages in order;
never skip, overlap, or backfill a stage. In this dry-run, construct and inspect
the stage packets without starting processes.

For each stage, record stage ID, worker count, owner, duration, budget, explicit
rollback thresholds, scoped authority refs, queue depth, lease health, latency,
error count, CPU/memory/disk, exact process count, usage state, cost, and
evidence refs.

The stage passes only when:

- every prior stage passed;
- worker count is the expected next value;
- capacity and authority are proven;
- the process count equals the stage worker count;
- lease, usage, telemetry, and evidence are healthy;
- all thresholds pass for the whole observation window; and
- no stop or abort criterion occurred.

At a breach, mark the current stage `stop`, all later stages `hold`, require
rollback, and return to the last known-safe count. Do not continue collecting a
longer window in an attempt to dilute the breach. Even a fully passing ramp
packet has `rolloutAllowed: false`; it is evidence for a later decision only.

## Recovery drill matrix

Run these as metadata-only tabletop/deterministic exercises in pre-live. A
future live drill needs its own scoped mutation authority. Start each drill
from a known checkpoint, inject only the authorized condition, and finish with
five minutes plus two heartbeats of stable state.

| Drill | Expected recovery and proof | Stop condition |
| --- | --- | --- |
| Restart | Stop intake, preserve checkpoint, restart only the authorized component, reconcile target/lease, resume once | Duplicate work, lost checkpoint, owner mismatch, or stale state |
| Worker death | Detect missed heartbeat, fence dead owner, preserve assignment, reassign only after lease proof | Two owners, silent retry, unproven fencing, or missing assignment |
| Stale lease | Pause dispatch, reject stale holder, inspect lease epoch/owner, renew or explicitly transfer | Ambiguous holder, mutation under stale lease, or repeated expiration |
| Timeout | Stop the attempt, record timeout, prevent implicit retry, inspect checkpoint, retry only with new authority/idempotency proof | Hidden retry, repeated timeout, uncertain side effects, or budget breach |
| Verification failure | Hold delivery, preserve failing check metadata, return to owning lane, rerun only after scoped remediation | Bypass, falsified pass, unrelated mutation, or unresolved failure |
| Pause and drain | Pause new intake, let owned work reach checkpoint/terminal state, prove queue and active-count convergence | New intake after pause, abandoned work, or non-converging drain |
| Handoff | Freeze mutations, transfer exact target/run/lease/checkpoint refs, require receiver acknowledgement, then release prior owner | Concurrent ownership, missing acknowledgement, or stale handoff packet |
| Recovery closeout | Reconcile state, prove idempotency and rollback availability, preserve manifest refs, authorize next step separately | Any ambiguity, evidence loss, unsafe residue, or unresolved incident |

Every drill records `stateBefore`, `stateAfter`, `ownershipBefore`,
`ownershipAfter`, lease state, idempotency state, rollback state, evidence
retained, ambiguity, silent retry, retry count, next action, authority refs, and
observation refs. A drill passes only with `stateAfter: recovered`, unambiguous
ownership, a renewed/valid lease, proven idempotency, rollback available,
evidence retained, no silent retry, and bounded retries. The first failed drill
stops the sequence and holds every later drill.

## Stop, rollback, incident, and support flow

Use this flow for any stop or abort criterion:

1. **Stop:** the run owner freezes the current stage, blocks next-stage
   authority, records the first triggering timestamp and criterion, and prevents
   automatic retry.
2. **Stabilize:** the runtime owner pauses intake and drains only when safe;
   otherwise fence the affected owner/lease and preserve the last known-safe
   checkpoint.
3. **Rollback:** return to the last known-safe stage or held baseline using the
   predeclared rollback path. Rollback is not improvised after a breach.
4. **Verify:** the independent observer proves target identity, ownership,
   lease, checkpoint, queue, resources, errors, and idempotency. Ambiguity keeps
   the system stopped.
5. **Incident:** the incident commander assigns severity, owns the timeline,
   records impact and containment metadata, and decides whether support or
   security escalation is required. Do not retain raw payloads or secrets in
   the incident packet.
6. **Support:** the support lead acknowledges the affected scope, communicates
   the held state and next update time, and records operator/customer impact by
   reference only.
7. **Handoff:** outgoing and incoming owners acknowledge the same target,
   checkpoint, lease, incident, rollback, and evidence-manifest refs.
8. **Resume or close:** resume requires a fresh authority packet and complete
   re-evaluation from the earliest invalid predecessor. Otherwise close as
   `hold` or `stop` with recovery required.

Never skip directly from rollback to a later ramp stage. Never use an incident
or support acknowledgement as technical proof that a gate passed.

## Abort criteria

Abort the rehearsal or any future authorized live exercise immediately on:

- any threshold breach, timeout, error, cost ceiling breach, or resource ceiling
  breach;
- stale/missing telemetry, heartbeat, lease, checkpoint, receipt, source ref,
  evidence ref, or authority proof;
- fixture, simulated, integrated-local, forged, contradictory, unrelated, or
  expired evidence presented for a live gate;
- unknown, conflicting, or concurrent ownership;
- process count different from the authorized stage;
- silent/automatic retry, duplicate work, failed idempotency, or uncertain side
  effects;
- preflight blocker, abnormal usage, queue divergence, non-converging drain, or
  failed verification;
- missing rollback owner/path, failed rollback, or inability to restore the last
  known-safe state;
- secret-like data, raw provider payload, prompt/completion, or unnecessary
  source copy appearing in retained evidence;
- unapproved scope, budget, environment, topology, mutation, provider call,
  deployment, merge, cleanup, or schema change;
- an unresolved high-risk hardening gap in alerts, readiness, authority,
  secrets, resources, cost, rollback, incident/support, retention, or cleanup.

An abort cannot be cleared by extending the observation window. Repair the
earliest failed predecessor and begin again with fresh evidence and authority.

## Evidence manifest

The evidence custodian creates one manifest per run. The manifest contains
metadata and references only:

```yaml
schemaVersion: epic-25-pre-live-evidence-manifest/v1
manifestId: safe-stable-id
profile: epic-25-pre-live-dry-run
repository:
  headSha: exact-sha
  baseSha: b66bf296-or-newer
  dirty: false
run:
  runId: safe-run-id
  startedAt: ISO-8601
  completedAt: ISO-8601
  outcome: hold
  ownerId: safe-owner-id
scope:
  environment: non-secret-environment-id
  targetRef: exact-target-ref
  stageWorkerCounts: [1, 2, 4, 6]
provenance:
  evidenceClass: fixture
  truthLabel: prelive_fixture
  fixtureEvidence: true
  observerId: safe-observer-id
authority:
  state: blocked
  evidenceRefs: []
thresholdProfile:
  id: epic-25-pre-live-defaults-v1
  observationWindowRefs: [metadata:window-plan]
packets:
  readiness: { outcome: no_go, evidenceRef: metadata:readiness }
  canary: { outcome: stop, evidenceRef: metadata:canary }
  ramp: { outcome: stop, evidenceRef: metadata:ramp }
  recovery: { outcome: stop, evidenceRef: metadata:recovery }
  hardening: { outcome: stop, evidenceRef: metadata:hardening }
  decision: { outcome: hold, evidenceRef: metadata:decision }
recovery:
  required: true
  ownerId: safe-owner-id
  rollbackRef: metadata:rollback
incident:
  incidentRef: null
  supportRef: null
retention:
  metadataOnly: true
  rawPayloadRetained: false
  expiresAt: ISO-8601
  disposalOwnerId: safe-owner-id
checks:
  commands: [safe-command-name]
  outcomes: [pass]
stopLines:
  - no_provider_calls
  - no_production_or_worker_mutation
  - no_live_or_rollout_claim
```

Use safe IDs and refs; do not embed command output, logs, stack traces,
environment values, tokens, prompts, completions, source contents, screenshots,
or telemetry payloads. A SHA-256 digest may identify separately governed
evidence, but the manifest must not make prohibited material durable.

## Metadata-only retention and disposal

- Retain the manifest, decision, timestamps, owners, threshold IDs, outcomes,
  digests, and safe evidence/source refs for 90 days after the final decision,
  or the shorter repository/incident policy if one applies.
- Retain configuration names only when allowlisted and necessary to explain a
  gate; never retain values.
- Keep deterministic fixture output only as long as needed to validate the run
  and manifest. The source harness can regenerate it.
- Do not retain raw provider payloads, prompts, completions, reasoning traces,
  secret values, terminal transcripts, full logs, screenshots, database dumps,
  or unnecessary source copies.
- If prohibited content appears, stop evidence handling, quarantine access
  through the incident owner, replace the retained item with a safe digest/ref,
  and record a metadata-only disposal receipt.
- At expiry, the evidence custodian disposes of the metadata through the
  approved scoped cleanup process, records manifest ID, disposed classes,
  timestamp, owner, and result, and does not claim cleanup authority from this
  runbook.

## Final `go` / `hold` / `limited_rollout` rules

The final packet is a recommendation and evidence handoff. In every case its
`rolloutAllowed`, `automaticDeploymentAllowed`, `providerCallsAllowed`,
`secretAccessAllowed`, `mergeAllowed`, and `cleanupAllowed` fields remain
`false`.

| Decision | Required rule |
| --- | --- |
| `hold` | Mandatory for this dry-run/fixture profile; also mandatory for any missing, stale, blocked, simulated, non-live, ambiguous, invalid, failed, or contradictory predecessor or authority item |
| `limited_rollout` | All canary, ramp, recovery, and hardening predecessors pass with fresh `live_observed` provenance; final authority is explicit; scope is marked limited with concrete boundaries such as worker count, environment, duration, budget, and stop lines; no blockers remain |
| `go` | All four predecessors pass with fresh `live_observed` provenance; final authority is explicit and proven; scope is not limited; every threshold, observation, recovery, hardening, incident/support, retention, and handoff requirement is complete; no blockers remain |

`limited_rollout` is not a waiver for a failed predecessor. `go` cannot be
inferred from validator success, test success, fixture success, elapsed time, or
operator silence. A separate rollout/deployment authority and execution
procedure is required after either positive recommendation.

The final decision owner signs the exact packet head/digest, predecessor
outcomes, evidence class, scope, authority refs, rollback refs, monitoring plan,
stop lines, and expiry. Any material change or expiry returns the decision to
`hold` and requires fresh evidence.

## Documentation verification and handoff

Run the source-owned documentation checks and inspect the exact diff:

```bash
pnpm run check:docs
```

```bash
git diff --check
```

```bash
git diff -- docs/workflows/epic-25-pre-live-runbook.md
```

Handoff must state repository head, changed files, check commands and outcomes,
manifest ID, final recommendation, unresolved blockers, and the exact next
authority required. Do not attach fixture evidence as proof that a live gate is
clear.

## Source contracts

- `scripts/epic-25-prelive-harness.mjs`
- `scripts/lib/manager-control-plane/operational-readiness.mjs`
- `tests/epic-25-prelive-harness.test.mjs`
- `tests/operational-readiness-contract.test.mjs`
- `docs/workflows/gate-5-and-6-terminal-readiness-contract.md`
