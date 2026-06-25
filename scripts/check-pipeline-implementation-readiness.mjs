#!/usr/bin/env node
import { evaluatePipelineImplementationReadiness } from "./pipeline-implementation-readiness.mjs";

const result = await evaluatePipelineImplementationReadiness();

if (result.driftFailures.length > 0) {
  console.error("Pipeline implementation readiness drift check failed:");
  for (const failure of result.driftFailures) {
    console.error(`- [${failure.failureClass}] ${failure.categoryId}: ${failure.message}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      driftStatus: result.driftStatus,
      readinessStatus: result.readinessStatus,
      readyForImplementation: result.readyForImplementation,
      executionAuthorityApproved: result.executionAuthorityApproved,
      categories: result.categoryIds.length,
      unresolved: result.summary,
      unresolvedItems: result.unresolvedItems,
    },
    null,
    2
  )
);
