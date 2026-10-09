# Fawtir web: project handbook

**For:** anyone who picks this project up, human or AI, without the history of earlier chats.
**Last updated:** 30 September 2026. **Owner:** Abdul Hameed (GitHub `ABDULHAMEED-10`).

This is the memory of the project: what it is, how we work, the rules that keep the UI intact
while the backend is wired in, every product and Oman-compliance decision taken so far, and the
commands that check the work. `CLAUDE.md` at the repo root is the short version that loads
automatically; this file is the full one. When the two disagree, fix whichever is wrong.

---

## 1. The project

**Fawtir** is an Omani e-invoicing and accounting SaaS. This repo, `fawtir-web`, is its web front
end. It creates, signs and reports invoices to the **Oman Tax Authority (OTA)** under the Fawtara
programme over the **Peppol** network, using the **PINT-OM** invoice standard, and covers the rest
of a small business's books around that: bills from suppliers, payments, customers, suppliers,
catalogue, stock, point of sale, reports and the document archive.

- **Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, react-router, i18next with full
  **English and Arabic (right to left)**.
- **Repo:** `github.com/ABDULHAMEED-10/fawtir-web`. Branches: **`main`** (deployed) and **`dev`**
  (where work lands). Only these two are kept; every other branch is deleted after merging.
- **People:** the owner reviews and merges PRs on GitHub and is the product authority. **Zain**
  builds the backend and sends integration PRs. **Abrar** built the ERP integration.
- **Deploy:** CI on every push and PR runs `npm ci`, `npm run build`, `npm run test`, `npm run lint`
  (lint reports only). A red build or test blocks the deploy.
- **Backend:** a separate repo (`fawtir-backend`, Java). Its API is under `/api/v1/*`; the DTOs the
  front end expects are in `src/api/**`. Local setup for both: `docs/LOCAL_SETUP.md`.

### Where things are in the code

| What                                                                                                         | Where                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| One screen                                                                                                   | `src/pages/<Name>Page/` with a barrel `index.ts` and its test beside it |
| A screen's data, types and derivations                                                                       | `src/lib/<screen>.ts` (never inline in the component)                   |
| API calls and DTOs                                                                                           | `src/api/<area>/*.ts`                                                   |
| Shared UI (Select, Combobox, DateField, FilterMenu, SortMenu, ActionMenu, Modal, OmAmount, Rial, Pager, ...) | `src/components/ui/`                                                    |
| Invoice-form parts (ClassificationField, unitOptions, selectAllOnFocus, line tables)                         | `src/components/invoice/`                                               |
| Code lists (HS codes, service types, ISIC)                                                                   | `src/lib/codeLists/`                                                    |
| Translations                                                                                                 | `src/i18n/locales/en.json` and `ar.json`                                |
| Screen assets exported from Figma                                                                            | `src/assets/<screen>/`                                                  |
| Mock API for screenshots and demos                                                                           | `tools/mock-api/server.mjs` and `tools/mock-api/routes/*.mjs`           |
| Backend guides (what each area still needs from the API)                                                     | `docs/backend-guides/`                                                  |

---

## 2. How we work

### The order of priority

1. **Figma is the starting point, not the last word** (owner, 7 Oct 2026). Look at the frame
   before guessing or asking, and follow it for layout, spacing, icons, colours and look. But
   Figma can be wrong or out of date. Where requirements have changed, where a feature is new,
   or where a screen is wired to the API (Branches, Company settings, Plans and many others),
   build from the requirement and the API in the house style (section 3.3), not from the frame.
   Do not add placeholders only to match a frame the product has moved past; say what differs.
2. **Logic beats a designer's slip.** The design is the authority on intent, not arithmetic or
   typos. Figures that do not add up, a label pasted from another screen, a duplicated field, tab
   counts that contradict the cards: fix them, keep the screen, and say what changed.
3. **Integration is kept.** Never delete an API call, request assertion or permission check to
   make a screen look like a frame. A designed element the product still wants but the API cannot
   answer yet is drawn and marked `TODO(backend)` with a guide row (section 4); an element the
   product no longer wants is not.

### A normal piece of work

1. Sync first: `git fetch`, `git checkout dev`, `git merge --ff-only origin/main`.
2. Open the Figma frame (section 3.1) and look at the image, not only the layer names.
3. Build or fix the screen.
4. Verify (section 3.4): type-check, tests, screenshot against the frame in English, Arabic and
   at phone width, responsive sweep.
5. Commit to `dev` with a message that says what changed and why, and push `dev`.
6. The owner opens the `dev` to `main` PR and merges it. Do not push to `main` unless the owner
   says so for a specific merge.
