# Manual test instructions: required with every portion

Standing rule set by Zain on 2026-09-25. The backend repo carries the same specification with its
step-by-step (`../fawtir-backend/docs/references/integration-testing.md`); keep the two in sync.

A portion is not done when the code is written. It is done when Zain has tested it and said so.

## What every portion ships

- **Written for someone with the app already running** who knows nothing about what changed.
- **Each case has:** a number and a title; preconditions; the test data to use, and how to create it if it does not
  exist; numbered steps precise enough to follow mechanically; and a **concrete** expected result. "The count above
  the tab matches the number of rows shown", not "the count is correct".
- **More than the happy path:** empty state, error state, loading, permission-denied (log in as `demo_viewer`),
  paging boundaries, search with no results, sorting, and the Arabic view. Where money is shown, include a case
  that checks the figures reconcile.
- **Which cases cannot pass yet and why:** a feature behind a flag, a module not deployed, a missing backend, so no
  time is spent chasing a known gap.
- **What to capture when something fails:** a screenshot, the browser console, the failing request and its response,
  and the backend log excerpt.

## Also

- Drive the real UI, not only the API. Local mail goes to Mailpit only (:8025); sending a reminder or e-mail from
  the app still needs Zain's go-ahead at that moment.
- State what test data you changed and put it back (timezones, seeded rows, cancelled invoices).
- Record it in the workspace, not the repo: a test record per screen under `Testing/`, and the API tracker
  `Income-Invoice-APIs/API-Integration-Status.md`.
