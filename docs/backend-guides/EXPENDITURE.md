# Expenditure and Suppliers: backend guide

**For:** the backend team. **Covers:** bills, payments, recurring bills, bill reminders, supplier credit and debit notes, and suppliers. **Last updated:** 30 September 2026.

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
  for `TODO(backend)` in `src/pages/Bill*`, `src/pages/*PaymentRun*`, `src/pages/*Recurring*`, `src/pages/ExpenditureRemindersPage`, `src/pages/Supplier*`, `src/pages/Upload*Note*`, `src/components/debit`, `src/lib` and `src/api/expenditure`.
- **Seeing the screens without a backend.** `tools/mock-api/routes/bills.mjs`, `paymentsRecurring.mjs`, `supplierNotes.mjs`, `suppliers.mjs`, `supplierRecord.mjs` answer the
  routes with realistic data in the shapes the screens expect (`src/api/**` holds the DTOs). Run
  `node tools/mock-api/server.mjs` and point the app at it; see `docs/LOCAL_SETUP.md`.

**Screens in this guide:** Bills (list, upload, scan receipts, detail); Payments (runs, run composer, view their invoice); Recurring bills (list, add, detail); Reminders; Supplier credit notes and debit notes (lists, uploads, details); Suppliers (list, new, edit, import, detail, new purchase order, record a bill, statement).

---
## 1. Bills (`GET /v1/bills`, `/summary`, `/intake`, `/{id}`, `/{id}/match`)

