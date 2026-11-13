---
title: "Quick start"
description: "This tutorial takes you from an onboarded FAWTIR company to a first invoice pushed from your ERP"
sidebar:
  label: "Quick start"
  order: 2
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This tutorial takes you from an onboarded FAWTIR company to a first invoice pushed from your ERP
and accepted by FAWTIR. It uses API Push, the usual channel. Plan about an afternoon, most of it
on the mapping.

All company names, tax numbers, invoice numbers, identifiers and credentials in this section are
fictitious.

## What you will do

1. Check the prerequisites.
2. Ask FAWTIR to enable ERP integration and document submission.
3. Create a mapping for your ERP's invoice data and certify it.
4. Create an `ERP_INGESTION` API key.
5. Send an invoice with `curl`.
6. Read the `202 Accepted` response.
7. Check the invoice's status.

## 1. Prerequisites

| You need | Why |
|---|---|
| A FAWTIR company account that has finished onboarding | Every document belongs to one company. |
| Your company's Peppol participant verified by FAWTIR | FAWTIR refuses a document whose seller is not your verified participant. |
| A plan that includes API access | API keys can only be created on such a plan. |
| A person who can manage settings (`admin.settings.manage`) | Mappings and API keys are created by a person signed in to the web app. A machine credential cannot create them. |
| Your base URL, `{BASE_URL}` | See [Environments](/get-started/environments/). Use TEST for this tutorial. |
| `curl`, and one exported invoice from your ERP as JSON | To build and test the mapping, then to send. |

## 2. Ask FAWTIR to enable ERP integration and submission

Two switches are FAWTIR's, not yours:

- **ERP integration.** Until FAWTIR enables it, the ERP screens in the web app say "ERP
  integration is not enabled", and ERP ingestion keys cannot be created.
- **Document submission.** Document submission is switched on by FAWTIR for the whole
  environment, not company by company; while it is off, these routes answer 404. Your company must
  also be ready to issue (onboarding finished, Peppol participant verified), or a submission is
  refused with `409`.

Ask FAWTIR to enable ERP integration for your company in TEST, and to confirm that document
submission is on there. See
[Support and versioning](/go-live/support/) for how to reach FAWTIR.

## 3. Create and certify a mapping

FAWTIR does not define a fixed invoice JSON. Your ERP sends its **own** invoice JSON (or XML), and
a mapping that your company owns converts it to FAWTIR's canonical invoice model. Creating and
certifying a mapping is a person's job in the web app.

<span class="rule rule--fawtir">FAWTIR rule</span> a submission is refused until its mapping has passed certification for the kind
of document and the transaction type you send.

### 3.1 Prepare a sample of your ERP's invoice

This tutorial uses an invoice shaped like the Odoo 17 example that FAWTIR provides, filled with the
example data used throughout this guide. Your ERP's JSON will look different. That is expected:
the mapping is what adapts to it.

```json
{
  "name": "INV-2026-000145",
  "move_type": "out_invoice",
  "invoice_date": "2026-11-10",
  "invoice_date_due": "2026-12-10",
  "currency_id": [12, "OMR"],
  "ref": "PO-2026-0381",
  "amount_untaxed": 225.000,
  "amount_tax": 11.250,
  "amount_total": 236.250,
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
      "name": "Steel pipe 2 inch",
      "product_id": [101, "Steel pipe 2 inch"],
      "default_code": "SP-2IN",
      "quantity": 10,
      "x_unece_unit_code": "H87",
      "price_unit": 12.500,
      "price_subtotal": 125.000,
      "x_btom_goods_or_service": "G",
      "x_btom_hs_code": "730630000002",
      "x_btom_industrial_classification": "466203",
      "x_btom_service_type": "00000000",
      "tax_ids": [{ "name": "VAT 5%", "amount": 5.0, "tax_group": "S" }]
    },
    {
      "sequence": 2,
      "name": "Installation service",
      "product_id": [205, "Installation service"],
      "default_code": "SV-INST",
      "quantity": 4,
      "x_unece_unit_code": "HUR",
      "price_unit": 25.000,
      "price_subtotal": 100.000,
      "x_btom_goods_or_service": "S",
      "x_btom_industrial_classification": "432205",
      "x_btom_service_type": "72000000",
      "tax_ids": [{ "name": "VAT 5%", "amount": 5.0, "tax_group": "S" }]
    }
  ]
}
```

The `x_btom_*` and `x_unece_unit_code` fields are custom fields added to the ERP's invoice lines.
A standard ERP does not hold the PINT-OM item codes: the goods-or-services flag (BTOM-019), the
industrial classification (BTOM-033), the service type code, the 12-digit HS code for goods, and
the UN/ECE unit code. A goods line still carries a service type code: `00000000`.

