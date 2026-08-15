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

The planner inventory must also enumerate every baseline-only aggregate gate
(including documentation-authority, installation, and other universal policy
checks), its risk owner, trigger, and required execution owner. A proposed
profile may not accidentally omit a gate merely because it is not represented
as a selected component bundle.

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

### Protect long-leaf verification budgets

The time budget for a long, resumable verification leaf belongs to that leaf,
not to earlier work in a delivery packet. Earlier quick checks may consume the
packet's ordinary budget and remain pause/resume candidates, but they must not
silently reduce the selected long leaf below its declared, evidence-based
timeout; the leaf receives that full timeout independently. This prevents a
healthy, relevant suite from being killed merely
because unrelated setup or prior checks ran first.

The delivery runner must enforce that rule by starting a selected long leaf
with its full per-leaf timeout after earlier packet work has elapsed. The
protected `dev` runner and its focused contract test are the required
implementation evidence; policy text alone never establishes this guarantee.

Before increasing a timeout, first record the leaf's command, selected risk,
recent wall-clock evidence, and whether sharding or duplicate removal would
remove the delay. Raise the leaf budget only when it preserves required
coverage; do not turn a timeout increase into an unbounded delivery packet.

### Prefer component runners to long shell chains

Where many tiny checks share setup or fixtures, use a component runner that
reports named subresults and first failure. Preserve individual test identity in
logs and artifacts. Do not collapse unrelated checks into an opaque command
simply to improve a duration number.

## Workflow efficiency rules

- Use cancellation concurrency for superseded PR heads; avoid pushing several
  unvalidated intermediate revisions when one coherent, locally checked
  revision will do.
- Treat an isolated long-running check as a scarce, single-use budget. While it
  runs, perform only independent read-only analysis, review, or preparation;
  do not start a duplicate run for the same head merely to obtain status.
- When a long leaf fails, classify its first actionable failure and repair that
  leaf before spending a dependent exact-head rerun. Re-run the failed leaf
  when its scope is unchanged; reserve a wider graph for a changed risk surface
  or the final exact-head fan-in. Record any exception that requires duplicate
  execution or a broad retry.
- Cache deterministic dependency stores and interpreter environments, but
  measure setup, restore, install, and test time separately before adding large
  artifact transfers or a new build system.
- Prefer planner-selected matrices over one universal matrix. Parallelize
  independent components; serialize only shared-state, migration, or resource
  constrained checks.
- Sequence enabling repairs before the work that depends on them. For example,
  land a verified delivery-runner or CI-routing repair before asking dependent
  migration or refactor lanes to repeat the same known-bad verification path.
  A dependent lane's acceptance evidence must name the enabling repair's exact
  commit and prove that commit is an ancestor of both the tested lane head and
  its selected integration base; a planning dependency or merge order alone is
  not proof that the repair was tested.
  While it is in review, use otherwise-idle capacity for read-only inventory or
  isolated work, rather than creating retry churn or competing changes.
- Do not introduce a second task/build orchestrator solely for CI acceleration
  while the existing planner and package scripts can express the required graph.
  A new tool needs evidence that it removes more complexity than it creates.
- Keep a stable final required check/fan-in surface so branch protection sees a
  comprehensible result rather than an incidental matrix layout.
- Run an explicit **integration train** for independently prepared changes:
  order merge-sensitive PRs by dependency, keep only the train head in an
  exact-head protected-check cycle, and use the wait time for later cars only
  for read-only review, conflict prediction, and focused local preparation.
  A later car is created after it reaches the head, or receives a
  non-rewriting base update before its one required exact-head cycle; it is
  never force-pushed merely to enter the train. This avoids repeatedly
  invalidating and rerunning expensive CI for every queued branch while
  preserving fail-closed evidence for the revision that is actually merged.

## Integration and scheduled policy

The protected integration branch is the intended delivery baseline. Full
repository confidence must run after changes reach that branch, not solely on a
different branch that normal delivery does not target. Scheduled/manual full
runs cover slow or environmental confidence that is unsuitable for every PR.
Until that `dev`-targeting integration or scheduled/manual full route exists,
the current conservative PR aggregate remains required; a `main`-only full run
is not a replacement for it.

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

Promotion evidence uses a declared paired measurement window, not one green
run per example head. Each measured member must start from a clean committed
tree, or record an immutable source snapshot digest that binds its staged,
unstaged, and untracked input; both members of a pair must have the same input
identity. For each planner selection vector in the acceptance
packet's bounded covering set, collect at least 20 same-head
baseline/proposed pairs over at least five UTC calendar days on the same runner
class and lockfile/environment configuration. Every pair pins and records the
exact base commit used by the planner and the exact tested head; the baseline
and proposed members of a pair use those same commits. Record median and P95
queue, setup, execution, and wall time; P95 first actionable-failure time; and
failure, flake, and retry counts. When ordinary runs have zero actionable-
failure samples, report their first-actionable-failure P95 as `N/A (zero
samples)` rather than treating it as a passing latency result. For every
selection vector, collect at least 20 paired deterministic controlled-failure
samples to calculate and compare first-actionable-failure P95 while separately
proving equivalent failure detection. Each
pair must use equivalent isolated cache state, or run in
randomized/counterbalanced order with the cache state recorded for both sides;
one side must not consistently warm the other. Exceptional runner incidents
remain in the primary distribution and are labeled rather than silently
discarded. An acceptance packet may additionally report a predeclared,
objective exclusion rule, but it must retain and compare the inclusive result.

