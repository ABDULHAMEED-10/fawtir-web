# Public site: backend guide

**For:** the backend team. The public marketing pages (Home `/`, Pricing `/pricing`, Features
`/features`, Contact Us `/contact`) are static today. This lists what they draw that no endpoint
serves yet.

- **Rows.** Each row reads: number, what the page shows, what the backend must add. Row numbers
  are stable ids cited by `// TODO(backend)` comments, never renumbered; new rows go at the end.
- **Finding it in the code.** Search for `TODO(backend)` in `src/pages/HomePage/site.tsx` and
  `src/pages/SitePages/`.

**Pages in this guide:** Home, Pricing, Features, Contact Us.

---

## 1. Forms and links

| # | The design shows | Ask |
|---|---|---|
| 1.1 | Contact Us "Write a message" form: name, email, phone, message, "Send message" | No endpoint takes a public enquiry. Add an unauthenticated `POST /v1/public/contact` (name, email, phone optional, message; rate-limited, with a captcha or similar) that files it to the support inbox. Until then the form opens the visitor's email app with the message filled in, addressed to the support email (support@fawtir.om until the setting names one) |
| 1.2 | Footer "Newsletter" sign-up (name, email) | No mailing list endpoint. Until one exists the form opens a prepared email to support |
| 1.3 | "For partners" in the nav and footer | No partner programme page or sign-up. The link asks by email meanwhile |
| 1.4 | "Privacy policy" and "Terms of service" in the footer | No published pages; drawn as plain text until the documents exist |
| 1.5 | Social icons in the footer (Facebook, Instagram, LinkedIn, X) | Not a backend gap as such: Fawtir's accounts are not decided. Drawn, not linked, until they are |
| 1.6 | Terms of service (`/terms`), Privacy policy (`/privacy`) and Refund policy (`/refund-policy`), linked from the footer and the sign-up consent line (owner, 4 Nov 2026; replaces 1.4) | Published as static text in both languages, following the handbook's refund, cancellation and retention decisions. The operator named is `site.legal.provider` and the date `site.legal.date`. Nothing to build now; if legal wants to edit them without a release, serve them from the console (`GET /v1/public/legal/{terms,privacy,refund}`) |

## 2. Plans

| # | The design shows | Ask |
|---|---|---|
| 2.1 | Pricing: the plan cards, limits, comparison table and questions | Decided by the owner, 29 Sep 2026: the site shows the app's catalogue (`src/lib/plans.ts`: Starter, Business, Business Plus, Enterprise), the same one the sign-up plans screen reads, not the Figma frame's own figures. Serve the published catalogue publicly (`GET /v1/public/plans`, the console-edited `/platform/plans` without auth) so both read it instead of the file |

## 3. Contact details

| # | The design shows | Ask |
|---|---|---|
| 3.1 | Fawtir's email, phone and address on Contact Us; the site's demo, partner and newsletter mail links; the footer's Instagram and LinkedIn icons; the "contact support" links in sign-up and going live | Read from the console's company contact setting, `GET /v1/public/company-contact` (anonymous; edited at `/console/company-contact`). Until the server answers with a setting, or for a field it leaves empty, each place keeps the value it showed before (`src/lib/companyContact.ts`, `LEGACY_CONTACT`): one support email everywhere, support@fawtir.om, the Contact page included, with the frame's address on Contact Us (no phone line without a phone in the setting). Facebook and X have no field yet, so stay drawn, not linked (1.5) |
