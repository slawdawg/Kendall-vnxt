# Dashboard

Next.js operator surface for the Kendall supervisor.

## Run

From the repo root:

```bash
pnpm run setup
pnpm run dev:dashboard
```

The dashboard expects the supervisor API on `http://localhost:8000` unless overridden by environment variables in the root README.

The default dev and start commands bind to `0.0.0.0` so you can reach the dashboard through the VM's LAN or Tailscale address.

## Verification

```bash
pnpm run lint:dashboard
pnpm run build:dashboard
pnpm run test:e2e:dashboard
```
