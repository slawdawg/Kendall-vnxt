---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 1.2: Enforce Local Identity And Platform Preflight Gates

Status: review

## Story

As a bootstrap operator,
I want the installer to fail closed before mutation on unsafe or unsupported hosts,
so that unsupported machines are not partially changed.

## Acceptance Criteria

1. Given the bootstrap is run as `root`, when local identity validation runs, then it fails before mutation with recovery guidance to use a non-root sudo-capable Linux user.
2. Given the bootstrap is run on a non-Ubuntu host or Ubuntu older than 26.04, when local identity validation runs, then it fails before mutation with Ubuntu 26.04+ recovery guidance.
3. Given `sudo` is unavailable, when local identity validation runs, then it fails before mutation with sudo recovery guidance.
4. Given the home filesystem has less than 5 GB free, when local identity validation runs, then it fails before mutation with free-space recovery guidance.
5. Given `github.com` cannot resolve through local DNS, when local identity validation runs, then it fails before mutation with network/DNS recovery guidance.
6. Given local identity validation fails, when verify-only writes evidence, then the evidence result is `fail`, includes the failed `local-identity` gate, and validates against the bootstrap evidence schema.

## Tasks / Subtasks

- [x] Add or confirm direct local identity unit coverage for unsafe host states. (AC: 1-5)
  - [x] Root user fails before mutation.
  - [x] Unsupported OS/version fails before mutation.
  - [x] Missing sudo fails before mutation.
  - [x] Insufficient disk fails before mutation.
  - [x] GitHub DNS failure fails before mutation.
- [x] Add or confirm controller evidence coverage for failed local identity. (AC: 6)
  - [x] Verify-only writes failure evidence.
  - [x] Failure evidence validates against the schema.
  - [x] No package/repo/setup mutations are recorded.
- [x] Run focused verification. (AC: 1-6)
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR3: refuse `root` before mutation.
  - FR4: refuse unsupported operating systems and Ubuntu versions older than 26.04 before mutation.
  - FR5: verify current user has sudo capability before install work proceeds.
  - FR6: verify local identity, hostname, architecture, home directory, free disk space, and `github.com` DNS readiness.
- Architecture input: `docs/linux-install/planning/linux-install-architecture-input.md`
  - Gate architecture includes `local-preflight` and `local-identity` before base tools, repo state, install script, full verify, and evidence write.
- Current code:
  - `scripts/lib/linux-bootstrap/gates.mjs` implements `localIdentityScript`, `parseTargetIdentity`, and `validateTargetIdentity`.
  - `tests/linux-bootstrap/*.test.mjs` already has controller coverage for unsupported Ubuntu 24.04 failure evidence.

### Target Files

- `tests/linux-bootstrap/*.test.mjs`
- `scripts/lib/linux-bootstrap/gates.mjs` only if tests expose a real behavior gap.
- `docs/linux-install/planning/lane-status.md`
- This story file and tracked story copy.

### Implementation Guardrails

- Do not run package installs, provider calls, login flows, reboot, cleanup, PR creation, merge, or GitHub operations for this story.
- Prefer tests around existing gate behavior before changing implementation.
- Keep failure behavior typed as `local-identity` with actionable recovery guidance.
- Do not weaken current Ubuntu 26.04+, sudo, disk, or DNS requirements.

### Testing Requirements

Run:

```bash
node ./scripts/check-linux-install-lane.mjs
node ./scripts/check-doc-indexes.mjs
node ./scripts/check-linux-bootstrap.mjs
node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json
```

### References

- `docs/prds/linux-install-mvp.md`
- `docs/linux-install/planning/linux-install-architecture-input.md`
- `docs/linux-install/planning/linux-install-epics-and-stories.md`
- `scripts/lib/linux-bootstrap/gates.mjs`
- `tests/linux-bootstrap/*.test.mjs`

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/gates.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Expanded `tests/linux-bootstrap/gates.test.mjs` from broad failure coverage to direct unsafe-state checks with recovery guidance for root, unsupported OS/version, missing sudo, insufficient disk, and GitHub DNS failure.
- Confirmed existing controller coverage writes schema-valid failure evidence for unsupported local identity and records no mutation.
- Verification passed:
  - `node --test tests/linux-bootstrap/gates.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `tests/linux-bootstrap/gates.test.mjs`
- `docs/linux-install/planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md`
- `_bmad-output/implementation-artifacts/1-2-enforce-local-identity-and-platform-preflight-gates.md`
