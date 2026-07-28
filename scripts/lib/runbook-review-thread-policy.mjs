export const CURRENT_THREAD_RESOLUTION_PREREQUISITES = [
  "The feedback is fully addressed by the current diff and supported by the\n     relevant local verification and required independent code-review evidence.",
  "Fresh GitHub thread-aware data shows the thread is current and\n     unambiguous, with no requested change or pending review request.",
];

export function hasCurrentThreadResolutionPrerequisites(content = "") {
  return typeof content === "string"
    && CURRENT_THREAD_RESOLUTION_PREREQUISITES.every((requiredText) => content.includes(requiredText));
}
