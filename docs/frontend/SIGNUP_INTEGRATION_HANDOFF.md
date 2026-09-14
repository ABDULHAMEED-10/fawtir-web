# Signup — frontend integration handoff

## Purpose and scope

Connects the existing `/signup` screen to the backend self-service signup endpoint. Scope is the
Signup screen only, plus the one-line wording fix on `/verify-code` that the signup hand-off
needs (the code is sent by email, not SMS). Login, Forgot Password, Recovery, MFA, onboarding
steps, Plans and Settings are untouched.

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`) — no commits made |
| Backend contract source | `D:\fawtir` @ `a8d04868` — read only, no backend change. Re-checked at `94cde817` (two later commits: a permission-backfill migration and a PINT UUID fix); no signup contract file changed. |
| Contract files | `identity/adapter/in/rest/SignupController.java`, `identity/domain/request/SignupRequest.java`, `identity/domain/response/SignupResponse.java`, `identity/application/service/SelfServiceSignupService.java`, `shared/infrastructure/rest/GlobalExceptionHandler.java`, `identity/application/service/PasswordPolicyService.java` |

## Exact API contract used

`POST /api/v1/auth/signup` — public, CSRF-exempt, no cookie or credential, rate limited
(pre-auth bucket; `429` + `Retry-After`).

Request (the only fields sent — the backend rejects unknown JSON properties with
`400 malformed-request`, verified live for both `confirmPassword` and `tenantCode`):

```json
{
  "fullName": "Hafidh Saif",
  "username": "hafidh.saif",
  "email": "hafidh@example.test",
  "phone": "+96891234567",
  "password": "<as typed>",
  "languageCode": "en",
  "termsAccepted": true,
  "privacyAccepted": true
}
```

Success `201`:

```json
{
  "tenantCode": "…", "username": "…", "email": "…", "languageCode": "en",
  "emailVerificationRequired": true,
  "emailVerificationExpiresAt": "…", "resendAvailableAt": "…"
}
```

No session, cookie or token is issued. The administrator account stays disabled until email
verification, onboarding and manual review complete.

### Backend configuration the endpoint needs

| Setting | Why |
|---|---|
| `FAWTIR_IDENTITY_SIGNUP_TERMS_VERSION`, `FAWTIR_IDENTITY_SIGNUP_PRIVACY_VERSION` | `SignupPolicyProperties` refuses to run without them and signup answers **500** — each acceptance is recorded against a published policy version. The local compose stack defaults them to `local-terms-v1` / `local-privacy-v1`; real values name approved documents. |
| `spring.jackson.deserialization.fail-on-unknown-properties: true` | why the request must be exactly the eight fields |
| `fawtir.identity.signup` rate limits (core) and the gateway `preauth-signup` group | source of the `429` + `Retry-After` |
| notification delivery + SMTP | the verification code is delivered by email; point local runs at Mailpit (see Environment) |

No migration is required by the frontend change.

### Permissions (RBAC)

None. `/api/v1/auth/signup` is in the `permitAll` block of `SecurityConfiguration`, carries no
`@RequiresPermission`, and is in `PortalCsrfFilter`'s public POST list. The frontend adds no
route guard, because there is no permission to check; nothing in the request can express a role,
tenant or account state (see the `SignupRequest` Javadoc).

### Error behaviour

| Backend answer | Frontend result |
|---|---|
| `400 validation-failed` with `errors[{field}]` | localized message on the matching field (`fullName`, `username`, `email`, `phone`, `password`; `termsAccepted`/`privacyAccepted` → consent). The server's English `message` is never shown. |
| `400 validation-failed` without field attribution (service rules), or with a field no input owns (`languageCode`) | localized form-level "Some details were not accepted…" |
| `409 resource-conflict` | "This username is taken" on the username field |
| `429 rate-limited` | "Try again in N seconds" from `Retry-After`; generic wording if the header is absent |
| `5xx` | localized "temporarily unavailable" |
| no answer (offline, DNS, refused) | localized connectivity message |
| no answer within 30 s | localized timeout message |
| anything else (`malformed-request`, unknown) | localized generic message |

**Duplicate email is not an error.** The backend answers a registered address with a `201`
identical in status and shape to a fresh signup (backend review finding M3 — no membership
oracle) and emails the real owner an "account already exists" notice. The frontend treats every
`201` as success and never tries to detect this case.

## Files changed

| File | Change |
|---|---|
| `src/api/client.ts` | unused `apiClient` replaced by typed `apiRequest`: JSON in/out, 30 s timeout, caller abort, `ApiError` / `NetworkError` |
| `src/api/errors.ts` (new) | `ApiError` (status, problem-type slug, field errors, `Retry-After`), `NetworkError` (`offline` \| `timeout`), problem-detail parsing |
| `src/api/index.ts` | exports |
| `src/lib/identity/signup.ts` (new) | contract types, `validateSignupForm`, `buildSignupRequest` (whitelist), `submitSignup`, `toVerificationState`, `describeSignupFailure` |
| `src/lib/identity/errors.ts` (new) | `commonFailureMessage` — network / timeout / 429 / 5xx / validation messages reusable by Login and Recovery |
| `src/lib/validation.ts` | new `username`, `fullName`, `toOmanE164`; `password` aligned with `PasswordPolicyService`; `passwordCriteria` shared with the meter; email length bound |
| `src/lib/passwordStrength.ts` | meter counts the four policy criteria |
| `src/pages/SignupPage/SignupForm.tsx` | Username row, consent unchecked by default, single form-state object, real submit, double-submit guard, error mapping |
| `src/pages/VerifyCodePage/VerifyCodeForm.tsx` | typed router state; signup copy now says the code went to the registered email |
| `src/components/ui/Input.tsx`, `PhoneInput.tsx` | shared: `aria-invalid` on an errored field and `aria-describedby` linking it to its error (or hint) text; caller-supplied `aria-describedby` is kept. No class changes. |
| `src/i18n/locales/en.json`, `ar.json` | username, full-name, password-policy, consent and `identityErrors.*` keys; removed the now-unused `passwordShort`, `passwordWeak`, `verifyCode.descriptionPhone` |
| `vite.config.ts` | dev/preview `/api` proxy; vitest config |
| `package.json`, `package-lock.json` | `test` script; devDependencies `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` |
| tests (new) | `src/api/client.test.ts`, `src/lib/validation.test.ts`, `src/lib/identity/signup.test.ts`, `src/pages/SignupPage/SignupForm.test.tsx`, `src/components/ui/Input.test.tsx` |
| `.env.local` (local, gitignored) | `FAWTIR_API_ORIGIN=http://localhost:18080` for this machine's gateway port; never committed |

