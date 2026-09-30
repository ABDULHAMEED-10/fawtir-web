# Documents: backend guide

**For:** the backend team. **Covers:** the document archive. **Last updated:** 27 September 2026.

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
  for `TODO(backend)` in `src/pages/DocumentsPage`, `src/pages/DocumentDetailPage`, `src/pages/UploadDocumentPage`, `src/lib/documentArchive.ts`, `src/lib/archiveXml.ts` and `src/api/compliance/archive.ts`.
- **Seeing the screens without a backend.** `tools/mock-api/routes/documents.mjs` answers the
  routes with realistic data in the shapes the screens expect (`src/api/**` holds the DTOs). Run
  `node tools/mock-api/server.mjs` and point the app at it; see `docs/LOCAL_SETUP.md`.

**Screens in this guide:** Documents list and empty state, a record, Upload a document, Share securely.

---
Rows in this guide are numbered 3.x. The number is kept from the joint document these rows
started in, because the code comments cite it.

## 3. Documents (`GET /v1/compliance/documents`, `/{uuid}`, the artefact hrefs, `POST /v1/suppliers/{id}/documents`)

Each field below is typed as optional on `src/api/compliance/archive.ts`; the screens draw it when it arrives and say "N/A", "Not recorded yet" or show nothing until then. `tools/mock-api/routes/documents.mjs` answers all of them, so the screenshots show the frames as drawn.

| # | The design shows | Ask |
|---|---|---|
| 3.1 | Documents list (154:139382): four cards "Documents kept 4,182 · Across 1,047 invoices and bills", "Space used 2.8 GB of 10 GB", "Integrity checks All passing · Last full sweep 30 Jul", "Under legal hold 14 · OTA audit of Q1 2026"; tab counts "All 10 · Sales invoices 6 · Bills received 1 · Legal Hold 3"; "Showing 6 of 10 records" and numbered pages | `summary { documents, invoices_and_bills, bytes_used, quota_bytes, integrity { all_passing, last_sweep_at }, legal_hold { count, reason } }` and `totals { all, issued, received, legal_hold }` on the list. Without them the cards read N/A (an empty archive reads 0), the tabs carry no count and the footer says "Showing 1 to 20" |
| 3.2 | Row title "INV-2038 · Nizwa Souq Café" | `counterparty_name`; the Peppol identifier's value stands in |
| 3.3 | Row line "Sales invoice · issued 23 Jun 2026 · 318.780 · 5 files", "Credit note received · 84.900 · AND-INV-3382" | `total_amount`, `currency`, `against_number` on the item; left out of the line when absent |
| 3.4 | File sizes "18 KB", "4.1 MB" in the selection bar, "559 KB" in the record header | `byte_size` on each artefact; a total is shown only when every file has one |
| 3.5 | "Verified" beside each file; record page card "Proof it hasn't changed": fingerprint time, last checked, SHA-256, "Check now" | `verified` per artefact and `integrity { sha256, taken_at, last_checked_at, matches }` on the item, plus a re-check route. "Check now" only re-reads the record today |
| 3.6 | "Download zip" (list selection) and "All 6 as a zip" (record) | a ZIP of one or several records. Until then each served file downloads in turn |
| 3.7 | Share securely modal (154:140908): link, password, expiry, "let them download", "one person only", every view logged | a share-link route (files, recipient, expiry, download, single device) answering the link and a one-time password. The modal is drawn in full; the link and password rows say they are made once sharing is switched on and "Copy the link" waits |
| 3.8 | "Place a legal hold" on the record | a route that places (and lifts) a legal hold on an archived record, with a reason. The button is drawn disabled; a held record shows its reason and no button |
| 3.9 | "Signature valid" on the sheet; "Delivered at 23 Jun 2026, 09:15" | `signature_valid` and `delivered_at`; the badge is hidden without the first, the record's own time stands in for the second |
| 3.10 | "What it relates to": the customer (with its invoice count), SO-0073, DN-0124 | `related [{ kind, id, label, note }]`; the other party alone (not linked) stands in |
| 3.11 | Tags "Q2 2026", "Wholesale", "+ Add" | `tags` on the record and a route to change them. Edits stay in the view today |
| 3.12 | "Who has opened it" with "Full log" | `access_log [{ actor_name, action, artefact, at, channel }]` and a full-log route. Until then the one event the archive does tell is listed: "Filed automatically" at the record's time |
| 3.13 | Upload a document (154:140599): "3 pages · 412 KB · read for a title and a date", the name, date and "Supplier · matched from the name in the file" filled in | reading an uploaded paper for a title, a date and its owner. The page shows the type and size, takes the name from the file name, and the owner is chosen by hand |
| 3.14 | Upload: "How long to keep it" (indefinitely, match the invoice, until a date) | a retention choice on `POST /suppliers/{id}/documents`; the choice is drawn and kept in the form, not sent |
| 3.15 | Upload: a customer as owner, "Also attach to" an invoice, order or catalogue item, and tags | a documents route for customers and invoices, an attachment link, and tags on uploaded papers. Only a supplier can be chosen; "Valid until" and the tags are written into the document's `note` so they are not lost |

