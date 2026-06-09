# Subscription Agent Launch PRD Review

Date: 2026-06-08
Status: review complete, implementation not approved
Scope: Review of `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`

## Decision Summary

The subscription-agent launch PRD is suitable as a future supervised execution candidate, but it is not approved for implementation.

The next safe work is approval-gated story preparation. Direct launch of Codex, Claude, Gemini, Antigravity, or any other subscription-agent process remains disabled until an operator explicitly approves crossing from disabled launch stubs into supervised process execution.

## Open Questions Resolved For Planning

### First Launch Target

Decision: no concrete launch target is approved.

Required shape for future implementation:

- target must be selected by explicit approval,
- command template must be reviewed before use,
- disabled launch stubs remain the only current behavior,
- implementation stories must support target-specific policy without hardcoding broad command execution.

Rationale: choosing a real agent target implies process, session, and workspace assumptions that need explicit operator approval.

### Patch Artifacts Versus Source Mutation

Decision: first implementation should be artifact-only or patch-only.

Required shape for future implementation:

- launched process may produce artifacts under the attempt artifact root,
- generated patches must be captured as artifacts,
- source mutation remains operator-applied unless a later source-mutation PRD approves otherwise,
- queue leases must not carry source mutation state.

Rationale: direct source mutation combines launch authority with write authority and should not be part of the first launch step.

### Output Artifact Size

Decision: retained stdout/stderr artifacts need bounded defaults before implementation.

Planning baseline:

- workflow events retain no raw stdout/stderr,
- output artifacts must be redacted before dashboard display,
- output artifacts must carry truncation markers,
- exact byte limits are implementation-story inputs and require approval.

Rationale: unbounded process output can leak secrets, overload event storage, and make reviews noisy.

### Environment Inheritance

Decision: no arbitrary environment inheritance is approved.

Required shape for future implementation:

- explicit environment allowlist only,
- no `.env` files by default,
- no credential store, token, shell profile, browser/session, or SSH inheritance by default,
- any session/auth exception requires its own approval record.

Rationale: subscription-agent launch can easily inherit credentials accidentally if the environment is not deny-by-default.

### Approval Expiry

Decision: approvals must expire by time and by evidence changes.

Required invalidators:

- route decision changes,
- worker id changes,
- lane changes,
- authority mode changes,
- workspace plan changes,
- launch policy changes,
- command template changes,
- approval expiry timestamp passes.

Rationale: stale approval is one of the highest-risk paths into unintended execution.

## Approval Gate

Before implementation stories can move from blocked to ready, an operator must explicitly approve:

- first launch target,
- command template id,
- environment allowlist,
- artifact size and retention limits,
- timeout and cancellation values,
- approval expiry policy,
- dashboard controls,
- rollback procedure.

## Non-Execution Confirmation

This review does not add:

- process launch,
- launch command templates,
- shell command execution,
- source mutation,
- provider/model calls,
- network expansion,
- credential access,
- background runtime assistant behavior.
