# Platform — two-step operator email change handoff (frontend for backend P8)

## Scope

This slice follows backend P8, which is **committed and pushed** on backend `main` (`b265fd88`). It has two halves:

| Delivered | What |
|---|---|
| **Admin request** | "Change sign-in email" in each team row's action menu, **your own row included** (the backend allows self-service). A dialog shows the current address read-only, asks for the new address and a reason, and sends one PUT. Nothing moves yet; the notice says who must confirm and by when |
| **Operator confirmation** | `/account/email/confirm`, reached from **"Confirm new sign-in email" in the console user menu**. One pasted code, one POST. On success: "your email changed, you are signed out everywhere", then Sign in |
| **Row action menu** | Team rows now use the console's existing `ActionMenu`: Roles, Change sign-in email, a divider, then Reset two-step in red (not on your own row). This replaces the P10 row buttons |
| **`ActionMenu` `floating` (opt-in)** | Portals the same-looking panel to the body so a short table cannot clip it. Only the Operators rows use it; the other 33 menus are untouched |

**Decisions (product owner):**
- 2026-09-13: operators confirm on their own page from the user menu.
- 2026-09-14: row actions become an action menu; the confirm entry goes in the console user menu only; the clipped menu gets the opt-in `floating` fix.

**Why the confirm page sits outside the console shell:** the console shows screens only to someone holding a `platform.*` permission, and the operator confirming may hold **no role at all**. The page uses the auth layout (like the invitation page) and needs only a session.

