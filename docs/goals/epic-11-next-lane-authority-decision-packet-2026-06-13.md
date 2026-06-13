# Epic 11 Next-Lane Authority Decision Packet

Date: 2026-06-13
Status: decision packet only, no authority granted

## Purpose

This packet compares the next candidate authority lanes using current Story 11.2 readiness evidence. It is a selection aid only. It does not approve, execute, launch, call, score, merge, clean up, delete, sync, mutate, or automate any lane.

The next implementation story may start only after Bob accepts an exact approval packet for one lane. That successor story must match the selected lane's authority family, operation, target, evidence, stop lines, retained evidence, and rollback path.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Story 11.2 authority readiness matrix | Done; includes provider, subscription-agent launch, premium execution, adaptive scoring, GitHub delivery, cleanup, worker authority, rollback paths, required approvals, and stop lines. |
| PR #103 delivery branch | CI passed again after Story 11.2 merged into the PR branch on 2026-06-13, but PR #103 remains externally review-gated. Re-check GitHub before claiming merge to `main`. |
| Epic 10 delivery/cleanup evidence | Low-risk delivery plan, delivery execution evidence, safe cleanup plan, Dev Console plan visibility, and trusted approval-ledger validation exist as metadata-only readiness evidence. |
| Story 8.5 subscription evidence | Artifact-only fixture path was explicitly approved and completed. It is not production subscription-agent process-launch approval. |

## Decision Rules

- A lane with no current exact approval remains blocked or approval-required.
- Generic continuation language, older approvals, CI success, readiness reports, or a completed story do not authorize a new authority lane.
- Exact approval language must name authority family, operation, scope, target, required evidence, retained evidence, rollback path, stop lines, and expiry or review point.
- Default retention remains metadata-only. Any retention beyond metadata requires exact approval naming data classes, storage location, duration, redaction requirements, and prohibited data such as secrets, credentials, raw prompts, completions, provider payloads, or external session contents.
- If evidence is stale, ambiguous, missing, or contradicted by GitHub/current-state checks, stop and refresh evidence before implementation.
- This packet expires for implementation use unless PR, CI, review, and lane-readiness state are re-checked on the same day as successor-story approval.

## Candidate Lane Comparison

