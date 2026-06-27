# Tmux Codex Worker Smoke Run

Date: 2026-06-27
Status: active guidance

## Purpose

Run operator-visible Codex workers in named tmux sessions while preserving a
reviewable authority boundary. This is the launch runbook for the first
parallel worker loop before continuous mode.

## Worker Sessions

Use one session and owner per worker:

```text
codex-1
codex-2
codex-3
codex-4
codex-5
codex-6
```

Set `CODEX_WORKSPACE_OWNER` to the matching session name.

## Smoke-Run Authority

The smoke run authorizes one complete lane loop per launched worker:

1. `dispatch-next --dry-run --summary-json --readiness doctor`
2. `dispatch-next --apply --readiness doctor`
3. Enter the returned managed worktree.
4. Implement the assigned safe backlog story.
5. Run relevant verification and review.
6. Commit, push, open or update a PR.
7. Resolve actionable CI and review feedback.
8. Merge by default for normal low-risk lanes.
9. Cleanup the merged managed workspace and branch.
10. Stop and leave a final status in the tmux session.

Do not claim a second lane during a smoke run.

## Launch Shape

Prefer Codex's normal sandbox and approval model for the first worker:

```bash
tmux new-session -d -s codex-1 -c /home/slaw_dawg/Kendall_Nxt \
  env CODEX_WORKSPACE_OWNER=codex-1 CODEX_THREAD_ID=tmux-codex-1 \
  codex --no-alt-screen \
    --cd /home/slaw_dawg/Kendall_Nxt \
    --add-dir /home/slaw_dawg/.codex-workspaces/slawdawg-kendall-vnxt \
    --sandbox workspace-write \
    --ask-for-approval on-request \
    "<worker prompt>"
```

Use `danger-full-access` and `--ask-for-approval never` only when the operator
has explicitly approved that risk for the current smoke wave and the launch is
otherwise blocked. Prefer launching one worker first, then expanding.

## Stop Lines

Workers must stop and report instead of continuing when they encounter:

- Secrets, credentials, token handling, or authentication-state changes.
- Destructive data/schema migrations.
- Provider, worker, or process authority expansion outside the assigned Codex
  session.
- Failed or unknown checks the worker cannot fix.
- Unresolved requested changes or ambiguous review-thread state.
- Ambiguous exact-head merge state.
- Unsafe cleanup or branch/head mismatch.
- Scope outside the assigned lane.

## Supervisor Loop

The supervising Codex session should:

- Check `tmux list-sessions` before launch.
- Record session, owner, selected lane, branch, worktree, PR, status, and
  blocker summary.
- Poll panes sparingly with `tmux capture-pane -pt codex-# -S -200`.
- Relay only blockers, questions, PR links, merge results, cleanup results, and
  extreme-risk findings to the operator.
- Do not hide launch failures. If the platform blocks a launch, record the
  rejection and reduce the launch surface.

