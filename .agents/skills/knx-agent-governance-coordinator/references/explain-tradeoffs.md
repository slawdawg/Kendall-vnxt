# Explain Tradeoffs

## What Success Looks Like

The user can compare options without losing the governing principles: local-first, mature-tool-first, custom-code-last, source-safe, installable for others, and explicit about cost and maintenance.

## Use This When

- The user asks whether OneDrive, local folders, app data, GitHub, or another provider should be used.
- The user asks whether to use local models, host GPU, external LLM/GPT providers, or deterministic processing.
- The user asks whether to build custom code or adopt a mature tool/workflow.
- The user asks whether a capability belongs in `knx`, an optional pack, another module, or ordinary project code.

## Tradeoff Lenses

Cover the lenses that matter for the decision:

- User/workflow outcome.
- Data boundary and source exposure.
- Cost and overage risk.
- Local/host resource availability.
- Installability for users beyond the current operator.
- Maintenance burden.
- Validation and rollback path.
- Fit with BMad Method, BMad Builder, and Git/GitHub source-review boundaries.

## Output Shape

Use a compact comparison table when it helps. End with a recommendation and the decision record or workflow that should capture it.

Do not recommend external providers, custom code, or live source mutation unless the required policy and decision evidence already exists.
