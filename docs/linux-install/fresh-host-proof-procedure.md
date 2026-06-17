# Kendall Vnxt Fresh Ubuntu Proof Procedure

Status: draft v1

Use this procedure to prove the one-command Kendall Vnxt installer on a fresh
or reset Ubuntu 26.04-or-later host.

## Purpose

Feature-complete proof requires two real-host runs:

1. First install run on a fresh or reset Ubuntu host.
2. Rerun on the same host proving idempotency.

Both runs must produce evidence under:

```text
$HOME/Kendall_Nxt/docs/linux-install/evidence/
```

## Preconditions

The host must be:

- Ubuntu 26.04 or later.
- Logged in locally as a non-root user with sudo permissions.
- Connected to the internet.
- Able to resolve GitHub.
- Fresh or reset enough that the install proves the documented bootstrap path.

Do not perform provider login, Codex login, Claude login, Tailscale enrollment,
service startup, or reboot during this proof unless a separate step explicitly
requires it.

## Source Selection

For pre-merge validation, run the current workspace or explicit test-branch
script content and record the source in evidence notes. Do not claim the
published GitHub `main` command is proven until:

```bash
pnpm run check:linux-bootstrap-url
```

passes from the repo that contains the final installer changes.

For final published proof, use the README command exactly:

```bash
tmp=/tmp/kendall-vnxt-bootstrap.sh; url=https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh; if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$tmp"; elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp" "$url"; else sudo apt-get update && sudo apt-get install -y curl ca-certificates && curl -fsSL "$url" -o "$tmp"; fi && bash "$tmp" --install-kendall-vnxt
```

## First Install Proof

Run the selected single bootstrap command from the local Ubuntu terminal.

Expected result:

- Command exits `0`.
- Repo exists at `$HOME/Kendall_Nxt`.
- `pnpm run setup` completed.
- `scripts/validate-linux-install.sh --verify-only` passed.
- A `local-install-*.json` evidence file exists under
  `docs/linux-install/evidence/`.

From the repo checkout, validate the evidence:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run check:linux-bootstrap-evidence -- docs/linux-install/evidence/<first-install-evidence>.json
```

Record:

- Hostname.
- Ubuntu version.
- Current user.
- Repo branch and commit.
- Bootstrap source used: GitHub `main`, test branch, or local workspace copy.
- Evidence filename.
- Any manual recovery needed before rerun.

## Idempotency Proof

Run the same selected single bootstrap command again on the same host.

Expected result:

- Command exits `0`.
- Existing repo is validated rather than destructively replaced.
- Existing repo validation confirms the `origin` remote matches the intended
  repo before setup runs.
- Existing tools are accepted or upgraded only through approved package/tool
  commands.
- Existing `pnpm@11.5.2` is not reinstalled through npm when already present.
- Existing `uv` and `uvx` commands skip the uv installer when already present.
- Existing Codex CLI, Claude Code, and BMAD Method commands are not reinstalled
  through npm when already present.
- A second `local-install-*.json` evidence file exists.
- If the rerun happens within the same second as another evidence write, the
  script must choose a numeric suffix instead of overwriting the prior packet.
- No provider login, Codex login, Claude login, Tailscale enrollment, browser
  auth, token writes, reboot, or service launch occurred.

Validate the second evidence packet:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run check:linux-bootstrap-evidence -- docs/linux-install/evidence/<idempotency-evidence>.json
```

Record:

- Evidence filename.
- Whether any package/tool command changed state on rerun.
- Whether repo state remained intact.
- Any failed or blocked gate and the recovery used.

## Completion Criteria

The installer proof is complete only when:

- First install evidence validates.
- Idempotency evidence validates.
- Both evidence files use `target.address_source: "local-session"`.
- Both evidence files include auth-boundary proof and manual auth tasks.
- No alternate install method was used.
- The proof source matches the claim:
  - GitHub `main` proof requires the raw README URL check to pass.
  - Pre-merge proof must be labeled as branch/workspace proof only.

## Failure Handling

If the command fails:

- Do not switch to manual multi-step install as a workaround.
- Capture the failed terminal summary and any evidence file if one was written.
- Update [lessons-learned.md](lessons-learned.md) and the installer script in
  the same work pass.
- Rerun the same single-command path after fixing the root cause.
