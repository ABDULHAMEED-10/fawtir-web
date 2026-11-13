---
title: "Environments"
description: "This section tells you which FAWTIR environment to point your ERP at, how to build request URLs, and"
sidebar:
  label: "Environments"
  order: 3
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This section tells you which FAWTIR environment to point your ERP at, how to build request URLs, and
what you need from FAWTIR before your requests are accepted.

## TEST and production

| | TEST | Production |
|---|---|---|
| Purpose | Building and testing your integration | Real invoices with legal effect |
| API host | `https://api.fawtir.om` | Ask FAWTIR |
| Peppol network | Ask FAWTIR | Ask FAWTIR |
| Data | Test data only | Your real business data |

:::note
`https://api.fawtir.om` is the TEST environment, not production. Ask FAWTIR for the
production API host when you plan your go-live.
:::

### What TEST is

- The environment where you build the integration, certify your mapping, and run the
  [TEST checklist](/go-live/test-checklist/).
- An environment whose configuration and enabled features FAWTIR may change.
- Before you send from TEST, ask FAWTIR which Peppol network TEST is connected to and which buyer
  participants you may address from it.

### What TEST is not

- It is not production. An invoice sent from TEST is a test document, not a tax invoice you have
  issued.

Ask FAWTIR whether TEST has an availability commitment.

<span class="rule rule--advice">Recommendation</span> use fictitious companies, customers and amounts in TEST, as this guide does.
Never send real customer data or real invoices through TEST. Agree any load test with FAWTIR
first.

## Base URL and request URLs

This guide writes `{BASE_URL}` in every example. Replace it with the host of the environment you
use, for example `https://api.fawtir.om` for TEST. Every API path starts with `/api/v1`:

```text
{BASE_URL}/api/v1/invoices
{BASE_URL}/api/v1/creditnotes
{BASE_URL}/api/v1/auth/token
```

<span class="rule rule--fawtir">FAWTIR rule</span> API-key requests are admitted on exact paths only. Do not add a trailing slash,
a `;` parameter or percent-encoding to the path. `POST {BASE_URL}/api/v1/invoices/` (with the
slash) is refused with `401`.

<span class="rule rule--advice">Recommendation</span> keep the base URL in configuration, not in code, so moving from TEST to
production is a configuration change. Keep separate credentials for each environment, and never
use a production credential in TEST.

Call the API host directly. Ask FAWTIR before you call the API through any other domain.

## Versioning

The API version is part of the path: `/api/v1`. There is no version header and no version query
parameter. See [Support and versioning](/go-live/support/) for what may change within
`v1`.

## How access is granted

Your requests are accepted only when all of these are in place. The first three are done by FAWTIR.

| Step | Who | What happens if it is missing |
|---|---|---|
| Your company is onboarded and its Peppol participant is verified | FAWTIR, with your company | Submissions are refused with `409 TENANT_NOT_OPERATIONAL` while onboarding is unfinished, and a document whose seller is not your company's verified participant is refused. |
| ERP integration is enabled for your company | FAWTIR | The ERP screens say "ERP integration is not enabled"; ERP ingestion keys cannot be created; every push from an ERP ingestion key, and any push or upload with `source`, is refused with `403 erp-entitlement-required`. |
| Document submission is enabled | FAWTIR | The submission routes answer `404`. FAWTIR switches submission on for the whole environment, not per company. |
| Your plan includes API access | Your company's plan | API keys and OAuth clients cannot be created, and existing `GENERAL` keys and OAuth clients are refused (`409 plan-limit-reached`). An existing `ERP_INGESTION` key is not checked against the plan; it needs ERP integration instead. |
| A mapping is certified for the document kind and transaction type | A person in your company | Submissions are refused with `422 SUBMISSION_NOT_SUPPORTED`. |
| A credential exists | A person in your company | Requests are refused with `401`. |

## Moving to production

Ask FAWTIR for the production host, how ERP integration is enabled there, whether your mapping
must be certified again in production, and how go-live is signed off. See
[Production go-live](/go-live/production/).

What you can plan for already:

- New credentials in production. Do not reuse TEST keys or OAuth client secrets.
- Setting up ERP integration, your mapping and its certification in production, unless FAWTIR
  tells you they carry over.
- A configuration change of `{BASE_URL}`, with no code change.
- Passing the [TEST checklist](/go-live/test-checklist/) first.
