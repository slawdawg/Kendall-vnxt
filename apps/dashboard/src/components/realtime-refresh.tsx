"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSupervisorBaseUrl } from "../lib/supervisor";

const refreshPauseStorageKey = "kendall-dashboard-realtime-refresh-paused-until";

function isRefreshPaused() {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(refreshPauseStorageKey);
  } catch {
    return false;
  }
  if (!raw) {
    return false;
  }
  const pausedUntil = Number(raw);
  if (!Number.isFinite(pausedUntil) || Date.now() >= pausedUntil) {
    try {
      window.localStorage.removeItem(refreshPauseStorageKey);
    } catch {
      return false;
    }
    return false;
  }
  return true;
}

export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const source = new EventSource(`${getSupervisorBaseUrl()}/events`);

    source.onmessage = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        if (isRefreshPaused()) {
          refreshTimer = null;
          return;
        }
        router.refresh();
        refreshTimer = null;
      }, 250);
    };

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      source.close();
    };
  }, [router]);

  return null;
}