7. When the owner does ask for `main`: open the `dev` to `main` PR, **wait for the `verify` check
   to go green** (merging early broke `main` once, #105), merge it with the title
   `Merge pull request #<n> from ABDULHAMEED-10/dev`, then fast-forward `dev` to `main`.

### Reviewing a backend PR before it is merged

The owner's rule: **verify, never merge blindly. The UI must stay as it is; integration should
connect; if some part cannot, leave it for later.** The procedure used for PRs #80, #81 and #85:

1. `git fetch origin pull/<n>/head:pr-<n>` and read the whole diff.
2. Reject or flag anything that changes layout, spacing, colour or existing copy, adds a native
   `<select>`/date input, removes a designed element, or drops a request assertion from a test.
3. Merge it onto current `main` in a throwaway branch; `npm run build`; `npm run test`.
4. Build with `VITE_REQUIRE_SESSION=true`, run the mock API, and screenshot every screen the PR
   touches, in English, Arabic and at 390 px (section 3.4). Compare with the frame.
5. If it is clean and the owner agrees: merge into `main` with the message
   `Merge pull request #<n> from ABDULHAMEED-10/<branch>`, push `main`, delete the PR branch
   (`git push origin --delete <branch>`), then fast-forward `dev` to `main` and push `dev`.

### Talking to the owner

- Short, plain answers: the result first, then what was checked, then what is left.
- Say what was **not** verified. "I confirmed it by screenshot" only when it was.
- Decisions that are the owner's to make (product wording, business rules) are asked, briefly,
  with a recommendation. Everything else is decided and reported.
- The owner writes quickly, often without punctuation. Read for intent.

---

## 3. Keeping the UI intact

### 3.1 The Figma file

- File key **`9cUaVMybChEiMAIyNNbxHp`**, page **`0:1` "Web"**:
  https://www.figma.com/design/9cUaVMybChEiMAIyNNbxHp/Fawtir-Web?node-id=0-1
- Read it with the **Figma MCP** (`get_metadata`, `get_screenshot`, `get_design_context`). If the
  tools are missing, the connector has dropped: reconnect it in claude.ai Settings, Connectors,
  then start a new chat. The REST token issued in Aug 2026 has expired.
- `get_metadata` on the whole page returns megabytes. Save it to a file and parse frame names with
  a script; never read it inline.
- The owner's dev-mode links (`node-id=1-27134`) show a **different id space** for Income,
  Expenditure and Suppliers (for example Expenditure is `163:16959` there and `154:131901` on page
  `0:1`). Both work with the MCP. **Node ids change when the designer re-uploads a frame:** find
  frames by name, then take the id.
- **Screens with no design:** POS, the **self-billed credit note** and the **supplier business activity** dialogs (below), and the **invoice import dialog** (the Invoices list's Bulk
  upload). Most **console (super admin)**, **ERP integration** (connections, extraction, Bridge,
  mapping, reporting) and **subscription / plan administration** screens have no frame either:
  Figma has only "Super Admin -> Operations" and "Super Admin -> Tenants". Every such screen
  follows the house standard in section 3.3 instead of being invented. On these judgement decides
  within that standard; flag such decisions. The import dialog is an owner-approved
  exception (2026-09-28, on grounds of time, per the approved Invoice Import guide): it is built on
  the existing theme and components only and changes no other screen.
- **Self-billed credit note (approved 2026-09-30):** a necessary screen with no Figma frame (PR
  #117). It reuses the credit-note composer and changes no other screen; its wording must fit a
  purchase document (supplier, input VAT), not the sales wording of the composer.
- **Supplier business activity (approved 2026-09-30):** the ISIC field in the self-billing
  agreement dialog and the "Set business activity" dialog from an agreement's row menu (PR #120)
  have no Figma frame. Built with existing components only (Modal, Combobox); the code is saved on
  the supplier's record and goes on every line of that supplier's self-billed documents (BTOM-033).
- **Zero-rating warning (approved 2026-09-28, same basis):** the line warning in the invoice composer
  and the confirmation step before issuing (INCOME.md rows Z.1 to Z.7) have no Figma frame. Build
  them with existing components only and touch no other screen. Manual invoices warn and never
  block, except an export reason on an Omani customer; the catalogue checks at product save.

Sections on page `0:1` (children are the frames; list them with `get_metadata` on the section):

| Section                                                                       | Node                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Auth Screens (sign-in, sign-up, onboarding)                                   | `154:79063`                                                       |
| Income frames (invoices, notes, periodic, reminders, self-billing*, customers) | top-level frames, e.g. Invoice `154:86625`, Customers `154:91007` |
| Reports                                                                       | `154:105574`                                                      |
| TDD & OTA (shown in the app as **TDD & OTA**, as in Figma)                     | `154:108266`                                                      |
| Super Admin                                                                   | `154:111760`                                                      |
| POS                                                                           | `154:112770`                                                      |
| Settings                                                                      | `154:116156`                                                      |
| Catalog                                                                       | `154:122992`                                                      |
| Expenditure                                                                   | `154:131901`                                                      |
| Documents                                                                     | `154:139157`                                                      |
| Suppliers                                                                     | `154:141044`                                                      |
| Notifications                                                                 | `154:144757`                                                      |

\* Self-billing is drawn among the Income frames, but the app places it under **Expenditure**
(owner decision of 6 Oct 2026, section 6): the frames are followed, the placement is not.

Frames that are named misleadingly in Figma: "Credit note detail" (`154:97418`) is the **debit**
note detail; "Reminder" is the per-invoice reminder card, while the reminders pages are "Payment
reminders" and "Payment reminders - settings"; "Open invoice" in TDD & OTA is the Income invoice
detail screen.

### 3.2 Standing UI rules

These apply to every screen, every language and every width. Each one came from the owner.

- **Match the frame exactly:** structure, order, copy, controls, states. Do not invent layout
  around text; export icons from Figma rather than drawing substitutes. A text-only reading of a
  frame caused two rounds of "this does not match my design".
- **English and Arabic.** Every visible string goes through `t()` with keys in both
  `en.json` and `ar.json`. Arabic is right to left and must mirror correctly. Numbers, codes and
  times that must stay left to right (a negative day offset, "2m 14s") get `dir="ltr"`.
- **Add translation keys only with `node tools/i18n/merge.cjs <file.json>`** (a deep merge of
  `{ "en": {...}, "ar": {...} }`). Hand-editing the locale files while others write them has lost
  keys before. The tool cannot delete keys.
- **No em dashes (—) in any visible copy,** English or Arabic. Use a colon, a comma or a full stop.
  A lone "—" as an empty-cell mark in tables is allowed (the frames use it).
- **Money shows the Omani rial sign, never the word "OMR" beside a figure.** Use `OmAmount`,
  `Rial`, `RialMark` or `withRial()` (which swaps "OMR" in a string for the sign, so code may
  build "OMR 12.500" on purpose). The sign's colour follows its figure (red overdue, green
  credit, dark ink otherwise) and its size matches the text. Shape: the CBO bold outline at
  1.86:1, generated by `tools/rial/build.mjs`. Currency **codes** stay text: currency pickers
  ("OMR - Omani Rial"), Peppol XML, bank codes.
- **Amounts have three decimals** (baisa): 12.500, not 12.5. A minus or plus goes before the sign:
  minus, then the rial sign, then 35.910 (`OmAmount` takes a `prefix` for this).
- **No native `<select>` or `<input type="date">`.** Use `Select`, `Combobox`, `DateField`,
  `FilterMenu`, `SortMenu` from `src/components/ui`.
- **Figure inputs select their default on focus** (`selectAllOnFocus` from
  `src/components/invoice`), so typing 5 into "0.000" gives 5, not 50.000.
- **Every page works at 390 px** with nothing scrolling sideways. Responsive classes are
  additive (`max-md:`, `max-lg:`); never change the desktop to fix the phone.
- **Loaders are centred** in the space the content will take.
- **Every console page has breadcrumbs.**
- **No "Project" field anywhere** (removed from invoices, periodic invoices and the Trade documents
  sidebar).

**Invoice-form rules** (invoice, credit and debit note, periodic and self-billed forms):

- Line row: free-text description (a catalogue pick is optional), a **Goods / Service** toggle,
  unit of measure on the row whose options follow the toggle (full UN/ECE lists plus "Other" =
  `ZZ`), **"Price excl."** or "Price incl." at three decimals, never negative, default 0.000, the
  VAT category picked per line (an invoice may mix standard, zero-rated and exempt lines; the header "Default tax category" sets new lines and moves only lines still on the old default; a zero-rated or exempt line shows its own reason row), **no product code**, no pop-ups for lines.
- **Classification** column for business and government customers only (hidden for consumers):
  HS code search on goods lines, service type search on service lines (section 5.2).
- Header: payment terms dropdown (Due on receipt, Net 15, Net 30, Net 60, End of month, Advance),
  branch pre-filled, payment method dropdown, VAT mode as an **Excl. VAT | Incl. VAT toggle**
  (never a dropdown), purchase order reference in the details grid, subject full width.
- A form the design draws as creatable from scratch must be creatable from scratch even if the
  API only knows "copy invoice X" (periodic invoices). Copying is an optional pre-fill.

### 3.3 The house standard for screens with no Figma frame

Console, ERP, subscription and admin work often has no design. Such a screen must look as if the
designer drew it: same shells, cards, spacing, controls and states as its designed neighbours.
Check the screen against this list before saying it is done, and again when reviewing a PR.

- **Start from the nearest designed screen** and copy its structure: a Settings page (Peppol and
  tax, Plan, Billing) for tenant settings and ERP, the "Super Admin -> Operations / Tenants" frames
  for the console. Never introduce a new layout, colour, font size or button shape.
- **Use the existing pieces only:** the shells (`SettingsShell`, `ConsoleShell` with
  `ConsoleBreadcrumbs`), the Settings idiom in `src/pages/ErpPage/overview/idiom.tsx`
  (`SectionCard`, `PRIMARY_BUTTON`, `SECONDARY_BUTTON`, `SMALL_BUTTON`, `Mono`), `Pill` for
  states, the form fields in `src/components/form`, and `src/components/ui` (`Modal`, `Select`,
  `Combobox`, `DateField`). No new primitives without the owner.
- **Spacing:** card bodies are padded like their heading (`p-5 pt-0` inside the idiom
  `SectionCard`, which pads only its title); content never touches a card edge. 20 px between
  fields and between blocks (`gap-5`), two field columns from `md`, one on a phone. Cards are
  separated by the shell's own gap; no extra empty bands.
- **States:** loading, empty, no access, not found and failure use the shared notices
  (`LoadingNotice`, `PermissionDeniedNotice`, `ApiReadFailure`) for the whole page. A warning
  about one card sits **inside** that card as an inline callout, never as a page notice nested in
  a card. Status is a `Pill` with words, not colour alone.
- **People read words, not codes.** No raw enum values, i18n keys, ISO durations (`PT5M` reads
  "Every 5 minutes"), HTTP codes or server prose in the UI. Map every server code to our own
  sentence in both languages; the server's English `detail` is never shown. A code the user must
  type (a pointer, a parameter, a bitmap) may appear in its field and in `Mono`.
- **Codes stay left to right in Arabic:** paths, pointers, URLs, IDs and parameters get
  `dir="ltr"` (`TextField` takes `dir`; `Mono` already sets it), so `/id` never reads `id/`.
- **Tables:** a table scrolls inside its card or becomes cards on a phone (the existing
  `RowsView` pattern); the page itself never scrolls sideways at 390 px.
- **Native time inputs count as native date inputs:** do not add new ones.
- **Console pages have breadcrumbs; every console and ERP action is gated** by the permission
  the server checks, hidden when absent (not shown disabled) unless the design says otherwise.
- **Same verification as a designed screen** (section 3.4): English, Arabic and 390 px
  screenshots against the mock API, plus the neighbouring designed screen side by side to check
  that headings, card padding and buttons match.

### 3.4 Verifying a screen

A passing type-check says nothing about layout. Real defects have only ever been caught by
looking at the rendered page.

1. `npm run build` (type-check and bundle). **Never** rely on a bare `npx tsc --noEmit`: the root
   `tsconfig.json` checks zero files. `npx tsc -p tsconfig.app.json --noEmit` is the fast check.
2. `npm run test` (Vitest). A few large suites (console operators, tenant detail, bill reminders)
   time out when the whole suite runs on a busy machine; if only those fail, re-run them alone
   before calling it a failure.
3. Build with the session guard on and serve it against the mock API:

   ```bash
   VITE_REQUIRE_SESSION=true npx vite build --outDir dist-check
   MOCK_API_PORT=8080 node tools/mock-api/server.mjs &
   FAWTIR_API_ORIGIN=http://localhost:8080 npx vite preview --outDir dist-check --port 4188 --strictPort &
   ```

4. Screenshot the Figma frame (`get_screenshot`, `maxDimension: 2400`) and the page, and compare
   them section by section:

   ```bash
   node tools/screenshot/shot.mjs .design/sub/x.png http://localhost:4188/invoices
   node tools/screenshot/shot.mjs .design/sub/x-ar.png http://localhost:4188/invoices --ar
   node tools/screenshot/shot.mjs .design/sub/x-390.png http://localhost:4188/invoices --width 390
   ```

   The script can also click (`--text "Create invoice"`), type and pick a file. It prints the page's
   `scrollWidth`; above the window width means the page scrolls sideways.

5. `npm run responsive:sweep -- --no-build` renders every route at six widths and must report
   **0** routes bleeding sideways. After a deliberate desktop change, regenerate the baseline with
   `npm run responsive:baseline -- --no-build` and commit `tools/responsive/baseline-1440.json`;
   `npm run responsive:check` flags any unexplained desktop change.
6. Clean up: stop the servers, delete `dist-*` folders. `.design/` is git-ignored scratch space.

**Formatting:** there is no Prettier config. Always pass the flags, and only on files you changed:
`npx prettier --no-semi --single-quote --print-width 100 --end-of-line auto --write <files>`. Code
merged from `main` is not formatted to these flags; do not reformat it.

---

## 4. Keeping the integration working

The backend (Zain) wired most screens to the real API, and in doing so reshaped several of them.
The owner then ruled (25 Sep 2026) that **the design wins**. The balance:

- **Never delete an API call, request shape, idempotency key, permission check or refusal
  handler** to make a screen look right. Feed the designed element from what the API returns.
- **Never drop a designed element because the API lacks the data.** Draw it with a derived value
  or a clearly marked placeholder, put a `// TODO(backend): ...` comment on it naming the row, and
  add that row to the area's guide in `docs/backend-guides/` (append only; row numbers are stable
  because comments cite them). Never start a new "asks" document.
