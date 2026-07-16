# Epic 25 local dogfood attestation setup

This slice is disabled by default and is for local, non-production dogfooding
only. It produces `integrated_local` metadata and never authorizes
`live_observed`, deployment, provider, or production decisions.

## Enable the supervisor feature

Create an owner-only envelope secret and an issuer registry containing the
public development key. Keep the private issuer key outside the repository.

```bash
install -d -m 700 "$HOME/.config/kendall"
install -d -m 700 "$HOME/.cache/kendall/supervisor"
openssl rand -base64 32 > "$HOME/.config/kendall/local-dogfood-envelope.secret"
chmod 600 "$HOME/.config/kendall/local-dogfood-envelope.secret"
printf '%s\n' '{"environment":"local_dogfood","sourceRevision":"<40-lowercase-hex-revision>","sourceRefs":["<exact-source-ref>"],"evidenceRefs":["<exact-evidence-ref>"]}' > "$HOME/.config/kendall/local-dogfood-observation.json"
chmod 600 "$HOME/.config/kendall/local-dogfood-observation.json"
install -d -m 700 "$HOME/.cache/kendall/supervisor/local-dogfood-consumed"
```

Generate an Ed25519 development key outside the repository, then put only its
base64 public key in the registry. For example, this writes owner-only raw
base64 key material and prints the registry value:

```bash
uv run --directory services/supervisor python -c 'import base64; from pathlib import Path; from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; k=Ed25519PrivateKey.generate(); Path.home().joinpath(".config/kendall/local-dogfood-private-key.b64").write_text(base64.b64encode(k.private_bytes_raw()).decode()+"\n"); print(base64.b64encode(k.public_key().public_bytes_raw()).decode())'
chmod 600 "$HOME/.config/kendall/local-dogfood-private-key.b64"
```

Replace the observation placeholders with the exact packet source/evidence
metadata and canonical `sourceRevision` used by the packet. The observation
JSON must be byte-for-byte equivalent as canonical metadata or observation is
rejected; ordinary packets without this explicit local metadata remain blocked.
When creating an authoritative packet, put the same binding fields inside its
`sourceRef` object (`environment`, `sourceRevision`, `sourceRefs`, and
`evidenceRefs`); the supervisor persists and snapshots those fields as the
server-owned authorization contract.

Set these values in the supervisor environment:

```bash
SUPERVISOR_ENABLE_LOCAL_DOGFOOD_ATTESTATION=true
SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_BIND_HOST=127.0.0.1
SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ENVELOPE_SECRET_FILE="$HOME/.config/kendall/local-dogfood-envelope.secret"
SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH="$HOME/.cache/kendall/supervisor/local-dogfood-api.sock"
SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_SOCKET_PATH="$HOME/.cache/kendall/supervisor/local-dogfood-observer.sock"
SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ISSUER_REGISTRY='[{"issuerId":"issuer-local","keyId":"dev-key-1","publicKeyB64":"<development-public-key>"}]'
NEXT_PUBLIC_LOCAL_DOGFOOD_ATTESTATION_BRIDGE_ORIGIN=http://127.0.0.1:8102
```

The normal supervisor startup intentionally refuses this flag in the loopback
TCP profile: this release does not run two Uvicorn listeners, so it fails closed
instead of replacing the dashboard's normal TCP listener. Keep the flag false
for the normal loopback dashboard, or enable it with LAN authentication where
the attestation API socket is exactly the authenticated `SUPERVISOR_UDS_PATH`.
In LAN-auth mode, read-only attestation readbacks are available only through
that private UDS; browser mutations still require the operator session and CSRF
token. Do not expose the attestation socket directly or use this pre-alpha
profile for production evidence.

The API socket parent must be an owner-only directory (`0700`) and the socket
must be owner-only. The supervisor refuses to start when the feature is enabled
with a remote bind, proxy/trusted-forwarding headers, shared directories, or a
missing secret.

## Run the separate local issuer and bridge

The issuer receives only a server-minted, MAC-protected authorization over the
private observer UDS. The dashboard bridge is a GET-only numeric-loopback
listener; it does not expose the supervisor over LAN and does not accept
forwarding headers.

```bash
uv run --directory services/supervisor python scripts/local_dogfood_attestation_issuer.py \
  --socket "$HOME/.cache/kendall/supervisor/local-dogfood-observer.sock" \
  --observation-json "$HOME/.config/kendall/local-dogfood-observation.json" \
  --private-key-file "$HOME/.config/kendall/local-dogfood-private-key.b64" \
  --envelope-secret-file "$HOME/.config/kendall/local-dogfood-envelope.secret" \
  --consumed-dir "$HOME/.cache/kendall/supervisor/local-dogfood-consumed"
KENDALL_LOCAL_DOGFOOD_BRIDGE_HOST=127.0.0.1 \
KENDALL_LOCAL_DOGFOOD_BRIDGE_PORT=8102 \
KENDALL_LOCAL_DOGFOOD_DASHBOARD_ORIGIN=http://127.0.0.1:3000 \
SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH="$HOME/.cache/kendall/supervisor/local-dogfood-api.sock" \
node apps/dashboard/scripts/local-dogfood-attestation-bridge.mjs
```

The disposable demo (`uv run --directory services/supervisor python scripts/local_dogfood_attestation_demo.py`)
starts an isolated supervisor test app and issuer, authorizes and observes one
explicitly bound packet, then prints readback evidence. A successful readback is
labelled integrated local; missing, expired, replayed, revoked, rotated, or
malformed receipts remain blocked. The dashboard panel is reserved for a future
dual-listener slice; pipeline cards remain limited to packet name and status.

For a manually hosted test app, the request sequence is:

```bash
curl --silent --fail --unix-socket "$HOME/.cache/kendall/supervisor/local-dogfood-api.sock" \
  -X POST "http://localhost/local-dogfood/attestations/packets/<packet-id>/authorizations"
curl --silent --fail --unix-socket "$HOME/.cache/kendall/supervisor/local-dogfood-api.sock" \
  -X POST "http://localhost/local-dogfood/attestations/authorizations/<authorization-id>/observe"
curl --silent --fail --unix-socket "$HOME/.cache/kendall/supervisor/local-dogfood-api.sock" \
  "http://localhost/local-dogfood/attestations/targets/<packet-id>"
```

For a clean reset, stop the issuer and bridge, remove only their local socket
files, and use targeted attestation-row cleanup in the supervisor database; do
not delete the shared supervisor database. Leave any source/evidence fixtures
untouched. Do not use this setup for production evidence.
