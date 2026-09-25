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

---

Questions to the front end: `docs/frontend/` handoffs describe each integrated slice; this file
is the delta the design introduced on 25 September 2026.
