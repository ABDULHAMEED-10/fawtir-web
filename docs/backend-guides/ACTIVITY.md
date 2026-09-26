# Activity (TDD & OTA): backend guide

**For:** the backend team. **Covers:** the Activity ledger, called "TDD & OTA" in Figma. **Last updated:** 27 September 2026.

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
  for `TODO(backend)` in `src/pages/ActivityPage`, `src/lib/activity*.ts`, `src/lib/complianceReport.ts` and `src/api/compliance/activity.ts`.
- **Seeing the screens without a backend.** `tools/mock-api/routes/activity.mjs` answers the
  routes with realistic data in the shapes the screens expect (`src/api/**` holds the DTOs). Run
  `node tools/mock-api/server.mjs` and point the app at it; see `docs/LOCAL_SETUP.md`.

**Screens in this guide:** Activity list and empty state, the record, resubmit, the OTA call log and a call, the built compliance report and its dialog.

---
Rows in this guide are numbered 2.x. The number is kept from the joint document these rows
started in, because the code comments cite it.

## 2. Activity (TDD & OTA) (`GET /v1/compliance/activity`, `/summary`, `/{invoice_uuid}`, the row's `links.resubmit` and `links.tdd_xml`, `GET /v1/reports/ota.xlsx`)

The list, its cards and tabs read the ledger and its summary; the record and the resubmit page read `/{invoice_uuid}`. The optional fields below are typed on `src/api/compliance/activity.ts`; the screens draw them when they arrive and fall back (or say "Not on the record yet") until then. `tools/mock-api/routes/activity.mjs` answers every route and fills them, so the screenshots show the frames as drawn.

