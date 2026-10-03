# Platform: validation policies console handoff

**Branch:** `feat/console-validation-policies`, PR #136 to `main` (rebased onto `main` at
`d2e0ce77`). **State:** open and not merged, not deployed. Tested with stubbed requests, the local
mock API, and a disposable local backend (never TEST). Sections below that describe an earlier
state say so where it matters.

## Purpose and scope

The SMP "data blockers" are the platform's versioned validation policies. A version takes effect
only after `DRAFT -> SUBMITTED -> PENDING_REVIEW -> APPROVED -> ACTIVE`, and the server enforces a
separation of duties along the way. Until now there was no screen for any of it, so a company's
Peppol Participant ID could be refused at approval (`PID_POLICY_NOT_ACTIVE`) with nothing in the
console to explain why or to fix it.

| Delivered                            | What                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** `/console/policies`     | One row per policy type the operator may read: the version in force, the newest version, its work-queue label, and a "Needs my action" filter kept in the URL                                                             |
| **Policy** `/console/policies/:type` | The version list, the selected version in full (details, contents, people and times), and the lifecycle steps the server allows this operator                                                                             |
| **Lifecycle steps**                  | Submit, Start review, Approve, Activate, Reject for a version under review, and Withdraw schedule for a scheduled version not yet in effect. Each behind a confirmation dialog, each one request with a fixed reason code |
| **Authoring**                        | Create draft, Edit draft and New draft from this version, for `TAXPAYER_PID_CONTRACT` only                                                                                                                                |
| **Onboarding**                       | The Participant ID card on a company's verification page now says when approval is blocked by a missing policy, links to it, and reads the new refusal codes                                                              |
| **Navigation**                       | One item, "Validation policies", under THE PLATFORM                                                                                                                                                                       |

**No design exists for these screens.** There is no Figma frame for a validation-policy console.
Both pages are flagged as no-design screens, built only from components the console already draws:
`ConsoleShell`, `ConsoleBreadcrumbs`, `ConsoleNotice`, `ConsoleStatusPill`, `RowsView`, `ReviewCard`
and `ReviewLine`, `Modal`, `Button`, `Input`, `Select`, `DateField`, and the subscriptions modals'
`Field` and `TextArea`. No new component style, colour, icon or dependency was added. The nav item
reuses `NavInvoicesIcon`. The owner should confirm the layout or supply a frame.

## Backend contract summary

The frozen contract supplied for this build is the authority. Base path
`/api/v1/platform/peppol/smp`. Session cookie on every route, `X-CSRF-Token` on writes (the shared
client adds it), no `Idempotency-Key`. The server rejects unknown JSON properties, so every body is
built field by field.

Reads:

| Request                                             | Returns                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `GET /data-blockers`                                | `BlockerOverviewEntry[]`, only the types the caller may read |
| `GET /data-blockers/{type}/versions?page=0&size=20` | `BlockerVersionView[]`, newest first, no total               |
| `GET /data-blockers/{type}/versions/{versionId}`    | `BlockerVersionView`, or `404`                               |
| `GET /data-blockers/{type}/current`                 | `BlockerVersionView`, or `404` when nothing is in force      |

Writes, each answering the full updated `BlockerVersionView`:

| Request                                    | Body                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `POST /data-blockers/{type}/versions`      | `{ data, evidenceReference, testOnly, effectiveFrom, effectiveTo }`          |
| `PUT /data-blockers/{type}/versions/{id}`  | the same plus `expectedOptimisticLockVersion`                                |
| `POST .../{id}/submit`                     | `{ expectedOptimisticLockVersion, reasonCode: "POLICY_SUBMITTED" }`          |
| `POST .../{id}/review`                     | `{ expectedOptimisticLockVersion, reasonCode: "POLICY_REVIEW_STARTED" }`     |
| `POST .../{id}/approve`                    | `{ expectedOptimisticLockVersion, reasonCode: "POLICY_APPROVED" }`           |
| `POST .../{id}/activate`                   | `{ expectedOptimisticLockVersion, reasonCode: "POLICY_ACTIVATED" }`          |
| `POST .../{id}/reject`                     | `{ expectedOptimisticLockVersion, reasonCode: "POLICY_REJECTED" }`           |
| `POST .../{id}/revoke` (Withdraw schedule) | `{ expectedOptimisticLockVersion, reasonCode: "POLICY_SCHEDULE_WITHDRAWN" }` |

Separation of duties, enforced by the server: the approver cannot be the creator, submitter or
reviewer, and the activator cannot be the approver. The screen never works this out. It renders the
`allowedActions` the server computes for the current user.

**Reject (contract delta of 3 Oct 2026).** The frontend was built to this delta while the backend
was being changed to match it; it has not been run against a backend that implements it.

- `allowedActions` carries `reject: { allowed, reason }` on the version view and on the overview
  summary. The server allows it when the version is `PENDING_REVIEW` and the caller holds the
  reviewer permission. There is no separation of duties on reject: the creator, the submitter and
  the reviewer may each reject. The denial reasons are `MISSING_PERMISSION` and `INVALID_STATE`.
- A version view carries `rejectedBy`, `rejectedAt` and `actors.rejectedBy`, all null until a
  rejection. `reviewedBy` and `reviewedAt` stay what they were: the rejecter is recorded apart.
- The answer is the full updated view with `status: "REJECTED"`. Refusals use the existing codes:
  `409 STALE_VERSION`, `409 INVALID_STATE`, `403`.
- `REJECTED` is terminal. No action is allowed on a rejected version.

Refusals are read by HTTP status and the problem's `code` only. `detail` is never matched and never
shown. `correlationId` is shown as "Reference: <id>".

## Behaviour

**Work-queue label.** Derived from `status` and `allowedActions` alone
(`queueLabel` in `src/lib/console/validationPolicies.ts`):

