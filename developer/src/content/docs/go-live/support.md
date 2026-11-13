---
title: "Support and versioning"
description: "This page explains how the FAWTIR API is versioned, how to build a client that keeps working as"
sidebar:
  label: "Support and versioning"
  order: 3
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This page explains how the FAWTIR API is versioned, how to build a client that keeps working as
the API grows, and how to ask FAWTIR for help with the information support needs.

## API version

The version is part of every path: `{BASE_URL}/api/v1/…`. It is the only API version. There is no
version header and no version query parameter.

Ask FAWTIR how breaking changes are announced, how much notice they get, and how long an old
version stays available. Build your client as described below, so additive changes do not break it.

### What may change within v1

FAWTIR adds to the API without changing the version. Examples of additive changes are a new
`code` member on existing error bodies, or a new `field` member naming a missing field. Expect
these kinds of change:

- new members in a response body, including in problem (error) bodies;
- new values of an existing enumeration, such as a status or an error code;
- new endpoints;
- new response headers.

<span class="rule rule--advice">Recommendation</span> build your client so that these do not break it:

- Ignore response members you do not recognise.
- Treat an unrecognised status or error code as "unknown": log it with the correlation id, park the
  document, and alert a person. Do not treat it as success.
- Branch on the HTTP status and the problem `type` slug first, and on `code` or `error` when
  present.
- Do not depend on the order of members in a body, or on the exact wording of `title` and
  `detail`.

Requests are stricter than responses. <span class="rule rule--fawtir">FAWTIR rule</span>: the submission routes refuse unknown
members in the request body. Send only the members documented in the
[API reference](/api/reference/).

:::note
Some changes to platform behaviour are made by FAWTIR in configuration rather than by a
new release. Document submission and webhook sending are switched on for a whole environment;
ERP integration is enabled per organisation. See [Environments](/get-started/environments/) and
[Webhooks](/integrate/webhooks/).
:::

## Getting help

### Where to ask

Use the **Contact support** links in the FAWTIR web app, or the Contact page on the FAWTIR
website.

Ask FAWTIR during onboarding for the support email address and telephone number, the support
hours, and any response-time commitment.

### What to send

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

<span class="rule rule--advice">Recommendation</span> log the correlation id, the invoice id and the HTTP status for every request
your ERP sends, so you can answer support without reproducing the problem.

:::caution[Warning]
Never send a secret to support. That means no API key, no OAuth client secret, no
access or refresh token, no password, and no `X-API-Key` or `Authorization` header in a copied
request. Support can find your request from the correlation id without them. If one has been shared,
revoke or rotate it at once (see [Authentication](/get-started/authentication/)).
:::

Also avoid sending real personal data. If support needs the document, send the request body with
personal details removed, or point to the invoice by its id.

## Related pages

- [Error reference](/reference/errors/): what each refusal means and what to do.
- [Invoice lifecycle](/integrate/lifecycle/): statuses, and which are final.
- [FAQ and glossary](/reference/faq/).
