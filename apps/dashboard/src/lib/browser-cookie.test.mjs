import assert from "node:assert/strict";
import test from "node:test";
import { readCookieValue } from "./browser-cookie.mjs";

test("reads the synchronizer CSRF cookie across normal cookie formatting", () => {
  assert.equal(readCookieValue("kendall_operator_csrf=csrf%2Bvalue; other=1", "kendall_operator_csrf"), "csrf+value");
  assert.equal(readCookieValue("other=1;kendall_operator_csrf=csrf%3Dvalue", "kendall_operator_csrf"), "csrf=value");
});

test("fails closed for missing or malformed cookie values", () => {
  assert.equal(readCookieValue("other=1", "kendall_operator_csrf"), "");
  assert.equal(readCookieValue("kendall_operator_csrf=%ZZ", "kendall_operator_csrf"), "");
  assert.equal(readCookieValue("kendall_operator_csrf=first;kendall_operator_csrf=second", "kendall_operator_csrf"), "");
});
