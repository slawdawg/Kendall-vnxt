import { PageIntro } from "../../components/page-intro";
import { UsageVisibilitySettings } from "../../components/settings/usage-visibility-settings";
import { Shell } from "../../components/shell";

const usageSources = [
  {
    provider: "Codex",
    fiveHour: "Not connected",
    weekly: "Not connected",
    source: "No read-only source selected",
    allowedSources: ["ccusage local summary", "Manual entry", "Future local usage adapter"],
  },
  {
    provider: "Claude",
    fiveHour: "Not connected",
    weekly: "Not connected",
    source: "No read-only source selected",
    allowedSources: ["ccusage local summary", "Manual entry", "Future local usage adapter"],
  },
];

const setupChecks = [
  "Read from local usage summaries only",
  "Do not store provider credentials in dashboard settings",
  "Keep raw provider payloads out of dashboard state",
  "Show unknown usage as not connected",
];

export default function SettingsPage() {
  return (
    <Shell>
      <PageIntro
        eyebrow="Settings"
        title="Configuration"
        description="Local setup for dashboard signals that need an approved source before they appear in the cockpit."
        metrics={[
          { label: "Codex usage", value: "Not connected" },
          { label: "Claude usage", value: "Not connected" },
          { label: "Provider calls", value: "Off" },
          { label: "Secrets", value: "Not stored" },
        ]}
      />

      <main aria-label="Dashboard settings" className="grid gap-4">
        <section aria-label="Usage source settings" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Usage sources</p>
              <h2 className="mt-2 text-xl font-semibold">Codex and Claude limits</h2>
            </div>
            <span className="rounded-[0.375rem] border border-[color-mix(in_srgb,var(--review)_42%,var(--line))] bg-[color-mix(in_srgb,var(--review)_10%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--review)]">
              Not connected
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {usageSources.map((source) => (
              <article key={source.provider} className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{source.provider}</h3>
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{source.source}</span>
                </div>

                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <SettingField label="5h remaining" value={source.fiveHour} />
                  <SettingField label="Weekly remaining" value={source.weekly} />
                </dl>

                <div className="mt-3 rounded-[0.375rem] border border-dashed border-[color-mix(in_srgb,var(--info)_38%,var(--line))] p-3">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Allowed source types</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {source.allowedSources.map((allowedSource) => (
                      <span key={allowedSource} className="rounded-full bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--muted)]">
                        {allowedSource}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <UsageVisibilitySettings />

        <section aria-label="Usage source safety rules" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Safety rules</p>
          <h2 className="mt-2 text-xl font-semibold">Usage data boundaries</h2>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {setupChecks.map((check) => (
              <div key={check} className="rounded-[0.375rem] border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]">
                {check}
              </div>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  );
}

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.375rem] border bg-[var(--background-elevated)] p-3">
      <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</dd>
    </div>
  );
}
