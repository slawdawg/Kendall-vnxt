# Execution Authority Boundary

This workflow contract is the Git-backed source of truth for execution-authority stop lines and approval prerequisites. It is not an approval packet. It does not call providers, launch processes, mutate source, deliver PRs, delete files, clean worktrees, sync issues, read credentials, or bypass failed checks.

Local BMAD packets, planning notes, PRDs, epics, stories, research, and handoffs are workspace artifacts. They must remain local-only and must not be required for a clean GitHub install.

## Local Provider Execution Contract

Status: approval-required, non-executing packet

Authority family: `local-provider-execution`

Operation candidate: one bounded metadata-only Ollama provider operation

It does not call Ollama, discover models, expand provider support, mutate source, or retain raw provider content.

Endpoint: `http://192.168.1.128:11434/v1/chat/completions`

Model: `qwen3:14b`

Retention: metadata-only event evidence and artifact references only.

Stop lines:

- Do not call this provider from this packet alone.
- Do not discover endpoints or models.
- Do not retain raw prompt, completion, reasoning, or provider payload text in workflow events.
- Do not read credentials or external sessions.
- Do not mutate source, launch processes, merge PRs, clean worktrees, or bypass failed checks.

## Premium Execution Contract

Status: approval-required, non-executing packet

Authority family: `premium-execution`

Operation candidate: one bounded paid-provider operation

This contract preserves premium approval prerequisites without enabling premium execution, reading credentials, calling providers, or incurring cost.

Required approval fields include:

- Provider/account boundary
- Explicit cost ceiling.
- Explicit data classification.
- Metadata-only retained evidence unless a separate retention approval grants more.
- Audit evidence
- Abort policy
- Rollback path
- Expiry or review point

Stop lines:

- Do not execute without a cost ceiling.
- Stop before exceeding the approved ceiling.
- Do not make paid provider calls from this packet alone.
- Do not read credentials or external sessions.
- Do not retain raw prompt/completion/provider payload text.
- Do not treat a premium approval request artifact as execution approval.

## Subscription-Agent Launch Contract

Status: approval-required, non-executing packet

Authority family: `subscription-agent-launch`

Operation candidate: one bounded supervised subscription-agent process launch

It does not launch a process, execute a shell command, inherit credentials or sessions, call providers, mutate source, sync issues, deliver PRs, or perform cleanup.

Required approval fields include:

- Argument-array execution only; no shell expansion.
- Environment allowlist only.
- Credential/session denial paths enforced.

Stop lines:

- Do not launch a process from this packet alone.
- Do not use shell string execution.
- Do not inherit arbitrary environment variables.
- Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, or provider credentials.
- Do not treat the Story 8.5 artifact-only fixture approval as production process-launch approval.
- Do not retain Raw stdout/stderr in workflow events.
- Do not retain Generated patch content in workflow events.

## Worker Process Launch Contract

Status: approval-required, non-executing packet

Authority family: `worker-process-launch`

Operation candidate: one bounded real CLI worker launch

It does not launch Codex, launch Claude, execute shell commands, mutate source, call providers, access credentials, sync issues, deliver PRs, or perform cleanup.

Required approval fields include:

- One tool identity: Codex CLI or Claude Code CLI, not both.
- Argument-array execution only; no shell expansion.
- Tool identity: `codex-cli` or `claude-code-cli`
- Approved cwd/worktree path
- Allowed file scope
- Source mutation permission
- Diff guard policy
- Prompt/source retention policy
- Environment allowlist
- Blocked credential/session paths
- Timeout/cancellation policy
- Verification command
- Review requirement
- rollback path <rollback>
- Expiry or review point

Stop lines:

- Do not launch a real CLI worker from this packet alone.
- Do not use shell string execution.
- Do not run both Codex and Claude from one approval.
- Do not mutate source unless source mutation is explicitly approved for the named tool, work item, and file scope.
- Do not read GitHub tokens, browser sessions, SSH keys, cloud credentials, or provider credentials.
- Do not deliver PRs, merge, delete branches, delete worktrees, clean filesystem residue, sync issues, or bypass failed checks from worker-launch authority.

## Cleanup Automation Contract

Status: approval-required, non-executing packet

Authority family: `cleanup-automation`

Operation candidate: one bounded target-specific cleanup operation

It does not delete anything.

Allowed cleanup candidates:

- One local Git-registered disposable worktree.
- One filesystem residue path proven to be inside an approved cleanup root.

Blocked cleanup candidates:

- Retained evidence deletion.
- Unclassified filesystem paths.
- Cleanup outside approved roots.

Required approval fields include:

- Target path is inside the approved cleanup root.
- Dry-run effects are reviewed.
- Target id
- Operator
- Approval timestamp
- Expiry or review point
- Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

Stop lines:

- Do not delete from this packet alone.
- Do not delete ambiguous paths.
- Do not delete based on stale PR, merge, or worktree evidence.
- Do not delete source checkout roots.
- Do not delete `main` or protected branches.
- Do not delete retained evidence unless separately approved.
- Do not use string-built shell deletion commands.
- Do not cross from local cleanup to remote cleanup without exact remote target approval.

## Adaptive Scoring Decision Preparation Contract

Status: decision_only_no_authority_granted, non-executing packet

