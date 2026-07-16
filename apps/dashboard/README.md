# Dashboard

Next.js operator surface for the Kendall supervisor.

## Run

From the repo root:

```bash
pnpm run setup
pnpm run dev:dashboard
```

The dashboard expects the supervisor API on `http://localhost:8000` unless overridden by environment variables in the root README.

The default dev and start commands bind to loopback for local-only use. LAN
access requires `KENDALL_LAN_AUTH_ENABLED=true`, an explicit numeric bind, TLS
certificate/key files, a private supervisor UDS path, and the supervisor-owned
startup gate; the dashboard never reads the supervisor bootstrap secret and
does not create a plain HTTP LAN listener.

In LAN-auth mode the custom runtime serves the standalone sign-in surface and
proxies only the fixed authentication routes over the supervisor UDS. Protected
Next routes are session-gated; Packet Detail reads use the bounded read mediator.

Docker Compose explicitly opts into `KENDALL_DASHBOARD_CONTAINER_MODE=true`
and `KENDALL_DASHBOARD_HOST=0.0.0.0` so the dashboard can reach the compose
network and host-published port. Do not copy those container-only values into
local development; LAN-auth mode still requires the numeric HTTPS bind.

## Verification

```bash
pnpm run lint:dashboard
pnpm run build:dashboard
pnpm run test:e2e:dashboard
```