| Lane | Authority family | Candidate operation | Current status | Readiness evidence | Missing gates | Blast radius | Retained evidence | Rollback path | Stop lines | Exact approval language |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local provider calls | `local-provider-execution` | Enable one bounded local-provider call path for an approved endpoint/model and metadata-only prompt/result evidence. | `blocked_pending_explicit_approval`: blocked pending explicit approval. | Story 4.4 approved VM-to-host Ollama endpoint/model boundary; Story 11.2 matrix row; disabled-provider proof and execution-readiness reports. | Exact provider approval; endpoint/model confirmation; prompt-source/redaction/retention policy; timeout/cancellation policy; no-call-to-call transition tests; rollback/global-disable procedure. | Provider calls can expose prompts/evidence to a model endpoint, retain sensitive outputs, or create false confidence from model responses. | Approval packet id, endpoint/model id, prompt-source metadata, redaction summary, timeout/cancel metadata, provider response metadata only, rollback evidence. | Keep provider disabled and revert to no-call fixture evidence if endpoint, model, prompt policy, retention, timeout, or approval binding is stale or missing. | No unapproved provider endpoints, no raw prompt/completion retention, no credential reads, no network expansion beyond the approved endpoint, no source mutation, no failed-check bypass. | `I approve the local-provider-execution lane for one bounded provider operation using endpoint <endpoint>, model <model>, scope <scope>, required evidence <required-evidence>, retained evidence <evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.` |
| Direct subscription-agent process launch | `subscription-agent-launch` | Start a real subscription-agent process under a bounded supervised lifecycle. | `blocked_pending_explicit_approval`: blocked pending explicit approval. | Story 8.5 artifact-only fixture evidence; Story 8.6 verification/recovery evidence; Story 11.2 matrix row; process lifecycle policy evidence. | Exact process-launch approval; launch target; command template; workspace/session policy; environment allowlist; output/artifact policy; process tree/orphan handling; timeout/cancellation policy; rollback/global-disable evidence. | Real process launch can spawn child processes, inherit environment/session state, create artifacts, consume paid resources, or leave orphaned workspaces. | Approval packet id, attempt id, target id, command-template id, process lifecycle metadata, heartbeat/orphan/reconciliation metadata, artifact references only, rollback evidence. | Preserve disabled launch state and stop at metadata-only lifecycle evidence if approval, workspace isolation, output, timeout, or rollback evidence is stale. | No production launch without exact approval, no shell expansion, no credentials/sessions, no provider calls, no source mutation, no PR/merge/cleanup, no failed-check bypass. | `I approve the subscription-agent-launch lane for one bounded process-launch operation targeting <target>, command template <template>, workspace policy <workspace>, required evidence <required-evidence>, retained evidence <evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.` |
| Premium execution | `premium-execution` | Allow one bounded paid-provider call path for an approved provider, cost ceiling, and data policy. | `blocked_pending_explicit_approval`: blocked pending explicit approval. | Premium approval artifacts exist as request-only evidence; Story 11.2 matrix row; execution readiness keeps premium execution disabled. | Exact premium approval; provider/account boundary; cost ceiling; data classification; audit evidence; retention/redaction policy; abort/rollback policy; budget stop line. | Paid calls can incur cost, expose data to an external provider, produce retained outputs, and create billing/audit obligations. | Approval packet id, provider id, cost ceiling, request metadata, redaction summary, response metadata only, audit record, rollback/global-disable evidence. | Keep `premiumExecutionAllowed` false and revert to approval-request artifacts only if provider, budget, data, audit, or rollback evidence is incomplete. | No paid provider calls, no raw prompt/completion retention, no budget overrun, no credential/session reads, no provider expansion by implication. | `I approve the premium-execution lane for one bounded paid-provider operation using provider <provider>, cost ceiling <ceiling>, data policy <policy>, required evidence <required-evidence>, retained evidence <evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.` |
| Adaptive scoring | `adaptive-scoring` | Compute a bounded score for candidate work or authority readiness without executing the scored lane. | `blocked_pending_explicit_approval`: blocked pending explicit approval. | Story 11.2 matrix row; safe backlog and development runway reports are read-only evidence surfaces. | Exact scoring approval; allowed inputs; score formula/model; output use; review path; retention policy; no-autopromotion rule; rollback/removal procedure. | Scoring can silently bias priority, authority choices, cleanup/delivery decisions, or operator trust if treated as execution permission. | Approval packet id, input metadata, score version, output metadata, review decision, retained evidence summary, rollback/removal evidence. | Keep deterministic review-only ordering and remove scoring-derived recommendations if scoring policy, evidence, or approval binding is incomplete. | No automatic priority changes, no authority state changes, no launch/delivery/cleanup eligibility changes, no raw inputs, no provider calls, no failed-check bypass. | `I approve the adaptive-scoring lane for one bounded scoring operation using inputs <inputs>, output use <use>, required evidence <required-evidence>, retained evidence <evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.` |
| GitHub delivery automation | `github-delivery` | Perform approved PR/merge remote mutation through human or connector-backed workflow. | `evidence_ready_approval_required`: evidence ready, approval required; worker remote automation remains blocked. | Story 10.1 low-risk delivery plan; Story 10.2 delivery execution evidence; Story 10.5 trusted approval-ledger validation; PR #103 current state must be re-checked. | Exact delivery approval; current PR state; CI status; review/mergeability; branch/base identity; trusted approval ledger entry; rollback/recovery plan. | Remote mutation can update PRs, merge to protected branches, alter review state, or publish code beyond the local branch. | Approval ledger id, PR id, branch/base, CI/review state, merge state, action result metadata, rollback/recovery evidence. | Stop before remote mutation when PR state, CI, review, approval-ledger, branch, or base evidence is stale; preserve delivery evidence and return to dry-run planning. | No worker remote automation, no plaintext tokens, no stale PR-state claims, no deployment, no branch deletion, no failed-check bypass. | `I approve the github-delivery lane for one bounded delivery operation on PR <pr>, branch <branch>, base <base>, required evidence <required-evidence>, retained evidence <evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.` |
| Cleanup automation | `cleanup-automation` | Perform one target-specific cleanup action after evidence retention and target classification. | `blocked_pending_explicit_approval`: blocked pending explicit approval. | Story 10.3 cleanup plan and residue classification; Story 10.4 Dev Console plan visibility; local and remote cleanup readiness reports; PR #103 state must be re-checked. | Exact cleanup approval; target path/branch; target classification; retained evidence; approved root; Git registration check; blocked-path check; rollback/recovery path; expiry. | Cleanup can delete worktrees, branches, source checkouts, filesystem residue, or remote refs and can destroy evidence needed for recovery. | Approval packet id, target id/path/branch, classification, Git registration state, approved-root state, retained evidence references, dry-run effects, cleanup result metadata. | Preserve retained evidence and leave the target untouched if classification, approval, Git registration, approved-root, PR state, or retained-evidence proof is missing or ambiguous. | No worktree deletion, branch deletion, source checkout deletion, filesystem-residue removal, or remote cleanup from readiness alone; no cleanup before evidence retention. | `I approve the cleanup-automation lane for one bounded cleanup operation targeting <target>, classification <classification>, required evidence <required-evidence>, retained evidence <evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.` |