| # | The design shows | Ask |
|---|---|---|
| 1.1 | Bills list (163:21928): "PEPPOL · arrived 29 Jul" and "UPLOADED · PDF · by Yusuf" beside the source badge | an arrival time and the uploader's name on the list row; only the badge is drawn today |
| 1.2 | "Due this week · 4 bills · earliest 2 Aug" | `earliestDueDate` on `BillSummaryResponse`; the card shows the count alone |
| 1.3 | Row button "Nudge the approver" on a bill waiting on someone else | a nudge endpoint (`POST /bills/{id}/approval/nudge` or a notification); the button says it is not wired yet |
| 1.4 | Row notes "84.900 over" (a mismatch's money difference) and "over the 2,000 limit" (why approval is needed) under the amount | the mismatch difference and the approval-policy threshold on the row; the row shows the VAT included instead |
| 1.5 | "Draft, confirm details" rows in the table, with "Check and save" | none for now: the front end reads `GET /bills/intake?status=UNCONFIRMED` and draws the intakes as rows on the first page of Needs attention and All. A list filter that returns intakes with the bills would let them page with the rest |
| 1.6 | Upload a bill (163:22397): "Check what we read", amber fields the reader was unsure of, "1 page · 248 KB · read in 3 seconds · 11 of 13 fields confident" | extraction of PDF/JPG/PNG intakes with per-field confidence (`ExtractedBillFields.confidence`), and page count. Today only UBL XML fills `extracted`; a PDF or photo says "not read: type the bill in" |
| 1.7 | Upload: "This looks like PO-0033 · Same supplier, same two bag sizes, 3,500 units ordered on 18 Jul and received on GRN-0091" | a suggested order for an unconfirmed intake, with its reasoning. The newest open order of the chosen supplier is offered as the suggestion, without a reason |
| 1.8 | Scan receipts (163:22851): "Note (optional)" | a free-text `note` on `ConfirmRequest`; the field is drawn and held in the browser only |
| 1.9 | Scan receipts: "Petty cash" as a way it was paid | a way to record petty cash apart from cash (a reference or its own method); it is sent as UNCL4461 `10` (cash) today |
| 1.10 | Scan receipts: category "Guessed from wire brush, sealant, drain cover", VAT "That line is smudged on the photo" | receipt OCR with a guessed category and per-field confidence (see 1.6). The VAT field is amber until typed because it is worked out from the total and the rate |
| 1.11 | Bill detail (163:23284): "You received 300 KG · Checked in 28 Jul · GRN-0087" | the goods receipt's date on `MatchResponse`; the tile names the receipt only |
| 1.12 | Detail, Linked documents: "PO-0031 · Placed 20 Jul · approved by Hafidh Saif" and "GRN-0087 · Received 28 Jul · checked in by Yusuf Al Balushi" | the order's date and approver and the receipt's date and recorder on the bill's match; the match date stands in for the order and the receipt names its order |
| 1.13 | Detail, Supplier card: "Paid on time · 11 of 11" | a paid-on-time count per supplier on `SupplierOverview`; `payables.everLate` stands in ("Never paid late" / "Paid late before") |
| 1.14 | Detail activity: "Reported to the Tax Authority · Receiver-side Tax Data Document filed and accepted", "Receipt acknowledged to the supplier · Sent back over Peppol automatically" | activity kinds for the compliance and Peppol acknowledgement events, if the platform records them; the feed shows the kinds the API has |
| 1.15 | Detail, Compliance: "Valid tax invoice, VAT is reclaimable", "Passed PINT-OM validation", "TDD filed with the OTA", "Archived for the retention period" | drawn from `networkVerified`, `complianceObligation` and whether an original is held. A receiver-side filing state would make the third line exact; nothing claims a filing the platform did not make |
| 1.16 | Detail activity names people ("so it needs Hafidh Saif", "checked in by Yusuf") | display names for `actor` on activity entries and approvals (user ids today, so only "by you" can be said) |
| 1.17 | Detail, Payment terms: "Terms · Net 30 days", "Early payment · 2% before 5 Aug", "Pay to · Bank Muscat ···2290", "Paying by 5 Aug saves 47.090" | none: derived from the bill's dates and the supplier record's `earlyPaymentDiscountPercent/Days` and `bankDetails` (`GET /suppliers/{id}`, `supplier.read`). A reader without `supplier.read` sees "Not stated" |

## 2. Payments (`/v1/payment-runs`, `/v1/payer-bank-accounts`, `GET /v1/bills/{id}`)

| # | The design shows | Ask |
|---|---|---|
| 2.1 | Payments (163:16960): under each bill "Approved 21 Jul · matched to PO-0027" | `approvedAt` and the matched `purchaseOrderNumber` on a run's candidates and items; the issue date stands in ("Issued 14 Sept 2026") |
| 2.2 | Payments: the frame is the run itself; the list at `/expenditure/payments` has no frame | none: the list is kept (decision 1) and drawn in the frames' shell so every run can be reached; "Payments > PR-0014" in the crumb is that list |
| 2.3 | View their invoice (163:17374): a source pill (PEPPOL / UPLOADED / SCANNED), Net, VAT, Total, "Matched to PO-0031 and GRN-0087", "Approved by Hafidh on 30 Jul" per bill | the same on a run's items (`PaymentRunItemDto`); today the page reads `GET /bills/{id}` once per bill in the run |
| 2.4 | View their invoice: the supplier's document in the middle pane | fine for an upload or a scan (`/bills/intake/{id}/file`); a Peppol bill has no picture, so the sheet is drawn from its recorded lines. A rendered PDF for a Peppol bill would replace the drawing |
| 2.5 | 3 Dot (163:24153): "Export as a spreadsheet · Every bill and transfer as .xlsx" | an .xlsx export of a run; the item says it is not available yet |
| 2.6 | 3 Dot: "Email remittance advice · Tells each supplier what you paid and for which bills" | a route that e-mails each supplier in the run; the item says it is not available yet |
| 2.7 | 3 Dot: "Copy into a new run · Same suppliers, fresh bills" | done in the browser (`POST /payment-runs`, `GET /candidates`, `POST /items` for the same suppliers' bills); a copy route would make it one call |
| 2.8 | 3 Dot: "Reset the selection", "Delete" | `DELETE /items/{billId}` per item and `POST /cancel`; a reset route would be one call. Both only while the run is a draft or scheduled |
| 2.9 | Header "Print", "Print all" | the browser's print; a printable run sheet from the server would be better |
| 2.10 | Header "Download all" on the invoices page | one archive of the run's originals; today each bill's original is downloaded in turn |
| 2.11 | "2 more bills can't be paid yet - they haven't cleared approval" | none: the reasons come per row from `reasonCodes`; the header says "or are held" since the list also holds mismatches and holds |
| 2.12 | Supplier logos beside each group | a logo per supplier; two-letter tiles stand in |
| 2.13 | "Mark as paid" and "Delete" (cancel) have no place on the run frame | kept: "Mark as paid" appears beside "View their invoice" once the run is exported; "Delete" lives in the 3 Dot menu |

## 3. Recurring bills (`/v1/recurring-bills`)

| # | The design shows | Ask |
|---|---|---|
| 3.1 | Add a recurring bill (163:17821) draws a watch only: "It won't create anything" | none for the frame. The API's `RAISE` mode has no frame: a watch saved in it keeps its mode when edited (first date instead of arrival day) but cannot be created from the form |
| 3.2 | "Payment usually due: 5th of the next month" | `paymentDueDay`; `paymentTermsDays` is sent as `null` (0 for "On arrival"). Please accept `null` there, or say which of the two the ledger wants |
| 3.3 | "VAT treatment: Standard rate · 5%" | `vatAmount` is worked out from the treatment (5% inside the total, or 0); a treatment code on the watch would be exact |
| 3.4 | "If the amount is outside the range" switch | off sends `tolerancePercent: null`; a separate flag would keep the percentage when the switch is off |
| 3.5 | "Who gets told: Yusuf Al Balushi" | `notifyUserId` chosen from `GET /users` (needs `admin.users.manage`); a lighter roster readable with `invoice.payment.manage` |
| 3.6 | "Past bills from this supplier" (the frame pastes the payment run's list) | none: `GET /suppliers/{id}/bills`, first three |
| 3.7 | Recurring bills (163:23795): "PAUSED · Since 22 Jul · Billing dispute open" | `pausedAt` and a pause reason on the watch |
| 3.8 | List: "same for 11 months", "up 22% on June" | a count of unchanged periods and the last period's name on the list row; "same as usual" / "+22% on the last one" is what the row can say |
| 3.9 | Tab counts (Active 5 · Late arriving 1 · Paused 1 · All 6) | from the summary (`activeCount`, `lateCount`, `recurringCount`); paused is the difference |
| 3.10 | Detail (163:18190), "Every month so far": the bill's number, "On the 27th", "Paid 4 Jul" | `billNumber`, `arrivedOn` and `paidOn` on `GET /recurring-bills/{id}/runs`; the row links "Open the bill", says arrived / late / waiting, and prints the due day |
| 3.11 | Detail: "Mark as received" | a route to match a period to a bill by hand; the button says it is not available yet |
| 3.12 | Detail: "Export" | an export of the history; says it is not available yet |
| 3.13 | Detail: Activity ("Tolerance widened to 10% · Changed by Hafidh Saif") | an audit trail per watch; today the feed is read off the runs and `watchingFrom` |
| 3.14 | Detail: Supplier card (VAT, sends bills by, contact, Peppol note) | none: `GET /suppliers/{id}` |
| 3.15 | "Chase the supplier" (list, header, banner) | the API's chase tells the named person, never the supplier; the notice says so. A supplier-facing chase (e-mail to the supplier's contact) is the ask |
| 3.16 | Chart: "Arrived and paid" / "Paid recently" bars | the paid date per run (3.10); today "most recent" is the last arrival |
| 3.17 | Header chip "MONTHLY · AROUND THE 28TH"; "watched since Sep 2025" | none: `interval`, `arrivesAroundDay`, `watchingFrom` |

## 4. Bill reminders (`/v1/bill-reminders`)

| # | The design shows | Ask |
|---|---|---|
| 4.1 | Reminders (163:21448) has no inbox; "In Fawtir: a count on the bell and on the Bills tab" | the bell should read `GET /bill-reminders/inbox` and acknowledge from there. The page's `ReminderInbox` (read + acknowledge) is kept, exported and tested, but not mounted |
| 4.2 | Footer "Send me today's now" | a route that sends the reader today's digest now; the button says it is not available yet |
| 4.3 | No input for the digest hour | `digestTime` is sent back as loaded and shown in the card ("at 08:00") and the footer |
| 4.4 | Preview badge "ONE EMAIL · 08:00 · TO YUSUF AND HAFIDH", one line per thing naming everyone it goes to | none: derived from the settings and the preview's per-person groups |
| 4.5 | Avatars on the recipient chips | a photo per user; one placeholder image is used |
| 4.6 | Timing chips (7 / 2 / on the day; 1, 2, 3 days; 5 / 7 days) | none: each chip is one offset; a saved offset the frame does not draw is shown as an extra chip so it is never lost on save |
| 4.7 | The recurring rule drawn on, "Set per bill on Recurring bills" | none: the switch is fixed on; the server refuses a rule row for it |
| 4.8 | One "Save changes" for rules and delivery | none: `PUT /rules` with the changed rules and `PUT /settings` when delivery changed |

## 5. Supplier credit and debit notes (`GET /v1/credit-notes`, `/v1/debit-notes`, their `/summary`, one note, `/v1/bills/intake`)

Frames: Credit notes 163:18691, Upload a credit note 163:19080, Credit note detail 163:19560, Debit
notes 163:21057, Upload a debit note 163:20010, Debit note detail 163:20528. Fixtures:
`tools/mock-api/routes/supplierNotes.mjs`.

| # | The design shows | Ask |
|---|---|---|
| 5.1 | A **search box**, a **supplier filter** and a **Sort** menu on both lists | `q`, `supplier_id` and `sort` on `GET /v1/credit-notes` and `GET /v1/debit-notes`. Until then the three controls narrow the page in hand (`narrowNotes` in `src/lib/supplierNoteList.ts`) |
| 5.2 | A **count on every tab** (All 5 · Used 1 · Refunded 1; All 5 · Accepted 1 · Rejected 1) | per-status counts on both summaries, as the Bills summary carries `tabs`. Until then a tab shows the total the server reported the last time it was opened |
| 5.3 | "Most credits from" card: **"3 short deliveries in 14 · worth reviewing"** | delivery statistics per supplier (short deliveries over deliveries) on `GET /v1/credit-notes/summary`; the card prints the note count today |
| 5.4 | Row: **"Arrived 30 Jul"**; row menu **Download the file** for an uploaded note | `receivedAt` on list rows (the issue date stands in); the intake id (or a file path) on list rows, since only a Peppol row has `inboundDeliveryId` to download from |
| 5.5 | The **bill a note is set against**, linked and with its figures (they billed, due date, VAT) | `relatesTo.billId` on debit-note rows; `credits.billId` on a credit note whose bill is on file but not yet applied. Until then the note screens look the bill up by number among the supplier's bills (`useNoteBill`) and take an exact match only |
| 5.6 | Chip **"Accepted by Hafidh"** | the decider's name beside `decidedBy` (a user id) on debit-note rows and decisions |
| 5.7 | Linked documents: the **purchase receipt (GRN)** whose short delivery the credit covers, and the goods receipt a charge was signed at | a goods-receipt reference on the note (`goodsReceiptId`, `goodsReceiptNumber`) |
| 5.8 | **Line items** on the note ("What's being credited" / "What they're charging for") and the **supplier's own reason text** ("Short shipment on 27 Jul...") | lines and `reasonText` on `GET /v1/credit-notes/{id}` and `GET /v1/debit-notes/{id}`. Today the lines and the original file are read from `GET /v1/bills/{id}` (the note is a bill row of type 381/383) and taken only when the answer has a detail's shape; the reason prints as its CL-02-OM code's label |
| 5.9 | **"Against your rate card"** (agreed per delivery, normal hours, surcharges listed, this delivery signed at, card signed) and the checks that read the charge against it | the supplier's current agreement (rate card) with those fields, and the receipt's sign-in time. The card draws its rows with a dash and says no rate card is on file |
| 5.10 | Check **"Not a repeat of an earlier charge"** over the last twelve months | a duplicate-charge check per supplier (or `supplier_id` + `since` on the debit list). The upload leans on the intake's duplicate refusal (same number, same supplier) |
| 5.11 | Supplier card: **"Credit notes: 2 this year"**, **"Short deliveries: 3 of 14"**, **"Debit notes: 3 this year"**, **"Refused before: 1 · duplicate charge"** | notes and refusals per supplier per year on `GET /v1/suppliers/{id}/overview`. Name, VAT number and open bills are read from `GET /v1/suppliers/{id}` and `/overview` today |
| 5.12 | Upload: **Reason\*** (BTOM-032, mandatory under IBR-023-OM), **"Which bill it corrects"** pre-chosen from the file ("The bill reference was printed on the file, so this one is certain") | `reasonCode` / `reasonText` and `relatedBillId` on `ConfirmRequest`; `billingReference` (IBT-025) in `ExtractedFields`. The reason is typed and not sent; the bill is chosen by hand and, for a credit note, applied with `POST /credit-notes/{id}/apply` right after confirm when "Set it against ... now" is chosen |
| 5.13 | **"Keep as credit"** / **"Put it on hold"** as recorded choices | a `held` marker on the note so the choice survives a reload. Both are client-side today, because an unapplied credit and an unchecked charge already are held |
| 5.14 | Row menu **Query it** (credit) and **Remove** (debit) | a query-to-supplier action and a delete for an uploaded note; neither exists, so the menus offer Open and Download only |

Designer slips corrected on these frames: the debit list's Extra column carried a minus (a
charge adds, so it prints a plus); a note "Waiting for a bill" offered "View the bill" (it opens
the note); a refused charge offered "See the payment" (it opens the decision); the debit copy
"It joins the next payment run", "Fawtir sends the supplier your reason" and "Refuse and tell
them" claimed things the server does not do (the buttons and sentences say what is recorded);
the frame's KPI arithmetic (738.400 recovered, 238.900 added) does not follow from its rows, so
every figure is derived from the rows.

## 6. Suppliers: list, form, import (`GET /v1/suppliers`, `/summary`, `/{id}`, `POST /v1/suppliers`, `/{id}/switch-off`, `/v1/{suppliers|customers}/import/*`)

| # | The design shows | Ask |
|---|---|---|
| 6.1 | Suppliers main (163:25756): a **Filters** menu beside Sort, narrowing the list by channel (Peppol / Email PDF / Paper) | a `channel` query parameter on `GET /v1/suppliers`; until then the page that was fetched is narrowed in the browser and "Showing n of total" counts what is shown |
| 6.2 | "Switched off 12 Apr 2026" under a switched-off supplier's name | `switchedOffAt` on the list row (typed optional in `suppliers.ts`); the row says "Switched off" without a date until then |
| 6.3 | Row menu "Switch this supplier off · Hides them from new bills · 31 bills stay searchable" | a bills count on the list row; the note says "their bills stay searchable" |
| 6.4 | Switch off dialog (163:29066): "2 things are still open with them · Both sitting in draft payment run PR-0014 · Unused credit note MR-CN-0118 · 242.500", with "Open the run" and "Use the credit" | the draft payment run holding their bills and their unused credit notes, on the row or on `GET /suppliers/{id}`; the dialog draws the open bills and what they come to from the row, with "Open their record" |
| 6.5 | Switch off dialog: "Why are you switching them off?" (five reasons) and a note for whoever reads it later | `POST /suppliers/{id}/switch-off` taking `{ reason, note }`; both are asked and stay on the screen today |
| 6.6 | Edit (163:26848): **Trading name**, **Tags** ("Raw materials", "Key supplier") | `tradingName` and `tags[]` on `SupplierRequest` / `SupplierDetail`; drawn and held in the browser only |
| 6.7 | Edit: "Match bills to purchase orders automatically" switch | a per-supplier auto-match setting on the request and the detail; the switch is drawn and held in the browser only |
| 6.8 | Edit: "You invoice on their behalf" switch | none: read from `selfBillingAgreement` and drawn disabled, since an agreement is signed elsewhere |
| 6.9 | Edit: Peppol ID hint "Valid, and found on the network. Last bill received 29 July." | a network lookup result and the last bill's date on the detail; the hint confirms the identifier's shape only |
| 6.10 | Edit: **Category** as a picker, **Address** as one line | none: `supplierCategory` stays free text (the picker offers the usual answers and keeps any stored value); the address line is `streetName, cityName` and a typed line is split at its last comma, the other address parts kept as loaded |
| 6.11 | Edit: VAT number starred as required | none: the same design's list counts suppliers with "No VAT number on file" and offers "Add it", so the form saves without one (a typed one must be an Oman VATIN); `registeredForVat` is sent as whether a number was typed |
| 6.12 | Edit side column "What changing this affects": "Open bills 2 · 2,759.100", "In a draft run PR-0014", "Open orders PO-0033", "Recurring bills None" | open bills and orders come from `GET /suppliers/{id}/overview` (`payables`, `tabs.orders`, as a count); the draft run, the order numbers and the recurring bills need fields there or on the detail. "Not available yet" is drawn until then |
| 6.13 | Edit side column "Recent changes": "Early settlement set to 2% within 7 days · Hafidh Saif · 14 Jan 2026", "IBAN updated · confirmed by phone" | an audit feed per supplier with who and when; today the card lists the dates the record carries (bank details changed / confirmed, switched off, supplier since) without a name |
| 6.14 | Edit side column "Is the record complete": "A second contact for when Ahmed is away" | a contacts count on the detail; the line is drawn unticked until then |
| 6.15 | Import review (163:28227): a meta line under each name ("Net 30 · rustaq@timber.om", "VAT OM1100774209 · Net 30") | `summary` per row on the checked batch (typed optional in `counterpartyImport.ts`); the line is drawn only when the row carries it |
| 6.16 | Import review: "The problem field" box holding the file's value ("OM11004471", "30 days nett", empty) | `value` per row (typed optional); the box is empty until then |
| 6.17 | Import review: correcting a row in place, "Fix all 3 like this", "Yes, Net 30", and the card copy "Fix them here" | a per-row correction endpoint that re-checks the row (`PATCH /import/{batch}/rows/{n}`), with the check's suggested value where it has one; a typed correction stays on the screen and the refused rows still come back through the failed-rows file |
| 6.18 | Import review: "Update instead" on a duplicate | a commit option to update the existing counterparty from the row instead of skipping it |
| 6.19 | Import review: "Ready to bring in · 41 · Everything checks out. 33 of them are on Peppol." | `counts.onPeppol` on the batch (typed optional); the card says "Everything checks out." without it |
| 6.20 | Import review: blocked rows offer "Leave it out" | none: the check never imports a `CANNOT_IMPORT` row, so the row shows "Left out"; importable rows toggle between "Leave it out" and "Bring it in" / "Bring in anyway", which is what `rowNumbers` on commit carries |

## 7. Suppliers: detail, purchase orders, record a bill, statement

Frames: Suppliers > Detail 163:26275, Add to a payment run 163:29156, New purchase order 163:27317, Record a bill 163:27781, Statement 163:28602. Pages: `src/pages/SupplierDetailPage`, `NewPurchaseOrderPage`, `PurchaseOrderDetailPage`, `RecordSupplierBillPage`, `SupplierStatementPage`. Mock: `tools/mock-api/routes/supplierRecord.mjs`.

| # | The design shows | Ask |
|---|---|---|
| 7.1 | Detail, "Open bills" rows: "Paying 3 Aug to take the discount" under the chip and an "Open the run" button | `paymentRunId` and the run's `paymentDate` on `BillRow` (only `paymentRunReference` today). The page reads `GET /payment-runs` to find the run by reference, which needs `invoice.payment.manage`; a reader without it gets a link to the payments list |
| 7.2 | Detail, "What you buy from them" info strip: "Yirgacheffe went up from 7.100 to 7.400 per KG in March. Everything else has held." | a price movement per line on `GET /suppliers/{id}/purchases` (e.g. `lastUnitPrice`, `previousUnitPrice`, `changedOn`). The strip reads the twelve-month bill count and total until then |
| 7.3 | Detail, Record card: "Added by Hafidh Saif" | `createdBy` (a person's display name) on `GET /suppliers/{id}`; drawn as "—" |
| 7.4 | Pay modal: "Credit they owe you: take MR-CN-0118 off the transfer" with a switch, and the credit line in the summary | the supplier's unused credit notes with the candidates (or a `supplierId` filter on `GET /credit-notes?status=UNAPPLIED`) and a `creditNoteIds` field on `POST /payment-runs/{id}/items`. The section says there is no unused credit note until then |
| 7.5 | Pay modal bill rows: "Already in draft run PR-0014 · due 28 Aug" in blue, "Approved 30 Jul · due 29 Aug · not in any run yet" | `paymentRunReference` on `PaymentRunCandidate`; today every candidate reads "Approved · issued … · due …" |
| 7.6 | Pay modal, "Add to draft run PR-0014: already holds 7 bills across 4 suppliers, 6,091.680, paying 3 August" | `billCount` and `supplierCount` on `PaymentRun`; the note reads the total and the date only |
| 7.7 | New purchase order, "How to send it": Send over Peppol, Email a PDF as well, Tell me when the goods arrive | `sendOverPeppol`, `emailPdf`, `remindOnWantedBy` on `POST /purchase-orders`, and a dispatch that transmits (Peppol Order or an e-mail with the PDF). Today `POST /purchase-orders/{id}/send` writes a log line, so the switches stay on the client and the order's page says nothing is transmitted |
| 7.8 | New purchase order, "What happens after this: Hafidh approves it · Over the 2,000 limit" | a purchase-order approval policy (approver, threshold) like `/expenditure/approval-policy` for bills; the step names no person and no limit |
| 7.9 | Record a bill: a bill typed in by hand, the file optional ("Attach the document: a bill without a copy of the original is harder to defend in an audit") | `POST /bills` for a typed bill without a file, or `POST /bills/intake` accepting no file. Today the page uploads the file then confirms, and asks for the file when there is none |
| 7.10 | Record a bill, "Send it straight for approval" switch: "Under 2,000, so Yusuf can approve it" | a `submitForApproval` flag on `ConfirmRequest` and the approver's name; the workflow state is the server's, so the switch stays on the client. The limit reads `GET /expenditure/approval-policy` |
| 7.11 | Record a bill lines carry a unit ("240 KG", "10 EA") | `unit` on `ConfirmRequest.lines[]` (typed `null` today); the unit is chosen on the row but not sent |
| 7.12 | Record a bill, "Their VAT number: On file, valid" | the VAT number's validity (an OTA check) on the supplier read; "On file" is what is drawn |
| 7.13 | Statement rows: "Against PO-0021 · matched in full", "Bank transfer · ref BM-4471-0916 · settled MR-INV-8712", and bills still open shaded | `detail` and `outstanding` on `SupplierStatement.entries[]` (typed optional in `supplierRecord.ts`; the mock answers them). A free-text `detail` is shown as sent, so it should come in the reader's language, or structured (`purchaseOrderNumber`, `dueDate`, `paymentRunReference`, `methodCode`, `paymentReference`, `settlesReference`) for the page to phrase |
| 7.14 | Statement ageing strip: "1 bill · due 28 Aug", "Never been late with them" | `ageingDetail` (`{bills, nextDue}` per bucket) and `everLate` on `SupplierStatement` (typed optional); "—" until then |
| 7.15 | Statement footer: "1 credit note still unused" | `unusedCredits` on `SupplierStatement` (typed optional) |
| 7.16 | Statement header: "Prepared 30 July 2026, 09:14" | `preparedAt` on the statement; the browser's read time stands in |
| 7.17 | Purchase order page, "Deliver to" reads a branch name | `deliverToBranchName` on `PurchaseOrder` (only the id today); the page reads `GET /v1/branches` to name it meanwhile |

---

## Update 2026-09-30: checked against the published PINT-OM rules (buyer side)

Expenditure is the **buyer** side. A bill that arrives over Peppol carries the supplier's own VAT categories, reason codes and classification, validated by the sender; the screens show them and report the receipt. Manual bills (a photo, a bill typed in, a receipt) are not sent anywhere, so they ask for a VAT category but no reason code and no HS code. PINT-OM has no response message to the supplier, so "Refuse" and "Query it" stay internal ("nothing is sent to the supplier"). Sources: [PINT-OM billing](https://docs.peppol.eu/poac/om/pint-om/), [Oman rules](https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-jurisdiction-aligned-rules/), [TDD](https://docs.peppol.eu/poac/om/om-tdd/bis/) (PDK 1.4.4).

### R. Documents received over Peppol (detail pages)

| # | The screen shows | Ask |
|---|---|---|
| R.1 | Bill detail Compliance card, the credit note Compliance line, the debit note "Validated on the Peppol network" check, and the "Reported to the Tax Authority" entry in both notes' Activity: "Receipt reported to the Tax Authority · {date}" / "Receipt report waiting for the Tax Authority" / "Receipt report turned down" / "Receipt not reported yet". Without the field: "Receipt report status not available yet", and no Activity entry. (Replaces the earlier "reported by the supplier's provider: nothing to file from your side", which contradicted the TDD spec.) | Our own receiver-side report of each document received over Peppol (TDD, reporter role TDT-010 = 02 Receiver, receipt date TDOM-04 and time TDOM-05), as `receiptReport: { status: 'ACCEPTED' \| 'SUBMITTED' \| 'REJECTED' \| 'NOT_SUBMITTED', reportedAt: instant \| null, tddUuid: string \| null } \| null` on `GET /v1/bills/{id}` (under `compliance`), `GET /v1/credit-notes/{id}` and `GET /v1/debit-notes/{id}`. Null for documents that did not come over Peppol |
| R.2 | VAT column on bill and supplier note lines: "5%" on standard lines; "0% · Zero-rated" / "0% · Exempt" / "0% · Out of scope" with the reason code (VATZR-OM-nn, VATEX-OM-nn) or text beneath. Totals read "VAT" with no rate when categories mix | Per line on `GET /v1/bills/{id}` (which also serves the notes' lines): `taxCategoryCode` (IBT-151, CL-04-OM: S, Z, E or O), `exemptionReasonCode` (IBT-121: VATZR-OM-01..16 on Z, VATEX-OM-01..12 on E) and `exemptionReason` (IBT-120 text, the only reason an O line may carry) |
| R.3 | "Why they've credited you": the friendly reason (e.g. "Short delivery") and under it the official code, e.g. "QTY · Quantity correction" | `reasonCode` (BTOM-032) on credit and debit notes carries only a CL-02-OM code (CAN, VAT, VAL, QTY, OTH; IBR-023-OM). A finer reason, if kept, goes in an optional `reasonDetail` (today's SHORT_DELIVERY, DAMAGED, RETURN, OVERCHARGE, PRICE_CORRECTION, SURCHARGE, LATE_FEE, DUPLICATE, OTHER) |
| R.4 | Supplier card on bill and note details: VAT number and Peppol ID | The **document's** own seller VAT number (IBT-031) and endpoint ID (IBT-034, `0248:`…) on the bill and note responses, beside the supplier record's. The card still reads the supplier record today; when both are served it should show the document's and warn when they differ (a wrong supplier, or a document that is not what it claims) |
| R.5 | Totals "VAT · 5%" on a bill that mixes categories | The VAT breakdown per category (IBG-23: category, rate, taxable amount, VAT amount, reason) on `GET /v1/bills/{id}`, so the totals can list each category as our own invoices do |
| R.6 | Header chip "Arrived over Peppol" / "Credit note · Peppol" | The document type (IBT-003: 380, 381, 383, 386, 389, 261) and the transaction type bitmap (BTOM-001, CL-03-OM: e.g. Summary, Continuous supply, Prepayment) on the bill and note responses, so the chip can name a subtype such as "Prepayment" |
| R.7 | Note lines: "The line detail is not on this note yet" | Same as 5.8: the note's own lines, read from its XML, with R.2's fields |

### M. Documents entered by hand, and supplier records

| # | The screen shows | Ask |
|---|---|---|
| M.1 | Upload a bill, upload a supplier credit or debit note, and Record a bill: each line's VAT is a category (S5 Standard 5%, Z0 Zero-rated 0%, E0 Exempt 0%, O0 Out of scope 0%); the rate follows it. AE0 and G0 can no longer be chosen | `taxCategoryCode` (S5/Z0/E0/O0) on `ConfirmRequest.lines[]` and `FieldsRequest.lines[]` (PUT intake), stored on the bill line and echoed on `ExtractedBillFields.lines[]` (read from a UBL line's `cac:ClassifiedTaxCategory/cbc:ID` when present). Today only `vatRate` is read, so zero-rated, exempt and out-of-scope lines cannot be told apart for the VAT return |
| M.2 | Scan receipts: the 5% / 0% / Exempt chips | an optional header `taxCategoryCode` (S5/Z0/E0) on `ConfirmRequest` for a receipt confirmed without lines, stored on the bill; today 0% and Exempt send the same body |
| M.3 | New and edit recurring bill: VAT treatment Standard / Zero-rated / Exempt / Out of scope | `taxCategoryCode` (S5/Z0/E0/O0) on `RecurringBillRequest`, echoed on `RecurringBillResponse` and carried onto each bill it raises; today the treatment is inferred from `vatAmount`, so exempt and out of scope reopen as zero-rated |
| M.4 | Supplier form address: street, City, Governorate (Oman only), Postal code (3 digits); the Peppol ID prefilled as `0248:` + the VAT number | `street`, `city`, `countrySubentity` (governorate), `postalCode` stored as separate fields on `POST/PUT /v1/suppliers` and returned on `GET /v1/suppliers/{id}`. Needed before self-billing: on a self-billed invoice the supplier is the seller, and PINT-OM IBR-019-OM requires the address line, city and post code |
| M.5 | Supplier form, a supplier whose country is not Oman | a reverse-charge marker on the supplier (or derived from the country), so buying from abroad can point to the statutory self-billed invoice (import of services RCM, import of goods; BTOM-001 bits 9 and 13, IBR-017-OM, IBR-160-OM). Drawn later, with the self-billing rounds |
| M.6 | Record a bill: the unit chosen on each line is now sent (row 7.11) | none if the server stores `unit`; otherwise store it and return it on the bill lines |
