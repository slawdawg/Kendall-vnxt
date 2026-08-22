import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("retired Learn follow-up mutation has no runtime source or CI selector", async () => {
  const [supervisorSource, proxySource, apiSource, schemaSource, serviceSource, contractSource, packageSource] = await Promise.all([
    readFile("apps/dashboard/src/lib/supervisor.ts", "utf8"),
    readFile("apps/dashboard/scripts/dashboard-supervisor-proxy.mjs", "utf8"),
    readFile("services/supervisor/src/supervisor/api/main.py", "utf8"),
    readFile("services/supervisor/src/supervisor/api/schemas.py", "utf8"),
    readFile("services/supervisor/src/supervisor/application/service.py", "utf8"),
    readFile("packages/contracts/src/api.ts", "utf8"),
    readFile("package.json", "utf8"),
  ]);

  assert.doesNotMatch(supervisorSource, /createLearnFollowUpCandidateWork/);
  assert.doesNotMatch(supervisorSource, /learn-follow-up-candidate-work/);
  assert.doesNotMatch(proxySource, /learn-follow-up-candidate-work/);
  assert.doesNotMatch(apiSource, /learn-follow-up-candidate-work/);
  assert.doesNotMatch(schemaSource, /WorkPacketLearnFollowUpCandidateWorkRequest/);
  assert.doesNotMatch(serviceSource, /create_work_packet_learn_follow_up_candidate_work/);
  assert.doesNotMatch(contractSource, /WorkPacketLearnFollowUpCandidateWorkPayload/);
  assert.doesNotMatch(packageSource, /test_learn_follow_up_creation/);
});
