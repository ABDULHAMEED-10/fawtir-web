# Platform — operator two-step reset handoff (frontend for backend P10)

## Scope

This slice follows the backend P10 work, which lets an administrator reset another operator's MFA. On the backend it is **not committed yet**; it sits in the `D:\fawtir` working tree on top of `main` `b265fd88`, together with P9.

| Delivered | What |
|---|---|
| **Reset two-step** | A second button on every team row except your own. It opens a reason dialog. *Since the P8 slice this is an item in the row's action menu instead; see `PLATFORM_OPERATOR_EMAIL_CHANGE_HANDOFF.md`* |
| **Dialog copy** | Adapts to `mfaEnabled`. With an authenticator: the app and recovery codes go and every session ends. Without one: nothing is removed, it only signs them out everywhere. Both say they sign in again with an emailed code and are told by email |
| **Result** | A notice built from the returned `revokedSessions` (none / one / N, with Arabic plural forms). The row learns `mfaEnabled=false`; nothing is read again |
| **Shared reason dialog** | `OperatorReasonDialog` is extracted from the reactivation dialog; both use it now, and P8 email change can too |

Not in scope:
- **Customer-user reset** (`DELETE /users/{id}/mfa`): no customer user-management screen exists to host it.

Wording: the UI says **"two-step sign-in"** (`التحقق بخطوتين`), the product term already used across Settings and Team, not "MFA".

**Decisions (product owner, 2026-09-14):**
- The reset is a second row button beside Roles.
- It's offered for every other operator, whether or not they have an authenticator.

