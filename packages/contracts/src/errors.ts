export type ErrorCategory = "transient" | "terminal" | "operator_actionable";

export interface ApiErrorShape {
  code: string;
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  correlationId: string;
  details?: Record<string, unknown>;
}
