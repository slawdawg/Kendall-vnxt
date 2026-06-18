# Fresh Install And Rerun Validation Transcript

Date: 2026-06-18
Host: `ubuntutest`
User: `slaw_dawg`
Ubuntu: `26.04`
Repo: `https://github.com/slawdawg/Kendall-vnxt.git`
Branch: `main`
Commit: `2b75c5da120c26fdc817b6a9f659ce5e08f8b424`

## Evidence Files

- First install: `docs/linux-install/evidence/local-install-20260618T201830Z.json`
- Same-host rerun: `docs/linux-install/evidence/local-install-20260618T202116Z.json`

## Validation Output

```text
=== host ===
slaw_dawg
ubuntutest
PRETTY_NAME="Ubuntu 26.04 LTS"
NAME="Ubuntu"
VERSION_ID="26.04"
VERSION="26.04 (Resolute Raccoon)"
VERSION_CODENAME=resolute
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=resolute
=== repo ===
main
2b75c5da120c26fdc817b6a9f659ce5e08f8b424
https://github.com/slawdawg/Kendall-vnxt.git
=== evidence files ===
1781814080.0885302510 docs/linux-install/evidence/local-install-20260618T202116Z.json
1781813922.4056659830 docs/linux-install/evidence/local-install-20260618T201830Z.json
=== selected evidence ===
first=docs/linux-install/evidence/local-install-20260618T201830Z.json
rerun=docs/linux-install/evidence/local-install-20260618T202116Z.json
=== validate first install evidence ===
$ node ./scripts/check-linux-bootstrap-evidence.mjs -- docs/linux-install/evidence/local-install-20260618T201830Z.json
docs/linux-install/evidence/local-install-20260618T201830Z.json: Linux evidence OK
first_validation_exit=0
=== validate rerun evidence ===
$ node ./scripts/check-linux-bootstrap-evidence.mjs -- docs/linux-install/evidence/local-install-20260618T202116Z.json
docs/linux-install/evidence/local-install-20260618T202116Z.json: Linux evidence OK
rerun_validation_exit=0
```

## Result

First-install and same-host rerun evidence both validated successfully on the
new Ubuntu 26.04 host. The full JSON evidence files remain on `ubuntutest` at
the paths above.
