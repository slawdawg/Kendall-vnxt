export const CONTROLS_READ_CONCURRENCY = 8;

const FAILURE_COPY = {
  timeout: "timed out",
  aborted: "was interrupted",
  http: "was unavailable",
  malformed: "returned invalid data",
  unavailable: "was unavailable",
};

export class ControlsReadFailure extends Error {
  constructor(alias, category) {
    super(`Controls data is unavailable: ${alias} ${FAILURE_COPY[category] ?? FAILURE_COPY.unavailable}.`);
    this.name = "ControlsReadFailure";
    this.alias = alias;
    this.category = category;
  }
}

function failureCategory(error) {
  const message = error instanceof Error ? error.message : "";
  if (/timed out/i.test(message)) return "timeout";
  if (/malformed response/i.test(message)) return "malformed";
  if (/request failed/i.test(message)) return "http";
  if (error?.name === "AbortError") return "aborted";
  return "unavailable";
}

/**
 * Reads the fixed Controls manifest with bounded concurrency. The caller owns
 * the manifest; this helper never forwards a path, response, or thrown text.
 *
 * @template {readonly { alias: string; read: (options: { signal?: AbortSignal }) => Promise<unknown> }[]} T
 * @param {T} tasks
 * @param {{ signal?: AbortSignal; concurrency?: number }} [options]
 * @returns {Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]["read"]>> }>}
 */
export async function runBoundedControlsReads(tasks, { signal, concurrency = CONTROLS_READ_CONCURRENCY } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > CONTROLS_READ_CONCURRENCY) {
    throw new Error("Controls read concurrency is invalid.");
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const values = Array(tasks.length);
  let nextIndex = 0;
  let failure = null;
  const worker = async () => {
    while (!failure && !controller.signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;
      const task = tasks[index];
      try {
        values[index] = await task.read({ signal: controller.signal });
      } catch (error) {
        if (!failure) {
          failure = new ControlsReadFailure(task.alias, failureCategory(error));
          controller.abort();
        }
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    if (failure) throw failure;
    if (signal?.aborted) throw new ControlsReadFailure("Controls manifest", "aborted");
    return values;
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