- **Tests:** keep every assertion about which request is sent, with what body and headers. When
  the design changes layout or copy, update only those assertions, and say which request
  assertions no longer apply and why.
- **Reference data:** tax categories, units, payment terms and methods come from
  `GET /v1/reference-data`, which the app shell only fetches inside the session guard. A
  production build always runs inside the guard; `VITE_REQUIRE_SESSION=false` is honoured only by
  a development build (`src/lib/session/session.ts`). The list still arrives after first paint,
  so every consumer must fall back to the design's own lists:
  `useReferenceData() ?? DESIGN_REFERENCE` (`src/lib/invoiceDraft.ts`).
- **Mock API:** every integrated area has fixtures in `tools/mock-api/routes/<area>.mjs` in the
  DTO shapes. Modules load alphabetically and the first match wins, so `agreements.mjs` and
  `invoices.mjs` shadow some shared paths (`/me/entitlements`, `/authored-invoices*`); for a
  focused check, run a copy of `server.mjs` that loads only the modules you need.
- **Merging `main` into `dev`** after backend work: resolve the two locale files with a three-way
  JSON merge (ours wins only where both sides changed the same key), then re-check every affected
  screen by screenshot. Past merges broke the invoice form's tax categories, a debit note's due
  date and the self-bill detail page, and none of it showed in the type-check.