| | |
|---|---|
| Frontend | `feat/signup-integration` @ `2e99ca0` — **not committed, not pushed** |
| Backend | `main` @ `b265fd88` (P8 included), read only |
| Design | existing parts only: `ActionMenu` with Settings-team icons (`menu-edit`, `menu-mail`, `menu-key`), `Modal`/`Input` (read-only appearance for the current address), `AuthLayout`, `BackButton`, `Button` |
| Prisma | `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## Backend contract used (verified in source and live)

**Admin request:** `PUT /api/v1/platform/operators/{id}/email` with body `{ expectedCurrentEmail, newEmail, reason }` (`@Email @Size(max = 255)` ×2, reason `@NotBlank @Size(max = 280)`).
- **Who may call it:** `platform.operators.manage` plus a fresh MFA check, production realm only.
- **Answers:**
  - **202** `{ status: PENDING_CONFIRMATION, currentEmail, requestedEmail, expiresAt (24 h) }`: a code is mailed to the new address and a notice to the current one
  - **200** `ALREADY_APPLIED`
  - **409** the current email no longer matches, **or** the address belongs to another operator (the same 409 today)
  - 400 / 403 / 404 / 401
- A newer request replaces a pending one. **No endpoint lists or cancels a pending change.**

**Operator confirmation:** `POST /api/v1/platform/operators/me/email/confirm` with body `{ token }` (`@Size(max = 512)`).
- **Who may call it:** any signed-in operator of the production realm, with no permission needed.
- **Answers:**
  - **200** applies the change, marks the email verified, and **revokes every session, the caller's too**
  - **401 `authentication-failed`** means the code was refused: wrong, expired, used, replaced or someone else's
  - **401 `unauthenticated`** (any other 401) means the session is gone
- The code looks like `fawtir_ec_<tenant>.<random>` and is pasted, not typed. **The email has no link.**

## Behaviour

**Admin dialog**
- Before sending, it checks: a valid address, not the current one (trimmed, case-insensitive, as the backend compares), and a reason. Focus goes to the first invalid field.
- It sends `expectedCurrentEmail` = the address on screen.
- **Errors:**
  - 409 → "the address may belong to another operator, or this person's email changed since the page loaded — reload"
  - 400 → "check the new address and the reason"
  - 403 → refused
  - 404 → gone
  - 401 → login
  - 429 / network / 5xx → shared messages
- **On 202:** the notice names the new address, the confirm-by time and the current address. For your own row, it names the "Confirm new sign-in email" menu entry. **The row keeps the current address**, because nothing moved, and nothing is re-read.

**Confirm page**
- Nothing is read on arrival. One code field.
- **Errors, split by the documented problem type:**
  - `authentication-failed` → a field error and focus on the field, **still signed in and still on the page**
  - any other 401 → forget the session and go to `/login`
  - 403 → "only Fawtir team accounts"
  - others → shared messages
- **On success:** the cached entitlements and any login challenge are dropped, and the page shows the new address with Sign in.

**Floating menu:** fixed position from the trigger; it flips up when there's no room below and follows scroll and resize. Because the panel sits at the end of the body, focus moves into it on open, and Escape or Tab returns focus to the trigger.

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open `/console/operators` | 4, unchanged |
| Opening a row menu | 0 |
| Invalid or unchanged address, blank reason | 0 |
| Request (double-clicked) | 1 × `PUT …/email` (202, CSRF header) |
| Open `/account/email/confirm` | **0** |
| Wrong code | 1 × POST (401); the session stays valid |
| Right code (double-clicked) | 1 × POST (200) |

`UNNECESSARY_API_CALLS = 0`.

## Files

| File | Change |
|---|---|
| `src/lib/console/operatorEmailChange.ts` (+ test) | **new**: `requestOperatorEmailChange` (whitelisted body), `isSameEmail`, `describeEmailChangeFailure` |
| `src/lib/identity/accountEmail.ts` (+ test) | **new**: route, `confirmOwnEmailChange`, `describeConfirmFailure` (the problem-type split) |
| `src/pages/ConsolePage/operators/ChangeEmailDialog.tsx` | **new** |
| `src/pages/ConsolePage/operators/OperatorReasonDialog.tsx` | optional `fields` slot and `validate` hook, with focus going to the first invalid field |
| `src/pages/AccountEmailConfirmPage/*` (+ test) | **new** page and index |
| `src/App.tsx` | route `/account/email/confirm` |
| `src/components/shell/UserMenu.tsx` (+ test) | optional `extraItems`, listed after the shared entries |
| `src/layouts/ConsoleShell/ConsoleSidebar.tsx` | passes the console-only "Confirm new sign-in email" entry |
| `src/components/ui/ActionMenu.tsx` (+ new test) | opt-in `floating`: portal, fixed placement, flip, focus handling. Default behaviour unchanged; most of the diff is the re-indent of the wrapped block |
| `src/pages/ConsolePage/OperatorsPage.tsx` | row `ActionMenu` (`floating`), the email dialog and its notice |
| `src/pages/ConsolePage/operators.test.tsx` | `rowAction` helper; `Row actions` and `Email change (P8)` suites; the P10 tests go through the menu |
| `src/i18n/locales/en.json`, `ar.json` | `console.user.confirmEmail`, `console.operators.actionsFor`, `console.operators.emailChange.*`, `accountEmail.*`. The unused `manageFor` and `mfaReset.openFor` are removed; no reformatting |

## Security

- **Writes:** only the PUT and the confirm POST, both `same-origin` with the CSRF header. Bodies are whitelisted.
- **Nothing persisted:** the code lives in component state only, is never logged, and is never put in a URL.
- **`expectedCurrentEmail`** stops a stale screen from moving the wrong account's sign-in factor; this was proven live with a 409.
- **A refused code never signs anyone out** (proven live). A dead session always goes to login.
- **After a successful confirmation**, nothing cached for the revoked session is reused.
- **Gating is UX only.** The confirm entry is in the console menu only; the backend refuses non-operators with 403, and the page says so.

## Verification

**Automated checks**

| Check | Result |
|---|---|
| Unit + component tests | **567/567** pass (32 files) |
| TypeScript | clean |
| ESLint | clean on every changed file. Whole repo: only the pre-existing `Rial.tsx` error |
| Build | passes |

**Browser run** (Playwright, `:5174`, real local stack, mail to Mailpit)

All 14 steps passed on the final run (after the `floating` fix).

1. **Preparation (harness only):** disposable operator `7651692c…` was reactivated and given a new password through the real reset email.
2. **Stale tab (Arabic, 390 px):** the admin list was loaded before the change. RTL, no overflow.
3. **Row menus (English, 1440 px):**
   - Target row: Roles, Change sign-in email, Reset two-step.
   - Own row: Roles, Change sign-in email.
   - The last row's menu is **hit-test reachable**, no longer clipped.
4. **Dialog checks:** the current address is shown read-only. An invalid address and then the current address in upper case were refused, with **0 requests** and focus on `newEmail`.
5. **Double-clicked request:** 1 PUT (202) with exactly `expectedCurrentEmail/newEmail/reason`, and `expectedCurrentEmail` was the shown address.
   - Database: **1 open change**.
   - The row still shows the current address, and the notice is correct.
6. **Emails:**
   - To the new address: "Confirm your new Fawtir sign-in email", with the code and **no link**.
   - To the current address: "A change of your Fawtir sign-in email was requested".
7. **The role-less target** signed in, landed on the console's "not an operator" screen, and opened the user menu → "Confirm new sign-in email" → the page, with **0 requests on arrival**.
8. **Wrong code:** POST 401. The target **stayed on the page**, focus was on `code`, and **the session was still valid** (entitlements 200).
9. **Right code (double-clicked):** 1 POST (200). The new address was shown; the database showed **1 confirmed**. The next navigation went to **`/login`**.
10. **The old address** received "Your Fawtir sign-in email was changed".
11. **Signing in again** (English, 390 px): the code was sent to **the new address**, and the target reached `/dashboard`. The confirm page has no overflow.
12. **Stale Arabic tab:** a request with the old expected address gave **409**, with the Arabic message. RTL, no overflow.
13. **Arabic confirm page at 390 px:** 0 requests, RTL, no overflow.
14. **Cleanup:** the target was deactivated again.

The run had no page errors, no console errors, no unexpected writes, and no secrets in the report.

**Local data changed:** the disposable operator's email and password changed (local `@example.test` only), and it is deactivated again.

## Open items

- **Backend gaps (P8):**
  - A pending change can't be read or cancelled, so the screen can't show "pending" after a reload.
  - The confirmation email has no link to `/account/email/confirm`. A fragment link, as the invitations use, would help.
  - 409 doesn't say which conflict it is. P12, in progress in another session, adds `expected-email-mismatch` and `email-already-assigned`.
- **Operators land on `/dashboard`** (the tenant app) after sign-in. The confirm entry is in the console menu only, so the email copy ("sign in and enter this code") should say where.
- **Same-name accessible labels:** "Actions for X" repeats for identical display names. Same open item as before.
- **Shared `BackButton`** keeps a left chevron in RTL (pre-existing, not changed).
- **Copy approval:** product needs to approve the email and UI text.

## Next slice (needs authorisation)

- Lock / unlock / deactivate in the row menu (backend P9 lifecycle), if wanted.
- Using the P12 refusal types for precise 403/409 messages once P12 merges.
