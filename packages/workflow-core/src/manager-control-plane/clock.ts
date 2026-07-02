export interface ManagerClock {
  nowIso(): string;
  nowEpochMs(): number;
}

export interface ManualManagerClock extends ManagerClock {
  advanceMs(milliseconds: number): void;
}

export function createManualClock(initialIso: string): ManualManagerClock {
  let currentEpochMs = Date.parse(initialIso);
  if (!Number.isFinite(currentEpochMs)) {
    throw new Error(`Invalid initial clock timestamp: ${initialIso}`);
  }

  return {
    nowIso() {
      return new Date(currentEpochMs).toISOString();
    },
    nowEpochMs() {
      return currentEpochMs;
    },
    advanceMs(milliseconds: number) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new Error(`Invalid clock advance: ${milliseconds}`);
      }
      currentEpochMs += milliseconds;
      if (!Number.isFinite(currentEpochMs)) {
        throw new Error(`Invalid clock timestamp after advance: ${currentEpochMs}`);
      }
    }
  };
}
