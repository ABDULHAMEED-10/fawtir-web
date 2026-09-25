# Income screens — design realignment and what the backend needs to add

**Date:** 25 September 2026
**Rule agreed with the product owner:** the screen follows the Figma design; where the API and the
design disagree, the front end draws the design and the backend adapts. Every place where the UI
draws something the API does not yet provide is marked `// TODO(backend)` in the code and listed
here. Integration will be re-tested by hand once these land.

Every existing call, request shape, idempotency key and permission check was kept. The tests that
assert which request is sent, with what body and headers, are unchanged; only layout and copy
assertions moved.

To render the integrated screens without a backend, fixtures live in `tools/mock-api/routes/*.mjs`
(one file per area). They follow the DTOs in `src/api/**` and show the shapes the UI expects.

---

## 1. Invoices list (`GET /v1/authored-invoices`, `/summary`)

| # | The design shows | Ask |
|---|---|---|
| 1.1 | A **To send** tab (issued, not yet delivered) with a count | `summary.toSend`; a list filter `state=ISSUED&delivery=NOT_SUBMITTED` |
| 1.2 | A **Channel** filter (Peppol network / Email) | delivery channel on the row and a `channel` filter |
| 1.3 | A **Peppol/OTA** column per row (Sent manually / Not sent / transmitted / accepted / refused) | transmission status per document beyond `deliveryState` NOT_SUBMITTED / SENT_MANUALLY |
| 1.4 | Row menu **Send**, **Duplicate** | a deliver (send) endpoint; a duplicate endpoint |
| 1.5 | **Bulk upload** button | an import endpoint |
| 1.6 | Branch and correction reason under a note row | `branchId`, `details.correctionReasonCode` on list rows (typed as optional already) |

## 2. Invoice detail (`GET /v1/authored-invoices/{id}` and sub-resources)

| # | The design shows | Ask |
|---|---|---|
| 2.1 | Delivery bar "Sent to … over Peppol · time" and OTA state | transmission status with timestamps (see 1.3) |
| 2.2 | **Invoice PDF** pane with download and print; payment receipts | rendered PDF endpoint; receipt per payment |
| 2.3 | Attachments with uploader and kind; add / remove on an issued document | attachment upload/remove routes; uploader name and document kind |
| 2.5 | Reminder banner with **Pause** and "next reminder on …" | per-invoice reminder pause; next scheduled reminder |
| 2.6 | Branch name | branch name on the detail (only `branchId` today) |
| 2.7 | Row menu **Periodic invoice** | the periodic composer reading `?template=<invoiceId>` (front end sends it) |

## 3. Create invoice (`POST/PUT /v1/invoice-drafts`) — the line and header strategy

The product owner's final line-row and header rules are implemented on the page:
free-text description (no product code), goods / service toggle per line, unit on the row whose
options follow the toggle, price excluding VAT to three decimals (non-negative, default 0), tax
category as text only; header with payment terms, branch pre-filled, payment method, VAT mode;
HS code search on goods lines and service type search on service lines for business and
government customers (hidden for consumers); the industrial classification lives in Company
settings, not on the line; no popups.

What the page sends today (unchanged shapes): `customerId, branchId, currency, vatMode,
headerDiscount, details{deliveryDate, subject, purchaseOrderReference, customerVisibleNote,
internalNote, paymentTerms{code,label}, transactionType}` and per line `lineNumber, productId,
productCode, description, unitCode, quantity, unitPrice, discount, taxCategory{…}`.

| # | The design or rule needs | Ask |
|---|---|---|
| 3.1 | Goods / service per line; HS code on goods lines; service type on service lines; the issuer's industrial classification (ISIC, 6-digit) as a company setting | `lines[].itemType`, `lines[].hsCode`, `lines[].serviceType`; company-level `industrialClassification`; search endpoints for the three code lists. See **PINT_OM_LINE_CLASSIFICATION.md** for the rules (IBR-078/079/080/081/155-OM, CL-12-OM), the XML binding and the code list sources |
| 3.2 | Lines typed without a catalogue product | accept `productId` / `productCode` empty (decision D7 says a line names a product — please relax) |
| 3.3 | Payment terms Due on receipt / Net 15 / Net 30 / Net 60 / End of month / Advance payment | codes NET0, NET15, NET30, NET60, EOM, ADVANCE (the server stores code + label, so likely fine) |
| 3.4 | Payment method, reference, date; mark as paid; mark as sent manually | draft-level `paymentMethod` (UNCL4461), `paymentReference`, `paymentDate`, `markAsPaid`, `markAsSent` |
| 3.5 | Supporting documents; linked trade documents | attachment upload on drafts; links to quotations / order forms / delivery notes |
| 3.6 | Header quota meter "880 / 1,000 used" | per-tenant document quota and usage |
| 3.7 | Consumer quick-create from the name field | needs `customer.manage`; a one-word name is sent as first = last name |

## 4. Credit and debit notes (`POST /v1/authored-invoices/{id}/credit-notes` etc.)

| # | The design shows | Ask |
|---|---|---|
| 4.1 | KPI cards, tab counts and "credited this quarter" per note type | `GET /v1/authored-invoices/summary?type=CREDIT_NOTE\|DEBIT_NOTE` (derived from a 200-row read today) |
| 4.2 | Refund due / Refunded tabs, Refund column, **Record refund** | refund tracking per credit note (state, amount, date) and a record-refund endpoint |
| 4.3 | To send / Applied / Refunded filters | delivery and refund filters on the list |
| 4.4 | Custom amount / flat charge / additional items | accept product-less lines (as 3.2) |
| 4.5 | Reference / RMA on the note | a reference field on the draft (`buyerReference` writable); travels as `details.subject` today |
| 4.6 | Peppol send switch; attachments on the draft | send flag; draft attachment upload |
| 4.7 | Paid date and method per note row; seller identity on the printed document | row fields; company masthead data |
| 4.8 | A debit note "added to the invoice's balance" | semantic mismatch: the API makes a debit note its own receivable; the screen shows "now due" = invoice outstanding + note outstanding. Please confirm which the ledger should do |

## 5. Periodic invoices (`/v1/periodic-invoices`)

| # | The design shows | Ask |
|---|---|---|
| 5.1 | Schedule name, customer, per-invoice amount, currency, PO on the list | schedule carries its template's `invoiceNumber`, `subject`, `purchaseOrderReference`, `totalAmount`, `currency` (the list reads the invoices list to find them today) |
| 5.2 | Generated count and "Generated this month" | `runCount`, `lastRunDate`, a list summary |
| 5.3 | **On request** and **Draft** schedule states | states the API lacks (tabs drawn, always 0) |
| 5.4 | Send automatically / Notify switches | per-schedule `autoIssue`, `notifyOnRun` |
| 5.5 | Runs with the raised draft's number and amount | run carries the draft number and amount |
| 5.6 | "Started" date | schedule `createdAt` |
| 5.7 | Editable subject, PO, notes and lines on the schedule | schedule-level fields (read-only from the template today) |

## 6. Payment reminders (`/v1/reminders`)

| # | The design shows | Ask |
|---|---|---|
| 6.1 | Tab counts on the log | totals on the log endpoint |
| 6.2 | Upcoming / queued reminders | a queue endpoint |

## 7. Self-billing

Not integrated yet; the screens are on mock data and follow the frames. Contracts to define when
the backend reaches it: self-billed invoices (list, detail, create), agreements (list, renew).

---

Questions to the front end: `docs/frontend/` handoffs describe each integrated slice; this file
is the delta the design introduced on 25 September 2026.
