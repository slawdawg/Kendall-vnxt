# Local Provider Enablement Approval Record v1

Status: no enablement approved

Authority family: `local-provider-execution`

This is the reserved, source-owned provenance record for any future transition
of `local-provider-authority-policy-v1.json` from
`hold_requires_separate_review` to `approved` enablement. It is deliberately
not an approval packet today and does not permit a provider call.

An approved revision must name the exact operation, source VM, endpoint, model,
gates, local-interface verification method, expiry, retention, rollback, and
the evidence required to prove zero calls after rollback. It must be reviewed
in the same change that changes the machine-readable enablement status and
claim to `accepted_operator_enablement_approval`.

That record alone is deliberately **not executable**. Authority-policy v1 has
no verifier for the selected trusted-attestation-service receipt, so runtime
and JavaScript routes remain held with
`ollama_trusted_attestation_required` even after a future enablement record is
accepted. A successor implementation must verify an attestation-service
receipt bound to the actual caller host before it can make a provider call.

Until that record is accepted, all provider and automatic-consent gates remain
false, runtime denies adapter readiness, and no local provider probe is allowed.