| Status                                 | Condition                                          | Label                                             |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| DRAFT                                  |                                                    | Draft                                             |
| SUBMITTED                              |                                                    | Submitted, awaiting review                        |
| PENDING_REVIEW                         | `approve.allowed`                                  | Pending your approval                             |
| PENDING_REVIEW                         | `approve.reason = SELF_APPROVAL_NOT_ALLOWED`       | Awaiting independent approval                     |
| PENDING_REVIEW                         | otherwise                                          | Pending review                                    |
| APPROVED                               | `activate.allowed`                                 | Approved, awaiting your activation                |
| APPROVED                               | `activate.reason = APPROVER_CANNOT_ACTIVATE`       | Approved, awaiting activation by another operator |
| APPROVED                               | `activate.reason = ACTIVATION_PRECONDITION_FAILED` | Approved, cannot be activated as it stands        |
| APPROVED                               | otherwise                                          | Approved, awaiting activation                     |
| ACTIVE, NOT_APPLICABLE                 |                                                    | In force                                          |
| REJECTED, EXPIRED, REVOKED, SUPERSEDED |                                                    | the plain status                                  |

"Needs my action" keeps the rows whose newest version has `submit`, `review`, `approve` or
`activate` allowed. Being allowed to edit a draft does not count, and neither does being allowed
to reject: rejecting is a decision an operator may take, not a step the version is waiting on them
for, and since every reviewer may reject every version under review it would otherwise put all of
them in every reviewer's queue (`FORWARD_TRANSITIONS` in the lib).

**Buttons.** Each lifecycle button is rendered only when the server says `allowed`. A step that is
not allowed is absent, not disabled (owner decision of 1 Oct 2026). When the reason is the
separation of duties, a note says so: "Approval requires another authorized platform operator
because you took part in creating or reviewing this version." and its activation equivalent.

**Reject.** Drawn only when `allowedActions.reject.allowed`, under the forward step. It is read on
its own and not inferred from why approval was refused, so an author who is told "Awaiting
independent approval" still sees Reject when the server allows it. The button is the console's
`secondary` variant, which is what "Reject ID" (`ParticipantPanel.tsx`) and "Reject registration"
(`DecisionPanel.tsx`) use. The console has no red or danger button variant (`Button` offers
`primary`, `secondary` and `ghost`), and none was added. A rejected version shows no lifecycle
button, the work-queue label "Rejected", and the rejecter with the time in the people trail,
between "Review started" and where "Approved" would have been.

**Confirmation.** Every step opens a dialog naming the policy, the version number and the current
status, and saying what the step records ("This action records you as the approving operator.").
There is no reason field: the code is fixed. The Activate dialog adds that the version becomes the
policy in force from its effective date, shows that date, and says the policy in force now stays
until then if the date is still ahead, and for `TAXPAYER_PID_CONTRACT` the activation
impact, worded to claim exactly what the contract states and no more. The Reject dialog says "This
action records you as the rejecting operator." and "A rejected version cannot be approved or
activated. To continue, prepare a new draft."

**Concurrency.** The lock version sent is always the one on the object the server last returned.
After a success the server's answer replaces the selected version and the list is read again. On
any `409` or `404` the dialog closes, the message and reference are shown on the page, and the list
is read again. The step is never sent a second time by the screen. A `403`, a `400` or a server
fault stays in the dialog and reads nothing.

**Selection.** The selected version is in the URL as `?version=<id>`. With none, the newest is
selected. A version named in the URL but older than the listed page is read on its own, once.

**Editor.** A modal form. No field has a default the author did not choose: value source, canonical
representation and uniqueness rule are plain required inputs, and normalisation, case sensitivity
and VAT matching start unanswered. `testOnly` is always sent `false`. The allowed-characters
pattern is left out of `data` when empty. Fixtures are one per line and kept exactly as typed.
Days are sent as midnight UTC of the chosen day. "New draft from this version" copies the contents
only, not the evidence reference or the effective dates.

**Onboarding.** When the Participant ID card would offer a decision (status `SUBMITTED` or
`PENDING_REVIEW`, and the operator is not the submitter) it reads
`GET /data-blockers/TAXPAYER_PID_CONTRACT/current` once. `404` shows "Participant ID approval is
blocked because the Taxpayer Participant ID validation policy is not active." with a "View
validation policy" link, and no Approve button. Reject stays, since it needs no policy. `200` is
the unchanged path. Any other failure of that read does not block: the server decides. Nothing is
ever activated automatically, and the reason-code input is unchanged.

## Files

Created:

- `src/lib/console/validationPolicies.ts` and `.test.ts`: types, paths, requests, form mapping,
  validation, queue labels, failure mapping
- `src/lib/console/problemReference.ts`: the correlation id of a refused request
- `src/pages/ConsolePage/ValidationPoliciesPage.tsx`: overview
- `src/pages/ConsolePage/ValidationPolicyPage.tsx`: one policy
- `src/pages/ConsolePage/policies/PolicyStatusPill.tsx`
- `src/pages/ConsolePage/policies/PolicyQueueLabel.tsx`: the work-queue label, with the scheduled
  date printed (never compared)
