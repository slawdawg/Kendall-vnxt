import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");

test("compose opts into container-only bridge binds without changing local defaults", () => {
  assert.match(compose, /SUPERVISOR_CONTAINER_MODE:\s*["']?true/);
  assert.match(compose, /SUPERVISOR_HOST:\s*0\.0\.0\.0/);
  assert.match(compose, /KENDALL_DASHBOARD_CONTAINER_MODE:\s*["']?true/);
  assert.match(compose, /KENDALL_DASHBOARD_HOST:\s*0\.0\.0\.0/);
  assert.match(compose, /SUPERVISOR_INTERNAL_URL:\s*http:\/\/supervisor:8000/);
  assert.match(compose, /127\.0\.0\.1:8000:8000/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.doesNotMatch(compose, /KENDALL_LAN_AUTH_ENABLED:\s*["']?true/);
});
