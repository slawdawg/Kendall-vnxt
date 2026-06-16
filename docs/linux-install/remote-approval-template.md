# Remote Approval Template

Status: draft v1

Use this packet before any remote apply, reboot, cleanup, SSH mutation, package
installation, service change, or credential-related change.

## Approval Packet

- Approval id:
- Target alias:
- Target user:
- Target hostname:
- Operation family:
- Exact command or script:
- Mode:
- Expected packages changed:
- Expected files changed:
- Expected services changed:
- Expected auth changes:
- Reboot required:
- Evidence destination:
- Rollback plan:
- Rollback limits:
- Recovery path if SSH fails:
- Stop lines:
- Approval text:

## Example: Future Apply Approval

- Approval id: `linux-bootstrap-apply-YYYYMMDD-01`
- Target alias: `kendall-linux`
- Target user: `slaw_dawg`
- Target hostname: `Kendall_vNxt`
- Operation family: `apply`
- Exact command or script: `node ./scripts/linux-bootstrap.mjs --apply --target kendall-linux --user slaw_dawg`
- Mode: bounded remote mutation
- Expected packages changed: Node, pnpm, uv, gh, git, build/runtime packages listed by dry run
- Expected files changed: Kendall_Nxt repo checkout/update paths, optional shell profile PATH entries after dry-run confirmation
- Expected services changed: none unless listed by dry run
- Expected auth changes: none; GitHub auth remains manual
- Reboot required: no; any reboot needs a separate approval
- Evidence destination: approved repo evidence folder
- Rollback plan: restore backed-up files, report package changes, preserve evidence
- Rollback limits: package manager cannot guarantee exact pre-existing transitive state without snapshot
- Recovery path if SSH fails: use VM console, restore SSH config or `authorized_keys` backup
- Stop lines: host-key mismatch, wrong user, wrong OS, private key input, GitHub auth automation, unexpected reboot
- Approval text: `I approve linux-bootstrap-apply-YYYYMMDD-01 for kendall-linux as slaw_dawg.`

## Reboot Approval

Reboot approval must be separate and must name the target alias, reason, expected
downtime, recovery path, and verification command to run after the VM returns.
