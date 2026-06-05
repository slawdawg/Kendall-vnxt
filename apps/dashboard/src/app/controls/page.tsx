import { ControlPanel } from "../../components/control-panel";
import { Shell } from "../../components/shell";
import { getRunStatus } from "../../lib/supervisor";

export default async function ControlsPage() {
  const status = await getRunStatus();

  return (
    <Shell>
      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Supervisor controls</h2>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">{status.summary}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.25rem] border bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Mode</p>
            <p className="mt-2 text-2xl font-semibold">{status.mode}</p>
          </div>
          <div className="rounded-[1.25rem] border bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Poll interval</p>
            <p className="mt-2 text-2xl font-semibold">{status.pollIntervalSeconds}s</p>
          </div>
        </div>
      </section>
      <ControlPanel />
    </Shell>
  );
}
