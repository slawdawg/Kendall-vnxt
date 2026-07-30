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

1. Run the normal manager continuous loop with its configured loopback
   supervisor URL. The same cycle computes the canonical coordination snapshot,
   posts it to `/manager-control-plane/coordination-health-handoffs`, and
   verifies the exact supervisor GET readback.
2. Open `http://localhost:3000/pipeline`. The dashboard receives only the
   supervisor projection and renders the peer panel.
3. Follow its next safe action. Incomplete, dirty-preserve, or journal-hold
   states remain non-mutating until canonical manager evidence changes.

The dashboard normally uses supervisor port `8000`. If it is unavailable, do
not start a substitute service or treat the panel as current; restore the
normal supervisor startup path, then publish a newer manager receipt.

## Recovery and verification

Use the manager's normal cycle to resend a newer canonical snapshot. Same-key
replays are idempotent; a changed snapshot needs a newer source sequence. Do
not edit supervisor data or bypass the loopback receipt/readback boundary.

Focused verification:

```bash
node --test --test-name-pattern='manager coordination health' tests/manager-control-plane.test.mjs
uv run --directory services/supervisor pytest -q tests/test_manager_coordination_health_handoff.py tests/integration/test_pipeline_coordination_health_receipt.py
pnpm run test:dashboard-pipeline-fixtures
```

For dashboard visual verification use Chromium plus the configured WebKit
approximation. WebKit is an iPad/iPhone Safari approximation, not physical
device proof. The panel remains read-only in both targets.
