# Outbound window refusal labels: handoff

## Purpose and scope

Backend PR #519 (merge `225a878b1829a0de492fbe59376b803ebd717c5e`, the controlled Peppol TEST
outbound single-invoice window) added refusal codes. This change gives each code a screen can
actually receive its own English and Arabic sentence, in the mapping structure that screen
already uses. Nothing else: no new screen, request, field, style or layout.

The two `OUTBOUND_WINDOW_*` codes are sent only while an operator has a window armed.
`TDD_CORRECTION_HELD` is not window-only: `TddCorrectionGuard` holds a RESUBMIT for any tenant,
window on or off, when the C5 that received the original SUBMIT differs from the configured one
(`C5_DIFFERS`) or cannot be read (`C5_UNREADABLE`); `WINDOW_BOUND` is the window case.

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
- Bridge: the upload key is dropped like any other final answer. No invoice is made, but the route
  still records the upload's extraction run and a FAILED record with reason
  `OUTBOUND_WINDOW_INVOICE_RESERVED`. After the window closes the number belongs to whichever
  invoice the ledger holds, so a later upload of it may be refused as `DUPLICATE_INVOICE`.
- ERP: the `retryable` flag shown on the detail page comes from the server (true here). Recovery
  is still offered only for `ATTEMPTS_EXHAUSTED`, so this code enables no action.
- TDD resubmit: before this, the 409 read as "someone changed this, reload", which is false.
- "Put it right" resubmits the record and every same-cause row in turn. A held row no longer stops
  the group: the rest are still sent. If none went, the held sentence shows; if some went, a
  partial sentence gives both counts (`tddResubmit.refused.partlyHeld`). Either way the page
  re-reads the record and the rejected rows, so it offers only what the server still offers. Any
  other failure still stops the group, and the page re-reads if something had already gone.
- Activity row: after a held answer the list is re-read once.

### Re-reads cannot loop

Every re-read is started from the press handler, inside the answer to that one POST, never from
an effect. A re-read only GETs, and its answer posts nothing and starts nothing.

- Activity row: one list GET per `TDD_CORRECTION_HELD` answer. No re-read on any other failure.
- "Put it right": one record GET and one rejected-list GET per send action that stays on the page,
  whatever the number of rows posted.

Tests pin both: one held press makes exactly one extra list GET, and a later render makes none.
The group send makes exactly one of each, and no more after the re-reads answer. A 500 makes none.

### Held corrections and the resubmit link

On backend `225a878b1` the Activity `links.resubmit` ignores a held correction, so after a hold
the action stays offered and pressing it is held again; the sentence says so. Backend PR #538
(open) adds an optional `tdd_leg.correction_held` and leaves `links.resubmit` null while a live
RESUBMIT hold exists. `TddLegDto` carries `correction_held?: boolean`; absent means not held, so
older backends behave exactly as before. `tddResubmitRefusalKey` stays for the race where a hold
appears between the read and the press.

When `tdd_leg.correction_held === true` (owner-authorised, 17 Oct 2026):

- the Activity row's verdict line, the reason text under the outcome chip, ends with "Correction
  held for an authorised decision." (AR "التصحيح معلّق بانتظار قرار من جهة مخوّلة في فوتر.");
- the record page's "how it is put right" line in the refusal box ends with the same sentence;
- `canResubmit` is false even if a link came with the flag, so no row menu, record link or
  "Put it right" send is offered.

No element, class, colour, token or spacing was added: the sentence goes into the existing
paragraphs. Nothing is inferred on the client; only the server's flag shows it.

### Documentation gap (backend)

`openapi.yaml` on `225a878b1` does not list `OUTBOUND_WINDOW_SEND_REFUSED` under the Send route's
409, although `InvoiceRestExceptionHandler` maps it to 409. The label follows the code.

## Files

- `src/lib/invoiceDispatch.ts`, `src/lib/erp/bridgeUpload.ts`, `src/api/erp/reporting.ts`,
  `src/lib/tddResubmit.ts`
- `src/pages/ActivityPage/ActivityPage.tsx`, `src/pages/ActivityPage/TddResubmitPage.tsx`,
  `src/pages/ActivityPage/ActivityEventPage.tsx`, `src/lib/activityLedger.ts`,
  `src/lib/activityDetail.ts`, `src/api/compliance/activity.ts`
- `src/i18n/locales/en.json`, `src/i18n/locales/ar.json` (added with `tools/i18n/merge.cjs`)
- Tests: `src/lib/invoiceDispatch.test.ts`, `src/lib/erp/bridgeUpload.test.ts`,
  `src/lib/tddResubmit.test.ts`, `src/pages/ActivityPage/activityLedger.test.tsx`; the existing
  "words every failure reason" test in `erpReporting.test.tsx` covers the new ERP reason.

## Requests, security, RBAC

No request was added or changed. After a held answer the screens re-read what they already read:
one list GET on Activity; one record GET and one rejected-list GET on "Put it right". No new storage, header, URL or log. No permission
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

## Follow-up (after #198)

- Fixed the partial-group resubmit (finding M1), and corrected the scope note above (L1), the
  Bridge comment (L2) and the Arabic held sentence (L3). `fail()` on Activity now takes a chosen
  key instead of being duplicated.
- New test: a two-row group where the first row is sent and the second held shows the partial
  sentence, attempts both rows and re-reads both lists.
- Owner decision, 17 Oct 2026: kept the Activity re-read, held responses only, with the loop
  guarantees above. Added the held sentence driven by `correction_held`, placed in the existing
  lines.

## Post-integration checklist

- [ ] With a window armed on TEST, a Send of the armed invoice that the gate refuses shows the
      window sentence.
- [ ] A Bridge upload carrying the reserved number and year shows the reserved sentence.
- [ ] A held TDD correction shows the held sentence on the Activity row and on "Put it right".
- [ ] A group with one held row says how many went and how many are held.
- [ ] With backend #538, the resubmit action is gone after a hold and the row and record say
      "Correction held for an authorised decision." (EN and AR).
