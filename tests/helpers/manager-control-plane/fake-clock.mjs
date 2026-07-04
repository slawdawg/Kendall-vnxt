export function createFakeClock(initialIso) {
  let currentEpochMs = Date.parse(initialIso);
  if (!Number.isFinite(currentEpochMs)) {
    throw new Error(`Invalid fake clock timestamp: ${initialIso}`);
  }

  return {
    nowIso() {
      return new Date(currentEpochMs).toISOString();
    },
    nowEpochMs() {
      return currentEpochMs;
    },
    advanceMs(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new Error(`Invalid fake clock advance: ${milliseconds}`);
      }
      currentEpochMs += milliseconds;
    }
  };
}
