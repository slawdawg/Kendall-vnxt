# Cockpit Autostart Runbook

This runbook keeps the Kendall cockpit running as a user-level systemd service.
It starts the supervisor on port `8100` and the dashboard on port `3000`.

The cockpit URL is:

```text
http://127.0.0.1:3000/pipeline
```

## Install

From the repo root:

```text
pnpm run cockpit:install
```

This writes these user systemd units:

```text
~/.config/systemd/user/kendall-cockpit.target
~/.config/systemd/user/kendall-cockpit-supervisor.service
~/.config/systemd/user/kendall-cockpit-dashboard.service
```

The services use `Restart=always`, so systemd restarts them if they crash.
The dashboard unit also pins `KENDALL_PIPELINE_WORKER_EVIDENCE_DIR` to the
repo-root `.kendall-local/governed-worker-evidence/` directory for tools that
prepare or validate governed-worker metadata. The `/pipeline` dashboard render
path remains fixture-backed and must not directly read filesystem evidence,
launch workers, or call provider, GitHub, Obsidian, cleanup, or live network
boundaries.

## Boot Behavior

For startup immediately after the Linux VM boots, user lingering must be
enabled. The installer attempts this:

```text
loginctl enable-linger $USER
```

If that command needs administrator approval, run it manually from an
admin/root session. Without linger, the cockpit starts when the user logs in,
not necessarily at VM boot before login.

## Commands

```text
pnpm run cockpit:status
pnpm run cockpit:restart
pnpm run cockpit:stop
pnpm run cockpit:logs
pnpm run cockpit:uninstall
```

To preview the unit files without installing:

```text
pnpm run cockpit:print
```

## Ports

Defaults:

```text
KENDALL_COCKPIT_DASHBOARD_PORT=3000
KENDALL_COCKPIT_SUPERVISOR_PORT=8100
```

Set those environment variables before `pnpm run cockpit:install` if you need
different ports.

## Boundaries

This autostart setup only keeps the local alpha cockpit running. It does not
grant authority for provider/model calls, real worker launch, GitHub delivery,
canonical Obsidian mutation, source mutation, network egress beyond the local
services, or secret access.
