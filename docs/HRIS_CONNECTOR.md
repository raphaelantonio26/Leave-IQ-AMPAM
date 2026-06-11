# HRIS Live-Sync Seam (v1.2 · Tier 3)

The import pipeline is four stages with exactly one coupling point:

```
RosterSource.fetch() ─→ diff.js ─→ ImportADP preview ─→ adp_import_commit (transaction + audit)
        ▲
   the only seam
```

Everything right of the arrow consumes **one shape** and never knows where
rows came from. Swapping today's file upload for a live ADP API pull means
implementing one class and changing zero downstream code.

## The contract

`RosterSource.fetch()` resolves to:

```js
{
  rows:     NormalizedRosterRow[],
  errors:   string[],   // blocking
  warnings: string[],   // surfaced, non-blocking
  meta:     { sourceName, fetchedAt, ... }
}
```

`NormalizedRosterRow` is defined (with field-by-field comments) at the top of
`src/lib/adp/connector.js`. Two invariants are non-negotiable:

1. **`file_number` is a string with leading zeros intact.** It is the identity
   key joining employees, cases, intermittent attribution, and the import
   duplicate guard. Any connector that emits numbers breaks attribution.
2. **`leave_designation: ''` means awaiting designation.** Unknown ADP absence
   codes must map to `''` (the diff stage already enforces this via
   `KNOWN_DESIGNATIONS`), never to a guess. Clocks stay idle until HR assigns.

## Implementing the live connector

Fill in `AdpApiRosterSource.fetch()` in `src/lib/adp/connector.js`. The stub
carries the field mapping for ADP Workers v2. Operational notes:

- **Credentials never reach the browser.** Run the pull in a Supabase edge
  function (`adp-sync`) holding the ADP client cert + secret; the frontend
  calls the function, the function returns the contract shape.
- **Pagination**: `$top=100` pages; accumulate before returning — `diff.js`
  expects the complete roster, not a page.
- **Scheduling**: once live, the same edge function can run nightly and call
  `adp_import_commit` directly, turning import into sync. Preview/confirm
  remains available for manual runs — both paths share the diff and the
  commit RPC, so audit behavior (`source='import'`) is identical.
- **Where to register**: `getRosterSource("adp-api")` already routes to the
  stub; ImportADP can grow a source picker when the connector is real.

## What must NOT change

`diff.js`, `ImportADP.jsx` (after the fetch call), `adp_import_commit`, the
`unique (file_number, start_date)` guard, and the audit semantics. If the API
connector requires touching any of those, the connector is emitting the wrong
shape — fix it at the seam.