<span class="rule rule--fawtir">FAWTIR rule</span> a line that has a goods-or-services flag but no service type code is refused with
`422 SUBMISSION_NOT_SUPPORTED`.

:::caution[Warning]
Every goods line needs an HS code (<span class="rule rule--pint">PINT-OM rule</span> IBR-079-OM), and the code must
be on the Oman HS code list (<span class="rule rule--pint">PINT-OM rule</span> CL-08-OM-HS). IBR-079-OM exempts Simplified Tax
Invoices, but PINT-OM 1.0.1 as published also contains rule IBR-174-OM, which applies the same
check without the Simplified exemption. Until this is clarified, provide an HS code on every
goods line. <span class="rule rule--fawtir">FAWTIR rule</span>: an HS code that is not exactly 12 digits is refused before
validation, with `422 MAPPING_FAILED`.
:::

Save this JSON as a file, for example `erp-invoice-INV-2026-000145.json`. You use it twice: as
the mapping sample now, and inside the request in step 5.

### 3.2 Open the mapping screens

In the web app, go to **Settings → ERP integration → Mapping**. This opens **ERP mapping**, with
the screens **Overview · Fields · Preview · Certify · Advanced · History · Samples**.

1. Open **Samples** and choose **Upload a sample**. Upload your JSON file (one file, up to
   256 KiB), give it a unique **Label**, and choose **Upload**. Samples are visible to all
   administrators, so remove personal data first.
2. Build the mapping in one of two ways:
   - **Guided:** on **Overview**, choose **Start guided mapping**. On **Fields**, map each business
     term to a path in your sample, then choose **Save**. When every required field is mapped, the
     web app shows "Compiled and activated. Certify next."
   - **Hand-written:** on **Overview**, choose **Upload a hand-written profile**, or open
     **Advanced** (the **Hand-written profile** screen). Paste a JSONata expression into
     **Profile text**, use **Dry-run with this text** to try it against a sample, then choose
     **Save and activate**.

For this tutorial, start from the Odoo 17 example mapping and change the lines block in two
places. The example pins every line's unit to `H87` (piece) and reads no HS code, so this document
adds two line fields, `x_unece_unit_code` and `x_btom_hs_code`, and the mapping must read them:

```text
"unitCode": $l.x_unece_unit_code,
```

and, inside `"item"`:

```text
"itemClassifications": $l.x_btom_hs_code
    ? [ { "code": $l.x_btom_hs_code, "schemeId": "HS" } ],
```

Set `"baseQuantityUnitCode"` in `"price"` the same way as `"unitCode"`. If your ERP holds its
own unit names instead, the mapping needs a lookup from them to UN/ECE Recommendation 20 codes. See
[ERP data mapping](/api/data-mapping/).

### 3.3 Preview

Open **Preview**, choose your sample, and choose **Run preview**. The screen shows "What your ERP
sent" next to "What Fawtir would file". A preview runs the mapping and the canonical model only.
The PINT-OM rules run at certification.

### 3.4 Certify

Open **Certify**. Certification is one test per route (Invoice, Credit note, Debit note,
Self-billing).

1. On the **Invoice** route, choose **Run test invoice**. The dialog is titled **Run test
   invoice · Invoice**.
2. Choose your sample.
3. Under **Transaction type (BTOM-001)**, choose **Full tax invoice**.
4. Enter the **Issue time**, for example `10:15:00`.
5. Choose **Run**.

The run takes a few seconds. A pass shows **Passed** and "This mapping is certified for Invoice at
hash …". A failure lists findings by layer. Fix what they name and choose **Run again**.

:::note
Certification is tied to the exact mapping that runs. When you change the mapping,
every route goes stale and must be certified again before invoices of that kind can be sent.
:::

## 4. Create an ERP_INGESTION API key

1. Go to **Settings → ERP integration → API push** and choose **Create key**.
2. In **Create an ERP ingestion key**:
   - **Name**: say which system uses it, for example `Al Waha ERP test`.
   - **Documents it may send**: **Invoices** is already ticked. Add **Credit notes**, **Debit notes** or
     **Self-billed invoices** only if this system will send them.
   - **Expires on**: leave empty for the default (365 days), or choose a date up to 730 days ahead.
3. Choose **Create key**.
4. **Your new key** shows the key once. Choose **Copy key**, store it in your secret store, then
   choose **I have copied the key**.

The key can submit documents only. It cannot read anything. See
[Authentication](/get-started/authentication/).

:::caution[Warning]
Keep the key on your server. Never put it in a browser, a mobile app, a shared file
or a ticket. If it leaks, revoke it (**Revoke key**) and create a new one.
:::

## 5. Send the invoice

Wrap your ERP's JSON in FAWTIR's request envelope. The ERP document goes in `document` untouched.
The envelope adds what an ERP document does not carry.