`package-lock.json` already had an uncommitted change before this work (an `npm install` that
moved `@types/qrcode` from `dependencies` to `devDependencies` and marked `@types/node`,
`@types/qrcode`, `undici-types` as `dev`). That drift is preserved unchanged; everything else in
the lockfile diff is the four test packages and their transitive dependencies.

## Decisions

- **Username.** One new row after Full name, reusing the Login page's `Input` + `UserIcon` and
  its `login.usernameLabel`. No new CSS or styles. The pattern `^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$`
  mirrors the backend; the backend trims, lower-cases and is authoritative for global uniqueness.
  The username is always user-entered, never derived from the email.
- **tenantCode.** Never collected, never sent on signup, never shown, never written to
  `localStorage`/`sessionStorage`. It arrives in the `201` and travels only in React Router state
  to `/verify-code`, because `/signup/verify` and `/signup/resend` identify the registration by
  `(tenantCode, email)`. Login is username-only, so the user has no use for it.
- **Consent.** Unchecked by default. One checkbox whose label names both documents drives
  `termsAccepted` and `privacyAccepted`; `buildSignupRequest` copies the actual box state, so it
  cannot manufacture consent.
- **Password.** The shared rule now mirrors `PasswordPolicyService` (12–128, upper, lower, digit,
  symbol) and is used by Signup and New Password. The backend common-password list is not
  mirrored because the composition rule already refuses every entry in it. The strength meter
  scores the same four criteria.
- **Phone.** The field takes the 8-digit national number; the request sends `+968XXXXXXXX`. The
  shared `omanPhone` rule additionally requires a 7/9/2 prefix, which the backend does not
  enforce — a pre-existing product rule kept as is.
- **languageCode.** `ar` when the i18n language starts with `ar`, otherwise `en` — the two values
  the backend accepts.
- **Validation ownership.** The browser checks presence, shape, the username pattern, full-name
  rules, the password policy, confirmation match and consent. The backend remains authoritative
  for all of them plus global username uniqueness, email handling, tenant creation and consent
  versioning.
- **Credentials.** The signup request is sent with `credentials: 'omit'` — it is
  pre-authentication, and a portal session from another tab has no reason to accompany it.
- **Prior branch.** `origin/fronend--for-backend` (`8008eda`) was consulted, not merged. Ported
  in revised form: problem-detail parsing, validation mirrors, test approach. Not ported: its
  `sessionStorage` signup session, flow guard, `FormAlert` banner, raw server sentences in the UI,
  and all Login/MFA/platform changes.

## Accessibility

- Every field is labelled (`<label htmlFor>`); Enter submits from any field.
- An errored field carries `aria-invalid="true"` and `aria-describedby` pointing at its error
  text, so a screen reader reads the message with the field. This lives in the shared `Input` /
  `PhoneInput`, so every form using them (Login, Forgot/New Password, onboarding, Settings,
  Catalog) gains it; no class or layout changed on any of them.
