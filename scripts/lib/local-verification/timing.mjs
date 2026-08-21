export function estimateEta({ pendingNodeIds = [], samplesByNodeId = {} } = {}) {
  let etaMs = 0;
  let comparable = 0;
  for (const nodeId of pendingNodeIds) {
    const samples = (samplesByNodeId[nodeId] || []).filter((value) => Number.isInteger(value) && value >= 0).sort((left, right) => left - right);
    if (samples.length < 3) return { etaMs: null, etaRangeMs: null, confidence: "insufficient", reason: "insufficient-comparable-history" };
    const median = samples[Math.floor(samples.length / 2)];
    const low = samples[Math.floor(samples.length * 0.25)];
    const high = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.75))];
    etaMs += median;
    comparable += 1;
    if (!Number.isFinite(low) || !Number.isFinite(high)) return { etaMs: null, etaRangeMs: null, confidence: "insufficient", reason: "insufficient-comparable-history" };
  }
  return comparable === 0
    ? { etaMs: 0, etaRangeMs: [0, 0], confidence: "high", reason: "no-pending-work" }
    : { etaMs, etaRangeMs: [0, etaMs], confidence: "low", reason: "bounded-median-history" };
}
