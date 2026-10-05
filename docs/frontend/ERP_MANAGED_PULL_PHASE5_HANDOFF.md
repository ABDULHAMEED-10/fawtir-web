# ERP integration, Phase 5: Managed Pull frontend completion

## Scope

This phase exposes what backend Phase 1 shipped: the per-connection **issue time pointer**
(`documentIssueTimePointer`, IBT-168). A tenant can now finish configuring Managed Pull, and repair a
connection saved before the field existed, without engineering help. The plan is
`docs/erp/FAWTIR_ERP_BRIDGE_AUTHORITATIVE_IMPLEMENTATION_PLAN.md` v1.3 in the backend repository,
Phase 5.

In scope:

- **Issue time pointer field** on the Extraction tab: loaded, edited, saved, and shown as a fact to
  readers.
- **Legacy remediation**:
  - a notice with a "Set the issue time pointer" action that moves focus to the field;
  - a reader-only variant that says who to ask;
  - a status explanation that says collection is paused, not failed;
  - an extra enablement prerequisite.
- **Server refusal** `EXTRACTION_ISSUE_TIME_POINTER_REQUIRED`: shown in the banner and beside the
  field.
- **Mode gate**:
  - the Extraction tab appears only for `MANAGED_PULL` connections;
  - the extraction address of any other mode explains that there is nothing to configure and
    requests nothing.
- **Read sequencing**: access first, then the connection, then extraction reads only for Managed
  Pull.
- **Enable is fail-closed** until both the settings and the status reads have answered.
- **Stale copy replaced**:
  - the "not switched on yet" placeholder;
  - the READY hint "Nothing is collected yet".
- **Credential inputs**:
  - the secret field has `autocomplete="new-password"`;
  - its label field has `autocomplete="off"`, so the browser cannot fill either with a saved
    Fawtir login.
- **English and Arabic** for every new string.

Out of scope, owned by Phase 9:

- the unified ERP / Bridge administration shell and overview;
- API Push UI;
- the `TextField` `aria-describedby` link for hints and errors. This is a shared component and the
  gap is pre-existing.

## Contract (backend `main` f0d2d543)

**Read:** `GET /api/v1/erp/connections/{id}/extraction` returns `documentIssueTimePointer:
string | null`. Null means a connection saved before the field existed.

**Write:** `PUT /api/v1/erp/connections/{id}/extraction` accepts `documentIssueTimePointer` as an
optional field.

- Omitted keeps the stored value.
- An empty string clears it. This was verified live: `""` answered `documentIssueTimePointer: null`.
- It is never defaulted.
- The screen always sends the trimmed field. An emptied field therefore clears the pointer, rather
  than the stale value surviving behind an empty input.

**Errors:**

- Enabling without a pointer is refused with `400 EXTRACTION_ISSUE_TIME_POINTER_REQUIRED`, both on
  the settings PUT with `enabled: true` and on `/extraction/enablement`.
- A malformed pointer is refused with `400 EXTRACTION_SOURCE_SETTINGS_INVALID` (existing mapping).

**Status:** an enabled block without a pointer reports `NOT_CONFIGURED` with no reason field. The
screen tells it apart from "no settings at all" using the settings it already holds
(`configured && documentIssueTimePointer === null`). It does not recompute the status code.

**Issue time rules:** the accepted forms are `HH:mm:ss`, read as Oman local time, and an ISO-8601
date-time with an offset. These rules, and the date agreement with IBT-002, are **FAWTIR product
policy (DEC-I)**, not an OTA or PINT-OM requirement. The UI hint names the accepted forms and makes
no compliance claim.

## Decisions

- **Terminology.** The field is "Issue time pointer", matching the existing "Document id pointer"
  and "RFC 6901 JSON Pointer" wording. User-facing copy says "production collection", the screen's
  existing phrase, rather than "Managed Pull".
- **Field-level refusal.** The refusal is shown in two places. The banner sits above the form, so
  the field may be off screen when Enable is pressed.
- **Extraction tab only for `MANAGED_PULL`.** For `BRIDGE_UPLOAD` and `API_PUSH` the server refuses
  every extraction read with `EXTRACTION_CONNECTION_MODE_UNSUPPORTED`. Those connections also need
  no fake configuration.
- **Shared `TextField` gained one optional `autoComplete` prop.** When it is omitted, nothing changes
  for any existing field.

## Tests

- **Focused:** `src/pages/ErpPage/connections/erpExtraction.test.tsx`, 59 tests, 13 of them new.
  - Issue time: load, trimmed save, empty clears, legacy notice and blocked enable, keyboard focus
    action, reader variant, generic NOT_CONFIGURED kept, refusal in banner and at the field, Arabic.
  - Mode gate: two tests.
  - Read sequencing: two tests.
  - Six existing tests now wait for the server's answer before acting, because extraction reads
    correctly start later. No assertion was weakened.
