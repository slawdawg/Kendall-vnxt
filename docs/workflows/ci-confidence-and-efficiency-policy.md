# CI Confidence And Efficiency Policy

Date: 2026-08-13
Status: accepted durable engineering policy; implementation adoption in progress
Scope: all repository pull requests, integration branches, scheduled
verification, local delivery checks, and CI workflow changes

## Purpose

Kendall vNxt CI must provide the strongest useful evidence at the earliest
useful point. This policy applies to all future work, not only the holistic
cleanup program. It rejects both extremes: waiting for a broad serial suite on
every small change, and weakening verification merely to reduce elapsed time.

The desired outcome is a CI system in which every required check has a named
risk, owner, trigger, replacement/retirement condition, and observable timing
record. A check that consumes time but cannot explain the risk it proves is
debt, not confidence.

`ci-gate-behavior.md` describes the implementation currently in force.
`ci-acceleration-plan.md` is retained as a historical rollout record. This
policy governs future CI changes. When current behavior differs from this
policy, retain the more conservative effective check until a migration slice
proves its replacement.

## Core principles

- **Risk-oriented, not command-oriented.** A gate exists to prove a specific
  failure mode, not because a script happens to exist.
- **Earliest useful feedback.** Syntax, diff hygiene, malformed configuration,
  and known narrow contracts fail before expensive environment setup or broad
  suites.
- **Affected verification by default.** A pull request runs the smallest set
  of independent component checks that covers its changed risk surfaces.
- **Broad verification by evidence.** Unknown, shared, dependency, workflow,
  migration, or high-risk changes deliberately escalate to broader coverage.
- **No silent trust of local evidence.** Local checks reduce repair loops; CI
  independently verifies the required scope.
- **No duplicate authority.** The same expensive test must not be a required
  part of two jobs on the same head unless the two invocations prove distinct
  environments or failure modes.
- **Full confidence still exists.** Repository-wide verification moves to
  integration, scheduled, release, or explicitly elevated paths; it is not
  discarded.
- **Measured evolution.** CI topology changes are introduced in shadow mode,
  compared on the same head, and promoted only after equivalent or better
  evidence is recorded.

## Verification layers

| Layer | Trigger | Required evidence | Intended latency |
| --- | --- | --- | --- |
| Local pre-push | Before a coherent revision is pushed | Quick-fail and planner-selected focused checks. | Fast enough to prevent avoidable CI retries. |
| PR integrity | Every PR | Diff hygiene, changed-file syntax/configuration validity, planner validity, and truly universal policy checks. | The first actionable result. |
| PR affected-domain | Planner-selected component surfaces | Unit/contract/build checks for the exact changed risks, with reasons for every selected and skipped component. | Short, parallel feedback for normal changes. |
| PR elevated | Explicit high-risk or unknown/shared surface | Broader component matrix, migration proof, security/recovery checks, or full verification when the risk requires it. | Longer by deliberate exception, not by default. |
| Integration confidence | Push to `dev` or equivalent protected integration branch | Full repository verification after integration. | Does not delay ordinary PR feedback; protects the merged baseline. |
| Scheduled/release confidence | Nightly/scheduled, release, or manual elevated run | Full suite plus slow, environmental, clean-install, migration, or resilience coverage. | Completeness over interactive speed. |

No policy text implies that the target latency is currently achieved. Each
component establishes and publishes its baseline before receiving a budget.

## Planner contract

The changed-file planner is the source of truth for local and PR routing. It
must return structured, reviewable output containing:

- changed paths and detected risk surfaces;
- quick-fail commands;
- required component/bundle identifiers, not only a boolean broad-static flag;
- required JavaScript, supervisor, migration, and elevated-confidence gates;
- selected and skipped gates with an explanatory reason; and
- whether the result is known-safe, elevated, or fail-closed unknown.

Unknown paths and shared/high-risk boundaries fail closed to an explicit broad
policy. They must not accidentally trigger every unrelated component merely
because the planner lacks a more precise mapping. The migration target is
specific selection such as `workspace` or `policy`; an all-component matrix is
reserved for a named broad-confidence reason.

