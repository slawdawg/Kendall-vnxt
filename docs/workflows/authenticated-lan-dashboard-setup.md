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
systemctl --user stop kendall-cockpit-dashboard.service kendall-cockpit-supervisor.service
```

`pnpm run cockpit:install` configures the local loopback cockpit; it does not
enable this authenticated LAN runtime. Persistent LAN startup needs separate
user-systemd units carrying the LAN-auth environment below (or an equivalent
explicit unit configuration). Do not run both sets of units on the same port.

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
- **Stop**: press `Ctrl-C` in the dashboard terminal, then the supervisor
  terminal. The socket is removed/reused safely on the next supervisor start.
- **Restart**: export the same variables again in each terminal and start the
  supervisor before the dashboard. Do not expose the supervisor TCP port to the
  LAN.

The LAN runtime does not provide self-signup, multiple roles, or SSO. Those are
future extensions behind the same supervisor-owned authentication boundary.
