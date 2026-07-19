import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManagerTerminalEventDogfoodPacket,
  createDogfoodRunId,
  parseDogfoodArgs,
  projectDogfoodEvidence,
  runManagerTerminalEventDogfood,
} from "../scripts/manager-terminal-event-dogfood.mjs";

test("dogfood builder creates an authoritative fresh packet with unique replay identity", () => {
  const first = buildManagerTerminalEventDogfoodPacket({ runId: createDogfoodRunId(new Date("2026-07-19T15:30:00.000Z")) });
  const second = buildManagerTerminalEventDogfoodPacket({ runId: createDogfoodRunId(new Date("2026-07-19T15:30:00.000Z")) });

  assert.equal(first.status, "authoritative_backlog_exhausted");
  assert.equal(first.summary.terminalDisposition.canonicalEventIntegration, "missing_supervisor_contract");
  assert.equal(first.summary.mutationMode, "none; metadata-only terminal disposition");
  assert.equal(first.summary.noNewEpic, true);
  assert.notEqual(first.summary.terminalDisposition.runId, second.summary.terminalDisposition.runId);
  assert.notEqual(first.summary.terminalDisposition.idempotencyKey, second.summary.terminalDisposition.idempotencyKey);
  assert.equal(first.summary.terminalDisposition.rawPayloadRetained, false);
});

test("dogfood command performs only the explicit loopback sync and emits bounded evidence", async () => {
  const calls = [];
  const result = await runManagerTerminalEventDogfood(["--supervisor-url", "http://127.0.0.1:8000"], {
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method, body: options.body });
      if (options.method === "POST") {
        const request = JSON.parse(options.body);
        return response({ ...request, createdAt: "2026-07-19T15:31:00.000Z" });
      }
      const request = JSON.parse(calls[0].body);
      return response({ ...request, createdAt: "2026-07-19T15:31:00.000Z" });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
  assert.match(result.evidence.eventId, /^manager-terminal-event:[0-9a-f]{40}$/);
  assert.match(result.evidence.idempotencyKey, /^authoritative-backlog-exhausted:/);
  assert.equal(result.evidence.metadataOnly, true);
  assert.equal(result.evidence.rawPayloadRetained, false);
  assert.deepEqual(Object.keys(result.evidence).sort(), [
    "eventId", "idempotencyKey", "metadataOnly", "persistedAt", "rawPayloadRetained", "runId", "sourceIdentity", "sourceRevision", "status", "supervisorEndpoint",
  ].sort());
  assert.doesNotMatch(JSON.stringify(result), /provider payload|raw prompt|secret value|credential value/i);
});

test("dogfood failure stays metadata-only and does not start a supervisor", async () => {
  let calls = 0;
  const result = await runManagerTerminalEventDogfood(["--supervisor-url", "http://127.0.0.1:8000"], {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("supervisor unavailable");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.evidence.status, "blocked");
  assert.equal(result.evidence.metadataOnly, true);
  assert.equal(result.evidence.rawPayloadRetained, false);
  assert.equal(result.evidence.errorCode, "manager_supervisor_sync_network_error");
  assert.doesNotMatch(JSON.stringify(result), /supervisor unavailable|provider payload|raw prompt/i);
});

test("dogfood parser requires an explicit supervisor URL and preserves bounded overrides", () => {
  assert.throws(() => parseDogfoodArgs([]), /--supervisor-url/);
  const options = parseDogfoodArgs([
    "--",
    "--supervisor-url=http://localhost:8000",
    "--run-id", "manager-terminal-dogfood-test",
    "--source-revision", "dogfood-test-revision",
  ]);
  assert.deepEqual(options, {
    supervisorUrl: "http://localhost:8000",
    runId: "manager-terminal-dogfood-test",
    sourceIdentity: "doc:docs/architecture/manager-supervisor-terminal-event-sync-boundary.md",
    sourceRevision: "dogfood-test-revision",
  });
  assert.equal(projectDogfoodEvidence({ packet: null, supervisorUrl: options.supervisorUrl }).metadataOnly, true);
});

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ data: structuredClone(data) }) };
}
