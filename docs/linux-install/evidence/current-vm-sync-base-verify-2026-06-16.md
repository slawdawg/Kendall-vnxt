# Current VM Sync And Base Verification

Date: 2026-06-16
Target: `kendall-linux`
User: `slaw_dawg`
Repo path: `/home/slaw_dawg/Kendall_Nxt`
Status: pass

## Scope

This evidence records that the Linux VM clone was synced to merged `main` after
the auth-boundary docs update, then verified against the base bootstrap
contract.

This proof does not require GitHub login, provider login, Tailscale enrollment,
provider calls, paid usage, long-running services, or agent execution.

## Commands

```bash
cd /home/slaw_dawg/Kendall_Nxt
git fetch origin
git reset --hard origin/main
pnpm install
pnpm run preflight
bash scripts/validate-linux-install.sh --verify-only
bash scripts/bootstrap-linux.sh --verify-only
tailscale ip -4 || true
```

## Result

- VM clone synced to `origin/main`.
- `pnpm install` reported already up to date.
- `pnpm run preflight` passed.
- `validate-linux-install.sh --verify-only` passed with generic defaults:
  current remote user, observed hostname, and `$HOME/Kendall_Nxt`.
- `bootstrap-linux.sh --verify-only` passed.
- Tailscale reported `NeedsLogin`.

## Boundary Notes

- `NeedsLogin` is post-install Tailscale enrollment state, not a base bootstrap
  failure.
- GitHub/provider/Tailscale authentication remains user-performed
  post-deployment work only when a selected workflow needs it.
- No private keys, tokens, auth URLs, credential helper output, or broad
  environment dumps were retained.
