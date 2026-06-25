# Branch Foundation Setup

This workflow establishes the Kendall_Nxt branch foundation:

```text
dev -> staging -> main -> prod
```

`main` remains the human gate. `prod` is a protected production lane, not a
routine task base. New Codex work defaults to `dev` after the branch foundation
is established.

## Current Gate

Branch setup is intentionally separated from source implementation. The source
checks can pass while live readiness still reports missing branches or protected
branch warnings.

Use this read-only command first:

```bash
node ./scripts/branch-foundation.mjs plan
```

Expected pre-setup evidence when the real branches are not established:

```text
Authority state: report_only
dev: local=no remote=no
staging: local=no remote=no
prod: local=no remote=no
Planned mutations require approval.
```

If the report shows a protected branch warning, such as dirty `main`, stop
before mutation. Resolve the warning or get an explicit operator decision for
how to proceed. The setup command is expected to refuse while protected branch
warnings remain.

## Approval Packet

Approval must name the operation and scope. A valid approval for local setup is:

```text
I approve creating local dev, staging, and prod branches from main for the branch foundation setup.
```

Run:

```bash
node ./scripts/branch-foundation.mjs apply-local --approval "I approve creating local dev, staging, and prod branches from main for the branch foundation setup."
```

Approval for remote setup is separate:

```text
I approve pushing origin/dev, origin/staging, and origin/prod for the branch foundation setup.
```

Run only after local setup succeeds:

```bash
node ./scripts/branch-foundation.mjs push-remote --approval "I approve pushing origin/dev, origin/staging, and origin/prod for the branch foundation setup."
```

## Stop Lines

Stop and report instead of continuing if any of these occur:

- `main`, `master`, or `prod` would be rewritten, force-pushed, or deleted.
- A command proposes wildcard, mirror, tag, all-branch, deletion, or force refspecs.
- The branch report shows unknown local or remote branch evidence.
- The setup command refuses because of protected branch warnings.
- `git status` shows unrelated user changes that would need cleanup or revert.
- Remote push is rejected or reports unexpected upstream state.

## Verification

After local setup:

```bash
pnpm run test:branch-foundation
pnpm run check:branch-foundation
```

After remote setup:

```bash
pnpm run check:branch-foundation
node ./scripts/branch-foundation.mjs report
```

Established readiness should show:

```text
Readiness status: established
dev: local=yes remote=yes
staging: local=yes remote=yes
main: local=yes remote=yes
prod: local=yes remote=yes
```

Record the branch foundation report, verification commands, and any remaining
warnings in the active lane evidence before starting new work from `dev`.