- **Secrets:** never commit `.env.*.local`, tokens, passwords or keys. `.env.local` may point at
  the live API (`https://api.fawtir.om`, which answers 401 without a session); for checks, point
  `FAWTIR_API_ORIGIN` at the mock.

### The backend guides

`docs/backend-guides/` holds one guide per area, the single place the backend team reads what the
screens still need: `INCOME.md` (Income and Customers, plus part C, the PINT-OM line
classification spec, and part S, the sign-up answers), `EXPENDITURE.md` (Expenditure and
Suppliers), `REPORTS.md`, `ACTIVITY.md`, `DOCUMENTS.md`, and a `README.md` index. Sign-in,
onboarding and console integration handoffs are older, separate files in `docs/frontend/`; ERP and
the console plan are in `docs/erp-and-console-plan.md`.

### The mobile changes doc (owner, 7 Oct 2026)

Every web change that touches what the mobile app shows or sends is added to the mobile changes doc
the same day: https://claude.ai/code/artifact/fc142745-a943-450b-8568-f6b6cc1879d4 ("Fawtir mobile:
what changed…"). It covers only the mobile scope (section 6, the 9 Oct list: onboarding with
subscription, company settings, notifications, customers and suppliers, Income, Expenditure bills,
reports and the dashboard). It lists only what changed, never the whole app: Atiq's integration
already exists.
The six guides already sent to him (29 Sep to 3 Oct) are kept in `docs/mobile/` for reference only
(index in its `README.md`). **Always guide mobile from the current code and setup** (the web app on
`main`, its API calls, i18n files and the backend guides), never from those PDFs; read the matching
PDF only to see what he was told, so the doc can say what differs.

