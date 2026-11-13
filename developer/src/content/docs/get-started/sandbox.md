---
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
title: "Sandbox (TEST)"
description: "Where you build and test your integration before production: what the TEST environment is, how you get access, and what to ask FAWTIR first."
sidebar:
  label: "Sandbox (TEST)"
  order: 4
---

FAWTIR's sandbox is the **TEST environment**. It is where you build your integration, certify your mapping and run the [TEST checklist](/go-live/test-checklist/) before you go live. This page brings together everything about TEST in one place; the details live on the pages it links to.

All company names, tax numbers and credentials in this guide are fictitious.

## At a glance

| | TEST (sandbox) | Production |
|---|---|---|
| Purpose | Building and testing your integration | Real invoices with legal effect |
| API host | `https://api.fawtir.om` | Ask FAWTIR |
| Paths | `{BASE_URL}/api/v1/...` | `{BASE_URL}/api/v1/...` |
| Data | Test data only | Your real business data |
| Credentials | Their own API keys and OAuth clients | New ones; never reuse TEST credentials |
| Peppol network | Ask FAWTIR | Ask FAWTIR |

:::caution[Warning]
TEST is not a closed playground. A document accepted on TEST may be transmitted over Peppol to the buyer's access point, and FAWTIR also queues a Tax Data Document for the Tax Authority's corner. The receiver is taken from the buyer's endpoint, `0248:` plus the buyer's VAT number, so a real VAT number as the buyer can address a real company. Ask FAWTIR before you send any document addressed to a real company.
:::

## What TEST is, and is not

- TEST is where you build the integration, certify your mapping and run the [TEST checklist](/go-live/test-checklist/).
- FAWTIR may change TEST's configuration and the features switched on there.
- An invoice sent from TEST is a test document, not a tax invoice you have issued.
- Passing the TEST checklist is **not** Peppol certification and **not** approval by the Oman Tax Authority. It shows that your integration behaves correctly against FAWTIR.

## Getting access

Your requests are accepted only when all of these are in place. The first three are done by FAWTIR; see [How access is granted](/get-started/environments/#how-access-is-granted).

1. Your company is onboarded on TEST and its Peppol participant is verified by FAWTIR.
2. ERP integration is enabled for your company. Until it is, the ERP screens in the web app say "ERP integration is not enabled" and ERP ingestion keys cannot be created.
3. Document submission is switched on. FAWTIR switches it on for the whole environment, not company by company; while it is off, the submission routes and the invoice status reads answer `404`.
4. Your plan includes API access.
5. A person in your company certifies a mapping for each document kind and transaction type you send. See the [Quick start](/get-started/quick-start/).
6. A person in your company creates the credentials: an `ERP_INGESTION` API key to push, and an OAuth client holding `invoice.read` to read status. See [Authentication](/get-started/authentication/).

Where submission is on but your company is not ready to issue, submissions are refused with `409`, `error: TENANT_NOT_OPERATIONAL`. Where TEST has no Peppol transport configured, submissions are refused with `503` and the code `OUTBOUND_TRANSPORT_UNAVAILABLE`.

## Ask FAWTIR before your first send

| Question | Why it matters |
|---|---|
| Is ERP integration enabled for our company in TEST, and is document submission on? | Without both, ingestion keys cannot be created and submissions answer `403` or `404`. |
| Which Peppol network is TEST connected to, and is outbound sending switched on? | It decides whether an accepted invoice actually travels over Peppol. |
| Which buyer participant identifiers may we use for TEST invoices? | Only those: a real VAT number as the buyer can address a real company. |
| Is automatic collection for Managed Pull available to us? | It is switched on by FAWTIR. See [ERP connector](/integrate/managed-pull/). |
| Is webhook sending switched on in TEST? | Webhooks are available on request and off by default. See [Webhooks](/integrate/webhooks/). |
| Does TEST have an availability commitment? | Plan your test runs around it. |
| Which limits apply on TEST? | Values marked "may differ per environment" are deployment settings. See [Platform limits](/reference/limits/). |

:::tip[Recommendation]
Use only the buyer identifiers FAWTIR gives you for testing, and agree a test plan with FAWTIR before your first send. Agree any load test with FAWTIR first.
:::

## Good habits on TEST

- Use fictitious companies, customers and amounts, as this guide does. Never send real customer data or real invoices through TEST.
- Keep the base URL in configuration, not in code, so moving from TEST to production is a configuration change.
- Keep separate credentials for each environment, and never use a production credential in TEST.
- Give each test scenario its own `source.external_document_id`, so a repeated scenario is not refused as a conflict. The [TEST checklist](/go-live/test-checklist/) does this for you.
- FAWTIR can reserve invoice numbers for controlled test windows. A submission that uses a reserved number is refused with `409 OUTBOUND_WINDOW_INVOICE_RESERVED`; try it again later.

## Next steps

- [Quick start](/get-started/quick-start/): send your first test invoice.
- [TEST checklist](/go-live/test-checklist/): the scenarios to pass before you go live.
- [Production go-live](/go-live/production/): moving from TEST to production safely.
