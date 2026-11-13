---
title: "Production go-live checklist"
description: "Work through this checklist to move your ERP integration from TEST to production safely."
sidebar:
  label: "Production go-live"
  order: 2
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
Work through this checklist to move your ERP integration from TEST to production safely. It covers what FAWTIR must switch on, how to set up credentials, how to monitor and reconcile, and how to stop quickly if something goes wrong.

:::caution[Warning]
Nothing on this list is approved automatically. FAWTIR switches on document submission for the deployment and ERP integration for your company, and you must ask for each step. A working TEST setup does not carry over to production by itself.
:::

The key and client values below are placeholders.

## 1. Prerequisites

- [ ] Your company is registered in FAWTIR and its details are verified. Until then submissions are refused with `409`, `error: TENANT_NOT_OPERATIONAL`.
- [ ] Your plan includes API access. Without it, creating a key is refused with `409 plan-limit-reached`.
- [ ] Your company's Peppol participant (`0248:` plus your VAT number, for example `0248:OM1999000101`) is registered and verified by FAWTIR. Until then submissions are refused with `422` and one of `SENDER_PARTICIPANT_NOT_REGISTERED`, `SENDER_PARTICIPANT_CLAIM_CONFLICT` or `SENDER_PARTICIPANT_NOT_AUTHORIZED`.
- [ ] You know which channel you use: API Push, Managed Pull or Bridge Upload. See [Introduction](/get-started/introduction/).
- [ ] Your ERP numbers invoices uniquely per company and year. FAWTIR refuses a repeated number with `409 DUPLICATE_INVOICE`.
- [ ] Your ERP stops a credit note from exceeding the invoice it corrects. <span class="rule rule--fawtir">FAWTIR rule</span>: FAWTIR does not check this for documents pushed from your ERP.

## 2. TEST sign-off

- [ ] Every scenario in the [Test checklist](/go-live/test-checklist/) has been run and recorded.
- [ ] Every document kind and transaction type you will send in production has passed on TEST.
- [ ] Your ERP shows `422` refusals to a user with the rule ID or code, and does not retry them.
- [ ] No retry, timeout or replay created a second invoice.
- [ ] You have shared the sign-off record with FAWTIR and FAWTIR has agreed the go-live date.

:::note
A passed TEST checklist is not Peppol certification and not approval by the Oman Tax Authority (OTA).
:::

## 3. Credentials and secure configuration

- [ ] A person holding `admin.settings.manage` creates the production key on the **API push** page: **Create key**, then **Create an ERP ingestion key**. The key is shown once.
- [ ] The key uses the `ERP_INGESTION` profile and holds only the submit scopes you need: `invoice.submit`, `creditnote.submit`, `debitnote.submit`, `selfbilling.submit`. That profile cannot hold any other permission.
- [ ] The key has an expiry date. An `ERP_INGESTION` key is valid for 365 days by default and at most 730 days.
- [ ] Rotation is planned before expiry. **Rotate key** issues a new key. The old key keeps working for a grace period (24 hours by default, at most 7 days). **Complete rotation** ends the grace period early. Record the owner and the date.
- [ ] The key is kept in a secret store, never in source code, a ticket, a log line or an email.
- [ ] The ERP sends the key only as `X-API-Key: fawt_sk_<your-key>`, and never together with an `Authorization` header (that is refused with `400 ambiguous-credentials`).
- [ ] A separate read credential exists for status polling: a Bearer token from a signed-in user, or an OAuth client (`fawtir_<tenant>_<id>`, secret `<your-client-secret>`) holding `invoice.read`. API keys cannot read anything.

- [ ] You have confirmed with FAWTIR which read credential your integration uses. The platform allows both.

See [Authentication](/get-started/authentication/).

## 4. Production endpoint

- [ ] Your ERP's base URL is configurable, and production uses the production value.
- [ ] You have the production base URL from FAWTIR in writing. Do not point production at the TEST base URL.

See [Environments](/get-started/environments/).

## 5. FAWTIR switches on your company

Ask FAWTIR to confirm each item in writing:

- [ ] Document submission is enabled on the production deployment. It is switched on for the whole deployment, not per organisation; where it is off, the submission routes answer `404`.
- [ ] ERP integration is enabled for your company. Until then a push with `source`, or any push with an `ERP_INGESTION` key, is refused with `403 erp-entitlement-required`, and the ERP pages in FAWTIR show "ERP integration is not enabled".
- [ ] For Managed Pull only: scheduled collection is switched on for your deployment.
- [ ] For webhooks only, if you want them: sending is enabled for your deployment.

## 6. Mapping certification in production

- [ ] The production mapping is the one you tested, for each format (JSON or XML) you send.
- [ ] It is certified in your production company for every document kind, route and transaction type you will send. <span class="rule rule--fawtir">FAWTIR rule</span>: certification is tied to the exact mapping content, so any change to the mapping needs a new certification. An uncertified combination is refused with `422`, `error: SUBMISSION_NOT_SUPPORTED`.
- [ ] Certification was done by a person. Mapping changes and certification cannot be made with an API key or an OAuth client.

