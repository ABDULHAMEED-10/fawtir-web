# Platform — operator invitations handoff (frontend for backend P7, plus the P4 alignment)

## Scope

This is slice 1 of the frontend work that follows the backend hardening items P1–P8. All of them are
merged into backend `main` (`b265fd88`); each commit was checked to be an ancestor of remote `main`.

| Delivered | What |
|---|---|
| **Invite an operator** | An "Invite an operator" button in the Operators header opens a dialog that asks for the email address only |
| **Pending invitations** | A card under the team table listing open operator invitations, pending and expired, with **Resend** and **Revoke** |
| **Public acceptance page** | `/operator-invitation#token=…`: the invitee chooses a username and their own password. They join with **no platform role**; roles are given on the existing Roles dialog |
| **P4 alignment** | The "last tenant administrator" check counts only *enabled* holders, matching `LastAdministratorGuard` |

What the other backend items mean for the frontend:

| Item | Frontend impact |
|---|---|
| P1 impersonation fence | none (there is no impersonation UI) |
| P2 single platform-role path | none (the Operators screen already uses only `/platform/operators/{id}/roles`) |
| P3 permission freshness | none; the grant-reply defect remains, so `rolesAfter` stays |
| P5 migration and guard corrections | none |
| P6 password reset retiring old codes | none yet; it makes the future recovery slice safer |
| P8 two-step email change | **slice 2**, next, needs its own authorisation |
| P9 lock / unlock / deactivate | **not on backend `main`** (uncommitted in the backend working tree). Its visible part adds audit events and MFA-challenge revocation but no lock state in `GET /users` and no reactivate, so there is nothing to integrate yet |

**Decisions (product owner, 2026-09-13):**
- invitations first, email change as the next slice
- the layout, as previewed: header button, invite dialog, pending card, public page on the auth layout
- operators confirm a new email on their own page, `/account/email/confirm`, reached from the user menu (slice 2)
- local verification runs against a clean build of backend `main`

| | |
|---|---|
| Frontend | `feat/signup-integration` @ `2e99ca0` — **not committed, not pushed** |
| Backend | `main` @ `b265fd88` (P1–P8), **read only**. The 3 uncommitted P9 files in the backend working tree were left untouched |
| Design | layout approved; composed only of existing parts (Tenants header button, Modal, Input, verification-style table, `ConsoleStatusPill`, AuthLayout, PasswordStrength). No CSS, token or global layout change |
| Prisma | `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## Backend contract used (verified in source at `b265fd88` and live)

| Endpoint | Authority | Behaviour |
|---|---|---|
| `POST /api/v1/platform/operators/invitations` `{email}` | `platform.operators.manage` (`@PreAuthorize`) + MFA + production realm | 201 `InvitationResponse` (now includes `kind`). Mails `<acceptance-url>#token=<token>`. **409** `resource-conflict` when the address is already on the team or has an open invitation. **503** `operator-invitations-not-configured` when `fawtir.identity.operator-invitations.acceptance-url` is unset |
| `POST /api/v1/platform/operators/invitations/{id}/resend` | same | 200. Rotates the token (the old link stops working at once) and resets the 7-day window. 409 if accepted or revoked |
| `GET /api/v1/users/invitations?status=PENDING\|EXPIRED&page=0&size=100` | `admin.users.manage` | Lists every kind, newest first. The screen keeps `kind = PLATFORM_OPERATOR` |
| `POST /api/v1/users/invitations/{id}/revoke` | `admin.users.manage` | 200 `REVOKED`; 409 if already closed |
| `POST /api/v1/auth/invitations/accept` `{token, username, password, firstName?, lastName?}` | public (the token) | 201. Creates a **role-less** operator whose email is marked verified; **no session**. **401** for every token problem (invalid, expired, used, revoked, wrong realm). 409 username or email taken. 400 validation. Rate bucket `INVITATION_ACCEPT` 5/min |

**Why expired invitations are listed too.** The backend still counts an expired invitation as open. It blocks a new invitation to the same address (409) and can be resent. Hiding it would leave that address stuck, so the card lists `PENDING` and `EXPIRED` from two exact reads. A single unfiltered read is newest-first across all states, so old open invitations could fall behind history.

## Behaviour

