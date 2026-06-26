"use client";

import { useEffect, useState } from "react";

const usageVisibilityOptions = [
  {
    description: "Show Codex 5h and weekly usage bars in the pipeline cockpit.",
    key: "kendall.dashboard.usage.codex.visible",
    label: "Codex usage",
  },
  {
    description: "Show Claude 5h and weekly usage bars in the pipeline cockpit.",
    key: "kendall.dashboard.usage.claude.visible",
    label: "Claude usage",
  },
];

function readStoredUsageVisible(key: string) {
  try {
    return window.localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}

function writeStoredUsageVisible(key: string, checked: boolean) {
  try {
    window.localStorage.setItem(key, checked ? "true" : "false");
  } catch {
    return;
  }
}

export function UsageVisibilitySettings() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(usageVisibilityOptions.map((option) => [option.key, true]))
  );

  useEffect(() => {
    setVisibility(
      Object.fromEntries(
        usageVisibilityOptions.map((option) => [option.key, readStoredUsageVisible(option.key)])
      )
    );
  }, []);

  function setOption(key: string, checked: boolean) {
    writeStoredUsageVisible(key, checked);
    setVisibility((current) => ({ ...current, [key]: checked }));
    window.dispatchEvent(new Event("kendall-usage-visibility-change"));
  }

  return (
    <section aria-label="Usage graph visibility settings" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Visibility</p>
      <h2 className="mt-2 text-xl font-semibold">Pipeline usage graphs</h2>
      <div className="mt-4 grid gap-2">
        {usageVisibilityOptions.map((option) => (
          <label key={option.key} className="flex min-w-0 items-start gap-3 rounded-[0.375rem] border bg-[var(--surface)] p-3">
            <input
              checked={visibility[option.key] ?? true}
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
              onChange={(event) => setOption(option.key, event.target.checked)}
              type="checkbox"
            />
            <span className="grid min-w-0 gap-1">
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-sm text-[var(--muted)]">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
