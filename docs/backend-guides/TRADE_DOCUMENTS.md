# Trade documents: backend guide

**For:** the backend team. **Covers:** quotations, order forms (sales orders and the purchase
orders listed beside them), delivery notes and purchase receipts, and turning any of them into an
invoice. **Last updated:** 30 September 2026.

This is the single guide for this area. It lists every place where a screen draws something the
API does not provide yet, and what to add.

## How to use this guide

- **The rule.** The product owner ruled that the Figma design is the source of truth. Each screen
  follows its frame; where the API does not carry what the frame draws, the screen draws it from
  the best value it has, or shows a marked placeholder, and the gap is a row below. The backend
  adapts to the screen; the front end then re-tests the integration by hand.
- **Where this area stands.** There is **no trade-documents API at all** today. Every quotation,
  sales order and delivery note on these screens is the page's own data (`src/lib/quotations.ts`,
  `orderForms.ts`, `deliveryNotes.ts`, their `*Detail.ts` files and `tradeCreate.ts`), and every
  quantity comes from one ledger, `src/lib/tradeLedger.ts`. Nothing on these screens is saved.
  Buttons that need a route say "Not available yet" in the app's usual notice; no request is sent
  to a route that does not exist. The exceptions that do talk to the API are listed in rows T.16
  and T.18.
- **Rows.** Each row reads: number, what the screen shows, what the backend must add. A row that
  says "none" records a decision, not a gap. Row numbers are stable ids: the code comments cite
  them, so they are never renumbered, and new rows are appended at the end of their section.
- **Finding it in the code.** Every gap is a `// TODO(backend)` comment naming its row. Search for
  `TRADE_DOCUMENTS.md` in `src/pages/Quotation*`, `src/pages/NewQuotationPage`,
  `src/pages/OrderForm*`, `src/pages/NewOrderFormPage`, `src/pages/DeliveryNote*`,
  `src/pages/NewDeliveryNotePage`, `src/pages/CreateInvoicePage`, `src/components/invoice` and
  `src/lib` (`trade*.ts`, `quotation*.ts`, `orderForm*.ts`, `deliveryNote*.ts`, `linkedDocuments.ts`).
- **Seeing the screens without a backend.** The screens need no mock route: they carry their own
  data. The invoice composer's pre-fill reads the customer from the mock API
  (`GET /v1/customers/{id}`, ids `c-nizwa`, `c-grand`, ...).

**Screens in this guide:** Quotations (list, detail, new); Order forms (list, sale detail,
purchase detail, new sales order, new purchase order); Delivery notes (list, sale detail, purchase
receipt detail, new delivery note, new purchase receipt); the invoice composer's "Link related
documents" dialog and its pre-fill from a trade document.

**Trade documents are not reported to the OTA.** See row T.19.

---

## 1. Documents and lines

