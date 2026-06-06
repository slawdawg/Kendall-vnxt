# Dashboard

Next.js operator surface for the Kendall supervisor.

## Run

From the repo root:

```bash
pnpm run setup
pnpm run dev:dashboard
```

The dashboard expects the supervisor API on `http://localhost:8000` unless overridden by environment variables in the root README.

## Verification

```bash
pnpm run lint:dashboard
pnpm run build:dashboard
```
