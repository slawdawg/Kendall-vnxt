import { Shell } from "../../../components/shell";
import { getWorkItem } from "../../../lib/supervisor";

export default async function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ "work-item-id": string }>;
}) {
  const { "work-item-id": workItemId } = await params;
  const item = await getWorkItem(workItemId);

  return (
    <Shell>
      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">{item.state}</p>
        <h2 className="mt-3 text-3xl font-semibold">{item.title}</h2>
        <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">{item.requestedOutcome}</p>
        {item.details ? <p className="mt-4 rounded-[1.25rem] border bg-white p-4 text-sm">{item.details}</p> : null}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Source", item.source],
            ["Lane", item.lane ?? "Not assigned"],
            ["Next step", item.nextStep ?? "None"],
            ["Audit mode", item.auditMode],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.25rem] border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {item.blockedReason ? (
          <div className="mt-6 rounded-[1.25rem] border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-4 text-sm text-[var(--warn)]">
            {item.blockedReason}
          </div>
        ) : null}
      </section>
    </Shell>
  );
}
