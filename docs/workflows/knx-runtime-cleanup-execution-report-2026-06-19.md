# KNX Runtime Cleanup Execution Report

Date: 2026-06-19
Status: executed with local copies preserved

## Operation

Approved operation:

- untrack the 69 files named in
  `docs/workflows/knx-runtime-cleanup-execution-approval-2026-06-19.md`
  using `git rm --cached`;
- preserve local runtime copies;
- do not remove `_bmad/memory/knx/runtime/module-validation/ksev/**`;
- do not remove `_bmad/memory/knx/runtime/source-packets/**`;
- do not remove `.agents/skills/knx-source-evidence-validator/**`.

Execution result:

- 69 files removed from Git tracking.
- Local files under `_bmad/memory/knx/runtime/**` remain on disk.
- Runtime Git tracking now retains only the 14 durable-source files under
  `module-validation/ksev/**` and `source-packets/**`.
- `.gitignore` now ignores the preserved local-only KNX runtime evidence
  subtrees so they do not reappear as untracked noise.

## Ignore Protection Added

The following local-only runtime subtrees are ignored after untracking:

- `_bmad/memory/knx/runtime/backlog/`
- `_bmad/memory/knx/runtime/commit-readiness/`
- `_bmad/memory/knx/runtime/evaluation-packet/`
- `_bmad/memory/knx/runtime/greenfield-implementation/`
- `_bmad/memory/knx/runtime/handoffs/`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/`
- `_bmad/memory/knx/runtime/report-audits/`
- `_bmad/memory/knx/runtime/runtime-inventory/`
- `_bmad/memory/knx/runtime/source-inventory/`
- `_bmad/memory/knx/runtime/workflow-audits/`

These ignore rules intentionally do not ignore:

- `_bmad/memory/knx/runtime/module-validation/ksev/**`
- `_bmad/memory/knx/runtime/source-packets/**`

## Active Reference Treatment

Active KNX pointers now use promoted durable docs as checkout references:

- `_bmad/memory/knx/index.md`
- `_bmad/memory/knx/source-evidence-contract.md`

The old runtime files are treated as local-only historical provenance after
cleanup. Fresh checkouts should use the promoted evidence records in
`docs/workflows/`.

## Verification Evidence

Local file preservation:

```text
find _bmad/memory/knx/runtime -type f | wc -l
=> 83
```

Tracked runtime files after cleanup:

```text
git ls-files _bmad/memory/knx/runtime | wc -l
=> 14
```

Durable-source stop-line files on disk:

```text
find _bmad/memory/knx/runtime/module-validation/ksev _bmad/memory/knx/runtime/source-packets -type f | wc -l
=> 14
```

Durable-source stop-line files still tracked:

```text
git ls-files _bmad/memory/knx/runtime/module-validation/ksev _bmad/memory/knx/runtime/source-packets | wc -l
=> 14
```

Replacement validator source remains tracked:

```text
test -f .agents/skills/knx-source-evidence-validator/scripts/validate_source_evidence.py
test -f .agents/skills/knx-source-evidence-validator/tests/test_validate_source_evidence.py
```

Tracked-runtime local marker scan:

```text
git grep -n -E 'C:/Users|/home/|slaw_dawg|\\.omnara' -- _bmad/memory/knx/runtime
```

Result: one residual concrete local marker remains in the durable-source
stop-line group:

- `_bmad/memory/knx/runtime/source-packets/validator-report/source-evidence-validation.json`

That file is outside this approved cleanup because `source-packets/**` was
explicitly excluded. It requires a separate source-packet review before any
sanitization, movement, untracking, or deletion.

## Rollback

Before commit:

```bash
git restore --staged -- _bmad/memory/knx/runtime
git restore --staged -- .gitignore _bmad/memory/knx/index.md _bmad/memory/knx/source-evidence-contract.md docs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md
```

After commit or merge:

```bash
git revert <cleanup-commit-sha>
```

Because `git rm --cached` was used, local runtime file contents should not need
recovery.

## Related Records

- `docs/workflows/knx-runtime-cleanup-execution-approval-2026-06-19.md`
- `docs/workflows/knx-runtime-promoted-evidence-2026-06-19.md`
- `docs/workflows/knx-greenfield-evaluation-promoted-evidence-2026-06-19.md`
- `docs/workflows/knx-runtime-tail-promoted-evidence-2026-06-19.md`
