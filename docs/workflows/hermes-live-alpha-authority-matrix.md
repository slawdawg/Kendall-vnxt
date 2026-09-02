# Hermes Live-Alpha Authority Matrix

Status: active source-owned policy

This policy supersedes the dry-run-only contract only for ordinary, named Hermes
delivery lanes. For a conflict about ordinary delivery, this matrix controls;
the dry-run contract controls its own fixtures/readiness packets. An ambiguous
classification or conflict stops delivery until the source-owned policy is
clarified. This matrix does not authorize a worker process launch, provider or
credential access, Spend, real-user deployment, force push, protection bypass,
cross-repository/branch work, or cleanup.

| Action | State | Required current evidence |
| --- | --- | --- |
| Source/docs/tests edit and focused verification | allowed in assigned lane | approved task scope, managed owner, changed-surface proof and review |
| Commit, non-force push, PR create/update | allowed in assigned lane | expected repository, base `dev`, and task head; reviewed scope, local verification, diff-risk, action record, rollback plan, and governed verification; record current terminal-check and thread/review state (new PR gates may be nonterminal); failed or ambiguous current gates stop, and terminal-clean state is re-proven before resolution or merge; no force push, cross-target, or protection bypass |
| Resolve a current fully-satisfied thread | allowed | current exact repo/base/head; feedback demonstrably fixed; verification/review complete; terminal required checks; no pending review/requested change; no unresolved or unadjudicated outdated thread; action record and rollback preconditions |
| Merge | allowed | immediate exact-head repo/base/draft/mergeability audit; terminal required checks; zero unresolved current or outdated threads; no requested changes/review requests; local verification, diff-risk, action record and rollback |
| Spend, real-user deployment, or ambiguous external impact | stop | scoped, expiring External-Impact decision before side effect; ambiguity fails closed |
| Force push, protection bypass, cross-target or unrelated mutation, credential/provider access, cleanup | denied | separate source policy and authority only; this matrix grants none |

`docs/workflows/governed-worker-execution-dry-run.md` remains a legacy
fixture/readiness contract. Its packets and reports are non-authoritative:
they may prove validation/readiness behavior, but cannot launch workers,
mutate source, deliver or merge a PR, or grant credentials. The non-executing
process-launch boundaries in `execution-authority-boundary.md` remain intact.

Ordinary delivery uses the focused changed-surface proof and governed
`--verify check-fast` profile. A named source-enforced recovery/adoption path
is one explicitly identified by its wrapper, preflight, or retained packet as
requiring `--verify check`; only that source-owned identifier can classify it,
and an unclassified path stops rather than using `check-fast`. The mandatory
`--verify check` requirement remains in force; this policy does not bypass it.
The operational procedure and exact-head evidence sequence are in
`docs/workflows/end-to-end-lane-runner.md`.
