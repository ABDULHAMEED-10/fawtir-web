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
