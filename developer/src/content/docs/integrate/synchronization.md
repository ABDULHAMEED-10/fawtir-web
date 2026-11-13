---
title: "Invoice synchronization"
description: "This page explains how to move invoices from your ERP into FAWTIR so that each document is issued exactly once, even when requests time out or are retried."
sidebar:
  label: "Invoice synchronization"
  order: 1
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This page explains how to move invoices from your ERP into FAWTIR so that each document is issued exactly once, even when requests time out or are retried. It covers the three channels, what FAWTIR guarantees, and how to design the ERP side.

FAWTIR has three channels. There is no installable connector, agent or SDK for any of them.

| Channel | Who starts the transfer | Who calls whom | Documents | Details |
|---|---|---|---|---|
| **API Push** | Your ERP | Your ERP calls FAWTIR's REST API | Invoices, credit notes, debit notes, self-billed documents | [API Push](#api-push) |
| **Managed Pull** | FAWTIR, on a schedule | FAWTIR calls your ERP's REST API | Tax invoices only | [Managed Pull](#managed-pull), [ERP connector](/integrate/managed-pull/) |
| **Bridge Upload** | A person in the FAWTIR app | The person uploads one file | Tax invoices only | [Bridge Upload](#bridge-upload) |

Document submission is switched on by FAWTIR for a whole environment; which routes answer `404` while it is off is listed in the [API reference](/api/reference/#endpoint-inventory). Where it is on, an organisation that is not yet ready to issue is refused with `409 TENANT_NOT_OPERATIONAL`.

All names, numbers and identifiers in the examples on this page are fictitious.

## Terms used on this page

| Term | Meaning |
|---|---|
| **Source identity** | The pair `external_document_id` + `external_version` that names a document in your ERP's own terms. |
| **Source ledger** | FAWTIR's permanent record of every source identity it has received, and what became of it. |
| **Content fingerprint** | A hash FAWTIR computes over the request so it can tell "the same document again" from "a different document under the same identity". |
| **Idempotency-Key** | A header you send on every submission. FAWTIR keeps the answer to a successful request under that key for 24 hours. |

## API Push

### FAWTIR behaviour

**Routes.** Your ERP sends one document per request with `POST` to one of four routes: `/api/v1/invoices`, `/api/v1/creditnotes`, `/api/v1/debitnotes` or `/api/v1/selfbilling`. The request and response fields are in the [API reference](/api/reference/). How to authenticate is in [Authentication](/get-started/authentication/).

**Two layers of duplicate protection (FAWTIR rule).** They work together and have different lifetimes.

| Layer | What it is keyed on | How long it lasts | What it protects against |
|---|---|---|---|
| `Idempotency-Key` header | Your organisation, the route, the document kind and the key value | 24 hours, and only for a request that succeeded | The same HTTP request arriving twice, for example after a timeout |
| Source ledger (`source` block) | Your organisation, the channel, `external_document_id`, `external_version` | Permanent | The same ERP document being issued twice, at any time, even with a new key or a rotated API key |

The source ledger applies only when the request carries a `source` block, and only an API key created with the **ERP ingestion** profile may send one. A push without `source` is protected by the `Idempotency-Key` and by FAWTIR's invoice-number check (see [Duplicate submission](/reference/errors/#duplicate-submission)), but it does not appear in the ERP activity reports.

:::note
The source identity belongs to your organisation, not to the API key. Rotating or replacing the key does not reset it. Everything that pushes into one organisation shares one namespace, so two systems that reuse the same `external_document_id` for different documents will collide.
:::

**The content fingerprint (FAWTIR rule).** When a request names a source identity that FAWTIR has seen, FAWTIR compares fingerprints. The fingerprint covers:

- the route and `document_kind`;
- `format`;
- every `supplement` field (`issue_time`, `transaction_type`, the `preceding_invoice_*` fields, `credit_note_reason_code`, `profit_margin`);
- `receiver_override`;
- the `document` itself.

Whitespace between JSON tokens in `document` does not change the fingerprint; an XML `document` is taken exactly as sent, whitespace included. **Key order does**: if your ERP serialises the same invoice with its JSON keys in a different order, FAWTIR sees different content. Produce `document` with a stable serialiser.

**Outcomes for a pushed document with a `source` block.**

| What FAWTIR finds | HTTP status | Body field | What happened |
|---|---|---|---|
| A new source identity, and the document is valid | `202 Accepted` | `source.disposition: "ACCEPTED"` | The invoice was created and queued. |
| The same identity with the same content, already accepted | `200 OK` | `source.disposition: "DUPLICATE"` | Nothing new was created. The body describes the earlier submission, with its current `state`. |
| The same identity with different content | `409` | `error: "SOURCE_IDENTITY_CONFLICT"` | Nothing was created. |
| The same identity and content were refused before | `409` | `error: "SOURCE_DOCUMENT_ALREADY_REFUSED"` plus `earlier_outcome` | Nothing was created. The earlier refusal is final for this identity. |
| Another request is working on this identity now, or an interrupted attempt has not been resolved yet | `409` | `error: "SOURCE_DOCUMENT_IN_PROGRESS"` | Nothing was created. |
| The document itself is refused (validation, mapping, and so on) | `4xx` | The refusal's own code | The refusal is recorded against the identity. |

Both `202` and `200` carry a `Location` header that points to the submission (`/api/v1/invoices/{id}`). In both, `peppol_send.status` and `tdd.status` are fixed receipt values (`"queued"`); they are not the live status. See [Invoice lifecycle](/integrate/lifecycle/).

A push refused for a reason outside the document is the exception: the record stays retryable, and the same document under the same version goes through once the cause is gone. This covers your mapping not being ready (no active mapping, or not certified), your Peppol participant not being verified, the document allowance being used up, your organisation or subscription not allowing issuing, and temporary platform conditions such as `MAPPING_CAPACITY_UNAVAILABLE`, `OUTBOUND_WINDOW_INVOICE_RESERVED`, `OUTBOUND_TRANSPORT_UNAVAILABLE`, `EMISSION_BLOCKED` and `VALIDATION_UNAVAILABLE`.

:::note
Platform faults such as `EMISSION_BLOCKED` and `VALIDATION_UNAVAILABLE` count against a budget of 5 attempts per source identity, as in Managed Pull; the other reasons above do not. Once the 5 are spent, a resend of that identity is answered `409 SOURCE_DOCUMENT_ALREADY_REFUSED` with `earlier_outcome: "ATTEMPTS_EXHAUSTED"`. Send the document under a new `external_version` once the platform has recovered.
:::

**Choosing `external_document_id` and `external_version`.**

| Field | Rules (FAWTIR rule) | Recommendation |
|---|---|---|
| `external_document_id` | Required inside `source`, up to 200 characters | Use your ERP's own, permanent identifier for the document, for example `ERP-INV-000145`. It must not change when the document is corrected. |
| `external_version` | Optional, up to 80 characters. Blank counts as absent. | Start at `1`. Increase it whenever the content you send changes, for example after you fix a document that FAWTIR refused. |

:::caution[Warning]
A new `external_version` is for re-sending a document that FAWTIR **refused**. Once FAWTIR has accepted an invoice, changing it is a credit note or a debit note, not a new version. A new version of an accepted invoice with the same invoice number is refused as `DUPLICATE_INVOICE`. See [Invoice corrections](/integrate/corrections/).
:::

**The `Idempotency-Key` header (FAWTIR rule).**

- Required on every submission. Missing: `400 validation-failed`.
- 16 to 128 characters from `A-Z a-z 0-9 . _ : -`. Otherwise: `400 INVALID_IDEMPOTENCY_KEY`.
- Scoped to your organisation, the route and the document kind. The same value on `/invoices` and on `/creditnotes` counts as two different keys.
- Only a **successful** answer is stored, for 24 hours. A repeat of the same request with the same key within that time returns the stored answer, and nothing is processed again.
- A refused request (any `4xx` or `5xx`) stores nothing under the key. The same key can be used again. With a `source` block, the refusal is still recorded against the source identity (see the outcomes table above).
- The same key with a different body, after a successful use, is refused with `409 DUPLICATE_IDEMPOTENCY`.
- While a request with a key is still being processed, a second request with the same key is also refused with `409 DUPLICATE_IDEMPOTENCY`, and the message says to retry shortly. The two cases share one code; only the `detail` text differs.

### Recommended ERP design

1. **Keep an outbox in the ERP.** Write one outbox row per document version you intend to send, in the same database transaction that finalises the document in the ERP. Send from the outbox, never from the user's click.
2. **Always send a `source` block** (this needs an API key with the ERP ingestion profile). It is the only protection that outlives 24 hours.
3. **Derive the Idempotency-Key from the source identity**, and store it on the outbox row before the first attempt. For example `waha-inv-000145-v1-7f3c9a2e`: organisation prefix, document, version, and a random suffix created once. Every retry of that row reuses the stored key. A new version gets a new key.
4. **Never generate a new invoice number to work around an error.** The invoice number is a legal identifier. If a request failed or its outcome is unknown, resend the same document.
5. **Record what FAWTIR returned**: `id` (the `invc_…` submission id), `invoice_uuid`, and the `Location` header. You need them to poll the status and to reconcile.
6. **Serialise `document` deterministically** (stable key order), so a retry produces the same fingerprint.

## Network timeouts and unknown outcomes

If your request times out, the connection drops, or you receive a `5xx` without a FAWTIR problem body, you do not know whether FAWTIR created the invoice.

**What to do: resend the same request, with the same `Idempotency-Key` and the same source identity.** Do not change any data. Do not assign a new invoice number. Do not create a new key.

What FAWTIR does with that resend:

| What happened to the first request | What the resend gets |
|---|---|
| It succeeded, less than 24 hours ago | The stored answer (`202` or `200`) |
| It is still being processed | `409 DUPLICATE_IDEMPOTENCY` ("already in progress; retry shortly"). Wait and resend again. |
| It succeeded more than 24 hours ago, and you sent `source` | `200` with `source.disposition: "DUPLICATE"` |
| It succeeded more than 24 hours ago, without `source` | `409 DUPLICATE_INVOICE` with `existing_submission`. Read that submission; do not resend. |
| It never arrived, or was refused for a reason outside the document | It is processed now as if it were the first time |
| It was refused because of the document, and you sent `source` | `409 SOURCE_DOCUMENT_ALREADY_REFUSED`. Fix the document and send it under a new `external_version`. |

:::tip[Recommendation]
FAWTIR's edge waits up to 60 seconds for an answer from the platform. Set your HTTP client's read timeout a little above that, so you do not give up on a request that is still being answered.
:::

### Safe push-with-retry loop (Python)

This example uses only the headers, fields and codes documented in this guide. `document` is your ERP's own JSON, exactly as your certified mapping expects it (see [ERP data mapping](/api/data-mapping/)).

```python
import random
import time
import uuid

import requests

BASE_URL = "{BASE_URL}"                     # see the Environments page
API_KEY = "fawt_sk_<your-key>"              # ERP ingestion key, kept in a secret store

# Answers that mean "retry later with the same request and the same key".
RETRY_LATER = {
    "SOURCE_DOCUMENT_IN_PROGRESS",
    "DUPLICATE_IDEMPOTENCY",          # in-progress variant; see note in the loop
    "OUTBOUND_WINDOW_INVOICE_RESERVED",
    "MAPPING_CAPACITY_UNAVAILABLE",
    "EMISSION_BLOCKED",
    "VALIDATION_UNAVAILABLE",
    "OUTBOUND_TRANSPORT_UNAVAILABLE",
}

# Answers where a person must act first (pay, verify the company, buy documents).
# Park the outbox row; resend the SAME request once the cause is fixed.
PARK = {
    "QUOTA_EXCEEDED",
    "TENANT_NOT_OPERATIONAL",
    "SUBSCRIPTION_SUSPENDED",
    "SUBSCRIPTION_CANCELLED",
    "SUBSCRIPTION_NOT_STARTED",
}


def push_invoice(outbox_row, document):
    """Send one outbox row. Returns ('accepted' | 'duplicate' | 'refused' | 'parked' | 'unknown', body)."""
    body = {
        "format": "JSON",
        "document_kind": "STANDARD_INVOICE",
        "document": document,
        "supplement": {
            "issue_time": "10:15:00",
            "transaction_type": "1XXXXXXXXXXXXXXXXXXX",
        },
        "source": {
            "external_document_id": outbox_row["external_document_id"],   # "ERP-INV-000145"
            "external_version": outbox_row["external_version"],           # "1"
        },
    }
    headers = {
        "X-API-Key": API_KEY,
        "Idempotency-Key": outbox_row["idempotency_key"],   # stored once: "waha-inv-000145-v1-7f3c9a2e"
        "X-Correlation-Id": str(uuid.uuid4()),               # optional; a non-UUID value is replaced
        "Content-Type": "application/json",
    }

    delay = 2.0
    for attempt in range(1, 9):
        try:
            response = requests.post(
                f"{BASE_URL}/api/v1/invoices",
                json=body, headers=headers, timeout=(5, 70),
            )
        except requests.RequestException:
            # Timeout or dropped connection: the outcome is unknown.
            # Resend the identical request with the identical key.
            time.sleep(delay + random.uniform(0, delay))
            delay = min(delay * 2, 300)
            continue

        problem = {}
        if response.headers.get("Content-Type", "").startswith("application/problem+json"):
            problem = response.json()
        code = problem.get("error") or problem.get("code")   # 429/413 bodies carry neither

        if response.status_code == 202:
            return "accepted", response.json()        # store id, invoice_uuid, Location
        if response.status_code == 200:
            return "duplicate", response.json()       # source.disposition == "DUPLICATE"

        if response.status_code == 429:
            wait = float(response.headers.get("Retry-After", delay))
            time.sleep(wait)
            continue

        if code in RETRY_LATER or response.status_code == 503:
            # A persistent DUPLICATE_IDEMPOTENCY after several waits means the key was
            # reused with a different body: a defect in key derivation. Stop and alert.
            wait = float(response.headers.get("Retry-After", delay))
            time.sleep(wait + random.uniform(0, delay))
            delay = min(delay * 2, 300)
            continue

        if code in PARK:
            return "parked", problem

        # Everything else is a decision, not a retry: 400, 401, 403, 404, 413, 422,
        # DUPLICATE_INVOICE, SOURCE_IDENTITY_CONFLICT, SOURCE_DOCUMENT_ALREADY_REFUSED,
        # SALES_APPROVAL_REQUIRED, 500 INTERNAL_ERROR. Keep the correlationId for support.
        return "refused", problem

    # Still no answer: leave the row as "unknown outcome" and let reconciliation
    # (or a later run with the SAME key and source) settle it. Never renumber.
    return "unknown", None
```

What the loop deliberately does not do:

- It never changes `body`, the key or the source identity between attempts.
- It never retries a deterministic refusal such as `VALIDATION_FAILED`. Fix the data, increase `external_version`, create the new version's key, and send it as a new outbox row.
- It stops on `DUPLICATE_INVOICE`. The invoice already exists; read the submission named in `existing_submission`.
- It retries `EMISSION_BLOCKED` and `VALIDATION_UNAVAILABLE` with backoff, and each of those answers spends one of the 5 attempts of that source identity (see the note under API Push). If they persist, stop and park the row rather than looping.

Every error code above is described in the [Error reference](/reference/errors/).

## Retries and backoff advice

<span class="rule rule--advice">Recommendation</span>

| Situation | Retry? | How |
|---|---|---|
| Timeout, dropped connection | Yes | Same request, same key, exponential backoff with jitter |
| `429` | Yes | Wait for `Retry-After` (seconds), then the same request |
| `503` (any code) | Yes | Backoff; honour `Retry-After` when present (`MAPPING_CAPACITY_UNAVAILABLE` sends `Retry-After: 4`) |
| `409 SOURCE_DOCUMENT_IN_PROGRESS` | Yes | Wait, then the same request |
| `409 DUPLICATE_IDEMPOTENCY` | A few times | Wait, then the same request; if it persists, stop and check your key derivation |
| `409 OUTBOUND_WINDOW_INVOICE_RESERVED` | Yes, later | The body says `retryable: true` |
| `409 QUOTA_EXCEEDED`, `TENANT_NOT_OPERATIONAL`, `SUBSCRIPTION_*` | After a person fixes the cause | Same request, same key |
| `4xx` refusals of the document | No | Fix the data, new `external_version`, new key |
| `500` | No loop | Contact support with the `correlationId` |

Limits that affect your retry rate are listed in [Platform limits](/reference/limits/). An ERP ingestion key allows 600 requests a minute.

## Managed Pull

With Managed Pull, FAWTIR calls your ERP's REST API on a schedule and submits what it finds. The endpoint your ERP must offer, and how to set up a connection, are in [ERP connector](/integrate/managed-pull/). This section describes how FAWTIR keeps its place and retries.

:::note
FAWTIR switches the Managed Pull scheduler on per deployment. Ask FAWTIR whether it is on for your organisation before you plan on it.
:::

### FAWTIR behaviour

**Cursors (FAWTIR rule).** FAWTIR remembers a position (a "cursor") per connection and asks your ERP only for what comes after it. You choose one of four cursor kinds:

| Cursor kind | What FAWTIR sends back to your ERP | How your ERP must filter |
|---|---|---|
| `TIMESTAMP` | The highest ISO-8601 instant found on the last page | Return documents at or after that instant (inclusive) |
| `SEQUENCE` | The highest sequence number found on the last page | Return documents after that number (exclusive) |
| `CONTINUATION_TOKEN` | The token your ERP returned in the response | Continue the stream from that token |
| `PAGE_TOKEN` | The token your ERP returned in the response | Return the next page of the same traversal |

For `TIMESTAMP` and `SEQUENCE`, FAWTIR takes the **highest** value on the page, not the last one, so your ERP does not have to sort. Because `TIMESTAMP` re-reads inclusively, the document at the boundary comes back on the next run; the source ledger recognises it and does not issue it twice.

**Paging.** FAWTIR asks for up to 100 documents a page and reads at most 20 pages per run. It assumes there may be more when a page is full (`TIMESTAMP`, `SEQUENCE`) or when the response carries a next token (`CONTINUATION_TOKEN`, `PAGE_TOKEN`). If your ERP returns more than the page size, FAWTIR processes only the first 100 and moves its position to the highest cursor value among them. Documents further down that response with a lower cursor value are not read again. If your endpoint cannot honour the page size parameter, return documents in ascending cursor order.

**The cursor moves only when every document on the page is settled.** If one document on the page is still waiting for a retry, FAWTIR reads the same window again on the next run.

**Interval.** Default one hour. You may set an ISO-8601 duration, such as `PT30M`. Values below 5 minutes run every 5 minutes, and values above 24 hours run every 24 hours.

**Backoff after a failed run.** When a whole run fails for a temporary reason (for example, your ERP is down), FAWTIR waits 5 minutes, then 10, 20, 40 and so on, up to 6 hours, and returns to the normal interval after the next successful run. A run that fails for a permanent reason is tried again at the normal interval.

**Attempts per document.** Each document gets up to 5 attempts for temporary problems: your ERP unavailable or slow, your ERP refusing the credential, or a temporary platform fault. Some reasons do not use an attempt: the mapping is not ready or not certified, your Peppol participant is not yet verified, the document allowance is used up, or your organisation cannot issue right now. A document whose 5 attempts are spent is rejected with `ATTEMPTS_EXHAUSTED`, and collection moves past it. A person can then ask FAWTIR to try it again (see [ERP connector](/integrate/managed-pull/#recovery)).

**One bad document does not hold the others.** A document with no identifier is refused on its own and the rest of the page is processed. A whole page response may be at most 4 MiB: a larger response is refused before any document in it is read, and the run fails. Keep your pages well below that size.

:::caution[Warning]
Managed Pull submits **tax invoices only**. Credit notes, debit notes and self-billed documents must be sent with API Push.
:::

### Recommended ERP design

- Give every invoice a stable identifier and a version that increases when its content changes.
- For `TIMESTAMP`, use a value that changes when the invoice is finalised and never moves backwards. If a full page of 100 documents all carry the timestamp FAWTIR already holds, the run fails and the position does not move, so collection is stuck on that value.

<span class="rule rule--advice">Recommendation</span> Prefer a strictly increasing `SEQUENCE` cursor. If you use `TIMESTAMP`, make sure fewer than 100 documents can ever share one timestamp value, for example by including fractions of a second.
- Expose only finalised (posted) invoices on the endpoint. Drafts must not appear.

## Bridge Upload

### FAWTIR behaviour

Bridge Upload is a page in the FAWTIR app: **Settings → ERP integration → Bridge upload**. A signed-in person with permission to submit invoices uploads **one** document file, JSON or XML, up to 4 MiB, and fills in **Document ID in your ERP** and, optionally, **Version**.

- It is not an installed program, and API keys and OAuth clients cannot use it.
- It submits tax invoices only.
- It uses the same source ledger rules as API Push, but in its own namespace: an upload and a push with the same identity are different documents to FAWTIR.
- The answers are the same as for API Push: accepted, already uploaded (`DUPLICATE`), or refused with `SOURCE_IDENTITY_CONFLICT`, `SOURCE_DOCUMENT_IN_PROGRESS` or `SOURCE_DOCUMENT_ALREADY_REFUSED`.

### Recommended ERP design

Use Bridge Upload for low volumes, for testing a mapping with a real document, or as a manual fallback. It is not a synchronisation mechanism: nothing on the ERP side is updated.

## Incremental sync and filtering

**FAWTIR behaviour.**

- FAWTIR never reads changes from your ERP on its own, except through Managed Pull.
- FAWTIR does not write anything back to your ERP. There is no write-back channel.
- An API key can only submit. It cannot read status or lists. To read, use a Bearer token: a signed-in user, or an OAuth client that holds `invoice.read`.

Lists you can filter, with a Bearer token:

| Route | Useful filters |
|---|---|
| `GET /api/v1/invoices` | `state`, `document_kind`, `invoice_number`, `receiver`, `received_from`, `received_to`, `page`, `page_size` |
| `GET /api/v1/erp/source-documents` | `source_kind`, `external_document_id`, `invoice_number`, `processing_state`, `reason_code`, `retryable`, `delivery_state`, `from`, `to`, `page`, `page_size` |
| `GET /api/v1/erp/source-documents/reconciliation` | `label`, `source_kind`, `connection_id`, `from`, `to` (at most 367 days) |

The `state` and `document_kind` filters on `GET /api/v1/invoices` are case-sensitive: send `DELIVERED`, not `delivered`. Any other value is refused with `400`.

:::note
The platform's access rules let an OAuth client that holds `invoice.read` read these lists. Confirm this set-up with FAWTIR during onboarding before you rely on it.
:::

**Recommended ERP design.** Poll only documents your outbox marks as "sent, outcome not final", oldest first, and stop polling a document once its delivery state and tax report are final (see [Invoice lifecycle](/integrate/lifecycle/)).

## Batching

**FAWTIR behaviour.** API Push takes **one document per request**. Two batch routes exist (`POST /api/v1/invoices/batch` for up to 10 documents, and `POST /api/v1/invoices/batches` for up to 1000, processed asynchronously), but:

- an API key cannot call them;
- they refuse a `source` block, so batched documents get no source-ledger protection and do not appear in the ERP activity reports.

:::note
Ask FAWTIR before you call the batch routes with an OAuth client.
:::

**Recommended ERP design.** Send documents one per request from your outbox, with a small number of parallel workers. Keep the per-key limit of 600 requests a minute in mind.

## Partial failures

Each document is accepted or refused on its own. There is no "all or nothing" across documents.

| Situation | What it means | What to do |
|---|---|---|
| Some documents accepted, some refused | Each refused document carries its own code | Fix and resend only the refused ones, each under a new `external_version` |
| A Managed Pull run "completed with rejections" | Some documents on the run were rejected; the rest were accepted or recognised as duplicates | Look at the rejected documents in **Activity → Source documents** |
| Accepted, then delivery failed | The invoice exists in FAWTIR; transport or the recipient did not complete delivery | See [Invoice lifecycle](/integrate/lifecycle/). Do not resend the same invoice. |
| Accepted, then the tax report has a problem | The invoice exists; its TDD needs attention | See [Invoice lifecycle](/integrate/lifecycle/#tdd-status) |

## Reconciliation with your ERP reports

**FAWTIR behaviour.** The ERP activity reports list every document that arrived with a source identity (API Push with `source`, Bridge Upload, Managed Pull). In the app they are under **Settings → ERP integration → Activity**, on the tabs **Source documents**, **Needs attention** and **Extraction runs**. Through the API they are at `/api/v1/erp/source-documents`, `/summary`, `/reconciliation` and `/{recordId}`, which need `invoice.read`.

The **Needs attention** labels:

| Label | Meaning |
|---|---|
| `RECOVERY_PENDING` | A document was left claimed by an interrupted process; FAWTIR is releasing it |
| `WAITING_FOR_MAPPING` | Waiting for your mapping to be ready or certified |
| `RETRYABLE_FAILURE` | The last attempt failed for a temporary reason |
| `ATTEMPTS_EXHAUSTED` | All attempts are spent; a person must act |
| `ACCEPTED_WITHOUT_INVOICE` | Accepted, but no invoice is linked. Contact support. Do not resend. |
| `TRANSPORT_PENDING` | The invoice is still queued or sending more than 6 hours after FAWTIR accepted it |
| `RESPONSE_PENDING` | The invoice was sent 24 hours ago or more, and the recipient's side has not answered yet |
| `DELIVERY_FAILED` | The invoice could not be delivered, or the recipient's side refused it |
| `TAX_REPORT_ATTENTION` | The TDD failed, was rejected, or is past its deadline |

**Recommended ERP design.** Once a day, compare your outbox with FAWTIR:

1. For every outbox row older than a few minutes with no stored `invc_…` id, look it up by `external_document_id` in `/api/v1/erp/source-documents`. If FAWTIR has it, store the id. If not, resend it unchanged (same key if still within 24 hours; the source ledger protects you after that).
2. Read `/api/v1/erp/source-documents/reconciliation` for the last day and route each label to the team that can act on it.
3. Compare counts for the day: the documents you posted in the ERP, and what `/api/v1/erp/source-documents/summary` reports as received, accepted, rejected and duplicate.

A push without a `source` block is not in these reports. Reconcile those with `GET /api/v1/invoices?invoice_number=…`.
