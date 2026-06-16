# Fresh VM Real Work Cycle Proof

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`
Repo path: `/home/slaw_dawg/Kendall_Nxt`

## Scope

This proof completed one bounded Kendall_Nxt work cycle from the Linux VM:

- Checked VM repo status.
- Ran Codex workspace doctor.
- Fixed repo-local Git hook configuration.
- Created an isolated Codex experiment worktree.
- Made a temporary docs-only change inside the Linux worktree.
- Ran targeted docs verification from the Linux worktree.
- Removed the experiment worktree, branch, and manifest.
- Confirmed the VM main clone was clean afterward.

No package installs, GitHub auth changes, reboot, private key movement, provider
calls, or remote service launches were performed.

## Results

| Check | Result |
| --- | --- |
| Main repo status before work | clean on `main...origin/main` |
| Codex workspace doctor | passed after setting `core.hooksPath=.githooks` |
| Experiment worktree | created under VM Codex workspace state |
| Temporary docs change | created in isolated worktree |
| Targeted verification | `pnpm run check:docs` passed |
| Cleanup | experiment worktree, branch, and manifest removed |
| Main repo status after cleanup | clean on `main...origin/main` |

## Notes

The first doctor run found `core.hooksPath` was not configured in the VM clone.
This was fixed with repo-local Git config:

```bash
git config core.hooksPath .githooks
```

A first attempt to create the temporary docs change through nested
PowerShell-to-SSH-to-Node quoting failed before mutation. The successful path
used a PowerShell here-string piped to `ssh` and `tee`.

## Conclusion

The fresh Ubuntu VM completed a real create/verify/cleanup work cycle from
Linux. A later gap review found Codex CLI and Claude Code were missing from the
baseline requirements; those agent CLIs were subsequently installed and
verified in `fresh-vm-agent-clis-2026-06-16.md`.
