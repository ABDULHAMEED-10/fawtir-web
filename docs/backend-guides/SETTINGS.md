# Settings: backend guide

**For:** the backend team. **Covers:** Settings › Company profile. **Last updated:** 7 October 2026.

This is the single guide for this area. It lists every place where a screen draws something the
API does not provide yet, and what to add.

## How to use this guide

- **The rule.** The product owner ruled that the Figma design is the source of truth. Each screen
  follows its frame; where the API does not carry what the frame draws, the screen draws it from
  the best value it has, or shows a marked placeholder, and the gap is a row below. The backend
  adapts to the screen; the front end then re-tests the integration by hand.
- **Nothing existing was removed.** Every call, request shape and permission check the integration
  added is still there, and the tests that assert them still pass.
- **Rows.** Each row reads: number, what the screen shows, what the backend must add. Row numbers
  are stable ids: the code comments cite them, so they are never renumbered, and new rows are
  appended at the end of their section.
- **Finding it in the code.** Every gap is a `// TODO(backend)` comment naming its row. Search for
  `TODO(backend)` in `src/pages/SettingsPage/CompanyProfilePage.tsx`.

**Screens in this guide:** Settings › Company profile.

---

## 1. Company profile (`GET/PUT /v1/company-profile`, `/branding`, `/branding/logo`, `/invoice-defaults`, `/industrial-classification`)

Business activity, branding (logo, brand colour), invoice defaults (language, currency, payment
terms, footer note) and the identity fields (registered name, Arabic name, trading name, commercial
registration, address, contact) are all wired as of 2026-09-28. **Decided by Zain, 2026-09-28**: the
identity fields are editable and saveable while `verificationStatus` is `PENDING_VERIFICATION` or
`REJECTED`, and read-only once `VERIFIED` — `PUT /company-profile` genuinely refuses any write once
verified ("Verified company profiles require an approved amendment workflow", which does not
exist), so the screen matches that rather than offering a Save that always fails for a live
customer. Whether a verified company should ever be able to amend its identity (and whether that
should re-trigger reverification) is a separate product/compliance question, not raised here since
today's behavior is not a bug — it matches the API exactly.

| # | The design shows | Ask |
|---|---|---|
| 1.1 | "On a receipt" (135:37013): "Use a plain black version" / "Leave it off receipts" | `CompanyBranding.receiptMonochrome` is a colour toggle on a logo the backend always draws; it cannot represent "leave it off receipts" (the second option). Either a third state (`omit`) on the same field, or a separate `showLogoOnReceipt` boolean alongside it. The screen keeps this control local-only (not saved) until then |
| 1.2 | "Website" input under "Where you are" | `/company-profile` (`CompanyProfileResult`/`UpdateCompanyProfileRequest`) has no website field at all. The screen keeps it local-only (not saved) until one exists |
| 1.3 | "VAT registered since" (a date) beside the locked VAT number | No such field on `/company-profile` or anywhere else in the company API. Local-only, pre-dates 2026-09-28's wiring |
| 1.4 | The company address ("Where you are": street, town, postal code) and the sign-up address step, where the postal code is optional | Suppliers send us invoices over Peppol with our company as the buyer. PINT-OM IBR-019-OM requires the buyer's address line, city and post code (IBT-050, IBT-052, IBT-053) on a full tax invoice, and IBT-055 country. Make `registeredPostalCode` required (3 digits) on `PUT /company-profile` and on the sign-up `address-contact` step once existing companies without one have been asked to add it; until then a supplier's invoice to a company with no postal code can fail validation. The screens keep the field optional today (owner, 2026-09-30) |
| 1.5 | Sign-up "Address & contact" (`/address-contact`) now asks for **Address line**, **Additional street or area** and **Building or address line 3**, all required (140 characters each), and the **postal code**, required (3 digits). Owner, 7 Oct 2026: new companies give the full seller address before their first invoice. Supersedes the "optional" note in row 1.4 for sign-up | Every invoice must state the seller's address lines 1, 2 and 3, city and postal code (PINT-OM IBR-010-OM, fatal), so a company that signed up with one line is refused at issue (`SELLER_ADDRESS_INCOMPLETE`) until it completes Settings › Company. (1) Add `addressLine2` and `addressLine3` (required, max 140) to `SignupAddressContactRequest` on `POST /v1/auth/signup/address-contact`, and make `postalCode` required (3 digits). (2) Store them on the registration and copy them to the company's `registeredAddressLine2` / `registeredAddressLine3` / `registeredPostalCode` when the registration is approved, as line 1 is today. (3) Show them to the console reviewer with the rest of the address. The screen already sends `postalCode` every time; lines 2 and 3 are kept on the review page but **not sent** until (1) ships, because the server refuses unknown members (`TODO(backend)` in `src/lib/identity/onboarding.ts`). Companies registered before this still complete the address in Settings › Company |
| 1.6 | Sign-up "Address & contact" now **sends** address lines 2 and 3 and an optional **PO Box** | Row 1.5's step (1) and (2) already existed: `SignupAddressContactRequest` has accepted `addressLine2`, `addressLine3` and `poBox` and promoted them to the company since V100/V107; the screen dropped lines 2 and 3 on a stale belief that it did not (7 Oct 2026, found when a TEST company's first invoice was refused `SELLER_ADDRESS_INCOMPLETE`). The server half of row 1.5 is on backend branch `feat/post-e2e-transport-onboarding` (not yet merged or deployed): `POST /v1/auth/signup/address-contact` requires lines 2 and 3 (max 255) and a 3-digit postal code, so an API client cannot skip them either. **Deploy this screen first**: the server already accepts the fields, while the server change refuses the request the old screen sends |

