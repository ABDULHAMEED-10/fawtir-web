# ERP integration, Phase 1: Upload from your ERP (Extraction Bridge)

## Purpose and scope

ERP Phase 1 asked for connections, source channels, managed pull, Bridge upload, mapping profiles
and mapping readiness. An audit of `main` found all of those already built and wired to the real
backend except **Bridge upload**, which had no screen. This change adds that screen and nothing
else of substance:

- `/settings/erp/bridge`: upload one ERP document (JSON or XML) to be mapped into an invoice;
- a third card in the Settings › Integration group that opens it;
- an explanation, on the page, of the three ways documents arrive (managed pull, this upload,
  API push), with API push kept as information because it has no screen.

Not in scope: extraction runs, source documents, reconciliation, timeline, replay and conflict
evidence and validation findings (Phase 2), any backend change, deployment.

## What already existed (reused, not rebuilt)

| Area                                                                       | Where                                                                             | Backend                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| Connections list, create, detail, settings, credential, test               | `src/pages/ErpPage/ErpConnectionsPage.tsx`, `ErpConnectPage.tsx`, `connections/*` | `/v1/erp/connections`                            |
| Managed pull settings, status, sample, enablement                          | `connections/ConnectionExtractionPage.tsx`                                        | `/v1/erp/connections/{id}/extraction*`           |
| Mapping profiles, guided mapping, preview, certification, history, samples | `src/pages/ErpPage/Erp*Page.tsx`                                                  | `/v1/peppol/mapping-profiles*`                   |
| Runs, records, write-back, per-connection mapping tabs                     | `connections/*`                                                                   | none: they render `ConnectionFeatureUnavailable` |

## Backend contract used

`POST /api/v1/invoices/bridge` (backend `main`, `InvoiceSubmissionController.uploadThroughBridge`):

- permission `invoice.submit`; a signed-in person only (an API key is refused);
- header `Idempotency-Key` (required);
- body: the submission body with `source` required. JSON documents are sent as an object, XML as a
  string. No file part, filename or archive;
- `supplement.issue_time` (`HH:mm:ss`) and `supplement.transaction_type` (BTOM-001, `^[X1]{20}$`)
  are required; `source.external_document_id` ≤ 200, `source.external_version` ≤ 80;
- standard invoices only; one document per request; the gateway refuses a body over 4 MiB.

Answers: `202` accepted (`source.disposition = ACCEPTED`), `200` replay (`DUPLICATE`, nothing
submitted), `409` `SOURCE_IDENTITY_CONFLICT` / `SOURCE_DOCUMENT_IN_PROGRESS` /
`SOURCE_DOCUMENT_ALREADY_REFUSED` / `DUPLICATE_INVOICE` / `DUPLICATE_IDEMPOTENCY` /
`TENANT_NOT_OPERATIONAL`, `422` `VALIDATION_FAILED` (with `layer_results`) / `MAPPING_FAILED` /
`SUBMISSION_NOT_SUPPORTED` (an uncertified mapping answers with this code), `503`
`EMISSION_BLOCKED`, `413`, `415`.

Readiness: `GET /api/v1/peppol/mapping-profiles/{format}/certification?route=INVOICE&document_kind=STANDARD_INVOICE&transaction_type=…`
(`admin.settings.manage`), the existing `loadCertificationStatus`.

## Files

