# Income and Customers: backend guide

**For:** the backend team. **Covers:** invoices, the invoice form, credit and debit notes, periodic invoices, payment reminders, self-billing, customers, the PINT-OM line classification, and the two sign-up answers invoices depend on. **Last updated:** 27 September 2026.

This is the single guide for this area. It lists every place where a screen draws something the
API does not provide yet, and what to add. It replaces the older per-pass "design realignment,
backend asks" documents.

## How to use this guide

- **The rule.** The product owner ruled that the Figma design is the source of truth. Each screen
  follows its frame; where the API does not carry what the frame draws, the screen draws it from
  the best value it has, or shows a marked placeholder, and the gap is a row below. The backend
  adapts to the screen; the front end then re-tests the integration by hand.
- **Nothing existing was removed.** Every call, request shape, idempotency key and permission check
  the integration added is still there, and the tests that assert them still pass.
- **Rows.** Each row reads: number, what the screen shows, what the backend must add. A row that
  says "none" records a decision, not a gap. Row numbers are stable ids: the code comments cite
  them, so they are never renumbered, and new rows are appended at the end of their section.
- **Finding it in the code.** Every gap is a `// TODO(backend)` comment naming its row. Search
  for `TODO(backend)` in `src/pages/*Invoice*`, `src/pages/*Note*`, `src/pages/*Periodic*`, `src/pages/*Reminder*`, `src/pages/*SelfBill*`, `src/pages/Customer*`, `src/lib` and `src/api/invoices`.
- **Seeing the screens without a backend.** `tools/mock-api/routes/invoices.mjs`, `drafts.mjs`, `notes.mjs`, `periodic.mjs`, `reminders.mjs`, `agreements.mjs`, `customers.mjs` answer the
  routes with realistic data in the shapes the screens expect (`src/api/**` holds the DTOs). Run
  `node tools/mock-api/server.mjs` and point the app at it; see `docs/LOCAL_SETUP.md`.
- **Related.** Supplier-side self-billing documents and supplier notes live in `EXPENDITURE.md`.

**Screens in this guide:** Invoices list and detail; Create invoice; Credit notes and Debit notes (lists, forms, details); Periodic invoices (list and schedule); Payment reminders (queue and settings); Self-billing (list, agreements, new, detail); Customers (list, new, edit, quick add, import); sign-up Business identity and About your business.

---
# Part A: screen by screen

## 1. Invoices list (`GET /v1/authored-invoices`, `/summary`)

| # | The design shows | Ask |
|---|---|---|
| 1.1 | A **To send** tab (issued, not yet delivered) with a count | `summary.toSend`; a list filter `state=ISSUED&delivery=NOT_SUBMITTED` |
| 1.2 | A **Channel** filter (Peppol network / Email) | delivery channel on the row and a `channel` filter |
| 1.3 | A **Peppol/OTA** column per row (Sent manually / Not sent / transmitted / accepted / refused) | transmission status per document beyond `deliveryState` NOT_SUBMITTED / SENT_MANUALLY |
| 1.4 | Row menu **Send**, **Duplicate** | a deliver (send) endpoint; a duplicate endpoint |
| 1.5 | **Bulk upload** button | an import endpoint |
| 1.6 | Branch and correction reason under a note row | `branchId`, `details.correctionReasonCode` on list rows (typed as optional already) |
| 1.7 | **PEPPOL/OTA** column printed as the Peppol response code pill (AB / AP / RE) | `peppolResponse` on every list row (typed optional in `list.ts`); a manual send shows "Sent manually", an undelivered document is blank |
| 1.8 | **To be sent** status pill: issued, unpaid, not delivered by any means | derived in the browser from `deliveryState` + `peppolResponse`; a delivery state that the server owns would make it exact |
| 1.9 | The issuing branch named under the customer on every row | `branchId` on list rows (the page reads `/v1/branches` once to name it) |
| 1.10 | The period chip reads **This month** while the rows include a draft and July documents | none. Read as the mock's state, not a rule: a month filter by default would hide every draft (no issue date) and last month's overdue invoices. The list opens on All time and "This month" is one choice away; `DEFAULT_PERIOD` in `InvoicesPage.tsx` flips it if the product owner wants the chip literally |

## 2. Invoice detail (`GET /v1/authored-invoices/{id}` and sub-resources)

