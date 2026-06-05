"use client";

import type { SavedWorkItemView } from "@kendall/contracts";
import type { WorkItemFilterPreset, WorkItemFilterState } from "../lib/work-item-filtering";

export function WorkItemFilterPanel({
  filters,
  onChange,
  onReset,
  onApplyPreset,
  presets,
  sourceOptions,
  resultCount,
  label,
  savedViews,
  activeSavedViewId,
  draftName,
  onDraftNameChange,
  onSaveCurrentView,
  onApplySavedView,
  onDeleteSavedView,
  onToggleDefaultView,
  pendingSave,
}: {
  filters: WorkItemFilterState;
  onChange: (next: WorkItemFilterState) => void;
  onReset: () => void;
  onApplyPreset: (next: Partial<WorkItemFilterState>) => void;
  presets: WorkItemFilterPreset[];
  sourceOptions: string[];
  resultCount: number;
  label: string;
  savedViews: SavedWorkItemView[];
  activeSavedViewId: string | null;
  draftName: string;
  onDraftNameChange: (next: string) => void;
  onSaveCurrentView: () => void;
  onApplySavedView: (view: SavedWorkItemView) => void;
  onDeleteSavedView: (viewId: string) => void;
  onToggleDefaultView: (viewId: string) => void;
  pendingSave: boolean;
}) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Filters</p>
          <h2 className="mt-2 text-2xl font-semibold">{label}</h2>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
            {resultCount} matching items
          </div>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Reset filters
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onApplyPreset(preset.filters)}
            className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Search</span>
          <input
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Title, outcome, status, source..."
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Risk</span>
          <select
            value={filters.risk}
            onChange={(event) => onChange({ ...filters, risk: event.target.value as WorkItemFilterState["risk"] })}
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          >
            <option value="all">All risks</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Audit mode</span>
          <select
            value={filters.audit}
            onChange={(event) => onChange({ ...filters, audit: event.target.value as WorkItemFilterState["audit"] })}
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          >
            <option value="all">All modes</option>
            <option value="none">None</option>
            <option value="advisory">Advisory</option>
            <option value="required">Required</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Source</span>
          <select
            value={filters.source}
            onChange={(event) => onChange({ ...filters, source: event.target.value })}
            className="rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          >
            <option value="all">All sources</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 border-t pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Shared views</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Persist operator views through the supervisor so this surface behaves the same across machines.
            </p>
          </div>
          <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
            <input
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              placeholder="Name this view"
              disabled={pendingSave}
              className="min-w-0 flex-1 rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={onSaveCurrentView}
              disabled={pendingSave || !draftName.trim()}
              className="rounded-full border bg-[var(--surface)] px-4 py-3 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {pendingSave ? "Saving..." : "Save current view"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {savedViews.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No shared views yet for this surface.</p>
          ) : (
            savedViews.map((view) => (
              <div
                key={view.id}
                className="flex flex-col gap-3 rounded-[1.25rem] border bg-[var(--surface)] p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{view.name}</p>
                    {view.isDefault ? (
                      <span className="rounded-full bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]">
                        Default
                      </span>
                    ) : null}
                    {activeSavedViewId === view.id ? (
                      <span className="rounded-full border border-[var(--accent)] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    q={view.filters.query || "all"} | risk={view.filters.risk} | audit={view.filters.audit} |
                    source={view.filters.source}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onApplySavedView(view)}
                    disabled={pendingSave}
                    className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDefaultView(view.id)}
                    disabled={pendingSave}
                    className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {view.isDefault ? "Clear default" : "Make default"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSavedView(view.id)}
                    disabled={pendingSave}
                    className="rounded-full border bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
