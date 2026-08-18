# Authenticated LAN dashboard setup

This guide starts the dashboard in authenticated HTTPS LAN mode for one local
operator. It is intentionally a dogfood setup: the certificate below is
self-signed unless you replace it with a certificate trusted by your devices.
SSO/OIDC is not implemented yet; the supported identity is the supervisor-owned
single `operator` account created from the private bootstrap-password file.

## Prerequisites

- A checked-out Kendall_Nxt tree with `pnpm run setup` and `pnpm run preflight`
  already passing.
- A Linux user who owns the checkout (do not run the services as root).
- A numeric IPv4 or IPv6 address reachable by the client device. The dashboard
  rejects wildcard, hostname, loopback, mapped, and zone-qualified binds.
- `openssl` for the dogfood certificate, or a trusted certificate/key pair
  whose subject alternative name (SAN) contains the exact numeric LAN address.

Keep the supervisor and dashboard on the same host. The browser talks only to
the HTTPS dashboard; the supervisor remains behind its private Unix socket.

## 1. Find the numeric LAN address

Run this on the host:

```bash
ip -4 route get 1.1.1.1
```

Use the address following `src` (for example, `192.168.1.8`) as `LAN_IP` in
the commands below. If the host has several interfaces, choose the address
that the client device can reach and use that same value everywhere.

For Tailnet-only access, use the host's Tailscale IPv4 instead:

```bash
tailscale ip -4
```

Use that numeric result in place of `LAN_IP` throughout this guide, including
the certificate SAN, dashboard bind, allowed host/origin, and supervisor CORS
origin. Open the resulting HTTPS numeric URL from a Tailnet device; this
runtime intentionally does not bind a wildcard address or start plain HTTP.

```bash
export LAN_IP="192.168.1.8" # replace with the address from the command above
```

## 2. Create private auth material

Use a directory directly under `$HOME`. Every ancestor of the socket and
private files must not be group- or world-writable; paths such as
`~/.local/share/kendall` commonly fail this check when an ancestor is mode
`775`.

```bash
export AUTH_DIR="${HOME}/kendall-lan-auth"
mkdir -p "$AUTH_DIR"
chmod 700 "$AUTH_DIR"
umask 077
```

Create the bootstrap password interactively. The input is hidden and is never
written to the terminal or sent to Kendall:

```bash
printf 'Kendall operator password: '
IFS= read -r -s OPERATOR_PASSWORD
printf '\n'
printf '%s\n' "$OPERATOR_PASSWORD" > "$AUTH_DIR/bootstrap-password"
unset OPERATOR_PASSWORD
chmod 600 "$AUTH_DIR/bootstrap-password"
```

Do not put the password in shell history, `.env` files, source control, or
chat. Verify only metadata:

```bash
stat -c '%A %n' "$AUTH_DIR" "$AUTH_DIR/bootstrap-password"
```

## 3. Create or install the HTTPS certificate

For local dogfooding, create a self-signed certificate with the LAN address in
its SAN. Browsers will show a trust warning until the certificate is installed
in the device's trust store.

```bash
openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
  -days 825 \
  -keyout "$AUTH_DIR/dashboard.key" \
  -out "$AUTH_DIR/dashboard.crt" \
  -subj "/CN=$LAN_IP" \
  -addext "subjectAltName=IP:$LAN_IP"

chmod 600 "$AUTH_DIR/dashboard.key" "$AUTH_DIR/dashboard.crt"
```

For a trusted deployment, replace these files with a certificate and private
key issued by the organization's CA or another trusted issuer. The certificate
SAN must contain the exact address used in the URL; a hostname certificate is
not a substitute for a numeric bind.

## 4. Start the supervisor

### Stop the legacy cockpit units first

If the user-level cockpit autostart is installed, it can keep respawning the
older HTTP dashboard on port `3000` and a separate TCP supervisor. Stop those
units before this manual LAN-auth run:

```bash
systemctl --user stop kendall-cockpit-dashboard.service kendall-cockpit-supervisor.service kendall-cockpit.target
systemctl --user disable kendall-cockpit.target
```

`pnpm run cockpit:install` configures the local loopback cockpit; it does not
enable this authenticated LAN runtime. Persistent LAN startup is supported by
the separate `lan-auth:*` user-systemd commands below. Do not run both sets of
units on the same port.

In terminal 1, from the repository root, export the same auth directory and
start the supervisor:

