# Base Checkout Recovery

## Purpose

Normal agent source work belongs in a manifest-backed managed worktree. This
read-only check makes an unmanaged Base Checkout diff visible as **Needs
attention** without adopting, publishing, or altering it.

## Inspect

Run the existing workspace doctor from either the Base Checkout or a managed
worktree:

```bash
node ./scripts/codex-workspace.mjs doctor --summary-json
```

The `baseCheckoutRecovery` packet derives the trusted Base Checkout from Git's
primary-worktree metadata. It contains only its identity, path, branch, HEAD,
changed-path count, reason, canonical state, derived projection, and next safe
action. It never includes a raw diff or changed-path names.

`status: "clear"` is distinct from `status: "recovery_required"`. A recovery
packet projects to **Needs attention** with the canonical `human_gate` / blocked
state. Source admission and managed-lane handoff must stop for that packet; it
is not a managed lane.

## Break-glass and recovery

If the operator has explicitly used a Base Checkout break-glass edit, record a
bounded metadata-only recovery marker in the existing local workspace state:

```bash
node ./scripts/codex-workspace.mjs doctor --summary-json --break-glass
```

This produces `recovery.break_glass_edit` even when the checkout is currently
clean. Every later ordinary `doctor --summary-json` and admission inspection
uses the active marker and remains **Needs attention** until it is explicitly
resolved. The marker contains no diff or changed-path list; it is not a lane,
permission to write in place, or an adoption workflow.

Marker writes and resolution first use the existing workspace-storage boundary.
The state root must be outside tracked source or Git-ignored; a source-root
target such as `--state-root .` is rejected before a marker can be written or
resolved. This keeps recovery metadata out of the Base Checkout and prevents a
marker from becoming an accidental source artifact.

For either a dirty primary checkout or a break-glass hold:

1. Preserve the checkout as found.
2. Inspect the diff with an operator-approved recovery process.
3. Complete the operator-owned recovery decision outside this command.
4. Explicitly clear only the metadata hold, with bounded resolution evidence:

```bash
node ./scripts/codex-workspace.mjs doctor --resolve-break-glass \
  --resolution "operator inspected marker" --summary-json
```

Resolution updates the marker to `resolved`; it never stages, applies,
publishes, or otherwise changes the Base Checkout diff. If the checkout is
still dirty, ordinary dirty-checkout recovery remains required after the marker
is resolved.

The inspection route must not stage, commit, push, reset, clean, move,
register, publish, or automatically adopt the Base Checkout diff. Delivery and
managed-worktree cleanup remain separate lifecycle gates.

## Failure handling

If Git cannot establish the trusted primary checkout, the packet reports
`recovery.primary_checkout_unknown` and remains blocked. Do not infer that the
checkout is clean; inspect the Git/worktree boundary before source changes or
delivery.