| # | The design shows | Ask |
|---|---|---|
| 2.1 | Delivery bar "Sent to … over Peppol · time" and OTA state | transmission status with timestamps (see 1.3) |
| 2.2 | **Invoice PDF** pane with download and print; payment receipts | rendered PDF endpoint; receipt per payment |
| 2.3 | Attachments with uploader and kind; add / remove on an issued document | attachment upload/remove routes; uploader name and document kind |
| 2.5 | Reminder banner with **Pause** and "next reminder on …" | per-invoice reminder pause; next scheduled reminder |
| 2.6 | Branch name | branch name on the detail (only `branchId` today) |
| 2.7 | Row menu **Periodic invoice** | the periodic composer reading `?template=<invoiceId>` (front end sends it) |
| 2.8 | The **internal note** printed in its box with the page (no "show" click in the design) | the note is now read with the page, so every visit writes an `INTERNAL_NOTE_VIEWED` audit event. Please stop auditing the read, or answer the note on `GET /authored-invoices/{id}` |
| 2.9 | Header "Sent via Peppol"; balance card "Delivered on Peppol to … · 18 Jul 2026, 14:32" | `peppolResponse` and `deliveredAt` on the detail (typed optional in `detail.ts`); until then the one recorded fact, a manual send, is shown |
| 2.10 | Reminder banner "Reminder 1 of 3 · goes out tomorrow at 09:00" | derived from `GET /payment-reminders/schedule` and the due date; a per-invoice "next reminder" with its time would make it exact (see 2.5). **Pause** says it is per tenant when pressed |
| 2.11 | Bill-to field grid with **Project** | no project field exists; `details.contractReference` stands in |
| 2.12 | Customer chip "VAT … · 0248:OM…" | `profile.details.peppolParticipantId` on `GET /customers/{id}` (the full record already carries it) |
| 2.13 | Attachment rows "Purchase order · 248 KB · Uploaded 18 Jul 2026 by Hafidh Saif"; drop zone on every state | document kind and uploader name per attachment (see 2.3); the file type stands in for the kind; the drop zone explains itself when used |
| 2.14 | Payments "+ Add payment"; rows "Bank transfer / 22 Jul 2026 · Ref … · note" | a free-text note per payment (`paymentReference` is the only text today; the amount takes the note's slot) |
| 2.15 | Activity headed by the balance ("Partially paid / Outstanding 28.590 · due in 23 days") | derived from the receivable read; nothing to add |

## 3. Create invoice (`POST/PUT /v1/invoice-drafts`): the line and header strategy

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
| 3.1 | Goods / service per line; HS code on goods lines; service type on service lines; the issuer's industrial classification (ISIC, 6-digit) as a company setting | `lines[].itemType`, `lines[].hsCode`, `lines[].serviceType`; company-level `industrialClassification`; search endpoints for the three code lists. See **part C of this guide** for the rules (IBR-078/079/080/081/155-OM, CL-12-OM), the XML binding and the code list sources |
| 3.2 | Lines typed without a catalogue product | accept `productId` / `productCode` empty (decision D7 says a line names a product — please relax) |
| 3.3 | Payment terms Due on receipt / Net 15 / Net 30 / Net 60 / End of month / Advance payment | codes NET0, NET15, NET30, NET60, EOM, ADVANCE (the server stores code + label, so likely fine) |
| 3.4 | Payment method, reference, date; mark as paid; mark as sent manually | draft-level `paymentMethod` (UNCL4461), `paymentReference`, `paymentDate`, `markAsPaid`, `markAsSent` |
| 3.5 | Supporting documents; linked trade documents | attachment upload on drafts; links to quotations / order forms / delivery notes |
| 3.6 | Header quota meter "880 / 1,000 used" | per-tenant document quota and usage |
| 3.7 | Consumer quick-create from the name field | needs `customer.manage`; a one-word name is sent as first = last name |
| 3.8 | One **Classification** column per line (business and government only): an **HS code** search by product name on goods lines (12-digit Oman code, "Other" = 000000000000 always offered) and a **Service type** search by name on service lines (CL-12-OM). The composer holds `hsCode` / `serviceType` on the client only, reads them back when the draft response carries `lines[].hsCode` / `lines[].serviceType`, and refuses **Create invoice** while a goods line lacks an HS code (IBR-079-OM) or a service line a service type (IBR-155-OM); consumers skip both. The lists are placeholder subsets in `src/lib/codeLists/hs.ts` and `serviceTypes.ts` | store and return `lines[].hsCode` and `lines[].serviceType` on the draft (the request refuses them today, so a reloaded draft loses them); `GET /v1/code-lists/hs?q=` and `GET /v1/code-lists/service-types?q=`; the same refusal at `POST /issue` naming the line and rule |
| 3.9 | Settings › Company: **Business activity (ISIC)**, searched by activity name over a placeholder subset (`src/lib/codeLists/isic.ts`), default 561010 Restaurants and cafés. The composer's details card shows it read-only ("Business activity: 561010 · Restaurants and cafés", link to Company settings) and never asks for it; the old per-line ISIC division picker is gone | `industrialClassification { code, name }` on `GET/PUT /v1/settings/company`; `GET /v1/code-lists/isic?q=`; copy it onto every line at submission (IBR-081-OM) and refuse issue when the tenant has none |
| 3.10 | Units per line follow the goods / service toggle, from the UN/ECE Rec 20 lists the design pass built (`GOODS_UNITS` / `SERVICE_UNITS`), with **Other** (`ZZ`) last on both. Since the merge with the integration the composer offers the platform's own units (`GET /v1/reference-data` `units`, ten codes seeded) split the same way, always with `ZZ`, and the full lists until the catalogue answers; a loaded draft's unit is shown whatever the list says | carry the full Rec 20 sets the design lists (EA, H87, KGM, GRM, TNE, LTR, MLT, MTR, CMT, MTK, MTQ, BX, CT, PK, BG, BO, CA, DZN, SET, PR, RO; HUR, DAY, WEE, MON, ANN, E48, C62, LS, KMT) plus `ZZ` in `reference-data.units`, and accept `ZZ` on `lines[].unitCode` |
| 3.11 | Payment terms as the design lists them (row 3.3: NET0, NET15, NET30, NET60, EOM, ADVANCE) with the due date derived on the client (End of month and Advance payment have no day count). The platform's `reference-data.paymentTerms` seeds NET0 / 7 / 14 / 30 / 45 / 60 with `netDays`; the composer offers the design's list, shows a loaded draft's other code by the platform's name, and sends `paymentTerms {code, label}` for all of them | add NET15, EOM and ADVANCE to `reference-data.paymentTerms` (EOM and ADVANCE need a due-date rule rather than `netDays`), or confirm the server keeps storing any `{code, label}` pair as today |
| 3.12 | Tax categories and payment methods are read from `GET /v1/reference-data` (the server derives the stored rate from `en16931Category`), named as the design names them; the design's five UNCL4461 methods stand in until the list answers. A line typed before the catalogue has answered carries no category and takes the header default once it has | none beyond 3.4; the composer never sends a category the platform does not list |
| 3.13 | The header always shows the design's catalogue: "Standard rate - 5%" and the other five categories, the design's terms, OMR, the five UNCL4461 methods. The shell fetches `/v1/reference-data` only behind the session guard (`REQUIRE_SESSION`), and the deployed build has the guard off (`.env`: `VITE_REQUIRE_SESSION=false`), so after the merge the composer showed "Loading..." for the default tax category and priced every line at 0% S. The composer now draws `DESIGN_REFERENCE` (`src/lib/invoiceDraft.ts`, the same codes the platform seeds) until the platform's list answers, and the platform's list replaces it when it does | fetch `/v1/reference-data` in the shell whether or not the session guard is on (or turn the guard on for the deployed build); keep seeding S5 / Z0 / E0 / O0 / AE0 / G0 so the design's names stay valid codes |
| 3.14 | Sign-up asks for the **Business activity (ISIC)** on the Business identity step, pre-filled from the specialty, required, shown on the review page | `industrialClassification` (6-digit code) on `POST /v1/auth/signup/business-identity`, stored on the tenant's company settings at approval; the full ISIC list behind `GET /v1/code-lists/isic?q=` (PINT-OM doc §8) |

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
| 4.9 | The reason dropdown offers the design's list (credit: Returned goods, Price correction, Order cancelled, VAT correction, Goodwill discount, Other; debit: Undercharged, Additional delivery, Freight omitted, VAT correction, Late payment charge, Price escalation, Other) and the list rows print it | each is sent as one of the five BTOM-032 codes (QTY / VAL / CAN / VAT / OTH), so two reasons can share a code and a reopened draft shows the first of its code ("Other" for OTH). Please add a `correctionReasonDetail` (free text or an enum of the above) beside `correctionReasonCode` on the draft and the list row |
| 4.10 | Goods / service toggle, HS code search on goods lines, service type search on service lines (business and government customers only; hidden for consumers) on both note composers | as 3.1: `lines[].itemType`, `lines[].hsCode`, `lines[].serviceType` on the note draft, and the two search endpoints. Until then the choice stays on the page (placeholder lists in `src/lib/salesNote.ts`) and is not sent |
| 4.11 | Original invoice card: "Issued 18 Jul 2026 · sent via Peppol" | the channel per document (as 1.3); the card prints "sent via Peppol" for `deliveryState = SENT_MANUALLY` and "not sent yet" otherwise |
| 4.12 | Debit note composer, "Correct existing lines": every invoice line is listed with no checkbox; a line is charged when it is given a difference (price above zero and a quantity) | no API change: only the lines with a difference are sent. The credit note's "Specific lines" keeps its checkboxes (no frame for it; picking is the mode) |
| 4.13 | Note detail: the internal note printed with the page; a drop zone under Supporting documents on every note | the internal note is now read with the page (`GET /v1/authored-invoices/{id}/internal-note`), which the API audits on every open; please confirm that is acceptable or expose it on the detail read. Attachment upload on an issued note as 2.3; files dropped stay with the page |
| 4.14 | Note detail customer card: "VAT OM1100447102 · 0248:OM1100447102" | the customer's Peppol participant identifier on `GET /v1/customers/{id}` (only the VAT number is printed today) |
| 4.15 | A note is always started against an issued invoice: the frames draw no standalone credit or debit | none: `createNote(kind, invoiceId, …)` fits. `/income/credit-notes/new` without `?invoice=` asks for the invoice on the page first |
| 4.16 | The composer prints the note number before it is issued ("Credit note number CRN-0087", "Debit note number DBN-0043") | the draft has no number until `POST /invoice-drafts/{id}/issue` answers it, so the field reads "Assigned when issued". A reserved next number on the draft (or a `GET` for the next in the sequence) would let the page print it as drawn |
| 4.17 | The lists print a draft note's amount ("- <rial> 3.200" on the Draft row of both frames) | the list row carries `totals: null` for a draft, so the Credit / Debit amount cell of a draft reads "—". Please price drafts on the list row (the draft is already priced by `POST /invoice-drafts/{id}/preview`) |
| 4.18 | Debit notes list subtitle: "12 debit notes · <rial> 69.060 charged this quarter" | `issuedThisQuarter: {count, total}` on `GET /summary?type=DEBIT_NOTE` (same basis as `issuedLast30Days`, from the first day of the current quarter); backend D1 provides it. Without it the subtitle shows the list's description |
| 4.19 | Credit note detail: the Refund due and Applied figures | a per-note refund state and amount from the API (with 4.2). Until then (owner, 2026-09-29): when the note is the invoice's only credit note (the invoice's `creditedAmount` equals the note's total) the page derives them exactly, refund = the invoice's overpayment capped at the note's total and applied = total − refund, with the refund banner, Record refund and "Settled by this credit". With more than one credit note on the invoice, both read "Not available yet". On the lists, a missing figure reads "Not available yet", without a rial sign |

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
| 5.8 | **A schedule set up from scratch** (154:164555): customer, invoice details, lines under the composer rules, schedule, notes. "Copy an existing invoice" is only a pre-fill (`?template=<invoiceId>` from the invoice pages, `?copy=<scheduleId>` from the list's Duplicate) | `POST /v1/periodic-invoice-schedules` accepts `templateInvoiceId: null` and a `template { branchId, currency, vatMode, taxCategoryCode, details { subject, purchaseOrderReference, paymentTerms, customerVisibleNote, internalNote }, lines[] }` (each line a draft line's shape plus `itemType`, `hsCode`, `serviceType`); the schedule answers it back. **Either** the schedule carries its own template and each run copies that, **or** the backend creates the template draft from it when the schedule is saved and fills `templateInvoiceId`. The page sends the template today; the route requires an id and ignores the rest |
| 5.9 | The customer ("Change") and the content can change on an existing schedule | `PUT` accepts `customerId` and `template` (sent today) |
| 5.10 | Send automatically / Notify me on each run, as real switches | `autoIssue`, `notifyOnRun` on create, update and the schedule (sent and read today; nothing acts on them). Replaces 5.4 |
| 5.11 | Row menu **Generate invoice** and **Delete** (154:166746); **Duplicate** | a run-now route; a delete route (pause is the only stop today). Duplicate is front-end only |
| 5.12 | "Generated" column ("1 issued · last 18 Jul") and the "Generated this month" card | `runCount`, `lastRunDate` on the schedule (read when present, else the column links to the schedule). Sharpens 5.2 |
| 5.13 | A run row drawn as the invoice it raised: number, "Issued 18 Jul · sent via Peppol", payment pill, amount | `invoiceNumber`, `totalAmount`, `deliveryState`, `paymentState` on a run (read when present). Sharpens 5.5 |
| 5.14 | "Repeats on" chooser (Day 18 of each month / every Saturday) | none: derived from the next run date; choosing a day moves the next run. Nothing to add |
| 5.15 | HS code on goods lines, service type on service lines, hidden for consumers | the search endpoints of 3.1; searched by name over a placeholder list until then |
| 5.16 | "Started" under Upcoming invoices | `createdAt` on the schedule (read when present, else the oldest run). Same as 5.6 |
| 5.17 | Schedule panel "Starts" (154:164555) printed with the date the series began, beside "Next invoice" in the cadence card | a schedule carries only `nextRunDate` (its one editable date; a new schedule sends it as the start). An existing schedule labels the field "Next draft on" so it says what it edits; a `startDate` on the schedule would let the page print "Starts" as drawn and keep the next run separate |

## 6. Payment reminders (`/v1/reminders`)

| # | The design shows | Ask |
|---|---|---|
| 6.1 | Tab counts on the log | totals on the log endpoint |
| 6.2 | Upcoming / queued reminders | a queue endpoint |
| 6.3 | **The queue page** (159:17137): what goes out next per invoice, with the step's name and tone; "Not sending" with a reason; the four cards | worked out on the page from the ladder, `GET /v1/authored-invoices?state=ISSUED` (one page of 100), the log (one page of 100) and the customers' e-mails. A queue endpoint (with totals) would replace four reads and lift the row caps. The ladder read needs `admin.settings.manage`, so a reader sees only the Sent tab |
| 6.4 | "Reminders are held for 24 hours", **Cancel** per row, "Going out tomorrow · still cancellable" | no hold and no cancel exist: the sweep sends on the day at 08:00 Muscat time. The banner and the card say that instead; a hold and a cancel route are the ask |
| 6.5 | **Pause** per invoice or per customer with a reason, a resume date and a note (159:17558); the Paused tab and card | only the tenant switch exists (`PUT /payment-reminders/schedule enabled=false`, drawn as "Pause everything"). The modal is drawn and says it cannot act yet |
| 6.6 | **Send a reminder** (159:17635): which message, To, Subject, preview, "Edit just this one", "Edit the template" | preview and send are wired (the rung is chosen from the ladder). Per-send edits, editable templates, sender / reply-to and the PDF attachment do not exist |
| 6.7 | Settings (159:16749): step names and tones, "Subject: …" per step, Edit message, the template editor (159:17724), "Send myself a test" | message templates per rung (subject, body, tone) in EN and AR; a test-send route. The offsets are edited in the step cards; the rest is drawn and marked |
| 6.8 | "Stop sending when": paid in full, part payment, credit note, customer replies, dispute | settled and opted-out are the server's only stops; the other rules need fields and flags |
| 6.9 | "Sending": send from, reply-to, send at, attach the invoice PDF | tenant-level sender settings; the hour is a deployment setting (shown as 08:00 Asia/Muscat) |
| 6.10 | "Before anything is sent": hold for 24 hours, approve the final notice | hold and approval flags on the schedule |
| 6.11 | "Right now: customers muted" | `deliveryPreferences.automaticPaymentReminders` on the customers list row (read when present) |
| 6.12 | "Paid after a reminder", "Overdue and chased" | derived from the log and the invoices list today; a summary would be cheaper and exact |

## 7. Self-billing

Not integrated yet; the screens are on mock data and follow the frames. Contracts to define when
the backend reaches it: self-billed invoices (list, detail, create), agreements (list, renew).

| # | The design shows | Ask |
|---|---|---|
| 7.1 | The composer (Figma 154:161180) is creatable from scratch: supplier picker over the agreements on file, document number, issue / supply / due dates, terms, branch, currency, document tax category, agreement (locked, from the supplier), subject, PO, lines under the composer rules, payment method / reference, two switches, notes, attachments | a self-billed draft contract carrying all of the above; the page keeps its state in the browser until then |
| 7.2 | Peppol / OTA response code per self-billed document (AB / AP / RE) and the three status tracks on the detail | delivery, OTA reporting and supplier-confirmation states per document |
| 7.3 | The dedicated composer (Figma 154:161180) now writes a self-billed draft: `POST /v1/self-billed-invoice-drafts` (unwrapped `InvoiceDraftRequest`), edited on `/v1/invoice-drafts/{id}`, issued through the shared issue confirmation. The design's "Self-bill number" is sent as `buyerReference` (IBT-010) and the locked "Agreement" field as `contractReference` (IBT-012); "Supply date" is `deliveryDate` | confirm these two mappings, or add `sellerAssignedNumber` / `agreementId` to the self-billed draft if the tenant's own number must not be IBT-010 |
| 7.4 | The composer's "Payment to supplier" section (payment method, payment reference, "Record payment now", "Deliver by email instead") and the attachments drop zone | draft fields for the payment method / reference and the two switches, and an attachments route for drafts; today they stay on the page and are not sent |
| 7.5 | The composer's "Agreed self-bill / Statutory self-bill" choice (statutory = import or reverse charge, no agreement needed) | a `kind` on the self-billed draft, and an issue path that does not require an agreement for the statutory kind; today the server refuses every self-billed issue without an agreement in force |
| 7.6 | The composer's quota counter ("342 / 1,000 used") in the header | an endpoint reporting the plan's document allowance and its use; drawn empty and titled "not reported yet" |
| 7.7 | The list's KPI cards (Raised, Input VAT, Awaiting, Expiring agreements) and per-tab counts (Figma 13:35608) | a self-billing summary (`/v1/authored-invoices/summary` counts every document type). Today Raised, Input VAT and Awaiting are derived from the page in view and say so; Expiring agreements is derived from the agreements list |
| 7.8 | The list's tabs "Awaiting confirmation", "Disputed", "Confirmed" and the "To send" tab | a supplier-confirmation state per self-billed document, and a delivery-state filter on the list. The three confirmation tabs are not drawn (no state exists); "To send" asks for every issued document |
| 7.9 | The agreements list's "Documents" column (count and value per agreement) and its Export button | documents linked to an agreement id (today they are matched to the seller only), and an agreements export route. The column shows "—" with a tooltip; the button says export is not available |
| 7.10 | The design's per-row "Kind" chip on the agreements list (Agreed / Statutory) | see 7.5: only the agreed kind exists, so every row says "Agreed" |
| 7.11 | The self-bill detail frame (Figma 154:167694) is its own page again (`/income/self-billing/:id`, `SelfBillDetailPage`), read from `GET /v1/authored-invoices/{id}` and its receivable, payments, attachments and history, with the customer, branches and agreements joined for the seller card, the branch and the agreement note. The Peppol track is drawn from `deliveryState` / `peppolResponse` / `deliveredAt`; the OTA track and the supplier-confirmation track, the "Awaiting confirmation" pill and the open "Waiting for <supplier> to confirm" item at the top of the history are drawn as the design draws them and marked `TODO(backend)` | see 7.2: an OTA verdict and a supplier confirmation / dispute state per document. Also: a PDF of the document (Download), a validation report (View validation report), a "remind the supplier to confirm" action (Send reminder), attachment upload and removal on the detail; each button says it is not available yet |
| 7.12 | The list's tabs are the frame's seven (All, Drafts, To send, Awaiting confirmation, Disputed, Confirmed, Paid). "Awaiting confirmation" asks for `payment=AWAITING` (issued and unsettled, the nearest state); "Disputed" and "Confirmed" ask for nothing and say confirmations are not reported | the confirmation state of 7.8, and a filter on it |
| 7.13 | The list's four cards read "Raised this month" (issued this month on the page), "Input VAT claimed", "Awaiting supplier" ("Oldest raised N days ago") and "Agreements expiring" (the value of the page's documents under an agreement ending within 30 days, "<supplier> expires in N days") | the summary of 7.7, with the month's totals, the oldest unconfirmed document and the value under expiring agreements |
| 7.14 | The agreements list's frame (Figma 154:158069): a Coverage column ("All branches · OMR" with category chips), "Documents issued" as a count and a value, an "On Peppol" chip per supplier, and a banner naming the lapsed supplier's blocked drafts ("1 draft self-billed invoice for OMR 318.900 is blocked") with "Renew agreement" | an agreement scope (branches, currency, categories), document counts and values per agreement (7.9), and the drafts blocked by a lapsed agreement; the banner names the supplier and the day and opens a new agreement on that supplier |
| 7.15 | The agreements list's pill reads the design's derived states (Expiring soon, Expired, Awaiting acceptance, Terminated) over the four stored ones, and its tabs are the frame's six | an `EXPIRED` and an "expiring" signal from the server would make these its words rather than the screen's |
| 7.16 | The agreements page's blocker sentences and dialogs say "supplier", as the frame does, where the API's vocabulary is "seller" | none; wording only |
| 7.17 | The self-bill composer's quota counter now reads the same stand-in as the invoice composer (`lib/settings` usageForecast) rather than an empty "—", so the header matches the frame (supersedes the "drawn empty" note in 7.6) | as 3.6 / 7.6: a per-tenant document allowance and its use |
| 7.18 | The self-bill detail's Summary adds a "Paid or credited" line above Total due when the receivable reports any, since Total due prints what is still owed and the column must add up | none; drawn from `paidAmount` + `creditedAmount` on the receivable |
| 7.19 | The invoice composer's section 4 (Link related documents, Figma 154:94042 / dialog 154:92924) is live again: the picker and the linked cards work on the page, from the design's sample delivery notes and order forms | as 3.5: order forms and delivery notes from an API, and a draft field that stores the links (`TODO(backend)` in `CreateInvoicePage.tsx`) |
| 7.20 | Self-billed credit note (IBT-003 261): no Figma frame is on record (none in `design/` or this guide), so (decision D6) it reuses the credit-note composer at `/income/self-billing/credit-notes/new?invoice=<id>` (drafts at `/income/self-billing/credit-notes/:id/edit`), opened by a "Credit note" button on an ISSUED self-billed invoice's detail. Created on `POST /v1/authored-invoices/{id}/self-billed-credit-notes` (unwrapped `InvoiceDraftRequest`, `Idempotency-Key`, `selfbilling.create`), then saved and issued on the shared draft routes; saving or issuing opens the note's self-bill detail. The agreement gates at issue are named from `selfBillingRefusals` | a design frame, if the credit-note composer is not the intended look; the composer's "effect on balance" panel reads the receivable, which is `NOT_APPLICABLE` on self-billed documents |
| 7.21 | The self-billed credit note composer reads what is owed, paid and credited from the self-billed invoice's Expenditure payable (`payable` on the invoice detail), as the self-bill detail does, and names the supplier and input VAT instead of the sales wording (owner, 30 Sep 2026) | the payable's `creditedAmount` and `outstandingAmount` must net every issued self-billed credit note on that invoice (today a second note still reads "Already credited 0.000"); until then the server's correctable-amount check is the only guard |
| 7.22 | The self-billed credit note's own detail page does not link to the self-billed invoice it corrects (IBR-032-OM requires the preceding invoice reference on the document) | the note's detail to answer the corrected invoice's id and number (`correctionOf` or similar), so the page can link to it |

