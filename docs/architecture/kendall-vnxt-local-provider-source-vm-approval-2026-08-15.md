# Local Provider Source-VM Approval — 2026-08-15

Status: accepted operator decision; non-activating

Authority family: `local-provider-execution`

## Decision

The approved Kendall vNxt source VM for the bounded local-provider route is
`192.168.1.8`. The previously accepted `192.168.1.118` source is retained as
historical provenance and is not approved for this route.

This decision selects only the source identity. It does not enable provider
HTTP calls, Ollama calls, automatic local-evidence approval, or any provider
operation. Those gates remain false by default and require a separate reviewed
enablement authority record plus runtime verification that the configured VM is
an actual local interface.

## Provenance and rollback

This record captures the operator decision made on 2026-08-15. Earlier approval
material naming `192.168.1.118` remains historical provenance rather than a
superseded source of runtime enablement.

Rollback is a record-only transition to
`hold_conflicting_source_vm` with `approvedSourceVm: null`; keep all three
provider/automatic-consent environment gates false and verify zero adapter
calls.
