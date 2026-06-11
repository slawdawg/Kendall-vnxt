# Epic 6 Retrospective And Post-MVP Readiness Review

Date: 2026-06-11
Status: complete retrospective; post-MVP readiness review

## Purpose

Record the Epic 6 closeout review in durable project evidence. This document summarizes delivered scope, retained evidence, friction, remaining blockers, lessons learned, and the recommended Epic 7 theme.

## Readiness Decision

Epic 6 MVP is complete.

The MVP success criterion was proven by one real BMAD story moving through the product-development lifecycle:

```text
Candidate Work
  -> Active Work
  -> lane decision
  -> local/Ollama-safe evidence
  -> bounded Codex implementation
  -> verification
  -> GitHub PR/CI/merge
  -> cleanup
  -> Dev Console done/evidence state
```

Story `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md` is the retained proof story. The Dev Console report surfaces now report:

- `/supervisor/epic-6-mvp-proof-trial-report`: `trialStatus=epic_6_mvp_proof_complete`
- `/supervisor/epic-6-completion-audit-report`: `epicComplete=true`

Post-MVP work is ready to plan, but not ready for broad autonomy. Execution, provider, issue-sync, cleanup, and review authorities should continue using explicit scoped approvals.

## Delivered Scope

Epic 6 delivered the supervised-work MVP foundation:

- Candidate Work import, prioritization, approval, rejection, deferral, and promotion into Active Work.
- Metadata-only BMAD story import from approved repo artifact roots.
- Dev Console Proposed Work and Active Work visibility.
- Task Packet v0 and read-only orchestrated routing preview.
- Runtime evidence export for work items, routing, local checks, and blocked/fake attempts.
- SSE-backed Dev Console refresh for Candidate Work and WorkItem state.
- Safe local-readonly evidence surfaces, including approved VM-to-host Ollama endpoint/model boundary evidence.
- Read-only Git hygiene, local worktree planning, and cleanup readiness reports.
- No-launch Codex and Claude readiness reports.
- Codex implementation and Claude review approval packet shapes.
- GitHub delivery authority ladder for push, PR, CI, review resolution, merge, and cleanup.
- Trusted delivery eligibility and low-risk doc/evidence PR preparation policy.
- Epic 6 completion audit report and MVP proof trial report.
- One real proof story, Story 3.66, completed through the end-to-end lifecycle.

## Retained Evidence

Primary retained evidence:

- PR #86 delivered the integrated Epic 6 milestone through Story 6.24.
- PR #87 delivered cleanup hardening and audit refresh work.
- PR #88 delivered trusted delivery eligibility.
- PR #90 delivered the Epic 6 MVP proof trial packet.
- PR #91 delivered the initial bounded doc/evidence proof for Story 3.61.
- PR #92 delivered post-proof progress and authority docs.
- PR #93 and PR #94 proposed and activated `epic-6-low-risk-doc-evidence-pr-v1`.
- PR #96 delivered proof-selection evidence for Story 3.66 and was merged at `c35ff16339fd53c502b328e3f3b120a303f905e1`.
- PR #97 delivered Story 3.66 implementation evidence and was merged at `a750601af1d0144507f6cc05b3ca1ada676d2d07`.
- PR #98 delivered final Epic 6 done/evidence state and was merged at `ff6b3d7e7c548180a66271b7fdc1de2bcae59086`.
- Local final verification passed with `pnpm.cmd run check`, including preflight, drift checks, dashboard build, and 143 supervisor tests.
- CI passed for the final delivery PRs before merge.

Supporting retained evidence:

- `docs/goals/epic-6-progress-and-kickoff-2026-06-10.md`
- `docs/goals/epic-6-real-story-trial-approval-packet-2026-06-11.md`
- `docs/goals/epic-6-low-risk-doc-evidence-autonomy-policy-proposal-2026-06-11.md`
- `docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md`
- `docs/stories/6-27-epic-6-mvp-proof-trial-packet.md`
- `docs/stories/6-24-epic-6-completion-audit.md`

## Incidents And Friction