| Piece | Behaviour |
|---|---|
| Invite dialog | Validates the email before sending. One POST (in-flight guard plus disabled buttons). On success it closes, the invitation appears at the top of the card, and a notice says so, with **no re-read**. Errors: 409 → "already on the team or already invited — resend or revoke it below"; 503 → "no acceptance page configured"; 403 → refused; 400 → invalid email; 429 / 5xx / network / timeout → the shared messages; 401 → sign in |
| Pending card | Email (`bdi`), sent date with "Sent N times" when resent (Arabic plural forms included), expiry date or an **Expired** pill, and Resend / Revoke. One action at a time across the card. A resend keeps the row and moves it to the top; a revoke removes it. "No longer open" (409/404) is explained on the row. A read failure shows Retry inside the card; the team table stays |
| Acceptance page | Public, on the auth layout. Reads `#token=` **once**, removes the fragment from the address bar with `navigate(replace)`, keeps the token in memory only, and never stores it — a reload means opening the mail link again. Client rules: V174 username pattern (acceptance does not check it yet), password policy, confirmation, names ≤ 100. One POST, **sent with `credentials: 'omit'`**: the endpoint is public, and a portal session left in the same browser would otherwise make it a CSRF-checked request. 401 turns the form into "This invitation can't be used". 409 marks the username. 400 maps named fields; a field-less 400 is a form message. Success says "Your account is ready" with a Sign in link |
| After acceptance | The operator appears in the team with **No platform role**. They can sign in (password plus EMAIL_OTP, per platform policy) but the console says **No access** until a tenant administrator gives them a role on the Roles dialog |
| P4 | `isLastTenantAdmin` ignores disabled holders. Permanently locked holders are not visible in `GET /users`, so for them the backend's 403 decides |

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open `/console/operators` (direct load) | **4**: entitlements, team, pending invitations, expired invitations (3 when entitlements are cached) |
| Invite (double-clicked) | **1** POST (201) |
| Resend | **1** POST |
| Revoke | **1** POST |
| Invalid email in the dialog, invalid username on the page | **0** |
| Accept (double-clicked) | **1** POST (201), no CSRF header, no cookies |
| Polling | **0** |

## Files

**New:**
- `src/lib/console/operatorInvitations.ts` — types, paths, invite / resend / revoke, `withInvitation`, `openOperatorInvitations`, failure mapping.
- `src/lib/identity/operatorInvitation.ts` — route, `tokenFromFragment`, `acceptOperatorInvitation`, `describeAcceptFailure`.
- `src/pages/ConsolePage/operators/InviteOperatorDialog.tsx`
- `src/pages/ConsolePage/operators/PendingInvitations.tsx`
- `src/pages/OperatorInvitationPage/{OperatorInvitationPage,OperatorInvitationForm}.tsx`, `index.ts`
- Tests: `src/lib/console/operatorInvitations.test.ts`, `src/pages/OperatorInvitationPage/operatorInvitation.test.tsx`

**Modified:**
- `src/pages/ConsolePage/OperatorsPage.tsx` — header button, pending card, a general notice.
- `src/lib/console/platformOperators.ts` — P4 enabled-holder rule.
- `src/pages/ConsolePage/operators.test.tsx` — invitation mocks and counts; P4 and invitation suites.
- `src/App.tsx` — route `/operator-invitation`.
- `src/i18n/locales/en.json`, `ar.json` — `console.operators.invite.*`, `console.operators.pending.*`, `operatorInvitation.*`.

## Security

- **Invite and resend** need `platform.operators.manage`; **list and revoke** need `admin.users.manage`. The Operators screen already requires both. Writes carry the CSRF double-submit header.
- **The acceptance token:**
  - It comes only from the URL fragment, so it never reaches a server, a log or a `Referer`.
  - It is removed from the address bar and the history entry at once.
  - It is held in memory only, never written to storage, never logged, never shown.
- **The accept request** is sent without cookies and without the CSRF header, and the body carries only the whitelisted fields.
- **What the invitee chooses** is only a username, their own password and names. The address is the invitation's, and **no roles can be requested**.
- **Backend English** is never rendered.

## Verification

**Automated:**
- vitest **474/474**; this slice added 13 page tests, 12 acceptance-page tests and 15 unit tests.
- The P4 test was mutation-checked: it fails without the enabled-holder rule.
- `tsc -b` clean, eslint clean on the changed files, `vite build` OK.