```bash
cd "$HOME/Kendall_Nxt"
export LAN_IP="192.168.1.8" # use the address selected in step 1
if [[ "$LAN_IP" == *:* ]]; then export URL_HOST="[$LAN_IP]"; else export URL_HOST="$LAN_IP"; fi
export AUTH_DIR="${HOME}/kendall-lan-auth"
export KENDALL_LAN_AUTH_ENABLED=true
export KENDALL_SUPERVISOR_TRANSPORT=private_uds
export KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE="$AUTH_DIR/bootstrap-password"
export KENDALL_SUPERVISOR_UDS_PATH="$AUTH_DIR/supervisor.sock"
export SUPERVISOR_CORS_ORIGINS="https://${URL_HOST}:3000"

pnpm run dev:supervisor
```

Leave this process running. On first startup it creates the operator account.
Changing the contents of the bootstrap file and restarting rotates the
operator password and revokes existing sessions.

## 5. Start the secure dashboard

In terminal 2:

```bash
cd "$HOME/Kendall_Nxt"
export LAN_IP="192.168.1.8" # use the address selected in step 1
if [[ "$LAN_IP" == *:* ]]; then export URL_HOST="[$LAN_IP]"; else export URL_HOST="$LAN_IP"; fi
export AUTH_DIR="${HOME}/kendall-lan-auth"
export KENDALL_LAN_AUTH_ENABLED=true
export KENDALL_DASHBOARD_BIND_ADDRESS="$LAN_IP"
export KENDALL_DASHBOARD_PORT=3000
export KENDALL_DASHBOARD_TLS_CERT_FILE="$AUTH_DIR/dashboard.crt"
export KENDALL_DASHBOARD_TLS_KEY_FILE="$AUTH_DIR/dashboard.key"
export KENDALL_SUPERVISOR_UDS_PATH="$AUTH_DIR/supervisor.sock"
export KENDALL_DASHBOARD_ORIGIN="https://${URL_HOST}:3000"
export KENDALL_DASHBOARD_ALLOWED_HOST="${URL_HOST}:3000"

pnpm run dev:dashboard
```

The dashboard performs a supervisor startup-gate check before listening. Open
`https://${URL_HOST}:3000` from a client on the LAN. Accept the self-signed
certificate warning for dogfood use, then sign in as `operator` with the
password entered in step 2. The authenticated root is the Overview page and
loads its monitoring data through the session-aware dashboard proxy. The
authenticated `/pipeline` route loads its packet list in the browser through
that same session-aware proxy, so Next server rendering never reads the
supervisor directly. Opening a runtime packet uses the fixed
`/api/packet-detail/<packet-id>` mediator over the private supervisor UDS; an
expired session shows a sign-in prompt, while an unavailable packet read stays
an explicit unavailable state. Demo routes remain fixture-only and are not
used by the authenticated LAN path.
runtime sends HSTS on every LAN-auth response after HTTPS is established;
because this host is dedicated to the dashboard, that policy includes
subdomains. It intentionally does not start an HTTP redirect listener. The compact pipeline
cards remain name/status-only; packet detail is available after authentication.

## Troubleshooting and lifecycle

- **`LAN auth supervisor socket directory is unsafe`**: an ancestor is
  group- or world-writable, or the socket parent is not owned by the current
  user. Move the socket under `$HOME/kendall-lan-auth`, run `chmod 700
  "$AUTH_DIR"`, and ensure the existing socket is owned by this user.
- **`LAN auth ... private file ... unsafe`**: the password, certificate, or
  key is a symlink, not owned by this user, or readable by group/others. Use
  `chmod 600` on each file and keep the directory private.
- **Dashboard startup gate unavailable/invalid**: start the supervisor first,
  use the exact same absolute `KENDALL_SUPERVISOR_UDS_PATH` in both terminals,
  and remove only an owned stale socket after stopping the supervisor.
- **No login page**: confirm `KENDALL_LAN_AUTH_ENABLED=true` and that the
  dashboard was started with `pnpm run dev:dashboard`; loopback development
  intentionally remains login-free.
- **Logout was not accepted**: reload the HTTPS dashboard and sign in again so
  the session and synchronizer-CSRF cookies are both fresh. Logout requires
  the session cookie, the CSRF header derived from its non-HttpOnly cookie, and
  the exact HTTPS dashboard origin; do not test it over plain HTTP.
- **Port 3000 is already in use or the old HTTP page returns**: stop
  `kendall-cockpit-dashboard.service` and
  `kendall-cockpit-supervisor.service` as shown above. Their restart policy can
  otherwise bring the old services back while you are testing LAN auth.
- **Certificate warning or failure**: the self-signed certificate must include
  the numeric address in its SAN. Install the certificate in the client trust
  store or replace it with a trusted certificate/key pair.
