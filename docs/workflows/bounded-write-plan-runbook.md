# Bounded-write plan runbook

Status: **metadata-only plan; no writes enabled**

The bounded-write contract is the next step after a governed read-only review.
It prepares a narrow write plan but does not write files, mutate Git, launch a
worker, call a provider, or clean up a workspace.

## Required gates

The plan stays `hold` unless all of these are present and bound to the same
operation, owner, worktree, and exact head:

1. A governed read-only review has an explicit `PASS` result on the approved
   model/effort route.
2. Deterministic exact-state, changed-file allowlist, status-check,
   review-thread, freshness, and rollback evidence passes.
3. A bounded-write authority record has `decision: approved-bounded-write`,
   `allowed: true`, `scopeAllowed: true`, and matching owner/worktree values.
4. A human activation checkpoint is approved with a fresh, exact-head-bound
   timestamp, owner, and worktree.

Before the human checkpoint, the returned `writePlan` is metadata-only and
`execution.attempted` is always `false`. Even after all gates pass, the fake
executor only reports `wouldApply`; it never performs the write.

## Verification

Run the deterministic contract test:

```bash
pnpm run test:review-gated-low-risk-bounded-write
```

High-risk paths, stale or ambiguous reviews, missing rollback evidence,
contradictory ownership, external-action intents, and malformed checkpoints
fail closed. Do not add provider credentials, raw prompts/completions, or
activation evidence containing secret values to the packet.