- `src/pages/ConsolePage/policies/PolicyFailureNotice.tsx` (also `ProblemReference`)
- `src/pages/ConsolePage/policies/PolicyTransitionDialog.tsx`
- `src/pages/ConsolePage/policies/PolicyContents.tsx`
- `src/pages/ConsolePage/policies/PolicyTrail.tsx`
- `src/pages/ConsolePage/policies/PidPolicyEditor.tsx`
- `src/pages/ConsolePage/validationPolicies.test.tsx`
- `tools/mock-api/routes/policies.mjs`: fixtures for screenshots only (see "The mock API is
  development tooling only")
- `docs/frontend/PLATFORM_VALIDATION_POLICIES_HANDOFF.md`: this file

Changed:

- `src/App.tsx`: two routes
- `src/pages/ConsolePage/index.ts`: two exports
- `src/lib/consoleNav.ts`: one nav item
- `src/lib/console/pidSubmission.ts`: refusal codes in `describeParticipantFailure`, `isPolicyNotActive`
- `src/pages/ConsolePage/verification/ParticipantPanel.tsx`: the policy read, the blocked notice, the reference line
- `src/pages/ConsolePage/verificationDecisions.test.tsx`: see "Existing assertions changed"
- `src/i18n/locales/en.json`, `ar.json`: 179 keys under `console.policies`, `console.nav.policies`,
  and four under `console.verification.participant`, added with `tools/i18n/merge.cjs`. Reject
  added eight more under `console.policies` the same way: `action.reject`, `confirm.reject.*`
  (five), `done.reject` and `trail.rejected`

## Routes

| Route                     | Page                     | Gate               |
| ------------------------- | ------------------------ | ------------------ |
| `/console/policies`       | `ValidationPoliciesPage` | `platform.support` |
| `/console/policies/:type` | `ValidationPolicyPage`   | `platform.support` |

Query: `?filter=mine` on the overview, `?version=<id>` on a policy. An unknown `:type` is answered
locally as not found, with no request.

## Request inventory

Entitlements (`GET /v1/me/entitlements`) are asked once per session by the shell and are not
counted below.

| Screen or action                                                               | Requests                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Open the overview                                                              | 1: `GET /data-blockers`                                                                                            |
| Toggle "Needs my action"                                                       | 0                                                                                                                  |
| Open `TAXPAYER_PID_CONTRACT`                                                   | 2: `GET .../versions?page=0&size=20`, `GET /data-blockers` (for `canCreateDraft`)                                  |
| Open any other type                                                            | 1: `GET .../versions?page=0&size=20`                                                                               |
| Open with `?version=` in the list                                              | no extra                                                                                                           |
| Open with `?version=` not in the list                                          | +1: `GET .../versions/{id}`                                                                                        |
| Open with a malformed `?version=` or unknown `:type`                           | no extra, answered locally                                                                                         |
| Select another listed version                                                  | 0                                                                                                                  |
| Submit, Start review, Approve, Activate, Reject or Withdraw schedule, accepted | 2: 1 `POST`, then 1 `GET .../versions`                                                                             |
| The same, refused with `409` or `404`                                          | 2: 1 `POST`, then 1 `GET .../versions` (+1 `GET .../versions/{id}` when the version is not in the list). No resend |
| The same, refused with `403`, `400`, `5xx` or no answer                        | 1: the `POST`                                                                                                      |
| Open a confirmation dialog or the editor, or cancel it                         | 0                                                                                                                  |
| Create draft, accepted                                                         | 2: 1 `POST .../versions`, then 1 `GET .../versions`                                                                |
| Edit draft, accepted                                                           | 2: 1 `PUT .../versions/{id}`, then 1 `GET .../versions`                                                            |
| Save draft refused locally (validation)                                        | 0                                                                                                                  |
| Save draft refused with `409`                                                  | 2: the write, then 1 `GET .../versions`. The form stays open and cannot be sent again                              |
| Company verification page, Participant ID card with a decision to offer        | +1: `GET /data-blockers/TAXPAYER_PID_CONTRACT/current`                                                             |
| The same card with nothing to decide                                           | +0                                                                                                                 |
| Approve refused with `PID_POLICY_NOT_ACTIVE`                                   | 2: 1 `POST .../verify`, then 1 `GET .../current`. No resend                                                        |

## RBAC and security notes

- The page gate is `platform.support` only, as the contract says. Which types are readable and
  which steps are allowed is the API's decision. A refused read (`403`) reads "no access", never as
  an empty list.
- No button is derived from user ids, roles or usernames. `allowedActions` is the only source.
  The people trail is display only.
- The frontend check is a convenience. Hiding a button is not a control: the server enforces the
  permission and the separation of duties on every write.
- The lock version always comes from the server's last answer, never from input.
- Reason codes are constants in the lib. Nothing a person types reaches `reasonCode` on these
  routes.
- `testOnly` cannot be set from this console.
- Server prose (`detail`), exception names and stack traces are never rendered. Tests assert it.
- Policy contents, hashes and evidence references are not written to storage or the console. A
  test asserts it.
- A `401` forgets the entitlements and leaves for Login, on reads and writes alike.
- Unnamed actors show "Operator" and the first eight characters of the id, never the whole id.

## Tests and gate results

Run on Windows, 2 to 3 October 2026, on the uncommitted tree.

| Gate                                                                                                                            | Result                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build` (the type-check)                                                                                                | Passed: `✓ built in 12.41s`                                                                                                                                                                                                      |
| Focused: `validationPolicies.test.ts`, `validationPolicies.test.tsx`, `verificationDecisions.test.tsx`, `verification.test.tsx` | `Test Files 4 passed (4)`, `Tests 187 passed (187)`                                                                                                                                                                              |
| `npm run test`, whole suite                                                                                                     | `Test Files 2 failed, 99 passed (101)`, `Tests 6 failed, 1687 passed (1693)`. All six are 15 s timeouts in `src/pages/onboarding.test.tsx` (5) and `src/pages/CreateInvoicePage/invoiceDraft.test.tsx` (1), neither touched here |
| Those two files re-run alone                                                                                                    | `onboarding.test.tsx` 53 passed (53); `invoiceDraft.test.tsx` 27 passed (27)                                                                                                                                                     |
| `npm run lint`                                                                                                                  | 29 errors, 3 warnings. All 29 are `react-refresh/only-export-components` in files that already had them; none is in a file created here. The one in `ParticipantPanel.tsx` is the existing `proposedParticipantId` export        |
| Prettier                                                                                                                        | The new files pass `--check` with the project flags. Existing files were not reformatted                                                                                                                                         |

The first whole-suite run had nine timeouts across six files, one of them the long typed-create
test in the new page suite. That test now carries its own 60 s ceiling, with the reason beside it,
and passed in the second whole-suite run.

**Reject, 3 October 2026, on the uncommitted tree.** The whole suite was not re-run in this pass.

| Gate                                    | Result                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx tsc -p tsconfig.app.json --noEmit` | No output, exit 0                                                                                                                                            |
| Focused, the same four files            | `Test Files 4 passed (4)`, `Tests 207 passed (207)`                                                                                                          |
| `npm run build`                         | Passed: `✓ built in 11.43s`                                                                                                                                  |
| `npm run lint`                          | 32 problems (29 errors, 3 warnings), unchanged. The only one in a file of this feature is still the `proposedParticipantId` export in `ParticipantPanel.tsx` |
| Prettier                                | The five changed source files pass `--check` with the project flags                                                                                          |

Reject added 4 tests to the lib suite and 16 to the page suite. A mutation check was run and
reverted: counting `reject` in `needsMyAction` and drawing Reject from the status instead of
`allowedActions.reject` together failed 6 tests.

New tests: 73 in the lib suite, 46 in the page suite, 18 added to `verificationDecisions.test.tsx`.
A mutation check was run and reverted: rendering every lifecycle button regardless of
`allowedActions`, resending a step after a `409`, and ignoring the policy `404` on the onboarding
card together failed 17 tests.

Checked by screenshot against the local mock API (`tools/mock-api/routes/policies.mjs`, port 8097,
never a real server): the overview, a policy, the editor and a confirmation dialog, in English and
Arabic at 1440 px and at 390 px. Every capture reported `scrollWidth` equal to the window width.

## Existing assertions changed

All in `src/pages/ConsolePage/verificationDecisions.test.tsx`. No request assertion was removed or
loosened.

1. "shows the tenant's real candidate ID and status once submitted": the synchronous
   `button('...participant.approve').disabled` check became an awaited
   `findByRole('button', ...)` followed by the same `.disabled === false` check. Approve now
   appears only after the policy read settles. Added `callsTo(POLICY_URL)` has length 1.
2. `openWithPid` gained a second argument, defaulting to a handler that answers the new
   `GET .../TAXPAYER_PID_CONTRACT/current` with `200`. The four tests with nothing to decide pass
   `{}` for it, so an unexpected policy read there would still fail loudly.
3. The three tests that call `answer(...)` directly with a reviewable submission (approve, reject,
   moved case) spread the same `200` handler in. Their request-body assertions are unchanged.
4. "approves the candidate as filed": added `callsTo(POLICY_URL)` has length 1.

`verification.test.tsx` is unchanged: its Participant ID read answers `null`, so no decision is
offered and no policy read is made.

For Reject, in the two policy suites. No assertion was removed or loosened.

1. `validationPolicies.test.ts`, "records each step with its fixed reason code": the expected
   object gained `reject: 'POLICY_REJECTED'`. The assertion is an exact match on the whole map, so
   a new step cannot be added without it.
2. `validationPolicies.test.ts`, the "sends %s as one POST" table gained a `reject` row. The
   assertions in its body are unchanged.
3. `validationPolicies.test.tsx`, `STEP_KEYS` gained `console.policies.action.reject`. Every
   existing "no lifecycle button" loop therefore also asserts that Reject is absent, which is
   stricter than before.
4. Fixtures only, forced by the types: `actions()` and `NO_PERMISSION` gained `reject`, and
   `version()` and the two full `actors` literals gained `rejectedBy` and `rejectedAt` as null.
5. `afterEach` in the page suite now also resets `document.documentElement` `lang` and `dir`,
   which the right-to-left tests set.

## Limitations

- **Exercised against the real backend once, on an isolated local stack (2026-10-03).** Backend
  worktree `feat/smp-policy-console`, real PostgreSQL, real sign-in with emailed codes, two
  operators, mail captured locally. Through the UI only: create draft, submit, start review
  (author shown "Awaiting independent approval", no Approve); second operator holding only the
  Support role found it as "Pending your approval", saw actor names, approved, had no Activate;
  author activated after the impact warning; the onboarding card showed the blocked notice with
  the policy link before activation and Approve ID afterwards; the Participant ID became Verified.
  A second tab submitting a version the first had already submitted got one `409`, the "changed
  since you opened it" message with its reference, one re-read and no resend.
  Not exercised live: draft edit, a server `400` on draft content, the seven other policy types,
  Arabic, and Reject (built after that run, against the contract delta, with stubbed requests only). The field names a `400` reports for `data` are still not in the contract; the editor
  recognises both `validationPattern` and `data.validationPattern` and otherwise reports at form
  level.
- **A version can be activated before it is in force.** "Effective from" is 00:00 UTC of the
  chosen day. Whether a live version is in force is the server's `forceState`, not the browser
  clock; see "Scheduled versions and `forceState`" below. (The not-yet-in-force label was added
  after the live run, where "Today" in a timezone ahead of UTC produced exactly that state.)
- **No design.** See above.
- **One page of versions.** The list reads the newest 20 and the API returns no total, so there is
  no pager. A note says so when 20 arrive. An older version is reachable only by its `?version=` link.
- **`canCreateDraft` is read once per visit** and not re-read after a write.
- **Effective dates are whole UTC days.** Editing a draft whose stored instant is not midnight UTC
  rounds it to midnight UTC of the same UTC day on save.
- **Patterns are not checked locally.** The server reads them as Java regular expressions, which
  JavaScript cannot judge. Fixtures are not run against the pattern here either.
- **The 32768-byte limit on `data` and the "looks like a secret" check are the server's alone.**
  Both arrive as a `400` and read "Fawtir did not accept these contents".
- **Policy type names are mine.** The eight English and Arabic labels were written from the type
  codes. "AP" and "OSS" are left as acronyms because the contract does not expand them. The code is
  shown under each name. The owner should confirm the wording.
- **The Arabic copy is provisional.** See "Arabic translation status" below.
- **Right to left is checked structurally, not visually.** A jsdom test renders the overview and a
  policy in Arabic the way the app does (`document.documentElement.dir = "rtl"` and the `dir="rtl"`
  wrapper of `App.tsx`) and asserts that the Arabic strings render, that type codes, the content
  hash, the evidence reference, the reason code, the scheme, the patterns, the fixtures, a short
  actor id and a correlation reference sit inside `dir="ltr"`, that each trail line isolates the
  person and the time in `<bdi>`, and that nothing in the page's content region sets a direction
  other than those left-to-right islands. jsdom has no layout engine and does not run the bidi
  algorithm, so it cannot prove what a reader sees: the visual order of mixed Arabic and Latin
  runs, mirroring of the layout, that Tailwind's logical classes (`text-start`, `text-end`,
  `ps-`, `pe-`) resolve to the right side, wrapping and overflow of long codes, or where
  punctuation and Arabic-Indic digits land. Those need a browser. The earlier Arabic screenshots
  predate Reject and were not retaken.
