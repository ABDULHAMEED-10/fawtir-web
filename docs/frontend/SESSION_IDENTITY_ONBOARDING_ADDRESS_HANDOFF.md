# Session identity, onboarding address and transport sub-state: handoff

## Purpose and scope

Three defects found during the TEST real-browser E2E on 7 October 2026, and nothing else:

1. **Shell identity.** The deployed shell named a demo user ("Hafidh Saif / Owner / Your company")
   to whoever was signed in.
2. **Onboarding address.** The sign-up form collected address lines 2 and 3, then dropped them from
   the request, so every self-service company reached its first invoice already refused at issue
   with `SELLER_ADDRESS_INCOMPLETE` (PINT-OM IBR-010-OM).
3. **Transport sub-state.** An invoice whose dispatch read `SENDING` with zero transport attempts
   looked as if it had been transmitted.

Branch `fix/session-identity-onboarding-address`, based on `main` `14753d5`.
This PR must be merged by the frontend owner, not by its author.

## Root causes

### Shell identity

- `src/lib/session/session.ts` made the session guard default OFF in production builds. It only
  switched on when `VITE_REQUIRE_SESSION=true`, and the deployed build never set it.
- So `AppShell` rendered the unguarded `Frame`, no session was loaded, and `useSession()` was
  `null`.
- The sidebar then fell back to the `USER` fixture in `src/lib/dashboard.ts`.
- The backend still authenticated and authorised every request. The shell simply never asked who
  was there.
- `KpiSection` greeted every user as "Hafidh" whatever the session said.

### Onboarding address

- `buildAddressContactRequest` omitted `addressLine2` and `addressLine3`. A stale `TODO` claimed
  the request had no field for them.
- `SignupAddressContactRequest` has accepted both, and promoted them to the company, since V100.
  It has accepted `poBox` since V107.

### Transport sub-state

- The ledger's `SENDING` means "a transport row exists". It is set when the AS4 row is queued,
  before any attempt.

## Changes

### Session (`f0e77ec`)

- A production build always requires a session. `VITE_REQUIRE_SESSION=false` is honoured only by a
  development build (`npm run dev`, vitest, `NODE_ENV=development vite build`).
- The sidebar user card, the company card and the KPI greeting read the session:
  - user card: `username`, and the role from the session's roles
  - company card: `tenantName`
  - greeting: `username`. `/me/entitlements` has no display or first name.
- While the session loads, the cards show a neutral "Loading…". In an unguarded development build
  they say "Not signed in".
- The `USER` fixture is deleted, so importing it again fails the build.
- Logout, login and any 401 already call `forgetEntitlements()`. A test now proves that signing in
  as a different user shows the new identity.
- `tools/responsive/run.mjs` builds its unguarded preview with `NODE_ENV=development`.

### Onboarding (`2dc81b1`, `9b8aa63`)

- The request now sends `addressLine2`, `addressLine3` and an optional `poBox`. `poBox` is trimmed
  and omitted when blank.
- The form gains an optional **PO Box** field (at most 30 characters, English and Arabic labels).
  The review page shows it, and reload or router state restores it.
- What the form requires is unchanged:
  - **Required:** line 1, line 2, line 3, postal code (3 digits), city, governorate. This is the
    owner's decision of 7 October 2026 (SETTINGS.md row 1.5).
  - **Optional:** PO Box.
- The country subdivision code (BTOM-024, the CL-13-OM special-zone code) is **not** asked at sign-up.
  - It is not an address element. IBR-150/151-OM consult it only for a special-zone supply.
  - A non-mainland code is meaningless without the SZLN licence.
  - An absent code deliberately means "not a special-zone party" (V109).
  - It stays amendment-only.

### Transport sub-state (`284a8cf`)

- Reads the additive `transport: { buyer, taxAuthority }` on the dispatch response. Each leg is
  `{ messageId, state, attempts, lastAttemptAt, nextAttemptAt }`, and `state` is one of:
  - `QUEUED_NOT_ATTEMPTED`
  - `TRANSMITTING`
  - `RETRY_SCHEDULED`
  - `TRANSMITTED`
  - `FAILED`
- While the dispatch state is `DISPATCHED`, `QUEUED` or `SENDING`, the leading leg decides the
  headline. The leading leg is the buyer's, or the Tax Authority's for a B2C invoice.
- `QUEUED_NOT_ATTEMPTED` reads "Queued for transmission, not yet sent".
- `TRANSMITTED` reads "Transmitted, receipt received". It never says "delivered" or "accepted".
- The delivery bar shows the buyer leg and the Tax Authority leg separately. A scheduled retry
  shows its next attempt time.
- A backend without `transport` gives exactly the old behaviour.

## Backend dependency

Backend branch `feat/post-e2e-transport-onboarding` provides:

- the `transport` field
- required lines 2 and 3 and a 3-digit postal code at `POST /v1/auth/signup/address-contact`

**Deploy order: this frontend first.**

- The current backend already accepts lines 2, 3 and the PO Box, so this frontend works against it.
- The new backend refuses the request the old frontend sends, which has no lines 2 and 3.
- Transport display needs the new backend. Before it, the page shows the old wording.

No migration on the frontend side. The backend's V252 concerns a platform permission only.

## Vercel configuration

The code no longer depends on `VITE_REQUIRE_SESSION`. A production build is guarded whatever it
says.

Before deploying, the Vercel owner should remove the stale `VITE_REQUIRE_SESSION=false` from the
production environment, or set it to `true`. Then the value no longer misleads anyone, and a
rollback to an older build would also be guarded.

## Tests and checks (at `9b8aa63`)

- **Build** (`tsc -b && vite build`): passes.
- **Lint:** no new findings. The 29 errors and 3 warnings are all in files this branch does not
  touch.
- **Vitest full run:**
  - 2582 of 2610 passed. All 28 failures were 15 s timeouts under parallel load.
  - Rerun serially, those files gave 340 of 341. The remaining test (Business identity step,
    untouched here) passes on its own.
- **Browser:** not yet done. Real-browser acceptance (English, Arabic and 390 px; the guarded shell;
  sign-up with lines 2, 3 and PO Box; the transport wording) is planned after deployment to TEST,
  with the user signing in.

## Security review

- No token, password or identifier is stored outside memory. Entitlements stay in a React context.
- No new request, header or URL parameter.
- The shell now fails toward the guard. A missing or mistyped deployment variable can no longer
  turn the guard off.
- The transport legs carry message ids and states only. The backend withholds failure text from
  tenants.

## Conflict-sensitive areas

- `src/lib/session/session.ts`
- `src/layouts/AppShell/*`
- `src/lib/identity/onboarding.ts`
- `src/lib/invoiceDispatch.ts`
- `src/i18n/locales/{en,ar}.json`