- [ ] You have asked FAWTIR whether a mapping certified on TEST must be certified again in production, and planned for the answer.

See [Data mapping](/api/data-mapping/).

## 7. Monitoring

- [ ] **Polling (primary).** Your ERP reads `GET /api/v1/invoices/{id}` until delivery and tax reporting reach a final state. See [Invoice lifecycle](/integrate/lifecycle/).
- [ ] **Reports.** You read `GET /api/v1/erp/source-documents` and `/summary` for documents sent with a `source` block. A push without `source` appears only in `GET /api/v1/invoices`.
- [ ] **Webhooks (optional).** Available on request. They do not cover every event: no webhook is raised for sent, TDD submitted, an AB answer, or transport failure. Keep polling. See [Webhooks](/integrate/webhooks/).
- [ ] Alerts are set for `401`, `403`, `429` and repeated `503` answers.

## 8. Daily reconciliation

- [ ] Once a day your ERP reads `GET /api/v1/erp/source-documents/reconciliation?from=<date>&to=<date>` (window at most 367 days) and acts on each label:

| Label | Action |
|---|---|
| `WAITING_FOR_MAPPING` | Fix or certify the mapping, then resend the same version. |
| `RETRYABLE_FAILURE` | Resend the same request later. |
| `ATTEMPTS_EXHAUSTED` | Find the cause. Managed Pull records can be recovered by a person in FAWTIR. Your ERP must resend a pushed document under a new `external_version`. |
| `RECOVERY_PENDING` | Wait. FAWTIR recovers stale claims itself. |
| `ACCEPTED_WITHOUT_INVOICE` | Contact support. Do not resend. |
| `TRANSPORT_PENDING` | Still queued or sending after 6 hours. Contact support if it persists. |
| `RESPONSE_PENDING` | Sent, no recipient answer after 24 hours. Do not resend. |
| `DELIVERY_FAILED` | `UNDELIVERABLE` or `C4_UNREACHABLE`. Decide with the buyer and FAWTIR. Do not resend the same content. |
| `TAX_REPORT_ATTENTION` | The Tax Data Document could not be produced, was refused as a message, was given up on, or is late. Contact support. |

- [ ] Your ERP's own list of sent invoices matches FAWTIR's for the day.

## 9. Rollback plan

- [ ] **Pause sending** in your ERP (stop the push job). For Managed Pull, pause the connection in FAWTIR (**Pause**).
- [ ] **Revoke** the key if it may be exposed or the ERP is misbehaving. Revocation takes effect at once and also ends an open rotation grace period.
- [ ] **Never delete issued invoices.** The API offers no route to delete or withdraw a submitted document. A document already accepted is corrected only with a credit note or a debit note. See [Invoice corrections](/integrate/corrections/).
- [ ] Before you resume, reconcile (section 8) so you know which documents were accepted while you were paused.

## 10. Safe retry policy

- [ ] Every request carries an `Idempotency-Key` that belongs to that document version and is reused on every retry, for example `waha-inv-000145-v1-7f3c9a2e`. A new version gets a new key. A successful answer is kept for 24 hours.
- [ ] Every push carries `source.external_document_id` and `source.external_version`. The source identity has no time limit.
- [ ] Retry rules:

| Answer | Action |
|---|---|
| Timeout, connection lost | Resend the same request with the same key. After 24 hours, resend with a new key and the same `source`. |
| `429` | Wait for `Retry-After`, then resend the same request. |
| `503` | Resend the same request later, with back-off. |
| `409 SOURCE_DOCUMENT_IN_PROGRESS`, `409 DUPLICATE_IDEMPOTENCY` "already in progress" | Wait briefly, then resend the same request. |
| `400`, `401`, `403`, `422` | Do not retry. Fix the request, the credential or the data. |
| `409 DUPLICATE_INVOICE`, `SOURCE_IDENTITY_CONFLICT`, `SOURCE_DOCUMENT_ALREADY_REFUSED` | Do not retry. See [Error reference](/reference/errors/). |

- [ ] Your ERP never resends a document only because no recipient answer arrived.

## 11. The first production invoice

- [ ] Agree the date, the buyer and the document with FAWTIR and with the buyer.
- [ ] Send one ordinary standard tax invoice. Do not start with a correction or an unusual transaction type.
- [ ] Confirm the `202`, then poll until delivery reaches a final state and the TDD leg reaches a final status.
- [ ] Confirm with the buyer that the invoice arrived.
- [ ] Only then switch on the rest of your volume.

:::caution[Warning]
`DELIVERED` means the buyer's access point confirmed delivery. A TDD leg at `ACCEPTED` means the Tax Authority's corner (C5) returned a positive message-level status. Neither is a tax verdict from the OTA.
:::

## 12. Support escalation

- [ ] You know how to contact FAWTIR support. See [Support and versioning](/go-live/support/).
- [ ] Every support request includes the invoice `id` (`invc_…`), the time, the HTTP status, the `error` or `code`, and the `X-Fawtir-Trace-Id` response header or the `correlationId` from the body.
- [ ] Never send an API key, client secret or full invoice payload to support unless FAWTIR asks for the payload through an agreed channel.
