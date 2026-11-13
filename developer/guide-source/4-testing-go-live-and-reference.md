---
title: "FAWTIR ERP Developer Guide: testing, go-live and reference"
description: "The TEST checklist, production go-live, support and versioning, official references, FAQ and glossary."
sidebar_label: "Testing, go-live and reference"
sidebar_position: 4
---

# FAWTIR ERP Developer Guide: testing, go-live and reference

## ERP integration test checklist

Use this checklist to prove, on the FAWTIR TEST environment, that your ERP integration handles the normal cases, the refusals and the recovery cases correctly. Each scenario gives the purpose, the input, the expected response, the status change to expect and the pass criteria.

> **Warning:** Passing this checklist is **not** Peppol certification and **not** approval by the Oman Tax Authority (OTA). It shows that your integration behaves correctly against FAWTIR. Peppol certification and service-provider accreditation concern FAWTIR as your service provider, not your ERP integration.

All company names, VAT numbers, invoice numbers and keys on this page are fictitious.

### Before you send anything from TEST

> **Warning:** A document accepted on TEST may be transmitted over Peppol to the buyer's access point. Ask FAWTIR before you send any document addressed to a real company.

What is known about TEST:

- Document submission is switched on by FAWTIR for the whole deployment, not per organisation. Where it is off, the submission routes and the invoice status reads answer `404`. Where it is on but your company is not yet ready to issue (for example, its details are not verified), submissions are refused with `409`, `error: TENANT_NOT_OPERATIONAL`.
- When a TEST deployment has no Peppol transport configured, submissions are refused with `503` and the code `OUTBOUND_TRANSPORT_UNAVAILABLE`. When it does have transport, an accepted invoice is queued for AS4 delivery to the receiver's access point. The receiver is taken from the buyer's endpoint, `0248:` plus the buyer's VAT number. A real VAT number as the buyer can therefore address a real company.
- For every accepted invoice, FAWTIR also queues a Tax Data Document (TDD) for the Tax Authority's corner (C5). That message also travels over Peppol.
- FAWTIR can reserve invoice numbers for controlled test windows. A submission that uses a reserved number is refused with `409 OUTBOUND_WINDOW_INVOICE_RESERVED` (retryable later).

Ask FAWTIR which Peppol network the TEST environment is connected to, whether outbound sending is switched on there, and which buyer participant identifiers you may use for TEST invoices.

**Recommendation:** use only the buyer identifiers FAWTIR gives you for testing, and agree a test plan with FAWTIR before your first send.

#### Setup