A proposed route may promote only when it has no loss of required failure
detection, no increase in failure/flake/retry rates, no more than a 10% P95
regression in **each** recorded duration metric versus the corresponding
baseline, and P95 first actionable-failure time no slower than its baseline.
Required failure detection and the failure/flake/retry criteria are
non-waivable. The sole performance exception is a documented P95 duration
regression, and it requires an accepted CI-optimization acceptance packet from
the named delivery authority independent of the implementer. That packet must
name the affected metric(s), comparison data, retained risk coverage, reason,
scope, expiry, rollback, and the approval evidence; a self-authored
justification is not approval. At expiry, the owner must either execute and
record the named rollback or obtain and record fresh independent approval
before the exception continues; an expired exception never silently rolls
forward.

For a synchronous local delivery profile, queue time is `N/A (no scheduler)`:
it is recorded but excluded from the local duration-regression comparison.
CI queue time remains a required measured metric. A report must never silently
substitute zero or human wait time for either form of queue time.

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
The failure sample is inconclusive, not proof of either a flaky transport or a
deterministic product failure: `close-missing-worktree` emitted an empty child
JSON result and then failed on `Cannot read properties of null (reading
'reason')`. The empty result may reflect a fixture/diagnostic defect or a
sandbox/process-boundary issue. Classify it as actionable only after bounded
diagnostics and an exact-head rerun establish the underlying failure.

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
- For the sampled docs/JavaScript heads, routing already demonstrates the
  intended low-latency behavior; do not change topology from this small sample.
  Collect the broader distribution evidence required by this policy first:
  P50/P95 duration, setup/queue/execution time, failure/flake/retry rate, first
  actionable-failure time, and duplicate-command counts.

This inventory is a reporting/update slice only. No workflow gate, required
check, or test command was removed or rerouted. Any shard split, cache change,
or authority promotion needs a separate implementation change with the
same-head, before/after, failure-rate, and rollback evidence required above.

## Local delivery-profile alignment

The local delivery command must not become a second, unplanned source of broad
CI work.  In particular, a planner-proven supervisor, documentation, or other
non-workspace change must not unconditionally wait for the aggregate
`test:codex-workspace` suite merely because a delivery wrapper selects its
historical `check` profile.  That duplicates unrelated confidence, extends the
author feedback loop, and hides the actual risk owner.

The migration path is deliberately evidence-first:

1. retain the current aggregate local `check` profile while it is the effective
   required behavior and record its component-level timing;
2. add a delivery profile that consumes the same structured planner selection
   as CI: complete the planner quick-fail stage (`quickFailCommands` and
   `jsonParseFiles`), then build an expanded, de-duplicated command graph from
   `fast`'s integrity-only leaves, exactly the selected independent component
   bundle(s), and the stable final fan-in. Each semantic command executes once;
   dependent gates consume its result rather than rerunning it;
3. run the proposed profile and the existing aggregate profile on the same
   representative heads for each independent planner surface: documentation
   and baseline-only aggregate checks, JavaScript/dashboard-only, supervisor
   and migration, every standalone static component (core, manager,
   pipeline/dashboard, policy, workspace, and anti-churn), workflow changes,
   and unknown/shared fail-closed escalation.
   Cover every pairwise reachable mixed surface plus a named, risk-based set of
   higher-order combinations (shared contracts, migrations, workflow changes,
   and other planner-declared high-risk combinations). The acceptance packet
   must list the planner version, exact planner base commit for every selected
   vector, a bounded reachable-vector inventory of singleton surfaces,
   pairwise reachable combinations, and named high-risk higher-order vectors,
   the selected covering set, and the rationale for omitted higher-order
   combinations; do not require the unbounded power set of ordinary mixed
   paths;
4. exercise a deterministic controlled failure for every selected component and
   the unknown/shared escalation path, proving that the proposed profile and
   final fan-in reject the same head as the aggregate route;
5. meet the paired measurement-window requirements above and prove equivalent
   required results, retained fail-closed escalation, no duplicated expensive
   invocation, and P95 first actionable-failure time no slower than baseline;
6. establish and record a successful full-confidence fallback that targets
   post-merge `dev` (or an equivalent protected integration branch), or a
   scheduled/manual route that explicitly verifies that merged baseline, before
   promoting the narrower delivery profile; and
7. keep the aggregate workspace/full confidence until that independent fallback
   and the replacement coverage are proven.

Do not treat elapsed time alone as authority to skip a suite. The acceptance
packet must include planner output generated against the exact pinned base
commit, `quickFailCommands`, `jsonParseFiles`, the exact base commit and tested
head for every pair, the expanded de-duplicated command graph, exact commands,
same-head results, P50/P95
setup/queue/execution/wall and first-actionable-failure measurements, pair cache
controls, failure/flake/retry rate, any independent performance exception, and
a rollback that restores the prior aggregate profile. A long local delivery run
is evidence for this migration, not permission to bypass it.

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