| | |
|---|---|
| Frontend | `feat/signup-integration` @ `2e99ca0` — **not committed, not pushed** |
| Backend | `main` @ `b265fd88` + **uncommitted** P9/P10 (read only). The slice needs P10 merged before it ships |
| Design | existing parts only: the row `Button`, the Pending-invitations action group (`flex flex-wrap justify-end gap-2`), `Modal`, `Input` with hint. No CSS, token or layout-system change |
| Prisma | `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## Backend contract used (verified in source and live)

**Call:** `POST /api/v1/platform/operators/{id}/mfa-reset`, body `{ "reason": string }` (`@NotBlank @Size(max = 280)`).

**Who may call it:** `platform.operators.manage` plus a fresh MFA check. It must be the production PLATFORM realm, never from impersonation, and **never on your own account**.

**Answers:**
- **200** `{ userId, username, revokedSessions, resetAt, resetBy }`
- **400** reason
- **401** session or MFA
- **403** own account, realm, impersonation or permission, all the same status for now (P12 will name them)
- **404** not on the team

**What it does:**
- disables the authenticator secret and deletes the recovery codes (`mfaEnabled` becomes false)
- revokes every session and its refresh tokens
- emails a `MFA_RESET_BY_ADMIN` notice
- audits `PlatformOperatorMfaReset` with `username`, `reason`, `hadMfa` and `revokedSessions`

Refusals are **not** audited (a backend observation, unlike reactivation).

## Behaviour

- **Validation:** the reason is required. A blank one is refused before sending, with focus on the field. `maxLength=280`, trimmed before sending.
- **One request:** a ref guard plus a disabled button give one request per confirmation.
- **On success:** the dialog closes, the notice shows, and the row is updated in place.
- **Errors, mapped by status only:**
  - 400 → the shared reason message
  - 403 → a reset-specific refusal
  - 404 → "no longer on the team"
  - 429, network, timeout and 5xx → shared messages
  - 401 → login

  Backend prose is never shown.

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open `/console/operators` | 4, unchanged (`/me/entitlements`, team, pending, expired) |
| Blank reason | 0 |
| Reset (double-clicked) | 1 × `POST /platform/operators/{id}/mfa-reset` (200, CSRF header) |

`UNNECESSARY_API_CALLS = 0`.

## Files

| File | Change |
|---|---|
| `src/lib/console/operatorMfaReset.ts` (+ `.test.ts`) | **new**: `resetOperatorMfa` (whitelisted `{reason}`), `MfaResetResponse`, `describeMfaResetFailure` |
| `src/pages/ConsolePage/operators/OperatorReasonDialog.tsx` | **new**: shared reason dialog (validation, focus, one request, 401 → login) |
| `src/pages/ConsolePage/operators/ResetMfaDialog.tsx` | **new**: adapts the dialog copy to `mfaEnabled` |
| `src/pages/ConsolePage/operators/ReactivateOperatorDialog.tsx` | now a thin wrapper around the shared dialog |
| `src/lib/console/platformOperators.ts` | `PlatformUser.mfaEnabled`; `OPERATOR_REASON_MAX` (replaces the reactivation-only constant) |
| `src/lib/console/operatorReactivation.ts` | 400 maps to the shared `console.operators.reason.invalid` |
| `src/pages/ConsolePage/OperatorsPage.tsx` | row button, dialog, in-place update and notice |
| `src/pages/ConsolePage/operators.test.tsx`, `src/lib/console/*.test.ts` | fixtures gain `mfaEnabled`; new `Two-step reset (P10)` suite |
| `src/i18n/locales/en.json`, `ar.json` | new `console.operators.reason.*` (moved from `reactivate.*`) and `console.operators.mfaReset.*`, including Arabic `_one/_two/_few/_many/_other`; no reformatting |

## Security

- The only write is the POST: `credentials: 'same-origin'` with the CSRF header, and the body is exactly `{ reason }`.
- Nothing is persisted.
- Not offered on your own row, and the backend refuses it anyway.
- The response's `username` and `resetBy` are not shown or stored.
- The notice uses only the display name already on screen and the session count.

## Verification

**Automated checks**

| Check | Result |
|---|---|
| Unit + component tests | **524/524** pass (28 files); the new P10 cases are all in there, and the P9 cases still pass after the refactor |
| TypeScript | clean |
| ESLint | clean on every changed file. The pre-existing `Rial.tsx` error is untouched |
| Build | passes |

**Browser run** (Playwright, `:5174`, real local stack; core `2117dde5` from the backend working tree, mail to Mailpit)

Every step passed.

1. **Preparation (harness only):**
   - Disposable operator `7651692c…` was reactivated and given a new password through the real reset email in Mailpit.
   - It signed in with an email code and enrolled a real authenticator: 1 secret, 10 recovery codes.
2. **English, 1440 px:**
   - Page load made 4 requests.
   - There is **no reset button on your own row**; there is one on the target's.
3. **The dialog** said an authenticator would be removed. A blank reason sent 0 requests and put focus on `reason`.
4. **Double-clicked reset:** 1 POST (200) with body `{reason}`. The notice read "…their session was ended."
   - Database afterwards: `mfa_enabled=f`, 0 active secrets, 0 recovery codes, **0 active sessions**.
   - Audit: `hadMfa=true`, `revokedSessions=1`, reason present.
5. **Notice email:** arrived, with no link and no code.
6. **The target's own tab:** the next navigation landed on **`/login`**. It then **signed in again with an email code** and reached `/dashboard`.
7. **Arabic, 390 px, second reset:**
   - The dialog said **no authenticator**.
   - 1 POST (200); the Arabic singular notice showed.
   - RTL, no overflow. Audit: `hadMfa=false`, `revokedSessions=1`.
8. **Clean run:** no page errors, no console errors, no unexpected writes, no secrets in the report.

**Local data changed:**
- The target now has a harness-chosen password and no authenticator, and is **deactivated again**.

## Open items

- **Backend P10 (with P9) must be merged** before this ships. *Update 2026-09-14: merged into backend `main` (`e0587424`, pushed). P12 refusal types are now live, too.*
- **P12, in progress in another session:** the backend is adding stable refusal types (`own-account-refused`, `production-platform-realm-required`, `impersonation-not-allowed`, …). Once merged, the 403 message can say which one applied; today one message covers them.
- **Refused resets are not audited** on the backend (reactivation refusals are).
- **Same-name accessible labels:** "Reset two-step sign-in for X" repeats for people with the same name, like "Roles for X". Same open item as in the reactivation handoff.
- **Copy approval:** product needs to approve the notice email and the dialog text.
- **No self-service authenticator enrolment UI exists** in the frontend, so the copy promises email-code sign-in only.

## Next slice (needs authorisation)

- P8 two-step email change (it can reuse `OperatorReasonDialog`).
- Lock / unlock / deactivate actions, if wanted; a row action menu would then be worth revisiting.
