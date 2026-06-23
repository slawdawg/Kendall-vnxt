@AGENTS.md
@docs/ai-context/index.md

# Claude Project Orientation

Use `AGENTS.md` as the primary operating contract for Kendall_Nxt. The
`docs/ai-context/index.md` file is the routing map for choosing the smallest
useful context before reading broader docs.

When reviewing local BMAD planning artifacts, remember that `_bmad-output/` is
ignored local workspace state. Review those files directly when the operator
asks for an independent local review, but do not treat them as GitHub
deliverables unless their decisions are rewritten into source-owned docs,
tests, scripts, or policy.

For the anti-churn guidance hook review, read the spec files themselves and do
not rely on prior chat summaries:

- `_bmad-output/specs/spec-anti-churn-guidance-hook/SPEC.md`
- `_bmad-output/specs/spec-anti-churn-guidance-hook/autonomy-model.md`
- `_bmad-output/specs/spec-anti-churn-guidance-hook/hook-contract.md`
- `_bmad-output/specs/spec-anti-churn-guidance-hook/implementation-rules.md`
- `_bmad-output/specs/spec-anti-churn-guidance-hook/mature-tool-review.md`

Default review posture: findings first, ordered by severity, with file and line
references where possible. Focus on authority creep, local-vs-GitHub boundary,
implementation ambiguity, missing fixtures, contradictions, and blockers before
implementation.
