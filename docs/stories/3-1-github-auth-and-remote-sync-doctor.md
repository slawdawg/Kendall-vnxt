# Story 3.1: GitHub Auth And Remote Sync Doctor

## Status

Ready for Review

## Story

As an operator,
I want a read-only GitHub sync doctor,
so that remote delivery blockers are visible before supervisor-managed GitHub automation attempts to push, create PRs, check CI, or merge.

## Acceptance Criteria

1. The repo exposes a `pnpm run doctor:github` command that checks local Git delivery readiness without mutating credentials or repository state.
2. The doctor detects origin configuration, credential helper drift, the known risky `gh auth git-credential` helper override, Windows GCM `credentialStore` posture, and GitHub CLI auth availability.
3. The default command is safe for local and CI environments by avoiding network calls unless `--remote` is provided.
4. `pnpm run doctor:github -- --remote` verifies live `origin` connectivity with `git fetch origin` and `git ls-remote --heads origin main`.
5. GitHub CLI auth failures are warnings, not hard failures, when Git remotes are otherwise healthy, because Git Credential Manager can still support ordinary Git push/fetch flows.
6. `--strict` is available when an operator or automation wants warnings to become failures.
7. The full workspace check remains green after the new command is added.

## Notes

- This story hardens the architecture around the blocker resolved on June 8, 2026: stale GitHub CLI credential-helper wiring can break remote sync even when the repo, CI workflow, and GitHub PR are otherwise healthy.
- The first slice is intentionally diagnostic rather than self-healing. Automatic credential rewrites are too risky for a default workflow.
- Supervisor remote delivery still requires GitHub CLI authentication for live PR automation. This doctor separates that requirement from the lower-level Git Credential Manager path needed for fetch and push.

## Evidence

- `pnpm run doctor:github` passes with warnings for missing GitHub CLI auth and skipped network checks.
- `pnpm run doctor:github -- --remote` passes live Git remote checks with `git fetch origin` and `git ls-remote --heads origin main`.
- `pnpm run check` passes.

## Residual Operational Warning

GitHub CLI auth is still unavailable in this session. Normal Git remote checks pass through Git Credential Manager, but supervisor live PR automation still expects `gh auth status` to pass before it can create, check, and merge PRs itself. If the earlier transient DPAPI error returns, the doctor reports the credential-storage failure with an interactive recovery hint instead of collapsing into a generic Git prompt error.
