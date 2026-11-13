---
title: "ERP integration test checklist"
description: "Use this checklist to prove, on the FAWTIR TEST environment, that your ERP integration handles the normal cases, the refusals and the recovery cases correctly."
sidebar:
  label: "TEST checklist"
  order: 1
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
Use this checklist to prove, on the FAWTIR TEST environment, that your ERP integration handles the normal cases, the refusals and the recovery cases correctly. Each scenario gives the purpose, the input, the expected response, the status change to expect and the pass criteria.

:::caution[Warning]
Passing this checklist is **not** Peppol certification and **not** approval by the Oman Tax Authority (OTA). It shows that your integration behaves correctly against FAWTIR. Peppol certification and service-provider accreditation concern FAWTIR as your service provider, not your ERP integration.
:::

All company names, VAT numbers, invoice numbers and keys on this page are fictitious.

## Before you send anything from TEST

:::caution[Warning]
A document accepted on TEST may be transmitted over Peppol to the buyer's access point. Ask FAWTIR before you send any document addressed to a real company.
:::

What is known about TEST:

- Document submission is switched on by FAWTIR for the whole deployment, not per organisation. Where it is off, the submission routes and the invoice status reads answer `404`. Where it is on but your company is not yet ready to issue (for example, its details are not verified), submissions are refused with `409`, `error: TENANT_NOT_OPERATIONAL`.
- When a TEST deployment has no Peppol transport configured, submissions are refused with `503` and the code `OUTBOUND_TRANSPORT_UNAVAILABLE`. When it does have transport, an accepted invoice is queued for AS4 delivery to the receiver's access point. The receiver is taken from the buyer's endpoint, `0248:` plus the buyer's VAT number. A real VAT number as the buyer can therefore address a real company.
- For every accepted invoice, FAWTIR also queues a Tax Data Document (TDD) for the Tax Authority's corner (C5). That message also travels over Peppol.
- FAWTIR can reserve invoice numbers for controlled test windows. A submission that uses a reserved number is refused with `409 OUTBOUND_WINDOW_INVOICE_RESERVED` (retryable later).

Ask FAWTIR which Peppol network the TEST environment is connected to, whether outbound sending is switched on there, and which buyer participant identifiers you may use for TEST invoices.

<span class="rule rule--advice">Recommendation</span> use only the buyer identifiers FAWTIR gives you for testing, and agree a test plan with FAWTIR before your first send.

### Setup

| Item | What you need | See |
|---|---|---|
| Base URL | `{BASE_URL}` for TEST | [Environments](/get-started/environments/) |
| Push credential | An `ERP_INGESTION` API key (`X-API-Key: fawt_sk_<your-key>`) holding the submit scopes you will test | [Authentication](/get-started/authentication/) |
| Read credential | A Bearer token: a signed-in user, or an OAuth client holding `invoice.read`. API keys cannot read anything. | [Authentication](/get-started/authentication/) |
| Mapping | An active mapping, certified for each document kind, route and transaction type you test | [Data mapping](/api/data-mapping/) |
| ERP integration | Switched on for your company by FAWTIR (otherwise `403 erp-entitlement-required`) | [Introduction](/get-started/introduction/) |

The platform allows either read credential. Confirm with FAWTIR during onboarding which one to use for your integration.

:::note
Certification is per format, document kind, route and transaction type. A Simplified invoice, a credit note and a debit note each need their own certification. Without it, the submission is refused with `422` and `error: SUBMISSION_NOT_SUPPORTED`.
:::

### Baseline request

Every scenario starts from this request: the standard invoice from the shared example data (supplier Al Waha Trading LLC, `OM1999000101`; buyer Sahil Engineering SAOC, `OM1999000202`; invoice `INV-2026-000145`). The `document` member is your ERP's own export. The full example document is on the [Quick start](/get-started/quick-start/) and [Data mapping](/api/data-mapping/) pages, so only the envelope is shown here.

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

:::note
Send `X` and `1` in `transaction_type`, not `0` and `1`. FAWTIR writes `X` as `0` in the Peppol document. A `0` in the request is refused with `400 validation-failed`.
:::

