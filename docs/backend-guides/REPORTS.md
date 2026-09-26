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

**Screens in this guide:** Income, Expenditure, Cash flow, VAT & Tax, Compliance, Lists.

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
