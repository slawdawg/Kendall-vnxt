# Fresh VM Reboot Proof

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`
Repo path: `/home/slaw_dawg/Kendall_Nxt`

## Scope

Bob approved reboot proof and performed the reboot interactively because sudo
requires a password on the fresh Ubuntu VM. Codex then ran read-only
post-reboot verification.

No package installs, repo changes, GitHub auth changes, or credential changes
were performed during post-reboot verification.

## Reconnect Check

```bash
whoami
hostname
uptime
```

Result:

- SSH reconnected.
- User was `slaw_dawg`.
- OS hostname was `kendallvnxt`.
- Uptime showed the VM had just rebooted.

## Verification Command

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt'
```

## Result

Pass with expected hostname warning.

## Checks

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
| GitHub auth | pass |
| Repo | pass: `/home/slaw_dawg/Kendall_Nxt`, branch `main` |
| Repo preflight | pass |

## Next Proof

Complete one real Kendall_Nxt work cycle from the Linux VM.