- Each change goes in its area's section: what changed, the fields with English and Arabic labels
  and limits, the API call and fields, refusal codes and their text, and whether the server takes it
  yet. Update the summary table and the checklist with it.
- A change that waits on the backend says so ("not sent until …"), as sign-up lines 2 and 3 do.
- The owner shares the doc with the mobile developer only once the backend APIs behind the web
  changes are live. Until then it is kept current, not sent.

---

## 5. Oman compliance and PINT-OM decisions

### 5.0 Where the rules are (read these before any Peppol or tax decision)

The published PINT-OM specification is the authority. When a question is "is this allowed?",
"which code?" or "is this field required?", answer it from these pages, cite the rule ID, and
record the decision below or in the area's backend guide.

| What | Link |
|---|---|
| Main page (PINT-OM overview, all specifications) | https://docs.peppol.eu/poac/om/ |
| Billing (invoices, credit and debit notes) | https://docs.peppol.eu/poac/om/pint-om/ |
| Self-billing | https://docs.peppol.eu/poac/om/pint-om-sb/ |
| All Oman rules on one page (invoice) | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-jurisdiction-aligned-rules/ |
| All Oman rules on one page (credit note) | https://docs.peppol.eu/poac/om/pint-om/trn-creditnote/rule/PINT-jurisdiction-aligned-rules/ |
| Shared PINT rules (apply everywhere) | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-UBL-validation-preprocessed/ |
| Code lists (VAT categories, VATZR / VATEX reasons, HS, service types, units) | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/codelist/ |
| Specification bundle (download) | https://docs.peppol.eu/poac/om/pint-om/resources.zip |

Checked on 2026-09-28 against PDK 1.4.4. Findings from that check are in
`docs/backend-guides/INCOME.md`, "Update 2026-09-28 (checked against the published PINT-OM rules)".

### 5.1 Documents and money

- Currency OMR with **three decimals**; VAT standard rate **5 %**. Oman has **four VAT
  categories only** (code list OMTaxCat, CL-04-OM): **S5** (standard 5 %), **Z0** (zero-rated,
  with a VATZR-OM code), **E0** (exempt, with a VATEX-OM code), **O0** (outside scope). Reverse
  charge (AE) and export (G) are **not** PINT-OM categories: an export is Z0 with VATZR-OM-09 to
  -12, and reverse charge is a transaction type (BTOM-001). Every composer offers only these four
  (`omanTaxCategories`). Outside-scope lines may sit beside taxed lines (no BR-O-11 in PINT-OM).
- Document type codes: **380** invoice, **381** credit note, **383** debit note.
- Credit and debit note reasons map to the Oman list **CL-02-OM**: QTY (quantity), VAL (value or
  price), CAN (cancellation), VAT, OTH (other). The forms offer the design's plain reasons
  ("Returned goods", "Undercharged", ...) and send the matching code.
