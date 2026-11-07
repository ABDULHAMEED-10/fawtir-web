# Reports: backend guide

**For:** the backend team. **Covers:** the six report pages. **Last updated:** 27 September 2026.

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
  for `TODO(backend)` in `src/pages/Reports*`, `src/components/reports`, `src/lib/report*.ts` and `src/api/reports`.
- **Seeing the screens without a backend.** `tools/mock-api/routes/reports.mjs` answers the
  routes with realistic data in the shapes the screens expect (`src/api/**` holds the DTOs). Run
  `node tools/mock-api/server.mjs` and point the app at it; see `docs/LOCAL_SETUP.md`.
- **Related.** The Compliance report page reads the Activity summary; its rows sit here, the Activity screens in `ACTIVITY.md`.

**Screens in this guide:** Income, Expenditure, Cash flow, VAT & Tax, Compliance, Lists, Dashboard.

---
Rows in this guide are numbered 1.x. The number is kept from the joint document these rows
started in, because the code comments cite it.

## 1. Reports (`GET /v1/reports/volume`, `/expenditure`, `/cash-flow`, `/vat`, `/lists`, the `.csv`/`.xlsx` exports, `GET /v1/compliance/activity/summary`)

Every page reads a monthly history (1 January two years back to today) and cuts the frame's shapes from it: the pill's window and the one before it for the four figures, the trailing twelve months, quarters and years. The ranked cards read the server's own grouping over the pill's window. `tools/mock-api/routes/reports.mjs` answers all five report routes.

