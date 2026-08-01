# Pipeline Coordination Health

## Purpose

The read-only **Coordination Health** panel is always visible beside the
`/pipeline` Manager Execution Lane. It shows one supervisor-projected,
metadata-only manager workspace-inventory receipt. It is not a second tracker,
does not inspect worktrees in the browser, and does not grant execution,
cleanup, delivery, or provider authority.

## What the panel means

- **Active work** is the canonical manager assignment count.
- **Stale-owner scope** is shown as `projected / total`. A projected count
  smaller than total is deliberately **incomplete**, not an estimate that may
  be acted on.
- **Dirty preserves** are worktrees that must remain intact; the panel never
  offers cleanup for them.
- **Missing-worktree journal hold** means a stale record may require the
  manager journal before any lifecycle change.
- **Source** is always `manager_workspace_inventory`; **freshness** and the
  manager's next safe action are displayed with the receipt.

When the receipt is absent, malformed, stale, future-dated, or the supervisor
is unavailable, the panel says **unavailable**. That is intentional fail-closed
behavior: it does not reconstruct local state from browser data, fixtures, or
an alternate lifecycle model.

## Normal flow

1. Run the normal manager continuous loop. In ordinary local development it
   uses the configured loopback supervisor URL. In authenticated LAN mode,
   load the generated LAN runtime environment first; the same cycle detects
   `KENDALL_SUPERVISOR_TRANSPORT=private_uds` and uses the configured private
   `KENDALL_SUPERVISOR_UDS_PATH` instead. In either mode it computes the
   canonical coordination snapshot, posts it to
   `/manager-control-plane/coordination-health-handoffs`, and verifies the
   exact supervisor GET readback.
2. Open the configured dashboard origin (the installed LAN runtime exposes it
   as `$KENDALL_DASHBOARD_ORIGIN/pipeline`). The dashboard receives only the
   supervisor projection and renders the peer panel.
3. Follow its next safe action. Incomplete, dirty-preserve, or journal-hold
   states remain non-mutating until canonical manager evidence changes.

The dashboard normally uses supervisor port `8000` only in loopback development.
In authenticated LAN mode, never open or restore a TCP supervisor listener:
restore the existing private supervisor service and socket, then publish a
newer manager receipt.

## Recovery and verification

Use the manager's normal cycle to resend a newer canonical snapshot. Same-key
replays are idempotent; a changed snapshot needs a newer source sequence. An
ordinary manager preflight hold still republishes its read-only
`manager_workspace_inventory` Coordination Health receipt (and coherent Lane
Clarity when available) before returning the same blocked, non-mutating result.
This makes current blocked, idle, or stale-owner evidence visible; it does not
authorize dispatch, takeover, cleanup, or any other manager mutation. Do not
edit supervisor data or bypass the configured receipt/readback boundary.

For the installed authenticated LAN runtime, start a one-cycle recovery from
the canonical checkout after loading the same private environment file used by
the user services:

```bash
cd "$HOME/Kendall_Nxt"
set -a
. "${KENDALL_LAN_AUTH_ENV_FILE:-$HOME/kendall-lan-auth/lan-auth.env}"
set +a
node ./scripts/manager-run-loop.mjs --summary-json --once
```

The output must show `coordinationHealthHandoff.state` as `published`, with a
`private-uds:` endpoint and `persisted: true`. `laneClarityHandoff` is
`published` only when the cycle has a coherent canonical Lane Clarity summary;
otherwise it remains explicitly `unavailable` and does not invent or post a
replacement summary. A missing, unsafe, or unreachable socket is fail-closed;
repair the private supervisor startup path rather than adding a loopback or
LAN listener.

Focused verification:

```bash
node --test --test-name-pattern='manager coordination health' tests/manager-control-plane.test.mjs
uv run --directory services/supervisor pytest -q tests/test_manager_coordination_health_handoff.py tests/integration/test_pipeline_coordination_health_receipt.py
pnpm run test:dashboard-pipeline-fixtures
```

For dashboard visual verification use Chromium plus the configured WebKit
approximation. WebKit is an iPad/iPhone Safari approximation, not physical
device proof. The panel remains read-only in both targets.