Authority family: `adaptive-scoring`

Operation candidate: decision preparation for a future metadata-only adaptive
scoring approval packet

This contract supports review of whether adaptive scoring should receive a
future exact approval packet. It does not compute scores, persist scores, rank
work, change priority, alter delivery or cleanup eligibility, approve authority,
call providers, launch processes, mutate source by workers, read credentials, or
bypass failed checks.

Source package:

- `docs/workflows/adaptive-scoring-decision-prep.md`
- `pnpm run check:adaptive-scoring`

Required future approval fields include:

- Intended use and affected decision surfaces.
- Lifecycle actors, named reviewer ownership, named operator ownership, and
  escalation owner for reviewer/operator conflicts.
- Target report, API, or workflow surface.
- Approved metadata input fields.
- Prohibited inputs.
- Output fields and display rules.
- Advisory-only versus state-changing authority.
- Retained evidence and redaction policy.
- Measurement plan, calibration method, failure thresholds, and management
  response owner.
- Fake/local fixture set and negative test cases.
- Transparency, explainability, fairness, and operator review path.
- Monitoring cadence, drift response, and continual improvement cadence,
  criteria, owner, and resulting action path.
- Operator appeal or override handling and escalation path.
- Verification command.
- Rollback path.
- Stop lines.
- Expiry or review point.

Stop lines:

- Do not run adaptive scoring.
- Do not compute or persist adaptive scores.
- Do not let scores change priority, routing, delivery, cleanup, authority,
  merge, or verification behavior.
- Do not call providers or launch processes.
- Do not read credentials, sessions, raw prompts, completions, reasoning traces,
  provider payloads, or raw source copies as scoring input.
- Do not treat this decision-prep package as approval.

## Branch Protection Readiness Contract

Status: readiness_only_no_authority_granted, non-mutating packet

Authority family: `github-branch-protection`

Operation candidate: readiness preparation for a future exact GitHub branch
protection or repository ruleset approval packet

This contract supports review of whether branch protection should be applied to
the established `dev`, `staging`, `main`, and `prod` branch foundation. It does
not change GitHub settings, create repository rulesets, apply required checks,
change the default branch, push refs, mutate pull requests, resolve review
threads, merge, deploy, delete branches, delete worktrees, or run cleanup.

Source package:

- `docs/workflows/branch-protection-readiness-packet.md`
- `pnpm run check:branch-protection-readiness`

Required future approval fields include:

- Repository and target branch or pattern.
- Branch protection rule or repository ruleset implementation surface.
- Required status checks by exact visible check name.
- Pull request review, conversation resolution, signed commit, linear history,
  merge queue, force-push, deletion, and admin-bypass settings.
- Current authenticated GitHub evidence and expected post-change evidence.
- Retained GitHub read-back evidence, exact check-context evidence, rollback
  proof, and redaction policy.
- Verification or authenticated read-back command.
- Rollback path.
- Stop lines.
- Expiry or review point.

Stop lines:

- Do not apply branch protection or repository rulesets from this packet alone.
- Do not change default branch, branch refs, required checks, merge methods,
  merge queue, review rules, signed-commit rules, linear-history rules, admin
  bypass, or GitHub Actions workflows from this packet alone.
- Do not push, create or update PRs, wait CI, merge, deploy, delete branches,
  delete worktrees, clean residue, or mutate review threads from this packet.
- Do not treat repository admin permission, CI success, live evidence, or this
  readiness packet as approval.

## Next-Lane Authority Decision Contract

Contract id: `epic-11-next-lane-authority-decision-contract`

Status: decision_only_no_authority_granted

This section compares candidate authority lanes as a selection aid only. It does not approve, execute, launch, call, score, merge, clean up, delete, sync, mutate, or automate any lane.

Decision rules:

- A lane with no current exact approval remains blocked or approval-required.
- Generic continuation language, older approvals, CI success, readiness reports, or a completed story do not authorize a new authority lane.
- Exact approval language must name authority family, operation, scope, target, required evidence, retained evidence, rollback path, stop lines, and expiry or review point.
- Default retention remains metadata-only.
- If evidence is stale, ambiguous, missing, or contradicted by GitHub/current-state checks, stop and refresh evidence before implementation.

Candidate authority families:

- `local-provider-execution`
- `subscription-agent-launch`
- `premium-execution`
- `adaptive-scoring`
- `github-branch-protection`
- `github-delivery`
- `cleanup-automation`

Recommended lane for the operator to consider approving: adaptive scoring
decision preparation, not scoring execution. Use
`docs/workflows/adaptive-scoring-decision-prep.md` and
`pnpm run check:adaptive-scoring` as the current non-executing package. No lane
is selected or authorized until the operator accepts an exact approval packet.

Decision-only stop lines:

- Do not call local providers.
- Do not launch subscription-agent processes.
- Do not run premium provider calls.
- Do not compute or apply adaptive scores.
- Do not push, create/update PRs, wait CI, merge, deploy, delete branches, delete worktrees, remove filesystem residue, or perform remote cleanup from this packet.
- Do not sync issues.
- Do not mutate source by workers.
- Do not read credentials or external sessions.
- Do not bypass failed checks.
- Do not treat this packet, CI success, story completion, or generic continuation language as approval.