Planner mapping changes require same-head shadow evidence: compare the proposed
selected set with the current conservative set on representative changes before
making the smaller set merge-authoritative.

## Component and test design

### One risk, one required invocation

Component bundles own disjoint command sets. Universal checks run once in the
PR integrity layer and are not repeated inside a required component bundle.
If a test belongs in more than one conceptual area, assign one execution owner
and let other checks depend on its result rather than rerunning it.

### Shard long suites by behavior

Long suites must expose stable behavior-based shards and report their duration.
For example, workspace verification should separate discovery/read-only state,
start/resume, assignment and lease safety, delivery/review, and cleanup/recovery
behaviors. A broad workspace change may run all shards in parallel; a focused
change runs the affected shard(s) plus the small shared-safety core.

Shards must be independently deterministic, have explicit fixtures, and retain
a full-suite aggregate for integration/scheduled confidence. Sharding must not
hide cross-shard state; shared-state behavior belongs in a named integration
shard.

### Prefer component runners to long shell chains

Where many tiny checks share setup or fixtures, use a component runner that
reports named subresults and first failure. Preserve individual test identity in
logs and artifacts. Do not collapse unrelated checks into an opaque command
simply to improve a duration number.

## Workflow efficiency rules

- Use cancellation concurrency for superseded PR heads; avoid pushing several
  unvalidated intermediate revisions when one coherent, locally checked
  revision will do.
- Cache deterministic dependency stores and interpreter environments, but
  measure setup, restore, install, and test time separately before adding large
  artifact transfers or a new build system.
- Prefer planner-selected matrices over one universal matrix. Parallelize
  independent components; serialize only shared-state, migration, or resource
  constrained checks.
- Do not introduce a second task/build orchestrator solely for CI acceleration
  while the existing planner and package scripts can express the required graph.
  A new tool needs evidence that it removes more complexity than it creates.
- Keep a stable final required check/fan-in surface so branch protection sees a
  comprehensible result rather than an incidental matrix layout.

## Integration and scheduled policy

The protected integration branch is the current delivery baseline. Full
repository confidence must run after changes reach that branch, not solely on a
different branch that normal delivery does not target. Scheduled/manual full
runs cover slow or environmental confidence that is unsuitable for every PR.

If a merge queue is available and adopted, it may batch eligible PR heads for
integration confidence. It must retain exact-head evidence, affected-domain
requirements, and a fail-closed response to a failed batch. It is an
optimization, not a waiver for PR verification.

## Measurement, ownership, and quality ratchets

Every CI component records or can derive:

- queue time, setup time, execution time, and total wall-clock duration;
- P50/P95 duration and failure/flake/retry rate;
- first actionable failure time;
- owner, risk statement, and trigger rule; and
- the number of duplicate commands avoided or introduced.

Review these measures on a regular engineering cadence and whenever a component
becomes the dominant critical-path job. A slow or flaky component may be
quarantined only with an owner, exact replacement coverage, expiry, and an
integration/scheduled fallback. It may not silently disappear from required
confidence.

The following are prohibited without a short-lived compatibility record with an
owner, removal condition, and expiry: new unconditional long PR suite, repeated
required invocation of the same expensive command, unclassified check script,
or a planner route that runs all components due solely to an unmapped ordinary
path.

## Phase 0 delivery-health baseline (2026-08-14)

This is the first durable timing/failure inventory for the current workflow
after the cleanup-program baseline (`origin/dev`:
`05ad91c22d449c8a14a98e78bf8def88826ad80a`). Durations below are taken from
completed GitHub Actions job timestamps and are reproducible with
`gh run view RUN_ID --json jobs`. The GitHub timing endpoint was also queried
with `gh api repos/slawdawg/Kendall-vnxt/actions/runs/RUN_ID/timing`; it returned
`total_ms: 0` for the sampled public-repository Ubuntu runs, so these numbers
must not be interpreted as zero billing. Until billable usage is exposed, the
sum of job wall times is the available runner-minute proxy.