- **Reject looks like the console's other refusals, not like a danger action.** See "Reject" under
  Behaviour: there is no danger button variant to reuse. If the owner wants a red Reject, that is a
  new `Button` variant and a design decision.
- **The calendar's own "Today", "Clear" and month names are English** in `DateField`. Pre-existing.
- **Responsive sweep not run.** `npm run responsive:sweep` was not run and the new routes were not
  added to `tools/responsive/routes.json`. The pages were checked by screenshot instead (below).

### Arabic translation status

ARABIC_TRANSLATION_STATUS = PROVISIONAL_REQUIRES_NATIVE_REVIEW

The Arabic copy of these screens, including the eight policy type names, is provisional and has
not been reviewed by a native speaker or approved as regulatory wording.

## The mock API is development tooling only

`tools/mock-api` is a stand-in gateway a developer starts by hand (`node tools/mock-api/server.mjs`)
for screenshots and the responsive harness. It is not part of the application. The evidence, read
on 3 October 2026:

- **Nothing under `src/` imports it.** A search of `src/` for `mock-api`, for any import of a
  `tools/` path and for any `.mjs` import finds nothing. Outside `tools/mock-api` the string
  `mock-api` occurs only in documentation: `CLAUDE.md`, `docs/PROJECT_HANDBOOK.md`, five files in
  `docs/backend-guides/` and this file. `routes/policies.mjs` is loaded in one place, the
  `readdirSync` and dynamic `import()` in `tools/mock-api/server.mjs` (lines 110 to 114).
