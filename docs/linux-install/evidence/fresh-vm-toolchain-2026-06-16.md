# Fresh VM Toolchain Verification

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`
Mode: verify-only, repo skipped

## Command

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt --skip-repo'
```

## Result

Pass with expected warnings.

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
| GitHub auth | warn: manual auth still required |
| Repo | warn: skipped by option |

## Notes

No GitHub auth was performed. No repo clone was performed. No reboot was
performed. The remaining setup path is manual GitHub auth, repo clone, repo
setup, full verify, reboot proof, and first real work-cycle proof.
