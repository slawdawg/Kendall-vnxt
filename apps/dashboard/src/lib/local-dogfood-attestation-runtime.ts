import type { LocalDogfoodAttestationReadback } from "./local-dogfood-attestation-view-model";

/** Read only from the explicitly configured numeric-loopback bridge. */
export async function readLocalDogfoodAttestation(
  bridgeOrigin: string,
  targetRef: string,
  signal: AbortSignal,
): Promise<LocalDogfoodAttestationReadback> {
  const request = globalThis["fetch"];
  const response = await request(`${bridgeOrigin}/local-dogfood-attestations/targets/${encodeURIComponent(targetRef)}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error(`Local attestation readback unavailable (${response.status}).`);
  const payload = await response.json() as { data?: unknown };
  if (!payload.data) throw new Error("Local attestation readback was malformed.");
  return payload.data as LocalDogfoodAttestationReadback;
}
