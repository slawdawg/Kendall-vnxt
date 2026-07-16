"use client";

import { useEffect, useState } from "react";
import {
  buildLocalDogfoodAttestationViewModel,
  type LocalDogfoodAttestationReadback,
} from "../../lib/local-dogfood-attestation-view-model";
import { readLocalDogfoodAttestation } from "../../lib/local-dogfood-attestation-runtime";

type ReadbackState =
  | { kind: "loading" }
  | { kind: "ready"; readback: LocalDogfoodAttestationReadback }
  | { kind: "unavailable" };

export function LocalDogfoodAttestationPanel({ enabled = true, targetRef }: { enabled?: boolean; targetRef: string }) {
  const bridgeOrigin = process.env.NEXT_PUBLIC_LOCAL_DOGFOOD_ATTESTATION_BRIDGE_ORIGIN;
  const bridgeAvailable = Boolean(bridgeOrigin && /^http:\/\/(127\.0\.0\.1|\[::1\]):8102$/.test(bridgeOrigin));
  const [state, setState] = useState<ReadbackState>(enabled && bridgeAvailable ? { kind: "loading" } : { kind: "unavailable" });

  useEffect(() => {
    if (!enabled || !bridgeAvailable || !bridgeOrigin) {
      return;
    }
    const controller = new AbortController();
    async function load() {
      setState({ kind: "loading" });
      const origin = bridgeOrigin;
      if (!origin) return;
      try {
        // The dedicated numeric-loopback process is the sole dashboard bridge.
        // It owns the private UDS request; this app has no supervisor UDS route.
        const readback = parseReadback(await readLocalDogfoodAttestation(origin, targetRef, controller.signal));
        if (!readback) {
          throw new Error("Local attestation readback was malformed.");
        }
        setState({ kind: "ready", readback });
      } catch {
        if (!controller.signal.aborted) {
          setState({ kind: "unavailable" });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [bridgeAvailable, bridgeOrigin, enabled, targetRef]);

  const readback = enabled && bridgeAvailable && state.kind === "ready" ? state.readback : null;
  const view = buildLocalDogfoodAttestationViewModel(readback);
  const announcement = state.kind === "loading"
    ? "Loading local attestation readback."
    : `${view.result}. ${enabled && bridgeAvailable ? view.reason ?? view.nextSafeAction : "Attestation readback is unavailable unless the dedicated local bridge is configured."}`;

  return (
    <section aria-label="Local attestation" className="mt-3 grid gap-3 rounded-[0.5rem] border border-[var(--line)] bg-[var(--background-elevated)] p-3">
      <div>
        <h3 className="text-sm font-semibold">Attestation — integrated local only; not live observed</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">This readback cannot accept live evidence or authorize a live path.</p>
      </div>
      <p aria-live="polite" className="sr-only" role="status">{announcement}</p>
      {state.kind !== "loading" && view.blocking ? <p className="sr-only" role="alert">{announcement}</p> : null}
      <dl className="grid gap-2 text-sm">
        <AttestationRow label="Result" value={state.kind === "loading" ? "Loading" : view.result} />
        <AttestationRow label="Evidence class" value={state.kind === "loading" ? "Loading" : readback?.evidenceClass ?? "integrated_local"} />
        <AttestationRow label="Expiry" value={state.kind === "loading" ? "Loading" : view.expiry} />
        <AttestationRow label="Replay" value={state.kind === "loading" ? "Loading" : view.replay} />
        {view.reason || !enabled || !bridgeAvailable ? <AttestationRow label="Reason" value={enabled && bridgeAvailable ? view.reason ?? "Unavailable" : "Attestation readback is unavailable unless the dedicated local bridge is configured."} /> : null}
        <AttestationRow label="Next safe action" value={state.kind === "loading" ? "Wait for local readback." : view.nextSafeAction} />
      </dl>
      {readback ? (
        <details className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
          <summary className="cursor-pointer text-xs font-semibold">Attestation diagnostics</summary>
          <dl className="mt-2 grid gap-2 text-xs">
            <AttestationRow label="Issuer ID" value={readback.issuerId ?? "Unavailable"} />
            <AttestationRow label="Key ID" value={readback.keyId ?? "Unavailable"} />
            <AttestationRow label="Receipt ID" value={readback.receiptId ?? "Unavailable"} />
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function parseReadback(value: unknown): LocalDogfoodAttestationReadback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const states = new Set(["accepted", "rejected", "pending", "unavailable"]);
  const replays = new Set(["replayed", "not_replayed", "unknown"]);
  const optionalText = (name: string) => candidate[name] === null || candidate[name] === undefined || typeof candidate[name] === "string";
  if (candidate.evidenceClass !== "integrated_local" || candidate.liveEvidenceAccepted !== false
      || !optionalText("authorizationId") || !optionalText("issuerId") || !optionalText("keyId")
      || !optionalText("receiptId") || !optionalText("expiresAt") || !optionalText("rejectionReason")
      || (candidate.receiptState !== null && candidate.receiptState !== undefined && !states.has(String(candidate.receiptState)))
      || (candidate.replayState !== null && candidate.replayState !== undefined && !replays.has(String(candidate.replayState)))) return null;
  return candidate as LocalDogfoodAttestationReadback;
}

function AttestationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-[var(--foreground)] [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
