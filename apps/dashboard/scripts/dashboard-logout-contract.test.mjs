import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/components/logout-button.tsx"),
  "utf8",
);
const shellSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/components/shell.tsx"),
  "utf8",
);

test("logout control exposes an accessible, visible, single-submit button", () => {
  assert.match(source, /const \[pending, setPending\] = useState\(false\)/);
  assert.match(source, /disabled=\{pending\}/);
  assert.match(source, /aria-label="Sign out of the Kendall dashboard"/);
  assert.match(source, /cursor-pointer/);
  assert.match(source, /bg-\[var\(--surface\)\]/);
  assert.match(source, /border-\[var\(--line\)\]/);
  assert.match(source, /hover:border-\[var\(--accent\)\]/);
  assert.match(source, /focus-visible:outline/);
  assert.match(source, /Signing out\.\.\./);
  assert.match(source, /AbortController/);
  assert.match(source, /setPending\(false\)/);
  assert.match(shellSource, /lanAuthEnabled \? "xl:pr-14" : ""/);
});
