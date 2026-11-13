---
title: "Invoice corrections"
description: "This page explains how to correct a document after your ERP has pushed it to FAWTIR:"
sidebar:
  label: "Invoice corrections"
  order: 4
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This page explains how to correct a document after your ERP has pushed it to FAWTIR: when to send a credit note or a debit note, which reference fields they need, what FAWTIR checks and what it leaves to your ERP.

## Drafts and issued documents

FAWTIR has drafts only for invoices that people create in the FAWTIR app. A document your ERP pushes over the API never exists as a FAWTIR draft. Your ERP's own draft is the draft: once FAWTIR has accepted the push (`202 Accepted`), the document is issued and queued for delivery.

| | Created in the FAWTIR app | Pushed by your ERP |
|---|---|---|
| Draft stage | Yes. Can be edited or discarded until it is issued. | No. The ERP holds the draft. |
| After issue | Immutable | Immutable |
| How to correct | Correction actions in the FAWTIR app | A credit note or debit note pushed by your ERP |
| Withdraw or edit route | None after issue | None. There is no cancel, edit or delete route for a pushed document. |

<span class="rule rule--fawtir">FAWTIR rule</span> An issued document is never edited. Every correction is a new document that references the original.

## Which document to send

| Situation | Document | Type code | Route | Permission |
|---|---|---|---|---|
| Reduce what the buyer owes: returned goods, overcharge, cancellation | Credit note | `381` | `POST /api/v1/creditnotes` | `creditnote.submit` |
| Increase what the buyer owes: undercharge, extra quantity | Debit note | `383` | `POST /api/v1/debitnotes` | `debitnote.submit` |
| Correct a self-billed invoice | Self-billed credit note | `261` | `POST /api/v1/selfbilling` with `document_kind` `SELF_BILLING_CREDIT_NOTE` | `selfbilling.submit` |