- **The build does not see it.** `npm run build` is `tsc -b && vite build` (`package.json`).
  `tsconfig.json` references `tsconfig.app.json`, whose `include` is `["src"]`, and
  `tsconfig.node.json`, whose `include` is `["vite.config.ts"]`. `vite build` bundles from the one
  entry in `index.html` line 11, `/src/main.tsx`, so a file no `src` module imports cannot be in
  the bundle. `vite.config.ts` imports only `./src/config/api`. After `npm run build`, a search of
  `dist/` for the fixtures' own strings (`Salim Al Riyami`, `u-nasser`, `mock API on`,
  `MOCK_API_PORT`, `evidence.fawtir.example`) matches no file.
- **No production configuration names it.** `vercel.json` rewrites `/api/:path*` to
  `https://api.fawtir.om/api/:path*` and everything else to `index.html`. `.github/workflows/ci.yml`
  runs `npm ci`, build, test and lint and never starts it. Its port is read from
  `MOCK_API_PORT` by the Node process itself, not by the app.
- **The app has no mock switch.** The only `import.meta.env` reads in `src/` are
  `VITE_API_BASE_URL` (`src/config/api.ts` line 44) and `VITE_REQUIRE_SESSION` and `DEV`
  (`src/lib/session/session.ts` lines 14 to 16). Neither selects a mock. The dependencies in
  `package.json` include no mocking library.
- **There is no fallback to a mock when the real API fails.** `src/api/client.ts` makes one
  `fetch` to `API_BASE_URL + path` (line 129). A failure status becomes an `ApiError` (line 59) and
  no answer becomes a `NetworkError` (lines 137 to 141). Both are thrown to the caller, and these
  screens render them as a refusal or a retry notice. Nothing substitutes data.

The mock is reached only when a developer points a dev or preview server's proxy at it with
`FAWTIR_API_ORIGIN` (`vite.config.ts` lines 30 to 32, `server.proxy` and `preview.proxy`). That
variable has no `VITE_` prefix, so it is never bundled, and the proxy does not exist in a deployed
build. Two things worth knowing, neither of which makes the mock part of the build:
`VITE_API_BASE_URL` is a general escape hatch that would send a bundle to whatever absolute URL it
names, and the header of `server.mjs` still says the proxy defaults to `http://localhost:8080`,
while the default target is now `https://api.fawtir.om` (`src/config/api.ts` line 32).

For Reject the fixtures gained `reject` in every `allowedActions` (allowed on the Participant ID
version under review) and the null `rejectedBy`, `rejectedAt` and `actors.rejectedBy`. The
lifecycle endpoints are still not mocked: a click on Reject there answers `404`.

## Deliberately not built

- **Deactivate, and Revoke of anything but a pending schedule.** Deactivate exists on the server
  and is not exposed. Revoke is exposed only as "Withdraw schedule", only where
  `allowedActions.withdraw` allows it (see "Withdrawing a scheduled version"). Reject was in this
  list until the contract delta of 3 October 2026 and is now built.
- **Authoring for the other seven types.** They are read-only lists of stored keys and values, with
  no editor of any kind, even where the server would allow an edit.
- **A history timeline.** The people trail shows the seven recorded steps of one version only.
- **Automatic activation**, from the onboarding card or anywhere else.
- **Paging, search or sorting** of versions.

## Next slice (needs authorisation)

- A browser pass against a real backend with two operators, to see the separation of duties and the
  refusal codes end to end. Reject and Withdraw schedule have had none.
- A native Arabic review of the copy, and Arabic and 390 px screenshots that include Reject and
  Withdraw schedule.
- A Figma frame, or the owner's sign-off on this layout.
- Adding the two routes to the responsive harness with a baseline.