- **`Projection is stale` backpressure**: the dashboard can read the
  supervisor, but its persisted packet truth is older than the configured
  freshness window. This is intentionally read-only for LAN, Tailscale, and
  local dashboard views; inspect or refresh the actual supervisor sources
  before dispatching work. Do not reset timestamps or suppress the warning to
  make a stale packet appear live.
- **Stop**: press `Ctrl-C` in the dashboard terminal, then the supervisor
  terminal. The socket is removed/reused safely on the next supervisor start.
- **Restart**: export the same variables again in each terminal and start the
  supervisor before the dashboard. Do not expose the supervisor TCP port to the
  LAN.

The LAN runtime does not provide self-signup, generic user management, or SSO.
Those remain future extensions behind the same supervisor-owned authentication
boundary.

## Authenticated operator pages

In LAN-auth mode, `/active-work`, `/attention`, `/queue`, `/audit`,
`/proposed-work`, and `/work-items/:id` read only through the session-bound
dashboard proxy. They are available to `operator`; `test_viewer` remains
limited to the read-only `/pipeline` surface. A missing, expired, or malformed
session stays read-only and shows an explicit sign-in or unavailable state.

If an operator page shows **Unavailable**, confirm the supervisor is running,
the dashboard and supervisor use the same private UDS path, and sign in again.
Use the page retry control after recovery; do not expose the UDS, bootstrap
password, cookies, CSRF token, or supervisor TCP port to diagnose the problem.
The normal non-LAN dashboard retains server-side supervisor reads through
`SUPERVISOR_INTERNAL_URL`.

### WorkItem memory review

An `operator` viewing `/work-items/:id` may see persisted proposal metadata and
the derived LLM-Wiki readiness from the canonical, read-only
`/pipeline-control-plane/work-items/:id/memory-review` endpoint. The read is
metadata-only and exposes an opaque `proposalRouteId` plus a persisted
`revision` for each proposal. Operator review actions send both values; a 409
means another operator or an approved draft/rebuild changed the proposal, so
refresh before deciding again. The server admits only WorkItem-scoped canonical
event/attempt evidence; a metadata string cannot authorize a draft or derived
artifact. `test_viewer` cannot request this operator-only read or its action
routes. A missing or temporarily version-skewed endpoint simply omits the
panel; verify that the supervisor and dashboard are on the same revision, then
use the page retry after restarting the supervisor first. Do not paste vault
content, bootstrap passwords, cookies, or UDS paths into a proposal or
troubleshooting record.

## Independently revocable dashboard verification credential