| # | The design shows | Ask |
|---|---|---|
| T.1 | Lists and details of quotations (13:37426, 13:45754), order forms (68:38578, 68:39818, 68:40327) and delivery notes (68:39213, 68:40836, 68:41301); the create forms (13:42543, 68:42177, 68:42691, 68:41721, 68:43204) with "Save draft", "Send quotation", "Confirm order", "Send with driver" | Create, read, update and delete for each kind: `GET/POST /v1/quotations`, `GET/PUT/DELETE /v1/quotations/{id}`, and the same for `/v1/sales-orders` and `/v1/delivery-notes` (purchase receipts already exist, see T.16). Lists paged and filtered by status, direction and search text. Each record names its counterparty by id (`customerId`), not by name. Until then a detail page reads the record named in its address from the page's data (`quotationById`, `orderById`, `deliveryById`); a list row without a full record shows its known facts and "Not recorded yet" / "Not available yet" in the rest, and an unknown number shows "not found" |
| T.2 | The line table on every trade form: description, unit price, VAT %, quantity, unit, discount, line total | One line model shared with the invoice, so a conversion loses nothing: free-text `description`, optional `productId`, `goodsOrService` (G/S), `unitCode` (UN/ECE Rec. 20, `ZZ` Other), `unitPrice` exclusive of VAT at three decimals, `quantity`, discount (percentage or fixed), `taxCategory` (S5, Z0, E0, O0 only, OMTaxCat) with `exemptionReasonCode` (VATZR-OM / VATEX-OM) where needed, and the classification of T.3. Totals are computed by the server, never stored as typed text (the design typed QUO-0119's totals and took the discount off twice; the front end now computes them: 7,272.000 / 492.000 / 6,780.000 / 339.000 / 7,119.000) |
| T.3 | Classification on a line that becomes a business or government invoice line | The line's HS code (IBR-079-OM) on goods and service type (CL-12-OM, required only on an export of services, IBR-155-OM) on services, stored on the trade line or taken from its product. The page's data carries "Other" (`000000000000`) on goods lines, which PINT-OM always accepts |
| T.4 | Statuses: quotation Draft / Sent / Expiring / Accepted / Delivering / Declined / Expired, "Valid until … 28 days left"; order and note statuses Open, Overdue, Ready to invoice, Awaiting supplier bill, Completed | The status on each record, and `validUntil` on quotations with expiry derived by the server (a lapsed quote reads Expired; "Expiring" within 7 days). The "Expired" tab is empty until the server says a quote expired. Order and note statuses follow the ledger of T.13 (ready to invoice = delivered and not billed) |
| T.5 | Numbers QUO-0119, SO-0075, PO-0032, DN-0132, GRN-0090 on the create forms | Server-assigned numbering per kind and branch, returned on create. The forms show the next number as a placeholder. (The new delivery note's header printed the receipt number GRN-0090; it now shows DN-0132) |
| T.6 | Trade documents behind the plan gate (`PlanGated feature="tradeDocuments"`) | Confirm whether trade documents count toward the plan's document limit. Proposal: they do not; the limit counts documents sent and received over Peppol, and a trade document is neither. The feature itself stays plan-gated (gating is built but switched off) |
| T.7 | Tab counts, direction counts ("All orders 34"), KPI cards ("Open orders 46,880.000", "Invoice 4 orders", "No proof of receipt 3"), subtitle "24 quotations · 22,480.500 open", pager "1 2 3 4 … 20" | `totals` per status and direction and a `summary` (open value, in transit, delivered not invoiced, received not billed, win rate, expiring soon) on each list. The design's figures contradicted each other (All 32 against 24 in the subtitle, 9 expiring against 2, 48 notes against 31 + 13); the screens now count the rows they hold, so every number agrees with the table, and the pager pages those rows |
| T.8 | Detail extras: quotation PDF with zoom, print and download; "Opened three times, last opened 29 Jul 16:40"; activity timelines; notes; attachments and "Drop files" | A rendered PDF per document, open tracking on a sent quotation, an activity feed per record, notes, and an attachments route. The quotation PDF picture is the design's QUO-0118 and is shown for that record only; other records say "Not available yet" |
| T.9 | Buttons with no route: Export, Filters, Sort, Send, Send reminder, Mark as accepted / declined, Extend validity, Revise & resend, Edit, Duplicate, Delete, Download, Print, Save draft, Preview, Confirm order, Schedule payment, Mark as paid, View their invoice, Change (order), Go standalone, Add line item | Routes for each action. Every one of these buttons shows "Not available yet: trade documents are not connected to the server". "Convert to invoice", "Issue invoice", "Log a delivery" and "Record receipt" work today (they open the invoice composer or the new note form) |

## 2. Conversions

| # | The design shows | Ask |
|---|---|---|
| T.10 | "Convert to invoice" on a quotation, an order form and a delivery note; "Issue invoice" on the list | The composer opens at `/invoices/new?from=<number>` and is filled from the trade document (`src/lib/tradeConvert.ts`): the customer (by record id), each line's description, goods/service flag, unit code, price excl. VAT, quantity, discount, VAT category, reason code and classification, the subject, and the delivery date (IBT-072, the day the goods changed hands). An order is billed for what was delivered and not yet billed. Nothing is saved until the reader saves. Wanted: a server conversion (`POST /v1/invoice-drafts?from=<trade id>`) that does the same and records the link (T.13) |
| T.11 | The purchase order number the dialog asks for ("Their purchase order number"); the order and contract behind a sale | IBT-013 purchase order reference: the draft already has `purchaseOrderReference`; the pre-fill and the dialog's typed number now go into it (the dialog used to drop it). IBT-012 contract reference: the draft refuses `contractReference` outside self-billing (`BUYER_REFERENCES_NOT_SELF_BILLED`); allow it on an invoice made from an order under a contract. (The review called the contract reference IBT-014; in EN 16931 and PINT, IBT-012 is the contract reference and IBT-014 the sales order reference) |
| T.12 | The order and delivery notes an invoice settles | Draft fields for IBT-014 sales order reference (`SO-0073`), IBT-015 receiving advice reference (the customer's goods-received number, when they give one), IBT-016 despatch advice reference (the delivery note; one per invoice, so an invoice for several notes names them on its lines) and the line-level delivery note reference (named IBT-184 in the review; confirm the business term against the published PINT-OM line model, which could not be reached from here). The pre-fill works all of them out (`TradeReferences`) and keeps the documents linked on section 4; they are not sent until these fields exist |

## 3. Quantities and delivery

| # | The design shows | Ask |
|---|---|---|
| T.13 | Ordered / delivered / invoiced / to invoice / to deliver per line; "Delivered, not invoiced 372.000"; DN-0124 "not invoiced"; the fulfilment bars and percentages | One quantity ledger per order line: ordered, delivered (sum of its delivery notes) and invoiced (sum of the invoices that billed those notes), plus which invoice billed which note. The page's ledger (`tradeLedger.ts`) records SO-0073's lines, its two drops DN-0121 and DN-0124, and INV-2041 billing DN-0121; every figure is derived from it. This fixed the design's contradictions: 248.000 delivered and not invoiced against a drop worth 372.000, and DN-0124 "not billed" although INV-2041 was said to bill "the first two drops". The first drop was also numbered DN-0119, the number of an unrelated standalone note; it is DN-0121 now |
| T.14 | New delivery note: "You're shipping 2 batches more than SO-0073 covers", "Raise order", "Not billable" | The server refuses a delivery note whose line ships past what the order still owes, unless the order is raised first or the excess is marked as a goodwill line that is never billed. The form now computes what each line still owes from the ledger, warns on any line that ships more, and refuses "Send with driver" until the quantity is lowered. "Raise order" and "Not billable" say "Not available yet" |
| T.15 | Proof of delivery: receiver, signed at, where, driver, the captured signature; "Signature on device / Photo on drop off / Paper copy"; "No proof of receipt" | Proof on the delivery note: method, receiver name, timestamp, place, driver and vehicle, and the signature or photo file. The delivery note's "Default tax category" (the design printed "Vehicle" there) is the VAT category its lines take when the note becomes an invoice |
| T.16 | Purchase side: purchase orders, receipts, the three-way match "Order, delivery and invoice all agree", "Received, not invoiced" | Purchase orders and goods receipts already exist (`/v1/purchase-orders`, `/{id}/receipts`, E-13) and have their own screens under Expenditure; bills carry their match to an order and receipt. Wanted: the Order forms and Delivery notes lists read those routes for their purchase rows (they are the page's data today), and a match summary per order. The design's PO-0031 list row and GRN-0087 row ("awaiting supplier bill") contradicted PO-0031's own detail and the Bills screens (billed on MR-INV-8821 and matched); those rows are now PO-0030 and GRN-0086, and PO-0031 opens the design's purchase detail, whose header had been pasted from PO-0029 |

## 4. Linked documents and self-billing

| # | The design shows | Ask |
|---|---|---|
| T.17 | "Link related documents" (69:45570): "Showing documents for Nizwa Souq Café", filters with counts | A search of a customer's order forms and delivery notes (`GET /v1/trade-documents?customerId=&notInvoiced=`), and a place on the draft to keep the links (INCOME.md 3.5). The dialog now lists only the chosen customer's documents (it also listed Salalah Beach Resort's DN-0131), shows nothing until a customer is chosen, counts each filter from what it shows, and drops links to another customer's documents when the customer changes |
| T.18 | "Self-bill supplier" on a purchase order and a purchase receipt awaiting the supplier's bill | Self-billing is offered only under a signed, active self-billing agreement with that supplier (handbook 5.1). The screens read `GET /v1/self-billing-agreements` (with `selfbilling.agreement.manage`) and apply the same checks as the self-billing screens (`blockerOf`). Trade documents do not carry the supplier's record id, so no agreement can be matched and the button is drawn disabled; pressing it says why. Wanted: the supplier's counterparty id on every purchase-side trade document |

## 5. The Tax Authority

| # | The design shows | Ask |
|---|---|---|
| T.19 | "Nothing reported to the Tax Authority" on a quotation; "the invoice is the next step, and the only one that goes to the Tax Authority" on a delivery note | None: a decision. Quotations, order forms, delivery notes and purchase receipts are not tax documents. They are never sent over Peppol and never reported to the OTA as a Tax Data Document; only the invoice (380), credit note (381) or debit note (383) made from them is. No trade-document route may submit anything to the OTA |