## Participant ID re-verification

A company verified under an older taxpayer Participant ID policy version is no longer shown as
plainly "Verified". The backend computes a `ParticipantIdStanding` (`state` plus
`currentPolicySatisfied`, `reverificationRequired`, `reverificationAvailable`, `policyInForce`,
`verification`); the frontend renders it and re-derives no policy rule. Built and tested against
stubbed requests only.

### Screens

| Screen                                                        | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console › Verification › company › Peppol Participant ID card | Reads `verificationStanding` from the existing `.../data-submissions/current` answer. `REVERIFICATION_REQUIRED` and `NO_POLICY_IN_FORCE` replace the "Verified" status word with a qualified one and add a note; the stored verified ID still shows (LTR). When a verification exists and the state is not `VERIFIED`, lines show the previously verified ID (only when it is a different row from the one on screen), the policy version it was verified under, when, and the version in force. An open re-verification (`AWAITING_REVIEW` with a verification) and a rejection with an older verification get their own neutral note. Approve ID, Reject ID, reason codes, the policy-in-force check, `409` handling and the reference line are unchanged. No operator or user identity is shown. |
| Settings › Peppol and tax (`/settings/peppol`)                | One new section, "Participant ID verification", after the "Live on the network" card, in the page's own `rounded-md bg-surface-card` section pattern. It shows the state's sentence, a pill (none for `NOT_SUBMITTED`, `DRAFT`, `NO_POLICY_IN_FORCE`), the verified ID (LTR), its date, its policy version and the version in force, and "Request verification against the current policy" only when `reverificationAvailable` and a policy is in force. Every existing section, constant and style of the page is untouched; the rest of the page is still the static design mock.                                                                                                                                                                                                                 |

### Endpoints and request counts

