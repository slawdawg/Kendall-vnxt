# Fresh VM BMAD Method CLI Verification

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`
Repo path: `/home/slaw_dawg/Kendall_Nxt`

## Scope

Bob approved and ran an interactive install of the BMAD Method CLI/package on
the VM. Codex then ran read-only verification.

No `bmad-method install` command was run during verification. No project BMAD
files, `.claude` files, provider credentials, repo files, or SSH private keys
were modified by this verification.

## Direct CLI Check

| Tool | Result |
| --- | --- |
| BMAD Method CLI | pass: `/usr/local/bin/bmad-method`, `6.8.0` |

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
| BMAD Method CLI | pass: `6.8.0` |
| GitHub auth | pass |
| Repo | pass: `/home/slaw_dawg/Kendall_Nxt`, branch `main` |
| Repo preflight | pass |

## Remaining Decision

The Linux VM now satisfies the full technical baseline proof, including BMAD
Method CLI. The active operating decision is to treat `kendall-linux` as the
primary Kendall_Nxt development baseline.
