---
title: "FAQ and glossary"
description: "This page answers the questions ERP developers ask most often and defines the terms used across this guide."
sidebar:
  label: "FAQ and glossary"
  order: 4
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This page answers the questions ERP developers ask most often and defines the terms used across this guide. Each answer links to the page with the detail.

## Frequently asked questions

### Do I have to create my customers in FAWTIR?

No. With API Push, the buyer's details come from your own invoice document through your mapping. Map the buyer's endpoint (scheme `0248`, value the buyer's VAT number), as the example mappings do. If the document has no buyer endpoint, FAWTIR looks for a matching customer by VAT number in its customer records, and otherwise applies the Tax Authority's substitute rules. See [Data mapping](/api/data-mapping/).

### Can I edit an invoice after sending it?

No. Once FAWTIR has accepted a document (`202`), it cannot be changed or deleted. Correct it with a credit note or a debit note. Resending changed content under the same `external_document_id` and `external_version` is refused with `409 SOURCE_IDENTITY_CONFLICT`. A new `external_version` helps only when the earlier version was refused. See [Invoice corrections](/integrate/corrections/).

### What happens if my request times out?

You do not know whether the document was accepted, so resend the **same** request with the **same** `Idempotency-Key` within 24 hours. If it was accepted, you get the stored `202` response and no second invoice. After 24 hours, resend with a new key and the same `source`. An accepted document then answers `200` with `source.disposition: "DUPLICATE"`. See [Invoice synchronization](/integrate/synchronization/).

### Is there a connector, agent or SDK I can install?

No. There is no installable connector, agent or SDK for ERP integration. There are three channels: API Push (your ERP calls FAWTIR's API), Managed Pull (FAWTIR collects from your ERP's REST endpoint) and Bridge Upload (a person uploads one document in the FAWTIR web app). See [ERP connector](/integrate/managed-pull/).

### Which ERP systems are supported?

FAWTIR does not certify named ERP products. Any ERP that can produce its invoices as JSON or XML and make HTTPS calls can use API Push. Managed Pull needs an ERP endpoint that returns JSON over HTTPS. Example mappings for Odoo 17 and Oracle Fusion invoice exports are available. Their sample data is representative, not taken from a live system. See [Data mapping](/api/data-mapping/).

### Does a Peppol delivery mean the Tax Authority accepted my invoice?

No. `DELIVERED` means the buyer's access point confirmed delivery. Tax reporting is a separate leg: FAWTIR sends a Tax Data Document (TDD) to the Tax Authority's corner (C5) over Peppol. A TDD status of `ACCEPTED` means C5 returned a positive message-level status. FAWTIR receives no tax verdict from the Oman Tax Authority, and there is no direct OTA API. See [Invoice lifecycle](/integrate/lifecycle/).

### How do I find out what happened to an invoice?

Poll `GET /api/v1/invoices/{id}` with a Bearer token holding `invoice.read`: a signed-in user, or an OAuth client, which the platform allows. Polling is the primary way to learn an outcome. API keys cannot read anything, so you need a separate read credential. Confirm with FAWTIR during onboarding which one to use. See [Invoice lifecycle](/integrate/lifecycle/).

### Do you support webhooks?

Webhooks are available on request. FAWTIR enables sending per deployment. They are optional and do not replace polling, because some events raise no webhook: sent, TDD submitted, an AB answer, and transport failure. The events that are raised include `invoice.validated`, `invoice.delivered`, `invoice.undeliverable` (recipient refusal only), `tdd.accepted`, `tdd.rejected` and `webhook.test`. See [Webhooks](/integrate/webhooks/).

### Why does my simplified invoice need an HS code?

<span class="rule rule--pint">PINT-OM rule</span> IBR-079-OM exempts Simplified Tax Invoices from the HS code. PINT-OM 1.0.1 as published also contains rule IBR-174-OM, which applies the same check without the Simplified exemption. Until this is clarified, provide an HS code on every goods line. See [Data mapping](/api/data-mapping/).

### What format must the HS code have?

Exactly 12 digits, from the Oman HS code list (**PINT-OM rules** IBR-080-OM and CL-08-OM-HS). A code that is not 12 digits is refused before validation with `422 MAPPING_FAILED`. A 12-digit code that is not on the list fails validation with rule CL-08-OM-HS. See [Error reference](/reference/errors/).

### Why is my transaction type refused?

`transaction_type` is a 20-character string of `X` and `1`. Each position is one transaction type: position 1 Full Tax Invoice, position 2 Simplified Tax Invoice, and so on. Send `X`, not `0`, for "not this type". FAWTIR writes `X` as `0` in the Peppol document. See [API reference](/api/reference/).

### Can I send JSON or XML? What about CSV?

JSON or XML. XML travels as a JSON string in `document`. CSV and EDIFACT are refused with `422 SUBMISSION_NOT_SUPPORTED`. See [API reference](/api/reference/).

### Can I send several invoices in one request?

Not with an API key. An API key can call only the four single-document routes: `POST /api/v1/invoices`, `/creditnotes`, `/debitnotes` and `/selfbilling`. See [Platform limits](/reference/limits/).

### How many decimals should amounts have?

Line amounts take up to 3 decimals (1 baisa = 0.001 OMR; <span class="rule rule--pint">PINT-OM rule</span> IBR-DEC-03-OM). Document totals take 2 decimals (**PINT-OM rules** ibr-091 and ibr-121 to ibr-125). See [Data mapping](/api/data-mapping/).

### Does FAWTIR stop me crediting more than the original invoice?

<span class="rule rule--fawtir">FAWTIR rule</span> not for documents pushed from your ERP. FAWTIR checks that the credit note names the original invoice correctly, but not its amount. Your ERP must enforce the limit. See [Invoice corrections](/integrate/corrections/).

### Should I resend an invoice that has had no answer for a day?

No. After 24 hours without a recipient answer, the reconciliation report labels the invoice `RESPONSE_PENDING`, and it stays `SENT`. Resending only because no answer arrived is not allowed. See [Invoice lifecycle](/integrate/lifecycle/).

### Do my FAWTIR branches and their invoice prefixes apply?

No. A document pushed through the API belongs to no branch, and your ERP's invoice number is used exactly as sent. Branch prefixes apply only to invoices created in the FAWTIR app. See [API reference](/api/reference/).

### Does passing the test checklist mean I am certified?

No. The [Test checklist](/go-live/test-checklist/) shows that your integration behaves correctly against FAWTIR. It is not Peppol certification and not approval by the Oman Tax Authority. Production access needs FAWTIR's explicit approval. See [Production go-live](/go-live/production/).

## Glossary

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
| **VATIN** | VAT identification number. In Oman: `OM` followed by 10 digits, for example `OM1999000101` (<span class="rule rule--pint">PINT-OM rule</span> IBR-003-OM). |
| **XSLT** | The XML transformation language (version 3.0) FAWTIR uses to map an ERP's XML document. |
