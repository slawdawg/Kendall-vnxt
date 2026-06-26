# GitHub Connector Workflow

Use this workflow when Codex needs GitHub PR inspection, PR creation, review metadata, or merge support without relying on local GitHub CLI authentication.

## Supported Auth Split

- Use the platform's normal secure Git credential helper for ordinary
  `git fetch`, `git pull`, and `git push`.
- Use the Codex GitHub connector/app for repository inspection, PR reads, PR creation, review requests, draft/ready transitions, and other Codex-managed GitHub operations.
- Use local `gh` auth only for workflows that explicitly shell out to `gh`.

Do not keep a persistent `gh auth login --insecure-storage` token as a workaround for Git Credential Manager or connector problems.

## Connector Readiness Check

From a Codex session with the GitHub connector available, run a read-only repository probe:

```text
Use the GitHub connector to list the five most recent pull requests for slawdawg/Kendall-vnxt.
```

The probe is accepted when Codex can see recent PRs for `slawdawg/Kendall-vnxt` without asking for a local `gh` token.

Record the result in the session handoff or PR notes as:

```text
GitHub connector probe: passed; recent PRs visible for slawdawg/Kendall-vnxt.
```

If the connector is unavailable, do not switch to plaintext token storage. Use Git/GCM for ordinary branch pushes and pause connector-backed PR automation until the connector is restored.

## Delivery Flow

1. Confirm local state:

```bash
git status --short --branch
pnpm run doctor:github -- --remote
```

2. Push the branch with Git and the configured credential helper:

```bash
git push origin <branch>
```

3. Use the GitHub connector for PR creation or inspection.
4. Include local verification and connector probe status in the PR body.
5. Keep `gh auth status` warnings non-blocking unless the workflow explicitly requires `gh`.

## PR Resolution Flow

Use this flow for small dependency, bot, stale-lane, and hygiene PRs so GitHub
handling does not rely on ad hoc local state.

1. Gather current PR metadata with the connector or `gh pr view --json`.
   Record PR number, URL, base branch, head branch, exact `headRefOid`, draft
   state, merge state, changed files, review decision, and check rollup.
2. Fetch thread-aware review data before merge. An empty flat comment list or a
   green check rollup is not enough to prove review state.
3. Inspect changed files with supported commands such as
   `gh pr diff <number> --name-only`; do not assume optional `gh` flags are
   available on the installed CLI version.
4. Keep verification isolated from dirty local work. For bot or dependency PRs,
   create a temporary detached worktree from the PR head, run the smallest
   relevant checks there, and remove the temporary worktree after the PR is
   resolved.
5. For Python/uv checks, prefer repo wrappers that set workspace-local cache
   directories. If direct `uv run --directory services/supervisor ...` fails in
   the sandbox with a read-only `$HOME/.cache/uv` error, rerun the exact same
   read-only verification command outside the sandbox instead of changing test
   scope.
6. If a broad suite hangs or stops producing useful output, record it as
   inconclusive, stop the run cleanly, and run focused verification that covers
   the changed surface. Do not treat the interrupted broad suite as passing or
   failing.
7. Merge only with exact-head protection, for example
   `gh pr merge <number> --merge --delete-branch --match-head-commit <headRefOid>`,
   after the current evidence still proves the PR is low risk.
8. After merge, verify the merged PR state, fetch with prune, and confirm the
   branch deletion or remaining branch state.

For Dependabot security bumps, treat the security release note as urgency, not
as automatic merge authority. The PR is still low risk only when it has a
current exact head SHA, clean merge state, no unresolved review threads, green
required/reported checks, a narrow dependency diff, and local focused
verification for the affected package.

## Stale PR And Branch Cleanup

Before closing stale GitHub PRs or deleting remote branches, classify each item
from current GitHub and workspace evidence:

- `open active PR`: leave open or resume only through its owning workspace.
- `superseded PR`: comment with the superseding evidence, close the PR, then
  delete the remote head only after confirming the branch head matches the
  closed PR head and no active workspace owns it.
- `merged PR head`: delete the remote branch only when the current remote head
  exactly matches a merged PR `headRefOid`, there is no open or closed-unmerged
  PR for that head branch, and no active workspace manifest owns the branch.
- `active workspace branch`: do not delete or repair it from another session.
  Use `node ./scripts/codex-workspace.mjs list --active --json` and the
  workspace takeover flow before any mutation.
- `no PR record` or `SHA mismatch`: preserve the branch until a separate
  inspection proves whether its commits are already integrated or intentionally
  abandoned.

## Failure Handling

- If Git remote commands fail with credential-helper errors, recover through
  the platform's interactive credential-manager flow.
- If connector reads fail, keep the branch pushed but do not create/update/merge PRs through a local token fallback.
- If both Git credentials and the connector are unavailable, stop remote
  delivery and leave a local handoff with the branch, commit, verification
  status, and exact blocker.