## Update 2026-09-30 (review fixes)

Review findings 15 to 19, approved by the owner. Rows 3.1 to 3.15 above stand; the rows below
are new. Row 3.24 corrects what row 3.9 says about the "Signature valid" badge.

| # | The design shows | Ask |
|---|---|---|
| 3.16 | A credit or debit note's record: "Corrects invoice" in the laid-out document (number, issue date, UUID) and the corrected invoice, linked, under "What it relates to"; the list line says "corrects INV-2038" | `against_issue_date` and `against_uuid` beside `against_number` (the preceding invoice reference a credit note must carry, PINT-OM IBR-032-OM). The UUID is the corrected invoice's archive id, so the link opens its record. Until then the number and date are read from the signed XML's `BillingReference` where it has them, the UUID says "UUID not given yet", and the link opens the archive searched by the number |
| 3.17 | Every record named by what it is: invoice (380), credit note (381), debit note (383), prepayment invoice (386), self-billed invoice (389), self-billed credit note (261); "Debit note" and "Prepayment invoice" in the Kind filter | `type_code` (UNCL1001) on each item, and a `type_code` filter on the list. `document_kind` alone reads a debit note or a prepayment as an invoice. Until then the name falls back to `document_kind`, and picking debit note or prepayment asks for `document_kind=STANDARD_INVOICE` and narrows the page it gets, saying "Showing N on this page" |
| 3.18 | "issued 27 Jul 2026" on a received record | `issue_date` (the document's own `cbc:IssueDate`) on each item. `occurred_at` is when a received document reached us; until `issue_date` arrives a received record says "received 29 Jul 2026" rather than calling that date "issued" |
| 3.19 | "Validation: All five layers passed" | `validation { passed, total }` on the item. The line says all layers passed only when the archive says so, "3 of 5 layers passed" in red when not, the reporting failure when the TDD was rejected, and "Not confirmed yet" in grey otherwise. It no longer follows from an accepted TDD |
| 3.20 | "EN & AR" under the PDF | `languages` on the PDF artefact (`["en", "ar"]`). A supplier's PDF is theirs, so the badge reads "Languages not confirmed" in grey until the field arrives |
| 3.21 | The "Legal hold" tab | a `legal_hold=true` filter on `GET /v1/compliance/documents`. Until then the tab narrows the page the server answered, the footer says "Showing N on this page", and an empty result says held records on other pages are not listed yet |
| 3.22 | The sort menu (newest, oldest, retention ending soonest or last) | a `sort` parameter on the list. Until then the page the server answered is reordered and the footer says "sorted within this page" |
| 3.23 | "Search here..." | a search across the other party's name as well as the number (`q`). Only `invoice_number` exists, so the box now says "Search by document number..." |
| 3.24 | "Signed PINT-OM" under the XML and "Signature valid" on the laid-out document | `signature_valid` (row 3.9). Correction to row 3.9: the badge is no longer hidden without it. Both badges are always drawn: "Signed PINT-OM" / "Signature valid" when true, "Signature failed" in red when false, "Signature not confirmed" / "Signature not checked yet" in grey when absent |
| 3.25 | "Every view, download and share is recorded, and the log can't be edited" | `access_log` (row 3.12). The sentence is shown only when the log is answered; without it the card says no access log is kept for this record yet |
| 3.26 | Uploads in the archive | papers uploaded with "Upload a document" go to `POST /v1/suppliers/{id}/documents` and never appear in `GET /v1/compliance/documents`. The archive now says its "cannot be edited or deleted" rule covers Peppol documents, and the upload page says an upload is filed on the supplier's profile with its own retention. Ask: list uploads in the archive (with their own retention, row 3.14) if they are meant to be seen here |
| 3.27 | "Showing 6 of 10 records" | `totals` that follow the filters and search. The totals count whole tabs, so the footer quotes "of N" only when nothing is filtered; otherwise it says "Showing 1 to N" |
| 3.28 | On a received record, the tax data document "filed with the OTA by us as receiver (role 02)" | `tdd.reporter_role` to confirm it. The screen reads the role from the direction today (received means we reported as receiver) |
