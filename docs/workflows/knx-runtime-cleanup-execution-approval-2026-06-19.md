# KNX Runtime Cleanup Execution Approval Packet

Date: 2026-06-19
Status: approval packet

## Purpose

Define the exact non-durable KNX runtime files that are ready for a future
cleanup execution PR. This packet is intentionally non-destructive: it does not
delete, untrack, sanitize in place, regenerate, or rewrite runtime files.

This packet does not approve execution. It prepares the exact file list,
operation, rollback, evidence, and stop lines required for Bob to approve or
reject the next cleanup step.

Execution record:

- `docs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md`

## Proposed Operation

Preferred operation: untrack the files below with `git rm --cached`.

Reason: the promoted evidence records preserve the generic conclusions in
`docs/workflows/`, while `git rm --cached` removes the files from the remote
repository without deleting Bob's local runtime copies from this worktree.

Do not use normal deletion unless Bob separately approves deleting the local
copies too.

## Files Proposed For Future Untracking

The proposed untracking set contains 69 files.

### Handoffs And Inventories

- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01-current.md`
- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01.md`
- `_bmad/memory/knx/runtime/runtime-inventory/runtime-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/runtime-inventory/runtime-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/runtime-inventory/validation-runtime-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/runtime-inventory/work-trace-runtime-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-inventory/validation-source-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-inventory/work-trace-source-inventory-2026-06-01.md`

### Evaluation Packet

- `_bmad/memory/knx/runtime/evaluation-packet/artifact-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/evaluation-packet/discussion-guide-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/evaluation-packet-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/hardening-review-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/restrictions-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/validation-evaluation-packet-2026-06-01.json`
- `_bmad/memory/knx/runtime/evaluation-packet/work-trace-evaluation-packet-2026-06-01.md`

### Greenfield Implementation

- `_bmad/memory/knx/runtime/greenfield-implementation/access-security/access-security-workflows-planning-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/access-security/access-security-workflows-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/access-security/work-trace-access-security-workflows-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/company-evaluation/company-evaluation-planning-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/company-evaluation/company-evaluation-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/company-evaluation/work-trace-company-evaluation-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/destructive-risk/destructive-risk-waiver-planning-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/destructive-risk/destructive-risk-waiver-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/destructive-risk/work-trace-destructive-risk-waiver-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/distribution-readiness/ksev-public-distribution-readiness-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/distribution-readiness/ksev-public-distribution-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/distribution-readiness/work-trace-ksev-public-distribution-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/ide-workspace/ide-workspace-planning-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/ide-workspace/ide-workspace-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/ide-workspace/work-trace-ide-workspace-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/implementation-runway-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/initial-local-development-closure-2026-06-02.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/ksev-setup-answers-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/local-model-gpu/local-model-gpu-processing-planning-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/local-model-gpu/local-model-gpu-processing-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/local-model-gpu/work-trace-local-model-gpu-processing-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/post-gate-continuation-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/remote-readiness/github-remote-readiness-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/remote-readiness/github-remote-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/remote-readiness/work-trace-github-remote-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/runtime-behavior/runtime-assistant-behavior-planning-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/runtime-behavior/runtime-assistant-behavior-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/runtime-behavior/work-trace-runtime-assistant-behavior-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/validation-greenfield-runway-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/validation-ksev-registration-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/work-trace-greenfield-runway-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/work-trace-ksev-registration-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/work-trace-source-inventory-tooling-gate-2026-06-01.md`

### Runtime Tail

- `_bmad/memory/knx/runtime/backlog/local-backlog-2026-06-01.md`
- `_bmad/memory/knx/runtime/commit-readiness/reports/commit-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/commit-readiness/reports/staging-plan-2026-06-01.md`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/README.md`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/evidence/validator-run-2026-06-01.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/reports/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/reports/source-evidence-validation.md`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/scripts/validate_source_evidence.py`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/tests/test_validate_source_evidence.py`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/reports/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/reports/source-evidence-validation.md`
- `_bmad/memory/knx/runtime/report-audits/branch-merge-prep-2026-06-02.md`
- `_bmad/memory/knx/runtime/report-audits/index.md`
- `_bmad/memory/knx/runtime/report-audits/ksev-report-pointer-audit-2026-06-02.md`
- `_bmad/memory/knx/runtime/report-audits/runtime-evidence-broader-audit-2026-06-02.md`
- `_bmad/memory/knx/runtime/workflow-audits/bmad-workflow-continuation-2026-06-01.md`

## Files Explicitly Excluded

Do not remove or untrack these durable-source stop-line groups in the execution
PR:

- `_bmad/memory/knx/runtime/module-validation/ksev/**`
- `_bmad/memory/knx/runtime/source-packets/**`

Do not remove or untrack durable replacement source:

- `.agents/skills/knx-source-evidence-validator/**`
- `_bmad/memory/knx/fixtures/synthetic/**`
- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`
- KNX decision records under `_bmad/memory/knx/decisions/**`

## Proposed Execution Command

After explicit approval, run `git rm --cached` against the 69 files above.
Do not use `git rm` without `--cached`.

The execution PR should stage only:

- the 69 index removals;
- any ignore rule required to keep these local runtime copies from being
  re-added accidentally;
- any reference edits required by verification.

## Rollback

Before commit:

```bash
git restore --staged -- _bmad/memory/knx/runtime
```

After commit or merge:

```bash
git revert <cleanup-commit-sha>
```

If local files were preserved with `git rm --cached`, the rollback restores
repository tracking. It should not be needed to recover local file contents.

## Required Execution PR Verification

The execution PR must report:

- `git diff --cached --name-status` showing only the intended untracked files
  and any approved ignore/reference edits;
- `find _bmad/memory/knx/runtime/module-validation/ksev _bmad/memory/knx/runtime/source-packets -type f | wc -l`
  still returning `14`;
- `test -f .agents/skills/knx-source-evidence-validator/scripts/validate_source_evidence.py`;
- `test -f .agents/skills/knx-source-evidence-validator/tests/test_validate_source_evidence.py`;
- `rg` scan for references to the removed paths;
- `rg` scan for concrete local path markers in tracked KNX runtime files;
- `node ./scripts/check-doc-indexes.mjs`;
- `git diff --check`;
- `git diff --cached --check`.

## Approval Language Needed

Execution requires Bob to approve the operation with wording equivalent to:

> Approved: untrack the 69 files named in
> `docs/workflows/knx-runtime-cleanup-execution-approval-2026-06-19.md` using
> `git rm --cached`, preserve local copies, do not remove
> `module-validation/ksev/**`, `source-packets/**`, or
> `.agents/skills/knx-source-evidence-validator/**`.

Generic "next" or "continue" is not approval for this operation.

## Related Records

- `docs/workflows/knx-runtime-and-bmad-output-inventory-2026-06-19.md`
- `docs/workflows/knx-runtime-cleanup-decision-2026-06-19.md`
- `docs/workflows/knx-runtime-promoted-evidence-2026-06-19.md`
- `docs/workflows/knx-greenfield-evaluation-promoted-evidence-2026-06-19.md`
- `docs/workflows/knx-runtime-tail-promoted-evidence-2026-06-19.md`
