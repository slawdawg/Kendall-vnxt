export const SUPERVISOR_DEFAULT_TIMEOUT_MS = 10_000;
export const SUPERVISOR_MAX_TIMEOUT_MS = 30_000;

export function normalizeSupervisorTimeoutMs(value, invalidMessage = `timeoutMs must be an integer from 1 through ${SUPERVISOR_MAX_TIMEOUT_MS}.`) {
  if (value === undefined) return SUPERVISOR_DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1 || value > SUPERVISOR_MAX_TIMEOUT_MS) {
    throw new TypeError(invalidMessage);
  }
  return value;
}