- Early workspace cleanup hit Windows `EPERM` on an orphan Codex worktree. Cleanup hardening and stricter retained-evidence checks were added before destructive cleanup.
- Native Windows command execution required serialized shell usage and careful PowerShell quoting. This produced some avoidable command friction and reinforced the need for repo-local command hygiene.
- GitHub PR body and CLI quoting were brittle in a few paths. The workflow now favors prepared evidence and narrow command shapes.
- PR #96 readiness required exact head/CI/merge-state confirmation before merge. This was useful friction because it caught state that must be explicit before mutating GitHub.
- A runtime proof database was not a durable enough final evidence store by itself. Epic 6 now treats report surfaces, docs, PRs, commits, and CI as the retained evidence source.
- Story status drift remained after Epic 6 MVP completion. PR #99 exists to normalize Epics 3-6 status headers and clarify deferred post-MVP authority work.
- Full lifecycle proof required repeated approval packets. The cost was real, but it kept dangerous operations gated while proving the pipeline.

## What Worked

- Progressive authority kept the proof honest: contracts, previews, fake/blocked attempts, read-only evidence, then one bounded implementation and delivery.
- A single real BMAD story was enough to prove the pipeline without expanding blast radius.
- Isolated Codex worktrees made implementation and cleanup auditable.
- Report drift checks, doc checks, dashboard build, supervisor tests, GitHub CI, and merge-state checks provided layered confidence.
- Narrow approval phrases worked well for GitHub delivery, merge, and cleanup because each approval named scope, evidence, and stop lines.

## Remaining Post-MVP Blockers

These remain intentionally blocked after Epic 6:

- Real Claude launch or paid review execution.
- Provider expansion beyond the approved Ollama endpoint/model boundary.
- Subscription-agent process launch.
- Real orchestrator-managed Codex or Claude worker launch without a new supervised-execution contract.
- Issue/story sync that mutates remote state.
- Secrets access or secret retention.
- Raw prompt, completion, reasoning trace, provider payload, or source-copy retention beyond explicitly approved metadata.
- Failed-check bypass, broad trusted autonomy, or merge/cleanup without retained evidence and scoped approval.

## Lessons Learned

- Status, evidence, and authority need one durable source of truth per lifecycle stage; chat memory is not enough.
- Approval language must name the authority family, operation, scope, evidence, and stop lines.
- Cleanup must preserve proof first, then delete only the named branch/worktree after merge confirmation.
- Runtime evidence should be exportable and referenced from docs; runtime state alone is too fragile for closeout.
- Story status normalization should be part of every epic closeout, not a later reconciliation task.
- The next risk is not routing decisions; it is supervised process launch, cancellation, evidence capture, and recovery.

## Recommended Epic 7 Theme

Recommended theme: supervised execution hardening.

Start Epic 7 with a real Codex worker launch before subscription-agent launch. Codex is the better first worker because Epic 6 already proved bounded Codex implementation manually, while subscription-agent launch introduces broader runtime and product-risk coupling.

Recommended Epic 7 initial scope:

- Define a supervised execution contract for one bounded Codex worker attempt.
- Add explicit launch authority, stop conditions, timeout, cancellation, and cleanup rules.
- Preserve metadata-only evidence for command shape, branch/worktree, input scope, output summary, verification, and recovery path.
- Add no-op and dry-run adapters before a real launch.
- Detect and block out-of-scope diffs before commit or PR.
- Support inspect, retry, resume, and cleanup paths after failed or interrupted attempts.
- Prove one low-risk real Codex worker launch against a scoped story or docs/evidence task.
- Keep GitHub delivery, merge, cleanup, Claude, provider expansion, issue sync, and subscription-agent launch separately gated until the Codex worker path is proven.

Recommended Epic 7 non-goals:

- Broad autonomy.
- Subscription-agent process launch as the first worker.
- Provider expansion beyond the approved Ollama boundary.
- Claude launch by default.
- Remote issue sync.
- Secret handling expansion.
- Retention of raw prompts, completions, reasoning traces, provider payloads, or unnecessary source copies.

## Action Items

- Land the Epics 3-6 status normalization PR or otherwise accept its reconciliation before treating old story status as authoritative.
- Plan Epic 7 around supervised Codex execution hardening.
- Keep post-MVP authority expansion in explicit approval packets.
- Add story status reconciliation and retrospective capture to future epic closeout checklists.
- Treat subscription-agent launch as a later Epic 7 milestone after Codex worker launch evidence exists.