| Scenario / run | Head and result | Required path observed | Optional/reporting path | Wall time | Job-wall proxy |
| --- | --- | --- | --- | ---: | ---: |
| Docs-only PR #821 / [31756292895](https://github.com/slawdawg/Kendall-vnxt/actions/runs/31756292895) | `5a5f4d5f`, success | `changes`, `fast`, `check` | component jobs and `full` skipped | 1m45s | 1.6m |
| JavaScript PR #822 / [31757254851](https://github.com/slawdawg/Kendall-vnxt/actions/runs/31757254851) | `a1767fa6`, success | `changes`, `fast`, `javascript`, `check` | static, supervisor, and `full` skipped | 1m49s | 2.2m |
| Supervisor change / [31482998751](https://github.com/slawdawg/Kendall-vnxt/actions/runs/31482998751) | `8ea29e50`, success | `changes`, `fast`, `supervisor`, `check` | static, javascript, and `full` skipped | 11m55s | 13.1m |
| Broad static change / [31660220947](https://github.com/slawdawg/Kendall-vnxt/actions/runs/31660220947) | `0dee23e5`, success | `changes`, `fast`, six `static_bundle` shards, `static`, `check` | `static_bundle_summary` is non-blocking reporting | 9m49s | 16.1m |
| Broad static failure / [31659723799](https://github.com/slawdawg/Kendall-vnxt/actions/runs/31659723799) | `fc90455b`, failure | workspace shard failed after 7m41s; `static` and `check` failed | other shards still reported | 8m48s | failure sample |

The broad-success run shows the current high-ROI target: the workspace shard
took 9m07s, while the other five shards took 25--87s. The supervisor sample
spent about 11m30s in its profiled test job, leaving little margin under its
12-minute timeout. In contrast, docs-only and JavaScript-only PRs already
avoid the broad/static and supervisor paths and complete in under two minutes.
The failure sample is actionable test evidence rather than a flaky transport
signal: `close-missing-worktree` emitted an empty child JSON result and then
failed on `Cannot read properties of null (reading 'reason')`.

### Safe next slices

- Keep `changes`, `fast`, the selected component gate, and `check` as required
  authority. Keep `static_bundle_summary` as optional reporting; it does not
  currently add merge authority.
- For workspace, profile behavior-based shards (discovery/read-only state,
  start/resume, assignment/lease, delivery/review, and cleanup/recovery) in
  shadow mode. Retain an aggregate required workspace gate until same-head
  equivalence is demonstrated; do not remove coverage based on elapsed time.
- For supervisor, measure setup/cache time separately from the profiled suite
  before changing the 12-minute boundary or reducing coverage.
- Do not spend a topology change on docs/JavaScript routing: the selected-path
  runs already demonstrate the intended low-latency behavior.

This inventory is a reporting/update slice only. No workflow gate, required
check, or test command was removed or rerouted. Any shard split, cache change,
or authority promotion needs a separate implementation change with the
same-head, before/after, failure-rate, and rollback evidence required above.

## Adoption roadmap

1. Capture current timing baselines, including component command durations and
   setup/queue time; publish the critical-path owners.
2. Extend the planner to select precise component bundles and reasons; run it in
   non-authoritative shadow mode against the current broad matrix.
3. Remove demonstrated duplicate invocation, beginning with universal fast
   checks repeated by a component bundle.
4. Expose and validate behavior-based workspace shards; compare their aggregate
   result with the current workspace suite on the same head.
5. Promote precise bundle selection to required PR authority after equivalence
   evidence; keep broad escalation for named high-risk boundaries.
6. Add post-merge integration-branch full verification and scheduled/manual
   full confidence before reducing any remaining broad PR requirement.
7. Review component budgets and remove or consolidate checks only with the
   replacement and evidence defined above.

## Acceptance evidence for a CI change

Every CI optimization PR must state:

- the prior and target gate graph;
- risks retained, added, or intentionally deferred;
- same-head equivalence evidence where coverage is rerouted or removed;
- actual before/after duration, queue, and compute duplication measurements;
- exact required checks for PR, integration, and scheduled paths; and
- rollback instructions.

This policy is successful when ordinary changes receive faster, more relevant
feedback while high-risk and merged changes receive at least as much evidence
as they did before the optimization.
