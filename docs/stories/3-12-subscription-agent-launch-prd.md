# Story 3.12: Subscription Agent Launch PRD

Status: done
## Status

Ready for Review

## Story

As the Kendall_vNxt operator,
I want subscription-agent launch requirements drafted before implementation,
so that any future direct process launch is constrained by approval binding, lifecycle, workspace, output, session, rollback, dashboard, and evidence boundaries.

## Acceptance Criteria

1. A subscription-agent launch PRD is added.
2. The PRD states implementation is not approved.
3. The PRD defines goals, non-goals, required gates, approval binding, process lifecycle, workspace, output, session/secret, dashboard, runtime export, acceptance, rollback, and open questions.
4. The PRD keeps process launch disabled.
5. Architecture gap docs point future launch work to the PRD and its open questions.
6. No launcher, command runner, provider call, source mutation, credential access, network access, premium execution, or background runtime assistant behavior is added.

## Implementation Notes

- Added `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`.
- Refreshed architecture/gap docs so launch implementation remains deferred behind PRD review and explicit approval.

## Verification

- `git diff --check`

## Safety Gates Upheld

- Docs-only planning slice.
- No process launch authority enabled.
- No runtime code changed.
