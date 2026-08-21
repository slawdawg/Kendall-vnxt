# Local verification lifecycle

Agents use the lifecycle through JSON-only commands:

```sh
pnpm run local-verification -- plan --json --persist
pnpm run local-verification -- start --json
pnpm run local-verification -- status --json
pnpm run local-verification -- resume --json
pnpm run local-verification -- cancel --json
pnpm run local-verification -- shadow --json
pnpm run local-verification -- promotion-status --json
```

`start` plans conservatively, records a source-bound run, and returns
immediately while an owned worker executes the approved argv vectors serially.
Poll with `status`; do not parse child output. `resume` automatically relaunches
recoverable (`unknown`, failed, cancelled, or superseded) work through the same
exclusive start claim; it never asks an agent to choose which checks to run.

Passed receipts are reusable only when the approved argv, environment, planner
policy, commit, and the node's classified input scope are identical. A tiny
documentation correction can therefore retain evidence for an unchanged manager
surface, while the documentation check and repository-wide quick-fail checks run
again. Any unknown scope, malformed state, changed runtime, or policy drift
denies reuse and falls back safely.

When impact is unknown or policy-changing, the plan is the full `pnpm run
check` governed control. That fallback remains required before publication.
Interrupted or unprovable child work is `unknown`, never passed. Cancellation
first enters `cancelling`; it becomes `cancelled` only after the lifecycle can
no longer prove that the owned worker exists. Cancellation only addresses the
lifecycle-recorded worker process group (PID plus OS start identity). State lives outside
tracked source (or at an explicitly Git-ignored state root), and stores bounded
metadata rather than logs, credentials, or source content.

`shadow` explicitly runs the existing full `pnpm run check` for the same source
after a terminal local run, then stores a bounded comparison. The promotion gate
is non-authoritative: no accelerated result replaces the governed check without
an explicit reviewed policy and matching evidence.