After the reviewed source contract is installed and the existing private-UDS
supervisor is running, a local operator can create one disposable read-only
browser credential without reading, rotating, or sharing the bootstrap
operator password:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run dashboard:test-viewer -- enable
```

The helper generates the password itself, writes it only to the owner-private
`$AUTH_DIR/test-viewer-password` file, and sends it only across the existing
private supervisor UDS. It prints metadata only—never the password. Use the
**Test viewer** account selection on the canonical HTTPS sign-in page, then
copy the password directly from that private local file into the browser.
Do not place it in a shell variable, terminal history, chat, `.env`, systemd
unit, source control, or test evidence.

The account is named `test_viewer`, defaults to disabled/absent, and has only
`dashboard_read`: authenticated Pipeline reads, Packet Detail reads,
`/auth/session`, and its own logout. The dashboard mediator rejects every
write, credential action, worker/manager/provider/GitHub operation, and any
other supervisor path before it can reach the private UDS. Lifecycle endpoints
are not browser-routable.

Check, rotate, or revoke it locally:

```bash
pnpm run dashboard:test-viewer -- status
pnpm run dashboard:test-viewer -- rotate
pnpm run dashboard:test-viewer -- revoke
```

`rotate` and `revoke` invalidate only `test_viewer` sessions immediately; the
bootstrap operator record and its active sessions are not changed. `revoke`
also removes the local viewer credential file. If the file is lost, run
`revoke` followed by `enable`; no dashboard or supervisor restart is needed.
If the private directory, password file, or UDS ownership/modes are unsafe,
the helper fails closed without printing a path or secret. The normal runtime
restart policy is unchanged: a real supervisor restart revokes all dashboard
sessions.

## Durable user-systemd startup

After completing steps 1–3, set the bind address and install the LAN-auth
target from the repository root. The installer reads only metadata for the
existing private password, certificate, key, and auth directory; it never
copies the password contents into a unit file:

```bash
cd "$HOME/Kendall_Nxt"
export KENDALL_LAN_AUTH_BIND_ADDRESS="$LAN_IP"
export KENDALL_LAN_AUTH_DIR="$AUTH_DIR"
pnpm run lan-auth:install
```

The installer writes a user-scoped target and two services under
`~/.config/systemd/user/`, plus a mode-600 environment file (by default under
`$KENDALL_LAN_AUTH_DIR`) containing paths and non-secret LAN settings. It stops
the legacy loopback cockpit target and child services before enabling the LAN
target. The dashboard service waits for the supervisor and
enforces the private-UDS startup gate before listening.

Use these commands for lifecycle operations:

```bash
pnpm run lan-auth:status
pnpm run lan-auth:restart
pnpm run lan-auth:stop
pnpm run lan-auth:logs
pnpm run lan-auth:uninstall
```

`lan-auth:uninstall` removes only the generated user units and environment
file; it preserves the password, certificate, key, and auth directory. For
boot-before-login startup, enable user lingering if needed:

```bash
loginctl enable-linger "$USER"
```

Preview the generated units without installing them with:

```bash
pnpm run lan-auth:print
```

If a stale socket remains after an unclean stop, stop the LAN target first and
remove only the user-owned `$AUTH_DIR/supervisor.sock`, then run
`pnpm run lan-auth:restart`. Never remove an unknown socket or terminate a
process by a broad name match.

## 6. Persistent Tailnet startup and canonical hostname migration

For Tailnet-only operation, use the dedicated authenticated units rather than
the local `cockpit:install` units. This is the only supported persistent
Tailnet runtime. It binds the dashboard to the current Tailnet IP by default,
but uses one explicit MagicDNS hostname for the browser URL, cookie, CORS, and
Host-header allow-list. The supervisor records that canonical origin and the
exact source revision; the dashboard will not listen unless both match after
the private-UDS startup gate succeeds.

Before any cutover, configure the full MagicDNS name (without a trailing dot)
and prove that the private certificate has a **DNS SAN** for that exact name.
An IP-only SAN is not acceptable for this hostname URL. `tailscale cert` is one
supported provisioning route after HTTPS certificates are enabled for the
Tailnet; a CA-issued certificate with the same DNS SAN is also valid. Enabling
Tailnet HTTPS publishes the machine name in Certificate Transparency, so do
not do it if that disclosure is unacceptable in your environment.

```bash
export AUTH_DIR="$HOME/kendall-lan-auth"
export KENDALL_LAN_AUTH_DIR="$AUTH_DIR"
export KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME="kendallvnxt-1.tail045dec.ts.net" # replace from tailscale status --json Self.DNSName, without the trailing dot
# Keep dashboard.crt/dashboard.key as the existing private CA trust root. The
# active dashboard must use a separate least-privilege leaf pair.
export KENDALL_DASHBOARD_TLS_CERT_FILE="$AUTH_DIR/dashboard-leaf.crt"
export KENDALL_DASHBOARD_TLS_KEY_FILE="$AUTH_DIR/dashboard-leaf.key"
# After Tailnet HTTPS is enabled, issue/install a leaf whose DNS SAN covers the
# configured hostname at the two leaf paths above. Do not replace the CA files.
tailscale cert --cert-file "$KENDALL_DASHBOARD_TLS_CERT_FILE" --key-file "$KENDALL_DASHBOARD_TLS_KEY_FILE" "$KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME"
chmod 600 "$KENDALL_DASHBOARD_TLS_CERT_FILE" "$KENDALL_DASHBOARD_TLS_KEY_FILE"

