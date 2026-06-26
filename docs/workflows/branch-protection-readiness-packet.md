# Branch Protection Readiness Packet

Date: 2026-06-25
Status: readiness and future application packet, no GitHub mutation authority granted

## Purpose

This packet lets the operator decide whether to approve a later exact GitHub
branch protection or repository ruleset change. It is a source-owned readiness
surface, not a GitHub settings change.

The packet answers one question:

```text
Which branch protection posture should Kendall_Nxt request exact approval to apply?
```

It does not create, edit, or delete branch protection rules, repository
rulesets, required checks, merge queues, branch refs, pull requests, review
threads, or GitHub Actions workflows.

## Current Evidence

Read-only evidence gathered on 2026-06-25:

- Repository default branch: `main`.
- Repository auto-merge setting: enabled.
- Repository rulesets API returned an empty list: `[]`.
- `main` branch summary reported `protected: true`.
- `main` branch summary reported required status checks with enforcement off
  and no contexts/checks listed.
- `dev`, `staging`, and `prod` branch summaries reported `protected: false`.
- Local branch foundation report showed `dev`, `staging`, `main`, and `prod`
  present locally/remotely with no protected-branch warnings and no planned
  mutations.
- CI already exposes a final `CI / check` job for pull requests and a full
  serial gate on pushes to `main`.

Detailed branch protection endpoints require authenticated GitHub API access.
If a future packet depends on hidden settings, refresh evidence with an
authenticated read before approval.

## Current Authority

Authority family: `github-branch-protection`

Current status: `readiness_only_no_authority_granted`

Allowed in this package:

- describe current public branch and ruleset evidence;
- describe candidate branch protection and ruleset posture;
- define exact future approval packet fields;
- add source-owned documentation and static checks;
- keep verification report-only.

Not allowed in this package:

- create, update, or delete branch protection rules;
- create, update, or delete repository rulesets;
- change default branch, branch refs, required checks, merge methods, merge
  queue, auto-merge, review rules, signed-commit rules, or linear-history rules;
- push, create or update pull requests, wait CI, merge, deploy, delete
  branches, delete worktrees, or clean filesystem residue;
- mutate review threads or GitHub Actions workflows;
- treat repository admin permission, CI success, or this packet as approval.

## Recommended Posture

Recommended future approval target:

- Protect `main` as the human gate.
- Protect `prod` as the production lane.
- Protect `staging` as the release-candidate lane.
- Keep `dev` fast-moving unless the operator decides that branch-foundation
  safety now matters more than iteration speed.
- Require pull requests before merging to protected human-gated branches.
- Require the final `CI / check` status for protected pull-request merges where
  GitHub branch protection supports required checks.
- Require conversation resolution before merge where supported.
- Preserve exact-head merge evidence and do not bypass protection.
- Keep branch protection changes separate from review-thread automation,
  cleanup automation, provider execution, worker launch, and deployment policy.

Deferred decisions for the exact approval packet:

- whether `dev` should be protected now or after alpha lane throughput
  stabilizes;
- whether to use branch protection rules or repository rulesets as the
  implementation surface;
- whether signed commits, linear history, merge queue, deployment gates, or
  reviewer counts should be required immediately or staged later;
- whether admins may bypass protections;
- rollback path for each branch/rule.

## Future Approval Packet Requirements

A future branch protection approval packet must name:

- authority family: `github-branch-protection`;
- exact operation, such as create or update a named branch protection rule;
- repository: `slawdawg/Kendall-vnxt`;
- target branch or branch pattern;
- implementation surface: branch protection rule or repository ruleset;
- required status checks by exact visible check name;
- pull request review, conversation resolution, signed commit, linear history,
  merge queue, force-push, deletion, and admin-bypass settings;
- current authenticated evidence for the target branch or ruleset;
- expected post-change evidence;
- retained GitHub read-back evidence, exact check-context evidence, rollback
  proof, and redaction policy;
- verification command or authenticated read-back command;
- rollback path;
- stop lines;
- operator and approval timestamp;
- expiry or review point.

If any field is missing, stale, ambiguous, or contradicted by current GitHub
state, the branch protection change remains blocked.

## Acceptance Criteria

- The packet remains source-owned and clean-install safe.
- The packet distinguishes readiness from GitHub settings mutation.
- The standalone verification command is `pnpm run check:branch-protection-readiness`.
- The packet preserves current evidence from 2026-06-25 and requires a fresh
  authenticated read before any exact approval applies settings.
- Authority docs continue to say branch protection changes are blocked without
  exact approval.

## Stop Lines

- Do not apply branch protection from this packet alone.
- Do not create, update, or delete repository rulesets from this packet alone.
- Do not change default branch, required checks, merge methods, merge queue,
  review rules, signed-commit rules, linear-history rules, admin bypass, branch
  refs, or GitHub Actions workflows from this packet alone.
- Do not push, create or update PRs, wait CI, merge, deploy, delete branches,
  delete worktrees, clean residue, or mutate review threads from this packet.
- Do not treat repository admin permission, CI success, live evidence, or this
  packet as approval.