**Local backend used.** The existing `fawtir/core:local` image was tagged `fawtir/core:local-pre-b265fd88` for rollback. A new image was built from a clean `git archive` of `main` `b265fd88`, which by construction excludes the uncommitted P9 work, untracked files and git-ignored keys. Only `fawtir-core` was recreated. Flyway applied V179–V183 to the local database, and the container came back healthy. A scratchpad compose override pinned:
- the running mail settings (Mailpit, port 1025, no auth), so the recreate could not fall back to `.env`'s Gmail SMTP — a rendered diff proved the risk and then that only the acceptance URL changed
- the `:5174` origin
- `FAWTIR_IDENTITY_OPERATOR_INVITATION_ACCEPTANCE_URL=http://localhost:5174/operator-invitation`

**Browser run** (Playwright, real email-code sign-in via Mailpit, scratchpad `invite-verify.mjs`): **13/13 steps**, 0 page errors, 0 console errors, 0 unexpected writes.

| Check | Result |
|---|---|
| Direct load, EN 1440 | 4 GETs as listed |
| Invalid email | message, 0 requests |
| Invite, double-clicked | 1 POST 201 (+CSRF); row appears; the mail carries a `…/operator-invitation#token=` link; DB row `PENDING / PLATFORM_OPERATOR / roles=0` |
| Invite the same address again | real 409, conflict message |
| Resend | 1 POST 200; a new mail with a **different** link; `sent=2` |
| Old link after the resend | fragment removed on load; accept → real **401**, "can't be used" page |
| Acceptance form, AR 390 | RTL, no horizontal overflow, fragment removed, 0 requests |
| Accept, EN 1440 (an admin session cookie present in that browser), double-clicked | invalid username refused client-side; **1** POST 201 without the CSRF header; DB: invitation `ACCEPTED`, new user with **no roles**, email verified |
| Admin reloads Operators | the new person listed with "No platform role"; gone from the pending card |
| New operator signs in (password + EMAIL_OTP from Mailpit) | reaches `/dashboard`; `/console/operators` shows "No access" (no platform permission) |
| Invite a second address, revoke | 1 POST 200; row removed; DB `REVOKED`; its link → real 401 |
| Operators EN 390, AR 390, AR 1440, with the invite dialog open | RTL where expected, no horizontal overflow, 4 GETs each |
| Sign out, then open `/console/operators` | `/login` |

**Local data left:**
- One accepted operator invitation, whose operator was deactivated at the end (no roles).
- One revoked invitation.
- Their mails in Mailpit.
- The new operator's sign-in session was not signed out; it expires.

The bootstrap operator's roles are unchanged. Nothing on TEST or production.

## Open items and backend gaps (documented, not fixed)

- **Email copy** for operator invitations needs product approval (backend note on P7).
- **P12 (error contract), still open:**
  - a username already used in *another* tenant still returns **500** on accept (shown as a service fault)
  - the losing request of two simultaneous accepts also returns 500
  - 409 on invite does not say whether the address is a member or has an open invitation
- **No lock state** in `GET /users`, so the last-admin check cannot see permanently locked holders (the backend's 403 covers it). *Update 2026-09-14: handled against the P9 backend work — see `PLATFORM_OPERATOR_REACTIVATION_HANDOFF.md`.*
- **P9 is not on backend `main`.** *Update 2026-09-14: reactivation and lock state are integrated against the uncommitted P9 working tree — see `PLATFORM_OPERATOR_REACTIVATION_HANDOFF.md`.*
- **Acceptance-URL deployment configuration.** The acceptance URL must be configured per deployment (`FAWTIR_IDENTITY_OPERATOR_INVITATION_ACCEPTANCE_URL`, an absolute https URL on an allowed portal origin). Without it the invite answers 503 and the dialog says so.

## Next slice (needs authorisation)

**Slice 2 — two-step operator email change (P8):**
- **Admin side:** "Change email" on an operator — current email, new email and a reason. It answers 202 "pending confirmation" and the old address is notified.
- **Operator side:** `/account/email/confirm`, linked from the user menu, reachable with just a signed-in session. The operator enters the code mailed to the new address (`POST /platform/operators/me/email/confirm`), after which every session is signed out.
