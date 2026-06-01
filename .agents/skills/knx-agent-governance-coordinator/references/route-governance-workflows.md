# Route Governance Workflows

## What Success Looks Like

The user is routed to one clear next workflow with a defensible reason. If more than one path is plausible, the tradeoff is clear and the default recommendation is still named.

## Use This When

- The user describes a planning, safety, storage, compute, provider, evidence, module, or custom-code concern.
- The user is unsure which `knx` workflow to run.
- A completed workflow exposes a new decision that needs the next governance artifact.

## Routing Principles

- Profile before policy; policy before source intake; source boundaries before operational workflows.
- Mature-tool review before custom code.
- Safety validation before promotion, packaging, or implementation claims.
- Module strategy before Create Module when packaging boundaries are unclear.

## Output Shape

Name:

- Recommended workflow.
- Why it is next.
- Required inputs.
- Expected output artifact.
- Whether the recommendation is ready, provisional, blocked, or optional.

If the user is asking for implementation, route back to governance first when the implementation would depend on undecided storage, provider, source-boundary, approval, or deployment choices.
