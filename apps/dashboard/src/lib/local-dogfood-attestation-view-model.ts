export type LocalDogfoodAttestationReadback = {
  authorizationId?: string | null;
  issuerId?: string | null;
  keyId?: string | null;
  receiptId?: string | null;
  receiptState?: "accepted" | "rejected" | "pending" | "unavailable" | null;
  rejectionReason?: string | null;
  expiresAt?: string | null;
  replayState?: "replayed" | "not_replayed" | "unknown" | null;
  evidenceClass?: "integrated_local" | null;
  liveEvidenceAccepted?: boolean | null;
};

export type LocalDogfoodAttestationViewModel = {
  blocking: boolean;
  expiry: string;
  liveObserved: false;
  nextSafeAction: string;
  reason: string | null;
  replay: string;
  result: "Accepted" | "Expired" | "Replayed" | "Wrong target" | "Wrong key or issuer" | "Unavailable" | "Pending";
};

const rejectedStateByReason: Record<string, Pick<LocalDogfoodAttestationViewModel, "nextSafeAction" | "reason" | "result">> = {
  expired_or_future_receipt: {
    result: "Expired",
    reason: "The local receipt is expired or is not yet valid.",
    nextSafeAction: "Issue a new local authorization and receipt.",
  },
  replay: {
    result: "Replayed",
    reason: "This local receipt has already been used.",
    nextSafeAction: "Create a new local authorization and receipt; do not reuse the prior receipt.",
  },
  binding_mismatch: {
    result: "Wrong target",
    reason: "The receipt is not bound to this exact packet target.",
    nextSafeAction: "Create a receipt bound to this exact packet target.",
  },
  invalid_signature: {
    result: "Wrong key or issuer",
    reason: "The receipt signature does not match the authorized local issuer and key.",
    nextSafeAction: "Use the authorized local issuer and development key.",
  },
  unknown_or_revoked_authorization: {
    result: "Wrong key or issuer",
    reason: "The local authorization is unknown or revoked.",
    nextSafeAction: "Create a new local authorization with the approved development key.",
  },
  unknown_or_revoked_key: {
    result: "Wrong key or issuer",
    reason: "The local issuer key is no longer in the configured trust registry.",
    nextSafeAction: "Rotate the local authorization and issue a receipt with the current development key.",
  },
  authorization_not_found: {
    result: "Unavailable",
    reason: "No local attestation authorization is available for this packet.",
    nextSafeAction: "Create or read a local authorization for this packet before verifying a receipt.",
  },
};

export function buildLocalDogfoodAttestationViewModel(
  readback: LocalDogfoodAttestationReadback | null,
): LocalDogfoodAttestationViewModel {
  const expiry = readback?.expiresAt ?? "Unavailable";
  const replay = readback?.replayState === "replayed"
    ? "Replayed"
    : readback?.replayState === "not_replayed"
      ? "Not replayed"
      : "Unavailable";
  const rejected = readback?.rejectionReason ? rejectedStateByReason[readback.rejectionReason] : null;
  if (rejected) {
    return { ...rejected, expiry, replay, blocking: true, liveObserved: false };
  }
  if (readback?.rejectionReason) {
    return {
      result: "Unavailable",
      reason: "The local verifier returned an unrecognized rejection category.",
      nextSafeAction: "Inspect local attestation diagnostics and create a new local authorization if needed.",
      expiry,
      replay,
      blocking: true,
      liveObserved: false,
    };
  }
  if (readback?.receiptState === "accepted") {
    return {
      result: "Accepted",
      reason: null,
      nextSafeAction: "No action needed. This receipt remains integrated local only.",
      expiry,
      replay,
      blocking: false,
      liveObserved: false,
    };
  }
  if (readback?.receiptState === "pending") {
    return {
      result: "Pending",
      reason: "A local authorization exists but no receipt decision is available yet.",
      nextSafeAction: "Verify a locally issued receipt for this exact packet target.",
      expiry,
      replay,
      blocking: true,
      liveObserved: false,
    };
  }
  return {
    result: "Unavailable",
    reason: "Local attestation readback is unavailable.",
    nextSafeAction: "Confirm the local dogfood attestation service is enabled and reachable.",
    expiry,
    replay,
    blocking: true,
    liveObserved: false,
  };
}