Save this as `invoice-INV-2026-000145.json`. It is the same request as in the
[API reference](/api/reference/), and its `document` is the JSON from step 3.1:

```json
{
  "format": "JSON",
  "supplement": {
    "issue_time": "10:15:00",
    "transaction_type": "1XXXXXXXXXXXXXXXXXXX"
  },
  "source": {
    "external_document_id": "ERP-INV-000145",
    "external_version": "1"
  },
  "document": {
    "name": "INV-2026-000145",
    "move_type": "out_invoice",
    "invoice_date": "2026-11-10",
    "invoice_date_due": "2026-12-10",
    "currency_id": [12, "OMR"],
    "ref": "PO-2026-0381",
    "amount_untaxed": 225.000,
    "amount_tax": 11.250,
    "amount_total": 236.250,
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
        "name": "Steel pipe 2 inch",
        "product_id": [101, "Steel pipe 2 inch"],
        "default_code": "SP-2IN",
        "quantity": 10,
        "x_unece_unit_code": "H87",
        "price_unit": 12.500,
        "price_subtotal": 125.000,
        "x_btom_goods_or_service": "G",
        "x_btom_hs_code": "730630000002",
        "x_btom_industrial_classification": "466203",
        "x_btom_service_type": "00000000",
        "tax_ids": [{ "name": "VAT 5%", "amount": 5.0, "tax_group": "S" }]
      },
      {
        "sequence": 2,
        "name": "Installation service",
        "product_id": [205, "Installation service"],
        "default_code": "SV-INST",
        "quantity": 4,
        "x_unece_unit_code": "HUR",
        "price_unit": 25.000,
        "price_subtotal": 100.000,
        "x_btom_goods_or_service": "S",
        "x_btom_industrial_classification": "432205",
        "x_btom_service_type": "72000000",
        "tax_ids": [{ "name": "VAT 5%", "amount": 5.0, "tax_group": "S" }]
      }
    ]
  }
}
```

| Member | Meaning |
|---|---|
| `format` | `JSON`, or `XML` when `document` is a string holding your XML. Defaults to `JSON`. |
| `document_kind` | `STANDARD_INVOICE` on `/api/v1/invoices`. Defaults to `STANDARD_INVOICE`. |
| `document` | Your ERP's own invoice. Your certified mapping reads it. |
| `supplement.issue_time` | The issue time, `HH:mm:ss` (IBT-168). Required. |
| `supplement.transaction_type` | The 20-position transaction type (BTOM-001). Required. |
| `source.external_document_id` | Your ERP's identifier for this document, up to 200 characters. |
| `source.external_version` | Its version, up to 80 characters. Change it when the content changes. |

About `transaction_type`: PINT-OM code list CL-03-OM defines 20 positions, each a flag. Position 1
is Full tax invoice, 2 Simplified tax invoice, 3 Self-billed, 4 Third-party, 5 Summary,
6 Continuous supply, 7 Export, 8 Deemed supply, 9 Import of services (reverse charge), 10 Profit
margin, 11 Profit-margin self-invoice, 12 E-commerce, 13 Import of goods, 14 Special zone supplies,
15 Prepayment, and 16 to 20 are reserved. The specification writes the flags as `1` and `0`.
<span class="rule rule--fawtir">FAWTIR rule</span> send `1` for a set flag and `X` for an unset one; FAWTIR writes `0` in the
e-invoice. A full tax invoice is therefore `1XXXXXXXXXXXXXXXXXXX`.

Unknown members are refused with `400`. The full list of members, including those a credit note
needs, is in the [API reference](/api/reference/).

Send it:

```bash
curl -i -X POST "{BASE_URL}/api/v1/invoices" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: fawt_sk_<your-key>" \
  -H "Idempotency-Key: waha-inv-000145-v1-7f3c9a2e" \
  -H "X-Correlation-Id: 3f1c2a9e-7b4d-4c1a-9e2f-6a8b0c4d2e17" \
  --data @invoice-INV-2026-000145.json
```

| Header | Required | Notes |
|---|---|---|
| `X-API-Key` | Yes | Your `ERP_INGESTION` key. Never send `Authorization` as well. |
| `Idempotency-Key` | Yes | 16 to 128 characters: letters, digits and `.` `_` `:` `-`. One value per submission attempt. Send the **same** value when you retry the same request. |
| `Content-Type` | Yes | `application/json`. |
| `X-Correlation-Id` | No | A UUID of your choice, so you can quote it to support. |

<span class="rule rule--fawtir">FAWTIR rule</span> a request to `/api/v1/invoices` may be up to 4 MiB. The other submission routes,
`/api/v1/creditnotes`, `/api/v1/debitnotes` and `/api/v1/selfbilling`, accept up to 1 MiB. See
[Platform limits](/reference/limits/).

