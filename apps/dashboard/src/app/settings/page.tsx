import { PageIntro } from "../../components/page-intro";
import { UsageVisibilitySettings } from "../../components/settings/usage-visibility-settings";
import { ServerShell as Shell } from "../../components/server-shell";

const localState = [
  { label: "Usage adapter", value: "Not configured locally" },
  { label: "Provider network access", value: "Disabled" },
  { label: "Credential storage", value: "None" },
  { label: "Preference scope", value: "This browser" },
];

export default function SettingsPage() {
  return (
    <Shell>
      <PageIntro
        eyebrow="Settings"
        title="Local dashboard preferences"
        description="Choose how this browser presents dashboard signals. These settings do not connect to providers, store credentials, or change supervisor behavior."
        metrics={[
          { label: "Preferences", value: "Local only" },
          { label: "Usage adapter", value: "Not configured" },
          { label: "Provider access", value: "Disabled" },
          { label: "Secrets", value: "None" },
        ]}
      />

      <main aria-label="Dashboard settings" className="grid gap-4">
        <section aria-label="Local usage source status" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Local state</p>
          <h2 className="mt-2 text-xl font-semibold">Usage source status</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            No local usage-summary adapter is configured, so usage bars have no values to show. The dashboard does not try to contact Codex or Claude and does not retain provider credentials.
          </p>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {localState.map((item) => (
              <div key={item.label} className="rounded-[0.375rem] border bg-[var(--surface)] p-3">
                <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{item.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <UsageVisibilitySettings />

        <section aria-label="Settings recovery guidance" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Recovery</p>
          <h2 className="mt-2 text-xl font-semibold">If a preference looks wrong</h2>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm leading-6 text-[var(--muted)]">
            <li>Reload this page to read the preferences saved by this browser.</li>
            <li>Turn both graph choices on to restore the dashboard defaults.</li>
            <li>If browser storage is blocked, preferences safely use their defaults for the current session.</li>
          </ol>
        </section>
      </main>
    </Shell>
  );
}
