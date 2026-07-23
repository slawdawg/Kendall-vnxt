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

## Packet Detail Work Graph

When the supervisor has a current, validated advisory parallel-wave snapshot,
Packet Detail shows a **Work Graph** group with wave membership, dependency,
reservation, capacity, reason, freshness, evidence references, and one safe
recovery instruction. It is read-only planning evidence: it does not dispatch
work, call a provider, report review findings, or make work delivery-eligible.
The pipeline map deliberately keeps its compact cards to packet presence, name,
and status.

An unavailable or stale Work Graph is an honest state, not a dashboard fallback.
Refresh the governed manager planning evidence through the normal lane workflow,
which sends the redacted graph only through the private manager-to-supervisor
UDS intake and persists it on the matching authoritative lifecycle event, then
refresh Packet Detail. Same-key replays are idempotent; changed graph evidence
needs a new immutable intake key. Candidate/import metadata and the public
work-packet endpoint are never Work Graph inputs. The supervisor migration is additive: an
older supervisor can safely ignore the nullable lifecycle column during an
application rollback; do not drop or rewrite retained lifecycle evidence.
In LAN-auth mode this group is returned only through
the existing session-bound private-UDS mediator; never expose or copy the
supervisor socket, bootstrap password, prompts, provider payloads, source/diff
content, worktree paths, or host command output to the browser.

## Packet Detail Review route

Packet Detail can also show a **Review route** group when the supervisor has a
validated, versioned metadata-only review projection from the existing private
manager-to-supervisor UDS intake. The compact pipeline card remains limited to
packet presence, name, and status.

`Report only` and `Simulated` both mean **No provider received a live packet.**
The group is read-only: it contains no retry, dispatch, provider, or delivery
controls, and its finding view is a bounded count/severity summary plus safe
evidence references only. It does not expose route or provider identifiers,
exact heads/digests, prompts, completions, source/diff copies, reasoning,
credentials, or provider material.

`Stale — exact head changed` means the evidence is not current review evidence
and cannot be used for delivery. Re-evaluate and reissue bounded review
evidence for the current exact identity. Blocked, vetoed, expired, revoked, or
cancelled evidence likewise names the supervisor-issued safe recovery. Missing
or invalid input renders **Review evidence unavailable** rather than inferring
provider activity.

Only the existing private manager-source intake accepts this projection; public
work-packet intake rejects it. The supervisor validates the complete projection
and retains it only as a versioned wrapper alongside the existing manager graph
metadata on the authoritative lifecycle event—no database migration, generic
transport, or provider call is introduced. To diagnose a local change, run
`pnpm run test:dashboard-pipeline-fixtures` and the focused supervisor command
`uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -q -k review_route_evidence`.

See the repository's [Authenticated LAN dashboard setup](../../docs/workflows/authenticated-lan-dashboard-setup.md)
for first-time host configuration, private-file permissions, certificate setup,
startup order, and failure diagnosis.

For the default-disabled local attestation detail panel, see the [Epic 25 local dogfood attestation setup](../../docs/workflows/epic-25-local-dogfood-attestation-setup.md).

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

If a managed worktree reports a missing Playwright executable, install its test
browsers into the same repository-local cache that the E2E configuration uses:

```bash
PLAYWRIGHT_BROWSERS_PATH=.data/ms-playwright pnpm exec playwright install chromium webkit
```

The WebKit runs are Safari/iOS approximations, not physical-device coverage.