| # | The design shows | Ask |
|---|---|---|
| 1.1 | Header pill "Yearly" (every Reports frame) | none: it now drives the window (Yearly, Quarterly, Monthly = the last 12, 3 or 1 months to today, compared with the same span before). The old from/to/bucket bar (native date and select inputs) had no frame and is gone |
| 1.2 | "Export as PDF" | a server PDF of each report. The button prints the page (the browser's Save as PDF); the report's CSV and Excel exports for the same window sit under it as a small menu, so no export was lost |
| 1.3 | Chart corner button "Open full" | none: opens the chart in a dialog |
| 1.4 | Income "Invoices sent 1,624 ↑212", "Average invoice" | none: the volume report's `documents` (which also counts credit notes) and taxable / documents. A count of invoices alone (type 380/389) would make both exact |
| 1.5 | Income "Annually": 2024, 2025, 2026 with "On track for 207,000" | none: this year is drawn at its projection (year to date / share of the year gone), as the frame's hidden caption says. A server forecast would replace the straight-line projection |
| 1.6 | Expenditure "How bills reach you": Peppol / Uploaded / Scanned per quarter | none: the SOURCE grouping by document count; RECURRING and SELF_BILLED sit with Uploaded since the frame draws three colours |
| 1.7 | Expenditure "VAT you can reclaim · all standard rate" | input VAT by rate (see 1.14). The note says what share of the net the VAT is instead |
| 1.8 | Cash flow "What you kept" legend "Surplus" | none: net per month; a month where reversals outweighed payments is named in the footer instead of drawn |
| 1.9 | Cash flow "Due out in 30 days · against 9,884 expected in" | payables and receivables due by date (bills and invoices outstanding with due dates, summed over the next 30 days). The card says "Not forecast yet" |
| 1.10 | Cash flow "The next eight weeks": expected in and committed out per week, "Tightest week is 1 Sep" | the same, bucketed by week for eight weeks. The card keeps its title and legend and says the forecast is not reported yet |
| 1.11 | Cash flow "Where it went": Suppliers, Rent & premises, Wages, Utilities, Everything else, "Paid this year" | payments out by what they paid for. The card ranks what was billed by category (`/reports/expenditure?group_by=CATEGORY`) over the same window and says "Billed", not "Paid" |
| 1.12 | VAT "Owed to the OTA ↑32.6%" | none: the server's NET rows; when they sum below zero the card reads "Reclaimable" |
| 1.13 | VAT "Next return due 30 Oct · Q3 · 2 of 3 months in" | the tenant's filing calendar. Calendar quarters with returns due 30 days after the quarter's end stand in |
| 1.14 | VAT "By tax treatment": Purchases 97% standard | input VAT by category and rate. Received bills carry one VAT total, so the Purchases row is drawn as "Not split by rate yet"; Sales is exact from OUTPUT rows (standard, zero-rated, exempt and other) |
| 1.15 | Compliance monthly lines ("Accepted first time", "Time to clear the OTA") and the quarterly outcomes | a bucketed summary (`granularity=MONTH` on `/compliance/activity/summary`). Today the page asks for one summary per month (12 calls) plus the window and the one before |
| 1.16 | Compliance "Why things get rejected" by cause | a reason breakdown on the summary. Today the page reads the first 100 rejected documents of the window (`/compliance/activity?tdd_ack=RE`) and ranks their `tdd_leg.reason` text |
| 1.17 | Compliance "What happened to what you sent": First time / On retry / Delivery failed | a first-time vs on-retry split (from the TDD lineage). "On retry" is 0 until then; silence ("No acknowledgement yet") is drawn as its own grey part, never folded into failure |
| 1.18 | Lists "1,624 rows · 18 columns" on each card | `rowCount` and `columnCount` per dataset on the catalogue (for the window when it takes one). The line names the filters the dataset takes instead |
| 1.19 | Lists "PDF" on each card | a PDF format per dataset. The button is drawn disabled |
| 1.20 | Lists: twelve lists in three sections | datasets `customers`, `invoice-lines` (or `catalog-lines`), `payments-received`, `payments-made`, `credit-debit-notes`, `vat-ledger`, `aged-debtors`, `journal` if not yet published. A frame list the catalogue lacks keeps its card with its buttons off ("Not published yet"); an unknown dataset appears under "More" |
| 1.21 | Compliance "Accepted first time", "Rejections", "Time to clear the OTA" | none for the figures (acknowledged share, `tdd_ack.re`, median minutes to acknowledgement). Product note: an acknowledgement is transport, not an OTA verdict; the frame's words are kept as drawn |

## Update 2026-09-30 (review fixes)

Approved review findings on the report pages. Rows 1.4 and 1.14 above are stale; rows 1.22 and 1.23 correct them (the old rows stay because code comments cite them).

| # | The design shows | Ask |
|---|---|---|
| 1.22 | Income "Invoices sent", "Average invoice", "Invoiced, net of VAT", "VAT charged" and every Income chart. **Corrects 1.4.** The page now also reads the history by document type (`/reports/volume?group_by=TYPE`): invoices (380) and debit notes (383) add, credit notes (381) subtract, "Invoices sent" counts invoices (380) only, and "Average invoice" is invoice value over invoice count. A self-billed document (389, 261) is decided by direction, not by its code: whoever issues one is the buyer, so the tenant's own self-billed documents in the volume report are **purchases** and count nothing on Income (they reach the Expenditure side as bills with source SELF_BILLED). A self-billed document a **customer** issued to the tenant is the tenant's **sale** | a direction (the tenant's role, seller or buyer) on every volume row, and the customer-issued self-billed documents (tenant as seller) inside the volume report, so they count as sales; the same rule on the CUSTOMER grouping (which today still counts the tenant's own self-billed documents, having no type), on the volume `.csv`/`.xlsx` exports, and on `/reports/expenditure` (a customer-issued self-billed document must never count as spend). Say whether the TYPE key is the UNCL1001 code or the type name; the page reads both |
| 1.23 | VAT "By tax treatment": Purchases row. **Corrects 1.14.** Input VAT is now split by the four Oman categories as soon as INPUT rows carry them; the legend gains "Outside scope", so standard, zero-rated, exempt and outside scope are four parts on both rows (exempt and outside scope are no longer lumped as "Exempt"). While INPUT rows say `ALL` the Purchases row reads "Not split by category yet" | the OMTaxCat category (S, Z, E, O, CL-04-OM) on INPUT rows of `/reports/vat`, from the received document's tax subtotals (a bill with several categories gives one row per category), with its taxable amount |
| 1.24 | "Quarterly" in the header pill of every report, the VAT and other exports, and the Lists downloads (VAT ledger included). **Corrects 1.1 for Quarterly.** Quarterly is now the company's current tax period to date against the whole period before it, not the last three months. Calendar quarters (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) stand in. Yearly and Monthly are unchanged | the **company tax period**: the periods the OTA assigned the company at registration (start month and length, or the list of periods with their return due dates), on the company profile or a `/v1/company/tax-periods` read. The same answer replaces the calendar-quarter stand-in in "Next return due" (1.13) |
| 1.25 | "VAT paid on purchases", "Owed to the OTA", "Reclaim by supplier" (VAT), and Expenditure's "VAT you can reclaim". Input VAT is no longer presented as reclaimable: only VAT on bills that were **approved** and whose **receipt the tenant reported to the OTA** (EXPENDITURE.md row R.1) can be. Until the server says which, the VAT card reads "input VAT, reclaim not confirmed", "Owed to the OTA" says "reclaim not confirmed", the supplier card's legend reads "Input VAT" with its note saying the same, and the Expenditure card shows "VAT you were charged" with "reclaim not confirmed" | `reclaimableVatAmount` (the part of `vatAmount` on approved, receipt-reported bills) on each INPUT row of `/reports/vat` and on each row of `/reports/expenditure` (all groupings). The pages switch to it as soon as every row carries it: "Owed" becomes output less reclaimable input, and the cards say "reclaimable" again |
| 1.26 | VAT "VAT collected on sales", "Owed to the OTA", "Quarterly position" and "Monthly net payable". The VAT on the tenant's own self-billed documents (389, 261; the tenant is the buyer) is input VAT, not output: the page reads the volume report by type and takes that VAT out of output and out of net. It is not added to input, on the assumption that the matching bill (source SELF_BILLED) already carries it. The "By tax treatment" Sales shares cannot be corrected this way (the volume report has no category) | OUTPUT rows of `/reports/vat` that leave out the tenant's own self-billed documents and include the self-billed documents customers issued to the tenant (row 1.22) and debit notes (383); confirm that INPUT includes the tenant's own self-billed documents once and only once. The VAT export and the VAT ledger dataset need the same. Once done, the page's correction must be removed |
| 1.27 | VAT "VAT collected on sales" and "VAT paid on purchases" under reverse charge. Oman has four VAT categories only (S, Z, E, O; CL-04-OM); reverse charge is a transaction type (BTOM-001), not a category, so the page cannot tell a reverse-charged document from a row's `category` and does no reverse-charge arithmetic. Until the API says so, self-accounted reverse-charge VAT is shown only as the server already counts it | reverse-charge amounts on `/reports/vat`, identified by the BTOM-001 transaction type (reverse charge, import of services), per period: the VAT the tenant self-accounts as buyer, so the page can state it as output VAT and as input VAT both. The same on the VAT export and the VAT ledger dataset |
| 1.28 | Compliance labels (corrects the labels in 1.15, 1.17 and 1.21, not their asks). The figure is every acknowledgement, retries included, so "Accepted first time" now reads "Accepted" (card) and "Accepted, by month" (chart, series "Accepted, % of sent"); "Average time to clear" is a median and reads "Median time to clear" (chart series "Median seconds to acknowledgement"); in "What happened to what you sent" the parts read "Accepted", "On retry" (still 0, 1.17) and "Rejected" (the red part is the OTA endpoint's rejections; it said "Delivery failed"), and the footer "Rejections falling every quarter". A month nothing was sent in is drawn as no data (a gap in the line, a dashed outline bar, "No data" on a quarter's row), not as zero or as the month before. The "24-hour rule" footer is removed, per the owner's decision. "Accepted" and "Rejected" themselves stay as the frame words them (open decision, 1.21) | as 1.15 and 1.17: with a first-time vs on-retry split from the TDD lineage the card and chart can say "first time" again, and "On retry" fills in |
| 1.29 | Cash flow "Where it went" (corrects the basis in 1.11). It ranked what was billed before VAT beside "Money out", which is paid including VAT. It now ranks what was billed **including VAT** (`totalAmount`), and its footer says "VAT included" | as 1.11: payments out by what they paid for, on the same VAT-inclusive basis as `paidOut` |
| 1.30 | Expenditure "Bills received" and "Average bill" (ACC-5, local E2E 2026-10-29). Both read `documents` and `netAmount` of `/reports/expenditure`, which count supplier credit notes (381, 261) and debit notes (383) as documents and net their amounts in, so a credit note raises "Bills received" and lowers "Average bill". Income was corrected the same way in 1.22 from `/reports/volume?group_by=TYPE`; the expenditure report has no type grouping, so the page still shows the mixed figures | either `group_by=TYPE` on `/reports/expenditure` (the UNCL1001 `document_type_code` as `groupKey`, as 1.22 asks of the volume report), or, on every row, `billDocuments` and `billNetAmount`: the count and the net of bills only (380, and 389 where the tenant is the buyer), beside the existing signed totals. The page will then count bills only and divide bill net by bill count |

## 2. Dashboard (`GET /v1/dashboard`, `/bills/summary`, `/settings/plan`, `/invoicing/readiness`)

Wired 2026-10-08. Every figure on the dashboard used to be a sample company's. It now reads the
dashboard endpoint's tiles, payables from the bills summary and the invoice allowance from the
plan; a tile marked `UNAVAILABLE`, a refused read or a failed read says "Not available yet". The
readiness card reads `/invoicing/readiness` and shows nothing on a 404, so it is safe against a
backend that predates the route.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 2.1 | "Today's sales" with "20% vs yesterday" (Figma). Drawn with "Not available yet"; the cash received this month is shown beneath it from the `cash` tile | A `todaySales` tile: the day's invoiced total in OMR (business time zone) and the same figure for yesterday, so the card can show the change |
| 2.2 | Payables card | Not a dashboard tile; read from `GET /v1/bills/summary` (`invoice.read`). A `payables` tile would let the dashboard be one call and branch-filtered with the rest |
| 2.3 | The revenue chart's day / week / month switch. Month shows the last twelve months from `volumeTrend`; Day and Week read "Not available yet" | Daily (last 7 or 30 days) and weekly (last 12 weeks) buckets on `volumeTrend`, for example a `granularity=DAY|WEEK|MONTH` parameter |
| 2.4 | The topbar search: invoices, customers, suppliers, documents and catalogue, a few of each | Each list is asked separately (`/authored-invoices?q=`, `/customers?search=`, `/suppliers?q=`, `/compliance/documents?invoice_number=`, `/products?q=`). The document archive matches the number only, not the other party's name. A single `GET /v1/search?q=` would let one request answer all of them |
| 2.5 | The TDD & OTA badge in the sidebar: how many documents still need someone to act | Read from `GET /v1/compliance/activity/summary` (`attention`) on every page. A lighter count endpoint, or the count on `/me/entitlements`, would save the summary call |

## Update 2026-10-30 (read-model fields of backend #824, not deployed yet)

| # | The design shows | Ask |
|---|---|---|
| 1.30 (update) | Expenditure "Bills received" and "Average bill" (ACC-5) | **Fixed by backend #824**: when every row carries `billDocuments` and `billNetAmount`, "Bills received" counts bills only and "Average bill" is bill net over bill count, so a credit or debit note moves neither. Without them, or when only some rows carry them, both cards read `documents` and `netAmount` as before. "Billed to you, net of VAT" stays the signed `netAmount` |
| 1.31 | Spend by supplier: one row per supplier, linked or not (NEW-1) | **Fixed by backend #824**, which groups bills linked to no supplier record as `participant:<scheme:value>` or `name:<stated name>`. The page names a row by its `groupLabel`; a prefixed key is never printed and never made into a supplier link, since only an unprefixed key is a supplier id |
