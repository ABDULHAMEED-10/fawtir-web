# Logout — frontend integration handoff

## Purpose and scope

Makes **Sign out** real. Until now the menu item was a plain link to `/login`, which left the
HttpOnly cookie session created by Login fully usable. It now asks the backend to end the session,
and shows the user as signed out **only when the backend confirms that no session remains**.

In scope: the Sign out item in `UserMenu` (shared by the tenant app sidebar and the Fawtir console
sidebar, desktop and mobile drawer), and the CSRF header every cookie-authenticated write needs.

Out of scope and untouched: route guards, an app-shell session probe, refresh, recovery, MFA,
platform/admin integration, settings. The Team page's "Sign out everywhere" (an admin action
against another user's sessions) is not this feature.

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`) — no commits made |
| Backend | `D:\fawtir` @ `94cde817` — read only, no backend or environment change |
| Prerequisites | `LOGIN_INTEGRATION_HANDOFF.md` (the session this ends) |
| Authorities read | `LogoutController`, `SessionManagementService.logoutCurrent` / `doRevokeMine`, `PortalCookieAuthenticationFilter`, `PortalCsrfFilter`, `PortalCookieService.clear`, `SecurityConfiguration`, gateway `PortalSessionCookieAuthenticationFilter` and CORS configuration, `frontend-integration-guide.md` §8.4–8.5, §21 |

## Backend contract

```
POST /api/v1/auth/logout          no body; the FAWTIR_SESSION cookie authenticates it
  X-CSRF-Token: <value of the readable FAWTIR_CSRF cookie>     (double-submit)
  Origin: <an allowed portal origin>                           (sent by the browser)

  204  session row revoked (revokeByUser), every refresh token of that session revoked,
       all three cookies cleared with Max-Age=0; audited SessionRevokedByUser
  401  no live session to end: no cookie, expired, or already revoked
  403  documented for a CSRF refusal (wrong/missing token or origin) — the session stays alive
       (see "Backend defect" below: the running backend answers 401 instead)
  403  gateway "Invalid CORS request" for an origin not in FAWTIR_GATEWAY_ALLOWED_ORIGINS
  429 / 5xx / offline / timeout    the session stays alive
