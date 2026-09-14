# Platform — Company Verification (read-only) handoff

## Scope

The first Fawtir-console screen on real backend data:

- **Console access foundation**: who is using the console, whether they may, the real username.
- **Company Verification queue** (read-only) at the existing `/console/onboarding` route; the menu label is now **Verification**.
- **Company detail** (read-only) and **its verification history**.

Not in this slice: evidence upload, approve, reject, plans, operators, tenant list, operations, incidents, audit, SMP, PEPPOL_TEST, impersonation, deprovisioning. There are no decision controls anywhere.

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`); no commits made |
| Backend | `D:\fawtir` @ `94cde817`, read only, no change |
| Prerequisites | `LOGIN_INTEGRATION_HANDOFF.md`, `LOGOUT_INTEGRATION_HANDOFF.md`, `PLATFORM_ADMIN_DISCOVERY.md` |
| Prisma | not used in this frontend: `PRISMA_APPLICABLE = NO` |

### Precondition checked first: platform-user MFA

This was verified read-only before implementation, and the Login flow is correct for platform users:

- The allowed factors come from each tenant's identity policy, and nothing gives platform users a special rule. The `FAWTIR` platform tenant allows `BACKUP_CODE, EMAIL_OTP, TOTP`, the same as customer tenants.
- The local operator has no enrolled TOTP secret and no backup codes. For such an account the backend states that `EMAIL_OTP` is the only route to a first token (`PlatformOperatorEmailService`).
- The login response does not say which factor applies.
- Endpoints:
  - TOTP and recovery (`BACKUP_CODE`) codes verify at `POST /api/v1/auth/mfa/verify`
  - email codes are sent by `POST /api/v1/auth/mfa/otp/request` and verified by `POST /api/v1/auth/mfa/verify`
- `FRONTEND_LOGIN_CONTRACT_MISMATCH = NO`.

## Routes

| Route | Screen | Required permission (UX gate; the backend enforces) |
|---|---|---|
| `/console/onboarding?status={pending\|verified\|rejected\|all}&page={n}` | Verification queue. `status` defaults to `pending` and `page` to 1; both are in the URL, and neither is PII | `platform.tenants.manage` |
| `/console/onboarding/:companyId` | Company detail and history. `:companyId` is the tenant UUID the API already uses | `platform.tenants.manage` |
| every other `/console/*` route | unchanged screens (Operations and Tenants mock, "not built yet" pages), now behind the console access check | any `platform.*` permission |

## Files

| File | Role |
|---|---|
| `src/lib/identity/entitlements.ts` (new) | `GET /me/entitlements` types. The answer is cached in memory for the session: shared while in flight, a failure is forgotten, and an answer for a forgotten session is never adopted. Provides `hasPermission` and `isPlatformOperator` (holds any `platform.*` code) |
| `src/lib/identity/login.ts`, `logout.ts` | forget the cached entitlements when a session starts (verify, or password-only sign-in) and once sign-out is confirmed. The UI files for Login and Logout are unchanged |
| `src/api/inflight.ts` (new), `src/api/index.ts` | `sharedRequest`: identical concurrent reads join one request, so StrictMode's double effect never sends twice. Not a cache |
| `src/layouts/ConsoleShell/useConsoleAccess.ts` (new) | the console's access state: checking, ready, signed out or failed |
| `src/layouts/ConsoleShell/useConsoleRead.ts` (new) | one console GET by path: loading, ready or failed. A `401` forgets the entitlements and goes to Login |
| `src/layouts/ConsoleShell/ConsoleNotice.tsx` (new) | the console's state card (the "not built yet" card and pill) and `ConsoleReadFailure` (a `403` shows no access; anything else shows a message with retry) |
| `src/layouts/ConsoleShell/ConsoleShell.tsx` | access gate and an optional `requires` permission; passes the real username to the sidebar |
| `src/layouts/ConsoleShell/ConsoleSidebar.tsx` | takes `userName`; subtitle "Fawtir team" instead of the hard-coded "Super Admin" |
| `src/lib/consoleNav.ts` | the `onboarding` item becomes `verification` ("Verification"), the same route, no longer "soon"; `CONSOLE_USER` removed |
| `src/lib/console/companyVerification.ts` (new) | DTO types mirroring `PlatformCompanyReview`, the enums, queue tabs, path builders, `isSubmitted`, `isCompanyId`, and the router-state helper for returning to the queue |
| `src/lib/console/format.ts` (new) | dates in `'ar'` / `'en-GB'` (the app's convention) and country names via `Intl.DisplayNames` |
| `src/components/ui/Pager.tsx` (new), `index.ts` | the catalogue pager's markup and classes, with localized accessible labels |
| `src/pages/ConsolePage/VerificationPage.tsx` (new) | the queue |
| `src/pages/ConsolePage/VerificationCompanyPage.tsx` (new) | detail and history |
| `src/pages/ConsolePage/verification/VerificationStatusPill.tsx` (new) | status pill (the Operations pill markup; existing `pending` / `success` / `danger` / `primary` tones) |
| `src/App.tsx`, `src/pages/ConsolePage/index.ts` | the two routes |
| `src/i18n/locales/en.json`, `ar.json` | `console.nav.verification`, `console.user.team`, `console.access.*`, `console.verification.*`; removed `console.nav.onboarding` and `console.user.role` |
| tests | `src/lib/identity/entitlements.test.ts`, `src/pages/ConsolePage/verification.test.tsx` |

## API contracts (verified against backend source and live)

**`GET /api/v1/me/entitlements`** (authenticated) →
`{userId, username, tenantId, roles[{id, code, name, systemRole}], permissions[], scopes[], featureFlags{}}`.
The permissions come from the same resolver that `@RequiresPermission` enforces. There is no tenant kind; an operator is recognised by holding `platform.*` codes, which only a PLATFORM-kind tenant can hold.

**`GET /api/v1/platform/companies?status&page&size`** (`platform.tenants.manage`) →
`{items[{tenantId, tenantCode, tenantName, legalName, country, verificationStatus, tenantStatus, profileRevision, submittedAt, decidedAt}], page, size, totalElements, totalPages}`
- `status` must be one of `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`; when omitted, every state is returned.
- `page` ≥ 0; `size` 1–200 (the screen uses 25); anything else answers `400`.
- The order is fixed: newest submission first, unsubmitted last.
- Only CUSTOMER-kind tenants are listed. There is no text search and no other filter.

**`GET /api/v1/platform/companies/{tenantId}`** →
`{tenantId, tenantCode, tenantName, legalName, taxNumber, commercialRegistrationNumber, country, registeredAddress, timezone, verificationStatus, verificationMethod, rejectionReason, tenantStatus, identityStatus, profileRevision, expectedRevision, submittedAt, submittedBy, decidedAt, decidedBy, attestationReference, evidenceReference, evidenceRecorded, signupAdministrator{userId, signInEnabled, emailVerified}|null, createdAt, updatedAt}`.
An unknown UUID answers `404 resource-not-found`; a malformed one answers `400 validation-failed`, so the screen answers that locally, without a request.

**`GET /api/v1/platform/companies/{tenantId}/verification-history`** →
`[{event, profileRevision, verificationStatus, verificationMethod, rejectionReason, attestationReference, evidenceReference, performedBy, occurredAt}]`, oldest first.

**Errors** (RFC 7807): `401 unauthenticated` goes to Login; `403 insufficient-permission` shows No access; `404` shows Not found; network, timeout, rate-limit and `5xx` failures show the shared `identityErrors.*` messages with a retry. MFA: a portal cookie session counts as MFA-verified, so these reads need no step-up.

## Behaviour

### Entitlements
- One request on the first console entry. The answer is kept in memory, so moving between console pages (each mounts its own shell) asks **0** more times. It is never written to web storage.
- It is forgotten when a session starts, when sign-out is confirmed, and whenever a console read answers `401`.
- Outcomes:
  - `401` → `/login`
  - no `platform.*` permission → "The Fawtir console is for the Fawtir team…"
  - an operator without `platform.tenants.manage` → No access; **no queue request is made**
  - failure → message with retry
- Permissions are read only from the backend. No role name is interpreted, and "Super Admin", `PLATFORM_ADMIN` and `OWNER` appear nowhere.

### Queue
- Server pagination only. The totals shown are the backend's own `totalElements`.
- Tabs Pending / Verified / Rejected / All map to `status=PENDING_VERIFICATION` / `VERIFIED` / `REJECTED` / none.
- States: loading (spinner), rows, empty (only when `totalElements` is 0), past the last page (with a way back), no access (`403`), failure with retry.

**Unsupported design controls removed rather than faked:**

| Control | Why removed |
|---|---|
| Search box | no server search |
| Filter menu | status is covered by the tabs; no other filter exists |
| Sort menu | the backend fixes the order |
| Tab counts | one request per tab would be needed |
| KPI cards | would need counts or metrics |
| Export / Onboard buttons | out of scope |

**Unfinished registrations** are shown, never hidden:
- They are rows with `submittedAt = null`: the pill reads **"Not submitted yet"** and the company line reads "No company details yet".
- They never read "Waiting for review", and they have no actions.
- Filtering them out client-side would falsify the backend's page counts and totals.

### Detail and history
- Opening a company fires the detail and history reads in the same commit, so they travel **in parallel**. A history failure leaves the company on screen and retries only the history.
- The view is composed from the Operations screen's card, label/value line and pill:
  - company as submitted
  - verification state (the rejection reason appears only when there is one)
  - account (tenant status, sign-in setup, registration date, the registrant's sign-in and email-confirmed flags, or "set up by Fawtir")
  - the history timeline
- **Not shown on purpose:** actor UUIDs (`submittedBy`, `decidedBy`, `performedBy`), the evidence UUID (shown as "evidence on file: yes/no") and `expectedRevision`, which is for the next slice's decisions.
- An unsubmitted registration shows a banner: nothing to decide until the registrant finishes.
- **Back** returns to the same queue tab and page. The router state carries only the queue's `?status&page`.

## Request counts (measured in the browser, development build with StrictMode)

| Moment | Requests |
|---|---|
| First console entry (full load of `/console/onboarding`) | **2**: `GET /me/entitlements`, `GET /platform/companies?status=PENDING_VERIFICATION&page=0&size=25` |
| Tab change (Verified, Rejected, All, Pending) | **1** each, with the correct parameters |
| Page past the end, then "first page" | 1 plus 1 |
| Moving to Operations and back to Verification | **1** (the queue); entitlements **0** |
| Opening a company | **2 in parallel** (detail and history started in the same millisecond) |
| Back to the queue | 1 |
| Retry after a failure | 1 |
| Unknown company | 2 (both `404`) |
| Malformed company id | 0 |
| Operator without the permission | 0 queue requests |
| Polling | **0** |

## Security and PII

- **UX only.** Frontend permission checks only decide what to offer; every request is authorised by the backend, and a `403` from it always shows "No access", never an empty list.
- **No persistence of company data.** Company data, the username and permissions live only in memory or React state. Web storage holds only `language` (verified). Nothing is logged: tests spy on the console and the browser run found no console output.
- **No PII in URLs or history.** URLs carry only the tenant UUID and `status` / `page`. Router state carries only the queue's query string.
- **Least exposure.** Only fields the backend returns to this operator are shown, and internal actor and evidence identifiers are left out.
- **No mutations.** No write request exists in this slice; the browser run recorded zero non-GET backend calls apart from sign-in and sign-out.

## Localization, RTL and responsive

All strings are in `en.json` and `ar.json`, with matching keys. Dates use the `'ar'` / `'en-GB'` convention and country names come from `Intl.DisplayNames`.

Verified in the browser at English 1440, English 390, Arabic 1440 and Arabic 390:
- RTL is correct in Arabic, with no English statuses or labels.
- There is no horizontal overflow.
- On a phone the table becomes cards through the existing `RowsView`.
- The Operations and Tenants content areas are **identical to `main`** (0 class differences, same node counts).

## Verification

| Check | Result |
|---|---|
| Tests | **314 passed, 19 files**; new `verification.test.tsx` (25) and `entitlements.test.ts` (6); all Signup, Login and Logout suites still pass |
| Typecheck | pass |
| Lint | changed files clean; the only error is the known, untouched `src/components/ui/Rial.tsx` |
| Build | pass |
| Browser (local backend, real operator, read-only) | entry, username, queue, tabs, paging, in-console navigation, detail, history, unfinished registration, not found, malformed id, back link, no session (a real `401`), Arabic RTL and phones, untouched screens; then signed out (`401` afterwards) |
| Simulated at the network edge | queue `403`, network failure then retry, `5xx`, an operator lacking the permission (the backend's own entitlements minus the code) |

## Known backend gaps (not fixed here, no frontend workaround)

1. **The queue includes unfinished registrations.** A signup shell is listed as `PENDING_VERIFICATION` before its registrant submits (locally 7 of 10). The queue needs a server-side filter or status that separates submitted from unsubmitted registrations. Until then the frontend labels them and leaves the backend totals intact.
2. **No server search** or other filter or sort on the queue.
3. **User errors that answer `500`:** an invalid platform role code, a wrong realm, an empty or oversized evidence file, disabled evidence storage (`IllegalArgumentException` / `IllegalStateException` fall to the catch-all). These matter for the decision and operator slices.
4. **Deprovisioning has no guard** against the PLATFORM tenant or the caller's own tenant.
5. **Platform operator permission gaps:** no platform role holds `admin.settings.manage`, so an operator cannot read its own tenant's activity log, identity policy or metrics.
6. **Logout CSRF-audit defect:** a CSRF refusal answers `401` instead of `403` when the audit write fails row-level security (see the Logout handoff).

## Known limitations

- The sidebar avatar is still the design's placeholder photo; a real avatar or initials would need a `UserMenu` change.
- The sidebar subtitle is a neutral "Fawtir team". Backend role names are English-only, and ranking several roles into one title would be the frontend's own claim.
- Entitlements are read once per session. A permission granted or revoked meanwhile shows after the next sign-in or reload. The backend still enforces every call, so a revoked permission yields No access.
- Operations, Tenants and the "not built yet" pages remain mock, but now render only for signed-in operators.
- `Pager` duplicates the catalogue's local pager markup. Moving the catalogue onto it is a follow-up outside this slice.
- While the next page loads, the table is replaced by the loading state.

## Next recommended slice

**Company verification decisions**:
1. evidence upload (`POST …/verification-evidence`, multipart; the server returns reference and SHA-256)
2. manual attestation and rejection (`POST /tenants/{id}/company-verification/manual-attestation` / `rejection`, quoting `expectedRevision`; the four-eyes rule is enforced server-side)
3. then refresh the detail and history once

It needs a design review for the decision panel. It should wait for the queue filter fix (or keep the "Not submitted yet" rule) and for the `500`-on-bad-evidence fix.

## Post-integration checklist

- [ ] Review and commit
- [ ] Backend: submitted vs unsubmitted filter on the review queue
- [ ] Backend: map user errors (evidence, role code, realm) to 4xx
- [ ] Decide the console avatar and role subtitle
- [ ] Next slice: verification decisions (separately authorised)
