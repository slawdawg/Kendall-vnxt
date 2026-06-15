# Codex Handoff - Monitoring Dashboard Reboot

Date: 2026-06-14

## Current State

The monitoring-first dashboard UX work is merged to `main`, but the dashboard process currently running at `localhost:3000` is stale.

Verified live response from `http://localhost:3000` still showed the old home UI:

- `Workflow command surface`
- `Start next work` on the home page
- `Live feed`
- old large gradient shell / `Development control plane for BMAD orchestration`

Verified local source on `main` contains the new UI:

- `Mission Control`
- `Monitoring`
- `MonitoringHome`
- `Live activity`
- compact shell copy: `Monitoring, evidence, queue, audit, and deliberate controls for BMAD orchestration.`

Conclusion: code is merged; the running dashboard needs restart/rebuild after reboot.

## Merged PRs

- PR #120: `Implement monitoring-first dashboard home`
- PR #125: `Close monitoring dashboard story`
- PR #126: `Address monitoring dashboard review feedback`

Latest related commits on `main` at handoff time:

```text
13d5421 Address monitoring dashboard review feedback (#126)
98f6918 Close monitoring dashboard story (#125)
1bca6ce Implement monitoring-first dashboard home (#120)
```

## What Changed

- Dashboard home now defaults to a monitoring-first Mission Control surface.
- Home page no longer starts with intake or direct workflow action controls.
- Added `apps/dashboard/src/components/monitoring-home.tsx`.
- Moved intake to `/controls`.
- Kept workflow action buttons on deliberate surfaces such as `/queue` or work-item detail pages.
- Renamed home live stream label from `Live feed` to `Live activity`.
- Reduced shell decoration from the old hero/gradient treatment to a calmer operational shell.
- Added and updated Playwright coverage for:
  - monitoring-first home
  - no authority-gated action buttons on home
  - moved intake flow on `/controls`
  - moved compact workflow action coverage on `/queue`
- Addressed automated review feedback:
  - `approve`, `audit`, and `rework` next steps are treated as authority-gated on the monitoring home.
  - paused realtime refreshes are rescheduled after the pause window instead of dropped.

## Verification Already Completed

Local focused checks passed:

```text
pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "opens to a monitoring-first home"
pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "opens to a monitoring-first home|shows supervisor-owned recipe details during intake|guides a non-coder|advances a work item"
pnpm.cmd --filter @kendall/dashboard build
pnpm.cmd run check:e2e-report
pnpm.cmd run check:docs
pnpm.cmd run check
```

GitHub CI passed for PRs #120, #125, and #126.

Story status:

```text
docs/stories/20-1-monitoring-dashboard-home.md
Status: done
```

## Next After Reboot

1. Confirm repo state:

```powershell
git status --short --branch
git log -3 --oneline
```

Expected branch state:

```text
main...origin/main
13d5421 Address monitoring dashboard review feedback (#126)
98f6918 Close monitoring dashboard story (#125)
1bca6ce Implement monitoring-first dashboard home (#120)
```

2. Restart or rebuild the dashboard process serving `localhost:3000`.

If it is a dev server, start or restart the dashboard:

```powershell
pnpm.cmd --filter @kendall/dashboard dev
```

If it is a production server, rebuild first, then restart the production process:

```powershell
pnpm.cmd --filter @kendall/dashboard build
pnpm.cmd --filter @kendall/dashboard start
```

Use the repo's actual startup process if a scheduled task, supervisor, container, or background service owns port `3000`.

3. Verify `http://localhost:3000` shows the new home.

Expected visible signals:

- `Mission Control`
- `Monitoring`
- `Attention queue`
- `Live activity`
- `Read-only evidence`

Unexpected stale signals:

- `Workflow command surface`
- `Start next work` on `/`
- `Live feed`
- `Development control plane for BMAD orchestration`

4. If `localhost:3000` is still stale after restart:

- Check which process owns port `3000`.
- Confirm it is running from `C:\Users\slaw_dawg\Kendall_Nxt`.
- Confirm it pulled or sees commit `13d5421` or later.
- Clear any old `.next` build only if the process is definitely using stale local build output and after confirming the path is within this repo.

## Safety Notes

- Do not treat the reboot/startup step as approval for unrelated source mutation, provider calls, paid calls, process-launch expansion, cleanup deletion, issue sync, or failed-check bypass.
- The dashboard restart is operational verification of already-merged code.
- Run Windows shell commands one at a time in this workspace.