- After a failed submit — local validation or a server field error — focus moves to the first
  invalid field in form order (`firstInvalidField`). Field errors are deliberately not live
  regions: seven announcing at once is noise, and the focused field's description is read
  anyway.
- Form-level failures (network, timeout, 429, 5xx) render with `role="alert"` and leave focus
  where it was.
- The consent checkbox is linked to its error the same way and receives focus when it is the
  only problem.
- The submit button is disabled and relabelled while a request is in flight.

## Optimisation

- Exactly one `POST /api/v1/auth/signup` per submit; page load makes no API call; no
  availability pre-checks, no refetch after success.
- A ref guard stops a second submit while one is in flight (double click, repeated Enter); the
  button is also disabled and shows the submitting label.
- Leaving the page mid-request aborts it, so a late response cannot navigate the user away from
  wherever they went.
- No new state library, no memoisation added; form state is one object.

## Security

- The password is never logged, stored or echoed; `confirmPassword` never leaves the component.
- No `console.*` in the changed production code; the browser run found no password or
  `tenantCode` in console output.
- No secret or environment value added to frontend source. The proxy target is read from
  `process.env.FAWTIR_API_ORIGIN` in `vite.config.ts` and is never bundled.
- Backend English error text is never rendered, in either language.
- Nothing is trusted from the client: tenancy, roles and account state are not expressible in
  the request.

## Environment

```sh
# backend (from D:\fawtir) — see the warning below before starting it
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# frontend
FAWTIR_API_ORIGIN=http://localhost:18080 npx vite --port 5174   # gateway host port from .env
npm test
```

`FAWTIR_API_ORIGIN` defaults to `http://localhost:8080` (the compose default gateway port). It
is read from the shell or from a gitignored `.env.local` (`vite.config.ts` uses `loadEnv`), so a
dev server started with plain `npm run dev` picks it up; on this machine `.env.local` sets
`http://localhost:18080`.
The dev server's origin must be listed in `FAWTIR_GATEWAY_ALLOWED_ORIGINS` for the portal
routes that follow signup.

> **Warning — local mail.** The current `D:\fawtir\.env` enables notification delivery with
> `FAWTIR_SMTP_HOST=smtp.gmail.com` and real credentials. Started as-is, the local stack sends
> real email. For this verification the stack was started with process-environment overrides
> (`FAWTIR_SMTP_HOST=mailpit`, port 1025, empty credentials, auth/STARTTLS off,
> `FAWTIR_NOTIFICATION_DELIVERY_ALLOW_INSECURE_SMTP=true`) and only `@example.test` addresses
> were used. Mail was confirmed in Mailpit; none left the machine.

## Verification performed

| Check | Result |
|---|---|
| Unit + component tests (`npm test`) | 85 passed, 5 files (includes the accessibility tests) |
| Typecheck (`tsc -b`) | pass |
| Lint (`eslint .`) | 1 error, pre-existing in untouched `src/components/ui/Rial.tsx`; changed files clean |
| Build (`npm run build`) | pass (chunk-size warning pre-existing) |
| Live contract probe | `confirmPassword` / `tenantCode` in body → `400 malformed-request`; bad username → `400 validation-failed` with `errors[{field:"username"}]` |

Real browser (headless Chromium, local gateway and core):

| Scenario | Result |
|---|---|
| Layout vs `main`, 1440 and 390 px, en and ar | every element outside the Username row identical in classes and size; only the four ancestor containers grew by 90 px (74 px row + 16 px gap); consent box unticked |
| Page load | 0 API requests |
| Empty submit, invalid username, short/weak password, unticked consent | local errors, 0 API requests |
| Valid signup with double click + two Enter presses | 1 POST, button disabled with "Creating account…", `201`, navigated to `/verify-code`, router state keys `from, tenantCode, email, emailVerificationExpiresAt, resendAvailableAt`, tenantCode not on screen or in web storage, copy "We sent a 6-digit code to <email>" |
| Duplicate username | `409 resource-conflict` → username field message, form re-enabled |
| Duplicate email | `201` with the same shape as a fresh signup → `/verify-code`; owner received "account already exists" in Mailpit |
| Server-only email rejection (`a..b@…`), en and ar | `400` `errors[email]` → localized field message; `languageCode` `ar` sent; no English server text shown |
| Network failure (connection aborted) | localized connectivity message |
| Timeout (request held) | localized timeout message after 30.5 s |
| Rate limit | `429`, `Retry-After: 10` → "Please try again in 10 seconds" |
| Console | no application errors; only the browser's own failed-resource lines for the deliberate 4xx/network cases |
| Accessibility tree (CDP), en 1440 and ar 390 | keyboard Enter on an invalid form focuses Username with `invalid=true` and the localized error as its accessible description; password field linked likewise; consent-only failure focuses the checkbox with its message as description; Login's username field (shared component) also reports its error as description |
| Shared-component regression | 84 before/after comparisons (13 screens using `Input`/`PhoneInput` + Signup, initial and error states, en/ar, 1440/390): 76 identical in every element's classes and size; the 8 differing are all `/signup`, explained entirely by the approved Username row and the now-unticked consent (its error line appears) |

