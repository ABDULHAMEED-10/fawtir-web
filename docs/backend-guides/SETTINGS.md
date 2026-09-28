# Settings: backend guide

**For:** the backend team. **Covers:** Settings › Company profile. **Last updated:** 28 September 2026.

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

## 1. Company profile (`GET/PUT /v1/company-profile/branding`, `/branding/logo`, `/invoice-defaults`, `/industrial-classification`)

Business activity, branding (logo, brand colour) and invoice defaults (language, currency, payment
terms, footer note) are wired to these routes as of 2026-09-28. The identity fields (registered
name, Arabic name, trading name, commercial registration, address, contact) still edit a sample
company: `PUT /company-profile` throws once `companyVerificationStatus == VERIFIED`
("Verified company profiles require an approved amendment workflow", which does not exist), so
wiring a plain Save button for them would work in a demo and break for every real, live customer.
Wiring those needs a product/compliance decision first (raise the "should editing re-trigger
reverification" question), not a screen change — tracked in the workspace, not repeated here since
it names no screen gap the API is missing.

| # | The design shows | Ask |
|---|---|---|
| 1.1 | "On a receipt" (135:37013): "Use a plain black version" / "Leave it off receipts" | `CompanyBranding.receiptMonochrome` is a colour toggle on a logo the backend always draws; it cannot represent "leave it off receipts" (the second option). Either a third state (`omit`) on the same field, or a separate `showLogoOnReceipt` boolean alongside it. The screen keeps this control local-only (not saved) until then |
