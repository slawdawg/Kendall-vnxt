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
KENDALL_NXT_ROOT="${KENDALL_NXT_ROOT:?Set KENDALL_NXT_ROOT to the Kendall_Nxt checkout path}"
CODEX_WORKSPACES_ROOT="${CODEX_WORKSPACES_ROOT:?Set CODEX_WORKSPACES_ROOT to the Codex workspace state root}"

[ -d "$KENDALL_NXT_ROOT" ] || { echo "Missing repo checkout: $KENDALL_NXT_ROOT" >&2; exit 1; }
[ -d "$CODEX_WORKSPACES_ROOT" ] || { echo "Missing Codex state root: $CODEX_WORKSPACES_ROOT" >&2; exit 1; }

tmux new-session -d -s codex-1 -c "$KENDALL_NXT_ROOT" \
  env CODEX_WORKSPACE_OWNER=codex-1 CODEX_THREAD_ID=tmux-codex-1 \
  codex --no-alt-screen \
    --cd "$KENDALL_NXT_ROOT" \
    --add-dir "$CODEX_WORKSPACES_ROOT" \
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

## Delivery-session receipts

Before a worker is asked to use the existing `finish-pr` lifecycle, the manager
may record a metadata-only delivery-session receipt in its existing ledger. The
receipt binds the admitted task, managed worktree, immutable admission HEAD,
command digest, and the post-handoff manager-owned active worker's exact lease,
single Codex pane, tmux session, and start time. It moves only through
`requested`, `running`, `terminal`, or `unknown`.
It is a reconnect breadcrumb only: it does not run `finish-pr` and is never
delivery, push, PR, merge, or cleanup evidence.

Use the existing handoff wrapper for a read-only projection or a receipt-only
write after the admitted manifest, worker, pane CWD, and checkout HEAD agree:

`node ./scripts/manager-worker-handoff.mjs --summary-json --delivery-session-receipt --run-id <run> --task-id <task> --worker-id <worker> --session-name <session> --worktree-path <managed-worktree> --head <admission-40-char-head> --command 'node ./scripts/codex-workspace.mjs finish-pr <task> --verify scoped'`

Adding `--apply` records or advances only the manager-ledger receipt. It never
submits a pane command, starts/reuses a tmux session, or runs `finish-pr`.
Use `--receipt-running` only after the same bound receipt is observed running;
use `--terminal-exit-code <n> --terminal-completed-at <ISO-8601> --result-head <40-char-head>` only after a
matching requested receipt exists. The result HEAD is the checkout observed
after `finish-pr`; it is distinct from the immutable admission HEAD and the
completion time cannot precede receipt creation. Neither status is delivery evidence: inspect
the existing `codex-workspace` and GitHub gates before any delivery conclusion.

## Active-worker delivery instruction

For an already-active worker that is bound to the exact receipt identity, the
manager may persist a delivery instruction with `--delivery-instruction`; the
worker may later record `--delivery-ack`. Both operations are ledger metadata
only. They never send tmux input, restart a pane, capture terminal text, run
`finish-pr`, or prove a delivery result. If the worker, receipt, pane,
worktree, or HEAD is stale or mismatched, report `unknown` and inspect rather
than retrying or recreating the worker.

If the named session disappears, its worker/worktree identity changes, or a
terminal result is missing or malformed, atomically record the matching receipt
or instruction as `unknown` and
inspect the manager worker and existing `codex-workspace` gates. Do not retry a
delivery command, create another tmux session, or infer success from pane text.
Receipt records retain metadata and digests only; raw pane capture, terminal
output, prompts, completions, credentials, and provider payloads are prohibited.

### Worker-local instruction acknowledgement

An already-active worker can inspect and acknowledge one existing instruction
without using the tmux handoff route:

```bash
node ./scripts/manager-worker-delivery-instruction.mjs --summary-json --apply \
  --state-root <manager-state-root> --run-id <run> --worker-id <worker> \
  --task-id <task> --lease-id <active-lease>
```

The worker-local command derives the session, pane, worktree, command, and
expected HEAD only from the existing manager receipt and instruction. It rejects
caller-supplied paths, heads, commands, or session names; it also returns
`unknown` when the active lease, manifest, worker record, pane binding, or
filesystem-read current HEAD changes. Its only write is one atomic
acknowledgement (or `unknown`) to `delivery-instructions.json`. It does not poll,
launch a process, inspect or write tmux, run git or GitHub commands, invoke
`finish-pr`, or prove delivery. The returned next action is advisory: normal
worker-local verification, review, manifest, GitHub, and exact-head `finish-pr`
gates remain independently required.