| File                                                                 | Change                                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/api/erp/bridge.ts`                                              | new: request and response types, `buildBridgeRequest` (the only request builder), `uploadThroughBridge`, `newBridgeUploadKey` |
| `src/lib/erp/bridgeUpload.ts`                                        | new: file reading per format, body-size check, `classifyBridgeFailure` (code-based), finding sanitisation                     |
| `src/pages/ErpPage/ErpBridgePage.tsx`                                | new screen                                                                                                                    |
| `src/hooks/useEntitlements.ts`                                       | new: the entitlement-snapshot loader `useErpAccess` already had, lifted out so the screen can ask for two other permissions   |
| `src/hooks/useErpAccess.ts`                                          | now uses `useEntitlements`; behaviour unchanged                                                                               |
| `src/lib/erp/mappingState.ts`                                        | gains `TRANSACTION_BITS`, `composeTransactionType`, `decomposeTransactionType`, moved from the Certification screen           |
| `src/pages/ErpPage/ErpCertificationPage.tsx`                         | imports the moved helpers; behaviour unchanged                                                                                |
| `src/App.tsx`, `src/pages/ErpPage/index.ts`, `src/lib/planAccess.ts` | route `/settings/erp/bridge`, plan feature `erpMapping`                                                                       |
| `src/pages/SettingsPage/SettingsPage.tsx`                            | the Integration hub card                                                                                                      |
| `src/i18n/locales/{en,ar}.json`                                      | `erp.bridge.*`, `settings.card.bridge*` (via `tools/i18n/merge.cjs`)                                                          |
| `tools/responsive/seed-routes.mjs`                                   | the new route                                                                                                                 |
| `docs/erp-and-console-plan.md`                                       | §7.10                                                                                                                         |
| tests                                                                | `src/pages/ErpPage/erpBridge.test.tsx`, `src/lib/erp/bridgeUpload.test.ts`                                                    |

## Behaviour and decisions (no Figma frame exists for any ERP screen)

- **No connection.** The page never asks for one and never calls the connection API.
- **Permissions.** The form is drawn only for `invoice.submit`; readiness is read only for
  `admin.settings.manage`, otherwise a sentence says the administrator manages the mapping. Both
  fail closed while the snapshot loads. The server remains the authority.
- **Readiness** is the server's certification status; its English `reason` is not shown.
- **One request per upload.** A ref guard plus the disabled button. The `Idempotency-Key` is minted
  on the first send and reused only for a retry of the same request after no answer (network,
  timeout) or `SOURCE_DOCUMENT_IN_PROGRESS`; any change to the file, format, identity, time or
  transaction type, and any final answer, starts a new key.
- **Results.** Accepted means the invoice exists and entered the pipeline, not that it was
  delivered; the receipt links to `/compliance/activity/{invoice_uuid}`. A replay says nothing new
  was submitted. `/invoices/:id` is not linked: it loads authored invoices, not submissions.
- **Refusals** are worded per code; nothing the server wrote is shown except the support reference.
  A validation refusal lists layer, rule and business term only (at most 50, then a count); the
  validator's message and XPath can quote the document and are never shown.
- **The file** is read in the browser only because the route takes the document in a JSON body. It
  is held in component state, never stored, logged or sent anywhere else. Type and size are
  checked client-side for usability; the server decides.
- **Transaction type and issue time** use the Certification screen's controls and strings: no
  mapping produces them. The issue-time control is the same native `type="time"` input that screen
  uses.

## Security review

Server-derived tenant (no tenant field anywhere); request built from a whitelist; no secret
handled; no raw backend text, exception, SQL or stack rendered; hostile filenames and identifiers
rendered as text (tested); no `dangerouslySetInnerHTML`; CSRF and cookies through the shared
client; no persistence of the document in storage or the URL.

## Backend gaps (not blocking)

| Feature                                         | Missing contract                                                        | Frontend impact                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| API push management                             | no screen or listing contract for ERP_INGESTION keys in this repository | explained in one sentence, no screen                    |
| Uncertified-mapping refusal                     | answers the shared `SUBMISSION_NOT_SUPPORTED`, no code of its own       | the message names the likely cause without asserting it |
| Bridge for credit and debit notes, self-billing | the route accepts standard invoices only                                | invoices only                                           |
| Per-connection runs, records, write-back        | none                                                                    | existing tabs say "not available" (unchanged)           |

## Limitations

- The Arabic copy is a working translation and needs native review.
- The mock API has no ERP routes, so the screen renders its permission notice there unless the
  session holds `invoice.submit`; verification used a temporary, uncommitted fixture.

## Next

ERP frontend Phase 2 (runs, source documents, reconciliation, timeline, replay and conflict
evidence, validation findings) against the merged Phase 3B backend reporting APIs.
