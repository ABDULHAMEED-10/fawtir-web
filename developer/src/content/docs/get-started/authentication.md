---
title: "Authentication"
description: "This section explains the two machine credentials FAWTIR offers, which one to use for what, how to"
sidebar:
  label: "Authentication"
  order: 5
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This section explains the two machine credentials FAWTIR offers, which one to use for what, how to
create, rotate and revoke them, and the exact errors you get when authentication or authorisation
fails.

All credentials, identifiers and company names in this section are fictitious. Placeholders such as
`fawt_sk_<your-key>` and `<your-client-secret>` stand for real values you never publish.

## Two credentials

| | API key | OAuth client |
|---|---|---|
| Sent as | `X-API-Key: fawt_sk_…` | `Authorization: Bearer <access-token>`, from a `client_credentials` token request |
| Can call | `POST` on exactly four paths: `/api/v1/invoices`, `/api/v1/creditnotes`, `/api/v1/debitnotes`, `/api/v1/selfbilling` | Any `/api/v1` route that the permissions (scopes) it holds allow, with the limits listed under [What an OAuth client can reach](#what-an-oauth-client-can-reach) |
| Can read | Nothing | What its permissions allow, for example invoice status with `invoice.read` |
| Can send `source` (your ERP's document identity) | Yes, with the `ERP_INGESTION` profile | No |
| Created in | The web app (**Settings → ERP integration → API push**) or the API | The API only. The web app has no screen for OAuth clients. |
| Created by | A person signed in to FAWTIR | A person signed in to FAWTIR |

### Which one to use

<span class="rule rule--advice">Recommendation</span> push documents with an `ERP_INGESTION` API key. To read their status, the
platform allows an OAuth client that holds only `invoice.read`.

The reasons: an API key cannot read, so it cannot be used to leak data; on the submission routes
only an `ERP_INGESTION` key can send `source`, which gives you FAWTIR's duplicate protection for your ERP documents; and an
OAuth client with only `invoice.read` cannot submit anything.

## API keys

### Profiles

| Profile | What it may hold | Expiry | Use |
|---|---|---|---|
| `ERP_INGESTION` | Only `invoice.submit`, `creditnote.submit`, `debitnote.submit`, `selfbilling.submit` | Always expires: 365 days by default, at most 730 days | Pushing ERP documents. This is the key the web app creates. |
| `GENERAL` | Permissions a machine may hold, but it can still only call the four `POST` paths | None unless you set one | Older integrations. It cannot send `source`. |

<span class="rule rule--fawtir">FAWTIR rule</span> an `ERP_INGESTION` key that asks for any other permission is refused with `400`:
"An ERP_INGESTION API key may not hold … This profile exists to push documents and is limited to
[…]; issue a separate credential for anything else."

Some permissions can never be held by any machine credential, whatever its profile. These include
every `erp.*` and `mapping.*` permission. Asking for one is refused with `400`: "An API key may
not hold <code>. It is an administrative capability reserved for human operators; assign it to a
role instead."

### Format and header

Send the key in the `X-API-Key` header on every request:

```http
POST /api/v1/invoices HTTP/1.1
Host: <host name from {BASE_URL}, without https://>
X-API-Key: fawt_sk_<your-key>
Idempotency-Key: waha-inv-000145-v1-7f3c9a2e
Content-Type: application/json
```

A key looks like `fawt_sk_<company-id>.<12-character prefix>.<secret>`. Treat the whole string as
opaque. The web app shows the prefix and the last four characters so you can tell keys apart.

### Creating a key

A key is created by a person who can manage settings (`admin.settings.manage`). <span class="rule rule--fawtir">FAWTIR rule</span>:
a machine credential cannot create one; it is refused with `403 human-principal-required`.

In the web app: **Settings → ERP integration → API push → Create key**. The steps are in the
[Quick start](/get-started/quick-start/). The web app always creates `ERP_INGESTION` keys.

Through the API, with a signed-in person's session:

```bash
curl -i -X POST "{BASE_URL}/api/v1/apikeys" \
  -H "Authorization: Bearer <administrator-access-token>" \
  -H "Idempotency-Key: waha-apikey-create-000001" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Al Waha ERP test",
    "profile": "ERP_INGESTION",
    "scopes": ["invoice.submit", "creditnote.submit"],
    "expiresAt": "2027-11-10T00:00:00Z"
  }'
```

| Field | Rule |
|---|---|
| `label` | Required. Name the system that uses the key. |
| `profile` | `ERP_INGESTION` or `GENERAL`. Defaults to `GENERAL` when omitted. |
| `scopes` | Required, at least one. |
| `expiresAt` | Optional. Must be in the future. For `ERP_INGESTION`, at most 730 days ahead; omit it for 365 days. |

The answer is `201 Created` with `Cache-Control: no-store`:

```json
{
  "id": "6b1d4c2e-0f3a-4e8b-9c7d-2a5e8f1b3c90",
  "key": "fawt_sk_<your-key>",
  "prefix": "a1b2c3d4e5f6",
  "label": "Al Waha ERP test",
  "scopes": ["invoice.submit", "creditnote.submit"],
  "expiresAt": "2027-11-10T00:00:00Z",
  "warning": null,
  "profile": "ERP_INGESTION",
  "replacesKeyId": null,
  "previousKeyGraceEndsAt": null
}
```

`key` is shown in this response only. FAWTIR stores a hash and cannot show it again.

Before issuing a key, FAWTIR checks, in this order: that your subscription allows new credentials
(else `409 subscription-restricted`); that your plan includes API access (else
`409 plan-limit-reached`); for `ERP_INGESTION`, that ERP integration is enabled for your company
(else `403 erp-entitlement-required`, "ERP is not enabled for this organization."); then the
permissions and the expiry.

### Rotating a key

Rotation creates a replacement key with the same permissions, profile and expiry (the replacement
of a key that has already expired is given 90 days), and gives the old key a grace period so you
can switch without downtime.

1. In **API push**, choose **Rotate key** on the key. Through the API:
   `POST {BASE_URL}/api/v1/apikeys/{id}/rotate` with an `Idempotency-Key` header.
2. Copy the replacement from **Your replacement key**. The response carries `replacesKeyId` and
   `previousKeyGraceEndsAt`.
3. Deploy the new key to your ERP.
4. Either let the grace period run out, or choose **Complete rotation** to stop the old key now.
   Through the API: `POST {BASE_URL}/api/v1/apikeys/{oldId}/rotation/complete` (`204`).

<span class="rule rule--fawtir">FAWTIR rule</span> the grace period is 24 hours by default and never more than 7 days. A key that
had already expired gets no grace. At most two keys of one rotation chain work at the same time.
A revoked key cannot be rotated (`409`, "A revoked API key cannot be rotated. Issue a new key
instead."), and a key that was already rotated cannot be rotated again (`409`, "This API key has
already been rotated. Rotate its replacement … instead.").

<span class="rule rule--fawtir">FAWTIR rule</span> rotating, completing a rotation and revoking are done by a signed-in person. A
machine credential that tries is refused with `401` and nothing changes.

Rotation does not affect duplicate protection: FAWTIR recognises your documents by your company and
your `source` identity, not by the key that sent them.

### Revoking a key

**Revoke key** in the web app, or `DELETE {BASE_URL}/api/v1/apikeys/{id}` (`204`). The key stops
working at once and cannot be restored. Revoking a key also ends the grace of a key it replaced.

### Key statuses

| Status | Web app label | Authenticates |
|---|---|---|
| `ACTIVE` | Active | Yes |
| `ROTATION_GRACE` | Being replaced | Yes, until the grace ends |
| `ROTATED` | Replaced | No |
| `REVOKED` | Revoked | No |
| `EXPIRED` | Expired | No |

### Checks on every request

Each request with a key is checked again:

1. The key must be valid, unexpired and not revoked, else `401 invalid-api-key`.
2. Your company's subscription must allow API use, else `409 subscription-restricted`.
3. A `GENERAL` key also needs a plan that includes API access, else `409 plan-limit-reached`. The
   key is kept and works again once the plan includes it.
4. An `ERP_INGESTION` key is not checked against the plan's API access. Instead, ERP integration
   must be enabled for your company when it pushes, else `403 erp-entitlement-required`.

Each key may make 600 requests a minute. See [Platform limits](/reference/limits/).

## OAuth clients

### Registering a client

An OAuth client is registered through the API by a person who can manage settings, using their
signed-in session. <span class="rule rule--fawtir">FAWTIR rule</span>: a machine credential cannot register one
(`403 human-principal-required`). The web app has no screen for OAuth clients.

Ask FAWTIR how to register an OAuth client for your company.

```bash
curl -i -X POST "{BASE_URL}/api/v1/auth/clients" \
  -H "Authorization: Bearer <administrator-access-token>" \
  -H "Idempotency-Key: waha-oauth-client-000001" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Al Waha ERP status reader",
    "scopes": ["invoice.read"],
    "bindIp": true,
    "allowedCidrs": ["203.0.113.10/32"]
  }'
```

| Field | Rule |
|---|---|
| `name` | Required. |
| `scopes` | Required, at least one. Permissions reserved for people cannot be granted. |
| `bindIp` | `true` binds tokens to a network (see [IP binding](#ip-binding)). |
| `allowedCidrs` | Optional. Only with `bindIp: true`, else `400` "Allowed IP networks require IP binding to be enabled." |

The answer is `201 Created` with `Cache-Control: no-store`:

```json
{
  "clientId": "fawtir_<tenant>_<id>",
  "clientSecret": "<your-client-secret>",
  "name": "Al Waha ERP status reader",
  "scopes": ["invoice.read"],
  "bindIp": true,
  "allowedCidrs": ["203.0.113.10/32"]
}
```

The secret is shown only in this response. Registration needs the same subscription and plan
checks as an API key: `409 subscription-restricted` or `409 plan-limit-reached` when they fail.

### Getting an access token

`POST {BASE_URL}/api/v1/auth/token` with the `client_credentials` grant. Credentials go in the
body. FAWTIR does not accept them in an `Authorization: Basic` header.

As JSON:

```bash
curl -s -X POST "{BASE_URL}/api/v1/auth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "fawtir_<tenant>_<id>",
    "client_secret": "<your-client-secret>",
    "scope": "invoice.read"
  }'
```

As a form, as in RFC 6749:

```bash
curl -s -X POST "{BASE_URL}/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=fawtir_<tenant>_<id>" \
  --data-urlencode "client_secret=<your-client-secret>" \
  --data-urlencode "scope=invoice.read"
```

`scope` is optional and space-separated. Leave it out to receive every permission the client was
registered with. Asking for one it does not hold is refused with `400` "Requested OAuth scope is
not allowed." Only `client_credentials` is supported; any other `grant_type` is refused with `400`
"Only client_credentials is supported." The JSON body also accepts `grantType`, `clientId` and
`clientSecret`.

The answer is `200 OK` with `Cache-Control: no-store`. Each value appears under two names, the
FAWTIR name and the RFC 6749 name:

```json
{
  "accessToken": "<access-token>",
  "refreshToken": "fawtir_ort_<refresh-token>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshTokenExpiresAt": "2026-11-11T06:00:00Z",
  "scope": "invoice.read",
  "access_token": "<access-token>",
  "refresh_token": "fawtir_ort_<refresh-token>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

The access token lasts 15 minutes (`expires_in: 900`). Send it as
`Authorization: Bearer <access-token>`. It names your company and its permissions, so you never
send a company identifier yourself.

### Refreshing and revoking

- **Refresh.** `POST {BASE_URL}/api/v1/auth/refresh` with `{"refreshToken": "fawtir_ort_<refresh-token>"}`.
  A refresh token lasts 24 hours and can be used once. Reusing a spent refresh token revokes every
  token descended from the same token request. The refresh answer uses FAWTIR names only:
  `accessToken`, `refreshToken`, `tokenType`, `accessTokenIssuedAt`, `accessTokenExpiresAt`,
  `refreshTokenExpiresAt`. It has no `expires_in`.
- **Revoke a token.** `POST {BASE_URL}/api/v1/auth/revoke` with `client_id`, `client_secret` and
  `token` (and optionally `token_type_hint`). The answer is `200` with no body.
- **Rotate the client secret.** `POST {BASE_URL}/api/v1/auth/clients/{clientId}/rotate-secret` with an
  `Idempotency-Key` header. The answer is `200` with `clientId`, `clientSecret`, `name` and
  `scopes`. The new secret replaces the old one at once: there is no grace period, so update your
  ERP straight away. Access tokens already issued keep working until they expire.
- **Disable the client.** `DELETE {BASE_URL}/api/v1/auth/clients/{clientId}` (`204`). This also
  revokes the client's outstanding tokens. Use it, not secret rotation, if the secret may have
  leaked.

<span class="rule rule--fawtir">FAWTIR rule</span> rotating the secret and disabling the client are done by a signed-in person. A
machine credential that tries is refused with `401` and nothing changes.

<span class="rule rule--advice">Recommendation</span> the simplest correct client requests a new token with `client_credentials`
shortly before the current one expires, and does not use refresh tokens at all. Cache the token
for its lifetime; do not request one per call.

### IP binding

When a client is registered with `bindIp: true`:

- with `allowedCidrs`, a token can be requested only from those networks, and is then usable only
  from them;
- without `allowedCidrs`, each token is bound to the network of the host that requested it.

A token used from another network is refused with `401 oauth-client-ip-mismatch`. A token request
from outside `allowedCidrs` is refused with `401 authentication-failed`.

### The plan check

<span class="rule rule--fawtir">FAWTIR rule</span> an OAuth client works only while your plan includes API access and your
subscription allows API use. Both are checked when a token is requested, when it is refreshed, and
on every request. A failure is `409 plan-limit-reached` or `409 subscription-restricted`. The
client is kept and works again once the plan or subscription allows it.

### What an OAuth client can reach

FAWTIR admits a valid OAuth client token on any `/api/v1` route. What it can then do is limited by:

- the permissions it holds: for example `invoice.read` for `GET /api/v1/invoices` and
  `GET /api/v1/invoices/{id}`, and `invoice.submit` for `POST /api/v1/invoices`;
- permissions reserved for people, which it can never hold (every `erp.*` and `mapping.*`
  permission among them);
- operations reserved for a signed-in person, which it is refused with
  `403 human-principal-required`: creating API keys, registering OAuth clients, and changing or
  certifying mappings;
- Bridge Upload, which only a signed-in person can use;
- `source`, which only an `ERP_INGESTION` API key may send. An OAuth client that sends it is
  refused with `422 SUBMISSION_NOT_SUPPORTED`.

<span class="rule rule--advice">Recommendation</span> grant an OAuth client only the permissions it needs. A status reader needs
`invoice.read` and nothing else. Do not grant `admin.settings.manage` to a machine.

## Tenant isolation

Every credential belongs to exactly one company:

- An API key carries its company, and FAWTIR looks it up only in that company.
- An OAuth client, and every token it obtains, belongs to the company that registered it.
- Every read and write runs inside that company only. A request for another company's invoice by
  id is answered as if the invoice did not exist.
- The seller on a pushed document must be your company's verified Peppol participant.

You never send a company identifier, and you cannot choose one.

## Branch access

Documents pushed through the API belong to no branch, and branch invoice-number prefixes do not
apply to them. API keys and OAuth clients are company credentials and are not limited to branches.
A person whose access is limited to some branches is refused when they submit through the API or
Bridge Upload, with `403 branch-not-in-scope`.

## Storing credentials safely

<span class="rule rule--advice">Recommendation</span>

- Keep API keys and client secrets in a secret store or an encrypted configuration, on the server
  that calls FAWTIR. Never in a browser, a mobile app, source control, a shared document or a
  support ticket.
- Use one credential per system and per environment, so you can revoke one without stopping the
  others.
- Set an expiry and rotate before it. FAWTIR keeps nothing but a hash, so a lost key cannot be
  recovered: rotate it.
- Never log the `X-API-Key` or `Authorization` header, a client secret or a token.
- Use IP binding for OAuth clients when your ERP calls from fixed addresses.

## Correlation headers

Send `X-Correlation-Id` with a UUID you generate, one per request. FAWTIR uses it in its logs and
returns it:

| Header | Set by | Value |
|---|---|---|
| `X-Correlation-Id` (response) | FAWTIR's edge | Your value if it is a well-formed UUID; otherwise an id FAWTIR generates |
| `X-Fawtir-Trace-Id` (response) | FAWTIR's API | The same value as above for requests that reach the API |

Most problem bodies from the API also carry `correlationId`, and the submission routes add
`trace_id` with the same value.

Refusals written before your request reaches the API carry no correlation member in the body.
These are `401 unauthenticated` with `code: UNAUTHENTICATED`, `401 invalid-api-key`,
`401 oauth-client-ip-mismatch`, `400 ambiguous-credentials`, the `409` refusals of a request made
with a key or token (see the table below), and `413` and `429` refusals. Some of them, such as
`413` and `429` from the edge, carry no correlation header either. Record your own
`X-Correlation-Id` so you always have it.

## Authentication and authorisation errors

Problem bodies use `application/problem+json`. The `type` is always
`https://api.fawtir.om/problems/<slug>`. Only some bodies carry a machine-readable `code`. Branch on
`status` and the `type` slug, and use `code` when it is present.

| Status and `type` slug | `title` | `code` | When |
|---|---|---|---|
| `401 unauthenticated` | Authentication required | `UNAUTHENTICATED` | No credential, an invalid or expired access token, or an API key sent to a path that does not accept API keys |
| `401 invalid-api-key` | API key rejected | `INVALID_API_KEY` | The API key is unknown, expired or revoked |
| `401 authentication-failed` | Authentication rejected | none | Wrong client id or secret at `/auth/token`, a token request from outside `allowedCidrs`, a disabled client, an invalid refresh token |
| `401 unauthenticated` | Authentication rejected | none | `/auth/refresh` called with no refresh token |
| `401 oauth-client-ip-mismatch` | OAuth client IP rejected | none | An IP-bound token used from another network |
| `400 ambiguous-credentials` | Ambiguous credentials | none | Both `Authorization` and `X-API-Key` were sent |
| `400 malformed-request` | Malformed request | `MALFORMED_REQUEST` | The body is not valid JSON, or has an unknown member |
| `403 insufficient-permission` | Access denied | none | The credential lacks the route's permission. `detail` names it, for example "Missing required permission: invoice.read" |
| `403 human-principal-required` | Access denied | none | A machine credential called an operation reserved for a person |
| `403 erp-entitlement-required` | Access denied | none | ERP integration is not enabled for your company |
| `403 branch-not-in-scope` | Access denied | none | A person limited to some branches submitted through the API |
| `409 plan-limit-reached` | API not included in the plan | none | On a request with a `GENERAL` key or an OAuth client token, when the plan does not include API access |
| `409 plan-limit-reached` | Conflict | none | On creating a key, registering a client, or requesting or refreshing a token, when the plan does not include API access |
| `409 subscription-restricted` | Conflict | `SUBSCRIPTION_SUSPENDED`, `SUBSCRIPTION_CANCELLED` or `SUBSCRIPTION_NOT_STARTED` | The subscription is read-only. The body also has `action`, for example `USE_API` |

There are two `401 unauthenticated` bodies with `code: UNAUTHENTICATED`. The one from FAWTIR's
edge is exactly this, with no other members:

```json
{
  "type": "https://api.fawtir.om/problems/unauthenticated",
  "title": "Authentication required",
  "status": 401,
  "detail": "The access token is missing, invalid, expired, or its session is inactive.",
  "code": "UNAUTHENTICATED"
}
```

The same refusal from the API itself has the same members plus `instance` and `timestamp`. Do not
rely on either being present.

An invalid API key:

```json
{
  "type": "https://api.fawtir.om/problems/invalid-api-key",
  "title": "API key rejected",
  "status": 401,
  "detail": "The API key is invalid, expired, or revoked.",
  "instance": "/api/v1/invoices",
  "timestamp": "2026-11-10T06:16:01.902Z",
  "code": "INVALID_API_KEY"
}
```

A rejected token request, with no `code`:

```json
{
  "type": "https://api.fawtir.om/problems/authentication-failed",
  "title": "Authentication rejected",
  "status": 401,
  "detail": "The request could not be authenticated.",
  "instance": "/api/v1/auth/token",
  "timestamp": "2026-11-10T06:20:00.000Z",
  "correlationId": "3f1c2a9e-7b4d-4c1a-9e2f-6a8b0c4d2e17"
}
```

Both credentials at once, with no `code`:

```json
{
  "type": "https://api.fawtir.om/problems/ambiguous-credentials",
  "title": "Ambiguous credentials",
  "status": 400,
  "detail": "Send either a Bearer token or an API key, not both.",
  "instance": "/api/v1/invoices",
  "timestamp": "2026-11-10T06:16:01.902Z"
}
```

A `GENERAL` key or OAuth client on a plan without API access, with no `code`:

```json
{
  "type": "https://api.fawtir.om/problems/plan-limit-reached",
  "title": "API not included in the plan",
  "status": 409,
  "detail": "This company's plan does not include API access. The API key is kept and works again once the company moves to a plan that includes it.",
  "instance": "/api/v1/invoices",
  "timestamp": "2026-11-10T06:16:01.902Z"
}
```

For an OAuth client the detail says "The OAuth client is kept" instead.

<span class="rule rule--advice">Recommendation</span> on `401`, do not retry with the same credential: fix or replace it. On `409`
for the plan or subscription, stop sending and alert a person; nothing is wrong with your request.
Every other refusal on the submission routes is in the [Error reference](/reference/errors/).