| Item | What you need | See |
|---|---|---|
| Base URL | `{BASE_URL}` for TEST | [Environments](1-getting-started.md#environments) |
| Push credential | An `ERP_INGESTION` API key (`X-API-Key: fawt_sk_<your-key>`) holding the submit scopes you will test | [Authentication](1-getting-started.md#authentication) |
| Read credential | A Bearer token: a signed-in user, or an OAuth client holding `invoice.read`. API keys cannot read anything. | [Authentication](1-getting-started.md#authentication) |
| Mapping | An active mapping, certified for each document kind, route and transaction type you test | [Data mapping](2-api-reference-and-data-mapping.md#data-mapping) |
| ERP integration | Switched on for your company by FAWTIR (otherwise `403 erp-entitlement-required`) | [Introduction](1-getting-started.md#introduction) |

The platform allows either read credential. Confirm with FAWTIR during onboarding which one to use for your integration.

> **Note:** Certification is per format, document kind, route and transaction type. A Simplified invoice, a credit note and a debit note each need their own certification. Without it, the submission is refused with `422` and `error: SUBMISSION_NOT_SUPPORTED`.

#### Baseline request

Every scenario starts from this request: the standard invoice from the shared example data (supplier Al Waha Trading LLC, `OM1999000101`; buyer Sahil Engineering SAOC, `OM1999000202`; invoice `INV-2026-000145`). The `document` member is your ERP's own export. The full example document is on the [Quick start](1-getting-started.md#quick-start) and [Data mapping](2-api-reference-and-data-mapping.md#data-mapping) pages, so only the envelope is shown here.

```http
POST {BASE_URL}/api/v1/invoices
X-API-Key: fawt_sk_<your-key>
Idempotency-Key: waha-inv-000145-v1-7f3c9a2e
Content-Type: application/json
```

Envelope members (the `document` content is not shown):

| Member | Baseline value |
|---|---|
| `format` | `"JSON"` |
| `document` | your ERP's invoice JSON for `INV-2026-000145`, dated `2026-11-10` |
| `document_kind` | omitted (defaults to `STANDARD_INVOICE`) |
| `supplement.issue_time` | `"10:15:00"` |
| `supplement.transaction_type` | `"1XXXXXXXXXXXXXXXXXXX"` (position 1, Full Tax Invoice) |
| `source.external_document_id` | `"ERP-INV-000145"` |
| `source.external_version` | `"1"` |

> **Note:** Send `X` and `1` in `transaction_type`, not `0` and `1`. FAWTIR writes `X` as `0` in the Peppol document. A `0` in the request is refused with `400 validation-failed`.

Unless a scenario says otherwise, use a **new** `Idempotency-Key`, a new invoice number and a new `source.external_document_id` for each scenario. A scenario that reused `ERP-INV-000145` version `1` with different content would get `409 SOURCE_IDENTITY_CONFLICT` instead of the response it tests. Reusing a key that already succeeded, with a different body, is refused with `409 DUPLICATE_IDEMPOTENCY`.

#### Status terms used below

| Field | Values you will see |
|---|---|
| Delivery `state` | `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `DELIVERED_UNCONFIRMED`, `UNDELIVERABLE`, `C4_UNREACHABLE` |
| TDD leg `status` | `PENDING`, `SUBMITTED`, `GENERATION_FAILED`, `ACCEPTED`, `DELIVERED_UNCONFIRMED`, `REJECTED`, `TO_DISREGARD`, `DISREGARD_SUBMITTED`, `DEAD_LETTERED`, `NOT_TESTED` |

A refused request is not a state. It creates no invoice and uses no allowance. Because every scenario sends a `source` block, FAWTIR records the refusal against that source identity: send a corrected document under a new `external_version`. The meaning of each state is on the [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle) page.

### Accepted documents

#### 1. Valid standard tax invoice

- **Purpose:** prove the happy path end to end.
- **Input:** the baseline request.
- **Expected response:** `202 Accepted` with a `Location` header. Body: `state: "QUEUED"`, `peppol_send.status: "queued"`, `tdd.status: "queued"`, a `tdd.sla_deadline`, `source.disposition: "ACCEPTED"`, and an `id` starting `invc_`. Keep `id` and `invoice_uuid`.
- **Expected status transition:** `QUEUED` → `SENDING` → `SENT` → `DELIVERED` (recipient answered AP) or `DELIVERED_UNCONFIRMED` (AB). TDD leg `PENDING` → `SUBMITTED` → `ACCEPTED`.
- **Pass criteria:** your ERP stores `id`, `invoice_uuid` and the `Location`, and shows the invoice as "submitted", not "delivered". It updates the status only from polling (scenario 20).

> **Note:** `peppol_send.status` and `tdd.status` in the 202 body are fixed receipt values. The live status is at `links.self`.

#### 2. Simplified tax invoice

- **Purpose:** prove a Simplified (B2C) invoice is mapped and reported.
- **Input:** baseline with `transaction_type: "X1XXXXXXXXXXXXXXXXXX"` (position 2, Simplified Tax Invoice), a new invoice number, and a mapping certified for this transaction type. The buyer VAT number may be absent. Every goods line still carries a 12-digit HS code (see the note below).
- **Expected response:** `202 Accepted`, as in scenario 1.
- **Expected status transition:** a Simplified invoice is not delivered to the buyer over Peppol. FAWTIR addresses it to the Tax Authority's substitute participant `0248:997770000099`. The delivery `state` stays `QUEUED` and is later set to `UNDELIVERABLE`, because no network delivery is ever made. In the ERP reports the document shows `OFF_NETWORK`. Follow the TDD leg instead: `PENDING` → `SUBMITTED` → `ACCEPTED`.
- **Pass criteria:** your ERP does not treat `UNDELIVERABLE` on a Simplified invoice as a failed delivery, and it tracks the TDD leg.

> **Warning:** **PINT-OM rule:** IBR-079-OM exempts Simplified Tax Invoices from the HS code. PINT-OM 1.0.1 as published also contains rule IBR-174-OM, which applies the same check without the Simplified exemption. Until this is clarified, provide an HS code on every goods line.

> **Note:** `GET /api/v1/invoices/{id}` shows `UNDELIVERABLE` for such an invoice although nothing failed. Track it by its TDD leg, or by `OFF_NETWORK` in the ERP reports. See [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle).

#### 3. Multiple lines

- **Purpose:** prove line totals, VAT and header totals agree.
- **Input:** baseline with two lines: goods "Steel pipe 2 inch", quantity 10, unit `H87`, price 12.500, VAT S 5% (net 125.000); services "Installation service", quantity 4, unit `HUR`, price 25.000, VAT S 5% (net 100.000). Header: net 225.00, VAT 11.25, total 236.25.
- **Expected response:** `202 Accepted`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted without `422`. Line amounts carry up to 3 decimals (**PINT-OM rule** IBR-DEC-03-OM); header totals carry 2 (**PINT-OM rules** ibr-123, ibr-124, ibr-125). An arithmetic mismatch is refused with `422`, `error: VALIDATION_FAILED`, at layer `L2_ARITHMETIC`.

#### 4. Each allowed VAT category

Run one invoice per category. The allowed categories are S, Z, E and O only (**PINT-OM rule** CL-04-OM). Any other letter fails at layer `L5_PINT_OM`.

| Category | Line input | PINT-OM rules that apply |
|---|---|---|
| `S` Standard rated | rate 5 | ALIGNED-IBRP-S-05-OM (the rate must be 5) |
| `Z` Zero rated | rate 0; zero-rating reason code from VATZR-OM-01..16 | ALIGNED-IBRP-Z-05-OM, CL-10-OM |
| `E` Exempt | **no rate**; exemption reason code from VATEX-OM-01..12 | ALIGNED-IBRP-E-05-OM, CL-05-OM |
| `O` Outside the scope of VAT | **no rate** | ALIGNED-IBRP-O-05-OM |

- **Purpose:** prove your tax-code mapping produces each category correctly.
- **Expected response:** `202 Accepted` for each.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** all four accepted. Then send an `E` line **with** a rate: **FAWTIR rule:** it is refused before validation with `422 mapping-failed`, `error: MAPPING_FAILED`, because categories E and O must not carry a rate and every other category must.

> **Note:** Choose the VATEX or VATZR code that matches the actual supply. This guide does not pick one for you.

#### 5. Goods line with an HS code

- **Purpose:** prove HS codes reach the document.
- **Input:** baseline line 1 mapped as goods: goods-or-services flag `G` (BTOM-019), service type code `00000000` (BTOM-034), and an item classification with scheme `HS` and the 12-digit code `730630000002`.
- **Expected response:** `202 Accepted`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted, and `GET /api/v1/invoices/{id}/document` shows `cac:CommodityClassification/cbc:ItemClassificationCode` with `listID="HS"`.

**PINT-OM rule:** a 12-digit code must also be on the published Oman HS list (CL-08-OM-HS). A code with the right length that is not on the list fails validation.

**FAWTIR rule:** when a line has the goods-or-services flag, the mapping must also give the service type code. Without it the request is refused with `422 submission-not-supported`, `error: SUBMISSION_NOT_SUPPORTED`, with `field: "serviceTypeCode"`.

### Validation refusals

A refused submission returns `422`. The body names the failing layer and rule:

```json
{
  "type": "https://api.fawtir.om/problems/validation-failed",
  "status": 422,
  "error": "VALIDATION_FAILED",
  "quota_charged": false,
  "layer_results": [
    {
      "layer": 5,
      "layer_name": "L5_PINT_OM",
      "status": "fail",
      "issues": [
        { "rule": "IBR-079-OM", "field_id": "…", "xpath": "…", "message": "…", "severity": "ERROR" }
      ]
    }
  ]
}
```

The body above is shortened: the real body lists all five layers, and `…` stands for values left out. A refusal creates no invoice and does not spend the `Idempotency-Key`. With a `source` block, though, the refusal is recorded against the source identity. Send the corrected document under a new `external_version`; the same identity and version would be refused with `409 SOURCE_IDENTITY_CONFLICT` (changed content) or `409 SOURCE_DOCUMENT_ALREADY_REFUSED` (same content). See the [Error reference](3-sync-lifecycle-and-errors.md#error-reference).

#### 6. Missing HS code on a goods line

- **Purpose:** prove your ERP surfaces a validation failure with its rule ID.
- **Input:** scenario 5 without the item classification. Goods flag `G` is still set.
- **Expected response:** `422`, `type .../validation-failed`, `error: VALIDATION_FAILED`, failing layer `L5_PINT_OM`, issue `rule` IBR-079-OM (Full Tax Invoice). IBR-174-OM can also be reported. On a Simplified invoice, IBR-174-OM alone is reported.
- **Expected status transition:** none. No invoice is created.
- **Pass criteria:** your ERP shows the rule ID and message to the user, keeps the invoice editable, and does not retry automatically. The corrected document goes under a new `external_version`.

#### 7. Invalid HS code

Two checks apply:

| Input | Expected response | Rule kind |
|---|---|---|
| HS code that is not 12 digits, for example `7306300000` | `422 mapping-failed`, `error: MAPPING_FAILED`. FAWTIR refuses the mapped value before validation, so the body carries no rule ID. | **FAWTIR rule** mirroring **PINT-OM rule** IBR-080-OM |
| 12 digits, but not in the Oman HS list | `422 validation-failed`, `error: VALIDATION_FAILED`, layer `L5_PINT_OM`, rule CL-08-OM-HS | **PINT-OM rule** |

- **Purpose:** prove both refusals reach the user.
- **Expected status transition:** none.
- **Pass criteria:** both refused. Your ERP validates HS codes at master-data entry, so the user sees the problem before sending (**Recommendation**).

> **Note:** The `MAPPING_FAILED` detail does not name the field. To see which field failed, run the same document through the mapping test (dry run) on the mapping page in FAWTIR.

#### 8. Buyer VAT number, valid and invalid

- **Purpose:** prove buyer VAT numbers are checked.
- **Input A:** baseline (buyer `OM1999000202`).
- **Input B:** buyer VAT number `OM19990002` (only 8 digits after `OM`).
- **Expected response:** A: `202 Accepted`. B: `422`, `error: VALIDATION_FAILED`, layer `L5_PINT_OM`, rule IBR-003-OM (**PINT-OM rule:** "'OM' followed by exactly 10 digits").
- **Expected status transition:** A as scenario 1; B none.
- **Pass criteria:** B refused, with the rule ID shown to the user.

> **Note:** For a Full Tax Invoice, either the buyer identifier or the buyer VAT number must be present (**PINT-OM rule** IBR-016-OM).

#### 9. Invalid customer data

- **Purpose:** prove incomplete buyer data is caught.
- **Input A:** buyer with no name in the mapped output.
- **Input B:** Full Tax Invoice whose buyer address has no city or postal code.
- **Expected response:** A: `422 mapping-failed`, `error: MAPPING_FAILED` (**FAWTIR rule:** party name, legal name, postal address and country code are required in the mapped output). B: `422`, `error: VALIDATION_FAILED`, layer `L5_PINT_OM`, rule IBR-019-OM.
- **Expected status transition:** none.
- **Pass criteria:** both refused, and nothing appears in `GET /api/v1/invoices`.

#### 10. Peppol validation rejection

- **Purpose:** prove your ERP separates a synchronous refusal from a later answer from the network.
- **Input:** any document that fails a PINT-OM rule, for example scenario 6.
- **Expected response:** `422`, `error: VALIDATION_FAILED`. FAWTIR validates every document in five layers (`L1_XSD`, `L2_ARITHMETIC`, `L3_CODE_LISTS`, `L4_EN16931_BIS`, `L5_PINT_OM`) before it accepts it. A document that fails is never sent.
- **Expected status transition:** none. Separately, a document that **was** accepted can still be refused later by the buyer's access point. That refusal is an MLS `RE` and moves the delivery `state` to `C4_UNREACHABLE` (it is not retried automatically).
- **Pass criteria:** your ERP treats `422` as "not sent, fix and resend", and `C4_UNREACHABLE` as "sent, refused by the recipient, needs a decision".

### Branches and corrections

#### 11. Branch behaviour

- **Purpose:** confirm how branches apply to pushed documents.
- **FAWTIR rule:** a document pushed through the API belongs to no branch. Your API key acts for the whole company, so branches never refuse it. FAWTIR's branch invoice-number prefixes apply only to invoices created in the FAWTIR app; your ERP's invoice number is used exactly as sent.
- **Input:** a Bridge Upload by a person whose role is limited to some branches.
- **Expected response:** `403`, `type .../branch-not-in-scope`.
- **Expected status transition:** none.
- **Pass criteria:** your numbering plan does not rely on FAWTIR branch prefixes. Invoice numbers are unique per company and year (scenario 14).

#### 12. Credit note

- **Purpose:** prove a correction references the original invoice.
- **Input:** `POST {BASE_URL}/api/v1/creditnotes`, a new `Idempotency-Key`, `source.external_document_id: "ERP-CN-000012"`, and a mapping certified for credit notes that emits type code `381`. The `supplement` carries:

  ```json
  {
    "issue_time": "09:30:00",
    "transaction_type": "1XXXXXXXXXXXXXXXXXXX",
    "preceding_invoice_number": "INV-2026-000145",
    "preceding_invoice_date": "2026-11-10",
    "preceding_invoice_uuid": "<invoice_uuid from the 202 of scenario 1>",
    "credit_note_reason_code": "CAN"
  }
  ```

  The document is `CN-2026-000012`. `credit_note_reason_code` takes one of `CAN`, `VAT`, `VAL`, `QTY`, `OTH` (**PINT-OM rule** CL-02-OM).
- **Expected response:** `202 Accepted`, `document_kind: "CREDIT_NOTE"`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted. Then check the refusals:
  - drop `preceding_invoice_uuid` or the reason code: `422`, `error: SUBMISSION_NOT_SUPPORTED`;
  - send a different UUID than FAWTIR stored for `INV-2026-000145`: `422`, `error: SUBMISSION_NOT_SUPPORTED`.

> **Warning:** **FAWTIR rule:** for documents pushed from your ERP, FAWTIR does not check a credit note's amount against the original invoice. Your ERP must stop credits from exceeding the original.

#### 13. Debit note

- **Purpose:** prove debit notes go to their own route.
- **Input:** `POST {BASE_URL}/api/v1/debitnotes` with the same four `supplement` references, and a mapping certified for this route that emits type code `383`.
- **Expected response:** `202 Accepted`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted. A key without `debitnote.submit` gets the `403` of scenario 18.

> **Note:** The Odoo 17 example mapping maps only invoices and credit notes. A debit note needs your mapping to emit `383`. See [Invoice corrections](3-sync-lifecycle-and-errors.md#invoice-corrections).

### Duplicates and idempotency

#### 14. Duplicate invoice number

- **Purpose:** prove FAWTIR refuses a second invoice with the same number.
- **Input:** a new request with a new `Idempotency-Key` and a new `external_document_id`, but the invoice number `INV-2026-000145` and the year 2026 again.
- **Expected response:** `409`, `type .../duplicate-invoice`, `error: DUPLICATE_INVOICE`. The body carries `existing_submission: "/api/v1/invoices/{id}"` only when the business content is identical to the earlier document. When only the number and year repeat, with different content, there is no `existing_submission` link.
- **Expected status transition:** none. The original is unchanged.
- **Pass criteria:** your ERP does not retry, and links to the existing submission when the body names one (otherwise it finds the original by number, as in scenario 20).

#### 15. Idempotent resubmission

Run both parts after scenario 1.

| Part | Input | Expected response |
|---|---|---|
| A. Same key, same body | repeat scenario 1 exactly, within 24 hours | `202 Accepted` with the stored body of the first response (same `id`). The body is not refreshed. |
| B. New key, same source identity and content | the scenario 1 body with a new `Idempotency-Key` | `200 OK`, `source.disposition: "DUPLICATE"`, the same `id`, and the earlier submission's current `state` |

- **Purpose:** prove a retry can never create a second invoice.
- **Expected status transition:** none. No second invoice is created.
- **Pass criteria:** both parts return the original `id`, and your ERP treats `200` as "already accepted".

> **Note:** An `Idempotency-Key` is kept for 24 hours. The source identity (`external_document_id` + `external_version`) has no time limit.

#### 16. Changed content under the same source identity

- **Purpose:** prove a changed document cannot reuse an identity.
- **Input:** the scenario 1 `source` (`ERP-INV-000145`, version `1`) with a changed quantity and a new `Idempotency-Key`.
- **Expected response:** `409`, `type .../source-document-conflict`, `error: SOURCE_IDENTITY_CONFLICT`.
- **Expected status transition:** none. The accepted invoice is unchanged.
- **Pass criteria:** your ERP stops and asks the user. An issued invoice is corrected with a credit or debit note, not by resending it.

> **Note:** A new `external_version` is the fix only when the earlier version was **refused** (`409 SOURCE_DOCUMENT_ALREADY_REFUSED`). If the earlier version was accepted, a new version with the same invoice number is refused as scenario 14.

### Credential and request refusals

#### 17. Authentication failure

| Input | Expected response |
|---|---|
| revoked, expired or mistyped API key on `POST /api/v1/invoices` | `401`, `type .../invalid-api-key`, `code: INVALID_API_KEY` |
| an API key on any other route or method, for example `GET /api/v1/invoices/{id}` | `401`, `type .../unauthenticated`, `code: UNAUTHENTICATED` |
| both `X-API-Key` and `Authorization` | `400`, `type .../ambiguous-credentials` |

- **Purpose:** prove credential problems stop the push and alert someone.
- **Expected status transition:** none.
- **Pass criteria:** your ERP stops sending, alerts an administrator and does not loop on `401`.

#### 18. Permission failure

- **Purpose:** prove the key's scopes are enforced.
- **Input:** a key that holds only `invoice.submit`, posting to `POST /api/v1/creditnotes`.
- **Expected response:** `403`, `type .../insufficient-permission`, detail `Missing required permission: creditnote.submit`.
- **Expected status transition:** none.
- **Pass criteria:** refused. Also check that `source` from a `GENERAL` key is refused with `422`, `error: SUBMISSION_NOT_SUPPORTED`, and that a company without ERP integration gets `403`, `type .../erp-entitlement-required`.

#### 19. Unknown body field

- **Purpose:** prove your ERP sends only documented members.
- **Input:** baseline plus a top-level member `"invoice_ref": "x"`.
- **Expected response:** `400`, `type .../malformed-request`, `code: MALFORMED_REQUEST`.
- **Expected status transition:** none.
- **Pass criteria:** refused. Your serialiser sends no extra envelope members.

### Outcomes, retries and reconciliation

#### 20. Status polling

- **Purpose:** prove your ERP learns the outcome.
- **Input:** `GET {BASE_URL}/api/v1/invoices/{id}` with `Authorization: Bearer <token>` (holding `invoice.read`). To find a document by number, use `GET {BASE_URL}/api/v1/invoices?invoice_number=INV-2026-000145`.
- **Expected response:** `200 OK` with `state`, `sending_at`, `sent_at`, `delivered_at`, `failure_reason` and `tdd[]` legs (`variant`, `status`, `sla_deadline`, `submitted_at`, `failure_reason`).
- **Expected status transition:** as scenario 1.
- **Pass criteria:** your ERP polls with back-off, stops at a final state, and separates delivery from tax reporting. Delivery is final at `DELIVERED`, `DELIVERED_UNCONFIRMED`, `UNDELIVERABLE` or `C4_UNREACHABLE`.

> **Warning:** `DELIVERED` means the buyer's access point confirmed delivery. It is not acceptance by the Tax Authority. FAWTIR receives no tax verdict from the OTA.

#### 21. Transport failure and retry

- **Purpose:** prove your ERP handles a document that could not be delivered.
- **Input:** cannot be triggered on demand. Agree a test with FAWTIR, or observe it.
- **Expected response:** the submission was `202`. FAWTIR retries AS4 delivery itself: up to 10 attempts, waiting 60 seconds and doubling up to 1 hour, a little over 4 hours in total.
- **Expected status transition:** `SENDING` → `UNDELIVERABLE` with a `failure_reason`. An invoice still `QUEUED` or `SENDING` after 6 hours is labelled `TRANSPORT_PENDING` in the reconciliation report.
- **Pass criteria:** your ERP never resends the same invoice. A resend of the same content under the same `source` identity returns `200` with `source.disposition: "DUPLICATE"`; without that identity it is refused with `409 DUPLICATE_INVOICE`. Neither creates a second invoice.

The API has no route to redeliver an invoice. Agree with FAWTIR, before go-live, what your team does with an invoice that ends `UNDELIVERABLE` or `C4_UNREACHABLE`.

Retry rules for your own requests:

| Answer | Retry the same request with the same key? |
|---|---|
| `429` (`rate-limited`, `api-key-rate-limited`) | yes, after `Retry-After` |
| `503` `MAPPING_CAPACITY_UNAVAILABLE`, `VALIDATION_UNAVAILABLE`, `EMISSION_BLOCKED`, `OUTBOUND_TRANSPORT_UNAVAILABLE` | yes, later |
| `409` `SOURCE_DOCUMENT_IN_PROGRESS`, `DUPLICATE_IDEMPOTENCY` "already in progress" | yes, shortly |
| `422`, `409 DUPLICATE_INVOICE`, `409 SOURCE_IDENTITY_CONFLICT`, `409 SOURCE_DOCUMENT_ALREADY_REFUSED` | no |

#### 22. No downstream answer (RESPONSE_PENDING)

- **Purpose:** prove your ERP does not resend because no answer came.
- **Input:** an invoice that reached `SENT` and received no MLS.
- **Expected response:** the status read keeps showing `state: "SENT"`. After 24 hours the reconciliation report labels it `RESPONSE_PENDING`. That is a label, not a state.
- **Expected status transition:** none. Silence never changes the state.
- **Pass criteria:** your ERP shows "awaiting recipient response" and does **not** resend. **FAWTIR rule:** a document is never resent only because no MLS arrived. FAWTIR bases this on the Peppol Service Provider Operational Guideline on MLS (see [Not yet confirmed](#not-yet-confirmed)).

#### 23. Reconciliation after a timeout

- **Purpose:** prove a lost response never creates a duplicate.
- **Input:** send scenario 1 and drop the connection before the response arrives.
- **Expected response:** then, in order:
  1. Within 24 hours, resend the same request with the same key: `202` and the stored body if the first attempt was accepted; a fresh outcome if it never arrived or was refused for a reason outside the document; `409 SOURCE_DOCUMENT_ALREADY_REFUSED` if the document itself was refused (fix it and send a new `external_version`); `409 DUPLICATE_IDEMPOTENCY` ("already in progress") if it is still running, in which case wait and repeat.
  2. After 24 hours, resend with a new key and the same `source`: `200`, `source.disposition: "DUPLICATE"` if it was accepted.
  3. Or look it up: `GET {BASE_URL}/api/v1/invoices?invoice_number=INV-2026-000145`.
  4. Daily, read `GET {BASE_URL}/api/v1/erp/source-documents/reconciliation?from=2026-11-10&to=2026-11-11` and act on each label.
- **Expected status transition:** none from the resend.
- **Pass criteria:** exactly one invoice exists for `INV-2026-000145`, and your ERP has its `id`.

### Sign-off record

Keep this record for the [production go-live](#production-go-live-checklist) review.

- [ ] Scenarios 1 to 23 run on TEST, with date, request, response status and code.
- [ ] Each `422` shown to a user with its rule ID or code.
- [ ] No duplicate invoice created by any retry.
- [ ] Polling and daily reconciliation running.
- [ ] Every send to a real participant agreed with FAWTIR in advance.
- [ ] Open issues listed, with the `correlationId` or `X-Fawtir-Trace-Id` of each failing request.

## Production go-live checklist

Work through this checklist to move your ERP integration from TEST to production safely. It covers what FAWTIR must switch on, how to set up credentials, how to monitor and reconcile, and how to stop quickly if something goes wrong.

> **Warning:** Nothing on this list is approved automatically. FAWTIR switches on document submission for the deployment and ERP integration for your company, and you must ask for each step. A working TEST setup does not carry over to production by itself.

The key and client values below are placeholders.

### 1. Prerequisites

- [ ] Your company is registered in FAWTIR and its details are verified. Until then submissions are refused with `409`, `error: TENANT_NOT_OPERATIONAL`.
- [ ] Your plan includes API access. Without it, creating a key is refused with `409 plan-limit-reached`.
- [ ] Your company's Peppol participant (`0248:` plus your VAT number, for example `0248:OM1999000101`) is registered and verified by FAWTIR. Until then submissions are refused with `422` and one of `SENDER_PARTICIPANT_NOT_REGISTERED`, `SENDER_PARTICIPANT_CLAIM_CONFLICT` or `SENDER_PARTICIPANT_NOT_AUTHORIZED`.
- [ ] You know which channel you use: API Push, Managed Pull or Bridge Upload. See [Introduction](1-getting-started.md#introduction).
- [ ] Your ERP numbers invoices uniquely per company and year. FAWTIR refuses a repeated number with `409 DUPLICATE_INVOICE`.
- [ ] Your ERP stops a credit note from exceeding the invoice it corrects. **FAWTIR rule:** FAWTIR does not check this for documents pushed from your ERP.

### 2. TEST sign-off

- [ ] Every scenario in the [Test checklist](#erp-integration-test-checklist) has been run and recorded.
- [ ] Every document kind and transaction type you will send in production has passed on TEST.
- [ ] Your ERP shows `422` refusals to a user with the rule ID or code, and does not retry them.
- [ ] No retry, timeout or replay created a second invoice.
- [ ] You have shared the sign-off record with FAWTIR and FAWTIR has agreed the go-live date.

> **Note:** A passed TEST checklist is not Peppol certification and not approval by the Oman Tax Authority (OTA).

### 3. Credentials and secure configuration

- [ ] A person holding `admin.settings.manage` creates the production key on the **API push** page: **Create key**, then **Create an ERP ingestion key**. The key is shown once.
- [ ] The key uses the `ERP_INGESTION` profile and holds only the submit scopes you need: `invoice.submit`, `creditnote.submit`, `debitnote.submit`, `selfbilling.submit`. That profile cannot hold any other permission.
- [ ] The key has an expiry date. An `ERP_INGESTION` key is valid for 365 days by default and at most 730 days.
- [ ] Rotation is planned before expiry. **Rotate key** issues a new key. The old key keeps working for a grace period (24 hours by default, at most 7 days). **Complete rotation** ends the grace period early. Record the owner and the date.
- [ ] The key is kept in a secret store, never in source code, a ticket, a log line or an email.
- [ ] The ERP sends the key only as `X-API-Key: fawt_sk_<your-key>`, and never together with an `Authorization` header (that is refused with `400 ambiguous-credentials`).
- [ ] A separate read credential exists for status polling: a Bearer token from a signed-in user, or an OAuth client (`fawtir_<tenant>_<id>`, secret `<your-client-secret>`) holding `invoice.read`. API keys cannot read anything.

- [ ] You have confirmed with FAWTIR which read credential your integration uses. The platform allows both.

See [Authentication](1-getting-started.md#authentication).

### 4. Production endpoint

- [ ] Your ERP's base URL is configurable, and production uses the production value.
- [ ] You have the production base URL from FAWTIR in writing. Do not point production at the TEST base URL.

See [Environments](1-getting-started.md#environments).

### 5. FAWTIR switches on your company

Ask FAWTIR to confirm each item in writing:

- [ ] Document submission is enabled on the production deployment. It is switched on for the whole deployment, not per organisation; where it is off, the submission routes answer `404`.
- [ ] ERP integration is enabled for your company. Until then a push with `source`, or any push with an `ERP_INGESTION` key, is refused with `403 erp-entitlement-required`, and the ERP pages in FAWTIR show "ERP integration is not enabled".
- [ ] For Managed Pull only: scheduled collection is switched on for your deployment.
- [ ] For webhooks only, if you want them: sending is enabled for your deployment.

### 6. Mapping certification in production

- [ ] The production mapping is the one you tested, for each format (JSON or XML) you send.
- [ ] It is certified in your production company for every document kind, route and transaction type you will send. **FAWTIR rule:** certification is tied to the exact mapping content, so any change to the mapping needs a new certification. An uncertified combination is refused with `422`, `error: SUBMISSION_NOT_SUPPORTED`.
- [ ] Certification was done by a person. Mapping changes and certification cannot be made with an API key or an OAuth client.

- [ ] You have asked FAWTIR whether a mapping certified on TEST must be certified again in production, and planned for the answer.

See [Data mapping](2-api-reference-and-data-mapping.md#data-mapping).

### 7. Monitoring

- [ ] **Polling (primary).** Your ERP reads `GET /api/v1/invoices/{id}` until delivery and tax reporting reach a final state. See [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle).
- [ ] **Reports.** You read `GET /api/v1/erp/source-documents` and `/summary` for documents sent with a `source` block. A push without `source` appears only in `GET /api/v1/invoices`.
- [ ] **Webhooks (optional).** Available on request. They do not cover every event: no webhook is raised for sent, TDD submitted, an AB answer, or transport failure. Keep polling. See [Webhooks](3-sync-lifecycle-and-errors.md#webhooks).
- [ ] Alerts are set for `401`, `403`, `429` and repeated `503` answers.

### 8. Daily reconciliation

- [ ] Once a day your ERP reads `GET /api/v1/erp/source-documents/reconciliation?from=<date>&to=<date>` (window at most 367 days) and acts on each label:

| Label | Action |
|---|---|
| `WAITING_FOR_MAPPING` | Fix or certify the mapping, then resend the same version. |
| `RETRYABLE_FAILURE` | Resend the same request later. |
| `ATTEMPTS_EXHAUSTED` | Find the cause. Managed Pull records can be recovered by a person in FAWTIR. Your ERP must resend a pushed document under a new `external_version`. |
| `RECOVERY_PENDING` | Wait. FAWTIR recovers stale claims itself. |
| `ACCEPTED_WITHOUT_INVOICE` | Contact support. Do not resend. |
| `TRANSPORT_PENDING` | Still queued or sending after 6 hours. Contact support if it persists. |
| `RESPONSE_PENDING` | Sent, no recipient answer after 24 hours. Do not resend. |
| `DELIVERY_FAILED` | `UNDELIVERABLE` or `C4_UNREACHABLE`. Decide with the buyer and FAWTIR. Do not resend the same content. |
| `TAX_REPORT_ATTENTION` | The Tax Data Document could not be produced, was refused as a message, was given up on, or is late. Contact support. |

- [ ] Your ERP's own list of sent invoices matches FAWTIR's for the day.

### 9. Rollback plan

- [ ] **Pause sending** in your ERP (stop the push job). For Managed Pull, pause the connection in FAWTIR (**Pause**).
- [ ] **Revoke** the key if it may be exposed or the ERP is misbehaving. Revocation takes effect at once and also ends an open rotation grace period.
- [ ] **Never delete issued invoices.** The API offers no route to delete or withdraw a submitted document. A document already accepted is corrected only with a credit note or a debit note. See [Invoice corrections](3-sync-lifecycle-and-errors.md#invoice-corrections).
- [ ] Before you resume, reconcile (section 8) so you know which documents were accepted while you were paused.

### 10. Safe retry policy

- [ ] Every request carries an `Idempotency-Key` that belongs to that document version and is reused on every retry, for example `waha-inv-000145-v1-7f3c9a2e`. A new version gets a new key. A successful answer is kept for 24 hours.
- [ ] Every push carries `source.external_document_id` and `source.external_version`. The source identity has no time limit.
- [ ] Retry rules:

| Answer | Action |
|---|---|
| Timeout, connection lost | Resend the same request with the same key. After 24 hours, resend with a new key and the same `source`. |
| `429` | Wait for `Retry-After`, then resend the same request. |
| `503` | Resend the same request later, with back-off. |
| `409 SOURCE_DOCUMENT_IN_PROGRESS`, `409 DUPLICATE_IDEMPOTENCY` "already in progress" | Wait briefly, then resend the same request. |
| `400`, `401`, `403`, `422` | Do not retry. Fix the request, the credential or the data. |
| `409 DUPLICATE_INVOICE`, `SOURCE_IDENTITY_CONFLICT`, `SOURCE_DOCUMENT_ALREADY_REFUSED` | Do not retry. See [Error reference](3-sync-lifecycle-and-errors.md#error-reference). |

- [ ] Your ERP never resends a document only because no recipient answer arrived.

### 11. The first production invoice

- [ ] Agree the date, the buyer and the document with FAWTIR and with the buyer.
- [ ] Send one ordinary standard tax invoice. Do not start with a correction or an unusual transaction type.
- [ ] Confirm the `202`, then poll until delivery reaches a final state and the TDD leg reaches a final status.
- [ ] Confirm with the buyer that the invoice arrived.
- [ ] Only then switch on the rest of your volume.

> **Warning:** `DELIVERED` means the buyer's access point confirmed delivery. A TDD leg at `ACCEPTED` means the Tax Authority's corner (C5) returned a positive message-level status. Neither is a tax verdict from the OTA.

### 12. Support escalation

- [ ] You know how to contact FAWTIR support. See [Support and versioning](#support-and-versioning).
- [ ] Every support request includes the invoice `id` (`invc_…`), the time, the HTTP status, the `error` or `code`, and the `X-Fawtir-Trace-Id` response header or the `correlationId` from the body.
- [ ] Never send an API key, client secret or full invoice payload to support unless FAWTIR asks for the payload through an agreed channel.

## Support and versioning

This page explains how the FAWTIR API is versioned, how to build a client that keeps working as
the API grows, and how to ask FAWTIR for help with the information support needs.

### API version

The version is part of every path: `{BASE_URL}/api/v1/…`. It is the only API version. There is no
version header and no version query parameter.

Ask FAWTIR how breaking changes are announced, how much notice they get, and how long an old
version stays available. Build your client as described below, so additive changes do not break it.

#### What may change within v1

FAWTIR adds to the API without changing the version. Examples of additive changes are a new
`code` member on existing error bodies, or a new `field` member naming a missing field. Expect
these kinds of change:

- new members in a response body, including in problem (error) bodies;
- new values of an existing enumeration, such as a status or an error code;
- new endpoints;
- new response headers.

**Recommendation:** build your client so that these do not break it:

- Ignore response members you do not recognise.
- Treat an unrecognised status or error code as "unknown": log it with the correlation id, park the
  document, and alert a person. Do not treat it as success.
- Branch on the HTTP status and the problem `type` slug first, and on `code` or `error` when
  present.
- Do not depend on the order of members in a body, or on the exact wording of `title` and
  `detail`.

Requests are stricter than responses. **FAWTIR rule:** the submission routes refuse unknown
members in the request body. Send only the members documented in the
[API reference](2-api-reference-and-data-mapping.md#api-reference).

> **Note:** Some changes to platform behaviour are made by FAWTIR in configuration rather than by a
> new release. Document submission and webhook sending are switched on for a whole environment;
> ERP integration is enabled per organisation. See [Environments](1-getting-started.md#environments) and
> [Webhooks](3-sync-lifecycle-and-errors.md#webhooks).

### Getting help

#### Where to ask

Use the **Contact support** links in the FAWTIR web app, or the Contact page on the FAWTIR
website.

Ask FAWTIR during onboarding for the support email address and telephone number, the support
hours, and any response-time commitment.

#### What to send

Send enough for FAWTIR to find your request in its logs without guessing:

| Information | Where you find it |
|---|---|
| The correlation id | The `X-Correlation-Id` you sent, or the `X-Correlation-Id` / `X-Fawtir-Trace-Id` response header. Most problem bodies from the API also carry it as `correlationId` (and `trace_id` on the submission routes); refusals made before the request reaches the API, such as `401` and `429`, do not. |
| The FAWTIR invoice id | `id` in the `202` or `200` response, for example `invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB` |
| Your document identity | `source.external_document_id` and `source.external_version`, and the invoice number |
| The time of the request | The UTC timestamp of the request, and of the answer if you got one |
| The route and method | For example `POST /api/v1/invoices` |
| What you got back | The HTTP status and the full problem body, including `type`, `code` or `error`, and `layer_results` for a validation refusal |
| The environment | TEST or production, and the base URL you called |

**Recommendation:** log the correlation id, the invoice id and the HTTP status for every request
your ERP sends, so you can answer support without reproducing the problem.

> **Warning:** Never send a secret to support. That means no API key, no OAuth client secret, no
> access or refresh token, no password, and no `X-API-Key` or `Authorization` header in a copied
> request. Support can find your request from the correlation id without them. If one has been shared,
> revoke or rotate it at once (see [Authentication](1-getting-started.md#authentication)).

Also avoid sending real personal data. If support needs the document, send the request body with
personal details removed, or point to the invoice by its id.

### Related pages

- [Error reference](3-sync-lifecycle-and-errors.md#error-reference): what each refusal means and what to do.
- [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle): statuses, and which are final.
- [FAQ and glossary](#faq-and-glossary).

## Official references

This page lists the official specifications and pages this guide relies on, so you can check a rule at its source. Each source in the main tables was opened and read when the guide was written (November 2026). Versions and dates are as the source itself states them.

Where this guide labels a rule **Regulation (OTA)** or **PINT-OM rule**, the authority is one of the sources below. A **FAWTIR rule** is platform behaviour and is not found in these sources.

> **Note:** FAWTIR validates documents against the PINT-OM 1.0.1 rule set. Rules can change between versions. Always compare a rule ID with the version you are reading.

### PINT-OM and Oman Peppol specifications

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| Oman Specifications (index) | PDK 1.4.4 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/ | Entry point to the three Oman specifications below |
| PINT OM Billing Process | 1.0.1 | 29 Jul 2026 (PDK release date) | https://docs.peppol.eu/poac/om/pint-om/ | Content and rules of the invoice and credit note |
| Peppol International (PINT) model for Billing, Oman BIS document | Page header shows v1.1.3, the PINT base version | Last updated 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/bis/ | Narrative: identifiers, rounding, the baisa precision model, the transaction type model, document references |
| Release notes for PINT OM Billing | 1.0.1 (Final, maintained by Oman Tax Authority; built on PINT 1.1.3) | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/specialized-release-notes/ | Changes since 1.0.0, including UUID version 5 and the baisa tolerance warnings |
| Oman specific PINT rules (Invoice) | 1.0.1 / PDK 1.4.4 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-jurisdiction-aligned-rules/ | The `-OM` rule IDs and messages. Each rule has its own page, for example `.../rule/IBR-079-OM/` |
| Shared PINT rules (Invoice) | 1.0.1 / PDK 1.4.4 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-UBL-validation-preprocessed/ | The general PINT rules (`ibr-xxx`, `ibr-co-xx`), including the two-decimal total rules |
| Rules (Invoice Transaction Rules) | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/businessrule/ | General PINT rule statements. The Oman rules are on the page above. |
| Credit Note transaction | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-creditnote/ | Credit note syntax, rules and code lists |
| PINT OM Self-Billing Process | 1.0.1 | 29 Jul 2026 (PDK) | https://docs.peppol.eu/poac/om/pint-om-sb/ | Self-billed invoice (389) and self-billed credit note (261) |
| Peppol International (PINT) model for Billing, Oman Self-Billing BIS document | Page header shows v1.1.3, the PINT base version | Last updated 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om-sb/bis/ | Self-billing identifiers and narrative |
| Oman Tax Data Document Process | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/om-tdd/ | The Tax Data Document (TDD) a service provider reports to the Tax Authority |
| Peppol model for Tax Data Document (BIS) | Page header shows v1.0.2 | Last updated 29 Jul 2026 | https://docs.peppol.eu/poac/om/om-tdd/bis/ | How the TDD travels from the service providers to the Tax Authority over Peppol |
| Release notes for Tax Data Document | 1.0.1 (Final, maintained by OTA) | 29 Jul 2026 | https://docs.peppol.eu/poac/om/om-tdd/release-notes/ | Changes since TDD 1.0.0 |
| OpenPeppol Post-Award Documentation | Lists PINT BIS Billing Oman 1.0.1, PINT BIS Self Billing Oman 1.0.1, TDD Oman 1.0.1 | Published and mandatory 29 Jul 2026 | https://peppol.org/documentation/technical-documentation/post-award-documentation/ | Confirms that the Oman specifications are published by OpenPeppol |

### Peppol transport (AS4, SBDH, MLS, SML and SMP)

FAWTIR handles Peppol transport for you. Your ERP never speaks AS4. These sources explain what happens after FAWTIR accepts a document.

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| Peppol eDelivery documentation (index) | Not stated | Not stated | https://docs.peppol.eu/edelivery/ | Index of all transport specifications, including SBDH, SML and SMP |
| Peppol AS4 Profile | 2.0.3 | Changelog 22 Apr 2024 | https://docs.peppol.eu/edelivery/as4/specification/ | How access points exchange documents (one-way push) |
| Peppol Message Level Status (MLS) | 1.1.0 | 2 Jul 2026 | https://docs.peppol.eu/edelivery/specs/mls/v1.1.0/mls/spec/ | The recipient's status message (`AP`, `AB`, `RE`) behind FAWTIR's delivery states |

The Business Message Envelope (SBDH), SML, SMP, identifier and network policy documents are listed under [Not yet confirmed](#not-yet-confirmed).

### Oman Tax Authority (Fawtara)

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| OTA Tax Portal, E-invoicing | Not stated | Page shows "Last updated 07 October 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/e-invoicing | The Tax Authority's description of the five-corner model and the four rollout phases |
| OTA Introduction of E-invoicing | Not stated | Page shows "Last updated 26 July 2026" | https://tms.taxoman.gov.om/portal/introduction-of-envoicing | The same model and phases |
| OTA E-invoicing FAQs | Not stated | Page shows "Last updated 12 November 2026" | https://tms.taxoman.gov.om/portal/e-invoicing-faq | The official go-live dates (FAQ 5) |
| OTA Service Providers FAQs | Not stated | Page shows "Last updated 12 November 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/service-provider-faq | The service provider's role, B2B real-time reporting, QR code status, correction of a wrong buyer |
| OTA Service Providers Criteria | Not stated | Page shows "Last updated 12 November 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/service-provider-criteria | Accreditation criteria for service providers |
| OTA Manual Guides (service providers) | Not stated | Page shows "Last updated 27 September 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/e-invoicing-manual-guide | Index of the Tax Authority's user manuals and its SMP API specification. The page was read; the manuals it links were not. |
| OpenPeppol Peppol Authorities | Not stated | Not stated | https://peppol.org/members/peppol-authorities/ | Lists the Oman Tax Authority (E-invoicing Project, Fawtara) as Oman's Peppol Authority |

**Go-live dates, as the Tax Authority states them (Regulation (OTA), FAQ 5).** E-invoicing applies from 1 April 2027 if supplies from April 2026 to 31 March 2027 exceed OMR 5,000,000, or supplies expected from 1 April 2027 to 31 March 2028 exceed OMR 5,000,000. Otherwise it applies from 1 October 2027. Read the FAQ itself for what counts as a supply.

### Code lists

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| PINT OM Billing code lists (Invoice) | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/codelist/ | Every code list the Oman rules use. Lists you will need: `Aligned-TaxCategoryCodes` (VAT categories S, E, O, Z), `UNCL1001-inv` (invoice type codes), `IssuanceReason` (CL-02-OM credit and debit note reasons), `transactiontype` (CL-03-OM bitmap positions), `ItemType` (G / S), `UNCL4461` (payment means), `UNECERec20` (units), `EAS` (endpoint schemes), and the exemption, zero-rating, service type, ISIC and Oman HS code lists |
| Document name code (Subset: Credit note type code) | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-creditnote/codelist/UNCL1001-cn/ | `UNCL1001-cn`: 81, 83, 381, 396, 532 |
| eDEC Code Lists | 9.7 | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/ | Peppol participant schemes, document types and processes |
| Participant identifier schemes v9.7 | 9.7 (0248 added in 9.6) | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/v9.7/Peppol%20Code%20Lists%20-%20Participant%20identifier%20schemes%20v9.7.html | Scheme `0248`: Oman VAT number, structure `OM` + 10 digits |
| Document types v9.7 | 9.7 (Oman rows added in 9.6) | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/v9.7/Peppol%20Code%20Lists%20-%20Document%20types%20v9.7.html | The exact Oman document type identifiers |
| Processes v9.7 | 9.7 | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/v9.7/Peppol%20Code%20Lists%20-%20Processes%20v9.7.html | Billing, self-billing, tax reporting and MLS process identifiers |

The identifiers FAWTIR writes into Oman documents:

| Document | CustomizationID | ProfileID |
|---|---|---|
| Invoice and credit note | `urn:peppol:pint:billing-1@om-1` | `urn:peppol:bis:billing` |
| Self-billed invoice and credit note | `urn:peppol:pint:selfbilling-1@om-1` | `urn:peppol:bis:selfbilling` |

### Not yet confirmed

The sources below are relevant, but their content was not read for this guide. Do not treat a statement about them in this guide as confirmed.

| Source | Version and date as listed | URL | Why it is here |
|---|---|---|---|
| Peppol Business Message Envelope (SBDH) | 2.0.2, 2 Jul 2026 | https://docs.peppol.eu/edelivery/envelope/Peppol-EDN-Business-Message-Envelope-2.0.2-2026-07-02.pdf | Title, version and date taken from the official eDelivery index. The PDF was not reviewed. |
| Service Provider Operational Guideline on MLS | 1.0.0, 2 Jul 2026 | https://docs.peppol.eu/edelivery/guidelines/mls/SPOG%20on%20MLS%201.0.0%202026-07-02.pdf | Same |
| Peppol Service Metadata Locator (SML) | 1.3.0, 1 Nov 2025 per the eDelivery index (the file name carries 2025-02-06) | https://docs.peppol.eu/edelivery/sml/Peppol-EDN-Service-Metadata-Locator-1.3.0-2025-02-06.pdf | Same |
| Peppol Service Metadata Publishing (SMP) | 1.4.0, 1 Nov 2025 per the eDelivery index (the file name carries 2025-02-06) | https://docs.peppol.eu/edelivery/smp/Peppol-EDN-Service-Metadata-Publishing-1.4.0-2025-02-06.pdf | Same |
| Peppol Policy for use of Identifiers | 4.4.0, 1 Nov 2025 per the eDelivery index (the file name carries 2025-02-06) | https://docs.peppol.eu/edelivery/policies/Peppol-EDN-Policy-for-use-of-identifiers-4.4.0-2025-02-06.pdf | Same |
| Peppol Network Policy | 1.0.0, 2 Jul 2026 | https://docs.peppol.eu/edelivery/policies/Peppol%20Network%20Policy%201.0.0%202026-07-02.pdf | Same |
| Peppol Directory | 1.1.1, 10 Dec 2021 per the eDelivery index (the file name carries 2020-10-15) | https://docs.peppol.eu/edelivery/directory/PEPPOL-EDN-Directory-1.1.1-2020-10-15.pdf | Same |
| PINT OM resources download (schematron, samples) | 1.0.1 | https://docs.peppol.eu/poac/om/pint-om/resources.zip | Link seen on the specification site. The archive was not reviewed for this guide. |
| Fawtara FAQ (PDF) | Not determined | https://tms.taxoman.gov.om/portal/documents/d/taxportal/monthly-faq-s-pdf-1 | The text could not be extracted, so its content is unverified. |
| User manuals linked from the OTA Manual Guides page | Not determined | See the Manual Guides page above | Not opened |
| Fawtara portal | Not determined | https://fawtara.taxoman.gov.om/ | Link seen, not opened |
| OTA data dictionary and business rules | Draft, per the OTA Service Providers FAQ | No official URL found | The Tax Authority describes them as a draft for consultation. |
| QR code specification for Simplified invoices | Pending | No official URL found | The OTA Service Providers FAQ says guidance will be shared. |

Third-party articles also give a pilot start date, a date for the Tax Authority's approval as a Peppol Authority, and a Tax Authority decision number. None of these could be found on an official page, so this guide does not cite them.

### Conflicts and open points in the published specifications

The points below come from reading the published PINT-OM 1.0.1 and TDD pages. They are stated as found, without choosing between the sources. This guide will be updated when the publishers clarify them.

#### IBR-079-OM and IBR-174-OM

IBR-079-OM requires an HS code on a goods line "except when Invoice transaction type (BTOM-001) is 'Simplified Tax Invoice'". IBR-174-OM applies the same test without that exemption. Both are flagged fatal, although the IBR-174-OM message says "should". As published, a Simplified invoice line marked as goods without an HS code therefore still fails IBR-174-OM, and the exemption in IBR-079-OM has no practical effect.

Until this is clarified, provide an HS code on every goods line, including on Simplified invoices.

#### Decimals on header totals

The sources do not use one precision for all amounts:

- IBR-DEC-03-OM says that "All amount values ... MUST NOT contain more than 3 decimal places", but its context leaves out the document totals and the document-level tax amount.
- The shared rules ibr-091 and ibr-121 to ibr-125 limit the document totals (IBT-107, IBT-108, IBT-109, IBT-110, IBT-112, IBT-115) to 2 decimals.
- The BIS rounding section also lists the document-level allowance and charge amounts (IBT-092, IBT-099) as 2-decimal, while IBR-DEC-03-OM allows 3 decimals on them. No shared 2-decimal rule for IBT-092 or IBT-099 was found.
- The BIS says "Document-level VAT amounts are expressed at two decimals", while IBR-DEC-03-OM allows 3 decimals on the breakdown tax amount (IBT-117).

FAWTIR writes the document totals at 2 decimals and the line and breakdown amounts at 3 decimals, which passes the 1.0.1 rules. See [Decimals and the baisa tolerance](2-api-reference-and-data-mapping.md#decimals-and-the-baisa-tolerance).

#### Version labels

- The TDD process page and its release notes say version 1.0.1, and OpenPeppol lists "TDD Oman 1.0.1". The TDD BIS page header says v1.0.2.
- The PINT-OM BIS pages show v1.1.3 in their header. That is the version of the general PINT model the Oman specification is built on, not the Oman version, which is 1.0.1.

When you cite these documents, give both labels.

## FAQ and glossary

This page answers the questions ERP developers ask most often and defines the terms used across this guide. Each answer links to the page with the detail.

### Frequently asked questions

#### Do I have to create my customers in FAWTIR?

No. With API Push, the buyer's details come from your own invoice document through your mapping. Map the buyer's endpoint (scheme `0248`, value the buyer's VAT number), as the example mappings do. If the document has no buyer endpoint, FAWTIR looks for a matching customer by VAT number in its customer records, and otherwise applies the Tax Authority's substitute rules. See [Data mapping](2-api-reference-and-data-mapping.md#data-mapping).

#### Can I edit an invoice after sending it?

No. Once FAWTIR has accepted a document (`202`), it cannot be changed or deleted. Correct it with a credit note or a debit note. Resending changed content under the same `external_document_id` and `external_version` is refused with `409 SOURCE_IDENTITY_CONFLICT`. A new `external_version` helps only when the earlier version was refused. See [Invoice corrections](3-sync-lifecycle-and-errors.md#invoice-corrections).

#### What happens if my request times out?

You do not know whether the document was accepted, so resend the **same** request with the **same** `Idempotency-Key` within 24 hours. If it was accepted, you get the stored `202` response and no second invoice. After 24 hours, resend with a new key and the same `source`. An accepted document then answers `200` with `source.disposition: "DUPLICATE"`. See [Invoice synchronization](3-sync-lifecycle-and-errors.md#invoice-synchronization).

#### Is there a connector, agent or SDK I can install?

No. There is no installable connector, agent or SDK for ERP integration. There are three channels: API Push (your ERP calls FAWTIR's API), Managed Pull (FAWTIR collects from your ERP's REST endpoint) and Bridge Upload (a person uploads one document in the FAWTIR web app). See [ERP connector](3-sync-lifecycle-and-errors.md#erp-connector).

#### Which ERP systems are supported?

FAWTIR does not certify named ERP products. Any ERP that can produce its invoices as JSON or XML and make HTTPS calls can use API Push. Managed Pull needs an ERP endpoint that returns JSON over HTTPS. Example mappings for Odoo 17 and Oracle Fusion invoice exports are available. Their sample data is representative, not taken from a live system. See [Data mapping](2-api-reference-and-data-mapping.md#data-mapping).

#### Does a Peppol delivery mean the Tax Authority accepted my invoice?

No. `DELIVERED` means the buyer's access point confirmed delivery. Tax reporting is a separate leg: FAWTIR sends a Tax Data Document (TDD) to the Tax Authority's corner (C5) over Peppol. A TDD status of `ACCEPTED` means C5 returned a positive message-level status. FAWTIR receives no tax verdict from the Oman Tax Authority, and there is no direct OTA API. See [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle).

#### How do I find out what happened to an invoice?

Poll `GET /api/v1/invoices/{id}` with a Bearer token holding `invoice.read`: a signed-in user, or an OAuth client, which the platform allows. Polling is the primary way to learn an outcome. API keys cannot read anything, so you need a separate read credential. Confirm with FAWTIR during onboarding which one to use. See [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle).

#### Do you support webhooks?

Webhooks are available on request. FAWTIR enables sending per deployment. They are optional and do not replace polling, because some events raise no webhook: sent, TDD submitted, an AB answer, and transport failure. The events that are raised include `invoice.validated`, `invoice.delivered`, `invoice.undeliverable` (recipient refusal only), `tdd.accepted`, `tdd.rejected` and `webhook.test`. See [Webhooks](3-sync-lifecycle-and-errors.md#webhooks).

#### Why does my simplified invoice need an HS code?

**PINT-OM rule:** IBR-079-OM exempts Simplified Tax Invoices from the HS code. PINT-OM 1.0.1 as published also contains rule IBR-174-OM, which applies the same check without the Simplified exemption. Until this is clarified, provide an HS code on every goods line. See [Data mapping](2-api-reference-and-data-mapping.md#data-mapping).

#### What format must the HS code have?

Exactly 12 digits, from the Oman HS code list (**PINT-OM rules** IBR-080-OM and CL-08-OM-HS). A code that is not 12 digits is refused before validation with `422 MAPPING_FAILED`. A 12-digit code that is not on the list fails validation with rule CL-08-OM-HS. See [Error reference](3-sync-lifecycle-and-errors.md#error-reference).

#### Why is my transaction type refused?

`transaction_type` is a 20-character string of `X` and `1`. Each position is one transaction type: position 1 Full Tax Invoice, position 2 Simplified Tax Invoice, and so on. Send `X`, not `0`, for "not this type". FAWTIR writes `X` as `0` in the Peppol document. See [API reference](2-api-reference-and-data-mapping.md#api-reference).

#### Can I send JSON or XML? What about CSV?

JSON or XML. XML travels as a JSON string in `document`. CSV and EDIFACT are refused with `422 SUBMISSION_NOT_SUPPORTED`. See [API reference](2-api-reference-and-data-mapping.md#api-reference).

#### Can I send several invoices in one request?

Not with an API key. An API key can call only the four single-document routes: `POST /api/v1/invoices`, `/creditnotes`, `/debitnotes` and `/selfbilling`. See [Platform limits](3-sync-lifecycle-and-errors.md#platform-limits).

#### How many decimals should amounts have?

Line amounts take up to 3 decimals (1 baisa = 0.001 OMR; **PINT-OM rule** IBR-DEC-03-OM). Document totals take 2 decimals (**PINT-OM rules** ibr-091 and ibr-121 to ibr-125). See [Data mapping](2-api-reference-and-data-mapping.md#data-mapping).

#### Does FAWTIR stop me crediting more than the original invoice?

**FAWTIR rule:** not for documents pushed from your ERP. FAWTIR checks that the credit note names the original invoice correctly, but not its amount. Your ERP must enforce the limit. See [Invoice corrections](3-sync-lifecycle-and-errors.md#invoice-corrections).

#### Should I resend an invoice that has had no answer for a day?

No. After 24 hours without a recipient answer, the reconciliation report labels the invoice `RESPONSE_PENDING`, and it stays `SENT`. Resending only because no answer arrived is not allowed. See [Invoice lifecycle](3-sync-lifecycle-and-errors.md#invoice-lifecycle).

#### Do my FAWTIR branches and their invoice prefixes apply?

No. A document pushed through the API belongs to no branch, and your ERP's invoice number is used exactly as sent. Branch prefixes apply only to invoices created in the FAWTIR app. See [API reference](2-api-reference-and-data-mapping.md#api-reference).

#### Does passing the test checklist mean I am certified?

No. The [Test checklist](#erp-integration-test-checklist) shows that your integration behaves correctly against FAWTIR. It is not Peppol certification and not approval by the Oman Tax Authority. Production access needs FAWTIR's explicit approval. See [Production go-live](#production-go-live-checklist).

### Glossary

| Term | Meaning |
|---|---|
| **0248** | The Peppol participant scheme for the Oman VAT identification number (VATIN). |
| **Access point** | A service that sends and receives documents on the Peppol network for its customers. FAWTIR is your access point. |
| **API Push** | The channel in which your ERP sends each document to FAWTIR's API with an API key. |
| **AS4** | The messaging protocol Peppol access points use to exchange documents (Peppol AS4 Profile). |
| **baisa** | One thousandth of an Omani rial: 0.001 OMR. Line amounts are expressed to the baisa (3 decimals). |
| **BillingReference** | The part of a credit or debit note that names the invoice it corrects: number (IBT-025), issue date (IBT-026) and UUID (BTOM-031). In the API these are the `preceding_invoice_*` members of `supplement`. |
| **Branch** | A part of your company in FAWTIR, with its own users and invoice-number prefix for invoices created in the FAWTIR app. Documents pushed through the API belong to no branch. |
| **Bridge Upload** | The channel in which a signed-in person uploads one JSON or XML document in the FAWTIR web app. It is not an installable program. |
| **C1 to C5 (five-corner model)** | The Oman e-invoicing model: C1 the supplier, C2 the supplier's service provider, C3 the buyer's service provider, C4 the buyer, C5 the Tax Authority's system, which receives the tax data. |
| **Certification (mapping)** | The check that your mapping turns a test document into a valid PINT-OM document. Each format, document kind, route and transaction type needs one, and any change to the mapping needs a new one. It is not Peppol certification of your company. |
| **ERP_INGESTION** | The API-key profile for pushing documents. It can hold only the four submit permissions, always expires (365 days by default, 730 at most), and is the only API key that may send a `source` block. (A Bridge Upload by a signed-in person also carries one.) |
| **HS code** | The Harmonized System item classification for goods. In Oman it is 12 digits, from the list published for PINT-OM. |
| **Idempotency-Key** | A header you send with each submission, 16 to 128 characters from `A-Z a-z 0-9 . _ : -`. The same key with the same body within 24 hours returns the stored response instead of creating a second document. |
| **JSONata** | The expression language FAWTIR uses to map an ERP's JSON document to its canonical invoice model. |
| **Managed Pull** | The channel in which FAWTIR collects invoices from your ERP's HTTPS JSON endpoint on a schedule. It submits tax invoices only. |
| **Mapping** | Your company's stored rules (JSONata for JSON, XSLT for XML) that convert your ERP's own document into the document FAWTIR validates and sends. |
| **MLS** | Message Level Status. The answer a receiving access point sends back: `AP` (delivered, confirmed), `AB` (delivered, not confirmed) or `RE` (rejected). |
| **Participant identifier** | A company's address on the Peppol network, written `<scheme>:<value>`, for example `0248:OM1999000101`. |
| **PINT-OM** | The Oman edition of Peppol International (PINT) billing, maintained by the Oman Tax Authority. FAWTIR validates against PINT-OM 1.0.1. |
| **RESPONSE_PENDING** | A reconciliation label (not a state) for an invoice that is `SENT` and has had no recipient answer for 24 hours or more. |
| **SMP / SML** | Service Metadata Publisher and Service Metadata Locator. The SML finds a participant's SMP; the SMP says which access point receives which document types for that participant. |
| **Source identity** | The pair `external_document_id` and `external_version` in the `source` block. It identifies a document in your ERP, has no time limit, and stops a second invoice being made from the same document. |
| **Tax Data Document (TDD)** | The tax report FAWTIR sends to the Tax Authority's corner (C5) over Peppol for each invoice. |
| **Tenant / company** | Your organisation's account in FAWTIR. Every document, key and mapping belongs to one company. |
| **VATIN** | VAT identification number. In Oman: `OM` followed by 10 digits, for example `OM1999000101` (**PINT-OM rule** IBR-003-OM). |
| **XSLT** | The XML transformation language (version 3.0) FAWTIR uses to map an ERP's XML document. |