## Integration steps

1. Start the backend stack with mail pointed at Mailpit (Environment warning above).
2. `npm install` (adds the four dev-only test packages).
3. Set `FAWTIR_API_ORIGIN` in `.env.local` if the gateway is not on `:8080`.
4. `npm test`, `npx tsc -b`, `npm run build`.
5. Open `/signup`, register with an `@example.test` address, and read the code in Mailpit at
   `http://127.0.0.1:8025`.

## Pre-existing work

- `package-lock.json` drift from before this task is preserved (see Files changed).
- `src/components/ui/Rial.tsx` has a pre-existing `react-refresh/only-export-components` lint
  error; untouched.
- `origin/fronend--for-backend` (`8008eda`) is unmerged prior work; consulted, not merged or
  modified.

Local test accounts created (local database only): `ui.alpha.mtxhhz8i`, `ui.india.mtxhlffd`.

## Known limitations and follow-ups

1. **Verify screen is still a prototype.** `/verify-code` only reads the new state for its
   wording. Calling `/signup/verify` and `/signup/resend`, the server-driven resend cooldown from
   `resendAvailableAt`, and the "minutes" value (hard-coded 10, which matches the backend TTL)
   belong to the next integration. With no router state it still falls back to the old
   placeholder contact.
2. **Ambiguous failures.** Signup is not idempotent. If a request times out or the connection
   drops after the backend committed, a retry with the same email takes the neutral duplicate
   path and returns a `tenantCode` that belongs to nothing, while the verification code went to
   the first registration. This needs a backend answer (idempotency key or resume by email); it
   cannot be fixed in the browser.
3. **Service-rule 400s carry no field.** Full-name, phone, language and password-policy
   refusals raised in `SelfServiceSignupService` / `PasswordPolicyService` come back without
   `errors[]`, so the UI can only show a form-level message. The local mirrors make this path
   unreachable in practice; attributing those refusals to fields would be a backend change.
4. **Stale backend Javadoc.** `SignupResponse` says the username "is the normalised email" and
   that login needs `tenantCode`; both are no longer true (the service returns the chosen
   username; login is username-only). Documentation only — reported, not changed.
5. **Test dependency advisory.** `vitest` 3.2.7 is affected by GHSA-82fw-gwwq-j7x9 (redirect-mock
   path traversal, dev/test only; this suite does not use redirect mocks). The fix is in
   ≥ 4.1.11, which supports Vite 7, but `npm install` (npm 10.9.0) crashes with
   `Cannot read properties of null (reading 'edgesOut')` on this lockfile. Upgrade once that is
   resolved. The remaining `npm audit` findings (including `react-router` and `browserslist`)
   are pre-existing.
6. **Consent checkbox focus is invisible.** The real checkbox is an opacity-0 input over a
   styled box that has no focus style, so a keyboard user focusing it sees no ring. Pre-existing;
   fixing it needs a visual change (a focus style on the box) and is not made here.
7. **`.env` interpolation.** Docker Compose warns that a variable named `Erff` is unset: a value
   in `D:\fawtir\.env` contains an unescaped `$`, so that value is being truncated.

## Conflict-sensitive areas

`src/lib/validation.ts` (shared by onboarding, customer and password forms),
`src/i18n/locales/*.json`, `src/api/*`, `vite.config.ts`, `package-lock.json`, and
`VerifyCodeForm.tsx` (the next screen to integrate).

## Next recommended screen

**Verify Code (signup path)** — it already receives `{ tenantCode, email,
emailVerificationExpiresAt, resendAvailableAt }` and can reuse `apiRequest`, `ApiError` /
`NetworkError` and `commonFailureMessage` directly.

## Post-integration checklist

- [ ] Review and commit on `feat/signup-integration` (nothing committed yet)
- [ ] Decide on the vitest 4.1.11 upgrade once the npm crash is resolved
- [ ] Route local SMTP to Mailpit in `.env`, or keep the launch overrides
- [ ] Integrate `/signup/verify` and `/signup/resend` on the Verify Code screen
- [ ] Raise the non-idempotent retry case and the stale `SignupResponse` Javadoc with the backend owners