```

## Behaviour

| Outcome | What the user sees | Why |
|---|---|---|
| `204` | `/login` (history entry replaced) | the backend confirmed the session is gone |
| `401` | `/login` (history entry replaced) | there is no live session left to end |
| `403`, `429`, `5xx`, offline, timeout (30 s) | stays on the current page; the item reads **"Couldn't sign out. Retry"**; screen readers hear **"Couldn't sign out. Your session is still active — try again."** | the HttpOnly session may still be valid and the browser cannot delete it, so going to Login would falsely say "signed out" |
| Retry | exactly one new request; the failure text and the announcement are cleared while it runs | |
| While the request is out | the item reads "Signing out…" and carries `aria-disabled`; further clicks and Enter presses are ignored | one action, one request |

Details that matter:

- **Never aborted.** The request is not cancelled when the menu unmounts (every page mounts its own
  shell). The server may already be revoking the session; a user who clicked elsewhere meanwhile
  still ends up on Login. Covered by a test whose mocked fetch honours aborts.
- **The element is unchanged.** It is still the design's `<Link to="/login" role="menuitem">` with
  the same classes; the click is intercepted, so following it never happens before the backend
  answers. Only its text changes.
- **One-line label.** The failure label is deliberately short: `Popover` is placed once when it
  opens, and a two-line item would grow the panel over the user card. Measured in the browser: the
  label stays one line (40 px, the same as "Sign out") at 1440 and 390 px in English and Arabic.
  The fuller explanation goes to the screen-reader status instead.
- **Leftover sign-in state.** On success the in-memory Login challenge (if any) is dropped. There is
  no other client auth state: no tokens, no stores, no query cache.

## Request count

| Action | Requests |
|---|---|
| Open the menu | 0 |
| Sign out (success) | **1** (`POST /auth/logout`) |
| Sign out (failure) | 1; each retry 1 more |
| Double click + repeated Enter while in flight | 1 |

No pre-check, no `/me` probe, no polling, no refetch.

## Files changed (this slice)

| File | Change |
|---|---|
| `src/api/client.ts` | echoes the readable `FAWTIR_CSRF` cookie as `X-CSRF-Token` on non-GET requests that send cookies (skipped for `credentials: 'omit'`); read only, never writes a cookie |
| `src/lib/identity/logout.ts` (new) | `signOut()`: resolves on `204`/`401`, rejects on everything else |
| `src/components/shell/UserMenu.tsx` | guarded sign-out on the existing item; state text; screen-reader status |
| `src/i18n/locales/en.json`, `ar.json` | `shell.user.signingOut`, `shell.user.signOutFailed`, `shell.user.signOutFailedStatus` |
| `src/api/client.test.ts`, `src/lib/identity/logout.test.ts` (new), `src/components/shell/UserMenu.test.tsx` (new) | tests |

The one DOM addition is `<span role="status" class="sr-only">`, a screen-reader live region beside
the menu trigger. `sr-only` is an existing utility, already used in the codebase, and takes no space.

## Security review

- No client-side cookie writes or deletions; the CSRF cookie is only read (test spies on the
  `document.cookie` setter). HttpOnly cookies are cleared by the server's `204` alone.
- Nothing written to `localStorage`, `sessionStorage` or the URL; nothing logged (tests assert the
  CSRF value never reaches the console; the browser run found no console errors).
- The UI never claims "signed out" unless the backend answered `204` or `401`.
- The CSRF header is attached only to same-origin API requests that carry cookies.
- The request is not retried automatically.

## Backend defect found (not fixed — backend is out of scope)

**A CSRF refusal against a live session answers `401 unauthenticated`, not `403 csrf-rejected`.**

- **Cause.** `PortalCsrfFilter.auditRejection` writes `CsrfRejected` to
  `identity.security_audit_events` outside a tenant execution context. The insert violates the
  table's row-level security (`new row violates row-level security policy`), the exception escapes
  the filter before the `403` is written, and the error dispatch answers `401`.
- **Proved** through the gateway on the local stack with a live session:
  - wrong `X-CSRF-Token` → `401`
  - missing token → `401`
  - missing `Origin` → `401`
  - correct token → the request passes authentication
  - no `CsrfRejected` row is ever recorded; the stack trace is in the core log
- **Frontend impact.** The contract says `401` means "no session", so the app goes to Login. When
  a CSRF check fails against a *live* session, that shows a signed-out screen over a session that
  is still usable. Reproduced in the browser: logout `401` → `/login`, then
  `GET /me/entitlements` → `200`.
- **When it can happen.** The app always sends the right token and browsers always send `Origin`
  on POST, so normal use never reaches this. It can only happen if the `FAWTIR_CSRF` cookie is
  missing or overridden (cookie tampering or injection) or if something strips `Origin`.
- **Why no frontend workaround.** A genuinely signed-out browser receives the same
  `401 unauthenticated`, so the frontend cannot tell the two apart.
- **Minimal backend fix.** Record the rejection audit inside the tenant execution context of the
  portal principal, or make the audit write best-effort so it can never stop the `403` from being
  written. Add a test that a CSRF mismatch answers `403 csrf-rejected` and records one audit row.
- **Security impact.** The CSRF protection itself holds: the forged write is still refused. What
  is lost is the audit trail for CSRF refusals, and the response code the client relies on.

## Local environment note

The current local backend does not allow `http://localhost:5173` as a portal origin. The running
stack allows `http://localhost:3000`, `http://localhost:4180` and `http://localhost:5174`
(`FAWTIR_GATEWAY_ALLOWED_ORIGINS`, which also feeds core's portal allowed origins).

**This affects more than logout.** The gateway's CORS check refuses every API request from a
non-allowed origin with `403 Invalid CORS request`: signup, login and logout alike. This corrects
the earlier statement that only logout was affected.

To use `:5173` later:

1. add `http://localhost:5173` to `FAWTIR_GATEWAY_ALLOWED_ORIGINS` in `D:\fawtir\.env`;
2. then restart or recreate the `core` and `gateway` containers.

That change was **not** applied for this task. All verification ran on `http://localhost:5174`,
which is already allowed.

## Verification

| Check | Result |
|---|---|
| Tests (`npm test`) | **283 passed, 17 files** — new `UserMenu.test.tsx` (13), `logout.test.ts` (6), `client.test.ts` +4 (CSRF header) |
| Mutation check | treating failures as signed out makes 11 tests fail; aborting on unmount makes the "walked away" test fail |
| Typecheck | pass |
| Lint | changed files clean; the only error is the pre-existing one in untouched `src/components/ui/Rial.tsx` |
| Build | pass |

### Real browser, local backend (`http://localhost:5174`)

Headless Chromium through the dev proxy to the local gateway. The session came from real sign-ins
of the local platform operator (email code captured by Mailpit). Credentials were read from `.env`
in memory and never printed. "Session alive" means a harness-only `GET /me/entitlements` answered
`200`; those probe requests are excluded from the app's request counts.

| Scenario | Result |
|---|---|
| Menu vs `main` (en/ar × 1440/390) | same nodes and classes plus the one `sr-only` status; Sign out item and trigger at identical positions and sizes; 0 requests on opening; ltr/rtl correct; no horizontal overflow |
| `403` (simulated, the documented body) + retry | stays on `/dashboard`, "Couldn't sign out. Retry", announced, one line, no overlap; session alive; retry 1 new request → `403` again, same state |
| `429` (simulated) | stays; session alive |
| `503` (simulated) | stays; session alive |
| Network failure (connection cut) | stays; session alive |
| Timeout (request held) | gives up after **30 s**, stays; session alive |
| Retry to success: double click + two Enters | **1** request → real **`204`** → `/login`; session `401`; no cookies left; storage empty; Back → `/login`, reload → `/login`; a typed `/dashboard` renders the prototype but the session stays `401` |
| Already-dead session (ar, 390) | session revoked behind the app's back, dead cookie kept → **1** request → real **`401`** → `/login` |
| Arabic failure (390, drawer) | "تعذّر الخروج. أعد المحاولة", announced in Arabic, rtl, no English |
| Console shell (ar, 1440), keyboard only | Enter on the item → **1** request → `204` → `/login`; no other requests |
| English phone (390) | **1** request → `204` → `/login`; session `401` |
| Real CSRF refusal (backend defect evidence) | `401` → `/login` while the session is still alive (`200`); cleaned up afterwards with a real `204` |
| Console / page errors | none; no password, cookie value or recipient in the report |

The `403`, `429` and `503` answers were simulated by the harness returning the documented problem
body. The running backend cannot return a real `403 csrf-rejected` (see the defect), and a real
`429` or `5xx` cannot be caused safely. The `204` and `401` cases, the timeout and the network cut
are real.

## Known limitations

1. **The backend CSRF defect above** can produce a false signed-out screen, but only when a CSRF
   check fails against a live session. It cannot be fixed in the frontend.
2. **No route guard.** After signing out, typing an app URL still renders the prototype pages; they
   fetch nothing, and the session is provably dead. Guards belong to the dashboard/app-shell slice.
3. **Middle-click / open in new tab** on Sign out opens `/login` without signing out, as the link
   always did.
4. **`:5173` cannot reach the local backend at all** until the allowed-origins setting includes it
   (see the local environment note).

## Next recommended task

Dashboard/app-shell session handling: one `GET /me/entitlements` on entry, guards that send a
signed-out visitor to Login, and refresh. Separately for the backend: fix the CSRF-audit RLS defect.

## Post-integration checklist

- [ ] Review and commit
- [ ] Backend: audit CSRF refusals inside the tenant context (or best-effort) so they answer `403`
- [ ] Local: add `http://localhost:5173` to `FAWTIR_GATEWAY_ALLOWED_ORIGINS` if that port is used
- [ ] Dashboard/app shell: session probe, guards, refresh
