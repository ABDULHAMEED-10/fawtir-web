# Login — frontend integration handoff

## Purpose and scope

Makes sign-in real: username and password, then the email code the backend requires of every
account, then an HttpOnly cookie session and the dashboard. The code step is in scope because
**the backend never issues a session for a password alone** — company-level MFA is mandatory
(`TenantIdentityPolicyService.requiresMfa` always returns `true`), so a Login that stopped at the
password could not sign anyone in.

Out of scope and untouched: account recovery (`/forgot-password`, `/new-password`), authenticator
app (TOTP) and recovery-code sign-in, MFA enrolment, the dashboard, route guards, session refresh,
logout, the reviewer console.

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`) — no commits made |
| Backend | `D:\fawtir` @ `94cde817` — read only, no backend change |
| Prerequisites | `SIGNUP_INTEGRATION_HANDOFF.md`, `ONBOARDING_INTEGRATION_HANDOFF.md`, `FINAL_SUBMISSION_HANDOFF.md` |
| Authorities read | `AuthenticationController`, `RecordLoginRequest`, `LoginResponse`, `LoginService`, `TenantIdentityPolicyService`, `MfaController`, `MfaChallengeService`, `MfaVerificationService`, `MfaOtpStore`, `MfaLoginVerificationRequest`, `MfaOtpRequest`, `PortalCookieService`, `PortalCsrfFilter`, `LoginAttemptService` / `AuthenticationEventListener`, gateway `application.yml` pre-auth rate limits, `docs/testing/identity/documents/frontend-integration-guide.md` §8.4, §14 |

## Decisions taken with the product owner (2026-09-12)

1. **Login plus the email-code step.** After the password the user lands on `/login/mfa`, built from
   the existing verification-code screen (`VerifyCodeView`) — no new design. The first code is
   emailed automatically.
2. **After sign-in: `/dashboard`**, one fixed target. Nothing in the backend yet says which home a
   given principal (tenant user or platform operator) belongs on, so there is no role-based redirect.
   **Superseded 19 Sep 2026 (UI):** after sign-in the app reads `GET /me/entitlements` once; a
   principal holding any `platform.*` permission lands on `/console`, everyone else on `/dashboard`
   (`landingRoute()` in `lib/identity/login.ts`). If the read fails the dashboard is the fallback.
3. **No route guard and no session probe yet.** The app makes no "who am I" request; guards and
   `GET /me/entitlements` belong to the dashboard/app-shell integration.
4. **Remember me stays visible and does nothing.** The backend has no remember-me; the portal
   cookie lifetime is the server's alone. The checkbox is not sent.

## Backend contract

```
POST /api/v1/auth/login            { username, password, portalCookie: true }
  200 { mfaRequired: true, mfaChallengeToken, mfaChallengeExpiresIn: 300, … }   (always, today)
  200 { mfaRequired: false }  + HttpOnly cookies   (the no-MFA branch; unreachable while MFA is mandatory)
  401 authentication-failed   — wrong password, unknown username, locked, disabled, registration
                                under review, tenant not ready: one answer, deliberately
  400 validation-failed       — blank, username > 255, password > 128
  429 + Retry-After           — gateway 20/min per IP; core has its own identity limiter

POST /api/v1/auth/mfa/otp/request  { challengeToken, factor: "EMAIL_OTP" }
  202                          — code emailed; each request REPLACES the stored code for the challenge
  401                          — challenge invalid / expired / revoked, factor not allowed, no email

POST /api/v1/auth/mfa/verify       { challengeToken, factor: "EMAIL_OTP", code, portalCookie: true }
  200 { mfaRequired: false, tokens stripped }  + FAWTIR_SESSION, FAWTIR_REFRESH, FAWTIR_CSRF cookies
  401                          — wrong code, expired, already used, different network (IP-bound)