| # | The design shows | Ask |
|---|---|---|
| 2.1 | Activity (154:109992) row "Barka Resort - 1,842.000" under the invoice number | `amount` and `currency_code` on the ledger item; the counterparty alone shows without them |
| 2.2 | Column "TDD and Fawtara reference": "4b17-9ce2-8a04-31df" over "Fawtara OM-2026-0084398" | `tdd_uuid` (the live TDD's) and `fawtara_reference` on the item. Without them the row says "No TDD UUID yet" and "Waiting for the reference" / "No Fawtara ref - never accepted" |
| 2.3 | Column "Which flow": "Both on Peppol · flow 1", "Stand-in ID 997770000099 · flow 7"; Customer "Not on Peppol" | `scenario { flow, stand_in_id }` on the item. The chip is read from `b2c` and `tdd_leg.variant` meanwhile, and the route line names the flow without its number |
| 2.4 | Tab "Superseded 8", pill "Superseded", "Replaced by 6C25-…" | `superseded` on the summary, `superseded_by` on the item, and a `SUPERSEDED` TDD status the `tdd_status` filter answers. The ledger is one row per document while the frame counts submissions ("1,643 submissions"); a per-submission view (or the superseded TDDs as their own rows) would let the tab list what the frame lists. The tab reads 0 until then |
| 2.5 | Card "Time to acceptance 2m 14s · Average this month, down from 2m 52s" | `previous_median_minutes_to_tdd_ack` (the same median over the window before). The card says "Typical this year" without the comparison until then. The figure is the median, not an average |
| 2.6 | "Sort" on the toolbar | a `sort` parameter on the ledger. Newest first is the server's order; Oldest and Invoice number re-order the page on screen only |
| 2.7 | Search "Invoice number, TDD UUID" | search by TDD UUID (the ledger filters `invoice_number` only) |
| 2.8 | Empty state (154:110456): "Registered for VAT · OM1100392000 · confirmed against the OTA register", "Live on the Peppol network", "Fawtara connection open · Answering in 0.9s · certificate valid to Mar 2027", "Test the connection" | a readiness route (VAT registration check, SMP registration, Fawtara reachability and certificate expiry) and a connection test. The banner prints the design's values and the button does nothing yet |
| 2.9 | Compliance report dialog (154:111604) "What you'll get": Rejected then corrected 5, Total invoiced 52,418.900, VAT reported 2,620.945 | a corrected-after-rejection count and the period's invoiced total and output VAT on the summary. Invoices, accepted and still-not-reported come from `/summary?from&to` for the chosen period; the other three are the design's figures |
| 2.10 | Build report (154:109471): the signed PDF pack (reference CR-2026-Q2-0004, pages, fingerprint, "Share securely", "Sending it out", "Jump to") | a route that builds, stores and returns a compliance report for a period with the sections ticked, its fingerprint and its share state. "Download Excel" is real (the ledger export for the report's quarter); the document is the design's Q2 pack |
| 2.11 | Record (154:111026) rail "Turned down · 8 Jun · 11:22:31 · OTA-E-1122" for an earlier attempt | `rejected_at` and `error_code` on each `TddObligationDto` (`error_code` is typed optional). The step shows no time until then; the last attempt's time comes from the leg |
| 2.12 | "Look on OTA portal", "Open the portal" | a portal deep link for the document (or the portal's search URL). The buttons are drawn and do nothing yet |
| 2.13 | "Which route it took": Your participant ID 0248:OM1100392000, Their participant ID 0248:OM1100558840 | both participant IDs on the record; they read "Not on the record yet" |
| 2.14 | "How long it's kept · Integrity · Checked today" | the archive's integrity result for the record (shared with Documents 3.5). "Kept until" and "Time remaining" are worked out from the issue date and the ten-year rule |
| 2.15 | "Take a copy": each file with its size, "Get ZIP" | per-file hrefs and sizes (accepted TDD, withdrawn TDDs, the OTA acknowledgement, the MLS replies, the invoice) and a ZIP. The list is built from the lineage and the MLS replies, without sizes, and the rows are not links yet |
| 2.16 | TDD resubmit (154:108616) step 1: "Their Peppol participant ID" typed and saved with the resend | a fix descriptor on a refusal (which field on which record, and its suggested value) and a way to save it. The Peppol case is drawn; the typed ID is not saved yet. "Fix and send" posts `links.resubmit` for each invoice in the group |
| 2.17 | Step 2 "What will change in the report": field, report turned down, report about to be sent | a before-and-after of the TDD a resubmission would send. The design's table is shown |
| 2.18 | Step 3 "Every attempt counts against your monthly allowance · 412 used, 3 about to be used, 85 left of 500"; "Quota after this 85 left" | the tenant's submission allowance and usage. The design's figures are shown |
| 2.19 | "Same cause this week 3 invoices", "Fixing alongside 2 more invoices", "Fix and send all three" | a same-cause grouping (by error code) on the record. The page reads the first 100 rejected rows (`?tdd_ack=RE`) and groups those with the same `tdd_leg.reason` that carry a resubmit link; "If you leave it" sums their `amount` and derives the VAT from it |
| 2.20 | OTA call log (154:110659) and call detail (154:109008): every request and reply, the four figures, the pager, "Export this log" | a call-log route (per call: method, path, status, timings, request and response headers and bodies, related calls) and its CSV export. Both screens are the design's day; the menu's "still waiting" count is the summary's `tdd_ack.none` |
| 2.21 | Call log "⋮" (154:111516): "Download every TDD for a period", "Download OTA acknowledgements", "Who hears about compliance problems · Currently Hafidh Saif only" | a bulk TDD/acknowledgement download for a period and the compliance-alert recipients. The first two open the report page (whose dialog offers the XML and acknowledgements), the third opens Team settings and its note says "Owners and admins on your team" |
| 2.22 | Product note: "Accepted by the OTA", "What the OTA said", "Rejected", "Retry everything still waiting" | none for the data. The integration had removed these words because an MLS acknowledgement is transport, not an OTA tax verdict (SA v1.0.3 §7.1.2, OTA FAQ §3.3 Q1). The frame's words are back as drawn, on the product owner's ruling; the rules stay: silence (NONE) is "Still waiting" and never red, and no resend is offered on silence (SPOG v1.0.0 §6.2), so "Retry everything still waiting" opens the Still waiting tab instead of resending |
| 2.23 | Record (154:111026) Peppol rail "Their access point took it · 8 Jun · 11:21:16" | the time the buyer's access point took the message (the AS4 receipt) on the item or the record. The step is drawn from `transport_state` (SENT or DELIVERED) with no time until then |
| 2.24 | Record "Why the first one was turned down": a headline naming the cause ("The tax category didn't match the rate"), the validator line (`TAX_CATEGORY_MISMATCH: ...`) and "See what changed" | a cause title, the raw validator message and a before-and-after of the corrected report on each refused `TddObligationDto`. The box shows `failure_reason` and the error code until then |
