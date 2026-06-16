# Fresh VM Agent CLI Verification

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`
Repo path: `/home/slaw_dawg/Kendall_Nxt`

## Scope

Bob installed the required agent CLIs interactively on the VM. Codex then ran
read-only verification.

No OpenAI or Anthropic login, token handling, provider calls, paid usage,
reboot, repo changes, or SSH private key movement were performed by this
verification.

## Direct CLI Check

| Tool | Result |
| --- | --- |
| Codex CLI | pass: `/usr/local/bin/codex`, `codex-cli 0.140.0` |
| Claude Code | pass: `/usr/local/bin/claude`, `2.1.178 (Claude Code)` |

## Full Validator

Command:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt'
```

Result: pass with expected hostname warning.

| Check | Result |
| --- | --- |
| User | pass: `slaw_dawg` |
| Hostname | warn: expected VM/display identity `Kendall_vNxt`, OS hostname observed `kendallvnxt` |
| OS | pass: Ubuntu 26.04 |
| Git | pass: `2.53.0` |
| Node | pass: `v22.22.1` |
| pnpm | pass: `11.5.2` |
| uv | pass: `0.11.21` |
| gh | pass: `2.46.0` |
| Codex CLI | pass: `0.140.0` |
| Claude Code | pass: `2.1.178` |
| GitHub auth | pass |
| Repo | pass: `/home/slaw_dawg/Kendall_Nxt`, branch `main` |
| Repo preflight | pass |

## Remaining Decision

The Linux VM now satisfies the technical baseline proof. The remaining step is
an operating-policy decision: declare `kendall-linux` the primary Kendall_Nxt
development baseline and define how provider CLI logins are handled.