Unless a scenario says otherwise, use a **new** `Idempotency-Key`, a new invoice number and a new `source.external_document_id` for each scenario. A scenario that reused `ERP-INV-000145` version `1` with different content would get `409 SOURCE_IDENTITY_CONFLICT` instead of the response it tests. Reusing a key that already succeeded, with a different body, is refused with `409 DUPLICATE_IDEMPOTENCY`.

### Status terms used below

| Field | Values you will see |
|---|---|
| Delivery `state` | `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `DELIVERED_UNCONFIRMED`, `UNDELIVERABLE`, `C4_UNREACHABLE` |
| TDD leg `status` | `PENDING`, `SUBMITTED`, `GENERATION_FAILED`, `ACCEPTED`, `DELIVERED_UNCONFIRMED`, `REJECTED`, `TO_DISREGARD`, `DISREGARD_SUBMITTED`, `DEAD_LETTERED`, `NOT_TESTED` |

A refused request is not a state. It creates no invoice and uses no allowance. Because every scenario sends a `source` block, FAWTIR records the refusal against that source identity: send a corrected document under a new `external_version`. The meaning of each state is on the [Invoice lifecycle](/integrate/lifecycle/) page.

## Accepted documents

### 1. Valid standard tax invoice

- **Purpose:** prove the happy path end to end.
- **Input:** the baseline request.
- **Expected response:** `202 Accepted` with a `Location` header. Body: `state: "QUEUED"`, `peppol_send.status: "queued"`, `tdd.status: "queued"`, a `tdd.sla_deadline`, `source.disposition: "ACCEPTED"`, and an `id` starting `invc_`. Keep `id` and `invoice_uuid`.
- **Expected status transition:** `QUEUED` → `SENDING` → `SENT` → `DELIVERED` (recipient answered AP) or `DELIVERED_UNCONFIRMED` (AB). TDD leg `PENDING` → `SUBMITTED` → `ACCEPTED`.
- **Pass criteria:** your ERP stores `id`, `invoice_uuid` and the `Location`, and shows the invoice as "submitted", not "delivered". It updates the status only from polling (scenario 20).

:::note
`peppol_send.status` and `tdd.status` in the 202 body are fixed receipt values. The live status is at `links.self`.
:::

### 2. Simplified tax invoice

- **Purpose:** prove a Simplified (B2C) invoice is mapped and reported.
- **Input:** baseline with `transaction_type: "X1XXXXXXXXXXXXXXXXXX"` (position 2, Simplified Tax Invoice), a new invoice number, and a mapping certified for this transaction type. The buyer VAT number may be absent. Every goods line still carries a 12-digit HS code (see the note below).
- **Expected response:** `202 Accepted`, as in scenario 1.
- **Expected status transition:** a Simplified invoice is not delivered to the buyer over Peppol. FAWTIR addresses it to the Tax Authority's substitute participant `0248:997770000099`. The delivery `state` stays `QUEUED` and is later set to `UNDELIVERABLE`, because no network delivery is ever made. In the ERP reports the document shows `OFF_NETWORK`. Follow the TDD leg instead: `PENDING` → `SUBMITTED` → `ACCEPTED`.
- **Pass criteria:** your ERP does not treat `UNDELIVERABLE` on a Simplified invoice as a failed delivery, and it tracks the TDD leg.

:::caution[Warning]
<span class="rule rule--pint">PINT-OM rule</span> IBR-079-OM exempts Simplified Tax Invoices from the HS code. PINT-OM 1.0.1 as published also contains rule IBR-174-OM, which applies the same check without the Simplified exemption. Until this is clarified, provide an HS code on every goods line.
:::

:::note
`GET /api/v1/invoices/{id}` shows `UNDELIVERABLE` for such an invoice although nothing failed. Track it by its TDD leg, or by `OFF_NETWORK` in the ERP reports. See [Invoice lifecycle](/integrate/lifecycle/).
:::

### 3. Multiple lines

- **Purpose:** prove line totals, VAT and header totals agree.
- **Input:** baseline with two lines: goods "Steel pipe 2 inch", quantity 10, unit `H87`, price 12.500, VAT S 5% (net 125.000); services "Installation service", quantity 4, unit `HUR`, price 25.000, VAT S 5% (net 100.000). Header: net 225.00, VAT 11.25, total 236.25.
- **Expected response:** `202 Accepted`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted without `422`. Line amounts carry up to 3 decimals (<span class="rule rule--pint">PINT-OM rule</span> IBR-DEC-03-OM); header totals carry 2 (**PINT-OM rules** ibr-123, ibr-124, ibr-125). An arithmetic mismatch is refused with `422`, `error: VALIDATION_FAILED`, at layer `L2_ARITHMETIC`.

### 4. Each allowed VAT category

Run one invoice per category. The allowed categories are S, Z, E and O only (<span class="rule rule--pint">PINT-OM rule</span> CL-04-OM). Any other letter fails at layer `L5_PINT_OM`.

| Category | Line input | PINT-OM rules that apply |
|---|---|---|
| `S` Standard rated | rate 5 | ALIGNED-IBRP-S-05-OM (the rate must be 5) |
| `Z` Zero rated | rate 0; zero-rating reason code from VATZR-OM-01..16 | ALIGNED-IBRP-Z-05-OM, CL-10-OM |
| `E` Exempt | **no rate**; exemption reason code from VATEX-OM-01..12 | ALIGNED-IBRP-E-05-OM, CL-05-OM |
| `O` Outside the scope of VAT | **no rate** | ALIGNED-IBRP-O-05-OM |

- **Purpose:** prove your tax-code mapping produces each category correctly.
- **Expected response:** `202 Accepted` for each.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** all four accepted. Then send an `E` line **with** a rate: <span class="rule rule--fawtir">FAWTIR rule</span>: it is refused before validation with `422 mapping-failed`, `error: MAPPING_FAILED`, because categories E and O must not carry a rate and every other category must.

:::note
Choose the VATEX or VATZR code that matches the actual supply. This guide does not pick one for you.
:::

### 5. Goods line with an HS code

- **Purpose:** prove HS codes reach the document.
- **Input:** baseline line 1 mapped as goods: goods-or-services flag `G` (BTOM-019), service type code `00000000` (BTOM-034), and an item classification with scheme `HS` and the 12-digit code `730630000002`.
- **Expected response:** `202 Accepted`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted, and `GET /api/v1/invoices/{id}/document` shows `cac:CommodityClassification/cbc:ItemClassificationCode` with `listID="HS"`.

<span class="rule rule--pint">PINT-OM rule</span> a 12-digit code must also be on the published Oman HS list (CL-08-OM-HS). A code with the right length that is not on the list fails validation.

<span class="rule rule--fawtir">FAWTIR rule</span> when a line has the goods-or-services flag, the mapping must also give the service type code. Without it the request is refused with `422 submission-not-supported`, `error: SUBMISSION_NOT_SUPPORTED`, with `field: "serviceTypeCode"`.

## Validation refusals

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

The body above is shortened: the real body lists all five layers, and `…` stands for values left out. A refusal creates no invoice and does not spend the `Idempotency-Key`. With a `source` block, though, the refusal is recorded against the source identity. Send the corrected document under a new `external_version`; the same identity and version would be refused with `409 SOURCE_IDENTITY_CONFLICT` (changed content) or `409 SOURCE_DOCUMENT_ALREADY_REFUSED` (same content). See the [Error reference](/reference/errors/).

### 6. Missing HS code on a goods line

- **Purpose:** prove your ERP surfaces a validation failure with its rule ID.
- **Input:** scenario 5 without the item classification. Goods flag `G` is still set.
- **Expected response:** `422`, `type .../validation-failed`, `error: VALIDATION_FAILED`, failing layer `L5_PINT_OM`, issue `rule` IBR-079-OM (Full Tax Invoice). IBR-174-OM can also be reported. On a Simplified invoice, IBR-174-OM alone is reported.
- **Expected status transition:** none. No invoice is created.
- **Pass criteria:** your ERP shows the rule ID and message to the user, keeps the invoice editable, and does not retry automatically. The corrected document goes under a new `external_version`.

### 7. Invalid HS code

Two checks apply:

| Input | Expected response | Rule kind |
|---|---|---|
| HS code that is not 12 digits, for example `7306300000` | `422 mapping-failed`, `error: MAPPING_FAILED`. FAWTIR refuses the mapped value before validation, so the body carries no rule ID. | <span class="rule rule--fawtir">FAWTIR rule</span> mirroring <span class="rule rule--pint">PINT-OM rule</span> IBR-080-OM |
| 12 digits, but not in the Oman HS list | `422 validation-failed`, `error: VALIDATION_FAILED`, layer `L5_PINT_OM`, rule CL-08-OM-HS | <span class="rule rule--pint">PINT-OM rule</span> |

- **Purpose:** prove both refusals reach the user.
- **Expected status transition:** none.
- **Pass criteria:** both refused. Your ERP validates HS codes at master-data entry, so the user sees the problem before sending (<span class="rule rule--advice">Recommendation</span>).

:::note
The `MAPPING_FAILED` detail does not name the field. To see which field failed, run the same document through the mapping test (dry run) on the mapping page in FAWTIR.
:::

### 8. Buyer VAT number, valid and invalid

- **Purpose:** prove buyer VAT numbers are checked.
- **Input A:** baseline (buyer `OM1999000202`).
- **Input B:** buyer VAT number `OM19990002` (only 8 digits after `OM`).
- **Expected response:** A: `202 Accepted`. B: `422`, `error: VALIDATION_FAILED`, layer `L5_PINT_OM`, rule IBR-003-OM (<span class="rule rule--pint">PINT-OM rule</span>: "'OM' followed by exactly 10 digits").
- **Expected status transition:** A as scenario 1; B none.
- **Pass criteria:** B refused, with the rule ID shown to the user.

:::note
For a Full Tax Invoice, either the buyer identifier or the buyer VAT number must be present (<span class="rule rule--pint">PINT-OM rule</span> IBR-016-OM).
:::

### 9. Invalid customer data

- **Purpose:** prove incomplete buyer data is caught.
- **Input A:** buyer with no name in the mapped output.
- **Input B:** Full Tax Invoice whose buyer address has no city or postal code.
- **Expected response:** A: `422 mapping-failed`, `error: MAPPING_FAILED` (<span class="rule rule--fawtir">FAWTIR rule</span>: party name, legal name, postal address and country code are required in the mapped output). B: `422`, `error: VALIDATION_FAILED`, layer `L5_PINT_OM`, rule IBR-019-OM.
- **Expected status transition:** none.
- **Pass criteria:** both refused, and nothing appears in `GET /api/v1/invoices`.

### 10. Peppol validation rejection

- **Purpose:** prove your ERP separates a synchronous refusal from a later answer from the network.
- **Input:** any document that fails a PINT-OM rule, for example scenario 6.
- **Expected response:** `422`, `error: VALIDATION_FAILED`. FAWTIR validates every document in five layers (`L1_XSD`, `L2_ARITHMETIC`, `L3_CODE_LISTS`, `L4_EN16931_BIS`, `L5_PINT_OM`) before it accepts it. A document that fails is never sent.
- **Expected status transition:** none. Separately, a document that **was** accepted can still be refused later by the buyer's access point. That refusal is an MLS `RE` and moves the delivery `state` to `C4_UNREACHABLE` (it is not retried automatically).
- **Pass criteria:** your ERP treats `422` as "not sent, fix and resend", and `C4_UNREACHABLE` as "sent, refused by the recipient, needs a decision".

## Branches and corrections

### 11. Branch behaviour

- **Purpose:** confirm how branches apply to pushed documents.
- <span class="rule rule--fawtir">FAWTIR rule</span> a document pushed through the API belongs to no branch. Your API key acts for the whole company, so branches never refuse it. FAWTIR's branch invoice-number prefixes apply only to invoices created in the FAWTIR app; your ERP's invoice number is used exactly as sent.
- **Input:** a Bridge Upload by a person whose role is limited to some branches.
- **Expected response:** `403`, `type .../branch-not-in-scope`.
- **Expected status transition:** none.
- **Pass criteria:** your numbering plan does not rely on FAWTIR branch prefixes. Invoice numbers are unique per company and year (scenario 14).

### 12. Credit note

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

  The document is `CN-2026-000012`. `credit_note_reason_code` takes one of `CAN`, `VAT`, `VAL`, `QTY`, `OTH` (<span class="rule rule--pint">PINT-OM rule</span> CL-02-OM).
- **Expected response:** `202 Accepted`, `document_kind: "CREDIT_NOTE"`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted. Then check the refusals:
  - drop `preceding_invoice_uuid` or the reason code: `422`, `error: SUBMISSION_NOT_SUPPORTED`;
  - send a different UUID than FAWTIR stored for `INV-2026-000145`: `422`, `error: SUBMISSION_NOT_SUPPORTED`.

:::caution[Warning]
<span class="rule rule--fawtir">FAWTIR rule</span> for documents pushed from your ERP, FAWTIR does not check a credit note's amount against the original invoice. Your ERP must stop credits from exceeding the original.
:::

### 13. Debit note

- **Purpose:** prove debit notes go to their own route.
- **Input:** `POST {BASE_URL}/api/v1/debitnotes` with the same four `supplement` references, and a mapping certified for this route that emits type code `383`.
- **Expected response:** `202 Accepted`.
- **Expected status transition:** as scenario 1.
- **Pass criteria:** accepted. A key without `debitnote.submit` gets the `403` of scenario 18.

:::note
The Odoo 17 example mapping maps only invoices and credit notes. A debit note needs your mapping to emit `383`. See [Invoice corrections](/integrate/corrections/).
:::

## Duplicates and idempotency

### 14. Duplicate invoice number

- **Purpose:** prove FAWTIR refuses a second invoice with the same number.
- **Input:** a new request with a new `Idempotency-Key` and a new `external_document_id`, but the invoice number `INV-2026-000145` and the year 2026 again.
- **Expected response:** `409`, `type .../duplicate-invoice`, `error: DUPLICATE_INVOICE`. The body carries `existing_submission: "/api/v1/invoices/{id}"` only when the business content is identical to the earlier document. When only the number and year repeat, with different content, there is no `existing_submission` link.
- **Expected status transition:** none. The original is unchanged.
- **Pass criteria:** your ERP does not retry, and links to the existing submission when the body names one (otherwise it finds the original by number, as in scenario 20).

### 15. Idempotent resubmission

Run both parts after scenario 1.

| Part | Input | Expected response |
|---|---|---|
| A. Same key, same body | repeat scenario 1 exactly, within 24 hours | `202 Accepted` with the stored body of the first response (same `id`). The body is not refreshed. |
| B. New key, same source identity and content | the scenario 1 body with a new `Idempotency-Key` | `200 OK`, `source.disposition: "DUPLICATE"`, the same `id`, and the earlier submission's current `state` |

- **Purpose:** prove a retry can never create a second invoice.
- **Expected status transition:** none. No second invoice is created.
- **Pass criteria:** both parts return the original `id`, and your ERP treats `200` as "already accepted".

:::note
An `Idempotency-Key` is kept for 24 hours. The source identity (`external_document_id` + `external_version`) has no time limit.
:::

### 16. Changed content under the same source identity

- **Purpose:** prove a changed document cannot reuse an identity.
- **Input:** the scenario 1 `source` (`ERP-INV-000145`, version `1`) with a changed quantity and a new `Idempotency-Key`.
- **Expected response:** `409`, `type .../source-document-conflict`, `error: SOURCE_IDENTITY_CONFLICT`.
- **Expected status transition:** none. The accepted invoice is unchanged.
- **Pass criteria:** your ERP stops and asks the user. An issued invoice is corrected with a credit or debit note, not by resending it.

:::note
A new `external_version` is the fix only when the earlier version was **refused** (`409 SOURCE_DOCUMENT_ALREADY_REFUSED`). If the earlier version was accepted, a new version with the same invoice number is refused as scenario 14.
:::

## Credential and request refusals

### 17. Authentication failure

| Input | Expected response |
|---|---|
| revoked, expired or mistyped API key on `POST /api/v1/invoices` | `401`, `type .../invalid-api-key`, `code: INVALID_API_KEY` |
| an API key on any other route or method, for example `GET /api/v1/invoices/{id}` | `401`, `type .../unauthenticated`, `code: UNAUTHENTICATED` |
| both `X-API-Key` and `Authorization` | `400`, `type .../ambiguous-credentials` |

- **Purpose:** prove credential problems stop the push and alert someone.
- **Expected status transition:** none.
- **Pass criteria:** your ERP stops sending, alerts an administrator and does not loop on `401`.

### 18. Permission failure

- **Purpose:** prove the key's scopes are enforced.
- **Input:** a key that holds only `invoice.submit`, posting to `POST /api/v1/creditnotes`.
- **Expected response:** `403`, `type .../insufficient-permission`, detail `Missing required permission: creditnote.submit`.
- **Expected status transition:** none.
- **Pass criteria:** refused. Also check that `source` from a `GENERAL` key is refused with `422`, `error: SUBMISSION_NOT_SUPPORTED`, and that a company without ERP integration gets `403`, `type .../erp-entitlement-required`.

### 19. Unknown body field

- **Purpose:** prove your ERP sends only documented members.
- **Input:** baseline plus a top-level member `"invoice_ref": "x"`.
- **Expected response:** `400`, `type .../malformed-request`, `code: MALFORMED_REQUEST`.
- **Expected status transition:** none.
- **Pass criteria:** refused. Your serialiser sends no extra envelope members.

## Outcomes, retries and reconciliation

### 20. Status polling

- **Purpose:** prove your ERP learns the outcome.
- **Input:** `GET {BASE_URL}/api/v1/invoices/{id}` with `Authorization: Bearer <token>` (holding `invoice.read`). To find a document by number, use `GET {BASE_URL}/api/v1/invoices?invoice_number=INV-2026-000145`.
- **Expected response:** `200 OK` with `state`, `sending_at`, `sent_at`, `delivered_at`, `failure_reason` and `tdd[]` legs (`variant`, `status`, `sla_deadline`, `submitted_at`, `failure_reason`).
- **Expected status transition:** as scenario 1.
- **Pass criteria:** your ERP polls with back-off, stops at a final state, and separates delivery from tax reporting. Delivery is final at `DELIVERED`, `DELIVERED_UNCONFIRMED`, `UNDELIVERABLE` or `C4_UNREACHABLE`.

:::caution[Warning]
`DELIVERED` means the buyer's access point confirmed delivery. It is not acceptance by the Tax Authority. FAWTIR receives no tax verdict from the OTA.
:::

### 21. Transport failure and retry

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

### 22. No downstream answer (RESPONSE_PENDING)

- **Purpose:** prove your ERP does not resend because no answer came.
- **Input:** an invoice that reached `SENT` and received no MLS.
- **Expected response:** the status read keeps showing `state: "SENT"`. After 24 hours the reconciliation report labels it `RESPONSE_PENDING`. That is a label, not a state.
- **Expected status transition:** none. Silence never changes the state.
- **Pass criteria:** your ERP shows "awaiting recipient response" and does **not** resend. <span class="rule rule--fawtir">FAWTIR rule</span>: a document is never resent only because no MLS arrived. FAWTIR bases this on the Peppol Service Provider Operational Guideline on MLS (see [Not yet confirmed](/reference/official-references/#not-yet-confirmed)).

### 23. Reconciliation after a timeout

- **Purpose:** prove a lost response never creates a duplicate.
- **Input:** send scenario 1 and drop the connection before the response arrives.
- **Expected response:** then, in order:
  1. Within 24 hours, resend the same request with the same key: `202` and the stored body if the first attempt was accepted; a fresh outcome if it never arrived or was refused for a reason outside the document; `409 SOURCE_DOCUMENT_ALREADY_REFUSED` if the document itself was refused (fix it and send a new `external_version`); `409 DUPLICATE_IDEMPOTENCY` ("already in progress") if it is still running, in which case wait and repeat.
  2. After 24 hours, resend with a new key and the same `source`: `200`, `source.disposition: "DUPLICATE"` if it was accepted.
  3. Or look it up: `GET {BASE_URL}/api/v1/invoices?invoice_number=INV-2026-000145`.
  4. Daily, read `GET {BASE_URL}/api/v1/erp/source-documents/reconciliation?from=2026-11-10&to=2026-11-11` and act on each label.
- **Expected status transition:** none from the resend.
- **Pass criteria:** exactly one invoice exists for `INV-2026-000145`, and your ERP has its `id`.

## Sign-off record

Keep this record for the [production go-live](/go-live/production/) review.

- [ ] Scenarios 1 to 23 run on TEST, with date, request, response status and code.
- [ ] Each `422` shown to a user with its rule ID or code.
- [ ] No duplicate invoice created by any retry.
- [ ] Polling and daily reconciliation running.
- [ ] Every send to a real participant agreed with FAWTIR in advance.
- [ ] Open issues listed, with the `correlationId` or `X-Fawtir-Trace-Id` of each failing request.
