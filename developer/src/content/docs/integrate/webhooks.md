---
title: "Webhooks"
description: "This page lets you receive FAWTIR events in your ERP over HTTPS, verify that they come from FAWTIR, and process them safely alongside polling."
sidebar:
  label: "Webhooks"
  order: 5
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This page lets you receive FAWTIR events in your ERP over HTTPS, verify that they come from FAWTIR, and process them safely alongside polling.

All names, numbers and identifiers in the examples on this page are fictitious.

## Position of webhooks

- **Polling is the primary way to learn an outcome.** Read `GET /api/v1/invoices/{id}` and the ERP reports as described in [Invoice synchronization](/integrate/synchronization/#incremental-sync-and-filtering) and [Invoice lifecycle](/integrate/lifecycle/).
- **Webhooks are a secondary, optional channel, available on request.** They are implemented, but sending is off by default and FAWTIR switches it on per deployment. Ask FAWTIR before you rely on them.
- Several changes raise **no** webhook: an invoice being sent, a Tax Data Document (TDD) being submitted, an MLS `AB`, and a Peppol transport failure. Your ERP only learns about those by polling.

:::note
Confirm with FAWTIR during onboarding whether webhook sending is switched on in your environment.
:::

:::caution[Warning]
A webhook is a notification, not a record. FAWTIR does not send events that happened before you registered, does not guarantee order, and stops retrying after 24 hours. Keep polling so that a missed event never leaves an invoice in the wrong state in your ERP.
:::

## Events

`GET /api/v1/webhooks/events` lists the catalogue with an `emitted` flag. Only the events below are sent. Subscribing to an event whose `emitted` flag is `false` is allowed but nothing arrives.

| Event | Sent when | Meaning for your ERP |
|---|---|---|
| `invoice.validated` | FAWTIR accepted your document: it passed the five validation layers and entered dispatch | Submission accepted. **Not** delivered. |
| `invoice.delivered` | The buyer's access point answered with an MLS `AP` | Delivered and confirmed by the receiving access point |
| `invoice.undeliverable` | The buyer's access point answered with an MLS `RE` | The receiving access point refused the invoice. `data.reason_code` is `INVOICE_MLS_REJECTED`, `data.next_step` is `C1_DECISION_REQUIRED`: a person in your organisation must decide what to do. |
| `tdd.accepted` | The Tax Authority's corner (C5) answered the TDD with an MLS `AP` | The TDD was received and accepted as a message. It is **not** an OTA verdict on the invoice. |
| `tdd.rejected` | C5 answered the TDD with an MLS `RE` | The TDD message was refused. `data.reason_code` is `REMOTE_MLS_REJECTED`. See [TDD status](/integrate/lifecycle/#tdd-status). |
| `quota.warning_80`, `quota.warning_90`, `quota.exhausted` | Your monthly document allowance reached 80%, 90% or 100% | Plan for extra documents or the reset date |
| `invoice.rejected` | An invoice issued **in the FAWTIR app** was permanently refused during dispatch | Not sent for API-pushed documents: those are refused in the HTTP answer |
| `dlq.entry` | Dispatch of an invoice issued in the FAWTIR app was dead-lettered | A person must decide |
| `webhook.test` | Someone asked for a test ping | Check your receiver |

Not sent: `invoice.sent`, `tdd.submitted`, `certificate.expiring`. An MLS `AB` (delivered, not confirmed) and a transport failure (`UNDELIVERABLE` after the send attempts ran out) raise no event either.

:::note
The catalogue's `description` texts for `tdd.accepted` and `tdd.rejected` speak of the "tax authority" accepting or rejecting. Read them as above: the MLS answers whether the message was received and processed, and FAWTIR has no OTA verdict to report. See [No OTA verdict](/integrate/lifecycle/#no-ota-verdict).
:::

:::caution[Warning]
`invoice.undeliverable` comes only from an MLS `RE`. In the invoice's own state that is `C4_UNREACHABLE`, not `UNDELIVERABLE`. A transport-level `UNDELIVERABLE` is visible only by polling.
:::

## Payload

Every delivery is a `POST` with this JSON envelope (snake_case):

| Field | Meaning |
|---|---|
| `event_id` | Unique id of the event |
| `event` | Event code, for example `invoice.delivered` |
| `occurred_at` | When the fact happened (ISO-8601, UTC) |
| `tenant_id` | Your organisation's id in FAWTIR |
| `data` | Event-specific fields, below |

Fields in `data`:

| Event | Fields |
|---|---|
| `invoice.validated` | `invoice_uuid`, `document_kind`, `delivers_over_peppol`, `b2c`, `validated_at`, `state` (`VALIDATED`), and, when FAWTIR finds the submission, `invoice_id`, `invoice_number`, `warning_count` |
| `invoice.delivered`, `invoice.undeliverable` | `invoice_uuid`, `mls_code`, `sbdh_instance_identifier`, `message_history_row_id`, `invoice_id`, `invoice_number`, `warning_count`; `invoice.undeliverable` adds `reason_code`, `next_step` |
| `tdd.accepted`, `tdd.rejected` | `invoice_uuid`, `mls_code`, `sbdh_instance_identifier`, `message_history_row_id`; `tdd.rejected` adds `reason_code` |
| `quota.*` | `plan_code`, `used`, `quota`, `usage_percent`, `threshold_percent`, `period_start`, `period_end`, `resets_on`, `days_to_reset`, `overage_enabled`, `issued`, `received`, `extra_documents` |
| `invoice.rejected` | `invoice_id`, `invoice_number`, `reason_code`, and further detail fields |
| `dlq.entry` | `invoice_id`, `invoice_number`, `queue`, `reason_code`, `attempts` |
| `webhook.test` | `endpoint_id`, `requested_by` |

When FAWTIR holds a source record for the invoice (an API Push request with a `source` block, a Managed Pull document or a Bridge Upload), invoice and TDD events also carry `data.source`: `source_kind` (`API_PUSH`, `MANAGED_PULL` or `BRIDGE_UPLOAD`), `connection_id` (Managed Pull only, otherwise `null`), `external_document_id`, `external_version`. Use it to find the document in your ERP. When there is no such record, `data.source` is absent; fall back to `invoice_id` or `invoice_number`.

Example `invoice.delivered` body:

```json
{
  "event_id": "8f2c1d4e-5a6b-4c7d-9e0f-1a2b3c4d5e6f",
  "event": "invoice.delivered",
  "occurred_at": "2026-11-10T06:16:41.512Z",
  "tenant_id": "<your-tenant-id>",
  "data": {
    "invoice_uuid": "<invoice-uuid>",
    "mls_code": "AP",
    "sbdh_instance_identifier": "<sbdh-instance-id>",
    "message_history_row_id": "<row-id>",
    "invoice_id": "invc_01JCQ7Z8K4M2N6P9R3T5V7X9YB",
    "invoice_number": "INV-2026-000145",
    "warning_count": 0,
    "source": {
      "source_kind": "API_PUSH",
      "connection_id": null,
      "external_document_id": "ERP-INV-000145",
      "external_version": "1"
    }
  }
}
```

## Registering an endpoint

Only a **signed-in person** can register, rotate, test or delete an endpoint. The person needs the `webhooks.manage` permission and access to all branches. API keys cannot call the webhook routes at all. An OAuth client holding `webhooks.manage` can only read them (the list, the catalogue, one endpoint and its deliveries).

:::note
Confirm with FAWTIR during onboarding before you build on OAuth read access to the webhook routes.
:::

```http
POST {BASE_URL}/api/v1/webhooks
Content-Type: application/json

{
  "url": "https://erp.alwaha.example.om/fawtir/webhooks",
  "events": ["invoice.validated", "invoice.delivered", "invoice.undeliverable", "tdd.accepted", "tdd.rejected", "webhook.test"],
  "description": "Al Waha ERP status receiver"
}
```

The answer is `201` and includes `secret` (starting `whsec_`). **It is shown once.** Store it in your secret store; FAWTIR cannot show it again.

Rules for the URL (<span class="rule rule--fawtir">FAWTIR rule</span>):

- `https` only, with a public, ASCII host name. No user name or password in the URL, no `#fragment`.
- At most 2048 characters. One endpoint per URL. At most 10 endpoints per organisation (default; may differ per environment).
- FAWTIR does not follow redirects. Answer on the exact URL.

| Route | What it does |
|---|---|
| `GET /api/v1/webhooks` | List your endpoints |
| `GET /api/v1/webhooks/events` | The event catalogue |
| `GET /api/v1/webhooks/{webhookId}` | One endpoint, with counts of pending, delivered, dead-lettered and cancelled deliveries |
| `GET /api/v1/webhooks/{webhookId}/deliveries?limit=50` | Recent deliveries with `status`, `attempts`, `lastStatusCode`, `lastError`, `nextAttemptAt` (at most 200) |
| `POST /api/v1/webhooks/{webhookId}/rotate-secret` | Issue a new secret, shown once |
| `POST /api/v1/webhooks/{webhookId}/test` | Queue a `webhook.test` event; answers `202` with `pingId` |
| `DELETE /api/v1/webhooks/{webhookId}` | Remove the endpoint; answers `204` |

Webhook management responses use camelCase field names; the delivered envelope uses snake_case.

:::note
A test ping is delivered to **every** enabled endpoint of your organisation that subscribes to `webhook.test`, not only to the endpoint you test. The endpoint you test receives nothing if it does not subscribe to `webhook.test`. `data.endpoint_id` says which endpoint the ping was requested for.
:::

## Verifying the signature

Each delivery carries these headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json; charset=UTF-8` |
| `User-Agent` | `Fawtir-Webhooks/1` |
| `X-Fawtir-Event` | Event code |
| `X-Fawtir-Event-Id` | Same as `event_id` |
| `X-Fawtir-Delivery-Id` | Id of this delivery (one per event and endpoint; the same on every retry) |
| `X-Fawtir-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>` |

How the signature is built (<span class="rule rule--fawtir">FAWTIR rule</span>):

1. Take `t` from the header: the time of this attempt in Unix seconds.
2. Build the signed bytes: the ASCII digits of `t`, a `.`, then the **raw request body bytes** exactly as received.
3. Compute HMAC-SHA256 with the key = the UTF-8 bytes of the **whole secret string, including `whsec_`**. Do not Base64-decode it.
4. Compare the lower-case hex result with `v1` in constant time.

<span class="rule rule--advice">Recommendation</span> refuse a delivery whose `t` is more than 5 minutes from your clock, to limit replays. Verify before you parse the JSON: re-serialising the body changes the bytes.

```javascript
// Node.js (Express): keep the raw body for verification.
const crypto = require("crypto");
const express = require("express");
const app = express();

const SECRET = loadSecretFromYourVault(); // the whole whsec_... string

function verify(header, rawBody, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map(p => p.trim().split("=", 2)));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const mac = crypto.createHmac("sha256", Buffer.from(SECRET, "utf8"));
  mac.update(Buffer.from(String(t), "ascii"));
  mac.update(Buffer.from(".", "ascii"));
  mac.update(rawBody);
  const expected = Buffer.from(mac.digest("hex"), "ascii");
  const given = Buffer.from(parts.v1, "ascii");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

app.post("/fawtir/webhooks", express.raw({ type: "application/json" }), (req, res) => {
  if (!verify(req.get("X-Fawtir-Signature") || "", req.body)) return res.sendStatus(401);
  storeForProcessing(req.get("X-Fawtir-Delivery-Id"), JSON.parse(req.body.toString("utf8")));
  res.sendStatus(204); // answer quickly; process later
});
```

```python
import hashlib, hmac, time

def verify(header: str, raw_body: bytes, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.strip().split("=", 1) for p in header.split(",") if "=" in p)
    try:
        t = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode("utf-8"), str(t).encode("ascii") + b"." + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("ascii"), parts.get("v1", "").encode("utf-8"))
```

:::caution[Warning]
Never log the secret or the full signature header, and keep the secret out of source control.
:::

## Delivery and retries

- FAWTIR waits 5 seconds to connect and 5 seconds for the answer. **Only a `2xx` answer counts as delivered.** A `3xx` is a failure, because redirects are not followed.
- After a failure FAWTIR retries after 30 s, 1 min, 2 min, 5 min, 15 min, 30 min and 1 h, then hourly, as long as the attempt falls within 24 hours of the first attempt. After that the delivery is `DEAD_LETTERED` and is not sent again.
- Delivery `status` values: `PENDING`, `DELIVERED`, `DEAD_LETTERED`, `CANCELLED`.
- The body is stored once, so every retry sends **byte-identical** content. The `t` in the signature changes with each attempt.
- An event is only created for endpoints that subscribe to it **at that moment**. Events from before your registration are never sent.

<span class="rule rule--advice">Recommendation</span> answer `2xx` as soon as the signature checks out and you have stored the event, and do the work afterwards. A receiver that takes longer than 5 seconds causes retries of work it already did.

### Rotating the secret

`POST /api/v1/webhooks/{webhookId}/rotate-secret` takes effect immediately. There is no overlap period: every attempt from then on, including retries of older events, is signed with the new secret. Deploy the new secret to your receiver straight away; deliveries that fail meanwhile are retried on the schedule above.

## Duplicates and ordering

- FAWTIR records each fact once (for example, one `invoice.delivered` per invoice), and creates one delivery per event and endpoint.
- Your receiver can still see the same delivery more than once, for example when it processed a request but the answer did not reach FAWTIR.
- **Order is not guaranteed.** A `tdd.accepted` can arrive before `invoice.delivered`, and a retry can arrive after a later event.

**Recommendation: idempotent consumer.**

1. Store `X-Fawtir-Delivery-Id` (or `event_id` if several endpoints feed the same system) with a unique constraint. If it is already stored, answer `2xx` and stop.
2. Do not apply the event's meaning blindly. Read the current state with `GET /api/v1/invoices/{id}` and update your ERP from that answer.
3. Never move an invoice backwards in your ERP because an older event arrived late.

## Reconciliation by polling

Webhooks shorten the time to learn an outcome; they do not replace polling.

1. Keep your normal polling of documents whose outcome is not final (see [Invoice synchronization](/integrate/synchronization/#reconciliation-with-your-erp-reports)).
2. When a webhook arrives, poll that document at once instead of waiting for its turn.
3. Once a day, check `GET /api/v1/webhooks/{webhookId}/deliveries` for `DEAD_LETTERED` deliveries and fix the receiver.

## Webhook errors

All carry the code in `code`; the `type` ends in the same code in lower-kebab case.

| Code | HTTP | Meaning | Action |
|---|---|---|---|
| `WEBHOOK_EVENT_UNKNOWN` | 400 | An event code is not in the catalogue | Use codes from `GET /api/v1/webhooks/events` |
| `WEBHOOK_URL_INVALID` | 400 | Not an absolute `https` URL, contains user info or a fragment, or has a non-ASCII host | Fix the URL |
| `WEBHOOK_URL_UNSAFE` | 400 | The host does not resolve, resolves to a non-public address, or resolves to more than 16 addresses | Use a publicly reachable host |
| `WEBHOOK_NOT_FOUND` | 404 | Unknown endpoint id | Reload the list |
| `WEBHOOK_LIMIT_REACHED` | 409 | Already at the endpoint limit (10 by default) | Delete one |
| `WEBHOOK_URL_EXISTS` | 409 | That URL is already registered | Use the existing endpoint |
| `WEBHOOKS_NOT_CONFIGURED` | 503 | Webhooks are not set up in this FAWTIR environment | Ask FAWTIR; webhooks are available on request |

A missing URL, a URL over 2048 characters, an empty `events` list or a description over 200 characters is refused earlier, by request validation: `400` with type `.../validation-failed`, no `code`, and an `errors` list naming the field.

Authentication and permission errors on these routes are the same as elsewhere; see [Error reference](/reference/errors/#authorisation).
