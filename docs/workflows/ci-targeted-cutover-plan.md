# CI Targeted Cutover Plan

Status: in progress. The PR route remains conservative until the evaluator
accepts the policy evidence packet.

## Outcome

Ordinary pull requests receive the smallest required, planner-selected matrix
and a stable `check` fan-in. Full repository confidence moves to post-merge
`dev`, scheduled, and manual routes. Unknown, shared, workflow, dependency,
and migration surfaces still fail closed to a named elevated matrix.

## Delivery slices

1. Define the versioned evidence schema and deterministic promotion evaluator.
   It records source identity, cache control, routing vector, duration metrics,
   first actionable failure, and outcome for both baseline and proposed routes.
2. Emit baseline and shadow artifacts for workspace and supervisor alongside
   existing static-bundle evidence. A final evidence job collects GitHub job
   queue/setup/execution/wall timings and writes an immutable sample packet.
3. Refine planner selection from "all behavior shards" to the affected shard(s)
   plus the named shared core. Keep unknown/shared routing explicitly elevated.
4. Add an opt-in, deterministic controlled-failure workflow route. It is a
   standalone scheduled/manual workflow, so experimental evidence collection
   cannot prevent the required PR CI from starting. After merge, it collects
   two ordinary and two controlled pairs per UTC day, aggregates only
   successful isolated-cache observations, retains each planner-selected
   shard/profile set in the observation, and publishes the evaluator packet
   and status artifact. Each vector must prove the same failure reaches both
   baseline and proposed final fan-ins.
5. Run full confidence after merge to `dev`, plus scheduled and manual routes,
   before reducing any aggregate PR requirement.
6. Collect at least 20 ordinary and 20 controlled-failure same-head pairs per
   declared selection vector over at least five UTC days. The evaluator rejects
   mismatched heads/bases/lockfiles, unequal cache control, detection loss,
   increased flake/retry rate, a duration P95 regression over 10%, or slower
   first actionable failure.
7. Commit the authority cutover only after the evaluator reports ready for every
   vector: targeted matrices become required, `check` fans them in, and legacy
   aggregate PR jobs are removed. Full confidence remains required off-PR.
8. Verify the cutover from a clean head, publish the acceptance packet, and
   retain a documented rollback commit that restores the legacy aggregate path.

## Current evidence

The first same-head shadow run passed all behavior shards. The artifact from
run `32432992908` binds the same head, base, lockfile, and runner environment
for both routes: the supervisor baseline executed in 12m05s versus a 2m29s
proposed critical path, and the workspace baseline executed in 14m02s versus
4m57s proposed. These are observed-cache measurements only, so they are not
promotion evidence yet. A prior supervisor run had an intermittent full-suite
timeout in a test that passed in isolation and on retry; it remains part of the
flake baseline rather than being discarded.
