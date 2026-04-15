import test from "node:test";
import assert from "node:assert/strict";
import { extractInitialStateLiteral, parseInitialStateFromHtml } from "../src/state.js";

test("extractInitialStateLiteral returns the object literal", () => {
  const html = '<html><script>window.__INITIAL_STATE__={foo:1,bar:"baz"};</script></html>';
  assert.equal(extractInitialStateLiteral(html), '{foo:1,bar:"baz"}');
});

test("parseInitialStateFromHtml evaluates non-JSON literals with undefined", () => {
  const html =
    '<html><script>window.__INITIAL_STATE__={foo:1,bar:undefined,nested:{ok:true}};</script></html>';
  const result = parseInitialStateFromHtml(html);
  assert.equal(result.foo, 1);
  assert.equal(result.bar, undefined);
  assert.equal(result.nested.ok, true);
});
