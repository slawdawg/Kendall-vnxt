"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SavedWorkItemView, WorkItemFilterScope, WorkItemView } from "@kendall/contracts";

import {
  areFiltersEqual,
  defaultWorkItemFilters,
  filterWorkItems,
  filtersFromSearchParams,
  filtersToSearchParams,
  getSourceOptions,
  mergeFilterState,
  sharedFilterPresets,
  type WorkItemFilterPreset,
  type WorkItemFilterState,
} from "../lib/work-item-filtering";
import { deleteOperatorView, saveOperatorView, setOperatorViewDefault } from "../lib/supervisor";
import { WorkItemFilterPanel } from "./work-item-filter-panel";

function useSavedViews(
  scope: WorkItemFilterScope,
  filters: WorkItemFilterState,
  setFilters: (next: WorkItemFilterState) => void,
  initialSavedViews: SavedWorkItemView[],
) {
  const router = useRouter();
  const [savedViews, setSavedViews] = useState<SavedWorkItemView[]>(initialSavedViews);
  const [draftName, setDraftName] = useState("");
  const [pendingSave, setPendingSave] = useState(false);
  const hasAppliedDefault = useRef(false);

  useEffect(() => {
    if (hasAppliedDefault.current) {
      return;
    }

    const isUntouched = areFiltersEqual(filters, defaultWorkItemFilters);
    if (!isUntouched) {
      hasAppliedDefault.current = true;
      return;
    }

    const defaultView = savedViews.find((view) => view.scope === scope && view.isDefault);
    if (defaultView) {
      hasAppliedDefault.current = true;
      setFilters(defaultView.filters);
      return;
    }

    hasAppliedDefault.current = true;
  }, [filters, savedViews, scope, setFilters]);

  const scopedViews = useMemo(
    () =>
      savedViews
        .filter((view) => view.scope === scope)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [savedViews, scope],
  );

  const activeSavedViewId = useMemo(() => {
    const activeView = scopedViews.find((view) => areFiltersEqual(view.filters, filters));
    return activeView?.id ?? null;
  }, [filters, scopedViews]);

  function saveCurrentView() {
    const name = draftName.trim();
    if (!name || pendingSave) {
      return;
    }
    setPendingSave(true);
    void saveOperatorView({ name, scope, filters })
      .then((savedView) => {
        setSavedViews((current) => {
          const nextViews = current.filter((view) => view.id !== savedView.id);
          return [...nextViews, savedView];
        });
        setDraftName("");
        router.refresh();
      })
      .finally(() => setPendingSave(false));
  }

  function applySavedView(view: SavedWorkItemView) {
    setFilters(view.filters);
  }

  function deleteSavedView(viewId: string) {
    if (pendingSave) {
      return;
    }
    setPendingSave(true);
    void deleteOperatorView(viewId)
      .then(() => {
        setSavedViews((current) => current.filter((view) => view.id !== viewId));
        router.refresh();
      })
      .finally(() => setPendingSave(false));
  }

  function toggleDefaultView(viewId: string) {
    if (pendingSave) {
      return;
    }
    const currentView = savedViews.find((view) => view.id === viewId);
    if (!currentView) {
      return;
    }
    setPendingSave(true);
    void setOperatorViewDefault(viewId, !currentView.isDefault)
      .then((updatedView) => {
        setSavedViews((current) =>
          current.map((view) => ({
            ...view,
            isDefault: view.scope === updatedView.scope ? view.id === updatedView.id && updatedView.isDefault : view.isDefault,
          })),
        );
        router.refresh();
      })
      .finally(() => setPendingSave(false));
  }

  return {
    scopedViews,
    activeSavedViewId,
    draftName,
    setDraftName,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    toggleDefaultView,
    pendingSave,
  };
}

export function useUrlSyncedWorkItemFilters(
  items: WorkItemView[],
  scope: WorkItemFilterScope,
  initialSavedViews: SavedWorkItemView[],
) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  const filtered = useMemo(() => filterWorkItems(items, filters), [items, filters]);
  const sources = useMemo(() => getSourceOptions(items), [items]);

  function setFilters(next: WorkItemFilterState) {
    const params = filtersToSearchParams(next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function applyPartialFilters(partial: Partial<WorkItemFilterState>) {
    setFilters(mergeFilterState(filters, partial));
  }

  function resetFilters() {
    setFilters(defaultWorkItemFilters);
  }

  const savedViews = useSavedViews(scope, filters, setFilters, initialSavedViews);

  return {
    filters,
    filtered,
    sources,
    setFilters,
    applyPartialFilters,
    resetFilters,
    ...savedViews,
  };
}

export function UrlSyncedWorkItemFilters({
  items,
  label,
  scope,
  initialSavedViews,
  presets = sharedFilterPresets,
}: {
  items: WorkItemView[];
  label: string;
  scope: WorkItemFilterScope;
  initialSavedViews: SavedWorkItemView[];
  presets?: WorkItemFilterPreset[];
}) {
  const {
    filters,
    filtered,
    sources,
    setFilters,
    applyPartialFilters,
    resetFilters,
    scopedViews,
    activeSavedViewId,
    draftName,
    setDraftName,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    toggleDefaultView,
    pendingSave,
  } = useUrlSyncedWorkItemFilters(items, scope, initialSavedViews);

  return {
    filters,
    filtered,
    sources,
    controls: (
      <WorkItemFilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        onApplyPreset={applyPartialFilters}
        presets={presets}
        sourceOptions={sources}
        resultCount={filtered.length}
        label={label}
        savedViews={scopedViews}
        activeSavedViewId={activeSavedViewId}
        draftName={draftName}
        onDraftNameChange={setDraftName}
        onSaveCurrentView={saveCurrentView}
        onApplySavedView={applySavedView}
        onDeleteSavedView={deleteSavedView}
        onToggleDefaultView={toggleDefaultView}
        pendingSave={pendingSave}
      />
    ),
  };
}