- Payment methods use **UNCL4461** codes (for example 30 bank transfer, 10 cash, 48 card).
  Units use **UN/ECE Rec. 20** codes, with `ZZ` for "Other".
- A customer on Peppol is addressed by the participant id **`0248:` followed by the VAT number**.
- **Full tax invoices** go to business (B2B) and government (B2G) customers over Peppol;
  **simplified invoices** go to consumers (B2C) with a QR code.
- Records are kept **ten years** under the Oman VAT Law, **fifteen** for property, and cannot be
  edited or deleted while retention runs.
- **Self-billing:** a buyer may issue invoices on a supplier's behalf only under a signed, active
  agreement; the supplier then confirms or disputes.

### 5.2 Line classification (details in `docs/backend-guides/INCOME.md`, part C)

- Every line on a full invoice carries a **goods or service** flag (IBR-078-OM).
- Goods lines carry an **HS code**, the 12-digit Oman code (IBR-079-OM), searched by product
  name. **"Other" is `000000000000`** and is always offered, so a user who cannot classify a
  product can still issue.
- Service lines may carry a **service type** from **CL-12-OM**; it is **required only on an
  export of services** (IBR-155-OM, with VATZR-OM-09). Otherwise the backend sends `00000000`
  ("not applicable").
- The issuer's **industrial classification (ISIC Rev. 4, Oman 6-digit)** is a company setting,
  never asked on a line; the backend copies it onto every line at submission (IBR-081-OM). It is
  set in Settings, Company profile, and asked once at sign-up (Business identity step).
- **Simplified (B2C) invoices need none of these;** the Classification column is hidden for
  consumers.
- The app ships placeholder code lists (`src/lib/codeLists/`); the full lists come from the
  PINT-OM code-list folder or the `com.helger.peppol:peppol-om` Maven package, served by backend
  search endpoints (asked in the guide).

### 5.3 Reporting to the OTA (the TDD & OTA screen)

- Each invoice sent is reported to the OTA as a **Tax Data Document (TDD)**. The acknowledgement
  comes back as MLS messages.
- An acknowledgement confirms **delivery**, not a tax ruling. The integration therefore avoided
  words like "Accepted by the OTA"; the owner restored the Figma wording. **Open decision:** keep
  the Figma wording or switch to the cautious version (listed as ACTIVITY.md row 2.22 and
  REPORTS.md row 1.21).
- **Silence is never a failure:** no answer yet reads "Still waiting" in amber, never red.
- **Never resend on silence** (SPOG §6.2): a resend is offered only where the server provides a
  resend link, and only to users who may submit.

---

## 6. Product decisions

- **Plans:** Starter, Business, Business Plus, Enterprise, differing by features and limits, both
  configurable in the console (`src/lib/plans.ts`). Prices 35 / 80 / 150 OMR a month for 200 /
  1,000 / 3,000 documents; overage 0.150 / 0.060 / 0.040 per extra invoice; an extra branch is
  8 OMR on every plan; annual billing gives free months. Enterprise is Business Plus with
  negotiated limits. A **14-day trial** of the chosen plan (not on Enterprise). **Compliance
  features are never gated.** Plan gating is built but switched off (`PLAN_GATING_ENABLED =
false` in `src/lib/planAccess.ts`); when on, locked modules are greyed with an upgrade nudge,
  never hidden.
- **ERP extraction** is a separate add-on with per-plan availability (not offered, priced,
  included), offered at payment and managed in Settings, Plan. White label was removed.
- **Payments for subscriptions:** Paymob hosted checkout (owner, 7 Oct 2026: Paymob, not Thawani), owned by the backend; the app never
  takes card details (never Stripe). Operators record offline payments and activate tenants in
  the console. Operators land on `/console` after sign-in.
- **Sign-up:** "Tell us about your business" asks **"Will you use Fawtir POS?"** (unticked by
  default). Ticked: Business type and Sub business type are asked. Unticked: those screens are
  skipped, and the page quietly saves a placeholder category and type (Food & Beverage,
  Restaurant) because the backend still requires them. The POS answer and the ISIC code are UI
  only until the backend adds the fields (INCOME.md part S).
- **Back on the first onboarding step** goes to the email code screen, which shows "Your email is
  verified" once the code is spent.
- **Customers** have no detail screen (none in Figma); the row menu offers New invoice and Edit.
- **Public site** (Figma "SaaS Website", 186:12607): Home `/`, Pricing `/pricing`, Features
  `/features`, Contact Us `/contact`, sharing one nav, closing band and footer
  (`src/pages/HomePage/site.tsx`, pages in `src/pages/SitePages/`). The nav's Pricing link goes to
  `/pricing`, never to the sign-up plan picker `/plans`. Gaps are in `docs/backend-guides/SITE.md`.
