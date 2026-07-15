import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL("../services/supervisor/src/supervisor/application/service.py", import.meta.url);
const apiPath = new URL("../services/supervisor/src/supervisor/api/main.py", import.meta.url);

function method(source, name, nextName) {
  const start = source.indexOf(`    async def ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const asyncEnd = nextName ? source.indexOf(`    async def ${nextName}(`, start + 1) : -1;
  const syncEnd = nextName ? source.indexOf(`    def ${nextName}(`, start + 1) : -1;
  const candidates = [asyncEnd, syncEnd].filter((index) => index >= 0);
  const end = nextName ? Math.min(...candidates) : source.length;
  assert.notEqual(end, -1, `missing boundary ${nextName}`);
  return source.slice(start, end);
}

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${label}: missing ${first}`);
  assert.notEqual(secondIndex, -1, `${label}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${label}: ${first} must precede ${second}`);
}

test("legacy assignment is an admission-locked fail-closed compatibility endpoint", async () => {
  const [service, api] = await Promise.all([readFile(servicePath, "utf8"), readFile(apiPath, "utf8")]);
  const assignment = method(service, "assign_work_item", "set_escalation");
  assertBefore(assignment, "await self._acquire_execute_admission_lock(session)", "raise ValueError(", "legacy assignment");
  assert.doesNotMatch(assignment, /\.assignee_(?:id|label)\s*=/);
  assert.match(assignment, /canonical pipeline-operational-action\/v1/);
  assert.match(api, /legacy_assignment_disabled_use_canonical_reassign_v1/);
});

test("subscription launch locks and refreshes before routing reads and reserves before process launch", async () => {
  const service = await readFile(servicePath, "utf8");
  const subscription = method(service, "evaluate_subscription_agent_launch_request", "_subscription_agent_target_gate_enabled");
  assertBefore(subscription, "await self._acquire_execute_admission_lock(session)", "session.get(WorkItem", "subscription launch");
  assertBefore(subscription, "await session.refresh(item)", "await self.get_routing_preview", "subscription launch");
  assertBefore(subscription, "_reserve_subscription_agent_launch_runtime_attempt(", "supervised_subscription_launch_adapter.run(", "subscription launch");
});

test("all guarded utility and recipe side effects refresh admission and reserve before launch", async () => {
  const service = await readFile(servicePath, "utf8");
  const ollama = method(service, "get_local_evidence_explanation", "record_routing_override");
  const utility = method(service, "_run_guarded_utility_worker", "_record_routing_outcome_event");
  const verification = method(service, "_run_admitted_recipe_verification_commands", "_run_recipe_implementation_commands");
  const implementation = method(service, "_run_admitted_recipe_implementation_commands", "_run_recipe_command");
  const remote = method(service, "_run_admitted_remote_delivery", "_remote_delivery_commands");
  const reservation = method(service, "_reserve_external_launch_attempt", "_finalize_external_launch_attempt");
  const admission = method(service, "_evaluate_execute_admission", "_execute_admission_dimension_slug");
  assertBefore(ollama, "await self._acquire_execute_admission_lock(session)", "session.get(WorkItem", "Ollama");
  assertBefore(ollama, "_reserve_external_launch_attempt(", "ollama_provider_adapter.explain(", "Ollama");
  assertBefore(utility, "await self._acquire_execute_admission_lock(session)", "_refresh_external_launch_target_for_admission(", "utility worker");
  assertBefore(utility, "_refresh_external_launch_target_for_admission(", "_recipe_gate_audit_view(", "utility worker");
  assertBefore(utility, "_recipe_gate_audit_view(", "_record_guarded_utility_routing_event(", "utility worker");
  assertBefore(utility, "_reserve_external_launch_attempt(", "self.utility_worker.run(task)", "utility worker");
  assertBefore(verification, "await self._acquire_execute_admission_lock(session)", "_refresh_external_launch_target_for_admission(", "recipe verification");
  assertBefore(verification, "_recipe_gate_audit_view(", "_reserve_external_launch_attempt(", "recipe verification");
  assertBefore(verification, "_reserve_external_launch_attempt(", "self._run_recipe_verification_commands(current_recipe)", "recipe verification");
  assert.match(verification, /task_kind=TaskKind\.VALIDATION_EXECUTION\.value/);
  assert.match(verification, /recipe\.verification_no_launch/);
  assertBefore(implementation, "_reserve_external_launch_attempt(", "self._run_recipe_implementation_commands(recipe, item)", "recipe implementation");
  assert.match(implementation, /recipe\.implementation_no_launch/);
  assertBefore(remote, "await self._acquire_execute_admission_lock(session)", "_refresh_external_launch_target_for_admission(", "remote delivery");
  assertBefore(remote, "_recipe_gate_audit_view(", "_reserve_external_launch_attempt(", "remote delivery");
  assertBefore(remote, "_reserve_external_launch_attempt(", "self._remote_delivery_commands(item)", "remote delivery");
  assertBefore(reservation, "_refresh_external_launch_target_for_admission(", "_reject_pending_verification_retry_admission(", "external launch reservation");
  assertBefore(reservation, "_reject_pending_verification_retry_admission(", "_active_execution_attempt(", "external launch reservation");
  assertBefore(reservation, "_evaluate_execute_admission(session)", "attempt = ExecutionAttempt(", "external launch reservation");
  assertBefore(reservation, "await session.commit()", "return attempt", "external launch reservation");
  assert.match(admission, /active_verification_work_item_ids/);
  assert.match(admission, /_execution_attempt_has_task_kind\(attempt, TaskKind\.VALIDATION_EXECUTION\.value\)/);
  assert.equal((service.match(/self\._run_recipe_verification_commands\(/g) || []).length, 1);
  assert.equal((service.match(/self\._remote_delivery_commands\(item\)/g) || []).length, 1);
});
