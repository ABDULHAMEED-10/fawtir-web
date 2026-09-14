# Onboarding (Verify Code → Address & Contact) — frontend integration handoff

## Purpose and scope

Connects the six screens after Signup to the backend self-service onboarding contract:

1. `/verify-code` (signup path)
2. `/about-business`
3. `/business-type`
4. `/sub-business-type`
5. `/business-identity`
6. `/address-contact`

Stops at Address & Contact. Final submission for review, `/plans`, `/payment` and later screens
are **not** integrated. The password-reset path through `/verify-code` keeps its prototype
behaviour (Recovery is a separate task).

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`) — no commits made |
| Backend | `D:\fawtir` @ `94cde817` — read only, no backend change |
| Prerequisite | `docs/frontend/SIGNUP_INTEGRATION_HANDOFF.md` (typed client, identity error layer, test tooling, dev proxy) |

Backend sources checked: `SignupController`, `SelfServiceSignupService` (verify, resend, every
`record*`, `toStatus`), `SelfServiceCompanyOnboardingService` (persistence, step prerequisites,
`submitForReview`), the `Signup*Request` / `Signup*Response` records, the `SignupBusinessSize`,
`SignupInvoicingMethod`, `SignupBusinessCategory`, `SignupBusinessType`, `SignupInvoiceAccent`
enums, `OmaniVatin`, `CompanyProfileService.requireAvailable`, `RegisteredAddress`,
`GlobalExceptionHandler`, `IdentityRateLimitProperties` and the gateway rate-limit groups.

## Backend contract

All `POST`, unauthenticated, JSON, CSRF-exempt, rate limited at 30/min per client for
`/api/v1/auth/signup/*` (gateway `preauth-signup-onboarding` and core `SIGNUP_ONBOARDING`).

| Step | Path | Body (besides `onboardingToken`) | Success | Notes |
|---|---|---|---|---|
| Verify email | `/signup/verify` | `tenantCode, email, code` (6 digits) | `200 {onboardingToken, onboardingTokenExpiresAt}` (2 h) | wrong / expired / 5+ attempts / unknown → one uniform `401`; single use — a verified registration can never verify again |
| Resend | `/signup/resend` | `tenantCode, email` | `202`, no body, always | silently does nothing inside the 60 s cooldown or once verified |
| Business profile | `/signup/business-profile` | `businessSize, invoicingMethod` | `204` | creates the draft row |
| Business category | `/signup/business-category` | `businessCategory` | `204` | needs profile; clears an incompatible type in the same statement |
| Business type | `/signup/business-type` | `businessType` | `204` | needs category; `409` when the category does not permit it |
| Business identity | `/signup/business-identity` | `legalCompanyName, commercialRegistrationNumber, taxNumber, logoObjectReference?, invoiceAccent` | `204` | needs profile; `409` when the VATIN or CR belongs to another tenant |
| Address & contact | `/signup/address-contact` | `addressLine, addressLine2?, addressLine3?, postalCode?, poBox?, city, governorate, contactPersonName, contactRole?, contactPhone, contactEmail` | `204` | needs identity; country fixed to `OM` by the server |
| Status | `/signup/status` | — | `200 {stage, …Complete, submitted, verificationStatus, loginEnabled}` | progress only — no saved values |

Every step is an overwrite of the draft and stays revisable until final submission
(`submitForReview`, not integrated), which refuses a draft missing any of the five steps.
Onboarding steps answer `401 authentication-failed` for a missing, unknown or expired token, and
`409 resource-conflict` both for "an earlier step is missing" and for a refused rule (taken
VATIN/CR) — the problem type does not distinguish them.

## Route and branching

### Prototype (current `main`)

`/about-business` branched on `shouldShowBusinessTypeScreen`: only *Just me* or *2–10 people*
combined with *Paper or manual* or *Spreadsheets* went to `/business-type`; the other 12 of 16
combinations went straight to `/business-identity`, skipping both business-type screens.

### Integrated

```
/verify-code ─▶ /about-business ─▶ /business-type ─▶ /sub-business-type ─▶ /business-identity ─▶ /address-contact ─▶ /signup-review ─▶ /signup-pending
```

Linear for every answer. The skip is removed because the backend refuses final submission of a
draft with no category or no type — every skipped registrant would have completed every visible
screen and still been unable to submit.

### Branch matrix

| Screen | Selection | Continue → | Backend written | Requests |
|---|---|---|---|---|
| Verify Code | complete, correct code | `/about-business` (replace) | email verified; onboarding token issued | 1 `verify` |
| Verify Code | incomplete code | stays, "Enter all 6 digits" | nothing | 0 |
| Verify Code | wrong / expired code | stays, localized message | failed attempt counted | 1 `verify` |
| Verify Code | Resend (after cooldown) | stays, cooldown restarts, boxes cleared | new code emailed | 1 `resend` |
| About Business | any of 4 sizes × any of 4 methods (16) | `/business-type` | `business_size`, `invoicing_method` | 1 `business-profile` |
| Business Type | Food & Beverage | `/sub-business-type` | `business_category = FOOD_AND_BEVERAGE` | 1 `business-category` |
| Business Type | any of the other 7 | stays, "open to Food & Beverage for now" | nothing | 0 |
| Sub Business Type | any of the 7 F&B trades | `/business-identity` | `business_type` | 1 `business-type` |
| Business Identity | valid | `/address-contact` | legal name, CR, VATIN, accent | 1 `business-identity` |
| Business Identity | VATIN/CR of another tenant | stays, "already registered" | nothing | 1 + 1 `status` |
| Address & Contact | valid | `/signup-review` (was `/plans` when this slice shipped) | address, governorate, contact | 1 `address-contact` |
| any step | earlier step missing (409) | the missing step | nothing | 1 + 1 `status` |
| any step | token expired (401) | stays, "session has ended… contact support", token expired in place (since the final-submission slice) | nothing | 1 |
| any onboarding URL typed without router state | the first unsaved step, or the page itself if allowed | — | nothing | 1 `status` |
| any onboarding URL without a session | `/signup` | — | nothing | 0 |

## Taxonomy mapping

| UI (screen ids) | Backend |
|---|---|
| `just-me`, `2-10`, `11-50`, `50-plus` | `JUST_ME`, `PEOPLE_2_TO_10`, `PEOPLE_11_TO_50`, `PEOPLE_50_PLUS` |
| `paper`, `spreadsheets`, `accounting`, `erp` | `PAPER_OR_MANUAL`, `SPREADSHEETS`, `ACCOUNTING_SOFTWARE`, `FULL_ERP_SYSTEM` |
| "Business Type" screen `food-beverage` | `SignupBusinessCategory.FOOD_AND_BEVERAGE` |
| "Business Type" screen: `automotive`, `retail`, `beauty-wellness`, `healthcare`, `hospitality`, `education`, `professional` | **none** — the enum has one member, deliberately (its Javadoc: inventing siblings would show unapproved options) |
| "Sub Business Type" `coffee-shop`, `restaurant`, `bakery`, `fast-food`, `juice-bar`, `dessert-shop`, `catering` | `SignupBusinessType.COFFEE_SHOP` … `CATERING` (exactly the F&B matrix) |
| accent swatches `#2C4EB7 … #0A1032` | `BLUE, GREEN, ORANGE, PURPLE, RED, NAVY` |
| governorate ids (`muscat` … `wusta`, shared with Settings) | the English name, e.g. `North Al Batinah` |

Naming trap: the frontend "Business Type" screen answers the backend *category*; "Sub Business
Type" answers the backend *type*. The mapping lives in one place,
`src/lib/identity/onboarding.ts`.

## Files changed (this slice)

| File | Change |
|---|---|
| `src/lib/identity/onboarding.ts` (new) | backend contract types, enum maps, `allowedRoute`, request builders + validators for identity and address, API calls, server-field maps |
| `src/lib/identity/onboardingSession.ts` (new) | the onboarding token in `sessionStorage` (see State) |
| `src/lib/identity/verification.ts` (new) | verify / resend calls, hand-off guard, failure mapping, countdown format |
| `src/lib/identity/errors.ts` | `mapServerFieldErrors` shared by Signup and the steps |
| `src/lib/identity/signup.ts` | uses the shared field mapper; exports `SIGNUP_FIELD_ORDER` |
| `src/lib/forms.ts` (new) | `firstInvalidField` / `focusFirstInvalid`, shared by all six forms |
| `src/lib/onboarding.ts` | UI ids, accent list, preview types, router-state model; prototype branching removed |
| `src/lib/governorates.ts` (new) | governorate ids + stored English names; `settingsCompany.ts` re-exports the list |
| `src/lib/validation.ts` | VATIN rule aligned with `OmaniVatin` (`OM11`/`OM12` + 8 digits) |
| `src/hooks/useOnboardingStep.ts` (new) | one guarded save per Continue; 401 / 409 / validation / shared failures |
| `src/components/auth/OnboardingGate.tsx` (new) | session guard + server step order on direct entry |
| `src/components/ui/OtpInput.tsx` | `invalid` prop; localized digit labels |
| `src/pages/VerifyCodePage/*` | `VerifyCodeView` (the design's markup, shared), `SignupVerifyCodeForm` (integrated), `ForgotPasswordVerifyForm` (prototype, unchanged behaviour), `VerifyCodePage` dispatches on the hand-off; `VerifyCodeForm.tsx` removed |
| `src/pages/AboutBusinessPage/*`, `BusinessTypePage/*`, `SubBusinessTypePage/*`, `BusinessIdentityPage/*`, `AddressContactPage/*` | integrated; gated; Back restores answers; sample data removed |
| `src/i18n/locales/en.json`, `ar.json` | new keys (verify, onboarding, category notice, identity, accents, validation); corrected Peppol and logo copy |
| tests (new) | `src/lib/identity/onboarding.test.ts`, `onboardingSession.test.ts`, `verification.test.ts`, `src/lib/forms.test.ts`, `src/pages/VerifyCodePage/SignupVerifyCodeForm.test.tsx`, `src/pages/onboarding.test.tsx` |

## State ownership

| What | Where | Why |
|---|---|---|
| `tenantCode`, email, code expiry, resend time | router state of `/verify-code` only | the verify/resend key; never shown, stored, or put in a URL |
| onboarding token + expiry | `sessionStorage` (`fawtir.signup.onboarding.v1`), per tab | the only credential after verification — the code is single use, login is disabled until review, and nothing re-issues a token, so losing it on reload would strand the account. Nothing else is stored there. |
| step answers (size, method, category, trade, identity preview incl. logo data URL) | router state | Back restores choices and the preview draws the header; not credentials; never read as truth |
| contact phone / email | component state only | personal data; saved to the server and not forwarded |
| progress | backend (`/signup/status`) | asked only when a page opens without its router state, or after a `409` |

A reload keeps router state (it lives in `history.state`) and the token, so it re-renders without
a request and without contradicting the server; a re-save simply overwrites the draft.

## Design-parity decisions

No CSS, token or layout change. Changes are content and behaviour:

- **Empty forms.** Business Identity and Address & Contact no longer pre-fill "Al Bahja Coffee
  Roasters LLC", CR `1234567`, VATIN `OM1100112233`, an address and a named person — pressing
  Continue unedited would have saved another business's identifiers and a stranger's contact.
  Governorate still defaults to Muscat because a native select always shows a value.
- **All eight categories stay on screen.** Only Food & Beverage can be saved; the other seven show
  a localized notice on Continue, with no request, using the form's existing error line.
- **Peppol Participant ID not derived.** The read-only field and the preview show "Assigned after
  verification"; the side note no longer claims SMP registration "within 3 working days". Signup
  assigns no participant, an `OM12` group VATIN may not be a participant at all (Fawtara SP#6),
  and the repository treats the Oman PID rule as pending authority. The backend's
  `OmaniVatin` cites OTA SA v1.0.1 §10.3.1 (example `0248:OM1100003554`) for individual VATINs —
  reported here as a possible conflict with the pending-PID rule rather than resolved by the UI.
- **Logo is preview-only.** No anonymous upload endpoint exists (only the authenticated customer
  and company-profile ones); `logoObjectReference` is omitted and the hint says so.
- **Form-level errors** use the existing `text-xs text-text-danger` line, rendered only on error.
- **Governorate labels** are localized from the shared `governorate.*` keys (previously English
  only); the value sent is the stable English name.
- **Verify Code** counts down from the server's `resendAvailableAt` and shows minutes left from
  `emailVerificationExpiresAt`, instead of a local 10-second timer.

## Validation ownership

| Field | Client | Server |
|---|---|---|
| code | 6 digits present | match, expiry, 5 attempts |
| legal name | required, ≤ 255 | `requireText(…, 255)` |
| CR | required, ≤ 20, **no grammar** | `requireCommercialRegistration` — grammar withdrawn (#116); the shared 7-digit `crNumber` rule is deliberately not used |
| VATIN | `^OM(11|12)\d{8}$` after trim/upper | `OmaniVatin.parse` + uniqueness |
| address line | required, ≤ 140 | `SELLER_STREET_ADDRESS_MAX` (record allows 255) |
| postal code | optional, 3 digits (pre-existing shared rule) | optional ≤ 20 |
| city / contact name / role | required ≤ 100 / required ≤ 200 / optional ≤ 100 | same |
| phone | 8 digits, Oman prefix (pre-existing shared rule); sent `+968…` | `normaliseOmanPhone` |
| email | shape, ≤ 255 | `@Email`, ≤ 255 |

## Error behaviour

Reuses the Signup client and error layer. Verify: `401` → "incorrect or no longer valid", or
"expired" once the server-given expiry has passed; everything else → shared messages. Steps:
`401` → session expired (token cleared); `409` → `/signup/status` decides between "go to the
missing step" and the step's own message (identity: "VATIN or CR already registered");
`400 validation-failed` with fields → localized field messages; anything else → shared
network / timeout / 429 / 5xx / unexpected messages. No backend English reaches the UI.

## Security and privacy

- `tenantCode`: router state on one screen; never displayed, stored or in a URL.
- Onboarding token: `sessionStorage` only, per tab, expiry-checked on read, cleared on `401`;
  sent in request bodies only (`/status` is a POST for that reason).
- The six-digit code is never stored; Mailpit was read by the verification script without
  printing codes.
- Contact phone/email are not forwarded past Address & Contact; no `console.*` added.
- Every mutating action is guarded against double click, repeated Enter and overlap; leaving a
  screen aborts its request so a late answer cannot navigate.
- Route entry is gated, but only as convenience — the backend enforces step order itself.
- No RBAC: all endpoints are pre-authentication and in the public list; the token is the only
  authority.

## Environment

As in the Signup handoff (Mailpit override for the local stack, `.env.local` proxy target). The
backend needs `FAWTIR_IDENTITY_SIGNUP_TERMS_VERSION` / `…_PRIVACY_VERSION` set, notification
delivery pointed at Mailpit, and no migration for this change.

## Verification

| Check | Result |
|---|---|
| Tests (`npm test`) | **171 passed, 11 files** — 77 new for this slice (`onboarding.test.tsx` 47, `SignupVerifyCodeForm.test.tsx` 16, `onboarding.test.ts` 14, `onboardingSession.test.ts` 4, `verification.test.ts` 4, `forms.test.ts` 3) plus the Signup suites re-run |
| Typecheck (`tsc -b`) | pass |
| Lint | changed files clean; 1 pre-existing error in untouched `src/components/ui/Rial.tsx` |
| Build | pass (chunk-size warning pre-existing) |

### Real browser, local backend

Headless Chromium against the local gateway (`:18080` via the `:5174` dev proxy), mail captured by
Mailpit, `@example.test` addresses, persisted values read back from the local
`tenant.company_onboarding_drafts`. Two fresh accounts: English at 1440 px and Arabic at 390 px.

| Scenario | Result |
|---|---|
| Prototype branching on `main` (all 16 combinations) | 4 reach `/business-type` (Just me / 2–10 × Paper / Spreadsheets); 12 skip to `/business-identity` |
| Integrated branching (all 16 combinations) | every one → `/business-type`, exactly one `business-profile → 204` each, DB holds the chosen enum pair after each |
| Verify Code copy | "We sent a 6-digit code to <email>. It expires in 10 minutes."; router state keys `from, tenantCode, email, emailVerificationExpiresAt, resendAvailableAt`; tenantCode not on screen, in the URL or in storage |
| Incomplete code | "Enter all 6 digits", no request |
| Wrong code (ar 390) | `verify → 401`, Arabic "incorrect or no longer valid", all six boxes `aria-invalid` |
| Resend | disabled with "Resend code in 1:00", enabled after exactly 60 s, double click → one `resend → 202`, cooldown restarts (0:59), a second code arrives in Mailpit |
| Verify with the emailed code | `verify → 200` → `/about-business`; `sessionStorage` holds one key with exactly `onboardingToken, onboardingTokenExpiresAt`; `localStorage` only `language` |
| Double submit (About Business, request held 1.5 s) | double click + two Enter → one `business-profile`; button disabled meanwhile |
| Business Type — the 7 unregistrable categories | each: selected, localized notice, **0 requests** |
| Business Type — network failure | "We couldn't reach Fawtir…" |
| Business Type — Food & Beverage | `business-category → 204`, DB `FOOD_AND_BEVERAGE` |
| Sub Business Type — all 7 trades | each one `business-type → 204`, DB value matches (`COFFEE_SHOP` … `BAKERY`) |
| Business Identity | starts empty; Participant ID field "Assigned after verification", no `0248:` anywhere; empty submit → 3 errors, focus on Company name, 0 requests; `OM1300000001` → VATIN message, 0 requests; an existing tenant's VATIN → `409` + `status → 200` → "already registered"; valid → `204`, DB name/CR/VATIN upper-cased, accent `PURPLE`, `logo_object_reference` null |
| Address & Contact | starts empty (governorate Muscat); preview carries the identity; empty submit → 5 errors, focus on Address line, 0 requests; valid → `204` → `/plans`; payload `addressLine, city, governorate, contactPersonName, contactPhone, contactEmail` (blank optionals omitted); DB `North Al Batinah`, country `OM`, `+96891234567`; contact not forwarded in router state; all five steps recorded |
| Back chain from `/plans` | address (preview kept) → identity (values restored) → trade (Bakery) → category (F&B) → about (11–50 + ERP) → Back on the first step returns to it; 0 requests |
| Reload on a step | same page, 0 requests |
| Typed URL without state | one `status → 200`, page opens when allowed |
| New tab | `/signup` (the token is per tab) |
| Arabic 390 end to end | `direction: rtl`; Arabic verification email; each step one request; Retail → Arabic notice, 0 requests; identity errors Arabic; governorate options Arabic, stored `Dhofar`; DB `PEOPLE_50_PLUS, FULL_ERP_SYSTEM, FOOD_AND_BEVERAGE, CATERING, BLUE, Dhofar, +96871234567`; no English in errors |
| Rate limiting | two real `429`s during the exhaustive run (30/min bucket), waited out via `Retry-After` |
| Structure vs `main` (classes of every element, after each screen has rendered, identical sample content) | **0 differences** on all six screens at ar 390 and on the five onboarding screens at en 1440; node counts identical |
| Console / page errors | none |

Request totals: English account 38 (1 signup, 1 resend, 1 verify, 20 profile — the
double-submit check, 16 combinations, 1 rate-limited retry, the final choice and the reload
check — 2 category of which one deliberately aborted, 7 type, 3 identity including one
rate-limited retry, 1 address, 2 status); Arabic account 8 (signup, verify ×2, one per step). No request on any initial render,
none on option selection, none for a locally invalid form.

### Visual blocker found (pre-existing, not changed)

- **VISUAL_BLOCKER**: at 390 px the six OTP boxes (`w-[58px]` + gaps = 388 px) overflow the 358 px
  row on `/verify-code`; the last box is clipped (measured identically on unchanged `main`, en and
  ar).
- **WHY_CHANGE_IS_REQUIRED**: the sixth digit is partly off-screen on common phones.
- **MINIMAL_CHANGE**: in `OtpInput`, let the boxes share the row (`min-w-0 flex-1` with a
  `max-w-[58px]`) instead of a fixed width. Not applied — it changes responsive CSS and needs design
  approval.

## Conflict-sensitive areas

`src/lib/validation.ts` (VATIN rule now also governs Add/New Customer and Edit Supplier),
`src/lib/settingsCompany.ts` (re-exports governorates), `src/i18n/locales/*`,
`src/pages/VerifyCodePage/*` (Recovery will build on `VerifyCodeView`),
`src/components/ui/OtpInput.tsx`, and `src/lib/onboarding.ts` (the preview types moved here).

## Known limitations

1. ~~Final submission is not integrated.~~ **Resolved** — Address & Contact now continues to
   `/signup-review` and submission is integrated; see `FINAL_SUBMISSION_HANDOFF.md`. That slice also
   changed a `401` to end the session in place and reworded `onboarding.sessionExpired` (the old
   "Sign up again" contradicted the backend guide §10c).
2. **Expired onboarding session is unrecoverable by self-service.** After 2 h the token dies,
   login stays disabled and verify refuses a verified registration. A backend decision is needed
   (e.g. re-issue by email).
3. **Resend returns no timing.** After a resend the client applies the backend constants (10 min
   code, 60 s cooldown); returning the new instants from `/signup/resend` would remove that copy.
4. **`409` is ambiguous on the wire.** A missing earlier step and a taken VATIN/CR share
   `resource-conflict`; the client disambiguates with `/signup/status`. Distinct problem types
   (or field attribution) would save that request.
5. **Back on the first onboarding step** leads to `/verify-code`, which forwards a verified
   registrant straight back — the code is spent, so there is nothing to go back to. A design
   decision (hide the button there) would need a layout change and is not made.
6. **Seven categories are shown but not registrable** until the backend enum grows.
7. **Governorate default** stays Muscat (native select).
8. **Participant ID authority** — see Design-parity decisions; needs Compliance to confirm.
9. **OTP row overflows at 390 px** — pre-existing; see the visual blocker above.
10. **The shared VATIN rule is stricter now for customers and suppliers too** — it matches the
    backend's `OmaniVatin` and `ck_customer_vatin_oman`, but those screens were not re-verified in
    this task. The shared 7-digit `crNumber` rule still applies there and is stricter than the
    signup backend; worth reviewing when those screens are integrated.

## Next recommended screen

Done — see `FINAL_SUBMISSION_HANDOFF.md`. Next after that: Login.

## Post-integration checklist

- [ ] Review and commit (nothing committed)
- [ ] Integrate final submission before exposing onboarding to real registrants
- [ ] Decide the Back behaviour on the first onboarding step
- [ ] Backend: re-issue path for an expired onboarding token; timing in the resend response;
      distinct problem types for step-order vs rule conflicts
- [ ] Compliance: confirm whether the Participant ID may be shown as `0248:<VATIN>` for `OM11`