## 2. Activity log (`GET /v1/settings/activity-log`)

Settings › Activity log draws every element of its frame from the real log (7 Oct 2026, after PR
#148 replaced the sample log). What the log cannot answer yet says "Not available yet" or works on
the page the server answered, and says so.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 2.1 | "Export as PDF" beside the title. Pressing it says the export is not available yet | An export of the log for a period: `GET /v1/settings/activity-log/export?from=&to=&format=pdf` (and CSV), same permission (`admin.settings.manage`), the same filters as the list, streamed for a long period |
| 2.2 | The three counts above the list: "This month" (entries), "By a person", "By the API" with its note. Each reads "Not available yet" | Counts for a period, by actor kind: `GET /v1/settings/activity-log/summary?from=&to=` answering `{total, byActorType: {USER, API_KEY, SYSTEM, SUPPORT_USER}, topPeople: [{actorId, displayName, count}]}`. The frame's "By a person" note names the top people and their counts |
| 2.3 | "Kept for 10 years, can't be edited or cleared" | Confirm the log's retention is ten years (the Oman VAT Law period the handbook records) and that it is append-only for every role, support included. If the period differs, answer it on the summary (`retentionYears`) and the screen will show it |
| 2.4 | The five tabs: All, People did it, Fawtir did it, By the API, Money and access, with counts | An `actor_type` filter (one or more of `USER`, `API_KEY`, `SYSTEM`, `SUPPORT_USER`) and a `resource_type` filter that takes several values, so a tab can ask the server. Until then the tabs and their counts cover the page the server answered, and the toolbar says so |
| 2.5 | The search box ("Search an invoice number, a name, anything...") | A `q` parameter searching the event, the resource and its number or name. Until then the search looks through the words shown on the page answered |
| 2.6 | Sort: newest or oldest first | A `sort` parameter (`occurred_at` ascending or descending). Until then the page answered is reversed |
| 2.7 | Each entry: who did it (the frame shows the person's initials and name, "Hafidh Saif changed the price of Flat White"), and a link to what it concerns | (1) `actor_display_name` on each item (the people list is not readable here); (2) a readable label for the resource (an invoice number, a customer or item name) beside `resource_id`; (3) where an event changed a value, the before and after (the frame's price change), from `metadata` in a documented shape. Until then a person shows the person glyph, the event is named in words, and the resource by its kind and a short id |
