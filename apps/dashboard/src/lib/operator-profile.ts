"use client";

import { useEffect, useMemo, useState } from "react";
import type { OperatorProfile } from "@kendall/contracts";

const storageKey = "kendall-dashboard-operator-profile";

const defaultOperatorProfile: OperatorProfile = {
  actorId: "operator-1",
  actorLabel: "Primary operator",
};

function readStoredProfile(): OperatorProfile {
  if (typeof window === "undefined") {
    return defaultOperatorProfile;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultOperatorProfile;
    }

    const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
    return {
      actorId: typeof parsed.actorId === "string" && parsed.actorId.trim() ? parsed.actorId.trim() : defaultOperatorProfile.actorId,
      actorLabel:
        typeof parsed.actorLabel === "string" && parsed.actorLabel.trim()
          ? parsed.actorLabel.trim()
          : defaultOperatorProfile.actorLabel,
    };
  } catch {
    return defaultOperatorProfile;
  }
}

export function useOperatorProfile() {
  const [profile, setProfile] = useState<OperatorProfile>(() => readStoredProfile());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(profile));
  }, [profile]);

  const summary = useMemo(() => `${profile.actorLabel} (${profile.actorId})`, [profile]);

  return {
    profile,
    summary,
    setProfile,
    resetProfile: () => setProfile(defaultOperatorProfile),
  };
}