- **Site pricing reads the app's catalogue** (owner, 29 Sep 2026): prices, limits, card features,
  the comparison rows and the questions come from `src/lib/plans.ts` and the sign-up plans screen
  (`PlanComparison.tsx` exports `GROUPS`, `COLUMNS`, `faqParams`). The Figma frame's own figures
  (49 / 89 / 149) are not used. "What counts" is documents sent and received, as the app meters.
- **Mobile app scope** (owner, 29 Sep 2026; widened 9 Oct 2026): onboarding (sign-in and
  subscription included), company settings with branches and Peppol settings, notifications,
  customers and suppliers, Income (invoices, bulk invoice upload, credit notes, debit notes,
  reminders), Expenditure (bills and bill reminders; bill upload and scan from a photo to be
  confirmed with Atiq), reports and the dashboard. POS and the catalogue come to mobile later
  (future work). **No self-billing and no customer import from a file on mobile.** Handoff is in phases, each change doc sent only
  after Abrar's end-to-end test of that phase passes: (1) onboarding to an invoice sent over
  Peppol: sign-up, sign-in, subscription, company settings, branches, Peppol settings, customers,
  invoice creation, bulk invoice upload, sending; (2) credit notes, debit notes and reminders,
  closing Income; (3) bills, bill upload and bill reminders, closing Expenditure (the core work
  ends here); (4) dashboard, reports and notifications. The
  mobile developer's guide for onboarding to invoice creation is a shared doc:
  https://claude.ai/code/artifact/0880cec3-51a4-4cc7-93b6-d55890f97365 (data, rules and APIs only;
  the mobile UI and layout are his call).
- **TDD & OTA, Documents, Reports and Trade documents review** (owner, 30 Sep 2026): all 26
  findings approved and applied within the rules above (no designed element dropped, no API call
  deleted; missing data reads "not confirmed" with a `TODO(backend)` row). Decisions taken with
  it: the menu and page are named **TDD & OTA**, as in Figma (the code's route and file names stay
  `activity`); the "24-hour rule" copy is removed, since no published OTA or PINT-OM rule states
  it, and only the deadline the server returns is shown; the ten-year "Kept until" dates stay
  counted from the document date until the start of the retention period is checked against the
  Oman VAT law (open question 6). Trade documents have their own guide,
  `docs/backend-guides/TRADE_DOCUMENTS.md`.