## Related Reports And Documents

| Authority family | Related reports | Related docs |
| --- | --- | --- |
| `local-provider-execution` | `GET /supervisor/execution-readiness-report`; `GET /supervisor/disabled-provider-proofs`; `GET /supervisor/threat-boundary`; `GET /supervisor/documentation-authority-report` | `docs/prds/local-provider-ollama-disabled-to-limited-execution.md`; `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`; `docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md`; `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md` |
| `subscription-agent-launch` | `GET /supervisor/maintenance-action-plan-report`; `GET /supervisor/execution-readiness-report`; `GET /supervisor/execution-state-boundary`; `GET /supervisor/threat-boundary` | `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`; `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`; `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`; `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md` |
| `premium-execution` | `GET /supervisor/execution-readiness-report`; `GET /supervisor/threat-boundary`; `GET /supervisor/managed-recipe-policy-report` | `docs/stories/1-18-premium-approval-request-artifacts.md`; `docs/prds/supervisor-execution-authority-expansion.md` |
| `adaptive-scoring` | `GET /supervisor/safe-development-backlog`; `GET /supervisor/development-runway-report`; `GET /supervisor/verification-readiness-report` | `docs/stories/3-54-development-runway-safe-slices.md`; `docs/stories/3-59-development-runway-readiness-checks.md`; `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md` |
| `github-delivery` | `GET /supervisor/delivery-readiness-policy-report`; `GET /supervisor/github-workflow-policy-report`; `GET /work-items/{id}/delivery-execution-evidence` | `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`; `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`; `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`; `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`; `docs/github-connector-workflow.md` |
| `cleanup-automation` | `GET /supervisor/local-cleanup-readiness-report`; `GET /supervisor/remote-cleanup-sync-readiness-report`; `GET /work-items/{id}/cleanup-plan`; `GET /supervisor/delivery-readiness-policy-report` | `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`; `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`; `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`; `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`; `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`; `docs/stories/6-21-local-cleanup-readiness.md`; `docs/stories/6-22-remote-cleanup-sync-readiness.md` |

## Recommendation

Recommended lane for Bob to consider approving: **adaptive scoring decision preparation**, not scoring execution. No lane is selected or authorized until Bob accepts an exact approval packet.

Reasoning:

- It has the smallest immediate blast radius if kept decision-only and metadata-only.
- It can improve future prioritization without touching providers, process launch, paid calls, remote delivery, or destructive cleanup.
- It still needs an exact approval before any score is computed or used.

Alternative safe lane: **local provider approval packet refinement**, still without provider calls.

Avoid as next execution lane unless Bob explicitly chooses it with exact approval: direct subscription-agent process launch, premium execution, GitHub delivery automation, or cleanup automation. Those lanes have higher operational blast radius and require current external/target evidence before action.

## Successor Story Binding

If Bob selects a lane, the next story must copy the chosen lane's values from this packet:

- authority family,
- exact operation,
- target/scope,
- required evidence,
- retained evidence,
- stop lines,
- rollback path,
- expiry or review point,
- exact acceptance language.

Any mismatch means the successor story is out of scope and must stop for a corrected packet.

## Decision-Only Stop Lines

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

## Verification

Required for this packet:

- `pnpm.cmd run check:docs`

If any checked report, dashboard, schema, contract, script, or drift guard changes, also run the smallest touched drift check and `pnpm.cmd run check` before PR.
