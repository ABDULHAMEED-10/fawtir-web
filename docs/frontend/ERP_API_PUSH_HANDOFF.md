# ERP Phase 8: API push key management

## Purpose and scope

The backend (Phase 7, backend `main` `dffc1855`, PR #449) completed the lifecycle of ERP ingestion
API keys: bounded rotation grace, explicit rotation completion, last-used, profile and status in the
list, and a fixed expiry policy for ERP keys. Before this change API push had no screen: the Bridge
page described it in one sentence. This change adds:

- `/settings/erp/api-push`: create, list, rotate, complete rotation and revoke ERP ingestion keys,
  the copy-once secret, the integration guide and the mapping readiness;
- a card for it in the Settings › Integration group, after Upload from your ERP;
- a link to it from the Bridge page's "How documents reach Fawtir" card, whose API push line no
  longer says it has no screen.

Not in scope: GENERAL API keys (a different product, not shown or managed here), the Phase 9
Integration restructure, any backend change, deployment.

## Backend contract used

`ApiKeyController`, every route `admin.settings.manage`:

| Call | Notes |
| --- | --- |
| `GET /api/v1/apikeys` | metadata only: `maskedKey`, `clientName`, `profile`, `status` (`ACTIVE`, `ROTATION_GRACE`, `ROTATED`, `REVOKED`, `EXPIRED`), `createdAt`, `expiresAt`, `lastUsedAt` (eventually consistent, about a minute), `supersededByKeyId`, `rotationGraceEndsAt`, `rotationCompletedAt`, `revokedAt` |
| `POST /api/v1/apikeys` | `Idempotency-Key` required; body `label`, `scopes`, `profile: ERP_INGESTION`, optional `expiresAt` (default 365 days, at most 730; no permanent ERP key). The response carries `key` once |
| `POST /api/v1/apikeys/{id}/rotate` | `Idempotency-Key` required; response carries the new `key` once, `replacesKeyId`, `previousKeyGraceEndsAt` |
| `POST /api/v1/apikeys/{oldId}/rotation/complete` | ends the old key's grace now; idempotent |
| `DELETE /api/v1/apikeys/{id}` | immediate and final |

Refusals, branched on the problem `type`, never the message: `403 erp-entitlement-required` (ERP not
enabled), `409 plan-limit-reached` (plan without API access), other `403` (permission), other `409`
(already rotated or revoked), `404`, `400` (expiry). Anything else uses the shared failure text with
the support reference.

Readiness: the Bridge page's existing `ReadinessCard` (now exported), the server's certification
status for JSON standard invoices.

## Decisions

- **The raw key exists only while its dialog is open.** It comes from the create or rotate response,
  lives in component state, and is dropped when the dialog closes. Nothing is written to
  localStorage, sessionStorage, IndexedDB, the URL or router state; there is no "show again".
- **Status is the server's.** The pill is `status`; nothing is derived from timestamps.
- **Last used never claims precision it does not have:** "Not used yet", "Recently used" (under five
  minutes), "About 3 hours ago", with a note that the value updates about once a minute.
- **No "never expires" for ERP keys.** The expiry picker offers tomorrow to day 730 (UTC days, sent as
  the day's UTC start); empty means the server's 365-day default.
- **Entitlement and plan are not guessed in advance.** No pre-flight request; the server decides on
  create and rotate and the page renders its refusal.
- **Actions per status:** ACTIVE: rotate, revoke. ROTATION_GRACE: complete rotation, revoke.
  EXPIRED: rotate. ROTATED and REVOKED: none. Each needs confirmation; the list is read again from the
  server after every action, success or failure.
- **The integration guide** shows this deployment's own address, the two headers, a 16+ character
  Idempotency-Key example, the source block and the supplement, with placeholders only.
- **Activity** links to `/settings/erp/documents?channel=API_PUSH`, the existing report's own filter.
- Built from the Integration templates only (`SettingsShell`, `SectionCard`, the table idiom,
  `RowsView`, `ActionMenu`, `Modal`, `ConfirmModal`, `DateField`, `Checkbox`). No new colour, token,
  component or asset.

## Files

| File | Change |
| --- | --- |
| `src/api/settings/apiKeys.ts` | new: types, `buildErpKeyRequest` (the only request builder), list, create, rotate, complete, revoke |
| `src/lib/erp/apiPush.ts` | new: `classifyApiKeyFailure` (code-based), `lastUsedPhrase`, `expiryBounds`, ERP-only filter |
| `src/pages/ErpPage/ErpApiPushPage.tsx` | new screen |
| `src/pages/ErpPage/ErpBridgePage.tsx` | `ReadinessCard` exported; API push line links to the new screen |
| `src/App.tsx`, `src/pages/ErpPage/index.ts`, `src/lib/planAccess.ts` | route `/settings/erp/api-push`, plan feature `erpMapping` |
| `src/pages/SettingsPage/SettingsPage.tsx` | Integration card `apiPush` |
| `src/i18n/locales/en.json`, `ar.json` | 87 keys, English and Arabic |
| `tools/responsive/seed-routes.mjs` | the new route |
| `src/pages/ErpPage/erpApiPush.test.tsx`, `src/lib/erp/apiPush.test.ts` | new tests |
| `src/pages/ErpPage/reporting/erpReporting.test.tsx` | one test: 503 `ERP_REPORT_TIMEOUT` (Phase 4 follow-up) |

## Phase 4 follow-up: 503 `ERP_REPORT_TIMEOUT` (RESOLVED)

**Status: RESOLVED** (closed in Phase 9, 7 Oct 2026; nothing further to do).
Verified: the reporting pages render it through the shared failure text ("Fawtir is temporarily
unavailable. Please try again shortly."), with the support reference and Try again, and never the
server's text. No UI change was needed; a test now holds it.

## Verification

- **Focused:** 20/20 (`erpApiPush.test.tsx` 16, `apiPush.test.ts` 4), covering the security items: secret shown on create only, gone after close, never in storage or the URL, list metadata only, rotation secret once, revoke and completion confirmations, ERP-entitlement and plan refusals in our words, eventually consistent last-used wording, expired and revoked rows.
- **Affected:** `src/pages/ErpPage`, `src/pages/SettingsPage`, `src/lib/erp`, plan access and i18n: 332 tests in 18 files, all pass. `companyProfileIdentity.test.tsx` (untouched) timed out twice while the browser run shared the machine, and passed 8/8 alone, as the handbook notes for big suites under load.
- **Build** (the type-check) passes. **Lint** on every touched file is clean; the repository total is the same 32 pre-existing problems as on `main`, none in these files.
- **Real backend, real browser:** Chrome (Playwright) against backend `main` `dffc1855` on an isolated local stack. The gateway and Mailpit are published on loopback only; the dev proxy was proven to reach that gateway, not a deployed one. 38/38 checks:
  - sign-in with an email code;
  - the Settings card, empty list and readiness;
  - create through the UI, copy, and the secret gone from the page, storage and URL after close;
  - a real push with the new key (202), seen under API push activity;
  - last used "Recently used" after the server's flush;
  - rotate through the UI: new key works, old key works in its grace;
  - complete rotation: old key 401, new key still 202;
  - revoke: 401 at once;
  - no horizontal overflow at 1440, 1024, 768, 390 and 360, with the create dialog open too;
  - Arabic right to left, with the masked key left to right;
  - dialog focus and focus return;
  - no raw key in any audit row.
- **Transmission:** the stack runs the stub AS4 transport ("outbound sends do NOT hit the wire") on a network with no route out. Nothing left the machine.
