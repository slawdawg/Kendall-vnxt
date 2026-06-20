# Planning Doc Clean-Install Boundary

Kendall/BMAD planning artifacts are local workspace state. If a decision from a
planning artifact belongs in Git, rewrite it as source-owned docs, scripts,
tests, or policy instead of tracking the generated artifact.

The clean-install boundary treats these top-level folders as forbidden for new
tracked files:

- `docs/goals/**`
- `docs/handoffs/**`
- `docs/research/**`
- `docs/prds/**`
- `docs/stories/**`

`planning-doc-clean-install-boundary.json` lists the forbidden prefixes and
records that no local planning docs remain tracked. Any tracked file under one
of those prefixes is a clean-install boundary violation.

Removal condition:

1. Keep active references pointed at source-owned product docs, contracts,
   schemas, or test fixtures.
2. Do not add local planning files under the forbidden prefixes.
3. Keep `pnpm run check:clean-install-boundary` green.
