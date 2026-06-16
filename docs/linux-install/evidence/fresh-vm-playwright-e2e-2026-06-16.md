# Fresh VM Playwright E2E Verification

Date: 2026-06-16
Target: `kendall-linux`
User: `slaw_dawg`
Repo path: `/home/slaw_dawg/Kendall_Nxt`
Status: pass

## Scope

This evidence proves that the Linux VM can run the dashboard Playwright e2e
suite with Chromium after browser dependencies are installed.

This does not approve provider login, paid provider usage, long-running
services, or unattended browser dependency mutation.

## Preconditions

- Ubuntu 26.04 VM is reachable through `kendall-linux`.
- Repo exists at `/home/slaw_dawg/Kendall_Nxt`.
- `@playwright/test` is updated to `1.61.0`.
- Chromium browser cache exists under `/home/slaw_dawg/.cache/ms-playwright`.
- Bob ran the interactive browser dependency installer when sudo was required.

## Command

```bash
cd /home/slaw_dawg/Kendall_Nxt
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright pnpm run test:e2e:dashboard
```

## Result

```text
Running 25 tests using 1 worker
25 passed (3.2m)
```

## Lessons Captured

- Playwright package availability does not prove browser runtime readiness.
- Playwright 1.60.0 cannot install Chromium on Ubuntu 26.04.
- Playwright 1.61.0 can install the required browser on Ubuntu 26.04.
- Browser runtime readiness and e2e test correctness are separate proof points.
- Dashboard e2e assertions must avoid shared fixture counts and ambiguous
  repeated status values.

## Open Boundaries

- Playwright dependency installation is a remote-write operation and may require
  interactive sudo.
- Browser cache updates should happen during a named maintenance window.
- This proof does not certify Tailscale/MagicDNS access.