- The type code comes from your mapping (`header.invoiceTypeCode`). <span class="rule rule--fawtir">FAWTIR rule</span>: it must match the route. The invoice route `POST /api/v1/invoices` refuses 381, 383, 261 and 389.
- A credit note is built as a UBL `CreditNote`. A debit note is a UBL `Invoice` with type code 383.
- Each route needs its own certification of your mapping (route `CREDIT_NOTE`, `DEBIT_NOTE` or `SELF_BILLING`), for the transaction type you send. A mapping certified only for invoices cannot send credit notes. See [Data mapping](/api/data-mapping/#certification).
- The Odoo 17 example mapping derives `381` from Odoo's `out_refund` and has no debit-note branch. FAWTIR's own tests certify that example on the invoice route only.

## Required references to the original invoice

Corrections carry the original invoice's identity in the envelope's `supplement`. FAWTIR writes it to `cac:BillingReference/cac:InvoiceDocumentReference`.

| Envelope field | Business term | Content |
|---|---|---|
| `preceding_invoice_number` | IBT-025 | The original's invoice number, exactly as it was sent |
| `preceding_invoice_date` | IBT-026 | The original's issue date, `yyyy-MM-dd` |
| `preceding_invoice_uuid` | BTOM-031 | The original's invoice UUID |
| `credit_note_reason_code` | BTOM-032 | The reason code, from PINT-OM code list CL-02-OM |

**PINT-OM rules IBR-032-OM and IBR-023-OM:** for type codes 381, 383 and 261, the preceding invoice reference, issue date and UUID, and the reason code, must all be present. <span class="rule rule--fawtir">FAWTIR rule</span>: FAWTIR checks that all four are present before it builds the document. If one is missing, the request is refused with `422 SUBMISSION_NOT_SUPPORTED`, and nothing is stored or sent.

The reason codes (PINT-OM code list CL-02-OM):

| Code | Meaning |
|---|---|
| `CAN` | Cancellation or return |
| `VAT` | Change in VAT treatment |
| `VAL` | Change in value |
| `QTY` | Change in quantity |
| `OTH` | Other |

FAWTIR checks that the reason code is present. Whether it is one of these values is checked by the PINT-OM validation, which answers `422 VALIDATION_FAILED` for any other value.

**Where the UUID comes from.** When FAWTIR accepts a document, the `202` response carries `invoice_uuid`. Under PINT-OM 1.0.1 this is the UUID written in the document as `cbc:UUID` (BTOM-002). Store it in your ERP with the invoice, because every later correction needs it. You can also read it again with `GET /api/v1/invoices/{id}`.

<span class="rule rule--fawtir">FAWTIR rule</span> If FAWTIR holds the original invoice (same number and issue year in your company's submissions), `preceding_invoice_uuid` must equal the UUID that invoice was sent with. A different UUID is refused with `422 SUBMISSION_NOT_SUPPORTED`. If the original was never submitted through FAWTIR, FAWTIR has nothing to compare it with, and your ERP is responsible for the value.

:::caution[Warning]
Do not use `instance_uuid` from the `202` response as the preceding UUID. Use `invoice_uuid`.
:::

## Full and partial credit

A credit note can credit the whole original invoice or part of it.

| | Full credit | Partial credit |
|---|---|---|
| Lines | Every line of the original, with the same quantities and amounts | Only the lines, quantities or amounts being credited |
| Typical reason code | `CAN` | `CAN` (return of some items), `QTY`, `VAL` |
| Amounts | Positive, with the same signs as the original | Positive |

<span class="rule rule--pint">PINT-OM rule</span> A credit note keeps the same signs as the original invoice. Amounts are positive (PINT-OM rule IBR-137-OM forbids negative amounts). Do not send a negative invoice instead of a credit note.

Every other rule from [Data mapping](/api/data-mapping/) still applies to a credit note: HS codes on goods lines, VAT categories, item codes and decimals.

## What FAWTIR checks, and what it does not

| Check | Done by FAWTIR? |
|---|---|
| Type code matches the route | Yes |
| All four references present | Yes |
| Preceding UUID matches the original, when FAWTIR sent the original | Yes |
| Reason code is on CL-02-OM | Yes, during PINT-OM validation |
| The whole credit note passes PINT-OM validation | Yes |
| Credit note number not already used | Yes, see [Duplicate prevention](#duplicate-prevention) |
| Original invoice was sent through FAWTIR | No |
| Credit note total does not exceed what is left to credit on the original | **No** |
| Original has not already been fully credited | **No** |
| Credited quantities and lines exist on the original | **No** |

<span class="rule rule--fawtir">FAWTIR rule</span> On the API Push routes there is no credit cap. FAWTIR treats the original as your ERP's own invoice and does not compare a credit note with the original's amounts, lines or state. Several credit notes against the same ERP invoice are all accepted if each one is valid on its own.

:::tip[Recommendation]
Your ERP is responsible for not over-crediting. Before pushing a credit note, check in your ERP that the total credited for the original, including earlier credit notes and debit notes, does not exceed the original's amount, per line and per VAT category. Block the push in your ERP if it would.
:::

### Corrections of invoices created in FAWTIR

If the referenced invoice was created in the FAWTIR app rather than pushed by your ERP, FAWTIR refuses the pushed correction. FAWTIR recognises the original by its UUID, or by its number and issue year. The answer is `422` with code `CORRECTION_ORIGINAL_AUTHORED_USE_CORRECTION_ROUTE`:

```json
{
  "type": "https://api.fawtir.om/problems/submission-not-supported",
  "title": "Submission type not enabled",
  "status": 422,
  "detail": "The document this correction references (INV-2026-000145) was issued in Fawtir, so its corrections are issued there too, where they are counted against it: POST /api/v1/authored-invoices/<authored_invoice_id>/credit-notes. Nothing was recorded or sent.",
  "instance": "/api/v1/creditnotes",
  "timestamp": "2026-11-20T05:30:00Z",
  "error": "CORRECTION_ORIGINAL_AUTHORED_USE_CORRECTION_ROUTE",
  "code": "CORRECTION_ORIGINAL_AUTHORED_USE_CORRECTION_ROUTE",
  "authored_invoice_id": "<authored_invoice_id>",
  "correction_route": "/api/v1/authored-invoices/<authored_invoice_id>/credit-notes",
  "quota_charged": false
}
```

- `correction_route` names the FAWTIR route that takes this kind of correction of that original. It is left out when no route would take it, for example a credit note that names a self-billed invoice. Then check the reference.
- The correction must be issued in FAWTIR, against the original. That is where FAWTIR counts it against the original invoice and applies the credit limit. These routes are not open to API keys.
- Resending the same pushed correction gives the same answer. Do not retry it.
- The example is shortened: a real answer also carries `trace_id` and `correlationId`.

The same refusal applies to debit notes (383) and self-billed credit notes (261) that reference an invoice created in FAWTIR.

## Before and after sending

| When the mistake is found | What to do |
|---|---|
| Before your ERP pushes the invoice | Correct it in your ERP and push the corrected version. FAWTIR has nothing to correct. |
| The push was refused (`4xx`) | Nothing was stored or sent. Fix the data or the mapping and push again. See [Refused, held and resent documents](#refused-held-and-resent-documents). |
| The push was accepted (`202`) | The invoice is issued. Send a credit note, a debit note, or a credit note followed by a new invoice. |
| The invoice was accepted but not delivered | See [Invoice lifecycle](/integrate/lifecycle/). |

:::note
For a wrong buyer, the Oman Tax Authority's Service Provider FAQ describes a credit note followed by a new invoice. That is the only correction scenario the official sources reviewed for this guide describe.
:::

:::note
For an accepted invoice that ends `UNDELIVERABLE` or `C4_UNREACHABLE`, ask FAWTIR whether it needs a credit note and a new invoice number before you correct it.
:::

## Refused, held and resent documents

A refused push creates no invoice and uses no quota. With a `source` block, the refusal is recorded against the source identity, so a fixed document goes under a new `external_version`, except in the held cases below. How you resend depends on whether your request carried a `source` block (`external_document_id` and `external_version`).

| Answer | Meaning | How to resend |
|---|---|---|
| `422 VALIDATION_FAILED`, `MAPPING_FAILED`, `SUBMISSION_NOT_SUPPORTED` | The document or mapping was refused for good, except in the held case below | Fix the cause. With a `source` block, send the corrected document under a **new** `external_version`. |
| `409 SOURCE_DOCUMENT_ALREADY_REFUSED` | The same document, unchanged, was refused before. FAWTIR does not evaluate it again. | Send a corrected document under a new `external_version`. |
| `409 SOURCE_IDENTITY_CONFLICT` | A different document is already recorded under this `external_document_id` and `external_version` | Send it under a new `external_version`. |
| `422 MAPPING_FAILED` because no active mapping exists, or `422 SUBMISSION_NOT_SUPPORTED` because the mapping is not certified | The document is held until the mapping is ready | Once the mapping exists and is certified, the same document under the same `external_version` goes through. |
| `409 SOURCE_DOCUMENT_IN_PROGRESS` | Another request is processing the same document | Retry later with the same request. |
| `409 SALES_APPROVAL_REQUIRED` | Your company's sales approval rule covers this document, and a pushed document cannot be approved | Create it in FAWTIR as a draft, have it approved, then issue it. |

Without a `source` block, fix the document and resend it. A refused request is not stored under its `Idempotency-Key`, so the same key can be used again.

**Example: a missing HS code.** Your ERP pushes an invoice whose goods line has no HS code.

1. FAWTIR answers `422 VALIDATION_FAILED`. The finding names rule IBR-079-OM or IBR-174-OM and the line. Nothing was stored or sent.
2. Add the 12-digit HS code to the item in your ERP, or fix the mapping if the code exists but was not mapped. A code that is not 12 digits is refused as `422 MAPPING_FAILED`. A 12-digit code that is not on the Oman HS list fails rule CL-08-OM-HS.
3. If you changed the mapping, certify it again before pushing.
4. Push the invoice again. If you use a `source` block, raise `external_version`, for example from `1` to `2`. The invoice number stays the same, because no invoice was issued.

:::note
Ask FAWTIR how to correct an invoice that was accepted with a valid but wrong HS code.
:::

Tax Data Documents (TDDs) that the Tax Authority's corner (C5) rejects are resubmitted by a person; see [Invoice lifecycle](/integrate/lifecycle/).

## Duplicate prevention

Corrections are protected against duplicates in the same three ways as invoices:

| Protection | Window | What it stops |
|---|---|---|
| `Idempotency-Key` | 24 hours | A retry of the same request returns the stored answer instead of a second document. Keys are scoped per route, so the same key on `/invoices` and on `/creditnotes` counts as two keys. |
| `source` block | No time limit | The same ERP document pushed again returns `200` with `source.disposition` `DUPLICATE` and the earlier submission. |
| Number and content | No time limit | `409 DUPLICATE_INVOICE` if the number was already used in the same issue year, or the business content is identical to an earlier document. |

<span class="rule rule--fawtir">FAWTIR rule</span> Invoices, credit notes and debit notes share one number space per company and issue year. `CN-2026-000012` cannot be used again for any document in 2026.

:::tip[Recommendation]
Give credit notes and debit notes their own number series in your ERP, and build the `Idempotency-Key` from the document number and version, for example `waha-cn-000012-v1-4b8e1d07`.
:::

## Audit trail

| What FAWTIR records | Where you see it |
|---|---|
| Each accepted document, its state, delivery timestamps and tax data reporting legs | `GET /api/v1/invoices/{id}` and `GET /api/v1/invoices` |
| Each push that carries a `source` block: accepted, duplicate, held, refused, or in conflict | The ERP activity reports in the app |
| Each certification attempt for your mapping | `GET /api/v1/peppol/mapping-profiles/{format}/certification/history` |
| Each refusal because a mapping was not certified | Recorded in FAWTIR's audit records |
| Each saved mapping version | `GET /api/v1/peppol/mapping-profiles` |

A refused push stores no document, so the correction history of an invoice is the set of accepted credit and debit notes that reference it.

:::tip[Recommendation]
In your ERP, keep for each credit or debit note the original invoice number, date and `invoice_uuid`, the reason code, the FAWTIR `id` of the note, and the `Idempotency-Key` you used. FAWTIR does not link pushed corrections to their original for you.
:::

## Example: crediting two returned pipes

All names and numbers are fictitious. Sahil Engineering SAOC returns 2 of the 10 steel pipes invoiced on `INV-2026-000145` (10 November 2026). Al Waha Trading LLC issues credit note `CN-2026-000012` on 20 November 2026.

| | Net | VAT 5% | With VAT |
|---|---|---|---|
| Line 1: 2 × 12.500 | 25.000 | 1.250 | 26.250 |
| Totals as written (2 decimals) | 25.00 | 1.25 | 26.25 |

The request posts the ERP's credit note in the same Odoo-shaped format as the [mapping example](/api/data-mapping/#worked-example-odoo-17). Odoo's `move_type` `out_refund` makes the mapping output type code `381`. The `preceding_invoice_uuid` shown is an example value: use the `invoice_uuid` FAWTIR returned when INV-2026-000145 was accepted.

```http
POST {BASE_URL}/api/v1/creditnotes
X-API-Key: fawt_sk_<your-key>
Idempotency-Key: waha-cn-000012-v1-4b8e1d07
Content-Type: application/json
```

```json
{
  "format": "JSON",
  "document_kind": "CREDIT_NOTE",
  "document": {
    "name": "CN-2026-000012",
    "move_type": "out_refund",
    "invoice_date": "2026-11-20",
    "currency_id": [12, "OMR"],
    "ref": "PO-2026-0381",
    "amount_untaxed": 25.000,
    "amount_tax": 1.250,
    "amount_total": 26.250,
    "company_data": {
      "name": "Al Waha Trading",
      "legal_name": "Al Waha Trading LLC",
      "vat": "OM1999000101",
      "company_registry": "1234567",
      "street": "Al Khuwair",
      "street2": "PO Box 123",
      "city": "Muscat",
      "zip": "133",
      "country_code": "OM",
      "phone": "+96800000000",
      "email": "billing@alwaha.example"
    },
    "partner_data": {
      "name": "Sahil Engineering",
      "legal_name": "Sahil Engineering SAOC",
      "vat": "OM1999000202",
      "street": "Sohar Industrial Area",
      "street2": "Building 7",
      "city": "Sohar",
      "zip": "311",
      "country_code": "OM"
    },
    "invoice_line_ids": [
      {
        "sequence": 1,
        "name": "Steel pipe 2 inch, returned",
        "product_id": [101, "Steel pipe 2 inch"],
        "default_code": "SP-2IN",
        "quantity": 2,
        "x_unece_unit_code": "H87",
        "price_unit": 12.500,
        "price_subtotal": 25.000,
        "x_btom_goods_or_service": "G",
        "x_btom_industrial_classification": "466203",
        "x_btom_service_type": "00000000",
        "x_btom_hs_code": "730630000002",
        "tax_ids": [ { "name": "VAT 5%", "amount": 5.0, "tax_group": "S" } ]
      }
    ]
  },
  "supplement": {
    "issue_time": "09:30:00",
    "transaction_type": "1XXXXXXXXXXXXXXXXXXX",
    "preceding_invoice_number": "INV-2026-000145",
    "preceding_invoice_date": "2026-11-10",
    "preceding_invoice_uuid": "3f6d2a9e-8c41-5b7e-9a12-6c0e4f8b2d17",
    "credit_note_reason_code": "CAN"
  },
  "source": {
    "external_document_id": "ERP-CN-000012",
    "external_version": "1"
  }
}
```

Before this request is accepted:

- your mapping must be certified for format `JSON`, route `CREDIT_NOTE` and the Full Tax Invoice transaction type;
- your ERP must have checked that INV-2026-000145 still has at least 26.250 OMR, and at least 2 pipes, left to credit.

`document_kind` can also be left out on this route. A value other than `CREDIT_NOTE` or `STANDARD_INVOICE` is refused.

## Related pages

- [Data mapping](/api/data-mapping/#references-to-original-invoices): the reference fields
- [Invoice lifecycle](/integrate/lifecycle/): what happens after `202`
- [Error reference](/reference/errors/): every refusal code
