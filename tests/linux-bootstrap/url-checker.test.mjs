import assert from "node:assert/strict";
import test from "node:test";

import { checkUrl } from "../../scripts/check-linux-bootstrap-url.mjs";

test("bootstrap URL checker fails closed for unsupported URL", () => {
  return checkUrl("http://example.test/not-found.sh").then((result) => {
    assert.equal(result.statusCode, 0);
    assert.match(result.error, /Protocol "http:" not supported|Invalid URL/);
  });
});
