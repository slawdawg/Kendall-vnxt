# Gate 4 Continuous Manager Source Intake Closeout

Date: 2026-07-12
Status: implemented and verification-bound

## Delivered boundary

The source-backed manager seed/refill planner now reaches the supervisor-owned
authoritative WorkPacket route from the long-lived manager path only when all
of these facts are simultaneously true:

1. exactly one seed is eligible and its planner/discovery projections agree;
2. the operator supplied an uncredentialed loopback supervisor base URL;
3. the explicit intake dry-run rebuilt the same seed and returned an allowed,
   ready canonical target without fetching;
4. continuous apply retained the same command family, mutation class, action
   code, and candidate/packet/source/supervisor target;
5. the distinct `sourceIntake` capability and continuation gates remained open.

Default seed, refill, cycle, and run-loop commands remain network-free. A
non-eligible, needs-review, dedupe/skipped, blocked, missing-source, ambiguous,
non-loopback, malformed, or identity-conflicting state stops before fetch or
fails closed before any success claim.

## Preserved denials

This slice creates no CandidateWork, WorkItem, dispatch, lease, execution
attempt, worker process, provider call, credential access, source mutation, or
raw BMAD retention. It does not widen delivery, cleanup, dispatcher, worker, or
provider authority. Source-owned BMAD hierarchy remains source evidence only;
the adapter transmits and persists bounded allowlisted lifecycle metadata.

## Verification contract

`pnpm run test:manager-source-intake` proves standalone compatibility,
network-free defaults and dry-run, refill/cycle/run-loop action selection,
blocked-state no-fetch behavior, exact pair/capability failures, real loopback
supervisor persistence and projection, and zero downstream side effects.
`node ./scripts/check-manager-control-plane.mjs` keeps the command/test registry
and forbidden-boundary checks aligned.
