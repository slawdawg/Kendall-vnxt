export function AttentionBadge({ reason }: { reason?: string | null }) {
  return (
    <span
      title={reason ?? "Needs attention"}
      className="rounded-full border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--warn)]"
    >
      Needs attention
    </span>
  );
}