| Call                                                                          | When                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/platform/peppol/smp/tenants/{tenantId}/data-submissions/current` | Unchanged. No extra console request: the standing arrives with it. A backend without the field leaves the card as before (`verificationStanding` is optional in the type).                                                                                                                                                                           |
| `GET /api/v1/peppol/smp/data-submissions/standing`                            | Once on mount of the settings section; once more only after a `409` `POLICY_CHANGED`, `SUBMISSION_IN_PROGRESS` or `REVERIFICATION_NOT_REQUIRED`; or after a `201` that lacks `verificationStanding` (defensive, contract says it is always there).                                                                                                   |
| `POST /api/v1/peppol/smp/data-submissions/reverification`                     | One per click. Body exactly `{"expectedPolicyVersionId": standing.policyInForce.id}`; headers `X-Correlation-Id` (a fresh `crypto.randomUUID()`) and the shared client's `X-CSRF-Token`. A ref guard plus the disabled button stop a double click or Enter. The `201` body's `verificationStanding` replaces the shown standing; nothing is re-read. |

The shared `apiRequest` client sends no correlation id and no module had one, so
`src/api/peppol/participantStanding.ts` mints it per request, the same way modules mint their
`Idempotency-Key`. Correlation ids from refusals are read from the problem body as everywhere else.

### Error mapping (company side, by status and `code` only)

| Answer                            | Shown                                                       | Re-read            |
| --------------------------------- | ----------------------------------------------------------- | ------------------ |
| `409 POLICY_CHANGED`              | policy changed while the page was open; check and ask again | once, never resent |
| `409 SUBMISSION_IN_PROGRESS`      | a request is already waiting                                | once               |
| `409 REVERIFICATION_NOT_REQUIRED` | no new verification needed                                  | once               |
| `400 PID_POLICY_NOT_ACTIVE`       | no policy in force, try later                               | no                 |
| `403` (not CSRF)                  | no permission to ask                                        | no                 |
| anything else                     | `describeApiFailure` (shared), with `apiErrors.reference`   | no                 |
| `401`                             | to Login, as `useApiRead` does                              | n/a                |

A known code on the wrong status (e.g. `400 POLICY_CHANGED`) is not treated as that refusal. The
problem `detail` is never read. A `403` on the standing read says the reader lacks access.

### Tests

- `src/pages/SettingsPage/participantStanding.test.tsx` (new, 18): VERIFIED; outdated policy with
  CTA; exactly one POST with exactly `{expectedPolicyVersionId}`, the correlation and CSRF headers,
  double click guarded; pending after `201` with no second GET; REJECTED with and without
  `reverificationAvailable`; NOT_SUBMITTED, DRAFT, NO_POLICY_IN_FORCE; `POLICY_CHANGED` reloads once
  and does not resend (its misleading `detail` is ignored); `SUBMISSION_IN_PROGRESS`;
  `REVERIFICATION_NOT_REQUIRED`; `PID_POLICY_NOT_ACTIVE`; `403`; server validation error; unknown
  `409`; known code on wrong status; `403` on the read; Arabic RTL with the ID in an LTR island.
- `src/pages/ConsolePage/verificationDecisions.test.tsx` (6 added under "verification standing"):
  qualified `REVERIFICATION_REQUIRED` and `NO_POLICY_IN_FORCE`; `VERIFIED` standing reads as before;
  open re-verification with previous context, approved with the unchanged body, then shown as
  verified under the current policy; `STALE_VERSION` on a re-verification keeps its reload;
  rejected request with an earlier verification. No existing assertion or fixture was changed.

### Limits

- Never run against a real backend or in a browser; no screenshots taken of the new section.
- No Figma frame exists for the new settings section; it reuses the page's section, row and pill
  geometry, the shared `Button`, and tone pairs already used by the activity screens.
- The mock API (`tools/mock-api`) does not serve the standing or re-verification routes.
- No confirmation dialog before the request: it changes nothing already verified and the server
  refuses duplicates.

## Scheduled versions and `forceState`

The backend added a `SCHEDULED` status: a version that went through the whole four-eyes chain and
was activated while its `effectiveFrom` was still ahead. Activating it does not supersede the
version in force, which stays `ACTIVE` and in force until the scheduled one's start. Statuses only
catch up at the next lifecycle write, so after that instant a `SCHEDULED` row can be the one in
force and an `ACTIVE` row can be no longer in force.

Every version view and every overview summary now carries the server-computed `forceState`
(`IN_FORCE`, `NOT_YET_EFFECTIVE`, `ENDED`, `REPLACED`, or `null` for a status that is not live).
The console reads in-force-ness from it alone; the browser clock no longer decides it anywhere.

| `forceState`                            | Work-queue label                         |
| --------------------------------------- | ---------------------------------------- |
| `IN_FORCE`                              | In force                                 |
| `NOT_YET_EFFECTIVE`, status `SCHEDULED` | Scheduled, takes effect on {date}        |
| `NOT_YET_EFFECTIVE`, other live status  | Activated, not yet in force              |
| `ENDED`                                 | Activated, effective period ended        |
| `REPLACED`                              | Replaced by a newer version              |
| `null` on a live status (not expected)  | Activated (never claimed to be in force) |

- `SCHEDULED` has its own status word and the `pending` pill tone (the one approved versions use).
  It is never green: the status lags, and in-force-ness is shown by the label beside it.
- The {date} is the stored `effectiveFrom`, printed only, never compared.
- The Activate dialog adds an "Effective from" line and the static sentence "If this date is still
  ahead, the policy in force now stays in force until then." The wording does not depend on the
  clock. The "replaces" sentence now reads "This version becomes the policy in force from its
  effective date and replaces the current one then."
- `allowedActions.activate` denied with `SCHEDULED_REPLACEMENT_PENDING`: no Activate button, the
  label "Approved, waiting for a scheduled replacement to take effect", and a note saying
  activation is not available while another replacement is scheduled.
- `409 SCHEDULED_REPLACEMENT_PENDING` from activate: its own localized message on the page with the
  reference, the list is read again, and the step is never resent (as every `409`).
- Withdrawing a scheduled version is now built; see "Withdrawing a scheduled version" below.
  Deactivate is still not exposed.
- The mock API fixtures carry `forceState`; the overview's `active` and `/current` pick the
  `IN_FORCE` version.
- Participant ID standing is unchanged in shape: before a scheduled version takes effect the
  company stays `VERIFIED`; from the instant it is in force, `REVERIFICATION_REQUIRED`. No standing
  UI change was needed. Built and tested against stubbed requests only, never a live backend.
- i18n added with `tools/i18n/merge.cjs`: `status.SCHEDULED`, `queue.scheduled`, `queue.replaced`,
  `queue.activated`, `queue.approvedScheduledPending`, `error.scheduledReplacementPending`,
  `action.scheduledPending`, `confirm.activate.scheduled`; `confirm.activate.replaces` reworded.
- Assertions changed: the lib test that fed a `now` into `queueLabel` and the page tests "ACTIVE:
  no step is offered" and "ACTIVE but starting later" relied on the browser clock; they now set
  `forceState` and assert the same labels, and new tests prove a fake clock does not change the
  label. Fixtures gained `forceState: null`, and every `ACTIVE` fixture `forceState: 'IN_FORCE'`.
  The two `ACTIVE`/`NOT_APPLICABLE` rows of the status table moved to a `forceState` table.

ARABIC_TRANSLATION_STATUS = PROVISIONAL_REQUIRES_NATIVE_REVIEW

## Withdrawing a scheduled version

**Contract (backend merged).** Every version view, the versions list and every lifecycle answer
carry a seventh `allowedActions` entry, `withdraw: { allowed, reason }`. It is the existing revoke,
offered only while a version is `SCHEDULED` with its effective date still ahead, and only to the
activation authority. Denied reasons: `INVALID_STATE` (not a pending schedule) and
`MISSING_PERMISSION`. The request is `POST .../{id}/revoke` with exactly
`{ expectedOptimisticLockVersion, reasonCode: "POLICY_SCHEDULE_WITHDRAWN" }`. Success is `200`
with the view at `status: "REVOKED"`, `forceState: null`, `endedBy` and `endedAt` set. The version
in force before the withdrawal stays in force.

**Button.** "Withdraw schedule", drawn only when `allowedActions.withdraw.allowed`, never from the
status or the effective date: a schedule that started is no longer withdrawable, and only the
server's clock can say so. It is the `secondary` variant and sits under Reject, where the
version's other ending decision is. No danger variant exists and none was added.

**Dialog.** Title "Withdraw this scheduled version?". It names the policy, the version number,
the current status (the "Scheduled" pill) and the "Effective from" date, printed only. It says
"This action records you as the operator who withdrew it." and "The policy in force now stays in
force, and this version will not take effect." The confirm button is "Withdraw schedule". It uses
the same `PolicyTransitionDialog` as every step: one request per confirmation (`inFlight` guard),
a `409` or `404` closes it, shows the message with its reference on the page, reads the list again
once and never resends, a `403` stays in the dialog with its reference and reads nothing, a `401`
leaves for Login.

**After success.** "Version {number} was withdrawn." as a status line, the answer replaces the
selected version and the list is read again, as for every step.

**Naming of the ended state: "Revoked".** The status pill (`danger` tone, unchanged), the
work-queue label and the people trail all say "Revoked" for a `REVOKED` version. The trail entry
built from `endedBy`/`endedAt` is named "Revoked" instead of "Ended" when the status is
`REVOKED` (new trail step `revoked`); every other ended version still reads "Ended". The action
and the success line say "withdraw" because that is what the operator does; the state keeps the
server's word because a `REVOKED` version is not necessarily a withdrawn schedule. The reason code
line (`POLICY_SCHEDULE_WITHDRAWN`) says which it was.

**Work queue.** Being allowed to withdraw does not put a version in "Needs my action", for the
same reason as Reject (`FORWARD_TRANSITIONS` is unchanged).

**i18n** via `tools/i18n/merge.cjs`, en and ar: `action.withdraw`, `confirm.withdraw.*` (five),
`done.withdraw`, `trail.revoked`. `status.REVOKED` and `queue.revoked` already existed.
ARABIC_TRANSLATION_STATUS = PROVISIONAL_REQUIRES_NATIVE_REVIEW.

**Mock API.** `actions()` gained `withdraw` denied with `INVALID_STATE`. No fixture offers it and
`/revoke` is not mocked (answers `404`, as every lifecycle endpoint there).

**Tests.** Lib: the reason-code map and the "sends %s as one POST" table gained `withdraw`
(sent to `/revoke`), plus a work-queue test and a trail-naming test. Page: a new "Withdrawing a
scheduled version" block (shown only when allowed, hidden for `MISSING_PERMISSION` and
`INVALID_STATE` and for a `SCHEDULED` version the server does not offer it on, dialog content,
exactly one `POST` with exactly the contract body on a double click, `REVOKED` state and trail
after success with the in-force version untouched, `409 STALE_VERSION` when the schedule took
effect meanwhile reloads once and never resends, `409 INVALID_STATE`, `403`, cancel, not in
"Needs my action"), and a right-to-left check of the Arabic dialog. A mutation check was run and
reverted: drawing the button from `status === 'SCHEDULED'` instead of `allowedActions.withdraw`
failed 4 of the withdraw tests.

**Existing assertions changed.** None removed or loosened. The exact-match reason-code map and
`TRAIL_STEPS` lists gained `withdraw` and `revoked`; `STEP_KEYS` in the page suite gained
`console.policies.action.withdraw`, so every existing "no lifecycle button" loop also asserts it
is absent. Fixtures `actions()` and `NO_PERMISSION` gained `withdraw`, forced by the type.

**Scheduled activation notice.** Activating an approved version with a future effective date
answers `SCHEDULED`, but the notice used to say "Version {number} is now the policy in force."
When the answer is `SCHEDULED`, the notice is now `done.activateScheduled` ("Version {number} is
scheduled. The policy in force now stays in force until it takes effect."). It is chosen from the
server's status, not from the date. One page test covers it.

**Live check.** Run against a disposable local backend built from the follow-up branch, not TEST.
A version was drafted, approved by a second operator, activated as `SCHEDULED`, then withdrawn
through the dialog. The server returned `REVOKED` with the withdrawing operator as `ended_by`, the
`ACTIVE` version stayed in force, and `SmpDataBlockerRevoked` was recorded with `actorId`.

**Visual check.** Real browser, desktop 1440 px and mobile 390 px, English and Arabic. Screens:
policy list, policy detail with a `SCHEDULED` version, the withdraw dialog, the console
Verification screen, and the company's Participant ID section in settings. There was no
horizontal overflow on any screen (`scrollWidth` equal to `clientWidth`, and no element outside the
viewport unless an ancestor clips it). In Arabic the page and the dialog are right to left and the
dialog buttons mirror. This is a layout check only: the Arabic wording is still provisional and
needs native review.

## Hardening pass

A gap audit of the whole feature (35 points: UX, mutations, accessibility, dates, compatibility)
found nothing blocking. Changed here:

- **Effective dates are shown in UTC, labelled.** A policy day starts at 00:00 UTC (operator
  guide), and the editor stores that instant. The detail page, the work-queue label and the
  confirmation dialog printed it in the browser's zone with no label: "05:00" in Karachi, "04:00"
  in Muscat, and the previous day west of UTC. They now use `formatUtcMoment`
  (`src/lib/console/format.ts`), for example "25 Oct 2026, 00:00 UTC". Times that record events
  (updated, trail) stay in the reader's zone. Nothing switches state on a local timer.
- **"Create draft" follows the server after every write.** `done()` and `reload()` re-read the
  overview as well as the versions, so `canCreateDraft` is never left as it was before the write.
- **Confirmation dialog focus.** Focus starts on Cancel (the choice that writes nothing) and goes
  back to the button that opened the dialog when that button still exists. The opener is read
  during the first render, and focus is restored only once the dialog has left the page, so React
  StrictMode's rehearsed unmount does not pull focus off Cancel. A StrictMode test covers it.
- **Mock API.** `GET /v1/peppol/smp/data-submissions/standing` is served (verified under the
  version in force). It is the only call the Peppol settings screen makes, so against the mock
  that screen renders instead of showing an error card.
- **Test stabilisation.** The `verificationDecisions` re-verification approval test looked up the
  status line once, while the card could still be showing its loading state for the second read.
  It failed in 2 of 4 parallel runs. The lookup now sits inside the retry. The assertion is
  unchanged.

**Left for follow-up, with reasons.** They live in shared primitives this PR does not modify, and
which about ten other screens use:

- The shared `Modal` has no focus trap: Tab can leave an open dialog.
- Escape inside an open `Select` or `DateField` also reaches the `Modal`'s document listener, so
  it closes the editor and loses what was typed.
- `Select`, `DateField` and `TextArea` do not link their error text to the control
  (`aria-describedby`), and `Select`/`DateField` do not set `aria-invalid`. `Input` does both.
- `DateField`'s "Today", "Clear", month and weekday names are English only.

Also deferred:

- After a write the page replaces its body with the loading state while it re-reads.
- An absent `forceState`, type or status from the server shows a raw i18n key. The contract
  marks all three as required.
- The operator panel's own-submission check (existing code) compares user ids in the browser.
  The server also refuses with `SELF_VERIFICATION_NOT_ALLOWED`, which this PR handles.

**Checked in a real browser** against the local backend, at 390, 768 and 1440 px, in English and
Arabic:

- Screens: list, scheduled detail, withdraw dialog, draft editor, and the Verification screen.
- No horizontal overflow and no clipped buttons on any of them.
- The keyboard alone reaches "Withdraw schedule", opens the dialog, closes it with Escape or
  Cancel, and lands back on the button. The focus ring is visible.

**Formatting.** This document was run through `npx prettier --write`. The only changes were padded
markdown tables, and the working copy is now LF (the index already stored LF); nothing else moved.