- **`erpConnections.test.tsx`:**
  - write-back copy;
  - Extraction tab gated by mode;
  - READY hint;
  - credential `autocomplete`.
- **Affected:** `src/pages/ErpPage` and `src/lib/erp`, 9 files, 257/257 pass.
- **Build:** `npm run build` (the type-check) passes.
- **Lint:** clean on every changed file. Repository-wide it reports 29 errors and 3 warnings. These
  are pre-existing and all in files this phase does not touch, the same count as the earlier
  preflight.
- **Full suite:** not run. Only additive props on a shared component changed.

## Real browser and local E2E

### Environment

- **Real Chrome** (headless), driven over the DevTools protocol.
- **This branch's Vite dev server**, proxying to an isolated local stack built from backend `main`
  f0d2d543: real gateway, core, PostgreSQL, Redis, Kafka and MinIO, with Mailpit for the code.
- **Real sign-in:** the code was read from Mailpit and never printed.
- **Tenant activated through the real path:** evidence upload, then manual attestation.
- **Mapping:** certified for both the full-tax and the simplified transaction types.
- **Zero outbound:**
  - core, the database and the fixture ERP sit on an internal-only network;
  - external DNS and direct-IP egress were both refused;
  - only the gateway and Mailpit had a second, loopback-published network for the browser;
  - every outbound gate was off, and the AS4 port was the stub transport;
  - SMP, TDD and reporting sends were all zero.

### Legacy remediation (a connection stored enabled without a pointer)

- The notice, the "paused, nothing has failed" status help and "Not configured" all render. The
  connection is never called failed.
- **The field:**
  - it is present, empty, and its label is associated;
  - the prerequisite reads Outstanding;
  - Enable is blocked once collection is off.
- **Keyboard:** Enter on the notice action moves focus into the field. Focus is shown by the shared
  field style (`focus:border-primary-700`).
- **Save and enable:**
  - saving `/issued_at` with whitespace is trimmed and saved, and the notice clears;
  - after a reload the value persists and Enable is available;
  - enabling works, every prerequisite shows Done, and the status reads "Ready, waiting".
- **Next run** shows the real deferred time (finding D4).

### New connection, configured entirely in this UI

- All extraction settings were entered in the browser, including the issue time pointer for the
  simplified (B2C) transaction type, then saved and enabled.
- **Collected:** the scheduler pulled the fixture document. **ERP-B2C-1 appears in ERP activity as
  accepted.**
- **Later quiet cycles** read "completed" with one duplicate. That is the D3 repair, seen in the UI.

### Other checks

- **Mode gate:**
  - an API Push connection has no Extraction tab;
  - its extraction address shows "Nothing to collect here";
  - it sends only the connection read, never an extraction request.
- **Arabic:** `dir="rtl"`, with the new label and help in Arabic.
- **Pre-existing:** pointer values such as `/id` display as `id/` in every RTL pointer input,
  because the shared input has no `dir="ltr"` (Phase 9).
- **Widths:** 1440, 1024, 768, 390 and 360. No horizontal overflow on any checked screen. The
  Arabic screen was checked at 1440 and 390.
- **Console:** 0 errors and 0 exceptions on the Phase 5 screens.
- **Requests:**
  - a page load makes one read each of entitlements, connection, extraction settings and status;
  - each write is one PUT followed by the three refresh reads;
  - no bursts.
- **Pre-existing rate limit:** the gateway's 10/min `erp-connection` limit (plan P1-2) is reachable
  in ordinary use. The run paced its actions to stay under it.

## Known backend finding (not fixed here)

**D4: enabling does not reschedule a deferred channel.**

- **Behaviour:** the scheduler defers an ineligible channel by `ineligible-deferral` (6 h). A legacy
  connection without a pointer is ineligible.
- **Effect:** after a customer repairs it and enables it in this UI, collection resumes only when
  that deferral expires, up to 6 hours later. The status panel shows the real next run time, so
  nothing is hidden.
- **Cause:** neither `ExtractionConfigurationService.update` nor `setEnabled` touches the schedule
  row.
- **Fix:** this is a backend follow-up, and it matters for the deployment plan for existing legacy
  connections.

## Integration notes

- **Conflict-sensitive areas:**
  - `src/i18n/locales/{en,ar}.json`: another open branch, `feat/invoice-browser-send`, also edits
    them in different keys. Re-run `node tools/i18n/merge.cjs` on conflict rather than hand-merging.
  - `components/form/FormFields.tsx`: additive only.
- **Prerequisites:**
  - backend `main` at or after f0d2d543;
  - no migration;
  - no configuration change.
- **Deployment:** not authorized by this phase. The backend makes existing pointer-less Managed Pull
  connections stop until a pointer is set, and this UI is the customer's way to set it. Plan
  deployment and notices together, with D4 in mind.