# Read-only: proves current node identity, certificate DNS SAN, canonical
# origin, and source revision before any unit is written or stopped.
pnpm run lan-cockpit:preflight
```

If preflight reports that the certificate DNS SAN does not match, stop there.
The existing listener stays untouched while the certificate is reissued. This
is the expected result for a certificate containing only `IP:100.86.154.99`
when the canonical URL is the MagicDNS hostname above.

Only after preflight succeeds, stop the manual LAN-auth processes and disable
the legacy local cockpit target so no TCP supervisor or second dashboard can
reclaim port 3000. The installer repeats preflight before it changes units:

```bash
systemctl --user disable --now kendall-cockpit.target
pnpm run lan-cockpit:install
pnpm run lan-cockpit:status
```

The installer writes `kendall-lan-cockpit.target`,
`kendall-lan-supervisor.service`, `kendall-lan-manager.service`, and
`kendall-lan-dashboard.service` under `~/.config/systemd/user/`. It stores no
password or key in the unit files; all services reference the existing private
`~/kendall-lan-auth/` directory.

The target-owned manager service starts only after, requires, and is bound to
the private-UDS supervisor. It runs the existing manager loop in dry-run,
`read_only_projection` mode at a five-second cadence and discards its stdout;
it creates no listener, executes no selected action, and does not retain a
manager payload in the service journal. That mode skips capability-posture and
recovery-housekeeping writes while still publishing the existing metadata-only
handoffs. A blocked preflight still publishes its existing metadata-only
Coordination Health receipt, then exits nonzero. `Restart=on-failure` with
`RestartSec=5` deliberately starts the next read-only publication attempt
before the dashboard's 15-second freshness window expires.

The default listener bind is `tailnet-ip`. Do not use an all-interface bind
unless it is explicitly required and reviewed; that mode requires both
`KENDALL_DASHBOARD_BIND_MODE=all-interfaces` and
`KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES=true` before preflight. The canonical
hostname, exact Host allow-list, and certificate DNS SAN remain mandatory.

### Tailnet address rotation, health proof, and controlled recovery

When a Tailnet address changes, do not repeatedly restart the dashboard or
edit its unit file. `lan-cockpit:preflight` validates the configuration passed
in its invoking shell; it does not inspect a running systemd service. Before a
prospective rotation check, source or export the same canonical configuration
used for installation, including the all-interface pair only when that is the
installed bind mode:

```bash
cd "$HOME/Kendall_Nxt"
export AUTH_DIR="$HOME/kendall-lan-auth"
export KENDALL_LAN_AUTH_DIR="$AUTH_DIR"
export KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME="kendallvnxt-1.tail045dec.ts.net" # replace from tailscale status --json Self.DNSName, without the trailing dot
export KENDALL_DASHBOARD_TLS_CERT_FILE="$AUTH_DIR/dashboard-leaf.crt"
export KENDALL_DASHBOARD_TLS_KEY_FILE="$AUTH_DIR/dashboard-leaf.key"
# Required only when the installed cockpit intentionally listens on every interface:
export KENDALL_DASHBOARD_BIND_MODE=all-interfaces
export KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES=true
pnpm run lan-cockpit:preflight
pnpm run lan-cockpit:restart
pnpm run lan-cockpit:status
```

`lan-cockpit:status` reports the target, supervisor, manager, and dashboard.
`lan-cockpit:restart` restarts the supervisor first, then the UDS-gated manager
and dashboard. The supervisor upholds the manager unit, so a manager stopped by
a supervisor failure is restarted when that supervisor recovers; the manager
remains read-only and does not start a TCP service.

For an installed-runtime audit, inspect the generated unit environment and
prove the canonical URL through each intended interface. The URL stays on the
canonical hostname; `--resolve` changes only the probe's address selection.
Do not pass `--insecure` in routine checks.

```bash
export TAILNET_HOST="$KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME"
export LAN_IPV4="192.168.1.8" # replace with the current LAN address
export TAILNET_IPV4="$(tailscale ip -4)"
systemctl --user show kendall-lan-supervisor.service kendall-lan-dashboard.service -p WorkingDirectory -p Environment --no-pager
# Local CA-signed leaf only. The retained dashboard.crt is the trust root:
curl --fail --silent --show-error --cacert "$AUTH_DIR/dashboard.crt" --resolve "${TAILNET_HOST}:3000:${LAN_IPV4}" "https://${TAILNET_HOST}:3000/_kendall/runtime-health"
curl --fail --silent --show-error --cacert "$AUTH_DIR/dashboard.crt" --resolve "${TAILNET_HOST}:3000:${TAILNET_IPV4}" "https://${TAILNET_HOST}:3000/_kendall/runtime-health"
# For a Tailscale-issued leaf, use the same two canonical-host --resolve probes
# without --cacert so normal system trust validates its actual issuer.
curl --fail --silent --show-error --unix-socket "$AUTH_DIR/supervisor.sock" http://localhost/internal/lan-auth/startup-gate
```

The health response is metadata-only: it proves `ready`, the canonical origin,
and the paired runtime revision. It never returns a password, session, private
key, or supervisor payload. A Host header other than the configured hostname
is rejected before application routing.

If preflight, certificate identity, paired runtime state, or the UDS startup
gate is rejected, keep the Tailnet dashboard stopped while investigating:

```bash
systemctl --user stop kendall-lan-cockpit.target
```

This is reversible: the generated supervisor and dashboard units are part of
that target, so one stop propagates to both. Inspect/fix the preflight or
restore the last known-good source revision before reinstalling. Do not delete
or hand-edit `tailnet-origin.json` or `tailnet-runtime.json`; a successful
paired start recreates them. For a temporary host-only recovery, first confirm
the Tailnet target is stopped, then reinstall the loopback cockpit with
`pnpm run cockpit:install`; it must not expose the supervisor or dashboard to
LAN or Tailnet clients.
