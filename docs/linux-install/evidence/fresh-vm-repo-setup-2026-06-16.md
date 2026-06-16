# Fresh VM Repo Setup Verification

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`
Repo path: `/home/slaw_dawg/Kendall_Nxt`

## Scope

GitHub authentication was completed manually by Bob inside an SSH session on
the VM. Codex then verified auth status without retaining raw token output,
verified private repo access, cloned the repo, ran setup, and ran verify-only.

No reboot was performed. No SSH private key was copied. No GitHub token values,
token scopes, auth URLs, or credential helper output were retained.

## Commands

```bash
gh auth status >/dev/null 2>&1
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
git clone https://github.com/slawdawg/Kendall-vnxt.git /home/slaw_dawg/Kendall_Nxt
cd /home/slaw_dawg/Kendall_Nxt && pnpm run setup
```

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt'
```

## Result

Pass with expected hostname warning.

## Checks

| Check | Result |
| --- | --- |
| GitHub auth | pass: `gh auth status` succeeded |
| Private repo access | pass: private repo HEAD resolved |
| Clone | pass: repo cloned to `/home/slaw_dawg/Kendall_Nxt` |
| Setup | pass: `pnpm run setup` completed |
| User | pass: `slaw_dawg` |
| Hostname | warn: expected VM/display identity `Kendall_vNxt`, OS hostname observed `kendallvnxt` |
| OS | pass: Ubuntu 26.04 |
| Git | pass: `2.53.0` |
| Node | pass: `v22.22.1` |
| pnpm | pass: `11.5.2` |
| uv | pass: `0.11.21` |
| gh | pass: `2.46.0` |
| Repo | pass: branch `main` |
| Repo preflight | pass |

## Next Proofs

- Run full `pnpm run check` on the VM.
- Run reboot proof after separate reboot approval.
- Complete one real work cycle from the Linux VM.
