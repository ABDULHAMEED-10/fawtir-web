# Outbound window refusal labels: handoff

## Purpose and scope

Backend PR #519 (merge `225a878b1829a0de492fbe59376b803ebd717c5e`, the controlled Peppol TEST
outbound single-invoice window) added refusal codes. This change gives each code a screen can
actually receive its own English and Arabic sentence, in the mapping structure that screen
already uses. Nothing else: no new screen, request, field, style or layout.

Without the window switched on the backend never sends these codes, so behaviour is unchanged
everywhere until an operator arms a window.

- Base: `origin/dev` at `7a7757e` (the repo works on `dev`; `main` is an ancestor of it).
- Backend contract read from `origin/main` `225a878b1` of the backend repository.

## Codes, where they come from, where they now show

| Code | Backend source | Route | Screen | Mapping |
|---|---|---|---|---|
| `OUTBOUND_WINDOW_SEND_REFUSED` (409, `code`) | `AuthoredInvoiceSendPreflightAdapter` via `InvoiceRestExceptionHandler` | `POST /v1/authored-invoices/{id}/send` | Invoice detail, Send dialog (`SendInvoiceModal`) | `SEND_REFUSALS` in `src/lib/invoiceDispatch.ts` |
| `OUTBOUND_WINDOW_INVOICE_RESERVED` (409, `code`/`error`, `retryable: true`) | `PeppolSubmissionExceptionHandler` | `POST /v1/invoices/bridge` | Settings, ERP, Extraction Bridge (`ErpBridgePage`) | `classifyBridgeFailure` in `src/lib/erp/bridgeUpload.ts`, kind `numberReserved` |
| `OUTBOUND_WINDOW_INVOICE_RESERVED` (`reason_code`) | `ExtractionFailureReason` (retryable, class PLATFORM, stage SUBMISSION) | `GET /v1/erp/source-documents...`, extraction status | ERP documents list filter, document detail, attention list, connection extraction status | `FAILURE_REASONS` in `src/api/erp/reporting.ts` and `erp.reporting.reason.*` |
| `TDD_CORRECTION_HELD` (409, `code`; `held_correction_id`, `held_reason`) | `TddCorrectionHeldException` | `POST /v1/invoices/{id}/tdd/resubmit`, `POST /v1/inbound-invoices/{id}/tdd/resubmit` | Compliance, Activity: row menu "Send the report again" and the "Put it right" page | `tddResubmitRefusalKey` in `src/lib/tddResubmit.ts` |

`held_reason` (`C5_DIFFERS`, `C5_UNREADABLE`, `WINDOW_BOUND`) is not shown: the tenant cannot act
on the difference, and every value means the same thing to them (held, nothing raised).
`held_correction_id` is not shown either; the support reference already on failures is enough.

### Not applicable

- Batch row `rejection_code` `OUTBOUND_WINDOW_INVOICE_RESERVED`: no screen reads
  `/v1/invoices/batches`. (`/v1/invoices/import` is the draft import, a different route.)
- The same code on `POST /v1/invoices`, `/v1/creditnotes`, `/v1/debitnotes`, `/v1/selfbilling`:
  API-key routes; the browser never calls them.
- Operator `OutboundWindowRefusal` values (`OBLIGATION_NOT_SENDABLE`, `CORRECTION_*`, the window
  and budget refusals): only on `/v1/platform/peppol/as4/outbound-window/**`, which no console
  screen calls.

## Behaviour decisions

- Codes are matched on `code` (with `error` as the fallback `ApiError` already reads), never on
  the English `detail`.
- Send: the dialog stays open with the sentence, as for the other Send refusals. The Idempotency
  Key is kept, which is harmless: the refusal happens before the claim and creates nothing.
- Bridge: the upload key is dropped like any other final answer; the server did not spend it, so a
  later upload under a new key is correct.
- ERP: the `retryable` flag shown on the detail page comes from the server (true here). Recovery
  is still offered only for `ATTEMPTS_EXHAUSTED`, so this code enables no action.
- TDD resubmit: before this, the 409 read as "someone changed this, reload", which is false.

### Known limitation (backend)

The Activity `links.resubmit` is computed from the TDD leg alone and does not account for a held
correction, so after a hold the resubmit action stays offered and pressing it is held again. The
sentence says so ("resubmitting again will not send it"). Removing the action needs the backend to
expose the hold on the activity row; no frontend state was invented for it.

### Documentation gap (backend)

`openapi.yaml` on `225a878b1` does not list `OUTBOUND_WINDOW_SEND_REFUSED` under the Send route's
409, although `InvoiceRestExceptionHandler` maps it to 409. The label follows the code.

## Files

- `src/lib/invoiceDispatch.ts`, `src/lib/erp/bridgeUpload.ts`, `src/api/erp/reporting.ts`,
  `src/lib/tddResubmit.ts`
- `src/pages/ActivityPage/ActivityPage.tsx`, `src/pages/ActivityPage/TddResubmitPage.tsx`
- `src/i18n/locales/en.json`, `src/i18n/locales/ar.json` (added with `tools/i18n/merge.cjs`)
- Tests: `src/lib/invoiceDispatch.test.ts`, `src/lib/erp/bridgeUpload.test.ts`,
  `src/lib/tddResubmit.test.ts`, `src/pages/ActivityPage/activityLedger.test.tsx`; the existing
  "words every failure reason" test in `erpReporting.test.tsx` covers the new ERP reason.

## Requests, security, RBAC

No request was added, removed or changed. No new storage, header, URL or log. No permission
change. Nothing from the server's `detail` reaches the screen.

## Verification

- Focused tests, typecheck and build pass; lint is clean on the changed files.
- Browser: built app served by `vite preview` against the repo's mock API, behind a local-only
  stand-in that answers the Send and Bridge writes with the PR #519 problem bodies. Send
  (English, then Arabic at 390 px) and Bridge (Arabic) show the new sentences inside the existing
  notices, one request each. The TDD resubmit could not be driven in the browser: the mock has no
  report-only refusal row, so the plain resend is never offered; the page tests cover it. The ERP
  reasons were not driven in the browser (no ERP reporting mock).
- Not verified against a backend with the window switched on (not authorised).

## Post-integration checklist

- [ ] With a window armed on TEST, a Send of the armed invoice that the gate refuses shows the
      window sentence.
- [ ] A Bridge upload carrying the reserved number and year shows the reserved sentence.
- [ ] A held TDD correction shows the held sentence on the Activity row and on "Put it right".
