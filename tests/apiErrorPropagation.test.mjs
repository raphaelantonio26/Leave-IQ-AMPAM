// api.js error-propagation tests (v2.2.0). The `ok` helper is the chokepoint
// every Supabase call routes through; it must surface errors as thrown
// exceptions (which DataContext now turns into a visible toast) rather than
// returning a silent null.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ok } from "../src/data/api.js";

test("ok returns data when there is no error", () => {
  assert.equal(ok({ data: 42, error: null }), 42);
  assert.deepEqual(ok({ data: [{ id: 1 }], error: null }), [{ id: 1 }]);
});

test("ok throws the backend error message when error is present", () => {
  assert.throws(
    () => ok({ data: null, error: { message: "new row violates row-level security policy" } }),
    /row-level security/,
  );
});