## 6. Read the response

A new, valid document is answered `202 Accepted`:

```http
HTTP/1.1 202 Accepted
Location: /api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB
Content-Type: application/json
X-Correlation-Id: 3f1c2a9e-7b4d-4c1a-9e2f-6a8b0c4d2e17
X-Fawtir-Trace-Id: 3f1c2a9e-7b4d-4c1a-9e2f-6a8b0c4d2e17
```

```json
{
  "id": "invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB",
  "invoice_uuid": "3f6d2a9e-8c41-5b7e-9a12-6c0e4f8b2d17",
  "instance_uuid": "a9c41e07-2b5d-4f63-8e1a-7d3b9c0f5e24",
  "document_kind": "STANDARD_INVOICE",
  "state": "QUEUED",
  "warnings": [],
  "peppol_send": {
    "target_participant": "0248:OM1999000202",
    "status": "queued"
  },
  "tdd": {
    "status": "queued",
    "sla_deadline": "2026-11-10T06:30:04Z"
  },
  "links": {
    "self": "/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB",
    "document": "/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB/document",
    "tdd": "/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB/tdd"
  },
  "validated_at": "2026-11-10T06:15:04Z",
  "source": {
    "external_document_id": "ERP-INV-000145",
    "external_version": "1",
    "disposition": "ACCEPTED"
  }
}
```

What it means:

- The document passed mapping and all five validation layers. Store `id` against your ERP record.
- `state: "QUEUED"`: FAWTIR has queued both the Peppol delivery and the TDD. Nothing has been
  delivered yet.
- `peppol_send.status` and `tdd.status` are always `"queued"` in this response. They do not
  change. The live status is at `links.self`.
- `source.disposition: "ACCEPTED"`: this request created the invoice.

If you send the same `source` identity with the same content again, FAWTIR answers `200 OK` with
`source.disposition: "DUPLICATE"` and describes the earlier submission. No second invoice is
created. A refused document is answered `4xx` with a problem body and creates nothing. See
[Error reference](/reference/errors/).

## 7. Check the status

Status reads need a **Bearer token**, not an API key. An API key cannot read anything. The token
comes from a person signed in to FAWTIR, or from an OAuth client that holds the `invoice.read`
permission. [Authentication](/get-started/authentication/) shows how to register an OAuth client and get
a token.

```bash
curl -s "{BASE_URL}/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB" \
  -H "Authorization: Bearer <access-token>"
```

```json
{
  "id": "invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB",
  "invoice_uuid": "3f6d2a9e-8c41-5b7e-9a12-6c0e4f8b2d17",
  "instance_uuid": "a9c41e07-2b5d-4f63-8e1a-7d3b9c0f5e24",
  "invoice_number": "INV-2026-000145",
  "document_kind": "STANDARD_INVOICE",
  "state": "SENT",
  "b2c": false,
  "receiver": "0248:OM1999000202",
  "warnings": [],
  "received_at": "2026-11-10T06:15:03Z",
  "validated_at": "2026-11-10T06:15:04Z",
  "sending_at": "2026-11-10T06:15:09Z",
  "sent_at": "2026-11-10T06:15:12Z",
  "delivered_at": null,
  "failure_reason": null,
  "tdd": [
    {
      "variant": "SUBMIT",
      "status": "SUBMITTED",
      "sla_deadline": "2026-11-10T06:30:04Z",
      "submitted_at": "2026-11-10T06:16:40Z",
      "failure_reason": null
    }
  ],
  "links": {
    "self": "/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB",
    "document": "/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB/document",
    "tdd": "/api/v1/invoices/invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB/tdd"
  }
}
```

Here `state: "SENT"` means the buyer's access point confirmed receipt of the AS4 message. It is
not yet `DELIVERED`, which needs the buyer access point's positive MLS response. The TDD leg is
`SUBMITTED`: it has been sent to the Tax Authority's corner, and its MLS response has not arrived.
Poll until both reach a final status. The [Invoice lifecycle](/integrate/lifecycle/) section lists
every status and which ones are final.

<span class="rule rule--advice">Recommendation</span> poll with a backoff, for example after 1, 5 and 15 minutes and then hourly,
rather than in a tight loop.

## Next steps

- [Authentication](/get-started/authentication/): key rotation, OAuth clients for status reads, errors.
- [ERP data mapping](/api/data-mapping/): map your real ERP data.
- [Invoice synchronization](/integrate/synchronization/): retries, duplicates and reconciliation.
- [Invoice lifecycle](/integrate/lifecycle/): every status and what is final.
- [TEST checklist](/go-live/test-checklist/): the scenarios to pass before going live.