## 8. Customers (`/v1/customers`, `/summary`, `/receivables`, `/import`)

Frames: Customers 154:91007, New customer business 154:100734, consumer 154:101043, business with advanced fields 154:101337, quick add "New Customer - Company" 154:92812 and "- Private" 154:93035 (opened from the invoice composer's customer picker). No frame for a customer detail or import; the import follows the Suppliers import frame 163:28227.

| # | The design shows | Ask |
|---|---|---|
| 8.1 | The list's tab counts and cards (All 342, Business 4, ...) | none: the counts come from `/customers/summary` and the cards from its receivables; the frame's own figures do not add up (tabs sum past "8 customers"), so the page prints the summary's |
| 8.2 | **Filters** beside Sort on the list | the list endpoint has no Peppol-state or sending-method parameter. The menu (All, On Peppol, Not connected, QR receipt) narrows the page already loaded (`TODO(backend)` in `CustomersPage.tsx`); please add `peppolDelivery` (or `sendingMethod`) to `GET /v1/customers` so it filters the whole directory and the pager counts it |
| 8.3 | The Receivable cell's third note, "awaiting send" (Bahla Fort Restaurant, 22.300) | the receivable has no delivery state; please add a count of issued-but-undelivered invoices (or their amount) to `CustomerReceivable` so the note can be printed |
| 8.4 | "Company logo" tile at the top of Details on every customer form | the record stores `profile.logo` (`CustomerLogoDto`: object reference, type, size, sha256) but there is no upload that answers one. The tile previews the picked image on the page only; please add `POST /v1/customers/logo` (or a generic upload) returning the DTO |
| 8.5 | Advanced fields: Commercial name and Commercial registration (CR) under the legal name, Website in Contact, IBAN and BIC / SWIFT in Billing & tax defaults | the customer profile has no member for any of the five; the inputs work on the page and are not sent (`TODO(backend)` in `CustomerFormPage.tsx`). Please add `details.commercialName`, `details.commercialRegistrationNumber`, `contact.website`, `billingDefaults.iban`, `billingDefaults.bic` |
| 8.6 | Row menu View, Statement, Delete | no customer detail, statement or delete exists in the API or the frames; the menu offers New invoice and Edit only |
| 8.7 | Quick add "Zone No." beside Street No. and Building No. | the address has no zone member; the field rides in `additionalStreetName` (UBL's district slot). Please confirm, or add a zone / district member |
| 8.8 | Quick add has no Peppol switch | a company added from the invoice is sent as registered on Peppol at `0248:<VAT>` (as the full form defaults); Discovery then reports whether it answers (`peppolDelivery`), and "Not connected" shows until it does. Please confirm the server is happy to verify on create |

---

Questions to the front end: `docs/frontend/` handoffs describe each integrated slice; this file
is the delta the design introduced on 25 September 2026.

---

# Part C: PINT-OM line classification (HS code, service type, ISIC)

The rules, XML binding, code lists and endpoints behind the "Classification" column on the
invoice, note, periodic and self-billing forms, and the business activity (ISIC) in Company
settings and sign-up. Part A rows 3.8 and 3.9 are the screen-side asks for the same data.

## C0. Summary: which codes apply to which invoice type

| Invoice type | Goods / service flag (per line) | HS code (goods lines) | Service type (service lines) | Industrial classification (ISIC) |
|---|---|---|---|---|
| Full tax invoice, B2B | required | required | required | required (copied from the tenant) |
| Full tax invoice, B2G | required | required | required | required (copied from the tenant) |
| Simplified invoice, B2C at the point of sale | not required | not required | not required | not required |
| Credit note / debit note against a full invoice | as the invoice it corrects | as the invoice | as the invoice | as the invoice |

The goods / service flag is **per line**. One invoice can carry goods lines and service lines
together; each line is classified on its own.

## C1. What each code is and what it classifies

| Code | Classifies | Chosen by | Where it lives |
|---|---|---|---|
| **HS code** (Harmonized System, Oman's 12-digit national extension) | the **product being sold** on a goods line | the user, per line, by searching the product name — results read like "Coffee, roasted, not decaffeinated" | on the line |
| **Service type** | the **service supplied** on a service line | the user, per line, by searching the service name | on the line |
| **Industrial classification** (ISIC Rev. 4, Oman's 6-digit code) | the **business issuing the invoice** | set once in Company settings; never asked on the invoice form | on the tenant; the backend copies it into every line |

## C2. When each is mandatory: rule identifiers and conditions

| Rule | Condition |
|---|---|
| **IBR-078-OM** | Every line on a full tax invoice carries the goods / service flag. Simplified invoices are exempt. |
| **IBR-079-OM** | When the line is goods, the line carries an HS code. |
| **IBR-080-OM** | The HS code is exactly 12 digits (Oman's national extension of the 6-digit HS). |
| **IBR-081-OM** | Every line on a full tax invoice carries the industrial classification of the issuer. |
| **IBR-155-OM** and code list **CL-12-OM** | When the line is a service, the line carries a service type from the CL-12-OM list. |

**Simplified invoices** (B2C at the point of sale, the `Consumer` customer type in the composer)
require none of the above. The composer hides the flag, the HS search and the service type search
for that customer type, and sends nothing for them.

## C3. Where each value comes from

- **HS code** and **service type**: chosen per line by the user through a search by name. The
  composer shows the HS search on goods lines and the service type search on service lines, for
  business and government customers only.
- **Industrial classification**: a company-level setting. The user picks it once in Settings ›
  Company (search by name, full 6-digit code, not the 2-digit division). It is stored on the
  tenant and the backend copies it into every line at submission. It is never asked on the
  invoice form.

## C4. XML binding, with a goods line and a service line on the same invoice

The two lines below belong to one full tax invoice. Placeholders in angle brackets are values the
backend fills from the code lists; everything else is the shape.

```xml
<!-- Line 1 — goods -->
<cac:InvoiceLine>
  <cbc:ID>1</cbc:ID>
  <cbc:InvoicedQuantity unitCode="KGM">4</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="OMR">34.200</cbc:LineExtensionAmount>
  <cac:Item>
    <cbc:Name>Coffee beans 1 kg, house blend</cbc:Name>
    <!-- HS code: cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode, listID="HS" -->
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="HS">090121000000</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <!-- Industrial classification of the issuer, copied by the backend on every line -->
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="<industrial-classification listID from the codelist>">561010</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <cac:ClassifiedTaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>5</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:ClassifiedTaxCategory>
    <!-- Goods / service flag: cac:Item/cac:ItemSpecificationDocumentReference/cbc:DocumentTypeCode,
         with schemeName="MP" on cbc:ID -->
    <cac:ItemSpecificationDocumentReference>
      <cbc:ID schemeName="MP"><line item identifier></cbc:ID>
      <cbc:DocumentTypeCode><goods token from the goods/service code list></cbc:DocumentTypeCode>
    </cac:ItemSpecificationDocumentReference>
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="OMR">9.500</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>

<!-- Line 2 — service -->
<cac:InvoiceLine>
  <cbc:ID>2</cbc:ID>
  <cbc:InvoicedQuantity unitCode="HUR">4</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="OMR">36.000</cbc:LineExtensionAmount>
  <cac:Item>
    <cbc:Name>Barista training, September session</cbc:Name>
    <!-- Service type from CL-12-OM, on the same classification element with the service list id -->
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="<service-type listID from the codelist>"><CL-12-OM code></cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="<industrial-classification listID from the codelist>">561010</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <cac:ClassifiedTaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>5</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:ClassifiedTaxCategory>
    <cac:ItemSpecificationDocumentReference>
      <cbc:ID schemeName="MP"><line item identifier></cbc:ID>
      <cbc:DocumentTypeCode><service token from the goods/service code list></cbc:DocumentTypeCode>
    </cac:ItemSpecificationDocumentReference>
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="OMR">9.000</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>
```

Fixed by the specification: the goods / service flag sits in
`cac:Item/cac:ItemSpecificationDocumentReference/cbc:DocumentTypeCode` with `schemeName="MP"` on
`cbc:ID`; the HS code sits in `cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode`
with `listID="HS"`. The exact tokens for the goods / service flag, the `listID` for the service
type and the `listID` for the industrial classification come from the code lists in §C5 — take
them from there rather than from this page.

## C5. Source code lists and where to get them

| List | Where |
|---|---|
| HS codes, 12 digits, from the Royal Oman Police Directorate General of Customs | `https://docs.peppol.eu/poac/om/pint-om/trn-invoice/codelist/HSCodes-1` and `…/codelist/HSCodes-2` — split in two because of size |
| Service types (CL-12-OM) | the same `/codelist/` folder |
| Industrial classification (ISIC, Oman 6-digit) | the same `/codelist/` folder |
| Goods / service flag tokens | the same `/codelist/` folder |

`com.helger.peppol:peppol-om` on Maven carries the PINT-OM Schematron and these code lists as a
maintained dependency, from the same author as the phive library already in the stack. Prefer it
to hand-copied lists.

## C6. The "Other" fallback

HS code `000000000000` is a valid value. A user who cannot classify a product picks "Other" in
the HS search and can still issue a valid invoice; the composer maps "Other" to that code.

## C7. What the backend must provide to the front end

1. **Search endpoints** returning `{ code, name }` (English and Arabic names) for
   - HS codes: `GET /v1/code-lists/hs?q=coffee` — searched by product name, paged, 12-digit codes,
     "Other" (`000000000000`) always findable;
   - service types (CL-12-OM): `GET /v1/code-lists/service-types?q=training`.
   The front end ships small placeholder subsets until these exist.
2. **The tenant's industrial classification**: read and write on the company settings resource
   (`GET/PUT /v1/settings/company`, field `industrialClassification` with the 6-digit code and the
   name), plus a search endpoint `GET /v1/code-lists/isic?q=` for the picker.
3. **Draft line fields**: `lines[].itemType` (`GOODS` \| `SERVICE`), `lines[].hsCode` (12 digits,
   goods only), `lines[].serviceType` (CL-12-OM code, services only). The industrial classification
   is **not** a line field on the draft; the backend copies the tenant's value at submission.
4. **Validation before submission, not after**: a goods line on a full tax invoice with no HS code,
   a service line with no service type, or a tenant with no industrial classification is refused
   when the draft is issued (`POST /v1/invoice-drafts/{id}/issue`), with a problem detail naming
   the line and the rule (`IBR-079-OM`, `IBR-155-OM`, `IBR-081-OM`), so the composer can point at
   the line. Simplified invoices skip all three checks.

## C8. Where the industrial classification sits in the product

- **Screen**: Settings > Company profile, section "Who you are", field **Business activity (ISIC)**: a
  search box over activity names (English and Arabic) that stores the 6-digit code. The invoice
  composer prints it read-only under the invoice details ("Business activity: 561010 · Restaurants
  and cafés", with a link to Company settings) and never asks for it.
- **Sign-up**: the Business identity step (`/business-identity`, next to the CR number and VATIN)
  asks for it as **Business activity (ISIC)**, required, pre-filled from the specialty chosen on
  the Sub business type step (`src/lib/codeLists/isicBySubType.ts`) and searchable; the review
  page prints it. The value is **not sent yet**: `POST /v1/auth/signup/business-identity` needs an
  `industrialClassification` field (6-digit code) that lands on the tenant's company settings at
  approval, so the Settings > Company field shows it from day one.
- **What the front end holds today**: a placeholder list of about a hundred common Omani activities
  (`src/lib/codeLists/isic.ts`) so the search has something to find. It is not the full national
  list and must not be treated as one.
- **What the backend owns**: the complete Oman 6-digit ISIC Rev. 4 list from the PINT-OM code-list
  folder in §C5 (or `peppol-om` on Maven), served by `GET /v1/code-lists/isic?q=`; the tenant's choice
  stored on `GET/PUT /v1/settings/company` as `industrialClassification { code, name }`; the value
  copied onto every line at submission (IBR-081-OM); and the refusal at issue when a tenant has none.
- **Also in this repo**: `INCOME.md` rows 3.8 and 3.9
  list the same asks screen by screen, next to every other place where the Income UI is ahead of the API.

---

# Part S: sign-up answers the API does not take yet

Both are UI only today. Sign-up works end to end without any backend change; these rows say
what to add so the answers are kept.

| # | Screen and what it asks | Today | What the backend should add |
|---|---|---|---|
| S.1 | **Tell us about your business** (`/about-business`): third question "Will you use Fawtir POS?", one tick card, unticked by default | Held in the page state only. Ticked: the flow is unchanged (Business type, then Sub business type). Unticked: the page saves the profile, then silently posts `business-category = FOOD_AND_BEVERAGE` and `business-type = RESTAURANT` so the step guard and `submitForReview` accept the registration, and goes straight to Business identity. The placeholder is never shown to the user | A `usesPos` boolean on `POST /v1/auth/signup/business-profile`, and category and type made optional when it is false (both in the step order and in `submitForReview`). Until then, a non-POS tenant's stored category and type are placeholders, not facts: do not use them for reporting or defaults. The front end drops `recordNoPosDefaults` in `src/lib/identity/onboarding.ts` once this lands |
| S.2 | **Your business identity** (`/business-identity`): "Business activity (ISIC)", required, searchable, pre-filled from the specialty for POS users, empty for the others | Kept in the page state and shown on the review page; not sent | `industrialClassification` (6-digit ISIC Rev. 4 code) on `POST /v1/auth/signup/business-identity`, stored on the tenant's company settings at approval; the full list behind `GET /v1/code-lists/isic?q=`. See part C §C7 and §C8 of this guide |

## Update 2026-09-27: what the Create Invoice integration settled

Append-only; the rows above keep their numbers. Where a row above says "placeholder" or "not sent", this is the current state.

| Ref | Was | Now |
|---|---|---|
| 3.8 HS code | placeholder subset `codeLists/hs.ts`; refused by the request | **Server search.** `GET /v1/code-lists/hs?q=&limit=` (backend PR #364) over the published 14,313-code list; the picker shows the last two levels of the heading path with the code beneath, and always lists "Other" (`000000000000`, on the published list) at the foot so nobody is stuck for a code. `hs.ts` is gone. The draft line carries `classification.goodsOrService / hsCode / serviceTypeCode`, and the backend refuses a code that is not on the list (`HS_CODE_UNKNOWN`) |
| 3.8 Service type | required on every service line | **Export of services only** (IBR-155-OM; Abdul Hameed, 2026-09-26). A service line is sent as `goodsOrService: 'S'`; the backend fills 00000000. The picker holds the published 21 CL-12-OM codes |
| 3.9 Business activity | placeholder, 561010 | `GET/PUT /v1/company-profile/industrial-classification` (backend #357), one per company. **A Business or Government invoice is refused at issue without it** (`INDUSTRIAL_CLASSIFICATION_REQUIRED`); Consumer invoices are not. The picker holds the published 1,819 codes and names; `GET /v1/code-lists/isic?q=` exists (#364) but the web still uses its bundled copy of the same list |
| 3.14 / S.2 Sign-up activity | required, not sent | **Skippable, and sent when chosen.** `SignupBusinessIdentityRequest.industrialClassificationCode` (optional, checked against the ISIC list; backend #367) is stored on the sign-up and becomes the company's activity when the registration is submitted, which also creates the company's settings row (OMR, Asia/Muscat). A Business user who skipped it is guided to Company settings |
| tax reason | free text for Exempt only | **Coded.** Zero-rated takes `VATZR-OM-01..16` and Exempt `VATEX-OM-01..12` in `taxCategory.exemptionReasonCode` (backend #361); AE, G and O keep text. Credit and debit notes carry the invoice line's code. The self-billed and periodic composers take one reason for the whole document, under the tax category and only when it is Zero-rated, Exempt (code) or Reverse-charge (text); it goes on every line. The periodic template's reason is sent with the template, which the backend does not store yet (see `PeriodicTemplateDto`) |
| Consumer | address required | A Consumer needs no address (IBR-019-OM excludes simplified); the buyer country defaults to OM (backend #360) |
| Units | 10 in reference data | 17: the 10 offered plus the Codes Master's 7 missing ones (backend #358) |
| Amounts | unbounded | a line above 999,999,999,999.999 is refused (`LINE_AMOUNT_TOO_LARGE`); the composer flags it first |
| Arabic | | The published lists carry English only. The Arabic names (ISIC, HS, service types, VAT reasons) are machine-translated and pending human review: HS and ISIC come from the server with `nameAr` (backend #370, one dictionary file to correct); the rest are bundled in the web. Without #370 the HS picker falls back to English |

## Update 2026-09-27 (branches): a brand-new company could not create its first branch

Found while testing onboarding through to Create Invoice for a fresh sign-up: Create Invoice's
branch picker was empty, and Settings › Branches turned out to be entirely unwired design mockup
(`src/lib/settingsCompany.ts`'s `BRANCHES`, a fictional "Al Bahja Coffee" with three branches) —
every tenant saw the same fixed sample data, and there was no way to add a real one. A brand-new
company could sign up and never be able to create an invoice.

**The backend needed nothing.** `BranchManagementController` and `BranchDirectoryController`
(create, list, get, update, head office, invoice prefix, and a purpose-built `/branches/overview`
projection for exactly this screen's header cards and rows) were already complete, tested and on
`main`, merged well before this was noticed.

**Wired the frontend to it** (`src/api/settings/branches.ts`, `BranchesPage.tsx`,
`AddBranchPage.tsx`): the overview and the create/edit form now call the real endpoints. The design
draws a few facts the backend does not model per branch — its own javadoc says so — and those
cells fall back rather than invent the figure:
- Who manages a branch, and the roster's own initials — there is no branch-manager concept, and a
  person has one home branch, not a roster; the cell shows a plain headcount.
- Which branch most recently opened, and per-till usage recency — not tracked; the KPI notes and
  the till cell drop the specific claim rather than state a wrong one.
- The Arabic name, the opening date, staff assignment at creation, and the "behaviour" switches on
  Add a branch — no backing field anywhere (a person's branch is set on their own profile, not
  here). Those panels are unchanged and still shown, exactly as designed; they are just not sent.
- `code`, which the design's form never asks for, is derived from the branch name (first letters,
  upper-cased) since the database requires one, unique per tenant.
- Creating a company's first-ever branch designates it head office automatically, since the design
  always shows exactly one and there is no first-branch case in which the reader would pick
  otherwise.

The "What it inherits" and "Cost" panels on Add a branch, and the company switcher in the shell
around every settings screen, are still the same unrelated mock company ("Al Bahja Coffee") — a
separate, larger gap (the app shell's own company/plan data), not touched here.

## Update 2026-09-27 (Participant ID): the console review is drawn, not connected

A company cannot issue until its Peppol Participant ID is verified (`SELLER_PARTICIPANT_NOT_VERIFIED`),
and nothing in the web app could review one. The owner decided (2026-09-27) that an operator
approves it on the same screen as the company: Console › Verification › the company
(`VerificationCompanyPage`), in a "Peppol Participant ID" card beside the Verify / Reject panel
(`src/pages/ConsolePage/verification/ParticipantPanel.tsx`). There is no Figma frame for it.

The card shows the proposed ID (`0248:` + VAT number), a field to approve another
ID (an OM12 group VAT number, or an ID already registered elsewhere), and Approve ID / Reject ID.
Until the backend answers the rows below, the status reads "Not reviewed", both buttons are
disabled, and the card says the decision is not connected yet.

| Ref | Screen needs | Backend to add |
|---|---|---|
| P.1 | The company's Participant ID and its review status on the verification screen | `participantId` (scheme + value) and `participantStatus` (NOT_SUBMITTED / PENDING / VERIFIED / REJECTED, with the reason and who decided) on `GET /v1/platform/companies/{id}` |
| P.2 | Approve ID, with the ID the reviewer confirmed or typed | a route to approve (body: scheme, value, the revision it quotes), four-eyes like the company decision, starting SMP onboarding once verified |
| P.3 | Reject ID, with a reason | a route to reject, with a reason list, emailing the registrant |
| P.4 | The review in the company's history list | participant events in `verification-history` |
| P.5 | Sign-up's Business identity step shows the candidate `0248:` + VAT number, read-only, and the registration carries it to the console (owner, 2026-09-27: submitted during onboarding, never typed) | on registration submit, store `0248:` + the VAT number as the company's pending Participant ID; backfill the same for companies registered before this |

## Update 2026-09-27 (Participant ID), later the same day: most of this already existed

The rows above assumed nothing backed this card. Reading the actual SMP module
(`peppol/smp/adapter/in/rest/SmpDataBlockerAdministrationController.java`,
`SmpTenantDataSubmissionController.java`) found P.2 and P.3 already built, as one combined route:
`POST /v1/platform/peppol/smp/tenants/{tenantId}/data-submissions/{submissionId}/verify` (body:
`expectedOptimisticLockVersion`, `approved`, `reasonCode`) does the approval or the rejection,
enforces four-eyes, validates the candidate against the active PID policy, and starts SMP
auto-onboarding on approval — all of it already tested server-side. **It takes no reviewer-typed
scheme or value.** The card's "type another ID" field never had anything to send it to; it is
removed rather than left connected to nothing.

P.1 was the one real gap: no platform-side read took a bare `tenantId`, only `(tenantId,
submissionId)` once a submission id is already known. Added
`GET /v1/platform/peppol/smp/tenants/{tenantId}/data-submissions/current` (same controller, same
`platform.support` + `platform.smp.compliance.approve` gate the decision itself already required —
not a softer view tier, since no weaker permission exists for this blocker type). `ParticipantPanel`
now reads it, shows the tenant's own filed candidate and status for real, and Approve/Reject call
the real `verify` route with a reason code the reviewer types (no fixed code list exists yet, so it
is a free `[A-Z0-9_-]{3,80}` field, uppercased as typed). P.4 (history) is unconfirmed either way —
not attempted here.

**Still open, not solved by this**: the page (`VerificationCompanyPage`) is gated on
`platform.tenants.manage`; the decision this card makes needs `platform.support` +
`platform.smp.compliance.approve`, a deliberately separate role
(`core/.../PlatformRoleCatalogue.java`). A reviewer who lacks the second pair now sees the read
itself refused as "no access" — correct behaviour, not a bug, but it means "one reviewer handles
both in one visit" is not actually true today unless that reviewer's account also holds
`PLATFORM_SUPPORT`. That is Zain/Abdul's call, not a default this change makes.

**Also still open**: nothing anywhere lets a tenant submit its own candidate Participant ID in the
first place (`SmpTenantDataSubmissionController`'s `POST /v1/peppol/smp/data-submissions` has no
frontend caller). `PeppolTaxPage.tsx` is the settings screen with "Peppol" in its name, but it is
entirely mock data presenting an *already-live* identity (certificates, renewal, visibility toggles)
— the wrong lifecycle stage for a first-time submission, and building a new screen for that stage
has no Figma frame and no decision yet on where it belongs (onboarding vs. a new settings screen).
Not started, on purpose, pending that decision.

## Update 2026-09-28 (invoice import)

The Invoices list's **Bulk upload** button now opens the import dialog of the approved Invoice
Import guide (owner, 2026-09-28): one dialog, four steps (prepare, validate, preview, result), a
template per invoice kind, drafts only, the whole file or nothing. The frontend is
`src/components/invoice/InvoiceImportModal.tsx`, its calls are `src/api/invoices/import.ts`. None
of the routes exist; until they do, the dialog says the import is not available. No Figma frame:
owner-approved exception (handbook 3.1).

| #   | What the dialog needs | Backend |
| --- | --- | --- |
| I.1 | The template per kind, in the user's language, with the reference sheet and Excel data validation | `GET /v1/invoices/import/template?kind=CONSUMER\|BUSINESS\|GOVERNMENT&language=en\|ar`, an `.xlsx` |
| I.2 | Check the whole file, create nothing | `POST /v1/invoices/import/check`, multipart `file`, `kind`, `language`; answers `InvoiceImportBatchDto`. Refuse above 2,000 rows or 10 MB before parsing. Messages in `language`, plain, by row (header included) and column, with a suggested correction where one can be inferred |
| I.3 | Background work above 50 rows, with progress | `state` `CHECKING`/`CREATING` and `processedRows` of `totalRows`; the dialog reads `GET /v1/invoices/import/{id}` every 1.5 s until it settles |
| I.4 | The preview | `summary` (invoices, lines, total, `byCustomer`), `inferred` (what was matched by name, for the user to check), `unresolved` (descriptions without a catalogue match on Business and Government files, once per distinct description with its `itemType`) |
| I.5 | Create the drafts, with the codes chosen in the preview, stored against the description for next time | `POST /v1/invoices/import/{id}/commit`, body `{ classifications: [{ description, itemType, code }] }`; answers the batch, `CREATED` with `created: [{ reference, invoiceId, draftNumber, customerName, total }]` (or `CREATING` above 50 rows). Uses the existing draft route only, never issue |
| I.6 | Cancel a checked file, leaving nothing | `DELETE /v1/invoices/import/{id}` |
| I.7 | The downloadable report | `GET /v1/invoices/import/{id}/report` |
| I.8 | Duplicate upload warning | hash the file; `duplicateOf: { batchId, uploadedAt, uploadedBy }` when the same hash was uploaded before. Keep the original file with who uploaded it and when |
| I.9 | Consumer files create the walk-in customer from a name and optional contact; refuse without `customer.manage` (the dialog already hides the upload and names the permission). Blank unit: EA for goods, C62 for services. Blank branch: head office. Only OMR. A reason on every non-standard line: VATZR-OM / VATEX-OM codes, free text for reverse charge, export and outside scope. Store the Goods/Service flag on the draft line | server-side rules of the check |
| I.10 | "See the drafts" opens the Drafts tab; filtering to this batch's drafts needs a list filter | optional `importBatchId` filter on `GET /v1/invoices`; a notification when a background import finishes |

## Update 2026-09-28 (zero-rating check against the item)

Today nothing compares a line's HS code with its VAT category. A goods line can carry an HS code
for an ordinary 5% product and still be sent as Zero-rated with a `VATZR-OM` reason; only the
consistency rules are enforced (Z needs 0% and a VATZR code, E a VATEX code, never mixed). The
owner approved the following on 2026-09-28. **Priority: after live OTA submission.**

**The split.** Reasons with a published HS list can be checked against the item:
`VATZR-OM-01` (food), `VATZR-OM-02` (medicines and medical equipment), `VATZR-OM-03` (investment
gold, silver, platinum). Export and transport reasons depend on the sale, not the item, and are
never checked against the HS code.

**Manual invoice creation: warn, do not block.** The user types the line, HS code and category
themselves, so this is where mistakes happen. The one hard stop is an export reason on a customer
whose country is Oman: that is a fact, not a judgement.

**Catalogue (and POS, which sells from it): a mandatory check when the product is saved.** The
product carries its HS code and VAT category, validated once when it is created or edited, where
the user has time to get it right. Lines filled from a product then need no warning, at the till
or in the composer.

| #   | What the screen needs | Backend |
| --- | --- | --- |
| Z.1 | The lists, each with its effective dates | a table of eligible HS codes per reason (`VATZR-OM-01`, `-02`, `-03`), every entry with `effectiveFrom` / `effectiveTo`. Owner's note: the food list grows from 488 to 807 codes effective 1 October; the figures and date are to be confirmed against the published decision when loading it |
| Z.2 | Judge a line by the **invoice date**, never today's | the check reads the list in force on the invoice's issue date (the draft's intended date while a draft), so a September invoice is judged against the September list |
| Z.3 | Line warnings in the composer (manual invoices, and the invoice import's preview) | the draft preview returns per-line warnings, not refusals: `ZERO_RATED_HS_NOT_LISTED` (Z with reason 01/02/03, HS code not on that reason's list), `LISTED_ITEM_CHARGED_STANDARD` (HS code on a zero-rated list, line at 5%). Each names the line, the reason and the list's date. Consumer lines carry no HS code and get no item check |
| Z.4 | The one hard stop on manual invoices | refuse an export zero-rating reason (e.g. `VATZR-OM-09`, and category G) when the customer's country is `OM`: `EXPORT_REASON_DOMESTIC_CUSTOMER` |
| Z.5 | Confirmation before issuing, and who confirmed | issue refuses while unconfirmed warnings remain (`ZERO_RATING_UNCONFIRMED`) and accepts `{ confirmedWarnings: [codes per line] }`; store the confirming user and time on the invoice for audit, and show it in the invoice's history |
| Z.6 | Check again at issue | re-run Z.2 to Z.4 when the draft is issued, against the issue date: a draft can sit for weeks and the list can change under it. A warning the user confirmed earlier but that no longer applies is dropped; a new one needs a new confirmation |
| Z.7 | **Future plan, not now.** The catalogue's mandatory check | on product create and edit: a product with reason 01/02/03 whose HS code is not on that list (in force today) is refused (`PRODUCT_ZERO_RATING_HS_MISMATCH`); a product may not carry an export or transport reason as its default, since those belong to the sale. Lines filled from a product skip Z.3 unless the user changed the category or HS code on the line |

Frontend (approved without a Figma frame, existing components only, no other screen touched; see
the handbook's exceptions): the warning under the affected line, and a confirmation step in the
issue dialog listing the lines. Not built yet.

### Zero-rating check, phase 1: food only (owner, 2026-09-28)

Phase 1 checks **`VATZR-OM-01` (food) only**. Rows Z.1 to Z.3, Z.5 and Z.6 apply to the food list;
Z.4 (export hard stop) and Z.7 (catalogue check at product save) and reasons 02 and 03 come later.
Estimate: about a day, most of it loading and checking the list.

| #    | Phase 1 detail | Backend |
| ---- | --- | --- |
| Z.8  | The food list, with history | `zero_rated_food (hs_code char(12), name_ar, name_en, decision_ref, effective_from date, effective_to date null)`. Load the new list from the Arabic decision (owner's note: 807 codes, decision 225/2026, effective 2026-10-01; confirm the reference and counts against the PDF). The previous list (488 codes) stays with `effective_to = 2026-09-30`. If the decision lists any item at fewer than 12 digits, store the prefix and match by prefix |
| Z.9  | The lookup | `invoice_date >= effective_from AND (effective_to IS NULL OR invoice_date <= effective_to)`; a plain `BETWEEN` never matches the current list, whose `effective_to` is null |
| Z.10 | Which date | a draft at preview: today; at issue: the issue date; a credit or debit note: the **original invoice's** date, never `now()` |
| Z.11 | The check, per goods line, at preview and again at issue | service line: skip. Category Z with reason `VATZR-OM-01` and HS code not listed for that date: warning `ZR_FOOD_NOT_LISTED`. Category **S** (standard) with an HS code listed for that date: warning `ZR_FOOD_CHARGED_STANDARD` (the business may be charging VAT that is not due). Any other category: skip |
| Z.12 | Consumer lines | a consumer invoice prints no HS code, so the check uses the catalogue product's stored HS code when the line came from a product; a typed consumer line with no product is not checked |
| Z.13 | The warning shape | in the preview response, per line: `{ line, code, severity: "warning", hsCode, effectiveFrom, message }`. The screen translates by `code` with `hsCode` and `effectiveFrom` (English and Arabic); `message` is a fallback only. Nothing is blocked |
| Z.14 | The confirmation record | stored against the invoice: user, time, and per line the warning code with the line's HS code, category and reason as confirmed. A change to any of those after confirming voids that line's confirmation and it must be given again |

**Phase 1 amended (owner, 2026-09-28): where the food check runs.** A simplified (consumer)
invoice carries no classification, but the catalogue product still has its HS code, so for B2C the
check belongs at product setup, not at the sale. **Future plan, not now:** the catalogue and POS
check (Z.15) is deferred until that work starts; see the amendment below.

| #    | Path | Where the check happens |
| ---- | --- | --- |
| Z.15 | **Future plan, not now.** POS and catalogue | **At product create and edit**: HS code against the food list in force that day. A product marked Zero-rated with `VATZR-OM-01` whose HS code is not listed is refused; a listed product set to Standard is warned. Every sale of the product then inherits its rate and is not checked again. When a new list takes effect (e.g. 2026-10-01), re-check the stored products against it and flag the ones whose rate no longer matches, since a product validated in September can be wrong in October |
| Z.16 | B2B and B2G manual invoices | At draft preview and again at issue, per Z.9 to Z.14: the line carries its HS code |
| Z.17 | B2C manual invoice, typed line | **No check, accepted.** A typed consumer line has no HS code and no product to match. Manual B2C invoices are rare (shops sell through the till), so the exposure is small. Matching the description against the annex's Arabic and English names was considered and rejected: fuzzy food-name matching gives both false warnings and missed ones |

Z.12 (a consumer line filled from a catalogue product uses the product's HS code) is superseded by
Z.15: the product was checked when it was saved, so the sale needs no check.

**Phase 1 amended again (owner, 2026-09-28): the catalogue and POS check is deferred.** Catalogue
and POS are not being worked on now, so **Z.15 is not part of phase 1**; it stays here as the plan
for when that work starts. Phase 1 is B2B and B2G manual invoices only (Z.8 to Z.11, Z.13, Z.14,
Z.16). B2C invoices, whether from a product or typed (Z.12, Z.17), get no check for now.

## Update 2026-09-28 (VAT category per line on every composer)

The handbook's invoice-form rule (VAT category picked per line, the header "Default tax category"
setting new lines) now holds on every composer, not only Create Invoice:

- **Self-billed invoice:** each line picks its category, and a zero-rated, exempt or other no-VAT
  line carries its own reason. The draft request already takes `taxCategory` per line, so nothing
  changes on the wire beyond lines now differing from each other.
- **Periodic invoice:** the same on the template's lines. `PeriodicTemplateLineDto.taxCategory`
  carries each line's own code and reason; the template-level `taxCategoryCode` and reason are the
  header's default only.
- **Debit note, lines added on the note** (additional items, a flat charge): the added line picks
  its own category and reason instead of copying the invoice's first line. Lines copied from the
  invoice keep the invoice's category, unchanged.

| #   | What the screen now sends | Backend |
| --- | --- | --- |
| V.1 | Periodic template lines with different categories and per-line reasons | store `taxCategory` (code, rate, `exemptionReasonCode`, `exemptionReason`) per template line, and issue each run's invoice from the line's own category, not the template's default |
| V.2 | Outside scope (O) never mixed with taxed lines on one document (EN 16931 BR-O-11 to BR-O-14) | the screens refuse it before saving; the backend should refuse it too, on drafts and templates |
| V.3 | A debit note's added line at a category the invoice never used (e.g. a 5% delivery charge on a zero-rated invoice) | accept per-line categories on note lines that do not reference an invoice line |

## Update 2026-09-28 (checked against the published PINT-OM rules, PDK 1.4.4)

Checked on docs.peppol.eu (PINT-OM billing and self-billing, invoice and credit note rules, code
lists, shared PINT rules). Three corrections:

1. **Only four VAT categories exist in Oman: S, Z, E, O** (code list OMTaxCat, rule CL-04-OM, the
   same for invoices, credit notes and self-billing). **Reverse charge (AE) and export (G) are not
   PINT-OM categories.** An export is zero-rated (Z) with VATZR-OM-09 (services), -10 (direct
   export of goods), -11 (indirect) or -12 (re-export); reverse charge, import of services and
   profit-margin schemes are transaction types in BTOM-001, not categories. Every composer now
   offers only S, Z, E and O (`omanTaxCategories` in `lib/invoiceDraft.ts`); periodic invoices
   gain Outside scope and lose Reverse charge.
2. **Row V.2 is withdrawn.** PINT-OM has no counterpart of EN 16931 BR-O-11 to BR-O-14: an
   out-of-scope line may sit on the same document as S, Z or E lines (ALIGNED-IBRP-O-01-OM only
   asks for exactly one O breakdown). The screens no longer refuse the mix; the backend should not
   either.
3. **Reasons:** Z and E need a reason code (IBR-069-OM; CL-10-OM VATZR-OM-01..16, CL-05-OM
   VATEX-OM-01..12). S may carry neither code nor text (ALIGNED-IBRP-S-10-OM). O must not carry a
   code (IBR-070-OM) and no rule requires a text for it. The screens still ask for a written reason
   on O because the reference data marks O0 `exemptionReasonRequired: true`.

| #   | Ask | Backend |
| --- | --- | --- |
| V.4 | Stop serving AE0 and G0 as active tax categories, and refuse them on drafts, notes and templates | `GET /v1/reference-data` taxCategories: S5, Z0, E0, O0 only |
| V.5 | Decide whether O needs a written reason at all | today O0 is `exemptionReasonRequired: true`; PINT-OM does not require IBT-120 for O. If it stays optional, set it false and the screens stop asking |
| V.6 | A custom-amount credit note may now carry several lines, each at its own category, so a mixed invoice is credited at each rate | accept several added lines on a credit note (no PINT-OM rule limits a credit note to one category) |

Also confirmed for credit and debit notes: preceding invoice reference, issue date and UUID are
mandatory (IBR-032-OM), and the reason code BTOM-032 is one of CAN, VAT, VAL, QTY, OTH
(IBR-023-OM, CL-02-OM), as the screens already send.

## Update 2026-09-29 (invoice screens: remaining gaps closed)

Answered by the backend and wired here. The backend PRs are fawtir-backend #387 (import commit, report,
background), #388 (V.4, V.5, NET15) and #389 (1.1 filter, 2.13 uploader). This web change needs
all three merged first.

- **1.1** The To send tab asks for `delivery=TO_SEND`. The summary's `toSend` reads the same
  definition (issued, not delivered on Peppol, not marked as sent by hand), so the badge and the
  rows agree.
- **1.4 / 2.x Duplicate** An invoice's Duplicate (list row menu and detail action) opens
  `/invoices/new?duplicate=<id>`: the composer is filled from that invoice and nothing is created
  until the reader saves. Dates, number, payments and the internal note are not copied. Credit notes,
  debit notes and self-billed documents keep the "not available" notice, because they have their own
  composers. **1.4 Send** stays open: it waits for Peppol dispatch.
- **2.3 / 2.13** An attachment row names its uploader (`attachedByName`). The document kind is
  still open; the file type stands in for it.
- **3.4** The payment method is saved with the draft (`details.paymentMethod`, IBT-081). "Mark as
  paid" and "Mark as sent manually" apply when the invoice is issued:
  - "Mark as paid" records a payment of what the invoice owes (`POST .../payments`), with the
    reference and date typed in the composer.
  - "Mark as sent manually" records the offline delivery (`POST .../manual-delivery`).
  - A refused mark is named on the invoice page; the invoice is issued either way.
  - Reference and date are not draft fields; this is recorded here, not asked.
- **3.5 attachments** Files added in the composer upload to the draft when it is saved. Those
  already stored are listed and can be removed while it is a draft. Linking trade documents is still
  open.
- **3.11** NET15 is in the platform's terms (V210). EOM and ADVANCE are not yet, by decision:
  they are not "net N days".
- **V.4** AE0 and G0 are served inactive (V210). The `DESIGN_REFERENCE` fallback no longer lists
  them.
- **V.5** Outside scope takes an optional reason: no required asterisk and no "reason missing"
  check on any composer (`reasonRequired` in `lib/invoiceDraft.ts`). A typed reason is still sent.

## Update 2026-09-29 (debit notes: what the web now reads and sends)

The debit notes screens were wired to what the API now answers. Rows above keep their numbers;
this is what each now stands at.

- **4.1, debit notes:** the Debit notes list reads its tab counts and four cards from
  `GET /v1/authored-invoices/summary?type=DEBIT_NOTE` (Charged · 30 days from
  `issuedLast30Days`, Awaiting from `awaitingTotal` / `awaiting`, Collected from `paidTotal` /
  `paidInvoices`, Overdue from `overdueTotal` / `overdueInvoices`, its "days late" from
  `oldestOverdueDueDate` against `asOf`). The 200-row read is gone for debit notes. **Credit notes
  still read their figures off the notes** (4.1 stays open for them). The subtitle's quarter comes
  from `issuedThisQuarter` (row 4.18, provided by D1).
- **4.4, lines added on a note:** a line with no catalogue product now leaves `productId` and
  `productCode` out of the draft line instead of sending empty strings. Nothing to add.
- **4.6, draft attachments:** files dropped on the composer are uploaded to the draft
  (`POST /v1/authored-invoices/{id}/attachments`, `invoice.attachment.manage`) after it is saved
  and before it is issued; a failed upload leaves the draft saved, and a file is not sent twice.
  The Peppol send switch (the other half of 4.6) is still open.
- **4.7, paid date:** a paid debit note row prints "Paid <date>" from `payment.lastPaymentDate`.
  The method (`payment.lastPaymentMethodCode`) is typed and read but has no drawn place in the
  row yet; the row is otherwise unchanged.
- **4.10, classification on note lines:** already sent as `lines[].classification`; a reopened
  draft now keeps each added line's classification and its `exemptionReasonCode`, so it sends
  back what it was saved with.
- **4.14, participant id:** the note detail's customer card prints the Peppol participant id from
  `profile.details.peppolParticipantId` beside the VAT number, when the record has one.

## Update 2026-09-29 (credit notes: what the web now reads and sends)

The credit notes screens were wired the same way as the debit notes above. Rows keep their
numbers; this is what each now stands at. Everything here needs backend D1 (summary by type) and
C2 (`correctionReasonDetail`) merged first.

- **4.1, credit notes:** the Credit notes list reads its tab counts, subtitle and cards from
  `GET /v1/authored-invoices/summary?type=CREDIT_NOTE`: Credited · 30 days from
  `issuedLast30Days`; Applied to invoices (card and tab count) from `issuedTotal`, because no
  refund is recorded and every issued credit note is therefore applied against its invoice; the
  subtitle "N credit notes · X credited this quarter" from `issuedThisQuarter`; All, Drafts and
  To send counts from `all`, `drafts` and `toSend`. The 200-row read is gone for credit notes too
  (the list refuses `size` above 100). The Refund due and Refunded cards read "Figures
  unavailable" rather than 0, which would be a false figure (4.2).
- **4.2 and 4.3, the tabs:** Applied now asks the server for `state=ISSUED` (every issued credit
  note), so its pages and count are the server's. Refund due and Refunded stay drawn and show
  their empty state without asking the server anything until refunds are recorded (4.2). To send
  is unchanged: one page of issued notes narrowed on the page, until the list takes a delivery
  filter (4.3).
- **4.9, reason detail:** a note draft now sends `details.correctionReasonDetail`, the chosen
  reason's key (`returnedGoods`, `goodwillDiscount`, `freightOmitted`, ...), beside
  `correctionReasonCode`. A reopened draft shows the stored reason (the first reason of its code
  when a note has none), and the list rows and the note detail print it. Refusals of the detail
  (`CORRECTION_REASON_DETAIL_*`) read as "Choose why the note is issued." Nothing further to add.
- **4.19:** the credit note detail's Refund due figure, and the Refunds card, read "Not available
  yet"; the whole note shows as applied to its invoice. Record refund still says refunds are not
  recorded in Fawtir yet.
- **Document discount on a credit note (W-2):** a credit of the whole invoice sends the invoice's
  `headerDiscount` as it is. A credit of some of its lines sends a percentage discount unchanged,
  and a fixed discount in proportion: the invoice's fixed discount times the credited lines'
  amount after line discounts over the invoice's, HALF_UP to three decimals. The engine spreads a
  fixed discount over every line by that proportion, whatever the line's VAT category, so each
  credited line gets back its own share, to within half a baisa. A custom amount and every debit
  note send no document discount, as before. The composer's totals include it.
- **V.6, one reason per VAT category and rate:** the invoice composer and both note composers now
  refuse, before saving, two lines at the same VAT category code and rate with different reasons
  (a different exemption reason code, or different written reason text), which the engine refuses
  only at preview or issue (`TAX_CATEGORY_REASON_CONFLICT`, `TAX_CATEGORY_METADATA_CONFLICT`,
  BR-CO-18: one VAT breakdown per category and rate). The notes map both refusal codes to the same
  message. The self-billed and periodic composers have validation of their own and do not run this
  check yet.

## Update 2026-10-06 (self-billing moved to Expenditure)

Owner decision of 6 Oct 2026: self-billing is a purchase and now sits under Expenditure, at
`/expenditure/self-billing/...` (the old `/income/self-billing/...` addresses redirect). The rows
of section 7 stay here unchanged; new self-billing asks are in `EXPENDITURE.md`, section S
(S.1 links, S.2 the seller stored as a customer record, S.3 the seller and buyer roles in the 389).

## Update 2026-10-21 (catalogue items follow the invoice line)

Owner decision of 21 Oct 2026: a catalogue item holds everything a manual invoice line needs, so
a line picked from the catalogue (and later a POS sale) is complete. The item screen keeps its
four kinds and maps them: *Something hand over* and *Several things* are goods, *Something you
do* and *Charged by time* are services. "Price includes VAT", "Let staff change the price",
sizes, add-ons and the Arabic name all stay. The web now draws these fields on the item form
(`ItemFormPage.tsx`) and reads them, when present, onto the invoice line (`productLine.ts`);
Save on the item form still calls no API.

Update 2026-10-22: the item form now reads, creates, updates and archives on `/v1/products`
(`GET /v1/products/{id}`, `POST`, `PUT ?expectedVersion=`, `DELETE ?expectedVersion=`), gated on
`product.manage`; an archived product opens read-only. Field names are the backend's own. The
openapi (`openapi.yaml`, `/products`) types the request and response bodies only as `object`; the
names below are `ProductRequest` / `ProductResponse` in `ProductController`, and the request's
`classification` is the openapi's `ItemClassificationRequest`.

| #   | What the screen needs | Backend |
| --- | --- | --- |
| P.1 | Goods or service on the product | `itemType: GOODS \| SERVICE` on `ProductResponse` and the create/update request; the unit must belong to it (service units: HUR, DAY, WEE, MON, ANN, E48, C62, LS, KMT; `ZZ` on both) |
| P.2 | Classification on the product | `hsCode` (12-digit Oman HS, `000000000000` = Other) for goods and `serviceTypeCode` (CL-12-OM) for services; refuse the other kind's field. Stored for every product, whoever buys: a consumer invoice prints neither, but Z.12 and Z.15 check the product's stored HS code |
| P.3 | The reason a product carries no VAT | `exemptionReasonCode` (VATZR-OM for Z, VATEX-OM for E, never mixed) and `exemptionReason` (text, O); categories limited to S, Z, E, O as on invoices (V.4). Export and transport reasons are refused as a product default (Z.7) |
| P.4 | The catalogue discount | `defaultDiscount: { type: PERCENTAGE \| FIXED_AMOUNT, value }` on the product; the invoice line starts with it as its line discount, and the user can change it there |
| P.5 | Save the item form | `POST /v1/products` and `PUT /v1/products/{id}` accepting P.1 to P.4 plus the fields the form already has (Arabic name, description, barcode, group and kind, "price includes VAT" as an entry preference only: the price is stored before VAT, "staff can change price", "keep count", sizes and add-ons). Each size and add-on is sold as its own invoice line with the item's category and classification |
| P.6 | System catalogue templates | **Lists wired (26 Oct 2026):** business types and sub types are now the server's (`GET /v1/auth/signup/business-types`, kept in the console); the fixed list in the web is gone. Per business type and sub-business type, seeded from the owner's Lulu reference sheet of 21 Oct 2026: item group, sub group, item name, brand, unit, pack size, barcode, price; food and beverage also sizes and modifiers. A template is copied into the company's catalogue and every item stays editable. Zero-rating of template items follows Z.15 |
| P.7 | Read the templates | **Wired (26 Oct 2026):** Catalog › Build from a template reads `GET /v1/catalog/templates` for the company's own sub type (404 = no template: the screen offers its own catalogue and a link to Settings › Company), and Settings › Company reads and changes the sub type (`GET/PUT /v1/company-profile/business-type`); the Lulu sample is kept for the mock API only (`tools/mock-api/data/luluSample.json`). Asked originally: `GET /v1/catalog/templates?subBusinessType=<id>` returning groups, kinds (sub groups) and items with name, brand, Rec 20 goods unit, barcode, a price where one is known, and the VAT category with its reason; and the company's own sub-business type readable after signup, so the screen opens on it (today it opens on the first template and the person picks). Until then the web reads a sample cut from the Lulu sheet (`src/lib/catalogTemplates/luluSample.json`, 4 groups x 4 sub groups x 4 items per type, no prices) |
| P.8 | Clean the Lulu sheet before seeding | its prices are not usable as they are: about a quarter are 0 and others look like a different currency or scale (a 150 ml face wash at 36.000, a 495 ml sports drink at 5.150); its units are pack measures (`g`, `ml`, `Nos`) rather than how the item is sold, read here as Each (`EA`) except Kg, Pack, Bag, Set, Box, Roll, Pair, Bottle and Can; it has goods only, so salon, barber, spa and fitness templates need their services (haircut, facial and so on) added; the food and beverage sheets are packaged supermarket goods rather than menu items; and six sheets (Cosmetics, Sports and Fitness, Toy Store, Perfumes, Watch, Eyewear) have no sub-business type at signup yet |
| P.9 | A catalogue per branch | **One product record for the whole company** (Business Rules BA-3, owner 21 Oct 2026): name, code, goods or service, HS code or service type, VAT category and reason, unit and base price are checked once (including Z.15) and are **never per branch**. Per-branch **settings** on that record, all optional and unrestricted: `availability` (every branch, the default, or chosen `branchIds`; a branch-only product is one available in a single branch), a `branchPrice` per branch (before VAT; absent means the base price) and on sale / switched off per branch. Never a copy of the product per branch. `GET /v1/products?branchId=` returns the products available in that branch with their effective price; create/update carry the settings. The branch is the one chosen in the sidebar's company card, the platform's one branch toggle (`src/lib/workingBranch.ts`); the item form's step 6 "Branches" draws these settings. Stock (P.10) and the till (P.11) are per branch. BA-1: a user sees only the branches assigned to them, enforced by the server (and `GET /v1/branches` / `/overview` return only those) |
| P.10 | Stock per branch | on-hand, reorder level and movements (sold, delivered, written off, corrected) per product and branch; a received purchase order (`deliverToBranchId`, already sent) raises that branch's count; `GET /v1/stock?branchId=` |
| P.11 | The POS till belongs to a branch | a till (device) registered to one branch; its sales issue invoices with that `branchId`, sell from that branch's catalogue and lower that branch's stock |
| P.12 | The till files a real invoice | the web now builds a till sale's invoice with the invoice composer's own request builder (`src/lib/posInvoice.ts`): a walk-in is a consumer's simplified invoice, a sale on a company a full tax invoice; each item and size is a line, each priced add-on its own line, the price rule is each caught line's discount, a discount on the whole sale is the document discount, terms NET0, the till's branch. Needed: one call that creates and issues it with the payments taken (`POST /v1/pos/sales` with the draft request, the payments and a till-generated idempotency key, so a sale queued while offline is filed once), returning the invoice number and QR for the receipt. Lines must accept the catalogue `productId` (P.9) once the till sells from it |
| P.13 | Read one product | `GET /v1/products/{id}` returning the product with P.1 to P.5 and its P.9 branch settings, plus its sizes and add-ons, so the item form's edit page and the "Sizes and options" page (`/catalog/:id/options`) open the real item instead of the House Blend sample |

## Update 2026-10-22 (branches): the Arabic branch name is sent

This corrects the 2026-09-27 note above, which listed the Arabic name among the Add a branch
fields that are not sent. Settings › Branches now reads and sends it as `nameAr` (BR-1, BR-2):

| #   | What the screen does | Backend |
| --- | --- | --- |
| B.1 | `GET /v1/branches/overview` and `GET /v1/branches/{id}`: the Head Branch is marked from `headBranch`, and in Arabic a branch shows `nameAr` when it has one, else `name` | `headBranch` and `nameAr` on the overview rows and the branch detail; the web reads both as optional |
| B.2 | Add a branch sends `nameAr` with `POST /v1/branches` in the same call; Change its details sends it on `PUT /v1/branches/{id}`: text sets it, an empty string removes it, and the field is left out when the name was never given or not changed | **Done (backend #682):** the create takes `nameAr` (blank or null leaves it unset) and the update takes "" or null as "remove" (absent leaves it). The second rename call is gone. If an answer shows the name was not kept (a server older than #682), the screen says so and the next save sends it again on the branch already created |

## Update 2026-10-22 (catalogue on /v1/products, web #254)

The catalogue now reads and saves on `/v1/products` under the backend's own field names. These notes
update rows P.1, P.2 and P.13 above (their original text stays as asked), and P.14 to P.16 are new.

| #   | What the screen does | Backend |
| --- | --- | --- |
| P.1 (update) | Goods or service on the product | **Built**, under the backend's names: `classification.goodsOrService` (`G` / `S`) on the create/update request, `classificationGoodsOrService` on `ProductResponse` (not `itemType`). Still asked: the unit must belong to it (service units: HUR, DAY, WEE, MON, ANN, E48, C62, LS, KMT; `ZZ` on both) |
| P.2 (update) | Classification on the product | **Built**, under the backend's names: `classification.hsCode` (12-digit Oman HS on CL-08-OM-HS, IBR-080-OM; `000000000000` = Other) for goods and `classification.serviceTypeCode` (CL-12-OM) for services on the request, `classificationHsCode` / `classificationServiceTypeCode` (and `classificationIsicCode`) on `ProductResponse` (not `hsCode` / `serviceTypeCode`); a service with an HS code is refused (`HS_CODE_ON_SERVICES_LINE`). Stored for every product, whoever buys: a consumer invoice prints neither, but Z.12 and Z.15 check the product's stored HS code |
| P.13 (update) | Read one product | The read itself is **built** and wired (2026-10-22): the item form's edit page and "Sizes and options" open the real product's name, code, price, VAT and classification. Still asked: `GET /v1/products/{id}` returning the product with P.1 to P.5 and its P.9 branch settings, plus its sizes and add-ons, so the item form's edit page and the "Sizes and options" page (`/catalog/:id/options`) open the real item instead of the House Blend sample |
| P.14 | Put an archived product back on sale | there is no route to reactivate a product: `DELETE /v1/products/{id}` archives it and `PUT` refuses an archived one (`PRODUCT_ARCHIVED`), so the item form opens it read-only and offers nothing to undo the archive. Needed: `POST /v1/products/{id}/reactivate?expectedVersion=` (refused while another active product holds its code) |
| P.15 | List archived products on their own | `GET /v1/products` has only `activeOnly` (default true; false lists active and archived together); there is no filter for archived products only, so the catalogue list cannot draw an "Archived" tab with a server count. Needed: `status=ACTIVE \| ARCHIVED \| ALL` (or `archivedOnly=true`) with `totalElements` for each |
| P.16 | The product bodies in the openapi | `openapi.yaml` types the `/products` request and response as `{type: object}`; document `ProductRequest` (code, name, description, defaultUnitCode, defaultUnitPrice, defaultTaxCategory, defaultTaxRate, classification: `ItemClassificationRequest`), `ProductResponse` (the above flattened as `classification*`, plus active, archivedAt, version) and `ProductPageResponse`, and the refusal codes (`PRODUCT_CODE_DUPLICATE`, `PRODUCT_VERSION_CONFLICT`, `PRODUCT_ARCHIVED`, `PRODUCT_NOT_FOUND`, `HS_CODE_*`, `SERVICE_TYPE_CODE_INVALID`) |

## Update 2026-10-26 (catalogue fields, sizes and options, archived list)

The item form, the Sizes and options page and the catalogue list now read and send the fields the
backend added for rows P.3, P.4, P.5, P.14 and P.15, under the backend's names. These notes update
those rows (their original text stays as asked).

| #   | What the screen does | Backend |
| --- | --- | --- |
| P.3 (update) | The item form sends the no-VAT reason it asks for | **Done**, under the backend's names: `defaultTaxReasonCode` (VATZR-OM for Z, VATEX-OM for E) and `defaultTaxReasonText` (O), not `exemptionReasonCode` / `exemptionReason`. The invoice line picked from the product starts with them |
| P.4 (update) | The catalogue discount | **Done**: `defaultDiscount: {type: PERCENTAGE \| FIXED_AMOUNT, value}`, null for none |
| P.5 (update) | Save the item form | **Done**: `nameAr`, `barcode`, `kindId` (from `GET /v1/catalog/groups`), `itemKind` (`HAND_OVER`, `DO`, `BY_TIME`, `BUNDLE`, the four cards), `priceEntryIncludesVat`, `staffCanChangePrice`, `keepCount` (goods only), and `sizes` / `addOns` (with each size's code and on/off while the item has no options). The Sizes and options page saves sizes, options, every combination's code, on/off and hand-set price, and the add-ons with `PUT /v1/products/{id}/variants?expectedVersion=`, and shows the server's `variant.price`. A new item starts with no price, sizes or add-ons. Each refusal code in the contract is worded on the form |
| P.13 (update) | Read one product | **Done** for P.1 to P.5 with sizes, options, variants and add-ons. Still asked: the P.9 branch settings |
| P.14 (update) | Put an archived product back on sale | **Done**: `POST /v1/products/{id}/reactivate?expectedVersion=`, offered on the item form of an archived item and on its row in the Off sale tab |
| P.15 (update) | List archived products on their own | **Done**: the catalogue's Off sale tab reads `status=ARCHIVED`, and its count is `totalElements` of `status=ARCHIVED&size=1`. The list also sends `sort` / `direction` for its Sort menu; the search is `q`, which now matches the Arabic name, barcode and variant codes |
| P.17 | Sales and usage figures on a saved item | the item form's "Where it's used" card (sold in 90 days, revenue, most popular size, open invoices) and the "sold N times" pill are drawn for a new item only; a saved item needs these figures on the product or a route of its own |

## Update 2026-10-26 (catalogue per branch)

| #   | What the screen does | Backend |
| --- | --- | --- |
| P.9 (update) | Where an item is sold, its price and on/off per branch | **Done**: the item form's Branches step reads `GET /v1/products/{id}/branch-settings` and, when the step was changed, saves `PUT .../branch-settings?expectedVersion=` after the item (a new item's right after it is created): `availability`, `branchIds`, and per branch `branchPrice` (before VAT, empty = base) and `onSale`. A closed branch is shown and cannot be chosen. The catalogue list and both invoice item pickers read `GET /v1/products?branchId=` with the sidebar's working branch and show `effectivePrice`; a picked product starts the line at it. 403 `branch-not-in-scope` is worded on the form, and reads as "no access" |
| P.18 | Manage the items not sold in the working branch | with `branchId` the list returns only the items on sale in that branch, so an item switched off there, or sold only in other branches, is found by changing the sidebar's branch. Asked: a list parameter (or `status`) that returns every active item with its settings for the branch, so the catalogue can show them greyed, and the On sale and Switched off tabs can be drawn |

## Update 2026-10-26 (zero-rating by HS code on the screens)

The screens now read the backend's zero-rating routes. These notes update rows Z.7, Z.11, Z.13 and
Z.15 (their original text stays as written; Z.7 and Z.15 were "future plan" and are now built).

| #   | What the screen does | Backend |
| --- | --- | --- |
| Z.7 (update) | The item form words the two product refusals | **Done**: `PRODUCT_ZERO_RATING_HS_MISMATCH` (on the HS code) and `PRODUCT_TAX_REASON_NOT_A_PRODUCT_DEFAULT` (on the reason) |
| Z.11 (update) | The composer shows each line's warning | **Done**: `warnings[]` of the draft preview (`InvoicePreviewResponse.warnings`), worded by `code` with the line, `hsCode` and `judgedOn`, in the pending colour above the form; never blocking, and hidden while the form has unsaved changes. Credit and debit note screens do not draw them yet |
| Z.13 (update) | The warning shape | **Done**, as `{line, code, severity, hsCode, hsCodeSource, reasonCode, listKey, effectiveFrom, judgedOn, message}`; `message` is not shown |
| Z.15 (update) | The item form and the catalogue | **Done**: a listed 12-digit goods HS code reads `GET /v1/zero-rating/hs-suggestion` and offers "Use zero-rated" with the suggested reason (the category stays the person's choice); a save's `zeroRatingWarnings[]` and a stored item's `zeroRatingAttention` are shown on the form; `GET /v1/products/zero-rating-attention` joins the catalogue's Wanting attention tab, with the flagged items not on the page listed under it |

## Update 2026-10-23 (share an invoice by email and WhatsApp)

Owner decision of 23 Oct 2026: a person can send a copy of an issued invoice to anyone by email
or WhatsApp, on the web and on mobile. The invoice page draws "Send by email" and "Share on
WhatsApp" beside Download and Print (`InvoiceDetailsPage.tsx`), switched off until these rows are
live. Sharing is a copy for convenience; the legal delivery is still Peppol or the buyer e-mail
copy, and it never changes the invoice's delivery state.

| #    | What the screen needs | Backend |
| ---- | --- | --- |
| SH.1 | The rendered invoice PDF (row 2.2) | `GET /v1/invoices/{id}/pdf`, the same artefact the documents archive already links (`artefacts.pdf`, DOCUMENTS.md 3.20): the signed, rendered, bilingual PDF, one file for download, print and sharing |
| SH.2 | Send by email | `POST /v1/invoices/{id}/share/email` with `{to: [email], cc?: [email], message?, language}`; sends from Fawtir's mail with the PDF attached and the invoice number in the subject; prefill `to` from the customer's email. Refused while the subscription is read-only (ST-2: nothing is sent) and for a deemed supply (no buyer copy); answer the refusal with a problem type the screen can word |
| SH.3 | Share on WhatsApp | `POST /v1/invoices/{id}/share-link` returning a time-limited public URL to the PDF (`url`, `expiresAt`); the web opens `https://wa.me/?text=` with a short message and the link, mobile uses the phone's share sheet with the PDF file or the link. Same refusals as SH.2. Revoking or letting the link expire never affects the invoice |

## Update 2026-10-28 (stock screens on /v1/stock)

The Stock list and one item's shelf now read and write the stock API in the branch chosen in the
sidebar: `GET /v1/stock` (tab = `status`, search = `q`, Sort = `sort`, server paging) and
`GET /v1/stock/summary` for the cards and tab counts, `GET /v1/stock/items/{productId}` and its
`/movements`, `POST /v1/stock/counts`, `/write-offs` and `/deliveries` (each with an
`Idempotency-Key`), and `PUT .../reorder-level` (with `expectedVersion`) and
`PUT /v1/stock/reorder-levels`. `stock.read` opens the screens, `stock.adjust` shows Count the
shelves, Correct the count, Write stock off and Record what came in, `stock.manage` shows the
reorder level changes; the writes are also hidden when the plan's `stock` switch is off, and stay
offered while the subscription is read-only (ST-2). Purchase-order lines name a product, its
variant and `stockUnitsPerOrderUnit`; credit-note lines send `backOnShelf`; the invoice composer
fixes a counted product's unit and words the issue answer's `STOCK_*` warnings.

| #    | What the screen needs | Backend |
| ---- | --- | --- |
| P.10 (update) | Stock per branch | **Done** as above |
| P.19 | Group and kind on a stock row | the frame prints "group › kind · code" under each item and in the item's subtitle; `StockRow` has neither. Asked: `groupName`/`groupNameAr` and `kindName`/`kindNameAr` (or the ids) on `StockRow` and `StockItemDetail`. Until then the code alone is shown |
| P.20 | What depends on an item | `StockItemDetail.dependsOnIt` is always null, so the "What else depends on it" card (bundles capped by this item, open quotations, recurring orders) and the On hand card's "promised to a bundle" note show a dash; the On hand note shows the last count instead |
| P.21 | Stock period and export | the item's chart has a period picker and an export, and the movements an Export; `GET /v1/stock/items/{id}` answers thirty days only and there is no export route. Drawn switched off |
| P.22 | The supplier's delivery days and price changes | the item's "Who supplies it" card draws "Delivers" (the supplier's usual delivery days) and "Last price change" (from, to, when). Neither has a field; "Last price change" shows the last receipt's cost and date, "Delivers" a dash |
| P.23 | A counted product on a saved draft line | the invoice composer fixes a counted product's unit when the product is picked; a reopened draft's lines carry `productId` but not the product's `keepCount`, so its unit is not fixed (the server still warns `STOCK_UNIT_MISMATCH` on issue). Asked: `keepCount` (or the counted unit) on draft lines |
| P.24 | Sizes on the product search | product search rows have `variants: null`, so picking a product with sizes on a purchase-order line costs one more `GET /v1/products/{id}`; variant names come in English only (no `nameAr`), so the size list reads in English on an Arabic screen |
| P.25 | Counted products on an invoice's lines | the credit note composer reads each invoice line's product (`GET /v1/products/{id}`, one per product) to learn `keepCount` before asking "Back on the shelf?". `keepCount` on the invoice detail line, or a product read by a list of ids, would remove those calls |

## Update 2026-10-28 (the till wired to the POS API)

The till screens (`src/pages/PosPage`) now read and write the till API: tills and shifts
(`GET /v1/pos/tills?branchId=`, `POST .../shifts` is opened by the first sale), the branch shelf
(`GET /v1/products?branchId=&includeUnavailable=true`, `GET /v1/products/{id}` for sizes and
add-ons), the sale (`POST /v1/pos/sales` with `lineRefs`, payments, tip and an `Idempotency-Key`;
an offline queue numbered on the till's own series), the company lookup (`GET /v1/customers?vatNumber=`)
and `POST /v1/pos/customers`, the receipt and its QR (`GET /v1/pos/sales/{id}?wait=`, `.../qr`),
Today (`GET /v1/pos/sales`, `GET /v1/pos/today`), the daily summary (`GET /v1/pos/days/{date}`),
the close (`close-preview`, `float`, `cash-movements`, `close`), refunds (`refund-lookup`,
`POST .../refunds`) and Scan slip (`POST /v1/pos/slips`, `/pos/slips/read`). These rows are what
the screens still draw without an answer. Rows P.11 and P.12 are done.

| #    | What the screen draws | Backend |
| ---- | --- | --- |
| P.26 | The price rule at the till ("Afternoon lull applied 20% off the drinks") and its totals row | price rules are not served to the till yet (the rules API is not merged). The sale line keeps `rulePercent` and sends it as the line's percentage discount once a rule fills it; asked: the rules that apply to a branch and time, or the till sale applying them itself |
| P.27 | The Sizes badge and "3 sizes · 4 add-ons" on a shelf tile before it is tapped, and a photo on the tile | list rows of `GET /v1/products` carry `sizes`, `variants` and `addOns` as null, so the till reads each product when it is tapped; asked: a count of sizes and add-ons (or the arrays) on list rows, and a product image |
| P.28 | The QR on a receipt printed while the till is offline | the till numbers an offline sale from its own series and sends it later, but the QR's payload is made by the server; asked: what the device may print offline (the TLV it can build itself) |
| P.29 | "Email it" and "Text it" on the receipt screen | no route sends a till receipt by e-mail or SMS; only printing works |
| P.30 | "One of your customers since April 2025" and the customer's own price account ("Hotel accounts · 12% off") on the company match | neither is on the customer read; the till shows the city, the Peppol id and the terms |
| P.31 | "Accepted by the OTA" on the sale being refunded | `GET /v1/pos/refund-lookup` does not carry the invoice's filing state; asked: `filing` as on the sale |
| P.26 (update) | The price rule at the till and its totals row | **Done** (backend PRs #795, #796, #799, #800): the till keeps `GET /v1/price-rules/active?branchId=` on the device (refreshed when `version` moves, every minute and when the connection returns), works each item line's rule out itself (`atTheTill` rules only, a customer rule only for a chosen company), sends the rule's saving as the line's discount with `lineRefs[].priceRuleIds`, adopts the server's figure on 422 `POS_PRICE_RULE_MISMATCH` (sent again by itself when the total is unchanged), and shows `POS_PRICE_RULE_STALE_ACCEPTED` once a queued sale is sent. Add-on lines never get a rule. The panel names the rules that fired instead of the sample's "Afternoon lull 20%" |
| P.32 | "Buy one, get something" on the new rule screen | drawn as Coming later and not selectable (Abdul, 28 Oct 2026): kind `BUY_ONE_GET` is refused 422 `PRICE_RULE_KIND_NOT_AVAILABLE` in the first version. Asked: the kind, when it is built |
| P.33 | "Per one month" and "per one year" under Counted per | drawn as Coming later and not selectable; only `countPer: INVOICE` is accepted (`MONTH`/`YEAR` are 422 `PRICE_RULE_COUNT_PER_NOT_AVAILABLE`) |
| P.34 | "Let it stack with other rules" | drawn as Coming later, switched off and not changeable; the web always sends `stacks: false` (`true` is 422 `PRICE_RULE_STACKING_NOT_AVAILABLE`) |
| P.35 | A customer rule by tag at the till | `GET /v1/price-rules/active` carries the rules but not the chosen customer's tags, so the till matches a CUSTOMER rule by `customerIds` only; a tag match is found by the server, refused `POS_PRICE_RULE_MISMATCH` and adopted. Asked: the customer's tags on the customer read the till already makes, or on `/active` with a `customerId` |
| P.36 | "What if it had never run" in a rule's menu | no route prices past sales without a rule; the item stays drawn as Coming later |
| P.37 | Export of the lines behind one rule | `GET /v1/price-rules/{id}/lines` is JSON only; "Export what it gave away" downloads `GET /v1/price-rules/report.csv` (every rule). Asked: `GET /v1/price-rules/{id}/lines.csv` |
| P.38 | A price rule on quotation lines | the quotation screens are not connected yet (R6), so only invoice drafts send `priceRuleIds`; a quotation will send them the same way once its screens are wired |
| P.39 | The rule card's extra figures ("afternoon sales up 61%", "pastries sold with it", average order) | not in the first version of the API; the card shows used, given away, brought in and the dates only |

## Update 2026-10-29 (E2E acceptance: refunds and the Paid card)

- **4.1, credit notes, corrected (ACC-3):** the 2026-09-29 note above says Applied to invoices
  is `issuedTotal` "because no refund is recorded". That stopped being true with backend V477: a
  POS refund is recorded against the sale's credit note, so `issuedTotal` overstates what was
  applied to invoices by every POS-refunded amount. The card and the Applied tab still read
  `issuedTotal`, because the summary carries no refunded figure to take out. Asked:
  `refundedTotal` (count and total, in `currencyCode`) on
  `GET /v1/authored-invoices/summary?type=CREDIT_NOTE`, or an `appliedTotal` that leaves refunds
  out; the card will then read it.

| # | The design shows | Ask |
|---|---|---|
| 4.20 | Income "Paid" card, "N invoices collected" (ACC-10) | `paidTotal` and `paidInvoices` on `GET /v1/authored-invoices/summary` count every receivable with nothing left owed, however it was cleared: an invoice a credit note cleared counts with no cash, and debit notes count as invoices. The card is now titled "Settled" and says "N documents settled by payment or credit". Asked: a cash-collected figure (payments net of reversals, invoices only, in `currencyCode`) for the card to say "Paid" again |

## Update 2026-10-29 (Catalog › Groups)

Catalog › Groups (`/catalog/groups`, `src/pages/CatalogPage/CatalogGroupsPage.tsx`) lists, adds,
renames, reorders and deletes the company's groups and the kinds inside them on
`GET/POST /v1/catalog/groups`, `PUT/DELETE /v1/catalog/groups/{id}?expectedVersion=`,
`POST /v1/catalog/groups/{id}/kinds` and `PUT/DELETE /v1/catalog/kinds/{id}?expectedVersion=`
(a kind moves to another group with `groupId`). Reading needs `product.read`, changes
`product.manage`. Every refusal code is worded (`CATALOGUE_NAME_REQUIRED`,
`CATALOGUE_GROUP_NAME_DUPLICATE`, `CATALOGUE_KIND_NAME_DUPLICATE`,
`CATALOGUE_GROUP_VERSION_CONFLICT`, `CATALOGUE_GROUP_NOT_EMPTY`, `CATALOGUE_KIND_IN_USE`,
`CATALOGUE_GROUP_NOT_FOUND`, `CATALOGUE_KIND_NOT_FOUND`). The item form's "Where it lives" lists
carry "Add a group" and "Add a kind", so a new company (which starts with no groups) can file its
first item without leaving the form. Delete is final; there is no archive for groups or kinds.

| #    | What the screen needs | Backend |
| ---- | --- | --- |
| P.40 | Reorder groups, and kinds within a group, in one step | there is no reorder route: moving a row up or down saves every row whose place changed with its own `PUT ...?expectedVersion=` (name, `nameAr` and the new `sortOrder` sent back, because a missing `sortOrder` is stored as 0). A failure part way leaves the rows saved so far. Asked: `PUT /v1/catalog/groups/order` (and `.../groups/{id}/kinds/order`) taking the ids in their new order, in one transaction |
| P.41 | How many items each kind and group holds | `GET /v1/catalog/groups` carries no counts, so the screen shows the number of kinds only and learns that a kind still holds items on sale when its delete is refused (`CATALOGUE_KIND_IN_USE`). Asked: `productCount` (active products) on each kind and its total on each group |
| P.40 (update) | Reorder in one step | **Fixed by backend #812** (not deployed on 29 Oct): up/down sends `PUT /v1/catalog/groups/order` or `PUT /v1/catalog/groups/{id}/kinds/order` with every sibling in its new order (`items: [{ id, expectedVersion }]`), all or nothing; `CATALOGUE_ORDER_INVALID` is worded. A server without the route (404, 405, or 400 with no catalogue code) gets the per-row PUTs above |
| P.41 (update) | Item counts | **Fixed by backend #812**: the screen shows `productCount` on each kind and `kindCount` / `productCount` on each group when the tree carries them (kinds alone otherwise), and says before sending a delete that a group with kinds, or a kind with items on sale, cannot be removed; the server's refusal is still worded |

## Update 2026-10-29 (fields from backend #808 and #815, not deployed yet)

The web reads the fields backend #808 and #815 add, and works as before against a server without
them: each is feature-detected (an absent field, or the old null arrays, means "not sent"). The
till's shelf asks `GET /v1/products?branchId=&includeUnavailable=true&include=variants,addOns,stock`
and flags an item from `stock.state` (and each size from `stock.variants[].state`): "Low", "Out of
stock" or "Below zero", never blocking the sale (guide section 8). A product with sizes is flagged
on its tile only when every size on sale is, by the mildest; the size chooser flags each size.
`stock: null` (not counted, or no `stock.read`) flags nothing. The item's stock page shows a
delivery's `supplierReference` on its movement row.

| #    | What the screen needs | Backend |
| ---- | --- | --- |
| P.19 (update) | Group and kind on a stock row | **Fixed by backend #808** (not deployed on 29 Oct): the stock list row and the item's subtitle print "group › kind · code" from `groupName`/`kindName` (`groupNameAr`/`kindNameAr` in Arabic, each falling back to English), and the size reads `variantNameAr` in Arabic. A row without them shows the code alone |
| P.23 (update) | A counted product on a saved draft line | **Fixed by backend #808**: a reopened (or copied) draft fixes the unit of a line whose `keepCount` is true to the line's own unit, as when the product was picked; never on a self-billed document. A line without `keepCount` stays free, as before |
| P.24 (update) | Sizes on the product search | **Fixed by backend #808**: the purchase-order line's catalogue search sends `include=variants`, so a pick takes its sizes from the row and reads nothing more; the size list reads `nameAr` on an Arabic screen (the line's description stays the English name). A row with `variants: null` is read with `GET /v1/products/{id}` as before. The Sizes and options page and the item form send a hand-set `nameAr` (`nameArSet`) back on each combination, so saving does not clear it; the web does not offer to set one |
| P.25 (update) | Counted products on an invoice's lines | **Fixed by backend #808**: the credit note composer reads `keepCount` on each invoice line and reads no product; only a line without the field (an older server) is read one by one as before |
| P.27 (update) | Sizes and add-ons on a shelf tile before it is tapped | **Fixed by backend #808** for the sizes and add-ons: the tile says "2 sizes · 1 add-on" and opens the chooser from the row, at each variant's `branchPrice`, with no read on the tap; the shelf kept on the device carries them, so an item never opened sells while the till is offline. Still asked: a product image (every tile shows an illustration) |
| P.31 (update) | "Accepted by the OTA" on the sale being refunded | **Fixed by backend #808**: the pill is drawn when the lookup's `filing.acceptedAt` is set. A lookup without `filing` falls back to the sale's own read when the screen makes it (an older server without `tip`); otherwise no pill |
| P.28 (update) | One refused queued sale must not stop the till (E2E 30 Oct 2026, H-1) | **Asks backend `fix/pos-queued-sale-readonly`**: a queued sale is always filed, even while read-only; under a minute old the server answers 425 `POS_QUEUED_SALE_TOO_EARLY` (`retryAfterSeconds`) and the till resends the same key; `GET /pos/tills` says `skipsStuckNumbers: true`, and a sale may then name `skippedNumbers` to pass numbers it cannot file yet. Against a server without these the till still works: a refused sale stays visible and is retried, and later sales wait behind it in number order. |