```

- **`tenantCode` is never sent.** The backend derives the tenant from the username (V173 global
  lookup) and discards the field at deserialisation (`@JsonIgnoreProperties`).
- **Every verification attempt spends the challenge**, right or wrong (replay guard consumed before
  the code is checked — review finding H3). A wrong code therefore ends the attempt; only a fresh
  sign-in can continue. MFA failures do **not** count towards the password lockout (only
  `AuthenticationEventListener` password failures do).
- **Why EMAIL_OTP.** The login response does not say which factors a user has, and every company
  policy must allow EMAIL_OTP or SMS_OTP "so users without an enrolled authenticator can sign in"
  (`TenantIdentityPolicyService.update`). The email code is the one factor that works for everyone
  without asking. SMS is behind a feature flag.
- All three endpoints are exempt from the portal CSRF check (`PortalCsrfFilter.PUBLIC_POSTS`).

### Where the backend guide is stale

`frontend-integration-guide.md` §14 still shows a company-code field, says Login "produces the
required factor and delivery hint" (the response carries neither), and lists a distinct locked
answer (the handler returns the same `401`). The code above is the authority; the guide should be
corrected.

## Route graph

```
/login ──Sign in (1 request)──▶ /login/mfa ──code emailed (1 request)
   ▲                               │
   │ 401 on verify / code request, │ Verify (1 request, sets cookies)
   │ challenge lapsed on screen    ▼
   └──── "Sign in again" ◀──── /dashboard   (the code screen's history entry is replaced)

/login/mfa opened directly or reloaded ──▶ /login   (0 requests)
```

History after a sign-in: `[/login, /dashboard]`. Back from the dashboard shows Login (no guard yet);
Forward returns to the dashboard; nothing loops.

## Error mapping

| Situation | Screen | Message |
|---|---|---|
| Blank username or password | Login | `validation.required` on the field, focus on the first; no request |
| Username > 255 / password > 128 | Login | `validation.tooLong`; no request |
| `401` on login (any reason) | Login | "Incorrect username or password, or this account can't sign in yet." — one message for all |
| `400` validation / malformed, `429`, `5xx`, offline, timeout | Login or code | shared `identityErrors.*` messages |
| Login `200` without a usable challenge | Login | `identityErrors.unexpected` |
| Code incomplete | Code | `validation.codeIncomplete`; no request |
| `401` on code request or verify, or the challenge lapsing on screen | → Login | "That code didn't work or has expired. Sign in again to get a new code." |

The Login message names no reason on purpose: the backend answers every refused credential alike
so the form cannot be used to learn which accounts exist, and the UI must not undo that. The "can't
sign in yet" clause covers a registrant whose company is still under review without revealing
anything about any account.

## State

| What | Where | Why |
|---|---|---|
| Form values | one `values` object in `LoginForm` | single source; password never stored or logged |
| MFA challenge | **module memory** (`loginChallenge.ts`), never storage or router state | it is a credential for five minutes; router state is persisted by the browser with the history entry. A reload loses it and restarts sign-in — intended |
| First-code request | shared per challenge (`requestFirstLoginCode`) | a second request replaces the emailed code; StrictMode's double effect or Back/Forward must not invalidate the code the user is about to receive |
| Session | HttpOnly cookies set by the server (`portalCookie: true`) | no token ever reaches JavaScript |
| "Sign in again" notice | router state, cleared as soon as Login reads it | a reload must not repeat it |
| Onboarding session | untouched | Login neither reads nor changes `fawtir.signup.onboarding.v1` |

Resend cooldown: 60 s, **client-side only** — the endpoint has no server cooldown, just per-IP rate
limits. The code screen's countdown to the challenge's expiry is timed from
`mfaChallengeExpiresIn` (relative), so a skewed client clock cannot make a live challenge look dead.

## Files changed (this slice)

| File | Change |
|---|---|
| `src/lib/identity/login.ts` (new) | contract types, bounds, `validateLoginForm`, `buildLoginRequest`, `toLoginOutcome`, `submitLogin`, `requestLoginCode`, `verifyLoginCode`, `describeLoginFailure`, `isChallengeSpent`, routes |
| `src/lib/identity/loginChallenge.ts` (new) | in-memory challenge; one first-code request per challenge |
| `src/pages/LoginPage/LoginForm.tsx` | real request; single form state; guarded submit; form-level error; `name` attributes; stale `tenantCode` seam comment removed. Markup and classes unchanged |
| `src/pages/LoginCodePage/*` (new) | `/login/mfa`: `AuthLayout` + existing `VerifyCodeView` |
| `src/App.tsx`, `src/pages/index.ts` | `/login/mfa` route |
| `src/i18n/locales/en.json`, `ar.json` | `login.failed`, `login.signInAgain`, `loginCode.description` |
| `src/lib/identity/login.test.ts`, `loginChallenge.test.ts`, `src/pages/login.test.tsx` (new) | tests |

The one rendered addition to Login is the error paragraph (`text-xs font-medium text-text-danger`,
`role="alert"`), shown only after a refused attempt — the same element every other integrated form
uses.

## Security review

- No `tenantCode`, no remember-me, no onboarding token in any request; the body is a whitelist.
- `portalCookie: true` on login and verify: the verify body arrives with tokens stripped and the
  session lives in `FAWTIR_SESSION` (HttpOnly, Secure, SameSite=Strict); nothing token-like is
  written to `localStorage`, `sessionStorage` or history state (verified in the browser).
- Nothing is logged: no `console` call anywhere in the slice; a test asserts the password never
  reaches the console.
- Nothing sensitive in a URL; the code screen shows no recipient address.
- Double-submit guards on Sign in, Verify and Resend (ref-held `AbortController`, not just the
  disabled button); a lost response is never auto-retried.
- A verification still in flight when the challenge lapses is not abandoned — leaving would abort
  a request the server may already have accepted (found in review; see below).
- Credentials: `same-origin` for login and verify (cookies must be stored), `omit` for the code
  request.

## Verification

| Check | Result |
|---|---|
| Tests (`npm test`) | **260 passed, 15 files** — new `login.test.ts` (23), `loginChallenge.test.ts` (6), `login.test.tsx` (35) |
| Typecheck | pass |
| Lint | changed files clean; 1 pre-existing error in untouched `src/components/ui/Rial.tsx` |
| Build | pass |

### Real browser, local backend

Headless Chromium through the `:5174` dev proxy to the local gateway (`:18080`); mail captured by
Mailpit (core `SPRING_MAIL_HOST=mailpit`, no relay). Accounts: the local platform operator (the only
active account; credentials read from `.env` in memory, never printed), a registrant from the final
submission run (company under review), and an unknown username. `main` served on `:5175` for parity.

| Scenario | Result |
|---|---|
| Login vs `main` (en/ar × 1440/390), idle and after an empty submit | **0 class differences, 67/67 nodes** in all four; ltr/rtl correct; no horizontal overflow; 0 requests; focus lands on Username |
| Keyboard only (type, Tab, type, Enter), unknown username | Tab reaches Password; **1** `login 401`; generic message; button re-enabled; message clears on edit |
| Registration under review, ar 390 | **1** `login 401`; the same Arabic message, no English; problem type, detail and keys **identical** to the unknown username's |
| Double click + Enter with the answer held 1.5 s | **1** `login` request; button disabled, "Signing in…" |
| Full sign-in, en 1440 | `login 200` → `/login/mfa`, `otp/request 202` (1 email), description names no address, challenge not in storage or history, Resend disabled "1:00" → code from Mailpit → `verify 200` → `/dashboard`. **3 app requests in total**. Verify body has no tokens. Cookies: `FAWTIR_SESSION` HttpOnly/Secure/Strict `/`, `FAWTIR_REFRESH` HttpOnly/Secure/Strict `/api/v1/auth`, `FAWTIR_CSRF` readable/Secure/Strict. No JWT in storage. Harness probe `GET /me/entitlements` → **200** |
| After sign-in | Back → `/login`, Forward → `/dashboard`, reload → `/dashboard` with the session still valid (entitlements 200), typed `/login/mfa` → `/login`; **0 app requests** |
| Wrong code, ar 390 | `login 200`, `otp/request 202`, `verify 401` → Login with the Arabic "sign in again" notice, no English; notice cleared from history; Back does not return to the code screen |
| Resend, then reload | Resend disabled before 60 s, enabled after; double click → **1** `otp/request 202`, cooldown restarts; reload → `/login`, 0 requests; new tab on `/login/mfa` → `/login`, 0 requests |
| Console / page errors | none |
| Report scanned for the password or recipient | not present |

The sign-in and after-sign-in scenarios were re-run on the final code (after the review fix below)
with the same results.

### Defect found in review and fixed

React Router commits navigations as transitions. After a successful verify, resetting the
"verifying" flag re-rendered the code screen idle before the dashboard navigation committed; past
the challenge's expiry, that render's expiry check sent a user who was already signed in back to
Login. The form now stays in its verifying state after success, and the expiry check waits while a
request is out. Covered by a test that holds the verification across the expiry.

## Known limitations and follow-ups

1. **Sign out does not end the session.** `UserMenu`'s "Sign out" is still the prototype's link to
   `/login`; it does not call `POST /auth/logout`, so the cookie session stays valid until it
   expires. Before this slice there was no real session, so this is newly relevant — integrate
   logout next (it needs the `X-CSRF-Token` header from `FAWTIR_CSRF`).
2. **No guard, no refresh.** App pages render without a session and nothing calls
   `/auth/refresh`; the dashboard slice owns both.
3. **Authenticator-app and recovery-code users** can still sign in (the email code works for every
   account), but cannot use those factors here. The guide's factor chooser needs a design.
4. **A policy that allows SMS_OTP but not EMAIL_OTP** would refuse the code request (`401`) and send
   the user back to Login each time. No such policy is the default; the backend should say which
   factors apply (below).
5. **Portal cookies need same-origin API access** (the dev/preview proxy or a same-origin reverse
   proxy). A cross-origin `VITE_API_BASE_URL` would need `credentials: 'include'` and CORS with
   credentials.
6. **Remember me has no effect** (product decision above).
7. Pre-existing and not touched here, as instructed: `AuthLayout` clips tall screens on phones;
   the backend accepts onboarding step edits after submission; the OTP row overflows at 390 px.

## Backend asks (no blocker for this slice)

- Return the user's usable factors (and a masked delivery hint) with the MFA challenge, so the code
  screen can offer TOTP/recovery codes and name where the code went — as the guide already claims.
- Correct `frontend-integration-guide.md` §14 (company-code field, factor/hint, distinct locked answer).

## PRISMA_APPLICABLE

No. This slice has no schema, data model or persistence change on the frontend, and none on the
backend.

## Post-integration checklist

- [ ] Review and commit
- [ ] Integrate logout (UserMenu "Sign out" → `POST /auth/logout` with CSRF header)
- [ ] Dashboard/app shell: session probe, route guards, refresh
- [ ] Backend: factors + delivery hint on the challenge; update the guide
