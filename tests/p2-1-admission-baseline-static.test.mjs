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

test("Ollama, guarded utility, and recipe commands all reserve durable attempts before launch", async () => {
  const service = await readFile(servicePath, "utf8");
  const ollama = method(service, "get_local_evidence_explanation", "record_routing_override");
  const utility = method(service, "_run_guarded_utility_worker", "_record_routing_outcome_event");
  const recipe = method(service, "_run_admitted_recipe_implementation_commands", "_run_remote_command");
  assertBefore(ollama, "await self._acquire_execute_admission_lock(session)", "session.get(WorkItem", "Ollama");
  assertBefore(ollama, "_reserve_external_launch_attempt(", "ollama_provider_adapter.explain(", "Ollama");
  assertBefore(utility, "_reserve_external_launch_attempt(", "self.utility_worker.run(task)", "utility worker");
  assertBefore(recipe, "_reserve_external_launch_attempt(", "self._run_recipe_implementation_commands(recipe, item)", "recipe commands");
  assert.match(recipe, /recipe\.implementation_no_launch/);
});
