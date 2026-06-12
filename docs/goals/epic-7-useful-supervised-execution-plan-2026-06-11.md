# Epic 7 Useful Supervised Execution Plan

Date: 2026-06-11
Status: planning draft

## Purpose

Define the next post-MVP epic after Epic 6. Epic 7 should convert the supervised-work foundation into visible useful work while keeping high-risk operations gated.

## Retrospective Input

Epic 6 proved the lifecycle, but most of its value was infrastructure and evidence. Bob's retrospective feedback was direct:

- The biggest win was not obvious because little visible product value was produced.
- The most painful friction was Bob having to manage PR readiness, merges, and cleanup approvals.
- The final lifecycle proof was not very visible from Bob's seat.
- Epic 7 should start doing useful things instead of continuing background preparation.
- Caution is still important, but the system must stop anticipating every possible failure before it performs useful work.

## Epic Theme

Useful supervised execution.

Epic 7 should prove that Kendall can launch and supervise one bounded Codex worker that does useful work, verifies it, and moves delivery forward with less operator babysitting.

## MVP Outcome

Epic 7 MVP is complete when one approved low-risk work item moves through:

```text
Candidate Work
  -> Active Work
  -> supervised Codex worker launch
  -> bounded local implementation
  -> verification
  -> out-of-scope diff check
  -> PR creation/update
  -> CI inspection
  -> green-gate merge eligibility
  -> cleanup eligibility
  -> Dev Console done/evidence state
```

The first proof should create visible product or workflow value. A documentation-only task is acceptable only if it removes a real blocker or materially reduces Bob's operational burden.

## Scope

In scope:

- One real Codex worker launch under explicit bounded authority.
- Supervised process lifecycle evidence: launch, timeout, cancellation, terminal state, and captured output summary.
- Scope guardrails: allowed paths, blocked paths, max diff, verification command, and stop conditions.
- Evidence retention: metadata-only command shape, worktree/branch, summary, verification result, PR URL, CI result, merge eligibility, cleanup eligibility, and recovery path.
- Out-of-scope diff detection before commit, PR update, or merge eligibility.
- A narrow green-gate delivery lane that can reduce Bob interruptions after a work item has approved scope, green verification, green CI, clean merge state, and retained evidence.
- Dev Console visibility for what the worker did, why it was allowed, what changed, what passed, and what still needs approval.

Out of scope for the first Epic 7 proof:

- Subscription-agent launch.
- Claude launch by default.
- Provider expansion beyond the approved Ollama boundary.
- Issue/story sync.
- Secret handling expansion.
- Raw prompt, completion, reasoning trace, provider payload, or unnecessary source-copy retention.
- Failed-check bypass.
- Broad autonomy.

## First Story

Start with `docs/stories/7-1-define-green-gate-delivery-readiness-contract.md`.

The first story defines what "green" means with machine-checkable negative fixtures before any real mutating Codex launch. The epic should avoid another long preparation-only loop: once the green-gate contract and diff guard exist, the sequence must converge on one real bounded Codex worker launch that performs a useful scoped task.

## Story Map

1. `docs/stories/7-1-define-green-gate-delivery-readiness-contract.md`
   Defines machine-checkable green-gate readiness and negative fixtures.
2. `docs/stories/7-2-define-bounded-codex-worker-launch-contract.md`
   Defines the exact Codex launch authority envelope without launching.
3. `docs/stories/7-3-block-out-of-scope-diffs-before-worker-mutation.md`
   Blocks unexpected diffs before any real mutating worker launch.
4. `docs/stories/7-4-run-first-supervised-codex-worker-launch.md`
   Runs one approved bounded Codex worker on a boring useful task.
5. `docs/stories/7-5-record-verification-results-and-recovery-evidence.md`
   Records verification results and recovery paths.
6. `docs/stories/7-6-show-green-gate-readiness-in-dev-console.md`
   Shows readiness from real persisted evidence in Dev Console.
7. `docs/stories/7-7-compute-pr-merge-cleanup-eligibility-from-green-gate-evidence.md`
   Computes PR, merge, and cleanup eligibility from evidence without granting action authority.

## Success Measures

- Bob can see what useful thing changed without reading a long evidence trail.
- Bob is not forced to manually manage routine PR/merge/cleanup mechanics when all approved green gates are satisfied.
- The worker cannot expand scope silently.
- The system records enough evidence to recover, review, retry, merge, or clean up safely.
- The next authority request is narrower because the exact remaining gate is visible.

## Stop Lines

Stop and ask for explicit approval before:

- Launching Codex for a real task.
- Launching Claude.
- Launching subscription-agent.
- Expanding provider/model/endpoint scope.
- Accessing secrets.
- Mutating GitHub issues.
- Merging without an approved green-gate rule.
- Deleting branches or worktrees without retained evidence.
- Retaining raw prompts, completions, reasoning traces, provider payloads, or unnecessary source copies.