- **Owner decisions, 1 Oct 2026** (Zain's open questions):
  1. An action the user may not take is **hidden**, not shown disabled, as on the invoice page
     (e.g. Record payment on a self-bill for a Viewer).
  2. Weekly recurring bills in Expenditure get the same 7-day period fix as weekly periodic
     invoices, for **future** bills only; bills already raised keep their dates.
  3. The one-reminder-per-invoice-per-day limit counts **both** manual and automatic reminders.
  4. On a sales invoice the ISIC code is always the company's (5.2). An ERP or API import that
     sends a different line code has it replaced by the company's code, and the import report
     says so; the import is not refused.
- **Owner decision, 6 Oct 2026: self-billing sits under Expenditure.** A self-billed invoice
  (389; its credit note 261) is a purchase: the company is the buyer, writes it on the supplier's
  behalf under an agreement, and owes the money. Figma's placement under Income was a design slip
  (rule 2: fix the designer's slips).
  - The menu entry moved from Income to Expenditure, after Bills, and the section lights as
    Expenditure.
  - The pages moved from `/income/self-billing/...` to `/expenditure/self-billing/...` (list,
    agreements, new, edit, detail, credit notes). The old addresses redirect with the rest of the
    path and the query kept, so bookmarks and links in e-mails still work. Breadcrumbs start at
    Expenditure.
  - Nothing of self-billing stays in Income: the Income › Invoices list, its tab counts and cards
    ask for sales types only (`type=INVOICE,CREDIT_NOTE,DEBIT_NOTE`) and its Type filter no
    longer offers the two self-billed types; an `/invoices/{id}` or `/invoices/{id}/edit` link to
    a self-billed document opens it under Expenditure › Self-billing; Income › Credit notes never
    listed 261. A self-billed credit note is created in Self-billing and its credit is managed in
    Expenditure › Credit notes (source "Self-billed").
  - Unchanged: the screens and their layout, every API call, the permissions
    (`selfbilling.create`, `selfbilling.agreement.manage`), the plan gate (`selfBilling`) and the
    self-billed bill in Expenditure › Bills. No backend change is needed for the move.
  - Still not on mobile. Backend asks: `EXPENDITURE.md`, section S.
- **Owner decisions, 6 Oct 2026, on #141 and #143:**
  - Settings › Company, "Where you are": address lines 2 and 3, PO box, governorate, subdivision
    code (CL-13-OM, BTOM-024) and contact person are **required parts of the company record**, not
    extras, though the design does not draw them. Lines 2 and 3 and the phone are what every
    invoice must state for the seller (IBR-010-OM, IBR-011-OM). A VERIFIED company changes them
    through `POST /company-profile/amendments`; its legal and tax identity stays locked.
  - The invoice form's Buyer reference (IBT-010) shows on **government** invoices only: no PINT-OM
    rule requires it, and it is pre-filled from a government customer's default.
  - The invoice page keeps the designed Send when the dispatch cannot be read; the server answers
    the press.
- **Owner decision, 7 Oct 2026, sign-up address:** the sign-up "Address & contact" step asks for
  address lines 1, 2 and 3 and the postal code, all required, so a new company can issue its
  first invoice without visiting Settings › Company (IBR-010-OM). The frame draws one line; the
  two extra lines follow it. Lines 2 and 3 are not sent until the endpoint takes them
  (`SETTINGS.md` row 1.5; Abrar has the backend part). Existing companies are told at issue
  (`SELLER_ADDRESS_INCOMPLETE`, pointing to Settings › Company).
- **Owner decision, 8 Oct 2026, sign-up order and going live:** after Address & contact come
  **Choose a plan** (`/plans`) and **How you'll pay** (`/payment`), then Review. Nothing is
  charged before approval: the trial starts when the Fawtir team approves the registration, and
  the first bill goes out by the chosen method (Paymob link, bank transfer or cash) when it ends,
  or on approval for a plan the super admin gives no trial. Enterprise ("Talk to our team") skips
  payment and is reviewed as "agreed on a call". Review shows a "Plan and payment" section and
  will not submit without a plan (and a method, except for Enterprise). Plans, prices, the trial
  and payment settings are the super admin's; sign-up shows the launch defaults until it can read
  them, and no screen says where its figures come from. One **"Getting you live"** screen in the
  Fawtara status frame's layout replaces "We've received your registration": Registration sent,
  Fawtir review, Send Fawtir a connection request on the Fawtara Portal, Fawtir accepts your
  request, Fawtir registers you on the Oman SMP, Connected, in time order (the frame drew them
  upward). The connection follows the OTA's "Service Provider and Taxpayer Association Management
  User Manual": the taxpayer requests, Fawtir accepts or rejects with a reason, a request can
  expire or be withdrawn, and after acceptance Fawtir must add the participant on the Oman SMP
  within 3 business days; the OTA approves nothing at this stage. It is shown again after
  sign-in until the account is connected. Backend asks: `docs/backend-guides/ONBOARDING.md`,
  rows 1.1 to 1.10.
- **Zain's DW/CW note PRs** (29 Sep 2026): approved except removing the credit note detail's
  "Refund due" figure, which stays (design wins; mark it `TODO(backend)`). Conditions: a retry
  after a timeout reuses its idempotency key; `0248:` is not added twice; a partial credit uses
  line amounts after the document discount; the V.6 same-category-reason guard lives in the shared
  composer; `/summary?type=` tiles only once the endpoint exists.

---

## 7. Open questions for the owner

1. OTA wording on TDD & OTA and Reports: Figma's "Accepted by the OTA" / "Rejected", or the
   cautious wording that an acknowledgement is delivery, not a ruling.
2. A "Full invoice" credit note on an invoice that already has credits credits the whole invoice,
   not the amount still open. Should it be capped?
3. Should the onboarding items (POS question, ISIC at sign-up, the Company profile ISIC field)
   get their own backend guide instead of living in INCOME.md?
4. Contact Us page: is the design's phone "+2444 0100" real, and should the address be
   hello@fawtir.om or support@fawtir.om? The Features mockup images still show "OMR" and a
   "0208:" participant ID (Oman is 0248); the designer should correct them.
5. Parked until integration asks for it: the ~500 tap targets of 24 to 34 px (judged fine on a
   real device), POS product photos hot-linked from Wikimedia Commons, `/purchase-orders` having
   a create form but no list.
6. Retention: do the ten years (fifteen for property) run from the document date or from the end
   of the tax year? To be checked against the Oman VAT law; if the latter, every "Kept until"
   date on Documents is early.
7. Self-billing keeps its seller in a **customer** record (the backend built it on the sales
   invoice engine), so a supplier must also be created as a customer to be self-billed, and the
   same company is kept twice. Should agreements and self-billed invoices be linked to the
   supplier record instead? (Asked of the backend in `EXPENDITURE.md` S.2, detailed in S.5 to S.7
   with the order of work and checks; the screens keep the current behaviour until then.)

---

## 8. Commands

```bash
npm run dev                                   # Vite dev server on :5173
npm run build                                 # type-check + production build (the real gate)
npm run test                                  # Vitest
npx tsc -p tsconfig.app.json --noEmit         # fast type-check (never bare tsc)
npx prettier --no-semi --single-quote --print-width 100 --end-of-line auto --write <files>
node tools/i18n/merge.cjs keys.json           # add EN + AR translation keys
node tools/mock-api/server.mjs                # mock API on :8080 (MOCK_API_PORT to change)
node tools/screenshot/shot.mjs out.png <url> [--ar] [--width 390] [--text "Button"]
npm run responsive:sweep -- --no-build        # every route at six widths
npm run responsive:baseline -- --no-build     # after a deliberate desktop change
npm run responsive:check                      # flags unexplained desktop changes
```

On Windows the Bash tool is Git Bash: use forward slashes, and pass Windows paths to Node rather
than `/tmp` paths.
